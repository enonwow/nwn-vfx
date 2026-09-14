/** Discovery of the currently absent runner, not a declaration of native proof. */
export const NATIVE_WORKFLOW = {
  contract: 'nwn-vfx-native-test-status/v1',
  statusOperation: 'native.test.status',
  runnerConfigured: false,
  execution: 'external_qualified_runner_required',
  centralWorkflow: 'Aurora binary native geometry followed by AUR-S07',
  evidenceImportAvailable: false,
  startsNativeProcesses: false,
} as const;
