import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch all rows from a Supabase table/view, bypassing the 1000-row limit.
 * Uses sequential pagination with a reasonable page size.
 * For large tables, prefer direct supabase queries with order+limit instead.
 */
export async function fetchAllRows<T = any>(
  table: string,
  query?: {
    select?: string;
    order?: { column: string; ascending?: boolean };
    filters?: Array<{ method: string; args: any[] }>;
  }
): Promise<T[]> {
  const PAGE_SIZE = 1000;
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
}
