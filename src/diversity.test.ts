import { describe, expect, it } from 'vitest';
import { buildFrenchChallenges, buildPolishChallenges } from './content';
import { normalizeText, pickChallenge } from './engine';
import type { Challenge, GameType } from './types';

const gameTypes: GameType[] = ['mcq','boolean','odd','order','anagram','missing','clues','wordle'];

function uniqueSources(challenges: Challenge[]) {
  return new Set(challenges.map(item => item.sourceId ?? item.id));
}

describe('diversité bilingue', () => {
  it.each([
    ['français',buildFrenchChallenges()],
    ['polonais',buildPolishChallenges()]
  ])('dispose de centaines de sources réellement distinctes en %s', (_language,challenges) => {
    expect(challenges).toHaveLength(10_000);
    expect(uniqueSources(challenges).size).toBeGreaterThan(500);
    for (const type of gameTypes) {
      const sources = uniqueSources(challenges.filter(item => item.type === type));
      const minimum = type === 'order' ? 20 : type === 'odd' ? 25 : ['anagram','missing','clues'].includes(type) ? 60 : type === 'wordle' ? 80 : 250;
      expect(sources.size, `${type} en ${_language}`).toBeGreaterThanOrEqual(minimum);
    }
  });

  it.each([
    ['français',buildFrenchChallenges()],
    ['polonais',buildPolishChallenges()]
  ])('ne génère aucune réponse dupliquée en %s', (_language,challenges) => {
    for (const challenge of challenges) {
      if (!('choices' in challenge)) continue;
      expect(new Set(challenge.choices.map(normalizeText)).size, challenge.prompt).toBe(challenge.choices.length);
    }
  });

  it.each([
    ['français',buildFrenchChallenges()],
    ['polonais',buildPolishChallenges()]
  ])('conserve des mots mystère de cinq lettres en %s', (_language,challenges) => {
    for (const challenge of challenges.filter(item => item.type === 'wordle')) {
      expect(normalizeText(challenge.answer), challenge.answer).toMatch(/^[a-z]{5}$/);
    }
  });

  it('reprend la source la moins récemment vue après un cycle complet', () => {
    const unique = [...new Map(buildFrenchChallenges().filter(item => item.type === 'wordle').map(item => [item.sourceId,item])).values()].slice(0,3);
    const recent = unique.map(item => item.sourceId!);
    const selected = pickChallenge(unique,10,recent,undefined,false,'wordle');
    expect(selected.sourceId).toBe(recent[0]);
  });
});
