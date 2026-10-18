# Referenz: Slack — Funktionsmatrix für den Teamchat

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Auftrag Jannes 2026-10-18 („Teamchat zu einem möglichst umfassenden Slack-Nachbau“). Übernommen
werden **Informationsarchitektur, Abläufe und Schrittzahlen**, nie Texte, Bilder, Symbole oder
Benennungen; gestaltet wird nach `docs/design/DESIGN.md`. Verbindlich ist die Spec in der PR der
Überholung (Rang 3); diese Matrix ordnet nur.

**Belege.** Drei Recherche-Agenten, nur offizielle Slack-Seiten (`slack.com/help`, `api.slack.com`,
`docs.slack.dev`). Die Umgebung sperrt `slack.com`; gelesen wurden Suchauszüge dieser Seiten, nicht
die Seiten selbst. Ein Prüfer hat drei Aussagen nachgeprüft (**N**: Stumm zeigt Erwähnungen weiter;
Thread-Benachrichtigung bei Begonnenem, Beantwortetem, Erwähnung, in 1:1-DMs alle; Threads-Ansicht
mit Ungelesenem oben), danach war das Suchbudget erschöpft. Alles andere steht als **S**
(Suchauszug, nicht nachgeprüft); die Spec stützt nichts Sicherheitsrelevantes darauf.

## Matrix

vorher = TEAM-001 (#268), jetzt = TEAM-002. „Regel“ nennt die Quelle eines Ausschlusses und die
Entscheidung, die ihn aufheben würde.

| Funktion | Slack | vorher | jetzt | Regel, Entscheidung |
| --- | --- | --- | --- | --- |
| Offene Kanäle | alle finden und treten bei (S) | ja, alle lesen alle | + umbenennen, Beschreibung, Mitglieder, Favorit | Beitreten entfällt: 3–8 Personen lesen alle Kanäle |
| Private Kanäle | nur per Einladung (S) | nein (ANN-611) | ja: nur Mitglieder, auch owner nicht; holen, herausnehmen, verlassen | Umwandeln privat→offen nie (Verlauf würde offen) |
| Direktnachricht | 1:1 (S) | ja | + Thread folgt beiden | Notizen an sich selbst: nein, „Für später“ deckt es |
| Gruppennachricht | bis 9 Personen (S) | nein | ja, 3–9 | Umwandeln in privaten Kanal: nein (neuer Kanal) |
| Threads | folgen bei Beginn, Antwort, Erwähnung (N) | ja, folgen implizit | eigener Lesestand je Thread, folgen/entfolgen, Threadspalte | – |
| Auch im Kanal | Häkchen beim Antworten (S) | nein | ja | – |
| Erwähnung @Person | ja, getipptes @ öffnet Namen (S) | ja, über @ | + getipptes @ grenzt ein, @alle in Kanälen | @hier braucht Präsenz → nein (§20) |
| Benutzergruppen | bezahlt (S) | nein | nein | ADR-014: bei 3–8 Personen ohne Bedarf; ein Auftrag reicht |
| Reaktionen | Emoji, wer sichtbar (S) | nein (ANN-614) | 8 feste, wer sichtbar, ohne Zeitpunkt | freie Emoji nein (ANN-644) |
| Formatierung | Leiste oder Markup (S) | Klartext | fett, kursiv, durchgestrichen, Code, Zitat, Listen, Links | – |
| Bearbeiten, Löschen | endgültig, Marke (S) | ja | + ↑ bearbeitet die letzte | Verlauf früherer Fassungen nie (ANN-609, ADR-010) |
| Entwürfe | automatisch, Ansicht (S) | je Gespräch im Speicher, nicht kontogebunden | je Konto und Gespräch, Ansicht „Entwürfe“, beim Abmelden fort | geräteübergreifend nein (ANN-612, §15.1 datensparsam) |
| Später senden | planen, ändern, abbrechen (S) | nein | ja, 1 min bis 30 Tage | – |
| Ungelesen | fett, Zahl bei DM/Erwähnung, Linie (S) | teils | „n neu“ auch an Kanälen (DESIGN.md Regel 5 statt nur fett), gelesen bis Gezeigtes, ab hier ungelesen, Sprung | Lesebestätigung nie (ANN-609, ADR-024 P. 12) |
| Ungelesen-Sammelansicht | „Aufholen“ (S) | nein | nein | ADR-014; Liste mit Ungelesenem oben und „Alle gelesen“ genügt |
| Suche | Operatoren in/from/during (S) | Wort, 30 Treffer | + Gespräch, Person nur mit Wort, Zeitraum; Treffer an der Stelle, zurück in die Treffer | Person ohne Wort nein (§20, ANN-651); Dateien-Suche entfällt mit den Dateien |
| Für später, Erinnerung | privat, Erinnerung (S) | nein (ANN-614) | ja, Erinnerung in der App | Push nein (ADR-024 P. 12) |
| Anheften | 100 je Kanal (S) | nein | ja, 50 | – |
| Lesezeichen/Reiter | je Gespräch (S) | nein | nein | ADR-014; Anheften und Beschreibung genügen |
| Abschnitte, Favoriten | eigene Abschnitte bezahlt, Stern (S) | nein | Favoriten oben | eigene Abschnitte nein (ADR-014) |
| Stummschalten, Stufen | alle/Erwähnungen/stumm (N) | nein | ja, je Gespräch | – |
| Benachrichtigung | Push, Mail, Nicht stören (S) | Liste in der App | Zähler am Bereich, „Für dich“, Erinnerungen | **Push/Mail an Beschäftigte: ADR-024 Punkt 12 (W4) schließt aus** – Entscheidung Jannes nötig |
| Aktivität | Erwähnungen, Threads, Reaktionen (S) | Erwähnungen, Antworten | + Erinnerungen | Reaktionen nicht (ANN-644, §20) |
| Präsenz, Tippen, „gesehen“ | automatisch (S) | nein | nein | §20, ANN-609 – bewusst nie |
| Dateien, Anhänge | hochladen, Vorschau (S) | nein | **nein** | **Konflikt: §10 nennt „Anhängen“ (Rang 1); ADR-017 Punkte 30/42 geben Teamchat-Anhänge nicht frei** – Entscheidung Jannes: ADR-017 um einen Abschnitt ergänzen |
| Huddles | Audio/Video live (S) | nein | nein | neuer Anbieter für Medien (ADR-002), Beschäftigtendaten (§20) – eigener ADR nötig |
| Clips | Sprach-/Videonachricht (S) | nein | nein | Audio/Video nicht freigegeben (ADR-017 P. 42), Stimme im Hintergrund – Entscheidung mit Dateien |
| Canvas | Dokument im Kanal (S) | nein | nein | Kanalbeschreibung und Angeheftetes genügen; ein Dokument neben der Akte (ADR-016) – nur auf Auftrag |
| Listen | Aufgaben mit Feldern (S) | nein | „Als Aufgabe“ in die Offenen Punkte | §10: Dauerhaftes in den Fachprozess; Listen doppeln die Aufgaben |
| Workflows | Auslöser, Formulare (S) | nein | nein | ADR-014; Formulare und Webhooks wären externe Datenflüsse (ADR-002) |
| Apps | Drittdienste (S) | nein | nein | jeder Drittdienst ist ein neuer Anbieter (ADR-002) |
| KI | Zusammenfassen, Recaps, Suche (S) | nein | nein | ADR-005 (Gateway, kein Produktionsanbieter), §20 (verdichtet Verhalten), Patientendaten im Chat – Entscheidung mit DSFA |
| Status | Text, abwesend automatisch (S) | nein | nein | automatische Abwesenheit nie (§20); ein Status von Hand nur auf Auftrag |

## Etappen

| Etappe | Inhalt | hängt ab von | Stand |
| --- | --- | --- | --- |
| E1 Lesen und Zustellen | Lesestand je Thread, gelesen bis Gezeigtes, Gerätekennung, Cursor, Entwürfe je Konto, Scrollstand | – | TEAM-002 |
| E2 Chatfläche | Desktop: Gespräche, Gespräch, Threadspalte; mobil: Wechsel, Eingabe über der Tastatur; Zähler am Bereich | E1 | TEAM-002 |
| E3 Slack-Kern | private Kanäle, Gruppen, auch im Kanal, Planen, Reaktionen, Formatierung, Anheften, Für später, Stufen, Favoriten, @alle, Suche mit Filtern, Als Aufgabe | E1, E2 | TEAM-002 |
| E4 Dateien | Anhänge, Dateien je Gespräch, Clips | Entscheidung ADR-017 | offen |
| E5 Benachrichtigung außerhalb der App | Push, Mail, Ruhezeiten | Entscheidung ADR-024 Punkt 12 | offen |
| E6 Weiteres | Huddles, KI, Canvas, Workflows, Apps | eigener ADR je Thema | offen |
