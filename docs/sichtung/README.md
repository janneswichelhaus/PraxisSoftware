# Sichtung

Jannes sieht sich an, was gebaut ist — **gesammelt je Block, am eigenen Handy**,
nicht als Abnahme je Epic (Entscheidung E-6 vom 2026-09-23, Roadmap,
„Abweichungsregeln" Regel 1). Eine Sichtung ist eine Datei mit **höchstens 15
Schritten**; Einzelheiten decken die Tests ab. Aufruf: `/sichtung <Datei>`.

## Wann ein Loop fertig ist

- **Ohne Oberfläche:** grüne CI, `pnpm test:db` und Zweitreview — dann ist er
  gesichtet, ohne dass Jannes etwas klickt.
- **Mit Oberfläche:** die Pull Request bringt Bildschirmfotos bei Desktop und
  375 px (`pnpm screenshots`, Punkt 1 unten); der Loop ergänzt die Sichtung
  seines Blocks um höchstens drei Schritte, ohne die Grenze von 15 zu
  überschreiten — sonst werden vorhandene Schritte zusammengelegt.

## Wo

Bis zur Test-Umgebung (OPS-002a, Block 1a) lokal nach
[`../DEVELOPMENT.md`](../DEVELOPMENT.md), „Lokale Sichtung", am Handy im WLAN
(„Handytest im WLAN"); danach auf der Test-Umgebung. Die Abläufe hinter der
Anmeldung laufen in der Cloud-Entwicklungsumgebung **nicht** — dort greifen
`pnpm test:db` und die Komponententests.

## Dateien

| Datei                                        | Etappe                            | Stand                                       |
| -------------------------------------------- | --------------------------------- | ------------------------------------------- |
| [kernprozess.md](kernprozess.md)             | Etappen 0 und 1 — Kernprozess     | offen (Rückstand seit CAL-EPIC-003b)        |
| [leistungsbereiche.md](leistungsbereiche.md) | Etappe L — zwei Leistungsbereiche | offen                                       |
| [kartendienst.md](kartendienst.md)           | Etappe T — Kartendienst           | offen; Teil am Telefon wartet auf ein Gerät |
| [betriebsreife.md](betriebsreife.md)         | Etappe G — Betriebsreife          | offen                                       |

Die früheren Einzelschritte je Loop liegen unverändert in
[`../development/archiv/abnahme/`](../development/archiv/abnahme/) — zum
Nachschlagen, nicht zum Durchgehen. Eine neue Datei entsteht mit dem ersten
Oberflächen-Loop eines Blocks und wird oben eingetragen.

Ein Schritt beschreibt, **was zu tippen und was zu erwarten ist** — nicht, was
der Code tut. Er ersetzt keinen Test (`PROJECT_PRINCIPLES.md` §12); er ist die
zusätzliche Prüfung durch einen Menschen. Das Ergebnis — Datum, Gerät,
Befunde — steht am Ende der Datei; Befunde gehen nach
[`../development/BEFUNDE.md`](../development/BEFUNDE.md) und werden die erste
Story des nächsten Loops derselben Etappe.

## Oberflächen-Checkliste je Story

Für jede Story mit Oberflächenanteil, abgehakt in Schritt F des Loops.
Abweichungen werden im Bericht begründet und in
[`docs/development/BEFUNDE.md`](../development/BEFUNDE.md) als Befund
geführt (die Ablaufrunden nach `OPTIMIERUNG.md` ruhen bis Probewoche 1).
Diese Liste ist die Oberflächen-Checkliste — nicht die Review-Checkliste für
kritische Änderungen nach ADR-013 Punkt 8; die steht in ADR-013
Punkt 9, und gehört zum Compliance-Gate A4 des
[Graph-Engineering-Workflows](../development/GRAPH-ENGINEERING-WORKFLOW.md).
Ein Sandbox-Prototyp (Pfad S) hakt diese Oberflächen-Checkliste ebenfalls ab.

1. Bei 375 px vollständig bedienbar: kein horizontales Scrollen, Tippziele
   mindestens 44 px, Primäraktion einhändig erreichbar. Für das Scrollen und
   für Konsolenfehler gibt es seit UI-000 ein Werkzeug — es ersetzt den Blick
   nicht, aber es findet, was man beim Hinsehen übersieht:

   ```bash
   pnpm dev                                              # in einem zweiten Terminal
   pnpm screenshots --konto=therapist /patienten /kalender  # Bilder in .tmp/screenshots/
   pnpm screenshots --breite=1024 --konto=therapist /patienten
   ```

   `--konto` (`owner`, `office` oder `therapist`) meldet sich über die echte
   Anmeldemaske am synthetischen Stack an; ohne den Parameter zeigen Seiten
   hinter der Anmeldung nur die Anmeldemaske. Das Werkzeug meldet eine
   fehlgeschlagene Anmeldung, eine unerwartete Zielseite, waagerechtes
   Scrollen und Konsolenfehler.

2. Nur Bausteine aus `src/components/ui` und Tokens aus `src/index.css`;
   fehlt ein Baustein, entsteht er dort — nur für Module, die der Auftrag
   berührt. Vorhanden sind: `Button`, `ButtonLink`, `Field`, `Select`,
   `TextArea`, `SearchField`, `SearchCombobox`, `Section`/`Feldgruppe`,
   `DetailList`/`DetailRow`,
   `Card`/`CardGrid`/`DataRow`/`DataList`/`Disclosure`, `Badge`, `RoleBadge`,
   `PageHeader`, `SubNav`, `Rueckfrage`, `Statusmeldung` und die Zustände aus
   `Feedback.tsx`. Für mehrere Aktionen nebeneinander in einer Karte gibt es
   `kartenAktionKlassen` aus `buttonStile.ts` — kleiner in Schrift und
   Polsterung, unverändert 44 px hoch. `SearchField` filtert eine Liste, die
   schon auf der Seite steht; `SearchCombobox` holt Treffer und führt woanders
   hin (Tastatur, `aria-activedescendant`, Zustand als Text). Die
   Kontrastwerte der Tokens hält `src/lib/kontrast.test.ts` auf WCAG AA fest.
3. Jedes Feld hat Label und Fehlertext, verbunden über `aria-describedby`;
   Laden, Leer und Fehler laufen über `Feedback.tsx`, kurze Meldungen daneben
   über `Statusmeldung`. Den maschinell prüfbaren Teil davon deckt seit UI-000
   `src/barrierefreiheit.test.tsx` mit `axe-core` ab; er läuft in `pnpm test`.
   Tastaturreihenfolge, Fokusführung und Sprache prüft er **nicht** — dafür
   sind die Punkte 7 und 9 da.
4. Farbe ist nie allein Bedeutungsträger; der Zustand steht als Text.
5. Formulare mit mehr als einem Feld schützen ungespeicherte Eingaben — auch
   bei Zurück, Neuladen und Sitzungsverlust.
6. Die Fehlermeldung sagt, was zu tun ist, ohne interne Details; keine
   Erfolgsmeldung, die nicht stattfand.
7. Tastatur: alles erreichbar, sinnvolle Reihenfolge, Fokus nach Dialog und
   Aktion gesetzt.
8. Kontakt ist Aktion, nicht Text: `tel:`, `mailto:`, Adresse kopierbar.
9. Wörter ohne Fachjargon-Falle und ohne Coaching-Begriffe (`IDEA-QSN-007`);
   gleiche Sache, gleiches Wort.
10. Je Kernpfad ein Test bei 375 px; ergänzt der Loop die Sichtung, ist der
    Schritt am Handy und nennt den Zielwert der Story als Zahl.
