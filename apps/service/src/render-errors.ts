import { DomainError } from '../../../packages/core/src/model.js';

export const RENDER_STAGES = ['launch','page','navigation','ready','document','render','frame','screenshot','encoder','cleanup','worker'] as const;
export type RenderStage = typeof RENDER_STAGES[number];
export interface RenderCause { name: string; message: string; code?: string }
export interface RenderContext { stage: RenderStage; frameIndex?: number; frameTime?: number }
export interface RenderPageError extends RenderCause, RenderContext {}
export interface RenderErrorDetails extends RenderContext { cause: RenderCause; pageErrors?: RenderPageError[]; cleanupError?: RenderCause }

/** Public diagnostics retain reasons and file basenames, not stacks, payloads,
 * local directory names or credentials. */
export function safeRenderMessage(value: unknown, maximum = 2000): string {
  if(typeof value!=='string')return 'Brak tekstowego opisu błędu.';
  let result=value.slice(0,16384)
    .replace(/data:[^\s,;]+(?:;[^\s,]+)*;base64,[A-Za-z0-9+/=_-]*/gi,'[image data redacted]')
    .replace(/(["']?(?:pngBase64|bundleBase64|document|snapshot)["']?\s*[:=]\s*)(?:"[^"\r\n]*(?:"|$)|'[^'\r\n]*(?:'|$)|\{[^\r\n]*|[^\s,;]+)/gi,'$1[payload redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [redacted]')
    .replace(/(\b[\w-]*(?:token|password|secret|api[_-]?key|authorization|cookie|credential)[\w-]*["']?\s*[:=]\s*)(?:"[^"\r\n]*(?:"|$)|'[^'\r\n]*(?:'|$)|[^\s,;]+)/gi,'$1[redacted]')
    .replace(/(?:https?|file):\/\/[^\s"'<>]+/gi,'[url redacted]')
    .replace(/[A-Za-z]:[\\/][^\r\n"'<>|]*?\.(?:exe|dll|so|dylib|js|ts|mjs|cjs|webm|png|json|zip|conf)\b/gi,path=>'[path]/'+path.split(/[\\/]/).at(-1))
    .replace(/[A-Za-z]:[\\/][^\r\n"'<>|]*/g,path=>'[path]/'+path.split(/[\\/]/).at(-1))
    .replace(/(^|[\s("'=])\/(?!\/)[^\s"'<>)]*/g,(_match,prefix:string)=>prefix+'[path]')
    .replace(/[A-Za-z0-9+/_-]{100,}={0,2}/g,'[long value redacted]');
  result=result.split(/\r?\n/).filter(line=>!/^\s*(?:at\s|function\b|async\s+function\b)/.test(line)).join('\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
  return (result||'Brak tekstowego opisu błędu.').slice(0,maximum);
}
export function renderCause(error: unknown): RenderCause {
  const e=error as {name?:unknown;message?:unknown;code?:unknown}|null;
  const code=typeof e?.code==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(e.code)?e.code:undefined;
  return {name:safeRenderMessage(typeof e?.name==='string'?e.name:'Error',80),message:safeRenderMessage(typeof error==='string'?error:e?.message),...(code?{code}:{})};
}
function contextFields(context: RenderContext): RenderContext {
  return {stage:context.stage,
    ...(Number.isInteger(context.frameIndex)&&context.frameIndex!>=0&&context.frameIndex!<=900?{frameIndex:context.frameIndex}:{}),
    ...(Number.isFinite(context.frameTime)&&context.frameTime!>=0&&context.frameTime!<=30?{frameTime:context.frameTime}:{})};
}
export function renderDetails(value: unknown): RenderErrorDetails|undefined {
  const v=value as RenderErrorDetails|undefined;
  if(!v||!RENDER_STAGES.includes(v.stage)||!v.cause||typeof v.cause.message!=='string')return undefined;
  const pageErrors=Array.isArray(v.pageErrors)?v.pageErrors.slice(-5).filter(error=>RENDER_STAGES.includes(error.stage)).map(error=>({...contextFields(error),...renderCause(error)})):[];
  return {...contextFields(v),cause:renderCause(v.cause),...(pageErrors.length?{pageErrors}:{}),...(v.cleanupError?{cleanupError:renderCause(v.cleanupError)}:{})};
}
export function rendererFailure(error: unknown,context: RenderContext,pageErrors: RenderPageError[]=[],cancelled=false): DomainError {
  const existing=error instanceof DomainError?renderDetails(error.details):undefined;
  if(existing&&existing.stage===context.stage) {
    const at=contextFields(context);
    if(existing.frameIndex===undefined&&at.frameIndex!==undefined)existing.frameIndex=at.frameIndex;
    if(existing.frameTime===undefined&&at.frameTime!==undefined)existing.frameTime=at.frameTime;
  }
  if(existing&&pageErrors.length) {
    const combined=[...(existing.pageErrors??[]),...pageErrors].map(error=>({...contextFields(error),...renderCause(error)}));
    existing.pageErrors=[...new Map(combined.map(error=>[JSON.stringify(error),error])).values()].slice(-5);
  }
  const details=existing??{...contextFields(context),cause:renderCause(error),...(pageErrors.length?{pageErrors:pageErrors.slice(-5)}:{})};
  if(cancelled||(error instanceof DomainError&&error.code==='CANCELLED'))return new DomainError('CANCELLED','Render anulowany.',details);
  if(existing&&error instanceof DomainError)return new DomainError(error.code,safeRenderMessage(error.message),details);
  const e=error as {name?:unknown;message?:unknown;code?:unknown;syscall?:unknown}|null;
  const raw=typeof e?.message==='string'?e.message.slice(0,16384):typeof error==='string'?error.slice(0,16384):'';
  const timeout=e?.name==='TimeoutError'||e?.code==='ETIMEDOUT'||/\btimeout\b[^\n]*\bexceeded\b|\btimed out\b/i.test(raw);
  if(context.stage==='launch') {
    const missing=/executable (?:doesn't exist|does not exist|not found)/i.test(raw)||(e?.code==='ENOENT'&&typeof e.syscall==='string'&&e.syscall.startsWith('spawn'));
    return new DomainError(missing?'RENDERER_EXECUTABLE_MISSING':timeout?'RENDERER_LAUNCH_TIMEOUT':'RENDERER_LAUNCH_FAILED',
      missing?'Nie znaleziono pliku wykonywalnego Chromium. Zainstaluj renderer: npx playwright install chromium.':timeout?'Przekroczono czas uruchamiania Chromium.':'Nie udało się uruchomić Chromium.',details);
  }
  if(context.stage==='cleanup')return new DomainError('RENDERER_CLEANUP_FAILED','Nie udało się zamknąć renderera.',details);
  if(error instanceof DomainError)return new DomainError(error.code,safeRenderMessage(error.message),details);
  return new DomainError(timeout?'RENDER_TIMEOUT':'RENDER_FAILED',timeout?'Przekroczono czas operacji renderera.':'Operacja renderera nie powiodła się.',details);
}
export function jobFailure(error: unknown): {code:string;message:string;details?:RenderErrorDetails} {
  if(error instanceof DomainError) {
    const details=renderDetails(error.details);
    return {code:error.code,message:safeRenderMessage(error.message),...(details?{details}:{})};
  }
  return {code:'JOB_FAILED',message:'Nie udało się wykonać zadania.',details:{stage:'worker',cause:renderCause(error)}};
}
