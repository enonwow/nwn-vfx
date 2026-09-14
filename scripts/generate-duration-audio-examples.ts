import {mkdir,writeFile} from 'node:fs/promises';
import {durationAudioFixture} from '../tests/fixtures/duration-audio.js';
const out='docs/agents/examples/duration-audio';await mkdir(out,{recursive:true});const {document,wav,asset}=durationAudioFixture();
await writeFile(`${out}/project.json`,JSON.stringify(document,null,2));await writeFile(`${out}/${asset.name}`,wav);
await writeFile(`${out}/changes.json`,JSON.stringify([...document.audioClips!.map(clip=>({type:'audio.add',clip})),{type:'audio.set',clipId:'up',values:{gainDb:-18,offset:.1}}],null,2));
console.log(JSON.stringify({directory:out,technicalFixtureOnly:true,period:document.duration}));
