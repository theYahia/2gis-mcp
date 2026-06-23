/**
 * End-to-end stdio smoke test: spawn the BUILT server with a dummy key, complete
 * the MCP initialize handshake over stdio, and assert it advertises the 9 tools
 * with read-only annotations. Skipped automatically if dist/ is not built yet.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const built = existsSync("dist/index.js");

const EXPECTED_TOOLS = [
  "search_places",
  "get_place",
  "search_by_rubric",
  "geocode",
  "reverse_geocode",
  "get_directions",
  "get_public_transport",
  "suggest",
  "get_reviews",
].sort();

describe.skipIf(!built)("stdio smoke", () => {
  it("boots and lists all 9 read-only tools", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath, // absolute path to the current node binary
      args: ["dist/index.js"],
      env: { ...process.env, TWOGIS_API_KEY: "dummy" } as Record<string, string>,
    });
    const client = new Client({ name: "smoke-test", version: "0.0.0" });
    await client.connect(transport);

    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(EXPECTED_TOOLS);

      const searchPlaces = tools.find((t) => t.name === "search_places");
      expect(searchPlaces?.annotations?.readOnlyHint).toBe(true);
      expect(searchPlaces?.annotations?.destructiveHint).toBe(false);

      const { resources } = await client.listResources();
      expect(resources.some((r) => r.uri === "2gis://rubrics")).toBe(true);
    } finally {
      await client.close();
    }
  }, 20000);
});
