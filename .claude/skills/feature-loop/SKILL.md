---
name: feature-loop
description: Einzelauftrag an Datenmodell oder Rechten (Pfad A) - K1, Spec, Story für Story bauen, gezielt verifizieren (test:db, Bildstrecke), Review mit Checkliste aus ADR-013 Punkt 9 und Zweitreview, eine PR. Nur auf ausdrücklichen Aufruf mit /feature-loop <Auftrag>.
disable-model-invocation: true
---

# Feature-Loop

Für einen Auftrag, der kein ganzer Bereich ist: ein Epic, eine Liste von Epics oder gebündelte
Befunde. Große Bereichsüberholungen laufen über `/bereich`. Inhaltliche Regeln stehen in
`CLAUDE.md`, den Prinzipien und den ADRs; hier nur Reihenfolge und Abbruch. Der Loop läuft ohne
Zwischenstopp bis zur PR; anhalten nur nach `CLAUDE.md` (Stoppliste, drei erfolglose Reparaturen
derselben Ursache, voller Kontext).

## K1. Klassifikation

In einem Satz nennen: Berührt der Diff einen Auslöser aus ADR-013 Punkt 9 (Liste nur dort), ist
er **Pfad A** — Checkliste, gezieltes `pnpm test:db`, Zweitreview wo Nr. 8 es verlangt,
`/effort xhigh`. Sonst gelten die Standardprüfungen.

## A. Spec (kurz, in die PR-Beschreibung)

- **Ziel** in einem Satz; **Stories** (`<KÜRZEL>-NNN`), je ein vertikaler Schnitt von der
  Datenbank bis zur Oberfläche, nach Abhängigkeit geordnet.
- **In/Out of Scope**; prüfbare **Akzeptanzkriterien** je Story.
- **Sicherheit und Datenschutz:** Rollen, Sichtbarkeit, Audit (nur nach ADR-010), Datenminimierung,
  Datenklasse und Frist neuer Tabellen.
- **ADRs** nach dem Index in `CLAUDE.md`, nur diese ganz lesen; betroffene Kernabläufe aus
  `docs/product/kernablaeufe.md` mit Budget, wenn Oberfläche dabei ist.
- **Befunde** des Bereichs aus `docs/development/BEFUNDE.md` als erste Stories.
- **Annahmen** nur, wo Spec, Prinzipien und ADRs schweigen: recherchieren (Projektdokumente,
  Gesetz, Behördenleitlinien), entscheiden, `ANN-NNN` ≤ 1 KB mit Anker. Technische Details
  (Benennung, Query-Form, Komponenten) sind keine Annahmen.

Es wird nicht auf eine Freigabe gewartet.

## B. Build

Story für Story, je ein Commit mit Migration, Policy, RPC, Oberfläche, Tests und Annahmen. Dazu
gehört, was die Akzeptanzkriterien brauchen (Seed, Testkonto, Datenklasse, Startinhalte); nicht
dazu gehört, was ein eigenes Epic wäre. Oberfläche nur nach `docs/design/DESIGN.md`. Erst die
vermutete Stelle öffnen, dann gezielt suchen; Subagenten für breite Suche erlaubt.

## C. Verify

- **Je Story** nur das eng Betroffene: einzelne Testdatei, `pnpm typecheck`, bei Migrationen
  `pnpm test:db supabase/tests/<datei>` (Cloud: `pnpm db:start`, `TEST_DATABASE_URL` und Test in
  einem Aufruf). Welche Dateien eine Funktion prüfen: `grep -l <name> supabase/tests`.
- **Am Ende** einmal: der Prüfsatz aus `CLAUDE.md` („Befehle“), `pnpm kommentare:check` und
  `pnpm build`; alle Testdateien, die eine geänderte Funktion, Policy oder Tabelle prüfen, dazu die
  Gegenprobe ohne Migration. Die volle `test:db`-Suite läuft in der CI.
- **Oberfläche:** Cloud-Stack und `pnpm bildstrecke` vorher/nachher bei 375 und 1280 px, Bilder
  selbst ansehen; betroffene `pnpm test:e2e`.
- Keine identischen teuren Läufe ohne Änderung dazwischen. Was aus Umgebungsgründen nicht lief,
  heißt „nicht gelaufen“.

## D. Review

Den eigenen Diff (`git diff main...HEAD`) prüfen auf Akzeptanzkriterien, ADR-Konformität, RLS statt
UI-Prüfung, Datenminimierung, verständliche Fehler ohne interne Details, fehlende Negativtests,
Secrets oder sensible Logs, unnötigen Scope; bei Oberfläche die Prüfliste in DESIGN.md und das
Budget (`.claude/agents/design-reviewer.md`, `.claude/agents/praxis-reviewer.md`).

**Pfad A:** die Review-Checkliste aus ADR-013 Punkt 9 je Story Punkt für Punkt; „entfällt“ nur mit
Begründung. Ein roter Punkt geht zurück in den Build, nie als „bekannte Einschränkung“ in die PR.
Verlangt Nr. 8 einen **Zweitreview**, läuft `.claude/agents/sicherheits-reviewer.md` in frischem
Kontext mit nur Diff und Checkliste, vor dem Merge. Geht das nicht, nennt die PR ihn als ausstehend;
Jannes mergt erst danach.

Konkrete Fehler selbst beheben und gezielt erneut prüfen. Gates werden **nie** abgeschwächt.

## E. PR und Bericht

Push, PR gegen `main`, kein Merge. Die PR-Beschreibung trägt Spec, Bilder, Prüfungen mit Ergebnis,
Checkliste und Zweitreview, Annahmen je ein Satz und höchstens fünf Fragen mit Empfehlung. Dazu
`fortschritt.json` (`status`, `fertig_am`, `nachweis`) mit `pnpm fortschritt --schreiben`, STATUS in
drei Zeilen, behobene Befunde aus `docs/development/BEFUNDE.md` löschen;
`pnpm docs:check` grün. Der Bericht im Chat ist der PR-Link plus Fragen und der Vorschlag für den
nächsten Auftrag; lokale Schritte als Fußnote.
