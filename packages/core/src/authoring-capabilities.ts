export const OBJ_IMPORT_CAPABILITIES = {
  format: 'triangulated-obj', operations: ['meshes.importObj.preview','meshes.importObj'],
  maxTextBytes: 1048576, maxVertices: 2048, maxTriangles: 4096, maxTextureCoordinates: 8192,
  sourceUpAxes: ['y','z'], targetUpAxis: 'z', targetUnit: 'meter', normalModes: ['flat'],
  autoCenter: false, autoScale: false, externalMaterialFiles: false,
} as const;
export const MESH_MATERIAL_CAPABILITIES = {
  documentSchemaVersion: 5, fields: ['diffuse','selfIllumination'], atomic: true,
  omission: 'legacy-unlit', preview: 'fixed-lambert-approximation', nativeVerified: false,
} as const;
