# VTO - Haushaltsübersicht (Haushaltsbuch)

Eine moderne, datenschutzfreundliche Web-Anwendung zur intuitiven Erfassung, Verwaltung und Auswertung von Einnahmen, Ausgaben und Fixkosten. Die App unterstützt sowohl die Einzelnutzung als auch die getrennte Führung von zwei unabhängigen Profilen inklusive einer automatischen, gemeinsamen Gesamtansicht.

Live-Version: [https://7xcr4b4kqr-art.github.io/Haushaltsbuch/](https://7xcr4b4kqr-art.github.io/Haushaltsbuch/)

---

## 🔒 Datenschutz & Datensicherheitskonzept (Local-First)

Bei Finanzdaten steht die Privatsphäre an erster Stelle. Diese Anwendung basiert konsequent auf dem **Local-First-Prinzip**:

1. **Vollständige Anonymität & 0 % Server-Transfer:**
   - Es gibt kein Backend, keine Datenbank auf fremden Servern und keine Cloud-Anbindung.
   - Es werden **keinerlei Finanzdaten, persönliche Angaben oder Datenströme** an Dritte oder externe Server übertragen.

2. **Lokale Datenspeicherung im Browser-Speicher (IndexedDB):**
   - Alle erfassten Buchungen, Fixkosten und Einstellungen verbleiben ausschließlich im Speicher des Browsers auf Deinem Endgerät.

3. **Höchste Datenhoheit via JSON-Import/Export:**
   - Deine Finanzdaten gehören Dir: Über die Funktionen **„Daten sichern“** und **„Daten laden“** exportierst und importierst Du Deine Daten als unverschlüsselte, lesbare `.json`-Datei.
   - **Multi-Geräte-Synchronisation:** Um die Daten zwischen verschiedenen Geräten (z. B. Mac, PC, iPad) abzugleichen, speicherst Du die JSON-Datei einfach in Deinem bevorzugten privaten Cloud-Ordner (z. B. pCloud, iCloud, Google Drive, OneDrive) und lädst sie auf dem anderen Gerät wieder ein.

4. **Geräte-spezifische Profilbilder:**
   - Profilbilder werden zur Schonung der JSON-Dateigröße lokal im Browser gehalten, sodass der JSON-Export extrem schlank und schnell bleibt.

---

## ✨ Hauptfunktionen

* **Frei anpassbare Profile:** Profilnamen lassen sich beliebig editieren und bleiben dauerhaft in der JSON-Datei sowie im lokalen Speicher erhalten.
* **Getrennte & Gemeinsame Ansichten:**
  * Einzelansichten pro Profil für persönliche Budgets.
  * Automatisch aggregierte **Gemeinsam-Ansicht** für den Gesamthaushalt.
* **Visuelle Saldo-Ampel:**
  * Zentrale Netto-Saldo-Kachel auf Monats- und Jahresbasis.
  * Dynamische Farbkodierung: **Grün** bei Überschuss (Einnahmen > Ausgaben), **Rot** bei Unterdeckung (Ausgaben > Einnahmen).
* **Kategorisierung & Festposten:**
  * Dynamische Trennung von Ausgaben (z. B. Essen, Mobilität, Freizeit) und Einnahmen (z. B. Gehalt, Erstattungen, Dividenden).
  * Verwaltung von wiederkehrenden Fixkosten mit optionalem Enddatum.
* **Vollständig Responsive UI:** Perfekt optimiert für Desktop-Browser, Tablets und Smartphones.
* **Money-Control-Import:**
  * Auf der Startseite lässt sich ein CSV-Export aus Money Control einlesen.
  * Du wählst das Zielprofil: Nur dieses Profil wird überschrieben, andere Profile bleiben unverändert. Vor dem Überschreiben zeigt Dir eine Rückfrage genau, was ersetzt wird.
  * Umbuchungen zwischen Konten werden übersprungen, neue Kategorien werden ergänzt; Personen aus der Datei lassen sich gleichnamigen Profilen zuordnen.
  * Die Datei wird ausschließlich in Deinem Browser gelesen, nichts wird übertragen.
* **Suche & Auswertung:**
  * Eigene Ansicht, die alle Monate und Jahre durchsucht – mit Filtern für Suchbegriff, Kategorie, Zeitraum und Art.
  * Summenzeile mit Treffern, Einnahmen, Ausgaben und Saldo sowie die gewohnte Buchungsliste.
  * Im Jahresabschluss führt Dich ein Klick auf eine Kategorie direkt zu deren Einzelbuchungen (mit Rücksprung); die Monatssuche verweist per Link auf die Suche über alle Monate.

---

## 🚀 Schnellstart & Nutzung

### Option A: Direkt im Browser nutzen (Empfohlen)
Öffne einfach den folgenden Link in Deinem Browser:
👉 **[Haushaltsbuch starten](https://7xcr4b4kqr-art.github.io/Haushaltsbuch/)**

### Option B: Lokal ausführen
Hinweis: Node.js 20.19 oder neuer erforderlich.

1. Repository klonen, Abhängigkeiten installieren und Dev-Server starten:
   ```bash
   git clone https://github.com/7xcr4b4kqr-art/Haushaltsbuch.git
   cd Haushaltsbuch
   npm install
   npm run dev
   ```
2. Anschließend im Browser öffnen: [http://localhost:3000](http://localhost:3000)

---

## 🗓️ Änderungen

* **26.11.2026** – Speicher auf IndexedDB umgestellt: große Datenbestände (z. B. aus dem Money-Control-Import) funktionieren jetzt auch auf iPhone und iPad; vorhandene Daten werden automatisch übernommen.
* **25.11.2026** – Ausgaben-Beträge werden in den Buchungslisten rot dargestellt, Einnahmen grün.
* **25.11.2026** – Neue Ansicht „Suche & Auswertung“ mit Klick auf Kategorien im Jahresabschluss.
* **25.11.2026** – Import von Money-Control-CSV-Dateien mit Wahl des Zielprofils.
* **22.11.2026** – Schriften werden lokal eingebunden, es werden keine Google-Fonts mehr geladen.
* **22.11.2026** – Veröffentlichung über GitHub Pages.
