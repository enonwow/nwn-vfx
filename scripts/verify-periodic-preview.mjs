import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='output/beam-periodic-pan-0290/',checks=[];
for(const label of ['animated','static']){
  const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',root+label+'.webm'],{windowsHide:true}).toString());
  const video=meta.streams[0];assert.equal(video.width,960);assert.equal(video.height,640);assert.equal(Number(video.nb_read_frames),108);assert.equal(video.avg_frame_rate,'30/1');
  execFileSync('ffmpeg',['-v','error','-i',root+label+'.webm','-ss','3.3','-frames:v','1','-y',root+label+'-t3.3.png'],{windowsHide:true});
  checks.push({label,...video,duration:meta.format.duration});
}
const decode=label=>execFileSync('ffmpeg',['-v','error','-i',root+label+'.png','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{windowsHide:true,maxBuffer:4*1024*1024});
const a=decode('animated'),b=decode('static');let changedPixels=0,peakDifference=0;
for(let i=0;i<a.length;i+=4){let changed=false;for(let k=0;k<3;k++){const d=Math.abs(a[i+k]-b[i+k]);if(d)changed=true;peakDifference=Math.max(peakDifference,d);}if(changed)changedPixels++;}
assert(changedPixels>0,'Animated preview is identical to static');
const report={videos:checks,pngComparison:{changedPixels,peakDifference},nativeVerified:false};writeFileSync(root+'preview-readback.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
