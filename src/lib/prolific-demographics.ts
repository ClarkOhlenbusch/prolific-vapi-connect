/**
 * Prolific export CSV → prolific_export_demographics.
 * Fixed mapping; adjust PROLIFIC_EXPORT_COLUMNS for future studies.
 */
import type { Json, TablesInsert } from '@/integrations/supabase/types';

export const MAX_PROLIFIC_IMPORT_ROWS = 10_000;

/** CSV header name (trimmed) → DB column. First match wins; "Participant id" required. */
export const PROLIFIC_EXPORT_COLUMNS: Record<string, string> = {
  'Participant id': 'prolific_id',
  'Age': 'age',
  'Gender': 'gender',
  'Sex': 'gender',
  'Ethnicity simplified': 'ethnicity_simplified',
  'Country of residence': 'country_of_residence',
  'Employment status': 'employment_status',
  'Language': 'language',
};

const FIXED_COLUMNS = new Set(['prolific_id', 'age', 'gender', 'ethnicity_simplified', 'country_of_residence', 'employment_status', 'language']);

export interface ProlificExportRow {
  prolific_id: string;
  age: number | null;
  gender: string | null;
  ethnicity_simplified: string | null;
  country_of_residence: string | null;
  employment_status: string | null;
  language: string | null;
  raw_columns: Record<string, unknown> | null;
}

/** Parse CSV text into rows (handles quoted fields). */
export function parseProlificCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];

    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        currentField += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && csvText[i + 1] === '\n') i++;
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.some(c => c.trim() !== '')) rows.push(currentRow);
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  currentRow.push(currentField);
  if (currentRow.some(c => c.trim() !== '')) rows.push(currentRow);
  return rows;
}

function trimHeader(h: string): string {
  return h.trim();
}

function parseAge(value: string): number | null {
  const s = value.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 120 ? Math.round(n) : null;
}

/** Map CSV rows (with header row) to ProlificExportRow[]. Valid prolific_id = 24 chars. */
export function mapProlificCSVToRows(rows: string[][]): { rows: ProlificExportRow[]; skipped: number; errors: string[] } {
  const errors: string[] = [];
  if (rows.length < 2) {
    return { rows: [], skipped: 0, errors: ['CSV must have a header row and at least one data row.'] };
  }

  const headers = rows[0].map(trimHeader);
  const headerToIndex = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = h;
    if (!headerToIndex.has(key)) headerToIndex.set(key, i);
  });

  // Resolve DB column → CSV column index (first matching header wins)
  const dbToIndex: Record<string, number> = {};
  for (const [csvHeader, dbCol] of Object.entries(PROLIFIC_EXPORT_COLUMNS)) {
    if (headerToIndex.has(csvHeader)) dbToIndex[dbCol] = headerToIndex.get(csvHeader)!;
  }

  const prolificIdIndex = dbToIndex['prolific_id'];
  if (prolificIdIndex === undefined) {
    return { rows: [], skipped: rows.length - 1, errors: ['CSV must contain a "Participant id" column.'] };
  }

  const result: ProlificExportRow[] = [];
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const prolificId = (cells[prolificIdIndex] ?? '').trim();
    if (prolificId.length !== 24) {
      skipped++;
      continue;
    }

    const raw: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const v = cells[i];
      if (v !== undefined && v !== null) raw[h] = v.trim();
    });

    const ageVal = dbToIndex['age'] !== undefined ? cells[dbToIndex['age']] : undefined;
    const age = parseAge(ageVal ?? '');

    const getText = (col: string): string | null => {
      const idx = dbToIndex[col];
      if (idx === undefined) return null;
      const v = (cells[idx] ?? '').trim();
      return v || null;
    };

    result.push({
      prolific_id: prolificId,
      age,
      gender: getText('gender'),
      ethnicity_simplified: getText('ethnicity_simplified'),
      country_of_residence: getText('country_of_residence'),
      employment_status: getText('employment_status'),
      language: getText('language'),
      raw_columns: Object.keys(raw).length > 0 ? raw : null,
    });
  }

  return { rows: result, skipped, errors };
}

/** Build DB insert/upsert row (with imported_at, imported_by). */
export function toDbRow(
  row: ProlificExportRow,
  importedBy: string | null
): TablesInsert<'prolific_export_demographics'> {
  return {
    prolific_id: row.prolific_id,
    age: row.age,
    gender: row.gender,
    ethnicity_simplified: row.ethnicity_simplified,
    country_of_residence: row.country_of_residence,
    employment_status: row.employment_status,
    language: row.language,
    raw_columns: (row.raw_columns ?? null) as Json | null,
    imported_at: new Date().toISOString(),
    imported_by: importedBy,
  };
}
