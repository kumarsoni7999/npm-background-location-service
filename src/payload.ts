import { Platform } from 'react-native';
import type {
  BackgroundLocation,
  BackgroundServiceConfig,
  DefaultLocationPayload,
  PayloadTransformer,
} from './types';

function createEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Default POST body shape sent to `sync.endpoint`.
 */
export function buildDefaultPayload(
  location: BackgroundLocation,
): DefaultLocationPayload {
  return {
    eventId: createEventId(),
    type: 'location',
    timestamp: location.timestamp || Date.now(),
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude,
      accuracy: location.accuracy,
      speed: location.speed,
      heading: location.heading,
    },
    device: {
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    },
  };
}

/**
 * Builds the final JSON body for sync:
 * 1. If `payloadTransformer` is set → use its return value (optionally merge `sync.body`)
 * 2. Else → default location payload + `sync.body` fields merged on top
 */
export async function buildSyncBody(
  location: BackgroundLocation,
  config: BackgroundServiceConfig,
): Promise<Record<string, unknown>> {
  const staticBody = config.sync?.body ?? {};
  const transformer: PayloadTransformer | undefined = config.payloadTransformer;

  if (transformer) {
    const custom = await transformer(location);
    return {
      ...staticBody,
      ...custom,
    };
  }

  const defaults = buildDefaultPayload(location);
  return {
    ...defaults,
    ...staticBody,
    // Keep nested location object authoritative unless body overrides keys at top level only
    location: {
      ...defaults.location,
      ...(typeof staticBody.location === 'object' && staticBody.location != null
        ? (staticBody.location as Record<string, unknown>)
        : {}),
    },
  };
}
