/**
 * 2GIS API response types.
 */

export interface ApiResult<T = unknown> {
  data: T | null;
  error: string | null;
}

/** Common 2GIS response envelope. The API returns the real status in meta.code
 *  (often inside an HTTP 200), and an explanatory message in meta.error. */
export interface ApiMeta {
  code: number;
  api_version?: string;
  error?: {
    type?: string;
    message?: string;
  };
}

// Search
export interface SearchResponse {
  meta?: ApiMeta;
  result: {
    total: number;
    items: SearchItem[];
  };
}

export interface SearchItem {
  id: string;
  type: string;
  name: string;
  full_name?: string;
  address_name?: string;
  purpose_name?: string;
  building_name?: string;
  point?: { lat: number; lon: number };
  address?: {
    building_id?: string;
    components?: Array<{ type: string; name: string }>;
    postcode?: string;
  };
  adm_div?: Array<{ id?: string; name?: string; type?: string }>;
  org?: {
    id: string;
    name: string;
    branch_count?: number;
  };
  contact_groups?: Array<{
    contacts: Array<{
      type: string;
      value: string;
      text?: string;
    }>;
  }>;
  schedule?: {
    Mon?: string;
    Tue?: string;
    Wed?: string;
    Thu?: string;
    Fri?: string;
    Sat?: string;
    Sun?: string;
  };
  rubrics?: Array<{
    id: string;
    name: string;
    parent_id?: string;
  }>;
  reviews?: {
    general_rating?: number;
    general_review_count?: number;
  };
  external_content?: Array<{
    type: string;
    count?: number;
    main_photo_url?: string;
  }>;
}

// Geocode
export interface GeocodeResponse {
  meta?: ApiMeta;
  result: {
    total: number;
    items: Array<{
      id: string;
      name: string;
      full_name: string;
      point?: { lat: number; lon: number };
      address?: {
        building_id?: string;
        postcode?: string;
        components?: Array<{ type: string; name: string }>;
      };
      adm_div?: Array<{ id?: string; name?: string; type?: string }>;
      type: string;
    }>;
  };
}

// Directions (routing 7.0.0). Turn-by-turn detail lives in `maneuvers[]` —
// this API has no `legs`/`steps`.
export interface DirectionsResponse {
  meta?: ApiMeta;
  result: Array<{
    id?: string;
    route_id?: string;
    type?: string;
    total_duration: number;
    total_distance: number;
    ui_total_duration?: string;
    ui_total_distance?: string;
    maneuvers?: Array<{
      id?: number | string;
      comment?: string;
      icon?: string;
      outcoming_path?: {
        distance?: number;
        duration?: number;
        names?: string[];
      };
    }>;
  }>;
}

// Public transport routing. Top level is an array of route options; each route
// has total duration/distance, a transfer count, and per-segment `movements[]`
// (type "walkway" for foot segments, "passage" for transit). Typed loosely and
// parsed defensively — the field set is doc-derived (medium confidence).
export type PublicTransportResponse = Array<{
  id?: string | number;
  total_distance?: number;
  total_duration?: number;
  total_walkway_distance?: number | string;
  transfer_count?: number;
  crossing_count?: number;
  transport?: string[];
  movements?: Array<{
    id?: string | number;
    type?: string;
    distance?: number;
    moving_duration?: number;
    waypoint?: { name?: string; subtype?: string };
    routes?: Array<{ names?: string[]; subtype?: string }>;
  }>;
}>;

// Suggest. Items reuse the catalog item shape: name / address_name / full_name —
// there is no `title` / `subtitle`.
export interface SuggestResponse {
  meta?: ApiMeta;
  result: {
    items: Array<{
      id?: string;
      name: string;
      full_name?: string;
      address_name?: string;
      type: string;
      subtype?: string;
      point?: { lat: number; lon: number };
    }>;
  };
}

// Reviews (best-effort, via an undocumented internal endpoint).
export interface ReviewsResponse {
  meta?: ApiMeta;
  result: {
    items: Array<{
      id: string;
      text?: string;
      rating: number;
      date_created: string;
      user?: { name: string };
    }>;
    total: number;
  };
}
