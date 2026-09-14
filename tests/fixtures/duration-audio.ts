import {durationExample} from './duration.js';
import {audioFixture} from './audio.js';
import {promoteDocumentSchema,type MeshLayer} from '../../packages/core/src/model.js';

/** Technical tone only: no selected/accepted consumer recording. */
export function durationAudioFixture(){
  const document=durationExample().loop,{asset,wav}=audioFixture(true);
  document.name='DUR audio — technical fixture';document.duration=1.6;
  for(const l of document.layers as MeshLayer[]){l.duration=1.6;for(const k of l.animation.vertices??[])k.time*=1.6;}
  document.audioAssets=[asset];document.audioClips=[
    {id:'up',type:'audio',name:'Technical up',assetId:asset.id,enabled:true,start:.2,duration:.25,offset:.1,gain:.25,fadeIn:.05,fadeOut:.07},
    {id:'down',type:'audio',name:'Technical down',assetId:asset.id,enabled:true,start:1,duration:.3,offset:.25,gain:.125,fadeIn:.05,fadeOut:.05},
  ];promoteDocumentSchema(document);return{document,asset,wav};
}
