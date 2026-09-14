import type {EffectDocument} from '../../core/src/model.js';
import {audioBytes,audioMetadata,audioLevelReport,audioLevelDiagnostic,mixAudio,pcmWave,readPcmWav} from '../../core/src/audio.js';
import {sha256Bytes} from '../../core/src/textures.js';
import type {ResourceFile} from './binary.js';

export function exportAudio(document:EffectDocument,modelName:string){
  const resources:ResourceFile[]=[],files:ResourceFile[]=[],events=[],diagnostics:ReturnType<typeof audioLevelDiagnostic>[]=[];
  for(const clip of document.audioClips??[]){
    if(!clip.enabled)continue;
    const rendered=mixAudio({...document,audioClips:[{...clip,start:0}]},44100,1,0,clip.duration);
    const bytes=pcmWave(rendered.pcm,44100,1),sha256=sha256Bytes(bytes),resref='va_'+sha256.slice(0,13);
    if(!resources.some(f=>f.name===resref+'.wav'))resources.push({name:resref+'.wav',data:bytes});
    const decoded=readPcmWav(bytes);
    const levels=audioLevelReport(rendered);if(levels.clippedSamples)diagnostics.push({...audioLevelDiagnostic(levels),message:`Klip ${clip.id}: ${audioLevelDiagnostic(levels).message}`});
    if(sha256Bytes(decoded.pcm)!==sha256Bytes(rendered.pcm))throw new Error('Audio WAV readback mismatch');
    events.push({clipId:clip.id,sourceAssetId:clip.assetId,resref,file:resref+'.wav',sha256,start:clip.start,duration:clip.duration,
      audio:levels,resourceDuration:decoded.frames/decoded.sampleRate,offset:clip.offset,gain:clip.gain,fadeIn:clip.fadeIn,fadeOut:clip.fadeOut,
      processing:'trim-linear-resample-mono-average-gain-linear-fades-pcm16-v1',sampleRate:44100,channels:1,frames:decoded.frames});
  }
  if(document.audioAssets===undefined&&document.audioClips===undefined)return{resources,files,diagnostics};
  const mix=mixAudio(document),mixWav=pcmWave(mix.pcm,mix.sampleRate,mix.channels);
  const nativeMix=mixAudio(document,44100,1),nativeWav=pcmWave(nativeMix.pcm,44100,1),nativeSha=sha256Bytes(nativeWav),nativeResref='va_'+nativeSha.slice(0,13);
  if(!resources.some(f=>f.name===nativeResref+'.wav'))resources.push({name:nativeResref+'.wav',data:nativeWav});
  diagnostics.push(...[mix,nativeMix].map(m=>audioLevelDiagnostic(audioLevelReport(m))));
  files.push({name:'audio-mix.wav',data:mixWav});
  for(const asset of document.audioAssets??[])files.push({name:`source-audio-${asset.id}.${asset.mime==='audio/wav'?'wav':'mp3'}`,data:audioBytes(asset.dataBase64)});
  if(document.lifecycle==='beam'&&document.audioClips?.some(c=>c.enabled)){
    const functionName=`VfxAudio_${modelName}`;
    const manifest={version:3,profile:'finite-beam-audio-v1',modelName,duration:document.duration,lifecycle:'beam',nativeVerified:false,autoPlayback:false,events,
      preferredIntegration:{method:'consumer-once-full-mix-wav',resref:nativeResref,file:nativeResref+'.wav',sha256:nativeSha,
        pcmSha256:sha256Bytes(nativeMix.pcm),sampleRate:44100,channels:1,frames:nativeMix.frames,audio:audioLevelReport(nativeMix),
        includesTimelineSilence:true,clipStartsAndSourceOffsetsBaked:true,gainAndFadesBaked:true,explicitConsumerBindingRequired:true,
        automaticSoundImpact:false,nativeSynchronizationVerified:false,
        dispatch:{count:1,startSeconds:0,anchor:'same activation as finite beam and endpoint effects',repeatAtFeedEnd:false},
        stop:{stopHandleForIssuedSound:false,issuedSoundMayOutliveVisualRemoval:true,actionQueueMayExtendTail:true},
        instructions:'Call the generated function ONCE on an explicit valid emitter object at beam activation. Do not bind SoundImpact, replay individual events, or dispatch again at feed end. Keep the visual instance through drain.'},
      sourceAssets:(document.audioAssets??[]).map(audioMetadata),
      mix:{file:'audio-mix.wav',sha256:sha256Bytes(mixWav),pcmSha256:sha256Bytes(mix.pcm),...audioLevelReport(mix)},
      integration:{script:'audio-events.nss',function:functionName,anchor:'explicit valid emitter object at beam activation',
        invocation:'One call dispatches one full timeline mix, including authored silence, gain and fades.',
        limitations:['No implicit Type B SoundImpact playback or repeat is assumed.',
          'PlaySound uses the object action queue; spatial attenuation, engine/network delay and synchronization require consumer testing.',
          'An issued WAV has no stop handle here and can finish after emergency visual removal. No instant stop or native sync guarantee.',
          'Individual event WAVs are readback derivatives; do not play them alongside the full mix.',
          'preview.compose omits audio. UI loop replays the whole preview only; it does not schedule native repeats.']}};
    const script=`// Call ONCE at finite beam activation on an explicit valid object.\n// Full mix already contains starts, offsets, gain and fades.\n// No SoundImpact, clip-event replay or feed-end retrigger. No stop handle.\nvoid ${functionName}(object oEmitter)\n{\n    if (!GetIsObjectValid(oEmitter)) return;\n    AssignCommand(oEmitter, PlaySound("${nativeResref}"));\n}\n`;
    files.push({name:'audio-events.nss',data:new TextEncoder().encode(script)},{name:'audio-events.json',data:new TextEncoder().encode(JSON.stringify(manifest,null,2)+'\n')});
    return{resources,files,diagnostics};
  }
  if(document.lifecycle==='duration'&&document.audioClips?.some(c=>c.enabled)){
    const functionName=`VfxAudio_${modelName}`,periodSeconds=document.duration;
    const manifest={version:2,modelName,duration:periodSeconds,lifecycle:'duration',nativeVerified:false,autoPlayback:false,events,
      period:{seconds:periodSeconds,previewFrames:mix.frames,previewSampleRate:48000,resourceFrames:nativeMix.frames,resourceSampleRate:44100},
      preferredIntegration:{method:'consumer-scheduled-period-wav',resref:nativeResref,file:nativeResref+'.wav',sha256:nativeSha,
        pcmSha256:sha256Bytes(nativeMix.pcm),sampleRate:44100,channels:1,frames:nativeMix.frames,audio:audioLevelReport(nativeMix),
        includesTimelineSilence:true,clipStartsAndSourceOffsetsBaked:true,explicitConsumerBindingRequired:true,automaticSoundImpactLoop:false,
        nativeSynchronizationVerified:false,
        schedule:{firstStartSeconds:0,offsetSeconds:0,intervalSeconds:periodSeconds,repetitions:null,externalLifetime:true,
          rule:'For k=0,1,... play one period at activationTime+k*intervalSeconds while k*intervalSeconds < externalLifetimeSeconds.',
          anchor:'the same activation time as the DUR visual; no native animation-phase introspection',
          cancellation:'Check emitter validity and the current activation generation immediately before every dispatch; invalidate the generation at stop. Do not enqueue an unbounded loop.',
          overlap:'Never combine this schedule with SoundImpact or the individual clip resources; late dispatch and retrigger policy belong to the consumer.'},
        stop:{stopSchedulingAtExternalEnd:true,stopHandleForIssuedSound:false,partialFinalPeriod:'already-issued WAV may finish',
          resourceTailAfterActualStartSeconds:periodSeconds,actionQueueMayExtendTailBeyondExternalEnd:true},
        instructions:'Schedule the one-period WAV explicitly. SoundImpact alone does not prove or implement a native loop. Do not retrigger the visual just to repeat audio.'},
      sourceAssets:(document.audioAssets??[]).map(audioMetadata),mix:{file:'audio-mix.wav',sha256:sha256Bytes(mixWav),...audioLevelReport(mix)},
      integration:{script:'audio-events.nss',function:functionName,invocation:'One call plays ONE period. The consumer owns the finite schedule, activation generation and stop policy.',
        limitations:['No native repeat, phase query, immediate stop or sample-accurate scheduling is implemented.',
          'PlaySound uses the emitter action queue; engine/network latency and sound attenuation require consumer validation.',
          'Stopping cancels future dispatch only; a sound already issued may continue for the remaining WAV and queue delay.',
          'The last partial cycle is not trimmed by this resource. A consumer needing immediate silence must use a separately qualified native mechanism.',
          'No automatic crossfade or seam repair; authored gain, fades, starts and source offsets are baked. Inspect the audio seam.',
          'preview.compose still omits audio. Preview repetition is not native validation.']}};
    const script=`// Plays ONE period (${periodSeconds} s). Consumer schedules finite repeats from activation time.\n// Check current activation generation and emitter validity before each dispatch.\n// Stop cancels future dispatch; PlaySound has no stop handle here.\n// Do NOT combine with SoundImpact, individual clip events or visual retriggering.\nvoid ${functionName}(object oEmitter)\n{\n    if (!GetIsObjectValid(oEmitter)) return;\n    AssignCommand(oEmitter, PlaySound("${nativeResref}"));\n}\n`;
    files.push({name:'audio-events.nss',data:new TextEncoder().encode(script)},{name:'audio-events.json',data:new TextEncoder().encode(JSON.stringify(manifest,null,2)+'\n')});
    return{resources,files,diagnostics};
  }
  const functionName=`VfxAudio_${modelName}`,script=`// Studio audio events: call ${functionName}(oEmitter) once at VFX time zero.\n// Consumer compiles/integrates this include. No automatic MDL playback.\n// Object must remain valid; engine/network scheduling is not sample accurate.\nvoid ${functionName}(object oEmitter)\n{\n    if (!GetIsObjectValid(oEmitter)) return;\n${events.map(e=>`    AssignCommand(oEmitter, DelayCommand(${e.start.toFixed(9)}, PlaySound("${e.resref}")));`).join('\n')}\n}\n`;
  const manifest={version:1,modelName,duration:document.duration,nativeVerified:false,autoPlayback:false,events,
    preferredIntegration:{method:'visualeffects.2da.SoundImpact',resref:nativeResref,file:nativeResref+'.wav',sha256:nativeSha,sampleRate:44100,channels:1,
      audio:audioLevelReport(nativeMix),frames:nativeMix.frames,includesTimelineSilence:true,explicitConsumerBindingRequired:true,
      instructions:'Set SoundImpact on the consumer-selected existing VFX row to this resref. Trigger that VFX once at timeline zero. Do not also invoke the alternate NSS events.',
      nativeSynchronizationVerified:false},
    sourceAssets:(document.audioAssets??[]).map(audioMetadata),
    mix:{file:'audio-mix.wav',sha256:sha256Bytes(mixWav),...audioLevelReport(mix)},
    integration:{script:'audio-events.nss',function:functionName,anchor:'explicit valid emitter object at the same timeline zero as visual effect',
      invocation:'consumer must call the generated function; WAV resources alone do not trigger playback',
      limitations:['Gain, trim and fades are baked into each WAV. Starts live only in the explicit script events.',
        'PlaySound can be delayed by the action queue. Prefer the single full mix bound explicitly to SoundImpact. Never trigger both paths.',
        'PlaySound is positional; engine attenuation, user sound settings, scheduling and repeated playback need consumer validation.',
        'No stop handle for already issued PlaySound calls; invoke once per effect and let each baked clip finish.',
        'Mono PCM16 44100 Hz resource derivative; originals and stereo preview mix are preserved separately.']}};
  files.push({name:'audio-events.nss',data:new TextEncoder().encode(script)},
    {name:'audio-events.json',data:new TextEncoder().encode(JSON.stringify(manifest,null,2)+'\n')});
  return{resources,files,diagnostics};
}
