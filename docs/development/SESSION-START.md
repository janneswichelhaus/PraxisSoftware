# Standard-Startprompt für jede Folgesession

Kopiere den Block unverändert in Claude Code. Nur die letzte Zeile wird
ausgefüllt, wenn du etwas anderes willst als die nächste Aufgabe aus
[`../STATUS.md`](../STATUS.md).

Modell und Aufwand: `.claude/settings.json` setzt Opus 5 projektweit. Bei
Migration, RLS, Policy oder Zweitreview zusätzlich `/effort xhigh`. In der
Weboberfläche hat die Modellwahl beim Sessionstart Vorrang; für CLI-Sessions
gilt die Datei.

---

Lies `CLAUDE.md` und `docs/STATUS.md`. Nichts anderes vollständig lesen —
außer den ADRs, die das SPEC benennt (Pfad A); weitere Dateien nur gezielt per
`grep`/Zeilenbereich, wenn die Aufgabe sie braucht.

Aufgabe: die erste offene Aufgabe aus `docs/STATUS.md`, sofern unten nichts
anderes steht. Nur diese eine Aufgabe, kein Vorgriff auf die nächste.

Ablauf:

1. Branch `claude/<aufgaben-kennung>` von `main`.
2. In drei Sätzen: was du baust, was du bewusst nicht baust, welche Prüfungen
   betroffen sind. Dann warten auf „Freigabe".
3. Nach Freigabe: bauen, kleine Commits, Prüfungen laufen lassen
   (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check`,
   `pnpm test:db` nur bei Migrationen/Policies). Jede gemeldete Prüfung ist
   tatsächlich gelaufen.
4. `docs/STATUS.md` aktualisieren: Stand, nächste drei Aufgaben, Blocker.
   `pnpm docs:check` muss grün sein.
5. Push, PR gegen `main`. Kein Merge durch dich. Melde: PR-Link, CI-Status, was
   ich im Browser prüfen soll (max. 5 Klicks), was ich nach dem Merge ausführe.
6. Stopp. Keine Folgeaufgabe beginnen.

Regeln: Keine neue Abhängigkeit, kein neuer Anbieter, kein Security-/RLS-/
Datenschutztest und kein CI-Gate abschwächen, keine echten Daten, keine
Secrets. Annahmen nur als `ANN-NNN` mit Code-Anker; keine Doku-Datei über ihre
Obergrenze wachsen lassen. Was nicht in diese Session passt, wird eine Zeile in
`ROADMAP.md` (Aufgabe), `BEFUNDE.md` (Befund) oder dem Ideenspeicher (Idee);
`STATUS.md` nennt nur die nächsten drei.

Abweichende Aufgabe (optional):
