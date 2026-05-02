import { supabase } from "@/integrations/supabase/client";
import { cachedQuery } from "@/lib/queryCache";

const PAGE_SIZE = 1000;

/**
 * Fetch all rows from a Supabase table/view, bypassing the 1000-row limit.
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
    let allData: T[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      let q = supabase.from(table as any).select(query?.select || "*");
      if (query?.filters) {
        for (const f of query.filters) {
          q = (q as any)[f.method](...f.args);
        }
      }
      if (query?.order) {
        q = q.order(query.order.column, { ascending: query.order.ascending ?? true });
      }
      q = q.range(from, from + PAGE_SIZE - 1);

      const { data, error } = await q;
      if (error) {
        console.error(`fetchAllRows error on ${table}:`, error);
        break;
      }
      if (data) allData = allData.concat(data as T[]);
      if (!data || data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        from += PAGE_SIZE;
      }
    }
    return allData;
  });
}
