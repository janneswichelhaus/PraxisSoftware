# Status · Stand 2026-10-25

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

Design-Review Lauf 1, Schritt 2 Übungen: 2a (#300), 2b Durchführung (#304, DRP-030 bis -035, Pfad A
wegen BEF-211 und BEF-213; ANN-711 bis -717) und 2c Reiter (#302, DRP-040 bis -044: Vorschau der
Einheit in allen Lagen mit Dauer, Plan mit Wochenleiste und Übungszeilen, Plan vom Gerät, Fenster
mit Bühne, Rechner zweispaltig; ANN-720 bis -727) sind gemergt. Schritt 3 Termine ist vorbereitet
(#303): Designsystem auf Code-Stand (Version 7), Briefing 3, Leinwand,
`design/handoff-2026-10-24-plattform-termine.md` mit fünf Fragen, BEF-220 bis -222. Befunde aus
archivierten Sitzungen: BEF-200 (seit #297 erledigt), BEF-201, BEF-202.

**Schritt 1 ist abgenommen** (Jannes, 24.10.). Gemergt am 24. und 25.10.: 2c (#302), 2b (#304), 2a
(#300), Handoff Übungen (#299), Nacharbeit #298 (Fragen aus #297 wie empfohlen, „Mitteilungen
einschalten“ unter „Heute“, ANN-702; Briefing 2 aufgefrischt, BEF-196 und BEF-197; BEF-170 Pfad A,
ANN-703, daraus BEF-198), 1e Übersicht (#297, DRP-020 bis -022), 1d Einstieg (#294), 1c Türen
(#295), CI-Fix #296. Gemergt am 22. und 23.10.: Schritt 0 (#288), Handoff und Bericht (#289), 1a
(#290), 1b (#293), Daten N1/N2 (#292); BEF-179/-180 (#287).

## Danach

Schritt 2 nach Abschnitt 9 des Handoffs: BEF-215 (ein Inhalt für Fenster und Durchführung, alte
Bausteine fort), BEF-218 (Vorschau mit der Einheit auf dem Gerät), dann das Planblatt 2d. Schritt 3
Termine wird nach Jannes' Merge von #303 in 3a bis 3d gebaut. Danach Schritte 4 bis 7
(Selbstauskunft, Nachrichten, Unterlagen, Ich), je mit freigegebenem Handoff aus Claude Design;
Briefings in `design/review-2026-10/`. Ohne Handoff: BEF-198 (Grundlage samt Verordnungsscan ins
Löschjournal, übrige Löschwege von Hand durchsehen; Pfad A).

## Bei Jannes

- Handoff Termine: fünf Fragen in Abschnitt 0, Leinwand
  https://claude.ai/artifact/4jdCqRT4YWRiphJ2Sjhqf1; sein Merge gibt Schritt 3 frei.
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

25.10.2026, Branch `ccr-d51dd25d-ujz8lo`: #302 (2c, mit `main` und 2b) hereingeholt, weil #302 vor
#303 gemergt wird. Davor derselbe Branch: Schritt 3 vorbereitet (Designsystem Version 7, Leinwand
„Plattform – Termine“, Handoff); `claude/uebungen-reiter-2c`: Schritt 2c. Keine Migration, kein
Seed. Lokal: `git pull`.
