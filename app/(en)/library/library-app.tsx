'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { applyCommand, backupSchema, browse, Command, DiaryEvent, emptyState, LibraryList, LibraryRecord, LibraryState, typeNames, types, Work } from '../../../lib/library/model';
import { libraryConfig } from '../../../lib/config';
import { FieldSelect, Icon, Modal, RatingFilter, RatingInput, RatingScaleProvider, Stars, ratingFilterLabel, statusesFor, useRatingScale } from './controls';
import { matchesTitle } from '../../../lib/library/text';
import { browseDiary, overviewPicks } from '../../../lib/library/discovery';
import { CatalogRepair, ImportReview } from './catalog-repair';
import { TraktConnection } from './trakt-connection';
import { Cover } from './cover';
import { LibraryStats, type StatsPeriod } from './library-stats';
import { LibraryRoulette } from './library-roulette';

type Snapshot = { state: LibraryState; revision: number; owner: boolean };
type Props = { initial: Snapshot; configured: boolean; catalogs: Record<Work['type'], boolean>; initialError?: string; admin?: boolean };
type Save = (command: Command, message?: string) => Promise<boolean>;
type LibraryViewLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const statusText = (r?: LibraryRecord, type?: Work['type']) => statusesFor(type).find(([v]) => v === r?.status)?.[1] || 'Not in collection';
function pushLibraryUrl(url: string, scrollToTop = false) {
  window.history.pushState(null, '', url);
  if (scrollToTop) window.scrollTo(0, 0);
}
function LibraryViewLink({ href, onClick, ...props }: LibraryViewLinkProps) {
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.currentTarget.target && event.currentTarget.target !== '_self') return;
    const destination = new URL(href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname !== window.location.pathname) return;
    event.preventDefault();
    pushLibraryUrl(destination.href, true);
  }} />;
}
function ErrorText({ value }: { value: string }) { return value ? <p className="error-message" role="alert">{value}</p> : null; }
function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) { return <div className="empty"><h3>{title}</h3><p>{text}</p>{action}</div>; }
const Rating = Stars;
function markReady(node: HTMLDivElement | null) { if (node) node.dataset.libraryReady = 'true'; }
function statusFilterOptions(type?: string): [string, string][] {
  if (type === 'games') return [['completed', 'Played'], ['active', 'Playing'], ['backlog', 'Backlog'], ['wishlist', 'Wishlist']];
  return [
    ['completed', type ? 'Watched' : 'Finished'],
    ...(type === 'movies' ? [] : [['active', type ? 'Watching' : 'In progress'] as [string, string]]),
    ['backlog', type ? 'Plan to watch' : 'Backlog'],
    ...(type === 'anime' ? [['paused', 'Paused'] as [string, string]] : []),
    ['dropped', 'Dropped'],
  ];
}

export default function LibraryApp(props: Props) {
  return <RatingScaleProvider><LibraryAppContent {...props} /></RatingScaleProvider>;
}

function LibraryAppContent({ initial, configured, catalogs, initialError = '', admin = false }: Props) {
  const { scale: ratingScale } = useRatingScale();
  const [snapshot, setSnapshot] = useState(initial), [error, setError] = useState(initialError), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [detail, setDetail] = useState<Work | null>(null), [log, setLog] = useState<Work | 'search' | null>(null);
  const [editingEvent, setEditingEvent] = useState<DiaryEvent | null>(null), [editingList, setEditingList] = useState<LibraryList | 'new' | null>(null);
  const [repair, setRepair] = useState<Work | null>(null);
  const [roulette, setRoulette] = useState(false);
  const [undo, setUndo] = useState<Command | null>(null);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  useEffect(() => () => { if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current); }, []);
  const clearNotice = () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
    setNotice('');
  };
  const showNotice = (message: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(current => current === message ? '' : current);
      setUndo(null);
      noticeTimer.current = null;
    }, 5000);
  };
  const params = useSearchParams(), pathname = usePathname(), router = useRouter();
  const { state, owner } = snapshot;
  const view = params.get('view') || 'overview';
  const activeRecords = useMemo(() => state.records.filter(r => !r.deletedAt), [state.records]), activeEvents = useMemo(() => state.events.filter(e => !e.deletedAt), [state.events]), activeLists = useMemo(() => state.lists.filter(l => !l.deletedAt), [state.lists]);
  const latestStatsYear = Math.max(
    new Date().getFullYear(),
    ...activeEvents.flatMap(event => event.date ? [Number(event.date.slice(0, 4))] : []),
    ...activeRecords.flatMap(record => [Number(record.addedAt.slice(0, 4)), Number(record.updatedAt.slice(0, 4))]),
  );
  const statsYears = [latestStatsYear - 2, latestStatsYear - 1, latestStatsYear];
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>(latestStatsYear);
  const records = new Map(activeRecords.map(r => [r.workId, r]));
  const workMap = useMemo(() => new Map(state.works.map(w => [w.id, w])), [state.works]);
  const getWork = (id: string) => workMap.get(id)!;
  const href = (next: string, values: Record<string, string> = {}) => `${pathname}?${new URLSearchParams({ view: next, ...values })}`;
  const open = (fn: () => void) => { focusReturn.current = document.activeElement as HTMLElement; fn(); };
  const close = (fn: () => void) => { fn(); requestAnimationFrame(() => focusReturn.current?.focus()); };
  const refresh = async () => {
    try { const response = await fetch('/api/library', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error); if (owner && !data.owner) throw new Error('Your session expired. Sign in again in a new tab, then retry. Your draft is still here.'); setSnapshot(data); setError(''); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'The library could not be refreshed.'); return false; }
  };
  const save: Save = async (command, message = 'Saved to your library.') => {
    if (busy) return false;
    const key = JSON.stringify(command);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    const previous = snapshot;
    const requestId = pending.current.id;
    setBusy(true); setError(''); clearNotice();
    try {
      const nextState = applyCommand(snapshot.state, command, requestId);
      setSnapshot({ ...snapshot, state: nextState });
      const response = await fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: snapshot.revision, requestId, command }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (data.owner !== true || !Number.isInteger(data.revision)) throw new Error('The save could not be confirmed. Refresh the library before retrying.');
      if (data.revision !== previous.revision + 1) {
        if (!await refresh()) throw new Error('The save finished, but the latest library could not be refreshed.');
      } else setSnapshot(current => ({ ...current, revision: data.revision }));
      pending.current = null; setUndo(null); showNotice(message); return true;
    } catch (e) { setSnapshot(previous); setError(e instanceof Error ? e.message : 'Saving failed. Your input is still here.'); return false; }
    finally { setBusy(false); }
  };
  const poster = (work: Work, index = 4, eager = view === 'collection' && index < 3) => <article className="poster-item" key={work.id}>
    <button className="poster-button" onClick={() => open(() => setDetail(work))}><span className="poster-frame" data-media-type={work.type}><Cover work={work} eager={eager} onImageLoad={image => {
      if (work.type !== 'anime' || !image.naturalWidth || !image.naturalHeight) return;
      const frame = image.closest<HTMLElement>('.poster-frame');
      if (frame) frame.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
    }} /></span><span className="poster-title">{work.title}</span></button>
    <p className="poster-meta">{work.year ?? 'Year unknown'} · {statusText(records.get(work.id), work.type)}</p><Rating rating={records.get(work.id)?.rating} />
  </article>;
  const navigateFilter = (key: string, value: string) => { const p = new URLSearchParams(params); p.set('view', view === 'diary' ? 'diary' : 'collection'); if (key !== 'page') p.delete('page'); if (key === 'decade') p.delete('year'); if (key === 'year') p.delete('decade'); if (value) p.set(key, value); else p.delete(key); pushLibraryUrl(`${pathname}?${p}`); };
  const filters = Object.fromEntries(params);
  const selectedType = types.find(type => type === filters.type);
  const selectedStatus = filters.status || (filters.list ? 'all' : 'completed');
  const results = useMemo(() => browse(state, { ...Object.fromEntries(params), status: filters.status || (filters.list ? 'all' : 'completed') }), [state, params, filters.status, filters.list]);
  const decadeStarts = [...new Set(results.years.map(year => Math.floor(year / 10) * 10))];
  const decadeOptions: [string, string][] = [['', 'Any decade'], ...decadeStarts.map(year => [String(year), `${year}s`] as [string, string]), ...(filters.decade && !decadeStarts.includes(Number(filters.decade)) ? [[filters.decade, `${filters.decade}s`] as [string, string]] : [])];
  const activeFilterChips: [string, string, string][] = [];
  if (filters.q) activeFilterChips.push(['q', 'Search', filters.q]);
  if (filters.genre) activeFilterChips.push(['genre', 'Genre', filters.genre]);
  if (filters.rating) activeFilterChips.push(['rating', 'Rating', ratingFilterLabel(filters.rating, ratingScale)]);
  if (filters.decade) activeFilterChips.push(['decade', 'Decade', `${filters.decade}s`]);
  if (filters.year) activeFilterChips.push(['year', 'Release year', filters.year]);
  if (filters.list) activeFilterChips.push(['list', 'List', activeLists.find(list => list.id === filters.list)?.name || 'List']);
  const diary = useMemo(() => browseDiary(state, Object.fromEntries(params)), [state, params]);

  return <div className="az-library" ref={markReady}>
    <a className="skip" href="#library-main">Skip to library</a>
    <header className="masthead"><div className="masthead-inner"><LibraryViewLink className="identity" href={href('overview')}>Library</LibraryViewLink>
      <nav aria-label="Library">{['overview', 'collection', 'diary', 'lists', ...(owner ? ['settings'] : [])].map(v => <LibraryViewLink key={v} href={href(v)} aria-current={view === v ? 'page' : undefined}>{v === 'settings' ? 'Admin' : v[0].toUpperCase() + v.slice(1)}</LibraryViewLink>)}</nav>
      <div className="header-actions">{owner ? <><button type="button" className="secondary" onClick={() => open(() => setRoulette(true))}>Pick for me</button><button className="primary" onClick={() => open(() => setLog('search'))}><Icon name="plus" />Add / Log</button></> : <Link className="secondary" href="/admin/library">Owner login</Link>}</div>
    </div></header>
    <main id="library-main" tabIndex={-1}>
      <section className="profile"><div className="profile-identity"><div><h1>{libraryConfig.name}</h1><p>{libraryConfig.description}</p></div></div><div className="profile-actions"><span>{owner ? 'Private owner workspace' : 'Published collection'}</span><Link href="/library">Public library <Icon name="arrow" /></Link></div></section>
      {error && <div className="save-error"><ErrorText value={error} />{configured && <button className="secondary" onClick={refresh}>Refresh library</button>}</div>}
      {!configured ? <Setup admin={admin} /> : admin && !owner ? <Login /> : <>
        {view === 'overview' && <div className="overview-layout"><div>
          <LibraryStats state={state} period={statsPeriod} years={statsYears} onPeriodChange={setStatsPeriod} />
          {owner && <section className="section"><div className="section-heading"><h2>Continue</h2><LibraryViewLink href={href('collection', { status: 'active' })}>View all</LibraryViewLink></div>
            {activeRecords.filter(r => r.status === 'active').slice(0, 3).map(r => { const w = getWork(r.workId), series = w.type === 'anime' || w.type === 'tv'; return <div className="continue-row" key={w.id}><Cover work={w} className="continue-cover" /><div className="continue-info"><h3>{w.title}</h3><p>{series ? 'Watching' : `${r.platform || 'Playing'}${r.hours != null ? ` · ${r.hours} hours` : ''}`}</p></div>
              {series ? <button className="secondary" disabled={busy} onClick={async () => { if (await save({ op: 'edit', workId: w.id, patch: { status: 'completed' } }, 'Marked Watched.')) setUndo({ op: 'edit', workId: w.id, patch: { status: r.status } }); }}>Mark Watched</button> : <button className="secondary" onClick={() => open(() => setLog(w))}>Log finish</button>}</div>; })}
            {!activeRecords.some(r => r.status === 'active') && <p className="section-empty">Start a series or game to keep your place here.</p>}
          </section>}
          {(['movies', 'anime', 'games', ...(activeRecords.some(r => getWork(r.workId).type === 'tv') ? ['tv'] : [])] as Work['type'][]).map(type => {
            const selection = overviewPicks(state, type), picks = selection.records;
            return <section className="section" key={type}><div className="section-heading"><div><h2>{typeNames[type]}</h2><p className="muted">{selection.label === 'Favorites' ? 'Favorites' : type === 'games' ? 'Recently finished' : 'Recently watched'}</p></div><LibraryViewLink href={href('collection', { type })}>View all</LibraryViewLink></div><div className="poster-grid">{picks.map((r, i) => poster(getWork(r.workId), i, type === 'movies' && i < 3))}</div>{!picks.length && <p className="section-empty">{owner ? `Your ${typeNames[type].toLowerCase()} will appear here after you add them.` : 'No published titles yet.'}</p>}</section>;
          })}
        </div><aside className="sidebar"><div className="section-heading"><h2>Recent diary</h2><LibraryViewLink href={href('diary')}>View all</LibraryViewLink></div>{activeEvents.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt)).slice(0, 4).map(e => <button key={e.id} className="diary-mini" onClick={() => open(() => setDetail(getWork(e.workId)))}><Cover work={getWork(e.workId)} /><span><strong>{getWork(e.workId).title}</strong><span>{e.date || 'Date unknown'}</span><Rating rating={e.rating} /></span></button>)}{!activeEvents.length && <p className="section-empty">{owner ? 'Log a watch or completion to begin your diary.' : 'No published diary entries yet.'}</p>}
          {owner && <div className="sidebar-note"><h2>Your workspace</h2><p>{activeRecords.length} titles · {activeEvents.length} diary entries · {activeLists.length} lists</p><LibraryViewLink className="source-link" href={href('settings')}>Manage library <Icon name="arrow" /></LibraryViewLink><p>Manage your Harbor → Trakt connection in Admin. Manual logging is always available.</p></div>}</aside></div>}

        {view === 'collection' && <section><div className="view-title"><div><h2>{filters.list ? activeLists.find(l => l.id === filters.list)?.name || 'List' : 'Collection'}</h2><p>{owner ? 'Your titles, your ratings, your order.' : 'Titles selected for sharing.'}</p></div></div>
          <div className="filters">{types.map(t => <button key={t} className="filter" aria-pressed={filters.type === t} onClick={() => navigateFilter('type', filters.type === t ? '' : t)}>{typeNames[t]}</button>)}
            <form className="collection-search-form" onSubmit={e => { e.preventDefault(); navigateFilter('q', String(new FormData(e.currentTarget).get('q') || '').trim()); }}><label className="sr-only" htmlFor="collection-q">Search saved titles</label><input className="collection-search" id="collection-q" name="q" type="search" placeholder="Search your collection" defaultValue={filters.q || ''} key={filters.q} maxLength={200} /><button className="secondary">Search</button></form></div>
          {selectedType && !filters.list && <LibraryStats state={state} period={statsPeriod} years={statsYears} onPeriodChange={setStatsPeriod} type={selectedType} />}
          <div className="collection-filter-bar">
            <div className="collection-statuses" role="group" aria-label="Filter by status">
              {statusFilterOptions(filters.type).map(([status, label]) => <button key={status} type="button" aria-pressed={selectedStatus === status} onClick={() => navigateFilter('status', selectedStatus === status ? 'all' : status)}>{label}</button>)}
            </div>
            <div className="collection-filter-menus">
              <FieldSelect compact label="Genre" value={filters.genre || ''} options={[['', 'All genres'], ...results.genres.map(([g, n]): [string, string] => [g, `${g} (${n})`]), ...(filters.genre && !results.genres.some(([g]) => g === filters.genre) ? [[filters.genre, `${filters.genre} (0)`] as [string, string]] : [])]} onChange={v => navigateFilter('genre', v)} />
              <RatingFilter value={filters.rating || ''} onChange={v => navigateFilter('rating', v)} />
              <FieldSelect compact label="Decade" value={filters.decade || ''} options={decadeOptions} onChange={v => navigateFilter('decade', v)} />
            </div>
          </div>
          <p className="filter-note">Genre counts are for this category before other filters.</p>
          <div className="results-toolbar"><p role="status">{results.total} {results.total === 1 ? 'title' : 'titles'}</p><div className="result-controls"><FieldSelect label="Sort by" value={filters.sort || ''} options={[['', 'Collection order'], ['highest', 'My rating: highest'], ['lowest', 'My rating: lowest'], ['newest', 'Release: newest'], ['oldest', 'Release: oldest'], ['title', 'Title A–Z'], ['updated', 'Recently updated']]} onChange={v => navigateFilter('sort', v)} /><div className="layout-switch"><button aria-pressed={filters.viewMode !== 'list'} onClick={() => navigateFilter('viewMode', '')}>Posters</button><button aria-pressed={filters.viewMode === 'list'} onClick={() => navigateFilter('viewMode', 'list')}>List</button></div></div></div>
          {activeFilterChips.length > 0 && <div className="active-filters">{activeFilterChips.map(([key, label, value]) => <button className="chip" key={key} onClick={() => navigateFilter(key, '')}><span className="sr-only">{label}: </span>{value} <Icon name="close" /></button>)}{activeFilterChips.some(([key]) => key !== 'list') && <LibraryViewLink className="text-button" href={href('collection', { ...(filters.type ? { type: filters.type } : {}), ...(filters.list ? { list: filters.list } : {}) })}>Reset filters</LibraryViewLink>}</div>}
          {results.works.length ? filters.viewMode === 'list' ? <div>{results.works.map(w => <button className="collection-row" key={w.id} onClick={() => open(() => setDetail(w))}><span className="row-title"><Cover work={w} /><span><strong>{w.title}</strong><span>{w.year || 'Year unknown'} · {w.genres.join(', ')}</span></span></span><span className="row-status">{statusText(records.get(w.id), w.type)}</span><Rating rating={records.get(w.id)?.rating} /></button>)}</div> : <div className="poster-grid collection-grid">{results.works.map((work, index) => poster(work, index))}</div> : <Empty title={activeRecords.length ? 'No matching titles' : 'Your collection starts here'} text={activeRecords.length ? 'Remove a filter or try another title.' : owner ? 'Find a title or add one manually. Ratings and dates are optional.' : 'No collection records have been published.'} action={owner && !activeRecords.length ? <button className="primary" onClick={() => open(() => setLog('search'))}>Add your first title</button> : null} />}
          {results.pages > 1 && <nav className="pagination" aria-label="Collection pages"><button className="secondary" disabled={results.page === 1} onClick={() => navigateFilter('page', String(results.page - 1))}>Previous</button><span>Page {results.page} of {results.pages}</span><button className="secondary" disabled={results.page === results.pages} onClick={() => navigateFilter('page', String(results.page + 1))}>Next</button></nav>}
        </section>}

        {view === 'diary' && <section><div className="view-title"><div><h2>Diary</h2><p>Watched titles and finished games. Your reviews live here.</p></div></div>
          <form className="diary-filters" key={params.toString()} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget), p = new URLSearchParams({ view: 'diary' }); for (const key of ['q', 'type', 'from', 'to']) { const v = String(f.get(key) || '').trim(); if (v) p.set(key, v); } pushLibraryUrl(`${pathname}?${p}`); }}>
            <label className="form-field">Search diary<input name="q" type="search" maxLength={200} defaultValue={filters.q || ''} placeholder="Title or review" /></label>
            <DiaryCategory initial={filters.type || ''} />
            <label className="form-field">From date<input type="date" name="from" defaultValue={filters.from || ''} max={filters.to || undefined} /></label><label className="form-field">Through date<input type="date" name="to" defaultValue={filters.to || ''} min={filters.from || undefined} /></label><button className="secondary">Apply filters</button><LibraryViewLink className="text-button" href={href('diary')}>Reset</LibraryViewLink>
          </form><p className="muted" role="status">{diary.total} diary entries{(filters.from || filters.to) && ' · Undated entries are excluded from date ranges'}</p><div className="diary-list">
          {diary.events.map(e => <article className="diary-entry" key={e.id}><span className="diary-date">{e.date || 'Undated'}<span>{getWork(e.workId).type === 'games' ? 'Finished' : 'Watched'}</span></span><Cover work={getWork(e.workId)} /><div><button className="diary-title" onClick={() => open(() => setDetail(getWork(e.workId)))}>{getWork(e.workId).title}</button><Rating rating={e.rating} />{e.review && (e.spoiler ? <details><summary>Spoiler review</summary><p>{e.review}</p></details> : <p>{e.review}</p>)}{owner && <p className="muted">{e.visibility === 'public' ? 'Published' : 'Private'}</p>}</div>{owner && <button className="text-button" onClick={() => open(() => setEditingEvent(e))}>Edit</button>}</article>)}
          {!diary.events.length && <Empty title={activeEvents.length ? 'No matching diary entries' : 'No diary entries yet'} text={activeEvents.length ? 'Try another title, category or date range.' : owner ? 'Log a watch or finish to record an event. Marking Watched alone leaves your diary untouched.' : 'No diary entries have been published.'} />}
          </div>{diary.pages > 1 && <nav className="pagination" aria-label="Diary pages"><button className="secondary" disabled={diary.page === 1} onClick={() => navigateFilter('page', String(diary.page - 1))}>Previous</button><span>Page {diary.page} of {diary.pages}</span><button className="secondary" disabled={diary.page === diary.pages} onClick={() => navigateFilter('page', String(diary.page + 1))}>Next</button></nav>}
        </section>}

        {view === 'lists' && <section><div className="view-title"><div><h2>Lists</h2><p>Make room for a mood, a theme, or a recommendation.</p></div>{owner && <button className="secondary" onClick={() => open(() => setEditingList('new'))}>Create list</button>}</div>
          {activeLists.map(l => <article className="list-row" key={l.id}><LibraryViewLink className="list-preview" href={href('collection', { list: l.id })}><span className="list-strip">{l.workIds.slice(0, 3).map(id => <Cover key={id} work={getWork(id)} />)}</span><span><h3>{l.name}</h3><p>{l.workIds.length} titles{owner ? ` · ${l.visibility}` : ''}</p>{l.description && <p>{l.description}</p>}</span></LibraryViewLink>{owner && <button className="text-button" onClick={() => open(() => setEditingList(l))}>Edit</button>}</article>)}
          {!activeLists.length && <Empty title="No lists yet" text={owner ? 'Create a list, then add titles from their details. Sharing a list keeps your private notes and progress private.' : 'No lists have been published.'} />}
        </section>}
        {view === 'settings' && owner && <Settings state={state} revision={snapshot.revision} refreshLibrary={refresh} imported={data => { setSnapshot(data); showNotice('Watches imported.'); }} catalogs={catalogs} save={save} busy={busy} openWork={w => open(() => setDetail(w))} repair={w => open(() => setRepair(w))} editEvent={e => open(() => setEditingEvent(e))} editList={l => open(() => setEditingList(l))} />}
      </>}
      <footer><span>A personal collection, in your own space.</span><Link href="/library">Public library <Icon name="arrow" /></Link>{owner && <button className="text-button" onClick={async () => { const r = await fetch('/api/library/auth', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (r.ok) { setSnapshot({ state: emptyState(), revision: 0, owner: false }); setDetail(null); setLog(null); router.replace('/library'); router.refresh(); } else setError('Sign out failed. Please try again.'); }}>Sign out</button>}</footer>
    </main>
    {(busy || notice) && <div className="toast" role="status" aria-live="polite"><span>{busy ? 'Saving…' : notice}</span>{!busy && undo && <button onClick={async () => { if (await save(undo, 'Progress restored.')) setUndo(null); }}>Undo</button>}{!busy && <button aria-label="Dismiss notification" onClick={() => { clearNotice(); setUndo(null); }}><Icon name="close" /></button>}</div>}
    {owner && roulette && <Modal title="Pick for me" close={() => close(() => setRoulette(false))}><LibraryRoulette state={state} initialCategory={view === 'collection' ? selectedType : undefined} onViewTitle={work => { setRoulette(false); setDetail(work); }} /></Modal>}
    {detail && <Modal title={detail.title} close={() => close(() => setDetail(null))}><ErrorText value={error} />{error && <button className="secondary" onClick={refresh}>Refresh library</button>}<TitleDetails work={detail} record={records.get(detail.id)} nextFavorite={Math.max(0, ...activeRecords.filter(r => getWork(r.workId).type === detail.type).map(r => r.favorite || 0)) + 1} events={activeEvents.filter(e => e.workId === detail.id)} lists={activeLists} owner={owner} save={save} busy={busy} log={() => { setDetail(null); setLog(detail); }} repair={() => { setDetail(null); setRepair(detail); }} browseGenre={g => { close(() => setDetail(null)); pushLibraryUrl(href('collection', { genre: g }), true); }} /></Modal>}
    {repair && owner && <Modal title="Review title and catalog match" close={() => close(() => setRepair(null))}><ErrorText value={error} />{error && <button className="secondary" onClick={refresh}>Refresh library</button>}<CatalogRepair source={repair} state={state} revision={snapshot.revision} catalogs={catalogs} save={save} busy={busy} done={() => close(() => setRepair(null))} /></Modal>}
    {log && owner && <Modal title={log === 'search' ? 'Add to your library' : log.type === 'games' ? 'Log a finish' : 'Log a watch'} close={() => close(() => setLog(null))}><ErrorText value={error} />{error && <button className="secondary" onClick={refresh}>Refresh library</button>}<AddForm selected={log === 'search' ? null : log} state={state} catalogs={catalogs} save={save} busy={busy} done={w => { close(() => setLog(null)); if (log === 'search') pushLibraryUrl(href('collection', { type: w.type, sort: 'updated' }), true); }} /></Modal>}
    {editingEvent && owner && <Modal title="Edit diary entry" close={() => close(() => setEditingEvent(null))}><ErrorText value={error} />{error && <button className="secondary" onClick={refresh}>Refresh library</button>}<EventForm event={editingEvent} work={getWork(editingEvent.workId)} save={save} busy={busy} done={() => close(() => setEditingEvent(null))} /></Modal>}
    {editingList && owner && <Modal title={editingList === 'new' ? 'Create a list' : 'Edit list'} close={() => close(() => setEditingList(null))}><ErrorText value={error} />{error && <button className="secondary" onClick={refresh}>Refresh library</button>}<ListForm list={editingList === 'new' ? null : editingList} state={state} save={save} busy={busy} done={() => close(() => setEditingList(null))} /></Modal>}
  </div>;
}

function Setup({ admin }: { admin: boolean }) {
  return <section className="setup-panel"><h2>{admin ? 'Connect your private workspace' : 'The library is getting ready'}</h2><p>{admin ? 'The design is ready for your records. Connect the database and owner account to start saving across phone and desktop.' : 'Published films, anime and games will appear here once the library is connected.'}</p>
    {admin && <><ol><li>Create a Supabase project and turn off public signups.</li><li>Create your owner account and run all included database migrations in order, then allowlist your owner ID.</li><li>Add the project URL, publishable key and owner ID to the environment settings.</li><li>Add catalog credentials when ready. Manual title entry works independently.</li></ol><p>The setup guide is included in the project at <code>docs/setup.md</code>.</p></>}
    <Link className="secondary" href={admin ? '/library' : '/admin/library'}>{admin ? 'View library' : 'Owner setup'} <Icon name="arrow" /></Link>
  </section>;
}
function Login() {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const router = useRouter();
  return <section className="login-panel"><h2>Welcome back</h2><p>Sign in to your private library workspace.</p><form onSubmit={async e => {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setError('');
    try { const r = await fetch('/api/library/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) }); const result = await r.json(); if (!r.ok) throw new Error(result.error); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Login failed. Check your connection and try again.'); } finally { setBusy(false); }
  }}><label className="form-field">Email<input type="email" name="email" autoComplete="username" required maxLength={320} /></label><label className="form-field">Password<input type="password" name="password" autoComplete="current-password" required maxLength={1000} /></label><ErrorText value={error} /><button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><Link className="text-button" href="/admin/library/reset-password">Forgot your password?</Link><p className="muted">Owner access only. Visitors don’t need an account.</p></section>;
}

function AddForm({ selected, state, catalogs, save, busy, done }: { selected: Work | null; state: LibraryState; catalogs: Props['catalogs']; save: Save; busy: boolean; done: (work: Work) => void }) {
  const [work, setWork] = useState(selected), [type, setType] = useState<Work['type']>(selected?.type || 'movies'), [query, setQuery] = useState('');
  const [results, setResults] = useState<Work[]>([]), [searching, setSearching] = useState(false), [error, setError] = useState(''), [manual, setManual] = useState(false);
  const [intent, setIntent] = useState(selected ? 'log' : 'backlog'), [rating, setRating] = useState(''), [date, setDate] = useState(today()), [review, setReview] = useState(''), [spoiler, setSpoiler] = useState(false), [visibility, setVisibility] = useState('private');
  const [eventId] = useState(() => crypto.randomUUID()), [updateRating, setUpdateRating] = useState(false);
  const local = state.works.filter(w => w.type === type && matchesTitle(w, query)).slice(0, 12);
  if (!work) return <>
    <FieldSelect label="Category" value={type} options={types.map(t => [t, typeNames[t]])} onChange={v => { setType(v as Work['type']); setResults([]); setError(''); }} />
    {!manual ? <><form className="catalog-search" onSubmit={async e => { e.preventDefault(); setSearching(true); setError(''); try { const r = await fetch(`/api/library/catalog?${new URLSearchParams({ type, q: query })}`); const d = await r.json(); if (!r.ok) throw new Error(d.error); setResults(d.works); if (!d.works.length) setError('No catalog matches. Try another title or add it manually.'); } catch (e) { setError(e instanceof Error ? e.message : 'Search failed.'); } finally { setSearching(false); } }}>
      <label className="form-field">Find a title<input type="search" value={query} onChange={e => { setQuery(e.target.value); setResults([]); }} placeholder="Type a title" minLength={2} maxLength={200} /></label><button className="secondary" disabled={searching || !catalogs[type]}>{searching ? 'Searching…' : 'Search catalog'}</button></form>
      {!catalogs[type] && <p className="search-hint">This catalog is not connected yet. Add a title manually or configure your own catalog credentials.</p>}<ErrorText value={error} />
      {local.length > 0 && <><h3 className="subheading">{query ? 'Saved titles' : 'Your saved titles'}</h3><div className="search-results">{local.map(w => <button className="result" key={w.id} onClick={() => { setWork(w); setError(''); }}><Cover work={w} /><span><strong>{w.title}</strong><span>{w.year || 'Year unknown'} · {state.records.some(r => r.workId === w.id) ? 'In your library' : 'Confirmed favorite · not saved yet'}</span></span><Icon name="arrow" /></button>)}</div></>}
      {results.length > 0 && <><h3 className="subheading">Catalog matches</h3><div className="search-results">{results.map(w => <button className="result" key={w.id} disabled={searching} onClick={async () => { setSearching(true); setError(''); try { const r = await fetch(`/api/library/catalog?${new URLSearchParams({ type, id: w.providerId })}`); const d = await r.json(); if (!r.ok) throw new Error(d.error); setWork(d.work); } catch (e) { setError(e instanceof Error ? e.message : 'Details failed.'); } finally { setSearching(false); } }}><Cover work={w} /><span><strong>{w.title}</strong><span>{w.year || 'Year unknown'} · {w.provider.toUpperCase()}</span></span></button>)}</div></>}
      <button className="text-button source-link" onClick={() => setManual(true)}>Can’t find it? Add manually <Icon name="arrow" /></button>
    </> : <ManualTitle type={type} done={w => { setWork(w); setError(''); }} back={() => setManual(false)} />}
  </>;
  return <form onSubmit={async e => {
    e.preventDefault(); setError('');
    const r = rating ? Number(rating) : null;
    let command: Command;
    if (intent === 'log') command = { op: 'log', work, updateRating: updateRating && r != null, event: { id: eventId, workId: work.id, date: date || null, rating: r, review, spoiler, visibility: visibility as 'private' | 'public', kind: work.type === 'games' ? 'completion' : 'watch', episodeFrom: null, episodeTo: null, season: 1 } };
    else command = { op: 'save', work, patch: { status: intent as LibraryRecord['status'], ...(rating ? { rating: r } : {}) } };
    if (await save(command, intent === 'wishlist' ? 'Added to your wishlist. No diary entry was added.' : intent === 'backlog' ? 'Saved for later. No diary entry was added.' : intent === 'completed' ? 'Marked completed. No date was invented.' : 'Diary entry saved.')) done(work);
    else setError('Your entry has not been confirmed saved. You can correct it and retry.');
  }}><div className="selected-title"><Cover work={work} /><div><h3>{work.title}</h3><p>{work.year || 'Year unknown'} · {typeNames[work.type]}</p></div></div>
    <button type="button" className="text-button" onClick={() => setWork(null)}>Choose another title</button>
    <FieldSelect label="What would you like to do?" value={intent} options={[["backlog", work.type === 'games' ? 'Plan to play' : 'Plan to watch'], ['wishlist', 'Add to wishlist'], ['active', work.type === 'games' ? 'Start playing' : 'Start watching'], ['completed', work.type === 'games' ? 'Mark finished · date unknown' : 'Mark Watched · date unknown'], ['log', work.type === 'games' ? 'Log a finish / replay' : 'Log a watch / rewatch']]} onChange={setIntent} />
    <RatingInput label={intent === 'log' ? 'Rating for this diary entry (optional)' : 'My rating (optional)'} value={rating} onChange={setRating} />
    {(intent === 'log') && <><label className="form-field">Date · today by default<input type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} /><span className="muted">Clear this field if the date is unknown.</span></label>
      <label className="check-label"><input type="checkbox" disabled={!rating} checked={!!rating && updateRating} onChange={e => setUpdateRating(e.target.checked)} />Also update my current rating</label><p className="muted">Leaving this entry unrated keeps your current rating.</p>
      <details className="review-options"><summary>Add a review (optional)</summary><label className="form-field">Review<textarea value={review} maxLength={20000} onChange={e => setReview(e.target.value)} /></label><label className="check-label"><input type="checkbox" checked={spoiler} onChange={e => setSpoiler(e.target.checked)} />Contains spoilers</label></details>
      <FieldSelect label="Diary visibility" value={visibility} options={[["private", 'Private'], ['public', 'Publish this diary entry']]} onChange={setVisibility} /></>}
    <ErrorText value={error} /><div className="form-bottom"><span className="muted">{intent === 'log' ? 'History is saved separately from current ratings.' : 'Your collection entry stays private by default.'}</span><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save entry'}</button></div>
  </form>;
}

function ManualTitle({ type, done, back }: { type: Work['type']; done: (w: Work) => void; back: () => void }) {
  const [id] = useState(() => `manual:${crypto.randomUUID()}`);
  return <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); done({ id, type, title: String(f.get('title')).trim(), year: f.get('year') ? Number(f.get('year')) : null, poster: String(f.get('poster') || ''), genres: String(f.get('genres') || '').split(',').map(g => g.trim()).filter(Boolean), episodes: f.get('episodes') ? Number(f.get('episodes')) : null, seasons: null, summary: '', provider: 'manual', providerId: '', sourceUrl: '' }); }}>
    <h3 className="subheading">Add a missing title</h3><label className="form-field">Title<input name="title" required maxLength={500} /></label><label className="form-field">Release year (optional)<input name="year" type="number" min="1800" max="2200" /></label><label className="form-field">Cover URL (optional)<input name="poster" type="url" pattern="https://.*" maxLength={1500} placeholder="https://…" /></label><label className="form-field">Genres (optional)<input name="genres" maxLength={1000} placeholder="Drama, Romance" /></label>{['tv', 'anime'].includes(type) && <label className="form-field">Episode total (optional)<input name="episodes" type="number" min="1" max="100000" /></label>}<div className="form-bottom"><button type="button" className="text-button" onClick={back}>Back to search</button><button className="primary">Continue</button></div>
  </form>;
}

function TitleDetails({ work, record, nextFavorite, events, lists, owner, save, busy, log, repair, browseGenre }: { work: Work; record?: LibraryRecord; nextFavorite: number; events: DiaryEvent[]; lists: LibraryList[]; owner: boolean; save: Save; busy: boolean; log: () => void; repair: () => void; browseGenre: (g: string) => void }) {
  const [status, setStatus] = useState(record?.status || 'backlog'), [rating, setRating] = useState(record?.rating != null ? String(record.rating) : ''), [visibility, setVisibility] = useState(record?.visibility || 'private');
  const [favorite, setFavorite] = useState(Boolean(record?.favorite)), [notes, setNotes] = useState(record?.notes || '');
  const [platform, setPlatform] = useState(record?.platform || ''), [hours, setHours] = useState(record?.hours != null ? String(record.hours) : ''), [removed, setRemoved] = useState(false), [listQuery, setListQuery] = useState('');
  return <><div className="detail-hero"><Cover work={work} className="detail-cover" eager /><div><p>{work.year || 'Year unknown'} · {typeNames[work.type]}</p><div className="genre-links">{work.genres.map(g => <button className="text-button" key={g} onClick={() => browseGenre(g)}>{g}</button>)}</div>{work.episodes && <p>{work.episodes} episodes{work.seasons ? ` · ${work.seasons} seasons` : ''}</p>}<Rating rating={record?.rating} />{work.sourceUrl && <a className="source-link" href={work.sourceUrl} target="_blank" rel="noreferrer">Catalog details <Icon name="arrow" /></a>}</div></div>{work.summary && <details className="review-options synopsis"><summary>About this title</summary><p className="detail-summary">{work.summary}</p></details>}
    {owner && !removed && <form onSubmit={async e => { e.preventDefault(); await save({ op: 'save', work, patch: { status, rating: rating ? Number(rating) : null, visibility, favorite: favorite ? record?.favorite || nextFavorite : null, notes, platform, hours: hours ? Number(hours) : null } }); }}>
      <div className="tracking-fields"><FieldSelect label="Status" value={status} options={statusesFor(work.type)} onChange={v => setStatus(v as LibraryRecord['status'])} /><RatingInput label="My current rating" value={rating} onChange={setRating} /></div>
      <div className="detail-actions"><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button><button type="button" className="secondary" onClick={log}>{work.type === 'games' ? 'Log a finish' : 'Log a watch'}</button></div><p className="muted">Changing your rating or status does not create a diary entry.</p>
      {work.type === 'games' && <div className="tracking-fields"><label className="form-field">Platform (optional)<input value={platform} maxLength={100} onChange={e => setPlatform(e.target.value)} placeholder="PC, PS5, Switch…" /></label><label className="form-field">Hours played (optional)<input type="number" min="0" max="100000" step=".1" value={hours} onChange={e => setHours(e.target.value)} /></label></div>}
      <label className="check-label"><input type="checkbox" checked={favorite} onChange={e => setFavorite(e.target.checked)} />Favorite · order can be edited in Admin</label>
      <FieldSelect label="Collection visibility" value={visibility} options={[["private", 'Private'], ['public', 'Publish title, status and current rating']]} onChange={v => setVisibility(v as LibraryRecord['visibility'])} />
      <details className="review-options"><summary>Private notes</summary><label className="form-field">Notes<textarea value={notes} maxLength={20000} onChange={e => setNotes(e.target.value)} /></label><p className="muted">Notes, progress, platform and playtime always stay private.</p></details>

      {(record || (removed && busy)) && <button type="button" className="text-button danger-action" disabled={busy} onClick={async () => { setRemoved(true); if (!await save({ op: 'remove', workId: work.id, restore: false }, 'Moved to Recently removed. Diary and lists were kept.')) setRemoved(false); }}>{busy ? 'Removing…' : 'Remove from collection'}</button>}
      {lists.length > 0 && <details className="review-options list-memberships"><summary>Add to list · {lists.filter(l => l.workIds.includes(work.id)).length} selected</summary><label className="form-field">Find a list<input type="search" value={listQuery} onChange={e => setListQuery(e.target.value)} /></label>{lists.filter(l => l.name.toLowerCase().includes(listQuery.toLowerCase())).map(l => <label key={l.id} className="check-label"><input type="checkbox" disabled={busy} checked={l.workIds.includes(work.id)} onChange={e => { const selected = e.target.checked; save({ op: 'list', list: { id: l.id, name: l.name, description: l.description, visibility: l.visibility, workIds: selected ? [...l.workIds, work.id] : l.workIds.filter(id => id !== work.id) } }); }} />{l.name} · {l.workIds.length} titles · {l.visibility}</label>)}</details>}<button type="button" className="text-button" onClick={repair}>Edit metadata / match catalog</button>
    </form>}
    {removed && <p className="muted" role="status">{busy ? 'Removing from your collection…' : 'This title was removed from Collection. Restore it in Admin → Recently removed.'}</p>}
    <div className="detail-history"><h3 className="subheading">Diary history</h3>{events.length ? events.map(e => <div className="history-row" key={e.id}><span>{e.date || 'Date unknown'} · {e.kind}</span><Rating rating={e.rating} /></div>) : <p className="muted">No {owner ? '' : 'published '}events for this title.</p>}</div>
  </>;
}

function EventForm({ event, work, save, busy, done }: { event: DiaryEvent; work: Work; save: Save; busy: boolean; done: () => void }) {
  const [date, setDate] = useState(event.date || ''), [rating, setRating] = useState(event.rating != null ? String(event.rating) : ''), [review, setReview] = useState(event.review), [spoiler, setSpoiler] = useState(event.spoiler), [visibility, setVisibility] = useState(event.visibility);
  const [from, setFrom] = useState(String(event.episodeFrom || 1)), [to, setTo] = useState(String(event.episodeTo || 1)), [season, setSeason] = useState(String(event.season));
  return <form onSubmit={async e => { e.preventDefault(); if (await save({ op: 'event', event: { id: event.id, workId: event.workId, kind: event.kind, date: date || null, rating: rating ? Number(rating) : null, review, spoiler, visibility, episodeFrom: event.kind === 'episodes' ? Number(from) : null, episodeTo: event.kind === 'episodes' ? Number(to) : null, season: Number(season) } }, 'Diary entry updated. Current rating and progress were kept.')) done(); }}>
    <div className="selected-title"><Cover work={work} /><h3>{work.title}</h3></div><label className="form-field">Date (optional)<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>{date > today() && <p className="error-message">This date is in the future. Check the original date before saving.</p>}<RatingInput label="Event rating" value={rating} onChange={setRating} />
    {event.kind === 'episodes' && <div className="tracking-fields"><label className="form-field">Season<input type="number" required min="1" max="10000" value={season} onChange={e => setSeason(e.target.value)} /></label><label className="form-field">From episode<input type="number" required min="1" max="100000" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="form-field">Through episode<input type="number" required min={from} max="100000" value={to} onChange={e => setTo(e.target.value)} /></label></div>}
    <label className="form-field">Review (optional)<textarea value={review} onChange={e => setReview(e.target.value)} maxLength={20000} /></label><label className="check-label"><input type="checkbox" checked={spoiler} onChange={e => setSpoiler(e.target.checked)} />Contains spoilers</label><FieldSelect label="Visibility" value={visibility} options={[["private", 'Private'], ['public', 'Published']]} onChange={v => setVisibility(v as DiaryEvent['visibility'])} /><p className="muted">Editing this history entry leaves your current rating and progress unchanged.</p>
    <div className="form-bottom"><button type="button" className="text-button danger-action" disabled={busy} onClick={async () => { if (await save({ op: 'event-delete', id: event.id, restore: false }, 'Diary entry moved to Recently removed.')) done(); }}>Remove entry</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
  </form>;
}

function ListForm({ list, state, save, busy, done }: { list: LibraryList | null; state: LibraryState; save: Save; busy: boolean; done: () => void }) {
  const [id] = useState(list?.id || crypto.randomUUID()), [name, setName] = useState(list?.name || ''), [description, setDescription] = useState(list?.description || ''), [visibility, setVisibility] = useState(list?.visibility || 'private'), [workIds, setWorkIds] = useState(list?.workIds || []), [search, setSearch] = useState('');
  const move = (index: number, delta: number) => { const next = [...workIds]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; setWorkIds(next); };
  return <form onSubmit={async e => { e.preventDefault(); if (await save({ op: 'list', list: { id, name, description, visibility, workIds } })) done(); }}>
    <label className="form-field">List name<input required value={name} maxLength={150} onChange={e => setName(e.target.value)} /></label><label className="form-field">Description (optional)<textarea value={description} maxLength={5000} onChange={e => setDescription(e.target.value)} /></label><FieldSelect label="Visibility" value={visibility} options={[["private", 'Private'], ['public', 'Publish this list']]} onChange={v => setVisibility(v as LibraryList['visibility'])} /><p className="muted">Publishing a list shares its titles and description. Private ratings, diary entries and notes stay private.</p>
    <h3 className="subheading">Titles · ordered</h3>{workIds.map((id, i) => <div className="ordered-row" key={id}><span>{state.works.find(w => w.id === id)?.title}</span><button type="button" className="secondary" disabled={i === 0} aria-label={`Move ${state.works.find(w => w.id === id)?.title} up`} onClick={() => move(i, -1)}>Up</button><button type="button" className="secondary" disabled={i === workIds.length - 1} aria-label={`Move ${state.works.find(w => w.id === id)?.title} down`} onClick={() => move(i, 1)}>Down</button><button type="button" className="icon-button" aria-label={`Remove ${state.works.find(w => w.id === id)?.title} from list`} onClick={() => setWorkIds(workIds.filter(v => v !== id))}><Icon name="close" /></button></div>)}
    <label className="form-field">Add a saved title<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search collection" maxLength={200} /></label><div className="search-results">{state.works.filter(w => state.records.some(r => r.workId === w.id && !r.deletedAt) && !workIds.includes(w.id) && matchesTitle(w, search)).slice(0, 12).map(w => <button type="button" key={w.id} className="result" onClick={() => setWorkIds([...workIds, w.id])}><Cover work={w} /><strong>{w.title}</strong><Icon name="plus" /></button>)}</div>
    <div className="form-bottom">{list ? <button type="button" className="text-button danger-action" disabled={busy} onClick={async () => { if (await save({ op: 'list-delete', id, restore: false }, 'List moved to Recently removed.')) done(); }}>Remove list</button> : <span className="muted">Add titles now or later.</span>}<button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save list'}</button></div>
  </form>;
}

function Settings({ state, revision, refreshLibrary, imported, catalogs, save, busy, openWork, repair, editEvent, editList }: { state: LibraryState; revision: number; refreshLibrary: () => Promise<boolean>; imported: (snapshot: Snapshot) => void; catalogs: Props['catalogs']; save: Save; busy: boolean; openWork: (w: Work) => void; repair: (w: Work) => void; editEvent: (e: DiaryEvent) => void; editList: (l: LibraryList) => void }) {
  const { scale: ratingScale, setScale: setRatingScale } = useRatingScale();
  const [restore, setRestore] = useState<LibraryState | null>(null), [error, setError] = useState(''), [acknowledged, setAcknowledged] = useState(false);
  const [priorRestore, setPriorRestore] = useState<LibraryState | null>(null);
  const active = state.records.filter(r => !r.deletedAt);
  return <section className="settings"><div className="view-title"><div><h2>Library admin</h2><p>Your collection, sharing, backups and connections.</p></div></div>
    <section className="settings-section"><h3>Ratings</h3><p className="muted">Choose how ratings are shown and entered on this device. Existing ratings stay unchanged.</p><div className="layout-switch rating-scale-switch" role="group" aria-label="Rating scale"><button type="button" aria-pressed={ratingScale === 5} onClick={() => setRatingScale(5)}>5 stars</button><button type="button" aria-pressed={ratingScale === 10} onClick={() => setRatingScale(10)}>10-point</button></div></section>
    <ImportReview state={state} repair={repair} editEvent={editEvent} editList={editList} />
    <section className="settings-section"><h3>Favorites and order</h3><p className="muted">Choose favorites in title details, then set their order here. Ratings are a separate choice.</p>{types.map(type => {
      const favorites = active.filter(r => r.favorite && state.works.find(w => w.id === r.workId)?.type === type).sort((a, b) => a.favorite! - b.favorite!);
      return <div key={type}><h4>{typeNames[type]}</h4>{favorites.length ? favorites.map((r, i) => { const w = state.works.find(w => w.id === r.workId)!; const move = (delta: number) => { const next = favorites.map(r => r.workId); [next[i], next[i + delta]] = [next[i + delta], next[i]]; save({ op: 'favorites', type, workIds: next }); }; return <div className="ordered-row" key={w.id}><button className="text-button title-link" onClick={() => openWork(w)}>{w.title}</button><button className="secondary" disabled={busy || i === 0} aria-label={`Move ${w.title} up`} onClick={() => move(-1)}>Up</button><button className="secondary" disabled={busy || i === favorites.length - 1} aria-label={`Move ${w.title} down`} onClick={() => move(1)}>Down</button></div>; }) : <p className="section-empty">No favorites selected yet.</p>}</div>;
    })}</section>
    <section className="settings-section"><h3>Sharing</h3><p className="muted">Everything begins private. Publish collection entries, diary events, and lists separately. Notes, progress and game hours stay private.</p><a className="secondary" href="/library" target="_blank" rel="noreferrer">Open library <Icon name="arrow" /></a><p className="muted">Use a signed-out browser to check the visitor view. The unlisted URL is accessible to anyone who has it.</p></section>
    <section className="settings-section"><h3>Backups and restore</h3><p className="muted">The JSON backup includes your collection, diary, progress, ordered lists and removed records. CSV is a convenient collection summary.</p><div className="detail-actions"><a className="secondary" href="/api/library/export">Download complete backup</a><a className="secondary" href="/api/library/export?format=csv">Export collection CSV</a></div>
      <label className="form-field">Review a library backup<input type="file" accept=".json,application/json" onChange={async e => { setRestore(null); setError(''); setAcknowledged(false); const file = e.target.files?.[0]; if (!file) return; if (file.size > 5_000_000) { setError('Choose a JSON backup smaller than 5 MB.'); return; } try { const parsed = backupSchema.parse(JSON.parse(await file.text())); setRestore(parsed.state); } catch { setError('This is not a valid version 1 media library backup. Nothing has changed.'); } }} /></label><ErrorText value={error} />
      {restore && <div className="restore-review"><h4>Restore review</h4><p>{restore.records.filter(r => !r.deletedAt).length} collection entries · {restore.events.filter(e => !e.deletedAt).length} diary entries · {restore.lists.filter(l => !l.deletedAt).length} lists</p><p className="muted">This replaces the current library and its published view. Download a backup first. Review counts before confirming.</p><label className="check-label"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I want to replace this library with the reviewed backup.</label><button className="primary" disabled={busy || !acknowledged} onClick={async () => { const previous = structuredClone(state); if (await save({ op: 'restore', state: restore }, 'Backup restored.')) { setPriorRestore(previous); setRestore(null); setAcknowledged(false); } }}>Restore reviewed backup</button></div>}
      {priorRestore && <button className="secondary" disabled={busy} onClick={async () => { if (await save({ op: 'restore', state: priorRestore }, 'The pre-restore library was recovered.')) setPriorRestore(null); }}>Undo this restore</button>}
    </section>
    <section className="settings-section"><h3>Recently removed</h3><p className="muted">Restore records without rewriting their dates, ratings or related history.</p>{state.records.filter(r => r.deletedAt).map(r => <div className="ordered-row" key={r.workId}><span>{state.works.find(w => w.id === r.workId)?.title} · Collection</span><button className="secondary" disabled={busy} onClick={() => save({ op: 'remove', workId: r.workId, restore: true }, 'Collection entry restored.')}>Restore</button></div>)}{state.events.filter(e => e.deletedAt).map(e => <div className="ordered-row" key={e.id}><span>{state.works.find(w => w.id === e.workId)?.title} · {e.date || 'Undated'} diary entry</span><button className="secondary" disabled={busy} onClick={() => save({ op: 'event-delete', id: e.id, restore: true }, 'Diary entry restored.')}>Restore</button></div>)}{state.lists.filter(l => l.deletedAt).map(l => <div className="ordered-row" key={l.id}><span>{l.name} · List</span><button className="secondary" disabled={busy} onClick={() => save({ op: 'list-delete', id: l.id, restore: true }, 'List restored.')}>Restore</button></div>)}{![...state.records, ...state.events, ...state.lists].some(v => v.deletedAt) && <p className="section-empty">Nothing has been removed.</p>}</section>
    <section className="settings-section"><h3>Catalogs and connections</h3>{types.map(t => <div className="connection-row" key={t}><span>{typeNames[t]} · {t === 'anime' ? 'MyAnimeList' : t === 'games' ? 'IGDB' : 'TMDB'}</span><span>{catalogs[t] ? 'Credentials configured' : 'Not configured · manual entry available'}</span></div>)}<div className="connection-row"><span>Steam achievements</span><span>Planned · manual game tracking available</span></div><p className="muted">Catalog credentials are kept on the server.</p></section>
    <TraktConnection revision={revision} refreshLibrary={refreshLibrary} imported={imported} />
    <section className="settings-section"><h3>Credits</h3><p>This product uses the <a className="source-link" href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB API</a> but is not endorsed or certified by TMDB. Anime metadata: <a className="source-link" href="https://myanimelist.net/" target="_blank" rel="noreferrer">MyAnimeList</a>. Game metadata: <a className="source-link" href="https://www.igdb.com/" target="_blank" rel="noreferrer">IGDB</a>.</p></section>
  </section>;
}

function DiaryCategory({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <><input type="hidden" name="type" value={value} /><FieldSelect label="Diary category" value={value} options={[["", 'All categories'], ...types.map(t => [t, typeNames[t]] as [string, string])]} onChange={setValue} /></>;
}
