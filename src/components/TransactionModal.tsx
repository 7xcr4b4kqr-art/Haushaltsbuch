import React, { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import {
  CategoryConfig,
  EntryType,
  Transaction,
  UserProfile,
} from '../types/budget';
import { getTodayISO } from '../utils/format';
import { FIXED_INCOME_CATEGORIES } from '../utils/storage';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: UserProfile[];
  categories: CategoryConfig;
  defaultProfileId: string;
  defaultDate?: string;
  editingTransaction?: Transaction | null;
  onSave: (data: Omit<Transaction, 'id' | 'createdAt'>, existingId?: string) => void;
  onDelete?: (id: string) => void;
  onAddCategory: (type: EntryType, categoryName: string) => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  profiles,
  categories,
  defaultProfileId,
  defaultDate,
  editingTransaction,
  onSave,
  onDelete,
  onAddCategory,
}) => {
  const [type, setType] = useState<EntryType>('expense');
  const [profileId, setProfileId] = useState<string>(defaultProfileId);
  const [amountRaw, setAmountRaw] = useState<string>('');
  const [date, setDate] = useState<string>(defaultDate ?? getTodayISO());
  const [category, setCategory] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [newCatName, setNewCatName] = useState<string>('');
  const [showNewCat, setShowNewCat] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setConfirmDelete(false);
    setShowNewCat(false);
    setNewCatName('');

    if (editingTransaction) {
      setType(editingTransaction.type);
      setProfileId(editingTransaction.profileId);
      setAmountRaw(editingTransaction.amount.toFixed(2).replace('.', ','));
      setDate(editingTransaction.date);
      if (editingTransaction.type === 'income') {
        const incomeList = FIXED_INCOME_CATEGORIES as readonly string[];
        setCategory(
          incomeList.includes(editingTransaction.category)
            ? editingTransaction.category
            : FIXED_INCOME_CATEGORIES[0]
        );
      } else {
        setCategory(
          categories.expense.includes(editingTransaction.category)
            ? editingTransaction.category
            : categories.expense[0] ?? 'Essen/Trinken'
        );
      }
      setNote(editingTransaction.note);
    } else {
      setType('expense');
      setProfileId(defaultProfileId);
      setAmountRaw('');
      setDate(defaultDate ?? getTodayISO());
      setCategory(categories.expense[0] ?? 'Essen/Trinken');
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingTransaction, defaultProfileId, defaultDate]);

  if (!isOpen) return null;

  const availableCategories: string[] =
    type === 'expense' ? categories.expense : [...FIXED_INCOME_CATEGORIES];

  const handleTypeChange = (nextType: EntryType) => {
    setType(nextType);
    setShowNewCat(false);
    setNewCatName('');
    const list: string[] =
      nextType === 'expense' ? categories.expense : [...FIXED_INCOME_CATEGORIES];
    if (!list.includes(category)) {
      setCategory(list[0] ?? '');
    }
  };

  const handleAddNewCategory = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    onAddCategory(type, trimmed);
    setCategory(trimmed);
    setNewCatName('');
    setShowNewCat(false);
  };

  const handleAmountChange = (raw: string) => {
    setAmountRaw(raw);
    if (raw.trim().startsWith('+') && type !== 'income') {
      handleTypeChange('income');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = amountRaw.trim().replace(/[€\s]/g, '');
    const hasPlusPrefix = cleaned.startsWith('+');
    const effectiveType: EntryType = hasPlusPrefix ? 'income' : type;
    const parsedAmount = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Bitte einen gültigen Betrag größer als 0,00 € eingeben.');
      return;
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Bitte ein gültiges Datum auswählen.');
      return;
    }
    if (!category.trim()) {
      setError('Bitte eine Kategorie auswählen.');
      return;
    }

    const finalCategory =
      effectiveType === 'income' &&
      !(FIXED_INCOME_CATEGORIES as readonly string[]).includes(category.trim())
        ? FIXED_INCOME_CATEGORIES[0]
        : category.trim();

    onSave(
      {
        profileId,
        type: effectiveType,
        amount: Math.round(parsedAmount * 100) / 100,
        date,
        category: finalCategory,
        note: note.trim(),
      },
      editingTransaction?.id
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2A221D]/45 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
    >
      <div className="w-full max-w-md bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EAE4D7]">
          <h2
            id="tx-modal-title"
            className="font-display text-base font-semibold text-[#3D322C]"
          >
            {editingTransaction ? 'Buchung bearbeiten' : 'Neue Buchung erfassen'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8C7D72] hover:text-[#3D322C] hover:bg-[#EFEAE0] transition-colors"
            aria-label="Dialog schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <span className="block text-xs font-medium text-[#6E6056] mb-1.5">
              Buchungstyp
            </span>
            <div
              role="group"
              aria-label="Buchungstyp"
              className="grid grid-cols-2 gap-1 p-1 bg-[#EFEAE0] rounded-xl"
            >
              <button
                type="button"
                aria-pressed={type === 'expense'}
                onClick={() => handleTypeChange('expense')}
                className={`py-2 px-3 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  type === 'expense'
                    ? 'bg-[#FCFBF8] text-[#3D322C] shadow-xs'
                    : 'text-[#6E6056] hover:text-[#3D322C]'
                }`}
              >
                Ausgabe
              </button>
              <button
                type="button"
                aria-pressed={type === 'income'}
                onClick={() => handleTypeChange('income')}
                className={`py-2 px-3 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  type === 'income'
                    ? 'bg-[#FCFBF8] text-[#2A6F4E] shadow-xs'
                    : 'text-[#6E6056] hover:text-[#3D322C]'
                }`}
              >
                Einnahme
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#6E6056] mb-1.5">
                Betrag (€)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="z. B. 42,50 oder +1500"
                value={amountRaw}
                onChange={(e) => handleAmountChange(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6E6056] mb-1.5">
                Datum
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm tabular-nums bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#6E6056] mb-1.5">
                Profil
              </label>
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#6E6056]">
                  Kategorie
                </label>
                {type === 'expense' && (
                  <button
                    type="button"
                    onClick={() => setShowNewCat((prev) => !prev)}
                    className="text-xs text-[#6E6056] hover:text-[#3D322C] underline underline-offset-2"
                  >
                    {showNewCat ? 'Abbrechen' : '+ Neu'}
                  </button>
                )}
              </div>
              {showNewCat && type === 'expense' ? (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Kategorie..."
                    className="w-full px-2.5 py-2 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewCategory}
                    className="px-3 py-2 text-xs font-medium bg-[#3D322C] text-[#FCFBF8] rounded-xl hover:bg-[#2E2520] whitespace-nowrap"
                  >
                    OK
                  </button>
                </div>
              ) : (
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
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6E6056] mb-1.5">
              Notiz / Beschreibung
            </label>
            <input
              type="text"
              placeholder={
                type === 'income'
                  ? 'z. B. Gehalt, Steuerrückerstattung, Dividende...'
                  : 'z. B. Abendessen, Hotelbuchung, Einkauf...'
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
            />
          </div>

          {error && <p className="text-xs font-medium text-[#B43C2E]">{error}</p>}

          <div className="pt-2 flex items-center justify-between gap-3 border-t border-[#EAE4D7]">
            {editingTransaction && onDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(editingTransaction.id);
                      onClose();
                    }}
                    className="px-3 py-2 text-xs font-medium text-white bg-[#B43C2E] rounded-xl hover:bg-[#993226] transition-colors whitespace-nowrap"
                  >
                    Endgültig löschen
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-2 text-xs text-[#6E6056] hover:text-[#3D322C]"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#B43C2E] hover:bg-[#B43C2E]/10 rounded-xl transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Löschen
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[#6E6056] hover:text-[#3D322C] rounded-xl hover:bg-[#EFEAE0] transition-colors whitespace-nowrap"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-[#FCFBF8] bg-[#3D322C] rounded-xl hover:bg-[#2E2520] transition-colors whitespace-nowrap"
              >
                Speichern
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
