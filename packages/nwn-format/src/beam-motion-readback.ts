import {verifyBeamPointCounts} from './beam-point-count.js';
import {DomainError,type EffectDocument} from '../../core/src/model.js';
import {buildBeamMotionAtlas} from '../../core/src/beam-motion.js';
import {sha256Bytes} from '../../core/src/textures.js';
import {readAsciiMdl,numeric,textProperty} from './mdl-reader.js';
import {readNwnTga,type ResourceFile} from './binary.js';

/** Check actual authored parameters and independently decoded resource bytes.
 * Useful after serialization as well as in corruption tests. Native execution
 * remains a separate consumer observation. */
export function verifyBeamMotionResources(document:EffectDocument,mdl:Uint8Array,resources:ResourceFile[]) {
  verifyBeamPointCounts(mdl);
  const parsed=readAsciiMdl(mdl),result=[];
  for(const [i,l] of document.layers.filter(l=>l.enabled&&l.type==='beam').entries()){
    if(l.type!=='beam'||!l.nativeMotion)continue;
    const fail=(s:string):never=>{throw new DomainError('EXPORT_VALIDATION_FAILED','Beam atlas readback: '+s,{layerId:l.id});};
    const n=parsed.nodes.find(n=>n.name===`beam_${i}`);if(!n)fail('missing emitter');
    for(const [k,v] of Object.entries({fps:l.nativeMotion.fps,framestart:0,frameend:15,xgrid:4,ygrid:4,birthrate:2,lightningradius:0,lightningscale:0,loop:0,sizestart:l.width/2,sizeend:l.width/2}))if(numeric(n!,k)!==v)fail(k);
    if(textProperty(n!,'update')!=='Lightning'||textProperty(n!,'render')!=='Linked')fail('emitter mode');
    const name=textProperty(n!,'texture')+'.tga',file=resources.find(f=>f.name===name);if(!file)fail('missing texture');
    const actual=readNwnTga(file!.data),expected=buildBeamMotionAtlas(document,l);
    if(actual.width!==1024||actual.height!==1024||sha256Bytes(actual.rgba)!==expected.metadata.atlasRgbaSha256)fail('atlas pixels');
    result.push({layerId:l.id,texture:name,atlasRgbaSha256:expected.metadata.atlasRgbaSha256,allFramesRead:true});
  }
  return result;
}
