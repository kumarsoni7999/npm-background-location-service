package com.inforahul.backgroundlocation

import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * Android Foreground Service for background location.
 * Notification shows GPS/permission status and Allow / Stop actions.
 */
class BackgroundForegroundService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
  private var locationCallback: LocationCallback? = null

  private val refreshRunnable = object : Runnable {
    override fun run() {
      NotificationHelper.update(this@BackgroundForegroundService)
      maybeStartOrStopLocationUpdates()
      handler.postDelayed(this, 15_000L)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopTracking()
        return START_NOT_STICKY
      }
      ACTION_REFRESH -> {
        // Re-assert non-dismissible FGS notification (e.g. after swipe attempt)
        startAsForeground()
        maybeStartOrStopLocationUpdates()
        return START_STICKY
      }
      else -> {
        ServiceConfigStore.setRunning(this, true)
        ServiceConfigStore.setPaused(this, false)
        ServiceConfigStore.ensureTimerStart(this)
        startAsForeground()
        maybeStartOrStopLocationUpdates()
        handler.removeCallbacks(refreshRunnable)
        handler.postDelayed(refreshRunnable, 15_000L)
        EventEmitter.emit("started", null)
      }
    }
    return START_STICKY
  }

  private fun startAsForeground() {
    NotificationHelper.ensureChannel(this)
    val notification = NotificationHelper.build(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NotificationHelper.NOTIFICATION_ID,
        notification,
        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
      )
    } else {
      startForeground(NotificationHelper.NOTIFICATION_ID, notification)
    }
  }

  private fun maybeStartOrStopLocationUpdates() {
    if (ServiceConfigStore.isPaused(this)) {
      stopLocationUpdates()
      return
    }
    val access = PermissionUtils.accessState(this)
    if (access != PermissionUtils.AccessState.OK) {
      stopLocationUpdates()
      NotificationHelper.update(this)
      return
    }
    startLocationUpdates()
  }

  private fun startLocationUpdates() {
    if (locationCallback != null) return
    if (!PermissionUtils.hasFineOrCoarseLocation(this)) return

    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000L)
      .setMinUpdateIntervalMillis(5_000L)
      .setMinUpdateDistanceMeters(5f)
      .build()

    val callback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        val loc = result.lastLocation ?: return
        EventEmitter.emit(
          "location",
          mapOf(
            "latitude" to loc.latitude,
            "longitude" to loc.longitude,
            "altitude" to loc.altitude,
            "accuracy" to loc.accuracy.toDouble(),
            "speed" to loc.speed.toDouble(),
            "heading" to loc.bearing.toDouble(),
            "timestamp" to loc.time.toDouble(),
          ),
        )
        NotificationHelper.update(this@BackgroundForegroundService)
      }
    }
    locationCallback = callback
    try {
      fused.requestLocationUpdates(request, callback, Looper.getMainLooper())
    } catch (_: SecurityException) {
      locationCallback = null
      NotificationHelper.update(this)
    }
  }

  private fun stopLocationUpdates() {
    locationCallback?.let {
      fused.removeLocationUpdates(it)
    }
    locationCallback = null
  }

  private fun stopTracking() {
    handler.removeCallbacks(refreshRunnable)
    stopLocationUpdates()
    ServiceConfigStore.setRunning(this, false)
    ServiceConfigStore.setPaused(this, false)
    ServiceConfigStore.clearTimerStart(this)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacks(refreshRunnable)
    stopLocationUpdates()
    ServiceConfigStore.setRunning(this, false)
    super.onDestroy()
  }

  companion object {
    const val ACTION_STOP = "com.inforahul.backgroundlocation.SERVICE_STOP"
    const val ACTION_REFRESH = "com.inforahul.backgroundlocation.SERVICE_REFRESH"

    fun start(context: android.content.Context) {
      val intent = Intent(context, BackgroundForegroundService::class.java)
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: android.content.Context) {
      val intent = Intent(context, BackgroundForegroundService::class.java).apply {
        action = ACTION_STOP
      }
      context.startService(intent)
    }
  }
}
