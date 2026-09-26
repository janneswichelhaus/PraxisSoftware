# Roadmap

Version 7.0 · Stand 2026-09-23 · **in Kraft**

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
   Patient:innen und Betreuung sind noch zu entwerfen (DSN-001, vor Block 4).
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
| 1 | **Rückstand und Umbau** | ~~G19~~ (gebaut 2026-09-22) → ~~G6a~~ → ~~G6b~~ (gebaut 2026-09-23) → G6c | Umbau U1 bis U4 ([`UMBAU.md`](UMBAU.md)) | ~~G6c: Wahl zu den Schreibpfaden~~ (2026-09-26: wie empfohlen); vier Sichtungen des Rückstands ([`../sichtung/`](../sichtung/README.md)) |
| 1a | **Handy und UX-Fundament** | ~~OPS-002a~~ (gebaut 2026-09-25) → ~~UX-EPIC-002~~ (gebaut 2026-09-26) → UX-EPIC-003 | ~~Umbau U5~~ (B16: Uberspace, 2026-09-23) | ~~Supabase-Testprojekt, Uberspace und GitHub-Secrets anlegen~~ (2026-09-25, [`hosting-optionen.md`](../decisions/hosting-optionen.md)); ~~Begriffe sammeln, die stören~~ (2026-09-26: alle in Ordnung); erste Sichtung am Handy |
| 2 | **Kern fertig** | MAP-006 → FRB-EPIC-001 → FRB-EPIC-002 → FRB-EPIC-003 → DOK-005 → DOK-006 → PRX-EPIC-001 → PRX-EPIC-002 → PRX-EPIC-003 | — | D2/D3 aus dem FRB-Plan; Sichtung |
| 3 | **Training** | TRN-EPIC-001 → -002 → -003 → -004 | — | Sichtung |
| 4 | **Plattformzugang** | POR-EPIC-001 → -002 → -003 | **DSN-001** Ansichten für Patient:innen und Betreuung · **ADR-023** Plattformzugang (beide vor POR-EPIC-001) | DSN-001 und ADR-023 bestätigen |
| 5 | **Angebote** | ANG-EPIC-001 → ANG-EPIC-002 → KND-EPIC-001 | — | Abo- und Paketpreise (bis dahin synthetisch) |
| 6 | **Pläne und Rückfragen** | UEB-EPIC-001 → -002 → -003 → KOM-EPIC-001 → -002 → -003 | **ADR-024** Offline-Erfassung und Benachrichtigungen (vor KOM-EPIC-003) | ADR-024 bestätigen |
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
| M3 | Go-live-Gate | Ergebnisse aus B1, B2 (DSFA) und B4 liegen vor und sind eingearbeitet · OPS-001 positiv · jede Anbieterprüfung positiv **oder** die Funktion abgeschaltet · ADR-007 sieben Vorbedingungen · kein Register-Eintrag Datenschutz/Recht auf `offen` oder `entschieden (Jannes)` · Restore-Test 1 und 2 · Deployment aus Tag mit Freigabe · Redaction-Prüfung grün · Betriebsdokumentation (13 Positionen) · OPS-007 gegen die Test-Umgebung geprobt · Rückfallplan unterschrieben · Messrunde nach `OPTIMIERUNG.md` |
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
| **G6c** | Abgewiesene Schreibzugriffe sind nachweisbar | **Entschieden (Jannes, 2026-09-26): wie empfohlen** — (a) für Rollen und Konten, Legal Hold und Löschaufträge, (c) für den Rest. Zur Wahl standen: (a) bestätigte Transaktion mit HTTP 403 über `response.status` von PostgREST, lokal mit `supabase start` zu prüfen; (b) Ereignis ins Betriebslog statt ins Auditlog, hängt an G3 und R9; (c) Schreibpfade bleiben ohne Eintrag. G6c baut als nächster Loop, **vor** Training und Plattform |

### Block 1a — Handy und UX-Fundament

Jannes will sehen, was gebaut ist, und zwar am Handy in der Halterung am Rad
(E-2, E-5). Die Oberfläche ist heute auch am Desktop unübersichtlich, und
Beschriftungen folgen eher dem Datenmodell als der Praxis. Vor jeder weiteren
Oberfläche kommen deshalb die Test-Umgebung und das Fundament der Bedienung.

| Loop | Ergebnis | Zuschnitt | Voraussetzung |
| --- | --- | --- | --- |
| ~~**OPS-002a**~~ | **gebaut 2026-09-25** — Jannes öffnet die Anwendung auf dem eigenen Handy, von überall; Auslieferung nach grüner CI auf `main`, Seed auf Knopfdruck (ANN-100, ANN-101) | Test-Umgebung nach G5, **vorgezogen**: Supabase-Projekt in der EU nur mit synthetischen Daten, Hosting der Oberfläche nach B16 ([`hosting-optionen.md`](../decisions/hosting-optionen.md)), eigene Domain, Zugang geschützt, Deployment aus `main` nur dorthin; Seed mit einer Praxiswoche. Kein Produktivprojekt (§3.2) | Jannes legt Konten an (B16) |
| ~~**UX-EPIC-002**~~ | **gebaut 2026-09-26** — Die Anwendung spricht die Sprache der Praxis (ANN-108 bis ANN-112) | Begriffsliste aus Jannes' Sammlung (Beschriftungen, Knöpfe, Meldungen) als eine Quelle im Code; Bedienprinzipien (ein Hauptknopf je Ansicht, was nicht gebraucht wird, ist eingeklappt, Handy zuerst); Navigation und Arbeitsbereiche danach durchgesehen; Bildschirmfotos vorher und nachher | ~~Begriffsliste von Jannes~~ (2026-09-26: Begriffe in Ordnung); erste Stories BEF-035 bis BEF-040 (R6) |
| **UX-EPIC-003** | Der Tag beginnt am Rad mit dem, was zählt | Tagesansicht fürs Handy als Startseite (aus PRX-EPIC-002 vorgezogen): erster Weg, Vorschau auf den nächsten, kurze Hinweise zur Person, **Behandlungsliege heute: ja, ab dem n-ten Besuch** (§9; Merkmal an der Person, in der Akte setzbar, im Befund ab FRB-EPIC-003), bisherige Doku mit einem Tipp; offene Punkte der Erstaufnahme als Hinweis, sobald PRX-EPIC-003 sie liefert | UX-EPIC-002 |

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
| **FRB-EPIC-003** | Der Befund entsteht aus Bausteinen zum Abhaken, mit fertigem Dokumentationstext | Phasen P2 und P3 des FRB-Plans: neun Regionen als Daten (Zähltest), Renderer mit Live-Vorschau des Texts, Textbausteine auch im Befund, ein Bild ruft den Test in Erinnerung; **Liege-Merkmal im Befund**; Bausteine und Skalen auch für die Verlaufsdoku — der Weg ohne Sprechen (§5) | `IDEA-PRX-043`, `IDEA-OUT-009` |
| **DOK-005** | Ein Therapiebericht an die Verordner:in entsteht aus Befund und Verlauf | Bericht als Druckansicht (B14 Weg 1), Inhalt nur übernommen, nicht interpretiert (§17); dazu die **Empfehlung zum Verordnungsende** mit Quelle und Datum (Wiedervorlage aus VER-EPIC-002, ANN-014) | `PROJECT_PRINCIPLES.md` §4.2 |
| **DOK-006** | Fotos liegen in der Akte, ohne in der Mediathek des Handys zu landen | Aufnahme über die Kamera der Anwendung für Verordnung und Papierbögen; **Fotos von Patient:innen** mit eigener Einwilligung, Frist und Entfernung der Aufnahmemetadaten — dafür zuerst eine neue Fassung von ADR-017 (Punkt 30 gibt sie heute nicht frei); Vergleich zweier Fotos im Verlauf, ohne Bewertung (§17) | Jannes 2026-09-23; §5 |

**Etappe P — Praxisverwaltung.** Die Ideen aus
[`../product/ideen/10-praxisverwaltung.md`](../product/ideen/10-praxisverwaltung.md),
die den Tag erleichtern. Der Komfortteil steht als PRX-EPIC-004 in Block 9.

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **PRX-EPIC-001** | Ein freier Platz findet eine Patientin, nicht umgekehrt | Warteliste mit Zeitfenstern und Nachrücken, automatische Terminsuche als Vorschlagsliste, Gebietstage für die Terminvergabe | `IDEA-PRX-003`, `-008`, `-031` |
| **PRX-EPIC-002** | Am Termin steht, was man vor der Tür wissen muss | Vertretungs-Kurzblick (aufklappbar, auditiert), „Mitnehmen" aus den letzten Befunden, Abrechnungslage und Verordnungszähler am Termin, Termin abhaken mit Heilmittel und Kontingent | `IDEA-PRX-034`, `-016`, `-035`, `-037`, `-009`, `-039` |
| **PRX-EPIC-003** | Nichts fällt durch | **Erstaufnahme-Checkliste** (Verordnungsfoto, Befundbogen, Einwilligungen, Befund, Liege; offen in Tagesansicht, Aktenkopf und Büroliste, bis erledigt — §5), Aufgaben und Wiedervorlagen mit Patientenbezug, Anrufliste für morgen mit gespeichertem Stand, Dublettenprüfung und Zusammenführen, Verordnung per Kamera, Erinnerung am Rezeptende und an den vergessenen Abschluss | `IDEA-PRX-019`, `-005`, `-041`, `-018`, `-023`, `IDEA-LZK-007`, `-009` |

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
| **TRN-EPIC-001** | Eine Trainingskund:in entsteht in der Anwendung — ohne Akte — und jemand darf sie betreuen | **TRN-001** Schreibwege für das Trainingsverhältnis mit Policies nach §4.9 und Audit auf § 203-Niveau (ADR-021 Punkt 8) · **TRN-002** Person **ohne** Behandlungsverhältnis anlegen, `patients` bleibt unberührt; eine vorhandene Person bekommt ihr zweites Verhältnis ohne Dublette · **TRN-003** Rolle Trainingsbetreuung zuweisbar, Bereichsliste für ein solches Konto; „kein Durchgriff" in **beide** Richtungen als Negativfall | LEI-EPIC-001 |
| **TRN-EPIC-002** | Ein Trainingstermin steht im selben Kalender, und die Betreuung sieht nur ihn | **TRN-004** Anlegen, Verschieben, Absagen im Kontext `training` über die vorhandenen Schreibwege (ADR-022 Punkte 1, 9, 10) · **TRN-005** Trainingsgrundlage bedienbar, Einzelstunde ohne Klammer bleibt möglich (Punkt 5) · **TRN-006** Kalender, Tagesliste und Suche je Kontext gefiltert; die Belegung sagt „belegt" und nichts darüber hinaus (Punkt 11), als Negativfall in `pnpm test:db` | TRN-EPIC-001 |
| **TRN-EPIC-003** | Eine Trainingsleistung landet als Rechnung im eigenen Nummernkreis | **TRN-007** Leistung am Trainingsverhältnis statt an `patients` (ADR-021 Punkt 5) · **TRN-008** zweite, nullbare Verknüpfung an `invoices` für `training`; § 14c-Riegel, Befreiungsgrund, Nummernkreis je Bereich, Sammelrechnung (ANN-077) und Auswertung bleiben unverändert | TRN-EPIC-001; ABR-EPIC-004 bis 006 |
| **TRN-EPIC-004** | Was in einer Einheit passiert ist, steht als Protokoll in der Anwendung, nicht als Befund | **TRN-009** Trainingsprotokoll als Fachdatum des Verhältnisses mit eigener Datenklasse und Frist, **kein** Eintrag nach ADR-016, keine klinische Bewertung (ADR-006 Punkte 9 und 11) · **TRN-010** `documented` am Trainingstermin erreichbar (ADR-018 Punkt 3, gelesen nach ADR-022 Punkt 8) | TRN-EPIC-002 |

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
Betreuung — Jannes hat sie noch nicht durchdacht; die Ansicht der
Trainingskund:innen steht mit §4.10. **ADR-023**: Konten
externer Personen neben den Praxisrollen, Einladung und Zustellweg (R8),
Identitätsprüfung und Vertretung (B5 als Annahme, reversibel an einer Stelle),
Sitzungsregeln, RLS-Muster „nur eigene Daten", Abgrenzung zur Praxisoberfläche.

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **POR-EPIC-001** | Eine Patientin oder Kund:in hat einen eigenen Zugang, der nur ihre Daten zeigt | Konto zu Person, Einladung aus der Akte bzw. dem Trainingsverhältnis, Anmeldung, Sperren und Entziehen ohne Wirkung auf die Akte; Negativfall „fremde Person" für jede Sicht | `IDEA-LZK-001` |
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
| **FLT-EPIC-001** | Räder sind eine Planungsressource: Depot, Schlüssel, Check-Up, Pannenassistent | `/betrieb/flotte…` | Tübinger Standortvorlage (Jannes); Rad im Kalender |
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
| **PRX-EPIC-004** | Komfort für die Praxisführung | Kennzahlen, Export für die Steuerberatung (Format als Annahme bis B4), Farbcodierung je Terminart und Person, Kalender-Abo (Bedenken: ohne Namen), Planungskarte der aktiven Adressen (Bedenken), Kartenzahlung beim Hausbesuch hinter Adapter (Grundsatz 5) | `IDEA-PRX-025`, `-026`, `-021`, `-024`, `-033`, `-022` |
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
- **D2/D3** aus dem FRB-Plan (Lücken der MT-Vorlage, Tippfehler) — vor
  FRB-EPIC-003; ohne Antwort gilt der Vorschlag dort.
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
| A | Fundament: PAT-001 bis PAT-004, CAL-001 bis CAL-006, STAFF-001 | fertig | vor 2026-09-01 | PR #1, `e70775a`, `ca907e9` | — | — |
| A | DOK-EPIC (DOK-001 bis DOK-004) | gesichtet | 2026-09-05 | PR #5, `21d85dd`, `e931068` | 2026-09-11 | — |
| A | VER-EPIC-001 Verordnungen | gesichtet | 2026-09-07 | `2c3c1de` … `159c1bb` | 2026-09-11 | — |
| A | UI-000 Fundament der Oberfläche | gesichtet | 2026-09-07 | `4a4440f` … `e6b4ab6` | 2026-09-11 | — |
| A | MARKE-001 Marke in der Anwendung | gesichtet | 2026-09-11 | PR #19 | 2026-09-11 | — |
| A | UX-EPIC-001 Hausbesuchstag (11 Stories) | gesichtet | 2026-09-11 | PR #18 | 2026-09-11 | — |
| A | LOE-EPIC-001 Löschung und Retention (5 Stories) | gesichtet | 2026-09-11 | PR #25 | 2026-09-11 | — |
| A | CAL-EPIC-003a Terminzustände | gesichtet | 2026-09-12 | PR #28 | 2026-09-12 | — |
| A | CAL-EPIC-003b Serie und Terminfenster (mit CAL-012 und CAL-013) | fertig | 2026-09-12 | `b2626ae`, `89ab30b`, `acddcc6` | — | — |
| A | DAT-EPIC-001 Dateiablage (G4) | fertig | 2026-09-13 | `84bec9b` … `fd10a37` | — | — |
| A | ROL-EPIC-001 Office liest klinische Inhalte (E15) | fertig | 2026-09-15 | PR #41 | — | — |
| A | CAL-018 Hausbesuch-Szenarien (E14) | fertig | 2026-09-16 | `dc529a7`, `6a11fb0` | — | — |
| A | CAL-EPIC-004a Freie Terminlänge, Rückfrage beim Ziehen | fertig | 2026-09-18 | `ee81ea7`, `e189183` … `1b132ea` | — | — |
| A | FIX-EPIC-004 Kalender-Bedienung (BEF-012 bis BEF-016) | fertig | 2026-09-18 | `14a1fa7` … `856a5ac` | — | — |
| A | VER-EPIC-002 Verordnung im Office-Alltag | fertig | 2026-09-18 | `f734e55`, `ba19245` | — | — |
| A | ABR-EPIC-001 Leistungen und Katalog | fertig | 2026-09-19 | `3874e83` … `a1384ce` | — | — |
| A | ABR-EPIC-002a Rechnung entsteht | fertig | 2026-09-19 | `3874e83` … `a1384ce` | — | — |
| A | ABR-EPIC-002b Rechnung als Dokument | fertig | 2026-09-19 | `3874e83` … `a1384ce` | — | — |
| A | ABR-EPIC-003 Zahlungen und offene Posten | fertig | 2026-09-19 | `3874e83` … `a1384ce` | — | — |
| A | PAT-006 Datenschutzinformation und Einwilligungen (G8) | fertig | 2026-09-22 | `4764d90`, `8569f3d`, `1706cb1` | — | — |
| A | ABR-EPIC-004 Befreiungsgrund (BEF-019) und § 14c-Riegel (Etappe L) | fertig | 2026-09-20 | `dfe96a8`, `d8f3ea4` | — | — |
| A | LEI-EPIC-001 Trainingsverhältnis mit eigener Frist und Rolle (Etappe L) | fertig | 2026-09-20 | PR #72 | — | — |
| A | CAL-EPIC-005 Terminkontext und Trainingsgrundlage (Etappe L) | fertig | 2026-09-21 | `e268f96`, `0c8920c`, `120445f` | — | — |
| A | ABR-EPIC-005 Leistungsbereich je Rechnung, getrennte Nummernkreise (Etappe L) | fertig | 2026-09-21 | `0fcac3e` … `6d6261f` | — | — |
| A | ABR-EPIC-006 Auswertung „Einnahmen je Leistungsart" (Etappe L) | fertig | 2026-09-21 | `0fcac3e` … `6d6261f` | — | — |
| B | UX-EPIC-002 Begriffe und Bedienprinzipien (Block 1a) | fertig | 2026-09-26 | `aafe0cd` … `ecc17b8` (UX-002a bis UX-002e, BEF-035 bis BEF-040); `ae65bc9` … `134ab23` (UX-002f bis UX-002h, BEF-033, BEF-034) | — | Sichtung am Handy offen: Kernprozess Schritte 1, 2, 7 bis 10 |
| B | MAP-002 In-App-Kartenprototyp | fertig | 2026-09-21 | `c85c56e` … `ea2d9aa` | — | — |
| B | MAP-003 Fahrradroute als Linie | fertig | 2026-09-21 | `cbc6c07`, `71756aa`, `d66ea31` | — | — |
| B | MAP-004 Fahrzeiten und Erreichbarkeit | fertig | 2026-09-22 | `ce5dbe4` … `0e27b4f` | — | — |
| B | MAP-005 Navigations-Handoff mit Koordinaten | fertig | 2026-09-22 | `cf03057`, `ef74eec` | — | Teil A gesichtet 2026-09-22, Teil B am Telefon offen |
| B | MAP-006 Tagesroute mit Fahrpuffer (Block 2) | fertig | 2026-09-25 | `6cb52b2` … `a0cc774` | — | mit synthetischen Adressen; Scharfschalten am Gate aus ADR-019 Punkt 9 (LOCATION_DATA_GATE) |
| B | FRB-EPIC-000 Schema und Validator der Instrumente | fertig | 2026-09-21 | `0e988d5`, `53fd542`, `dc9c963`, `6dbe377` | — | — |
| B | FRB-EPIC-001 Instrumentenbibliothek | fertig | 2026-09-25 | `7056777`, `8aa5d7d`, `f7bb47b` | — | — |
| B | FRB-EPIC-002 Anamnese und Verlauf | fertig | 2026-09-26 | `44b6dcb`, `2d23d91`, `95532e9`, `bf800be`, `68f9b50` | — | — |
| C | G1 ADR-017 Dateiablage (Dokument) | gesichtet | 2026-09-11 | PR #35 | 2026-09-11 | — |
| C | G2 STAFF-EPIC-002 Konten und Rollen | gesichtet | 2026-09-11 | PR #20 | 2026-09-11 | — |
| C | G3 OPS-001 Providerprüfung und Cloudprojekt | entwurf | 2026-09-21 | `e7fcb00`, PR #87 | — | Dokument steht, nichts bestanden |
| C | OPS-002a Test-Umgebung, vorgezogen (Block 1a) | fertig | 2026-09-25 | `656dff9`, `01b0b92` | — | erster Lauf gegen Uberspace nach dem Merge |
| C | G6 OPS-004 Logging, Redaction, Monitoring | in_arbeit | 2026-09-22 | `ff15f80` … `dcdb195` | — | Rest nach G3 |
| C | G6a Abgewiesene Lesezugriffe auf klinische Dokumente | fertig | 2026-09-23 | PR #104 | — | — |
| C | G6b Abgewiesene Lesezugriffe, Rest | fertig | 2026-09-23 | PR #105 | — | — |
| C | G9 OPS-006 Betroffenenrechte (minimal) | fertig | 2026-09-22 | `aa321d0`, `2e3ebc7` | — | — |
| C | G11 OPS-007 Bootstrap Produktion (Runbook) | in_arbeit | 2026-09-22 | `a870992`, `f3b9497` | — | Probe gegen die Test-Umgebung offen |
| C | G12 ADR-019 Kartendienst (Fassung 2, angenommen 2026-09-13) | gesichtet | — | — | — | — |
| C | G19 Dokumentationsgate erweitern | fertig | 2026-09-22 | `7b95c22`, PR #102 | — | — |
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
| E | B5 Identität und Vertretung | vorlaeufig | — | — | — | — |
| E | B9 Betreuung ohne Heilbehandlung, Ernährung | vorlaeufig | — | — | — | — |
<!-- fortschritt:ende -->

---

## Änderungsvermerk

| Version | Datum | Änderung |
| --- | --- | --- |
| 7.1 | 2026-09-25 | **MAP-006 gebaut** (Block 2): Koordinaten bei der Adresse, echte Tourenseite mit Karte, Route, Fahrzeiten und Fahrpuffer nach §8.1 als Warnung, Handoff mit Koordinaten, Datenschutz-Paket [`kartendienst.md`](../datenschutz/kartendienst.md). Vorschau `/touren` und Prototyp `/touren/karte` entfallen. ANN-094 bis ANN-097; E12 Punkt 3a vorläufig beantwortet. |
| 7.0 | 2026-09-23 | **Umbau U2** nach dem Produktgespräch ([`UMBAU.md`](UMBAU.md)). Neuer **Block 1a „Handy und UX-Fundament"** (OPS-002a Test-Umgebung vorgezogen, UX-EPIC-002 Begriffe und Bedienprinzipien, UX-EPIC-003 Tagesansicht fürs Handy mit Liege und Vorschau). Neu **DOK-006** Fotos in der Akte, **DSN-001** Ansichten der Plattform vor Block 4; Erstaufnahme-Checkliste in PRX-EPIC-003, Liege und Weg ohne Sprechen in FRB-EPIC-003, Verordnungsfoto mit KI-Vorschlag in KI-EPIC-002. ANG-EPIC-001 ist das **Nachsorge-Abo**, ANG-EPIC-002 das Paket nach Zeitraum, KND-EPIC-001 der Übergang aus der Behandlung. **Anfragen ab Anfang 2027 parallel** (Block 11, R1). Regel 1 und Definition of Done: **Sichtung statt Abnahme je Epic**, Bildschirmfotos in jeder Oberflächen-PR. Grundsatz 3: Bedienbarkeit ist kein Komfort. `UI-001` des Blocks 9 heißt **UI-003** (Kennung war doppelt). Vermerke 6.0 bis 6.2 in die Chronik. |

Ältere Vermerke: [`ROADMAP-CHRONIK.md`](ROADMAP-CHRONIK.md).
