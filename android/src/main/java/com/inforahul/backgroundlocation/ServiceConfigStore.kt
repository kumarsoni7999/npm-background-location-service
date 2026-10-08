package com.inforahul.backgroundlocation

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

object ServiceConfigStore {
  private const val PREFS = "rn_bls_prefs"
  private const val KEY_CONFIG = "config_json"
  private const val KEY_RUNNING = "running"
  private const val KEY_PAUSED = "paused"
  private const val KEY_REQUIRE_LOCATION = "require_location_permission"
  private const val KEY_TIMER_START = "timer_start_at"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun saveConfig(context: Context, configJson: String) {
    prefs(context).edit().putString(KEY_CONFIG, configJson).apply()
  }

  fun getConfigJson(context: Context): String? = prefs(context).getString(KEY_CONFIG, null)

  fun getConfig(context: Context): JSONObject {
    val raw = getConfigJson(context) ?: return defaultConfig()
    return try {
      JSONObject(raw)
    } catch (_: Exception) {
      defaultConfig()
    }
  }

  fun notificationObject(context: Context): JSONObject {
    return getConfig(context).optJSONObject("notification") ?: JSONObject()
  }

  fun setRunning(context: Context, running: Boolean) {
    prefs(context).edit().putBoolean(KEY_RUNNING, running).apply()
  }

  fun isRunning(context: Context): Boolean = prefs(context).getBoolean(KEY_RUNNING, false)

  fun setPaused(context: Context, paused: Boolean) {
    prefs(context).edit().putBoolean(KEY_PAUSED, paused).apply()
  }

  fun isPaused(context: Context): Boolean = prefs(context).getBoolean(KEY_PAUSED, false)

  fun setRequireLocationPermission(context: Context, required: Boolean) {
    prefs(context).edit().putBoolean(KEY_REQUIRE_LOCATION, required).apply()
  }

  fun requireLocationPermission(context: Context): Boolean =
    prefs(context).getBoolean(KEY_REQUIRE_LOCATION, true)

  fun ensureTimerStart(context: Context) {
    val n = notificationObject(context)
    val fromConfig = n.optLong("timerStartAt", 0L)
    if (fromConfig > 0L) {
      prefs(context).edit().putLong(KEY_TIMER_START, fromConfig).apply()
      return
    }
    if (prefs(context).getLong(KEY_TIMER_START, 0L) == 0L) {
      prefs(context).edit().putLong(KEY_TIMER_START, System.currentTimeMillis()).apply()
    }
  }

  fun timerStartAt(context: Context): Long {
    val stored = prefs(context).getLong(KEY_TIMER_START, 0L)
    if (stored > 0L) return stored
    val n = notificationObject(context)
    val fromConfig = n.optLong("timerStartAt", 0L)
    return if (fromConfig > 0L) fromConfig else System.currentTimeMillis()
  }

  fun clearTimerStart(context: Context) {
    prefs(context).edit().remove(KEY_TIMER_START).apply()
  }

  fun notificationTitle(context: Context): String {
    val n = notificationObject(context)
    return n.optString("title")?.takeIf { it.isNotBlank() } ?: "Location Tracking"
  }

  fun notificationDescription(context: Context): String {
    val n = notificationObject(context)
    return n.optString("description")?.takeIf { it.isNotBlank() }
      ?: "Location tracking is active"
  }

  fun deniedTitle(context: Context): String {
    val n = notificationObject(context)
    return n.optString("deniedTitle")?.takeIf { it.isNotBlank() }
      ?: "Location / GPS not allowed"
  }

  fun deniedDescription(context: Context): String {
    val n = notificationObject(context)
    return n.optString("deniedDescription")?.takeIf { it.isNotBlank() }
      ?: "Tap Allow to enable location permission / GPS."
  }

  fun channelId(context: Context): String {
    val n = notificationObject(context)
    return n.optString("channelId")?.takeIf { it.isNotBlank() } ?: "background-location"
  }

  fun channelName(context: Context): String {
    val n = notificationObject(context)
    return n.optString("channelName")?.takeIf { it.isNotBlank() } ?: "Background Location"
  }

  fun showAllowWhenDenied(context: Context): Boolean {
    if (!requireLocationPermission(context)) return false
    val n = notificationObject(context)
    if (n.has("showAllowWhenDenied")) return n.optBoolean("showAllowWhenDenied", true)
    return true
  }

  fun optNotificationString(context: Context, key: String): String? {
    val value = notificationObject(context).optString(key, "")
    return value.takeIf { it.isNotBlank() }
  }

  fun optNotificationBoolean(context: Context, key: String, default: Boolean = false): Boolean {
    val n = notificationObject(context)
    if (!n.has(key)) return default
    return n.optBoolean(key, default)
  }

  private fun defaultConfig(): JSONObject = JSONObject(
    """
    {
      "location": { "enabled": true },
      "notification": {
        "title": "Location Tracking",
        "description": "Location tracking is active",
        "channelId": "background-location",
        "channelName": "Background Location"
      }
    }
    """.trimIndent(),
  )
}
