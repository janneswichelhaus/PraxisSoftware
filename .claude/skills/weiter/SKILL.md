---
name: weiter
description: Sessionstart ohne Vorgabe - nimmt die nächste Aufgabe aus docs/STATUS.md und führt sie aus, als /bereich (Bereichsüberholung) oder /feature-loop (Einzelauftrag); Dokumentation als Docs-Session, Planung ohne Code. Nur auf ausdrücklichen Aufruf mit /weiter oder /weiter <Aufgabe>.
disable-model-invocation: true
---

# Weiter

`/weiter` nimmt die erste Aufgabe unter „Danach“ in `docs/STATUS.md`, `/weiter <Aufgabe>` die
genannte, `/weiter <A>, <B>` beide nacheinander.

1. **Lesen:** `docs/STATUS.md`; in `docs/development/ROADMAP.md` nur die Zeile der Aufgabe und den
   Absatz darüber (`grep -n "<Kennung>"`); nennt sie eine Vorgabe (`git show …`), deren Abschnitt.
   ADRs erst, wenn die Spec sie nennt. Vorher `git fetch origin --prune`, Branches, offene PRs.
2. **Ausführen:**
   - **Bereich** (Überholung, mehrere Abläufe oder Seiten eines Arbeitsbereichs): nach `/bereich`.
   - **Einzelauftrag** (Epic, Befundbündel, Datenmodell oder Rechte): nach `/feature-loop`.
   - **Dokumentation** (ADR, Providerprüfung, Antworten einarbeiten): Docs-Session nach der Vorgabe
     der Zeile, kein Produktivcode; Prüfung mit `pnpm format:check && pnpm docs:check`.
   - **Planung** (früher „Wochenupdate“; nach einer Überholung oder einem Block, sonst auf Zuruf),
     **nichts bauen:** STATUS, Kette und Meilensteine der Roadmap, `node scripts/fortschritt.mjs`
     und `git log --since='8 days ago' --oneline` lesen; was ist fertig **und gesichtet**, passt
     die erste Aufgabe zur Kette, wie stehen Prüfungen und Risiken, ist M2 in Sicht (R1). Antwort in
     höchstens zwölf Zeilen: was als Nächstes ansteht · offene Sichtungen · Jannes entscheidet oder
     liefert · M1 bis M6 je erreicht oder offen, mit dem fehlenden Kriterium in einem Wort.
3. **Abschluss** je Aufgabe nach dem jeweiligen Skill (eine PR, STATUS in drei Zeilen). Nennt der
   Aufruf mehrere Aufgaben, folgt die nächste ohne Zwischenstopp.
