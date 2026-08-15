import { describe, expect, it } from 'vitest';
import { buildPolishChallenges } from './content';
import { facts, wordleWords, words } from './data/pl';
import { normalizeText } from './engine';
import { ui } from './ui';

describe('polski pakiet językowy', () => {
  it('zawiera dokładnie 10 000 poprawnych wyzwań we wszystkich formatach', () => {
    const challenges = buildPolishChallenges();
    expect(challenges).toHaveLength(10_000);
    expect(new Set(challenges.map(item=>item.id)).size).toBe(10_000);
    expect(new Set(challenges.map(item=>item.type)).size).toBe(8);
    expect(challenges.every(item=>item.id.startsWith('pl-'))).toBe(true);
    expect(challenges.some(item=>/[ąćęłńóśźż]/i.test(`${item.prompt} ${item.category}`))).toBe(true);
  });

  it('kontroluje pytania, słownictwo i pięcioliterowe hasła', () => {
    facts.forEach(([question,answer,wrongs,,difficulty,explanation])=>{
      expect(question.endsWith('?')).toBe(true);
      expect(new Set([answer,...wrongs].map(normalizeText)).size).toBe(4);
      expect(difficulty).toBeGreaterThanOrEqual(1);
      expect(explanation.length).toBeGreaterThan(18);
    });
    expect(new Set(words.map(([word])=>normalizeText(word))).size).toBe(words.length);
    wordleWords.forEach(([word,definition])=>{expect(normalizeText(word)).toMatch(/^[a-z]{5}$/);expect(definition.length).toBeGreaterThan(10);});
  });

  it('udostępnia pełny polski interfejs', () => {
    expect(ui.pl.gameLabels.wordle).toBe('Tajemnicze słowo');
    expect(ui.pl.rulesTitle).toBe('Jak grać?');
    expect(ui.pl.modeDescriptions.anagram).toContain('litery');
  });
});
