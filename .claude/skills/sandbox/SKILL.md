---
name: sandbox
description: Pfad S des Graph-Engineering-Workflows - ein Oberflächen-Prototyp mit synthetischen Daten in src/features/preview, technisch ohne Server, Netz und Persistenz, mit Härtungs-Ticket als Eingabe für den Feature-Loop. Nur auf ausdrücklichen Aufruf mit /sandbox <Thema>, /sandbox <Thema> übernehmen oder /sandbox <Thema> verwerfen.
disable-model-invocation: true
---

# Sandbox

Ablauf und Regeln für **einen Prototyp** der Oberfläche. Er zeigt, wie etwas
aussehen und sich anfühlen könnte — er entscheidet nichts, speichert nichts
und begründet keinen Scope. Knoten, Lebensdauer und Grenzen von Pfad S stehen
in `docs/development/GRAPH-ENGINEERING-WORKFLOW.md`; die Regeln dazu hier.

**Einstieg nach Aufruf:** `/sandbox <Thema>` läuft S1 bis S4 und endet mit
der Frage an Jannes. `/sandbox <Thema> übernehmen` sucht die Zeile des
Prototyps in `docs/development/ARBEITSBEREICHE.md` §2 und läuft nur S5.
`/sandbox <Thema> verwerfen` läuft nur S6.

**Zuerst K1 prüfen** (`GRAPH-ENGINEERING-WORKFLOW.md`, „K1 — Klassifikation").
Maßgeblich ist der **Diff dieser Session**, nicht die echte Funktion, die es
einmal geben könnte: Berührt er einen Auslöser aus ADR-013 Fassung 2,
Punkt 9 (Migration, Policy, RPC, Auth, Audit, Retention, Rechnung,
Außenverbindung, personenbezogene Daten) — oder soll ein Wert die Sitzung
überleben —, dann ist
es **Pfad A**: stoppen und `/feature-loop` vorschlagen, nichts bauen.
Synthetische Anzeigedaten im Prototyp sind kein personenbezogenes Feld. Ein
von der Roadmap zurückgestelltes Thema darf prototypisiert werden; S1 nennt
die Zurückstellung. Fehlt eine Entscheidung aus der Hard-Stop-Liste (§15.1):
Frage mit Optionen, Empfehlung und Konsequenzen stellen, nichts davon
Abhängiges bauen.

**Was gelesen wird:** `docs/development/ARBEITSBEREICHE.md`, die
Oberflächen-Checkliste in `docs/abnahme/README.md`, **eine** passende
Ideen-Datei aus `docs/product/ideen/` (Index in `IDEENSPEICHER.md`). Keine
ADRs außer ADR-015 und ADR-011.

---

## S1. SKIZZE

In wenigen Zeilen festhalten:

- **Ziel** — welche Frage der Prototyp beantworten soll, in einem Satz
- **Rolle** — aus wessen Sicht (`owner`, `office`, `therapist`)
- **Ablauf** — die drei bis fünf Schritte, die gezeigt werden
- **Seed-Personen** — synthetisch, im Muster von `demodaten` (erfundene
  Namen, `@praxis.invalid`); nie echte
- **Ersetzt durch** — die Roadmap-Kennung des Loops, der die echte Funktion
  bauen würde, falls sie schon eine hat; sonst „ohne" oder die
  Zurückstellung (zum Beispiel „Stufe 2, `IDEA-PRX-003`")

Kein Datenmodell, keine Rechtematrix, keine Annahme. Was danach aussieht,
kommt ins Härtungs-Ticket (S5).

## S2. BAUEN

- Ort: `src/features/preview/<thema>/`, Route `/vorschau/<thema>` in
  `src/routes/AuthenticatedRoutes.tsx`, Link von „Alle Bereiche"
  (`src/app/BereichePage.tsx`); in der Navigation höchstens mit
  `vorschau: true`. Unter diesem Ort ist der Prototyp von
  `src/features/preview/trennung.test.ts` automatisch erfasst; nur ein Ort
  außerhalb müsste dort in `VORSCHAUBEREICHE` stehen.
- Zustand nur über `VorschauProvider` (`simuliere`, `zuruecksetzen`). Der
  Prototyp darf `Vorschauzustand` um ein eigenes Feld `<thema>` erweitern
  und eigene synthetische Personen in `<thema>/demodaten.ts` anlegen.
  Jede Aktion meldet, was übernommen wurde **und was ausdrücklich nicht
  passiert ist**. Jede Seite trägt den Hinweis „noch keine echte
  Speicherung".
- Je simulierter Aktion ein Test in `<thema>/ehrlichkeit.test.tsx` nach dem
  Muster von `src/features/preview/ehrlichkeit.test.tsx`
  (`renderMitVorschau` aus `src/test-utils.tsx`): Die Meldung nennt, was
  nicht passiert ist, und behauptet keinen Erfolg.
- Nur Bausteine aus `src/components/ui` und Tokens aus `src/index.css`;
  fehlt ein Baustein, wird er dort angelegt — nur, wenn der Prototyp ihn
  braucht.
- **Nicht:** neue Abhängigkeit, Migration, eigene `api.ts`, Importe aus
  `src/features/*/api.ts` (außer reinen Hilfsfunktionen, die
  `trennung.test.ts` erlaubt) oder `src/lib/supabase`, Änderung an Rollen,
  Audit, RLS, an einem echten Bereich oder an einer bestehenden
  Vorschauroute aus `ARBEITSBEREICHE.md` §2 (die bleiben eingefroren; gemeint
  sind diese Routen, nicht das Gerüst `VorschauProvider`).

Ein Commit für den Prototyp.

## S3. SANDBOX-GATE

Mindestens:

```bash
pnpm test src/features/preview        # trennung.test.ts, ehrlichkeit.test.tsx, <thema>/
pnpm typecheck
pnpm lint
pnpm format:check
```

Dazu die Oberflächen-Checkliste aus `docs/abnahme/README.md` Punkt für Punkt.
Für die laufende Anwendung bei **375 px** und 1280 px:

```bash
pnpm dev                                                   # zweites Terminal
pnpm screenshots --konto=<rolle> /vorschau/<thema>
pnpm screenshots --breite=1280 --konto=<rolle> /vorschau/<thema>
```

Das braucht den lokalen Supabase-Stack. In der Cloud-Umgebung gibt es ihn
nicht: Dann wird Punkt 1 der Oberflächen-Checkliste im Komponententest
geprüft (kein horizontales Überlaufen bei 375 px), `pnpm screenshots` im
Bericht als nicht gelaufen genannt, und die Bilder entstehen bei der Schau
auf Jannes' Rechner.

Rot heißt zurück nach S2 — auch, wenn eine simulierte Aktion keinen
Ehrlichkeitstest hat. `trennung.test.ts` wird **niemals** angepasst, um grün
zu werden; ein Treffer dort bedeutet, dass das Thema Pfad A ist.

## S4. SCHAU

- In `docs/development/ARBEITSBEREICHE.md` §2 unter „Sandbox-Prototypen"
  eine Zeile eintragen: Thema, Route, Angelegt (Datum), Ersetzt durch,
  Härtungs-Ticket („—" bis S5).
- Je nach Befund: Zeile in `docs/development/BEFUNDE.md` (korrigiert
  Gebautes) oder Eintrag als `vorschlag` in der einen Ideen-Datei (zeigt
  Fehlendes).
- Bildschirmfotos, falls entstanden, im Bericht mit Pfad nennen
  (`.tmp/screenshots/` ist nicht versioniert; Jannes sieht sie lokal).

Jannes klickt am eigenen Rechner und entscheidet: **übernehmen** (S5) oder
**verwerfen** (S6). Die Session endet nach dem Bericht.

## S5. HÄRTUNGS-TICKET

Nur auf `/sandbox <Thema> übernehmen`. Datei
`docs/development/sandbox/<thema>.md` mit:

1. Ziel und Ablauf aus S1, Route, Datum der Schau
2. **Daten** — welche Felder die echte Funktion bräuchte, welche davon
   personenbezogen wären, welche Datenklasse und Frist naheliegt (ADR-008)
3. **Rechte** — welche Rollen lesen, welche schreiben (ADR-004)
4. **Audit** — welche Ereignisse auditpflichtig wären (ADR-010)
5. **Offene Fragen** — was eine Entscheidung von Jannes braucht, was eine
   Annahme sein könnte
6. **Was der Prototyp nicht zeigt** — Fehlerfälle, Offline, Rollen ohne Recht

Den Pfad des Tickets in die Zeile in `ARBEITSBEREICHE.md` §2 eintragen. Das
Ticket ist die SPEC-Eingabe für `/feature-loop`; es entscheidet nichts und
importiert keinen Scope. Zurück nach K1. Ein Commit.

## S6. LÖSCHEN

Auf `/sandbox <Thema> verwerfen` oder nach Ablauf der Lebensdauer
(Graph-Engineering-Workflow, Pfad S): Verzeichnis, Route, Link, gegebenenfalls
die Zeile in `VORSCHAUBEREICHE` und die Zeile in `ARBEITSBEREICHE.md` §2
entfernen; Befund oder Idee bleiben. Ein Commit. Ersetzt ein Loop den
Prototyp, ist das Austragen dessen erste Story.

## Bericht und Stopp

1. Thema, Route, Commit
2. Gelaufene Prüfungen mit Ergebnis; nichts als gelaufen melden, was nicht lief
3. Bildschirmfotos (Pfade) oder der Hinweis, dass sie bei der Schau entstehen
4. Registereinträge (ARBEITSBEREICHE, BEFUNDE oder Ideenspeicher)
5. Was der Prototyp offen lässt
6. Die Frage an Jannes: `/sandbox <Thema> übernehmen` oder
   `/sandbox <Thema> verwerfen`
7. Update-Schritte: `git pull origin <branch>`

**Danach stoppen.** Kein Härtungs-Ticket und kein Feature-Loop ohne
ausdrückliches „übernehmen".
