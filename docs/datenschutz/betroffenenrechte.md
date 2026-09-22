# Verfahren für Betroffenenrechte

Stand: 2026-09-22 · Gebaut mit OPS-006 (minimal) · Verantwortlich: Praxisleitung (`owner`)

Eine der sieben Vorbedingungen des Produktivstarts aus
[ADR-007](../adr/ADR-007-data-protection-impact-assessment.md) Punkt 5. Das Dokument beschreibt,
**was die Praxis tut, wenn jemand seine Rechte geltend macht** — und was die Software dafür
hergibt. Es ist ein Arbeitsverfahren, kein Rechtsgutachten; die Validierung gehört in die
Datenschutzprüfung (B2, G14).

**Es gilt ab dem ersten echten Patientendatensatz.** Bis dahin laufen alle Schritte gegen
synthetische Daten.

## Fristen

| Was                       | Frist                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| Antwort auf ein Verlangen | unverzüglich, spätestens **ein Monat** ab Eingang (Art. 12 Abs. 3 DSGVO)  |
| Verlängerung              | um **zwei Monate**, mit Begründung, innerhalb des ersten Monats mitteilen |
| Ablehnung                 | innerhalb **eines Monats**, mit Gründen und Hinweis auf Beschwerde        |

Der Monat läuft ab **Eingang**, nicht ab Kenntnisnahme. Wer das Schreiben entgegennimmt, notiert
deshalb das Eingangsdatum.

## Ablauf

1. **Eingang festhalten.** Jedes Verlangen — Brief, E-Mail, Telefon, am Tresen — wird mit
   Eingangsdatum, Person und Inhalt notiert. Ein mündliches Verlangen ist wirksam; es wird von der
   entgegennehmenden Person aufgeschrieben.
2. **Identität prüfen** (Art. 12 Abs. 6 DSGVO). Bei bekannten Patient:innen im laufenden Kontakt
   genügt die persönliche Kenntnis. Bei schriftlichen Verlangen von unbekannter Adresse wird die
   Identität bestätigt, bevor Daten herausgehen — **nicht** durch Anforderung eines
   Ausweisdokuments in Kopie, sondern durch Rückfrage über die bereits hinterlegte Telefonnummer
   oder Anschrift. Für die Prüfung werden keine zusätzlichen Daten gespeichert.
3. **Recht einordnen.** Ein Schreiben nennt selten den Artikel. „Ich will meine Unterlagen" ist
   Auskunft (Art. 15) oder Einsicht (§ 630g BGB); „Löschen Sie alles" ist Art. 17; „Die Adresse
   stimmt nicht" ist Art. 16. Im Zweifel wird nachgefragt.
4. **Bearbeiten** nach dem Abschnitt unten.
5. **Antworten** — schriftlich, auf dem Weg, auf dem das Verlangen kam, und innerhalb der Frist.
   Eine Ablehnung nennt **Gründe** und den Hinweis auf Beschwerde bei der Aufsichtsbehörde
   (Art. 12 Abs. 4 DSGVO).
6. **Vorgang ablegen.** Verlangen, Antwort und Datum gehören in die Praxisablage. Art. 5 Abs. 2
   DSGVO verlangt den Nachweis; **die Software führt dafür heute keine Vorgangsakte** (siehe
   „Grenzen").

## Die einzelnen Rechte

### Auskunft und Kopie (Art. 15 DSGVO)

In der Akte unter **Stammdaten → Betroffenenrechte → Auskunft erstellen**. Die Funktion liefert
eine Kopie aller Daten dieser Akte: Name, Kontakt, Termine, Behandlungsgrundlagen, Dokumentation in
allen Fassungen, Dateien mit Name und Prüfsumme, Leistungen, Rechnungen und Zahlungen. Sie wird als
Datei gesichert und ausgedruckt oder übergeben.

**Der Aufruf ist auf `owner` begrenzt und wird protokolliert** (`patient_record.exported`).

Die Kopie nennt am Ende selbst, was sie **nicht** enthält:

- **Inhalt hochgeladener Dateien.** Sie werden auf Verlangen gesondert herausgegeben.
- **Das Zugriffsprotokoll.** Wer die Akte gelesen hat, ist zugleich ein Datensatz über
  beschäftigte Personen (Art. 15 Abs. 4 DSGVO, `PROJECT_PRINCIPLES.md` §20). Es wird auf
  ausdrückliches Verlangen erteilt — von Hand aus dem Auditlog, ohne die Namen der Beschäftigten,
  wenn kein besonderer Grund dagegen spricht (**ANN-092**).
- **Daten eines Trainingsverhältnisses.** Training ist ein eigenes Rechtsverhältnis mit eigener
  Akte ([ADR-021](../adr/ADR-021-service-areas-and-legal-relationships.md)); die Auskunft dazu wird
  getrennt erteilt und heute von Hand zusammengestellt.

**Neben Art. 15 steht § 630g BGB**: Einsicht in die vollständige Patientenakte, unverzüglich, am
Ort der Aufbewahrung. Die Kopie aus der Software erfüllt beides zugleich; für Abschriften dürfen
nach § 630g Abs. 2 BGB Kosten verlangt werden, für die **erste** Kopie nach Art. 15 Abs. 3 DSGVO
nicht. Im Zweifel wird nichts berechnet.

### Berichtigung (Art. 16 DSGVO)

Stammdaten werden geändert wie sonst auch. **Klinische Dokumentation wird nicht überschrieben**
(`PROJECT_PRINCIPLES.md` §5, [ADR-016](../adr/ADR-016-clinical-documentation-record.md)): Eine
unrichtige Angabe wird über **Korrektur** oder **Nachtrag** richtiggestellt, die frühere Fassung
bleibt lesbar. Das ist kein Verstoß gegen Art. 16 — die Berichtigungspflicht endet dort, wo
§ 630f BGB die Nachvollziehbarkeit verlangt; beides zusammen ergibt: richtigstellen, nicht
verschwinden lassen.

Bleibt die Richtigkeit streitig, wird der Widerspruch der betroffenen Person **als solcher**
dokumentiert.

### Löschung (Art. 17 DSGVO)

In der Akte unter **Stammdaten → Betroffenenrechte**. Die Seite zeigt, welche Fristen laufen, und
erzeugt einen **Entwurf der Antwort** mit Grundlage, Ankerdatum und Fristende.

Der Regelfall ist die **teilweise Ablehnung**: Die Patientenakte ist zehn Jahre nach Abschluss der
Behandlung aufzubewahren (§ 630f Abs. 3 BGB), Rechnungen acht Jahre ab Ende des Kalenderjahres
(§ 147 Abs. 3 AO). Art. 17 Abs. 3 lit. b DSGVO nimmt solche Daten vom Löschrecht aus
([ADR-008](../adr/ADR-008-data-retention-and-deletion.md) Punkt 2). Eine laufende **Löschsperre**
ist ein zusätzlicher Grund.

Gelöscht wird, was keiner Frist unterliegt. Nach Ablauf der Fristen löscht der Löschlauf
selbsttätig; eine Zusage „wir löschen dann" ist deshalb keine Absichtserklärung, sondern
beschreibt, was ohne weiteres Zutun geschieht.

### Einschränkung der Verarbeitung (Art. 18 DSGVO)

Für aufbewahrungspflichtige Daten ist die Einschränkung das, was statt der Löschung bleibt: Die
Daten werden nur noch aufbewahrt. **Die Software kennt dafür heute keinen eigenen Zustand** — die
Einschränkung wird im Vorgang festgehalten und praktisch umgesetzt, indem die Akte nicht
weiterbearbeitet wird. Ein technischer Zustand ist als Ausbau vorgesehen.

### Datenübertragbarkeit (Art. 20 DSGVO)

Greift nur für Daten, die auf **Einwilligung** oder **Vertrag** beruhen, und nicht für die
Behandlungsdokumentation nach Art. 9 Abs. 2 lit. h DSGVO in Verbindung mit § 22 BDSG. Die Datei aus
der Auskunft ist maschinenlesbar (JSON) und deckt den Anspruch in der Sache ab, wo er besteht.

### Widerspruch (Art. 21 DSGVO) und Widerruf (Art. 7 Abs. 3 DSGVO)

Ein Widerruf wirkt **für die Zukunft**; was auf der Einwilligung beruhte, wird beendet, die
aufbewahrungspflichtige Dokumentation bleibt. Seit PAT-006 steht ein Widerruf in der Akte unter
„Datenschutz" als eigener Vermerk neben der Einwilligung, die er widerruft (ANN-093).

## Wer darf was

Auskunft und Aufbewahrungsstand sind der Rolle **`owner`** vorbehalten — die Funktionen prüfen das
selbst, nicht die Oberfläche ([ADR-004](../adr/ADR-004-authorization-model.md)). Entgegennehmen und
weiterleiten darf jede Rolle; beantworten nicht.

## Grenzen des heutigen Stands

Ehrlich benannt, weil ein Verfahren, das mehr behauptet als die Software kann, im Ernstfall nicht
trägt:

- **Keine Vorgangsakte.** Eingang, Frist und Antwort werden außerhalb der Software geführt. Eine
  Wiedervorlage erinnert an nichts.
- **Kein Zugriffsprotokoll auf Knopfdruck** für die betroffene Person; es wird von Hand aus dem
  Auditlog erstellt (ANN-092).
- **Kein eigener Zustand für Art. 18.**
- **Kein Selbstbedienungsweg.** Ein Patientenportal gibt es nicht (`PROJECT_PRINCIPLES.md` §4.6);
  jedes Verlangen läuft über die Praxis.
- **Trainingsdaten von Hand.** Bis Etappe TR gibt es keine Auskunftsfunktion für das
  Trainingsverhältnis.

Die vollständige Funktion ist in
[`../development/ROADMAP.md`](../development/ROADMAP.md) als Komfort eingeordnet, nicht als Mangel:
Jeder dieser Punkte ist mit dem Verfahren oben auch von Hand zu erfüllen.
