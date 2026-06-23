/**
 * Reviews tool: get_reviews.
 *
 * 2GIS has NO documented self-service API for review TEXTS. This tool therefore:
 *   1. ALWAYS returns the documented review statistics (rating + review_count)
 *      via the Places API (items/byid?fields=items.reviews) — reliable.
 *   2. ADDITIONALLY attempts review texts via an undocumented internal endpoint
 *      (best-effort) — may be unavailable for ordinary keys, in which case the
 *      stats are still returned with an explanatory note.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getReviews, getItem } from "../client.js";
import { success } from "../lib/formatters.js";
import { FIELDS } from "../lib/fields.js";
import type { ReviewsResponse, SearchResponse } from "../types.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerReviewsTools(server: McpServer): void {
  server.registerTool(
    "get_reviews",
    {
      title: "Get reviews",
      description:
        "Get reviews for a 2GIS place/branch. Always returns the official rating + review count (Places API). Review TEXTS come from an undocumented internal endpoint (best-effort) and may be unavailable for your API key.",
      inputSchema: {
        place_id: z.string().min(1).describe("2GIS place/branch ID (from search_places)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Max review texts to return (best-effort)"),
      },
      annotations: READ_ONLY,
    },
    async (params) => {
      // 1) Documented, reliable: rating + review_count.
      const statsResult = await getItem(params.place_id, FIELDS.REVIEWS_STATS);
      const stats: { rating?: number; review_count?: number } = {};
      if (!statsResult.error) {
        const item = (statsResult.data as SearchResponse)?.result?.items?.[0];
        stats.rating = item?.reviews?.general_rating;
        stats.review_count = item?.reviews?.general_review_count;
      }

      // 2) Best-effort, undocumented: review texts.
      const textResult = await getReviews(params.place_id, params.limit);
      if (textResult.error) {
        return success({
          place_id: params.place_id,
          ...stats,
          reviews: [],
          note: `Review texts unavailable (undocumented endpoint): ${textResult.error}`,
        });
      }

      const resp = textResult.data as ReviewsResponse;
      const reviews =
        resp?.result?.items?.map((r) => ({
          id: r.id,
          rating: r.rating,
          text: r.text,
          date: r.date_created,
          author: r.user?.name,
        })) ?? [];

      return success({
        place_id: params.place_id,
        ...stats,
        total: resp?.result?.total,
        reviews,
        ...(reviews.length
          ? {}
          : { note: "No review texts returned (texts are best-effort via an undocumented endpoint)." }),
      });
    },
  );
}
