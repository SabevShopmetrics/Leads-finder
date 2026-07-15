// Advanced lead scoring for SilexBrand.
//
// Every business is scored 1–100 on EACH criterion below, then those are
// combined by weight into a single 1–100 "overall" lead score and a letter
// tier. Businesses are also categorized into a high-level industry group.
//
// The philosophy: a business with no website (big opportunity), that is
// established enough to have a budget, reachable, operating, well-reviewed and
// in a niche SilexBrand knows how to sell to == a near-100 lead.

// ── Criteria definitions (order = display order) ─────────────────────────────
// weight values sum to 1.0. Tweak here to re-prioritize without touching logic.
export const CRITERIA = [
  { key: 'web_opportunity', label: 'Web Opportunity', weight: 0.32, hint: 'No / weak web presence to sell into' },
  { key: 'budget',          label: 'Budget & Size',   weight: 0.22, hint: 'Established enough to pay (review volume)' },
  { key: 'niche_fit',       label: 'Niche Fit',       weight: 0.16, hint: 'Category SilexBrand sells to well' },
  { key: 'reachability',    label: 'Reachability',    weight: 0.12, hint: 'Can we actually contact them' },
  { key: 'reputation',      label: 'Reputation',      weight: 0.10, hint: 'Rating quality (confidence-weighted)' },
  { key: 'operational',     label: 'Operational',     weight: 0.08, hint: 'Currently open for business' },
];

// ── Industry categorization by Google primaryType ────────────────────────────
// First matching group wins (order matters where types overlap).
//
// Google Places API (New) returns granular subtypes (e.g. "italian_restaurant",
// "fast_food_restaurant") rather than just the generic parent ("restaurant") —
// each list below spells those out explicitly rather than relying on the
// generic type alone, otherwise real leads silently fall through to "Other"
// and lose niche-fit score (see HIGH_VALUE_TYPES below).
const CATEGORY_MAP = [
  ['Health', [
    'dentist', 'dental_clinic', 'doctor', 'hospital', 'medical_lab', 'physiotherapist',
    'chiropractor', 'veterinary_care', 'pharmacy', 'drugstore',
    'medical_clinic', 'medical_center', 'health', 'skin_care_clinic',
  ]],
  ['Real Estate', ['real_estate_agency']],
  ['Hospitality', [
    'restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway', 'meal_delivery',
    'lodging', 'hotel', 'motel', 'resort_hotel', 'guest_house', 'bed_and_breakfast',
    'hostel', 'inn', 'cottage', 'private_guest_room', 'extended_stay_hotel',
    'campground', 'camping_cabin', 'farmstay', 'mobile_home_park', 'rv_park',
    // Google's granular "Food and Drink" subtypes (Places API Table A).
    'afghani_restaurant', 'african_restaurant', 'american_restaurant', 'asian_restaurant',
    'bagel_shop', 'bar_and_grill', 'barbecue_restaurant', 'brazilian_restaurant',
    'breakfast_restaurant', 'brunch_restaurant', 'buffet_restaurant', 'cafeteria',
    'candy_store', 'chinese_restaurant', 'chocolate_factory', 'chocolate_shop',
    'coffee_shop', 'confectionery', 'deli', 'dessert_restaurant', 'dessert_shop',
    'diner', 'donut_shop', 'fast_food_restaurant', 'fine_dining_restaurant',
    'food_court', 'french_restaurant', 'greek_restaurant', 'hamburger_restaurant',
    'ice_cream_shop', 'indian_restaurant', 'indonesian_restaurant', 'italian_restaurant',
    'japanese_restaurant', 'juice_shop', 'korean_restaurant', 'lebanese_restaurant',
    'mediterranean_restaurant', 'mexican_restaurant', 'middle_eastern_restaurant',
    'pizza_restaurant', 'pub', 'ramen_restaurant', 'sandwich_shop', 'seafood_restaurant',
    'spanish_restaurant', 'steak_house', 'sushi_restaurant', 'tea_house', 'thai_restaurant',
    'turkish_restaurant', 'ukrainian_restaurant', 'vegan_restaurant', 'vegetarian_restaurant',
    'vietnamese_restaurant', 'wine_bar', 'bistro', 'sports_bar', 'chicken_restaurant',
    'fish_and_chips_restaurant', 'family_restaurant', 'european_restaurant',
  ]],
  ['Beauty & Wellness', ['beauty_salon', 'hair_salon', 'spa', 'nail_salon', 'barber_shop', 'wellness_center', 'sauna', 'tanning_studio']],
  ['Professional Services', ['lawyer', 'accounting', 'insurance_agency', 'consultant', 'notary_public']],
  ['Automotive', ['car_dealer', 'car_repair', 'car_wash', 'auto_parts_store']],
  ['Fitness', ['gym', 'fitness_center', 'sports_club', 'yoga_studio']],
  ['Retail', ['store', 'clothing_store', 'furniture_store', 'jewelry_store', 'shoe_store', 'electronics_store', 'supermarket', 'shopping_mall', 'market']],
  ['Education', ['school', 'primary_school', 'secondary_school', 'university', 'language_school']],
];

// primaryType values that are a strong fit for SilexBrand's offering.
export const HIGH_VALUE_TYPES = new Set(
  CATEGORY_MAP.filter(([group]) =>
    ['Health', 'Real Estate', 'Hospitality', 'Beauty & Wellness', 'Professional Services', 'Automotive', 'Fitness'].includes(group)
  ).flatMap(([, types]) => types)
);

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = (n) => Math.round(n);

/** Map a Google primaryType to a high-level industry category. */
export function categorize(primaryType) {
  if (!primaryType) return 'Other';
  for (const [group, types] of CATEGORY_MAP) {
    if (types.includes(primaryType)) return group;
  }
  return 'Other';
}

// ── Per-criterion scorers (each returns 1–100) ───────────────────────────────

// The core opportunity: no site == maximum, a site still leaves chatbot/CRM/
// automation upsell but is a lower-priority lead.
function webOpportunityScore(biz) {
  return biz.website ? 45 : 100;
}

// Budget proxy from review volume (log scale: reviews correlate with size/spend).
function budgetScore(biz) {
  const rc = Number.isFinite(biz.reviewCount) ? biz.reviewCount : 0;
  if (rc <= 0) return 15; // no track record yet
  // rc=1→~30, 20→~64, 100→~86, 500→capped 100
  return clamp(round(20 + 33 * Math.log10(rc + 1)), 1, 100);
}

// Category fit for SilexBrand's sales motion.
function nicheFitScore(biz) {
  if (biz.primaryType && HIGH_VALUE_TYPES.has(biz.primaryType)) return 100;
  if (biz.primaryType) return 55;
  return 40;
}

// How contactable the lead is.
function reachabilityScore(biz) {
  if (biz.phone) return 100; // national phone
  if (biz.internationalPhone) return 75;
  if (biz.website) return 55; // at least a contact form somewhere
  return 20;
}

// Rating quality, pulled toward a neutral 50 when few reviews back it up.
function reputationScore(biz) {
  const rating = Number.isFinite(biz.rating) ? biz.rating : null;
  if (rating == null) return 30;
  const rc = Number.isFinite(biz.reviewCount) ? biz.reviewCount : 0;
  const base = clamp((rating - 2.5) / 2.5, 0, 1) * 100; // 2.5→0, 4.0→60, 5.0→100
  const confidence = clamp(rc / 50, 0, 1); // full confidence by ~50 reviews
  return clamp(round(50 + (base - 50) * confidence), 1, 100);
}

// Is the business actually open?
function operationalScore(biz) {
  switch (biz.businessStatus) {
    case 'OPERATIONAL': return 100;
    case 'CLOSED_TEMPORARILY': return 45;
    case 'CLOSED_PERMANENTLY': return 5;
    default: return 60; // unknown
  }
}

const SCORERS = {
  web_opportunity: webOpportunityScore,
  budget: budgetScore,
  niche_fit: nicheFitScore,
  reachability: reachabilityScore,
  reputation: reputationScore,
  operational: operationalScore,
};

/** Letter tier + human label from the overall 1–100 score. */
export function tierFor(overall) {
  if (overall >= 80) return { tier: 'A', label: 'Hot' };
  if (overall >= 65) return { tier: 'B', label: 'Warm' };
  if (overall >= 50) return { tier: 'C', label: 'Nurture' };
  return { tier: 'D', label: 'Cold' };
}

/**
 * Score one normalized business.
 * @returns {{ overall:number, tier:string, tierLabel:string, category:string,
 *             criteria: Record<string, number> }}
 */
export function scoreBusiness(biz) {
  const criteria = {};
  let weighted = 0;
  for (const { key, weight } of CRITERIA) {
    const s = clamp(round(SCORERS[key](biz)), 1, 100);
    criteria[key] = s;
    weighted += s * weight;
  }
  const overall = clamp(round(weighted), 1, 100);
  const { tier, label } = tierFor(overall);
  return {
    overall,
    tier,
    tierLabel: label,
    category: categorize(biz.primaryType),
    criteria,
  };
}

/** Compact "web_opportunity:100 budget:86 …" string for CSV readability. */
export function formatCriteria(criteria) {
  return CRITERIA.map(({ key }) => `${key}:${criteria[key]}`).join(' ');
}
