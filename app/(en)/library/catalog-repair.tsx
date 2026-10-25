'use client';
/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from 'react';
import { Command, DiaryEvent, LibraryList, LibraryState, Work, typeNames, types, workSchema } from '../../../lib/library/model';
import { duplicateCandidates } from '../../../lib/library/discovery';
import { matchesTitle } from '../../../lib/library/text';
import { FieldSelect, Stars } from './controls';
type Save = (command: Command, message?: string) => Promise<boolean>;
type Catalogs = Record<Work['type'], boolean>;

export function ImportReview({ state, repair, editEvent, editList }: { state: LibraryState; repair: (w: Work) => void; editEvent: (e: DiaryEvent) => void; editList: (l: LibraryList) => void }) {
  const [query, setQuery] = useState(''), [shown, setShown] = useState(12);
  const activeIds = useMemo(() => new Set(state.records.filter(r => !r.deletedAt).map(r => r.workId)), [state.records]);
  const manual = useMemo(() => state.works.filter(w => activeIds.has(w.id) && (w.provider === 'manual' || !w.poster)), [state.works, activeIds]);
  const pairs = useMemo(() => duplicateCandidates(state), [state]);
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const future = state.events.filter(e => !e.deletedAt && e.date && e.date > today);
  const lists = state.lists.filter(l => !l.deletedAt), duplicateLists = lists.filter(l => lists.some(other => other.id !== l.id && other.name.trim().toLowerCase() === l.name.trim().toLowerCase()));
  const filtered = manual.filter(w => matchesTitle(w, query));
  return <section className="settings-section import-review"><h3>Review imported titles</h3><p className="muted">Match missing covers, correct categories and review possible duplicates. Nothing is merged automatically. Download a complete backup before cleanup.</p>
    <details><summary>Catalog and cover review · {manual.length}</summary><label className="form-field">Search titles to review<input type="search" value={query} onChange={e => { setQuery(e.target.value); setShown(12); }} /></label>
      {filtered.slice(0, shown).map(w => <div className="cleanup-row" key={w.id}><div><strong>{w.title}</strong><p className="muted">{w.year || 'Year unknown'} · {typeNames[w.type]} · {w.provider === 'manual' ? 'Manual metadata' : 'Missing cover'}</p></div><button className="secondary" onClick={() => repair(w)}>Review title</button></div>)}
      {!filtered.length && <p className="muted">No titles need review here.</p>}{filtered.length > shown && <button className="secondary" onClick={() => setShown(shown + 12)}>Show more titles</button>}
    </details>
    <details><summary>Possible duplicate titles · {pairs.length}</summary><p className="muted">Matching names and years are suggestions, not confirmed duplicates. Different adaptations may be separate works.</p>{pairs.map(([a, b]) => <div className="cleanup-row" key={`${a.id}:${b.id}`}><div><strong>{a.title}</strong><p className="muted">{typeNames[a.type]} / {typeNames[b.type]} · {a.year || b.year || 'Year unknown'}</p></div><button className="secondary" onClick={() => repair(a)}>Review match</button></div>)}</details>
    <details><summary>Future diary dates · {future.length}</summary><p className="muted">Dates were preserved from the exports. Correct them only if they are wrong.</p>{future.map(e => <div className="cleanup-row" key={e.id}><span>{state.works.find(w => w.id === e.workId)?.title} · {e.date}</span><button className="secondary" onClick={() => editEvent(e)}>Review date</button></div>)}</details>
    <details><summary>Repeated list names · {duplicateLists.length}</summary>{duplicateLists.map(l => <div className="cleanup-row" key={l.id}><span>{l.name} · {l.workIds.length} titles · {l.visibility}</span><button className="secondary" onClick={() => editList(l)}>Rename list</button></div>)}</details>
  </section>;
}

export function CatalogRepair({ source, state, revision, catalogs, save, busy, done }: { source: Work; state: LibraryState; revision: number; catalogs: Catalogs; save: Save; busy: boolean; done: () => void }) {
  const [metadataType, setMetadataType] = useState(source.type);
  const [type, setType] = useState(source.type), [query, setQuery] = useState(source.title), [results, setResults] = useState<Work[]>([]), [candidate, setCandidate] = useState<Work | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [recordFrom, setRecordFrom] = useState<'source' | 'target'>('target'), [approved, setApproved] = useState(false);
  const [prior, setPrior] = useState<LibraryState | null>(null), [cleanupRevision, setCleanupRevision] = useState<number | null>(null);
  const local = state.works.filter(w => w.id !== source.id && w.type === type && matchesTitle(w, query)).slice(0, 12);
  const sourceRecord = state.records.find(r => r.workId === source.id), targetRecord = state.records.find(r => r.workId === candidate?.id);
  const choose = (w: Work) => { setCandidate(w); setRecordFrom(state.records.some(r => r.workId === w.id) ? 'target' : 'source'); setApproved(false); setError(''); };
  async function load(w: Work) {
    setLoading(true); setError('');
    try { const r = await fetch(`/api/library/catalog?${new URLSearchParams({ type, id: w.providerId })}`); const data = await r.json(); if (!r.ok) throw new Error(data.error); choose(data.work); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load this title.'); } finally { setLoading(false); }
  }
  return <div className="catalog-repair"><p className="muted">Original: {source.title} · {typeNames[source.type]}. Ratings, notes, list memberships and every diary entry are preserved when matching.</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    {prior && <div className="restore-review"><p>Cleanup saved. You can undo it while this dialog stays open and no other library changes have been made.</p><button className="secondary" disabled={busy || revision !== cleanupRevision} onClick={async () => { if (await save({ op: 'restore', state: prior }, 'Catalog cleanup undone.')) { setPrior(null); setCandidate(null); } }}>Undo cleanup</button><button className="primary" onClick={done}>Done</button></div>}
    {!prior && <>
      <details className="review-options"><summary>Edit title metadata</summary><form onSubmit={async e => {
        e.preventDefault(); const f = new FormData(e.currentTarget); setError('');
        try { const work = workSchema.parse({ ...source, title: String(f.get('title')), type: metadataType, year: f.get('year') ? Number(f.get('year')) : null, poster: String(f.get('poster') || ''), genres: String(f.get('genres') || '').split(',').map(g => g.trim()).filter(Boolean), aliases: String(f.get('aliases') || '').split('\n').map(a => a.trim()).filter(Boolean), summary: String(f.get('summary') || '') }); if (await save({ op: 'metadata', work }, 'Title metadata updated. Ratings and history kept.')) done(); }
        catch { setError('Check the title, year, genres, alternate names and HTTPS cover URL. Nothing was saved.'); }
      }}><label className="form-field">Title<input name="title" required maxLength={500} defaultValue={source.title} /></label>
        {source.provider === 'manual' && <FieldSelect label="Category" value={metadataType} options={types.map(t => [t, typeNames[t]])} onChange={v => setMetadataType(v as Work['type'])} />}
        <label className="form-field">Release year<input name="year" type="number" min="1800" max="2200" defaultValue={source.year ?? ''} /></label>
        <label className="form-field">Cover URL<input name="poster" maxLength={1500} defaultValue={source.poster} /></label>
        <label className="form-field">Genres · separated by commas<input name="genres" maxLength={2400} defaultValue={source.genres.join(', ')} /></label>
        <label className="form-field">Alternate titles · one per line<textarea name="aliases" maxLength={10000} defaultValue={source.aliases?.join('\n') || ''} /></label>
        <label className="form-field">Description<textarea name="summary" maxLength={10000} defaultValue={source.summary} /></label><button className="primary" disabled={busy}>Save metadata</button>
      </form></details>
      <h3 className="subheading">Find the correct catalog title</h3><FieldSelect label="Match category" value={type} options={types.map(t => [t, typeNames[t]])} onChange={v => { setType(v as Work['type']); setResults([]); setCandidate(null); setApproved(false); }} />
      <form className="catalog-search" onSubmit={async e => { e.preventDefault(); setLoading(true); setError(''); try { const r = await fetch(`/api/library/catalog?${new URLSearchParams({ type, q: query })}`); const data = await r.json(); if (!r.ok) throw new Error(data.error); setResults(data.works); if (!data.works.length) setError('No matches. Try another title or edit the metadata manually.'); } catch (e) { setError(e instanceof Error ? e.message : 'Search failed.'); } finally { setLoading(false); } }}><label className="form-field">Search catalog or saved titles<input type="search" minLength={2} maxLength={200} value={query} onChange={e => { setQuery(e.target.value); setResults([]); setCandidate(null); setApproved(false); }} /></label><button className="secondary" disabled={loading || !catalogs[type]}>{loading ? 'Searching…' : 'Search catalog'}</button></form>
      {!catalogs[type] && <p className="muted">Catalog search is unavailable. You can still choose an existing title or edit metadata.</p>}
      <div className="search-results">{local.map(w => <button type="button" className="result" key={w.id} onClick={() => choose(w)}><strong>{w.title}</strong><span>{w.year || 'Year unknown'} · Already in your library</span></button>)}{results.map(w => <button type="button" className="result" key={w.id} disabled={loading} onClick={() => load(w)}><strong>{w.title}</strong><span>{w.year || 'Year unknown'} · {w.provider.toUpperCase()}</span></button>)}</div>
      {candidate && <div className="restore-review"><h3>Review this match</h3><p>{source.title} → <strong>{candidate.title}</strong> · {candidate.year || 'Year unknown'} · {typeNames[candidate.type]}</p>{candidate.poster && <img className="match-cover" src={candidate.poster} alt={`${candidate.title} cover`} width={100} height={150} />}
        {targetRecord && candidate.id !== source.id ? <><p>This title already exists. The two records will be merged; all diary entries and list memberships stay. Original record values are retained in private notes. If either record is private, the merged collection record stays private.</p><FieldSelect label="Keep current rating and status from" value={recordFrom} options={[["target", `Existing catalog title · ${targetRecord.status}`], ["source", `Imported title · ${sourceRecord?.status || 'No collection record'}`]]} onChange={v => { setRecordFrom(v as 'source' | 'target'); setApproved(false); }} /><div className="match-ratings"><span>Imported <Stars rating={sourceRecord?.rating} /></span><span>Existing <Stars rating={targetRecord.rating} /></span></div></> : <p>Catalog metadata will replace this title’s metadata. Its collection values and history stay as they are.</p>}
        <label className="check-label"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />I checked that these are the same work.</label><button className="primary" disabled={busy || loading || !approved} onClick={async () => { const before = structuredClone(state); if (await save({ op: 'reconcile', sourceId: source.id, work: candidate, recordFrom }, 'Catalog match saved. History and lists kept.')) { setPrior(before); setCleanupRevision(revision + 1); } }}>Save reviewed match</button>
      </div>}
    </>}
  </div>;
}
