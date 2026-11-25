import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import {
  ActiveScope,
  BudgetDatabase,
  LedgerEntry,
  SearchFilters,
  SearchOrigin,
  SearchPeriod,
  SearchSort,
  Transaction,
} from '../types/budget';
import {
  computeLedgerForRange,
  getLedgerDataBounds,
} from '../utils/calculations';
import {
  MONTH_NAMES_FULL,
  formatCurrency,
  formatMonthYearDE,
  getCurrentYearMonth,
} from '../utils/format';
import { LedgerTable } from './LedgerTable';

const PAGE_SIZE = 100;

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  query: '',
  category: 'all',
  type: 'all',
  period: { kind: 'all' },
  sort: 'date-desc',
};

interface SearchAnalysisViewProps {
  db: BudgetDatabase;
  scope: ActiveScope;
  initialFilters: SearchFilters;
  origin: SearchOrigin;
  onBack: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onNavigateToRecurring: () => void;
}

const numberFormatter = new Intl.NumberFormat('de-DE');

function toCents(value: number): number {
  return Math.round(value * 100);
}

function describePeriod(period: SearchPeriod): string {
  if (period.kind === 'all') return 'in allen Jahren';
  if (period.kind === 'year') return `in ${period.year}`;
  return `im ${formatMonthYearDE(period.yearMonth)}`;
}

export const SearchAnalysisView: React.FC<SearchAnalysisViewProps> = ({
  db,
  scope,
  initialFilters,
  origin,
  onBack,
  onEditTransaction,
  onDeleteTransaction,
  onNavigateToRecurring,
}) => {
  const [query, setQuery] = useState<string>(initialFilters.query);
  const [category, setCategory] = useState<string>(initialFilters.category);
  const [typeFilter, setTypeFilter] = useState<SearchFilters['type']>(
    initialFilters.type
  );
  const [period, setPeriod] = useState<SearchPeriod>(initialFilters.period);
  const [sort, setSort] = useState<SearchSort>(initialFilters.sort);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const deferredQuery = useDeferredValue(query);
  const currentYearMonth = getCurrentYearMonth();

  const bounds = useMemo(
    () => getLedgerDataBounds(db, scope, currentYearMonth),
    [db, scope, currentYearMonth]
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    if (bounds) {
      const first = Number(bounds.from.slice(0, 4));
      const last = Number(bounds.to.slice(0, 4));
      for (let y = last; y >= first; y--) years.add(y);
    }
    if (period.kind === 'year') years.add(period.year);
    if (period.kind === 'month') years.add(Number(period.yearMonth.slice(0, 4)));
    return Array.from(years).sort((a, b) => b - a);
  }, [bounds, period]);

  const range = useMemo(() => {
    if (period.kind === 'all') return bounds;
    if (period.kind === 'year') {
      return { from: `${period.year}-01`, to: `${period.year}-12` };
    }
    return { from: period.yearMonth, to: period.yearMonth };
  }, [period, bounds]);

  const rangeFrom = range?.from ?? null;
  const rangeTo = range?.to ?? null;

  const periodEntries = useMemo<LedgerEntry[]>(
    () =>
      rangeFrom && rangeTo
        ? computeLedgerForRange(db, scope, rangeFrom, rangeTo)
        : [],
    [db, scope, rangeFrom, rangeTo]
  );

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of periodEntries) {
      if (typeFilter !== 'all' && e.type !== typeFilter) continue;
      set.add(e.category);
    }
    if (category !== 'all') set.add(category);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'));
  }, [periodEntries, typeFilter, category]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const result: LedgerEntry[] = [];
    for (const entry of periodEntries) {
      if (typeFilter !== 'all' && entry.type !== typeFilter) continue;
      if (category !== 'all' && entry.category !== category) continue;
      if (q) {
        const matches =
          entry.title.toLowerCase().includes(q) ||
          entry.note.toLowerCase().includes(q) ||
          entry.category.toLowerCase().includes(q) ||
          entry.profileName.toLowerCase().includes(q);
        if (!matches) continue;
      }
      result.push(entry);
    }
    return result;
  }, [periodEntries, deferredQuery, typeFilter, category]);

  const sorted = useMemo(() => {
    if (sort === 'date-desc') return filtered;
    const copy = [...filtered];
    if (sort === 'date-asc') {
      copy.sort((a, b) => a.date.localeCompare(b.date));
    } else {
      copy.sort((a, b) => b.amount - a.amount);
    }
    return copy;
  }, [filtered, sort]);

  const totals = useMemo(() => {
    let incomeCents = 0;
    let expenseCents = 0;
    for (const e of filtered) {
      if (e.type === 'income') incomeCents += toCents(e.amount);
      else expenseCents += toCents(e.amount);
    }
    return {
      income: incomeCents / 100,
      expense: expenseCents / 100,
      balance: (incomeCents - expenseCents) / 100,
    };
  }, [filtered]);

  // Bei geänderten Filtern wieder mit den ersten 100 Zeilen beginnen
  const periodKey =
    period.kind === 'all'
      ? 'all'
      : period.kind === 'year'
      ? String(period.year)
      : period.yearMonth;
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [deferredQuery, category, typeFilter, periodKey, sort, scope]);

  const visible = useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount]
  );

  const txMap = useMemo(() => {
    const map = new Map<string, Transaction>();
    db.transactions.forEach((t) => map.set(t.id, t));
    return map;
  }, [db.transactions]);

  const scopeLabel =
    scope === 'joint'
      ? 'Gemeinsam'
      : db.profiles.find((p) => p.id === scope)?.name ?? scope;

  const selectedYear =
    period.kind === 'year'
      ? period.year
      : period.kind === 'month'
      ? Number(period.yearMonth.slice(0, 4))
      : null;
  const selectedMonth =
    period.kind === 'month' ? period.yearMonth.slice(5, 7) : '';

  const handleYearChange = (value: string) => {
    if (value === 'all') {
      setPeriod({ kind: 'all' });
      return;
    }
    const y = Number(value);
    if (period.kind === 'month') {
      setPeriod({ kind: 'month', yearMonth: `${y}-${period.yearMonth.slice(5, 7)}` });
    } else {
      setPeriod({ kind: 'year', year: y });
    }
  };

  const handleMonthChange = (value: string) => {
    if (selectedYear === null) return;
    if (!value) setPeriod({ kind: 'year', year: selectedYear });
    else setPeriod({ kind: 'month', yearMonth: `${selectedYear}-${value}` });
  };

  const handleResetFilters = () => {
    setQuery('');
    setCategory('all');
    setTypeFilter('all');
    setPeriod({ kind: 'all' });
    setSort('date-desc');
  };

  const isStale = deferredQuery !== query;
  const hitCount = filtered.length;
  const headline = `${numberFormatter.format(hitCount)} Treffer ${describePeriod(period)}`;

  const filterSummary = [
    scopeLabel,
    typeFilter === 'expense'
      ? 'Ausgaben'
      : typeFilter === 'income'
      ? 'Einnahmen'
      : 'Ausgaben & Einnahmen',
    category !== 'all' ? `Kategorie „${category}“` : null,
    deferredQuery.trim() ? `Suche „${deferredQuery.trim()}“` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const selectClass =
    'w-full px-3 py-1.5 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]';
  const labelClass = 'block text-xs font-medium text-[#6E6056] mb-1';

  return (
    <div className="space-y-6">
      {origin && (
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#6E6056] hover:text-[#3D322C] bg-[#F5F2EB] hover:bg-[#EFEAE0] border border-[#E5DFD3] rounded-lg transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {origin === 'annual'
              ? 'Zurück zum Jahresabschluss'
              : 'Zurück zur Monatsübersicht'}
          </button>
        </div>
      )}

      {/* Filters */}
      <section
        aria-label="Such- und Filterkriterien"
        className="bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm p-5 space-y-4"
      >
        <div>
          <h2 className="font-display text-base font-semibold text-[#3D322C]">
            Suche & Auswertung
          </h2>
          <p className="text-xs text-[#6E6056] mt-0.5">
            Einzelbuchungen über beliebige Zeiträume finden und summieren ·{' '}
            {scopeLabel}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-7">
            <label htmlFor="search-query" className={labelClass}>
              Suchbegriff
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-[#8C7D72] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="search-query"
                type="search"
                placeholder="Nach Notiz, Kategorie oder Profil suchen …"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
              />
            </div>
          </div>
          <div className="sm:col-span-5">
            <label htmlFor="search-category" className={labelClass}>
              Kategorie
            </label>
            <select
              id="search-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={selectClass}
            >
              <option value="all">Alle Kategorien</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-3">
            <label htmlFor="search-year" className={labelClass}>
              Zeitraum
            </label>
            <select
              id="search-year"
              value={selectedYear === null ? 'all' : String(selectedYear)}
              onChange={(e) => handleYearChange(e.target.value)}
              className={selectClass}
            >
              <option value="all">Alle Jahre</option>
              {availableYears.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-3">
            <label htmlFor="search-month" className={labelClass}>
              Monat
            </label>
            <select
              id="search-month"
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              disabled={selectedYear === null}
              className={`${selectClass} disabled:bg-[#F5F2EB] disabled:text-[#A09286]`}
            >
              <option value="">
                {selectedYear === null ? '—' : 'Ganzes Jahr'}
              </option>
              {MONTH_NAMES_FULL.map((name, idx) => (
                <option key={name} value={String(idx + 1).padStart(2, '0')}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-3">
            <span className={labelClass}>Art</span>
            <div className="flex items-center gap-1 p-1 bg-[#EFEAE0] rounded-xl">
              {(['all', 'expense', 'income'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  aria-pressed={typeFilter === t}
                  className={`flex-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    typeFilter === t
                      ? 'bg-[#FCFBF8] text-[#3D322C] shadow-xs'
                      : 'text-[#6E6056] hover:text-[#3D322C]'
                  }`}
                >
                  {t === 'all' ? 'Alle' : t === 'expense' ? 'Ausgaben' : 'Einnahmen'}
                </button>
              ))}
            </div>
          </div>
          <div className="lg:col-span-3">
            <label htmlFor="search-sort" className={labelClass}>
              Sortierung
            </label>
            <select
              id="search-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SearchSort)}
              className={selectClass}
            >
              <option value="date-desc">Datum, neueste zuerst</option>
              <option value="date-asc">Datum, älteste zuerst</option>
              <option value="amount-desc">Betrag, höchste zuerst</option>
            </select>
          </div>
        </div>
      </section>

      {/* Totals over ALL hits */}
      <section
        aria-label="Summen der Treffer"
        className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#EAE4D7] border border-[#E5DFD3] rounded-2xl shadow-sm overflow-hidden"
      >
        <div className="p-5 bg-[#FCFBF8]">
          <div className="text-xs font-medium text-[#6E6056]">Treffer</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#3D322C] tabular-nums">
            {numberFormatter.format(hitCount)}
          </div>
          <div className="mt-1.5 text-xs text-[#8C7D72]">
            {period.kind === 'all'
              ? 'Alle Jahre'
              : period.kind === 'year'
              ? `Jahr ${period.year}`
              : formatMonthYearDE(period.yearMonth)}
          </div>
        </div>
        <div className="p-5 bg-[#FCFBF8]">
          <div className="text-xs font-medium text-[#6E6056]">
            Summe Einnahmen
          </div>
          <div className="mt-1.5 font-mono text-xl sm:text-2xl font-semibold text-[#2A6F4E] tabular-nums break-all">
            {formatCurrency(totals.income, true)}
          </div>
        </div>
        <div className="p-5 bg-[#FCFBF8]">
          <div className="text-xs font-medium text-[#6E6056]">
            Summe Ausgaben
          </div>
          <div className="mt-1.5 font-mono text-xl sm:text-2xl font-semibold text-[#B43C2E] tabular-nums break-all">
            {totals.expense > 0
              ? `-${formatCurrency(totals.expense)}`
              : formatCurrency(0)}
          </div>
        </div>
        <div className="p-5 bg-[#FCFBF8]">
          <div className="text-xs font-medium text-[#6E6056]">Saldo</div>
          <div
            className={`mt-1.5 font-mono text-xl sm:text-2xl font-semibold tabular-nums break-all ${
              totals.balance > 0
                ? 'text-[#2A6F4E]'
                : totals.balance < 0
                ? 'text-[#B43C2E]'
                : 'text-[#3D322C]'
            }`}
          >
            {formatCurrency(totals.balance, true)}
          </div>
        </div>
      </section>

      {/* Result list */}
      <section
        aria-label="Trefferliste"
        className={`bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm overflow-hidden transition-opacity ${
          isStale ? 'opacity-70' : ''
        }`}
      >
        <div className="p-5 border-b border-[#EAE4D7]">
          <h2 className="font-display text-base font-semibold text-[#3D322C]">
            {headline}
          </h2>
          <p className="text-xs text-[#6E6056] mt-0.5 tabular-nums">
            {filterSummary}
            {hitCount > 0 && (
              <>
                {' · '}
                {numberFormatter.format(visible.length)} von{' '}
                {numberFormatter.format(hitCount)} angezeigt
              </>
            )}
          </p>
        </div>

        {hitCount === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-[#3D322C]">
              {bounds === null
                ? 'Noch keine Buchungen vorhanden'
                : `Keine Buchungen ${describePeriod(period)} gefunden`}
            </p>
            <p className="mt-1 text-xs text-[#6E6056] max-w-md mx-auto">
              {bounds === null
                ? 'Sobald Buchungen oder Fixposten erfasst sind, können Sie sie hier über alle Monate durchsuchen.'
                : 'Passen Sie Suchbegriff, Kategorie, Zeitraum oder Art an – zum Beispiel „Alle Jahre“ wählen.'}
            </p>
            {bounds !== null && (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 text-xs font-medium text-[#3D322C] bg-white border border-[#D4CCB9] rounded-xl hover:border-[#3D322C] transition-colors whitespace-nowrap"
                >
                  Filter zurücksetzen
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <LedgerTable
              entries={visible}
              scope={scope}
              txMap={txMap}
              onEditTransaction={onEditTransaction}
              onDeleteTransaction={onDeleteTransaction}
              onNavigateToRecurring={onNavigateToRecurring}
            />
            <div className="px-5 py-4 border-t border-[#EAE4D7] flex flex-wrap items-center justify-between gap-3 text-xs text-[#6E6056] tabular-nums">
              <span>
                {numberFormatter.format(visible.length)} von{' '}
                {numberFormatter.format(hitCount)}
              </span>
              {visible.length < hitCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="px-4 py-2 text-xs font-medium text-[#3D322C] bg-white border border-[#D4CCB9] rounded-xl hover:border-[#3D322C] transition-colors whitespace-nowrap"
                >
                  Weitere {Math.min(PAGE_SIZE, hitCount - visible.length)}{' '}
                  anzeigen
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
