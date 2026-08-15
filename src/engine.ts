import type { Challenge, GameType, MiniGameEngine } from './types';

export function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[’'\-\s]/g, '')
    .trim();
}

export function getLevel(successes: number): number {
  return Math.floor(successes / 10) + 1;
}

export function getTimeLimit(challenge: Challenge, level: number): number {
  const base = challenge.type === 'wordle' ? 55_000 : challenge.type === 'order' ? 28_000 : challenge.type === 'clues' ? 25_000 : 20_000;
  return Math.max(challenge.type === 'wordle' ? 32_000 : 9_000, base - (level - 1) * 850);
}

export type WordleMark = 'correct' | 'present' | 'absent';

export function evaluateWordleGuess(guessValue: string, answerValue: string): WordleMark[] {
  const guess = [...normalizeText(guessValue)];
  const answer = [...normalizeText(answerValue)];
  const marks: WordleMark[] = Array(guess.length).fill('absent');
  const remaining = new Map<string, number>();
  answer.forEach((letter, index) => {
    if (guess[index] === letter) marks[index] = 'correct';
    else remaining.set(letter, (remaining.get(letter) ?? 0) + 1);
  });
  guess.forEach((letter, index) => {
    if (marks[index] === 'correct') return;
    const count = remaining.get(letter) ?? 0;
    if (count > 0) { marks[index] = 'present'; remaining.set(letter, count - 1); }
  });
  return marks;
}

export function validateChallenge(challenge: Challenge, answer: unknown): boolean {
  if (challenge.type === 'mcq' || challenge.type === 'boolean' || challenge.type === 'odd') {
    return Number(answer) === challenge.correctIndex;
  }
  if (challenge.type === 'order') {
    return Array.isArray(answer) && answer.length === challenge.answer.length && answer.every((item, index) => item === challenge.answer[index]);
  }
  return 'answer' in challenge && normalizeText(String(answer ?? '')) === normalizeText(challenge.answer);
}

export function calculatePoints(level: number, remainingMs: number, totalMs: number, nextCombo: number, bonusRound = false): number {
  const base = 100 + Math.min(level - 1, 20) * 18;
  const speed = Math.round(100 * Math.max(0, Math.min(1, remainingMs / totalMs)));
  const multiplier = Math.min(3, 1 + Math.floor(nextCombo / 5) * 0.25);
  return Math.round((base + speed) * multiplier * (bonusRound ? 1.5 : 1));
}

function booleanAnswer(challenge: Challenge): boolean | undefined {
  if (challenge.type !== 'boolean') return undefined;
  const answer = normalizeText(challenge.choices[challenge.correctIndex]);
  if (answer === 'vrai' || answer === 'prawda') return true;
  if (answer === 'faux' || answer === 'falsz') return false;
  return undefined;
}

export function pickChallenge(all: Challenge[], level: number, recentIds: string[], previousType?: Challenge['type'], bonus = false, onlyType?: GameType, recentBooleanAnswers: boolean[] = []): Challenge {
  const targetDifficulty = Math.min(5, bonus ? Math.max(3, level) : Math.max(1, Math.ceil(level / 2)));
  const modePool = onlyType ? all.filter(item => item.type === onlyType) : all;
  let pool = modePool.filter(item => item.difficulty <= targetDifficulty && (!previousType || item.type !== previousType));
  if (bonus) pool = pool.filter(item => item.difficulty >= Math.min(3, targetDifficulty));
  if (!pool.length) pool = modePool.filter(item => item.difficulty <= targetDifficulty);
  if (!pool.length) pool = modePool;

  const recentTruth = recentBooleanAnswers.slice(-6);
  const lastTwoMatch = recentTruth.length >= 2 && recentTruth.at(-1) === recentTruth.at(-2);
  const trueCount = recentTruth.filter(Boolean).length;
  const desiredTruth = lastTwoMatch ? !recentTruth.at(-1)! : recentTruth.length >= 4 && Math.abs(trueCount - (recentTruth.length - trueCount)) >= 2 ? trueCount < recentTruth.length / 2 : undefined;
  if (desiredTruth !== undefined) {
    const balancedPool = pool.filter(item => item.type !== 'boolean' || booleanAnswer(item) === desiredTruth);
    if (balancedPool.length) pool = balancedPool;
  }

  const lastSeen = new Map<string, number>();
  recentIds.forEach((id,index) => lastSeen.set(id,index));
  const unseen = pool.filter(item => !lastSeen.has(item.sourceId ?? item.id));
  if (unseen.length) return unseen[Math.floor(Math.random() * unseen.length)];

  const oldestIndex = Math.min(...pool.map(item => lastSeen.get(item.sourceId ?? item.id) ?? -1));
  const leastRecentlySeen = pool.filter(item => (lastSeen.get(item.sourceId ?? item.id) ?? -1) === oldestIndex);
  return leastRecentlySeen[Math.floor(Math.random() * leastRecentlySeen.length)];
}

export { booleanAnswer };

export const miniGameEngines: MiniGameEngine[] = (['mcq','boolean','odd','order','anagram','missing','clues','wordle'] as const).map(type => ({
  type,
  validate: validateChallenge,
  timeLimit: level => Math.max(type === 'wordle' ? 32_000 : 9_000, (type === 'wordle' ? 55_000 : type === 'order' ? 28_000 : 20_000) - (level - 1) * 850)
}));
