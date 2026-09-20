# Roadmap

Version 5.13 · Stand 2026-09-19 · **in Kraft**

Reihenfolge der Umsetzung. Beantwortet die Frage **„was als Nächstes"** — und
sonst nichts. Die Entscheidungen, aus denen dieser Rahmen entstanden ist
(Roadmap-Review vom 2026-09-06, E-1 bis E-21), sind eingearbeitet; Wortlaut:
Git-Historie bis `7160fd5`.

## Was dieses Dokument ist und was nicht

- **Es legt die Reihenfolge fest, nie den Scope.** Was ein Eintrag konkret
  umfasst, entsteht erst im SPEC-Schritt des Loops.
- **Es ist kein Auftrag.** Gebaut wird, was Jannes mit `/feature-loop`
  beauftragt. Ein Eintrag hier startet nichts von allein.
- **Es überschreibt nichts.** `PROJECT_PRINCIPLES.md`, die ADRs und
  `docs/decisions/OPEN_DECISIONS.md` gelten unverändert. Fehlt einem Eintrag
  eine Voraussetzung aus Spur B, gilt `PROJECT_PRINCIPLES.md` §15.1: reversibel
  überbrückbar → als Annahme registrieren und bauen; Hard-Stop-Liste → melden
  und nur den abhängigen Teil nicht beginnen.
- Verweise wie `IDEA-PRX-004` zeigen nur die **Herkunft** einer Idee im
  Ideenspeicher (Rang 6) und importieren nichts.
- Entscheidungen trifft dieses Dokument nicht. Was hier als „entschieden"
  steht, hat seine Fundstelle in `PROJECT_PRINCIPLES.md`, einem ADR oder
  einem datierten Vermerk in `docs/decisions/OPEN_DECISIONS.md` (ohne Rang).
  Kennungen: `E12`, `E13` (ohne Bindestrich) sind offene Punkte dort; `E-1`
  bis `E-21` (mit Bindestrich) die Rückfragen des Roadmap-Reviews vom
  2026-09-06.
- Befunde sammelt [`BEFUNDE.md`](BEFUNDE.md), den Stand der Oberfläche
  [`ARBEITSBEREICHE.md`](ARBEITSBEREICHE.md), die Ablaufrunden
  [`OPTIMIERUNG.md`](OPTIMIERUNG.md) — deren Vorschläge bekommen erst hier
  einen Platz.

Jeder Loop liest dieses Dokument zuerst und stellt am Ende die
Fortschrittstabelle, [`../STATUS.md`](../STATUS.md) und den Abschnitt
„Nächster Loop" nach.

---

## Nächster Loop

**Welche Aufgabe als nächste läuft, steht in
[`../STATUS.md`](../STATUS.md)** — dort, und nur dort, mit Aufruf, Pfad und
Aufwand. Dieser Abschnitt trägt, was daneben liegt und niemand sonst führt.

- **Parallel startbar, sobald der PTV-Schlüssel vorliegt:**
  `/feature-loop MAP-002 In-App-Kartenprototyp nach docs/development/MAP-LOOPS.md`
  — nur synthetische Daten (ADR-019 angenommen am 2026-09-13, E-20).
- **Docs-Session offen:** `OPS-001 Providerprüfung` — mit den fünf
  Objektspeicher-Punkten aus ADR-017 und der Edge-Runtime-Prüfung aus ADR-019.
- **Gemergt am 2026-09-15/16:** PR #41 (ROL-EPIC-001) und PR #42 (FIX-015).
  Die Abnahme beider steht noch aus.
- **CI läuft wieder (2026-09-18).** Die Actions-Minuten waren seit dem
  2026-09-16 aufgebraucht; seit dem Lauf zu PR #48 entstehen wieder grüne
  Läufe, und damit ist der Merge nach ADR-013 wieder möglich. Die lokalen
  Gates bleiben die erste Prüfung, nicht die zweite.
- **CAL-EPIC-004 eingeordnet (2026-09-16).** Jannes hat die Reihenfolge an
  diesem Punkt ausdrücklich delegiert; sie steht jetzt in Etappe 1:
  **~~CAL-018~~ (fertig 2026-09-16) → ~~CAL-EPIC-004a~~ (fertig 2026-09-18) → ~~FIX-EPIC-004~~ (fertig 2026-09-18) → ~~CAL-EPIC-004b~~ (fertig 2026-09-18) → ~~UX-013~~ (fertig 2026-09-18) → ~~GRD-001~~ (fertig 2026-09-18)
  → ~~VER-EPIC-002~~ (fertig 2026-09-18) → ~~CAL-EPIC-004c~~ (fertig 2026-09-18)
  → ~~ABR-EPIC-001~~ (fertig 2026-09-19, ohne ABR-000) → ~~ABR-EPIC-002a~~ (fertig 2026-09-19, mit ABR-000)** (GRD-001 seit dem Abschluss
  von E16 am 2026-09-16 dazwischen). Begründung: 004a schließt zuerst die Lücke
  zwischen `PROJECT_PRINCIPLES.md` 0.11 §8.1 und dem gebauten Stand — solange
  sie offen ist, weist der Server ab, was die Prinzipien erlauben. 004b setzt
  auf der freien Länge auf. GRD-001 legt die Klammer, auf der VER-EPIC-002
  seine Felder und 004c seine Gruppierung aufbauen — und die Umbenennung wird
  mit jedem Loop teurer, der vorher auf `prescriptions` aufsetzt. 004c arbeitet
  an denselben Zahlen wie VER-EPIC-002 und läuft deshalb danach. UX-013 hängt
  an nichts und kann vorgezogen werden, wenn ein Loop Luft hat.
- **Empfehlung zum Verordnungsende hat keine Quelle (VER-EPIC-002, 2026-09-18).**
  Die manuelle Eingabe ist entfallen; eine Anzeige „mit erkennbarer Quelle und Datum"
  braucht ein Feld, das es in der Dokumentation nicht gibt — `treatment_notes` trägt
  nur Freitext. Bestandstexte bleiben sichtbar (ANN-065). **Wiedervorlage:** mit dem
  Befunde-Loop im Dez 2026, spätestens vor dem Feature-Freeze Stufe 1 am 26.02.2027;
  ein strukturiertes Empfehlungsfeld in der Dokumentation wäre die Voraussetzung und
  ist selbst eine Entscheidung nach ADR-006 Punkt 4 (ANN-014).
- **Vor der ersten echten Datei (OPS-001):**
  `tests/e2e/authenticated/patient-file-access.spec.ts` regelmäßig gegen
  Staging laufen lassen — Supabase aktualisiert die Storage-API ohne Zutun
  (ANN-052).
- **Jannes-seitig (M0, 30.09.):** Branch Protection — **`main` ist seit dem
  2026-09-19 als geschützt bestätigt** (GitHub-API: `protected: true`); welche
  Checks verlangt werden und ob **Secret Scanning und Push Protection** an
  sind, lässt sich von hier nicht lesen und bleibt zu prüfen
  (`docs/DEVELOPMENT.md`, „Manuelle Schritte") · Anfragen
  B1, B2, B4 verschicken — B2 mit Kartendienst (B7), Terminerinnerung (B15),
  **E15** (Office liest klinische Inhalte) und den prüfpflichtigen Annahmen des
  Registers; B4 mit den Steuerfragen und **E14 Fall 1** (Vergütung ohne
  erbrachte Behandlung) · Genehmigung des Kartendienstes schriftlich ablegen
  (G14) · vor MAP-002 das PTV-Free-Abo, vor MAP-006 die PTV-Vertragsdokumente
  (`providerpruefung-kartendienst.md`) · Prompt der Wochenupdate-Routine
  nachziehen (`docs/DEVELOPMENT.md`, „Manuelle Schritte").
- **Das PTV-Free-Abo trägt nur den Prototyp.** Jannes hat am 2026-09-19
  nachgefragt, ob der Gratiszugang dauerhaft ist: Er ist es für **Test und
  Integration** und damit für MAP-002 bis MAP-005 mit synthetischen Daten —
  „productive use is excluded", 500 Transaktionen/Tag. Der Betrieb braucht den
  Standard Plan (pay-as-you-go, **keine öffentlichen Preise**) und hängt am
  Gate aus ADR-019 Punkt 9. Steht so schon im Prüfkatalog, Punkt 12
  (`providerpruefung-kartendienst.md`).
- **Abnahme ohne Test-Umgebung (entschieden 2026-09-19).** Die Sichtprüfung
  hinter der Anmeldung wartet auf die Test-Umgebung aus **OPS-002 (G5,
  November)**; bis dahin nimmt Jannes auf Tests, Screenshots und die
  Abnahmeschritte ab. Kein Epic wartet deshalb, und Docker wird dafür nicht
  eingerichtet.
- **E18 kommt nach ABR-EPIC-003 (entschieden 2026-09-19).** Der nächste
  Schritt ist **ADR-022**, nicht Code (`E18-LEISTUNGSBEREICHE.md`, Schritte 1
  bis 5 — je eine eigene Sitzung). Die Reihe steht bewusst nach den
  Abrechnungs-Epics: ADR-009 Fassung 2 fasst die Abrechnung ohnehin an
  (Steuerkennzeichen am Posten, getrennte Nummernkreise), und dieselbe Stelle
  zweimal umzubauen ist teurer als einmal. **Schritt 1 ist am 2026-09-20
  angenommen** ([ADR-021](../adr/ADR-021-service-areas-and-legal-relationships.md),
  `PROJECT_PRINCIPLES.md` 0.12.1 §21) — Schritt 2 (ADR-022 Terminkontext) ist
  damit frei.

Was seit dem letzten Loop fertig, bestätigt oder entschieden wurde, steht im
Änderungsvermerk am Ende (neueste Version zuerst); Entscheidungen in
`docs/decisions/OPEN_DECISIONS.md`, Annahmen im Register. Dieser Abschnitt
trägt nur den Livestand.

Nach jedem abgeschlossenen Loop stellt Skill-Schritt I `docs/STATUS.md` auf
die nächste Aufgabe und diesen Abschnitt auf das, was daneben offen bleibt.

---

## Sessions starten

Jannes entschied am 2026-09-06 (E-15): **Die Reihenfolge ist verbindlich, der
Kalender nachrangig.** Ein Eintrag darf früher beginnen, sobald der vorherige
fertig und abgenommen ist und seine Voraussetzung aus Spur B vorliegt. Die
Monate im Rückwärtsplan sind Spätest-Termine, keine Wartezeiten; die
Meilensteine bleiben die Messlatte für das Wochenupdate.

Vier Regeln, damit jede Session weiß, was sie tun soll, und nichts verloren
geht:

1. **Vorher:** `git pull --ff-only origin main`, dann diesen Abschnitt und
   „Nächster Loop" lesen. Mehr Vorbereitung braucht es nicht — die Session
   liest den Rest selbst.
2. **Aufruf:** genau einen Aufruf aus der Tabelle unten, unverändert, als
   erste Nachricht. **Ein Thema je Session.** Ein zweiter Wunsch geht nicht in
   dieselbe Session — er wird ein eigener Aufruf oder eine Zeile im
   Ideenspeicher (Aufruf „Idee"). Welchen Pfad ein Auftrag nimmt — Loop oder
   Sandbox —, sagt die Klassifikation K1 in
   [`GRAPH-ENGINEERING-WORKFLOW.md`](GRAPH-ENGINEERING-WORKFLOW.md); eine
   Session, die den falschen Aufruf bekommt, sagt das und baut nichts.
3. **Nachher:** den Bericht lesen und die Fragen mit je einem Satz
   beantworten („wie empfohlen" reicht). Merge und Abnahme laufen nach der
   „Definition of Done", Docs wie Code. Der nächsten Session sagen „Abnahme
   <Loop> am <Datum> erledigt", damit sie das Datum in der
   Fortschrittstabelle einträgt.
4. **Montags** sagt das Wochenupdate, was fällig ist. Es liest `main` —
   deshalb Regel 3.

Wie Antworten am besten aussehen: mit der Kennung (`E-16: a`, `B4: liegt vor,
Ergebnis …`), Entscheidungen als „entschieden: …", Ideen als „Idee: …". So
landet jeder Satz an der richtigen Stelle im Register, im Ideenspeicher oder
in dieser Roadmap.

| Zweck | Aufruf (kopieren, nichts ergänzen) |
| --- | --- |
| Code-Loop | der Befehl aus „Nächster Loop", zum Beispiel `/feature-loop ROL-EPIC-001 Office liest klinische Inhalte` |
| Docs-Session ADR | `Docs-Session ohne Code: ADR-NNN <Thema> schreiben. Vorgaben: docs/development/ROADMAP.md, <Zeile>, und die dort genannten ADRs. Am Ende die Bestätigungsfragen für Jannes als Liste mit Empfehlung.` — so entstanden ADR-017, ADR-018 und ADR-019 |
| Docs-Session Providerprüfung | `Docs-Session ohne Code: OPS-001 Providerprüfung Supabase nach dem Prüfkatalog aus ADR-002 als Dokument, einschließlich der Auth-Mails (B13). Vorgaben: docs/development/ROADMAP.md, Zeile G3. Keine Cloud-Ressource anlegen.` |
| Ablaufrunde | `Ablaufrunde <Bereich> nach docs/development/OPTIMIERUNG.md` — nur, wenn die Methode dort nicht eingefroren ist; sonst die Zeile „Befund" |
| Befund | `Befund: <Beobachtung an der laufenden Anwendung, Bereich, Rolle>. In docs/development/BEFUNDE.md eintragen, nicht bauen.` |
| Sandbox | `/sandbox <Thema>` — Oberflächen-Prototyp nach dem Sandbox-Skill (Pfad S); endet mit der Frage „übernehmen oder verwerfen", beantwortet mit `/sandbox <Thema> übernehmen` (Härtungs-Ticket) oder `/sandbox <Thema> verwerfen` (Löschen) |
| Zweitreview | `Zweitreview <Loop-Kennung>: den Diff des offenen Pull Requests gegen die Review-Checkliste aus ADR-013 Fassung 2, Punkt 9 lesen. Befunde als Einzel-Story-Loop vorschlagen, nichts bauen.` — Pflicht nach Nr. 8 dieser Checkliste, sobald der Loop-Bericht den Zweitreview (A5) als ausstehend nennt; danach mergt Jannes |
| Kartendienst-Loop | `/feature-loop MAP-002 In-App-Kartenprototyp nach docs/development/MAP-LOOPS.md` — für MAP-003 bis MAP-005 entsprechend; MAP-006 erst nach dem Gate aus ADR-019 |
| Antworten und Abnahmen eintragen | `Docs-Session ohne Code: meine Antworten und Abnahmen in docs/development/ROADMAP.md und docs/decisions/OPEN_DECISIONS.md einarbeiten. Antworten: …` |
| Idee | `Ideenspeicher: <Idee in zwei Sätzen>. Nur eintragen, nicht bauen.` |
| Roadmap prüfen | `Planungssession ohne Code: Gesamtstand prüfen (git fetch, Branches, Pull Requests), docs/development/ROADMAP.md gegen den Stand nachstellen, nächsten Loop vorschlagen. Nichts bauen.` |

---

## Ziel: Produktionsreife Ende März 2027, Eröffnung 01.07.2027

Entschieden von Jannes am 2026-09-05 und präzisiert am 2026-09-06: Die Praxis
**nimmt den Betrieb am 01.07.2027 auf**, das Personal Training ebenfalls. Es
gibt kein Vorgängersystem, keine Bestandspatient:innen, keine offenen
Rechnungen und keinen alten Nummernkreis — deshalb keine
Bestandsdatenübernahme und keinen Parallelbetrieb. Die Software ist
**spätestens zum 31.03.2027 produktionsreif**; die drei Monate bis zur
Eröffnung sind Puffer und Eröffnungsvorbereitung. Früher ist erlaubt (E-15):
Was fertig und abgenommen ist, wartet nicht auf seinen Monat.

Drei Zeitpunkte, die auseinandergehalten werden (ADR-007 Punkt 6 erlaubt vor
dem Gate nur synthetische Daten):

- **Go-live-Gate** (M3, 19.03.2027): alle Vorbedingungen erfüllt, Freigabe
  durch Jannes.
- **Produktionssystem steht** (M4, 31.03.2027): Produktivprojekt angelegt und
  nach OPS-007 erstbefüllt — Organisation, Standort, `owner`, Katalog,
  Stammdaten. Ab hier dürfen echte Daten hinein (etwa Anmeldungen für die
  Eröffnung), müssen aber nicht.
- **Eröffnung** (M5, 01.07.2027): erster Behandlungstag mit der Software.
  Danach vier Wochen Stabilisierung bis M6 (31.07.2027).

**Go-live-Umfang (Stufe 1) — Kern:** Patient:innen mit Zugangshinweis ·
Verordnungen · Termine mit Serien und Zustandsautomat (sechs erreichbare
Zustände) · Behandlungsdokumentation mit Abschluss in einem Schritt und
Textbausteinen · Navigations-Handoff (Google Maps, Apple Maps) aus der Tagesliste ·
Tagesplan-Cache lesend · Leistungen, Rechnung mit Empfänger, Storno, PDF,
Zahlungserinnerung · Zahlungen mit Teilzahlung · Mitarbeitende mit Konten,
Rollen, Passwort-Selbstbedienung · Auditlog · Löschung und Retention ·
Dateiablage mit Verordnungsscan · Datenschutzinformation · Tagesplan
druckbar · alles aus Etappe G und H.

**Komfort in Stufe 1** (wird bei Zeitnot zuerst geschoben, Abweichungsregel
2): UI-001 Politur · OPS-005 als Automatisierung · Rückzahlungs-UI ·
Legal-Hold-Oberfläche · OPS-006 als vollständige Funktion.

**Stufe 2 vor der Eröffnung (spätestens April bis Juni 2027):** Tagesroute
auf der Karte mit Navigation (MAP-002 bis MAP-006, ADR-019 Fassung 2) · dann
Anamnese und Fragebögen (Etappe 2), weil zur Eröffnung jede Patientin neu ist
· der letzte Monat vor der Eröffnung bleibt frei für Probewoche 2 und Befunde.

**Stufe 2 nach der Eröffnung (ab August 2027):** Übungspläne (Etappe 3) ·
Warteliste (`IDEA-PRX-003`) · Terminerinnerung und Online-Anfrage (B15) ·
Fahrzeiten und Erreichbarkeit (MAP-006) · der Praxisbetrieb aus Spur
A2 · Kennzahlen, Export für die Steuerberatung. Bewusst nicht früher, weil
jeder Punkt einen neuen Dienstleister, eine Einwilligung oder Betriebserfahrung
braucht (§3.5, ADR-002). Die Vorschaubereiche bleiben bis dahin
gekennzeichnete Vorschau.

**Stufe 3 (frühestens Q4 2027):** die Plattform für Patient:innen und
Kund:innen — Etappen 4 bis 10, siehe eigenen Abschnitt.

### Rückwärtsplan

Kapazität je Monat in Code-Loops (Annahme: zwei je Woche, siehe „Kapazität und
Puffer"); „Last" zählt nur Code-Loops. Docs-Sessions und Jannes-Aufgaben stehen
getrennt, weil sie andere Ressourcen brauchen. Die Monate sind
Spätest-Termine; die Reihenfolge innerhalb einer Spalte und über die Zeilen
hinweg ist das Verbindliche (E-15).

| Monat       | Kap. | Code-Loops (Last)                                                                                   | Docs-Sessions                                                                          | Jannes liefert / entscheidet                                                                                                                              | Extern                           | MS     |
| ----------- | ---- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------ |
| Sep 2026    | 7    | **erledigt (13 Code-Loops):** VER-EPIC-001 · UI-000 · UX-EPIC-001 · STAFF-EPIC-002 · LOE-EPIC-001 · CAL-EPIC-003a/b · DAT-EPIC-001 · MARKE-001, AKTE, UX-012, UI-002, FIX-EPIC-001/003, CAL-012 bis CAL-017 | ADR-017 · ADR-018 · ADR-019 (alle angenommen) · Dokumentations-Audit 2026-09-13 · **OPS-001 Providerprüfung offen** | Branch Protection, Secret Scanning · B1/B2/B4 anfragen · Genehmigung Kartendienst schriftlich ablegen · Abnahmen der Loops seit dem 12.09. | —                                | M0     |
| Okt 2026    | 9    | ROL-EPIC-001 · CAL-018 · VER-EPIC-002 · ABR-EPIC-001 (4)                                            | OPS-001 abschließen · VVT- und TOM-Entwurf                                              | Test-Cloudprojekt anlegen (nach OPS-001) · Leistungskatalog mit Preisen · Praxisstammdaten, Logo, Bank · PTV-Free-Abo · Urlaub eintragen                   | —                                | —      |
| Nov 2026    | 8    | ABR-EPIC-002a Rechnung · ABR-EPIC-003 Zahlungen · ABR-EPIC-002b Dokument/Storno · MAP-002 (4)         | Löschkonzept, Breach-Prozess, Subprozessoren                                            | B4-Termin · steuerliche Grundeinstellungen (G13); PDF-Weg (B14) am 2026-09-19 entschieden                                                                  | B4 Ergebnis                      | —      |
| Dez 2026    | 6    | E2-Funktion Tagesplan · PAT-006 · MAP-003 · Befunde (4)                                              | DSFA-Entwurf an die Prüfung (15.12.)                                                   | Ende-zu-Ende-Abnahme · Feldtag 1                                                                                                                          | B2 Ergebnis                      | M1     |
| Jan 2027    | 8    | OPS-003 Backup/Restore · OPS-004 Logging (mit OPS-005 minimal) · OPS-006 minimal · OPS-007 Bootstrap · MAP-004 · MAP-005 · Befunde (7) | Betriebsdokumentation · BETRIEB-001                                                     | Restore-Test mitführen · Notfallzugang verwahren · Endgeräte-Richtlinie                                                                                    | DSFA-Rückfragen                  | —      |
| Feb 2027    | 8    | Befunde aus Probewoche 1 · UI-001 Politur (3)                                                       | Rückfallplan (Papierprozess aus E2) · Kurzanleitung „erster Tag" · Messrunde vor dem Gate | Probewoche 1 (H1) · Restore-Test 2 · Feldtag 2 · **Feature-Freeze Stufe 1 am 26.02.**                                                                     | B1 Ergebnis · DSFA abgeschlossen | M2     |
| Mär 2027    | 8    | **Puffer** — nur Befunde und Dokumentation (0 geplant)                                              | Nachweistabelle MUSS → Test/Policy · Vertragscheck PTV Developer (Gate aus ADR-019)     | Go-live-Gate 19.03. · Produktions-Bootstrap nach OPS-007 am 31.03.                                                                                        | —                                | M3, M4 |
| Apr 2027    | 8    | MAP-006 Patient/Tour-Integration · Befunde aus dem Produktivsystem (1)                                     | DSFA-Wiedervorlage Kartendienst                                                        | PTV Paid Plan und Server-Schlüssel (Jannes, nicht der Agent) · Abnahme auf einer echten Radrunde mit synthetischen Adressen                                    | —                                | —      |
| Mai 2027    | 8    | FRB-EPIC-001 · FRB-EPIC-002 (2)                                                                     | Optimierungsrunde Touren (vier Wochen nach MAP-006)                             | B8 Lizenzfrage klären · Probewoche 2 vorbereiten (Seed: eine Eröffnungswoche)                                                                             | B8                               | —      |
| Jun 2027    | 8    | **Puffer** — Befunde aus Probewoche 2 (0 geplant)                                                   | Erster-Tag-Protokoll · Schulung, falls eine zweite Person da ist                        | Probewoche 2 (H5) · Restore-Test 3 · **Change-Freeze ab 17.06.** · erste echte Patient:innen anlegen                                                      | —                                | —      |
| Jul 2027    | 4    | **Stabilisierung** — Hotfixes und Befunde (0 neue Epics)                                            | —                                                                                      | **Eröffnung 01.07.** · Störfallliste führen · Optimierungsrunde nach vier Wochen Betrieb                                                                   | —                                | M5, M6 |
| ab Aug 2027 | —    | Stufe 2 nach der Eröffnung (Etappe 3, Warteliste, Feinjustierung der Erreichbarkeitswarnung aus MAP-006, Spur A2) · danach Stufe 3 in der Reihenfolge des Abschnitts „Stufe 3" |                                                                                        |                                                                                                                                                           |                                  |        |

Sperrzeit 21.12.2026 bis 04.01.2027; Jannes' Urlaub wird eingetragen, sobald
er feststeht. Rechnung (Stand 13.09.): 13 Code-Loops sind im September gebaut; von Oktober
bis Februar sind rund 21 bei 39 Loop-Plätzen geplant — gut die Hälfte. Von April bis Juni drei Loops bei 24 Plätzen.
Der Rest ist Puffer für Abnahme, Befunde, Krankheit und dafür, dass die
Startwoche kein Maß ist.

### Meilensteine

Ein Meilenstein gilt als erreicht, wenn **alle** Kriterien erfüllt sind. Das
Wochenupdate meldet je Meilenstein grün (auf Kurs), gelb (ein Kriterium
gefährdet), rot (Termin nicht haltbar).

| MS  | Termin     | Name                     | Kriterien                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0  | 30.09.2026 | Vorlauf gesichert        | B1, B2, B4 angefragt: Stelle benannt, Termin zugesagt · OPS-001 dokumentiert, Ergebnis positiv (ADR-017 am 2026-09-12 und ADR-018 am 2026-09-11 angenommen) · Branch Protection und Secret Scanning aktiv · Genehmigung des Kartendienstes schriftlich abgelegt                                                                                                    |
| M1  | 18.12.2026 | Kernprozess Ende-zu-Ende | Ein synthetischer Fall läuft auf der Test-Umgebung durch: Verordnung → Serie → Termin durchgeführt → Dokumentation finalisiert → Leistung → Rechnung als PDF → Zahlung · von Jannes abgenommen · jede Stufe-1-Datenklasse hat Löschpfad und Test · B4 liegt vor                                                                                  |
| M2  | 26.02.2027 | Betriebsbereit           | Restore-Test 1 bestanden inklusive Löschungen · Deployment aus Tag mit Freigabe · Redaction-Prüfung grün · Betriebsdokumentation (13 Positionen) · Probewoche 1 durchlaufen, Befunde geschlossen · Kollegin-Test durchlaufen · DSFA-Entwurf bei der Prüfung · **Feature-Freeze Stufe 1**                                                        |
| M3  | 19.03.2027 | Go-live-Gate             | ADR-007 sieben Vorbedingungen · B1- und B2-Ergebnis liegt vor · kein Register-Eintrag Datenschutz/Recht auf `offen` oder `entschieden (Jannes)`, kein Punkt in `OPEN_DECISIONS.md` auf `vorläufig entschieden` · Restore-Test 2 bestanden · OPS-007 gegen die Test-Umgebung geprobt · Rückfallplan (Papierprozess) unterschrieben · Messrunde: Zielwerte aus `OPTIMIERUNG.md` erreicht oder als Abweichung dokumentiert, kein täglicher Ablauf mit Score 0 |
| M4  | 31.03.2027 | Produktionssystem steht  | Produktivprojekt in freigegebener EU-Region aus dem freigegebenen Tag · OPS-007 durchlaufen: Organisation, Standort, `owner`, Katalog, Stammdaten · keine synthetischen Daten im Produktivsystem · Backup, Monitoring und Release-Takt nach BETRIEB-001 aktiv                                                                                    |
| M5  | 01.07.2027 | Eröffnung                | Probewoche 2 durchlaufen, Befunde geschlossen · Restore-Test 3 bestanden · Change-Freeze seit 17.06. eingehalten · Datenschutzinformation und Behandlungsvertrag in der Fassung mit Kartendienst liegen vor (PAT-006) · erster Behandlungstag läuft mit der Software                                                                            |
| M6  | 31.07.2027 | Erster Betriebsmonat     | Vier Wochen Betrieb ohne offenen Befund der Klasse „Datenverlust/Falschzuordnung" · Störfallliste ausgewertet · Optimierungsrunde nach vier Wochen Betrieb durchgeführt · Spur A2 und Stufe 3 freigegeben                                                                                                                                       |

### Kapazität und Puffer

Gemessen sind acht Epics in den ersten neun Tagen (109 Commits, 53 Prozent am
Wochenende); die Startwoche ist kein Maß. Der Plan rechnet mit **zwei
Code-Loops je Woche** und rund **fünf Stunden Jannes-Zeit je Woche**: Sessions
starten, Fragen beantworten, eine Stunde Abnahme. **Der Engpass ist nicht die
Baukapazität, sondern Jannes' Zeit für Entscheidungen, Abnahmen und externe
Anfragen.** Deshalb zählt die Fortschrittstabelle abgenommene, nicht gebaute
Epics.

Der Softwareanteil von Stufe 1 ist bis M1 eingeplant; Januar und Februar
gehören der Betriebsreife und der Probewoche; **der März ist Puffer** und
nimmt nur Befunde und Dokumentation auf. **April bis Juni** sind das zweite
Polster: zwei Stufe-2-Loops, die als erste entfallen, wenn Stufe 1 rutscht.

**Abweichungsregel, abgestuft:**

1. Ist M0 am 30.09. nicht erreicht, führt das Wochenupdate den fehlenden Punkt
   namentlich, bis er erledigt ist; kein Loop ersetzt ihn.
2. Ist M1 am 18.12. nicht erreicht, wandern die Komfort-Pakete hinter M4. Der
   Kern wird nicht gekürzt.
3. Ist M2 am 26.02. nicht erreicht oder fehlt im Februar ein Ergebnis aus
   B1/B2, rutschen M3 und M4 monatsweise. **Die Eröffnung am 01.07.2027 rutscht
   nicht.** Zuerst entfallen die Stufe-2-Loops vor der Eröffnung (FRB vor
   TOUR), dann schrumpft der Juni-Puffer. Ist M4 am 31.05.2027 nicht erreicht,
   eröffnet die Praxis mit dem Papierprozess aus E2 (H4), und die Software
   folgt — nie umgekehrt, und nie auf Kosten einer Sicherheits- oder
   Datenschutzmaßnahme (`PROJECT_PRINCIPLES.md` §16).

### Risiken

| Nr  | Risiko                                                                          | Eintritt | Wirkung   | Frühindikator                              | Gegenmaßnahme                                                                                       | Wer           |
| --- | ------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------- |
| R1  | Externe Prüfungen B1/B2 liefern später als Februar                              | hoch     | hoch      | M0 ohne zugesagten Termin                  | Anfrage im September mit Fristwunsch; Entwürfe bis 15.12.; zweite Stelle anfragen; April–Juni als Reserve | Jannes        |
| R2  | Providerprüfung Supabase negativ                                                | niedrig  | sehr hoch | OPS-001 nicht bis 30.09. dokumentiert      | Prüfung vorziehen; erst danach ADR-017 und ABR-Datenmodell finalisieren                            | Claude/Jannes |
| R3  | Jannes' Zeit reicht nicht für Entscheidungen und Abnahmen                       | hoch     | hoch      | zwei Wochen ohne abgenommenes Epic         | fester Wochentermin; gehostete Test-Umgebung; Entscheidungen als Optionen mit Empfehlung             | Jannes        |
| R4  | Neue Dienstleister (PDF, Kartendienst) erst spät geprüft                        | mittel   | mittel    | Spur-B-Punkt ohne Termin                   | B14 im November; Kartendienst: Prüfkatalog liegt seit MAP-001 vor, Vertragsdokumente im Oktober laden, Gate mit B2; Prototypen MAP-002 bis MAP-005 hängen nicht am Vertrag | Claude/Jannes |
| R5  | Feiertage und Urlaub kosten drei Wochen                                         | sicher   | mittel    | —                                          | 21.12.–04.01. gesperrt; Urlaub im Rückwärtsplan                                                     | Jannes        |
| R6  | Befunde aus der Abnahme kommen als Welle im Januar                              | hoch     | mittel    | Fortschrittstabelle ohne Abnahmedatum      | Abnahme je Epic binnen sieben Tagen; Befunde im Folge-Loop derselben Spur                           | beide         |
| R7  | Scope wächst aus Ideenspeicher, Wettbewerbsvergleich und Plattform-Zielbild     | mittel   | mittel    | Story ohne Bezug zum Stufe-1-Kern          | Feature-Freeze M2; Ideen nur eintragen; Scope-Bremse aus `OPTIMIERUNG.md`; Stufe 3 erst nach M6    | beide         |
| R8  | Parallele Branches erzeugen Merge-Arbeit                                        | mittel   | niedrig   | mehr als ein aktiver Feature-Branch        | Regel „ein Feature-Branch, Docs sofort mergen"                                                      | Claude        |
| R9  | `pg_cron` oder andere Annahmen gelten beim Provider nicht                       | niedrig  | mittel    | OPS-001-Katalog                            | in OPS-001 prüfen; Fallback in ANN-007                                                              | Claude        |
| R10 | Mobile Endgeräte ohne Richtlinie (Verlust, Sperre, MFA, Kartenverlauf)          | mittel   | hoch      | TOM ohne Abschnitt Endgeräte               | Endgeräte-Richtlinie in G14 (mit Google-Konto und Kartenverlauf); „Alle Sitzungen beenden" **gebaut** (STAFF-004); MFA einrichtbar, Pflicht vertagt bis zur Domain (ANN-028) | beide         |
| R11 | Eröffnung ohne Software, weil M4 um mehr als zwei Monate rutscht                | niedrig  | sehr hoch | M3 im März verfehlt                        | Abweichungsregel 3; Papierprozess aus E2 als Rückfall; Stufe-2-Fenster als Reserve                  | Jannes        |
| R12 | **Eingetreten 2026-09-08, aufgelöst am selben Tag.** Kein AVV für die Google Maps Platform | eingetreten | niedrig | ADR-019 Fassung 1                        | Weg C statt Weg B: Anbieter mit AVV (PTV Developer als Kandidat, ADR-019 Fassung 2); Rest-Risiko R13 | Claude/Jannes |
| R13 | PTV Developer scheitert am Vertrags-/§203-Gate (kein §203-Wortlaut gefunden, Retention unbekannt, Zweitnutzungsklausel in US-Terms) | mittel   | mittel    | ein Gate-Punkt aus Teil 5 des Prüfdokuments negativ | Adapter hinter `contract.ts` — Anbieterwechsel ohne UI-Umbau; zweite Wahl MapTiler (Karte) und HERE (Routing) mit eigener Prüfung; Vertragsdokumente früh laden | Claude/Jannes |

---

## Drei Spuren zum Bauen, eine zum Entscheiden

| Spur   | Inhalt                                                                          | Wer                   |
| ------ | ------------------------------------------------------------------------------- | --------------------- |
| **A1** | Kernprozess: Klinik, Bedienung im Hausbesuch, Tagesroute, Abrechnung; Fernplan | Claude, Feature-Loops |
| **A2** | Praxisbetrieb: Urlaub, Zeitkonto, Flotte, Erstattungen, Team                    | Claude, nach M6       |
| **A3** | Betriebsreife (Etappe G) und Eröffnung (Etappe H)                               | Claude und Jannes     |
| **B**  | Entscheiden: offene Punkte mit Fälligkeit                                       | Jannes, teils extern  |

**Takt:** A1 hat Vorrang bis M1. A3 läuft parallel, wo Jannes-seitige
Vorlaufarbeit nötig ist; ab Januar hat A3 Vorrang. Von April bis Juni läuft
A1 mit Stufe 2 in dem Maß, das Stufe 1 übrig lässt. A2 beginnt nach M6. Ein
Loop je Session; zwei Code-Loops je Woche sind das Maß.

---

## Spur A1 — Kernprozess

### Etappe 1 — Der Kernprozess wird vollständig und bedienbar (bis M1)

**Warum zuerst:** Verordnung → Termin → Dokumentation → Leistung → Rechnung
ist die Kette, auf der eine Praxis läuft. Neu gegenüber 2.0: die Kette wird
nicht nur fachlich geschlossen, sondern dort bedienbar gemacht, wo sie heute
schon reibt — Tagesliste ohne Adresse, kein Folgetermin, sechs Taps für die
Dokumentation, keine künftigen Termine in der Akte, kein Schutz vor
Textverlust (Produktreview vom 2026-09-06, in der Git-Historie).

Spalten: Kennung · Ergebnis in einem Satz · Stories · Voraussetzung · Jannes
liefert.

| Loop              | Ergebnis                                                           | Stories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Voraussetzung                                                     | Jannes liefert                                          |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| ~~DOK-EPIC~~      | Behandlungsdokumentation mit Finalisierung                         | DOK-001 bis DOK-004                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **fertig** (PR #5, PR #9)                                         | abgenommen 2026-09-11                                   |
| ~~VER-EPIC-001~~ | Verordnungen liegen in der Akte, mit Kontingent und Verordner:in   | **PAT-005** Stammdaten: Telefon (Geschäftlich), Mobil, Telefax, Einrichtung, Besonderheit, Bemerkung, feste Therapeut:in, **Zugangshinweis Hausbesuch** (`IDEA-PRX-001`) · **VER-001** Datenmodell Verordnung mit `prescribers`, Positionen mit verordneter/genutzter Menge, Erst-/Folgeverordnung, Empfehlung zum Verordnungsende · **VER-002** je Patient:in, nach Jahr · **VER-003** anlegen und bearbeiten                                                                                                                                                                                                                                                                                                                                                                                                                                       | **fertig 2026-09-07** | abgenommen 2026-09-11 |
| ~~UI-000~~ | Das Fundament trägt die nächsten zwanzig Seiten                    | Tokens `ink-subtle` und `line-strong` auf AA heben, Kontrast-Test · Bausteine `ButtonLink`, `Rueckfrage`, `Section`, `DataRow`, `Statusmeldung`, `SearchField` und Ersetzen der Duplikate · Druck-Basis (`@media print`, entschieden 2026-09-06) · Verbindungsanzeige · 375-px-Screenshot-Helfer · axe als Dev-Abhängigkeit für die automatische Barrierefreiheitsprüfung (entschieden 2026-09-06) · Oberflächen-Checkliste in `docs/abnahme/README.md`                                                                                                                                                                                                                                                                                                                                                                                             | **fertig 2026-09-07** | abgenommen 2026-09-11 |
| ~~UX-EPIC-001~~ | Ein Hausbesuchstag läuft ohne Umwege durch die Anwendung           | Tagesliste mit Adresse, `tel:`-Link, Zugangshinweis, „Offen heute" · Navigations-Handoff an Google Maps (ADR-019, ANN-018) · Folgetermin und Tap auf freie Zeit im Kalender (`IDEA-PRX-007`) · nächste Termine in der Akte · „Behandlung abschließen" in einem Schritt · Textverlust-Schutz und Verbindungsanzeige · Tagesplan-Cache lesend (ANN-021, `IDEA-PRX-014`) · Touch-Ziehen nach Long-Press · serverseitige Patientensuche (`IDEA-PRX-020`) · Textbausteine (`IDEA-PRX-011`) — UX-001 bis UX-011 | **fertig 2026-09-11 (PR #18)** | abgenommen 2026-09-11 |
| ~~LOE-EPIC-001~~ | Löschung und Retention sind gebaut und getestet                    | **LOE-001** Datenklassen und Retention Schedule an genau einer Stelle (ANN-001), Anker „Abschluss der Behandlung", Legal Hold (Modell; Oberfläche Komfort) · **LOE-002** Löschjournal mit idempotenter Wiederanwendung, Auditbezug, alle Versionen; `pnpm test:db` deckt jede Datenklasse ab                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **fertig 2026-09-11 (PR #25)** | abgenommen 2026-09-11 |
| ~~CAL-EPIC-003a~~ | Termine kennen alle Zustände, die die Praxis heute braucht         | **CAL-008** Zustandsautomat nach ADR-018: bestätigt, abgesagt (mit Grund), nicht angetroffen (Ausfallhonorar-Kennzeichen), durchgeführt (aus „Behandlung abschließen"), dokumentiert (aus Finalisierung), abgerechnet (aus ABR-003); Migration der heutigen Status; Auditkatalog · **CAL-009** Tag umplanen: alle Termine einer Person eines Tages absagen/vormerken mit Anrufliste (`IDEA-PRX-004`)                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **fertig** (PR #28); Voraussetzung ADR-018 war bestätigt           | abgenommen 2026-09-12                                   |
| ~~CAL-EPIC-003b~~ | Eine Verordnung wird in einer Minute zu einer Terminserie          | **CAL-007** Serie aus der Verordnung: Anzahl aus dem Kontingent, fester Rhythmus, Konfliktprüfung je Termin inline, Einzelabweichung · **CAL-010a** Terminfenster nach `PROJECT_PRINCIPLES.md` §8.1 (entschieden 2026-09-08): 60 Minuten einschließlich Dokumentation, Vorbelegung im Formular **und** serverseitige Durchsetzung in `create_appointment`/`update_appointment` — eine Vorbelegung allein erfüllt §8.1 nicht; geprüft wird nur ein **neu gesetztes** Zeitfenster, Bestandstermine bleiben gültig und rein organisatorisch bearbeitbar (dieselbe Abgrenzung wie beim Raster, CAL-005); Beginn weiter frei im 5-Minuten-Raster; Testfälle in `pnpm test:db` für beide Schreibpfade und für den Bestandstermin · ~~**CAL-010b** Fahrpuffer~~ **entfällt** (E12 Punkt 3 und 4, Jannes 2026-09-12): kein pauschaler Mindestabstand und keine von Hand gepflegten Fahrminuten — der Fahrpuffer kommt mit **MAP-006** aus echten Fahrzeiten, samt der Aufrundungsregel aus §8.1 und ihrem Testfall · **CAL-011** Terminzettel als Druckansicht (`IDEA-PRX-006`)                                                                                                                                                                                                                                                                                                                                                                                                                                       | **fertig 2026-09-12 (PR #29), dazu CAL-012 und CAL-013** | Abnahme offen |
| ~~ROL-EPIC-001~~  | **fertig 2026-09-15**, Abnahme steht aus — Office liest alles, was Therapeut:innen sehen — auditiert, ohne Schreibrecht | **ROL-001** Policies und Projektionen der Akte: `app.can_read_*` für `office` auf Dokumentation, Verlauf und Befunde; `list_patient_treatment_notes` statt Behandlungsnachweis, `treatment_note.viewed` auch für `office`; der Behandlungsnachweis bleibt als Rechnungssicht (ADR-004 Fassung 2, ADR-010) · **ROL-002** Verordnung und Dateien: Diagnose in den Verordnungsprojektionen für `office`, Dokumentart-Rollenschnitt aus ADR-017 Punkt 12 für Praxisrollen aufgehoben (Verordnungsscan sichtbar), Katalog bleibt · **ROL-003** Kommunikation, Oberfläche, Abnahmeschritte; `test:db` für jede geöffnete Sicht mit Negativfällen (kein Schreiben, Audit je Zugriff); Register (ANN-006 und ANN-011 abgelöst) | E15 (entschieden 2026-09-13); `PROJECT_PRINCIPLES.md` 0.10; ADR-004 Fassung 2 | Anfrage B2 um E15 ergänzen |
| ~~CAL-018~~       | **fertig 2026-09-16**, Abnahme steht aus — Die drei Hausbesuch-Szenarien werden geführt und setzen den Gebührenanlass richtig | Geführter Ablauf am Termin („Was ist passiert?"): Tür geöffnet ohne Behandlung → `complete_treatment` mit Pflichtvermerk, normale Abrechnung · nicht angetroffen → `record_no_show` verlangt das bestätigte Protokoll (15 Minuten, Klingeln, Anruf) und setzt `fee_basis = 'no_show'` · Absage unter 24 Stunden unverändert; Erklärtexte je Szenario; ANN-035 nachgezogen; Abnahmeschritte; `test:db` für Protokollpflicht und Gebührenanlass | E14 (entschieden 2026-09-13); ADR-018 Fassung 3; §8 in 0.10 | Rechnungstext für Fall 1 mit B4; **ANN-055** — gilt am Hausbesuch, Praxis- und Videotermin offen |
| ~~CAL-EPIC-004a~~ | **fertig 2026-09-18**, Abnahme steht aus — Ein Termin darf jede Länge haben, und das Ziehen fragt nach | Vorgabe in [`CAL-EPIC-004.md`](CAL-EPIC-004.md): **CAL-020** freie Terminlänge nach `PROJECT_PRINCIPLES.md` 0.11 §8.1 — Längenschranke raus aus `create_appointment`/`update_appointment`, Raster und Fenstergrenzen bleiben, Zeichen bei Abweichung von 45/60 **nur** bei Patiententerminen, Dauerauswahl mit freier Eingabe; die Testfälle aus CAL-010a und CAL-015b werden umgeschrieben, nicht gelöscht · **CAL-023** Rückfrage beim Verschieben mit alter und neuer Zeit, immer, den Arbeitszeit-Hinweis in **derselben** Rückfrage, Rückgängig-Leiste bleibt | `PROJECT_PRINCIPLES.md` 0.11 (steht); ANN-037 auflösen | Gegenlesen von 0.11 §8.1 |
| ~~FIX-EPIC-004~~ | **fertig 2026-09-18**, Abnahme steht aus — Der Kalender lässt sich bedienen, ohne den Blick zu verlieren | Befund-Loop zu **BEF-012 bis BEF-016** (Jannes, 2026-09-18), eingeordnet vor CAL-EPIC-004b, weil CAL-019 auf derselben Zieh-Mechanik aufsetzt: **FIX-016** Rückfragen als Fenster über dem Inhalt (`Rueckfrage`, `ArbeitszeitRueckfrage`), Rückweg nach dem Anlegen zum Aufrufer (BEF-016) · **FIX-017** Rückfrage beim Ziehen im Gitter — alter Platz als Umriss, neue Kachel voll, Knöpfe daran; keine gesperrten Kacheln mehr (BEF-013, BEF-015) · **FIX-018** Ziehen über den Ausschnitt hinaus: Auto-Scroll am Rand, Blättern während der Geste, „Verschieben nach …" als Weg ohne Zeiger (BEF-014) · **FIX-019** Verschieben und Anlegen in der Vergangenheit mit Hinweis statt Sperre, Migration (BEF-012) | CAL-023 (Rückfrage), UX-010 (langer Druck), UX-012 (Rückwege) | Festlegungen von Jannes (2026-09-18): Rückfragen immer als Fenster, Vergangenheit erlaubt |
| ~~CAL-EPIC-004b~~ | **fertig 2026-09-18**, Abnahme steht aus — Aus dem Kalender heraus entsteht jeder Eintrag, den der Tag braucht | **CAL-019** Zeitspanne auf freier Fläche aufziehen, dann Menü: Neuer Termin, Dauertermin, Fehlzeit, Dauerfehlzeit — Tastaturweg bleibt die Schaltfläche über dem Gitter; **keine Gruppentermine** (Jannes 2026-09-16) · **CAL-021** Fehlzeit und Dauerfehlzeit **als Ereignis** (gleiche Tabelle, gleicher Zustandsautomat, keine Leistung), frei benannte Fläche im Gitter, Serie mit den Rhythmen aus CAL-007, Ändern und Absagen je Termin **oder** je Serie; Abgrenzung zu Arbeitszeiten und Urlaub | CAL-EPIC-004a (freie Länge), CAL-015b bis CAL-017 (Ereignis) | — |
| ~~UX-013~~        | **fertig 2026-09-18**, Abnahme steht aus — Die Kopfleiste sucht Funktionen, Bereiche und Namen | Suchleiste wird Funktionssuche: Bereiche, Seiten und Vorgänge aus `arbeitsbereiche(user)` und den vorhandenen Routen, gefiltert auf das, was die Rolle aufrufen darf (Relevanz, **keine** Zugriffskontrolle — die bleibt serverseitig, §4.7); Tastatur zuerst (Strg/Cmd + K, Pfeiltasten über beide Gruppen, Eingabetaste, Escape), bei ~375 px bildschirmfüllend; Vorgänge nehmen den Rückweg mit (UX-012b), in der Adresse steht nie ein Name (ADR-011). **E17 Fassung 2** (Jannes, 2026-09-18): Die Namenssuche bleibt **zusätzlich** in der Leiste — zweite Gruppe, serverseitig wie in UX-004, feste Reihenfolge, damit nachrückende Namen die Auswahl nicht verschieben — und steht daneben im Bereich „Patient:innen“. Klinische Inhalte findet sie nicht (**ANN-061**) | E17 (Fassung 2 bestätigt); UX-004 | Verordnungssuche als eigene Story (unten) |
| ~~GRD-001~~       | **fertig 2026-09-18**, Abnahme steht aus — Ein Termin hängt an einer Behandlungsgrundlage; die Verordnung ist eine Bauart davon, der Selbstzahler die zweite | Nach [ADR-020](../adr/ADR-020-treatment-basis.md) (E16, Jannes 2026-09-16): Migration mit Umbenennung von `prescriptions`, drittem Wert `self_pay`, `prescriber_id` nullable mit Prüfung je Bauart; die acht Datenbankfunktionen, Policies und Projektionen nachgezogen; neue Auditwerte **neben** den alten (Historie wird nie umgeschrieben, ADR-010); Oberfläche nennt die Bauart, nicht das Oberwort; `pnpm test:db` für beide Bauarten samt Negativfällen. **Keine Preise, keine Pakete** (B11), keine Änderung an Abrechnung oder Rollenschnitt | ADR-020 (**angenommen 2026-09-16**), VER-EPIC-001 | — |
| ~~VER-EPIC-002~~  | **fertig 2026-09-18**, Abnahme steht aus — Das Office erfasst eine Verordnung mit wenigen klaren Eingaben | Vorgabe in [`VER-EPIC-002.md`](VER-EPIC-002.md): Heilmittelauswahl als beschriftete Kästchen (KG, MT, je als Doppelbehandlung, Hausbesuch), Feld „Anzahl möglicher Termine", „Genutzt" und „Position hinzufügen" entfallen, ein Feld „Anmerkungen", Diagnose bleibt; Bestandswerte erhalten; Empfehlung nur aus vorhandener Dokumentation; sechs Abnahmefälle | ROL-EPIC-001 (Sichtbarkeit), VER-EPIC-001; ANN-012, ANN-014/038/042 prüfen | Bestätigung der Feldvorgaben aus dem Plan |
| ~~CAL-EPIC-004c~~ | **fertig 2026-09-18**, Abnahme steht aus — Eine Verordnung lässt sich überplanen, und die Akte zeigt Termine je Verordnung | **CAL-022** über das Kontingent hinaus planen (die Constraint `used_quantity <= prescribed_quantity` **bleibt**: planen ist nicht verbrauchen), ungedeckte Termine sichtbar an Verordnung, Termin und Liste; Übertragen auf eine andere Verordnung derselben Patient:in als eigener, protokollierter Vorgang, alles oder nichts, nie mit abgerechneter Leistung · **AKTE-006** Termine je Verordnung gruppiert samt Deckung, eigener Abschnitt für Termine ohne Verordnung, Filter `?verordnung=` bleibt; Termin-Detailseite erst umbauen, wenn feststeht, wohin ihre sieben Vorgänge gehen (BEF-006) — **so gebaut**, sie bleibt unberührt | GRD-001 (die Klammer), VER-EPIC-002 (dieselben Zahlen); `pnpm test:db` | **ANN-067** (gedeckt sind die frühesten Termine), **ANN-068** (was sich übertragen lässt), **ANN-069** (Gruppierung je Richtung) |
| ~~**ABR-EPIC-001**~~  | Leistungen entstehen aus durchgeführten Terminen                   | **ABR-001** Leistungskatalog versioniert, Steuerkennzeichen je Position, Hausbesuchspauschale und Ausfallhonorar als Katalogpositionen · **ABR-002** Leistungserfassung am durchgeführten Termin, vorbelegt aus der Behandlungsgrundlage — **ohne Override**: `PROJECT_PRINCIPLES.md` §19 (Rang 1) schlägt den hier zuvor genannten protokollierten Override aus C1/ANN-006 (**ANN-072**). **ABR-000** ist nach ABR-EPIC-002a gewandert: Die Praxisstammdaten verbraucht erst die Rechnung, und sie vorzubauen widerspräche ADR-014                                                                                                                                                                                                                                                                                                                                                                                                                       | B4 als Annahme                                                    | Katalog mit Preisen, Stammdaten, Antwort aus G13        |
| ~~**ABR-EPIC-002a**~~ | Eine Rechnung entsteht aus Leistungen, mit dem richtigen Empfänger (fertig 2026-09-19) | **ABR-000** Praxis-Stammdaten für Rechnungen (Anschrift, Bank, Steuernummer, Umsatzsteuer-Status, Logo — die Datei liegt fertig in `marke/logo/own-motion-block-schwarz.svg`, schwarz ist laut `marke/README.md` genau der Fall Rechnung und Fax —, `owner`; aus ABR-EPIC-001 hierher verschoben am 2026-09-19) · **ABR-003a** Rechnungsempfänger-Stammdaten (Beihilfe, PKV, Betreuung, Eltern; `IDEA-PRX-010`) · Rechnung: Zustände nach ADR-009 bis „ausgestellt", Nummer erst bei Ausstellung, neuer Nummernkreis ab der ersten Rechnung (kein Altsystem; Format als Annahme, B4 bestätigt), Snapshot mit Verordnungsbezug, Sammelrechnung je Person und Monat mit Behandlungsnachweis (`IDEA-PRX-013`) · Optionen für das Rechnungs-PDF mit Aufwand vorlegen (B14)                                                                                                                                                                                                                                                                                                                                                                                                | ABR-EPIC-001                                                      | Nummernformat und Umsatzsteuer-Status (G13); PDF-Weg   |
| ~~**ABR-EPIC-002b**~~ | Die Rechnung ist ein Dokument, das bleibt (fertig 2026-09-19) | **ABR-003b** PDF nach **Weg 1 aus B14 — Browser-Druck der Rechnungsansicht** (entschieden 2026-09-19; Weg 3 serverseitig folgt nach OPS-001 und erfüllt dann erst ADR-009 Punkt 11), Ablage nach ADR-017, Storno- und Korrekturdokument (einfache Kette), Zahlungserinnerung als Dokument ohne Stufenlogik (`IDEA-PRX-012`, entschieden 2026-09-06). **Gebaut als ABR-003b/c/d**; die Ablage nach ADR-017 entfaellt mit Weg 1 (die Anwendung sieht die Datei nie) und kommt mit Weg 3 | DAT-001 | **ADR-009 Punkt 11 offen bis Weg 3** (OPS-001) |
| ~~**ABR-EPIC-003**~~ | Zahlungen und offene Posten sind nachvollziehbar (fertig 2026-09-19) | **ABR-004** Zahlungen als eigene Transaktionen mit Richtung statt Vorzeichen, Teilzahlung und Überzahlung, offene Posten mit Summe auf der Einstiegsseite (0 Taps), Buchen an der Zeile (3 Taps). Der Zahlungsstand ist **abgeleitet und nirgends gespeichert** (ADR-009 Punkt 12, **ANN-078**); Storno mit Grund statt Löschen. Rückzahlung im Modell **und** in der Oberfläche — sie war derselbe Vorgang mit anderer Richtung und deshalb kein eigener Aufwand                                                                                                                                                                                                                                                                                                                                                                                             | ABR-EPIC-002a                                                     | —                                                       |
| ~~FIX-EPIC-001~~  | Zugang und Sitzung halten, was sie versprechen                     | **FIX-001** Links aus den Auth-Mails haben einen Empfangspfad: zwei oeffentliche Seiten `/kennwort-neu` und `/zugang`, eingeloest ueber `token_hash` und `verifyOtp` statt ueber eine Sitzung in der Adresszeile, eigene Mailvorlagen, Gate mit oeffentlichem Routenzweig (ANN-043) · **FIX-003** Auditvermerk zu "Alle Sitzungen beenden" als Vorbedingung statt Scheinbeleg, `melde()` erkennt Fehlschlaege, die Zusage nennt das Restfenster und verweist auf die Sperre (ANN-044) · **FIX-004** gewoehnliches Abmelden endet nur diese Sitzung (ANN-045) · **FIX-005** Cache und Entwuerfe werden an jeder Identitaetsgrenze geraeumt, nicht nur beim Knopf in der Kopfzeile (ANN-021 umgezogen) · **FIX-006** Abnahmeschritte, Register, Roadmap | **fertig** (2026-09-12)                                           | Abnahme offen — braucht Docker                          |

**Bewusst nicht Teil von Etappe 1:** Mahnautomat mit Stufen (ABR-005, nach
Praxiserfahrung) · Kostenträger, Versichertennummer, Zuzahlung (GKV) ·
E-Rechnung · Kassenbuch, TSE, Kartenzahlung · Factoring · Terminerinnerung
per SMS/E-Mail und Online-Terminbuchung (Anbieter, Einwilligung; `B15`) ·
Warteliste mit Zeitfenstern (`IDEA-PRX-003`, Stufe 2 nach der Eröffnung,
entschieden 2026-09-06) · automatische Terminsuche (`IDEA-PRX-008`) ·
Kennzahlen (`IDEA-PRX-025`) · Export für die Steuerberatung (`IDEA-PRX-026`,
sobald B4 das Format nennt) · Unterschrift und Behandlungsbestätigung am
Hausbesuch (`IDEA-PRX-015`, verworfen 2026-09-06: nicht nötig) · **Suche über
Verordnungen und Termine** in der Kopfleiste (Frage von Jannes, 2026-09-18;
UX-013 findet Funktionen und Namen): bräuchte eine eigene serverseitige
Suchfunktion mit Policy, eine Entscheidung darüber, ob ein Suchtreffer ein
auditpflichtiger Zugriff ist (ADR-010), und eine Datenschutzentscheidung zur
Diagnose als Suchfeld (**ANN-061**) — eigene Story, nicht eingeplant. ·
**Adressfragment `verordnungen` auf `grundlagen` umstellen** (GRD-001,
2026-09-18): Die Beschriftungen folgen seit GRD-001 der Bauart, die Adressen
nicht (**ANN-062**). CAL-EPIC-004c hat die Routen geöffnet und die Umstellung
**bewusst nicht** mitgenommen: Sie berührt jeden Verweis auf `…/verordnungen`,
gewinnt fachlich nichts und braucht einen Weg für vorhandene Lesezeichen —
sie bleibt damit ungeplant und wartet auf einen Loop, der ohnehin an den
Adressen arbeitet · **`src/features/treatment-bases` in Grundlage und Verordnerkartei
teilen** (GRD-001, 2026-09-18): Der Ordner trägt beides; die Verordnerkartei ist
fachlich ein Satellit der Verordnung und könnte ein eigener Bereich sein. Das
wäre ein Refactoring ohne fachlichen Gewinn und ist deshalb nicht eingeplant —
es teilt auch `optionalText`/`hoechstens`, die beide benutzen.

### Etappe T — Tagesroute und Navigation (Stufe 2, April 2027)

**Warum hier:** Das Lastenrad-Hausbesuchskonzept lebt von der Route. Jannes
hat am 2026-09-06 entschieden: eine Karte der gesamten Tagesroute, alle Wege
eines Tages auf einmal oder ein einzelner Weg als Vorschau, und immer ein
Handoff zur Navigation; am 2026-09-08 dazu: **Convenience hat hohe
Priorität** — In-App-Karte, Fahrradrouting und Fahrzeiten sind Produktziel,
kein Komfort. Die Google Maps Embed API aus E-16 ist damit überholt: Google
verarbeitet auf der Maps Platform als eigener Verantwortlicher, ein AVV fehlt
(§3.5). **ADR-019 Fassung 2** (MAP-001, 2026-09-08) setzt stattdessen auf
MapLibre im Browser, einen serverseitigen Anbieteradapter und **PTV Developer
als Kandidat für Prototyp und Bewertung**; Google Maps bleibt möglicher
Handoff-Zielpunkt. Die Loops MAP-002 bis MAP-006 stehen ausführlich in
[`MAP-LOOPS.md`](MAP-LOOPS.md); **TOUR-EPIC-001a und -001b sind darin
aufgegangen** (TOUR-001 bis TOUR-004 in MAP-006). MAP-002 bis MAP-005 laufen
mit synthetischen Daten und dem kostenlosen PTV-Abo, unabhängig vom
Vertragsstand; **MAP-006 erst nach dem Vertrags-/§203-/DSFA-Gate.** Ihre
Einordnung steht im Rückwärtsplan: MAP-002 November 2026, MAP-003 Dezember
2026, MAP-004 und MAP-005 Januar 2027, MAP-006 April 2027 (E-21 erledigt
2026-09-13).

| Loop               | Ergebnis                                                              | Stories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Voraussetzung                                                                          | Jannes liefert                                                                     |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **MAP-002** | Eine In-App-Karte mit nummerierten Teststopps läuft auf Desktop und 375 px | MapLibre-Komponente, PTV Vector Maps OSM, Overlays lokal, Fit-Bounds/Pan/Zoom, Vorschauseite `/touren/karte`; nur synthetische Tübinger Koordinaten | MAP-001; PTV-Free-Schlüssel (Jannes) | Schlüssel in `.env.local`; Support-Frage zur Domainbindung |
| **MAP-003** | Eine Fahrradroute zwischen Teststopps liegt als Linie auf der Karte, mit Distanz und Fahrzeit | Edge Function `location-provider` mit PTV- und Mock-Adapter (ANN-017), `OSM_BICYCLE` vs. `OSM_CARGO_BICYCLE`, Fehler-/Timeout-Zustände, keine Speicherung | MAP-002 | Server-Schlüssel als lokales Supabase-Secret |
| **MAP-004** | Fahrzeiten zwischen mehreren Stopps sagen deterministisch, ob zwei Termine erreichbar wären | `calculateMatrix()`, Domänenfunktion Erreichbarkeit in `scheduling`, Vorschau-Matrix; nichts persistent | MAP-003 | — |
| **MAP-005** | „Navigation starten" öffnet mit einem Tap die Navigations-App mit Zielkoordinate | `buildNavigationUrl` (ANN-018) für Google Maps, Apple Maps, `geo:`; Wegpunktlimit verifiziert; Gerätebewertung; keine Präferenz vorgebaut | MAP-002; UX-EPIC-001 (Adress-Handoff) | Gerätebewertung Android/iOS nach `docs/abnahme/` |
| **MAP-006** | Die Tagesroute liegt mit echten Adressen auf der Karte, mit Route, Fahrzeiten und Erreichbarkeit im Kalender | Koordinaten bei der Adresse (ANN-016), Geocoding beim Adress-Upsert, Startort (TOUR-001, §20), Marker lokal ohne Vollnamen, Route und Fahrzeiten (TOUR-002/003), Tourenliste druckbar (TOUR-004), Handoff mit Koordinaten, PAT-006, VVT, DSFA-Wiedervorlage; keine Speicherung von Fahrzeiten, kein Standort, kein Verlauf (§18, §20) · **dazu der Fahrpuffer aus §8.1** (früheste Folgezeit auf dem ersten Rasterpunkt auf oder nach Ende plus Fahrzeit, **aufrunden, nie abrunden** — Beispiel 09:05–10:05 plus 12 Minuten ergibt 10:20, als Testfall), sowie Warnung oder Sperre bei Unterschreitung: **E12 Punkt 3 und 4, hierher verlegt am 2026-09-12** | **Gate aus ADR-019 Punkt 9** (DPA, §203, Subprozessoren, Retention, EU-Region, Paid Plan, Edge-Runtime-Prüfung, DSFA) · MAP-003 bis MAP-005 · UX-EPIC-001 | Paid Plan, DPA-Ablage (G14), Abnahme auf einer echten Radrunde mit synthetischen Adressen |

### Etappe 2 — Anamnese, Verlauf, Bericht (Stufe 2, nach Etappe T, spätestens Mai 2027)

**Warum hier:** Der strukturierte Erstbefund ist der zweitgrößte Zeitfresser
nach der Dokumentation und die Datengrundlage für alles Spätere. Zur Eröffnung
ist **jede** Patientin eine Neuaufnahme — deshalb vor der Eröffnung, nicht
danach.

| Loop         | Stories                                                                                                                                                                                                       | Voraussetzung        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| FRB-EPIC-001 | **FRB-001** Instrumentenbibliothek, versioniert, mit Lizenzfeld (`IDEA-OUT-001`) · **FRB-002** freie Instrumente: NRS, patientenspezifische Funktionsskala (`IDEA-OUT-003`, `IDEA-OUT-004`)                   | —                    |
| FRB-EPIC-002 | **FRB-003** Anamnesebogen nach §7, in der Praxis ausfüllbar · **FRB-004** Verlaufsdarstellung mit Ereignismarkierungen, ohne Bewertung (`IDEA-OUT-005`) · Körperschema als Teil des Befunds (`IDEA-PRX-027`) | FRB-EPIC-001, **B8** |
| DOK-005      | Therapiebericht an die Verordner:in aus Befund und Verlauf (`PROJECT_PRINCIPLES.md` §4.2) — nach der Eröffnung                                                                                                | FRB-EPIC-002         |

### Etappe 3 — Übungspläne innerhalb der Therapie (Stufe 2, nach der Eröffnung)

Ein Heimprogramm, das die Therapeutin zusammenstellt und die Software nur
darstellt und ausgibt — Erfassen, Speichern, Strukturieren, Darstellen
(ADR-006 Punkt 2). **Keine automatische Anpassung**, keine Progression, kein
Vorschlag; B10 ist hier noch nicht nötig.

| Loop         | Stories                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UEB-EPIC-001 | **UEB-001** Übungsbibliothek: Übung und Variante getrennt, Achsen und Nachbarschaften, zwei Sprachebenen (`IDEA-TRN-005`, `IDEA-QSN-002`) · **UEB-002** Plan zusammenstellen, zuweisen, Schnappschuss (`IDEA-TRN-011`) |
| UEB-EPIC-002 | **UEB-003** Plan als PDF — voller Nutzen ohne Portal · **UEB-004** Planlaufzeit und Wiedervorlage (`IDEA-ORG-006`)                                                                                            |

### Stufe 3 — Plattform für Patient:innen und Kund:innen (frühestens Q4 2027)

Jannes am 2026-09-06: Die Praxissoftware ist nur ein Teilbereich. Geplant ist
eine Plattform für Patient:innen **und** für die Kund:innen seines Personal
Trainings, das ebenfalls am 01.07.2027 beginnt. Vorlage ist die fremde
Coaching-Software aus
[`../product/ideen/referenz-navigation.md`](../product/ideen/referenz-navigation.md)
(Übersicht, Kalender, Sessions, Check-ins, Fortschritt, Trainingspläne,
Übungsanalyse, Aktivitäten, Assessments, Athletenprofil, Gewohnheiten,
Ernährung, Chat, KI-Analyse); Jannes will ihren **Funktionsumfang
nachbauen** (E-18) — Vorlage für Umfang und Ablauf, nicht für Datenmodell,
Berechtigungen, Rechtsrahmen oder gestaltete Inhalte. Die Inhalte dazu stehen
seit dem 2026-09-01 im Ideenspeicher (Bereichsdateien 00 bis 09); neu ist,
dass Kund:innen **ohne vorherige Heilbehandlung** dazukommen
(`IDEA-LZK-008`). ~~Bis Stufe 3 läuft das Personal Training außerhalb der
Plattform: Kund:innen werden nicht als Patient:innen angelegt (andere
Datenklasse, andere Frist, kein Behandlungsvertrag), Rechnungen dafür
entstehen außerhalb; wie, klärt B4.~~

> **Überholt am 2026-09-17 (Festlegung von Jannes, E18).** Die Software wird
> vom Start weg für **drei** Zusammenhänge benutzt: Hausbesuche in der
> Physiotherapie, **Personal Training** und **Online Coaching**. Räume gibt es
> aktuell und mindestens im ersten Jahr nach dem Start keine. Damit ist der
> Satz oben hinfällig — Personal Training läuft **nicht** bis Stufe 3
> außerhalb der Plattform.
>
> **Die Antworten liegen seit dem 2026-09-17 vor** und stehen als
> Loop-Vorgabe in
> [`E18-LEISTUNGSBEREICHE.md`](E18-LEISTUNGSBEREICHE.md): Getrennt wird nach
> **Rechtsverhältnis, nicht nach Person** (`persons` ·
> `care_relationships` · `training_relationships`), der Termin bekommt einen
> `context`, die Steuerkennzeichen hängen am Rechnungsposten, und drei
> Feature-Verbote halten die MDR-Grenze. **Gebaut ist davon nichts.** Vor dem
> ersten Loop stehen vier ADRs und eine neue Fassung der Prinzipien; die
> Reihenfolge steht in der Vorgabe. Die Fragen, die dorthin geführt haben:
>
> 1. **Wer sind PT- und Coaching-Kund:innen im Datenmodell?** Ein eigener
>    Datensatz neben `patients` oder dieselbe Person mit einem zweiten
>    Verhältnis? Davon hängen Datenklasse, Aufbewahrungsfrist (ADR-008),
>    Rechtsgrundlage und der gesamte Rollenschnitt ab (ADR-004).
> 2. **Was ist ein Coaching-Termin?** Die Terminart `video` existiert; ein
>    Termin ohne Patient:in und ohne Verordnung existiert ebenfalls
>    (CAL-015b). Ob das reicht oder eine eigene Behandlungsgrundlage nötig ist
>    (ADR-020), ist offen.
> 3. **Abrechnung:** B4 und B9 rücken damit nach vorn — Umsatzsteuer,
>    Leistungsarten und Rechnungsnummernkreis für Leistungen **ohne**
>    Heilbehandlung im selben Unternehmen.
> 4. **Rechtsrahmen:** §203 StGB und die MDR-Abgrenzung (ADR-006) gelten für
>    Training anders als für Heilbehandlung. Was für Patient:innen gilt, gilt
>    nicht automatisch für Kund:innen — und umgekehrt.
> 5. **Rang 1:** `PROJECT_PRINCIPLES.md` §1 nennt als Gegenstand bisher nur die
>    Physiotherapiepraxis, §14 führt „Online Coaching" unter den Erweiterungen,
>    die **nicht vorzeitig** gebaut werden dürfen. Beide Stellen brauchen einen
>    Nachzug nach §21 — mit eigener Version, bewusst formuliert, nicht als
>    Nebenwirkung eines Feature-Loops.
>
> Die Reihenfolge der Etappe 1 bleibt unverändert, bis die Vorgabe in ADRs
> überführt ist. B4, B9 und B2 sind die externen Bestätigungen, die dafür
> gebraucht werden.

Was das für die Planung heißt:

- **Die Etappen 4 bis 10 des Fernplans sind diese Plattform.** Die Reihenfolge
  bleibt; die Plattform ist kein zusätzliches Programm daneben
  (`PROJECT_PRINCIPLES.md` §2.1).
- **Vorher zu entscheiden:** B5 (Identität, Vertretung) · B9, erweitert um
  Kund:innen ohne Heilbehandlung (Vertrag, Umsatzsteuer, Aufbewahrung,
  Rechtsgrundlage, Ernährung berufsrechtlich) · B11 (Pakete) ·
  `PROJECT_PRINCIPLES.md` §1 nennt bisher nur die Physiotherapiepraxis; die
  Ergänzung um Personal Training nach §21 kommt, wenn Stufe 3 beginnt
  (entschieden 2026-09-06, E-17) · Push-Nachrichten
  und Offline-Erfassung brauchen einen Service Worker — ADR-015 Punkt 16 wäre
  dann durch einen eigenen ADR zu ersetzen · Übungsanalyse, Assessments mit
  Bewertung und eine „KI-Analyse" sind `MDR_REVIEW_REQUIRED` (ADR-006,
  `IDEA-KI-006`).
- **Reihenfolge (entschieden 2026-09-06, E-19):** Etappe 4 Portalfundament →
  Etappe 3 Übungspläne mit Ausgabe im Portal → Etappe 5 Tracking und
  Check-ins → Etappe 6 Kommunikation (Chat als strukturierte Rückfrage) →
  Etappe 8 Kund:innen, Episoden und Pakete → Gewohnheiten und Aktivitäten
  zuletzt (`IDEA-ALT-006`); Ernährung ist mit B9 Punkt 6 vorerst
  ausgeschlossen (`IDEA-ALT-005` zurückgestellt)
  → Etappen 9 und 10 nach B10 und C6. Beginn frühestens nach M6, früher nur,
  wenn Stufe 1 und Stufe 2 vor der Eröffnung fertig und abgenommen sind
  (E-15).
- **Was aus dem Screenshot nicht übernommen wird:** „Athlet" (bei uns
  Patient:in oder Kund:in) · ein Sessions-Zähler, der Termine und
  Trainingseinheiten mischt (`IDEA-ORG-002`) · „KI-Analyse" als
  Handlungsempfehlung · eine Oberfläche, die eine 25-jährige Trainierende
  voraussetzt (`IDEA-QSN-006`).

### Fernplan — Etappen 4 bis 10

Ab hier wird die Reihenfolge gröber. Was in Etappe 6 steht, wird vor Etappe 5
noch einmal überprüft — Pläne, die zwölf Monate voraus genau sind, sind
erfunden. Vor Etappe 4 wird der Fernplan gegen die Wettbewerbsreferenz
(`docs/product/ideen/referenz-wettbewerb.md`), die Navigationsreferenz und die
Ergebnisse der ersten Betriebsmonate neu geprüft.

| Etappe | Inhalt                                                                                                                                                                                                                                                                                                                                                                                      | Voraussetzung                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 4      | **Portalfundament:** Zugang getrennt vom Praxiszugang (Account ≠ Akte, §4.6) · Termine ansehen · Intake vor dem Erstkontakt (größter Einzelnutzen) · Dokumente und Rechnungen · Einwilligungsverwaltung auf PAT-006 aufbauend · Datenexport (`IDEA-QSN-003`) · Onboarding mit Überspringen (`IDEA-LZK-005`) · Barrierefreiheit als Abnahmekriterium (`IDEA-QSN-006`)                     | **B5**                                   |
| 5      | **Tracking und Check-ins:** Einheit protokollieren (`IDEA-TRK-001`) · Check-in mit Takt (`IDEA-TRK-004`) · Bewegungssicherheit (`IDEA-TRK-003`) · Auslassquote (`IDEA-OUT-006`) · Offline-Erfassung (`IDEA-TRK-008`) · Benachrichtigungen mit Regeln (`IDEA-KOM-006`). Erfassen und darstellen, **nicht** auswerten.                                                                     | Etappe 4                                 |
| 6      | **Kommunikation:** strukturierte Rückfragen (`IDEA-KOM-001`) · Notfallabgrenzung (`IDEA-KOM-002`) · Foto/Video mit eigener Einwilligung, kurzer Frist, Metadatenentfernung (`IDEA-KOM-003`) · Zuordnung zur Akte (`IDEA-KOM-007`)                                                                                                                                                           | ADR-017, C2 (erledigt)                   |
| 7      | **Zeitstrahl und Sitzungsvorbereitung:** `IDEA-QSN-001`, `IDEA-ORG-005`, `IDEA-ORG-001`                                                                                                                                                                                                                                                                                                     | genug Inhalt aus 2 bis 6                 |
| 8      | **Kund:innen und Weiterbetreuung:** Betreuungsepisode mit Typ (`IDEA-LZK-002`), Kund:innen ohne vorherige Heilbehandlung (`IDEA-LZK-008`), Zweckbindung (`IDEA-LZK-003`), Klientenprofil (`IDEA-LZK-004`), Pakete und Guthaben (`IDEA-ANG-001`), Rückfall (`IDEA-ANG-003`), Preise (`IDEA-ANG-004`), Offboarding (`IDEA-LZK-006`). Hier wird aus der Praxissoftware eine Betreuungsplattform. | **B9** (erweitert), **B11**, §1-Ergänzung nach §21 |
| 9      | **Progression:** versioniertes deterministisches Regelwerk (`IDEA-TRN-002`), Schattenbetrieb (`IDEA-TRN-012`), Regeltests (`IDEA-QSN-004`), mehrdimensional (`IDEA-TRN-004`), doppelte Progression (`IDEA-TRN-007`), Adhärenz (`IDEA-TRN-009`), Wiedereinstieg (`IDEA-TRN-010`). Bis B10 entschieden ist: `MDR_REVIEW_REQUIRED`, produktiv nicht erreichbar.        | **B10** und externe Prüfung aus **B1**   |
| 10     | **KI-Assistenz:** zuerst der zentrale Pfad (`IDEA-KI-001`), dann Freitext strukturieren, Patientensprache, Antwortentwürfe — mit Quellenbindung (`IDEA-KI-003`) und menschlicher Freigabe                                                                                                                                                                                                   | Etappen 1 bis 3, ADR-005-Gateway, **C6** |

---

## Spur A2 — Praxisbetrieb (Stufe 2, nach M6)

Die Vorschaubereiche aus [`ARBEITSBEREICHE.md`](ARBEITSBEREICHE.md) bleiben
bis zu ihrem Loop stehen (entschieden 2026-09-05). Die drei Regeln für
Vorschauen stehen dort in Abschnitt 6 (seit 2026-09-13 mit Sandbox-Prototyp
statt „keine neue Vorschau"). Vor dem ersten A2-Loop
entscheidet eine Optimierungsrunde mit Zählung aus dem Betrieb, ob die
Reihenfolge noch stimmt. MAP-006 ersetzt die Vorschau `/touren` schon
im April 2027 (Etappe T).

| Reihenfolge | Loop                                                                                                                         | Ersetzt Vorschau        | Voraussetzung                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| 1           | **URL-001** Urlaub: Antrag, Genehmigung durch Teamleitung/Inhaber, Abwesenheit wirkt auf Kalender und Kapazität              | `/betrieb/urlaub`       | Urlaubsanspruch am Mitarbeiterdatensatz (`IDEA-QSN-010`) — Teil des Loops     |
| 2           | **ZK-001** Zeitkonto: Buchungen, Saldo je Person, keine Auswertung über Beschäftigte hinweg                                  | `/betrieb/zeitkonto`    | **B6** als Annahme (keine Leistungskontrolle, §20)                            |
| 3           | **FLT-EPIC-001** Radflotte: FLT-001 Räder, Depot, Schlüssel · FLT-002 Check-Up · FLT-003 Pannenassistent                     | `/betrieb/flotte…`      | Standortvorlage für Tübingen prüfen; Rad als Planungsressource des Kalenders  |
| 4           | **ERS-001** Erstattungen: eingereicht → genehmigt → ausgezahlt, Belege als Dateien                                           | `/betrieb/erstattungen` | ADR-017; steuerliche Belegaufbewahrung (B4)                                   |
| 5           | **TEAM-001** Teamkommunikation: Kanäle, Direktnachrichten, Threads, rollierende Speicherfrist (ANN-001), Anhänge nach ADR-017 | `/team`                 | ADR-017                                                                       |

---

## Spur A3 — Etappe G: Betriebsreife (vor M3)

| #   | Paket                                                 | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                                                | Wer                                   | Termin                  |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------- |
| G1  | ~~**ADR-017 Dateiablage**~~ — **erledigt 2026-09-12**, angenommen, alle acht Fragen wie empfohlen | Supabase Storage nach ADR-015 Punkt 10, signierte Verweise, Datenklasse und Retention nach ADR-008, Zugriff nach ADR-004, Audit nach ADR-010, Virenprüfung erst bei Patienten-Uploads. Schließt E8. **Die Reihenfolge zu OPS-001 ist präzisiert:** Storage ist kein neuer Dienstleister, deshalb ist der ADR vor der Prüfung schreibbar und liefert ihr **fünf zusätzliche Prüfpunkte**; **produktiv** wird die Ablage erst nach positivem OPS-001 und einem dokumentierten Sicherungsweg für den Bucket (G7). | Claude (Docs), Jannes bestätigt       | Sep 2026                |
| G2  | **STAFF-EPIC-002 Konten und Rollen**                  | STAFF-002 Zugang einladen, Rolle vergeben und ändern (auditiert) · STAFF-003 sperren, Passwort zurücksetzen, MFA für `owner` · **STAFF-004** Passwort vergessen als Selbstbedienung, alle Sitzungen beenden. E-Mails ausschließlich über die Auth-Mails des geprüften Providers (B13, entschieden 2026-09-06). Löst E11; E10 als Annahme (`owner`).                                                                                    | Claude                                | Okt 2026                |
| G3  | **OPS-001 Providerprüfung und Cloudprojekt**          | Prüfkatalog aus ADR-002 für Supabase dokumentieren, einschließlich der Auth-Mails (B13) **und der fünf Punkte zum Objektspeicher aus ADR-017** (Vertragsdeckung, Unterauftragskette, Löschung beim Anbieter, S3-Zugang für die Sicherung, Entzug signierter Verweise); bei positivem Ergebnis Cloudprojekt in EU-Region und Umgebungen Dev/Test/Prod. **Dokument im September, Anlage im Oktober.** Keine Cloud-Ressource durch einen Agenten (ADR-013).                                                      | Claude (Dokument), Jannes (Anlage)    | Sep/Okt 2026            |
| G4  | ~~**DAT-EPIC-001 Dateiablage**~~ — **fertig 2026-09-13**, Abnahme steht aus | DAT-001 Bucket, Berechtigungen, signierte Verweise, Datenklasse, Audit — **alles nach ADR-017**, einschließlich zweiphasigem Upload mit Bestätigung, Dokumentart als Rollenschnitt, Löschauftrag mit Quittung und einer Nachbildung von `storage.objects` im Test-Shim · VER-004 Scan-Anhang je Verordnung                                                                                                                               | Claude                                | Nov 2026                |
| G5  | **OPS-002 Deployment und Freigabe**                   | Frontend-Hosting mit Prüfung nach ADR-002; Release aus Tag mit menschlicher Freigabe; Migrationen nur über die Pipeline; Rollback; `service_role` nie im Browser; die Review-Checkliste aus ADR-013 Fassung 2 in der Pipeline verankern (die Liste selbst steht seit dem 2026-09-13). **Test-Umgebung im November**, damit Jannes ohne Docker abnimmt.                                                                                                                                                                                  | Claude (Pipeline), Jannes (Freigabe)  | Nov 2026                |
| G6  | **OPS-004 Logging, Redaction, Monitoring**            | Verbotsliste aus ADR-011 automatisiert geprüft, Entscheidung zu externem Error-Tracking, Alarmierung, Security-Log 12 Monate, Erkennung für Art. 33. **Enthält OPS-005 minimal:** Audit-Abfrage als Runbook für `owner`, abgewiesene Zugriffe protokolliert.                                                                                                                                                                              | Claude                                | Jan 2027                |
| G7  | **OPS-003 Backup und Restore-Test**                   | PITR aktiv, Backup-Lebenszyklus, Restore-Test in isolierter Umgebung inklusive Nachziehen der Löschungen, Notfallzugang verwahrt, Betriebsdokumentation mit den 13 Positionen aus ADR-012. **Neu aus ADR-017 (2026-09-12):** Der Objektspeicher läuft im Datenbank-Backup **nicht** mit — eigener Sicherungsweg (S3-kompatibler Zugang, Taktung gegen RPO ≤ 1 h), dreistufige Wiederherstellung (Datenbank, Objekte, Löschjournal und offene Löschaufträge). **Vorbedingung für produktive Dateien.**                                                                              | Jannes und Claude                     | Jan 2027                |
| G8  | **PAT-006 Datenschutzinformation und Einwilligungen** | „Datenschutzinformation ausgehändigt am", Hinweis auf Behandlungsvertrag, minimale Einwilligungsstruktur je Zweck mit Widerruf; Textvorlage Ausfallhonorar-Regel; die Datenschutzinformation nennt den Kartendienst (ADR-019). Behandlungsvertrag und Datenschutzinformation bleiben Papier mit Vermerk; keine Unterschrift in der Anwendung (E-13).                                                                                     | Claude                                | Dez 2026                |
| G9  | **OPS-006 Betroffenenrechte (minimal)**               | Verfahren dokumentiert; Export der Akte als einfache `owner`-Funktion, auditiert; begründete Ablehnung bei Aufbewahrungspflicht als Vorlage. Vollständige Funktion: Komfort.                                                                                                                                                                                                                                                              | Claude                                | Jan 2027                |
| G10 | **E2 Ausfallkonzept**                                 | Tagesplan mit Adressen und Telefonnummern druck- und exportierbar (**Dezember**, klein) · Praxisprozess für einen Tag ohne Anwendung (ADR-012). Ist zugleich der Rückfallplan der Eröffnung (H4), weil es kein Altsystem gibt.                                                                                                                                                                                                             | Claude (Funktion), Jannes (Prozess)   | Dez 2026 / Jan 2027     |
| G11 | **OPS-007 Bootstrap Produktion**                      | Runbook: Organisation, Standort, erstes `owner`-Konto, Mitarbeitende, Katalog, Praxisstammdaten ohne Seed anlegen; gegen die Test-Umgebung geprobt (M3), am 31.03.2027 im Produktivprojekt durchlaufen (M4).                                                                                                                                                                                                                              | Claude (Runbook), Jannes (Durchlauf)  | Jan / Mär 2027          |
| G12 | **ADR-019 Kartendienst** — *Fassung 2 vom 2026-09-08 (MAP-001), **angenommen 2026-09-13 (E-20)**; Gate offen* | In-App-Karte, Fahrradrouting, Fahrzeiten und Handoff als Produktziel; Zielarchitektur MapLibre + serverseitiger Adapter (`src/lib/location/contract.ts`); PTV Developer als Kandidat für Prototyp und Bewertung, **nicht** produktiv freigegeben; Google Maps nur als Handoff-Ziel; Privacy-Regeln als Prüfregeln; Prüfkatalog nach ADR-002 mit Belegtiefe in `docs/decisions/providerpruefung-kartendienst.md` — alle Vertragspunkte `CONTRACT_CONFIRMATION_REQUIRED`. DSFA-Wiedervorlage je Datenweg (ADR-007). Schließt B7 bis auf das Gate. | Claude (Docs), Jannes bestätigt; Vertragscheck mit B2 | erledigt 2026-09-13 (E-20) / Mär 2027 (Gate) |
| G13 | **Steuerliche Grundeinstellungen**                    | Aus B4: Format des neuen Nummernkreises, Umsatzsteuer-Status der Praxis (Kleinunternehmerregelung ja/nein, Steuernummer), steuerliche Einordnung der Katalogpositionen, Belegfristen. Eine Seite. **Überfällig seit 2026-09-19**: ABR-EPIC-002a ist gebaut, Nummernformat und Umsatzsteuer-Status stehen bis zur Antwort als Annahme (ANN-074, ANN-075).                                                                                                                                                                                                                       | Jannes mit Steuerberatung             | Nov 2026                |
| G14 | **DSFA-Paket**                                        | Schwellwertprüfung und DSB-Entscheidung (B2), Verzeichnis der Verarbeitungstätigkeiten, TOM (mit Endgeräte-Richtlinie), Löschkonzept (aus LOE), Subprozessoren (aus G3 und G12), Datenschutzinformationen (G8), Verfahren für Betroffenenrechte (G9), Data-Breach-Prozess; Nachweistabelle MUSS → Test/Policy/Prüfschritt; Zweckbestimmung (ADR-006). **Entwürfe ab Oktober als Docs-Sessions, Stand 15.12. an die Prüfung.**              | Jannes, externe Prüfung               | Okt 2026 bis Feb 2027   |
| G15 | **B1 Regulatorische Prüfung**                         | Externe Bestätigung der Zweckbestimmung und MDR-Abgrenzung (ADR-006), Einordnung nach EU AI Act.                                                                                                                                                                                                                                                                                                                                       | Jannes, extern                        | Feb 2027                |
| G16 | **BETRIEB-001 Betriebsmodell**                        | Störungsmeldung ohne Patientendaten · Triage werktäglich durch Jannes · Hotfix-Weg nach ADR-013 als privilegierter Vorgang mit Audit · Release-Takt nach M4: ein Release je zwei Wochen aus Tag, Change-Freeze zwei Wochen vor und nach M5 · Endgeräte-Richtlinie · Vertretung bei Ausfall von Jannes (Notfallzugang aus G7).                                                                                                              | Jannes mit Claude                     | Feb 2027                |
| G17 | **UI-001 Politur und Barrierefreiheit**               | Feindesign auf den fertigen Seiten, PWA-Manifest ohne Service Worker, Befunde aus Feldtagen und Kolleg:innen-Tests, speist sich aus den Ablaufrunden nach `OPTIMIERUNG.md`. **Nicht:** Branding je Praxis (`IDEA-QSN-009`).                                                                                                                                                                                                              | Claude                                | Feb 2027                |
| G18 | **Go-live-Gate (M3)**                                 | Sieben Vorbedingungen aus ADR-007 · Restore-Test 2 · alle Annahmen Datenschutz/Recht **von der Prüfung** bestätigt oder geändert — eine Festlegung durch Jannes allein (`entschieden (Jannes)`, `vorläufig entschieden`) reicht hier nicht · Branch Protection und Secret Scanning aktiv · CI grün · Abnahmeschritte aus `docs/abnahme/` durchlaufen · Messrunde vor dem Gate: kein täglicher Ablauf mit Score 0, Abweichungen bewusst dokumentiert (`OPTIMIERUNG.md`; entschieden 2026-09-06).                                                                        | Jannes                                | 19.03.2027              |

Der Generator für synthetische Daten (E6) bleibt der Seed; die Probewochen
(H1, H5) erweitern ihn um eine realistische Praxiswoche und eine
Eröffnungswoche.

**Kleine Wartung** (ohne eigenen Loop): `supabase/config.toml` Abschnitt
`[inbucket]` nach `[local_smtp]` umbenennen.

## Spur A3 — Etappe H: Eröffnung (Feb bis Jul 2027)

ADR-007 Punkt 6 erlaubt vor dem Gate nur synthetische Daten. Es gibt kein
Altsystem, also weder Parallelbetrieb noch Stichtagsumstellung: erst spielen,
dann das leere Produktivsystem, dann die Eröffnung.

| #  | Paket                              | Inhalt                                                                                                                                                                                                                                                                                                 | Wer                  | Termin              |
| -- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------------------- |
| H1 | **Probewoche 1 (synthetisch)**     | Der Seed bildet eine Praxiswoche nach (Hausbesuche, Serien, ein No-show, eine Rechnung). Jannes und eine zweite Person arbeiten sie auf der Test-Umgebung am Smartphone durch; Befunde werden gesammelt, priorisiert, geschlossen.                                                                     | Jannes, Claude       | Feb 2027            |
| H2 | **Kurzanleitung und Schulung**     | Kurzanleitung „erster Tag" als eine Seite; Erster-Tag-Protokoll nach `OPTIMIERUNG.md`; Schulung je Rolle (zwei Stunden) erst, wenn eine zweite Person eingestellt ist.                                                                                                                                | Jannes               | Feb / Jun 2027      |
| H3 | **Produktionssystem (M4)**         | Nach dem Gate: Produktivprojekt aus dem freigegebenen Tag, OPS-007 durchlaufen, keine synthetischen Daten, Release-Takt beginnt. Echte Daten nur, wenn sie anfallen (Anmeldungen).                                                                                                                     | Jannes, Claude       | 31.03.2027          |
| H4 | **Rückfallplan**                   | Es gibt kein Altsystem. Rückfall ist der Papierprozess aus E2: gedruckter Tagesplan mit Adressen und Telefonnummern, Dokumentation auf Papier mit Nachtrag binnen 24 h. **Rechnungen ruhen und werden nachgeholt** — keine handschriftliche Nummer aus dem Nummernkreis (entschieden 2026-09-08: eine Behandlung lässt sich nachdokumentieren, eine Nummernlücke nach §14 UStG nicht heilen). Abbruchkriterien (Datenverlust, Falschzuordnung, mehr als ein Tag Ausfall); Export nach G9; verantwortlich Jannes. | Jannes               | vor M3              |
| H5 | **Probewoche 2 (Eröffnungswoche)** | Der Seed bildet die Eröffnungswoche nach: nur Neuaufnahmen, erste Verordnungen, erste Serien, erste Rechnung am Monatsende; auf der Test-Umgebung mit dem Stand, der zur Eröffnung läuft (einschließlich Etappe T und 2). Befunde geschlossen vor dem Change-Freeze.                                     | Jannes, Claude       | Jun 2027            |
| H6 | **Eröffnung (M5)**                 | Change-Freeze ab 17.06. bis 15.07. (nur Hotfixes nach BETRIEB-001); Restore-Test 3; erste echte Patient:innen aus Anmeldungen; erster Behandlungstag am 01.07.2027 mit der Software; Störfallliste ab Tag 1.                                                                                             | alle                 | 01.07.2027          |
| H7 | **Erster Betriebsmonat (M6)**      | M6-Kriterien geprüft; Stabilisierungsbefunde geschlossen; Optimierungsrunde nach vier Wochen Betrieb; Spur A2 und Stufe 3 freigegeben.                                                                                                                                                                 | Jannes               | 31.07.2027          |

---

## Spur B — Entscheiden

Offene Punkte aus `docs/decisions/OPEN_DECISIONS.md` mit Fälligkeit. **Ein
Loop kann keine davon ersetzen.** Die Spalten „angefragt am / bei wem /
zugesagt bis" pflegt Jannes; das Wochenupdate liest sie.

**Jannes darf jeden dieser Punkte vorläufig selbst entscheiden** und die
Entscheidung zurücknehmen, wenn die externe Stelle widerspricht (Status
`vorläufig entschieden (Jannes)`, Regeln in `OPEN_DECISIONS.md`). Das löst die
Sperre fürs Bauen und macht aus der Anfrage eine Vorlage statt einer offenen
Frage. **Für M3 zählt es nicht** — dort gilt weiter das Ergebnis der externen
Stelle. Nicht so entscheidbar: **B8** (Tatsache über einen Lizenzgeber, nicht
Entscheidung der Praxis) und die externe MDR-Prüfung selbst (§17, ADR-006
Punkt 7 — MUSS; der Inhalt der Zweckbestimmung dagegen schon).

| Punkt                        | Was zu entscheiden ist                                                                                                                             | Wer                                 | Fällig vor                   | Termin                              | Stand (Jannes pflegt) |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------- | ----------------------------------- | --------------------- |
| **Providerprüfung Supabase** | Prüfkatalog ADR-002 dokumentiert und bestanden — sonst Alternative; schließt die Auth-Mails ein (B13) und die fünf Objektspeicher-Punkte aus ADR-017 | Jannes mit Claude-Dokument          | produktive Dateiablage, OPS-001 Anlage | 30.09.2026                          |                       |
| **B7 → ADR-019**             | **Weg C gewählt (MAP-001, 2026-09-08):** Handoff nicht blockiert (ANN-018, Frage an B2); Karte und Fahrzeiten über PTV Developer als Kandidat; produktive Freigabe am Gate aus ADR-019 Punkt 9 — neun Punkte, alle `CONTRACT_CONFIRMATION_REQUIRED` | Jannes (Vertragsdokumente, PTV-Support), Datenschutzberatung (B2) | MAP-006 | Dokumente Okt 2026; Gate mit B2 bis Feb 2027 | ADR-019 angenommen 2026-09-13 (E-20); Gate offen |
| **E15**                      | Office liest alle klinischen Inhalte wie Therapeut:innen (lesend, auditiert)                                                                      | Jannes; Datenschutzbewertung mit B2 | ROL-EPIC-001                 | Sep 2026                            | **entschieden 2026-09-13**; B2-Bewertung offen |
| **B4**                       | Steuerliche Validierung: Leistungsarten, Umsatzsteuer (Personal Training im **selben** Unternehmen, B9), Kleinunternehmerregelung und Gesamtumsatz nach §19 Abs. 3 UStG, Nummernkreis-Format, Belegfristen; **E14 Fall 1** (Rechnungstext und Rechtsgrundlage bei Vergütung ohne erbrachte Behandlung) | Steuerberatung                      | ABR-EPIC-001 (als Annahme)   | Nov 2026                            | Festlegungen stehen 2026-09-08; Anfrage Sep |
| **B14 PDF-Weg**              | Rechnungs-PDF: **entschieden 2026-09-19 — Weg 1 (Browser-Druck) jetzt, Weg 3 (serverseitig) nach OPS-001**, Weg 2 entfällt (`docs/decisions/rechnungs-pdf-optionen.md`); ADR-009 Punkt 11 ist erst mit Weg 3 erfüllt | **entschieden (Jannes)**            | ABR-EPIC-002b                | erledigt 2026-09-19                 | Weg 3 hängt an OPS-001 (ADR-002/007) |
| **B2**                       | DSFA-Schwellwertprüfung, DSB-Entscheidung, danach DSFA; Kartendienst, Terminerinnerung, **E15** (Office liest klinische Inhalte) und das Prüfpaket des Registers mit anfragen | externe Datenschutzberatung         | M3                           | Anfrage Sep, Ergebnis Dez, DSFA Feb | DSB entschieden 2026-09-08; Anfrage Sep |
| **B1**                       | Zweckbestimmung, MDR-Abgrenzung, EU AI Act                                                                                                         | externe Prüfstelle                  | M3                           | Anfrage Sep, Ergebnis Feb           | Zweckbestimmung steht 2026-09-08; Anfrage Sep |
| **B3**                       | Validierung der internen Fristen (ANN-001), Belegarten                                                                                             | im DSFA-Prozess                     | M3                           | Feb 2027                            | gilt wie ANN-001; Prüfung Feb |
| **E2**                       | Ausfallkonzept als Praxisprozess — zugleich Rückfallplan der Eröffnung                                                                             | Jannes mit Claude                   | M3                           | Jan 2027                            | Kern entschieden 2026-09-08 |
| **B8**                       | Lizenzstatus DIGOTOR-Bogen und weiterer Instrumente — **keine Entscheidung, eine Auskunft des Lizenzgebers**; **Jannes hat die Nutzung am 2026-09-19 bestätigt**, der schriftliche Beleg fehlt noch | Jannes, Lizenzgeber                 | FRB-003                      | vor FRB-EPIC-002, spätestens Apr 2027 | Nutzung bestätigt (Jannes); Beleg für M3 offen |
| **B15 Terminerinnerung**     | Kanal (SMS, E-Mail, Messenger), Anbieter, Einwilligung; Online-Anfrage — oder Anrufliste bleibt der Weg                                            | Jannes, Prüfung nach ADR-002        | Stufe 2 nach der Eröffnung   | Anfrage mit B2, Entscheidung bis M6 | entschieden 2026-09-08: keine |
| **B6**                       | Beschäftigtendaten: aggregierte Auswertungen (§20)                                                                                                 | Jannes, ggf. Beratung               | ZK-001, MAP-006              | Stufe 2                             | entschieden 2026-09-08: nein |
| **B5**                       | Patientenidentität, Vertretung, §630g                                                                                                              | Jannes, ggf. Beratung               | Etappe 4                     | Stufe 3                             | Rahmen entschieden 2026-09-08 |
| **B9**                       | Betreuung ohne und nach Heilbehandlung: Vertrag, Steuer, Aufbewahrung, Zweckbindung, Berufsrecht (Ernährung). **Ein Unternehmen für beides: vorläufig entschieden 2026-09-07** — geht als Festlegung in B4 | Steuerberatung und Datenschutz      | Etappe 8                     | Steuerteil mit B4 anfragen, Rest 2027 | entschieden 2026-09-08 |
| **B11**                      | Paketpreise, Guthaben, Verfall, Rabatte                                                                                                            | Jannes und Steuerberatung           | Etappe 8                     | mit B9                              | entschieden 2026-09-08: nein |
| **B10**                      | Automatisierte Progression: MDR-Grenze                                                                                                             | externe regulatorische Prüfung      | Etappe 9                     | mit B1 anfragen                     | entschieden 2026-09-08: V1 aus |
| **C6**                       | KI: Schutzumfang und Provider                                                                                                                      | Jannes und Prüfung nach ADR-002/005 | Etappe 10                    | Stufe 3                             | Schutzumfang entschieden 2026-09-08 |

**Stand 2026-09-08: kein Punkt blockiert mehr das Bauen.** Jannes hat die
Entscheidungsrunde vom Vortag ausnahmslos entschieden (Historie in
`OPEN_DECISIONS.md`). Was in der Spalte „Stand" jetzt ein Datum trägt, ist
**vorläufig entschieden** und wartet nur noch auf die externe Bestätigung —
fällig für M3, nicht für den nächsten Loop.

**Nachtrag 2026-09-19.** Aus der Entscheidungsrunde zu ABR-EPIC-003: **B14 ist
entschieden** (Weg 1 jetzt, Weg 3 nach OPS-001), und **B8 ist als Nutzung
bestätigt** — der schriftliche Beleg des Lizenzgebers bleibt für M3 offen.
Echte Restfragen sind damit nur noch die Anbieterwahl der KI (C6) und das
Verfahren der Patientenidentität (B5).

---

## Definition of Done

**Je Story:** vertikaler Schnitt, Tests, Abnahmeschritte in `docs/abnahme/`,
Registereinträge (Skill-Schritt D), Oberflächen-Checkliste abgehakt
(`docs/abnahme/README.md`). **Je neue Tabelle zusätzlich:** Datenklasse und
Frist als `COMMENT`, Löschpfad in LOE-002, ein `test:db`-Fall, der die Löschung
dieser Klasse prüft.

**Je Epic:** Checks nach Skill-Schritt H · Roadmap nachgestellt · **Jannes mergt
nach grüner CI; steht ein Zweitreview (A5) aus, erst danach. Die Abnahme folgt
binnen sieben Tagen** (Datum in der Fortschrittstabelle) · Befunde nach
`BEFUNDE.md` und als erste Story in den nächsten Loop derselben Spur.

**Etappe 1 fertig:** M1 erreicht; der Ende-zu-Ende-Fall liegt als E2E-Test
hinter der Anmeldung.

**Etappen G und H fertig:** M2 und M3 erreicht; die 13 Positionen aus ADR-012
und die sieben Vorbedingungen aus ADR-007 sind je mit Fundstelle nachgewiesen.
Die Eröffnung (M5) ist erreicht, wenn der erste Behandlungstag mit der Software
gelaufen ist.

---

## Credit-Budget

**Sitzungszuschnitt**

1. **Ein Loop = eine Session.** Zuschnitt (Epic oder Einzel-Story) nach dem
   Feature-Loop-Skill; je Story ein Commit und die eng betroffenen Checks.
   Danach Session beenden.
2. **Stories so schneiden, dass jeder Diff am Stück lesbar bleibt.** Die
   vollständige Testsuite läuft einmal am Ende des Epics.
3. **Neues Thema = neue Session.** Rückfragen zum laufenden Loop in derselben.
4. **Ein aktiver Feature-Branch.** Merge nach der „Definition of Done";
   gemergte Branches werden gelöscht.

**Leseverhalten**

5. **Diese Roadmap zuerst lesen**, dann den Abschnitt „Nächster Loop".
6. **Die im SPEC benannten ADRs vollständig** — mindestens alle, die der Loop
   berührt. Bei RLS, Löschung und Abrechnung sind das mehr als zwei; das ist
   kein Grund zu kürzen.
7. **Höchstens eine Ideenspeicher-Datei** je Loop, nach dem Index in
   `IDEENSPEICHER.md`.
8. **Keine Subagenten** außer bei echt breiter Suche über viele Dateien und
   für den Zweitreview in frischem Kontext, den ADR-013 Fassung 2 (Punkt 9,
   Nr. 8) bei kritischen Änderungen verlangt (Gate A5 in
   `GRAPH-ENGINEERING-WORKFLOW.md`).

**Verifikation**

9. Während der Entwicklung nur die eng betroffenen Checks; die vollständige
   Runde **einmal** am Ende (Skill-Schritt H).
10. Keine identischen teuren Läufe ohne Änderung dazwischen.
11. `pnpm test:db` bei Migrationen und Policies — auch in der Cloudumgebung
    (`CLAUDE.md`).
12. **Zweitreview** vor dem Merge nach ADR-013 Fassung 2, Punkt 9, Nr. 8 — als
    Review-Subagent (Regel 8) oder über die Zeile „Zweitreview".

**Rhythmus**

13. **Zwei Code-Loops je Woche** sind das Maß; einer ist in Ordnung, drei
    bedeuten zu kleine Schnitte.
14. Die wöchentliche Planungssession ist **absichtlich klein**.
15. **Monatsreview** (30 Minuten, letzter Freitag): Meilenstein-Ampel,
    Spur-B-Stand, Risiken, Rückwärtsplan des Folgemonats.

**Faustregel:** Wenn eine Session anfängt, das Projekt zu erkunden statt zu
arbeiten, fehlt ein Eintrag in dieser Roadmap.

### Modell und Aufwand

Das Modell steht projektweit in `.claude/settings.json`; wann eine Session mit
`/effort xhigh` startet, sagt `docs/development/SESSION-START.md`.

---

## Wochenupdate

Auftrag für die wöchentliche Planungssession. Sie **baut nichts.**

1. `docs/STATUS.md`, diese Datei, `ARBEITSBEREICHE.md` §2 und
   `git log --since='8 days ago' --oneline` lesen. (Das Praxistagebuch liegt
   nach `OPTIMIERUNG.md` nicht im Repository; Jannes nennt Störungen der Woche
   selbst.)
2. Feststellen, welche Loops seit dem letzten Update abgehakt **und
   abgenommen** wurden.
3. Den Abschnitt „Nächster Loop" wiedergeben und prüfen, ob seine
   Voraussetzung aus Spur B vorliegt; sonst den Ersatz nennen.
4. Prüfen, ob ein Termin aus Spur B, aus dem Rückwärtsplan oder ein
   Meilenstein fällig oder überschritten ist; bei einem verfehlten
   Meilenstein die Abweichungsregel anwenden.
5. Antwort in festem Format, höchstens zwölf Zeilen: _diese Woche ansteht ·
   Jannes entscheidet oder liefert (mit Datum) · hängt (Spur-B-Punkte über
   Termin) · Ampel M0 bis M6 mit je einem Wort Begründung_.
6. Die Tabelle „Sandbox-Prototypen" in `ARBEITSBEREICHE.md` §2 lesen: Für
   jede Zeile die seit „Angelegt" fertigen Code-Loops in der
   Fortschrittstabelle zählen; ab zwei den Prototyp als **abgelaufen** nennen
   (Jannes startet dann `/sandbox <Thema> verwerfen` oder den ersetzenden
   Loop). Ohne Zeilen entfällt der Schritt in einem Wort.

Die eingerichtete Routine beschreibt `docs/DEVELOPMENT.md`, „Wochenroutine"; sie
liest `main`.

---

## Fortschritt

Abgehakt wird hier, mit Datum und Commit. Ein Loop gilt als **fertig**, wenn
Skill-Schritt I durchlaufen ist, und als **abgenommen**, wenn Jannes die
Abnahmeschritte aus `docs/abnahme/` durchlaufen hat.

### Eine Zahl für den Gesamtstand

```bash
pnpm fortschritt            # Übersicht je Block
pnpm fortschritt --posten   # jeder einzelne Posten
pnpm fortschritt --json     # maschinenlesbar
```

Die Tabelle unten zählt abgehakte Loops. Sie sagt damit nicht, **wie weit es
insgesamt** ist — ein Loop wiegt nicht so viel wie eine Probewoche und eine
Probewoche nicht so viel wie die externe Datenschutzprüfung. Dafür gewichtet
`docs/development/fortschritt.json` fünf Blöcke gegeneinander und
`scripts/fortschritt.mjs` rechnet sie zu einem Prozentwert zusammen.

| Block | Inhalt                                              | Gewicht |
| ----- | --------------------------------------------------- | ------- |
| A     | Kernprozess — Software Stufe 1 (Etappe 1, bis M1)   | 30      |
| B     | Software Stufe 2 vor der Eröffnung (Etappe T und 2) | 10      |
| C     | Betriebsreife (Etappe G, vor M3)                    | 25      |
| D     | Eröffnung (Etappe H, bis M5)                        | 15      |
| E     | Entscheidungen und externe Prüfungen (Spur B)       | 20      |

Drei Festlegungen, damit die Zahl nicht schmeichelt:

- **Gerechnet wird gegen M5**, den ersten Behandlungstag mit der Software —
  nicht gegen „Code fertig". Software ist deshalb 40 Prozent, der Rest 60.
  Das folgt „Kapazität und Puffer": Der Engpass ist nicht die Baukapazität,
  sondern Jannes' Zeit für Entscheidungen, Abnahmen und externe Anfragen.
- **Fertig ist nicht abgenommen.** Ein fertiger Loop zählt `0,85`; die
  restlichen 15 Prozent holt die Abnahme (Definition of Done).
- **Vorläufig entschieden ist halb entschieden.** Ein Punkt aus Spur B mit
  Status `vorläufig entschieden (Jannes)` zählt `0,5` — er löst das Bauen,
  für M3 zählt er nicht.

Das Ergebnis ist eine **Schätzung mit offengelegtem Modell**, keine Messung.
Wer die Gewichte für falsch hält, ändert sie in der JSON-Datei; das Skript
prüft nur, dass die Blockgewichte 100 ergeben. **Gepflegt wird die Datei am
Ende eines Loops**, zusammen mit der Tabelle unten.

| Loop                                                   | Status | Fertig am      | Commit                                                              | Abgenommen am |
| ------------------------------------------------------ | ------ | -------------- | ------------------------------------------------------------------- | ------------- |
| PAT-001 bis PAT-004                                    | fertig | vor 2026-09-01 | PAT-004: Merge PR #1                                                |               |
| CAL-001 bis CAL-006                                    | fertig | vor 2026-09-01 | —                                                                   |               |
| STAFF-001                                              | fertig | 2026-08-30     | `e70775a`, `ca907e9`                                                |               |
| DOK-001                                                | fertig | 2026-09-01     | `7e18906`, Merge PR #5                                              | 2026-09-11    |
| DOK-002                                                | fertig | 2026-09-02     | `491a0c0`, Merge PR #5                                              | 2026-09-11    |
| DOK-003                                                | fertig | 2026-09-05     | `21d85dd`, `f565124`                                                | 2026-09-11    |
| DOK-004                                                | fertig | 2026-09-05     | `e931068`, `960f34f`                                                | 2026-09-11    |
| Planungsreview und Roadmap 2.0                         | fertig | 2026-09-05     | Merge PR #13                                                        | —             |
| Wettbewerbsanalyse, Review 2.1, Optimierungsmethode    | fertig | 2026-09-06     | `7ab6f71`, Merge PR #14 `8e72fc8` | —      |
| Roadmap 2.1 in Kraft, Tagesroute und Plattform geplant | fertig | 2026-09-06     | `ba46307`, `879048c`, Merge PR #14 `8e72fc8` | —        |
| VER-EPIC-001 (PAT-005, VER-001 bis VER-003)             | fertig | 2026-09-07     | `2c3c1de`, `18e5131`, `a2c42b1`, `159c1bb`                          | 2026-09-11    |
| ADR-019 Kartendienst (Docs), Fassung 1                  | ersetzt durch Fassung 2 | 2026-09-08 | `c5c7b21`                                                           | —             |
| MAP-001 Mapping-Architektur und Providerentscheidung    | fertig | 2026-09-08     | `f52e555`, `5d51d97`, Merge PR #16 `8374eef` | —             |
| UI-000 Fundament                                        | fertig | 2026-09-07     | `4a4440f`, `45e8222`, `df8a294`, `11a9977`, `afb5ba5`, `e6b4ab6`    | 2026-09-11    |
| Produktentscheidungen Terminfenster und Sprachdokumentation (Docs) | fertig | 2026-09-08 | `255ecdd`, `37e8b64`, Merge PR #17 (`452f2ea`)             | —             |
| UX-EPIC-001 (UX-001 bis UX-011)                         | fertig | 2026-09-11     | `ee19a16`, `2b927f5`, `ef82a19`, `18ec31b`, `b3f1440`, `6fad6bc`, `c42e1f5`, `4e2ee46`, `9dbe56a`, `1b5b065`, `9ab6ad7`, Merge PR #18 | 2026-09-11    |
| Marke Own Motion als Dateien und Regel (Docs)           | fertig | 2026-09-10     | `eb5c234`                                                           | —             |
| MARKE-001 Marke in der Anwendung                        | fertig | 2026-09-11     | `577ecd6`, `fb5cee0`, `7486c95`, `7109595`, `8f576b2`, Merge PR #19 | 2026-09-11    |
| STAFF-EPIC-002 (STAFF-002a/b/c, STAFF-003, STAFF-004)   | fertig | 2026-09-11     | `3938482`, `06b758c`, `0d7bd3c`, `719faed`, `56b2706`, `4afaf97`, `23cfb35`, PR #20 | 2026-09-11    |
| LOE-EPIC-001 (LOE-001a/b/c, LOE-002a/b)                 | fertig | 2026-09-11     | `042c325`, `169469d`, `310dc3b`, `0a3a2d7`, `c88bc71`, `ae4e85a`, Merge PR #25 | 2026-09-11    |
| ADR-018 Terminzustände (Docs)                            | fertig | 2026-09-11     | angenommen 2026-09-11, alle sieben Fragen wie empfohlen; §8 auf 0.7 nachgezogen | —             |
| CAL-EPIC-003a (CAL-008a bis CAL-008d, CAL-009)           | fertig | 2026-09-12     | `42f9fc3`, `262b5cd`, `718bd59`, `6eccadb`, `6ed26e5`, `6cd2c6b`, `fc1cd10`, Merge PR #28 | 2026-09-12    |
| CAL-EPIC-003b (CAL-010a, CAL-007, CAL-011)               | fertig | 2026-09-12     | `b2626ae`, `89ab30b`, `acddcc6`                                     |               |
| CAL-012 Mitteilungsvermerk am Termin                     | fertig | 2026-09-12     | Folgeauftrag zu CAL-EPIC-003b                                       |               |
| CAL-013 Termine per E-Mail (Handoff)                     | fertig | 2026-09-12     | Folgeauftrag zu CAL-012; B15-Nachtrag, ANN-041                      |               |
| AKTE-000 bis AKTE-005 Patientenakte als Arbeitsplatz     | fertig | 2026-09-12     | `77ab995`, `1c7219c`, `d9eda45` — eigener Auftrag von Jannes nach einem Screenrecording, **nicht** aus der Roadmap |               |
| UI-002a bis UI-002d Lesbarkeit (Akte ohne Übersicht, weißes Papier, weiße Rahmen, zweiter Faktor) | fertig | 2026-09-12 | `bc2713a`, `a6d9cea`, `c4d8517`, `5e977b6`, `ac1fcd7` — eigener Auftrag von Jannes aus der Sicht auf die laufende Anwendung, **nicht** aus der Roadmap; ANN-028 mit Nachtrag |               |
| UX-012a bis UX-012f Bedienabläufe zwischen den Bereichen | fertig | 2026-09-12     | `5d29756`, `65886e8`, `68e62c8`, `6edc13a`, `ccb4a24`, `dedb380` — eigener Auftrag von Jannes, **nicht** aus der Roadmap; ANN-039 und ANN-041 in Fassung 2 |               |
| FIX-EPIC-001 (FIX-001, FIX-003 bis FIX-006) Zugang und Sitzung halten, was sie versprechen | fertig | 2026-09-12 | `1064421` (Squash-Merge PR #32) — Befund-Loop, nicht aus der Roadmap (R6); Abnahme braucht Docker |               |
| FIX-EPIC-003 (FIX-010 bis FIX-012) Ungespeicherte Dokumentation bei interner Navigation | fertig | 2026-09-12 | `e05d34b`, `ebfe8e3`, `07fbbee` — eigener Auftrag von Jannes, **nicht** aus der Roadmap; Router auf Data Router, ANN-046 |               |
| CAL-014 (a bis d) Absage unter 24 Stunden und Nichtantreffen | fertig | 2026-09-12     | `f8c33ac`, `5101c7e`, `89a3652` — eigener Auftrag von Jannes; ADR-018 Fassung 2, `PROJECT_PRINCIPLES.md` 0.8, ANN-047, ANN-048, E14 neu |               |
| CAL-015 (a bis d) Kalender als vollständiger Arbeitsablauf | fertig | 2026-09-12     | `206f932`, `edfa850`, `58b7a31` — eigener Auftrag von Jannes; `PROJECT_PRINCIPLES.md` 0.9 (§8.1: 60 **oder** 45 Minuten, Ereignisse ohne Patient:in), E12 Punkt 1 erledigt, ANN-049, ANN-050 |               |
| CAL-016 Ereignisse ohne Gebührenanlass, Tagesplan vollständig | fertig | 2026-09-13 | `b0bf149` — Nachbesserung aus zwei unabhängigen Reviews zu CAL-014/CAL-015; keine neue Entscheidung, keine neue Annahme |               |
| FIX-013 Angemeldete E2E-Prüfungen wieder grün | fertig | 2026-09-13 | `3ffd295` — sechs Fehlschläge aus CI-Lauf 34732537869; ein echter Befund (Standortvorbelegung im Ereignisformular), zwei veraltete RPC-Signaturen, zwei Tests auf alte Darstellung, ein Tagkonflikt |               |
| FIX-014 Textverlustschutz beim Abmelden und im Wettlauf | fertig | 2026-09-13 | `90ca0f6` — ANN-046 erweitert; Abmelderückfrage, ein Schreibweg je Seite, kein Weitergehen nach Weiterschreiben |               |
| CAL-017 Teamereignisse als ein Vorgang | fertig | 2026-09-13 | `10e439b` — Gruppenkennung, gruppenweites Ändern und Absagen, Trigger gegen ausscherende Zeilen; ANN-051 |               |
| DAT-EPIC-001 (DAT-001 bis DAT-003, mit VER-004) | fertig | 2026-09-13 | `84bec9b`, `42bf51e`, `8f7816c`, `fd10a37` — Dateiablage nach ADR-017; `storage.objects` im Test-Shim, ANN-052, ANN-053 |               |
| Dokumentations-Audit und Bereinigung (Docs)             | fertig | 2026-09-13     | `7160fd5`, Merge PR #39 — Prinzipien 0.10, ADR-004/010/018/019, OPEN_DECISIONS 3.0, Register, Ideenspeicher, Roadmap 5.1; E14 erledigt, E15 neu; Graph-Engineering-Workflow 1.0 mit ADR-013 Fassung 2 und `/sandbox` | — |
| ROL-EPIC-001 (ROL-001 bis ROL-003) Office liest klinische Inhalte | fertig | 2026-09-15 | `778dc96`, `23b0a46`, `c582bff`, `c1c9da9` — E15 gebaut: office liest Dokumentation, Verordnung mit Diagnose und klinische Dateien, je Zugriff auditiert, ohne Schreibrecht; ANN-006 nachgezogen, bei ANN-011 der Leseausschluss abgelöst; Zweitreview ohne kritischen Befund; BEF-004 in FIX-015 behoben | |
| CAL-018 (a, b) Die drei Hausbesuch-Szenarien | fertig | 2026-09-16 | `dc529a7`, `6a11fb0` — E14 gebaut: `record_no_show` verlangt am Hausbesuch das bestätigte Protokoll und setzt daraufhin `fee_basis`, `complete_treatment` trägt den Pflichtvermerk `visit_without_treatment`, geführter Ablauf am Termin; ANN-055 neu, ANN-035 nachgezogen, Prinzipien 0.11.2 | |
| FIX-EPIC-004 (FIX-016 bis FIX-019) Kalender-Bedienung | fertig | 2026-09-18 | `14a1fa7`, `16f90b5`, `2d5068f`, `856a5ac` — Rückfragen als Fenster (`Dialogfenster`) mit Rückweg in den Kalender, Zieh-Rückfrage im Gitter mit Umriss, Ziehen mit Auto-Scroll und Blättern, Vergangenheit mit Bestätigung und Auditkennzeichen; ANN-057, ANN-058; BEF-012 bis BEF-016 erledigt | |
| CAL-EPIC-004a (CAL-020, CAL-023) Freie Terminlänge, Rückfrage beim Ziehen | fertig | 2026-09-18 | `ee81ea7` (CAL-020), Folgecommit (CAL-023) — Längenschranke raus aus `create_appointment`/`update_appointment` (nur noch Raster), Dauerauswahl mit „Andere Länge …", Abweichungszeichen in Kalender und allen Terminlisten, Rückfrage beim Loslassen mit Arbeitszeit-Hinweis im selben Kasten; ANN-056 ersetzt ANN-037; BEF-008 erledigt | |
| CAL-EPIC-004b (CAL-019, CAL-021) Anlegen-Menü, Fehlzeit und Dauerfehlzeit | fertig | 2026-09-18 | `e189183`, `32b8ec9`, `2cb0327`, `e13a9e2`, `1b132ea` — Spanne auf freier Fläche aufziehen (`useSpanneAufziehen`, dieselbe Pointer-Mechanik wie beim Verschieben), Anlegen-Menü im Gitter mit vier Einträgen und Tastaturbedienung; Fehlzeit als Ereignis, Dauerfehlzeit als Serie über `event_series_id` **neben** der Gruppenkennung (`create_event_series`, `update_event_series`, `cancel_event_series`), Ändern und Absagen wahlweise je Vorkommen oder je Serie; ANN-059, ANN-060 |               |
| ABR-EPIC-001 (ABR-001, ABR-002) Leistungskatalog und Leistungserfassung | fertig | 2026-09-19 | `3874e83`, `1301882`, `15fc84d`, `b720542` — versionierte Preisliste, mit dem Inkraftsetzen unveränderlich (Trigger, nicht nur Schreibpfad; **ANN-070**), Preis in ganzen Cent mit expliziter Währung und Steuerkennzeichen je Position. Leistungen nur aus „dokumentiert" oder Gebührenanlass, **ohne Override** (§19 schlägt den Roadmap-Text, **ANN-072**), je Termin und Position höchstens eine. Die genutzte Menge der Grundlage wird damit fortgeschrieben (**ANN-073**, löst die Wiedervorlage aus ANN-012/038/064 ein). Pflege des Katalogs nur `owner`, Erfassung `owner` und `office` (**ANN-071**). Neue Datenklasse Abrechnungsdaten (acht Jahre, § 147 AO); der Löschlauf der Akte nimmt die Leistungen mit. 44 neue Datenbanktests, 17 Komponententests. **ABR-000 nicht gebaut** — nach ABR-EPIC-002a verschoben |
| ABR-EPIC-002a (ABR-000, ABR-003a, ABR-003) Rechnung aus Leistungen | fertig | 2026-09-19 | `de17906`, `6a0ef02`, `c57fe01`, `12eb91e` — Praxis-Stammdaten als Rechnungsabsender mit Pflichtangaben und **ohne vorbelegten Umsatzsteuerstatus** (**ANN-074**); Rechnungsempfänger als eigene Entität, Vorgabe ist die Patientin selbst — ohne Zeile (**ANN-076**); Rechnung mit zwei Zuständen, Nummer erst beim Ausstellen aus einem lückenlosen Nummernkreis je Kalenderjahr (**ANN-075**), Snapshot als versioniertes `jsonb`-Dokument ohne klinische Inhalte, Sammelrechnung je Person und Monat (**ANN-077**). Ausgestellt ist unveränderlich (Trigger). Aufbewahrung: Der Löschlauf hält eine Akte zurück, solange die steuerliche Frist einer ausgestellten Rechnung läuft (§ 147 AO, ADR-008 Punkt 2). Optionen für das Rechnungs-PDF liegen als Vorlage vor (B14). 66 neue Datenbanktests, 21 Komponententests |
| VER-EPIC-002 Verordnung im Office-Alltag | fertig | 2026-09-18 | `f734e55`, `ba19245` — Terminzahl als `treatment_bases.appointment_count` statt Summe der Positionen (**ANN-064**, Bestand erbt die groesste Positionsmenge); Heilmittel als beschriftete Kaestchen aus einem Katalog im Code (**ANN-066**), „Genutzt" und „Position hinzufuegen" entfallen; ein Feld „Anmerkungen" auf `note` (**ANN-065**), Therapieziel/Verordnerhinweis/Empfehlung nur noch als Bestandstext; `pnpm test:db` fuer Terminzahl, Bestandserhalt und Negativfaelle | |
| FIX-015 Dateizugriff nur über den auditierten Weg (BEF-004) | fertig | 2026-09-15 | `caa493f` (rot), `7787ec5`, `3402baa`, `b756588`, `8eec088`, `f4073f8`, `50cf019`, `f8676f9`, `272593a`, PR #42 — Befund-Loop aus dem Zweitreview zu ROL-EPIC-001, gestapelt auf PR #41; einmalige Freigabe in der RLS von `storage.objects`, Auditereignis `storage_deletion.claimed` neu, ANN-052 Fassung 2; E15-Umsetzungsvermerke, Prinzipien 0.10.2 | |
| ABR-EPIC-003 (ABR-004) Zahlungen und offene Posten | fertig | 2026-09-19 | `4d35ac7`, `8991c83`, `92f4d88` — Zahlungen als eigene Transaktionen mit **Richtung statt Vorzeichen**; der Zahlungsstand wird gerechnet und steht an keiner Spalte (**ANN-078**, ADR-009 Punkt 12). Überzahlung erlaubt, Rückzahlung höchstens bis zum Eingang. **Gebucht ist gebucht:** Storno mit Grund statt Löschen, die Sperre am Trigger. Offene Posten mit Serversumme auf der Einstiegsseite (0 Taps), Buchen an der Zeile (3 Taps), Teilzahlung ohne Sonderweg. Aufbewahrung nach ADR-008 mit eigenem Journaleintrag; `get_invoice` trägt den Stand mit. **`src/features/billing` ist kein Vorschaubereich mehr.** 27 neue Datenbanktests, 17 Komponententests; Sichtprüfung bei 375 px, ein Umbruchbefund dabei behoben | |
| ABR-EPIC-002b (ABR-003b/c/d) Die Rechnung ist ein Dokument, das bleibt | fertig | 2026-09-19 | `ad599d0`, `eb55aa9`, `a1384ce` — Rechnungsblatt als **Browser-Druck** (B14 Weg 1) mit schwarzer Wortmarke im Kopf; **ADR-009 Punkt 11 bleibt unerfüllt**, die Ablage nach ADR-017 entfällt mit diesem Weg und kommt mit Weg 3 nach OPS-001. Storno als **eigenes Dokument** mit Pflichtgrund und eigener Nummer aus demselben Kreis; „storniert" bleibt abgeleitet, die Rechnung unangetastet, die Leistungen werden frei (**ANN-079**), die Korrekturrechnung zeigt auf ihre Vorgängerin. Zahlungserinnerung ohne Stufen, Gebühren und Automatik, erst ab Fälligkeit, mit festgeschriebenem Betrag (**ANN-080**, `IDEA-PRX-012`). Dazu **BEF-018**. 37 neue Datenbanktests, 25 Komponententests; Sichtprüfung bei 375 px, 1280 px und im Druckbild | |

---

## Änderungsvermerk

| Version | Datum      | Änderung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.18 | 2026-09-20 | **ADR-021 angenommen** (Entscheidungsarbeit, kein Code) — der Projektinhaber hat am 2026-09-20 alle neun Punkte wie vorgeschlagen angenommen. Vollzogen an den Stellen, die eine Annahme ausmachen: Status im ADR, Zeile im Index in `../../CLAUDE.md`, Zeile in [`../adr/README.md`](../adr/README.md), Zeile in der Tabelle in `PROJECT_PRINCIPLES.md` §21. Die Zeile in §21 ist eine Änderung an **Rang 1** und trägt deshalb die Korrekturversion **0.12.1**; sie ändert keine Leitplanke, weil ADR-021 §1.1, §4, §14 und §18 anwendet, statt eine Aussage zu ändern. Damit ist **Schritt 2 (ADR-022 Terminkontext) frei**; der Nachzug an §1, §4 und §14 einschließlich der Trainingsrolle bleibt Schritt 5. **Kein Code, keine Migration, keine Tabelle:** Die zweite Verhältnistabelle, ihre Datenklasse im Retention Schedule und der vierte Verweis im Löschlauf entstehen erst in dem Loop, der sie baut — die Annahme macht ihn zulässig, sie beginnt ihn nicht. |
| 5.17 | 2026-09-20 | **ADR-021 vorgeschlagen** (Entscheidungsarbeit, kein Loop) — Schritt 1 von sieben aus **E18**. Getrennt wird nach **Rechtsverhaeltnis, nicht nach Person**: Eine Person kann zugleich einen Behandlungsvertrag (Par. 630a BGB) und einen Dienstvertrag ueber Training (Par. 611 BGB) haben, und daran haengen verschiedene Rechtsgrundlagen, Fristen und Dokumentationspflichten. Die Aenderung am Datenmodell ist **additiv**: `patients` ist bereits das Behandlungsverhaeltnis und wird nicht aufgeteilt, `persons` bleibt unveraendert, die zweite Verhaeltnistabelle entsteht daneben; einzige Verbindung ist `person_id`. Die **drei harten Regeln** stehen als Punkte 5 bis 7 (Fachdaten nur am Verhaeltnis · kein Durchgriff, durchgesetzt in den RLS-Policies und nicht in der Oberflaeche · Uebernahme ins Training nur als dokumentierte Kopie), dazu einheitlich das strengere **Par. 203-Niveau** fuer beide Bereiche. Zwei Folgen sind konkret: Der **Loeschlauf** prueft heute drei Verweise auf `persons` und braucht einen vierten, und die neue Tabelle braucht ihre **Datenklasse** im Retention Schedule — `retention.test.ts` prueft das gegen `pg_tables`. Nicht dabei: Terminkontext (ADR-022), MDR-Verbote (ADR-006 Fassung 3), Steuerkennzeichen (ADR-009 Fassung 2), der Nachzug an Paragraph 1, 4 und 14, der Trainingsbereich selbst, das konkrete Schema — und kein Code. **Status vorgeschlagen:** In den Index in `CLAUDE.md`, in `docs/adr/README.md` und in die Tabelle in `PROJECT_PRINCIPLES.md` Paragraph 21 wandert der ADR erst mit der Annahme durch Jannes; bis dahin beginnt Schritt 2 nicht. |
| 5.7 | 2026-09-17 | **Festlegung von Jannes (E18): Personal Training und Online Coaching gehören von Anfang an in die Anwendung.** Die Software wird vom Start weg für drei Zusammenhänge benutzt — Hausbesuche in der Physiotherapie, Personal Training, Online Coaching; Räume gibt es aktuell und mindestens im ersten Jahr nach dem Start keine (das deckt sich mit `PRODUCT_VISION.md` §1.1 seit dem 31.08.). Damit ist der Satz in Stufe 3 überholt, PT laufe bis dahin außerhalb der Plattform. **Gebaut ist davon nichts, geplant auch nicht:** Wer PT- und Coaching-Kund:innen im Datenmodell sind, was ein Coaching-Termin ist, wie abgerechnet wird, was §203 und die MDR-Abgrenzung dafür heißen und wie `PROJECT_PRINCIPLES.md` §1 und §14 nachgezogen werden, steht als Fragenliste bei Stufe 3. Das ist ein eigener Planungsschritt vor dem nächsten Feature-Loop, keine Nebenwirkung eines solchen. Die Reihenfolge der Etappe 1 bleibt bis dahin unverändert. **Noch am selben Tag beantwortet:** Die Festlegungen stehen als Loop-Vorgabe in `E18-LEISTUNGSBEREICHE.md` — Trennung nach Rechtsverhältnis statt nach Person, Terminkontext, Steuerkennzeichen am Posten, drei Feature-Verbote zur MDR-Grenze, Nachzug an Paragraph 1 und 4. Daraus werden vier ADRs und eine neue Fassung der Prinzipien, in dieser Reihenfolge und je in einer eigenen Sitzung; Code kommt danach. Zwei Bezuege der Vorgabe waren auf diesen Stand richtigzustellen: Rollen stehen in Paragraph 4, nicht 14, und `persons` ist seit der Gruendungsmigration bereits getrennt - die Migration ist kleiner als angenommen. |
| 5.14 | 2026-09-19 | **ABR-EPIC-002a fertig** (Pfad A, auf Freigabe von Jannes) — **mit ABR-000**. Die Praxis hat einen Rechnungsabsender: Anschrift, Bankverbindung, Steuernummer und umsatzsteuerlicher Status, Pflichtangaben als Pflichtspalten. Der Status hat **keinen Vorgabewert** - weder Kleinunternehmerregelung noch Regelbesteuerung ist der wahrscheinlichere Fall, und eine falsche Vorbelegung stuende am Ende auf einer Rechnung (**ANN-074**, G13 offen). Der Katalogpreis ist der **Endpreis**; eine enthaltene Umsatzsteuer wird je Satz herausgerechnet, unter Paragraf 19 UStG entfaellt der Ausweis. **Patientin und Rechnungsempfaenger sind getrennt** (ADR-009 Punkt 2): Eltern, Betreuung, Beihilfestelle, Versicherung als eigene Zeilen - die Patientin selbst bekommt keine, sie ist die Vorgabe ohne Zeile, denn eine Kopie ihrer Anschrift waere ein zweiter Wert fuer denselben Sachverhalt (**ANN-076**). Die **Rechnung** hat zwei Zustaende statt der sieben aus Punkt 7: Versand, Zahlungen und Storno haengen an Funktionen, die ABR-EPIC-002b und -003 bauen, und einen Wertebereich vorzubauen waere der Vorgriff aus ADR-014. Die **Nummer entsteht beim Ausstellen**, lueckenlos je Kalenderjahr aus einer eigenen Zeile mit `for update` statt aus einer Sequenz - eine Sequenz liesse bei jedem Fehlschlag eine Luecke (**ANN-075**). Der **Snapshot** ist ein `jsonb`-Dokument mit eigener `schema_version` und damit von spaeteren Schemaaenderungen unabhaengig; gebaut wird er von derselben Funktion, die die Entwurfsansicht liefert (**ANN-077**). Kein klinischer Inhalt geht an Dritte: Der Verordnungsbezug steht als Bauart, Datum und Verordner:in da, ohne Diagnose. **Aufbewahrung**: Eine Rechnung kann die Akte ueberdauern, weil sie spaeter entsteht - der Loeschlauf haelt die Akte zurueck, solange die steuerliche Frist einer ausgestellten Rechnung laeuft (Paragraf 147 AO, ADR-008 Punkt 2), und zaehlt das getrennt vom Legal Hold. Die **Optionen fuer das Rechnungs-PDF** liegen als Vorlage vor (B14, Empfehlung serverseitig, bis dahin Browser-Druck). Im Fortschrittsmodell geht der Posten auf `fertig`: Block A **80,5 Prozent**, Gesamtstand **37,8**. **Naechster Loop: `ABR-EPIC-002b`.** |
| 5.16 | 2026-09-19 | **ABR-EPIC-002b fertig** (Pfad A, auf Freigabe von Jannes) — drei Stories. **ABR-003b**: Die Rechnung ist ein Blatt, das die Praxis verschicken kann — Weg 1 aus B14, also Browser-Druck derselben Druck-Basis wie Tagesplan und Terminzettel, ohne neue Abhaengigkeit und ohne neuen Ausfuehrungsort. Die **schwarze Wortmarke** steht jetzt im Rechnungskopf, 14 mm hoch, als byte-gleiche Kopie (`marke/README.md` nennt Rechnung und Fax als genau ihren Fall). Der Preis dieses Weges steht auf der Seite und nicht im Kleingedruckten: Die Datei entsteht beim Nutzer, die Anwendung sieht sie nie, **ADR-009 Punkt 11 bleibt unerfuellt** bis Weg 3 nach OPS-001 — und damit entfaellt auch die Ablage nach ADR-017, die der Epic-Zuschnitt nannte. **ABR-003c**: Storno und Korrektur sind eigene Dokumente (ADR-009 Punkt 9). Die Rechnung selbst wird nie angefasst; storniert ist ein **abgeleiteter** Zustand, naemlich die Existenz eines Stornodokuments mit Pflichtgrund und eigener Nummer aus demselben lueckenlosen Kreis (**ANN-079**). Das Storno gibt die Leistungen frei, ohne eine Rechnungszeile zu loeschen — `released_at` loest allein die Sperre gegen Doppelabrechnung, und die eine Ausnahme im Trigger prueft Feld fuer Feld, dass sonst nichts wandert. Die Korrekturrechnung zeigt ueber `replaces_invoice_id` auf ihre Vorgaengerin und beantwortet damit die offene Folgefrage des ADR zur mehrfachen Korrektur. Zuerst das Geld, dann das Dokument: Eine Rechnung mit stehender Zahlung laesst sich nicht stornieren. **ABR-003d**: Die Zahlungserinnerung ist ein Dokument, kein Mahnlauf (`IDEA-PRX-012`) — ohne Stufen, ohne Gebuehren, ohne Zinsen, ohne Automatik und ohne eigene Nummer, erst ab Faelligkeit, mit festgeschriebenem Betrag und vierzehn Tagen Frist als benannter Konstante an einer Stelle (**ANN-080**). Dazu **BEF-018**: Die Arbeitsliste fuehrt jetzt zum vorhandenen Entwurf desselben Monats. Zwei Migrationen, 37 neue Datenbanktests und zwei im Loeschlauf; Sichtpruefung im Chromium bei 375 px, 1280 px und im Druckbild fuer alle drei Blaetter. Die Obergrenze von `ASSUMPTIONS.md` ist zum dritten Mal gewandert (1050 → 1075), weil zwei Annahmen 24 Zeilen brauchten und 8 frei waren — die Disziplin je Eintrag bleibt. Im Fortschrittsmodell geht der Posten auf `fertig`: Block A **86,7 Prozent**, Gesamtstand **39,6**. **Naechster Loop: `ADR-021` (Leistungsbereiche aus E18) — Entscheidungsarbeit, kein Loop; danach `MAP-002`.** |
| 5.15 | 2026-09-19 | **ABR-EPIC-003 fertig** (Pfad A, auf Freigabe von Jannes) — vorgezogen, weil **ABR-EPIC-002b** auf B14 wartete. Zahlungen sind eigene Transaktionen (ADR-009 Punkt 12): Richtung statt Vorzeichen, Betrag immer positiv, Tag getrennt vom Erfassungszeitpunkt. Der **Zahlungsstand wird gerechnet und steht an keiner Spalte** - die Konsequenz zu Punkt 12 sagt woertlich "abgeleitet, nicht gesetzt", und eine gepflegte Spalte koennte von den Transaktionen abweichen. `invoices.status` bleibt deshalb bei zwei Werten (**ANN-078**, ANN-077 bestaetigt). **Ueberzahlung ist erlaubt** und wird als solche benannt; eine **Rueckzahlung** darf den Eingang nicht uebersteigen. **Gebucht ist gebucht:** Eine Zahlung laesst sich nur mit Grund stornieren, nie aendern und nie loeschen - die Sperre sitzt am Trigger und gilt auch fuer postgres; die stornierte Zeile bleibt sichtbar und faellt nur aus der Summe. Die **offenen Posten** stehen ohne einen Tap auf der Einstiegsseite, mit einer Summe, die der Server ueber alle offenen Posten rechnet und nicht ueber die gelieferten Zeilen; gebucht wird an derselben Zeile in drei Taps, die Teilzahlung ohne eigenen Weg (beide Zielwerte aus `OPTIMIERUNG.md`). **Kein Bargeld** (Festlegung von Jannes am 2026-09-19) - damit bleiben Kassenbuch und TSE aussen vor. Aufbewahrung nach ADR-008 mit eigener Zuordnung, eigenem Journaleintrag und RESTRICT statt CASCADE, damit keine Zahlung still am Journal vorbei faellt. **`src/features/billing` ist kein Vorschaubereich mehr** und faellt aus `trennung.test.ts`. Dazu die Entscheidungen der Runde: **B14** entschieden (Weg 1 jetzt, Weg 3 nach OPS-001), **B8** als Nutzung bestaetigt, Abnahmeweg und E18-Reihenfolge festgelegt. Im Fortschrittsmodell: Block A **82,6 Prozent**, Gesamtstand **38,4**. **Naechster Loop: `ABR-EPIC-002b`** - jetzt frei. |
| 5.13 | 2026-09-19 | **ABR-EPIC-001 fertig** (Pfad A, auf Freigabe von Jannes) — **ohne ABR-000**. Der Leistungskatalog ist eine eingefrorene Preisliste: Entwurf beliebig aenderbar, mit dem Inkraftsetzen unveraenderlich, und die Sperre sitzt am Trigger, damit sie fuer jeden Schreibweg gilt (ADR-009 Punkt 5, **ANN-070**). Preise stehen in ganzen Cent mit expliziter Waehrung (ADR-014), die steuerliche Einordnung ausdruecklich je Position in drei Werten - auch `not_taxable`, weil ein Ausfallhonorar weder steuerfrei noch steuerpflichtig ist. Eine Leistung kopiert keinen Preis, sie verweist auf die Position der am **Leistungstag** geltenden Liste. **Der Override ist entfallen**: Dieser Eintrag nannte bis heute die "Kopplung an finalisierte Dokumentation mit protokolliertem Override (C1, ANN-006)"; `PROJECT_PRINCIPLES.md` §19 sagt seit 0.11 "In V1 gibt es keinen Override", hat nach §21 den ersten Rang, und so ist es gebaut (**ANN-072**). Behandlung und Ausfallhonorar rutschen nie ineinander; je Termin und Position gibt es hoechstens eine Leistung (§13). Die genutzte Menge der Grundlage schreibt jetzt die Erfassung fort - die Wiedervorlage aus ANN-012, ANN-038 und ANN-064 ist eingeloest (**ANN-073**). Aufbewahrung: neue Datenklasse **Abrechnungsdaten** (acht Jahre ab Kalenderjahresende, § 147 AO), Zuordnung der drei neuen Tabellen, und der Loeschlauf der Akte nimmt die Leistungen mit - ohne das haette ein Fremdschluessel den ganzen Lauf scheitern lassen. **ABR-000** (Praxisstammdaten) ist nach **ABR-EPIC-002a** gewandert: Die Daten verbraucht erst die Rechnung, und sie vorzubauen widerspraeche ADR-014. Im Fortschrittsmodell geht der Posten auf `fertig`: Block A **76,3 Prozent**, Gesamtstand **36,5** - die Loops CAL-EPIC-004b, -004c, UX-013 und GRD-001 fehlen dort noch als Posten (**BEF-017**). **Naechster Loop: `ABR-EPIC-002a`.** |
| 5.12 | 2026-09-18 | **VER-EPIC-002 fertig** (Pfad A, auf Freigabe von Jannes). Das Verordnungsformular folgt den Feldvorgaben vom 2026-09-13: Heilmittel als beschriftete Kaestchen (KG, MT, beide auch als Doppelbehandlung, Hausbesuch — die Wunschkombination vollstaendig moeglich), ein Feld **„Anzahl moeglicher Termine"**, kein „Genutzt", kein „Position hinzufuegen", ein Textfeld **„Anmerkungen"** neben der Diagnose. Der eigentliche Umbau liegt darunter: Die Terminzahl steht jetzt an der Grundlage (`appointment_count`) und ist **nicht mehr die Summe der Positionen** — sechs Termine mit drei Heilmitteln boten vorher achtzehn (**ANN-064**). Bestandswerte bleiben unangetastet: Mengen, unbekannte Heilmittel und die drei Freitexte, die das Formular verlassen haben, stehen sichtbar daneben und werden nie ueberschrieben (**ANN-065**, **ANN-066**). **Keine Empfehlungsanzeige**: Der INSPECT hat keine geeignete Quelle gefunden — `treatment_notes` traegt nur Freitext —, die manuelle Eingabe entfaellt trotzdem, und die fehlende Anbindung steht als Wiedervorlage unten bei ABR-EPIC-001. |
| 5.11 | 2026-09-18 | **GRD-001 fertig** (Pfad A, auf Freigabe von Jannes). Ein Termin haengt seit diesem Loop an einer **Behandlungsgrundlage**; die Verordnung ist eine Bauart davon, der Selbstzahler die zweite ([ADR-020](../adr/ADR-020-treatment-basis.md), E16). Umgesetzt durch **Erweitern** der vorhandenen Tabelle: `prescriptions`/`prescription_items` heissen `treatment_bases`/`treatment_base_items`, die Verweise darauf `treatment_basis_id` — auch an `appointments` und `patient_files` —, `treatment_basis_kind` bekommt den dritten Wert `self_pay`, und `prescriber_id` wird nullable mit einer Constraint, die sie fuer `first`/`follow_up` erzwingt und fuer `self_pay` ausschliesst. `prescribed_quantity` und `prescribers` behalten ihre Namen (ADR-020 Punkt 5). Der offene Punkt des ADR ist damit entschieden: der Bezeichner ist der dort vorgeschlagene, konsistent zu `treatment_notes`. **29 Funktionen** trugen die alten Bezeichner und wurden neu erstellt — die Ruempfe aus `pg_get_functiondef` uebernommen, damit keine spaetere Fassung auf eine fruehere zurueckfaellt; fachlich neu ist allein `app.assert_treatment_basis_input`. Die Auditwerte `treatment_basis.*` treten **neben** `prescription.*`, weil Auditzeilen nie umgeschrieben werden (ADR-010); `retention_assignments` und `deletion_journal` wandern dagegen mit, sonst verloere ein Journaleintrag seine Anwendbarkeit (**ANN-063**, ADR-008 Punkt 9). Die Oberflaeche nennt die **Bauart** — „Erstverordnung vom …“ beziehungsweise „Selbstzahler seit …“ —; das Formular fragt zuerst danach und laesst fuer den Selbstzahler Verordner:in und die klinischen Felder weg. Die **Adressen bleiben** `verordnungen` (**ANN-062**). `pnpm test:db` deckt beide Bauarten samt Negativfaellen ab — zweimal geprueft, im Schreibpfad und an der Constraint darunter. Dabei **zwei Fehler gefunden**: Die drei Projektionen verbanden die Verordner:in mit einem inneren Verbund (ein Selbstzahler fiel aus der Akte), und `concat_ws` lieferte als Namen den leeren String statt nichts. **Naechster Loop: VER-EPIC-002.** |
| 5.10 | 2026-09-18 | **UX-013 fertig** (Pfad A, auf Freigabe von Jannes). Die dauerhaft sichtbare Suchleiste sucht jetzt zuerst, was die Anwendung **kann**: Bereiche, Seiten und Vorgänge, abgeleitet aus `arbeitsbereiche(user)` und den vorhandenen Routen — eine zweite, von Hand gepflegte Liste derselben Menüpunkte liefe beim ersten umbenannten Bereich auseinander. Jeder Vorgang steht unter derselben Rollenbedingung wie seine Route; das ist **Relevanz, keine Zugriffskontrolle** (§4.7, ADR-004). **E17 hat dabei eine Fassung 2 bekommen** (Jannes, 2026-09-18, auf die Frage, ob eine kombinierte Suche nicht einfacher wäre): Die Namen bleiben **zusätzlich** in der Leiste, in einer zweiten Gruppe darunter, serverseitig wie in UX-004 (`search_patients`, ab drei Zeichen) — der Schritt mehr aus einem Termin heraus, den Fassung 1 in Kauf genommen hatte, entfällt damit wieder. Die Gruppenreihenfolge ist **fest**: Die Namen treffen eine Anfrage später ein und hängen sich unten an, statt die Auswahl unter den Pfeiltasten zu verschieben. Tastaturweg vollständig: Strg/Cmd + K öffnet, der beste Treffer ist bei Eingabe hervorgehoben, die Pfeiltasten wandern über beide Gruppen, Escape schließt; bei ~375 px nimmt die Liste den Rest des Bildschirms ein (gemessene Unterkante des Feldes, weil die Kopfhöhe mit der Verbindungsanzeige wächst). Die Kopfleiste führt das Feld seitdem nur noch **einmal** — die Zeile bricht auf dem Telefon um, statt ein zweites Feld zu zeigen. Die **Patientensuche** steht zusätzlich im Bereich „Patient:innen“, daneben das umbenannte Feld „Liste filtern“. **ANN-061** neu: gefunden werden Funktionen und Namen, **keine klinischen Inhalte** — eine Verordnungssuche wäre eine eigene Story mit Policy, Auditentscheidung und Datenschutzentscheidung und steht als solche unter „Bewusst nicht Teil von Etappe 1“. Keine Migration, kein neues Paket. **Nächster Loop: GRD-001.** |
| 5.9 | 2026-09-18 | **CAL-EPIC-004b fertig** (CAL-019 und CAL-021, Pfad A, auf Freigabe von Jannes). Aus dem Kalender heraus entsteht jetzt jeder Eintrag, den der Tag braucht: Auf der freien Fläche wird eine **Zeitspanne aufgezogen** (`useSpanneAufziehen` — dieselbe Pointer-Mechanik und derselbe lange Druck wie beim Verschieben, keine zweite Geste), danach steht an der Auswahl das **Anlegen-Menü** mit Neuer Termin, Dauertermin, Fehlzeit, Dauerfehlzeit; ein Tap ohne Ziehen wählt einen Rasterpunkt und öffnet dasselbe Menü. Das Menü steht im Gitter (ANN-058), ist tastaturbedienbar und schließt mit Escape; jeder Eintrag hat über dem Gitter seine Entsprechung ohne Zeigegerät, neu „Dauerfehlzeit eintragen". Der **Dauertermin** bleibt die Terminserie aus der Verordnung (CAL-007) und sagt es, solange keine Patient:in gewählt ist — gebaut wurde dafür **kein** zweiter Serienweg. Die **Fehlzeit** ist ein Ereignis und bekommt deshalb kein eigenes Formular; neu ist die **Dauerfehlzeit**: Rhythmus und Anzahl aus CAL-007, Tage als Vorschau, serverseitig `create_event_series` (je Vorkommen ein `create_appointment_event`, alles oder nichts, Überschneidung nennt ihren Tag). Die Vorkommen verbindet **`event_series_id` neben** der Gruppenkennung aus CAL-017 (**ANN-059**): Die Gruppe ist ein Vorkommen, die Serie sind alle — nur so bleibt „dieses Vorkommen" ausdrückbar. Ändern und Absagen stehen ausdrücklich beschriftet zur Wahl und wirken serienweit auf die **noch nicht begonnenen** Vorkommen. **ANN-060**: Die Bezeichnung einer Fehlzeit ist organisatorisch, geprüft am Feld und dadurch, dass der Titel weder in Log noch Auditkontext noch Adresszeile erscheint. Die Obergrenze des Annahmenregisters ist dabei von 800 auf 1000 Zeilen gestiegen (`scripts/docs-check.mjs`) — das Register wächst nach §15.1 mit jeder Annahme, und STATUS nannte beide Wege. Nicht gebaut: Gruppentermine, Serienende als Datum, Vorkommen in eine bestehende Serie einfügen. **Nächster Loop: UX-013.** |
| 5.8 | 2026-09-18 | **FIX-EPIC-004 fertig** (FIX-016 bis FIX-019, Befund-Loop zu BEF-012 bis BEF-016, Pfad A, auf Freigabe von Jannes; vor CAL-EPIC-004b gezogen, weil CAL-019 auf derselben Zieh-Mechanik aufsetzt). Rückfragen, die nicht am Auslöser stehen können, sind jetzt ein Fenster über dem Inhalt (`Dialogfenster`, **ANN-058**): Arbeitszeit-Rückfrage und Fehler der Terminformulare, mit „Zurück zum Formular". Der Kalender reicht seinen Stand als Rückweg in die Terminanlage, das Anlegen kehrt dorthin zurück und hebt den neuen Termin hervor. Die Zieh-Rückfrage steht im Gitter — alter Platz gestrichelt mit „Bisher", neue Kachel am Ziel, Kasten daneben —, Kacheln bleiben ziehbar, nicht ziehbare nennen den Grund. Ein aktives Ziehen überlebt den Bildlauf, scrollt am Fensterrand von selbst und blättert am seitlichen Rand in den nächsten Ausschnitt; der Kalender hält den alten Ausschnitt stehen, bis der neue da ist, und merkt sich den Ursprung jedes Termins. Die Vergangenheit ist erlaubt, aber nie unbemerkt (**ANN-057**): `p_confirmed_past` in beiden Schreibwegen, Auditkontext `in_the_past`, Vorabfrage im Formular, Hinweis im selben Kasten wie die Arbeitszeit. Nicht gebaut: „Verschieben nach …" (Bearbeiten bleibt der Weg ohne Zeiger), Ereignisse in der Vergangenheit. **Nächster Loop: CAL-EPIC-004b.** |
| 5.7 | 2026-09-18 | **CAL-EPIC-004a fertig** (CAL-020 und CAL-023, Pfad A, auf Freigabe von Jannes; PR gegen `main`, CI steht weiter). Die Lücke zwischen `PROJECT_PRINCIPLES.md` 0.11 §8.1 und dem Server ist zu: `create_appointment` und `update_appointment` nehmen jede Länge an, die ein Vielfaches des Praxisrasters ist (`app.is_valid_treatment_length`), beim Ändern weiterhin nur geprüft, wenn sich die Länge ändert — **ANN-056** schreibt ANN-037 so fort. Die Dauerauswahl führt 60, 45 und „Andere Länge …" mit Minutenfeld; ein Behandlungstermin außerhalb von 45/60 trägt in Kalenderkachel, Mein Tag, Tageskarte, Tag umplanen, Personalseite, Akte und Termindetail das Zeichen mit Vorlesetext, Ereignisse nie. Das Ziehen fragt beim Loslassen immer nach — alte und neue Zeit, die Person nur bei Spaltenwechsel, der Arbeitszeit-Hinweis im selben Kasten, auch wenn erst der Server ihn erkennt; die Rückgängig-Leiste bleibt. Die Vorgabe sagte „ohne Migration"; die Längenprüfung lag in SQL, also gibt es eine. Datenbanktests umgeschrieben, nicht gelöscht. **BEF-008 erledigt, BEF-011 neu** (Node 24 lässt rund 60 navigierende Komponententests an der jsdom-Navigation scheitern, auf `main` genauso). Zweitreview (A5) gelaufen: keine blockierenden Befunde; eingearbeitet sind das leere Minutenfeld, das nicht mehr mit der alten Länge speichert, und die Rückfrage, die nach dem Blättern nicht wieder auftaucht. **Nächster Loop: CAL-EPIC-004b.** |
| 5.6 | 2026-09-16 | **CAL-018 fertig** (zwei Stories, Pfad A, auf Freigabe von Jannes; eigener Branch, ungemergt, weil die Actions-Minuten aufgebraucht sind). E14 ist gebaut: Am **Hausbesuch** verlangt `record_no_show` die Bestätigung des Protokolls — 15 Minuten gewartet, geklingelt, angerufen — und setzt daraufhin serverseitig `fee_basis = 'no_show'`; ohne Bestätigung bleibt der Termin bestätigt. Die Bestätigung steht als `no_show_protocol_confirmed` am Termin, weil das Auditlog nur drei Jahre trägt (ANN-029), ein Vorgang mit Gebührenanlass aber länger (ANN-035) — und eine Constraint hält fest, dass zu einem bestätigten Protokoll immer der Anlass gehört. Szenario 1 bekommt seinen Pflichtvermerk als Merkmal am Eintrag (`treatment_notes.visit_without_treatment`), gesetzt im Abschluss, ausdrücklich kein Freitext als einzige Quelle. Am Termin führt der Abschnitt „Was ist passiert?" erklärend durch die vier Ausgänge, jede Wahl mit ihrer Folge. **ANN-055 neu**: Protokoll, Gebühr und Pflichtvermerk gelten am Hausbesuch — für Praxis- und Videotermine trifft E14 keine Aussage, dort bleibt der Vermerk ohne Gebühr; Wiedervorlage bei Jannes. Nachgezogen: ANN-035, ADR-018 Punkt 8 Nr. 5 und Punkt 9, `PROJECT_PRINCIPLES.md` 0.11.2, `OPEN_DECISIONS.md` E14, ARBEITSBEREICHE, Abnahmeschritte. Kein Betrag: ABR-001 und ABR-003 sind nicht gebaut. **Nachtrag vom 2026-09-17:** Der angemeldete E2E-Lauf bei Jannes (lokal, weil die CI stillsteht) fand einen Fehler, den keines der lokalen Gates hatte: Das Eintragsschema der Oberfläche liegt unter **zwei** Lesepfaden, nachgezogen war nur `get_treatment_note` — die Akte bekam Einträge ohne `visit_without_treatment`, und der Behandlungsverlauf blieb leer. Behoben in `20260917100000_akte_pflichtvermerk.sql`; der neue Datenbanktest prüft beide Lesepfade in einem Fall, und die Akte zeigt den Vermerk jetzt auch an. **Reihenfolge unverändert: nächster Loop CAL-EPIC-004a.** |
| 5.5 | 2026-09-15 | **FIX-015 fertig** (Befund-Loop zu **BEF-004**, Pfad A, auf Freigabe von Jannes; PR #42, gestapelt auf PR #41, beide ungemergt). Die Storage-API gab eine Datei jeder lesenden Rolle ohne `patient_file.link_issued` heraus, weil der Objektschlüssel ableitbar ist. Jetzt verlangt die RLS auf `storage.objects` eine einmalige, 30 Sekunden gültige Freigabe der anfragenden Person, die nur `issue_patient_file_link` oder — für den Löschauftrag, neu protokolliert als `storage_deletion.claimed` — `claim_storage_deletion_order` anlegt; Signieren, Laden, Auflisten, Kopieren und Entfernen verbrauchen sie. Zuerst rot gegen die laufende Storage-API und in `pnpm test:db` belegt, dann behoben; ein ausgestellter Verweis gilt unverändert 60 Sekunden. ANN-052 Fassung 2, Datenschutzprüfung B2 weiter offen. Redaktionell nachgezogen: die E15-Umsetzungsvermerke in `PROJECT_PRINCIPLES.md` (0.10.2), ADR-004, ADR-016, ADR-017 Punkt 12 und `OPEN_DECISIONS.md` E15. Zweitreview in frischem Kontext: kein Lesezugriff ohne Freigabe; eingearbeitet sind die Beschränkung der Löschfreigabe auf das Entfernen (`storage.operation`), eine Mandanten-Gegenprobe, eine strengere Prüfung der Auflistung und genauere Grenzen in ANN-052. BEF-005 bleibt offen. **Reihenfolge unverändert: nächster Loop CAL-018**, nach dem Merge von #41 und #42. |
| 5.4 | 2026-09-15 | **ROL-EPIC-001 fertig** (drei Stories, Pfad A). E15 ist gebaut: `office` liest Dokumentation mit Verlauf, Verordnung mit Diagnose und klinische Dateien samt Scan, jeder Zugriff protokolliert; Schreiben, Löschen und Korrektur der Dokumentart bleiben bei den behandelnden Rollen. Zweitreview in frischem Kontext ohne kritischen Befund; der mittlere Befund **BEF-004** (Dateizugriff am Auditeintrag vorbei über ableitbare Objektschlüssel, seit DAT-001) wird ein eigener Loop. |
| 5.3     | 2026-09-15 | **Konsolidierung R2** (Docs- und Hygiene-Session, kein Feature-Code). Auto-Merge ist zurückgenommen — auf diesem GitHub-Plan nicht verfügbar: **Jannes mergt nach grüner CI** (Definition of Done; Vermerk 5.1 bleibt Chronik). `DEVELOPMENT_WORKFLOW.md` entfällt; seine Tabelle „Wer ändert welches Steuerungsdokument" steht im Graph-Engineering-Workflow 1.1, Pfad D entfällt. Modelltabelle und Modellspalte in „Sessions starten" entfallen (Modell: `.claude/settings.json`). Wochenupdate Schritt 1 liest zusätzlich `docs/STATUS.md` und `ARBEITSBEREICHE.md` §2. Die Antworten E-15 bis E-19 und die erledigten Spur-B-Zeilen stehen nur noch in der Git-Historie. Korrekturen: Das Fundament zählt als `fertig` statt `abgenommen` (kein Abnahmebeleg) — `pnpm fortschritt` 31,2 % statt 31,5 %, Block A 58,5 % statt 59,6 %; FIX-EPIC-001 in der Fortschrittstabelle nachgetragen; Branch-Verweise durch Commits und Merges ersetzt; „Gebaut ist nicht fertig" heißt jetzt „Fertig ist nicht abgenommen"; Etappe T verweist auf den Rückwärtsplan.  Neu als Betriebsmodell: `docs/STATUS.md` traegt den Livestand (Obergrenze 60), `docs/development/SESSION-START.md` den Startprompt jeder Session, `.claude/settings.json` das Modell (Opus 5; der Aufwand je Aufgabe steht in SESSION-START). Das Gate `pnpm docs:check` prueft Obergrenzen, Register-Anker und relative Verweise und laeuft im Job „Lint, Typecheck, Tests, Build“ — **ADR-013 Fassung 3** nennt es als zehnte Pflichtpruefung und ersetzt den Auto-Merge-Satz. **Prinzipien 0.10.1**: Die sechsstufige Rangfolge steht jetzt in §21 statt nur im ranglosen `CLAUDE.md`, und die ADR-Tabelle dort nennt keine Fassungen mehr — die fuehrt allein `docs/adr/README.md`. Code-Hygiene: `src/lib/datum.ts` und `src/lib/telefon.ts` statt fuenf Kopien, das Trennungs-Gate der Vorschau erfasst alle Importformen gegen eine Positivliste, **ANN-054** legt die Audit-Schwelle `high` fest, 0 Lint-Warnungen statt 6, vier Testvorlagen statt vielfach abgeschriebener Literale bei unveraenderten 1 462 Tests. **BEF-003** (ein Datenbanktest hing am Wochentag) gefunden und als **R2-040** behoben: `pnpm test:db` 1 311 von 1 311. Messbar: alle getrackten `*.md` 22 326 → 17 848 Zeilen (−20 %), `ASSUMPTIONS.md` 3 575 → 746, `OPEN_DECISIONS.md` 1 415 → 400, drei Dateien geloescht, vier neu. **Reihenfolge unverändert: nächster Loop ROL-EPIC-001.** |
| 5.2     | 2026-09-13 | **Graph-Engineering-Workflow 1.0** (Docs-Session, Knoten 4 des Dokumentations-Audits; freigegeben von Jannes). Jeder Auftrag wird vor dem ersten Schritt **klassifiziert** (K1): Pfad A — der Feature-Loop, jetzt mit benanntem Compliance-Gate A4 und Zweitreview A5 **vor dem Merge** (Review-Subagent in derselben Session oder Zeile „Zweitreview"; der Pull Request wartet dann); Pfad S — die neue **Frontend-Sandbox** (`/sandbox <Thema>`, `.claude/skills/sandbox/SKILL.md`), technisch ohne Server, Netz und Persistenz — `trennung.test.ts` prüft jetzt auch Importe aus echten API-Modulen —, höchstens zwei Code-Loops lang, endet mit Härtungs-Ticket (`… übernehmen`) oder Löschung (`… verwerfen`); Pfad D — Docs-Session, wenn eine Hard-Stop-Entscheidung fehlt. Dafür **ADR-013 Fassung 2**: Punkt 9 definiert „kritische Änderung" (§12 plus technische Auslöser, Liste nur dort) und legt die zehn Punkte der Review-Checkliste fest, die Punkt 8 seit dem 28.08. verlangte. Nachgezogen: `CLAUDE.md`, Feature-Loop-Skill (K1, Schritt F, Schritt I), `ARBEITSBEREICHE.md` (Sandbox-Prototypen, Regel statt „keine neue Vorschau"), Zeilen „Sandbox" und „Zweitreview" hier, Credit-Regeln 4, 8 und 12, Modelltabelle, Wochenupdate Schritt 6, G5, `DEVELOPMENT_WORKFLOW.md`. **Reihenfolge unverändert: nächster Loop ROL-EPIC-001.** |
| 5.1     | 2026-09-13 | **Dokumentations-Audit und Bereinigung** (Docs-Session, kein Feature-Code). Drei Festlegungen des Projektinhabers: **E15** — Office liest alle klinischen Inhalte wie Therapeut:innen (`PROJECT_PRINCIPLES.md` 0.10 §4.3/§4.4, ADR-004 Fassung 2; Umsetzung **ROL-EPIC-001**, jetzt nächster Loop); **E14 erledigt** — Hausbesuch-Szenarien: Nichtantreffen nach Protokoll mit Ausfallgebühr, „Tür geöffnet" gilt als durchgeführt (§8, ADR-018 Fassung 3; Umsetzung **CAL-018**); **E-20** — ADR-019 angenommen. Dazu **VER-EPIC-002** (Verordnung im Office-Alltag, Vorgabe aus PR #37 auf `main` übernommen) vor ABR-EPIC-001. Aufgeräumt: „Nächster Loop" trägt nur noch den Livestand, die Vermerke 2.0–4.6 liegen in `archiv/`, der Rückwärtsplan ist auf den Stand vom 13.09. gezogen (13 Loops im September fertig), fertige Loops der Etappe 1 sind durchgestrichen, `fortschritt.json` nennt die Stufen jetzt `fertig`/`abgenommen` wie die Tabelle, `BEFUNDE.md` sammelt Befunde, die Ablaufrunden sind bis Probewoche 1 eingefroren, Merge-Regel: bei grüner CI (Auto-Merge), Abnahme binnen sieben Tagen. Register: Übersicht vollständig, Status normiert, ANN-006/011 durch E15 abgelöst, ANN-036 in ADR-018 überführt. OPEN_DECISIONS: Struktur 3.0 mit Archiv, Rückverweisen und Glossar. Ideenspeicher: Statusmodell mit `zurückgestellt`, gebaute Ideen `überführt`. |
| 5.0     | 2026-09-13 | **DAT-EPIC-001 fertig** (drei Stories) — die erste Zeile der Etappe G, die Code ist, und die erste Stelle, an der die Anwendung **zwei** Speicher führt. **DAT-001**: Dateien hängen an einem Bezugsdatensatz und kommen nur über zwei Phasen mit serverseitiger Bestätigung in die Akte — die Berechtigung wird geprüft, bevor Bytes fließen, und `confirm_patient_file_upload` vergleicht Größe und MIME-Typ gegen das, was die Storage-API tatsächlich abgelegt hat. Der Objektschlüssel trägt nur Kennungen und ist eine **generierte Spalte**; er verlässt die Datenbank ausschließlich über den Vorgang, der die Ausstellung protokolliert (**ANN-052**) — der Lesepfad liefert ihn nicht. Ausgeliefert wird über signierte Verweise mit **60 Sekunden** und `cacheControl: '0'`, je Zugriff neu, nie auf Vorrat. Der Rollenschnitt hängt an der Dokumentart und steht als Daten im Katalog: **der Verordnungsscan ist klinisch**, und `office` bekommt ihn gar nicht erst geliefert — nicht ausgegraut und nicht gezählt (ANN-011). **DAT-002**: Löschen ist zweistufig, und die Quittung wird **verdient** — der Server prüft selbst, dass das Objekt weg ist, sonst bleibt der Auftrag offen; umgekehrt lässt die DELETE-Policy nur Objekte mit offenem Auftrag entfernen, womit die Reihenfolge „erst Datenbank, dann Objekt" erzwungen und nicht bloß vereinbart ist. Dazu die protokollierte Korrektur der Dokumentart, die eine Sichtbarkeitsgrenze verschiebt. **DAT-003**: Der Abgleich meldet fehlende Objekte als Verlust mit Akte und Namen und verwaiste Objekte als Abfall, der über denselben Löschweg fällt — kein zweiter, stiller Pfad. **ANN-053** benennt die ehrliche Grenze: Die Prüfsumme rechnet der Browser, und die Datenbank kann sie nicht nachrechnen. Drei Migrationen, 68 neue Datenbanktests, drei Abnahmeabschnitte; der Test-Shim bildet jetzt `storage.buckets` und `storage.objects` nach, damit der Dateizugriff (§12) in der Cloudumgebung überhaupt prüfbar ist. Ein Befund aus dem vollständigen Lauf ist mitbehoben: Beim Erweitern des Ereigniskatalogs war eine veraltete Fassung der Subjekttypen fortgeschrieben worden. Im Fortschrittsmodell geht der Posten auf `gebaut` (0,85): Block A **68,4 Prozent** (vorher 63,4), Gesamtstand **33,0** (vorher 31,5). **Nächster Loop: `ABR-EPIC-001`** — B4 liegt noch nicht vor und blockiert nach §15.1 nicht, aber Leistungskatalog und Praxisstammdaten braucht er von Jannes. |
| 4.9     | 2026-09-13 | **Drei Korrekturen aus der CI und einem Befund am laufenden Stand.** **FIX-013**: Die angemeldeten E2E-Prüfungen sind wieder grün — sechs Fehlschläge, drei Ursachen. Ein echter Befund in der Oberfläche (das Ereignisformular wählte den einzigen Standort nicht vor, obwohl die Terminanlage genau das tut), zwei Tests mit veralteter `cancel_appointment`-Signatur (PostgREST fand die Funktion nicht, die Antwort war 404 statt der geprüften Berechtigung), zwei Tests auf die vor CAL-015b gültige Darstellung und ein Tagkonflikt zwischen zwei Tests derselben Datei. **FIX-014**: Der Textverlustschutz erfasst jetzt auch das **freiwillige Abmelden** — die in ANN-046 ausdrücklich offen gelassene Grenze —, alle Schreibvorgänge einer Seite laufen durch **einen** Weg (kein zweiter startet, solange einer läuft), und wer während des Speicherns weiterschreibt, geht nicht weiter; beim Abschluss und bei der Korrektur ist das Feld währenddessen unveränderlich. Die erzwungene Beendigung einer Sitzung kommt daran nie vorbei und greift unverändert sofort. **CAL-017**: Ein Teamereignis ist **ein Vorgang**. Die Zeilen tragen eine gemeinsame Gruppenkennung; Bezeichnung, Zeit, Länge, Art und Ort ändert `update_appointment_event` für alle Beteiligten in einer Transaktion, mit Konfliktprüfung je Person vor dem Schreiben, und `cancel_appointment_event` sagt alle offenen Teilnahmen zugleich ab. Eine einzelne Ereigniszeile kann nicht mehr ausscheren (Trigger); die einzelne **Teilnahme** bleibt davon getrennt änderbar und absagbar. Bestandszeilen werden **nicht** über Titel oder Uhrzeit zusammengeführt. Dafür **ANN-051**; eine Migration, ein neues Formular, zwei Abnahmeabschnitte. **Reihenfolge unverändert: nächster Loop DAT-EPIC-001.** |
| 4.8     | 2026-09-13 | **CAL-016: die Nachbesserung zu CAL-014 und CAL-015** — aus zwei unabhängigen Reviews in frischem Kontext, keine neue Entscheidung und keine neue Annahme. Der Befund mit Geldfolge: `cancel_appointment` hatte als einzige der berührten Schreibfunktionen keine Artprüfung bekommen; eine Teambesprechung, die jemand mit dem Grund „Patient:in hat abgesagt" innerhalb der Frist absagte, bekam einen **Gebührenanlass** — an einer Zeile ohne Patient:in und ohne Behandlungsbeginn, und der Löschlauf hätte sie deshalb nie wieder angefasst (§16, ADR-008). Dazu: `cancel_staff_day` nimmt nur noch praxisbedingte Gründe an (der Ausfall einer behandelnden Person ist definitionsgemäß praxisbedingt; ein Fehlgriff im Auswahlfeld hätte Forderungen gegen **alle** Patient:innen des Tages innerhalb der Frist erzeugt), `list_day_plan` ließ Ereignisse still fallen (INNER JOIN auf `patients` — dieselbe Stelle, die CAL-015b bei zwei anderen Lesepfaden behoben hatte, hier übersehen), und der Mitteilungsvermerk weist ein Ereignis jetzt auch serverseitig ab. Oberfläche entsprechend: Absagedialog, „Tag umplanen", Tagesliste und `EditAppointmentPage` kennen Ereignisse; der Data Router bekommt ein `errorElement` mit deutschem Fehlerkasten statt der eingebauten englischen Seite mit Stacktrace (§13, ADR-011). Eine Migration, zwei Abnahmeabschnitte. **Reihenfolge unverändert: nächster Loop DAT-EPIC-001.** |
| 4.7     | 2026-09-12 | **Drei Aufträge von Jannes fertig, keiner aus dieser Reihenfolge** — der zweite und dritte ändern verbindliche Dokumente. **FIX-EPIC-003**: Ungespeicherte Behandlungsdokumentation ist bei interner Navigation geschützt; die offene Entscheidung zum Router ist gefallen (Data Router mit einer Platzhalterroute — `useBlocker` verlangt ihn, ein selbstgebauter Wachposten käme an das Zurück des Browsers nicht heran), die Rückfrage bietet Speichern, Verwerfen und Bleiben, und ein Speicherfehler nimmt weder Text noch Seite mit (ANN-046). **CAL-014**: Eine Patientenabsage unter 24 Stunden löst eine Ausfallgebühr aus, gerechnet serverseitig aus dem **Eingang** der Absage — der jetzt getrennt von der Eingabe erfasst wird; das Nichtantreffen verliert seine Pflichtentscheidung über das Honorar und ist ein Schritt. Dafür **ADR-018 Fassung 2** und **`PROJECT_PRINCIPLES.md` 0.8** (§8); **E14 neu** (ob das Nichtantreffen eine eigene Gebührenregel bekommt, ist offen und blockiert nichts); ANN-047, ANN-048, ANN-035 erweitert. **CAL-015**: Behandlungstermine haben 60 **oder** 45 Minuten — damit ist **E12 Punkt 1 erledigt**, ohne das dort angebotene Verfahren zu bauen —, Ereignisse des Praxisbetriebs (Besprechung, Teamtermin) lassen sich ohne Patient:in und Verordnung eintragen und erzeugen keine Leistung, und der Weg von der Verordnung in den Kalender trägt den Kontext bis ins Formular. Dafür **`PROJECT_PRINCIPLES.md` 0.9** (§8.1); ANN-049, ANN-050. Zwei Migrationen, drei Abnahmeabschnitte. **Reihenfolge unverändert: nächster Loop DAT-EPIC-001.** |

Ältere Vermerke (2.0 bis 4.6): Git-Historie bis `7160fd5`.
