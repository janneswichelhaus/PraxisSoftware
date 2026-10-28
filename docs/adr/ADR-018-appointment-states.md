# ADR-018: Zustandsautomat des Termins
## Status
Angenommen 2026-09-11 (Jannes), Fassung 5 (2026-10-14); Umkehr in Punkt 2 und 4; Protokoll: ADR-010.

## Kontext
Offen war der Automat (Punkt D, §8), von Jannes vollständig verlangt, nicht minimal (2026-09-05).
Nicht Gegenstand: Werteliste der Absagegründe (CAL-008); Höhe, Steuerkennzeichen und Abrechnungsweg
des Ausfallhonorars (ABR-001, ABR-003); Terminserie (CAL-007), Terminfenster (CAL-010a, §8.1).

## Entscheidung
1. **Ein Statusfeld, acht Werte, sechs davon erreichbar** (`appointments_status_check`): `confirmed`
   (bestätigt), `cancelled` (abgesagt), `no_show` (nicht angetroffen), `completed` (durchgeführt),
   `documented` (dokumentiert), `invoiced` (abgerechnet). `requested` (angefragt) und `tentative`
   (vorgemerkt) sind beschrieben, gegen einen zweiten Automaten im Portal, aber nicht gebaut und
   nicht in der Constraint (ADR-014); sie entstehen erst mit der Plattform (§4.6).
2. **Die Übergänge.** Geschrieben wird nur über `SECURITY DEFINER`-Funktionen mit eigener
   Rollenprüfung (ADR-004), nie frei über die Tabelle. `cancelled` ist endgültig, auch über
   `invoiced` und zurück: Versehentlich Abgesagtes wird neu angelegt. `documented` kehrt nicht nach
   `confirmed` zurück: korrigiert wird in der Dokumentation (ADR-016), ohne Statusänderung.
   - Terminverwaltung: `create_appointment` (→ `confirmed`), `cancel_appointment` mit Grund
     (`confirmed` → `cancelled`), `record_no_show` (`confirmed` → `no_show`, Anlass nach Punkt 9).
   - Therapeutische Rollen: `complete_appointment` (`confirmed` → `completed`), `reopen_appointment`
     (`completed`, `no_show` → `confirmed`), an `documented` je nur der Haken (Fassung 5).
   - Im selben Vorgang: Finalisierung (ADR-016, auch automatisch) aus `completed` und `confirmed`
     (Fassung 3) → `documented`; Rechnung (ABR-003) `documented`, `no_show`, `cancelled` mit Anlass
     (Fassung 2) → `invoiced`; ihr Storno (ADR-009) zurück, auch → `cancelled` (Fassung 3).
3. **`documented` und `invoiced` werden gesetzt, nicht abgeleitet:** vom Vorgang, dem die Tatsache
   gehört, in derselben Transaktion, nie von Hand oder nachträglich. Invariante, beide Richtungen in
   `pnpm test:db`: `documented` genau dann, wenn eine finalisierte Dokumentation existiert,
   `invoiced` genau dann, wenn eine ausgestellte, nicht stornierte Rechnung den Termin führt.
4. **Das Ausfallhonorar ist ein Kennzeichen, kein Geldbetrag und kein Zustand** (Fassung 2, 3):
   `fee_basis` sagt nur, ob und woraus eine Gebühr entsteht; wie viel, sagt der Leistungskatalog
   (ABR-001), ob eine Rechnung entsteht, ABR-003. Nur der Server setzt ihn, `late_cancellation` nach
   Punkt 8, `no_show` nach Punkt 9; Bestandszeilen aus Fassung 1 tragen `no_show`.
5. **Die Serie hat keinen Status:** Sie ist eine Erzeugungsregel (CAL-007), jeder Termin hat seinen
   Status; „die Serie absagen“ heißt n Einzelabsagen.
6. **Migration der Bestandsdaten** (CAL-008): `scheduled` → `confirmed`, `completed` mit
   finalisierter Dokumentation → `documented`, sonst bleibt der Wert. Der Absagegrund ist Pflicht
   für jede neue Absage; Bestandszeilen behalten `null`, er wird nicht rückwirkend erfunden.
7. **Was der Automat nicht regelt:** keine Übergänge durch Zeitablauf (ein vergangener Termin wird
   nicht von selbst `completed` oder `no_show`; ADR-016 Punkt 7 bleibt unberührt), keine
   Zustandsänderung offline (ADR-001), keine Statusänderung ohne Nachweis (ADR-010 Punkt 15).
8. **Die Frist des Ausfallhonorars** (Fassung 2): Sagt die Patient:in weniger als 24 Stunden vor
   Behandlungsbeginn ab, entsteht eine Ausfallgebühr. Nr. 1: Der Eingang der Absage in der Praxis
   ist ein eigenes Datum (`cancellation_received_at`), getrennt vom Eintrag (`cancelled_at`). Nr. 2:
   Die Frist rechnet der Server aus Eingang und vereinbartem Beginn, nie aus der Eingabezeit und nie
   im Browser (§19). Nr. 3: Genau 24 Stunden liegen außerhalb; gezählt wird in absoluten Stunden mit
   Zeitzone, auch über die Zeitumstellung. Nr. 4 (Fassung 4): Es zählt, was die Patient:in
   veranlasst: `patient_request` und `patient_moved` (eine Verlegung nennt, wer sie veranlasst), nie
   `practice_moved`, `practice_request` oder `other`; der Bestandswert `moved` gilt unverändert;
   wird nur die Zeit geändert, ist nichts ausgefallen (ANN-212). Nr. 5 (Fassung 3): Das
   Nichtantreffen am Hausbesuch regelt Punkt 9, am Praxis- und Videotermin bleibt es ein Tap ohne
   Formular und Gebühr (ANN-055). Nr. 6 (Fassung 4): Ein bewusster Verzicht im Einzelfall lässt
   `fee_basis` stehen und vermerkt Zeitpunkt und Person (`fee_waived_at`, `fee_waived_by`); danach
   ist der Anlass nicht mehr abrechenbar, wer und bis wann: ANN-213. Bestandsdaten bekommen
   nachträglich keine Gebühr, und ein Vorgang mit Gebührenanlass wird nicht nach der Dreijahresfrist
   gelöscht (ADR-008, ANN-035).
9. **Die drei Hausbesuch-Szenarien** (Fassung 3, E14, §8). Nr. 1: Nach bestätigtem Protokoll (15
   Minuten gewartet, geklingelt, angerufen) setzt `record_no_show` den Anlass `no_show`; ohne
   Bestätigung bleibt der Termin `confirmed`, bis die behandelnde Person entscheidet; der Vermerk
   zählt nicht als Behandlung oder verbrauchte Verordnungsleistung. Nr. 2 (Szenario 1): „Tür
   geöffnet, keine Behandlung“ (auf Angabe der Patient:in) ist kein eigener Zustand: Er gilt als
   durchgeführt, wird über `complete_treatment` mit Pflichtvermerk
   `treatment_notes.visit_without_treatment` dokumentiert (nie Freitext als einzige Quelle), nach
   Punkt 10 abgehakt und normal abgerechnet, ohne Gebühr. Nr. 3: Die Oberfläche erklärt die
   Szenarien, ohne Auswertung je Person (§20). Nr. 4: Rechnungstext und Rechtsgrundlage für Nr. 2
   (Vergütung ohne erbrachte Behandlung) klärt B4.
10. **Der Haken am Behandlungstermin** (Fassung 5, BEF-154, BEF-157): Dokumentieren und Abhaken sind
    getrennt, abgehakt wird in Übersicht oder Kalender, der Haken heißt „Leistung erbracht“. Nr. 1:
    Ein Merkmal, kein neunter Zustand (`completed_at`, `completed_by`); `completed` heißt abgehakt,
    nicht dokumentiert, `documented` steht mit oder ohne Haken. Nr. 2: Die Finalisierung hakt nicht
    ab (ADR-016 Punkt 4). Nr. 3: Zurücknehmen geht jederzeit (Punkt 2); wer und wann: `reopened_by`,
    `reopened_at`. Nr. 4: Mit dem Haken entsteht die Leistung, mit der Rücknahme fällt sie (ADR-009
    Punkt 24), solange keine Rechnung, auch kein Entwurf, sie führt, sonst hält der Vorgang an; nach
    der Freigabe der Grundlage ist der Haken gesperrt (ADR-020 Punkt 9). Nr. 5: Am Trainingstermin
    hakt das Protokoll mit ab (ADR-022 Punkt 6, ANN-036).

## Konsequenzen
§19 bekommt seinen Anker: Fakturiert wird nur aus `documented` oder mit Gebührenanlass, ohne
Override; abhaken geht ohne Dokumentation, die Sperre sitzt an der Rechnung (ANN-005).

## Offene Folgefragen
- Wie verhält sich der Automat, wenn eine andere Person abschließt als die behandelnde?
- Soll die Praxis sehen, wie oft eine Patient:in nicht angetroffen wurde (Auswertung nach §20)?

## Änderungshistorie
- Fassung 1 (2026-09-11, Jannes): angenommen, sieben Fragen wie empfohlen; §8 nachgezogen.
- Fassung 2 (2026-09-12, Jannes): Punkt 8, 24-Stunden-Frist; Punkt 4 neu, Umkehr von Frage 6.
- Fassung 3 (2026-09-13, Jannes, E14): Punkt 9, Hausbesuch-Szenarien; Umkehr in Punkt 4;
  `confirmed → documented`, Storno-Rückweg.
- Fassung 4 (2026-10-02, Jannes, BEF-094): Punkt 8 Nr. 4, Verlegung mit Gebühr, und Nr. 6, Verzicht.
- Fassung 5 (2026-10-14, Jannes): Punkt 10 Haken (B4, B7); Umkehr in Punkt 2: Doku hakt nicht ab.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
