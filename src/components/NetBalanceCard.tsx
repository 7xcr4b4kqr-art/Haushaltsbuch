import React from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { formatCurrency } from '../utils/format';

interface NetBalanceCardProps {
  title: string;
  periodLabel: string;
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
  secondaryLabel?: string;
  secondaryBalance?: number;
}

export const NetBalanceCard: React.FC<NetBalanceCardProps> = ({
  title,
  periodLabel,
  incomeTotal,
  expenseTotal,
  balance,
  secondaryLabel,
  secondaryBalance,
}) => {
  const isPositive = balance > 0;
  const isNegative = balance < 0;

  const containerClasses = isPositive
    ? 'bg-[#EEF5F0] border-[#B8D8C4]'
    : isNegative
    ? 'bg-[#FAF0EE] border-[#E3BEB8]'
    : 'bg-[#FCFBF8] border-[#E5DFD3]';

  const labelColor = isPositive
    ? 'text-[#215A3E]'
    : isNegative
    ? 'text-[#9A3125]'
    : 'text-[#6E6056]';

  const amountColor = isPositive
    ? 'text-[#1F5E3F]'
    : isNegative
    ? 'text-[#B43C2E]'
    : 'text-[#3D322C]';

  const iconBg = isPositive
    ? 'bg-[#DCECE1] text-[#1F5E3F]'
    : isNegative
    ? 'bg-[#F3DEDB] text-[#B43C2E]'
    : 'bg-[#EFEAE0] text-[#6E6056]';

  const statusText = isPositive
    ? 'Überschuss (Einnahmen > Ausgaben)'
    : isNegative
    ? 'Unterdeckung (Ausgaben > Einnahmen)'
    : 'Ausgeglichener Saldo';

  return (
    <section
      aria-label={title}
      className={`border rounded-2xl shadow-sm p-5 sm:p-6 transition-colors duration-200 ${containerClasses}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${iconBg}`}
            aria-hidden="true"
          >
            {isPositive ? (
              <TrendingUp className="w-5 h-5" />
            ) : isNegative ? (
              <TrendingDown className="w-5 h-5" />
            ) : (
              <Minus className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className={`font-display text-sm font-semibold ${labelColor}`}>
                {title}
              </h2>
              <span className="text-xs text-[#6E6056]">· {periodLabel}</span>
            </div>

            <p className="mt-1 text-xs font-mono tabular-nums flex flex-wrap items-center gap-x-1.5">
              <span className="font-semibold text-[#1F5E3F]">
                {formatCurrency(incomeTotal, true)} Einnahmen
              </span>
              <span className="font-semibold text-[#B43C2E]">
                − {formatCurrency(expenseTotal)} Ausgaben
              </span>
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className={`font-medium ${labelColor}`}>{statusText}</span>
              {secondaryLabel !== undefined && secondaryBalance !== undefined && (
                <>
                  <span className="text-[#C2B8A8]" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-[#6E6056] tabular-nums">
                    {secondaryLabel}:{' '}
                    <span
                      className={`font-mono font-semibold ${
                        secondaryBalance > 0
                          ? 'text-[#1F5E3F]'
                          : secondaryBalance < 0
                          ? 'text-[#B43C2E]'
                          : 'text-[#3D322C]'
                      }`}
                    >
                      {formatCurrency(secondaryBalance, true)}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="sm:text-right shrink-0 pl-13 sm:pl-0">
          <div
            className={`font-mono text-3xl sm:text-4xl font-bold tracking-tight tabular-nums ${amountColor}`}
          >
            {formatCurrency(balance, true)}
          </div>
        </div>
      </div>
    </section>
  );
};
