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
};

const azertyRows = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];

export function letterUsage(value: string) {
  return [...value].reduce<Record<string, number>>((counts, letter) => {
    counts[letter] = (counts[letter] ?? 0) + 1;
    return counts;
  }, {});
}

export default function VirtualKeyboard({ value, onLetter, onBackspace, onEnter, disabled = false, canSubmit = false, letters, marks = {} }: Props) {
  if (letters) {
    const usage = letterUsage(value.toLocaleUpperCase('fr-FR'));
    const occurrences: Record<string, number> = {};
    return <div className="virtual-keyboard letter-bank" aria-label="Lettres disponibles">
      <div className="letter-bank-keys">
        {letters.map((rawLetter, index) => {
          const letter = rawLetter.toLocaleUpperCase('fr-FR');
          const occurrence = occurrences[letter] ?? 0;
          occurrences[letter] = occurrence + 1;
          const used = occurrence < (usage[letter] ?? 0);
          return <button type="button" className="key letter-token" key={`${letter}-${index}`} disabled={disabled || used} onClick={() => onLetter(letter)} aria-label={`Ajouter ${letter}`}>{letter}</button>;
        })}
      </div>
      <div className="keyboard-actions"><button type="button" className="key action-key" onClick={onBackspace} disabled={disabled || !value} aria-label="Effacer une lettre">⌫</button><button type="button" className="key enter-key" onClick={onEnter} disabled={disabled || !canSubmit}>Valider</button></div>
    </div>;
  }

  return <div className="virtual-keyboard alphabet-keyboard" aria-label="Clavier de lettres">
    {azertyRows.map((row, rowIndex) => <div className="keyboard-row" key={row}>
      {rowIndex === 2 && <button type="button" className="key action-key" onClick={onBackspace} disabled={disabled} aria-label="Effacer une lettre">⌫</button>}
      {[...row].map(letter => <button type="button" className={`key ${marks[letter] ?? ''}`} key={letter} disabled={disabled} onClick={() => onLetter(letter)} aria-label={`Lettre ${letter}`}>{letter}</button>)}
      {rowIndex === 2 && <button type="button" className="key action-key enter-symbol" onClick={onEnter} disabled={disabled || !canSubmit} aria-label="Valider">✓</button>}
    </div>)}
  </div>;
}
