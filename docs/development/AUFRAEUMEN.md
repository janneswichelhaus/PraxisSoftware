# Aufräumen: Kennzahlen des letzten Laufs

Erzeugt von `pnpm aufraeumen --schreiben`, nicht von Hand ändern. Der nächste Lauf von
[`/aufraeumen`](../../.claude/skills/aufraeumen/SKILL.md) vergleicht mit diesem Stand.

Stand: 2026-10-31 · Commit `a256dc07`

| Kennzahl | Wert | Schlüssel |
| --- | ---: | --- |
| Zeilen gesamt | 585906 | `zeilen_gesamt` |
| Zeilen Programm (src, Edge Functions) | 203270 | `zeilen_programm` |
| Zeilen Tests | 276626 | `zeilen_tests` |
| Zeilen Migrationen | 69075 | `zeilen_migrationen` |
| Zeilen Doku (Markdown) | 9579 | `zeilen_doku` |
| Zeilen Rest (Skripte, Konfiguration, Seed) | 27356 | `zeilen_rest` |
| Kommentaranteil Programm (%) | 19 | `kommentaranteil_programm` |
| Kommentaranteil Migrationen (%) | 5.5 | `kommentaranteil_migrationen` |
| Kommentare über 3 Zeilen (ohne Migrationen) | 3106 | `lange_kommentare` |
| Module unter src/features | 54 | `module` |
| Importe zwischen Modulen | 571 | `querimporte` |
| Tiefe Importe in Module (an index.ts vorbei) | 431 | `tiefe_importe` |
| Gegenseitige Abhängigkeiten (Modulpaare) | 4 | `gegenseitige_abhaengigkeiten` |
| Module im größten Abhängigkeitsring | 37 | `ringgruppe` |
| Module mit Schnittstelle (index.ts) | 15 | `module_mit_schnittstelle` |
| Programmdateien über 500 Zeilen | 87 | `grosse_programmdateien` |
| Testdateien über 500 Zeilen | 154 | `grosse_testdateien` |
| DB-Funktionen (nach Name) | 1185 | `db_funktionen` |
| Neufassungen von DB-Funktionen in Migrationen | 64 | `db_neufassungen` |
| Doppelte Zeilen im Programm (%, Blöcke ab 8 Zeilen) | 2.3 | `doppelte_zeilen_prozent` |
