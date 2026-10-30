'use client';
import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import * as Select from '@radix-ui/react-select';
const DialogContainer = createContext<HTMLElement | null>(null);
const DialogEscapeGuard = createContext<() => void>(() => {});
export type RatingScale = 5 | 10;
const RatingScaleContext = createContext<{ scale: RatingScale; setScale: (scale: RatingScale) => void }>({ scale: 5, setScale: () => {} });
const ratingScaleKey = 'tastelog-rating-scale';
const ratingScaleEvent = 'tastelog-rating-scale-change';
const readRatingScale = (): RatingScale => window.localStorage.getItem(ratingScaleKey) === '10' ? 10 : 5;
const subscribeRatingScale = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => { if (event.key === ratingScaleKey) listener(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(ratingScaleEvent, listener);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(ratingScaleEvent, listener); };
};
export function RatingScaleProvider({ children }: { children: React.ReactNode }) {
  const scale = useSyncExternalStore<RatingScale>(subscribeRatingScale, readRatingScale, () => 5);
  const setScale = (next: RatingScale) => { window.localStorage.setItem(ratingScaleKey, String(next)); window.dispatchEvent(new Event(ratingScaleEvent)); };
  return <RatingScaleContext.Provider value={{ scale, setScale }}>{children}</RatingScaleContext.Provider>;
}
export function useRatingScale() { return useContext(RatingScaleContext); }
const displayedRating = (rating: number, scale: RatingScale) => scale === 10 ? rating * 2 : rating;
export function Icon({ name }: { name: string }) {
  const paths = { plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M6 18 18 6', chevron: 'm6 9 6 6 6-6', check: 'm5 12 4 4L19 6', arrow: 'M5 12h14m-6-6 6 6-6 6', star: 'm12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 3 1.1-6.3L3 9.6l6.2-.9Z' };
  return <svg aria-hidden="true" className={name === 'chevron' ? 'select-chevron' : undefined} viewBox="0 0 24 24"><path d={paths[name] || paths.arrow} /></svg>;
}
export function FieldSelect({ label, value, options, onChange, compact = false }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void; compact?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const container = useContext(DialogContainer);
  const guardEscape = useContext(DialogEscapeGuard);
  return <div className={`filter-field${compact ? ' toolbar-filter-field' : ''}`}><label id={id} className={compact ? 'sr-only' : undefined}>{label}</label><Select.Root open={open} onOpenChange={setOpen} value={value || 'all'} onValueChange={v => onChange(v === 'all' ? '' : v)}>
    <Select.Trigger aria-labelledby={id} className={`select-trigger${compact ? ' toolbar-select-trigger' : ''}`}>{compact && <span className="toolbar-select-label" aria-hidden="true">{label}</span>}<Select.Value className={compact ? 'toolbar-select-value' : undefined} /><Select.Icon><Icon name="chevron" /></Select.Icon></Select.Trigger>
    <Select.Portal container={container}><Select.Content className="az-library-modal select-panel" position="popper" sideOffset={5} collisionPadding={12} onEscapeKeyDown={event => { guardEscape(); event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); }}>
      <Select.ScrollUpButton className="select-scroll">Scroll up</Select.ScrollUpButton><Select.Viewport>
        {options.map(([key, text]) => <Select.Item key={key || 'all'} value={key || 'all'} className="select-option"><Select.ItemText>{text}</Select.ItemText><Select.ItemIndicator><Icon name="check" /></Select.ItemIndicator></Select.Item>)}
      </Select.Viewport><Select.ScrollDownButton className="select-scroll">Scroll down</Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root></div>;
}
export function Modal({ title, description, children, close }: { title: string; description?: string; children: React.ReactNode; close: () => void }) {
  const id = useId(), [container, setContainer] = useState<HTMLDialogElement | null>(null);
  const selectEscapeAt = useRef(0);
  useEffect(() => { if (container && !container.open) container.showModal(); return () => { if (container?.open) container.close(); }; }, [container]);
  return <DialogEscapeGuard.Provider value={() => { selectEscapeAt.current = performance.now(); }}><DialogContainer.Provider value={container}><dialog ref={setContainer} className="az-library-modal library-dialog" aria-labelledby={id} aria-describedby={description ? `${id}-description` : undefined}
    onCancel={event => { event.preventDefault(); const selectConsumedThisKey = selectEscapeAt.current > 0 && performance.now() - selectEscapeAt.current < 400; selectEscapeAt.current = 0; if (!selectConsumedThisKey && !container?.querySelector('[role="listbox"]')) close(); }}
    onClick={event => { if (event.target === container) { const r = container.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
      <div className="dialog-top"><h2 id={id}>{title}</h2><button type="button" className="icon-button" aria-label="Close" onClick={close}><Icon name="close" /></button></div>
      {description && <p id={`${id}-description`} className="dialog-description">{description}</p>}
      <div className="dialog-body">{children}</div>
    </dialog></DialogContainer.Provider></DialogEscapeGuard.Provider>;
}
function Star({ fill }: { fill: number }) {
  const path = 'm12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 3 1.1-6.3L3 9.6l6.2-.9Z';
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path className="star-fill" d={path} style={{ clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }} /><path className="star-outline" d={path} /></svg>;
}
export function Stars({ rating }: { rating?: number | null }) {
  const { scale } = useRatingScale();
  const shown = rating == null ? null : displayedRating(rating, scale);
  if (scale === 10) return <span className={`poster-rating numeric-rating ${rating == null ? 'unrated' : ''}`} aria-label={rating == null ? 'Unrated' : `${shown} out of 10`}>
    <span>{rating == null ? 'Unrated' : `${shown}/10`}</span>
  </span>;
  return <span className={`poster-rating ${rating == null ? 'unrated' : ''}`} role="img" aria-label={rating == null ? 'Unrated' : `${rating} out of 5 stars`}>
    {rating == null ? <span>Unrated</span> : <span className="star-display">{[1, 2, 3, 4, 5].map(n => <Star key={n} fill={Math.max(0, Math.min(1, rating - n + 1))} />)}</span>}
  </span>;
}
export function RatingInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId(), [hover, setHover] = useState<number | null>(null);
  const { scale } = useRatingScale();
  const current = Number(value) || 0, displayed = hover ?? current;
  const update = (n: number) => onChange(n > 0 ? String(Math.min(5, Math.max(.5, n))) : '');
  if (scale === 10) {
    const shown = displayedRating(current, scale);
    return <div className="rating-field"><span id={id} className="rating-label">{label}</span>
      <div className="rating-number-editor"><input className="rating-number-input" type="range" min="0" max="10" step="1" value={shown} aria-labelledby={id} aria-valuetext={current ? `${shown} out of 10` : 'Unrated'} onChange={e => update(Number(e.currentTarget.value) / 2)} /><output aria-live="polite">{current ? `${shown}/10` : 'Unrated'}</output></div>
      <div className="rating-tools"><button type="button" className="text-button" disabled={!current} onClick={() => onChange('')}>Clear rating</button></div>
    </div>;
  }
  return <div className="rating-field"><span id={id} className="rating-label">{label}</span>
    <div className="rating-editor" role="slider" tabIndex={0} aria-labelledby={id} aria-valuemin={0} aria-valuemax={5} aria-valuenow={current} aria-valuetext={current ? `${current} out of 5 stars` : 'Unrated'}
      onKeyDown={e => { const keys = ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End', 'Delete', 'Backspace']; if (!keys.includes(e.key)) return; e.preventDefault(); setHover(null); update(e.key === 'End' ? 5 : ['Home', 'Delete', 'Backspace'].includes(e.key) ? 0 : current + (['ArrowRight', 'ArrowUp'].includes(e.key) ? .5 : -.5)); }} onPointerLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map(n => <button type="button" tabIndex={-1} key={n} aria-label={`Rate ${n} stars`} onPointerMove={e => { if (e.pointerType === 'mouse') { const r = e.currentTarget.getBoundingClientRect(); setHover(n - (e.clientX - r.left < r.width / 2 ? .5 : 0)); } }}
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); const pointer = e.nativeEvent as PointerEvent; update(e.detail && pointer.pointerType === 'mouse' ? n - (e.clientX - r.left < r.width / 2 ? .5 : 0) : n); setHover(null); }}><Star fill={Math.max(0, Math.min(1, displayed - n + 1))} /></button>)}
    </div>
    <div className="rating-tools">{!current && <span className="muted">Unrated</span>}<span className="sr-only" aria-live="polite">{current ? `${current} out of 5 stars` : 'Unrated'}</span><button type="button" className="text-button" disabled={!current} aria-pressed={current % 1 === .5} onClick={() => update(current % 1 ? current + .5 : current - .5)}>Half star</button><button type="button" className="text-button" disabled={!current} onClick={() => { setHover(null); onChange(''); }}>Clear rating</button></div>
  </div>;
}
export function ratingFilterLabel(value: string, scale: RatingScale = 5) {
  if (!value) return 'Any rating';
  if (value === 'unrated') return 'No rating';
  if (value === 'rated') return 'Rated';
  const prefix = value.startsWith('exact:') ? 'exact:' : value.startsWith('min:') ? 'min:' : '';
  const raw = Number(prefix ? value.slice(prefix.length) : value);
  const shown = Number.isFinite(raw) ? displayedRating(raw, scale) : raw;
  if (prefix === 'exact:') return scale === 10 ? `${shown}/10 exactly` : `${shown} stars exactly`;
  return scale === 10 ? `${shown}+/10` : `${shown}+ stars`;
}
export const statusOptions: [string, string][] = [['backlog', 'Plan to watch / play'], ['wishlist', 'Wishlist'], ['active', 'Watching / playing'], ['completed', 'Watched / finished'], ['paused', 'Paused'], ['dropped', 'Dropped']];
export function statusesFor(type?: string): [string, string][] {
  return type && type !== 'all' ? [['backlog', type === 'games' ? 'Backlog' : 'Plan to watch'], ['wishlist', 'Wishlist'], ['active', type === 'games' ? 'Playing' : 'Watching'], ['completed', type === 'games' ? 'Played' : 'Watched'], ['paused', 'Paused'], ['dropped', 'Dropped']] : statusOptions;
}

export function RatingFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const { scale } = useRatingScale();
  const [open, setOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const [previewScore, setPreviewScore] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const dragging = useRef(false);
  const previewScoreRef = useRef<number | null>(null);
  const rawSelected = value.startsWith('min:') || value.startsWith('exact:') ? Number(value.replace(/^(min:|exact:)/, '')) : value === 'rated' ? 0.5 : 0;
  const selected = Number.isFinite(rawSelected) ? rawSelected : 0;
  const shownScore = previewScore ?? selected;
  const applyScore = (score: number) => onChange(`min:${Math.min(5, Math.max(.5, Math.round(score * 2) / 2))}`);
  const readPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const score = (Math.min(9, Math.round(fraction * 10)) + 1) / 2;
    previewScoreRef.current = score;
    setPreviewScore(score);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); previewScoreRef.current = null; setPreviewScore(null); } };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); previewScoreRef.current = null; setPreviewScore(null); trigger.current?.focus(); } };
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const panel = root.current?.querySelector<HTMLElement>('.rating-filter-popover');
      if (!anchor || !panel) return;
      const spaceBelow = window.innerHeight - anchor.bottom - 12;
      const spaceAbove = anchor.top - 12;
      setOpenAbove(spaceBelow < panel.offsetHeight && spaceAbove > spaceBelow);
    };
    const frame = window.requestAnimationFrame(place);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [open]);
  const label = ratingFilterLabel(value, scale);
  const parsedScore = value.startsWith('min:') || value.startsWith('exact:') ? Number(value.replace(/^(min:|exact:)/, '')) : null;
  const starScore = parsedScore != null && Number.isFinite(parsedScore) ? Math.min(5, Math.max(0, parsedScore)) : null;
  const shownRating = starScore == null ? null : displayedRating(starScore, scale);
  return <div className="filter-field toolbar-filter-field rating-filter-field" ref={root}>
    <span id={id} className="sr-only">My rating</span>
    <button ref={trigger} type="button" aria-labelledby={`${id} ${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined} className="select-trigger toolbar-select-trigger rating-filter-trigger" onClick={() => setOpen(current => !current)}>
      <span className="toolbar-select-label" aria-hidden="true">Rating</span><span id={`${id}-value`} className="toolbar-select-value">{starScore == null ? label : scale === 10 ? <span className="rating-number-value">{shownRating}+/10</span> : <><span className="rating-stars-value" aria-hidden="true">{[1, 2, 3, 4, 5].map(n => <Star key={n} fill={Math.max(0, Math.min(1, starScore - n + 1))} />)}</span><span className="sr-only">{label}</span></>}</span><Icon name="chevron" />
    </button>
    {open && <div id={`${id}-panel`} className={`rating-filter-popover${openAbove ? ' is-above' : ''}`} role="dialog" aria-label="Filter by rating">
      <div className="rating-filter-choices">
        <button type="button" aria-pressed={!value} onClick={() => { previewScoreRef.current = null; setPreviewScore(null); onChange(''); }}>Any rating</button>
        <button type="button" aria-pressed={value === 'unrated'} onClick={() => { previewScoreRef.current = null; setPreviewScore(null); onChange('unrated'); }}>No rating</button>
      </div>
      <p className="rating-filter-heading">Rating (or range)</p>
      <div className="rating-range-row">
        <div className={`rating-range-slider${scale === 10 ? ' ten-point' : ''}${isDragging ? ' is-dragging' : ''}`} role="slider" tabIndex={0} aria-label="Minimum rating" aria-orientation="horizontal" aria-valuemin={scale === 10 ? 1 : 0.5} aria-valuemax={scale} aria-valuenow={shownScore ? displayedRating(shownScore, scale) : scale === 10 ? 1 : 0.5} aria-valuetext={shownScore ? scale === 10 ? `${displayedRating(shownScore, scale)} out of 10 and up` : `${shownScore} stars and up` : 'No minimum rating selected'}
          onKeyDown={event => {
            if (event.key === 'Home' || event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); previewScoreRef.current = null; setPreviewScore(null); onChange(''); return; }
            if (event.key === 'End') { event.preventDefault(); previewScoreRef.current = null; setPreviewScore(null); applyScore(5); return; }
            if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown'].includes(event.key)) { event.preventDefault(); previewScoreRef.current = null; setPreviewScore(null); applyScore((selected || .5) + (['ArrowRight', 'ArrowUp'].includes(event.key) ? .5 : -.5)); }
          }}
          onPointerEnter={event => { if (event.pointerType !== 'touch') readPointer(event); }}
          onPointerDown={event => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; setIsDragging(true); readPointer(event); }}
          onPointerMove={event => { if (dragging.current || event.pointerType !== 'touch') readPointer(event); }}
          onPointerUp={() => { const commit = dragging.current ? previewScoreRef.current : null; dragging.current = false; setIsDragging(false); if (commit != null) applyScore(commit); previewScoreRef.current = null; setPreviewScore(null); }}
          onPointerCancel={() => { dragging.current = false; setIsDragging(false); previewScoreRef.current = null; setPreviewScore(null); }}
          onPointerLeave={() => { if (!dragging.current) { previewScoreRef.current = null; setPreviewScore(null); } }}>
          {scale === 10
            ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <span className={`rating-point${shownScore && n <= displayedRating(shownScore, scale) ? ' is-filled' : ''}`} key={n}>{n}</span>)
            : [1, 2, 3, 4, 5].map(n => <Star key={n} fill={Math.max(0, Math.min(1, shownScore - n + 1))} />)}
        </div>
        <span className="rating-range-value" aria-hidden="true">{shownScore ? scale === 10 ? `${displayedRating(shownScore, scale)}${value.startsWith('exact:') && previewScore == null ? '/10 exactly' : '+/10'}` : `${shownScore}${value.startsWith('exact:') && previewScore == null ? ' stars exactly' : '+ stars'}` : 'Hover to preview'}</span>
      </div>
      <p className="rating-range-hint">Hover to preview · click to set · drag to adjust</p>
    </div>}
  </div>;
}
