---
name: idee
description: Eine Idee von Jannes in den Ideenspeicher eintragen, ohne zu bauen und ohne sie in die Roadmap zu legen. Nur auf ausdrücklichen Aufruf mit /idee <Text>.
disable-model-invocation: true
---

# Idee

Eine Funktionsidee kommt **nach `docs/product/`, nicht in den Code** (`CLAUDE.md`,
„Arbeitsweise") und nicht in die Roadmap: Ideen nach dem 2026-09-22 stehen nach
V1, bis Jannes sie ausdrücklich in eine Etappe legt (Roadmap, Abweichungsregel 4).

1. Regeln in `docs/product/IDEENSPEICHER.md` lesen und **den einen** passenden
   Bereich wählen (Kürzel aus der Zeile „Bereiche“).
2. Nach Dubletten suchen (`grep -n -i "<Stichwort>" docs/product/IDEENSPEICHER.md`).
   Gibt es die Idee schon, den Titel der vorhandenen Zeile um Jannes' neuen
   Gedanken schärfen statt eine zweite Zeile anzulegen.
3. Sonst eine Zeile nach der letzten des Bereichs: nächste freie Kennung
   `IDEA-<Kürzel>-NNN`, der Kern der Idee als Titel, Status `notiert`.
   Bedenken aus Rang 1 und 2 (§17, ADR-006, Datenschutz) als Zusatz
   `Bedenken`, die Begründung in die Commit-Nachricht, nicht als Entscheidung.
4. `pnpm docs:check` (eindeutige Kennungen, Verweise). Commit
   `Ideenspeicher: <Kennung> <Titel>`, Push auf den Branch der Session.
5. In zwei Sätzen antworten: wo die Idee steht, und ob sie einer geplanten
   Etappe nahe ist. **Nichts bauen, keine Roadmap-Zeile anlegen.**
