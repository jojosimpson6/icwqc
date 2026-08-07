/**
 * Robust query cache with:
 * - In-flight deduplication: concurrent requests for the same key share one fetch
 * - Memory cache (10 min TTL for stable data, 2 min default)
 * - sessionStorage persistence (5 min TTL)
 * - Automatic retry with exponential backoff on failure
 * - Never caches errors or empty arrays from failed fetches
 */

// Bump when cached payloads may be stale/corrupt (e.g. after a pagination fix)
const CACHE_VERSION = "v2";
const PREFIX = `qr:${CACHE_VERSION}:`;

const MEM_CACHE = new Map<string, { data: any; ts: number; ttl: number }>();
const IN_FLIGHT = new Map<string, Promise<any>>();
const SESSION_TTL = 5 * 60 * 1000;   // 5 min sessionStorage
const DEFAULT_TTL = 2 * 60 * 1000;   // 2 min memory (most data)
const STABLE_TTL  = 10 * 60 * 1000;  // 10 min memory (leagues, players list, teams)

// Drop caches written by older versions of the app
try {
  Object.keys(sessionStorage)
    .filter(k => k.startsWith("qr:") && !k.startsWith(PREFIX))
    .forEach(k => sessionStorage.removeItem(k));
} catch { /* ignore */ }


// Keys whose data rarely changes — give them a longer memory TTL
const STABLE_PREFIXES = ["fetchAll2:players:", "fetchAll2:leagues:", "fetchAll2:teams:", "fetchAll2:nations:"];

function isStable(key: string): boolean {
  return STABLE_PREFIXES.some(p => key.startsWith(p));
}

function sessionGet(key: string): any | null {
  try {
    const raw = sessionStorage.getItem(`qr:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - parsed.ts > SESSION_TTL) {
      sessionStorage.removeItem(`qr:${key}`);
      return null;
    }
    return parsed.data;
  } catch { return null; }
}

function sessionSet(key: string, data: any): void {
  try {
    const serialized = JSON.stringify({ data, ts: Date.now() });
    // Skip if payload is too large (>1MB) to avoid quota errors
    if (serialized.length > 1_000_000) return;
    sessionStorage.setItem(`qr:${key}`, serialized);
  } catch {
    // Quota exceeded — evict oldest entries and try once more
    try {
      const keys = Object.keys(sessionStorage).filter(k => k.startsWith("qr:"));
      if (keys.length > 0) {
        // Remove oldest half
        keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => sessionStorage.removeItem(k));
        sessionStorage.setItem(`qr:${key}`, JSON.stringify({ data, ts: Date.now() }));
      }
    } catch { /* give up gracefully */ }
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 400): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const ttl = isStable(key) ? STABLE_TTL : DEFAULT_TTL;

  // 1. Memory hit
  const mem = MEM_CACHE.get(key);
  if (mem && Date.now() - mem.ts < mem.ttl) return mem.data as T;

  // 2. SessionStorage hit
  const ss = sessionGet(key);
  if (ss !== null) {
    MEM_CACHE.set(key, { data: ss, ts: Date.now(), ttl });
    return ss as T;
  }

  // 3. In-flight deduplication — if a fetch for this key is already running, wait for it
  const inFlight = IN_FLIGHT.get(key);
  if (inFlight) return inFlight as Promise<T>;

  // 4. Fetch with retry
  const promise = withRetry(fetcher)
    .then(data => {
      MEM_CACHE.set(key, { data, ts: Date.now(), ttl });
      sessionSet(key, data);
      IN_FLIGHT.delete(key);
      return data;
    })
    .catch(err => {
      IN_FLIGHT.delete(key);
      console.error(`cachedQuery failed for "${key}":`, err);
      throw err;
    });

  IN_FLIGHT.set(key, promise);
  return promise;
}

export function invalidateCache(key?: string): void {
  if (key) {
    MEM_CACHE.delete(key);
    try { sessionStorage.removeItem(`qr:${key}`); } catch {}
  } else {
    MEM_CACHE.clear();
    try {
      Object.keys(sessionStorage).filter(k => k.startsWith("qr:")).forEach(k => sessionStorage.removeItem(k));
    } catch {}
  }
}
