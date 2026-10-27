# Status · Stand 2026-10-27

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git. Abgelegte Dokumente (Archiv, Chroniken, erledigte Handoffs) zeigt
`git show eb43569:<pfad>`.

## Jetzt

**Aufräumen** (Auftrag Jannes 25.10., Entscheidungen 26. und 27.10., ROADMAP 7.22): Schritte 1 bis 4,
alle sieben Fehler, M1, M5, M7, M9, das Barometer, die Vorab-PR, 3b und sein Nachzug gemergt
(#308 bis #322). Schritt 5 (Doku): Teil A gemergt (#323); Teil B (Register 1.876 statt 7.830 Zeilen,
Prüfpaket 208, Regel F im Doku-Gate) liegt als #324 vor. Bauplan ist
`development/TIEFENANALYSE.md`.
Design-Review Lauf 1: Schritt 1 abgenommen (24.10.), Schritt 2 mit 2a bis 2d gemergt (#300, #302,
#304, #307); Schritt 3 Termine ist mit #303 vorbereitet (Handoff mit fünf Fragen, BEF-220 bis -222).
Befunde aus archivierten Sitzungen: BEF-201, BEF-202.

## Danach

Aufräumen 5, Teil C: ADRs, Prinzipien und Rest; dann Abschluss und die CI-Beschleunigung
(Vorschlag vom 27.10.; offen: Lint und Typecheck bei reiner Doku, ADR-013 Punkt 2).
Schritt 3 Termine des Design-Reviews (3a bis 3d), dann Schritte 4
bis 7 (Selbstauskunft, Nachrichten, Unterlagen, Ich), je mit freigegebenem Handoff; Briefings in
`design/review-2026-10/`. Ohne Handoff: BEF-223 (Zeitumstellung; Pfad A).

## Bei Jannes

- Spracheingabe scharfschalten: Anbieter und Mikrofon in der Testumgebung (Frage 1 im Bericht,
  https://claude.ai/artifact/YXhSe8aGzbTbPdFJMboK2g; E13); bis dahin nur die Nachbildung.
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

27.10.2026, Branch `claude/step-4-central-register-ur5k1y`: Nachzug #322 gemergt, Aufräumen 5
Teil A als #323. Keine Migration. Lokal: `git pull`.
