# Entwicklungs-Workflow

Warum wir so arbeiten. Die Regeln selbst stehen in `CLAUDE.md`,
`PROJECT_PRINCIPLES.md` §15.1, ADR-013 Fassung 2,
`GRAPH-ENGINEERING-WORKFLOW.md` und den Skills `feature-loop` und `sandbox`
— dieses Dokument erklärt die Absicht dahinter.

## Drei Pfade, ein Klassifikationsknoten

Seit dem 2026-09-13 nimmt ein Auftrag einen von drei Pfaden — beschrieben
als Graph in [`GRAPH-ENGINEERING-WORKFLOW.md`](GRAPH-ENGINEERING-WORKFLOW.md).
Der Knoten K1 entscheidet deterministisch: Wessen Diff einen Auslöser aus
ADR-013 Fassung 2, Punkt 9 berührt, geht den **Pfad A** (Feature-Loop, mit
Compliance-Gate und Zweitreview). Wer nur die Oberfläche zeigt und nichts
über die Sitzung hinaus behält, geht den **Pfad S** (Sandbox). Wem erst eine
Entscheidung aus der Hard-Stop-Liste fehlt, geht den **Pfad D**
(Docs-Session).

Die Absicht: Eine RLS-Policy und eine Schaltflächenbeschriftung brauchen
nicht dieselben Gates. Der Loop hatte dafür nur implizite Unterscheidungen
(Plan-Bedingung, Check-Tabelle, Modellwahl). Der Graph macht sie zu einem
Knoten, gibt der Architektur die Review-Checkliste, die ADR-013 seit dem
28.08. verlangte, und gibt der Oberfläche einen Sandkasten, der technisch
nicht an echte Daten herankommt (`trennung.test.ts`) und deshalb frei sein
darf — zeitlich begrenzt, damit keine Vorschau neben einer echten Funktion
stehen bleibt.

## Der Feature Loop

Ein Auftrag auf Pfad A läuft über `/feature-loop <Aufgabe>` in zehn
Schritten: Klassifikation, Spec, Inspect, Plan, Build, Verify, Review, Fix,
Final Verify, Report.

Der Skill startet **nur** auf ausdrücklichen Aufruf. Das ist Absicht: Er soll
für echte Featurearbeit greifen, nicht für eine Frage nach einer Datei oder
einen Einzeiler.

Zweck ist nicht Prozessdisziplin um ihrer selbst willen, sondern dreierlei:
Die Spec vorab macht das Ergebnis überprüfbar statt verhandelbar. Die gezielte
Inspektion verhindert, dass jede Sitzung das Repository neu erkundet. Der
Bericht am Ende macht den nächsten Einstieg billig.

## Zuschnitt eines Loops

Ein Loop umfasst in der Regel ein **Epic**: eine zusammenhängende Fähigkeit
von der Datenbank bis zur Oberfläche, geschnitten in Stories. Nicht
„Terminplanung", aber auch nicht nur „Termin anlegen" — sondern „Termine
anlegen, bearbeiten, absagen und im Kalender zeigen", als drei oder vier
Stories in einem Loop. Befunde, Korrekturen und Folgeaufträge (`FIX-`,
`CAL-01x`) dürfen als Einzel-Story-Loop laufen; die Regel dafür steht in
`CLAUDE.md` und im Skill.

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

Seit Version 0.3 der Prinzipien gilt §15.1 (Verfahren dort, Kurzfassung in
`CLAUDE.md`). Die Annahme steht im Annahmenregister
`docs/decisions/ASSUMPTIONS.md` mit Begründung, Quellen, Verankerung im Code
und Änderungspfad; die Codestelle trägt die Kennung `ANN-NNN`.

Das Register ist der Mechanismus, der eine falsche Annahme billig macht: Die
Datenschutzprüfung liest die Einträge, nicht den Code, und sieht je Eintrag,
was eine Änderung kostet. Eine Annahme, die nur an einer Stelle greift, ist
in einer Migration korrigiert. Deshalb ist „reversibel verankern" eine
Entwurfsregel und nicht nur eine Dokumentationspflicht.

Was bleibt ein Stopp? Die Liste in §15.1 ist abschließend (Wortlaut dort).
Dort ist eine klare Frage billiger als drei Runden in die falsche Richtung.
Überall sonst ist eine dokumentierte Annahme billiger als eine Frage, die
niemand beantworten kann.

## Die Datenschutzprüfung

Vor Produktivstart prüft eine Datenschutzstelle das Produkt (ADR-007). Das
Register ist dafür die Arbeitsliste: alle Einträge der Kategorien Datenschutz
und Recht mit Status `offen` **oder `entschieden (Jannes)`**, je Eintrag
Annahme, Begründung und Änderungspfad. Das Ergebnis wird im Eintrag
festgehalten; verlangte Änderungen werden als eigene Aufgabe umgesetzt.

Damit die Prüfung das Produkt formen kann statt es nur zu beschreiben, gilt:
Kein Eintrag dieser Kategorien darf beim Produktivstart mehr `offen` oder
`entschieden (Jannes)` sein (`docs/DEVELOPMENT.md`, Go-live-Blocker).
**Jannes darf eine offene Festlegung jederzeit selbst treffen** — das löst die
Arbeit und gibt der Prüfung eine Vorlage statt einer Frage, ersetzt ihr Urteil
aber nicht (`docs/decisions/OPEN_DECISIONS.md`, „Vorläufig entschieden").

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
Ersatz — und bei sicherheitsrelevanten Änderungen keine Kür: Seit ADR-013
Fassung 2 (Punkt 9, Nr. 8) ist er für Policies, `SECURITY DEFINER`,
Datenumzug, Rechnungsausstellung, Nummernkreis und Löschung Pflicht, und
zwar **vor dem Merge** (Gate A5 im Graph-Engineering-Workflow): in
derselben Session als Review-Subagent mit eigenem Kontext, sonst als eigene
Session, auf die der Pull Request wartet. Was er findet, wird ein eigener
Loop — so wie CAL-016 aus zwei frischen Reviews entstand.

## Stoppen und eskalieren

Der Loop bricht ab und fragt, statt zu improvisieren, wenn eine Festlegung
in die Hard-Stop-Liste aus §15.1 fällt — etwa eine Sicherheitsanforderung
aufgeweicht oder ein Test abgeschwächt werden müsste — oder wenn zwei
Dokumente **gleichen Rangs** sich widersprechen und die Wahl später teuer
zurückzunehmen wäre. Ein Widerspruch zwischen Rängen ist kein Stopp: Er
wird nach Rang aufgelöst und als Annahme registriert (`CLAUDE.md`).

Dieselbe Ursache nach drei Reparaturversuchen ist kein Abbruch des Loops,
sondern eine unvollständige Story im Bericht: Die übrigen Stories werden
fertiggestellt, die offene mit Ursache und Stand benannt.

Ein Abbruch mit klarer Frage ist billiger als drei Runden in die falsche
Richtung — aber nur dort, wo die Frage beantwortbar ist.

## Wer ändert welches Steuerungsdokument

| Dokument | Loop (`/feature-loop`, Pfad A) | Sandbox (`/sandbox`, Pfad S) | Docs-Session, Planungssession (Pfad D) | Ablaufrunde (eingefroren bis Probewoche 1) | Wochenupdate |
| --- | --- | --- | --- | --- | --- |
| `ROADMAP.md` | Fortschrittstabelle, „Nächster Loop", `fortschritt.json` (Schritt I) | — | nachstellen, neue Zeilen als Vorschlag | nur als Diff, den Jannes freigibt | liest nur |
| `ARBEITSBEREICHE.md` | ersetzte Vorschau austragen | Prototyp eintragen (S4) und austragen (S6) | Stand nachführen | — | abgelaufene Prototypen melden (Schritt 6) |
| `OPEN_DECISIONS.md` | Verweis auf neue `ANN`-Kennungen | — | Entscheidungen von Jannes eintragen | — | liest nur |
| `ASSUMPTIONS.md` | neue Annahmen sofort (Schritt D) | keine — was nach einer Annahme aussieht, kommt ins Härtungs-Ticket | Bestätigungen, Nachträge | — | — |
| `BEFUNDE.md` | bearbeitete Befunde als erledigt | Befund aus der Schau | neue Befunde aus Abnahmen und Reviews | Bruchstellen als Befunde | — |
| Ideenspeicher | neue Ideen als `vorschlag` | Idee aus der Schau als `vorschlag` | Ideen von Jannes als `notiert` | Ziel 3 („Idee") | — |
| Prinzipien, ADRs | nie ohne Auftrag (§21) | nie | auf Auftrag, eigener Commit | nie | nie |

## Merge und Abnahme

Ein Pull Request wird gemergt, sobald die CI grün ist — Docs wie Code, gern
über „Auto-Merge" (entschieden 2026-09-13). Die Abnahme durch Jannes folgt
binnen sieben Tagen am eigenen Rechner nach `docs/abnahme/`; Befunde daraus
kommen nach `BEFUNDE.md` und als erste Story in den nächsten Loop derselben
Spur (Roadmap, R6). So bleibt „ein aktiver Feature-Branch" einhaltbar, und
gemergte Branches werden gelöscht.
