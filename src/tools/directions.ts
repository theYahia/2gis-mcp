/**
 * Directions & autocomplete tools: get_directions, suggest.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDirections, getPublicTransport, suggest } from "../client.js";
import { success, error } from "../lib/formatters.js";
import type { DirectionsResponse, PublicTransportResponse, SuggestResponse } from "../types.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const MAX_MANEUVERS = 50;

export function registerDirectionsTools(server: McpServer): void {
  server.registerTool(
    "get_directions",
    {
      title: "Get directions",
      description:
        "Calculate a route between two points using 2GIS routing. Returns total distance/duration and turn-by-turn maneuvers.",
      inputSchema: {
        origin_lat: z.number().min(-90).max(90).describe("Start latitude"),
        origin_lon: z.number().min(-180).max(180).describe("Start longitude"),
        dest_lat: z.number().min(-90).max(90).describe("Destination latitude"),
        dest_lon: z.number().min(-180).max(180).describe("Destination longitude"),
        mode: z
          .enum(["driving", "walking", "bicycle", "taxi", "scooter"])
          .default("driving")
          .describe("Travel mode"),
      },
      annotations: READ_ONLY,
    },
    async (params) => {
      if (params.origin_lat === params.dest_lat && params.origin_lon === params.dest_lon) {
        return error("Origin and destination are identical — provide two distinct points.");
      }

      const result = await getDirections(
        { lat: params.origin_lat, lon: params.origin_lon },
        { lat: params.dest_lat, lon: params.dest_lon },
        params.mode,
      );
      if (result.error) return error(result.error);

      const resp = result.data as DirectionsResponse;
      if (!resp?.result?.length) {
        return success({ status: "no_route", message: "No route found." });
      }

      return success({
        mode: params.mode,
        routes: resp.result.map((r) => ({
          id: r.id ?? r.route_id,
          total_duration_sec: r.total_duration,
          total_distance_m: r.total_distance,
          ui_total_duration: r.ui_total_duration,
          ui_total_distance: r.ui_total_distance,
          maneuvers_count: r.maneuvers?.length,
          maneuvers: r.maneuvers?.slice(0, MAX_MANEUVERS).map((m) => ({
            comment: m.comment,
            distance_m: m.outcoming_path?.distance,
            duration_sec: m.outcoming_path?.duration,
            streets: m.outcoming_path?.names,
          })),
        })),
      });
    },
  );

  server.registerTool(
    "get_public_transport",
    {
      title: "Public transport route",
      description:
        "Calculate a public-transport route between two points using 2GIS (metro / bus / tram / trolleybus). Returns route options with total duration, transfer count and per-segment movements (walkway = on foot, passage = transit). Requires a 2GIS subscription that includes the Public Transport API.",
      inputSchema: {
        origin_lat: z.number().min(-90).max(90).describe("Start latitude"),
        origin_lon: z.number().min(-180).max(180).describe("Start longitude"),
        dest_lat: z.number().min(-90).max(90).describe("Destination latitude"),
        dest_lon: z.number().min(-180).max(180).describe("Destination longitude"),
        transport: z
          .array(z.enum(["bus", "tram", "trolleybus", "metro"]))
          .nonempty()
          .optional()
          .describe("Public transport types to consider (default: bus, tram, trolleybus, metro)"),
      },
      annotations: READ_ONLY,
    },
    async (params) => {
      if (params.origin_lat === params.dest_lat && params.origin_lon === params.dest_lon) {
        return error("Origin and destination are identical — provide two distinct points.");
      }

      const result = await getPublicTransport(
        { lat: params.origin_lat, lon: params.origin_lon },
        { lat: params.dest_lat, lon: params.dest_lon },
        params.transport,
      );
      if (result.error) return error(result.error);

      const routes = result.data as PublicTransportResponse;
      if (!Array.isArray(routes) || !routes.length) {
        return success({ status: "no_route", message: "No public transport route found." });
      }

      return success({
        routes: routes.slice(0, 5).map((r) => ({
          total_duration_sec: r.total_duration,
          total_distance_m: r.total_distance,
          walkway_distance_m:
            typeof r.total_walkway_distance === "number" ? r.total_walkway_distance : undefined,
          transfer_count: r.transfer_count,
          transport: r.transport,
          segments: r.movements?.slice(0, MAX_MANEUVERS).map((m) => ({
            type: m.type,
            distance_m: m.distance,
            duration_sec: m.moving_duration,
            routes: m.routes?.flatMap((rt) => rt.names ?? []),
          })),
        })),
      });
    },
  );

  server.registerTool(
    "suggest",
    {
      title: "Suggest (autocomplete)",
      description: "Address/place autocomplete using the 2GIS suggest API.",
      inputSchema: {
        query: z.string().min(1).max(200).describe("Partial text to autocomplete"),
        lat: z.number().min(-90).max(90).optional().describe("User location latitude for ranking"),
        lon: z.number().min(-180).max(180).optional().describe("User location longitude for ranking"),
      },
      annotations: READ_ONLY,
    },
    async (params) => {
      const location =
        params.lat != null && params.lon != null ? { lat: params.lat, lon: params.lon } : undefined;

      const result = await suggest(params.query, location);
      if (result.error) return error(result.error);

      const resp = result.data as SuggestResponse;
      if (!resp?.result?.items?.length) {
        return success({ status: "no_suggestions", message: `No suggestions for "${params.query}".` });
      }

      return success({
        suggestions: resp.result.items.map((item) => ({
          id: item.id,
          name: item.name,
          address: item.address_name || item.full_name,
          type: item.type,
          subtype: item.subtype,
          point: item.point,
        })),
      });
    },
  );
}
