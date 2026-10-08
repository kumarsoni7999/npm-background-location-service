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
  /** Ask runtime permissions before starting (default: true) */
  requestPermissions?: boolean;
  /**
   * If permissions/GPS are still denied after asking, still start the
   * foreground service so the notification can show "not allowed" + Allow/Stop.
   * Default: true on Android.
   */
  startEvenIfDenied?: boolean;
}

let configured = false;
let jsConfig: BackgroundServiceConfig = {};

function serializeConfigForNative(config: BackgroundServiceConfig): string {
  // Functions cannot cross the native bridge
  const { payloadTransformer: _payloadTransformer, ...rest } = config;
  return JSON.stringify(rest);
}

const BackgroundService = {
  async configure(config: BackgroundServiceConfig): Promise<void> {
    jsConfig = config;
    SyncManager.setConfig(config);

    if (!isNativeAvailable()) {
      configured = true;
      return;
    }
    await getNativeModule().configure(serializeConfigForNative(config));
    configured = true;
  },

  /**
   * Asks for location / notification permissions first, then starts the
   * native background service. On Android, if GPS or permission is still
   * denied, the persistent notification shows that status with Allow / Stop.
   */
  async start(options: StartOptions = {}): Promise<{
    started: boolean;
    permissionsGranted: boolean;
    gpsEnabled: boolean;
  }> {
    const requestPermissions = options.requestPermissions !== false;
    const startEvenIfDenied =
      options.startEvenIfDenied ?? Platform.OS === 'android';

    if (requestPermissions) {
      await requestAllTrackingPermissions();
    }

    const status = await checkLocationPermissions();
    const gpsEnabled = Boolean(status.locationServicesEnabled);
    const permissionsGranted = await hasRequiredLocationAccess();

    if (!gpsEnabled && Platform.OS === 'android') {
      try {
        await openLocationSettings();
      } catch (_err) {
        // ignore
      }
    }

    if (!permissionsGranted && !startEvenIfDenied) {
      return { started: false, permissionsGranted, gpsEnabled };
    }

    if (!isNativeAvailable()) {
      throw new Error(
        'Native module not linked. Rebuild the app after installing the package.',
      );
    }

    if (!configured) {
      await getNativeModule().configure(
        JSON.stringify({
          location: { enabled: true },
          notification: {
            title: 'Location Tracking',
            description: 'Location tracking is active',
            channelId: 'background-location',
            channelName: 'Background Location',
          },
        }),
      );
      configured = true;
    }

    SyncManager.setConfig(jsConfig);
    SyncManager.start();
    await getNativeModule().start();
    return { started: true, permissionsGranted, gpsEnabled };
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
