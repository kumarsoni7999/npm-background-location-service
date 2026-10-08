/**
 * Shared public types for @inforahul/rn-background-location-service
 */

export type LocationAccuracy = 'high' | 'balanced' | 'low' | 'passive';

export type HttpMethod = 'POST' | 'PUT' | 'PATCH';

export type PlatformName = 'android' | 'ios';

export interface BackgroundLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
}

export interface LocationConfig {
  enabled: boolean;
  accuracy?: LocationAccuracy;
  /** Minimum distance (meters) between updates */
  distanceFilter?: number;
  /** Desired interval hint in ms (Android); iOS uses distance/accuracy primarily */
  interval?: number;
  /** Request "Always" authorization on iOS when true */
  showsBackgroundLocationIndicator?: boolean;
}

export interface SyncConfig {
  enabled: boolean;
  /** Sync attempt interval in milliseconds */
  interval?: number;
  endpoint?: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  /**
   * Extra fields merged into every POST/PUT/PATCH JSON body.
   * Location data is always included unless you fully replace the body
   * with `payloadTransformer`.
   *
   * @example
   * body: {
   *   userId: '123',
   *   tripId: 'trip-9',
   *   source: 'driver-app',
   * }
   */
  body?: Record<string, unknown>;
}

export type NotificationStyle = 'default' | 'bigText' | 'bigPicture' | 'chronometer';

export interface NotificationConfig {
  title: string;
  description: string;
  channelId?: string;
  channelName?: string;
  /** Android drawable resource name (without extension), e.g. "ic_notification" */
  smallIcon?: string;
  /** Large icon: drawable name or file/content/https URI */
  largeIcon?: string;
  /**
   * Big picture / banner image (file/content/https URI or drawable name).
   * Note: Android notifications do not play animated GIFs; a still frame/image is shown.
   */
  imageUri?: string;
  /** Alias of imageUri for big-picture style */
  bigPictureUri?: string;
  /** Visual style (default: bigText when denied/custom text, else default) */
  style?: NotificationStyle;
  /** Show a running timer/chronometer in the notification */
  showTimer?: boolean;
  /** Epoch ms when the timer started (default: now when service starts) */
  timerStartAt?: number;
  /** Count-down chronometer instead of count-up */
  chronometerCountDown?: boolean;
  /** Accent color as #RRGGBB or #AARRGGBB */
  color?: string;
  /** Custom title when location/GPS is denied */
  deniedTitle?: string;
  /** Custom body when location/GPS is denied */
  deniedDescription?: string;
  allowButtonText?: string;
  stopButtonText?: string;
  /**
   * Host-app Android layout resource name for a custom collapsed notification
   * (place XML under your app `res/layout/`, e.g. `bls_custom_notification`).
   * Views with ids `bls_title`, `bls_text`, `bls_timer` are filled when present.
   */
  customLayout?: string;
  /** Expanded custom layout resource name (optional) */
  customExpandedLayout?: string;
  /**
   * When true (default), show Allow action on the notification if permission/GPS denied.
   * Overridden by start({ requireLocationPermission: false }).
   */
  showAllowWhenDenied?: boolean;
}

export interface QueueConfig {
  enabled: boolean;
  maxItems?: number;
  retryCount?: number;
}

export type PayloadTransformer = (
  location: BackgroundLocation,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

export interface BackgroundServiceConfig {
  location?: LocationConfig;
  sync?: SyncConfig;
  notification?: NotificationConfig;
  queue?: QueueConfig;
  /**
   * When true (default), location permission is required for tracking UX:
   * start will request it, and if denied the Android notification shows Allow
   * and keeps prompting via that action.
   * When false, the service can start without forcing permission / Allow UI.
   */
  requireLocationPermission?: boolean;
  /** Custom payload shape for sync requests */
  payloadTransformer?: PayloadTransformer;
  /** Enable verbose SDK logging (never logs tokens/PII) */
  debug?: boolean;
  /** Extensible bag for future options */
  extras?: Record<string, unknown>;
}

export interface ResolvedBackgroundServiceConfig {
  location: Required<Pick<LocationConfig, 'enabled'>> &
    LocationConfig & {
      accuracy: LocationAccuracy;
      distanceFilter: number;
      interval: number;
      showsBackgroundLocationIndicator: boolean;
    };
  sync: Required<Pick<SyncConfig, 'enabled'>> &
    SyncConfig & {
      interval: number;
      method: HttpMethod;
      headers: Record<string, string>;
    };
  notification: NotificationConfig & {
    channelId: string;
    channelName: string;
  };
  queue: Required<Pick<QueueConfig, 'enabled'>> &
    QueueConfig & {
      maxItems: number;
      retryCount: number;
    };
  payloadTransformer?: PayloadTransformer;
  debug: boolean;
  extras: Record<string, unknown>;
}

export interface QueueItem {
  eventId: string;
  type: 'location';
  timestamp: number;
  location: BackgroundLocation;
  payload: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'failed' | 'syncing';
  lastError?: string;
  createdAt: number;
}

export interface QueueStatus {
  total: number;
  pending: number;
  failed: number;
  syncing: number;
  maxItems: number;
}

export interface BackgroundServiceStatus {
  running: boolean;
  paused: boolean;
  platform: PlatformName;
  locationEnabled: boolean;
  permissionStatus: string;
  queuedItems: number;
  lastLocation?: BackgroundLocation;
  lastSyncAt?: number;
  lastError?: string;
}

export interface NotificationUpdateOptions {
  title?: string;
  description?: string;
  smallIcon?: string;
  largeIcon?: string;
  imageUri?: string;
  bigPictureUri?: string;
  style?: NotificationStyle;
  showTimer?: boolean;
  timerStartAt?: number;
  chronometerCountDown?: boolean;
  color?: string;
  deniedTitle?: string;
  deniedDescription?: string;
  allowButtonText?: string;
  stopButtonText?: string;
  customLayout?: string;
  customExpandedLayout?: string;
  showAllowWhenDenied?: boolean;
}

export interface DefaultLocationPayload {
  eventId: string;
  type: 'location';
  timestamp: number;
  location: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
  };
  device: {
    platform: PlatformName;
  };
}

export type BackgroundServiceEvent =
  | 'started'
  | 'stopped'
  | 'paused'
  | 'resumed'
  | 'location'
  | 'syncStarted'
  | 'syncSuccess'
  | 'syncFailed'
  | 'queueUpdated'
  | 'permissionChanged'
  | 'permissionRequired'
  | 'error';

export type EventPayloadMap = {
  started: void;
  stopped: void;
  paused: void;
  resumed: void;
  location: BackgroundLocation;
  syncStarted: { eventId: string };
  syncSuccess: { eventId: string; statusCode?: number };
  syncFailed: { eventId: string; error: string };
  queueUpdated: QueueStatus;
  permissionChanged: {
    status?: string;
    locationGranted?: boolean;
    backgroundGranted?: boolean;
    gpsEnabled?: boolean;
  };
  permissionRequired: {
    source?: string;
    gpsEnabled?: boolean;
    locationGranted?: boolean;
  };
  error: { code: string; message: string };
};

export type EventListener<E extends BackgroundServiceEvent> = (
  payload: EventPayloadMap[E],
) => void;

export type Unsubscribe = () => void;

/** Native bridge contract (platform-agnostic) */
export interface NativeBackgroundServiceModule {
  configure(configJson: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isRunning(): Promise<boolean>;
  getStatus(): Promise<BackgroundServiceStatus>;
  getCurrentLocation(): Promise<BackgroundLocation | null>;
  updateNotification(optionsJson: string): Promise<void>;
  clearQueue(): Promise<void>;
  getQueueStatus(): Promise<QueueStatus>;
  requestPermissions(): Promise<string>;
}
