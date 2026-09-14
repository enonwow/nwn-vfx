import {pcmWave} from '../../packages/core/src/audio.js';
import {importAudio} from '../../apps/service/src/audio-import.js';
import {makeDocument,type EffectDocument} from '../../packages/core/src/model.js';
export function audioFixture(tone=false){
  const pcm=new Uint8Array(14400*4),v=new DataView(pcm.buffer);
  for(let i=0;i<14400;i++){const wave=tone?Math.sin(2*Math.PI*440*i/24000):1;v.setInt16(i*4,Math.round(4000*wave),true);v.setInt16(i*4+2,Math.round(-2000*wave),true);}
  const wav=pcmWave(pcm,24000,2),asset=importAudio('bite-fixture.wav',Buffer.from(wav).toString('base64'));
  const clip={id:'bite',type:'audio' as const,name:'Bite fixture',assetId:asset.id,enabled:true,start:.4,duration:.6,offset:0,gain:1,fadeIn:0,fadeOut:0};
  const document:EffectDocument={...makeDocument('empty','Audio acceptance fixture'),schemaVersion:9,duration:1,audioAssets:[asset],audioClips:[clip]};
  return{document,wav,asset,clip};
}
