import { 
  CoordinatorRecord, 
  fetchCoordinatorsFromSupabase, 
  insertCoordinatorToSupabase, 
  updateCoordinatorInSupabase, 
  deleteCoordinatorFromSupabase 
} from './supabaseService';
import { isSupabaseConfigured } from './supabase';

export const INITIAL_COORDINATORS: CoordinatorRecord[] = [];

const LOCAL_STORAGE_KEY = 'notehub_coordinators';

export function getStoredCoordinators(): CoordinatorRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveStoredCoordinators(list: CoordinatorRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    // Never persist coordinator passwords into browser localStorage
    const sanitized = list.map(({ password: _ignored, ...safe }) => safe);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitized));
  } catch (err) {
    console.error('Failed to save coordinators to localStorage', err);
  }
}

/**
 * Checks if coordinator branch matches the user selected branch.
 * Normalizes approved NoteBase branches without false cross-matching between distinct specializations (e.g. CSE vs CSE(AI&ML)).
 */
export function isBranchMatch(coordBranch: string, selectedBranch: string): boolean {
  if (!coordBranch || !selectedBranch) return false;
  const c = coordBranch.trim().toLowerCase().replace(/\s+/g, '');
  const s = selectedBranch.trim().toLowerCase().replace(/\s+/g, '');
  if (c === s) return true;

  const normalizeBranch = (str: string): string => {
    const raw = str.toLowerCase().replace(/[\s\-_()&]/g, '');
    if (raw.includes('aiml') || raw.includes('aiandml') || (raw.includes('ai') && raw.includes('ml'))) return 'cse_aiml';
    if (raw.includes('ds') || raw.includes('datascience')) return 'cse_ds';
    if (raw.includes('petroleum')) return 'petroleum';
    if (raw.includes('chemical')) return 'chemical';
    if (raw.includes('civil')) return 'civil';
    if (raw.includes('mechanical')) return 'mechanical';
    if (raw.includes('electrical')) return 'electrical';
    if (raw.includes('electronics') || raw.includes('ece') || raw.includes('communication')) return 'ece';
    if (raw.includes('abcd')) return 'group_abcd';
    if (raw.includes('efgh')) return 'group_efgh';
    if (raw === 'cse' || raw.includes('computerscience')) return 'cse_core';
    return raw;
  };

  return normalizeBranch(coordBranch) === normalizeBranch(selectedBranch);
}
