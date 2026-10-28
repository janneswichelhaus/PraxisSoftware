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
Nummern werden nicht neu vergeben, die nächste ist S-14.

- **S-1 Echter Kartendienst** (PTV lokal oder nach `docs/betrieb/test-umgebung.md` Abschnitt 5,
  Schlüssel nie im Repository): Route auf Straßen im Lastenradprofil, Fahrzeiten und Rundung,
  Geocoding auf die Hausnummer, Lückenfinder.
- **S-2 Fahrzeitfaktor 1,5** auf den eigenen Wegen (ANN-237): stimmen Tour, Übersicht, Kalender?
- **S-3 Navigation am Telefon:** Google Maps, Systemnavigation und Apple Maps im Radmodus mit
  Koordinatenziel; „Ganzer Tag“ (`MAX_ZWISCHENZIELE`); Karte mit einem Finger. Danach BEF-140.
- **S-4 Passkey und PIN** am eigenen Gerät, Anmeldung am Rechner über das Telefon; Plattform:
  Einladungscode scannen, Passkey und PIN einrichten.
- **S-5 Sitzungssperre** nach 30 Minuten: Passkey entsperrt, der Entwurf steht; ohne Netz die PIN.
- **S-6 Kamera:** Doku- und Verordnungsfoto; Licht aus, nichts in der Mediathek, Rezept lesbar.
- **S-7 PDF im Rahmen am iPhone:** alle Seiten sichtbar.
- **S-8 Größte Systemschrift** mit „Sehr groß“ auf der Plattform: nichts läuft seitlich über.
- **S-9 Plattform im Flugmodus:** Haken bleiben auf dem Gerät, Neustart mit Passkey, Übertragung
  genau einmal, nach einem Kontowechsel nichts Fremdes.
- **S-10 Video in Safari am iPhone** an einer Rückfrage (MP4; Wiedervorlage ANN-336).
- **S-11 Web-Push am Android-Telefon** (gebauter Stand): erlauben, ankommen ohne Inhalt, nach dem
  Abmelden ausgetragen; Start ohne Netz mit eigener Seite.
- **S-12 Diensttelefon ohne Empfang:** einschalten, Flugmodus, Entwurf, Übertragung genau einmal,
  Konflikt mit vorhandenem Entwurf, Abmelden mit Ungesendetem.
- **S-13 Sonne:** weißer Grund, Kartenlinie, Wegspur und Schraffur draußen lesbar (L4, L5).

Die Klickschritte bis 2026-10-27 (14 Dateien) zeigt `git show 9452575:docs/sichtung/<datei>`, ihre
Triage die PR zu Aufräumen 5, Teil C. Befunde gehen nach
[`../development/BEFUNDE.md`](../development/BEFUNDE.md) und werden die erste Story der nächsten
Überholung des Bereichs. Eine Sichtung ersetzt keinen Test (`PROJECT_PRINCIPLES.md` §12).
