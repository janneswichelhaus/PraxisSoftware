# Status · Stand 2026-10-15

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

Monatsabrechnung in einem Lauf (K13, K14), eine PR, Branch `ccr-92feaef7-zkxssj`: Lauf auf
`/abrechnung` in 3 Tipps (vorher ≈ 15 je Rechnung), Sammeldruck, Zahlungen gesammelt buchen;
BEF-165 erledigt; ANN-544. Erstaufnahme (#248) ist gemergt.

Intro (15.10.): Startbild beim Öffnen der Anwendung statt nach der Anmeldung, O ohne Sprung (Felge
dreht nicht mit). Branch `claude/eloquent-newton-p38ihe`, Varianten:
https://claude.ai/artifact/En4BPeRGdaGej1PjnMP66h.

## Danach

Vorschlag, Jannes entscheidet (Roadmap, „Bereichsüberholungen“):

1. **Übungen, zweite Runde**: Durchsicht, eigene Vorlagen, eigene Bilder und Videos.

Aus der bisherigen Kette danach: BEF-124 (Verordnung ohne Verlauf, Pfad A); ALT-EPIC-002; BEF-146, -147, -148, -150 vor dem Scharfschalten;
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

15.10.2026, Branch `ccr-92feaef7-zkxssj`: Monatsabrechnung in einem Lauf. **Lokal:** `git pull`,
Migration `20261118100000_abr_040_monatslauf` (`supabase db reset`).
