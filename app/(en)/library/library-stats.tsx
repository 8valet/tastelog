'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { LibraryState, typeNames, types, Work } from '../../../lib/library/model';

export type StatsPeriod = number | 'lifetime';

type Props = {
  state: LibraryState;
  period: StatsPeriod;
  years: number[];
  onPeriodChange: (period: StatsPeriod) => void;
  type?: Work['type'];
};

type StatRow = { label: string; value: number };

function titleIdsForPeriod(state: LibraryState, period: StatsPeriod, finishedOnly: boolean) {
  const workTypes = new Map(state.works.map(work => [work.id, work.type]));
  const records = new Map(state.records.filter(record => !record.deletedAt).map(record => [record.workId, record]));
  const idsByType = new Map<Work['type'], Set<string>>(types.map(type => [type, new Set()]));

  if (period === 'lifetime') {
    for (const record of records.values()) {
      if (!['backlog', 'wishlist'].includes(record.status) && (!finishedOnly || record.status === 'completed') && workTypes.has(record.workId)) {
        idsByType.get(workTypes.get(record.workId)!)?.add(record.workId);
      }
    }
  } else {
    const year = String(period);
    for (const event of state.events) {
      if (event.deletedAt || !event.date || event.date.slice(0, 4) !== year) continue;
      const type = workTypes.get(event.workId);
      const record = records.get(event.workId);
      if (type && (!finishedOnly || record?.status === 'completed')) idsByType.get(type)?.add(event.workId);
    }
  }

  return idsByType;
}

function PeriodButtons({ years, period, onChange }: { years: number[]; period: StatsPeriod; onChange: Props['onPeriodChange'] }) {
  return <div className="stats-period" role="group" aria-label="Statistics period">
    {years.map(year => <button key={year} type="button" aria-pressed={period === year} onClick={() => onChange(year)}>{year}</button>)}
    <button key="lifetime" type="button" aria-pressed={period === 'lifetime'} onClick={() => onChange('lifetime')}>Lifetime</button>
  </div>;
}

function Bars({ rows, label, summary, coverage, hasGenres, total, totalLabel, totalContext }: {
  rows: StatRow[];
  label: string;
  summary: string;
  coverage?: string;
  hasGenres?: boolean;
  total: number;
  totalLabel: string;
  totalContext: string;
}) {
  const maximum = Math.max(1, ...rows.map(row => row.value));
  const summaryId = `${label.replace(/\W+/g, '-').toLowerCase()}-summary`;
  const animationKey = JSON.stringify([label, summary, total, rows]);

  return <figure className="stats-chart" aria-label={label} aria-describedby={summaryId}>
    <p className="stats-summary" id={summaryId}>{summary}</p>
    <div className="stats-chart-split" key={animationKey}>
      <div className="stats-total-block">
        <strong className="stats-total">{total}</strong>
        <span className="stats-total-label">{totalLabel}</span>
        <span className="stats-total-context">{totalContext}</span>
      </div>
      <div className="stats-chart-breakdown">
        {hasGenres && <ul className="stats-compact-genres" aria-label="Top genres by number of titles">
          {rows.slice(0, 3).map((row, index) => <li className="stats-compact-genre" key={row.label}>
            <div className="stats-bar-label"><span>{row.label}</span><strong>{row.value}</strong></div>
            <span className="stats-bar-track" aria-hidden="true"><span style={{ '--bar-fill': `${row.value / maximum}`, '--bar-delay': `${index * 32}ms` } as CSSProperties} /></span>
          </li>)}
        </ul>}
        {!hasGenres && <ol className="stats-bars" aria-label="Titles by media category">
          {rows.map((row, index) => <li className="stats-bar-row" key={row.label}>
            <span className="stats-bar-label">{row.label}</span>
            <span className="stats-bar-track" aria-hidden="true"><span style={{ '--bar-fill': `${row.value / maximum}`, '--bar-delay': `${index * 32}ms` } as CSSProperties} /></span>
            <strong className="stats-bar-value">{row.value}</strong>
          </li>)}
        </ol>}
      </div>
    </div>
    {coverage && <p className="stats-coverage">{coverage}</p>}
    <details className="stats-table-details">
      <summary>{hasGenres ? `All ${rows.length} genres and data` : 'View data table'}</summary>
      {hasGenres && rows.length > 3 && <ul className="stats-bars stats-extra-genres" aria-label="Additional genres by number of titles">
        {rows.slice(3).map(row => <li className="stats-bar-row" key={row.label}><div className="stats-bar-label"><span>{row.label}</span><strong>{row.value}</strong></div><span className="stats-bar-track" aria-hidden="true"><span style={{ width: `${row.value / maximum * 100}%` }} /></span></li>)}
      </ul>}
      <table><caption>{label}</caption><thead><tr><th scope="col">Category</th><th scope="col">Titles</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value}</td></tr>)}</tbody>
      </table>
    </details>
  </figure>;
}

export function LibraryStats({ state, period, years, onPeriodChange, type }: Props) {
  const [finishedOnly, setFinishedOnly] = useState(false);
  const titleIds = useMemo(() => titleIdsForPeriod(state, period, Boolean(type && finishedOnly)), [state, period, type, finishedOnly]);
  const worksById = useMemo(() => new Map(state.works.map(work => [work.id, work])), [state.works]);
  const selectedIds = useMemo(() => type ? titleIds.get(type) ?? new Set<string>() : null, [titleIds, type]);
  const genreCounts = useMemo(() => {
    if (!type) return [];
    const counts = new Map<string, number>();
    for (const id of selectedIds ?? []) {
      for (const genre of worksById.get(id)?.genres ?? []) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
    return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }, [selectedIds, type, worksById]);
  const lifetimeGenreData = useMemo(() => {
    if (!type || period === 'lifetime') return { rows: [] as StatRow[], titleCount: 0, genreTitleCount: 0 };
    const lifetimeIds = titleIdsForPeriod(state, 'lifetime', finishedOnly).get(type) ?? new Set<string>();
    const counts = new Map<string, number>();
    let genreTitleCount = 0;
    for (const id of lifetimeIds) {
      const genres = worksById.get(id)?.genres ?? [];
      if (genres.length) genreTitleCount++;
      for (const genre of genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
    return {
      rows: [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)),
      titleCount: lifetimeIds.size,
      genreTitleCount,
    };
  }, [state, type, period, finishedOnly, worksById]);
  const rows = useMemo(() => type
    ? genreCounts
    : types.map(mediaType => ({ label: typeNames[mediaType], value: titleIds.get(mediaType)?.size ?? 0 })),
  [genreCounts, titleIds, type]);

  const periodName = period === 'lifetime' ? 'Lifetime' : String(period);
  const experiencedTotal = type ? selectedIds?.size ?? 0 : rows.reduce((sum, row) => sum + row.value, 0);
  const withGenreCount = type ? [...(selectedIds ?? [])].filter(id => (worksById.get(id)?.genres.length ?? 0) > 0).length : 0;
  const titleScope = finishedOnly ? 'finished' : 'started or finished';
  const categoryCount = type === 'games'
    ? `${experiencedTotal} ${experiencedTotal === 1 ? 'game played' : 'games played'}`
    : `${experiencedTotal} ${experiencedTotal === 1 ? 'title watched' : 'titles watched'}`;
  const summary = type
    ? `${categoryCount} · ${titleScope} · ${periodName}`
    : period === 'lifetime'
      ? `${experiencedTotal} distinct titles experienced across your library.`
      : `${experiencedTotal} distinct titles with dated diary activity in ${periodName}.`;
  const heading = type ? 'Your taste' : 'Library activity';
  const tableLabel = type ? `${typeNames[type]} genres in ${periodName}` : `Library titles in ${periodName}`;
  const coverage = type ? `Genre data: ${withGenreCount} of ${experiencedTotal} titles · Titles can have more than one genre.` : undefined;
  const metricLabel = type
    ? type === 'games'
      ? finishedOnly ? 'games finished' : 'games played'
      : `${type === 'anime' ? 'anime titles' : typeNames[type].toLowerCase()} ${finishedOnly ? 'finished' : 'watched'}`
    : 'titles';
  const metricContext = type
    ? periodName === 'Lifetime' ? 'Lifetime' : `in ${periodName}`
    : period === 'lifetime' ? 'experienced across your library' : `with dated activity · ${periodName}`;

  return <section className={`library-stats${type ? ' library-stats-category' : ''}`}>
    <div className="stats-heading">
      <div><h2>{heading}</h2><p className="muted">{type ? `${typeNames[type]} · ${periodName}` : period === 'lifetime' ? 'Titles experienced · Lifetime' : `Titles with diary activity · ${periodName}`}</p></div>
      <PeriodButtons years={years} period={period} onChange={onPeriodChange} />
    </div>
    {type && <label className="stats-finished"><input type="checkbox" checked={finishedOnly} onChange={event => setFinishedOnly(event.currentTarget.checked)} /><span>Finished only</span></label>}
    {rows.length > 0
      ? <Bars rows={rows} label={tableLabel} summary={summary} coverage={coverage} hasGenres={Boolean(type)} total={experiencedTotal} totalLabel={metricLabel} totalContext={metricContext} />
      : <div className="stats-empty-state">
        <p className="section-empty">{finishedOnly
          ? `No finished titles in ${periodName}.`
          : type
            ? lifetimeGenreData.rows.length > 0
              ? experiencedTotal === 0
                ? `No dated ${typeNames[type]} activity in ${periodName}. Showing your Lifetime genre mix below.`
                : `Genre details are unavailable for these ${typeNames[type].toLowerCase()} titles in ${periodName}. Showing your Lifetime genre mix below.`
              : experiencedTotal === 0
                ? `No dated ${typeNames[type]} activity in ${periodName} yet.`
                : `No genre information is available for these ${typeNames[type].toLowerCase()} titles.`
            : `No diary activity recorded for ${periodName}.`}</p>
        {type && period !== 'lifetime' && rows.length === 0 && lifetimeGenreData.rows.length > 0 && <Bars
          rows={lifetimeGenreData.rows}
          label={`${typeNames[type]} genres · Lifetime`}
          summary={`${lifetimeGenreData.titleCount} ${typeNames[type].toLowerCase()} titles in your collection · Lifetime${finishedOnly ? ' · finished only' : ''}`}
          coverage={`Genre data: ${lifetimeGenreData.genreTitleCount} of ${lifetimeGenreData.titleCount} titles · Titles can have more than one genre.`}
          total={lifetimeGenreData.titleCount}
          totalLabel={metricLabel}
          totalContext="Lifetime"
          hasGenres
        />}
      </div>}
  </section>;
}
