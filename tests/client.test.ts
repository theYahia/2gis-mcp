/**
 * Tests for the 2GIS HTTP client: URL/body construction, error mapping,
 * meta.code handling, retries/backoff, timeout and malformed-JSON paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  searchItems,
  getItem,
  geocodeAddress,
  reverseGeocode,
  getDirections,
  getPublicTransport,
  suggest,
  searchByRubric,
  getReviews,
} from "../src/client.js";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  process.env.TWOGIS_API_KEY = "test-2gis-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.TWOGIS_API_KEY;
});

/** Response double that implements text() (the client reads text(), then parses). */
function mockResponse(status: number, body: unknown = { meta: { code: status } }) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  };
}

const OK = (extra: Record<string, unknown> = { result: { items: [] } }) =>
  mockResponse(200, { meta: { code: 200 }, ...extra });

describe("URL & key construction", () => {
  it("hits the catalog host with the API key", async () => {
    mockFetch.mockResolvedValueOnce(OK());
    await searchItems({ q: "кофейня" });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("catalog.api.2gis.com/3.0/items");
    expect(url).toContain("key=test-2gis-key");
  });

  it("geocode targets the geocode endpoint and requests adm_div", async () => {
    mockFetch.mockResolvedValueOnce(OK());
    await geocodeAddress("Москва");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/items/geocode");
    expect(decodeURIComponent(url)).toContain("items.adm_div");
  });

  it("reverse geocode sends lat/lon", async () => {
    mockFetch.mockResolvedValueOnce(OK());
    await reverseGeocode(55.75, 37.61);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("lat=55.75");
    expect(url).toContain("lon=37.61");
  });

  it("suggest uses 'location' (not 'point') and requests fields", async () => {
    mockFetch.mockResolvedValueOnce(OK());
    await suggest("Москва", { lat: 55.75, lon: 37.61 });
    const url = decodeURIComponent(mockFetch.mock.calls[0][0]);
    expect(url).toContain("/3.0/suggests");
    expect(url).toContain("location=37.61,55.75"); // lon,lat order
    expect(url).not.toContain("point=");
    expect(url).toContain("fields=items.point");
  });

  it("search_by_rubric adds sort=distance + location and a page", async () => {
    mockFetch.mockResolvedValueOnce(OK());
    await searchByRubric("123", "82.92,55.03", 1500, 2);
    const url = decodeURIComponent(mockFetch.mock.calls[0][0]);
    expect(url).toContain("rubric_id=123");
    expect(url).toContain("sort=distance");
    expect(url).toContain("location=82.92,55.03");
    expect(url).toContain("page=2");
  });

  it("getItem includes fields when provided", async () => {
    mockFetch.mockResolvedValueOnce(OK());
    await getItem("999", "items.reviews");
    const url = decodeURIComponent(mockFetch.mock.calls[0][0]);
    expect(url).toContain("/items/byid");
    expect(url).toContain("id=999");
    expect(url).toContain("fields=items.reviews");
  });
});

describe("routing POST bodies", () => {
  it("getDirections maps walking → transport:walking and point type:walking", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { result: [] }));
    await getDirections({ lat: 55, lon: 37 }, { lat: 56, lon: 38 }, "walking");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("routing.api.2gis.com/routing/7.0.0/global");
    const body = JSON.parse(init.body);
    expect(body.transport).toBe("walking");
    expect(body.points[0].type).toBe("walking");
    expect(body.points[0].lon).toBe(37);
    expect(body.points[1].lat).toBe(56);
  });

  it("getDirections maps the 'pedestrian' alias to walking", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { result: [] }));
    await getDirections({ lat: 55, lon: 37 }, { lat: 56, lon: 38 }, "pedestrian");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.transport).toBe("walking");
  });

  it("getDirections uses type:stop for driving", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { result: [] }));
    await getDirections({ lat: 55, lon: 37 }, { lat: 56, lon: 38 }, "driving");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.transport).toBe("driving");
    expect(body.points[0].type).toBe("stop");
  });

  it("getPublicTransport posts source/target/transport to the PT endpoint", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, []));
    await getPublicTransport({ lat: 55, lon: 37 }, { lat: 56, lon: 38 });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("routing.api.2gis.com/public_transport/2.0");
    const body = JSON.parse(init.body);
    expect(body.source.point).toEqual({ lat: 55, lon: 37 });
    expect(body.target.point).toEqual({ lat: 56, lon: 38 });
    expect(body.transport).toEqual(["bus", "tram", "trolleybus", "metro"]);
  });
});

describe("success & data passthrough", () => {
  it("returns parsed data on 200", async () => {
    const body = { meta: { code: 200 }, result: { total: 1, items: [{ id: "1", name: "x" }] } };
    mockFetch.mockResolvedValueOnce(mockResponse(200, body));
    const result = await searchItems({ q: "x" });
    expect(result.error).toBeNull();
    expect(result.data).toEqual(body);
  });

  it("treats meta.code 404 inside HTTP 200 as an empty (non-error) result", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { meta: { code: 404 }, result: { total: 0, items: [] } }),
    );
    const result = await searchItems({ q: "nope" });
    expect(result.error).toBeNull();
  });
});

describe("error handling", () => {
  it("returns 'Authentication failed' on 401 without leaking the key", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(401, { meta: { code: 401, error: { message: "wrong key" } } }),
    );
    const result = await searchItems({ q: "x" });
    expect(result.error).toContain("Authentication failed");
    expect(result.error).toContain("wrong key"); // 2GIS detail surfaced
    expect(result.error).not.toContain("test-2gis-key"); // key never leaked
  });

  it("surfaces a logical meta.code 403 carried inside HTTP 200", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { meta: { code: 403, error: { message: "no access to service" } } }),
    );
    const result = await searchItems({ q: "x" });
    expect(result.error).toContain("Access forbidden");
    expect(result.error).toContain("no access to service");
  });

  it("returns a malformed-JSON error (not retried) on a non-JSON 200 body", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, "<html>gateway</html>"));
    const result = await searchItems({ q: "x" });
    expect(result.error).toContain("Malformed JSON");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("short-circuits when the API key is missing", async () => {
    delete process.env.TWOGIS_API_KEY;
    const result = await searchItems({ q: "x" });
    expect(result.error).toContain("TWOGIS_API_KEY is not set");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("retries, backoff & timeout", () => {
  it("retries a transient 500 and then succeeds", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValueOnce(mockResponse(500)).mockResolvedValueOnce(OK());
    const p = searchItems({ q: "x" });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after MAX_RETRIES on a persistent 429", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(mockResponse(429));
    const p = searchItems({ q: "x" });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.error).toContain("Rate limit exceeded");
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("retries on a network error then returns it", async () => {
    vi.useFakeTimers();
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));
    const p = searchItems({ q: "x" });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.error).toContain("Network error");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("classifies AbortError as a timeout and retries it", async () => {
    vi.useFakeTimers();
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    mockFetch.mockRejectedValue(abort);
    const p = searchItems({ q: "x" });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.error).toContain("timed out");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 400 (non-transient)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(400, { meta: { code: 400 } }));
    const result = await searchItems({ q: "x" });
    expect(result.error).toContain("Bad request");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("reviews endpoint", () => {
  it("calls the branches/{id}/reviews path", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { result: { items: [], total: 0 } }));
    await getReviews("12345", 5);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("public-api.reviews.2gis.com");
    expect(url).toContain("/branches/12345/reviews");
  });
});
