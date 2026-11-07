# Status · Stand 2026-11-07

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git. Abgelegte Dokumente zeigt `git show eb43569:<pfad>` (Archiv,
Chroniken, Handoffs) oder `git show 9452575:<pfad>` (Loop-Vorgaben, Sichtung, Ideen, Reviews).

## Jetzt

**Verlauf für die Beratung** (ERN-EPIC-006, Sitzung vorbereiten) auf `ccr-b6bc760e-oc6u8b`; Merge bei Jannes.

## Danach

Nach Jannes 2026-11-01 der volle Umfang bis M2, im November:
ORG-EPIC-001, Schritte 5 bis 7 mit Jannes' Leinwänden, UI-003; die
Übertragung an DATEV erst nach B4; als letzte PR der Wartungsmodus (ohne Gates zu berühren). **G14
parallel**: nach dem VVT die Schwellwertprüfung, TOM mit Datenpannen, Auftragsverarbeiter, DSFA,
zuletzt die Nachweistabelle; die Datenschutzinformationen nennen die Steuerberatung.

## Bei Jannes

- Den alten Branch `ccr-544f8ce7-u1sqpf` löschen (seit 3c ist alles übertragen).
- Nach dem Merge von „Neu aufsetzen leert auch Daten aus der Bedienung“ die Test-Umgebung neu
  aufsetzen (Workflow „Test-Umgebung“, „neu aufsetzen“); der Lauf vom 31.10. brach an Daten aus der
  Bedienung ab. Bis dahin scheitert Erikas Übersicht an Terminen ohne gültige UUID (`development/BEFUNDE.md`).
- Spracheingabe scharfschalten: Anbieter und Mikrofon in der Testumgebung (Frage 1 im Bericht,
  https://claude.ai/artifact/YXhSe8aGzbTbPdFJMboK2g; E13); bis dahin nur die Nachbildung.
- Übungskatalog fachlich durchsehen, jetzt am Stück unter `/uebungen/durchsicht` (ANN-386, ANN-561); ANN-475 bis
  ANN-479 ansehen (Besuch).
- Reihenfolge der Bereichsüberholungen bestätigen oder ändern.
- Tübinger Standortvorlage für den Pannenablauf (bis dahin Köln mit Platzhaltern, ANN-554).
- Widersprüche zwischen ADR-Wortlaut und Code oder Prinzipien (`development/BEFUNDE.md`, „Doku“).
- Preise: Entwurf 2027 steht (`product/preisblatt-entwurf.md`), echte Preise kurz vor dem Start;
  G13 Umsatzsteuer vor M3 (ANN-541: ohne Verordnung 19 %? Kleinunternehmer?); B8 bis M3.
- Bilder zu den Tests für FRB-EPIC-005.
- LOG-EPIC-001: AV-Verträge Supabase und PTV; Nachweis `apply_retention()` per pg_cron;
  Backupfrist ≤ 30 Tage.
- G6c lokal prüfen (ANN-115): Schreibpfad als `therapist` → 403 und Protokolleintrag.
- Vor dem Scharfschalten: Push-Secrets erst mit OPS-001; Gerätevorgabe Diensttelefone (ADR-024
  Punkt 6).
- Ab Anfang 2027 parallel zum Bauen: OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen
  (PTV-Anfrage liegt als Entwurf in Gmail).

## Letzte Session

07.11.2026, Branch `ccr-b6bc760e-oc6u8b` ab `main`. Lokal: `git pull`, Migrationen.
