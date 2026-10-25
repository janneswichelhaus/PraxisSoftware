# Aufräumen: Kennzahlen des letzten Laufs

Erzeugt von `pnpm aufraeumen --schreiben`, nicht von Hand ändern. Der nächste Lauf von
[`/aufraeumen`](../../.claude/skills/aufraeumen/SKILL.md) vergleicht mit diesem Stand.

Stand: 2026-10-25 · Commit `1cedb73`

| Kennzahl | Wert | Schlüssel |
| --- | ---: | --- |
| Zeilen gesamt | 616703 | `zeilen_gesamt` |
| Zeilen Programm (src, Edge Functions) | 204789 | `zeilen_programm` |
| Zeilen Tests | 269307 | `zeilen_tests` |
| Zeilen Migrationen | 63507 | `zeilen_migrationen` |
| Zeilen Doku (Markdown) | 48754 | `zeilen_doku` |
| Zeilen Rest (Skripte, Konfiguration, Seed) | 30346 | `zeilen_rest` |
| Kommentaranteil Programm (%) | 19.5 | `kommentaranteil_programm` |
| Kommentaranteil Migrationen (%) | 5.1 | `kommentaranteil_migrationen` |
| Kommentare über 3 Zeilen (ohne Migrationen) | 3294 | `lange_kommentare` |
| Module unter src/features | 44 | `module` |
| Importe zwischen Modulen | 593 | `querimporte` |
| Tiefe Importe in Module (an index.ts vorbei) | 729 | `tiefe_importe` |
| Gegenseitige Abhängigkeiten (Modulpaare) | 17 | `gegenseitige_abhaengigkeiten` |
| Module im größten Abhängigkeitsring | 35 | `ringgruppe` |
| Module mit Schnittstelle (index.ts) | 1 | `module_mit_schnittstelle` |
| Programmdateien über 500 Zeilen | 89 | `grosse_programmdateien` |
| Testdateien über 500 Zeilen | 144 | `grosse_testdateien` |
| DB-Funktionen (nach Name) | 1204 | `db_funktionen` |
| Neufassungen von DB-Funktionen in Migrationen | 2 | `db_neufassungen` |
| Doppelte Zeilen im Programm (%, Blöcke ab 8 Zeilen) | 2.6 | `doppelte_zeilen_prozent` |
