# Quellen: Fremdinhalte, aus denen später Daten werden

Hier liegt das inhaltliche Ausgangsmaterial für zwei Bausteine der Anwendung:
die **Untersuchungs- und Behandlungsbausteine der Manuellen Therapie** und die
**18 standardisierten Fragebögen (PROMs)**. Von Jannes am **2026-09-21**
übergeben, zusammen mit einem Arbeitsauftrag:
[`ARBEITSAUFTRAG_Bausteine-und-Scores.md`](ARBEITSAUFTRAG_Bausteine-und-Scores.md).

Der Plan, wie daraus Code wird, steht nicht hier, sondern in
[`../docs/development/FRB-BAUSTEINE-UND-SCORES.md`](../docs/development/FRB-BAUSTEINE-UND-SCORES.md).

## Was dieses Verzeichnis ist — und was nicht

- Es ist der **eine Ort für Ausgangsmaterial, das nicht im Projekt entstanden
  ist** und das später wörtlich in Daten übergeht. Ohne diesen Ort liegt so
  etwas im Download-Ordner und ist in drei Monaten verschwunden — genau das
  war der Anlass.
- Es ist **verbindlich für den Wortlaut.** Wo eine Definition unter `src/` eine
  Testbezeichnung oder einen Itemtext trägt, ist der Wortlaut von hier
  maßgeblich. Eine Abweichung ist ein Fehler in der Definition, nicht hier.
- Es ist **kein Implementierungsauftrag und keine Einplanung.** Dass Material
  hier liegt, heißt nicht, dass etwas gebaut wird. Die Reihenfolge legt
  [`../docs/development/ROADMAP.md`](../docs/development/ROADMAP.md) fest.
- Es hat **keinen Rang** in der Hierarchie aus `PROJECT_PRINCIPLES.md` §21. Es
  ändert keine Anforderung, keinen ADR und keine Spezifikation. Wo eine Quelle
  hier und ein ADR auseinandergehen, gilt der ADR — und die Abweichung wird
  benannt, nicht stillschweigend aufgelöst.
- Es ist **von Prettier ausgenommen** (`.prettierignore`). Umformatieren wäre
  eine stille Änderung an einer Vorlage.

## Die drei Regeln

1. **Wortlaut ist unantastbar.** Testbezeichnungen und Itemtexte werden
   wörtlich übernommen — nicht umformuliert, nicht ergänzt, nicht „korrigiert".
   Tippfehler der Vorlage („Relocation Tet", „Supinatin", „Lachmann") bleiben
   stehen; eine Korrektur braucht die ausdrückliche Freigabe von Jannes. Bei
   den Fragebögen ist das keine Ordnungsliebe: eine geänderte Formulierung
   hebt die Vergleichbarkeit mit den Normwerten auf, und damit gelten Cut-offs
   und MCID nicht mehr.
2. **Eine Lücke bleibt eine Lücke.** Wo die Vorlage „im PDF nicht angegeben",
   „im PDF nicht geregelt" oder gar nichts sagt, wird nichts ergänzt — auch
   nicht Plausibles. Solche Stellen sind in der Definition als offen zu
   kennzeichnen und in der Oberfläche als offen zu zeigen. Vier Blöcke der
   MT-Vorlage und mehrere Scoring-Regeln sind betroffen; der Arbeitsauftrag
   zählt sie auf.
3. **Nichts hier ist Patientendaten.** Alle Bögen sind Leerformulare. Wer hier
   etwas ablegt, prüft das vorher — ein ausgefülltes Formular oder ein
   Bildschirmfoto aus fremder Software gehört nicht in dieses Repository
   (`CLAUDE.md`, Harte Regeln).

## Was hier liegt

### Untersuchungsbausteine der Manuellen Therapie

[`bausteine/mt-untersuchung-quelldaten.md`](bausteine/mt-untersuchung-quelldaten.md)
— neun Regionen (HWS, LWS, Schulter, Ellenbogen, Hand, Hüfte, Knie, Fuß,
Kiefer) mit Basisuntersuchung, weiterführender Untersuchung, Spezialblöcken und
Behandlungstechniken. Maschinell aus neun PDF-Lernübersichten der
MT-Prüfungsvorbereitung extrahiert (`pdftotext -layout`, 2026-09-20).

**Die neun Original-PDFs liegen seit 2026-09-21 daneben**, in
[`bausteine/pdf/`](bausteine/pdf/) und mit Prüfsumme im Register. Verfasser ist
Jannes selbst (Autorfeld der Dateien), erstellt 2025-07-15 zur eigenen
Prüfungsvorbereitung — es ist kein fremdes Material. Sie sind hier, weil die
Abnahme von Phase P2 Itemzahlen je Block gegen die Vorlage hält: Ohne das
Original ist die Extraktion gegen nichts zu prüfen, und vier Blöcke sind darin
ausdrücklich unvollständig. Die Dateinamen tragen die ASCII-Umschrift der
Tabelle (`Fuss`, `Huefte`), weil Umlaute in Dateinamen zwischen Windows und
macOS verschieden gespeichert werden und die Prüfsumme dann an der falschen
Stelle reißt.

Der Inhalt steht in Codeblöcken, damit die Einrückung der Vorlage erhalten
bleibt. Sie trägt Bedeutung: Einrückung unterscheidet Test von Unterpunkt.

### Scores (PROMs)

| Datei                                                                        | Was darin steht                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`scores/Score-Inventar_Praxissoftware_v1.xlsx`](scores/Score-Inventar_Praxissoftware_v1.xlsx) | Arbeit von Jannes, vier Blätter: Anleitung, Inventar, Scoring, Quellen. **Die Quelle.**            |
| [`scores/score-inventar.md`](scores/score-inventar.md)                       | dieselben drei Datenblätter als lesbarer Text, ein Abschnitt je Score. Wiedergabe, nicht Quelle.   |
| `scores/pdf/`                                                                | die 18 Original-PDFs von digotor.info. **Die Quelle der Itemtexte.**                              |
| `scores/pdf-text/`                                                           | deren Textextrakte (`pdftotext -layout -enc UTF-8`) — Arbeitsfassung, jederzeit neu zu erzeugen.   |

Die Tabelle enthält **alles außer den Itemtexten**: Items, Antwortformat,
Wertebereich, Richtung, Subskalen, Rechenvorschrift, Umgang mit fehlenden
Werten, MCID/MDC, Cut-offs, Validierungsquelle, Direktlink. Die **Itemtexte
stehen nur in den PDFs** und werden von dort übernommen. Das ist die Stelle,
an der ein Sprachmodell zuverlässig danebenliegt: Reihenfolgen und
Formulierungen wirken plausibel und sind falsch.

## Warum die PDFs im Repository liegen

Dieses Repository ist **öffentlich** (`github.com/janneswichelhaus/PraxisSoftware`,
am 2026-09-21 geprüft), und die 18 Bögen sind Werke Dritter: DIGOTOR stellt sie
frei zum Herunterladen bereit, die Instrumente selbst gehören ihren Autoren und
Übersetzern.

**Jannes hat das am 2026-09-21 entschieden:** Es gibt keine Lizenzierung, alle
Inhalte dürfen ausnahmslos integriert werden, PDFs und Itemtexte kommen ins
Repository. Die Frage war ihm vorgelegt, samt dem Unterschied zwischen der
Nutzung in der Praxissoftware und der Weiterveröffentlichung über ein
öffentliches Repository; er hat sie in Kenntnis dessen so entschieden. Das ist
**D1** im Plan
([`../docs/development/FRB-BAUSTEINE-UND-SCORES.md`](../docs/development/FRB-BAUSTEINE-UND-SCORES.md)),
damit erledigt — und die Score-Definitionen dürfen ihre Itemtexte tragen.

**Eine Rücknahme ist kein Löschen.** Ein Blob bleibt in der Historie, auch wenn
die Datei später verschwindet; wer die Bögen wieder herausnehmen will, schreibt
die Historie um und erzwingt bei allen einen neuen Clone. Das Repository später
privat zu stellen entfernt sie **nicht** aus schon gezogenen Kopien. Deshalb
steht die Entscheidung hier und nicht nur in einer Commit-Nachricht: wer sie
eines Tages umdreht, soll wissen, was er umdreht.

Gesichert sind die Bögen damit dreifach: im Repository, hier als Prüfsumme mit
Direktlink, und bei DIGOTOR als Download. Mit Prüfsumme und Link lässt sich jede
Datei wiederbeschaffen **und** als dieselbe erkennen.

## Register

Format von `sha256sum`, Pfade relativ zu diesem Verzeichnis. `src/quellen.test.ts`
hält das Register gegen die Dateien: jede genannte Datei muss da und unverändert
sein, und jede Quelle hier muss genannt sein. Wer eine Quelle ändert oder
ergänzt, ändert die Zeile mit — sonst wird der Test rot, und das ist sein Zweck.

### Quellen mit Prüfsumme

```
f3918b8bc6ffaa1b2d186b568e0d93b12d2678e5741f655b3ef0a6d8ab73cd4f  ARBEITSAUFTRAG_Bausteine-und-Scores.md
c0081745f9783c79b66e74628be85a587ae33297ff4bc1a95b19810e715592b8  bausteine/mt-untersuchung-quelldaten.md
0962ab36de613312f77ede64f3ef51bc5e138ddcdb0b36c47de85694407a3f37  bausteine/pdf/Ellenbogen_MT_Lernuebersicht.pdf
73fd06d91bcfd1323536d319d8fd5f3af47090d696d1caacd1e1f6bb32b25fc2  bausteine/pdf/Fuss_MT_Lernuebersicht.pdf
dd1c345fbfe18aea02cc50340a29f37c8f1272d5e21335bc1be6662c092cb803  bausteine/pdf/Huefte_MT_Lernuebersicht.pdf
8226f8e56c46d3eaf86f790f3fe553e456efea940f30aa4f5d1525ccaac943d2  bausteine/pdf/HWS_ManuelleTherapie_Lernuebersicht.pdf
f28ea23002a12b24a4241f0f941714c34a156fe5820edcdccfc28ffea7bcbd41  bausteine/pdf/Hand_MT_Lernuebersicht.pdf
3f1e16f25fc11dff6b0bf1de2db4c9784c336f73c50829ffbdbb43084e8f8153  bausteine/pdf/Kiefer_MT_Lernuebersicht.pdf
bd80b18ed9e02ff5fdccd5d19e71cea0b9bab42ce43568b77f2c0339badf847e  bausteine/pdf/Knie_MT_Lernuebersicht.pdf
a6df3f8b98b1ff6a91d98581fa8586b989fc3cc2b25e5b849fa12c5a19689c6b  bausteine/pdf/LWS_MT_Lernuebersicht.pdf
8e3130d6011799994786d56be36d7a90e7732dea765ea0f986a9dead09a21aa1  bausteine/pdf/Schulter_MT_Lernuebersicht.pdf
cf89dfbbaa8f384151d348466a859074a3efe163e6289692ccf16dd7002601d3  scores/Score-Inventar_Praxissoftware_v1.xlsx
f3dd09fd736f7e42fa8a643c130d7a36a257d21884d7b80c5c9ca77055f49513  scores/pdf/Anamnesebogen_Version-8_DIGOTOR_07-2026.pdf
1d91e6124d88ffe17cf664c4840363d737ab0fe4d5bdd79254a714a82b2f44a1  scores/pdf/Fear-Avoidance-Belief-Questionnaire-FABQ_09-2023.pdf
ad0b3a3409fc013cd93bc7fa90848a5e605b64edd831b735ddb13a507979bbde  scores/pdf/Foot-and-Ankle-Ability-Measure-FAAM-G_09-2023.pdf
9fb00c79e719b493ea731f61bdf2a6c587d278b01cacedb818d1577a48089bea  scores/pdf/Hip-Osteoarthritis-Outcome-Score-HOOS_09-2023.pdf
e972b93414578abbf000e8142a5ab0742e6988330ddb7b451a4f173301c0ffc3  scores/pdf/Knee-Injury-Osteoarthritis-Outcome-Score-KOOS_09-2023.pdf
16a5dd7525b553160db34e1b21f9e60c5c6ea00c7fa696b493fb85fe201ce84f  scores/pdf/Lower-Extremity-Functional-Scale-LEFS_05-2024.pdf
e05b82aa43cf176746914bbc04599a09e986b161c14955934ee1eb3724522e22  scores/pdf/Neck-Disability-Index_09-2023.pdf
17f5134264702c4a4957835073038df3abd0c96c1872eab35f0e83e3786e1e83  scores/pdf/Oswestry-Disability-Index-ODI_09-2023.pdf
9e3347e2af938f4ceec51438dd488e9569ff7f9f7c13a68e11a85094612f17b8  scores/pdf/Pain-Catastrophizing-Scale-PCS_09-2023.pdf
8f8abd4712ef994605f62ad3b1d2beb8a79468bda9f5cb723059383115963f79  scores/pdf/Patient-Health-Questionnaire-4-PHQ-4_09-2023.pdf
fbf489538b70d882c30f23d19cbc16d42bb8fbcab5f09c86b51668bc06b4ef8a  scores/pdf/Patient-Rated-Wrist-Evaluation-Score-PRWE-G_08-2026.pdf
0a97a874ed58684ce4a1ee7ef8a507a05fe4b9a8c4bbdb2608c949d62fbf33ec  scores/pdf/Roland-and-Morris-Disability-Questionnaire-RMDQ_09-2023.pdf
168e3e796b79a1f0bb89cf0a5a052dcf9ee4dcda2c54c86ec018b29b5db48e80  scores/pdf/STarT-Back-Screening-Tool-Deutsch_09-2023.pdf
a1baaacb2f00e11ef1bc138e33e8cc5057e2e4650f155e272401da75aeb6cdb6  scores/pdf/Shoulder-Pain-and-Disability-Index-SPADI_03-2026.pdf
d465d9f16e1004f1d59b8d3d5172ddf71628dda853182e3f703f1dc0f108298d  scores/pdf/Tampa-Scale-of-Kinesiophobia_09-2023.pdf
1fd9e6c41b6ed3c6cf4a85ecfd126d44fe82184c07ecddeeec2aa7cb755a94dc  scores/pdf/Tegner-Activity-Scale-TAS_09-2023.pdf
ae289cf87941dcd1aea418e017aac5563fb58b48e75f7be30d6aed12327b28cc  scores/pdf/VISA-A-Score_09-2023.pdf
3817ee3340c424e7d2f802c6d1eda4e5e01ba993ceff8d0c5ccf3686b0c9b12e  scores/pdf/VISA-P-G-Score_09-2023.pdf
```

### Abgeleitete Dateien ohne Prüfsumme

Drei Dinge hier sind aus den Quellen gewonnen und nicht selbst Quelle. Eine
Prüfsumme darauf würde bei jeder Korrektur reißen, ohne etwas zu schützen:

- `README.md` — dieses Register.
- `scores/score-inventar.md` — Wiedergabe der Tabelle.
- `scores/pdf-text/*.txt` — Arbeitsfassung der PDFs. Der Test besteht nur
  darauf, dass zu **jeder** PDF ein Extrakt gehört und umgekehrt; über den
  Inhalt entscheidet die PDF, und die hat eine Prüfsumme.
- `bausteine/pdf-text/*.txt` — dasselbe für die Lernübersichten, aber
  **freiwillig**: Die maßgebliche Übertragung ist
  [`bausteine/mt-untersuchung-quelldaten.md`](bausteine/mt-untersuchung-quelldaten.md),
  und in der Cloud gibt es kein `pdftotext`. Das Verzeichnis darf fehlen. Eine
  Richtung bleibt hart: ein Extrakt ohne zugehörige PDF ist ein Fehler.

## Wiederbeschaffung und Neuerzeugung

Sollte eine Score-PDF verlorengehen: Sie steht unter ihrem Direktlink bei
digotor.info — je Score in [`scores/score-inventar.md`](scores/score-inventar.md)
— und gehört nach `quellen/scores/pdf/` unter genau dem Dateinamen aus dem
Register. Für die neun MT-Lernübersichten gibt es keinen Link: Ihre Quelle ist
Jannes' eigene Ablage.
Der Name ist der Schlüssel, unter dem Inventar, Plan und Test sie ansprechen. Ob
es dieselbe Datei ist, sagt `pnpm test`.

Die Textextrakte entstehen neu mit:

```bash
cd quellen/scores && for f in pdf/*.pdf; do pdftotext -layout -enc UTF-8 "$f" "pdf-text/$(basename "${f%.pdf}").txt"; done
```

Für die neun Lernübersichten dasselbe, nur muss das Zielverzeichnis zuerst
entstehen — es ist bewusst nicht im Repository, weil leere Verzeichnisse dort
nicht existieren:

```bash
cd quellen/bausteine && mkdir -p pdf-text && for f in pdf/*.pdf; do pdftotext -layout -enc UTF-8 "$f" "pdf-text/$(basename "${f%.pdf}").txt"; done
```

Findet die Schleife nichts und `pdftotext` meldet `Couldn't open file
'pdf/*.pdf'`, steht die Arbeitskopie auf einem Branch ohne diese Dateien.

`-enc UTF-8` ist nicht optional: ohne die Angabe schreibt `pdftotext` hier
ISO-8859-1, und jedes „ö" im Itemtext wird zu einem Fehler, der erst in der
Definition auffällt. Unter Windows entstehen die Extrakte mit CRLF; `git` zieht
sie über `.gitattributes` auf LF, damit der Diff lesbar bleibt.
