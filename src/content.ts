import * as fr from './data/fr';
import * as pl from './data/pl';
import { buildVarietyPack } from './data/variety';
import type { Challenge, ChoiceChallenge } from './types';
import type { Language } from './types';

type ContentCopy = {
  true: string; false: string; answerClaim: (question:string, proposal:string)=>string;
  oddPrompt: (category:string)=>string; oddExplanation: (answer:string, category:string)=>string;
  chronology: string; correctOrder: string; words: string; vocabulary: string; mystery: string;
  anagramPrompt: string; missingPrompt: string; cluesPrompt: string; cluesPromptAlt: string;
  answerWas: (answer:string)=>string; wordlePrompt: string;
};

const contentCopy: Record<Language, ContentCopy> = {
  fr: { true:'Vrai', false:'Faux', answerClaim:(q,p)=>`La réponse à « ${q} » est « ${p} ».`, oddPrompt:c=>`Quel est l’intrus dans la catégorie « ${c} » ?`, oddExplanation:(a,c)=>`${a} n’appartient pas à la catégorie « ${c} ».`, chronology:'Chronologie', correctOrder:'Ordre correct', words:'Mots', vocabulary:'Vocabulaire', mystery:'Mot mystère', anagramPrompt:'Remets ces lettres dans le bon ordre.', missingPrompt:'Complète le mot.', cluesPrompt:'Trouve le mot grâce aux indices.', cluesPromptAlt:'Quel mot se cache derrière ces indices ?', answerWas:a=>`La réponse était « ${a} ».`, wordlePrompt:'Trouve le mot mystère en six essais.' },
  pl: { true:'Prawda', false:'Fałsz', answerClaim:(q,p)=>`Odpowiedź na pytanie „${q}” to „${p}”.`, oddPrompt:c=>`Który element nie pasuje do kategorii „${c}”?`, oddExplanation:(a,c)=>`${a} nie należy do kategorii „${c}”.`, chronology:'Chronologia', correctOrder:'Poprawna kolejność', words:'Słowa', vocabulary:'Słownictwo', mystery:'Tajemnicze słowo', anagramPrompt:'Ułóż litery we właściwej kolejności.', missingPrompt:'Uzupełnij słowo.', cluesPrompt:'Odgadnij słowo dzięki wskazówkom.', cluesPromptAlt:'Jakie słowo kryje się za tymi wskazówkami?', answerWas:a=>`Poprawna odpowiedź to „${a}”.`, wordlePrompt:'Odgadnij tajemnicze słowo w sześciu próbach.' }
};

function hash(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

function shuffled<T>(items: T[], seed: string): T[] {
  const result = [...items];
  let state = hash(seed) || 1;
  for (let i = result.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function choice(id: string, type: 'mcq' | 'boolean' | 'odd', category: string, difficulty: number, prompt: string, answer: string, options: string[], explanation?: string): ChoiceChallenge {
  const choices = shuffled([answer, ...options], id);
  return { id, type, category, difficulty, prompt, choices, correctIndex: choices.indexOf(answer), explanation };
}

function blankWord(word: string, mode: number) {
  const chars = [...word];
  const candidates = chars.map((char, index) => /\p{L}/u.test(char) ? index : -1).filter(index => index >= 0);
  const count = Math.max(1, Math.min(3, Math.floor(candidates.length / 3)));
  shuffled(candidates, `${word}-${mode}`).slice(0, count).forEach(index => { chars[index] = '＿'; });
  return chars.join('');
}

function anagram(word: string, mode: number, locale = 'fr-FR') {
  let value = shuffled([...word.toLocaleUpperCase(locale)], `${word}-anagram-${mode}`).join('');
  if (value === word.toLocaleUpperCase(locale)) value = value.slice(1) + value[0];
  return value;
}

function sourceId(id: string) {
  return id.split('-').slice(0, 3).join('-');
}

function editionOf(challenge: Challenge, edition: number, locale: string): Challenge {
  const id = `${challenge.id}-e${edition}`;
  const source = sourceId(challenge.id);
  if (challenge.type === 'mcq' || challenge.type === 'boolean' || challenge.type === 'odd') {
    const answer = challenge.choices[challenge.correctIndex];
    const choices = shuffled(challenge.choices, id);
    return { ...challenge, id, sourceId:source, choices, correctIndex: choices.indexOf(answer) } as ChoiceChallenge;
  }
  if (challenge.type === 'order') return { ...challenge, id, sourceId:source, items:shuffled(challenge.answer, id) };
  if (challenge.type === 'anagram') return { ...challenge, id, sourceId:source, display:anagram(challenge.answer, edition, locale) };
  if (challenge.type === 'missing') return { ...challenge, id, sourceId:source, display:blankWord(challenge.answer, edition) };
  if (challenge.type === 'clues') return { ...challenge, id, sourceId:source, clues:shuffled(challenge.clues, id) };
  return { ...challenge, id, sourceId:source };
}

export function buildChallenges(language: Language, limit = 10_000): Challenge[] {
  const data = language === 'pl' ? pl : fr;
  const variety = buildVarietyPack(language);
  const copy = contentCopy[language];
  const locale = language === 'pl' ? 'pl-PL' : 'fr-FR';
  const baseChallenges: Challenge[] = [];

  const facts = [...data.facts, ...variety.facts].filter((fact, index, all) => all.findIndex(candidate => candidate[0].toLocaleLowerCase(locale) === fact[0].toLocaleLowerCase(locale)) === index);
  const words = [...data.words, ...variety.words].filter((word, index, all) => all.findIndex(candidate => candidate[0].toLocaleLowerCase(locale) === word[0].toLocaleLowerCase(locale)) === index);
  const wordleWords = [...data.wordleWords, ...variety.wordleWords].filter((word, index, all) => all.findIndex(candidate => candidate[0].toLocaleLowerCase(locale) === word[0].toLocaleLowerCase(locale)) === index);

  facts.forEach(([question, answer, wrongs, category, difficulty, explanation], index) => {
    baseChallenges.push(choice(`${language}-fact-${index}-qcm`, 'mcq', category, difficulty, question, answer, wrongs, explanation));
    [answer, wrongs[0], wrongs[1]].forEach((proposal, variant) => {
      const correct = proposal === answer ? copy.true : copy.false;
      baseChallenges.push(choice(
        `${language}-fact-${index}-vf-${variant}`, 'boolean', category, difficulty,
        copy.answerClaim(question, proposal), correct, [correct === copy.true ? copy.false : copy.true], explanation
      ));
    });
  });

  [...data.oddSets, ...variety.oddSets].forEach(([category, items, difficulty], index) => {
    const answer = items[3];
    baseChallenges.push(choice(`${language}-odd-${index}`, 'odd', category, difficulty, copy.oddPrompt(category), answer, items.slice(0, 3), copy.oddExplanation(answer, category)));
  });

  [...data.timelines, ...variety.timelines].forEach(([prompt, answer, difficulty], index) => {
    baseChallenges.push({ id: `${language}-order-${index}`, type: 'order', category: copy.chronology, difficulty, prompt, items: shuffled(answer, `${language}-order-${index}`), answer, explanation: `${copy.correctOrder}: ${answer.join(' → ')}.` });
  });

  words.forEach(([word, definition, clue2, clue3, difficulty], index) => {
    for (let variant = 0; variant < 2; variant++) {
      baseChallenges.push({ id: `${language}-word-${index}-anagram-${variant}`, type: 'anagram', category: copy.words, difficulty: Math.min(5, difficulty + variant), prompt: copy.anagramPrompt, display: anagram(word, variant, locale), answer: word, explanation: `${word}: ${definition.toLocaleLowerCase(locale)}.` });
    }
    baseChallenges.push({ id: `${language}-word-${index}-missing`, type: 'missing', category: copy.words, difficulty, prompt: copy.missingPrompt, display: blankWord(word, 0), answer: word, explanation: `${word}: ${definition.toLocaleLowerCase(locale)}.` });
    baseChallenges.push({ id: `${language}-word-${index}-clues-0`, type: 'clues', category: copy.vocabulary, difficulty, prompt: copy.cluesPrompt, answer: word, clues: [definition, clue2, clue3], explanation: copy.answerWas(word) });
    baseChallenges.push({ id: `${language}-word-${index}-clues-1`, type: 'clues', category: copy.vocabulary, difficulty: Math.min(5, difficulty + 1), prompt: copy.cluesPromptAlt, answer: word, clues: [clue3, clue2, definition], explanation: copy.answerWas(word) });
  });

  wordleWords.forEach(([word, definition, difficulty], index) => {
    for (let variant = 0; variant < 3; variant++) {
      baseChallenges.push({
        id: `${language}-wordle-${index}-${variant}`, type: 'wordle', category: copy.mystery, difficulty: Math.min(5, difficulty + variant),
        prompt: copy.wordlePrompt, answer: word, maxAttempts: 6,
        explanation: `${word}: ${definition.toLocaleLowerCase(locale)}.`
      });
    }
  });

  const challenges: Challenge[] = [];
  for (let edition = 0; challenges.length < limit; edition++) {
    for (const challenge of baseChallenges) {
      challenges.push(editionOf(challenge, edition, locale));
      if (challenges.length === limit) break;
    }
  }
  return challenges;
}

export const buildFrenchChallenges = (limit = 10_000) => buildChallenges('fr', limit);
export const buildPolishChallenges = (limit = 10_000) => buildChallenges('pl', limit);
export const frenchChallenges = buildFrenchChallenges();
export const polishChallenges = buildPolishChallenges();
export const challengesByLanguage: Record<Language, Challenge[]> = { fr:frenchChallenges, pl:polishChallenges };
