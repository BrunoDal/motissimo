export type GameType = 'mcq' | 'boolean' | 'odd' | 'order' | 'anagram' | 'missing' | 'clues' | 'wordle';
export type GameMode = 'mix' | GameType;
export type Language = 'fr' | 'pl';

export interface BaseChallenge {
  id: string;
  type: GameType;
  category: string;
  difficulty: number;
  prompt: string;
  explanation?: string;
  sourceId?: string;
}

export interface ChoiceChallenge extends BaseChallenge {
  type: 'mcq' | 'boolean' | 'odd';
  choices: string[];
  correctIndex: number;
}

export interface OrderChallenge extends BaseChallenge {
  type: 'order';
  items: string[];
  answer: string[];
}

export interface TextChallenge extends BaseChallenge {
  type: 'anagram' | 'missing';
  answer: string;
  display?: string;
}

export interface CluesChallenge extends BaseChallenge {
  type: 'clues';
  answer: string;
  clues: string[];
}

export interface WordleChallenge extends BaseChallenge {
  type: 'wordle';
  answer: string;
  maxAttempts: number;
}

export type Challenge = ChoiceChallenge | OrderChallenge | TextChallenge | CluesChallenge | WordleChallenge;

export interface MiniGameEngine<T extends Challenge = Challenge> {
  type: T['type'];
  validate(challenge: T, answer: unknown): boolean;
  timeLimit(level: number): number;
}

export interface RunState {
  score: number;
  lives: number;
  combo: number;
  successes: number;
  attempts: number;
  current: Challenge;
  remainingMs: number;
  recentIds: string[];
  recentBooleanAnswers?: boolean[];
  bonusRound: boolean;
  startedAt: number;
  mode: GameMode;
  language: Language;
  draftText?: string;
  draftOrder?: string[];
  draftGuesses?: string[];
  draftCluesShown?: number;
  draftHintPenalty?: number;
}

export interface Stats {
  bestScore: number;
  gamesPlayed: number;
  totalCorrect: number;
  totalQuestions: number;
  longestCombo: number;
}

export interface Preferences {
  sound: boolean;
  vibration: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  gameMode: GameMode;
  language: Language;
}
