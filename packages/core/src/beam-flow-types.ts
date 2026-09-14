import type {Vec3} from './model.js';
/** Logical endpoints are authoring coordinates; native transforms come from the consumer. */
export interface BeamBinding {
  role:'flow'|'source'|'target'; source:Vec3; target:Vec3;
  direction:'source-to-target'|'target-to-source';
  pulse?:{period:number;duty:number};
  /** Explicit creature-model node for a separate endpoint FnF (progfx type 12). */
  node?:string;
}
export const BEAM_FLOW_CAPABILITIES={version:3,profile:'fountain-p2p-bezier-finite-v1',documentSchemaVersion:19,
  minimumStudioVersion:'0.27.0',bindingField:'beamBinding',roles:['flow','source','target'],
  maxLayers:8,maxPulses:48,curve:'zero-handle-cubic',progress:'age/life',emission:'finite-linear-birthrate',
  endpoints:'separate-finite-fnf',arbitraryGracefulStop:false,nativeVerified:false,
  staticStrand:{profile:'finite-flow-static-strand-v1',documentSchemaVersion:21,minimumStudioVersion:'0.28.1',maxLayers:1,
    sharedMainModel:true,sharedEndpoints:true,previewFlowSpeed:0,nativeMotionExport:false,lifetime:'until-consumer-removal',handReturn:false},
  staticStrands:{profile:'finite-flow-static-strands-v2',documentSchemaVersion:22,minimumStudioVersion:'0.28.2',maxLayers:4,
    sharedMainModel:true,sharedEndpoints:true,sharedDirection:true,previewFlowSpeed:0,nativeMotionExport:false,
    independentEmitterParameters:['width','alpha','color','radius','delay','lightningScale','segments','texture','blend'],
    lifetime:'until-consumer-removal',handReturn:false,nativeSeedControl:false,smoothNativeMotion:false}} as const;
