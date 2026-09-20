# Abnahme — Etappe L: Zwei Leistungsbereiche im Fundament

Prüfschritte der Loops aus **Etappe L**
([`../development/ROADMAP.md`](../development/ROADMAP.md)). Voraussetzung und
Aufbau stehen in [`README.md`](README.md).

## ABR-EPIC-004 — Befreiungsgrund und § 14c-Riegel

Prüfschritte zu **ABR-006** und **ABR-007**. Grundlage: ADR-009 Fassung 2
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
   (Krankengymnastik, Manuelle Therapie — alles, was keine Trainingseinheit
   ist). Erwartung: Unter dem Gesamtbetrag steht die Steuergruppe
   „Heilbehandlung, umsatzsteuerfrei: … €" und **dahinter** der Satz
   „Steuerfreie Heilbehandlung nach § 4 Nr. 14 Buchstabe a UStG".
2. **Rechnung als Blatt** öffnen. Erwartung: Derselbe Satz an derselben
   Stelle. Er ist **Pflichtangabe**, nicht Beiwerk — ohne ihn wäre die
   Rechnung unvollständig.
3. Das Blatt über den Browser drucken (oder in die Druckvorschau gehen).
   Erwartung: Der Satz steht auf dem Papier, nicht nur am Bildschirm.

### 2. Der Grund kommt aus dem Snapshot, nicht aus der Anzeige

1. Eine Leistung mit einer **Trainingseinheit** erfassen und eine zweite
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
   einschalten und eine **neue** Rechnung über eine Trainingseinheit
   ausstellen. Erwartung: **Kein** Steuerausweis, dafür der Hinweis nach § 19
   UStG. Danach den Status wieder zurückstellen — die bereits ausgestellten
   Rechnungen ändern sich dadurch nicht, sie tragen ihren Snapshot.

### 4. Was dieser Loop nicht bringt

Getrennte Nummernkreise je Leistungsbereich, den Leistungsbereich an der
Katalogposition, „ein Bereich je Rechnung" und die Auswertung „Einnahmen je
Leistungsart" — das sind **ABR-EPIC-005** und **ABR-EPIC-006**. Der
**Wortlaut** des Befreiungshinweises steht als Annahme (**ANN-082**) und
wartet auf die Steuerberatung (B4, G13).
