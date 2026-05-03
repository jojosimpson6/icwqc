import { supabase } from "@/integrations/supabase/client";
import { cachedQuery } from "@/lib/queryCache";

const PAGE_SIZE = 1000;

/**
 * Fetch all rows from a Supabase table or view, bypassing the 1000-row limit.
 *
 * Uses simple sequential pagination — no { count: "exact" } which breaks on
 * Supabase views (PostgREST doesn't support exact counting on views without
 * explicit configuration, causing queries to silently return an error).
 *
 * Results are cached in memory + sessionStorage via queryCache to avoid
 * redundant network calls within and across page loads.
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
      let q = supabase
        .from(table as any)
        .select(query?.select || "*");          // NO count option — safe for views

      if (query?.filters) {
        for (const f of query.filters) {
          q = (q as any)[f.method](...f.args);
        }
      }
      if (query?.order) {
        q = q.order(query.order.column, {
          ascending: query.order.ascending ?? true,
        });
      }

      const { data, error } = await q.range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error(`fetchAllRows error on "${table}":`, error.message);
        break;
      }

      const page = (data || []) as T[];
      allData.push(...page);

      // If we got fewer rows than the page size, we've reached the last page
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return allData;
  });
}
