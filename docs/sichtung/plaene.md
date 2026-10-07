# Sichtung — Block 6: Pläne und Rückfragen

Stand 2026-10-07 · entsteht mit dem ersten Oberflächen-Loop des Blocks (UEB-EPIC-001).

**Deckt ab:** UEB-EPIC-001 (Schritte 1 bis 3).
**Wo:** lokal mit `pnpm dlx supabase@2.116.0 start`, am Handy im WLAN ([`../DEVELOPMENT.md`](../DEVELOPMENT.md)), oder auf der Test-Umgebung nach dem Merge. Konten: `DEVELOPMENT.md`, „Testkonten“. Die Bibliothek im Seed hat neun erfundene Übungen, eine davon archiviert.
**Dauer:** rund 25 Minuten.

| #   | Rolle                | Tun                                                                                                                                                                                                                                                                                                                                  | Erwarten                                                                                                                                                                                                                                                                                                                                                                                                  | Loops        |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | Therapeutin, Trainer | Am Handy als Anna: **Organisatorisches → Übungen**, in **Suche** „hocke“ tippen, dann **Filter** aufklappen und **Ausrüstung: Stuhl** wählen. **Kniebeuge** öffnen, bei „Kniebeuge freistehend, volle Tiefe“ unter **Schwerer** den Ausfallschritt antippen. Dann als Tom: **Training → Übungen**. Als Olivia nach „Übungen“ suchen. | Ziel: eine Übung in unter 20 Sekunden gefunden. Die Liste nach Bezeichnung, je Zeile Alltagssprache, Region und Zahl der Varianten; „Gefunden in: …“ nennt die Variante. Der Sprung landet auf der Karte des Ausfallschritts. Anna und Tom sehen keinen Knopf zum Ändern (ANN-293); Tom findet die Übungen im Training, Olivia nirgends. Nirgends steht „empfohlen“ oder „passend zu“ (ADR-006 Punkt 10). | UEB-EPIC-001 |
| 2   | owner                | Am Rechner als Jannes: **Übung anlegen** mit „Seitstütz“, „Seitlich auf den Unterarm stützen“, Region Rumpf. In der Übung **Variante anlegen** zweimal (auf den Knien, auf den Füßen), bei der ersten Kurzanleitung und „Matte, matte“ als Ausrüstung. Mitten in der zweiten auf **Übungen** tippen.                                 | Beide Bezeichnungen sind Pflicht, die Region auch. Die Ausrüstung steht danach einmal als „Matte“ (ANN-295). Beim Wegtippen mit Ungespeichertem kommt die Rückfrage, „Hier bleiben“ behält die Eingaben. Unter **Ansicht in Alltagssprache** steht nur, was eine Person liest – ohne Ausweichbewegungen und Hinweise für die Praxis (IDEA-QSN-002).                                                       | UEB-EPIC-001 |
| 3   | owner                | Bei „Seitstütz auf den Knien“ **Verbinden**: die andere ist **schwerer**, „Seitstütz auf den Füßen“, Achse **Hebel**. Danach bei der schwereren **Verbinden** öffnen und die Liste ansehen. Die leichtere **Löschen**, dann die Verbindung **Lösen** und erneut löschen; am Ende die Übung **archivieren**.                          | Unter **Schwerer** „… · Achse: Hebel“, an der anderen Karte dieselbe Verbindung unter **Leichter**. Die schon verbundene steht dort nicht zur Wahl – je Paar eine Verbindung (ANN-294); Kreise weist der Server ab (Test). Löschen geht erst nach dem Lösen (ANN-296). Archiviert steht die Übung unter **Archiviert** in der Liste.                                                                      | UEB-EPIC-001 |

## Nicht in dieser Sichtung

- **Regeln und Rechte ohne Oberfläche**: nur owner pflegt, Büro und jedes Plattformkonto lesen
  nichts, andere Organisation, kein Tabellenrecht, Pflichtfelder, doppelte Bezeichnungen, Grenzen
  der Ausrüstung, Archivieren, Löschen nur ohne Abhängige, Körperregionen gleich in Datenbank und
  Oberfläche (`exercise-library.test.ts`); Achsen, je Paar eine Verbindung, kein Kreis, keine
  archivierte Variante, fremde Varianten, Seed (`exercise-variant-links.test.ts`); jede neue
  Funktion in `plattform-abschottung.test.ts`; 375 px, Ziele und axe (`tests/e2e/uebungen.spec.ts`).

## Befunde

Noch keine.
