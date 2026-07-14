// Lead scoring rubric (0–10). Each business is scored on how good a prospect it
// is for SilexBrand (websites, chatbots, CRM, automation for local SMEs).
//
// The idea: no website + established + reachable + high-value niche == hot lead.

// primaryType values (Places API) considered high-value niches for SilexBrand.
// See: https://developers.google.com/maps/documentation/places/web-service/place-types
export const HIGH_VALUE_TYPES = new Set([
  // Health / clinics
  'dentist',
  'dental_clinic',
  'doctor',
  'medical_lab',
  'hospital',
  'physiotherapist',
  'chiropractor',
  'veterinary_care',
  // Real estate
  'real_estate_agency',
  // Hospitality
  'restaurant',
  'cafe',
  'bar',
  'lodging',
  'hotel',
  'motel',
  'resort_hotel',
  // Beauty / wellness
  'beauty_salon',
  'hair_salon',
  'spa',
  'nail_salon',
  // Professional services
  'lawyer',
  'accounting',
  'insurance_agency',
  'car_dealer',
  'car_repair',
  // Fitness
  'gym',
  'fitness_center',
]);

/**
 * Score a single (deduped) business record.
 *
 * @param {object} biz normalized business (see collector.js normalizePlace)
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreBusiness(biz) {
  const breakdown = {};
  let score = 0;

  const add = (label, points) => {
    breakdown[label] = points;
    score += points;
  };

  const hasWebsite = Boolean(biz.website);
  const reviewCount = Number.isFinite(biz.reviewCount) ? biz.reviewCount : 0;
  const rating = Number.isFinite(biz.rating) ? biz.rating : 0;

  // No website at all → the core opportunity for a web agency.
  if (!hasWebsite) {
    add('no_website', 3);
  } else {
    add('has_website', 0);
  }

  // Established enough to have a budget.
  if (reviewCount >= 20) {
    add('established_20plus_reviews', 2);
  }

  // Premium signal: well-rated AND enough reviews to trust the rating.
  if (rating >= 4.0 && reviewCount >= 20) {
    add('premium_rating', 1);
  }

  // Reachable by phone (local number).
  if (biz.phone) {
    add('has_phone', 1);
  }

  // Currently operating.
  if (biz.businessStatus === 'OPERATIONAL') {
    add('operational', 1);
  }

  // High-value niche by Google primaryType.
  if (biz.primaryType && HIGH_VALUE_TYPES.has(biz.primaryType)) {
    add('high_value_type', 2);
  }

  // Cap at 10.
  if (score > 10) {
    breakdown._capped_from = score;
    score = 10;
  }

  return { score, breakdown };
}

/** Render the breakdown object into a compact human-readable string. */
export function formatBreakdown(breakdown) {
  return Object.entries(breakdown)
    .map(([label, pts]) => `${label}:${pts >= 0 ? '+' : ''}${pts}`)
    .join(' ');
}
