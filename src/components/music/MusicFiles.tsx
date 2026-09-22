import { useEffect, useRef, useState } from 'react';

const API = 'http://127.0.0.1:8018/api/music/projects/';
type Asset = { id: string; name: string; kind: 'audio' | 'document'; status: string; error?: string;
  analysis: { duration_seconds?: number; integrated_lufs?: number | null; true_peak_dbtp?: number | null;
    sample_rate?: number; channels?: number; passages?: number; coverage?: string } };
const headers = { 'X-Klody-Studio': '1' };

async function checked(response: Response) {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : `Opération refusée (${response.status}).`);
  }
  return response;
}

export function MusicFiles({ projectId, onBusy }: { projectId?: string; onBusy: (value: boolean) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [audio, setAudio] = useState<{ id: string; url: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const epoch = useRef(0);
  useEffect(() => {
    onBusy(uploading || assets.some(a => ['queued', 'running'].includes(a.status)));
    return () => onBusy(false);
  }, [assets, uploading, onBusy]);
  useEffect(() => {
    let stopped = false;
    epoch.current++;
    setAssets([]); setError(''); setAudio(null); setUploading(false);
    if (!projectId) return;
    const refresh = async () => {
      try {
        const response = await checked(await fetch(API+projectId+'/assets', { headers, signal: AbortSignal.timeout(12000) }));
        const items = await response.json();
        if (!stopped) setAssets(items);
      } catch (e) { if (!stopped) setError(String(e)); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [projectId]);
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio.url); }, [audio]);

  async function upload(files: FileList | null) {
    if (!projectId || !files?.length) return;
    const current = epoch.current;
    setUploading(true); setError('');
    try {
      for (const file of Array.from(files)) {
        if (file.size > 60 * 1024 * 1024) throw new Error(`${file.name} dépasse la limite de 60 Mo.`);
        await checked(await fetch(API+projectId+'/assets?filename='+encodeURIComponent(file.name),
          { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: file, signal: AbortSignal.timeout(120000) }));
      }
      const response = await checked(await fetch(API+projectId+'/assets', { headers }));
      const items = await response.json();
      if (current === epoch.current) setAssets(items);
    } catch (e) { if (current === epoch.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (current === epoch.current) { setUploading(false); if (input.current) input.current.value = ''; } }
  }

  async function preview(asset: Asset) {
    const current = epoch.current;
    try {
      const response = await checked(await fetch(API+projectId+'/assets/'+asset.id+'/file', { headers }));
      const blob = await response.blob();
      if (current === epoch.current) setAudio({ id: asset.id, url: URL.createObjectURL(blob) });
    } catch (e) { if (current === epoch.current) setError(String(e)); }
  }

  async function exportProject() {
    try {
      const response = await checked(await fetch(API+projectId+'/export', { headers }));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'dossier-musique.md'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(String(e)); }
  }

  return <section className="mw-files" aria-label="Fichiers du projet">
    <div className="mw-brief-heading"><h2>Vos fichiers</h2><span>Local</span></div>
    <p>Notes, paroles, briefs ou mix à examiner. Les originaux sont conservés.</p>
    <input ref={input} type="file" multiple accept=".pdf,.docx,.txt,.md,.wav,.mp3,.m4a,.flac,.aiff,.aif,.ogg" aria-label="Ajouter des documents ou des fichiers audio" disabled={!projectId || uploading} onChange={e => void upload(e.target.files)} />
    {!projectId && <p>Enregistrez d’abord la fiche du morceau.</p>}
    <small>60 Mo par fichier · audio jusqu’à 15 min · PDF texte, DOCX, TXT, MD · WAV, MP3, M4A, FLAC, AIFF, OGG</small>
    {uploading && <p role="status">Copie sur ce Mac…</p>}
    {error && <p role="alert" className="mw-alert">{error}</p>}
    <div className="mw-assets">{assets.map(asset => <article key={asset.id}>
      <strong>{asset.name}</strong>
      {['queued','running'].includes(asset.status) && <p role="status">{asset.kind === 'audio' ? 'Mesures audio en cours…' : 'Lecture du document…'}</p>}
      {asset.status === 'completed' && asset.kind === 'document' && <p>{asset.analysis.passages} passages · {asset.analysis.coverage}</p>}
      {asset.status === 'completed' && asset.kind === 'audio' && <>
        <dl><div><dt>Durée mesurée</dt><dd>{asset.analysis.duration_seconds?.toLocaleString('fr-FR')} s</dd></div>
          <div><dt>Sonie intégrée</dt><dd>{asset.analysis.integrated_lufs == null ? 'Non mesurable' : `${asset.analysis.integrated_lufs} LUFS`}</dd></div>
          <div><dt>Crête vraie</dt><dd>{asset.analysis.true_peak_dbtp == null ? 'Non mesurable' : `${asset.analysis.true_peak_dbtp} dBTP`}</dd></div></dl>
        <small>Mesures globales FFmpeg. Aucun jugement sur la qualité musicale.</small>
        <button className="mw-text-button" onClick={() => void preview(asset)}>Charger l’écoute locale</button>
        {audio?.id === asset.id && <audio controls src={audio.url}>Lecture audio indisponible.</audio>}
      </>}
      {['failed','cancelled','interrupted'].includes(asset.status) && <p className="mw-alert">{asset.error || 'Import interrompu. Vous pouvez ajouter à nouveau ce fichier.'}</p>}
    </article>)}</div>
    <button className="mw-save" disabled={!projectId} onClick={() => void exportProject()}>Exporter le dossier (.md)</button>
  </section>;
}
