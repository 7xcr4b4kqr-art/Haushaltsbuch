import {
  BudgetDatabase,
  RecurringItem,
  Transaction,
  UserProfile,
} from '../types/budget';
import { computeAnnualOverview, computeMonthlySummary } from './calculations';
import { createId, getCurrentYearMonth, toYearMonth } from './format';

export const STORAGE_KEY = 'vto_budget_v1';
export const AVATARS_STORAGE_KEY = 'vto_profile_avatars_v1';

export const DEFAULT_PROFILES: ReadonlyArray<UserProfile> = [
  { id: 'profil_1', name: 'Profil 1' },
  { id: 'profil_2', name: 'Profil 2' },
];

export const FIXED_EXPENSE_CATEGORIES = [
  'Essen/Trinken',
  'Urlaub',
  'Freizeit',
] as const;

export const FIXED_REQUIRED_CATEGORIES = FIXED_EXPENSE_CATEGORIES;

export const FIXED_INCOME_CATEGORIES = [
  'Einnahmen',
  'Erstattungen',
  'Dividenden',
  'Aktiengewinne',
] as const;

export const DEFAULT_CATEGORIES = {
  expense: [
    'Essen/Trinken',
    'Urlaub',
    'Freizeit',
    'Lebensmittel',
    'Wohnen & Miete',
    'Strom & Internet',
    'Mobilität',
    'Versicherungen',
    'Abonnements',
    'Gesundheit',
    'Kleidung',
    'Sonstiges',
  ],
  income: [...FIXED_INCOME_CATEGORIES],
};

function normalizeCategoryName(name: string): string {
  return name.trim() === 'Restaurant' ? 'Essen/Trinken' : name.trim();
}

function ensureExpenseCategories(list: string[]): string[] {
  // Keeps the stored order; required fixed categories are appended if missing.
  const result: string[] = [];
  const lowerSet = new Set<string>();
  const incomeLowerSet = new Set(
    FIXED_INCOME_CATEGORIES.map((c) => c.toLowerCase())
  );
  for (const item of list) {
    const normalized = normalizeCategoryName(item);
    if (
      !normalized ||
      lowerSet.has(normalized.toLowerCase()) ||
      incomeLowerSet.has(normalized.toLowerCase())
    ) {
      continue;
    }
    result.push(normalized);
    lowerSet.add(normalized.toLowerCase());
  }
  for (const required of FIXED_EXPENSE_CATEGORIES) {
    if (!lowerSet.has(required.toLowerCase())) {
      result.push(required);
      lowerSet.add(required.toLowerCase());
    }
  }
  return result;
}

function normalizeIncomeCategories(list: unknown): string[] {
  if (!Array.isArray(list)) return [...FIXED_INCOME_CATEGORIES];
  const result: string[] = [];
  const lowerSet = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || lowerSet.has(trimmed.toLowerCase())) continue;
    result.push(trimmed);
    lowerSet.add(trimmed.toLowerCase());
  }
  return result.length > 0 ? result : [...FIXED_INCOME_CATEGORIES];
}

/** Income categories offered in forms (stored list, falling back to the fixed defaults). */
export function getIncomeCategories(categories: {
  income?: readonly string[];
}): string[] {
  return categories.income && categories.income.length > 0
    ? [...categories.income]
    : [...FIXED_INCOME_CATEGORIES];
}

export function createInitialDatabase(): BudgetDatabase {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    profiles: DEFAULT_PROFILES.map((p) => ({ ...p })),
    categories: {
      expense: [...DEFAULT_CATEGORIES.expense],
      income: [...DEFAULT_CATEGORIES.income],
    },
    transactions: [],
    recurringItems: [],
  };
}

function migrateLegacyProfileId(id: string): string {
  if (id === 'gregor') return 'profil_1';
  if (id === 'partnerin') return 'profil_2';
  return id;
}

function isValidAvatarDataUrl(val: unknown): val is string {
  return (
    typeof val === 'string' &&
    val.startsWith('data:image/') &&
    val.length < 250_000
  );
}

export function loadLocalAvatars(): Record<string, string> {
  try {
    const raw = localStorage.getItem(AVATARS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      const mappedId = migrateLegacyProfileId(key);
      if (mappedId && isValidAvatarDataUrl(value)) {
        out[mappedId] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLocalAvatars(avatars: Record<string, string>): void {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(avatars)) {
    if (key.trim() && isValidAvatarDataUrl(value)) {
      clean[key] = value;
    }
  }
  try {
    localStorage.setItem(AVATARS_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Storage quota exceeded or private mode
  }
}

export function saveLocalAvatar(
  profileId: string,
  avatarUrl?: string
): Record<string, string> {
  const current = loadLocalAvatars();
  if (avatarUrl && isValidAvatarDataUrl(avatarUrl)) {
    current[profileId] = avatarUrl;
  } else {
    delete current[profileId];
  }
  saveLocalAvatars(current);
  return current;
}

export function mergeLocalAvatars(
  profiles: UserProfile[],
  avatars: Record<string, string> = loadLocalAvatars()
): UserProfile[] {
  return profiles.map((p) => {
    const resolvedAvatar = isValidAvatarDataUrl(p.avatarUrl)
      ? p.avatarUrl
      : avatars[p.id];
    return {
      id: p.id,
      name: p.name,
      ...(resolvedAvatar ? { avatarUrl: resolvedAvatar } : {}),
    };
  });
}

function normalizeProfilesForPersistence(profiles: UserProfile[]): UserProfile[] {
  return profiles.map((p) => ({
    id: p.id,
    name: p.name,
    ...(isValidAvatarDataUrl(p.avatarUrl) ? { avatarUrl: p.avatarUrl } : {}),
  }));
}

export function syncLocalAvatarsFromProfiles(profiles: UserProfile[]): void {
  const next: Record<string, string> = {};
  for (const p of profiles) {
    if (p.id.trim() && isValidAvatarDataUrl(p.avatarUrl)) {
      next[p.id] = p.avatarUrl;
    }
  }
  saveLocalAvatars(next);
}

export function loadDatabase(): BudgetDatabase {
  const localAvatars = loadLocalAvatars();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialDatabase();
      return {
        ...initial,
        profiles: mergeLocalAvatars(initial.profiles, localAvatars),
      };
    }
    const parsed = JSON.parse(raw) as unknown;
    const validated = validateAndNormalizeDatabase(parsed);
    const base = validated ?? createInitialDatabase();
    return {
      ...base,
      profiles: mergeLocalAvatars(base.profiles, localAvatars),
    };
  } catch {
    const initial = createInitialDatabase();
    return {
      ...initial,
      profiles: mergeLocalAvatars(initial.profiles, localAvatars),
    };
  }
}

export function saveDatabase(db: BudgetDatabase): BudgetDatabase {
  const updatedAt = new Date().toISOString();
  const normalizedProfiles = normalizeProfilesForPersistence(db.profiles);
  const payload: BudgetDatabase = {
    ...db,
    profiles: normalizedProfiles,
    updatedAt,
  };
  syncLocalAvatarsFromProfiles(normalizedProfiles);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage quota exceeded or private mode; state remains in memory
  }
  return payload;
}

/**
 * Like saveDatabase, but reports whether the data was actually written to
 * localStorage (e.g. false when the storage quota is exceeded). On failure
 * the previously stored data remains untouched.
 */
export function saveDatabaseChecked(db: BudgetDatabase): {
  db: BudgetDatabase;
  persisted: boolean;
} {
  const updatedAt = new Date().toISOString();
  const normalizedProfiles = normalizeProfilesForPersistence(db.profiles);
  const payload: BudgetDatabase = {
    ...db,
    profiles: normalizedProfiles,
    updatedAt,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    return { db: payload, persisted: false };
  }
  syncLocalAvatarsFromProfiles(normalizedProfiles);
  return { db: payload, persisted: true };
}

export function validateAndNormalizeDatabase(
  input: unknown
): BudgetDatabase | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;

  if (!Array.isArray(obj.profiles) || obj.profiles.length < 1) return null;
  if (!Array.isArray(obj.transactions) || !Array.isArray(obj.recurringItems)) {
    return null;
  }

  // Parse custom profile IDs, names, and avatar images dynamically
  const profiles: UserProfile[] = [];
  const seenProfileIds = new Set<string>();
  for (const rawProf of obj.profiles) {
    if (!rawProf || typeof rawProf !== 'object') continue;
    const p = rawProf as Record<string, unknown>;
    if (typeof p.id !== 'string' || !p.id.trim()) continue;
    const mappedId = migrateLegacyProfileId(p.id.trim());
    if (seenProfileIds.has(mappedId)) continue;
    seenProfileIds.add(mappedId);
    const fallbackName = `Profil ${profiles.length + 1}`;
    const rawName = typeof p.name === 'string' ? p.name.trim() : '';
    profiles.push({
      id: mappedId,
      name: rawName || fallbackName,
      ...(isValidAvatarDataUrl(p.avatarUrl) ? { avatarUrl: p.avatarUrl } : {}),
    });
  }
  for (const def of DEFAULT_PROFILES) {
    if (profiles.length >= 2) break;
    if (!seenProfileIds.has(def.id)) {
      seenProfileIds.add(def.id);
      profiles.push({ ...def });
    }
  }
  if (profiles.length === 0) return null;
  const validProfileIds = new Set(profiles.map((p) => p.id));

  const transactions: Transaction[] = [];
  for (const item of obj.transactions) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    const mappedProfileId =
      typeof t.profileId === 'string'
        ? migrateLegacyProfileId(t.profileId)
        : '';
    if (
      typeof t.id !== 'string' ||
      !validProfileIds.has(mappedProfileId) ||
      (t.type !== 'expense' && t.type !== 'income') ||
      typeof t.amount !== 'number' ||
      !Number.isFinite(t.amount) ||
      t.amount < 0 ||
      typeof t.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
      typeof t.category !== 'string'
    ) {
      continue;
    }
    transactions.push({
      id: t.id,
      profileId: mappedProfileId,
      type: t.type,
      amount: Math.round(t.amount * 100) / 100,
      date: t.date,
      category: normalizeCategoryName(t.category),
      note: typeof t.note === 'string' ? t.note : '',
      createdAt:
        typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
    });
  }

  const recurringItems: RecurringItem[] = [];
  for (const item of obj.recurringItems) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const mappedProfileId =
      typeof r.profileId === 'string'
        ? migrateLegacyProfileId(r.profileId)
        : '';
    if (
      typeof r.id !== 'string' ||
      !validProfileIds.has(mappedProfileId) ||
      (r.type !== 'expense' && r.type !== 'income') ||
      typeof r.title !== 'string' ||
      typeof r.amount !== 'number' ||
      !Number.isFinite(r.amount) ||
      r.amount < 0 ||
      typeof r.category !== 'string' ||
      typeof r.dayOfMonth !== 'number' ||
      typeof r.startMonth !== 'string' ||
      !/^\d{4}-\d{2}$/.test(r.startMonth)
    ) {
      continue;
    }
    recurringItems.push({
      id: r.id,
      profileId: mappedProfileId,
      type: r.type,
      title: r.title,
      amount: Math.round(r.amount * 100) / 100,
      category: normalizeCategoryName(r.category),
      dayOfMonth: Math.max(1, Math.min(31, Math.round(r.dayOfMonth))),
      startMonth: r.startMonth,
      endMonth:
        typeof r.endMonth === 'string' && /^\d{4}-\d{2}$/.test(r.endMonth)
          ? r.endMonth
          : undefined,
      active: typeof r.active === 'boolean' ? r.active : true,
      note: typeof r.note === 'string' ? r.note : '',
      createdAt:
        typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    });
  }

  const rawCats = obj.categories as Record<string, unknown> | undefined;
  const rawExpenseCats = Array.isArray(rawCats?.expense)
    ? rawCats.expense.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    : [...DEFAULT_CATEGORIES.expense];

  const expenseCats = ensureExpenseCategories(
    rawExpenseCats.length > 0 ? rawExpenseCats : [...DEFAULT_CATEGORIES.expense]
  );
  const incomeCats = normalizeIncomeCategories(rawCats?.income);

  return {
    version: 1,
    updatedAt:
      typeof obj.updatedAt === 'string'
        ? obj.updatedAt
        : new Date().toISOString(),
    profiles,
    categories: {
      expense: expenseCats,
      income: incomeCats,
    },
    transactions,
    recurringItems,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function exportDatabaseToJson(db: BudgetDatabase): string {
  const exportDb: BudgetDatabase = {
    ...db,
    profiles: normalizeProfilesForPersistence(db.profiles),
  };
  const currentYm = getCurrentYearMonth();
  const currentYear = Number(currentYm.slice(0, 4));

  const buildScopeBalance = (scope: string) => {
    const m = computeMonthlySummary(exportDb, scope, currentYm);
    const y = computeAnnualOverview(exportDb, scope, currentYear);
    return {
      aktuellerMonat: {
        monat: currentYm,
        einnahmen: roundMoney(m.incomeTotal),
        ausgaben: roundMoney(m.expenseTotal),
        nettoSaldo: roundMoney(m.balance),
      },
      aktuellesJahr: {
        jahr: currentYear,
        einnahmen: roundMoney(y.totalIncome),
        ausgaben: roundMoney(y.totalExpense),
        nettoSaldo: roundMoney(y.totalBalance),
      },
    };
  };

  const profileSalden: Record<string, unknown> = {};
  for (const p of exportDb.profiles) {
    profileSalden[p.id] = {
      name: p.name,
      ...buildScopeBalance(p.id),
    };
  }

  const exportPayload = {
    version: exportDb.version,
    updatedAt: exportDb.updatedAt,
    profiles: exportDb.profiles,
    categories: exportDb.categories,
    transactions: exportDb.transactions,
    recurringItems: exportDb.recurringItems,
    salden: {
      profile: profileSalden,
      gemeinsam: buildScopeBalance('joint'),
    },
  };

  return JSON.stringify(exportPayload, null, 2);
}

export function buildSampleDatabase(existingProfiles?: UserProfile[]): BudgetDatabase {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const startMonth = `${currentYear}-01`;
  const profiles =
    existingProfiles && existingProfiles.length >= 2
      ? normalizeProfilesForPersistence(existingProfiles)
      : DEFAULT_PROFILES.map((p) => ({ ...p }));

  const p1 = profiles[0].id;
  const p2 = profiles[1].id;
  const created = now.toISOString();

  const recurringItems: RecurringItem[] = [
    {
      id: createId('rec'),
      profileId: p1,
      type: 'income',
      title: 'Nettogehalt',
      amount: 3450,
      category: 'Einnahmen',
      dayOfMonth: 1,
      startMonth,
      active: true,
      note: 'Monatlicher Gehaltseingang',
      createdAt: created,
    },
    {
      id: createId('rec'),
      profileId: p1,
      type: 'expense',
      title: 'Miete (Anteil)',
      amount: 780,
      category: 'Wohnen & Miete',
      dayOfMonth: 1,
      startMonth,
      active: true,
      note: 'Warmmiete hälftig',
      createdAt: created,
    },
    {
      id: createId('rec'),
      profileId: p1,
      type: 'expense',
      title: 'Strom & Glasfaser',
      amount: 118.5,
      category: 'Strom & Internet',
      dayOfMonth: 5,
      startMonth,
      active: true,
      note: 'Ökostrom & 250 Mbit',
      createdAt: created,
    },
    {
      id: createId('rec'),
      profileId: p1,
      type: 'expense',
      title: 'Deutschlandticket',
      amount: 58,
      category: 'Mobilität',
      dayOfMonth: 3,
      startMonth,
      active: true,
      note: 'ÖPNV-Abo',
      createdAt: created,
    },
    {
      id: createId('rec'),
      profileId: p2,
      type: 'income',
      title: 'Nettogehalt',
      amount: 3120,
      category: 'Einnahmen',
      dayOfMonth: 1,
      startMonth,
      active: true,
      note: 'Monatlicher Gehaltseingang',
      createdAt: created,
    },
    {
      id: createId('rec'),
      profileId: p2,
      type: 'expense',
      title: 'Miete (Anteil)',
      amount: 780,
      category: 'Wohnen & Miete',
      dayOfMonth: 1,
      startMonth,
      active: true,
      note: 'Warmmiete hälftig',
      createdAt: created,
    },
    {
      id: createId('rec'),
      profileId: p2,
      type: 'expense',
      title: 'Haftpflicht & Hausrat',
      amount: 42.9,
      category: 'Versicherungen',
      dayOfMonth: 10,
      startMonth,
      active: true,
      note: 'Gemeinsame Police',
      createdAt: created,
    },
    {
      id: createId('rec'),
      profileId: p2,
      type: 'expense',
      title: 'Streaming & Cloud',
      amount: 24.99,
      category: 'Abonnements',
      dayOfMonth: 15,
      startMonth,
      active: true,
      note: 'Cloud-Speicher & Musik',
      createdAt: created,
    },
  ];

  const transactions: Transaction[] = [];
  const sampleExpensesP1 = [
    { day: 4, amount: 84.3, category: 'Lebensmittel', note: 'Wocheneinkauf Biomarkt' },
    { day: 9, amount: 46.8, category: 'Freizeit & Kultur', note: 'Kino & Abendessen' },
    { day: 14, amount: 62.15, category: 'Lebensmittel', note: 'Supermarkt & Bäcker' },
    { day: 19, amount: 39.9, category: 'Mobilität', note: 'Fahrrad-Inspektion' },
    { day: 24, amount: 91.4, category: 'Lebensmittel', note: 'Vorratseinkauf' },
  ];
  const sampleExpensesP2 = [
    { day: 3, amount: 72.5, category: 'Lebensmittel', note: 'Wochenmarkt' },
    { day: 8, amount: 54.0, category: 'Gesundheit', note: 'Apotheke' },
    { day: 13, amount: 112.0, category: 'Kleidung', note: 'Winterjacke' },
    { day: 18, amount: 68.4, category: 'Lebensmittel', note: 'Einkauf Drogerie & Food' },
    { day: 23, amount: 48.2, category: 'Freizeit & Kultur', note: 'Buchhandlung & Kaffee' },
  ];

  for (let m = 0; m <= currentMonthIdx; m++) {
    const ym = toYearMonth(currentYear, m);
    const variance = ((m % 3) - 1) * 11.5;

    sampleExpensesP1.forEach((item, idx) => {
      transactions.push({
        id: createId('tx'),
        profileId: p1,
        type: 'expense',
        amount: Math.max(12, Math.round((item.amount + (idx % 2 === 0 ? variance : -variance * 0.5)) * 100) / 100),
        date: `${ym}-${String(item.day).padStart(2, '0')}`,
        category: item.category,
        note: item.note,
        createdAt: created,
      });
    });

    sampleExpensesP2.forEach((item, idx) => {
      if (item.category === 'Kleidung' && m % 2 === 1) return;
      transactions.push({
        id: createId('tx'),
        profileId: p2,
        type: 'expense',
        amount: Math.max(15, Math.round((item.amount + (idx % 2 === 1 ? variance : 0)) * 100) / 100),
        date: `${ym}-${String(item.day).padStart(2, '0')}`,
        category: item.category,
        note: item.note,
        createdAt: created,
      });
    });

    if (m === 4) {
      transactions.push({
        id: createId('tx'),
        profileId: p1,
        type: 'income',
        amount: 640,
        date: `${ym}-16`,
        category: 'Erstattungen',
        note: 'Steuererstattung',
        createdAt: created,
      });
    }
    if (m === 7) {
      transactions.push({
        id: createId('tx'),
        profileId: p2,
        type: 'income',
        amount: 450,
        date: `${ym}-20`,
        category: 'Dividenden',
        note: 'ETF-Ausschüttung',
        createdAt: created,
      });
    }
  }

  // Ensure current month has an entry close to today if currentMonthIdx >= 0
  const currentYm = getCurrentYearMonth();
  if (!transactions.some((t) => t.date.startsWith(currentYm))) {
    transactions.push({
      id: createId('tx'),
      profileId: p1,
      type: 'expense',
      amount: 42.6,
      date: `${currentYm}-05`,
      category: 'Lebensmittel',
      note: 'Einkauf',
      createdAt: created,
    });
  }

  return {
    version: 1,
    updatedAt: created,
    profiles,
    categories: {
      expense: [...DEFAULT_CATEGORIES.expense],
      income: [...DEFAULT_CATEGORIES.income],
    },
    transactions,
    recurringItems,
  };
}
