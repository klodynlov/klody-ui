import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './studio.css';

type View = 'home' | 'chat' | 'train' | 'evaluate';
type Source = { source_id?: string; surrounding_text?: string; book_id?: number; location_label?: string; source_url?: string; title: string; author?: string; page?: number; text: string; category?: string };
type Scores = Record<string, { n: number; contract_pass_rate: number; behavior_accuracy: number; citation_compliance: number }>;
type CodeMetrics = { models?: Record<string, { passed: number; n: number; passed_cases: number; total_cases: number }> };
type LegalAssessment = Record<string, { conforme: number; fragile: number; incorrect: number }>;
type MedicalRagAssessment = {fresh_n?: number; regression_n?: number; n: number; errors: number; answerable: number; useful_answers: number; expected_abstentions: number; correct_abstentions: number; source_supported_answers: number};
type LegalCorpus = {as_of: string; code_count: number; expected_codes: number; articles: number; decisions: number; complete_jurisprudence: boolean; rejected_documents?: number; missing_sources: string[]; codes: {legi_id: string; title: string; articles: number}[]};
type Model = { corpus?: LegalCorpus; documentary_reader?: boolean; evaluation_version?: string; medical_candidate_assessment?: {summary: MedicalRagAssessment; accepted: boolean}; coverage_audit?: {answerable: number; rejected_before_model: number}; medical_rag_assessment?: MedicalRagAssessment; reader_assessment?: {n: number; errors: number; answerable: number; correct_answers: number; expected_abstentions: number; correct_abstentions: number; development_base_errors: number; development_lora_errors: number; development_n: number}; medical_assessment?: Record<string, { n: number; documentary_ok: number; attributed_quotes: number; content_ok: number }>; legal_assessment?: LegalAssessment; supports_training?: boolean; availability_error?: string; validation_gate?: boolean | null; code_metrics?: CodeMetrics; id: string; name: string; description: string; domains: string[]; version: string; parameters: string; available: boolean; size_gb: number; dataset: Record<string, number>; metrics: Scores; category?: string | string[]; evaluated?: boolean; preparation?: {stage?: string; processed_this_run?: number; total_packets?: number; iteration?: number; total_iterations?: number}; fidelity?: { models?: Record<string, { supported: number; n: number }> } };
type Version = { code_metrics?: CodeMetrics; id: string; name: string; model: string; available: boolean; evaluation?: { models: Scores }; created: number };
type Job = { id: string; kind: string; model: string; status: string; created: number; question?: string; name?: string; version?: string; iterations?: number; phase?: string; error?: string; log?: string; result?: { parameters?: string; profile?: string; audit_notice?: string; answer: string; original_answer?: string; translation_error?: string; sources: Source[]; confidence: { level: string }; phase?: string; source_status?: string; generation_policy?: string; translation?: {target_language: string}; translation_progress?: {current: number; total: number}; resolved_question?: string }; progress?: { iteration?: number; total_iterations?: number; train_loss?: number; val_loss?: number } };
type Catalog = { models: Model[]; versions: Version[]; feedback_count: number };
const API = 'http://127.0.0.1:8018';
const active = (j: Job) => ['queued', 'running'].includes(j.status);
const statusText: Record<string, string> = { queued: 'En attente', running: 'En cours', completed: 'Terminé', cancelled: 'Annulé', failed: 'Échec', interrupted: 'Interrompu' };
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(API + '/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Klody-Studio': '1' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(typeof data.detail === 'string' ? data.detail : `Opération refusée (${response.status}).`); }
  return response.json();
}
function DocumentaryAnswer({ job, fallback }: { job: Job; fallback: string }) {
  const [translation, setTranslation] = useState<Job | null>(null);
  const [french, setFrench] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const autoStarted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const eligible = job.model === 'medical' && job.status === 'completed' &&
    job.result?.source_status === 'selected' &&
    ['model_selects_ids_program_copies_contextual_passages', 'model_selects_ids_program_translates_contextual_passages'].includes(job.result?.generation_policy || '');
  const pending = translation !== null && active(translation);
  const frenchResult = translation?.status === 'completed' && translation.result?.translation?.target_language === 'fr' ? translation.result : job.result?.translation?.target_language === 'fr' ? job.result : null;
  const ready = !!frenchResult?.answer;
  useEffect(() => {
    if (!translation || !active(translation)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const detail = await request<Job>('/jobs/' + translation.id);
        if (stopped) return;
        setTranslation(detail); setError('');
        if (!active(detail)) return;
      } catch { if (!stopped) setError('Connexion interrompue. Nouvelle tentative en cours ; l’original reste disponible.'); }
      if (!stopped) timer = setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [translation?.id, translation?.status]);
  async function translate() {
    if (starting || pending) return;
    setStarting(true); setError('');
    try {
      const detail = await request<Job>('/medical/translate', { job_id: job.id });
      if (mounted.current) { setTranslation(detail); setFrench(true); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Traduction indisponible.'); }
    finally { if (mounted.current) setStarting(false); }
  }
  useEffect(() => {
    if (!eligible || ready || job.result?.translation_error || autoStarted.current) return;
    autoStarted.current = true;
    void translate();
  }, [eligible, ready, job.id]);
  async function cancelTranslation() {
    if (!translation) return;
    try { const detail = await request<Job>('/jobs/' + translation.id + '/cancel', {}); if (mounted.current) setTranslation(detail); }
    catch { if (mounted.current) setError('L’annulation n’a pas pu être confirmée. Réessayez.'); }
  }
  const displayedFrench = ready && french;
  const translationFailed = !!error || !!job.result?.translation_error || (translation && !active(translation) && translation.status !== 'completed');
  const displayed = !eligible ? fallback : !french ? job.result?.original_answer || fallback : displayedFrench ? frenchResult!.answer : translationFailed ? 'La réponse en français n’a pas pu être préparée. Réessayez la traduction ou consultez les extraits originaux dans les sources.' : 'Préparation de la réponse en français…';
  return <>
    {eligible && <div className="st-translation-controls">
      <button className="st-secondary" onClick={() => setFrench(!french)}>{french ? 'Afficher l’original' : 'Afficher la réponse en français'}</button>
      {!ready && <button className="st-secondary" disabled={starting || pending} onClick={() => void translate()}>{starting || pending ? 'Traduction en cours…' : 'Réessayer en français'}</button>}
      {pending && <button className="st-text-button" onClick={() => void cancelTranslation()}>Annuler la traduction</button>}
      <span role="status">{displayedFrench ? 'Réponse en français · traduction automatique locale' : !french ? 'Texte original' : starting || pending ? 'Préparation de la réponse en français…' : 'Traduction française indisponible'}</span>
    </div>}
    {error && <p role="alert" className="st-inline-error">{error}</p>}
    {translation && !active(translation) && translation.status !== 'completed' && <p role="status" className="st-audit-note">{translation.status === 'cancelled' ? 'Traduction annulée.' : 'Traduction indisponible ou non retenue après contrôle.'} L’original est conservé. Vous pouvez réessayer.</p>}
    <div className="st-answer"><ReactMarkdown components={{ img: ({ alt }) => <span>{alt || "Image"}</span>, a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{displayed}</ReactMarkdown></div>
    {displayedFrench ? <p className="st-audit-note">{frenchResult!.audit_notice}</p> : job.result?.audit_notice && <p className="st-audit-note">{job.result.audit_notice}</p>}
  </>;
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    chat: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1V11.5a8.5 8.5 0 0 1 17 0ZM7 9h9M7 13h6"/>,
    train: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m19 2 .7 2.3L22 5l-2.3.7L19 8l-.7-2.3L16 5l2.3-.7Z"/></>,
    chart: <><path d="M4 3v17h17M8 16V9m5 7V5m5 11v-5"/></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    book: <><path d="M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Zm0 0v15"/></>,
    music: <><path d="M9 17V5l11-2v12M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/></>,
    code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    send: <path d="M12 20V4m-6 6 6-6 6 6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    chip: <><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></>,
    back: <path d="M19 12H5m6-6-6 6 6 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>;
}
const specialist: Record<string, { icon: string; title: string; intro: string; placeholder: string; library: string; suggestions: string[] }> = {
  medical: { icon: 'book', title: 'Retrouver et comparer les recommandations.', intro: 'Lecture épurée : 51 passages dans 12 documents HAS datés. Les conditions et les références restent attachées au texte. Chaque question est indépendante. Posez une question documentaire ou demandez deux passages à comparer ; les posologies et décisions individuelles sont exclues.', placeholder: 'Précisez le thème, la population et le point à comparer…', library: '51 passages HAS sélectionnés', suggestions: ['Un seul critère phénotypique suffit-il à diagnostiquer la dénutrition après 70 ans ?', 'Le bilan neuropsychologique est-il nécessaire au diagnostic du TDAH ?', 'Compare les dates du guide douleur chronique et de sa fiche.'] },
  medical_v4: { icon: 'book', title: 'Explorer vos documents médicaux.', intro: 'Un mot comme « hernie » suffit pour commencer. Le lecteur recherche dans votre bibliothèque et les publications HAS datées, puis prépare automatiquement une réponse en français. Les extraits originaux, leurs conditions et leurs références restent consultables dans les sources. Chaque question est indépendante.', placeholder: 'Un terme médical, un point précis ou deux notions à comparer…', library: 'Documents médicaux et publications HAS datées', suggestions: ['hernie', 'Quel rôle du bilan neuropsychologique dans le TDAH chez l’enfant ?', 'Compare la localisation de la cystite et de la pyélonéphrite.'] },
  medical_v3: { icon: 'book', title: 'Explorer vos documents médicaux.', intro: 'Une recherche locale en français et en anglais, suivie d’une courte réponse avec ses sources. Un mot comme « hernie » suffit pour commencer. Les dates et la nature des documents restent visibles ; leur actualité et leur pertinence clinique sont à vérifier. Chaque question est indépendante.', placeholder: 'Un sujet, une question ou deux notions à comparer…', library: 'Bibliothèque médicale locale', suggestions: ['hernie', 'migraine', 'Compare hernie hiatale et hernie discale lombaire.'] },
  legal: { icon: 'book', title: 'Lire le droit, avec le texte sous les yeux.', intro: 'Pilote expérimental : codes pénal, de procédure pénale et de la route, exportés le 7 septembre 2026. Le droit civil reste à ajouter. Posez chaque question avec son contexte complet.', placeholder: 'Votre question et, si possible, le numéro de l’article…', library: 'Codes français datés', suggestions: ['Quel retrait de points le R415-5 prévoit-il pour le non-respect de la priorité ?', 'Que dit le Code pénal sur la tentative ?', 'Puis-je trouver ici les règles du divorce dans le Code civil ?'] },
  research: { icon: 'book', title: 'Une question. Des sources.', intro: 'Explorez une idée, rapprochez les points de vue et retrouvez les passages qui comptent.', placeholder: 'Posez une question à votre bibliothèque…', library: 'LibraryBrain', suggestions: ['Comment mieux mémoriser ce que je lis ?', 'Qu’est-ce qui rend une source fiable ?', 'Comment structurer un projet de recherche ?'] },
  music: { icon: 'music', title: 'Donnons du sens au son.', intro: 'Composition, théorie et production : explorez votre bibliothèque musicale.', placeholder: 'Que souhaitez-vous explorer en musique ?', library: 'Bibliothèque musicale', suggestions: ['Comment construire un accord majeur ?', 'À quoi sert l’attaque d’un compresseur ?', 'Comment donner plus de profondeur à un mix ?'] },
  business: { icon: 'chart', title: 'Votre prochaine décision commence ici.', intro: 'Une offre plus claire, des clients mieux compris, une activité mieux organisée. Appuyez vos décisions sur votre bibliothèque.', placeholder: 'Quel défi rencontrez-vous dans votre activité ?', library: 'Bibliothèque business', suggestions: ['Comment fixer le prix de mes prestations ?', 'Comment clarifier ma proposition de valeur ?', 'Comment mieux piloter ma trésorerie ?'] },
  code: { icon: 'code', title: 'De l’idée au code compris.', intro: 'Explorez une architecture, préparez une fonction ou clarifiez un concept d’IA. Retrouvez les passages qui soutiennent la réponse.', placeholder: 'Quelle fonction, architecture ou notion d’IA souhaitez-vous explorer ?', library: 'Bibliothèque code & IA', suggestions: ['Comment structurer un pipeline RAG ?', 'Comment écrire des tests unitaires en Python ?', 'Quelle différence entre fine-tuning et recherche documentaire ?'] },
};
const presentation = (id: string, version?: string) => specialist[id === 'medical' && ['v4', 'v5', 'v6', 'v7', 'v8'].includes(version || '') ? 'medical_v4' : id === 'medical' && version === 'v3' ? 'medical_v3' : id] || specialist.research;
function preparationText(model: Model) {
  const p = model.preparation;
  if (p?.stage === 'distillation') return `Préparation du corpus · ${p.processed_this_run || 0} / ${p.total_packets || '—'} passages traités`;
  if (p?.stage === 'training') return `Entraînement local · ${p.iteration || 0} / ${p.total_iterations || '—'} itérations`;
  if (p?.stage?.startsWith('release_')) return 'Comparaison des candidats sur la validation';
  if (p?.stage === 'label_verification' || p?.stage === 'verification') return 'Vérification des réponses avec leurs sources';
  return model.availability_error || 'Préparation du modèle sur votre Mac';
}
const pct = (value?: number) => value === undefined ? '—' : `${(value * 100).toFixed(1).replace('.', ',')} %`;
export function Studio() {
  const [view, setView] = useState<View>('home');
  const [catalog, setCatalog] = useState<Catalog>({ models: [], versions: [], feedback_count: 0 });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [modelId, setModelId] = useState('research');
  const [version, setVersion] = useState('');
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState<Job[]>([]);
  const [focused, setFocused] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);
  const [sending, setSending] = useState(false);
  const [name, setName] = useState('');
  const [iterations, setIterations] = useState(40);
  const [feedback, setFeedback] = useState<Job | null>(null);
  const [correction, setCorrection] = useState('');
  const [notice, setNotice] = useState('');
  const [sourceIndex, setSourceIndex] = useState(0);
  const sourceDialog = useRef<HTMLDialogElement>(null);
  const logDialog = useRef<HTMLDialogElement>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [details, setDetails] = useState<Record<string, Job>>({});
  const [logId, setLogId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const model = catalog.models.find(m => m.id === modelId);
  const last = conversation[conversation.length - 1];
  const pendingChat = conversation.some(active);
  const sourceResult = (focused || last)?.result;
  const sources = sourceResult?.sources || [];
  const userCodeContext = sourceResult?.source_status === 'user_context';
  const rejectedSources = sourceResult?.source_status === 'candidates' || sourceResult?.confidence.level === 'insufficient';
  const refresh = useCallback(async () => {
    try {
      const [c, j] = await Promise.all([request<Catalog>('/catalog'), request<Job[]>('/jobs')]);
      setCatalog(c); setJobs(j); setOnline(true);
    } catch { setOnline(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 4000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      const ids = new Set([...conversation.filter(active).map(j => j.id), ...jobs.filter(j => j.kind !== 'chat' && active(j)).map(j => j.id), ...(logId ? [logId] : [])]);
      for (const id of ids) {
        try {
          const job = await request<Job>('/jobs/' + id);
          if (stopped) return;
          setDetails(d => ({ ...d, [id]: job }));
          setConversation(c => c.map(j => j.id === id ? job : j));
          setFocused(f => f?.id === id ? job : f);
        } catch (e) { if (!stopped) setError(String(e)); }
      }
    };
    void poll(); const timer = setInterval(() => void poll(), 1200);
    return () => { stopped = true; clearInterval(timer); };
  }, [conversation.map(j => j.id + j.status).join(','), jobs.filter(active).map(j => j.id).join(','), logId]);
  useEffect(() => { if (feedback) dialog.current?.showModal(); }, [feedback]);
  useEffect(() => { if (logId) logDialog.current?.showModal(); }, [logId]);
  useEffect(() => { const previous = document.title; document.title = 'Klody‑AI · Studio des modèles'; return () => { document.title = previous; }; }, []);
  useEffect(() => { if (last?.id) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [last?.id]);
  function navigate(next: View) { setView(next); setMobileNav(false); setNotice(''); }
  function choose(id: string, next: View = 'chat') { setModelId(id); setVersion(''); setConversation([]); setFocused(null); navigate(next); }
  async function send() {
    if (!question.trim() || sending || pendingChat || !online || !model?.available) return;
    setSending(true); setError(''); setFocused(null);
    try {
      const history = conversation.filter(j => j.result && j.status === 'completed').slice(-5).flatMap(j => [{ role: 'user', content: j.question || '' }, { role: 'assistant', content: j.result!.answer.slice(0, 6000) }]);
      const job = await request<Job>('/chat', { model: modelId, question, version: version || null, history });
      setConversation(c => [...c, job]); setQuestion(''); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Envoi impossible.'); }
    finally { setSending(false); }
  }
  async function openMedicalSource(source: Source) {
    if (!source.book_id && !source.source_id) return;
    try { await request('/medical/open-document', source.book_id ? { book_id: source.book_id } : { source_id: source.source_id }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Impossible d’ouvrir le document.'); }
  }
  async function train() {
    setSending(true); setError('');
    try { const job = await request<Job>('/train', { model: modelId, name: name.trim() || `${model?.name} · ${new Date().toLocaleDateString('fr-FR')}`, iterations }); setLogId(job.id); setNotice('Nouvelle version ajoutée à la file d’entraînement.'); await refresh(); }
    catch (e) { setError(String(e)); } finally { setSending(false); }
  }
  async function cancel(id: string) { try { const j = await request<Job>(`/jobs/${id}/cancel`, {}); setConversation(c => c.map(v => v.id === id ? { ...v, ...j } : v)); await refresh(); } catch (e) { setError(String(e)); } }
  async function loadChat(job: Job) { try { const j = await request<Job>('/jobs/' + job.id); setModelId(j.model); setVersion(j.version || ''); setConversation([j]); setFocused(null); navigate('chat'); } catch (e) { setError(String(e)); } }
  async function evaluate(v: Version) { setSending(true); try { const j = await request<Job>('/evaluate', { version: v.id }); setLogId(j.id); setNotice('Comparaison ajoutée à la file.'); await refresh(); } catch (e) { setError(String(e)); } finally { setSending(false); } }
  const selectModel = <div className="st-model-select"><span className={`st-mini-icon ${modelId}`}><Icon name={presentation(modelId, model?.version).icon} size={17}/></span><select aria-label="Modèle du Studio" value={modelId} onChange={e => choose(e.target.value, view)}>{catalog.models.map(m => <option key={m.id} value={m.id}>{m.name} {m.parameters}</option>)}</select></div>;
  const jobList = jobs.filter(j => j.kind !== 'chat');
  const selectedDetail = logId ? details[logId] : undefined;
  return <div className="klody-studio">
    <aside className={`st-sidebar ${mobileNav ? 'st-nav-open' : ''}`}>
      <a className="st-brand" href="#" title="Retour à Klody‑AI"><span className="st-brand-symbol">k<span>✳</span></span><span>klody<span className="st-brand-ai">AI</span></span></a>
      <div className="st-workspace"><span className="st-avatar">K</span><div>Espace personnel<small>Votre intelligence, en local</small></div><span className="st-tiny-dot"/></div>
      <div className="st-nav-label">STUDIO DES MODÈLES</div>
      <nav aria-label="Studio">{([['home', 'grid', 'Vue d’ensemble'], ['chat', 'chat', 'Discuter'], ['train', 'train', 'Entraîner'], ['evaluate', 'chart', 'Évaluer']] as const).map(([v, icon, label]) => <button key={v} className={view === v ? 'selected' : ''} onClick={() => navigate(v)} aria-current={view === v ? 'page' : undefined}><Icon name={icon}/>{label}{v === 'train' && jobs.some(j => j.kind === 'train' && active(j)) && <span className="st-live-dot"/>}</button>)}</nav>
      <div className="st-nav-label st-space">VOS MODÈLES <span>{catalog.models.length.toString().padStart(2, '0')}</span></div>
      {catalog.models.map(m => <button key={m.id} className="st-sidebar-model" onClick={() => choose(m.id)}><span className={`st-mini-icon ${m.id}`}><Icon name={presentation(m.id, m.version).icon} size={16}/></span><span>{m.name}<small>{m.parameters} · {m.version}</small></span><span className={`st-tiny-dot ${m.available ? '' : 'offline'}`}/></button>)}
      <div className="st-nav-label st-space">CONVERSATIONS RÉCENTES</div>
      <div className="st-recents">{jobs.filter(j => j.kind === 'chat').slice(0, 5).map(j => <button key={j.id} onClick={() => void loadChat(j)} title={j.question}>{j.question}</button>)}{!jobs.some(j => j.kind === 'chat') && <p>Vos échanges apparaîtront ici.</p>}</div>
      <div className="st-sidebar-bottom"><div className="st-local-box"><Icon name="chip"/><div>Sur votre Mac<small>Sources et modèles locaux</small></div></div><a href="#"><Icon name="back" size={16}/> Retour à Klody‑AI</a></div>
    </aside>
    <div className="st-body">
      <header className="st-topbar"><button className="st-mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Ouvrir la navigation"><Icon name="grid"/></button><div><span>Klody‑AI</span><span className="st-slash">/</span>Studio des modèles</div><div className="st-top-right"><span className={`st-connection ${online ? '' : 'offline'}`}><i/>{online ? 'Moteur local connecté' : 'Moteur déconnecté'}</span><span className="st-avatar small">K</span></div></header>
      {!online && <div className="st-alert" role="status">Le moteur du Studio n’est pas joignable. <button onClick={() => void refresh()}>Réessayer</button><details><summary>Démarrage local</summary><code>/Users/klodynlov/library-brain-env/bin/python /Users/klodynlov/Projets/klody-ui/studio/server.py</code></details></div>}
      {error && <div className="st-alert error" role="alert">{error}<button aria-label="Fermer l’erreur" onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}
      {notice && <div className="st-notice" role="status"><Icon name="check" size={16}/>{notice}<button onClick={() => setNotice('')} aria-label="Fermer la notification">×</button></div>}
      <main className={`st-main ${view === 'chat' ? 'st-main-chat' : ''}`}>
        {view === 'home' && <div className="st-page">
          <div className="st-page-heading"><div className="st-eyebrow">VOTRE ATELIER D’INTELLIGENCE</div><span className="st-pill">LOCAL FIRST</span></div>
          <section className="st-hero"><div className="st-hero-copy"><h1>Votre savoir.<br/><em>Votre intelligence.</em></h1><p>Des modèles façonnés par votre bibliothèque.<br/>Explorez leurs réponses. Cultivez leurs capacités.</p><button className="st-primary" onClick={() => choose('research')}>Commencer une conversation <Icon name="arrow" size={17}/></button></div><div className="st-orbit" aria-hidden="true"><div className="st-orbit-ring r1"/><div className="st-orbit-ring r2"/><div className="st-orbit-ring r3"/><div className="st-orb"><span>k</span></div><span className="st-orbit-label l1"><i/>Votre bibliothèque</span><span className="st-orbit-label l2"><i/>Vos modèles</span><span className="st-orbit-star">✳</span></div></section>
          <div className="st-section-heading"><div><h2>Vos spécialistes. Votre signature.</h2><p>Choisissez le spécialiste adapté à votre question.</p></div><button className="st-text-button" onClick={() => navigate('evaluate')}>Voir les évaluations <Icon name="arrow" size={16}/></button></div>
          <div className="st-model-grid">{catalog.models.map(m => <article className={`st-model-card ${m.id}`} key={m.id}><div className="st-model-card-top"><span className={`st-model-glyph ${m.id}`}><Icon name={presentation(m.id, m.version).icon} size={26}/></span><span className="st-badge">{m.available ? `${m.validation_gate === false ? 'À AMÉLIORER' : 'PILOTE'} · ${m.version}` : m.availability_error ? 'INDISPONIBLE' : 'EN PRÉPARATION'}</span></div><h3>{m.name}<span>{m.parameters}</span></h3><p>{m.description}</p>{m.corpus && <details className="st-details"><summary>Corpus au {m.corpus.as_of} · {m.corpus.code_count}/{m.corpus.expected_codes} codes · {m.corpus.decisions.toLocaleString('fr-FR')} décisions</summary><p>{m.corpus.articles.toLocaleString('fr-FR')} articles indexés. Poids V3 conservés ; extension documentaire à évaluer.</p>{m.corpus.rejected_documents !== undefined && <p>{m.corpus.rejected_documents.toLocaleString('fr-FR')} fichiers écartés pour texte, format ou métadonnées incomplets.</p>}{!m.corpus.complete_jurisprudence && <p>Jurisprudence partielle : {m.corpus.missing_sources.join(' ; ')}.</p>}<ul>{m.corpus.codes.map(c => <li key={c.legi_id}><a href={`https://www.legifrance.gouv.fr/codes/id/${c.legi_id}`} target="_blank" rel="noreferrer">{c.title}</a> · {c.articles.toLocaleString('fr-FR')} articles</li>)}</ul></details>}<div className="st-tags">{m.domains.map(d => <span key={d}>{d}</span>)}</div><div className="st-model-facts"><div><strong>{(m.id === 'medical' ? m.dataset.documents ?? m.dataset.evidence_units : m.dataset.train)?.toLocaleString('fr-FR') || '—'}</strong><span>{m.id === 'medical' ? m.dataset.documents !== undefined ? 'documents dans le catalogue' : 'passages sélectionnés' : 'exemples d’entraînement'}</span></div><div><strong>{m.available ? `${m.size_gb.toLocaleString('fr-FR')} Go` : '—'}</strong><span>poids sur votre Mac</span></div></div><div className="st-preparation" role="status">{!m.available ? preparationText(m) : m.id === 'medical' ? 'Revue par un professionnel de santé à réaliser' : !m.evaluated ? 'Poids disponibles · évaluation à terminer' : m.validation_gate === false ? 'Critères de gain sur la base non atteints en validation' : null}</div><div className="st-card-actions"><button onClick={() => choose(m.id)} disabled={!m.available}>Discuter <Icon name="arrow" size={17}/></button><button aria-label={`Entraîner ${m.name}`} disabled={!m.available || m.supports_training === false} title={m.supports_training === false ? 'Entraînement disponible dans le projet spécialisé dédié' : undefined} onClick={() => choose(m.id, 'train')}><Icon name="train" size={17}/></button></div></article>)}</div>
          <section className="st-next-step"><span className="st-next-icon"><Icon name="train" size={24}/></span><div><h3>Un modèle se construit, une version après l’autre.</h3><p>Entraînez un candidat, comparez ses résultats, puis essayez-le.</p></div><button className="st-secondary" onClick={() => navigate('train')}>Créer une version <Icon name="plus" size={16}/></button></section>
          <div className="st-footnote"><Icon name="book" size={15}/> Les réponses s’appuient sur vos sources locales. Ces pilotes peuvent encore commettre des erreurs.</div>
        </div>}
        {view === 'chat' && <div className="st-chat-layout"><section className="st-conversation"><div className="st-chat-toolbar">{selectModel}<select className="st-version-select" aria-label="Version du modèle" value={version} onChange={e => { setVersion(e.target.value); setConversation([]); setFocused(null); }}><option value="">{model?.version} · {!model?.available ? model?.availability_error ? 'indisponible' : 'en préparation' : model.evaluated ? 'pilote évalué' : 'à évaluer'}</option>{catalog.versions.filter(v => v.model === modelId && v.available).map(v => <option key={v.id} value={v.id}>{v.name} · candidat</option>)}</select><button className="st-icon-button" title="Nouvelle conversation" aria-label="Nouvelle conversation" onClick={() => { setConversation([]); setFocused(null); }}><Icon name="plus"/></button></div>
          {model && !model.available && <p role="alert" className="st-inline-error">{preparationText(model)}</p>}
          <div className="st-message-scroll">{conversation.length === 0 ? <div className="st-chat-empty"><span className={`st-model-glyph large ${modelId}`}><Icon name={presentation(modelId, model?.version).icon} size={31}/></span><div className="st-eyebrow">{model?.name} {model?.parameters}</div><h1>{presentation(modelId, model?.version).title}</h1><p>{presentation(modelId, model?.version).intro}</p><div className="st-suggestions">{presentation(modelId, model?.version).suggestions.map(q => <button key={q} onClick={() => setQuestion(q)}>{q}<Icon name="arrow" size={16}/></button>)}</div></div> : conversation.map(j => <article key={j.id} className="st-exchange"><div className="st-user-message">{j.question}</div><div className="st-answer-header"><span className={`st-mini-icon ${modelId}`}><Icon name={presentation(modelId, model?.version).icon} size={15}/></span>{modelId === 'medical' ? j.result?.profile || model?.name : model?.name}<span>{active(j) ? statusText[j.status] : j.result?.parameters || '4B'}</span></div><DocumentaryAnswer job={j} fallback={j.result?.answer || (active(j) ? (j.status === 'queued' ? 'En attente du moteur local…' : (j.result?.phase === 'translation' ? 'Préparation et vérification de la réponse en français…' : j.result?.phase === 'selection' ? 'Sélection des passages dans les documents datés…' : j.result?.phase === 'generation' ? 'Rédaction de la réponse avec le modèle local…' : j.result?.phase === 'planning' ? 'Je précise votre recherche à partir de la conversation…' : 'Recherche de passages dans LibraryBrain…')) : j.error || statusText[j.status])}/>{j.error && <p className="st-inline-error">{j.error}</p>}{j.result && <div className="st-answer-actions"><button onClick={() => { setFocused(j); setSourceIndex(0); if (window.innerWidth <= 900) sourceDialog.current?.showModal(); }}><Icon name="book" size={14}/>{j.result.source_status === 'user_context' ? 'Votre code et consignes' : `${j.result.sources.length} ${j.result.source_status === 'candidates' || j.result.confidence.level === 'insufficient' ? 'passages repérés' : 'sources'}`}</button>{j.status === 'completed' && <button onClick={() => { setFeedback(j); setCorrection(''); }}>Proposer une correction</button>}</div>}</article>)}<div ref={end}/></div>
          <form className="st-composer-area" onSubmit={e => { e.preventDefault(); void send(); }}><div className="st-composer"><textarea aria-label="Votre question" placeholder={presentation(modelId, model?.version).placeholder} value={question} maxLength={4000} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/><div className="st-composer-bottom"><span><Icon name="book" size={15}/>{presentation(modelId, model?.version).library}<span className="st-tiny-dot"/></span>{pendingChat ? <button type="button" className="st-send" aria-label="Arrêter la réponse" onClick={() => conversation.filter(active).forEach(j => void cancel(j.id))}>■</button> : <button type="submit" className="st-send" disabled={!online || sending || !question.trim() || !model?.available} aria-label="Envoyer la question"><Icon name="send" size={20}/></button>}</div></div><div className="st-composer-note">{modelId === 'medical' ? 'Lecture documentaire · questions indépendantes · sources à vérifier' : modelId === 'legal' ? 'V3 expérimentale · chaque question est indépendante · vérifier les réponses' : version ? 'Version candidate · résultats à vérifier' : model?.validation_gate === false ? 'Pilote à améliorer · gain global non démontré' : 'Pilote expérimental'}<span>Entrée pour envoyer · ⇧ Entrée pour une ligne</span></div></form>
        </section><aside className="st-sources"><div className="st-sources-heading"><Icon name="book" size={18}/><h2>{userCodeContext ? 'Votre contexte de code' : rejectedSources ? 'Passages repérés' : 'Les sources, à portée de vue.'}</h2></div><p>{userCodeContext ? 'Réponse fondée sur votre code ou votre spécification.' : rejectedSources ? 'Ces passages ont été retrouvés, mais ne suffisent pas à étayer une réponse.' : sourceResult?.source_status === 'retrieved' ? 'Passages fournis au modèle. Leur pertinence et la réponse restent à vérifier.' : 'Les passages effectivement utilisés pour cette réponse.'}</p>{sources.length ? <><div className="st-source-list">{sources.map((s, i) => <button key={i} className={sourceIndex === i ? 'selected' : ''} onClick={() => setSourceIndex(i)}><span className="st-source-number">{String(i + 1).padStart(2, '0')}</span><span>{s.title}<small>{s.author}{s.page ? ` · p. ${s.page}` : ''}</small></span></button>)}</div><div className="st-source-excerpt"><div className="st-eyebrow">EXTRAIT ORIGINAL</div><p>{sources[Math.min(sourceIndex, sources.length - 1)]?.text}</p>{sources[Math.min(sourceIndex, sources.length - 1)]?.surrounding_text && <details><summary>Lire le contexte autour de cet extrait</summary><p>{sources[Math.min(sourceIndex, sources.length - 1)].surrounding_text}</p></details>}{modelId === 'medical' && (sources[Math.min(sourceIndex, sources.length - 1)]?.book_id || sources[Math.min(sourceIndex, sources.length - 1)]?.source_id) && <button className="st-text-button" onClick={() => void openMedicalSource(sources[Math.min(sourceIndex, sources.length - 1)])}>Ouvrir le document local ↗</button>}{sources[Math.min(sourceIndex, sources.length - 1)]?.source_url?.startsWith('https://www.has-sante.fr/') && <a href={`${sources[Math.min(sourceIndex, sources.length - 1)].source_url}#page=${sources[Math.min(sourceIndex, sources.length - 1)].page || 1}`} target="_blank" rel="noopener noreferrer">Ouvrir le document HAS à cette page ↗</a>}</div></> : <div className="st-sources-empty"><div className="st-paper-stack"><Icon name="book" size={31}/></div><h3>{userCodeContext ? 'Une proposition à tester.' : 'Chaque réponse a une origine.'}</h3><p>{userCodeContext ? 'Le code proposé n’a pas été exécuté par le Studio. Vous pouvez demander une explication ou des cas de test.' : 'Les ouvrages et leurs extraits apparaîtront ici après votre question.'}</p></div>}<div className="st-source-bottom"><span className="st-tiny-dot"/> {userCodeContext ? 'Contexte fourni · traitement local' : modelId === 'legal' ? 'Codes datés · recherche locale' : 'Recherche locale · LibraryBrain'}</div></aside></div>}
        {view === 'train' && <div className="st-page"><div className="st-eyebrow">ATELIER D’ENTRAÎNEMENT</div><div className="st-section-heading"><div><h1>Faites évoluer votre modèle.</h1><p>Créez une version indépendante à partir d’un corpus déjà vérifié.</p></div><span className="st-pill">LoRA · SUR CE MAC</span></div>{model?.supports_training === false && <p className="st-eval-caution">{modelId === 'medical' ? 'Ce pilote médical utilise une base locale avec recherche documentaire. Aucun nouvel entraînement LoRA n’est activé dans le Studio.' : 'La V3 juridique est disponible pour discussion et correction. Son entraînement se fait dans le projet LibraryBrainLegal.'}</p>}<div className="st-training-layout"><div className="st-training-form"><section className="st-form-section"><span className="st-step">01</span><div><h2>Choisir le spécialiste</h2><p>Le corpus et les consignes suivent le modèle choisi.</p>{selectModel}<label className="st-label">Nom de la nouvelle version<input value={name} onChange={e => setName(e.target.value)} maxLength={64} placeholder={`${model?.name || 'Modèle'} · prochaine version`}/></label></div></section><section className="st-form-section"><span className="st-step">02</span><div><h2>Un corpus prêt à apprendre</h2><p>Exemples synthétiques vérifiés, séparés par ouvrage avant l’entraînement.</p><div className="st-dataset-counts">{[['train','Entraînement'],['valid','Validation'],['test','Test réservé']].map(([key,label]) => <div key={key}><strong>{model?.dataset[key]?.toLocaleString('fr-FR') || '—'}</strong><span>{label}</span></div>)}</div><div className="st-check-line"><Icon name="check" size={16}/> Empreintes vérifiées avant chaque lancement</div><details className="st-details"><summary>Comment mes corrections sont-elles utilisées ?</summary><p>{catalog.feedback_count} correction(s) conservée(s) pour révision. Elles ne sont pas encore ajoutées à ce corpus figé. Cette version de l’atelier réentraîne sur le corpus existant ; elle ne distille pas de nouveaux livres.</p></details></div></section><section className="st-form-section"><span className="st-step">03</span><div><h2>Définir l’effort d’entraînement</h2><p>Plus d’itérations ne garantit pas de meilleures réponses.</p><div className="st-effort-options">{[{n:40,label:'Exploration',hint:'40 itérations'},{n:80,label:'Intermédiaire',hint:'80 itérations'},{n:Math.ceil((model?.dataset.train || 1172)/8),label:'Une passe',hint:'Corpus complet par lots'}].map(o => <button key={o.label} aria-pressed={iterations===o.n} className={iterations===o.n?'selected':''} onClick={() => setIterations(o.n)}><span>{o.label}</span><small>{o.hint}</small><i/></button>)}</div></div></section></div><aside className="st-launch-card"><span className="st-model-glyph research"><Icon name="train" size={25}/></span><h2>Une nouvelle version.<br/>Un nouvel essai.</h2><p>L’adaptation repart de la base 4B figée. Vos versions actuelles restent disponibles.</p><dl><div><dt>Modèle</dt><dd>{model?.name}</dd></div><div><dt>Effort</dt><dd>{iterations} itérations</dd></div><div><dt>Sortie</dt><dd>Candidat MLX 8 bits</dd></div><div><dt>Espace requis</dt><dd>Au moins 8 Go libres</dd></div></dl><button className="st-primary" disabled={!online||sending||!model?.available||model.supports_training === false} onClick={() => void train()}><Icon name="train" size={17}/>{sending?'Préparation…':'Lancer l’entraînement'}</button><small>Le Studio exécute une tâche à la fois. La discussion attendra si le moteur entraîne un modèle.</small></aside></div><Activity jobs={jobList} details={details} cancel={cancel} inspect={setLogId}/></div>}
        {view === 'evaluate' && <div className="st-page"><div className="st-eyebrow">OBSERVATOIRE DES MODÈLES</div><div className="st-section-heading"><div><h1>Mesurer avant de choisir.</h1><p>Une meilleure citation ne garantit pas une réponse plus juste.</p></div><span className="st-pill">RÉSULTATS RÉELS</span></div><div className="st-model-grid">{catalog.models.map(m => { if (m.medical_rag_assessment) return <MedicalRagEvaluation key={m.id} model={m}/>; if (m.reader_assessment) return <ReaderEvaluation key={m.id} model={m}/>; if (m.medical_assessment) return <MedicalEvaluation key={m.id} model={m}/>; if (m.legal_assessment) return <LegalEvaluation key={m.id} model={m}/>; const base=m.metrics.base; const specialized=Object.entries(m.metrics).find(([k])=>k!=='base')?.[1]; return <article className="st-eval-card" key={m.id}><div className="st-eval-header"><span className={`st-mini-icon ${m.id}`}><Icon name={presentation(m.id, m.version).icon} size={17}/></span><h2>{m.name}</h2><span className="st-badge">{specialized?.n || '—'} CAS</span></div>{m.validation_gate === false && <p className="st-eval-caution">Critères de sélection non atteints sur la validation. Ce pilote reste à améliorer.</p>}<div className="st-score">{pct(specialized?.contract_pass_rate)}<span>Respect des consignes et citations</span></div><div className="st-bar-row"><span>Base 4B</span><div><i style={{width:`${(base?.contract_pass_rate||0)*100}%`}}/></div><b>{pct(base?.contract_pass_rate)}</b></div><div className="st-bar-row current"><span>Version {m.version}</span><div><i style={{width:`${(specialized?.contract_pass_rate||0)*100}%`}}/></div><b>{pct(specialized?.contract_pass_rate)}</b></div><div className="st-eval-note"><strong>Fidélité automatique aux sources</strong><p>{Object.entries(m.fidelity?.models || {}).map(([key, score]) => `${score.supported}/${score.n} pour ${key === 'base' ? 'la base' : m.name}`).join(' · ')}<br/>Échantillon limité, sans validation humaine indépendante.</p></div>{m.code_metrics?.models && <div className="st-eval-note st-code-score"><strong>Exercices Python · code exécuté</strong><p>{Object.entries(m.code_metrics.models).map(([key, score]) => `${score.passed}/${score.n} fonctions réussies pour ${key === 'base' ? 'la base' : m.name}`).join(' · ')}<br/>Une génération par exercice, tous les cas doivent réussir. Petit banc de test local, sans accès à vos dépôts.</p></div>}</article>; })}</div><section className="st-versions"><div className="st-section-heading"><div><h2>Vos versions candidates</h2><p>Évaluez chaque candidat sur les questions réservées, puis essayez ses réponses.</p></div></div>{catalog.versions.length===0?<div className="st-empty-versions"><Icon name="chart" size={29}/><h3>La prochaine version commence dans l’atelier.</h3><p>Vos entraînements et comparaisons apparaîtront ici.</p><button className="st-secondary" onClick={()=>navigate('train')}>Créer une version <Icon name="arrow" size={16}/></button></div>:catalog.versions.map(v=><div className="st-version-row" key={v.id}><div><strong>{v.name}</strong><small>{catalog.models.find(m => m.id === v.model)?.name || v.model} · {new Date(v.created*1000).toLocaleDateString('fr-FR')} · {v.evaluation?'Évalué automatiquement':v.available?'À évaluer':'Préparation'}</small></div>{v.evaluation&&<span className="st-version-score">{pct(Object.entries(v.evaluation.models).find(([k])=>k!=='base')?.[1].contract_pass_rate)}{v.code_metrics?.models && <small>Python {Object.entries(v.code_metrics.models).filter(([key])=>key!=='base').map(([,score])=>`${score.passed}/${score.n}`).join('')}</small>}</span>}<button className="st-secondary" disabled={!online||!v.available||sending||jobs.some(j=>j.kind==='evaluate'&&j.version===v.id&&active(j))} onClick={()=>void evaluate(v)}>Évaluer</button><button className="st-secondary" disabled={!v.available} onClick={()=>{choose(v.model);setVersion(v.id);}}>Essayer <Icon name="arrow" size={15}/></button></div>)}</section><Activity jobs={jobList} details={details} cancel={cancel} inspect={setLogId}/><p className="st-footnote">Les tests de conformité ne certifient pas l’exactitude factuelle. KlodyMusic est un assistant textuel, sans génération ni analyse de fichiers audio.</p></div>}
      </main>
    </div>
    <dialog className="st-dialog" ref={dialog} onCancel={()=>setFeedback(null)}><form onSubmit={async e=>{e.preventDefault();if(!feedback)return;setSending(true);try{await request('/feedback',{job:feedback.id,correction});dialog.current?.close();setFeedback(null);setNotice('Correction conservée pour révision. Le modèle n’a pas été modifié.');await refresh();}catch(e){setError(String(e));}finally{setSending(false);}}}><div className="st-section-heading"><h2>Une meilleure réponse commence ici.</h2><button type="button" className="st-icon-button" aria-label="Fermer la correction" onClick={()=>{dialog.current?.close();setFeedback(null);}}><Icon name="close"/></button></div><p>Précisez la correction et, si possible, le passage qui l’appuie. Elle sera conservée pour révision avant un futur corpus.</p><label className="st-label">Votre correction<textarea autoFocus value={correction} onChange={e=>setCorrection(e.target.value)} minLength={5} maxLength={6000} required/></label><button className="st-primary" disabled={sending}>Conserver la correction <Icon name="check" size={16}/></button></form></dialog>
    {logId&&<dialog ref={logDialog} onCancel={()=>setLogId(null)} aria-label="Détail de l’opération" className="st-log-panel"><div className="st-section-heading"><h2>Suivi de l’opération</h2><button className="st-icon-button" aria-label="Fermer le suivi" onClick={()=>setLogId(null)}><Icon name="close"/></button></div><p>{selectedDetail?statusText[selectedDetail.status]:'Chargement…'} · {selectedDetail?.phase}</p>{selectedDetail?.error&&<p className="st-inline-error">{selectedDetail.error}</p>}<pre>{selectedDetail?.log || 'Le journal apparaîtra au démarrage du moteur.'}</pre>{selectedDetail&&active(selectedDetail)&&<button className="st-secondary" onClick={()=>void cancel(logId)}>Arrêter cette opération</button>}</dialog>}
    <dialog className="st-dialog st-mobile-sources" ref={sourceDialog} aria-label="Sources de la réponse"><div className="st-section-heading"><h2>{userCodeContext ? 'Votre code et consignes' : rejectedSources ? 'Passages repérés' : 'Sources de la réponse'}</h2><button className="st-icon-button" aria-label="Fermer les sources" onClick={()=>sourceDialog.current?.close()}><Icon name="close"/></button></div>{userCodeContext && <p>Cette réponse s’appuie sur votre code ou votre spécification. Le code proposé n’a pas été exécuté par le Studio.</p>}{sources.map((s,i)=><details key={i} open={i===0}><summary>{s.title}{s.page?` · p. ${s.page}`:''}</summary><p>{s.author}</p><p>{s.text}</p>{s.surrounding_text && <details><summary>Lire le contexte autour de cet extrait</summary><p>{s.surrounding_text}</p></details>}{modelId === 'medical' && (s.book_id || s.source_id) && <button className="st-text-button" onClick={() => void openMedicalSource(s)}>Ouvrir le document local ↗</button>}</details>)}</dialog>
  </div>;
}
function Activity({jobs,details,cancel,inspect}:{jobs:Job[];details:Record<string,Job>;cancel:(id:string)=>Promise<void>;inspect:(id:string)=>void}) {
  return <section className="st-activity"><div className="st-section-heading"><h2>Activité de l’atelier</h2><span className="st-muted">{jobs.filter(active).length} en cours ou en attente</span></div>{!jobs.length?<p className="st-activity-empty">Votre premier entraînement apparaîtra ici avec sa progression.</p>:jobs.slice(0,8).map(j=>{const d=details[j.id]||j;const progress=d.progress;const percent=progress?.total_iterations?Math.min(100,((progress.iteration||0)+1)/progress.total_iterations*100):null;return <div className="st-job-row" key={j.id}><span className={`st-job-dot ${j.status}`}/><div><strong>{j.name||(j.kind==='evaluate'?'Évaluation comparative':'Entraînement')}</strong><small>{statusText[j.status]}{progress?.total_iterations?` · ${(progress.iteration||0)+1}/${progress.total_iterations} itérations`:''}</small>{percent!==null&&active(j)&&<progress aria-label="Progression de l’entraînement" max={100} value={percent}/>}</div><button className="st-text-button" onClick={()=>inspect(j.id)}>Détails</button>{active(j)&&<button className="st-text-button" onClick={()=>void cancel(j.id)}>Arrêter</button>}</div>;})}</section>;
}

function LegalEvaluation({ model }: { model: Model }) {
  return <article className="st-eval-card">
    <div className="st-eval-header"><span className="st-mini-icon legal"><Icon name="book" size={17}/></span><h2>{model.name}</h2><span className="st-badge">30 CAS</span></div>
    <p className="st-eval-caution">V3 expérimentale · critères de sélection non atteints.</p>
    <div className="st-score">{model.legal_assessment?.v3.conforme}/30<span>Réponses jugées conformes par revue de l’agent</span></div>
    <div className="st-eval-note"><strong>Comparaison à consignes et sources identiques</strong>
      {Object.entries(model.legal_assessment || {}).map(([id, score]) => <p key={id}>{id === 'base' ? 'Base 4B' : id === 'v2' ? 'Ancien LoRA V2' : 'LoRA V3'} : {score.conforme} conformes · {score.fragile} fragiles · {score.incorrect} incorrectes</p>)}
      <p>Questions réservées. Revue de l’agent, sans validation par un juriste. Les extraits contrôlés ne garantissent pas la justesse du raisonnement.</p>
    </div>
  </article>;
}

function MedicalEvaluation({ model }: { model: Model }) {
  return <article className="st-eval-card">
    <div className="st-eval-header"><span className="st-mini-icon medical"><Icon name="book" size={17}/></span><h2>{model.name}</h2><span className="st-badge">16 CAS</span></div>
    <p className="st-eval-caution">Candidat à tester · erreurs de fond observées · sans validation clinique.</p>
    <div className="st-score">{model.medical_assessment?.lora.documentary_ok}/16<span>Réponses documentaires conformes selon la revue de l’agent</span></div>
    <div className="st-eval-note"><strong>Mêmes questions, sources et consignes</strong>
      {Object.entries(model.medical_assessment || {}).map(([id, score]) => <p key={id}>{id === 'base' ? 'Base 4B' : 'LoRA V1'} : {score.documentary_ok}/{score.n} conformes · {score.content_ok}/{score.n} sur le fond documentaire · {score.attributed_quotes}/15 avec tous les extraits attribués.</p>)}
      <p>Trois thèmes réservés au test. Petit échantillon revu par l’agent, sans professionnel de santé. Une citation exacte ne valide pas une conclusion médicale. Une réponse du LoRA omet notamment un critère nécessaire de dénutrition.</p>
    </div>
  </article>;
}

function ReaderEvaluation({ model }: { model: Model }) {
  const r = model.reader_assessment!;
  return <><article className="st-eval-card">
    <div className="st-eval-header"><span className="st-mini-icon medical"><Icon name="book" size={17}/></span><h2>{model.name}</h2><span className="st-badge">{r.n} CAS INITIAUX</span></div>
    <div className="st-score">{r.errors}<span>erreur documentaire relevée sur ce test</span></div>
    {model.coverage_audit && <p className="st-eval-caution">Contrôle de couverture élargi : {model.coverage_audit.rejected_before_model}/{model.coverage_audit.answerable} demandes documentaires rejetées avant le modèle. Le score initial ci-dessus ne couvre pas une recherche médicale générale.</p>}
    <div className="st-eval-note"><strong>Objectif : au maximum 1 erreur sur 24 cas</strong>
      <p>{r.correct_answers}/{r.answerable} réponses avec les passages attendus · {r.correct_abstentions}/{r.expected_abstentions} refus justifiés. Un refus sur une question couverte compte comme une erreur.</p>
      <p>Le 4B sélectionne les passages ; les textes complets, dates et références sont reproduits par le logiciel. Aucune synthèse médicale libre.</p>
      <p>Base retenue sur le développement : {r.development_base_errors}/{r.development_n} erreur, contre {r.development_lora_errors}/{r.development_n} pour le LoRA archivé.</p>
      <p>Petit corpus, revue par l’agent, sans validation clinique. Ce résultat ne garantit pas une erreur maximum sur toutes les futures questions.</p>
    </div>
  </article>{model.medical_candidate_assessment && <MedicalRagEvaluation model={{...model, name: 'Candidat médical 35B', validation_gate: model.medical_candidate_assessment.accepted, medical_rag_assessment: model.medical_candidate_assessment.summary}}/>}</>;
}

function MedicalRagEvaluation({ model }: { model: Model }) {
  const r = model.medical_rag_assessment!;
  const [reportError, setReportError] = useState('');
  return <article className="st-eval-card">
    <div className="st-eval-header"><span className="st-mini-icon medical"><Icon name="book" size={17}/></span><h2>{model.name}</h2><span className="st-badge">{r.n} CAS</span></div>
    {model.validation_gate === false && <p className="st-eval-caution">Objectif non atteint · candidat non activé.</p>}
    <div className="st-score">{r.errors}<span>échec(s) documentaire(s) sur ce test</span></div>
    <div className="st-eval-note"><strong>Couverture et fidélité mesurées ensemble</strong>
      <p>{r.useful_answers}/{r.answerable} réponses utiles · {r.source_supported_answers}/{r.answerable} réponses étayées · {r.correct_abstentions}/{r.expected_abstentions} refus justifiés.</p>
      <p>{model.documentary_reader ? 'Recherche dans les publications HAS datées et le catalogue médical. Le 35B sélectionne les extraits ; leurs textes sont reproduits sans reformulation.' : 'Recherche dans le catalogue médical, réponse locale 35B et contrôle des références.'} Un refus injustifié compte comme un échec.</p>
      {r.fresh_n !== undefined && <p>{model.documentary_reader ? `${r.fresh_n} questions nouvelles et ${r.regression_n || 0} cas connus rejoués. Les résultats des versions précédentes sont conservés.` : `${r.fresh_n} questions encore inédites et ${r.regression_n} cas de régression après correction du format des contrôles.`}</p>}
      <p>Ce score porte sur les extraits originaux. La traduction automatique est une aide de lecture distincte.</p><p>Revue par l’agent sur un échantillon limité, sans validation clinique indépendante. Ce score ne garantit pas une erreur maximum sur vos futures questions.</p>
    </div>
    <button className="st-secondary" onClick={() => {setReportError('');void request('/medical/open-evaluation', {version: model.evaluation_version || 'v3'}).catch(e => setReportError(String(e)));}}>Ouvrir les réponses et leurs sources ↗</button>
    {reportError && <p role="alert">{reportError}</p>}
  </article>;
}
