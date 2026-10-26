---
name: aufraeumen
description: Diagnostische Aufräumrunde - misst Größe, Kommentare, Modulgrenzen, große Dateien, Doppelungen und DB-Funktionen, vergleicht mit dem letzten Lauf und schlägt die drei größten Vereinfachungen vor. Ändert keinen Code. Nur auf ausdrücklichen Aufruf mit /aufraeumen.
disable-model-invocation: true
---

# Aufräumen

Rein diagnostisch (Jannes, 2026-10-25): messen, mit dem letzten Lauf vergleichen, **drei
Vereinfachungen konkret vorschlagen**. **Kein Code wird geändert**, auch nicht „nebenbei“; was
gebaut wird, entscheidet Jannes. Rhythmus: nach jedem abgeschlossenen Schritt eines Design-Reviews
oder auf Zuruf.

1. **Stand.** `git fetch origin --prune`, Branch der Session auf `origin/main`; offene PRs und
   `docs/STATUS.md` ansehen, damit nichts vorgeschlagen wird, das schon läuft.
2. **Messen.** `pnpm aufraeumen` vergleicht mit
   [`docs/development/AUFRAEUMEN.md`](../../../docs/development/AUFRAEUMEN.md) und listet die
   Brennpunkte: größte Programmdateien, meist von außen genutzte Module, gegenseitige
   Abhängigkeiten, längste Kommentare, meist neu gefasste DB-Funktionen, größte Doppelungen.
3. **Lesen, nicht ändern.** Die Brennpunkte im Code ansehen und fragen: Mit welchem anderen Schnitt
   verschwindet eine ganze Klasse von Sonderfällen? Vorrang haben Doppelungen zusammenführen, tiefe
   Importe und Kreise durch eine schmale Schnittstelle ersetzen (Weg: `docs/DEVELOPMENT.md`,
   „Modulgrenzen“), ein Register statt einer Liste von Hand, zusammengehörige Module zusammenlegen. Eingefrorene Visualisierungen (3D-Rad, ROADMAP
   7.16) sind Kandidaten für Einsparungen ohne Verlust im Kernbetrieb.
4. **Genau drei Vorschläge**, geordnet nach Wirkung je Aufwand. Je Vorschlag: was, wo (Dateien),
   welche Kennzahl sich wie ändert (geschätzt in Zeilen, Importen oder Funktionen), Aufwand, Weg
   (Standard oder Pfad A nach ADR-013 Punkt 9), Risiko. Sicherheits-, RLS- und Datenschutztests
   sind nie Einsparpotenzial.
5. **Ablegen.** Je Vorschlag ein Eintrag ohne Nummer in `docs/development/BEFUNDE.md` (Bereich
   „Aufräumen“, Quelle „/aufraeumen <Datum>“, Status „offen (Vorschlag)“), dann
   `pnpm aufraeumen --schreiben`.
   `pnpm format:check && pnpm docs:check`, Commit „Aufräumrunde <Datum>: Kennzahlen und drei
   Vorschläge“, Push, PR. Die PR ändert nur Markdown, die CI läuft kurz.
6. **Bericht** an Jannes: Tabelle vorher und jetzt mit den drei größten Veränderungen, die drei
   Vorschläge in je drei Sätzen und eine Empfehlung, welcher zuerst.
