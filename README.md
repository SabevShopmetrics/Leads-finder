# SilexBrand Lead Scout

A small Node.js CLI that builds a **scored lead list of Varna businesses** using
the official **Google Places API (New) — Places API v1**. Built for
[SilexBrand](#), a digital agency selling websites, chatbots, CRM and automation
to local SMEs.

The idea: a business with **no website**, that is **established** (enough
reviews), **reachable** (has a phone), **operating**, and in a **high-value
niche** is a hot prospect. The script ranks exactly those to the top.

> Uses the official Places API only. It does **not** scrape google.com/maps or
> parse any HTML.

## What it does

1. Reads search terms from `queries.json`.
2. Runs a **Text Search** for each term (paginated up to a per-query cap).
3. **Deduplicates** businesses across queries by Google place id, recording
   every niche each one matched.
4. **Scores** each business 0–10 (rubric below).
5. Writes a sorted **CSV** and **JSON** to `output/`.
6. Prints a summary (total found, unique, no-website count, hot leads).

## Requirements

- **Node.js 20.6+** (uses native `fetch`, ESM, and the built-in `.env` loader).
  Node 20.12+ is recommended. No npm dependencies.
- A Google Cloud project with **"Places API (New)"** enabled and an API key.

## Setup

### 1. Get an API key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create/select a project and enable **Places API (New)**.
3. Create an API key under *APIs & Services → Credentials*.
4. (Recommended) Restrict the key to the Places API.

### 2. Configure the key

Copy the example env file and paste your key:

```bash
cp .env.example .env
# then edit .env and set GOOGLE_PLACES_API_KEY=...
```

`.env` is git-ignored — your key is never committed. You can also just export
the variable instead of using a file:

```bash
export GOOGLE_PLACES_API_KEY="your-key"      # macOS/Linux
$env:GOOGLE_PLACES_API_KEY = "your-key"      # Windows PowerShell
```

### 3. Edit the queries

`queries.json` is an array of `{ niche, query }` objects. `niche` is your own
label; `query` is the free-text sent to Google. Add or remove entries freely:

```json
[
  { "niche": "dental",      "query": "стоматолог Варна" },
  { "niche": "real_estate", "query": "агенция за недвижими имоти Варна" }
]
```

## Run

```bash
npm start
# or
node src/index.js
```

Each run writes three files to `output/`, all sorted by score (highest first):

- **`dashboard.html`** — a beautiful, self-contained dashboard. Double-click to
  open in any browser (no server needed — data is inlined). KPI cards, live
  search, filter by niche / website / min-score, and click any column header to
  re-sort. Score badges are colour-coded: red = hot (7+), amber = warm (4–6),
  grey = cold.
- **`leads.csv`** — written with a UTF-8 BOM so Cyrillic opens cleanly in Excel.
- **`leads.json`** — full structured data, including the machine-readable score
  breakdown per business.

## CSV columns

`business`, `niche(s)`, `score`, `score_breakdown`, `has_website`, `website`,
`phone`, `rating`, `review_count`, `maps_url`, `address`, `status`.

## Scoring rubric (0–10)

| Signal | Points |
| --- | --- |
| No website at all | **+3** |
| Has a website | +0 (flag broken ones manually later) |
| ≥ 20 reviews (established / can pay) | **+2** |
| Rating ≥ 4.0 **and** ≥ 20 reviews (premium) | **+1** |
| Has a national phone number (reachable) | **+1** |
| `businessStatus` is `OPERATIONAL` | **+1** |
| `primaryType` is a high-value niche* | **+2** |

\* clinic, dentist, real_estate_agency, restaurant, lodging/hotel, beauty_salon,
lawyer, accounting, gym, etc. — see [`src/scorer.js`](src/scorer.js).

Total is **capped at 10**. The exact breakdown is saved per row in
`score_breakdown` (CSV) and `scoreBreakdownDetail` (JSON).

## Configuration (optional env vars)

| Variable | Default | Meaning |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | — | **Required.** Your Places API (New) key. |
| `MAX_RESULTS_PER_QUERY` | `60` | Cap per query (Google returns 20/page). |
| `REQUEST_DELAY_MS` | `1200` | Delay between API calls (rate-limiting). |
| `LANGUAGE_CODE` | `bg` | Result language. |
| `REGION_CODE` | `BG` | Region bias. |

## Project layout

```
src/
  config.js      # load .env key + queries.json (validation)
  apiClient.js   # Places v1 Text Search: fieldmask, pagination, retry/backoff
  collector.js   # normalize raw places + dedupe by id (merge niches)
  scorer.js      # the 0–10 scoring rubric
  writer.js      # CSV (manual, RFC-4180) + JSON writers
  dashboard.js   # self-contained HTML dashboard generator (data inlined)
  index.js       # CLI orchestration + summary
queries.json     # your search terms
.env.example     # copy to .env and add your key
```

## Notes & limits

- Places Text Search returns at most 20 results per page and 3 pages
  (≈60 results) per query — that's a Google limit, not a script limit. Use
  several targeted queries to widen coverage.
- The API is billed per request. Check
  [Places pricing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing).
- Transient `429`/`5xx` responses are retried with exponential backoff; a query
  that still fails is logged and skipped so the rest of the run completes.
- "Has a website" scores 0, not negative — a separate manual pass can flag
  *broken/outdated* sites, which are also good SilexBrand leads.
