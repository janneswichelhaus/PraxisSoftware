# Status · Stand 2026-10-22

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

Design-Review Lauf 1, Datenschritt (22.10., Branch `claude/plattform-daten-n1-n2`, Pfad A, DRP-N1/N2):
Der Plattformkontext trägt den eigenen Namen, nur am lesbaren Zugang (ANN-690), und die Rufnummer
der Praxis aus dem Absender der Rechnungen (ANN-691); die Oberfläche dazu bauen 1b, 1c und 1e.

Gemergt am 22.10.: Design-Review Schritt 0 (#288), Handoff und Bericht (#289), Schritt 1a (#290,
ANN-678); BEF-179 und -180 (#287, ANN-675). Gemergt am 20. und 21.10.: BEF-178 (#286), BEF-176 (#284), BEF-192 und -193 (#283), BEF-188 (#282),
BEF-175 (#281), BEF-190 und -191 (#280), BEF-189 (#279).

BEF-181 und Wochenplan in einem Zug (17.10., Branch `ccr-0d8db4ad-3ufjj1`): Ladestrom aus den
Kilometern der geplanten Touren (Edge Function `electricity-distance`, nur die Monatssumme am Antrag,
Büro ohne Kilometer und Betrag; ANN-615 bis ANN-617); Wochenplan mit einem Knopf, alle oder keiner.

Teamchat-Anhänge (18.10., PR #273, TEAM-003 bis -005): Fotos und PDF bis fünf je Nachricht, ohne
Herunterladen und Virenprüfung; Sprachnachrichten bis zwei Minuten (ADR-017 Fassung 9, Fragen 33,
34: Mikrofon der eigenen Herkunft frei); Senden während des Hochladens; ANN-652 bis ANN-655.

Branch `claude/nifty-carson-wnmatp`: Vermerk „ohne Behandlung“ ohne eigenen Eintrag (ANN-565),
Rückfrage vor dem Verlassen als Fenster (ANN-566); Vorbereitung der Überholungen 6 bis 11
(`product/gefuehrte-ablaeufe-und-antraege.md`, G1–G10).

Offen auf Branches: Bewegung (`claude/lucid-edison-9wdpux`), Übungen, zweite Runde (`claude/sweet-gauss-z8te7o`), Monatsabrechnung
(`ccr-92feaef7-zkxssj`), Übersicht (`claude/practical-curie-1jy88f`), Intro
(`claude/eloquent-newton-p38ihe`). Gemergt: Beratung abrechnen (#277, ANN-664, ANN-665), Richtung der Bewegung (#276, ANN-663), ERN-EPIC-003 (#275), ERN-EPIC-001 und -002 (#274).

## Danach

Design-Review Schritt 1b Gerüst (Handoff, Abschnitt 9). BEF-170 (Akte: einzeln gelöschte Dateien
ins Löschjournal, Test mit Wiederherstellung; Pfad A).

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

22.10.2026, Branch `claude/plattform-daten-n1-n2`: eine Migration, kein Seed. Lokal: `git pull`,
`pnpm dlx supabase@2.116.0 db reset`.
