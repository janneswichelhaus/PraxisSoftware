# ADR-020: Die Behandlungsgrundlage — Verordnung und Selbstzahler unter einer Klammer
## Status
Angenommen 2026-09-16 (Jannes, E16), geltend Fassung 2 (2026-10-14); Protokoll nur nach ADR-010.

## Kontext
Termine sollen in der Akte je Abrechnungsgrundlage gruppiert sein, auch ohne Verordnung beim
Selbstzahler (Jannes, 2026-09-16). Nicht Gegenstand: Preise, Pakete, Vorauszahlung (B11, ABR-001).

## Entscheidung
1. **Ein Termin hängt an einer Behandlungsgrundlage** der Bauart Verordnung (auch das Privatrezept;
   die Art ist nicht der GKV-Rezepttyp) oder Selbstzahler; weitere nicht auf Vorrat (ADR-014, §11).
2. **Erweitert wird die bestehende Tabelle, keine zweite:** `prescriptions` heißt seit Fassung 1.1
   `treatment_bases`; Bestandszeilen behalten ihre Art, Inhalte werden nicht migriert.
3. **Was eine Verordnung braucht, verlangt die Datenbank nur von ihr:** `prescriber_id` bei `first`
   und `follow_up`, nie bei `self_pay`; `issued_on` immer (Selbstzahler: Tag der Vereinbarung).
4. **Die klinischen Felder bleiben klinisch** und beim Selbstzahler leer
   (`treatment_bases_clinical_only_for_prescription`); Datenklasse (klinische Patientenakte, zehn
   Jahre, ADR-008) und Rollenschnitt (ADR-004, E15) bleiben, auch bei leerer Diagnose.
5. **Die Menge heißt für beide Bauarten gleich:** `prescribed_quantity` ist die Anzahl möglicher
   Termine, eine Planungsgröße, verordnet oder vereinbart; `used_quantity <= prescribed_quantity`
   gilt für beide, schützt die Abrechnung (§13), nicht die Planung: mehr planen darf man (CAL-022).
6. **Planungsklammer, keine Rechnungseinheit:** Leistungen und Rechnungen bleiben unabhängig von der
   Grundlage (§19, ADR-009 Punkte 3 und 4); mehrere Rechnungen je Grundlage sind normal (E16).
7. **Die Oberfläche nennt die Bauart** („Verordnung vom …“, „Selbstzahler seit …“),
   „Behandlungsgrundlage“ nur, wo beide gemeint sind; die Adressen vorerst `verordnungen` (ANN-062).
8. **Neue Auditwerte, unberührte Historie:** Zu `prescription.*` treten Werte der neuen Benennung;
   alte bleiben zulässig, auch in `subject_type`: Auditzeilen werden nie umgeschrieben (ADR-010).
9. *(Fassung 2)* **Stand und Freigabe zur Abrechnung.** Freigeben geht, sobald jeder Termin abgehakt
   und dokumentiert, abgesagt oder nicht angetroffen ist, auch vor dem letzten verordneten
   (Vorschlag, wenn alle erbracht sind). Danach sperrt der Server Doku, Zeitpunkt und Anzahl der
   Termine (`app.treatment_basis_locked`, ADR-016 Punkt 11); zurückholen geht, solange keine
   Rechnung sie führt (ADR-009 Punkt 24); beides mit Zeitpunkt und Person (ADR-010 Punkt 15). Den
   Stand rechnet nur `app.treatment_basis_billing`.

## Konsequenzen
Selbstzahler nutzen Gruppierung, Terminzahl, Deckung und Serienplanung der Verordnung.

## Änderungshistorie
- Fassung 1 (2026-09-16, Jannes, E16): Punkte 1 bis 8; das Privatrezept ist keine dritte Bauart.
- Fassung 1.1 (2026-09-18, SPEC von GRD-001): Bezeichner festgelegt, keine Entscheidung geändert.
- Fassung 2 (2026-10-14, Jannes, B1, B7): Punkt 9, Stand der Grundlage, Freigabe zur Abrechnung.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
