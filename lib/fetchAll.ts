import { supabase } from "@/integrations/supabase/client";
import { cachedQuery } from "@/lib/queryCache";

const PAGE_SIZE = 1000;

/**
 * Fetch all rows from a Supabase table or view, bypassing the 1000-row limit.
 *
 * Key guarantees:
 * - NO count:exact — safe for Supabase views (PostgREST doesn't support it on views)
 * - Automatic retry via cachedQuery (2 retries with exponential backoff)
 * - In-flight deduplication — concurrent calls with same args share one request
 * - Results cached in memory (2-10 min) + sessionStorage (5 min)
 */
export async function fetchAllRows<T = any>(
  table: string,
  query?: {
    select?: string;
    order?: { column: string; ascending?: boolean };
    filters?: Array<{ method: string; args: any[] }>;
  }
): Promise<T[]> {
  const cacheKey = `fetchAll2:${table}:${JSON.stringify(query || {})}`;

  return cachedQuery<T[]>(cacheKey, async () => {
    const allData: T[] = [];
    let from = 0;

    while (true) {
      let q = supabase.from(table as any).select(query?.select || "*");

      if (query?.filters) {
        for (const f of query.filters) {
          q = (q as any)[f.method](...f.args);
        }
      }
      if (query?.order) {
        q = q.order(query.order.column, { ascending: query.order.ascending ?? true });
      }

      const { data, error } = await q.range(from, from + PAGE_SIZE - 1);

      if (error) {
        // Throw so cachedQuery's retry logic can handle it
        throw new Error(`fetchAllRows "${table}": ${error.message}`);
      }

      const page = (data || []) as T[];
      allData.push(...page);

      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return allData;
  });
}
