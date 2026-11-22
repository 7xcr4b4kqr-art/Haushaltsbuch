import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, Repeat } from 'lucide-react';
import {
  ActiveScope,
  BudgetDatabase,
  EntryType,
  MonthlySummary,
  Transaction,
} from '../types/budget';
import {
  formatCurrency,
  formatDateDE,
  formatMonthYearDE,
  formatPercent,
  getTodayISO,
} from '../utils/format';
import { FIXED_INCOME_CATEGORIES } from '../utils/storage';
import { NetBalanceCard } from './NetBalanceCard';
import { ProfileAvatar } from './ProfileAvatar';

interface MonthlyDashboardProps {
  db: BudgetDatabase;
  scope: ActiveScope;
  selectedYearMonth: string;
  summary: MonthlySummary;
  annualYear: number;
  annualBalance: number;
  onQuickAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onNavigateToRecurring: () => void;
  onOpenNewModal: () => void;
  onLoadSampleData: () => void;
}

export const MonthlyDashboard: React.FC<MonthlyDashboardProps> = ({
  db,
  scope,
  selectedYearMonth,
  summary,
  annualYear,
  annualBalance,
  onQuickAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onNavigateToRecurring,
  onOpenNewModal,
  onLoadSampleData,
}) => {
  const defaultProfileId =
    scope === 'joint' ? (db.profiles[0]?.id ?? 'profil_1') : scope;

  const defaultDateInMonth = useMemo(() => {
    const today = getTodayISO();
    if (today.startsWith(selectedYearMonth)) return today;
    return `${selectedYearMonth}-01`;
  }, [selectedYearMonth]);

  const [quickType, setQuickType] = useState<EntryType>('expense');
  const [quickProfileId, setQuickProfileId] = useState<string>(defaultProfileId);
  const [quickAmount, setQuickAmount] = useState<string>('');
  const [quickDate, setQuickDate] = useState<string>(defaultDateInMonth);
  const [quickCategory, setQuickCategory] = useState<string>(
    db.categories.expense[0] ?? 'Essen/Trinken'
  );
  const [quickNote, setQuickNote] = useState<string>('');
  const [quickError, setQuickError] = useState<string | null>(null);

  React.useEffect(() => {
    setQuickProfileId(defaultProfileId);
  }, [defaultProfileId]);

  React.useEffect(() => {
    setQuickDate(defaultDateInMonth);
  }, [defaultDateInMonth]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'variable' | 'recurring'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const activeCategoryOptions: string[] = useMemo(
    () =>
      quickType === 'expense'
        ? db.categories.expense
        : [...FIXED_INCOME_CATEGORIES],
    [quickType, db.categories.expense]
  );

  React.useEffect(() => {
    if (!activeCategoryOptions.includes(quickCategory)) {
      setQuickCategory(activeCategoryOptions[0] ?? '');
    }
  }, [activeCategoryOptions, quickCategory]);

  const handleQuickTypeSwitch = (next: EntryType) => {
    setQuickType(next);
    const list: string[] =
      next === 'expense' ? db.categories.expense : [...FIXED_INCOME_CATEGORIES];
    if (!list.includes(quickCategory)) {
      setQuickCategory(list[0] ?? '');
    }
  };

  const handleQuickAmountChange = (raw: string) => {
    setQuickAmount(raw);
    if (raw.trim().startsWith('+') && quickType !== 'income') {
      handleQuickTypeSwitch('income');
    }
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuickError(null);
    const cleaned = quickAmount.trim().replace(/[€\s]/g, '');
    const hasPlusPrefix = cleaned.startsWith('+');
    const effectiveType: EntryType = hasPlusPrefix ? 'income' : quickType;
    const parsed = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setQuickError('Bitte einen gültigen Betrag größer 0 € eingeben.');
      return;
    }
    if (!quickDate || !/^\d{4}-\d{2}-\d{2}$/.test(quickDate)) {
      setQuickError('Bitte ein gültiges Datum wählen.');
      return;
    }

    const finalCategory =
      effectiveType === 'income' &&
      !(FIXED_INCOME_CATEGORIES as readonly string[]).includes(quickCategory)
        ? FIXED_INCOME_CATEGORIES[0]
        : quickCategory || activeCategoryOptions[0] || 'Essen/Trinken';

    onQuickAddTransaction({
      profileId: scope === 'joint' ? quickProfileId : scope,
      type: effectiveType,
      amount: Math.round(parsed * 100) / 100,
      date: quickDate,
      category: finalCategory,
      note: quickNote.trim(),
    });

    setQuickAmount('');
    setQuickNote('');
  };

  const filteredLedger = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return summary.ledger.filter((entry) => {
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
      if (kindFilter !== 'all' && entry.kind !== kindFilter) return false;
      if (categoryFilter !== 'all' && entry.category !== categoryFilter) {
        return false;
      }
      if (q) {
        const matches =
          entry.title.toLowerCase().includes(q) ||
          entry.note.toLowerCase().includes(q) ||
          entry.category.toLowerCase().includes(q) ||
          entry.profileName.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [summary.ledger, searchQuery, typeFilter, kindFilter, categoryFilter]);

  const usedCategoriesInMonth = useMemo(() => {
    const set = new Set<string>();
    summary.ledger.forEach((e) => set.add(e.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'));
  }, [summary.ledger]);

  const jointProfileBreakdown = useMemo(() => {
    if (scope !== 'joint') return [];
    return db.profiles.map((p) => {
      let income = 0;
      let expense = 0;
      for (const entry of summary.ledger) {
        if (entry.profileId !== p.id) continue;
        if (entry.type === 'income') income += entry.amount;
        else expense += entry.amount;
      }
      return {
        id: p.id,
        name: p.name,
        income,
        expense,
        balance: income - expense,
      };
    });
  }, [scope, db.profiles, summary.ledger]);

  const txMap = useMemo(() => {
    const map = new Map<string, Transaction>();
    db.transactions.forEach((t) => map.set(t.id, t));
    return map;
  }, [db.transactions]);

  const hasAnyGlobalData =
    db.transactions.length > 0 || db.recurringItems.length > 0;

  return (
    <div className="space-y-6">
      {/* Prominent Central Netto-Saldo / Monatssaldo Box */}
      <NetBalanceCard
        title="Netto-Saldo (Monatssaldo)"
        periodLabel={formatMonthYearDE(selectedYearMonth)}
        incomeTotal={summary.incomeTotal}
        expenseTotal={summary.expenseTotal}
        balance={summary.balance}
        secondaryLabel={`Jahressaldo ${annualYear}`}
        secondaryBalance={annualBalance}
      />

      {/* 3-Column Cumulative KPI Summary Strip */}
      <section
        aria-label="Kumulierte Monatskennzahlen"
        className="grid grid-cols-1 sm:grid-cols-3 bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm divide-y sm:divide-y-0 sm:divide-x divide-[#EAE4D7]"
      >
        <div className="p-5">
          <div className="text-xs font-medium text-[#6E6056]">
            Kumulierte Einnahmen
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#2A6F4E] tabular-nums">
            {formatCurrency(summary.incomeTotal, true)}
          </div>
          <div className="mt-1.5 text-xs text-[#8C7D72] tabular-nums">
            Fix {formatCurrency(summary.incomeFixed)} · Variabel{' '}
            {formatCurrency(summary.incomeVariable)}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-[#6E6056]">
            Kumulierte Ausgaben
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#B43C2E] tabular-nums">
            {summary.expenseTotal > 0
              ? `-${formatCurrency(summary.expenseTotal)}`
              : formatCurrency(0)}
          </div>
          <div className="mt-1.5 text-xs text-[#8C7D72] tabular-nums">
            Fix {formatCurrency(summary.expenseFixed)} · Variabel{' '}
            {formatCurrency(summary.expenseVariable)}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-[#6E6056]">Sparquote</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#3D322C] tabular-nums">
            {summary.incomeTotal > 0
              ? formatPercent(summary.savingsRate)
              : '0,0 %'}
          </div>
          <div className="mt-1.5 text-xs text-[#8C7D72] tabular-nums">
            {summary.ledger.length} Posten in{' '}
            {formatMonthYearDE(selectedYearMonth)}
          </div>
        </div>
      </section>

      {/* Fast Day-Accurate Quick Entry Bar */}
      <section
        aria-label="Schnellerfassung"
        className="bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#3D322C]">
              Tagesgenaue Schnellerfassung
            </h2>
            <p className="text-xs text-[#6E6056] mt-0.5">
              Variable Ausgabe oder Einnahme direkt verbuchen
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#EFEAE0] rounded-xl">
            <button
              type="button"
              onClick={() => handleQuickTypeSwitch('expense')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                quickType === 'expense'
                  ? 'bg-[#FCFBF8] text-[#3D322C] shadow-xs'
                  : 'text-[#6E6056] hover:text-[#3D322C]'
              }`}
            >
              Ausgabe
            </button>
            <button
              type="button"
              onClick={() => handleQuickTypeSwitch('income')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                quickType === 'income'
                  ? 'bg-[#FCFBF8] text-[#2A6F4E] shadow-xs'
                  : 'text-[#6E6056] hover:text-[#3D322C]'
              }`}
            >
              Einnahme
            </button>
          </div>
        </div>

        <form
          onSubmit={handleQuickSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end"
        >
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-[#6E6056] mb-1">
              Betrag (€)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00 / +..."
              value={quickAmount}
              onChange={(e) => handleQuickAmountChange(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-[#6E6056] mb-1">
              Datum
            </label>
            <input
              type="date"
              value={quickDate}
              onChange={(e) => setQuickDate(e.target.value)}
              className="w-full px-3 py-2 text-sm tabular-nums bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
            />
          </div>

          <div className={scope === 'joint' ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <label className="block text-xs font-medium text-[#6E6056] mb-1">
              Kategorie
            </label>
            <select
              value={quickCategory}
              onChange={(e) => setQuickCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
            >
              {activeCategoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {scope === 'joint' && (
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-[#6E6056] mb-1">
                Profil
              </label>
              <select
                value={quickProfileId}
                onChange={(e) => setQuickProfileId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
              >
                {db.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={scope === 'joint' ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <label className="block text-xs font-medium text-[#6E6056] mb-1">
              Notiz
            </label>
            <input
              type="text"
              placeholder="z. B. Supermarkt..."
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
            />
          </div>

          <div className="lg:col-span-2">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-[#FCFBF8] bg-[#3D322C] rounded-xl hover:bg-[#2E2520] shadow-xs transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Erfassen
            </button>
          </div>
        </form>

        {quickError && (
          <p className="mt-2.5 text-xs font-medium text-[#B43C2E]">
            {quickError}
          </p>
        )}
      </section>

      {/* Main 2-Column Content: Ledger + Category & Profile Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Ledger Table */}
        <section
          aria-label="Monatsjournal"
          className="lg:col-span-8 bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm overflow-hidden"
        >
          <div className="p-5 border-b border-[#EAE4D7] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[#3D322C]">
                  Buchungen im {formatMonthYearDE(selectedYearMonth)}
                </h2>
                <p className="text-xs text-[#6E6056] mt-0.5 tabular-nums">
                  {filteredLedger.length} von {summary.ledger.length} Einträgen
                  angezeigt
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-[#EFEAE0] rounded-xl">
                  {(['all', 'expense', 'income'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTypeFilter(t)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        typeFilter === t
                          ? 'bg-[#FCFBF8] text-[#3D322C] shadow-xs'
                          : 'text-[#6E6056] hover:text-[#3D322C]'
                      }`}
                    >
                      {t === 'all'
                        ? 'Alle'
                        : t === 'expense'
                        ? 'Ausgaben'
                        : 'Einnahmen'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#EFEAE0] rounded-xl">
                  {(['all', 'variable', 'recurring'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKindFilter(k)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        kindFilter === k
                          ? 'bg-[#FCFBF8] text-[#3D322C] shadow-xs'
                          : 'text-[#6E6056] hover:text-[#3D322C]'
                      }`}
                    >
                      {k === 'all'
                        ? 'Alle Arten'
                        : k === 'variable'
                        ? 'Variabel'
                        : 'Fixposten'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-7 relative">
                <Search className="w-4 h-4 text-[#8C7D72] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Nach Notiz, Kategorie oder Profil suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
                />
              </div>
              <div className="sm:col-span-5">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Nach Kategorie filtern"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
                >
                  <option value="all">Alle Kategorien</option>
                  {usedCategoriesInMonth.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {filteredLedger.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-[#3D322C]">
                {summary.ledger.length === 0
                  ? `Keine Buchungen für ${formatMonthYearDE(selectedYearMonth)}`
                  : 'Keine Buchungen entsprechen den aktuellen Filtern'}
              </p>
              <p className="mt-1 text-xs text-[#6E6056] max-w-md mx-auto">
                {summary.ledger.length === 0
                  ? 'Erfassen Sie oben eine tagesgenaue Ausgabe oder legen Sie wiederkehrende Fixposten an.'
                  : 'Passen Sie Suche oder Filter an, um alle Einträge des Monats zu sehen.'}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onOpenNewModal}
                  className="px-4 py-2 text-xs font-medium text-[#FCFBF8] bg-[#3D322C] rounded-xl hover:bg-[#2E2520] transition-colors whitespace-nowrap"
                >
                  Erste Buchung erfassen
                </button>
                {!hasAnyGlobalData && (
                  <button
                    type="button"
                    onClick={onLoadSampleData}
                    className="px-4 py-2 text-xs font-medium text-[#3D322C] bg-white border border-[#D4CCB9] rounded-xl hover:border-[#3D322C] transition-colors whitespace-nowrap"
                  >
                    Beispieldaten laden
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EAE4D7] text-xs font-medium text-[#6E6056] bg-[#F5F2EB]/60">
                    <th className="py-2.5 pl-5 pr-3 whitespace-nowrap">Datum</th>
                    <th className="py-2.5 px-3">Beschreibung & Kategorie</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">
                      Betrag
                    </th>
                    <th className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap w-24">
                      Aktion
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0ECE2] text-sm">
                  {filteredLedger.map((entry) => {
                    const rawTx =
                      entry.kind === 'variable'
                        ? txMap.get(entry.sourceId)
                        : undefined;
                    const isIncome = entry.type === 'income';

                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-[#F5F2EB]/45 transition-colors"
                      >
                        <td className="py-2.5 pl-5 pr-3 font-mono text-xs text-[#6E6056] tabular-nums whitespace-nowrap align-top">
                          {formatDateDE(entry.date)}
                        </td>
                        <td className="py-2.5 px-3 align-top">
                          <div className="font-medium text-[#3D322C] leading-snug">
                            {entry.title}
                          </div>
                          <div className="text-xs text-[#8C7D72] mt-0.5 flex flex-wrap items-center gap-x-1.5">
                            <span>{entry.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {entry.kind === 'recurring'
                                ? 'Fixposten'
                                : 'Variabel'}
                            </span>
                            {scope === 'joint' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-medium text-[#4A3B32]">
                                  {entry.profileName}
                                </span>
                              </>
                            )}
                            {entry.kind === 'recurring' && entry.note && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate max-w-xs">
                                  {entry.note}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono text-sm font-medium tabular-nums whitespace-nowrap align-top ${
                            isIncome ? 'text-[#2A6F4E]' : 'text-[#3D322C]'
                          }`}
                        >
                          {isIncome
                            ? formatCurrency(entry.amount, true)
                            : `-${formatCurrency(entry.amount)}`}
                        </td>
                        <td className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap align-top">
                          {entry.kind === 'variable' && rawTx ? (
                            pendingDeleteId === rawTx.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteTransaction(rawTx.id);
                                    setPendingDeleteId(null);
                                  }}
                                  className="text-xs font-medium text-[#B43C2E] hover:underline underline-offset-2"
                                >
                                  Löschen
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteId(null)}
                                  className="text-xs text-[#6E6056] hover:text-[#3D322C]"
                                >
                                  Nein
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onEditTransaction(rawTx)}
                                  className="p-1.5 rounded-lg text-[#8C7D72] hover:text-[#3D322C] hover:bg-[#EFEAE0] transition-colors"
                                  aria-label="Buchung bearbeiten"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteId(rawTx.id)}
                                  className="p-1.5 rounded-lg text-[#8C7D72] hover:text-[#B43C2E] hover:bg-[#B43C2E]/10 transition-colors"
                                  aria-label="Buchung löschen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={onNavigateToRecurring}
                              title="Im Bereich Fixposten verwalten"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#6E6056] hover:text-[#3D322C] hover:bg-[#EFEAE0] rounded-lg transition-colors"
                            >
                              <Repeat className="w-3 h-3" />
                              Fix
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right: Separate Expense & Income Category Breakdowns + Joint Split */}
        <aside className="lg:col-span-4 space-y-6">
          <section className="bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm p-5">
            <h2 className="font-display text-base font-semibold text-[#3D322C]">
              Ausgaben nach Kategorie
            </h2>
            <p className="text-xs text-[#6E6056] mt-0.5 tabular-nums">
              Ausschließlich Ausgaben ·{' '}
              <span className="text-[#B43C2E] font-medium">
                {summary.expenseTotal > 0
                  ? `-${formatCurrency(summary.expenseTotal)}`
                  : formatCurrency(0)}
              </span>
            </p>

            {summary.expenseByCategory.length === 0 ? (
              <p className="mt-6 text-xs text-[#8C7D72]">
                Für diesen Monat liegen noch keine Ausgaben vor.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {summary.expenseByCategory.map((cat) => (
                  <div key={cat.category}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-medium text-[#3D322C] truncate">
                        {cat.category}
                      </span>
                      <span className="font-mono tabular-nums text-[#3D322C] shrink-0">
                        {formatCurrency(cat.amount)} ·{' '}
                        <span className="text-[#8C7D72]">
                          {formatPercent(cat.percentage)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full bg-[#EFEAE0] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#4A3B32] rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, cat.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm p-5">
            <h2 className="font-display text-base font-semibold text-[#3D322C]">
              Einnahmen nach Kategorie
            </h2>
            <p className="text-xs text-[#6E6056] mt-0.5 tabular-nums">
              Getrennt erfasste Eingänge ·{' '}
              <span className="text-[#2A6F4E] font-medium">
                {formatCurrency(summary.incomeTotal, true)}
              </span>
            </p>

            {summary.incomeByCategory.length === 0 ? (
              <p className="mt-6 text-xs text-[#8C7D72]">
                Für diesen Monat liegen noch keine Einnahmen vor.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {summary.incomeByCategory.map((cat) => (
                  <div key={cat.category}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-medium text-[#3D322C] truncate">
                        {cat.category}
                      </span>
                      <span className="font-mono tabular-nums text-[#2A6F4E] shrink-0">
                        {formatCurrency(cat.amount, true)} ·{' '}
                        <span className="text-[#8C7D72]">
                          {formatPercent(cat.percentage)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full bg-[#EFEAE0] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#2A6F4E] rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, cat.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {scope === 'joint' && (
            <section className="bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm p-5">
              <h2 className="font-display text-base font-semibold text-[#3D322C]">
                Beitrag je Profil
              </h2>
              <p className="text-xs text-[#6E6056] mt-0.5">
                Getrennte Anteile in der gemeinsamen Ansicht
              </p>

              <div className="mt-4 divide-y divide-[#EAE4D7]">
                {jointProfileBreakdown.map((p) => {
                  const profileObj = db.profiles.find((pr) => pr.id === p.id);
                  return (
                    <div key={p.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {profileObj && (
                            <ProfileAvatar profile={profileObj} size="xs" />
                          )}
                          <span className="text-sm font-semibold text-[#3D322C]">
                            {p.name}
                          </span>
                        </div>
                        <span
                          className={`font-mono text-sm font-medium tabular-nums ${
                            p.balance >= 0 ? 'text-[#2A6F4E]' : 'text-[#B43C2E]'
                          }`}
                        >
                          {formatCurrency(p.balance, true)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs tabular-nums">
                        <span className="text-[#2A6F4E] font-medium">
                          Einnahmen: {formatCurrency(p.income, true)}
                        </span>
                        <span className="text-[#B43C2E] font-medium">
                          Ausgaben:{' '}
                          {p.expense > 0
                            ? `-${formatCurrency(p.expense)}`
                            : formatCurrency(0)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};
