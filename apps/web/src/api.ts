import type { Result } from '../../../packages/core/src/model.js';
export class ApiError extends Error { constructor(public code: string, message: string, public details?: unknown) { super(message); } }
export async function command<T = any>(operation: string, input: Record<string, unknown> = {}, idempotencyKey?: string): Promise<T> {
  const response = await fetch('/api/commands', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json','X-NWN-VFX-Document-Schema':'24', 'X-NWN-VFX-Composition-Preview':'1' },
    body: JSON.stringify({ operation, input, ...(idempotencyKey ? { idempotencyKey } : {}) }) });
  const result = await response.json() as Result<T>;
  if (result.status === 'failed' || !response.ok) throw new ApiError(result.error?.code || 'HTTP_ERROR', result.error?.message || 'Nie udało się wykonać operacji.', result.error?.details);
  return result.data as T;
}
export const write = <T = any>(operation: string, input: Record<string, unknown>, key: string = crypto.randomUUID()) => command<T>(operation, input, key);
