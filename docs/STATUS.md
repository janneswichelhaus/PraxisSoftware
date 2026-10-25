# Status · Stand 2026-10-25

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git, der Stand bis heute in `development/archiv/STATUS-bis-2026-10-12.md`.

## Jetzt

Design-Review Lauf 1, **Schritt 3 Termine** (Handoff #303, Fragen wie empfohlen), am 25.10.
mitten im Schritt pausiert. Auf `ccr-544f8ce7-u1sqpf` liegt der Stapel auf `main` (2d #307 ist
gemergt), noch ohne PR: 3a Bausteine (`761d6fe`, `f0150fb`), 3b Liste (`bf34c04`), 3c Seite des
Termins (`1acd34a`), darüber diese Übergabe. Design-Review 3a und 3b abgearbeitet (3b: `Section`
statt Nachbau, `EmptyState` mit `zeichen`, H1 bis H10; BEF-227, BEF-228), für 3c steht es aus.
Geprüft: Komponententests Plattform und UI, Browsertests `plattform*` und `einsicht` (3c: 183
grün), `docs:check`; die volle Prüfung (Lint, alle Tests, Build, Secrets) steht für jeden Schritt
noch aus. Schritt 1 ist abgenommen (24.10.), Schritt 2 mit 2d abgeschlossen.

## Danach

**Schritt 3 Termine fortsetzen**, je eine PR, nur der eine Branch: (1) volle Prüfung auf 3a, die
Commits von 3b und 3c lokal sichern, Branch auf `f0150fb` stellen, PR 3a; (2) nach dem Merge PR 3b;
(3) Design-Review 3c, dann PR; (4) 3d Abläufe nach Handoff 5.3/5.4 und 5.5: je zwei Schritte
(`terminablauf.ts` ohne „Was möchten Sie?“), Tage als `Wochenleiste` Mo–Fr, Tageszeiten als
`Wahlflaechen` (Vorlage: Prüfseite der Bausteine), Zusammenfassungen als Karte, ✕ zur Seite des
Termins, Senden ohne Netz gesperrt, am Rechner Fenster 36rem; Frage 3 als Annahme. Danach
Schritte 4 bis 7 (Selbstauskunft, Nachrichten, Unterlagen, Ich), je mit freigegebenem Handoff;
ohne Handoff BEF-198 und BEF-223 (beide Pfad A).

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

25.10.2026, Branch `ccr-544f8ce7-u1sqpf`: BEF-219 (#305) – der Arbeitszeit-Test legt seine
Termine selbst an; danach BEF-215 und BEF-218 – das Fenster „Übung zum Nachlesen“ nutzt die
Anleitung der Durchführung, die Vorschau rechnet mit der Einheit auf dem Gerät (ANN-730); dann 2d
Planblatt – „Plan als PDF“, Vorschau als Blatt, Druck A4 (ANN-731); dann 3a – die Bausteine der
Termine (ANN-732 bis -739); dann 3b – die Liste (ANN-740 bis -745, BEF-220 erledigt); dann 3c –
die Seite des Termins (ANN-746, -747, BEF-221 erledigt). Keine Migration, kein Seed.
