import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeTexture,textureInfo} from '../packages/nwn-format/src/textures.js';
import {readTga,readNwnTga} from '../packages/nwn-format/src/binary.js';

function pixels(){
  const width=8,height=16,rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;rgba.set([x*31,y*17,(x*19+y*23)%256,(x*37+y*11)%256],i);
  }
  return{width,height,rgba};
}
function oldTopFirst(p:ReturnType<typeof pixels>){
  const old=makeTexture(p);old[17]=0x28;
  for(let i=0;i<p.rgba.length;i+=4)old.set([p.rgba[i+2],p.rgba[i+1],p.rgba[i],p.rgba[i+3]],18+i);
  return old;
}
test('native bottom-first addressing preserves every asymmetric RGBA texel, including zero-alpha RGB',()=>{
  const p=pixels(),bytes=makeTexture(p);assert.equal(bytes[17],8);assert.equal(bytes[2],2);
  // Literal locations in the serialized payload: bottom-left, bottom-right,
  // top-left, top-right. This does not use the production readback decoder.
  const raw=(pixel:number)=>{const i=18+pixel*4;return[bytes[i+2],bytes[i+1],bytes[i],bytes[i+3]];};
  assert.deepEqual(raw(0),[0,255,89,165]);assert.deepEqual(raw(7),[217,255,222,168]);
  assert.deepEqual(raw(120),[0,0,0,0]);assert.deepEqual(raw(127),[217,0,133,3]);
  for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)assert.deepEqual(raw((p.height-1-y)*p.width+x),[...p.rgba.subarray((y*p.width+x)*4,(y*p.width+x+1)*4)]);
  assert.deepEqual(readTga(bytes).rgba,p.rgba);assert.deepEqual(readNwnTga(bytes).rgba,p.rgba);
});
test('old top-first output passes standards roundtrip yet maps wrong rows under NWN semantics; new resource names cannot alias it',()=>{
  const p=pixels(),old=oldTopFirst(p),fixed=makeTexture(p);
  assert.deepEqual(readTga(old).rgba,p.rgba);
  assert.notDeepEqual(readNwnTga(old).rgba,p.rgba);
  assert.deepEqual([...readNwnTga(old).rgba.subarray(0,4)],[0,255,89,165]);
  const resref=(b:Uint8Array)=>'vfx_'+createHash('sha256').update(b).update(textureInfo('normal')).digest('hex').slice(0,12);
  assert.notEqual(resref(old),resref(fixed));
  assert.equal(readTga(old).origin,'top-left');assert.equal(readNwnTga(fixed).origin,'bottom-left');
});
