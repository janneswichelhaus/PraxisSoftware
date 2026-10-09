# Roadmap

Version 7.11 · Stand 2026-10-08 · **in Kraft**

Reihenfolge der Umsetzung. Beantwortet die Frage **„was als Nächstes"** — und
sonst nichts. Fassung 7.0 arbeitet das Produktgespräch vom 2026-09-23 ein
([`UMBAU.md`](UMBAU.md)): Handy und Bedienbarkeit kommen nach vorn, die
Plattform für Patient:innen hat zwei Stufen, die externen Anfragen gehen ab
Anfang 2027 parallel zum Bauen hinaus. Ältere Fassungen und ausführliche
Fortschrittsvermerke: [`ROADMAP-CHRONIK.md`](ROADMAP-CHRONIK.md).

## Was dieses Dokument ist und was nicht

- **Es legt die Reihenfolge fest, nie den Scope.** Was ein Eintrag konkret
  umfasst, entsteht erst im SPEC-Schritt des Loops. Die Zeilen hier sind
  Zuschnitte, keine Spezifikationen.
- **Es ist kein Auftrag.** Gebaut wird, was Jannes mit `/weiter` (oder
  `/feature-loop`) beauftragt; die nächste Aufgabe steht allein in [`../STATUS.md`](../STATUS.md).
- **Es überschreibt nichts.** `PROJECT_PRINCIPLES.md` (Rang 1), die ADRs
  (Rang 2) und die Spezifikation des Loops (Rang 3) gehen vor. Fehlt einem
  Eintrag eine Voraussetzung, gilt §15.1 (Annahme, reversibel an einer Stelle)
  und §15.2 (eine offene externe Klärung hält das Bauen nicht an).
- Verweise wie `IDEA-PRX-004` zeigen die **Herkunft** im Ideenspeicher
  (Rang 6) und importieren nichts. Seit 6.0 steht jede nicht verworfene Idee
  an einer Stelle dieses Plans — oder im Abschnitt „Nicht in V1" mit Grund.
- Befunde sammelt [`BEFUNDE.md`](BEFUNDE.md), den Stand der Oberfläche
  [`ARBEITSBEREICHE.md`](ARBEITSBEREICHE.md), die Ablaufrunden
  [`OPTIMIERUNG.md`](OPTIMIERUNG.md).

Ein Loop liest hier nur die Zeile seiner Aufgabe und den Absatz darüber
(Leseregel in `.claude/skills/weiter/SKILL.md`) und stellt am Ende
`fortschritt.json` und [`../STATUS.md`](../STATUS.md) nach; die Tabelle unter
„Fortschritt" entsteht daraus.

---

## Ziel und Umfang

**Die Praxis eröffnet im Juli 2027** — das ist der einzige Termin dieses
Dokuments (entschieden 2026-09-05, auf einen Termin zurückgeführt am
2026-09-21). Kein Vorgängersystem, keine Bestandsdaten, kein Parallelbetrieb.
Alles andere steht in einer **Reihenfolge**, nicht in einem Kalender.

**Zur Eröffnung läuft das Endprodukt** (Jannes, 2026-09-22;
`PROJECT_PRINCIPLES.md` §14). Zur Eröffnung arbeitet vor allem Jannes selbst
damit, bald kommt eine Bürokraft dazu; ein neues Teammitglied bindet der
Owner in der Anwendung selbst ein (§4). V1 umfasst:

1. **Kernprozess** der Heilbehandlung — Akte, Verordnung, Termine,
   Dokumentation, Leistungen, Rechnung, Zahlung, Löschung, Audit (gebaut).
2. **Tagesroute** mit Karte, Fahrzeiten, Handoff und Führung auf dem Gerät —
   am Handy in der Halterung, mit Vorschau auf den nächsten Weg und dem
   Hinweis auf die Behandlungsliege (§9).
3. **Befund** mit Anamnese (vorab ausfüllbar), Scores, Untersuchungsbausteinen,
   Therapiebericht; eine Erstaufnahme, die nichts vergisst, und Fotos in der
   Akte (§5).
4. **Praxisverwaltung** aus dem Ideenspeicher: Warteliste, Anruflisten,
   Aufgaben, Kennzahlen, Export für die Steuerberatung, Kartenzahlung.
5. **Trainingsbereich** in der Sicht der Betreuung.
6. **Plattform für Patient:innen und Kund:innen** (§4.6, §4.10).
   Trainingskund:innen sehen die Punkte aus
   [`../product/ideen/referenz-navigation.md`](../product/ideen/referenz-navigation.md)
   außer dem, was §17 verbietet. Patient:innen haben **zwei Stufen**: während
   der Behandlung kostenlos (Befundbogen, Termine und Wünsche, Rechnungen,
   Heimübungsplan, Check-ins), danach das Nachsorge-Abo. Die Ansichten für
   Patient:innen und Betreuung entwirft DSN-001 vor Block 4
   ([`PLATTFORM-ANSICHTEN.md`](PLATTFORM-ANSICHTEN.md)).
7. **Angebote:** das **Nachsorge-Abo** der Patient:innen nach dem Ende der
   Behandlung als Monatsrechnung; das **Trainingspaket** nach Zeitraum, nicht
   pausierbar, mit der Plattform im Preis; der Übergang aus der Behandlung
   über das Abschlussgespräch (§4.10).
8. **Praxisbetrieb:** Radflotte, Teamkommunikation (das „Slack-Äquivalent"),
   Urlaub, Zeitkonto, Erstattungen.
9. **KI-Assistenz** innerhalb von §6 und §17 — Sprachdokumentation,
   Strukturieren, Patientensprache, Antwortentwürfe, Zusammenfassung.

**Externe Prüfungen laufen ab Anfang 2027 parallel zum Bauen** (Jannes,
2026-09-23, §15.2): OPS-001, B1, B2 mit DSFA, B4 und die Anbieterprüfungen
gehen hinaus, sobald ihre Unterlagen stehen — spätestens im Januar 2027. Das
Bauen wartet auf keine Antwort; scharfgeschaltet wird erst nach den Prüfungen.
**Dauert das Bauen länger, wird nicht gekürzt** (Jannes, 2026-09-22): Dann
eröffnet die Praxis mit dem Papierprozess (H4), und die Software folgt.

### Nicht in V1 — und warum

Was Jannes' Umfang nennt, aber an Rang 1 oder 2 scheitert. Kommt nur mit einer
neuen Fassung der genannten Stelle zurück, nicht mit einem Loop.

| Was | Herkunft | Grund |
| --- | --- | --- |
| Automatische Progression, Regelwerk mit Korridor, Autoregulation als Vorschlag, Phasenwechsel und Wiedereinstieg als Automatik, Belastungssteuerung | `IDEA-TRN-001`/`-002`/`-006`/`-008` bis `-010`/`-012`/`-013`, `IDEA-QSN-004` | §17 Verbot 1, ADR-006 Punkt 10; B10. Im Register `src/app/mdr.ts` (`progression-regelwerk`). Die **von Hand** gesetzte Progression im Plan (`IDEA-TRN-004`, `-007`) bleibt in UEB-EPIC-002 |
| Ampel aus der Schmerzreaktion, Bewertung eines Verlaufs | `IDEA-TRN-003`, `IDEA-OUT-002` (bewertende Hälfte) | §17 Verbot 2; B10 |
| „KI-Analyse" als Einschätzung, ableitende Übungsanalyse, Cut-off-Anzeige | Navigationspunkte 7 und 15, `IDEA-KI-006`, `IDEA-OUT-006` | §17, ADR-006 Punkt 13; Register in `src/app/mdr.ts`. Die **anzeigende** Übungsanalyse und die Zusammenfassung ohne Bewertung sind in V1 |
| Wearables und Gesundheits-Apps | `IDEA-TRK-007` | §14 (gesperrt), ADR-014; bräuchte eine native App (ADR-015 Punkt 21) |
| Mandantenfähigkeit mit Branding, Vermarktung | `IDEA-QSN-009` | §14, ADR-003 |
| Interoperabilität | `IDEA-QSN-008` | Die Idee selbst: benennen, nicht bauen |
| Verworfen | `IDEA-PRX-015`, `IDEA-PRX-036`, `IDEA-ANG-002` | E-13; Entscheidung 2026-09-11; B11 |
| GKV, E-Rechnung, Kassenbuch und TSE, Factoring | Produktvision §1.1 | Privatabrechnung (§19); keine Barkasse vorgesehen |

---

## Grundsätze der Reihenfolge

Getroffen am 2026-09-22 (Jannes hat die Reihenfolge delegiert), ergänzt am
2026-09-23. Sie begründen die Kette unten; ein Loop, der von ihr abweicht,
sagt, gegen welchen Grundsatz.

1. **Erst schließen, dann öffnen.** Was die Behandlung am Tag braucht
   (Tagesroute, Befund, Praxisverwaltung), kommt vor allem, was sich nach
   außen öffnet. Das Produkt der Eröffnung ist die Behandlung.
2. **Fundament vor Oberfläche.** Was das Datenmodell oder die Rechte vieler
   Bereiche prägt, kommt vor dem, was darauf aufsetzt: Trainingsverhältnis vor
   Plattform, Plattformzugang vor Abo, Abo vor Plänen im Portal, Rückfragen vor
   Teamchat (dieselbe Nachrichtenmechanik, strengere Regeln zuerst). Additiv
   einziehen ist billig, nachträglich trennen teuer (ADR-014).
3. **Risiko vor Komfort — aber Bedienbarkeit ist kein Komfort.** Die
   Plattform öffnet die Anwendung für Menschen außerhalb der Praxis — die
   größte neue Angriffsfläche. Sie steht deshalb in der Mitte, nicht am Ende;
   Komfort (Farben, Planungskarte, Politur) steht am Ende. Begriffe,
   Bedienprinzipien und die Tagesansicht am Handy kommen dagegen **früh**
   (Block 1a): Jede weitere Oberfläche setzt darauf auf, und Nacharbeit wird
   mit jedem Bereich teurer. Organisation und Steuerung sind für den Owner
   Kernfunktionen, nicht Komfort.
4. **MDR-nahe zuletzt** (ADR-006 Punkt 13): Tracking, Fortschritt und KI
   kommen nach den Bereichen, die nur erfassen und darstellen.
5. **Jeder neue Anbieter bleibt abschaltbar.** Eine Funktion, die an einem
   noch ungeprüften Dienst hängt (Karte, Mail, SMS, KI, Zahlung), wird hinter
   einem Adapter mit `mock`-Weg gebaut und ist ohne ihn benutzbar oder
   abgeschaltet. So kann ein negatives Prüfergebnis eine Funktion kosten,
   aber nicht die Eröffnung.
6. **Sehen, was gebaut ist.** Jede Oberfläche kommt mit Bildschirmfotos in
   der Pull Request; gesichtet wird gesammelt am eigenen Handy (Regel 1).

---

## Die Kette bis zur Eröffnung

Blöcke in fester Reihenfolge; ein Block beginnt, wenn der vorige gebaut ist.
Innerhalb eines Blocks gilt die Pfeilfolge. Die Einzelheiten je Loop stehen
in den Etappen darunter.

| # | Block | Code-Loops | Docs-Sessions | Jannes |
| --- | --- | --- | --- | --- |
| 0 | **Erledigt** | alle Loops bis PAT-006 — Fortschrittstabelle | ADR-017 bis ADR-022, E18, OPS-001-Dokument | Sichtung |
| 1 | **Rückstand und Umbau** | ~~G19~~ (gebaut 2026-09-22) → ~~G6a~~ → ~~G6b~~ (gebaut 2026-09-23) → ~~G6c~~ (gebaut 2026-09-26) | Umbau U1 bis U4 ([`UMBAU.md`](UMBAU.md)) | ~~G6c: Wahl zu den Schreibpfaden~~ (2026-09-26: wie empfohlen); vier Sichtungen des Rückstands ([`../sichtung/`](../sichtung/README.md)) |
| 1a | **Handy und UX-Fundament** | ~~OPS-002a~~ (gebaut 2026-09-25) → ~~UX-EPIC-002~~ (gebaut 2026-09-26) → ~~UX-EPIC-003~~ (gebaut 2026-09-26) | ~~Umbau U5~~ (B16: Uberspace, 2026-09-23) | ~~Supabase-Testprojekt, Uberspace und GitHub-Secrets anlegen~~ (2026-09-25, [`hosting-optionen.md`](../decisions/hosting-optionen.md)); ~~Begriffe sammeln, die stören~~ (2026-09-26: alle in Ordnung); erste Sichtung am Handy |
| 2 | **Kern fertig** | MAP-006 → FRB-EPIC-001 → FRB-EPIC-002 → FRB-EPIC-003 → DOK-005 → DOK-006 → PRX-EPIC-001 → PRX-EPIC-002 → UX-EPIC-004 → PRX-EPIC-003 → PRX-EPIC-003b → STA-EPIC-001 | — | D2/D3 aus dem FRB-Plan; Sichtung |
| 3 | **Training** | TRN-EPIC-001 → -002 → -003 → -004 | — | Sichtung |
| 4 | **Plattformzugang** | ~~POR-EPIC-001~~ (gebaut 2026-09-30) → ~~-001b~~ (gebaut 2026-10-02) → ~~**ABN-EPIC-001**~~ (gebaut 2026-10-02) → ~~**ABN-EPIC-001b**~~ (gebaut 2026-10-02) → ~~**ABN-EPIC-001c**~~ (gebaut 2026-10-02) → ~~**ABR-EPIC-007**~~ (gebaut 2026-10-05) → ~~POR-EPIC-002~~ (gebaut 2026-10-06) → ~~-003~~ (gebaut 2026-10-07) | **DSN-001** Ansichten für Patient:innen und Betreuung · **ADR-023** Plattformzugang (beide vor POR-EPIC-001) | ~~DSN-001 bestätigen~~ (2026-09-30: wie empfohlen) · ~~ADR-023 bestätigen~~ (2026-09-30: wie empfohlen) |
| 5 | **Angebote** | ~~ANG-EPIC-001~~ (gebaut 2026-10-07) → ~~ANG-EPIC-002~~ (gebaut 2026-10-07) → ~~KND-EPIC-001~~ (gebaut 2026-10-07) | — | Abo- und Paketpreise (bis dahin synthetisch) |
| 6 | **Pläne und Rückfragen** | ~~UEB-EPIC-001~~ (gebaut 2026-10-07) → ~~-002~~ (gebaut 2026-10-07) → ~~-003~~ (gebaut 2026-10-08) → ~~KOM-EPIC-001~~ (gebaut 2026-10-09) → -002 → -003 | **ADR-024** Offline-Erfassung und Benachrichtigungen (vor KOM-EPIC-003) | ADR-024 bestätigen |
| 7 | **Verlauf und Alltag** | TRK-EPIC-001 → -002 → -003 → OUT-EPIC-001 → ALT-EPIC-001 → ALT-EPIC-002 → ORG-EPIC-001 | — | Sichtung |
| 8 | **Praxisbetrieb** | FLT-EPIC-001 → TEAM-001 → URL-001 → ZK-001 → ERS-001 | — | Tübinger Standortvorlage (Depot, Werkstatt) |
| 9 | **Assistenz und Komfort** | KI-EPIC-001 → KI-EPIC-002 → MAP-007 → PRX-EPIC-004 → UI-003 | — | Sichtung |
| 10 | **Feature-Freeze** | nur Befunde | Betriebsdokumentation | Probewoche 1 · Kollegin-Test · **M2** |
| 11 | **Prüfungen** — ab Anfang 2027, **parallel** zu den Blöcken, die dann laufen | Befunde aus den Prüfungen | DSFA-Paket (G14) und Anfragen bis Ende 2026 vorbereiten, dann Antworten einarbeiten | OPS-001-Unterlagen · B1, B2, B4, B8 · Anbieterverträge |
| 12 | **Betriebsreife** | OPS-002 → OPS-003 → OPS-004 Rest → OPS-007-Probe | BETRIEB-001 · Rückfallplan · Kurzanleitung | Cloudprojekt (G3) · Restore-Test 1 und 2 · Notfallzugang |
| 13 | **Gate und Produktion** | keine Epics | Nachweistabelle MUSS → Test | **M3** Gate · **M4** Produktion |
| 14 | **Eröffnung** | Hotfixes | Erster-Tag-Protokoll · Schulung | Probewoche 2 · Restore-Test 3 · Change-Freeze · **M5** · **M6** |

**Block 11 läuft ab Anfang 2027 neben dem Bauen** (E-1), Block 12 beginnt,
sobald OPS-001 positiv ist und das Cloudprojekt steht; auf B1 und B2 wartet
er nicht. Die Test-Umgebung aus Block 1a enthält nur synthetische Daten und
ist kein Cloudprojekt für echte Daten.

**Docs-Sessions laufen neben dem Code.** DSN-001, ADR-023 und ADR-024 dürfen früher
geschrieben werden als ihr Block — sie sollen angenommen sein, wenn ihr erster
Loop beginnt, damit Jannes' Bestätigung nicht auf dem Weg liegt.

---

## Meilensteine

Ein Meilenstein ist erreicht, wenn **alle** Kriterien erfüllt sind. Er trägt
kein Datum; eine Planungssession meldet **erreicht** oder **offen** und nennt das
fehlende Kriterium.

| MS | Name | Kriterien |
| --- | --- | --- |
| M1 | Kernprozess Ende-zu-Ende | Ein synthetischer Fall läuft **lokal** durch: Verordnung → Serie → Termin durchgeführt → Dokumentation finalisiert → Leistung → Rechnung → Zahlung · derselbe Fall als E2E-Test hinter der Anmeldung · von Jannes gesichtet · jede Datenklasse hat Löschpfad und Test |
| M2 | Software fertig (Feature-Freeze V1) | Blöcke 1 bis 9 gebaut **und gesichtet** · Probewoche 1 durchlaufen, Befunde geschlossen · Kollegin-Test durchlaufen · DSFA-Paket und Anfragen verschickt · kein offener Befund der Klasse „Datenverlust/Falschzuordnung" |
| M3 | Go-live-Gate | Ergebnisse aus B1, B2 (DSFA) und B4 liegen vor und sind eingearbeitet · OPS-001 positiv · jede Anbieterprüfung positiv **oder** die Funktion abgeschaltet · ADR-007 sieben Vorbedingungen · kein Register-Eintrag Datenschutz/Recht auf `offen` oder `entschieden (Jannes)` · Restore-Test 1 und 2 · Deployment aus Tag mit Freigabe · Redaction-Prüfung grün · Betriebsdokumentation (13 Positionen) · OPS-007 gegen die Test-Umgebung geprobt · Rückfallplan unterschrieben · Messrunde nach `OPTIMIERUNG.md` · Sitzungssperre nach ADR-025 gebaut und gesichtet (G20) |
| M4 | Produktionssystem steht | Produktivprojekt in freigegebener EU-Region aus dem freigegebenen Tag · OPS-007 durchlaufen · keine synthetischen Daten · Backup, Monitoring und Release-Takt nach BETRIEB-001 aktiv |
| M5 | Eröffnung | **Juli 2027.** Probewoche 2 durchlaufen · Restore-Test 3 · Change-Freeze eingehalten · Datenschutzinformation und Behandlungsvertrag nennen alle Auftragsverarbeiter · erster Behandlungstag läuft mit der Software |
| M6 | Erster Betriebsmonat | Vier Wochen ohne Befund der Klasse „Datenverlust/Falschzuordnung" · Störfallliste ausgewertet · Optimierungsrunde durchgeführt |

---

## Abweichungsregeln

1. **Sichtung statt Abnahme je Epic** (Jannes, 2026-09-23, E-6). Ein Loop
   ohne Oberfläche ist fertig mit grüner CI, `pnpm test:db` und Zweitreview.
   Ein Loop mit Oberfläche bringt Bildschirmfotos (Desktop und 375 px) in der
   Pull Request. Jannes sichtet gesammelt je Block am eigenen Handy — ab
   Block 1a auf der Test-Umgebung, bis dahin lokal im WLAN — mit `/sichtung`
   nach [`../sichtung/README.md`](../sichtung/README.md): eine Datei je Etappe,
   höchstens 15 Schritte. Der Rückstand von über 30 Epics steht in vier
   solchen Dateien (Kernprozess, L, T, G).
2. **Das Bauen dauert länger.** Der Umfang wird nicht gekürzt (Jannes,
   2026-09-22). Die Anfragen laufen trotzdem ab Anfang 2027. Steht M4 zur Eröffnung
   nicht, eröffnet die Praxis mit dem Papierprozess (H4), und die Software
   folgt — nie auf Kosten einer Sicherheits- oder Datenschutzmaßnahme (§16).
3. **Eine Prüfung widerlegt eine Annahme.** Die Annahme wird an ihrer einen
   Stelle umgestellt (§15.2); die betroffene Funktion bleibt bis dahin
   abgeschaltet (Grundsatz 5), alles andere geht weiter.
4. **Eine neue Idee kommt dazu.** Ideen nach dem 2026-09-22 gehen in den
   Ideenspeicher und stehen **nach V1**, bis Jannes sie ausdrücklich in eine
   Etappe legt. Nach M2 kommt nichts mehr dazu.

---

## Risiken

| Nr | Risiko | Eintritt | Wirkung | Frühindikator | Gegenmaßnahme |
| --- | --- | --- | --- | --- | --- |
| R1 | **Die Prüfungen kommen zu spät für Juli 2027.** B2 mit DSFA und B1 brauchen erfahrungsgemäß vier bis sechs Monate | mittel | sehr hoch | Die Anfragen sind im Januar 2027 nicht verschickt | Anfragen ab Anfang 2027 parallel zum Bauen (E-1); DSFA-Paket und Anfragen bis Ende 2026 vorbereiten; was danach noch gebaut wird, geht als Nachtrag hinterher; Rückfall H4 |
| R2 | Providerprüfung Supabase negativ — und das erst 2027 | niedrig | sehr hoch | Gate-Punkt 3 (§203 Abs. 4 StGB) unbeantwortet | Nähte eines Wechsels in Teil 7 von [`../decisions/providerpruefung-supabase.md`](../decisions/providerpruefung-supabase.md); die Unterlagen aus Teil 9 zu laden kostet nichts und ist keine Anfrage |
| R3 | Jannes' Zeit reicht nicht für Abnahmen — **eingetreten** (über 30 Epics seit 2026-09-12 ohne Abnahme) | eingetreten | hoch | Ein Block endet ohne Sichtung | Sichtung statt Abnahme je Epic (Regel 1), Rückstand auf vier Sichtungen zu höchstens 15 Schritten verdichtet; Bildschirmfotos in jeder PR; Test-Umgebung fürs Handy (Block 1a) |
| R12 | Die Oberfläche passt nicht zur Arbeit am Rad und wird spät nachgearbeitet | mittel | hoch | Jannes findet Begriffe oder Abläufe unklar | UX-Fundament in Block 1a; Begriffsliste als Maßstab jeder neuen Oberfläche; Sichtung am Handy |
| R4 | Der Umfang ist rund dreimal so groß wie in 5.49 | hoch | hoch | Block 4 beginnt nicht, während Block 2 noch offen ist | Reihenfolge nach Grundsatz 3 (Komfort zuletzt); Loops klein schneiden; Tempo im Wochenupdate zählen |
| R5 | Die Plattform öffnet die Anwendung nach außen (Konten für Patient:innen und Kund:innen) | mittel | sehr hoch | ein Portalpfad ohne Negativfall in `pnpm test:db` | ADR-023 vor dem ersten Loop; jede Portalsicht mit Negativfall „fremde Person"; Zweitreview Pflicht (ADR-013 Punkt 9) |
| R6 | Befunde aus der Sichtung kommen als Welle | hoch | mittel | Rückstand wächst | Abweichungsregel 1; Befunde als erste Story der nächsten Loop derselben Etappe |
| R7 | MDR: Tracking, Fortschritt und KI rücken an die Grenze | mittel | sehr hoch | eine Story, die eine Aussage **über** Daten erzeugt statt sie zu zeigen | §17 und das Register `src/app/mdr.ts`; „Nicht in V1" oben; B1 prüft den ganzen Umfang |
| R8 | Kein Mailversand an Patient:innen: Die Plattform braucht Einladungen und Hinweise, der eingebaute Versand stellt nur ans Projektteam zu (BEF-026, B13) | hoch | hoch | POR-EPIC-001 ohne Zustellweg | Versand hinter einem Adapter mit `mock`-Weg (Grundsatz 5); eigener SMTP-Anbieter als Anbieterprüfung in Block 11 |
| R9 | `pg_cron`, PITR und Logfrist halten beim Provider nicht (R14 alt) | mittel | mittel | Produktivprojekt ohne PITR | PITR als Bedingung im Anlage-Runbook (G3); Logfrist `BETRIEBSLOG_FRIST_TAGE` in `src/lib/protokoll.ts`, Entscheidung bei Jannes |
| R10 | Mobile Endgeräte ohne Richtlinie | mittel | hoch | TOM ohne Abschnitt Endgeräte | Endgeräte-Richtlinie in G14/G16; MFA einrichtbar (ANN-028) |
| R11 | PTV Developer scheitert am Vertrags-/§203-Gate | mittel | mittel | ein Gate-Punkt aus Teil 5 negativ | Adapter hinter `contract.ts`; zweite Wahl MapTiler und HERE mit eigener Prüfung |

---

## Etappen

Gebaute Etappen stehen nur noch mit ihrem Abschluss hier; ihre Zuschnitte
liegen in der Chronik. Die Spalte „Quelle" nennt die Herkunft im
Ideenspeicher — sie begründet keinen Scope, sie sagt nur, woher der Zuschnitt
kommt.

### Gebaut

- **Etappe 1 — Kernprozess** (bis M1): DOK-EPIC, VER-EPIC-001/002, UI-000,
  UX-EPIC-001, LOE-EPIC-001, CAL-EPIC-003a/b, ROL-EPIC-001, CAL-018,
  CAL-EPIC-004a/b/c, FIX-EPIC-004, UX-013, GRD-001, ABR-EPIC-001 bis 003,
  FIX-EPIC-001. Offen ist allein **M1** selbst (Sichtung und E2E-Fall).
- **Etappe L — Zwei Leistungsbereiche im Fundament:** ABR-EPIC-004,
  LEI-EPIC-001, CAL-EPIC-005, ABR-EPIC-005, ABR-EPIC-006 (fertig 2026-09-21).
- **Etappe T, erster Teil:** MAP-002 bis MAP-005 (fertig 2026-09-22).
- **Etappe G, gebaute Teile:** G1 ADR-017, G2 STAFF-EPIC-002, G4
  DAT-EPIC-001, G6 OPS-004 (zwei Teile), G8 PAT-006, G9 OPS-006, G11 OPS-007
  (Runbook, lokal geprobt).
- **Querschnitt:** FRB-EPIC-000 (Schema der Instrumente), das Register
  `MDR_REVIEW_REQUIRED`, CAL-027.

**Bewusst ungeplant bleiben** zwei Umbauten ohne fachlichen Gewinn: das
Adressfragment `verordnungen` → `grundlagen` (ANN-062) und die Teilung von
`src/features/treatment-bases`. Beide nimmt ein Loop mit, der ohnehin dort
arbeitet.

### Block 1 — Rückstand

| Loop | Ergebnis | Zuschnitt |
| --- | --- | --- |
| ~~**G19**~~ | **gebaut 2026-09-22** — Das Dokumentationsgate prüft, ob Aussagen über andere Dokumente stimmen (BEF-028) | Verweise auf ADR-Fassungen und Prinzipienversionen gegen den Stand, `§NN` gegen vorhandene Abschnitte, Eindeutigkeit der `ANN-`/`BEF-`/`IDEA-`-Nummern; Nennungen in Änderungsvermerken bleiben erlaubt |
| ~~**G6a**~~ | **gebaut 2026-09-23** — Abgewiesene Lesezugriffe auf klinische Dokumente sind nachweisbar (ADR-010 Punkt 2) | Die fünf Lesepfade auf Behandlungsdokumentation und klinische Behandlungsgrundlage weisen mit null Zeilen und einem `denied`-Eintrag ab, geschrieben über `app.record_denied_read`. `audit.test.ts` hält die Liste der Pfade fest |
| ~~**G6b**~~ | **gebaut 2026-09-23** — Die übrigen abgewiesenen Lesezugriffe sind nachweisbar | Bestandsaufnahme per `pg_proc`: 119 Funktionen mit `not allowed to …`. 34 weitere Lesepfade weisen mit null Zeilen (skalar `null`) und `denied` ab; Aktion wie beim erfolgreichen Zugriff oder eine von zehn denied-only-Aktionen je Datenbereich. Maßstab: Die Oberfläche ruft den Pfad für die abgewiesene Rolle nie auf. Ausnahme `list_assignable_therapists` (trainer auf den Teamseiten, BEF-034) |
| ~~**G6c**~~ | **gebaut 2026-09-26** — Abgewiesene Schreibzugriffe sind nachweisbar | Zehn Pfade für Rollen und Konten, Legal Hold und Löschaufträge schreiben über `app.record_denied_write` einen `denied`-Eintrag und antworten mit HTTP 403 in bestätigter Transaktion; der Client prüft den Status (ANN-115). **Entschieden (Jannes, 2026-09-26): wie empfohlen** — (a) für Rollen und Konten, Legal Hold und Löschaufträge, (c) für den Rest. Zur Wahl standen: (a) bestätigte Transaktion mit HTTP 403 über `response.status` von PostgREST, lokal mit `supabase start` zu prüfen; (b) Ereignis ins Betriebslog statt ins Auditlog, hängt an G3 und R9; (c) Schreibpfade bleiben ohne Eintrag. G6c baut als nächster Loop, **vor** Training und Plattform |

### Block 1a — Handy und UX-Fundament

Jannes will sehen, was gebaut ist, und zwar am Handy in der Halterung am Rad
(E-2, E-5). Die Oberfläche ist heute auch am Desktop unübersichtlich, und
Beschriftungen folgen eher dem Datenmodell als der Praxis. Vor jeder weiteren
Oberfläche kommen deshalb die Test-Umgebung und das Fundament der Bedienung.

| Loop | Ergebnis | Zuschnitt | Voraussetzung |
| --- | --- | --- | --- |
| ~~**OPS-002a**~~ | **gebaut 2026-09-25** — Jannes öffnet die Anwendung auf dem eigenen Handy, von überall; Auslieferung nach grüner CI auf `main`, Seed auf Knopfdruck (ANN-100, ANN-101) | Test-Umgebung nach G5, **vorgezogen**: Supabase-Projekt in der EU nur mit synthetischen Daten, Hosting der Oberfläche nach B16 ([`hosting-optionen.md`](../decisions/hosting-optionen.md)), eigene Domain, Zugang geschützt, Deployment aus `main` nur dorthin; Seed mit einer Praxiswoche. Kein Produktivprojekt (§3.2) | Jannes legt Konten an (B16) |
| **UX-EPIC-002** | Die Anwendung spricht die Sprache der Praxis | Begriffsliste aus Jannes' Sammlung (Beschriftungen, Knöpfe, Meldungen) als eine Quelle im Code; Bedienprinzipien (ein Hauptknopf je Ansicht, was nicht gebraucht wird, ist eingeklappt, Handy zuerst); Navigation und Arbeitsbereiche danach durchgesehen; Bildschirmfotos vorher und nachher | ~~Begriffsliste von Jannes~~ (2026-09-26: Begriffe in Ordnung); BEF-035 bis BEF-040, UX-002f bis UX-002h und BEF-041 bis BEF-044 gebaut 2026-09-26 (ANN-108 bis ANN-114); Sichtung am Handy offen |
| ~~**UX-EPIC-003**~~ | **gebaut 2026-09-26** — Der Tag beginnt am Rad mit dem, was zählt: Liege heute, erster Weg, Vorschau, bisherige Doku (ANN-116, ANN-117); Sichtung in Kernprozess Schritt 10 und 12 | Tagesansicht fürs Handy als Startseite (aus PRX-EPIC-002 vorgezogen): erster Weg, Vorschau auf den nächsten, kurze Hinweise zur Person, **Behandlungsliege heute: ja, ab dem n-ten Besuch** (§9; Merkmal an der Person, in der Akte setzbar, im Befund ab FRB-EPIC-003), bisherige Doku mit einem Tipp; offene Punkte der Erstaufnahme als Hinweis, sobald PRX-EPIC-003 sie liefert | UX-EPIC-002 |

### Block 2 — Kern fertig

**Etappe T, Rest.** Zuschnitt in [`MAP-LOOPS.md`](MAP-LOOPS.md). Gebaut wird
mit synthetischen Adressen; das Gate aus ADR-019 Punkt 9 steht vor dem
Scharfschalten, nicht vor dem Bau (ADR-019 Fassung 4, §15.2).

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| ~~**MAP-006**~~ | **gebaut 2026-09-25** — Die Tagesroute liegt auf der Karte, mit Route, Fahrzeiten und Erreichbarkeit im Kalender | Koordinaten bei der Adresse (ANN-016), Startort je Tag, Route und Fahrzeiten, Tourenliste druckbar, Handoff mit Koordinaten; **Fahrpuffer aus §8.1** mit Aufrundungsregel als Testfall (09:05–10:05 plus 12 Minuten ergibt 10:20) und Warnung bei Unterschreitung (E12 Punkt 3 und 4); ersetzt die Vorschau `/touren` | `IDEA-PRX-017`, `-029`, `-032` |

**Etappe 2 — Befund.** Plan, Phasen und Vorentscheidungen in
[`FRB-BAUSTEINE-UND-SCORES.md`](FRB-BAUSTEINE-UND-SCORES.md); Material in
[`../../quellen/README.md`](../../quellen/README.md). Zur Eröffnung ist jede
Patientin eine Neuaufnahme — deshalb gleich nach der Tagesroute.

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| ~~**FRB-EPIC-001**~~ | **gebaut 2026-09-25** — Die Instrumente liegen als versionierte Bibliothek mit Lizenzfeld vor; NRS, PSFS und Veränderungsfrage inaktiv bis zur Vorlage (ANN-099) | Instrumentenbibliothek (P1-Schema aus FRB-EPIC-000), freie Instrumente NRS und PSFS, globale Veränderungsfrage; berechnen ja, bewerten nein | `IDEA-OUT-001`, `-003`, `-004` |
| ~~**FRB-EPIC-002**~~ | **gebaut 2026-09-26** — Anamnese und Verlauf stehen in der Akte: Anamnesebogen V8 aktiv, Hervorhebung nach acht offengelegten Regeln (ANN-104), Körperschema, Verlauf als Punkte mit Ereignissen (ANN-106) | Anamnesebogen nach §7 in der Praxis ausfüllbar (vorab über die Plattform ab POR-EPIC-002, auf Papier als Foto nach DOK-006), Red Flags nach §7.1 hervorgehoben, Verlauf mit Ereignismarkierungen ohne Bewertung, Körperschema im Befund; B8 als Annahme | `IDEA-OUT-005`, `IDEA-PRX-027` |
| ~~**FRB-EPIC-003**~~ | **gebaut 2026-09-26** — Der Befund entsteht aus Bausteinen zum Abhaken: neun Regionen wörtlich als Daten, Vorschlag in den Eintrag, Liege im Befund (ANN-118 bis ANN-120); Bilder und Skalen als FRB-EPIC-004/005 ausgegliedert, Sichtung Befund Schritte 6 und 7 | Phasen P2 und P3 des FRB-Plans: neun Regionen als Daten (Zähltest), Renderer mit Live-Vorschau des Texts, Textbausteine auch im Befund, ein Bild ruft den Test in Erinnerung; **Liege-Merkmal im Befund**; Bausteine und Skalen auch für die Verlaufsdoku — der Weg ohne Sprechen (§5) | `IDEA-PRX-043`, `IDEA-OUT-009` |
| ~~**DOK-005**~~ | **gebaut 2026-09-26** — Ein Therapiebericht an die Verordner:in entsteht aus Befund und Verlauf: gespeichert und beim Abschluss eingefroren, Inhalt angekreuzt und wörtlich, Empfehlung mit Quelle und Datum an der Verordnung (ANN-121 bis ANN-124); Sichtung Befund Schritte 8 und 9 | Bericht als Druckansicht (B14 Weg 1), Inhalt nur übernommen, nicht interpretiert (§17); dazu die **Empfehlung zum Verordnungsende** mit Quelle und Datum (Wiedervorlage aus VER-EPIC-002, ANN-014) | `PROJECT_PRINCIPLES.md` §4.2 |
| ~~**DOK-006**~~ | **gebaut 2026-09-26** — Fotos liegen in der Akte, ohne in der Mediathek des Handys zu landen: Kameradialog für Dokumente und Patientenfotos, Metadaten vor dem Upload entfernt (ANN-125), Patientenfotos auf eigener Einwilligung mit eigener Klasse und Löschung beim Widerruf (ANN-126, ANN-127), Vergleich zweier Fotos im Verlauf, Herausgabe nur an die Person (ANN-128); Sichtung Befund Schritte 10 bis 12 | Aufnahme über die Kamera der Anwendung für Verordnung und Papierbögen; **Fotos von Patient:innen** mit eigener Einwilligung, Frist und Entfernung der Aufnahmemetadaten — freigegeben mit ADR-017 Fassung 2 (Abschnitt G, angenommen 2026-09-26); Vergleich zweier Fotos im Verlauf, ohne Bewertung (§17) | Jannes 2026-09-23; §5 |
| **FRB-EPIC-004** | Skalen in der Verlaufsdoku — die aktuelle Lage antippen statt tippen | Startet mit der Aktivierung von NRS und Veränderungsfrage (ANN-099; Wortlaut beider freigegeben 2026-09-28/29 als **Praxisvorgaben**, nicht als validierte Schmerz-NRS; **PSFS gestrichen**; die Definitionsdateien werden hier nachgezogen): Skalen an der Dokumentation erheben, als Erhebung gespeichert und als Zeile in den Vorschlag; kein zweiter Wert neben der Erhebung (§13). Die **Veränderungsfrage steht ab dem zweiten Termin je Patient:in oben in der Dokumentation** (Jannes 2026-09-28). Aus FRB-EPIC-003 ausgegliedert (Jannes 2026-09-26) | §5, FRB-EPIC-001 |
| **FRB-EPIC-005** | Ein Bild ruft den Test in Erinnerung | Startet, sobald Bilder vorliegen (eigene Zeichnung, Lizenz nach B8 oder Foto nach §20): optionales Bild je Test in der Definition, beim Abhaken gezeigt, ohne Bewertung (ADR-006). Aus FRB-EPIC-003 ausgegliedert (Jannes 2026-09-26) | `IDEA-OUT-009` |

**Etappe P — Praxisverwaltung.** Die Ideen aus
[`../product/ideen/10-praxisverwaltung.md`](../product/ideen/10-praxisverwaltung.md),
die den Tag erleichtern. Der Komfortteil steht als PRX-EPIC-004 in Block 9;
die Kennzahlen sind als **STA-EPIC-001** daraus vorgezogen (2026-09-26,
Grundsatz 3: Steuerung ist für den Owner Kernfunktion, nicht Komfort).

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| ~~**PRX-EPIC-001**~~ | **gebaut 2026-09-28** — Ein freier Platz findet eine Patientin: Warteliste mit organisatorischer Dringlichkeit (ANN-132 bis ANN-134), Gebietstage als Warnung (ANN-135), Terminsuche als Vorschlagsliste mit Fahrweg als Kennzeichen (ANN-136), Nachrücken in einer Transaktion; Sichtung Praxisverwaltung Schritte 1 bis 3 | Warteliste mit Zeitfenstern und Nachrücken, automatische Terminsuche als Vorschlagsliste, Gebietstage für die Terminvergabe | `IDEA-PRX-003`, `-008`, `-031` |
| ~~**PRX-EPIC-002**~~ | **gebaut 2026-09-28** — Am Termin steht, was man vor der Tür wissen muss: Kurzblick aufklappbar und protokolliert (ANN-137), Material von Hand an der Person, am Tag ohne Namen (ANN-138), „Termin n von m“ und Abrechnungslage nur fürs Büro (ANN-139), Heilmittel bestätigen am eigenen Termin (ANN-140); BEF-055 Teil 1; Sichtung Praxisverwaltung Schritte 4 bis 6 | Vertretungs-Kurzblick (aufklappbar, auditiert), „Mitnehmen" aus den letzten Befunden, Abrechnungslage und Verordnungszähler am Termin, Termin abhaken mit Heilmittel und Kontingent | `IDEA-PRX-034`, `-016`, `-035`, `-037`, `-009`, `-039` |
| ~~**UX-EPIC-004**~~ | **gebaut 2026-09-29** — Ruhiger und übersichtlicher: Befunde BEF-071 bis BEF-081 aus den Sichtungen Praxisverwaltung und Kernprozess (Rückweg aus der Terminsuche, Kalenderstand, heute im Monat, kurze Kacheln, Meldungen im Sichtfeld, Erklärungen eingeklappt, erledigte Tests auf einer Zeile, Bausteine ohne Verwaltung, Verlauf als Karten, Abschnitt „Abrechnung“, „Protokoll“ statt „Auditlog“); vor PRX-EPIC-003 auf Wunsch von Jannes | UX-004a bis UX-004e | BEF-071 bis BEF-081 |
| ~~**UX-EPIC-005**~~ | **gebaut 2026-09-30** — Entrümpeln auf Wunsch von Jannes (BEF-084 bis BEF-087): Terminseite mit Kopfzeile (Datum, Zeit, Mitteilungszeichen) und Kacheln statt Tabelle, behandelnde Person nur an fremden Terminen (ANN-193), der Hausbesuch als Regelfall ohne Wort in allen Kacheln und Zeilen (ANN-192), „Niemand öffnet?“ als zugeklappte Schrittfolge mit Rufnummern, Zeit außerhalb der Arbeitszeit im Kalender grau schraffiert; zweiter Durchgang über alle Bereiche (Akte, Terminformulare, Übersicht und Büro, Organisation, Abrechnung, Training): Regelfälle ohne Abzeichen, leere Werte ohne Zeile, Systemerklärungen weg oder zugeklappt; Sichtung Praxisverwaltung Schritt 9 | UX-005a bis UX-005i | BEF-084 bis BEF-091 |
| ~~**PRX-EPIC-003**~~ | **gebaut 2026-09-29** — Nichts fällt durch: Office erfasst Grundlagen (ANN-011), Verordnungsfoto am Termin und „Grundlage erfassen“ mit dem Foto daneben (ANN-141), Aufgaben und Wiedervorlagen (ANN-142), Erstaufnahme-Checkliste aus der Akte (ANN-143), Anrufliste mit gespeichertem Stand (ANN-144), Dublettenhinweis (ANN-145), Erinnerungen am Rezeptende und an den Abschluss (ANN-146), alles unter **Übersicht → Offene Punkte**; BEF-060 Teile 1 und 2; Zusammenführen als PRX-EPIC-003b ausgegliedert (Jannes 2026-09-29); Sichtung Praxisverwaltung Schritte 10 bis 12 | **Verordnung ohne Papier** (Jannes 2026-09-28): Therapeut:in fotografiert am Termin mit der Kamera der App (Verordnungsscan), daraus ein offener Punkt „Verordnung zu erfassen“ in einer Büroliste; Office öffnet „Grundlage erfassen“ mit dem Foto daneben und tippt ab — dafür **Schreibrecht für `office`** an der Grundlage (ANN-011). KI-Vorschlag der Felder bleibt in KI-EPIC-002 (Block 9). **Erstaufnahme-Checkliste** (Verordnungsfoto, Befundbogen, Einwilligungen, Befund, Liege; offen in Tagesansicht, Aktenkopf und Büroliste, bis erledigt — §5), Aufgaben und Wiedervorlagen mit Patientenbezug, Anrufliste für morgen mit gespeichertem Stand, Dublettenprüfung und Zusammenführen, Verordnung per Kamera, Erinnerung am Rezeptende und an den vergessenen Abschluss | `IDEA-PRX-019`, `-005`, `-041`, `-018`, `-023`, `IDEA-LZK-007`, `-009` |
| ~~**PRX-EPIC-003b**~~ | **gebaut 2026-09-29** — Zwei Akten derselben Person werden eine: `owner` übernimmt aus den Stammdaten eine Dublette mit Vorschau und Bestätigung; alles wandert, Unveränderliches wechselt nur den Bezug; Stammdaten, Versorgungsstand, Sperren und Nachweis nach ANN-147 bis ANN-150; Sichtung Praxisverwaltung Schritt 13 | Zusammenführen einer Dublette durch `owner`, auditiert, nie automatisch: Termine, Grundlagen, Dokumentation, Rechnungen, Dateien, Einwilligungen, Aufgaben und Warteliste wandern auf die richtige Akte — der Bezug wechselt, der Inhalt nicht (finalisierte Dokumentation, ausgestellte Rechnungen bleiben unverändert); die leere Akte fällt mit Nachweis. Aus PRX-EPIC-003 ausgegliedert (Jannes 2026-09-29); Zweitreview Pflicht | `IDEA-PRX-018` |
| ~~**STA-EPIC-001**~~ | **gebaut 2026-09-29** — Die Praxis wird über fünf Zahlen gesteuert: eigener Bereich **Statistiken** nur für `owner`, eine Serverfunktion für Umsatz und Zahlungseingang (getrennt, ANN-151), offene Posten nach Alter, Auslastung als Praxissumme (ANN-152), Verordnungen ohne Anschluss, Ausfälle (ANN-153); Zielwerte je Karte, Handlung je Kennzahl (ANN-155), Monatsvergleich und CSV; dazu Grafiken (12 Monate, Umsatz nach Therapeut:in, Leistungen), Vergütungsmodell und eigener Umsatz bei Umsatzbeteiligung (B6 aufgelöst, ANN-156, ANN-157); Sichtung Praxisverwaltung Schritte 14 und 15 | Eigener Arbeitsbereich **Statistiken**, nur `owner` (ADR-004), nur Praxissummen (§20, B6): **(1)** Umsatz und Zahlungseingang des Monats gegen Vormonat und Ziel, **(2)** offene Posten mit Alter, **(3)** Auslastung der nächsten zwei Wochen (gebuchte gegen verfügbare Behandlungsstunden), **(4)** Verordnungen, die in 14 Tagen enden oder deren Kontingent aufgebraucht ist, ohne Anschluss — samt ungedeckten Terminen, **(5)** Ausfälle der letzten vier Wochen mit Ausfallhonoraren. Zu jeder Zahl ein Zielwert (von Jannes einstellbar) und **die eine Handlung**, die sie auslöst (Mahnung, Anrufliste, freie Fenster, Verordner:in anfragen); Zeitraumvergleich; CSV. Berechnung deterministisch in einer Quelle mit Testfällen je Kennzahl, Werte aus Abrechnung (ADR-009) und Terminen (ADR-018), keine zweite Datenhaltung | `IDEA-PRX-025` |

### Block 3 — Etappe TR: Trainingsbereich

**Freigegeben nach `PROJECT_PRINCIPLES.md` §14** (seit 2026-09-22). Etappe L
hat das Fundament gebaut; was fehlt, ist jede Tür dorthin: Kein Schreibweg
legt ein Trainingsverhältnis an, die Rolle Trainingsbetreuung ist nicht
zuweisbar (`WAEHLBARE_ROLLEN` in `src/features/staff/StaffAccountSection.tsx`),
kein Schreibweg setzt `kind = 'training'`, und `invoices.patient_id` ist
`not null` — eine Trainingskund:in ohne Behandlungsverhältnis
(`IDEA-LZK-008`) bekommt heute keine Rechnung.

| Loop | Ergebnis | Zuschnitt | Voraussetzung |
| --- | --- | --- | --- |
| ~~**TRN-EPIC-001**~~ | **gebaut 2026-09-30** — Eine Trainingskund:in entsteht in der Anwendung — ohne Akte — und jemand darf sie betreuen: Bereich **Training** (Liste, Anlegen mit Dublettenhinweis, Detail, Vertrag beenden), Schreibwege mit Audit auf Aktenniveau, Kontaktdaten am Verhältnis, Trainingsbetreuung zuweisbar; ANN-172 bis ANN-175; Sichtung Training Schritte 1 bis 3 | **TRN-001** Schreibwege für das Trainingsverhältnis mit Policies nach §4.9 und Audit auf § 203-Niveau (ADR-021 Punkt 8) · **TRN-002** Person **ohne** Behandlungsverhältnis anlegen, `patients` bleibt unberührt; eine vorhandene Person bekommt ihr zweites Verhältnis ohne Dublette · **TRN-003** Rolle Trainingsbetreuung zuweisbar, Bereichsliste für ein solches Konto; „kein Durchgriff" in **beide** Richtungen als Negativfall | LEI-EPIC-001 |
| ~~**TRN-EPIC-002**~~ | **gebaut 2026-09-30** — Ein Trainingstermin steht im selben Kalender, und die Betreuung sieht nur ihn: Anlegen über `create_training_appointment`, Verschieben und Absagen über die vorhandenen Wege, Kontextriegel beim Schreiben in beide Richtungen, Vereinbarungen anlegen und abschließen, Kalender und Tagesliste für die Trainingsbetreuung; ANN-176 bis ANN-180; Sichtung Training Schritte 4 bis 6 | **TRN-004** Anlegen, Verschieben, Absagen im Kontext `training` über die vorhandenen Schreibwege (ADR-022 Punkte 1, 9, 10) · **TRN-005** Trainingsgrundlage bedienbar, Einzelstunde ohne Klammer bleibt möglich (Punkt 5) · **TRN-006** Kalender, Tagesliste und Suche je Kontext gefiltert; die Belegung sagt „belegt" und nichts darüber hinaus (Punkt 11), als Negativfall in `pnpm test:db` | TRN-EPIC-001 |
| ~~**TRN-EPIC-003**~~ | **gebaut 2026-09-30** — Eine Trainingsleistung landet als Rechnung im eigenen Nummernkreis: Leistung aus dem durchgeführten Trainingstermin am Trainingsverhältnis (ANN-181), Rechnung im Kreis `TR` an die Kund:in selbst mit Anschrift aus dem Training (ANN-182), Belegfrist hält im Löschlauf nur die Belege (ANN-183); § 14c-Riegel, Befreiungsgrund, Sammelrechnung und Auswertung unverändert, am Training belegt; Sichtung Training Schritte 7 bis 9 | **TRN-007** Leistung am Trainingsverhältnis statt an `patients` (ADR-021 Punkt 5) · **TRN-008** zweite, nullbare Verknüpfung an `invoices` für `training`; § 14c-Riegel, Befreiungsgrund, Nummernkreis je Bereich, Sammelrechnung (ANN-077) und Auswertung bleiben unverändert | TRN-EPIC-001; ABR-EPIC-004 bis 006 |
| ~~**TRN-EPIC-004**~~ | **gebaut 2026-09-30** — Was in einer Einheit passiert ist, steht als Protokoll in der Anwendung, nicht als Befund: Trainingsprotokoll am Trainingstermin als Fachdatum des Verhältnisses (eigene Tabelle, Datenklasse des Verhältnisses), nur owner und Trainingsbetreuung (ANN-184), unveränderlich nach dem Abschluss (ANN-185), der Abschluss setzt `documented`; Abschließen und Wiederöffnen am Trainingstermin (ANN-186); Einheiten bei der Kund:in; Sichtung Training Schritte 10 bis 12 | **TRN-009** Trainingsprotokoll als Fachdatum des Verhältnisses mit eigener Datenklasse und Frist, **kein** Eintrag nach ADR-016, keine klinische Bewertung (ADR-006 Punkte 9 und 11) · **TRN-010** `documented` am Trainingstermin erreichbar (ADR-018 Punkt 3, gelesen nach ADR-022 Punkt 8) | TRN-EPIC-002 |

**TRN-EPIC-003 setzt `documented` nicht voraus:** § 19 bindet die Fakturierung
an die finalisierte **Behandlungs**dokumentation und trägt für `training`
nicht. Den Gebührenanlass im Dienstvertrag über Training (ADR-018 Punkt 8)
trägt bis zur Antwort eine Annahme.

#### Die fünfzehn Navigationspunkte, einzeln zugeordnet

Die Leiste der fremden Coaching-Software ([`../product/ideen/referenz-navigation.md`](../product/ideen/referenz-navigation.md);
Jannes hat sie am 2026-09-22 erneut geteilt und zum Umfang erklärt).
Übernommen werden Umfang und Ablauf, nie Text, Symbol oder Gestaltung. Die
Leiste ist die **Ansicht der Trainingskund:innen** (§4.10, Jannes
2026-09-23); die Ansichten für Patient:innen und Betreuung entwirft DSN-001.

| # | Bereich | Was daraus bei uns wird | Wo im Plan |
| - | ------- | ----------------------- | ---------- |
| 1 | Übersicht | was zu tun ist, nicht wie es läuft (`IDEA-ORG-001`) | TRN-EPIC-001 (Betreuung), ORG-EPIC-001, Kund:innensicht POR-EPIC-002 |
| 2 | Kalender | Termine im **einen** Kalender (ADR-022 Punkt 1) | TRN-EPIC-002; eigene Sicht POR-EPIC-002 |
| 3 | Sessions | absolvierte Einheiten = Trainingsprotokoll, **kein** Zähler, der Termine und Einheiten mischt (`IDEA-ORG-002`) | TRN-EPIC-004; Durchführungsansicht UEB-EPIC-003 |
| 4 | Check-ins | Selbstauskunft mit Takt (`IDEA-TRK-004`) | TRK-EPIC-001 |
| 5 | Fortschritt | Verlauf mit Ereignissen (`IDEA-OUT-005`) | OUT-EPIC-001; **Verbot 2** — Kurve ja, Ampel nein |
| 6 | Trainingspläne | Zusammenstellen, Zuweisen, Schnappschuss (`IDEA-TRN-011`) | UEB-EPIC-001 bis 003; **Verbot 1** |
| 7 | Übungsanalyse | Ausführung, Schmerz, Auslassung je Übung (`IDEA-OUT-006`) | anzeigend in OUT-EPIC-001; ableitend „Nicht in V1" (`src/app/mdr.ts`) |
| 8 | Aktivitäten | Alltagsbewegung als Kontext (`IDEA-ALT-001`) | ALT-EPIC-001 |
| 9 | Assessments | Tests zu definierten Zeitpunkten (`IDEA-OUT-007`) | FRB-EPIC-001/002 (Behandlung), OUT-EPIC-001 (Training); **Verbot 3** |
| 10 | Athletenprofil | Stammdaten und Ziele; heißt bei uns nicht so | TRN-EPIC-001; Voraussetzungsprofil KND-EPIC-001 |
| 11 | Gewohnheiten | sehr kleine Ziele, keine Serie als Druckmittel (`IDEA-ALT-002`) | ALT-EPIC-001 |
| 12 | Ernährung | Protokoll und Zielwert, kein Urteil (`IDEA-ALT-005`, `-006`) | ALT-EPIC-002 (B9 Punkt 6 neu entschieden 2026-09-22) |
| 13 | Chat | strukturierte Rückfrage mit Notfallabgrenzung (`IDEA-KOM-001`, `-002`) | KOM-EPIC-001 |
| 14 | Einstellungen | Konfiguration je Kund:in, Coach-Kontrolle sichtbar (`IDEA-QSN-005`, `IDEA-LZK-005`) | POR-EPIC-003 |
| 15 | KI-Analyse | abgesetzter Knopf (`IDEA-KI-006`) | als Einschätzung „Nicht in V1" (`src/app/mdr.ts`); Zusammenfassung ohne Bewertung in KI-EPIC-002 |

### Block 4 — Etappe 4: Plattformzugang

Die Plattform nach §4.6 (Patient:innen) und §4.10 (Kund:innen). **Konto und
Akte sind getrennt**; wer beide Verhältnisse hat, sieht beide Bereiche
getrennt (§4.8). Vor dem ersten Loop stehen zwei Docs-Sessions. **DSN-001**
entwirft die Ansichten für Patient:innen (beide Stufen aus §4.6) und für die
Betreuung — [`PLATTFORM-ANSICHTEN.md`](PLATTFORM-ANSICHTEN.md), sieben
Festlegungen D1 bis D7, von Jannes am 2026-09-30 wie empfohlen bestätigt; die
Ansicht der Trainingskund:innen steht mit §4.10 und bekommt dort nur ihren Platz im selben Gerüst. **ADR-023**: Konten
externer Personen neben den Praxisrollen, Einladung und Zustellweg (R8),
Identitätsprüfung und Vertretung (B5 als Annahme, reversibel an einer Stelle),
Sitzungsregeln, RLS-Muster „nur eigene Daten", Abgrenzung zur Praxisoberfläche —
[`ADR-023-platform-access.md`](../adr/ADR-023-platform-access.md), am 2026-09-30
angenommen, W1 bis W6 wie empfohlen. Nach W6 steht die Vertretung als eigener
Loop **POR-EPIC-001b** zwischen -001 und -002.

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **POR-EPIC-001** | Eine Patientin oder Kund:in hat einen eigenen Zugang, der nur ihre Daten zeigt | Konto zu Person, Einladung aus der Akte bzw. dem Trainingsverhältnis, Anmeldung, Sperren und Entziehen ohne Wirkung auf die Akte; Negativfall „fremde Person" für jede Sicht | `IDEA-LZK-001` |
| **POR-EPIC-001b** | Angehörige, Betreuung und Sorgeberechtigte handeln mit eigenem Konto für eine Person | Vertretung als eigener Zugang (ADR-023 Punkte 13 bis 15): rechtliche Vertretung und Begleitung, Nachweisvermerk, „Sie handeln für …", Auditeinträge unterscheidbar, Begleitung durch die Person selbst beendbar, unter 18 nur Sorgeberechtigte; Negativfälle je Art | B5, ADR-023 W3, W6 |
| ~~**ABN-EPIC-001**~~ (gebaut 2026-10-02) | Was die Abnahme der Annahmen (2026-10-02) in den Blöcken 2, 3, 4 und 9 anders entschieden hat, ist gebaut | Block 2: BEF-092 (Hinweis auf künftige Hausbesuche mit alter Adresse), BEF-093 („Mitgeteilt“ verfällt nur bei relevanten Änderungen), BEF-094 (kurzfristige Verlegung durch die Patient:in, Gebührenverzicht; ADR-018 Fassung 4), BEF-095 (ein zentrales Leserecht für Dokumentation); Block 3: BEF-096 (Kontingent zählt Behandlungstermine), BEF-097 (Leistungen ziehen bei einer Übertragung mit), BEF-098 (klinischer Ort für Hinweise aus der Verordnung); Block 4: BEF-100 (Steuernummer oder USt-IdNr., Storno mit Zahlung, Teilzahlungen kumulativ); Block 9: BEF-115 (Kontolöschung über die Admin-API), BEF-116 (Umfang der Begleitung), BEF-117 (eine Altersberechnung), BEF-118 (Wiederherstellung nur nach bestätigtem Postfach), BEF-119 (Vertretung nur für nachgewiesene Bereiche). Zuschnitt in der Session vom 2026-10-02, von Jannes freigegeben | Abnahme, `ASSUMPTIONS.md` |
| ~~**ABN-EPIC-001b**~~ (gebaut 2026-10-02) | Was die Abnahme in den Blöcken 5 bis 8 anders entschieden hat, ist gebaut — ohne BEF-105, -106, -109 (ABN-EPIC-001c) | Block 5: BEF-101 (Erhebungen serverseitig gegen die Definition, Korrektur, Tegner, Versionen), BEF-102 (Verlaufsereignis nachvollziehbar entfernen), BEF-103 (Bausteine: keine unbestätigten Vorschläge im Entwurf, Seitenwechsel, Ergebnis ausgeschrieben, Tippfehler), BEF-104 (Berichtskorrektur mit Kette, Grenze sichtbar); Block 6: BEF-105 (Dateityp am Inhalt, Prüfsumme, Metadaten serverseitig, Farbe), BEF-106 (Dokumentationsfotos zur Akte; neue Fassung ADR-017), BEF-107 (Art. 15 mit Zugriffen und Fotos), BEF-108 (Warteliste prüfen, Nachweis des Zusammenführens, alle Legal-Hold-Gründe); Block 7: BEF-109 (Kartendienst: `synthetic` nie in Produktion, Kacheln in der Anbieterprüfung, eindeutige Treffer, Ersatzschätzungen kennzeichnen), BEF-110 (Abstecher-Entwurf nicht still löschen, MDR-Freigabe mit Nachweis); Block 8: BEF-111 (Trainingskontakt mit getrennter Hausnummer, Rechnung nur mit vollständiger Anschrift), BEF-112 (anonyme Belegt-Blöcke für die Trainingsbetreuung), BEF-113 (Büro liest Trainingsprotokolle, Nachtrag, Verwerfen mit Hinweis und Löschjournal) | Abnahme, `ASSUMPTIONS.md` |
| ~~**ABN-EPIC-001c**~~ (gebaut 2026-10-02) | Dateityp, Prüfsumme und Metadaten serverseitig, Dokumentationsfotos zur Akte, Kartendienst-Gate in Produktion | BEF-105 (Edge Function `patient-file-verify`, Spalten „verifiziert“, sRGB im Client), BEF-106 (Dokumentart `dokumentationsfoto` in der Aktenklasse, Wahl vor der Aufnahme), BEF-109 (`APP_ENVIRONMENT` im Gate, eindeutige Treffer, Ersatzschätzungen als „Fahrzeit nicht verfügbar“). **Vorher eine Docs-Session:** neue Fassung ADR-017 (drei Fotoarten, Rechtsgrundlage und Frist je Art) und ADR-019 (Kartenkacheln im Gate), beide von Jannes zu entscheiden — *Erledigt 2026-10-02: ADR-017 Fassung 3 und ADR-019 Fassung 5 angenommen (alle Fragen wie empfohlen), §5 mit Prinzipien 0.20 nachgezogen, Gate-Liste um Punkte 10 und 11 ergänzt.* Edge Functions bauen ja, scharf erst mit OPS-001. Aus ABN-EPIC-001b ausgegliedert (Zuschnitt 2026-10-02, Freigabe Jannes) | Abnahme, `BEFUNDE-LOESUNGEN.md` |
| ~~**ABN-EPIC-002**~~ (gebaut 2026-10-09, ohne BEF-138) | Was die Abnahme der Annahmen vom 2026-10-09 (ANN-073 bis ANN-307) anders entschieden hat, ist gebaut | **Zuerst die Dokumente**, nach Jannes' Entscheidung vom 2026-10-09: `PROJECT_PRINCIPLES.md` §4.3 und ADR-021 Punkt 10 (BEF-137), ADR-017 (BEF-135; Punkt 54 für BEF-133), ADR-010 und ADR-023 Punkt 24 (BEF-138). Dann: BEF-137 (das Büro liest alles, auch im Training – Profil, Bibliothek, Trainingspläne –, schreibt nichts Fachliches, jeder Lesezugriff protokolliert, scharf erst nach B2), BEF-134 (Hinweis aus der Verordnung: alle Praxisrollen außer der reinen Trainingsbetreuung), BEF-135 (Fotos aus der Dokumentation ohne Rückfrage, Erinnerung an Anmeldebogen und Rezept, keine Arbeitshilfe), BEF-136 (Lückenfinder auch für 45 Minuten, 60 bevorzugt), BEF-133 (PDF in der Anwendung). BEF-138 (Abruf über die Plattform ohne Protokoll) als eigener Pull Request, weil er das Label `freigabe-audit` braucht | Abnahme, `ASSUMPTIONS.md`, `BEFUNDE.md` |
| **ABR-EPIC-007** | Je Behandlungstermin entsteht einmal das vereinbarte Terminhonorar | ADR-009 Fassung 4 Punkt 22, BEF-099: Tarif und patientenbezogene Honorarvereinbarung versioniert (Vereinbarung vor Tarif, Leistungstag), Honorar getrennt von verordneten und erbrachten Heilmitteln, Heilmittelmengen ohne Preis fortgeschrieben, Bestand an Katalog und Rechnungen erhalten, Rechnungsdarstellung austauschbar bis B17; ein Test über Terminzahl, Heilmittelmenge und Betrag. Dazu BEF-114: Paketpreise im Training (drei oder sechs Monate, ADR-009 Punkt 21), Forderung aus der Paketvereinbarung, Termine im Paket ohne eigene Forderung; Preis, Umfang und Zahlungsweise legt Jannes vorher fest | Abnahme Block 4 |
| **POR-EPIC-002** | Die eigene Sicht zeigt Termine, Rechnungen und freigegebene Dokumente | Termine mit Anfrage und Änderungswunsch — **ein Wunsch, den das Büro bestätigt** (§8) —, Befundbogen vorab ausfüllen, eigene Rechnungen, freigegebene Dokumente (ADR-017), Übersicht „was zu tun ist" | §4.6, §4.10, `IDEA-ORG-001` |
| **POR-EPIC-003** | Einwilligungen, Export und Einstellungen liegen in der eigenen Hand | Einwilligung erteilen und widerrufen (auf PAT-006), Datenexport als Funktion, Onboarding mit Überspringen, Einstellungen mit sichtbarer Coach-Kontrolle, Oberfläche für 78-Jährige | `IDEA-QSN-003`, `IDEA-LZK-005`, `IDEA-QSN-005`, `-006` |

### Block 5 — Etappe 8: Angebote und Kund:innen

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **ANG-EPIC-001** | Nach der Behandlung geht es mit dem Nachsorge-Abo weiter | Nachsorge-Abo nach §4.6 und ADR-009 Punkt 21: Beginn frühestens mit dem Ende der Behandlungsgrundlage, monatlich kündbar mit Kündigungsknopf, Monatsrechnung im Bereich `therapy` (kein Zahlungsdienst); Zugang zu den Abo-Bereichen folgt dem Abo-Status; nach Kündigung 30 Tage lesend und Plan als PDF; Steuerkennzeichen als Annahme (B4) | Jannes 2026-09-22 und 2026-09-23 (E-4) |
| **ANG-EPIC-002** | Training wird als Paket verkauft, und die Plattform ist darin enthalten | Paket **nach Zeitraum, nicht pausierbar** (§4.10), Preise sichtbar bevor jemand fragt, Rückfall in die Heilbehandlung während eines Pakets | `IDEA-ANG-001`, `-003`, `-004` (B11 neu entschieden 2026-09-22) |
| **KND-EPIC-001** | Die Betreuung geht nach der Behandlung weiter, ohne dass Daten still mitwandern | Übergang nach §4.10 (E-3): Erinnerung an das Abschlussgespräch in den letzten Terminen, Trainingsvertrag per Link im eigenen Konto mit Widerrufsbelehrung und Einwilligung, Übernahme nur freigegebener Angaben als dokumentierte Kopie (ADR-021 Punkt 7); Betreuungsepisode mit Typ, Voraussetzungsprofil, Offboarding | `IDEA-LZK-002`, `-003`, `-004`, `-006` |

### Block 6 — Etappe 3 und Etappe 6: Pläne und Rückfragen

**Keine automatische Anpassung**, keine Progression als Vorschlag — erfassen,
speichern, strukturieren, darstellen (ADR-006 Punkt 2, §17 Verbot 1).
Vor KOM-EPIC-003 steht **ADR-024** (Docs-Session): Offline-Erfassung und
Benachrichtigungen brauchen einen Service Worker; ADR-015 Punkt 16 schließt
ihn bisher aus und wird dort abgelöst, nicht umgangen. ADR-024 beantwortet
dabei auch, ob die begrenzte Offline-Fähigkeit für Therapeut:innen aus
ADR-001 Punkt 3 (Tagesplan, Entwürfe) in V1 kommt. Web-Push läuft über die
Push-Dienste der Browserhersteller — ein Datenweg, den ADR-024 nach ADR-002
bewertet.

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **UEB-EPIC-001** | Es gibt eine Übungsbibliothek, die für Therapie und Training trägt | Übung und Variante getrennt, Achsen und Nachbarschaften, zwei Sprachebenen | `IDEA-TRN-005`, `IDEA-QSN-002`, `-007` |
| **UEB-EPIC-002** | Ein Plan wird zusammengestellt, zugewiesen und eingefroren | Plan mit Schnappschuss bei Zuweisung, Progression **von Hand** mehrdimensional und als doppelte Progression, Planlaufzeit mit Wiedervorlage; für `therapy` und `training` getrennt | `IDEA-TRN-004`, `-007`, `-011`, `IDEA-ORG-006` |
| **UEB-EPIC-003** | Der Plan ist dort, wo trainiert wird | Plan als PDF (voller Nutzen ohne Portal), Plan im Portal — der Heimübungsplan während der Behandlung ohne Abo (§4.6) —, Durchführungsansicht für die Einheit, Trainingstage im Kalender | `IDEA-ORG-003`, `-004` |
| **KOM-EPIC-001** | Eine Frage kommt strukturiert an und landet, wo sie hingehört | Strukturierte Rückfrage statt offenem Chat, Zusage einer Antwortzeit und Notfallabgrenzung, klinisch Relevantes in die Akte | `IDEA-KOM-001`, `-002`, `-007` |
| **KOM-EPIC-002** | Ein Foto oder Video hilft bei der Antwort, ohne liegen zu bleiben | Anhänge als eigene Datenklasse mit kurzer Frist und Metadatenentfernung (ADR-017), Antwort mit Zeitmarke im Video, **kein** Bewegungsurteil | `IDEA-KOM-003`, `-004`, `-005` |
| **KOM-EPIC-003** | Wer etwas tun soll, erfährt es — nach Regeln | Benachrichtigungen mit Regeln (ADR-024), automatische Terminerinnerung und Online-Terminanfrage (B15 neu entschieden 2026-09-22), E-Mail vor SMS, Messenger ausgeschlossen; Versand hinter Adapter (Grundsatz 5) | `IDEA-KOM-006`, B15 |

### Block 7 — Etappe 5 und 7: Verlauf und Alltag

Erfassen und darstellen, **nicht** auswerten (§17 Verbot 2). Gesundheitsangaben
im Training brauchen die Einwilligung (Art. 9 Abs. 2 lit. a) — als Funktion
aus POR-EPIC-003, als Rechtsfrage bei B2.

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **TRK-EPIC-001** | Kund:innen protokollieren Einheiten und beantworten Check-ins | Einheit protokollieren, Check-in mit einstellbarem Takt, wenige Fragen, Parameter nach Erfassungstakt | `IDEA-TRK-001`, `-002`, `-004` |
| **TRK-EPIC-002** | Was erfasst wird, ist als Zeitreihe lesbar | Schmerz differenziert, Bewegungssicherheit neben Schmerz, Kontext mit erfasst | `IDEA-TRK-003`, `-005`, `-006` |
| **TRK-EPIC-003** | Erfassen geht auch ohne Netz | Offline-Erfassung im Training nach ADR-024 | `IDEA-TRK-008` |
| **OUT-EPIC-001** | Fortschritt ist sichtbar, ohne bewertet zu werden | Verlaufsgrafiken mit Ereignissen, Assessments mit Protokoll und Wiedervorlage auf der Trainingsseite, anzeigende Übungsanalyse, Fortschritt in zwei Sprachen | `IDEA-OUT-005` bis `-008` |
| **ALT-EPIC-001** | Alltag steht als Kontext daneben | Aktivitäten ohne Wettbewerb, Gewohnheiten mit sehr kleinen Zielen, Schlaf und Stress, Bedarfsmedikation als Verlaufsgröße, kein Vergleich zwischen Personen | `IDEA-ALT-001` bis `-004`, `-007` |
| **ALT-EPIC-002** | Ernährung als Protokoll und Zielwert | Tagesprotokoll, Zielwert von der Betreuung gesetzt, **kein** Urteil; je Person ab- und zuschaltbar, weil Kalorienzählen nicht für alle harmlos ist | `IDEA-ALT-005`, `-006` |
| **ORG-EPIC-001** | Eine Person auf einen Blick, und die Sitzung ist vorbereitet | Zeitstrahl über alle Bereiche, Sitzungsvorbereitung für die Praxis, Übersicht je Person | `IDEA-QSN-001`, `IDEA-ORG-001`, `-005` |

### Block 8 — Spur A2: Praxisbetrieb

Ersetzt die Vorschaubereiche aus [`ARBEITSBEREICHE.md`](ARBEITSBEREICHE.md)
Abschnitt 2 — ersetzt, nicht daneben gebaut. Beschäftigtendaten ohne
Leistungskontrolle (§20, B6).

| Loop | Ergebnis | Ersetzt Vorschau | Voraussetzung |
| --- | --- | --- | --- |
| **FLT-EPIC-001** | Räder sind eine Planungsressource: Depot, Schlüssel, Check-Up, Pannenassistent; **Schäden am 3D-Rad markieren** in Check-Up und Panne, Seite „Stellen am Rad", PDF für die Werkstatt | `/betrieb/flotte…` | Tübinger Standortvorlage (Jannes); Rad im Kalender; Entwurf, Entscheidungen und AC aus dem [Handoff Lastenrad 3D](../design/handoff-2026-10-08-lastenrad-3d.md), Abschnitte 0 und 8 (`IDEA-PRX-057`, Jannes 2026-10-08) |
| **TEAM-001** | Das Team spricht in der Anwendung: Kanäle, Direktnachrichten, Threads, Erwähnungen | `/team` | Nachrichtenmechanik aus KOM-EPIC-001; Speicherfrist als Annahme (ANN-001); Anhänge nach ADR-017 |
| **URL-001** | Urlaub mit Antrag und Genehmigung wirkt auf Kalender und Kapazität | `/betrieb/urlaub` | Beschäftigtenangaben (`IDEA-QSN-010`) als Teil des Loops |
| **ZK-001** | Zeitkonto mit Buchungen und Saldo je Person, ohne Auswertung über Beschäftigte | `/betrieb/zeitkonto` | B6 |
| **ERS-001** | Erstattungen von eingereicht bis ausgezahlt, Belege als Dateien | `/betrieb/erstattungen` | ADR-017; Belegfristen als Annahme (B4) |

### Block 9 — Etappe 10 und Komfort

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **KI-EPIC-001** | Diktieren statt tippen, mit geprüftem Entwurf | Gateway nach ADR-005 mit `mock`-Adapter, Sprachdokumentation nach §6.3 mit Weg ohne Sprechen (§5), Nutzung sichtbar; Anbieter C6 in Block 11 | `IDEA-KI-001`, `-005`, `-007` |
| **KI-EPIC-002** | Sprache umformen, ohne Inhalt hinzuzufügen | Freitext strukturieren, Patientensprache, Antwortentwürfe, Zusammenfassung ohne Bewertung, **Felder der Verordnung aus dem Foto vorschlagen** — jeweils mit Quellenbindung und menschlicher Freigabe | `IDEA-KI-002`, `-003`, `-004` |
| **MAP-007** | Führung auf dem Gerät, ohne dass die Praxis die Position erfährt | Zuschnitt in [`MAP-LOOPS.md`](MAP-LOOPS.md); zuerst **E-24** (liefern die Radprofile Manöver? — ein Aufruf; ohne Ja entfällt das Epic) | `IDEA-PRX-044`, §20.1 |
| **PRX-EPIC-004** | Komfort für die Praxisführung | Kennzahlen für Training, Abo und Pakete nachziehen (auf STA-EPIC-001), Export für die Steuerberatung (Format als Annahme bis B4), Farbcodierung je Terminart und Person, Kalender-Abo (Bedenken: ohne Namen), Planungskarte der aktiven Adressen (Bedenken), Kartenzahlung beim Hausbesuch hinter Adapter (Grundsatz 5) | `IDEA-PRX-026`, `-021`, `-024`, `-033`, `-022` |
| **UI-003** | Feinschliff und Barrierefreiheit über alle Seiten (G17) | Feindesign, PWA-Manifest, Befunde aus den Ablaufrunden nach `OPTIMIERUNG.md` | — |

### Blöcke 10 bis 14 — vom Freeze bis zur Eröffnung

**Etappe G — Betriebsreife.** Die offenen Pakete, ohne Termine:

| # | Paket | Stand und Inhalt | Wer |
| --- | --- | --- | --- |
| G3 | OPS-001 Providerprüfung und Cloudprojekt | Dokument steht seit 2026-09-21, **nichts bestanden**. Ab Anfang 2027 (E-1): Unterlagen aus Teil 9, zwei Supportfragen, Gate-Punkte 1 bis 6 mit B2; **dann** Cloudprojekt in EU-Region, Dev/Test/Prod, PITR als Bedingung | Jannes (Anlage) |
| G5 | OPS-002 Deployment und Freigabe | Frontend-Hosting mit Prüfung nach ADR-002, Release aus Tag, Migrationen nur über die Pipeline, Rollback, Review-Checkliste aus ADR-013 in der Pipeline; die **Test-Umgebung** ist als OPS-002a nach Block 1a vorgezogen | Claude, Jannes (Freigabe) |
| G6 | OPS-004 Rest | Alarmierung, Security-Log 12 Monate, Erkennung für Art. 33, Audit-Abfrage als Runbook — setzen G3 voraus | Claude |
| G7 | OPS-003 Backup und Restore | PITR, Sicherung des Objektspeichers (eigener Weg, RPO ≤ 1 h), dreistufige Wiederherstellung, Notfallzugang, Betriebsdokumentation mit 13 Positionen | Jannes und Claude |
| G10 | E2 Ausfallkonzept | Praxisprozess für einen Tag ohne Anwendung (ADR-012 Punkt 8), eine Seite; die Tagesliste der Übersicht ist die Bereitstellung (ANN-021 Fassung 2). Zugleich Rückfallplan H4 | Jannes |
| G11 | OPS-007 Bootstrap | Runbook und Funktion gebaut, lokal geprobt; Probe gegen die Test-Umgebung nach G5 | Jannes (Durchlauf) |
| G12 | ADR-019 Gate | Vertragscheck PTV Developer (Punkt 9), Paid Plan und Server-Schlüssel, DSFA-Wiedervorlage | Jannes mit B2 |
| G13 | Steuerliche Grundeinstellungen | Umsatzsteuer-Status, Wortlaut des Befreiungshinweises, Kürzel `RG`/`TR`, ermäßigter Satz, Steuer auf Abo und Pakete, echte Preise — bis dahin Annahmen (ANN-074/075/082) | Jannes mit B4 |
| G14 | DSFA-Paket | Schwellwertprüfung, VVT, TOM mit Endgeräte-Richtlinie, Löschkonzept, Subprozessoren, Datenschutzinformationen, Betroffenenrechte, Breach-Prozess, Nachweistabelle MUSS → Test, Zweckbestimmung — **fertig bis Ende 2026**, verschickt ab Anfang 2027 (E-1), Nachträge für später Gebautes | Claude (Entwurf), Jannes, B2 |
| G15 | B1 Regulatorische Prüfung | Zweckbestimmung, MDR-Abgrenzung, EU AI Act — über den **ganzen** V1-Umfang | Jannes, extern |
| G16 | BETRIEB-001 | Störungsmeldung, Triage, Hotfix-Weg, Release-Takt nach M4, Change-Freeze um M5, Endgeräte, Vertretung | Jannes mit Claude |
| G20 | **SEC-EPIC-001 Sitzungssperre** ([ADR-025](../adr/ADR-025-session-lock.md)) | Erneute Freigabe spätestens 60 Minuten nach Anmeldung oder Freigabe, Inaktivitätssperre (Vorschlag 30 Minuten, W1), Prüfung der Fristen bei jeder Rückkehr vor dem ersten Zeichnen, Durchsetzung in der Datenbank an `app.current_organization_id()` und `app.platform_readable_access` mit Test über alle Tabellen, Freigabe per Passkey hinter Schalter (Beta, W3) mit Kennwort als Rückweg, offene Dokumentation als Entwurf gesichert, Zielwert für `jwt_expiry` (ANN-044). Abmelden bleibt wie es ist (ANN-044, ANN-045). Kritische Änderung mit Zweitreview; gebaut wird lokal, die Einstellungen des Anmeldedienstes kommen mit G3 | Claude, Jannes (W1 bis W3) |
| G21 | **STAFF-005 Einladung ganz aus der Anwendung** | Neue Mitarbeitende werden aus der Anwendung eingeladen, ohne ein Konto auf der Oberfläche des Anmeldedienstes anzulegen (Jannes, 2026-10-02, zu ANN-025): Zugangsdienst wie bei der Plattform (ADR-023 Punkt 9), Einladung vor Ort per QR oder per Mail (B13); löst ANN-025 ab | Claude |
| G18 | Go-live-Gate (M3) | Kriterien siehe Meilensteine | Jannes |

**Etappe H — Eröffnung.** H1 **Probewoche 1** (Block 10, auf der Test-Umgebung
am Telefon, eine Praxiswoche aus dem Seed, eine zweite Person) · H2
Kurzanleitung „erster Tag", Schulung je Rolle · H3 Produktionssystem (M4) ·
H4 **Rückfallplan**: Tagesliste morgens öffnen (ANN-021 Fassung 2),
Papierdokumentation mit Nachtrag binnen 24 h, **Rechnungen ruhen** (keine
handschriftliche Nummer, eine Nummernlücke nach §14 UStG ist nicht heilbar),
Abbruchkriterien, Export nach G9 · H5 **Probewoche 2** auf der Test-Umgebung
mit dem Eröffnungsstand · H6 Eröffnung (M5) mit Change-Freeze, Restore-Test 3,
Störfallliste ab Tag 1 · H7 erster Betriebsmonat (M6).

---

## Entscheidungen und Prüfungen

### Externe Prüfungen — ab Anfang 2027, parallel zum Bauen

Gehen ab Anfang 2027 hinaus, sobald ihre Unterlagen stehen (E-1); was danach
noch gebaut wird, folgt als Nachtrag. Bis zur Antwort trägt jeweils die
genannte Festlegung. Wortlaut der Anfragen: [`../decisions/ANFRAGEN.md`](../decisions/ANFRAGEN.md).

| Punkt | Gegenstand | Wer | Bis dahin trägt |
| --- | --- | --- | --- |
| OPS-001 | Supabase: zwölf Gate-Punkte, Objektspeicher, Edge Runtime | Jannes, Support | [`providerpruefung-supabase.md`](../decisions/providerpruefung-supabase.md) |
| B2 | DSFA-Schwellwert, DSB, DSFA über den ganzen Umfang; E15, Einwilligung im Training, Office-Sicht (§4.8), Screening-Frist, Handoff und Führung (ADR-019 Punkt 23, §20.1), Plattform, Ernährung, Fotos von Patient:innen, Zweckbindung der Erinnerung an das Abschlussgespräch (§4.10) | externe Datenschutzberatung | vorläufige Festlegungen und Register |
| B1 | Zweckbestimmung, MDR-Abgrenzung, EU AI Act; B10 mit | externe Prüfstelle | ADR-006, §17, Register `src/app/mdr.ts` |
| B4 | Steuer: Leistungsarten, § 19 UStG, Nummernkreise, ermäßigter Satz, Nachsorge-Abo, Pakete nach Zeitraum, E14 Fall 1, Belegfristen, Gewinnermittlung (B9, ANN-088) | Steuerberatung | ANN-074/075/082/088 |
| B3 | Validierung der Fristen (ANN-001) | im DSFA-Prozess | ANN-001 |
| B5 | Identität und Vertretung im Portal | Jannes, ggf. Beratung | ADR-023 |
| B8 | schriftlicher Lizenzbeleg | Lizenzgeber | Jannes' Bestätigung vom 2026-09-21 |
| B9 | Ernährung berufsrechtlich, Betreuung ohne Heilbehandlung | Beratung | B9 in `OPEN_DECISIONS.md` |
| Anbieter | PTV (Gate ADR-019), SMTP (B13, BEF-026), SMS (B15), KI (C6, ADR-005), Zahlungsdienst (falls Kartenzahlung), Frontend-Hosting (G5) | Jannes mit Claude-Dokument | `mock`-Adapter (Grundsatz 5) |

### Bei Jannes — hält kein Bauen auf

- **R14 alt / Logfrist:** (a) ADR-011 Punkt 4 auf das senken, was die
  Plattform hält, oder (b) Ausleitungsweg als zweiter Auftragsverarbeiter.
  Empfehlung: nach G3 entscheiden. Gebraucht vor echten Daten.
- **B13 / BEF-026:** eigener SMTP-Anbieter oder kein Mailversand. Mit der
  Plattform ist „kein Mailversand" praktisch vom Tisch — Empfehlung: SMTP-Anbieter
  in Block 11 prüfen. STAFF-004 ruht bis dahin.
- **Sichtung** nach Regel 1: vier Dateien in [`../sichtung/`](../sichtung/README.md),
  darunter der Kartendienst mit MAP-005 Teil B am Telefon (Wegpunktlimit,
  `MAX_ZWISCHENZIELE` bleibt bis dahin bei drei).
- **Begriffe sammeln**, die in der Anwendung stören (Stichworte oder
  Bildschirmfotos) — Grundlage für UX-EPIC-002.
- **D2/D3** aus dem FRB-Plan: gelten wie vorgeschlagen (ANN-118, ANN-119);
  die drei Lücken der MT-Vorlage und Korrekturen jederzeit nachliefern.
- **Material für FRB-EPIC-005:** Bilder zu den Tests (NRS und
  Veränderungsfrage für FRB-EPIC-004 freigegeben, PSFS gestrichen).
- **Preise** für Katalog, Abo und Pakete — vor Block 5 als synthetische Werte,
  echte vor M3.
- **Branch Protection:** `main` ist geschützt; ob Secret Scanning und Push
  Protection an sind, ist in den Einstellungen zu prüfen
  (`docs/DEVELOPMENT.md`, „Manuelle Schritte") — Kriterium von M3.

### Was neben der Reihenfolge festzuhalten ist

- **Das PTV-Free-Abo trägt nur den Prototyp** (Test und Integration, 500
  Transaktionen/Tag); der Betrieb braucht den Standard Plan und hängt am Gate
  aus ADR-019 Punkt 9. Der Server-Schlüssel ist ein lokales Secret bei Jannes.
- **Das Lastenradprofil ist gewählt** (2026-09-22) und hängt am Kommentar zu
  `TravelProfile` in `src/lib/location/contract.ts`.
- **Die Matrix-Schreibweise** ist nicht gegen die echte API geprüft
  (`api.myptv.com` aus der Cloud gesperrt) — Schritt 2 der Sichtung Kartendienst.
- **Vor der ersten echten Datei:** `tests/e2e/authenticated/patient-file-access.spec.ts`
  regelmäßig gegen die Test-Umgebung laufen lassen (ANN-052).
- **Kleine Wartung:** `supabase/config.toml` Abschnitt `[inbucket]` nach
  `[local_smtp]` umbenennen.

---

## Sessions starten

Die Reihenfolge ist verbindlich (E-15), einen Kalender gibt es nicht.

1. **Vorher:** `git pull --ff-only origin main`.
2. **Aufruf:** genau einer, als erste Nachricht; **ein Thema je Session.** Im
   Normalfall `/weiter` — er nimmt die erste Aufgabe aus
   [`../STATUS.md`](../STATUS.md), Code wie Dokumentation. Welchen Pfad ein
   Auftrag nimmt, sagt K1 in [`GRAPH-ENGINEERING-WORKFLOW.md`](GRAPH-ENGINEERING-WORKFLOW.md).
3. **Nachher:** den Bericht lesen, Fragen mit je einem Satz beantworten („wie
   empfohlen" reicht). Merge und Sichtung nach der „Definition of Done".

Antworten am besten mit Kennung (`B4: liegt vor, Ergebnis …`), Entscheidungen
als „entschieden: …".

| Zweck | Aufruf |
| --- | --- |
| **Nächste Aufgabe** | `/weiter` — oder `/weiter <Kennung>` für eine bestimmte |
| **Idee** | `/idee <Idee in zwei Sätzen>` — nur Ideenspeicher, nichts bauen |
| **Sichtung** | `/sichtung` — oder `/sichtung <Datei>` aus `docs/sichtung/` |
| Befund | `Befund: <Beobachtung, Bereich, Rolle>. In docs/development/BEFUNDE.md eintragen, nicht bauen.` |
| Antworten eintragen | `Docs-Session ohne Code: meine Antworten in docs/development/ROADMAP.md und docs/decisions/OPEN_DECISIONS.md einarbeiten. Antworten: …` |
| Sandbox | `/sandbox <Thema>` — Oberflächen-Prototyp (Pfad S); endet mit „übernehmen oder verwerfen" |
| Zweitreview | `Zweitreview <Loop-Kennung>: den Diff des offenen Pull Requests gegen die Review-Checkliste aus ADR-013 Punkt 9 lesen. Befunde als Einzel-Story-Loop vorschlagen, nichts bauen.` — Pflicht, sobald der Loop-Bericht A5 als ausstehend nennt |
| Ablaufrunde | `Ablaufrunde <Bereich> nach docs/development/OPTIMIERUNG.md` (ruht bis Probewoche 1) |
| Roadmap prüfen | `Planungssession ohne Code: Gesamtstand prüfen (git fetch, Branches, Pull Requests), docs/development/ROADMAP.md gegen den Stand nachstellen, nächsten Loop vorschlagen. Nichts bauen.` |

Docs-Sessions für ADRs und Providerprüfungen laufen über `/weiter`, sobald sie
in STATUS stehen; ihre Vorgabe ist die Zeile hier und die dort genannten ADRs.

---

## Definition of Done

**Je Story:** vertikaler Schnitt, Tests, Registereinträge (Skill-Schritt D),
Oberflächen-Checkliste abgehakt (`docs/sichtung/README.md`). **Je neue Tabelle zusätzlich:** Datenklasse und
Frist als `COMMENT`, Löschpfad in LOE-002, ein `test:db`-Fall, der die Löschung
dieser Klasse prüft. **Je Portalsicht zusätzlich:** Negativfall „fremde
Person" in `pnpm test:db`.

**Je Epic:** Checks nach Skill-Schritt H · `fortschritt.json` nachgestellt und
`pnpm fortschritt --schreiben` · `STATUS.md` nachgestellt · bei Oberfläche
Bildschirmfotos (Desktop und 375 px) in der Pull Request und höchstens drei
Schritte in der Sichtung des Blocks · **Jannes mergt nach grüner CI**; steht
ein Zweitreview (A5) aus, erst danach · ohne Oberfläche ist das Epic damit
gesichtet, mit Oberfläche in der Sichtung des Blocks (Regel 1) · Befunde nach
`BEFUNDE.md` und als erste Story in den nächsten Loop derselben Etappe.

**V1 fertig (M2):** alle Etappen der Blöcke 1 bis 9 gesichtet; jede Funktion
mit ungeprüftem Anbieter ist ohne ihn benutzbar oder abgeschaltet.

---

## Credit-Budget

**Sitzungszuschnitt**

1. **Ein Loop = eine Session.** Zuschnitt (Epic oder Einzel-Story) nach dem
   Feature-Loop-Skill; je Story ein Commit und die eng betroffenen Checks.
2. **Stories so schneiden, dass jeder Diff am Stück lesbar bleibt.** Die
   vollständige Testsuite läuft einmal am Ende des Epics.
3. **Neues Thema = neue Session.** Rückfragen zum laufenden Loop in derselben.
4. **Ein aktiver Feature-Branch.** Merge nach der „Definition of Done";
   gemergte Branches werden gelöscht.

**Leseverhalten**

5. **Eine Leseregel** (`.claude/skills/weiter/SKILL.md`): `STATUS.md`, die
   Zeile der Aufgabe in dieser Roadmap mit dem Absatz darüber, die benannten ADRs.
6. **Die im SPEC benannten ADRs vollständig** — mindestens alle, die der Loop
   berührt. Bei RLS, Löschung und Abrechnung sind das mehr als zwei.
7. **Höchstens eine Ideenspeicher-Datei** je Loop, nach dem Index in
   `IDEENSPEICHER.md` — die, auf die die Spalte „Quelle" zeigt.
8. **Keine Subagenten** außer bei echt breiter Suche und für den Zweitreview
   in frischem Kontext (ADR-013 Punkt 9, Nr. 8; Gate A5).

**Verifikation**

9. Während der Entwicklung nur die eng betroffenen Checks; die vollständige
   Runde **einmal** am Ende (Skill-Schritt H).
10. Keine identischen teuren Läufe ohne Änderung dazwischen.
11. `pnpm test:db` bei Migrationen und Policies — auch in der Cloudumgebung.
12. **Zweitreview** vor dem Merge nach ADR-013 Punkt 9, Nr. 8.

**Rhythmus**

13. **Ein Loop je Session ist das Maß.** Braucht ein Epic drei Sessions, war
    der Schnitt zu groß; passen drei in eine, war er zu klein.
14. Die Planungssession ist **absichtlich klein**.
15. **Planungsreview, wenn ein Block fertig ist:** Meilensteinstand,
    Prüfungsstand, Risiken, Reihenfolge des nächsten Blocks.

Das Modell steht projektweit in `.claude/settings.json`; wann eine Session mit
`/effort xhigh` startet, sagt `docs/development/SESSION-START.md`.

---

## Wochenupdate

Auftrag für eine Planungssession, von Hand gestartet (die Montagsroutine ist seit 2026-09-23 abgeschaltet). Sie **baut nichts.**

1. `docs/STATUS.md`, die Abschnitte „Die Kette bis zur Eröffnung" und
   „Meilensteine" dieser Datei, `ARBEITSBEREICHE.md` §2, die Ausgabe von
   `node scripts/fortschritt.mjs` (braucht kein `pnpm install`) und
   `git log --since='8 days ago' --oneline` lesen.
2. Feststellen, welche Loops seit dem letzten Update fertig **und gesichtet**
   wurden; offene Sichtungen zählen (Tabelle in `docs/sichtung/README.md`).
3. Die erste Aufgabe aus `STATUS.md` nennen und prüfen, ob sie zur Kette passt.
4. Prüfen, ob ein Meilenstein erreicht ist. **Termine gibt es nicht zu
   prüfen** — mit einer Ausnahme: R1, ob M2 rechtzeitig vor der Eröffnung in
   Sicht ist.
5. Antwort in festem Format, höchstens zwölf Zeilen: _was als Nächstes ansteht ·
   offene Sichtungen · Jannes entscheidet oder liefert · M1 bis M6 je erreicht
   oder offen, mit dem fehlenden Kriterium in einem Wort_.
6. Die Tabelle „Sandbox-Prototypen" in `ARBEITSBEREICHE.md` §2 lesen und
   abgelaufene Prototypen nennen (ab zwei fertigen Code-Loops seit „Angelegt").

Die abgeschaltete Routine beschreibt `docs/DEVELOPMENT.md`, „Wochenroutine".

---

## Fortschritt

**Einzige Quelle ist [`fortschritt.json`](fortschritt.json)** (Umbau U3). Ein
Loop stellt dort seinen Posten nach — `status`, `fertig_am`, `nachweis`, nach
einer Sichtung `gesichtet_am` — und erzeugt die Tabelle unten mit
`pnpm fortschritt --schreiben`; `pnpm docs:check` meldet jede Abweichung. Die
Tabelle nennt jeden Posten, der nicht mehr `offen` ist.

- **fertig** — gebaut, Skill-Schritt I durchlaufen; zählt `0,85`.
- **gesichtet** — mit Oberfläche in einer Sichtung nach
  [`../sichtung/`](../sichtung/README.md) durchgegangen; ohne Oberfläche gemergt
  mit grüner CI, `pnpm test:db` und Zweitreview (Regel 1); bei Entscheidungen
  und Prüfungen bestätigt. Zählt `1`.
- `vorläufig` und `entwurf` zählen `0,5`, `in Arbeit` `0,4`.

```bash
pnpm fortschritt            # eine Zahl bis M5, je Block
pnpm fortschritt --posten   # jeder einzelne Posten
```

Fünf Blöcke: **A** Kernprozess (20), **B** V1-Ausbau (32), **C** Betriebsreife
(18), **D** Eröffnung (12), **E** Entscheidungen und Prüfungen (18). Die
feinere Tabelle je Loop bis 2026-09-23 und die ausführlichen Vermerke bis 5.50
stehen in [`ROADMAP-CHRONIK.md`](ROADMAP-CHRONIK.md).

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
| B | UX-EPIC-002 Begriffe und Bedienprinzipien (Block 1a) | gesichtet | 2026-09-26 | `aafe0cd` … `ecc17b8` (UX-002a bis UX-002e, BEF-035 bis BEF-040); `ae65bc9` … `134ab23` (UX-002f bis UX-002h, BEF-033, BEF-034); `21f4866` … `ac8516f` (UX-002i bis UX-002l, BEF-041 bis BEF-044) | 2026-09-28 | Sichtung Kernprozess 2026-09-28 (Android und Windows) |
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
| B | PRX-EPIC-003 Nichts fällt durch | fertig | 2026-09-29 | PRX-010 bis PRX-016 | — | Sichtung: Praxisverwaltung Schritte 10 bis 12 |
| B | PRX-EPIC-003b Dubletten zusammenführen | fertig | 2026-09-29 | PRX-017, PRX-018 | — | Sichtung: Praxisverwaltung Schritt 13 |
| B | STA-EPIC-001 Statistiken: fünf Kennzahlen zur Praxissteuerung | fertig | 2026-09-29 | STA-001 bis STA-007 | — | Sichtung: Praxisverwaltung Schritte 14 und 15 |
| B | TRN-EPIC-001 Trainingskund:in anlegen | fertig | 2026-09-30 | TRN-001 bis TRN-003 | — | Sichtung: Training Schritte 1 bis 3 |
| B | TRN-EPIC-002 Trainingstermine | fertig | 2026-09-30 | TRN-004 bis TRN-006 | — | Sichtung: Training Schritte 4 bis 6 |
| B | TRN-EPIC-003 Trainingsrechnung | fertig | 2026-09-30 | TRN-007, TRN-008, Zweitreview | — | Sichtung: Training Schritte 7 bis 9 |
| B | TRN-EPIC-004 Trainingsprotokoll | fertig | 2026-09-30 | TRN-009, TRN-010, Zweitreview | — | Sichtung: Training Schritte 10 bis 12 |
| B | DSN-001 Ansichten der Plattform für Patient:innen und Betreuung (Docs) | gesichtet | 2026-09-30 | docs/development/PLATTFORM-ANSICHTEN.md | — | D1 bis D7 von Jannes bestätigt (2026-09-30, wie empfohlen) |
| B | POR-EPIC-001 Plattformzugang | fertig | 2026-09-30 | POR-001 bis POR-004, Zweitreview | — | Sichtung: Plattform Schritte 1 und 2 |
| B | POR-EPIC-001b Vertretung | fertig | 2026-10-02 | POR-005 bis POR-007, Zweitreview | — | Sichtung: Plattform Schritte 3 und 4 |
| B | ABN-EPIC-001 Abnahme der Annahmen, Blöcke 2, 3, 4 und 9 | fertig | 2026-10-02 | ABN-001 bis ABN-012, Zweitreview | — | Sichtung: Plattform Schritte 5 bis 7 |
| B | ABN-EPIC-001b Abnahme der Annahmen, Blöcke 5 bis 8 | fertig | 2026-10-02 | ABN-013 bis ABN-022, Zweitreview | — | ohne BEF-105, -106, -109 (ABN-EPIC-001c); Sichtung: Befund und Training je Schritte 13 bis 15 |
| B | ABN-EPIC-001c Dateien, Dokumentationsfotos, Kartendienst (BEF-105, -106, -109) | fertig | 2026-10-02 | ABN-023 bis ABN-028, Zweitreview; vorher ADR-017 Fassung 3, ADR-019 Fassung 5 (PR #170) | — | Edge Function patient-file-verify gebaut, scharf mit OPS-001; PDF in der App offen (ANN-223); Sichtung: Befund Schritte 10 bis 12, Kartendienst Schritt 9 |
| B | ABN-EPIC-002 Abnahme vom 09.10.2026 (BEF-133 bis BEF-137) | fertig | 2026-10-09 | ABN-029 bis ABN-034, Zweitreview; Prinzipien 0.22, ADR-021 Fassung 3, ADR-017 Fassung 4 | — | BEF-138 (Abruf über die Plattform ohne Protokoll) offen als eigener Pull Request mit freigabe-audit; Sichtung: Befund Schritte 10 bis 12 |
| B | LOG-EPIC-001 Protokollierung auf das Mindestmaß | fertig | 2026-10-03 | PRs #177 bis #180 (gestapelt), ADR-010 Fassung 3, PROJECT_PRINCIPLES 0.21 | — | ohne Oberfläche außer Hinweistexten; nach grüner CI mergen (E-6); offen bei Jannes: pg_cron-Nachweis, Backupfrist, AV-Verträge, Plattformlogs |
| B | ABR-EPIC-007 Terminhonorar | fertig | 2026-10-05 | ABR-030 bis ABR-032, ADR-009 Fassung 5 (B17 entschieden), Zweitreview | — | ohne BEF-114 (Paketpreise Training, wartet auf Preis, Umfang, Zahlungsweise); Sichtung: Plattform Schritte 8 und 9 |
| B | UBK-EPIC-001 Übersicht nach der Uhr, Tageswechsel, Tageskarte, Fahrwege im Kalender (BEF-051) | fertig | 2026-10-05 | UBK-001 bis UBK-005, Branch `claude/feature-loop-ubersicht-kalender-hy71mv` | — | Auftrag Jannes, eingeschoben; Sichtung: UI-Redesign Schritte 3, 13 und 14 |
| B | UBK-EPIC-002 Fahrzeiten im Alltag: Fahrzeitfaktor, Passt es?, Lückenfinder, Garage und Rückweg, Fahrweg antippbar, Ort auf der Kachel | fertig | 2026-10-06 | UBK-010 bis UBK-017, Branch `claude/friendly-wright-4r8083`, vier Migrationen, Zweitreview | — | Auftrag Jannes, eingeschoben; Sichtung: Kartendienst Schritte 8, 9 und 13, UI-Redesign Schritte 14 und 15 |
| B | RAH-EPIC-001 Design-Runde 1 Rahmen: Seitenleiste und Symbolspalte, Kopfzeile, Tableiste nach Reife, Sicherheit und Aufbewahrung, Praxiseinstellungen, Rückweg in der Akte, Tab-Titel, Startbild | fertig | 2026-10-06 | RAH-001 bis RAH-010, Branch `claude/epic-cori-rmq1ty`, Handoff docs/design/handoff-2026-10-05-rahmen.md, Prüfseite tests/e2e/fixtures/startbild.html | — | Auftrag Jannes (Design-Runde 1, 05.10.2026), eingeschoben; Sichtung: Rahmen Schritte 1 bis 3 |
| B | SLK-EPIC-001 Schlank und klar, erste Runde: Telefax der Patient:innen gelöscht, Doku an jeder Zeile der Übersicht, Stammdaten in einem Block, Grundton B | fertig | 2026-10-06 | SLK-001 bis SLK-004, Branch `claude/confident-wozniak-vj9h7h`, Leitfaden docs/design/leitfaden-schlank.md, eine Migration, Zweitreview ohne blockierenden Befund | — | Auftrag Jannes (06.10.2026), eingeschoben; Sichtung: Rahmen Schritte 4 bis 6 |
| B | SKN-EPIC-001 Design-Runde 2 Schrift und Knöpfe: Leiste 12 px, Kleingedrucktes 14 px, gesperrter Knopf gestrichelt, dichte Angaben auf 12 px, Zeitstrahl-Symbol | fertig | 2026-10-06 | SKN-001 bis SKN-007 (SKN-008 wartet auf die Zwei-Faktor-Frage), Handoff docs/design/handoff-2026-10-06-schrift-und-knoepfe.md, Prüfseite tests/e2e/fixtures/ui-bausteine.html, E2E tests/e2e/tableiste.spec.ts | — | Auftrag Jannes (Design-Runde 2, Freigabe 06.10.2026); Sichtung: Rahmen Schritt 7 |
| B | ABR-EPIC-008 Design-Runde Abrechnung: Rechnungsliste mit Suche, Filter, Monat und Weitere laden, Gesamtzahl, Spalten ab 1024 px | fertig | 2026-10-06 | ABR-033/034, Migration 20261012110000_abr_033_rechnungsliste_suche.sql, supabase/tests/invoices.test.ts, src/features/billing/Rechnungsliste.tsx | — | BEF-061 Option 1 und 3 (Entscheidung Jannes 2026-10-05), ANN-259; Sichtung: Rahmen Schritt 12 |
| B | DOK-EPIC-001 Design-Runde Dokumentation: Skala zweireihig mit gewähltem Wert, Bausteinfeld ohne Kasten im Kasten, Bausteinleiste einreihig, Ursprung im Nachtrag zugeklappt | fertig | 2026-10-06 | DOK-001 bis DOK-004, E2E tests/e2e/befund.spec.ts (Skala 44 px, zwei Reihen) und tests/e2e/bausteine.spec.ts (Testzeile eine Reihe) | — | BEF-057 Option 2 (Entscheidung Jannes 2026-10-05) mit der Skala aus Option 3 (ANN-258); Sichtung: Rahmen Schritt 11 |
| B | KUT-EPIC-001 Design-Runde 3 Kalender und Tour: Woche 7.5rem, Tour im Kopf, Anlegen-Leiste dichter mit Bildlauf, Tour am Handy Liste vor Karte, zwei Spalten am Rechner, Karte mit zwei Fingern | fertig | 2026-10-06 | KUT-001 bis KUT-006, Handoff docs/design/handoff-2026-10-06-kalender-und-tour.md, E2E tests/e2e/kalender.spec.ts (Tipp im unteren Drittel, Tour im Kopf) | — | Auftrag Jannes (Design-Runde 3 alles A, Freigabe 06.10.2026); BEF-053, BEF-054 erledigt; Sichtung: Rahmen Schritte 8 bis 10 |
| B | POR-EPIC-002 Eigene Termine, Rechnungen, Dokumente | fertig | 2026-10-06 | POR-008 bis POR-015, Zweitreview | — | Sichtung: Plattform Schritte 10 bis 12 |
| B | POR-EPIC-003 Einwilligungen, Export, Einstellungen | fertig | 2026-10-07 | POR-016 bis POR-020, Zweitreview | — | Sichtung: Plattform Schritte 13 bis 15 |
| B | ANG-EPIC-001 Nachsorge-Abo als Monatsrechnung | fertig | 2026-10-07 | ANG-001 bis ANG-004, Zweitreview | — | Sichtung: Angebote Schritte 1 bis 3 |
| B | ANG-EPIC-002 Trainingspaket nach Zeitraum | fertig | 2026-10-07 | ANG-005 bis ANG-008, BEF-114, Zweitreview | — | Sichtung: Angebote Schritte 4 bis 6 |
| B | KND-EPIC-001 Betreuung nach der Behandlung | fertig | 2026-10-07 | KND-001 bis KND-005, Zweitreview | — | Sichtung: Angebote Schritte 7 bis 9 |
| B | UEB-EPIC-001 Übungsbibliothek | fertig | 2026-10-07 | UEB-001 bis UEB-003, Zweitreview | — | Sichtung: Pläne Schritte 1 bis 3 |
| B | UEB-EPIC-002 Plan und Schnappschuss | fertig | 2026-10-07 | UEB-004 bis UEB-007, Zweitreview | — | Sichtung: Pläne Schritte 4 bis 6 |
| B | UEB-EPIC-003 Plan als PDF und im Portal | fertig | 2026-10-08 | UEB-008 bis UEB-011, Zweitreview | — | Sichtung: Pläne Schritte 7 bis 9 |
| B | KOM-EPIC-001 Strukturierte Rückfrage | fertig | 2026-10-09 | KOM-001 bis KOM-004, Zweitreview | — | Sichtung: Pläne Schritte 10 bis 12 |
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
| C | G20 SEC-EPIC-001 Sitzungssperre (ADR-025) | fertig | 2026-10-06 | SEC-001 bis SEC-003, Migration 20261012100000_sec_001_sitzungssperre.sql, supabase/tests/sitzungssperre.test.ts, src/features/auth/sitzungssperre/, Prüfseite tests/e2e/fixtures/sperre.html | — | Auftrag Jannes (06.10.2026: nach 30/60 min automatisch sperren); W1 (a), W2 (a); Passkey (W3) offen bis OPS-001; Sichtung: Betriebsreife Schritt 15 |
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
| E | B5 Identität und Vertretung | vorlaeufig | — | — | — | — |
| E | B9 Betreuung ohne Heilbehandlung, Ernährung | vorlaeufig | — | — | — | — |
<!-- fortschritt:ende -->

---

## Änderungsvermerk

| Version | Datum | Änderung |
| --- | --- | --- |
| 7.11 | 2026-10-08 | **FLT-EPIC-001** um das Markieren am 3D-Rad ergänzt (Jannes: an der Stelle der Roadmap umsetzen, nicht vorziehen): Check-Up und Pannenmeldung mit Stellen am 3D-Modell, Seite „Stellen am Rad", PDF für die Werkstatt. Entwurf, Entscheidungen, Leinwand-Dateien und Akzeptanzkriterien im [Handoff Lastenrad 3D](../design/handoff-2026-10-08-lastenrad-3d.md), `IDEA-PRX-057`. Reihenfolge der Blöcke unverändert. |
| 7.10 | 2026-10-05 | **UBK-EPIC-001** eingeschoben und gebaut (Auftrag Jannes): Übersicht nach der Uhr statt nach dem Haken (ANN-117 Fassung 2), Tageswechsel (ANN-234), Tageskarte als Ganzes zum Termin mit „i“ am Namen, Fahrwege als Blöcke im Kalender (ANN-235); BEF-051 mitgenommen. Reihenfolge der Blöcke unverändert; POR-EPIC-002 bleibt der nächste Bau-Loop. |
| 7.9 | 2026-10-05 | **ABR-EPIC-007 gebaut** (Freigabe Jannes, „wie empfohlen“): Terminhonorar mit Tarif und Honorarvereinbarung; B17 entschieden mit ADR-009 Fassung 5 (Einzelpositionen je Heilmittel, eine Rechnung je Verordnung). **BEF-114 Paketpreise im Training** herausgelöst: eigener kleiner Loop, sobald Preis, Umfang und Zahlungsweise feststehen. Reihenfolge der Blöcke unverändert. |
| 7.8 | 2026-10-02 | **ABN-EPIC-001b geschnitten und gebaut** (Freigabe Jannes): gebaut sind BEF-101 bis -104, -107, -108, -110 bis -113 (ABN-013 bis ABN-022). **BEF-105, -106 und -109 folgen als ABN-EPIC-001c** vor ABR-EPIC-007: Sie brauchen neue Fassungen von ADR-017 und ADR-019, die Jannes entscheidet, und Edge Functions, die in der Cloud nicht prüfbar sind. Die Empfängeranschrift prüft `issue_invoice` auf Entscheidung von Jannes für alle Rechnungen. Reihenfolge der Blöcke unverändert. |
| 7.7 | 2026-10-02 | **ABN-EPIC-001 geschnitten** (Freigabe Jannes): gebaut sind die Befunde der Blöcke 2, 3, 4 und 9 (BEF-092 bis -098, -100, -115 bis -119); die Blöcke 5 bis 8 (BEF-101 bis -113) folgen als **ABN-EPIC-001b** direkt danach, vor ABR-EPIC-007. Reihenfolge der Blöcke unverändert. |
| 7.6 | 2026-10-02 | **ABN-EPIC-001** und **ABR-EPIC-007 Terminhonorar** (ADR-009 Fassung 4) vor POR-EPIC-002 für die Änderungen aus der Abnahme (BEF-092 bis BEF-119, Blöcke 2 bis 9). Abnahme der Annahmen, Block 1 (Jannes): neue Anforderung **Sitzungssperre** als [ADR-025](../adr/ADR-025-session-lock.md) und Arbeitspaket **G20 SEC-EPIC-001** vor dem Produktivstart, Kriterium von M3; **G21 STAFF-005** Einladung neuer Mitarbeitender ganz aus der Anwendung (zu ANN-025). Reihenfolge der Blöcke unverändert. |
| 7.5 | 2026-09-30 | **UX-EPIC-005 Entrümpeln** eingeschoben (Jannes: Terminseite ohne Wiederholungen, „Niemand öffnet?“ hinter einem Knopf, Arbeitszeit im Kalender sichtbar, weitere Stellen mit unnötigen Angaben). Reihenfolge der Blöcke unverändert; POR-EPIC-001 bleibt der nächste Bau-Loop. |
| 7.4 | 2026-09-29 | **PRX-EPIC-003b Dubletten zusammenführen** aus PRX-EPIC-003 ausgegliedert (Jannes, Freigabe PRX-EPIC-003: „alles wie empfohlen“); in PRX-EPIC-003 bleibt der Hinweis beim Anlegen. BEF-060 Teile 1 und 2 in PRX-EPIC-003. |
| 7.3 | 2026-09-29 | **UX-EPIC-004** eingeschoben vor PRX-EPIC-003 (Jannes: „Anschließend BEF-071 bis 079 bauen“, dazu BEF-080 und BEF-081 aus derselben Sichtung). |
| 7.2 | 2026-09-26 | **STA-EPIC-001 Statistiken** aus PRX-EPIC-004 vorgezogen ans Ende von Block 2 (nach PRX-EPIC-003): eigener Bereich mit fünf Kennzahlen zur Praxissteuerung, von Claude im Auftrag von Jannes entschieden. PRX-EPIC-004 behält Export, Farben, Kalender-Abo, Planungskarte, Kartenzahlung und die Kennzahlen für Training und Angebote. |
| 7.1 | 2026-09-25 | **MAP-006 gebaut** (Block 2): Koordinaten bei der Adresse, echte Tourenseite mit Karte, Route, Fahrzeiten und Fahrpuffer nach §8.1 als Warnung, Handoff mit Koordinaten, Datenschutz-Paket [`kartendienst.md`](../datenschutz/kartendienst.md). Vorschau `/touren` und Prototyp `/touren/karte` entfallen. ANN-094 bis ANN-097; E12 Punkt 3a vorläufig beantwortet. |
| 7.0 | 2026-09-23 | **Umbau U2** nach dem Produktgespräch ([`UMBAU.md`](UMBAU.md)). Neuer **Block 1a „Handy und UX-Fundament"** (OPS-002a Test-Umgebung vorgezogen, UX-EPIC-002 Begriffe und Bedienprinzipien, UX-EPIC-003 Tagesansicht fürs Handy mit Liege und Vorschau). Neu **DOK-006** Fotos in der Akte, **DSN-001** Ansichten der Plattform vor Block 4; Erstaufnahme-Checkliste in PRX-EPIC-003, Liege und Weg ohne Sprechen in FRB-EPIC-003, Verordnungsfoto mit KI-Vorschlag in KI-EPIC-002. ANG-EPIC-001 ist das **Nachsorge-Abo**, ANG-EPIC-002 das Paket nach Zeitraum, KND-EPIC-001 der Übergang aus der Behandlung. **Anfragen ab Anfang 2027 parallel** (Block 11, R1). Regel 1 und Definition of Done: **Sichtung statt Abnahme je Epic**, Bildschirmfotos in jeder Oberflächen-PR. Grundsatz 3: Bedienbarkeit ist kein Komfort. `UI-001` des Blocks 9 heißt **UI-003** (Kennung war doppelt). Vermerke 6.0 bis 6.2 in die Chronik. |

Ältere Vermerke: [`ROADMAP-CHRONIK.md`](ROADMAP-CHRONIK.md).
