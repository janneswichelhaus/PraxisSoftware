# Status · Stand 2026-10-18

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

ERN-EPIC-001 Ernährung, Profil und Bedarf (18.10., Branch `claude/admiring-ride-acixsl`): Profil an Akte
oder Training nur für owner, eigene Einwilligung, Zielwerte mit Rechenweg und Überschreibung, Gewicht,
Plattform mit Tagebuch-Schalter, Position „Ernährungsberatung“; Datenklasse 3 Jahre; ANN-618 bis ANN-622.

BEF-181 und Wochenplan in einem Zug (17.10., Branch `ccr-0d8db4ad-3ufjj1`): Ladestrom aus den
Kilometern der geplanten Touren (Edge Function `electricity-distance`, nur die Monatssumme am Antrag,
Büro ohne Kilometer und Betrag; ANN-615 bis ANN-617); Wochenplan mit einem Knopf, alle oder keiner.

Teamchat-Anhänge (18.10., PR #273, TEAM-003 bis -005): Fotos und PDF bis fünf je Nachricht, ohne
Herunterladen und Virenprüfung; Sprachnachrichten bis zwei Minuten (ADR-017 Fassung 9, Fragen 33,
34: Mikrofon der eigenen Herkunft frei); Senden während des Hochladens; ANN-652 bis ANN-655.

Bewegung (16.10., Branch `claude/lucid-edison-9wdpux`): nach der Leinwand „Lebendig“ gleiten Reiter
und Tableiste, Aufklapper und Chips federn, Fehlerfelder wackeln, eine Zeile wächst zur Seite; nur
Gestaltung, Inhalt unverändert (ANN-567).

Branch `claude/nifty-carson-wnmatp`: Vermerk „ohne Behandlung“ ohne eigenen Eintrag (ANN-565),
Rückfrage vor dem Verlassen als Fenster (ANN-566); Vorbereitung der Überholungen 6 bis 11
(`product/gefuehrte-ablaeufe-und-antraege.md`, G1–G10).

Offen auf Branches: Übungen, zweite Runde (`claude/sweet-gauss-z8te7o`), Monatsabrechnung
(`ccr-92feaef7-zkxssj`), Übersicht (`claude/practical-curie-1jy88f`), Intro
(`claude/eloquent-newton-p38ihe`). Gemergt: BEF-124 (#255), Check-Up geführt (#256), Radflotte-Meldungen und
Check-Up-Rhythmus (#260, ANN-568 bis ANN-570), CI schneller (#261, ANN-571).

## Danach

ERN-EPIC-002 und -003 (je `/feature-loop`), dann Beratung abrechnen (ANN-622), dann eine Politurrunde;
BEF-146, -147, -148, -150, -183; BEF-182 vor M3.

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

18.10.2026, Branch `claude/admiring-ride-acixsl`: Migrationen `20261206100000_ern_001_ernaehrungsprofil`,
`20261206110000_ern_002_plattform_ernaehrung`, `20261206120000_ern_003_katalogposition`. **Lokal:**
`git pull`, `supabase db reset`.
