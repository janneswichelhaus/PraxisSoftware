# VER-EPIC-002 — Verordnung im Office-Alltag

Stand 2026-09-13 · **Loop-Vorgabe**: Eingabe für den SPEC-Schritt des Loops,
kein eigener Rang · Umsetzung noch nicht begonnen

Quelle sind Jannes' Korrekturen an „Verordnung bearbeiten" vom 2026-09-13
(Planentwurf aus PR #37, am selben Tag auf `main` übernommen). Die
fachlichen Vorgaben unten stammen von ihm; die Einordnung als eigener Loop
und die Reihenfolge stehen in [ROADMAP.md](ROADMAP.md). Dieses Dokument
ersetzt keinen Schritt des [Feature-Loops](GRAPH-ENGINEERING-WORKFLOW.md).

## Ziel und Feldvorgaben

Das Office kann eine Verordnung im laufenden Arbeitsalltag mit wenigen
klaren Eingaben erfassen. Dieselben Angaben sind anschließend für alle
internen Praxisrollen sichtbar.

| Bereich | Ziel |
| --- | --- |
| Heilmittel | Vordefinierte Auswahl mit beschrifteten Kästchen, kein Dropdown und keine freie Positionsliste. KG und MT müssen jeweils als Doppelbehandlung abbildbar sein; Hausbesuch ist separat auswählbar. Die Kombination **KG Doppelbehandlung + MT Doppelbehandlung + Hausbesuch** muss vollständig möglich sein. |
| Anzahl | Ein klar benanntes Feld **„Anzahl möglicher Termine"**. „Genutzt" entfällt als manuelle Eingabe. |
| Positionen | „Position hinzufügen" entfällt. Fachliche Positionen dürfen intern weiterbestehen, soweit sie für Mengen und spätere Leistungen gebraucht werden. |
| Diagnose | Bleibt in der Verordnung. |
| Therapieziel | Entfällt aus diesem Formular. |
| Hinweis der Verordner:in | Wird zu **„Anmerkungen"**. |
| Bemerkungen | Entfällt als zweites Eingabefeld. Es gibt ein gemeinsames Feld „Anmerkungen". |
| Empfehlung der Therapeut:innen | Keine zusätzliche manuelle Eingabe. Nur anzeigen, wenn eine bereits dokumentierte Empfehlung zuverlässig übernommen werden kann, mit erkennbarer Quelle und Datum. |

„Vordefiniert" bedeutet, dass die Auswahlmöglichkeiten bereitstehen.
Die Wunschkombination wird nicht ungefragt für jede Verordnung angehakt.
Die tatsächliche Verordnung entscheidet über die Auswahl. Der Mindestumfang
ist KG, MT, die jeweiligen Doppelbehandlungen und Hausbesuch; im SPEC werden
vorhandene Katalog- und Bestandswerte geprüft, damit benötigte Varianten
nicht verschwinden. Eine freie Katalogverwaltung oder Preisgestaltung
gehört nicht zu diesem Loop.

Im Formular steht die Heilmittelauswahl zusammen mit der Terminzahl oben;
Diagnose und Anmerkungen folgen. Beschriftungen sind vollständig anklickbar,
die Auswahl per Tastatur bedienbar und der gewählte Zustand eindeutig.
Der bestehende Gestaltungskanon gilt.

## Mengen und Bestand erhalten

- Die Terminzahl zählt Behandlungstermine, keine Summe von Heilmitteln.
  **Abnahmebeispiel:** Eine Verordnung mit sechs möglichen Terminen und
  KG Doppelbehandlung, MT Doppelbehandlung sowie Hausbesuch bietet sechs
  Termine. Die Kombination erzeugt weder zwölf noch mehr Termine.
  Das Beispiel beschreibt das Softwareverhalten, keine Abrechnungsvorschrift.
- Leistungsmenge, Doppelbehandlung und Terminzahl bleiben fachlich
  unterscheidbar. Im SPEC wird ihre Abbildung für Neuanlage, bestehende
  Verordnungen, Einzeltermine und Serien festgehalten. Es wird keine
  unbekannte Mengen- oder Preisregel für spätere Rechnungen erfunden.
- Vorhandene genutzte Mengen, Positionen, Therapiezieltexte und Empfehlungen
  werden durch das vereinfachte Formular weder gelöscht noch auf null gesetzt.
  Nicht eindeutig übertragbare Bestandswerte bleiben erkennbar und dürfen
  beim Öffnen und Speichern nicht still umgedeutet werden.
- Enthält ein Datensatz sowohl Verordnerhinweis als auch Bemerkungen, bleiben
  beide Texte samt Herkunft erhalten. Die Überführung in „Anmerkungen"
  überschreibt keinen Text; erneutes Speichern vervielfacht ihn nicht.
- Kalender, Serienprüfung, Aktenübersicht und Verordnungsstatus verwenden die
  Terminzahl konsistent. Eine geplante, abgesagte oder als „nicht angetroffen"
  markierte Behandlung darf dadurch keine verbrauchte Leistung werden.
  Die Abgrenzung zwischen kurzfristiger Patientenabsage und Nichtantreffen
  (CAL-014, ADR-018 Fassung 3) bleibt erhalten.

## Sichtbarkeit

„Alle Rollen" heißt hier **owner, therapist, team_lead und office**
innerhalb derselben Praxis und der bestehenden Patienten-Zugriffsgrenzen.
Die Verordnungsangaben einschließlich Diagnose und Anmerkungen werden allen
diesen Rollen angezeigt. Das Office muss die für seinen Erfassungsablauf
vorgesehenen Felder auch bearbeiten können; daraus entstehen keine
zusätzlichen Verwaltungsrechte für andere Bereiche.

Der Rollenschnitt dafür ist seit dem 2026-09-13 entschieden (**E15**,
`PROJECT_PRINCIPLES.md` 0.10 §4.3, ADR-004 Fassung 2): Office liest alle
klinischen Inhalte im selben Umfang wie Therapeut:innen. Umgesetzt wird er in
**ROL-EPIC-001**, das vor diesem Loop läuft; dieser Loop setzt darauf auf und
öffnet keine Sicht selbst. API-Projektionen und Datenbankregeln müssen
dieselbe Feldentscheidung durchsetzen; ausschließliches Einblenden im Browser
reicht nicht (§4.7).

Fremde Praxis und Portalzugang erhalten aus diesem Loop keine Rechte.
Eine übernommene Empfehlung darf nur die bereits verfasste Angabe zeigen,
keine neu erzeugte medizinische Empfehlung oder vollständige Dokumentation.
Im INSPECT wird geprüft, ob eine geeignete Quelle existiert. Ist sie
vorhanden, gehört ihre Anzeige einschließlich Quellen- und Zugriffsprüfung
in diesen Loop. Fehlt sie, entfällt die manuelle Eingabe trotzdem; der
Abschlussbericht hält die noch fehlende Dokumentationsanbindung mit
konkreter Wiedervorlage im bestehenden Plan oder Ideenspeicher fest.

## Loop und Nachführung

Ein eigener `/feature-loop`-Aufruf; Reihenfolge nach `ROADMAP.md`, Etappe 1.
Der SPEC prüft ANN-012, ANN-014, ANN-038 und ANN-042 und schreibt sie fort.
Die Oberfläche wird angemeldet auf Telefon, Tablet und Desktop geprüft.
VER-EPIC-001 bleibt abgenommen; VER-EPIC-002 wird eigens abgenommen.

## Sechs Abnahmefälle

1. Als Office eine neue Verordnung mit der Wunschkombination und sechs
   möglichen Terminen anlegen. Kein Heilmittel-Dropdown, kein „Genutzt",
   kein „Position hinzufügen"; die Auswahl bleibt nach erneutem Öffnen erhalten.
2. Eine Auswahl ändern und ohne Hausbesuch speichern. Die Terminzahl bleibt
   korrekt; Doppelbehandlung und Hausbesuch erzeugen keine zusätzlichen
   Termine. Einzeltermin, Serie und Aktenübersicht stimmen überein.
3. Diagnose und Anmerkungen eintragen und in allen vier Praxisrollen
   aufrufen. Fremde Praxis und Portalzugang erhalten daraus keine neuen
   Rechte; Bearbeitungsrechte werden getrennt nach der festgelegten Matrix
   geprüft.
4. Eine Bestandsverordnung mit genutzten Mengen, zwei unterschiedlichen
   Hinweistexten und alten klinischen Angaben öffnen und speichern.
   Kein Mengenverlust, kein verlorener oder doppelt eingefügter Text,
   keine unbemerkte Umdeutung unbekannter Heilmittel.
5. Eine vorhandene dokumentierte Empfehlung zeigt ihre Quelle; ohne
   geeignete Empfehlung erscheint keine erfundene Angabe und kein
   zusätzliches manuelles Pflichtfeld.
6. Den vollständigen Office-Ablauf angemeldet bei etwa 375 px, auf Tablet
   und Desktop ausführen, einschließlich Tastaturbedienung,
   Validierungsfehlern, fehlgeschlagenem Speichern und sicherem Rückweg.
