import type { Language } from './types';

export type LetterMark = 'correct' | 'present' | 'absent';

type Props = {
  value: string;
  onLetter: (letter: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  disabled?: boolean;
  canSubmit?: boolean;
  letters?: string[];
  marks?: Record<string, LetterMark>;
  language?: Language;
};

const keyboardRows: Record<Language,string[]> = {
  fr:['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'],
  pl:['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM', 'ĄĆĘŁŃÓŚŹŻ']
};

export function letterUsage(value: string) {
  return [...value].reduce<Record<string, number>>((counts, letter) => {
    counts[letter] = (counts[letter] ?? 0) + 1;
    return counts;
  }, {});
}

export default function VirtualKeyboard({ value, onLetter, onBackspace, onEnter, disabled = false, canSubmit = false, letters, marks = {}, language = 'fr' }: Props) {
  const labels = language === 'pl' ? { available:'Dostępne litery', add:'Dodaj', erase:'Usuń literę', validate:'Zatwierdź', keyboard:'Klawiatura liter', letter:'Litera' } : { available:'Lettres disponibles', add:'Ajouter', erase:'Effacer une lettre', validate:'Valider', keyboard:'Clavier de lettres', letter:'Lettre' };
  if (letters) {
    const locale = language === 'pl' ? 'pl-PL' : 'fr-FR';
    const usage = letterUsage(value.toLocaleUpperCase(locale));
    const occurrences: Record<string, number> = {};
    return <div className="virtual-keyboard letter-bank" aria-label={labels.available}>
      <div className="letter-bank-keys">
        {letters.map((rawLetter, index) => {
          const letter = rawLetter.toLocaleUpperCase(locale);
          const occurrence = occurrences[letter] ?? 0;
          occurrences[letter] = occurrence + 1;
          const used = occurrence < (usage[letter] ?? 0);
          return <button type="button" className="key letter-token" key={`${letter}-${index}`} disabled={disabled || used} onClick={() => onLetter(letter)} aria-label={`${labels.add} ${letter}`}>{letter}</button>;
        })}
      </div>
      <div className="keyboard-actions"><button type="button" className="key action-key" onClick={onBackspace} disabled={disabled || !value} aria-label={labels.erase}>⌫</button><button type="button" className="key enter-key" onClick={onEnter} disabled={disabled || !canSubmit}>{labels.validate}</button></div>
    </div>;
  }

  const rows = keyboardRows[language];
  return <div className={`virtual-keyboard alphabet-keyboard keyboard-${language}`} aria-label={labels.keyboard}>
    {rows.map((row, rowIndex) => <div className="keyboard-row" key={row}>
      {rowIndex === rows.length-1 && <button type="button" className="key action-key" onClick={onBackspace} disabled={disabled} aria-label={labels.erase}>⌫</button>}
      {[...row].map(letter => <button type="button" className={`key ${marks[letter] ?? ''}`} key={letter} disabled={disabled} onClick={() => onLetter(letter)} aria-label={`${labels.letter} ${letter}`}>{letter}</button>)}
      {rowIndex === rows.length-1 && <button type="button" className="key action-key enter-symbol" onClick={onEnter} disabled={disabled || !canSubmit} aria-label={labels.validate}>✓</button>}
    </div>)}
  </div>;
}
