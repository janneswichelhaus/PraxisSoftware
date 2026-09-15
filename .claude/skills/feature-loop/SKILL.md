---
name: feature-loop
description: Pfad A des Graph-Engineering-Workflows - Klassifikation (K1), Spec je Story, gezielte Inspektion, Plan, Story für Story bauen und verifizieren, Selbstreview mit Review-Checkliste bei kritischer Änderung, Fix-Loop, Abschlussbericht mit Annahmen. Nur auf ausdrücklichen Aufruf mit /feature-loop <Aufgabe>.
disable-model-invocation: true
---

# Feature Loop

Ablauf für **einen Auftrag**: in der Regel ein Epic aus mehreren
zusammengehörigen Stories; ein Einzel-Story-Loop ist zulässig für Befunde,
Korrekturen und Folgeaufträge (`FIX-`, `CAL-01x`) — auch dann ein
vollständiger vertikaler Schnitt. Am Ende wird gestoppt.

Die inhaltlichen Regeln stehen in `CLAUDE.md`, `PROJECT_PRINCIPLES.md` und den
ADRs. Dieser Skill wiederholt sie nicht — er beschreibt nur die Reihenfolge,
den Zuschnitt und die Abbruchbedingungen.

**Zuerst `docs/development/ROADMAP.md` lesen** — Einordnung des Auftrags,
Voraussetzungen des Schritts, Credit-Regeln; fehlt eine Voraussetzung aus
Spur B, gilt die Regel dort („Was dieses Dokument ist").

---

## K1. KLASSIFIKATION

Vor dem ersten Schritt den Pfad nach
`docs/development/GRAPH-ENGINEERING-WORKFLOW.md` („K1 — Klassifikation")
bestimmen und in einem Satz nennen. Dieser Skill ist **Pfad A**: Der Diff
berührt einen Auslöser aus ADR-013 Fassung 2, Punkt 9 (Liste nur dort).
Berührt der Auftrag keinen davon und soll kein Wert die Sitzung überleben,
ist er Pfad S: stoppen und `/sandbox <Thema>` vorschlagen.

## A. SPEC

Aus dem Auftrag ableiten und kurz festhalten:

- **Ziel** — in einem Satz
- **Stories** — der Auftrag wird in Stories geschnitten (`<KÜRZEL>-NNN`), jede
  ein vertikaler Schnitt von Datenbank bis Oberfläche, geordnet nach
  Abhängigkeit
- **In Scope** / **Out of Scope** — was das Epic bewusst nicht enthält
- **Testbare Akzeptanzkriterien je Story** — jedes muss durch einen Test oder
  eine andere objektive Prüfung belegbar sein
- **Security- und Datenschutzanforderungen** — betroffene Rollen, Sichtbarkeit,
  Auditpflicht, Datenminimierung, Datenklasse und Frist neuer Tabellen
- **Relevante ADRs** — Nummern, nach dem Index in `CLAUDE.md`
- **UI-Erwartung**, falls die Oberfläche betroffen ist
- **Befunde** — offene Einträge in `docs/development/BEFUNDE.md` zum Bereich
  des Epics werden als erste Story übernommen (Roadmap-Regel R6); steht in
  der Roadmap-Zeile ein Hinweis „Ablaufkarte … AC aus …", werden die dort
  genannten Akzeptanzkriterien übernommen, die Karte selbst wird nicht gelesen
- **Annahmen** — jede Festlegung, die Auftrag, Prinzipien und ADRs nicht
  treffen, wird hier als `ANN-NNN` vorgemerkt (Abschnitt „Annahmen statt
  Rückfragen" in `CLAUDE.md`)

**Recherchieren statt raten**, wenn eine datenschutz-, rechts- oder
fachbezogene Festlegung fehlt: erst die Projektdokumente, dann Gesetzestext und
Behördenleitlinien, dann Sekundärquellen. Das Ergebnis wird als Annahme
getroffen und begründet — mit Quellen, mit Unsicherheiten, mit Änderungspfad.

**Nachfragen** nur, wenn die Festlegung in die Hard-Stop-Liste fällt
(`PROJECT_PRINCIPLES.md` §15.1). Dann die Frage so stellen, dass Jannes sie
ohne Kontextwechsel beantworten kann: Optionen, Empfehlung, Konsequenzen.
Alles im Epic, was nicht davon abhängt, wird vorher fertiggestellt.

**Nicht nachfragen** bei technischen Details, die innerhalb der bestehenden
ADRs sinnvoll entschieden werden können — Benennung, Dateiablage, Query-Form,
Komponentenstruktur. Entscheiden, kurz begründen, weiterarbeiten. Solche
Details sind keine Annahmen im Sinne des Registers.

### Ideenspeicher konsultieren

Höchstens **eine** passende Bereichsdatei aus `docs/product/ideen/` lesen —
Index und Regeln in `docs/product/IDEENSPEICHER.md`. Zweck: bessere Rückfragen
und Benennung; nie Scope, nie Vorbauen. Würde ein Hinweis Mehrarbeit oder eine
Entscheidung bedeuten, wird er in Schritt I als offene Frage genannt.

### Freigabe

A endet mit drei Sätzen an Jannes: was gebaut wird, was bewusst nicht, welche
Prüfungen betroffen sind. **Dann auf „Freigabe" warten.** Ab B läuft der Loop
ohne Zwischenstopp bis zum Bericht.

## B. INSPECT

Nur die für das Epic relevanten Teile des Repositories ansehen. Kein
vollständiges Durchsuchen.

- Erst die vermutete Stelle direkt öffnen, dann gezielt suchen.
- Ein read-only `Explore`-Subagent nur bei breiter Suche über viele Dateien
  (Roadmap, Credit-Regel 8).
- Nur die in A benannten ADRs **vollständig** lesen.

## C. PLAN

Kurzen Implementierungsplan schreiben, wenn das Epic mindestens eines davon
berührt:

- Datenmodell oder Migrationen
- Authentifizierung, Rollen oder RLS
- mehrere fachliche Module
- externe Datenflüsse
- vergleichbare Komplexität

Der Plan nennt die Story-Reihenfolge und je Story die Migrationen, Policies,
RPCs, Komponenten und Tests. Für eine einzelne, lokal begrenzte Story ist ein
Plan verlorene Zeit — dann direkt bauen.

## D. BUILD

**Story für Story**, jede als eigener Commit mit vollständigem vertikalem
Schnitt: Migration, Policy, RPC, Oberfläche, Tests, Abnahmeschritte in
`docs/abnahme/`, Registereinträge. Zwischen den Stories wird weder
gestoppt noch berichtet — der Bericht kommt am Ende des Epics.

Zum Epic gehört, was seine Akzeptanzkriterien brauchen, auch wenn es im Auftrag
nicht wörtlich steht: ein Seed-Datensatz, ein Testkonto, eine Audit-Aktion,
eine Datenklasse. Nicht zum Epic gehört, was ein anderes Epic wäre: keine
prophylaktischen Zukunftsfeatures, keine ungefragten Refactorings außerhalb
der berührten Module. Was auffällt, aber nicht dazugehört, kommt als Vorschlag
in den Bericht.

Jede Annahme, die beim Bauen fällt, wird sofort ins Register geschrieben und an
ihrer Stelle im Code mit `ANN-NNN` markiert — nicht am Ende gesammelt.

## E. VERIFY

**Nach jeder Story** nur die eng betroffenen Checks — einzelne Testdatei,
`pnpm typecheck`, betroffene Komponententests, bei Migrationen der zugehörige
Datenbanktest.

**Nach dem Epic** die für den Umfang passenden CI-äquivalenten Checks:

| Änderung betrifft …         | dann mindestens                                                 |
| --------------------------- | --------------------------------------------------------------- |
| immer                       | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` |
| Dokumentation               | `pnpm docs:check`                                               |
| Migrationen, Policies, RPCs | `pnpm test:db`                                                  |
| Oberfläche                  | `pnpm test:e2e` und visuelle Prüfung                            |
| Abhängigkeiten              | `pnpm audit --audit-level=high`, `pnpm scan:secrets`            |
| auslieferbaren Code         | `pnpm build`                                                    |

Diese Tabelle sagt, **welche Prüfung wann sinnvoll** ist. Welche Prüfungen die
CI erzwingt, steht abschließend in ADR-013; weicht sie von dieser Tabelle ab,
gilt ADR-013.

Bei UI-Änderungen die **laufende** Anwendung ansehen (Chromium/Playwright),
nicht nur Tests. Betrifft das Feature mobile Nutzung, zusätzlich bei ~375 px
prüfen.

Hat das Feature einen Oberflächenanteil, kommen die **manuellen Prüfschritte
für Jannes** nach `docs/abnahme/` — in die Datei der laufenden Etappe, als
Abschnitt mit der Loop-Kennung. **Nicht** nach `docs/DEVELOPMENT.md`. Regeln
in `docs/abnahme/README.md`.

Was aus Umgebungsgründen nicht läuft, wird als nicht gelaufen benannt.

## F. REVIEW

Eigenen Diff (`git diff main...HEAD`) durchgehen auf:

- Akzeptanzkriterien vollständig erfüllt
- ADR-Konformität
- Berechtigungen: greift RLS, ist die UI-Prüfung nur Darstellung
- Datenminimierung: wird mehr ausgeliefert als nötig
- Fehlerbehandlung: verständlich, ohne interne Details preiszugeben
- bei Oberflächenanteil: Oberflächen-Checkliste aus `docs/abnahme/README.md`
  abgehakt; Abweichungen im Bericht begründet
- die **Review-Checkliste** aus ADR-013 Fassung 2, Punkt 9, je Story Punkt
  für Punkt — das Compliance-Gate A4; nicht zutreffende Punkte als
  „entfällt" mit Begründung. Ein roter Punkt geht zurück in den Build, nicht
  als „bekannte Einschränkung" in den Bericht. Verlangt Nr. 8 einen
  **Zweitreview** (A5), läuft er vor dem Merge als Review-Subagent mit eigenem
  Kontext (`/code-review`, `/security-review` oder allgemein), der nur den
  Diff und die Checkliste bekommt (Credit-Regel 8). Geht das nicht, nennt der
  Bericht ihn als ausstehend; Jannes startet die Zeile „Zweitreview" der
  Roadmap und mergt erst danach
- unnötiger Scope
- fehlende Tests, besonders für Negativfälle
- versehentliche Secrets oder Logging sensibler Daten
- Annahmen: jede im Register, jede im Code markiert, jede mit Änderungspfad;
  keine, die in die Hard-Stop-Liste fällt

## G. FIX LOOP

Konkrete gefundene Fehler selbst beheben und **gezielt** erneut testen — nicht
die ganze Suite nach jeder Zeile.

**Höchstens drei erfolglose Reparaturversuche für dieselbe Ursache.** Danach
Ursache und Stand für den Bericht festhalten, die betroffene Story als
unvollständig kennzeichnen und mit den Stories weitermachen, die nicht davon
abhängen.

Sofort stoppen und berichten, wenn eine Festlegung in die abschließende
Hard-Stop-Liste fällt (`PROJECT_PRINCIPLES.md` §15.1, Kurzfassung in
`CLAUDE.md`) — insbesondere:

- eine Sicherheits- oder Datenschutzanforderung aufgeweicht werden müsste
- eine Testanforderung nur durch Abschwächung des Tests erfüllbar wäre
- ein Widerspruch zwischen zwei Dokumenten **gleichen Rangs** besteht und
  die Wahl später teuer zurückzunehmen wäre (ein Widerspruch zwischen
  Rängen wird nach Rang aufgelöst und als Annahme registriert, `CLAUDE.md`)

Eine fehlende Fach- oder Datenschutzentscheidung ist **kein** Stoppgrund — sie
wird als Annahme getroffen. Eine Scope-Erweiterung ist kein Stoppgrund, wenn
die Akzeptanzkriterien des Epics sie brauchen; sie wird gebaut und im Bericht
benannt. Wäre sie ein eigenes Epic, wird sie vorgeschlagen, nicht gebaut.

Gates werden **niemals** abgeschwächt, um grün zu werden (`CLAUDE.md`, Harte
Regeln; `PROJECT_PRINCIPLES.md` §12).

## H. FINAL VERIFY

Die für den Umfang des Epics erforderlichen Checks aus E **einmal** vollständig
laufen lassen.

Identische teure Läufe ohne dazwischenliegende Änderung nicht wiederholen —
ein zweiter Lauf derselben Suite auf demselben Stand liefert keine neue
Information.

## I. REPORT + STOP

Kompakt berichten:

1. Was wurde umgesetzt — je Story
2. Wesentlich geänderte Dateien und Datenbankbereiche
3. Erfüllte Akzeptanzkriterien; unvollständige Stories mit Ursache
4. Gelaufene Tests und Checks mit Ergebnis
5. Durchgeführte UI-Verifikation; bei kritischer Änderung die
   Review-Checkliste (ADR-013 Fassung 2, Punkt 9) je Punkt mit Ergebnis und
   der Stand des Zweitreviews
6. **Getroffene Annahmen** — `ANN`-Kennungen mit je einem Satz, besonders die,
   die Jannes oder die Datenschutzprüfung bestätigen müssen
7. Bekannte Einschränkungen, Risiken und Vorschläge außerhalb des Epics
8. Commit-Hash(es) und die Schritte, mit denen Jannes seinen lokalen Stand
   aktualisiert
9. Was das logisch nächste Epic wäre — als Vorschlag mit Zuschnitt

Dann in `docs/development/ROADMAP.md` den Eintrag in der Fortschrittstabelle
auf `fertig` setzen, mit Datum und Commit, den Posten in
`docs/development/fortschritt.json` auf `fertig`, **`docs/STATUS.md` auf die
nächste Aufgabe stellen** (Jetzt, Danach, Blocker, „Letzte Session" mit den
lokalen Schritten) und bearbeitete Befunde in `docs/development/BEFUNDE.md`
als erledigt markieren. **`pnpm docs:check` muss danach grün sein** — es prüft
die Obergrenzen, die Anker des Registers und die relativen Verweise. Ein
Eintrag ohne durchlaufenen Schritt I wird nicht abgehakt. Merge und Abnahme:
Roadmap, „Definition of Done".

**Danach stoppen.** Das vorgeschlagene nächste Epic wird nicht begonnen. Ein
neuer Loop startet nur durch einen neuen `/feature-loop`-Aufruf.
