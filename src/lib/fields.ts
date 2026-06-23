/**
 * Single source of truth for 2GIS `fields` selectors.
 *
 * The `fields` parameter controls which blocks the Catalog/Geocoder API returns.
 * Centralizing the strings here keeps the client and the tool defaults from
 * drifting apart (they previously requested slightly different field sets).
 */

export const FIELDS = {
  /** search_places list view — includes reviews so rating/review_count are populated. */
  SEARCH: "items.point,items.address,items.contact_groups,items.rubrics,items.reviews",
  /** get_place detail view. */
  PLACE_DETAIL:
    "items.point,items.address,items.contact_groups,items.schedule,items.reviews,items.rubrics,items.external_content",
  /** Forward & reverse geocoding — adm_div enriches non-building results. */
  GEOCODE: "items.point,items.address,items.adm_div",
  /** search_by_rubric list view. */
  RUBRIC: "items.point,items.address,items.contact_groups,items.rubrics",
  /** suggest — point/address are only returned when explicitly requested. */
  SUGGEST: "items.point,items.address",
  /** Review statistics (rating + count) via Places API items/byid. */
  REVIEWS_STATS: "items.reviews",
} as const;
