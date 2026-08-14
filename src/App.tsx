import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { frenchChallenges } from './content';
import { calculatePoints, evaluateWordleGuess, getLevel, getTimeLimit, normalizeText, pickChallenge, validateChallenge } from './engine';
import { defaultPreferences, defaultStats, loadPreferences, loadRun, loadStats, savePreferences, saveRun, saveStats } from './storage';
import type { Challenge, GameMode, GameType, Preferences, RunState, Stats } from './types';

type Screen = 'home' | 'game' | 'pause' | 'gameover' | 'rules' | 'settings' | 'modes';
type Feedback = { correct: boolean; points: number; message: string } | null;

const gameLabels: Record<GameType, string> = {
  mcq: 'QCM express', boolean: 'Vrai ou faux', odd: 'L’intrus', order: 'Remets dans l’ordre',
  anagram: 'Anagramme', missing: 'Mot à trous', clues: 'Trois indices', wordle: 'Mot mystère'
};

const gameIcons: Record<GameType, string> = { mcq:'?', boolean:'✓', odd:'◈', order:'↕', anagram:'A', missing:'…', clues:'3', wordle:'W' };
const modeDescriptions: Record<GameType, string> = {
  mcq:'Quatre réponses, une seule juste', boolean:'Décide si l’affirmation est vraie', odd:'Repère l’élément qui ne va pas',
  order:'Replace les événements dans le temps', anagram:'Remets les lettres dans l’ordre', missing:'Complète les lettres absentes',
  clues:'Trouve le mot avec trois indices', wordle:'Trouve le mot mystère en six essais'
};

function formatScore(score: number) { return new Intl.NumberFormat('fr-FR').format(score); }

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
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [visibleHeight, setVisibleHeight] = useState(() => window.visualViewport?.height ?? window.innerHeight);
  const runRef = useRef(run);
  const feedbackRef = useRef(feedback);

  useEffect(() => { runRef.current = run; }, [run]);
  useEffect(() => { feedbackRef.current = feedback; }, [feedback]);
  useEffect(() => { savePreferences(prefs); }, [prefs]);
  useEffect(() => { saveStats(stats); }, [stats]);
  useEffect(() => {
    const id = window.setTimeout(() => saveRun(run), 350);
    return () => window.clearTimeout(id);
  }, [run]);

  const prepareChallenge = useCallback((challenge: Challenge, saved?: RunState) => {
    setAnswer(saved?.draftText ?? ''); setWordleGuesses(saved?.draftGuesses ?? []); setWordleError(''); setCluesShown(saved?.draftCluesShown ?? 1); setHintPenalty(saved?.draftHintPenalty ?? 0); setFeedback(null);
    if (challenge.type === 'order') setOrdered(saved?.draftOrder ?? [...challenge.items]); else setOrdered([]);
  }, []);

  const startNew = useCallback(() => {
    const onlyType = prefs.gameMode === 'mix' ? undefined : prefs.gameMode;
    const current = pickChallenge(frenchChallenges, 1, [], undefined, false, onlyType);
    const next: RunState = { score: 0, lives: 3, combo: 0, successes: 0, attempts: 0, current, remainingMs: getTimeLimit(current, 1), recentIds: [current.sourceId ?? current.id], bonusRound: false, startedAt: Date.now(), mode:prefs.gameMode };
    setRun(next); prepareChallenge(current); setScreen('game');
  }, [prepareChallenge, prefs.gameMode]);

  const resume = useCallback(() => {
    if (!run) return;
    prepareChallenge(run.current, run); setScreen('game');
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
    const current = pickChallenge(frenchChallenges, level, state.recentIds, state.mode === 'mix' ? state.current.type : undefined, shouldBonus, onlyType);
    const next = { ...state, current, bonusRound: shouldBonus, remainingMs: getTimeLimit(current, level), recentIds: [...state.recentIds, current.sourceId ?? current.id].slice(-80), draftText: '', draftOrder: current.type === 'order' ? [...current.items] : [], draftGuesses: [], draftCluesShown: 1, draftHintPenalty: 0 };
    prepareChallenge(current); setRun(next);
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
    const message = isCorrect
      ? currentRun.bonusRound && lives > currentRun.lives ? 'Vie récupérée !' : nextCombo > 0 && nextCombo % 5 === 0 ? `Combo ×${Math.min(3, 1 + Math.floor(nextCombo / 5) * .25)} !` : 'Bien joué !'
      : currentRun.remainingMs <= 0 ? 'Temps écoulé !' : 'Pas cette fois !';
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
    const viewport = window.visualViewport;
    let baselineHeight = viewport?.height ?? window.innerHeight;
    let timer = 0;
    const isEditable = (element: Element | null) =>
      (element instanceof HTMLInputElement && !['checkbox','radio','button','submit'].includes(element.type)) ||
      element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ||
      (element instanceof HTMLElement && element.isContentEditable);
    const updateKeyboard = () => {
      const activeElement = document.activeElement;
      const activeInput = isEditable(activeElement);
      const currentHeight = viewport?.height ?? window.innerHeight;
      setVisibleHeight(Math.round(currentHeight));
      if (!activeInput) baselineHeight = Math.max(baselineHeight, currentHeight);
      const visiblyReduced = currentHeight < baselineHeight * .82;
      setKeyboardOpen(screen === 'game' && activeInput && (visiblyReduced || !viewport));
      if (activeInput && visiblyReduced) window.requestAnimationFrame(() => activeElement?.scrollIntoView({ block:'nearest', inline:'nearest' }));
    };
    const onFocus = () => { window.clearTimeout(timer); timer = window.setTimeout(updateKeyboard, 180); };
    const onBlur = () => { window.clearTimeout(timer); timer = window.setTimeout(updateKeyboard, 80); };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    viewport?.addEventListener('resize', updateKeyboard);
    const onOrientation = () => window.setTimeout(() => { baselineHeight = viewport?.height ?? window.innerHeight; updateKeyboard(); }, 250);
    window.addEventListener('orientationchange', onOrientation);
    updateKeyboard();
    return () => {
      window.clearTimeout(timer); document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onBlur);
      viewport?.removeEventListener('resize', updateKeyboard); window.removeEventListener('orientationchange', onOrientation);
    };
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

  const submitWordle = (event: FormEvent) => {
    event.preventDefault();
    if (!run || run.current.type !== 'wordle' || feedback) return;
    const guess = normalizeText(answer);
    const target = normalizeText(run.current.answer);
    if (!/^[a-z]+$/.test(guess) || guess.length !== target.length) {
      setWordleError(`Entre un mot de ${target.length} lettres.`); return;
    }
    if (guess[0] !== target[0]) { setWordleError(`Le mot doit commencer par ${target[0].toLocaleUpperCase('fr-FR')}.`); return; }
    if (wordleGuesses.includes(guess)) { setWordleError('Ce mot a déjà été proposé.'); return; }
    const nextGuesses = [...wordleGuesses, guess];
    setWordleGuesses(nextGuesses); setAnswer('');
    if (guess === target) resolveAnswer(true);
    else if (nextGuesses.length >= run.current.maxAttempts) resolveAnswer(false);
    else {
      setWordleError(`${run.current.maxAttempts-nextGuesses.length} essai${run.current.maxAttempts-nextGuesses.length>1?'s':''} restant${run.current.maxAttempts-nextGuesses.length>1?'s':''}.`);
      if (prefs.vibration && navigator.vibrate) navigator.vibrate(18);
    }
  };

  const level = run ? getLevel(run.successes) : 1;
  const totalTime = run ? getTimeLimit(run.current, level) : 1;
  const progress = run ? Math.max(0, Math.min(100, run.remainingMs / totalTime * 100)) : 0;
  const record = Math.max(stats.bestScore, run?.score ?? 0);
  const accuracy = stats.totalQuestions ? Math.round(stats.totalCorrect / stats.totalQuestions * 100) : 0;
  const appClass = [prefs.reducedMotion ? 'reduced-motion' : '', prefs.highContrast ? 'high-contrast' : '', keyboardOpen ? 'keyboard-open' : ''].join(' ');
  const appStyle = { '--visible-height': `${visibleHeight}px` } as CSSProperties;

  const gameCard = useMemo(() => {
    if (!run) return null;
    const challenge = run.current;
    if (challenge.type === 'mcq' || challenge.type === 'boolean' || challenge.type === 'odd') {
      return <div className="choices">{challenge.choices.map((item, index) => <button className="choice" key={item} onClick={() => selectChoice(index)} disabled={!!feedback}><span>{String.fromCharCode(65 + index)}</span>{item}</button>)}</div>;
    }
    if (challenge.type === 'order') {
      return <><p className="microcopy">Du plus ancien au plus récent</p><div className="order-list">{ordered.map((item, index) => <div className="order-item" key={item}><b>{index + 1}</b><span>{item}</span><div><button aria-label={`Monter ${item}`} disabled={index === 0 || !!feedback} onClick={() => setOrdered(list => { const copy=[...list]; [copy[index-1],copy[index]]=[copy[index],copy[index-1]]; return copy; })}>↑</button><button aria-label={`Descendre ${item}`} disabled={index === ordered.length-1 || !!feedback} onClick={() => setOrdered(list => { const copy=[...list]; [copy[index+1],copy[index]]=[copy[index],copy[index+1]]; return copy; })}>↓</button></div></div>)}</div><button className="primary full" onClick={() => submit()} disabled={!!feedback}>Valider l’ordre</button></>;
    }
    if (challenge.type === 'wordle') {
      const targetLength = normalizeText(challenge.answer).length;
      const firstLetter = normalizeText(challenge.answer)[0].toLocaleUpperCase('fr-FR');
      return <form className="wordle-game" onSubmit={submitWordle}>
        <div className="wordle-first-letter"><span>{firstLetter}</span> Première lettre offerte</div>
        <div className="wordle-board" aria-label={`${wordleGuesses.length} essai${wordleGuesses.length>1?'s':''} sur ${challenge.maxAttempts}`}>
          {Array.from({length:challenge.maxAttempts},(_,rowIndex)=>{
            const completed = wordleGuesses[rowIndex];
            const displayed = completed ?? (rowIndex===wordleGuesses.length ? normalizeText(answer) : '');
            const marks = completed ? evaluateWordleGuess(completed, challenge.answer) : [];
            const active = rowIndex === wordleGuesses.length;
            const hideForKeyboard = keyboardOpen && !!completed && rowIndex < wordleGuesses.length - 2;
            return <div className={`wordle-row ${completed?'revealed':''} ${active?'active':''} ${hideForKeyboard?'keyboard-hidden':''}`} key={rowIndex}>{Array.from({length:targetLength},(_,letterIndex)=>{const given=!completed&&letterIndex===0&&!displayed[0];const letter=displayed[letterIndex]?.toLocaleUpperCase('fr-FR')??(given?firstLetter:'');return <span className={`wordle-tile ${marks[letterIndex]??(displayed[letterIndex]?'filled':given?'given':'')}`} style={{animationDelay:`${letterIndex*70}ms`}} key={letterIndex}>{letter}</span>;})}</div>;
          })}
        </div>
        <label className="sr-only" htmlFor="wordle-answer">Propose un mot de {targetLength} lettres</label>
        <input id="wordle-answer" autoFocus autoComplete="off" autoCapitalize="characters" maxLength={targetLength} value={answer} onChange={e=>{setAnswer(e.target.value);setWordleError('');}} placeholder={`${firstLetter} + ${targetLength-1} lettres…`} disabled={!!feedback}/>
        <div className="wordle-help" aria-live="polite">{wordleError||'Vert : bien placée · Jaune : présente'}</div>
        <button className="primary full" disabled={normalizeText(answer).length!==targetLength || !!feedback}>Essayer</button>
      </form>;
    }
    return <form className="text-game" onSubmit={submit}>{(challenge.type === 'anagram' || challenge.type === 'missing') && <div className="word-display">{challenge.display}</div>}{challenge.type === 'clues' && <div className="clues">{challenge.clues.slice(0,cluesShown).map((clue,index)=><div key={clue}><span>{index+1}</span>{clue}</div>)}{cluesShown < 3 && <button type="button" className="hint" onClick={()=>{setCluesShown(n=>n+1);setHintPenalty(n=>n+35);}}>+ Voir un indice <small>−35 pts</small></button>}</div>}<label className="sr-only" htmlFor="answer">Ta réponse</label><input id="answer" autoFocus autoComplete="off" value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="Ta réponse…" disabled={!!feedback}/><button className="primary full" disabled={!answer.trim() || !!feedback}>Valider</button></form>;
  // Dependencies intentionally include transient answer state used by all game renderers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.current, ordered, wordleGuesses, wordleError, answer, cluesShown, feedback, keyboardOpen]);

  return <div className={`app ${appClass}`} style={appStyle} data-keyboard-open={keyboardOpen}>
    {screen === 'home' && <main className="home screen">
      <div className="home-top"><div className="brand-mark">M</div><button className="icon-button" onClick={()=>setScreen('settings')} aria-label="Réglages">⚙</button></div>
      <section className="hero"><span className="eyebrow">QUIZ · MOTS · RECORDS</span><h1>Motissimo</h1><p>Joue avec ta tête.<br/>Va toujours plus loin.</p><div className="hero-orbit orbit-one">?</div><div className="hero-orbit orbit-two">A</div></section>
      <section className="home-actions">
        <button className="mode-picker" onClick={()=>setScreen('modes')}><span>{prefs.gameMode==='mix'?'✦':gameIcons[prefs.gameMode]}</span><div><small>MODE DE JEU</small><b>{prefs.gameMode==='mix'?'Mix infini':gameLabels[prefs.gameMode]}</b></div><i>Changer ›</i></button>
        {run ? <><button className="primary huge" onClick={resume}>▶ Reprendre <small>{formatScore(run.score)} pts · {run.lives} vie{run.lives>1?'s':''}</small></button><button className="secondary" onClick={startNew}>Nouvelle partie</button></> : <button className="primary huge" onClick={startNew}>▶ Jouer <small>3 vies · défi sans fin</small></button>}
      </section>
      <section className="stats-grid"><div><span>🏆</span><b>{formatScore(record)}</b><small>Meilleur score</small></div><div><span>🔥</span><b>{stats.longestCombo}</b><small>Meilleur combo</small></div><div><span>🎯</span><b>{accuracy}%</b><small>Précision</small></div></section>
      <button className="text-button" onClick={()=>setScreen('rules')}>Comment jouer ?</button>
    </main>}

    {screen === 'game' && run && <main className={`game screen ${feedback?.correct?'answer-correct':feedback?'answer-wrong':''}`}>
      <div className="game-atmosphere" aria-hidden="true"><i/><i/><i/><i/><i/></div>
      <header className="game-header"><button className="icon-button light" onClick={()=>setScreen('pause')} aria-label="Mettre en pause">Ⅱ</button><div className={`score ${feedback?.correct?'score-pop':''}`}><small>SCORE</small><strong>{formatScore(run.score)}</strong></div><div className="lives" aria-label={`${run.lives} vies`}>{[0,1,2].map(i=><span key={i} className={`${i<run.lives?'alive':''} ${feedback && !feedback.correct && i===run.lives?'just-lost':''} ${feedback?.correct && run.bonusRound && i===run.lives-1?'just-gained':''}`}>♥</span>)}</div></header>
      <div className="timer-track"><div style={{width:`${progress}%`}} className={progress<25?'danger':''}/></div>
      <section className="game-meta"><span>Niveau {level}</span><b>{run.bonusRound?'★ Défi vie bonus':gameLabels[run.current.type]}</b><span className={run.combo>0?'combo-live':''}>🔥 {run.combo}</span></section>
      <section className={`challenge-card challenge-${run.current.type}`} data-game-type={run.current.type} key={run.current.id}><span className="category">{run.current.category} · difficulté {run.current.difficulty}/5</span><h2>{run.current.prompt}</h2><div className="challenge-body">{gameCard}</div></section>
      <footer className="game-footer"><span>Record {formatScore(record)}</span><span>{Math.ceil(run.remainingMs/1000)} s</span></footer>
      {feedback && <div className={`feedback ${feedback.correct?'correct':'wrong'}`} role="status" aria-live="assertive"><div className="feedback-symbol">{feedback.correct?'✓':'×'}</div>{!feedback.correct && <div className="life-loss"><span>♥</span><b>−1 VIE</b><i/><i/><i/></div>}<h3>{feedback.message}</h3>{feedback.correct?<strong>+{formatScore(feedback.points)} points</strong>:<p>{run.current.explanation}</p>}</div>}
    </main>}

    {screen === 'pause' && run && <main className="modal-screen screen"><div className="modal-icon">Ⅱ</div><h1>En pause</h1><p>Ton chrono est arrêté.<br/>Ta partie est sauvegardée.</p><button className="primary huge" onClick={resume}>Continuer</button><button className="secondary" onClick={()=>setScreen('home')}>Retour à l’accueil</button></main>}

    {screen === 'gameover' && <main className="modal-screen gameover screen"><div className="modal-icon">🏁</div><span className="eyebrow">PARTIE TERMINÉE</span><h1>{formatScore(lastScore)}</h1><p>points</p>{lastScore >= stats.bestScore && lastScore > 0 && <div className="new-record">✨ Nouveau record !</div>}<button className="primary huge" onClick={startNew}>Rejouer</button><button className="secondary" onClick={()=>setScreen('home')}>Retour à l’accueil</button></main>}

    {screen === 'rules' && <main className="info-screen screen"><header><button className="icon-button" onClick={()=>setScreen('home')}>←</button><h1>Comment jouer ?</h1></header><div className="rule"><b>1</b><div><h2>Enchaîne les défis</h2><p>Huit mini-jeux alternent culture générale et jeux de mots.</p></div></div><div className="rule"><b>2</b><div><h2>Protège tes vies</h2><p>Tu commences avec trois cœurs. Une erreur ou un chrono écoulé en coûte un.</p></div></div><div className="rule"><b>3</b><div><h2>Fais monter le combo</h2><p>Les séries de bonnes réponses multiplient tes points jusqu’à ×3.</p></div></div><div className="rule"><b>4</b><div><h2>Décroche une vie bonus</h2><p>Après 25 bonnes réponses consécutives, réussis le défi bonus pour récupérer un cœur.</p></div></div><div className="offline-note">☁︎ <strong>100 % hors ligne</strong><br/><span>Après la première visite, Motissimo fonctionne sans connexion.</span></div></main>}

    {screen === 'settings' && <main className="info-screen screen"><header><button className="icon-button" onClick={()=>setScreen('home')}>←</button><h1>Réglages</h1></header><SettingsRow icon="♪" title="Sons" detail="Effets de réussite et d’erreur" checked={prefs.sound} onChange={sound=>setPrefs(p=>({...p,sound}))}/><SettingsRow icon="⌁" title="Vibrations" detail="Retour tactile pendant la partie" checked={prefs.vibration} onChange={vibration=>setPrefs(p=>({...p,vibration}))}/><SettingsRow icon="◌" title="Réduire les animations" detail="Limite les mouvements visuels" checked={prefs.reducedMotion} onChange={reducedMotion=>setPrefs(p=>({...p,reducedMotion}))}/><SettingsRow icon="◐" title="Contraste renforcé" detail="Améliore la distinction des éléments" checked={prefs.highContrast} onChange={highContrast=>setPrefs(p=>({...p,highContrast}))}/><div className="offline-note">Les réglages, statistiques et records restent uniquement sur cet appareil.</div></main>}
    {screen === 'modes' && <main className="info-screen modes-screen screen"><header><button className="icon-button" onClick={()=>setScreen('home')}>←</button><div><span className="eyebrow">TA PARTIE, TES RÈGLES</span><h1>Choisis ton mode</h1></div></header><button className={`mode-card mix-mode ${prefs.gameMode==='mix'?'selected':''}`} onClick={()=>{setPrefs(p=>({...p,gameMode:'mix'}));setScreen('home');}}><span>✦</span><div><b>Mix infini</b><small>Les huit mini-jeux s’enchaînent</small></div><i>{prefs.gameMode==='mix'?'✓':'›'}</i></button><div className="mode-list">{(Object.keys(gameLabels) as GameType[]).map(type=><button className={`mode-card ${prefs.gameMode===type?'selected':''}`} key={type} onClick={()=>{setPrefs(p=>({...p,gameMode:type as GameMode}));setScreen('home');}}><span>{gameIcons[type]}</span><div><b>{gameLabels[type]}</b><small>{modeDescriptions[type]}</small></div><i>{prefs.gameMode===type?'✓':'›'}</i></button>)}</div></main>}
  </div>;
}

function SettingsRow({icon,title,detail,checked,onChange}:{icon:string,title:string,detail:string,checked:boolean,onChange:(checked:boolean)=>void}) {
  return <label className="settings-row"><span className="setting-icon">{icon}</span><span><b>{title}</b><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i aria-hidden="true"/></label>;
}
