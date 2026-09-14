import * as THREE from 'three';

interface Triangle {indices:[number,number,number];rank:number;depth:number}
/** Preview-only painter ordering within one normal-alpha mesh. This does not
 * solve intersecting/cyclic surfaces or sort triangles across separate objects. */
export class MeshTriangleOrder {
  private readonly source:Uint32Array;
  private readonly triangles:Triangle[];
  private index?:THREE.BufferAttribute;
  private sorted=false;
  private readonly modelView=new THREE.Matrix4();
  constructor(private readonly geometry:THREE.BufferGeometry){
    const p=geometry.getAttribute('position'),index=geometry.getIndex();
    this.source=Uint32Array.from(index?Array.from(index.array):Array.from({length:p.count},(_,i)=>i));
    const attributes=['position','uv','normal'].map(name=>geometry.getAttribute(name)).filter(Boolean);
    // Resolve equal-depth ties using corner data, never incoming face order.
    // Ranks use immutable base attributes; UVs/winding/deformation correspondence
    // are preserved because only the private draw index buffer is reordered.
    const entries:Array<{indices:[number,number,number];key:number[];rank:number}>=[];
    for(let i=0;i<this.source.length;i+=3){const indices=Array.from(this.source.slice(i,i+3)) as [number,number,number];
      entries.push({indices,rank:0,key:indices.flatMap(i=>attributes.flatMap(a=>Array.from({length:a.itemSize},(_,c)=>a.getComponent(i,c))))});}
    const canonical=[...entries].sort((a,b)=>{for(let i=0;i<a.key.length;i++){const d=a.key[i]-b.key[i];if(d)return d;}return 0;});
    canonical.forEach((t,i)=>t.rank=i);
    this.triangles=entries.map(t=>({indices:t.indices,rank:t.rank,depth:0}));
  }
  update(mesh:THREE.Mesh,camera:THREE.Camera):void {
    const material=mesh.material;
    if(Array.isArray(material)||!material.transparent||material.blending!==THREE.NormalBlending){
      if(this.sorted&&this.index){this.index.array.set(this.source);this.index.needsUpdate=true;this.sorted=false;}return;
    }
    if(!this.index){this.index=new THREE.BufferAttribute(this.source.slice(),1).setUsage(THREE.DynamicDrawUsage);this.geometry.setIndex(this.index);}
    mesh.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);
    this.modelView.multiplyMatrices(camera.matrixWorldInverse,mesh.matrixWorld);
    const e=this.modelView.elements,p=this.geometry.getAttribute('position');
    for(const t of this.triangles){let x=0,y=0,z=0;for(const i of t.indices){x+=p.getX(i);y+=p.getY(i);z+=p.getZ(i);}t.depth=(e[2]*x+e[6]*y+e[10]*z)/3+e[14];}
    this.triangles.sort((a,b)=>a.depth-b.depth||a.rank-b.rank);
    let changed=false,offset=0;for(const t of this.triangles)for(const i of t.indices){if(this.index.array[offset]!==i){this.index.array[offset]=i;changed=true;}offset++;}
    if(changed)this.index.needsUpdate=true;this.sorted=true;
  }
}
