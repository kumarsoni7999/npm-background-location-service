require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "InforahulRnBackgroundLocationService"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/inforahul/rn-background-location-service.git", :tag => "v#{s.version}" }
  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.requires_arc = true
  s.swift_version = "5.0"

  # Inform host apps which Info.plist keys / capabilities are required.
  # Usage description strings must still be present in the app Info.plist
  # (auto-injected via Expo plugin or `npx ... setup-permissions`).
  s.frameworks = "CoreLocation"

  s.dependency "React-Core"
end
