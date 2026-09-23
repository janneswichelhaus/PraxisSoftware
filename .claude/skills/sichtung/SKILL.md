---
name: sichtung
description: Jannes geht eine Sichtung aus docs/sichtung/ durch; Claude führt Schritt für Schritt, trägt Befunde nach BEFUNDE.md und das Ergebnis ein. Nichts bauen. Nur auf ausdrücklichen Aufruf mit /sichtung oder /sichtung <Datei>.
disable-model-invocation: true
---

# Sichtung

Gesammelte Durchsicht je Block am Handy statt Abnahme je Epic (E-6; Roadmap,
Abweichungsregel 1). Regeln und Dateien: `docs/sichtung/README.md`.

1. **Datei wählen.** `/sichtung <Datei>` nimmt die genannte; ohne Angabe die
   erste mit Stand „offen" aus der Tabelle in `docs/sichtung/README.md`.
   Nur diese Datei und das README lesen.
2. **Vorbereiten.** Umgebung nennen (lokal im WLAN nach `docs/DEVELOPMENT.md`,
   „Handytest im WLAN", oder die Test-Umgebung), Konten, die Vorbereitungszeile
   der Datei. In der Cloud-Session kann Claude die Schritte hinter der
   Anmeldung nicht selbst ausführen — Jannes klickt, Claude führt.
3. **Führen.** Schritt für Schritt: Tun und Erwarten in einem Satz, dann auf
   Jannes' Antwort warten („ok", „Befund: …", Bildschirmfoto). Nicht mehrere
   Schritte auf einmal abfragen, es sei denn, Jannes will es so.
4. **Befunde.** Jede Abweichung als `BEF-NNN` nach `docs/development/BEFUNDE.md`
   (nächste freie Nummer, Bereich, Rolle, Schritt der Sichtung, erwartete und
   beobachtete Wirkung) — **keine echten Daten, keine Namen außer Seed**.
   Nicht beheben: Ein Befund wird die erste Story des nächsten Loops derselben
   Etappe.
5. **Abschluss.** In der Datei unter „Ergebnis" Datum, Gerät und die
   Befundnummern eintragen; im README den Stand auf „gesichtet <Datum>" (oder
   „teilweise, Schritte …") setzen. In `docs/development/fortschritt.json` die
   Posten der abgedeckten Loops auf `gesichtet` mit `gesichtet_am`, dann
   `pnpm fortschritt --schreiben`; `docs/STATUS.md` nachziehen.
6. `pnpm format:check && pnpm docs:check`, Commit, Push, Pull Request.
   **Nichts bauen.**
