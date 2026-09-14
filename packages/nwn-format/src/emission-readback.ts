import {readAsciiMdl,numeric,textProperty,sampleTrack} from './mdl-reader.js';

/** An explicit sensitivity experiment, not a simulation of the retail engine.
 * Compare event-time values with controllers sampled before/after one frame.
 * Every global event still reaches every Explosion emitter. */
export function readEmissionTiming(source:Uint8Array) {
  const model=readAsciiMdl(source),animation=model.animations[0];
  const events=animation.events.filter(e=>e.name==='detonate').map(e=>e.time);
  const emitters=model.nodes.filter(n=>n.type==='emitter').map(node=>{
    const binding=animation.nodes.find(n=>n.name===node.name);
    const baseBirthrate=numeric(node,'birthrate');
    const birthrateKeys=binding?.tracks.birthrate??[[0,binding?.properties.birthrate?numeric(binding,'birthrate'):baseBirthrate]];
    return {node:node.name,update:textProperty(node,'update'),baseBirthrate,birthrateKeys,
      nonzeroIntervals:birthrateKeys.slice(1).flatMap((row,i)=>row[1]>0||birthrateKeys[i][1]>0?[[birthrateKeys[i][0],row[0]]]:[])};
  });
  const explosions=emitters.filter(e=>e.update==='Explosion');
  const scenarios=[];
  for(const hz of [30,60,120]) for(const phase of [0,.25,.5,.75]) for(const sampling of ['before-frame','after-frame'] as const) {
    let intendedParticles=0,sampledAtOwnEvents=0,foreignParticles=0,missingOwnBursts=0,changedOwnBursts=0;
    for(const time of events) {
      // Phase zero places the first boundary at dt. Event zero is dispatched
      // on the first update; the previous value there is the static controller.
      const dt=1/hz,first=(phase||1)*dt;
      const current=first+Math.max(0,Math.ceil((time-first)/dt-1e-10))*dt,previous=Math.max(0,current-dt);
      for(const emitter of explosions) {
        const intended=Math.round(Math.max(0,sampleTrack(emitter.birthrateKeys,time)[0]));
        const rate=sampling==='before-frame'&&previous===0?emitter.baseBirthrate:
          sampleTrack(emitter.birthrateKeys,Math.min(animation.length,sampling==='before-frame'?previous:current))[0];
        const particles=Math.round(Math.max(0,rate));
        intendedParticles+=intended;
        if(intended>0){sampledAtOwnEvents+=particles;if(particles===0)missingOwnBursts++;if(particles!==intended)changedOwnBursts++;}
        else foreignParticles+=particles;
      }
    }
    scenarios.push({hz,phase,sampling,intendedParticles,sampledAtOwnEvents,foreignParticles,missingOwnBursts,changedOwnBursts});
  }
  const constantSingleEvent=events.length===1&&explosions.every(e=>e.birthrateKeys.every(row=>row[1]===e.baseBirthrate));
  return {schemaVersion:1,nativeVerified:false,model:model.model,animation:animation.name,duration:animation.length,
    policy:events.length===0?'no-explosion-events':constantSingleEvent?'constant-single-event':'event-time-gated',
    events,minEventGap:events.length>1?Math.min(...events.slice(1).map((t,i)=>t-events[i])):null,
    emitters,experiment:{assumption:'Global events crossed within a frame use one sampled controller value; counts round to nearest integer. These are sensitivity scenarios, not observed NWN frames.',
      scenarios,allScenariosPreserveEventCounts:scenarios.every(s=>s.changedOwnBursts===0&&s.foreignParticles===0)}};
}
