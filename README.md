# @theyahia/2gis-mcp

MCP server for **2GIS API** — places search, geocoding, directions, reviews for AI agents.

## Tools (8)

| Tool | Description |
|------|-------------|
| `search_places` | Search places/businesses with spatial filtering |
| `get_place` | Detailed place info by ID |
| `geocode` | Address → coordinates |
| `reverse_geocode` | Coordinates → address |
| `get_directions` | Route between two points |
| `suggest` | Address/place autocomplete |
| `search_by_rubric` | Search by category ID near a point |
| `get_reviews` | User reviews for a place |

## Setup

1. Get API key: https://dev.2gis.com/
2. Set env: `TWOGIS_API_KEY=your-key`

### Claude Desktop

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

## Demo Prompts

- "Find coffee shops near Новосибирск центр in 2GIS"
- "What is at coordinates 55.0302, 82.9204?"
- "Get directions from Площадь Ленина to Академгородок in Novosibirsk"
- "Show reviews for this restaurant"
- "Suggest addresses starting with 'Москва, Твер'"
- "Find all pharmacies (rubric) within 2km of my location"
- "Get details about place ID 141265770013120"

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
