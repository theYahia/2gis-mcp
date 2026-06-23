/**
 * Tests for the 2GIS MCP tool handlers — the response→output transforms.
 *
 * Tools are registered against a fake server that captures each handler, then
 * invoked directly with already-parsed params (Zod parsing is the SDK's job).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchTools } from "../src/tools/search.js";
import { registerGeocodingTools } from "../src/tools/geocoding.js";
import { registerDirectionsTools } from "../src/tools/directions.js";
import { registerReviewsTools } from "../src/tools/reviews.js";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  process.env.TWOGIS_API_KEY = "test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TWOGIS_API_KEY;
});

type Handler = (
  params: Record<string, unknown>,
) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function buildHandlers(): Record<string, Handler> {
  const handlers: Record<string, Handler> = {};
  const fake = {
    registerTool: (name: string, _config: unknown, cb: Handler) => {
      handlers[name] = cb;
    },
  } as unknown as McpServer;
  registerSearchTools(fake);
  registerGeocodingTools(fake);
  registerDirectionsTools(fake);
  registerReviewsTools(fake);
  return handlers;
}

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ meta: { code: 200 }, ...(body as object) }),
  };
}
function status(code: number, body: unknown = {}) {
  return {
    ok: code >= 200 && code < 300,
    status: code,
    text: async () => JSON.stringify({ meta: { code }, ...(body as object) }),
  };
}
function out(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

describe("registration", () => {
  it("registers all 9 tools", () => {
    const handlers = buildHandlers();
    expect(Object.keys(handlers).sort()).toEqual(
      [
        "geocode",
        "get_directions",
        "get_place",
        "get_public_transport",
        "get_reviews",
        "reverse_geocode",
        "search_by_rubric",
        "search_places",
        "suggest",
      ].sort(),
    );
  });
});

describe("search_places", () => {
  it("maps phones, rating and rubric {id,name}", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        result: {
          total: 1,
          items: [
            {
              id: "1",
              name: "Кофе",
              type: "branch",
              address_name: "ул. Ленина, 1",
              point: { lat: 55, lon: 82 },
              rubrics: [{ id: "r1", name: "Кофейня" }],
              contact_groups: [
                {
                  contacts: [
                    { type: "phone", value: "+7-111" },
                    { type: "website", value: "site.ru" },
                  ],
                },
              ],
              reviews: { general_rating: 4.5, general_review_count: 10 },
            },
          ],
        },
      }),
    );
    const handlers = buildHandlers();
    const res = out(await handlers.search_places({ query: "кофе", radius: 5000, page: 1, page_size: 10 }));
    expect(res.total).toBe(1);
    expect(res.items[0].phones).toEqual(["+7-111"]);
    expect(res.items[0].rating).toBe(4.5);
    expect(res.items[0].rubrics).toEqual([{ id: "r1", name: "Кофейня" }]);
  });

  it("returns no_results on empty items", async () => {
    mockFetch.mockResolvedValueOnce(ok({ result: { total: 0, items: [] } }));
    const handlers = buildHandlers();
    const res = out(await handlers.search_places({ query: "zzz", radius: 5000, page: 1, page_size: 10 }));
    expect(res.status).toBe("no_results");
  });

  it("propagates client errors as isError", async () => {
    mockFetch.mockResolvedValueOnce(status(401, { meta: { code: 401 } }));
    const handlers = buildHandlers();
    const res = await handlers.search_places({ query: "x", radius: 5000, page: 1, page_size: 10 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Authentication failed");
  });
});

describe("get_place", () => {
  it("maps phones, websites and photos", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        result: {
          items: [
            {
              id: "9",
              name: "Аптека",
              type: "branch",
              address_name: "пр. Мира, 5",
              contact_groups: [
                {
                  contacts: [
                    { type: "phone", value: "+7-222" },
                    { type: "website", value: "apteka.ru" },
                  ],
                },
              ],
              external_content: [{ type: "photo", count: 3, main_photo_url: "http://img" }],
              reviews: { general_rating: 4.1 },
            },
          ],
        },
      }),
    );
    const handlers = buildHandlers();
    const res = out(await handlers.get_place({ place_id: "9", fields: "x" }));
    expect(res.phones).toEqual(["+7-222"]);
    expect(res.websites).toEqual(["apteka.ru"]);
    expect(res.photos).toEqual([{ count: 3, main_url: "http://img" }]);
  });

  it("returns not_found when no item", async () => {
    mockFetch.mockResolvedValueOnce(ok({ result: { items: [] } }));
    const handlers = buildHandlers();
    const res = out(await handlers.get_place({ place_id: "404", fields: "x" }));
    expect(res.status).toBe("not_found");
  });
});

describe("geocode / reverse_geocode", () => {
  it("geocode maps coordinates and adm_div", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        result: {
          total: 1,
          items: [
            {
              id: "g1",
              name: "Москва",
              full_name: "Россия, Москва",
              type: "adm_div.city",
              point: { lat: 55.75, lon: 37.61 },
              address: { components: [{ type: "street", name: "Тверская" }], postcode: "101000" },
              adm_div: [{ name: "Москва", type: "city" }],
            },
          ],
        },
      }),
    );
    const handlers = buildHandlers();
    const res = out(await handlers.geocode({ address: "Москва" }));
    expect(res.results[0].coordinates).toEqual({ lat: 55.75, lon: 37.61 });
    expect(res.results[0].adm_div).toEqual([{ name: "Москва", type: "city" }]);
    expect(res.results[0].postcode).toBe("101000");
  });

  it("reverse_geocode echoes coordinates and maps adm_div", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        result: {
          items: [
            { id: "r", name: "дом", type: "building", adm_div: [{ name: "Новосибирск", type: "city" }] },
          ],
        },
      }),
    );
    const handlers = buildHandlers();
    const res = out(await handlers.reverse_geocode({ lat: 55.03, lon: 82.92 }));
    expect(res.coordinates).toEqual({ lat: 55.03, lon: 82.92 });
    expect(res.results[0].adm_div).toEqual([{ name: "Новосибирск", type: "city" }]);
  });
});

describe("get_directions", () => {
  it("maps maneuvers (not legs) and route totals", async () => {
    // routing 7.0.0 returns route options under `result`, each with maneuvers[].
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          result: [
            {
              id: "route1",
              total_duration: 600,
              total_distance: 5000,
              ui_total_duration: "10 мин",
              maneuvers: [
                {
                  comment: "Поверните направо",
                  outcoming_path: { distance: 100, duration: 30, names: ["ул. Ленина"] },
                },
              ],
            },
          ],
        }),
    });
    const handlers = buildHandlers();
    const res = out(
      await handlers.get_directions({
        origin_lat: 55,
        origin_lon: 37,
        dest_lat: 56,
        dest_lon: 38,
        mode: "driving",
      }),
    );
    expect(res.routes[0].total_distance_m).toBe(5000);
    expect(res.routes[0].maneuvers_count).toBe(1);
    expect(res.routes[0].maneuvers[0].streets).toEqual(["ул. Ленина"]);
    expect(res.routes[0]).not.toHaveProperty("legs");
  });

  it("rejects identical origin and destination without calling the API", async () => {
    const handlers = buildHandlers();
    const res = await handlers.get_directions({
      origin_lat: 55,
      origin_lon: 37,
      dest_lat: 55,
      dest_lon: 37,
      mode: "driving",
    });
    expect(res.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("get_public_transport", () => {
  it("maps movements (walkway/passage) and transfers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            total_duration: 1200,
            total_distance: 8000,
            transfer_count: 1,
            transport: ["bus"],
            movements: [
              { type: "walkway", distance: 100, moving_duration: 60 },
              { type: "passage", distance: 7900, moving_duration: 1100, routes: [{ names: ["12"] }] },
            ],
          },
        ]),
    });
    const handlers = buildHandlers();
    const res = out(
      await handlers.get_public_transport({ origin_lat: 55, origin_lon: 37, dest_lat: 56, dest_lon: 38 }),
    );
    expect(res.routes[0].transfer_count).toBe(1);
    expect(res.routes[0].segments).toHaveLength(2);
    expect(res.routes[0].segments[1].routes).toEqual(["12"]);
  });
});

describe("suggest", () => {
  it("maps name/address_name (not title/subtitle)", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        result: {
          items: [
            {
              id: "1",
              name: "МСК",
              address_name: "Никольская, 25",
              type: "branch",
              point: { lat: 55, lon: 37 },
            },
          ],
        },
      }),
    );
    const handlers = buildHandlers();
    const res = out(await handlers.suggest({ query: "мск" }));
    expect(res.suggestions[0].name).toBe("МСК");
    expect(res.suggestions[0].address).toBe("Никольская, 25");
    expect(res.suggestions[0]).not.toHaveProperty("title");
  });
});

describe("get_reviews", () => {
  it("returns stats + best-effort texts", async () => {
    // 1st fetch = getItem stats; 2nd = getReviews texts
    mockFetch.mockResolvedValueOnce(
      ok({ result: { items: [{ id: "1", reviews: { general_rating: 4.2, general_review_count: 33 } }] } }),
    );
    mockFetch.mockResolvedValueOnce(
      ok({
        result: {
          total: 1,
          items: [
            { id: "rev1", text: "отлично", rating: 5, date_created: "2024-01-01", user: { name: "Аня" } },
          ],
        },
      }),
    );
    const handlers = buildHandlers();
    const res = out(await handlers.get_reviews({ place_id: "1", limit: 10 }));
    expect(res.rating).toBe(4.2);
    expect(res.review_count).toBe(33);
    expect(res.reviews[0].text).toBe("отлично");
    expect(res.reviews[0].author).toBe("Аня");
  });

  it("falls back to stats with a note when texts are unavailable (403)", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ result: { items: [{ id: "1", reviews: { general_rating: 3.9, general_review_count: 7 } }] } }),
    );
    mockFetch.mockResolvedValueOnce(status(403, { meta: { code: 403 } }));
    const handlers = buildHandlers();
    const res = out(await handlers.get_reviews({ place_id: "1", limit: 10 }));
    expect(res.rating).toBe(3.9);
    expect(res.reviews).toEqual([]);
    expect(res.note).toContain("unavailable");
  });
});

describe("formatters", () => {
  it("success returns JSON content", async () => {
    const { success } = await import("../src/lib/formatters.js");
    const result = success({ items: [1, 2, 3] });
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual({ items: [1, 2, 3] });
  });

  it("error returns isError flag", async () => {
    const { error } = await import("../src/lib/formatters.js");
    const result = error("something went wrong");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("something went wrong");
  });
});
