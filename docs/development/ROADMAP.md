# Roadmap

Version 6.0 · Stand 2026-09-22 · **in Kraft**

Reihenfolge der Umsetzung. Beantwortet die Frage **„was als Nächstes"** — und
sonst nichts. Fassung 6.0 ist eine Neufassung: Jannes hat am 2026-09-22 den
Umfang bis zur Eröffnung auf das **Endprodukt** erweitert und die externen
Prüfungen **hinter den Feature-Freeze** gelegt. Wortlaut bis 5.49,
ausführliche Fortschrittsvermerke und alte Änderungsvermerke:
[`ROADMAP-CHRONIK.md`](ROADMAP-CHRONIK.md).

## Was dieses Dokument ist und was nicht

- **Es legt die Reihenfolge fest, nie den Scope.** Was ein Eintrag konkret
  umfasst, entsteht erst im SPEC-Schritt des Loops. Die Zeilen hier sind
  Zuschnitte, keine Spezifikationen.
- **Es ist kein Auftrag.** Gebaut wird, was Jannes mit `/feature-loop`
  beauftragt; die nächste Aufgabe steht allein in [`../STATUS.md`](../STATUS.md).
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

Jeder Loop liest „Ziel und Umfang" und die Zeile seiner Etappe, und stellt am
Ende die Fortschrittstabelle, `fortschritt.json` und [`../STATUS.md`](../STATUS.md)
nach (Skill-Schritt I).

---

## Ziel und Umfang

**Die Praxis eröffnet im Juli 2027** — das ist der einzige Termin dieses
Dokuments (entschieden 2026-09-05, auf einen Termin zurückgeführt am
2026-09-21). Kein Vorgängersystem, keine Bestandsdaten, kein Parallelbetrieb.
Alles andere steht in einer **Reihenfolge**, nicht in einem Kalender.

**Zur Eröffnung läuft das Endprodukt** (Jannes, 2026-09-22;
`PROJECT_PRINCIPLES.md` 0.16 §14). V1 umfasst:

1. **Kernprozess** der Heilbehandlung — Akte, Verordnung, Termine,
   Dokumentation, Leistungen, Rechnung, Zahlung, Löschung, Audit (gebaut).
2. **Tagesroute** mit Karte, Fahrzeiten, Handoff und Führung auf dem Gerät.
3. **Befund** mit Anamnese, Scores, Untersuchungsbausteinen und Therapiebericht.
4. **Praxisverwaltung** aus dem Ideenspeicher: Warteliste, Anruflisten,
   Aufgaben, Kennzahlen, Export für die Steuerberatung, Kartenzahlung.
5. **Trainingsbereich** in der Sicht der Betreuung.
6. **Plattform für Patient:innen und Kund:innen** mit allen Punkten der
   Navigationsleiste aus [`../product/ideen/referenz-navigation.md`](../product/ideen/referenz-navigation.md)
   außer dem, was §17 verbietet: Übersicht, Kalender, Einheiten, Check-ins,
   Fortschritt, Pläne, Aktivitäten, Assessments, Profil, Gewohnheiten,
   **Ernährung**, Rückfragen, Einstellungen.
7. **Angebote:** ein **Abo** der Patient:innen für die Plattform als
   Monatsrechnung; für Trainingskund:innen ist sie im **Paketpreis** enthalten.
8. **Praxisbetrieb:** Radflotte, Teamkommunikation (das „Slack-Äquivalent"),
   Urlaub, Zeitkonto, Erstattungen.
9. **KI-Assistenz** innerhalb von §6 und §17 — Sprachdokumentation,
   Strukturieren, Patientensprache, Antwortentwürfe, Zusammenfassung.

**Externe Prüfungen kommen nach dem Bauen** (Jannes, 2026-09-22): OPS-001,
B1, B2, B4 und alle Anbieterprüfungen werden erst eingeholt, wenn M2 erreicht
ist. §15.2 trägt das — gebaut wird mit synthetischen Daten, scharfgeschaltet
wird erst nach den Prüfungen. **Dauert das Bauen länger, wird nicht gekürzt**
(Jannes, 2026-09-22): Dann eröffnet die Praxis mit dem Papierprozess (H4), und
die Software folgt.

### Nicht in V1 — und warum

Was Jannes' Umfang nennt, aber an Rang 1 oder 2 scheitert. Kommt nur mit einer
neuen Fassung der genannten Stelle zurück, nicht mit einem Loop.

| Was | Herkunft | Grund |
| --- | --- | --- |
| Automatische Progression, Regelwerk mit Korridor, Autoregulation als Vorschlag, Phasenwechsel und Wiedereinstieg als Automatik, Belastungssteuerung | `IDEA-TRN-001`/`-002`/`-006`/`-008` bis `-010`/`-012`/`-013`, `IDEA-QSN-004` | §17 Verbot 1, ADR-006 Punkt 10; B10. Im Register `src/app/mdr.ts` (`progression-regelwerk`). Die **von Hand** gesetzte Progression im Plan (`IDEA-TRN-004`, `-007`) bleibt in UEB-EPIC-002 |
| Ampel aus der Schmerzreaktion, Bewertung eines Verlaufs | `IDEA-TRN-003`, `IDEA-OUT-002` (bewertende Hälfte) | §17 Verbot 2; B10 |
| „KI-Analyse" als Einschätzung, ableitende Übungsanalyse, Cut-off-Anzeige | Navigationspunkte 7 und 15, `IDEA-KI-006`, `IDEA-OUT-006` | §17, ADR-006 Punkt 13; Register in `src/app/mdr.ts`. Die **anzeigende** Übungsanalyse und die Zusammenfassung ohne Bewertung sind in V1 |
| Wearables und Gesundheits-Apps | `IDEA-TRK-007` | §14 (gesperrt), ADR-014; bräuchte eine native App (ADR-015 Punkt 15) |
| Mandantenfähigkeit mit Branding, Vermarktung | `IDEA-QSN-009` | §14, ADR-003 |
| Interoperabilität | `IDEA-QSN-008` | Die Idee selbst: benennen, nicht bauen |
| Verworfen | `IDEA-PRX-015`, `IDEA-PRX-036`, `IDEA-ANG-002` | E-13; Entscheidung 2026-09-11; B11 |
| GKV, E-Rechnung, Kassenbuch und TSE, Factoring | Produktvision §1.1 | Privatabrechnung (§19); keine Barkasse vorgesehen |

---

## Grundsätze der Reihenfolge

Getroffen am 2026-09-22 in der Neufassung (Jannes hat die Reihenfolge
delegiert). Sie begründen die Kette unten; ein Loop, der von ihr abweicht,
sagt, gegen welchen Grundsatz.

1. **Erst schließen, dann öffnen.** Was die Behandlung am Tag braucht
   (Tagesroute, Befund, Praxisverwaltung), kommt vor allem, was sich nach
   außen öffnet. Das Produkt der Eröffnung ist die Behandlung.
2. **Fundament vor Oberfläche.** Was das Datenmodell oder die Rechte vieler
   Bereiche prägt, kommt vor dem, was darauf aufsetzt: Trainingsverhältnis vor
   Plattform, Plattformzugang vor Abo, Abo vor Plänen im Portal, Rückfragen vor
   Teamchat (dieselbe Nachrichtenmechanik, strengere Regeln zuerst). Additiv
   einziehen ist billig, nachträglich trennen teuer (ADR-014).
3. **Risiko vor Komfort.** Die Plattform öffnet die Anwendung für Menschen
   außerhalb der Praxis — die größte neue Angriffsfläche. Sie steht deshalb
   in der Mitte, nicht am Ende; Komfort (Kennzahlen, Farben, Planungskarte,
   Politur) steht am Ende.
4. **MDR-nahe zuletzt** (ADR-006 Punkt 13): Tracking, Fortschritt und KI
   kommen nach den Bereichen, die nur erfassen und darstellen.
5. **Jeder neue Anbieter bleibt abschaltbar.** Eine Funktion, die an einem
   noch ungeprüften Dienst hängt (Karte, Mail, SMS, KI, Zahlung), wird hinter
   einem Adapter mit `mock`-Weg gebaut und ist ohne ihn benutzbar oder
   abgeschaltet. So kann ein negatives Prüfergebnis nach M2 eine Funktion
   kosten, aber nicht die Eröffnung.
6. **Abnahme hält Schritt.** Siehe „Abweichungsregeln", Regel 1.

---

## Die Kette bis zur Eröffnung

Blöcke in fester Reihenfolge; ein Block beginnt, wenn der vorige gebaut ist.
Innerhalb eines Blocks gilt die Pfeilfolge. Die Einzelheiten je Loop stehen
in den Etappen darunter.

| # | Block | Code-Loops | Docs-Sessions | Jannes |
| --- | --- | --- | --- | --- |
| 0 | **Erledigt** | alle Loops bis PAT-006 — Fortschrittstabelle | ADR-017 bis ADR-022, E18, OPS-001-Dokument | laufende Abnahmen |
| 1 | **Rückstand** | G19 → G6a | — | Abnahme-Rückstand abbauen, M1 abnehmen |
| 2 | **Kern fertig** | MAP-006 → FRB-EPIC-001 → FRB-EPIC-002 → FRB-EPIC-003 → DOK-005 → PRX-EPIC-001 → PRX-EPIC-002 → PRX-EPIC-003 | — | D2/D3 aus dem FRB-Plan; Abnahmen |
| 3 | **Training** | TRN-EPIC-001 → -002 → -003 → -004 | — | Abnahmen |
| 4 | **Plattformzugang** | POR-EPIC-001 → -002 → -003 | **ADR-023** Plattformzugang (vor POR-EPIC-001) | ADR-023 bestätigen |
| 5 | **Angebote** | ANG-EPIC-001 → ANG-EPIC-002 → KND-EPIC-001 | — | Abo- und Paketpreise (bis dahin synthetisch) |
| 6 | **Pläne und Rückfragen** | UEB-EPIC-001 → -002 → -003 → KOM-EPIC-001 → -002 → -003 | **ADR-024** Offline-Erfassung und Benachrichtigungen (vor KOM-EPIC-003) | ADR-024 bestätigen |
| 7 | **Verlauf und Alltag** | TRK-EPIC-001 → -002 → -003 → OUT-EPIC-001 → ALT-EPIC-001 → ALT-EPIC-002 → ORG-EPIC-001 | — | Abnahmen |
| 8 | **Praxisbetrieb** | FLT-EPIC-001 → TEAM-001 → URL-001 → ZK-001 → ERS-001 | — | Tübinger Standortvorlage (Depot, Werkstatt) |
| 9 | **Assistenz und Komfort** | KI-EPIC-001 → KI-EPIC-002 → MAP-007 → PRX-EPIC-004 → UI-001 | — | Abnahmen |
| 10 | **Feature-Freeze** | nur Befunde | DSFA-Paket als Entwurf (G14) · Betriebsdokumentation · Anfragen vorbereiten | Probewoche 1 · Kollegin-Test · **M2** |
| 11 | **Prüfungen** | Befunde aus den Prüfungen | Antworten einarbeiten | OPS-001-Unterlagen · B1, B2, B4, B8 · Anbieterverträge |
| 12 | **Betriebsreife** | OPS-002 → OPS-003 → OPS-004 Rest → OPS-007-Probe | BETRIEB-001 · Rückfallplan · Kurzanleitung | Cloudprojekt (G3) · Restore-Test 1 und 2 · Notfallzugang |
| 13 | **Gate und Produktion** | keine Epics | Nachweistabelle MUSS → Test | **M3** Gate · **M4** Produktion |
| 14 | **Eröffnung** | Hotfixes | Erster-Tag-Protokoll · Schulung | Probewoche 2 · Restore-Test 3 · Change-Freeze · **M5** · **M6** |

**Block 11 und 12 laufen nebeneinander:** Block 12 beginnt, sobald OPS-001
positiv ist und das Cloudprojekt steht; auf B1 und B2 wartet er nicht.

**Docs-Sessions laufen neben dem Code.** ADR-023 und ADR-024 dürfen früher
geschrieben werden als ihr Block — sie sollen angenommen sein, wenn ihr erster
Loop beginnt, damit Jannes' Bestätigung nicht auf dem Weg liegt.

---

## Meilensteine

Ein Meilenstein ist erreicht, wenn **alle** Kriterien erfüllt sind. Er trägt
kein Datum; das Wochenupdate meldet **erreicht** oder **offen** und nennt das
fehlende Kriterium. M0 („Vorlauf") entfällt mit 6.0 — die Anfragen gehören
jetzt zu M3.

| MS | Name | Kriterien |
| --- | --- | --- |
| M1 | Kernprozess Ende-zu-Ende | Ein synthetischer Fall läuft **lokal** durch: Verordnung → Serie → Termin durchgeführt → Dokumentation finalisiert → Leistung → Rechnung → Zahlung · derselbe Fall als E2E-Test hinter der Anmeldung · von Jannes abgenommen · jede Datenklasse hat Löschpfad und Test |
| M2 | Software fertig (Feature-Freeze V1) | Blöcke 1 bis 9 gebaut **und abgenommen** · Probewoche 1 durchlaufen, Befunde geschlossen · Kollegin-Test durchlaufen · DSFA-Paket als Entwurf vollständig · kein offener Befund der Klasse „Datenverlust/Falschzuordnung" |
| M3 | Go-live-Gate | Ergebnisse aus B1, B2 (DSFA) und B4 liegen vor und sind eingearbeitet · OPS-001 positiv · jede Anbieterprüfung positiv **oder** die Funktion abgeschaltet · ADR-007 sieben Vorbedingungen · kein Register-Eintrag Datenschutz/Recht auf `offen` oder `entschieden (Jannes)` · Restore-Test 1 und 2 · Deployment aus Tag mit Freigabe · Redaction-Prüfung grün · Betriebsdokumentation (13 Positionen) · OPS-007 gegen die Test-Umgebung geprobt · Rückfallplan unterschrieben · Messrunde nach `OPTIMIERUNG.md` |
| M4 | Produktionssystem steht | Produktivprojekt in freigegebener EU-Region aus dem freigegebenen Tag · OPS-007 durchlaufen · keine synthetischen Daten · Backup, Monitoring und Release-Takt nach BETRIEB-001 aktiv |
| M5 | Eröffnung | **Juli 2027.** Probewoche 2 durchlaufen · Restore-Test 3 · Change-Freeze eingehalten · Datenschutzinformation und Behandlungsvertrag nennen alle Auftragsverarbeiter · erster Behandlungstag läuft mit der Software |
| M6 | Erster Betriebsmonat | Vier Wochen ohne Befund der Klasse „Datenverlust/Falschzuordnung" · Störfallliste ausgewertet · Optimierungsrunde durchgeführt |

---

## Abweichungsregeln

1. **Abnahme-Rückstand.** Warten mehr als **zehn** fertige Epics auf ihre
   Abnahme, ist jede zweite Session eine Abnahme (Aufruf „Abnahme" unten), bis
   der Rückstand unter fünf liegt. Stand 2026-09-22: **über 30** — die Regel
   greift sofort. Abgenommen wird je Etappe am Stück
   ([`../abnahme/README.md`](../abnahme/README.md)), lokal mit
   `supabase start`: Die Test-Umgebung kommt erst mit Block 12, und die
   Sichtprüfung hinter der Anmeldung wartet nicht so lange.
2. **Das Bauen dauert länger.** Der Umfang wird nicht gekürzt (Jannes,
   2026-09-22). Die Anfragen gehen erst nach M2 heraus. Steht M4 zur Eröffnung
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
| R1 | **Die Prüfungen kommen zu spät für Juli 2027.** B2 mit DSFA und B1 brauchen erfahrungsgemäß vier bis sechs Monate; sie beginnen erst mit M2 | hoch | sehr hoch | M2 ist ein halbes Jahr vor der Eröffnung (etwa Januar 2027) nicht in Sicht | DSFA-Paket und Anfragen in Block 10 fertig vorbereiten, damit sie am Tag nach M2 hinausgehen; Rückfall H4. **Option für Jannes:** §15.2 erlaubt, die Anfragen jederzeit früher zu schicken, ohne dass das Bauen wartet |
| R2 | Providerprüfung Supabase negativ — und das erst nach M2 | niedrig | sehr hoch | Gate-Punkt 3 (§203 Abs. 4 StGB) unbeantwortet | Nähte eines Wechsels in Teil 7 von [`../decisions/providerpruefung-supabase.md`](../decisions/providerpruefung-supabase.md); die Unterlagen aus Teil 9 zu laden kostet nichts und ist keine Anfrage |
| R3 | Jannes' Zeit reicht nicht für Abnahmen — **eingetreten** (über 30 Epics seit 2026-09-12 ohne Abnahme) | eingetreten | hoch | Fortschrittstabelle ohne Abnahmedatum | Abweichungsregel 1; Abnahme je Etappe am Stück |
| R4 | Der Umfang ist rund dreimal so groß wie in 5.49 | hoch | hoch | Block 4 beginnt nicht, während Block 2 noch offen ist | Reihenfolge nach Grundsatz 3 (Komfort zuletzt); Loops klein schneiden; Tempo im Wochenupdate zählen |
| R5 | Die Plattform öffnet die Anwendung nach außen (Konten für Patient:innen und Kund:innen) | mittel | sehr hoch | ein Portalpfad ohne Negativfall in `pnpm test:db` | ADR-023 vor dem ersten Loop; jede Portalsicht mit Negativfall „fremde Person"; Zweitreview Pflicht (ADR-013 Punkt 9) |
| R6 | Befunde aus der Abnahme kommen als Welle | hoch | mittel | Rückstand wächst | Abweichungsregel 1; Befunde als erste Story der nächsten Loop derselben Etappe |
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
  FIX-EPIC-001. Offen ist allein **M1** selbst (Abnahme und E2E-Fall).
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
| **G19** | Das Dokumentationsgate prüft, ob Aussagen über andere Dokumente stimmen (BEF-028) | Verweise auf ADR-Fassungen und Prinzipienversionen gegen den Stand, `§NN` gegen vorhandene Abschnitte, Eindeutigkeit der `ANN-`/`BEF-`/`IDEA-`-Nummern; Nennungen in Änderungsvermerken bleiben erlaubt |
| **G6a** | Jede Abweisung ist nachweisbar | Die übrigen rund 80 Abweisungen (`not allowed to …`) schreiben einen `denied`-Eintrag, der die Abweisung überlebt — zuerst klären, welche der Monatsreport (ADR-010 Punkt 6) sehen muss. **Vor** Training und Plattform, weil beide Dutzende neue Abweisungspfade bringen |

### Block 2 — Kern fertig

**Etappe T, Rest.** Zuschnitt in [`MAP-LOOPS.md`](MAP-LOOPS.md). Gebaut wird
mit synthetischen Adressen; das Gate aus ADR-019 Punkt 9 steht vor dem
Scharfschalten, nicht vor dem Bau (ADR-019 Fassung 4, §15.2).

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **MAP-006** | Die Tagesroute liegt auf der Karte, mit Route, Fahrzeiten und Erreichbarkeit im Kalender | Koordinaten bei der Adresse (ANN-016), Startort je Tag, Route und Fahrzeiten, Tourenliste druckbar, Handoff mit Koordinaten; **Fahrpuffer aus §8.1** mit Aufrundungsregel als Testfall (09:05–10:05 plus 12 Minuten ergibt 10:20) und Warnung bei Unterschreitung (E12 Punkt 3 und 4); ersetzt die Vorschau `/touren` | `IDEA-PRX-017`, `-029`, `-032` |

**Etappe 2 — Befund.** Plan, Phasen und Vorentscheidungen in
[`FRB-BAUSTEINE-UND-SCORES.md`](FRB-BAUSTEINE-UND-SCORES.md); Material in
[`../../quellen/README.md`](../../quellen/README.md). Zur Eröffnung ist jede
Patientin eine Neuaufnahme — deshalb gleich nach der Tagesroute.

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **FRB-EPIC-001** | Die Instrumente liegen als versionierte Bibliothek mit Lizenzfeld vor | Instrumentenbibliothek (P1-Schema aus FRB-EPIC-000), freie Instrumente NRS und PSFS, globale Veränderungsfrage; berechnen ja, bewerten nein | `IDEA-OUT-001`, `-003`, `-004` |
| **FRB-EPIC-002** | Anamnese und Verlauf stehen in der Akte | Anamnesebogen nach §7 in der Praxis ausfüllbar, Red Flags nach §7.1 hervorgehoben, Verlauf mit Ereignismarkierungen ohne Bewertung, Körperschema im Befund; B8 als Annahme | `IDEA-OUT-005`, `IDEA-PRX-027` |
| **FRB-EPIC-003** | Der Befund entsteht aus Bausteinen zum Abhaken, mit fertigem Dokumentationstext | Phasen P2 und P3 des FRB-Plans: neun Regionen als Daten (Zähltest), Renderer mit Live-Vorschau des Texts, Textbausteine auch im Befund, ein Bild ruft den Test in Erinnerung | `IDEA-PRX-043`, `IDEA-OUT-009` |
| **DOK-005** | Ein Therapiebericht an die Verordner:in entsteht aus Befund und Verlauf | Bericht als Druckansicht (B14 Weg 1), Inhalt nur übernommen, nicht interpretiert (§17); dazu die **Empfehlung zum Verordnungsende** mit Quelle und Datum (Wiedervorlage aus VER-EPIC-002, ANN-014) | `PROJECT_PRINCIPLES.md` §4.2 |

**Etappe P — Praxisverwaltung.** Die Ideen aus
[`../product/ideen/10-praxisverwaltung.md`](../product/ideen/10-praxisverwaltung.md),
die den Tag erleichtern. Der Komfortteil steht als PRX-EPIC-004 in Block 9.

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **PRX-EPIC-001** | Ein freier Platz findet eine Patientin, nicht umgekehrt | Warteliste mit Zeitfenstern und Nachrücken, automatische Terminsuche als Vorschlagsliste, Gebietstage für die Terminvergabe | `IDEA-PRX-003`, `-008`, `-031` |
| **PRX-EPIC-002** | Am Termin steht, was man vor der Tür wissen muss | Tagesplan als Startseite, Vertretungs-Kurzblick (aufklappbar, auditiert), „Mitnehmen" aus den letzten Befunden, Abrechnungslage und Verordnungszähler am Termin, Termin abhaken mit Heilmittel und Kontingent | `IDEA-PRX-034`, `-016`, `-035`, `-037`, `-009`, `-039` |
| **PRX-EPIC-003** | Nichts fällt durch | Aufgaben und Wiedervorlagen mit Patientenbezug, Anrufliste für morgen mit gespeichertem Stand, Dublettenprüfung und Zusammenführen, Verordnung per Kamera, Erinnerung am Rezeptende und an den vergessenen Abschluss | `IDEA-PRX-019`, `-005`, `-041`, `-018`, `-023`, `IDEA-LZK-007`, `-009` |

### Block 3 — Etappe TR: Trainingsbereich

**Freigegeben seit `PROJECT_PRINCIPLES.md` 0.16 §14** (2026-09-22). Etappe L
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
Übernommen werden Umfang und Ablauf, nie Text, Symbol oder Gestaltung.

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
getrennt (§4.8). Vor dem ersten Loop steht **ADR-023** (Docs-Session): Konten
externer Personen neben den Praxisrollen, Einladung und Zustellweg (R8),
Identitätsprüfung und Vertretung (B5 als Annahme, reversibel an einer Stelle),
Sitzungsregeln, RLS-Muster „nur eigene Daten", Abgrenzung zur Praxisoberfläche.

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **POR-EPIC-001** | Eine Patientin oder Kund:in hat einen eigenen Zugang, der nur ihre Daten zeigt | Konto zu Person, Einladung aus der Akte bzw. dem Trainingsverhältnis, Anmeldung, Sperren und Entziehen ohne Wirkung auf die Akte; Negativfall „fremde Person" für jede Sicht | `IDEA-LZK-001` |
| **POR-EPIC-002** | Die eigene Sicht zeigt Termine, Rechnungen und freigegebene Dokumente | Termine mit Anfrage und Änderungswunsch, eigene Rechnungen, freigegebene Dokumente (ADR-017), Übersicht „was zu tun ist" | §4.6, §4.10, `IDEA-ORG-001` |
| **POR-EPIC-003** | Einwilligungen, Export und Einstellungen liegen in der eigenen Hand | Einwilligung erteilen und widerrufen (auf PAT-006), Datenexport als Funktion, Onboarding mit Überspringen, Einstellungen mit sichtbarer Coach-Kontrolle, Oberfläche für 78-Jährige | `IDEA-QSN-003`, `IDEA-LZK-005`, `IDEA-QSN-005`, `-006` |

### Block 5 — Etappe 8: Angebote und Kund:innen

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **ANG-EPIC-001** | Eine Patientin kann die Plattform abonnieren, und die Praxis stellt es monatlich in Rechnung | Abo als wiederkehrende Leistung (Beginn, Kündigung, Laufzeit), Monatsrechnung im eigenen Rechnungswesen (ADR-009, kein Zahlungsdienst), Zugang zu den Abo-Bereichen folgt dem Abo-Status; Steuerkennzeichen der Leistung als Annahme (B4) | Jannes 2026-09-22; §14 in 0.16 |
| **ANG-EPIC-002** | Training wird als Paket verkauft, und die Plattform ist darin enthalten | Pakete mit Guthaben, Verbrauch und Verfall, Preise sichtbar bevor jemand fragt, Rückfall in die Heilbehandlung während eines Pakets | `IDEA-ANG-001`, `-003`, `-004` (B11 neu entschieden 2026-09-22) |
| **KND-EPIC-001** | Die Betreuung geht nach der Behandlung weiter, ohne dass Daten still mitwandern | Betreuungsepisode mit Typ, Zweckbindung beim Übergang (dokumentierte Kopie mit Einwilligung, ADR-021 Punkt 7), Voraussetzungsprofil der Kund:in, Offboarding | `IDEA-LZK-002`, `-003`, `-004`, `-006` |

### Block 6 — Etappe 3 und Etappe 6: Pläne und Rückfragen

**Keine automatische Anpassung**, keine Progression als Vorschlag — erfassen,
speichern, strukturieren, darstellen (ADR-006 Punkt 2, §17 Verbot 1).
Vor KOM-EPIC-003 steht **ADR-024** (Docs-Session): Offline-Erfassung und
Benachrichtigungen brauchen einen Service Worker; ADR-015 Punkt 16 schließt
ihn bisher aus und wird dort abgelöst, nicht umgangen. Web-Push läuft über die
Push-Dienste der Browserhersteller — ein Datenweg, den ADR-024 nach ADR-002
bewertet.

| Loop | Ergebnis | Zuschnitt | Quelle |
| --- | --- | --- | --- |
| **UEB-EPIC-001** | Es gibt eine Übungsbibliothek, die für Therapie und Training trägt | Übung und Variante getrennt, Achsen und Nachbarschaften, zwei Sprachebenen | `IDEA-TRN-005`, `IDEA-QSN-002`, `-007` |
| **UEB-EPIC-002** | Ein Plan wird zusammengestellt, zugewiesen und eingefroren | Plan mit Schnappschuss bei Zuweisung, Progression **von Hand** mehrdimensional und als doppelte Progression, Planlaufzeit mit Wiedervorlage; für `therapy` und `training` getrennt | `IDEA-TRN-004`, `-007`, `-011`, `IDEA-ORG-006` |
| **UEB-EPIC-003** | Der Plan ist dort, wo trainiert wird | Plan als PDF (voller Nutzen ohne Portal), Plan im Portal, Durchführungsansicht für die Einheit, Trainingstage im Kalender | `IDEA-ORG-003`, `-004` |
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
| **KI-EPIC-001** | Diktieren statt tippen, mit geprüftem Entwurf | Gateway nach ADR-005 mit `mock`-Adapter, Sprachdokumentation nach §6.3, Nutzung sichtbar; Anbieter C6 in Block 11 | `IDEA-KI-001`, `-005`, `-007` |
| **KI-EPIC-002** | Sprache umformen, ohne Inhalt hinzuzufügen | Freitext strukturieren, Patientensprache, Antwortentwürfe, Zusammenfassung ohne Bewertung — jeweils mit Quellenbindung und menschlicher Freigabe | `IDEA-KI-002`, `-003`, `-004` |
| **MAP-007** | Führung auf dem Gerät, ohne dass die Praxis die Position erfährt | Zuschnitt in [`MAP-LOOPS.md`](MAP-LOOPS.md); zuerst **E-24** (liefern die Radprofile Manöver? — ein Aufruf; ohne Ja entfällt das Epic) | `IDEA-PRX-044`, §20.1 |
| **PRX-EPIC-004** | Komfort für die Praxisführung | Kennzahlen, Export für die Steuerberatung (Format als Annahme bis B4), Farbcodierung je Terminart und Person, Kalender-Abo (Bedenken: ohne Namen), Planungskarte der aktiven Adressen (Bedenken), Kartenzahlung beim Hausbesuch hinter Adapter (Grundsatz 5) | `IDEA-PRX-025`, `-026`, `-021`, `-024`, `-033`, `-022` |
| **UI-001** | Feinschliff und Barrierefreiheit über alle Seiten (G17) | Feindesign, PWA-Manifest, Befunde aus den Ablaufrunden nach `OPTIMIERUNG.md` | — |

### Blöcke 10 bis 14 — vom Freeze bis zur Eröffnung

**Etappe G — Betriebsreife.** Die offenen Pakete, ohne Termine:

| # | Paket | Stand und Inhalt | Wer |
| --- | --- | --- | --- |
| G3 | OPS-001 Providerprüfung und Cloudprojekt | Dokument steht seit 2026-09-21, **nichts bestanden**. Nach M2: Unterlagen aus Teil 9, zwei Supportfragen, Gate-Punkte 1 bis 6 mit B2; **dann** Cloudprojekt in EU-Region, Dev/Test/Prod, PITR als Bedingung | Jannes (Anlage) |
| G5 | OPS-002 Deployment und Freigabe | Frontend-Hosting mit Prüfung nach ADR-002, Release aus Tag, Migrationen nur über die Pipeline, Rollback, Review-Checkliste aus ADR-013 in der Pipeline, **Test-Umgebung** | Claude, Jannes (Freigabe) |
| G6 | OPS-004 Rest | Alarmierung, Security-Log 12 Monate, Erkennung für Art. 33, Audit-Abfrage als Runbook — setzen G3 voraus | Claude |
| G7 | OPS-003 Backup und Restore | PITR, Sicherung des Objektspeichers (eigener Weg, RPO ≤ 1 h), dreistufige Wiederherstellung, Notfallzugang, Betriebsdokumentation mit 13 Positionen | Jannes und Claude |
| G10 | E2 Ausfallkonzept | Praxisprozess für einen Tag ohne Anwendung (ADR-012 Punkt 8), eine Seite; die Tagesliste der Übersicht ist die Bereitstellung (ANN-021 Fassung 2). Zugleich Rückfallplan H4 | Jannes |
| G11 | OPS-007 Bootstrap | Runbook und Funktion gebaut, lokal geprobt; Probe gegen die Test-Umgebung nach G5 | Jannes (Durchlauf) |
| G12 | ADR-019 Gate | Vertragscheck PTV Developer (Punkt 9), Paid Plan und Server-Schlüssel, DSFA-Wiedervorlage | Jannes mit B2 |
| G13 | Steuerliche Grundeinstellungen | Umsatzsteuer-Status, Wortlaut des Befreiungshinweises, Kürzel `RG`/`TR`, ermäßigter Satz, Steuer auf Abo und Pakete, echte Preise — bis dahin Annahmen (ANN-074/075/082) | Jannes mit B4 |
| G14 | DSFA-Paket | Schwellwertprüfung, VVT, TOM mit Endgeräte-Richtlinie, Löschkonzept, Subprozessoren, Datenschutzinformationen, Betroffenenrechte, Breach-Prozess, Nachweistabelle MUSS → Test, Zweckbestimmung — **Entwurf in Block 10**, Prüfung in Block 11 | Claude (Entwurf), Jannes, B2 |
| G15 | B1 Regulatorische Prüfung | Zweckbestimmung, MDR-Abgrenzung, EU AI Act — über den **ganzen** V1-Umfang | Jannes, extern |
| G16 | BETRIEB-001 | Störungsmeldung, Triage, Hotfix-Weg, Release-Takt nach M4, Change-Freeze um M5, Endgeräte, Vertretung | Jannes mit Claude |
| G18 | Go-live-Gate (M3) | Kriterien siehe Meilensteine | Jannes |

**Etappe H — Eröffnung.** H1 **Probewoche 1** (Block 10, lokal im Netz der
Praxis am Telefon, eine Praxiswoche aus dem Seed, eine zweite Person) · H2
Kurzanleitung „erster Tag", Schulung je Rolle · H3 Produktionssystem (M4) ·
H4 **Rückfallplan**: Tagesliste morgens öffnen (ANN-021 Fassung 2),
Papierdokumentation mit Nachtrag binnen 24 h, **Rechnungen ruhen** (keine
handschriftliche Nummer, eine Nummernlücke nach §14 UStG ist nicht heilbar),
Abbruchkriterien, Export nach G9 · H5 **Probewoche 2** auf der Test-Umgebung
mit dem Eröffnungsstand · H6 Eröffnung (M5) mit Change-Freeze, Restore-Test 3,
Störfallliste ab Tag 1 · H7 erster Betriebsmonat (M6).

---

## Entscheidungen und Prüfungen

### Externe Prüfungen — nach M2

Gehen gebündelt hinaus, wenn M2 erreicht ist; bis dahin trägt jeweils die
genannte Festlegung. Wortlaut der Anfragen: [`../decisions/ANFRAGEN.md`](../decisions/ANFRAGEN.md).

| Punkt | Gegenstand | Wer | Bis dahin trägt |
| --- | --- | --- | --- |
| OPS-001 | Supabase: zwölf Gate-Punkte, Objektspeicher, Edge Runtime | Jannes, Support | [`providerpruefung-supabase.md`](../decisions/providerpruefung-supabase.md) |
| B2 | DSFA-Schwellwert, DSB, DSFA über den ganzen Umfang; E15, Einwilligung im Training, Office-Sicht (§4.8), Screening-Frist, Handoff und Führung (ADR-019 Punkt 23, §20.1), Plattform, Ernährung | externe Datenschutzberatung | vorläufige Festlegungen und Register |
| B1 | Zweckbestimmung, MDR-Abgrenzung, EU AI Act; B10 mit | externe Prüfstelle | ADR-006, §17, Register `src/app/mdr.ts` |
| B4 | Steuer: Leistungsarten, § 19 UStG, Nummernkreise, ermäßigter Satz, Abo, Pakete, E14 Fall 1, Belegfristen, Gewinnermittlung (B9, ANN-088) | Steuerberatung | ANN-074/075/082/088 |
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
- **Abnahmen** nach Abweichungsregel 1; offen sind unter anderem MAP-003,
  MAP-004 (Schritte in [`../abnahme/etappe-t-kartendienst.md`](../abnahme/etappe-t-kartendienst.md))
  und MAP-005 Teil B am Telefon (Wegpunktlimit, `MAX_ZWISCHENZIELE` bleibt bis
  dahin bei drei).
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
  (`api.myptv.com` aus der Cloud gesperrt) — Schritt 1 der MAP-004-Abnahme.
- **Vor der ersten echten Datei:** `tests/e2e/authenticated/patient-file-access.spec.ts`
  regelmäßig gegen die Test-Umgebung laufen lassen (ANN-052).
- **Kleine Wartung:** `supabase/config.toml` Abschnitt `[inbucket]` nach
  `[local_smtp]` umbenennen.

---

## Sessions starten

Die Reihenfolge ist verbindlich (E-15), einen Kalender gibt es nicht.

1. **Vorher:** `git pull --ff-only origin main`, dann [`../STATUS.md`](../STATUS.md).
2. **Aufruf:** genau einen Aufruf aus der Tabelle, als erste Nachricht. **Ein
   Thema je Session.** Welchen Pfad ein Auftrag nimmt — Loop oder Sandbox —,
   sagt die Klassifikation K1 in [`GRAPH-ENGINEERING-WORKFLOW.md`](GRAPH-ENGINEERING-WORKFLOW.md).
3. **Nachher:** den Bericht lesen, Fragen mit je einem Satz beantworten („wie
   empfohlen" reicht). Merge und Abnahme nach der „Definition of Done".
4. **Montags** sagt das Wochenupdate, was fällig ist. Es liest `main`.

Antworten am besten mit Kennung (`B4: liegt vor, Ergebnis …`), Entscheidungen
als „entschieden: …", Ideen als „Idee: …".

| Zweck | Aufruf (kopieren, nichts ergänzen) |
| --- | --- |
| Code-Loop | `/feature-loop <Kennung> <Titel>` — die erste Aufgabe aus `STATUS.md`, zum Beispiel `/feature-loop MAP-006 Tagesroute nach docs/development/MAP-LOOPS.md` |
| Abnahme | `Abnahme <Etappe> nach docs/abnahme/<Datei>: ich gehe die Schritte durch, du trägst Befunde und das Datum ein. Nichts bauen.` |
| Docs-Session ADR | `Docs-Session ohne Code: ADR-NNN <Thema> schreiben. Vorgaben: docs/development/ROADMAP.md, <Zeile>, und die dort genannten ADRs. Am Ende die Bestätigungsfragen für Jannes als Liste mit Empfehlung.` |
| Docs-Session Providerprüfung | `Docs-Session ohne Code: Providerprüfung <Anbieter> nach dem Prüfkatalog aus ADR-002 Punkt 3 als Dokument in docs/decisions/. Aufbau wie providerpruefung-supabase.md. Keine Cloud-Ressource anlegen, nichts raten.` |
| Ablaufrunde | `Ablaufrunde <Bereich> nach docs/development/OPTIMIERUNG.md` |
| Befund | `Befund: <Beobachtung, Bereich, Rolle>. In docs/development/BEFUNDE.md eintragen, nicht bauen.` |
| Sandbox | `/sandbox <Thema>` — Oberflächen-Prototyp (Pfad S); endet mit „übernehmen oder verwerfen" |
| Zweitreview | `Zweitreview <Loop-Kennung>: den Diff des offenen Pull Requests gegen die Review-Checkliste aus ADR-013 Fassung 2, Punkt 9 lesen. Befunde als Einzel-Story-Loop vorschlagen, nichts bauen.` — Pflicht, sobald der Loop-Bericht A5 als ausstehend nennt |
| Antworten eintragen | `Docs-Session ohne Code: meine Antworten und Abnahmen in docs/development/ROADMAP.md und docs/decisions/OPEN_DECISIONS.md einarbeiten. Antworten: …` |
| Idee | `Ideenspeicher: <Idee in zwei Sätzen>. Nur eintragen, nicht bauen.` |
| Roadmap prüfen | `Planungssession ohne Code: Gesamtstand prüfen (git fetch, Branches, Pull Requests), docs/development/ROADMAP.md gegen den Stand nachstellen, nächsten Loop vorschlagen. Nichts bauen.` |

---

## Definition of Done

**Je Story:** vertikaler Schnitt, Tests, Abnahmeschritte in `docs/abnahme/`,
Registereinträge (Skill-Schritt D), Oberflächen-Checkliste abgehakt
(`docs/abnahme/README.md`). **Je neue Tabelle zusätzlich:** Datenklasse und
Frist als `COMMENT`, Löschpfad in LOE-002, ein `test:db`-Fall, der die Löschung
dieser Klasse prüft. **Je Portalsicht zusätzlich:** Negativfall „fremde
Person" in `pnpm test:db`.

**Je Epic:** Checks nach Skill-Schritt H · Fortschrittstabelle, `fortschritt.json`
und `STATUS.md` nachgestellt · **Jannes mergt nach grüner CI**; steht ein
Zweitreview (A5) aus, erst danach · Abnahme nach Abweichungsregel 1 (Datum in
der Fortschrittstabelle) · Befunde nach `BEFUNDE.md` und als erste Story in
den nächsten Loop derselben Etappe.

**V1 fertig (M2):** alle Etappen der Blöcke 1 bis 9 abgenommen; jede Funktion
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

5. **`STATUS.md` zuerst, dann „Ziel und Umfang" und die Zeile der Etappe**
   in dieser Roadmap.
6. **Die im SPEC benannten ADRs vollständig** — mindestens alle, die der Loop
   berührt. Bei RLS, Löschung und Abrechnung sind das mehr als zwei.
7. **Höchstens eine Ideenspeicher-Datei** je Loop, nach dem Index in
   `IDEENSPEICHER.md` — die, auf die die Spalte „Quelle" zeigt.
8. **Keine Subagenten** außer bei echt breiter Suche und für den Zweitreview
   in frischem Kontext (ADR-013 Fassung 2, Punkt 9, Nr. 8; Gate A5).

**Verifikation**

9. Während der Entwicklung nur die eng betroffenen Checks; die vollständige
   Runde **einmal** am Ende (Skill-Schritt H).
10. Keine identischen teuren Läufe ohne Änderung dazwischen.
11. `pnpm test:db` bei Migrationen und Policies — auch in der Cloudumgebung.
12. **Zweitreview** vor dem Merge nach ADR-013 Fassung 2, Punkt 9, Nr. 8.

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

Auftrag für die wöchentliche Planungssession. Sie **baut nichts.**

1. `docs/STATUS.md`, diese Datei, `ARBEITSBEREICHE.md` §2 und
   `git log --since='8 days ago' --oneline` lesen.
2. Feststellen, welche Loops seit dem letzten Update fertig **und abgenommen**
   wurden; den Abnahme-Rückstand zählen (Abweichungsregel 1).
3. Die erste Aufgabe aus `STATUS.md` nennen und prüfen, ob sie zur Kette passt.
4. Prüfen, ob ein Meilenstein erreicht ist. **Termine gibt es nicht zu
   prüfen** — mit einer Ausnahme: R1, ob M2 rechtzeitig vor der Eröffnung in
   Sicht ist.
5. Antwort in festem Format, höchstens zwölf Zeilen: _was als Nächstes ansteht ·
   Abnahme-Rückstand · Jannes entscheidet oder liefert · M1 bis M6 je erreicht
   oder offen, mit dem fehlenden Kriterium in einem Wort_.
6. Die Tabelle „Sandbox-Prototypen" in `ARBEITSBEREICHE.md` §2 lesen und
   abgelaufene Prototypen nennen (ab zwei fertigen Code-Loops seit „Angelegt").

Die eingerichtete Routine beschreibt `docs/DEVELOPMENT.md`, „Wochenroutine".

---

## Fortschritt

Ein Loop ist **fertig**, wenn Skill-Schritt I durchlaufen ist, und
**abgenommen**, wenn Jannes die Schritte aus `docs/abnahme/` durchlaufen hat.
Ausführliche Vermerke je Loop bis 5.49: [`ROADMAP-CHRONIK.md`](ROADMAP-CHRONIK.md).
Neue Zeilen tragen nur Kennung, Status, Datum, Commits und Abnahme.

```bash
pnpm fortschritt            # eine Zahl bis M5, je Block
pnpm fortschritt --posten   # jeder einzelne Posten
```

`docs/development/fortschritt.json` gewichtet fünf Blöcke: **A** Kernprozess
(20), **B** V1-Ausbau (32), **C** Betriebsreife (18), **D** Eröffnung (12),
**E** Entscheidungen und Prüfungen (18). Software ist damit 52 Prozent statt
40 — der Umfang ist gewachsen, der Rest nicht kleiner geworden. Ein fertiger
Loop zählt `0,85`, die Abnahme holt den Rest; `vorläufig entschieden` zählt
`0,5`. Mit 6.0 fiel die Zahl von **48,9 auf 32,7 Prozent**
(Block B 6,2 Prozent): gerechnet, nicht geschätzt, und der Preis für einen
Nenner, der jetzt das Endprodukt enthält.

| Loop | Status | Fertig am | Commits | Abgenommen am |
| --- | --- | --- | --- | --- |
| PAT-001 bis PAT-004 | fertig | vor 2026-09-01 | PR #1 | |
| CAL-001 bis CAL-006 | fertig | vor 2026-09-01 | — | |
| STAFF-001 | fertig | 2026-08-30 | `e70775a`, `ca907e9` | |
| DOK-001 bis DOK-004 | fertig | 2026-09-05 | PR #5, `21d85dd`, `e931068` | 2026-09-11 |
| VER-EPIC-001 | fertig | 2026-09-07 | `2c3c1de` … `159c1bb` | 2026-09-11 |
| UI-000 | fertig | 2026-09-07 | `4a4440f` … `e6b4ab6` | 2026-09-11 |
| MAP-001 (Docs) | fertig | 2026-09-08 | PR #16 | — |
| UX-EPIC-001 | fertig | 2026-09-11 | PR #18 | 2026-09-11 |
| MARKE-001 | fertig | 2026-09-11 | PR #19 | 2026-09-11 |
| STAFF-EPIC-002 | fertig | 2026-09-11 | PR #20 | 2026-09-11 |
| LOE-EPIC-001 | fertig | 2026-09-11 | PR #25 | 2026-09-11 |
| ADR-018 (Docs) | fertig | 2026-09-11 | — | — |
| CAL-EPIC-003a | fertig | 2026-09-12 | PR #28 | 2026-09-12 |
| CAL-EPIC-003b mit CAL-012, CAL-013 | fertig | 2026-09-12 | `b2626ae`, `89ab30b`, `acddcc6` | |
| AKTE-000 bis AKTE-005 | fertig | 2026-09-12 | `77ab995`, `1c7219c`, `d9eda45` | |
| UI-002a bis UI-002d | fertig | 2026-09-12 | `bc2713a` … `ac1fcd7` | |
| UX-012a bis UX-012f | fertig | 2026-09-12 | `5d29756` … `dedb380` | |
| FIX-EPIC-001 | fertig | 2026-09-12 | PR #32 | |
| FIX-EPIC-003 | fertig | 2026-09-12 | `e05d34b`, `ebfe8e3`, `07fbbee` | |
| CAL-014, CAL-015 | fertig | 2026-09-12 | `f8c33ac` … `58b7a31` | |
| CAL-016, CAL-017, FIX-013, FIX-014 | fertig | 2026-09-13 | `b0bf149`, `10e439b`, `3ffd295`, `90ca0f6` | |
| DAT-EPIC-001 | fertig | 2026-09-13 | `84bec9b` … `fd10a37` | |
| Dokumentations-Audit (Docs) | fertig | 2026-09-13 | PR #39 | — |
| ROL-EPIC-001 | fertig | 2026-09-15 | PR #41 | |
| FIX-015 | fertig | 2026-09-15 | PR #42 | |
| CAL-018 | fertig | 2026-09-16 | `dc529a7`, `6a11fb0` | |
| FIX-EPIC-004 | fertig | 2026-09-18 | `14a1fa7` … `856a5ac` | |
| CAL-EPIC-004a, 004b, 004c | fertig | 2026-09-18 | `ee81ea7`, `e189183` … `1b132ea` | |
| UX-013, GRD-001 | fertig | 2026-09-18 | Chronik, Vermerke 5.10 und 5.11 | |
| VER-EPIC-002 | fertig | 2026-09-18 | `f734e55`, `ba19245` | |
| ABR-EPIC-001, 002a, 002b, 003 | fertig | 2026-09-19 | `3874e83` … `a1384ce` | |
| ABR-EPIC-004 | fertig | 2026-09-20 | `dfe96a8`, `d8f3ea4` | |
| LEI-EPIC-001 | fertig | 2026-09-20 | — | |
| FRB-EPIC-000 | fertig | 2026-09-21 | `0e988d5`, `53fd542`, `dc9c963`, `6dbe377` | |
| CAL-EPIC-005 | fertig | 2026-09-21 | `e268f96`, `0c8920c`, `120445f` | |
| ABR-EPIC-005, ABR-EPIC-006 | fertig | 2026-09-21 | `0fcac3e` … `6d6261f` | |
| MDR_REVIEW_REQUIRED verortet | fertig | 2026-09-21 | `2579e16`, `bdfb1b6` | |
| MAP-002, MAP-003 | fertig | 2026-09-21 | `c85c56e` … `d66ea31` | |
| CAL-027 | fertig | 2026-09-21 | `107fab1`, `b533b07` | |
| OPS-001 (Docs) | fertig | 2026-09-21 | `e7fcb00`, PR #87 | — |
| E18 Schritt 7 (Docs) | fertig | 2026-09-21 | `82429b5` | — |
| MAP-004 | fertig | 2026-09-22 | `ce5dbe4` … `0e27b4f` | |
| MAP-005 | fertig | 2026-09-22 | `cf03057`, `ef74eec` | Teil A 2026-09-22; Teil B offen |
| OPS-006 (minimal) | fertig | 2026-09-22 | `aa321d0`, `2e3ebc7` | |
| OPS-007 | in Arbeit (Probe gegen Test-Umgebung offen) | 2026-09-22 | `a870992`, `f3b9497` | |
| OPS-004 Teil 1 und 2 | in Arbeit (Rest nach G3) | 2026-09-22 | `ff15f80` … `dcdb195` | |
| PAT-006 | fertig | 2026-09-22 | `4764d90`, `8569f3d`, `1706cb1` | |
| G10 Funktionsteil gestrichen (Docs) | fertig | 2026-09-22 | `a8478c3` | — |
| Roadmap 6.0 (Docs) | fertig | 2026-09-22 | dieser Commit | — |

---

## Änderungsvermerk

| Version | Datum | Änderung |
| --- | --- | --- |
| 6.0 | 2026-09-22 | **Neufassung.** Jannes hat den Umfang bis zur Eröffnung auf das Endprodukt erweitert (Plattform mit allen Punkten der Navigationsleiste einschließlich Ernährung, Portal-Abo als Monatsrechnung, Pakete für Training, Praxisbetrieb, alle Ideen aus dem Ideenspeicher) und die externen Prüfungen hinter den Feature-Freeze gelegt, ohne Kürzung bei Verzug. Neu: „Ziel und Umfang" mit „Nicht in V1" (was an §14, §17, ADR-014/015 scheitert), sechs Grundsätze der Reihenfolge, Kette in 15 Blöcken, Meilensteine M1 bis M6 neu gefasst (M0 entfällt, M2 heißt „Software fertig"), Abweichungsregel 1 zum Abnahme-Rückstand, Risiken neu (R1 späte Prüfungen, R3 eingetreten, R5 Plattform, R8 Mailversand), Etappen 2, P, TR, 3 bis 8, 10 und Betrieb geschnitten; MAP-006 widerspruchsfrei nach ADR-019 Fassung 4; Termine aus Etappe G, H und Spur B entfernt; Chronik und ausführlicher Fortschritt nach [`ROADMAP-CHRONIK.md`](ROADMAP-CHRONIK.md). Dazu `PROJECT_PRINCIPLES.md` 0.16 (§14), B9, B11 und B15 in `OPEN_DECISIONS.md`, `fortschritt.json` mit neuen Blöcken. |

Ältere Vermerke: [`ROADMAP-CHRONIK.md`](ROADMAP-CHRONIK.md).
