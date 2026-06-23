/**
 * 2GIS HTTP client.
 *
 * Hosts:
 *   - Catalog / Places / Geocoder / Suggest: https://catalog.api.2gis.com/3.0
 *   - Routing (directions):                  https://routing.api.2gis.com
 *   - Reviews (undocumented, best-effort):   https://public-api.reviews.2gis.com
 *
 * Security & robustness:
 *   - API key read from env at call time; never placed in error messages
 *   - Hard timeout (configurable), retries with exponential backoff + jitter on
 *     transient errors (429 / 5xx / network / timeout)
 *   - Logical errors carried in HTTP 200 bodies (meta.code) are surfaced
 *   - Responses parsed defensively (malformed JSON is reported, not retried)
 */

import type { ApiResult } from "./types.js";
import { FIELDS } from "./lib/fields.js";
import type { LonLat } from "./lib/coords.js";

const CATALOG_BASE = "https://catalog.api.2gis.com/3.0";
const ROUTING_BASE = "https://routing.api.2gis.com/routing/7.0.0/global";
const PUBLIC_TRANSPORT_BASE = "https://routing.api.2gis.com/public_transport/2.0";
const SUGGEST_BASE = "https://catalog.api.2gis.com/3.0/suggests";
const REVIEWS_BASE = "https://public-api.reviews.2gis.com/2.0";

function envTimeout(): number {
  const raw = Number(process.env.TWOGIS_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 10_000;
}

const DEFAULT_TIMEOUT_MS = envTimeout();
const ROUTING_LOCALE = process.env.TWOGIS_LOCALE || "ru";
const SUGGEST_LOCALE = "ru_RU";
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 8_000;

export function getApiKey(): string {
  const key = process.env.TWOGIS_API_KEY;
  if (!key) {
    throw new Error(
      "TWOGIS_API_KEY is not set. " +
        "Get your key at https://dev.2gis.com/ and add it to your MCP client env config.",
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Low-level request helper (single source of retry/timeout/error logic)
// ---------------------------------------------------------------------------

type Method = "GET" | "POST";

interface RequestOptions {
  method?: Method;
  body?: unknown;
}

function mapHttpError(status: number): string {
  switch (status) {
    case 400:
      return "Bad request. Check parameters.";
    case 401:
      return "Authentication failed. Check TWOGIS_API_KEY.";
    case 403:
      return "Access forbidden. Check your API key permissions / subscription services.";
    case 404:
      return "Not found.";
    case 408:
      return "Request timeout on the 2GIS side.";
    case 429:
      return "Rate limit exceeded. Wait before retrying.";
    default:
      if (status >= 500) return `2GIS service error (HTTP ${status}). Try again later.`;
      return `Unexpected HTTP ${status} from 2GIS API.`;
  }
}

function withDetail(base: string, detail?: string): string {
  return detail ? `${base} 2GIS: ${detail}` : base;
}

function extractErrorMessage(data: unknown): string | undefined {
  const d = data as { meta?: { error?: { message?: string; type?: string } }; message?: string } | null;
  return d?.meta?.error?.message ?? d?.meta?.error?.type ?? d?.message ?? undefined;
}

/** Returns the logical (meta.code) status when it indicates an error, else null. */
function metaError(data: unknown): { code: number; message?: string } | null {
  const code = (data as { meta?: { code?: number } } | null)?.meta?.code;
  if (typeof code === "number" && code !== 200) {
    return { code, message: extractErrorMessage(data) };
  }
  return null;
}

function backoffDelay(attempt: number): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
  // Full jitter (50%–100% of base) to avoid synchronized retries.
  return base * (0.5 + Math.random() * 0.5);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isAbort(err: unknown): boolean {
  // Detect by name, not constructor identity (DOMException isn't reliable across
  // Node versions / polyfills / cross-realm globals).
  const name = (err as { name?: string } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

/**
 * Build a request to `base` (+ `?key=...&<params>`), run the retry loop and
 * return a normalized ApiResult. Resolves the API key in exactly one place.
 */
async function request(
  base: string,
  params: Record<string, string> = {},
  opts: RequestOptions = {},
): Promise<ApiResult> {
  let key: string;
  try {
    key = getApiKey();
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "TWOGIS_API_KEY is not set." };
  }

  const { method = "GET", body } = opts;
  const qs = new URLSearchParams({ key, ...params });
  const url = `${base}?${qs}`;
  const init: RequestInit =
    body !== undefined
      ? {
          method,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        }
      : { method, headers: { Accept: "application/json" } };

  let lastError = "Max retries exceeded.";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init);
      const raw = await response.text();
      let data: unknown = null;
      let parseFailed = false;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          parseFailed = true;
        }
      }

      if (response.ok) {
        if (parseFailed) {
          // Malformed body on a 2xx — not transient, do not retry.
          return { data: null, error: `Malformed JSON from 2GIS (HTTP ${response.status}).` };
        }
        // Logical error carried inside HTTP 200. 404 = "nothing found" and is
        // left for the tool to render as an empty result; other codes are errors.
        const meta = metaError(data);
        if (meta && meta.code !== 404) {
          return { data: null, error: withDetail(mapHttpError(meta.code), meta.message) };
        }
        return { data, error: null };
      }

      // Non-2xx — surface 2GIS body detail when available.
      const detail = parseFailed ? undefined : extractErrorMessage(data);
      lastError = withDetail(mapHttpError(response.status), detail);

      const isTransient = response.status === 429 || response.status >= 500;
      if (isTransient && attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      return { data: null, error: lastError };
    } catch (err: unknown) {
      lastError = isAbort(err)
        ? `Request timed out (${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s). 2GIS may be experiencing issues.`
        : `Network error: ${err instanceof Error ? err.message : "Unknown network error"}`;
      if (attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      return { data: null, error: lastError };
    }
  }

  return { data: null, error: lastError };
}

// ---------------------------------------------------------------------------
// Public API methods
// ---------------------------------------------------------------------------

export function searchItems(params: Record<string, string>): Promise<ApiResult> {
  return request(`${CATALOG_BASE}/items`, params);
}

export function getItem(id: string, fields?: string): Promise<ApiResult> {
  const params: Record<string, string> = { id };
  if (fields) params.fields = fields;
  return request(`${CATALOG_BASE}/items/byid`, params);
}

export function geocodeAddress(query: string): Promise<ApiResult> {
  return request(`${CATALOG_BASE}/items/geocode`, { q: query, fields: FIELDS.GEOCODE });
}

export function reverseGeocode(
  lat: number,
  lon: number,
  opts: { radius?: number; type?: string } = {},
): Promise<ApiResult> {
  const params: Record<string, string> = {
    lat: String(lat),
    lon: String(lon),
    fields: FIELDS.GEOCODE,
  };
  if (opts.radius != null) params.radius = String(opts.radius);
  if (opts.type) params.type = opts.type;
  return request(`${CATALOG_BASE}/items/geocode`, params);
}

/** Routing 7.0.0 transport values. `pedestrian` is accepted as a friendly alias. */
const ROUTING_TRANSPORT: Record<string, string> = {
  driving: "driving",
  walking: "walking",
  pedestrian: "walking",
  bicycle: "bicycle",
  taxi: "taxi",
  scooter: "scooter",
  emergency: "emergency",
};

export function getDirections(origin: LonLat, destination: LonLat, mode = "driving"): Promise<ApiResult> {
  const transport = ROUTING_TRANSPORT[mode] ?? "driving";
  // Walking routes use point type "walking"; others use "stop".
  const pointType = transport === "walking" ? "walking" : "stop";
  const body = {
    locale: ROUTING_LOCALE,
    transport,
    points: [
      { type: pointType, lon: origin.lon, lat: origin.lat },
      { type: pointType, lon: destination.lon, lat: destination.lat },
    ],
  };
  return request(ROUTING_BASE, {}, { method: "POST", body });
}

/**
 * Public-transport routing (separate endpoint with a `source`/`target` body and
 * an array-of-routes response). Requires a subscription that includes the Public
 * Transport API. Defaults to the common, single-word transport types.
 */
export function getPublicTransport(
  origin: LonLat,
  destination: LonLat,
  transportTypes: string[] = ["bus", "tram", "trolleybus", "metro"],
): Promise<ApiResult> {
  const body = {
    source: { point: { lat: origin.lat, lon: origin.lon } },
    target: { point: { lat: destination.lat, lon: destination.lon } },
    transport: transportTypes,
    locale: ROUTING_LOCALE,
  };
  return request(PUBLIC_TRANSPORT_BASE, {}, { method: "POST", body });
}

export function suggest(query: string, location?: LonLat): Promise<ApiResult> {
  const params: Record<string, string> = {
    q: query,
    locale: SUGGEST_LOCALE,
    fields: FIELDS.SUGGEST,
  };
  if (location) params.location = `${location.lon},${location.lat}`;
  return request(SUGGEST_BASE, params);
}

export function searchByRubric(
  rubricId: string,
  point: string,
  radius: number,
  page = 1,
): Promise<ApiResult> {
  return request(`${CATALOG_BASE}/items`, {
    rubric_id: rubricId,
    point,
    radius: String(radius),
    location: point,
    sort: "distance",
    page: String(page),
    fields: FIELDS.RUBRIC,
  });
}

/**
 * Best-effort review TEXTS via an undocumented internal endpoint. May return an
 * auth error (401/403) for ordinary self-service keys — callers should degrade
 * gracefully and rely on the documented rating/review_count from getItem().
 */
export function getReviews(placeId: string, limit = 10): Promise<ApiResult> {
  return request(`${REVIEWS_BASE}/branches/${encodeURIComponent(placeId)}/reviews`, {
    place_id: placeId,
    limit: String(limit),
    sort_by: "date_created",
    is_advertiser: "false",
  });
}
