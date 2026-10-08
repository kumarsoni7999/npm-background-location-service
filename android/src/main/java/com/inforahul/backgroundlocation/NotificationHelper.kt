package com.inforahul.backgroundlocation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

object NotificationHelper {
  const val NOTIFICATION_ID = 7401

  const val ACTION_STOP = "com.inforahul.backgroundlocation.ACTION_STOP"
  const val ACTION_ASK_PERMISSION = "com.inforahul.backgroundlocation.ACTION_ASK_PERMISSION"

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      ServiceConfigStore.channelId(context),
      ServiceConfigStore.channelName(context),
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Background location tracking"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  fun build(context: Context): Notification {
    ensureChannel(context)
    val access = PermissionUtils.accessState(context)
    val title: String
    val body: String
    val showAskPermission: Boolean

    when (access) {
      PermissionUtils.AccessState.OK -> {
        title = ServiceConfigStore.notificationTitle(context)
        body = ServiceConfigStore.notificationDescription(context)
        showAskPermission = false
      }
      PermissionUtils.AccessState.GPS_OFF -> {
        title = "GPS not allowed"
        body = "Turn on GPS / location services to continue tracking."
        showAskPermission = true
      }
      PermissionUtils.AccessState.PERMISSION_DENIED -> {
        title = "Location permission not allowed"
        body = "Tap Allow to grant location permission."
        showAskPermission = true
      }
      PermissionUtils.AccessState.GPS_AND_PERMISSION_DENIED -> {
        title = "Location / GPS not allowed"
        body = "Enable GPS and allow location permission to track in background."
        showAskPermission = true
      }
    }

    val contentIntent = launchAppPendingIntent(context)
    val builder = NotificationCompat.Builder(context, ServiceConfigStore.channelId(context))
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(contentIntent)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

    if (showAskPermission) {
      builder.addAction(
        android.R.drawable.ic_menu_mylocation,
        "Allow",
        actionPendingIntent(context, ACTION_ASK_PERMISSION, 11),
      )
    }

    // Always offer Stop while the background service is running
    builder.addAction(
      android.R.drawable.ic_menu_close_clear_cancel,
      "Stop",
      actionPendingIntent(context, ACTION_STOP, 12),
    )

    return builder.build()
  }

  fun update(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, build(context))
  }

  private fun actionPendingIntent(context: Context, action: String, requestCode: Int): PendingIntent {
    val intent = Intent(context, NotificationActionReceiver::class.java).apply {
      this.action = action
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getBroadcast(context, requestCode, intent, flags)
  }

  private fun launchAppPendingIntent(context: Context): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent().apply { setPackage(context.packageName) }
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getActivity(context, 10, launch, flags)
  }
}
