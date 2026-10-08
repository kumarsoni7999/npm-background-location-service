import { NativeModules, Platform } from 'react-native';
import type { BackgroundServiceStatus, QueueStatus, BackgroundLocation } from './types';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unknown' | string;

export interface NativePermissionStatus {
  fineLocation?: PermissionState;
  coarseLocation?: PermissionState;
  backgroundLocation?: PermissionState;
  notifications?: PermissionState;
  whenInUse?: PermissionState;
  always?: PermissionState;
  authorizationStatus?: string;
  locationServicesEnabled?: boolean;
  ignoringBatteryOptimizations?: boolean;
}

export interface RnBackgroundLocationServiceNative {
  configure(configJson: string): Promise<boolean | void>;
  start(): Promise<boolean | void>;
  stop(): Promise<boolean | void>;
  pause(): Promise<boolean | void>;
  resume(): Promise<boolean | void>;
  isRunning(): Promise<boolean>;
  getStatus(): Promise<BackgroundServiceStatus>;
  getCurrentLocation?(): Promise<BackgroundLocation | null>;
  updateNotification?(optionsJson: string): Promise<boolean | void>;
  refreshNotification?(): Promise<boolean | void>;
  clearQueue?(): Promise<void>;
  getQueueStatus?(): Promise<QueueStatus>;
  getPermissionStatus(): Promise<NativePermissionStatus>;
  openAppSettings(): Promise<boolean>;
  openLocationSettings?(): Promise<boolean>;
  requestIgnoreBatteryOptimizations?(): Promise<boolean>;
  requestWhenInUsePermission?(): Promise<string>;
  requestAlwaysPermission?(): Promise<string>;
}

const LINKING_ERROR =
  `RnBackgroundLocationService native module is not linked. ` +
  `Rebuild the app after installing @inforahul/rn-background-location-service ` +
  `(Android: rebuild; iOS: pod install && rebuild).`;

const Native: RnBackgroundLocationServiceNative | undefined =
  NativeModules.RnBackgroundLocationService;

export function getNativeModule(): RnBackgroundLocationServiceNative {
  if (!Native) {
    throw new Error(LINKING_ERROR);
  }
  return Native;
}

export function isNativeAvailable(): boolean {
  return Native != null;
}

export function getPlatform(): 'android' | 'ios' | 'web' | string {
  return Platform.OS;
}
