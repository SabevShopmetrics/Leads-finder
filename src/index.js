#!/usr/bin/env node
// SilexBrand Lead Scout — CLI entry point.
//
// Pipeline:
//   1. load config (.env key + queries.json)
//   2. Text Search each query (paginated, rate-limited, retried)
//   3. normalize + dedupe by place id (merging matched niches)
//   4. score each business (0–10)
//   5. sort by score desc, write CSV + JSON to /output
//   6. print a summary
//
// Uses the official Google Places API (New) only — no HTML scraping.

import { loadConfig } from './config.js';
import { textSearch } from './apiClient.js';
import { normalizePlace, dedupe } from './collector.js';
import { scoreBusiness, formatBreakdown } from './scorer.js';
import { writeOutputs } from './writer.js';
import { writeDashboard } from './dashboard.js';

async function main() {
  console.log('SilexBrand Lead Scout — Google Places (New) v1\n');

  const config = await loadConfig();
  console.log(
    `Loaded ${config.queries.length} queries. Cap ${config.maxResultsPerQuery}/query, ` +
      `delay ${config.requestDelayMs}ms, lang=${config.languageCode}, region=${config.regionCode}.\n`
  );

  // 1–2. Collect raw places per query.
  const normalized = [];
  let rawCount = 0;

  for (const [i, { niche, query }] of config.queries.entries()) {
    console.log(`[${i + 1}/${config.queries.length}] "${query}" (${niche})`);
    try {
      const places = await textSearch(query, config);
      rawCount += places.length;
      if (places.length === 0) {
        console.log('    · no results.');
      }
      for (const place of places) normalized.push(normalizePlace(place, niche));
    } catch (err) {
      // One bad query shouldn't sink the whole run.
      console.warn(`    ✗ query failed: ${err.message}`);
    }

    // Polite delay between queries (skip after the last one).
    if (i < config.queries.length - 1) {
      await new Promise((r) => setTimeout(r, config.requestDelayMs));
    }
  }

  // 3. Dedupe by place id.
  const deduped = dedupe(normalized);
  console.log(`\nCollected ${rawCount} raw rows → ${deduped.length} unique businesses.`);

  // 4. Score.
  const scored = deduped.map((biz) => {
    const { score, breakdown } = scoreBusiness(biz);
    return { biz, score, breakdown };
  });

  // 5. Sort by score desc (tie-break: more reviews first, then name).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ra = a.biz.reviewCount ?? 0;
    const rb = b.biz.reviewCount ?? 0;
    if (rb !== ra) return rb - ra;
    return a.biz.business.localeCompare(b.biz.business);
  });

  const rows = scored.map(buildRow);
  const { csvPath, jsonPath } = await writeOutputs(rows, config.outputDir);

  // 6. Summary.
  const noWebsite = rows.filter((r) => r.hasWebsite === 'no').length;
  const hot = rows.filter((r) => r.score >= 7).length;

  // Beautiful standalone HTML dashboard (data inlined, opens by double-click).
  const summary = {
    rawCount,
    unique: rows.length,
    noWebsite,
    hot,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  };
  const dashboardPath = await writeDashboard(rows, summary, config.outputDir);

  console.log('\n──────── Summary ────────');
  console.log(`Total raw results fetched : ${rawCount}`);
  console.log(`Unique businesses         : ${rows.length}`);
  console.log(`Without a website         : ${noWebsite}`);
  console.log(`Hot leads (score 7+)      : ${hot}`);
  console.log('─────────────────────────');
  console.log(`CSV      : ${csvPath}`);
  console.log(`JSON     : ${jsonPath}`);
  console.log(`Dashboard: ${dashboardPath}  ← open this in a browser`);

  if (rows.length > 0) {
    console.log('\nTop leads:');
    for (const r of rows.slice(0, Math.min(10, rows.length))) {
      console.log(
        `  ${String(r.score).padStart(2)}  ${r.business}` +
          `${r.hasWebsite === 'no' ? '  [no site]' : ''}`
      );
    }
  }
}

/** Flatten a scored record into the output row shape (matches CSV columns). */
function buildRow({ biz, score, breakdown }) {
  return {
    business: biz.business,
    niches: [...biz.niches].join('; '),
    score,
    scoreBreakdown: formatBreakdown(breakdown),
    hasWebsite: biz.website ? 'yes' : 'no',
    website: biz.website,
    phone: biz.phone,
    rating: biz.rating ?? '',
    reviewCount: biz.reviewCount ?? '',
    mapsUri: biz.mapsUri,
    address: biz.address,
    businessStatus: biz.businessStatus,
    // Keep the machine-readable breakdown in the JSON output too.
    scoreBreakdownDetail: breakdown,
    placeId: biz.id,
  };
}

main().catch((err) => {
  console.error(`\n✗ Fatal: ${err.message}`);
  process.exitCode = 1;
});
