# Manuelle Abnahme

Hier stehen die **manuellen Prüfschritte je Feature** — die Klickwege, mit
denen Jannes ein fertiges Feature lokal abnimmt.

## Voraussetzung

Der lokale Stack muss laufen. Einrichtung in Schritt 1 bis 6 von
[`../DEVELOPMENT.md`](../DEVELOPMENT.md), Abschnitt „Lokale Abnahme".
Testkonten und Entwicklungskennwort stehen ebenfalls dort.

Die Abläufe hinter der Anmeldung brauchen Docker und den vollen
Supabase-Stack. In der Cloud-Entwicklungsumgebung sind sie **nicht**
durchführbar — dort greifen `pnpm test:db` und die Komponententests.

## Aufbau

Eine Datei je Etappe aus [`../development/ROADMAP.md`](../development/ROADMAP.md).
Innerhalb einer Datei eine Überschrift je Loop, benannt nach dessen Kennung.

| Datei                                                                  | Etappe                                      | Loops                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [etappe-0-patienten-und-termine.md](etappe-0-patienten-und-termine.md) | vor der Roadmap gebaut                      | PAT-002, PAT-003, CAL-001 bis CAL-006, STAFF-001                                                                                                                                                                                      |
| [etappe-1-kernprozess.md](etappe-1-kernprozess.md)                     | Etappe 1 — Der Kernprozess wird vollständig | DOK-001 bis DOK-004, PAT-005, VER-001 bis VER-003, UI-000, UX-001 bis UX-011, MARKE-001, LOE-001b, LOE-002b, CAL-EPIC-003a, CAL-010a, CAL-007, CAL-011 bis CAL-017, AKTE-000 bis AKTE-005, UX-012, UI-002, FIX-EPIC-003, ROL-EPIC-001 |
| [etappe-g-betriebsreife.md](etappe-g-betriebsreife.md)                 | Etappe G — Betriebsreife (Spur A3)          | STAFF-002, STAFF-003, STAFF-004, FIX-EPIC-001, DAT-001 bis DAT-003, FIX-015                                                                                                                                                           |

## Für Loops

Ein Feature-Loop mit Oberflächenanteil legt seine Prüfschritte **hier** ab,
nicht in `DEVELOPMENT.md`: in der Datei der laufenden Etappe, als neuer
Abschnitt mit der Loop-Kennung als Überschrift. Existiert die Etappendatei
noch nicht, wird sie angelegt und in der Tabelle oben ergänzt.

Ein Prüfschritt beschreibt, **was zu klicken und was zu erwarten ist** — nicht,
was der Code tut. Er ersetzt keinen Test: `PROJECT_PRINCIPLES.md` §12 und
`CLAUDE.md` verlangen eine objektive Verifikation, und eine Klickanleitung ist
keine. Sie ist die zusätzliche Prüfung durch einen Menschen.

## Oberflächen-Checkliste je Story

Für jede Story mit Oberflächenanteil, abgehakt in Schritt F des Loops.
Abweichungen werden im Bericht begründet und in
[`docs/development/BEFUNDE.md`](../development/BEFUNDE.md) als Befund
geführt (die Ablaufrunden nach `OPTIMIERUNG.md` ruhen bis Probewoche 1).
Diese Liste ist die Oberflächen-Checkliste — nicht die Review-Checkliste für
kritische Änderungen nach ADR-013 Punkt 8; die steht in ADR-013 Fassung 2,
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
10. Je Kernpfad ein Test bei 375 px; der Abnahmeschritt enthält einen Schritt
    am Handy und den Zielwert der Story als Zahl.
