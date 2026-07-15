// Thin client for the Google Places API (New) — Text Search endpoint.
// Handles the FieldMask header, pagination via nextPageToken, polite rate
// limiting and exponential-backoff retries on 429 / 5xx responses.
//
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

// Fields we ask Google to return. `nextPageToken` MUST be present for
// pagination to work; the rest map directly onto our output columns.
const FIELD_MASK = [
  'places.displayName',
  'places.id',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.primaryType',
  'nextPageToken',
].join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Perform a single POST to searchText with retry/backoff.
 * Retries on network errors, HTTP 429 and 5xx. 4xx (other than 429) fail fast.
 */
async function postSearchText(body, { apiKey, maxRetries = 4, baseDelayMs = 1000 }) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    let res;
    try {
      res = await fetch(SEARCH_TEXT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      // Transport-level failure (DNS, socket, etc.) — retryable.
      if (attempt > maxRetries) {
        throw new Error(`Network error after ${maxRetries} retries: ${networkErr.message}`);
      }
      const wait = backoff(baseDelayMs, attempt);
      console.warn(`    ⚠ Network error (${networkErr.message}); retrying in ${wait}ms…`);
      await sleep(wait);
      continue;
    }

    if (res.ok) {
      return res.json();
    }

    const errText = await safeReadText(res);

    // A *daily* quota exhaustion (e.g. "SearchTextRequest per day") won't
    // recover within seconds/minutes — retrying just burns time. Fail fast
    // with a marked error so the caller can stop the whole run instead of
    // hammering every remaining query for the same guaranteed failure.
    if (res.status === 429 && /per\s*day/i.test(errText)) {
      const quotaErr = new Error(`Places API daily quota exhausted: ${truncate(errText, 400)}`);
      quotaErr.quotaExhausted = true;
      throw quotaErr;
    }

    const retryable = res.status === 429 || res.status >= 500;

    if (retryable && attempt <= maxRetries) {
      const wait = backoff(baseDelayMs, attempt);
      console.warn(
        `    ⚠ HTTP ${res.status} (attempt ${attempt}/${maxRetries + 1}); retrying in ${wait}ms…`
      );
      await sleep(wait);
      continue;
    }

    throw new Error(`Places API error HTTP ${res.status}: ${truncate(errText, 500)}`);
  }
}

function backoff(baseDelayMs, attempt) {
  // Exponential with a little jitter to avoid thundering-herd retries.
  const exp = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * baseDelayMs);
  return Math.min(exp + jitter, 30_000);
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return '<no response body>';
  }
}

function truncate(s, n) {
  if (typeof s !== 'string') return s;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * Run a Text Search for one query, following nextPageToken until we hit the
 * results cap or run out of pages.
 *
 * @returns {Promise<Array>} raw place objects from the API (may be empty)
 */
export async function textSearch(query, config) {
  const { apiKey, maxResultsPerQuery, requestDelayMs, languageCode, regionCode, locationBias } =
    config;
  const results = [];
  let pageToken;
  let page = 0;

  do {
    page += 1;
    const body = {
      textQuery: query,
      languageCode,
      regionCode,
      // Google caps pageSize at 20 for Text Search.
      pageSize: 20,
    };
    if (locationBias) body.locationBias = locationBias;
    if (pageToken) body.pageToken = pageToken;

    const data = await postSearchText(body, { apiKey, baseDelayMs: requestDelayMs });
    const places = Array.isArray(data.places) ? data.places : [];
    results.push(...places);
    pageToken = data.nextPageToken;

    console.log(
      `    · page ${page}: +${places.length} (total ${results.length})` +
        (pageToken ? ' — more available' : '')
    );

    if (results.length >= maxResultsPerQuery) {
      if (pageToken) console.log(`    · reached cap of ${maxResultsPerQuery}; stopping.`);
      break;
    }

    if (pageToken) {
      // Rate-limit AND give Google a moment to activate the next page token.
      await sleep(requestDelayMs);
    }
  } while (pageToken);

  return results.slice(0, maxResultsPerQuery);
}

export { FIELD_MASK };
