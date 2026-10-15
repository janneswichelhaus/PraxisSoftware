# Status · Stand 2026-10-15

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

Entscheidungen vom 15.10. umgesetzt (eine PR, Branch `ccr-43e90fd0-8ho4pg`): Anhänge von außen
ohne Virenprüfung (ADR-017 Fassung 6, ADR-026 abgelehnt), Übungen ohne KI-Zeichnungen mit
Anleitung in Schritten (ANN-539), Preisblatt-Entwurf 2027 und Umsatzsteuer (ANN-541), BEF-149
verworfen, PTV-Prüfung Teil 4b gesichert (Anfrage ruht bis 2027). #246 (Intro) wartet auf Jannes.

## Danach

Vorschlag, Jannes entscheidet (Roadmap, „Bereichsüberholungen“):

1. **Erstaufnahme geführt** (K10, K11).
2. **Monatsabrechnung in einem Lauf** (K13, K14).
3. **Übungen, zweite Runde**: Durchsicht, eigene Vorlagen, eigene Bilder und Videos.

Aus der bisherigen Kette danach: ALT-EPIC-002; BEF-146, -147, -148, -150 vor dem Scharfschalten;
Widerruf zu Anhängen im Training (ANN-333).

## Bei Jannes

- Spracheingabe scharfschalten: Anbieter und Mikrofon in der Testumgebung (Frage 1 im Bericht,
  https://claude.ai/artifact/YXhSe8aGzbTbPdFJMboK2g; BEF-153); bis dahin nur die Nachbildung.
- Übungskatalog fachlich durchsehen (Texte KI-erstellt, „ungeprüft“, ANN-386); ANN-475 bis
  ANN-479 ansehen (Besuch).
- Reihenfolge der Bereichsüberholungen bestätigen oder ändern.
- Sichtung neu: ~170 offene Schritte werden per Bildstrecke triagiert (`sichtung/README.md`); am
  Gerät bleibt nur, was eine Hand braucht (Kamera, Passkey, Flugmodus, Sonne).
- Annahmen: bestätigen nur noch, was teuer zurückzunehmen ist (Kopf von `ASSUMPTIONS.md`);
  Datenschutz und Recht gehen ins Prüfpaket.
- Preise: Entwurf 2027 steht (`product/preisblatt-entwurf.md`), echte Preise kurz vor dem Start;
  G13 Umsatzsteuer vor M3 (ANN-541: ohne Verordnung 19 %? Kleinunternehmer?); B8 bis M3.
- Bilder zu den Tests für FRB-EPIC-005.
- LOG-EPIC-001: Check „Aktionen des Auditlogs“ in die Branch Protection, Label `freigabe-audit`;
  AV-Verträge Supabase und PTV; Nachweis `apply_retention()` per pg_cron; Backupfrist ≤ 30 Tage.
- G6c lokal prüfen (ANN-115): Schreibpfad als `therapist` → 403 und Protokolleintrag.
- Vor dem Scharfschalten: Push-Secrets erst mit OPS-001; Gerätevorgabe Diensttelefone (ADR-024
  Punkt 6).
- Ab Anfang 2027 parallel zum Bauen: OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen
  (PTV-Anfrage liegt als Entwurf in Gmail).

## Letzte Session

15.10.2026, Branch `ccr-43e90fd0-8ho4pg`: Entscheidungen vom 15.10. **Lokal:** `git pull`,
`supabase db reset` (zwei Migrationen: KOM-013, UEB-013).
