import { describe, expect, it } from 'vitest';
import { buildFrenchChallenges } from './content';
import { facts, oddSets, timelines, wordleWords, words } from './data/fr';
import { normalizeText, pickChallenge } from './engine';
import type { GameType } from './types';

const gameTypes: GameType[] = ['mcq','boolean','odd','order','anagram','missing','clues','wordle'];

describe('audit éditorial français', () => {
  it('garantit des fiches de culture générale cohérentes et sans doublons', () => {
    const questions = new Set<string>();
    for (const [question, answer, wrongs, , difficulty, explanation] of facts) {
      expect(question.trim().endsWith('?')).toBe(true);
      expect(questions.has(normalizeText(question))).toBe(false);
      questions.add(normalizeText(question));
      expect(new Set([answer, ...wrongs].map(normalizeText)).size).toBe(4);
      expect(difficulty).toBeGreaterThanOrEqual(1); expect(difficulty).toBeLessThanOrEqual(5);
      expect(explanation.length, `${question} — ${explanation}`).toBeGreaterThan(20);
    }
  });

  it('contrôle les intrus, chronologies et fiches lexicales', () => {
    oddSets.forEach(([,items,difficulty]) => { expect(new Set(items.map(normalizeText)).size).toBe(4); expect(difficulty).toBeGreaterThanOrEqual(1); });
    timelines.forEach(([,items,difficulty]) => { expect(items).toHaveLength(4); expect(new Set(items.map(normalizeText)).size).toBe(4); expect(difficulty).toBeLessThanOrEqual(5); });
    expect(new Set(words.map(([word])=>normalizeText(word))).size).toBe(words.length);
    words.forEach(([word,...fields]) => { expect(normalizeText(word).length).toBeGreaterThanOrEqual(4); fields.slice(0,3).forEach(value=>expect(String(value).length).toBeGreaterThan(8)); });
    expect(new Set(wordleWords.map(([word])=>normalizeText(word))).size).toBe(wordleWords.length);
    wordleWords.forEach(([word,definition]) => { expect(normalizeText(word)).toMatch(/^[a-z]{5}$/); expect(definition.length, `${word} — ${definition}`).toBeGreaterThan(12); });
  });

  it('construit 10 000 manches identifiables et valides', () => {
    const challenges = buildFrenchChallenges();
    expect(challenges).toHaveLength(10_000);
    expect(new Set(challenges.map(item=>item.id)).size).toBe(10_000);
    expect(challenges.every(item=>Boolean(item.sourceId) && item.difficulty >= 1 && item.difficulty <= 5)).toBe(true);
    gameTypes.forEach(type => expect(challenges.filter(item=>item.type===type).length).toBeGreaterThan(100));
    challenges.forEach(challenge => {
      if (challenge.type === 'mcq' || challenge.type === 'boolean' || challenge.type === 'odd') {
        expect(challenge.correctIndex).toBeGreaterThanOrEqual(0); expect(challenge.correctIndex).toBeLessThan(challenge.choices.length);
        expect(new Set(challenge.choices.map(normalizeText)).size).toBe(challenge.choices.length);
      }
    });
  });

  it('respecte chaque mode mono-jeu et l’anti-répétition par source', () => {
    const challenges = buildFrenchChallenges();
    gameTypes.forEach(type => expect(pickChallenge(challenges, 3, [], undefined, false, type).type).toBe(type));
    const first = pickChallenge(challenges, 3, []);
    const second = pickChallenge(challenges, 3, [first.sourceId!]);
    expect(second.sourceId).not.toBe(first.sourceId);
  });
});
