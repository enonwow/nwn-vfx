import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const release=JSON.parse(readFileSync('package.json','utf8')).version;
const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const paths=execFileSync('rg',['--files','--hidden','apps','packages','tests','scripts','skills','docs/agents','AGENTS.md','README.md','package.json','package-lock.json','tsconfig.json','tsup.config.ts','vite.config.ts','.gitignore'],{encoding:'utf8',windowsHide:true})
  .trim().split(/\r?\n/).map(path=>path.replaceAll('\\','/')).sort();
const files=paths.map(path=>{const bytes=readFileSync(path);return{path,bytes:bytes.length,sha256:sha256(bytes)};});
const packagePath=`output/releases/nwn-vfx-studio-${release}.tgz`,packageBytes=readFileSync(packagePath);
const report={release,createdAt:new Date().toISOString(),gitState:'unborn/untracked workspace; hashes record local source, not a commit',
  package:{path:packagePath,bytes:packageBytes.length,sha256:sha256(packageBytes)},files};
const directory=resolve('docs/releases',release);mkdirSync(directory,{recursive:true});writeFileSync(resolve(directory,'source-manifest.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({release,files:files.length,package:report.package})+'\n');
