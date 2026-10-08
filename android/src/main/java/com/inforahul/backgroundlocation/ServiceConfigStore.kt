package com.inforahul.backgroundlocation

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

object ServiceConfigStore {
  private const val PREFS = "rn_bls_prefs"
  private const val KEY_CONFIG = "config_json"
  private const val KEY_RUNNING = "running"
  private const val KEY_PAUSED = "paused"

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

  fun setRunning(context: Context, running: Boolean) {
    prefs(context).edit().putBoolean(KEY_RUNNING, running).apply()
  }

  fun isRunning(context: Context): Boolean = prefs(context).getBoolean(KEY_RUNNING, false)

  fun setPaused(context: Context, paused: Boolean) {
    prefs(context).edit().putBoolean(KEY_PAUSED, paused).apply()
  }

  fun isPaused(context: Context): Boolean = prefs(context).getBoolean(KEY_PAUSED, false)

  fun notificationTitle(context: Context): String {
    val n = getConfig(context).optJSONObject("notification")
    return n?.optString("title")?.takeIf { it.isNotBlank() } ?: "Location Tracking"
  }

  fun notificationDescription(context: Context): String {
    val n = getConfig(context).optJSONObject("notification")
    return n?.optString("description")?.takeIf { it.isNotBlank() }
      ?: "Location tracking is active"
  }

  fun channelId(context: Context): String {
    val n = getConfig(context).optJSONObject("notification")
    return n?.optString("channelId")?.takeIf { it.isNotBlank() } ?: "background-location"
  }

  fun channelName(context: Context): String {
    val n = getConfig(context).optJSONObject("notification")
    return n?.optString("channelName")?.takeIf { it.isNotBlank() } ?: "Background Location"
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
