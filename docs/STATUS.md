# Status · Stand 2026-10-30

Livestand in höchstens 4 KB (`pnpm docs:check`). Reihenfolge: `development/ROADMAP.md`; Verlauf
steht in den PRs und in Git. Abgelegte Dokumente zeigt `git show eb43569:<pfad>` (Archiv,
Chroniken, Handoffs) oder `git show 9452575:<pfad>` (Loop-Vorgaben, Sichtung, Ideen, Reviews).

## Jetzt

**Lesefrist vom Server und die Antworten zu #326, #333, #334** liegen als PR vor. Offen: BEF-201,
BEF-202.

## Danach

Bildsichtung von #334 und dieser PR; dann „Sehr groß“: Reiterleiste einzeilig, Fuß der Abläufe ans
Ende, Prüfungen ohne Rollen auch so (#334 Frage 5). Schritte 5 bis 7 mit Jannes' Leinwänden aus
Claude Design; bis dahin die Aufräumrunde (`development/BEFUNDE.md`, Nr. 2, dann Nr. 3).
**Parallel eine Docs-Session je Woche für G14** (fertig bis Ende 2026, `datenschutz/README.md`):
Verarbeitungsverzeichnis mit Übersicht der Auftragsverarbeiter, Schwellwertprüfung, TOM mit
Ablauf bei Datenpannen, DSFA, zuletzt die Nachweistabelle MUSS → Test.

## Bei Jannes

- Den alten Branch `ccr-544f8ce7-u1sqpf` löschen (seit 3c ist alles übertragen).
- Test-Umgebung neu aufsetzen (Workflow „Test-Umgebung“, „neu aufsetzen“): Termine der alten
  Praxiswoche haben keine gültige UUID, Erikas Übersicht scheitert (`development/BEFUNDE.md`).
- Spracheingabe scharfschalten: Anbieter und Mikrofon in der Testumgebung (Frage 1 im Bericht,
  https://claude.ai/artifact/YXhSe8aGzbTbPdFJMboK2g; E13); bis dahin nur die Nachbildung.
- Übungskatalog fachlich durchsehen, jetzt am Stück unter `/uebungen/durchsicht` (ANN-386, ANN-561); ANN-475 bis
  ANN-479 ansehen (Besuch).
- Reihenfolge der Bereichsüberholungen bestätigen oder ändern.
- Tübinger Standortvorlage für den Pannenablauf (bis dahin Köln mit Platzhaltern, ANN-554).
- Sichtliste am Gerät: 13 Punkte (`sichtung/README.md`, S-1 bis S-13).
- Widersprüche zwischen ADR-Wortlaut und Code oder Prinzipien (`development/BEFUNDE.md`, „Doku“).
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

30.10.2026, Branch `ccr-5fca130a-l8m9q8`. Lokal: `git pull`, Stack `reset` (drei Migrationen).
