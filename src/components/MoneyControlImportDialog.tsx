import React, { useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { BudgetDatabase } from '../types/budget';
import { formatDateDE } from '../utils/format';
import {
  MoneyControlAffectedProfile,
  MoneyControlParseResult,
  buildDatabaseFromMoneyControl,
  findProfilesMatchingPersons,
  planMoneyControlImport,
} from '../utils/moneyControlImport';

interface MoneyControlImportDialogProps {
  db: BudgetDatabase;
  fileName: string;
  parsed: MoneyControlParseResult;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (
    nextDb: BudgetDatabase,
    affected: MoneyControlAffectedProfile[]
  ) => void;
}

const fmtCount = (n: number) => n.toLocaleString('de-DE');

export const MoneyControlImportDialog: React.FC<MoneyControlImportDialogProps> = ({
  db,
  fileName,
  parsed,
  busy,
  error,
  onCancel,
  onConfirm,
}) => {
  const [targetProfileId, setTargetProfileId] = useState<string>(
    db.profiles[0]?.id ?? ''
  );
  const [matchPersons, setMatchPersons] = useState<boolean>(false);

  const matchingProfiles = useMemo(
    () => findProfilesMatchingPersons(db.profiles, parsed),
    [db.profiles, parsed]
  );
  const canMatch = matchingProfiles.length > 0;
  const options = {
    targetProfileId,
    matchPersonsByName: canMatch && matchPersons,
  };

  const affected = useMemo(
    () =>
      targetProfileId
        ? planMoneyControlImport(db, parsed, {
            targetProfileId,
            matchPersonsByName: canMatch && matchPersons,
          })
        : [],
    [db, parsed, targetProfileId, canMatch, matchPersons]
  );
  const othersUnchanged = db.profiles.length > affected.length;

  const handleConfirm = () => {
    if (!targetProfileId || busy) return;
    const nextDb = buildDatabaseFromMoneyControl(db, parsed, options);
    onConfirm(nextDb, affected);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2A221D]/45 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mc-import-title"
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EAE4D7]">
          <h2
            id="mc-import-title"
            className="font-display text-base font-semibold text-[#3D322C]"
          >
            Money Control CSV importieren
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="p-1.5 rounded-lg text-[#8C7D72] hover:text-[#3D322C] hover:bg-[#EFEAE0] disabled:opacity-50"
            aria-label="Dialog schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-4 bg-[#F5F2EB] border border-[#E5DFD3] rounded-xl text-xs text-[#4A3B32] space-y-1.5 tabular-nums">
            <div className="font-semibold text-[#3D322C] break-all">{fileName}</div>
            <div>
              {fmtCount(parsed.entries.length)} Buchungen aus Datei
              {parsed.dateFrom && parsed.dateTo && (
                <>
                  {' '}
                  (Zeitraum {formatDateDE(parsed.dateFrom)} –{' '}
                  {formatDateDE(parsed.dateTo)})
                </>
              )}
              , {fmtCount(parsed.skippedTransfers)} Umbuchungen übersprungen.
            </div>
            {parsed.skippedOtherCurrency > 0 && (
              <div>
                {fmtCount(parsed.skippedOtherCurrency)} Zeilen in anderer
                Währung als EUR übersprungen.
              </div>
            )}
            {parsed.invalidRows.length > 0 && (
              <div className="text-[#B43C2E]">
                {fmtCount(parsed.invalidRows.length)} ungültige Zeilen
                übersprungen (z. B. Zeile {parsed.invalidRows[0].line}:{' '}
                {parsed.invalidRows[0].reason}).
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="mc-import-target"
              className="block text-xs font-medium text-[#6E6056]"
            >
              Import zuordnen zu / Dieses Profil wird überschrieben:
            </label>
            <select
              id="mc-import-target"
              required
              value={targetProfileId}
              onChange={(e) => setTargetProfileId(e.target.value)}
              disabled={busy}
              className="w-full px-3 py-2 text-sm font-medium bg-white border border-[#D4CCB9] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
            >
              {db.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {canMatch && (
            <label className="flex items-start gap-2.5 text-xs text-[#4A3B32] cursor-pointer">
              <input
                type="checkbox"
                checked={matchPersons}
                onChange={(e) => setMatchPersons(e.target.checked)}
                disabled={busy}
                className="mt-0.5 accent-[#3D322C]"
              />
              <span>
                Personen aus der Datei den gleichnamigen Profilen zuordnen
                (übrige Buchungen gehen an das gewählte Profil)
              </span>
            </label>
          )}

          <div className="p-4 border border-[#B43C2E]/30 bg-[#F3DEDB]/40 rounded-xl text-xs text-[#4A3B32] space-y-1.5 tabular-nums">
            <div className="flex items-center gap-1.5 font-semibold text-[#B43C2E]">
              <AlertTriangle className="w-3.5 h-3.5" />
              Folgende Profile werden überschrieben:
            </div>
            {affected.map((a) => (
              <div key={a.profileId}>
                <span className="font-semibold text-[#3D322C]">{a.profileName}</span>
                : {fmtCount(a.existingTransactions)} bestehende Buchungen
                {a.existingRecurringItems > 0 &&
                  ` und ${fmtCount(a.existingRecurringItems)} Fixposten`}{' '}
                werden durch {fmtCount(a.newTransactions)} neue ersetzt.
              </div>
            ))}
            <div className="text-[#6E6056]">
              {othersUnchanged ? 'Andere Profile bleiben unverändert. ' : ''}
              Profilnamen und -bilder bleiben erhalten; neue Kategorien werden
              ergänzt.
            </div>
          </div>

          {error && (
            <p className="text-xs font-medium text-[#B43C2E]">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-[#6E6056] hover:text-[#3D322C] rounded-xl hover:bg-[#EFEAE0] transition-colors disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || !targetProfileId}
              className="px-4 py-2 text-sm font-medium text-[#FCFBF8] bg-[#B43C2E] rounded-xl hover:bg-[#962F23] transition-colors disabled:opacity-60"
            >
              {busy ? 'Importiere …' : 'Importieren'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
