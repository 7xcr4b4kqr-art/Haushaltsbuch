import React, { useState } from 'react';
import { Pencil, Repeat, Trash2 } from 'lucide-react';
import { ActiveScope, LedgerEntry, Transaction } from '../types/budget';
import { formatCurrency, formatDateDE } from '../utils/format';

interface LedgerTableProps {
  entries: LedgerEntry[];
  scope: ActiveScope;
  txMap: Map<string, Transaction>;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onNavigateToRecurring: () => void;
}

/**
 * Gemeinsame Buchungsliste (Datum · Beschreibung & Kategorie · Betrag · Aktion),
 * genutzt von der Monatsübersicht und der Ansicht „Suche & Auswertung“.
 */
export const LedgerTable: React.FC<LedgerTableProps> = ({
  entries,
  scope,
  txMap,
  onEditTransaction,
  onDeleteTransaction,
  onNavigateToRecurring,
}) => {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  return (
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
          {entries.map((entry) => {
            const rawTx =
              entry.kind === 'variable' ? txMap.get(entry.sourceId) : undefined;
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
                      {entry.kind === 'recurring' ? 'Fixposten' : 'Variabel'}
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
                        <span className="truncate max-w-xs">{entry.note}</span>
                      </>
                    )}
                  </div>
                </td>
                <td
                  className={`py-2.5 px-3 text-right font-mono text-sm font-medium tabular-nums whitespace-nowrap align-top ${
                    isIncome ? 'text-[#2A6F4E]' : 'text-[#B43C2E]'
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
  );
};
