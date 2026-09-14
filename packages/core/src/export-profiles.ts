import { PROFILE_ID, DURATION_PROFILE_ID, BEAM_PROFILE_ID } from './model.js';

export const BINARY_PROFILE_ID = 'nwn-ee-impact-binary-experimental-v1';
export const DURATION_BINARY_PROFILE_ID = 'nwn-ee-duration-binary-experimental-v1';
export const BEAM_BINARY_PROFILE_ID='nwn-ee-beam-binary-experimental-v1';
export const EXPORT_PROFILE_IDS = [PROFILE_ID, BINARY_PROFILE_ID, DURATION_PROFILE_ID, DURATION_BINARY_PROFILE_ID,BEAM_PROFILE_ID,BEAM_BINARY_PROFILE_ID] as const;
export const isBinaryProfile=(id?:string)=>id===BEAM_BINARY_PROFILE_ID||id===BINARY_PROFILE_ID||id===DURATION_BINARY_PROFILE_ID;
export const binaryProfile=(lifecycle?:'impact'|'duration'|'beam')=>lifecycle==='beam'?BEAM_BINARY_PROFILE_ID:lifecycle==='duration'?DURATION_BINARY_PROFILE_ID:BINARY_PROFILE_ID;
export const BINARY_COMPILER = {
  name: 'nwnmdlcomp-resource-free',
  sha256: '5b8b49441cbc8121ff8f38ec48651e2388d54842ccc12128cf2b59f8b735739d',
  sourceCommit: '56da6dc2fe94da6bbabe83ad18670f47fccd7dfb',
  platform: 'win32',
} as const;
