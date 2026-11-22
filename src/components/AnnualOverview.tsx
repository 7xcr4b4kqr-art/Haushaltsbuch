import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react';
import { ActiveScope, AnnualOverviewData, BudgetDatabase } from '../types/budget';
import {
  MONTH_NAMES_FULL,
  MONTH_NAMES_SHORT,
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
} from '../utils/format';
import { NetBalanceCard } from './NetBalanceCard';

interface AnnualOverviewProps {
  db: BudgetDatabase;
  scope: ActiveScope;
  year: number;
  data: AnnualOverviewData;
  onChangeYear: (nextYear: number) => void;
  onOpenMonth: (yearMonth: string) => void;
}

export const AnnualOverview: React.FC<AnnualOverviewProps> = ({
  db,
  scope,
  year,
  data,
  onChangeYear,
  onOpenMonth,
}) => {
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(null);

  const scopeLabel =
    scope === 'joint'
      ? 'Gemeinsame Familienbilanz'
      : db.profiles.find((p) => p.id === scope)?.name ?? scope;

  const maxChartValue = Math.max(
    1000,
    ...data.months.map((m) => Math.max(m.incomeTotal, m.expenseTotal))
  );
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxChartValue)));
  const niceStep =
    maxChartValue / magnitude <= 2
      ? 0.5 * magnitude
      : maxChartValue / magnitude <= 5
      ? magnitude
      : 2 * magnitude;
  const chartCeiling = Math.ceil(maxChartValue / niceStep) * niceStep;
  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => chartCeiling * r);

  const hoveredMonth =
    hoveredMonthIdx !== null ? data.months[hoveredMonthIdx] : null;

  return (
    <div className="space-y-6">
      {/* Top Year Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm px-5 py-3.5">
        <div>
          <h2 className="font-display text-base font-semibold text-[#3D322C]">
            Jahresabschluss {year}
          </h2>
          <p className="text-xs text-[#6E6056] mt-0.5">
            12-Monats-Entwicklung · {scopeLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeYear(year - 1)}
            className="p-2 rounded-xl border border-[#DFD7C8] bg-white text-[#6E6056] hover:text-[#3D322C] hover:border-[#3D322C] transition-colors"
            aria-label="Vorheriges Jahr"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-sm font-semibold text-[#3D322C] px-3 tabular-nums">
            {year}
          </span>
          <button
            type="button"
            onClick={() => onChangeYear(year + 1)}
            className="p-2 rounded-xl border border-[#DFD7C8] bg-white text-[#6E6056] hover:text-[#3D322C] hover:border-[#3D322C] transition-colors"
            aria-label="Nächstes Jahr"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Prominent Central Netto-Saldo / Jahressaldo Box */}
      <NetBalanceCard
        title="Netto-Saldo (Jahressaldo)"
        periodLabel={`Gesamtjahr ${year}`}
        incomeTotal={data.totalIncome}
        expenseTotal={data.totalExpense}
        balance={data.totalBalance}
        secondaryLabel="Ø Monatssaldo"
        secondaryBalance={data.averageMonthlyBalance}
      />

      {/* 3 Cumulative Annual KPI Cells */}
      <section className="grid grid-cols-1 sm:grid-cols-3 bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm divide-y sm:divide-y-0 sm:divide-x divide-[#EAE4D7]">
        <div className="p-5">
          <div className="text-xs font-medium text-[#6E6056]">
            Kumulierte Jahreseinnahmen
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#2A6F4E] tabular-nums">
            {formatCurrency(data.totalIncome, true)}
          </div>
          <div className="mt-1.5 text-xs text-[#8C7D72] tabular-nums">
            Ø {formatCurrency(data.averageMonthlyIncome)} / Monat
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-[#6E6056]">
            Kumulierte Jahresausgaben
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#B43C2E] tabular-nums">
            {data.totalExpense > 0
              ? `-${formatCurrency(data.totalExpense)}`
              : formatCurrency(0)}
          </div>
          <div className="mt-1.5 text-xs text-[#8C7D72] tabular-nums">
            Fix {formatCurrency(data.totalFixedExpense)} · Variabel{' '}
            {formatCurrency(data.totalVariableExpense)}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-[#6E6056]">
            Jahres-Sparquote
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#3D322C] tabular-nums">
            {data.totalIncome > 0
              ? formatPercent(data.overallSavingsRate)
              : '0,0 %'}
          </div>
          <div className="mt-1.5 text-xs text-[#8C7D72] tabular-nums">
            {data.activeMonthsCount} von 12 Monaten mit Buchungen
          </div>
        </div>
      </section>

      {/* 12-Month Interactive SVG Chart */}
      <section className="bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-display text-base font-semibold text-[#3D322C]">
              Monatsvergleich Einnahmen & Ausgaben
            </h3>
            <p className="text-xs text-[#6E6056] mt-0.5">
              Monat anklicken, um direkt in die Detailansicht zu springen
            </p>
          </div>

          <div className="flex items-center gap-5 text-xs text-[#6E6056]">
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-[#2A6F4E] inline-block" />
              Einnahmen
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-[#4A3B32] inline-block" />
              Ausgaben
            </span>
          </div>
        </div>

        <div className="relative">
          {/* Interactive Hover Detail Strip */}
          <div className="min-h-8 mb-3 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-[#EAE4D7] pb-2.5">
            {hoveredMonth ? (
              <>
                <span className="font-semibold text-[#3D322C]">
                  {MONTH_NAMES_FULL[hoveredMonth.monthIndex]} {year}
                </span>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums">
                  <span className="text-[#2A6F4E]">
                    Einnahmen: {formatCurrency(hoveredMonth.incomeTotal, true)}
                  </span>
                  <span className="text-[#B43C2E]">
                    Ausgaben:{' '}
                    {hoveredMonth.expenseTotal > 0
                      ? `-${formatCurrency(hoveredMonth.expenseTotal)}`
                      : formatCurrency(0)}
                  </span>
                  <span
                    className={`font-semibold ${
                      hoveredMonth.balance >= 0
                        ? 'text-[#2A6F4E]'
                        : 'text-[#B43C2E]'
                    }`}
                  >
                    Saldo: {formatCurrency(hoveredMonth.balance, true)}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-[#8C7D72]">
                Bewegen Sie den Mauszeiger über einen Monat für exakte Werte.
              </span>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 840 260"
              className="w-full min-w-[620px] h-auto select-none"
              role="img"
              aria-label={`Jahresdiagramm ${year}`}
            >
              {gridTicks.map((tick, idx) => {
                const y = 215 - (tick / chartCeiling) * 185;
                return (
                  <g key={idx}>
                    <line
                      x1={64}
                      y1={y}
                      x2={824}
                      y2={y}
                      stroke={idx === 0 ? '#D4CCB9' : '#EFEAE0'}
                      strokeWidth={1}
                    />
                    <text
                      x={56}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-[#8C7D72] text-[10px] font-mono tabular-nums"
                    >
                      {formatCompactCurrency(tick)}
                    </text>
                  </g>
                );
              })}

              {data.months.map((m, idx) => {
                const groupWidth = (824 - 72) / 12;
                const centerX = 72 + idx * groupWidth + groupWidth / 2;
                const barWidth = 16;
                const gap = 4;

                const incomeHeight = Math.max(
                  m.incomeTotal > 0 ? 2 : 0,
                  (m.incomeTotal / chartCeiling) * 185
                );
                const expenseHeight = Math.max(
                  m.expenseTotal > 0 ? 2 : 0,
                  (m.expenseTotal / chartCeiling) * 185
                );

                const isHovered = hoveredMonthIdx === idx;

                return (
                  <g
                    key={m.yearMonth}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredMonthIdx(idx)}
                    onMouseLeave={() => setHoveredMonthIdx(null)}
                    onClick={() => onOpenMonth(m.yearMonth)}
                  >
                    <rect
                      x={72 + idx * groupWidth}
                      y={20}
                      width={groupWidth}
                      height={225}
                      fill={isHovered ? '#F5F2EB' : 'transparent'}
                      rx={6}
                    />

                    <rect
                      x={centerX - barWidth - gap / 2}
                      y={215 - incomeHeight}
                      width={barWidth}
                      height={incomeHeight}
                      rx={3}
                      fill={isHovered ? '#1E563B' : '#2A6F4E'}
                    />

                    <rect
                      x={centerX + gap / 2}
                      y={215 - expenseHeight}
                      width={barWidth}
                      height={expenseHeight}
                      rx={3}
                      fill={isHovered ? '#3D322C' : '#6E5A4F'}
                    />

                    <text
                      x={centerX}
                      y={238}
                      textAnchor="middle"
                      className={`text-[11px] font-medium ${
                        isHovered
                          ? 'fill-[#3D322C] font-semibold'
                          : 'fill-[#6E6056]'
                      }`}
                    >
                      {MONTH_NAMES_SHORT[idx]}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </section>

      {/* 12-Month Ledger Table */}
      <section className="bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-[#EAE4D7]">
          <h3 className="font-display text-base font-semibold text-[#3D322C]">
            Monatstabelle {year}
          </h3>
          <p className="text-xs text-[#6E6056] mt-0.5">
            Alle 12 Monate im Vergleich inklusive Fixkosten- und Variabler
            Aufschlüsselung
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#EAE4D7] text-xs font-medium text-[#6E6056] bg-[#F5F2EB]/60">
                <th className="py-2.5 pl-5 pr-3">Monat</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  Einnahmen
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  Fixkosten
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  Variabel
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  Ausgaben Ges.
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  Saldo
                </th>
                <th className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap">
                  Sparquote
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0ECE2] text-sm">
              {data.months.map((m, idx) => {
                const hasActivity = m.incomeTotal > 0 || m.expenseTotal > 0;
                return (
                  <tr
                    key={m.yearMonth}
                    onClick={() => onOpenMonth(m.yearMonth)}
                    className={`cursor-pointer transition-colors hover:bg-[#F5F2EB]/55 ${
                      !hasActivity ? 'text-[#A09286]' : 'text-[#3D322C]'
                    }`}
                  >
                    <td className="py-2.5 pl-5 pr-3 font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {MONTH_NAMES_FULL[idx]}
                        <ArrowUpRight className="w-3 h-3 text-[#C2B8A8]" />
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap text-[#2A6F4E]">
                      {m.incomeTotal > 0
                        ? formatCurrency(m.incomeTotal, true)
                        : formatCurrency(0)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap text-[#6E6056]">
                      {formatCurrency(m.expenseFixed)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap text-[#6E6056]">
                      {formatCurrency(m.expenseVariable)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap text-[#B43C2E]">
                      {m.expenseTotal > 0
                        ? `-${formatCurrency(m.expenseTotal)}`
                        : formatCurrency(0)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-medium tabular-nums whitespace-nowrap ${
                        m.balance > 0
                          ? 'text-[#2A6F4E]'
                          : m.balance < 0
                          ? 'text-[#B43C2E]'
                          : 'text-[#8C7D72]'
                      }`}
                    >
                      {formatCurrency(m.balance, true)}
                    </td>
                    <td className="py-2.5 pl-3 pr-5 text-right font-mono tabular-nums whitespace-nowrap text-xs text-[#6E6056]">
                      {m.incomeTotal > 0 ? formatPercent(m.savingsRate) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#E5DFD3] bg-[#F5F2EB]/70 font-semibold text-sm text-[#3D322C]">
                <td className="py-3 pl-5 pr-3">Jahressumme {year}</td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-[#2A6F4E] whitespace-nowrap">
                  {formatCurrency(data.totalIncome, true)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-[#4A3B32] whitespace-nowrap">
                  {formatCurrency(data.totalFixedExpense)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-[#4A3B32] whitespace-nowrap">
                  {formatCurrency(data.totalVariableExpense)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-[#B43C2E] whitespace-nowrap">
                  {data.totalExpense > 0
                    ? `-${formatCurrency(data.totalExpense)}`
                    : formatCurrency(0)}
                </td>
                <td
                  className={`py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                    data.totalBalance > 0
                      ? 'text-[#2A6F4E]'
                      : data.totalBalance < 0
                      ? 'text-[#B43C2E]'
                      : 'text-[#3D322C]'
                  }`}
                >
                  {formatCurrency(data.totalBalance, true)}
                </td>
                <td className="py-3 pl-3 pr-5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                  {data.totalIncome > 0
                    ? formatPercent(data.overallSavingsRate)
                    : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Separate Annual Expense & Income Category Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm p-5">
          <h3 className="font-display text-base font-semibold text-[#3D322C]">
            Ausgaben nach Kategorie ({year})
          </h3>
          <p className="text-xs text-[#6E6056] mt-0.5 tabular-nums">
            Ausschließlich Ausgaben ·{' '}
            <span className="text-[#B43C2E] font-medium">
              {data.totalExpense > 0
                ? `-${formatCurrency(data.totalExpense)}`
                : formatCurrency(0)}
            </span>
          </p>

          {data.expenseByCategory.length === 0 ? (
            <p className="mt-5 text-xs text-[#8C7D72]">
              Für {year} liegen noch keine Ausgaben vor.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {data.expenseByCategory.map((cat) => (
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
          <h3 className="font-display text-base font-semibold text-[#3D322C]">
            Einnahmen nach Kategorie ({year})
          </h3>
          <p className="text-xs text-[#6E6056] mt-0.5 tabular-nums">
            Getrennt erfasste Eingänge ·{' '}
            <span className="text-[#2A6F4E] font-medium">
              {formatCurrency(data.totalIncome, true)}
            </span>
          </p>

          {data.incomeByCategory.length === 0 ? (
            <p className="mt-5 text-xs text-[#8C7D72]">
              Für {year} liegen noch keine Einnahmen vor.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {data.incomeByCategory.map((cat) => (
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
      </div>
    </div>
  );
};
