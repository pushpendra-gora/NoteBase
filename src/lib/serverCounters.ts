import { SupabaseClient } from '@supabase/supabase-js';

export interface MaterialCountsSnapshot {
  notes: number;
  pyqs: number;
  lectures: number;
  totalFiles: number;
  coordinators: number;
  openIssues: number;
  years: {
    '1st Year': number;
    '2nd Year': number;
    '3rd Year': number;
    '4th Year': number;
  };
  updatedAt: string;
}

const YEAR_KEYS = ['1st Year', '2nd Year', '3rd Year', '4th Year'] as const;

export function normalizeYearBucket(year?: string | null): keyof MaterialCountsSnapshot['years'] | null {
  if (!year) return null;
  const y = year.toLowerCase();
  if (y.includes('1st')) return '1st Year';
  if (y.includes('2nd')) return '2nd Year';
  if (y.includes('3rd')) return '3rd Year';
  if (y.includes('4th')) return '4th Year';
  return null;
}

function isValidSnapshot(raw: any): raw is MaterialCountsSnapshot {
  return Boolean(
    raw &&
      typeof raw === 'object' &&
      typeof raw.notes === 'number' &&
      typeof raw.pyqs === 'number' &&
      typeof raw.totalFiles === 'number' &&
      raw.years &&
      typeof raw.years === 'object'
  );
}

/**
 * Computes live counts using count-only (`head: true`) queries and saves them
 * inside `admin_credentials.material_counts` so subsequent Dashboard loads read just 1 column.
 */
export async function recomputeAndSaveMaterialCounts(
  client: SupabaseClient
): Promise<{ snapshot: MaterialCountsSnapshot; columnMissing: boolean; error?: string }> {
  const [notesTotal, pyqsTotal, lecsTotal, coordsTotal, openIssuesTotal, ...yearResults] =
    await Promise.all([
      client.from('notes').select('id', { count: 'exact', head: true }),
      client.from('pyqs').select('id', { count: 'exact', head: true }),
      client.from('lectures').select('id', { count: 'exact', head: true }),
      client.from('coordinators').select('id', { count: 'exact', head: true }),
      client.from('coordinator_issues').select('id', { count: 'exact', head: true }).eq('status', 'Open'),
      ...YEAR_KEYS.flatMap((yr) => [
        client.from('notes').select('id', { count: 'exact', head: true }).eq('year', yr),
        client.from('pyqs').select('id', { count: 'exact', head: true }).eq('year', yr),
        client.from('lectures').select('id', { count: 'exact', head: true }).eq('year', yr),
      ]),
    ]);

  const coreError = notesTotal.error || pyqsTotal.error || coordsTotal.error;
  const notes = notesTotal.count ?? 0;
  const pyqs = pyqsTotal.count ?? 0;
  const lectures = lecsTotal.count ?? 0;

  const years: MaterialCountsSnapshot['years'] = {
    '1st Year': 0,
    '2nd Year': 0,
    '3rd Year': 0,
    '4th Year': 0,
  };

  YEAR_KEYS.forEach((yr, idx) => {
    const n = yearResults[idx * 3]?.count ?? 0;
    const p = yearResults[idx * 3 + 1]?.count ?? 0;
    const l = yearResults[idx * 3 + 2]?.count ?? 0;
    years[yr] = n + p + l;
  });

  const snapshot: MaterialCountsSnapshot = {
    notes,
    pyqs,
    lectures,
    totalFiles: notes + pyqs + lectures,
    coordinators: coordsTotal.count ?? 0,
    openIssues: openIssuesTotal.error ? 0 : (openIssuesTotal.count ?? 0),
    years,
    updatedAt: new Date().toISOString(),
  };

  let columnMissing = false;
  try {
    const { error: saveErr } = await client
      .from('admin_credentials')
      .update({ material_counts: snapshot })
      .eq('id', 'admin');
    if (saveErr) {
      const msg = String(saveErr.message || '').toLowerCase();
      if (msg.includes('material_counts') || saveErr.code === '42703' || saveErr.code === 'PGRST204') {
        columnMissing = true;
      }
    }
  } catch {
    columnMissing = true;
  }

  return {
    snapshot,
    columnMissing,
    error: coreError ? coreError.message : undefined,
  };
}

/**
 * Reads ONLY the single `material_counts` column from `admin_credentials` (1 row, 0 table scans).
 * Automatically initializes or recomputes only when missing or explicitly requested.
 */
export async function readMaterialCounts(
  client: SupabaseClient,
  forceRecompute = false
): Promise<{
  snapshot: MaterialCountsSnapshot;
  fromCounterColumn: boolean;
  columnMissing: boolean;
  error?: string;
}> {
  if (!forceRecompute) {
    try {
      const { data, error } = await client
        .from('admin_credentials')
        .select('material_counts')
        .eq('id', 'admin')
        .limit(1)
        .maybeSingle();

      if (!error && isValidSnapshot(data?.material_counts)) {
        return {
          snapshot: data.material_counts,
          fromCounterColumn: true,
          columnMissing: false,
        };
      }
    } catch {
      // Fall through to one-time initialization
    }
  }

  const computed = await recomputeAndSaveMaterialCounts(client);
  return {
    snapshot: computed.snapshot,
    fromCounterColumn: !computed.columnMissing,
    columnMissing: computed.columnMissing,
    error: computed.error,
  };
}

/**
 * Incrementally updates `admin_credentials.material_counts` on upload, delete, coordinator, or issue change
 * so Dashboard stays accurate without ever re-scanning all tables.
 */
export async function adjustMaterialCounts(
  client: SupabaseClient | null,
  delta: {
    notes?: number;
    pyqs?: number;
    lectures?: number;
    coordinators?: number;
    openIssues?: number;
    year?: string | null;
    yearDelta?: number;
  }
): Promise<void> {
  if (!client) return;
  try {
    const { data, error } = await client
      .from('admin_credentials')
      .select('material_counts')
      .eq('id', 'admin')
      .limit(1)
      .maybeSingle();

    if (error) {
      // Column does not exist yet or unavailable — skip silently
      return;
    }

    if (!isValidSnapshot(data?.material_counts)) {
      await recomputeAndSaveMaterialCounts(client);
      return;
    }

    const curr = data.material_counts;
    const notes = Math.max(0, (curr.notes || 0) + (delta.notes || 0));
    const pyqs = Math.max(0, (curr.pyqs || 0) + (delta.pyqs || 0));
    const lectures = Math.max(0, (curr.lectures || 0) + (delta.lectures || 0));
    const coordinators = Math.max(0, (curr.coordinators || 0) + (delta.coordinators || 0));
    const openIssues = Math.max(0, (curr.openIssues || 0) + (delta.openIssues || 0));

    const years: MaterialCountsSnapshot['years'] = {
      '1st Year': curr.years?.['1st Year'] || 0,
      '2nd Year': curr.years?.['2nd Year'] || 0,
      '3rd Year': curr.years?.['3rd Year'] || 0,
      '4th Year': curr.years?.['4th Year'] || 0,
    };

    const bucket = normalizeYearBucket(delta.year);
    if (bucket && delta.yearDelta) {
      years[bucket] = Math.max(0, years[bucket] + delta.yearDelta);
    }

    const updated: MaterialCountsSnapshot = {
      notes,
      pyqs,
      lectures,
      totalFiles: notes + pyqs + lectures,
      coordinators,
      openIssues,
      years,
      updatedAt: new Date().toISOString(),
    };

    await client
      .from('admin_credentials')
      .update({ material_counts: updated })
      .eq('id', 'admin');
  } catch {
    // Non-fatal counter update
  }
}
