# Changelog

All notable changes are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versioning per [SemVer](https://semver.org/).

## [1.1.0] - 2026-06-23

A correctness + robustness release. Several tools did not actually work against
the live 2GIS API (wrong parameters / response fields, verified against the
official docs at docs.2gis.com); they are fixed here.

### Fixed — API contract

- **get_directions**: `mode: "pedestrian"` was an invalid transport value → now
  mapped to the API's `transport: "walking"` (with `type: "walking"` route
  points). The response parser read a non-existent `legs[].steps[]`; routing
  7.0.0 returns `maneuvers[]`, which are now parsed (turn-by-turn comments,
  per-maneuver distance/duration, street names).
- **suggest**: location biasing used the wrong query parameter `point` (silently
  ignored by the API) → now `location`. The response mapper read non-existent
  `title`/`subtitle` → now `name` / `address_name`. Coordinates were absent →
  the request now asks for `fields=items.point`.
- **search_places**: `type: "org"` was not a documented value → removed (use
  `branch` for companies); `radius` cap lowered from 50000 to the documented
  40000; `items.reviews` now requested so `rating`/`review_count` are populated.
- **search_by_rubric**: now sends `sort=distance` + `location` and constrains
  `radius` to the documented ≤2000 for a query-less category search.
- **meta.code**: logical errors carried inside an HTTP 200 body (e.g. 403 / 500)
  are now detected and surfaced instead of being masked as "no results".

### Added

- **get_public_transport** — public-transport routing (metro / bus / tram /
  trolleybus) via the 2GIS Public Transport API. Requires a subscription that
  includes that API. (`public_transport` is a separate endpoint, not a routing
  `transport` mode.)
- **Pagination**: `page` parameter on `search_places` and `search_by_rubric`.
- **get_reviews** now always returns documented review statistics (rating +
  review count via Places API) and additionally attempts review *texts* via an
  undocumented internal endpoint (best-effort — degrades gracefully with a note
  when unavailable for the key).
- **MCP surface**: per-tool annotations (`readOnlyHint`, `destructiveHint:false`,
  `idempotentHint`, `openWorldHint`, human `title`), server `instructions`, and a
  `2gis://rubrics` resource describing how to obtain rubric IDs.
- **reverse_geocode**: optional `radius`; richer results via `items.adm_div`.
- Rubric IDs are surfaced (`{id, name}`) in search results so they can feed
  `search_by_rubric`.

### Changed

- HTTP client rewritten around a single `request()` helper (was duplicated
  `callGET`/`callPOST` + 8× repeated key handling): exponential backoff **with
  jitter** now also applied to network errors and timeouts (previously retried
  with no backoff, or not at all); `AbortError` detected by name rather than
  `instanceof DOMException`; defensive JSON parsing (malformed bodies reported,
  not retried); 2GIS error-body detail surfaced in messages (API key never
  leaked).
- Tool registration migrated from the deprecated `server.tool()` to
  `server.registerTool()`.
- Server version is sourced from `package.json` (was hardcoded `1.0.0` and had
  drifted from the published `1.0.1`).
- Coordinate (`point`) inputs are validated for `lon,lat` order and bounds.
- Tooling: added Biome (lint + format), `typecheck` / `lint` / `format` scripts,
  GitHub Actions CI (Node 18 / 20 / 22), and an end-to-end stdio smoke test.
  Test count 12 → 39.
- Bumped `@modelcontextprotocol/sdk` floor to `^1.29.0`.

## [1.0.1]

- npm discoverability metadata (description, keywords, version).

## [1.0.0]

- Initial release.
