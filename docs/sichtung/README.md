# Sichtung

Jannes sichtet **Bilder, keine Klickanleitungen** (seit 2026-10-12): Jede PR mit Oberfläche
bringt eine **Bildstrecke** vorher/nachher bei 375 und 1280 px (Cloud-Stack, `pnpm bildstrecke`),
von Claude selbst gegen `docs/design/DESIGN.md` geprüft. Jannes wischt sie in etwa 10 Minuten
durch, beantwortet höchstens 20 Punkte („ok“ oder „Befund: …“) und mergt; Aufruf `/sichtung`.
Grundlage bleibt E-6 (Roadmap, Abweichungsregel 1): gesammelt statt Abnahme je Epic.

**Gesichtet ist ein Loop** ohne Oberfläche mit grüner CI, `pnpm test:db` und, wo ADR-013 Punkt 9
Nr. 8 es verlangt, Zweitreview, ohne dass Jannes etwas ansieht; mit Oberfläche mit Bildstrecke in
der PR, Design- und Praxis-Review (`.claude/agents/`) ohne Blocker und Jannes' Bildsichtung.

## Prüfliste je Seite

Die Oberflächen-Checkliste ist die **Prüfliste je Seite in `docs/design/DESIGN.md`**; was sie nicht
abdeckt, gilt weiter je Story (die Review-Checkliste kritischer Änderungen ist ADR-013 Punkt 9):

1. Jedes Feld hat Label und Fehlertext (`aria-describedby`); axe in `src/barrierefreiheit.test.tsx`.
2. Formulare mit mehr als einem Feld schützen Ungespeichertes, auch bei Zurück, Neuladen,
   Sitzungsverlust.
3. Fehlermeldungen sagen, was zu tun ist, ohne interne Details; keine Erfolgsmeldung ohne Erfolg.
4. Tastatur: alles erreichbar, sinnvolle Reihenfolge, Fokus nach Dialog und Aktion gesetzt.
5. Wörter aus `src/lib/begriffe.ts`, ohne Fachjargon-Falle und Coaching-Begriffe; abgelöste Wörter
   hält `begriffe.test.ts` fern.
6. Kontakt ist Aktion: `tel:`, `mailto:`, Adresse kopierbar.
7. Je Kernablauf ein Test bei 375 px; das Budget steht in `docs/product/kernablaeufe.md`.

## Sichtliste am Gerät

Nur was eine Hand am Gerät braucht (Kamera, Passkey, Flugmodus, Sonne, Halterung am Rad, echter
Kartendienst), auf der Test-Umgebung (`https://prtest.uber.space`) oder lokal im WLAN
([`../DEVELOPMENT.md`](../DEVELOPMENT.md)). Höchstens 20 Punkte, je PR höchstens fünf neue; was
Bild oder Test belegt, kommt nicht dazu. Gesichtet fällt ein Punkt weg (Ergebnis in die PR);
Nummern werden nicht neu vergeben, die nächste ist S-15.

Offen ist kein Punkt: S-1 bis S-14 hat Jannes am 2026-11-05 ohne Befund gesichtet.

Die Klickschritte bis 2026-10-27 (14 Dateien) zeigt `git show 9452575:docs/sichtung/<datei>`, ihre
Triage die PR zu Aufräumen 5, Teil C. Befunde gehen nach
[`../development/BEFUNDE.md`](../development/BEFUNDE.md) und werden die erste Story der nächsten
Überholung des Bereichs. Eine Sichtung ersetzt keinen Test (`PROJECT_PRINCIPLES.md` §12).
