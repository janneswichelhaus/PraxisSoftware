# Status · Stand 2026-10-24

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

Design-Review Lauf 1, Schritt 2c Reiter der Übungen (24.10., Branch `claude/uebungen-reiter-2c`,
DRP-040 bis -043): Vorschau der Einheit in allen Lagen mit Dauer, auch auf der Übersicht; Plan mit
Wochenleiste, Übungszeilen und „Zum Plan“; Lesefrist, mehrere Pläne, Plan vom Gerät, „Praxis
antwortet nicht“ (BEF-197); Fenster mit Bühne; Rechner zweispaltig (ANN-720 bis -727). Parallel 2b.

**Schritt 1 ist abgenommen** (Jannes, 24.10.). Gemergt am 24.10.: 2a Bausteine der Übungen (#300),
Handoff Übungen (#299), Nacharbeit #298, 1e Übersicht (#297), 1d Einstieg (#294), 1c Türen (#295),
CI-Fix #296. Gemergt am 22. und 23.10.: Schritt 0 (#288), Handoff und Bericht (#289), 1a (#290), 1b
(#293), Daten N1/N2 (#292); BEF-179/-180 (#287).

## Danach

Nach 2b und 2c: BEF-215 (ein Inhalt für Fenster und Durchführung, alte Bausteine fort), dann 2d
Planblatt.
Unabhängig davon die Unterlagen für Schritt 3 (Briefing 3 auffrischen, Ist-Bilder) für Claude
Design. Danach Schritte 3 bis 7 (Termine, Selbstauskunft, Nachrichten, Unterlagen, Ich), je mit
freigegebenem Handoff aus Claude Design; Briefings in `design/review-2026-10/`. Ohne Handoff:
BEF-198 (Grundlage samt Verordnungsscan ins Löschjournal, übrige Löschwege von Hand durchsehen; Pfad
A).

## Bei Jannes

- Spracheingabe scharfschalten: Anbieter und Mikrofon in der Testumgebung (Frage 1 im Bericht,
  https://claude.ai/artifact/YXhSe8aGzbTbPdFJMboK2g; BEF-153); bis dahin nur die Nachbildung.
- Übungskatalog fachlich durchsehen, jetzt am Stück unter `/uebungen/durchsicht` (ANN-386, ANN-561); ANN-475 bis
  ANN-479 ansehen (Besuch).
- Reihenfolge der Bereichsüberholungen bestätigen oder ändern.
- Tübinger Standortvorlage für den Pannenablauf (bis dahin Köln mit Platzhaltern, ANN-554).
- Sichtung neu: ~170 offene Schritte werden per Bildstrecke triagiert (`sichtung/README.md`); am
  Gerät bleibt nur, was eine Hand braucht (Kamera, Passkey, Flugmodus, Sonne).
- Annahmen: bestätigen nur noch, was teuer zurückzunehmen ist (Kopf von `ASSUMPTIONS.md`);
  Datenschutz und Recht gehen ins Prüfpaket.
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

24.10.2026, Branch `claude/uebungen-reiter-2c`: Schritt 2c, keine Migration, kein Seed. Lokal:
`git pull`.
