# Entwicklungs-Workflow

Warum wir so arbeiten. Die Regeln selbst stehen in `CLAUDE.md` und
`.claude/skills/feature-loop/SKILL.md` — dieses Dokument erklärt die Absicht
dahinter.

## Der Feature Loop

Ein Feature läuft über `/feature-loop <Aufgabe>` in neun Schritten: Spec,
Inspect, Plan, Build, Verify, Review, Fix, Final Verify, Report.

Der Skill startet **nur** auf ausdrücklichen Aufruf. Das ist Absicht: Er soll
für echte Featurearbeit greifen, nicht für eine Frage nach einer Datei oder
einen Einzeiler.

Zweck ist nicht Prozessdisziplin um ihrer selbst willen, sondern dreierlei:
Die Spec vorab macht das Ergebnis überprüfbar statt verhandelbar. Die gezielte
Inspektion verhindert, dass jede Sitzung das Repository neu erkundet. Der
Bericht am Ende macht den nächsten Einstieg billig.

## Kleine Aufgaben

Ein Loop sollte einen vertikalen Schnitt umfassen — Datenbank bis Oberfläche
für **eine** Sache. Nicht „Terminplanung", sondern „Termin anlegen und in der
Tagesliste anzeigen".

Große Aufgaben scheitern hier härter als anderswo. Wenn Datenmodell,
Berechtigungen, Migration, Oberfläche und Tests gleichzeitig entstehen, wird
der Review unscharf, und genau dort sitzen die Fehler, die nach §13 der
Prinzipien niemals unbemerkt bleiben dürfen: falsche Zuordnung, ungewollte
Offenlegung, erweiterte Rechte.

## Tests: gezielt während, vollständig am Ende

Während der Entwicklung laufen nur die eng betroffenen Checks. Die volle Suite
nach jeder Änderung kostet Zeit und Tokens, ohne mehr zu sagen.

Am Ende laufen die Checks, die zum Umfang passen — bei Migrationen und Policies
zwingend `pnpm test:db` gegen eine echte Datenbank, bei Oberflächenänderungen
zusätzlich der Blick in die laufende Anwendung.

Ein Punkt ohne Ermessensspielraum: **Ein Gate wird nie abgeschwächt, um grün zu
werden.** Ein rotes Security- oder RLS-Gate ist ein Befund, kein Hindernis. Wer
den Test anpasst, statt die Ursache zu beheben, hat das Problem nicht gelöst,
sondern unsichtbar gemacht.

## Neue Session nach jedem Feature

Nach einem abgeschlossenen Loop eine neue Sitzung beginnen.

Der Kontext einer Sitzung füllt sich mit Suchergebnissen, Fehlversuchen und
verworfenen Ansätzen. Für das nächste Feature ist davon fast nichts nützlich,
aber alles wird weiterbezahlt. `CLAUDE.md` und der Abschlussbericht des letzten
Loops tragen das, was wirklich gebraucht wird.

## Wann Subagents sinnvoll sind

Ein read-only `Explore`-Subagent lohnt, wenn die Antwort viel Suchen kostet und
wenig Ergebnis liefert — „wo wird X überall verwendet", „welche Stellen prüfen
Rollen". Der Subagent sieht die Ausgabe, der Hauptkontext bekommt nur die
Antwort.

Er lohnt **nicht** für zwei, drei bekannte Dateien. Ein Subagent startet ohne
Vorwissen und muss sich alles neu erarbeiten; bei kleinen Aufgaben ist das
teurer als direkt nachzusehen.

## Wann ein zweiter, unabhängiger Review sinnvoll ist

Der Selbstreview in Schritt F fängt Handwerkliches. Er hat aber einen blinden
Fleck: Er prüft gegen dieselbe Annahme, unter der der Code entstanden ist.

Ein unabhängiger Blick — `/code-review`, `/security-review` oder ein frischer
Kontext — lohnt bei:

- neuen oder geänderten RLS-Policies und `SECURITY DEFINER`-Funktionen
- allem, was Sichtbarkeit zwischen Rollen verschiebt
- Migrationen mit Datenumzug
- Abrechnungslogik und allem Unveränderbaren
- der ersten Nutzung eines externen Dienstes

Weil die Praxis von einer Person entwickelt und betrieben wird, gibt es kein
echtes Vier-Augen-Prinzip (ADR-013). Der zweite Blick ist der nächstbeste
Ersatz — und bei sicherheitsrelevanten Änderungen keine Kür.

## Stoppen und eskalieren

Der Loop bricht ab und fragt, statt zu improvisieren, wenn:

- eine Architektur- oder Produktentscheidung nötig würde
- eine Sicherheitsanforderung aufgeweicht werden müsste
- der Scope wesentlich wachsen müsste
- dieselbe Ursache nach drei Reparaturversuchen ungelöst ist
- ein Test nur durch Abschwächung erfüllbar wäre

Ebenso bei fachlichen Fragen — wer darf was sehen, wie läuft der Praxisprozess.
Solche Fragen beantwortet die Praxis, nicht der Agent (`PROJECT_PRINCIPLES.md`
§2.3). Rein technische Fragen, die innerhalb der ADRs entschieden werden
können, werden entschieden und kurz begründet.

Ein Abbruch mit klarer Frage ist billiger als drei Runden in die falsche
Richtung.
