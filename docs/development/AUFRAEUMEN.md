# Aufräumen: Kennzahlen des letzten Laufs

Erzeugt von `pnpm aufraeumen --schreiben`, nicht von Hand ändern. Der nächste Lauf von
[`/aufraeumen`](../../.claude/skills/aufraeumen/SKILL.md) vergleicht mit diesem Stand.

Stand: 2026-10-26 · Commit `ca18b08`

| Kennzahl | Wert | Schlüssel |
| --- | ---: | --- |
| Zeilen gesamt | 620348 | `zeilen_gesamt` |
| Zeilen Programm (src, Edge Functions) | 204629 | `zeilen_programm` |
| Zeilen Tests | 269190 | `zeilen_tests` |
| Zeilen Migrationen | 63552 | `zeilen_migrationen` |
| Zeilen Doku (Markdown) | 52618 | `zeilen_doku` |
| Zeilen Rest (Skripte, Konfiguration, Seed) | 30359 | `zeilen_rest` |
| Kommentaranteil Programm (%) | 19.5 | `kommentaranteil_programm` |
| Kommentaranteil Migrationen (%) | 5.1 | `kommentaranteil_migrationen` |
| Kommentare über 3 Zeilen (ohne Migrationen) | 3289 | `lange_kommentare` |
| Module unter src/features | 45 | `module` |
| Importe zwischen Modulen | 604 | `querimporte` |
| Tiefe Importe in Module (an index.ts vorbei) | 740 | `tiefe_importe` |
| Gegenseitige Abhängigkeiten (Modulpaare) | 16 | `gegenseitige_abhaengigkeiten` |
| Module im größten Abhängigkeitsring | 35 | `ringgruppe` |
| Module mit Schnittstelle (index.ts) | 1 | `module_mit_schnittstelle` |
| Programmdateien über 500 Zeilen | 89 | `grosse_programmdateien` |
| Testdateien über 500 Zeilen | 143 | `grosse_testdateien` |
| DB-Funktionen (nach Name) | 1195 | `db_funktionen` |
| Neufassungen von DB-Funktionen in Migrationen | 2 | `db_neufassungen` |
| Doppelte Zeilen im Programm (%, Blöcke ab 8 Zeilen) | 2.6 | `doppelte_zeilen_prozent` |
