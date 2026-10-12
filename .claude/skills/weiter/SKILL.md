---
name: weiter
description: Sessionstart ohne Vorgabe - nimmt die nächste Aufgabe aus docs/STATUS.md und führt sie aus, als /bereich (Bereichsüberholung) oder /feature-loop (Einzelauftrag); Dokumentation als Docs-Session. Nur auf ausdrücklichen Aufruf mit /weiter oder /weiter <Aufgabe>.
disable-model-invocation: true
---

# Weiter

`/weiter` nimmt die erste Aufgabe unter „Danach“ in `docs/STATUS.md`, `/weiter <Aufgabe>` die
genannte, `/weiter <A>, <B>` beide nacheinander.

1. **Lesen:** `docs/STATUS.md`; in `docs/development/ROADMAP.md` nur die Zeile der Aufgabe und den
   Absatz darüber (`grep -n "<Kennung>"`); nennt sie einen Plan, dessen Abschnitt. ADRs erst, wenn
   die Spec sie nennt. Vorher `git fetch origin --prune`, Branches, offene PRs.
2. **Ausführen:**
   - **Bereich** (eine Bereichsüberholung, mehrere Abläufe oder Seiten eines Arbeitsbereichs):
     nach `.claude/skills/bereich/SKILL.md`.
   - **Einzelauftrag** (Epic, Befundbündel, Datenmodell oder Rechte): nach
     `.claude/skills/feature-loop/SKILL.md`.
   - **Dokumentation** (ADR, Providerprüfung, Antworten einarbeiten): Docs-Session nach der Vorgabe
     der Zeile, kein Produktivcode; Prüfung mit `pnpm format:check && pnpm docs:check`.
3. **Abschluss** je Aufgabe nach dem jeweiligen Skill (eine PR, STATUS in drei Zeilen). Nennt der
   Aufruf mehrere Aufgaben, folgt die nächste ohne Zwischenstopp.
