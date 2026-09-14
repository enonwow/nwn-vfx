import { DomainError, type Vec3 } from './model.js';

type Quadratic = [Vec3, Vec3, Vec3];
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const sub=(a:number[],b:number[])=>a.map((x,i)=>x-b[i]) as Vec3;
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const at=(q:Quadratic,t:number)=>q[0].map((x,i)=>x+t*(q[1][i]+t*q[2][i])) as Vec3;
const bernstein=(q:Quadratic)=>[q[0],q[0].map((x,i)=>x+q[1][i]/2) as Vec3,at(q,1)];

/** Isolate polynomial roots on [0,1] using the roots of its derivative.
 * Only cubic or lower polynomials occur (extrema of squared quadratic normals). */
function roots(p:number[]):number[] {
  while(p.length>1&&p.at(-1)===0)p=p.slice(0,-1);
  if(p.length<2)return [];
  if(p.length===2){const t=-p[0]/p[1];return t>0&&t<1?[t]:[];}
  const value=(t:number)=>p.reduceRight((s,x)=>s*t+x,0);
  const points=[0,...roots(p.slice(1).map((x,i)=>x*(i+1))),1].sort((a,b)=>a-b),out:number[]=[];
  for(const t of points)if(Math.abs(value(t))<1e-14)out.push(t);
  for(let i=1;i<points.length;i++){
    let a=points[i-1],b=points[i],fa=value(a);
    if(fa*value(b)>=0)continue;
    for(let j=0;j<60;j++){const m=(a+b)/2,fm=value(m);if(fa*fm<=0)b=m;else{a=m;fa=fm;}}
    out.push((a+b)/2);
  }
  return out;
}
function staysDefined(q:Quadratic,threshold:number):boolean {
  const controls=bernstein(q),length=Math.hypot(...q[0]);
  // Convex-hull projection is a cheap sufficient bound for ordinary motion.
  if(length>threshold&&controls.every(v=>dot(v,q[0])/length>threshold))return true;
  const scale=Math.max(...controls.map(v=>Math.hypot(...v)));
  if(!Number.isFinite(scale)||scale<=threshold)return false;
  const [a,b,c]=q.map(v=>v.map(x=>x/scale));
  const critical=roots([2*dot(a,b),2*(dot(b,b)+2*dot(a,c)),6*dot(b,c),4*dot(c,c)]);
  return [0,1,...critical].every(t=>Math.hypot(...at(q,t))>threshold);
}

/** The cross product of linearly moving edges is quadratic. Check continuous
 * face area and the area-weighted sum at each shared position index, including
 * between frames. UV indices are deliberately absent. No position welding. */
export function validateNormalMotion(a:Vec3[],b:Vec3[],faces:number[][],context:Record<string,unknown>):void {
  const sums:Quadratic[]=a.map(()=>[[0,0,0],[0,0,0],[0,0,0]]),areaBounds=a.map(()=>0);
  faces.forEach(([i,j,k],faceIndex)=>{
    const u=sub(a[j],a[i]),v=sub(a[k],a[i]),du=sub(sub(b[j],b[i]),u),dv=sub(sub(b[k],b[i]),v);
    const x=cross(du,v),y=cross(u,dv),q:Quadratic=[cross(u,v),x.map((n,c)=>n+y[c]) as Vec3,cross(du,dv)];
    if(!staysDefined(q,1e-10))throw new DomainError('VALIDATION_ERROR','Deformacja smooth tworzy trójkąt o zerowym lub zbyt małym polu.',{...context,faceIndex});
    const bound=Math.max(...bernstein(q).map(n=>Math.hypot(...n)));
    for(const index of [i,j,k]){areaBounds[index]+=bound;for(let p=0;p<3;p++)for(let c=0;c<3;c++)sums[index][p][c]+=q[p][c];}
  });
  sums.forEach((q,vertexIndex)=>{
    if(areaBounds[vertexIndex]&&!staysDefined(q,areaBounds[vertexIndex]*1e-8))
      throw new DomainError('VALIDATION_ERROR','Deformacja smooth ma nieokreśloną lub niestabilną normalną. Popraw winding lub ruch wierzchołków.',{...context,vertexIndex});
  });
}
