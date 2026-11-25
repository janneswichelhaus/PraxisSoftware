# Technische und organisatorische Maßnahmen

Entwurf von Claude, Stand 25. November 2026; geht mit B2 an die Datenschutzberatung. Nach Art. 32
DSGVO, Vorbedingung aus ADR-007 Punkt 5. Jede Maßnahme nennt ihre Quelle. **Gebaut** heißt: in der
Software, mit Test, auf synthetischen Daten. **Offen** heißt: kommt mit dem genannten Paket der
Roadmap und ist vor den ersten echten Daten nachzuweisen. Ein Produktivsystem gibt es noch nicht.

## 1. Vertraulichkeit

**Anmeldung und Sitzung (gebaut, ADR-025).**

- Kein Kennwort: Anmeldung per Passkey, das Gerät prüft die Person (Punkte 9 und 10). Ein zweiter
  Faktor ist einrichtbar, nicht verlangt (ADR-023 Punkt 18).
- Die Anwendung sperrt nach 30 Minuten ohne Bedienung und spätestens 60 Minuten nach der Anmeldung
  (Punkte 1 und 2). Die Datenbank prüft dieselben Fristen bei jeder Anfrage (Punkt 6,
  `sitzungssperre.test.ts`); gesperrt zeigt die Seite keine Daten (Punkte 3 und 5).
- Freigabe per Passkey, ersatzweise mit sechsstelliger App-PIN; nach fünf Fehlversuchen endet die
  Sitzung (Punkte 7 und 11, `app-pin.test.ts`).
- Konten entstehen nur durch Einladung, nie durch Selbstregistrierung (ADR-023 Punkt 1, §4).

**Zugriff (gebaut, ADR-004).**

- Jede Berechtigung prüft der Server, die Datenbank sichert mit RLS ab (Punkt 5, `rls.test.ts`).
  Ausgeblendete Elemente sind keine Zugriffskontrolle (§4.7).
- Therapeut:innen und Büro lesen alle Akten der Praxis, das Büro schreibt keine Dokumentation
  (Punkte 2 und 3; Bewertung offen in B2).
- Plattformkonten erreichen keine Praxistabelle, nur eigene Projektionen (ADR-023 Punkt 19,
  `plattform-abschottung.test.ts`). Behandlung und Training sind getrennt (§4.8, ADR-021).
- Der Schlüssel mit vollen Rechten (`service_role`) erreicht nie den Browser (ADR-017 Punkt 11).

**Protokoll (gebaut, ADR-010).**

- Protokolliert werden: Akte geöffnet (einmal je Person, Akte und Tag), Downloads, Exporte,
  Kontoereignisse und abgewiesene Zugriffe; ein abschließender Katalog mit 27 Aktionen (Punkt 16).
- Einträge sind über die Anwendung nicht änderbar (Punkt 4), tragen keine Inhalte (Punkt 3) und
  liegen zwölf Monate oder drei Jahre (Punkt 18). Nur `owner` liest, nur bei Anlass (Punkte 13
  und 19).
- Zweck ist allein Datenschutz und Sicherheit, nie Leistungs- oder Verhaltenskontrolle (Punkt 20).

**Weitergabe nach außen.**

- Dateien liegen in privaten Ablagen, ihre Schlüssel bestehen nur aus Kennungen. Ausgeliefert wird
  über Verweise, die je Zugriff neu entstehen und 60 Sekunden gelten sollen (ADR-017 Punkte 1, 5
  und 15). Offen: Die Dauer setzt heute der Browser (Issue #373).
- Kartendienst: nur Anschrift oder Koordinate, nie Name oder Uhrzeit (`kartendienst.md`).
- KI: jeder Aufruf über das eigene Gateway mit fester Zweckliste (ADR-005, §6.1); heute nur eine
  Nachbildung, kein Anbieter.
- Benachrichtigungen nennen nur Art, Datum und Uhrzeit, nie Gesundheitsangaben (ADR-024 Punkt 14).
- Betriebslogs enthalten keine Namen, Adressen, Diagnosen oder Freitexte; eine einzige Stelle
  filtert (`src/lib/protokoll.ts`, ADR-011 Punkte 2 und 6). Kein externer Logdienst in V1.

**Trennung.**

- Entwicklung, Test und Produktion sind getrennte Umgebungen; außerhalb der Produktion gibt es nur
  synthetische Daten (ADR-002 Punkt 5, §3.1). Coding- und KI-Werkzeuge bekommen nie
  Produktionszugänge (ADR-010 Punkt 12).
- Menschen greifen im Normalbetrieb nicht direkt auf die Produktionsdatenbank zu; Ausnahmen sind
  begründet, mit zweitem Faktor und befristet (ADR-010 Punkte 9 und 10). Offen: der Ablauf des
  Notzugangs (ADR-025 Punkt 14, OPS-003).

**Offen bis OPS-001 (G3).** Anbieter Supabase, Region Frankfurt, Verschlüsselung bei Übertragung
und Speicherung, Vertrag zur Auftragsverarbeitung, Verpflichtung nach § 203 StGB: Zwölf Punkte sind
zu belegen, keiner ist erfüllt (`providerpruefung-supabase.md`, Teil 8).

## 2. Integrität

- Finalisierte Dokumentation wird nie überschrieben; Korrekturen sind neue Fassungen mit Urheber
  und Zeit. Rechnungen ändern sich nur per Storno (ADR-016, ADR-010 Punkt 21).
- Dateien sind unveränderlich und tragen eine Prüfsumme (ADR-017 Punkte 8 und 9). Offen: Die
  Prüfung am Server läuft erst mit OPS-001 (Punkt 50); eine Virenprüfung gibt es nicht (Punkt 28).
- Änderungen an der Software: Pflichtprüfungen vor jedem Merge, darunter Tests der Zugriffsrechte
  und die Suche nach Secrets (ADR-013 Punkt 2); kritische Änderungen mit Checkliste und Zweitreview
  (Punkt 9). Offen: Freigabe eines Releases aus einem Tag (OPS-002, G5).

## 3. Verfügbarkeit und Wiederherstellung

- Ziel: höchstens eine Stunde Datenverlust, Wiederanlauf in vier Stunden (ADR-012 Punkt 1).
- Offen bis OPS-003 (G7): laufende Sicherung der Datenbank, eigene Sicherung der Dateiablage,
  verschlüsselte Sicherungen mit 30 Tagen Aufbewahrung (Punkte 3 bis 5 und 12), ein Restore-Test
  vor dem Start und danach vierteljährlich (Punkte 6 und 7).
- Ohne Netz bleiben Entwürfe der Dokumentation auf dem Gerät, bis der Server sie angenommen hat
  (gebaut, ADR-024 Punkt 6).
- Ohne Anwendung: Tagesliste am Morgen, Dokumentation auf Papier mit Nachtrag (E2 in
  `OPEN_DECISIONS.md`). Offen: das Betriebsdokument dazu (G10).

## 4. Datensparsamkeit und Löschung

- Jede Datenklasse hat Frist, Anker und Norm in der Datenbank; ein Löschlauf löscht nach Ablauf
  echt, mit Journal (gebaut, ADR-008 Punkte 1, 3 und 13, `retention-run.test.ts`).
- Eine Löschsperre hält die Löschung an, nicht die Zugriffsregeln (ADR-008 Punkt 7).
- Nach einer Wiederherstellung werden Löschungen erneut angewendet (ADR-008 Punkt 8,
  `reapply_deletion_journal`). Offen: der Nachweis, dass der Lauf beim Anbieter täglich läuft (G3).
- Der Buchungsstapel für die Steuerberatung trägt keine Namen und Diagnosen (ANN-829).

## 5. Endgeräte

Hauptgerät ist das Diensttelefon. Die Anwendung kann ein Gerät nicht prüfen; die Vorgaben
verantwortet die Praxis (ADR-024 Punkt 6).

- **Vorgabe:** Sperre mit Code oder Biometrie, Geräteverschlüsselung, aktuelles Betriebssystem,
  kein Privatgerät, kein geteiltes Gerätekonto. Wer den Tagesplan ohne Netz einschaltet, bestätigt
  das.
- **Auf dem Gerät liegen** nur der eigene Tagesplan von heute und nicht übertragene Entwürfe, ohne
  Befund, Diagnose oder frühere Dokumentation. Der Tagesplan fällt am Tagesende und beim Abmelden.
- **Fotos** entstehen im Kameradialog der Anwendung, ohne Aufnahmedaten, und liegen nie in der
  Galerie (ADR-017 Punkte 33, 34 und 40).
- **Verlust:** sofort der Praxisleitung melden und alle Sitzungen beenden (ADR-025 Punkt 12), dann
  nach [`datenpanne.md`](datenpanne.md) vorgehen. Eine Fernlöschung gibt es nicht (ADR-001).
- **Offen (BETRIEB-001, G16):** wer Geräte einrichtet und prüft, Umgang mit Bildschirmfotos,
  Rückgabe beim Ausscheiden.

## 6. Organisation

- Rollen vergibt und Zugänge sperrt die Praxisleitung, nicht das Büro (§4, §4.3). Eine Sperre
  wirkt bei der nächsten Anfrage (ADR-023 Punkt 18).
- Offen: Verpflichtung der Mitarbeitenden auf Vertraulichkeit und § 203 StGB, Schulung je Rolle
  (H2), datenschutzbeauftragte Person (ANN-873), Verträge mit allen Auftragsverarbeitern.

## 7. Überprüfung

- Bei jeder Änderung: die Tests der CI, darunter Negativfälle je Rolle gegen die Datenbank.
- Bei Anlass: Wiedervorlage der DSFA (ADR-007 Punkt 2) und Stichproben der Sicherheit. Aus der
  Stichprobe vom 2026-11-11 sind acht Befunde offen (Issues #367 bis #374).
- Offen: Alarmierung und Erkennung von Vorfällen (OPS-004, G6); Secret Scanning und Push
  Protection bei GitHub einschalten (M3); jährliche Durchsicht dieses Dokuments.
