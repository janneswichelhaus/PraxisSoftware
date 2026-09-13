---
name: feature-loop
description: Strukturierter Ablauf für ein Epic in diesem Repository - Spec je Story, gezielte Inspektion, Plan, Story für Story bauen und verifizieren, Selbstreview, Fix-Loop, Abschlussbericht mit Annahmen. Nur auf ausdrücklichen Aufruf mit /feature-loop <Aufgabe>.
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
Voraussetzungen des Schritts, Credit-Regeln. Fehlt eine dort genannte
Voraussetzung aus Spur B, gilt `PROJECT_PRINCIPLES.md` §15.1: Ist sie als
begründete Annahme reversibel überbrückbar, wird sie angenommen und
registriert; fällt sie in die Hard-Stop-Liste, wird das gemeldet und nur der
davon abhängige Teil nicht begonnen.

---

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
- **`IDEA-`-Verweise** in der Roadmap-Zeile nennen die Herkunft der Idee und
  importieren nichts; der Scope entsteht hier
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

Anschließend **eine** passende Bereichsdatei aus `docs/product/ideen/` lesen —
der Index in `docs/product/IDEENSPEICHER.md` sagt welche. Nicht alle, und nur
wenn eine zum Auftrag passt.

Zweck ist ausschließlich: bessere Rückfragen stellen und offensichtliche
Sackgassen in Benennung und Modellierung vermeiden.

- Rang 6. **Begründet nie Scope.** Kein Eintrag von dort ist ein Auftrag.
- **Nichts vorbauen** — keine Spalte, kein Feld, kein Statuswert, kein
  UI-Element „für später" (`PROJECT_PRINCIPLES.md` §11, ADR-014).
- Würde ein Hinweis von dort Mehrarbeit oder eine fachliche Entscheidung
  bedeuten: nicht umsetzen, in Schritt I als offene Frage nennen.
- Ideen, die während des Loops entstehen, dort als `vorschlag` eintragen —
  nicht bauen.

## B. INSPECT

Nur die für das Epic relevanten Teile des Repositories ansehen. Kein
vollständiges Durchsuchen.

- Erst die vermutete Stelle direkt öffnen, dann gezielt suchen.
- Bei **umfangreicher** Exploration über viele Dateien: read-only
  `Explore`-Subagent verwenden, damit große Such- und Dateiausgaben nicht den
  Hauptkontext füllen. Für zwei, drei bekannte Dateien lohnt das nicht.
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
| immer                       | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` |
| Migrationen, Policies, RPCs | `pnpm test:db`                                                  |
| Oberfläche                  | `pnpm test:e2e` und visuelle Prüfung                            |
| Abhängigkeiten              | `pnpm audit --audit-level=high`, `pnpm scan:secrets`            |
| auslieferbaren Code         | `pnpm build`                                                    |

Diese Tabelle sagt, **welche Prüfung wann sinnvoll** ist. Welche Prüfungen die
CI erzwingt, steht abschließend in ADR-013; weicht sie von dieser Tabelle ab,
gilt ADR-013.

`pnpm test:db` läuft **auch in der Cloudumgebung** — es braucht kein Docker.
Bei Migrationen, Policies und RPCs ist es das wichtigste Gate und wird nicht
mit dem Hinweis auf `supabase start` übersprungen.

Bei UI-Änderungen die **laufende** Anwendung ansehen (Chromium/Playwright),
nicht nur Tests. Betrifft das Feature mobile Nutzung, zusätzlich bei ~375 px
prüfen.

Hat das Feature einen Oberflächenanteil, kommen die **manuellen Prüfschritte
für Jannes** nach `docs/abnahme/` — in die Datei der laufenden Etappe, als
Abschnitt mit der Loop-Kennung. **Nicht** nach `docs/DEVELOPMENT.md`. Regeln
in `docs/abnahme/README.md`.

**Keine Prüfung als erfolgreich melden, die nicht gelaufen ist.** Was aus
Umgebungsgründen nicht geht, wird als solches benannt.

## F. REVIEW

Eigenen Diff (`git diff main...HEAD`) durchgehen auf:

- Akzeptanzkriterien vollständig erfüllt
- ADR-Konformität
- Berechtigungen: greift RLS, ist die UI-Prüfung nur Darstellung
- Datenminimierung: wird mehr ausgeliefert als nötig
- Fehlerbehandlung: verständlich, ohne interne Details preiszugeben
- bei Oberflächenanteil: Oberflächen-Checkliste aus `docs/abnahme/README.md`
  abgehakt; Abweichungen im Bericht begründet
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

Tests, RLS-Policies, Secret-Scanning und andere Security-Gates werden **niemals**
abgeschwächt, um grün zu werden (`PROJECT_PRINCIPLES.md` §12).

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
5. Durchgeführte UI-Verifikation
6. **Getroffene Annahmen** — `ANN`-Kennungen mit je einem Satz, besonders die,
   die Jannes oder die Datenschutzprüfung bestätigen müssen
7. Bekannte Einschränkungen, Risiken und Vorschläge außerhalb des Epics
8. Commit-Hash(es) und die Schritte, mit denen Jannes seinen lokalen Stand
   aktualisiert
9. Was das logisch nächste Epic wäre — als Vorschlag mit Zuschnitt

Dann in `docs/development/ROADMAP.md` den Eintrag in der Fortschrittstabelle
auf `fertig` setzen, mit Datum und Commit, den Posten in
`docs/development/fortschritt.json` auf `fertig`, den Abschnitt „Nächster
Loop" auf den folgenden Eintrag stellen (er trägt nur den Livestand; was
fertig wurde, kommt in den Änderungsvermerk) und bearbeitete Befunde in
`docs/development/BEFUNDE.md` als erledigt markieren. Ein Eintrag ohne
durchlaufenen Schritt I wird nicht abgehakt. Der Pull Request wird gemergt,
sobald die CI grün ist; die Abnahme durch Jannes folgt danach.

**Danach stoppen.** Das vorgeschlagene nächste Epic wird nicht begonnen. Ein
neuer Loop startet nur durch einen neuen `/feature-loop`-Aufruf.
