# @theyahia/2gis-mcp

MCP server for the **2GIS API** — places search, geocoding, directions, public
transport, autocomplete and reviews, for AI agents. Coverage is **Russia/CIS**
(and other 2GIS regions); responses are mostly in Russian.

## Tools (9)

| Tool | Description |
|------|-------------|
| `search_places` | Search places/businesses with spatial filtering + pagination |
| `get_place` | Detailed place info by 2GIS ID |
| `search_by_rubric` | Search by category (rubric) ID near a point |
| `geocode` | Address → coordinates |
| `reverse_geocode` | Coordinates → address |
| `get_directions` | Car/walking/bicycle/taxi/scooter route between two points |
| `get_public_transport` | Public-transport route (metro/bus/tram/trolleybus) |
| `suggest` | Address/place autocomplete |
| `get_reviews` | Rating + review count (official) and review texts (best-effort) |

All tools are **read-only** and annotated as such (`readOnlyHint`, `openWorldHint`).
A `2gis://rubrics` resource explains how to obtain rubric IDs.

## Setup

1. Get an API key at https://dev.2gis.com/ (a free demo key works for trying it out).
2. Set the environment variable `TWOGIS_API_KEY`.

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "2gis": {
      "command": "npx",
      "args": ["-y", "@theyahia/2gis-mcp"],
      "env": { "TWOGIS_API_KEY": "your-key" }
    }
  }
}
```

Optional env: `TWOGIS_TIMEOUT_MS` (request timeout, default 10000), `TWOGIS_LOCALE`
(routing locale, default `ru`).

## API key & scopes

2GIS issues a key **per subscription**, and that one key works for every service
**included in the subscription**. So a single `TWOGIS_API_KEY` can cover Catalog
(places/geocode/suggest), Routing (directions) and Public Transport — **only if
your subscription enables those services**. Notes:

- A **demo key** is created once, valid ~1 month, ~1000 requests **per service**;
  for Places it additionally caps `page_size ≤ 10` and `page ≤ 5`.
- A key bound to an **App ID is for the mobile SDK only** and will fail for direct
  HTTP API calls — create a separate key for this server.
- A `403` typically means the service isn't enabled for your key/subscription.

## Typical workflow

`get_place` and `get_reviews` need a 2GIS **ID**. Get it from `search_places`:

1. `search_places(query: "кофейня", point: "82.92,55.03")` → take `items[].id`.
2. `get_place(place_id: <id>)` or `get_reviews(place_id: <id>)`.

For `search_by_rubric`, take a rubric id from the `rubrics: [{ id, name }]` field of
`search_places` results (or read the `2gis://rubrics` resource), then:

3. `search_by_rubric(rubric_id: <id>, point: "82.92,55.03")`.

## Coordinates — `lon,lat` order

`point` parameters use **`lon,lat` (longitude first)**, e.g. `"82.92,55.03"` —
**not** `lat,lon`. Inputs are validated for order/bounds. The `*_lat` / `*_lon`
numeric parameters (directions, reverse_geocode, suggest) are unambiguous.

## Pagination & limits

`search_places` / `search_by_rubric` accept `page` (1-based) and `page_size`
(≤ 50). `search_places` `radius` ≤ 40000 m (with a query); `search_by_rubric`
`radius` ≤ 2000 m (query-less). Demo keys cap `page ≤ 5` / `page_size ≤ 10`.

## Reviews

The Places API only exposes review **statistics** (rating + count) to self-service
keys — `get_reviews` always returns those. Review **texts** are fetched from an
**undocumented internal endpoint** on a best-effort basis; for many keys this
returns nothing (you'll get the stats plus a `note`). Treat texts as unofficial.

## Public transport

`get_public_transport` calls the 2GIS Public Transport API (a separate endpoint
from car routing). It requires a subscription that includes that API; without it
you may get a `403`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Authentication failed` (401) | Wrong/empty `TWOGIS_API_KEY` |
| `Access forbidden` (403) | Service not enabled for your subscription, or an SDK (App ID) key used for HTTP |
| `Rate limit exceeded` (429) | Per-service quota hit; retried with backoff, then surfaced |
| `Request timed out` | Network/2GIS latency; raise `TWOGIS_TIMEOUT_MS` |
| Empty `no_results` | No matches, or coordinates given as `lat,lon` instead of `lon,lat` |

## Demo prompts

- "Find coffee shops near Новосибирск центр in 2GIS"
- "What is at coordinates 55.0302, 82.9204?"
- "Get walking directions from 55.0302,82.9204 to 54.8430,83.0972"
- "Public transport from Площадь Ленина to Академгородок"
- "Suggest addresses starting with 'Москва, Твер'"
- "Find pharmacies near me by rubric"
- "Rating and reviews for place 141265770013120"

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # biome check
npm run build       # tsc → dist/
npm test            # vitest (unit + stdio smoke)
npm run inspector   # @modelcontextprotocol/inspector against the built server
```

Tests are unit-level (mocked `fetch`) plus an stdio handshake smoke test — no live
API calls. To verify against the real API, set `TWOGIS_API_KEY` and exercise the
tools via `npm run inspector`.

## License

MIT — see [LICENSE](LICENSE).
