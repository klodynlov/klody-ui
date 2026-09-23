import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { MusicFiles } from './MusicFiles';
import './music.css';

type Mode = 'structure' | 'balance' | 'comparison' | 'documents';
type Project = { id?: string; title: string; style: string; bpm: number | null; meter?: string; key: string; goal: string; notes: string; revision: number };
type Draft = { project: Project; question: string; mode: Mode; pending?: { id: string; question: string; mode: Mode } };
type Source = { id: string; title: string; author: string; page: number | null; passage?: number; text: string };
type Job = { id: string; question: string; status: string; error?: string; music_mode: Mode; result?: { answer: string; error?: string; phase: string; sources: Source[]; project_revision: number; duration_policy?: string; duration_reference?: { bpm: number; meter: string; values: { bars: number; seconds: number }[] } } };
type Preferences = { instructions: string; revision: number };
type Overview = { projects: Project[]; engine: { available: boolean; running?: boolean; message: string }; methods: Record<Mode, { title: string; question: string }>; preferences?: Preferences };
const API = 'http://127.0.0.1:8018/api';
const STORAGE = 'klody.music.workspace.v1';
const EMPTY: Project = { title: '', style: '', bpm: null, meter: '', key: '', goal: '', notes: '', revision: 0 };
const modes: Mode[] = ['structure', 'balance', 'comparison', 'documents'];
const defaults = {
  structure: { title: 'Construire la structure', question: 'Propose deux structures pour mon morceau et explique leur effet.' },
  balance: { title: 'Clarifier le mix', question: 'Aide-moi à organiser les rôles et à rendre mon élément principal plus lisible.' },
  comparison: { title: 'Comparer un traitement', question: 'Prépare un test avant/après à volume comparable pour ce traitement.' },
  documents: { title: 'Analyser mes documents', question: 'Résume les documents du projet, cite les passages utiles et indique ce qui reste à préciser.' },
};
const active = (job: Job) => ['running', 'queued'].includes(job.status);
const status: Record<string, string> = { queued: 'En attente du moteur local…', running: 'Préparation de votre réponse…', failed: 'La réponse a échoué.', cancelled: 'Réponse annulée.', interrupted: 'Réponse interrompue. Vous pouvez relancer votre demande.' };
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(API + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Klody-Studio': '1' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : `Opération refusée (${response.status}).`);
  }
  return response.json();
}
function restored(): { selected: string; drafts: Record<string, Draft> } {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    if (typeof data.selected === 'string' && data.drafts && typeof data.drafts === 'object') return data;
  } catch { /* Storage is optional; the server retains saved projects and answers. */ }
  return { selected: 'new', drafts: {} };
}

export function MusicWorkspace() {
  const [workspace, setWorkspace] = useState(restored);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connected, setConnected] = useState(false);
  const [preferenceDraft, setPreferenceDraft] = useState<Preferences | null>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE+'.preferences') || 'null'); } catch { return null; }
  });
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const generation = useRef(0);
  const selected = workspace.selected;
  const saved = overview?.projects.find(p => p.id === selected);
  const draft = workspace.drafts[selected] || { project: saved || EMPTY, question: '', mode: 'structure' as Mode };
  const project = draft.project;
  const methods = { ...defaults, ...overview?.methods };
  const preferences = preferenceDraft || overview?.preferences || { instructions: '', revision: 0 };
  const pending = jobs.some(active);
  const canSend = !busy && !pending && !importing && connected && !!overview?.engine.available && draft.question.trim().length >= 2;
  const dirty = JSON.stringify(project) !== JSON.stringify(saved || EMPTY);

  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(workspace)); }
    catch { setNotice('Le brouillon ne peut pas être conservé dans ce navigateur. Enregistrez la fiche sur le Mac.'); }
  }, [workspace]);
  useEffect(() => {
    try {
      if (preferenceDraft) localStorage.setItem(STORAGE+'.preferences', JSON.stringify(preferenceDraft));
      else localStorage.removeItem(STORAGE+'.preferences');
    } catch { /* Saved preferences remain on the server. */ }
  }, [preferenceDraft]);
  useEffect(() => {
    const previous = document.title;
    document.title = 'Klody · Atelier musique';
    return () => { document.title = previous; };
  }, []);
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const data = await request<Overview>('/music');
        if (!stopped) { setOverview(data); setConnected(true); }
      } catch (e) { if (!stopped) { setConnected(false); setError(String(e)); } }
    };
    void load(); const timer = setInterval(() => void load(), 10000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);
  useEffect(() => {
    let stopped = false;
    generation.current++;
    setJobs([]);
    if (selected === 'new') return;
    const load = async () => {
      try {
        const data = await request<Job[]>(`/music/projects/${selected}/conversation`);
        if (!stopped) setJobs(data);
      } catch (e) { if (!stopped) setError(String(e)); }
    };
    void load(); const timer = setInterval(() => void load(), 1500);
    return () => { stopped = true; clearInterval(timer); };
  }, [selected]);

  function update(changes: Partial<Draft>) {
    setWorkspace(w => ({ ...w, drafts: { ...w.drafts, [selected]: { ...draft, ...changes } } }));
  }
  function field<K extends keyof Project>(key: K, value: Project[K]) { update({ project: { ...project, [key]: value } }); }
  function choose(id: string) {
    setWorkspace(w => ({ ...w, selected: id })); setError(''); setNotice(''); setJobs([]);
  }
  async function persist(firstQuestion?: string): Promise<Project> {
    const title = project.title.trim() || (selected === 'new' ? firstQuestion?.trim().replace(/\s+/g, ' ').slice(0, 100) : '');
    if (!title) throw new Error('Donnez un nom à votre morceau avant de continuer.');
    if (project.bpm !== null && (!Number.isFinite(project.bpm) || project.bpm < 20 || project.bpm > 400)) throw new Error('Le tempo doit être compris entre 20 et 400 noires par minute.');
    if (project.meter && !/^(?:[1-9]|[12]\d|3[0-2])\/(?:1|2|4|8|16|32)$/.test(project.meter)) throw new Error('Indiquez une mesure comme 4/4, 3/4 ou 6/8, ou laissez ce champ vide.');
    if (saved && !dirty) return saved;
    const result = await request<Project>(selected === 'new' ? '/music/projects' : `/music/projects/${selected}`, { ...project, title });
    const id = result.id!;
    setOverview(o => o ? { ...o, projects: [result, ...o.projects.filter(p => p.id !== id)] } : o);
    setWorkspace(w => {
      const drafts = { ...w.drafts, [id]: { ...draft, project: result } };
      if (selected === 'new') delete drafts.new;
      return { selected: id, drafts };
    });
    return result;
  }
  async function save() {
    setBusy(true); setError('');
    try { await persist(); setNotice('Fiche enregistrée sur ce Mac.'); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!canSend) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await persist(draft.question);
      const id = result.id!;
      const retry = draft.pending?.question === draft.question && draft.pending.mode === draft.mode ? draft.pending :
        { id: crypto.randomUUID().replace(/-/g, ''), question: draft.question, mode: draft.mode };
      setWorkspace(w => ({ ...w, drafts: { ...w.drafts, [id]: { ...draft, project: result, pending: retry } } }));
      const job = await request<Job>('/music/chat', { project_id: id, question: retry.question, mode: retry.mode, request_id: retry.id });
      setJobs(j => j.some(v => v.id === job.id) ? j : [...j, job]);
      setWorkspace(w => ({ ...w, drafts: { ...w.drafts, [id]: { ...draft, project: result, question: '', pending: undefined } } }));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function cancel(job: Job) {
    const current = generation.current;
    try {
      await request(`/jobs/${job.id}/cancel`, {});
      if (current === generation.current) setJobs(j => j.map(v => v.id === job.id ? { ...v, status: 'cancelled' } : v));
    } catch (e) { setError(String(e)); }
  }
  async function savePreferences() {
    setPreferenceBusy(true); setError('');
    try {
      const value = await request<Preferences>('/music/preferences', preferences);
      setOverview(o => o ? { ...o, preferences: value } : o); setPreferenceDraft(null);
      setNotice('Préférences enregistrées pour les prochaines demandes de tous vos morceaux.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setPreferenceBusy(false); }
  }

  return <div className="music-workspace">
    <aside className="mw-sidebar">
      <a className="mw-brand" href="#studio">klody<span>atelier local</span></a>
      <a className="mw-library" href="#">← Assistant Klody</a>
      <nav aria-label="Assistants spécialisés" className="mw-specialists">
        <a href="#music" aria-current="page">♫ Musique</a>
        <a href="#studio/legal">§ Juridique <span>Lecteur V3</span></a>
        <a href="#studio/medical">✚ Médical <span>Lecteur V8</span></a>
      </nav>
      <div className="mw-project-heading"><h2>Mes morceaux</h2><button disabled={busy} onClick={() => choose('new')} aria-label="Nouveau morceau">＋</button></div>
      <div className="mw-projects">{overview?.projects.map(p => <button disabled={busy} key={p.id} aria-current={selected === p.id ? 'page' : undefined} onClick={() => choose(p.id!)}>{p.title}<small>{p.style || 'Projet musical'}</small></button>)}</div>
      {!overview?.projects.length && <p className="mw-muted">Créez votre première fiche. Vos échanges resteront attachés au morceau.</p>}
      <a className="mw-library" href="#studio/music">Explorer la bibliothèque musicale ↗</a>
      <details className="mw-preferences"><summary>Mes préférences de travail</summary><label>Consignes communes<textarea maxLength={2000} value={preferences.instructions} onChange={e => setPreferenceDraft({ ...preferences, instructions: e.target.value })} placeholder="Logiciel, niveau de détail, habitudes de travail…" /></label><button disabled={preferenceBusy || !connected} onClick={() => void savePreferences()}>Enregistrer les préférences</button>{preferenceDraft && <button onClick={() => setPreferenceDraft(null)}>Reprendre les préférences enregistrées</button>}<p>Appliquées aux prochaines demandes. Vous choisissez ce qui est mémorisé.</p></details>
      <div className="mw-local">Sur ce Mac<span>Aucun envoi vers un service cloud</span></div>
    </aside>
    <main className="mw-main">
      <header className="mw-header"><div><span className="mw-eyebrow">MUSIQUE · PREMIER ATELIER</span><h1>Faisons avancer votre morceau.</h1></div><span className="mw-engine" title={overview?.engine.message}>{connected && overview?.engine.available ? overview.engine.running === false ? '35B local · réveil à la demande' : 'Moteur local · 35B' : 'Moteur indisponible'}</span></header>
      <p className="mw-intro">Une intention, des essais concrets et des références consultables. Retrouvez ici le contexte et les échanges de chaque morceau.</p>
      {error && <div className="mw-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Fermer l’erreur">×</button></div>}
      {notice && <p className="mw-notice" role="status">{notice}</p>}
      {!connected && <p role="status" className="mw-alert">Connexion au Studio local en attente. Votre brouillon reste disponible.</p>}
      <div className="mw-layout">
        <section className="mw-conversation" aria-label="Conversation musicale">
          <div className="mw-methods" aria-label="Méthode de travail">{modes.map((mode, i) => <button key={mode} disabled={busy} aria-pressed={draft.mode === mode} onClick={() => update({ mode })}><small>0{i+1}</small>{methods[mode].title}</button>)}</div>
          <div className="mw-messages" aria-live="polite">
            {jobs.length === 0 && <div className="mw-welcome"><span>♫</span><h2>Quel pas voulez-vous franchir ?</h2><p>Décrivez votre intention et le point qui bloque. L’assistant proposera des essais adaptés à votre fiche.</p><button onClick={() => update({ question: methods[draft.mode].question })}>Utiliser une première demande ↗</button></div>}
            {jobs.map(job => <article className="mw-exchange" key={job.id}>
              <div className="mw-user">{job.question}</div>
              <div className="mw-answer-title">Klody musique <span>{methods[job.music_mode]?.title}</span></div>
              {job.music_mode === 'structure' && job.result?.answer && !job.result.duration_policy && <p className="mw-alert">Réponse antérieure au contrôle des durées : ne vous fiez pas à ses conversions en secondes. Demandez une nouvelle proposition pour obtenir les repères calculés.</p>}
              {job.result?.answer ? <div className="mw-answer"><ReactMarkdown components={{ img: ({ alt }) => <span>{alt || 'Image non chargée'}</span>, a: ({ children }) => <span>{children}</span> }}>{job.result.answer}</ReactMarkdown></div> : <p className="mw-muted">{status[job.status]}</p>}
              {job.result?.duration_reference && <div className="mw-duration"><strong>Repères calculés · {job.result.duration_reference.bpm} noires/min · {job.result.duration_reference.meter}</strong><p>Tempo constant, sans rubato. Valeurs calculées par le programme à partir de la fiche.</p><div>{job.result.duration_reference.values.map(v => <span key={v.bars}>{v.bars} mesures <b>{v.seconds.toLocaleString('fr-FR')} s</b></span>)}</div></div>}
              {job.music_mode === 'structure' && job.result?.duration_policy && !job.result.duration_reference && <p className="mw-boundary">Précisez le tempo à la noire et la mesure dans la fiche pour obtenir des durées calculées.</p>}
              {(job.result?.error || job.error) && <p className="mw-alert">{job.result?.error || job.error}</p>}
              {active(job) && <button className="mw-text-button" onClick={() => void cancel(job)}>Annuler la réponse</button>}
              {!!job.result?.sources.length && <details className="mw-sources"><summary>Sources et méthodes · {job.result.sources.length} passages</summary><p>Livres, extraits de vos documents et mesures locales restent distincts des propositions à essayer et à écouter.</p>{job.result.sources.map(source => <details key={source.id}><summary>[{source.id}] {source.title}{source.page ? ` · p. ${source.page}` : source.passage ? ` · passage ${source.passage}` : ''}</summary><p>{source.author}{source.page ? ' · page indexée' : ''}</p><blockquote>{source.text}</blockquote></details>)}</details>}
            </article>)}
          </div>
          <form className="mw-composer" onSubmit={e => { e.preventDefault(); void send(); }}>
            <label htmlFor="music-question">Votre demande</label>
            <textarea id="music-question" aria-describedby="music-send-help" maxLength={4000} value={draft.question} disabled={busy} onChange={e => update({ question: e.target.value })} onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
            }} placeholder="Mon refrain manque de contraste. Je voudrais…" />
            <div><small id="music-send-help">{selected === 'new' && !project.title.trim() ? 'Votre première demande nommera le morceau. Vous pourrez le renommer.' : 'La fiche sera enregistrée avec votre demande.'}<br />Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne.</small><button type="submit" disabled={!canSend}>{busy ? 'Envoi…' : importing ? 'Import en cours…' : pending ? 'Réponse en cours…' : 'Envoyer →'}</button></div>
            {connected && overview && !overview.engine.available && <p className="mw-alert" role="status">{overview.engine.message}</p>}
          </form>
          <p className="mw-boundary">Conseils à partir de votre contexte, des extraits et des mesures disponibles. L’IA n’écoute pas le son et ne modifie pas Ableton.</p>
        </section>
        <aside className="mw-brief" aria-label="Fiche du morceau">
          <div className="mw-brief-heading"><h2>Le morceau</h2><span>{selected === 'new' ? 'Nouveau' : dirty ? 'Brouillon' : 'Enregistré'}</span></div>
          <fieldset disabled={busy}>
            <label>Titre<input maxLength={100} value={project.title} onChange={e => field('title', e.target.value)} placeholder="Nom du morceau" /></label>
            <label>Style / ambiance<input maxLength={160} value={project.style} onChange={e => field('style', e.target.value)} placeholder="R&B, intime, chaleureux…" /></label>
            <div className="mw-pair"><label>Tempo déclaré (noire/min)<input type="number" min={20} max={400} step="any" value={project.bpm ?? ''} onChange={e => field('bpm', e.target.value ? Number(e.target.value) : null)} placeholder="90" /></label><label>Mesure<input maxLength={5} value={project.meter || ''} onChange={e => field('meter', e.target.value)} placeholder="4/4" /></label></div>
            <label>Tonalité déclarée<input maxLength={80} value={project.key} onChange={e => field('key', e.target.value)} placeholder="À préciser" /></label>
            <label>Intention<textarea maxLength={1500} value={project.goal} onChange={e => field('goal', e.target.value)} placeholder="L’émotion et l’effet recherchés…" /></label>
            <label>Contexte et décisions<textarea maxLength={4000} value={project.notes} onChange={e => field('notes', e.target.value)} placeholder="Mesure, instruments, structure, contraintes, essais déjà retenus…" /></label>
          </fieldset>
          <button className="mw-save" disabled={busy || !connected || !project.title.trim()} onClick={() => void save()}>Enregistrer la fiche</button>
          {saved && dirty && <button className="mw-text-button" disabled={busy} onClick={() => update({ project: saved })}>Reprendre la fiche enregistrée</button>}
          <p>Fiche et réponses conservées sur ce Mac. Chaque réponse garde la version de la fiche utilisée.</p>
          <a href="#studio">Tous les modèles et résultats ↗</a>
          <MusicFiles projectId={selected === 'new' ? undefined : selected} onBusy={setImporting} />
        </aside>
      </div>
    </main>
  </div>;
}
