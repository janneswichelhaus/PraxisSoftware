---
name: bereich
description: Große Bereichsüberholung - Bestand, Referenzabgleich, Arbeitsablauf-Spec mit Tipp-Budgets, Vorher-Bildstrecke, Fundament seriell mit test:db und Sicherheits-Reviewer, Oberfläche parallel nach DESIGN.md, Integration, Prüfschleife mit Design- und Praxis-Reviewer, eine PR mit Bildstrecke. Nur auf ausdrücklichen Aufruf mit /bereich <Bereich>.
disable-model-invocation: true
---

# Bereich

Der Standard für große Schritte (`CLAUDE.md`, „Arbeitsweise“): **ein Bereich, ein Branch, eine
PR**, ohne Zwischenstopp. Die Agentenschritte bleiben klein (eine Route, eine Story, ein Test), die
Lieferung an Jannes ist groß. Seriell, was zusammenhängt (Daten, Rechte); parallel, was unabhängig
ist (Seiten). Belege statt Behauptungen: Jede Aussage im Bericht zeigt auf ein Bild oder einen
Testlauf.

Anhalten nur nach `CLAUDE.md` (Stoppliste, drei erfolglose Reparaturen derselben Ursache, voller
Kontext). Eine offene Frage stoppt nur ihren Teil; alles Unabhängige wird fertig.

## 0. Bestand

- `git fetch origin --prune`, `git branch -r`, offene PRs: nichts bauen, was schon liegt.
- Routen des Bereichs aus `src/routes/AuthenticatedRoutes.tsx`, Rollen, vorhandene Tests;
  `docs/development/ARBEITSBEREICHE.md` (Vorschaubereiche werden ersetzt, nicht daneben gebaut).
- Offene Befunde des Bereichs aus `docs/development/BEFUNDE.md` — **alle**, sie werden Stories.
- Betroffene Kernabläufe aus `docs/product/kernablaeufe.md` mit heutiger Tippzahl.

## 1. Referenzabgleich (Subagenten, parallel)

Zwei bis vier Recherche-Agenten, je ein Produktfeld: Verwaltung, Kalender, Abrechnung (iPrax,
THEORG, thevea, appointmed, Jane, Cliniko); Übungen (Physitrack, MedBridge); Tour und Hausbesuch.
Grundlage: `docs/product/ideen/referenz-*.md`, Websuche, Jannes' iPrax-Bilder **nur mit
Demodaten**. Ergebnis je Agent: Paritätsmatrix (Funktion · Referenz · wir · bewusst nicht · anders
wegen Hausbesuch/Lastenrad) und **Schrittzahlen** der Abläufe. Übernommen werden Abläufe und
Schrittzahlen, **nie** Texte, Bilder, Symbole oder Benennungen. Ein Prüfer verwirft unbelegte
Behauptungen.

## 2. Arbeitsablauf-Spec (höchstens zwei Seiten, oben in die PR-Beschreibung)

Sie ist die Spezifikation des Auftrags (Rang 3) und enthält:

- **Ziel** in einem Satz; **3–6 Szenarien** aus Jannes' Tag (z. B. „7:40, sechs Hausbesuche,
  Regen, eine Absage“), je Auslöser → Schritte → fertig.
- **Tipp-Budget** je Ablauf (vorher gezählt → Ziel), aus `kernablaeufe.md` oder begründet neu.
- **Akzeptanzkriterien** prüfbar formuliert („Wenn … dann zeigt …“); je Kernablauf ein
  Playwright-Ablauftest bei 375 px, der Tipps zählt, auf Seed-Daten.
- **Startinhalte** im Lieferumfang (Bibliothek, Vorlagen, Textbausteine, Preisblatt-Entwurf).
- **Out of Scope**, **K1-Ergebnis**, betroffene ADRs (Index in `CLAUDE.md`, dann ganz lesen).
- **Annahmen** nur, wo Spec, Prinzipien und ADRs schweigen: `ANN-NNN`, ≤ 1 KB, Anker im Code.

MDR-Grenze (ADR-006 Punkt 10): Katalog und Auswahl ja, Empfehlung nach Diagnose nie.

## 3. Vorher-Bildstrecke

Cloud-Stack mit `reset --reich` und `pnpm dev` (`CLAUDE.md`, „Cloud-Umgebung“), dann
`pnpm bildstrecke --nur=<Bereich>` (375 und 1280 px, je Konto; Kontaktbogen und `ergebnis.json` in
`.tmp/bildstrecke/<Zeit>/`, Optionen in `docs/DEVELOPMENT.md`, „Bildstrecke“). Bilder selbst
ansehen (Read-Tool). Was schon jetzt gegen `docs/design/DESIGN.md` oder ein Budget verstößt, kommt
in die Lückenliste.

## 4. Fundament (seriell, ein Agent)

Nur wenn K1 Pfad A ergibt: Migrationen, Policies, RPCs, Seed — Story für Story, je ein Commit.

- `pnpm test:db` gezielt auf die betroffenen Dateien (`grep -l <name> supabase/tests`), dazu die
  Gegenprobe ohne Migration; die volle Suite läuft in der CI.
- Review-Checkliste aus ADR-013 Punkt 9 je Punkt; ein roter Punkt geht zurück in den Bau.
- **Zweitreview** in frischem Kontext durch `.claude/agents/sicherheits-reviewer.md` (nur Diff
  und Checkliste), wo Nr. 8 es verlangt — vor dem Merge, vor der Oberfläche.

## 5. Oberfläche (parallel in Worktrees)

Ein Agent je Routengruppe (`isolation: worktree`, eigener Dev-Port). Auftrag je Agent: Routen,
`docs/design/DESIGN.md` (einzige Seitenrezeptur), die Budgets der Spec, die Bausteine aus
`src/components/ui`. Die **Angleichung aller Seiten des Bereichs** ist beauftragt. Fehlt ein
Baustein, entsteht er in `src/components/ui`, nicht in der Seite. Je Agent: Lint, Typecheck,
betroffene Tests; höchstens drei Reparaturversuche je Ursache, sonst als offen markieren.

## 6. Integration (ein Agent)

Zusammenführen, Konflikte lösen, **Duplikate entfernen** (zwei Bausteine für dasselbe → einer).
Danach der volle Prüfsatz aus `CLAUDE.md` („Befehle“), `pnpm build` und die betroffenen
`pnpm test:e2e` — ohne und hinter der Anmeldung gegen den Cloud-Stack, vorher `reset` ohne
`--reich`.

## 7. Prüfschleife (höchstens drei Runden)

1. Nachher-Bildstrecke, dieselben Routen und Breiten wie in Schritt 3, mit
   `--vergleich=<Ordner von vorher>` (schreibt `vergleich.html`).
2. Deterministisch: `ergebnis.json` ohne Befund (Querrollen, Konsolenfehler, 4xx/5xx, Zielseite,
   leere Seite), dazu axe, Ziele ≥ 44 px und Kontrast aus den Tests.
3. `.claude/agents/design-reviewer.md` (Bilder + Diff gegen DESIGN.md) und
   `.claude/agents/praxis-reviewer.md` (Tipps je Kernablauf gegen das Budget) parallel.
4. Es zählen nur Befunde zu Korrektheit, DESIGN.md-Regeln und Budgets; alles andere geht als
   Vorschlag in den Bericht (Reviewer erzeugen sonst Überbau). Beheben, dann nächste Runde.

## 8. Eine PR

Gegen `main`, kein Merge. Oben, in dieser Reihenfolge:

1. **Bildstrecke** vorher/nachher (Kontaktbogen, die Bilder der berührten Routen).
2. Kernabläufe mit **Tipps vorher → nachher**.
3. **Höchstens fünf Fragen**, je mit Empfehlung und Folge („wie empfohlen“ reicht als Antwort).
4. Höchstens fünf Sichtungspunkte, die eine Hand am Gerät brauchen (Kamera, Passkey, Flugmodus,
   Sonne, Halterung).

Darunter eingeklappt (`<details>`): Spec, Prüfungen mit Ergebnis (nur, was lief), ADR-013-
Checkliste und Zweitreview, Annahmen je ein Satz. Dazu die übrigen Doku-Pflichten:
`fortschritt.json` + `pnpm fortschritt --schreiben`, STATUS in drei Zeilen, erledigte Befunde
nach `docs/development/archiv/BEFUNDE-ERLEDIGT.md`.

## 9. Sichtung durch Jannes (~10 Minuten)

Jannes wischt die Bildstrecke durch, beantwortet die Fragen und mergt. Befunde daraus werden die
erste Story der nächsten Überholung desselben Bereichs (`/sichtung` trägt sie ein). Nennt der
Auftrag mehrere Bereiche, geht es danach mit dem nächsten weiter.
