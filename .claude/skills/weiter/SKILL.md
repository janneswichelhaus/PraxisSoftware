---
name: weiter
description: Sessionstart ohne Vorgabe - nimmt die erste offene Aufgabe aus docs/STATUS.md, liest nur das Nötige und führt sie aus (Code als Feature-Loop, Dokumentation als Docs-Session). Nur auf ausdrücklichen Aufruf mit /weiter oder /weiter <Aufgabe>.
disable-model-invocation: true
---

# Weiter

Der Normalfall jeder Session. `/weiter` nimmt die **erste offene Aufgabe** unter
„Danach" in `docs/STATUS.md`; `/weiter <Aufgabe>` nimmt die genannte. Genau
eine Aufgabe je Session, kein Vorgriff auf die nächste.

## 1. Lesen — die eine Leseregel

1. `CLAUDE.md` (liegt schon im Kontext) und `docs/STATUS.md`.
2. In `docs/development/ROADMAP.md` **nur die Zeile der Aufgabe** und den
   Absatz über ihrer Tabelle (`grep -n "<Kennung>"`, dann den Zeilenbereich).
   Nennt die Zeile einen Plan (`MAP-LOOPS.md`, `FRB-BAUSTEINE-UND-SCORES.md`),
   dessen Abschnitt zur Aufgabe.
3. Die ADRs, die der SPEC benennt (Index in `CLAUDE.md`) — **vollständig**,
   keine anderen.

Alles Weitere nur gezielt per `grep` oder Zeilenbereich, wenn die Aufgabe es
braucht. Vor dem Bauen den Gesamtstand prüfen: `git fetch origin --prune`,
`git branch -r`, offene Pull Requests — nichts neu bauen, was schon auf einem
Branch liegt.

## 2. Ausführen

- **Code** (Migration, Policy, RPC, Oberfläche …): Klassifikation K1 nach
  `docs/development/GRAPH-ENGINEERING-WORKFLOW.md`. Pfad A läuft ab Schritt K1
  nach `.claude/skills/feature-loop/SKILL.md` — einschließlich der Freigabe am
  Ende von A. Pfad S: stoppen und `/sandbox <Thema>` vorschlagen.
- **Dokumentation** (ADR, Umbau-Schritt, Providerprüfung, Antworten
  einarbeiten): als Docs-Session nach der Vorgabe, auf die die Zeile zeigt.
  Kein Produktivcode; Prüfung wie unten.

## 3. Abschluss

- Prüfungen: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check`,
  dazu `pnpm test:db` bei Datenbank und Policies (Cloud: `CLAUDE.md`,
  „Cloud-Umgebung"). Nur melden, was tatsächlich gelaufen ist.
- Fortschritt: den Posten in `docs/development/fortschritt.json` nachstellen
  (Status, `fertig_am`, `nachweis`), dann `pnpm fortschritt --schreiben` — das
  erzeugt die Tabelle der Roadmap.
- `docs/STATUS.md`: Jetzt, Danach (nächste drei), Blocker, Letzte Session mit
  den lokalen Schritten.
- Oberfläche: Bildschirmfotos bei Desktop und 375 px in der Pull Request, die
  Sichtung des Blocks um höchstens drei Schritte ergänzen
  (`docs/sichtung/README.md`).
- Push, Pull Request gegen `main`, kein Merge. Bericht nach Skill-Schritt I des
  Feature-Loops. **Dann stoppen.**
