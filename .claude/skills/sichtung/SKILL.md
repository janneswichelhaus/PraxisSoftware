---
name: sichtung
description: Jannes sichtet über Bilder - Bildstrecke (vorher/nachher, 375 und 1280 px) durchwischen, höchstens 20 Punkte, etwa 10 Minuten; Claude trägt Befunde nach BEFUNDE.md und den Fortschritt ein. Mit /sichtung gerät geht er die Sichtliste am Gerät durch. Nichts bauen. Nur auf ausdrücklichen Aufruf mit /sichtung, /sichtung <PR oder Bereich> oder /sichtung gerät.
disable-model-invocation: true
---

# Sichtung

Jannes prüft Belege, nicht Klickanleitungen: die **Bildstrecke** einer PR, etwa 10 Minuten am
Handy. Regeln und Sichtliste: `docs/sichtung/README.md`. **Nichts bauen.**

## Bildsichtung

1. **Quelle.** `/sichtung` nimmt die jüngste PR mit Bildstrecke, `/sichtung <PR oder Bereich>` die
   genannte. Fehlen Bilder, erzeugt Claude sie selbst: Cloud-Stack (`CLAUDE.md`), dann
   `pnpm bildstrecke` für die Routen der PR bei 375 und 1280 px, Bilder selbst ansehen.
2. **Zeigen.** Den Kontaktbogen (vorher/nachher je Route) als Datei oder Seite geben, dazu
   höchstens **20 Punkte**: die Fragen der PR und je Bild eine Prüffrage aus der Prüfliste in
   `docs/design/DESIGN.md` oder dem Budget aus `docs/product/kernablaeufe.md`. Nicht Schritt für
   Schritt abfragen — Jannes antwortet gesammelt: „ok“ oder „Befund: <Bild>, <was>“.
3. **Am Gerät** nur, was ein Bild nicht zeigt: höchstens fünf neue Punkte je PR, als nächste
   Nummer `S-n` auf die Sichtliste im README.
4. **Befunde** ohne Nummer nach `docs/development/BEFUNDE.md` in deren Form (Bild als Quelle, Rolle
   im Bereich) — **keine echten Daten, keine Namen außer Seed**. Sie werden die erste Story der
   nächsten Überholung des Bereichs.
5. **Abschluss.** In `docs/development/fortschritt.json` die gesichteten Posten auf `gesichtet` mit
   `gesichtet_am`, dann `pnpm fortschritt --schreiben`; STATUS in drei Zeilen;
   `pnpm format:check && pnpm docs:check`, Commit, Push, PR.

## Sichtliste am Gerät (`/sichtung gerät`)

Claude stellt die offenen Punkte `S-n` aus `docs/sichtung/README.md` zusammen, je Punkt Ort
(Test-Umgebung oder lokal im WLAN), Konto und was zu tun ist; Jannes antwortet gesammelt. Ein
gesichteter Punkt fällt aus der Liste (Ergebnis in die PR), seine Nummer wird nicht neu vergeben;
Befunde wie oben. Es entstehen keine neuen Klickschritt-Dateien.
