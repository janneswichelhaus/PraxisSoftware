# Aufräumen: Kennzahlen des letzten Laufs

Erzeugt von `pnpm aufraeumen --schreiben`, nicht von Hand ändern. Der nächste Lauf von
[`/aufraeumen`](../../.claude/skills/aufraeumen/SKILL.md) vergleicht mit diesem Stand.

Stand: 2026-10-27 · Commit `eaae99b`

| Kennzahl | Wert | Schlüssel |
| --- | ---: | --- |
| Zeilen gesamt | 570886 | `zeilen_gesamt` |
| Zeilen Programm (src, Edge Functions) | 199050 | `zeilen_programm` |
| Zeilen Tests | 266855 | `zeilen_tests` |
| Zeilen Migrationen | 68177 | `zeilen_migrationen` |
| Zeilen Doku (Markdown) | 9628 | `zeilen_doku` |
| Zeilen Rest (Skripte, Konfiguration, Seed) | 27176 | `zeilen_rest` |
| Kommentaranteil Programm (%) | 19.4 | `kommentaranteil_programm` |
| Kommentaranteil Migrationen (%) | 5.5 | `kommentaranteil_migrationen` |
| Kommentare über 3 Zeilen (ohne Migrationen) | 3163 | `lange_kommentare` |
| Module unter src/features | 53 | `module` |
| Importe zwischen Modulen | 553 | `querimporte` |
| Tiefe Importe in Module (an index.ts vorbei) | 408 | `tiefe_importe` |
| Gegenseitige Abhängigkeiten (Modulpaare) | 8 | `gegenseitige_abhaengigkeiten` |
| Module im größten Abhängigkeitsring | 38 | `ringgruppe` |
| Module mit Schnittstelle (index.ts) | 15 | `module_mit_schnittstelle` |
| Programmdateien über 500 Zeilen | 85 | `grosse_programmdateien` |
| Testdateien über 500 Zeilen | 144 | `grosse_testdateien` |
| DB-Funktionen (nach Name) | 1181 | `db_funktionen` |
| Neufassungen von DB-Funktionen in Migrationen | 53 | `db_neufassungen` |
| Doppelte Zeilen im Programm (%, Blöcke ab 8 Zeilen) | 2.6 | `doppelte_zeilen_prozent` |
