#!/usr/bin/env node

/**
 * @theyahia/2gis-mcp — MCP server for 2GIS API
 *
 * 9 read-only tools: search_places, get_place, search_by_rubric, geocode,
 * reverse_geocode, get_directions, get_public_transport, suggest, get_reviews.
 *
 * Security:
 *   - stdout reserved for JSON-RPC — all logs go to stderr
 *   - API key never logged or in error responses
 *   - Input validation via Zod on every tool call
 *   - Hard timeout + bounded retries on all API requests
 */

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerSearchTools } from "./tools/search.js";
import { registerGeocodingTools } from "./tools/geocoding.js";
import { registerDirectionsTools } from "./tools/directions.js";
import { registerReviewsTools } from "./tools/reviews.js";
import { registerResources } from "./resources.js";

// Single source of truth for the version (resolved at runtime from package.json).
const requireFromHere = createRequire(import.meta.url);
const { version } = requireFromHere("../package.json") as { version: string };

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

if (!process.env.TWOGIS_API_KEY) {
  console.error(
    "[2gis-mcp] FATAL: TWOGIS_API_KEY is not set.\n" +
      "  Get your key at https://dev.2gis.com/\n" +
      "  Then add it to your MCP client env configuration.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: "2gis-mcp", version },
  {
    instructions:
      "Tools for 2GIS places, geocoding, directions and reviews across Russia/CIS. " +
      "All tools are read-only. Coordinates use 'lon,lat' order (LONGITUDE FIRST — not lat,lon). " +
      "Responses are mostly in Russian. To use search_by_rubric, first obtain a rubric_id from the " +
      "'rubrics' field of search_places results (or read the 2gis://rubrics resource).",
    capabilities: { resources: {} },
  },
);

// Search (3): search_places, get_place, search_by_rubric
registerSearchTools(server);

// Geocoding (2): geocode, reverse_geocode
registerGeocodingTools(server);

// Directions & Suggest (3): get_directions, get_public_transport, suggest
registerDirectionsTools(server);

// Reviews (1): get_reviews
registerReviewsTools(server);

// Resources: 2gis://rubrics
registerResources(server);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);

console.error(`[2gis-mcp] Server v${version} started — 9 tools ready.`);
