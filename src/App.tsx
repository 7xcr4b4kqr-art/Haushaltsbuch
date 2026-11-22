import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  HardDriveDownload,
  Home,
  LayoutDashboard,
  Menu,
  Plus,
  Repeat,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { AnnualOverview } from './components/AnnualOverview';
import { BackupAndProfiles } from './components/BackupAndProfiles';
import { MonthlyDashboard } from './components/MonthlyDashboard';
import { ProfileAvatar } from './components/ProfileAvatar';
import { ProfileSelectorScreen } from './components/ProfileSelectorScreen';
import { RecurringManager } from './components/RecurringManager';
import { TransactionModal } from './components/TransactionModal';
import {
  ActiveScope,
  BudgetDatabase,
  EntryType,
  RecurringItem,
  Transaction,
  ViewMode,
} from './types/budget';
import {
  computeAnnualOverview,
  computeMonthlySummary,
} from './utils/calculations';
import {
  createId,
  formatDateTimeDE,
  formatMonthYearDE,
  getCurrentYearMonth,
  getTodayISO,
  shiftYearMonth,
} from './utils/format';
import {
  DirectLoadResult,
  DirectSaveResult,
  PCLOUD_FILENAME,
  clearStoredDirectoryHandle,
  connectPcloudDirectory,
  getStoredDirectoryHandle,
  isFileSystemAccessSupported,
  loadDatabaseFromDirectory,
  saveDatabaseToDirectory,
  triggerClassicJsonDownload,
} from './utils/pcloudSync';
import {
  FIXED_INCOME_CATEGORIES,
  buildSampleDatabase,
  createInitialDatabase,
  loadDatabase,
  saveDatabase,
  saveLocalAvatar,
  validateAndNormalizeDatabase,
} from './utils/storage';

export default function App() {
  const [db, setDb] = useState<BudgetDatabase>(() => loadDatabase());
  // Always start on the profile selection screen
  const [activeScope, setActiveScope] = useState<ActiveScope | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>(() =>
    getCurrentYearMonth()
  );
  const [selectedYear, setSelectedYear] = useState<number>(() =>
    new Date().getFullYear()
  );

  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [txModalOpen, setTxModalOpen] = useState<boolean>(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  // File System Access API: Remembered pCloud directory handle
  const [pcloudDirHandle, setPcloudDirHandle] =
    useState<FileSystemDirectoryHandle | null>(null);

  // Sidebar pCloud export/import state
  const sidebarFileInputRef = useRef<HTMLInputElement>(null);
  const [sidebarExportMessage, setSidebarExportMessage] = useState<string | null>(
    null
  );
  const [sidebarImportPending, setSidebarImportPending] = useState<{
    db: BudgetDatabase;
    fileName: string;
  } | null>(null);
  const [sidebarImportError, setSidebarImportError] = useState<string | null>(
    null
  );

  useEffect(() => {
    void getStoredDirectoryHandle().then((handle) => {
      if (handle) {
        setPcloudDirHandle(handle);
      }
    });
  }, []);

  const commitDb = (updater: (prev: BudgetDatabase) => BudgetDatabase) => {
    setDb((prev) => {
      const next = updater(prev);
      return saveDatabase(next);
    });
  };

  useEffect(() => {
    if (!activeScope) return;
    const isValid =
      activeScope === 'joint' ||
      db.profiles.some((p) => p.id === activeScope);
    if (!isValid) {
      setActiveScope(db.profiles[0]?.id ?? 'profil_1');
    }
  }, [activeScope, db.profiles]);

  const handleSelectScope = (scope: ActiveScope) => {
    setActiveScope(scope);
    setMobileMenuOpen(false);
  };

  const handleGoToStartScreen = () => {
    setActiveScope(null);
    setViewMode('dashboard');
    setMobileMenuOpen(false);
  };

  const handleUpdateProfileName = (profileId: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    commitDb((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) =>
        p.id === profileId ? { ...p, name: trimmed } : p
      ),
    }));
  };

  const handleUpdateProfileAvatar = (profileId: string, avatarUrl?: string) => {
    saveLocalAvatar(profileId, avatarUrl);
    commitDb((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) => {
        if (p.id !== profileId) return p;
        if (avatarUrl) return { ...p, avatarUrl };
        const { avatarUrl: _removed, ...rest } = p;
        return rest;
      }),
    }));
  };

  // Connect or change pCloud folder (File System Access API)
  const handleConnectPcloudFolder = async (): Promise<{
    connected: boolean;
    message?: string;
  }> => {
    const result = await connectPcloudDirectory();
    if (result.status === 'connected') {
      setPcloudDirHandle(result.handle);
      return { connected: true };
    }
    if (result.status === 'unsupported') {
      return { connected: false, message: result.reason };
    }
    return { connected: false };
  };

  const handleDisconnectPcloudFolder = async () => {
    await clearStoredDirectoryHandle();
    setPcloudDirHandle(null);
  };

  // Save directly to remembered pCloud folder (or pick folder once, or download fallback)
  const handleDirectSaveToPcloud = async (): Promise<
    DirectSaveResult | { status: 'downloaded' }
  > => {
    let targetHandle = pcloudDirHandle;

    if (!targetHandle && isFileSystemAccessSupported()) {
      const connectRes = await connectPcloudDirectory();
      if (connectRes.status === 'connected') {
        targetHandle = connectRes.handle;
        setPcloudDirHandle(connectRes.handle);
      } else if (connectRes.status === 'unsupported') {
        triggerClassicJsonDownload(db);
        return { status: 'downloaded' };
      } else {
        return { status: 'no-folder' };
      }
    }

    if (targetHandle) {
      return await saveDatabaseToDirectory(targetHandle, db);
    }

    triggerClassicJsonDownload(db);
    return { status: 'downloaded' };
  };

  const handleDirectLoadFromPcloud = async (): Promise<
    DirectLoadResult | { status: 'no-folder' }
  > => {
    if (!pcloudDirHandle) {
      return { status: 'no-folder' };
    }
    return await loadDatabaseFromDirectory(pcloudDirHandle);
  };

  const handleSidebarSaveClick = async () => {
    setSidebarImportError(null);
    const res = await handleDirectSaveToPcloud();
    if (res.status === 'saved') {
      setSidebarExportMessage(`In „${res.folderName}“ gespeichert`);
      setTimeout(() => setSidebarExportMessage(null), 3000);
    } else if (res.status === 'downloaded') {
      setSidebarExportMessage('JSON heruntergeladen');
      setTimeout(() => setSidebarExportMessage(null), 2500);
    } else if (res.status === 'permission-denied') {
      setSidebarImportError('Schreibzugriff auf den verknüpften Ordner verweigert.');
    } else if (res.status === 'error') {
      setSidebarImportError(res.message);
    }
  };

  const handleSidebarLoadClick = async () => {
    setSidebarImportError(null);
    if (pcloudDirHandle) {
      const res = await handleDirectLoadFromPcloud();
      if (res.status === 'loaded') {
        setSidebarImportPending({
          db: res.db,
          fileName: `${res.folderName}/${res.fileName}`,
        });
        return;
      }
      if (res.status === 'not-found') {
        setSidebarImportError(
          `In „${res.folderName}“ fehlt noch „${PCLOUD_FILENAME}“.`
        );
        return;
      }
      if (res.status === 'invalid') {
        setSidebarImportError(`„${PCLOUD_FILENAME}“ ist kein gültiges Backup.`);
        return;
      }
      if (res.status === 'permission-denied') {
        setSidebarImportError('Lesezugriff auf den verknüpften Ordner verweigert.');
        return;
      }
      if (res.status === 'error') {
        setSidebarImportError(res.message);
        return;
      }
    }

    sidebarFileInputRef.current?.click();
  };

  const handleSidebarFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setSidebarImportError(null);
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const validated = validateAndNormalizeDatabase(parsed);
      if (!validated) {
        setSidebarImportError(
          'Ungültige Datei. Bitte eine JSON-Datei von VTO - Haushaltsübersicht wählen.'
        );
        return;
      }
      setSidebarImportPending({ db: validated, fileName: file.name });
    } catch {
      setSidebarImportError('Die JSON-Datei konnte nicht gelesen werden.');
    } finally {
      if (sidebarFileInputRef.current) {
        sidebarFileInputRef.current.value = '';
      }
    }
  };

  const handleSaveTransaction = (
    data: Omit<Transaction, 'id' | 'createdAt'>,
    existingId?: string
  ) => {
    commitDb((prev) => {
      if (existingId) {
        return {
          ...prev,
          transactions: prev.transactions.map((t) =>
            t.id === existingId ? { ...t, ...data } : t
          ),
        };
      }
      const nextTx: Transaction = {
        ...data,
        id: createId('tx'),
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        transactions: [nextTx, ...prev.transactions],
      };
    });

    const txYearMonth = data.date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(txYearMonth)) {
      setSelectedYearMonth(txYearMonth);
      setSelectedYear(Number(txYearMonth.slice(0, 4)));
    }
  };

  const handleDeleteTransaction = (id: string) => {
    commitDb((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((t) => t.id !== id),
    }));
  };

  const handleSaveRecurring = (
    data: Omit<RecurringItem, 'id' | 'createdAt'>,
    existingId?: string
  ) => {
    commitDb((prev) => {
      if (existingId) {
        return {
          ...prev,
          recurringItems: prev.recurringItems.map((r) =>
            r.id === existingId ? { ...r, ...data } : r
          ),
        };
      }
      const nextItem: RecurringItem = {
        ...data,
        id: createId('rec'),
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        recurringItems: [nextItem, ...prev.recurringItems],
      };
    });
  };

  const handleToggleRecurringActive = (id: string) => {
    commitDb((prev) => ({
      ...prev,
      recurringItems: prev.recurringItems.map((r) =>
        r.id === id ? { ...r, active: !r.active } : r
      ),
    }));
  };

  const handleDeleteRecurring = (id: string) => {
    commitDb((prev) => ({
      ...prev,
      recurringItems: prev.recurringItems.filter((r) => r.id !== id),
    }));
  };

  const handleAddCategory = (type: EntryType, name: string) => {
    if (type === 'income') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (
      FIXED_INCOME_CATEGORIES.some(
        (c) => c.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      return;
    }
    commitDb((prev) => {
      const existing = prev.categories[type];
      if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        categories: {
          ...prev.categories,
          [type]: [...existing, trimmed],
        },
      };
    });
  };

  const handleRemoveCategory = (type: EntryType, name: string) => {
    if (type === 'income') return;
    commitDb((prev) => ({
      ...prev,
      categories: {
        ...prev.categories,
        [type]: prev.categories[type].filter((c) => c !== name),
      },
    }));
  };

  const handleImportDatabase = (nextDb: BudgetDatabase) => {
    const saved = saveDatabase(nextDb);
    setDb(saved);
  };

  const handleLoadSampleData = () => {
    commitDb((prev) => buildSampleDatabase(prev.profiles));
  };

  const handleResetDatabase = () => {
    const saved = saveDatabase(createInitialDatabase());
    setDb(saved);
  };

  const effectiveScope: ActiveScope = activeScope ?? 'joint';
  const dashboardYear = Number(selectedYearMonth.slice(0, 4));

  const monthlySummary = useMemo(
    () => computeMonthlySummary(db, effectiveScope, selectedYearMonth),
    [db, effectiveScope, selectedYearMonth]
  );

  const annualOverview = useMemo(
    () => computeAnnualOverview(db, effectiveScope, selectedYear),
    [db, effectiveScope, selectedYear]
  );

  const dashboardYearOverview = useMemo(
    () =>
      dashboardYear === selectedYear
        ? annualOverview
        : computeAnnualOverview(db, effectiveScope, dashboardYear),
    [db, effectiveScope, dashboardYear, selectedYear, annualOverview]
  );

  const handleShiftSelectedMonth = (delta: number) => {
    const nextYm = shiftYearMonth(selectedYearMonth, delta);
    setSelectedYearMonth(nextYm);
    const nextYear = Number(nextYm.slice(0, 4));
    if (nextYear !== selectedYear) {
      setSelectedYear(nextYear);
    }
  };

  // Show initial profile selection directly at startup
  if (!activeScope) {
    return (
      <ProfileSelectorScreen
        db={db}
        pcloudFolderName={pcloudDirHandle?.name ?? null}
        onSelectScope={handleSelectScope}
        onImportDatabase={handleImportDatabase}
        onUpdateProfileName={handleUpdateProfileName}
        onUpdateProfileAvatar={handleUpdateProfileAvatar}
        onLoadSampleData={handleLoadSampleData}
        onConnectFolder={handleConnectPcloudFolder}
        onDirectSave={handleDirectSaveToPcloud}
        onDirectLoad={handleDirectLoadFromPcloud}
      />
    );
  }

  const activeProfileObj =
    activeScope === 'joint'
      ? null
      : db.profiles.find((p) => p.id === activeScope) ?? null;

  const activeScopeLabel =
    activeScope === 'joint'
      ? 'Gemeinsam'
      : activeProfileObj?.name ?? activeScope;

  const viewTitleMap: Record<ViewMode, string> = {
    dashboard: 'Monatsübersicht',
    recurring: 'Fixkosten & Einnahmen',
    annual: 'Jahresabschluss',
    backup: 'Sicherung & Einstellungen',
  };

  const navItems: Array<{
    id: ViewMode;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dashboard', label: 'Monatsübersicht', icon: LayoutDashboard },
    { id: 'recurring', label: 'Fixkosten & Einnahmen', icon: Repeat },
    { id: 'annual', label: 'Jahresabschluss', icon: BarChart3 },
    { id: 'backup', label: 'Sicherung & Einstellungen', icon: HardDriveDownload },
  ];

  const defaultTxProfileId =
    activeScope === 'joint' ? (db.profiles[0]?.id ?? 'profil_1') : activeScope;

  const defaultTxDate = getTodayISO().startsWith(selectedYearMonth)
    ? getTodayISO()
    : `${selectedYearMonth}-01`;

  const fsSupported = isFileSystemAccessSupported();

  return (
    <div className="min-h-screen bg-[#F5F2EB] text-[#3D322C] flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#2A221D]/40 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar (264px) */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-66 shrink-0 bg-[#FCFBF8] border-r border-[#E5DFD3] shadow-xs flex flex-col justify-between transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 space-y-6 overflow-y-auto">
          {/* Brand Wordmark */}
          <div className="flex items-center justify-between px-1">
            <span className="font-display text-base font-bold tracking-tight text-[#3D322C] whitespace-nowrap">
              VTO - Haushaltsübersicht
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-[#6E6056] hover:text-[#3D322C]"
              aria-label="Menü schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* First Menu Entry: Return to Start Screen */}
          <button
            type="button"
            onClick={handleGoToStartScreen}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-[#3D322C] bg-[#F5F2EB] border border-[#E5DFD3] rounded-xl hover:bg-[#EFEAE0] hover:border-[#D4CCB9] transition-colors whitespace-nowrap"
          >
            <Home className="w-4 h-4 shrink-0 text-[#6E6056]" />
            <span>Startmenü</span>
          </button>

          {/* Profile / Scope Switcher with Avatars */}
          <div>
            <div className="text-xs font-medium text-[#8C7D72] mb-2 px-2">
              Ansicht & Profil
            </div>
            <div className="space-y-1.5">
              {db.profiles.map((profile) => {
                const isActive = activeScope === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => handleSelectScope(profile.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-[#3D322C] text-[#FCFBF8] shadow-xs'
                        : 'text-[#4A3B32] hover:bg-[#EFEAE0] hover:text-[#3D322C]'
                    }`}
                  >
                    <ProfileAvatar
                      profile={profile}
                      size="sm"
                      inverted={isActive}
                    />
                    <span className="truncate">{profile.name}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => handleSelectScope('joint')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
                  activeScope === 'joint'
                    ? 'bg-[#3D322C] text-[#FCFBF8] shadow-xs'
                    : 'text-[#4A3B32] hover:bg-[#EFEAE0] hover:text-[#3D322C]'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    activeScope === 'joint'
                      ? 'bg-[#FCFBF8]/15 text-[#FCFBF8] ring-1 ring-[#FCFBF8]/25'
                      : 'bg-[#EFEAE0] text-[#3D322C] ring-1 ring-[#DDD5C5]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                </div>
                <span className="truncate">Gemeinsam</span>
              </button>
            </div>
          </div>

          {/* Primary Navigation */}
          <nav aria-label="Hauptnavigation">
            <div className="text-xs font-medium text-[#8C7D72] mb-2 px-2">
              Hauptmenü
            </div>
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = viewMode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setViewMode(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-xl transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#EFEAE0] text-[#3D322C]'
                        : 'text-[#6E6056] hover:bg-[#F5F2EB] hover:text-[#3D322C]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Prominent Backup Sync Buttons right in the Main Menu */}
          <div className="pt-3 border-t border-[#EAE4D7]">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-xs font-medium text-[#8C7D72]">
                Datensicherung
              </span>
              {fsSupported && (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await handleConnectPcloudFolder();
                    if (!res.connected && res.message) {
                      setSidebarImportError(res.message);
                    }
                  }}
                  className="text-[11px] text-[#6E6056] hover:text-[#3D322C] underline underline-offset-2"
                >
                  {pcloudDirHandle ? 'Ordner wechseln' : 'Ordner verknüpfen'}
                </button>
              )}
            </div>

            {pcloudDirHandle && (
              <div className="px-2 mb-2.5 flex items-center gap-1.5 text-[11px] text-[#4A3B32] truncate">
                <FolderOpen className="w-3 h-3 shrink-0 text-[#6E6056]" />
                <span className="truncate font-medium">
                  {pcloudDirHandle.name}
                </span>
              </div>
            )}

            <input
              ref={sidebarFileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleSidebarFileChange}
              className="hidden"
            />
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void handleSidebarSaveClick()}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium text-[#FCFBF8] bg-[#3D322C] rounded-xl hover:bg-[#2E2520] shadow-xs transition-colors whitespace-nowrap"
              >
                {sidebarExportMessage ? (
                  <>
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{sidebarExportMessage}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    Daten sichern
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => void handleSidebarLoadClick()}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium text-[#3D322C] bg-white border border-[#D4CCB9] rounded-xl hover:bg-[#F5F2EB] hover:border-[#3D322C] shadow-xs transition-colors whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                Daten laden
              </button>

              {pcloudDirHandle && (
                <button
                  type="button"
                  onClick={() => sidebarFileInputRef.current?.click()}
                  className="w-full text-center text-[11px] text-[#6E6056] hover:text-[#3D322C] underline underline-offset-2"
                >
                  Andere Datei manuell wählen
                </button>
              )}

              {sidebarImportError && (
                <p className="text-[11px] font-medium text-[#B43C2E] px-1">
                  {sidebarImportError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[#EAE4D7] text-[11px] text-[#8C7D72] tabular-nums">
          <span>Stand {formatDateTimeDE(db.updatedAt)}</span>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-30 bg-[#FCFBF8]/95 backdrop-blur-xs border-b border-[#E5DFD3] px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-xl text-[#6E6056] hover:text-[#3D322C] hover:bg-[#EFEAE0]"
              aria-label="Menü öffnen"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handleGoToStartScreen}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#6E6056] hover:text-[#3D322C] bg-[#F5F2EB] hover:bg-[#EFEAE0] border border-[#E5DFD3] rounded-lg transition-colors whitespace-nowrap shrink-0"
              aria-label="Zurück zum Startmenü"
              title="Zurück zum Startmenü"
            >
              <Home className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Startmenü</span>
            </button>

            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="hidden sm:inline text-[#D4CCB9]" aria-hidden="true">
                /
              </span>
              <span className="font-display font-semibold text-[#3D322C] truncate">
                {viewTitleMap[viewMode]}
              </span>
              <span className="text-[#D4CCB9]" aria-hidden="true">
                /
              </span>
              <div className="inline-flex items-center gap-2 min-w-0">
                {activeProfileObj ? (
                  <ProfileAvatar profile={activeProfileObj} size="xs" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#EFEAE0] text-[#3D322C] ring-1 ring-[#DDD5C5] flex items-center justify-center shrink-0">
                    <Users className="w-3 h-3" />
                  </div>
                )}
                <span className="text-[#4A3B32] font-medium truncate">
                  {activeScopeLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {viewMode === 'dashboard' && (
              <div className="hidden sm:flex items-center gap-1 border border-[#E5DFD3] rounded-xl p-0.5 bg-[#F5F2EB]">
                <button
                  type="button"
                  onClick={() => handleShiftSelectedMonth(-1)}
                  className="p-1.5 rounded-lg text-[#6E6056] hover:text-[#3D322C] hover:bg-[#FCFBF8] transition-colors"
                  aria-label="Vorheriger Monat"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2.5 text-xs font-medium text-[#3D322C] tabular-nums whitespace-nowrap min-w-28 text-center">
                  {formatMonthYearDE(selectedYearMonth)}
                </span>
                <button
                  type="button"
                  onClick={() => handleShiftSelectedMonth(1)}
                  className="p-1.5 rounded-lg text-[#6E6056] hover:text-[#3D322C] hover:bg-[#FCFBF8] transition-colors"
                  aria-label="Nächster Monat"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setEditingTx(null);
                setTxModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-[#FCFBF8] bg-[#3D322C] rounded-xl hover:bg-[#2E2520] shadow-xs transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Buchung erfassen
            </button>
          </div>
        </header>

        {/* Mobile Month Selector Bar */}
        {viewMode === 'dashboard' && (
          <div className="sm:hidden bg-[#FCFBF8] border-b border-[#E5DFD3] px-4 py-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleShiftSelectedMonth(-1)}
              className="p-1.5 rounded-lg border border-[#E5DFD3] text-[#6E6056]"
              aria-label="Vorheriger Monat"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3D322C] tabular-nums">
              <Calendar className="w-3.5 h-3.5 text-[#8C7D72]" />
              {formatMonthYearDE(selectedYearMonth)}
            </div>
            <button
              type="button"
              onClick={() => handleShiftSelectedMonth(1)}
              className="p-1.5 rounded-lg border border-[#E5DFD3] text-[#6E6056]"
              aria-label="Nächster Monat"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 w-full max-w-[1200px] mx-auto p-4 sm:p-6">
          {viewMode === 'dashboard' && (
            <MonthlyDashboard
              db={db}
              scope={effectiveScope}
              selectedYearMonth={selectedYearMonth}
              summary={monthlySummary}
              annualYear={dashboardYear}
              annualBalance={dashboardYearOverview.totalBalance}
              onQuickAddTransaction={(tx) => handleSaveTransaction(tx)}
              onEditTransaction={(tx) => {
                setEditingTx(tx);
                setTxModalOpen(true);
              }}
              onDeleteTransaction={handleDeleteTransaction}
              onNavigateToRecurring={() => setViewMode('recurring')}
              onOpenNewModal={() => {
                setEditingTx(null);
                setTxModalOpen(true);
              }}
              onLoadSampleData={handleLoadSampleData}
            />
          )}

          {viewMode === 'recurring' && (
            <RecurringManager
              db={db}
              scope={effectiveScope}
              onSaveRecurring={handleSaveRecurring}
              onToggleActive={handleToggleRecurringActive}
              onDeleteRecurring={handleDeleteRecurring}
            />
          )}

          {viewMode === 'annual' && (
            <AnnualOverview
              db={db}
              scope={effectiveScope}
              year={selectedYear}
              data={annualOverview}
              onChangeYear={setSelectedYear}
              onOpenMonth={(ym) => {
                setSelectedYearMonth(ym);
                setViewMode('dashboard');
              }}
            />
          )}

          {viewMode === 'backup' && (
            <BackupAndProfiles
              db={db}
              pcloudFolderName={pcloudDirHandle?.name ?? null}
              onConnectFolder={handleConnectPcloudFolder}
              onDisconnectFolder={handleDisconnectPcloudFolder}
              onDirectSave={handleDirectSaveToPcloud}
              onDirectLoad={handleDirectLoadFromPcloud}
              onUpdateProfileName={handleUpdateProfileName}
              onUpdateProfileAvatar={handleUpdateProfileAvatar}
              onAddCategory={handleAddCategory}
              onRemoveCategory={handleRemoveCategory}
              onImportDatabase={handleImportDatabase}
              onLoadSampleData={handleLoadSampleData}
              onResetDatabase={handleResetDatabase}
            />
          )}
        </main>
      </div>

      {/* Add / Edit Transaction Modal */}
      <TransactionModal
        isOpen={txModalOpen}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
        }}
        profiles={db.profiles}
        categories={db.categories}
        defaultProfileId={defaultTxProfileId}
        defaultDate={defaultTxDate}
        editingTransaction={editingTx}
        onSave={handleSaveTransaction}
        onDelete={handleDeleteTransaction}
        onAddCategory={handleAddCategory}
      />

      {/* Confirmation Modal for Sidebar JSON Import */}
      {sidebarImportPending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2A221D]/45 backdrop-blur-[1px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-confirm-title"
        >
          <div className="w-full max-w-md bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EAE4D7]">
              <h2
                id="import-confirm-title"
                className="font-display text-base font-semibold text-[#3D322C]"
              >
                Daten laden
              </h2>
              <button
                type="button"
                onClick={() => setSidebarImportPending(null)}
                className="p-1.5 rounded-lg text-[#8C7D72] hover:text-[#3D322C] hover:bg-[#EFEAE0]"
                aria-label="Dialog schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-[#6E6056]">
                Möchten Sie den lokalen Browser-Stand durch diese Datei ersetzen?
              </p>
              <div className="p-4 bg-[#F5F2EB] border border-[#E5DFD3] rounded-xl text-xs text-[#4A3B32] space-y-1.5 tabular-nums">
                <div className="font-semibold text-[#3D322C]">
                  {sidebarImportPending.fileName}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span className="text-[#6E6056]">Profile:</span>
                  {sidebarImportPending.db.profiles.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#FCFBF8] border border-[#E5DFD3] text-[#3D322C] font-medium"
                    >
                      <ProfileAvatar profile={p} size="xs" />
                      <span>{p.name}</span>
                    </span>
                  ))}
                </div>
                <div>
                  Umfang: {sidebarImportPending.db.transactions.length}{' '}
                  Buchungen · {sidebarImportPending.db.recurringItems.length}{' '}
                  Fixposten
                </div>
                <div>
                  Stand: {formatDateTimeDE(sidebarImportPending.db.updatedAt)}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSidebarImportPending(null)}
                  className="px-4 py-2 text-sm font-medium text-[#6E6056] hover:text-[#3D322C] rounded-xl hover:bg-[#EFEAE0] transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleImportDatabase(sidebarImportPending.db);
                    setSidebarImportPending(null);
                    setMobileMenuOpen(false);
                  }}
                  className="px-4 py-2 text-sm font-medium text-[#FCFBF8] bg-[#3D322C] rounded-xl hover:bg-[#2E2520] transition-colors"
                >
                  Datenbestand übernehmen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
