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

| Datei                                                                  | Etappe                 | Loops                                 |
| ---------------------------------------------------------------------- | ---------------------- | ------------------------------------- |
| [etappe-0-patienten-und-termine.md](etappe-0-patienten-und-termine.md) | vor der Roadmap gebaut | PAT-002, PAT-003, CAL-001 bis CAL-006 |

## Für Loops

Ein Feature-Loop mit Oberflächenanteil legt seine Prüfschritte **hier** ab,
nicht in `DEVELOPMENT.md`: in der Datei der laufenden Etappe, als neuer
Abschnitt mit der Loop-Kennung als Überschrift. Existiert die Etappendatei
noch nicht, wird sie angelegt und in der Tabelle oben ergänzt.

Ein Prüfschritt beschreibt, **was zu klicken und was zu erwarten ist** — nicht,
was der Code tut. Er ersetzt keinen Test: `PROJECT_PRINCIPLES.md` §12 und
`CLAUDE.md` verlangen eine objektive Verifikation, und eine Klickanleitung ist
keine. Sie ist die zusätzliche Prüfung durch einen Menschen.
