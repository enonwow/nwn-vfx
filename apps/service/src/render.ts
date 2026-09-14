import {isBeamFlow,boundEmitters} from '../../../packages/core/src/beam-flow.js';
import {materialMotionSummaries} from '../../../packages/core/src/beam-material-motion.js';
import {beamTextureSummaries} from '../../../packages/core/src/beam-texture.js';
import {previewDuration} from '../../../packages/core/src/lifecycle.js';
import {compositionManifest} from '../../../packages/core/src/composition.js';
import {verifyComposition} from './composition.js';
import { chromium, type Browser, type LaunchOptions } from 'playwright';
import { DomainError, STUDIO_VERSION } from '../../../packages/core/src/model.js';
import { assertPreviewCamera, DEFAULT_PREVIEW_CAMERA } from '../../../packages/core/src/camera.js';
import type { Render } from './jobs.js';
import { encodeWebmFrames, VIDEO_FPS } from './video-encoder.js';
import { renderCause, renderDetails, rendererFailure, type RenderContext, type RenderPageError } from './render-errors.js';
import { createHash } from 'node:crypto';
import { compileMeshDeformation, assertMeshDeformationBudget } from '../../../packages/core/src/deformation.js';
import { meshCornerNormals } from '../../../packages/core/src/shading.js';
import { buildMeshGeometry } from '../../../packages/core/src/mesh.js';
import { deformationNormalSamples } from '../../../packages/nwn-format/src/normal-samples.js';
import {mixAudio,pcmWave,audioLevelReport,audioLevelDiagnostic} from '../../../packages/core/src/audio.js';

export interface RendererDependencies {
  launch?: (options:LaunchOptions)=>Promise<Pick<Browser,'newPage'|'close'>>;
  encodeWebmFrames?: typeof encodeWebmFrames;
}
export function createRenderer(origin: string,dependencies:RendererDependencies={}): Render {
  const launch=dependencies.launch??(options=>chromium.launch(options)),encode=dependencies.encodeWebmFrames??encodeWebmFrames;
  return async (document, options) => {
    if (options.camera !== undefined) assertPreviewCamera(options.camera);
    assertMeshDeformationBudget(document);
    const composition=options.composition;if(composition)verifyComposition(composition);
    const duration=composition?.input.duration??previewDuration(document,options.cycles);
    const deformations = (composition?[]:document.layers).flatMap(layer => {
      if(layer.type!=='mesh'||!layer.enabled||layer.animation.vertices===undefined)return [];
      const compiled=compileMeshDeformation(layer,document.duration),geometry=buildMeshGeometry(layer.geometry);
      const uv=geometry.uv.length?geometry.uv:geometry.vertices.map(()=>[0,0]);
      const hash=(data:unknown)=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
      return [{layerId:layer.id,frameSets:compiled.frames.length,samplePeriod:compiled.period,
        animvertsSha256:hash(compiled.frames.flat()),animtvertsSha256:hash(compiled.frames.flatMap(()=>uv.map(v=>[...v,0]))),maxDeviationMetres:compiled.maxDeviationMetres,
        ...(compiled.interpolation?{interpolation:compiled.interpolation}:{})}];
    });
    const meshShading=(composition?[]:document.layers).flatMap(layer=>{
      if(layer.type!=='mesh'||!layer.enabled||(layer.animation.vertices!==undefined&&layer.shading!=='smooth'))return [];
      const geometry=buildMeshGeometry(layer.geometry);
      return [{layerId:layer.id,mode:layer.shading??'flat',cornerNormalsSha256:createHash('sha256').update(JSON.stringify(meshCornerNormals(geometry.vertices,geometry.faces,layer.shading??'flat'))).digest('hex'),
        ...(layer.animation.vertices!==undefined?{deformationNormals:deformationNormalSamples(compileMeshDeformation(layer,document.duration).frames,geometry.faces)}:{})}];
    });
    const conditions=options.conditions??document.authoring?.preview;
    const selectedCamera=options.camera??conditions?.camera;
    const requestedCamera = selectedCamera === undefined ? undefined : structuredClone(selectedCamera);
    const camera = structuredClone(requestedCamera ?? DEFAULT_PREVIEW_CAMERA);
    let browser:Pick<Browser,'newPage'|'close'>|undefined,closing:Promise<void>|undefined;
    let context:RenderContext={stage:'launch'},failure:DomainError|undefined,result:Awaited<ReturnType<Render>>|undefined,lastFrame:number|undefined,pageErrorCount=0;
    const pageErrors:RenderPageError[]=[];
    const closeBrowser=()=>closing??=(browser?Promise.resolve().then(()=>browser!.close()):Promise.resolve());
    // Playwright launch has no abort-signal API. Await it and close any browser
    // that becomes available after cancellation; never leave a late launch alive.
    const abort=()=>{if(browser)void closeBrowser().catch(()=>{});};
    options.signal.addEventListener('abort',abort,{once:true});
    async function run<T>(next:RenderContext,operation:()=>Promise<T>):Promise<T> {
      context=next;
      if(options.signal.aborted)throw rendererFailure(new Error('Render anulowany.'),next,pageErrors,true);
      const previousErrors=pageErrorCount;
      try {
        const value=await operation();
        if(options.signal.aborted)throw rendererFailure(new Error('Render anulowany.'),next,pageErrors,true);
        if(pageErrorCount>previousErrors)throw new DomainError('RENDER_PAGE_ERROR',pageErrors.at(-1)!.message);
        return value;
      } catch(error) {
        const at=next.stage==='encoder'&&lastFrame!==undefined?{...next,frameIndex:lastFrame,frameTime:lastFrame/VIDEO_FPS}:next;
        throw rendererFailure(error,at,pageErrors,options.signal.aborted);
      }
    }
    try {
      // Windows headless-shell is a console EXE; the supported Chromium channel
      // uses the GUI executable in headless mode without creating that console.
      await run({stage:'launch'},async()=>{browser=await launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});});
      const page=await run({stage:'page'},()=>browser!.newPage({viewport:{width:960,height:640},deviceScaleFactor:1}));
      page.on('pageerror',error=>{pageErrorCount++;pageErrors.push({...context,...renderCause(error)});if(pageErrors.length>5)pageErrors.shift();});
      await run({stage:'navigation'},()=>page.goto(`${origin}/render`,{waitUntil:'domcontentloaded',timeout:30_000}));
      await run({stage:'ready'},()=>page.waitForFunction(()=>typeof(window as any).studioRender==='function',null,{timeout:15_000}));
      let data:Uint8Array,name:string;
      const audio=!composition&&options.format==='webm'&&document.audioClips!==undefined?mixAudio(document,48000,2,0,duration):undefined;
      const audioWav=audio?pcmWave(audio.pcm,audio.sampleRate,audio.channels):undefined;
      if(options.format==='webm') {
        await run({stage:'document'},()=>page.evaluate(({document,camera,composition,conditions})=>{if(composition)(window as any).studioSetComposition(composition,camera);else(window as any).studioSetDocument(document,camera,conditions);},{document,camera:requestedCamera,composition,conditions}));
        // 1.6*3*30 is 144.00000000000003 in JS. Do not add a video frame
        // (and padded audio) at an exact DUR-audio period boundary. Preserve
        // the historical frame-count path for projects outside this feature.
        const frameCount=Math.ceil(duration*VIDEO_FPS-(['duration','beam'].includes(document.lifecycle??'')&&document.audioClips?.some(c=>c.enabled)?1e-9:0));
        data=await run({stage:'encoder'},()=>encode({frameCount,signal:options.signal,...(audioWav?{audioWav}:{}),
          frame:async index=>{
            lastFrame=index;
            const position={frameIndex:index,frameTime:index/VIDEO_FPS};
            await run({stage:'frame',...position},()=>page.evaluate(time=>(window as any).studioRenderFrame(time),index/VIDEO_FPS));
            const png=await run({stage:'screenshot',...position},()=>page.locator('canvas').screenshot({type:'png'}));
            context={stage:'encoder',...position};return png;
          }}));
        name='preview.webm';
      } else {
        await run({stage:'render',frameTime:options.time},()=>page.evaluate(async({doc,time,camera,composition,conditions})=>{if(composition){(window as any).studioSetComposition(composition,camera);await(window as any).studioRenderFrame(time);}else await(window as any).studioRender(doc,time,camera,conditions);},{doc:document,time:options.time,camera:requestedCamera,composition,conditions}));
        data=await run({stage:'screenshot',frameTime:options.time},()=>page.locator('canvas').screenshot({type:'png'}));name='preview.png';
      }
      result={files:[{name,data},...(audioWav?[{name:'audio-mix.wav',data:audioWav}]:[])],metadata:composition?{...compositionManifest(composition),rendererVersion:STUDIO_VERSION,format:options.format??'png',time:options.time,camera,resolution:[960,640],approximation:true,limitations:['Visual composition only; no audio mix or native validation.','FnF sources use their authored length; DUR instances repeat for their explicit duration. All sources are clipped to the common output interval.','Video samples composition time k/30; final duration rounds up to a whole frame.']}:{rendererVersion:STUDIO_VERSION,documentSchemaVersion:document.schemaVersion,...(conditions?{conditions}:{}),
        ...(audio?{audio:{sampleRate:48000,channels:2,frames:audio.frames,pcmSha256:createHash('sha256').update(audio.pcm).digest('hex'),peak:audio.peak,peakDbFS:audioLevelReport(audio).peakDbFS,clippedSamples:audio.clippedSamples,muxCodec:'opus',masterPreviewGainApplied:false}}:{}),
        format:options.format??'png',time:options.time,duration,seed:document.seed,...(isBeamFlow(document)?{beamParticleFlow:boundEmitters(document).map(l=>({layerId:l.id,binding:l.beamBinding,start:l.start,feedSeconds:l.duration,life:l.life,count:l.count}))}:{}),...(beamTextureSummaries(document).length?{beamTextureMapping:beamTextureSummaries(document)}:{}),...(materialMotionSummaries(document).length?{beamMaterialMotion:materialMotionSummaries(document)}:{}),...(beamMotionSummaries(document).length?{beamNativeMotion:beamMotionSummaries(document)}:{}),...(document.lifecycle===undefined?{}:{lifecycle:document.lifecycle,...(document.lifecycle==='beam'?{previewWindowSeconds:document.duration}:{loopSeconds:document.duration}),cycles:options.cycles??1}),
        camera,resolution:[960,640],...(document.layers.some(l=>l.type==='emitter'&&l.flipbook)?{emitterFlipbooks:document.layers.filter(l=>l.type==='emitter'&&l.flipbook).map(l=>({layerId:l.id,texture:l.texture,settings:(l as import('../../../packages/core/src/model.js').EmitterLayer).flipbook,frameOrder:'left-to-right-top-to-bottom',clock:'particle-age-seconds',playback:'repeat'}))}:{}),...(meshShading.length?{meshShading}:{}),...(deformations.length?{deformations}:{}),
        approximation:true,nativeVerified:false,limitations:[...(materialMotionSummaries(document).length?['Periodic material uses the exact16-frame export atlas, two repeats and no mipmaps. Timing is sampled; native cadence, geometry seams and appearance remain unqualified.']:[]),...(beamTextureSummaries(document).length?['Explicit textureMapping repeats the same derivative PNG on each segment along native V, with full width 2*width and no synthetic flow pulse. Lightning noise, attachment and native appearance remain approximate/unqualified.']:[]),...(audio?[audioLevelDiagnostic(audioLevelReport(audio)).message]:[]),'Particle trajectories, texture sampling and light have not been qualified in NWN.','Mesh animation uses linear position/scale/alpha and shortest-path quaternion interpolation in Studio; native interpolation and transparency remain unqualified.',...(document.layers.some(l=>l.type==='mesh')?['Normal-alpha mesh triangles are sorted per mesh by camera-space centroid. Intersections, cyclic overlap and transparency across separate objects remain approximate; additive overlap is preserved. No native parity is implied.']:[]),
          ...(isBeamFlow(document)?['Finite Fountain birthrate and zero-handle P2P Bezier share the preview clock. Existing particles drain after feed ends; separate endpoint FnF animations share the preview start, while native dispatch may have frame delay. Native appearance and rig attachment remain unverified.']:document.lifecycle==='beam'?[beamMotionSummaries(document).length?'nativeMotion uses the same generated RGBA atlas as export. Timing assumes ideal FPS; native UV, width and cadence are unqualified. All phases repeat; consumer explicitly switches/removes effects. Legacy flow is ignored on nativeMotion layers. Endpoint coordinates remain preview-only.':'Beam endpoint coordinates, seed and flow are preview intent only. Metric ribbon width stays independent of endpoint distance; native Lightning width and motion require consumer testing. document.duration is a preview window, not native lifetime; multiplying cycles extends continuous preview time. No native flow or cessation animation is exported.']:[]),
          ...(document.layers.some(layer=>layer.type==='trail'&&layer.enabled)?['Trails and their generated heads interpolate shared vertex/UV samples at 60 Hz. Causal opening takes up to 2/60 s. Crossed geometry, texture sampling and native appearance remain unqualified.']:[]),
          ...(deformations.length?['Custom meshes interpolate shared 60 Hz mesh-local vertex samples before layer transforms, with fixed faces/UV. Metadata hashes match ASCII readback samples. Fixed Lambert lighting and baked PNG highlights do not provide PBR or native-qualified wet shading.']:[]),
          ...(meshShading.some(s=>s.deformationNormals)?['Smooth normals are recomputed from interpolated positions in Studio. Normal-frame hashes are derived evidence, not an exported normal channel. The pinned binary compiler stores static base normals only.']:[]),
          ...(options.format==='webm'?['Video samples document time k/30 at 30 fps, with ceil(duration*30) frames; clip duration is rounded up by less than one frame. Rendering speed does not change frame timestamps.']:[])]}};
    } catch(error) {failure=rendererFailure(error,context,pageErrors,options.signal.aborted);}
    finally {
      options.signal.removeEventListener('abort',abort);
      if(browser)try{await closeBrowser();}catch(error){
        if(failure)failure.details={...renderDetails(failure.details)!,cleanupError:renderCause(error)};
        else failure=rendererFailure(error,{stage:'cleanup'},pageErrors,options.signal.aborted);
      }
    }
    if(options.signal.aborted)throw rendererFailure(failure??new Error('Render anulowany.'),context,pageErrors,true);
    if(failure)throw failure;
    return result!;
  };
}
import {beamMotionSummaries} from '../../../packages/core/src/beam-motion.js';
