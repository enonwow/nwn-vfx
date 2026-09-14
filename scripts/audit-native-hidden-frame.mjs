// Offline source/evidence audit. Never imports or invokes a native runner.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';

const central='C:/Projects/aurora-web/backend/scripts';
const recorded='C:/Projects/the last city/assets/vfx/wampir/ugryzienie/native/r25';
const out=resolve('output/native-hidden-frame-r25-audit');mkdirSync(out,{recursive:true});
const runnerPath=join(central,'aurora-toolset-binary-module-native-geometry.mjs');
const atomPath=join(central,'restore-aurora-toolset-frame-noactivate.mjs');
const runner=readFileSync(runnerPath,'utf8'),atom=readFileSync(atomPath,'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const manifestPath=join(recorded,'geometry/binary-native-geometry-manifest.json'),manifest=read(manifestPath);
const profilePath=join(recorded,'profiles/installed-profile.json');
const before=new Map([runnerPath,atomPath,manifestPath,profilePath].map(p=>[p,hash(readFileSync(p))]));

// Execute only the existing process-assignment statement, under a mock that
// shadows Get-Process. No native P/Invoke, process enumeration or window work.
const statement=atom.split(/\r?\n/).find(line=>line.startsWith('$ps=@(Get-Process '));
assert(statement);assert(!statement.includes('AuroraFrameRestore'));
const mock=`$ErrorActionPreference='Stop'\nfunction Get-Process { [pscustomobject]@{Id=4242;Responding=$true} }\n`;
const execute=text=>{
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',text],{encoding:'utf8',windowsHide:true,timeout:10000});
  if(result.error)throw result.error;
  return {exitCode:result.status,stdout:result.stdout.trim(),stderr:result.stderr.trim()};
};
const typed=execute(mock+statement+'\n$pid');
assert.equal(typed.exitCode,0,typed.stderr);assert.equal(typed.stdout,'4242');
const untyped=execute(mock+statement.replace('[uint32]$pid=','$pid='));
assert.notEqual(untyped.exitCode,0);assert.match(untyped.stderr,/VariableNotWritable/);
const version=execute('$PSVersionTable.PSVersion.ToString()');assert.equal(version.exitCode,0);

// Execute actual manifest admission and observeGeometry body in a VM where
// every native/file mutation port rejects. This is a TEST SIMULATION.
const requireFn=runner.split(/\r?\n/).find(line=>line.startsWith('function requireManifest('));
const observe=runner.slice(runner.indexOf('function observeGeometry(area)'),runner.indexOf('function finalizeGeometry('));
assert(requireFn&&observe.startsWith('function observeGeometry'));
let nativeCalls=0;
const forbidden=()=>{nativeCalls++;throw new Error('Offline audit prohibits native ports');};
const context={manifestPath,profilePath,existsSync:()=>true,readJson:()=>structuredClone(manifest),
  sha256:()=>hash(readFileSync(profilePath)),toolsetProcesses:forbidden,runAtom:forbidden,atom:forbidden,writeJson:forbidden,
  fail:(code,message)=>{throw Object.assign(new Error(message),{code});}};
assert.throws(()=>runInNewContext(requireFn+'\n'+observe+'\nobserveGeometry({});',context),
  {code:'BINARY_NATIVE_GEOMETRY_MANIFEST_STATE_INVALID'});
assert.equal(nativeCalls,0);
const allowlist=runner.match(/if \(!name \|\| !\[([^]*?)\]\.includes\(name\)\)/)?.[1];
assert(allowlist);const commands=Array.from(allowlist.matchAll(/"([^"]+)"/g),m=>m[1]);
assert(!commands.some(c=>/hidden|restore/i.test(c)));
assert(!runner.includes('restore-aurora-toolset-frame-noactivate'));

const recordedWindows=read(join(recorded,'preparation/after-area-open-failure-windows.json'));
const failure=read(join(recorded,'preparation/native-geometry-observe.json'));
assert.equal(failure.blockerCode,'binary_native_child_process_failed');
assert(failure.message.includes('No visible Toolset module window matched parts'));
const report={version:'studio-native-hidden-frame-audit/v1',kind:'offline-audit',nativeActionTaken:false,
  centralFiles:Array.from(before,([path,sha256])=>({path,sha256})),recordedState:{
    status:manifest.status,blockerCode:manifest.blockerCode,profileSha256:manifest.profileSha256,
    windows:recordedWindows.filter(w=>w.visible||w.className==='TfrmFrame'),
    postFailureProcesses:failure.postFailureProcesses},
  tests:{typedPidCollisionHypothesisRefuted:typed,untypedAssignmentNegativeControl:untyped,powershellVersion:version.stdout,
    failedManifestRejectedBeforeNativePorts:true,nativeCalls,publicHiddenRestoreCommandAbsent:true},
  inspectedPublicCommands:commands,limitation:'No continuation implemented, deployed, or qualified; no current live state observed.'};
for(const [path,sha] of before)assert.equal(hash(readFileSync(path)),sha);
writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({report:join(out,'report.json'),testsPassed:4,nativeActionTaken:false,centralFilesUnchanged:true,
  typedAssignment:typed.stdout,untypedAssignmentFailure:'VariableNotWritable',failedManifestNativeCalls:nativeCalls}));
