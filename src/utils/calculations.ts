import {
  ActiveScope,
  AnnualOverviewData,
  BudgetDatabase,
  CategorySummary,
  LedgerEntry,
  MonthlySummary,
  RecurringItem,
  Transaction,
  UserProfile,
} from '../types/budget';
import { getDaysInMonth, toYearMonth } from './format';

export function isRecurringApplicableInMonth(
  item: RecurringItem,
  yearMonth: string
): boolean {
  if (!item.active) return false;
  if (item.startMonth > yearMonth) return false;
  const endYm = item.endMonth?.slice(0, 7);
  if (endYm && yearMonth >= endYm) return false;
  return true;
}

export function resolveRecurringDateForMonth(
  dayOfMonth: number,
  yearMonth: string
): string {
  const [yStr, mStr] = yearMonth.split('-');
  const year = Number(yStr);
  const monthIdx = Number(mStr) - 1;
  const maxDay = getDaysInMonth(year, monthIdx);
  const safeDay = Math.max(1, Math.min(dayOfMonth, maxDay));
  return `${yearMonth}-${String(safeDay).padStart(2, '0')}`;
}

function getProfileMap(profiles: UserProfile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of profiles) {
    map.set(p.id, p.name);
  }
  return map;
}

function sanitizeAmount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function buildVariableEntry(
  tx: Transaction,
  amount: number,
  profileMap: Map<string, string>
): LedgerEntry {
  return {
    id: `var_${tx.id}`,
    sourceId: tx.id,
    kind: 'variable',
    profileId: tx.profileId,
    profileName: profileMap.get(tx.profileId) ?? tx.profileId,
    type: tx.type,
    title: tx.note.trim() || tx.category,
    note: tx.note,
    category: tx.category,
    amount,
    date: tx.date,
  };
}

function buildRecurringEntry(
  item: RecurringItem,
  amount: number,
  yearMonth: string,
  profileMap: Map<string, string>
): LedgerEntry {
  return {
    id: `rec_${item.id}_${yearMonth}`,
    sourceId: item.id,
    kind: 'recurring',
    profileId: item.profileId,
    profileName: profileMap.get(item.profileId) ?? item.profileId,
    type: item.type,
    title: item.title,
    note: item.note,
    category: item.category,
    amount,
    date: resolveRecurringDateForMonth(item.dayOfMonth, yearMonth),
    recurringActive: item.active,
  };
}

function sortLedgerEntries(ledger: LedgerEntry[]): void {
  ledger.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    if (a.kind !== b.kind) return a.kind === 'variable' ? -1 : 1;
    return b.amount - a.amount;
  });
}

function buildCategoryBreakdown(
  entries: LedgerEntry[],
  type: 'expense' | 'income',
  total: number
): CategorySummary[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const entry of entries) {
    if (entry.type !== type) continue;
    const prev = map.get(entry.category) ?? { amount: 0, count: 0 };
    map.set(entry.category, {
      amount: prev.amount + entry.amount,
      count: prev.count + 1,
    });
  }

  return Array.from(map.entries())
    .map(([category, stats]) => ({
      category,
      amount: stats.amount,
      count: stats.count,
      percentage: total > 0 ? (stats.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function computeMonthlySummary(
  db: BudgetDatabase,
  scope: ActiveScope,
  yearMonth: string
): MonthlySummary {
  const profileMap = getProfileMap(db.profiles);
  const matchesScope = (profileId: string) =>
    scope === 'joint' || profileId === scope;

  const monthIdx = Number(yearMonth.split('-')[1]) - 1;

  const ledger: LedgerEntry[] = [];
  let incomeFixed = 0;
  let incomeVariable = 0;
  let expenseFixed = 0;
  let expenseVariable = 0;

  for (const tx of db.transactions) {
    if (!matchesScope(tx.profileId)) continue;
    if (!tx.date.startsWith(yearMonth)) continue;

    const amount = sanitizeAmount(tx.amount);

    if (tx.type === 'income') {
      incomeVariable += amount;
    } else {
      expenseVariable += amount;
    }

    ledger.push(buildVariableEntry(tx, amount, profileMap));
  }

  for (const item of db.recurringItems) {
    if (!matchesScope(item.profileId)) continue;
    if (!isRecurringApplicableInMonth(item, yearMonth)) continue;

    const amount = sanitizeAmount(item.amount);

    if (item.type === 'income') {
      incomeFixed += amount;
    } else {
      expenseFixed += amount;
    }

    ledger.push(buildRecurringEntry(item, amount, yearMonth, profileMap));
  }

  sortLedgerEntries(ledger);

  const incomeTotal = incomeFixed + incomeVariable;
  const expenseTotal = expenseFixed + expenseVariable;
  const balance = incomeTotal - expenseTotal;
  const savingsRate = incomeTotal > 0 ? (balance / incomeTotal) * 100 : 0;

  return {
    yearMonth,
    monthIndex: monthIdx,
    incomeTotal,
    incomeFixed,
    incomeVariable,
    expenseTotal,
    expenseFixed,
    expenseVariable,
    balance,
    savingsRate,
    ledger,
    expenseByCategory: buildCategoryBreakdown(ledger, 'expense', expenseTotal),
    incomeByCategory: buildCategoryBreakdown(ledger, 'income', incomeTotal),
  };
}

export function computeAnnualOverview(
  db: BudgetDatabase,
  scope: ActiveScope,
  year: number
): AnnualOverviewData {
  const months: MonthlySummary[] = [];
  for (let m = 0; m < 12; m++) {
    months.push(computeMonthlySummary(db, scope, toYearMonth(year, m)));
  }

  const totalIncome = months.reduce((sum, m) => sum + m.incomeTotal, 0);
  const totalExpense = months.reduce((sum, m) => sum + m.expenseTotal, 0);
  const totalFixedExpense = months.reduce((sum, m) => sum + m.expenseFixed, 0);
  const totalVariableExpense = months.reduce(
    (sum, m) => sum + m.expenseVariable,
    0
  );
  const totalBalance = totalIncome - totalExpense;

  const activeMonths = months.filter(
    (m) => m.incomeTotal > 0 || m.expenseTotal > 0
  );
  const divisor = activeMonths.length > 0 ? activeMonths.length : 12;

  const allLedgerEntries = months.flatMap((m) => m.ledger);

  return {
    year,
    months,
    totalIncome,
    totalExpense,
    totalFixedExpense,
    totalVariableExpense,
    totalBalance,
    averageMonthlyIncome: totalIncome / divisor,
    averageMonthlyExpense: totalExpense / divisor,
    averageMonthlyBalance: totalBalance / divisor,
    overallSavingsRate:
      totalIncome > 0 ? (totalBalance / totalIncome) * 100 : 0,
    activeMonthsCount: activeMonths.length,
    expenseByCategory: buildCategoryBreakdown(
      allLedgerEntries,
      'expense',
      totalExpense
    ),
    incomeByCategory: buildCategoryBreakdown(
      allLedgerEntries,
      'income',
      totalIncome
    ),
  };
}

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function nextYearMonth(yearMonth: string): string {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  return month >= 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Liefert alle Buchungen (variabel + wiederkehrende Fixposten) für die Monate
 * fromYearMonth..toYearMonth (inklusive). Für jeden Monat sind die Einträge
 * exakt dieselben (gleiche Reihenfolge) wie computeMonthlySummary(...).ledger.
 * Ergebnis: neuester Monat zuerst.
 */
export function computeLedgerForRange(
  db: BudgetDatabase,
  scope: ActiveScope,
  fromYearMonth: string,
  toYearMonth: string
): LedgerEntry[] {
  if (!YEAR_MONTH_RE.test(fromYearMonth) || !YEAR_MONTH_RE.test(toYearMonth)) {
    return [];
  }
  if (fromYearMonth > toYearMonth) return [];

  const profileMap = getProfileMap(db.profiles);
  const matchesScope = (profileId: string) =>
    scope === 'joint' || profileId === scope;

  // Transaktionen einmalig nach Monat gruppieren (entspricht date.startsWith(ym))
  const byMonth = new Map<string, Transaction[]>();
  for (const tx of db.transactions) {
    if (!matchesScope(tx.profileId)) continue;
    if (typeof tx.date !== 'string' || tx.date.length < 7) continue;
    const ym = tx.date.slice(0, 7);
    if (ym < fromYearMonth || ym > toYearMonth) continue;
    const bucket = byMonth.get(ym);
    if (bucket) bucket.push(tx);
    else byMonth.set(ym, [tx]);
  }

  const recurring = db.recurringItems.filter(
    (item) => item.active && matchesScope(item.profileId)
  );

  const months: LedgerEntry[][] = [];
  for (let ym = fromYearMonth; ym <= toYearMonth; ym = nextYearMonth(ym)) {
    const ledger: LedgerEntry[] = [];
    const txs = byMonth.get(ym);
    if (txs) {
      for (const tx of txs) {
        ledger.push(buildVariableEntry(tx, sanitizeAmount(tx.amount), profileMap));
      }
    }
    for (const item of recurring) {
      if (!isRecurringApplicableInMonth(item, ym)) continue;
      ledger.push(
        buildRecurringEntry(item, sanitizeAmount(item.amount), ym, profileMap)
      );
    }
    if (ledger.length > 0) {
      sortLedgerEntries(ledger);
      months.push(ledger);
    }
  }

  const result: LedgerEntry[] = [];
  for (let i = months.length - 1; i >= 0; i--) {
    for (const entry of months[i]) result.push(entry);
  }
  return result;
}

/**
 * Frühester und spätester Monat mit Daten (Buchung oder aktiver Fixposten)
 * im Scope. Das Ende reicht mindestens bis currentYearMonth, sofern ein
 * aktiver Fixposten dann noch läuft, bzw. bis zum letzten Buchungsmonat.
 */
export function getLedgerDataBounds(
  db: BudgetDatabase,
  scope: ActiveScope,
  currentYearMonth: string
): { from: string; to: string } | null {
  const matchesScope = (profileId: string) =>
    scope === 'joint' || profileId === scope;
  let from: string | null = null;
  let to: string | null = null;

  for (const tx of db.transactions) {
    if (!matchesScope(tx.profileId)) continue;
    if (typeof tx.date !== 'string') continue;
    const ym = tx.date.slice(0, 7);
    if (!YEAR_MONTH_RE.test(ym)) continue;
    if (from === null || ym < from) from = ym;
    if (to === null || ym > to) to = ym;
  }

  for (const item of db.recurringItems) {
    if (!item.active || !matchesScope(item.profileId)) continue;
    const start = item.startMonth?.slice(0, 7);
    if (!start || !YEAR_MONTH_RE.test(start)) continue;
    if (from === null || start < from) from = start;
    if (to === null || start > to) to = start;
    if (isRecurringApplicableInMonth(item, currentYearMonth)) {
      if (to === null || currentYearMonth > to) to = currentYearMonth;
    }
  }

  if (from === null || to === null) return null;
  if (currentYearMonth > to && currentYearMonth >= from) {
    to = currentYearMonth;
  }
  return { from, to };
}
