import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { frenchChallenges } from './content';
import { calculatePoints, getLevel, getTimeLimit, pickChallenge, validateChallenge } from './engine';
import { defaultPreferences, defaultStats, loadPreferences, loadRun, loadStats, savePreferences, saveRun, saveStats } from './storage';
import type { Challenge, Preferences, RunState, Stats } from './types';

type Screen = 'home' | 'game' | 'pause' | 'gameover' | 'rules' | 'settings';
type Feedback = { correct: boolean; points: number; message: string } | null;

const gameLabels: Record<Challenge['type'], string> = {
  mcq: 'QCM express', boolean: 'Vrai ou faux', odd: 'L’intrus', order: 'Remets dans l’ordre',
  anagram: 'Anagramme', missing: 'Mot à trous', clues: 'Trois indices', letters: 'Lettres imposées'
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
  const [letterWords, setLetterWords] = useState<string[]>([]);
  const [cluesShown, setCluesShown] = useState(1);
  const [hintPenalty, setHintPenalty] = useState(0);
  const [lastScore, setLastScore] = useState(0);
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
    setAnswer(saved?.draftText ?? ''); setLetterWords(saved?.draftWords ?? []); setCluesShown(saved?.draftCluesShown ?? 1); setHintPenalty(saved?.draftHintPenalty ?? 0); setFeedback(null);
    if (challenge.type === 'order') setOrdered(saved?.draftOrder ?? [...challenge.items]); else setOrdered([]);
  }, []);

  const startNew = useCallback(() => {
    const current = pickChallenge(frenchChallenges, 1, []);
    const next: RunState = { score: 0, lives: 3, combo: 0, successes: 0, attempts: 0, current, remainingMs: getTimeLimit(current, 1), recentIds: [current.id], bonusRound: false, startedAt: Date.now() };
    setRun(next); prepareChallenge(current); setScreen('game');
  }, [prepareChallenge]);

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
    const current = pickChallenge(frenchChallenges, level, state.recentIds, state.current.type, shouldBonus);
    const next = { ...state, current, bonusRound: shouldBonus, remainingMs: getTimeLimit(current, level), recentIds: [...state.recentIds, current.id].slice(-80), draftText: '', draftOrder: current.type === 'order' ? [...current.items] : [], draftWords: [], draftCluesShown: 1, draftHintPenalty: 0 };
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
    if (!run) return;
    setRun(old => old && old.current.id === run.current.id ? { ...old, draftText: answer, draftOrder: ordered, draftWords: letterWords, draftCluesShown: cluesShown, draftHintPenalty: hintPenalty } : old);
  }, [answer, ordered, letterWords, cluesShown, hintPenalty, run?.current.id]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!run || feedback) return;
    const value: unknown = run.current.type === 'order' ? ordered : run.current.type === 'letters' ? letterWords : answer;
    resolveAnswer(validateChallenge(run.current, value));
  };

  const selectChoice = (index: number) => {
    if (!run || feedback) return;
    resolveAnswer(validateChallenge(run.current, index));
  };

  const addLetterWord = (event: FormEvent) => {
    event.preventDefault();
    const value = answer.trim();
    if (!value || letterWords.some(word => word.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    setLetterWords(old => [...old, value]); setAnswer('');
  };

  const level = run ? getLevel(run.successes) : 1;
  const totalTime = run ? getTimeLimit(run.current, level) : 1;
  const progress = run ? Math.max(0, Math.min(100, run.remainingMs / totalTime * 100)) : 0;
  const record = Math.max(stats.bestScore, run?.score ?? 0);
  const accuracy = stats.totalQuestions ? Math.round(stats.totalCorrect / stats.totalQuestions * 100) : 0;
  const appClass = [prefs.reducedMotion ? 'reduced-motion' : '', prefs.highContrast ? 'high-contrast' : ''].join(' ');

  const gameCard = useMemo(() => {
    if (!run) return null;
    const challenge = run.current;
    if (challenge.type === 'mcq' || challenge.type === 'boolean' || challenge.type === 'odd') {
      return <div className="choices">{challenge.choices.map((item, index) => <button className="choice" key={item} onClick={() => selectChoice(index)} disabled={!!feedback}><span>{String.fromCharCode(65 + index)}</span>{item}</button>)}</div>;
    }
    if (challenge.type === 'order') {
      return <><p className="microcopy">Du plus ancien au plus récent</p><div className="order-list">{ordered.map((item, index) => <div className="order-item" key={item}><b>{index + 1}</b><span>{item}</span><div><button aria-label={`Monter ${item}`} disabled={index === 0 || !!feedback} onClick={() => setOrdered(list => { const copy=[...list]; [copy[index-1],copy[index]]=[copy[index],copy[index-1]]; return copy; })}>↑</button><button aria-label={`Descendre ${item}`} disabled={index === ordered.length-1 || !!feedback} onClick={() => setOrdered(list => { const copy=[...list]; [copy[index+1],copy[index]]=[copy[index],copy[index+1]]; return copy; })}>↓</button></div></div>)}</div><button className="primary full" onClick={() => submit()} disabled={!!feedback}>Valider l’ordre</button></>;
    }
    if (challenge.type === 'letters') {
      return <><div className="letter-rack" aria-label={`Lettres ${challenge.letters}`}>{[...challenge.letters].map((letter,index)=><span key={`${letter}-${index}`}>{letter}</span>)}</div><form className="answer-form" onSubmit={addLetterWord}><input autoFocus value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="Écris un mot" disabled={!!feedback}/><button aria-label="Ajouter le mot">+</button></form><div className="word-chips">{letterWords.map(word=><button key={word} onClick={()=>setLetterWords(list=>list.filter(item=>item!==word))}>{word} ×</button>)}</div><p className="microcopy">{letterWords.length} mot{letterWords.length>1?'s':''} proposé{letterWords.length>1?'s':''} · objectif {challenge.target}</p><button className="primary full" onClick={() => submit()} disabled={letterWords.length < challenge.target || !!feedback}>Valider mes mots</button></>;
    }
    return <form className="text-game" onSubmit={submit}>{(challenge.type === 'anagram' || challenge.type === 'missing') && <div className="word-display">{challenge.display}</div>}{challenge.type === 'clues' && <div className="clues">{challenge.clues.slice(0,cluesShown).map((clue,index)=><div key={clue}><span>{index+1}</span>{clue}</div>)}{cluesShown < 3 && <button type="button" className="hint" onClick={()=>{setCluesShown(n=>n+1);setHintPenalty(n=>n+35);}}>+ Voir un indice <small>−35 pts</small></button>}</div>}<label className="sr-only" htmlFor="answer">Ta réponse</label><input id="answer" autoFocus autoComplete="off" value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="Ta réponse…" disabled={!!feedback}/><button className="primary full" disabled={!answer.trim() || !!feedback}>Valider</button></form>;
  // Dependencies intentionally include transient answer state used by all game renderers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.current, ordered, letterWords, answer, cluesShown, feedback]);

  return <div className={`app ${appClass}`}>
    {screen === 'home' && <main className="home screen">
      <div className="home-top"><div className="brand-mark">M</div><button className="icon-button" onClick={()=>setScreen('settings')} aria-label="Réglages">⚙</button></div>
      <section className="hero"><span className="eyebrow">QUIZ · MOTS · RECORDS</span><h1>Motissimo</h1><p>Joue avec ta tête.<br/>Va toujours plus loin.</p><div className="hero-orbit orbit-one">?</div><div className="hero-orbit orbit-two">A</div></section>
      <section className="home-actions">
        {run ? <><button className="primary huge" onClick={resume}>▶ Reprendre <small>{formatScore(run.score)} pts · {run.lives} vie{run.lives>1?'s':''}</small></button><button className="secondary" onClick={startNew}>Nouvelle partie</button></> : <button className="primary huge" onClick={startNew}>▶ Jouer <small>3 vies · défi sans fin</small></button>}
      </section>
      <section className="stats-grid"><div><span>🏆</span><b>{formatScore(record)}</b><small>Meilleur score</small></div><div><span>🔥</span><b>{stats.longestCombo}</b><small>Meilleur combo</small></div><div><span>🎯</span><b>{accuracy}%</b><small>Précision</small></div></section>
      <button className="text-button" onClick={()=>setScreen('rules')}>Comment jouer ?</button>
    </main>}

    {screen === 'game' && run && <main className="game screen">
      <header className="game-header"><button className="icon-button light" onClick={()=>setScreen('pause')} aria-label="Mettre en pause">Ⅱ</button><div className="score"><small>SCORE</small><strong>{formatScore(run.score)}</strong></div><div className="lives" aria-label={`${run.lives} vies`}>{[0,1,2].map(i=><span key={i} className={i<run.lives?'alive':''}>♥</span>)}</div></header>
      <div className="timer-track"><div style={{width:`${progress}%`}} className={progress<25?'danger':''}/></div>
      <section className="game-meta"><span>Niveau {level}</span><b>{run.bonusRound?'★ Défi vie bonus':gameLabels[run.current.type]}</b><span>🔥 {run.combo}</span></section>
      <section className="challenge-card"><span className="category">{run.current.category} · difficulté {run.current.difficulty}/5</span><h2>{run.current.prompt}</h2>{gameCard}</section>
      <footer className="game-footer"><span>Record {formatScore(record)}</span><span>{Math.ceil(run.remainingMs/1000)} s</span></footer>
      {feedback && <div className={`feedback ${feedback.correct?'correct':'wrong'}`} role="status"><div>{feedback.correct?'✓':'×'}</div><h3>{feedback.message}</h3>{feedback.correct?<strong>+{formatScore(feedback.points)} points</strong>:<p>{run.current.explanation}</p>}</div>}
    </main>}

    {screen === 'pause' && run && <main className="modal-screen screen"><div className="modal-icon">Ⅱ</div><h1>En pause</h1><p>Ton chrono est arrêté.<br/>Ta partie est sauvegardée.</p><button className="primary huge" onClick={resume}>Continuer</button><button className="secondary" onClick={()=>setScreen('home')}>Retour à l’accueil</button></main>}

    {screen === 'gameover' && <main className="modal-screen gameover screen"><div className="modal-icon">🏁</div><span className="eyebrow">PARTIE TERMINÉE</span><h1>{formatScore(lastScore)}</h1><p>points</p>{lastScore >= stats.bestScore && lastScore > 0 && <div className="new-record">✨ Nouveau record !</div>}<button className="primary huge" onClick={startNew}>Rejouer</button><button className="secondary" onClick={()=>setScreen('home')}>Retour à l’accueil</button></main>}

    {screen === 'rules' && <main className="info-screen screen"><header><button className="icon-button" onClick={()=>setScreen('home')}>←</button><h1>Comment jouer ?</h1></header><div className="rule"><b>1</b><div><h2>Enchaîne les défis</h2><p>Huit mini-jeux alternent culture générale et jeux de mots.</p></div></div><div className="rule"><b>2</b><div><h2>Protège tes vies</h2><p>Tu commences avec trois cœurs. Une erreur ou un chrono écoulé en coûte un.</p></div></div><div className="rule"><b>3</b><div><h2>Fais monter le combo</h2><p>Les séries de bonnes réponses multiplient tes points jusqu’à ×3.</p></div></div><div className="rule"><b>4</b><div><h2>Décroche une vie bonus</h2><p>Après 25 bonnes réponses consécutives, réussis le défi bonus pour récupérer un cœur.</p></div></div><div className="offline-note">☁︎ <strong>100 % hors ligne</strong><br/><span>Après la première visite, Motissimo fonctionne sans connexion.</span></div></main>}

    {screen === 'settings' && <main className="info-screen screen"><header><button className="icon-button" onClick={()=>setScreen('home')}>←</button><h1>Réglages</h1></header><SettingsRow icon="♪" title="Sons" detail="Effets de réussite et d’erreur" checked={prefs.sound} onChange={sound=>setPrefs(p=>({...p,sound}))}/><SettingsRow icon="⌁" title="Vibrations" detail="Retour tactile pendant la partie" checked={prefs.vibration} onChange={vibration=>setPrefs(p=>({...p,vibration}))}/><SettingsRow icon="◌" title="Réduire les animations" detail="Limite les mouvements visuels" checked={prefs.reducedMotion} onChange={reducedMotion=>setPrefs(p=>({...p,reducedMotion}))}/><SettingsRow icon="◐" title="Contraste renforcé" detail="Améliore la distinction des éléments" checked={prefs.highContrast} onChange={highContrast=>setPrefs(p=>({...p,highContrast}))}/><div className="offline-note">Les réglages, statistiques et records restent uniquement sur cet appareil.</div></main>}
  </div>;
}

function SettingsRow({icon,title,detail,checked,onChange}:{icon:string,title:string,detail:string,checked:boolean,onChange:(checked:boolean)=>void}) {
  return <label className="settings-row"><span className="setting-icon">{icon}</span><span><b>{title}</b><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i aria-hidden="true"/></label>;
}
