import {DomainError,type MeshLayer,type Vec3} from './model.js';

export const DEFORMATION_INTERPOLATION_MODES=['linear','monotone-cubic','monotone-cubic-loop'] as const;
export const DEFORMATION_INTERPOLATION_CAPABILITIES={version:1,minimumStudioVersion:'0.23.0',documentSchemaVersion:14,
  field:'deformationInterpolation',modes:DEFORMATION_INTERPOLATION_MODES,default:'linear',reset:'null-in-layer.set',
  method:'componentwise-monotone-Hermite-PCHIP',minimumKnotSpacingSeconds:0.000001,
  boundary:{'monotone-cubic':'zero-end-velocity','monotone-cubic-loop':'periodic-shared-tangent-exact-endpoint-positions'},
  curveContinuity:'C1',sampledContinuity:'C0-linear-60Hz',overshoot:'none-per-coordinate-between-adjacent-knots',
  pinnedVertices:'preserved-exactly',selfIntersectionGuarantee:false,nativeVerified:false} as const;

/** Weighted harmonic derivative (Fritsch–Butland). Endpoints are an explicit
 * Studio extension: clamped zero or a shared periodic derivative. */
function tangent(previous:number,next:number,hPrevious:number,hNext:number):number {
  if(previous===0||next===0||Math.sign(previous)!==Math.sign(next))return 0;
  const w1=2*hNext+hPrevious,w2=hNext+2*hPrevious;
  return (w1+w2)/(w1/previous+w2/next);
}
export function createMonotoneDeformationCurve(layer:MeshLayer) {
  if(layer.geometry.kind!=='custom'||!layer.animation.vertices?.length)
    throw new DomainError('DEFORMATION_INTERPOLATION_INVALID','Gładka interpolacja wymaga geometrii custom i kluczy vertices.',{layerId:layer.id});
  const loop=layer.deformationInterpolation==='monotone-cubic-loop';
  const knots=layer.animation.vertices.map(k=>({time:k.time,value:k.value}));
  if(knots[0].time>0)knots.unshift({time:0,value:layer.geometry.vertices});
  if(knots.at(-1)!.time<layer.duration)knots.push({time:layer.duration,value:knots.at(-1)!.value});
  const count=knots.length,vertices=layer.geometry.vertices.length;
  const h=knots.slice(1).map((k,i)=>k.time-knots[i].time);
  if(h.some(dt=>!Number.isFinite(dt)||dt<0.000001))
    throw new DomainError('DEFORMATION_INTERPOLATION_INVALID','Gładkie klucze wymagają odstępu co najmniej 0.000001 s, także od granic warstwy.',{layerId:layer.id});
  if(loop&&knots[0].value.some((p,i)=>p.some((n,j)=>n!==knots.at(-1)!.value[i][j])))
    throw new DomainError('DEFORMATION_INTERPOLATION_INVALID','Gładka pętla wymaga identycznych pozycji początku i końca; klucze nie zostaną poprawione automatycznie.',{layerId:layer.id});
  const slopes=knots.slice(1).map((k,i)=>k.value.map((p,v)=>p.map((n,c)=>(n-knots[i].value[v][c])/h[i]) as Vec3));
  const derivatives=knots.map(()=>Array.from({length:vertices},()=>[0,0,0] as Vec3));
  for(let i=1;i<count-1;i++)for(let v=0;v<vertices;v++)for(let c=0;c<3;c++)
    derivatives[i][v][c]=tangent(slopes[i-1][v][c],slopes[i][v][c],h[i-1],h[i]);
  if(loop)for(let v=0;v<vertices;v++)for(let c=0;c<3;c++)
    derivatives[0][v][c]=derivatives[count-1][v][c]=tangent(slopes.at(-1)![v][c],slopes[0][v][c],h.at(-1)!,h[0]);
  // Normalized cubic coefficients avoid powers of small absolute time values.
  const coefficients=knots.slice(1).map((k,i)=>k.value.map((p,v)=>p.map((end,c)=>{
    const start=knots[i].value[v][c],m0=h[i]*derivatives[i][v][c],m1=h[i]*derivatives[i+1][v][c];
    return [2*(start-end)+m0+m1,3*(end-start)-2*m0-m1,m0,start];
  })));
  let maxAcceleration=0,maxSpan=0;
  for(let v=0;v<vertices;v++){
    maxSpan=Math.max(maxSpan,Math.hypot(...[0,1,2].map(c=>{
      const values=knots.map(k=>k.value[v][c]);return Math.max(...values)-Math.min(...values);
    })));
    for(let i=0;i<h.length;i++){
      const a0=coefficients[i][v].map(([a,b])=>2*b/h[i]**2),a1=coefficients[i][v].map(([a,b])=>(6*a+2*b)/h[i]**2);
      maxAcceleration=Math.max(maxAcceleration,Math.hypot(...a0),Math.hypot(...a1));
    }
  }
  function at(time:number,velocity=false):Vec3[] {
    if(velocity&&(time<0||time>layer.duration))return derivatives[0].map(()=>[0,0,0]);
    const t=Math.max(0,Math.min(layer.duration,time));
    const exact=knots.findIndex(k=>k.time===t);
    if(exact>=0)return (velocity?derivatives[exact]:knots[exact].value).map(v=>[...v]);
    let i=0;while(i<h.length-1&&t>knots[i+1].time)i++;
    const u=(t-knots[i].time)/h[i];
    return coefficients[i].map((p,v)=>p.map(([a,b,c,d],axis)=>{
      if(velocity)return (3*a*u*u+2*b*u+c)/h[i];
      const start=knots[i].value[v][axis],end=knots[i+1].value[v][axis];
      if(start===end)return start;
      // Guard only floating-point roundoff at extrema, not an authored repair.
      return Math.max(Math.min(start,end),Math.min(Math.max(start,end),((a*u+b)*u+c)*u+d));
    }) as Vec3);
  }
  return {at:(time:number)=>at(time),velocity:(time:number)=>at(time,true),
    boundary:loop?'periodic' as const:'clamped' as const,knots:knots.map(k=>k.time),
    // Linear interpolation error is bounded by h²/8 sup||f''||. The curve is
    // C1 with piecewise bounded second derivatives. Global coordinate range
    // supplies a second conservative bound for unusually close source knots.
    sampleErrorBound:(period:number,clippedBoundary=false)=>Math.min(maxSpan,maxAcceleration*period*period/8+
      (clippedBoundary?period/4*(Math.max(...derivatives[0].map(v=>Math.hypot(...v)))+Math.max(...derivatives.at(-1)!.map(v=>Math.hypot(...v)))):0))*(1+1e-12)};
}
