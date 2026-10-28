# ADR-002: Hosting und Datenstandort
## Status
Angenommen (2026-08-28), Fassung 1; entschied A2 (Datenstandort), offen bleibt dort die
Anbieterprüfung (OPS-001).

## Kontext
Physiotherapeut:innen sind Berufsgeheimnisträger (§ 203 Abs. 1 Nr. 1 StGB); Mitwirkende brauchen
neben dem AVV (Art. 28 DSGVO) eine Verpflichtung zur Geheimhaltung (§ 203 Abs. 3 StGB). Bewusst nicht
Bestandteil: konkrete Anbieter, Region und Rechenzentrum, Verschlüsselungsverfahren und
Key-Management, Backup (ADR-012), DSFA (ADR-007), Fristen (ADR-008), weitere Umgebungen und
Deploy-Rechte (ADR-010).

## Entscheidung
1. **EU/EWR.** Gesundheitsbezogene Produktionsdaten werden grundsätzlich in EU/EWR-Infrastruktur
   gespeichert und verarbeitet.
2. **US-Mutterunternehmen** sind nicht grundsätzlich ausgeschlossen, sofern die konkrete
   Verarbeitung, die Verträge und die tatsächlichen Datenflüsse unsere Anforderungen erfüllen.
3. **Prüfkatalog.** Für jeden Dienstleister mit Zugang zu Patientendaten werden vorher insbesondere
   geprüft und dokumentiert: AVV/DPA, Eignung im Hinblick auf § 203 StGB, Verschlüsselung,
   Zugriffskontrolle, Retention und Löschung, Unterauftragnehmer.
4. **Dieser ADR legt keinen konkreten Cloudanbieter fest.**
5. **Dev, Test und Produktion sind getrennte Umgebungen.**
6. **Produktionslogs** dürfen weder unnötige Patientendaten noch medizinische Freitexte enthalten.

## Konsequenzen
- Jeder neue externe Dienst mit Patientendatenkontakt bekommt ein eigenes ADR (§11). Bewertet wird
  die tatsächliche Verarbeitung (Ort, Supportzugriffe, Unterauftragnehmerketten), nicht der
  Firmensitz; die Ketten müssen nachvollziehbar bleiben. Getrennt sind Datenbanken, Konfiguration und
  Secrets; Backups und Testdaten regeln §3.2 und §3.1, Logs samt Crash-Reporting §3.6 und ADR-011.

## Offene Folgefragen
- offen: OPS-001, OPS-002 (OPEN_DECISIONS): Anbieterprüfung, Dev/Test ohne Produktionsdaten.
- Braucht ein Dienst ohne faktischen Datenzugriff die schriftliche Verpflichtung (§ 203 Abs. 4 StGB)?
- Wie umgehen mit Anbietern, die Unterauftragnehmer einseitig ändern dürfen?

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
