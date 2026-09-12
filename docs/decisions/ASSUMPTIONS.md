# Annahmenregister

Zuletzt aktualisiert: 2026-09-12.

- **CAL-013 bringt ANN-041 neu** (Termine per E-Mail): Die Praxis wird
  Terminmails verschicken — Jannes hat das am 2026-09-12 ausdrücklich
  vorgesehen und damit seine eigene vorläufige Entscheidung zu B15 in einem
  Punkt geändert. Gebaut ist ein **Handoff**: Die Anwendung baut den Entwurf
  und übergibt ihn dem Mailprogramm der Praxis, gesendet wird dort von Hand.
  Kein neuer Dienstleister, keine automatische Erinnerung. `Datenschutz` und
  damit im Prüfpaket — offen bleibt der **dokumentierte Wunsch je Patient:in**
  (PAT-006).
- **ANN-040 ist am 2026-09-12 in Punkt 1 geändert** (siehe dort): „Die
  Anwendung verschickt weiterhin nichts" galt für den Vermerk als reine
  Nachhut. Seit CAL-013 entsteht der Weg `email` auch aus der Übergabe ans
  Mailprogramm; die übrigen drei Festlegungen gelten unverändert.
- **CAL-012 bringt ANN-040 neu** (Mitteilungsvermerk am Termin): vier Wege,
  Verfall mit jeder Terminänderung, Auditeintrag. `Datenschutz`
  und damit im Prüfpaket — offen ist insbesondere, ob der Weg „per E-Mail
  mitgeteilt" in der Auswahl bleiben soll.
- **CAL-EPIC-003b bringt ANN-037 bis ANN-039 neu, und Jannes hat alle drei am
  2026-09-12 wie empfohlen bestätigt:** geprüft wird die Länge des
  Terminfensters statt des Zeitpunkts, „verplant ist nicht genutzt" samt
  Rhythmen und Obergrenze der Serie, und der Terminzettel bleibt ein Ausdruck
  ohne Versand. **ANN-037 und ANN-038 sind `Praxisprozess` und damit
  erledigt**; sie kommen nur mit E12 beziehungsweise ABR-002 zurück.
  **ANN-039 ist `Datenschutz` und bleibt im Prüfpaket** — die Bestätigung des
  Projektinhabers ersetzt die Datenschutzprüfung nicht
  (`PROJECT_PRINCIPLES.md` §15.1 Punkt 5). Er gehört damit in die Anfrage B2.
- **CAL-EPIC-003a bringt ANN-034 bis ANN-036 neu, und Jannes hat alle drei am
  2026-09-12 wie empfohlen bestätigt:** Absagegrund als codierte Auswahl ohne
  Freitext, No-show unter der Frist der abgesagten Termine (mit gesetztem
  Ausfallhonorar-Kennzeichen keine Löschung) und `documented` auch aus
  `confirmed`. **ANN-034 (`Datenschutz`) und ANN-035 (`Recht`) bleiben trotzdem
  im Prüfpaket** — die Bestätigung des Projektinhabers ersetzt die
  Datenschutzprüfung nicht (`PROJECT_PRINCIPLES.md` §15.1 Punkt 5). **ANN-036
  ist `Technik` und damit erledigt**; er kommt nur zurück, wenn ABR-003
  `invoiced` denselben Weg gehen lässt.

Davor, am 2026-09-11, vier Dinge am selben Tag:

- **Jannes hat die Annahmen aus UX-EPIC-001 bestätigt:** ANN-018, ANN-020 und
  ANN-021 stehen auf `entschieden (Jannes)`. Alle drei sind `Datenschutz` und
  bleiben deshalb im Prüfpaket — die Bestätigung durch den Projektinhaber
  ersetzt die Datenschutzprüfung nicht.
- **Marke Own Motion:** ANN-022 und ANN-023 neu — beim Zusammenführen aus
  ANN-020/021 umnummeriert, weil zwei Zweige parallel dieselben freien Nummern
  gegriffen hatten.
- **STAFF-EPIC-002 bringt ANN-024 bis ANN-028 neu:** Privatangaben
  Beschäftigter, keine Kontoanlage durch die Anwendung, Frist der Einladung,
  Mindestlänge des Kennworts, MFA für `owner` ohne Anmeldesperre. **Auch diese
  fünf sind beim Zusammenführen verschoben worden** (vorher ANN-022 bis
  ANN-026) — aus demselben Grund. **Drei davon hat Jannes am selben Tag
  entschieden:** ANN-024 (dienstliche statt privater Anschrift), ANN-027
  (zwölf Zeichen ohne Zeichenklassen) und ANN-028 (MFA-Pflicht erst mit einer
  feststehenden Domain). Alle drei sind `Datenschutz` und bleiben deshalb im
  Prüfpaket. **Offen bleiben ANN-025 und ANN-026** — beide hängen an OPS-001
  beziehungsweise am Löschkonzept.

- **LOE-EPIC-001 bringt ANN-029 bis ANN-033 neu** — Frist des Auditlogs
  unabhängig von der Akte, Beschäftigtendaten ohne Frist, Löschjournal ohne
  eigene Frist, Abschluss der Versorgung als ausdrücklicher Vorgang, Legal Hold
  nur auf Patientenebene. **Jannes hat alle fünf am 2026-09-11 wie empfohlen
  bestätigt.** Vier davon sind `Datenschutz` beziehungsweise `Recht` und
  bleiben deshalb im Prüfpaket: Die Bestätigung des Projektinhabers ersetzt die
  Datenschutzprüfung nicht (`PROJECT_PRINCIPLES.md` §15.1 Punkt 5). Allein
  ANN-032 ist `Praxisprozess` und damit mit dieser Bestätigung erledigt — bis
  die ersten Praxiswochen zeigen, ob der Vorgang im Alltag getan wird.

Dieses Register hält **begründete, vorläufige Annahmen** fest: Entscheidungen,
die für eine Aufgabe nötig waren, aber weder in `PROJECT_PRINCIPLES.md` noch in
einem ADR noch in der Feature-Spezifikation getroffen sind. Der Prozess dahinter
steht in `PROJECT_PRINCIPLES.md` §15.1.

Eine Annahme ist **kein Fehler und keine Entscheidung des Projektinhabers**. Sie
ist die nach Recherche beste verfügbare Antwort, damit die Arbeit weitergeht —
und sie ist ausdrücklich dafür gebaut, später **bestätigt, geändert oder
verworfen** zu werden, insbesondere durch die Datenschutzprüfung vor
Produktivstart (ADR-007).

## Rang und Grenzen

- Das Register steht in der Dokumentenhierarchie **unter** den Prinzipien, den
  ADRs und der jeweiligen Feature-Spezifikation. Eine Annahme füllt eine Lücke;
  sie überschreibt nichts.
- Eine Annahme DARF NICHT einer MUSS- oder DARF-NICHT-Anforderung aus
  `PROJECT_PRINCIPLES.md` oder einem ADR widersprechen, keine Sicherheits- oder
  Datenschutzmaßnahme aufweichen und nichts berühren, was §3.1 bis §3.3 und
  ADR-013 regeln (echte Daten, Produktionscredentials, Secrets, Deployment).
  Was das bräuchte, ist keine Annahme, sondern eine Änderungsanfrage an Jannes.
- Eine **bestätigte** Annahme, die später teuer rückgängig zu machen wäre, wird
  zum ADR (`docs/adr/README.md`, „Wann ein ADR geschrieben wird"). Der Eintrag
  hier bleibt mit Status `in ADR überführt` und Verweis stehen.
- Überbrückt eine Annahme einen Punkt aus `OPEN_DECISIONS.md`, bleibt der Punkt
  dort **offen** und verweist auf die `ANN`-Kennung. Das Register entscheidet
  nichts endgültig.

## Lebenszyklus

| Status                 | Bedeutung                                                                                    |
|------------------------|----------------------------------------------------------------------------------------------|
| `offen`                | getroffen und umgesetzt, noch von niemandem bestätigt                                        |
| `entschieden (Jannes)` | Jannes hat die Festlegung selbst getroffen oder bestätigt, mit Datum. Für `Praxisprozess` und `Technik` ist der Eintrag damit erledigt; für `Datenschutz` und `Recht` ist es **keine externe Bestätigung** — der Eintrag bleibt im Prüfpaket |
| `bestätigt (Prüfung)`  | von der Datenschutzprüfung oder der zuständigen externen Stelle bestätigt — mit Datum und Instanz im Eintrag |
| `geändert`             | die Prüfung hat eine andere Festlegung verlangt; der Eintrag nennt die neue und den Commit    |
| `verworfen`            | die Annahme wurde aufgegeben; der Eintrag nennt, was stattdessen gilt                        |
| `in ADR überführt`     | bestätigt und als ADR festgehalten; Verweis auf die ADR-Nummer                                |

Ein Eintrag wird **nie gelöscht**. Auch eine verworfene Annahme bleibt
nachvollziehbar, damit die Prüfung sieht, was zwischenzeitlich galt.

**Warum `entschieden (Jannes)` und `bestätigt (Prüfung)` getrennt sind.** Beide
standen bis zum 2026-09-07 zusammen unter `bestätigt`. Damit hätte eine
Bestätigung durch Jannes den Go-live-Blocker der Kategorien `Datenschutz` und
`Recht` bereits erfüllt, obwohl §15.1 Punkt 5 dort ausdrücklich den
Datenschutzprozess nach §3.7 verlangt. Die Trennung schließt diese Lücke. Sie
ist die Register-Seite des Status `vorläufig entschieden (Jannes)` aus
`OPEN_DECISIONS.md`: Jannes darf jede offene Festlegung selbst treffen, damit
die Arbeit weiterläuft — sie zählt fürs Bauen, nicht für die Freigabe.

## Aufbau eines Eintrags

Jeder Eintrag hat eine fortlaufende Kennung `ANN-NNN` und diese Felder:

| Feld              | Inhalt                                                                                                                   |
|-------------------|--------------------------------------------------------------------------------------------------------------------------|
| **Kategorie**     | `Datenschutz`, `Recht`, `Praxisprozess` oder `Technik` — danach filtert die Prüfung                                      |
| **Herkunft**      | Aufgabe, Story oder ADR, bei der die Lücke aufgefallen ist                                                                 |
| **Annahme**       | die Festlegung in ein bis drei Sätzen, so konkret, dass man sie widerlegen kann                                           |
| **Begründung**    | was recherchiert wurde und warum diese Option: Gesetzestext, Behördenleitlinie, ADR, Praxislogik. Unsicheres steht als unsicher da |
| **Verankerung**   | wo die Annahme im Code oder in Dokumenten greift — Datei, Funktion, Migration, Test. Die Stelle trägt die Kennung als Kommentar |
| **Änderungspfad** | was zu tun ist, wenn die Annahme nicht hält, und der geschätzte Aufwand: `klein` (eine Stelle), `mittel` (ein Modul, Migration ohne Datenumzug), `groß` (mehrere Module oder Datenumzug) |
| **Status**        | siehe Lebenszyklus, mit Datum                                                                                             |
| **Wiedervorlage** | wer oder was die Annahme prüft: Datenschutzprüfung, Jannes, ein bestimmtes Epic                                          |

**Reversibel verankern** ist eine Entwurfsregel, keine Kür: Eine Annahme SOLLTE
an genau einer Stelle greifen — eine Policy-Funktion, ein Konfigurationswert,
eine Konstante, eine Migration. Lässt sich das nicht erreichen und wäre der
Änderungsaufwand `groß`, ist das ein Signal, vor der Umsetzung nachzufragen.

### Kennung im Code

Die Stelle, an der eine Annahme greift, trägt ihre Kennung im Kommentar:

```sql
-- ANN-002: Statuswechsel ist Praxisführung, nicht Behandlung.
create or replace function app.can_change_patient_status() ...
```

```ts
// ANN-005: Abschluss ohne Dokumentationspflicht, siehe Annahmenregister.
```

Alle Verankerungen findet:

```bash
git grep -n "ANN-[0-9]\{3\}" -- ':!docs/decisions/ASSUMPTIONS.md'
```

Eine Kennung, die im Code steht, aber hier fehlt — oder umgekehrt eine
Verankerung, die im Register genannt wird, aber im Code keine Kennung trägt —
ist ein Mangel, der im Review des Loops auffallen muss.

## Prüfpaket für die Datenschutzprüfung

Wenn die Datenschutzprüfung ansteht, ist dieses Register die Arbeitsliste:

1. Alle Einträge der Kategorien `Datenschutz` und `Recht` mit Status `offen`
   **oder `entschieden (Jannes)`** durchgehen. Die Übersichtstabelle unten
   filtert sie. Ein Eintrag, den Jannes selbst entschieden hat, ist für die
   Prüfung kein erledigter Punkt, sondern eine Vorlage: er sagt, was gelten
   soll, und der Änderungspfad sagt, was ein Widerspruch kostet.
2. Je Eintrag: bestätigen oder eine andere Festlegung verlangen. Der
   **Änderungspfad** sagt vorab, was eine Änderung kostet — die Prüfung muss
   den Code dafür nicht lesen.
3. Ergebnis im Eintrag festhalten: Status, Datum, prüfende Instanz, bei
   Änderungen die neue Festlegung.
4. Geänderte Annahmen werden als eigene Aufgabe umgesetzt; der Eintrag verweist
   danach auf den Commit.

Vor Produktivstart MUSS jeder Eintrag der Kategorien `Datenschutz` und `Recht`
auf `bestätigt (Prüfung)`, `geändert`, `verworfen` oder `in ADR überführt`
stehen. `offen` und `entschieden (Jannes)` blockieren beide den Produktivstart
(`docs/DEVELOPMENT.md`, Go-live-Blocker; ROADMAP M3).

## Übersicht

| Kennung | Thema                                                          | Kategorie     | Status | Wiedervorlage                 |
|---------|----------------------------------------------------------------|---------------|--------|-------------------------------|
| ANN-001 | Interne Initialfristen des Retention Schedule                  | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-002 | Versorgungsstatus `inactive` und Rollenschnitt des Wechsels    | Praxisprozess | entschieden (Jannes) 2026-09-08 | erledigt; Fristanker erneut bei LOE-001 |
| ANN-003 | Adress-Snapshot beim Hausbesuchstermin                         | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-004 | Inhalt des Audit-Kontexts bei organisatorischen Einstellungen  | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-005 | Terminabschluss ohne Dokumentationspflicht                     | Praxisprozess | entschieden (Jannes) 2026-09-11 | bleibt in Kraft; ADR-018 bestätigt sie, Wiedervorlage ABR-002 |
| ANN-006 | Umfang und Protokollierung des Behandlungsnachweises in der Akte | Datenschutz | offen  | Datenschutzprüfung; Leistungskürzel bei ABR-002 |
| ANN-007 | Mechanismus der automatischen Finalisierung: pg_cron          | Technik       | entschieden 2026-09-05 | Providerprüfung nach ADR-002 |
| ANN-008 | Fristbezug der automatischen Finalisierung                     | Praxisprozess | entschieden (Jannes) 2026-09-08; **Zahl offen** | Jannes nach den ersten Praxiswochen |
| ANN-009 | Systemakteur im Auditlog                                       | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-010 | Sichtbarkeit und Frist der internen Versorgungsangaben          | Datenschutz   | entschieden (Jannes) 2026-09-08 | **Datenschutzprüfung** — bleibt im Prüfpaket |
| ANN-011 | Datenklasse und Rollenschnitt der Verordnung                    | Datenschutz   | offen  | Datenschutzprüfung; C1 bei ABR-002 |
| ANN-012 | Genutzte Menge wird bis CAL-007/ABR-002 von Hand gepflegt      | Praxisprozess | entschieden (Jannes) 2026-09-08 | abgelöst durch CAL-007 und ABR-002 |
| ANN-013 | Datenklasse und Frist der Verordnerkartei                       | Datenschutz   | offen  | Datenschutzprüfung            |
| ANN-014 | „Empfehlung zum Verordnungsende" ist eine Angabe, keine Systemempfehlung | Recht | offen | Datenschutzprüfung; B1 (MDR-Abgrenzung) |
| ANN-015 | Umfang und Wortlaut der Verbindungsanzeige                      | Technik       | entschieden (Jannes) 2026-09-08 | UX-EPIC-001 (Textverlust-Schutz) |
| ANN-016 | Koordinate als abgeleitetes Stammdatum der Adresse             | Datenschutz   | offen  | Datenschutzprüfung; MAP-006 (Migration) |
| ANN-017 | Serverseitiger Kartendienst-Adapter als Supabase Edge Function  | Technik       | offen  | OPS-001 (Edge Runtime, ADR-015 Punkt 20); MAP-003 |
| ANN-018 | Übergabeziel und URL-Format des Navigations-Handoffs           | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung (B2); MAP-005 |
| ANN-019 | Verfallsdauer und Bindung des Verordnungsentwurfs (VER-003)      | Technik       | entschieden 2026-09-08 | UX-EPIC-001 (Restpunkt Textverlust-Schutz) |
| ANN-020 | Datenklasse und Frist der Textbausteine                          | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung; LOE-001 (Retention Schedule) |
| ANN-021 | Feldliste und Vorhaltedauer des Tagesplans im Arbeitsspeicher    | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung; Jannes nach dem ersten Feldtag |
| ANN-022 | Tiefgrün der Marke als Hover-Zustand des Akzents                 | Technik       | offen  | Jannes; MARKE-001 (Befund App-Symbole)    |
| ANN-023 | Die Kopfzeile führt die Marke, nicht den Organisationsnamen      | Praxisprozess | offen  | Jannes; erneut, falls eine zweite Praxis dazukommt (ADR-003) |
| ANN-024 | Privatangaben Beschäftigter: Schreibrecht folgt dem Leserecht    | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung |
| ANN-025 | Die Anwendung legt keine Authentifizierungskonten an             | Technik       | offen  | OPS-001 (Providerprüfung)                 |
| ANN-026 | Datenklasse und Frist der Einladung                              | Datenschutz   | offen  | Datenschutzprüfung; LOE-001a (im Retention Schedule verankert) |
| ANN-027 | Mindestlänge des Kennworts: 12 Zeichen, keine Zeichenklassen     | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung |
| ANN-028 | MFA für `owner`: eingerichtet und sichtbar, nicht erzwungen      | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Jannes, sobald eine Domain feststeht; Datenschutzprüfung |
| ANN-029 | Auditeinträge folgen ihrer eigenen Frist, nicht der der Akte     | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung |
| ANN-030 | Beschäftigtendaten ohne Frist: keine automatische Löschung in V1 | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung; erneut, sobald die erste Person ausscheidet |
| ANN-031 | Das Löschjournal hat selbst keine Frist                          | Datenschutz   | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung; OPS-003 (Backup-Lebenszyklus, ADR-012) |
| ANN-032 | „Abschluss der Versorgung" als ausdrücklicher, rücknehmbarer Vorgang | Praxisprozess | entschieden (Jannes) 2026-09-11 | Jannes nach den ersten Praxiswochen; Datenschutzprüfung (Fristanker) |
| ANN-033 | Legal Hold nur auf Patientenebene, nur `owner`, ohne Pflegeoberfläche | Recht         | entschieden (Jannes) 2026-09-11, weiter im Prüfpaket | Datenschutzprüfung (B2); erneut, sobald ein Vorgang eintritt |
| ANN-034 | Absagegrund als codierte Auswahl aus vier Werten, kein Freitext  | Datenschutz   | entschieden (Jannes) 2026-09-12, weiter im Prüfpaket | Datenschutzprüfung (B2); außerdem Jannes nach den ersten Praxiswochen |
| ANN-035 | No-show: Frist der abgesagten Termine, mit Ausfallhonorar keine Löschung | Recht         | entschieden (Jannes) 2026-09-12, weiter im Prüfpaket | ABR-003 (Rechnung über das Ausfallhonorar); Datenschutzprüfung (B2) |
| ANN-036 | `documented` auch aus `confirmed`: die Finalisierung schließt den Termin mit ab | Technik       | **entschieden (Jannes) 2026-09-12 — erledigt** | nur noch mit ABR-003, wenn `invoiced` denselben Weg geht |
| ANN-037 | Geprüft wird die **Länge** des Terminfensters, nicht der Zeitpunkt | Praxisprozess | **entschieden (Jannes) 2026-09-12 — erledigt** | nur noch mit E12 Punkt 1 und 2 |
| ANN-038 | Terminserie: verplant ist nicht genutzt, drei Rhythmen, höchstens 30 je Vorgang | Praxisprozess | **entschieden (Jannes) 2026-09-12 — erledigt** | nur noch mit ABR-002 |
| ANN-039 | Terminzettel: Inhalt, nur Druck, kein Versand, Aufruf als Aktenzugriff protokolliert | Datenschutz   | entschieden (Jannes) 2026-09-12, weiter im Prüfpaket | Datenschutzprüfung (B2); Versandweg mit B15 |
| ANN-040 | Mitteilungsvermerk: vier Wege, Verfall mit jeder Terminänderung, Auditeintrag | Datenschutz   | offen (2026-09-12)    | Datenschutzprüfung (B2); der Weg `email` mit B15 und PAT-006 |
| ANN-041 | Termin-E-Mail als Handoff ins eigene Mailprogramm: Inhalt, Betreff, Längengrenze, Vermerk auf die Übergabe | Datenschutz   | offen (2026-09-12)    | Datenschutzprüfung (B2); der dokumentierte Wunsch je Patient:in mit PAT-006 |
| ANN-042 | Eine Verordnung ist „ausgeschöpft", wenn ihre Leistungseinheiten genutzt sind — nicht nach Ablauf einer Frist | Praxisprozess | offen (2026-09-12)    | Jannes nach den ersten Praxiswochen; erneut mit ABR-002 (genutzte Menge aus der Abrechnung) |

Die Einträge ANN-001 bis ANN-005 wurden am 2026-09-03 **rückwirkend** erfasst.
Sie waren in Migrationen, ADRs und Abnahmeschritten bereits begründet,
standen aber an keiner Stelle gesammelt. Weitere Altannahmen werden
nachgetragen, sobald ein Loop sie berührt.

---

## Einträge

### ANN-001 — Interne Initialfristen des Retention Schedule

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | ADR-008 (Retention Schedule), ADR-010 (Auditlog), ADR-011 (Log-Retention) |
| Status | offen, seit 2026-08-28 (rückwirkend erfasst 2026-09-03) |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart |

**Annahme.** Die Fristen ohne unmittelbare gesetzliche Vorgabe gelten vorläufig
so, wie ADR-008 und ADR-011 sie tabellieren: abgesagte Termine und No-shows ohne
Rechnung 3 Jahre ab Jahresende; organisatorische Patientenkommunikation 3 Jahre;
Terminanfragen ohne Behandlungsverhältnis 12 Monate; Routing-Rohdaten 30 Tage;
nicht angenommene KI-Entwürfe 7 Tage; Patientenakten-Auditlog und
AI-Gateway-Metadaten 3 Jahre; Authentifizierungs-/Securitylogs 12 Monate;
Operational Logs 30 Tage; interner Teamchat rollierend 12 Monate.

**Begründung.** Art. 5 Abs. 1 lit. e DSGVO (Speicherbegrenzung) verlangt für
jeden Zweck eine definierte Frist; ohne Frist fehlt die rechtmäßige
Speicherdauer. Gesetzlich bestimmt sind nur Behandlungsunterlagen (§630f Abs. 3
BGB, zehn Jahre) und steuerlich relevante Belege (§147 AO, §257 HGB), siehe
ADR-008. Die übrigen Fristen hat ADR-008 als interne Initialentscheidung
gesetzt und dort selbst zur Validierung vor Produktivstart vorgemerkt; eine
Herleitung je Frist ist in ADR-008 nicht dokumentiert. Naheliegender Anker für
die Dreijahresfristen ist die regelmäßige Verjährung nach §195 BGB
(Ausfallhonorar, organisatorische Streitfälle), für Auditlogs die
Rechenschaftspflicht nach Art. 5 Abs. 2 DSGVO. Das ist eine Lesart, keine
belegte Begründung.

**Verankerung (seit LOE-001a, 2026-09-11).** Die Fristen stehen an **genau
einer Stelle**: `public.retention_classes` in
`supabase/migrations/20260911150000_retention_schedule.sql`. Funktionen lesen
sie ausschließlich über `app.retention_interval()`; keine Zahl steht ein
zweites Mal im Code. Welche Tabelle zu welcher Klasse gehört, steht in
`public.retention_assignments`, und `supabase/tests/retention.test.ts` prüft
die Zuordnung gegen `pg_tables` — eine neue Tabelle ohne Datenklasse macht den
Lauf rot. ADR-008, Abschnitt „Initialer Retention Schedule", bleibt die
normative Fassung; die Tabellenkommentare der Migrationen bleiben als
Erläuterung stehen.

**Änderungspfad.** Eine Frist ändern: eine Migration mit einem `update` auf
`public.retention_classes` und die Tabelle in ADR-008 nachziehen — Aufwand
`klein`, und sie wirkt sofort auf alle Regeln des Löschlaufs. Eine Frist
**neu** einführen, wo bisher keine galt (etwa für Beschäftigtendaten, ANN-030),
braucht zusätzlich einen fachlichen Anker im Datenmodell und eine Regel in
`public.apply_retention()` — Aufwand `mittel`. Bewusst kein Klickweg in der
Oberfläche: Eine Friständerung soll im Repository nachvollziehbar sein
(ADR-013).

### ANN-002 — Versorgungsstatus `inactive` und Rollenschnitt des Wechsels

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | PAT-003 |
| Status | **entschieden (Jannes) 2026-09-08**; getroffen 2026-08-29, rückwirkend erfasst 2026-09-03 |
| Wiedervorlage | Jannes; der Behandlungsabschluss zusätzlich im Epic Behandlungsdokumentation |

**Annahme.** `inactive` ist eine rein organisatorische Markierung („nicht in
laufender Versorgung"). Sie ist kein Behandlungsabschluss im Sinne von ADR-008
und startet keine Aufbewahrungsfrist. Den Status dürfen `owner`, `team_lead`
und `office` wechseln, `therapist` nicht.

**Begründung.** Der Wechsel nimmt eine Person aus dem laufenden Betrieb und ist
damit ein Vorgang der Praxisführung und Verwaltung (`PROJECT_PRINCIPLES.md`
§4.1, §4.3, §4.5), kein Behandlungsschritt. Der „Abschluss der Behandlung" ist
in ADR-008 als offene Folgefrage geführt und braucht ein eigenes Feld mit
ADR-Bezug — nicht diese Markierung.

**Verankerung.** `app.can_change_patient_status()` und `set_patient_status` in
`supabase/migrations/20260829110000_patient_status.sql`; Datenbanktest in
`pnpm test:db`; E2E-Test „Autorisierung auf RPC-Ebene"; Abnahmeschritt PAT-003 in
`docs/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Rollenschnitt: eine Migration, die
`app.can_change_patient_status()` ersetzt — Aufwand `klein`.
Behandlungsabschluss: eigenes Feld und eigene Regel, nicht diese Funktion —
Aufwand `mittel`, weil die klinische Retention daran hängt.

**Rückmeldung von Jannes (2026-09-05).** Ein manuell gepflegtes Aktiv/Inaktiv
sei im Alltag praxisfern. Gewünscht ist stattdessen eine automatische
Klassifizierung, gekoppelt an eine Erinnerung für Therapeut:innen gegen
Rezeptende mit einer Empfehlung zum weiteren Vorgehen — festgehalten als
`IDEA-LZK-007` in
`docs/product/ideen/00-lebenszyklus-und-zugang.md`. Das ändert diese Annahme
noch nicht: Automatisierung und der verordnungsfreie Übergang sind durch B9
blockiert (Rechtsrahmen offen). Bis zu einer Entscheidung dort bleibt die
obige Annahme (organisatorische Markierung, kein Behandlungsabschluss,
Rollenschnitt wie beschrieben) technisch in Kraft — Status bleibt `offen`.

### ANN-003 — Adress-Snapshot beim Hausbesuchstermin

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | CAL-001 |
| Status | **entschieden (Jannes) 2026-09-08**; getroffen 2026-08-30, rückwirkend erfasst 2026-09-03 |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart |

**Annahme.** Für Hausbesuche wird die Patientenadresse bei Terminanlage in den
Termin kopiert (`visit_street`, `visit_house_number`, `visit_postal_code`,
`visit_city`), nicht referenziert. Eine spätere Stammdatenänderung ändert nicht
rückwirkend, wohin an diesem Tag gefahren wurde. Die Adresse liegt damit
doppelt vor und unterliegt im Termin der Frist der Datenklasse
„organisatorische Behandlungsdaten" — auch bei abgesagten Terminen.

**Begründung.** Behandlungsnachweis (§4.4) und spätere Abrechnung (§19,
Snapshot-Prinzip aus ADR-009) brauchen den damaligen Ort. Die Datenminimierung
nach Art. 5 Abs. 1 lit. c DSGVO ist gewahrt, soweit nur die für die Anfahrt
nötigen Felder kopiert werden und der Termin keiner längeren Frist unterliegt
als die Akte. Der wunde Punkt ist der **abgesagte** Hausbesuch: Er behält die
Adresse nach ADR-008 drei Jahre, obwohl keine Anfahrt stattgefunden hat.

**Verankerung.** Spalten `visit_*` und Constraint
`appointments_address_matches_type` in
`supabase/migrations/20260830100100_appointments.sql`; einziger Schreiber ist
`create_appointment`; Abnahmeschritt CAL-001 in
`docs/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Verlangt die Prüfung für abgesagte Termine eine kürzere
Frist oder das Entfernen der Adresse: die `visit_*`-Felder in
`cancel_appointment` auf `null` setzen — Aufwand `klein`. Verlangt sie
generell Referenz statt Kopie: Migration, die die Spalten entfernt und den
Behandlungsnachweis auf die Stammdaten umstellt — Aufwand `mittel`, mit dem
Verlust der historischen Adresse als bewusster Folge.

### ANN-004 — Inhalt des Audit-Kontexts bei organisatorischen Einstellungen

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | CAL-005 und Nachtrag Arbeitszeit-Audit; ADR-010 |
| Status | offen, seit 2026-08-30 (rückwirkend erfasst 2026-09-03) |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart |

**Annahme.** Bei `organization.appointment_grid_changed` werden alter und
neuer Minutenwert in `audit_log.context` gespeichert. Bei Änderungen an
Arbeitszeiten (`staff_working_hours.*`, `staff_working_hour_exception.*`)
enthält der Kontext Datensatz-Kennungen und bei Abweichungen die Art der
Abweichung (`kind`) — keine Uhrzeiten, keinen Wochentag, kein Datum. Ein Minutenraster gilt als organisatorische Einstellung
ohne Personenbezug; Arbeitszeiten sind Beschäftigtendaten und bleiben deshalb
aus dem Auditlog heraus.

**Begründung.** ADR-010 beschränkt das Auditlog auf Metadaten ohne klinische
Inhalte. Beschäftigtendaten unterliegen `PROJECT_PRINCIPLES.md` §20 und §26
BDSG; ein Auditlog, das Arbeitszeitverläufe je Person nachzeichnet, wäre eine
Auswertung, die §20 nicht deckt. Der Lesepfad `list_audit_events` gibt
`context` grundsätzlich nicht heraus (`docs/DEVELOPMENT.md`, Abschnitt Audit).

**Verankerung.** `set_appointment_grid` in
`supabase/migrations/20260830120000_scheduling_grid.sql`;
`set_staff_working_hours` und `set_staff_working_hour_exception` in
`supabase/migrations/20260830130000_working_hours_audit.sql`;
`list_audit_events` in `supabase/migrations/20260828110100_audit_read_path.sql`
(seit DOK-004 in `20260904120000_treatment_note_auto_finalisation.sql`);
`set_documentation_deadline` ebendort (Alt- und Neuwert der Frist in Tagen,
DOK-004).

**Änderungspfad.** Kontextinhalt je Funktion in einer Migration ändern —
Aufwand `klein`. Bereits geschriebene Zeilen sind über den Anwendungspfad nicht
lesbar; ob sie bereinigt werden müssen, entscheidet die Prüfung.

### ANN-005 — Terminabschluss ohne Dokumentationspflicht

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | CAL-004 |
| Status | **entschieden (Jannes) 2026-09-11** — ADR-018 ist angenommen und bestätigt die Annahme ausdrücklich: der Abschluss verlangt keine Dokumentation, die Kopplung sitzt an der Rechnung. Erfasst 2026-08-30, rückwirkend registriert 2026-09-03. |
| Wiedervorlage | ABR-002 (Leistungserfassung am abgeschlossenen Termin); DOK-003 hat die Kopplung geprüft und nicht eingeführt, siehe Nachtrag |

**Annahme.** Ein Termin kann abgeschlossen werden, ohne dass eine
Behandlungsdokumentation existiert. Der Abschluss gibt den Zeitraum nicht frei
und lässt sich wieder öffnen; beide Ereignisse bleiben im Auditlog. Die
Kopplung „Fakturierung erst nach finalisierter Dokumentation" (§19) wird an der
Leistung beziehungsweise Rechnung verankert, nicht am Terminstatus.

**Begründung.** Bei CAL-004 gab es noch keine Dokumentation. §19 bindet die
Fakturierung an die Dokumentation, nicht den Terminstatus; der
Terminstatus-Automat ist in `OPEN_DECISIONS.md` (Abschnitt D, „bestätigt")
offen. DOK-001 und DOK-002 (ADR-016) haben die Kopplung bewusst nicht
eingeführt: Ein Entwurf darf unbegrenzt Entwurf bleiben, und ein Termin mit
Dokumentation lässt sich weiterhin absagen (`docs/DEVELOPMENT.md`, Bekannte
Einschränkungen 9 und 10).

**Verankerung.** `complete_appointment` und `reopen_appointment` in
`supabase/migrations/20260830110000_appointment_completion.sql`;
Abnahmeschritt CAL-004 in
`docs/abnahme/etappe-0-patienten-und-termine.md`.

**Änderungspfad.** Entweder eine Prüfung in `complete_appointment` ergänzen
oder den Abschluss aus der Finalisierung der Dokumentation heraus auslösen —
Aufwand `klein` bis `mittel`, je nach Variante. Die Entscheidung fällt
spätestens, wenn ABR-002 abgeschlossene Termine zu Leistungen macht, und wird
hier nachgetragen.

**Nachtrag 2026-09-04 (DOK-003).** Die Kopplung wird nicht eingeführt. Seit
DOK-003 zeigt die Akte jeden begonnenen Termin mit seinem Dokumentationsstand:
ein abgeschlossener Termin ohne Dokumentation steht dort für Praxisleitung,
Therapeut:innen und Verwaltung als „Abgeschlossen" mit „Keine Dokumentation."
— sichtbar, ohne dass der Terminabschluss blockiert. Sichtbarkeit statt
Sperre ist die leichter umkehrbare Option (§16); ob eine Sperre nötig wird,
zeigt sich, wenn ABR-002 Leistungen an abgeschlossene Termine bindet.

**Nachtrag 2026-09-05 (Planungsreview).** Jannes hat den vollständigen
Terminstatus-Automaten entschieden (angefragt, vorgemerkt, bestätigt,
abgesagt, nicht angetroffen, durchgeführt, dokumentiert, abgerechnet;
`OPEN_DECISIONS.md`, Abschnitt D). Die Ausgestaltung — insbesondere ob
„dokumentiert" aus der Finalisierung abgeleitet wird und was aus
„abgeschlossen" wird — legt ADR-018 im Loop CAL-EPIC-003 fest. Bis dahin
bleibt diese Annahme unverändert in Kraft; die Wiedervorlage wechselt von
ABR-002 auf CAL-EPIC-003.

**Nachtrag 2026-09-11 (ADR-018 angenommen).** Die Ausgestaltung ist
entschieden, und sie bestätigt diese Annahme, statt sie abzulösen: Der
Abschluss (`completed`) verlangt weiterhin keine Dokumentation. Neu ist der
technische Anker für §19 — die Rechnung darf nur aus `documented` entstehen
oder aus `no_show` mit Ausfallhonorar (ADR-018, Konsequenzen). Damit sitzt
die Kopplung genau dort, wohin diese Annahme sie von Anfang an verwiesen hat:
an der Leistung beziehungsweise Rechnung, nicht am Terminstatus. Die Annahme
bleibt in Kraft; die Wiedervorlage wechselt zurück auf **ABR-002**, weil dort
die Leistungserfassung entsteht, die sie berührt. Der Satz in der Begründung,
der Automat sei offen, ist mit ADR-018 überholt.

### ANN-006 — Umfang und Protokollierung des Behandlungsnachweises in der Akte

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | DOK-003 (Dokumentation in der Akte, rollenabhängig projiziert); überbrückte bis zum 2026-09-05 auch Punkt C1 in `OPEN_DECISIONS.md`, der seither entschieden ist |
| Status | **entschieden (Jannes) 2026-09-08** — mit einem Vorbehalt: die **Zahl** (Voreinstellung 1 Tag) wird nach den ersten Praxiswochen festgezurrt, wie ADR-016 es vorsieht. Mechanik und Fristbezug stehen. |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart; die Aufnahme der Leistungskürzel in den Nachweis bei ABR-002 |

**Annahme.** Der Behandlungsnachweis nach `PROJECT_PRINCIPLES.md` §4.4 ist in
der Akte eine eigene Serverfunktion (`list_patient_treatment_evidence`) mit
genau diesem Datenumfang je Termin: Datum, Zeitraum, Terminart, behandelnde
Person, Terminstatus, Dokumentationsstand (`none`, `draft`, `final`) und der
Zeitpunkt der Finalisierung. **Nicht enthalten** sind der klinische Inhalt,
Verfasser- und Finalisierernamen, Versionszahlen, Nachträge,
Korrekturbegründungen und — solange es keine Leistungserfassung gibt — die
„erbrachte Leistung". Ein Entwurf wird nur als vorhanden gemeldet, ohne
Zeitpunkt. Lesen dürfen alle vier Praxisrollen; Patientenkonten nicht. Das
Lesen des Nachweises erzeugt **keinen eigenen Auditeintrag**: er enthält
keinen klinischen Inhalt, und das Öffnen der Akte, in der er steht, wird
bereits als `patient_record.viewed` protokolliert.

**Begründung.** §4.4 zählt die Felder des Nachweises auf und verbietet dem
Office ausdrücklich den medizinischen Inhalt; ADR-004 macht den Nachweis zu
einer „eigenen Sicht mit eigenem Datenumfang, kein gefilterter Auszug". Die
Datenminimierung nach Art. 5 Abs. 1 lit. c DSGVO verlangt, dass für den Zweck
— den organisatorischen Streitfall („am 14.08. sei niemand erschienen") —
nur das Nötige geliefert wird: dass ein Termin stattfand, wer eingeplant war
und ob und wann dokumentiert wurde. Der Zeitpunkt der Finalisierung ist dabei
der Zeitpunkt, ab dem der Eintrag Bestandteil der Akte ist (ADR-016 Punkt 4);
ein Entwurf ist kein Nachweis im Sinne von §630f BGB (ADR-016 Punkt 3) und
bekommt deshalb keinen. Versionen und Nachträge unterliegen nach ADR-016
Punkt 8 derselben Projektion wie der Inhalt und bleiben dem Office
verschlossen. „Signatur/Bestätigung der Behandlung" (§4.4) wird durch die
Finalisierung selbst abgebildet, nicht durch die Nennung der finalisierenden
Person — die restriktivere Lesart nach §16. Die „erbrachte Leistung" kann
nicht geliefert werden, weil es sie im System noch nicht gibt; dass
Leistungskürzel organisatorisch sind und dem Office offenstehen, ist seit dem
2026-09-05 mit C1 entschieden (`PROJECT_PRINCIPLES.md` §4.4, Version 0.4) und
umzusetzen, sobald die Leistungserfassung existiert. Für die
Protokollierung gilt ADR-010: auditpflichtig sind das Öffnen der Akte und der
Zugriff auf klinische Dokumente; der Nachweis ist kein klinisches Dokument.
**Unsicher** ist, ob die Datenschutzprüfung das Lesen des Dokumentationsstands
selbst als protokollpflichtigen Zugriff einstuft.

**Verankerung.** `app.can_read_treatment_evidence()` und die Spaltenliste von
`list_patient_treatment_evidence` in
`supabase/migrations/20260904110000_patient_record_documentation.sql` (beide
tragen die Kennung); `canReadTreatmentEvidence` in
`src/features/session/types.ts`; Datenbanktest „DOK-003: Behandlungsnachweis
in der Akte" in `pnpm test:db` (prüft unter anderem, dass der Rückgabetyp
keine Inhaltsspalte kennt und kein Auditeintrag entsteht); Abnahmeschritt
DOK-003 in `docs/abnahme/etappe-1-kernprozess.md`.

**Änderungspfad.** Spalte hinzufügen oder entfernen (etwa die finalisierende
Person): eine Migration, die die Funktion ersetzt, plus das Schema in
`src/features/documentation/api.ts` — Aufwand `klein`. Eigenes Auditereignis
für den Nachweis: Ereigniskatalog erweitern und einen Insert in der Funktion
ergänzen — Aufwand `klein`. Leistungen im Nachweis: mit C1 entschieden,
umzusetzen bei ABR-002; braucht dann eine eigene Spalte aus der
Leistungserfassung — Aufwand `mittel`. Rollenschnitt: `app.can_read_treatment_evidence()` ersetzen —
Aufwand `klein`.

### ANN-007 — Mechanismus der automatischen Finalisierung: pg_cron

| | |
|---|---|
| Kategorie | Technik |
| Herkunft | DOK-004 (ADR-016 Punkt 7); die Roadmap führte die Wahl als offene Architekturentscheidung |
| Status | **Mechanismus entschieden am 2026-09-05 durch Jannes** (Weg 2, `pg_cron`, alle 15 Minuten, bedingt registriert). Die Providerfrage bleibt offen. |
| Wiedervorlage | Providerprüfung nach ADR-002 vor dem Cloudprojekt — sie muss `pg_cron` bestätigen oder den Auslöser ersetzen |

**Annahme.** Die automatische Finalisierung ist eine Datenbankfunktion
(`finalize_overdue_treatment_notes`), die ein Scheduler in der Datenbank
aufruft: die Erweiterung `pg_cron`, alle 15 Minuten, registriert durch die
Migration — aber nur, wenn die Erweiterung auf dem Server verfügbar ist. Die
Funktion ist für keine Anwendungsrolle ausführbar, idempotent und überspringt
Einträge, die gerade bearbeitet werden. Es gibt keinen Fallback „beim
nächsten Zugriff nachziehen" und keine Berechnung zur Laufzeit.

**Begründung.** Von den drei in der Roadmap beschriebenen Wegen
materialisiert nur ein Scheduler den finalisierten Stand zu einem Zeitpunkt,
der nicht vom Zufall eines Aktenaufrufs abhängt — bei einer Frist mit
Wirkung nach §630f BGB die entscheidende Eigenschaft. `pg_cron` ist Teil des
Supabase-Postgres-Images (lokal wie in der Cloud), braucht keinen weiteren
Dienst, keine Zugangsdaten außerhalb der Datenbank und keine Netzverbindung;
damit bleibt es innerhalb des mit ADR-015 gewählten Stacks und führt keinen
neuen Anbieter ein (§3.5). Es ist dennoch eine neue Infrastrukturabhängigkeit
im Sinne von §11 und wird deshalb hier registriert statt beiläufig eingebaut.
Die Wegwerf-Datenbank der Tests hat kein `pg_cron`; die Funktion wird dort
direkt geprüft, die Registrierung selbst nur dort, wo die Erweiterung
existiert. **Unsicher:** ob die Providerprüfung nach ADR-002 `pg_cron`
im Cloudprojekt freigibt und ob 15 Minuten als Verzögerung nach
Fristende akzeptabel sind.

**Entscheidung vom 2026-09-05.** Jannes hat den Mechanismus nach Vorlage der
drei Wege ausdrücklich gewählt: Weg 2, `pg_cron`. Die Wahl selbst ist damit
keine Annahme mehr, sondern eine getroffene Architekturentscheidung
(`docs/development/ROADMAP.md`, Abschnitt DOK-004); der Eintrag bleibt
bestehen, weil die **Verankerung und der Änderungspfad** weiter gebraucht
werden und die Providerfrage nach ADR-002 offen ist. Ausdrücklich mit
entschieden: der Auslöser bleibt von der Fachlogik getrennt, und die
Registrierung bleibt bedingt.

**Verankerung.** Der `do`-Block am Ende von
`supabase/migrations/20260904120000_treatment_note_auto_finalisation.sql` ist
die einzige Stelle, die den Auslöser kennt (trägt die Kennung); die Funktion
`finalize_overdue_treatment_notes` ebendort; Datenbanktest „DOK-004:
Scheduler-Registrierung" in `pnpm test:db`.

**Änderungspfad.** Anderer Auslöser (externer Cron-Dienst, Edge Function,
Betriebsskript): den `do`-Block durch die neue Registrierung ersetzen und
dieselbe Funktion aufrufen — Aufwand `klein`. Anderes Intervall: eine
Migration mit erneutem `cron.schedule` unter demselben Namen — Aufwand
`klein`. Gänzlich anderer Mechanismus (Berechnung beim Lesen): Umbau der
Lesepfade und der Versionierung — Aufwand `groß`, deshalb nicht gewählt.

### ANN-008 — Fristbezug der automatischen Finalisierung

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | DOK-004 (ADR-016 Punkt 7) |
| Status | offen, seit 2026-09-04 |
| Wiedervorlage | Jannes nach den ersten Wochen Praxisbetrieb (ADR-016 nennt diesen Punkt als den, der am ehesten nachjustiert wird); Datenschutzprüfung für den Zeitpunktbegriff |

**Annahme.** Die Frist ist eine praxisweite Zahl von Kalendertagen
(`documentation_auto_finalize_days`, 0 bis 30, Voreinstellung 1) und endet um
Mitternacht der Praxiszeitzone nach dem N-ten Kalendertag **nach dem
Behandlungstag**. Für einen Eintrag, der erst später angelegt wird — eine
verspätete Erstdokumentation oder ein Nachtrag —, zählt stattdessen der
Anlagetag, wenn er später liegt; die Frist läuft also nie ab, bevor sie für
diesen Eintrag überhaupt begonnen hat. `finalized_at` ist der Zeitpunkt, zu
dem der Lauf den Eintrag festgeschrieben hat; das rechnerische Fristende
steht als `due_at` im Auditkontext. Nur `owner` darf die Frist setzen.

**Begründung.** ADR-016 Punkt 7 legt Voreinstellung und Konfigurierbarkeit
fest, nicht aber den Bezugstag für nachträglich angelegte Einträge. Würde
die Frist ausschließlich ab Behandlung zählen, wäre ein Nachtrag zu einem
drei Wochen alten Termin beim nächsten Lauf festgeschrieben — nach wenigen
Minuten, bevor die Therapeutin ihn zu Ende geschrieben hat. Das wäre genau
der unfertige Eintrag, den ADR-016 als Preis der Automatik nennt, ohne den
Nutzen des zeitnahen Nachweises. Der Anlagetag als späterer Bezug wahrt die
Absicht („zeitnah nach dem Ereignis dokumentieren", §630f Abs. 1 S. 1 BGB:
„in unmittelbarem zeitlichen Zusammenhang") und bleibt die restriktivere
Option gegenüber einer Ausnahme vom Automatismus. Der Zeitpunkt der
Festschreibung statt des Fristendes ist die ehrliche Angabe: Er sagt, wann
der Stand tatsächlich unveränderlich wurde; das Fristende ist aus Termin und
Frist jederzeit rekonstruierbar und steht zusätzlich im Auditkontext. Der
Rollenschnitt folgt §4.1 („Praxiseinstellungen") und dem Muster des
Praxisrasters. **Unsicher:** ob eine Frist je Organisation genügt oder ob
Hausbesuche am Freitag eine eigene Regel brauchen (offene Folgefrage in
ADR-016).

**Verankerung.** `app.documentation_deadline()` und die Spalte
`organizations.documentation_auto_finalize_days` in
`supabase/migrations/20260904120000_treatment_note_auto_finalisation.sql`
(beide tragen die Kennung); `set_documentation_deadline` ebendort;
`FRIST_WERTE` in `src/features/documentation/api.ts`; Datenbanktests „DOK-004:
Automatische Finalisierung nach Frist" und „DOK-004: Frist konfigurieren" in
`pnpm test:db`; Abnahmeschritt DOK-004 in
`docs/abnahme/etappe-1-kernprozess.md`.

**Änderungspfad.** Anderer Bezugstag oder eine Uhrzeit statt Mitternacht:
`app.documentation_deadline()` in einer Migration ersetzen — Aufwand `klein`.
Frist je Person oder je Terminart: eigene Spalte und Auswertung in derselben
Funktion — Aufwand `mittel`. Bereits automatisch finalisierte Einträge bleiben
finalisiert; sie sind über Korrektur und Nachtrag weiter änderbar.

### ANN-009 — Systemakteur im Auditlog

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | DOK-004; ADR-010 lässt das konkrete Schema der Audit-Einträge offen |
| Status | offen, seit 2026-09-04 |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart |

**Annahme.** Auditereignisse ohne handelnden Account tragen
`actor_kind = 'system'` und keinen `actor_user_id`; alle übrigen bleiben
`user` mit Account, und eine Constraint erzwingt genau diese Paarung. Die
Auditansicht zeigt solche Ereignisse als „System", der Benutzerfilter blendet
sie aus. Bei der automatischen Finalisierung wird keine finalisierende
Person eingetragen — weder am Eintrag noch im Audit; Urheberin der
festgeschriebenen Version 1 ist wie bei der Finalisierung von Hand die
zuletzt schreibende Person.

**Begründung.** ADR-010 Punkt 3 verlangt die zur Nachvollziehbarkeit
erforderlichen Metadaten; ein Platzhalter-Account oder die zuletzt
schreibende Person als vermeintlich finalisierende wäre eine falsche
Angabe im Nachweis und liefe ADR-016 Punkt 1 („Urheberschaft je Version
bleibt dauerhaft erhalten") zuwider, weil sie eine Handlung zuschriebe, die
niemand vorgenommen hat. Ein ausdrücklicher Systemakteur ist die
datensparsamere und ehrlichere Darstellung (Art. 5 Abs. 1 lit. d DSGVO,
Richtigkeit). Die Unveränderbarkeit des Logs (ADR-010 Punkt 4) ist nicht
berührt: es gibt weiterhin kein Update und kein Delete über den
Anwendungspfad. **Unsicher:** ob die Prüfung eine Kennzeichnung des
konkreten Auslösers (Jobname, Intervall) im Auditkontext verlangt; heute
steht dort `surface = scheduler` und das Fristende.

**Verankerung.** Spalte `audit_log.actor_kind` und Constraint
`audit_log_actor_consistent` in
`supabase/migrations/20260904120000_treatment_note_auto_finalisation.sql`
(tragen die Kennung); `list_audit_events` ebendort; Anzeige in
`src/features/audit/AuditLogPage.tsx`; Datenbanktest „DOK-004: Systemakteur
im Auditlog" in `pnpm test:db`.

**Änderungspfad.** Zusätzliche Kennzeichnung des Auslösers: Kontext des
Inserts in `finalize_overdue_treatment_notes` erweitern — Aufwand `klein`.
Eigener Pseudo-Account statt Systemakteur: Spalte zurückbauen und Konto im
Seed anlegen — Aufwand `mittel`, ausdrücklich nicht empfohlen.

---

### ANN-010 — Sichtbarkeit und Frist der internen Versorgungsangaben

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | PAT-005 (VER-EPIC-001); `IDEA-PRX-001`; `PROJECT_PRINCIPLES.md` §4.3, §4.6 und ADR-008 lassen die Einordnung solcher Felder offen |
| Status | **entschieden (Jannes) 2026-09-08** für den Praxisnutzen; Kategorie `Datenschutz`, deshalb **weiter im Prüfpaket** — die Sichtbarkeit gegenüber `office` und die Frist bestätigt erst die Datenschutzprüfung |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart; Jannes für den Praxisnutzen |

**Annahme.** Zugangshinweis Hausbesuch, Besonderheit, Bemerkung und die feste
Therapeut:in sind **organisatorische Angaben der Praxis**, keine
Gesundheitsdaten und keine klinische Dokumentation. Sie liegen in einer
eigenen Tabelle `patient_care_details` und sind **für alle vier Praxisrollen
einschließlich `office` sichtbar**, ausdrücklich **nicht für das
Patientenkonto** und nicht für `anon`. Ihre **Datenklasse ist die der
Patientenakte**: zehn Jahre nach Abschluss der Behandlung (ADR-008). Sie
dürfen niemals in Logs erscheinen (ADR-011). Die zusätzliche Erreichbarkeit
(Mobil, geschäftlich, Telefax, Einrichtung) bleibt dagegen bei den
Kontaktdaten der Person und ist für das Patientenkonto sichtbar.

**Begründung.** Die Trennung folgt §4.3: `office` organisiert Termine und
ruft an — der Zugangshinweis ist genau dafür da, und ihn dem Office
vorzuenthalten würde die Rolle arbeitsunfähig machen. Zugleich verlangt §4.3,
klinischen Freitext fernzuhalten; deshalb steht am Formular ein Hinweis, dass
Befund und Verlauf in die Behandlungsdokumentation gehören, und die Felder
liegen nicht in `patients`, wo ein Test klinische Spaltennamen ausschließt.
Der Ausschluss des Patientenkontos folgt §4.6 und der Datensparsamkeit aus
§16: es sind Arbeitsnotizen der Praxis („Schlüssel bei der Nachbarin"), deren
Spiegelung in ein späteres Portal eine eigene fachliche Entscheidung wäre.
Das Auskunftsrecht nach Art. 15 DSGVO bleibt unberührt und läuft über OPS-006
(G9), nicht über eine Live-Ansicht. Die Frist folgt der Patientenakte, weil
die Angaben am Behandlungsverhältnis hängen und ADR-008 eine neue Datenklasse
ohne Fristzuordnung als Mangel führt; die kürzere Alternative („organisatorische
Patientenkommunikation", 3 Jahre) wäre nur mit eigener Löschregel haltbar und
würde die Angaben aus einem noch laufenden Behandlungsfall entfernen.
**Unsicher:** ob die Prüfung „Besonderheit" für ein Feld hält, in das in der
Praxis regelmäßig Gesundheitsdaten geraten (etwa „schwerhörig"), und deshalb
eine engere Rollenmenge oder eine eigene Kennzeichnung verlangt.

**Verankerung.** Tabelle `public.patient_care_details`, Policy
`patient_care_details_select_directory_only` und die Sicht
`patient_directory` in
`supabase/migrations/20260907100000_patient_master_data.sql` (tragen die
Kennung); Abschnitt „Versorgung" mit Hinweistext in
`src/features/patients/PatientMasterDataFields.tsx`; Anzeige in
`src/features/patients/PatientDetailPage.tsx`; Datenbanktests
„PAT-005: erweiterte Stammdaten und interne Versorgungsangaben" in
`pnpm test:db`.

**Änderungspfad.** Engere Rollenmenge (etwa ohne `office`): die eine Policy
ersetzen — Aufwand `klein`. Sichtbarkeit für das Patientenkonto: Policy um
den Zweig „eigene Person" erweitern — Aufwand `klein`. Kürzere Frist: eigene
Datenklasse und Löschregel in LOE-001 — Aufwand `mittel`. Verlegung einzelner
Felder in die klinische Dokumentation: Migration mit Datenumzug und neuem
Lesepfad — Aufwand `groß`.

---

### ANN-011 — Datenklasse und Rollenschnitt der Verordnung

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | VER-001 bis VER-003; `PROJECT_PRINCIPLES.md` §4.3 nennt „klinischen Freitext", ohne die Verordnung einzuordnen; C1 in `OPEN_DECISIONS.md` ist offen |
| Status | offen, seit 2026-09-07 |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess; die Einordnung der Leistungskürzel entscheidet C1 bei ABR-002 |

**Annahme.** Eine Verordnung ist ein **Mischdatensatz** und wird deshalb in
zwei Projektionen ausgeliefert:

- **organisatorisch** für alle vier Praxisrollen einschließlich `office`:
  Verordner:in, Art (Erst/Folge), Ausstellungsdatum, Frequenz, organisatorische
  Bemerkung sowie die Positionen mit **Bezeichnung des Heilmittels** und
  verordneter, genutzter und verbleibender Menge;
- **klinisch** nur für `owner`, `therapist`, `team_lead`: Diagnose
  beziehungsweise Leitsymptomatik, Therapieziel, Hinweise der Verordner:in und
  die Empfehlung zum Verordnungsende.

**Anlegen, Ändern und Löschen dürfen nur die therapeutischen Rollen**, nicht
`office`. Die **Datenklasse ist die klinische Patientenakte**: zehn Jahre nach
Abschluss der Behandlung (ADR-008).

**Begründung.** Die Verordnung trägt mit der Diagnose ein Gesundheitsdatum nach
Art. 9 DSGVO; §4.3 hält `office` von klinischem Freitext fern. Zugleich ist die
Verordnung die Grundlage von Terminserie und Rechnung — ohne Kontingent und
Verordner:in kann `office` weder planen noch eine Folgeverordnung anfordern.
Die Bezeichnung des Heilmittels wird als organisatorisch geführt, weil sie
dieselbe Information trägt, die später als Leistungsposition ohnehin auf der
Rechnung steht, die `office` nach §4.3 sieht; das ist die schwächste Stelle
dieser Annahme und hängt an C1. Das Schreibrecht ohne `office` folgt §16
(im Zweifel restriktiver): Wer eine Verordnung erfasst, tippt die Diagnose mit
ab und sähe sie damit zwangsläufig — ein Schreibrecht wäre ein Leserecht durch
die Hintertür. Die zehnjährige Frist folgt §630f BGB und ADR-008 Punkt 4: die
Verordnung ist Teil der Behandlungsunterlagen. Umgesetzt ist die Trennung als
**zwei Funktionen mit zwei Rückgabetypen**, nicht als eine Funktion mit
genullten Spalten — wie bei DOK-003 (ADR-004). **Unsicher:** ob die Prüfung die
Heilmittelbezeichnung für `office` zulässt; ob das Schreibrecht ohne `office`
im Alltag trägt, sobald eine zweite Person im Büro sitzt.

**Verankerung.** `app.can_read_prescriptions()`,
`app.can_read_prescription_clinical()` und `app.can_write_prescriptions()` in
`supabase/migrations/20260907110000_prescriptions.sql` (tragen die Kennung);
`list_patient_prescriptions` und `list_patient_prescriptions_clinical` in
`supabase/migrations/20260907120000_prescription_read_paths.sql`; die
Schreibfunktionen in
`supabase/migrations/20260907130000_prescription_write.sql`; Rollenweiche in
`src/features/prescriptions/PatientPrescriptions.tsx`; Datenbanktests
„VER-002" und „VER-003" in `pnpm test:db`.

**Änderungspfad.** Anderer Rollenschnitt beim Lesen oder Schreiben: die
betroffene `app.can_*`-Funktion ersetzen — Aufwand `klein`. Heilmittel als
klinisch einstufen: Spaltenliste der organisatorischen Funktion und die
Oberfläche anpassen — Aufwand `mittel`, mit fachlicher Folge, weil `office`
dann nicht mehr planen kann. Andere Frist: eigene Datenklasse und Löschregel in
LOE-001 — Aufwand `mittel`.

---

### ANN-012 — Genutzte Menge wird bis CAL-007 und ABR-002 von Hand gepflegt

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | VER-001; die Roadmap verortet den automatischen Verbrauch bei CAL-007 und ABR-002 (`IDEA-PRX-009`) |
| Status | **entschieden (Jannes) 2026-09-08** — bleibt gültig, bis CAL-007 und ABR-002 die Menge automatisch fortschreiben |
| Wiedervorlage | Jannes; verbindlich entschieden mit CAL-007 und ABR-002 |

**Annahme.** Jede Verordnungsposition führt eine **genutzte Menge**, die die
Praxis im Verordnungsformular selbst pflegt. Die verbleibende Menge wird daraus
gerechnet und nirgends gespeichert. Eine Constraint verhindert, dass die
genutzte Menge die verordnete übersteigt.

**Begründung.** Das Restkontingent ist die einzige Zahl, wegen der man eine
Verordnung im Alltag überhaupt aufschlägt; ohne sie wäre die Story ohne
Nutzen. Die automatische Verrechnung setzt die Verknüpfung von Termin und
Verordnung (CAL-007) und die Leistungserfassung (ABR-002) voraus — beides
später in der Roadmap. Ein leeres, von nichts gepflegtes Feld wäre ein
Zukunftsfeature auf Vorrat (ADR-014); ein von Hand gepflegtes ist heute
brauchbar und wird später zum Startwert der Automatik. Die verbleibende Menge
wird **nicht** gespeichert, weil ein zweiter Zähler auseinanderlaufen kann
(§13). **Unsicher:** ob die Praxis die Zahl im Alltag tatsächlich nachführt —
das zeigt erst die Probewoche 1.

**Verankerung.** Spalte `prescription_items.used_quantity` und Constraint
`prescription_items_used_within_prescribed` in
`supabase/migrations/20260907110000_prescriptions.sql` (tragen die Kennung);
Eingabefeld in `src/features/prescriptions/PrescriptionFormFields.tsx`;
Berechnung des Rests in `src/features/prescriptions/api.ts`.

**Änderungspfad.** Automatischer Verbrauch: CAL-007 und ABR-002 schreiben das
Feld fort, das Eingabefeld entfällt oder wird zur Korrekturmöglichkeit —
Aufwand `mittel`, ohne Datenumzug, weil die Spalte bleibt.

---

### ANN-013 — Datenklasse und Frist der Verordnerkartei

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | VER-001; ADR-008 kennt keine Datenklasse für personenbezogene Daten Dritter ohne Patientenbezug |
| Status | offen, seit 2026-09-07 |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess (Verzeichnis der Verarbeitungstätigkeiten) |

**Annahme.** `prescribers` enthält **berufliche Kontaktdaten Dritter** —
Ärzt:innen und ihre Praxen — und ist **kein Gesundheitsdatum und kein
Patientendatum**: erst die Verordnung stellt den Bezug zu einer Patientin her.
Datenklasse: Stammdaten. Aufbewahrt, **solange eine Verordnung darauf
verweist**; das ist über `on delete restrict` strukturell erzwungen. Sichtbar
für alle vier Praxisrollen, nicht für Patientenkonten. Erfasst wird nur, was
zur Identifikation und zur Anforderung einer Folgeverordnung nötig ist — keine
Arztnummer, keine Betriebsstättennummer.

**Begründung.** Rechtsgrundlage ist Art. 6 Abs. 1 lit. b/f DSGVO
(Vertragsdurchführung und berechtigtes Interesse an der Zusammenarbeit mit der
verordnenden Stelle), nicht Art. 9 — die Kartei allein sagt nichts über eine
Gesundheit aus. Die Kopplung der Frist an die Verordnung folgt ADR-008 Punkt 2
(gesetzliche Aufbewahrung vor Löschung): Eine Verordnung ohne auflösbaren
Verordner wäre als Behandlungsunterlage unvollständig. Der Verzicht auf LANR
und BSNR folgt der Datenminimierung (§3, Art. 5 Abs. 1 lit. c DSGVO) — es sind
GKV-Merkmale, und die Praxis rechnet privat ab (ADR-009). **Unsicher:** ob die
Prüfung eine eigene Zeile im Verzeichnis der Verarbeitungstätigkeiten und eine
Information nach Art. 14 DSGVO gegenüber den erfassten Ärzt:innen verlangt.

**Verankerung.** Tabelle `public.prescribers` mit Tabellenkommentar und Policy
`prescribers_select_staff_only` in
`supabase/migrations/20260907110000_prescriptions.sql` (tragen die Kennung);
Formularfelder in `src/features/prescriptions/PrescriberFormFields.tsx`;
Datenbanktest „VER-001: Verordner:innen" in `pnpm test:db`.

**Änderungspfad.** Eigene Löschregel oder kürzere Frist: Regel in LOE-001
ergänzen — Aufwand `klein`, solange keine Verordnung verweist. Information nach
Art. 14 DSGVO: Textbaustein in G8/G14 — Aufwand `klein`, außerhalb des Codes.

---

### ANN-014 — „Empfehlung zum Verordnungsende" ist eine erfasste Angabe, keine Systemempfehlung

| | |
|---|---|
| Kategorie | Recht |
| Herkunft | VER-001; ADR-006 Punkt 4 verbietet eigene Therapieempfehlungen der Anwendung |
| Status | offen, seit 2026-09-07 |
| Wiedervorlage | Datenschutzprüfung; B1 (externe MDR-Abgrenzung, ADR-006 Punkt 7) |

**Annahme.** Das Feld „Empfehlung zum Verordnungsende" nimmt **die Empfehlung
der Therapeut:in** auf, die sie selbst formuliert und selbst verantwortet. Die
Anwendung **erzeugt, ergänzt und bewertet sie nicht**. Was die Anwendung
daneben zeigt, ist ausschließlich eine **Rechnung**: „noch 3 von 10". Wenn
keine Behandlung mehr offen ist, steht dort der neutrale Sachsatz „Kontingent
ausgeschöpft" — **keine** Handlungsempfehlung, keine Prognose, keine Ampel und
keine Erinnerung.

**Begründung.** ADR-006 Punkt 2 erlaubt ausdrücklich das Erfassen, Speichern,
Strukturieren und Darstellen von Gesundheitsinformationen; Punkt 4 verbietet
eigene Therapieempfehlungen. Eine von einem Menschen geschriebene Empfehlung zu
speichern und wieder anzuzeigen ist Punkt 2 und nicht Punkt 4 — dieselbe
Unterscheidung, die ADR-006 in seinen Konsequenzen für §7.1 trifft („Anzeigen"
gegenüber „Bewerten"). Die Differenz „verordnet minus genutzt" ist eine
transparente, veröffentlichte Rechenvorschrift ohne klinische Aussage. Die
Roadmap führt die Prognose eines Wettbewerbers ausdrücklich nicht,
`IDEA-LZK-007` (automatische Erinnerung mit Empfehlung zum weiteren Vorgehen)
ist durch B9 blockiert, und `OPEN_DECISIONS.md` nennt ausdrücklich „die
Empfehlung der Therapeutin zum Verordnungsende" als **nicht** blockiert.
Regulatorisch relevant ist auch die Beschriftung (ADR-006 Konsequenzen): das
Feld heißt deshalb in der Oberfläche „Empfehlung der Therapeut:in zum
Verordnungsende" und nicht „Empfehlung". **Unsicher:** ob die externe Prüfung
aus B1 den neutralen Sachsatz „Kontingent ausgeschöpft" bereits als Hinweis mit
Handlungsaufforderung liest.

**Verankerung.** Spalte `prescriptions.follow_up_recommendation` mit
Spaltenkommentar in
`supabase/migrations/20260907110000_prescriptions.sql` (trägt die Kennung);
Beschriftung und Hinweistext in
`src/features/prescriptions/PrescriptionFormFields.tsx`; Darstellung des
Restkontingents in `src/features/prescriptions/PatientPrescriptions.tsx`.

**Änderungspfad.** Feld oder Sachsatz anders beschriften: eine Stelle in der
Oberfläche — Aufwand `klein`. Feld ganz entfernen, falls die Prüfung es
beanstandet: Spalte und Formularfeld zurückbauen — Aufwand `klein`, ohne
Datenumzug bei leerer Datenbank. Eine automatische Erinnerung oder Bewertung
wäre **keine** Änderung dieser Annahme, sondern `MDR_REVIEW_REQUIRED` nach
ADR-006 Punkt 6 und ein eigenes Epic nach B9 und B10.

---

### ANN-015 — Umfang und Wortlaut der Verbindungsanzeige

| | |
|---|---|
| Kategorie | Technik |
| Herkunft | UI-000; die Roadmap führt die Verbindungsanzeige in UI-000 und UX-EPIC-001 ausdrücklich als `ANN` |
| Status | **entschieden (Jannes) 2026-09-08**; der Textverlust-Schutz ist mit UX-009 (2026-09-10) dazugekommen |
| Wiedervorlage | Jannes nach dem ersten Feldtag |

**Annahme.** Die Verbindungsanzeige stützt sich **allein auf
`navigator.onLine`** und die Ereignisse `online`/`offline` des Browsers. Es
gibt **keinen Ping gegen den Server und keinen Abfragetakt**. Sie erscheint
**nur im Fall „getrennt"** — ein dauerhaftes „verbunden" gibt es nicht. Der
Text nennt die Folge für die Arbeit („Änderungen lassen sich gerade nicht
speichern"), nicht den technischen Zustand, und bittet darum, den Text im Feld
stehen zu lassen.

**Begründung.** Der Anlass ist der Hausbesuch: im Treppenhaus reißt die
Verbindung ab, und ohne Hinweis merkt man das erst, wenn ein Speichern
fehlschlägt — im schlimmsten Fall mit einem Dokumentationstext im Feld. Ein
regelmäßiger Ping wäre die genauere, aber teurere Antwort: eine wiederkehrende
Verbindung ohne fachlichen Grund, zusätzliche Daten ohne Zweck (§18) und ein
Signal, aus dem sich ableiten ließe, wann ein Gerät benutzt wird (§20). Der
Preis der günstigeren Wahl ist bekannt und wird hier festgehalten: **ein Gerät
hinter einem Anmeldeportal oder mit erreichbarem Netz, aber unerreichbarem
Server, gilt als verbunden.** Deshalb behauptet der Text nicht, der Server sei
erreichbar. Ein dauerhaftes „verbunden" wäre Rauschen: es stünde fast immer da
und würde gerade dann übersehen, wenn es umschlägt. Die Anzeige ist
ausdrücklich **keine Offline-Fähigkeit** — kein Zwischenspeicher, keine
Synchronisation, kein Service Worker (ADR-015 Punkt 16); der begrenzte
Offline-Modus aus ADR-001 bleibt ein eigenes Vorhaben. **Unsicher:** ob der
Hinweis im Feldtag früh genug kommt, um einen Textverlust wirklich zu
verhindern — verlässlich wird das erst mit dem Textverlust-Schutz aus
UX-EPIC-001.

**Verankerung.** `src/app/verbindung.ts` (`useIstVerbunden`, trägt die
Kennung) — seit UX-009 eine eigene Datei, weil zwei Stellen den Zustand
brauchen; `src/app/Verbindungsanzeige.tsx`, eingehängt in
`src/app/AppShell.tsx`; seit UX-009 zusätzlich
`src/features/documentation/Textverlustschutz.tsx`, der den Hinweis dort
zeigt, wo gerade getippt wird. Tests in `src/app/Verbindungsanzeige.test.tsx`
und `src/features/documentation/Textverlustschutz.test.tsx`.

**Ergänzung durch UX-009 (2026-09-10).** Der Textverlust-Schutz, der hier als
offener Punkt vermerkt war, besteht aus **zwei** Dingen und ausdrücklich nur
diesen: einer Browserwarnung vor dem Verlassen der Seite, solange
ungespeicherter Text im Feld steht, und dem Hinweis neben den Schaltflächen,
wenn das Gerät getrennt ist. **Kein lokaler Zwischenspeicher** — ein Entwurf,
der nur im Browser läge, wäre nicht gespeichert, würde aber so aussehen (ADR-001,
ADR-015 Punkt 16). Die Unsicherheit aus dem Absatz oben bleibt damit teilweise
bestehen: Die Warnung greift bei Neuladen, Schließen und Zurück, nicht bei
einem Absturz oder einem leeren Akku.

**Änderungspfad.** Zusätzliche Prüfung gegen den Server: eine Abfrage in
`useIstVerbunden` ergänzen — Aufwand `klein`, aber **datenschutzrelevant**,
deshalb nicht ohne Entscheidung. Anderer Wortlaut oder eine dauerhafte Anzeige:
eine Stelle — Aufwand `klein`. Echte Offline-Fähigkeit: eigenes Epic nach
ADR-001, ersetzt ADR-015 Punkt 16 — Aufwand `groß`.

### ANN-016 — Koordinate als abgeleitetes Stammdatum der Adresse

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | MAP-001 (ADR-019 Fassung 2, Punkt 14) |
| Status | **offen**, getroffen 2026-09-08 |
| Wiedervorlage | Datenschutzprüfung / DSFA-Wiedervorlage Kartendienst; MAP-006 verankert sie in der Migration |

**Annahme.** Zu jeder Hausbesuchsadresse wird die geocodierte Koordinate
(`lat`, `lon`, Genauigkeitsstufe) **gespeichert**, und zwar bei der Adresse
selbst. Geocoding läuft **nur beim Anlegen oder Ändern der Adresse**, nie beim
Öffnen einer Karte oder beim Berechnen einer Route. Die Koordinate ist ein
abgeleitetes Stammdatum: sie teilt Datenklasse und Frist der Adresse, wird mit
ihr überschrieben und mit ihr gelöscht. Gespeichert werden nur Koordinate und
Genauigkeitsstufe — **keine Rohantwort des Anbieters**, kein Anzeigetext des
Treffers. Liegt der Treffer unterhalb der Hausnummerngenauigkeit, bestätigt
die erfassende Person ihn ausdrücklich, sonst bleibt die Adresse ohne
Koordinate. Wie die Koordinate zum Termin gelangt (Kopie mit dem
Adress-Snapshot nach ANN-003 oder Verweis), entscheidet MAP-006; Vorzug hat
die Kopie, damit die Regel aus ANN-003 unverändert gilt.

**Begründung.** Datenminimierung gegenüber dem Anbieter (Art. 5 Abs. 1 lit. c
DSGVO): Die Adresse geht **genau einmal** je Änderung zum Kartendienst; jede
spätere Karte, Route oder Matrix arbeitet mit Koordinaten (ADR-019 Punkt 13).
Ohne gespeicherte Koordinate müsste jede Routenberechnung alle Adressen des
Tages erneut übermitteln — mehr Übermittlungen, mehr Adresstext beim Anbieter.
Die Koordinate ist so personenbezogen wie die Adresse, deshalb dieselbe Klasse
und Frist (ADR-008). **Unsicher:** ob die Prüfung die Speicherung einer
Koordinate als zusätzliches Datum anders bewertet als die Adresse; ob bei
abgesagten Hausbesuchen (ANN-003) die Koordinate im Termin mitgelöscht werden
soll.

**Verankerung.** Bis MAP-006: `src/lib/location/contract.ts`, Abschnitt
„Geocoding" (trägt die Kennung), und ADR-019 Punkt 14. Ab MAP-006: die
Migration, die die Koordinatenspalten anlegt, und der einzige Schreiber
(Geocoding beim Adress-Upsert).

**Änderungspfad.** Verlangt die Prüfung Geocoding je Aufruf statt Speicherung:
Spalten entfallen, der Adapter geocodiert vor jeder Route — Aufwand `mittel`,
mit mehr Übermittlungen als bewusster Folge. Andere Frist oder eigene
Datenklasse für die Koordinate: Retention Schedule ergänzen, Löschregel je
Spalte — Aufwand `klein`. Koordinate im Termin-Snapshot statt nur bei der
Adresse oder umgekehrt: eine Migration — Aufwand `klein`.

### ANN-017 — Serverseitiger Kartendienst-Adapter als Supabase Edge Function

| | |
|---|---|
| Kategorie | Technik (datenschutzrelevant) |
| Herkunft | MAP-001 (ADR-019 Fassung 2, Punkt 15) |
| Status | **offen**, getroffen 2026-09-08 |
| Wiedervorlage | OPS-001 Providerprüfung (Edge Runtime nach ADR-015 Punkt 20); MAP-003 baut den Adapter |

**Annahme.** Geocoding, Routing und Matrix laufen in **einer Supabase Edge
Function** (`location-provider`), die den Server-Schlüssel des Anbieters als
Supabase-Secret hält und den Vertrag aus `src/lib/location/contract.ts`
erfüllt. Der Browser ruft nur diese Function auf (mit Anmeldung, nie anonym)
und spricht für Geocoding, Routing und Matrix **nie direkt** mit dem
Kartendienst. Einzige Ausnahme sind die Kartenkacheln, die der Browser mit
einem getrennten Kachelschlüssel direkt lädt. Der Vorbehalt aus ADR-015 Punkt
20 bleibt: Für produktive Gesundheitsdaten braucht die Edge Runtime eine eigene
Datenfluss- und Providerprüfung — sie fällt mit dem Provider-Gate aus ADR-019
Punkt 9 zusammen und wird in OPS-001 mitgeprüft.

**Begründung.** Verglichen wurden drei Wege. **Direkt aus dem Browser:** der
Schlüssel stünde im Bundle, IP-Adresse und User-Agent der Therapeutin landeten
beim Anbieter, und es gäbe keine zentrale Stelle für Redaction und
Fehlerbehandlung (ADR-011). **Aus der Datenbank** (`pg_net`/HTTP-Erweiterung):
HTTP-Aufrufe aus Postgres mit schlechter Timeout-Kontrolle und dem Secret in
der Datenbank; Erweiterung beim Provider nicht sicher verfügbar (R9). **Eigener
kleiner Dienst:** eine zusätzliche Laufzeitkomponente mit eigener
Wiederherstellungslast bei Bus-Faktor 1 (ADR-012). Die Edge Function ist die
Komponente des bestehenden Stacks (ADR-015 Punkt 6), hat genau eine Stelle für
Schlüssel, Redaction und Timeout und lässt sich mit gemocktem `fetch` testen.
**Unsicher:** die Edge Runtime ist global verteilt — wo ein Aufruf tatsächlich
ausgeführt wird und ob sich das auf EU-Regionen festlegen lässt, ist Teil der
Providerprüfung. **Einschränkung der Umgebung:** In der Cloud-Entwicklungs-
umgebung läuft `supabase start` nicht; die Function ist dort nur mit
Komponententests (gemocktes `fetch`) prüfbar, gegen den echten Anbieter nur
lokal bei Jannes und in `e2e-supabase`.

**Verankerung.** `src/lib/location/contract.ts`, Abschnitt „Serverseitiger
Anbieteradapter" (trägt die Kennung); ab MAP-003 `supabase/functions/
location-provider/`.

**Änderungspfad.** Andere Laufzeit (eigener Dienst, Datenbankfunktion): Der
Adapter ist ein Modul hinter dem Vertrag; die Oberfläche und die Fachlogik
ändern sich nicht — Aufwand `mittel`. Ergibt OPS-001, dass die Edge Runtime
für Gesundheitsdaten ausscheidet, greift derselbe Pfad **vor** MAP-006.

### ANN-018 — Übergabeziel und URL-Format des Navigations-Handoffs

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | MAP-001 (ADR-019 Fassung 2, Punkt 20 bis 23); ADR-019 Fassung 1 hatte diese `ANN` für UX-EPIC-001 angekündigt |
| Status | **entschieden (Jannes) 2026-09-11** — Feldliste und Fahrradmodus bestätigt; Kategorie `Datenschutz`, deshalb **weiter im Prüfpaket**: dass die Übergabe an Google in dieser Form zulässig ist, bestätigt erst die Datenschutzprüfung (B2). Getroffen 2026-09-08, mit UX-002 für Google Maps umgesetzt |
| Wiedervorlage | Datenschutzprüfung (B2, Handoff und §203/Art. 9); MAP-005 bewertet die Ziel-Apps und setzt Apple Maps und `geo:` um |

**Annahme.** Der Handoff übergibt an die Navigations-App **nur das Ziel und
den Fahrradmodus**: die Koordinate, sobald sie zur Adresse vorliegt (ANN-016,
ab MAP-006); bis dahin die Postanschrift ohne Namen (Straße, Hausnummer,
Postleitzahl, Ort). **Nie** Name, Uhrzeit, Termin- oder Patientenkennung,
Notiz oder Diagnose. Formate: Google Maps
`https://www.google.com/maps/dir/?api=1&destination=<Ziel>&travelmode=bicycling`
(Tageslink: `waypoints=` mit `|` getrennt, höchstens neun Zwischenziele, drei
in mobilen Browsern — in MAP-005 gegen die Dokumentation zu prüfen); Apple
Maps `https://maps.apple.com/directions?destination=<lat,lon>&mode=cycling`;
Systemnavigation `geo:<lat>,<lon>`. Die URL entsteht in **einer** Funktion,
erst beim Tippen, wird nie gespeichert und nie automatisch geöffnet.

**Begründung.** Die Koordinate ist für den Betreiber der Navigations-App so
identifizierend wie die Adresse (Rückwärts-Geocoding), aber sie enthält keinen
Freitext und keinen Anhaltspunkt außer dem Punkt; die Anwendung zeigt der
Therapeutin Adresse und Klingelhinweis lokal. Der Gewinn ist klein, aber er
kostet nichts. Bis Koordinaten vorliegen, ist die Adresse ohne Namen die
datensparsamste Form, die eine Navigation überhaupt erlaubt. Die Feldliste
folgt Art. 5 Abs. 1 lit. c DSGVO und der Regel aus ADR-019 Punkt 12.
**Unsicher:** ob ein Pin ohne Hausnummer in Google Maps die Therapeutin auf
dem Rad verwirrt (Hausnummer nicht sichtbar) — MAP-005 prüft das auf echten
Geräten; ob die Übergabe der Adresse an einen eigenen Verantwortlichen
Art. 9 oder §203 berührt — Rechtsfrage an B2 (ADR-019 Punkt 23).

**Verankerung.** `src/lib/location/contract.ts`, Typ `NavigationTarget`
(trägt die Kennung); seit UX-002 `src/lib/location/navigation.ts` — die eine
Stelle, an der Feldliste, Ländercode, URL-Format und Wegpunktlimit stehen
(trägt die Kennung ebenfalls), mit Tests in `navigation.test.ts`, darunter
einer, der prüft, dass die URL **außer** Ziel und Fahrmodus nichts trägt. Die
Prüfregel „nur auf Aktion" ist in `src/features/appointments/NavigationStarten.tsx`
umgesetzt — eine Schaltfläche, kein `href`; ein Test prüft, dass vor dem
Tippen keine URL im Seitenquelltext steht.

**Stand der Umsetzung (UX-002, 2026-09-10).** Gebaut ist **nur Google Maps**,
wie es die Roadmap-Zeile von UX-EPIC-001 vorgibt. Apple Maps und die
Systemnavigation (`geo:`) stehen in dieser Annahme und in ADR-019 Punkt 22 als
Festlegung, sind aber nicht implementiert: sie gehören zu **MAP-005**, das die
Ziel-Apps auf echten Geräten bewertet. Sie auf Vorrat zu bauen wäre ein
Zukunftsfeature (§11, ADR-014). Ebenfalls noch offen und dort zu prüfen: das
Wegpunktlimit (hier neun laut Anbieterdokumentation; ein längerer Tag wird in
Abschnitte geteilt, nicht abgeschnitten) und die Frage, ob ein Pin ohne
sichtbare Hausnummer auf dem Rad taugt.

**Änderungspfad.** Adresse statt Koordinate oder umgekehrt, anderes Limit,
andere Ziel-App: eine Funktion — Aufwand `klein`. Verlangt B2 eine
Einwilligung der Patient:innen vor dem Handoff: Einwilligungsstruktur aus
PAT-006, Prüfung vor dem Bauen der URL — Aufwand `mittel`. Verlangt B2, den
Handoff ganz zu unterlassen: die Funktion entfällt, die Tagesliste zeigt die
Adresse zum Abtippen — Aufwand `klein`, mit dem Verlust des einen Taps als
Folge.

### ANN-019 — Verfallsdauer und Bindung des Verordnungsentwurfs (VER-003)

| | |
|---|---|
| Kategorie | Technik |
| Herkunft | Nachprüfung zu PR #15/#16: der erste Fix für den Eingabenverlust beim Anlegen einer Verordner:in speicherte den Entwurf im TanStack-Query-Cache und verlor ihn dort nach der Standard-`gcTime` von fünf Minuten - ein zweiter, echter Fehler in derselben Story. |
| Status | **entschieden 2026-09-08** |
| Wiedervorlage | UX-EPIC-001 (Textverlust-Schutz) — dort wird der unten genannte Restpunkt behoben; außerdem Jannes, falls die 30-Minuten-Grenze in der Praxis zu knapp oder zu großzügig wirkt |

**Annahme.** Der Formularzustand liegt nicht mehr im TanStack-Query-Cache,
sondern in einem eigenen, kleinen In-Memory-Speicher (`src/features/prescriptions/api.ts`,
`entwurfSpeicher`). Ein Entwurf ist an **Vorgang** (Rücksprungpfad, je Patient
und Verordnung eindeutig) **und Benutzer** (Supabase-Auth-`user.id`) gebunden
und verfällt nach **30 Minuten** von selbst, unabhängig davon, ob er
zwischenzeitlich gelesen wurde. Bei Abmeldung werden zusätzlich **sofort alle**
Entwürfe verworfen, nicht erst nach Ablauf der Frist.

**Begründung.** Die eigentliche Anforderung - ein Entwurf muss die Anlage
einer fehlenden Verordner:in überleben, auch wenn die Person dafür Adresse und
Kontaktdaten nachschlägt - ist mit der Standard-`gcTime` (fünf Minuten) eines
inaktiven, unbeobachteten Query-Cache-Eintrags nicht verlässlich erfüllbar:
`setQueryData` ohne einen laufenden `useQuery` an derselben Stelle hat ab dem
Moment des Ablegens keinen Beobachter und gilt sofort als inaktiv. Die
`gcTime` für genau diesen einen Schlüssel dauerhaft zu erhöhen, wäre technisch
möglich gewesen (`setQueryDefaults`), hätte aber weiterhin denselben
Cache-Mechanismus für einen Zweck zweckentfremdet, für den er nicht gebaut ist
- mit dem nächsten daran hängenden Detail (Rehydrierung, Persister-Plugins,
`refetchOnMount`) als nächstem Überraschungskandidaten. Ein eigener, expliziter
Speicher mit genau den drei gebrauchten Operationen (ablegen, ansehen,
entfernen) ist einfacher zu verstehen und zu prüfen als ein Cache-Sonderfall.
30 Minuten sind eine Schätzung, keine Messung: großzügig genug für eine
Verordner-Anlage mit Adress- und Kontaktrecherche, eng genug, dass ein
tatsächlich abgebrochener Versuch nicht Tage später bei einem unabhängigen
neuen Versuch auf demselben Pfad unbemerkt wieder auftaucht. Die
Benutzerbindung verhindert zusätzlich, dass ein Kontowechsel im selben
Browser-Tab (ohne Neuladen der Seite) den Entwurf einer anderen Person
übernimmt; das Verwerfen bei Abmeldung ist Verteidigung in der Tiefe dazu, da
die Verordnung klinische Freitexte enthalten kann (Diagnose, Therapieziel;
§18, ADR-011). Der Speicher bleibt wie zuvor ausschließlich im
Arbeitsspeicher der laufenden Seite - kein `localStorage`, kein
`sessionStorage`, kein Weg über die URL - und betrifft keine andere Abfrage im
Query-Cache.

**Verankerung.** `src/features/prescriptions/api.ts` (`entwurfSpeicher`,
`ENTWURF_MAX_ALTER_MS`, trägt die Kennung im Kommentar); verwendet in
`PrescriptionFormPage.tsx` und `PrescriberFormPage.tsx`; das Verwerfen bei
Abmeldung in `src/features/auth/SessionProvider.tsx`. Tests in
`src/features/prescriptions/api.test.ts` (Speicherverhalten, u. a. mit
`vi.useFakeTimers()`) und `src/features/prescriptions/PrescriptionFormPage.entwurf.test.tsx`
(echter Seitenwechsel über echte Routen, Zeitfortschritt über fünf Minuten via
`Date.now()`).

**Änderungspfad.** Andere Frist: eine Zahl in `ENTWURF_MAX_ALTER_MS` - Aufwand
`klein`. Mehrere gleichzeitige Entwürfe je Person zulassen oder den Speicher
auf mehrere Tabs ausdehnen: eigener Mechanismus (z. B. `BroadcastChannel`),
grundsätzlich anderer Ansatz - Aufwand `mittel`.

**Restpunkt behoben mit UX-009 (2026-09-10).** Der Restpunkt lautete: Wer die
Verordner:innen-Anlage über die **Hauptnavigation** verließ statt über
„Abbrechen", ließ einen Entwurf liegen, der bei einem unabhängigen neuen
Versuch auf demselben Rücksprungpfad wieder eingesetzt wurde — der Pfad war
für beide Versuche derselbe Schlüssel.

Behoben, aber **anders als angekündigt**. Vorgesehen war, den Entwurf beim
Verlassen des Abstechers zu verwerfen. Ein Aufräumen beim Aushängen der
Komponente ist mit React StrictMode nicht verlässlich: Der Entwicklungsmodus
hängt jede Komponente einmal aus und wieder ein, das Aufräumen liefe also
sofort — und verwürfe den Entwurf, den es schützen soll. Stattdessen ist der
Schlüssel jetzt eine **Vorgangskennung**: Sie entsteht bei jedem Besuch des
Verordnungsformulars neu, reist im Rücksprungpfad mit und wird beim
Wiederaufbau verbraucht. Ein unabhängiger neuer Besuch bringt eine neue
Kennung mit und findet nichts vor — unabhängig davon, wie der vorige Versuch
endete. Die 30-Minuten-Frist bleibt, jetzt aber als Grenze dafür, wie lange
ein aufgegebener Entwurf im Arbeitsspeicher liegt, nicht mehr als einziger
Schutz gegen ein Wiederauftauchen.

Verankert in `src/features/prescriptions/api.ts` (`neueVorgangskennung`,
`vorgangAusPfad`, `entwurfSchluessel`), verwendet in `PrescriptionFormPage.tsx`
und `PrescriberFormPage.tsx`. Zwei Regressionstests in
`PrescriptionFormPage.entwurf.test.tsx` mit echtem Seitenwechsel: der
aufgegebene Versuch taucht nicht wieder auf, und zwei Abstecher werden
auseinandergehalten.

### ANN-020 — Datenklasse und Frist der Textbausteine

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | UX-008 (Textbausteine in der Dokumentation, `IDEA-PRX-011`, E-9) |
| Status | **entschieden (Jannes) 2026-09-11** — Textbaustein ohne Patientenbezug, Löschung durch die Praxis; Kategorie `Datenschutz`, deshalb **weiter im Prüfpaket**: ob der Freitext trotz fehlenden Bezugs der Akte zugeordnet wird, entscheidet die Datenschutzprüfung. Getroffen 2026-09-10 |
| Wiedervorlage | Datenschutzprüfung; LOE-001 nimmt die Klasse in den Retention Schedule auf |

**Annahme.** Ein Textbaustein ist ein **Betriebsdatum der Praxis ohne
Patientenbezug** und kein Gesundheitsdatum. Die Tabelle
`public.treatment_text_snippets` trägt deshalb bewusst **keine** `patient_id`
und **keine** `appointment_id`. Aufbewahrungsfrist: **bis zur Löschung durch
die Praxis** — es gibt keine gesetzliche Frist, die einen Baustein erfasst,
und keinen Anlass, ihn selbsttätig verfallen zu lassen. Ein **persönlicher**
Baustein endet mit dem Mitarbeiterdatensatz seiner Person (`on delete
cascade`); ein **praxisweiter** überlebt jeden Personalwechsel. Löschen ist
hier ein echtes Löschen und kein Statuswechsel: Ein Baustein ist eine Vorlage;
was mit ihm geschrieben wurde, steht unverändert in der Akte und ist davon
nicht berührt.

**Begründung.** Der Baustein ist Text, den eine therapeutische Person
**vorher** formuliert, ohne einen Fall vor sich zu haben — eine Formulierung,
keine Aussage über einen Menschen. Damit fehlt der Personenbezug nach Art. 4
Nr. 1 DSGVO, und Art. 9 greift nicht. Das Datenmodell hält das nicht nur fest,
sondern erzwingt es: Ohne Spalte für Patient oder Termin lässt sich ein Bezug
nicht herstellen, auch nicht versehentlich, auch nicht später durch eine
Abfrage. **Der Restwert liegt im Freitext selbst:** Jemand kann in einen
Baustein hineinschreiben, was dort nicht hingehört (»Frau M., 2. OG«). Dagegen
hilft kein Schema, sondern die Beschriftung im Formular („keine Angaben aus
einer Akte") und die Länge von 2.000 Zeichen, die einen Baustein als Satz und
nicht als Befund ausweist. In Logs erscheint der Text nie (ADR-011); der
Auditeintrag trägt Titel und Geltungsbereich, nicht den Inhalt.
**Unsicher:** ob die Prüfung den Freitext trotz fehlenden Bezugs der
Patientenakte zuordnet und damit derselben Frist unterwirft (10 Jahre nach
Behandlungsabschluss, ADR-008) — dann wäre die Klasse eine andere, die
Löschung aber weiterhin durch die Praxis ausgelöst.

**Verankerung.** `supabase/migrations/20260910140000_treatment_text_snippets.sql`
— die Tabelle trägt Datenklasse und Frist als `COMMENT` und die Kennung im
Kopfkommentar. Tests in `supabase/tests/text-snippets.test.ts` (Abschnitt
„Datenschutz"): kein `patient_id`/`appointment_id`, Kommentar mit Klasse und
Frist, Löschung mit dem Mitarbeiterdatensatz.

**Änderungspfad.** Andere Frist oder eigene Datenklasse: Eintrag im Retention
Schedule (LOE-001) und eine Löschregel je Tabelle — Aufwand `klein`; die
Tabelle selbst ändert sich nicht. Verlangt die Prüfung, Bausteine wie
Aktendaten zu behandeln: dieselbe Frist, zusätzlich Aufnahme in das
Löschjournal (LOE-002) — Aufwand `klein`. Verlangt sie, dass praxisweite
Bausteine gar nicht persönlich sein dürfen oder umgekehrt: eine Spalte und
zwei Policies — Aufwand `mittel`.

### ANN-021 — Feldliste und Vorhaltedauer des Tagesplans im Arbeitsspeicher

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | UX-011 (Tagesplan-Cache lesend, `IDEA-PRX-014`, E-12); ADR-001 („offene Folgefrage: Feldliste") |
| Status | **entschieden (Jannes) 2026-09-11** — Feldliste und acht Stunden bestätigt; Kategorie `Datenschutz`, deshalb **weiter im Prüfpaket**. Die Zahl bleibt zudem unter Vorbehalt des ersten Feldtags: Sie ist geschätzt, nicht gemessen. Getroffen 2026-09-10 |
| Wiedervorlage | Datenschutzprüfung; Jannes nach dem ersten Feldtag (reicht die Vorhaltedauer, ist sie zu lang?) |

**Annahme.** Die zuletzt erfolgreich geladene Tagesliste bleibt im
**Arbeitsspeicher der laufenden Seite** lesbar, auch wenn eine spätere Abfrage
scheitert. Sie wird dann als älterer Stand gekennzeichnet („Angezeigt wird der
Stand von 07:52 Uhr – er kann veraltet sein").

- **Feldliste:** genau das, was `list_day_plan` liefert und nicht mehr —
  Zeitraum, Terminart, Status, Name der Patient:in, Besuchsadresse,
  Festnetz- und Mobilnummer, Zugangshinweis, organisatorische Besonderheit,
  Dokumentationsstand ohne Inhalt. **Keine klinischen Inhalte**, keine
  Verordnung, keine Akte. Das ist die Antwort auf die offene Folgefrage aus
  ADR-001, „welche Felder zu den minimal notwendigen Hausbesuchsdaten
  gehören": es sind die Felder eines Arbeitstags einer Person, und die
  Feldliste wird nicht hier gepflegt, sondern ist die Rückgabe der
  Serverfunktion.
- **Vorhaltedauer:** acht Stunden ab dem Laden — ein Arbeitstag, nicht mehr.
  Zusätzlich endet sie bei jedem Neuladen, jedem geschlossenen Tab, jeder
  Abmeldung (der Abfragespeicher wird dabei geleert) und mit dem Wechsel des
  Kalendertags, weil der Abfrageschlüssel den Tag enthält.
- **Verschlüsselung:** keine Frage, weil **nichts gespeichert wird** — kein
  `localStorage`, kein `sessionStorage`, kein IndexedDB, kein Service Worker
  (ADR-015 Punkt 16). Damit landet nichts auf dem Gerät, das eine
  Geräteverschlüsselung oder eine Löschfrist bräuchte. Die
  Endgeräteanforderungen aus ADR-001 entstehen erst mit einem echten
  Offline-Modus.

**Begründung.** ADR-001 nennt „den Tagesplan" und „die minimal notwendigen
Hausbesuchsdaten" ausdrücklich als das, was offline verfügbar sein soll — und
lässt den Mechanismus offen. Der billigste Mechanismus, der dem Zweck genügt,
ist der Zwischenspeicher, den die laufende Seite ohnehin hält: Er kostet keine
neue Technik, keine Synchronisation und keine Konfliktauflösung, und er kann
die Situation aus ADR-001 („dokumentiert geglaubt, aber nirgends gespeichert")
gar nicht erzeugen, weil er **nur liest**. Geschrieben wird ausschließlich
online; scheitert ein Schreibvorgang, sagt die Anwendung das (UX-009).
Ein dauerhafter lokaler Bestand wäre die andere Option: mehr Verfügbarkeit,
aber Gesundheitsdaten auf einem mobilen Gerät mit allem, was daran hängt
(Geräteverschlüsselung, Sperrcode, Verlust, BYOD) — das ist ein eigenes
Vorhaben und nach §16 nicht der Weg, den man nebenbei geht.
**Unsicher:** ob acht Stunden für einen langen Tag reichen und ob die Prüfung
den Zugangshinweis im Arbeitsspeicher anders bewertet als auf dem Bildschirm,
wo er ohnehin steht.

**Verankerung.** `TAGESPLAN_VORHALTEDAUER_MS` in
`src/features/today/api.ts` (trägt die Kennung) — die eine Zahl; die Feldliste
ist die Rückgabe von `public.list_day_plan`
(`supabase/migrations/20260910100000_day_plan.sql`). Das Leeren bei der
Abmeldung in `src/app/App.tsx` (`abmelden`). Tests in
`src/features/today/MyDayPage.test.tsx`, Abschnitt „UX-011".

**Änderungspfad.** Andere Vorhaltedauer: eine Zahl — Aufwand `klein`.
Verlangt die Prüfung, dass gar nichts über einen Fehlversuch hinaus stehen
bleibt: `gcTime` auf 0 und die Kennzeichnung entfernen — Aufwand `klein`, mit
dem Verlust der Anschrift im Funkloch als bewusster Folge. Verlangt der
Betrieb einen echten Offline-Modus: eigenes Epic nach ADR-001, ersetzt
ADR-015 Punkt 16 und bringt die Endgeräteanforderungen mit — Aufwand `groß`.

### ANN-022 — Tiefgrün der Marke als Hover-Zustand des Akzents

| | |
|---|---|
| Kategorie | Technik |
| Herkunft | Umstellung der Akzentfarbe auf die Marke Own Motion (2026-09-10). Die Hauptfarbe `#004429` liegt bei 34,1 % Helligkeit; die bisherige Ableitungsregel „Hover ist 6 Punkte dunkler" hätte von dort aus einen fast schwarzen Wert ergeben. |
| Status | **offen** |
| Wiedervorlage | Jannes, sobald er die Oberfläche eine Weile bedient hat; außerdem MARKE-001, falls die Marke um abgestufte Farbwerte ergänzt wird |

**Annahme.** `--color-accent-hover` trägt das **Tiefgrün der Marke**
(`#042c1b` = `oklch(26.1% 0.0544 160)`) — also einen **dunkleren**, nicht
helleren Wert als den Akzent. `marke/README.md` führt Tiefgrün als Fläche für
App-Symbol, Aufkleber und Visitenkarten-Vorderseite; die Verwendung als Fläche
und Textfarbe in der Anwendung geht darüber hinaus und ist deshalb hier
registriert.

**Begründung.** Die Richtung war die eigentliche Frage, und sie entscheidet
sich nicht am Knopf, sondern an den Links: `--color-accent-hover` ist in rund
einem Dutzend Stellen **Textfarbe** (`text-accent hover:text-accent-hover`,
etwa `MyDayPage.tsx`, `VacationPage.tsx`, `TeamChatPage.tsx`) und nur in
zweien Knopffläche. Ein hellerer Wert hätte beide Verwendungen geschwächt: den
weißen Text auf dem Knopf und den Link auf heller Fläche. Der dunklere Wert
stärkt beide — als Text 13,85:1 statt 10,30:1, weiß darauf 15,19:1 statt
11,29:1 (jeweils schlechteste der drei Flächen). Der Einwand, von 34,1 % aus
weiter abzudunkeln werde „sehr dunkel", trifft die Wahrnehmung, nicht die
Unterscheidbarkeit: der Abstand beträgt 8 Helligkeitspunkte gegenüber 6 in der
Palette davor, der Zustandswechsel ist also **deutlicher** als zuvor.
Ausschlaggebend für genau diesen Wert war schließlich, dass er nicht erfunden
ist: `marke/README.md` schließt mit „Keine weiteren Kombinationen" eigene
Abstufungen aus, und Tiefgrün ist die einzige dunklere Farbe, die die Marke
kennt.

`--color-accent-soft` folgt derselben Logik in die andere Richtung: Farbton der
Marke, Buntheit `0.022` — bewusst **unter** `positiv-soft` (`0.03`), weil beide
seit der Umstellung im Farbton nur neun Grad auseinanderliegen und als Abzeichen
nebeneinander stehen. Papier (`#f6f7f4`) schied als Wert aus: mit 97,5 %
Helligkeit liegt es zu dicht an `canvas` (98,6 %), um eine Fläche zu markieren.

**Verankerung.** `src/index.css`, `--color-accent-hover` und
`--color-accent-soft` (tragen die Kennung im Kommentar). Geprüft in
`src/lib/kontrast.test.ts`: Textkontrast beider Akzentwerte, weißer Text
darauf, Mindestabstand der beiden Zustände (6 Punkte) und die Ordnung
`accent-soft` unter `positiv-soft`.

**Änderungspfad.** Andere Richtung oder anderer Wert: eine Zeile in
`src/index.css`, der Test rechnet die Grenzen neu — Aufwand `klein`. Sollte die
Marke später eine eigene, abgestufte Farbskala bekommen, ersetzt sie diesen
Wert an derselben Stelle — Aufwand `klein`.

### ANN-023 — Die Kopfzeile führt die Marke, nicht den Organisationsnamen

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | Anwenden der Marke Own Motion (2026-09-10). Die Kopfzeile zeigte `user.organizationName ?? 'Praxisplattform'`; mit der Marke gäbe es zwei Antworten auf dieselbe Frage. |
| Status | **offen** |
| Wiedervorlage | Jannes; erneut, sobald eine zweite Praxis dazukäme (ADR-003, „echter Mehrmandantenbetrieb") |

**Annahme.** Die Kopfzeile der angemeldeten Anwendung zeigt die **Wortmarke**.
Der Organisationsname aus den Stammdaten erscheint dort nicht mehr. Die
Anmeldemaske zeigt ebenfalls die Marke statt des Worts „Praxisplattform", der
Seitentitel lautet „Own Motion".

**Begründung.** ADR-003 stellt ausdrücklich fest, dass `organization_id` **keine
Mandantenfähigkeit schafft** und ein echter Mehrmandantenbetrieb „ein eigenes
Vorhaben mit eigener Prüfung" bliebe; unter „Bewusst nicht Bestandteil" steht
„Mandantenfähigkeit als Produktfunktion: kein Tenant-Switching".
`docs/PRODUCT_VISION.md` benennt die Praxis seit dem 2026-09-10 als Own Motion.
Es gibt also genau eine Praxis, und der Name aus der Datenbank sagt neben der
Marke nichts Zusätzliches. Beides nebeneinander wäre zudem im aktuellen Stand
irreführend: der Seed trägt „Test Praxis Tuebingen", das stünde dann unter der
Wortmarke. Die Alternative — die Marke zeigen und den Organisationsnamen als
zugängliche Bezeichnung hinterlegen — wurde verworfen, weil Vorlesesoftware
dann etwas anderes sagt, als zu sehen ist.

**Bewusst in Kauf genommen.** Der Organisationsname wird damit **nirgends** mehr
angezeigt. Wer aus der laufenden Anwendung ablesen möchte, ob er auf
synthetischen Seed-Daten oder auf einem echten Bestand arbeitet, hat dieses
Signal nicht mehr. Für den aktuellen Stand ist das folgenlos — es gibt keinen
echten Bestand (§3.1) —, vor dem Produktivstart ist es ein Punkt für die
Betriebsdokumentation.

**Verankerung.** `src/app/AppShell.tsx` (Kopfzeile, trägt die Kennung im
Kommentar), `src/features/auth/LoginPage.tsx`, `index.html`. Festgehalten in
`src/app/AppShell.test.tsx` und `src/features/auth/LoginPage.test.tsx`.
`src/features/session/types.ts` führt `organizationName` unverändert weiter —
das Feld wird geladen, nur nicht mehr angezeigt.

**Änderungspfad.** Namen wieder anzeigen: ein Element in `AppShell.tsx`, etwa
als ruhige Zeile neben der Marke; der Schutzraum der Marke gibt den Abstand vor
(`schutzraum()` in `src/components/ui/markeRegeln.ts`) — Aufwand `klein`.
Kämen mehrere Praxen dazu, wäre die Kopfzeile ohnehin neu zu denken; das ist
dann Teil des eigenen Vorhabens aus ADR-003 — Aufwand `mittel` und nicht durch
diese Annahme vorweggenommen.

---

### ANN-024 — Privatangaben Beschäftigter: Schreibrecht folgt dem Leserecht

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | STAFF-002a (Umsetzung von E10); `PROJECT_PRINCIPLES.md` §20, §4.3, §4.7 |
| Status | **entschieden (Jannes) 2026-09-11** — die Auslegung wie vorgeschlagen bestätigt |
| Wiedervorlage | Datenschutzprüfung im Rahmen der TOM (G14). Kategorie `Datenschutz`: Die Bestätigung durch den Projektinhaber ersetzt sie nicht, der Eintrag bleibt im Prüfpaket |

**Annahme.** E10 gibt dem Office die **Stammdaten** einer beschäftigten Person
und nennt dabei „Anschrift" und „Telefon". Das wird als **dienstliche**
Erreichbarkeit gelesen: Name, dienstliche E-Mail, Diensttelefon,
Hauptstandort. Die **Privatangaben** in `staff_private_details` (Geburtsdatum,
private E-Mail, Privattelefon, Privatanschrift) bleiben bei `owner` — nicht
nur beim Lesen, wie bisher, sondern auch beim Schreiben. Schreibrecht und
Leserecht sind hier deckungsgleich.

**Begründung.** §20 beschränkt das **Lesen** dieser Angaben seit
`20260828110000` auf `owner` und die betroffene Person selbst; §4.7 verbietet,
geschützte Inhalte auszuliefern und erst im Client auszublenden. Ein
Schreibrecht ohne Leserecht wäre deshalb nicht die restriktivere, sondern die
**gefährlichere** Variante: Das Formular des Office bekäme die Privatfelder als
`null` und würde sie beim Speichern löschen — stiller Datenverlust bei jeder
Adressänderung. Die Alternative, dem Office auch das Leserecht zu geben, wäre
eine Ausweitung des Zugriffs auf Beschäftigtendaten und damit genau das, was §20
und §16 nicht wollen. E10 nennt als Zweck ausdrücklich den Betrieb
(Adressänderung ohne Nadelöhr); die dienstliche Erreichbarkeit deckt diesen
Zweck, und die Privatanschrift wird für Terminplanung und Vertretung nicht
gebraucht (Datenminimierung, Art. 5 Abs. 1 lit. c DSGVO).
**Beantwortet am 2026-09-11 durch Jannes:** „Anschrift" und „Telefon" aus E10
sind die **dienstlichen** Angaben. Die Privatanschrift bleibt beim `owner`,
Schreibrecht und Leserecht bleiben deckungsgleich. Damit ist die einzige
Unsicherheit dieses Eintrags ausgeräumt; offen ist nur noch, ob die
Datenschutzprüfung die Aufteilung im Rahmen der TOM so bestätigt.

**Verankerung.** `app.can_manage_staff_private_details()` in
`supabase/migrations/20260911100000_staff_permission_split.sql` — genau ein
Ausdruck; der Kopfkommentar der Migration trägt die Kennung. In der Oberfläche
`canManageStaffPrivateDetails` in `src/features/session/types.ts` (steuert nur
die Darstellung). Tests: `supabase/tests/staff-management.test.ts`, Abschnitt
„Mitarbeiterverwaltung: wer darf schreiben"; `EditStaffMemberPage.test.tsx`,
Abschnitt „E10, ANN-024".

**Änderungspfad.** Office soll auch die Privatangaben schreiben **und** lesen:
`app.can_manage_staff_private_details()` und die Lese-Policy auf
`staff_private_details` gemeinsam auf `owner, office` erweitern, Hinweistext im
Formular anpassen — Aufwand `klein`, aber mit Änderung an §20, also erst nach
ausdrücklicher Entscheidung. Umgekehrt (Office verliert auch die dienstlichen
Angaben): `app.can_manage_staff_master_data()` auf `owner` zurück — Aufwand
`klein`.

---

### ANN-025 — Die Anwendung legt keine Authentifizierungskonten an

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | STAFF-002b; B13 (entschieden 2026-09-06); ADR-002, ADR-015; `PROJECT_PRINCIPLES.md` §3.4, §4.2, §13 |
| Status | **offen**, getroffen 2026-09-11 |
| Wiedervorlage | **OPS-001** (Providerprüfung, Auth-Mails) — dort entscheidet sich, ob eine Edge Function mit `service_role` den Versand übernimmt; Datenschutzprüfung |

**Annahme.** Die Praxisplattform erzeugt **kein** Konto beim Anmeldedienst. Sie
verwaltet ausschließlich die **Berechtigung**: `invite_staff_account` legt die
Einladung an, `claim_staff_invitation` bindet ein vorhandenes Konto daran. Das
**Konto** entsteht einmalig je Person auf der Oberfläche des Anmeldedienstes
(Supabase Studio → Authentication → Invite). Die Anwendung fordert die
Anmeldemail nur für ein **bestehendes** Konto an
(`signInWithOtp` mit `shouldCreateUser: false`); gibt es noch keines, sagt sie
das und lässt die Einladung offen stehen.

**Begründung.** `supabase/config.toml` setzt `[auth].enable_signup = false` —
keine Selbstregistrierung, verankert in §4.2 („ein individuelles Benutzerkonto
ist Pflicht, aber nicht selbst vergeben"). Damit lehnt der Anmeldedienst
`signInWithOtp` mit `shouldCreateUser: true` ab. Die drei denkbaren Auswege
scheiden aus:

- **Selbstregistrierung einschalten** hieße, eine bewusst gesetzte
  Sicherheitsmaßnahme aufzuweichen — nach §15.1 ein Hard Stop, kein
  Ermessensspielraum.
- **Admin-API des Providers** (`inviteUserByEmail`) verlangt den
  `service_role`-Schlüssel. Der gehört nicht in den Browser (ADR-002, §13) und
  bräuchte eine serverseitige Funktion; `[edge_runtime] enabled = false`, und
  ADR-015 hat Edge Functions für Gesundheitsdaten nicht freigegeben.
- **Eigener Maildienst** wäre ein zweiter Dienstleister, durch B13
  ausgeschlossen.

Bleibt der manuelle Handgriff beim Provider. Er kostet je neuem Zugang eine
Minute und ist die restriktivere Seite (§16): Über diese Anwendung kann
**niemand** ein Konto erzeugen, auch kein Fremder.
**Verhältnis zu B13.** B13 sagt, die Plattform versende die Einladung über die
Auth-Mails des Providers. Das ist heute nur für den Teil einlösbar, der ein
Konto voraussetzt (Anmeldemail, Kennwort zurücksetzen); die **erste**
Kontoanlage bleibt außen vor. §4.2 steht im Rang über einer
Spur-B-Festlegung, deshalb gilt die engere Auslegung — gemeldet nach §21. Die
Roadmap hatte den Punkt vorgezeichnet: STAFF-004 sollte laufen, „sobald
OPS-001 die Auth-Mails einschließt", und OPS-001 ist offen.
**Unsicher:** ob die Praxis den manuellen Schritt auf Dauer akzeptiert. Bei
einer Handvoll Mitarbeitenden bis zur Eröffnung ist er unauffällig; bei
Personalwechseln im Betrieb wird er lästig.

**Verankerung.** `sendeZugangsMail` in `src/features/staff/konto-api.ts` —
`shouldCreateUser: false` ist die eine Zeile, und der Kopfkommentar des Moduls
trägt die Kennung. Die tragende Eigenschaft dahinter steht in
`supabase/migrations/20260911110000_staff_account_invitations.sql`
(`claim_staff_invitation`): Ein Konto ohne passende offene Einladung bleibt
zugriffslos. Tests: `supabase/tests/staff-accounts.test.ts`, „laesst ein Konto
ohne passende Einladung vollstaendig zugriffslos";
`src/features/staff/StaffAccountSection.test.tsx`, Abschnitt „Zustellung der
Anmeldemail".

**Änderungspfad.** Sobald ADR-015 Edge Functions freigibt und OPS-001 die
Auth-Mails einschließt: eine Edge Function mit dem `service_role`-Schlüssel als
Secret, aufgerufen aus `sendeZugangsMail`. **Datenmodell, Rollen, RPCs und der
Annahmeschritt bleiben unverändert** — es entfällt nur der manuelle Handgriff.
Aufwand `mittel`. Umgekehrt ist nichts zurückzunehmen: Der heutige Stand ist
bereits die restriktive Variante.

### ANN-026 — Datenklasse und Frist der Einladung

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | STAFF-002b; ADR-008 (Retention Schedule), ADR-010 |
| Status | **offen**, getroffen 2026-09-11 |
| Wiedervorlage | Datenschutzprüfung; LOE-001 nimmt die Klasse in den Retention Schedule auf |

**Annahme.** Eine Einladung (`public.staff_account_invitations`) ist ein
**Zugangs- und Authentifizierungsdatum**, kein Gesundheitsdatum und kein
Beschäftigtendatum im Sinne von §20. Frist: **12 Monate nach Abschluss des
Vorgangs** (angenommen, zurückgenommen oder abgelaufen) — dieselbe Frist wie
„Normale Authentifizierungs- und Securitylogs" in ADR-008. Die **Gültigkeit**
einer offenen Einladung beträgt **14 Tage**; sie läuft ab, statt aufgeräumt zu
werden: Eine abgelaufene Einladung wird bei der Annahme abgewiesen und in der
Oberfläche als abgelaufen gezeigt. Kein Hintergrundjob, kein Zustand, der ohne
Beobachtung kippt (ANN-007 setzt `pg_cron` nicht voraus).

**Begründung.** Der Datensatz enthält eine E-Mail-Adresse, eine Rollenliste und
Zeitstempel — Kontaktdatum und Berechtigungsentscheidung, kein Inhalt über eine
Person. Er ist zugleich der **Nachweis**, auf welcher Grundlage ein Zugang
entstanden ist; ADR-010 Punkt 2 führt „Änderungen von Rollen und
Berechtigungen" ausdrücklich als auditpflichtig, und ein Nachweis, der früher
verschwindet als das Auditlog, wäre wertlos. Deshalb wird eine Einladung nie
gelöscht, sondern abgeschlossen. 14 Tage sind lang genug für Urlaub und
Krankheit und kurz genug, dass eine vergessene Einladung nicht dauerhaft
offensteht.
**Unsicher:** ob die Prüfung 12 Monate für den Nachweis als ausreichend
ansieht oder die drei Jahre des Auditlogs verlangt — dann wäre die Frist eine
andere, das Modell aber unverändert.

**Verankerung.** `COMMENT ON TABLE public.staff_account_invitations` und die
Frist `now() + interval '14 days'` in `invite_staff_account`, beides in
`supabase/migrations/20260911110000_staff_account_invitations.sql` (der
Kopfkommentar trägt die Kennung). Tests in
`supabase/tests/staff-accounts.test.ts`, „weist eine abgelaufene Einladung ab".

**Änderungspfad.** Andere Gültigkeit: ein Intervall — Aufwand `klein`. Andere
Aufbewahrung: die Zeile `zugangseinladung` in `public.retention_classes` —
Aufwand `klein`.

**Nachtrag vom 2026-09-11 (LOE-001a/LOE-002a).** Die Frist ist jetzt gebaut,
nicht mehr nur beschrieben: Die Datenklasse `zugangseinladung` steht mit zwölf
Monaten im Retention Schedule, und `public.apply_retention()` löscht
abgeschlossene Einladungen — angenommen, zurückgenommen oder abgelaufen —
nach Ablauf dieser Frist. Fälle in `supabase/tests/retention-run.test.ts`.
Der Eintrag bleibt `offen`: Die Zahl selbst hat die Datenschutzprüfung noch
nicht bestätigt.

---

### ANN-027 — Mindestlänge des Kennworts: 12 Zeichen, keine Zeichenklassen

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | STAFF-004a; ADR-010; `PROJECT_PRINCIPLES.md` §3.4, §16 |
| Status | **entschieden (Jannes) 2026-09-11** — die zwölf Zeichen ohne Zeichenklassen wie vorgeschlagen bestätigt |
| Wiedervorlage | Datenschutzprüfung im Rahmen der TOM (G14); OPS-001 (Einstellung beim Provider). Kategorie `Datenschutz`: Die Bestätigung durch den Projektinhaber ersetzt die Prüfung nicht |

**Annahme.** Ein Kennwort für die Praxisplattform braucht **mindestens 12
Zeichen**. Keine erzwungenen Zeichenklassen (Großbuchstabe, Ziffer,
Sonderzeichen), **kein** turnusmäßiger Wechsel, keine Sperre nach
Fehlversuchen über das hinaus, was der Anmeldedienst ohnehin tut.

**Begründung.** Das BSI hat die Empfehlung zum regelmäßigen Kennwortwechsel
2020 aus dem IT-Grundschutz gestrichen, und das NIST rät in SP 800-63B
ausdrücklich von erzwungener Komplexität und periodischem Wechsel ab: Beides
führt zu vorhersehbaren Mustern („Sommer2026!") und zu aufgeschriebenen
Kennwörtern. Länge ist der Faktor, der tatsächlich trägt; 12 Zeichen sind der
Wert, den beide Quellen als unteres Ende für Konten ohne zweiten Faktor
nennen. Der Zugang zu Gesundheitsdaten rechtfertigt eher mehr als weniger —
gegen eine höhere Zahl spricht, dass sie auf dem Telefon am Hausbesuch
eingetippt werden muss (§16: die leichter umkehrbare Option).
**Unsicher:** ob die Datenschutzprüfung im Rahmen der TOM eine höhere Zahl
oder Zeichenklassen verlangt, und ob der Anmeldedienst die Regel serverseitig
in derselben Höhe durchsetzen lässt — die Prüfung im Formular ist Komfort,
verbindlich ist die Einstellung beim Provider (OPS-001).

**Verankerung.** `KENNWORT_MINDESTLAENGE` in `src/features/account/api.ts` —
eine Zahl, die die Kennung im Kommentar trägt; `kennwortProblem` daneben ist
die einzige Prüfung. Tests in `src/features/account/MeinKontoPage.test.tsx`,
„verlangt die Mindestlänge".

**Änderungspfad.** Andere Länge: eine Zahl — Aufwand `klein`; zusätzlich die
Einstellung beim Provider nachziehen. Zeichenklassen oder Wechselzwang: eine
Regel in `kennwortProblem` und eine Provider-Einstellung — Aufwand `klein`,
inhaltlich aber gegen die oben genannten Quellen, deshalb nur auf
ausdrückliches Verlangen der Prüfung.

---

### ANN-028 — MFA für `owner`: eingerichtet und sichtbar, nicht erzwungen

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | STAFF-004b; ADR-010 Punkt 10 und Punkt 9; ADR-012 (Bus-Faktor 1) |
| Status | **entschieden (Jannes) 2026-09-11** — die Durchsetzung wird bewusst später geplant |
| Wiedervorlage | **Jannes, sobald eine Domain für die Anwendung feststeht.** Vorher wird die MFA-Pflicht nicht geplant und nicht eingeschaltet (Entscheidung vom 2026-09-11). Die Datenschutzprüfung sieht den Punkt unabhängig davon. |

**Annahme.** Der zweite Faktor (TOTP) ist **einrichtbar und sichtbar**, aber
die Anmeldung wird **nicht** darauf festgelegt: Kein Datenpfad verlangt heute
`aal2`. Ein `owner`-Zugang ohne zweiten Faktor sieht in „Mein Konto" einen
Warnhinweis; sperren tut ihn nichts.

**Begründung.** ADR-010 Punkt 10 verlangt MFA für **privilegierten
Produktionszugriff** — Datenbank, Infrastruktur —, nicht ausdrücklich für die
Alltags-Praxisrolle `owner`; Punkt 11 hält beide Domänen getrennt. Ein Zwang
für die Praxisrolle wäre also eine Verschärfung über den ADR hinaus, und sie
hätte heute eine gefährliche Nebenwirkung: Es gibt genau **einen**
`owner`-Zugang (Bus-Faktor 1, ADR-012), und er hat keinen zweiten Faktor.
Würde die Anmeldung ihn verlangen, wäre Jannes im selben Moment ausgesperrt —
und der Weg zurück wäre ein privilegierter Produktionszugriff, den ADR-010
Punkt 9 im Normalbetrieb ausschließt. Die Reihenfolge muss deshalb sein: erst
einrichten, dann erzwingen. Bis dahin ist der Warnhinweis die ehrlichste
Auskunft.
**Unsicher:** ob die Datenschutzprüfung MFA für Zugänge mit Vollzugriff auf
Gesundheitsdaten als TOM verlangt. Falls ja, ist das kein Widerspruch,
sondern der geplante zweite Schritt.

**Verankerung.** `app.has_strong_authentication()` in
`supabase/migrations/20260911140000_account_security.sql` — der eine Ausdruck,
an dem eine Durchsetzung hinge; der Kopfkommentar trägt die Kennung. Dass
heute **nichts** daran hängt, hält der Test „setzt heute nichts durch" in
`supabase/tests/staff-accounts.test.ts` fest — eine spätere Durchsetzung ist
damit zwingend eine bewusste Änderung. Der Hinweis in der Oberfläche:
`ZweiterFaktor` in `src/features/account/MeinKontoPage.tsx`.

**Änderungspfad.** Durchsetzung einschalten, sobald mindestens zwei
`owner`-Zugänge einen bestätigten Faktor haben: `app.has_strong_authentication()`
in die Policies beziehungsweise RPCs der Zugangsverwaltung aufnehmen und den
genannten Test umdrehen — Aufwand `klein`. Vorher nicht: Aufwand der Rücknahme
wäre ein privilegierter Produktionszugriff, also `groß` im Sinne der
Hard-Stop-Liste.

**Ergänzung vom 2026-09-11 (Jannes).** Die Durchsetzung wird **erst geplant,
wenn eine Domain für die Anwendung feststeht**. Damit bleibt die Annahme in
ihrem heutigen Zustand bestehen — einrichtbar und sichtbar, nicht erzwungen —
und wird nicht vor M3 wieder aufgerufen. Das ist sachlich schlüssig: Der
zweite Faktor hängt an der Anmeldung, und die steht erst mit dem
Frontend-Hosting fest (Roadmap G5, OPS-002); ein TOTP-Eintrag in der
Authenticator-App trägt zudem die Kennung der Anmelde-URL, die sich bei einem
Domainwechsel ändert. Bis dahin gilt: Der Hinweis in „Mein Konto" bleibt
stehen, die Einrichtung ist freiwillig möglich, und **kein Datenpfad verlangt
`aal2`.** Wird die Pflicht später eingeschaltet, ist die Reihenfolge
unverändert: erst müssen mindestens zwei `owner`-Zugänge einen bestätigten
Faktor haben, sonst ist es eine Aussperrung.

---

### ANN-029 — Auditeinträge folgen ihrer eigenen Frist, nicht der der Akte

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | LOE-001a; ADR-008 (Retention Schedule), ADR-010 (offene Folgefrage „Wie werden Audit-Einträge behandelt, deren Bezugsdaten früher gelöscht werden?") |
| Status | **entschieden (Jannes) 2026-09-11** — bleibt als `Datenschutz` im Prüfpaket |
| Wiedervorlage | Datenschutzprüfung / DSFA-Prozess vor Produktivstart |

**Annahme.** Ein Auditeintrag wird **drei Jahre nach dem Ereignis** gelöscht —
unabhängig davon, ob die Akte, auf die er sich bezieht, noch besteht oder
bereits gelöscht ist. Die Löschung einer Patientenakte löscht **nicht** die
Auditeinträge über die Zugriffe auf sie; sie behalten ihre eigene Frist.

**Begründung.** ADR-008 führt „Patientenakten-Auditlogs" als **eigene
Datenklasse** mit eigener Frist (drei Jahre), nicht als Anhängsel der Akte.
ADR-010 nennt das Auditlog die tragende Kompensation dafür, dass alle
Therapeut:innen alle Akten sehen dürfen (§4.2); würde es mit der Akte fallen,
verschwände der Nachweis genau dann, wenn er am längsten zurückreicht. Die
Datenminimierung leidet darunter kaum: Der Eintrag trägt nur Metadaten
(ADR-010 Punkt 3), und nach der Löschung der Akte ist die enthaltene
Patientenkennung ein Schlüssel ohne Schloss — es gibt keine Zeile mehr, die
sie auflöst. In der Praxis greift die Regel ohnehin selten: Wenn eine Akte
zehn Jahre nach Abschluss der Versorgung fällt, sind Auditeinträge über
Zugriffe von damals längst weg; übrig bleiben nur Zugriffe der letzten drei
Jahre, deren eigene Frist noch läuft.
**Unsicher:** ob die Prüfung stattdessen verlangt, mit der Akte auch den
Zugriffsnachweis zu tilgen. Das wäre eine vertretbare Gegenposition
(Art. 17 DSGVO, Zweckbindung); sie kostet Nachweisbarkeit.

**Verankerung.** Die Datenklasse `auditlog` in
`supabase/migrations/20260911150000_retention_schedule.sql` (der Eintrag trägt
die Kennung) und die eigenständige Regel für `audit_log` im Löschlauf
(LOE-002a). Der Datenbanktest „löscht Auditeinträge nach eigener Frist, nicht
mit der Akte" in `supabase/tests/retention-run.test.ts` hält den Fall fest.

**Änderungspfad.** Soll das Auditlog mit der Akte fallen: im Löschlauf beim
Löschen einer Akte zusätzlich die Auditeinträge mit `subject_id = patient_id`
und `context->>'patient_id'` entfernen — Aufwand `klein`. Die Gegenrichtung
(Auditeinträge länger halten als drei Jahre) ist eine Friständerung und damit
eine Datenänderung in `retention_classes` — Aufwand `klein`.

---

### ANN-030 — Beschäftigtendaten ohne Frist: keine automatische Löschung in V1

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | LOE-001a; ADR-008 (der initiale Retention Schedule führt keine Klasse für Beschäftigtendaten); `docs/development/ARBEITSBEREICHE.md` (offener Punkt, `IDEA-QSN-010`) |
| Status | **entschieden (Jannes) 2026-09-11** — bleibt als `Datenschutz` im Prüfpaket |
| Wiedervorlage | Datenschutzprüfung; Jannes, sobald die erste Person ausscheidet — spätestens vor der ersten Einstellung |

**Annahme.** Mitarbeiterdatensätze, Privatangaben und Arbeitszeiten
(`staff_members`, `staff_private_details`, `staff_working_hours`,
`staff_working_hour_exceptions`) werden **nicht automatisch gelöscht**. Sie
tragen die Datenklasse `beschaeftigtendaten` mit der Grundlage `offen`.

**Begründung.** ADR-008 tabelliert für Beschäftigtendaten keine Frist, und die
naheliegenden Anker sind widersprüchlich: Lohnunterlagen unterliegen
steuerlichen Fristen (§147 AO, §257 HGB), die diese Anwendung nicht führt;
für Bewerbungsunterlagen gelten Wochen, für arbeitsrechtliche Streitfälle die
regelmäßige Verjährung (§195 BGB). Eine erfundene Zahl wäre schlechter als
keine: Beschäftigtendaten sind nach §20 der Prinzipien besonders geschützt,
und eine zu kurze Frist löscht Nachweise, die die Praxis im Streitfall
braucht. Zudem fehlt der Anker im Datenmodell — es gibt kein Datum des
Ausscheidens, nur `employment_status`. Die datensparsame Seite ist hier
gewahrt, weil der Bestand winzig ist (eine Praxis, wenige Personen) und keine
Gesundheitsdaten enthält.
**Unsicher:** ob die Prüfung eine Frist verlangt, bevor die erste Person
ausscheidet.

**Verankerung.** Die Datenklasse `beschaeftigtendaten` in
`supabase/migrations/20260911150000_retention_schedule.sql` — der Eintrag
trägt die Kennung; sein Feld `basis` steht auf `offen`, und der Test
„begründet jede Frist ohne gesetzliche Grundlage mit einer Annahme" in
`supabase/tests/retention.test.ts` verhindert, dass die Lücke stillschweigend
bleibt.

**Änderungspfad.** Frist setzen: ein Datum des Ausscheidens auf
`staff_members` ergänzen, die Klasse auf diesen Anker stellen und eine Regel
im Löschlauf ergänzen — Aufwand `mittel`, weil das Datum fachlich gepflegt
werden muss. Reine Friständerung ohne neuen Anker: `klein`.

---

### ANN-031 — Das Löschjournal hat selbst keine Frist

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | LOE-001a/LOE-002a; ADR-008 Punkt 8 (Löschungen nach einem Restore erneut anwenden), ADR-012 (Backup-Lebenszyklus offen) |
| Status | **entschieden (Jannes) 2026-09-11** — bleibt als `Datenschutz` im Prüfpaket |
| Wiedervorlage | Datenschutzprüfung; erneut mit OPS-003, sobald der Backup-Lebenszyklus definiert ist (ADR-012, offene Folgefrage) |

**Annahme.** Das Löschjournal (`deletion_journal`) wird **nicht automatisch
gelöscht**. Es hält je gelöschtem Datensatz Tabelle, Kennung, Datenklasse,
Fälligkeit und Zeitpunkt fest — **keinen Namen, keinen Inhalt, keine
Fremdschlüssel auf bestehende Daten**.

**Begründung.** ADR-008 Punkt 8 verlangt, dass wirksam gewordene Löschungen
nach einer Wiederherstellung erneut angewendet werden, und zwar aus einer
Liste, die den Restore überlebt. Eine Liste, die selbst einer Frist
unterliegt, könnte kürzer sein als die älteste Backup-Generation — dann
kehrten gelöschte Daten unbemerkt zurück, genau der Fall, den ADR-008
ausschließen will. Solange der Backup-Lebenszyklus nicht definiert ist
(ADR-012, offene Folgefrage), lässt sich keine sichere Frist bestimmen. Der
Datenschutzpreis dafür ist gering: Nach der Löschung des Datensatzes ist die
verbleibende UUID ein Schlüssel ohne Schloss (Erwägungsgrund 26 DSGVO —
Identifizierung wäre nur über die gelöschten Daten selbst möglich), und die
Zeile ist zugleich der Nachweis der Löschung, den ADR-008 verlangt.
**Unsicher:** ob die Prüfung das Journal dennoch als personenbezogen einstuft,
weil ein Backup die Auflösung theoretisch wiederherstellen könnte.

**Verankerung.** Die Datenklasse `loeschjournal` in
`supabase/migrations/20260911150000_retention_schedule.sql` (der Eintrag trägt
die Kennung) und der Tabellenkommentar von `public.deletion_journal`.

**Änderungspfad.** Frist einführen, sobald der Backup-Lebenszyklus steht: Zeile
in `retention_classes` auf Anker `event_time` und ein Intervall setzen, das die
älteste Backup-Generation sicher überdauert, und eine Regel im Löschlauf
ergänzen — Aufwand `klein`.

**Betriebliche Folge, die keine Software löst.** Das Journal liegt in derselben
Datenbank, die wiederhergestellt wird. Ein Restore setzt es damit auf den Stand
des Backups zurück — Löschungen danach wären verloren. Das Restore-Verfahren
(OPS-003, ADR-012) MUSS deshalb das Journal **vor** der Rückspielung sichern
und danach einspielen, bevor `reapply_deletion_journal()` läuft. Ohne diesen
Schritt ist die Wiederanwendung unvollständig.

---

### ANN-032 — „Abschluss der Versorgung" als ausdrücklicher, rücknehmbarer Vorgang

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | LOE-001b; ADR-008 (Anker der klinischen Retention, dort als offene Folgefrage geführt), ANN-002 (`inactive` ist kein Behandlungsabschluss), `IDEA-LZK-006` |
| Status | **entschieden (Jannes) 2026-09-11** |
| Wiedervorlage | Jannes nach den ersten Praxiswochen (passt der Vorgang in den Alltag?); die Datenschutzprüfung sieht den Fristanker unabhängig davon |

**Annahme.** Der „Abschluss der Behandlung" aus §630f Abs. 3 BGB ist ein
**ausdrücklicher Vorgang auf der Akte**: `patients.care_concluded_on`, gesetzt
von owner, therapist oder team_lead, mit frei wählbarem Tag (nicht in der
Zukunft, nicht vor dem Beginn der Versorgung) und **zurücknehmbar**. Ohne
diesen Vorgang läuft keine Aufbewahrungsfrist und wird nichts gelöscht. Eine
Rücknahme lässt die Frist mit dem nächsten Abschluss **neu** beginnen; sie
setzt sie nicht fort.

**Begründung.** ADR-008 verlangt den Anker und lässt seine Definition
ausdrücklich offen; ANN-002 hält fest, dass der organisatorische Status
`inactive` ihn nicht ersetzt, weil er eine Aussage über den Kalender ist und
keine über die Behandlung. Gegen einen Automatismus („sechs Monate kein
Termin") sprechen drei Dinge: Er startet eine zehnjährige Frist ohne
fachliche Entscheidung; eine Pause in der Versorgung ist kein Abschluss; und
die automatische Klassifizierung, die Jannes sich wünscht
(`IDEA-LZK-007`), hängt am offenen Rechtsrahmen B9. Die Rücknehmbarkeit ist
die datenschutzfreundlichere und zugleich sicherere Seite: Ein Irrtum ist
korrigierbar, solange die Frist läuft, und eine wiederaufgenommene Behandlung
verlängert die Aufbewahrung, statt sie zu verkürzen (ADR-008 Punkt 2,
`PROJECT_PRINCIPLES.md` §16).
**Unsicher:** ob die Praxis den Vorgang im Alltag zuverlässig ausführt. Wird er
vergessen, wird **nicht** gelöscht — der Fehler geht damit in Richtung
Aufbewahrung, nicht in Richtung Datenverlust. Eine Erinnerung wäre der
nächste Schritt, ist aber ein eigenes Feature.

**Verankerung.** `public.conclude_patient_care` und
`public.reopen_patient_care` samt `app.can_conclude_patient_care()` in
`supabase/migrations/20260911160000_care_conclusion.sql` — der Kopfkommentar
trägt die Kennung. Tests in `supabase/tests/care-conclusion.test.ts`;
Oberfläche `VersorgungAbschliessen` in
`src/features/patients/PatientDetailPage.tsx`; Abnahmeschritt LOE-001b in
`docs/abnahme/etappe-1-kernprozess.md`.

**Änderungspfad.** Rollenschnitt ändern: eine Migration, die
`app.can_conclude_patient_care()` ersetzt — Aufwand `klein`. Automatische
Klassifizierung ergänzen: eigenes Feature mit eigener Entscheidung, hängt an
B9 — Aufwand `mittel` bis `groß`, deshalb heute nicht. Den Anker ganz
verschieben (etwa auf den letzten durchgeführten Termin): eine Migration und
eine Änderung der Regel im Löschlauf — Aufwand `klein`, solange noch nichts
gelöscht wurde.

---

### ANN-033 — Legal Hold nur auf Patientenebene, nur `owner`, ohne Pflegeoberfläche

| | |
|---|---|
| Kategorie | Recht |
| Herkunft | LOE-001c; ADR-008 Punkt 7 („dokumentierter Legal-Hold-Mechanismus") und die dortige offene Folgefrage „Wer darf einen Legal Hold setzen und aufheben?" |
| Status | **entschieden (Jannes) 2026-09-11** — bleibt als `Recht` im Prüfpaket |
| Wiedervorlage | Datenschutzprüfung (B2); außerdem sofort, wenn der erste reale Vorgang eintritt — dann zeigt sich, ob der Zuschnitt trägt |

**Annahme.** Eine Löschsperre wirkt **auf genau eine Patientenakte**, wird
**nur von `owner`** gesetzt und aufgehoben, trägt einen Pflichtgrund als
Freitext und wird beim Aufheben **nicht gelöscht**, sondern mit Ende und
verantwortlicher Person fortgeschrieben. Es gibt **keine Pflegeoberfläche**;
laufende Sperren sind in der Aufbewahrungsübersicht sichtbar.

**Begründung.** ADR-008 verlangt den Mechanismus und lässt Träger und
Berechtigung offen. Der realistische Anlass in einer Einzelpraxis — Streit um
eine Behandlung oder ein Honorar, eine Aufsichtsanfrage zu einem Fall — hängt
an einer Akte; eine Sperre „für alles" wäre heute ein Feature ohne
Anwendungsfall (ADR-014, Negativliste) und ließe sich als weiterer
`subject_type` nachziehen, ohne dass sich etwas anderes ändert. Der
Rollenschnitt folgt §4.1: Ob ein rechtlicher Vorgang läuft, entscheidet die
Praxisleitung, nicht die behandelnde Person und nicht die Verwaltung. Dass die
Zeile das Aufheben überlebt, verlangt ADR-008 selbst („Beginn, Grund,
verantwortliche Person und Ende"). Die fehlende Oberfläche ist eine
Priorisierung der Roadmap (Komfort in Stufe 1) und keine Lücke im Konzept: Ein
Hold entsteht selten und nie in Eile.
**Unsicher:** ob die Datenschutzprüfung eine Sperre auch für Beschäftigten-
oder Abrechnungsdaten verlangt. Für beide gibt es heute ohnehin keine
automatische Löschung (ANN-030), die Frage stellt sich also erst mit den
Rechnungen.

**Verankerung.** `public.legal_holds`, `app.under_legal_hold()` und
`app.can_manage_legal_hold()` in
`supabase/migrations/20260911170000_legal_hold.sql` — der Kopfkommentar trägt
die Kennung. Tests in `supabase/tests/legal-hold.test.ts`, darunter der Fall,
dass die Sperre den Löschlauf anhält (`supabase/tests/retention-run.test.ts`).

**Änderungspfad.** Weiterer Gegenstand (etwa `staff_member` oder `invoice`):
`subject_type` um den Wert erweitern und die Prüfung in die betreffende Regel
des Löschlaufs aufnehmen — Aufwand `klein`. Pflegeoberfläche ergänzen: eine
Seite mit zwei Aktionen auf den bestehenden Funktionen — Aufwand `klein`,
bewusst nicht in diesem Epic.

---

### ANN-034 — Absagegrund als codierte Auswahl aus vier Werten, kein Freitext

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | CAL-008b; ADR-018 Punkt 6 verlangt den Grund als Pflichtangabe und nennt die Werteliste ausdrücklich „bewusst nicht Bestandteil dieser Entscheidung" (CAL-008) |
| Status | **entschieden (Jannes) 2026-09-12** — wie empfohlen; bleibt als `Datenschutz` im Prüfpaket |
| Wiedervorlage | Datenschutzprüfung (B2); außerdem Jannes nach den ersten Praxiswochen — dort zeigt sich, ob vier Werte reichen |

**Annahme.** Der Absagegrund ist eine **codierte Auswahl aus genau vier
Werten** — „Patient:in hat abgesagt", „Praxis hat abgesagt", „Termin verlegt",
„Sonstiger Grund" — **ohne Freitextfeld**. Er ist Pflicht für jede neue Absage,
Bestandszeilen behalten `null`. Er steht an der Terminzeile und **nicht** im
Auditkontext.

**Begründung.** ADR-018 nennt den Zweck des Grundes: „Ohne Grund ist die
Absagequote später nicht lesbar." Genau das leisten die vier Werte — wer
abgesagt hat und ob der Termin verlegt wurde, ist die ganze Auskunft, die eine
Quote braucht. Ein Freitextfeld leistet dafür nichts zusätzlich, ist aber die
wahrscheinlichste Stelle im ganzen Terminmodell, an der eine Gesundheitsangabe
in einen ausdrücklich klinikfreien Datensatz rutscht („Rücken war wieder
schlimmer", „liegt im Krankenhaus"). `PROJECT_PRINCIPLES.md` §4.6 und §5
halten den Termin frei von klinischen Inhalten; §16 verlangt im Zweifel die
datensparsamere Option. Vier Werte statt einer feineren Liste, weil jede
zusätzliche Kategorie eine Aussage über die Patientin trifft, sobald sie über
„wer hat abgesagt" hinausgeht — „krank", „verstorben", „unzufrieden" wären
genau das.

Dass der Grund **nicht** ins Auditlog wandert, folgt derselben Linie: Die
Terminzeile fällt nach drei Jahren ab Jahresende (`termin_ohne_nachweis`,
ANN-001), das Auditlog läuft nach eigener Frist (ANN-029). Eine Kopie im
Auditkontext ließe die Angabe die Zeile überleben, ohne dass sie dort jemand
braucht (ADR-010, ADR-011).
**Unsicher:** ob die Praxis im Alltag eine fünfte Kategorie vermisst — am
ehesten „kurzfristig abgesagt", sobald ADR-009 das Ausfallhonorar bei Absagen
regelt. ADR-018 verweist die Fristenregel ausdrücklich in den Praxisprozess und
nicht ins Datenmodell.

**Verankerung.** `public.appointments.cancellation_reason` mit der Constraint
`appointments_cancellation_reason_values` und die Prüfung in
`public.cancel_appointment` — beide in
`supabase/migrations/20260912110000_cancellation_reason.sql`, der Kopfkommentar
trägt die Kennung. Beschriftungen in `cancellationReasonLabels`
(`src/features/appointments/api.ts`). Tests in
`supabase/tests/change-appointment.test.ts` („nimmt nur codierte
Absagegründe entgegen, keinen Freitext" und der Auditkontext-Fall).

**Änderungspfad.** Weiterer Wert: einen Eintrag in der Constraint, einen in
`cancellationReasonLabels` — Aufwand `klein`, keine Migration bestehender
Zeilen nötig. Freitext zusätzlich aufnehmen: neue Spalte, Redaction-Regel im
Logging, Aufnahme in die Löschprüfung und eine Aussage in der DSFA — Aufwand
`mittel`, und genau die Abwägung oben spricht dagegen.

---

### ANN-035 — No-show fällt unter die Frist der abgesagten Termine; mit Ausfallhonorar wird nicht gelöscht

| | |
|---|---|
| Kategorie | Recht |
| Herkunft | CAL-008c; ADR-018 („Offene Folgefragen": „Braucht ‚nicht angetroffen' eine eigene Frist im Retention Schedule, oder fällt es unter ‚abgesagte Termine und No-shows ohne Rechnung'? Beim Bauen von CAL-008 zu prüfen") |
| Status | **entschieden (Jannes) 2026-09-12** — wie empfohlen; bleibt als `Recht` im Prüfpaket |
| Wiedervorlage | ABR-003 — sobald es Rechnungen gibt, entscheidet die Rechnung statt des Kennzeichens; Datenschutzprüfung (B2) |

**Annahme.** Ein Termin im Zustand `no_show` fällt unter die **bestehende**
Retention-Klasse `termin_ohne_nachweis` — drei Jahre ab Ende des
Kalenderjahres, **gerechnet ab dem Zeitpunkt des Vermerks** statt ab der
Absage. Er wird **nicht** gelöscht, wenn das Ausfallhonorar-Kennzeichen gesetzt
ist; ein Behandlungsnachweis und eine Löschsperre halten ihn wie bisher
zurück. Eine eigene Datenklasse bekommt er nicht.

**Begründung.** Die Klasse trägt seit LOE-001a im Text ausdrücklich
„Abgesagte Termine und No-shows ohne Rechnung" (ADR-008) — die Regel im
Löschlauf fragte bisher nur nach `cancelled`, weil es den Zustand nicht gab.
Fachlich sind beide dasselbe: ein Termin, an dem nicht behandelt wurde, also
ohne Behandlungsnachweis und ohne die Zehnjahresfrist aus § 630f Abs. 3 BGB.
Eine eigene Klasse mit derselben Frist wäre eine zweite Zahl für denselben
Sachverhalt (ANN-001, ADR-014).

Der Anker ist der Vermerk und nicht der Termintag: Er ist der Vorgang, den die
Praxis vollzogen hat, er entspricht dem `cancelled_at` der Absage, und beide
liegen im Alltag ohnehin am selben Tag. Gerechnet wird unverändert auf das
Kalenderjahresende, die Frist selbst bleibt `app.retention_interval()`.

Dass ein No-show **mit** Kennzeichen stehen bleibt, ist die vorsichtigere
Seite (§16): Das Kennzeichen sagt, dass abgerechnet werden soll; was
abgerechnet wird, unterliegt der steuerlichen Aufbewahrung (§ 147 AO,
§ 257 HGB — zehn beziehungsweise sechs Jahre) und nicht der internen
Dreijahresfrist. Eine Löschung lässt sich nachholen, eine gelöschte Grundlage
einer Forderung nicht. Bis ABR-003 die Rechnung führt, ist das Kennzeichen der
einzige verfügbare Anhaltspunkt.
**Unsicher:** ob die steuerliche Frist an der **Rechnung** hängt (dann fällt
ein nie abgerechneter No-show mit Kennzeichen nach drei Jahren doch) oder am
Vorgang. ABR-003 beantwortet das mit der Rechnung selbst; bis dahin bleibt der
Datensatz stehen, und das ist die rückholbare Seite des Irrtums.

**Verankerung.** Die Regel „Abgesagte Termine und No-shows ohne
Behandlungsnachweis" in `public.apply_retention()`
(`supabase/migrations/20260912120000_appointment_no_show.sql`) — der
Regelkommentar trägt die Kennung. Tests in
`supabase/tests/retention-run.test.ts` (gelöscht ohne Kennzeichen, stehen
geblieben mit Kennzeichen, Journalzeile unter derselben Klasse).

**Änderungspfad.** Eigene Klasse mit eigener Frist: eine Zeile in
`retention_classes`, eine Zuordnung in `retention_assignments`, die Regel im
Lauf aufteilen — Aufwand `klein`. Kennzeichen nicht mehr als Haltegrund,
sondern die Rechnung: eine Bedingung in derselben Regel austauschen, sobald
ABR-003 die Rechnungstabelle bringt — Aufwand `klein`, und genau dafür ist die
Wiedervorlage gesetzt.

---

### ANN-036 — `documented` auch aus `confirmed`: die Finalisierung schließt den Termin mit ab

| | |
|---|---|
| Kategorie | Technik |
| Herkunft | CAL-008d; ADR-018 Punkt 2 (Übergangstabelle) gegen ADR-018 Punkt 3 (Invariante) |
| Status | **entschieden (Jannes) 2026-09-12** — wie empfohlen. Kategorie `Technik`, damit erledigt |
| Wiedervorlage | nur noch mit ABR-003, wenn `invoiced` denselben Weg geht |

**Annahme.** Die Finalisierung einer Behandlungsdokumentation hebt den Termin
auf `documented` — **auch dann, wenn er noch `confirmed` ist** und niemand ihn
ausdrücklich abgeschlossen hat. `completed_at` wird dabei gesetzt, falls es
noch fehlt; `completed_by` bleibt leer.

**Begründung.** ADR-018 sagt zwei Dinge, die sich in diesem Fall nicht beide
wörtlich halten lassen. Die Übergangstabelle (Punkt 2) nennt nur
`completed` → `documented`. Die Invariante (Punkt 3) sagt: „`status =
'documented'` **genau dann**, wenn zu diesem Termin eine finalisierte
Dokumentation existiert" — und verlangt ausdrücklich beide Richtungen als Test
in `pnpm test:db`.

Es gibt zwei reale Wege zu einer finalisierten Dokumentation an einem nicht
abgeschlossenen Termin: die Finalisierung auf der Dokumentationsseite und die
automatische Finalisierung nach Fristablauf (ADR-016 Punkt 7). Bliebe der
Termin in beiden Fällen `confirmed`, wäre die Invariante verletzt. Sie ist die
stärkere Zusage — sie ist als Prüfung formuliert, die Tabelle zählt Auslöser
auf —, und fachlich ist sie auch die richtigere: Wer eine Behandlung
dokumentiert und festschreibt, sagt damit, dass sie stattgefunden hat.

`completed_by` bleibt leer, weil tatsächlich niemand abgeschlossen hat; ein
erfundener Akteur wäre schlimmer als ein leeres Feld. Wer finalisiert hat,
steht in `treatment_notes.finalized_by` und im Auditlog. Für die automatische
Finalisierung ist das derselbe Umgang wie bei `finalized_by = null` dort.

Das berührt ADR-018 Punkt 7 („keine automatischen Übergänge durch Zeitablauf")
**nicht**: Der Zustand folgt einer Dokumentation, die ein Mensch geschrieben
hat, nicht der Uhr. Punkt 7 nimmt die automatische Finalisierung ausdrücklich
aus.
**Unsicher:** ob Jannes den Terminabschluss lieber als eigenen, bewussten
Klick behielte — dann müsste die Finalisierung an einem `confirmed`-Termin
stattdessen abgewiesen werden, und die Dokumentationsseite bräuchte einen
Hinweis „erst abschließen".

**Verankerung.** `app.mark_appointment_documented()` in
`supabase/migrations/20260912130000_appointment_documented.sql` — der
Kopfkommentar der Migration und der Funktionsrumpf tragen die Kennung. Tests in
`supabase/tests/appointment-states.test.ts` („hebt auch einen nur bestätigten
Termin auf documented", „setzt dabei completed_at, lässt completed_by aber
leer") samt der Invariantenprüfung über alle Termine.

**Änderungspfad.** Umkehren: die `where`-Bedingung in
`app.mark_appointment_documented` auf `status = 'completed'` verengen und
`finalize_treatment_note` einen `confirmed`-Termin abweisen lassen; die
automatische Finalisierung bräuchte dann eine eigene Antwort auf dieselbe
Frage — Aufwand `klein` im Code, aber eine neue fachliche Entscheidung für den
Scheduler-Fall.

---

### ANN-037 — Geprüft wird die Länge des Terminfensters, nicht der Zeitpunkt

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | CAL-010a; `PROJECT_PRINCIPLES.md` §8.1 („neu gesetztes Zeitfenster" gegen „Bestehende Termine werden nicht rückwirkend verändert") |
| Status | **entschieden (Jannes) 2026-09-12** — wie empfohlen. Kategorie `Praxisprozess`, damit erledigt |
| Wiedervorlage | nur noch mit E12 Punkt 1 und 2 (begründete Abweichung von 60 Minuten, Länge je Praxis einstellbar) |

**Annahme.** `create_appointment` verlangt **immer** ein Zeitfenster von 60
Minuten. `update_appointment` prüft die Länge **genau dann, wenn sie sich
ändert**. Ein Bestandstermin mit abweichender Länge bleibt damit gültig,
organisatorisch bearbeitbar **und verschiebbar**, solange seine Länge
unangetastet bleibt; wer sie ändert, bekommt die 60 Minuten. Im
Bearbeitungsformular zieht ein geänderter Beginn das Ende mit der **bisherigen**
Länge mit; ein eigener Knopf setzt den Termin ausdrücklich auf das
Terminfenster.

**Begründung.** §8.1 sagt zwei Dinge, die sich beim Verschieben eines
Bestandstermins nicht beide wörtlich halten lassen. „Geprüft wird das
Zeitfenster, wenn es neu gesetzt wird" spricht für eine Prüfung bei jeder
Zeitänderung. Der Abschnitt „Bestehende Termine" sagt dagegen: Ein Termin mit
anderer Länge „bleibt gültig, sichtbar und bearbeitbar", und „die Anwendung
DARF ihn NICHT selbsttätig verlängern, verkürzen oder verschieben."

Beide Alternativen verletzen den zweiten Satz: Ein Verschieben, das die Länge
auf 60 Minuten zieht, verlängert den Termin selbsttätig; ein Verschieben, das
abgewiesen wird, macht ihn unbeweglich und damit nicht mehr „bearbeitbar". Die
Auflösung nach Rang gibt dem stärkeren Verbot recht — der Bestandsschutz ist
als Verbot formuliert, die Prüfregel als Zeitpunktangabe.

Die MUSS-Anforderung bleibt dabei vollständig durchgesetzt: Es gibt **keinen**
Weg, ein Zeitfenster mit einer anderen Länge als 60 Minuten **neu** entstehen
zu lassen. Bestehen bleiben kann eine abweichende Länge nur dort, wo §8.1 sie
ausdrücklich bestehen lässt. **Unsicher:** ob Jannes lieber hätte, dass ein
verschobener Altfall die 60 Minuten gleich mitbekommt — das wäre bequemer und
widerspräche dem Verbot.

**Nicht Bestandteil.** Ob es eine begründete Abweichung von den 60 Minuten
geben soll und ob die Länge je Praxis einstellbar wird, sind **E12 Punkt 1 und
2** und bleiben offen. CAL-010a baut deshalb ohne Ausnahmeparameter und mit
einer festen Zahl (§16: im Zweifel die restriktivere Option).

**Verankerung.** `app.appointment_window_minutes()` und die beiden
Längenprüfungen in
`supabase/migrations/20260912150000_appointment_window.sql` (Kopfkommentar und
Funktionsrümpfe tragen die Kennung); `TERMINFENSTER_MINUTEN`,
`fensterEnde` und `terminLaengeMinuten` in
`src/features/appointments/api.ts`; die Ableitung im Formular in
`AppointmentFormFields.tsx` und `EditAppointmentPage.tsx`. Tests in
`supabase/tests/appointment-window.test.ts` (beide Schreibpfade, drei
Bestandsfälle) und `src/features/appointments/EditAppointmentPage.test.tsx`.

**Änderungspfad.** Strenger (jede Zeitänderung erzwingt 60 Minuten): die
Bedingung `v_neu_laenge is distinct from v_alt_laenge` in
`update_appointment` streichen und im Formular die Länge beim Verschieben auf
`TERMINFENSTER_MINUTEN` ziehen — Aufwand `klein`, ohne Datenumzug. Lockerer
(begründete Abweichung nach E12 Punkt 1): ein weiterer Parameter nach dem
Muster von `p_allow_outside_working_hours` mit Auditvermerk — Aufwand `klein`
bis `mittel`.

---

### ANN-038 — Terminserie: verplant ist nicht genutzt, drei Rhythmen, höchstens 30 je Vorgang

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | CAL-007; die Roadmap verlangt „Anzahl aus dem Kontingent", ohne zu sagen, was das Kontingent verbraucht |
| Status | **entschieden (Jannes) 2026-09-12** — wie empfohlen. Kategorie `Praxisprozess`, damit erledigt |
| Wiedervorlage | nur noch mit ABR-002: dort entscheidet sich, ob die genutzte Menge automatisch fortgeschrieben wird |

**Annahme.** Drei Festlegungen, die zusammengehören:

1. **Verplant ist nicht genutzt.** Ein Termin, der aus einer Verordnung
   geplant wurde, trägt deren Kennung (`appointments.prescription_id`). Als
   **offen** gilt `verordnet − max(genutzt, verplant)`: das Maximum, nicht die
   Summe, weil eine durchgeführte Behandlung beides ist. Abgesagte Termine
   zählen nicht als verplant; „nicht angetroffen" zählt mit. Die **genutzte**
   Menge pflegt die Praxis unverändert von Hand (ANN-012) — CAL-007 schreibt
   sie **nicht** fort, das bleibt ABR-002.
2. **Das Kontingent begrenzt die Serie nicht.** Die Oberfläche schlägt das
   offene Kontingent als Anzahl vor und weist auf eine Überschreitung hin; der
   Server lässt sie zu. Wer die Folgeverordnung in Aussicht hat, plant zu Recht
   darüber hinaus.
3. **Drei Rhythmen, höchstens 30 Termine je Vorgang.** „Einmal pro Woche" (7
   Tage), „Zweimal pro Woche" (3 und 4 Tage im Wechsel, also zwei feste
   Wochentage) und „Alle zwei Wochen" (14 Tage). Einzelne Termine sind in der
   Liste frei verschiebbar.

**Begründung.** Zu 1: Ohne die Verknüpfung wäre „Anzahl aus dem Kontingent"
beim **zweiten** Aufruf falsch — die Anwendung böte dieselben zehn Behandlungen
erneut an. Eine Addition von genutzt und verplant wäre ebenso falsch, weil sie
jede durchgeführte Behandlung doppelt zählte. Die genutzte Menge automatisch
fortzuschreiben, wäre dagegen eine Aussage über die **Leistung** und gehört
deshalb zur Leistungserfassung (ABR-002, ANN-012), nicht zum Kalender.

Zu 2: Die harte Grenze sitzt bereits an der richtigen Stelle —
`prescription_items_used_within_prescribed` verhindert, dass mehr abgerechnet
wird als verordnet ist (VER-001). Eine zweite Grenze am Kalender würde
alltägliche Planung blockieren, ohne die Abrechnung sicherer zu machen.
**Unsicher:** ob Jannes stattdessen eine Rückfrage will („mehr als verordnet —
trotzdem?").

Zu 3: Die Rhythmen decken die Frequenzen ab, die auf den Verordnungen stehen
(„1x pro Woche", „2x pro Woche"). Zweimal pro Woche als 3/4-Wechsel statt als
3,5 Tage hält die Serie auf zwei festen Wochentagen — so steht sie im
Terminkalender. Dreißig Termine sind rund ein halbes Jahr bei zwei Behandlungen
je Woche; die Grenze begrenzt zugleich die Transaktion, die als „alles oder
nichts" Sperren hält. **Unsicher:** ob eine Praxis mit Gebietstagen
(`IDEA-PRX-031`) stattdessen feste Wochentage wählen will.

**Verankerung.** `app.prescription_slot_counts()` und
`app.appointment_series_limit()` in
`supabase/migrations/20260912160000_appointment_series.sql` (Kopfkommentar und
Funktionen tragen die Kennung); die Spalte
`appointments.prescription_id` ebenda; `rhythmen` und `SERIE_HOECHSTZAHL` in
`src/features/appointments/serie.ts`. Tests in
`supabase/tests/appointment-series.test.ts` (Kontingentrechnung, Obergrenze,
Serie über dem Kontingent) und `src/features/appointments/serie.test.ts`.

**Änderungspfad.** Zu 1 — automatischer Verbrauch: ABR-002 schreibt
`used_quantity` fort, die Rechnung in `app.prescription_slot_counts` fällt auf
`verordnet − genutzt` zurück; Aufwand `mittel`, ohne Datenumzug. Zu 2 — harte
Grenze: eine Prüfung in `create_appointment_series` gegen `remaining`; Aufwand
`klein`. Zu 3 — weitere Rhythmen oder ein freier Abstand in Tagen: ein Eintrag
in `rhythmen` beziehungsweise ein Zahlenfeld; Aufwand `klein`, die Serverseite
nimmt die Tage ohnehin einzeln entgegen.

---

### ANN-039 — Terminzettel: Inhalt, nur Druck, kein Versand

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | CAL-011, `IDEA-PRX-006`; ADR-010 Punkt 2; `OPEN_DECISIONS.md` B15 |
| Status | **entschieden (Jannes) 2026-09-12** — wie empfohlen; als `Datenschutz` **weiter im Prüfpaket** |
| Wiedervorlage | Datenschutzprüfung (B2); der Versandweg mit B15 |

**Annahme.** Der Terminzettel ist ein Ausdruck, der die Praxis in der Hand
einer Patient:in verlässt. Drei Festlegungen dazu:

1. **Inhalt.** Name der Patient:in, und je Termin Datum, Uhrzeit, Ort und die
   behandelnde Person. **Nicht** darauf: Terminstatus, Verordnung, Diagnose,
   Behandlungsinhalt und die Hausbesuchsadresse. Die Adresse ist ihre eigene;
   der Ort steht als „bei Ihnen zu Hause". Ausgegeben werden nur **bestätigte
   künftige** Termine.
2. **Nur Druck, kein Versand.** Kein Knopf für E-Mail oder SMS. Eine
   Terminliste in Verbindung mit einer Praxis ist ein Gesundheitsdatum
   (Art. 9 DSGVO); ein Versandweg braucht einen Dienstleister, eine
   Rechtsgrundlage und eine Einwilligung — das ist **B15** und offen
   (`PROJECT_PRINCIPLES.md` §3.5).
3. **Der Aufruf wird protokolliert.** Die Seite hat eine eigene Adresse; ohne
   Eintrag ließe sich Name und Terminlage offenlegen, ohne dass eine Spur
   bliebe. Geschrieben wird das bestehende `patient_record.viewed` mit dem
   Kontext `view: 'appointment_slip'` — kein neues Ereignis im Katalog
   (ADR-010 Punkt 2).

**Begründung.** Zu 1: Was auf Papier steht, lässt sich nicht zurückrufen. Der
Zettel beantwortet genau eine Frage — „wann bin ich wieder dran und wo" — und
alles darüber hinaus wäre eine Offenlegung ohne Zweck (§5,
`PROJECT_PRINCIPLES.md` §4.6). Der Status gehört nicht dazu, weil ohnehin nur
bestätigte Termine ausgegeben werden; ein abgesagter Termin auf einem Zettel
zum Mitnehmen wäre irreführend.

Zu 2: `IDEA-PRX-006` nennt den Versand als Idee und sagt selbst „kein Versand
ohne B15". §3.5 verlangt für jeden Dienstleister mit Zugang zu Patientendaten
eine Prüfung; dieser Loop legt keinen an.

Zu 3: ADR-010 Punkt 2 verlangt das Öffnen einer Patientenakte als
auditierbares Ereignis. Der Zettel ist fachlich derselbe Blick über eine andere
Adresse. Ein eigener Ereignistyp hätte den Katalog verlängert, ohne mehr zu
sagen; der Kontext unterscheidet die beiden Wege trotzdem. **Unsicher:** ob
die Datenschutzprüfung den Ausdruck lieber als eigenes Ereignis („Dokument
ausgegeben") sähe — dann wäre er in einem Audit-Report leichter zu zählen.

**Keine Wortmarke auf dem Zettel:** `marke/README.md` regelt das bereits und
ist dafür die einzige Quelle — die Druckregeln blenden die Kopfzeile aus, und
die Marke auf Papier kommt innerhalb der Anwendung erst mit ABR-000. Das ist
keine Annahme, sondern eine bestehende Festlegung.

**Verankerung.** `public.list_patient_appointment_slip()` in
`supabase/migrations/20260912170000_appointment_slip.sql` (Kopfkommentar und
Funktion tragen die Kennung, Spaltenliste und Auditeintrag sind die Grenze);
`src/features/appointments/AppointmentSlipPage.tsx`. Tests in
`supabase/tests/appointment-slip.test.ts` (Inhalt, Auditeintrag, Rollen) und
`src/features/appointments/AppointmentSlipPage.test.tsx`.

**Änderungspfad.** Mehr oder weniger Inhalt: die Spaltenliste der Funktion und
die Darstellung; Aufwand `klein`. Versand nach B15: ein Anbieter mit Prüfung
nach §3.5, eine Einwilligung je Patient:in und ein eigener Schreibpfad mit
eigenem Auditereignis; Aufwand `groß` und ein eigenes Epic. Eigenes
Auditereignis: ein Eintrag im Katalog (Constraint, `AUDIT_ACTIONS`, Beschriftung)
und ein geänderter `insert`; Aufwand `klein`.

---

### ANN-040 — Mitteilungsvermerk: vier Wege, kein Versand, verfällt mit jeder Terminänderung

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | CAL-012 (Auftrag von Jannes, 2026-09-12, nach dem Vorbild von iPrax); `OPEN_DECISIONS.md` B15; ADR-010 |
| Status | **offen** — getroffen am 2026-09-12, Bestätigung durch Jannes und die Datenschutzprüfung steht aus |
| Wiedervorlage | Datenschutzprüfung (B2); der Weg `email` zusätzlich mit B15 und PAT-006 |

**Annahme.** Ein Termin trägt einen Vermerk, **ob** und **auf welchem Weg** er
der Patient:in mitgeteilt wurde. Vier Festlegungen:

1. ~~**Die Anwendung verschickt weiterhin nichts.** Der Vermerk beschreibt
   einen Vorgang **außerhalb** der Anwendung. Auch `email` heißt „die Praxis
   hat die Nachricht selbst geschrieben" — es gibt keinen Versandknopf, keinen
   Dienstleister und keine Einwilligung (§3.5, B15).~~
   **Geändert am 2026-09-12 (CAL-013, ANN-041).** Jannes hat den Versand von
   Terminmails ausdrücklich vorgesehen. Der Weg `email` entsteht seitdem auch
   aus der Anwendung heraus — als Übergabe eines fertigen Entwurfs an das
   Mailprogramm der Praxis. **Unverändert bleibt:** Es gibt keinen
   Dienstleister und keinen automatischen Versand; die Anwendung sieht die
   Übergabe, nicht den Versand. Der Vermerk bleibt damit, was er war — eine
   Aussage der Praxis darüber, was sie getan hat. Die Punkte 2 bis 4 gelten
   unverändert.
2. **Vier Wege:** persönlich gesagt, telefonisch mitgeteilt, Terminzettel
   ausgehändigt, per E-Mail mitgeteilt. **`sms` und `messenger` fehlen
   bewusst** — Messenger ist nach B15 ausgeschlossen, SMS gibt es nicht, und
   ein Wert ohne Schreiber wäre Vorbau (ADR-014).
3. **Der Vermerk verfällt mit jeder Terminänderung.** Gültig ist er nur,
   solange `notified_at >= appointments.updated_at`. Gelöscht wird dabei
   nichts: Der alte Vermerk bleibt als Historie stehen und wird nur ungültig.
4. **Der Vorgang ist auditiert** (`appointment.notified`), mit den Wegen im
   Kontext und ohne jeden Inhalt.

**Begründung.** Zu 1 und 2: Die Wahl des Kanals bleibt Sache der Praxis. Die
Anwendung **bewertet** sie nicht und **ermöglicht** sie nicht — sie hält fest,
was geschehen ist. Genau deshalb ist der Vermerk kein neuer Verarbeitungsweg
im Sinne von §3.5: Es entsteht kein Empfänger, der vorher keiner war.
**Unsicher und deshalb im Prüfpaket:** ob die Datenschutzprüfung den Weg
`email` in der Auswahl sehen will. Ein Termin per unverschlüsselter E-Mail ist
eine Offenlegung von Gesundheitsdaten; die Auswahl macht sie sichtbar und
nachvollziehbar, könnte aber auch als Ermutigung gelesen werden. Die
Gegenposition wäre, `email` zu streichen und die Praxis auf Telefon und Zettel
zu verweisen.

Zu 3: Ein Vermerk, der eine verschobene Zeit überlebt, ist schlimmer als
keiner — er behauptet, die Patient:in wisse Bescheid. Der Vergleich gegen
`updated_at` löst das ohne jede Pflege: Es gibt keine Frist, keinen
Aufräumlauf und keinen Weg, den Verfall zu vergessen. Die Kehrseite: „noch nie
mitgeteilt" und „seit der Mitteilung geändert" sehen gleich aus. Das ist
beabsichtigt — der Handlungsbedarf ist derselbe.

Zu 4: Der Vermerk sagt aus, dass Termindaten die Praxis verlassen haben. Die
Tabelle trägt zwar Zeitpunkt und Person, aber die Rücknahme entfernt eine
Zeile; ohne Auditeintrag ließe sich das nicht nachvollziehen. Ein Ereignis
statt zwei, weil immer die vollständige Menge gesetzt wird: Eine leere Liste
im Kontext **ist** die Rücknahme.

**Verankerung.** Tabelle `public.appointment_notifications`,
`app.appointment_notification_channels()`,
`public.set_appointment_notification()` und
`public.add_appointment_notification()` in
`supabase/migrations/20260912180000_appointment_notification.sql`
(Kopfkommentar und Tabellenkommentar tragen die Kennung);
`notificationChannelSchema` in `src/features/appointments/api.ts`;
`MitteilungVermerken.tsx` und `Mitteilungszeichen.tsx`. Tests in
`supabase/tests/appointment-notification.test.ts` (Verfall, Wertebereich,
Audit, Rollen) und
`tests/e2e/authenticated/appointment-notification.spec.ts`.

**Änderungspfad.** Weg streichen oder ergänzen: ein Wert in der
Check-Constraint, im Zod-Schema und in der Beschriftungstabelle — Aufwand
`klein`; bereits gesetzte Vermerke des gestrichenen Weges müssten einmalig
entfernt werden. Verfallsregel lockern (etwa nur bei Zeitänderungen): die
Bedingung `notified_at >= a.updated_at` durch einen Vergleich gegen einen
eigenen Zeitstempel ersetzen, den nur `update_appointment` bei Zeitänderungen
bumpt — Aufwand `mittel`. Echter Versand nach B15: ein Anbieter mit Prüfung
nach §3.5, eine Einwilligung je Patient:in und ein eigener Schreibpfad mit
eigenem Auditereignis — Aufwand `groß` und ein eigenes Epic; dieser Vermerk
wäre dann sein Ergebnis, nicht sein Ersatz.

---

### ANN-041 — Termin-E-Mail als Handoff ins eigene Mailprogramm

| | |
|---|---|
| Kategorie | Datenschutz |
| Herkunft | CAL-013 (Auftrag von Jannes, 2026-09-12); `OPEN_DECISIONS.md` B15; ADR-019 und ANN-018 (Handoff-Muster); `PROJECT_PRINCIPLES.md` §3.5, §10, §16 |
| Status | **offen** — getroffen am 2026-09-12, Bestätigung durch die Datenschutzprüfung steht aus |
| Wiedervorlage | Datenschutzprüfung (B2); der dokumentierte Wunsch je Patient:in mit PAT-006 |

**Vorgeschichte.** Jannes hat am 2026-09-12 geschrieben: „Ich widerspreche
möglicherweise früherer Planung, aber es ist ausdrücklich vorgesehen, dass die
Praxis E-Mails versenden wird, welche die Termine beinhaltet." Das ändert
seine eigene vorläufige Entscheidung zu B15 in **einem** Punkt — dazu B15.

**Annahme.** Die Anwendung bietet an, die Termine einer Patient:in per E-Mail
zu übermitteln. Sechs Festlegungen:

1. **Handoff, kein Versand.** Die Anwendung baut eine `mailto:`-Adresse und
   übergibt sie dem Mailprogramm der Praxis. Sie öffnet keine Verbindung,
   spricht mit keinem Mailserver und speichert keine Nachricht. Gesendet wird
   im Postfach der Praxis, von Hand.
2. **Nur auf Aktion, nie automatisch.** Der Entwurf entsteht im Klickhandler,
   wird nirgends gespeichert und nie von allein geöffnet.
3. **Inhalt wie auf dem Zettel.** Datum, Uhrzeit, Ort, behandelnde Person —
   genau die Felder von `list_patient_appointment_slip`. Kein Status, keine
   Verordnung, keine Diagnose, keine Adresse. Der **Betreff** nennt weder
   Praxis noch Fach: „Ihre nächsten Termine".
4. **Das Risiko steht an der Stelle der Entscheidung.** Vor der Übergabe zeigt
   die Oberfläche den vollständigen Text, die Empfängeradresse und den Satz,
   dass eine E-Mail unterwegs nicht verschlüsselt ist und der Weg den
   ausdrücklichen Wunsch der Patient:in voraussetzt.
5. **Vermerkt wird die Übergabe, nicht der Versand** — und zwar **vor** ihr.
   Scheitert der Vermerk, öffnet sich keine E-Mail. Die Anwendung kann nicht
   sehen, ob die Nachricht abgeschickt wurde; der Text sagt das, und der
   Vermerk lässt sich am Termin zurücknehmen (CAL-012).
6. **Längengrenze statt stillem Abschneiden.** `mailto:` hat keine
   standardisierte Höchstlänge; die Praxisgrenze liegt beim Weg über die
   Kommandozeile des Betriebssystems. Der Entwurf bleibt unter 1800 Zeichen,
   kürzt dafür von hinten und benennt, welche Termine nicht mitgehen. Vermerkt
   wird nur, was tatsächlich im Text steht.

**Begründung.**

Zu 1 und 2: §3.5 verlangt vor der Freischaltung eines **Dienstleisters mit
Zugang zu Patientendaten** eine dokumentierte Prüfung (AVV, §203 StGB,
Verschlüsselung, Zugriffskontrolle, Retention, Unterauftragnehmer). Ein
Handoff schaltet keinen frei: Die Nachricht entsteht im Postfach, das die
Praxis ohnehin betreibt, und geht denselben Weg wie jede andere E-Mail der
Praxis. Es entsteht kein Empfänger, der vorher keiner war. Das ist genau die
Konstruktion, die ADR-019 für die Navigation gewählt hat (ANN-018: „der
Handoff übermittelt nichts aus der Anwendung … Bedingung: nur auf Aktion, nie
automatisch"). **Das Postfach der Praxis selbst bleibt prüfpflichtig** — es
ist nur nichts, was diese Anwendung freischaltet, sondern eine
Organisationsfrage für die DSFA (ADR-007, B2).

Zu 3 und 4: Eine Terminliste ist ein Gesundheitsdatum — sie sagt, dass jemand
in Behandlung ist. Die DSK-Orientierungshilfe „Maßnahmen zum Schutz
personenbezogener Daten bei der Übermittlung per E-Mail" (Stand 16.06.2021)
verlangt für Daten mit hohem Risiko, und dazu zählen Gesundheitsdaten,
Ende-zu-Ende-Verschlüsselung **und** qualifizierte Transportverschlüsselung.
Anerkannt ist zugleich der Weg über den **ausdrücklichen Wunsch der
betroffenen Person nach Aufklärung über das Risiko** — die Empfehlungen der
Landesdatenschutzbehörden für Arztpraxen und die „Hinweise und Empfehlungen
zur ärztlichen Schweigepflicht, Datenschutz und Datenverarbeitung in der
Arztpraxis" (Bundesärztekammer/KBV) beschreiben ihn so. **Unsicher und
deshalb ausdrücklich im Prüfpaket:** Dieselben Quellen sagen, dass die Pflicht
zu einem angemessenen Schutzniveau nicht durch eine Vereinbarung zwischen
Praxis und Patient:in **abgesenkt** werden kann. Die Antwort dieser Annahme
ist deshalb keine Einwilligung, die alles erlaubt, sondern
**Datenminimierung**: Was verschickt wird, ist die organisatorische
Mindestangabe, und der Betreff verrät nichts. Empfänger ist ausschließlich die
betroffene Person selbst; gegenüber ihr gibt es kein Offenbaren im Sinne von
§203 StGB.

Zu 5: Eine Anwendung, die den Versand behauptet, den sie nicht beobachten
kann, wäre unehrlich — und der Vermerk wäre wertlos, sobald er einmal falsch
war. Vor der Übergabe zu vermerken ist die restriktivere Reihenfolge (§16):
Der Fehlerfall ist „vermerkt, aber nicht gesendet", und der ist sichtbar und
rücknehmbar; die Umkehrung wäre „gesendet, aber nicht vermerkt" und bliebe
unbemerkt. Dieselbe Reihenfolge gilt seit CAL-012 beim Druck.

Zu 6: Ein Mailprogramm, das eine zu lange Adresse abschneidet, meldet das
nicht. Die Patient:in bekäme weniger Termine, als die Praxis vermerkt hat —
ein Vermerk, der eine Mitteilung behauptet, die nicht stattgefunden hat.

**Was diese Annahme ausdrücklich NICHT tut.** Sie führt keine automatische
Terminerinnerung ein, keinen Versanddienstleister, keinen SMS- oder
Messenger-Weg und keine Massenaussendung. Ein Klick ergibt eine Nachricht an
eine Person.

**Was offen bleibt.** Der **dokumentierte Wunsch je Patient:in**. Heute steht
die Bedingung als Satz neben dem Knopf, und die Auslösung ist auditiert
(`appointment.notified` mit dem Weg `email`) — festgehalten ist damit, **dass**
und **wann** übergeben wurde, nicht **dass die Patient:in es gewünscht hat**.
Ein eigenes Kennzeichen dafür gehört zu PAT-006 (Einwilligungen) und wäre
hier Vorbau (ADR-014). Die Datenschutzprüfung entscheidet, ob der Satz reicht
oder ein Kennzeichen her muss.

**Verankerung.** `src/features/appointments/terminmail.ts` — Kopfkommentar und
Konstanten tragen die Kennung; dort stehen Inhalt, Betreff, Längengrenze und
die Übergabe. Oberfläche in
`src/features/appointments/TermineMailen.tsx`, eingebunden in
`AppointmentSlipPage.tsx`. Tests in
`src/features/appointments/terminmail.test.ts` (Inhalt, Kodierung,
Kopfzeilen-Injektion, Kürzung),
`src/features/appointments/TermineMailen.test.tsx` (Reihenfolge von Vermerk
und Übergabe, Abbruch, fehlende Adresse) und
`tests/e2e/authenticated/appointment-notification.spec.ts`.

**Änderungspfad.** Inhalt oder Betreff ändern: `terminMailText` und
`MAIL_BETREFF` — Aufwand `klein`. Den Weg ganz zurücknehmen: `TermineMailen`
aus `AppointmentSlipPage.tsx` entfernen, die beiden Dateien löschen; der Weg
`email` bleibt als Vermerk von Hand bestehen — Aufwand `klein`, keine
Datenmigration. Einen dokumentierten Wunsch je Patient:in verlangen: ein
Kennzeichen in den Kontaktdaten, gesetzt über `update_patient`, plus die
Bedingung in `TermineMailen` — Aufwand `mittel`, gehört zu PAT-006. Echter
Versand aus der Anwendung (Dienstleister, Warteschlange, Zustellstatus):
Aufwand `groß`, eigenes Epic, setzt B15 und eine Prüfung nach §3.5 voraus.
---

### ANN-042 — Wann eine Verordnung ausgeschöpft ist

| | |
|---|---|
| Kategorie | Praxisprozess |
| Herkunft | AKTE-002 (Auftrag von Jannes, 2026-09-12); ANN-012 (genutzte Menge von Hand); ANN-038 (verplant ist nicht genutzt); `PROJECT_PRINCIPLES.md` §13, §16 |
| Status | **offen** — getroffen am 2026-09-12 |
| Wiedervorlage | Jannes nach den ersten Praxiswochen; erneut mit ABR-002, sobald die genutzte Menge aus der Abrechnung kommt |

**Anlass.** Die Akte teilt die Verordnungen seit AKTE-002 in „laufend" und
„ausgeschöpft": Die laufenden stehen ausführlich oben, die ausgeschöpften
kompakt in einer aufklappbaren Zeile darunter, und „Terminserie anlegen" steht
nur an einer Verordnung, an der sich noch etwas planen lässt. Dafür braucht es
eine Regel, wann eine Verordnung erledigt ist — und das Datenmodell kennt
**kein** Ablaufdatum.

**Annahme.** Eine Verordnung gilt als **ausgeschöpft**, sobald ihre genutzten
Leistungseinheiten die verordneten erreichen (`used >= prescribed`, summiert
über die Positionen). Solange Einheiten offen sind, gilt sie als laufend — und
zerfällt dort in zwei Zustände:

- **offen** — es lässt sich noch etwas planen (`remaining > 0`).
- **vollständig verplant** — es sind Einheiten offen, aber für jede steht
  bereits ein Termin. Hier ist nichts mehr zu planen, wohl aber zu behandeln.

Ein **Ablauf nach Zeit** kommt nicht vor: Weder das Ausstellungsdatum noch eine
Frist entscheidet über den Zustand.

**Begründung.** Die Praxis rechnet privat ab. Die Fristen des
Heilmittelkatalogs (Behandlungsbeginn binnen 28 Tagen, Unterbrechung von
höchstens 14 Tagen) sind Regeln des GKV-Systems und gelten für eine
Privatverordnung nicht unmittelbar; welche Frist ein privater Kostenträger
ansetzt, steht in seinem Tarif und nicht in der Verordnung. Eine Frist zu
erfinden, hieße eine Verordnung als erledigt zu zeigen, die es nicht ist —
und genau davor warnt §13: Die Anwendung darf nicht behaupten, was sie nicht
weiß. Die genutzte Menge dagegen ist eine Zahl, die in der Akte steht und die
die Praxis selbst pflegt (ANN-012).

Die Zahl ist bewusst **die der Einheiten** und nicht die der Termine: Ein
Termin kann abgesagt werden und gibt seinen Platz zurück; eine genutzte
Einheit bleibt genutzt (ANN-038). Deshalb entscheidet über „ausgeschöpft"
allein `used`, über „noch planbar" dagegen der größere Wert aus genutzt und
verplant.

**Was diese Annahme ausdrücklich NICHT tut.** Sie verbirgt nichts: Eine
ausgeschöpfte Verordnung bleibt vollständig in der Akte, mit allen Zahlen und
allen Angaben, und lässt sich weiterhin bearbeiten — ein Tippfehler in einer
alten Verordnung gehört behoben. Sie ändert auch keine Zahl; sie ordnet nur,
was oben steht und welche Aktion angeboten wird.

**Verankerung.** `src/features/prescriptions/verordnungen.ts`,
`verordnungszustand()` — die eine Stelle, an der die Regel steht; der
Kopfkommentar trägt die Kennung. Tests in
`src/features/prescriptions/PatientPrescriptionsPage.test.tsx` (alle drei
Zustände und die Aktionen, die daran hängen).

**Änderungspfad.** Die Schwelle ändern (etwa „ausgeschöpft erst, wenn auch
jeder Termin stattgefunden hat"): `verordnungszustand()` — Aufwand `klein`,
keine Datenmigration. Einen Ablauf nach Zeit ergänzen: ein Feld
`valid_until` an `prescriptions`, im Formular und in `create/update_prescription`
gepflegt, dazu die Regel hier — Aufwand `mittel`, mit Migration. Die genutzte
Menge automatisch aus der Abrechnung zu führen, ist ABR-002 und ändert an
dieser Regel nichts.
