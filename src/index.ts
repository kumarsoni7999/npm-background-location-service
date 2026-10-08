export type {
  BackgroundLocation,
  BackgroundServiceConfig,
  BackgroundServiceEvent,
  BackgroundServiceStatus,
  LocationAccuracy,
  LocationConfig,
  NotificationConfig,
  NotificationStyle,
  NotificationUpdateOptions,
  PayloadTransformer,
  QueueConfig,
  QueueStatus,
  SyncConfig,
} from './types';

export {
  requestLocationPermission,
  requestCoarseLocationPermission,
  requestBackgroundLocationPermission,
  requestNotificationPermission,
  requestBatteryOptimizationExemption,
  requestAllTrackingPermissions,
  checkLocationPermissions,
  hasRequiredLocationAccess,
  openAppSettings,
  openLocationSettings,
} from './permissions';

export type { PermissionResult, RequestAllPermissionsResult } from './permissions';
export type { NativePermissionStatus, PermissionState } from './NativeModule';
export type { StartOptions } from './BackgroundService';

export {
  LocationPermissionPrompt,
  type LocationPermissionPromptProps,
  type LocationPermissionPromptRenderProps,
} from './LocationPermissionPrompt';

import BackgroundService from './BackgroundService';

export default BackgroundService;
export { BackgroundService };
