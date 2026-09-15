# Optimierung der Arbeitsbereiche

Stand 2026-09-13 · Steuerungsdokument ohne Inhaltsrang, wie `ROADMAP.md`.

> **Eingefroren bis Probewoche 1** (Entscheidung Jannes, 2026-09-13, nach der
> Abbruchregel in Abschnitt 12: die Runden „Kalender vor CAL-EPIC-003a" und
> „Patient:innen nach VER-EPIC-001" sind nicht gelaufen). Bis dahin gelten
> weiter: der Praxistest-Bogen vor jedem Loop mit Oberfläche, die
> Oberflächen-Checkliste (`docs/abnahme/README.md`) und das Praxistagebuch.
> Befunde an der laufenden Anwendung sammelt
> [`BEFUNDE.md`](BEFUNDE.md). Scorecard und Ablaufkarten ruhen; die
> Scorecard unten ist der Schätzstand vom 2026-09-06, **vor** UX-EPIC-001,
> CAL-EPIC-003 und den Umbauten vom 12.09., und wurde nicht nachgemessen.

**Zweck.** Dieses Dokument sagt, wie die Arbeitsbereiche und Oberflächen der
Praxissoftware gemessen und verbessert werden: in **Ablaufrunden** je Bereich,
mit Jannes' Beobachtung als Eingabe und Roadmap-Zeilen als Ausgabe. Es hält
die Scorecard über alle Bereiche und die Vorlagen, die eine Runde braucht. Es
füllt die Roadmap-Einträge „Befunde aus der Abnahme" und `UI-001` mit
Befunden — es ersetzt sie nicht und stellt nichts daneben.

**Was es nicht ist.** Kein Rang in der Dokumenthierarchie, kein ADR, kein
Skill, kein Auftrag. Es begründet **nie** Scope: ein Zielwert wird verbindlich,
wenn der SPEC-Schritt eines Loops ihn als Akzeptanzkriterium übernimmt. Es
führt **keine zweite Reihenfolge**: die Scorecard misst, die Roadmap ordnet;
Rundentermine stehen nur im Rückwärtsplan. MUSS-Anforderungen aus Prinzipien
und ADRs (RLS, Audit, Löschung) werden nie gemessen oder gewichtet.

---

## 1. Grundprinzip

Die Einheit ist der **Ablauf**: ein Job, den eine Rolle an einem Tag erledigt,
vom Auslöser bis „fertig" — nicht der Bildschirm, nicht die Funktion.
„Verordnung so einplanen, dass die Termine in die Touren passen und die
Patientin Bescheid weiß", nicht „Termin anlegen".

**Exzellent** heißt: die häufigste Aufgabe eines Bereichs gelingt unter den
Bedingungen des Betriebs — auf dem Rad, mit einer Hand, in der Sonne, im
Funkloch, nach einem Anruf mittendrin, beim ersten Mal und beim hundertsten.

Der eigentliche Befund ist die **Bruchstelle**: jede Stelle, an der der Ablauf
die Software verlässt (Zettel, Anruf, Kopf, Karten-App) oder dasselbe Datum
zweimal eingegeben wird. Sekunden und Taps sind das Thermometer; „gestockt
bei …" schlägt jede Zahl. Abläufe werden je Rolle geschnitten (ADR-004), auch
solange Jannes alle Rollen trägt.

## 2. Die sechs Bedingungen

Jeder Ablauf wird gegen sechs Bedingungen geprüft. Die Schwellen hängen von
der Häufigkeit ab: **täglich** (Gewicht 3), **mehrmals wöchentlich** (2),
**monatlich oder seltener** (1). Schwellen sind Alarmgrenzen, keine Ziele.

| Kürzel | Bedingung | Messgröße | Wer misst, wie | täglich | wöchentlich | selten |
| --- | --- | --- | --- | --- | --- | --- |
| **Z** Zeit | schnell genug | Sekunden (dritter Lauf) · Taps · Bruchstellen | Jannes mit Stoppuhr am lokalen Stand; Claude zählt Taps aus dem Klickweg in `docs/abnahme/` | ≤ 60 s · ≤ 8 · 0 | ≤ 180 s · ≤ 20 · ≤ 1 | ≤ 600 s · ≤ 40 · ≤ 1 |
| **H** Hand | einhändig am Telefon | Primäraktion mit dem Daumen erreichbar, kein Zoom, Tippziele ≥ 44 px, 375 px ohne Querscrollen | Jannes im Stehen am eigenen Telefon; E2E bei 375 px | ja | ja | nur „unterwegs" |
| **L** Licht | lesbar draußen | Kontrast der Tokens ≥ 4,5:1, Bedeutung nie nur in Farbe, Schrift ≥ 12 px | Kontrast-Test der Tokens; Blick in der Sonne beim Schattentag | ja | ja | ja |
| **N** Netz | nichts geht verloren | Eingabe übersteht Sperren, Anruf, App-Wechsel, Funkloch, Neuladen; Zustand sichtbar; Wiederholen möglich | Unterbrechungstest und Ladeprobe durch Jannes; E2E mit `setOffline` mitten in der Eingabe | 0 Verlust | 0 Verlust | 0 Verlust |
| **S** Schulung | ohne Erklärung gefunden | Praxistest-Bogen: ohne Hilfe geschafft, kein unverstandenes Wort; ab dem Kollegin-Test das Erster-Tag-Protokoll | Jannes, später eine Kollegin mit Seed-Daten | ohne Hilfe | ohne Hilfe | mit Klickanleitung |
| **F** Fehler | Irrtum ist billig | Sekunden bis zum korrekten Zustand nach einer Fehlerpfad-Aufgabe; Irreversibles nur mit Rückfrage; Meldung sagt, was zu tun ist | zwei Fehlerpfad-Aufgaben je Bereich im Praxistest | ≤ 30 s | ≤ 60 s | ≤ 120 s |

**Score je Ablauf (0–3):** 3 = alle sechs erfüllt · 2 = eine verfehlt · 1 =
zwei oder drei verfehlt · 0 = mehr als drei verfehlt oder in der Software
nicht durchführbar. Nicht geprüft steht als `?` und zählt als verfehlt.
**Reibung** = Gewicht × (3 − Score); **Bereichsreibung** = Summe über die
Abläufe. Sie beantwortet zwei Fragen — welcher Bereich zuerst, und ist es nach
dem Epic besser geworden — und mehr soll sie nicht.

**Harte Kriterien** — ein „nein" zieht den Score auf höchstens 1:

- **Mobil einhändig.** Ein Ablauf „unterwegs" geht mit einer Hand bei 375 px,
  im Stehen, ohne Zoom.
- **Rolle kann es allein.** Ohne `owner`-Hilfe und ohne Anruf im Büro.
- **Nicht langsamer als Papier.** Ein täglicher Ablauf dauert in der Software
  nicht länger als heute ohne sie; der heutige Weg wird dafür einmal gestoppt.

**Evidenzstufe** an jeder Zahl: **gezählt** (Strichliste, Störfallliste,
Auditlog-Summe), **gemessen** (Stoppuhr, Playwright), **geschätzt** (aus
Abnahmeschritten und Code, ohne Lauf). Geschätztes ordnet ein, begründet nie
ein neues Epic und wird durch die nächste Messung ersetzt. Eine Messung gilt
nur aus einer Session, die nicht gebaut hat.

## 3. Ablauf einer Runde

### Vorbereitung durch Jannes (60–120 min, ohne Claude)

1. **Ist-Beschreibung „heute ohne Software"** — nur in der ersten Runde des
   Bereichs. Fünf Zeilen je Ablauf: Auslöser, Reihenfolge, wo Zettel, Telefon
   oder Kopf einspringen. Das kennt nur Jannes.
2. **Stoppuhr-Szenarien** am lokalen Stand mit Seed-Daten, je Ablauf aus dem
   Bogen der Ablaufkarte. Erster und dritter Lauf: Zeit, Taps, „gestockt bei".
   Abläufe „unterwegs" am Telefon, eine Hand, im Stehen.
3. **Praxistest-Bogen** (Abschnitt 8) mit zwei Fehlerpfad-Aufgaben und je
   mobilem Ablauf einem Unterbrechungstest (Abschnitt 7).
4. Einmal je Bereich den **heutigen Weg** stoppen.
5. Ergebnis als Text in die Session einfügen. Kein Name, keine Patientendaten,
   keine Datei, kein Commit.

### Session durch Claude (Docs-Session, kein Code)

Aufruf über den Roadmap-Mechanismus „Parallel als Docs-Session":
`Ablaufrunde <Bereich> nach docs/development/OPTIMIERUNG.md`. Die Session
liest **genau fünf Quellen** und erkundet nichts: dieses Dokument · die
Ablaufkarte des Bereichs (falls vorhanden) · die Abnahmedatei(en) der
Bereichs-Loops in `docs/abnahme/` · die Roadmap-Zeilen des Bereichs ·
Jannes' Eingaben aus der Vorbereitung.

| Schritt | Inhalt |
| --- | --- |
| A Ist | Jannes' Beschreibung in die Ablaufkarte: Auslöser → Schritte → „fertig" |
| B Abläufe | schneiden oder nachschärfen: Job, Rolle, Häufigkeit, Kennzeichen „unterwegs"; höchstens acht je Bereich |
| C Sollpfad | Klickweg je Ablauf aus den Abnahmeschritten; Taps zählen; je Schritt drei Kreuze: Kontakt ist Aktion? Eingabe geschützt? Einhändig? Ohne Abnahmeschritt gilt „nicht durchführbar" |
| D Messen | sechs Bedingungen, Score, Reibung, Evidenzstufe je Zahl |
| E Bruchstellen | je Ablauf jede Bruchstelle mit Kennung (`TT-02.B3`) und Ursache |
| F Zuordnen | jede Bruchstelle bekommt genau ein Ziel (unten); `OPEN_DECISIONS.md` nur per Suche nach der Kennung |
| G Roadmap-Diff | als **Vorschlag**: Akzeptanzhinweise an bestehende Epics, höchstens ein neues Epic, Beobachtungsaufträge für die nächste Messrunde |
| H Bericht + Stopp | zehn Zeilen: Bereichsreibung, drei schlimmste Bruchstellen, was in die Roadmap soll, drei Fragen an Jannes |

Ausgabe: `docs/development/ablaeufe/<bereich>.md` (entsteht erst in der Runde
des Bereichs, nie vorab), eine Zeile je Ablauf in der Scorecard, der
Roadmap-Diff. Ein Commit (`docs: Ablaufrunde <Bereich> Runde N`). Kein Code.

### Ein Ziel je Bruchstelle

| Ziel | Wann | Wohin |
| --- | --- | --- |
| 1 Akzeptanzhinweis | ein geplantes Epic deckt die Stelle, ihm fehlt nur das Kriterium | Roadmap-Zeile des Epics: „Ablaufkarte TT R1: AC aus TT-02.B2"; Text in der Ablaufkarte |
| 2 Neues Epic | kein Epic deckt die Stelle; Score 0 **und** Gewicht 3 **und** Evidenz gemessen → Stufe 1, sonst Stufe 2 | Etappentabelle der Roadmap, mit Ablauf-Kennung |
| 3 Idee | Schließung wäre nett, Reibung gering | Ideenspeicher, Status `vorschlag` |
| 4 Entscheidung | Schließung braucht B6, B7 oder eine andere offene Entscheidung | Verweis auf `OPEN_DECISIONS.md`; Beobachtungsauftrag für die Messrunde |
| 5 Praxisprozess | kein Softwarethema — die Patientin anrufen bleibt ein Anruf | in der Ablaufkarte als „akzeptiert", sonst nirgends |

**Scope-Bremse.** Eine Runde trägt **höchstens ein** neues Epic in Stufe 1
ein. Alles Weitere schärft bestehende Epics oder geht nach Stufe 2. Die Runde
widerspricht dem Rückwärtsplan nur, wo die Messung es erzwingt; jede
Roadmap-Änderung ist ein Diff, den Jannes freigibt.

**Zielzeile als Akzeptanzkriterium.** Ein Akzeptanzhinweis nennt die Zielzeile
des Ablaufs: „TT-02 erreicht Score ≥ 2 nach CAL-EPIC-003". Objektiv prüfbar
sind Taps (Playwright zählt sie im Seed-Szenario) und die Prüfungen aus
Abschnitt 5 — sie werden Akzeptanzkriterium; Sekunden gehören in den
Abnahmeschritt als Prüfschritt mit Zahl. Der Loop liest die Ablaufkarte nicht;
die Roadmap-Zeile trägt alles, was er braucht.

### Nachher, Jannes (10 min, im Chat)

Drei Fragen: Stimmt die Reihenfolge der Bruchstellen? Welche tut im Alltag am
meisten weh? Was fehlt? Dann den Roadmap-Diff freigeben oder je Zeile
widersprechen. Wird in derselben Session eingearbeitet; danach Session-Ende.

### Messrunde (alle Bereiche, eine Session)

Nur Schritt D und H, für alle Bereiche mit Ablaufkarte; keine neuen Abläufe,
keine neuen Bruchstellen. Jannes liefert Stoppuhr-Werte und Praxistest-Bogen,
im Betrieb dazu Praxistagebuch und Störfallliste. Ergebnis: neue Spalte in der
Scorecard, ein Satz je Bereich, ob sich die Reibung bewegt hat, und die zwei
Bereiche mit der höchsten Restreibung für die nächste Vollrunde. Die Messrunde
ordnet nichts an.

## 4. Rundenkalender (Vorschlag)

Die Termine gehören in den Rückwärtsplan der Roadmap, Spalte A3. Hier steht
nur die Logik:

| Anlass | Format | Bereiche |
| --- | --- | --- |
| vor dem Loop eines Bereichs | Vollrunde | ~~Kalender vor CAL-EPIC-003a · Patient:innen nach VER-EPIC-001~~ (nicht gelaufen; Methode eingefroren 2026-09-13) · nach Probewoche 1 neu terminieren: Abrechnung, Übersicht (speist E2 und UI-001) |
| vor dem Go-live-Gate (M3) | Messrunde mit Schattentag, Ladeprobe und Kollegin-Test | alle gemessenen Bereiche |
| vier Wochen nach der Eröffnung (M6, 31.07.2027) | Messrunde mit Praxistagebuch und Störfallliste; Vollrunde für die zwei schlechtesten Bereiche | alle |
| jährlich | Messrunde alle, Vollrunde zwei; Abläufe streichen, die niemand mehr hat | alle |
| ein Vorschaubereich wird echt | Vollrunde vier Wochen nach seinem Loop | Kommunikation, Organisatorisches, Touren (nach MAP-006, Mai 2027) — **keine Runde vorher**; eine Vorschau zu messen, misst die Vorlage |

Eine Runde ersetzt keinen Loop und verschiebt keinen. Was sie findet, landet in
geplanten Epics, in „Befunde aus der Abnahme" (Jan 2027) oder in `UI-001`
(Feb 2027); es gibt keine eigene Epic-Klasse für Optimierung.

## 5. Automatische Prüfungen

Das billige, wiederholbare Messinstrument. **Stand 2026-09-13: gebaut** —
mit UI-000 und FIX-EPIC-003, nicht in einer Runde.

- **375-px-E2E je Kernpfad** (Playwright, Projekt `mobile` in
  `playwright.config.ts`): prüft Querscrollen und Tippziele ≥ 44 px. Nur
  lokal und im CI-Job `e2e-supabase` — in der Cloudumgebung gibt es kein
  GoTrue.
- **Kontrast-Test der Tokens**: `src/lib/kontrast.test.ts` rechnet die
  Kontraste aus `src/index.css` und schlägt unter 4,5:1 fehl.
- **Screenshot-Helfer** `pnpm screenshots` (UI-000) meldet waagerechtes
  Scrollen und Konsolenfehler.
- **axe** (`axe-core`, entschieden 2026-09-06): `src/barrierefreiheit.test.tsx`
  läuft in `pnpm test`.

## 6. Scorecard

Startwerte aus der Produktkritik vom 2026-09-05, **alle geschätzt**, bis die
erste Runde des Bereichs misst. `?` = funktional, noch nicht gemessen. `—` =
Vorschau, wird bis zum Loop nicht gemessen. Je Messung kommt eine Spalte hinzu
(`R1 <Datum>`, `Go-live`, `+4 Wo`), Notation `Score (Reibung)`.

**Übersicht** — „Was muss ich als Nächstes tun?"

| Kernaufgabe | Zielwert | heute (geschätzt) | Gew. | Score |
| --- | --- | --- | --- | --- |
| Nächsten Besuch mit Uhrzeit, Adresse, Zugangshinweis sehen | 0 Taps, ≤ 3 s nach Entsperren | 1 Tap je Termin, Adresse nur am Termin; ohne Netz nichts | 3 | 1 |
| Patient:in anrufen | 1 Tap | Nummer abtippen (kein `tel:`) | 3 | 1 |
| Was ist heute noch offen? | 0 Taps, ein Abschnitt; leer = „alles erledigt" | nicht vorhanden, Termin für Termin prüfen | 3 | 1 |
| Tagesplan ohne Netz lesen | geladener Plan bleibt lesbar, Anzeige „ohne Verbindung" | nicht vorhanden | 3 | 0 |

Bereichsreibung (geschätzt): 27.

**Kalender** — „Wer behandelt wen, wann und mit welchen Wegen?"

| Kernaufgabe | Zielwert | heute (geschätzt) | Gew. | Score |
| --- | --- | --- | --- | --- |
| Folgetermin für die gerade behandelte Person | ≤ 3 Taps, ≤ 20 s, keine Tastatur | ≈ 8 Interaktionen über 3 Seiten, vier Picker | 3 | 1 |
| Termin verschieben | ≤ 2 Aktionen, mit Rückgängig; 0 versehentliche Verschiebungen beim Scrollen | Ziehen ohne Rückgängig, Fehlbedienung wahrscheinlich | 2 | 1 |
| Serie aus Verordnung (CAL-007) | 6 Termine in ≤ 60 s, Konflikte inline sichtbar | nicht vorhanden, kommt mit CAL-EPIC-003 | 2 | 0 |
| Erreichbarkeit zweier Hausbesuche | Puffer oder Warnung ohne Kopfrechnen | nicht vorhanden; Ziel 4 (B7) | 2 | 0 |
| Eigener Tag / eigene Woche | 0 Filterbedienung | Woche zeigt erste Person | 3 | 2 |

Bereichsreibung (geschätzt): 25.

**Patient:innen** — „Was gehört zur Versorgung dieser Person?"

| Kernaufgabe | Zielwert | heute (geschätzt) | Gew. | Score |
| --- | --- | --- | --- | --- |
| Akte finden | ≤ 5 s, 3 Buchstaben, von jeder Seite in ≤ 1 Tap | nur über die Liste; „Mueller" findet „Müller" nicht | 3 | 2 |
| Akte-Kopf ohne Scrollen: Status, nächster Termin, Verordnungsstand, offene Rechnung, Zugangshinweis | 0 Taps | nächster Termin fehlt — der häufigste Anruf im Büro | 3 | 2 |
| Neuanlage durch das Office am Telefon | ≤ 90 s, Adresse für Hausbesuch validiert | Feldzahl passt; Abbrechen verwirft Eingaben ohne Rückfrage | 2 | 2 |

Bereichsreibung (geschätzt): 8. Datensparsamkeit (Office sieht nichts
Klinisches) bleibt Testfall in `test:db` und E2E, kein Score.

**Abrechnung, Organisatorisches, Kommunikation** (bis 12.09. „Betrieb" und
„Team") — Zielwerte stehen fest, gemessen wird nach dem jeweiligen Loop

| Bereich | Kernaufgabe | Zielwert | heute | Gew. | Score |
| --- | --- | --- | --- | --- | --- |
| Abrechnung | Rechnung aus dokumentierten Terminen einer Person | ≤ 60 s, keine Tastatur außer Empfänger-Auswahl | Vorschau bis ABR-EPIC-002 | 2 | — |
| Abrechnung | Offene Posten sehen | 0 Taps auf der Einstiegsseite | Vorschau | 2 | — |
| Abrechnung | Zahlung buchen | ≤ 3 Taps, Teilzahlung ohne Sonderweg | Vorschau | 2 | — |
| Organisatorisches | Abwesenheit oder Arbeitszeit ändern | ≤ 30 s, Wirkung im Kalender sofort sichtbar | funktional (`/praxis/planung`) | 1 | ? |
| Organisatorisches | „Wer hat wann Akte X geöffnet?" (`owner`) | ≤ 30 s über Filter | funktional (`/praxis/sicherheit/audit`) | 1 | ? |
| Organisatorisches | Panne melden (FLT-003) | einhändig, im Regen, ≤ 3 Taps bis „Hilfe unterwegs" | Vorschau, Stufe 2 | 2 | — |
| Kommunikation | Kollegin erreichen | ≤ 2 Taps bis `tel:` | Mitarbeiterliste funktional, Kontakt seit UX-012 als `tel:` | 2 | ? |
| Kommunikation | Nachricht mit Bezug auf Termin oder Patient:in (TEAM-001) | ≤ 3 Taps; Bezug ist ein Link, der keine Berechtigung erweitert | Vorschau, Stufe 2 | 2 | — |

Doppelabrechnung und Storno-Nachvollziehbarkeit sind Testfälle (ADR-009).

## 7. Betriebsphase

Ab der Eröffnung (M5, 01.07.2027) misst der Alltag, nicht der Schreibtisch.
Drei Formate, von Hand, ohne Patientendaten:

- **Praxistagebuch — ab sofort.** Eine Zeile je Ärgernis: Datum, Bereich, ein
  Satz. In der Notiz-App auf Jannes' Telefon oder auf einem Zettel, **nicht im
  Repository**. Gelesen nur in Runden; Jannes fügt die Zeilen als Text ein.
- **Störfallliste** (Abschnitt 8): eine Zeile, wenn etwas schiefging oder
  außerhalb der Software gelöst wurde. Sie fängt das Unerwartete.
- **Selbstbeobachtung**: ein realer Arbeitstag vor der Messrunde, Strichliste
  je Ereignis („Adresse nachgeschaut", „Büro angerufen", „auf Papier notiert",
  „doppelt eingetippt", „Patient:in fragt, was ich am Handy mache").

Das Auditlog (ADR-010) liefert nach der Eröffnung Zählungen für auditierte
Aktionen — als **Praxissumme je Aktionstyp**, gelesen vom `owner`, nie je
Person. Das ersetzt die Strichliste für diese Vorgänge, nicht die Stoppuhr.

**Regeln nach `PROJECT_PRINCIPLES.md` §20 und ADR-011**, für jede Erhebung:

1. Rolle statt Name. Kein Bogen trägt einen Personennamen.
2. Nur Praxissummen, nie Werte je Person. Bei zwei oder drei Personen ist
   „aggregiert" nicht anonym — bis B6 entschieden ist, füllt nur Jannes Zähl-
   und Zeitbögen.
3. Auditlog-Summen nur je Aktionstyp.
4. Selbstbeobachtung: Jannes misst sich selbst, nie Mitarbeitende.
5. Keine Telemetrie, keine Klickanalyse, kein Session-Recording in der App.

Die Selbstbeobachtung ist eine Verarbeitung von Beschäftigtendaten. Sie wird
in der ersten Vollrunde als `ANN-NNN` registriert (Datenschutz, Wiedervorlage
B6) und mit einem Satz in die DSFA-Unterlagen (G14) aufgenommen — **vor** der
ersten Erhebung durch jemand anderen als Jannes.

### Prüfungen, die nur im Feld gehen

- **Unterbrechungstest** — je mobilem Ablauf, jede Vollrunde: Formular
  beginnen, Telefon fünf Minuten sperren, Anruf annehmen, App wechseln,
  zurückkommen. Steht alles noch da? Zählt für N.
- **Ladeprobe im Funkloch** — die Übersicht und eine Akte an drei realen Orten
  (Keller, Treppenhaus, Rad) mit synthetischen Daten: Sekunden bis bedienbar;
  einmal Verbindungsabbruch mitten im Formular.
- **Schattentag** — zweimal vor dem Gate (nach CAL-EPIC-003a; in der
  Messrunde vor M3) und einmal nach MAP-006 mit der Tagesroute: eine
  echte Radrunde zu eigenen Adressen mit **synthetischen Patient:innen**, App
  parallel zum heutigen Weg. An jeder Tür eine Zeile Diktat: Licht, Handschuh,
  wo ist das Handy, wenn beide Hände am Patienten sind, was gemerkt statt
  eingetippt. Zählt Datenverluste, Fehltaps, Sekunden je Schritt. Nach der
  Eröffnung einmal am echten Tag, ohne Patientendaten.
- **Fehlerpfad-Aufgaben** — zwei je Bereich im Praxistest: „Du hast die
  Dokumentation der falschen Person zugeordnet — mach es rückgängig." Zählt
  für F: Sekunden bis zum korrekten Zustand.
- **Eine zweite Person vor dem Gate** — eine Kollegin oder eine Therapeutin
  aus einer anderen Praxis füllt einmal, freiwillig, mit Seed-Daten am Handy
  den Praxistest-Bogen; Jannes führt das Erster-Tag-Protokoll, sagt nichts,
  schreibt Stocker auf. Mit synthetischen Daten ist das keine
  Leistungskontrolle — und der einzige Lernbarkeits- und Fremdblick-Test vor
  dem Betrieb. Bis dahin einmal je Runde ein **Bürotag-Szenario** am Stück
  (Verordnung, sechs Termine, Rechnung, Zahlung), gemessen wie ein Ablauf.

## 8. Vorlagen

### Ablaufkarte `docs/development/ablaeufe/<bereich>.md`

```markdown
# Ablaufkarte: <Bereich>

Runde <N> · Stand <Datum> · Bereichsreibung <Zahl> (Vorrunde: <Zahl>)

| Kürzel | Job („Ich will …, damit …") | Rolle     | Häufigkeit  | Unterwegs |
| ------ | --------------------------- | --------- | ----------- | --------- |
| XX-01  | …                           | therapist | täglich (3) | ja        |

## XX-01 — <Titel>

**Auslöser.** … **Fertig.** …
**Heute ohne Software** (Jannes, Runde 1): … · gestoppt: … s
**In der Software** (Klickweg aus `docs/abnahme/<datei>.md`):

| # | Schritt | Route | Taps | Kontakt ist Aktion | Eingabe geschützt | Einhändig | Bruchstelle |
| - | ------- | ----- | ---- | ------------------ | ----------------- | --------- | ----------- |
| 1 | …       | `/…`  | 2    | ja/nein/–          | ja/nein/–         | ja/nein   | —           |

**Messung Runde <N>** (gemessen/geschätzt): Z … s (1. Lauf … s) · Taps … ·
Bruchstellen … · H … · L … · N … · S … · F … s → Score … · Reibung …

| Kennung  | Bruchstelle (was passiert) | Ursache | Ziel (1–5) | Verweis |
| -------- | -------------------------- | ------- | ---------- | ------- |
| XX-01.B1 | …                          | …       | 1          | CAL-…   |

**Vorgeschlagene Akzeptanzkriterien** (verbindlich erst im SPEC-Schritt): …
**Zielzeile:** XX-01 erreicht Score ≥ … nach <Epic> (Taps ≤ …; Sekunden in der Abnahme).

## Bogen für die nächste Runde (keine Patientendaten)

| Ablauf | Szenario (Seed-Daten)               | 1. Lauf s | 3. Lauf s | Taps | Gestockt bei … | Unterbrechung ok? |
| ------ | ----------------------------------- | --------- | --------- | ---- | -------------- | ----------------- |
| XX-01  | „Als <Rolle> … mit <Seed-Person> …" |           |           |      |                |                   |
```

### Praxistest-Bogen

```markdown
# Praxistest <Bereich> — <Datum> — Rolle: <Rolle> — Telefon, eine Hand, im Stehen

| #  | Aufgabe (aus den Abläufen)           | Geschafft ohne Hilfe? | Schritte: ok / zu viele | Was hat genervt (1 Zeile) | Wort, das ich nicht verstanden habe |
| -- | ------------------------------------ | --------------------- | ----------------------- | ------------------------- | ----------------------------------- |
| 1  | …                                    | ja / nein             |                         |                           |                                     |
| F1 | Fehlerpfad: „… — mach es rückgängig" | ja / nein             | Sekunden bis korrekt: … |                           |                                     |

Drei Fragen: Was würdest du im Hausbesuch als Erstes vermissen? · Was hat
heute am meisten Zeit gekostet? · Was war schneller auf Papier?
```

### Störfallliste

```markdown
# Störfälle — <Zeitraum> — Rolle: <Rolle> — eine Zeile je Ereignis, ohne Namen

| Nr | Tag | Ablauf | Was ist passiert | Folge: Minuten / Euro / Risiko P D R | Wie gelöst (in der Software / daneben) |
| -- | --- | ------ | ---------------- | ------------------------------------ | -------------------------------------- |
| 1  |     | TT-02  |                  | P = Patient:in, D = Datenschutz, R = Recht |                                  |
```

### Erster-Tag-Protokoll

```markdown
# Erster Tag — <Datum> — Rolle: <Rolle> — Daten: Seed / Betrieb — geführt von der beobachtenden Person

| Aufgabe | Ohne Nachfrage geschafft?  | Gestellte Frage (wörtlich) | Fehler und wie bemerkt | 1. Lauf s |
| ------- | -------------------------- | -------------------------- | ---------------------- | --------- |
|         | ja / nein / abgebrochen    |                            |                        |           |

Bereich ohne Einweisung nutzbar: ja / nein — weil: … (ein Abbruch zählt als Befund)
```

## 9. Oberflächen-Checkliste je Story

Die Checkliste steht **einmal**, in `docs/abnahme/README.md` (Abschnitt
„Oberflächen-Checkliste je Story") und wird dort gepflegt. Sie ist die
Oberflächen-Checkliste für Schritt F des Loops — **nicht** die
Review-Checkliste für kritische Änderungen, die ADR-013 Punkt 8 verlangt; die
steht seit dem 2026-09-13 in ADR-013 Fassung 2, Punkt 9, und wird am
Compliance-Gate A4 des [Graph-Engineering-Workflows](GRAPH-ENGINEERING-WORKFLOW.md)
abgearbeitet.

## 10. Verankerung

Kleine Ergänzungen in bestehenden Dateien. Nichts Neues außer dieser Datei
und je Runde einer Ablaufkarte.

| Datei | Ergänzung |
| --- | --- |
| `ROADMAP.md`, Rückwärtsplan Spalte A3 | Rundentermine wie ADR-017: „Ablaufrunde TT (Docs)" usw. |
| `ROADMAP.md`, „Befunde aus der Abnahme" und G17 `UI-001` | Zusatz: speist sich aus den Ablaufrunden nach `OPTIMIERUNG.md` — eingetragen mit 2.1 |
| `ROADMAP.md`, Tabelle „Modell und Aufwand" | zwei Zeilen: Vollrunde Sonnet 5 `medium`, Messrunde Sonnet 5 `low` |
| `ROADMAP.md`, G18 (Go-live-Gate) | „Messrunde vor dem Gate ohne täglichen Ablauf mit Score 0" — von Jannes am 2026-09-06 zugestimmt (E-11), eingetragen |
| `CLAUDE.md`, „Arbeitsweise" | ein Absatz: was eine Ablaufrunde ist, dass sie keinen Scope begründet und keine zweite Reihenfolge führt |
| `.claude/skills/feature-loop/SKILL.md` | Schritt A: Ablaufkarten-Hinweis aus der Roadmap-Zeile übernehmen, Karte nicht lesen · Schritt F: Oberflächen-Checkliste abhaken — zwei Zeilen, keine Inhaltsregeln |
| `docs/abnahme/README.md` | Abschnitt 9 wortgleich |
| `ARBEITSBEREICHE.md` §6 | ein Satz: Ablaufkarten messen, die Roadmap ordnet |

Das Wochenupdate liest `docs/STATUS.md`, die Roadmap, `ARBEITSBEREICHE.md` §2
und das Git-Log (Roadmap, „Wochenupdate"); die Rundentermine stehen in der Roadmap.

## 11. Aufwand je Runde

| Format | Jannes | Session | Modell, Aufwand |
| --- | --- | --- | --- |
| Vollrunde, erste je Bereich | 90–120 min (Ist-Beschreibung, Stoppuhr, Bogen, heutiger Weg) | ≈ ein Drittel eines Loops; liest ~600 Zeilen, schreibt ~200 | Sonnet 5 `medium` — eine Stufe über der Roadmap-Zeile „Doku", weil Abläufe geschnitten werden; kein Opus |
| Vollrunde, Folge | 45 min | ≈ ein Viertel | Sonnet 5 `medium` |
| Messrunde | 30 min, im Betrieb plus ein Tag Strichliste nebenbei | ≈ ein Zehntel | Sonnet 5 `low` |
| Kollegin-Test, Erster Tag | 30–45 min, plus die Kollegin | keine — Ergebnis geht in die nächste Runde | — |
| Schattentag mit Ladeprobe | ein halber Tag | keine | — |

Bis zum Gate: vier Vollrunden, eine Messrunde, zwei Schattentage, ein
Kollegin-Test — etwa anderthalb Loops an Credits und rund zehn Stunden Jannes
über sechs Monate. Der teurere Teil ist Jannes' Zeit; sie liegt dort, wo nur
er etwas weiß. Zwischen Gate und Eröffnung kommen eine Vollrunde Touren (nach
MAP-006) und ein Schattentag mit der Tagesroute hinzu.

Sieben kleine Ergänzungen verankern die Methode (Abschnitt 10); sie sind mit
dem Review vom 2026-09-06 eingetragen und seit dem 2026-09-13 auf den Stand
der Einfrierung gebracht (CLAUDE.md und SKILL.md verweisen auf `BEFUNDE.md`;
die Checklisten-Kopie in Abschnitt 9 ist durch einen Verweis ersetzt).

## 12. Grenzen und Abbruchregel

- **Synthetische Messung ist nicht der Betrieb.** Die Stoppuhr am Schreibtisch
  unterschätzt die mobile Reibung. Schattentag und Ladeprobe mildern das; die
  Messrunde vier Wochen nach der Eröffnung ist die erste echte Messung, und
  ihre Reihenfolge schlägt die synthetische.
- **n = 1.** Jannes ist Beobachter, Nutzer und Auftraggeber; `office` wird
  gespielt, bis eine Bürokraft da ist. Die Methode gewichtet nach Häufigkeit,
  nicht nach Empfinden — erfinden kann sie einen Bedarf nicht.
- **Goodhart.** Taps und Sekunden lassen sich senken, indem alles auf einen
  Bildschirm gequetscht wird. Schwellen sind Alarmgrenzen; „gestockt bei …"
  und „Wort nicht verstanden" schlagen jede Zahl.
- **Scope-Sog.** Jede Runde findet mehr, als der Rückwärtsplan trägt.
  Akzeptanzhinweise vergrößern geplante Epics — der Bericht nennt das.
- **Blinde Flecken.** Abläufe sehen keine Sicherheit, keine Datenminimierung,
  keine Performance. Das bleibt bei `test:db`, der CI und der
  Datenschutzprüfung. Abschnitt 9 fängt Ärgernisse, die keinen Ablauf brechen.
- **Alterung.** Ablaufkarten werden zwischen Runden nicht gepflegt; eine Karte
  ist nur am Rundendatum wahr.
- **Abbruchregel für die Methode selbst.** Fällt eine Runde zweimal
  hintereinander aus — ihr Termin im Rückwärtsplan ist verstrichen, ohne dass
  sie gelaufen ist —, wird die Methode **eingefroren**: Es bleiben der
  Praxistest-Bogen vor jedem Loop mit Oberfläche, die Oberflächen-Checkliste
  und das Praxistagebuch. Scorecard und Ablaufkarten ruhen, bis Jannes die
  Runden ausdrücklich wieder aufnimmt. Kostet eine einzelne Runde mehr als
  einen halben Loop, wird sie als Messrunde beendet.

## 13. Bewusst nicht enthalten

- **Keine Telemetrie, keine Klickanalyse, kein Session-Recording** — ein neuer
  Datenfluss mit Beschäftigtendaten (§20, ADR-011).
- **Keine Messung an Mitarbeitenden.** Nur Selbstbeobachtung durch Jannes;
  Kolleginnen testen freiwillig mit Seed-Daten, ohne Namen, ohne Betriebsbezug.
- **Keine Personas.** Es gibt eine Praxis mit einem bekannten Alltag.
- **Kein Heuristik-Audit je Bildschirm.** Lange Befundlisten ohne
  Häufigkeitsgewicht; Bildschirme werden angefasst, wo ein Ablauf bricht.
- **Keine Feature-Parität.** Die Wettbewerbsreferenz
  (`docs/product/ideen/referenz-wettbewerb.md`, Rang 6) beantwortet je
  Bruchstelle „wie lösen es andere", nie „was fehlt uns".
- **Keine Mockups je Runde.** Ein Entwurf entsteht im Loop, wenn eine Story
  ihn braucht.
- **Keine Prozentzahlen, Reifegrade, Gesamtscores oder SUS-Fragebögen** — bei
  n = 1 bis 3 täuschen sie Genauigkeit vor. **Keine Runde für Vorschaubereiche,
  kein zweiter Skill, kein ADR, keine Änderung an Prinzipien oder Hierarchie.**

Zuletzt aktualisiert: 2026-09-13 (eingefroren bis Probewoche 1; Bereichsnamen,
Abschnitt 5 und 9 nachgezogen)
