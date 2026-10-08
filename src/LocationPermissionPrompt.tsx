import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import {
  checkLocationPermissions,
  hasRequiredLocationAccess,
  openAppSettings,
  openLocationSettings,
  requestAllTrackingPermissions,
  type RequestAllPermissionsResult,
} from './permissions';
import type { NativePermissionStatus } from './NativeModule';

export type LocationPermissionPromptRenderProps = {
  status: NativePermissionStatus | null;
  granted: boolean;
  loading: boolean;
  lastResult: RequestAllPermissionsResult | null;
  requestAllow: () => Promise<void>;
  openSettings: () => Promise<void>;
  openGpsSettings: () => Promise<void>;
  refresh: () => Promise<void>;
};

export type LocationPermissionPromptProps = {
  /** Hide the prompt entirely when permission + GPS are OK (default: true) */
  hideWhenGranted?: boolean;
  title?: string;
  message?: string;
  allowLabel?: string;
  settingsLabel?: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  messageStyle?: StyleProp<TextStyle>;
  buttonStyle?: StyleProp<ViewStyle>;
  buttonTextStyle?: StyleProp<TextStyle>;
  /**
   * Fully custom UI — return your own component.
   * Use this to build any Allow / timer / branding UI you want in-app.
   */
  children?: (props: LocationPermissionPromptRenderProps) => ReactNode;
  onGranted?: () => void;
  onDenied?: (result: RequestAllPermissionsResult) => void;
};

/**
 * In-app “Allow location” UI you can place anywhere.
 * Use `children` render-prop to fully replace the default UI with your own component.
 */
export function LocationPermissionPrompt({
  hideWhenGranted = true,
  title = 'Location permission required',
  message = 'Allow location (and GPS) so background tracking can continue.',
  allowLabel = 'Allow',
  settingsLabel = 'Open settings',
  style,
  titleStyle,
  messageStyle,
  buttonStyle,
  buttonTextStyle,
  children,
  onGranted,
  onDenied,
}: LocationPermissionPromptProps) {
  const [status, setStatus] = useState<NativePermissionStatus | null>(null);
  const [granted, setGranted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<RequestAllPermissionsResult | null>(null);

  const refresh = useCallback(async () => {
    const next = await checkLocationPermissions();
    const ok = await hasRequiredLocationAccess();
    setStatus(next);
    setGranted(ok);
    if (ok) onGranted?.();
  }, [onGranted]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestAllow = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestAllTrackingPermissions();
      setLastResult(result);
      await refresh();
      const ok = await hasRequiredLocationAccess();
      if (!ok) onDenied?.(result);
    } finally {
      setLoading(false);
    }
  }, [onDenied, refresh]);

  const openSettings = useCallback(async () => {
    await openAppSettings();
  }, []);

  const openGpsSettings = useCallback(async () => {
    await openLocationSettings();
  }, []);

  const renderProps: LocationPermissionPromptRenderProps = {
    status,
    granted,
    loading,
    lastResult,
    requestAllow,
    openSettings,
    openGpsSettings,
    refresh,
  };

  if (hideWhenGranted && granted) {
    return null;
  }

  if (children) {
    return <>{children(renderProps)}</>;
  }

  return (
    <View style={[styles.card, style]}>
      <Text style={[styles.title, titleStyle]}>{title}</Text>
      <Text style={[styles.message, messageStyle]}>{message}</Text>
      <Pressable
        style={[styles.button, buttonStyle]}
        onPress={() => {
          void requestAllow();
        }}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.buttonText, buttonTextStyle]}>{allowLabel}</Text>
        )}
      </Pressable>
      <Pressable
        style={[styles.secondaryButton, buttonStyle]}
        onPress={() => {
          void openSettings();
        }}
      >
        <Text style={[styles.secondaryText, buttonTextStyle]}>{settingsLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#111827',
    gap: 10,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
  },
  message: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    marginTop: 4,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  secondaryButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#93C5FD',
    fontSize: 14,
    fontWeight: '500',
  },
});
