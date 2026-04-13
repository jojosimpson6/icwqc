import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch all rows from a Supabase table/view, bypassing the 1000-row limit.
 * Gets total count first, then fetches ALL pages in parallel for maximum speed.
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

  const applyFilters = (q: any) => {
    if (query?.filters) {
      for (const f of query.filters) {
        q = q[f.method](...f.args);
      }
    }
    return q;
  };

  // Step 1: Get exact count (head request — no data transfer)
  let countQuery = supabase.from(table as any).select("*", { count: "exact", head: true });
  countQuery = applyFilters(countQuery);
  const { count, error: countError } = await countQuery;

  if (countError || count === null) {
    // Fall back to sequential fetch if count fails
    console.warn(`fetchAllRows: count failed for ${table}, falling back to sequential`);
    return fetchAllRowsSequential<T>(table, query);
  }

  if (count === 0) return [];
  if (count <= PAGE_SIZE) {
    // Only one page needed
    let q = supabase.from(table as any).select(query?.select || "*");
    q = applyFilters(q);
    if (query?.order) q = q.order(query.order.column, { ascending: query.order.ascending ?? true });
    const { data, error } = await q.range(0, PAGE_SIZE - 1);
    if (error) { console.error(`fetchAllRows error on ${table}:`, error); return []; }
    return (data || []) as T[];
  }

  // Step 2: Compute all page offsets and fetch ALL pages in parallel
  const totalPages = Math.ceil(count / PAGE_SIZE);
  const offsets = Array.from({ length: totalPages }, (_, i) => i * PAGE_SIZE);

  const buildPage = (from: number) => {
    let q = supabase.from(table as any).select(query?.select || "*");
    q = applyFilters(q);
    if (query?.order) q = q.order(query.order.column, { ascending: query.order.ascending ?? true });
    return q.range(from, from + PAGE_SIZE - 1);
  };

  // Fetch all pages in parallel — Supabase supports concurrent requests well
  const results = await Promise.all(offsets.map(from => buildPage(from)));

  const allData: T[] = [];
  for (const { data, error } of results) {
    if (error) { console.error(`fetchAllRows page error on ${table}:`, error); continue; }
    if (data) allData.push(...(data as T[]));
  }

  return allData;
}

/** Sequential fallback */
async function fetchAllRowsSequential<T>(
  table: string,
  query?: { select?: string; order?: { column: string; ascending?: boolean }; filters?: Array<{ method: string; args: any[] }> }
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let allData: T[] = [];
  let from = 0;

  while (true) {
    let q = supabase.from(table as any).select(query?.select || "*");
    if (query?.filters) for (const f of query.filters) q = (q as any)[f.method](...f.args);
    if (query?.order) q = q.order(query.order.column, { ascending: query.order.ascending ?? true });
    q = q.range(from, from + PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error) { console.error(`fetchAllRows error on ${table}:`, error); break; }
    if (data) allData = allData.concat(data as T[]);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allData;
}
