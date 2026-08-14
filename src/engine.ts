import type { Challenge, MiniGameEngine } from './types';

export function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'\-\s]/g, '')
    .trim();
}

export function getLevel(successes: number): number {
  return Math.floor(successes / 10) + 1;
}

export function getTimeLimit(challenge: Challenge, level: number): number {
  const base = challenge.type === 'letters' ? 35_000 : challenge.type === 'order' ? 28_000 : challenge.type === 'clues' ? 25_000 : 20_000;
  return Math.max(challenge.type === 'letters' ? 20_000 : 9_000, base - (level - 1) * 850);
}

export function validateChallenge(challenge: Challenge, answer: unknown): boolean {
  if (challenge.type === 'mcq' || challenge.type === 'boolean' || challenge.type === 'odd') {
    return Number(answer) === challenge.correctIndex;
  }
  if (challenge.type === 'order') {
    return Array.isArray(answer) && answer.length === challenge.answer.length && answer.every((item, index) => item === challenge.answer[index]);
  }
  if (challenge.type === 'letters') {
    if (!Array.isArray(answer)) return false;
    const accepted = new Set(challenge.accepted.map(normalizeText));
    const unique = new Set(answer.map(item => normalizeText(String(item))).filter(item => accepted.has(item)));
    return unique.size >= challenge.target;
  }
  return 'answer' in challenge && normalizeText(String(answer ?? '')) === normalizeText(challenge.answer);
}

export function calculatePoints(level: number, remainingMs: number, totalMs: number, nextCombo: number, bonusRound = false): number {
  const base = 100 + Math.min(level - 1, 20) * 18;
  const speed = Math.round(100 * Math.max(0, Math.min(1, remainingMs / totalMs)));
  const multiplier = Math.min(3, 1 + Math.floor(nextCombo / 5) * 0.25);
  return Math.round((base + speed) * multiplier * (bonusRound ? 1.5 : 1));
}

export function pickChallenge(all: Challenge[], level: number, recentIds: string[], previousType?: Challenge['type'], bonus = false): Challenge {
  const targetDifficulty = Math.min(5, bonus ? Math.max(3, level) : Math.max(1, Math.ceil(level / 2)));
  let pool = all.filter(item => !recentIds.includes(item.id) && item.difficulty <= targetDifficulty && (!previousType || item.type !== previousType));
  if (bonus) pool = pool.filter(item => item.difficulty >= Math.min(3, targetDifficulty));
  if (!pool.length) pool = all.filter(item => !recentIds.includes(item.id));
  if (!pool.length) pool = all;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const miniGameEngines: MiniGameEngine[] = (['mcq','boolean','odd','order','anagram','missing','clues','letters'] as const).map(type => ({
  type,
  validate: validateChallenge,
  timeLimit: level => Math.max(type === 'letters' ? 20_000 : 9_000, (type === 'letters' ? 35_000 : type === 'order' ? 28_000 : 20_000) - (level - 1) * 850)
}));
