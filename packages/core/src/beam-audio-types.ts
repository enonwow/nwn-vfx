/** Dependency-free capability metadata avoids initialization cycles in core. */
export const BEAM_AUDIO_CAPABILITIES={version:1,minimumStudioVersion:'0.30.0',documentSchemaVersion:24,portableVersion:19,
  profile:'finite-beam-audio-v1',requires:'finite-fountain-p2p-flow',timeline:'one-document-duration-from-activation',
  sampleRates:[48000,44100],durationMustFitWholeSamples:true,preview:'one-shot-full-mix',composition:'audio-omitted',
  nativeDispatch:'consumer-once-full-mix-wav',automaticSoundImpact:false,nativeImmediateStop:false,nativeVerified:false} as const;
