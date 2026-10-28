# Geführte Abläufe und Anträge
Stand 2026-10-27. Rang 6 wie alles unter `docs/product/`: **Maßstab und Startinhalt, kein Scope.**
Gebaut in den Bereichsüberholungen 6 bis 11 (GEF-EPIC-001, URL-001, AZ-001, ZK-001, ERS-001,
TEAM-001); was dort gilt, halten Code, Annahmen und Specs. Hier bleiben das Muster, die gemeinsame
Antragsmechanik und die Festlegungen von Jannes (mit „(Jannes)“); die Budgets G1 bis G10 stehen in
[`kernablaeufe.md`](kernablaeufe.md). Die Vorbereitung vom 2026-10-16 mit dem damaligen Stand je
Ablauf: `git show 9452575:docs/product/gefuehrte-ablaeufe-und-antraege.md`.

## 1. Das Muster (Vorbild: Check-Up am Rad, ANN-563)
Auftrag Jannes (2026-10-16): Alltägliche Abläufe sollen für die Mitarbeitenden einfach sein,
geführt und ohne unnötiges Scrollen, nach dem Vorbild des Check-Ups.

- **Eine Frage je Seite**, ohne Scrollen bei 375 px; die Antwort führt weiter.
- **Folgefragen nur, wenn nötig**: Verzweigung als reine Logik ohne Oberfläche, mit Tests (wie
  `fleet/checkupablauf.ts` und `fleet/pannenablauf.ts`).
- **Nichts vorbelegt, was bewusst entschieden werden soll**; Vorschläge (gleiche Zeit, berechnete
  Tage) sind sichtbar als Vorschlag.
- **„← Zurück“ und die Zurückgeste** gehen einen Schritt zurück, nicht aus dem Ablauf.
- **Abschluss als Zusammenfassung**: jede Angabe antippbar zum Ändern, danach zurück zum Abschluss;
  Optionales eingeklappt; ein Hauptknopf (Absenden, Speichern).
- **Ungespeichertes** schützt der Textverlustschutz (Rückfrage als Fenster, ANN-566).
- Baustein `GefuehrterAblauf` im `Dialogfenster vollbild`; wann geführt und wann nicht, regelt
  [DESIGN.md](../design/DESIGN.md), „Geführter Ablauf“.

## 2. Gemeinsame Antragsmechanik (Urlaub, Arbeitszeit, Zeitkonto, Erstattungen)
- **Zustände:** beantragt → genehmigt oder abgelehnt (mit Grund); zurückgezogen, solange
  beantragt. Ein genehmigter Antrag wird nicht still geändert: Stornieren oder Ändern ist ein neuer
  Antrag mit Bezug.
- **Entscheiden** owner und team_lead; office pflegt Arbeitszeiten und Zeitkonten weiter direkt, wo
  es das darf. Wer selbst beantragt, entscheidet nicht über den eigenen Antrag.
- **Nachweis ist das Datenmodell** (ADR-010): beantragt von/am, entschieden von/am, Grund. Kein
  neues Auditlog ohne ADR-Änderung und Jannes' Freigabe.
- **Sichtbarkeit nach BEF-066** (Jannes 2026-10-09): Eigenes sieht jede Person; fremde Zeitkonten
  und Erstattungen sehen owner und Büro; beim Urlaub sehen andere nur den Zeitraum, nie den Grund;
  IBAN maskiert; keine Summe über alle Personen. Durchgesetzt per RLS, nicht nur in der Oberfläche.
- **Für Entscheidende** stehen offene Anträge unter Übersicht → Offene Punkte; Entscheiden ist ein
  kurzer geführter Ablauf (Angaben, Folgen, Genehmigen oder Ablehnen mit Grund).
- **Benachrichtigung** über Push nach ADR-024 ohne Inhalt („Neuer Antrag“), sobald Push
  scharfgeschaltet ist; bis dahin nur die Liste.
- **Keine Leistungs- oder Verhaltenskontrolle** (§20): keine Auswertung über Beschäftigte, keine
  Ableitung aus Kalender oder Touren. Daten und Rechte sind **Pfad A** (ADR-013 Punkt 9).

## 3. Festlegungen je Ablauf
- **G1 Niemand öffnet (K8):** geklingelt → angerufen (Rufnummer als Knopf) → gewartet (die Uhr
  läuft ab dem ersten Tipp, 15 Minuten, ANN-479) → Vermerken; ADR-018 und `record_no_show` bleiben.
- **G2 Tag umplanen:** Grund → Termine (alle gewählt, abwählbar) → Rückfrage → Anrufliste, eine
  Person je Seite → Abschluss: wer nicht erreicht wurde.
- **G3 Panne:** Verzweigungen aus `pannenablauf.ts`, ohne Gesamtzahl der Schritte.
- **G4 Schlüssel- und Radübergabe:** Rad → an wen → Abschluss; der eigene Schlüssel: ein Tipp.
- **G5 Mitarbeiter:in einrichten:** Name und Kontakt → Rolle → Arbeitszeiten → Rad und Schlüssel,
  falls Therapie → Einladung → Abschluss mit allem, was noch fehlt.
- **G6 Plattform-Termin:** Ändern oder Absagen → beim Absagen der Hinweis zum Ausfallhonorar als
  eigene Seite (unter 24 Stunden hervorgehoben) → Wunschtage → Tageszeiten → Nachricht → Senden.
- **Erstaufnahme (K10) und Neuaufnahme (K11)** bleiben eine Seite; eine Umstellung kostete Tipps.
- **G7 Urlaub:** Zeitraum → Urlaubstage (Werktage ohne Feiertage des Bundeslands, nach Wochenplan),
  Rest, wer im Team zur selben Zeit fehlt (nur Zeitraum) → Grund → Absenden. Genehmigt sperrt er
  die Tage für Termine und nennt die Termine darin zum Umplanen (G2); Sichtbarkeit ANN-580.
- **G8 Arbeitszeitänderung** (Jannes): einmalig oder dauerhaft; **weniger Arbeitszeit geht darüber
  nicht**, Stunden dürfen zwischen Tagen wandern, solange die Wochensumme bleibt; weniger Stunden
  sind ein Gespräch mit der Praxisleitung (§ 8 TzBfG bleibt unberührt). Die Mittagspause darf sich
  verschieben und ändern. Grenzen des ArbZG und „nicht rückwirkend“: ANN-588; Termine außerhalb
  werden genannt, nicht verschoben; dauerhaft gilt ein Wochenplan ab dem Datum (ANN-589).
- **G9 Zeitkonto** (Jannes): keine Genehmigung, aber Zurückweisen mit Grund; zurückgewiesen bleibt
  sichtbar und zählt nicht. Freizeitausgleich wirkt sofort wie Abwesenheit, Termine darin werden
  genannt. Owner und Büro buchen direkt; „Überstunden“, „Minusstunden“ und Regler: ANN-606.
- **G10 Erstattung:** Art zuerst. Ladestrom aus den geplanten Stunden (ANN-605), Haken „zu Hause
  geladen“; Einkauf mit Beleg aus der Kamera der App (ADR-017) → Betrag → wofür → Summe. IBAN
  maskiert; Belegfristen als Annahme (B4).
- **Teamchat** (TEAM-001): kein geführter Ablauf; ein Vorgangsbezug auf einen Antrag zeigt nie
  dessen Grund an Unberechtigte.

## 4. Offen: bewegliche Mittagspause (Jannes 2026-10-16, langfristig)
Die Mittagspause liegt nicht fest: Jede Person hat eine eigene Pausendauer je Tag, ungefähr in der
Mitte der Arbeitszeit, ohne feste Uhrzeit. Folgen, im Loop als Spec zu klären:

- **Wochenplan** je Tag als Beginn, Ende und Pausendauer statt zwei Blöcken mit Lücke; die
  Arbeitszeit ist Ende − Beginn − Pause, bestehende Lücken werden zur Pausendauer.
- **Planung:** Terminvorschläge und Slotsuche lassen um die Tagesmitte ein Fenster frei (Vorschlag
  Mitte ± 1,5 Stunden); ein Termin darf dort liegen, solange die Pause noch Platz hat. Sonst fragt
  der Kalender wie außerhalb der Arbeitszeit nach.
- **Kalender:** ein blasses Pausenfenster mit der Dauer („30 Min. Pause“) statt eines festen grauen
  Blocks; erst wenn Termine es füllen, zeigt er, wo die Pause noch liegen kann.
- **Gesetz:** Mindestpause und höchstens 6 Stunden am Stück (§ 4 ArbZG); die Planung prüft sie gegen
  die Termine des Tages.
- **Keine Erfassung**, wann die Pause tatsächlich genommen wurde (§20).

Ein eigener Loop nach Überholung 8 (Kalender und Slotsuche, Pfad A).
