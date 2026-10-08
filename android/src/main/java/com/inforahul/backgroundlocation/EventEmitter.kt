package com.inforahul.backgroundlocation

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

object EventEmitter {
  @Volatile
  private var reactContext: ReactContext? = null

  fun setReactContext(context: ReactContext?) {
    reactContext = context
  }

  fun emit(event: String, payload: Map<String, Any?>?) {
    val ctx = reactContext ?: return
    if (!ctx.hasActiveReactInstance()) return
    val map: WritableMap = Arguments.createMap()
    payload?.forEach { (key, value) ->
      when (value) {
        null -> map.putNull(key)
        is Boolean -> map.putBoolean(key, value)
        is Int -> map.putInt(key, value)
        is Double -> map.putDouble(key, value)
        is Float -> map.putDouble(key, value.toDouble())
        is Long -> map.putDouble(key, value.toDouble())
        is String -> map.putString(key, value)
        else -> map.putString(key, value.toString())
      }
    }
    ctx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, map)
  }
}
