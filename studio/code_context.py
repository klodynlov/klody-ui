"""Preserve explicit user code/specifications independently of document retrieval."""
import re
import unicodedata

def has_user_code_spec(question):
    if re.search(r'```[^\n]*\n[\s\S]{20,}?```',question):return True
    normalized=''.join(c for c in unicodedata.normalize('NFKD',question) if not unicodedata.combining(c)).lower().strip()
    return bool(re.match(r'(?:peux.tu\s+)?(?:ecris|ecrire|cree|creer|implemente|implementer|code)\b[\s\S]{0,100}\b(?:fonction|function)\b[\s\S]{0,150}\b(?:qui|that)\b[\s\S]{15,}',normalized))

def coding_question(original,resolved):
    if original.strip()==resolved.strip():return original
    return 'Demande originale (préserver exactement le code et les identifiants) :\n'+original+'\n\nContexte de recherche reformulé :\n'+resolved

def provided_code_context(question,history):
    if has_user_code_spec(question):return question
    normalized=''.join(c for c in unicodedata.normalize('NFKD',question) if not unicodedata.combining(c)).lower().strip()
    if not re.match(r'(?:peux.tu\s+)?(?:ajoute|modifie|corrige|adapte|optimise|simplifie|explique|teste)\b',normalized):return None
    previous_user=next((m['content'] for m in reversed(history) if m.get('role')=='user'),None)
    previous_answer=next((m['content'] for m in reversed(history) if m.get('role')=='assistant'),None)
    if not previous_user or not (has_user_code_spec(previous_user) or (previous_answer and has_user_code_spec(previous_answer))):return None
    return 'Contexte de programmation fourni dans la conversation :\n'+previous_user+'\n\nProposition précédente (elle ne constitue pas une trace d’exécution) :\n'+(previous_answer or '')+'\n\nNouvelle demande :\n'+question

def specification_messages(system,context,instructions=None):
    return [{'role':'system','content':system},{'role':'user','content':'SPÉCIFICATION FOURNIE PAR L’UTILISATEUR :\n'+context+'\n\n'+(instructions or 'Présente le code dans des blocs Markdown avec sa langue. Réponds uniquement au besoin exprimé. Ne produis aucune balise de dialogue ou d’appel d’outil.')}]

def is_python_function_request(context):
    text=''.join(c for c in unicodedata.normalize('NFKD',context) if not unicodedata.combining(c)).lower()
    return bool(re.search(r'\bpython\b|\bdef\s+\w+\(',text) and re.search(r'\b(?:fonction|function)\b',text) and re.search(r'\b(?:ecris|ecrire|cree|creer|adapte|implemente|implementer)\b',text))

def repeated_protocol_markup(answer):
    match=re.search(r'(?:<tool_call>\s*){3,}|(?:</tool_call>\s*){3,}',answer)
    return match.start() if match else None
