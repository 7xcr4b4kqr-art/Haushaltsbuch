import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import {
  ActiveScope,
  BudgetDatabase,
  EntryType,
  RecurringItem,
} from '../types/budget';
import { isRecurringApplicableInMonth } from '../utils/calculations';
import { formatCurrency, getCurrentYearMonth } from '../utils/format';
import { FIXED_INCOME_CATEGORIES } from '../utils/storage';

interface RecurringManagerProps {
  db: BudgetDatabase;
  scope: ActiveScope;
  onSaveRecurring: (
    data: Omit<RecurringItem, 'id' | 'createdAt'>,
    existingId?: string
  ) => void;
  onToggleActive: (id: string) => void;
  onDeleteRecurring: (id: string) => void;
}

export const RecurringManager: React.FC<RecurringManagerProps> = ({
  db,
  scope,
  onSaveRecurring,
  onToggleActive,
  onDeleteRecurring,
}) => {
  const defaultProfileId =
    scope === 'joint' ? (db.profiles[0]?.id ?? 'profil_1') : scope;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<EntryType>('expense');
  const [profileId, setProfileId] = useState<string>(defaultProfileId);
  const [title, setTitle] = useState<string>('');
  const [amountRaw, setAmountRaw] = useState<string>('');
  const [category, setCategory] = useState<string>(
    db.categories.expense[0] ?? 'Wohnen & Miete'
  );
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [startMonth, setStartMonth] = useState<string>(
    `${new Date().getFullYear()}-01`
  );
  const [endMonth, setEndMonth] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  React.useEffect(() => {
    if (!editingId) {
      setProfileId(defaultProfileId);
    }
  }, [defaultProfileId, editingId]);

  const profileMap = useMemo(() => {
    const map = new Map<string, string>();
    db.profiles.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [db.profiles]);

  const scopedItems = useMemo(() => {
    return db.recurringItems
      .filter((item) => scope === 'joint' || item.profileId === scope)
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
        return b.amount - a.amount;
      });
  }, [db.recurringItems, scope]);

  const currentYm = getCurrentYearMonth();

  const totals = useMemo(() => {
    let fixedIncome = 0;
    let fixedExpense = 0;
    for (const item of scopedItems) {
      if (!isRecurringApplicableInMonth(item, currentYm)) continue;
      if (item.type === 'income') fixedIncome += item.amount;
      else fixedExpense += item.amount;
    }
    return {
      fixedIncome,
      fixedExpense,
      net: fixedIncome - fixedExpense,
    };
  }, [scopedItems, currentYm]);

  const resetForm = () => {
    setEditingId(null);
    setType('expense');
    setProfileId(defaultProfileId);
    setTitle('');
    setAmountRaw('');
    setCategory(db.categories.expense[0] ?? 'Wohnen & Miete');
    setDayOfMonth(1);
    setStartMonth(getCurrentYearMonth().slice(0, 4) + '-01');
    setEndMonth('');
    setNote('');
    setError(null);
  };

  const handleEditClick = (item: RecurringItem) => {
    setEditingId(item.id);
    setType(item.type);
    setProfileId(item.profileId);
    setTitle(item.title);
    setAmountRaw(item.amount.toFixed(2).replace('.', ','));
    if (item.type === 'income') {
      const incomeList = FIXED_INCOME_CATEGORIES as readonly string[];
      setCategory(
        incomeList.includes(item.category)
          ? item.category
          : FIXED_INCOME_CATEGORIES[0]
      );
    } else {
      setCategory(
        db.categories.expense.includes(item.category)
          ? item.category
          : db.categories.expense[0] ?? 'Essen/Trinken'
      );
    }
    setDayOfMonth(item.dayOfMonth);
    setStartMonth(item.startMonth);
    setEndMonth(item.endMonth ?? '');
    setNote(item.note);
    setError(null);
  };

  const handleTypeSwitch = (nextType: EntryType) => {
    setType(nextType);
    const list: string[] =
      nextType === 'expense'
        ? db.categories.expense
        : [...FIXED_INCOME_CATEGORIES];
    if (!list.includes(category)) {
      setCategory(list[0] ?? '');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Bitte eine Bezeichnung (z. B. Miete oder Gehalt) eingeben.');
      return;
    }
    const parsedAmount = Number(amountRaw.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Bitte einen gültigen monatlichen Betrag größer als 0 € eingeben.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(startMonth)) {
      setError('Bitte einen gültigen Startmonat angeben.');
      return;
    }
    if (endMonth && endMonth <= startMonth) {
      setError(
        'Das Enddatum (ab wann der Posten entfällt) muss nach dem Startmonat liegen.'
      );
      return;
    }

    const existing = editingId
      ? db.recurringItems.find((r) => r.id === editingId)
      : undefined;

    onSaveRecurring(
      {
        profileId: scope === 'joint' || editingId ? profileId : scope,
        type,
        title: title.trim(),
        amount: Math.round(parsedAmount * 100) / 100,
        category,
        dayOfMonth: Math.max(1, Math.min(31, Number(dayOfMonth) || 1)),
        startMonth,
        endMonth: endMonth ? endMonth : undefined,
        active: existing ? existing.active : true,
        note: note.trim(),
      },
      editingId ?? undefined
    );
    resetForm();
  };

  const availableCategories: string[] =
    type === 'expense' ? db.categories.expense : [...FIXED_INCOME_CATEGORIES];

  return (
    <div className="space-y-6">
      {/* 3-Column Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm divide-y sm:divide-y-0 sm:divide-x divide-[#EAE4D7]">
        <div className="p-5">
          <div className="text-xs font-medium text-[#6E6056]">
            Feste Einnahmen / Monat
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#2A6F4E] tabular-nums">
            {formatCurrency(totals.fixedIncome, true)}
          </div>
          <div className="mt-1 text-xs text-[#8C7D72]">
            Aktive Eingänge im Monat {currentYm}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-[#6E6056]">
            Fixkosten / Monat
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#B43C2E] tabular-nums">
            {totals.fixedExpense > 0
              ? `-${formatCurrency(totals.fixedExpense)}`
              : formatCurrency(0)}
          </div>
          <div className="mt-1 text-xs text-[#8C7D72]">
            Aktive Abbuchungen im Monat {currentYm}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-[#6E6056]">
            Monatlicher Fix-Saldo
          </div>
          <div
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              totals.net >= 0 ? 'text-[#2A6F4E]' : 'text-[#B43C2E]'
            }`}
          >
            {formatCurrency(totals.net, true)}
          </div>
          <div className="mt-1 text-xs text-[#8C7D72]">
            Verfügbarer Grundbetrag vor variablen Ausgaben
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Column */}
        <section className="lg:col-span-4 bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold text-[#3D322C]">
              {editingId ? 'Fixposten bearbeiten' : 'Neuer Fixposten'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-[#6E6056] hover:text-[#3D322C] underline underline-offset-2"
              >
                Abbrechen
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#EFEAE0] rounded-xl">
              <button
                type="button"
                onClick={() => handleTypeSwitch('expense')}
                className={`py-1.5 px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  type === 'expense'
                    ? 'bg-[#FCFBF8] text-[#3D322C] shadow-xs'
                    : 'text-[#6E6056] hover:text-[#3D322C]'
                }`}
              >
                Fixkosten (Ausgabe)
              </button>
              <button
                type="button"
                onClick={() => handleTypeSwitch('income')}
                className={`py-1.5 px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  type === 'income'
                    ? 'bg-[#FCFBF8] text-[#3D322C] shadow-xs'
                    : 'text-[#6E6056] hover:text-[#3D322C]'
                }`}
              >
                Feste Einnahme
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6E6056] mb-1">
                Bezeichnung
              </label>
              <input
                type="text"
                placeholder="z. B. Miete, Gehalt, Internet"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6E6056] mb-1">
                  Betrag (€)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amountRaw}
                  onChange={(e) => setAmountRaw(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6E6056] mb-1">
                  Tag im Monat
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6E6056] mb-1">
                  Kategorie
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
                >
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6E6056] mb-1">
                  Profil
                </label>
                <select
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  disabled={scope !== 'joint' && !editingId}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C] disabled:opacity-70"
                >
                  {db.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6E6056] mb-1">
                  Startmonat (Gültig ab)
                </label>
                <input
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  className="w-full px-3 py-2 text-sm tabular-nums bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-[#6E6056]">
                    Enddatum (optional)
                  </label>
                  {endMonth && (
                    <button
                      type="button"
                      onClick={() => setEndMonth('')}
                      title="Enddatum entfernen"
                      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#6E6056] hover:text-[#3D322C]"
                    >
                      <X className="w-3 h-3" />
                      Leeren
                    </button>
                  )}
                </div>
                <input
                  type="month"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                  className="w-full px-3 py-2 text-sm tabular-nums bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
                />
                <p className="mt-1 text-[11px] text-[#8C7D72]">
                  Ab diesem Monat nicht mehr berechnet.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6E6056] mb-1">
                Notiz (optional)
              </label>
              <input
                type="text"
                placeholder="Vertragsnummer, Hinweis..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
              />
            </div>

            {error && <p className="text-xs font-medium text-[#B43C2E]">{error}</p>}

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[#FCFBF8] bg-[#3D322C] rounded-xl hover:bg-[#2E2520] shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              {editingId ? 'Änderungen speichern' : 'Fixposten anlegen'}
            </button>
          </form>
        </section>

        {/* List Column */}
        <section className="lg:col-span-8 bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-[#EAE4D7]">
            <h2 className="font-display text-base font-semibold text-[#3D322C]">
              Wiederkehrende Posten
            </h2>
            <p className="text-xs text-[#6E6056] mt-0.5">
              Aktive Posten fließen ab dem Startmonat automatisch in jeden Monat
              sowie in den Jahresabschluss ein. Ist ein Enddatum gesetzt,
              entfällt der Posten ab diesem Monat.
            </p>
          </div>

          {scopedItems.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-[#3D322C]">
                Noch keine wiederkehrenden Posten hinterlegt
              </p>
              <p className="mt-1 text-xs text-[#6E6056]">
                Legen Sie links monatliche Fixkosten wie Miete, Strom oder Ihr
                Gehalt an.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EAE4D7] text-xs font-medium text-[#6E6056] bg-[#F5F2EB]/60">
                    <th className="py-2.5 pl-5 pr-3">Bezeichnung</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Turnus</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">
                      Betrag
                    </th>
                    <th className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap">
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0ECE2] text-sm">
                  {scopedItems.map((item) => {
                    const isIncome = item.type === 'income';
                    const isEnded = Boolean(
                      item.endMonth && currentYm >= item.endMonth.slice(0, 7)
                    );
                    const isFuture = item.startMonth > currentYm;
                    const isCurrentlyRunning =
                      item.active && !isEnded && !isFuture;

                    let statusLabel = 'Aktiv';
                    let statusClass = 'text-[#2A6F4E] font-medium';
                    if (!item.active) {
                      statusLabel = 'Pausiert';
                      statusClass = 'text-[#8C7D72]';
                    } else if (isEnded) {
                      statusLabel = 'Beendet';
                      statusClass = 'text-[#8C7D72]';
                    } else if (isFuture) {
                      statusLabel = 'Geplant';
                      statusClass = 'text-[#6E6056] font-medium';
                    }

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isCurrentlyRunning || (item.active && isFuture)
                            ? 'hover:bg-[#F5F2EB]/45'
                            : 'bg-[#F5F2EB]/60 opacity-65'
                        }`}
                      >
                        <td className="py-3 pl-5 pr-3 align-top">
                          <div className="font-medium text-[#3D322C]">
                            {item.title}
                          </div>
                          <div className="text-xs text-[#8C7D72] mt-0.5 flex flex-wrap items-center gap-x-1.5">
                            <span>{item.category}</span>
                            {scope === 'joint' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-medium text-[#4A3B32]">
                                  {profileMap.get(item.profileId) ??
                                    item.profileId}
                                </span>
                              </>
                            )}
                            {item.note && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{item.note}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-[#6E6056] tabular-nums whitespace-nowrap align-top">
                          <div>Jeden {item.dayOfMonth}. im Monat</div>
                          <div className="text-[#8C7D72] mt-0.5">
                            ab {item.startMonth}
                            {item.endMonth
                              ? ` · entfällt ab ${item.endMonth}`
                              : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap align-top">
                          <span className={statusClass}>{statusLabel}</span>
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono font-medium tabular-nums whitespace-nowrap align-top ${
                            isIncome ? 'text-[#2A6F4E]' : 'text-[#3D322C]'
                          }`}
                        >
                          {isIncome
                            ? formatCurrency(item.amount, true)
                            : `-${formatCurrency(item.amount)}`}
                        </td>
                        <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap align-top">
                          {pendingDeleteId === item.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteRecurring(item.id);
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
                                onClick={() => onToggleActive(item.id)}
                                title={
                                  item.active
                                    ? 'Posten pausieren'
                                    : 'Posten aktivieren'
                                }
                                className="p-1.5 rounded-lg text-[#8C7D72] hover:text-[#3D322C] hover:bg-[#EFEAE0] transition-colors"
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditClick(item)}
                                title="Bearbeiten"
                                className="p-1.5 rounded-lg text-[#8C7D72] hover:text-[#3D322C] hover:bg-[#EFEAE0] transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteId(item.id)}
                                title="Löschen"
                                className="p-1.5 rounded-lg text-[#8C7D72] hover:text-[#B43C2E] hover:bg-[#B43C2E]/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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
      </div>
    </div>
  );
};
