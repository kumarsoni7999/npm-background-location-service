import { PermissionsAndroid, Platform } from 'react-native';
import { getNativeModule, isNativeAvailable, type NativePermissionStatus } from './NativeModule';

export type PermissionResult = 'granted' | 'denied' | 'never_ask_again' | 'unavailable';

export interface RequestAllPermissionsResult {
  fineLocation: PermissionResult;
  coarseLocation: PermissionResult;
  backgroundLocation: PermissionResult;
  notifications: PermissionResult;
  whenInUse: PermissionResult;
  always: PermissionResult;
  locationServicesEnabled: boolean;
  batteryOptimizationIgnored: boolean | null;
}

function mapAndroidResult(
  result: string | typeof PermissionsAndroid.RESULTS.GRANTED,
): PermissionResult {
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'never_ask_again';
  if (result === PermissionsAndroid.RESULTS.DENIED) return 'denied';
  return 'denied';
}

/**
 * Request foreground (when-in-use / fine) location permission.
 */
export async function requestLocationPermission(): Promise<PermissionResult> {
  if (Platform.OS === 'android') {
    const fine = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location permission',
        message: 'Allow location access to track position in the background.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    return mapAndroidResult(fine);
  }

  if (Platform.OS === 'ios') {
    if (!isNativeAvailable()) return 'unavailable';
    const status = await getNativeModule().requestWhenInUsePermission?.();
    if (status === 'authorizedWhenInUse' || status === 'authorizedAlways') {
      return 'granted';
    }
    if (status === 'notDetermined') return 'denied';
    return 'denied';
  }

  return 'unavailable';
}

/**
 * Request coarse location (Android). On iOS this mirrors when-in-use.
 */
export async function requestCoarseLocationPermission(): Promise<PermissionResult> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      {
        title: 'Approximate location',
        message: 'Allow approximate location access.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    return mapAndroidResult(result);
  }
  return requestLocationPermission();
}

/**
 * Request background / Always location permission.
 * Android 10+: must request foreground location first, then background.
 * iOS: requests Always authorization (requires Info.plist strings).
 */
export async function requestBackgroundLocationPermission(): Promise<PermissionResult> {
  if (Platform.OS === 'android') {
    const fine = await requestLocationPermission();
    if (fine !== 'granted') return fine;

    if (typeof Platform.Version === 'number' && Platform.Version < 29) {
      return 'granted';
    }

    const bg = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
    if (!bg) return 'unavailable';

    const result = await PermissionsAndroid.request(bg, {
      title: 'Background location',
      message:
        'Allow location access all the time so tracking continues when the app is closed.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    });
    return mapAndroidResult(result);
  }

  if (Platform.OS === 'ios') {
    if (!isNativeAvailable()) return 'unavailable';
    // Best practice: when-in-use first, then always
    await getNativeModule().requestWhenInUsePermission?.();
    const status = await getNativeModule().requestAlwaysPermission?.();
    if (status === 'authorizedAlways') return 'granted';
    if (status === 'authorizedWhenInUse') return 'denied';
    return 'denied';
  }

  return 'unavailable';
}

/**
 * Request notification permission (Android 13+). Needed for foreground service notification.
 */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') return 'granted';

  if (typeof Platform.Version === 'number' && Platform.Version < 33) {
    return 'granted';
  }

  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (!permission) return 'unavailable';

  const result = await PermissionsAndroid.request(permission, {
    title: 'Notifications',
    message: 'Allow notifications so background tracking can show a persistent status.',
    buttonPositive: 'Allow',
    buttonNegative: 'Deny',
  });
  return mapAndroidResult(result);
}

/**
 * Ask the user to ignore battery optimizations (Android).
 * Improves reliability when the app is swiped away / killed.
 */
export async function requestBatteryOptimizationExemption(): Promise<boolean> {
  if (Platform.OS !== 'android' || !isNativeAvailable()) return false;
  return (await getNativeModule().requestIgnoreBatteryOptimizations?.()) ?? false;
}

/**
 * Open the app settings screen so the user can enable location / Always / battery.
 */
export async function openAppSettings(): Promise<boolean> {
  if (!isNativeAvailable()) return false;
  return getNativeModule().openAppSettings();
}

/**
 * Open system location (GPS) settings (Android).
 */
export async function openLocationSettings(): Promise<boolean> {
  if (Platform.OS !== 'android' || !isNativeAvailable()) return false;
  return (await getNativeModule().openLocationSettings?.()) ?? false;
}

/**
 * Read current permission / GPS / battery status from native.
 */
export async function checkLocationPermissions(): Promise<NativePermissionStatus> {
  if (!isNativeAvailable()) {
    return {
      locationServicesEnabled: false,
    };
  }
  return getNativeModule().getPermissionStatus();
}

/**
 * Request the full set of permissions typically needed for background tracking.
 * Call this from a user gesture (button press) before `BackgroundService.start()`.
 */
export async function requestAllTrackingPermissions(): Promise<RequestAllPermissionsResult> {
  const fineLocation = await requestLocationPermission();
  const coarseLocation =
    Platform.OS === 'android' ? await requestCoarseLocationPermission() : fineLocation;
  const backgroundLocation = await requestBackgroundLocationPermission();
  const notifications = await requestNotificationPermission();

  let whenInUse: PermissionResult = fineLocation;
  let always: PermissionResult = backgroundLocation;
  let locationServicesEnabled = false;
  let batteryOptimizationIgnored: boolean | null = null;

  if (isNativeAvailable()) {
    const status = await getNativeModule().getPermissionStatus();
    locationServicesEnabled = Boolean(status.locationServicesEnabled);
    if (Platform.OS === 'android') {
      batteryOptimizationIgnored = Boolean(status.ignoringBatteryOptimizations);
    }
    if (Platform.OS === 'ios') {
      whenInUse = status.whenInUse === 'granted' ? 'granted' : 'denied';
      always = status.always === 'granted' ? 'granted' : 'denied';
    }
  }

  if (Platform.OS === 'android' && batteryOptimizationIgnored === false) {
    await requestBatteryOptimizationExemption();
    const again = await checkLocationPermissions();
    batteryOptimizationIgnored = Boolean(again.ignoringBatteryOptimizations);
  }

  return {
    fineLocation,
    coarseLocation,
    backgroundLocation,
    notifications,
    whenInUse,
    always,
    locationServicesEnabled,
    batteryOptimizationIgnored,
  };
}

/**
 * Convenience: returns true only when location permission + GPS look ready.
 * Background "Always" may still be required for kill-mode tracking.
 */
export async function hasRequiredLocationAccess(): Promise<boolean> {
  const status = await checkLocationPermissions();
  if (!status.locationServicesEnabled) return false;

  if (Platform.OS === 'android') {
    return status.fineLocation === 'granted' || status.coarseLocation === 'granted';
  }

  return (
    status.authorizationStatus === 'authorizedAlways' ||
    status.authorizationStatus === 'authorizedWhenInUse' ||
    status.whenInUse === 'granted' ||
    status.always === 'granted'
  );
}
