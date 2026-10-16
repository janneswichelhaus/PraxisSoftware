# Status · Stand 2026-10-16

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

Übungen, zweite Runde (K12), eine PR, Branch `claude/sweet-gauss-z8te7o`: Vorlagen der Praxis
(„Als Vorlage speichern“ am Plan, vor den mitgelieferten in „Aus Vorlage“, Seite Vorlagen), Durchsicht
des Katalogs am Stück mit einem Tipp je Übung; ANN-560, ANN-561. Bilder und Videos offen (ANN-539).

Check-Up geführt (16.10., FLT-005/006, eine PR, Branch `ccr-658a5e25-l0njkl`): Fenster mit einer
Seite je Prüfpunkt am 3D-Rad, „In Ordnung“ führt weiter (ANN-562); 3D-Meldung trennt „nicht
geladen“ von „kein WebGL“; alte Dateien bleiben 7 Tage auf dem Server (BEF-172, ANN-563).

Test-Umgebung: SSH-Verbindung mit bis zu fünf Versuchen (#253, ANN-559); erster Lauf danach ohne
Abbruch, BEF-171 bleibt offen, bis weitere Läufe das bestätigen.

Übersicht (15.10., Branch `claude/practical-curie-1jy88f`): Abschlusskarte in Tiefgrün und Link zu
den Trainingskund:innen entfernt, alle Abschnitte unter dem Kopf 32 px auseinander (ANN-546).
Danach: Punkte im Kopf in zwei Hälften (Haken, Doku), Laufrad und kurze Vibration, wenn der Tag
fertig wird; nichts gespeichert (ANN-547).

Monatsabrechnung in einem Lauf (K13, K14), eine PR, Branch `ccr-92feaef7-zkxssj`: Lauf auf
`/abrechnung` in 3 Tipps (vorher ≈ 15 je Rechnung), Sammeldruck, Zahlungen gesammelt buchen;
BEF-165 erledigt; ANN-544. Erstaufnahme (#248) und Radflotte (#252) sind gemergt.

Intro (15.10.): Startbild beim Öffnen der Anwendung statt nach der Anmeldung, O ohne Sprung (Felge
dreht nicht mit). Branch `claude/eloquent-newton-p38ihe`, Varianten:
https://claude.ai/artifact/En4BPeRGdaGej1PjnMP66h.

## Danach

Vorschlag, Jannes entscheidet (Roadmap, „Bereichsüberholungen“):

Die fünf Bereichsüberholungen sind gebaut. Aus der bisherigen Kette danach: BEF-124 (Verordnung ohne Verlauf, Pfad A); ALT-EPIC-002; BEF-146, -147, -148, -150 vor dem Scharfschalten;
Widerruf zu Anhängen im Training (ANN-333).

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
- LOG-EPIC-001: Check „Aktionen des Auditlogs“ in die Branch Protection, Label `freigabe-audit`;
  AV-Verträge Supabase und PTV; Nachweis `apply_retention()` per pg_cron; Backupfrist ≤ 30 Tage.
- G6c lokal prüfen (ANN-115): Schreibpfad als `therapist` → 403 und Protokolleintrag.
- Vor dem Scharfschalten: Push-Secrets erst mit OPS-001; Gerätevorgabe Diensttelefone (ADR-024
  Punkt 6).
- Ab Anfang 2027 parallel zum Bauen: OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen
  (PTV-Anfrage liegt als Entwurf in Gmail).

## Letzte Session

16.10.2026, Branch `claude/sweet-gauss-z8te7o`: Übungen, zweite Runde. **Lokal:** `git pull`,
Migration `20261120100000_ueb_014_eigene_vorlagen` (`supabase db reset`).
