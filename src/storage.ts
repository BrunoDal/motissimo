import type { Preferences, RunState, Stats } from './types';

const RUN_KEY = 'motissimo-run-v2';
const STATS_KEY = 'motissimo-stats-v1';
const PREFS_KEY = 'motissimo-prefs-v1';

export const defaultStats: Stats = { bestScore: 0, gamesPlayed: 0, totalCorrect: 0, totalQuestions: 0, longestCombo: 0 };
export const defaultPreferences: Preferences = { sound: true, vibration: true, reducedMotion: false, highContrast: false };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}

export const loadRun = () => load<RunState | null>(RUN_KEY, null);
export const saveRun = (run: RunState | null) => run ? localStorage.setItem(RUN_KEY, JSON.stringify(run)) : localStorage.removeItem(RUN_KEY);
export const loadStats = () => load(STATS_KEY, defaultStats);
export const saveStats = (stats: Stats) => localStorage.setItem(STATS_KEY, JSON.stringify(stats));
export const loadPreferences = () => load(PREFS_KEY, defaultPreferences);
export const savePreferences = (prefs: Preferences) => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
