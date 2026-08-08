import { supabase } from "@/integrations/supabase/client";
import { cachedQuery } from "@/lib/queryCache";

const PAGE_SIZE = 1000;
const PAGE_RETRIES = 2;

async function wait(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

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
    cache?: boolean;
  }
): Promise<T[]> {
  const cacheKey = `fetchAll3:${table}:${JSON.stringify(query || {})}`;

  const fetchRows = async (): Promise<T[]> => {
    const allData: T[] = [];
    let from = 0;

    while (true) {
      let q = supabase.from(table as any).select(query?.select || "*");

      if (query?.filters) {
        for (const f of query.filters) {
          q = (q as any)[f.method](...f.args);
        }
      }
      // A stable sort is REQUIRED for range-based pagination: without it Postgres
      // may order rows differently per page, producing duplicates and gaps.
      if (query?.order) {
        q = q.order(query.order.column, { ascending: query.order.ascending ?? true });
      } else {
        const firstCol = (query?.select || "")
          .split(",")[0]
          ?.trim()
          .replace(/^"|"$/g, "");
        if (firstCol && firstCol !== "*" && !firstCol.includes("(")) {
          q = q.order(firstCol, { ascending: true });
        }
      }


      let data: unknown[] | null = null;
      let lastError: { message: string } | null = null;
      for (let attempt = 0; attempt <= PAGE_RETRIES; attempt++) {
        const response = await q.range(from, from + PAGE_SIZE - 1);
        data = response.data;
        lastError = response.error;
        if (!lastError) break;
        if (attempt < PAGE_RETRIES) await wait(400 * 2 ** attempt);
      }

      if (lastError) {
        throw new Error(`fetchAllRows "${table}" at offset ${from}: ${lastError.message}`);
      }

      const page = (data || []) as T[];
      allData.push(...page);

      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return allData;
  };

  // Frequently changing or user-visible queries can opt out so a valid empty
  // response never survives a hard refresh in sessionStorage.
  return query?.cache === false ? fetchRows() : cachedQuery<T[]>(cacheKey, fetchRows);
}
