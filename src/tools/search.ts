/**
 * Search tools: search_places, get_place, search_by_rubric.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchItems, getItem, searchByRubric } from "../client.js";
import { success, error } from "../lib/formatters.js";
import { formatPlaceSummary, formatPlaceDetail } from "../lib/extract.js";
import { FIELDS } from "../lib/fields.js";
import { parsePoint } from "../lib/coords.js";
import type { SearchResponse } from "../types.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const pointSchema = z.string().refine((v) => parsePoint(v) !== null, {
  message:
    "point must be 'lon,lat' with lon in [-180,180] and lat in [-90,90] (longitude FIRST — not lat,lon)",
});

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    "search_places",
    {
      title: "Search places",
      description:
        "Search for places, businesses and points of interest in 2GIS (Russia/CIS). Returns items with ids you can pass to get_place / get_reviews, and rubric ids you can pass to search_by_rubric.",
      inputSchema: {
        query: z.string().min(1).max(200).describe("Search query (e.g. 'кофейня', 'аптека рядом')"),
        point: pointSchema
          .optional()
          .describe("Center point as 'lon,lat' (longitude first) for spatial search"),
        radius: z
          .number()
          .int()
          .min(100)
          .max(40000)
          .default(5000)
          .describe("Search radius in meters (max 40000 with a query)"),
        type: z
          .enum(["branch", "building", "street", "parking", "station", "attraction", "adm_div"])
          .optional()
          .describe("Filter by item type ('branch' = company/POI)"),
        page: z.number().int().min(1).max(1000).default(1).describe("Page number (1-based)"),
        page_size: z.number().int().min(1).max(50).default(10).describe("Results per page (max 50)"),
        fields: z.string().optional().describe("Override returned fields (advanced)"),
      },
      annotations: READ_ONLY,
    },
    async (params) => {
      const searchParams: Record<string, string> = {
        q: params.query,
        page: String(params.page),
        page_size: String(params.page_size),
        fields: params.fields || FIELDS.SEARCH,
      };
      if (params.point) {
        searchParams.point = params.point;
        searchParams.radius = String(params.radius);
      }
      if (params.type) searchParams.type = params.type;

      const result = await searchItems(searchParams);
      if (result.error) return error(result.error);

      const resp = result.data as SearchResponse;
      if (!resp?.result?.items?.length) {
        return success({ status: "no_results", message: `No places found for "${params.query}".` });
      }

      return success({
        total: resp.result.total,
        page: params.page,
        page_size: params.page_size,
        items: resp.result.items.map(formatPlaceSummary),
      });
    },
  );

  server.registerTool(
    "get_place",
    {
      title: "Get place details",
      description:
        "Get detailed information about a specific place by its 2GIS ID. Obtain the id from search_places first.",
      inputSchema: {
        place_id: z.string().min(1).describe("2GIS place/branch ID (from search_places)"),
        fields: z.string().default(FIELDS.PLACE_DETAIL).describe("Fields to retrieve"),
      },
      annotations: READ_ONLY,
    },
    async (params) => {
      const result = await getItem(params.place_id, params.fields);
      if (result.error) return error(result.error);

      const resp = result.data as SearchResponse;
      const item = resp?.result?.items?.[0];
      if (!item) {
        return success({ status: "not_found", message: `Place ${params.place_id} not found.` });
      }

      return success(formatPlaceDetail(item));
    },
  );

  server.registerTool(
    "search_by_rubric",
    {
      title: "Search by rubric",
      description:
        "Search places by rubric (category) ID near a location. Get a rubric_id from the 'rubrics' field of search_places results, or read the 2gis://rubrics resource.",
      inputSchema: {
        rubric_id: z.string().min(1).describe("2GIS rubric (category) ID"),
        point: pointSchema.describe("Center point as 'lon,lat' (longitude first)"),
        radius: z
          .number()
          .int()
          .min(100)
          .max(2000)
          .default(1500)
          .describe("Search radius in meters (max 2000 without a text query)"),
        page: z.number().int().min(1).max(1000).default(1).describe("Page number (1-based)"),
      },
      annotations: READ_ONLY,
    },
    async (params) => {
      const result = await searchByRubric(params.rubric_id, params.point, params.radius, params.page);
      if (result.error) return error(result.error);

      const resp = result.data as SearchResponse;
      if (!resp?.result?.items?.length) {
        return success({ status: "no_results", message: `No places found for rubric ${params.rubric_id}.` });
      }

      return success({
        total: resp.result.total,
        page: params.page,
        items: resp.result.items.map(formatPlaceSummary),
      });
    },
  );
}
