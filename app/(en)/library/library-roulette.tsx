'use client';

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { typeNames, types, type LibraryState, type Work } from '../../../lib/library/model';
import { pickTitle, plannedTitles } from '../../../lib/library/roulette';
import { Cover } from './cover';

type Round = { winner: Work; posters: Work[]; landingIndex: number; spinning: boolean };
type Props = { state: LibraryState; initialCategory?: Work['type']; onViewTitle: (work: Work) => void };

export function LibraryRoulette({ state, initialCategory, onViewTitle }: Props) {
  const [categories, setCategories] = useState<Work['type'][]>(() => initialCategory ? [initialCategory] : [...types]);
  const [round, setRound] = useState<Round | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const spinLock = useRef(false);
  const candidates = useMemo(() => plannedTitles(state, categories), [state, categories]);
  const spinning = round?.spinning === true;
  const winner = round && !spinning ? round.winner : null;
  const posters = round?.posters ?? candidates.slice(0, 7);
  const center = round?.landingIndex ?? Math.floor(posters.length / 2);

  useLayoutEffect(() => {
    if (!round?.spinning || !track.current) return;
    const node = track.current;
    const cardWidth = (node.firstElementChild as HTMLElement).offsetWidth;
    const step = cardWidth + Number.parseFloat(getComputedStyle(node).gap);
    const transformAt = (index: number) => `translateX(${-cardWidth / 2 - index * step}px)`;
    const animation = node.animate([
      { transform: transformAt(2) },
      { transform: transformAt(round.landingIndex) },
    ], { duration: 3000, easing: 'cubic-bezier(.12,.65,.18,1)' });
    const finish = () => {
      animation.cancel();
      spinLock.current = false;
      setRound(current => current === round ? { ...current, spinning: false } : current);
    };
    animation.onfinish = finish;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionChanged = () => { if (motion.matches) finish(); };
    motion.addEventListener('change', motionChanged);
    window.addEventListener('resize', finish, { once: true });
    return () => {
      animation.onfinish = null;
      animation.cancel();
      motion.removeEventListener('change', motionChanged);
      window.removeEventListener('resize', finish);
    };
  }, [round]);

  const spin = () => {
    if (spinLock.current) return;
    const selected = pickTitle(candidates);
    if (!selected) return;
    const immediate = candidates.length === 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    spinLock.current = !immediate;
    // The small visual sample is independent of the full-pool winner selection.
    const sample = candidates.filter((_, index) => index % Math.max(1, Math.ceil(candidates.length / 8)) === 0).slice(0, 8);
    const landingIndex = immediate ? 0 : 21;
    const reel = immediate ? [selected] : Array.from({ length: 25 }, (_, index) => sample[index % sample.length]);
    reel[landingIndex] = selected;
    setRound({ winner: selected, posters: reel, landingIndex, spinning: !immediate });
  };

  return <div className="library-roulette">
    <p className="roulette-intro">Let your backlog pick what’s next.</p>
    <fieldset className="roulette-categories" disabled={spinning}>
      <legend>Pick from</legend>
      <div>{types.map(type => <button key={type} type="button" aria-pressed={categories.includes(type)} onClick={() => {
        setCategories(current => current.includes(type) ? current.filter(category => category !== type) : [...current, type]);
        setRound(null);
      }}>{typeNames[type]}</button>)}</div>
    </fieldset>
    <p className="roulette-count">{candidates.length} {candidates.length === 1 ? 'planned title' : 'planned titles'} · {categories.length === types.length ? 'All categories' : categories.map(type => typeNames[type]).join(', ') || 'No categories selected'}</p>
    <div className="roulette-stage" data-spinning={spinning} aria-hidden="true">
      {posters.length ? <>
        <div className="roulette-marker" />
        <div ref={track} className="roulette-track" style={{ '--roulette-index': center } as CSSProperties}>
          {posters.map((work, index) => <div className="roulette-poster" key={`${index}:${work.id}`} data-winner={!!winner && index === center}>
            <Cover work={work} eager={Math.abs(index - center) < 2} />
          </div>)}
        </div>
      </> : <p className="roulette-stage-empty">{categories.length ? 'Your next pick starts with a plan.' : 'What are you in the mood for?'}</p>}
    </div>
    <div className="roulette-result" role="status" aria-live="polite" aria-atomic="true">
      {winner ? <><h3>{winner.title}</h3><p>{winner.year ?? 'Year unknown'} · {typeNames[winner.type]}</p></> : <p>{spinning ? 'Picking from your plans…' : !categories.length ? 'Choose at least one category to spin.' : !candidates.length ? 'Add titles to Plan to watch or your games Backlog, then try again.' : 'Every planned title has an equal chance.'}</p>}
    </div>
    <div className="roulette-actions">
      <button type="button" className="primary" disabled={!candidates.length || spinning} onClick={spin}>{spinning ? 'Spinning…' : round ? 'Spin again' : 'Spin'}</button>
      {winner && <button type="button" className="secondary" onClick={() => onViewTitle(winner)}>View title</button>}
    </div>
  </div>;
}
