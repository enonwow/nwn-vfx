import { DomainError } from '../../../packages/core/src/model.js';
import { NATIVE_WORKFLOW } from '../../../packages/core/src/native-workflow.js';
import { hash, type Job } from './store.js';

export function nativeTestStatus(job: Job, snapshot: string) {
  if (job.type !== 'candidate.build') throw new DomainError('INVALID_CANDIDATE', 'Podaj ID zadania candidate.build, a nie podglądu lub artefaktu.');
  const ready = job.status === 'succeeded';
  const failed = job.status === 'failed' || job.status === 'cancelled';
  return {
    version: NATIVE_WORKFLOW.contract,
    candidateId: job.id, projectId: job.projectId, revision: job.revision,
    snapshotSha256: hash(snapshot), candidateStatus: job.status,
    state: ready ? 'awaiting_qualified_runner' : failed ? 'candidate_failed' : 'candidate_pending',
    externalState: 'not_observed_by_studio',
    nativeVerified: false, nativeTestAvailable: false, proofCompleteness: 'missing',
    candidateArtifacts: ready ? job.artifacts : [], nativeArtifacts: [],
    dependencies: [
      { id: 'candidate_resources', status: ready ? 'ready' : failed ? 'failed' : 'missing', message: ready ? 'Zasoby kandydata są gotowe. Eksport nie jest testem NWN.' : failed ? 'Budowa kandydata nie zakończyła się powodzeniem.' : 'Oczekiwanie na ukończenie budowy kandydata.' },
      { id: 'native_geometry_gate', status: 'missing', message: 'Studio nie otrzymało kwalifikowanego dowodu natywnego zapisu i geometrii tego kandydata.' },
      { id: 'entry_surface_observation', status: 'missing', message: 'Wymagana jest autentyczna obserwacja powierzchni wejścia związana z zapisanym MOD, Area i pozycją. Stan zewnętrzny nie jest odczytywany przez Studio.' },
      { id: 'qualified_runtime_runner', status: 'missing', message: 'Nie skonfigurowano kwalifikowanego runnera. Zewnętrzny operator korzysta z centralnej ścieżki Aurora i AUR-S07.' },
      { id: 'runtime_capture', status: 'missing', message: 'Brak przyjętego obrazu lub filmu z rzeczywistego NWN dla tego kandydata.' },
      { id: 'runtime_validation', status: 'missing', message: 'Brak kwalifikowanego wyniku walidacji tożsamości, logu i obserwacji natywnej.' },
    ],
  };
}
