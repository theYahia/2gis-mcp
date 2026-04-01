#!/usr/bin/env node

/**
 * @theyahia/2gis-mcp — MCP server for 2GIS API
 *
 * 8 tools: search_places, get_place, geocode, reverse_geocode,
 * get_directions, suggest, search_by_rubric, get_reviews.
 *
 * Security:
 *   - stdout reserved for JSON-RPC — all logs go to stderr
 *   - API key never logged or in error responses
 *   - Input validation via Zod on every tool call
 *   - Hard timeout (10s) on all API requests
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerSearchTools } from "./tools/search.js";
import { registerGeocodingTools } from "./tools/geocoding.js";
import { registerDirectionsTools } from "./tools/directions.js";
import { registerReviewsTools } from "./tools/reviews.js";

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

const apiKey = process.env.TWOGIS_API_KEY;

if (!apiKey) {
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

const server = new McpServer({
  name: "2gis-mcp",
  version: "1.0.0",
});

// Search (3)
registerSearchTools(server);       // search_places, get_place, search_by_rubric

// Geocoding (2)
registerGeocodingTools(server);    // geocode, reverse_geocode

// Directions & Suggest (2)
registerDirectionsTools(server);   // get_directions, suggest

// Reviews (1)
registerReviewsTools(server);      // get_reviews

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("[2gis-mcp] Server started — 8 tools ready.");
