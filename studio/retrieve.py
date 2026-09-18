"""Conversation-aware bilingual retrieval for Studio; unchanged LibraryBrain gate."""
from __future__ import annotations
import contextlib
import dataclasses
import json
import os
import re
import unicodedata
from pathlib import Path
import sqlite3
import sys


def normalized(value):
    return ' '.join(re.findall(r"[a-z0-9]+", unicodedata.normalize('NFKD', value.lower()).encode('ascii','ignore').decode()))

STOP = set("je tu il elle nous vous ils elles moi toi me mon ma mes ton ta tes de du des le la les un une sur dans pour avec comment quels quelle quelles quoi est ce que qui en parle parler livre livres ouvrage ouvrages books book create creer creation configure configurer configuration faire veux veut please about the on in a an of and or to how what which is are".split())

def named_scope(plan, books):
    # Explicit adjacent title words anchor a focused search; global searches remain.
    original = normalized(plan['original_question'])
    tokens=original.split();phrases=[' '.join(tokens[i:i+2]) for i in range(len(tokens)-1) if all(t not in STOP and len(t)>1 for t in tokens[i:i+2])]
    matches=[]
    for book in books:
        title=' '+normalized(book['title'])+' '
        for phrase in phrases:
            if ' '+phrase+' ' in title: matches.append((book['id'],phrase));break
    if not matches:return None
    # Preserve topic searches, but remove a named device (version number in request).
    named=bool(re.search(r"\b\d+[a-z]?\b",original))
    if not named:return None
    phrase=max((phrase for _,phrase in matches),key=len)
    ids=[bid for bid,p in matches if p==phrase][:12]
    remove=set(phrase.split())|set(re.findall(r"\b\d+\b",original))|{'iii','ii','iv'}
    terms=[t for t in tokens if t not in STOP and t not in remove]
    return {'book_ids':ids,'query':' '.join(terms),'title_phrase':phrase} if terms else None

def topic_matches(text, query):
    content={t.rstrip('s') for t in normalized(text).split()}
    terms={t.rstrip('s') for t in normalized(query).split() if t not in STOP}
    return bool(content & terms)

def category_books(conn, categories):
    sql='SELECT id,title FROM books'
    if categories:sql+=' WHERE category IN ('+','.join('?' for _ in categories)+')'
    return [dict(row) for row in conn.execute(sql, categories)]

def retrieve(plan, category=None):
    os.environ['HF_HUB_OFFLINE']='1'
    os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
    os.environ['TOKENIZERS_PARALLELISM']='false'
    sys.path.insert(0,str(Path.home()/'library-brain'))
    with contextlib.redirect_stdout(sys.stderr):
        import klody_memory
        from core.config import get_config
        class ReadOnly:
            @staticmethod
            def get_connection():
                path=Path.home()/'library_brain.db'
                conn=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=10)
                conn.row_factory=sqlite3.Row;conn.execute('PRAGMA query_only=ON');return conn
        # Only this process uses the wider candidate pool; no settings file is written.
        cfg=dataclasses.replace(get_config(),rerank_pool=50,book_routing=False)
        klody_memory.configure(settings=cfg,connection=ReadOnly(),summaries_provider=lambda _: {})
        from klody_memory.retriever import HybridRetriever
        from klody_memory.scorer import compute_confidence
        retriever=HybridRetriever();found={};attempts=[]
        conn=ReadOnly.get_connection()
        try:
            categories=category if isinstance(category,list) else [category] if category else []
            books=category_books(conn,categories)
        finally:conn.close()
        scope=named_scope(plan,books)
        allowed_ids=[b['id'] for b in books] if isinstance(category,list) else None
        if isinstance(category,list) and not allowed_ids:
            return {'question':plan['question'],'plan':plan,'confidence':dataclasses.asdict(compute_confidence([])),'sources':[],'attempts':[],'accepted_sources':0,'scope':'empty category scope'}
        searches=[{'query':q,'book_ids':allowed_ids} for q in list(dict.fromkeys([plan['question'],*plan['queries']]))[:4]]
        if scope:searches.insert(0,scope)
        for search in searches:
            query=search['query']
            if plan.get('intent')=='catalog':
                query=' '.join(t for t in query.split() if normalized(t) not in STOP)
            if not query:continue
            results=retriever.search(query,top_k=12,min_books=0,category_filter=category if isinstance(category,str) else None,book_ids=search['book_ids'],skip_translation=True,rerank_query=query)
            attempts.append({'query':query,'book_ids':search['book_ids'],'rerank_query':query,'results':len(results),'confidence':dataclasses.asdict(compute_confidence(results))})
            for result in results:
                # Title-only/fragment records cannot support an explanatory answer.
                if len(result.text.strip())<100: continue
                if scope and not topic_matches(result.text,scope['query']): continue
                key=(result.book_id,result.chunk_id)
                if key not in found or (result.rerank_score or 0)>(found[key].rerank_score or 0):found[key]=result
        ranked=sorted(found.values(),key=lambda r:r.rerank_score or 0,reverse=True)
        accepted=[r for r in ranked if compute_confidence([r]).level!='insufficient']
        selected=(accepted or ranked)[:6]
        confidence=compute_confidence(accepted)
        sources=[{'book_id':r.book_id,'chunk_id':r.chunk_id,'title':r.book_title,'author':r.author,'page':r.page,'text':r.text,'category':r.category,'rerank_score':r.rerank_score,'rerank_kind':r.rerank_kind} for r in selected]
    return {'question':plan['question'],'plan':plan,'confidence':dataclasses.asdict(confidence),'sources':sources,'attempts':attempts,'accepted_sources':len(accepted),'scope':'bilingual expanded retrieval; original relevance thresholds; read-only'}

if __name__=='__main__':
    plan=json.loads(Path(sys.argv[1]).read_text());category=json.loads(sys.argv[2]) if len(sys.argv)>2 and sys.argv[2].startswith(('[','"')) else sys.argv[2] if len(sys.argv)>2 else None
    print(json.dumps(retrieve(plan,category),ensure_ascii=False))
