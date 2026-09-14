# R2 Konsolidierung — Zwischenstand Knoten 3

**Temporär. Wird zusammen mit `R2-ARBEITSANWEISUNG.md` im letzten Commit von
Knoten 4 gelöscht.** Liegt im Repository statt in `/tmp`, weil eine neue Session
einen frischen Container bekommt und `/tmp` dort leer ist.

Stand: 2026-09-14, nach Gruppe 2. Branch `claude/konsolidierung-r2`,
Baseline `7160fd5`.

## Erledigt

| Gruppe | Commit | Inhalt | Prüfungen |
| --- | --- | --- | --- |
| 1 Löschen | `da06e75` | R2-009/010/011/014/027/033, Sammelposten Skripte/Config | `format:check`, `lint` (0 Fehler, 6 Warnungen wie Baseline), `typecheck`, `test` (92 Dateien, 1 462 Tests) — alle grün |
| 2 Register | `3e982f3` | R2-012/013/015, Einheitsstruktur 4.7, ANFRAGEN.md (R2-F01), Sammelposten Register | Invarianten-Skript, Anker-Abgleich (53/53), Linkprüfung, `format:check` — alle grün |

Zeilen: `ASSUMPTIONS.md` 3 575 → 734 · `OPEN_DECISIONS.md` 1 415 → 400 ·
`ANFRAGEN.md` neu 483 · `ROADMAP.md` 859 → 813 · zwei Archivdateien gelöscht.

## Offen — Reihenfolge nach Arbeitsanweisung 4.11

3. Zusammenlegen Steuerung (R2-001…008, 017, 018, 024, 028–030, Skills,
   Vision/Ideen) → Linkprüfung.
4. Korrigieren (R2-016, 019–023, 025, 026, 031, 036, 039, Sammelposten
   Roadmap/Abnahme) → Linkprüfung.
5. Code-Hygiene (R2-032–035, 037, 038, ci.yml, .gitignore, Sammelposten Code) →
   `lint && typecheck && test`, Testanzahl 1 462 belegen.
6. Betriebsmodell (STATUS.md, SESSION-START.md, docs-check.mjs, package.json,
   ci.yml-Schritt, settings.json).
7. `PROJECT_PRINCIPLES.md` 0.10.1 (eigener Commit).
8. ADR-013 Fassung 3 (eigener Commit).
9. Abschlusslauf in einem Aufruf, Baseline-Messungen wiederholen, Push, PR gegen
   `main` (kein Merge durch die Session), Knoten-4-Bericht.

## Abweichungen von der Arbeitsanweisung (im Bericht zu nennen)

1. **`.gitignore` (Gruppe 1):** Acht der zehn genannten Einträge sind raus,
   `secrets/` und `.secrets` bleiben. Sie sind das einzige Muster, das
   Schlüsselmaterial außerhalb von `.env*` erfasst; ihr Wegfall wäre eine
   Lockerung an einer MUSS-Anforderung (`PROJECT_PRINCIPLES.md` §3.3) für zwei
   Zeilen Gewinn (§16). Jannes kann das überstimmen.
2. **`Herkunft` im Register (Gruppe 2):** Abschnitt 1 („Zielgrößen") lässt je
   Eintrag nur Kopf, Aussage, Anker, Änderungspfad, Wiedervorlage und eine Zeile
   Begründung zu, Abschnitt 4.7 nennt zusätzlich eine optionale Zeile
   `Herkunft`. Aufgelöst zugunsten von Abschnitt 1: `Ablösung` bleibt (sie trägt
   ANN-Querverweise), `Herkunft` geht in der Begründung auf, deren Quellen
   ohnehin verlangt sind.
3. **Prüfpaket-Filter:** Der in 4.7 vorgeschlagene Filter über
   `Datenschutz|Recht` trifft auch Einträge, deren Wiedervorlage das Wort
   „Datenschutzprüfung" enthält. Verwendet wird stattdessen der Zusatz
   `Prüfpaket` der Statuszeile; er deckt sich exakt mit dem Kategoriefilter
   (29 Einträge, beide Richtungen geprüft).
4. **R2-033:** Die Arbeitsanweisung sagt, `PrescriberFormPage.tsx:19` und
   `PrescriptionFormPage.tsx:26` importierten bereits direkt aus
   `@/lib/abstecher`. Sie importierten aus `./api`; beide Seiten wurden auf den
   direkten Import umgestellt, damit der Re-Export entfallen konnte.
5. **`fetch-depth: 0` (Gruppe 1):** entfernt, nachdem geprüft wurde, dass
   `scripts/scan-secrets.sh` nur den Arbeitsbaum liest (`git ls-files`,
   `git grep`) und keine Historie — das Gate verliert nichts.

## Für Gruppe 6 vormerken

`docs:check` Prüfung 3 (relative Links) schlägt auf dem Beispielpfad
`[…](pfad)` in `R2-ARBEITSANWEISUNG.md` Abschnitt 4.5 an. Vor dem Abschlusslauf
dort die Klammerform entschärfen (Backticks statt Link) — das Gate bleibt
unangetastet.

## Werkzeuge dieser Session

Skripte liegen im Scratchpad der Session (`bauen.py`, `invarianten.py`,
`extract.py`, `texte_01..06.py`, `anfragen.py`). Eine neue Session braucht sie
nicht: Gruppe 2 ist abgeschlossen, die Kopie des alten Registers lag unter
`/tmp/ASSUMPTIONS.vorher.md` und ist mit dem Container weg — der Vergleich
gegen den Stand vor dem Umbau geht dann über `git show 7160fd5:docs/decisions/ASSUMPTIONS.md`.
