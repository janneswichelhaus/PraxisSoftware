# Status · Stand 2026-10-15

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

Die Durchsicht vom 14.10. (B1–B13) ist gemergt (#241 bis #244); Jannes hat alle Annahmen dazu
bestätigt (ANN-510 bis ANN-538), offen bleibt nur der Anbieter für die Spracheingabe. #245 behebt
BEF-164 (zwei DB-Tests an der Datumsgrenze) und zieht Befunde, Annahmen und Fortschritt nach.

## Danach

Vorschlag, Jannes entscheidet (Roadmap, „Bereichsüberholungen“):

1. **Erstaufnahme geführt** (K10, K11).
2. **Monatsabrechnung in einem Lauf** (K13, K14).
3. **Übungen, zweite Runde**: Durchsicht, eigene Vorlagen, Fassung 2 der Figur für LW-17, BW-06,
   HU-02.

Aus der bisherigen Kette danach: ALT-EPIC-002; BEF-146, -147, -148, -150 vor dem Scharfschalten
(BEF-149 nach deiner Entscheidung); Widerruf zu Anhängen im Training (ANN-333).

## Bei Jannes

- Spracheingabe scharfschalten: Anbieter und Mikrofon in der Testumgebung (Frage 1 im Bericht,
  https://claude.ai/artifact/YXhSe8aGzbTbPdFJMboK2g; BEF-153); bis dahin nur die Nachbildung.
- Übungskatalog fachlich durchsehen (KI-erstellt, „ungeprüft“, ANN-386); ANN-475 bis ANN-480
  ansehen (Besuch, Ausgangsstellung).
- Reihenfolge der Bereichsüberholungen bestätigen oder ändern.
- Sichtung neu: ~170 offene Schritte werden per Bildstrecke triagiert (`sichtung/README.md`); am
  Gerät bleibt nur, was eine Hand braucht (Kamera, Passkey, Flugmodus, Sonne).
- Annahmen: bestätigen nur noch, was teuer zurückzunehmen ist (Kopf von `ASSUMPTIONS.md`);
  Datenschutz und Recht gehen ins Prüfpaket. Bitte bestätigen: ANN-371 (Anhänge von außen aus).
- Preise: Abo-Monat und Trainingspakete (BEF-114); G13 Umsatzsteuer vor M3; B8 Lizenzbeleg bis M3.
- Bilder zu den Tests für FRB-EPIC-005.
- LOG-EPIC-001: Check „Aktionen des Auditlogs“ in die Branch Protection, Label `freigabe-audit`;
  AV-Verträge Supabase und PTV; Nachweis `apply_retention()` per pg_cron; Backupfrist ≤ 30 Tage.
- G6c lokal prüfen (ANN-115): Schreibpfad als `therapist` → 403 und Protokolleintrag.
- Vor dem Scharfschalten: ADR-026 ruht, also keine Foto-/Videoanhänge an Rückfragen;
  Push-Secrets erst mit OPS-001; Gerätevorgabe Diensttelefone (ADR-024 Punkt 6).
- Ab Anfang 2027 parallel zum Bauen: OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen.

## Letzte Session

15.10.2026, Branch `claude/trusting-albattani-16x2jw`: Durchsicht 14.10. (#241 bis #244) und BEF-164
(#245). **Lokal:** `git pull`, `pnpm install`, `supabase db reset` (elf Migrationen aus #241 bis #244).
