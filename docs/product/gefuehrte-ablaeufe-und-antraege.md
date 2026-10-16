# Geführte Abläufe und Anträge

Stand 2026-10-16. Vorbereitung der Bereichsüberholungen 6 bis 11 (`development/ROADMAP.md`).
Rang 6 wie alles unter `docs/product/`: **Maßstab und Startinhalt, kein Scope.** Verbindlich wird
ein Ablauf erst mit der Arbeitsablauf-Spec seines `/bereich` (Rang 3). Was Jannes am 2026-10-16
selbst festgelegt hat, steht mit „(Jannes)“ da; die Spec übernimmt es, statt es neu zu erfinden.

## 1. Das Muster (Vorbild: Check-Up am Rad, ANN-563)

Auftrag Jannes (2026-10-16): Alltägliche Abläufe sollen für die Mitarbeitenden einfach sein,
geführt und ohne unnötiges Scrollen, nach dem Vorbild des Check-Ups.

- **Eine Frage je Seite**, ohne Scrollen bei 375 px; die Antwort führt weiter.
- **Folgefragen nur, wenn nötig** (Verzweigung als reine Logik ohne Oberfläche, mit Tests, wie
  `fleet/checkupablauf.ts` und `fleet/pannenablauf.ts`).
- **Nichts vorbelegt, was bewusst entschieden werden soll**; Vorschläge (gleiche Zeit, berechnete
  Tage) sind sichtbar als Vorschlag.
- **„← Zurück“ und die Zurückgeste** gehen einen Schritt zurück, nicht aus dem Ablauf.
- **Abschluss als Zusammenfassung**: jede Angabe antippbar zum Ändern, danach zurück zum Abschluss;
  Optionales eingeklappt; ein Hauptknopf (Absenden, Speichern).
- **Ungespeichertes** schützt der Textverlustschutz (Rückfrage als Fenster, ANN-566).
- Gezeichnet im `Dialogfenster vollbild` (am Telefon randlos, am Rechner groß in der Mitte).

**Wann geführt, wann nicht** (Regel für `docs/design/DESIGN.md`): geführt, wenn ein Ablauf
**selten** ist, sich **verzweigt**, **nichts vergessen** werden darf oder **am Rad einhändig**
läuft. Nicht geführt, wenn er **täglich und kurz** ist und im Budget liegt (Doku K5/K6, Folgetermin
K7, Absage K9, Zahlung K14): dort kostet ein Schritt je Frage nur Tipps.

**Baustein zuerst** (Überholung 6): Aus `CheckupFenster.tsx` und `checkupablauf.ts` entsteht
`src/components/ui/GefuehrterAblauf` (Kopf mit Schritt und Objekt, Zurück, Fortschritt, Seite,
Abschluss) und eine Abfolge-Hilfe für Schritte mit Verzweigung und „zurück zum Abschluss“. Der
Check-Up zieht als Erster um und verhält sich danach gleich (seine Tests bleiben unverändert grün).
Kein Paket.

## 2. Gemeinsame Antragsmechanik (Überholung 7, genutzt von 8 bis 10)

- **Zustände:** beantragt → genehmigt oder abgelehnt (mit Grund); zurückgezogen, solange
  beantragt. Ein genehmigter Antrag wird nicht still geändert: Stornieren oder Ändern ist ein neuer
  Antrag mit Bezug.
- **Entscheiden** owner und team_lead (wie in der Vorschau); office pflegt Arbeitszeiten und
  Zeitkonten weiter direkt, wo es das heute darf. Wer selbst beantragt, entscheidet nicht über den
  eigenen Antrag.
- **Nachweis ist das Datenmodell** (ADR-010): beantragt von/am, entschieden von/am, Grund. Kein
  neues Auditlog ohne ADR-Änderung und Jannes' Freigabe.
- **Sichtbarkeit nach BEF-066** (Jannes 2026-10-09): Eigenes sieht jede Person; fremde Zeitkonten
  und Erstattungen sehen owner und Büro; beim Urlaub sehen andere nur den Zeitraum, nie den Grund;
  IBAN maskiert; keine Summe über alle Personen. Durchgesetzt per RLS, nicht nur in der Oberfläche.
- **Für Entscheidende** erscheinen offene Anträge unter Übersicht → Offene Punkte; Entscheiden ist
  selbst ein kurzer geführter Ablauf (je Antrag eine Seite: Angaben, Folgen, Genehmigen oder
  Ablehnen mit Grund).
- **Benachrichtigung** über Push nach ADR-024 ohne Inhalt („Neuer Antrag“), sobald Push
  scharfgeschaltet ist; bis dahin nur die Liste.
- **Keine Leistungs- oder Verhaltenskontrolle** (§20): keine Auswertung über Beschäftigte, keine
  Ableitung aus Kalender oder Touren.
- Daten und Rechte sind **Pfad A** (ADR-013 Punkt 9): `pnpm test:db`, Zweitreview.

## 3. Die Abläufe

Budgets stehen als G1 bis G10 in `kernablaeufe.md`. „Heute“ aus dem Code vom 2026-10-16.

### Überholung 6: geführte Abläufe im Bestand

**G1 Niemand öffnet, Ausfallhonorar (K8).** Heute klappt am Besuch ein Bereich mit drei Haken
(geklingelt, 15 Minuten gewartet mit Uhr, angerufen) auf; 5 Tipps (`appointments/HomeVisitFlow.tsx`).
Geführt: „Geklingelt?“ → „Gewartet?“ (die Uhr läuft auf der Seite, weiter erst nach 15 Minuten
oder mit Begründung) → „Angerufen?“ (Rufnummer als Knopf) → Abschluss „Vermerken“. Protokoll nach
ADR-018 und `record_no_show` bleiben unverändert. Budget bleibt ≤ 5.

**G2 Tag umplanen, Krankmeldung.** Heute eine Seite in zwei Phasen, Haken „Angerufen“ nur im
Speicher (`appointments/TagUmplanenPage.tsx`). Geführt: Grund → welche Termine (alle des Tages
gewählt, abwählbar) → Rückfrage → Anrufliste **eine Person je Seite** (Anrufen-Knopf, „Erreicht“
oder „Nicht erreicht“, weiter) → Abschluss: wer nicht erreicht wurde. Ob der Anrufstand
gespeichert wird, entscheidet die Spec (heute bewusst nicht).

**G3 Panne.** Heute schon eine Frage je Seite, aber als gewöhnliche Seite (`fleet/BreakdownPage.tsx`,
18 Schritte, 6 Abschlussarten). Nur auf den Baustein umziehen; Verzweigungen aus `pannenablauf.ts`
bleiben, wie sie sind. Ohne Gesamtzahl der Schritte, weil der Weg verzweigt.

**G4 Schlüssel- und Radübergabe.** Heute ein Formular mit zwei Auswahlen (`fleet/KeyPage.tsx`).
Geführt: Rad → an wen → Abschluss. Der eigene Schlüssel bleibt ein Tipp an der Zeile.

**G5 Neue:n Mitarbeiter:in einrichten** (Büro, selten). Heute verteilt über Anlegen, Zugang
(`staff/StaffAccountSection.tsx`) und Arbeitszeiten. Geführt: Name und Kontakt → Rolle →
Arbeitszeiten (Wochenplan aus Vorlage) → Stammrad und Schlüssel, falls Therapie → Einladung senden →
Abschluss mit allem, was noch fehlt. Die Seite „Zugang einrichten“ der eingeladenen Person ist ein
Knopf und bleibt so.

**G6 Plattform: Terminwunsch und Terminänderung.** Heute zwei Ebenen mit Formular
(`platform/Terminwunsch.tsx`, `Terminaenderung.tsx`). Geführt in 18 px: Ändern oder Absagen →
beim Absagen der Hinweis zum Ausfallhonorar als eigene Seite (unter 24 Stunden hervorgehoben) →
Wunschtage → Tageszeiten → Nachricht, wenn gewünscht → Zusammenfassung → Senden.

**Erstaufnahme (K10) und Neuaufnahme am Telefon (K11)** bleiben, wie sie sind: Die Erstaufnahme ist
eine Checkliste auf einer Seite mit 10 Tipps, die Neuaufnahme ein kurzes Formular. Angeglichen
werden nur Kopf, Abschluss und Knöpfe, wo der Baustein sie hergibt; eine Umstellung auf Seiten
kostete dort Tipps.

### Überholung 7: Urlaub (URL-001)

**Startinhalt aus der Vorschau** (`vacation/`): Antrag mit Person, Von, Bis, Tagen (vorbelegt mit
Werktagen), Grund; Zustände beantragt, genehmigt, abgelehnt; Urlaubskonto (Anspruch + Übertrag −
genehmigt, Beantragtes getrennt); Überschneidung mit eigenen Anträgen; Wochenübersicht über 14
Wochen.

**G7 Urlaub beantragen.** Zeitraum (Kalender, zwei Tipps) → Ergebnis auf einer Seite: Urlaubstage
(Werktage **ohne Feiertage** des Bundeslands der Praxis, nach Wochenplan der Person), Rest danach,
wer im Team zur selben Zeit fehlt (nur Zeitraum) → Grund, wenn gewünscht → Zusammenfassung →
Absenden.

**Wirkung:** Genehmigter Urlaub sperrt die Tage für Termine (heute `staff_working_hour_exceptions`
mit `unavailable`, die die Radflotte schon als „frei (abwesend)“ liest) und zeigt Termine im
Zeitraum zum Umplanen (G2). **Voraussetzung:** Beschäftigtenangaben im Mitarbeiterstamm
(`IDEA-QSN-010`: Eintritt, Urlaubsanspruch, Übertrag), Aufbewahrung nach ADR-008 als Annahme.
Befunde: BEF-066, BEF-168.

### Überholung 8: Arbeitszeitänderung (AZ-001, neu)

Festlegung Jannes (2026-10-16), als Annahme mit Anker im Loop: Ein Antrag, der zwischen **einmaliger** und
**dauerhafter** Änderung unterscheidet. **Weniger Arbeitszeit geht darüber nicht.** Die
**Mittagspause** (falls vorhanden) darf verschoben und in der Dauer geändert werden.

**Heute:** Arbeitszeiten pflegen owner, team_lead und office direkt (`scheduling/SchedulingPage.tsx`,
CAL-005): Blöcke je Wochentag (`staff_working_hours`, ohne Gültigkeit ab), Abweichungen für ein
Datum (`staff_working_hour_exceptions`); die Mittagspause ist die Lücke zwischen zwei Blöcken.
Mitarbeitende können heute nichts beantragen.

**G8 Arbeitszeitänderung beantragen.**

1. Einmalig oder dauerhaft?
2. Einmalig: Datum. Dauerhaft: ab welchem Datum.
3. Die neuen Zeiten: einmalig der Tag, dauerhaft der Wochenplan; vorbelegt mit den heutigen Zeiten,
   daneben „bisher“. Die Pause als Dauer, wenn es eine gibt (ab der beweglichen Pause unten keine
   feste Lage mehr).
4. Grund, wenn gewünscht.
5. Zusammenfassung: bisher → neu, Arbeitszeit bisher → neu, betroffene Termine → Absenden.

**Prüfungen** (am Gerät als Hinweis, verbindlich am Server):

- **Keine Reduktion:** Arbeitszeit ohne Pausen neu ≥ bisher; einmalig für den Tag, dauerhaft für
  die Woche (Stunden dürfen zwischen Tagen wandern, solange die Wochensumme nicht sinkt; Jannes
  2026-10-16). Sonst kein Absenden, mit dem Satz, dass
  weniger Stunden ein Gespräch mit der Praxisleitung sind (der Anspruch nach § 8 TzBfG bleibt davon
  unberührt; er läuft nur nicht über diesen Antrag).
- **Pause:** nur, wenn es sie schon gibt; nicht unter die gesetzliche Mindestpause (§ 4 ArbZG:
  30 Minuten über 6 Stunden, 45 über 9; höchstens 6 Stunden am Stück). Wird die Pause länger,
  schlägt der Ablauf ein späteres Ende vor, damit die Arbeitszeit nicht sinkt.
- **Grenzen:** höchstens 10 Stunden am Tag (§ 3 ArbZG), 11 Stunden Ruhe (§ 5).
- **Termine** außerhalb der neuen Zeiten werden genannt, nicht still verschoben.

**Wirkung nach Genehmigung:** einmalig eine Abweichung für das Datum; dauerhaft ein Wochenplan
**ab** dem Datum — dafür braucht `staff_working_hours` eine Gültigkeit (Datenmodell im Loop,
Pfad A). Route als Vorschlag `/betrieb/arbeitszeit`, eigener Plan auch unter Mein Konto.

**Bewegliche Mittagspause** (Jannes 2026-10-16, langfristig): Die Mittagspause liegt nicht fest.
Jede Person hat eine eigene Pausendauer je Tag; die Pause liegt **ungefähr in der Mitte** der
Arbeitszeit, wird aber nicht auf eine Uhrzeit festgeschrieben. Folgen für das Datenmodell und die
Oberfläche, im Loop als Spec zu klären:

- **Wochenplan** je Tag als Beginn, Ende und Pausendauer statt als zwei Blöcke mit Lücke; die
  Arbeitszeit ist Ende − Beginn − Pause. Bestehende Lücken werden zur Pausendauer übernommen.
- **Planung:** Terminvorschläge und Slotsuche lassen um die Tagesmitte ein Fenster frei, in das die
  Pause passt (Vorschlag: Mitte ± 1,5 Stunden); ein Termin darf dort liegen, solange die Pause im
  Fenster noch Platz hat. Ist kein Platz mehr, fragt der Kalender wie heute außerhalb der
  Arbeitszeit nach.
- **Kalender:** kein fester grauer Block mehr, sondern ein blasses Pausenfenster mit der Dauer
  („30 Min. Pause“); erst wenn Termine das Fenster füllen, zeigt er, wo die Pause noch liegen kann.
- **Gesetz:** Mindestpause und höchstens 6 Stunden am Stück (§ 4 ArbZG) gelten weiter; die Planung
  prüft sie gegen die Termine des Tages.
- **Keine Erfassung**, wann die Pause tatsächlich genommen wurde (§20): Die Software plant Raum
  für sie, sie protokolliert sie nicht.

Gehört in Überholung 8, weil der Antrag dasselbe Modell ändert; ist es dafür zu groß, wird es ein
eigener Loop direkt danach (Kalender und Slotsuche, Pfad A).

### Überholung 9: Zeitkonto (ZK-001)

**Startinhalt aus der Vorschau** (`timeaccount/`): Buchungsarten „geleistet“ und „abgebaut“,
Person, Datum, Stunden, Grund; Liste je Person mit Saldo, Detail mit Buchungen; bewusst ohne Summe
über alle und ohne Ableitung aus dem Kalender (§20).

**G9 Zeitkonto-Eintrag** (Mitarbeitende): Art (Mehrarbeit, Freizeitausgleich) → Datum → Stunden
(Schnellwahl 0,5 · 1 · 2 · eigene) → Grund → Zusammenfassung mit Saldo danach → Eintragen.

**Keine Genehmigung, aber Zurückweisen** (Jannes 2026-10-16): Ein Eintrag gilt sofort und zählt
im Saldo. Die Praxisleitung kann ihn zurückweisen, mit Grund; er bleibt dann als „zurückgewiesen“
sichtbar und zählt nicht mehr. Die Person sieht das an ihrem Konto. Freizeitausgleich wirkt sofort
wie ein Abwesenheitsblock (wie Urlaub); zurückgewiesen gibt er die Zeit wieder frei, Termine darin
werden genannt, nicht still gebucht. Wer zurückweisen darf, entscheidet die Spec (Vorschlag: owner
und team_lead, nie beim eigenen Eintrag). Owner und Büro buchen weiter direkt. Die gemeinsame
Antragsmechanik (Abschnitt 2) gilt hier deshalb ohne den Zustand „beantragt“.

### Überholung 10: Erstattungen (ERS-001)

**Startinhalt aus der Vorschau** (`reimbursements/`): Art Stromkosten oder Einkauf; Strom mit
Zeitraum, Arbeitstagen, Formel Arbeitstage × 0,5 kWh × Satz (Vorschau 37 ct) und Erklärung;
Einkauf mit Positionen und Belegen; IBAN; Stände eingereicht → genehmigt oder abgelehnt →
ausgezahlt.

**G10 Erstattung beantragen.** Art zuerst, dann verzweigt:

- **Strom:** Zeitraum (Monate) → Arbeitstage (Vorschlag aus dem eigenen Wochenplan abzüglich Urlaub,
  änderbar; keine Ableitung aus Touren) → Erklärung bestätigen → Zusammenfassung mit Betrag.
- **Einkauf:** Beleg fotografieren (Kamera der App, ADR-017) → Betrag → wofür → weiterer Beleg? →
  Zusammenfassung mit Summe.

Danach die IBAN (gespeichert, maskiert angezeigt) → Absenden. Belegfristen als Annahme (B4).

### Überholung 11: Teamchat (TEAM-001)

Kein geführter Ablauf, aber vorgezogen. **Startinhalt aus der Vorschau** (`teamchat/`): Kanäle,
Direktnachrichten, Threads mit Zitat, Erwähnungen, Vorgangsbezug (Termin, Tour, Panne, Urlaub) als
Anzeige, Suche, gelesen markieren; ausgeschlossen: Anhänge, Konferenzen, Gäste, Bots, klinische
Freitexte. Mechanik aus KOM-EPIC-001. **Offen als Annahme:** Speicherfrist (§10, ANN-001),
Anhänge nach ADR-017 (§18). Ein Vorgangsbezug auf einen Antrag (Urlaub, Arbeitszeit) zeigt nur den
Antrag, nie dessen Grund an Unberechtigte.
