---
name: sichtung
description: Jannes sichtet über Bilder - Bildstrecke (vorher/nachher, 375 und 1280 px) durchwischen, höchstens 20 Punkte, etwa 10 Minuten; Claude trägt Befunde nach BEFUNDE.md und den Fortschritt ein. Mit /sichtung triage <Datei> werden alte Sichtungsschritte per Bildstrecke geschlossen. Nichts bauen. Nur auf ausdrücklichen Aufruf mit /sichtung, /sichtung <PR oder Bereich> oder /sichtung triage <Datei>.
disable-model-invocation: true
---

# Sichtung

Jannes prüft Belege, nicht Klickanleitungen: die **Bildstrecke** einer PR, etwa 10 Minuten am
Handy. Regeln: `docs/sichtung/README.md`. **Nichts bauen.**

## Bildsichtung

1. **Quelle.** `/sichtung` nimmt die jüngste PR mit Bildstrecke, `/sichtung <PR oder Bereich>` die
   genannte. Fehlen Bilder, erzeugt Claude sie selbst: Cloud-Stack (`CLAUDE.md`), dann
   `pnpm bildstrecke` für die Routen der PR bei 375 und 1280 px, Bilder selbst ansehen.
2. **Zeigen.** Den Kontaktbogen (vorher/nachher je Route) als Datei oder Seite geben, dazu
   höchstens **20 Punkte**: die Fragen der PR und je Bild eine Prüffrage aus der Prüfliste in
   `docs/design/DESIGN.md` oder dem Budget aus `docs/product/kernablaeufe.md`. Nicht Schritt für
   Schritt abfragen — Jannes antwortet gesammelt: „ok“ oder „Befund: <Bild>, <was>“.
3. **Am Gerät** nur, was ein Bild nicht zeigt: Kamera, Passkey, Flugmodus, Sonne, Halterung am Rad —
   höchstens fünf Punkte je PR, auf der Test-Umgebung.
4. **Befunde** als `BEF-NNN` nach `docs/development/BEFUNDE.md` (nächste freie Nummer, auch gegen
   `archiv/BEFUNDE-ERLEDIGT.md`; Bereich, Rolle, Bild, erwartet, gesehen) — **keine echten Daten,
   keine Namen außer Seed**. Sie werden die erste Story der nächsten Überholung des Bereichs.
5. **Abschluss.** In `docs/development/fortschritt.json` die gesichteten Posten auf `gesichtet` mit
   `gesichtet_am`, dann `pnpm fortschritt --schreiben`; STATUS in drei Zeilen;
   `pnpm format:check && pnpm docs:check`, Commit, Push, PR.

## Triage alter Sichtungsschritte (`/sichtung triage <Datei>`)

Für eine Datei aus `docs/sichtung/` je offenem Schritt genau eine Einordnung, ohne Jannes:

- **durch Bild belegt** — die Route steht in einer aktuellen Bildstrecke, und das Bild zeigt, was
  der Schritt erwartet;
- **durch Test belegt** — ein E2E- oder Komponententest prüft genau das (Datei und Testname nennen);
- **Gerät** — braucht Kamera, Passkey, Flugmodus, Sonne oder echten Kartendienst: auf die
  Sichtliste im README;
- **Bildstrecke** — noch nicht abgebildet: kommt in die Bildstrecke der nächsten Überholung.

In der Datei unter „Ergebnis“ Datum und die Einordnung je Schritt eintragen, im README den Stand.
Eine Einordnung ist kein Häkchen: „durch Bild belegt“ nur mit Bildpfad, „durch Test belegt“ nur
mit Testnamen.
