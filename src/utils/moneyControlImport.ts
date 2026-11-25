/**
 * Import von „Money Control“-CSV-Exporten.
 *
 * Reine Funktionen ohne React-Abhängigkeit. Die Datei wird ausschließlich
 * im Browser gelesen und verarbeitet; es findet kein Netzwerkzugriff statt.
 *
 * Erwartetes Format: UTF-8 (mit oder ohne BOM), Trennzeichen „;“,
 * Felder in Anführungszeichen, Kopfzeile:
 * Datum;Typ;Betrag;Währung;Kategorie;Person;Konto;Gegenkonto;Gruppe;Notiz
 */
import {
  BudgetDatabase,
  EntryType,
  Transaction,
  UserProfile,
} from '../types/budget';

export const MONEY_CONTROL_REQUIRED_COLUMNS = [
  'Datum',
  'Typ',
  'Betrag',
  'Währung',
  'Kategorie',
  'Person',
  'Notiz',
] as const;

export const MONEY_CONTROL_FALLBACK_CATEGORY = 'Sonstiges';

export interface MoneyControlEntry {
  type: EntryType;
  /** Positiver Betrag in Euro, auf Cent gerundet. */
  amount: number;
  /** Betrag in Cent (ganzzahlig, für exakte Summen). */
  amountCents: number;
  /** ISO-Datum YYYY-MM-DD */
  date: string;
  category: string;
  note: string;
  /** Unveränderter (getrimmter) Wert der Spalte „Person“, ggf. leer. */
  person: string;
}

export interface MoneyControlInvalidRow {
  /** Zeilennummer in der Datei (1 = Kopfzeile). */
  line: number;
  reason: string;
}

export interface MoneyControlParseResult {
  entries: MoneyControlEntry[];
  skippedTransfers: number;
  skippedOtherCurrency: number;
  invalidRows: MoneyControlInvalidRow[];
  dateFrom: string | null;
  dateTo: string | null;
  /** Anzahl Buchungen je Personenwert der CSV (leer = ""). */
  countsByPerson: Record<string, number>;
  /** Kategorien je Typ, sortiert nach Häufigkeit (absteigend), dann alphabetisch. */
  categories: { expense: string[]; income: string[] };
  totalIncomeCents: number;
  totalExpenseCents: number;
}

export class MoneyControlImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyControlImportError';
  }
}

/**
 * Dekodiert die Datei-Bytes. Gültiges UTF-8 wird bevorzugt (BOM wird
 * entfernt), andernfalls wird als windows-1252 gelesen.
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(view);
  } catch {
    text = new TextDecoder('windows-1252').decode(view);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Zerlegt CSV-Text in Zeilen und Felder. Unterstützt Felder in
 * Anführungszeichen (inkl. „""“ als maskiertes Anführungszeichen und
 * Zeilenumbrüchen innerhalb von Feldern), CRLF/LF/CR und ein führendes BOM.
 * Liefert zu jedem Datensatz die Zeilennummer seines Beginns.
 */
export function parseCsv(
  input: string,
  delimiter = ';'
): { fields: string[]; line: number }[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: { fields: string[]; line: number }[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let i = 0;
  const len = text.length;

  const endRecord = () => {
    fields.push(field);
    field = '';
    const isEmpty = fields.length === 1 && fields[0] === '';
    if (!isEmpty) records.push({ fields, line: recordLine });
    fields = [];
  };

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      if (ch === '\r' || ch === '\n') {
        // Zeilenumbruch innerhalb eines Feldes übernehmen, als \n
        field += '\n';
        if (ch === '\r' && text[i + 1] === '\n') i += 1;
        line += 1;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      fields.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      i += 1;
      endRecord();
      line += 1;
      recordLine = line;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (inQuotes) {
    throw new MoneyControlImportError(
      'Die CSV-Datei ist unvollständig (ein Anführungszeichen wird nicht geschlossen).'
    );
  }
  if (field !== '' || fields.length > 0) endRecord();
  return records;
}

/** „01.10.13“ oder „01.10.2013“ -> „2013-10-01“; ungültig -> null. */
export function parseGermanDate(raw: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Deutscher Betrag („- 1.150,00“, „2.979,68“, „12,5“) -> Betrag in Cent
 * (ohne Vorzeichen). Ungültig -> null.
 */
export function parseGermanAmountCents(raw: string): number | null {
  const cleaned = raw.replace(/[\s €]/g, '').replace(/^[-+−]/, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const [intPart, fracPart = ''] = cleaned.replace(/\./g, '').split(',');
  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0') || '0');
  return Number.isSafeInteger(cents) ? cents : null;
}

function sortCategoriesByFrequency(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
    .map(([name]) => name);
}

/** Parst den Inhalt eines Money-Control-CSV-Exports. Wirft MoneyControlImportError bei Formatfehlern. */
export function parseMoneyControlCsv(text: string): MoneyControlParseResult {
  if (!text || !text.trim()) {
    throw new MoneyControlImportError('Die ausgewählte Datei ist leer.');
  }
  const records = parseCsv(text, ';');
  if (records.length === 0) {
    throw new MoneyControlImportError('Die ausgewählte Datei ist leer.');
  }

  const header = records[0].fields.map((h) => h.trim());
  if (header.length < 2) {
    throw new MoneyControlImportError(
      'Die Datei ist keine Money-Control-CSV (erwartet werden durch Semikolon getrennte Spalten).'
    );
  }
  const colIndex = new Map<string, number>();
  header.forEach((name, idx) => {
    if (!colIndex.has(name)) colIndex.set(name, idx);
  });
  const missing = MONEY_CONTROL_REQUIRED_COLUMNS.filter((c) => !colIndex.has(c));
  if (missing.length > 0) {
    throw new MoneyControlImportError(
      `Die Datei ist keine Money-Control-CSV. Es fehlen die Spalten: ${missing.join(', ')}.`
    );
  }
  const idx = (name: (typeof MONEY_CONTROL_REQUIRED_COLUMNS)[number]) =>
    colIndex.get(name) as number;

  const entries: MoneyControlEntry[] = [];
  const invalidRows: MoneyControlInvalidRow[] = [];
  let skippedTransfers = 0;
  let skippedOtherCurrency = 0;
  const countsByPerson: Record<string, number> = {};
  const catCounts: Record<EntryType, Map<string, number>> = {
    expense: new Map(),
    income: new Map(),
  };
  let totalIncomeCents = 0;
  let totalExpenseCents = 0;
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  for (let r = 1; r < records.length; r++) {
    const { fields, line } = records[r];
    const get = (name: (typeof MONEY_CONTROL_REQUIRED_COLUMNS)[number]) =>
      (fields[idx(name)] ?? '').trim();

    const typRaw = get('Typ');
    let type: EntryType;
    if (typRaw === 'Ausgaben') type = 'expense';
    else if (typRaw === 'Einnahmen') type = 'income';
    else if (typRaw === 'Umbuchung') {
      skippedTransfers += 1;
      continue;
    } else {
      invalidRows.push({ line, reason: `Unbekannter Typ „${typRaw}“` });
      continue;
    }

    const currency = get('Währung').toUpperCase();
    if (currency !== 'EUR' && currency !== '') {
      skippedOtherCurrency += 1;
      continue;
    }

    const date = parseGermanDate(get('Datum'));
    if (!date) {
      invalidRows.push({ line, reason: 'Ungültiges Datum' });
      continue;
    }
    const amountCents = parseGermanAmountCents(get('Betrag'));
    if (amountCents === null) {
      invalidRows.push({ line, reason: 'Ungültiger Betrag' });
      continue;
    }

    const category = get('Kategorie') || MONEY_CONTROL_FALLBACK_CATEGORY;
    const person = get('Person');

    entries.push({
      type,
      amount: amountCents / 100,
      amountCents,
      date,
      category,
      note: get('Notiz'),
      person,
    });
    countsByPerson[person] = (countsByPerson[person] ?? 0) + 1;
    catCounts[type].set(category, (catCounts[type].get(category) ?? 0) + 1);
    if (type === 'income') totalIncomeCents += amountCents;
    else totalExpenseCents += amountCents;
    if (dateFrom === null || date < dateFrom) dateFrom = date;
    if (dateTo === null || date > dateTo) dateTo = date;
  }

  if (entries.length === 0) {
    throw new MoneyControlImportError(
      'In der Datei wurden keine importierbaren Buchungen (Ausgaben/Einnahmen) gefunden.'
    );
  }

  return {
    entries,
    skippedTransfers,
    skippedOtherCurrency,
    invalidRows,
    dateFrom,
    dateTo,
    countsByPerson,
    categories: {
      expense: sortCategoriesByFrequency(catCounts.expense),
      income: sortCategoriesByFrequency(catCounts.income),
    },
    totalIncomeCents,
    totalExpenseCents,
  };
}

export interface MoneyControlAssignmentOptions {
  /** Profil, das alle (bzw. alle nicht namentlich zugeordneten) Buchungen erhält. */
  targetProfileId: string;
  /** Personen der CSV den gleichnamigen Profilen (case-insensitive) zuordnen. */
  matchPersonsByName: boolean;
}

export interface MoneyControlAffectedProfile {
  profileId: string;
  profileName: string;
  existingTransactions: number;
  existingRecurringItems: number;
  newTransactions: number;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Profile, deren Name (case-insensitive) einem Personenwert der CSV entspricht. */
export function findProfilesMatchingPersons(
  profiles: UserProfile[],
  parsed: MoneyControlParseResult
): UserProfile[] {
  const persons = new Set(
    Object.keys(parsed.countsByPerson).map(normalizeName).filter(Boolean)
  );
  return profiles.filter((p) => persons.has(normalizeName(p.name)));
}

/**
 * Ordnet jede Buchung einer profileId zu. Ergebnis hat dieselbe Reihenfolge
 * wie parsed.entries.
 */
export function assignMoneyControlProfiles(
  profiles: UserProfile[],
  parsed: MoneyControlParseResult,
  options: MoneyControlAssignmentOptions
): string[] {
  if (!profiles.some((p) => p.id === options.targetProfileId)) {
    throw new MoneyControlImportError(
      'Das gewählte Zielprofil existiert nicht (mehr).'
    );
  }
  const idByName = new Map<string, string>();
  if (options.matchPersonsByName) {
    for (const p of profiles) {
      const key = normalizeName(p.name);
      if (key && !idByName.has(key)) idByName.set(key, p.id);
    }
  }
  return parsed.entries.map(
    (e) => idByName.get(normalizeName(e.person)) ?? options.targetProfileId
  );
}

/** Welche Profile werden überschrieben, mit bestehenden und neuen Anzahlen. */
export function planMoneyControlImport(
  db: BudgetDatabase,
  parsed: MoneyControlParseResult,
  options: MoneyControlAssignmentOptions
): MoneyControlAffectedProfile[] {
  const assigned = assignMoneyControlProfiles(db.profiles, parsed, options);
  const newCounts = new Map<string, number>();
  for (const id of assigned) newCounts.set(id, (newCounts.get(id) ?? 0) + 1);
  return db.profiles
    .filter((p) => newCounts.has(p.id))
    .map((p) => ({
      profileId: p.id,
      profileName: p.name,
      existingTransactions: db.transactions.filter((t) => t.profileId === p.id)
        .length,
      existingRecurringItems: db.recurringItems.filter(
        (r) => r.profileId === p.id
      ).length,
      newTransactions: newCounts.get(p.id) ?? 0,
    }));
}

function mergeCategoryLists(existing: string[], added: string[]): string[] {
  const result = [...existing];
  const lower = new Set(existing.map((c) => c.trim().toLowerCase()));
  for (const c of added) {
    const key = c.trim().toLowerCase();
    if (!key || lower.has(key)) continue;
    result.push(c);
    lower.add(key);
  }
  return result;
}

/**
 * Baut die neue Datenbank: Nur bei den betroffenen Profilen werden Buchungen
 * und Fixposten entfernt und durch die importierten Buchungen ersetzt.
 * Einträge anderer Profile, Profile (Name/Bild) bleiben unverändert;
 * Kategorien werden zusammengeführt (bestehende + neue, ohne Duplikate).
 */
export function buildDatabaseFromMoneyControl(
  db: BudgetDatabase,
  parsed: MoneyControlParseResult,
  options: MoneyControlAssignmentOptions,
  now: Date = new Date()
): BudgetDatabase {
  const assigned = assignMoneyControlProfiles(db.profiles, parsed, options);
  const affected = new Set(assigned);

  const createdAt = now.toISOString();
  const batch = now.getTime().toString(36);
  const imported: Transaction[] = parsed.entries.map((e, i) => ({
    id: `tx_mc_${batch}_${i.toString(36)}`,
    profileId: assigned[i],
    type: e.type,
    amount: e.amount,
    date: e.date,
    category: e.category,
    note: e.note,
    createdAt,
  }));

  return {
    ...db,
    updatedAt: createdAt,
    profiles: db.profiles.map((p) => ({ ...p })),
    categories: {
      expense: mergeCategoryLists(db.categories.expense, parsed.categories.expense),
      income: mergeCategoryLists(db.categories.income, parsed.categories.income),
    },
    transactions: [
      ...db.transactions.filter((t) => !affected.has(t.profileId)),
      ...imported,
    ],
    recurringItems: db.recurringItems.filter((r) => !affected.has(r.profileId)),
  };
}
