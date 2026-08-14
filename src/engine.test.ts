import { describe, expect, it } from 'vitest';
import { buildFrenchChallenges } from './content';
import { calculatePoints, evaluateWordleGuess, getLevel, getTimeLimit, normalizeText, validateChallenge } from './engine';

describe('moteur Motissimo', () => {
  it('fournit exactement dix mille défis dans les huit formats', () => {
    const challenges = buildFrenchChallenges();
    expect(challenges.length).toBe(10_000);
    expect(new Set(challenges.map(c => c.type)).size).toBe(8);
    expect(new Set(challenges.map(c => c.id)).size).toBe(challenges.length);
    expect(challenges.filter(c => c.type === 'wordle').length).toBeGreaterThan(100);
  });

  it('normalise les accents, espaces et apostrophes', () => {
    expect(normalizeText(" L’Été-bleu ")).toBe('letebleu');
  });

  it('valide les choix, le texte, l’ordre et le mot mystère', () => {
    expect(validateChallenge({ id:'a', type:'mcq', category:'x', difficulty:1, prompt:'x', choices:['a','b'], correctIndex:1 }, 1)).toBe(true);
    expect(validateChallenge({ id:'b', type:'anagram', category:'x', difficulty:1, prompt:'x', answer:'écharpe' }, 'ECHARPE')).toBe(true);
    expect(validateChallenge({ id:'c', type:'order', category:'x', difficulty:1, prompt:'x', items:['b','a'], answer:['a','b'] }, ['a','b'])).toBe(true);
    expect(validateChallenge({ id:'d', type:'wordle', category:'x', difficulty:1, prompt:'x', answer:'école', maxAttempts:6 }, 'ECOLE')).toBe(true);
  });

  it('évalue correctement les lettres du mot mystère, y compris les doublons', () => {
    expect(evaluateWordleGuess('porte', 'pomme')).toEqual(['correct','correct','absent','absent','correct']);
    expect(evaluateWordleGuess('verre', 'reine')).toEqual(['absent','correct','present','absent','correct']);
  });

  it('augmente le niveau et garantit un temps minimum', () => {
    expect(getLevel(0)).toBe(1);
    expect(getLevel(29)).toBe(3);
    const challenge = buildFrenchChallenges()[0];
    expect(getTimeLimit(challenge, 99)).toBeGreaterThanOrEqual(9000);
  });

  it('récompense combo, vitesse et bonus', () => {
    const base = calculatePoints(1, 0, 20_000, 1);
    expect(calculatePoints(3, 15_000, 20_000, 10)).toBeGreaterThan(base);
    expect(calculatePoints(1, 0, 20_000, 1, true)).toBeGreaterThan(base);
  });
});
