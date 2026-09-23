# Abnahme — Etappe L: Zwei Leistungsbereiche im Fundament

Prüfschritte der Loops aus **Etappe L**
([`../development/ROADMAP.md`](../development/ROADMAP.md)). Voraussetzung und
Aufbau stehen in [`README.md`](README.md).

## ABR-EPIC-004 — Befreiungsgrund und § 14c-Riegel

Prüfschritte zu **ABR-006** und **ABR-007**. Grundlage: ADR-009
Punkt 18 (§ 14 Abs. 4 Nr. 8 UStG und der § 14c-Riegel), **BEF-019** und
**ANN-082**.

**Dieser Loop bringt zwei Migrationen**
(`20260920120000_invoice_tax_exemption_reason.sql`,
`20260920121000_invoice_tax_lock.sql`) und **keinen geänderten Seed**: vorher
`git pull origin main`, dann `pnpm dlx supabase@2.116.0 db reset`.

Alles als `olivia.office@praxis.invalid` (office). Eine ausgestellte Rechnung
wird gebraucht; wie sie entsteht, steht in
[`etappe-1-kernprozess.md`](etappe-1-kernprozess.md), Abschnitt ABR-EPIC-002a.

### 1. Der Grund steht auf der Rechnung

1. **Abrechnung → Rechnungen** und eine Rechnung über eine Behandlung öffnen
   (Krankengymnastik, Manuelle Therapie — alles, was keine Selbstzahlerleistung
   ist). Erwartung: Unter dem Gesamtbetrag steht die Steuergruppe
   „Heilbehandlung, umsatzsteuerfrei: … €" und **dahinter** der Satz
   „Steuerfreie Heilbehandlung nach § 4 Nr. 14 Buchstabe a UStG".
2. **Rechnung als Blatt** öffnen. Erwartung: Derselbe Satz an derselben
   Stelle. Er ist **Pflichtangabe**, nicht Beiwerk — ohne ihn wäre die
   Rechnung unvollständig.
3. Das Blatt über den Browser drucken (oder in die Druckvorschau gehen).
   Erwartung: Der Satz steht auf dem Papier, nicht nur am Bildschirm.

### 2. Der Grund kommt aus dem Snapshot, nicht aus der Anzeige

1. Eine Leistung mit der **Selbstzahlerleistung** erfassen und eine zweite
   Rechnung ausstellen. Erwartung: Dort steht „Umsatzsteuerpflichtig: 60,00 €
   · darin enthaltene Umsatzsteuer 9,58 € (19 %)" und **kein**
   Befreiungsgrund — an einem steuerpflichtigen Posten steht die Steuer
   selbst.
2. Eine Rechnung mit **beiden** Positionen (Behandlung und Training)
   ausstellen. Erwartung: Zwei Steuergruppen untereinander, der
   Befreiungsgrund nur an der steuerfreien.

### 3. Der § 14c-Riegel

Dieser Teil ist **nicht über die Oberfläche auslösbar** — und das ist die
Zusage: Die Anwendung bietet keinen Weg an, auf dem eine Rechnung mit
falschem Steuerausweis entsteht. Geprüft wird er deshalb serverseitig in
`pnpm test:db` (elf Fälle, nach ADR-009 Punkt 18 verbindlich).

1. Zum Nachsehen genügt ein Blick: Keine ausgestellte Rechnung weist an einer
   steuerfreien oder nicht steuerbaren Gruppe einen Steuerbetrag aus, und die
   ausgewiesene Gesamtsteuer ist die Summe der Gruppen.
2. Unter **Abrechnung → Praxisstammdaten** die Kleinunternehmerregelung
   einschalten und eine **neue** Rechnung über eine Selbstzahlerleistung
   ausstellen. Erwartung: **Kein** Steuerausweis, dafür der Hinweis nach § 19
   UStG. Danach den Status wieder zurückstellen — die bereits ausgestellten
   Rechnungen ändern sich dadurch nicht, sie tragen ihren Snapshot.

### 4. Was dieser Loop nicht bringt

Getrennte Nummernkreise je Leistungsbereich, den Leistungsbereich an der
Katalogposition, „ein Bereich je Rechnung" und die Auswertung „Einnahmen je
Leistungsart" — das sind **ABR-EPIC-005** und **ABR-EPIC-006**. Der
**Wortlaut** des Befreiungshinweises steht als Annahme (**ANN-082**) und
wartet auf die Steuerberatung (B4, G13).

## LEI-EPIC-001 — Trainingsverhältnis, eigene Frist, Trainingsbetreuung

Prüfschritte zu **LEI-001** bis **LEI-003**. Grundlage: ADR-021 (Punkte 1 bis 6),
`PROJECT_PRINCIPLES.md` §4.8 und §4.9, ADR-008.

**Dieser Loop bringt drei Migrationen**
(`20260920130000_training_relationships.sql`,
`20260920131000_training_retention.sql`, `20260920132000_training_role.sql`)
**und einen geänderten Seed**: vorher `git pull origin main`, dann
`pnpm dlx supabase@2.116.0 db reset`.

### 1. Es gibt nichts zu klicken — und das ist die Zusage

Dieser Loop legt das Fundament, nicht die Oberfläche. Es entsteht keine neue
Seite, kein neuer Knopf und kein neuer Menüpunkt; der Trainingsbereich selbst
ist E18 Schritt 7. Die Abnahme am Bildschirm besteht deshalb aus einer
**Gegenprobe**: Melde dich als `anna.beispiel@praxis.invalid` (therapist) an
und sieh nach, dass sich nichts geändert hat — Kartei, Kalender, Akte,
Abrechnung wie vorher, und **Tina Trainingskundin taucht nirgends auf**, weder
in der Patientensuche noch in der Funktionssuche (Strg/Cmd + K).

### 2. Die Trennung selbst — serverseitig geprüft

Sie hängt an den Policies und nicht an der Oberfläche; ausgeblendete Elemente
wären keine Zugriffskontrolle (ADR-004 Punkt 5). Nachgewiesen ist sie in
`pnpm test:db`: 21 Fälle, davon acht zu „kein Durchgriff" in **beide**
Richtungen — die Trainingsbetreuung sieht weder Kartei noch Dokumentation noch
Behandlungsgrundlagen, die therapeutischen Rollen sehen kein
Trainingsverhältnis, und eine Person ohne Akte bleibt der Behandlungsseite auch
als Name verborgen.

### 3. Was dieser Loop nicht bringt

Keine Trainingsoberfläche und keine Schreibwege für das Verhältnis; die Rolle
**Trainingsbetreuung** ist deshalb über **Team → Zugang** noch nicht zuweisbar.
Keine Screening- oder Gesundheitsangaben und damit auch keine Frist für sie —
sie bleibt bei **B2**. Keine Verknüpfung von Terminen mit dem
Trainingsverhältnis: Das ist **CAL-EPIC-005**.

## CAL-EPIC-005 — Terminkontext, Trainingsgrundlage, kein Durchgriff

Prüfschritte zu **CAL-024** bis **CAL-026**. Grundlage: ADR-022 (alle elf
Punkte), ADR-020 (unverändert), ADR-021 Punkt 6, ADR-008.

**Dieser Loop bringt drei Migrationen**
(`20260921100000_appointment_context.sql`,
`20260921110000_training_basis.sql`,
`20260921120000_appointment_context_guards.sql`) **und keinen geänderten
Seed**: vorher `git pull origin main`, dann
`pnpm dlx supabase@2.116.0 db reset`.

### 1. Auch hier gibt es nichts zu klicken — und auch das ist die Zusage

Es entsteht keine Seite für Trainingstermine; sie anzulegen ist erst mit dem
Trainingsbereich möglich (E18 Schritt 7). Die Abnahme am Bildschirm ist wieder
eine **Gegenprobe**: als `anna.beispiel@praxis.invalid` (therapist) anmelden
und nachsehen, dass Kalender, Tagesliste, Akte und Abrechnung unverändert sind.
Der Kalender zeigt weiterhin genau Behandlungstermine und Ereignisse — und
nichts Drittes, auch dann nicht, wenn in der Datenbank Trainingstermine
stehen.

### 2. Der Kontext und seine drei Grenzen — serverseitig geprüft

Sie hängen an Constraints, Policies und Triggern, nicht an der Oberfläche.
Nachgewiesen in `pnpm test:db`, 42 Fälle:

- **Ein Verhältnis je Termin oder keines** — ein Behandlungstermin ohne
  Patient:in, ein Trainingstermin mit Patient:in, ein Termin mit **beiden**
  Verhältnissen und ein interner Termin mit Gegenüber sind schemaseitig
  unmöglich. Ebenso ein Trainingstermin an der Behandlungsgrundlage: Training
  kommt damit nicht in die Patientenakte.
- **Lesen filtert nach Kontext** — die Trainingsbetreuung liest keinen
  Behandlungstermin, die therapeutischen Rollen lesen keinen Trainingstermin,
  und `owner` und `office` lesen beides, weil sie in beiden Bereichen stehen.
  Der Kalender und die Tagesliste ziehen nach; die Policy allein genügte nicht.
- **Die Belegung bleibt gemeinsam** — fällt ein Behandlungstermin auf einen
  Trainingstermin, meldet der Server „belegt" und nennt weder Person noch
  Kontext noch eine Kennung. Das ist der bewusst bezahlte Preis des einen
  Kalenders (ADR-022 Punkt 11).
- **Dokumentiert wird nur die Behandlung** — der Riegel sitzt an
  `treatment_notes` und gilt damit auch für Schreibwege, die es noch nicht
  gibt; die automatische Finalisierung erreicht einen Trainingstermin nicht.
- **Gelöscht wird je Zeile am Kontext** — ein Trainingstermin fällt mit seinem
  Verhältnis nach dessen Frist, nicht nach der Frist für Termine ohne Nachweis.

### 3. Was dieser Loop nicht bringt

Keine Oberfläche und keine Schreibwege für Trainingstermine oder
Trainingsgrundlagen. Kein Trainingsprotokoll — und damit ist der Zustand
`documented` an einem Trainingstermin nicht erreichbar (ADR-022 Punkt 8; ein
Zustand, den niemand setzen kann, wird nicht vorgebaut). Kein Gebührenanlass
im Training: ob die Absage unter 24 Stunden auch im Dienstvertrag über Training
einen Anspruch begründet, ist **deine** Vertrags- und AGB-Frage; bis zur
Antwort gilt ADR-018 Punkt 8 nur für die Behandlung. Und keine Umbenennung der
Bestandswerte `treatment` und `event` — sie ist als **CAL-027** abgetrennt und
am 2026-09-21 nachgezogen worden (siehe unten).

## ABR-EPIC-005 — Ein Bereich je Rechnung, getrennte Nummernkreise

Prüfschritte zu **ABR-008**, **ABR-009** und **ABR-010**. Grundlage: ADR-009
Punkte 15 bis 17 und ADR-021 Punkt 2.

**Dieser Loop bringt drei Migrationen**
(`20260921130000_service_area.sql`, `20260921140000_invoice_service_area.sql`,
`20260921150000_invoice_number_series_per_area.sql`) **und einen geänderten
Seed**: vorher `git pull origin main`, dann
`pnpm dlx supabase@2.116.0 db reset`. Die Preisliste trägt danach eine
Position mehr — **Personal Training (Einzelstunde)** im Bereich Training —,
und die frühere „Trainingseinheit (Selbstzahler)" heißt
**Selbstzahlerleistung ohne Heilbehandlungszweck** und steht im Bereich
Behandlung.

### 1. Der Bereich steht an der Katalogposition

1. Als `jannes.test@praxis.invalid` (owner) **Abrechnung → Leistungskatalog**
   öffnen. Erwartung: Jede Position nennt jetzt zuerst ihren **Bereich** —
   „Behandlung" oder „Training" —, dann Art und Steuerkennzeichen.
2. **Neue Preisliste** als Kopie der geltenden anlegen und eine Position auf
   **Training** stellen. Erwartung: Die Auswahl „Bereich" steht neben „Art";
   die Kopie hat den Bereich jeder Position mitgenommen.
3. An derselben Position **Steuer** auf „Heilbehandlung, umsatzsteuerfrei"
   stellen. Erwartung: Die Zeile meldet „Training ist keine Heilbehandlung und
   damit nicht umsatzsteuerfrei", und **Entwurf speichern** ist gesperrt. Den
   Entwurf danach verwerfen.

### 2. Der Terminkontext entscheidet, was erfassbar ist

1. Als `olivia.office@praxis.invalid` (office) **Abrechnung → Leistungen
   erfassen** und einen dokumentierten Behandlungstermin öffnen. Erwartung: In
   der Auswahl steht **kein** „Personal Training" — angeboten wird nur, was zum
   Bereich des Termins gehört. Die Oberfläche bietet nichts an, was der Server
   anschließend abweist.

### 3. Eine Rechnung trägt genau einen Bereich

1. **Abrechnung → Rechnungen**. Erwartung: Jede Zeile unter „Abzurechnen"
   nennt neben Monat und Person den **Bereich**; jede Rechnung darunter
   ebenfalls — auch ein Entwurf, der noch keine Nummer trägt.
2. Einen Entwurf anlegen und ausstellen. Erwartung: Die Nummer beginnt mit dem
   Kürzel des Behandlungskreises (`RG-JAHR-0001`).
3. Die Rechnung **stornieren**. Erwartung: Das Stornodokument trägt die
   **nächste** Nummer desselben Kreises (`RG-JAHR-0002`) — es gehört zu seiner
   Rechnung, nicht zum Tag, an dem storniert wurde.

### 4. Zwei Kreise, zwei Kürzel

1. Als owner **Abrechnung → Stammdaten**. Erwartung: Unter „Rechnungen" stehen
   **zwei** Kürzel — eines für die Behandlung (`RG`), eines für das Training
   (`TR`); die Auskunftsansicht nennt beide unter „Nummernkreise".
2. Beide auf denselben Wert setzen und **Speichern**. Erwartung: „Die beiden
   Kürzel der Rechnungsnummer müssen sich unterscheiden." Nichts wird
   gespeichert — zwei lückenlose Kreise mit demselben Kürzel ergäben dieselbe
   Nummer zweimal (§ 14 Abs. 4 Nr. 4 UStG erlaubt mehrere Zahlenreihen, keine
   doppelten Nummern).

### 5. Was dieser Loop nicht bringt

Keine Trainingsrechnung: Eine Leistung hängt weiter an einer Patientin, ein
Trainingstermin hat keine — der Schreibweg des Trainings gehört zu E18
Schritt 7. Die Trainingsposition im Katalog lässt sich deshalb anlegen und an
keinem Termin erfassen; das ist der gewollte Zwischenstand. Kein ermäßigter
Steuersatz: Er ist angelegt und **nicht aktiviert**, bis die Steuerberatung
ihn freigibt (**B4**) — eine Position mit 7 % weist die Datenbank ab. Und
keine Auswertung „Einnahmen je Leistungsart" — das ist **ABR-EPIC-006**.

---

## ABR-EPIC-006 — Einnahmen je Leistungsart

Prüfschritte zu **ABR-011**. Grundlage: ADR-009 Punkt 19.

**Dieser Loop bringt eine Migration**
(`20260921160000_revenue_by_service_area.sql`) **und keinen geänderten Seed**:
vorher `git pull origin main`, dann `pnpm dlx supabase@2.116.0 db reset`. Die
Migration ändert keine Tabelle und legt keinen Schreibweg an — sie fügt zwei
lesende Funktionen hinzu.

Vorbereitung für die Schritte 2 und 3: eine Rechnung mit **zwei**
Steuergruppen. Also einen dokumentierten Termin mit **Krankengymnastik**
(steuerfrei) und einen zweiten mit **Selbstzahlerleistung ohne
Heilbehandlungszweck** (19 %) im selben Monat erfassen, daraus einen Entwurf
bauen und ihn **ausstellen**.

### 1. Ohne Grundlage keine Zahl

1. Als `olivia.office@praxis.invalid` (office) **Abrechnung → Auswertung**
   öffnen. Erwartung: „Grundlage" steht auf **„Bitte wählen …"**, und unter
   „Ergebnis" steht **keine Zahl**, sondern „Noch keine Grundlage gewählt".
   Das ist kein fehlender Ladezustand: Zufluss und Rechnungsstellung ergeben
   verschiedene Zahlen, und welche gilt, entscheidet die Steuerberatung (B9).
2. Als `anna.beispiel@praxis.invalid` (Therapie) anmelden. Erwartung: Der
   Bereich Abrechnung fehlt in der Navigation — und `/abrechnung/auswertung`
   direkt aufgerufen liefert kein Ergebnis. Die Sperre sitzt an der
   Serverfunktion, nicht an der ausgeblendeten Zeile.

### 2. Rechnungsstellung und Zufluss sagen verschiedenes

1. Als office auf der Auswertung **Grundlage → Rechnungsstellung**. Erwartung:
   Unter „Behandlung" stehen **zwei** Zeilen — „Heilbehandlung,
   umsatzsteuerfrei" mit 45,00 € und „Umsatzsteuerpflichtig · 19 %" mit
   60,00 €, dazu „enthaltene Umsatzsteuer 9,58 € · netto 50,42 €". Die Summe
   darunter heißt **„Summe Behandlung · Rechnungsstellung"**.
2. **Grundlage → Zufluss**, ohne sonst etwas zu ändern. Erwartung: Die
   Auswertung sagt „Keine Zahlen in diesem Jahr" — die Rechnung ist
   ausgestellt, aber nicht bezahlt. Dass dieselbe Rechnung auf zwei Grundlagen
   zwei verschiedene Antworten gibt, ist der Zweck der Trennung.
3. Die Rechnung **vollständig** bezahlen (Abrechnung → offener Posten →
   Buchen), dann zurück auf die Auswertung, Grundlage **Zufluss**. Erwartung:
   Dieselben zwei Zeilen und dieselben Beträge wie in Schritt 1.

### 3. Das Storno kehrt um, die Teilzahlung wird verteilt

1. Erst die **Zahlung** aus Schritt 2 stornieren (Abrechnung → Zahlungen →
   Stornieren, Grund „Abnahme"), dann die **Rechnung** (Grund „Abnahme") — in
   dieser Reihenfolge, weil eine Rechnung mit stehender Zahlung sich nicht
   stornieren lässt. Erwartung auf der Grundlage **Rechnungsstellung**: Beide
   Zeilen stehen auf **0,00 €** und nennen **„2 Dokumente"**. Sie verschwinden
   nicht: Ausgestellt und wieder zurückgenommen ist etwas anderes als „nichts
   passiert".
2. Aus den wieder freien Leistungen eine neue Rechnung bauen und **ausstellen**.
   Erwartung: Dieselben Zeilen stehen wieder bei 45,00 € und 60,00 €, jetzt mit
   **„3 Dokumente"** — Rechnung, Storno, Korrekturrechnung.
3. Auf die neue Rechnung **50,00 €** buchen, dann Grundlage **Zufluss**.
   Erwartung: „Heilbehandlung, umsatzsteuerfrei" 21,43 €,
   „Umsatzsteuerpflichtig · 19 %" 28,57 € — zusammen **genau 50,00 €**. Die
   Zahlung gilt keinem einzelnen Posten; sie wird anteilig nach Bruttoanteil
   verteilt (**ANN-088**), und kein Cent verschwindet. Die stornierte Zahlung
   aus Schritt 1 steht in keiner Summe mehr.

### 4. Was dieser Loop nicht bringt

Keine Gewinnermittlung, keinen steuerlichen Abschluss und keine Bewertung: Die
Seite fasst zusammen, was in ausgestellten Dokumenten und gebuchten Zahlungen
steht — der Schlusssatz unter der Auswertung sagt das auch dort. Keinen Export
für die Steuerberatung (`IDEA-PRX-026`, wartet auf **B4**) und keine
Kennzahlen (`IDEA-PRX-025`). Keine Zahl über beide Bereiche — die gibt es
bewusst nicht. Und keine Trainingszeile, solange es für Training keinen
Schreibweg gibt (E18 Schritt 7): Der Bereich erscheint erst, wenn eine
Trainingsrechnung existiert.

## CAL-027 — Die Bestandswerte heißen wie die Bereiche

Nachzug zu CAL-EPIC-005. Grundlage: ADR-022 Punkt 2 und die offene Folgefrage
desselben ADR, ADR-021 Punkt 9.

**Dieser Loop bringt eine Migration**
(`20260921170000_appointment_kind_rename.sql`) **und einen geänderten Seed**:
vorher `git pull origin main`, dann `pnpm dlx supabase@2.116.0 db reset`.

### 1. Am Bildschirm darf sich nichts ändern — das ist die ganze Zusage

`appointments.kind` trägt jetzt `therapy` statt `treatment` und `internal`
statt `event`. Ein Wert ist kein Wort: Was ein Ereignis ist, heißt in der
Oberfläche weiterhin „Ereignis". Die Abnahme ist deshalb eine **Gegenprobe**
und dauert eine Minute: als `anna.beispiel@praxis.invalid` (therapist)
anmelden, Kalender und „Mein Tag" öffnen.

1. Der **Kalender** zeigt die Teambesprechung aus dem Seed weiter mit ihrem
   Titel und dem Quadrat davor, die Behandlungstermine weiter mit Namen.
2. **Mein Tag** zeigt „Ereignis · " vor der Besprechung und den Knopf
   „Ereignis öffnen →"; ein Behandlungstermin bleibt „Termin öffnen →".
3. Die Besprechung **öffnen**: Absagen ist möglich, Abschließen und
   Dokumentieren sind es weiterhin nicht.

Sieht eine dieser Stellen leer aus oder steht dort „Ereignis" ohne Titel, ist
eine Umbenennung nicht durchgekommen — dann bitte melden, statt weiterzuklicken.

### 2. Was der Katalog selbst sagt

Ohne Oberfläche, für den Fall, dass du es genau wissen willst — in `psql`:

```sql
select kind, count(*) from public.appointments group by 1 order by 1;
```

Erwartung: nur `therapy`, `internal` und (falls angelegt) `training`. Ein
`treatment` oder `event` in dieser Liste wäre ein Fehler; die Constraint
`appointments_kind_values` lässt beide nicht mehr zu.

### 3. Was dieser Loop nicht bringt

Keine neue Fähigkeit — er räumt einen Namen auf, mehr nicht. **Keine
Bezeichner** sind umbenannt: `event_group_id`, `event_series_id`,
`create_appointment_event` und die übrigen heißen weiter so, weil ein
RPC-Name der Vertrag zur Oberfläche ist. Keine Ausnahmetexte, kein
`billable_services.item_kind` (dort ist `treatment` eine Rechnungspositionsart
nach ADR-009), und **keine umgeschriebene Auditzeile**: Ein Ereignis, das als
`kind: event` protokolliert wurde, bleibt so stehen — ADR-022 hält
ausdrücklich fest, dass Auditzeilen nie umgeschrieben werden. Ab jetzt
protokollieren dieselben Pfade `kind: internal`.
