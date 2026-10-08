import Foundation
import CoreLocation
import UIKit
import React

@objc(RnBackgroundLocationService)
class BackgroundLocationModule: RCTEventEmitter, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private var permissionResolver: RCTPromiseResolveBlock?
  private var running = false
  private var paused = false
  private var hasListeners = false

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.allowsBackgroundLocationUpdates = true
    locationManager.pausesLocationUpdatesAutomatically = false
  }

  @objc
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    [
      "started", "stopped", "paused", "resumed", "location",
      "permissionChanged", "permissionRequired", "error",
    ]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  private func emit(_ name: String, body: Any?) {
    if hasListeners {
      sendEvent(withName: name, body: body)
    }
  }

  @objc
  func configure(_ configJson: String,
                 resolver resolve: RCTPromiseResolveBlock,
                 rejecter reject: RCTPromiseRejectBlock) {
    resolve(true)
  }

  @objc
  func start(_ resolve: @escaping RCTPromiseResolveBlock,
             rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      let status = self.locationManager.authorizationStatus
      if status == .notDetermined {
        self.locationManager.requestWhenInUseAuthorization()
      } else if status == .authorizedWhenInUse {
        self.locationManager.requestAlwaysAuthorization()
      }

      if !CLLocationManager.locationServicesEnabled() {
        self.emit("permissionRequired", body: [
          "source": "start",
          "gpsEnabled": false,
          "locationGranted": false,
        ])
      }

      self.running = true
      self.paused = false
      if status == .authorizedAlways || status == .authorizedWhenInUse {
        self.locationManager.startUpdatingLocation()
      }
      self.emit("started", body: nil)
      resolve(true)
    }
  }

  @objc
  func stop(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    locationManager.stopUpdatingLocation()
    running = false
    paused = false
    emit("stopped", body: nil)
    resolve(true)
  }

  @objc
  func pause(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    paused = true
    locationManager.stopUpdatingLocation()
    emit("paused", body: nil)
    resolve(true)
  }

  @objc
  func resume(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    paused = false
    if running {
      locationManager.startUpdatingLocation()
    }
    emit("resumed", body: nil)
    resolve(true)
  }

  @objc
  func isRunning(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(running)
  }

  @objc
  func getStatus(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let status = locationManager.authorizationStatus
    resolve([
      "running": running,
      "paused": paused,
      "platform": "ios",
      "locationEnabled": CLLocationManager.locationServicesEnabled(),
      "permissionStatus": authString(status),
      "queuedItems": 0,
    ])
  }

  @objc
  func updateNotification(_ optionsJson: String,
                          resolver resolve: RCTPromiseResolveBlock,
                          rejecter reject: RCTPromiseRejectBlock) {
    resolve(true)
  }

  @objc
  func refreshNotification(_ resolve: RCTPromiseResolveBlock,
                           rejecter reject: RCTPromiseRejectBlock) {
    resolve(true)
  }

  @objc
  func getPermissionStatus(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let status = locationManager.authorizationStatus
    resolve([
      "whenInUse": mapAuth(status, whenInUse: true),
      "always": mapAuth(status, whenInUse: false),
      "authorizationStatus": authString(status),
      "locationServicesEnabled": CLLocationManager.locationServicesEnabled(),
    ])
  }

  @objc
  func requestWhenInUsePermission(_ resolve: @escaping RCTPromiseResolveBlock,
                                  rejecter reject: @escaping RCTPromiseRejectBlock) {
    permissionResolver = resolve
    DispatchQueue.main.async {
      self.locationManager.requestWhenInUseAuthorization()
      let status = self.locationManager.authorizationStatus
      if status != .notDetermined {
        resolve(self.authString(status))
        self.permissionResolver = nil
      }
    }
  }

  @objc
  func requestAlwaysPermission(_ resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
    permissionResolver = resolve
    DispatchQueue.main.async {
      self.locationManager.requestAlwaysAuthorization()
      let status = self.locationManager.authorizationStatus
      if status != .notDetermined {
        resolve(self.authString(status))
        self.permissionResolver = nil
      }
    }
  }

  @objc
  func openAppSettings(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let url = URL(string: UIApplication.openSettingsURLString) else {
        reject("OPEN_SETTINGS_ERROR", "Unable to open settings", nil)
        return
      }
      UIApplication.shared.open(url, options: [:]) { success in
        resolve(success)
      }
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    if let resolve = permissionResolver {
      resolve(authString(manager.authorizationStatus))
      permissionResolver = nil
    }
    emit("permissionChanged", body: [
      "status": authString(manager.authorizationStatus),
    ])
    if running && !paused &&
      (manager.authorizationStatus == .authorizedAlways ||
        manager.authorizationStatus == .authorizedWhenInUse) {
      locationManager.startUpdatingLocation()
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let loc = locations.last else { return }
    emit("location", body: [
      "latitude": loc.coordinate.latitude,
      "longitude": loc.coordinate.longitude,
      "altitude": loc.altitude,
      "accuracy": loc.horizontalAccuracy,
      "speed": loc.speed,
      "heading": loc.course,
      "timestamp": loc.timestamp.timeIntervalSince1970 * 1000,
    ])
  }

  private func authString(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .notDetermined: return "notDetermined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorizedAlways: return "authorizedAlways"
    case .authorizedWhenInUse: return "authorizedWhenInUse"
    @unknown default: return "unknown"
    }
  }

  private func mapAuth(_ status: CLAuthorizationStatus, whenInUse: Bool) -> String {
    switch status {
    case .authorizedAlways: return "granted"
    case .authorizedWhenInUse: return whenInUse ? "granted" : "denied"
    case .denied, .restricted: return "denied"
    case .notDetermined: return "undetermined"
    @unknown default: return "unknown"
    }
  }
}
