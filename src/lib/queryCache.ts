/**
 * Simple in-memory + sessionStorage cache for Supabase query results.
 * Avoids redundant network round-trips within and across page loads.
 *
 * Usage:
 *   import { cachedQuery, cachedFetchAllRows } from "@/lib/queryCache";
 *
 *   const data = await cachedQuery("leagues-all", () =>
 *     supabase.from("leagues").select("*")
 *   );
 */

const MEM_CACHE = new Map<string, { data: any; ts: number }>();
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes for sessionStorage
const MEM_TTL = 2 * 60 * 1000;     // 2 minutes for in-memory

function sessionGet(key: string): any | null {
  try {
    const raw = sessionStorage.getItem(`icwqc:${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > SESSION_TTL) { sessionStorage.removeItem(`icwqc:${key}`); return null; }
    return data;
  } catch { return null; }
}

function sessionSet(key: string, data: any) {
  try { sessionStorage.setItem(`icwqc:${key}`, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

/**
 * Wrap any async fetcher with caching.
 * @param key   Unique cache key (string)
 * @param fetcher  Function that returns the data (or { data } from supabase)
 * @param opts  { memOnly: true } to skip sessionStorage (for large/mutable data)
 */
export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { memOnly?: boolean } = {}
): Promise<T> {
  // 1. Memory cache hit
  const mem = MEM_CACHE.get(key);
  if (mem && Date.now() - mem.ts < MEM_TTL) return mem.data as T;

  // 2. SessionStorage hit
  if (!opts.memOnly) {
    const ss = sessionGet(key);
    if (ss !== null) {
      MEM_CACHE.set(key, { data: ss, ts: Date.now() });
      return ss as T;
    }
  }

  // 3. Fetch
  const data = await fetcher();
  MEM_CACHE.set(key, { data, ts: Date.now() });
  if (!opts.memOnly) sessionSet(key, data);
  return data;
}

/**
 * Cached version of fetchAllRows. Same signature.
 */
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;

export async function cachedFetchAllRows<T = any>(
  table: string,
  query?: {
    select?: string;
    order?: { column: string; ascending?: boolean };
    filters?: Array<{ method: string; args: any[] }>;
  },
  cacheKey?: string
): Promise<T[]> {
  const key = cacheKey || `${table}:${JSON.stringify(query || {})}`;
  return cachedQuery<T[]>(key, async () => {
    let allData: T[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      let q = supabase.from(table as any).select(query?.select || "*");
      if (query?.filters) {
        for (const f of query.filters) { q = (q as any)[f.method](...f.args); }
      }
      if (query?.order) {
        q = q.order(query.order.column, { ascending: query.order.ascending ?? true });
      }
      q = q.range(from, from + PAGE_SIZE - 1);

      const { data, error } = await q;
      if (error) { console.error(`cachedFetchAllRows error on ${table}:`, error); break; }
      if (data) allData = allData.concat(data as T[]);
      if (!data || data.length < PAGE_SIZE) { hasMore = false; } else { from += PAGE_SIZE; }
    }
    return allData;
  });
}

/** Invalidate one or all cache entries */
export function invalidateCache(key?: string) {
  if (key) {
    MEM_CACHE.delete(key);
    try { sessionStorage.removeItem(`icwqc:${key}`); } catch {}
  } else {
    MEM_CACHE.clear();
    try {
      Object.keys(sessionStorage)
        .filter(k => k.startsWith("icwqc:"))
        .forEach(k => sessionStorage.removeItem(k));
    } catch {}
  }
}
