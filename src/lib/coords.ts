/**
 * Coordinate parsing & validation helpers.
 *
 * 2GIS expects point coordinates as "lon,lat" (LONGITUDE FIRST) — a common
 * footgun, since humans and LLMs usually say "lat,lon". The helpers here parse
 * and bounds-check coordinates so that swapped or out-of-range values are
 * rejected early with a clear message instead of silently returning the wrong
 * region or no results.
 */

export interface LonLat {
  lon: number;
  lat: number;
}

export function isValidLat(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLon(lon: number): boolean {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

/**
 * Parse a "lon,lat" string into bounded coordinates, or return null when the
 * string is malformed or out of range.
 */
export function parsePoint(value: string): LonLat | null {
  const parts = value.split(",");
  if (parts.length !== 2) return null;
  const lon = Number(parts[0].trim());
  const lat = Number(parts[1].trim());
  if (parts[0].trim() === "" || parts[1].trim() === "") return null;
  if (!isValidLon(lon) || !isValidLat(lat)) return null;
  return { lon, lat };
}
