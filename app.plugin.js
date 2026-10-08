/**
 * Expo config plugin — auto-adds Android permissions + iOS Info.plist keys
 * when the host app uses Expo / Continuous Native Generation.
 *
 * app.json:
 * {
 *   "expo": {
 *     "plugins": ["@inforahul/rn-background-location-service"]
 *   }
 * }
 */

const {
  withInfoPlist,
  withAndroidManifest,
  AndroidConfig,
} = require('expo/config-plugins');

const ANDROID_PERMISSIONS = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
];

function withBackgroundLocationPermissions(config, props = {}) {
  const whenInUse =
    props.locationWhenInUsePermission ||
    'This app needs your location while in use to record trips and sync location data.';
  const always =
    props.locationAlwaysPermission ||
    'This app needs access to your location in the background so tracking can continue when the app is closed.';

  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSLocationWhenInUseUsageDescription =
      cfg.modResults.NSLocationWhenInUseUsageDescription || whenInUse;
    cfg.modResults.NSLocationAlwaysAndWhenInUseUsageDescription =
      cfg.modResults.NSLocationAlwaysAndWhenInUseUsageDescription || always;
    cfg.modResults.NSLocationAlwaysUsageDescription =
      cfg.modResults.NSLocationAlwaysUsageDescription || always;

    const modes = new Set(cfg.modResults.UIBackgroundModes || []);
    modes.add('location');
    modes.add('fetch');
    cfg.modResults.UIBackgroundModes = Array.from(modes);
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    for (const permission of ANDROID_PERMISSIONS) {
      AndroidConfig.Permissions.ensurePermission(cfg.modResults, permission);
    }
    return cfg;
  });

  return config;
}

module.exports = withBackgroundLocationPermissions;
