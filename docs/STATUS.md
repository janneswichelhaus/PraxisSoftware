# Status · Stand 2026-10-12

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

Session „Analyse → Plan → Umsetzung“ (Auftrag Jannes 2026-10-12, eine PR): Design der ganzen App
nach `docs/design/DESIGN.md`, mitgelieferte Übungsbibliothek mit Zeichnungen, Prozess verschlankt
(`/bereich`, Reviewer-Agenten, Bildsichtung, STATUS ≤ 4 KB).

## Danach

Vorschlag, Jannes entscheidet (Roadmap, „Bereichsüberholungen“), je `/bereich`:

1. **Besuch in einem Zug** — Tag, Termin, Doku (Kernabläufe K3–K8).
2. **Erstaufnahme geführt** (K10, K11).
3. **Monatsabrechnung in einem Lauf** (K13, K14).
4. **Plattform** angleichen.

Aus der bisherigen Kette danach: ALT-EPIC-002; BEF-146, -147, -148, -150 vor dem Scharfschalten
(BEF-149 nach deiner Entscheidung); Widerruf zu Anhängen im Training (ANN-333).

## Bei Jannes

- Diese PR: Bildstrecke ansehen (~10 min), die Fragen oben in der PR beantworten, mergen.
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

12.10.2026, Branch `ccr-e4180d49-bfbd2f`: siehe PR. Davor ALT-EPIC-001 (PR #238). **Lokal:**
`git pull`, `pnpm install`, `pnpm dlx supabase@2.116.0 db reset`; Node 22 (`.nvmrc`).
