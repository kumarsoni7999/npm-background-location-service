package com.inforahul.backgroundlocation

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Transparent activity launched from the notification "Allow" button
 * to show the system location permission dialog.
 */
class PermissionRequestActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val needed = mutableListOf<String>()
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED
    ) {
      needed.add(Manifest.permission.ACCESS_FINE_LOCATION)
    }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
      != PackageManager.PERMISSION_GRANTED
    ) {
      needed.add(Manifest.permission.ACCESS_COARSE_LOCATION)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
      != PackageManager.PERMISSION_GRANTED
    ) {
      needed.add(Manifest.permission.POST_NOTIFICATIONS)
    }

    if (needed.isEmpty()) {
      // Maybe need background location next (Android 10+)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        != PackageManager.PERMISSION_GRANTED
      ) {
        ActivityCompat.requestPermissions(
          this,
          arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
          REQ_BG,
        )
        return
      }
      refreshAndFinish()
      return
    }

    ActivityCompat.requestPermissions(this, needed.toTypedArray(), REQ_FG)
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)

    if (requestCode == REQ_FG &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      PermissionUtils.hasFineOrCoarseLocation(this) &&
      !PermissionUtils.hasBackgroundLocation(this)
    ) {
      ActivityCompat.requestPermissions(
        this,
        arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
        REQ_BG,
      )
      return
    }

    EventEmitter.emit(
      "permissionChanged",
      mapOf(
        "locationGranted" to PermissionUtils.hasFineOrCoarseLocation(this),
        "backgroundGranted" to PermissionUtils.hasBackgroundLocation(this),
        "gpsEnabled" to PermissionUtils.isLocationServicesEnabled(this),
      ),
    )
    refreshAndFinish()
  }

  private fun refreshAndFinish() {
    if (ServiceConfigStore.isRunning(this)) {
      NotificationHelper.update(this)
      val refresh = android.content.Intent(this, BackgroundForegroundService::class.java).apply {
        action = BackgroundForegroundService.ACTION_REFRESH
      }
      startService(refresh)
    }
    finish()
  }

  companion object {
    private const val REQ_FG = 1001
    private const val REQ_BG = 1002
  }
}
