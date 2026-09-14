import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {buildBeamTexture} from '../packages/core/src/beam-texture.js';
import {resolveTexture} from '../packages/core/src/textures.js';
const p=JSON.parse(readFileSync('output/releases/0.26.1/diagnostic-project.json','utf8')),l=p.document.layers[0],src=resolveTexture(p.document,l.texture);
const mapped=buildBeamTexture(p.document,{...l,textureMapping:{axis:'u',fit:'alpha-bounds'}});
let nonzero=0,alphaSum=0;for(let i=3;i<src.rgba.length;i+=4){if(src.rgba[i])nonzero++;alphaSum+=src.rgba[i];}
const report={sourceProjectId:'tlc-wampir-drain-life',sourceRevision:3,inspectedDiagnosticProjectId:p.id,asset:p.document.assets.find((a:any)=>'asset:'+a.id===l.texture).source,width:src.width,height:src.height,nonzeroPixels:nonzero,nonzeroFraction:nonzero/(src.width*src.height),meanAlpha:alphaSum/(255*src.width*src.height),existing:{segments:l.segments,width:l.width,alpha:l.alpha,oldPreviewAxis:'U over entire beam',nativeAxis:'V on each segment'},explicitDerivative:mapped.metadata,nativeVerified:false};
mkdirSync('output/beam-texture-research',{recursive:true});writeFileSync('output/beam-texture-research/source-analysis.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
