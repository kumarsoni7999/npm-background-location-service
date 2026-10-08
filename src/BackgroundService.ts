import { Platform } from 'react-native';
import { getNativeModule, isNativeAvailable } from './NativeModule';
import { on, off } from './events';
import { SyncManager } from './SyncManager';
import {
  requestAllTrackingPermissions,
  checkLocationPermissions,
  openLocationSettings,
  hasRequiredLocationAccess,
} from './permissions';
import type {
  BackgroundServiceConfig,
  BackgroundServiceEvent,
  BackgroundServiceStatus,
  EventListener,
  NotificationUpdateOptions,
  QueueStatus,
  Unsubscribe,
} from './types';

export interface StartOptions {
  /**
   * Ask the system for location (and related) permissions before start.
   * Default: same as `requireLocationPermission` (usually true).
   */
  requestPermissions?: boolean;
  /**
   * If true, location permission is required:
   * - requests permission on start
   * - if still denied, Android notification shows **Allow** and keeps asking
   * If false, start without forcing permission / Allow UI.
   * Default: `configure({ requireLocationPermission })` or true.
   */
  requireLocationPermission?: boolean;
  /**
   * If permissions/GPS are still denied after asking, still start the
   * foreground service so the notification can show "not allowed" + Allow/Stop.
   * Default: true on Android when requireLocationPermission is true.
   */
  startEvenIfDenied?: boolean;
}

let configured = false;
let jsConfig: BackgroundServiceConfig = {};

function serializeConfigForNative(config: BackgroundServiceConfig): string {
  const { payloadTransformer: _payloadTransformer, ...rest } = config;
  return JSON.stringify(rest);
}

async function pushConfigToNative(config: BackgroundServiceConfig): Promise<void> {
  jsConfig = config;
  SyncManager.setConfig(config);
  if (!isNativeAvailable()) {
    configured = true;
    return;
  }
  await getNativeModule().configure(serializeConfigForNative(config));
  configured = true;
}

const BackgroundService = {
  async configure(config: BackgroundServiceConfig): Promise<void> {
    await pushConfigToNative({ ...jsConfig, ...config });
  },

  /**
   * Optionally requires location permission, then starts the native background service.
   * On Android, if permission is required and denied, the notification shows Allow
   * and tapping it asks again.
   */
  async start(options: StartOptions = {}): Promise<{
    started: boolean;
    permissionsGranted: boolean;
    gpsEnabled: boolean;
    requireLocationPermission: boolean;
  }> {
    const requireLocationPermission =
      options.requireLocationPermission ??
      jsConfig.requireLocationPermission ??
      true;

    const requestPermissions =
      options.requestPermissions ?? requireLocationPermission;

    const startEvenIfDenied =
      options.startEvenIfDenied ??
      (Platform.OS === 'android' && requireLocationPermission);

    // Persist flag for native notification Allow button behavior
    await pushConfigToNative({
      ...jsConfig,
      requireLocationPermission,
      notification: {
        title: jsConfig.notification?.title ?? 'Location Tracking',
        description:
          jsConfig.notification?.description ?? 'Location tracking is active',
        ...jsConfig.notification,
        showAllowWhenDenied: requireLocationPermission
          ? jsConfig.notification?.showAllowWhenDenied !== false
          : false,
      },
    });

    if (isNativeAvailable()) {
      // Native store for Allow button + timer
      try {
        await getNativeModule().configure(
          serializeConfigForNative({
            ...jsConfig,
            requireLocationPermission,
          }),
        );
      } catch (_err) {
        // ignore
      }
    }

    if (requestPermissions && requireLocationPermission) {
      await requestAllTrackingPermissions();
    }

    const status = await checkLocationPermissions();
    const gpsEnabled = Boolean(status.locationServicesEnabled);
    const permissionsGranted = await hasRequiredLocationAccess();

    if (
      requireLocationPermission &&
      !gpsEnabled &&
      Platform.OS === 'android'
    ) {
      try {
        await openLocationSettings();
      } catch (_err) {
        // ignore
      }
    }

    if (requireLocationPermission && !permissionsGranted && !startEvenIfDenied) {
      return {
        started: false,
        permissionsGranted,
        gpsEnabled,
        requireLocationPermission,
      };
    }

    if (!isNativeAvailable()) {
      throw new Error(
        'Native module not linked. Rebuild the app after installing the package.',
      );
    }

    if (!configured) {
      await pushConfigToNative({
        location: { enabled: true },
        requireLocationPermission,
        notification: {
          title: 'Location Tracking',
          description: 'Location tracking is active',
          channelId: 'background-location',
          channelName: 'Background Location',
          showAllowWhenDenied: requireLocationPermission,
        },
      });
    }

    SyncManager.setConfig(jsConfig);
    SyncManager.start();
    await getNativeModule().start();
    return {
      started: true,
      permissionsGranted,
      gpsEnabled,
      requireLocationPermission,
    };
  },

  async stop(): Promise<void> {
    SyncManager.stop();
    if (!isNativeAvailable()) return;
    await getNativeModule().stop();
  },

  async pause(): Promise<void> {
    if (!isNativeAvailable()) return;
    await getNativeModule().pause();
  },

  async resume(): Promise<void> {
    if (!isNativeAvailable()) return;
    await getNativeModule().resume();
  },

  async isRunning(): Promise<boolean> {
    if (!isNativeAvailable()) return false;
    return getNativeModule().isRunning();
  },

  async getStatus(): Promise<BackgroundServiceStatus> {
    if (!isNativeAvailable()) {
      return {
        running: false,
        paused: false,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        locationEnabled: false,
        permissionStatus: 'unknown',
        queuedItems: SyncManager.getQueueSize(),
        lastSyncAt: SyncManager.getLastSyncAt(),
      };
    }
    const status = await getNativeModule().getStatus();
    return {
      ...status,
      queuedItems: SyncManager.getQueueSize(),
      lastSyncAt: SyncManager.getLastSyncAt() ?? status.lastSyncAt,
    };
  },

  async updateNotification(options: NotificationUpdateOptions): Promise<void> {
    jsConfig = {
      ...jsConfig,
      notification: {
        title: jsConfig.notification?.title ?? 'Location Tracking',
        description:
          jsConfig.notification?.description ?? 'Location tracking is active',
        ...jsConfig.notification,
        ...options,
      },
    };
    if (!isNativeAvailable()) return;
    await getNativeModule().updateNotification?.(JSON.stringify(options));
  },

  async refreshNotification(): Promise<void> {
    if (!isNativeAvailable()) return;
    await getNativeModule().refreshNotification?.();
  },

  async getQueueStatus(): Promise<QueueStatus> {
    const maxItems = jsConfig.queue?.maxItems ?? 1000;
    return {
      total: SyncManager.getQueueSize(),
      pending: SyncManager.getQueueSize(),
      failed: 0,
      syncing: 0,
      maxItems,
    };
  },

  async clearQueue(): Promise<void> {
    SyncManager.clearQueue();
    if (!isNativeAvailable()) return;
    await getNativeModule().clearQueue?.();
  },

  on<E extends BackgroundServiceEvent>(
    event: E,
    listener: EventListener<E>,
  ): Unsubscribe {
    return on(event, listener);
  },

  off<E extends BackgroundServiceEvent>(
    event: E,
    listener: EventListener<E>,
  ): void {
    off(event, listener);
  },
};

export default BackgroundService;
