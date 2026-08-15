import { describe, expect, it } from 'vitest';
import { letterUsage } from './VirtualKeyboard';

describe('clavier intégré', () => {
  it('compte les lettres utilisées, y compris les doublons', () => {
    expect(letterUsage('BANANE')).toEqual({ B:1, A:2, N:2, E:1 });
  });
});
