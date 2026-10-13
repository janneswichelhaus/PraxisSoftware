# Status · Stand 2026-10-13

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

PR #239 wartet auf Jannes (Auftrag 12.10.2026 „Analyse → Plan → Umsetzung“): Design der ganzen App
nach `docs/design/DESIGN.md` mit Runde 2 nach Design- und Praxis-Review, Übungskatalog (196
Übungen, 193 Figuren, 15 Vorlagen), „Besuch in einem Zug“ (K5), Prozess verschlankt. Bericht-Seite
und Fragen stehen in der PR.

## Danach

Vorschlag, Jannes entscheidet (Roadmap, „Bereichsüberholungen“):

1. **Restbefunde der Praxis-Prüfung**: letzten Eintrag übernehmen (K6), Absage in 4 Tipps (K9),
   Material und letzte Doku an der Karte (K3), Übung aus der Bibliothek zuweisen.
2. **Erstaufnahme geführt** (K10, K11).
3. **Monatsabrechnung in einem Lauf** (K13, K14).
4. **Übungen, zweite Runde**: Durchsicht, eigene Vorlagen, Fassung 2 der Figur für LW-17, BW-06,
   HU-02.

Aus der bisherigen Kette danach: ALT-EPIC-002; BEF-146, -147, -148, -150 vor dem Scharfschalten
(BEF-149 nach deiner Entscheidung); Widerruf zu Anhängen im Training (ANN-333).

## Bei Jannes

- PR #239: Bericht-Seite und Bildstrecke ansehen (~15 min), fünf Fragen beantworten, mergen.
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

12./13.10.2026, Branch `ccr-e4180d49-bfbd2f`, PR #239. Davor ALT-EPIC-001 (PR #238). **Lokal:**
`git pull`, `pnpm install`, `pnpm dlx supabase@2.116.0 db reset`; Node 22 (`.nvmrc`).
