# Offene Entscheidungen

Zuletzt aktualisiert: 2026-09-08 (E12, E13 ergänzt) · Struktur 2.1

Dieses Dokument hält fest, **was noch nicht entschieden ist**, warum es offen
ist und was davon abhängt. Es trifft keine Entscheidungen und ändert
`PROJECT_PRINCIPLES.md` nicht. Die Termine, bis wann ein Punkt entschieden sein
muss, stehen in `docs/development/ROADMAP.md`, Spur B.

**Stand:** Alle Architektur-Grundentscheidungen sind getroffen (ADR-001
bis ADR-016). Am **2026-09-08** hat Jannes die Entscheidungsrunde vom Vortag
**vollständig und ohne Ausnahme** nach der jeweiligen Empfehlung entschieden —
20 Punkte, siehe Historie und die Abschnitte unten. Damit ist **kein fachlicher
Punkt mehr blockierend**.

Was jetzt noch offen ist, ist von zweierlei Art:

- **Externe Bestätigungen** der vorläufigen Festlegungen: die
  MDR-/AI-Act-Prüfung (B1), Schwellwertprüfung und DSFA (B2), die
  Fristen-Validierung (B3), die steuerliche Validierung (B4) und die
  Teilfragen von B6, B7, B9 und C6, die mit B1 beziehungsweise B2 gehen. Sie
  blockieren den **Produktivstart** (M3), nicht die Arbeit.
- **Echte Restfragen:** die Auskunft des Lizenzgebers (B8 — keine
  Entscheidung), der PDF-Weg der Rechnung (B14, bewusst auf ABR-EPIC-002a
  vertagt, Tendenz vermerkt), die Anbieterwahl der KI (C6, Etappe 10), das
  Verfahren der Patientenidentität (B5, mit dem Portal), die Ausgestaltung des
  Terminstatus-Automaten (ADR-018) und die Anbieterprüfung Supabase (A2).

Am **2026-09-08** sind zwei Produktentscheidungen von Jannes dazugekommen und
verbindlich geworden — das Terminfenster (`PROJECT_PRINCIPLES.md` §8.1) und die
Sprachdokumentation (§6.3). Beide werfen Anschlussfragen auf, die Jannes
ausdrücklich **nicht** mitentschieden hat; sie stehen als **E12** und **E13**
unten. Keine davon blockiert einen Loop.

Die fünf Rückfragen E-15 bis E-19 hat ## Wie dieses Dokument benutzt wird

Ein offener Punkt blockiert keine Aufgabe. Braucht eine Aufgabe eine
Festlegung, die hier offen ist, wird sie als begründete Annahme in
`ASSUMPTIONS.md` getroffen (`PROJECT_PRINCIPLES.md` §15.1). Der Punkt bleibt
hier offen und verweist auf die `ANN`-Kennung, bis er entschieden ist.

1. Ein Punkt wird besprochen und entschieden.
2. Die Entscheidung wird als ADR unter `docs/adr/` festgehalten, wenn sie
   teuer rückgängig zu machen wäre (`docs/adr/README.md`); sonst genügt der
   Vermerk hier mit Datum.
3. Der Punkt wird in der Übersicht auf `entschieden` gesetzt und verweist auf
   das ADR oder den Vermerk.
4. Betrifft die Entscheidung `PROJECT_PRINCIPLES.md`, wird das Dokument in
   einem eigenen Commit mit neuer Version nachgezogen (§21).

### Vorläufig entschieden — Jannes entscheidet, extern wird bestätigt

Mehrere Punkte warten in Spur B auf eine externe Stelle: Steuerberatung (B4,
B11), Datenschutzberatung (B2, B3), regulatorische Prüfung (B1, B10). **Warten
ist dafür nicht nötig.** Jannes ist der Verantwortliche nach Art. 4 Nr. 7
DSGVO und derjenige, der die Zweckbestimmung im Sinne der MDR festlegt; die
externen Stellen prüfen seine Festlegung, sie treffen sie nicht für ihn. Er
kann jeden dieser Punkte **vorläufig selbst entscheiden**, damit die Arbeit
weiterläuft und die Anfrage an die externe Stelle eine konkrete Vorlage hat
statt einer offenen Frage — erfahrungsgemäß auch die schnellere Anfrage.

Dafür gibt es den Status **`vorläufig entschieden (Jannes)`** mit Datum:

- **Für das Bauen zählt er wie `entschieden`.** Ein Loop darf darauf aufsetzen;
  der Punkt blockiert nichts mehr.
- **Für die Freigabe zählt er wie `offen`.** Er ersetzt keine externe
  Bestätigung. Das Go-live-Gate (M3) verlangt ausdrücklich, dass kein
  Datenschutz- oder Rechtspunkt mehr auf `offen` **oder** auf `vorläufig
  entschieden` steht.
- **Der Eintrag nennt den Preis der Rücknahme.** Was zu ändern wäre, wenn die
  externe Stelle widerspricht, und mit welchem Aufwand — nach demselben Maß wie
  der Änderungspfad im Annahmenregister (`klein`, `mittel`, `groß`). Wäre er
  `groß`, ist das das Signal, doch erst die externe Antwort abzuwarten.
- Wird die Festlegung im Code verankert, gilt weiter §15.1: ein Eintrag im
  Annahmenregister mit Kennung an genau einer Stelle. Bleibt sie rein
  organisatorisch, genügt der Vermerk hier.

**Drei Dinge lassen sich so nicht entscheiden**, weil sie keine Entscheidungen
sind oder weil eine MUSS-Anforderung sie bindet:

1. **B8 (Lizenzen)** ist eine Tatsachenfrage über einen Dritten: ob der
   DIGOTOR-Bogen digital lizenziert ist, entscheidet der Lizenzgeber, nicht
   die Praxis. Entscheidbar ist nur der Rückfall — bis zur Klärung ausschließlich
   lizenzfreie Instrumente (FRB-001, FRB-002).
2. **Die externe MDR-Prüfung vor Produktivstart** ist eine MUSS-Anforderung in
   `PROJECT_PRINCIPLES.md` §17 und ADR-006 Punkt 7. Der **Inhalt** der
   Zweckbestimmung ist Jannes' Festlegung und darf vorläufig getroffen werden;
   die **Prüfung** selbst entfällt dadurch nicht. Sie zu streichen wäre eine
   Prinzipienänderung nach §21, keine Annahme.
3. **Die sieben Vorbedingungen aus ADR-007 Punkt 5** sind Dokumente, die
   vorliegen müssen — Verzeichnis, TOM, Löschkonzept, Subprozessoren,
   Datenschutzinformationen, Betroffenenrechte, Breach-Prozess. Ihr Inhalt ist
   vorläufig entscheidbar, ihr Vorliegen nicht ersetzbar.

Dringlichkeit: **P0** vor dem technischen Setup (alle erledigt) · **P1** vor
dem ersten fachlichen Datenmodell des Bereichs · **P2** vor dem betreffenden
Feature.

---

## Übersicht — alle Punkte

| Punkt | Thema                                                        | Status                                                        | Wo                                                                                                            |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A1    | Offline-Fähigkeit                                            | entschieden 2026-08-28                                        | [ADR-001](../adr/ADR-001-online-first-limited-offline.md); Mechanismus offen, siehe F                        |
| A2    | Hosting, Datenstandort, Provider                             | entschieden 2026-08-28; **Anbieterprüfung offen**             | [ADR-002](../adr/ADR-002-hosting-data-residency.md), [ADR-015](../adr/ADR-015-initial-technical-stack.md); Roadmap OPS-001 |
| A3    | `organization_id` / `location_id`                            | entschieden 2026-08-28                                        | [ADR-003](../adr/ADR-003-organization-location-model.md)                                                      |
| A4    | Berechtigungsmodell                                          | entschieden 2026-08-28                                        | [ADR-004](../adr/ADR-004-authorization-model.md)                                                              |
| B1    | MDR / EU AI Act                                              | Zweckbestimmung **vorläufig entschieden 2026-09-08**; **externe Prüfung offen** | [ADR-006](../adr/ADR-006-medical-device-boundary.md); Roadmap G13, Feb 2027                                   |
| B2    | DSFA, DSB, Verzeichnis, TOM, Meldeprozess                    | Prozess entschieden; DSB **vorläufig entschieden 2026-09-08** (ja); Schwellwertprüfung offen | [ADR-007](../adr/ADR-007-data-protection-impact-assessment.md); Roadmap G12                                   |
| B3    | Aufbewahrung und Löschung                                    | entschieden; **Fristen-Validierung offen**, Umsetzung LOE     | [ADR-008](../adr/ADR-008-data-retention-and-deletion.md), ANN-001, ANN-002; Roadmap LOE-EPIC-001              |
| B4    | Abrechnungsmodell                                            | entschieden; vier Festlegungen **vorläufig entschieden 2026-09-08**; **steuerliche Validierung offen** | [ADR-009](../adr/ADR-009-private-billing-model.md); Roadmap G13, Nov 2026                          |
| B5    | Patientenidentität, Vertretung                               | Rahmen **vorläufig entschieden 2026-09-08**; Verfahren **offen** (P1 für das Portal) | unten; vor Etappe 4                                                                                           |
| B6    | Beschäftigtendaten: Touren, Leistungskontrolle               | **vorläufig entschieden 2026-09-08: nein**                    | unten; vor ZK-001, TOUR-001; ANN-004 überbrückt das Audit                                                     |
| B7    | Adressdaten an den Kartendienst                              | Handoff nicht blockiert; Karte und Fahrzeiten: **Weg C** — PTV Developer als Kandidat (ADR-019 Fassung 2, 2026-09-08); produktive Freigabe am Gate **offen** | unten; ADR-019, `providerpruefung-kartendienst.md` (Roadmap G12)                                |
| B8    | Lizenzen für Fragebögen und PROMs                            | Auskunft des Lizenzgebers **offen**; Rückfall entschieden 2026-09-08 | unten; vor FRB-003                                                                                            |
| B9    | Betreuung ohne und nach Heilbehandlung (Personal Training)   | **vollständig vorläufig entschieden**: ein Unternehmen (2026-09-07), die sechs übrigen Fragen (2026-09-08) | unten; vor Etappe 8; Steuerteil mit B4                                              |
| B10   | Automatisierte Progression: MDR-Grenze                       | **vorläufig entschieden 2026-09-08**; Bestätigung mit B1      | unten; vor Etappe 9                                                                                           |
| B11   | Paketpreise, Vorauszahlung, Anreize                          | **vorläufig entschieden 2026-09-08**: vorerst nicht anbieten  | unten; vor Etappe 8                                                                                           |
| B12   | Stichtag der Umstellung und Rechnungsnummernkreis            | **erledigt 2026-09-06**: kein Altsystem; Nummernformat → B4   | unten                                                                                                         |
| B13   | E-Mail-Versand aus der Plattform (Einladung, Passwort)       | **entschieden 2026-09-06** durch Jannes (Option a)            | unten; Roadmap G2, G3                                                                                         |
| B14   | PDF-Erzeugung für Rechnungen und Tagesplan                   | Druckansichten **entschieden 2026-09-06**; Rechnungs-PDF **offen** (P1 für ABR-EPIC-002b) | unten; Roadmap ABR-EPIC-002a, Nov 2026                                                            |
| B15   | Terminerinnerung und Online-Terminbuchung: Kanal, Anbieter   | **vorläufig entschieden 2026-09-08**: keine automatische Erinnerung | unten                                                                                                         |
| C1    | Leistungsziffern und Office                                  | entschieden 2026-09-05 durch Jannes                           | `PROJECT_PRINCIPLES.md` 0.4 §4.4; Umfang des Nachweises ANN-006                                               |
| C2    | Klinische Inhalte in organisatorischer Kommunikation         | entschieden 2026-09-05 durch Jannes                           | `PROJECT_PRINCIPLES.md` 0.4 §10                                                                               |
| C3    | Fail-closed gegen Patientensicherheit, Break Glass           | entschieden 2026-08-28                                        | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md)                                                      |
| C4    | Auditlog als Kompensation                                    | entschieden 2026-08-28                                        | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md); Betrieb Roadmap G6                                  |
| C5    | Provider-Oberflächen, Admin-Trennung                         | entschieden 2026-08-28                                        | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md)                                                      |
| C6    | AI Privacy Gateway: Schutzumfang und Provider                | Zeitpunkt entschieden; Schutzumfang **vorläufig entschieden 2026-09-08**; Provider offen | [ADR-005](../adr/ADR-005-provider-independent-ai.md); unten; vor Etappe 10                                    |
| C7    | Sprachliche Trennung LLM / deterministische Regeln in §6, §7.1 | architektonisch entschieden; Wortlaut bei nächster Prinzipienversion | [ADR-005](../adr/ADR-005-provider-independent-ai.md); nicht planungsrelevant                             |
| C8    | „Nicht verbauen" gegen „nicht vorbauen"                      | entschieden 2026-08-28                                        | [ADR-014](../adr/ADR-014-foundational-data-model.md)                                                          |
| D     | „finalisiert", „nachvollziehbar"                             | entschieden 2026-09-01                                        | [ADR-016](../adr/ADR-016-clinical-documentation-record.md)                                                    |
| D     | „bestätigt" — Terminstatus-Automat                           | **Umfang entschieden 2026-09-05; ADR-018 ausstehend**         | unten; Roadmap CAL-EPIC-003, Okt 2026; bis dahin ANN-005                                                      |
| D     | übrige Begriffe                                              | erledigt                                                      | „auditierbar" → C4 · „organisatorische Patientenkommunikation" → C2 · „Behandlungsnachweis" → C1, ANN-006 · „Praxisinhaber vs. Admin" → C5 · „technisch getrennt" → ADR-002, Umgebungen in OPS-001 |
| D     | Normativität und Nachweis                                    | Normativität erledigt (0.2, §0); **Nachweistabelle offen**    | Roadmap G12                                                                                                   |
| E1    | Betreibbarkeit bei Bus-Faktor 1                              | entschieden 2026-08-28                                        | [ADR-012](../adr/ADR-012-backup-and-business-continuity.md); Dokumentation Roadmap G7                         |
| E2    | Ausfallkonzept — zugleich Rückfallplan der Eröffnung         | Kern **vorläufig entschieden 2026-09-08**; Ausarbeitung Jan 2027 | unten; Roadmap G10 und H4, Jan 2027                                                                           |
| E3    | Backup, RPO/RTO, Restore-Test                                | entschieden 2026-08-28                                        | [ADR-012](../adr/ADR-012-backup-and-business-continuity.md); Roadmap G7                                       |
| E4    | Produktionszugriff                                           | entschieden 2026-08-28                                        | [ADR-010](../adr/ADR-010-audit-and-privileged-access.md)                                                      |
| E5    | Produktions-Logs                                             | entschieden 2026-08-28                                        | [ADR-011](../adr/ADR-011-logging-and-observability.md); Roadmap G8                                            |
| E6    | Synthetische Testdaten                                       | erledigt: der Seed ist der Generator                          | `supabase/seed.sql`; Erweiterung im Loop, der sie braucht                                                     |
| E7    | CI-Gates, Branch Protection                                  | entschieden 2026-08-28                                        | [ADR-013](../adr/ADR-013-ci-cd-and-release-governance.md); Freigabeprozess Roadmap G5                         |
| E8    | Dateiablage                                                  | **in Arbeit: ADR-017**, beauftragt 2026-09-05                 | Roadmap G1, Sep 2026                                                                                          |
| E9    | Dokument-Governance                                          | erledigt mit Version 0.2 (2026-08-28)                         | `PROJECT_PRINCIPLES.md` §21                                                                                   |
| E10   | Wer schreibt Mitarbeiterdaten                                | **entschieden 2026-09-08** durch Jannes                       | unten; vor STAFF-EPIC-002; bis dahin `owner`                                                                  |
| E11   | Wer gilt als behandelnde Person                              | erledigt sich mit STAFF-EPIC-002 (Konten in der Anwendung, entschieden 2026-09-05) | unten                                                                                    |
| E12   | Terminfenster: Abweichung, Fahrpuffer, Warnung oder Sperre   | Kernregel **entschieden 2026-09-08** (§8.1); vier Anschlussfragen **offen**    | unten; `PROJECT_PRINCIPLES.md` §8.1; vor CAL-010a/CAL-010b (Roadmap CAL-EPIC-003b)                  |
| E13   | Sprachdokumentation: Anbieter, Architektur, Audio, Frist     | Anforderung **entschieden 2026-09-08** (§6.3); Umsetzung **offen**             | unten; §6.3, ADR-005 Punkt 9, ADR-006 Punkt 8, ADR-016 Punkt 10; Anbieter mit C6         |

---

## Offene Punkte im Einzelnen

### B1 — MDR / EU AI Act: die Zweckbestimmung

| | |
|---|---|
| Dringlichkeit | P1 — Text vor der Anfrage (Sep), Prüfergebnis vor M3 |
| Bezug | §17; ADR-006 Punkt 7 |

**Frage:** Mit welchem Wortlaut beschreibt die Praxis die Zweckbestimmung der
Software? Die externe Prüfung braucht einen Text, den sie prüfen kann.

**Vorläufig entschieden am 2026-09-08 durch Jannes** — dieser Wortlaut geht in
die Anfrage:

> Die Software dient der Organisation, Dokumentation und Abrechnung
> physiotherapeutischer Leistungen einer privat abrechnenden Praxis. Sie
> erfasst, speichert, strukturiert und stellt Gesundheitsinformationen dar und
> führt transparente mathematische Berechnungen validierter Instrumente durch.
>
> Sie ist **nicht** dazu bestimmt, diagnostische oder therapeutische
> Entscheidungen zu treffen, Therapieempfehlungen zu geben, klinische
> Risikoklassifikationen oder Differentialdiagnosen zu erzeugen oder klinische
> Entscheidungen zu automatisieren. Eingesetzte generative KI dient der
> Dokumentation, sprachlichen Umformung, Zusammenfassung und administrativen
> Assistenz und fügt keine klinische Interpretation hinzu.
>
> Alle klinischen Entscheidungen trifft die behandelnde Therapeutin.

Der zweite Absatz benennt die Ausschlüsse positiv, statt sie offenzulassen —
daran entscheidet sich die MDR-Einordnung.

**Weiterhin offen und nicht ersetzbar:** die externe Prüfung selbst (§17,
ADR-006 Punkt 7). Sie prüft diesen Text; sie entfällt nicht dadurch, dass er
vorliegt.

**Rücknahme:** heute `klein` (ein Dokument). Zieht die Prüfung die Abgrenzung
anders, betrifft das Features, nicht Text — deshalb jetzt festlegen und prüfen
lassen, nicht umgekehrt.

**Blockiert:** nichts mehr für die Anfrage. Weiterhin gesperrt bleibt jedes
Feature mit `MDR_REVIEW_REQUIRED` (B10).

### B2 — Datenschutzbeauftragter

| | |
|---|---|
| Dringlichkeit | P1 — mit der Anfrage im September |
| Bezug | §3.7; ADR-007 Punkte 3 und 4 |

**Frage:** ADR-007 Punkt 4 regelt den Fall der gesetzlichen Pflicht. Offen war,
ob **auch ohne** festgestellte Pflicht ein Datenschutzbeauftragter benannt wird.

**Vorläufig entschieden am 2026-09-08 durch Jannes: ja, extern beauftragt** —
unabhängig vom Ergebnis der Schwellwertprüfung.

**Begründung.** Die Pflicht nach Art. 37 Abs. 1 lit. c DSGVO greift bei
**umfangreicher** Verarbeitung besonderer Datenkategorien; Erwägungsgrund 91
und die Leitlinien der Art.-29-Datenschutzgruppe (WP 243) nennen den einzelnen
Arzt ausdrücklich als Gegenbeispiel, §38 Abs. 1 BDSG knüpft zusätzlich an 20
Personen. Eine Pflicht ist danach **unwahrscheinlich** — sicher ist das erst
mit der Schwellwertprüfung. Ausschlaggebend war nicht die Pflicht, sondern die
Lage: Gesundheitsdaten als Kerntätigkeit, selbst entwickelte Software, keine
eigene Datenschutzexpertise und niemand, der gegenliest. Genau diese
Kombination ist der Grund, warum die Punkte hier überhaupt allein entschieden
werden.

**Weiterhin offen:** die Schwellwertprüfung selbst und die DSFA (externe
Datenschutzberatung, Anfrage September). Die Auswahl der Person oder Kanzlei
trifft Jannes.

**Rücknahme:** in der Software `klein` (Nennung in den
Datenschutzinformationen); außerhalb ein laufender Vertrag — eine
Kostenentscheidung, keine technische.

### B4 — Steuerliche Validierung: Fragen an die Steuerberatung

| | |
|---|---|
| Dringlichkeit | P1 — als Annahme vor ABR-EPIC-001, bestätigt vor der ersten ausgestellten Rechnung (ABR-EPIC-002a) |
| Bezug | §19; ADR-009 Punkte 5, 6 und 8; GoBD; B9, B11 |

Das Abrechnungsmodell ist entschieden (ADR-009). Offen ist die steuerliche
Validierung; die Liste wurde am 2026-09-06 um die Punkte erweitert, die aus
der Eröffnung ohne Vorgängersystem und aus dem Personal Training folgen. Sie
geht mit der Anfrage B4 im September an die Steuerberatung:

**Vorläufig entschieden am 2026-09-08 durch Jannes** — vier Festlegungen, die
als Vorlage in die Anfrage gehen und die Rechnung in ABR-EPIC-001/002a
bestimmen:

1. **Steuerkennzeichen je Katalogposition** (ADR-009 Punkt 6 verlangt es
   ohnehin): Voreinstellung **befreit nach §4 Nr. 14a UStG** für Heilbehandlung
   auf Verordnung, **steuerpflichtig** für Prävention, Selbstzahler ohne
   Verordnung und Personal Training. Gemischte Fälle: **getrennte Rechnungen**,
   nicht eine Rechnung mit zwei Steuersätzen. Rücknahme `klein`.
2. **Kleinunternehmerregelung nach §19 UStG: in Anspruch nehmen**, solange der
   Personal-Training-Umsatz unter der geltenden Grenze bleibt. Der aufgegebene
   Vorsteuerabzug nützt im Heilbehandlungsteil ohnehin nichts — §15 Abs. 2 Nr. 1
   UStG schließt ihn für steuerfreie Umsätze aus; es bliebe nur der
   Trainingsanteil, dem die gesamte Umsatzsteuer-Mechanik gegenübersteht. Für
   die Software: **ein** Umsatzsteuer-Status, **ein** Hinweistext, keine zwei
   Steuersätze. Rücknahme `mittel` (ein Statuswechsel mitten im Jahr zieht sich
   durch Rechnungsvorlage und Katalog). **Unsicher und ausdrücklich zu fragen:**
   die für 2027 geltende Grenze (§19 wurde zum 01.01.2025 geändert) und ob der
   Gesamtumsatz nach §19 Abs. 3 UStG die befreiten Heilbehandlungsumsätze
   vollständig herausnimmt.
3. **Nummernkreis `RG-JJJJ-NNNN`**, je Kalenderjahr neu bei `0001`, lückenlos,
   Nummer erst bei Ausstellung (ADR-009). §14 Abs. 4 Nr. 4 UStG verlangt eine
   einmalig vergebene fortlaufende Nummer; das Jahrespräfix macht eine Lücke
   sofort sichtbar. Rücknahme `klein` **vor** der ersten Rechnung, danach
   faktisch `groß` — also vor dem 01.07.2027 festzurren.
4. **Belegfristen: die gesetzlichen übernehmen** (§147 AO, §257 HGB) und als
   **eigene Datenklasse** im Retention Schedule führen, getrennt von der
   Patientenakte. Rechnungen folgen der Steuerfrist, klinische Unterlagen der
   Behandlungsfrist — zwei Uhren, nicht eine. Rücknahme `klein`.

**Weiterhin offen:** die steuerliche Validierung dieser vier Punkte. Sie sind
Vorlage, nicht Beratung.

**Vorgabe statt Frage (2026-09-07, B9):** Heilbehandlung und Personal Training
laufen über **ein** Unternehmen. Die Fragen 1 und 2 sind entsprechend als
Festlegung formuliert und nicht mehr ergebnisoffen.

1. **Leistungsarten und Umsatzsteuer:** Welche Katalogpositionen sind nach
   §4 Nr. 14a UStG befreit (Heilbehandlung auf Verordnung), welche nicht
   (Prävention, Selbstzahler ohne Verordnung, Personal Training)? Wie werden
   gemischte Fälle abgerechnet — getrennte Rechnungen oder eine Rechnung mit
   zwei Steuersätzen? Beides fällt in **einem** Unternehmen an, nicht in zwei.
2. **Kleinunternehmerregelung (§19 UStG) im Eröffnungsjahr:** Nimmt die
   Praxis sie für die steuerpflichtigen Umsätze in Anspruch? Das bestimmt den
   Umsatzsteuer-Status in den Praxisstammdaten (ABR-000) und den Hinweistext
   auf der Rechnung. Bitte dabei bestätigen, wie der Gesamtumsatz nach
   §19 Abs. 3 UStG zu bilden ist, wenn die befreiten Heilbehandlungsumsätze
   herausfallen und im Wesentlichen das Personal Training gegen die Grenze
   zählt — und ab wann das die Regelbesteuerung auslöst.
3. **Nummernkreis:** Die Praxis eröffnet am 01.07.2027 ohne Vorgängersystem;
   der Nummernkreis beginnt mit der ersten Rechnung. Welches Format (fortlaufend
   je Jahr, mit Jahrespräfix) und welche Anforderungen an Lückenlosigkeit und
   Dokumentation gelten?
4. **Belegfristen und Belegarten** (B3): Rechnungen, Storno- und
   Korrekturdokumente, Zahlungsbelege, Erstattungsbelege.
5. **Export für die Steuerberatung:** gewünschtes Format (CSV, DATEV) für
   Rechnungen und Zahlungen (`IDEA-PRX-026`).
6. **Personal Training** (B9, B11): Umsatzsteuer, Anzahlungen und Pakete,
   getrennte oder gemeinsame Rechnungsstellung mit der Praxis.

Nicht mehr Teil der Anfrage: eine Behandlungsbestätigung oder Unterschrift je
Termin — Jannes hat am 2026-09-06 entschieden, dass keine benötigt wird
(`IDEA-PRX-015`, verworfen).

**Blockiert:** nichts; bis zur Antwort gelten Annahmen in ABR-EPIC-001 und
ABR-EPIC-002a (Registereinträge).

### B5 — Patientenidentität, Identitätsprüfung und Vertretung

| | |
|---|---|
| Dringlichkeit | P1 für das Portal (Etappe 4) |
| Bezug | §4.6 |

**Frage:** Wie authentifizieren sich Patient:innen, wie wird ihre Identität
geprüft, und wer darf in ihrem Namen handeln?

**Warum offen:** §4.6 setzt „ein Patient = ein Account" voraus. In der mobilen
Versorgung sind Betreuer:innen, Bevollmächtigte, Angehörige und Eltern
Minderjähriger der Regelfall. Offen sind außerdem: Identitätssicherheit vor
Akteneinsicht (§630g BGB), Zugangsverfahren für hochbetagte Patient:innen, und
ob der Portalzugang der §630g-Einsicht entspricht — und wenn ja, welche Teile
der Akte sichtbar sind.

**Vorläufig entschieden am 2026-09-08 durch Jannes — der Rahmen, nicht das
Verfahren:**

1. **Ein Konto gehört einer Person.** Vertretung — Angehörige, Betreuung,
   Eltern Minderjähriger — wird als **eigene Beziehung** modelliert: eigenes
   Konto, ausdrücklich erteilter Zugriff, im Auditlog unterscheidbar.
   **Niemals durch Weitergabe der Zugangsdaten.** Sobald Angehörige das
   Patientenkonto mitbenutzen, ist jede Zurechnung im Auditlog wertlos — und
   das Auditlog ist nach ADR-010 die Kompensation für erhebliche
   Zugriffsrechte.
2. **Der Portalzugang ist nicht automatisch die Einsicht nach §630g BGB.** Die
   Einsicht erfolgt auf Antrag, mit dokumentierter Identitätsprüfung und
   dokumentiertem Umfang. Welche Teile der Akte im Portal sichtbar sind, ist
   davon getrennt zu entscheiden.

**Rücknahme:** Rahmensatz 1 später einzuziehen wäre `groß` (Auditlog und
Zugriffsmodell) — deshalb jetzt, obwohl das Portal weit weg ist. Der Aufwand
war bei der Entscheidung benannt (§15.1 Punkt 4). Alles Übrige `klein`, weil
noch nichts existiert.

**Weiterhin offen:** das Verfahren selbst — Zugangsverfahren, Identitätsprüfung
vor Akteneinsicht, Zugang für hochbetagte Patient:innen.

**Blockiert:** Identitäts- und Patientenstammdatenmodell für das Portal,
Portal-Design. **Nicht blockiert:** Rechnungsempfänger ≠ Patient:in (ADR-009
regelt den Adressaten der Rechnung, nicht den Zugriff auf die Akte).

### B6 — Beschäftigtendaten: Tourendaten und Leistungskontrolle

| | |
|---|---|
| Dringlichkeit | P1 für Zeitkonto und Touren |
| Bezug | §1, §20 |

**Frage:** Werden Standort-, Touren- und Arbeitszeitdaten für
Leistungsbeurteilung verwendet — ja oder nein?

**Warum offen:** Routenplanung plus Arbeitszeiterfassung erzeugen ein
lückenloses Bewegungs- und Leistungsprofil der Therapeut:innen. §26 BDSG setzt
der Verhaltens- und Leistungskontrolle enge Grenzen. §20 verbietet bereits
Live-Ortung und nennt Auswertungen als offen.

**Vorläufig entschieden am 2026-09-08 durch Jannes: nein.** Standort-, Touren-
und Arbeitszeitdaten werden **nicht** zur Verhaltens- oder Leistungsbeurteilung
verwendet. Die Begrenzung wird technisch umgesetzt: Aggregation statt
Einzelbewegung, kurze Löschfristen, kein Live-Tracking (steht bereits in §20),
**keine Auswertung je Person**.

**Begründung.** §26 BDSG setzt der Leistungskontrolle enge Grenzen; ein „Ja"
wäre begründungs- und ab einem Betriebsrat mitbestimmungspflichtig und würde
die DSFA erheblich aufblähen. Bei einer Praxis dieser Größe liefert es nichts,
was ohne Datenauswertung unbekannt wäre. Das „Nein" ist die datensparsamere
Option (§16) und ein Satz, den die Praxis ihren Beschäftigten sagen kann.

**Rücknahme:** `mittel` — das „Nein" wird zu Löschfristen und fehlenden
Auswertungen; ein späteres „Ja" bräuchte neue Daten, aber keinen Umbau.

**Blockiert:** Datenmodell und Aufbewahrung für Touren- und Zeitdaten; bei
„nein" ist die Begrenzung technisch umzusetzen (Aggregation, Löschfristen,
kein Live-Tracking). ANN-004 hält Arbeitszeiten bereits aus dem Auditlog heraus.

### B7 — Übermittlung von Adressdaten an den Kartendienst

| | |
|---|---|
| Dringlichkeit | Handoff nicht blockiert; Karte und Fahrzeiten (MAP-006) am Vertragsgate aus ADR-019 Fassung 2 — siehe Nachtrag unten |
| Bezug | §9, §18, §20, §3.5; ADR-002, ADR-007 Punkt 2 |

**Entschieden am 2026-09-06 durch Jannes:** Der Kartendienst ist **Google
Maps**. Aus der Anwendung führt immer ein Link zur Navigation in Google Maps
— je Termin und für den ganzen Tag. Die Übermittlung der Adresse für die
Navigation ist datenschutzrechtlich genehmigt; die Entscheidung steht fest.
Umsetzung: Link in UX-EPIC-001 (Adresse ohne Namen, ohne Uhrzeit,
Fahrradmodus; URL-Format und Feldliste als `ANN`), Dokumentation der
Vertrags- und Datenschutzseite in ADR-019 (Roadmap G12), Nennung in der
Datenschutzinformation (PAT-006), DSFA-Wiedervorlage nach ADR-007 Punkt 2
(„wesentliche Änderung der Routing-/Standortverarbeitung").

**Entschieden am 2026-09-06 durch Jannes (E-16) — Datenweg der In-App-Karte:**
Die Karte der Tagesroute läuft über die **Google Maps Embed API** im
eingebetteten Rahmen — derselbe Anbieter wie der Link. Beim Öffnen gehen alle
Adressen eines Tages in einer Anfrage an den Dienst; die zuständige
Datenschutz-Fachkraft hat diesen Weg genehmigt (laut Jannes). Die Genehmigung
wird schriftlich zu den DSFA-Unterlagen gelegt (Roadmap G14, M0). Festgelegt
damit: Karte nur auf ausdrückliche Aktion, nie beim Öffnen einer Seite;
Adressen ohne Namen und ohne Uhrzeit; Schlüssel an die Domain gebunden; kein
Standort der Person, kein Verlauf, keine Speicherung von Routing-Rohdaten
(§18, §20). ADR-019 hält Vertragsgrundlage der Google Maps Platform,
Prüfkatalog aus ADR-002 und Schlüsselverwaltung fest; die Höchstzahl der
Zwischenziele je Anfrage kommt aus der Anbieterdokumentation.

**Vorläufig entschieden am 2026-09-08 durch Jannes — Fahrzeiten: abrufen ja,
speichern nein.** Die Fahrzeit je Weg wird im Moment der Planung abgerufen und
angezeigt, **nicht persistiert** und nie je Person ausgewertet. Damit hängt der
Punkt sauber an B6: ohne gespeicherte Fahrzeit gibt es nichts, woraus sich ein
Leistungsprofil bauen ließe. Rücknahme `klein`, solange nichts gespeichert
wird. Die Datenschutzberatung bestätigt oder ändert das mit B2.

**Noch offen — Fahrzeiten** (jetzt MAP-006, ADR-019 Fassung 2, siehe Nachtrag
unten): ob Fahrzeiten je Weg aus dem Dienst abgerufen und kurz gespeichert
werden dürfen (§18) und wie sie von jeder Auswertung je Person getrennt
bleiben (B6). Vorläufig entschieden (unten): abrufen und anzeigen ja,
speichern nein.

**Endgerät:** Der Link öffnet die Google-Maps-App oder den Browser auf dem
Telefon der Therapeutin. Ein dort angemeldetes privates Google-Konto speichert
Suchen und Wege. Die Endgeräte-Richtlinie (Roadmap G14, BETRIEB-001) regelt
Konto und Verlauf; das ist Teil von ADR-019.

**Ergebnis von ADR-019 (2026-09-08) — die drei Wege liegen unterschiedlich:**

- **Navigationslink: entschieden und frei.** Die Anwendung übermittelt nichts;
  die Verbindung baut das Endgerät der Therapeutin nach ihrem Tippen auf.
  Bedingung ist die Regel „nur auf Aktion, nie automatisch" — sie trägt diese
  Einordnung (EuGH C-40/17, *Fashion ID*). Dazu die Endgeräteregel und die
  Nennung in der Datenschutzinformation. UX-EPIC-001 kann bauen.
- **In-App-Karte und Fahrzeiten: nicht freigeschaltet.** Der Prüfkatalog nach
  ADR-002 scheitert an einem Kriterium, das nicht verhandelbar ist: Google
  bietet für die **Maps Platform keinen Auftragsverarbeitungsvertrag** an,
  sondern Controller-Controller-Bedingungen — Google verarbeitet als **eigener
  Verantwortlicher**. Damit fehlen AVV und §203-Verpflichtung, die §3.5 vor
  Freischaltung als MUSS verlangt, und §9 ordnet den Kartendienst
  ausdrücklich dort ein. **Das ist ein Widerspruch zu einer
  MUSS-Anforderung**, den ein ADR nicht auflösen darf (§21).

**Zur Auflösung** stehen drei Wege in ADR-019 („Der ungelöste Punkt"):
schriftliche Genehmigung plus Prinzipienänderung nach §21 (A), ohne In-App-Karte
auskommen (B), oder ein Kartendienst mit AVV für Karte und Fahrzeiten (C).
Empfehlung dort: **B, bis A geklärt ist** — das entspricht der bereits
vorgesehenen Gegenmaßnahme zu Risiko R12.

**Blockiert:** die In-App-Karte (TOUR-002) und die Fahrzeiten
(TOUR-EPIC-001b), bis A, B oder C gewählt ist. **Nicht blockiert:** der
Navigationslink, die Tourenliste, der Fahrpuffer als Praxisregel (CAL-010b).

**Nachtrag 2026-09-08 (MAP-001, ADR-019 Fassung 2) — Weg C gewählt.** Jannes
hat Convenience hoch priorisiert: In-App-Karte, Fahrradrouting und Fahrzeiten
sind Produktziel. Damit gilt:

- **Anbieter:** Google Maps Platform wird **nicht** Backend (kein AVV, keine
  belegte EU-Verarbeitung). **PTV Developer** (PTV Logistics GmbH,
  Karlsruhe) ist Kandidat für Prototyp und Bewertung — nur die OSM-APIs
  (Vector Maps, Geocoding, Routing, Matrix). **Nicht produktiv freigegeben.**
- **Gate vor Echtdaten** (`providerpruefung-kartendienst.md`, Teil 5): DPA-Text
  mit Nennung von PTV Developer und der OSM-APIs · Weisungsbindung ·
  §203-Verpflichtung (kein Wortlaut gefunden — gesondert anfragen) ·
  Subprozessoren der OSM-APIs · Retention und Ausschluss der Zweitnutzung ·
  EU-Region · Paid Plan und Schlüsselbindung · Prüfung der Supabase Edge
  Runtime (ADR-015 Punkt 20, OPS-001) · DSFA-Wiedervorlage je Datenweg.
  **Alle neun Punkte `CONTRACT_CONFIRMATION_REQUIRED`** — die PTV-Webseiten
  waren aus der Entwicklungsumgebung gesperrt.
- **Handoff:** nicht blockiert, aber nicht automatisch risikofrei (ADR-019
  Punkt 23; ANN-018). Frage an B2: Art. 9 / §203 bei Übergabe einer Adresse
  ohne Namen an den Betreiber der Navigations-App vom Gerät der Therapeutin.
- **Annahmen:** ANN-016 (Koordinate bei der Adresse), ANN-017 (Edge Function
  als Adapter), ANN-018 (Übergabeziel und URL-Format).
- **Für Jannes:** E-20 (Fassung 2 bestätigen, E-16 überholt), E-21
  (Reihenfolge MAP-002 zu UX-EPIC-001), PTV-Free-Abo vor MAP-002,
  Vertragsdokumente vor MAP-006 laden.

**Blockiert jetzt nur noch:** MAP-006 (echte Adressen), bis das Gate
passiert ist. **Nicht blockiert:** MAP-002 bis MAP-005 mit synthetischen
Daten, der Handoff in UX-EPIC-001, die Tourenliste, CAL-010b.

### B8 — Lizenzen für Fragebögen und PROMs

| | |
|---|---|
| Dringlichkeit | P2 |
| Bezug | §7 |

**Frage:** Ist die digitale Einbettung des DIGOTOR-Anamnesebogens (Version 8 /
07-2026) lizenzrechtlich abgedeckt? Wie werden Lizenzen je Instrument
dokumentiert?

**Warum offen:** Viele etablierte PROMs sind urheberrechtlich geschützt und
für die digitale Nutzung lizenzpflichtig.

**Entschieden am 2026-09-08 durch Jannes — der Rückfall:** Bis zur Auskunft des
Lizenzgebers werden **ausschließlich lizenzfreie Instrumente** eingesetzt (NRS,
patientenspezifische Funktionsskala, globale Veränderungsfrage). Die Anfrage an
den DIGOTOR-Lizenzgeber geht im Oktober raus. Die Lizenzfrage selbst bleibt
offen — sie ist eine Auskunft, keine Entscheidung.

**Blockiert:** FRB-003 (Anamnesebogen). **Nicht blockiert:** FRB-001 und
FRB-002 — die Bibliothek trägt ein Lizenzfeld, und die freien Instrumente (NRS,
patientenspezifische Funktionsskala, globale Veränderungsfrage) brauchen keine
Lizenz.

### B9 — Betreuung ohne und nach Heilbehandlung: Rechtsrahmen und Datentrennung

| | |
|---|---|
| Dringlichkeit | P2 — vor dem ersten Feature außerhalb der Heilbehandlung; Steuerteil mit B4 im September anfragen |
| Bezug | §1, §14, §18, §19; ADR-008, ADR-009; `IDEA-LZK-002`, `IDEA-LZK-008` |

**Frage:** Was gilt, wenn eine Person nach Ablauf des Rezepts freiwillig
weiterbetreut wird — und was gilt für Kund:innen des Personal Trainings, die
nie in Heilbehandlung waren?

**Warum offen:** Jannes hat am 2026-09-01 als langfristiges Ziel benannt,
frühere Patient:innen nach abgeschlossenem Rezept weiter zu coachen, und am
2026-09-06 ergänzt, dass die Plattform auch für die Kund:innen seines
Personal Trainings gedacht ist — ohne vorherige Heilbehandlung. Damit ist der
Übergang nicht mehr der einzige Fall: es gibt einen zweiten Eintrittsweg ohne
Verordnung, ohne Behandlungsvertrag und ohne Akte. Für ihn gelten dieselben
Fragen von Anfang an. Entschieden am 2026-09-06 (E-17): Das Personal
Training beginnt ebenfalls am 01.07.2027, es gibt keine Bestandsdaten; die
Plattform dafür ist Stufe 3 nach dem ersten Betriebsmonat; bis dahin werden
Kund:innen nicht als Patient:innen angelegt; `PROJECT_PRINCIPLES.md` §1 wird
nach §21 ergänzt, wenn Stufe 3 beginnt.

**Vorläufig entschieden am 2026-09-07 durch Jannes — ein Unternehmen:**
Patient:innen der Heilbehandlung und Kund:innen des Personal Trainings werden
**über dasselbe Unternehmen** betreut. Es gibt keinen zweiten Betrieb, keine
zweite Praxis und in der Plattform keine zweite Organisation — eine
`organization_id` nach ADR-003 für beides. Damit ist die Teilfrage „derselbe
Betrieb oder ein eigener?" beantwortet; sie geht als **Festlegung** in die
Anfrage B4, nicht mehr als Frage.

*Was daran hängt (Recherche zur Vorlage für B4, von der Steuerberatung zu
bestätigen):* Nach §2 Abs. 1 Satz 2 UStG umfasst das Unternehmen die gesamte
gewerbliche und berufliche Tätigkeit **einer** Person — als Einzelunternehmer
wäre Jannes umsatzsteuerlich ohnehin ein Unternehmer, auch mit zwei
Tätigkeiten; getrennte Unternehmen entstünden erst über eine eigene
Rechtsform. Die Entscheidung bestätigt damit im Wesentlichen die Rechtslage
und ist entsprechend risikoarm. Ihr Preis liegt bei §19 UStG: der Gesamtumsatz
wird für das eine Unternehmen gebildet, wobei die nach §4 Nr. 14 steuerfreien
Heilbehandlungsumsätze nach §19 Abs. 3 UStG herausfallen. Für die
Kleinunternehmergrenze zählt also im Kern der Personal-Training-Umsatz — er
kann die Praxis in die Regelbesteuerung führen. **Unsicher bleibt** die
Behandlung gemischter Fälle auf einer Rechnung; das ist Frage 1 von B4.

*Was die Entscheidung ausdrücklich **nicht** entscheidet:* Vertragsart,
Dokumentationspflicht nach §630f BGB, Aufbewahrungsfrist, Rechtsgrundlage nach
Art. 9 DSGVO und die Zweckbindung bleiben je Betreuungsverhältnis getrennt zu
beantworten — die Liste unten gilt unverändert. Ein Unternehmen macht die
**Zweckbindung sogar schärfer**, nicht lockerer: weil es keinen zweiten
Verantwortlichen und keine zweite Organisation mehr gibt, an denen sich die
Trennung von Akte und Trainingskontext organisatorisch festmachen ließe, muss
sie in Stufe 3 **technisch** entstehen — eigene Tabellen, eigene Rollenprüfung,
eigene Policies (ADR-004). Das ist der Punkt, den die Datenschutzberatung in
B2 sehen muss.

*Rücknahme:* Solange Stufe 3 nicht gebaut ist, kostet ein Widerspruch der
Steuerberatung in der Software **nichts** — es gibt keine Verankerung im Code,
nur diesen Vermerk. Ab Stufe 3 wäre die Trennung in zwei Organisationen ein
Datenumzug, Aufwand `groß`; das ist der Grund, die Antwort aus B4 **vor**
Stufe 3 zu haben, nicht danach.

Beim Übergang und beim Eintritt ohne
Behandlung ändern sich mehrere Dinge gleichzeitig:

- **Vertragsart:** Behandlungsvertrag (§630a BGB) gegenüber Dienstvertrag.
- **Dokumentationspflicht:** §630f BGB gilt für die Heilbehandlung, nicht für
  Training.
- **Aufbewahrung:** ADR-008 knüpft 10 Jahre an den „Abschluss der Behandlung";
  für Trainingsdaten fehlt die Frist.
- **Umsatzsteuer:** Heilbehandlung nach §4 Nr. 14a UStG regelmäßig befreit,
  Prävention und Selbstzahler-Training regelmäßig nicht.
- **DSGVO-Rechtsgrundlage:** Art. 9 Abs. 2 lit. h gegenüber Einwilligung nach
  lit. a, mit Widerruf.
- **Zweckbindung:** Welche Daten dürfen aus der Akte in den Trainingskontext,
  und was passiert in der Gegenrichtung?
- **Berufsrecht:** Reicht die physiotherapeutische Qualifikation, insbesondere
  bei Ernährung (`IDEA-ALT-005`)?

**Vorläufig entschieden am 2026-09-08 durch Jannes — die sechs verbliebenen
Fragen:**

1. **Vertragsart:** Dienstvertrag (§611 BGB) für Training, Behandlungsvertrag
   (§630a BGB) nur bei Heilbehandlung. Keine Mischform. Rücknahme `klein`.
2. **Dokumentationspflicht:** §630f BGB gilt fürs Training nicht. Es wird
   trotzdem dokumentiert, aber in **eigener Struktur** — nie in der
   Patientenakte. Wer nie in Heilbehandlung war, bekommt keine Akte. Rücknahme
   `groß`, wenn erst gemeinsam gespeichert und später getrennt würde; deshalb
   von Anfang an getrennt.
3. **Aufbewahrung:** Trainingsdaten **nicht** zehn Jahre, sondern **drei Jahre
   nach Ende der Betreuung**, angelehnt an die Regelverjährung (§§195, 199
   BGB) — der Zeitraum, in dem noch Ansprüche aus dem Vertrag entstehen können.
   Rechnungen und Buchungsbelege laufen davon getrennt auf der Steuerfrist
   (B4 Punkt 4). Rücknahme `klein`, solange Punkt 2 steht.
4. **Rechtsgrundlage:** für Gesundheitsdaten im Training **Einwilligung nach
   Art. 9 Abs. 2 lit. a DSGVO** mit Widerruf, für Vertrags- und
   Abrechnungsdaten Art. 6 Abs. 1 lit. b. **Nicht** lit. h — der trägt die
   Heilbehandlung, und Training ist keine. Rücknahme `mittel` (ein
   Einwilligungsmodell im Datenmodell).
5. **Zweckbindung:** **kein automatischer Fluss, in keine Richtung.** Aus der
   Akte ins Training nur auf ausdrückliche Einwilligung und als **Kopie mit
   Herkunftsvermerk**, nie als Verweis. Vom Training in die Akte gar nicht,
   solange keine Heilbehandlung läuft. Weil es nur **ein** Unternehmen und eine
   `organization_id` gibt, muss diese Trennung **technisch** entstehen — eigene
   Tabellen, eigene Rollenprüfung, eigene Policies nach ADR-004; an zwei
   Betrieben kann sie sich nicht mehr festmachen. Rücknahme **`groß`** — der
   Aufwand war bei der Entscheidung benannt (§15.1 Punkt 4). Dieser Punkt geht
   ausdrücklich mit an die Datenschutzberatung (B2).
6. **Berufsrecht Ernährung:** **vorerst nicht anbieten.** Ernährungsberatung ist
   nicht Teil der Ausbildung nach dem Masseur- und Physiotherapeutengesetz; die
   Abgrenzung zwischen zulässiger allgemeiner Information und beratender
   Tätigkeit ist heikel und wettbewerbsrechtlich angreifbar. Wollte die Praxis
   es anbieten, wäre das eine eigene Qualifikation plus eine Frage an den
   Berufsverband — keine Softwarefrage. Rücknahme `klein`, es wird nichts
   gebaut.

**Weiterhin offen:** die steuerliche Validierung (mit B4) und die
datenschutzrechtliche Bestätigung, insbesondere von Punkt 4 und Punkt 5 (mit
B2).

**Blockiert:** Etappe 8 vollständig und das Datenmodell der Betreuungsepisode
(`IDEA-LZK-002`, `IDEA-LZK-003`, `IDEA-LZK-008`); die automatische
Klassifizierung aus `IDEA-LZK-007`; jede Funktion für Kund:innen ohne
Heilbehandlung (Stufe 3). **Nicht blockiert:** die Empfehlung der Therapeutin
zum Verordnungsende als Teil der Verordnung (VER-001); die
Umsatzsteuer-Felder je Katalogposition, die ADR-009 Punkt 6 ohnehin verlangt.

### B10 — Automatisierte Progression: MDR-Grenze und Verantwortung

| | |
|---|---|
| Dringlichkeit | P2 — vor dem ersten Progressionsfeature |
| Bezug | §6, §7.1, §16, §17; ADR-005, ADR-006 |

**Frage:** Darf die Plattform die Belastung eines Trainingsplans selbsttätig
anpassen — und wenn ja, unter welchen Bedingungen?

**Warum offen:** ADR-006 Punkt 4 schließt für V1 Therapieempfehlungen und
automatisierte klinische Entscheidungen aus; Punkt 2 erlaubt transparente
Berechnungen validierter Instrumente. Eine Progressionsregel liegt dazwischen:
Reicht die Freigabe des Regelwerks je Plan durch die Therapeutin, oder braucht
jeder Schritt eine Bestätigung? Ist ein Ampelmodell mit therapeutisch gesetzten
Schwellen eine eigene Risikoklassifikation? Gilt für die Weiterbetreuung (B9)
ein anderer Maßstab?

**Vorläufig entschieden am 2026-09-08 durch Jannes: für V1 ausgeschlossen.**
Ein Regelwerk je Plan wird von der Therapeutin freigegeben, und **jeder
einzelne Progressionsschritt braucht ihre Bestätigung**, bevor er beim
Patienten ankommt. Damit bleibt die Anwendung auf der Seite von ADR-006 Punkt 2
(transparente Berechnung) und verletzt Punkt 4 nicht.

**Ein Ampelmodell wird auch mit therapeutisch gesetzten Schwellen nicht
gebaut** — eine Ampel *ist* eine Risikoklassifikation, unabhängig davon, woher
die Schwellen kommen; §17 schließt das für V1 aus. Diese Frage geht
ausdrücklich mit an die B1-Prüfung.

**Rücknahme:** heute `klein` (es wird nichts gebaut). In die andere Richtung
`groß`: ein Feature jenseits der Grenze ist `MDR_REVIEW_REQUIRED`, produktiv
gesperrt und braucht eine eigene Prüfung.

**Blockiert:** Etappe 9 vollständig. Bis zur Entscheidung ist jedes solche
Feature `MDR_REVIEW_REQUIRED` und produktiv nicht erreichbar. Die Frage gehört
an die externe Prüfung aus B1, nicht in einen Loop. Ausarbeitung:
`docs/product/ideen/01-trainingsplaene-und-progression.md` (nicht normativ).

### B11 — Paketpreise, Vorauszahlung und Anreize

| | |
|---|---|
| Dringlichkeit | P2 — vor dem ersten Paket- oder Rabattfeature |
| Bezug | §19; ADR-009, B4, B9 |

**Frage:** Wie werden vorausbezahlte Betreuungspakete abgebildet, und welche
Rabatt- und Anreizformen sind zulässig?

**Warum offen:** Ein Paket ist eine Vorauszahlung auf noch nicht erbrachte
Leistungen — ein Vorgang, den ADR-009 nicht kennt: Guthabenführung gegen
Leistungen, Steuerzeitpunkt bei Vereinnahmung, keine gemischten Pakete aus
befreiter und steuerpflichtiger Leistung, Laufzeit und Verfall, Rückfall in die
Heilbehandlung, GoBD für das Guthabenkonto, Preisversionierung. Zum
Bewertungsanreiz (Rabatt für eine Google-Bewertung) steht die Einordnung in
`IDEA-ANG-002` mit dem Ergebnis, davon abzuraten — eine Empfehlung, keine
Entscheidung; wenn er trotzdem kommen soll, vorher wettbewerbs- und
heilmittelwerberechtliche Beratung.

**Vorläufig entschieden am 2026-09-08 durch Jannes — zwei getrennte Antworten:**

- **Pakete: vorerst nicht anbieten**, bis B4 zurück ist. Eine Vorauszahlung ist
  kein Preismodell, sondern ein **Guthabenkonto**: Steuerentstehung bereits bei
  Vereinnahmung (§13 Abs. 1 Nr. 1 lit. a Satz 4 UStG), GoBD-Pflichten für das
  Guthaben, Verfall und Laufzeit, keine gemischten Pakete aus befreiter und
  steuerpflichtiger Leistung. Das ist Buchhaltungsmechanik, die ADR-009 nicht
  kennt — teuer nachzurüsten, wenn man sie falsch anfängt.
- **Rabatt für eine Google-Bewertung: nein.** `IDEA-ANG-002` rät bereits ab.
  Gekaufte Bewertungen sind wettbewerbsrechtlich angreifbar (UWG), im
  Heilbereich kommt das HWG dazu, und eine bezahlte Bewertung ist ihr Geld
  nicht wert. Falls doch gewünscht: vorher anwaltlich prüfen lassen, nicht als
  Annahme.

**Rücknahme:** `klein`, es wird nichts gebaut.

**Blockiert:** Paketverkauf, Guthaben, Rabattlogik, Preisdarstellung im Portal.
**Nicht blockiert:** die reguläre Einzelleistungsabrechnung nach ADR-009.

### B12 — Stichtag der Umstellung und Rechnungsnummernkreis

| | |
|---|---|
| Dringlichkeit | erledigt |
| Bezug | §19; ADR-009 (Folgefrage Nummernkreis); GoBD |

**Erledigt am 2026-09-06 durch Jannes:** Es gibt kein altes Werkzeug. Die
Praxis nimmt den Betrieb am 01.07.2027 erstmals auf — ohne
Bestandspatient:innen, ohne laufende Verordnungen, ohne offene Rechnungen,
ohne bisherigen Nummernkreis. Damit entfallen Stichtag, Bestandsdatenübernahme
(MIG-000, MIG-001) und Parallelbetrieb. Der Nummernkreis beginnt mit der
ersten ausgestellten Rechnung; sein **Format** ist eine Frage an die
Steuerberatung und steht jetzt unter B4 (Punkt 3), bis dahin Annahme in
ABR-EPIC-002a.

### B13 — E-Mail-Versand aus der Plattform

| | |
|---|---|
| Dringlichkeit | P1 — vor STAFF-EPIC-002 |
| Bezug | §2.1, §3.5; ADR-002; ADR-012 Punkt 10 |

**Frage:** Über welchen Anbieter versendet die Plattform Transaktions-E-Mails
(Einladung eines Zugangs, Passwort zurücksetzen, später Rechnungsversand)?
Braucht das eine Prüfung nach ADR-002 und einen AVV, oder bleibt die Praxis in
Stufe 1 ohne Versand aus der Plattform (Einladung über die Provider-Oberfläche,
Rechnungsversand aus dem Praxispostfach)?

**Entschieden am 2026-09-06 durch Jannes (Option a der Entscheidung E-4):**
In Stufe 1 versendet die Plattform ausschließlich die **Auth-Mails des
geprüften Providers** — Einladung eines Zugangs, Passwort zurücksetzen. Sie
sind Teil der Providerprüfung OPS-001 (Roadmap G3); ein zweiter Dienstleister
kommt nicht hinzu. Rechnungen und alle anderen Nachrichten an Patient:innen
gehen aus dem Praxispostfach, außerhalb der Plattform; der Rechnungszustand
„versendet" wird von Hand gesetzt. Ein eigener E-Mail-Dienst mit AVV (Option b)
bleibt für Stufe 2 möglich und wäre eine neue Prüfung nach ADR-002.

**Warum das reicht:** Ein E-Mail-Dienst wäre ein neuer Dienstleister mit
Zugang zu personenbezogenen Daten (mindestens Adresse und Rolle der
Mitarbeitenden). Die Auth-Mails laufen beim Provider, der ohnehin geprüft wird.

**Blockiert:** nichts mehr; STAFF-EPIC-002 mit STAFF-004 läuft im Oktober,
sobald OPS-001 die Auth-Mails einschließt.

### B14 — PDF-Erzeugung

| | |
|---|---|
| Dringlichkeit | P1 — vor ABR-EPIC-002b und der Tagesplan-Funktion (E2) |
| Bezug | §19; ADR-009 Punkt 14; ADR-015; `CLAUDE.md` (Abhängigkeiten) |

**Frage:** Wie entsteht das Rechnungsdokument — Browser-Druck aus einer
Druckansicht, eine PDF-Bibliothek im Browser oder eine serverseitige Funktion?
Wo läuft die Erzeugung, welche Abhängigkeit kommt dazu, wie wird das Dokument
unveränderbar abgelegt (ADR-017)?

**Teilweise entschieden am 2026-09-06 durch Jannes (E-5):** Druckansichten
mit `@media print` für Tagesplan, Terminzettel und Tourenliste kommen sofort
(UI-000 Druck-Basis) — keine Abhängigkeit, kein neuer Ausführungsort. Für die
unveränderbare Rechnung legt der Loop ABR-EPIC-002a die Optionen mit Aufwand
vor (Browser-Druck in PDF, Bibliothek im Browser, serverseitige Funktion);
Jannes entscheidet dann, im November 2026.

**Warum der Rest offen bleibt:** Eine wesentliche Abhängigkeit oder ein neuer
Ausführungsort ist nach §15.1 ein Stopp, nicht eine Annahme.

**Nicht entschieden am 2026-09-08 — bewusst.** Jannes hat die Richtung zur
Kenntnis genommen und die Entscheidung bei E-5 (2026-09-06) an ABR-EPIC-002a
vertagt, das die Optionen mit Aufwand vorlegt. **Vermerkte Tendenz:
serverseitige Funktion.** Grund: Die Rechnung muss nach ADR-009 und ADR-017
unveränderbar abgelegt werden. Ein Browser-Druck erzeugt eine Datei beim
Nutzer, die die Anwendung nie zu sehen bekommt — sie kann sie weder ablegen
noch garantieren, dass die abgelegte Fassung die versendete ist. Eine
Bibliothek im Browser löst das halb, fügt aber eine wesentliche Abhängigkeit
hinzu und verlagert die Erzeugung auf ein Gerät mit unbekannten Schriftarten.
Die Tendenz ersetzt den Optionenvergleich im November nicht.

**Blockiert:** ABR-003b. **Nicht blockiert:** Tagesplan drucken, Terminzettel,
Tourenliste.

### B15 — Terminerinnerung und Online-Terminbuchung

| | |
|---|---|
| Dringlichkeit | P2 — Stufe 2 |
| Bezug | §2.1, §3.5, §8, §10; ADR-002; ADR-007 |

**Frage:** Über welchen Kanal erinnert die Praxis an Termine (SMS, E-Mail,
Messenger, Anruf) und mit welchem Anbieter; welche Einwilligung braucht das
(PAT-006); soll es eine Online-Terminanfrage geben, und wenn ja, im Portal
(Etappe 4) oder davor?

**Warum offen:** Die Wettbewerbsanalyse vom 2026-09-06 zeigt Terminerinnerung
und Online-Buchung als Marktstandard. Beides ist ein neuer Dienstleister mit
Gesundheitsdaten (dass jemand einen Physiotherapietermin hat) und braucht
Prüfung nach ADR-002 und eine Einwilligung. Für Stufe 1 bleibt die Anrufliste
der Weg (`IDEA-PRX-005`).

**Termin (E-9, 2026-09-06):** Stufe 2 nach der Eröffnung. Die Frage geht mit
der Anfrage B2 im September an die Datenschutzberatung; Entscheidung bis M6
(31.07.2027), erster Loop danach.

**Vorläufig entschieden am 2026-09-08 durch Jannes: in Stufe 1 und 2 keine
automatische Terminerinnerung — die Anrufliste bleibt.**

**Begründung.** Jeder automatisierte Kanal ist ein **neuer Dienstleister mit
einem Gesundheitsdatum**: dass jemand einen Physiotherapietermin hat, ist
bereits eines. Das löst eine Prüfung nach ADR-002, eine DSFA-Wiedervorlage und
eine eigene Einwilligung aus (PAT-006). Am 2026-09-06 wurde bei B13 gerade
entschieden, keinen zweiten E-Mail-Dienst einzuführen; eine Terminerinnerung
ist keine Auth-Mail und liefe deshalb **nicht** über den bestehenden Weg.

**Falls doch, dann in dieser Reihenfolge:** E-Mail vor SMS. **Messenger ist
ausgeschlossen.** Die Reihenfolge folgt der Zahl der beteiligten Dritten.

**Online-Terminbuchung:** eigenes Thema, setzt das Portal und damit B5 voraus.
Nicht in Stufe 2.

**Rücknahme:** `klein` — es wird nichts gebaut, was zurückzunehmen wäre.

**Blockiert:** jede Erinnerungs- oder Buchungsfunktion. **Nicht blockiert:**
Anrufliste, Terminzettel als PDF.

### C6 — AI Privacy Gateway: Schutzumfang und Provider

| | |
|---|---|
| Dringlichkeit | P1 für das erste KI-Feature (Etappe 10) |
| Bezug | §6.1; ADR-005 |

**Frage:** Welchen Schutz leistet Pseudonymisierung bei klinischem Freitext,
dessen Inhalt die Person identifiziert — und welche vertraglichen Zusagen
(keine Nutzung zu Trainingszwecken, EU-Verarbeitung, kurze Aufbewahrung,
§203-Verpflichtung) treten an ihre Stelle? Welcher Anbieter, welches Modell?

**Warum offen:** ADR-005 hat den Zeitpunkt entschieden (Gateway ab dem ersten
Feature, kein direkter Provideraufruf), nicht den Schutzumfang. Die
Produktionshypothese in `PRODUCT_VISION.md` §6 ist eine Arbeitshypothese.

**Vorläufig entschieden am 2026-09-08 durch Jannes — der Schutzumfang, nicht
der Anbieter.**

**Pseudonymisierung ist bei klinischem Freitext kein wirksamer Schutz.** Ein
Befundtext identifiziert die Person über den Inhalt — Diagnose, Beruf,
Wohnsituation, Verlauf — auch ohne Namen. Die Last tragen deshalb die
**Vertragszusagen**. Ein Anbieter kommt nur in Frage, wenn **alle fünf**
vorliegen:

- Verarbeitung ausschließlich in der EU,
- **keine Nutzung der Eingaben zu Trainingszwecken**, vertraglich zugesichert,
- keine oder sehr kurze Aufbewahrung („zero retention"),
- Auftragsverarbeitungsvertrag nach Art. 28 DSGVO,
- Verpflichtung der Beschäftigten des Anbieters nach §203 StGB.

**Weiterhin offen: der Anbieter.** Die Auswahl kommt mit Etappe 10 und läuft
durch die Prüfung nach ADR-002. Rücknahme heute `klein`, weil nichts
angebunden ist.

**Blockiert:** Etappe 10. Die Freischaltung eines Providers löst die Prüfung
nach ADR-002 und eine DSFA-Wiedervorlage aus (ADR-007).

### D — „bestätigt": der Terminstatus-Automat

| | |
|---|---|
| Dringlichkeit | P1 — vor der Leistungserfassung (ABR-002) |
| Bezug | §8; ADR-009 (Ausfallhonorar, „durchgeführt" als abrechenbares Ereignis) |

**Entschieden am 2026-09-05 durch Jannes — Umfang:** der vollständige
Zustandsautomat: angefragt · vorgemerkt · bestätigt · abgesagt · nicht
angetroffen · durchgeführt · dokumentiert · abgerechnet. Nicht die
Minimalvariante (nur „nicht angetroffen").

**Noch offen — Ausgestaltung, als ADR-018 in CAL-EPIC-003:** Übergänge und wer
sie auslöst; Migration der heutigen Status (geplant, abgesagt, abgeschlossen);
ob „angefragt" und „vorgemerkt" vor dem Portal überhaupt erreichbar sind oder
nur vorgesehen werden; „dokumentiert" aus der Finalisierung (ADR-016) und
„abgerechnet" aus ABR-003 abgeleitet oder gesetzt; Ausfallhonorar als
Kennzeichen an „nicht angetroffen"; Terminserien (CAL-007) und ihr Verhältnis
zum Status je Termin. **Vorläufig entschieden am 2026-09-08 durch Jannes — eine der Vorfragen:**
„angefragt" und „vorgemerkt" werden **nur vorgesehen, nicht gebaut**. Ohne
Portal gibt es niemanden, der einen Termin anfragt; ADR-014 sagt „nicht
vorbauen". ADR-018 beschreibt die beiden Zustände, CAL-EPIC-003a implementiert
sie nicht. Rücknahme `klein`. Die übrigen Punkte der Ausgestaltung bleiben
offen.

Bis ADR-018 vorliegt, gilt ANN-005 (Abschluss ohne
Dokumentationspflicht). Danach ist `PROJECT_PRINCIPLES.md` §8 nachzuziehen
(§21).

### E2 — Ausfallkonzept

| | |
|---|---|
| Dringlichkeit | P1 vor Go-live |
| Bezug | §16; ADR-012 Punkte 8 und 9 |

**Frage:** Was macht die Praxis, wenn die Anwendung einen Tag steht —
exportierter Tagesplan, Papier-Fallback, Erreichbarkeit der Patient:innen?

**Warum offen:** ADR-012 verlangt ein dokumentiertes Degraded-Verfahren und
dass Kerninformationen des Arbeitstags auch bei einem mehrstündigen Ausfall
verfügbar sind, lässt den Inhalt aber offen. Das ist ein Praxisprozess mit
einer Minimalfunktion der Software (Tagesplan druck- und exportierbar).

**Seit dem 2026-09-06 zusätzlich:** Weil es kein Altsystem gibt, ist dieser
Papierprozess auch der Rückfallplan der Eröffnung (Roadmap H4) — Tagesplan mit
Adressen und Telefonnummern, Dokumentation auf Papier mit Nachtrag, Rechnung
von Hand mit fortlaufender Nummer.

**Vorläufig entschieden am 2026-09-08 durch Jannes — der Kern in drei Sätzen:**

1. **Der Tagesplan liegt jeden Morgen auf Papier oder als PDF auf dem Telefon**,
   mit Adressen und Telefonnummern. Die Druckansicht dafür existiert seit
   UI-000 — das ist die einzige Stelle, an der die Software etwas beitragen
   muss.
2. **Dokumentation auf Papier, Nachtrag binnen 24 Stunden** nach ADR-016 mit
   Begründung „Ausfall". Kein Warten bis zur Wiederherstellung.
3. **Rechnungen ruhen.** **Keine** handschriftliche Rechnung aus dem
   Nummernkreis, solange die Software steht; sie werden nachgeholt. Eine von
   Hand vergebene Nummer, die das System nicht kennt, reißt genau die Lücke,
   die §14 UStG nicht haben will — eine Behandlung lässt sich
   nachdokumentieren, eine Nummernlücke nicht heilen.

Punkt 3 **weicht vom bisherigen Rückfallplan ab** (Roadmap H4: „Rechnung von
Hand mit fortlaufender Nummer aus dem Nummernkreis"); H4 ist entsprechend
nachgezogen.

**Abbruchkriterien** (wann der Papierprozess endet und abgesagt wird):
Datenverlust, eine Falschzuordnung, oder mehr als ein Tag Ausfall.

**Weiterhin offen:** die Ausarbeitung als Betriebsdokument (Januar 2027, mit
Claude) und die Funktion „Tagesplan exportierbar" (Roadmap, Dezember).

**Blockiert:** Go-live-Abnahme (Roadmap G10, G18).

### E10 — Wer verwaltet Mitarbeiterdatensätze

| | |
|---|---|
| Dringlichkeit | P2 — vor STAFF-EPIC-002 |
| Bezug | §4.1, §4.3, §4.5 |

**Frage:** Dürfen neben `owner` auch Office („Mitarbeiterorganisation", §4.3)
und Teamleitung („Mitarbeiterplanung" als mögliches Zusatzrecht, §4.5)
Mitarbeiterdaten anlegen, ändern und den Beschäftigungsstatus wechseln?

**Warum offen:** Für den schreibenden Zugriff liegt nur für den Praxisinhaber
eine verbindliche Aussage vor. STAFF-001 folgt bis zur Entscheidung §13 („im
Zweifel blockieren"): Schreiben nur `owner`, Lesen für alle Praxisrollen.

**Entschieden am 2026-09-08 durch Jannes — dreigeteilt statt ja/nein:**

- **Stammdaten** (Name, Anschrift, Telefon, Arbeitszeitmodell): **`office` darf
  schreiben.** Das ist wörtlich die „Mitarbeiterorganisation" aus §4.3; liefe
  jede Adressänderung über den Praxisinhaber, wäre er das Nadelöhr — bei
  Bus-Faktor 1 ein reales Risiko (ADR-012).
- **Rollenvergabe** (wer wird `therapist`, wer `team_lead`): **nur `owner`.**
  Eine Rolle zu vergeben ist Berechtigungsvergabe und damit eine
  Sicherheitsentscheidung nach ADR-004.
- **Beschäftigungsstatus** (aktiv / ausgeschieden): **nur `owner`.** Der
  Wechsel sperrt einen Zugang und hat arbeitsrechtliche Wirkung.
- **`team_lead`: für nichts davon.** Die Rolle existiert für Planung; §16 sagt
  im Zweifel restriktiver, und später öffnen ist billig.

Kein Datenschutz- oder Rechtspunkt, sondern Praxisprozess — damit **entschieden**,
nicht `vorläufig entschieden`. Umsetzung in STAFF-EPIC-002; bis dahin bleibt es
bei `owner`-only. **§4.3 und §4.5 der Prinzipien werden mit STAFF-EPIC-002 nach
§21 nachgezogen**, wenn die Aufteilung im Code steht und getestet ist.

**Rücknahme:** `klein` — je Bereich eine Policy-Funktion.

**Blockiert:** nichts; STAFF-EPIC-002 übernimmt bis zur Entscheidung dieselbe
Annahme für Konten und Rollen.

### E11 — Wer gilt als behandelnde Person

| | |
|---|---|
| Dringlichkeit | P2 |
| Bezug | §4.2, ADR-014 |

**Stand:** Zuordenbar für Termine ist, wer aktiv beschäftigt ist **und** einen
eigenen aktiven Zugang mit therapeutischer Rolle besitzt (aus CAL-001). Eine
neu angelegte Therapeutin ohne Zugang kann deshalb weder eingeplant werden
noch Arbeitszeiten erhalten.

**Erledigt sich mit STAFF-EPIC-002** (entschieden 2026-09-05: Konten und
Rollen werden in der Anwendung verwaltet): Wer einen Mitarbeiterdatensatz
anlegt, lädt in derselben Oberfläche den Zugang ein und vergibt die Rolle. Die
Kopplung an den Zugang bleibt damit bewusst bestehen — ein Konto ist nach §4.2
ohnehin Pflicht. Sollte sich das im Praxisbetrieb als hinderlich erweisen
(Vertretung ohne Konto), wird der Punkt wieder geöffnet.

### E12 — Terminfenster: Abweichung, Fahrpuffer, Warnung oder Sperre

| | |
|---|---|
| Dringlichkeit | P2 — vor CAL-010a und CAL-010b |
| Bezug | §8.1, §9, §6.2; ADR-019; CAL-EPIC-003b |

**Entschieden ist §8.1** (Jannes, 2026-09-08): 60 Minuten je angebotenem
Termin einschließlich Dokumentation, Beginn frei im 5-Minuten-Raster, Fahrzeit
zusätzlich zwischen den Terminfenstern, früheste Folgezeit auf dem ersten
Rasterpunkt auf oder nach Ende plus Fahrzeit (aufrunden, nie abrunden),
Bestandstermine unverändert, Durchsetzung serverseitig.

**Was daran offen ist** — vier Fragen, die die Entscheidung ausdrücklich
**nicht** mitbeantwortet:

1. **Gibt es eine begründete Abweichung von den 60 Minuten?** Ein Erstbefund
   oder eine Doppelbehandlung könnte länger dauern. Ist das zulässig, und wenn
   ja: als ausdrückliche Bestätigung nach dem Muster von
   `p_allow_outside_working_hours` (CAL-005) mit Auditvermerk, oder gar nicht?
   Ohne Antwort baut CAL-010a die Regel **ohne** Ausnahme — §16, im Zweifel
   restriktiver, und später öffnen ist billig.
2. **Wird die Länge je Praxis einstellbar?** Heute ist 60 eine feste Zahl im
   Prinzipiendokument, kein `owner`-Wert wie das Raster. Für eine Praxis
   reicht das; für ein zweites Unternehmen später nicht.
3. **Woher kommt die Fahrzeit, bis ein Kartendienst freigegeben ist?** Ein
   pauschaler Mindestabstand zwischen Hausbesuchen an verschiedenen Adressen,
   von Hand gepflegte Fahrminuten je Patient:in ab Depot, beides oder keines
   von beidem. Der ursprüngliche Vorschlag dazu steht als `IDEA-PRX-002` im
   Ideenspeicher und ist **nicht** mitentschieden.
4. **Warnung oder Sperre**, wenn der Abstand unterschritten wird? Die
   Terminlänge ist nach §8.1 durchzusetzen; für den Fahrpuffer sagt die
   Entscheidung dazu nichts.

**Warum offen:** Punkt 1 und 2 sind Praxisprozess und lassen sich erst nach
den ersten Wochen im Betrieb sinnvoll beantworten. Punkt 3 hängt an B7 und
ADR-019: mit MAP-004 kommen echte Fahrzeiten, und ein pauschaler Wert wäre
dann ein zweiter, schlechterer Mechanismus daneben.

**Blockiert:** nichts. UX-EPIC-001 braucht die Antwort nicht; CAL-010a baut die
entschiedenen Teile von §8.1, und CAL-010b lässt offen, was ohne Antwort offen
bleiben muss.

**Rücknahme:** `klein` bis `mittel` — die Regel greift an genau zwei
Schreibpfaden (`create_appointment`, `update_appointment`) und einer
Vorbelegung im Formular.

### E13 — Sprachdokumentation: Anbieter, Architektur, Audio, Frist

| | |
|---|---|
| Dringlichkeit | P3 — vor einem eigenen Sprachdokumentations-Loop, nicht vorher |
| Bezug | §6.3, §6.1, §3.5, §18; ADR-005 Punkte 8 und 9, ADR-006 Punkt 8, ADR-016 Punkt 10, ADR-008; C6 |

**Entschieden ist §6.3** (Jannes, 2026-09-08): die Anforderung an ein bewusst
gestartetes Nachdiktat aus dem Termin — Zuordnung, Inhaltstreue, Kennzeichnung
unverständlicher Stellen, Prüfung und Korrektur, ausdrückliche Übernahme, und
das Verbot, einen ungeprüften Vorschlag automatisch zu finalisieren.

**Was daran offen ist:**

1. **Anbieter für Spracherkennung und Transkription.** Läuft über denselben
   Prüfkatalog wie jeder andere Verarbeitungsdienst (ADR-002, ADR-005 Punkt 8)
   und gehört zu **C6**, nicht daneben. Kein Startvorteil, weil es „nur"
   Transkription ist.
2. **Rohaudio:** Wird es überhaupt gespeichert, wo, wie lange, und geht es
   durch den Gateway oder nur der daraus entstandene Text? Stimme plus Inhalt
   ist ein besonders sensibles Gesundheitsdatum (§3.5, §18). ADR-008 kennt
   dafür heute **keine** Datenklasse — die für KI-Entwürfe deckt den Text ab,
   nicht die Aufnahme.
3. **Fristanker.** ADR-016 Punkt 7 hängt die automatische Finalisierung an die
   Behandlung (ANN-008), nicht an die Entstehung des Entwurfs. Eine Übernahme
   nach Fristablauf erzeugte damit einen Entwurf, der sofort finalisiert wird —
   ohne Gelegenheit zur Korrektur. Das ist zu regeln, bevor gebaut wird.
4. **Architektur und Zustandsführung:** Lebt der ungeprüfte Vorschlag neben dem
   Dokumentationseintrag oder als eigener Zustand davor? ADR-016 Punkt 10
   verlangt die Trennung, nicht die Form.
5. **Bedienung auf dem Gerät**, Zeitpunkt und Einordnung in die Roadmap.

**Warum offen:** Die Anforderung steht, die Umsetzung ist ein eigener Auftrag.
Jannes hat sie ausdrücklich nicht mitbeauftragt.

**Blockiert:** nichts. Kein Loop der aktuellen Roadmap hängt daran.

**Rücknahme:** entfällt — es ist nichts gebaut.

---

## F. Folgefragen aus den ADRs mit Planungsrelevanz

Jeder ADR führt „Offene Folgefragen". Die meisten beantworten sich im Loop, der
das Thema baut. Die folgenden sind planungsrelevant, weil ohne sie ein Paket
aus der Roadmap nicht abgeschlossen werden kann.

| Frage                                                                                                          | ADR              | Beantwortet in                                    |
| -------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------- |
| Wer führt die Anbieterprüfung durch, wo wird sie dokumentiert, wie oft wiederholt?                             | ADR-002          | OPS-001 (Roadmap G3)                              |
| Ist externes Error-Tracking zulässig, und wie werden Redaction-Regeln erzwungen und getestet?                  | ADR-002, ADR-011 | OPS-004 (G8)                                      |
| Wie wird „keine Produktionsdaten in Dev/Test" technisch abgesichert?                                           | ADR-002          | OPS-001, OPS-002                                  |
| Frontend-Hosting und dessen Prüfung; `service_role` nie im Browser; freigegebener Stand, Nachweis der Freigabe | ADR-015, ADR-013 | OPS-002 (G5)                                      |
| Kritische Änderung, Review-Checkliste, Schweregrade im Dependency-Scan                                         | ADR-013          | OPS-002 (G5)                                      |
| Backup-Lebenszyklus, Notfallzugang, Restore-Dokumentation, Degraded-Kerninformationen                          | ADR-012          | OPS-003 (G7), E2 (G11)                            |
| Wer liest Auditlogs; Schwelle „größerer Export"; Eskalation beim Report; Audit gelöschter Bezugsdaten          | ADR-010          | OPS-005 (G6), LOE-002                             |
| Wie werden Berechtigungsänderungen protokolliert; Umgehungsschutz des Policy-Layers                            | ADR-004          | STAFF-EPIC-002 (Rollenänderungen), OPS-005        |
| „Abschluss der Behandlung": manuell, durch Zeitablauf, oder beides                                             | ADR-008          | LOE-001 als Annahme; Anker Verordnungsende (VER-001) |
| Löschnachweis nach Restore; Legal-Hold-Rechte; Teamchat rollierend löschen; Dateien in mehreren Kontexten      | ADR-008          | LOE-002, TEAM-001, ADR-017                        |
| Rechtsgrundlage je Verarbeitung und Einwilligungsmodell; Betroffenenrechte technisch; Wiedervorlage koppeln     | ADR-007          | PAT-006 (G9), OPS-006 (G10), G12; Skill-Schritt A prüft die acht Ereignisse |
| Nummernkreis, Snapshot-Felder, Storno-Kette, Empfängertypen, Override-Rechte, „überfällig" ohne Mahnwesen       | ADR-009          | ABR-EPIC-002                                      |
| Abrechenbare Ereignisse neben Terminen; Katalog global oder je Organisation; Datentyp für Geldwerte            | ADR-009, ADR-003, ADR-014 | ABR-001 (Annahme: nur Termine in V1)      |
| Zeitzonen bei wiederkehrenden Terminen und Kalenderjahr-Fristen                                                | ADR-014          | CAL-007, LOE-001                                  |
| Speicherort und Retention von Dateien                                                                          | ADR-015, ADR-008 | ADR-017 (G1)                                      |
| Begründung als Pflichtfeld; Frist bei Hausbesuchen am Freitag; Azubi-Rolle                                     | ADR-016          | ANN-008 nach Praxiserfahrung; Rolle in STAFF-EPIC-002 |
| Fristanker bei später Übernahme eines KI-Vorschlags; Rohaudio; Prüfbarkeit der Inhaltstreue                    | ADR-016 Fassung 2, ADR-005 Fassung 2, ADR-006 Fassung 2 | E13; Anbieter mit C6              |
| Wer pflegt die Zweckbestimmung; wo wird `MDR_REVIEW_REQUIRED` geführt; Cutoff-Anzeige als Klassifikation?      | ADR-006          | G12/G13 (Dokument); FRB-002 (Cutoff, bis dahin nicht anzeigen) |
| Offline: Felder, Unsynchronisiert-Dauer, Konfliktauflösung, Geräteanforderungen, Audit offline                 | ADR-001          | Tagesplan-Cache lesend als `ANN` in UX-EPIC-001 (E-12); vollständiger Offline-ADR vor einem späteren Offline-Loop |
| Kartendienst: Anbieter, Datenweg, Vertragsgrundlage, Endgerät                                                  | ADR-002, §9, §20 | ADR-019 (Roadmap G12); B7                          |
| KI: Provider, Zweck → erlaubte Felder, Protokollierung, Nachweis der Freigabe                                  | ADR-005          | C6, Etappe 10                                     |
| Minimale Struktur für Vertreterzugriffe                                                                        | ADR-014          | B5                                                |

---

## Historie

- **2026-08-28:** Baseline-Review von `PROJECT_PRINCIPLES.md` 0.1 mit den
  Punkten A1 bis A4, B1 bis B8, C1 bis C8, D, E1 bis E9. Am selben Tag
  entschieden: A1 bis A4, B1 bis B4 (architektonisch), C3, C4, C5, C8, E1, E3,
  E4, E5, E7 — ADR-001 bis ADR-014; ADR-015 legt den Stack fest. Prinzipien
  0.2 führen Normativität (§0) und Governance (§21) ein.
- **2026-09-01:** ADR-016 entscheidet „finalisiert" und „nachvollziehbar".
  B9, B10, B11 kommen aus dem Brainstorming zur Betreuungsplattform hinzu.
- **2026-09-04:** E10 und E11 aus STAFF-001; Prinzipien 0.3 (§15.1 Annahmen).
- **2026-09-05:** C1 und C2 durch Jannes entschieden (Prinzipien 0.4). Im
  Planungsreview: Terminstatus-Automat vollständig (ADR-018 ausstehend),
  Dateiablage als ADR-017 beauftragt, Konten in der Anwendung (E11),
  Zieltermin Q1 2027, Verordnungen vor Abrechnung, Vorschaubereiche bleiben.
  Dieses Dokument auf Struktur 2.0 verschlankt; die Volltexte der
  entschiedenen Punkte stehen in der Git-Historie bis Commit `23d71e5`.
- **2026-09-06:** B12 bis B15 aus dem Roadmap-Review und der
  Wettbewerbsanalyse (Review in der Git-Historie, Commit `7ab6f71`):
  Stichtag und Nummernkreis, E-Mail-Versand, PDF-Erzeugung, Terminerinnerung.
- **2026-09-06, Antworten von Jannes auf die Entscheidungen E-1 bis E-14 des
  Reviews:** E-1 Roadmap 2.1 als Rahmen · E-2 UI-000 und UX-EPIC-001 direkt
  nach VER-EPIC-001 · E-3 Loops geteilt (ADR-018 als Docs-Session, CAL-EPIC-003
  a/b, ABR-EPIC-002 a/b, ABR-EPIC-003) · E-4 E-Mail nur über die Auth-Mails des
  Providers (B13 entschieden) · E-5 Druckansichten sofort, Rechnungs-PDF in
  ABR-EPIC-002a entscheiden (B14 teilweise) · E-6 STAFF-EPIC-002 mit STAFF-004
  im Oktober · E-7 **kein altes Werkzeug — die Praxis eröffnet am 01.07.2027**;
  Stabilisierung ist der erste Betriebsmonat, kein Parallelbetrieb (B12
  erledigt) · E-8 axe als Dev-Abhängigkeit · E-9 Textbausteine und
  Zahlungserinnerung in Stufe 1, Warteliste und Terminerinnerung in Stufe 2
  (B15 mit B2 anfragen) · E-10 Wochenupdate-Prompt umgestellt · E-11
  Optimierungsrunden mit Zusatzkriterium im Gate · E-12 Tagesplan-Cache als
  Story in UX-EPIC-001 · E-13 **keine Unterschrift und keine
  Behandlungsbestätigung nötig** (`IDEA-PRX-015` verworfen) · E-14 vorerst keine
  Nachrecherche. Dazu drei Vorgaben: Navigation über **Google Maps** ist
  entschieden und datenschutzrechtlich genehmigt (B7 teilweise, ADR-019); eine
  **Karte der Tagesroute** gehört zum Lastenrad-Hausbesuchskonzept
  (TOUR-EPIC-001a); eine **Plattform für Patient:innen und
  Personal-Training-Kund:innen** gehört zum Zielbild (B9 erweitert,
  `IDEA-LZK-008`, Stufe 3).
- **2026-09-06, Antworten von Jannes auf die Rückfragen E-15 bis E-19:** E-15
  **die Reihenfolge der Umsetzung ist verbindlich, der Kalender nachrangig**;
  Themen dürfen früher kommen (Roadmap „Sessions starten") · E-16 In-App-Karte
  über die **Google Maps Embed API**, die zuständige Datenschutz-Fachkraft
  hat genehmigt (B7 entschieden bis auf die Fahrzeiten) · E-17 Personal
  Training beginnt ebenfalls am 01.07.2027, keine Bestandsdaten; Stufe 3 nach
  M6, §1 der Prinzipien wird dann ergänzt · E-18 der Referenz-Screenshot ist
  ein fremdes Produkt; Jannes will dessen Funktionsumfang nachbauen · E-19
  Reihenfolge der Stufe 3 wie vorgeschlagen.
- **2026-09-08, MAP-001 (Mapping-Architektur und Providerentscheidung):**
  Jannes priorisiert Convenience hoch — In-App-Karte, Fahrradrouting und
  Fahrzeiten sind Produktziel. ADR-019 Fassung 2 ersetzt Fassung 1 vom selben
  Tag: Weg C (Anbieter mit AVV) statt Weg B; **PTV Developer** als Kandidat
  für Prototyp und Bewertung, nicht freigegeben; Google nur als
  Handoff-Ziel; E-16 überholt. Neu offen: **E-20** (Fassung 2 bestätigen),
  **E-21** (Reihenfolge MAP-002 zu UX-EPIC-001). B7 führt das Gate.
- **2026-09-07:** Jannes entscheidet die Punkte, die auf externe Stellen
  warten, **vorläufig selbst** und nimmt zurück, was die Prüfung nicht trägt.
  Dafür der Status `vorläufig entschieden (Jannes)` oben — er löst das Bauen,
  nicht die Freigabe. Erste Anwendung: B9, ein Unternehmen für Heilbehandlung
  und Personal Training. Damit einher geht eine Verschärfung, kein
  Zugeständnis: das Annahmenregister trennt jetzt `entschieden (Jannes)` von
  `bestätigt (Prüfung)`, weil beides bisher unter `bestätigt` fiel und eine
  Bestätigung durch Jannes den Go-live-Blocker der Kategorien Datenschutz und
  Recht bereits erfüllt hätte.
- **2026-09-08, Entscheidungsrunde September:** Jannes entscheidet die
  Entscheidungsvorlage vom Vortag **ausnahmslos nach Empfehlung**. Die Vorlage
  selbst (`ENTSCHEIDUNGSRUNDE-2026-09.md`, Commit `58344e7`) ist nach ihrer
  eigenen Regel gelöscht; Begründungen und der jeweilige Preis der Rücknahme
  stehen dort und, verdichtet, in den Abschnitten oben. Entschieden wurden:
  **B1** Wortlaut der Zweckbestimmung · **B2** externer DSB unabhängig von der
  Pflicht · **B4** vier steuerliche Festlegungen (Steuerkennzeichen je
  Katalogposition und getrennte Rechnungen, Kleinunternehmerregelung,
  Nummernkreis `RG-JJJJ-NNNN`, gesetzliche Belegfristen als eigene Datenklasse)
  · **B5** Rahmen der Patientenidentität (ein Konto = eine Person, Vertretung
  als eigene Beziehung; Portalzugang ≠ §630g-Einsicht) · **B6** keine
  Leistungskontrolle aus Touren- und Zeitdaten · **B7** Fahrzeiten abrufen,
  nicht speichern · **B8** Rückfall auf lizenzfreie Instrumente · **B9** die
  sechs verbliebenen Fragen zum Personal Training · **B10** automatisierte
  Progression für V1 ausgeschlossen, auch als Ampelmodell · **B11** keine
  Pakete, kein Bewertungsrabatt · **B15** keine automatische Terminerinnerung
  · **C6** fünf Vertragszusagen als Schutzumfang der KI · **E2** Kern des
  Ausfallkonzepts, mit einer Abweichung von H4 (Rechnungen ruhen, statt von
  Hand aus dem Nummernkreis) · **E10** Schreibrechte auf Mitarbeiterdaten
  dreigeteilt · **ADR-018** „angefragt"/„vorgemerkt" nur vorsehen. **B14**
  bleibt bewusst offen (Tendenz vermerkt). Im Annahmenregister gehen
  **ANN-002, ANN-005, ANN-008, ANN-010, ANN-012 und ANN-015** auf `entschieden
  (Jannes)`. Zwei Festlegungen tragen einen Rücknahmeaufwand `groß` und wurden
  mit diesem Hinweis entschieden (§15.1 Punkt 4): die Zweckbindung zwischen
  Akte und Trainingskontext (B9 Punkt 5) und „ein Konto gehört einer Person"
  (B5 Rahmensatz 1).
- **2026-09-08, zwei eigene Produktentscheidungen von Jannes** (nicht aus der
  Entscheidungsrunde): das **Terminfenster** — 60 Minuten einschließlich
  Dokumentation, ohne eigenen Dokumentationsblock und ohne feste Aufteilung,
  Beginn frei im 5-Minuten-Raster, Fahrzeit zusätzlich zwischen den
  Terminfenstern, früheste Folgezeit auf dem ersten Rasterpunkt auf oder nach
  Ende plus Fahrzeit, Bestandstermine unverändert — und die
  **Sprachdokumentation** als bewusst gestartetes Nachdiktat mit inhaltstreuer
  Transkription und ausdrücklicher menschlicher Übernahme. Verankert in
  `PROJECT_PRINCIPLES.md` 0.5 §8.1 und §6.3; dazu ADR-005 Fassung 2 (Punkt 9),
  ADR-006 Fassung 2 (Punkt 8) und ADR-016 Fassung 2 (Punkt 10). **Neu offen:**
  E12 (Abweichung von der Terminlänge, Herkunft der Fahrzeit, Warnung oder
  Sperre) und E13 (Anbieter, Rohaudio, Fristanker, Architektur der
  Sprachdokumentation). Beide Entscheidungen sind **noch nicht umgesetzt** —
  die Terminlänge ist heute frei, ein Fahrpuffer existiert nicht, und es gibt
  keine Sprachfunktion.
