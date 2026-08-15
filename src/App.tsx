import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { challengesByLanguage } from './content';
import { booleanAnswer, calculatePoints, evaluateWordleGuess, getLevel, getTimeLimit, normalizeText, pickChallenge, validateChallenge } from './engine';
import { defaultPreferences, defaultStats, loadPreferences, loadRun, loadStats, savePreferences, saveRun, saveStats } from './storage';
import type { Challenge, GameMode, GameType, Language, Preferences, RunState, Stats } from './types';
import VirtualKeyboard, { type LetterMark } from './VirtualKeyboard';
import { ui } from './ui';

type Screen = 'home' | 'game' | 'pause' | 'gameover' | 'rules' | 'settings' | 'modes';
type Feedback = { correct: boolean; points: number; message: string } | null;

const gameIcons: Record<GameType, string> = { mcq:'?', boolean:'✓', odd:'◈', order:'↕', anagram:'A', missing:'…', clues:'3', wordle:'W' };

function formatScore(score: number, locale = 'fr-FR') { return new Intl.NumberFormat(locale).format(score); }

function playTone(correct: boolean, enabled: boolean) {
  if (!enabled) return;
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(correct ? 520 : 180, context.currentTime);
    if (correct) oscillator.frequency.exponentialRampToValueAtTime(820, context.currentTime + .12);
    gain.gain.setValueAtTime(.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .22);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + .23);
    oscillator.onended = () => void context.close();
  } catch { /* Audio is an optional enhancement. */ }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [run, setRun] = useState<RunState | null>(() => loadRun());
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences());
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [answer, setAnswer] = useState('');
  const [ordered, setOrdered] = useState<string[]>([]);
  const [wordleGuesses, setWordleGuesses] = useState<string[]>([]);
  const [wordleError, setWordleError] = useState('');
  const [cluesShown, setCluesShown] = useState(1);
  const [hintPenalty, setHintPenalty] = useState(0);
  const [lastScore, setLastScore] = useState(0);
  const runRef = useRef(run);
  const feedbackRef = useRef(feedback);
  const displayLanguage: Language = run && (screen === 'game' || screen === 'pause') ? run.language : prefs.language;
  const copy = ui[displayLanguage];
  const gameLabels = copy.gameLabels;
  const modeDescriptions = copy.modeDescriptions;

  useEffect(() => { runRef.current = run; }, [run]);
  useEffect(() => { feedbackRef.current = feedback; }, [feedback]);
  useEffect(() => { document.documentElement.lang = displayLanguage; }, [displayLanguage]);
  useEffect(() => { savePreferences(prefs); }, [prefs]);
  useEffect(() => { saveStats(stats); }, [stats]);
  useEffect(() => {
    const id = window.setTimeout(() => saveRun(run), 350);
    return () => window.clearTimeout(id);
  }, [run]);

  const prepareChallenge = useCallback((challenge: Challenge, saved?: RunState, language:Language = 'fr') => {
    const locale = ui[language].locale;
    const firstLetter = challenge.type === 'wordle' ? [...challenge.answer.toLocaleLowerCase(locale)][0] : '';
    setAnswer(saved?.draftText || firstLetter); setWordleGuesses(saved?.draftGuesses ?? []); setWordleError(''); setCluesShown(saved?.draftCluesShown ?? 1); setHintPenalty(saved?.draftHintPenalty ?? 0); setFeedback(null);
    if (challenge.type === 'order') setOrdered(saved?.draftOrder ?? [...challenge.items]); else setOrdered([]);
  }, []);

  const startNew = useCallback(() => {
    const onlyType = prefs.gameMode === 'mix' ? undefined : prefs.gameMode;
    const current = pickChallenge(challengesByLanguage[prefs.language], 1, [], undefined, false, onlyType);
    const firstBooleanAnswer = booleanAnswer(current);
    const next: RunState = { score: 0, lives: 3, combo: 0, successes: 0, attempts: 0, current, remainingMs: getTimeLimit(current, 1), recentIds: [current.sourceId ?? current.id], recentBooleanAnswers:firstBooleanAnswer === undefined ? [] : [firstBooleanAnswer], bonusRound: false, startedAt: Date.now(), mode:prefs.gameMode, language:prefs.language };
    setRun(next); prepareChallenge(current, undefined, prefs.language); setScreen('game');
  }, [prepareChallenge, prefs.gameMode, prefs.language]);

  const resume = useCallback(() => {
    if (!run) return;
    prepareChallenge(run.current, run, run.language); setScreen('game');
  }, [run, prepareChallenge]);

  const finishGame = useCallback((finalScore: number) => {
    setLastScore(finalScore);
    setStats(old => ({ ...old, bestScore: Math.max(old.bestScore, finalScore), gamesPlayed: old.gamesPlayed + 1 }));
    setRun(null); saveRun(null); setScreen('gameover');
  }, []);

  const moveNext = useCallback((state: RunState, wasCorrect: boolean) => {
    if (!wasCorrect && state.lives <= 0) { finishGame(state.score); return; }
    const shouldBonus = wasCorrect && state.combo > 0 && state.combo % 25 === 0 && state.lives < 3;
    const level = getLevel(state.successes);
    const onlyType = state.mode === 'mix' ? undefined : state.mode;
    const current = pickChallenge(challengesByLanguage[state.language], level, state.recentIds, state.mode === 'mix' ? state.current.type : undefined, shouldBonus, onlyType, state.recentBooleanAnswers);
    const currentBooleanAnswer = booleanAnswer(current);
    const recentBooleanAnswers = currentBooleanAnswer === undefined ? (state.recentBooleanAnswers ?? []) : [...(state.recentBooleanAnswers ?? []),currentBooleanAnswer].slice(-12);
    const next = { ...state, current, recentBooleanAnswers, bonusRound: shouldBonus, remainingMs: getTimeLimit(current, level), recentIds: [...state.recentIds, current.sourceId ?? current.id].slice(-600), draftText: '', draftOrder: current.type === 'order' ? [...current.items] : [], draftGuesses: [], draftCluesShown: 1, draftHintPenalty: 0 };
    prepareChallenge(current, undefined, state.language); setRun(next);
  }, [finishGame, prepareChallenge]);

  const resolveAnswer = useCallback((isCorrect: boolean) => {
    const currentRun = runRef.current;
    if (!currentRun || feedbackRef.current) return;
    const level = getLevel(currentRun.successes);
    const totalMs = getTimeLimit(currentRun.current, level);
    const nextCombo = isCorrect ? currentRun.combo + 1 : 0;
    const points = isCorrect ? Math.max(10, calculatePoints(level, currentRun.remainingMs, totalMs, nextCombo, currentRun.bonusRound) - hintPenalty) : 0;
    const lives = isCorrect && currentRun.bonusRound ? Math.min(3, currentRun.lives + 1) : isCorrect ? currentRun.lives : currentRun.lives - 1;
    const updated: RunState = {
      ...currentRun, score: currentRun.score + points, lives, combo: nextCombo,
      successes: currentRun.successes + (isCorrect ? 1 : 0), attempts: currentRun.attempts + 1, remainingMs: Math.max(0, currentRun.remainingMs)
    };
    const runCopy = ui[currentRun.language];
    const message = isCorrect
      ? currentRun.bonusRound && lives > currentRun.lives ? runCopy.lifeBack : nextCombo > 0 && nextCombo % 5 === 0 ? runCopy.combo(Math.min(3, 1 + Math.floor(nextCombo / 5) * .25)) : runCopy.wellDone
      : currentRun.remainingMs <= 0 ? runCopy.timeUp : runCopy.wrong;
    setFeedback({ correct: isCorrect, points, message });
    playTone(isCorrect, prefs.sound);
    if (prefs.vibration && navigator.vibrate) navigator.vibrate(isCorrect ? 35 : [60, 40, 80]);
    setStats(old => ({ ...old, totalCorrect: old.totalCorrect + (isCorrect ? 1 : 0), totalQuestions: old.totalQuestions + 1, longestCombo: Math.max(old.longestCombo, nextCombo) }));
    setRun(updated);
    window.setTimeout(() => { setFeedback(null); moveNext(updated, isCorrect); }, 1450);
  }, [hintPenalty, moveNext, prefs.sound, prefs.vibration]);

  useEffect(() => {
    if (screen !== 'game' || feedback || !run) return;
    const id = window.setInterval(() => setRun(old => old ? { ...old, remainingMs: Math.max(0, old.remainingMs - 100) } : old), 100);
    return () => window.clearInterval(id);
  }, [screen, feedback, run?.current.id]);

  useEffect(() => {
    if (screen === 'game' && run && run.remainingMs <= 0 && !feedback) resolveAnswer(false);
  }, [screen, run?.remainingMs, feedback, resolveAnswer]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && screen === 'game' && !feedbackRef.current) {
        saveRun(runRef.current); setScreen('pause');
      }
    };
    const onBeforeUnload = () => saveRun(runRef.current);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('beforeunload', onBeforeUnload); };
  }, [screen]);

  useEffect(() => {
    if (!run) return;
    setRun(old => old && old.current.id === run.current.id ? { ...old, draftText: answer, draftOrder: ordered, draftGuesses: wordleGuesses, draftCluesShown: cluesShown, draftHintPenalty: hintPenalty } : old);
  }, [answer, ordered, wordleGuesses, cluesShown, hintPenalty, run?.current.id]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!run || feedback) return;
    const value: unknown = run.current.type === 'order' ? ordered : answer;
    resolveAnswer(validateChallenge(run.current, value));
  };

  const selectChoice = (index: number) => {
    if (!run || feedback) return;
    resolveAnswer(validateChallenge(run.current, index));
  };

  const submitWordle = (event?: FormEvent) => {
    event?.preventDefault();
    if (!run || run.current.type !== 'wordle' || feedback) return;
    const runCopy = ui[run.language];
    const locale = runCopy.locale;
    const guess = normalizeText(answer);
    const target = normalizeText(run.current.answer);
    if (!/^[a-z]+$/.test(guess) || guess.length !== target.length) {
      setWordleError(runCopy.enterWord(target.length)); return;
    }
    if (guess[0] !== target[0]) { setWordleError(runCopy.mustStart([...run.current.answer.toLocaleUpperCase(locale)][0])); return; }
    if (wordleGuesses.some(item=>normalizeText(item)===guess)) { setWordleError(runCopy.alreadyUsed); return; }
    const submitted = answer.toLocaleLowerCase(locale);
    const nextGuesses = [...wordleGuesses, submitted];
    setWordleGuesses(nextGuesses); setAnswer([...run.current.answer.toLocaleLowerCase(locale)][0]);
    if (guess === target) resolveAnswer(true);
    else if (nextGuesses.length >= run.current.maxAttempts) resolveAnswer(false);
    else {
      setWordleError(runCopy.attemptsLeft(run.current.maxAttempts-nextGuesses.length));
      if (prefs.vibration && navigator.vibrate) navigator.vibrate(18);
    }
  };

  const appendLetter = useCallback((rawLetter: string) => {
    if (!run || feedback) return;
    const challenge = run.current;
    if (challenge.type !== 'anagram' && challenge.type !== 'missing' && challenge.type !== 'clues' && challenge.type !== 'wordle') return;
    const locale = ui[run.language].locale;
    const letter = rawLetter.toLocaleLowerCase(locale);
    const normalizedLetter = normalizeText(letter).slice(0, 1);
    if (!normalizedLetter) return;
    const maxLength = normalizeText(challenge.answer).length;
    setAnswer(current => {
      const normalized = normalizeText(current);
      if (normalized.length >= maxLength) return current;
      if (challenge.type === 'anagram') {
        const available = normalizeText(challenge.display ?? challenge.answer);
        const usedCount = [...normalized].filter(item => item === normalizedLetter).length;
        const availableCount = [...available].filter(item => item === normalizedLetter).length;
        if (usedCount >= availableCount) return current;
      }
      return current + letter;
    });
    setWordleError('');
  }, [run?.current, feedback]);

  const eraseLetter = useCallback(() => {
    if (!run || feedback) return;
    const protectedLength = run.current.type === 'wordle' ? 1 : 0;
    setAnswer(current => [...current].slice(0, Math.max(protectedLength, [...current].length - 1)).join(''));
    setWordleError('');
  }, [run?.current, feedback]);

  useEffect(() => {
    if (screen !== 'game' || !run || !['anagram','missing','clues','wordle'].includes(run.current.type)) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Backspace') { event.preventDefault(); eraseLetter(); return; }
      if (event.key === 'Enter') { event.preventDefault(); if (run.current.type === 'wordle') submitWordle(); else if (answer.trim()) submit(); return; }
      if (/^[a-zA-ZÀ-ÿ]$/.test(event.key)) { event.preventDefault(); appendLetter(event.key); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const level = run ? getLevel(run.successes) : 1;
  const totalTime = run ? getTimeLimit(run.current, level) : 1;
  const progress = run ? Math.max(0, Math.min(100, run.remainingMs / totalTime * 100)) : 0;
  const record = Math.max(stats.bestScore, run?.score ?? 0);
  const accuracy = stats.totalQuestions ? Math.round(stats.totalCorrect / stats.totalQuestions * 100) : 0;
  const appClass = [prefs.reducedMotion ? 'reduced-motion' : '', prefs.highContrast ? 'high-contrast' : '', `lang-${displayLanguage}`].join(' ');

  const gameCard = useMemo(() => {
    if (!run) return null;
    const challenge = run.current;
    if (challenge.type === 'mcq' || challenge.type === 'boolean' || challenge.type === 'odd') {
      return <div className="choices">{challenge.choices.map((item, index) => <button className="choice" key={item} onClick={() => selectChoice(index)} disabled={!!feedback}><span>{String.fromCharCode(65 + index)}</span>{item}</button>)}</div>;
    }
    if (challenge.type === 'order') {
      return <><p className="microcopy">{copy.oldestFirst}</p><div className="order-list">{ordered.map((item, index) => <div className="order-item" key={item}><b>{index + 1}</b><span>{item}</span><div><button aria-label={`↑ ${item}`} disabled={index === 0 || !!feedback} onClick={() => setOrdered(list => { const items=[...list]; [items[index-1],items[index]]=[items[index],items[index-1]]; return items; })}>↑</button><button aria-label={`↓ ${item}`} disabled={index === ordered.length-1 || !!feedback} onClick={() => setOrdered(list => { const items=[...list]; [items[index+1],items[index]]=[items[index],items[index+1]]; return items; })}>↓</button></div></div>)}</div><button className="primary full" onClick={() => submit()} disabled={!!feedback}>{copy.validateOrder}</button></>;
    }
    if (challenge.type === 'wordle') {
      const targetLength = normalizeText(challenge.answer).length;
      const firstLetter = [...challenge.answer.toLocaleUpperCase(copy.locale)][0];
      const markPriority: Record<LetterMark, number> = { absent:1, present:2, correct:3 };
      const keyboardMarks = wordleGuesses.reduce<Record<string, LetterMark>>((result, guess) => {
        evaluateWordleGuess(guess, challenge.answer).forEach((mark, index) => {
          const letter = [...guess.toLocaleUpperCase(copy.locale)][index];
          if (letter && (!result[letter] || markPriority[mark] > markPriority[result[letter]])) result[letter] = mark;
        });
        return result;
      }, { [firstLetter]:'correct' });
      return <form className="wordle-game" onSubmit={submitWordle}>
        <div className="wordle-first-letter"><span>{firstLetter}</span> {copy.firstLetter}</div>
        <div className="wordle-board" aria-label={copy.attempts(wordleGuesses.length,challenge.maxAttempts)}>
          {Array.from({length:challenge.maxAttempts},(_,rowIndex)=>{
            const completed = wordleGuesses[rowIndex];
            const displayed = completed ?? (rowIndex===wordleGuesses.length ? answer : '');
            const marks = completed ? evaluateWordleGuess(completed, challenge.answer) : [];
            const active = rowIndex === wordleGuesses.length;
            return <div className={`wordle-row ${completed?'revealed':''} ${active?'active':''}`} key={rowIndex}>{Array.from({length:targetLength},(_,letterIndex)=>{const given=!completed&&letterIndex===0;const letter=[...displayed.toLocaleUpperCase(copy.locale)][letterIndex]??(given?firstLetter:'');return <span className={`wordle-tile ${marks[letterIndex]??(given?'given':letter?'filled':'')}`} style={{animationDelay:`${letterIndex*70}ms`}} key={letterIndex}>{letter}</span>;})}</div>;
          })}
        </div>
        <div className="wordle-help" aria-live="polite">{wordleError||copy.wordleHelp}</div>
        <VirtualKeyboard language={run.language} value={answer} onLetter={appendLetter} onBackspace={eraseLetter} onEnter={()=>submitWordle()} canSubmit={normalizeText(answer).length===targetLength} disabled={!!feedback} marks={keyboardMarks}/>
      </form>;
    }
    const bankLetters = challenge.type === 'anagram' ? [...(challenge.display ?? challenge.answer).toLocaleUpperCase(copy.locale)] : undefined;
    return <form className="text-game" onSubmit={submit}>{(challenge.type === 'anagram' || challenge.type === 'missing') && <div className="word-display">{challenge.display}</div>}{challenge.type === 'clues' && <div className="clues">{challenge.clues.slice(0,cluesShown).map((clue,index)=><div key={clue}><span>{index+1}</span>{clue}</div>)}{cluesShown < 3 && <button type="button" className="hint" onClick={()=>{setCluesShown(n=>n+1);setHintPenalty(n=>n+35);}}>{copy.showHint} <small>{copy.hintCost}</small></button>}</div>}<div className={`answer-display ${answer?'':'empty'}`} role="textbox" aria-label={copy.yourAnswer} aria-live="polite">{answer ? answer.toLocaleUpperCase(copy.locale) : copy.yourAnswer}</div><VirtualKeyboard language={run.language} value={answer} onLetter={appendLetter} onBackspace={eraseLetter} onEnter={()=>submit()} canSubmit={!!answer.trim()} disabled={!!feedback} letters={bankLetters}/></form>;
  // Dependencies intentionally include transient answer state used by all game renderers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.current, run?.language, ordered, wordleGuesses, wordleError, answer, cluesShown, feedback, appendLetter, eraseLetter, copy]);

  return <div className={`app ${appClass}`}>
    {screen === 'home' && <main className="home screen">
      <div className="home-top"><div className="brand-mark">M</div><div className="home-tools"><button className="language-switch" onClick={()=>setPrefs(p=>({...p,language:p.language==='fr'?'pl':'fr'}))} aria-label={prefs.language==='fr'?'Przełącz na polski':'Passer en français'}><span className={prefs.language==='fr'?'active':''}>FR</span><span className={prefs.language==='pl'?'active':''}>PL</span></button><button className="icon-button" onClick={()=>setScreen('settings')} aria-label={copy.settings}>⚙</button></div></div>
      <section className="hero"><span className="eyebrow">{copy.heroTag}</span><h1>Motissimo</h1><p>{copy.heroLine1}<br/>{copy.heroLine2}</p><div className="hero-orbit orbit-one">?</div><div className="hero-orbit orbit-two">A</div></section>
      <section className="home-actions">
        <button className="mode-picker" onClick={()=>setScreen('modes')}><span>{prefs.gameMode==='mix'?'✦':gameIcons[prefs.gameMode]}</span><div><small>{copy.gameMode}</small><b>{prefs.gameMode==='mix'?copy.mix:gameLabels[prefs.gameMode]}</b></div><i>{copy.change}</i></button>
        {run ? <><button className="primary huge" onClick={resume}>{copy.resume} <small>{copy.pointsLives(formatScore(run.score,copy.locale),run.lives)}</small></button><button className="secondary" onClick={startNew}>{copy.newGame}</button></> : <button className="primary huge" onClick={startNew}>{copy.play} <small>{copy.livesChallenge}</small></button>}
      </section>
      <section className="stats-grid"><div><span>🏆</span><b>{formatScore(record,copy.locale)}</b><small>{copy.bestScore}</small></div><div><span>🔥</span><b>{stats.longestCombo}</b><small>{copy.bestCombo}</small></div><div><span>🎯</span><b>{accuracy}%</b><small>{copy.accuracy}</small></div></section>
      <button className="text-button" onClick={()=>setScreen('rules')}>{copy.howTo}</button>
    </main>}

    {screen === 'game' && run && <main className={`game screen ${['anagram','missing','clues','wordle'].includes(run.current.type)?'virtual-input-game':''} ${feedback?.correct?'answer-correct':feedback?'answer-wrong':''}`}>
      <div className="game-atmosphere" aria-hidden="true"><i/><i/><i/><i/><i/></div>
      <header className="game-header"><button className="icon-button light" onClick={()=>setScreen('pause')} aria-label={copy.pause}>Ⅱ</button><div className={`score ${feedback?.correct?'score-pop':''}`}><small>{copy.score}</small><strong>{formatScore(run.score,copy.locale)}</strong></div><div className="lives" aria-label={copy.lives(run.lives)}>{[0,1,2].map(i=><span key={i} className={`${i<run.lives?'alive':''} ${feedback && !feedback.correct && i===run.lives?'just-lost':''} ${feedback?.correct && run.bonusRound && i===run.lives-1?'just-gained':''}`}>♥</span>)}</div></header>
      <div className="timer-track"><div style={{width:`${progress}%`}} className={progress<25?'danger':''}/></div>
      <section className="game-meta"><span>{copy.level(level)}</span><b>{run.bonusRound?copy.bonus:gameLabels[run.current.type]}</b><span className={run.combo>0?'combo-live':''}>🔥 {run.combo}</span></section>
      <section className={`challenge-card challenge-${run.current.type}`} data-game-type={run.current.type} key={run.current.id}><span className="category">{run.current.category} · {copy.difficulty(run.current.difficulty)}</span><h2>{run.current.prompt}</h2><div className="challenge-body">{gameCard}</div></section>
      <footer className="game-footer"><span>{copy.record} {formatScore(record,copy.locale)}</span><span>{Math.ceil(run.remainingMs/1000)} s</span></footer>
      {feedback && <div className={`feedback ${feedback.correct?'correct':'wrong'}`} role="status" aria-live="assertive"><div className="feedback-symbol">{feedback.correct?'✓':'×'}</div>{!feedback.correct && <div className="life-loss"><span>♥</span><b>{copy.lifeLost}</b><i/><i/><i/></div>}<h3>{feedback.message}</h3>{feedback.correct?<strong>+{formatScore(feedback.points,copy.locale)} {copy.points}</strong>:<p>{run.current.explanation}</p>}</div>}
    </main>}

    {screen === 'pause' && run && <main className="modal-screen screen"><div className="modal-icon">Ⅱ</div><h1>{copy.paused}</h1><p>{copy.pausedText.split('\n').map((line,index)=><span key={line}>{index>0&&<br/>}{line}</span>)}</p><button className="primary huge" onClick={resume}>{copy.continue}</button><button className="secondary" onClick={()=>setScreen('home')}>{copy.home}</button></main>}

    {screen === 'gameover' && <main className="modal-screen gameover screen"><div className="modal-icon">🏁</div><span className="eyebrow">{copy.gameOver}</span><h1>{formatScore(lastScore,copy.locale)}</h1><p>{copy.points}</p>{lastScore >= stats.bestScore && lastScore > 0 && <div className="new-record">{copy.newRecord}</div>}<button className="primary huge" onClick={startNew}>{copy.replay}</button><button className="secondary" onClick={()=>setScreen('home')}>{copy.home}</button></main>}

    {screen === 'rules' && <main className="info-screen screen"><header><button className="icon-button" onClick={()=>setScreen('home')}>←</button><h1>{copy.rulesTitle}</h1></header><div className="rule"><b>1</b><div><h2>{copy.rule1Title}</h2><p>{copy.rule1Text}</p></div></div><div className="rule"><b>2</b><div><h2>{copy.rule2Title}</h2><p>{copy.rule2Text}</p></div></div><div className="rule"><b>3</b><div><h2>{copy.rule3Title}</h2><p>{copy.rule3Text}</p></div></div><div className="rule"><b>4</b><div><h2>{copy.rule4Title}</h2><p>{copy.rule4Text}</p></div></div><div className="offline-note">☁︎ <strong>{copy.offline}</strong><br/><span>{copy.offlineText}</span></div></main>}

    {screen === 'settings' && <main className="info-screen screen"><header><button className="icon-button" onClick={()=>setScreen('home')}>←</button><h1>{copy.settings}</h1></header><SettingsRow icon="♪" title={copy.sound} detail={copy.soundText} checked={prefs.sound} onChange={sound=>setPrefs(p=>({...p,sound}))}/><SettingsRow icon="⌁" title={copy.vibrations} detail={copy.vibrationsText} checked={prefs.vibration} onChange={vibration=>setPrefs(p=>({...p,vibration}))}/><SettingsRow icon="◌" title={copy.reduceMotion} detail={copy.reduceMotionText} checked={prefs.reducedMotion} onChange={reducedMotion=>setPrefs(p=>({...p,reducedMotion}))}/><SettingsRow icon="◐" title={copy.contrast} detail={copy.contrastText} checked={prefs.highContrast} onChange={highContrast=>setPrefs(p=>({...p,highContrast}))}/><div className="offline-note">{copy.localData}</div></main>}
    {screen === 'modes' && <main className="info-screen modes-screen screen"><header><button className="icon-button" onClick={()=>setScreen('home')}>←</button><div><span className="eyebrow">{copy.chooseModeTag}</span><h1>{copy.chooseMode}</h1></div></header><button className={`mode-card mix-mode ${prefs.gameMode==='mix'?'selected':''}`} onClick={()=>{setPrefs(p=>({...p,gameMode:'mix'}));setScreen('home');}}><span>✦</span><div><b>{copy.mix}</b><small>{copy.mixDescription}</small></div><i>{prefs.gameMode==='mix'?'✓':'›'}</i></button><div className="mode-list">{(Object.keys(gameLabels) as GameType[]).map(type=><button className={`mode-card ${prefs.gameMode===type?'selected':''}`} key={type} onClick={()=>{setPrefs(p=>({...p,gameMode:type as GameMode}));setScreen('home');}}><span>{gameIcons[type]}</span><div><b>{gameLabels[type]}</b><small>{modeDescriptions[type]}</small></div><i>{prefs.gameMode===type?'✓':'›'}</i></button>)}</div></main>}
  </div>;
}

function SettingsRow({icon,title,detail,checked,onChange}:{icon:string,title:string,detail:string,checked:boolean,onChange:(checked:boolean)=>void}) {
  return <label className="settings-row"><span className="setting-icon">{icon}</span><span><b>{title}</b><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i aria-hidden="true"/></label>;
}
