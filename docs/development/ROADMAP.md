# Roadmap
Version 7.25 · Stand 2026-10-31 · **in Kraft**

Reihenfolge der Umsetzung; sie begründet keinen Scope (der entsteht in der Spec), ist kein Auftrag
(die nächste Aufgabe steht in [`../STATUS.md`](../STATUS.md)) und überschreibt nichts; fehlt eine
Voraussetzung, gelten §15.1 und §15.2. `IDEA-`Kennungen nennen die Herkunft.

## Aufräumen (Auftrag Jannes 2026-10-25, Entscheidungen 2026-10-26 und 2026-10-27)
Kein Neustart: Größe, Kopplung und Kommentarlast sinken schrittweise, je eine PR. Bauplan war die
Tiefenanalyse (`git show eaae99b:docs/development/TIEFENANALYSE.md`); den Stand misst `/aufraeumen`.
Die Schritte 1 bis 5 sind gemergt (#308 bis #325), mit Git als Archiv und der Gesamtgrenze der Doku
im Gate (Jannes 2026-10-26). Ohne Produktionsaufrufer
bleiben bewusst (Jannes 2026-10-26): `list_patient_treatment_evidence` (Behandlungsnachweis, §4.4,
ADR-004 Punkt 4; offen ist ihre Oberfläche für Streitfälle außerhalb der Praxis), die drei
Legal-Hold-Funktionen (ADR-008), `reapply_deletion_journal`, `bootstrap_practice`, die zwei
Importfunktionen des Lebensmittelkatalogs und `app.appointment_window_options`. Der Kreis
`billing <-> patients` bleibt: Die Stammdatenseite setzt Abschnitte der Abrechnung ein (ANN-754,
Jannes 2026-10-31).

**Teamchat, Radflotte und Barometer** bleiben fester Teil des Systems; Teamchat, Radflotte und
Personal bekommen keine neuen Funktionen, bis Schritt 3 und 4 stehen; Einsparungen ohne Verlust im
Kernbetrieb darf `/aufraeumen` vorschlagen. **Vereinfachungen** (Tiefenanalyse 4.6, 2026-10-26): M1,
M5, M7 und M9 sind zurückgebaut, das Barometer nur namentlich (Option A, §20.2, ANN-607); es bleiben
M2 Check-Up, M3 Teamchat (ohne Ausbau), M4 Barometer, M6 Ernährung und M8 Üben ohne Netz.

## Design-Review der Plattform, Lauf 1
Schritte 0 bis 4 sind gebaut (DRP-EPIC-001 bis -016), 2 bis 4 gesichtet. Je Schritt ein Handoff (sein Merge gibt frei),
je Teilschritt eine PR, geprüft mit `pnpm bildstrecke --nur=plattform,anmeldung`,
`plattform-barrierefreiheit.spec.ts` und der Ratsche in `src/designsystem.test.ts`. Befunde DR-101
bis DR-162 und Ideen N3 bis N9: `git show 9452575:docs/design/review-2026-10/lauf-1-bericht.md`;
Reihenfolge und Abgleich mit Lauf 2 (Praxis-App): `lauf-1-umsetzung.md`, Briefings in
`lauf-1-briefings/`, im selben Ordner.

| Schritt | Inhalt | Vorgabe | Stand |
| --- | --- | --- | --- |
| 5 Nachrichten | DR-137 bis DR-139; Wortlaut des Notfallhinweises bleibt | Briefing `05-nachrichten.md` | Leinwand bei Jannes |
| 6 Unterlagen und Verträge | DR-147 bis DR-149, DR-162; Vertragsabschluss als geführter Ablauf, Widerrufsbelehrung unverändert | Briefing `06-unterlagen-vertraege.md` | Leinwand bei Jannes |
| 7 Ich und Datenschutz | DR-151, DR-152; Einwilligungen ohne Drängen | Briefing `07-ich-datenschutz.md` | Leinwand bei Jannes |

## Ziel und Umfang
**Die Praxis eröffnet im Juli 2027**, der einzige Termin (2026-09-05), ohne Vorgängersystem und
Bestandsdaten; **zur Eröffnung läuft das Endprodukt** (2026-09-22, §14), anfangs vor allem für
Jannes, bald mit einer Bürokraft; neue Teammitglieder bindet der Owner selbst ein (§4). V1 umfasst:

1. **Kernprozess:** Akte, Verordnung, Termine, Doku, Leistungen, Rechnung, Zahlung, Löschung, Audit.
2. **Tagesroute** mit Karte, Fahrzeiten, Handoff und Führung am Handy, Hinweis auf die Liege (§9).
3. **Befund** mit Anamnese, Scores, Bausteinen, Therapiebericht, Erstaufnahme und Fotos (§5).
4. **Praxisverwaltung:** Warteliste, Anruflisten, Aufgaben, Kennzahlen, Steuerexport, Kartenzahlung.
5. **Trainingsbereich** in der Sicht der Betreuung.
6. **Plattform:** Patient:innen in zwei Stufen (§4.6), Kund:innen nach der Referenz-Navigation ohne
   das von §17 Verbotene (§4.10, `git show 9452575:docs/product/ideen/referenz-navigation.md`);
   Ansichten nach DSN-001 (`git show 9452575:docs/development/PLATTFORM-ANSICHTEN.md`).
7. **Angebote:** Nachsorge-Abo, Trainingspaket nach Zeitraum mit Plattform, Übergang (§4.10).
8. **Praxisbetrieb:** Radflotte, Teamkommunikation, Urlaub, Arbeitszeit, Zeitkonto, Erstattungen.
9. **KI-Assistenz** innerhalb von §6 und §17.

### Nicht in V1: scheitert an Rang 1 oder 2, zurück nur mit einer neuen Fassung der Stelle
| Was | Herkunft | Grund |
| --- | --- | --- |
| Automatische Progression, Regelwerk mit Korridor, Autoregulation als Vorschlag, Phasenwechsel und Wiedereinstieg als Automatik, Belastungssteuerung | `IDEA-TRN-001`/`-002`/`-006`/`-008` bis `-010`/`-012`/`-013`, `IDEA-QSN-004` | §17 Verbot 1, ADR-006 Punkt 10; B10; Register `src/app/mdr.ts` (`progression-regelwerk`). Die **von Hand** gesetzte Progression (`IDEA-TRN-004`, `-007`) ist gebaut |
| Ampel aus der Schmerzreaktion, Bewertung eines Verlaufs | `IDEA-TRN-003`, `IDEA-OUT-002` (bewertende Hälfte) | §17 Verbot 2; B10 |
| „KI-Analyse“ als Einschätzung, ableitende Übungsanalyse, Cut-off-Anzeige | Navigationspunkte 7 und 15 der Trainingsansicht (Fassung bis 7.22, Block 3), `IDEA-KI-006`, `IDEA-OUT-006` | §17, ADR-006 Punkt 13; Register in `src/app/mdr.ts`. Die **anzeigende** Übungsanalyse und die Zusammenfassung ohne Bewertung sind in V1 |
| Wearables und Gesundheits-Apps | `IDEA-TRK-007` | §14 (gesperrt), ADR-014; bräuchte eine native App (ADR-015 Punkt 21) |
| Mandantenfähigkeit mit Branding, Vermarktung | `IDEA-QSN-009` | §14, ADR-003 |
| Interoperabilität | `IDEA-QSN-008` | Die Idee selbst: benennen, nicht bauen |
| Verworfen | `IDEA-PRX-015`, `IDEA-PRX-036`, `IDEA-ANG-002` | E-13; Entscheidung 2026-09-11; B11 |
| GKV, E-Rechnung, Kassenbuch und TSE, Factoring | Produktvision §1.1 | Privatabrechnung (§19); keine Barkasse vorgesehen |

## Grundsätze der Reihenfolge
Jannes 2026-09-22 und 2026-09-23; ein Loop, der abweicht, sagt, gegen welchen.

1. **Erst schließen, dann öffnen:** Was die Behandlung am Tag braucht, vor dem, was sich öffnet.
2. **Fundament vor Oberfläche:** Additiv einziehen ist billig, nachträglich trennen teuer (ADR-014).
3. **Risiko vor Komfort, aber Bedienbarkeit ist kein Komfort:** Politur zuletzt, Bedienung früh.
4. **MDR-nahe zuletzt** (ADR-006 Punkt 13): Tracking, Fortschritt, KI nach Erfassen und Darstellen.
5. **Jeder neue Anbieter bleibt abschaltbar:** Adapter mit `mock`-Weg, ohne ihn benutzbar oder
   abgeschaltet; ein negatives Prüfergebnis kostet eine Funktion, nicht die Eröffnung.
6. **Sehen, was gebaut ist:** jede Oberfläche mit Bildstrecke vorher/nachher in der PR (Regel 1).

## Die Kette bis zur Eröffnung
Die Blöcke 0 bis 8 (Erledigt, Rückstand und Umbau, 1a Handy und UX-Fundament, Kern fertig,
Training, Plattformzugang, Angebote, Pläne und Rückfragen, Verlauf und Alltag, Praxisbetrieb) sind
gebaut bis auf FRB-EPIC-004 → -005 (Block 2) und ERN-EPIC-004 → -005 → -006 → ORG-EPIC-001 (Block
7; die ERN-Epics ersetzen ALT-EPIC-002). Offen bei Jannes aus diesen Blöcken: Sichtungen (Rückstand,
Handy, Training, Verlauf), D2/D3 aus dem FRB-Plan, Bilder zu den Tests, Abo- und Paketpreise (bis
dahin synthetisch), die Tübinger Standortvorlage (Depot, Werkstatt). Danach in fester Reihenfolge:

| # | Block | Code | Docs und Jannes |
| --- | --- | --- | --- |
| 9 | **Assistenz und Komfort** | KI-EPIC-001 → KI-EPIC-002 → MAP-007 → PRX-EPIC-004 → UI-003 | Sichtung |
| 10 | **Feature-Freeze** | nur Befunde | Betriebsdokumentation · Probewoche 1 · Kollegin-Test · **M2** |
| 11 | **Prüfungen**, ab Anfang 2027 **parallel** | Befunde aus den Prüfungen | DSFA-Paket (G14) und Anfragen bis Ende 2026 vorbereiten, dann Antworten einarbeiten · OPS-001-Unterlagen · B1, B2, B4, B8 · Anbieterverträge |
| 12 | **Betriebsreife** | OPS-002 → OPS-003 → OPS-004 Rest → OPS-007-Probe | BETRIEB-001 · Rückfallplan · Kurzanleitung · Cloudprojekt (G3) · Restore-Test 1 und 2 · Notfallzugang |
| 13 | **Gate und Produktion** | keine Epics | Nachweistabelle MUSS → Test · **M3** Gate · **M4** Produktion |
| 14 | **Eröffnung** | Hotfixes | Erster-Tag-Protokoll · Schulung · Probewoche 2 · Restore-Test 3 · Change-Freeze · **M5** · **M6** |

**Block 11 läuft ab Anfang 2027 neben dem Bauen** (E-1); Block 12 beginnt, sobald OPS-001 positiv
ist und das Cloudprojekt steht, ohne auf B1 und B2 zu warten. Docs-Sessions dürfen vorher laufen.
Ein offenes Epic zieht die Bereichsüberholung seines Bereichs mit (`/bereich`, Jannes 2026-10-12;
die Überholungen 1 bis 11 sind gebaut).

## Meilensteine: erreicht, wenn alle Kriterien erfüllt sind (ohne Datum)
| MS | Name | Kriterien |
| --- | --- | --- |
| M1 | Kernprozess Ende-zu-Ende | Ein synthetischer Fall läuft **lokal** durch: Verordnung → Serie → Termin durchgeführt → Dokumentation finalisiert → Leistung → Rechnung → Zahlung · derselbe Fall als E2E-Test hinter der Anmeldung · von Jannes gesichtet · jede Datenklasse hat Löschpfad und Test |
| M2 | Software fertig (Feature-Freeze V1) | Blöcke 1 bis 9 gebaut **und gesichtet** · jede Funktion mit ungeprüftem Anbieter ist ohne ihn benutzbar oder abgeschaltet · Probewoche 1 durchlaufen, Befunde geschlossen · Kollegin-Test durchlaufen · DSFA-Paket und Anfragen verschickt · kein offener Befund der Klasse „Datenverlust/Falschzuordnung“ |
| M3 | Go-live-Gate | Ergebnisse aus B1, B2 (DSFA) und B4 liegen vor und sind eingearbeitet · OPS-001 positiv · jede Anbieterprüfung positiv **oder** die Funktion abgeschaltet · ADR-007 sieben Vorbedingungen · kein Register-Eintrag Datenschutz/Recht auf `offen` oder `entschieden (Jannes)` · Restore-Test 1 und 2 · Deployment aus Tag mit Freigabe · Redaction-Prüfung grün · Betriebsdokumentation (13 Positionen) · OPS-007 gegen die Test-Umgebung geprobt · Rückfallplan unterschrieben · Messrunde der Kernabläufe ([`../product/kernablaeufe.md`](../product/kernablaeufe.md)) · Sitzungssperre nach ADR-025 gebaut und gesichtet (G20) · Branch Protection mit Secret Scanning und Push Protection |
| M4 | Produktionssystem steht | Produktivprojekt in freigegebener EU-Region aus dem freigegebenen Tag · OPS-007 durchlaufen · keine synthetischen Daten · Backup, Monitoring und Release-Takt nach BETRIEB-001 aktiv |
| M5 | Eröffnung | **Juli 2027.** Probewoche 2 durchlaufen · Restore-Test 3 · Change-Freeze eingehalten · Datenschutzinformation und Behandlungsvertrag nennen alle Auftragsverarbeiter · erster Behandlungstag läuft mit der Software |
| M6 | Erster Betriebsmonat | Vier Wochen ohne Befund der Klasse „Datenverlust/Falschzuordnung“ · Störfallliste ausgewertet · Optimierungsrunde durchgeführt |

## Abweichungsregeln
1. **Sichtung statt Abnahme je Epic** (E-6; über Bilder seit 2026-10-12): ohne Oberfläche fertig mit
   grüner CI, `pnpm test:db` und Zweitreview; mit Oberfläche sichtet Jannes die selbst geprüfte
   Bildstrecke mit `/sichtung` ([`../sichtung/`](../sichtung/README.md)), höchstens 20 Punkte.
2. **Das Bauen dauert länger:** Der Umfang wird nicht gekürzt (2026-09-22), die Anfragen laufen; ohne
   M4 eröffnet die Praxis mit Papier (H4), nie auf Kosten des Datenschutzes (§16).
3. **Eine Prüfung widerlegt eine Annahme:** Sie wird an ihrer einen Stelle umgestellt (§15.2); die
   Funktion bleibt bis dahin abgeschaltet (Grundsatz 5), alles andere geht weiter.
4. **Eine neue Idee kommt dazu:** Ideen nach dem 2026-09-22 gehen in den Ideenspeicher und stehen
   **nach V1**, bis Jannes sie ausdrücklich in eine Etappe legt. Nach M2 kommt nichts mehr dazu.

## Risiken
| Nr | Risiko | Eintritt | Wirkung | Frühindikator | Gegenmaßnahme |
| --- | --- | --- | --- | --- | --- |
| R1 | **Die Prüfungen kommen zu spät für Juli 2027.** B2 mit DSFA und B1 brauchen erfahrungsgemäß vier bis sechs Monate | mittel | sehr hoch | Die Anfragen sind im Januar 2027 nicht verschickt | Anfragen ab Anfang 2027 parallel zum Bauen (E-1); DSFA-Paket und Anfragen bis Ende 2026 vorbereiten; später Gebautes als Nachtrag; Rückfall H4 |
| R2 | Providerprüfung Supabase negativ, und das erst 2027 | niedrig | sehr hoch | Gate-Punkt 3 (§203 Abs. 4 StGB) unbeantwortet | Nähte eines Wechsels in Teil 7 von [`../decisions/providerpruefung-supabase.md`](../decisions/providerpruefung-supabase.md); die Unterlagen aus Teil 9 zu laden kostet nichts und ist keine Anfrage |
| R3 | Jannes' Zeit reicht nicht für Abnahmen (**eingetreten**: über 30 Epics ohne Abnahme) | eingetreten | hoch | Ein Block endet ohne Sichtung | Sichtung statt Abnahme (Regel 1) über die Bildstrecke jeder PR; offene Klickschritte per Bildstrecke triagiert; Test-Umgebung fürs Handy |
| R12 | Die Oberfläche passt nicht zur Arbeit am Rad und wird spät nachgearbeitet | mittel | hoch | Jannes findet Begriffe oder Abläufe unklar | UX-Fundament in Block 1a; Begriffsliste als Maßstab jeder neuen Oberfläche; Sichtung am Handy |
| R4 | Der Umfang ist rund dreimal so groß wie in 5.49 | hoch | hoch | Block 4 beginnt nicht, während Block 2 noch offen ist | Reihenfolge nach Grundsatz 3; Bereichsüberholungen in großen Schritten mit unveränderten Gates, Bildstrecke und Zweitreview je kritischem Teil; Tempo in der Planung zählen (`/weiter`) |
| R5 | Die Plattform öffnet die Anwendung nach außen (Konten für Patient:innen und Kund:innen) | mittel | sehr hoch | ein Portalpfad ohne Negativfall in `pnpm test:db` | ADR-023; jede Portalsicht mit Negativfall „fremde Person“; Zweitreview Pflicht (ADR-013 Punkt 9) |
| R6 | Befunde aus der Sichtung kommen als Welle | hoch | mittel | Rückstand wächst | Abweichungsregel 1; Befunde als erste Story der nächsten Überholung desselben Bereichs |
| R7 | MDR: Tracking, Fortschritt und KI rücken an die Grenze | mittel | sehr hoch | eine Story, die eine Aussage **über** Daten erzeugt statt sie zu zeigen | §17 und das Register `src/app/mdr.ts`; „Nicht in V1“ oben; B1 prüft den ganzen Umfang |
| R8 | Kein Mailversand an Patient:innen: Die Plattform braucht Einladungen und Hinweise, der eingebaute Versand stellt nur ans Projektteam zu (BEF-026, B13) | hoch | hoch | Plattform ohne Zustellweg | Versand hinter einem Adapter mit `mock`-Weg (Grundsatz 5); eigener SMTP-Anbieter als Anbieterprüfung in Block 11 |
| R9 | `pg_cron`, PITR und Logfrist halten beim Provider nicht (R14 alt) | mittel | mittel | Produktivprojekt ohne PITR | PITR als Bedingung im Anlage-Runbook (G3); Logfrist `BETRIEBSLOG_FRIST_TAGE` in `src/lib/protokoll.ts`, Entscheidung bei Jannes |
| R10 | Mobile Endgeräte ohne Richtlinie | mittel | hoch | TOM ohne Abschnitt Endgeräte | Endgeräte-Richtlinie in G14/G16; MFA einrichtbar (ANN-028) |
| R11 | PTV Developer scheitert am Vertrags-/§203-Gate | mittel | mittel | ein Gate-Punkt aus Teil 5 negativ | Adapter hinter `contract.ts`; zweite Wahl MapTiler und HERE mit eigener Prüfung |

## Offene Loops bis M2
Zuschnitt, keine Spec. Ernährung (ADR-027): je Epic Pfad A, fertig mit dem Budget am Seed gemessen
(375 px, Playwright); die gebauten Epics prüfen `ernaehrung.spec.ts` und `tagebuch.spec.ts`.

| Block | Loop | Ergebnis und Zuschnitt | Vorgabe |
| --- | --- | --- | --- |
| 2 | **FRB-EPIC-004** | Skalen in der Verlaufsdoku antippen statt tippen: startet mit der Aktivierung von NRS und Veränderungsfrage (ANN-099; Wortlaut freigegeben 2026-09-28/29 als **Praxisvorgaben**, nicht als validierte Schmerz-NRS; **PSFS gestrichen**; die Definitionsdateien werden hier nachgezogen); Erhebung an der Dokumentation, gespeichert und als Zeile im Vorschlag, kein zweiter Wert neben der Erhebung (§13); die **Veränderungsfrage steht ab dem zweiten Termin je Patient:in oben** (Jannes 2026-09-28) | §5, FRB-EPIC-001; Plan bis 2026-10-27: `git show 9452575:docs/development/FRB-BAUSTEINE-UND-SCORES.md` (Leitprinzip, MDR-Grenze; die Phasen P4 bis P6 mit D4 bis D6 sind nicht eingeplant) |
| 2 | **FRB-EPIC-005** | Ein Bild ruft den Test in Erinnerung: optionales Bild je Test in der Definition, beim Abhaken gezeigt, ohne Bewertung (ADR-006); startet, sobald Bilder vorliegen (eigene Zeichnung, Lizenz nach B8 oder Foto nach §20) | `IDEA-OUT-009` |
| 7 | **ERN-EPIC-004** | Barcode: Scan mit der Kamera ohne Bildspeicherung, Nachschlagen nur im eigenen Auszug, unbekannt → Suche oder eigenes Lebensmittel; fertig mit Produkt per Scan in ≤ 3 Tipps | ADR-027 |
| 7 | **ERN-EPIC-005** | Pläne und Rezepte: Rezepte aus Zutaten, Tagesvorschläge und Pläne von der Beratung, Startinhalte (≈ 30 Rezepte); fertig mit Plan in ≤ 10 Minuten zugewiesen, Rezept mit einem Tipp ins Tagebuch | ADR-027 |
| 7 | **ERN-EPIC-006** | Verlauf für die Beratung: Wochenmittel neben Zielwerten, Gewicht, neben Check-ins und Training im Verlauf; fertig mit Sitzung aus einer Ansicht vorbereitet | ADR-027 |
| 7 | **ORG-EPIC-001** | Eine Person auf einen Blick, die Sitzung ist vorbereitet: Zeitstrahl über alle Bereiche, Sitzungsvorbereitung für die Praxis, Übersicht je Person | `IDEA-QSN-001`, `IDEA-ORG-001`, `-005` |
| 9 | **KI-EPIC-001** | Diktieren statt tippen, mit geprüftem Entwurf: Gateway nach ADR-005 mit `mock`-Adapter, Sprachdokumentation nach §6.3 mit Weg ohne Sprechen (§5), Nutzung sichtbar; Anbieter C6 in Block 11 | `IDEA-KI-001`, `-005`, `-007` |
| 9 | **KI-EPIC-002** | Sprache umformen, ohne Inhalt hinzuzufügen: Freitext strukturieren, Patientensprache, Antwortentwürfe, Zusammenfassung ohne Bewertung, **Felder der Verordnung aus dem Foto vorschlagen**, jeweils mit Quellenbindung und menschlicher Freigabe | `IDEA-KI-002`, `-003`, `-004` |
| 9 | **MAP-007** | Führung auf dem Gerät, ohne dass die Praxis die Position erfährt (ADR-019 Abschnitt F, §20.1: Position nur auf dem Gerät, Start nur auf Aktion, Übermittlung nur zur Neuberechnung, keine Auswertung). Zuerst **E-24** (liefern die Radprofile Manöver? ein Aufruf; ohne Ja entfällt das Epic), B2 in erweiterter Fassung und das Aufrufkontingent; Stories MAP-007a bis -f, keine rein visuelle Führung (ADR-019 Punkt 31), synthetische Adressen | `IDEA-PRX-044`; Vorgabe `git show 9452575:docs/development/MAP-LOOPS.md` |
| 9 | **PRX-EPIC-004** | Komfort für die Praxisführung: Kennzahlen für Training, Abo und Pakete (auf STA-EPIC-001), Export für die Steuerberatung (Format als Annahme bis B4), Farbcodierung je Terminart und Person, Kalender-Abo (Bedenken: ohne Namen), Planungskarte der aktiven Adressen (Bedenken), Kartenzahlung beim Hausbesuch hinter Adapter (Grundsatz 5) | `IDEA-PRX-026`, `-021`, `-024`, `-033`, `-022` |
| 9 | **UI-003** | Feinschliff und Barrierefreiheit über alle Seiten (G17): Feindesign, PWA-Manifest, was die Bereichsüberholungen übrig lassen | — |

## Blöcke 10 bis 14: vom Freeze bis zur Eröffnung
**Etappe G, Betriebsreife** (G18 ist das Gate M3; G20 und G22 nach ADR-025 sind gebaut):

| # | Paket | Stand und Inhalt | Wer |
| --- | --- | --- | --- |
| G3 | OPS-001 Providerprüfung und Cloudprojekt | Dokument seit 2026-09-21, **nichts bestanden**. Ab Anfang 2027 (E-1): Unterlagen aus Teil 9, zwei Supportfragen, Gate-Punkte 1 bis 6 mit B2; **dann** Cloudprojekt in EU-Region, Dev/Test/Prod, PITR als Bedingung; Löschlauf und Finalisierung laufen nur mit `pg_cron`, die Registrierung nachweisen (ANN-007); Einstellungen des Anmeldedienstes für G20 (`jwt_expiry`, ANN-044) | Jannes (Anlage) |
| G5 | OPS-002 Deployment und Freigabe | Frontend-Hosting mit Prüfung nach ADR-002, Release aus Tag, Migrationen nur über die Pipeline, Rollback, Review-Checkliste aus ADR-013 in der Pipeline; die Test-Umgebung ist als OPS-002a vorgezogen | Claude, Jannes (Freigabe) |
| G6 | OPS-004 Rest | Alarmierung, Security-Log 12 Monate, Erkennung für Art. 33, Audit-Abfrage als Runbook; setzt G3 voraus | Claude |
| G7 | OPS-003 Backup und Restore | PITR, Sicherung des Objektspeichers (eigener Weg, RPO ≤ 1 h), dreistufige Wiederherstellung, Notfallzugang, Betriebsdokumentation mit 13 Positionen; das Löschjournal vor der Rückspielung sichern, danach einspielen, dann `reapply_deletion_journal()` und offen gebliebene Zusammenführungen nachziehen (ADR-008 Punkt 8, ADR-012, ANN-031, ANN-150) | Jannes und Claude |
| G10 | E2 Ausfallkonzept | Praxisprozess für einen Tag ohne Anwendung (ADR-012 Punkt 8), eine Seite; die Tagesliste der Übersicht ist die Bereitstellung (ANN-021). Zugleich Rückfallplan H4 | Jannes |
| G11 | OPS-007 Bootstrap | Runbook und Funktion gebaut, lokal geprobt; Probe gegen die Test-Umgebung nach G5 | Jannes (Durchlauf) |
| G12 | ADR-019 Gate | Vertragscheck PTV Developer (Punkt 9), Paid Plan und Server-Schlüssel, DSFA-Wiedervorlage | Jannes mit B2 |
| G13 | Steuerliche Grundeinstellungen | Umsatzsteuer-Status, Wortlaut des Befreiungshinweises, Kürzel `RG`/`TR`, ermäßigter Satz, Steuer auf Abo und Pakete, echte Preise; bis dahin Annahmen (ANN-074/075/082) | Jannes mit B4 |
| G14 | DSFA-Paket | Schwellwertprüfung, VVT, TOM mit Endgeräte-Richtlinie, Löschkonzept, Subprozessoren, Datenschutzinformationen, Betroffenenrechte, Breach-Prozess, Nachweistabelle MUSS → Test, Zweckbestimmung; **fertig bis Ende 2026**, verschickt ab Anfang 2027 (E-1), Nachträge für später Gebautes | Claude (Entwurf), Jannes, B2 |
| G15 | B1 Regulatorische Prüfung | Zweckbestimmung, MDR-Abgrenzung, EU AI Act über den **ganzen** V1-Umfang | Jannes, extern |
| G16 | BETRIEB-001 | Störungsmeldung, Triage, Hotfix-Weg, Release-Takt nach M4, Change-Freeze um M5, Endgeräte, Vertretung | Jannes mit Claude |
| G21 | **STAFF-005 Einladung ganz aus der Anwendung** | Neue Mitarbeitende werden ohne Konto auf der Oberfläche des Anmeldedienstes eingeladen (Jannes 2026-10-02, zu ANN-025): Zugangsdienst wie bei der Plattform (ADR-023 Punkt 9), Einladung vor Ort per QR oder per Mail (B13); löst ANN-025 ab | Claude |

**Etappe H, Eröffnung:** H1 **Probewoche 1** (Test-Umgebung, Praxiswoche aus dem Seed, zweite
Person) · H2 Kurzanleitung, Schulung je Rolle · H3 Produktionssystem (M4) · H4 **Rückfallplan**
(Tagesliste morgens, ANN-021; Papier mit Nachtrag binnen 24 h; **Rechnungen ruhen**, eine
Nummernlücke nach §14 UStG ist nicht heilbar; Abbruchkriterien; Export nach G9) ·
H5 **Probewoche 2** · H6 Eröffnung (M5) mit Change-Freeze, Restore-Test 3, Störfallliste · H7 erster
Monat (M6).

## Entscheidungen und Prüfungen
**Externe Prüfungen** (OPS-001, B1 bis B5, B8, B9, Anbieter) mit der Festlegung, die bis zur Antwort
trägt: [`OPEN_DECISIONS.md`](../decisions/OPEN_DECISIONS.md), Abschnitt „Externe Prüfungen“.

**Bei Jannes, hält kein Bauen auf:** Logfrist (R14 alt: ADR-011 Punkt 4 senken oder Ausleitung als
zweiter Auftragsverarbeiter; entschieden 2026-10-10: nach G3, vor echten Daten) · B13/BEF-026:
welcher SMTP-Anbieter (Block 11; STAFF-004 ruht bis dahin) · Sichtung des Kartendienstes mit MAP-005
Teil B am Telefon (bis dahin `MAX_ZWISCHENZIELE` bei drei) · die drei Lücken der MT-Vorlage (D2/D3
gelten wie vorgeschlagen, ANN-118, ANN-119) · ob Secret Scanning und Push Protection an sind
(`docs/DEVELOPMENT.md`, „Manuelle Schritte“).

**Festzuhalten:** Das PTV-Free-Abo trägt nur den Prototyp; der Betrieb braucht den Standard Plan
(ADR-019 Punkt 9), der Server-Schlüssel ist ein lokales Secret bei Jannes. Das Lastenradprofil hängt
an `TravelProfile` (`src/lib/location/contract.ts`); die Matrix-Schreibweise ist nicht gegen die
echte API geprüft. Vor der ersten echten Datei OPS-001, ein getesteter Sicherungsweg für den
Objektspeicher (ADR-017, OPS-003) und `patient-file-access.spec.ts` gegen die Test-Umgebung
(ANN-052). Wartung: `[inbucket]` in `supabase/config.toml` wird `[local_smtp]`. Ungeplant: das
Adressfragment `verordnungen` → `grundlagen` (ANN-062) und die Teilung von
`src/features/patients/treatment-bases` nimmt ein Loop mit, der ohnehin dort arbeitet.

## Fortschritt
Einzige Quelle ist [`fortschritt.json`](fortschritt.json) (`status`, `fertig_am`, `nachweis`,
`gesichtet_am`); die Tabelle schreibt `pnpm fortschritt --schreiben`, `pnpm docs:check` prüft sie.
Ausführliche Nachweise bis 2026-10-27: `git show 9452575:docs/development/fortschritt.json`.
**fertig** zählt 0,85, **gesichtet** 1 (Regel 1), `vorläufig` und `entwurf` 0,5, `in Arbeit` 0,4.
Blöcke: **A** Kernprozess, **B** V1-Ausbau, **C** Betriebsreife, **D** Eröffnung, **E** Prüfungen.

<!-- fortschritt:anfang (erzeugt von pnpm fortschritt --schreiben, nicht von Hand aendern) -->
| Block | Posten | Status | Fertig am | Nachweis | Gesichtet am | Vermerk |
| --- | --- | --- | --- | --- | --- | --- |
| A | Fundament: PAT-001 bis PAT-004, CAL-001 bis CAL-006, STAFF-001 | gesichtet | vor 2026-09-01 | PR #1, `e70775a`, `ca907e9` | 2026-09-28 | — |
| A | DOK-EPIC (DOK-001 bis DOK-004) | gesichtet | 2026-09-05 | PR #5, `21d85dd`, `e931068` | 2026-09-11 | — |
| A | VER-EPIC-001 Verordnungen | gesichtet | 2026-09-07 | `2c3c1de` … `159c1bb` | 2026-09-11 | — |
| A | UI-000 Fundament der Oberfläche | gesichtet | 2026-09-07 | `4a4440f` … `e6b4ab6` | 2026-09-11 | — |
| A | MARKE-001 Marke in der Anwendung | gesichtet | 2026-09-11 | PR #19 | 2026-09-11 | — |
| A | UX-EPIC-001 Hausbesuchstag (11 Stories) | gesichtet | 2026-09-11 | PR #18 | 2026-09-11 | — |
| A | LOE-EPIC-001 Löschung und Retention (5 Stories) | gesichtet | 2026-09-11 | PR #25 | 2026-09-11 | — |
| A | CAL-EPIC-003a Terminzustände | gesichtet | 2026-09-12 | PR #28 | 2026-09-12 | — |
| A | CAL-EPIC-003b Serie und Terminfenster (mit CAL-012 und CAL-013) | gesichtet | 2026-09-12 | `b2626ae`, `89ab30b`, `acddcc6` | 2026-09-28 | — |
| A | DAT-EPIC-001 Dateiablage (G4) | fertig | 2026-09-13 | `84bec9b` … `fd10a37` | — | — |
| A | ROL-EPIC-001 Office liest klinische Inhalte (E15) | gesichtet | 2026-09-15 | PR #41 | 2026-09-28 | — |
| A | CAL-018 Hausbesuch-Szenarien (E14) | gesichtet | 2026-09-16 | `dc529a7`, `6a11fb0` | 2026-09-28 | — |
| A | CAL-EPIC-004a Freie Terminlänge, Rückfrage beim Ziehen | gesichtet | 2026-09-18 | `ee81ea7`, `e189183` … `1b132ea` | 2026-09-28 | — |
| A | CAL-EPIC-004b Anlegen-Menü, Fehlzeit und Dauerfehlzeit (CAL-019, CAL-021) | gesichtet | 2026-09-18 | `e189183`, `32b8ec9`, `2cb0327`, `e13a9e2`, `1b132ea`; Chronik 5.9 (BEF-017) | 2026-09-28 | — |
| A | CAL-EPIC-004c Termine der Akte je Grundlage, Übertragen auf eine Folgeverordnung (AKTE-006) | gesichtet | 2026-09-18 | Chronik, Loop-Tabelle 2026-09-18 (`ee81ea7` … `1b132ea`); BEF-006, BEF-007 (BEF-017) | 2026-09-28 | — |
| A | UX-013 Funktionssuche in der Kopfleiste (E17 Fassung 2) | gesichtet | 2026-09-18 | Chronik 5.10 (BEF-017) | 2026-09-28 | — |
| A | GRD-001 Behandlungsgrundlage: Verordnung und Selbstzahler (ADR-020) | gesichtet | 2026-09-18 | Chronik 5.11 (BEF-017) | 2026-09-28 | — |
| A | FIX-EPIC-004 Kalender-Bedienung (BEF-012 bis BEF-016) | gesichtet | 2026-09-18 | `14a1fa7` … `856a5ac` | 2026-09-28 | — |
| A | VER-EPIC-002 Verordnung im Office-Alltag | gesichtet | 2026-09-18 | `f734e55`, `ba19245` | 2026-09-28 | — |
| A | ABR-EPIC-001 Leistungen und Katalog | gesichtet | 2026-09-19 | `3874e83` … `a1384ce` | 2026-09-28 | — |
| A | ABR-EPIC-002a Rechnung entsteht | gesichtet | 2026-09-19 | `3874e83` … `a1384ce` | 2026-09-28 | — |
| A | ABR-EPIC-002b Rechnung als Dokument | gesichtet | 2026-09-19 | `3874e83` … `a1384ce` | 2026-09-28 | — |
| A | ABR-EPIC-003 Zahlungen und offene Posten | gesichtet | 2026-09-19 | `3874e83` … `a1384ce` | 2026-09-28 | — |
| A | PAT-006 Datenschutzinformation und Einwilligungen (G8) | fertig | 2026-09-22 | `4764d90`, `8569f3d`, `1706cb1` | — | — |
| A | ABR-EPIC-004 Befreiungsgrund (BEF-019) und § 14c-Riegel (Etappe L) | fertig | 2026-09-20 | `dfe96a8`, `d8f3ea4` | — | — |
| A | LEI-EPIC-001 Trainingsverhältnis mit eigener Frist und Rolle (Etappe L) | gesichtet | 2026-09-20 | PR #72 | 2026-09-29 | — |
| A | CAL-EPIC-005 Terminkontext und Trainingsgrundlage (Etappe L) | gesichtet | 2026-09-21 | `e268f96`, `0c8920c`, `120445f` | 2026-09-29 | — |
| A | ABR-EPIC-005 Leistungsbereich je Rechnung, getrennte Nummernkreise (Etappe L) | fertig | 2026-09-21 | `0fcac3e` … `6d6261f` | — | — |
| A | ABR-EPIC-006 Auswertung „Einnahmen je Leistungsart" (Etappe L) | fertig | 2026-09-21 | `0fcac3e` … `6d6261f` | — | — |
| B | UX-EPIC-002 Begriffe und Bedienprinzipien (Block 1a) | gesichtet | 2026-09-26 | `aafe0cd` … `ac8516f` | 2026-09-28 | Sichtung Kernprozess 2026-09-28 (Android und Windows) |
| B | UX-EPIC-003 Tagesansicht fürs Handy (Block 1a) | gesichtet | 2026-09-26 | `46ebc9e` … (UX-003a, UX-003c, Zweitreview) | 2026-09-28 | Sichtung Kernprozess 2026-09-28, Schritte 10 und 12 |
| B | MAP-002 In-App-Kartenprototyp | fertig | 2026-09-21 | `c85c56e` … `ea2d9aa` | — | — |
| B | MAP-003 Fahrradroute als Linie | fertig | 2026-09-21 | `cbc6c07`, `71756aa`, `d66ea31` | — | — |
| B | MAP-004 Fahrzeiten und Erreichbarkeit | fertig | 2026-09-22 | `ce5dbe4` … `0e27b4f` | — | — |
| B | MAP-005 Navigations-Handoff mit Koordinaten | fertig | 2026-09-22 | `cf03057`, `ef74eec` | — | Teil A gesichtet 2026-09-22, Teil B am Telefon offen |
| B | MAP-006 Tagesroute mit Fahrpuffer (Block 2) | fertig | 2026-09-25 | `6cb52b2` … `a0cc774` | — | mit synthetischen Adressen; Scharfschalten am Gate aus ADR-019 Punkt 9 (LOCATION_DATA_GATE) |
| B | FRB-EPIC-000 Schema und Validator der Instrumente | fertig | 2026-09-21 | `0e988d5`, `53fd542`, `dc9c963`, `6dbe377` | — | — |
| B | FRB-EPIC-001 Instrumentenbibliothek | fertig | 2026-09-25 | `7056777`, `8aa5d7d`, `f7bb47b` | — | — |
| B | FRB-EPIC-002 Anamnese und Verlauf | fertig | 2026-09-26 | `44b6dcb`, `2d23d91`, `95532e9`, `bf800be`, `68f9b50` | — | — |
| B | FRB-EPIC-003 Befund mit Bausteinen | fertig | 2026-09-26 | `0483a60`, `b80cd6a`, `b621339` (FRB-003a bis c, Zweitreview) | — | Sichtung: Befund Schritte 6 und 7 |
| B | DOK-005 Therapiebericht | fertig | 2026-09-26 | `f7d5b6b`, `5041f31`, `a7b0890` (DOK-005a und b, Zweitreview) | — | Sichtung: Befund Schritte 8 und 9 |
| B | DOK-006 Fotos in der Akte | fertig | 2026-09-26 | `0319ee9` … `88686ea` (ADR-017 Fassung 2), `141aaee` … `5d11f19` (DOK-006a bis d, Zweitreview) | — | Sichtung: Befund Schritte 10 bis 12 |
| B | PRX-EPIC-001 Warteliste und Terminsuche | gesichtet | 2026-09-28 | `222fccd` … `e01b575` (PRX-001 bis PRX-004), `53f89ad` (Zweitreview), PR #136 | 2026-09-28 | Sichtung: Praxisverwaltung Schritte 1 bis 3 (Befund BEF-071) |
| B | PRX-EPIC-002 Am Termin | gesichtet | 2026-09-28 | `0f7e6af` … `25d54af` (PRX-005 bis PRX-009) | 2026-09-29 | Sichtung: Praxisverwaltung Schritte 4 bis 6 (BEF-080, BEF-081) |
| B | UX-EPIC-004 Ruhiger und übersichtlicher (BEF-071 bis BEF-081) | fertig | 2026-09-29 | UX-004a bis UX-004e | — | Sichtung: Praxisverwaltung Schritte 7 bis 9 |
| B | UX-EPIC-005 Entrümpeln: Terminseite, Hausbesuch-Ablauf, Arbeitszeit im Kalender, alle Bereiche (BEF-084 bis BEF-091) | fertig | 2026-09-30 | UX-005a bis UX-005i, Branch `claude/sleepy-fermi-9ykp3k` | — | Sichtung: Praxisverwaltung Schritt 9 |
| B | UX-EPIC-006 Ein Funkloch kostet keinen Text und sagt, was los ist (BEF-046, BEF-047 Teil 2, BEF-070) | fertig | 2026-10-10 | UX-006a bis UX-006c, Branch `claude/clever-clarke-m3slaf`, Zweitreview | — | Sichtung: Rahmen Schritte 13 bis 15 |
| B | UX-EPIC-007 Dokumentation und Akte: nichts geht verloren, der nächste Schritt ist sichtbar (BEF-055, BEF-056, BEF-058, BEF-059, BEF-060) | fertig | 2026-10-10 | UX-007a bis UX-007e, Branch `ccr-fdcd8c84-grfo2u`, Zweitreview | — | Sichtung: UX-Review Schritte 1 bis 3 |
| B | UX-EPIC-008 Unumkehrbares fragt nach, Korrekturen finden ihren Weg (BEF-062, BEF-063, BEF-064) | fertig | 2026-10-10 | UX-008a bis UX-008d, Branch `claude/lucid-fermi-t262t6`, Zweitreview | — | Sichtung: UX-Review Schritte 4 bis 6 |
| B | UX-EPIC-009 Papier, Nachweise und Wörter sprechen Praxissprache (BEF-052, BEF-065, BEF-067) | fertig | 2026-10-10 | UX-009a bis UX-009c, Branch `claude/beautiful-ramanujan-3q4yk0`, Zweitreview | — | Sichtung: UX-Review Schritte 7 bis 9 |
| B | PRX-EPIC-003 Nichts fällt durch | fertig | 2026-09-29 | PRX-010 bis PRX-016 | — | Sichtung: Praxisverwaltung Schritte 10 bis 12 |
| B | PRX-EPIC-003b Dubletten zusammenführen | fertig | 2026-09-29 | PRX-017, PRX-018 | — | Sichtung: Praxisverwaltung Schritt 13 |
| B | STA-EPIC-001 Statistiken: fünf Kennzahlen zur Praxissteuerung | fertig | 2026-09-29 | STA-001 bis STA-007 | — | Sichtung: Praxisverwaltung Schritte 14 und 15 |
| B | TRN-EPIC-001 Trainingskund:in anlegen | fertig | 2026-09-30 | TRN-001 bis TRN-003 | — | Sichtung: Training Schritte 1 bis 3 |
| B | TRN-EPIC-002 Trainingstermine | fertig | 2026-09-30 | TRN-004 bis TRN-006 | — | Sichtung: Training Schritte 4 bis 6 |
| B | TRN-EPIC-003 Trainingsrechnung | fertig | 2026-09-30 | TRN-007, TRN-008, Zweitreview | — | Sichtung: Training Schritte 7 bis 9 |
| B | TRN-EPIC-004 Trainingsprotokoll | fertig | 2026-09-30 | TRN-009, TRN-010, Zweitreview | — | Sichtung: Training Schritte 10 bis 12 |
| B | DSN-001 Ansichten der Plattform für Patient:innen und Betreuung (Docs) | gesichtet | 2026-09-30 | git show 9452575:docs/development/PLATTFORM-ANSICHTEN.md | — | D1 bis D7 von Jannes bestätigt (2026-09-30, wie empfohlen) |
| B | POR-EPIC-001 Plattformzugang | fertig | 2026-09-30 | POR-001 bis POR-004, Zweitreview | — | Sichtung: Plattform Schritte 1 und 2 |
| B | POR-EPIC-001b Vertretung | fertig | 2026-10-02 | POR-005 bis POR-007, Zweitreview | — | Sichtung: Plattform Schritte 3 und 4 |
| B | ABN-EPIC-001 Abnahme der Annahmen, Blöcke 2, 3, 4 und 9 | fertig | 2026-10-02 | ABN-001 bis ABN-012, Zweitreview | — | Sichtung: Plattform Schritte 5 bis 7 |
| B | ABN-EPIC-001b Abnahme der Annahmen, Blöcke 5 bis 8 | fertig | 2026-10-02 | ABN-013 bis ABN-022, Zweitreview | — | ohne BEF-105, -106, -109 (ABN-EPIC-001c); Sichtung: Befund und Training je Schritte 13 bis 15 |
| B | ABN-EPIC-001c Dateien, Dokumentationsfotos, Kartendienst (BEF-105, -106, -109) | fertig | 2026-10-02 | ABN-023 bis ABN-028, Zweitreview; vorher ADR-017 Fassung 3, ADR-019 Fassung 5 (PR #170) | — | Edge Function patient-file-verify gebaut, scharf mit OPS-001; PDF in der App offen (ANN-223); Sichtung: Befund Schritte 10 bis 12, Kartendienst Schritt 9 |
| B | ABN-EPIC-002 Abnahme vom 09.10.2026 (BEF-133 bis BEF-137) | fertig | 2026-10-09 | ABN-029 bis ABN-034, Zweitreview; Prinzipien 0.22, ADR-021 Fassung 3, ADR-017 Fassung 4 | — | BEF-138 als eigener Pull Request (bef-138); Sichtung: Befund Schritte 10 bis 12 |
| B | BEF-138 Abruf freigegebener Dokumente über die Plattform ohne Protokoll | fertig | 2026-10-10 | ADR-010 Fassung 4 (Punkt 22) | — | Merge erst mit Label freigabe-audit (Jannes); Sichtung: Plattform Schritt 12 |
| B | BEF-139 Das Büro antwortet im Training auch auf „Sonstiges“ | gesichtet | 2026-10-10 | ANN-311 Fassung 3; Migration 20261022130000, practice-messages.test.ts (Gegenprobe ohne Migration rot); Zweitreview | — | ohne Oberfläche; Sichtung Pläne Schritt 12 angepasst |
| B | BEF-140 Zwei Löschkandidaten aus dem Leitfaden (Übersicht, Telefon geschäftlich) | fertig | 2026-10-11 | ANN-340 | — | nur Oberfläche; „Andere Ziel-App prüfen“ folgt nach der Sichtung Kartendienst |
| B | BEF-141 Listen zeigen den Empfänger ausgestellter Rechnungen aus dem Snapshot | gesichtet | 2026-10-11 | ANN-339; Migration 20261027100000, invoices.test.ts (Gegenprobe ohne Migration rot); Zweitreview | — | ohne Oberfläche außer dem Hinweis am Empfängerformular |
| B | BEF-129 Widerruf des Trainingsvertrags bleibt in Offene Punkte, bis das Paket entfernt ist | fertig | 2026-10-11 | ANN-341 | — | Bedingung statt 14 Tage; Monatsentwurf unverändert |
| B | BEF-128 Abo-Monat lässt sich nach einem Storno zurücknehmen | gesichtet | 2026-10-11 | Migration 20261029100000, aftercare-months.test.ts (Gegenprobe ohne Migration rot); Zweitreview | — | ohne Oberfläche; der vorhandene Knopf „Erfassung zurücknehmen“ trägt jetzt auch nach einem Storno |
| B | BEF-124 Verordnung mit Verlauf, Löschen nur ohne Termine | fertig | 2026-10-16 | ANN-562; Migration 20261121100000, treatment-basis-history.test.ts, retention-run.test.ts; Zweitreview | — | Verlauf eingeklappt auf der Bearbeiten-Seite der Grundlage |
| B | BEF-131 Terminwünsche ziehen beim Zusammenführen mit | gesichtet | 2026-10-11 | Migration 20261030100000, patient-merge.test.ts (Gegenprobe ohne Migration rot); Zweitreview | — | ohne Oberfläche; der Plattformzugang der Dublette bleibt BEF-132 |
| B | BEF-132 Plattformzugang an der Dublette sperrt das Zusammenführen | fertig | 2026-10-11 | Migration 20261031100000 | — | ein Satz und zwei Zähler in der Vorschau, Prüfseite dublette.html?sperre=plattform; Sichtungsdatei Praxisverwaltung voll, kein neuer Schritt |
| B | BEF-143 Stornierte Rechnung nennt ihre Positionen aus dem Snapshot | fertig | 2026-10-11 | Migration 20261101100000 | — | Korrektur nur angeboten, wenn sie eine Zeile hätte (correction_pending); Prüfseite terminhonorar.html?seite=storniert; Sichtung UX-Review Schritt 11 |
| B | BEF-144 Terminwünsche in der Auskunft aus der Akte | gesichtet | 2026-10-11 | Migrationen 20261102100000 und 20261102110000 | — | ohne Oberfläche außer der Beschriftung des Abschnitts; daneben: gleichzeitiges Erledigen überschreibt den Vermerk nicht mehr (Hinweis Zweitreview BEF-132) |
| B | BEF-145 Vollständigkeitstest der Auskunft, Zugänge zur Plattform in der Auskunft | gesichtet | 2026-10-11 | Migration 20261103100000, betroffenenrechte.test.ts (Gegenprobe ohne Migration rot); Zweitreview | — | Test über jede Tabelle des Aufbewahrungsplans mit patient_id; fand platform_accesses (ANN-342); ohne Oberfläche außer der Beschriftung des Abschnitts |
| B | LOG-EPIC-001 Protokollierung auf das Mindestmaß | fertig | 2026-10-03 | PRs #177 bis #180 (gestapelt), ADR-010 Fassung 3, PROJECT_PRINCIPLES 0.21 | — | ohne Oberfläche außer Hinweistexten; nach grüner CI mergen (E-6); offen bei Jannes: pg_cron-Nachweis, Backupfrist, AV-Verträge, Plattformlogs |
| B | ABR-EPIC-007 Terminhonorar | fertig | 2026-10-05 | ABR-030 bis ABR-032, ADR-009 Fassung 5 (B17 entschieden), Zweitreview | — | ohne BEF-114 (Paketpreise Training, wartet auf Preis, Umfang, Zahlungsweise); Sichtung: Plattform Schritte 8 und 9 |
| B | UBK-EPIC-001 Übersicht nach der Uhr, Tageswechsel, Tageskarte, Fahrwege im Kalender (BEF-051) | fertig | 2026-10-05 | UBK-001 bis UBK-005, Branch `claude/feature-loop-ubersicht-kalender-hy71mv` | — | Auftrag Jannes, eingeschoben; Sichtung: UI-Redesign Schritte 3, 13 und 14 |
| B | UBK-EPIC-002 Fahrzeiten im Alltag: Fahrzeitfaktor, Passt es?, Lückenfinder, Garage und Rückweg, Fahrweg antippbar, Ort auf der Kachel | fertig | 2026-10-06 | UBK-010 bis UBK-017, Branch `claude/friendly-wright-4r8083`, vier Migrationen, Zweitreview | — | Auftrag Jannes, eingeschoben; Sichtung: Kartendienst Schritte 8, 9 und 13, UI-Redesign Schritte 14 und 15 |
| B | RAH-EPIC-001 Design-Runde 1 Rahmen: Seitenleiste und Symbolspalte, Kopfzeile, Tableiste nach Reife, Sicherheit und Aufbewahrung, Praxiseinstellungen, Rückweg in der Akte, Tab-Titel, Startbild | fertig | 2026-10-06 | Branch `claude/epic-cori-rmq1ty` | — | Auftrag Jannes (Design-Runde 1, 05.10.2026), eingeschoben; Sichtung: Rahmen Schritte 1 bis 3 |
| B | SLK-EPIC-001 Schlank und klar, erste Runde: Telefax der Patient:innen gelöscht, Doku an jeder Zeile der Übersicht, Stammdaten in einem Block, Grundton B | fertig | 2026-10-06 | Branch `claude/confident-wozniak-vj9h7h` | — | Auftrag Jannes (06.10.2026), eingeschoben; Sichtung: Rahmen Schritte 4 bis 6 |
| B | SKN-EPIC-001 Design-Runde 2 Schrift und Knöpfe: Leiste 12 px, Kleingedrucktes 14 px, gesperrter Knopf gestrichelt, dichte Angaben auf 12 px, Zeitstrahl-Symbol | fertig | 2026-10-06 | SKN-001 bis SKN-007 (SKN-008 wartet auf die Zwei-Faktor-Frage) | — | Auftrag Jannes (Design-Runde 2, Freigabe 06.10.2026); Sichtung: Rahmen Schritt 7 |
| B | ABR-EPIC-008 Design-Runde Abrechnung: Rechnungsliste mit Suche, Filter, Monat und Weitere laden, Gesamtzahl, Spalten ab 1024 px | fertig | 2026-10-06 | ABR-033/034 | — | BEF-061 Option 1 und 3 (Entscheidung Jannes 2026-10-05), ANN-259; Sichtung: Rahmen Schritt 12 |
| B | DOK-EPIC-001 Design-Runde Dokumentation: Skala zweireihig mit gewähltem Wert, Bausteinfeld ohne Kasten im Kasten, Bausteinleiste einreihig, Ursprung im Nachtrag zugeklappt | fertig | 2026-10-06 | DOK-001 bis DOK-004 | — | BEF-057 Option 2 (Entscheidung Jannes 2026-10-05) mit der Skala aus Option 3 (ANN-258); Sichtung: Rahmen Schritt 11 |
| B | KUT-EPIC-001 Design-Runde 3 Kalender und Tour: Woche 7.5rem, Tour im Kopf, Anlegen-Leiste dichter mit Bildlauf, Tour am Handy Liste vor Karte, zwei Spalten am Rechner, Karte mit zwei Fingern | fertig | 2026-10-06 | KUT-001 bis KUT-006 | — | Auftrag Jannes (Design-Runde 3 alles A, Freigabe 06.10.2026); BEF-053, BEF-054 erledigt; Sichtung: Rahmen Schritte 8 bis 10 |
| B | POR-EPIC-002 Eigene Termine, Rechnungen, Dokumente | fertig | 2026-10-06 | POR-008 bis POR-015, Zweitreview | — | Sichtung: Plattform Schritte 10 bis 12 |
| B | POR-EPIC-003 Einwilligungen, Export, Einstellungen | fertig | 2026-10-07 | POR-016 bis POR-020, Zweitreview | — | Sichtung: Plattform Schritte 13 bis 15 |
| B | ANG-EPIC-001 Nachsorge-Abo als Monatsrechnung | fertig | 2026-10-07 | ANG-001 bis ANG-004, Zweitreview | — | Sichtung: Angebote Schritte 1 bis 3 |
| B | ANG-EPIC-002 Trainingspaket nach Zeitraum | fertig | 2026-10-07 | ANG-005 bis ANG-008, BEF-114, Zweitreview | — | Sichtung: Angebote Schritte 4 bis 6 |
| B | KND-EPIC-001 Betreuung nach der Behandlung | fertig | 2026-10-07 | KND-001 bis KND-005, Zweitreview | — | Sichtung: Angebote Schritte 7 bis 9 |
| B | UEB-EPIC-001 Übungsbibliothek | fertig | 2026-10-07 | UEB-001 bis UEB-003, Zweitreview | — | Sichtung: Pläne Schritte 1 bis 3 |
| B | UEB-EPIC-002 Plan und Schnappschuss | fertig | 2026-10-07 | UEB-004 bis UEB-007, Zweitreview | — | Sichtung: Pläne Schritte 4 bis 6 |
| B | UEB-EPIC-003 Plan als PDF und im Portal | fertig | 2026-10-08 | UEB-008 bis UEB-011, Zweitreview | — | Sichtung: Pläne Schritte 7 bis 9 |
| B | KOM-EPIC-001 Strukturierte Rückfrage | fertig | 2026-10-09 | KOM-001 bis KOM-004, Zweitreview | — | Sichtung: Pläne Schritte 10 bis 12 |
| B | KOM-EPIC-002 Foto und Video | fertig | 2026-10-11 | KOM-005 bis KOM-008, Zweitreview | — | Sichtung: Pläne Schritte 13 bis 15 |
| B | KOM-EPIC-003 Benachrichtigungen und Terminerinnerung | fertig | 2026-10-12 | KOM-009 bis KOM-011, Zweitreview | — | Sichtung: Pläne Schritte 14 und 15 |
| B | TRK-EPIC-001 Einheiten und Check-ins | fertig | 2026-10-12 | TRK-001 bis TRK-003, Zweitreview | — | Sichtung: Verlauf Schritte 1 bis 3 |
| B | TRK-EPIC-002 Schmerz, Sicherheit, Kontext | fertig | 2026-10-12 | TRK-004 bis TRK-006, Zweitreview | — | Sichtung: Verlauf Schritte 1 bis 3 |
| B | TRK-EPIC-003 Offline-Erfassung | fertig | 2026-10-12 | TRK-007 bis TRK-009, Zweitreview | — | Sichtung: Verlauf Schritte 4 bis 6 |
| B | OFF-EPIC-001 Dokumentation ohne Empfang | fertig | 2026-10-12 | OFF-001 bis OFF-003, Zweitreview | — | Sichtung: Verlauf Schritte 7 bis 9 |
| B | OUT-EPIC-001 Fortschritt ohne Bewertung | fertig | 2026-10-12 | OUT-001 bis OUT-004, Zweitreview | — | Sichtung: Verlauf Schritte 10 bis 12 |
| B | ALT-EPIC-001 Aktivitäten und Gewohnheiten | fertig | 2026-10-12 | ALT-001 bis ALT-003, Zweitreview | — | Sichtung: Verlauf Schritte 13 bis 15 |
| B | ERN-EPIC-001 Ernährung: Profil und Bedarf | fertig | 2026-10-18 | ERN-001 bis ERN-003, Zweitreview | — | — |
| B | ERN-EPIC-002 Ernährung: Lebensmitteldaten | fertig | 2026-10-19 | ERN-004 bis ERN-006, Zweitreview | — | — |
| B | ERN-EPIC-003 Ernährung: Tagebuch | fertig | 2026-10-19 | ERN-007 bis ERN-010, Budgets in tagebuch.spec.ts, Zweitreview | — | — |
| B | Ernährung: Beratung abrechnen | fertig | 2026-10-19 | ERN-011 und ERN-012 | — | ANN-622 (Abnahme Jannes), ANN-664, ANN-665; Sichtung per Bildstrecke im PR |
| B | FLT-EPIC-001 Radflotte | fertig | 2026-10-15 | Branch ccr-658a5e25-l0njkl | — | Auftrag Jannes (15.10.2026), ersetzt die Vorschau; ANN-550 bis ANN-558; Rad im Kalender und weitere Bauarten offen; Sichtung per Bildstrecke im PR. Nachtrag 16.10.: FLT-007 bis FLT-009 (Werbeflächen, Seitenfotos, Meldungen für den Arbeitgeber, Check-Up-Rhythmus; Migration 20261122100000, ANN-568 bis ANN-570) |
| B | TEAM-001 Teamkommunikation: Kanäle, Direktnachrichten, Threads, Erwähnungen, Suche, eigener Lesestand, rollierende Löschung | fertig | 2026-10-17 | Branch claude/modest-turing-i5qgn9 | — | Überholung 11 (Auftrag Jannes 17.10.2026), ersetzt die Vorschau; ADR-008 Fassung 5 Punkt 12; ANN-609 bis ANN-614; Aufbau wie Slack (Für dich, Threads); keine Startkanäle (Jannes), Nachrichten der Radflotte in der Radflotte; Anhänge (ADR-017 Punkt 30), Push (ADR-024) und Vorgangsbezug offen |
| B | TEAM-002 Teamchat wie Slack: Chatfläche mit Gesprächen, Gespräch und Thread nebeneinander, private Kanäle, Gruppen, Reaktionen, Anheften, Für später, Planen, Suche mit Filtern, Lesestand je Thread, Zustellung ohne Doppel | fertig | 2026-10-18 | Branch claude/epic-cerf-vq8hz1 | — | Überholung Teamchat (Auftrag Jannes 18.10.2026); ANN-640 bis ANN-651; Funktionsmatrix und Etappen: git show 9452575:docs/product/ideen/referenz-slack.md; Dateien (ADR-017), Push und Mail (ADR-024 Punkt 12), Huddles, KI, Canvas und Workflows offen als Entscheidung |
| B | TEAM-003 Anhänge im Teamchat: Fotos und PDF bis fünf je Nachricht, Anzeigen im Fenster ohne Herunterladen, Dateien je Gespräch, gelöscht mit der Nachricht | fertig | 2026-10-18 | #273 | — | Etappe E4 (Frage 1 aus PR #272, Jannes 18.10.2026: wie empfohlen, ohne Virenprüfung); ADR-017 Fassung 8 Abschnitt M vorgeschlagen (Bestätigungsfragen 30 bis 32); ANN-652, ANN-653; scharf erst nach OPS-001 und OPS-003 (Punkt 81); Clips bleiben aus (Punkt 71) |
| B | TEAM-004 Sprachnachrichten im Teamchat: aufnehmen in der App (höchstens zwei Minuten, sichtbar), nur Ton ohne Angaben, abspielen ohne Herunterladen | fertig | 2026-10-18 | #273 | — | Antwort auf Frage 4 der PR #273 (Jannes 18.10.2026: Sprachnachrichten ermöglichen); ADR-017 Fassung 9 Abschnitt N vorgeschlagen (Bestätigungsfragen 33, 34), Mikrofon der eigenen Herkunft freigegeben; ANN-655; keine Transkription, kein Video; scharf erst nach OPS-001 und OPS-003 (Punkt 87) |
| B | TEAM-005 Senden, während Anhänge hochladen: Nachricht wartet sichtbar im Ausgang und geht von selbst, Bearbeiten holt Text und Anhänge zurück | fertig | 2026-10-18 | #273 | — | Antwort auf Frage 5 der PR #273 (wie empfohlen); ADR-017 Punkt 74 Vermerk (Fassung 9); ANN-654; alles nur im Arbeitsspeicher (Punkt 33) |
| B | TEAM-006 Farbe je Person im Teamchat: acht Farben, vergeben mit dem Mitarbeiterdatensatz, selbst gewählt in Mein Konto, Initialen auf der Farbe vor jeder Nachricht und in jeder Liste | fertig | 2026-10-19 | Branch ccr-37917f35-emdjjp | — | Auftrag Jannes 19.10.2026 (Chat noch nicht zufrieden: Farbe je Mitarbeiter:in); ANN-666; Baustein Personenbild; keine Farbe im Rot, Orange oder Gelb der Statusfarben |
| B | TEAM-007 Profilbild im Teamchat: nur für sich selbst, auf dem Gerät zu 256 × 256 gerechnet, am Inhalt geprüft, in der Datenbank, fällt mit Entfernen, Ersetzen und Ausscheiden | fertig | 2026-10-19 | Branch ccr-37917f35-emdjjp | — | Auftrag Jannes 19.10.2026; ADR-017 Fassung 10 Abschnitt O angenommen (Umkehr von Punkt 1, Fragen 35 bis 37 wie empfohlen); ANN-667 im Prüfpaket; Vorschläge für mehr Übersicht: git show 9452575:docs/product/ideen/referenz-slack.md |
| B | TEAM-008 Bilder auch in den Listen des Teamchats: Für dich, Threads, Suche, Für später und Angeheftetes zeigen Bild oder Farbe der Person, die schrieb | fertig | 2026-10-19 | Branch ccr-37917f35-emdjjp | — | Antwort auf Frage 5 der PR zu TEAM-006 und TEAM-007 (wie empfohlen); Threads nennen jetzt auch den Namen neben dem Bild (DESIGN.md Regel 5) |
| B | TEAM-009 Personenkarte im Teamchat: Tipp auf ein Bild zeigt Bild, Name, Praxisrollen und Direktnachricht - keine Anwesenheit, kein Status, keine Kontaktdaten | fertig | 2026-10-19 | Branch ccr-37917f35-emdjjp | — | Antwort auf Frage 5 der PR zu TEAM-006 und TEAM-007 (wie empfohlen); ANN-668 |
| B | BEF-183 Reiterleiste: „›“ als 44-px-Knopf neben der Liste holt den ersten ganz verdeckten Reiter nach vorn | fertig | 2026-10-19 | Branch ccr-37917f35-emdjjp | — | Entscheidung Jannes 2026-10-18; nur rechts ein Knopf, damit „Behandlungsgrundlagen“ bei 375 px ganz hineinpasst |
| B | BEF-150 Ränder der Entwürfe auf dem Diensttelefon: erneut senden, unlesbare mitzählen, Rückfrage vor dem Verwerfen, Tagesplan bei Rollenwegfall räumen | fertig | 2026-10-19 | Branch ccr-37917f35-emdjjp | — | /weiter aus STATUS „Danach“; Entwürfe fallen nie still (§13) |
| B | BEF-147 Benachrichtigungen im eigenen Datenexport: Wahl, Geräte ohne Schlüssel, Tagebuch-Erinnerungen, Zustellaufträge | fertig | 2026-10-19 | Branch ccr-37917f35-emdjjp | — | Die Praxis sieht die Wahl weiter nicht (ANN-344) |
| B | BEF-148 Zustellaufträge meldet nur, wer den Anspruch hält; Löschlauf räumt Push-Registrierungen beendeter Zugänge | fertig | 2026-10-19 | Branch ccr-37917f35-emdjjp | — | Vor dem Scharfschalten des Versands (OPS-001) |
| B | BEF-146 Vollständigkeitstest der Auskunft sieht auch den Plattformzugang; Anhänge an Rückfragen in der Auskunft | fertig | 2026-10-19 | Branch ccr-37917f35-emdjjp | — | Vier Tabellen bewusst außerhalb der Auskunft der Praxis (ANN-344), im eigenen Export |
| B | BEF-182 Auskunft nach Art. 15 je Trainingsverhältnis: export_training_record und Seite in den Stammdaten | fertig | 2026-10-20 | Branch ccr-37917f35-emdjjp | — | Nur owner; dieselbe Auditaktion wie an der Akte, Gegenstand das Verhältnis |
| B | BEF-189 Benachrichtigungsdaten fallen mit dem Ende der Lesezeit; Begleitung exportiert ihre eigene Wahl | fertig | 2026-10-20 | Branch ccr-37917f35-emdjjp | — | ADR-023 Fassung 6, ANN-669 entschieden |
| B | BEF-188 Fotos und Videos an Rückfragen an die Person herausgeben, auch gesperrte | fertig | 2026-10-20 | Branch claude/cool-allen-m2aaci | — | ADR-017 Fassung 12, ADR-010 Fassung 5, ANN-672; Merge erst mit Label freigabe-audit |
| B | BEF-190 Profilbild: Ausschnitt beim Auswählen verschieben und vergrößern | fertig | 2026-10-20 | Branch ccr-37917f35-emdjjp | — | ADR-017 Fassung 11, ANN-670 |
| B | BEF-192 Tag umplanen: Anruf als Hauptknopf, „Anrufen“ im Abschluss wählt direkt | fertig | 2026-10-20 | Branch ccr-9f54aa20-cgnb8q | — | — |
| B | BEF-193 Plattform „Ich“: Kopf in einer Zeile, Adresse unter „Konto“ | fertig | 2026-10-20 | Branch ccr-9f54aa20-cgnb8q, src/features/portal/platform/PlattformApp.test.tsx, Bildstrecke vorher/nachher | — | — |
| B | BEF-176 Panne und Einstiege am Lastenrad: Anrufknöpfe statt Platzhalter, Ruhetag aus dem Datum, Depotfrage geteilt, Panne an der Karte des nächsten Wegs, G1 Anruf als Hauptknopf | fertig | 2026-10-21 | Branch ccr-4626bc96-m83ovf | — | ANN-673 |
| B | BEF-178 Löschsperre für Beschäftigtendaten: owner sperrt eine Person, Urlaub, Arbeitszeit, Zeitkonto und Erstattungen fallen nicht, solange sie läuft | fertig | 2026-10-21 | Branch ccr-24200d06-dhr3ze | — | ANN-674; ohne Auditeintrag, Katalog unverändert |
| B | BEF-179 und BEF-180 Zeitkonto: Zurückweisung unter „noch offen“ in der Übersicht, Freizeitausgleich am Tag selbst zurücknehmen | fertig | 2026-10-21 | Branch ccr-fc77ad4b-t5zz1m | — | ANN-594 geändert, ANN-675; ohne Auditeintrag und ohne Benachrichtigung |
| B | BEF-170 Akte: einzeln gelöschte Dateien ins Löschjournal, damit eine Wiederherstellung sie nicht zurückbringt | fertig | 2026-10-24 | Branch ccr-c5a4a21f-ys0el3 | — | Pfad A (Löschpfad); auch das Verwerfen nach der Prüfung am Inhalt; ohne Auditeintrag |
| B | BEF-219 Arbeitszeit: Die Zusammenfassung „Änderung beantragen?“ rollt auch mit vielen Terminen außerhalb nicht; der Test legt sie selbst an | fertig | 2026-10-25 | Branch ccr-544f8ce7-u1sqpf | — | nur Oberfläche und Test; ohne Migration, ohne Auditeintrag |
| B | BEF-191 Teamchat: neues Profilbild an Nachrichten, die schon dastehen | fertig | 2026-10-20 | Branch ccr-37917f35-emdjjp, src/features/teamchat/teambilder.test.tsx, tests/e2e/authenticated/profilbild.spec.ts | — | — |
| B | BEF-175 Geführter Ablauf: Fokus ohne Rollen, Rollfläche, Sperre in allen Fensterzielen, Zurückgeste | fertig | 2026-10-20 | Branch ccr-c66528c5-m3o7aq | — | Politurrunde, ANN-671 |
| B | Politurrunde Ernährungsberatung: Akte, Formulare, Tagebuch und Lebensmittel nach DESIGN.md | fertig | 2026-10-20 | Branch ccr-c66528c5-m3o7aq | — | — |
| B | URL-001 Urlaub: Antrag geführt (G7), Entscheiden (G7b), Storno, Anspruch, Wirkung auf Kalender, Slotsuche und Trainingstermine | fertig | 2026-10-17 | Branch ccr-350340fc-pnh5ti-urlaub | — | Bereichsüberholung 7 der Roadmap (Auftrag Jannes 16.10.2026), ersetzt die Vorschau; gemeinsame Antragsmechanik für 8 bis 10; ANN-576 bis ANN-580; Sichtung per Bildstrecke im PR |
| B | AZ-001 Arbeitszeitänderung: Antrag einmalig oder dauerhaft geführt (G8), Entscheiden (G8b), Wochenplan in Fassungen ab einem Datum, Prüfungen nach ArbZG am Server | fertig | 2026-10-17 | Branch ccr-350340fc-pnh5ti-arbeitszeit | — | Bereichsüberholung 8 der Roadmap (Auftrag Jannes 16.10.2026); ANN-588 bis ANN-592; bewegliche Mittagspause als eigener Loop danach; Sichtung per Bildstrecke im PR |
| B | ZK-001 Zeitkonto: Mehrarbeit und Freizeitausgleich mit Beginn und Ende geführt eintragen (G9), Zurückweisen mit Grund (G9b), Konten je Person für owner und Büro, Freizeitausgleich als Abweichung in den Arbeitszeiten | fertig | 2026-10-17 | Branch ccr-350340fc-pnh5ti-zeitkonto | — | Bereichsüberholung 9 der Roadmap (Auftrag Jannes 16.10.2026), ersetzt die Vorschau; ANN-593 bis ANN-597; Fristen mit Übertrag; Löschsperre für Beschäftigtendaten seit BEF-178 (ANN-674); Sichtung per Bildstrecke im PR |
| B | ERS-001 Erstattungen: Ladestrom je Monat und Einkauf mit Belegen geführt beantragen (G10), Genehmigen oder Ablehnen mit Grund und Auszahlen getrennt (G10b), IBAN maskiert, voll nur in der Auszahlung für owner | fertig | 2026-10-17 | Branch ccr-350340fc-pnh5ti-erstattungen | — | Bereichsüberholung 10 der Roadmap (Auftrag Jannes 16.10.2026), ersetzt die Vorschau; ANN-598 bis ANN-602; Belege im Bucket erstattungsbelege mit nachgelagerter Prüfung; Löschsperre für Beschäftigtendaten seit BEF-178 (ANN-674); Sichtung per Bildstrecke im PR |
| B | ORG-001 bis ORG-007 Überholung Organisation: fünf Reiter mit Ansichten, Tableiste je Rolle, eine Arbeitszeit für alle, Einstellungen als eigene Seite, Eingang mit Neuer Antrag, Barometer und Rückmeldung an die Praxisleitung (§20.2), Hinweise zwischendurch, Zeitkonto mit Dauerregler und Minusstunden | fertig | 2026-10-17 | Branch claude/modest-turing-i5qgn9 | — | Auftrag Jannes 17.10.2026; Prinzipien 0.27 §20.2, ADR-024 Fassung 2, ADR-008 Fassung 4, ADR-019 Fassung 6; ANN-603, ANN-604, ANN-606 bis ANN-608 |
| B | ORG-008 Ladestrom automatisch: geplante Arbeitsstunden × km je Stunde × Wh/km × ct/kWh, Werte als Einstellung der Praxis für owner, Vorschlag je offenem Monat im Eingang | fertig | 2026-10-17 | Branch claude/modest-turing-i5qgn9 | — | Auftrag Jannes 17.10.2026; ANN-605 löst ANN-599 ab, gestellte Anträge behalten ihre Werte; Kilometer aus Touren nach ADR-019 Fassung 6 als BEF-181 |
| B | BEF-181 Ladestrom aus den Kilometern der geplanten Touren: Edge Function rechnet beim Beantragen die Routen je Tag, nur die Monatssumme am Antrag, Büro ohne Kilometer und Betrag | fertig | 2026-10-17 | Branch ccr-0d8db4ad-3ufjj1 | — | ADR-019 Fassung 6; ANN-615 bis ANN-617; ohne Gate (Punkt 9) bleibt der Wert je Stunde |
| B | Wochenplan in einem Zug: geänderte Tage unter ihrer Zeile öffnen, mit einem Knopf speichern, alle oder keiner | fertig | 2026-10-17 | Branch ccr-0d8db4ad-3ufjj1 | — | Praxis-Review der Überholung Organisation (PR #267, Frage 2) |
| B | DES-EPIC-001 Design der ganzen App nach DESIGN.md: Bausteine, Ratsche, Bereiche B1 bis B8, Runde 2 nach Design- und Praxis-Review | fertig | 2026-10-13 | PR #239, docs/design/DESIGN.md, src/designsystem.test.ts, Bildstrecke vorher/nachher | — | Auftrag Jannes (12.10.2026); Sichtung per Bildstrecke im PR |
| B | Restbefunde der Praxis-Prüfung: Vor der Tür (K3), Wie zuletzt (K6), Absage in vier Tipps (K9), Übung aus der Bibliothek in den Plan | fertig | 2026-10-14 | Branch ccr-d79ef3d1-5rclb1, tests/e2e/besuch.spec.ts, tests/e2e/authenticated/kernablaeufe.spec.ts | — | Bereichsüberholung 2 der Roadmap; Sichtung per Bildstrecke im PR |
| B | Erstaufnahme geführt: eine Seite vom Terminpanel bis zur Doku (K10), Neuaufnahme am Telefon in drei Tipps (K11) | fertig | 2026-10-15 | Branch ccr-248b0353-fbdcs9, tests/e2e/authenticated/kernablaeufe.spec.ts (K10 10 Tipps, K11 3 Tipps) | — | Bereichsüberholung 3 der Roadmap; ANN-542, ANN-543; Sichtung per Bildstrecke im PR |
| B | Monatsabrechnung in einem Lauf (K13), Zahlungseingang gesammelt (K14), Sammeldruck, §-19-Hinweis im Schnappschuss (BEF-165) | fertig | 2026-10-15 | Branch ccr-92feaef7-zkxssj | — | Bereichsüberholung 4 der Roadmap; ANN-544; Sichtung per Bildstrecke im PR |
| B | Übungen, zweite Runde: Vorlagen der Praxis (Als Vorlage speichern, Aus Vorlage, Seite Vorlagen), Durchsicht des Katalogs am Stück | fertig | 2026-10-16 | Branch claude/sweet-gauss-z8te7o | — | Bereichsüberholung 5 der Roadmap; ANN-560, ANN-561; eigene Bilder und Videos offen (ANN-539); Sichtung per Bildstrecke im PR |
| B | Geführte Abläufe: Baustein GefuehrterAblauf, Niemand öffnet (G1), Tag umplanen (G2), Panne (G3), Schlüssel übergeben (G4), Mitarbeiter:in einrichten (G5), Plattform-Termin (G6) | fertig | 2026-10-16 | Branch ccr-350340fc-pnh5ti | — | Bereichsüberholung 6 der Roadmap (Auftrag Jannes 16.10.2026); ANN-572 bis ANN-575, ANN-581 bis ANN-587; Sichtung per Bildstrecke im PR |
| B | UEB-012 Mitgelieferter Übungskatalog: 196 Übungen, 193 gezeichnete Figuren, 15 Vorlagen, Übernahme durch owner | fertig | 2026-10-13 | PR #239, Migration 20261111100000_ueb_012_exercise_catalog.sql, supabase/tests/exercise-catalog.test.ts, Zweitreview | — | Auftrag Jannes (12.10.2026); Inhalte KI-erstellt, „ungeprüft“ bis zur Durchsicht (ANN-386) |
| B | BES-EPIC-001 Besuch in einem Zug: Danach auf der Schreibseite, Folgetermin mit einem Tipp, Später da?, Niemand öffnet?, Heute noch offen | fertig | 2026-10-13 | PR #239, tests/e2e/besuch.spec.ts (höchstens 6 Tipps) | — | Auftrag Jannes (12.10.2026), Kernablauf K5 |
| B | Durchsicht 14.10.: Befunde B1 bis B13 (Leistung, Haken, Liste; Einsicht in die Plattform; Spracheingabe mit Nachbildung; Oberfläche) | gesichtet | 2026-10-14 | PRs #241, #242, #243, #244, BEF-151 bis BEF-163, Bericht mit Bildpaaren | 2026-10-15 | Auftrag Jannes (14.10.2026); nach dem Bericht mit Bildpaaren gemergt, alle Annahmen bestätigt; Anbieter für die Spracheingabe offen |
| B | DRP-EPIC-001 Plattform: Politur aus dem Design-Review (Schritt 0) | fertig | 2026-10-22 | DRP-001 bis DRP-003, Branch `claude/plattform-schritt-0` | — | Auftrag Jannes 22.10.2026; DR-102 bis DR-160 ohne Entwurf; ANN-676, ANN-677 |
| B | DRP-EPIC-002 Plattform: eigene Sprache aus dem Design-Review (Schritt 1a) | fertig | 2026-10-22 | DRP-004 bis DRP-006, Branch `claude/plattform-1a-sprache`, tests/e2e/plattform-bausteine.spec.ts | — | Auftrag Jannes 22.10.2026; Handoff 2026-10-22; ANN-678 |
| B | DRP-EPIC-003 Plattform: Gerüst aus dem Design-Review (Schritt 1b) | fertig | 2026-10-23 | DRP-007 bis DRP-009, Branch `claude/plattform-1b-geruest`, tests/e2e/plattform-barrierefreiheit.spec.ts | — | Auftrag Jannes 22.10.2026; Handoff 2026-10-22; ANN-679 bis ANN-683 |
| B | DRP-EPIC-004 Plattform: Türen aus dem Design-Review (Schritt 1c) | fertig | 2026-10-23 | DRP-010 bis DRP-014, Branch `claude/stoic-archimedes-520zje`, tests/e2e/tueren.spec.ts | — | Auftrag Jannes 23.10.2026; Handoff 2026-10-22, 5.2; ANN-684 bis ANN-689 |
| B | DRP-DATEN Plattform: eigener Name und Rufnummer der Praxis in der Projektion (Handoff 2026-10-22, Abschnitt 9: N1, N2) | fertig | 2026-10-22 | Branch `claude/plattform-daten-n1-n2` | — | Auftrag Jannes 22.10.2026; Datenschritt nach Pfad A; ANN-690, ANN-691 |
| B | DRP-EPIC-005 Plattform: Einstieg aus dem Design-Review (Schritt 1d) | fertig | 2026-10-24 | Branch `claude/lucid-keller-zholly` | — | Auftrag Jannes 22.10.2026; Handoff 2026-10-22, 5.3, parallel zu 1c; ANN-692 bis ANN-696 |
| B | DRP-EPIC-006 Plattform: Übersicht aus dem Design-Review (Schritt 1e) | fertig | 2026-10-24 | Branch `ccr-c5a4a21f-ys0el3` | — | Auftrag Jannes 24.10.2026; Handoff 2026-10-22, 5.1; ANN-697 bis ANN-702, Fragen aus #297 wie empfohlen; Schritt 1 abgenommen 24.10. |
| B | DRP-EPIC-007 Plattform: Bausteine der Übungen aus dem Design-Review (Schritt 2a) | gesichtet | 2026-10-24 | DRP-023 bis DRP-029, Branch `claude/new-session-27nejg`, tests/e2e/plattform-uebungsbausteine.spec.ts | 2026-10-29 | Auftrag Jannes 24.10.2026; Handoff 2026-10-24, 9; Fragen wie empfohlen; ANN-704 bis ANN-710; die Seiten stellen 2b und 2c um |
| B | DRP-EPIC-008 Plattform: Durchführung der Übungen aus dem Design-Review (Schritt 2b) | gesichtet | 2026-10-24 | Branch `claude/drp-2b-durchfuehrung` | 2026-10-29 | Auftrag Jannes 24.10.2026; Handoff 2026-10-24, 9.2, parallel zu 2c; ANN-711 bis ANN-717; BEF-210, -211, -213 und -214 erledigt, BEF-212 offen |
| B | DRP-EPIC-009 Plattform: Reiter der Übungen aus dem Design-Review (Schritt 2c) | gesichtet | 2026-10-24 | Branch `claude/uebungen-reiter-2c` | 2026-10-29 | Auftrag Jannes 24.10.2026; Handoff 2026-10-24, 9.3, parallel zu 2b; ANN-720 bis ANN-727; BEF-196, -197 und -216 mit 2b erledigt; BEF-215, -217, -218 offen |
| B | BEF-215 und BEF-218 Übungen: ein Inhalt für Fenster und Durchführung, die Vorschau kennt die Einheit auf dem Gerät | fertig | 2026-10-25 | Branch ccr-544f8ce7-u1sqpf | — | Folge von DRP-EPIC-009 vor dem Planblatt 2d; ANN-730 ersetzt ANN-720, ANN-466 verworfen; nur Oberfläche, ohne Migration, ohne Auditeintrag |
| B | DRP-EPIC-010 Plattform: Planblatt aus dem Design-Review (Schritt 2d) | gesichtet | 2026-10-25 | Branch ccr-544f8ce7-u1sqpf | 2026-10-29 | Auftrag Jannes 25.10.2026; Handoff 2026-10-24, 9.4; ANN-731; nur Oberfläche; Safari am iPhone nicht geprüft |
| B | Aufräumen Schritt 1: Kommentarregel mit Prüfung, die extremsten Kopfkommentare gekürzt, /aufraeumen, CLAUDE.md verdichtet | fertig | 2026-10-25 | Branch ccr-51128c80-r6lmjn | — | Auftrag Jannes (25.10.2026), ROADMAP 7.16; CLAUDE.md auf unter 7 KB verdichtet; ohne Migration, ohne Oberfläche |
| B | Aufräumen Schritt 2: Migrationen zu einer Basis zusammenfassen, Schema per Diff identisch, Übersicht der DB-Funktionen | fertig | 2026-10-25 | Branch ccr-51128c80-r6lmjn | — | Auftrag Jannes (25.10.2026), ROADMAP 7.16; Pfad A; 341 Migrationen zu einer Basis; Test-Umgebung per Handstart basis_uebernehmen umgestellt (#209); Nachzug: neun Funktionen ohne Aufrufer entfernt, Rechte der API-Rollen und Vorgaben im Shim (Migrationen 20261225010000, 20261225020000, supabase/tests/rechte-api-rollen.test.ts) |
| B | Aufräumen Schritt 3: Modulschnittstellen mit schmaler index.ts, ESLint gegen tiefe Importe, zuerst Termine | fertig | 2026-10-26 | #312 | — | Auftrag Jannes (25.10.2026), ROADMAP 7.16; Pfad A; ANN-748; Termine ohne gegenseitige Abhängigkeit, 17 statt 32 Paare; BEF-024 erledigt; Teil 1, Rest (Jannes 26.10.2026): Zeit- und Kalenderhilfen aller Module in src/lib/datum.ts, 16 statt 17 Paare |
| B | Aufräumen, Fehler 4 und 6 der Tiefenanalyse: Trainings-Nachtrag bei 403 nicht mehr „gespeichert“, kein Suchbegriff in Adresse und Rückweg; Tag umplanen ohne Wettlauf mit der Adresse | fertig | 2026-10-26 | Branch claude/pr-313-decisions-2mdcwc | — | Entscheidungen Jannes 26.10.2026 zu #313, ROADMAP 7.18; Pfad A ohne Auslöser aus Nr. 8; ohne Migration; Fehler 6 auch in der Radflotte; gemerkte Suchbegriffe fallen mit dem Kontowechsel; neuer Befund: Rückweg der Anrufliste über 512 Zeichen |
| B | Aufräumen, Fehler 5 und 7 der Tiefenanalyse: Upload-Recht der Akte wie die übrigen Dateiarten, Bestätigen und Verwerfen von Radflotte, Rückfrage und Akte ohne Wettlauf, app.mdr_released entfernt | fertig | 2026-10-26 | Branch claude/pr-313-decisions-2mdcwc | — | Entscheidungen Jannes 26.10.2026, ROADMAP 7.19; Pfad A mit Zweitreview (SECURITY DEFINER, Funktion hinter der Storage-Policy); list_patient_treatment_evidence bleibt wegen PROJECT_PRINCIPLES.md §4.4 (MUSS), Rückfrage |
| B | Aufräumen Schritt 4a: Teillöschung unter Belegfrist löscht die 17 Trainingstabellen nach drei Jahren | fertig | 2026-10-26 | #316 | — | Entscheidung Jannes 26.10.2026, ROADMAP 7.20; Pfad A; ADR-021 Punkt 4, ANN-183 |
| B | Aufräumen, Nachzug aus #316: Rückweg der Anrufliste kurz, Zustand im Tab; 3D-Rad-Rest im geführten Ablauf entfernt; Upload der Akte nur durch die vorbereitende Person bestätigen und verwerfen | fertig | 2026-10-26 | Branch claude/step-4-central-register-ur5k1y | — | Entscheidungen Jannes 26.10.2026, ROADMAP 7.21; ANN-574 Fassung 2; Pfad A mit Zweitreview (SECURITY DEFINER); drei Befunde aus BEFUNDE.md erledigt |
| B | Aufräumen Schritt 4: Register für Auskunft, Aufbewahrung, Löschjournal und Zusammenführung mit Vollständigkeitstest | fertig | 2026-10-26 | #318 | — | Auftrag Jannes 26.10.2026, ROADMAP 7.21; Fehler 2 und 3 der Tiefenanalyse; Pfad A; ANN-751, ANN-752, ANN-150 Fassung 3, ANN-652 Fassung 2; BEF-198 erledigt |
| B | Aufräumen, Nachzug aus #318: Zugänge beim Zusammenführen, Löschungen von Hand tageweise | fertig | 2026-10-27 | #319 | — | Entscheidungen Jannes 27.10.2026, ROADMAP 7.22; Pfad A; ANN-753, ANN-752 Fassung 2; Befund „sekundengenau“ aus BEFUNDE.md erledigt |
| B | Aufräumen Schritt 3b, Teil 1: geteilte Hilfen nach src/lib und src/components, die 14 Rückimporte umgedreht, Regel nach-unten | fertig | 2026-10-27 | #320 | — | Auftrag Jannes 27.10.2026, ROADMAP 7.22; Pfad A (Sitzungen); ANN-754 |
| B | Aufräumen Schritt 3b, Teil 2: Module in 14 Domänenordnern, je Domäne eine schmale index.ts, Regel gegen tiefe Importe | fertig | 2026-10-27 | #321 | — | Auftrag Jannes 27.10.2026, ROADMAP 7.22; Pfad A; ANN-755; ADR-013 Fassung 6 |
| B | Aufräumen, Nachzug zu #321: Startbild nach der Anmeldung (ANN-243), pnpm lint mit 6 GB Heap, Seiten holen fremde Domänen über deren index.ts | fertig | 2026-10-27 | #322 | — | Entscheidungen Jannes 27.10.2026 zu #321; Pfad A (Sitzungen); ANN-755 Fassung 2 |
| B | Aufräumen Schritt 5, Teil A: Archiv, Chroniken und erledigte Handoffs nach Git, neun Entscheidungen gesichert, Befunde nur noch offen | fertig | 2026-10-27 | #323 | — | Auftrag Jannes 27.10.2026, ROADMAP 7.22; Freigabe Git als Archiv vom 26.10. |
| B | Aufräumen Schritt 5, Teil B: Annahmenregister verdichtet, Prüfpaket mit 208 Einträgen, Regel F im Doku-Gate | fertig | 2026-10-27 | #324 | — | Auftrag Jannes 27.10.2026, ROADMAP 7.22; Tiefenanalyse Punkte 3 und 4 |
| B | Aufräumen Schritt 5, Teil C: ADRs, Prinzipien und Prozessdoku verdichtet, Gesamtgrenze im Doku-Gate, Abschluss des Blocks | fertig | 2026-10-27 | #325 | — | Auftrag Jannes 27.10.2026; Tiefenanalyse 5c Schritte 3 bis 6 |
| B | CI-Beschleunigung: Lint in zwei Läufen je 3 GB, E2E-Einrichtung ohne fremde Schriften, Studio und zweiten Reset, vier Teile | fertig | 2026-10-28 | #326 | — | Zusatzauftrag Jannes 27.10.2026 |
| B | DRP-EPIC-011 Plattform: Bausteine der Termine aus dem Design-Review (Schritt 3a) | gesichtet | 2026-10-28 | #327 | 2026-10-28 | Auftrag Jannes 28.10.2026; Handoff Termine 9.1, Fragen wie empfohlen; ANN-764 bis ANN-771; BEF-220 teilweise; nur Oberfläche |
| B | DRP-EPIC-012 Plattform: Liste der Termine aus dem Design-Review (Schritt 3b) | gesichtet | 2026-10-28 | #328 | 2026-10-29 | Auftrag Jannes 28.10.2026; Handoff Termine 5.1, 5.5, 5.6, 9.2, Fragen wie empfohlen; ANN-772 bis ANN-777; BEF-220 erledigt; nur Oberfläche |
| B | Bildstrecke: Netzruhe nach einem Wechsel in der Anwendung, offene Anfragen je Dokument | fertig | 2026-10-28 | #329 | — | Auftrag Jannes 28.10.2026; Befund „Bildstrecke“ vom 28.10. behoben; nur Werkzeug, keine Anwendungsdatei |
| B | DRP-EPIC-013 Plattform: Seite des Termins aus dem Design-Review (Schritt 3c) | gesichtet | 2026-10-29 | #330 | 2026-10-29 | Auftrag Jannes 28.10.2026; Handoff Termine 3, 5.2, 9.3, Frage 2 wie empfohlen; ANN-778 bis ANN-781; BEF-221 erledigt; nur Oberfläche |
| B | DRP-EPIC-014 Plattform: Abläufe zum Termin aus dem Design-Review (Schritt 3d) | gesichtet | 2026-10-29 | #331 | 2026-10-29 | Auftrag Jannes 28.10.2026; Handoff Termine 5.3 und 5.4; ANN-782 bis ANN-785; nur Oberfläche |
| B | DRP-EPIC-015 Plattform: Selbstauskunft und Tagebuch aus dem Design-Review (Schritt 4a bis 4e) | gesichtet | 2026-10-29 | #333 | 2026-10-30 | Auftrag Jannes 29.10.2026; Handoff in der Leinwand, Fragen wie empfohlen; nur Oberfläche |
| B | DRP-EPIC-016 Plattform: Aufträge nach Schritt 4 | fertig | 2026-10-30 | #334 | — | ANN-803 bis ANN-808; BEF-222 erledigt; Pfad A |
| B | DRP-EPIC-017 Plattform: Lesefrist vom Server, Antworten zu #326, #333, #334 | fertig | 2026-10-30 | #335 | — | ANN-809 bis ANN-814; ADR-013 Fassung 8; Pfad A |
| B | DRP-EPIC-018 Plattform: „Sehr groß“ ohne Verdecktes, Antworten zu #335 | fertig | 2026-10-30 | #336 | — | ANN-815 bis ANN-818; BEF-195 und BEF-226 erledigt; Register verdichtet |
| B | DRP-EPIC-019 Plattform: Antworten zu #336 (fester Fuß ohne Auswahl, Hauptsache vor dem Gruß, Seite „Angefangener Fragebogen“) | fertig | 2026-10-31 | #337 | — | ANN-819 bis ANN-822; ANN-809 und ANN-815 bis ANN-817 entschieden; Antworten zu #337; nur Oberfläche |
| B | Aufräumen, Vorschläge Nr. 2 und 3: Blattmodul patients/record, Datenzugang der Plattform je Bereich | fertig | 2026-10-31 | #337 | — | Gegenseitige Abhängigkeiten 8 → 5, billing <-> patients bleibt (Jannes 2026-10-31); portal/platform/api.ts 2.245 → 9 Dateien unter 440 Zeilen; Pfad A ohne Auslöser aus Nr. 8, Zweitreview |
| B | Aufräumen: gemeinsames Terminformular und Fehlzeitformular, Aufräumrunde 2026-10-31 | fertig | 2026-10-31 | Branch ccr-71de462d-qufdxg | — | Fünf Terminformulare auf AppointmentForm, Dauerfehlzeit in NewEventPage; Programm −960 Zeilen, doppelte Zeilen 2,7 → 2,3 %, gegenseitige Abhängigkeiten 5 → 4; Standardweg ohne Migration; drei neue Vorschläge in BEFUNDE.md |
| B | BEF-223 Zeitumstellung: doppelte Ortszeit gilt als die frühere | fertig | 2026-10-29 | #332 | — | Pfad A, ANN-786 |
| C | G1 ADR-017 Dateiablage (Dokument) | gesichtet | 2026-09-11 | PR #35 | 2026-09-11 | — |
| C | G2 STAFF-EPIC-002 Konten und Rollen | gesichtet | 2026-09-11 | PR #20 | 2026-09-11 | — |
| C | G3 OPS-001 Providerprüfung und Cloudprojekt | entwurf | 2026-09-21 | `e7fcb00`, PR #87 | — | Dokument steht, nichts bestanden |
| C | OPS-002a Test-Umgebung, vorgezogen (Block 1a) | fertig | 2026-09-25 | `656dff9`, `01b0b92` | — | erster Lauf gegen Uberspace nach dem Merge |
| C | G6 OPS-004 Logging, Redaction, Monitoring | in_arbeit | 2026-09-22 | `ff15f80` … `dcdb195` | — | Rest nach G3 |
| C | G6a Abgewiesene Lesezugriffe auf klinische Dokumente | fertig | 2026-09-23 | PR #104 | — | — |
| C | G6b Abgewiesene Lesezugriffe, Rest | fertig | 2026-09-23 | PR #105 | — | — |
| C | G6c Abgewiesene Schreibzugriffe | gesichtet | 2026-09-26 | `aa384bc` … (G6c-1, G6c-2, Zweitreview) | — | PostgREST-Antwort lokal mit supabase start prüfen (ANN-115) |
| C | G9 OPS-006 Betroffenenrechte (minimal) | fertig | 2026-09-22 | `aa321d0`, `2e3ebc7` | — | — |
| C | G11 OPS-007 Bootstrap Produktion (Runbook) | in_arbeit | 2026-09-22 | `a870992`, `f3b9497` | — | Probe gegen die Test-Umgebung offen |
| C | G12 ADR-019 Kartendienst (Fassung 2, angenommen 2026-09-13) | gesichtet | — | — | — | — |
| C | G19 Dokumentationsgate erweitern | fertig | 2026-09-22 | `7b95c22`, PR #102 | — | — |
| C | G20 SEC-EPIC-001 Sitzungssperre (ADR-025) | fertig | 2026-10-06 | SEC-001 bis SEC-003 | — | Auftrag Jannes (06.10.2026: nach 30/60 min automatisch sperren); W1 (a), W2 (a); W3 entschieden mit ADR-025 Fassung 2 (2026-10-10), Passkey und App-PIN in G22; Sichtung: Betriebsreife Schritt 15 |
| C | G22 SEC-EPIC-002 Anmeldung ohne Kennwort (ADR-025 Fassung 2) | fertig | 2026-10-10 | SEC-004 bis SEC-009 | — | Passkey und App-PIN, kein Kennwort (ADR-025 Fassung 2); scharf auf der Test-Umgebung, sobald Jannes Passkeys im Dashboard von praxis-test einschaltet; Sichtung: Betriebsreife Schritte 12, 15; Plattform Schritt 1 |
| E | D → ADR-018 Terminzustände | gesichtet | — | — | — | — |
| E | E10 Schreibrecht Mitarbeiterdaten | gesichtet | — | — | — | — |
| E | E8 → ADR-017 Dateiablage | gesichtet | — | — | — | — |
| E | B7 → ADR-019 Kartendienst bestätigen (E-20) | gesichtet | — | — | — | — |
| E | E14 Hausbesuch-Szenarien (Rechtsgrundlage Fall 1 mit B4) | vorlaeufig | — | — | — | — |
| E | E15 Office liest klinische Inhalte (Bewertung mit B2) | vorlaeufig | — | — | — | — |
| E | Providerprüfung Supabase (OPS-001) | entwurf | 2026-09-21 | `e7fcb00`, PR #87 | — | Dokument steht, Antworten ab Anfang 2027 |
| E | B4 Steuerliche Validierung | vorlaeufig | — | — | — | — |
| E | B2 DSFA, Schwellwertprüfung, DSB | vorlaeufig | — | — | — | — |
| E | B1 Zweckbestimmung, MDR-Abgrenzung, AI Act | vorlaeufig | — | — | — | — |
| E | B3 Validierung der Fristen (ANN-001) | vorlaeufig | — | — | — | — |
| E | E2 Ausfallkonzept (Entscheidungsteil) | vorlaeufig | — | — | — | — |
| E | ADR-023 Plattformzugang | gesichtet | 2026-09-30 | docs/adr/ADR-023-platform-access.md | — | W1 bis W6 von Jannes bestätigt (2026-09-30, wie empfohlen); Fassung 2 am selben Tag |
| E | ADR-024 Offline und Benachrichtigungen | gesichtet | 2026-10-11 | docs/adr/ADR-024-offline-and-notifications.md | — | angenommen 2026-10-11: W1 (c) mit Freigabe ohne Netz per Passkey, W2 bis W5 wie empfohlen; Prinzipien 0.26, ADR-025 Fassung 4 |
| E | ADR-026 Virenprüfung der Anhänge | entwurf | 2026-10-12 | docs/adr/ADR-026-malware-scanning.md | — | abgelehnt 2026-10-15 (Jannes): keine Virenprüfung; Anhänge von außen trotzdem zugelassen (ADR-017 Fassung 6); seit 2026-10-18 in der gesamten Anwendung (ADR-017 Fassung 7) |
| E | B5 Identität und Vertretung | vorlaeufig | — | — | — | — |
| E | B9 Betreuung ohne Heilbehandlung, Ernährung | vorlaeufig | — | — | — | — |
<!-- fortschritt:ende -->

## Änderungsvermerk
| Version | Datum | Änderung |
| --- | --- | --- |
| 7.25 | 2026-10-31 | Kreis `billing <-> patients` bleibt bewusst (Antwort zu #337). |

Vermerk 7.24: `git show c8dd2aa:docs/development/ROADMAP.md`; 7.23: `git show
6e6e37e:docs/development/ROADMAP.md`; bis 7.22 mit Zuschnitten:
`git show 9452575:docs/development/ROADMAP.md`; vor 7.0: `git show
eb43569:docs/development/ROADMAP-CHRONIK.md`.
