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
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to save coordinators to localStorage', err);
  }
}

/**
 * Checks if coordinator branch matches the user selected branch.
 * Normalizes short names like "CSE", "CSE (AIML)", and full names like "Computer Science & Engineering (CSE)".
 */
export function isBranchMatch(coordBranch: string, selectedBranch: string): boolean {
  if (!coordBranch || !selectedBranch) return false;
  const c = coordBranch.trim().toLowerCase();
  const s = selectedBranch.trim().toLowerCase();
  if (c === s) return true;

  // Extract abbreviation inside parenthesis e.g. "CSE" from "Computer Science & Engineering (CSE)"
  const extractCode = (str: string) => {
    const match = str.match(/\(([^)]+)\)/);
    return match ? match[1].toLowerCase() : '';
  };

  const cCode = extractCode(c);
  const sCode = extractCode(s);

  if (cCode && sCode && cCode === sCode) return true;
  if (cCode && s.includes(cCode)) return true;
  if (sCode && c.includes(sCode)) return true;

  if (c.includes('computer science') && s.includes('cse')) return true;
  if (s.includes('computer science') && c.includes('cse')) return true;
  if ((c.includes('cse') || c.includes('computer')) && (s.includes('cse') || s.includes('computer'))) return true;
  if (c.includes('petroleum') && s.includes('petroleum')) return true;
  if (c.includes('chemical') && s.includes('chemical')) return true;
  if (c.includes('electronics') && (s.includes('electronics') || s.includes('ece'))) return true;
  if (s.includes('electronics') && (c.includes('electronics') || c.includes('ece'))) return true;
  if (c.includes('mechanical') && (s.includes('mechanical') || s.includes('me'))) return true;
  if (s.includes('mechanical') && (c.includes('mechanical') || c.includes('me'))) return true;
  if (c.includes('civil') && (s.includes('civil') || s.includes('ce'))) return true;
  if (s.includes('civil') && (c.includes('civil') || c.includes('ce'))) return true;
  if (c.includes('electrical') && (s.includes('electrical') || s.includes('ee'))) return true;
  if (s.includes('electrical') && (c.includes('electrical') || c.includes('ee'))) return true;
  if (c.includes('ai') && s.includes('ai')) return true;

  return false;
}
