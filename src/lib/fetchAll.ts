import { supabase } from "@/integrations/supabase/client";
import { cachedQuery } from "@/lib/queryCache";

const PAGE_SIZE = 1000;
const MAX_PARALLEL = 8;

/**
 * Fetch all rows from a Supabase table/view, bypassing the 1000-row limit.
 * Uses parallel pagination: first request gets exact count, then remaining
 * pages are fetched concurrently in batches of MAX_PARALLEL.
 * Results are cached in memory + sessionStorage to avoid redundant fetches.
 */
export async function fetchAllRows<T = any>(
  table: string,
  query?: {
    select?: string;
    order?: { column: string; ascending?: boolean };
    filters?: Array<{ method: string; args: any[] }>;
  }
): Promise<T[]> {
  const cacheKey = `fetchAll:${table}:${JSON.stringify(query || {})}`;
  return cachedQuery<T[]>(cacheKey, async () => {
    const buildQuery = (withCount: boolean) => {
      let q = supabase
        .from(table as any)
        .select(query?.select || "*", withCount ? { count: "exact" } : undefined);
      if (query?.filters) {
        for (const f of query.filters) {
          q = (q as any)[f.method](...f.args);
        }
      }
      if (query?.order) {
        q = q.order(query.order.column, { ascending: query.order.ascending ?? true });
      }
      return q;
    };

    // First page + total count in one round-trip
    const first = await buildQuery(true).range(0, PAGE_SIZE - 1);
    if (first.error) {
      console.error(`fetchAllRows error on ${table}:`, first.error);
      return [];
    }
    const firstData = (first.data || []) as T[];
    const total = first.count ?? firstData.length;

    if (firstData.length >= total || firstData.length < PAGE_SIZE) {
      return firstData;
    }

    // Build remaining page ranges
    const ranges: Array<[number, number]> = [];
    for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) {
      ranges.push([from, Math.min(from + PAGE_SIZE - 1, total - 1)]);
    }

    // Fetch in parallel batches
    const allPages: T[][] = [firstData];
    for (let i = 0; i < ranges.length; i += MAX_PARALLEL) {
      const batch = ranges.slice(i, i + MAX_PARALLEL);
      const results = await Promise.all(
        batch.map(([from, to]) =>
          buildQuery(false).range(from, to).then(r => {
            if (r.error) {
              console.error(`fetchAllRows page error on ${table}:`, r.error);
              return [] as T[];
            }
            return (r.data || []) as T[];
          })
        )
      );
      allPages.push(...results);
    }

    return allPages.flat();
  });
}
