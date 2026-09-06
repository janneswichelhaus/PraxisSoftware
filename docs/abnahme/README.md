# Manuelle Abnahme

Hier stehen die **manuellen Prüfschritte je Feature** — die Klickwege, mit
denen Jannes ein fertiges Feature lokal abnimmt.

Sie lagen früher in `docs/DEVELOPMENT.md`. Dort wuchsen sie linear mit jedem
Loop: neun Features ergaben bereits rund 190 Zeilen in einer Datei, die
gleichzeitig Einrichtung, Testkonten, Go-live-Blocker und bekannte
Einschränkungen trägt und deshalb oft vollständig gelesen wird. Getrennt bleibt
beides klein: `DEVELOPMENT.md` beschreibt die Umgebung, dieser Ordner die
Abnahme.

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

| Datei                                                                  | Etappe                                      | Loops                                            |
| ---------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| [etappe-0-patienten-und-termine.md](etappe-0-patienten-und-termine.md) | vor der Roadmap gebaut                      | PAT-002, PAT-003, CAL-001 bis CAL-006, STAFF-001 |
| [etappe-1-kernprozess.md](etappe-1-kernprozess.md)                     | Etappe 1 — Der Kernprozess wird vollständig | DOK-001 bis DOK-004                              |

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
Abweichungen werden im Bericht begründet und in der nächsten Ablaufrunde
(`docs/development/OPTIMIERUNG.md`) als Befund geführt.

1. Bei 375 px vollständig bedienbar: kein horizontales Scrollen, Tippziele
   mindestens 44 px, Primäraktion einhändig erreichbar.
2. Nur Bausteine aus `src/components/ui` und Tokens aus `src/index.css`;
   fehlt ein Baustein, entsteht er dort — nur für Module, die der Auftrag
   berührt.
3. Jedes Feld hat Label und Fehlertext, verbunden über `aria-describedby`;
   Laden, Leer und Fehler laufen über `Feedback.tsx`.
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
