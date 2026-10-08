package com.inforahul.backgroundlocation

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = BackgroundLocationModule.NAME)
class BackgroundLocationModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    EventEmitter.setReactContext(reactContext)
  }

  override fun invalidate() {
    EventEmitter.setReactContext(null)
    super.invalidate()
  }

  @ReactMethod
  fun configure(configJson: String, promise: Promise) {
    try {
      ServiceConfigStore.saveConfig(reactContext, configJson)
      val json = org.json.JSONObject(configJson)
      if (json.has("requireLocationPermission")) {
        ServiceConfigStore.setRequireLocationPermission(
          reactContext,
          json.optBoolean("requireLocationPermission", true),
        )
      }
      val notification = json.optJSONObject("notification")
      if (notification != null && notification.has("showAllowWhenDenied")) {
        // keep in notification object already saved via configJson
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("INVALID_CONFIGURATION", e.message, e)
    }
  }

  @ReactMethod
  fun start(promise: Promise) {
    try {
      ServiceConfigStore.ensureTimerStart(reactContext)
      BackgroundForegroundService.start(reactContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SERVICE_NOT_AVAILABLE", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      BackgroundForegroundService.stop(reactContext)
      EventEmitter.emit("stopped", null)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SERVICE_NOT_RUNNING", e.message, e)
    }
  }

  @ReactMethod
  fun pause(promise: Promise) {
    ServiceConfigStore.setPaused(reactContext, true)
    NotificationHelper.update(reactContext)
    EventEmitter.emit("paused", null)
    promise.resolve(true)
  }

  @ReactMethod
  fun resume(promise: Promise) {
    ServiceConfigStore.setPaused(reactContext, false)
    val intent = Intent(reactContext, BackgroundForegroundService::class.java).apply {
      action = BackgroundForegroundService.ACTION_REFRESH
    }
    reactContext.startService(intent)
    EventEmitter.emit("resumed", null)
    promise.resolve(true)
  }

  @ReactMethod
  fun isRunning(promise: Promise) {
    promise.resolve(ServiceConfigStore.isRunning(reactContext))
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val map = WritableNativeMap()
      map.putBoolean("running", ServiceConfigStore.isRunning(reactContext))
      map.putBoolean("paused", ServiceConfigStore.isPaused(reactContext))
      map.putString("platform", "android")
      map.putBoolean("locationEnabled", PermissionUtils.isLocationServicesEnabled(reactContext))
      map.putString(
        "permissionStatus",
        if (PermissionUtils.hasFineOrCoarseLocation(reactContext)) "granted" else "denied",
      )
      map.putInt("queuedItems", 0)
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("STATUS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun updateNotification(optionsJson: String, promise: Promise) {
    try {
      val config = ServiceConfigStore.getConfig(reactContext)
      val notification = config.optJSONObject("notification")
        ?: org.json.JSONObject().also { config.put("notification", it) }
      val incoming = org.json.JSONObject(optionsJson)
      incoming.keys().forEach { key ->
        notification.put(key, incoming.get(key))
      }
      ServiceConfigStore.saveConfig(reactContext, config.toString())
      if (ServiceConfigStore.isRunning(reactContext)) {
        NotificationHelper.update(reactContext)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("NOTIFICATION_UPDATE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun refreshNotification(promise: Promise) {
    if (ServiceConfigStore.isRunning(reactContext)) {
      NotificationHelper.update(reactContext)
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun getPermissionStatus(promise: Promise) {
    try {
      val map = WritableNativeMap()
      map.putString("fineLocation", permissionStatus(Manifest.permission.ACCESS_FINE_LOCATION))
      map.putString("coarseLocation", permissionStatus(Manifest.permission.ACCESS_COARSE_LOCATION))

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        map.putString(
          "backgroundLocation",
          permissionStatus(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
        )
      } else {
        map.putString("backgroundLocation", "granted")
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        map.putString(
          "notifications",
          permissionStatus(Manifest.permission.POST_NOTIFICATIONS),
        )
      } else {
        map.putString("notifications", "granted")
      }

      map.putBoolean("locationServicesEnabled", PermissionUtils.isLocationServicesEnabled(reactContext))
      map.putBoolean("ignoringBatteryOptimizations", isIgnoringBatteryOptimizations())
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("PERMISSION_STATUS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun openAppSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.fromParts("package", reactContext.packageName, null)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OPEN_SETTINGS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun openLocationSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OPEN_LOCATION_SETTINGS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve(true)
        return
      }
      if (isIgnoringBatteryOptimizations()) {
        promise.resolve(true)
        return
      }
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("BATTERY_OPTIMIZATION_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for NativeEventEmitter
  }

  private fun permissionStatus(permission: String): String {
    val granted = ContextCompat.checkSelfPermission(reactContext, permission) ==
      PackageManager.PERMISSION_GRANTED
    return if (granted) "granted" else "denied"
  }

  private fun isIgnoringBatteryOptimizations(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val pm = reactContext.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(reactContext.packageName)
  }

  companion object {
    const val NAME = "RnBackgroundLocationService"
  }
}
