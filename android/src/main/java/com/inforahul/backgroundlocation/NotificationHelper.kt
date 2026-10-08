package com.inforahul.backgroundlocation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import java.net.HttpURLConnection
import java.net.URL

object NotificationHelper {
  const val NOTIFICATION_ID = 7401

  const val ACTION_STOP = "com.inforahul.backgroundlocation.ACTION_STOP"
  const val ACTION_ASK_PERMISSION = "com.inforahul.backgroundlocation.ACTION_ASK_PERMISSION"
  const val ACTION_REPOST = "com.inforahul.backgroundlocation.ACTION_REPOST"

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channelId = ServiceConfigStore.channelId(context)
    val existing = manager.getNotificationChannel(channelId)
    if (existing == null) {
      val channel = NotificationChannel(
        channelId,
        ServiceConfigStore.channelName(context),
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Background location tracking (persistent)"
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
      manager.createNotificationChannel(channel)
    }
  }

  fun build(context: Context): Notification {
    ensureChannel(context)
    val access = PermissionUtils.accessState(context)
    val denied = access != PermissionUtils.AccessState.OK

    val title: String
    val body: String
    when (access) {
      PermissionUtils.AccessState.OK -> {
        title = ServiceConfigStore.notificationTitle(context)
        body = ServiceConfigStore.notificationDescription(context)
      }
      PermissionUtils.AccessState.GPS_OFF -> {
        title = ServiceConfigStore.optNotificationString(context, "deniedTitle")
          ?: "GPS not allowed"
        body = ServiceConfigStore.optNotificationString(context, "deniedDescription")
          ?: "Turn on GPS / location services to continue tracking."
      }
      PermissionUtils.AccessState.PERMISSION_DENIED -> {
        title = ServiceConfigStore.optNotificationString(context, "deniedTitle")
          ?: "Location permission not allowed"
        body = ServiceConfigStore.optNotificationString(context, "deniedDescription")
          ?: "Tap Allow to grant location permission."
      }
      PermissionUtils.AccessState.GPS_AND_PERMISSION_DENIED -> {
        title = ServiceConfigStore.deniedTitle(context)
        body = ServiceConfigStore.deniedDescription(context)
      }
    }

    val showAskPermission = denied && ServiceConfigStore.showAllowWhenDenied(context)
    val allowText = ServiceConfigStore.optNotificationString(context, "allowButtonText") ?: "Allow"
    val stopText = ServiceConfigStore.optNotificationString(context, "stopButtonText") ?: "Stop"

    val smallIcon = resolveDrawableId(
      context,
      ServiceConfigStore.optNotificationString(context, "smallIcon"),
    ) ?: android.R.drawable.ic_menu_mylocation

    val contentIntent = launchAppPendingIntent(context)
    val builder = NotificationCompat.Builder(context, ServiceConfigStore.channelId(context))
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(smallIcon)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setContentIntent(contentIntent)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setDeleteIntent(actionPendingIntent(context, ACTION_REPOST, 13))

    applyColor(builder, ServiceConfigStore.optNotificationString(context, "color"))
    applyLargeIcon(context, builder)
    applyStyle(context, builder, title, body)
    applyCustomLayouts(context, builder, title, body)
    applyTimer(context, builder)

    if (showAskPermission) {
      builder.addAction(
        android.R.drawable.ic_menu_mylocation,
        allowText,
        actionPendingIntent(context, ACTION_ASK_PERMISSION, 11),
      )
    }

    builder.addAction(
      android.R.drawable.ic_menu_close_clear_cancel,
      stopText,
      actionPendingIntent(context, ACTION_STOP, 12),
    )

    val notification = builder.build()
    notification.flags = notification.flags or
      Notification.FLAG_ONGOING_EVENT or
      Notification.FLAG_NO_CLEAR or
      Notification.FLAG_FOREGROUND_SERVICE

    return notification
  }

  private fun applyColor(builder: NotificationCompat.Builder, color: String?) {
    if (color.isNullOrBlank()) return
    try {
      builder.setColor(Color.parseColor(color))
    } catch (_: Exception) {
      // ignore invalid color
    }
  }

  private fun applyLargeIcon(context: Context, builder: NotificationCompat.Builder) {
    val source = ServiceConfigStore.optNotificationString(context, "largeIcon") ?: return
    val bitmap = loadBitmap(context, source) ?: return
    builder.setLargeIcon(bitmap)
  }

  private fun applyStyle(
    context: Context,
    builder: NotificationCompat.Builder,
    title: String,
    body: String,
  ) {
    val styleName = ServiceConfigStore.optNotificationString(context, "style") ?: "bigText"
    val imageUri = ServiceConfigStore.optNotificationString(context, "imageUri")
      ?: ServiceConfigStore.optNotificationString(context, "bigPictureUri")

    when (styleName) {
      "bigPicture" -> {
        val bitmap = imageUri?.let { loadBitmap(context, it) }
        if (bitmap != null) {
          builder.setStyle(
            NotificationCompat.BigPictureStyle()
              .bigPicture(bitmap)
              .setBigContentTitle(title)
              .setSummaryText(body),
          )
        } else {
          builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }
      }
      "chronometer", "default" -> {
        // chronometer handled separately; still show text
        builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
      }
      else -> builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
    }
  }

  private fun applyTimer(context: Context, builder: NotificationCompat.Builder) {
    val showTimer = ServiceConfigStore.optNotificationBoolean(context, "showTimer", false) ||
      ServiceConfigStore.optNotificationString(context, "style") == "chronometer"
    if (!showTimer) return

    val startAt = ServiceConfigStore.timerStartAt(context)
    val countDown = ServiceConfigStore.optNotificationBoolean(context, "chronometerCountDown", false)
    builder.setUsesChronometer(true)
    builder.setChronometerCountDown(countDown)
    builder.setWhen(startAt)
    builder.setShowWhen(true)
  }

  private fun applyCustomLayouts(
    context: Context,
    builder: NotificationCompat.Builder,
    title: String,
    body: String,
  ) {
    val collapsed = ServiceConfigStore.optNotificationString(context, "customLayout")
    val expanded = ServiceConfigStore.optNotificationString(context, "customExpandedLayout")
    if (collapsed.isNullOrBlank() && expanded.isNullOrBlank()) return

    collapsed?.let { name ->
      inflateRemoteViews(context, name, title, body)?.let { builder.setCustomContentView(it) }
    }
    expanded?.let { name ->
      inflateRemoteViews(context, name, title, body)?.let { builder.setCustomBigContentView(it) }
    }
    builder.setStyle(NotificationCompat.DecoratedCustomViewStyle())
  }

  private fun inflateRemoteViews(
    context: Context,
    layoutName: String,
    title: String,
    body: String,
  ): RemoteViews? {
    val layoutId = context.resources.getIdentifier(layoutName, "layout", context.packageName)
    if (layoutId == 0) return null
    val views = RemoteViews(context.packageName, layoutId)
    setRemoteText(context, views, "bls_title", title)
    setRemoteText(context, views, "bls_text", body)
    // Optional chronometer view id
    val timerId = context.resources.getIdentifier("bls_timer", "id", context.packageName)
    if (timerId != 0 && ServiceConfigStore.optNotificationBoolean(context, "showTimer", false)) {
      try {
        views.setChronometer(
          timerId,
          ServiceConfigStore.timerStartAt(context),
          null,
          true,
        )
      } catch (_: Exception) {
        // ignore if view is not a Chronometer
      }
    }
    return views
  }

  private fun setRemoteText(context: Context, views: RemoteViews, idName: String, text: String) {
    val id = context.resources.getIdentifier(idName, "id", context.packageName)
    if (id != 0) {
      views.setTextViewText(id, text)
    }
  }

  private fun resolveDrawableId(context: Context, name: String?): Int? {
    if (name.isNullOrBlank()) return null
    val id = context.resources.getIdentifier(name, "drawable", context.packageName)
    return if (id != 0) id else null
  }

  private fun loadBitmap(context: Context, source: String): Bitmap? {
    return try {
      when {
        source.startsWith("http://") || source.startsWith("https://") -> {
          val connection = URL(source).openConnection() as HttpURLConnection
          connection.connectTimeout = 4000
          connection.readTimeout = 4000
          connection.inputStream.use { BitmapFactory.decodeStream(it) }
        }
        source.startsWith("content://") || source.startsWith("file://") -> {
          context.contentResolver.openInputStream(Uri.parse(source))?.use {
            BitmapFactory.decodeStream(it)
          }
        }
        else -> {
          val id = resolveDrawableId(context, source) ?: return null
          BitmapFactory.decodeResource(context.resources, id)
        }
      }
    } catch (_: Exception) {
      null
    }
  }

  fun update(context: Context) {
    if (!ServiceConfigStore.isRunning(context)) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, build(context))
  }

  fun repostIfRunning(context: Context) {
    if (!ServiceConfigStore.isRunning(context)) return
    val refresh = Intent(context, BackgroundForegroundService::class.java).apply {
      action = BackgroundForegroundService.ACTION_REFRESH
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(refresh)
      } else {
        context.startService(refresh)
      }
    } catch (_: Exception) {
      update(context)
    }
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
