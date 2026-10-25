# Aufräumen: Kennzahlen des letzten Laufs

Erzeugt von `pnpm aufraeumen --schreiben`, nicht von Hand ändern. Der nächste Lauf von
[`/aufraeumen`](../../.claude/skills/aufraeumen/SKILL.md) vergleicht mit diesem Stand.

Stand: 2026-10-25 · Commit `a608506`

| Kennzahl | Wert | Schlüssel |
| --- | ---: | --- |
| Zeilen gesamt | 756988 | `zeilen_gesamt` |
| Zeilen Programm (src, Edge Functions) | 204959 | `zeilen_programm` |
| Zeilen Tests | 268750 | `zeilen_tests` |
| Zeilen Migrationen | 205024 | `zeilen_migrationen` |
| Zeilen Doku (Markdown) | 48673 | `zeilen_doku` |
| Zeilen Rest (Skripte, Konfiguration, Seed) | 29582 | `zeilen_rest` |
| Kommentaranteil Programm (%) | 19.5 | `kommentaranteil_programm` |
| Kommentaranteil Migrationen (%) | 17.1 | `kommentaranteil_migrationen` |
| Kommentare über 3 Zeilen (ohne Migrationen) | 3318 | `lange_kommentare` |
| Module unter src/features | 44 | `module` |
| Importe zwischen Modulen | 765 | `querimporte` |
| Tiefe Importe in Module (an index.ts vorbei) | 933 | `tiefe_importe` |
| Gegenseitige Abhängigkeiten (Modulpaare) | 32 | `gegenseitige_abhaengigkeiten` |
| Programmdateien über 500 Zeilen | 88 | `grosse_programmdateien` |
| Testdateien über 500 Zeilen | 144 | `grosse_testdateien` |
| DB-Funktionen (nach Name) | 1203 | `db_funktionen` |
| Neufassungen von DB-Funktionen in Migrationen | 906 | `db_neufassungen` |
| Doppelte Zeilen im Programm (%, Blöcke ab 8 Zeilen) | 2.7 | `doppelte_zeilen_prozent` |
