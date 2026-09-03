# Entwicklungs-Workflow

Warum wir so arbeiten. Die Regeln selbst stehen in `CLAUDE.md`,
`PROJECT_PRINCIPLES.md` §15.1 und `.claude/skills/feature-loop/SKILL.md` —
dieses Dokument erklärt die Absicht dahinter.

## Der Feature Loop

Ein Auftrag läuft über `/feature-loop <Aufgabe>` in neun Schritten: Spec,
Inspect, Plan, Build, Verify, Review, Fix, Final Verify, Report.

Der Skill startet **nur** auf ausdrücklichen Aufruf. Das ist Absicht: Er soll
für echte Featurearbeit greifen, nicht für eine Frage nach einer Datei oder
einen Einzeiler.

Zweck ist nicht Prozessdisziplin um ihrer selbst willen, sondern dreierlei:
Die Spec vorab macht das Ergebnis überprüfbar statt verhandelbar. Die gezielte
Inspektion verhindert, dass jede Sitzung das Repository neu erkundet. Der
Bericht am Ende macht den nächsten Einstieg billig.

## Zuschnitt eines Loops

Ein Loop umfasst ein **Epic**: eine zusammenhängende Fähigkeit von der
Datenbank bis zur Oberfläche, geschnitten in Stories. Nicht „Terminplanung",
aber auch nicht nur „Termin anlegen" — sondern „Termine anlegen, bearbeiten,
absagen und im Kalender zeigen", als drei oder vier Stories in einem Loop.

Die Einheit des Reviews bleibt die **Story**: ein Commit, ein vertikaler
Schnitt, ein Diff, der sich am Stück lesen lässt. Genau dort sitzen die
Fehler, die nach §13 der Prinzipien niemals unbemerkt bleiben dürfen: falsche
Zuordnung, ungewollte Offenlegung, erweiterte Rechte. Ein Diff, in dem
Datenmodell, Berechtigungen, Migration, Oberfläche und Tests für mehrere
Dinge gleichzeitig entstehen, wird unscharf.

Die Einheit des Fortschritts ist das **Epic**: Zwischen den Stories wird nicht
gestoppt, nicht berichtet und nicht gefragt. Ein Loop, der nach jeder Story
auf Freigabe wartet, produziert Wartezeit, keine Sicherheit — die Sicherheit
kommt aus dem Story-Commit und den Tests, nicht aus der Pause.

## Tests: gezielt während, vollständig am Ende

Während der Entwicklung laufen nur die eng betroffenen Checks. Die volle Suite
nach jeder Änderung kostet Zeit und Tokens, ohne mehr zu sagen.

Am Ende des Epics laufen die Checks, die zum Umfang passen — bei Migrationen
und Policies zwingend `pnpm test:db` gegen eine echte Datenbank, bei
Oberflächenänderungen zusätzlich der Blick in die laufende Anwendung.

Ein Punkt ohne Ermessensspielraum: **Ein Gate wird nie abgeschwächt, um grün zu
werden.** Ein rotes Security- oder RLS-Gate ist ein Befund, kein Hindernis. Wer
den Test anpasst, statt die Ursache zu beheben, hat das Problem nicht gelöst,
sondern unsichtbar gemacht.

## Annehmen statt stoppen

Die frühere Regel lautete: Fehlt eine fachliche oder datenschutzrechtliche
Entscheidung, stoppen und vorlegen. Sie ging davon aus, dass die Praxis jede
dieser Fragen beantworten kann. Das stimmt für Praxisprozesse — wer behandelt,
wer abrechnet. Es stimmt nicht für Aufbewahrungsfristen, Rechtsgrundlagen,
Auditumfang oder Datenminimierung im Detail. Dort blockierte die Rückfrage,
ohne eine bessere Antwort zu liefern.

Seit Version 0.3 der Prinzipien gilt §15.1: **recherchieren, entscheiden,
dokumentieren, reversibel verankern, validieren lassen.** Die Annahme steht im
Annahmenregister `docs/decisions/ASSUMPTIONS.md` mit Begründung, Quellen,
Verankerung im Code und Änderungspfad; die Codestelle trägt die Kennung
`ANN-NNN`.

Das Register ist der Mechanismus, der eine falsche Annahme billig macht: Die
Datenschutzprüfung liest die Einträge, nicht den Code, und sieht je Eintrag,
was eine Änderung kostet. Eine Annahme, die nur an einer Stelle greift, ist
in einer Migration korrigiert. Deshalb ist „reversibel verankern" eine
Entwurfsregel und nicht nur eine Dokumentationspflicht.

Was bleibt ein Stopp? Die Liste in §15.1 ist abschließend: Widerspruch zu
einer MUSS-Anforderung, Aufweichen einer Sicherheitsmaßnahme oder eines
Gates, alles rund um echte Daten, Produktionscredentials, Secrets und
Deployment, und Entscheidungen, deren Rücknahme einen großen Umbau bedeuten
würde. Dort ist eine klare Frage billiger als drei Runden in die falsche
Richtung. Überall sonst ist eine dokumentierte Annahme billiger als eine
Frage, die niemand beantworten kann.

## Die Datenschutzprüfung

Vor Produktivstart prüft eine Datenschutzstelle das Produkt (ADR-007). Das
Register ist dafür die Arbeitsliste: alle Einträge der Kategorien Datenschutz
und Recht mit Status `offen`, je Eintrag Annahme, Begründung und Änderungspfad.
Das Ergebnis wird im Eintrag festgehalten; verlangte Änderungen werden als
eigene Aufgabe umgesetzt.

Damit die Prüfung das Produkt formen kann statt es nur zu beschreiben, gilt:
Kein Eintrag dieser Kategorien darf beim Produktivstart mehr `offen` sein
(`docs/DEVELOPMENT.md`, Go-live-Blocker).

## Neue Session nach jedem Loop

Nach einem abgeschlossenen Epic eine neue Sitzung beginnen.

Der Kontext einer Sitzung füllt sich mit Suchergebnissen, Fehlversuchen und
verworfenen Ansätzen. Für das nächste Epic ist davon fast nichts nützlich,
aber alles wird weiterbezahlt. `CLAUDE.md`, das Register und der
Abschlussbericht des letzten Loops tragen das, was wirklich gebraucht wird.

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

- eine Sicherheitsanforderung aufgeweicht werden müsste
- ein Test nur durch Abschwächung erfüllbar wäre
- eine Festlegung in die Hard-Stop-Liste aus §15.1 fällt
- ein Widerspruch zwischen Prinzipien und ADR sich nicht nach Rang auflösen
  lässt

Dieselbe Ursache nach drei Reparaturversuchen ist kein Abbruch des Loops,
sondern eine unvollständige Story im Bericht: Die übrigen Stories werden
fertiggestellt, die offene mit Ursache und Stand benannt.

Ein Abbruch mit klarer Frage ist billiger als drei Runden in die falsche
Richtung — aber nur dort, wo die Frage beantwortbar ist.
