import {WorkflowPanel} from './WorkflowPanel.js';
import {BeamInspector} from './BeamInspector.js';
import type {PreviewConditions} from '../../../packages/core/src/workflow.js';
import {isBeamFlow,boundEmitters,makeFlowLayer,makeStaticFlowStrand,beamBindingChanges} from '../../../packages/core/src/beam-flow.js';
import {EmitterBeamBinding} from './EmitterBeamBinding.js';
import {makeBeamLayer} from '../../../packages/core/src/beam.js';
import type {CompositionSnapshot} from '../../../packages/core/src/composition.js';
import {audioClipGains} from '../../../packages/core/src/audio.js';
import { TrailInspector } from './TrailInspector.js';
import {AudioTimelinePlayer} from './audio-player.js';
import {AudioLibrary,AudioInspector,AudioTimelineRows} from './AudioEditor.js';
import {audioBase64,type AudioAsset} from '../../../packages/core/src/audio.js';
import { PaletteDialog } from './PaletteDialog.js';
import { BINARY_PROFILE_ID, binaryProfile } from '../../../packages/core/src/export-profiles.js';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownToLine, ArrowLeftRight, Box, Check, ChevronDown, Circle, Copy, Eye, EyeOff, FlaskConical, Focus, Grid2X2, History, Layers, LoaderCircle, LockKeyhole, Pause, Play, Plus, RotateCcw, Settings2, Sparkles, Terminal, Trash2, UnlockKeyhole, Upload, X, Zap } from 'lucide-react';
import { DomainError, STUDIO_VERSION, makeDocument, makeLayer, makeMeshLayer, makeTrailLayer, assertDocumentInvariants, applyChanges, promoteDocumentSchema, OPTIONAL_LAYER_FIELDS, type Change, type EffectDocument, type EmitterLayer, type Layer, type LayerValues, type MeshLayer, type Project } from '../../../packages/core/src/model.js';
import { sampleEmitterAppearance } from '../../../packages/core/src/textures.js';
import { Color } from 'three';
import { EffectRenderer } from '../../../packages/renderer/src/index.js';
import { assertPreviewCamera, type PreviewCamera } from '../../../packages/core/src/camera.js';
import { command, write, ApiError } from './api.js';
import { setupStudioWebMCP, type WebMCPSessionGrant, type StudioWebMCPStatus, type StudioViewContext, type StudioViewSetInput } from './webmcp.js';
import { MeshInspector, type MeshEditorDraft } from './MeshInspector.js';
import { ObjImportInspector } from './ObjImportInspector.js';
import { TextureInspector } from './TextureInspector.js';
import { EmitterOrientation } from './EmitterOrientation.js';
import { EmitterFlipbook } from './EmitterFlipbook.js';
import { validateToolInput } from './browser-contracts.js';
import './style.css';

declare global { interface Window {
  studioRender?: (doc: EffectDocument, time: number, camera?: PreviewCamera,conditions?:PreviewConditions) => Promise<void>;
  studioSetComposition?: (snapshot:CompositionSnapshot, camera?:PreviewCamera) => void;
  studioSetDocument?: (doc: EffectDocument, camera?: PreviewCamera,conditions?:PreviewConditions) => void;
  studioRenderFrame?: (time: number) => Promise<void>;
} }
const clone = <T,>(v: T): T => structuredClone(v);
const projectOf = (data: any): Project => data.project || data;
const arrayOf = (data: any, key: string): any[] => Array.isArray(data) ? data : data[key] || data.items || [];
const formatTime = (value: number) => `${value.toFixed(2)} s`;

function Stage({ document, time, solo, grid, light, reset, interactive = true, onCameraChange }: { document: EffectDocument; time: number; solo: string | null; grid: boolean; light: boolean; reset: number; interactive?: boolean; onCameraChange?: (camera: PreviewCamera) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<EffectRenderer | null>(null), latest = useRef({ time, solo });
  latest.current = { time, solo };
  const cameraCallback = useRef(onCameraChange); cameraCallback.current = onCameraChange;
  const [error, setError] = useState('');
  useEffect(() => {
    if (!canvas.current) return;
    let instance: EffectRenderer;
    try { instance = new EffectRenderer(canvas.current, interactive); renderer.current = instance; }
    catch { setError('Nie można uruchomić podglądu WebGL. Sprawdź akcelerację sprzętową przeglądarki.'); return; }
    const observer = new ResizeObserver(entries => { const r = entries[0].contentRect; instance.resize(r.width, r.height); instance.render(latest.current.time, latest.current.solo); });
    observer.observe(canvas.current.parentElement!);
    const rerender = () => { cameraCallback.current?.(instance.getCamera()); instance.render(latest.current.time, latest.current.solo); };
    instance.controls.addEventListener('change', rerender);
    cameraCallback.current?.(instance.getCamera());
    return () => { observer.disconnect(); instance.dispose(); renderer.current = null; };
  }, [interactive]);
  useEffect(() => { renderer.current?.setDocument(document); renderer.current?.render(time, solo); }, [document]);
  useEffect(() => { renderer.current?.render(time, solo); }, [time, solo]);
  useEffect(() => { renderer.current?.setGrid(grid); if(!document.authoring?.preview)renderer.current?.setBackground(light); renderer.current?.render(time, solo); }, [grid, light]);
  useEffect(() => { renderer.current?.resetCamera(); renderer.current?.render(time, solo); }, [reset]);
  return <div className="stage-canvas">{error ? <p className="stage-error" role="alert">{error}</p> : <canvas ref={canvas} aria-label="Podgląd efektu 3D. Przeciągnij, aby obrócić kamerę."/>}</div>;
}

function RenderPage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const renderer = new EffectRenderer(canvas.current!, false); renderer.resize(960, 640);
    window.studioSetDocument = (doc, camera,conditions) => { renderer.resetCamera();renderer.setDocument(doc,conditions);if (camera !== undefined) renderer.setRenderCamera(camera); };
    window.studioSetComposition = (snapshot,camera) => {renderer.resetCamera();if(camera!==undefined)renderer.setRenderCamera(camera);renderer.setComposition(snapshot);};
    window.studioRenderFrame = async time => { renderer.render(time); await new Promise(requestAnimationFrame); };
    window.studioRender = async (doc, time, camera,conditions) => { window.studioSetDocument!(doc,camera,conditions); await window.studioRenderFrame!(time); };
    return () => { renderer.dispose(); delete window.studioRender; delete window.studioSetDocument; delete window.studioSetComposition; delete window.studioRenderFrame; };
  }, []);
  return <canvas ref={canvas} width={960} height={640} style={{ width: 960, height: 640, display: 'block' }}/>;
}

function Slider({ label, value, min, max, step = .01, unit = '', disabled, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; disabled?: boolean; onChange: (n: number) => void }) {
  return <label className={`slider-field ${disabled ? 'locked' : ''}`}><span>{label}{disabled && <LockKeyhole size={12}/>}<output>{Number.isInteger(step) ? value : value.toFixed(2)}{unit}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))}/></label>;
}

function WebMCPConnection({ status, grant, project, busy, dirty, connect, disconnect }: {
  status: StudioWebMCPStatus; grant: Omit<WebMCPSessionGrant, 'token'> | null; project: Project | null;
  busy: boolean; dirty: boolean; connect: () => void; disconnect: () => void;
}) {
  return <div className="webmcp-connection"><h3>WebMCP w tej karcie</h3>
    <p role="status">{status.error ? `Nie udało się udostępnić narzędzi: ${status.error}` : status.available ? `${status.toolCount} narzędzi · ${grant ? 'AI połączone' : 'AI odłączone'}` : 'Ta przeglądarka nie udostępnia API WebMCP. CLI pozostaje dostępne.'}</p>
    {grant ? <><p>Projekt połączenia: <code>{grant.projectId}</code><br/>Ważne do {new Date(grant.expiresAt).toLocaleTimeString('pl-PL')}. Agent ma dostęp także do swoich wariantów.</p><button className="button" disabled={busy} onClick={disconnect}>Odłącz WebMCP</button></>
      : <><p>Udostępnij projekt „{project?.document.name || 'wybierz projekt'}” agentowi w tej karcie. Blokady i przycisk „Wstrzymaj AI” nadal obowiązują.</p><button className="button primary" disabled={busy || dirty || !project || !status.available || !!status.error} onClick={connect}>Udostępnij projekt AI</button>{dirty && <p>Zapisz szkic przed połączeniem agenta.</p>}</>}
  </div>;
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]), [project, setProject] = useState<Project | null>(null);
  const [draft, setDraft] = useState<EffectDocument>(makeDocument()), [selected, setSelected] = useState('sparks');
  const [meshEditorDrafts, setMeshEditorDrafts] = useState<Record<string, MeshEditorDraft>>({});
  const meshEditorDraftsRef = useRef(meshEditorDrafts); meshEditorDraftsRef.current = meshEditorDrafts;
  const pendingMeshEdits = Object.keys(meshEditorDrafts).length > 0;
  const [showWorkflow,setShowWorkflow]=useState(false),[workflowDrafts,setWorkflowDrafts]=useState<Record<string,string>>({});
  const workflowDraftsRef=useRef(workflowDrafts);workflowDraftsRef.current=workflowDrafts;
  const pendingWorkflowEdits=Object.keys(workflowDrafts).length>0;
  const [playing, setPlaying] = useState(true), [time, setTime] = useState(.55), [solo, setSolo] = useState<string | null>(null);
  const [audioPlayer]=useState(()=>new AudioTimelinePlayer()),[monitorMuted,setMonitorMuted]=useState(true),[monitorGain,setMonitorGain]=useState(.15),[loop,setLoop]=useState(true);
  const audioClip=draft.audioClips?.find(c=>c.id===selected);
  useEffect(()=>()=>audioPlayer.close(),[audioPlayer]);
  useEffect(()=>{audioPlayer.monitor(monitorMuted,monitorGain);},[monitorMuted,monitorGain,audioPlayer]);
  useEffect(()=>{setMonitorMuted(true);audioPlayer.monitor(true,.15);setMonitorGain(.15);},[project?.id,audioPlayer]);
  const [grid, setGrid] = useState(true), [light, setLight] = useState(false), [cameraReset, setCameraReset] = useState(0);
  const [useViewCamera, setUseViewCamera] = useState(false), previewCamera = useRef<PreviewCamera | undefined>(undefined);
  const [previewCycles,setPreviewCycles]=useState(1);
  const [binaryExport, setBinaryExport] = useState(false), [binaryAvailable, setBinaryAvailable] = useState(false);
  const [tab, setTab] = useState<'layers' | 'presets'>('layers'), [panel, setPanel] = useState<'parameters' | 'history' | 'jobs'>('parameters');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [paused, setPaused] = useState(false), [remoteRevision, setRemoteRevision] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]), [jobs, setJobs] = useState<any[]>([]), [compare, setCompare] = useState<EffectDocument | null>(null);
  const [showNew, setShowNew] = useState(false), [showCLI, setShowCLI] = useState(false), [review, setReview] = useState('');
  const [showPalette,setShowPalette]=useState(false), paletteDraft=useRef<unknown>(null);
  const [webmcpStatus, setWebmcpStatus] = useState<StudioWebMCPStatus>({ available: false, api: null, toolCount: 0, generation: 0, connected: false });
  const [grantSummary, setGrantSummary] = useState<Omit<WebMCPSessionGrant, 'token'> | null>(null);
  const grantRef = useRef<WebMCPSessionGrant | null>(null), adapterRef = useRef<ReturnType<typeof setupStudioWebMCP> | null>(null);
  const [viewSessionId] = useState(() => crypto.randomUUID()), [seekIntent, setSeekIntent] = useState(0);
  const viewVersion = useRef({ signature: '', revision: 0 });
  const viewState = useRef({ project, draft, selected, time, playing, seekIntent, remoteRevision, grid, light, solo, compare,loop,monitorMuted,monitorGain });
  viewState.current = { project, draft, selected, time, playing, seekIntent, remoteRevision, grid, light, solo, compare,loop,monitorMuted,monitorGain };
  const importFile = useRef<HTMLInputElement>(null), current = useRef({ project, draft }); current.current = { project, draft };
  const saveInFlight = useRef(false);
  const dirty = !!project && (JSON.stringify(project.document) !== JSON.stringify(draft) || pendingMeshEdits || pendingWorkflowEdits);
  const layer = draft.layers.find(l => l.id === selected) || draft.layers[0];
  const total = draft.layers.filter(l => l.enabled).reduce((n, l) => n + (l.type === 'mesh' || l.type === 'trail' || l.type === 'beam' ? 0 : l.count), 0);
  const isLocked = (field: string) => draft.locks.some(l => l.layerId === layer.id && (l.field === field || l.field === '*'));
  const refreshProjects = async () => setProjects(arrayOf(await command('projects.list', { limit: 100 }), 'projects'));
  function resetProjectTransport(document:EffectDocument){
    // Stop the outgoing clock before React commits the incoming project. Its
    // queued frame must never replace time zero with a position from that clock.
    audioPlayer.configure(document,0,false,viewState.current.loop);
    audioPlayer.monitor(true,.15);setMonitorMuted(true);setMonitorGain(.15);
  }
  const loadProject = async (id: string, discardDraft = false) => {
    const before = current.current, pendingBefore = meshEditorDraftsRef.current, workflowBefore = workflowDraftsRef.current;
    const p = projectOf(await command('projects.inspect', { projectId: id }));
    const latest = current.current, pending = meshEditorDraftsRef.current;
    if (latest.project?.id !== before.project?.id) throw new DomainError('VIEW_CONFLICT', 'Projekt w tej karcie zmienił się podczas odczytu. Nawigacja nie została zastosowana.');
    if (latest.project && (Object.keys(pending).length || Object.keys(workflowDraftsRef.current).length || JSON.stringify(latest.project.document) !== JSON.stringify(latest.draft))
      && (!discardDraft || latest.draft !== before.draft || pending !== pendingBefore || workflowDraftsRef.current !== workflowBefore))
      throw new DomainError('DRAFT_CONFLICT', 'Nawigacja została wstrzymana: podczas odczytu projektu pojawiły się edycje człowieka. Szkic pozostał w tej karcie.');
    meshEditorDraftsRef.current = {}; setMeshEditorDrafts({});
    workflowDraftsRef.current = {}; setWorkflowDrafts({}); setShowWorkflow(false);
    const loaded = clone(p.document); current.current = { project: p, draft: loaded };
    resetProjectTransport(loaded);
    setPlaying(!p.document.audioClips?.length); setTime(0); setSeekIntent(v=>v+1); setProject(p); setDraft(loaded); setSelected(p.document.layers[0]?.id); setRemoteRevision(null); setCompare(null);
    const policy = await command('policy.inspect', { projectId: id }); setPaused(!!policy.paused);
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  function inspectView(): StudioViewContext {
    const s = viewState.current;
    // Playback frames advance time but do not invalidate a user's control intent.
    const signature = JSON.stringify([s.project?.id, s.project?.revision, s.draft, s.selected, s.playing, s.seekIntent, s.grid, s.light, s.solo, s.compare,s.loop,s.monitorMuted,s.monitorGain, meshEditorDraftsRef.current,paletteDraft.current,workflowDraftsRef.current]);
    if (signature !== viewVersion.current.signature) { viewVersion.current.signature = signature; viewVersion.current.revision++; }
    return { viewSessionId, projectId: s.project?.id || '', revision: s.project?.revision || 0,
      viewRevision: viewVersion.current.revision, draftDirty: !!s.project && (JSON.stringify(s.project.document) !== JSON.stringify(s.draft) || Object.keys(meshEditorDraftsRef.current).length > 0 || paletteDraft.current!==null || Object.keys(workflowDraftsRef.current).length>0),
      paletteDraft:clone(paletteDraft.current),workflowDrafts:clone(workflowDraftsRef.current),
      meshEditorDrafts: clone(meshEditorDraftsRef.current),
      draft: clone(s.draft), savedDocument: s.project ? clone(s.project.document) : null,
      selectedLayerId: s.draft.layers.some(l => l.id === s.selected)||s.draft.audioClips?.some(c=>c.id===s.selected) ? s.selected : null,
      audioClipGains:{saved:audioClipGains(s.project?.document??null),draft:audioClipGains(s.draft)},
      audioMonitor:{...audioPlayer.status(),muted:s.monitorMuted,gain:s.monitorGain,loop:s.loop},loop:s.loop,
      time: s.time, playing: s.playing, remoteRevision: s.remoteRevision, grid: s.grid, lightBackground: s.light,
      soloLayerId: s.solo, comparisonDocument: s.compare ? clone(s.compare) : null };
  }
  function setView(input: StudioViewSetInput): StudioViewContext {
    const before = inspectView(), s = viewState.current;
    if (input.viewSessionId !== viewSessionId || input.projectId !== before.projectId) throw new DomainError('VIEW_MISMATCH', 'To polecenie dotyczy innej karty lub projektu.');
    if (input.expectedRevision !== before.revision || input.expectedViewRevision !== before.viewRevision) throw new DomainError('VIEW_CONFLICT', 'Kontekst karty zmienił się. Odczytaj go ponownie.');
    if (input.selectedLayerId != null && !s.draft.layers.some(l => l.id === input.selectedLayerId)&&!s.draft.audioClips?.some(c=>c.id===input.selectedLayerId)) throw new DomainError('NOT_FOUND', 'Nie ma takiej warstwy w szkicu.');
    if (input.time !== undefined && (input.time < 0 || input.time > s.draft.duration)) throw new DomainError('INVALID_INPUT', 'Czas wychodzi poza długość efektu.');
    const next = { ...s, selected: input.selectedLayerId === undefined ? s.selected : input.selectedLayerId || '',
      time: input.time ?? s.time, playing: input.playing ?? s.playing,loop:input.loop??s.loop, seekIntent: s.seekIntent + (input.time !== undefined ? 1 : 0) };
    viewState.current = next; setSelected(next.selected); setTime(next.time); setPlaying(next.playing);setLoop(next.loop); setSeekIntent(next.seekIntent);
    return inspectView();
  }
  function openView(p: Project, input: { viewSessionId: string; projectId: string; expectedViewRevision: number }): StudioViewContext {
    const before = inspectView();
    if (input.viewSessionId !== viewSessionId || input.projectId !== p.id) throw new DomainError('VIEW_MISMATCH', 'Nieprawidłowa karta lub projekt.');
    if (input.expectedViewRevision !== before.viewRevision) throw new DomainError('VIEW_CONFLICT', 'Kontekst karty zmienił się podczas odczytu projektu.');
    if (saveInFlight.current) throw new DomainError('SAVE_IN_PROGRESS', 'Trwa zapis człowieka. Zaczekaj na jego wynik.');
    if (before.draftDirty) throw new DomainError('DRAFT_CONFLICT', 'Człowiek ma niezapisany szkic. Zmiana projektu go nie zastąpi.');
    const next = { ...viewState.current, playing:!p.document.audioClips?.length, time:0, seekIntent:viewState.current.seekIntent+1, project: p, draft: clone(p.document), selected: p.document.layers[0]?.id || '', remoteRevision: null, compare: null };
    viewState.current = next; current.current = { project: p, draft: next.draft };
    resetProjectTransport(next.draft);
    setPlaying(next.playing); setTime(0); setSeekIntent(next.seekIntent); setProject(p); setDraft(next.draft); setSelected(next.selected); setRemoteRevision(null); setCompare(null);
    void refreshProjects(); return inspectView();
  }
  async function connectWebMCP() {
    if (!project) return;
    const response = await fetch('/api/webmcp/sessions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewSessionId, projectId: project.id }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Nie udało się połączyć agenta.');
    const granted: WebMCPSessionGrant = result.data || result;
    grantRef.current = granted;
    const { token: _secret, ...summary } = granted; setGrantSummary(summary);
    adapterRef.current?.refreshStatus(); setNotice('AI ma dostęp do tego projektu i własnych wariantów przez tę kartę.');
  }
  async function disconnectWebMCP() {
    const response = await fetch('/api/webmcp/revoke', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewSessionId }) });
    if (!response.ok) throw new Error('Nie udało się odłączyć agenta. Spróbuj ponownie.');
    grantRef.current = null; setGrantSummary(null); adapterRef.current?.refreshStatus(); setNotice('Połączenie WebMCP zostało odłączone.');
  }
  useEffect(() => {
    const adapter = setupStudioWebMCP({ getGrant: () => grantRef.current, view: { inspect: inspectView, set: setView, open: openView }, onStatus: setWebmcpStatus });
    adapterRef.current = adapter;
    return () => { adapter(); adapterRef.current = null; };
  }, []);
  useEffect(() => {
    if (!grantSummary) return;
    const timer = setInterval(async () => {
      const grant = grantRef.current; if (!grant) return;
      try {
        const response = await fetch('/api/webmcp/session', { credentials: 'same-origin', headers: { 'X-NWN-WebMCP-Session': grant.token, 'X-NWN-View-Session': viewSessionId } });
        if (!response.ok && grantRef.current === grant) { grantRef.current = null; setGrantSummary(null); adapterRef.current?.refreshStatus(); }
      } catch { /* A transient connection error does not discard an established grant. */ }
    }, 15000); return () => clearInterval(timer);
  }, [grantSummary]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await fetch('/api/session'); if (!session.ok) throw new Error('Nie udało się połączyć z lokalnym Studio.');
        const capabilities = await command('capabilities');
        if (active) setBinaryAvailable(capabilities.exportProfiles?.some((p: {id:string;available:boolean}) => p.id === BINARY_PROFILE_ID && p.available) ?? false);
        const data = arrayOf(await command('projects.list', { limit: 100 }), 'projects');
        if (!active) return; setProjects(data); if (data[0]) await loadProject(data[0].id);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : String(e)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    try{audioPlayer.configure(draft,time,playing,loop);}catch(e){setError((e as Error).message);setPlaying(false);return;}
    if (!playing) return; let frame = 0, active=true;
    const tick = () => {if(!active||current.current.draft!==draft)return;const t=audioPlayer.position();setTime(t);if(!loop&&t>=draft.duration){setPlaying(false);return;}frame = requestAnimationFrame(tick);};
    frame = requestAnimationFrame(tick); return () => {active=false;cancelAnimationFrame(frame);};
  }, [playing, draft,seekIntent,loop,audioPlayer]);
  useEffect(() => {
    if (!project) return;
    const timer = setInterval(async () => {
      try {
        const p = projectOf(await command('projects.inspect', { projectId: project.id }));
        const state = current.current;
        if (!state.project || state.project.id !== p.id) return;
        if (p.revision !== state.project.revision) {
          if (!saveInFlight.current && !paletteDraft.current && Object.keys(meshEditorDraftsRef.current).length === 0 && JSON.stringify(state.project.document) === JSON.stringify(state.draft)) { setProject(p); setDraft(clone(p.document)); setNotice('Odebrano zmianę z innego klienta.'); }
          else setRemoteRevision(p.revision);
        }
        const policy = await command('policy.inspect', { projectId: p.id });
        if (current.current.project?.id === p.id) setPaused(!!policy.paused);
      } catch { /* The explicit save/load path surfaces connection errors. */ }
    }, 1800); return () => clearInterval(timer);
  }, [project?.id]);
  useEffect(() => {
    if (!project || panel === 'parameters') return;
    const refresh = async () => {
      try { if (panel === 'history') setHistory(arrayOf(await command('revisions.list', { projectId: project.id, limit: 50 }), 'revisions'));
      else setJobs(arrayOf(await command('jobs.list', { projectId: project.id, limit: 30 }), 'jobs')); } catch (e) { setError(String(e)); }
    }; void refresh(); const interval = setInterval(refresh, 2000); return () => clearInterval(interval);
  }, [panel, project?.id, project?.revision]);
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timeout); }, [notice]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);

  function patchLayer(values: LayerValues) {
    const next = applyChanges(draft, [{ type: 'layer.set', layerId: layer.id, values }], true);
    if (Object.keys(values).some(field => ['texture', 'blend', 'midColor', 'midAlpha', 'midSize', 'midPercent', 'orientation', 'flipbook', 'beamBinding'].includes(field))) {
      validateToolInput('studio.changes.apply', { viewSessionId: 'local-ui', input: { projectId: project?.id || 'local-ui', expectedRevision: project?.revision || 1,
        changes: [{ type: 'layer.set', layerId: layer.id, values }] }, idempotencyKey: 'local-ui-validation' });
      assertDocumentInvariants(next);
    }
    setDraft(next);
  }
  function setEffectDuration(duration: number) {
    if (!Number.isFinite(duration) || duration < .1 || duration > 30) return;
    try {
      const factor=duration/draft.duration;
      const changes:Change[]=[{type:'project.set',values:{duration}}];
      if(draft.lifecycle==='duration')for(const l of draft.layers)if(l.type==='mesh')changes.push({type:'layer.set',layerId:l.id,values:{start:l.start*factor,duration:l.duration*factor,animation:Object.fromEntries(Object.entries(l.animation).map(([k,keys])=>[k,keys.map((key:{time:number;value:unknown})=>({...key,time:key.time*factor}))]))}});
      const next=applyChanges(draft,changes,true);assertDocumentInvariants(next);setDraft(next);setPreviewCycles(1);setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  function patchMeshLayer(values: LayerValues) {
    if (layer.type !== 'mesh' && layer.type !== 'trail' && layer.type !== 'beam') return;
    validateToolInput('studio.changes.apply', { viewSessionId: 'local-ui', input: { projectId: project?.id || 'local-ui', expectedRevision: project?.revision || 1,
      changes: [{ type: 'layer.set', layerId: layer.id, values }] }, idempotencyKey: 'local-ui-validation' });
    const next = applyChanges(draft, [{ type: 'layer.set', layerId: layer.id, values }], true);
    assertDocumentInvariants(next); setDraft(next);
  }
  function updateMeshEditorDraft(layerId: string, entry: MeshEditorDraft) {
    const next = { ...meshEditorDraftsRef.current };
    if (Object.keys(entry).length) next[layerId] = entry; else delete next[layerId];
    meshEditorDraftsRef.current = next; setMeshEditorDrafts(next);
  }
  function applyObjToDraft(changes: Change[]) {
    validateToolInput('studio.changes.apply', { viewSessionId: 'local-ui', input: { projectId: project?.id || 'local-ui', expectedRevision: project?.revision || 1,
      changes }, idempotencyKey: 'local-ui-validation' });
    const next = applyChanges(draft, changes, true);
    assertDocumentInvariants(next); setDraft(next);
  }
  function addMesh() {
    const mesh = makeMeshLayer(crypto.randomUUID(), `Geometria ${draft.layers.length + 1}`);
    mesh.duration = Math.min(mesh.duration, draft.duration);
    setDraft(document => applyChanges(document, [{ type: 'layer.add', layer: mesh }], true)); setSelected(mesh.id); setPanel('parameters');
  }
  function patchBeamBinding(values:LayerValues) {
    applyObjToDraft(beamBindingChanges(draft,layer.id,values.beamBinding!));
  }
  function addFlow(role:'flow'|'source'|'target') {
    const l=makeFlowLayer(crypto.randomUUID(),draft.duration),first=boundEmitters(draft)[0];
    l.beamBinding={...l.beamBinding!,...first?.beamBinding,role};
    if(role!=='flow'){l.name=role==='source'?'Końcówka źródła':'Końcówka celu';delete l.beamBinding.pulse;l.beamBinding.node=role==='source'?'impact':'handconjure';l.life=Math.min(.35,draft.duration/3);l.duration=draft.duration-l.life;l.count=24;l.beamBinding.role=role;}
    applyObjToDraft([{type:'layer.add',layer:l}]);setSelected(l.id);setPanel('parameters');
  }
  async function create(preset: string) {
    if(preset==='flow'){
      let p=projectOf(await write('projects.create',{preset:'empty',lifecycle:'beam',name:'Nowy strumień cząstek'}));
      p=projectOf(await write('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'project.set',values:{duration:3.6}},{type:'layer.remove',layerId:'beam'},{type:'layer.add',layer:makeFlowLayer('flow')}]}));
      setProject(p);setDraft(clone(p.document));setSelected('flow');setShowNew(false);setTab('layers');await refreshProjects();return;
    }
    const p = projectOf(await write('projects.create', ['duration','beam'].includes(preset)?{preset:'empty',lifecycle:preset}:{ preset })); setProject(p); setDraft(clone(p.document)); setSelected(p.document.layers[0].id); setShowNew(false); setTab('layers'); await refreshProjects();
  }
  function proposedChanges(): Change[] {
    if (!project) return [];
    const before = project.document, changes: Change[] = [];
    for(const clip of before.audioClips??[])if(!draft.audioClips?.some(c=>c.id===clip.id))changes.push({type:'audio.remove',clipId:clip.id});
    for(const clip of draft.audioClips??[]){
      const old=before.audioClips?.find(c=>c.id===clip.id);
      if(!old)changes.push({type:'audio.add',clip});
      else{const values=Object.fromEntries(Object.entries(clip).filter(([k,v])=>!['id','type'].includes(k)&&v!==(old as any)[k]));if(Object.keys(values).length)changes.push({type:'audio.set',clipId:clip.id,values});}
    }
    for (const old of before.layers) if (!draft.layers.some(l => l.id === old.id)) changes.push({ type: 'layer.remove', layerId: old.id });
    for (const l of draft.layers) {
      const old = before.layers.find(a => a.id === l.id);
      if (!old) changes.push({ type: 'layer.add', layer: l });
      else {
        const values = Object.fromEntries(Object.entries(l).filter(([key, value]) => !['id', 'type'].includes(key) && JSON.stringify(value) !== JSON.stringify((old as any)[key])));
        for (const key of OPTIONAL_LAYER_FIELDS) if (Object.hasOwn(old, key) && !Object.hasOwn(l, key)) values[key] = null;
        if (Object.keys(values).length) changes.push({ type: 'layer.set', layerId: l.id, values });
      }
    }
    const projectValues = Object.fromEntries((['name', 'duration', 'seed', 'orientWithObject', 'lifecycle'] as const).filter(k => draft[k] !== before[k]).map(k => [k, draft[k]]));
    if (Object.keys(projectValues).length) changes.push({ type: 'project.set', values: projectValues });
    if (JSON.stringify(draft.locks) !== JSON.stringify(before.locks)) {
      const retained = before.locks.filter(lock => draft.locks.some(l => l.layerId === lock.layerId && l.field === lock.field));
      if (JSON.stringify(retained) !== JSON.stringify(before.locks)) changes.unshift({ type: 'locks.set', locks: retained });
      if (JSON.stringify(retained) !== JSON.stringify(draft.locks)) changes.push({ type: 'locks.set', locks: draft.locks });
    }
    return changes;
  }
  async function save() {
    if (!project || !dirty || saveInFlight.current || Object.keys(meshEditorDraftsRef.current).length > 0 || Object.keys(workflowDraftsRef.current).length > 0) return;
    const submitted = clone(draft), projectId = project.id;
    saveInFlight.current = true;
    try {
      const p = projectOf(await write('changes.apply', { projectId, expectedRevision: project.revision, changes: proposedChanges() }));
      const latest = current.current;
      if (latest.project?.id !== projectId || latest.project.revision > p.revision) return;
      // Protect even a later edit reverting to the old baseline, including from
      // the polling client while this committed response is still in flight.
      const retainedDraft = JSON.stringify(latest.draft) === JSON.stringify(submitted) ? clone(p.document) : latest.draft;
      const hasLaterEdits = JSON.stringify(retainedDraft) !== JSON.stringify(p.document) || Object.keys(meshEditorDraftsRef.current).length > 0;
      current.current = { project: p, draft: retainedDraft };
      setProject(p); setDraft(latestDraft => JSON.stringify(latestDraft) === JSON.stringify(submitted) ? clone(p.document) : latestDraft);
      setRemoteRevision(r => r !== null && r > p.revision ? r : null);
      setNotice(`Zapisano rewizję ${p.revision}.` + (hasLaterEdits ? ' Późniejsze edycje pozostają w szkicu.' : '')); await refreshProjects();
    } finally { saveInFlight.current = false; }
  }
  async function fork() {
    if (!project) return;
    const p = projectOf(await write('projects.fork', { projectId: project.id, revision: project.revision, name: `${project.document.name} · wariant` }));
    setCompare(clone(project.document)); setProject(p); setDraft(clone(p.document)); await refreshProjects(); setNotice('Wariant utworzony. Możesz go teraz zmieniać.');
  }
  async function commitPalette(input:Record<string,unknown>,key:string) {
    const before=current.current;
    if(!before.project||saveInFlight.current||before.project.id!==input.projectId||before.project.revision!==input.expectedRevision
      ||Object.keys(meshEditorDraftsRef.current).length||JSON.stringify(before.project.document)!==JSON.stringify(before.draft))
      throw new DomainError('DRAFT_CONFLICT','Projekt lub szkic zmienił się. Zamknij paletę i wykonaj nowy podgląd.');
    saveInFlight.current=true;
    try{
      const result=await command('palette.apply',input,key),p=projectOf(result);
      current.current={project:p,draft:clone(p.document)};setProject(p);setDraft(clone(p.document));setRemoteRevision(null);
      setNotice(`Paleta zapisana · rewizja ${p.revision}. Cofnięcie jest dostępne w historii.`);await refreshProjects();
    }finally{saveInFlight.current=false;}
  }
  async function enqueue(operation: string, extra: Record<string, unknown> = {}) {
    if (!project) return;
    if (operation === 'candidate.build' && binaryExport) extra = {...extra, profileId: binaryProfile(project?.document.lifecycle)};
    if(operation==='preview.request'&&['duration','beam'].includes(project?.document.lifecycle??''))extra={...extra,cycles:previewCycles};
    if (operation === 'preview.request' && useViewCamera) {
      const camera = clone(previewCamera.current); assertPreviewCamera(camera);
      extra = { ...extra, camera };
    }
    const data = await write(operation, { projectId: project.id, revision: project.revision, ...extra });
    if (data.artifact) {
      const anchor = document.createElement('a'); anchor.href = `/api/artifacts/${data.artifact.id || data.artifact.artifactId}`; anchor.download = data.artifact.name || 'studio-project.zip'; anchor.click(); setNotice('Projekt przygotowany do pobrania.');
    } else { setPanel('jobs'); setNotice('Zadanie przyjęte. Wynik pojawi się w zakładce Zadania.'); }
  }
  async function importProject(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
    const input = file.name.toLowerCase().endsWith('.json') ? { document: JSON.parse(new TextDecoder().decode(bytes)) } : { bundleBase64: btoa(binary) };
    const p = projectOf(await write('projects.import', input)); setProject(p); setDraft(clone(p.document)); setSelected(p.document.layers[0].id); await refreshProjects();
  }
  async function importTexture(file: File, targetSize?: 512 | 1024) {
    const state = current.current;
    if (!state.project || saveInFlight.current) throw new Error('Zaczekaj na zakończenie zapisu.');
    if (Object.keys(meshEditorDraftsRef.current).length || JSON.stringify(state.project.document) !== JSON.stringify(state.draft))
      throw new Error('Zapisz szkic i zastosuj edycje JSON przed importem tekstury.');
    const inputLimitMiB = targetSize ? 8 : 2;
    if (file.size > inputLimitMiB * 1024 * 1024) throw new Error(`Tekstura przekracza limit wejścia ${inputLimitMiB} MiB.`);
    const submitted = clone(state.draft), projectId = state.project.id, expectedRevision = state.project.revision;
    saveInFlight.current = true;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()), chunks: string[] = [];
      for (let offset = 0; offset < bytes.length; offset += 32768) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
      const result = await write('assets.import', { projectId, expectedRevision, fileName: file.name, pngBase64: btoa(chunks.join('')), ...(targetSize ? { targetSize } : {}) });
      const p = projectOf(result), latest = current.current;
      if (latest.project?.id !== projectId || latest.project.revision > p.revision) return;
      // Import changes only immutable assets/schema. Edits made after upload
      // began remain on top of that revision, including pending geometry JSON.
      const rebase = (document: EffectDocument): EffectDocument => JSON.stringify(document) === JSON.stringify(submitted)
        ? clone(p.document) : promoteDocumentSchema({ ...document,
          schemaVersion: Math.max(document.schemaVersion, p.document.schemaVersion) as EffectDocument['schemaVersion'], assets: clone(p.document.assets || []) });
      const retainedDraft = rebase(latest.draft);
      const laterEdits = JSON.stringify(retainedDraft) !== JSON.stringify(p.document) || Object.keys(meshEditorDraftsRef.current).length > 0;
      current.current = { project: p, draft: retainedDraft };
      setProject(p); setDraft(rebase); setRemoteRevision(revision => revision !== null && revision > p.revision ? revision : null);
      setNotice(`Tekstura zaimportowana · rewizja ${p.revision}.` + (laterEdits ? ' Późniejsze edycje pozostają w szkicu.' : ' Wybierz ją dla warstwy.'));
      await refreshProjects();
    } finally { saveInFlight.current = false; }
  }
  const disablePersist = busy || !project;
  function applyAudio(changes:Change[]){
    validateToolInput('studio.changes.apply',{viewSessionId,input:{projectId:project!.id,expectedRevision:project!.revision,changes},idempotencyKey:'audio-draft-validation'});
    const next=applyChanges(current.current.draft,changes,true);assertDocumentInvariants(next);
    setDraft(next);
  }
  async function mutateAudioAsset(operation:'audio.import'|'audio.remove',fileOrAsset:File|AudioAsset){
    const before=current.current;
    if(!before.project||saveInFlight.current||JSON.stringify(before.draft)!==JSON.stringify(before.project.document)||Object.keys(meshEditorDraftsRef.current).length)throw new Error('Zapisz szkic i zastosuj edycje przed zmianą biblioteki audio.');
    setPlaying(false);saveInFlight.current=true;
    try{
      const input:Record<string,unknown>={projectId:before.project.id,expectedRevision:before.project.revision};
      if(operation==='audio.import'){const file=fileOrAsset as File;if(file.size>2097152)throw new Error('Audio przekracza 2 MiB.');input.fileName=file.name;input.dataBase64=audioBase64(new Uint8Array(await file.arrayBuffer()));}
      else input.assetIds=[(fileOrAsset as AudioAsset).id];
      const p=projectOf(await write(operation,input)),latest=current.current;
      if(latest.project?.id!==before.project.id||latest.project.revision>p.revision)return;
      const rebase=(d:EffectDocument)=>JSON.stringify(d)===JSON.stringify(before.draft)?clone(p.document):promoteDocumentSchema({...d,audioAssets:clone(p.document.audioAssets??[])});
      const retained=rebase(latest.draft);current.current={project:p,draft:retained};setProject(p);setDraft(rebase);await refreshProjects();
      setNotice('Biblioteka audio zapisana. Odsłuch uruchom przyciskiem Play.');
    }finally{saveInFlight.current=false;}
  }
  const textureImportBlocked = !project ? 'Najpierw utwórz projekt.' : busy ? 'Zaczekaj na zakończenie zapisu.'
    : pendingMeshEdits ? 'Zastosuj albo odrzuć edycje parametrów, a następnie zapisz szkic przed importem.'
    : dirty ? 'Zapisz szkic przed importem — import tworzy nową rewizję.' : '';
  const middle = layer.type === 'mesh' || layer.type === 'trail' || layer.type === 'beam' ? null : sampleEmitterAppearance(layer, layer.midPercent ?? .5);
  const middleColor = middle ? '#' + new Color().setRGB(...middle.color).getHexString() : '#ffffff';
  return <div className="studio">
    {showWorkflow&&project&&<WorkflowPanel project={project} selected={selected} editorDirty={JSON.stringify(project.document)!==JSON.stringify(draft)||pendingMeshEdits} drafts={workflowDrafts}
      onDrafts={v=>{workflowDraftsRef.current=v;setWorkflowDrafts(v);}} onClose={()=>setShowWorkflow(false)}
      onSeek={value=>{setPlaying(false);setTime(value);setSeekIntent(v=>v+1);}}
      onCommit={async revision=>{const before=current.current;const p=projectOf(await command('projects.inspect',{projectId:project.id,revision}));
        if(current.current.project?.id!==p.id||current.current.draft!==before.draft||Object.keys(meshEditorDraftsRef.current).length||JSON.stringify(before.project?.document)!==JSON.stringify(before.draft))throw new DomainError('DRAFT_CONFLICT','Zapisano zmianę, ale nowy szkic człowieka został zachowany. Odczytaj konflikt przed kolejnym zapisem.');
        const document=clone(p.document);current.current={project:p,draft:document};setProject(p);setDraft(document);await refreshProjects();}}/>}

    {showPalette&&project&&<PaletteDialog project={project} selectedLayerId={selected}
      onPending={value=>{paletteDraft.current=value;}} onClose={()=>{paletteDraft.current=null;setShowPalette(false);}}
      onCommit={commitPalette} renderPreview={(before,after)=><><div><span>A · zapisany efekt</span><Stage document={before} time={time} solo={null} grid={grid} light={light} reset={0}/></div><div><span>B · nowa paleta</span><Stage document={after} time={time} solo={null} grid={grid} light={light} reset={0}/></div></>}/>} 
    <header className="topbar"><button className="button" disabled={!project||busy} onClick={()=>setShowWorkflow(true)}>Praca nad iteracją</button><a className="brand" href="/"><span className="brand-icon"><Sparkles size={21}/></span><strong>NWN <span>VFX STUDIO</span></strong><span className="version">{STUDIO_VERSION}</span></a><div className="top-center"><span className="connection-dot"/>Lokalna przestrzeń pracy</div><button className="button subtle" onClick={() => setShowCLI(true)}><Terminal size={16}/><span>Połącz agenta</span></button></header>
    <div className="projectbar"><div className="project-picker"><Layers size={17}/><select aria-label="Projekt" value={project?.id || ''} disabled={dirty || busy} onChange={e => void run(() => loadProject(e.target.value))}><option value="" disabled>Wybierz projekt</option>{projects.map(p => <option key={p.id} value={p.id}>{p.document?.name || (p as any).name || p.id}</option>)}</select><span className={`revision ${dirty ? 'unsaved' : ''}`}>{dirty ? 'Niezapisane zmiany' : project ? `rewizja ${project.revision}` : 'Nowy projekt'}</span></div><div className="project-actions"><button className="button" disabled={disablePersist || dirty} onClick={() => { paletteDraft.current={opening:true}; setShowPalette(true); }}>Paleta efektu</button><button className="button" disabled={busy || dirty} onClick={() => setShowNew(true)}><Plus size={15}/>Nowy</button><button className="icon-button" title="Importuj projekt Studio" aria-label="Importuj projekt Studio" disabled={busy || dirty} onClick={() => importFile.current?.click()}><Upload size={16}/></button><input ref={importFile} hidden type="file" accept=".zip,.json" onChange={e => { const file = e.target.files?.[0]; if (file) void run(() => importProject(file)); e.target.value = ''; }}/><span className="separator"/><button className="button" disabled={disablePersist || dirty} onClick={() => void run(fork)}><Copy size={15}/>Wariant</button><button className="button primary" disabled={disablePersist || !dirty || pendingMeshEdits} onClick={() => void run(save)}>{busy ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>}Zapisz</button></div></div>
    {(error || remoteRevision) && <div className="alert" role="alert"><span>{error || `Projekt ma już rewizję ${remoteRevision}. Twoja propozycja została zachowana. Wczytaj stan, zanim przygotujesz nową zmianę.`}</span>{remoteRevision && <button onClick={() => void run(() => loadProject(project!.id, true))}>Odrzuć propozycję i wczytaj</button>}<button aria-label="Zamknij komunikat" onClick={() => setError('')}><X size={15}/></button></div>}
    {pendingMeshEdits && <div className="mesh-pending-banner" role="status"><span>{Object.values(meshEditorDrafts).some(entry => entry.orientation || entry.obj) ? 'Edytory warstw zawierają niezastosowane zmiany.' : 'Panel warstwy zawiera niezastosowane zmiany.'} Zastosuj je albo odrzuć przed zapisaniem projektu.</span><div>{Object.keys(meshEditorDrafts).map(id => <button key={id} onClick={() => { setSelected(id); setPanel('parameters'); }}>Otwórz: {draft.layers.find(item => item.id === id)?.name || id}</button>)}</div></div>}
    {pendingWorkflowEdits&&<div className="mesh-pending-banner" role="status"><span>Formularz iteracji zawiera zachowane pola. Otwórz go, aby zastosować zmiany lub wyczyścić formularz.</span><button onClick={()=>setShowWorkflow(true)}>Otwórz iterację</button></div>}
    <main className="workspace">
      <aside className="left-panel"><div className="panel-tabs"><button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}><Layers size={15}/>Warstwy</button><button className={tab === 'presets' ? 'active' : ''} onClick={() => setTab('presets')}>Presety</button></div>
        {tab === 'layers' ? <><div className="panel-heading"><span>KOMPOZYCJA</span><span>{draft.layers.length} warstwy</span></div><div className="layer-list">{draft.layers.map(l => <div key={l.id} className={`layer-row ${selected === l.id ? 'selected' : ''}`}><button className="layer-select" onClick={() => setSelected(l.id)}><span className={`layer-glyph ${l.type === 'mesh' ? 'mesh' : l.texture}`} style={{ color: l.color }}>{l.type === 'mesh' ? <Box size={17}/> : l.texture === 'spark' ? <Zap size={17}/> : l.texture === 'smoke' ? <Activity size={17}/> : <Circle size={17}/>}</span><span><strong>{l.name}</strong><small>{l.type === 'mesh' ? `${l.geometry.kind === 'box' ? 'Prostopadłościan' : l.geometry.kind === 'ring' ? 'Pierścień' : 'Własna siatka'}${meshEditorDrafts[l.id] ? ' · JSON*' : ''}` : l.type === 'trail' ? 'Świetlny ślad' : l.type === 'beam' ? 'Beam · dwa punkty' : `${l.texture === 'spark' ? 'Cząstki' : l.texture === 'smoke' ? 'Dym' : 'Błysk'} · ${l.count}`}</small></span></button><button className="icon-button layer-visibility" aria-label={`${l.enabled ? 'Ukryj' : 'Pokaż'} ${l.name}`} disabled={!project || draft.locks.some(lock => lock.layerId === l.id && (lock.field === '*' || lock.field === 'enabled'))} onClick={() => setDraft(d => ({ ...d, layers: d.layers.map(a => a.id === l.id ? { ...a, enabled: !a.enabled } : a) }))}>{l.enabled ? <Eye size={14}/> : <EyeOff size={14}/>}</button></div>)}</div><div className="add-layer-actions"><button className="add-layer" disabled={disablePersist || draft.lifecycle==='beam' || draft.layers.length >= 32} onClick={() => { const l = makeLayer(crypto.randomUUID(), `Iskry ${draft.layers.length + 1}`); setDraft(d => ({ ...d, layers: [...d.layers, l] })); setSelected(l.id); }}><Plus size={15}/>Dodaj emiter</button><button className="add-layer" disabled={disablePersist || draft.lifecycle==='beam' || draft.layers.length >= 32} onClick={addMesh}><Box size={15}/>Dodaj geometrię</button><button className="add-layer" disabled={disablePersist || draft.lifecycle==='beam' || draft.layers.length >= 32} onClick={() => {const trail=makeTrailLayer(crypto.randomUUID(),`Smuga ${draft.layers.length+1}`,draft.duration); applyObjToDraft([{type:'layer.add',layer:trail}]);setSelected(trail.id);setPanel('parameters');}}><Sparkles size={15}/>Dodaj smugę</button><button className="add-layer" disabled={disablePersist||pendingMeshEdits||draft.lifecycle!=='beam'||draft.layers.length>=32||(isBeamFlow(draft)?draft.layers.filter(l=>l.type==='beam'&&l.enabled).length>=4||draft.layers.filter(l=>l.type==='beam').length>=8:draft.layers.filter(l=>l.type==='beam').length>=8)} onClick={()=>{const beam=isBeamFlow(draft)?{...makeStaticFlowStrand(draft,crypto.randomUUID()),texture:'beam-soft' as const}:makeBeamLayer(crypto.randomUUID());applyObjToDraft([{type:'layer.add',layer:beam}]);setSelected(beam.id);setPanel('parameters');}}><Plus size={15}/>{isBeamFlow(draft)?'Dodaj statyczną nitkę':'Dodaj beam'}</button>{isBeamFlow(draft)&&<><button className="add-layer" disabled={disablePersist||boundEmitters(draft).length>=8} onClick={()=>addFlow('flow')}>Dodaj strumień cząstek</button><button className="add-layer" disabled={disablePersist||boundEmitters(draft).length>=8} onClick={()=>addFlow('source')}>Dodaj końcówkę źródła</button><button className="add-layer" disabled={disablePersist||boundEmitters(draft).length>=8} onClick={()=>addFlow('target')}>Dodaj końcówkę celu</button></>}</div></>
        : <div className="preset-list"><p>Rozpocznij nową kompozycję.</p><button disabled={busy || dirty} onClick={() => void run(() => create('coil'))}><Zap size={24}/><strong>Przeciążenie cewki</strong><span>Iskry · błysk · dym</span></button><button disabled={busy || dirty} onClick={() => void run(() => create('vial'))}><FlaskConical size={24}/><strong>Fiolka alchemiczna</strong><span>Drobiny · zielona mgiełka</span></button></div>}
        <AudioLibrary document={draft} disabled={disablePersist||dirty} onImport={file=>void run(()=>mutateAudioAsset('audio.import',file))} onRemove={asset=>void run(()=>mutateAudioAsset('audio.remove',asset))} onAdd={asset=>{const length=Math.min(asset.duration,draft.duration),id=crypto.randomUUID();applyAudio([{type:'audio.add',clip:{id,type:'audio',name:asset.name,assetId:asset.id,enabled:true,start:Math.max(0,Math.min(time,draft.duration-length)),duration:length,offset:0,gain:1,fadeIn:0,fadeOut:0}}]);setSelected(id);setPanel('parameters');}}/>
        <div className="left-footer"><div className="section-label">WSPÓŁPRACA</div><button className={`ai-control ${paused ? 'is-paused' : ''}`} disabled={disablePersist} onClick={() => void run(async () => { await write('policy.set', { projectId: project!.id, paused: !paused }); setPaused(p => !p); })}>{paused ? <LockKeyhole size={17}/> : <Terminal size={17}/>}<span><strong>{paused ? 'Zapisy AI wstrzymane' : 'Zapisy AI dozwolone'}</strong><small>{paused ? 'Kliknij, aby wznowić' : 'Kliknij, aby wstrzymać'}</small></span><span className={`tiny-dot ${paused ? 'amber' : ''}`}/></button><div className="profile-note"><span className="tiny-dot amber"/><span>Profil NWN:EE<br/><small>Zgodność z grą do sprawdzenia</small></span></div></div>
      </aside>
      <section className="center-panel"><div className="viewport-top"><div><span className="eyebrow">PODGLĄD</span><h1>{draft.name}</h1></div><div className="viewport-tools"><button className={`icon-button ${grid ? 'on' : ''}`} title="Siatka i skala postaci" aria-label="Siatka i skala postaci" onClick={() => setGrid(v => !v)}><Grid2X2 size={16}/></button><button className={`icon-button ${light ? 'on' : ''}`} title="Zmień tło" aria-label="Zmień tło" onClick={() => setLight(v => !v)}><Circle size={16}/></button><button className="icon-button" title="Ustaw kamerę początkową" aria-label="Ustaw kamerę początkową" onClick={() => setCameraReset(n => n + 1)}><Focus size={17}/></button></div></div>
        <div className={`viewports ${compare ? 'comparing' : ''}`}><div className="viewport"><Stage document={draft} time={time} solo={solo} grid={grid} light={light} reset={cameraReset} onCameraChange={camera => { previewCamera.current = camera; }}/><div className="viewport-corner"><span className="live-label"><span/>{playing ? 'ODTWARZANIE' : 'PAUZA'}</span><span>Perspektywa · skala w metrach</span></div><div className="viewport-bottom"><span>{total} cząstek · {draft.layers.filter(l => l.enabled).length} aktywne warstwy</span><span>{compare ? 'B · bieżący wariant' : 'Przeciągnij, aby obrócić · scroll, aby przybliżyć'}</span></div></div>{compare && <div className="viewport"><Stage document={compare} time={time} solo={null} grid={grid} light={light} reset={cameraReset}/><div className="viewport-corner"><span>A · {compare.name}</span><button className="icon-button" aria-label="Zamknij porównanie" onClick={() => setCompare(null)}><X size={16}/></button></div></div>}
          {!project && !loading && <div className="empty-overlay"><span className="empty-spark"><Sparkles size={26}/></span><h2>Stwórz swój pierwszy efekt</h2><p>Zacznij od emitera lub gotowej kompozycji.</p><div><button className="button primary" disabled={busy} onClick={() => void run(() => create('coil'))}><Zap size={16}/>Przeciążenie cewki</button><button className="button" disabled={busy} onClick={() => void run(() => create('empty'))}>Pusty projekt</button></div></div>}
          {loading && <div className="empty-overlay"><LoaderCircle className="spin"/><p>Łączenie ze Studio…</p></div>}
        </div>
        <div className="preview-disclaimer"><span className="tiny-dot amber"/>Podgląd roboczy. Zachowanie cząstek wymaga porównania w NWN.<button className="text-button" disabled={!project || dirty} onClick={() => setCompare(compare ? null : clone(project!.document))}><ArrowLeftRight size={14}/>Porównaj A/B</button></div>
        <div className="timeline"><div className="transport"><div><button className="icon-button" aria-label="Początek efektu" onClick={() => {setTime(0);setSeekIntent(v=>v+1);}}><RotateCcw size={16}/></button><button className="play-button" aria-label={playing ? 'Zatrzymaj' : 'Odtwórz'} onClick={() => {if(playing){setPlaying(false);return;}if(time>=draft.duration){setTime(0);setSeekIntent(v=>v+1);}void audioPlayer.unlock().catch(e=>setError(e.message));setPlaying(true);}}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button><button aria-label="Stop" className="icon-button" onClick={()=>{setPlaying(false);setTime(0);setSeekIntent(v=>v+1);}}>■</button><output>{formatTime(time)}</output><span>/ {formatTime(draft.duration)}</span></div><label>{draft.lifecycle==='duration'?'Pętla — rozciągnij klucze':draft.lifecycle==='beam'?'Okno podglądu':'Czas efektu'}<input aria-label={draft.lifecycle==='duration'?'Długość pętli — rozciąga klucze':draft.lifecycle==='beam'?'Okno podglądu beama':'Czas efektu'} type="number" min={.1} max={30} step={.1} value={draft.duration} disabled={!project} onChange={e => setEffectDuration(e.target.valueAsNumber)}/><span>s</span></label></div><div className="audio-monitor"><label><input aria-label="Zapętl podgląd" type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/>Pętla</label><button aria-label={monitorMuted?'Włącz odsłuch audio':'Wycisz odsłuch audio'} onClick={()=>{void audioPlayer.unlock().then(()=>setMonitorMuted(v=>!v)).catch(e=>setError(e.message));}}>{monitorMuted?'Odsłuch wyciszony':'Odsłuch włączony'}</button><label>Głośność odsłuchu<input aria-label="Głośność odsłuchu" aria-describedby="audio-monitor-help" type="range" min={0} max={1} step={.01} value={monitorGain} onChange={e=>setMonitorGain(Number(e.target.value))}/></label><small id="audio-monitor-help" className="audio-monitor-help">Lokalny odsłuch · nie wpływa na eksport. Głośność efektu ustaw w wybranym klipie.</small></div><div className="timeline-track"><div className="ruler">{Array.from({ length: 7 }, (_, i) => <span key={i}>{(i * draft.duration / 6).toFixed(1)}</span>)}</div><input className="scrubber" aria-label="Czas podglądu" type="range" min={0} max={draft.duration} step={.01} value={time} onChange={e => { setTime(Number(e.target.value)); setSeekIntent(v => v + 1); }}/><div className="playhead" style={{ left: `${time / draft.duration * 100}%` }}/>{draft.layers.map(l => <button className="timeline-row" key={l.id} onClick={() => setSelected(l.id)} aria-label={`Zaznacz na osi czasu: ${l.name}`}><span className="timeline-segment" style={{ left: `${Math.min(100, (l.type==='beam'?0:l.start) / draft.duration * 100)}%`, width: `${Math.min(100 - (l.type==='beam'?0:l.start) / draft.duration * 100, (l.type === 'beam'?draft.duration:l.type === 'mesh' || l.type === 'trail' ? l.duration : l.life + (l.update === 'Fountain' ? l.duration : 0)) / draft.duration * 100)}%`, background: l.color, opacity: l.enabled ? .65 : .18 }}><span>{l.name}</span></span></button>)}<AudioTimelineRows document={draft} selected={selected} disabled={disablePersist||pendingMeshEdits} onSelect={id=>{setSelected(id);setPanel('parameters');}} onMove={(clipId,start)=>{try{applyAudio([{type:'audio.set',clipId,values:{start}}]);}catch(e){setError((e as Error).message);}}}/></div></div>
        <div className="export-bar"><label className="render-camera-toggle" title="Eksperymentalna kompilacja MDL; wynik wymaga testu w NWN"><input aria-label="Binarny eksport NWN" type="checkbox" checked={binaryExport} disabled={!binaryAvailable} onChange={e => setBinaryExport(e.target.checked)}/> Binarny MDL (eksperymentalny)</label><label className="render-camera-toggle"><input type="checkbox" checked={useViewCamera} onChange={e => setUseViewCamera(e.target.checked)}/> Kadr z podglądu</label><span><span className="tiny-dot"/> {dirty ? 'Eksport użyje ostatniego zapisu. Zapisz zmiany, aby je uwzględnić.' : 'Projekt i eksport korzystają z tej samej rewizji.'}</span><div><button className="button" disabled={disablePersist || dirty} onClick={() => void run(() => enqueue('preview.request', { time, format: 'png' }))}>Zapisz kadr</button><button className="button export" disabled={disablePersist || dirty} onClick={() => void run(() => enqueue('candidate.build'))}><ArrowDownToLine size={16}/>Eksport NWN</button></div></div>
      </section>
      <aside className="right-panel"><div className="effect-settings">
        <label>Tryb efektu<select aria-label="Tryb efektu" value={draft.lifecycle??'legacy-impact'} disabled={disablePersist||draft.locks.some(l=>l.layerId==='@effect'&&l.field==='lifecycle')} onChange={e=>{try{const next=applyChanges(draft,[{type:'project.set',values:{lifecycle:e.target.value as 'impact'|'duration'|'beam'}}],true);assertDocumentInvariants(next);setDraft(next);setPreviewCycles(1);setError('');}catch(error){setError((error as Error).message);}}}>{draft.lifecycle===undefined&&<option value="legacy-impact" disabled>FnF — starsze wygaszanie</option>}<option value="impact">FnF — autorskie alpha</option><option value="duration">DUR — podtrzymywany</option><option value="beam">Beam — połączenie punktów</option></select></label>
        <button className="icon-button" aria-label={draft.locks.some(l=>l.layerId==='@effect'&&l.field==='lifecycle')?'Odblokuj tryb efektu':'Zablokuj tryb efektu'} disabled={disablePersist} onClick={()=>setDraft(d=>({...d,locks:d.locks.some(l=>l.layerId==='@effect'&&l.field==='lifecycle')?d.locks.filter(l=>!(l.layerId==='@effect'&&l.field==='lifecycle')):[...d.locks,{layerId:'@effect',field:'lifecycle'}]}))}><LockKeyhole size={14}/></button>
        {draft.lifecycle==='duration'&&<small>DUR: siatki i audio powtarzają jeden obieg. Zmiana długości rozciąga klucze siatki; klipy audio zachowują czas i tempo. Czas umiejętności i powtórzenia dźwięku w grze ustala konsument.</small>}
      </div><div className="effect-settings">
        <label><input type="checkbox" aria-label="Obracaj z postacią" checked={draft.orientWithObject ?? false}
          disabled={disablePersist || draft.locks.some(l=>l.layerId==='@effect'&&l.field==='orientWithObject')}
          onChange={e=>{const checked=e.target.checked;setDraft(d=>{const next={...d};if(!checked&&project?.document.orientWithObject===undefined)delete next.orientWithObject;else next.orientWithObject=checked;return next;});}}/>Obracaj z postacią</label>
        <button className="icon-button" aria-label={draft.locks.some(l=>l.layerId==='@effect'&&l.field==='orientWithObject')?'Odblokuj obracanie z postacią':'Zablokuj obracanie z postacią'} disabled={disablePersist}
          onClick={()=>setDraft(d=>({...d,locks:d.locks.some(l=>l.layerId==='@effect'&&l.field==='orientWithObject')?d.locks.filter(l=>!(l.layerId==='@effect'&&l.field==='orientWithObject')):[...d.locks,{layerId:'@effect',field:'orientWithObject'}]}))}><LockKeyhole size={14}/></button>
        <small>Dotyczy efektu przyłączonego do postaci w grze. Podgląd nie symuluje jej obrotu.</small>
      </div><div className="panel-tabs compact"><button className={panel === 'parameters' ? 'active' : ''} onClick={() => setPanel('parameters')} title="Parametry"><Settings2 size={16}/>Parametry</button><button className={panel === 'history' ? 'active' : ''} onClick={() => setPanel('history')} title="Historia"><History size={16}/></button><button className={panel === 'jobs' ? 'active' : ''} onClick={() => setPanel('jobs')} title="Zadania"><ArrowDownToLine size={16}/></button></div>
        {panel==='parameters'&&audioClip&&<AudioInspector key={`${project?.id}-${audioClip.id}`} clip={audioClip} asset={draft.audioAssets!.find(a=>a.id===audioClip.assetId)!} disabled={disablePersist} pending={meshEditorDrafts[audioClip.id]?.audio}
          isLocked={field=>draft.locks.some(l=>l.layerId===audioClip.id&&(l.field==='*'||l.field===field))}
          onPending={audio=>updateMeshEditorDraft(audioClip.id,audio?{audio}:{})} onApply={values=>{if(Object.keys(values).length)applyAudio([{type:'audio.set',clipId:audioClip.id,values}]);}}
          onRemove={()=>{applyAudio([{type:'audio.remove',clipId:audioClip.id}]);setSelected(draft.layers[0].id);}}
          onLock={()=>setDraft(d=>({...d,locks:d.locks.some(l=>l.layerId===audioClip.id&&l.field==='*')?d.locks.filter(l=>l.layerId!==audioClip.id):[...d.locks.filter(l=>l.layerId!==audioClip.id),{layerId:audioClip.id,field:'*'}]}))}/>}
        {panel === 'parameters' && !audioClip && layer && <div className={`inspector ${layer.type === 'mesh' ? 'mesh-inspector' : ''}`}><div className="inspector-title"><span className="layer-glyph" style={{ color: layer.color }}>{layer.type === 'mesh' ? <Box size={19}/> : <Sparkles size={19}/>}</span><input aria-label="Nazwa warstwy" value={layer.name} disabled={!project || isLocked('name')} onChange={e => patchLayer({ name: e.target.value })}/><button className={`icon-button ${solo === layer.id ? 'on' : ''}`} title="Pokaż tylko tę warstwę" aria-label="Pokaż tylko tę warstwę" onClick={() => setSolo(solo === layer.id ? null : layer.id)}><Focus size={16}/></button></div>
          {layer.type!=='trail' && <TextureInspector key={`texture-${layer.id}`} layer={layer} assets={draft.assets || []} disabled={!project} isLocked={isLocked}
            importBlockedReason={textureImportBlocked} onImport={(file, targetSize) => run(() => importTexture(file, targetSize))}
            onChange={values => layer.type === 'mesh' ? patchMeshLayer(values) : patchLayer(values)}/>}
          {layer.type === 'beam' ? <BeamInspector key={layer.id} layer={layer} sharedFlow={isBeamFlow(draft)} disabled={!project} isLocked={isLocked} pending={meshEditorDrafts[layer.id]?.beam} onPending={beam=>{const entry={...meshEditorDraftsRef.current[layer.id]};if(beam)entry.beam=beam;else delete entry.beam;updateMeshEditorDraft(layer.id,entry);}} onChange={patchMeshLayer}/> : layer.type === 'trail' ? <TrailInspector key={layer.id} layer={layer} disabled={!project} isLocked={isLocked} pending={meshEditorDrafts[layer.id]?.path} onPendingChange={path => {const entry={...meshEditorDraftsRef.current[layer.id]};if(path)entry.path=path;else delete entry.path;updateMeshEditorDraft(layer.id,entry);}} onChange={patchMeshLayer}/> : layer.type === 'mesh' ? <><ObjImportInspector key={`obj-${project?.id}-${layer.id}`} layer={layer} document={draft} pending={meshEditorDrafts[layer.id]?.obj}
            geometryPending={!!meshEditorDrafts[layer.id]?.geometry} disabled={!project} isLocked={isLocked}
            onPendingChange={(obj, expected) => {
              if (current.current.project?.id !== project?.id) return false;
              const entry = { ...meshEditorDraftsRef.current[layer.id] };
              if (expected && entry.obj !== expected) return false;
              if (obj) entry.obj = obj; else delete entry.obj;
              updateMeshEditorDraft(layer.id, entry); return true;
            }} onApply={applyObjToDraft}/>
            <MeshInspector key={layer.id} layer={layer} documentDuration={draft.duration} previewTime={time} disabled={!project} isLocked={isLocked}
              pending={meshEditorDrafts[layer.id] || {}} onPendingChange={entry => updateMeshEditorDraft(layer.id, entry)} onChange={patchMeshLayer}/></> : <>
          {layer.beamBinding&&<><button aria-label={isLocked('beamBinding')?'Odblokuj powiązanie cząstek':'Zablokuj powiązanie cząstek'} disabled={disablePersist} onClick={()=>setDraft(d=>({...d,locks:isLocked('beamBinding')?d.locks.filter(l=>!(l.layerId===layer.id&&l.field==='beamBinding')):[...d.locks,{layerId:layer.id,field:'beamBinding'}]}))}><LockKeyhole size={14}/>Blokada powiązania</button><EmitterBeamBinding layer={layer} disabled={!project||isLocked('beamBinding')} pending={meshEditorDrafts[layer.id]?.beamBinding} onPendingChange={beamBinding=>{const entry={...meshEditorDraftsRef.current[layer.id]};if(beamBinding)entry.beamBinding=beamBinding;else delete entry.beamBinding;updateMeshEditorDraft(layer.id,entry);}} onChange={patchBeamBinding}/></>}
          <EmitterOrientation key={`orientation-${layer.id}`} layer={layer} disabled={!project || isLocked('orientation') || layer.beamBinding?.role==='flow'} pending={meshEditorDrafts[layer.id]?.orientation}
            onPendingChange={orientation => { const entry = { ...meshEditorDraftsRef.current[layer.id] }; if (orientation) entry.orientation = orientation; else delete entry.orientation; updateMeshEditorDraft(layer.id, entry); }}
            onChange={patchLayer}/>
          <EmitterFlipbook key={`flipbook-${layer.id}`} layer={layer} disabled={!project || isLocked('flipbook')} pending={meshEditorDrafts[layer.id]?.flipbook}
            onPendingChange={flipbook=>{const entry={...meshEditorDraftsRef.current[layer.id]};if(flipbook)entry.flipbook=flipbook;else delete entry.flipbook;updateMeshEditorDraft(layer.id,entry);}} onChange={patchLayer}/>
          <fieldset disabled={!project}><legend>PRZEBIEG WIEKU CZĄSTKI</legend><p className="mesh-help">Początek, środek i koniec życia pojedynczej cząstki. Jeden moment środka obowiązuje kolor, rozmiar i alpha.</p>
            <Slider label="Punkt środkowy wieku" value={(layer.midPercent ?? .5) * 100} min={1} max={99} step={.1} unit=" %" disabled={isLocked('midPercent')} onChange={value => patchLayer({ midPercent: value / 100 })}/>
            <div className="color-fields three"><label><input type="color" aria-label="Kolor początkowy" value={layer.color} disabled={isLocked('color')} onChange={e => patchLayer({ color: e.target.value })}/><span>Początek<small>{layer.color.toUpperCase()}</small></span></label>
              <label><input type="color" aria-label="Kolor środkowy" value={layer.midColor || middleColor} disabled={isLocked('midColor')} onChange={e => patchLayer({ midColor: e.target.value })}/><span>Środek<small>{(layer.midColor || middleColor).toUpperCase()}</small></span></label>
              <label><input type="color" aria-label="Kolor końcowy" value={layer.endColor} disabled={isLocked('endColor')} onChange={e => patchLayer({ endColor: e.target.value })}/><span>Koniec<small>{layer.endColor.toUpperCase()}</small></span></label></div>
            <Slider label="Rozmiar początkowy" value={layer.size} min={.005} max={5} step={.005} unit=" m" disabled={isLocked('size')} onChange={size => patchLayer({ size })}/>
            <Slider label="Rozmiar środkowy" value={middle!.size} min={0} max={5} unit=" m" disabled={isLocked('midSize')} onChange={midSize => patchLayer({ midSize })}/>
            <Slider label="Rozmiar końcowy" value={layer.endSize} min={0} max={5} unit=" m" disabled={isLocked('endSize')} onChange={endSize => patchLayer({ endSize })}/>
            <Slider label="Przezroczystość · początek" value={layer.alpha} min={0} max={1} disabled={isLocked('alpha')} onChange={alpha => patchLayer({ alpha })}/>
            <Slider label="Przezroczystość · środek" value={middle!.alpha} min={0} max={1} disabled={isLocked('midAlpha')} onChange={midAlpha => patchLayer({ midAlpha })}/>
            <Slider label="Przezroczystość · koniec" value={layer.endAlpha} min={0} max={1} disabled={isLocked('endAlpha')} onChange={endAlpha => patchLayer({ endAlpha })}/>
            <p className="mesh-help">Niezmieniony środek wynika z końców. Edycja jego wartości ustala osobny punkt przebiegu.</p>
            <button className="text-button" disabled={!project || ['midColor','midAlpha','midSize'].some(isLocked) || [layer.midColor,layer.midAlpha,layer.midSize].every(value => value === undefined)}
              onClick={() => patchLayer({ midColor: null, midAlpha: null, midSize: null })}>Przywróć automatyczny środek</button>
          </fieldset>
          <fieldset disabled={!project}><legend>EMISJA</legend><label className="select-field">Tryb<select value={layer.update} disabled={isLocked('update')||!!layer.beamBinding} onChange={e => patchLayer({ update: e.target.value as EmitterLayer['update'] })}><option value="Explosion">Jednorazowy wybuch</option><option value="Fountain">Krótka emisja ciągła</option></select></label><Slider label="Liczba cząstek" value={layer.count} min={1} max={400} step={1} disabled={isLocked('count')} onChange={count => patchLayer({ count })}/><Slider label="Moment startu" value={layer.start} min={0} max={draft.duration} unit=" s" disabled={isLocked('start')} onChange={start => patchLayer({ start })}/>{layer.update === 'Fountain' && <Slider label="Długość emisji" value={layer.duration} min={.01} max={3} unit=" s" disabled={isLocked('duration')} onChange={duration => patchLayer({ duration })}/>}<Slider label="Czas życia" value={layer.life} min={.05} max={4} unit=" s" disabled={isLocked('life')} onChange={life => patchLayer({ life })}/></fieldset>
          <fieldset disabled={!project}><legend>RUCH I SKALA</legend><Slider label="Prędkość" value={layer.speed} min={0} max={8} disabled={isLocked('speed')||layer.beamBinding?.role==='flow'} onChange={speed => patchLayer({ speed })}/><Slider label="Rozrzut" value={layer.spread} min={0} max={3.14} disabled={isLocked('spread')||layer.beamBinding?.role==='flow'} onChange={spread => patchLayer({ spread })}/><Slider label="Ciężar cząstek" value={layer.gravity} min={-3} max={8} disabled={isLocked('gravity')||layer.beamBinding?.role==='flow'} onChange={gravity => patchLayer({ gravity })}/><Slider label="Skala rodzica" value={layer.scale} min={.1} max={3} disabled={isLocked('scale')||layer.beamBinding?.role==='flow'} onChange={scale => patchLayer({ scale })}/><Slider label="Wysokość emitera" value={layer.position[2]} min={0} max={3} unit=" m" disabled={isLocked('position')||!!layer.beamBinding} onChange={z => patchLayer({ position: [layer.position[0], layer.position[1], z] })}/></fieldset>
          </>}
          <div className="layer-actions"><button className="button" disabled={disablePersist} onClick={() => setDraft(d => ({ ...d, locks: isLocked('*') ? d.locks.filter(l => l.layerId !== layer.id) : [...d.locks.filter(l => l.layerId !== layer.id), { layerId: layer.id, field: '*' }] }))}>{isLocked('*') ? <UnlockKeyhole size={14}/> : <LockKeyhole size={14}/>} {isLocked('*') ? 'Odblokuj' : 'Zablokuj warstwę'}</button><button className="icon-button danger" aria-label="Usuń warstwę" disabled={disablePersist || !!meshEditorDrafts[layer.id] || draft.layers.length < 2 || draft.locks.some(l => l.layerId === layer.id)} onClick={() => { setDraft(d => ({ ...d, layers: d.layers.filter(l => l.id !== layer.id) })); setSelected(draft.layers.find(l => l.id !== layer.id)!.id); }}><Trash2 size={16}/></button></div>
        </div>}
        {panel === 'history' && <div className="history-list"><div className="panel-heading"><span>HISTORIA PROJEKTU</span></div>{!history.length && <p className="empty-text">Zapisane zmiany pojawią się tutaj.</p>}{history.map((r, i) => <div className="history-item" key={r.revision || i}><div><strong>Rewizja {r.revision}</strong><span>{r.actorName || r.actorId || 'Nieznany autor'}{r.actorKind === 'agent' ? ' · AI' : r.actorKind === 'owner' ? ' · człowiek' : ''}</span></div><small>{r.committedAt ? new Date(r.committedAt).toLocaleString('pl-PL') : 'Brak czasu operacji'}</small><div className="history-actions"><button disabled={busy} onClick={() => void run(async () => { const p = projectOf(await command('projects.inspect', { projectId: project!.id, revision: r.revision })); setCompare(p.document); })}>Porównaj</button>{r.operationId && r.revision > 1 && <button disabled={busy || dirty} onClick={() => void run(async () => { const p = projectOf(await write('changes.revert', { projectId: project!.id, expectedRevision: project!.revision, operationId: r.operationId })); setProject(p); setDraft(clone(p.document)); })}>Cofnij zmianę</button>}</div></div>)}<label className="review-field">Uwagi do rewizji<textarea value={review} placeholder="Co warto poprawić w efekcie?" onChange={e => setReview(e.target.value)}/></label><button className="button" disabled={disablePersist || !review.trim()} onClick={() => void run(async () => { await write('reviews.add', { projectId: project!.id, revision: project!.revision, text: review }); setReview(''); setNotice('Uwaga zapisana.'); })}>Zapisz uwagę</button></div>}
        {panel === 'jobs' && <div className="jobs-list"><div className="panel-heading"><span>RENDER I EKSPORT</span></div><div className="job-actions">{!isBeamFlow(draft)&&['duration','beam'].includes(draft.lifecycle??'')&&<label>{draft.lifecycle==='beam'?'Długość renderu ×':'Obiegi renderu'}<input aria-label={draft.lifecycle==='beam'?'Mnożnik okna podglądu beama':'Obiegi renderu DUR'} type="number" min={1} max={Math.min(10,Math.floor(30/draft.duration))} value={previewCycles} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isInteger(n)&&n>=1&&n<=10&&n*draft.duration<=30)setPreviewCycles(n);}}/></label>}<button className="button" disabled={disablePersist || dirty} onClick={() => void run(() => enqueue('projects.export'))}>Pobierz projekt</button><button className="button" disabled={disablePersist || dirty} onClick={() => void run(() => enqueue('preview.request', { format: 'webm' }))}>Nagraj podgląd</button></div>{!jobs.length && <p className="empty-text">Zleć eksport lub zapisz kadr. Możesz zamknąć kartę podczas pracy.</p>}{jobs.map(j => <JobCard key={j.id || j.jobId} job={j} onCancel={() => void run(async () => { await write('jobs.cancel', { jobId: j.id || j.jobId }); })}/>)}<p className="job-note">Pakiet NWN zawiera zasoby efektu. Podłączenie do modułu i test w grze wymagają kwalifikowanego profilu.</p></div>}
      </aside>
    </main>
    {notice && <div className="toast" role="status"><Check size={16}/>{notice}</div>}
    {(showNew || showCLI) && <div className="modal-backdrop" onClick={() => { setShowNew(false); setShowCLI(false); }}><section role="dialog" aria-modal="true" aria-label={showNew ? 'Nowy projekt' : 'Połączenie agenta'} className="modal" onClick={e => e.stopPropagation()}><button className="modal-close icon-button" aria-label="Zamknij" onClick={() => { setShowNew(false); setShowCLI(false); }}><X size={18}/></button>{showNew ? <><span className="eyebrow">NOWA KOMPOZYCJA</span><h2>Od czego zaczynamy?</h2><div className="new-options">{[['empty', 'Pusty projekt', 'Jeden emiter, Twoje parametry'], ['flow','Nowy strumień cząstek','Emisja, pulsowanie i dolot między punktami'], ['beam','Nowy beam','Połączenie dwóch punktów, zewnętrzny czas działania'], ['duration','Nowy efekt DUR','Jedna siatka, ciągła pętla bez zaniku'], ['coil', 'Przeciążenie cewki', 'Iskry, ciepły błysk i smuga dymu'], ['vial', 'Fiolka alchemiczna', 'Zielone drobiny i alchemiczna mgiełka']].map(([preset, title, description]) => <button key={preset} disabled={busy} onClick={() => void run(() => create(preset))}><Sparkles size={20}/><span><strong>{title}</strong><small>{description}</small></span><Plus size={16}/></button>)}</div></> : <><span className="eyebrow">CZŁOWIEK + AI</span><h2>Ten sam projekt, wspólne operacje.</h2><label>Zestaw narzędzi WebMCP<select aria-label="Zestaw narzędzi WebMCP" value={webmcpStatus.toolProfile??'authoring'} onChange={e=>{void adapterRef.current?.selectTools(e.target.value as 'authoring'|'workflow');}}><option value="authoring">Edycja warstw</option><option value="workflow">Iteracja i import OBJ</option></select></label><p>Agent przełącza te same zestawy przez studio.tools.select. Uprawnienia i szkic pozostają zachowane.</p><WebMCPConnection status={webmcpStatus} grant={grantSummary} project={project} busy={busy} dirty={dirty} connect={() => void run(connectWebMCP)} disconnect={() => void run(disconnectWebMCP)}/><p>Agent z innego projektu może korzystać z zainstalowanego CLI. Zacznij od diagnostyki i wyboru projektu.</p><pre>nwn-vfx --json doctor{`\n`}nwn-vfx --json projects list</pre>{project && <><p>ID tego projektu</p><code className="project-id">{project.id}</code></>}<p>Uprawnienia nadaje właściciel. Blokady, historia i wstrzymanie zapisów obowiązują także agentów zewnętrznych.</p><button className="button" onClick={() => { void navigator.clipboard.writeText(project?.id || 'nwn-vfx --json doctor'); setNotice('Skopiowano.'); }}>Kopiuj {project ? 'ID projektu' : 'polecenie'}</button></>}</section></div>}
  </div>;
}

function JobCard({ job, onCancel }: { job: any; onCancel: () => void }) {
  const [detail, setDetail] = useState(job);
  useEffect(() => { setDetail(job); if (['succeeded', 'completed'].includes(job.status)) void command('jobs.get', { jobId: job.id || job.jobId }).then(d => setDetail(d.job || d)).catch(() => {}); }, [job]);
  const artifacts = detail.artifacts || detail.result?.artifacts || [];
  const statusLabel: Record<string, string> = { queued: 'W kolejce', running: 'W toku', succeeded: 'Gotowe', completed: 'Gotowe', failed: 'Błąd', cancelled: 'Anulowane', blocked: 'Wymaga działania' };
  return <article className="job-card"><div><strong>{job.type?.includes('preview') || job.kind?.includes('preview') ? 'Podgląd' : job.type?.includes('project') || job.kind?.includes('project') ? 'Projekt Studio' : 'Pakiet NWN'}</strong><span className={`job-status ${job.status}`}>{statusLabel[job.status] || job.status}</span></div><small>Rewizja {job.revision || job.inputRevision || job.input?.revision || '—'}</small>{detail.error && <p className="job-error">{typeof detail.error === 'string' ? detail.error : detail.error.message}</p>}{artifacts.map((a: any) => <a className="artifact" key={a.id || a.artifactId} href={`/api/artifacts/${a.id || a.artifactId}`} download><ArrowDownToLine size={14}/>{a.name || a.filename || 'Pobierz wynik'}</a>)}{['queued', 'running'].includes(job.status) && <button className="text-button" onClick={onCancel}>Anuluj zadanie</button>}</article>;
}

createRoot(document.getElementById('root')!).render(location.pathname === '/render' ? <RenderPage/> : <App/>);
