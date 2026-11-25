export type EntryType = 'expense' | 'income';

export type ActiveScope = string | 'joint';

export type ViewMode = 'dashboard' | 'recurring' | 'annual' | 'search' | 'backup';

export type SearchPeriod =
  | { kind: 'all' }
  | { kind: 'year'; year: number }
  | { kind: 'month'; yearMonth: string }; // YYYY-MM

export type SearchOrigin = 'annual' | 'monthly' | null;

export type SearchSort = 'date-desc' | 'date-asc' | 'amount-desc';

export interface SearchFilters {
  query: string;
  category: string; // 'all' = alle Kategorien
  type: 'all' | EntryType;
  period: SearchPeriod;
  sort: SearchSort;
}

export interface UserProfile {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface Transaction {
  id: string;
  profileId: string;
  type: EntryType;
  amount: number;
  date: string; // YYYY-MM-DD
  category: string;
  note: string;
  createdAt: string;
}

export interface RecurringItem {
  id: string;
  profileId: string;
  type: EntryType;
  title: string;
  amount: number;
  category: string;
  dayOfMonth: number; // 1..31
  startMonth: string; // YYYY-MM
  endMonth?: string; // YYYY-MM
  active: boolean;
  note: string;
  createdAt: string;
}

export interface CategoryConfig {
  expense: string[];
  income: string[];
}

export interface BudgetDatabase {
  version: 1;
  updatedAt: string;
  profiles: UserProfile[];
  categories: CategoryConfig;
  transactions: Transaction[];
  recurringItems: RecurringItem[];
}

export interface LedgerEntry {
  id: string;
  sourceId: string;
  kind: 'variable' | 'recurring';
  profileId: string;
  profileName: string;
  type: EntryType;
  title: string;
  note: string;
  category: string;
  amount: number;
  date: string; // YYYY-MM-DD
  recurringActive?: boolean;
}

export interface CategorySummary {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface MonthlySummary {
  yearMonth: string; // YYYY-MM
  monthIndex: number; // 0..11
  incomeTotal: number;
  incomeFixed: number;
  incomeVariable: number;
  expenseTotal: number;
  expenseFixed: number;
  expenseVariable: number;
  balance: number;
  savingsRate: number; // 0..100 or negative
  ledger: LedgerEntry[];
  expenseByCategory: CategorySummary[];
  incomeByCategory: CategorySummary[];
}

export interface AnnualOverviewData {
  year: number;
  months: MonthlySummary[];
  totalIncome: number;
  totalExpense: number;
  totalFixedExpense: number;
  totalVariableExpense: number;
  totalBalance: number;
  averageMonthlyIncome: number;
  averageMonthlyExpense: number;
  averageMonthlyBalance: number;
  overallSavingsRate: number;
  activeMonthsCount: number;
  expenseByCategory: CategorySummary[];
  incomeByCategory: CategorySummary[];
}
