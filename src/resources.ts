/**
 * MCP resources. Exposes a static reference explaining how to obtain 2GIS rubric
 * (category) IDs for search_by_rubric — without baking in a fabricated ID list
 * (rubric IDs are region/taxonomy-specific and best discovered dynamically).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const RUBRICS_INFO = {
  description:
    "2GIS uses rubric (category) IDs for the search_by_rubric tool. There is no fixed list bundled here — rubric IDs are region/taxonomy-specific and may change.",
  how_to_get_a_rubric_id: [
    "Call search_places with a category query (e.g. 'аптека', 'кофейня'). Each result's 'rubrics' field contains { id, name } — use that id with search_by_rubric.",
    "Or consult the 2GIS Categories API: https://docs.2gis.com/en/api/search/categories/overview",
  ],
  example: {
    step_1: "search_places(query='аптека', point='82.92,55.03')",
    step_2: "take items[].rubrics[].id from the response",
    step_3: "search_by_rubric(rubric_id=<that id>, point='82.92,55.03')",
  },
};

export function registerResources(server: McpServer): void {
  server.registerResource(
    "rubrics",
    "2gis://rubrics",
    {
      title: "2GIS rubric IDs",
      description: "How to obtain 2GIS rubric (category) IDs for search_by_rubric",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(RUBRICS_INFO, null, 2),
        },
      ],
    }),
  );
}
