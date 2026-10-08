# @inforahul/rn-background-location-service

React Native package for **background location tracking and storage**, including while the app is in the background or killed (platform permitting), as long as:

- **GPS / location services** are turned on
- **Location permission** is granted (Always / background where required)
- The device allows the app to keep running for location (battery optimizations must not block the service)

This package uses **native** background execution — not JavaScript timers like `setInterval`.

| Platform | How it works |
| --- | --- |
| **Android** | Foreground Service + Fused Location Provider + persistent notification. Can keep collecting location after the UI is closed or the process is reclaimed, while the service is running and permissions remain granted. |
| **iOS** | Core Location (`CLLocationManager`) with Background Location capability. Continues updates while suspended when Always permission and background modes are configured. iOS does **not** provide an unlimited Android-style foreground service; force-quit behavior is more restricted by the OS. |

---

## What this package does

- Start / stop / pause / resume a native background location service
- Collect GPS coordinates in the background
- Persist / queue location events locally when offline
- Sync queued data to your API with retries
- Emit events to JavaScript (`location`, `started`, `stopped`, sync events, errors)
- Show a configurable Android foreground notification
- Expose typed TypeScript APIs

### Required conditions

Location will only be recorded when **all** of the following are true:

1. Device location / GPS is enabled  
2. The app has the required location permission  
3. Battery / OS power settings allow the service (or background location) to run  
4. The service has been started via `BackgroundService.start()`

If GPS is off, permission is denied/revoked, or the OS aggressively kills background work, tracking will stop or be limited.

---

## Installation

```bash
npm install @inforahul/rn-background-location-service
# or
yarn add @inforahul/rn-background-location-service
```

### Automatic permission setup (runs on install)

After `npm install` / `yarn add`, this package’s **`postinstall`** script runs automatically and:

1. Locates your React Native app root (`android/` / `ios/`)
2. Adds missing permissions to `android/app/src/main/AndroidManifest.xml`
3. Adds location usage strings + background modes to `ios/<AppName>/Info.plist`

You should see a log like:

```text
[rn-background-location-service] Auto-configuring native permissions…
  AndroidManifest: .../android/app/src/main/AndroidManifest.xml
  Info.plist: .../ios/MyApp/Info.plist (updated)
```

**Also on Android:** the library’s own `AndroidManifest.xml` is **merged by Gradle** at build time (location, foreground service, notifications, etc.).

**Skip auto-setup** (if you manage manifests yourself):

```bash
RN_BLS_SKIP_PERMISSION_SETUP=1 npm install @inforahul/rn-background-location-service
```

**Re-run manually** anytime from the app root:

```bash
npx rn-background-location-setup-permissions
# or
npm explore @inforahul/rn-background-location-service -- npm run setup-permissions
```

**Expo apps** — also add the config plugin so `expo prebuild` injects the same keys:

```json
{
  "expo": {
    "plugins": ["@inforahul/rn-background-location-service"]
  }
}
```

Then finish native linking:

```bash
cd ios && pod install && cd ..
```

Rebuild the app after install (native module + permission changes require a rebuild).

---

## Request permissions from JS

Import helpers and call them from a **user tap** before starting tracking:

```ts
import {
  requestLocationPermission,
  requestBackgroundLocationPermission,
  requestNotificationPermission,
  requestAllTrackingPermissions,
  checkLocationPermissions,
  openAppSettings,
  openLocationSettings,
  requestBatteryOptimizationExemption,
} from '@inforahul/rn-background-location-service';

// One-shot: request everything needed for background tracking
const result = await requestAllTrackingPermissions();
console.log(result);

// Or step by step:
await requestLocationPermission();
await requestBackgroundLocationPermission();
await requestNotificationPermission(); // Android 13+
await requestBatteryOptimizationExemption(); // Android kill-mode reliability

const status = await checkLocationPermissions();
if (!status.locationServicesEnabled) {
  await openLocationSettings();
}
```

| Helper | Purpose |
| --- | --- |
| `requestLocationPermission()` | Fine / when-in-use location |
| `requestCoarseLocationPermission()` | Coarse location (Android) |
| `requestBackgroundLocationPermission()` | Background / Always |
| `requestNotificationPermission()` | FGS notification (Android 13+) |
| `requestBatteryOptimizationExemption()` | Ignore battery optimizations (Android) |
| `requestAllTrackingPermissions()` | Runs the full recommended flow |
| `checkLocationPermissions()` | Current permission + GPS status |
| `openAppSettings()` | Open app settings |
| `openLocationSettings()` | Open GPS settings (Android) |

---

## Basic usage

```ts
import BackgroundService from '@inforahul/rn-background-location-service';

await BackgroundService.configure({
  location: {
    enabled: true,
    accuracy: 'high',
    distanceFilter: 10,
  },
  sync: {
    enabled: true,
    interval: 30000,
    endpoint: 'https://your-api.example.com/location',
    method: 'POST',
    headers: {
      Authorization: 'Bearer YOUR_TOKEN',
      'Content-Type': 'application/json',
    },
    // Extra fields merged into every POST body (with location data)
    body: {
      userId: '123',
      tripId: 'trip-9',
      source: 'driver-app',
    },
  },

  // Optional: fully customize the JSON body sent to your API
  // payloadTransformer: (location) => ({
  //   lat: location.latitude,
  //   lng: location.longitude,
  //   recordedAt: location.timestamp,
  //   userId: '123',
  // }),
  notification: {
    title: 'Location Tracking',
    description: 'Your location is being tracked in the background',
    channelId: 'background-location',
    channelName: 'Background Location',
  },
  queue: {
    enabled: true,
    maxItems: 1000,
    retryCount: 5,
  },
  debug: false,
});

BackgroundService.on('location', (location) => {
  console.log(location.latitude, location.longitude, location.timestamp);
});

// Asks for permissions first, then starts the native service
const result = await BackgroundService.start();
console.log(result); // { started, permissionsGranted, gpsEnabled }

// Later
await BackgroundService.stop();
```

---

## Permission check before start + notification actions (Android)

`BackgroundService.start()` **always asks for permissions first** (unless you pass `{ requestPermissions: false }`).

### If GPS or location permission is not allowed

The Android foreground notification shows a clear status, for example:

- **GPS not allowed**
- **Location permission not allowed**
- **Location / GPS not allowed**

And includes action buttons:

| Button | Action |
| --- | --- |
| **Allow** | Opens the system permission dialog (and GPS settings if location services are off) |
| **Stop** | Stops the background service |

While tracking is healthy, the notification shows your configured title/description and still includes **Stop**.

```ts
// Default: request permissions, then start (even if denied, so notification can guide the user)
await BackgroundService.start();

// Or: do not start the service unless permission + GPS are OK
await BackgroundService.start({ startEvenIfDenied: false });

BackgroundService.on('permissionRequired', (info) => {
  console.log('User tapped Allow on notification', info);
});

BackgroundService.on('permissionChanged', (info) => {
  console.log('Permission updated', info);
});

BackgroundService.on('stopped', () => {
  console.log('Stopped (from app or notification Stop button)');
});
```

**Note:** iOS does not show a persistent Android-style foreground notification. On iOS, `start()` still requests authorization; use in-app UI for stop / permission prompts.

---

## Sync POST body

Add extra fields with `sync.body`. They are merged into the JSON sent to your API on every location sync.

```ts
await BackgroundService.configure({
  sync: {
    enabled: true,
    interval: 30000,
    endpoint: 'https://your-api.example.com/location',
    method: 'POST',
    headers: {
      Authorization: 'Bearer YOUR_TOKEN',
      'Content-Type': 'application/json',
    },
    body: {
      userId: '123',
      tripId: 'trip-9',
      source: 'driver-app',
    },
  },
});
```

### Default body sent to the API

```json
{
  "eventId": "evt_...",
  "type": "location",
  "timestamp": 1720000000000,
  "location": {
    "latitude": 21.19,
    "longitude": 81.28,
    "accuracy": 10
  },
  "device": { "platform": "android" },
  "userId": "123",
  "tripId": "trip-9",
  "source": "driver-app"
}
```

(`userId` / `tripId` / `source` come from `sync.body`.)

### Fully custom body

Use `payloadTransformer` when you need a different shape (still merged with `sync.body`):

```ts
await BackgroundService.configure({
  sync: {
    enabled: true,
    endpoint: 'https://your-api.example.com/location',
    method: 'POST',
    headers: { Authorization: 'Bearer YOUR_TOKEN' },
    body: { userId: '123' },
  },
  payloadTransformer: (location) => ({
    lat: location.latitude,
    lng: location.longitude,
    recordedAt: location.timestamp,
  }),
});
```

Posted JSON becomes:

```json
{
  "userId": "123",
  "lat": 21.19,
  "lng": 81.28,
  "recordedAt": 1720000000000
}
```

---

## Permissions

### Android (auto-merged)

The library declares:

- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION` (Android 10+)
- `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION`
- `POST_NOTIFICATIONS` (Android 13+)
- `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`

Runtime dialogs still must be requested with the JS helpers above.

**Battery tip:** On some OEMs (Xiaomi, Oppo, Vivo, Samsung, etc.), users may need to disable battery optimization / allow autostart for reliable tracking after the app is swiped away or killed.

### iOS (setup script / Expo plugin)

Required `Info.plist` keys (added by setup script or Expo plugin):

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- Background Modes → **Location updates**

Request **Always** authorization for background / post-suspend tracking via `requestBackgroundLocationPermission()`.

**iOS limitation:** Apple does not allow a general-purpose unlimited background service. After a user force-quits the app, location delivery may stop until the app is opened again. Do not assume Android kill-mode behavior on iOS.

---

## API overview

| Method | Description |
| --- | --- |
| `configure(options)` | Set location, sync, notification, and queue options |
| `start()` | Start native background tracking |
| `stop()` | Stop tracking and sync |
| `pause()` / `resume()` | Temporarily pause or resume |
| `isRunning()` | Whether the service is active |
| `getStatus()` | Running state, permissions, queue, last location |
| `getCurrentLocation()` | One-shot current position |
| `on(event, listener)` / `off(...)` | Subscribe to native/JS events |
| `updateNotification(options)` | Update Android notification text |
| `clearQueue()` / `getQueueStatus()` | Manage the offline queue |

### Events

`started` · `stopped` · `paused` · `resumed` · `location` · `syncStarted` · `syncSuccess` · `syncFailed` · `queueUpdated` · `permissionChanged` · `error`

### Location shape

```ts
interface BackgroundLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
}
```

---

## Offline queue & sync (in-memory only)

No third-party libraries (no AsyncStorage, no NetInfo).

When a location POST fails because the device is offline / network error:

1. Coordinate payload is stored in an **in-memory** queue
2. On the next successful network attempt (new location or `sync.interval` timer), queued items are POSTed to your API oldest-first
3. Successful items are removed from memory

```text
Location → build body → POST API
                           ├─ success → done (+ flush memory queue if any)
                           └─ offline/network error → push to memory queue
                                                      ↓
                         every sync.interval / next online success
                                                      ↓
                                              POST queued items
```

```ts
await BackgroundService.configure({
  sync: {
    enabled: true,
    interval: 30000, // also used to retry flushing the memory queue
    endpoint: 'https://your-api.example.com/location',
    method: 'POST',
    headers: { Authorization: 'Bearer YOUR_TOKEN' },
    body: { userId: '123' },
  },
  queue: {
    enabled: true,   // default behavior when enabled
    maxItems: 1000,  // drop oldest if over limit
    retryCount: 5,   // for HTTP errors while online
  },
});
```

**Note:** The memory queue is lost if the app JS process is fully killed. While the process stays alive (including Android foreground service keeping the app warm), offline points are kept and sent when internet returns.

Do not put API secrets inside the package. Pass tokens via `configure({ sync: { headers } })` from your app.

---

## Kill mode / background behavior

| Scenario | Android | iOS |
| --- | --- | --- |
| App in background | Continues via Foreground Service | Continues with Always + background location |
| Screen locked | Continues if service + GPS + permission OK | Continues if OS allows background location |
| App process killed / swiped away | Can restart / continue while FGS is allowed | Often stops after force quit; OS-controlled |
| GPS off | No updates | No updates |
| Permission revoked | Stops / errors | Stops / errors |
| Aggressive battery saving | May be delayed or killed | May be deferred by system |

**Summary:** This package is designed for continuous background location **when GPS is on, location permission is granted, and battery/OS policy allows it**. Reliability is highest on Android with a foreground service; iOS follows Apple’s background location rules.

## License

MIT
