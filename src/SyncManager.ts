import type { BackgroundLocation, BackgroundServiceConfig } from './types';
import { buildSyncBody } from './payload';
import { emitLocal, on } from './events';

type QueueEntry = {
  eventId: string;
  payload: Record<string, unknown>;
  retries: number;
  maxRetries: number;
  createdAt: number;
  lastError?: string;
};

/** In-memory only — no AsyncStorage / NetInfo / other libraries. */
const queue: QueueEntry[] = [];
const seenIds = new Set<string>();

let activeConfig: BackgroundServiceConfig | null = null;
let unsubscribeLocation: (() => void) | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let lastSyncAt: number | undefined;
let flushing = false;

function debugLog(config: BackgroundServiceConfig | null, message: string): void {
  if (config?.debug) {
    console.log(`[RnBackgroundLocation] ${message}`);
  }
}

function getEventId(payload: Record<string, unknown>): string {
  const id = payload.eventId;
  return typeof id === 'string' && id.length > 0
    ? id
    : `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isNetworkFailure(error: string): boolean {
  const e = error.toLowerCase();
  return (
    e.includes('network') ||
    e.includes('failed to fetch') ||
    e.includes('offline') ||
    e.includes('internet') ||
    e.includes('timed out') ||
    e.includes('timeout') ||
    e.includes('connection') ||
    e.includes('unreachable') ||
    e.includes('network request failed')
  );
}

function emitQueueStatus(config: BackgroundServiceConfig): void {
  emitLocal('queueUpdated', {
    total: queue.length,
    pending: queue.length,
    failed: 0,
    syncing: flushing ? 1 : 0,
    maxItems: config.queue?.maxItems ?? 1000,
  });
}

async function postPayload(
  config: BackgroundServiceConfig,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; error?: string; offline?: boolean }> {
  const endpoint = config.sync?.endpoint;
  if (!endpoint) {
    return { ok: false, error: 'missing_endpoint' };
  }

  const method = config.sync?.method ?? 'POST';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(config.sync?.headers ?? {}),
  };

  const eventId = getEventId(payload);
  emitLocal('syncStarted', { eventId });

  try {
    const response = await fetch(endpoint, {
      method,
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = `HTTP_${response.status}`;
      emitLocal('syncFailed', { eventId, error });
      return { ok: false, status: response.status, error, offline: false };
    }

    lastSyncAt = Date.now();
    emitLocal('syncSuccess', { eventId, statusCode: response.status });
    return { ok: true, status: response.status };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'network_error';
    emitLocal('syncFailed', { eventId, error });
    return { ok: false, error, offline: isNetworkFailure(error) || true };
  }
}

function enqueue(
  payload: Record<string, unknown>,
  config: BackgroundServiceConfig,
  lastError?: string,
): void {
  if (config.queue?.enabled === false) return;

  const eventId = getEventId(payload);
  if (seenIds.has(eventId)) return;

  const maxItems = config.queue?.maxItems ?? 1000;
  const maxRetries = config.queue?.retryCount ?? 5;

  while (queue.length >= maxItems) {
    const dropped = queue.shift();
    if (dropped) seenIds.delete(dropped.eventId);
  }

  queue.push({
    eventId,
    payload: { ...payload, eventId },
    retries: 0,
    maxRetries,
    createdAt: Date.now(),
    lastError,
  });
  seenIds.add(eventId);
  emitQueueStatus(config);
  debugLog(config, `Offline: saved in memory (${queue.length} pending)`);
}

/**
 * When internet is back, POST every queued coordinate (oldest first).
 * Uses only fetch — no NetInfo / AsyncStorage.
 */
async function flushQueue(config: BackgroundServiceConfig): Promise<void> {
  if (flushing) return;
  if (!config.sync?.enabled || !config.sync.endpoint) return;
  if (config.queue?.enabled === false) return;
  if (queue.length === 0) return;

  flushing = true;
  emitQueueStatus(config);

  try {
    while (queue.length > 0) {
      const item = queue[0];
      const result = await postPayload(config, item.payload);

      if (result.ok) {
        queue.shift();
        seenIds.delete(item.eventId);
        emitQueueStatus(config);
        continue;
      }

      // Still offline / network error → keep queue, try again later
      if (result.offline) {
        debugLog(config, 'Still offline — keeping memory queue');
        break;
      }

      // Server error while online — retry with limit
      item.retries += 1;
      item.lastError = result.error;
      if (item.retries > item.maxRetries) {
        queue.shift();
        seenIds.delete(item.eventId);
        debugLog(config, `Dropped after max retries: ${item.eventId}`);
      }
      emitQueueStatus(config);
      break;
    }
  } finally {
    flushing = false;
    emitQueueStatus(config);
  }
}

async function handleLocation(location: BackgroundLocation): Promise<void> {
  const config = activeConfig;
  if (!config?.sync?.enabled || !config.sync.endpoint) return;

  const payload = await buildSyncBody(location, config);
  const queueEnabled = config.queue?.enabled !== false;

  const result = await postPayload(config, payload);

  if (result.ok) {
    // Internet works — also drain anything stored while offline
    if (queue.length > 0) {
      void flushQueue(config);
    }
    return;
  }

  if (queueEnabled) {
    enqueue(payload, config, result.error);
  }
}

export const SyncManager = {
  setConfig(config: BackgroundServiceConfig): void {
    activeConfig = config;
  },

  start(): void {
    if (unsubscribeLocation) {
      unsubscribeLocation();
      unsubscribeLocation = null;
    }
    unsubscribeLocation = on('location', (location) => {
      void handleLocation(location);
    });

    if (syncTimer) clearInterval(syncTimer);
    const interval = activeConfig?.sync?.interval ?? 30_000;
    syncTimer = setInterval(() => {
      if (activeConfig) void flushQueue(activeConfig);
    }, interval);

    if (activeConfig) {
      emitQueueStatus(activeConfig);
      void flushQueue(activeConfig);
    }
  },

  stop(): void {
    if (unsubscribeLocation) {
      unsubscribeLocation();
      unsubscribeLocation = null;
    }
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  },

  getQueueSize(): number {
    return queue.length;
  },

  getLastSyncAt(): number | undefined {
    return lastSyncAt;
  },

  clearQueue(): void {
    queue.length = 0;
    seenIds.clear();
    if (activeConfig) emitQueueStatus(activeConfig);
  },

  async flushNow(): Promise<void> {
    if (activeConfig) await flushQueue(activeConfig);
  },
};
