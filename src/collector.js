// Turns raw Places API objects into flat, defensively-normalized records and
// deduplicates them across queries by place id, merging matched niches.

/**
 * Normalize a raw Places API place into the flat shape the rest of the app uses.
 * Every field is guarded so missing data never throws.
 */
export function normalizePlace(place, niche) {
  const displayName =
    (place?.displayName && (place.displayName.text || place.displayName)) || '';

  return {
    id: place?.id || '',
    business: typeof displayName === 'string' ? displayName : '',
    niches: new Set(niche ? [niche] : []),
    address: place?.formattedAddress || '',
    phone: place?.nationalPhoneNumber || '',
    internationalPhone: place?.internationalPhoneNumber || '',
    website: place?.websiteUri || '',
    rating: typeof place?.rating === 'number' ? place.rating : null,
    reviewCount: typeof place?.userRatingCount === 'number' ? place.userRatingCount : null,
    businessStatus: place?.businessStatus || '',
    mapsUri: place?.googleMapsUri || '',
    primaryType: place?.primaryType || '',
  };
}

/**
 * Deduplicate normalized records by id. When the same business appears under
 * multiple queries, keep one record and union its matched niches.
 *
 * Records without an id (rare / malformed) are kept individually so we never
 * silently drop a real business.
 *
 * @param {Array} records normalized records (niches as Set)
 * @returns {Array} deduped records with `niches` still as a Set
 */
export function dedupe(records) {
  const byId = new Map();
  const anonymous = [];

  for (const rec of records) {
    if (!rec.id) {
      anonymous.push(rec);
      continue;
    }
    const existing = byId.get(rec.id);
    if (existing) {
      for (const n of rec.niches) existing.niches.add(n);
      // Fill any gaps from later matches (e.g. a phone that one query returned
      // but another didn't).
      backfill(existing, rec);
    } else {
      byId.set(rec.id, rec);
    }
  }

  return [...byId.values(), ...anonymous];
}

// Fill empty/null fields on `target` from `source` without overwriting real data.
function backfill(target, source) {
  const fields = [
    'business',
    'address',
    'phone',
    'internationalPhone',
    'website',
    'businessStatus',
    'mapsUri',
    'primaryType',
  ];
  for (const f of fields) {
    if (!target[f] && source[f]) target[f] = source[f];
  }
  if (target.rating == null && source.rating != null) target.rating = source.rating;
  if (target.reviewCount == null && source.reviewCount != null) {
    target.reviewCount = source.reviewCount;
  }
}
