import {
  ActiveScope,
  AnnualOverviewData,
  BudgetDatabase,
  CategorySummary,
  LedgerEntry,
  MonthlySummary,
  RecurringItem,
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

    const amount = Number.isFinite(tx.amount) ? Math.max(0, tx.amount) : 0;

    if (tx.type === 'income') {
      incomeVariable += amount;
    } else {
      expenseVariable += amount;
    }

    ledger.push({
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
    });
  }

  for (const item of db.recurringItems) {
    if (!matchesScope(item.profileId)) continue;
    if (!isRecurringApplicableInMonth(item, yearMonth)) continue;

    const amount = Number.isFinite(item.amount) ? Math.max(0, item.amount) : 0;

    if (item.type === 'income') {
      incomeFixed += amount;
    } else {
      expenseFixed += amount;
    }

    ledger.push({
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
    });
  }

  ledger.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    if (a.kind !== b.kind) return a.kind === 'variable' ? -1 : 1;
    return b.amount - a.amount;
  });

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
