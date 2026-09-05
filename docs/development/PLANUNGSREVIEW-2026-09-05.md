# Planungsreview 2026-09-05

> **Einmaliger Befund, nicht normativ.** Diese Datei steht unterhalb aller
> Planungsdokumente und entscheidet nichts. Sie beantwortet drei Fragen:
> Was ist geplant, wo ist der Plan unordentlich oder lückenhaft, und was kann
> weg. Sobald die Entscheidungen aus Abschnitt 6 in `ROADMAP.md` und
> `OPEN_DECISIONS.md` eingearbeitet sind, wird diese Datei **gelöscht** — sie
> soll kein weiteres Planungsdokument neben den bestehenden werden.

Geprüft wurden: `main` (Stand `5f40866`, nach PR #12), alle Remote-Branches,
alle Pull Requests, die CI-Läufe, `PROJECT_PRINCIPLES.md` 0.4, alle 16 ADRs,
`OPEN_DECISIONS.md`, `ASSUMPTIONS.md`, `ROADMAP.md`, `ARBEITSBEREICHE.md`,
`DEVELOPMENT.md`, `DEVELOPMENT_WORKFLOW.md`, `PRODUCT_VISION.md`, der gesamte
Ideenspeicher, die Abnahmeordner, der Feature-Loop-Skill, die Wochenroutine,
`package.json`, die Skripte und die Struktur von `src/` und `supabase/`.

---

## 1. Gesamtstand auf einen Blick

### Repository

| Punkt                | Stand                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `main`               | `5f40866`, CI grün (Lauf 42, alle fünf Jobs). Die beiden roten `main`-Läufe davor (PR #7, PR #8) waren das Rate-Limit der Supabase-CLI-Action, behoben in PR #12. |
| Pull Requests        | 12 angelegt, 12 gemergt, **keine offen**.                                                                        |
| Remote-Branches      | `claude/new-session-4ysdqj` (Stand 31.08.) und `claude/unpublished-changes-overview-l66mn5` (Stand PR #12): **beide vollständig in `main` enthalten**, keine unveröffentlichte Arbeit. |
| Commits              | 105 auf `main` seit dem 2026-08-28; 21 Merge-Commits.                                                            |
| Wochenroutine        | Aktiv, montags 07:50 (UTC 05:50), Haiku 4.5, erste Ausführung 2026-09-07. Liest nur `ROADMAP.md` und das Git-Log. |
| Lokaler Stand Jannes | Unbekannt; Abschnitt 8 beschreibt das Nachziehen.                                                                |

### Umfang

| Größe                                | Wert                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Migrationen                          | 23                                                                                       |
| Tabellen                             | 16 (`organizations`, `locations`, `persons`, `patients`, `patient_contact_details`, `staff_members`, `staff_private_details`, `staff_working_hours`, `staff_working_hour_exceptions`, `appointments`, `treatment_notes`, `treatment_note_versions`, `audit_log`, `roles`, `user_roles`, `user_profiles`) |
| Serverfunktionen (RPC)               | 27                                                                                       |
| Datenbank-/RLS-Testdateien           | 18                                                                                       |
| Komponenten-/Unit-Testdateien        | 42                                                                                       |
| E2E-Spezifikationen                  | 14                                                                                       |
| Quelltext `src/` (TS/TSX)            | ≈ 26 000 Zeilen                                                                           |
| davon Vorschau ohne Anbindung        | ≈ 8 200 Zeilen (Radflotte 2 671, Vorschau-Gerüst 2 456, Urlaub 1 146, Erstattungen 836, Teamchat 331, Zeitkonto 282, Abrechnung 246, Touren 156) |

### Was echt funktioniert (Datenbank, RLS, Audit)

Anmeldung und Sitzung · Rollen, RLS, Auditlog mit eingeschränktem Lesepfad ·
Patienten anlegen, bearbeiten, Versorgungsstatus, Liste filtern und suchen
(PAT-001 bis PAT-004) · Termine anlegen, Kalender Tag/Woche, bearbeiten,
absagen, abschließen, Praxisraster, Arbeitszeiten, Verschieben per Ziehen
(CAL-001 bis CAL-006) · Mitarbeiterverwaltung mit Beschäftigungsstatus und
Privatdaten nur für `owner` (STAFF-001) · Behandlungsdokumentation als
Entwurf, Finalisierung, Versionierung, Korrektur, Nachtrag (DOK-001, DOK-002)
· Dokumentation in der Akte, rollenabhängig projiziert (DOK-003) ·
automatische Finalisierung über `pg_cron` mit Systemakteur (DOK-004) · „Mein
Tag" · sechs Arbeitsbereiche als Navigation.

### Was nur Vorschau ist (im Arbeitsspeicher, keine Datenbank)

Radflotte mit Schlüssel, Check-Up und Pannenassistent · Urlaub · Zeitkonto ·
Erstattungen · Teamkommunikation · Touren · Abrechnung (Rechnungen,
Leistungen, Katalog, Zahlungen).

### Was nicht existiert

Löschung und Retention (Go-live-Blocker) · Verordnungen/Rezepte ·
Abrechnung · Praxis-Stammdaten für Rechnungen · Terminserien ·
Terminstatus-Automat (No-show, Ausfallhonorar) · Fragebögen/Anamnese ·
Therapieberichte · Dateiablage/Anhänge · Konten- und Rollenverwaltung in der
Anwendung (Zugänge entstehen nur über Seed oder Supabase-Oberfläche) ·
Passwort-Zurücksetzen · Patientenportal · Routing/Kartendienst · Offline ·
KI · Deployment, Cloudprojekt, Backup-Test, Monitoring · ein Zieltermin für
den Produktivbetrieb.

---

## 2. Wo der Plan steht — die Dokumentlandschaft

| Dokument                          | Rolle laut Hierarchie                | Befund                                                                                                                                                                  |
| --------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROJECT_PRINCIPLES.md` 0.4       | Rang 1, verbindlich                  | In Ordnung. Vollständige Funktionsliste in §1; Versionierung und Änderungsvermerke funktionieren.                                                                       |
| `docs/adr/` ADR-001 bis ADR-016   | Rang 2, verbindlich                  | In Ordnung. Jeder ADR trägt „Offene Folgefragen" — zusammen einige Dutzend, die **nirgends gesammelt** sind (siehe 4.3).                                                |
| `OPEN_DECISIONS.md`               | Register offener Punkte              | 682 Zeilen, davon rund zwei Drittel Volltext zu bereits entschiedenen Punkten. Die Struktur (A bis E, „Vorgeschlagene Reihenfolge") stammt vom Baseline-Review und passt nicht mehr zum Stand. |
| `ASSUMPTIONS.md`                  | Rang 4, Annahmen                     | In Ordnung, konsistent, ANN-001 bis ANN-009.                                                                                                                             |
| `ROADMAP.md`                      | Reihenfolge                          | Deckt nur die klinisch-abrechnende Spur und die Betreuungsplattform ab. **Betrieb** (Urlaub, Zeitkonto, Flotte, Erstattungen, Teamchat, Touren) und **Betriebsreife** (Go-live) fehlen vollständig. Trägt Historie (DOK-004-Herleitung, Routinedetails). |
| `ARBEITSBEREICHE.md`              | Referenz: echt / Vorschau / offen    | Führte bis heute eine **zweite Reihenfolge** (§6) mit bereits erledigten Punkten — jetzt durch einen Verweis ersetzt.                                                    |
| `DEVELOPMENT.md`                  | Umgebung, Go-live-Blocker            | In Ordnung; verweist bewusst auf `OPEN_DECISIONS.md` statt zu doppeln. Ergänzt um den Windows-Hinweis zu `test-db.sh`.                                                   |
| `PRODUCT_VISION.md`               | Rang 5, nicht normativ               | In Ordnung. Ein veralteter Satz zu Teamverzeichnis/Personalakte korrigiert.                                                                                              |
| `docs/product/` (Ideenspeicher)   | Rang 6                               | 60 Einträge, gut strukturiert. Zwei Einträge nannten C2 noch als offen, einer den Scheduler als fehlend — korrigiert. Fast alle Einträge betreffen die Betreuungsplattform nach Therapieende (B9); für den **Praxisbetrieb** (Betrieb-Vorschauen) gibt es keine Ideenspeicher-Datei. |
| `docs/abnahme/`                   | manuelle Prüfschritte                | In Ordnung, aktuell bis DOK-004.                                                                                                                                         |
| Wochenroutine (Prompt)            | Betrieb                              | Liest nur die Roadmap; ihr Ergebnis ist genau so gut wie die Roadmap. Enthält einen Branch-Fallback auf einen gelöschten Branch.                                         |

**Dopplungen und Streuung, die den Eindruck „nicht in einer Linie" erzeugen:**

1. **„Was als Nächstes" stand an vier Orten**: `ROADMAP.md` (Etappen),
   `ARBEITSBEREICHE.md` §6 (heute bereinigt), `OPEN_DECISIONS.md`
   „Vorgeschlagene Reihenfolge" (fast vollständig durchgestrichen) und
   `DEVELOPMENT.md` „Go-live-Blocker" (nur Verweis, in Ordnung).
2. **Offene Fragen stehen an drei Orten**: `OPEN_DECISIONS.md`, die
   „Offenen Folgefragen" jedes ADRs und die „Unsicher"-Sätze im
   Annahmenregister. Die Spur-B-Tabelle der Roadmap kennt nur acht davon;
   B6 (Leistungskontrolle Beschäftigte), E2 (Ausfallkonzept), E6
   (synthetische Daten), E10/E11 (Mitarbeiterrechte), C6/C7 (KI) und die
   ADR-Folgefragen fehlen dort.
3. **Zwei Planungswelten**: Die Roadmap plant die Betreuungsplattform bis
   Etappe 11; die Vorschaubereiche planen den Praxisbetrieb — ohne dass
   beide aufeinander verweisen. Von den 17 Funktionsbereichen in
   `PROJECT_PRINCIPLES.md` §1 hat die Roadmap 9 eingeplant.
4. **Historie in Arbeitsdokumenten**: `OPEN_DECISIONS.md` und `ROADMAP.md`
   tragen die Herleitung erledigter Entscheidungen in voller Länge (die drei
   Scheduler-Wege, die Reihenfolge des Baseline-Reviews). Das ist im Git-Log,
   in ADRs und im Annahmenregister bereits gesichert.

---

## 3. Der geplante Weg (Roadmap, Stand heute)

| Etappe | Loops                                                     | Voraussetzung (Spur B)              | Bewertung                                                                                                                             |
| ------ | --------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | ~~DOK-001 bis DOK-004~~ · LOE-001, LOE-002 · ABR-001 bis ABR-004 | B4 teilweise                        | Richtig priorisiert. ABR nennt weder Praxis-Stammdaten, Rechnungsempfänger ≠ Patient, Storno noch Verordnungsbezug — siehe 4.2.       |
| 1a     | PAT-005 · VER-001 bis VER-004                             | E8 für VER-004                      | Fachlich richtig, aber **hinter** der Abrechnung einsortiert, obwohl Privatrechnungen die Verordnung brauchen — siehe 4.1.            |
| 2      | FRB-001 bis FRB-004                                       | B8                                  | Schlüssig. Therapiebericht fehlt.                                                                                                     |
| 3      | UEB-001 bis UEB-004                                       | —                                   | Schlüssig, sauber von Etappe 9 (Progression) getrennt.                                                                                |
| 4      | Portalfundament                                           | B5                                  | Schlüssig; Einwilligungsverwaltung wird hier erstmals genannt, obwohl sie vorher gebraucht wird (Datenschutzinformation, Kartendienst, Foto/Video). |
| 5–10   | Tracking, Kommunikation, Zeitstrahl, Weiterbetreuung, Progression, KI | Etappe 4, C2 (erledigt), E8, B9, B11, B10, B1 | Bewusst grob. In Ordnung als Fernplan.                                                                                                |
| 11     | Design und Politur                                        | —                                   | „Kurz vor Go-live" — ein Go-live-Termin existiert nicht.                                                                              |

Spur B laut Roadmap: B8 (Etappe 3), B5 (Etappe 4), E8 (Etappe 7), B9 und B11
(Etappe 8), B10 (Etappe 9), B2/B7/E2 (vor Produktivstart). C1, C2 und D
„finalisiert" sind erledigt.

---

## 4. Kritische Prüfung

### 4.1 Reihenfolge

**Verordnung vor Rechnung.** Eine Privatrechnung, die Patient:innen bei PKV
oder Beihilfe einreichen, nennt üblicherweise Verordnungsdatum, Diagnose und
verordnende Ärzt:in; das Heilmittel-Kontingent der Verordnung bestimmt, welche
und wie viele Leistungen abrechenbar sind. ADR-009 verlangt beim Ausstellen
einen Snapshot aller rechnungsrelevanten Daten — die Verordnung gehört dazu.
Etappe 1a (PAT-005, VER-001 bis VER-003) sollte deshalb **vor** ABR-001 bis
ABR-004 liegen. Sie liefert außerdem den größten sofort spürbaren Nutzen im
Alltag: Rezepte sind heute das, was die Akte am deutlichsten vermissen lässt.

**Löschung (LOE) bleibt vor der Abrechnung.** Die Begründung der Roadmap
trägt: ein Löschkonzept über gewachsene Rechnungs- und Zahlungsdaten zu legen
ist teurer als davor. Vorschlag: PAT-005, VER-001 bis VER-003 → LOE-001,
LOE-002 → Terminserien und Terminstatus → ABR. VER-004 (Scan) erst nach der
Dateiablage-Entscheidung (E8).

**Etappen 4 bis 10 sind die Betreuungsplattform.** Das ist Jannes' erklärtes
Fernziel und richtig als Fernplan. Was fehlt, ist alles zwischen „Kernprozess
fertig" und „Portal": der Praxisbetrieb (4.2 B) und die Betriebsreife (4.2 C).
Ohne beides kann die Praxis mit der Software nicht arbeiten, egal wie gut die
Betreuungsplattform wird.

**Kein Zieltermin.** Weder Roadmap noch `DEVELOPMENT.md` nennen, wann die
Praxis real mit der Software arbeiten soll. Davon hängen aber die drei
Vorlauf-Entscheidungen (B1, B2, B9), die Providerprüfung, die DSFA und der
Restore-Test ab. Ein Quartal als Ziel reicht, um Spur B rückwärts zu
terminieren.

### 4.2 Lücken — was für die Praxis nötig ist und nirgends steht

**A. Kernprozess (Klinik und Abrechnung)**

| Lücke                                                   | Warum nötig                                                                                                                                       | Quelle                              | Vorschlag                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Praxis-Stammdaten für Rechnungen                        | Anschrift, Bankverbindung, Steuernummer/USt-IdNr., Logo — jede Rechnung braucht sie; `organizations` kennt heute Name, Zeitzone, Raster, Frist. | §19, ADR-009                        | Story ABR-000 vor ABR-003, `owner`-Einstellung.                                                 |
| Verordner:innen als Stammdaten                          | VER-001 führt „Arzt (PLZ)" als Feld. Wiederkehrende Ärzt:innen als Freitext erzeugen Dubletten und keine Berichtsadresse.                        | ADR-014 (Trennung der Entitäten)    | In VER-001 als eigene Tabelle `prescribers` mit Auswahl beim Anlegen.                          |
| Terminserien                                            | Eine Verordnung ergibt 6, 10 oder 18 Termine, meist im festen Rhythmus. Heute nur Einzeltermine.                                                 | Praxisalltag, §8                    | CAL-007 nach VER-001: Serie aus Verordnung, Konfliktprüfung je Termin, Einzelabweichung.        |
| Terminstatus-Automat, No-show, Ausfallhonorar           | „bestätigt" ist offen (D); ANN-005 überbrückt. Ohne Status „nicht angetroffen" gibt es kein Ausfallhonorar und keinen belastbaren Behandlungsnachweis. | §8, OPEN_DECISIONS D, ADR-009       | Entscheidung durch Jannes (minimal: `nicht angetroffen` + Ausfallhonorar-Kennzeichen), dann CAL-008 vor ABR-002. |
| Storno- und Korrekturrechnung, Rechnungsempfänger ≠ Patient, Mahnwesen | ADR-009 verlangt Stornodokumente und getrennten Empfänger; ABR-003/ABR-004 nennen beides nicht. Mahnwesen ist in ADR-009 offen.         | ADR-009, §19                        | Beides ausdrücklich in ABR-003 aufnehmen; Mahnwesen als ABR-005 nach Praxiserfahrung.          |
| Therapiebericht an Verordner:in                         | §4.2 nennt „Therapieberichte erstellen"; Ärzt:innen erwarten ihn zum Verordnungsende.                                                            | §4.2, §1                            | DOK-005 nach FRB-004 (braucht Befund und Verlauf als Inhalt).                                   |
| Dateiablage und Anhänge (E8)                            | Blockiert VER-004 (Scan), Belege bei Erstattungen, Foto/Video, Anhänge zur Dokumentation, Rechnungs-PDF-Archiv.                                  | E8, ADR-015 Folgefrage, ADR-008     | ADR-017 „Dateiablage" als Spur-B-Punkt, fällig vor VER-004 — nicht erst Etappe 7.              |
| Konten und Rollen verwalten                             | Neue Mitarbeitende brauchen Zugang und Rolle; heute nur Seed oder Supabase-Studio. E11 folgt daraus. Kein Passwort-Zurücksetzen in der Anwendung. | §4.2, ADR-004, E10, E11             | STAFF-002: Zugang einladen, Rolle vergeben, sperren, Passwort zurücksetzen; MFA für `owner`. Entscheidung, ob in der Anwendung oder in der Provider-Oberfläche (§2.1 lässt Letzteres zu). |
| Einwilligungen und Datenschutzinformation               | ADR-007 verlangt Datenschutzinformationen als Vorbedingung; Kartendienst, Foto/Video und Portal brauchen je eine eigene Einwilligung.            | ADR-007, §3.7, B7                   | Minimal in der Akte: „Datenschutzinformation ausgehändigt am", vor Etappe 4 eine Einwilligungsverwaltung. |

**B. Praxisbetrieb (heute nur Vorschau, in keiner Roadmap)**

| Bereich                                    | Quelle                        | Stand              | Vorschlag                                                                                       |
| ------------------------------------------ | ----------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| Urlaub                                     | §1, §4.5                      | Vorschau           | Erster echter Betrieb-Loop: wirkt auf Kalender und Kapazität (Abwesenheit = keine Termine).     |
| Arbeitszeit, Überstunden, Zeitkonto        | §1, §20, B6                   | Vorschau           | Nach Urlaub; B6 (aggregierte Auswertungen) vorher als Annahme oder Entscheidung.                |
| Radflotte, Schlüssel, Check-Up, Panne      | §1, PRODUCT_VISION §1.1       | Vorschau           | Nach Zeitkonto; Rad als Planungsressource des Kalenders.                                        |
| Belege und Erstattungen                    | §1, ADR-008, ADR-009          | Vorschau           | Nach Dateiablage (Belege sind Dateien) und steuerlicher Frage der Belegaufbewahrung.            |
| Teamkommunikation                          | §10                           | Vorschau           | Mit Speicherfrist (ANN-001: 12 Monate rollierend) und Anhangskonzept von Beginn an.             |
| Touren und Routenplanung                   | §9 (MUSS Kartendienst), B7    | Vorschau           | Erst nach B7 und Providerprüfung des Kartendienstes; bis dahin Reihenfolge von Hand.            |

**C. Betriebsreife (Go-live) — ohne Termin, ohne Loop**

| Punkt                                                              | Quelle                             |
| ------------------------------------------------------------------ | ---------------------------------- |
| Providerprüfung Supabase, Cloudprojekt in EU-Region, Umgebungen Dev/Test/Prod | ADR-002, ADR-015, §3.2   |
| Frontend-Hosting und Deployment mit menschlicher Freigabe          | ADR-013, ADR-015 Folgefrage        |
| Backup, Restore-Test, Betriebsdokumentation (13 Positionen)         | ADR-012                            |
| Produktionslogging mit Redaction, Error-Tracking, Security-Log      | ADR-011                            |
| Monatlicher Audit-Report; abgewiesene Zugriffe protokollieren       | ADR-010; DEVELOPMENT Einschränkung 6 und 7 |
| Ausfallkonzept (E2), Generator für synthetische Daten (E6)          | OPEN_DECISIONS                     |
| DSFA-Vorbedingungen: Verzeichnis der Verarbeitungstätigkeiten, TOM, Löschkonzept, Subprozessoren, Datenschutzinformationen, Betroffenenrechte, Breach-Prozess | ADR-007 — außerhalb des Codes, ohne Verantwortliche und Termin |
| Betroffenenrechte technisch: Auskunft und Export (Art. 15, 20 DSGVO) | ADR-007; IDEA-QSN-003 nur als Portalfunktion |
| Nachweistabelle MUSS-Anforderung → Test/Policy/Prüfschritt          | §0, §12                            |

Vorschlag: eine eigene Etappe **„G — Betriebsreife"** mit Zieltermin, in der
Roadmap zwischen Etappe 1 und Etappe 2 verankert, mit Spur-B-Fälligkeiten
rückwärts vom Termin.

**D. Querschnitt**

| Punkt                                  | Befund                                                                                                     | Vorschlag                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Mobile: PWA-Installierbarkeit          | §2.2 sagt „responsive Web-App/PWA"; ADR-015 verbietet nur Service Worker und Offline-Cache. Ein Manifest ohne Service Worker ist erlaubt und fehlt. | Entscheiden: Manifest jetzt (klein) oder mit Etappe 11.          |
| Offline (ADR-001)                      | Kein Roadmap-Eintrag, obwohl ADR-001 begrenzte Offline-Fähigkeit für Tagesplan und Entwürfe vorsieht.      | Eigener Loop nach Touren; ADR für den Mechanismus vorher.        |
| Barrierefreiheit                       | Nur als Portal-Abnahmekriterium (Etappe 4) genannt; die Praxis-Oberfläche wird schon heute mobil benutzt.  | Jetzt in die Abnahme-Checkliste, nicht erst Etappe 4.            |

### 4.3 Struktur und Pflege

1. **Kennung doppelt vergeben.** PAT-004 war die Listenfilterung (PR #1); die
   Roadmap nannte die Stammdaten-Ergänzung ebenfalls PAT-004. Heute in
   PAT-005 umbenannt.
2. **Spur B unvollständig** (siehe 2., Punkt 2). Die Roadmap sollte alle
   offenen Punkte mit „fällig vor" führen oder ausdrücklich sagen, welche
   nicht planungsrelevant sind.
3. **ADR-Folgefragen ohne Sammelstelle.** Beispiele mit Planungsrelevanz:
   Frontend-Hosting und `service_role`-Schutz (ADR-015), Begründung als
   Pflichtfeld und Azubi-Rolle (ADR-016), `location_id`-Durchsetzung
   (ADR-003), Rechtematrix (ADR-004). Vorschlag: je ADR-Folgefrage entweder
   ein Eintrag in `OPEN_DECISIONS.md` oder der Vermerk „nicht
   planungsrelevant" im ADR.
4. **`OPEN_DECISIONS.md` verschlanken.** Entschiedene Punkte auf eine Zeile
   in der Kopftabelle reduzieren (Punkt → ADR → was davon noch offen ist),
   Volltext nur für offene Punkte. Der Abschnitt „Vorgeschlagene Reihenfolge"
   ist Historie und kann entfallen — die Roadmap führt die Reihenfolge.
5. **`ROADMAP.md` verschlanken.** Die Herleitung der drei Scheduler-Wege
   (rund 60 Zeilen) ist in ANN-007 gesichert; die Routinedetails gehören
   nach `DEVELOPMENT.md`. Die Roadmap sollte wieder das sein, was ihr
   Kopftext verspricht: Reihenfolge, Voraussetzungen, Fortschritt.
6. **Vorschau ohne Plan.** Rund ein Drittel des Quelltexts ist Vorschau,
   in keiner Roadmap eingeordnet, aber mit eigenen Tests, Lint und Typecheck
   in jedem CI-Lauf. Entscheidung in Abschnitt 6.
7. **Ideenspeicher-Status.** Alle 58 Vorschläge wurden am 2026-09-01 en bloc
   auf `bestätigt` gesetzt. Der Status trägt damit wenig Information; das ist
   kein Fehler, sollte aber beim Lesen bekannt sein.
8. **`pnpm test:db` unter Windows.** Das Skript findet PostgreSQL nur unter
   `/usr/lib/postgresql`; auf Jannes' Rechner läuft das Gate deshalb nicht.
   CI und Cloud-Umgebung decken es ab; heute in `DEVELOPMENT.md` vermerkt.

### 4.4 In diesem Review bereits richtiggestellt

- `CLAUDE.md`, `docs/adr/README.md`: Prinzipien-Version 0.3 → 0.4.
- `README.md`: ADR-016, Ordnerstruktur (`docs/development`, `docs/decisions`,
  `docs/abnahme`), Verweis auf Roadmap und Arbeitsbereiche, kein erfundenes
  Modul `dashboard` mehr.
- `package.json`: totes Skript `db:apply` (verwies auf eine nicht vorhandene
  Datei) entfernt.
- `ROADMAP.md`: Version 0.4, PAT-004 → PAT-005, Fortschritt PAT-001 bis
  PAT-004, Scheduler existiert (Etappe 1a), Hinweis auf dieses Review vor dem
  nächsten Loop, Routine-Fallback als wirkungslos markiert.
- `ARBEITSBEREICHE.md`: erledigte „offene Punkte" (Finalisierung) und
  entfallene Ansichten (Personalakte, Teamverzeichnis) bereinigt, §6 durch
  einen Verweis auf die Roadmap ersetzt.
- `OPEN_DECISIONS.md`: E9 (Dokument-Governance) und die Normativität (§0)
  als erledigt markiert; offen bleibt nur die Nachweistabelle.
- `DEVELOPMENT.md`: Windows-Hinweis zu `test-db.sh`, feste CLI-Version und
  Postgres-17-Hinweis für den lokalen Stack.
- `PRODUCT_VISION.md` §6a, `IDEA-KOM-001`, `IDEA-KOM-007`, `IDEA-LZK-007`,
  `IDEA-QSN-010` (defekter Link): auf den Stand nach C2 und DOK-004 gebracht.
- `BillingPage.tsx` (Vorschau): Hinweis „wie finalisiert wird, ist noch
  nicht entschieden" durch den heutigen Stand ersetzt.

---

## 5. Löschkandidaten

| Was                                                                 | Befund                                                                                     | Empfehlung                                                        | Wer                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Remote-Branch `claude/new-session-4ysdqj`                           | vollständig in `main`, letzter Commit 31.08.                                               | **löschen**                                                       | Jannes (Befehl in Abschnitt 8) — diese Session darf nur ihren eigenen Branch pushen |
| Remote-Branch `claude/unpublished-changes-overview-l66mn5`          | vollständig in `main` (PR #10 bis #12)                                                     | **löschen**                                                       | Jannes (Abschnitt 8)                                                                |
| Lokale `claude/*`-Branches auf Jannes' Rechner                      | vermutlich Reste der zwölf PRs                                                             | **löschen**, sofern `git branch --merged main` sie listet         | Jannes (Abschnitt 8)                                                                |
| `package.json` → `db:apply`                                         | Skript existiert nicht                                                                     | gelöscht                                                          | erledigt                                                                            |
| `ARBEITSBEREICHE.md` §6 (zweite Reihenfolge)                        | veraltet, doppelt zur Roadmap                                                              | ersetzt durch Verweis                                             | erledigt                                                                            |
| `OPEN_DECISIONS.md` „Vorgeschlagene Reihenfolge" und Volltexte entschiedener Punkte | Historie, im Git-Log und in den ADRs gesichert                                   | auf Tabelle eindampfen                                            | Planungssession (Abschnitt 7)                                                       |
| `ROADMAP.md` DOK-004-Herleitung, Routinedetails                     | erledigt bzw. Betrieb, nicht Planung                                                       | kürzen, nach ANN-007 und `DEVELOPMENT.md` verweisen               | Planungssession                                                                     |
| Branch-Fallback im Prompt der Wochenroutine                         | zeigt auf gelöschten Branch                                                                | bei nächster Prompt-Änderung entfernen                            | Jannes über die Routines-Oberfläche oder eine Session                               |
| Vorschau-Module (≈ 8 200 Zeilen)                                    | kein Plan dahinter; gleichzeitig die einzige Beschreibung der Betrieb-Abläufe im Projekt    | **Entscheidung** (Abschnitt 6, Punkt 2)                           | Jannes                                                                              |
| Diese Datei                                                         | einmaliger Befund                                                                          | löschen, sobald eingearbeitet                                     | Planungssession                                                                     |

Nichts davon betrifft Tests, RLS-Policies, Migrationen oder CI-Gates. Es gibt
im Quelltext keine toten Module, keine `TODO`-Reste und keine unbenutzten
Skripte außer dem genannten.

---

## 6. Entscheidungen, die jetzt anstehen

Jede Frage ist so gestellt, dass sie mit einem Satz beantwortbar ist. Die
Empfehlung steht dabei; „Konsequenz" nennt, was die Antwort verändert.

1. **Reihenfolge in Etappe 1.** Option a: PAT-005 und VER-001 bis VER-003
   vor LOE und ABR. Option b: Roadmap wie heute (LOE, ABR, dann 1a).
   **Empfehlung a.** Konsequenz: der nächste Loop ist Verordnungen, nicht
   Löschung; die Abrechnung bekommt die Verordnung als Grundlage.
2. **Vorschau-Module.** Option a: behalten und als Spur „Betrieb" in die
   Roadmap aufnehmen (Reihenfolge wie 4.2 B); jede Vorschau wird in ihrem
   Loop durch die echte Anbindung ersetzt, keine neue Vorschau mehr.
   Option b: entfernen; die Abläufe vorher als Ideenspeicher-Datei
   `10-praxisbetrieb.md` sichern (Pannenassistent, Check-Up, Erstattungsweg
   sind dort als Text gut aufgehoben). **Empfehlung a, unter der Bedingung,
   dass die Spur Betrieb wirklich in die Roadmap kommt.** Wird sie nicht
   eingeplant, ist b sauberer: 8 200 Zeilen ohne Plan sind Wartungslast.
   Konsequenz: a kostet nichts sofort; b spart CI-Zeit und Aufmerksamkeit,
   verwirft aber die Arbeit aus PR #11.
3. **Zieltermin Produktivbetrieb.** Ein Quartal genügt. Konsequenz: Etappe G
   und die Vorlauf-Entscheidungen B1, B2, B9 bekommen ein Datum; ohne Termin
   bleibt Spur B unverbindlich.
4. **Dateiablage (E8) jetzt entscheiden.** Option a: ADR-017 in einer
   Docs-Session (Supabase Storage nach ADR-015 Punkt 10; signierte Verweise,
   Retention nach ADR-008, Virenprüfung erst bei Patienten-Uploads).
   Option b: bis Etappe 7 warten. **Empfehlung a**, weil VER-004, Belege und
   Anhänge davon abhängen. Konsequenz: eine Docs-Session, kein Code.
5. **Konten und Rollen.** Option a: STAFF-002 in der Anwendung (Einladung,
   Rolle, Sperre, Passwort zurücksetzen, MFA für `owner`). Option b: weiter
   über Supabase-Studio, dokumentiert als Betriebsanweisung. **Empfehlung
   a** — §4.2 macht das individuelle Konto zur Pflicht, und E11 löst sich
   damit fast von selbst. Konsequenz: ein Loop vor dem Produktivbetrieb.
6. **Terminstatus.** Option a: minimal — Status „nicht angetroffen" mit
   Ausfallhonorar-Kennzeichen, alles Weitere später. Option b: vollständiger
   Automat (angefragt, vorgemerkt, bestätigt, abgesagt, nicht angetroffen,
   durchgeführt, dokumentiert, abgerechnet). **Empfehlung a**, bevor ABR-002
   Leistungen an Termine bindet. Konsequenz: eine kleine Story CAL-008 und
   ein Eintrag in `OPEN_DECISIONS.md` D.
7. **Terminserien.** In die Roadmap als CAL-007 nach VER-001 aufnehmen?
   **Empfehlung ja.** Konsequenz: eine Story mehr in Etappe 1.
8. **Verschlankung der Planungsdokumente** (4.3, Punkte 2 bis 5) in einer
   eigenen Docs-Session. **Empfehlung ja**, direkt nach diesen Antworten und
   vor dem nächsten Feature-Loop. Konsequenz: eine Session ohne Code.

---

## 7. Vorschlag: Roadmap 2.0

Ein Dokument, drei Spuren zum Bauen, eine zum Entscheiden. Jede Etappe hat
ein Ergebnis in einem Satz, das die Praxis merkt.

```
Spur A — Bauen
  A1 Kernprozess     PAT-005 → VER-001..003 → LOE-001, LOE-002 → CAL-007 Serien
                     → CAL-008 Status → ABR-000 Praxisdaten → ABR-001..004
                     → VER-004 (nach ADR-017) → FRB-001..004 → DOK-005 Bericht
                     → UEB-001..004 → Etappen 4 bis 10 wie heute
  A2 Praxisbetrieb   URL-001 Urlaub → ZK-001 Zeitkonto (nach B6-Annahme)
                     → FLT-001..003 Flotte, Schlüssel, Check-Up, Panne
                     → ERS-001 Erstattungen (nach ADR-017) → TEAM-001 Chat
                     → TOUR-001 (nach B7)
  A3 Betriebsreife   STAFF-002 Konten → OPS-001 Providerprüfung und Cloudprojekt
     (Etappe G)      → OPS-002 Deployment mit Freigabe → OPS-003 Backup/Restore-Test
                     → OPS-004 Logging und Redaction → OPS-005 Audit-Report
                     → DSFA-Vorbedingungen als Checkliste mit Verantwortlichen
Spur B — Entscheiden
  Vollständige Tabelle: B1, B2, B5 bis B11, C6, C7, D „bestätigt", E2, E6,
  E8 (→ ADR-017), E10, E11 und die planungsrelevanten ADR-Folgefragen —
  je mit „fällig vor" und rückwärts vom Zieltermin terminiert.
Raus aus der Roadmap
  DOK-004-Herleitung → ANN-007 · Routinedetails → DEVELOPMENT.md
  · Ist-Stand → Fortschrittstabelle statt Fließtext
```

Die Spuren A1 bis A3 laufen abwechselnd, nicht parallel: ein Loop pro Woche,
und die Roadmap sagt, welche Spur dran ist. Faustregel: nach zwei Loops in A1
einer aus A2 oder A3, damit Praxisbetrieb und Betriebsreife nicht wieder
liegen bleiben.

Aufruf für die Planungssession (Docs, Sonnet 5, `medium`):

```
Roadmap 2.0 nach docs/development/PLANUNGSREVIEW-2026-09-05.md: Antworten
zu Abschnitt 6 einarbeiten, drei Spuren anlegen, Spur B vervollständigen,
OPEN_DECISIONS.md verschlanken, Review-Datei danach löschen. Kein Code.
```

---

## 8. Lokale Umgebung nachziehen (Windows, Git Bash)

Alles im Projektverzeichnis. Voraussetzung: `git status` ist sauber; sonst
vorher committen oder `git stash`.

**1. Git auf den Stand von `main` bringen und Altlasten löschen**

```bash
git fetch origin --prune
git checkout main
git pull --ff-only origin main
git branch --merged main            # zeigt lokale Branches, die in main enthalten sind
git branch -d <branchname>          # für jeden gelisteten claude/*-Branch
git push origin --delete claude/new-session-4ysdqj claude/unpublished-changes-overview-l66mn5
```

Der Review-Branch dieser Session heißt `claude/project-structure-review-5ule84`;
zum Ansehen vor dem Merge: `git checkout claude/project-structure-review-5ule84`.

**2. Abhängigkeiten**

```bash
pnpm --version                      # 10.x erwartet (package.json: pnpm@10.33.0)
pnpm install --frozen-lockfile
```

**3. Supabase-Stack neu aufsetzen** (Docker Desktop läuft)

`config.toml` verlangt Postgres 17, und die Migrationen seit dem letzten
lokalen Stand registrieren `pg_cron`. Ein alter Stack wird deshalb verworfen —
er enthält nur synthetische Daten.

```bash
pnpm dlx supabase@2.116.0 stop --no-backup
pnpm dlx supabase@2.116.0 start
pnpm dlx supabase@2.116.0 db reset
pnpm dlx supabase@2.116.0 status    # API URL und anon key
```

**4. `.env.local` prüfen**

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key aus supabase status>
```

**5. Anwendung starten und prüfen**

```bash
pnpm dev                            # http://127.0.0.1:5173
```

Anmelden als `jannes.test@praxis.invalid` mit `LokalerTestzugang!2026`.
Sichtprüfung: „Patient:innen → Max Mustermann" zeigt die Dokumentation in der
Akte (DOK-003); „Betrieb → Arbeitszeiten" zeigt unter dem Praxisraster die
Frist der automatischen Finalisierung (DOK-004). In Supabase Studio
(`http://127.0.0.1:54323`, SQL-Editor) bestätigt
`select jobname, schedule from cron.job;` den Job
`finalize-overdue-treatment-notes` mit `*/15 * * * *`.

**6. Prüfungen, die lokal laufen**

```bash
pnpm lint && pnpm typecheck && pnpm test
export E2E_SUPABASE_URL=http://127.0.0.1:54321
export E2E_SUPABASE_ANON_KEY=<anon key>
pnpm test:e2e
```

`pnpm test:db` läuft unter Windows nicht (Abschnitt 4.3, Punkt 8); es läuft
in CI und in der Cloud-Umgebung. Die Abnahmeschritte je Feature stehen in
`docs/abnahme/`.

---

## 9. Reihenfolge der nächsten Schritte

1. Diesen Branch ansehen, mergen (PR oder lokal), Branches löschen
   (Abschnitt 8, Schritt 1).
2. Die acht Fragen aus Abschnitt 6 beantworten — ein Satz je Frage reicht.
3. Planungssession „Roadmap 2.0" (Abschnitt 7). Danach ist diese Datei
   überflüssig.
4. Das Montags-Wochenupdate bis dahin als vorläufig lesen: es nennt nach der
   heutigen Tabelle LOE-001 als nächsten Loop.
5. Erst danach der nächste `/feature-loop`.
