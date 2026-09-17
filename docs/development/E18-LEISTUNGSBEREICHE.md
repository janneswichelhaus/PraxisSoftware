# E18 — Zwei Leistungsbereiche: Heilbehandlung und Training

Stand 2026-09-17 · **Loop-Vorgabe**: Eingabe für den SPEC-Schritt, kein
eigener Rang · Umsetzung **nicht begonnen**

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

| Ebene                    | Inhalt                          | Rechtsgrundlage                                                     | Aufbewahrung                                    |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| `persons`                | Identität, Kontakt, einmal je Mensch | —                                                                | folgt den Verhältnissen                         |
| `care_relationships`     | Behandlungsverhältnis           | Art. 9 Abs. 2 lit. h DSGVO i. V. m. § 630f BGB                       | 10 Jahre ab Behandlungsende                     |
| `training_relationships` | Trainingsverhältnis             | Vertragsdaten Art. 6 Abs. 1 lit. b; Screening und Gesundheitsangaben Art. 9 Abs. 2 lit. a (**ausdrückliche Einwilligung**) | 3 Jahre ab Vertragsende (§ 195 BGB), Screening früher |

Die Heilbehandlungs-Ausnahme lit. h trägt im Training **nicht** — Training ist
keine Heilbehandlung.

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

- Der Termin bekommt `context` mit `therapy`, `training`, `internal` und einen
  Verweis auf **genau ein** Verhältnis (`relationship_id`).
- Ein CHECK-Constraint erzwingt, dass Kontext und Verhältnisart zusammenpassen.
- Termine ohne Person (Blocker, Fahrtzeit) tragen `context = 'internal'` und
  `relationship_id = null`.
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
- **§ 4 (Benutzerrollen):** Zugriff folgt dem Verhältnis, nicht der Person.
  Kein automatischer Durchgriff von der Trainings- auf die Behandlungsrolle.
  Datenübernahme zwischen den Bereichen nur als dokumentierte Kopie auf
  Grundlage einer Einwilligung.
- **Zweckbestimmung als eigener Satz:** Die Software trifft keine
  diagnostischen oder therapeutischen Entscheidungen und schlägt keine vor.

Das ist eine Änderung an MUSS-Anforderungen und braucht nach § 21 eine **neue
Version mit Änderungsvermerk**, samt Migrationshinweis.

## Zwei Korrekturen am Bezug auf diesen Stand

Die Vorgabe nennt zwei Dinge, die in **diesem** Repository anders liegen. Beide
sind harmlos, müssen aber vor der Umsetzung richtiggestellt sein, sonst landet
ein Satz im falschen Absatz:

1. **„§ 14 (Rollen und Zugriff)" gibt es hier nicht.** § 14 ist
   **Skalierbarkeit**; die Rollen stehen in **§ 4** (4.1 bis 4.7). Der Satz zum
   Zugriff gehört nach § 4. **§ 14 ist trotzdem zu berühren**: Dort steht
   „Online Coaching" bis heute unter den Erweiterungen, die **nicht vorzeitig**
   gebaut werden dürfen — dieser Eintrag wird mit E18 gegenstandslos.
2. **`persons` existiert bereits** (seit der Gründungsmigration), und
   `patients` ist schon ein eigener Datensatz mit `person_id`, `status` und
   `care_started_on`. Der Migrationshinweis „bestehende `patients` werden zu
   `persons` plus `care_relationship` aufgeteilt" beschreibt deshalb weniger
   Arbeit als erwartet: Die Identität ist bereits getrennt. `patients` **ist**
   faktisch das Behandlungsverhältnis und wird umbenannt oder um die fehlenden
   Vertragsfelder ergänzt; neu entsteht `training_relationships`.

## Was vor dem Bauen noch fehlt

- **Pseudonyme Patientencode-Architektur:** Die Vorgabe verweist auf eine
  Architektur „aus v1". In diesem Stand gibt es sie **nicht** — Personen tragen
  Klarnamen in `persons`, geschützt über RLS und Auditpflicht. Zu klären:
  worauf sich der Verweis bezieht und ob eine solche Architektur eingeführt
  werden soll. Bis dahin gilt für beide Bereiche dasselbe Schutzniveau, was die
  Vorgabe verlangt.
- **Extern zu bestätigen:** `therapy_reduced` (Steuerberatung, B4) ·
  Gesamtbild Umsatzsteuer und getrennte Gewinnermittlung (B9) · die
  datenschutzrechtliche Bewertung der Trennung und der Einwilligung im Training
  (B2, DSFA nach ADR-007).
- **Noch nicht entschieden:** Wann im Plan das gebaut wird. Die Reihenfolge der
  Etappe 1 bleibt bis dahin unverändert (ROADMAP, Vermerk 5.7).

## Was daraus wird — Zuordnung und Reihenfolge

Damit die Struktur nicht Stück für Stück verrutscht: **erst die Entscheidungen
an ihren Platz, dann Code.** Kein Loop beginnt, bevor der ADR über ihm steht.

| Schritt | Ergebnis                                                                                              | Rang |
| ------- | ----------------------------------------------------------------------------------------------------- | ---- |
| 1       | **ADR-021** Leistungsbereiche und Rechtsverhältnisse: Abschnitt 1, die drei harten Regeln, § 203-Niveau | 2    |
| 2       | **ADR-022** Terminkontext und Trainingsgrundlage: Abschnitt 2, Abgrenzung zu ADR-020                   | 2    |
| 3       | **ADR-006 neue Fassung**: die drei Feature-Verbote in der Zweckbestimmung                              | 2    |
| 4       | **ADR-009 neue Fassung**: Steuerkennzeichen am Posten, getrennte Nummernkreise, § 14c-Riegel, Report   | 2    |
| 5       | **`PROJECT_PRINCIPLES.md` neue Version**: § 1, § 4, Zweckbestimmung, § 14 bereinigt (§ 21)             | 1    |
| 6       | **Roadmap neu schneiden**: Loops für Datenmodell, Termin, Abrechnung; Etappe 1 bis dahin unverändert   | —    |

Die Schritte 1 bis 5 sind Entscheidungsarbeit, keine Feature-Loops: Sie gehören
in eigene Sitzungen mit frischem Kontext, je einer pro ADR. Schritt 5 fasst
zusammen, was vorher entschieden wurde — er kommt zuletzt, nicht zuerst.
