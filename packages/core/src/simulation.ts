import {sampleBeamFlow} from './beam-flow.js';
import type { EmitterLayer, Vec3 } from './model.js';

export const EMITTER_ORIENTATION_CAPABILITIES = {
  representation: 'axis-angle', components: ['axisX', 'axisY', 'axisZ', 'angle'],
  angleUnit: 'radians', angleRange: [-8 * Math.PI, 8 * Math.PI], default: [0, 0, 1, 0],
  localAxis: '+Z', handedness: 'right-handed', velocitySpace: 'emitter', gravitySpace: 'world',
  scaleBehavior: 'existing-full-displacement', animated: false,
} as const;

/** Row-major rotation matrix, or null for the exact historical neutral path. */
export type PreparedEmitterOrientation = readonly [number, number, number, number, number, number, number, number, number] | null;

/** Prepare once per document, then reuse for every particle and frame. Input must be validated. */
export function prepareEmitterOrientation(layer: Pick<EmitterLayer, 'orientation'>): PreparedEmitterOrientation {
  if (!layer.orientation || layer.orientation[3] === 0) return null;
  const [ax, ay, az, angle] = layer.orientation;
  // Accepted axes are unit length within the shared validation tolerance.
  const length = Math.hypot(ax, ay, az), x = ax / length, y = ay / length, z = az / length;
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [t*x*x+c, t*x*y-s*z, t*x*z+s*y,
    t*x*y+s*z, t*y*y+c, t*y*z-s*x,
    t*x*z-s*y, t*y*z+s*x, t*z*z+c];
}

/** Preview-only ballistic approximation. Native NWN mass is not qualified by this helper. */
export function sampleEmitterPosition(
  layer: EmitterLayer, age: number, azimuth: number, theta: number, speed: number,
  prepared: PreparedEmitterOrientation = prepareEmitterOrientation(layer),
): Vec3 {
  if(layer.beamBinding?.role==='flow')return sampleBeamFlow(layer.beamBinding,age,layer.life);
  const vx = Math.cos(azimuth) * Math.sin(theta) * speed;
  const vy = Math.sin(azimuth) * Math.sin(theta) * speed;
  const vz = Math.cos(theta) * speed;
  // Keep the multiplication order of the original renderer for omitted/zero orientation.
  const x = (prepared ? prepared[0]*vx + prepared[1]*vy + prepared[2]*vz : vx) * age;
  const y = (prepared ? prepared[3]*vx + prepared[4]*vy + prepared[5]*vz : vy) * age;
  const z = (prepared ? prepared[6]*vx + prepared[7]*vy + prepared[8]*vz : vz) * age
    - .5 * layer.gravity * age * age;
  const origin=layer.beamBinding?layer.beamBinding[layer.beamBinding.role as 'source'|'target']:layer.position;
  return [origin[0] + x * layer.scale, origin[1] + y * layer.scale, origin[2] + z * layer.scale];
}
