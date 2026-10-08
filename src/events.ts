import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { BackgroundServiceEvent, EventListener, Unsubscribe } from './types';

type AnyListener = (payload: unknown) => void;

const listeners = new Map<BackgroundServiceEvent, Set<AnyListener>>();

let nativeSubscriptionAttached = false;

function ensureNativeBridge(): void {
  if (nativeSubscriptionAttached) return;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;

  const native = NativeModules.RnBackgroundLocationService;
  if (!native) return;

  const emitter = new NativeEventEmitter(native);
  const bridgeEvents: BackgroundServiceEvent[] = [
    'started',
    'stopped',
    'paused',
    'resumed',
    'location',
    'permissionChanged',
    'permissionRequired',
    'error',
  ];

  for (const event of bridgeEvents) {
    emitter.addListener(event, (payload) => {
      emitLocal(event, payload);
    });
  }

  nativeSubscriptionAttached = true;
}

export function emitLocal(event: BackgroundServiceEvent, payload?: unknown): void {
  const set = listeners.get(event);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(payload);
    } catch (_err) {
      // swallow listener errors
    }
  }
}

export function on<E extends BackgroundServiceEvent>(
  event: E,
  listener: EventListener<E>,
): Unsubscribe {
  ensureNativeBridge();
  const set = listeners.get(event) ?? new Set<AnyListener>();
  set.add(listener as AnyListener);
  listeners.set(event, set);
  return () => off(event, listener);
}

export function off<E extends BackgroundServiceEvent>(
  event: E,
  listener: EventListener<E>,
): void {
  const set = listeners.get(event);
  if (!set) return;
  set.delete(listener as AnyListener);
  if (set.size === 0) listeners.delete(event);
}
