import { makeDocument, makeLayer, makeMeshLayer, type EffectDocument, type MeshLayer, type Vec3 } from '../../packages/core/src/model.js';
import { createTextureAsset } from '../../packages/core/src/textures.js';
import { rgbaPng } from './rgba-texture.js';

/** Portable textured workload. It deliberately contains no consumer project IDs,
 * paths, images or geometry. Grain keeps PNG decoding representative of assets. */
export function texturedVideoDocument(): EffectDocument {
  const assets = [1024, 512, 512].map((size, index) => {
    let seed = 12345 + index * 9001;
    const png = rgbaPng(size, size, (x, y) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const grain = 104 + (seed >>> 25), stripe = index === 2 && Math.floor(x / 32) % 2 ? 65 : 0;
      const value = grain + stripe;
      const alpha = index === 1 ? Math.round(255 * Math.max(0, Math.min(1, (1 - Math.hypot(x / size * 2 - 1, y / size * 2 - 1)) * 3))) : 255;
      return [value, value, value, alpha];
    });
    return createTextureAsset(`fixture-grain-${size}-${index}.png`, Buffer.from(png).toString('base64'));
  });
  const main: MeshLayer = { ...makeMeshLayer('moving-textured', 'Moving textured marker'), duration: 4,
    geometry: { kind: 'box', dimensions: [.48, .24, .72] }, color: '#00dfff', alpha: 1, texture: `asset:${assets[0].id}`,
    animation: { position: [{ time: 0, value: [-.75, 0, 1.5] }, { time: .8, value: [-.2, 0, .3] },
      { time: 1.2, value: [.1, 0, .3] }, { time: 2.5, value: [.6, 0, 1.2] }, { time: 4, value: [1.1, 0, .5] }] } };
  const meshes: MeshLayer[] = Array.from({ length: 21 }, (_, index) => {
    const angle = index / 21 * Math.PI * 2, phase = .2 + index % 7 * .48;
    const position: Vec3 = [Math.cos(angle) * .85, Math.sin(angle) * .85, .08 + index % 3 * .12];
    return { ...makeMeshLayer(`staged-mesh-${index}`), duration: 4, color: '#c97b32', alpha: .02,
      texture: `asset:${assets[index % 3].id}`, blend: index % 3 === 1 ? 'additive' : 'normal', position,
      geometry: index % 2 ? { kind: 'ring', innerRadius: .10, outerRadius: .25, segments: 16 } : { kind: 'box', dimensions: [.12, .10, .20] },
      // A faint initial frame warms every geometry/texture. Later appearances
      // exercise hidden->visible transitions without allocating another scene.
      animation: { alpha: [{ time: 0, value: .02 }, { time: .03, value: .02 }, { time: .06, value: 0 },
        { time: phase, value: 0 }, { time: phase + .1, value: .65 }, { time: phase + .4, value: .3 },
        { time: phase + .7, value: 0 }, { time: 4, value: 0 }],
      orientation: [{ time: 0, value: [0, 0, 1, 0] }, { time: 4, value: [0, 0, 1, 1.3] }],
      scale: [{ time: 0, value: .7 }, { time: 4, value: 1.3 }] } };
  });
  const emitters = Array.from({ length: 10 }, (_, index) => ({ ...makeLayer(`staged-particles-${index}`),
    count: 16 + index, start: index * .16, duration: .7, life: .9, update: 'Fountain' as const,
    position: [Math.cos(index) * .55, Math.sin(index) * .55, .08] as Vec3,
    color: '#ff9933', midColor: '#cc6611', endColor: '#882d10', alpha: .5, midAlpha: .6, endAlpha: 0,
    size: .04, midSize: .1, endSize: .16, midPercent: .4, speed: .6, gravity: .5,
    texture: `asset:${assets[1 + index % 2].id}` as const, blend: index % 2 ? 'additive' as const : 'normal' as const,
  }));
  return { ...makeDocument('empty', 'Portable 32-layer textured video'), schemaVersion: 3, duration: 4,
    assets, layers: [main, ...meshes, ...emitters] };
}
