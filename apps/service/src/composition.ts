import {DomainError} from '../../../packages/core/src/model.js';
import {assertDocument} from '../../../packages/contracts/src/schema.js';
import {assertCompositionBudget,type CompositionInput,type CompositionSnapshot} from '../../../packages/core/src/composition.js';
import {canonical,hash,type Store} from './store.js';

export function freezeComposition(store:Store,input:CompositionInput):CompositionSnapshot {
  const sources:CompositionSnapshot['sources']=[];
  for(const i of input.instances){
    let source=sources.find(s=>s.projectId===i.projectId&&s.revision===i.revision);
    if(!source){const document=store.project(i.projectId,i.revision).document;source={projectId:i.projectId,revision:i.revision,document,snapshotSha256:hash(canonical(document))};sources.push(source);}
    if(i.snapshotSha256!==undefined&&i.snapshotSha256!==source.snapshotSha256)throw new DomainError('SNAPSHOT_MISMATCH','Rewizja ma inny hash niż żądana instancja.',{instanceId:i.id});
  }
  const snapshot:CompositionSnapshot={compositionVersion:1,input:structuredClone(input),sources};verifyComposition(snapshot);return snapshot;
}
export function verifyComposition(snapshot:CompositionSnapshot) {
  if(snapshot.compositionVersion!==1)throw new DomainError('COMPOSITION_VERSION','Nieobsługiwana kompozycja.');
  for(const s of snapshot.sources){
    if(hash(canonical(s.document))!==s.snapshotSha256)throw new DomainError('SNAPSHOT_MISMATCH','Uszkodzony snapshot kompozycji.');
    assertDocument(s.document);
  }
  assertCompositionBudget(snapshot);
}
