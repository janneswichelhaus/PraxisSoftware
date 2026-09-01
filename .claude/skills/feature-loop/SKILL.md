---
name: feature-loop
description: Strukturierter Ablauf für ein Feature in diesem Repository - Spec, gezielte Inspektion, Plan, kleinster vertikaler Schnitt, Verifikation, Selbstreview, begrenzter Fix-Loop, Abschlussbericht. Nur auf ausdrücklichen Aufruf mit /feature-loop <Aufgabe>.
disable-model-invocation: true
---

# Feature Loop

Ablauf für **eine** Aufgabe. Am Ende wird gestoppt.

Die inhaltlichen Regeln stehen in `CLAUDE.md`, `PROJECT_PRINCIPLES.md` und den
ADRs. Dieser Skill wiederholt sie nicht — er beschreibt nur die Reihenfolge und
die Abbruchbedingungen.

---

## A. SPEC

Aus dem Auftrag ableiten und kurz festhalten:

- **Ziel** — in einem Satz
- **In Scope** / **Out of Scope**
- **Testbare Akzeptanzkriterien** — jedes muss durch einen Test oder eine
  andere objektive Prüfung belegbar sein
- **Security- und Datenschutzanforderungen** — betroffene Rollen, Sichtbarkeit,
  Auditpflicht, Datenminimierung
- **Relevante ADRs** — Nummern, nach dem Index in `CLAUDE.md`
- **UI-Erwartung**, falls die Oberfläche betroffen ist

**Nachfragen**, wenn eine fachliche Entscheidung fehlt: wer darf etwas sehen,
was ist der Praxisprozess, welche Daten gehören dazu, was passiert im
Konfliktfall. Solche Fragen darf der Agent nicht selbst beantworten
(`PROJECT_PRINCIPLES.md` §2.3).

**Nicht nachfragen** bei rein technischen Details, die innerhalb der
bestehenden ADRs sinnvoll entschieden werden können — Benennung, Dateiablage,
Query-Form, Komponentenstruktur. Entscheiden, kurz begründen, weiterarbeiten.

### Ideenspeicher konsultieren

Anschließend **eine** passende Bereichsdatei aus `docs/product/ideen/` lesen —
der Index in `docs/product/IDEENSPEICHER.md` sagt welche. Nicht alle, und nur
wenn eine zum Auftrag passt.

Zweck ist ausschließlich: bessere Rückfragen stellen und offensichtliche
Sackgassen in Benennung und Modellierung vermeiden.

- Rang 5. **Begründet nie Scope.** Kein Eintrag von dort ist ein Auftrag.
- **Nichts vorbauen** — keine Spalte, kein Feld, kein Statuswert, kein
  UI-Element „für später" (`PROJECT_PRINCIPLES.md` §11, ADR-014).
- Würde ein Hinweis von dort Mehrarbeit oder eine fachliche Entscheidung
  bedeuten: nicht umsetzen, in Schritt I als offene Frage nennen.
- Ideen, die während des Loops entstehen, dort als `vorschlag` eintragen —
  nicht bauen.

## B. INSPECT

Nur die für die Aufgabe relevanten Teile des Repositories ansehen. Kein
vollständiges Durchsuchen.

- Erst die vermutete Stelle direkt öffnen, dann gezielt suchen.
- Bei **umfangreicher** Exploration über viele Dateien: read-only
  `Explore`-Subagent verwenden, damit große Such- und Dateiausgaben nicht den
  Hauptkontext füllen. Für zwei, drei bekannte Dateien lohnt das nicht.
- Nur die in A benannten ADRs **vollständig** lesen.

## C. PLAN

Kurzen Implementierungsplan schreiben, wenn die Änderung mindestens eines
davon berührt:

- Datenmodell oder Migrationen
- Authentifizierung, Rollen oder RLS
- mehrere fachliche Module
- externe Datenflüsse
- vergleichbare Komplexität

Sonst direkt bauen. Ein Plan für eine lokal begrenzte Änderung ist verlorene
Zeit.

## D. BUILD

Den **kleinsten vollständigen vertikalen Schnitt** implementieren, der die
Akzeptanzkriterien erfüllt.

Kein Scope Creep, keine prophylaktischen Zukunftsfeatures, keine ungefragten
Refactorings.

## E. VERIFY

**Während der Entwicklung** nur die eng betroffenen Checks laufen lassen —
einzelne Testdatei, `pnpm typecheck`, betroffene Komponententests.

**Nach abgeschlossener Implementierung** die für den Umfang passenden
CI-äquivalenten Checks:

| Änderung betrifft …         | dann mindestens                                                 |
| --------------------------- | --------------------------------------------------------------- |
| immer                       | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` |
| Migrationen, Policies, RPCs | `pnpm test:db`                                                  |
| Oberfläche                  | `pnpm test:e2e` und visuelle Prüfung                            |
| Abhängigkeiten              | `pnpm audit --audit-level=high`, `pnpm scan:secrets`            |
| auslieferbaren Code         | `pnpm build`                                                    |

Bei UI-Änderungen die **laufende** Anwendung ansehen (Chromium/Playwright),
nicht nur Tests. Betrifft das Feature mobile Nutzung, zusätzlich bei ~375 px
prüfen.

**Keine Prüfung als erfolgreich melden, die nicht gelaufen ist.** Was aus
Umgebungsgründen nicht geht, wird als solches benannt.

## F. REVIEW

Eigenen Diff (`git diff`) durchgehen auf:

- Akzeptanzkriterien vollständig erfüllt
- ADR-Konformität
- Berechtigungen: greift RLS, ist die UI-Prüfung nur Darstellung
- Datenminimierung: wird mehr ausgeliefert als nötig
- Fehlerbehandlung: verständlich, ohne interne Details preiszugeben
- unnötiger Scope
- fehlende Tests, besonders für Negativfälle
- versehentliche Secrets oder Logging sensibler Daten

## G. FIX LOOP

Konkrete gefundene Fehler selbst beheben und **gezielt** erneut testen — nicht
die ganze Suite nach jeder Zeile.

**Höchstens drei erfolglose Reparaturversuche für dieselbe Ursache.**

Sofort stoppen und berichten, wenn:

- eine neue Architektur- oder Produktentscheidung nötig würde
- eine Sicherheitsanforderung aufgeweicht werden müsste
- der Scope wesentlich erweitert werden müsste
- dieselbe Ursache nach drei Versuchen ungelöst ist
- eine Testanforderung nur durch Abschwächung des Tests erfüllbar wäre

Tests, RLS-Policies, Secret-Scanning und andere Security-Gates werden **niemals**
abgeschwächt, um grün zu werden. Das ist keine Ermessensfrage.

## H. FINAL VERIFY

Die für den Featureumfang erforderlichen Checks aus E **einmal** vollständig
laufen lassen.

Identische teure Läufe ohne dazwischenliegende Änderung nicht wiederholen —
ein zweiter Lauf derselben Suite auf demselben Stand liefert keine neue
Information.

## I. REPORT + STOP

Kompakt berichten:

1. Was wurde umgesetzt
2. Wesentlich geänderte Dateien und Datenbankbereiche
3. Erfüllte Akzeptanzkriterien
4. Gelaufene Tests und Checks mit Ergebnis
5. Durchgeführte UI-Verifikation
6. Bekannte Einschränkungen und Risiken
7. Commit-Hash(es)
8. Was der logisch nächste Loop wäre — als Vorschlag

**Danach stoppen.** Der vorgeschlagene nächste Loop wird nicht begonnen. Ein
neuer Loop startet nur durch einen neuen `/feature-loop`-Aufruf.
