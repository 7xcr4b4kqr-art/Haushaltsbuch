import React, { useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  FileJson,
  FolderOpen,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Unlink,
  Upload,
  X,
} from 'lucide-react';
import { BudgetDatabase, EntryType } from '../types/budget';
import { resizeAvatarImage } from '../utils/avatar';
import { formatDateTimeDE } from '../utils/format';
import {
  DirectLoadResult,
  DirectSaveResult,
  PCLOUD_FILENAME,
  isFileSystemAccessSupported,
  triggerClassicJsonDownload,
} from '../utils/pcloudSync';
import {
  FIXED_EXPENSE_CATEGORIES,
  getIncomeCategories,
  validateAndNormalizeDatabase,
} from '../utils/storage';
import { ProfileAvatar } from './ProfileAvatar';

interface BackupAndProfilesProps {
  db: BudgetDatabase;
  pcloudFolderName: string | null;
  onConnectFolder: () => Promise<{ connected: boolean; message?: string }>;
  onDisconnectFolder: () => Promise<void>;
  onDirectSave: () => Promise<DirectSaveResult | { status: 'downloaded' }>;
  onDirectLoad: () => Promise<DirectLoadResult | { status: 'no-folder' }>;
  onUpdateProfileName: (profileId: string, nextName: string) => void;
  onUpdateProfileAvatar: (profileId: string, avatarUrl?: string) => void;
  onAddCategory: (type: EntryType, name: string) => void;
  onRemoveCategory: (type: EntryType, name: string) => void;
  onImportDatabase: (nextDb: BudgetDatabase) => void;
  onLoadSampleData: () => void;
  onResetDatabase: () => void;
}

export const BackupAndProfiles: React.FC<BackupAndProfilesProps> = ({
  db,
  pcloudFolderName,
  onConnectFolder,
  onDisconnectFolder,
  onDirectSave,
  onDirectLoad,
  onUpdateProfileName,
  onUpdateProfileAvatar,
  onAddCategory,
  onRemoveCategory,
  onImportDatabase,
  onLoadSampleData,
  onResetDatabase,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [draftProfileName, setDraftProfileName] = useState<string>('');
  const [newExpenseCat, setNewExpenseCat] = useState<string>('');
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [pendingImportDb, setPendingImportDb] = useState<BudgetDatabase | null>(
    null
  );
  const [importFileName, setImportFileName] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const [folderFeedback, setFolderFeedback] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);

  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [confirmSample, setConfirmSample] = useState<boolean>(false);

  const fsSupported = isFileSystemAccessSupported();

  const handleConnectClick = async () => {
    setFolderError(null);
    setFolderFeedback(null);
    const res = await onConnectFolder();
    if (res.connected) {
      setFolderFeedback(
        'Ordner dauerhaft verknüpft. Zukünftige Speicherungen aktualisieren die Datei dort direkt.'
      );
    } else if (res.message) {
      setFolderError(res.message);
    }
  };

  const handleDirectSaveClick = async () => {
    setFolderError(null);
    setExportSuccess(null);
    const res = await onDirectSave();
    if (res.status === 'saved') {
      setExportSuccess(
        `Direkt in „${res.folderName}/${res.fileName}“ gespeichert.`
      );
      setTimeout(() => setExportSuccess(null), 4000);
    } else if (res.status === 'downloaded') {
      setExportSuccess('JSON-Datei heruntergeladen.');
      setTimeout(() => setExportSuccess(null), 3500);
    } else if (res.status === 'permission-denied') {
      setFolderError(
        'Schreibberechtigung für den verknüpften Ordner wurde verweigert.'
      );
    } else if (res.status === 'error') {
      setFolderError(res.message);
    }
  };

  const handleDirectLoadClick = async () => {
    setImportError(null);
    setImportSuccess(null);
    setPendingImportDb(null);

    const res = await onDirectLoad();
    if (res.status === 'loaded') {
      setImportFileName(`${res.folderName}/${res.fileName}`);
      setPendingImportDb(res.db);
    } else if (res.status === 'not-found') {
      setImportError(
        `Im Ordner „${res.folderName}“ wurde noch keine Datei „${PCLOUD_FILENAME}“ gefunden.`
      );
    } else if (res.status === 'invalid') {
      setImportError(
        `Die Datei „${PCLOUD_FILENAME}“ entspricht nicht dem Format von VTO - Haushaltsübersicht.`
      );
    } else if (res.status === 'permission-denied') {
      setImportError(
        'Leseberechtigung für den verknüpften Ordner wurde verweigert.'
      );
    } else if (res.status === 'error') {
      setImportError(res.message);
    }
  };

  const processSelectedFile = async (file: File) => {
    setImportError(null);
    setImportSuccess(null);
    setPendingImportDb(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const validated = validateAndNormalizeDatabase(parsed);
      if (!validated) {
        setImportError(
          'Ungültiges Dateiformat. Bitte eine zuvor gesicherte JSON-Datei von VTO - Haushaltsübersicht wählen.'
        );
        return;
      }
      setImportFileName(file.name);
      setPendingImportDb(validated);
    } catch {
      setImportError('Die JSON-Datei ist beschädigt oder nicht lesbar.');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processSelectedFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!pendingImportDb) return;
    onImportDatabase(pendingImportDb);
    setPendingImportDb(null);
    setImportFileName('');
    setImportSuccess(
      'Datenbestand erfolgreich geladen und im Browser gespeichert.'
    );
    setTimeout(() => setImportSuccess(null), 4000);
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
    <div className="space-y-6">
      {/* Direct Folder Connection (File System Access API) */}
      <section className="bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="font-display text-base font-semibold text-[#3D322C]">
              Direkter Ordner-Speicher (Mac & Windows)
            </h2>
            <p className="mt-1.5 text-sm text-[#6E6056] leading-relaxed">
              Verknüpfen Sie einmalig einen lokalen oder synchronisierten Ordner
              im Browser. Bei jedem Klick auf „Daten sichern“ wird die Datei{' '}
              <span className="font-mono text-xs text-[#3D322C]">
                {PCLOUD_FILENAME}
              </span>{' '}
              dort direkt und ohne Download-Dialog aktualisiert.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {fsSupported ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleConnectClick()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#FCFBF8] bg-[#3D322C] rounded-xl hover:bg-[#2E2520] shadow-xs transition-colors whitespace-nowrap"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {pcloudFolderName ? 'Ordner wechseln' : 'Ordner verknüpfen'}
                </button>
                {pcloudFolderName && (
                  <button
                    type="button"
                    onClick={() => {
                      void onDisconnectFolder();
                      setFolderFeedback(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#6E6056] bg-white border border-[#DFD7C8] rounded-xl hover:text-[#3D322C] hover:border-[#3D322C] transition-colors whitespace-nowrap"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Trennen
                  </button>
                )}
              </>
            ) : (
              <span className="text-xs text-[#8C7D72]">
                Direkte Ordner-Verknüpfung in diesem Browser nicht verfügbar
                (z. B. Safari/iPad) — nutzen Sie den JSON-Export/Import unten.
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 p-4 rounded-xl bg-[#F5F2EB]/70 border border-[#E5DFD3] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-[#4A3B32] tabular-nums">
            {pcloudFolderName ? (
              <>
                Verknüpfter Ordner:{' '}
                <span className="font-semibold text-[#3D322C]">
                  {pcloudFolderName}
                </span>{' '}
                · Zieldatei:{' '}
                <span className="font-mono text-[#3D322C]">
                  {PCLOUD_FILENAME}
                </span>
              </>
            ) : (
              <span className="text-[#6E6056]">
                Noch kein Ordner verknüpft.
              </span>
            )}
          </div>
          <div className="text-[#6E6056] tabular-nums">
            Letzte Änderung:{' '}
            <span className="font-mono text-[#3D322C]">
              {formatDateTimeDE(db.updatedAt)}
            </span>
          </div>
        </div>

        {folderFeedback && (
          <p className="mt-3 text-xs font-medium text-[#2A6F4E]">
            {folderFeedback}
          </p>
        )}
        {folderError && (
          <p className="mt-3 text-xs font-medium text-[#B43C2E]">
            {folderError}
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Export / Save Box */}
          <div className="border border-[#E5DFD3] bg-[#F5F2EB]/45 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#3D322C]">
                  1. Daten sichern
                </span>
                <FileJson className="w-4 h-4 text-[#8C7D72]" />
              </div>
              <p className="mt-2 text-xs text-[#6E6056] leading-relaxed">
                {pcloudFolderName
                  ? `Aktualisiert direkt „${PCLOUD_FILENAME}“ im verknüpften Ordner „${pcloudFolderName}“ mit Profilnamen, Profilbildern und allen Finanzdaten (Buchungen, Fixposten, Kategorien und Salden).`
                  : 'Speichert Profilnamen, Profilbilder und alle Finanzdaten (Buchungen, Fixposten, Kategorien und Salden) in den verknüpften Ordner oder als JSON-Download.'}
              </p>
              <div className="mt-4 pt-3 border-t border-[#E5DFD3] text-xs text-[#6E6056] tabular-nums">
                Umfang: {db.transactions.length} Buchungen ·{' '}
                {db.recurringItems.length} Fixposten
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => void handleDirectSaveClick()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-[#FCFBF8] bg-[#3D322C] rounded-xl hover:bg-[#2E2520] shadow-xs transition-colors"
              >
                {exportSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    {exportSuccess}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Daten sichern
                  </>
                )}
              </button>

              {pcloudFolderName && (
                <button
                  type="button"
                  onClick={() => triggerClassicJsonDownload(db)}
                  className="w-full text-center text-xs text-[#6E6056] hover:text-[#3D322C] underline underline-offset-2 py-1"
                >
                  Zusätzlich als datierte Kopie herunterladen
                </button>
              )}
            </div>
          </div>

          {/* Import / Load Box */}
          <div className="border border-[#E5DFD3] bg-[#F5F2EB]/45 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#3D322C]">
                  2. Daten laden
                </span>
                <Upload className="w-4 h-4 text-[#8C7D72]" />
              </div>
              <p className="mt-2 text-xs text-[#6E6056] leading-relaxed">
                {pcloudFolderName
                  ? `Liest „${PCLOUD_FILENAME}“ direkt aus Ihrem verknüpften Ordner „${pcloudFolderName}“ und zeigt eine Vorschau zur Bestätigung.`
                  : 'Lädt den Datenstand aus Ihrem verknüpften Ordner oder einer manuell ausgewählten JSON-Datei.'}
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {pendingImportDb && (
                <div className="mt-4 p-3.5 bg-[#FCFBF8] border border-[#E5DFD3] rounded-xl text-xs space-y-2 shadow-xs">
                  <div className="font-semibold text-[#3D322C]">
                    Datei geprüft: {importFileName}
                  </div>
                  <div className="text-[#6E6056] tabular-nums space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>Profile:</span>
                      {pendingImportDb.profiles.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F5F2EB] border border-[#E5DFD3] text-[#3D322C] font-medium"
                        >
                          <ProfileAvatar profile={p} size="xs" />
                          <span>{p.name}</span>
                        </span>
                      ))}
                    </div>
                    <div>
                      Inhalt: {pendingImportDb.transactions.length} Buchungen ·{' '}
                      {pendingImportDb.recurringItems.length} Fixposten
                    </div>
                    <div>
                      Stand: {formatDateTimeDE(pendingImportDb.updatedAt)}
                    </div>
                  </div>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-[#2A6F4E] rounded-lg hover:bg-[#1E563B] transition-colors"
                    >
                      Datenbestand übernehmen
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingImportDb(null)}
                      className="px-3 py-1.5 text-xs font-medium text-[#6E6056] hover:text-[#3D322C]"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              {importError && (
                <p className="mt-3 text-xs font-medium text-[#B43C2E]">
                  {importError}
                </p>
              )}
              {importSuccess && (
                <p className="mt-3 text-xs font-medium text-[#2A6F4E]">
                  {importSuccess}
                </p>
              )}
            </div>

            <div className="mt-5 space-y-2">
              {pcloudFolderName ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleDirectLoadClick()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-[#3D322C] bg-[#FCFBF8] border border-[#D4CCB9] rounded-xl hover:border-[#3D322C] shadow-xs transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Direkt aus „{pcloudFolderName}“ laden
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full text-center text-xs text-[#6E6056] hover:text-[#3D322C] underline underline-offset-2 py-1"
                  >
                    Andere JSON-Datei manuell auswählen
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-[#3D322C] bg-[#FCFBF8] border border-[#D4CCB9] rounded-xl hover:border-[#3D322C] shadow-xs transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Daten laden
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Editable Profiles with Avatar Management & Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm p-6">
          <h3 className="font-display text-base font-semibold text-[#3D322C]">
            Profile & Profilbilder
          </h3>
          <p className="text-xs text-[#6E6056] mt-1 leading-relaxed">
            Jedes Profil führt getrennte Finanzdaten. Profilnamen und
            Profilbilder können frei angepasst werden und werden sowohl lokal im
            Browser als auch in der exportierten JSON-Datei gespeichert.
          </p>

          <div className="mt-5 divide-y divide-[#EAE4D7] border border-[#E5DFD3] rounded-xl overflow-hidden">
            {db.profiles.map((profile) => {
              const txCount = db.transactions.filter(
                (t) => t.profileId === profile.id
              ).length;
              const recCount = db.recurringItems.filter(
                (r) => r.profileId === profile.id
              ).length;
              const isEditing = editingProfileId === profile.id;
              return (
                <div
                  key={profile.id}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 bg-white"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <ProfileAvatar profile={profile} size="md" />
                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const trimmed = draftProfileName.trim();
                          if (trimmed) {
                            onUpdateProfileName(profile.id, trimmed);
                          }
                          setEditingProfileId(null);
                          setDraftProfileName('');
                        }}
                        className="flex items-center gap-1.5 flex-1 min-w-0"
                      >
                        <input
                          type="text"
                          value={draftProfileName}
                          onChange={(e) => setDraftProfileName(e.target.value)}
                          maxLength={32}
                          autoFocus
                          className="w-full min-w-0 px-2.5 py-1 text-sm font-medium bg-[#FCFBF8] border border-[#3D322C] rounded-lg text-[#3D322C] focus:outline-none"
                          placeholder="Profilname..."
                        />
                        <button
                          type="submit"
                          className="p-1.5 bg-[#3D322C] text-[#FCFBF8] rounded-lg hover:bg-[#2E2520] shrink-0"
                          aria-label="Profilnamen speichern"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProfileId(null);
                            setDraftProfileName('');
                          }}
                          className="p-1.5 text-[#6E6056] hover:text-[#3D322C] rounded-lg hover:bg-[#EFEAE0] shrink-0"
                          aria-label="Bearbeitung abbrechen"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-[#3D322C] truncate">
                            {profile.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProfileId(profile.id);
                              setDraftProfileName(profile.name);
                            }}
                            className="p-1 text-[#8C7D72] hover:text-[#3D322C] rounded-md hover:bg-[#F5F2EB] transition-colors shrink-0"
                            aria-label={`Namen von ${profile.name} bearbeiten`}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-xs text-[#8C7D72] tabular-nums">
                          {txCount} Buchungen · {recCount} Fixposten
                        </div>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        ref={(el) => {
                          avatarInputRefs.current[profile.id] = el;
                        }}
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleAvatarSelected(profile.id, e)}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          avatarInputRefs.current[profile.id]?.click()
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#3D322C] bg-[#F5F2EB] border border-[#DFD7C8] rounded-lg hover:bg-[#EFEAE0] transition-colors whitespace-nowrap"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        {profile.avatarUrl ? 'Ändern' : 'Bild wählen'}
                      </button>
                      {profile.avatarUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateProfileAvatar(profile.id, undefined)
                          }
                          className="p-1.5 text-[#8C7D72] hover:text-[#B43C2E] rounded-lg hover:bg-[#B43C2E]/10 transition-colors"
                          aria-label={`Profilbild von ${profile.name} entfernen`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {avatarError && (
            <p className="mt-2.5 text-xs font-medium text-[#B43C2E]">
              {avatarError}
            </p>
          )}

          {/* Maintenance Actions */}
          <div className="mt-8 pt-6 border-t border-[#EAE4D7] space-y-3">
            <h4 className="text-xs font-semibold text-[#4A3B32]">
              Datenbestand verwalten
            </h4>

            <div className="flex flex-wrap items-center gap-3">
              {confirmSample ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#6E6056]">
                    Aktuelle Daten durch Demo-Daten ersetzen?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onLoadSampleData();
                      setConfirmSample(false);
                    }}
                    className="px-2.5 py-1 font-medium text-[#FCFBF8] bg-[#3D322C] rounded-lg hover:bg-[#2E2520]"
                  >
                    Ja, laden
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmSample(false)}
                    className="text-[#6E6056] hover:text-[#3D322C]"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmSample(true)}
                  className="px-3 py-1.5 text-xs font-medium text-[#3D322C] bg-white border border-[#D4CCB9] rounded-lg hover:border-[#3D322C] transition-colors"
                >
                  Beispieldaten laden
                </button>
              )}

              {confirmReset ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#B43C2E] font-medium">
                    Wirklich alle Buchungen löschen?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onResetDatabase();
                      setConfirmReset(false);
                    }}
                    className="px-2.5 py-1 font-medium text-white bg-[#B43C2E] rounded-lg hover:bg-[#993226]"
                  >
                    Alles zurücksetzen
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="text-[#6E6056] hover:text-[#3D322C]"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#B43C2E] border border-[#E6C5BF] rounded-lg hover:bg-[#B43C2E]/10 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Alle Daten zurücksetzen
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="lg:col-span-7 bg-[#FCFBF8] border border-[#E5DFD3] rounded-2xl shadow-sm p-6">
          <h3 className="font-display text-base font-semibold text-[#3D322C]">
            Kategorien verwalten
          </h3>
          <p className="text-xs text-[#6E6056] mt-1">
            Eigene Kategorien stehen für alle Profile in der Erfassung zur
            Verfügung.
          </p>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-semibold text-[#4A3B32] mb-2.5">
                Ausgaben-Kategorien
              </h4>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Neue Kategorie..."
                  value={newExpenseCat}
                  onChange={(e) => setNewExpenseCat(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm bg-white border border-[#DFD7C8] rounded-xl text-[#3D322C] focus:outline-none focus:border-[#3D322C]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newExpenseCat.trim()) {
                      onAddCategory('expense', newExpenseCat.trim());
                      setNewExpenseCat('');
                    }
                  }}
                  className="p-2 bg-[#3D322C] text-[#FCFBF8] rounded-xl hover:bg-[#2E2520] transition-colors"
                  aria-label="Ausgaben-Kategorie hinzufügen"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <ul className="divide-y divide-[#F0ECE2] border border-[#E5DFD3] rounded-xl overflow-hidden bg-white">
                {db.categories.expense.map((cat) => {
                  const isFixed = (
                    FIXED_EXPENSE_CATEGORIES as readonly string[]
                  ).includes(cat);
                  return (
                    <li
                      key={cat}
                      className="flex items-center justify-between px-3 py-2 text-xs text-[#3D322C]"
                    >
                      <span>{cat}</span>
                      {db.categories.expense.length > 1 && !isFixed && (
                        <button
                          type="button"
                          onClick={() => onRemoveCategory('expense', cat)}
                          className="text-[#8C7D72] hover:text-[#B43C2E] p-0.5"
                          aria-label={`${cat} entfernen`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-[#4A3B32] mb-1">
                Einnahmen-Kategorien
              </h4>
              <p className="text-[11px] text-[#8C7D72] mb-3">
                Kategorien für Einnahmen
              </p>
              <ul className="divide-y divide-[#F0ECE2] border border-[#E5DFD3] rounded-xl overflow-hidden bg-white">
                {getIncomeCategories(db.categories).map((cat) => (
                  <li
                    key={cat}
                    className="flex items-center justify-between px-3 py-2 text-xs text-[#3D322C]"
                  >
                    <span>{cat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
