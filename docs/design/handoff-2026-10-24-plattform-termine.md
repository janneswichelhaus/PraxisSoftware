# Handoff: Plattform · Termine (Briefing 3)

_Nachtrag 2026-10-26 (Aufräumen M7):_ Die Einsicht der Praxis (`useNurLesen`) ist entfernt; alle
Vorgaben zu ihr entfallen (ADR-023 Fassung 7).

> **Entwurfsreferenz, kein Produktionscode.** Die Entwürfe liegen auf der Design-Leinwand „Plattform –
> Termine“ (<https://claude.ai/artifact/4jdCqRT4YWRiphJ2Sjhqf1>, privat bei Jannes), gebaut mit dem
> „Own Motion Designsystem“ (<https://claude.ai/artifact/HmuUQAQau7HT48PkmvSFQK>, Stand
> `main@616a5545`) auf der Plattform-Sprache aus Briefing 1. Umgesetzt wird in den bestehenden
> Seiten und Bausteinen (`src/features/portal/platform/Termine.tsx`, `Terminaenderung.tsx`,
> `Terminwunsch.tsx`, `Wunschfelder.tsx`, `src/components/ui/HeroKarte.tsx`, `Badge.tsx`,
> `Wochenleiste.tsx`) mit deren Namen, Props und Verhalten. Neu sind **Anordnung, Werte und
> Wortlaute**, die **Seite des einen Termins** und vier Bausteine. Rechte, Projektionen und
> Datenbankfunktionen, die 14 Werktage des Wunschs, was an den Server geht, `late_notice` vom
> Server und die Wortlaute des Ausfallhonorars bleiben unverändert. Neue Daten braucht der Entwurf
> nicht.

Stand 24.10.2026. Quellen: Design-Review Lauf 1 ([Bericht](review-2026-10/lauf-1-bericht.md),
Befunde DR-132 bis DR-136 und DR-159), BEF-220 und BEF-221,
[Briefing 3](review-2026-10/lauf-1-briefings/03-termine.md), [PLATTFORM.md](PLATTFORM.md) und die
Handoffs zu [Briefing 1](handoff-2026-10-22-plattform-erster-eindruck.md) und
[Briefing 2](handoff-2026-10-24-plattform-uebungen.md), deren Werte hier gelten, soweit nichts
anderes steht. DSN-001 (`docs/development/PLATTFORM-ANSICHTEN.md`) bleibt die Vorgabe für Inhalt;
Abweichungen stehen in Abschnitt 0.

## 0 · Entscheidungen

### Offen: fünf Fragen an Jannes

Je Frage zuerst die Empfehlung. Was Jannes nicht anders beantwortet, wird wie empfohlen gebaut.

1. **Der nächste Besuch als Hero-Karte (A) oder als Besuchskarte (B)?** _Empfehlung:_ A. Er ist
   die Hauptsache der Seite und sieht aus wie auf der Übersicht, wenn dort keine Aufgabe ansteht
   (Handoff 1, 5.1): Tiefgrün, „Besuch am Mittwoch“, Zeit, wer kommt, wohin. „Termin wünschen“
   bleibt der eine Hauptknopf; die Karte selbst ist das Ziel, ohne eigenen Knopf. _Alternative:_ B,
   die weiße Besuchskarte der Übersicht mit der Art obenauf – ruhiger, aber ohne Hauptsache. Die
   Leinwand zeigt beide (Tweak „Variante“, dazu „Bild der Person“ für N3).
2. **Ändern und Absagen beginnen auf der Seite des Termins.** „Was möchten Sie?“ entfällt als
   Schritt; die Seite trägt „Termin ändern“ und „Termin absagen“ gleich gewichtet, die Abläufe haben
   zwei statt drei Schritte. _Empfehlung:_ ja. Die Tipps bis zum Senden bleiben gleich (Absage:
   Zeile, „Termin absagen“, „Verstanden, weiter“, „Absage senden“ – heute ebenso vier), aber die
   Seite sagt vorher, was gilt, und ist zugleich das Ziel von „Termin ansehen“ (entschieden in #297,
   Frage 4). _Alternative:_ „Was möchten Sie?“ bleibt Schritt 1; die Seite zeigt dann nur.
3. **Nach dem Senden zurück zur Liste mit Rückmeldung** (wie heute) statt einer eigenen Endseite.
   _Empfehlung:_ Liste. Der Wunsch steht dort sofort unter „Ihre Wünsche“ mit „angefragt“ – das ist
   die Bestätigung, ein Tipp weniger. Anders als bei den Übungen (ANN-706) gibt es nichts zu sagen,
   wo etwas liegt. _Alternative:_ Endseite „Ihr Wunsch ist angekommen“ (auf der Leinwand).
4. **Ohne Netz sind Wünschen, Ändern und Absagen gesperrt** (gestrichelt, mit Satz), statt erst
   beim Senden zu scheitern. _Empfehlung:_ ja, wie die Übungstage (Handoff 2). Reißt die Verbindung
   erst im Ablauf ab, bleibt der heutige Weg: Angaben stehen, Senden wartet.
5. **In der Lesefrist kein „Termin wünschen“.** DSN-001 D2 sagt „30 Tage lesend“; der Server nimmt
   einen Wunsch aber auch dann an (`app.platform_access_allows` erlaubt `request` jedem lesbaren
   Zugang, BEF-222). _Empfehlung:_ in der Ansicht weglassen, mit dem Satz „Neue Termine vereinbaren
   Sie bei Bedarf direkt mit der Praxis.“ (_neu_); ob der Server in der Lesefrist ablehnt, ist ein
   eigener Auftrag nach Pfad A – Weglassen ist keine Zugriffskontrolle. _Alternative:_ Wünschen
   bleibt in der Lesefrist; dann steht der Knopf dort wie sonst.

**Freigabe:** Mit dem Merge dieses Handoffs gibt Jannes Schritt 3 der Umsetzung frei (Abschnitt
9); seine Antworten auf die Fragen gelten, sonst die Empfehlungen.

### Festlegungen aus dem Entwurf (beim Bauen als Annahmen eintragen)

- **Der nächste Termin zuerst:** `naechsterTermin` (wie die Übersicht) als Hero; die übrigen
  kommenden darunter als „Weitere Termine“ (_neu_, statt „Kommende Termine“). Gibt es nur einen,
  entfällt der Abschnitt.
- **Die Seite des Termins ist das Ziel jeder Zeile**, auch vergangener und abgesagter; heute führen
  nur bestätigte künftige Termine weiter. `?art=change` bzw. `?art=cancel` öffnet wie heute gleich
  den Ablauf.
- **Zeichen der Art** in jeder Zeile und auf der Seite: Haus, Praxis, Video – immer mit Wort. Im
  Bereich Training trägt jede Einheit außer Video das Zeichen „Training“ (Hantel), wie
  `terminTitel` dort „Training“ sagt.
- **Terminzeile in drei kurzen Zeilen** (DR-132): Tag in Worten, Zeit, Art und Person. Nur der Tag
  ist fett.
- **Die Rolle ohne Geschlecht:** Die Daten kennen nur den Namen (`staff_name`); „Ihr Therapeut“
  oder „Ihre Therapeutin“ steht nirgends. Wortlaute in Abschnitt 3, „Wer und wo“.
- **Wünsche:** ein Satz über der Liste statt eines je Wunsch; die Tage nach Wochentag
  zusammengefasst mit „oder“ („Dienstag oder Donnerstag, vormittags“), weil jeder einzelne passt –
  statt jedes Datum aufzuzählen. Ein Wunsch sieht nie aus wie ein Termin (§8): Kalenderzeichen auf
  der Vertiefung, „angefragt“ als Statuszeichen.
- **„Diese Woche“ ohne Pillen** (DR-135): nur Tage mit etwas, Zeichen und Text in einer Zeile; die
  leeren Tage in einer Zeile am Ende.
- **Statuszeichen und Knöpfe brechen nie im Wort** (BEF-220), höchstens zwischen Wörtern.
- **„Praxis anrufen“** mit der Nummer aus N2 (`practice_phone`, ANN-691) ist am vergangenen Termin
  der Hauptknopf (DR-133, BEF-221), sonst eine Zeile unter „Fragen zu diesem Termin?“. Ohne Nummer
  bleibt „Der Praxis schreiben“. Der Satz „Bei Fragen rufen Sie bitte die Praxis an.“ ohne Nummer
  entfällt.
- **Tage im Wunsch als Segment** Montag bis Freitag mit der `Wochenleiste` (ANN-708), Tageszeiten
  als vier Wahlflächen statt Kästchen (DR-134); „Egal“ schließt die anderen aus wie heute.
- **Ausfallhonorar dort, wo entschieden wird:** Unter 24 Stunden steht der feste Satz schon auf der
  Seite des Termins über den Knöpfen, im Ablauf als eigene Seite und vor dem Senden noch einmal
  (BEF-079). Wortlaute aus `src/lib/ausfallhonorar.ts`, unverändert.
- **Laden als Skelett, „Termin wünschen“ erst mit der Liste** (DR-136); bei einem Fehler bleibt der
  Knopf, der Satz sagt es.
- **Rechner zweispaltig** für die Liste, wie im Briefing verlangt und wie die Übungen – Abweichung
  von PLATTFORM.md („jede Seite einspaltig außer der Übersicht“). Der Wunsch als Fenster von 36rem.

## 1 · Geltung

**Gilt für** den Reiter „Termine“ (`/p/termine`), die Seite eines Termins (`/p/termine/{id}`, _neu_
als Seite; heute der Ablauf), den Terminwunsch (`/p/termine/wunsch`), Ändern und Absagen
(`/p/termine/{id}?art=change|cancel`) und das Ziel von „Termin ansehen“ auf der Übersicht.

**Unverändert bleiben:** die Datenbankfunktionen `platform_appointments`,
`platform_appointment_requests`, `request_platform_appointment`,
`request_platform_appointment_change` und `withdraw_platform_appointment_request` mit ihren
Prüfungen; `WUNSCHTAGE` und was an den Server geht (Kalendertage, Tageszeiten, Nachricht);
`late_notice` vom Server (ADR-018 Punkt 8); die Wortlaute des Ausfallhonorars;
`useTextverlustschutz` mit `WUNSCHSCHUTZ`; `useEinmaligeRueckmeldung`; der Bereich in jedem Link
(D6); die Einsicht der Praxis (`useNurLesen`, E-001); ANN-307 (die Übungstage sieht nur die
Person); `terminTitel`, `terminZeit`, `terminPerson`; alle Farben, die Marke.

**Kein Scope:** die Übersicht außer dem Ziel von „Termin ansehen“ (Briefing 1 gilt), Übungen
(Briefing 2), Nachrichten („Der Praxis schreiben“ führt zu `/p/nachrichten/neu` wie jede neue
Nachricht), die Praxis-App, das Bild der Person (N3, nur Variante „wenn vorhanden“). Keine neue
Funktion: kein Kalender-Export, keine Erinnerung, keine Selbstbuchung, keine Belegung anderer.

**Texte:** Sie-Form; neue Wortlaute sind _neu_ markiert. „Termin wünschen“; Dauer statt „Länge“
oder „Terminfenster“; Namen statt Doppelpunkt-Formen, wo der Name bekannt ist (DR-159).

## 2 · Tokens

Keine neue Farbe, kein neuer Schatten, kein neuer Wert. Es gelten die Rollen aus Briefing 1:

| Rolle       | Token                                                                          | Verwendung                                                                                     |
| ----------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Seitentitel | `text-plattform-titel` 28/800 (Rechner 32)                                     | „Termine“; auf der Seite des Termins der Tag                                                   |
| Hero        | `text-hero` 26 (Rechner 32, unter 23rem 22)                                    | Titel des nächsten Besuchs                                                                     |
| Abschnitt   | `text-abschnitt` 22/700                                                        | „Weitere Termine“, „Ihre Wünsche“, „Diese Woche“, Abschnitte der Seite; die Zeit unter dem Tag |
| Zeile       | 18/600                                                                         | Tag in der Terminzeile, Name, Fragen der Abläufe („An welchen Tagen?“)                         |
| Text, Leise | 18/400, `ink-muted`                                                            | alles Übrige                                                                                   |
| Kreis Art   | 40, `accent-soft` mit `accent`, Zeichen 22                                     | Terminzeile; gedämpft `surface-sunken` mit `ink-muted`; Wunsch: Kalender auf `surface-sunken`  |
| Person      | 56, Initialen 20/700; Papier auf Tiefgrün bzw. `person-schiefer` mit `surface` | Hero und „Wer und wo“                                                                          |

`shadow-plattform` nur an der Hero-Karte (Variante B: an der Besuchskarte). Abstände aus der Skala:
Seite `gap-10` (40), auf der Seite des Termins 32; Abschnitt innen 16, Wünsche 12; Zeilen innen
14/12. Radien: Hero `rounded-image`, Listen und Karten `rounded-card`, Knöpfe, Segment und
Wahlflächen `rounded-button`, Statuszeichen `rounded-pill`. Alles in rem.

## 3 · Bausteine

### Nächster Besuch (`HeroKarte`, neu belegt)

Zwei neue Props: `ort` (_neu_, an `person`; eine Zeile 18/400 unter der Personenzeile) und `ziel`
(_neu_, statt `aktion`): Die ganze Karte ist ein Link. Der Titel ist der Linktext, sein `::after`
deckt die Karte; darunter sichtbar „Termin ansehen“ 18/700, unterstrichen, mit Pfeil 20, 44 hoch,
`aria-hidden` (der Titel trägt den Namen). Fokus 3 px `ink` außen um die Karte, Abstand 3; Druck
98 % wie jede Karte. Kein Knopf in Papier, denn der Hauptknopf der Seite ist „Termin wünschen“.

- **Titel, Satz, Person** aus `terminTitel`, `terminZeit` und `terminPerson` (bestehen): „Besuch am
  Mittwoch“ · „28. Oktober, 9:30 bis 10:30“ · „Anna Beispiel kommt zu Ihnen“. Heute: „Besuch heute“
  · „24. Oktober, 9:30 bis 10:30“.
- **Ort:** beim Hausbesuch die Anschrift aus `visit_*` (wie `terminBeschreibung`), in der Praxis
  `location_name`, beim Video keiner.
- **Etikett** in `salbei` 18/600:

| Lage                           | Etikett                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Hausbesuch                     | „Ihr nächster Besuch“ (_neu_)                                                     |
| Praxis, Video                  | „Ihr nächster Termin“ (_neu_)                                                     |
| Training                       | „Ihr nächstes Training“ (_neu_)                                                   |
| erster Termin (`ersterTermin`) | „Ihr erster Besuch“ (besteht), „Ihr erster Termin“, „Ihr erstes Training“ (_neu_) |
| Vertretung                     | ohne „Ihr“: „Nächster Besuch“ (besteht), „Nächster Termin“, „Nächstes Training“   |

- Unter 23rem innen 12, Titel 22, kein Laufrad, Bild über der Zeile (besteht). Personenbild:
  Initialen auf Papier; ein Foto nur als Variante „wenn vorhanden“ (N3).
- **Übersicht:** bleibt mit `aktion` (Knopf „Termin ansehen“ in Papier, dort ist die Karte die
  Hauptsache); nur das Ziel wechselt auf die Seite des Termins.
- **Variante B** (falls Frage 1 so entschieden): die Besuchskarte der Übersicht unter `h2` „Ihr
  nächster Besuch“, obenauf die Art als Zeichen 20 und Wort in Leise (_neu_).

### Terminzeile (in `Termine.tsx`, Muster `ListRow`)

- Die ganze Zeile führt zur Seite des Termins; mindestens 80 hoch, innen 14/12, Liste mit Rahmen
  (Linie `line`, `rounded-card`), Trenner ab der zweiten Zeile, Druck mit `surface-sunken`.
- Vorn der Kreis der Art, oben bündig; hinten Pfeil 20 in Leise.
- **Drei Zeilen:** Tag 18/600 („Mittwoch, 4. November“; „Heute, 24. Oktober“ und „Morgen, 25.
  Oktober“ _neu_) · Zeit „14:00 bis 15:00“ · Leise Art kurz und Person: „Praxis · Jannes Test“
  (_neu_; Kurzwörter „Hausbesuch“, „Praxis“, „Video“, „Training“; ohne Namen nur das Wort).
- Darunter, Abstand 6, das Statuszeichen, wenn es eines gibt: „Änderung angefragt“, „Absage
  angefragt“, „durchgeführt“, „abgesagt“, „nicht angetroffen“ (bestehen).
- **Gedämpft** (vergangen, abgesagt): Kreis `surface-sunken` mit `ink-muted`, Tag in `ink-muted`.
- **„Sehr groß“ und unter 23rem:** der Kreis über dem Text, kein Pfeil, innen 12 – so bleibt
  „Änderung angefragt“ in einer Zeile.

### Statuszeichen (`Badge`, BEF-220)

- Zeichen und Wort in einer Pille, 18/600, innen 2/12, `max-width: 100%`; `overflow-wrap: normal`
  und `hyphens: manual` am Baustein: bricht nur zwischen Wörtern. Ebenso an `Button`, `ButtonLink`,
  `Textlink` und dem Auslöser der `Rueckfrage` („Wunsch zurückziehen“). `.plattform-schrift` behält
  `overflow-wrap: anywhere` für Fließtext.
- Töne wie heute: wartet (`accent-soft`, „…“), positiv („✓“), kritisch („×“), Warnung („!“),
  neutral (ohne Zeichen).

### Wer und wo (_neu_, in der Seite des Termins)

- Karte mit Rahmen, `section` mit `aria-label` „Wer und wo“ (_neu_). Erste Zeile innen 14/16:
  Kreis 56 mit Initialen (`person-schiefer`, `surface`), daneben Name 18/600 und die Rolle in
  Leise. Zweite Zeile nach einer Linie: Zeichen „Ort“ 26 in Leise in einer Spalte von 56, daneben
  die Anschrift bzw. der Standort. Beim Video entfällt sie.
- Unter 23rem gestapelt, innen 12, Spalte 26.
- **Rolle:**

| Art        | kommend                               | durchgeführt            | abgesagt, nicht angetroffen |
| ---------- | ------------------------------------- | ----------------------- | --------------------------- |
| Hausbesuch | „kommt zu Ihnen“ (Vertretung „kommt“) | „war bei Ihnen“ (_neu_) | nur der Name                |
| Praxis     | „erwartet Sie in der Praxis“ (_neu_)  | nur der Name            | nur der Name                |
| Video      | „per Video“ (_neu_)                   | nur der Name            | nur der Name                |

Für eine Vertretung „erwartet {Name} in der Praxis“ (_neu_, `represented_name`). Im Training wie
die Art.

### Fragen zu diesem Termin (_neu_)

- `h2` „Fragen zu diesem Termin?“ (_neu_), darunter eine Liste mit Rahmen, Zeilen 64 hoch, innen
  10/16, Zeichen 24 in `accent`, Pfeil 24 in Leise:
  - „Praxis anrufen“ (besteht) mit der Nummer darunter in Leise, `white-space: nowrap`, als
    `tel:`-Link – nur mit `practice_phone`;
  - „Der Praxis schreiben“ (_neu_) mit Zeichen „Nachricht“, zu `/p/nachrichten/neu` mit Bereich.
- **Am vergangenen Termin** steht „Praxis anrufen“ als Hauptknopf über der Liste: 60 hoch, Zeichen
  20 und Wort, die Nummer in einer zweiten Zeile – das Muster von `Anrufknoepfe` mit `hauptknopf`
  (ANN-688). Die Liste trägt dann nur „Der Praxis schreiben“.
- Unter 23rem: Zeichen über dem Text, kein Pfeil.

### Tage (`Wochenleiste`, Montag bis Freitag)

- Die bestehende `Wochenleiste` mit `wochentage` Montag bis Freitag; das Raster nimmt die Spalten
  aus der Zahl der Tage (heute fest sieben, falls so gebaut). Titel als `h2` „An welchen Tagen?“
  (_neu_; Prop `ebene`, _neu_, Standard 3). Zellen 56 hoch, bei 375 px je etwa 67 breit.
- Satz darunter (`role="status"`, Leise): „Dienstag oder Donnerstag – bis Donnerstag, 12.
  November.“ (_neu_; Tage mit „oder“, bei allen „Montag bis Freitag“, dahinter der letzte
  gesendete Tag wie `zeitraumText`); ohne Tag „Wählen Sie einen oder mehrere Tage.“ (_neu_).
- Unter 23rem Raster mit drei Spalten, Abstand 8, Ziele 48 (besteht).

### Wahlflächen (_neu_, `src/components/ui/Wahlflaechen.tsx`, ersetzt die Kästchen der Tageszeit)

- `role="group"` mit `aria-labelledby` auf `h2` „Zu welcher Tageszeit?“ (_neu_); je Wahl ein
  `button` mit `aria-pressed`: „Vormittag“, „Mittag“, „Nachmittag“, „Egal“ (bestehen).
- Raster mit zwei Spalten, Abstand 12; jede Fläche mindestens 64 hoch, innen 8/16,
  `rounded-button`, Linie 1 `line-strong`, Text 18/600 links, rechts ein leerer Kreis 22 mit Linie
  `line-strong`.
- **Gewählt:** Linie 2 `accent`, Fläche `accent-soft`, Text `accent` 700, Kreis 24 `accent` mit
  Haken 16 in `surface`. Nichts vorgewählt.
- „Egal“ nimmt die anderen zurück, jede andere nimmt „Egal“ zurück (wie `zeitUmschalten` und
  `egalUmschalten`).
- „Sehr groß“ und unter 23rem: eine Spalte; „Sehr groß“ 72 hoch.

### Wunschzeile (in `Termine.tsx`)

- Vorn der Kalender-Kreis 40 auf `surface-sunken` (unter 23rem entfällt er); innen 14/16.
- Erste Zeile: was gewünscht ist 18/600 – „Terminwunsch“ (besteht), „Änderung für Mi., 4.
  November“ (_neu_), „Absage für Mi., 4. November“ (_neu_; Datum aus dem Termin mit
  `appointment_id`, sonst „Änderungswunsch“ bzw. „Absagewunsch“) – und das Statuszeichen daneben,
  umbrechend.
- Dann: wann („Dienstag oder Donnerstag, vormittags“, _neu_ als Wortform; Tageszeiten als
  „vormittags“, „mittags“, „nachmittags“, ohne Angabe „zu jeder Tageszeit“) · die Nachricht in
  „…“ Leise · „Antwort der Praxis: …“ (besteht) · „Gesendet am 22. Oktober“ (_neu_, statt „vom …“
  im Titel) · „Wunsch zurückziehen“ leise am Ende mit der bestehenden Rückfrage.
- Über der Liste einmal, Leise: „Ein Wunsch ist noch kein Termin. Die Praxis meldet sich bei
  Ihnen.“ (_neu_; ersetzt den Satz je Wunsch). Beantwortete bleiben 14 Tage wie heute.

### Diese Woche (in `Termine.tsx`)

- Karte mit Zeilen ab 56 hoch, innen 12/16; Raster aus Tag (6.5rem, „Sehr groß“ 8rem) und
  Inhalt, Abstand 12.
- Tag 18/600: „Heute“, „Mo., 26.“ (bestehen). Je Eintrag Zeichen 20 in `accent` und Text in einer
  Zeile: „9:30 Hausbesuch · Anna Beispiel“, „Übungstag · Heimübungen Knie“ (_neu_ als Form; „·
  geübt“ wie heute dahinter).
- Die leeren Tage in einer letzten Zeile in Leise: „So., Di., Do., Fr.“ bzw. „So., Di. bis Fr.“
  und „nichts geplant“ (_neu_, statt „Nichts geplant.“ je Tag).
- Unter 23rem der Tag über dem Inhalt.

### Kopf der Seite des Termins (`Terminkopf`, neu gefasst)

- Darüber der `Rueckweg` „Termine“ (besteht; von der Übersicht „Übersicht“), 44 hoch.
- Zeile der Art: Zeichen 22 und Wort 18/600 in Leise („Hausbesuch“, „In der Praxis“,
  „Videotermin“, „Training“).
- `h1` der Tag: „Mittwoch, 28. Oktober“, „Heute, 24. Oktober“, „Morgen, 25. Oktober“ (_neu_ als
  Titel) in `text-plattform-titel`; darunter die Zeit 22/700 „9:30 bis 10:30“; darunter das
  Statuszeichen, wenn es eines gibt.

### Ausfallhonorar (Form, Wortlaut fest)

- **Rechtzeitig:** Karte mit Rahmen, innen 20, Kreis 40 `accent-soft` mit Haken, daneben
  `AUSFALLHONORAR_RECHTZEITIG`.
- **Unter 24 Stunden:** `role="alert"`, Fläche `warnung-soft`, Kreis 40 `warnung` mit „!“ in
  `warnung-soft`, Text `warnung` 600 `AUSFALLHONORAR_SPAET`; der Aufklapper „Unsere Regel zum
  Ausfallhonorar“ (besteht) ist dann offen.
- Auf der Seite des Termins und vor dem Senden als `Statusmeldung` Warnung, fett, mit Zeichen.

## 4 · Layout und Responsive-Verhalten

| Breite                      | Liste                                                                                                | Seite des Termins                                             | Abläufe                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| unter 23rem (200 %, 188 px) | Kopf mit „Menü“; Hero innen 12, Titel 22, ohne Laufrad; Zeilen gestapelt; Woche Tag über Inhalt      | Titel 22; „Wer und wo“ und Fragen gestapelt                   | Tage als Raster, Tageszeiten untereinander; Fuß am Ende |
| unter 640 (Telefon, 375)    | Kopf 72, Reiterleiste unten; einspaltig, `px-5`, Abschnitte `gap-10`                                 | einspaltig, Abstand 32; Knöpfe volle Breite                   | Vollbild des geführten Ablaufs, Fuß fest                |
| 640 bis 1023                | wie am Telefon in `max-w-formular`                                                                   | in `max-w-spalte`                                             | wie am Telefon                                          |
| ab 1024 (Rechner, 1280)     | Navigation im Kopf; zwei Spalten: Liste links (`flex: 999 1 520px`), Hero und Knopf rechts (bis 460) | in `max-w-spalte`, Titel 32; Ändern und Absagen nebeneinander | `Dialogfenster` 36rem (576), innen 24                   |

- Liste am Rechner: `flex-wrap` mit `row-reverse`, im Baum zuerst Hero und „Termin wünschen“ – am
  Telefon und für Vorlesesoftware oben, am Rechner rechts. Abstand 48; Hero innen 32, Titel 32;
  „Termin wünschen“ in der rechten Spalte volle Breite.
- „Sehr groß“ (125 %): alles in rem wächst; Terminzeile gestapelt; Reiterleiste in zwei Reihen
  (Briefing 1); Tageszeiten in einer Spalte; die Tage bleiben eine Reihe.

## 5 · Bildschirme

Beispieldaten synthetisch, „heute“ ist Samstag, 24. Oktober 2026: Erika Beispiel (Behandlung, Anna
Beispiel, Testweg 7, 72072 Tübingen; Jannes Test in der Praxis, Hauptstandort Tübingen, Neckarhalde
1), Paula als Begleitung für Maximilian Mustermann-Langenscheidt (Lindenweg 3, 72070 Tübingen),
eine Trainingskundin mit Tom Training. Rufnummer der Praxis „+49 7071 0000000“.

### 5.1 Termine (`Termine.tsx`)

Von oben: `h1` „Termine“ · Rückmeldung nach dem Senden (besteht; Frage 3) · nächster Besuch
(Abschnitt 3) · „Weitere Termine“ (`h2`) mit Terminzeilen · Hauptknopf „Termin wünschen“ volle
Breite · „Ihre Wünsche“ · „Diese Woche“ · „Vergangene Termine ({n})“ als Aufklapper (besteht),
darin gedämpfte Zeilen.

- **Besuch heute:** Hero „Besuch heute“; in der Woche „Heute“ mit Besuch und Übungstag.
- **Kein Termin:** Leerzustand mit Markenform in einer Karte, „Zurzeit ist kein Termin vereinbart.“
  und „Über „Termin wünschen“ sagen Sie der Praxis, wann es Ihnen passt.“ (bestehen); Knopf, Woche,
  Vergangene.
- **Nur ein Wunsch:** Karte mit Uhr 32 im Kreis 64 auf `surface-sunken`: „Ihr Wunsch ist bei der
  Praxis.“ und „Sie meldet sich bei Ihnen. Danach steht Ihr Termin hier.“ (_neu_); „Ihre Wünsche“;
  Zweitknopf „Noch einen Termin wünschen“ (_neu_) – der Wunsch ist schon gesendet, die Hauptsache
  ist erledigt.
- **Begleitung:** Vertretungsband (besteht); Hero „Besuch bei Maximilian Mustermann-Langenscheidt“,
  „Mittwoch, 28. Oktober, 9:30 bis 10:30“, „Anna Beispiel kommt“, die Anschrift der Person,
  Etikett „Nächster Besuch“. Die Woche wie heute (ANN-307).
- **Training:** Etikett „Ihr nächstes Training“, „Training am Montag“, „Tom Training kommt zu
  Ihnen“; Zeilen mit Training- und Video-Zeichen.
- **Lesefrist** (Frage 5): über dem Titel `Statusmeldung` Warnung mit dem Wortlaut der Übersicht
  („Ihre Behandlung ist beendet. Sie können hier noch bis {Datum} lesen.“), unter dem Titel
  „Neue Termine vereinbaren Sie bei Bedarf direkt mit der Praxis.“ (_neu_), dann „Vergangene
  Termine“ als offener Abschnitt mit `h2` statt Aufklapper. Kein Knopf, keine Woche.
- **Einsicht der Praxis:** wie heute ohne Knopf und Zurückziehen; statt der Woche
  `TAGE_NUR_DIE_PERSON`.

### 5.2 Seite des Termins (_neu_, `Terminseite.tsx`; heute `Terminaenderung` ohne `?art=`)

Von oben, Abstand 32: Kopf (Abschnitt 3) · „Wer und wo“ · je Lage · „Fragen zu diesem Termin?“.

- **Kommend, änderbar:** Abschnitt „Passt der Termin nicht?“ (_neu_, `h2`) mit Leise „Ändern und
  Absagen sind Wünsche an die Praxis. Sie meldet sich bei Ihnen.“ (_neu_) und zwei Zweitknöpfen
  volle Breite „Termin ändern“ und „Termin absagen“ (bestehen), Abstand 12.
- **Unter 24 Stunden** (`late_notice`): statt des Satzes die Warnung mit `AUSFALLHONORAR_SPAET`;
  Knöpfe gleich.
- **Offener Wunsch:** im Kopf „Änderung angefragt“ bzw. „Absage angefragt“; Abschnitt „Ihr
  Änderungswunsch“ bzw. „Ihr Absagewunsch“ (_neu_, `h2`) mit wann und Nachricht aus dem Wunsch
  (`appointment_id`), „Die Praxis meldet sich bei Ihnen. Bis dahin gilt der Termin.“ (_neu_) und
  leise „Wunsch zurückziehen“ mit Rückfrage. Keine Knöpfe zum Ändern oder Absagen.
- **Vergangen** (durchgeführt, nicht angetroffen, bestätigt ohne Abschluss): Statuszeichen, wenn es
  eines gibt; Rolle nach Abschnitt 3; „Praxis anrufen“ als Hauptknopf (BEF-221).
- **Abgesagt:** „abgesagt“; Zweitknopf „Neuen Termin wünschen“ (_neu_) zum Wunsch; Fragen als Liste.
- **Einsicht der Praxis:** ohne Ändern, Absagen, Zurückziehen und ohne „Fragen zu diesem Termin?“.
- **Nicht gefunden, Laden, Fehler:** wie heute; Laden als Skelett in der Form des Kopfs.
- **Ohne Netz:** „Termin ändern“ und „Termin absagen“ gesperrt (gestrichelt, `aria-disabled`) mit
  dem Satz der Liste (5.6); „Praxis anrufen“ bleibt.

### 5.3 Termin wünschen (`Terminwunsch.tsx`, zwei Schritte)

Geführter Ablauf wie heute: Kopf mit „Termin wünschen“ und ✕ (mit `WUNSCHSCHUTZ`), „Zurück“ ab
Schritt 2, „Schritt {n} von 2“, Balken je Schritt, Fuß mit einem Hauptknopf.

1. **„Wann passt es Ihnen?“** (besteht): Tage (Abschnitt 3) mit Satz, Tageszeiten als
   Wahlflächen; Abstand 20; Fuß „Weiter“. Fehlt etwas, die Sätze aus `wannFehlt` (bestehen) über
   dem Knopf.
2. **„Ist alles richtig?“** (besteht): Karte mit der Zeile „Wann“ in Leise, „Dienstag oder
   Donnerstag, vormittags“ 600, „bis Donnerstag, 12. November“ in Leise und „Ändern“ als
   kompakter Zweitknopf (44) rechts; Aufklapper „Nachricht an die Praxis (freiwillig)“ (besteht).
   Fuß: Leise „Die Praxis sucht einen Termin und meldet sich bei Ihnen. Ein vereinbarter Termin ist
   das noch nicht.“ (besteht) und „Wunsch senden“.

- **Nach dem Senden:** zur Liste mit „Ihr Wunsch ist bei der Praxis angekommen. Sie meldet sich bei
  Ihnen.“ (besteht; Frage 3). Alternative Endseite: Kreis 96 mit Uhr, „Ihr Wunsch ist angekommen“,
  „Die Praxis meldet sich bei Ihnen. Ein vereinbarter Termin ist das noch nicht.“, die Wahl mit
  Kalender-Zeichen, Hauptknopf „Zu den Terminen“ (alles _neu_).
- **Verbindung weg beim Senden:** `Statusmeldung` neutral mit dem Zeichen ohne Netz und dem
  bestehenden Satz („Ohne Verbindung lässt sich Ihr Wunsch gerade nicht senden. …“); „Wunsch
  senden“ gesperrt, bis die Verbindung zurück ist.

### 5.4 Termin ändern und Termin absagen (`Terminaenderung.tsx`, je zwei Schritte)

Kopf mit `terminKurz` („Mi., 28.10. · 9:30 · Hausbesuch“, besteht) und ✕ zur Seite des Termins.
Schritt 1 hat kein „Zurück“; ✕ und die Zurückgeste führen zur Seite des Termins.

- **Ändern 1 „Wann passt es Ihnen?“:** wie der Wunsch; Satz etwa „Montag oder Dienstag – bis
  Dienstag, 10. November.“
- **Ändern 2 „Ist alles richtig?“:** Karte mit „Ihr Termin“ in Leise, „Mittwoch, 28. Oktober, 9:30
  bis 10:30“ 600, „Hausbesuch · Anna Beispiel“ in Leise; nach einer Linie „Lieber am“ (_neu_, statt
  „Wann“) mit der Wahl und „Ändern“. Aufklapper „Was sollen wir noch wissen? (freiwillig)“
  (besteht). Fuß: `Statusmeldung` neutral mit dem Satz zur Freigabe (besteht; unter 24 Stunden die
  Fassung „kurzfristige Absage“ als Warnung) und „Änderungswunsch senden“.
- **Absagen 1 „Ausfallhonorar“** (besteht): rechtzeitig oder unter 24 Stunden (Abschnitt 3); Fuß
  „Verstanden, weiter“.
- **Absagen 2 „Ist alles richtig?“:** Karte mit Kreis 40 `danger-soft` und „×“ in `danger`, „Termin
  absagen“ 600, Tag und Zeit, Art und Person in Leise; Aufklapper „Möchten Sie der Praxis etwas
  mitteilen? (freiwillig)“ (besteht). Fuß: unter 24 Stunden die Warnung noch einmal (BEF-079), dann
  Leise „Die Praxis trägt die Absage ein. Als Eingang Ihrer Absage gilt …“ (besteht) und „Absage
  senden“.

### 5.5 Rechner (1280)

- **Liste:** wie Abschnitt 4; Skelett in zwei Spalten; Leerzustand, Fehler und Lesefrist in
  `max-w-spalte`; ohne Netz mit Verbindungszeile unter dem Kopf.
- **Seite des Termins:** in `max-w-spalte`, Titel 32; „Termin ändern“ und „Termin absagen“
  nebeneinander, so breit wie ihr Text.
- **Abläufe:** `Dialogfenster` 36rem mit Kopf, Schritt, Balken und Fuß innen 24.

### 5.6 Laden, Fehler, ohne Netz

- **Laden:** `Skelett` in der echten Form – Seitentitel steht, Hero 300 hoch mit drei Balken und
  Kreis, Abschnittstitel, Liste 168, Knopf als Fläche 48; `aria-busy` und „Termine werden geladen“
  (_neu_) nur für Vorlesesoftware. Kein bedienbarer Knopf (DR-136).
- **Fehler:** `ErrorState` „Ihre Termine lassen sich gerade nicht laden.“ / „Versuchen Sie es
  gleich noch einmal. Einen Termin wünschen können Sie trotzdem.“ (_neu_) mit „Erneut versuchen“
  (besteht); darunter „Termin wünschen“.
- **Ohne Netz, Seite war geladen:** Verbindungszeile im Kopf (besteht); alles bleibt lesbar;
  „Termin wünschen“ gesperrt (gestrichelt) mit „Wünschen, Ändern und Absagen gehen wieder mit
  Verbindung.“ (_neu_) darunter (Frage 4).

## 6 · Barrierefreiheit

- **Kontraste** (gemessen mit `src/lib/kontrast.ts`; in `kontrast.test.ts` ergänzen, soweit
  neu): `accent` auf `accent-soft` 9,6:1 (Kreis der Art, gewählte Tageszeit); `ink-muted` auf
  `surface-sunken` 5,8:1 (gedämpfte Kreise, Kalender); `surface` auf `person-schiefer` 9,2:1
  (Initialen); `salbei` auf `surface-inverse` 5,8:1 (Etikett); `warnung` auf `warnung-soft` 7,9:1
  (Warnung, auch umgekehrt im Kreis); `danger` auf `danger-soft` 8,1:1 (Absage); `surface` auf
  `accent` 11,3:1 (gewählte Tage, Hauptknopf); `ink-muted` auf `surface` 6,3:1; `line-strong`
  gegen `surface` 4,2:1 (Segment, Wahlflächen, leere Kreise).
- **Ziele:** Terminzeile ≥ 80, Hero als ganze Karte, Knöpfe 48, „Praxis anrufen“ als Hauptknopf
  60, Zeilen der Fragen 64, Tage 56 hoch (unter 23rem 48 mit Abstand 8), Wahlflächen 64,
  „Ändern“ in der Zusammenfassung 44, Rückweg und Textlinks 44.
- **Vorlesesoftware:** Seitentitel `h1`; Hero `section` mit `h2`, dessen Link den Titel als Namen
  trägt; jede Terminzeile ein Link, dessen Name Tag, Zeit, Art, Person und Zustand sagt; Kreise,
  Pfeile, Laufrad und Zeichen `aria-hidden`, am Statuszeichen nur das Zeichen; Tage `role="group"`
  mit `aria-pressed` und vollem Namen, der Satz `role="status"`; Wahlflächen `aria-pressed`; die
  Warnung unter 24 Stunden im Ablauf `role="alert"`, auf der Seite `role="status"`; gesperrte
  Knöpfe `aria-disabled` mit dem Satz über `aria-describedby`; Skelett mit `aria-busy` und Text.
- **Fokus:** sichtbarer Ring wie heute; an der Hero-Karte außen um die ganze Karte; an Tagen 3 px
  innen (besteht); an Wahlflächen 3 px `ink` außen.
- **Trennung:** `hyphens: manual` überall; Namen, Anschriften, Statuszeichen, Knöpfe und die
  Rufnummer werden nie getrennt (DR-114, BEF-220), die Rufnummer `white-space: nowrap`.
- **200 % und „Sehr groß“:** kein waagerechtes Rollen; Zeilen, „Wer und wo“ und Fragen stapeln;
  der Fuß der Abläufe steht unter 23rem am Ende des Inhalts (besteht im geführten Ablauf).
- **Farbe nie allein:** Art = Zeichen und Wort; Zustand = Zeichen und Wort; gewählt = Fläche,
  Haken und Fettung; gesperrt = gestrichelt und Satz; Warnung = Zeichen, Fettung und Fläche.

## 7 · Bewegung

| Was                                   | Dauer                            | Kurve                        | Bei „Bewegung reduzieren“ |
| ------------------------------------- | -------------------------------- | ---------------------------- | ------------------------- |
| Druck an Knopf, Zeile, Karte          | 120 ms, Maßstab 0,98 und Fläche  | `cubic-bezier(.2,.7,.2,1)`   | nur die Fläche            |
| Druck an Tagen und Wahlflächen        | 120 ms, nur Fläche               | `cubic-bezier(.2,.7,.2,1)`   | nur die Fläche            |
| Haken an Tag und Wahlfläche erscheint | 160 ms                           | `cubic-bezier(.3,1.35,.5,1)` | sofort                    |
| Aufklapper (Pfeil dreht sich)         | 120 ms, 90°                      | `cubic-bezier(.2,.7,.2,1)`   | ohne Drehung              |
| Skelett                               | Puls 1,6 s, Deckkraft 1 bis 0,55 | ease-in-out                  | ohne Puls                 |

Kein Markenmoment auf den Terminen; das Laufrad im Hero steht still (der Moment bleibt der
Übersicht).

## 8 · Prüfung

- Bildstrecke vorher und nachher: `pnpm bildstrecke --nur=plattform` mit Liste, Seite des Termins
  (kommend, unter 24 Stunden, offener Wunsch, vergangen mit und ohne Rufnummer, abgesagt),
  Wunsch, Ändern, Absage bei 375 und 1280 px, dazu 188 px (200 %) und „Sehr groß“ für Liste, Seite
  und Wunsch; langer Name der Begleitung (Prüfseite `plattform.html`, Seiten `termine`, `termin`,
  `termin-aendern`, `termin-absagen`, `wunsch`, `handeln-fuer`).
- `tests/e2e/plattform-barrierefreiheit.spec.ts`: axe auf allen neuen Zuständen; bei 188 px und
  „Sehr groß“ kein waagerechtes Rollen; genau ein Hauptknopf je Ansicht. Ob ein Wort im Statuszeichen
  oder Knopf bricht (BEF-220), zeigt die Sichtung der Bildstrecke bei 188 px und „Sehr groß“.
- `src/designsystem.test.ts` (Ratsche): unter `.plattform-schrift` keine Schrift unter 18 px, als
  Schatten nur `shadow-plattform`, keine Versalien.
- `src/lib/kontrast.test.ts`: die Paare aus Abschnitt 6.
- Komponententests: Tag in Worten (heute, morgen, Wochentag; Tag der Praxis), Rolle je Art und
  Lage samt Vertretung, Wunsch in Worten („oder“, „Montag bis Freitag“, Tageszeiten, „zu jeder
  Tageszeit“), Etikett des Heros je Art, erster Termin und Vertretung; die Seite des Termins je
  Lage (kommend, unter 24 Stunden, offener Wunsch, vergangen mit und ohne Nummer, abgesagt,
  Einsicht, ohne Netz); `?art=` öffnet den Ablauf mit „Schritt 1 von 2“; Laden ohne Knopf, Fehler
  mit Knopf, ohne Netz gesperrt, Lesefrist ohne Knopf; „Diese Woche“ mit leeren Tagen in einer
  Zeile; das Ziel von „Termin ansehen“ auf der Übersicht.
- Sichtung am Telefon in der Test-Umgebung als Patientin mit sechs kommenden Terminen, ohne
  Termin, nur mit Wunsch, in der Lesefrist, als Begleitung, als Trainingskundin, im Flugmodus.

## 9 · Reihenfolge der Umsetzung

Je Schritt ein Pull Request über den Feature-Loop. Bausteine mit eigenem Knopf oder Titel liegen
nach der Ratsche in `src/components/ui/`. K1: Kein Schritt berührt einen Auslöser aus ADR-013
Punkt 9 – keine Migration, keine Policy, keine Projektion; der offene Wunsch kommt aus der
bestehenden Liste der Wünsche, die Rufnummer liegt seit N2 am Zugang. Die Regel am Server zur
Lesefrist (Frage 5, BEF-222) wäre Pfad A und gehört nicht dazu. Standardprüfungen und Bildstrecke
genügen.

1. **3a Bausteine:** Statuszeichen und Knöpfe ohne Bruch im Wort (BEF-220); Zeichen der Art;
   Terminzeile, Wunschzeile, „Wer und wo“, „Fragen zu diesem Termin?“; `Wahlflaechen`;
   `Wochenleiste` mit Spalten aus der Zahl der Tage und `ebene`; `HeroKarte` mit `ort` und `ziel`;
   die Texte (Tag in Worten, Rolle, Etikett, Wunsch in Worten) als reine Funktionen mit Tests;
   Ratsche und Kontraste.
2. **3b Liste:** Hero, Weitere Termine, Wünsche mit einem Satz, Diese Woche, Vergangene; leer, nur
   Wunsch, Begleitung, Training, Lesefrist, Einsicht; Skelett, Fehler, ohne Netz; Rechner
   zweispaltig.
3. **3c Seite des Termins:** `/p/termine/{id}` ohne `?art=` zeigt die Seite; alle Lagen; „Praxis
   anrufen“ (DR-133, BEF-221); „Termin ansehen“ auf der Übersicht führt hierher; Rechner.
4. **3d Abläufe:** Wunsch, Ändern und Absagen in zwei Schritten mit Tagen und Wahlflächen,
   Zusammenfassungen, Fenster am Rechner, ohne Netz.

3b kann nach 3a parallel zu 3c laufen; 3c und 3d ändern beide `Terminaenderung.tsx` und laufen
nacheinander.

## 10 · Beim Bauen nachzutragen

- `docs/decisions/ASSUMPTIONS.md`: je eine Annahme für die Festlegungen aus Abschnitt 0,
  insbesondere die Seite des Termins als Ziel jeder Zeile, die Rolle ohne Geschlecht, die Wünsche
  mit „oder“, „Praxis anrufen“ als Hauptknopf am vergangenen Termin und den Rechner zweispaltig;
  die fünf Fragen mit Jannes' Antworten.
- `docs/design/PLATTFORM.md`: Seitentyp Objekt für den Termin; Rechner zweispaltig auch für die
  Termine; Bausteine Terminzeile, Wahlflächen, „Wer und wo“; Statuszeichen und Knöpfe brechen nie
  im Wort.
- `docs/development/PLATTFORM-ANSICHTEN.md` (DSN-001) 4.1, Termine: die Seite des Termins; Ändern
  und Absagen beginnen dort.
- Prüfseite `tests/e2e/fixtures/plattform.html`: Fälle Besuch heute, nur Wunsch, Lesefrist,
  offener Wunsch auf der Seite, vergangen ohne Rufnummer, abgesagt.
- `docs/development/BEFUNDE.md`: DR-132 bis DR-136, BEF-220 und BEF-221 nach dem Bauen als
  erledigt; BEF-222 nach Jannes' Antwort auf Frage 5.
- Beim Bauen zu prüfen: Findet sich der offene Wunsch zum Termin immer über `appointment_id` in
  `platform_appointment_requests`? Rechnen „Heute“ und „Morgen“ mit dem Tag der Praxis wie die
  Pläne (`today`) oder mit dem Gerät wie `terminTitel`? Hat ein vergangener Termin
  `late_notice` immer `null`? Zeigt die Rufnummer, wie sie gespeichert ist?

Entwurf: Claude Design, 24.10.2026, Leinwand „Plattform – Termine“ mit 53 Zeichenflächen (Liste in
acht Lagen mit Variante A und B, Seite des Termins in fünf Lagen, Wunsch spielbar, Ändern und
Absagen je zwei Schritte mit und ohne kurze Frist, Rückmeldung und Endseite, Laden, Fehler, ohne
Netz, „Sehr groß“ und 200 %, Rechner, Bausteine; dazu Kopf, Reiterleiste und Rechnerkopf und auf
der Seite „Ist“ 14 Bilder vom 24.10.2026). Beispieldaten synthetisch.
