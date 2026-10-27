---
name: bereich
description: Große Bereichsüberholung - Bestand, Referenzabgleich, Arbeitsablauf-Spec mit Tipp-Budgets, Vorher-Bildstrecke, Fundament seriell mit test:db und Sicherheits-Reviewer, Oberfläche parallel nach DESIGN.md, Integration, Prüfschleife mit Design- und Praxis-Reviewer, eine PR mit Bildstrecke. Nur auf ausdrücklichen Aufruf mit /bereich <Bereich>.
disable-model-invocation: true
---

# Bereich

Der Standard für große Schritte (`CLAUDE.md`, „Arbeitsweise“): **ein Bereich, ein Branch, eine
PR**, ohne Zwischenstopp (ein Fundament, das für sich einen Zweitreview braucht: eine PR je Epic).
Kleine Agentenschritte, große Lieferung; seriell, was zusammenhängt (Daten, Rechte), parallel, was
unabhängig ist (Seiten). Jede Aussage im Bericht zeigt auf ein Bild oder einen Testlauf. Anhalten
nur nach `CLAUDE.md`; eine offene Frage stoppt nur ihren Teil, alles Unabhängige wird fertig.

## 0. Bestand und Referenzabgleich

- Nichts bauen, was schon liegt (`CLAUDE.md`). Routen (`src/routes/AuthenticatedRoutes.tsx`),
  Rollen, Tests; **alle** offenen Befunde des Bereichs aus `docs/development/BEFUNDE.md` werden
  Stories; die Kernabläufe aus `docs/product/kernablaeufe.md` mit heutiger Tippzahl.
- Zwei bis vier Recherche-Agenten parallel, je ein Produktfeld: Verwaltung, Kalender, Abrechnung
  (iPrax, THEORG, thevea, appointmed, Jane, Cliniko); Übungen (Physitrack, MedBridge); Tour und
  Hausbesuch. Grundlage: Websuche, Jannes' iPrax-Bilder **nur mit Demodaten**, die Referenzen bis
  2026-10-27 (`git show 9452575:docs/product/ideen/referenz-iprax.md`, ebenso `-navigation`,
  `-slack`, `-wettbewerb`). In die PR: Paritätsmatrix (Funktion · Referenz · wir · bewusst nicht ·
  anders wegen Hausbesuch/Lastenrad) und **Schrittzahlen**, übernommen nur diese, **nie** Texte,
  Bilder, Symbole oder Benennungen; ein Prüfer verwirft unbelegte Behauptungen.

## 1. Arbeitsablauf-Spec (höchstens zwei Seiten, oben in die PR; Rang 3)

- **Ziel** in einem Satz; **3–6 Szenarien** aus Jannes' Tag (z. B. „7:40, sechs Hausbesuche,
  Regen, eine Absage“), je Auslöser → Schritte → fertig.
- **Tipp-Budget** je Ablauf (vorher gezählt → Ziel), aus `kernablaeufe.md` oder begründet neu;
  **Akzeptanzkriterien** prüfbar („Wenn … dann zeigt …“), je Kernablauf ein Playwright-Ablauftest
  bei 375 px, der Tipps zählt, auf Seed-Daten.
- **Startinhalte**, **Out of Scope**, **K1-Ergebnis**, betroffene ADRs (Index in `CLAUDE.md`, dann
  ganz), **Annahmen** nach `CLAUDE.md`; MDR-Grenze (ADR-006 Punkt 10): Katalog und Auswahl ja,
  Empfehlung nach Diagnose nie.

## 2. Bauen

1. **Vorher-Bildstrecke:** Cloud-Stack mit `reset --reich` und `pnpm dev` (`CLAUDE.md`,
   „Cloud-Umgebung“), `pnpm bildstrecke --nur=<Bereich>` (Optionen: `docs/DEVELOPMENT.md`), Bilder
   selbst ansehen; was gegen `docs/design/DESIGN.md` oder ein Budget verstößt, in die Lückenliste.
2. **Fundament** (nur Pfad A, seriell, ein Agent, fertig vor der Oberfläche): Migrationen,
   Policies, RPCs und Seed Story für Story nach `/feature-loop` (Pflichten je Tabelle und
   Portalsicht, gezieltes `pnpm test:db`, Checkliste, Zweitreview, wo Nr. 8 es verlangt).
3. **Oberfläche** (parallel, ein Agent je Routengruppe, `isolation: worktree`, eigener Dev-Port):
   Routen, `DESIGN.md` als einzige Seitenrezeptur, Budgets der Spec, Bausteine aus
   `src/components/ui`; die **Angleichung aller Seiten des Bereichs** ist beauftragt. Ein fehlender
   Baustein entsteht in `src/components/ui`, nicht in der Seite. Je Agent Lint, Typecheck,
   betroffene Tests; höchstens drei Reparaturversuche je Ursache, sonst als offen markieren.
4. **Integration** (ein Agent): zusammenführen, Konflikte lösen, **Duplikate entfernen** (zwei
   Bausteine für dasselbe → einer); Prüfsatz aus `CLAUDE.md`, `pnpm build` und die betroffenen
   `pnpm test:e2e` ohne und hinter der Anmeldung (vorher `reset` ohne `--reich`).

## 3. Prüfschleife (höchstens drei Runden)

Nachher-Bildstrecke mit denselben Routen und Breiten und `--vergleich=<Ordner von vorher>`;
`ergebnis.json` ohne Befund, dazu axe, Ziele ≥ 44 px und Kontrast aus den Tests; aus
`.claude/agents/` `design-reviewer` (Bilder und Diff gegen DESIGN.md) und `praxis-reviewer` (Tipps
je Kernablauf gegen das Budget) parallel. Es zählen nur Befunde zu Korrektheit, DESIGN.md-Regeln und
Budgets; alles andere geht als Vorschlag in den Bericht (Reviewer erzeugen sonst Überbau). Beheben,
dann nächste Runde.

## 4. Eine PR und die Sichtung

Branch auf `main` bringen, PR gegen `main`, kein Merge. Oben: **Bildstrecke** vorher/nachher
(Kontaktbogen, berührte Routen), Kernabläufe mit **Tipps vorher → nachher**, **höchstens fünf
Fragen** mit Empfehlung und Folge, höchstens fünf Sichtungspunkte, die eine Hand am Gerät brauchen
(Kamera, Passkey, Flugmodus, Sonne, Halterung). Eingeklappt (`<details>`): Spec, Prüfungen mit
Ergebnis (nur, was lief), ADR-013-Checkliste und Zweitreview, Annahmen je ein Satz; übrige
Doku-Pflichten nach `CLAUDE.md`. Jannes wischt die Bildstrecke durch (etwa zehn Minuten), antwortet
(„wie empfohlen“ reicht) und mergt; Befunde daraus werden die erste Story der nächsten Überholung
desselben Bereichs (`/sichtung`). Nennt der Auftrag mehrere Bereiche, folgt der nächste.
