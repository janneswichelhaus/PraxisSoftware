Definitionsdateien der Scores, eine je Instrument (Phasen P4 und P5).

Seit FRB-EPIC-001 liegen hier die drei freien Instrumente NRS, PSFS und die
globale Veränderungsfrage — in Version `0.x` und **inaktiv**, weil für sie noch
kein Bogen in `quellen/scores/pdf/` liegt und ihr Wortlaut deshalb vorläufig ist
(ANN-099). Mit der Vorlage wird der Wortlaut gegen sie gehalten, `quelle.datei`
gesetzt, die Version auf `1.0.0` gehoben und `aktiv` auf `true` gestellt.

**Neue Fassung (ABN-014, ANN-084, ANN-219).** Eine Fassung, die einmal auf dem
Server liegt, ändert sich nie. Wer eine Datei ändert, hebt die Version, legt
die bisherige Datei als `archiv/<kennung>@<version>.json` ab und vermerkt in
`meta.vergleichbar_mit`, mit welchen früheren Fassungen die Werte vergleichbar
bleiben — eine reine Patch-Änderung immer, alles andere nach Prüfung. Danach
`pnpm definitionen:sql --schreiben`: Das erzeugt die Migration, gegen die der
Server Antworten prüft.
