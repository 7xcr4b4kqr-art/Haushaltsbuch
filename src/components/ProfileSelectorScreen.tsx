import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Pencil,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { ActiveScope, BudgetDatabase } from '../types/budget';
import { resizeAvatarImage } from '../utils/avatar';
import { formatDateTimeDE } from '../utils/format';
import {
  DirectLoadResult,
  DirectSaveResult,
  PCLOUD_FILENAME,
  isFileSystemAccessSupported,
} from '../utils/pcloudSync';
import { validateAndNormalizeDatabase } from '../utils/storage';
import {
  MoneyControlAffectedProfile,
  MoneyControlImportError,
  MoneyControlParseResult,
  decodeCsvBytes,
  parseMoneyControlCsv,
} from '../utils/moneyControlImport';
import { MoneyControlImportDialog } from './MoneyControlImportDialog';
import { ProfileAvatar } from './ProfileAvatar';

const IMPORT_NOT_PERSISTED_MESSAGE =
  'Der Import konnte nicht im Browser gespeichert werden (Speicher voll oder privater Modus). Ihre bisherigen Daten sind unverändert.';

export type MoneyControlImportOutcome =
  | { status: 'not-persisted' }
  | { status: 'local-only' }
  | { status: 'synced'; folderName: string }
  | { status: 'sync-failed'; message: string };

interface ProfileSelectorScreenProps {
  db: BudgetDatabase;
  pcloudFolderName: string | null;
  onSelectScope: (scope: ActiveScope) => void;
  /** Liefert false, wenn der Bestand nicht im Browser gespeichert werden konnte. */
  onImportDatabase: (nextDb: BudgetDatabase) => Promise<boolean>;
  onImportMoneyControl: (
    nextDb: BudgetDatabase
  ) => Promise<MoneyControlImportOutcome>;
  onUpdateProfileName: (profileId: string, nextName: string) => void;
  onUpdateProfileAvatar: (profileId: string, avatarUrl?: string) => void;
  onLoadSampleData: () => void;
  onConnectFolder: () => Promise<{ connected: boolean; message?: string }>;
  onDirectSave: () => Promise<DirectSaveResult | { status: 'downloaded' }>;
  onDirectLoad: () => Promise<DirectLoadResult | { status: 'no-folder' }>;
}

export const ProfileSelectorScreen: React.FC<ProfileSelectorScreenProps> = ({
  db,
  pcloudFolderName,
  onSelectScope,
  onImportDatabase,
  onImportMoneyControl,
  onUpdateProfileName,
  onUpdateProfileAvatar,
  onLoadSampleData,
  onConnectFolder,
  onDirectSave,
  onDirectLoad,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState<boolean>(false);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvPending, setCsvPending] = useState<{
    fileName: string;
    parsed: MoneyControlParseResult;
  } | null>(null);
  const [csvBusy, setCsvBusy] = useState<boolean>(false);
  const [csvDialogError, setCsvDialogError] = useState<string | null>(null);

  const hasAnyData =
    db.transactions.length > 0 || db.recurringItems.length > 0;
  const fsSupported = isFileSystemAccessSupported();

  const getProfileStats = (profileId: string) => {
    const txCount = db.transactions.filter(
      (t) => t.profileId === profileId
    ).length;
    const recCount = db.recurringItems.filter(
      (r) => r.profileId === profileId
    ).length;
    return { txCount, recCount };
  };

  const handleSaveClick = async () => {
    setImportError(null);
    setStatusMessage(null);
    const result = await onDirectSave();
    if (result.status === 'saved') {
      setExportDone(true);
      setStatusMessage(
        `Direkt in „${result.folderName}/${result.fileName}“ gespeichert.`
      );
      setTimeout(() => setExportDone(false), 2500);
    } else if (result.status === 'downloaded') {
      setExportDone(true);
      setTimeout(() => setExportDone(false), 2500);
    } else if (result.status === 'permission-denied') {
      setImportError('Schreibberechtigung für den verknüpften Ordner wurde verweigert.');
    } else if (result.status === 'error') {
      setImportError(result.message);
    }
  };

  const handleLoadClick = async () => {
    setImportError(null);
    setStatusMessage(null);

    if (pcloudFolderName) {
      const res = await onDirectLoad();
      if (res.status === 'loaded') {
        const persisted = await onImportDatabase(res.db);
        if (!persisted) {
          setImportError(IMPORT_NOT_PERSISTED_MESSAGE);
          return;
        }
        onSelectScope('joint');
        return;
      }
      if (res.status === 'not-found') {
        setImportError(
          `Im Ordner „${res.folderName}“ liegt noch keine Datei „${PCLOUD_FILENAME}“.`
        );
        return;
      }
      if (res.status === 'invalid') {
        setImportError(
          `Die Datei „${PCLOUD_FILENAME}“ ist kein gültiges VTO-Backup.`
        );
        return;
      }
      if (res.status === 'permission-denied') {
        setImportError('Leseberechtigung für den verknüpften Ordner wurde verweigert.');
        return;
      }
      if (res.status === 'error') {
        setImportError(res.message);
        return;
      }
    }

    fileInputRef.current?.click();
  };

  const handleConnectFolderClick = async () => {
    setImportError(null);
    setStatusMessage(null);
    const res = await onConnectFolder();
    if (!res.connected && res.message) {
      setImportError(res.message);
    } else if (res.connected) {
      setStatusMessage('Ordner verknüpft.');
    }
  };

  const handleCsvClick = () => {
    setImportError(null);
    setStatusMessage(null);
    csvInputRef.current?.click();
  };

  const handleCsvSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (csvInputRef.current) csvInputRef.current.value = '';
    if (!file) return;
    setImportError(null);
    setStatusMessage(null);
    try {
      const text = decodeCsvBytes(await file.arrayBuffer());
      const parsed = parseMoneyControlCsv(text);
      setCsvDialogError(null);
      setCsvPending({ fileName: file.name, parsed });
    } catch (err) {
      setImportError(
        err instanceof MoneyControlImportError
          ? err.message
          : 'Die CSV-Datei konnte nicht gelesen werden. Bitte prüfen Sie, ob es ein Money-Control-Export ist.'
      );
    }
  };

  const handleCsvConfirm = async (
    nextDb: BudgetDatabase,
    affected: MoneyControlAffectedProfile[]
  ) => {
    setCsvBusy(true);
    setCsvDialogError(null);
    try {
      const outcome = await onImportMoneyControl(nextDb);
      if (outcome.status === 'not-persisted') {
        setCsvDialogError(IMPORT_NOT_PERSISTED_MESSAGE);
        return;
      }
      const total = affected.reduce((sum, a) => sum + a.newTransactions, 0);
      const perProfile = affected
        .map((a) => `${a.profileName}: ${a.newTransactions.toLocaleString('de-DE')}`)
        .join(', ');
      let msg = `${total.toLocaleString('de-DE')} Buchungen importiert (${perProfile}).`;
      if (outcome.status === 'synced') {
        msg += ` Im Ordner „${outcome.folderName}“ gesichert.`;
      }
      setCsvPending(null);
      setStatusMessage(msg);
      if (outcome.status === 'sync-failed') {
        setImportError(
          `Lokal gespeichert, aber nicht im verknüpften Ordner: ${outcome.message} Bitte „Daten sichern“ nutzen.`
        );
      }
    } catch {
      setCsvDialogError(
        'Beim Import ist ein unerwarteter Fehler aufgetreten. Ihre bisherigen Daten sind unverändert.'
      );
    } finally {
      setCsvBusy(false);
    }
  };

  const handleStartRename = (profileId: string, currentName: string) => {
    setEditingProfileId(profileId);
    setDraftName(currentName);
  };

  const handleCommitRename = (profileId: string) => {
    const trimmed = draftName.trim();
    if (trimmed) {
      onUpdateProfileName(profileId, trimmed);
    }
    setEditingProfileId(null);
    setDraftName('');
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setImportError(null);
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const validated = validateAndNormalizeDatabase(parsed);
      if (!validated) {
        setImportError(
          'Die ausgewählte Datei entspricht nicht dem Format von VTO - Haushaltsübersicht.'
        );
        return;
      }
      const persisted = await onImportDatabase(validated);
      if (!persisted) {
        setImportError(IMPORT_NOT_PERSISTED_MESSAGE);
        return;
      }
      onSelectScope('joint');
    } catch {
      setImportError('Die JSON-Datei konnte nicht gelesen werden.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAvatarSelected = async (
    profileId: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setAvatarError(null);
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await resizeAvatarImage(file, 160);
      onUpdateProfileAvatar(profileId, dataUrl);
    } catch (err) {
      setAvatarError(
        err instanceof Error
          ? err.message
          : 'Das Profilbild konnte nicht verarbeitet werden.'
      );
    } finally {
      const inputEl = avatarInputRefs.current[profileId];
      if (inputEl) inputEl.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F2EB] text-[#3D322C] flex flex-col justify-between px-6 py-10">
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between gap-4">
        <span className="font-display text-lg font-bold tracking-tight text-[#3D322C] whitespace-nowrap">
          VTO - Haushaltsübersicht
        </span>
        <span className="text-xs text-[#6E6056] tabular-nums">
          Lokaler Speicher · Stand {formatDateTimeDE(db.updatedAt)}
        </span>
      </header>

      <main className="max-w-4xl w-full mx-auto my-auto py-12">
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#3D322C] [text-wrap:balance]">
            VTO - Haushaltsübersicht
          </h1>
          <p className="mt-3 text-base text-[#6E6056] max-w-2xl leading-relaxed">
            Wählen Sie ein persönliches Profil oder öffnen Sie direkt die
            gemeinsame Gesamtansicht. Profilnamen und Profilbilder lassen sich
            direkt auf den Karten anpassen; jedes Profil führt getrennte
            Einnahmen, Ausgaben und Fixkosten.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {db.profiles.map((profile) => {
            const stats = getProfileStats(profile.id);
            const isEditing = editingProfileId === profile.id;
            return (
              <div
                key={profile.id}
                className="group bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm hover:shadow-md hover:border-[#3D322C]/60 transition-all duration-150 flex flex-col justify-between overflow-hidden"
              >
                {isEditing ? (
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div className="flex items-start justify-between mb-6">
                      <ProfileAvatar profile={profile} size="lg" />
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleCommitRename(profile.id);
                      }}
                      className="space-y-2.5"
                    >
                      <label className="block text-xs font-medium text-[#6E6056]">
                        Profilname
                      </label>
                      <input
                        type="text"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        maxLength={32}
                        autoFocus
                        className="w-full px-3 py-1.5 text-sm font-medium bg-white border border-[#3D322C] rounded-xl text-[#3D322C] focus:outline-none"
                        placeholder="Name eingeben..."
                      />
                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#FCFBF8] bg-[#3D322C] rounded-lg hover:bg-[#2E2520] transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Speichern
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProfileId(null);
                            setDraftName('');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#6E6056] hover:text-[#3D322C] rounded-lg hover:bg-[#EFEAE0] transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Abbrechen
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectScope(profile.id)}
                    className="text-left p-6 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3D322C]"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <ProfileAvatar profile={profile} size="lg" />
                      <ArrowRight className="w-4 h-4 text-[#8C7D72] group-hover:text-[#3D322C] group-hover:translate-x-0.5 transition-all mt-1" />
                    </div>
                    <div className="font-display text-xl font-semibold text-[#3D322C] truncate">
                      {profile.name}
                    </div>
                    <div className="mt-1.5 text-xs text-[#6E6056] tabular-nums">
                      {stats.txCount} Buchungen · {stats.recCount} Fixposten
                    </div>
                  </button>
                )}

                {/* Name & Avatar Strip */}
                <div className="px-6 py-3 bg-[#F5F2EB]/65 border-t border-[#EAE4D7] flex items-center justify-between gap-2">
                  <input
                    ref={(el) => {
                      avatarInputRefs.current[profile.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleAvatarSelected(profile.id, e)}
                    className="hidden"
                  />
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => avatarInputRefs.current[profile.id]?.click()}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6E6056] hover:text-[#3D322C] transition-colors whitespace-nowrap"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {profile.avatarUrl ? 'Bild ändern' : 'Bild wählen'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartRename(profile.id, profile.name)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#6E6056] hover:text-[#3D322C] transition-colors whitespace-nowrap"
                    >
                      <Pencil className="w-3 h-3" />
                      Name ändern
                    </button>
                  </div>

                  {profile.avatarUrl && (
                    <button
                      type="button"
                      onClick={() => onUpdateProfileAvatar(profile.id, undefined)}
                      className="inline-flex items-center gap-1 text-xs text-[#8C7D72] hover:text-[#B43C2E] transition-colors"
                      aria-label={`Profilbild von ${profile.name} entfernen`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => onSelectScope('joint')}
            className="group text-left bg-[#3D322C] border border-[#3D322C] rounded-2xl shadow-sm hover:shadow-md hover:bg-[#2E2520] p-6 text-[#FCFBF8] transition-all duration-150 flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D322C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F2EB]"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-[#FCFBF8]/12 text-[#FCFBF8] flex items-center justify-center ring-1 ring-[#FCFBF8]/20">
                <Users className="w-6 h-6" />
              </div>
              <ArrowRight className="w-4 h-4 text-[#C6BCAE] group-hover:text-[#FCFBF8] group-hover:translate-x-0.5 transition-all mt-1" />
            </div>
            <div>
              <div className="font-display text-xl font-semibold">Gemeinsam</div>
              <div className="mt-1.5 text-xs text-[#D8CFC2] tabular-nums">
                {db.transactions.length} Buchungen · {db.recurringItems.length}{' '}
                Fixposten
              </div>
            </div>
          </button>
        </div>

        {avatarError && (
          <p className="mt-3 text-sm font-medium text-[#B43C2E]">{avatarError}</p>
        )}

        <div className="mt-8 pt-6 border-t border-[#E0D9CA] space-y-3">
          {pcloudFolderName && (
            <div className="text-xs text-[#6E6056]">
              Verknüpfter Ordner:{' '}
              <span className="font-semibold text-[#3D322C]">
                {pcloudFolderName}
              </span>{' '}
              · Datei: <span className="font-mono">{PCLOUD_FILENAME}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => void handleLoadClick()}
                className="inline-flex items-center gap-2 text-sm font-medium text-[#3D322C] py-2.5 px-4 rounded-xl border border-[#D4CCB9] bg-[#FCFBF8] shadow-xs hover:border-[#3D322C] transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="w-4 h-4" />
                Daten laden
              </button>

              <button
                type="button"
                onClick={() => void handleSaveClick()}
                className="inline-flex items-center gap-2 text-sm font-medium text-[#6E6056] hover:text-[#3D322C] py-2.5 px-4 rounded-xl border border-[#E5DFD3] bg-[#FCFBF8] shadow-xs hover:border-[#C9BFAE] transition-colors whitespace-nowrap shrink-0"
              >
                {exportDone ? (
                  <>
                    <Check className="w-4 h-4 text-[#2A6F4E]" />
                    Gesichert
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Daten sichern
                  </>
                )}
              </button>

              {fsSupported && (
                <button
                  type="button"
                  onClick={() => void handleConnectFolderClick()}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6E6056] hover:text-[#3D322C] py-2 px-2 transition-colors whitespace-nowrap shrink-0"
                >
                  <FolderOpen className="w-4 h-4" />
                  {pcloudFolderName ? 'Ordner wechseln' : 'Ordner verknüpfen'}
                </button>
              )}

              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void handleCsvSelected(e)}
                className="hidden"
              />
              <button
                type="button"
                onClick={handleCsvClick}
                className="inline-flex items-center gap-2 text-sm font-medium text-[#FCFBF8] py-2.5 px-4 rounded-xl border border-[#2A6F4E] bg-[#2A6F4E] shadow-xs hover:bg-[#235C41] hover:border-[#235C41] transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Money Control CSV importieren
              </button>

              {!hasAnyData && (
                <button
                  type="button"
                  onClick={() => {
                    onLoadSampleData();
                    onSelectScope(db.profiles[0]?.id ?? 'profil_1');
                  }}
                  className="text-sm font-medium text-[#6E6056] hover:text-[#3D322C] underline underline-offset-4 py-2 px-1 transition-colors whitespace-nowrap shrink-0"
                >
                  Mit Beispieldaten starten
                </button>
              )}
            </div>
          </div>

          {statusMessage && (
            <p className="text-xs font-medium text-[#2A6F4E]">{statusMessage}</p>
          )}
          {importError && (
            <p className="text-xs font-medium text-[#B43C2E]">{importError}</p>
          )}
        </div>
      </main>

      {csvPending && (
        <MoneyControlImportDialog
          db={db}
          fileName={csvPending.fileName}
          parsed={csvPending.parsed}
          busy={csvBusy}
          error={csvDialogError}
          onCancel={() => {
            if (!csvBusy) setCsvPending(null);
          }}
          onConfirm={(nextDb, affected) => void handleCsvConfirm(nextDb, affected)}
        />
      )}

      <footer className="max-w-4xl w-full mx-auto text-xs text-[#6E6056]">
        Alle Daten, Profilnamen und Profilbilder bleiben lokal im Browser
        gespeichert und lassen sich direkt über Ihren verknüpften Ordner (Chrome
        Mac & Windows) oder als JSON-Datei (iPad/Safari) sichern und laden.
      </footer>
    </div>
  );
};
