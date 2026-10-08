package com.inforahul.backgroundlocation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import androidx.core.content.ContextCompat

object PermissionUtils {
  fun hasFineOrCoarseLocation(context: Context): Boolean {
    val fine = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.ACCESS_FINE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    val coarse = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.ACCESS_COARSE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    return fine || coarse
  }

  fun hasBackgroundLocation(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.ACCESS_BACKGROUND_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
  }

  fun isLocationServicesEnabled(context: Context): Boolean {
    return try {
      val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
        lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    } catch (_: Exception) {
      false
    }
  }

  fun accessState(context: Context): AccessState {
    val gpsOn = isLocationServicesEnabled(context)
    val locOk = hasFineOrCoarseLocation(context)
    return when {
      !gpsOn && !locOk -> AccessState.GPS_AND_PERMISSION_DENIED
      !gpsOn -> AccessState.GPS_OFF
      !locOk -> AccessState.PERMISSION_DENIED
      else -> AccessState.OK
    }
  }

  enum class AccessState {
    OK,
    GPS_OFF,
    PERMISSION_DENIED,
    GPS_AND_PERMISSION_DENIED,
  }
}
