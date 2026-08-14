import { facts, oddSets, timelines, wordleWords, words } from './data/fr';
import type { Challenge, ChoiceChallenge } from './types';

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
  const candidates = chars.map((char, index) => /[a-zà-ÿ]/i.test(char) ? index : -1).filter(index => index >= 0);
  const count = Math.max(1, Math.min(3, Math.floor(candidates.length / 3)));
  shuffled(candidates, `${word}-${mode}`).slice(0, count).forEach(index => { chars[index] = '＿'; });
  return chars.join('');
}

function anagram(word: string, mode: number) {
  let value = shuffled([...word.toLocaleUpperCase('fr-FR')], `${word}-anagram-${mode}`).join('');
  if (value === word.toLocaleUpperCase('fr-FR')) value = value.slice(1) + value[0];
  return value;
}

export function buildFrenchChallenges(): Challenge[] {
  const challenges: Challenge[] = [];

  facts.forEach(([question, answer, wrongs, category, difficulty, explanation], index) => {
    challenges.push(choice(`fact-${index}-qcm`, 'mcq', category, difficulty, question, answer, wrongs, explanation));
    [answer, wrongs[0], wrongs[1]].forEach((proposal, variant) => {
      const correct = proposal === answer ? 'Vrai' : 'Faux';
      challenges.push(choice(
        `fact-${index}-vf-${variant}`, 'boolean', category, Math.min(5, difficulty + (variant ? 1 : 0)),
        `La réponse à « ${question} » est « ${proposal} ».`, correct, [correct === 'Vrai' ? 'Faux' : 'Vrai'], explanation
      ));
    });
  });

  oddSets.forEach(([category, items, difficulty], index) => {
    const answer = items[3];
    challenges.push(choice(`odd-${index}`, 'odd', category, difficulty, `Quel est l’intrus dans la catégorie « ${category} » ?`, answer, items.slice(0, 3), `${answer} n’appartient pas à la catégorie « ${category} ».`));
  });

  timelines.forEach(([prompt, answer, difficulty], index) => {
    challenges.push({ id: `order-${index}`, type: 'order', category: 'Chronologie', difficulty, prompt, items: shuffled(answer, `order-${index}`), answer, explanation: `Ordre correct : ${answer.join(' → ')}.` });
  });

  words.forEach(([word, definition, clue2, clue3, difficulty], index) => {
    for (let variant = 0; variant < 2; variant++) {
      challenges.push({ id: `word-${index}-anagram-${variant}`, type: 'anagram', category: 'Mots', difficulty: Math.min(5, difficulty + variant), prompt: 'Remets ces lettres dans le bon ordre.', display: anagram(word, variant), answer: word, explanation: `${word} : ${definition.toLocaleLowerCase('fr-FR')}.` });
    }
    challenges.push({ id: `word-${index}-missing`, type: 'missing', category: 'Mots', difficulty, prompt: 'Complète le mot.', display: blankWord(word, 0), answer: word, explanation: `${word} : ${definition.toLocaleLowerCase('fr-FR')}.` });
    challenges.push({ id: `word-${index}-clues-0`, type: 'clues', category: 'Vocabulaire', difficulty, prompt: 'Trouve le mot grâce aux indices.', answer: word, clues: [definition, clue2, clue3], explanation: `La réponse était « ${word} ».` });
    challenges.push({ id: `word-${index}-clues-1`, type: 'clues', category: 'Vocabulaire', difficulty: Math.min(5, difficulty + 1), prompt: 'Quel mot se cache derrière ces indices ?', answer: word, clues: [clue3, clue2, definition], explanation: `La réponse était « ${word} ».` });
  });

  wordleWords.forEach(([word, definition, difficulty], index) => {
    for (let variant = 0; variant < 3; variant++) {
      challenges.push({
        id: `wordle-${index}-${variant}`, type: 'wordle', category: 'Mot mystère', difficulty: Math.min(5, difficulty + variant),
        prompt: 'Trouve le mot mystère en six essais.', answer: word, maxAttempts: 6,
        explanation: `${word} : ${definition.toLocaleLowerCase('fr-FR')}.`
      });
    }
  });

  return challenges;
}

export const frenchChallenges = buildFrenchChallenges();
