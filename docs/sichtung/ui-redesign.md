# Sichtung — UI-Redesign Übersicht, Termin, Patientenakte

Stand 2026-10-01 · Design-Handoff vom 2026-10-01
([`../design/handoff-2026-10-01-uebersicht-termin-akte.md`](../design/handoff-2026-10-01-uebersicht-termin-akte.md)),
gebaut in den Schritten 0 bis 6 des Auftrags, je Schritt eine Pull Request.

**Deckt ab:** UI-Redesign Schritt 1 (Tokens und Gerüst), Schritt 2 (Bausteine), Schritt 3
(Übersicht als Zeitstrahl), Schritt 4 (Termin). Die Schritte 5 und 6 ergänzen diese Datei.
**Wo:** lokal im WLAN am Handy, solange die Schritte nicht auf `main` liegen
([`../DEVELOPMENT.md`](../DEVELOPMENT.md), „Handytest im WLAN"); danach auf der Test-Umgebung.
**Dauer:** rund 15 Minuten.

Die Erwartung zur Übersicht in [Kernprozess](kernprozess.md) Schritt 10 („Liege heute: ja, ab

1. Besuch", „Erster Weg", „Weitere offene heute") beschreibt den Stand davor; für die Übersicht
   gilt diese Datei.

| #   | Rolle     | Tun                                                                                                                                                                                                                                             | Erwarten                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Loops                |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | therapist | Am Handy (~375 px) als Anna die **Übersicht** öffnen, dann **Patient:innen** und einen **Termin**.                                                                                                                                              | Kopfzeile flacher, neben der Marke der Bereichsname; „Konto" halbfett, „Abmelden" klein und grau. Seitentitel in einer Zeile. Abzeichen („Dokumentiert", „Abgesagt") größer und gut lesbar, Karten enger gepolstert. Nichts ragt seitlich heraus.                                                                                                                                                                                                                                      | Redesign Schritt 1   |
| 2   | therapist | Morgens vor dem ersten Besuch die **Übersicht** ansehen. Die **Stockwerk-Pille** antippen, dann den **i-Knopf** hinter der Anschrift; „Navigation starten" antippen und zurückkehren.                                                           | Im Kopf „0 von n Besuchen erledigt" mit Punkten. Darunter **Liege heute** mit „Ja · ab n. Besuch Uhrzeit" oder „Nein", dann der **Wegbalken** „Erster Weg" mit Puffer, „≈ … min Rad" und „Abfahrt spätestens". Im Zeitstrahl die Jetzt-Marke, der erste Besuch als Karte, die übrigen als Zeilen mit „Anfahrt ≈ …" und schmalem Balken darüber. Pille und i-Knopf klappen **Zugangshinweis** und **Besonderheit** auf und wieder zu. Kein Satz zu Google Maps, kein „Heute mitnehmen". | Redesign Schritt 2/3 |
| 3   | therapist | Während eines laufenden Termins die **Übersicht** öffnen; **Dokumentieren und abschließen**, einen synthetischen Satz schreiben, abschließen und zur Übersicht zurück. Danach den nächsten Termin abwarten lassen und am Tagesende noch einmal. | Die Karte heißt „Jetzt · bis …" und trägt als Hauptknopf **Dokumentieren und abschließen**, keine Navigation; der Wegbalken zeigt „Nächster Weg danach". Nach dem Abschluss ist der Punkt ein Häkchen, der Fortschritt zählt mit, die Karte zeigt den nächsten Besuch. Ist der Termin davor vorbei, zählt der Balken herunter bis „Zu spät, Abfahrt sofort". Am Tagesende steht in Tiefgrün **Alle Besuche erledigt** mit „Morgen im Kalender".                                        | Redesign Schritt 3   |
| 4   | owner     | Am Rechner im breiten Fenster die **Übersicht** öffnen, das Fenster schmaler ziehen und wieder breiter. Einen Eintrag im **Tagesplan des Teams** anklicken.                                                                                     | Breit steht der Tagesplan des Teams als Karte **rechts** neben dem eigenen Tag, offen, mit „✓ Dokumentiert", „! Nicht angetroffen", „× Abgesagt" ohne Pille; schmal rückt er **unter** den Tag. Die ganze Zeile führt in den Termin, „← Übersicht" wieder zurück. Darunter „Tagesroute auf der Karte" — die Karte lädt erst nach dem Aufklappen.                                                                                                                                       | Redesign Schritt 3   |
| 5   | therapist | Am Handy einen **kommenden Hausbesuch** öffnen. **Vor der Tür** aufklappen, dann **Niemand öffnet?**; abbrechen. Ganz unten **Termin absagen** öffnen und abbrechen.                                                                            | Über dem Namen klein „TERMIN“, der Name selbst ist der Titel und führt in die Akte. Zwei Kacheln nebeneinander: **Anschrift** mit „Navigation starten →“ als Link und dem Satz zur Übergabe, **Grundlage** mit „Termin n von m“. „Vor der Tür“ sagt schon zugeklappt „Lesen wird protokolliert“. Die Knöpfe stehen in der Karte **Nach dem Termin**; „Termin absagen“ steht leise am Seitenende, Grund und Eingang nebeneinander, sobald Platz ist.                                    | Redesign Schritt 4   |
| 6   | office    | Am Rechner im breiten Fenster einen Termin von Max öffnen, das Fenster schmaler ziehen. Danach einen **abgesagten** und einen **nicht angetroffenen** Termin öffnen.                                                                            | Breit steht **Abrechnung** (Rechnung an, offene Rechnungen) rechts neben dem Termin, schmal unter den Kacheln. Am abgesagten Termin eine Karte **Absage** mit Grund, Eingang und Ausfallhonorar; am nicht angetroffenen eine Karte **Vermerk** mit „Termin wieder öffnen“ darin. Ein Praxistermin zeigt in der Kachel **Standort** ein lesbares „Praxistermin“.                                                                                                                        | Redesign Schritt 4   |

**Zu bestätigen:** **ANN-195** (Puffer in echten Minuten, ohne Rundung auf das Raster), **ANN-196**
(der erste Weg beginnt „jetzt"; nach dem Ende des Termins davor zählt der Balken herunter),
**ANN-197** (Stockwerk vom Anfang des Zugangshinweises). **ANN-194** (die Übersicht ruft die Route
des Tages beim Öffnen ab) hat Jannes am 2026-10-01 entschieden; sie bleibt im Prüfpaket.

**Termin anders als im Handoff** (Schritt 4, Entscheidung Jannes 2026-10-01 und Bestand): kein
„Was ist passiert?" mit drei Zeilen und keine Kachel „Wann" — der Ablauf aus UX-EPIC-005 bleibt;
keine Karte „Angaben"/„Alle Angaben", weil sie den Kopf als Tabelle wiederholte; „Vor der Tür"
öffnet sich auch am Rechner nicht von selbst, denn jedes Öffnen ist ein protokolliertes Lesen
(ANN-137); die Grundlage bleibt neutral, die Akzentfläche trägt die Ausnahme Praxis- oder
Videotermin (ANN-192); der Kicker heißt „Termin" ohne „· Hausbesuch" (ANN-192).

**Bewusst nicht gebaut** (im Ideenspeicher): Wochentakt der Liege (`IDEA-PRX-051`),
Abschlussmeldung auf der Übersicht (`IDEA-PRX-052`), eigenes Feld für das Stockwerk
(`IDEA-PRX-050`).
