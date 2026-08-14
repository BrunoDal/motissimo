export type GameType = 'mcq' | 'boolean' | 'odd' | 'order' | 'anagram' | 'missing' | 'clues' | 'letters';

export interface BaseChallenge {
  id: string;
  type: GameType;
  category: string;
  difficulty: number;
  prompt: string;
  explanation?: string;
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

export interface LettersChallenge extends BaseChallenge {
  type: 'letters';
  letters: string;
  accepted: string[];
  target: number;
}

export type Challenge = ChoiceChallenge | OrderChallenge | TextChallenge | CluesChallenge | LettersChallenge;

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
  bonusRound: boolean;
  startedAt: number;
  draftText?: string;
  draftOrder?: string[];
  draftWords?: string[];
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
}
