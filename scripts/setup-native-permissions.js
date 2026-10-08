#!/usr/bin/env node
'use strict';

/**
 * Patches a bare React Native app's AndroidManifest.xml and Info.plist
 * with the permissions / usage descriptions required by this package.
 *
 * Runs automatically on `npm install` via the package `postinstall` script.
 *
 * Manual:
 *   npx rn-background-location-setup-permissions
 */

const fs = require('fs');
const path = require('path');

const ANDROID_PERMISSIONS = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
];

const IOS_PLIST_ENTRIES = {
  NSLocationWhenInUseUsageDescription:
    'This app needs your location while in use to record trips and sync location data.',
  NSLocationAlwaysAndWhenInUseUsageDescription:
    'This app needs access to your location in the background so tracking can continue when the app is closed.',
  NSLocationAlwaysUsageDescription:
    'This app needs access to your location in the background so tracking can continue when the app is closed.',
  UIBackgroundModes: ['location', 'fetch'],
};

const isPostInstall =
  process.argv.includes('--postinstall') || process.env.npm_lifecycle_event === 'postinstall';

function resolveAppRoot() {
  // npm sets INIT_CWD to the directory where the user ran `npm install`
  const candidates = [
    process.env.INIT_CWD,
    process.env.PWD,
    process.cwd(),
  ].filter(Boolean);

  // Also walk up from this package (node_modules/@inforahul/...)
  const packageDir = path.resolve(__dirname, '..');
  if (packageDir.includes(`${path.sep}node_modules${path.sep}`)) {
    // node_modules/@scope/pkg -> app root is 3 levels up for scoped packages
    candidates.push(path.resolve(packageDir, '../../..'));
    candidates.push(path.resolve(packageDir, '../../../..'));
  }

  for (const start of candidates) {
    const root = findProjectRoot(start);
    if (root) return root;
  }
  return null;
}

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 10; i += 1) {
    const pkgPath = path.join(dir, 'package.json');
    const hasAndroid = fs.existsSync(path.join(dir, 'android', 'app'));
    const hasIos = fs.existsSync(path.join(dir, 'ios'));
    if (fs.existsSync(pkgPath) && (hasAndroid || hasIos)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        // Skip this library's own repo
        if (pkg.name === '@inforahul/rn-background-location-service') {
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
          continue;
        }
      } catch (_err) {
        // ignore
      }
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findUp(startDir, relativePath) {
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, relativePath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findAndroidManifest(cwd) {
  const candidates = [
    path.join(cwd, 'android/app/src/main/AndroidManifest.xml'),
    findUp(cwd, 'android/app/src/main/AndroidManifest.xml'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function findInfoPlists(cwd) {
  const iosDir = path.join(cwd, 'ios');
  if (!fs.existsSync(iosDir)) {
    const up = findUp(cwd, 'ios');
    if (!up) return [];
    return collectInfoPlists(up);
  }
  return collectInfoPlists(iosDir);
}

function collectInfoPlists(iosDir) {
  const results = [];
  for (const entry of fs.readdirSync(iosDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.endsWith('.xcodeproj') || entry.name.endsWith('.xcworkspace')) continue;
    if (entry.name === 'Pods' || entry.name === 'build') continue;
    const plist = path.join(iosDir, entry.name, 'Info.plist');
    if (fs.existsSync(plist)) results.push(plist);
  }
  return results;
}

function ensureAndroidPermissions(manifestPath) {
  let xml = fs.readFileSync(manifestPath, 'utf8');
  let added = 0;

  for (const permission of ANDROID_PERMISSIONS) {
    if (xml.includes(`android:name="${permission}"`)) continue;
    const tag = `    <uses-permission android:name="${permission}" />\n`;
    if (xml.includes('<application')) {
      xml = xml.replace('<application', `${tag}<application`);
    } else {
      xml = xml.replace('</manifest>', `${tag}</manifest>`);
    }
    added += 1;
  }

  fs.writeFileSync(manifestPath, xml);
  return added;
}

function upsertPlistString(plist, key, value) {
  const keyTag = `<key>${key}</key>`;
  if (plist.includes(keyTag)) {
    const re = new RegExp(
      `(<key>${key}<\\/key>\\s*)<(string)>[\\s\\S]*?<\\/string>`,
      'm',
    );
    if (re.test(plist)) {
      return plist.replace(re, `$1<string>${value}</string>`);
    }
    return plist;
  }
  return plist.replace(
    '</dict>\n</plist>',
    `  ${keyTag}\n  <string>${value}</string>\n</dict>\n</plist>`,
  );
}

function upsertBackgroundModes(plist, modes) {
  const keyTag = '<key>UIBackgroundModes</key>';
  const arrayBody = modes.map((m) => `    <string>${m}</string>`).join('\n');

  if (plist.includes(keyTag)) {
    let next = plist;
    for (const mode of modes) {
      if (!next.includes(`<string>${mode}</string>`)) {
        next = next.replace(
          /(<key>UIBackgroundModes<\/key>\s*<array>)/,
          `$1\n    <string>${mode}</string>`,
        );
      }
    }
    return next;
  }

  return plist.replace(
    '</dict>\n</plist>',
    `  ${keyTag}\n  <array>\n${arrayBody}\n  </array>\n</dict>\n</plist>`,
  );
}

function ensureIosPlist(plistPath) {
  let plist = fs.readFileSync(plistPath, 'utf8');
  let changed = false;

  for (const [key, value] of Object.entries(IOS_PLIST_ENTRIES)) {
    if (key === 'UIBackgroundModes') {
      const before = plist;
      plist = upsertBackgroundModes(plist, value);
      if (plist !== before) changed = true;
      continue;
    }
    const before = plist;
    plist = upsertPlistString(plist, key, value);
    if (plist !== before) changed = true;
  }

  if (changed) fs.writeFileSync(plistPath, plist);
  return changed;
}

function main() {
  try {
    // Never fail install because of this script
    if (process.env.RN_BLS_SKIP_PERMISSION_SETUP === '1') {
      if (!isPostInstall) {
        console.log('[rn-background-location-service] Skipped (RN_BLS_SKIP_PERMISSION_SETUP=1).');
      }
      return;
    }

    const appRoot = resolveAppRoot();
    if (!appRoot) {
      if (!isPostInstall) {
        console.log(
          '[rn-background-location-service] No React Native app (android/ios) found nearby.',
        );
        console.log('  Run this again from your app root after the native projects exist.');
      }
      return;
    }

    console.log('[rn-background-location-service] Auto-configuring native permissions…');
    console.log(`  app root: ${appRoot}`);

    const manifest = findAndroidManifest(appRoot);
    if (manifest) {
      const added = ensureAndroidPermissions(manifest);
      console.log(`  AndroidManifest: ${manifest}`);
      console.log(`  Added ${added} permission(s) (existing ones skipped).`);
    } else {
      console.log('  AndroidManifest.xml not found — library manifest will still merge via Gradle.');
    }

    const plists = findInfoPlists(appRoot);
    if (plists.length === 0) {
      console.log('  Info.plist not found — skip iOS for now.');
    } else {
      for (const plist of plists) {
        const changed = ensureIosPlist(plist);
        console.log(`  Info.plist: ${plist} (${changed ? 'updated' : 'already configured'})`);
      }
    }

    console.log('  Permission setup complete. Rebuild the app (iOS: pod install).');
  } catch (err) {
    // Soft-fail so `npm install` never breaks
    console.warn(
      '[rn-background-location-service] Permission setup warning:',
      err && err.message ? err.message : err,
    );
    if (!isPostInstall) {
      process.exitCode = 1;
    }
  }
}

main();
