# Status · Stand 2026-10-26

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

**Aufräumen** (Auftrag Jannes 25.10., Entscheidungen 26.10., ROADMAP 7.17): Schritte 1 bis 3 gemergt
(#308 bis #312). Schritt 3, Teil 1, Rest liegt als PR vor: Zeit- und Kalenderhilfen aller Module in
`src/lib/datum.ts`, 16 statt 17 Paare. Bauplan ist `development/TIEFENANALYSE.md`.
Design-Review Lauf 1: Schritt 1 abgenommen (24.10.), Schritt 2 mit 2a bis 2d gemergt (#300, #302,
#304, #307); Schritt 3 Termine ist mit #303 vorbereitet (Handoff mit fünf Fragen, BEF-220 bis -222).
Befunde aus archivierten Sitzungen: BEF-201, BEF-202.

## Danach

Aufräumen nach ROADMAP 7.17: Schritt 4a (Teillöschung im Training, erste Pfad-A-Story), 4 (Register),
3b (Domänenschnitt), 5 (Doku); dazwischen kleine PRs für die Fehler 4 bis 7 der Liste dort.
Schritt 3 Termine des Design-Reviews (3a bis 3d), dann Schritte 4
bis 7 (Selbstauskunft, Nachrichten, Unterlagen, Ich), je mit freigegebenem Handoff; Briefings in
`design/review-2026-10/`. Ohne Handoff: BEF-198 (Löschjournal; Pfad A), BEF-223 (Zeitumstellung;
Pfad A).

## Bei Jannes

- Spracheingabe scharfschalten: Anbieter und Mikrofon in der Testumgebung (Frage 1 im Bericht,
  https://claude.ai/artifact/YXhSe8aGzbTbPdFJMboK2g; BEF-153); bis dahin nur die Nachbildung.
- Übungskatalog fachlich durchsehen, jetzt am Stück unter `/uebungen/durchsicht` (ANN-386, ANN-561); ANN-475 bis
  ANN-479 ansehen (Besuch).
- Reihenfolge der Bereichsüberholungen bestätigen oder ändern.
- Vereinfachungen M1 bis M9 und das Barometer einzeln freigeben oder ablehnen (Aufstellung im Bericht
  zur PR von Aufräumen Schritt 3, Teil 1).
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

26.10.2026, Branch `ccr-30ca4f76-x8pvfg`: Aufräumen Schritt 3, Teil 1, Rest – Kopien von `tagePlus`
und ISO-Wochentag ersetzt, Datumsformate aus Arbeitszeit und Urlaub in `src/lib/datum.ts`;
Tiefenanalyse abgelegt, Entscheidungen in ROADMAP 7.17. Keine Migration, kein Seed. Lokal: `git pull`.
