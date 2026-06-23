/**
 * Geocoding tools: geocode, reverse_geocode.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { geocodeAddress, reverseGeocode } from "../client.js";
import { success, error } from "../lib/formatters.js";
import type { GeocodeResponse } from "../types.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

function mapAdmDiv(adm?: Array<{ name?: string; type?: string }>) {
  return adm?.map((a) => ({ name: a.name, type: a.type }));
}

export function registerGeocodingTools(server: McpServer): void {
  server.registerTool(
    "geocode",
    {
      title: "Geocode address",
      description: "Convert a text address to geographic coordinates using the 2GIS geocoder.",
      inputSchema: {
        address: z.string().min(1).max(300).describe("Address to geocode (e.g. 'Москва, ул. Ленина, 1')"),
      },
      annotations: READ_ONLY,
    },
    async (params) => {
      const result = await geocodeAddress(params.address);
      if (result.error) return error(result.error);

      const resp = result.data as GeocodeResponse;
      if (!resp?.result?.items?.length) {
        return success({ status: "no_results", message: `No results for "${params.address}".` });
      }

      return success({
        total: resp.result.total,
        results: resp.result.items.map((item) => ({
          id: item.id,
          name: item.name,
          full_name: item.full_name,
          type: item.type,
          coordinates: item.point,
          address_components: item.address?.components,
          adm_div: mapAdmDiv(item.adm_div),
          postcode: item.address?.postcode,
        })),
      });
    },
  );

  server.registerTool(
    "reverse_geocode",
    {
      title: "Reverse geocode",
      description: "Convert coordinates to an address using the 2GIS reverse geocoder.",
      inputSchema: {
        lat: z.number().min(-90).max(90).describe("Latitude"),
        lon: z.number().min(-180).max(180).describe("Longitude"),
        radius: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("Optional search radius in meters to snap to the nearest object"),
      },
      annotations: READ_ONLY,
    },
    async (params) => {
      const result = await reverseGeocode(params.lat, params.lon, { radius: params.radius });
      if (result.error) return error(result.error);

      const resp = result.data as GeocodeResponse;
      if (!resp?.result?.items?.length) {
        return success({
          status: "no_results",
          message: `No address found at ${params.lat}, ${params.lon}.`,
        });
      }

      return success({
        coordinates: { lat: params.lat, lon: params.lon },
        results: resp.result.items.map((item) => ({
          id: item.id,
          name: item.name,
          full_name: item.full_name,
          type: item.type,
          address_components: item.address?.components,
          adm_div: mapAdmDiv(item.adm_div),
        })),
      });
    },
  );
}
