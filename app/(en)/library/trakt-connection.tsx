'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LibraryState } from '../../../lib/library/model';
import type { TraktPreview } from '../../../lib/library/trakt-core';
import { traktFailureMessage } from '../../../lib/library/trakt-messages';
type Snapshot = { state: LibraryState; revision: number; owner: boolean };
type Status = { configured: boolean; canConnect: boolean; connected: boolean; username?: string; message?: string; lastChecked?: string; lastImported?: string; preview?: TraktPreview | null };
async function request(input?: unknown) {
  const response = await fetch('/api/library/trakt', input ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The Trakt request could not be completed.');
  return data;
}
export function TraktConnection({ revision, refreshLibrary, imported }: { revision: number; refreshLibrary: () => Promise<boolean>; imported: (snapshot: Snapshot) => void }) {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<string[]>([]), [disconnectReview, setDisconnectReview] = useState(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const params = useSearchParams(), preview = status?.preview;
  useEffect(() => { let alive = true; request().then(data => { if (alive) setStatus(data); }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, []);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Check your connection and try again.'); } finally { setBusy(false); } };
  const load = async () => setStatus(await request());
  const check = (page = 1) => run(async () => { const next = await request({ action: 'preview', page, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh' }); setStatus(current => current && ({ ...current, preview: next, lastChecked: next.checkedAt })); setSelected([]); pending.current = null; });
  const eligible = preview?.entries.filter(v => !v.duplicate && !v.removed) ?? [];
  return <section className="settings-section trakt-connection" aria-labelledby="trakt-heading">
    <div className="section-heading"><h3 id="trakt-heading">Harbor → Trakt</h3><span className="muted">{status ? status.connected ? `Connected · @${status.username}` : 'Not connected' : 'Checking connection…'}</span></div>
    <p>Connect the same Trakt account you use in Harbor. Review watched titles here before adding them to your private collection.</p>
    <p className="muted">Your ratings, notes and progress stay as you set them. Imports are private and make no changes to Trakt. Series, including anime, use TMDB titles; episode tracking is off for this MVP.</p>
    {params.get('trakt') === 'failed' && !status?.connected && <p className="error-message" role="alert">{traktFailureMessage(params.get('trakt_reason'))}</p>}
    {params.get('trakt') === 'connected' && status?.connected && <p role="status">Trakt connected. You can now review your history.</p>}
    {status?.message && <p className="muted">{status.message}</p>}
    {error && <><p className="error-message" role="alert">{error}</p><button className="secondary" disabled={busy} onClick={() => run(async () => { if (await refreshLibrary()) await load(); })}>Refresh library and connection</button></>}
    {notice && <p role="status">{notice}</p>}
    {!status && <button className="secondary" disabled={busy} onClick={() => run(load)}>Retry connection check</button>}
    {status && !status.connected && <button className="primary" disabled={busy || !status.canConnect} onClick={() => run(async () => { const data = await request({ action: 'connect' }); window.location.assign(data.url); })}>Connect Trakt</button>}
    {status?.connected && <>
      <div className="trakt-actions"><button className="primary" disabled={busy} onClick={() => check()}>{busy ? 'Working…' : 'Check for watches'}</button><button className="text-button" disabled={busy} onClick={() => setDisconnectReview(true)}>Disconnect</button></div>
      <p className="muted">{status.lastChecked ? `Last checked: ${new Date(status.lastChecked).toLocaleString()}` : 'History has not been checked yet.'}{status.lastImported && ` · Last import: ${new Date(status.lastImported).toLocaleString()}`}</p>
      {disconnectReview && <div className="restore-review"><p>Remove the saved Trakt connection? Imported diary entries stay in your library. You can reconnect later.</p><button className="secondary" disabled={busy} onClick={() => run(async () => { const result = await request({ action: 'disconnect' }); await load(); setDisconnectReview(false); setSelected([]); setNotice(result.revoked ? 'Trakt disconnected. Imported entries are kept.' : 'Local connection removed. Trakt could not confirm revocation; remove this app in Trakt’s connected-app settings too.'); })}>Disconnect Trakt</button><button className="text-button" disabled={busy} onClick={() => setDisconnectReview(false)}>Keep connection</button></div>}
    </>}
    {preview && status?.connected && <div className="trakt-review">
      <h4>Review watch history</h4><p className="muted">Page {preview.page} of {preview.pages} · {preview.total} Trakt events · Dates shown in {preview.timezone}. History can change between pages; repeated imports skip watches already reviewed and saved.</p>
      <button className="text-button" disabled={busy || !eligible.length} onClick={() => setSelected(selected.length === eligible.length ? [] : eligible.map(v => v.entry.event.id))}>{selected.length === eligible.length && eligible.length ? 'Clear selection' : 'Select all new watches on this page'}</button>
      <div className="trakt-watch-list">{preview.entries.map(({ entry, duplicate, removed }) => <label className="trakt-watch" key={entry.event.id}><input type="checkbox" checked={selected.includes(entry.event.id)} disabled={busy || duplicate || removed} onChange={e => setSelected(current => e.target.checked ? [...current, entry.event.id] : current.filter(id => id !== entry.event.id))} /><span><strong>{entry.work.title}</strong><span>{entry.event.date} · {duplicate ? 'Already imported · kept as edited' : removed ? 'Removed title · skipped' : entry.work.type === 'movies' ? 'Mark Watched · private' : 'Mark Watching · private'}</span></span></label>)}</div>
      {!preview.entries.length && <p>No titles available to import on this page.</p>}
      {preview.skipped.length > 0 && <details><summary>{preview.skipped.length} watches need manual matching</summary>{preview.skipped.map((item, i) => <p key={i}><strong>{item.title}</strong> — {item.reason}</p>)}</details>}
      <div className="trakt-actions"><button className="primary" disabled={busy || !selected.length} onClick={() => run(async () => { const requestKey = JSON.stringify([preview.id, selected]); if (pending.current?.key !== requestKey) pending.current = { key: requestKey, id: crypto.randomUUID() }; const result = await request({ action: 'import', previewId: preview.id, selected, revision, requestId: pending.current.id }); imported(result); setSelected([]); pending.current = null; setNotice(result.warning || 'Selected titles saved to your private collection.'); await load(); })}>Import {selected.length || ''} selected watches</button>
        <button className="secondary" disabled={busy || preview.page <= 1} onClick={() => check(preview.page - 1)}>Previous page</button><button className="secondary" disabled={busy || preview.page >= preview.pages} onClick={() => check(preview.page + 1)}>Next page</button>
        <button className="text-button" disabled={busy} onClick={() => run(load)}>Refresh connection</button></div>
      <p className="muted">New or planned movies become Watched; series become Watching. Mark a whole series Watched yourself. Ratings, notes and other statuses are kept. Each title appears once per page.</p>
    </div>}
    <details className="trakt-privacy"><summary>Connection privacy</summary><p>The library saves encrypted Trakt access and refresh tokens on the server, your connected username, and one history page for review. Replacing a review removes the previous page. Imported entries retain a private source reference and original watch timestamp in your backup. Connection credentials never enter exports or visitor pages.</p><p>Disconnect removes tokens and the pending review. Imported entries are kept until you remove them in your library. History checks run when you request them; background synchronization is not enabled.</p></details>
    <a className="trakt-credit source-link" href="https://trakt.tv" target="_blank" rel="noreferrer"><span>Powered by</span><img src="/trakt-logo-dark.svg" alt="Trakt" width="85" height="24" /></a>
  </section>;
}
