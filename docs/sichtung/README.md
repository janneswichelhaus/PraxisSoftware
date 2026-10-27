# Sichtung

Jannes sichtet **Bilder, keine Klickanleitungen** (seit 2026-10-12): Jede PR mit Oberfläche bringt
eine **Bildstrecke** vorher/nachher bei 375 und 1280 px, erzeugt mit dem Cloud-Stack und
`pnpm bildstrecke` und von Claude selbst gegen `docs/design/DESIGN.md` geprüft. Jannes wischt sie in
etwa 10 Minuten durch, beantwortet höchstens 20 Punkte („ok“ oder „Befund: …“) und mergt. Aufruf:
`/sichtung`. Grundlage bleibt E-6 (Roadmap, Abweichungsregel 1): gesammelt statt Abnahme je Epic.

## Wann ein Loop gesichtet ist

- **Ohne Oberfläche:** grüne CI, `pnpm test:db` und, wo ADR-013 Punkt 9 Nr. 8 es verlangt,
  Zweitreview — ohne dass Jannes etwas ansieht.
- **Mit Oberfläche:** Bildstrecke in der PR, Design- und Praxis-Review (`.claude/agents/`) ohne
  Blocker, Jannes' Bildsichtung. Am Gerät nur, was ein Bild nicht zeigen kann (Sichtliste unten).

## Prüfliste je Seite

Die Oberflächen-Checkliste ist die **Prüfliste je Seite in `docs/design/DESIGN.md`** (Seitentyp,
375 px ohne Querrollen, Ziele ≥ 44 px, ein Hauptknopf, Bausteine, Zustände, Status als Zeichen und
Wort, Tokens). Was DESIGN.md nicht abdeckt, gilt weiter je Story:

1. Jedes Feld hat Label und Fehlertext (`aria-describedby`); `src/barrierefreiheit.test.tsx`
   prüft den maschinellen Teil mit axe.
2. Formulare mit mehr als einem Feld schützen ungespeicherte Eingaben — auch bei Zurück, Neuladen
   und Sitzungsverlust.
3. Fehlermeldungen sagen, was zu tun ist, ohne interne Details; keine Erfolgsmeldung, die nicht
   stattfand.
4. Tastatur: alles erreichbar, sinnvolle Reihenfolge, Fokus nach Dialog und Aktion gesetzt.
5. Wörter aus `src/lib/begriffe.ts`, ohne Fachjargon-Falle und Coaching-Begriffe; abgelöste Wörter
   hält `begriffe.test.ts` fern.
6. Kontakt ist Aktion: `tel:`, `mailto:`, Adresse kopierbar.
7. Je Kernablauf ein Test bei 375 px; das Budget steht in `docs/product/kernablaeufe.md`.

Die Review-Checkliste für kritische Änderungen ist etwas anderes: ADR-013 Punkt 9.

## Sichtliste am Gerät

Höchstens 20 Punkte, nur was eine Hand am Gerät braucht: Kamera, Passkey, Flugmodus, Sonne,
Halterung am Rad, echter Kartendienst. Gesichtet auf der Test-Umgebung (`https://prtest.uber.space`)
oder lokal im WLAN ([`../DEVELOPMENT.md`](../DEVELOPMENT.md)). Jede PR nennt höchstens fünf neue
Punkte; was durch Bild oder Test belegt ist, kommt nicht auf die Liste.

## Alte Sichtungsdateien und ihre Triage

Bis 2026-10-12 entstand je Block eine Datei mit Klickschritten; rund 170 Schritte sind offen. Sie
werden **nicht einzeln durchgeklickt**, sondern mit `/sichtung triage <Datei>` eingeordnet, je
Schritt genau eins:

- **durch Bild belegt** — die Route steht in einer aktuellen Bildstrecke, das Bild zeigt das
  Erwartete (Bildpfad nennen);
- **durch Test belegt** — ein E2E- oder Komponententest prüft genau das (Datei und Testname);
- **Gerät** — kommt auf die Sichtliste oben;
- **Bildstrecke** — noch nicht abgebildet: geht in die Bildstrecke der nächsten Überholung des
  Bereichs.

Eine Datei ist erledigt, wenn jeder Schritt eingeordnet ist; das Ergebnis steht am Ende der Datei,
der Stand hier. Neue Klickschritt-Dateien entstehen nicht mehr.

| Datei                                        | Etappe                              | Stand                                                                                                          |
| -------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [kernprozess.md](kernprozess.md)             | Etappen 0 und 1 — Kernprozess       | gesichtet 2026-09-28 (BEF-072 bis BEF-079)                                                                     |
| [leistungsbereiche.md](leistungsbereiche.md) | Etappe L — zwei Leistungsbereiche   | teilweise 2026-09-29 (1, 8–11); 2–7 warten auf Testdaten                                                       |
| [kartendienst.md](kartendienst.md)           | Etappe T — Kartendienst             | offen; seit MAP-006 auf der echten Tourenseite, Teil am Telefon wartet auf ein Gerät; 8, 9 und 13 UBK-EPIC-002 |
| [betriebsreife.md](betriebsreife.md)         | Etappe G — Betriebsreife            | offen                                                                                                          |
| [befund.md](befund.md)                       | Etappe 2 — Befund                   | offen; seit FRB-EPIC-001                                                                                       |
| [praxisverwaltung.md](praxisverwaltung.md)   | Etappe P — Praxisverwaltung         | 1–6 gesichtet 2026-09-28/29; 7–9 (UX-EPIC-004) offen                                                           |
| [training.md](training.md)                   | Block 3 — Trainingsbereich          | offen; seit TRN-EPIC-001, Schritte 4–6 TRN-EPIC-002, 7–9 TRN-EPIC-003                                          |
| [plattform.md](plattform.md)                 | Block 4 — Plattformzugang           | offen; 1–2 POR-EPIC-001, 3–4 -001b, 5–7 ABN-EPIC-001, 8–9 ABR-EPIC-007, 10–12 POR-EPIC-002, 13–15 POR-EPIC-003 |
| [angebote.md](angebote.md)                   | Block 5 — Angebote                  | offen; 1–3 ANG-EPIC-001                                                                                        |
| [plaene.md](plaene.md)                       | Block 6 — Pläne und Rückfragen      | offen; 1–2 UEB-EPIC-001, 3–4 -002, 5–7 -003, 8–10 KOM-EPIC-001, 11–13 -002, 14–15 -003                         |
| [verlauf.md](verlauf.md)                     | Block 7 — Verlauf und Alltag        | offen; 1–3 TRK-EPIC-001/-002, 4–6 TRK-EPIC-003, 7–9 OFF-EPIC-001, 10–12 OUT-EPIC-001, 13–15 ALT-EPIC-001       |
| [ui-redesign.md](ui-redesign.md)             | UI-Redesign Übersicht, Termin, Akte | offen; 1 bis 12 seit 2026-10-01/02, 3, 13 und 14 UBK-EPIC-001, 14 und 15 UBK-EPIC-002                          |
| [rahmen.md](rahmen.md)                       | Design-Runde 1 — Rahmen             | offen; 1 bis 3 RAH-EPIC-001, 4 bis 6 SLK-EPIC-001, 7 SKN-EPIC-001, 8 bis 10 KUT-EPIC-001, 11 DOK-EPIC-001      |
| [ux-review.md](ux-review.md)                 | UX-Review — UX-EPIC-007 bis -009    | offen; 1 bis 3 UX-EPIC-007                                                                                     |

Die Abnahmeschritte vor dem 2026-09-23 liegen unverändert in
`git show eb43569:docs/development/archiv/abnahme/`. Befunde aus jeder Sichtung gehen
nach [`../development/BEFUNDE.md`](../development/BEFUNDE.md) und werden die erste Story der
nächsten Überholung desselben Bereichs. Eine Sichtung ersetzt keinen Test
(`PROJECT_PRINCIPLES.md` §12).
