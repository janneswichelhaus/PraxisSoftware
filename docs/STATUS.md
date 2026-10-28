# Status · Stand 2026-10-28

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git. Abgelegte Dokumente zeigt `git show eb43569:<pfad>` (Archiv,
Chroniken, Handoffs) oder `git show 9452575:<pfad>` (Loop-Vorgaben, Sichtung, Ideen, Reviews).

## Jetzt

**Design-Review Schritt 3 Termine** (Auftrag Jannes 28.10., Fragen wie empfohlen): 3a bis 3c
lagen ungemergt auf `ccr-544f8ce7-u1sqpf` (25.10., vor dem Aufräumen) und werden je als PR
übertragen, ohne die Einsicht der Praxis (M7), Annahmen ab ANN-764; 3a liegt als #327 vor.
Aufräumen (#308 bis #325) und CI-Beschleunigung (#326) sind gemergt; offen ist die Abkürzung für
reine Doku (ADR-013 Punkt 2, Entscheidung Jannes). Befunde aus archivierten Sitzungen: BEF-201,
BEF-202.

## Danach

3b Liste, 3c Seite des Termins (Design-Review steht aus), 3d Abläufe; den alten Branch erst nach
3c löschen. Dann BEF-223 (Zeitumstellung, Pfad A) als eigene PR, eine Bildsichtung der Schritte 2
und 3, dann Schritt 4 (Handoff während 3d), danach 5 bis 7 je mit Handoff (Roadmap). Erst dann
die Vorschläge der Aufräumrunde (`development/BEFUNDE.md`, Nr. 2, dann Nr. 3).
**Parallel eine Docs-Session je Woche für G14** (fertig bis Ende 2026, `datenschutz/README.md`):
Verarbeitungsverzeichnis mit Übersicht der Auftragsverarbeiter, Schwellwertprüfung, TOM mit
Ablauf bei Datenpannen, DSFA, zuletzt die Nachweistabelle MUSS → Test.

## Bei Jannes

- Test-Umgebung neu aufsetzen (Workflow „Test-Umgebung“, „neu aufsetzen“): Termine der alten
  Praxiswoche haben keine gültige UUID, Erikas Übersicht scheitert (`development/BEFUNDE.md`).
- Spracheingabe scharfschalten: Anbieter und Mikrofon in der Testumgebung (Frage 1 im Bericht,
  https://claude.ai/artifact/YXhSe8aGzbTbPdFJMboK2g; E13); bis dahin nur die Nachbildung.
- Übungskatalog fachlich durchsehen, jetzt am Stück unter `/uebungen/durchsicht` (ANN-386, ANN-561); ANN-475 bis
  ANN-479 ansehen (Besuch).
- Reihenfolge der Bereichsüberholungen bestätigen oder ändern.
- Tübinger Standortvorlage für den Pannenablauf (bis dahin Köln mit Platzhaltern, ANN-554).
- Sichtliste am Gerät: 13 Punkte (`sichtung/README.md`, S-1 bis S-13); die übrigen alten
  Sichtungsschritte sind erledigt oder überholt.
- Widersprüche zwischen ADR-Wortlaut und Code oder Prinzipien (`development/BEFUNDE.md`, „Doku“).
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

28.10.2026, Branch `claude/modest-bell-fyy01m`: Bildstrecke führt offene Anfragen je Dokument
(`scripts/bildstrecke/netzruhe.mjs`), Plattform und Anmeldung in 70 statt 286 s. Fehler der
Plattform-Übersicht in der Test-Umgebung: alte Termin-Kennungen (neu aufsetzen). Keine Migration.
