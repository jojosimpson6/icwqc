import { z } from "zod";

/**
 * Validation schemas for admin-authored content. These mirror the CHECK
 * constraints enforced in the database so the UI can surface a friendly error
 * before the request is sent, while the database remains the source of truth.
 */
export const newsItemSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
  body: z.string().trim().min(1, "Body is required").max(20000, "Body must be 20,000 characters or fewer"),
  published_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be a valid YYYY-MM-DD date")
    .refine((d) => !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()), "Date must be a valid calendar date"),
  author: z
    .string()
    .trim()
    .max(100, "Author must be 100 characters or fewer")
    .optional()
    .transform((v) => (v ? v : null)),
  pinned: z.boolean(),
});

export const siteContentSchema = z.object({
  title: z
    .string()
    .trim()
    .max(200, "Title must be 200 characters or fewer")
    .optional()
    .transform((v) => (v ? v : null)),
  content: z.string().max(200000, "Content must be 200,000 characters or fewer"),
});

export type NewsItemInput = z.infer<typeof newsItemSchema>;
export type SiteContentInput = z.infer<typeof siteContentSchema>;

/** Returns the first validation message, or null when the value is valid. */
export function firstError(result: z.SafeParseReturnType<unknown, unknown>): string | null {
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Invalid input";
}
