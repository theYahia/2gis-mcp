/**
 * Shared transforms from raw 2GIS items into the trimmed shapes the tools
 * return. Extracting these removes the copy-pasted contact/photo lambdas that
 * lived in three different search handlers and gives them a single tested home.
 */

import type { SearchItem } from "../types.js";

/** Pull contact values of a given type (e.g. "phone", "website") from an item. */
export function extractContacts(item: SearchItem, type: string): string[] | undefined {
  const values = item.contact_groups?.flatMap((g) =>
    g.contacts.filter((c) => c.type === type).map((c) => c.value),
  );
  return values?.length ? values : undefined;
}

/** Map rubrics to {id, name} so callers can feed the id into search_by_rubric. */
function mapRubrics(item: SearchItem) {
  return item.rubrics?.map((r) => ({ id: r.id, name: r.name }));
}

/** Compact place summary for list-style tools (search_places, search_by_rubric). */
export function formatPlaceSummary(item: SearchItem) {
  return {
    id: item.id,
    name: item.name,
    full_name: item.full_name,
    type: item.type,
    address: item.address_name,
    point: item.point,
    rubrics: mapRubrics(item),
    phones: extractContacts(item, "phone"),
    rating: item.reviews?.general_rating,
    review_count: item.reviews?.general_review_count,
  };
}

/** Detailed place info for get_place. */
export function formatPlaceDetail(item: SearchItem) {
  return {
    id: item.id,
    name: item.name,
    full_name: item.full_name,
    type: item.type,
    address: item.address_name,
    point: item.point,
    rubrics: mapRubrics(item),
    schedule: item.schedule,
    phones: extractContacts(item, "phone"),
    websites: extractContacts(item, "website"),
    rating: item.reviews?.general_rating,
    review_count: item.reviews?.general_review_count,
    photos: item.external_content
      ?.filter((e) => e.type === "photo")
      .map((e) => ({ count: e.count, main_url: e.main_photo_url })),
  };
}
