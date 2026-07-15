#!/usr/bin/env node
// Re-scores every saved run in output/runs/ using the CURRENT scorer.js —
// no Google Places API calls, no quota spent. Useful after tuning the
// scoring rubric or fixing a categorization bug: the raw business data
// doesn't change, only how it's scored/categorized.
//
// Safety: for every run file, the set of placeIds before and after must be
// IDENTICAL (same count, same ids, no dupes). If it isn't, that run is
// skipped and reported as an error — better to leave stale scores than to
// silently drop a lead.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CRITERIA, scoreBusiness, formatCriteria } from './scorer.js';
import { writeOutputs } from './writer.js';
import { writeDashboard } from './dashboard.js';
import { loadRecentRuns } from './history.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(__dirname, '..', 'output');

/** Rebuild the minimal `biz` shape scoreBusiness() needs, from a saved row. */
function bizFromRow(row) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return {
    website: row.website || '',
    reviewCount: num(row.reviewCount),
    primaryType: row.primaryType || '',
    phone: row.phone || '',
    internationalPhone: '', // not persisted in row shape; scoreBusiness() only uses it as a fallback
    rating: num(row.rating),
    businessStatus: row.businessStatus || '',
  };
}

/** Re-score one row in place, preserving every non-score field verbatim. */
function rescoreRow(row) {
  const { overall, tier, tierLabel, category, criteria } = scoreBusiness(bizFromRow(row));
  const next = { ...row, score: overall, tier, tierLabel, category, criteria, criteriaSummary: formatCriteria(criteria) };
  for (const { key } of CRITERIA) next[`score_${key}`] = criteria[key];
  return next;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const wa = a.criteria?.web_opportunity ?? 0;
    const wb = b.criteria?.web_opportunity ?? 0;
    if (wb !== wa) return wb - wa;
    const ra = a.reviewCount || 0;
    const rb = b.reviewCount || 0;
    if (rb !== ra) return rb - ra;
    return (a.business || '').localeCompare(b.business || '');
  });
}

function tally(rows, keyFn) {
  const out = {};
  for (const r of rows) {
    const k = keyFn(r);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/** Rescore one run file's rows; returns null (skip) if row identity wouldn't be preserved. */
function rescoreRun(entry) {
  const before = entry.rows;
  const beforeIds = new Set(before.map((r) => r.placeId));

  const rescored = sortRows(before.map(rescoreRow));
  const afterIds = new Set(rescored.map((r) => r.placeId));

  if (rescored.length !== before.length || afterIds.size !== beforeIds.size) {
    return { ok: false, reason: `row count changed (${before.length} → ${rescored.length})` };
  }
  for (const id of beforeIds) {
    if (!afterIds.has(id)) return { ok: false, reason: `lead "${id}" disappeared` };
  }

  const byTier = tally(rescored, (r) => r.tier);
  const byCategory = tally(rescored, (r) => r.category);
  const noWebsite = rescored.filter((r) => r.hasWebsite === 'no').length;
  const hot = rescored.filter((r) => r.tier === 'A').length;
  const avg = rescored.length
    ? Math.round(rescored.reduce((s, r) => s + r.score, 0) / rescored.length)
    : 0;

  const summary = {
    ...entry.summary,
    byTier,
    byCategory,
    noWebsite,
    hot,
    avg,
    criteria: CRITERIA,
    rescoredAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  };

  return { ok: true, entry: { ...entry, summary, rows: rescored } };
}

async function main() {
  console.log('SilexBrand Lead Scout — rescore (no API calls)\n');

  const runsDir = resolve(outputDir, 'runs');
  let files;
  try {
    files = (await readdir(runsDir)).filter((f) => f.endsWith('.json'));
  } catch {
    console.error(`No output/runs/ directory found at ${runsDir}. Run a scan first.`);
    process.exitCode = 1;
    return;
  }
  if (files.length === 0) {
    console.error('No saved runs to rescore.');
    process.exitCode = 1;
    return;
  }

  let latestId = null;
  let latestEntry = null;

  for (const file of files.sort()) {
    const path = resolve(runsDir, file);
    const raw = await readFile(path, 'utf8');
    const entry = JSON.parse(raw);

    if (entry.rows.length === 0) {
      console.log(`  · ${entry.id}: 0 rows, nothing to rescore.`);
      continue;
    }

    const result = rescoreRun(entry);
    if (!result.ok) {
      console.error(`  ✗ ${entry.id}: SKIPPED — ${result.reason}. Left untouched.`);
      continue;
    }

    await writeFile(path, `${JSON.stringify(result.entry, null, 2)}\n`, 'utf8');
    console.log(`  ✓ ${entry.id}: rescored ${result.entry.rows.length} leads (all preserved).`);

    if (latestId === null || entry.id > latestId) {
      latestId = entry.id;
      latestEntry = result.entry;
    }
  }

  if (!latestEntry) {
    console.log('\nNo non-empty runs were rescored; leaving output/leads.* and dashboard.html as-is.');
    return;
  }

  // Regenerate the "latest" outputs (leads.csv/json + dashboard.html) from
  // the most recent non-empty run, same as a normal run would.
  const { csvPath, jsonPath } = await writeOutputs(latestEntry.rows, outputDir);
  const history = await loadRecentRuns(outputDir);
  const dashboardPath = await writeDashboard(latestEntry.rows, latestEntry.summary, outputDir, history);

  console.log(`\nLatest run (${latestId}) rewritten as the active dataset:`);
  console.log(`  CSV      : ${csvPath}`);
  console.log(`  JSON     : ${jsonPath}`);
  console.log(`  Dashboard: ${dashboardPath}`);
}

main().catch((err) => {
  console.error(`\n✗ Fatal: ${err.message}`);
  process.exitCode = 1;
});
