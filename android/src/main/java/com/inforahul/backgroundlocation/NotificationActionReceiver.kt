package com.inforahul.backgroundlocation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Handles notification action buttons:
 * - Allow → open PermissionRequestActivity (runtime permission dialog)
 * - Stop → stop the foreground service
 */
class NotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    when (intent?.action) {
      NotificationHelper.ACTION_STOP -> {
        val stop = Intent(context, BackgroundForegroundService::class.java).apply {
          action = BackgroundForegroundService.ACTION_STOP
        }
        context.startService(stop)
        EventEmitter.emit("stopped", null)
      }
      NotificationHelper.ACTION_ASK_PERMISSION -> {
        val access = PermissionUtils.accessState(context)
        if (access == PermissionUtils.AccessState.GPS_OFF ||
          access == PermissionUtils.AccessState.GPS_AND_PERMISSION_DENIED
        ) {
          // Open GPS settings when location services are off
          val settings = Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(settings)
        }
        // Always open permission activity so user can grant location if needed
        val perm = Intent(context, PermissionRequestActivity::class.java).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        context.startActivity(perm)
        EventEmitter.emit(
          "permissionRequired",
          mapOf(
            "source" to "notification",
            "gpsEnabled" to PermissionUtils.isLocationServicesEnabled(context),
            "locationGranted" to PermissionUtils.hasFineOrCoarseLocation(context),
          ),
        )
      }
    }
  }
}
