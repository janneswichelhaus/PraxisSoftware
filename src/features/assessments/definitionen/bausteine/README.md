Definitionsdateien der Untersuchungsbausteine, eine je Region (Phase P2, FRB-003a).

Quelle ist `quellen/bausteine/mt-untersuchung-quelldaten.md`, wörtlich. Die
Nummer im Dateinamen gibt die Reihenfolge der Regionen wie in der Vorlage; der
Ladepfad sortiert nach Pfad, der Code kennt keinen Regionsnamen.

Übertragungsregeln (**ANN-118**):

- Text hinter „ – " ist der Durchführungshinweis (`hint`), ebenso eine Klammer,
  die nur die Durchführung beschreibt („30-60 Sekunden"). Er erscheint beim
  Abhaken und nie im Dokumentationstext.
- Unterpunkte a/b/c und o werden `subitems`. Eine dritte Ebene (Hüfte) wird
  flach: Die Zwischenüberschrift steht als Hinweis am Unterpunkt.
- Zwei Zeilen unter einer Nummer (HWS Basis 2) stehen als ein Item mit „ · "
  und je einem Unterpunkt.
- Therapieblöcke enthalten Techniken, alle übrigen Tests. Seitengetrennt
  (`bilateral`) sind alle Items der Extremitäten und des Kiefers, an der
  Wirbelsäule nur die neurologischen und neurodynamischen Tests und das SIG.
- Messwerte in cm nur dort, wo die Vorlage einen Wert erhebt: Knee to Wall,
  Navicular Drop.
- Unvollständig (`status: "unvollstaendig"`) sind Schulter „Untersuchung ACG",
  LWS „Behandlung" und HWS „Therapie Hochzervikal". LWS „Untersuchung SIG" ist
  vollständig (Plan D2).

Tippfehler der Vorlage bleiben stehen (**ANN-119**, Plan D3): „Relocation
Tet", „Supinatin", „Lachmann", „Painfull Arc Sign". Eine Korrektur hebt die
`version` der Region und ändert keine Kennung.

Der Zähl- und Wortlauttest steht in `../../bausteine.test.ts`.
