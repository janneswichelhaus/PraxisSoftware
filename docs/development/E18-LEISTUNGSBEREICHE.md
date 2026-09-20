# E18 — Zwei Leistungsbereiche: Heilbehandlung und Training

Stand 2026-09-17 · **Loop-Vorgabe**: Eingabe für den SPEC-Schritt, kein
eigener Rang · Umsetzung: **Schritt 1 abgeschlossen** (ADR-021, angenommen am
2026-09-20), Schritte 2 bis 7 offen · **kein Code**

Quelle sind die Festlegungen des Projektinhabers vom 2026-09-17 (E18). Sie
beantworten die fünf Fragen, die der Roadmap-Vermerk 5.7 bei Stufe 3 gestellt
hat. Dieses Dokument hält sie fest, ordnet sie den Dokumenten zu, die sie
später verbindlich machen, und nennt, was vor dem Bauen noch fehlt. Es ersetzt
keinen Schritt des [Feature-Loops](GRAPH-ENGINEERING-WORKFLOW.md) und keinen
ADR.

**Sprachregelung, verbindlich für alle Folgedokumente:** „PT" wird **nicht**
als Abkürzung benutzt. Es heißt **Physiotherapie** oder **Personal Training**,
ausgeschrieben. Im Code und im Datenmodell heißen die beiden Bereiche `therapy`
und `training`.

## Leitprinzip

**Getrennt wird nach Rechtsverhältnis, nicht nach Person.** Eine Person kann
gleichzeitig einen Behandlungsvertrag (§ 630a BGB) und einen Dienstvertrag über
Training (§ 611 BGB) haben. Daran hängen verschiedene Rechtsgrundlagen,
Dokumentationspflichten, Löschfristen und Steuerkennzeichen. Das Datenmodell
**erzwingt** diese Trennung, es bildet sie nicht nur ab.

## 1. Datenmodell — geteilte Identität, getrennte Verhältnisse

| Ebene              | Inhalt                               | Rechtsgrundlage                                                                                                           | Aufbewahrung                                          |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `persons`          | Identität, Kontakt, einmal je Mensch | —                                                                                                                         | folgt den Verhältnissen                               |
| `patients`         | Behandlungsverhältnis, **existiert** | Art. 9 Abs. 2 lit. h DSGVO i. V. m. § 630f BGB                                                                            | 10 Jahre ab Behandlungsende                           |
| `training_clients` | Trainingsverhältnis, **neu**         | Vertragsdaten Art. 6 Abs. 1 lit. b; Screening und Gesundheitsangaben Art. 9 Abs. 2 lit. a (**ausdrückliche Einwilligung**) | 3 Jahre ab Vertragsende (§ 195 BGB), Screening früher |

Die Heilbehandlungs-Ausnahme lit. h trägt im Training **nicht** — Training ist
keine Heilbehandlung.

**Die Änderung ist rein additiv** (Korrektur vom 2026-09-17): `patients` wird
**nicht** aufgeteilt — es *ist* bereits das Behandlungsverhältnis
(`person_id`, `status`, `care_started_on`). `training_clients` entsteht
**analog** dazu: `person_id`, `status`, `training_started_on`. `persons` bleibt
unverändert. **Keine Fremdschlüssel zwischen `patients` und
`training_clients`** — die einzige Verbindung ist `person_id`. Die Löschfristen
hängen damit am Verhältnis, nicht an der Person.

**Verworfen:** ein gemeinsamer `patients`-Datensatz mit Kennzeichen
(Datenklasse, Rechtsgrundlage und Frist wären nicht mehr trennbar, der
Rollenschnitt kippt) · zwei vollständig getrennte Personendatensätze (Dubletten,
doppelte Stammdatenpflege).

**Drei harte Regeln:**

1. **Fachdaten hängen immer an einem Verhältnis**, nie direkt an `persons`.
   Kein Fremdschlüssel von Trainings- auf Behandlungsdaten.
2. **Kein Durchgriff.** Wer nur die Trainingsrolle hat, sieht keine Befunde —
   durchgesetzt in den RLS-Policies, nicht in der Oberfläche (ADR-004, §4.7).
3. **Übernahme von Befunddaten ins Training nur als Kopie** mit dokumentierter
   Einwilligung, nie als Referenz. Sonst bricht die Zweckbindung (Art. 5 Abs. 1
   lit. b DSGVO).

## 2. Termin — ein Kalender, ein Kontext je Termin

`video` ist ein **Kanal**, keine Leistungsart, und reicht deshalb nicht.

- Der Termin bekommt `context` mit `therapy`, `training`, `internal` und **zwei
  nullbare Fremdschlüssel** — einen auf `patients`, einen auf
  `training_clients`.
- Ein CHECK-Constraint erzwingt je Kontext **genau einen** davon und setzt bei
  `internal` **beide** auf `null`.
- Termine ohne Person (Blocker, Fahrtzeit) tragen damit `context = 'internal'`.
- Der bestehende `patient_id` am Termin ist genau dieser erste Fremdschlüssel;
  neu ist der zweite und die Constraint darüber.
- **Die Terminentität bleibt gemeinsam** — sonst sind Doppelbuchungen nicht zu
  verhindern und es entstehen zwei Kalender.

**Eigene Behandlungsgrundlage neben [ADR-020](../adr/ADR-020-treatment-basis.md):
ja.** Die Dokumentationspflicht aus § 630f BGB gilt nur für die Behandlung. Ein
Trainingstermin braucht ein Trainingsprotokoll, aber **keine**
Behandlungsdokumentation — und darf keine erzeugen. Das wird ein eigener ADR,
der ADR-020 nicht ablöst, sondern danebensteht und die Abgrenzung definiert.

## 3. Abrechnung — Steuerkennzeichen am Posten, nicht am Kunden

Der Betrieb ist **regelbesteuert**.

| Kennzeichen        | Anwendung                                                      | Satz                                      |
| ------------------ | -------------------------------------------------------------- | ----------------------------------------- |
| `therapy_exempt`   | Heilbehandlung mit therapeutischem Zweck                        | steuerfrei, § 4 Nr. 14 lit. a UStG        |
| `training_standard`| Personal Training, Prävention, Gerätetraining ohne Heilbehandlungszweck | 19 %                              |
| `therapy_reduced`  | verordnungsfähige Leistung ohne Verordnung — **Default aus**    | 7 %, FG Düsseldorf 16.04.2021, **umstritten** |

`therapy_reduced` wird angelegt, aber **erst nach Freigabe durch die
Steuerberatung aktiviert** (B4).

Weiter gilt:

- **§ 14 Abs. 4 UStG:** Bei steuerfreien Posten ist der Grund der
  Steuerbefreiung Pflichtangabe (Nr. 8), und es **darf keine Umsatzsteuer
  ausgewiesen werden**. Ein falsch ausgewiesener Betrag wird nach § 14c UStG
  geschuldet — **das ist der wichtigste Fehler, den die Software verhindern
  muss**, und gehört als Testfall in `pnpm test:db`.
- **Getrennte Rechnungen je Leistungsart** statt gemischter. Getrennte
  Nummernkreise sind zulässig, solange jede Nummer einmalig ist
  (§ 14 Abs. 4 Nr. 4 UStG).
- **Kleinbetragsrechnungen** bis 250 € nach § 33 UStDV mit reduzierten Angaben.
- **Zwei Aufbewahrungsregime:** Rechnungen und Buchungsbelege 8 Jahre (§ 147 AO,
  verkürzt seit 2025), Behandlungsdokumentation 10 Jahre (§ 630f Abs. 3 BGB).
  Die Rechnung überlebt die Akte; ihre Löschung ist nach Art. 17 Abs. 3 lit. b
  DSGVO gesperrt.
- **Auswertung „Einnahmen je Leistungsart"** für die getrennte
  Gewinnermittlung: Physiotherapie ist freiberuflich, Personal Training
  gewerblich. Als Einzelunternehmen droht keine Abfärbung nach § 15 Abs. 3
  Nr. 1 EStG, bei einer späteren Personengesellschaft schon. Der Report wird
  **jetzt** mitgeplant, später kostet er ein Vielfaches.

## 4. Rechtsrahmen

**§ 203 StGB.** Physiotherapeut:innen sind Berufsgeheimnisträger (staatlich
geregelte Ausbildung); das gilt für Behandlungsdaten. Für reine Trainingsdaten
greift § 203 nicht — weil im Training aber Screening-Daten erhoben werden, ist
die Grenze praktisch nicht sauber zu ziehen. **Festlegung: einheitlich das
strengere Niveau.** Für Dienstleister gilt § 203 Abs. 3: Auftragsverarbeitung
plus Verpflichtung zur Geheimhaltung; das deckt den Hosting-Anbieter ab
(ADR-002).

**MDR.** Verwaltung, Terminplanung, Abrechnung und Trainingsplanung ohne
medizinische Zweckbestimmung sind kein Medizinprodukt. Entscheidend ist die
**Zweckbestimmung des Herstellers**, nicht die tatsächliche Nutzung. Sobald die
Software Informationen zur Unterstützung diagnostischer oder therapeutischer
Entscheidungen liefert, greift Regel 11 — Klasse IIa mit Benannter Stelle.

Daraus drei **Feature-Verbote**, die in die Zweckbestimmung gehören
([ADR-006](../adr/ADR-006-medical-device-boundary.md)):

1. **Keine automatische Übungsauswahl** auf Basis von Diagnose oder Befund.
   Vorlagen ja — die Auswahl trifft die behandelnde Person.
2. **Keine automatisierte Auswertung** von Schmerzskala oder Verlauf mit
   Handlungsempfehlung. Anzeigen und Verlauf zeichnen ist erlaubt, Bewerten
   nicht.
3. **Kein Screening-Fragebogen, der selbst eine Trainingsfreigabe oder einen
   Abbruch ausspricht.** Die Antworten werden angezeigt, die Entscheidung
   trifft der Mensch.

## 5. Nachzug an Rang 1

Drei Sätze gehören nach `PROJECT_PRINCIPLES.md`, weil sie alles darunter
steuern:

- **§ 1 (Zweck und Geltungsbereich):** Die Software deckt zwei
  Leistungsbereiche ab — Heilbehandlung und Leistungen ohne
  Heilbehandlungszweck. Getrennt wird nach Rechtsverhältnis, nicht nach Person.
  **Im Zweifel gilt das strengere Behandlungsregime.**
- **§ 4 (Benutzerrollen), Wortlaut vom 2026-09-17:** „Zugriff folgt dem
  Verhältnis, nicht der Person. Aus einer Rolle im Trainingsverhältnis folgt
  kein Zugriff auf Daten des Behandlungsverhältnisses derselben Person, und
  umgekehrt. Datenübernahme zwischen beiden erfolgt ausschließlich als
  dokumentierte Kopie auf Grundlage einer Einwilligung."
  **Geprüft am Bestand:** § 4.1 bis § 4.7 kennen heute ausschließlich
  Behandlungsrollen (Praxisinhaber, Therapeut, Office, Teamleitung) und in
  § 4.6 das Patientenkonto; `roleKeySchema` führt `owner`, `therapist`,
  `team_lead`, `office`, `patient`. Eine **Trainingsrolle fehlt** — ohne sie
  läuft der Satz ins Leere. Der Satz wird deshalb eine eigene Ziffer **4.8**
  (er gilt über alle Rollen hinweg und gehört in keine einzelne), und § 4.6
  bekommt sein Gegenstück für Kund:innen des Trainings.
- **§ 14 (Skalierbarkeit), eng gefasste Aufhebung:** „Online Coaching ist durch
  E18 freigegeben, begrenzt auf Terminkontext, Trainingsverhältnis und
  Abrechnung der Trainingsleistung. Alle übrigen Erweiterungen in § 14 bleiben
  gesperrt." Die Enge ist der Punkt — sonst reißt die Aufhebung die ganze
  Sperrliste auf.
- **Zweckbestimmung als eigener Satz:** Die Software trifft keine
  diagnostischen oder therapeutischen Entscheidungen und schlägt keine vor.

Das ist eine Änderung an MUSS-Anforderungen in § 1, § 4 und § 14 und braucht
nach § 21 eine **neue Version mit Änderungsvermerk**. Ein Migrationshinweis
entfällt: Die Änderung am Datenmodell ist additiv (oben).

## Zwei Richtigstellungen — erledigt am 2026-09-17

Die erste Fassung dieser Vorgabe nannte zwei Dinge, die in **diesem**
Repository anders liegen. Beide sind oben eingearbeitet; sie bleiben hier
stehen, damit niemand die alte Fassung erneut anwendet:

1. **„§ 14 (Rollen und Zugriff)" gibt es hier nicht.** § 14 ist
   **Skalierbarkeit**, die Rollen stehen in **§ 4**. Beide Paragraphen werden
   berührt, aber mit verschiedenen Sätzen — siehe Abschnitt 5.
2. **Kein Migrationsschritt.** `persons` existiert seit der
   Gründungsmigration, `patients` ist bereits das Behandlungsverhältnis. Die
   Änderung ist additiv: `training_clients` kommt daneben.

## Pseudonymität — entschieden am 2026-09-17

Der ursprüngliche Verweis auf eine „pseudonyme Patientencode-Architektur aus
v1" bezog sich auf einen Prototyp-Stand, nicht auf dieses Repository.

**Festlegung des Projektinhabers:** Klarnamen beibehalten, keine
Pseudonymisierung nachrüsten. In einer Praxis, in der er selbst behandelt,
schützt sie kaum — die Zuordnung ist ohnehin bekannt und muss herstellbar
sein —, erschwert aber Terminorganisation, Abrechnung und Kommunikation
erheblich. Das Schutzniveau liefern Zugriffskontrolle, Audit und
Verschlüsselung. **Für `training_clients` gilt dasselbe**; zwei
Datenschutzniveaus in einer Anwendung dürfen nicht entstehen.

**Erledigt:** Die Festlegung steht seit dem 2026-09-17 als **§ 1.1** in
`PROJECT_PRINCIPLES.md` (Version **0.12**) — nicht in einem ADR, weil sie
alles darunter bestimmt. Damit ist dieser Punkt des Rang-1-Nachzugs **vorab
erledigt**; die übrigen Sätze zu § 1, § 4 und § 14 kommen gemeinsam, wenn die
ADRs darunter stehen.

## Was vor dem Bauen noch fehlt

- **Extern zu bestätigen:** `therapy_reduced` (Steuerberatung, B4) ·
  Gesamtbild Umsatzsteuer und getrennte Gewinnermittlung (B9) · die
  datenschutzrechtliche Bewertung der Trennung und der Einwilligung im Training
  (B2, DSFA nach ADR-007).
- **Noch nicht entschieden:** Wann im Plan das gebaut wird. Die Reihenfolge der
  Etappe 1 bleibt bis dahin unverändert (ROADMAP, Vermerk 5.7).

## 6. Der Trainingsbereich selbst — was E18 **nicht** abdeckt

E18 legt das **Fundament**: Verhältnis, Terminkontext, Abrechnung,
Rechtsrahmen. Der eigentliche Trainingsbereich ist damit **nicht** beschrieben
— weder die Oberfläche für Kund:innen und Patient:innen noch die Struktur
dahinter, in der Jannes arbeitet.

Die Themenliste dafür steht seit dem 2026-09-01 fest: die Navigation der
fremden Coaching-Software aus
[`../product/ideen/referenz-navigation.md`](../product/ideen/referenz-navigation.md)
— Übersicht, Kalender, Sessions, Check-ins, Fortschritt, Trainingspläne,
Übungsanalyse, Aktivitäten, Assessments, Athletenprofil, Gewohnheiten,
Ernährung, Chat, Einstellungen, KI-Analyse. Die Inhalte dazu liegen im
Ideenspeicher in den Bereichsdateien
[`00`](../product/ideen/00-lebenszyklus-und-zugang.md) bis
[`09`](../product/ideen/09-angebote-und-abrechnung.md); der Aufbau der
Übungsbibliothek ist als **UEB-EPIC-001/002** bereits in der Roadmap
(Stufe 2).

**Der Screenshot bleibt außerhalb des Repositories.** Er zeigt Name und
E-Mail-Adresse einer Person; `referenz-navigation.md` hält das seit dem
2026-09-06 so fest, und die Regel in `CLAUDE.md` gilt auch für Bildschirmfotos
aus fremder Software. Übernommen wird **Umfang, Ablauf und
Informationsarchitektur** — keine Texte, Symbole, Namen oder Gestaltung.

Drei Dinge, die beim Zuschnitt dieses Bereichs zu beachten sind:

1. **Die Größenordnung.** Vierzehn Bereiche sind kein Loop und kein Epic,
   sondern eine Etappe. Sie gehören einzeln geschnitten, in der Reihenfolge
   ihres Nutzens — nicht in der Reihenfolge der fremden Navigationsleiste.
2. **Drei Bereiche stoßen an die MDR-Grenze:** **KI-Analyse**, **Assessments**
   und **Ernährung**. Was dort erlaubt ist, entscheiden die drei
   Feature-Verbote aus Abschnitt 4 — anzeigen und aufzeichnen ja, bewerten und
   empfehlen nein. Diese drei werden deshalb **nicht** zuerst gebaut.
3. **Zwei Zugänge, nicht einer.** Die Oberfläche für Kund:innen ist etwas
   anderes als die Sicht, in der Jannes betreut. § 4.6 führt heute das
   Patientenkonto; das Gegenstück für das Training fehlt (Abschnitt 5).

Bevor davon etwas gebaut wird, steht das Fundament. Ein Trainingsbereich ohne
`training_clients`, ohne Terminkontext und ohne Steuerkennzeichen wäre genau
die zweite Implementierung neben einer vorhandenen, die
[`ARBEITSBEREICHE.md`](ARBEITSBEREICHE.md) verhindern soll.

## Was daraus wird — Zuordnung und Reihenfolge

Damit die Struktur nicht Stück für Stück verrutscht: **erst die Entscheidungen
an ihren Platz, dann Code.** Kein Loop beginnt, bevor der ADR über ihm steht.

| Schritt | Ergebnis                                                                                              | Rang |
| ------- | ----------------------------------------------------------------------------------------------------- | ---- |
| 1       | **[ADR-021](../adr/ADR-021-service-areas-and-legal-relationships.md)** Leistungsbereiche und Rechtsverhältnisse: Abschnitt 1, die drei harten Regeln, § 203-Niveau — **angenommen am 2026-09-20** (`PROJECT_PRINCIPLES.md` 0.12.1 §21) | 2    |
| 2       | **ADR-022** Terminkontext und Trainingsgrundlage: Abschnitt 2, Abgrenzung zu ADR-020                   | 2    |
| 3       | **ADR-006 neue Fassung**: die drei Feature-Verbote in der Zweckbestimmung                              | 2    |
| 4       | **ADR-009 neue Fassung**: Steuerkennzeichen am Posten, getrennte Nummernkreise, § 14c-Riegel, Report   | 2    |
| 5       | **`PROJECT_PRINCIPLES.md` neue Version**: § 1, § 4, Zweckbestimmung, § 14 bereinigt (§ 21)             | 1    |
| 6       | **Roadmap neu schneiden**: Loops für Datenmodell, Termin, Abrechnung; Etappe 1 bis dahin unverändert   | —    |
| 7       | **Trainingsbereich zuschneiden** (Abschnitt 6): vierzehn Bereiche einzeln, Nutzen zuerst, MDR-nahe zuletzt | —    |

Die Schritte 1 bis 5 sind Entscheidungsarbeit, keine Feature-Loops: Sie gehören
in eigene Sitzungen mit frischem Kontext, je einer pro ADR. Schritt 5 fasst
zusammen, was vorher entschieden wurde — er kommt zuletzt, nicht zuerst.
