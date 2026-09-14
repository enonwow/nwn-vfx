import { DomainError, type Vec3 } from './model.js';

export interface PreviewCamera { position: Vec3; target: Vec3; fov: number }
export const DEFAULT_PREVIEW_CAMERA: PreviewCamera = { position: [3.4,-5.4,2.75], target: [0,0,.7], fov: 39 };
export const PREVIEW_CAMERA_LIMITS = { coordinate: 100, minDistance: .1, maxDistance: 90, minFov: 10, maxFov: 120, minHorizontalDistance: .0001 } as const;

/** Fixed world-Z up, metres and vertical FOV in degrees; never fit or scale content. */
export function assertPreviewCamera(value: unknown): asserts value is PreviewCamera {
  const fail = (): never => { throw new DomainError('VALIDATION_ERROR', 'Kamera wymaga position/target w ±100 m, odległości 0.1–90 m i pionowego FOV 10–120°. Kierunek nie może być równoległy do osi Z (odległość XY co najmniej 0.0001 m).'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const camera = value as Record<string, unknown>;
  if (Object.keys(camera).length !== 3 || !['position','target','fov'].every(key => Object.hasOwn(camera,key))) fail();
  const vector = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= PREVIEW_CAMERA_LIMITS.coordinate);
  if (!vector(camera.position) || !vector(camera.target) || typeof camera.fov !== 'number' || !Number.isFinite(camera.fov)
    || camera.fov < PREVIEW_CAMERA_LIMITS.minFov || camera.fov > PREVIEW_CAMERA_LIMITS.maxFov) fail();
  const p = camera.position as Vec3, t = camera.target as Vec3;
  const distance = Math.hypot(p[0]-t[0],p[1]-t[1],p[2]-t[2]);
  if (distance < PREVIEW_CAMERA_LIMITS.minDistance || distance > PREVIEW_CAMERA_LIMITS.maxDistance
    || Math.hypot(p[0]-t[0],p[1]-t[1]) < PREVIEW_CAMERA_LIMITS.minHorizontalDistance) fail();
}
