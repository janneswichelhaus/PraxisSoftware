---
name: idee
description: Eine Idee von Jannes in den Ideenspeicher eintragen, ohne zu bauen und ohne sie in die Roadmap zu legen. Nur auf ausdrücklichen Aufruf mit /idee <Text>.
disable-model-invocation: true
---

# Idee

Eine Funktionsidee kommt **nach `docs/product/`, nicht in den Code** (`CLAUDE.md`,
„Arbeitsweise") und nicht in die Roadmap: Ideen nach dem 2026-09-22 stehen nach
V1, bis Jannes sie ausdrücklich in eine Etappe legt (Roadmap, Abweichungsregel 4).

1. Regeln und Index in `docs/product/IDEENSPEICHER.md` lesen; **genau eine**
   passende Bereichsdatei unter `docs/product/ideen/` wählen.
2. Dort nach Dubletten suchen (`grep -n -i "<Stichwort>"`). Gibt es die Idee
   schon, den vorhandenen Eintrag um Jannes' neuen Gedanken ergänzen statt
   einen zweiten anzulegen.
3. Sonst einen Eintrag mit der nächsten freien Kennung `IDEA-<BEREICH>-NNN`
   im Format der Datei anlegen, Status `notiert`, Herkunft „Jannes, <Datum>".
   Bedenken aus Rang 1 und 2 (§17, ADR-006, Datenschutz) als Bedenken
   notieren, nicht als Entscheidung.
4. `pnpm docs:check` (eindeutige Nummern, Verweise). Commit
   `Ideenspeicher: <Kennung> <Titel>`, Push auf den Branch der Session.
5. In zwei Sätzen antworten: wo die Idee steht, und ob sie einer geplanten
   Etappe nahe ist. **Nichts bauen, keine Roadmap-Zeile anlegen.**
