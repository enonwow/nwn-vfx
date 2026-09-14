import { DomainError } from '../../../packages/core/src/model.js';
import { assertPreviewCamera } from '../../../packages/core/src/camera.js';
import { inputValidators, outputValidators } from './generated/webmcp-contracts.js';
export { operationSchemas, inputSchemas, validateResult } from './generated/webmcp-contracts.js';

export function validateToolInput(name: string, value: unknown): void {
  const validate = inputValidators[name];
  if (!validate || !validate(value)) throw new DomainError('INVALID_INPUT', 'Tool arguments do not match the published schema.', validate?.errors);
  if (name === 'studio.preview.request' && (value as any).input?.camera !== undefined) assertPreviewCamera((value as any).input.camera);
}
export function validateOperationOutput(name: string, value: unknown): void {
  const validate = outputValidators[name];
  if (!validate || !validate(value)) throw new DomainError('INVALID_RESULT', 'Operacja zwróciła niepoprawny wynik.', { operation: name, errors: validate?.errors ?? [] });
}
