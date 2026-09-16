# ADR-020: Die Behandlungsgrundlage — Verordnung und Selbstzahler unter einer Klammer

## Status

**Angenommen** — vom Projektinhaber am 2026-09-16 bestätigt, alle acht Punkte
wie vorgeschlagen, dazu die Folgefrage zum Privatrezept (keine dritte Bauart).
E16 in `../decisions/OPEN_DECISIONS.md` ist damit geschlossen; der ADR steht im
Index in `CLAUDE.md` und in der Tabelle in `PROJECT_PRINCIPLES.md` §21 (0.11.1).
Er ändert keine Aussage der Prinzipien — er führt §14 und §19 für die
Planungsklammer aus.

## Datum

2026-09-16

## Kontext

Termine hängen heute an genau einer Klammer: der **Verordnung**
(`prescriptions`, VER-001). Sie trägt Verordner:in, Ausstellungsdatum,
Diagnose und die verordnete Menge je Position; die Terminserie plant gegen ihr
Kontingent (CAL-007), und die Akte zeigt Termine mit ihr (AKTE-003).

Jannes hat am 2026-09-16 festgelegt, dass Termine in der Akte **je
Abrechnungsgrundlage** gruppiert erscheinen sollen — „das kann ein
Privatrezept sein, aber auch eine Rechnung für Selbstzahler". Ein Selbstzahler
hat heute keine Klammer: Seine Termine stehen ohne Überschrift, ohne
vereinbarte Anzahl und ohne Deckung.

Zwei Wege standen zur Wahl. **Die Rechnung als Klammer** scheidet aus: Seit
E16 Teil A wird auch vor dem Ende einer Serie abgerechnet — vier von zehn
Terminen jetzt, der Rest später —, also gehören zu einem Behandlungsblock
mehrere Rechnungen. **Eine zweite Tabelle neben `prescriptions`** wäre eine
zweite Planungsmechanik mit eigener Serienplanung, eigener Deckung und eigenen
Policies, für dieselbe Sache.

Der Umbau ist jetzt billig — die Datenbank trägt ausschließlich synthetische
Daten — und wird mit jedem Loop teurer, der auf `prescriptions` aufsetzt:
VER-EPIC-002, CAL-EPIC-004c und ABR-EPIC-001 stehen unmittelbar bevor.

## Entscheidung

**1. Ein Termin hängt an einer Behandlungsgrundlage.** Die **Verordnung** ist
eine Bauart davon, der **Selbstzahler** die zweite. Weitere Bauarten sind
möglich; sie werden **nicht** vorgebaut (ADR-014, §11).

**2. Umgesetzt wird das durch Erweitern der bestehenden Tabelle, nicht durch
eine zweite.** `prescriptions` wird umbenannt; der Bezeichner ist neutral und
englisch wie das übrige Schema (Vorschlag: `treatment_bases` mit
`treatment_base_items`, der SPEC entscheidet). `prescription_kind` bekommt
neben `first` und `follow_up` den Wert `self_pay`. Bestandszeilen behalten
ihre Art; es werden keine Inhalte migriert.

**3. Was eine Verordnung braucht, verlangt die Datenbank weiter — aber nur von
ihr.** `prescriber_id` wird nullable, mit einer Prüfung, die sie für `first`
und `follow_up` erzwingt und für `self_pay` ausschließt. `issued_on` bleibt
Pflicht und bedeutet bei einem Selbstzahler den Tag der Vereinbarung.

**4. Die klinischen Felder bleiben klinisch.** Diagnose, Leitsymptomatik,
Therapieziel, Hinweis der Verordner:in und Empfehlung zum Verordnungsende
bleiben, wo sie sind; bei einem Selbstzahler bleiben sie leer. Die Datenklasse
der Tabelle ändert sich **nicht** (klinische Patientenakte, zehn Jahre,
ADR-008), und der Rollenschnitt aus ADR-004 Fassung 2 und E15 gilt
unverändert. Eine leere Diagnose macht eine Zeile nicht organisatorisch.

**5. Die Menge heißt für beide Bauarten gleich.** `prescribed_quantity` trägt
fachlich die „Anzahl möglicher Termine" (VER-EPIC-002) — verordnet beim
Rezept, vereinbart beim Selbstzahler. Die Constraint
`used_quantity <= prescribed_quantity` **bleibt für beide bestehen**: Sie
schützt die Abrechnung (§13), nicht die Planung. Über das Kontingent hinaus
**geplant** werden darf weiterhin (CAL-022).

**6. Die Grundlage ist eine Planungsklammer, keine Rechnungseinheit.**
Leistungen und Rechnungen bleiben von ihr unabhängig (§19, ADR-009 Punkte 3
und 4). Mehrere Rechnungen je Grundlage sind der Normalfall, nicht die
Ausnahme.

**7. Die Oberfläche nennt die Bauart, nicht das Oberwort.** Sie zeigt
„Verordnung vom 3. September" oder „Selbstzahler seit 3. September"; das Wort
Behandlungsgrundlage erscheint nur dort, wo beide Bauarten zugleich gemeint
sind. Der Bezeichner im Schema ist eine Sache des Modells, nicht des
Bildschirms.

**8. Auditereignisse bekommen neue Werte, und die Historie bleibt unberührt.**
Neben `prescription.viewed/created/updated/deleted` treten die Werte der neuen
Benennung. Die alten Werte bleiben im zulässigen Wertebereich, weil
Auditzeilen **niemals** umgeschrieben werden (ADR-010). Dasselbe gilt für
`subject_type`.

## Konsequenzen

- **Ein eigener Loop vor VER-EPIC-002** (GRD-001): Migration, die acht
  Datenbankfunktionen (`create/update/delete/get_prescription`,
  `list_patient_prescriptions`, `…_clinical`, `get_prescription_slots`,
  `list_patient_prescription_slots`), Policies, Projektionen, Oberfläche,
  Abnahmeschritte und `pnpm test:db` für beide Bauarten samt Negativfällen.
- **Ein Selbstzahler bekommt Gruppierung, Terminzahl, Deckung und
  Serienplanung geschenkt** — er benutzt dieselbe Mechanik wie eine
  Verordnung.
- **Der Preis ist die Umbenennung.** Sie berührt Tabellen, Funktionen,
  Policies, Auditwerte, Typen im Frontend und Texte. Sie ist jetzt eine
  mechanische Änderung und wäre nach drei weiteren Loops auf `prescriptions`
  eine Operation am offenen Herzen.
- **Verworfen: zweite Tabelle.** Zwei Planungsmechaniken für dieselbe Sache;
  jede Regel — Deckung, Übertragung, Serie — müsste zweimal gebaut und zweimal
  getestet werden.
- **Verworfen: alles beim Alten lassen und Selbstzahlertermine ohne Klammer
  führen.** Dann bleibt die von Jannes verlangte Gruppierung für den halben
  Patientenstamm leer, und die Anzahl vereinbarter Termine steht nirgends.

## Bewusst nicht Bestandteil dieser Entscheidung

- **Keine Preise, keine Pakete, keine Vorauszahlung.** Eine Anzahl möglicher
  Termine ist eine Planungsgröße — kein verkauftes Paket und keine Anzahlung
  (B11: vorerst nicht anbieten; Preise kommen mit ABR-001).
- **Keine Änderung an Abrechnung, Leistungen oder Rechnungszuständen**
  (ADR-009 unverändert).
- **Keine neue Bauart auf Vorrat.** „Weitere Methoden" bekommen ihren Wert,
  wenn sie gebraucht werden.
- **Keine Änderung am Rollenschnitt** (ADR-004, E15) und keine an der
  Aufbewahrung (ADR-008).

## Offene Folgefragen

- Der **genaue Bezeichner** in Schema und Code — der SPEC von GRD-001 legt ihn
  fest und prüft ihn gegen die bestehende Namensgebung.
- ~~Ist das „Privatrezept" eine dritte Bauart?~~ **Beantwortet am 2026-09-16
  (Jannes): nein.** Die vorhandene Verordnung **ist** das Privatrezept — die
  Praxis rechnet privat ab, und `prescription_kind` war von Anfang an bewusst
  nicht der GKV-Rezepttyp (ADR-009). Es bleibt bei zwei Bauarten:
  Verordnung (`first`, `follow_up`) und Selbstzahler (`self_pay`).
- Ob eine Grundlage **abgeschlossen** werden kann, ohne dass alle Termine
  stattgefunden haben — heute endet eine Verordnung faktisch mit ihrem
  Kontingent. Gehört zu CAL-EPIC-004c.

## Änderungshistorie

| Fassung | Datum | Änderung |
| --- | --- | --- |
| 1 | 2026-09-16 | Erstfassung, vorgeschlagen nach E16 (Jannes, 2026-09-16) |
