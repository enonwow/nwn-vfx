import type { WEBMCP_OPERATIONS } from './webmcp-schemas.js';
// Registration has a 64 KiB host budget. Full operation documentation remains
// available through schema.get; keep descriptions useful and non-redundant.
export const toolDescriptions:Record<typeof WEBMCP_OPERATIONS[number],string>={
 'audio.import':'WAV/MP3.', 'audio.list':'Metadata.',
 'audio.get':'PCM.', 'audio.remove':'Prune.',
 'version':'Versions.', 'doctor':'Connection.', 'capabilities':'Limits.',
 'workspaces.list':'Workspaces.', 'operations.list':'Operations.', 'schema.get':'Schemas.',
 'projects.list':'List.', 'projects.resolve':'Name.', 'projects.inspect':'Read.',
 'preview.compose':'PNG/WebM.', 'projects.create':'Create.', 'projects.fork':'Fork.', 'projects.export':'ZIP.',
 'assets.import':'PNG.', 'assets.list':'Textures.', 'assets.get':'PNG/source.',
 'assets.remove':'Prune.', 'meshes.importObj.preview':'Propose OBJ.',
 'meshes.importObj':'OBJ.', 'native.test.status':'Status.',
 'palette.preview':'Palette proposal.',
 'palette.apply':'Apply hash.',
 'changes.preview':'Diff.', 'changes.apply':'Edit.', 'changes.revert':'Undo.',
 'revisions.list':'History.', 'revisions.get':'Revision.', 'policy.inspect':'AI policy.',
 'candidate.build':'Export.', 'preview.request':'PNG/WebM.', 'jobs.list':'Jobs.', 'jobs.get':'Result.',
 'jobs.cancel':'Cancel.', 'artifacts.list':'Artifacts.', 'artifacts.get':'Metadata.',
 'operations.get':'Diff/result.', 'operations.resolve':'Recover.', 'events.list':'Events.',
 'reviews.list':'Reviews.', 'reviews.add':'Own note.',
};
