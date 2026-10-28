# Datenschutz: Prüfpaket

Index der Unterlagen für die Datenschutz- und Rechtsprüfung (Anfrage B2 mit B3, B5, B7 und B9;
Roadmap G14), in der Reihenfolge, in der die Prüfung sie bekommt. Das Paket steht bis Ende 2026 und
geht ab Anfang 2027 hinaus (E-1); später Gebautes folgt als Nachtrag. Der Index nennt Orte, keine
Inhalte: Was gilt, steht in Datenbank und Code, was entschieden ist, in Prinzipien und ADRs. **Vor
echten Patientendaten** liegen die Schritte 2 bis 9 vor (ADR-007 Punkte 1, 3 und 5), und jeder
Eintrag aus Schritt 10 ist geprüft (M3).

## Reihenfolge

1. **Rahmen und Stand:** [ADR-007](../adr/ADR-007-data-protection-impact-assessment.md) (DSFA vor
   echten Daten, Wiedervorlage bei wesentlicher Änderung), §3 und §3.7; Stand je B-Punkt in
   [`OPEN_DECISIONS.md`](../decisions/OPEN_DECISIONS.md) („Offene Punkte“, „Externe Prüfungen“),
   Wortlaut der Anfragen und Zweckbestimmung (B1) in [`ANFRAGEN.md`](../decisions/ANFRAGEN.md).
2. **Schwellwertprüfung und DSFA** (ADR-007 Punkte 1 bis 3): offen, Entwurf von Claude, künftig
   `docs/datenschutz/dsfa.md`; die Wiedervorlage zum Kartendienst steht in
   [`kartendienst.md`](kartendienst.md).
3. **Verzeichnis der Verarbeitungstätigkeiten (VVT):** offen, künftig `docs/datenschutz/vvt.md`.
   Grundlage: Personenbezug je Tabelle in `public.data_registry`, Datenklasse in
   `public.retention_assignments`; Muster eines Eintrags in `kartendienst.md`.
4. **Technische und organisatorische Maßnahmen (TOM)** mit Endgeräte-Richtlinie: offen, künftig
   `docs/datenschutz/tom.md`. Grundlage: ADR-004 (Rollen, RLS), ADR-010 (Audit), ADR-011 (Logs),
   ADR-012 (Sicherung), ADR-017 (Dateien), ADR-025 (Sitzungssperre).
5. **Lösch- und Aufbewahrungskonzept:** [ADR-008](../adr/ADR-008-data-retention-and-deletion.md)
   und die Fristen aus der Datenbank (unten); zu validieren mit B3.
6. **Auftragsverarbeiter:** [Supabase](../decisions/providerpruefung-supabase.md) und
   [Kartendienst](../decisions/providerpruefung-kartendienst.md), je mit Gate-Liste; Hosting der
   Oberfläche, SMTP, SMS und KI in der Zeile „Anbieter“ der externen Prüfungen. Die Übersicht ist
   offen, künftig `docs/datenschutz/auftragsverarbeiter.md`.
7. **Datenschutzinformationen, Einwilligungen, Verträge** (Entwürfe mit Fassung im Code):
   `src/features/privacy/datenschutz/patienteninformation.ts` (Art. 13 DSGVO), in
   `src/features/portal/platform/` die Dateien `einwilligungstexte.ts` und `vertragstexte.ts`
   (Widerruf), dazu `src/lib/vertretung.ts` (Begleitung, B5).
8. **Betroffenenrechte:** [`betroffenenrechte.md`](betroffenenrechte.md).
9. **Data-Breach-Prozess** nach Art. 33 und 34 DSGVO: offen, künftig
   `docs/datenschutz/datenpanne.md`; die Erkennung kommt mit OPS-004 (G6).
10. **Einzelfragen:** das Prüfpaket des Annahmenregisters, je Eintrag Annahme, Grundlage, Anker und
    Rücknahme; die Wiedervorlage nennt, wer prüft:
    `grep -n "· Prüfpaket ·" docs/decisions/ASSUMPTIONS.md`. Dazu die Nachweistabelle MUSS → Test
    (offen, Punkt D in `OPEN_DECISIONS.md`).

## Fristen aus der Datenbank

Fristen stehen nur in `public.retention_classes` (Frist, Anker, Norm, Annahme) und
`public.retention_assignments` (Tabelle, Löschweg); die Betriebslogs folgen
`BETRIEBSLOG_FRIST_TAGE` in `src/lib/protokoll.ts` (ADR-011 Punkt 4). Abgeschrieben wird nichts: Die
Liste für die Prüfung liefert diese Abfrage gegen eine Datenbank mit allen Migrationen, lokal
`praxis_vorlage` nach `pnpm db:start` und `pnpm test:db`.

```sql
select c.key, c.basis, c.legal_reference, c.anchor, c.retention_interval,
       c.upper_bound_anchor, c.upper_bound_interval, c.assumption_key, c.note,
       string_agg(a.table_name || ' (' || a.deletion_mode || ')', ', '
                  order by a.sort_order, a.table_name) as tabellen
  from public.retention_classes c
  left join public.retention_assignments a on a.class_key = c.key
 group by c.key
 order by c.sort_order, c.key;
```
