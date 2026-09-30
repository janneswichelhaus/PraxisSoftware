# Sichtung — Block 3: Trainingsbereich

Stand 2026-09-30 · entsteht mit dem ersten Oberflächen-Loop des Blocks (TRN-EPIC-001).

**Deckt ab:** TRN-EPIC-001
**Wo:** Test-Umgebung am Handy, für einen Stand vor dem Merge lokal im WLAN ([`../DEVELOPMENT.md`](../DEVELOPMENT.md)). Konten: `DEVELOPMENT.md`, „Testkonten"; die Trainingsbetreuung ist `tom.training@praxis.invalid`.
**Dauer:** rund 10 Minuten.

| #   | Rolle                 | Tun                                                                                                                                                                                                                        | Erwarten                                                                                                                                                                                                                                                                                                                                         | Loops        |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 1   | office                | Am Handy (~375 px): **Training → Trainingskund:in anlegen**, Vorname „Max", Nachname „Mustermann", **anlegen**. Im Hinweis **Training für diese Person beginnen**; dann **Bearbeiten**, Telefon eintragen, **Speichern**.  | Hinweis „In der Behandlung bekannt" mit **genau einem** Treffer (Max Mustermann, geb. 30.04.1957). Danach die Seite „Max Mustermann" mit **leerem Kontakt** — aus der Akte wird nichts übernommen —, Vertrag seit heute. Nach dem Speichern „Gespeichert." und die neue Nummer. Nichts ragt seitlich heraus.                                     | TRN-EPIC-001 |
| 2   | Trainingsbetreuung    | Als Tom anmelden. Navigation ansehen, dann **Training → Max Mustermann** öffnen, **Vertrag beenden** (Tag heute), danach **Vertrag wieder aufnehmen**. Zum Schluss **Trainingskund:in anlegen** mit „Petra" „Platzhalter". | In der Navigation **Übersicht und Training**, **kein** Kalender und **keine** Patient:innen. Auf Max' Seite nur Kontakt und Vertrag, kein Wort über eine Akte. Nach dem Beenden „Vertrag beendet", nach dem Wiederaufnehmen wieder „läuft". Bei Petra (nur Patientin) **kein** Hinweis — angelegt wird sofort: Tom erfährt nichts über die Akte. | TRN-EPIC-001 |
| 3   | therapist, dann owner | Als Anna: Navigation ansehen, `/training` direkt aufrufen. Als Jannes: **Organisatorisches → Mitarbeitende → Tom → Zugang**, dann **Organisatorisches → Protokoll**.                                                       | Anna: **kein** Bereich Training, der direkte Aufruf landet auf der Übersicht. Jannes: Rolle „Trainingsbetreuung" ist wählbar, ihr Satz sagt „Sieht keine Akten …". Im Protokoll „Trainingskund:in angelegt", „geändert", „geöffnet", „Trainingsvertrag beendet" und „wieder aufgenommen" — ohne Namen im Eintrag.                                | TRN-EPIC-001 |

## Nicht in dieser Sichtung

- **Kein Durchgriff in beide Richtungen** sitzt an Policies und Serverfunktionen: geprüft in
  `pnpm test:db` (`training-clients.test.ts`, `training-relationships.test.ts`,
  `abgewiesene-schreibpfade.test.ts`). Am Bildschirm bleibt die Gegenprobe in den Schritten 2 und 3.
- **Mandantengrenze und Löschlauf** der Kontaktdaten: nur in `pnpm test:db`.
- **Trainingstermine, Trainingsrechnung, Protokoll einer Einheit:** kommen mit TRN-EPIC-002 bis -004.

## Ergebnis

Gesichtet am: — · Gerät: — · Befunde: —
