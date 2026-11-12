# Status · Stand 2026-11-12

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git. Abgelegte Dokumente zeigt `git show eb43569:<pfad>` (Archiv,
Chroniken, Handoffs) oder `git show 9452575:<pfad>` (Loop-Vorgaben, Sichtung, Ideen, Reviews).

## Jetzt

**Terminplaner** (Jannes 2026-11-12): Pause ✓, Endlos-Scroll, Autobuchung, ADR und Online-Buchung.

**Wartungsmodus** (#363): Fehler und Anpassungen einzeln je Session, Regel in `CLAUDE.md`,
Ablauf in `DEVELOPMENT.md`; Merge bei Jannes.

## Danach

Bis M2 (Jannes 2026-11-01, voller Umfang; MAP-007 zurückgestellt 2026-11-10): Leinwände, sobald
sie da sind; DATEV erst nach B4. **G14 parallel**: nach dem VVT die Schwellwertprüfung, TOM mit
Datenpannen, Auftragsverarbeiter, DSFA, zuletzt die Nachweistabelle; die Datenschutzinformationen
nennen die Steuerberatung.

## Bei Jannes

- Test-App neu installieren (#360).
- Den alten Branch `ccr-544f8ce7-u1sqpf` löschen (seit 3c ist alles übertragen).
- Bildsichtung von #352 bis #362 (`/sichtung`), für M2.
- Spracheingabe scharfschalten: Anbieter und Mikrofon in der Testumgebung (Frage 1 im Bericht,
  https://claude.ai/artifact/YXhSe8aGzbTbPdFJMboK2g; E13); bis dahin nur die Nachbildung.
- Übungskatalog fachlich durchsehen, jetzt am Stück unter `/uebungen/durchsicht` (ANN-386, ANN-561); ANN-475 bis
  ANN-479 ansehen (Besuch).
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

12.11.2026, Terminplaner Schritt 1: Pause frei im Kalender statt grauer Mittagspause.
