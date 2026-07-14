// Writes the scored lead list to /output as both CSV and JSON.
// CSV is produced manually (RFC-4180 quoting) to keep the project dependency-free.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CSV_COLUMNS = [
  { key: 'business', header: 'business' },
  { key: 'niches', header: 'niche(s)' },
  { key: 'score', header: 'score' },
  { key: 'scoreBreakdown', header: 'score_breakdown' },
  { key: 'hasWebsite', header: 'has_website' },
  { key: 'website', header: 'website' },
  { key: 'phone', header: 'phone' },
  { key: 'rating', header: 'rating' },
  { key: 'reviewCount', header: 'review_count' },
  { key: 'mapsUri', header: 'maps_url' },
  { key: 'address', header: 'address' },
  { key: 'businessStatus', header: 'status' },
];

/** Escape a single CSV field per RFC 4180 (quote if it contains ,"\n or \r). */
function csvField(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows) {
  const lines = [CSV_COLUMNS.map((c) => csvField(c.header)).join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvField(row[c.key])).join(','));
  }
  // Trailing newline for POSIX-friendliness.
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Write both output files.
 * @param {Array} rows flattened, sorted rows (see index.js buildRows)
 * @param {string} outputDir absolute path to /output
 * @returns {Promise<{csvPath: string, jsonPath: string}>}
 */
export async function writeOutputs(rows, outputDir) {
  await mkdir(outputDir, { recursive: true });

  const csvPath = resolve(outputDir, 'leads.csv');
  const jsonPath = resolve(outputDir, 'leads.json');

  // BOM so Excel opens the UTF-8 (Cyrillic) CSV correctly.
  await writeFile(csvPath, `﻿${toCsv(rows)}`, 'utf8');
  await writeFile(jsonPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');

  return { csvPath, jsonPath };
}
