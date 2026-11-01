Definitionsdateien der Scores, eine je Instrument (Phasen P4 und P5).

NRS und globale Veränderungsfrage sind seit FRB-EPIC-004 aktiv (`1.0.0`): Ihr
Wortlaut ist eine Vorgabe der Praxis (`quelle.praxisvorgabe`, ANN-099), keine
Vorlage aus `quellen/`. Der PSFS ist gestrichen und bleibt inaktiv liegen, weil
seine Fassung `0.1.0` schon auf dem Server steht.

**Neue Fassung (ABN-014, ANN-084, ANN-219).** Eine Fassung, die einmal auf dem
Server liegt, ändert sich nie. Wer eine Datei ändert, hebt die Version, legt
die bisherige Datei als `archiv/<kennung>@<version>.json` ab und vermerkt in
`meta.vergleichbar_mit`, mit welchen früheren Fassungen die Werte vergleichbar
bleiben — eine reine Patch-Änderung immer, alles andere nach Prüfung. Danach
`pnpm definitionen:sql --schreiben`: Das erzeugt die Migration, gegen die der
Server Antworten prüft.
