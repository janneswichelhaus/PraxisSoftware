---
name: aufraeumen
description: Diagnostische Aufräumrunde - misst Größe, Kommentare, Modulgrenzen, große Dateien, Doppelungen und DB-Funktionen, vergleicht mit dem letzten Lauf und schlägt die drei größten Vereinfachungen vor. Ändert keinen Code. Nur auf ausdrücklichen Aufruf mit /aufraeumen.
disable-model-invocation: true
---

# Aufräumen

Rein diagnostisch (Jannes, 2026-10-25): messen, mit dem letzten Lauf vergleichen, **drei
Vereinfachungen konkret vorschlagen**. **Kein Code wird geändert**, auch nicht „nebenbei“; was
gebaut wird, entscheidet Jannes. Rhythmus: nach jedem Schritt eines Design-Reviews oder auf Zuruf.

1. **Stand** wie in `CLAUDE.md` (fetch, Branches, offene PRs, STATUS): nichts vorschlagen, was läuft.
2. **Messen.** `pnpm aufraeumen` vergleicht mit `docs/development/AUFRAEUMEN.md` und listet die
   Brennpunkte: größte Dateien, meist genutzte Module, gegenseitige Abhängigkeiten, längste
   Kommentare, meist neu gefasste DB-Funktionen, größte Doppelungen.
3. **Lesen, nicht ändern.** Mit welchem Schnitt verschwindet eine Klasse von Sonderfällen?
   Vorrang: Doppelungen zusammenführen, tiefe Importe und Kreise durch eine schmale Schnittstelle
   ersetzen (`docs/DEVELOPMENT.md`, „Modulgrenzen“), Register statt Liste von Hand, Module
   zusammenlegen; Teamchat, Radflotte und Personal sind Kandidaten ohne Verlust im Kernbetrieb.
4. **Genau drei Vorschläge**, nach Wirkung je Aufwand: was, wo (Dateien), welche Kennzahl sich wie
   ändert (geschätzt), Aufwand, Weg (Standard oder Pfad A nach ADR-013 Punkt 9), Risiko.
   Sicherheits-, RLS- und Datenschutztests sind nie Einsparpotenzial.
5. **Ablegen.** Je Vorschlag ein Eintrag ohne Nummer in `docs/development/BEFUNDE.md` (Bereich
   „Aufräumen“, Quelle „/aufraeumen <Datum>“, „offen (Vorschlag)“), `pnpm aufraeumen --schreiben`,
   `pnpm format:check && pnpm docs:check`, Commit „Aufräumrunde <Datum>“, Push, PR (nur Markdown).
6. **Bericht** an Jannes: Tabelle vorher und jetzt mit den drei größten Veränderungen, die drei
   Vorschläge in je drei Sätzen und eine Empfehlung, welcher zuerst.
