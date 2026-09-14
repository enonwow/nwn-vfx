"""Offline software-rendered diagnosis; never reads or controls a game process."""
import json, math, hashlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

root=Path(r'C:\Projects\the last city\assets\vfx\wampir\bijace-serce\export\r4\candidate')
out=Path('output/texture-orientation-audit');out.mkdir(parents=True,exist_ok=True)
doc=json.loads((root/'effect-document.json').read_text(encoding='utf8'))
g=doc['layers'][0]['geometry'];vertices=np.asarray(g['vertices']);faces=np.asarray(g['faces']);uv=np.asarray(g['uv']);uvfaces=np.asarray(g['uvFaces'])
texture=np.asarray(Image.open(root/'vfx_0f8dabf324e1.tga').convert('RGBA'))
normals=np.zeros_like(vertices)
for f in faces:
 a,b,c=vertices[f];n=np.cross(b-a,c-a)
 for i in f:normals[i]+=n
normals/=np.linalg.norm(normals,axis=1)[:,None]

def render(angle,flipped=False,depth_write=True):
 size=440;pos=np.array([math.sin(angle),-math.cos(angle),.25]);forward=-pos/np.linalg.norm(pos)
 right=np.cross(forward,[0,0,1]);right/=np.linalg.norm(right);up=np.cross(right,forward)
 p=np.column_stack((vertices@right,vertices@up,vertices@forward))
 scale=850;p[:,:2]=p[:,:2]*[scale,-scale]+size/2
 image=np.zeros((size,size,3),dtype=np.uint8)+25;depth=np.full((size,size),np.inf);mask=np.zeros((size,size),dtype=bool)
 light=np.array([-.3,-.8,.6]);light/=np.linalg.norm(light)
 for face,tf in zip(faces,uvfaces):
  a,b,c=p[face];den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
  if den>=-1e-10:continue
  x0=max(0,int(np.floor(min(a[0],b[0],c[0]))));x1=min(size-1,int(np.ceil(max(a[0],b[0],c[0]))))
  y0=max(0,int(np.floor(min(a[1],b[1],c[1]))));y1=min(size-1,int(np.ceil(max(a[1],b[1],c[1]))))
  if x0>x1 or y0>y1:continue
  yy,xx=np.mgrid[y0:y1+1,x0:x1+1];xx=xx+.5;yy=yy+.5
  w0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
  w1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w2=1-w0-w1
  z=w0*a[2]+w1*b[2]+w2*c[2];inside=(w0>=0)&(w1>=0)&(w2>=0)&(z<depth[y0:y1+1,x0:x1+1])
  w=np.stack((w0,w1,w2),axis=-1);t=w@uv[tf];t=np.clip(t,0,1)
  tx=t[:,:,0]*(texture.shape[1]-1);ty=(t[:,:,1] if flipped else 1-t[:,:,1])*(texture.shape[0]-1)
  ix=np.floor(tx).astype(int);iy=np.floor(ty).astype(int);jx=np.minimum(ix+1,texture.shape[1]-1);jy=np.minimum(iy+1,texture.shape[0]-1)
  dx=(tx-ix)[...,None];dy=(ty-iy)[...,None]
  col=(1-dy)*((1-dx)*texture[iy,ix,:3]+dx*texture[iy,jx,:3])+dy*((1-dx)*texture[jy,ix,:3]+dx*texture[jy,jx,:3])
  n=w@normals[face];n/=np.maximum(np.linalg.norm(n,axis=-1)[...,None],1e-20)
  shade=.32+.68*np.clip(n@light,0,1);col=np.clip(col*shade[...,None],0,255).astype(np.uint8)
  image[y0:y1+1,x0:x1+1][inside]=col[inside];mask[y0:y1+1,x0:x1+1][inside]=True
  if depth_write:depth[y0:y1+1,x0:x1+1][inside]=z[inside]
 return Image.fromarray(image),mask

canvas=Image.new('RGB',(880,4*475),(25,25,25));draw=ImageDraw.Draw(canvas);stats=[]
for i,angle in enumerate([0,math.pi/2,math.pi,3*math.pi/2]):
 a,ma=render(angle);b,mb=render(angle,True);assert np.array_equal(ma,mb)
 canvas.paste(a,(0,i*475+30));canvas.paste(b,(440,i*475+30))
 draw.text((10,i*475+8),f'{i*90} deg: expected PNG/UV',fill='white');draw.text((450,i*475+8),'same mesh / top-first TGA read bottom-first',fill='white')
 a.save(out/f'expected-{i*90}.png');b.save(out/f'legacy-bottom-read-{i*90}.png')
 stats.append({'angle':i*90,'silhouetteIdentical':True,'foregroundPixels':int(ma.sum()),'changedPixels':int((np.any(np.asarray(a)!=np.asarray(b),axis=-1)&ma).sum())})
canvas.save(out/'orientation-comparison.png')
(out/'software-render-proof.json').write_text(json.dumps({'source':'r4 unchanged geometry, UV and texture','nativeVerified':False,'depthWrite':True,'alpha':1,'comparison':'only interpretation of serialized texture rows differs','stats':stats},indent=2))
print(json.dumps(stats))
