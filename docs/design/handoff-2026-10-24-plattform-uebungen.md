# Handoff: Plattform · Übungen (Briefing 2)

> **Entwurfsreferenz, kein Produktionscode.** Die Entwürfe liegen auf der Design-Leinwand „Plattform –
> Übungen“ (<https://claude.ai/artifact/LA686ZFMyxQYMJXD23CttT>, privat bei Jannes), gebaut mit dem
> „Own Motion Designsystem“ (<https://claude.ai/artifact/HmuUQAQau7HT48PkmvSFQK>) auf der
> Plattform-Sprache aus Briefing 1. Umgesetzt wird in den bestehenden Seiten und Bausteinen
> (`src/features/platform/Uebungen.tsx`, `Durchfuehrung.tsx`, `Uebungsinhalt.tsx`,
> `src/features/exercise-plans/Planblatt.tsx`) mit deren Namen, Props und Verhalten. Neu sind
> **Anordnung, Werte und Wortlaute** und fünf Bausteine. Routen, Rechte, Projektionen, die Ablage auf
> dem Gerät mit ihrer Feldliste (ADR-024 Punkt 5), die Warteschlange und das Urteil des Servers beim
> Eingang (Punkt 8) bleiben unverändert. Neue Daten braucht der Entwurf nicht (Abschnitt 0, Frage 1).

Stand 24.10.2026. Quellen: Design-Review Lauf 1 ([Bericht](review-2026-10/lauf-1-bericht.md),
Befunde DR-127 bis DR-130), BEF-196 und BEF-197,
[Briefing 2](review-2026-10/lauf-1-briefings/02-uebungen.md), [PLATTFORM.md](PLATTFORM.md) und der
[Handoff zu Briefing 1](handoff-2026-10-22-plattform-erster-eindruck.md), dessen Werte hier gelten,
soweit nichts anderes steht. DSN-001 (`docs/development/PLATTFORM-ANSICHTEN.md`) bleibt die Vorgabe
für Inhalt; Abweichungen stehen in Abschnitt 0.

## 0 · Entscheidungen

### Entschieden: alle vier wie empfohlen (Jannes, 24.10.2026)

Jannes hat nach dem Merge alle vier Fragen wie empfohlen entschieden; gebaut wird die Empfehlung.

1. **Dauer der Einheit.** Das Datenmodell kennt keine Dauer (`eigenerPlanSchema`). _Empfehlung:_ aus
   der Dosierung schätzen und als „etwa 10 Minuten“ zeigen – reine Anzeige, keine neue Spalte, kein
   Auslöser aus ADR-013 Punkt 9. Rechnung je Übung: Durchgänge × (Wiederholungen bis × 4 s oder
   Dauer, mal 2 bei „je Seite“) + (Durchgänge − 1) × Pause + 30 s Vorbereitung; Summe auf volle
   5 Minuten gerundet, mindestens 5. Fehlt einer Übung beides, entfällt die Angabe. _Alternative:_ ein
   Feld der Fachperson am Plan (Migration, Pfad A). _Entschieden:_ geschätzt wie empfohlen; die
   Leinwand zeigt beide Fassungen (Tweak „Dauer“).
2. **„Später weiter“ statt „Abbrechen“** im Kopf der Durchführung und beim Beenden. _Empfehlung:_
   ja. Die Haken bleiben, die Einheit des Tages geht später weiter („Weiter üben“); „Abbrechen“ klingt
   nach Verwerfen. DSN-001 Abschnitt 7 Nr. 7 („Abbrechen ist immer sichtbar“) bleibt erfüllt: Der
   Ausweg steht in jedem Schritt im Kopf. _Entschieden:_ „Später weiter“.
3. **Eigene Endseite** „Gespeichert“ bzw. „Auf diesem Gerät gespeichert“ statt der Rückkehr zum
   Reiter mit Rückmeldung. _Empfehlung:_ ja – ein ruhiger Abschluss, der sagt, wo die Einheit liegt
   und wer sie sieht, mit dem nächsten Übungstag, ohne Lob. _Entschieden:_ Endseite.
4. **Silbentrennung in Titeln unter 23rem.** Bei 200 % passen „Treppengeländer“ oder
   „Totalendoprothese“ in keiner zulässigen Größe in die Zeile; heute bricht das Wort ohne Strich
   (BEF-196). _Empfehlung:_ nur unter 23rem `hyphens: auto` mit `hyphenate-limit-chars: 12 5 5` für
   Plan- und Übungsnamen, Etiketten der Skala, Hinweise und Fließtext (Trennung an der Silbe mit
   Strich) – eine Ausnahme zu DR-114 nur für diese Breite. Personennamen, Anschriften, Knöpfe und
   Reiter bleiben ungetrennt. _Entschieden:_ die Ausnahme.

**Freigabe:** Mit dem Merge dieses Handoffs (#299, 24.10.2026) hat Jannes Schritt 2 der Umsetzung
freigegeben (Abschnitt 9).

### Festlegungen aus dem Entwurf (beim Bauen als Annahmen eintragen)

- **Heute zuerst.** Der Reiter beginnt mit der Hero-Karte „Ihre Übungen für heute“ als Vorschau der
  Einheit (DR-127, DR-129), dann der Plan. Sie ist die eine Markenfläche der Seite.
- **„Übungen beginnen“ statt „Jetzt üben“**, wie in der Hero-Karte der Übersicht (Briefing 1).
  „Weiter üben“ bei begonnener Einheit bleibt.
- **„Weiter üben“ öffnet die erste Übung mit offenem Durchgang**, nicht Übung 1; die Hero-Karte nennt
  sie („Weiter bei Übung 2: Becken anheben“). Grundlage ist `open_session.sets`.
- **Wochenleiste in einer Zeile** (DR-128, im Briefing verlangt): sieben Schalter als ein Segment
  ohne Abstand, je 47,9 × 56 bei 375 px. Mit 8 Abstand blieben je Ziel nur 41. Das weicht von
  PLATTFORM.md („Abstand zwischen Zielen ≥ 8“) und knapp von DSN-001 Abschnitt 7 Nr. 2 (48 × 48) ab;
  die Ziele bleiben über 44 wie im Briefing verlangt, die Fläche je Ziel ist größer als 48 × 48. Wie
  beim `Segment` gilt die Ausnahme nur innerhalb der Leiste. Unter 23rem wird sie ein Raster mit
  Abstand 8 und Zielen 48 × 48.
- **Pause als Ring** in der Zeile des nächsten Durchgangs: keine Zahl, die herunterzählt, keine
  Alarmfarbe, kein Ton (DSN-001 Abschnitt 7 Nr. 8). „Pause überspringen“ entfällt, die Zeile selbst
  bleibt tippbar.
- **Durchführung im Vollbild** ohne Reiterleiste, mit eigenem Kopf (Zurück, Später weiter, Balken)
  und festem Fuß mit genau einem Hauptknopf, 56 hoch (DR-130). „Vorige Übung“ wird das „Zurück“ im
  Kopf; der Erklärsatz unter dem Knopf entfällt.
- **Übertragungsstand im Fuß** erst nach dem ersten Haken: „Übertragen an die Praxis“ oder „Auf diesem
  Gerät, noch nicht übertragen“ (ADR-024 Punkt 8: Die Ansicht zeigt „auf dem Gerät“ oder
  „übertragen“, bis nichts mehr wartet).
- **Beenden mit einem Hauptknopf** („Einheit beenden“): „Zurück zu den Übungen“ ist das „Zurück“ im
  Kopf, „Abbrechen“ das „Später weiter“. Der Planname steht ganz da, ohne „Mehr“.
- **Ohne Einwilligung im Training** (`note_allowed` falsch) entfällt die Seite „Einheit beenden“: Der
  Knopf der letzten Übung heißt dann „Einheit beenden“ und speichert direkt.
- **Fehler und ohne Netz getrennt** (BEF-197): Meldet das Gerät keine Verbindung (`navigator.onLine`,
  ANN-015), spricht die Verbindungszeile; antwortet bei Verbindung der Server nicht, sagt eine
  `Statusmeldung`, dass die Praxis gerade nicht antwortet – geübt wird mit dem Plan vom Gerät.
- **Übungstage ohne Netz gesperrt** (gestrichelt, „Ändern geht wieder mit Verbindung.“) statt eines
  Tipps, der zurückspringt.
- **Rechner zweispaltig** für den Reiter: Plan links, Vorschau rechts, wie im Briefing verlangt –
  Abweichung von PLATTFORM.md („jede Seite einspaltig in `max-w-spalte` außer der Übersicht“).
- **Was man braucht** in der Vorschau: alle `equipment`-Einträge und Lasten (`load`) der Übungen des
  Plans, in Planreihenfolge, ohne Doppelte.
- **Übungstage auf dem Planblatt** nur auf der Plattform („Ihre Übungstage: …“); die Praxis kennt die
  Tage nicht (ANN-307).
- **Übung zum Nachlesen** bleibt ein Fenster (`Dialogfenster`) mit derselben Bühne wie die
  Durchführung, ohne Durchgänge.

## 1 · Geltung

**Gilt für** den Reiter „Übungen“ bzw. „Training“ (`/p/uebungen`), die Durchführung
(`/p/uebungen/einheit/{plan}`) mit „Einheit beenden“, das Fenster „Übung zum Nachlesen“ und das
Planblatt (`/p/uebungen/blatt/{plan}`). `Planblatt.tsx` ist derselbe Baustein wie in der Praxis; die
Praxis bekommt damit die neue Gestalt des Drucks (Kopf mit Marke, Dosierung in einer Zeile), ohne
Übungstage.

**Unverändert bleiben:** Routen und Rückwege, `Abfragezustand`, `platform_exercise_plans` und was er
liefert, die Ablage (`ablage.ts`, `ablageplanSchema`) und die Warteschlange mit `anstossen`, die
Abweisung durch den Server („Nicht übertragen: …“, `abweisungGelesen`), `useBildschirmWach`, die
Einwilligung im Training (`note_allowed`, ANN-306), die Einsicht der Praxis (`useNurLesen`, E-001),
`LokaleUebungen` hinter der Sitzungssperre, die Erfassungsgrößen (`erfassungsgroessen.ts`) mit ihren
Fragen und Enden, der Satz am freien Feld mit `Notrufnummer`, alle Farben, die Marke.

**Kein Scope:** Übersicht (Briefing 1 gilt), „Diese Woche“ unter Termine (Briefing 3), Nachrichten
(die Frage zum Plan führt wie heute dorthin), die Bibliothek der Praxis, Bilder und Videos der Übungen
(nur Entwurf, Abschnitt 5.3). Keine neue Funktion: Die Einheit kennt weiter Haken je Durchgang, die
drei Angaben und das freie Feld.

**Texte:** Sie-Form; neue Wortlaute sind _neu_ markiert. Nie: Workout, Drill, „Kunde“ allein, Lob,
Serie, Prozent. „Übung“ und „Variante“, Planname in Satzschreibung.

## 2 · Tokens

Keine neue Farbe, kein neuer Schatten. Es gelten die Rollen aus Briefing 1 (`text-plattform-titel`,
`text-hero`, `text-abschnitt`, Zeile und Text 18, `shadow-plattform` nur für die Hero-Karte). Neu in
`src/index.css`, verwendet nur unter `.plattform-schrift`:

| Rolle               | Token                      | Wert                                                  | Verwendung                                                       |
| ------------------- | -------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Hauptzahl           | `--text-hauptzahl` (_neu_) | 3rem (48) / 1 / 800 / −0.02em, `tabular-nums`         | Zahl der Bühne; ab 1024 px 3.5rem (56), unter 23rem 2.25rem (36) |
| Hauptzahl mit Video | (dieselbe Rolle)           | 2.5rem (40)                                           | neben der Einheit unter dem Video                                |
| Knopf groß          | `groesse="gross"` (_neu_)  | 3.5rem (56) hoch, 18/700                              | nur der Hauptknopf im Fuß der Durchführung                       |
| Ring                | (kein Token)               | 2.75rem (44), Spur `spur` 3, Füllung `accent` 5, rund | Pause in der Hakenzeile                                          |

Abstände aus der vorhandenen Skala: Durchführung innen `px-5` (20), Abschnitte `gap-6` (24), Bühne
innen 24 (ab 1024 px 32, unter 23rem 16), Hakenzeilen `gap-3` (12). Radien: Bühne und Video
`rounded-image` (16), Hakenzeile und Liste `rounded-card` (14), Wochenleiste und Skala
`rounded-button` (10), Marken `rounded-pill`. Alles in rem, damit „Groß“ und „Sehr groß“ mitwachsen.

## 3 · Bausteine

### Vorschau der Einheit (Hero-Karte, neu belegt)

Kein neuer Baustein: `HeroKarte` aus Briefing 1 mit zwei neuen Props, `angaben` (_neu_; Liste aus
Zeichen 22 in `salbei` und Text 18 in `surface`, Abstand 10, 8 unter dem Titel) und `leiseAktion`
(_neu_; Textlink 18/600 in `surface`, unterstrichen, 44 hoch, statt des Knopfs). Titel `h2`, Etikett
wie gehabt.

| Lage               | Etikett                               | Titel                    | Angaben                                                                                   | Aktion                           |
| ------------------ | ------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------- |
| heute Übungstag    | „Heute ist Übungstag“ (_neu_)         | „Ihre Übungen für heute“ | „3 Übungen · etwa 10 Minuten“ (_neu_), „Sie brauchen: …“ (_neu_)                          | „Übungen beginnen“               |
| anderer Tag        | „Nächster Übungstag: Montag“ (_neu_)  | „Ihre Übungen“ (_neu_)   | wie oben                                                                                  | „Übungen beginnen“               |
| keine Tage gewählt | „Ihr Plan“ (_neu_)                    | „Ihre Übungen“           | wie oben                                                                                  | „Übungen beginnen“               |
| heute begonnen     | „Heute begonnen“ (_neu_)              | „Ihre Übungen für heute“ | „Weiter bei Übung 2: {Name}“ (_neu_), Umfang, was man braucht                             | „Weiter üben“                    |
| heute geübt        | ✓ „Heute geübt“ (_neu_)               | „Ihre Übungen für heute“ | Satz „Gespeichert. {Name} sieht Ihre Einheit beim nächsten Termin.“ (_neu_); nächster Tag | leise „Noch einmal üben“ (_neu_) |
| ohne Netz          | wie die Lage                          | wie die Lage             | dazu „Geht auch ohne Netz.“ (besteht aus Briefing 1)                                      | wie die Lage                     |
| Plan vom Gerät     | „Ihr Plan auf diesem Gerät“ (_neu_)   | „Ihre Übungen“           | Umfang, was man braucht                                                                   | „Übungen beginnen“               |
| Lesefrist          | „Plan beendet“ (_neu_)                | „Ihr Plan zum Mitnehmen“ | „{Plan}, beendet am 15. Oktober. Als PDF bleibt er bei Ihnen.“ (_neu_)                    | „Plan als PDF sichern“ (_neu_)   |
| mehrere Pläne      | der erste Plan mit heutigem Übungstag | wie die Lage             | „{Plan} · 3 Übungen · …“                                                                  | wie die Lage                     |

Ohne Namen (N1) heißt es „Ihre Therapeut:in sieht …“. Der nächste Übungstag kommt aus `weekdays`
und dem heutigen Tag; „Heute geübt“ aus `recent_sessions` mit `finished` am heutigen Tag. Lässt
sich die Dauer nicht schätzen (Abschnitt 0, Frage 1), steht nur „3 Übungen“.

### Wochenleiste (_neu_, `src/features/platform/Wochenleiste.tsx`, ersetzt die Chips in `Uebungstage`)

- `role="group"` mit `aria-labelledby` auf „Ihre Übungstage“ (_neu_, `h3` 18/600, statt „Meine
  Übungstage“); sieben `button` mit `aria-pressed`, sichtbar „Mo“, vorgelesen „Montag“.
- Raster `repeat(7, minmax(0, 1fr))`, außen Linie 1 `line-strong`, Radius 10, `overflow: hidden`;
  zwischen den Zellen Linie 1 `line-strong`; Zelle mindestens 3.5rem (56) hoch.
- Gewählt: Fläche `accent`, Schrift `surface` 700, darüber Haken 16; sonst Fläche `surface`, `ink` 600. Fokus 3 px `ink` innen; Druck nur die Fläche (die Zellen hängen aneinander, kein Maßstab).
- Darunter `role="status"`, 18 Leise: „Sie üben an {n} Tagen. Empfohlen: {k}-mal pro Woche. Die Tage
  sehen nur Sie.“ (_neu_; bei n = 1 „an einem Tag“, bei k = 1 „einmal pro Woche“); ohne gewählten Tag
  „Wählen Sie die Tage, an denen Sie üben möchten. Empfohlen: …“ (_neu_).
- Ohne Netz: Zellen `disabled`, Linien gestrichelt, gewählt `accent-soft` mit `accent`, sonst
  `ink-muted`; Satz „Sie üben an {n} Tagen. Ändern geht wieder mit Verbindung.“ (_neu_).
- Unter 23rem: Raster mit 3 Spalten und Abstand 8; jede Zelle ein eigener Knopf, 48 hoch, Radius
  10, Linie `line-strong` bzw. `accent`.
- Speichern wie heute (`uebungstageSetzen`, sofort, der Reihe nach, bei Fehler zurück und
  `Statusmeldung`). Einsicht der Praxis und `can_choose_days` falsch: wie heute.

### Übungszeile (in `Uebungen.tsx`, Muster `ListRow`)

- Die ganze Zeile öffnet „Übung zum Nachlesen“; mindestens 80 hoch, innen 14/16, Liste mit Rahmen
  (Linie `line`, `rounded-card`), Trenner ab der zweiten Zeile.
- Vorn die Nummer im Kreis 40 (`accent-soft`, `accent` 18/700); Titel 18/600; darunter die Dosierung
  kurz in 18 Leise („3 Durchgänge · je 8 bis 12 Wiederholungen“, besteht); hinten Pfeil 24 Leise.
- Heute erledigt (alle Durchgänge der Übung in der heutigen Einheit gehakt): Kreis `accent` mit Haken
  in `surface`, unter der Dosierung „Heute erledigt“ (_neu_) 18/600 `accent`.
- Lesefrist: Kreis `surface-sunken` mit `ink`. „Sehr groß“: ohne Pfeil (wie die Aufgabenkarte in
  Briefing 1), Kreis 50. Unter 23rem steht die Nummer über dem Text, innen 12, ohne Pfeil.

### Bühne (_neu_, `src/features/platform/Buehne.tsx`)

- **Ohne Medium:** `section` mit `aria-labelledby` auf den Namen; Fläche `surface-inverse`,
  `rounded-image`, innen 24 (ab 1024 px 32, unter 23rem 16), Abstand 16, kein Schatten. Laufrad 200
  unten rechts um 70 nach außen (`accent`, `aria-hidden`; ab 1024 px 300 um 90; unter 23rem
  entfällt es). Name als `h1` der Durchführung bzw. `h2` im Fenster, `text-hero` in `surface`,
  `text-wrap: balance`. Darunter die Hauptzahl in `text-hauptzahl` (`surface`) und in einer eigenen
  Zeile die Einheit 18/600.
- **Hauptzahl** aus der Dosierung (`Dosis`): mit Wiederholungen „8 bis 12“ bzw. „10“ und
  „Wiederholungen je Durchgang“ (_neu_; mit `per_side` „Wiederholungen je Seite“ _neu_); mit Dauer
  „30“ und „Sekunden je Durchgang“ (_neu_; „Sekunde“ bei 1).
- **Mit Video der Praxis** (nur Entwurf, gebaut erst mit Medien): Video 4:3 in `rounded-image` an
  der Stelle der Bühne, eigenes `poster`, Abspielknopf 72 rund (`accent`, Dreieck `surface`,
  `aria-label` „Video abspielen: {Name}“ _neu_), darunter „Video abspielen · 0:45“ (_neu_); kein
  Autoplay, `playsinline`, ohne Ton oder mit Untertiteln. Name dann `text-plattform-titel` in `accent`
  unter dem Video, Hauptzahl 40 in `ink` mit der Einheit daneben. Speicherort und Auslieferung der
  Videos sind eine eigene Entscheidung (ADR-017) und kein Teil dieses Handoffs.

### Dosierungsmarken (geändert: `Dosierungskacheln` in `Uebungsinhalt.tsx`)

- Statt der Kacheln eine Liste `ul` mit `aria-label` „Dosierung“: Marken mindestens 40 hoch, innen
  6/14, `rounded-pill`, Fläche `surface-sunken` ohne Rand (Angaben, keine Knöpfe), 18/600, Zeichen 20
  in `accent`: „{n} Durchgänge“, „{s} Sekunden Pause“ (_neu_), „mit {Last}“ (_neu_; heute Kachel
  „Mit“). Die Hauptzahl steht in der Bühne, nicht als Marke.
- Darunter als Zeilen wie heute: „Jede Wiederholung {s} Sekunden halten.“, „{n}-mal am Tag.“, „Tempo:
  …“ und die Steigerungsregel der Fachperson (`double_progression`), Wortlaut unverändert.
- Unter 23rem: Marken als volle Zeilen mit `rounded-button`, innen 6/10.

### Hakenzeile und Pausenring (geändert, `Durchfuehrung.tsx`, ersetzt `Pause`)

- `button` mit `aria-pressed`, ganze Breite, mindestens 64 hoch, innen 10/14/10/20, Linie 2 `line`,
  `rounded-card`, 18/600, `flex-wrap: wrap`; das Wort „{n}. Durchgang“ mit `white-space: nowrap`.
- **Offen:** rechts Kreis 36 mit Linie 2 `line-strong`. **Erledigt:** Fläche `accent-soft`, Linie
  `accent`, rechts „erledigt“ (_neu_) 18/600 `accent` und Kreis 36 `accent` mit Haken `surface`.
- **In der Pause** zeigt die Zeile des nächsten Durchgangs unter dem Wort „Pause · {s} Sekunden“
  (_neu_) 18 Leise und rechts den Ring; sie wird 76 hoch. Tippen hakt ab und beendet die Pause.
- **Ring:** SVG 44, Spur `spur` 3, Füllung `accent` 5 mit runden Enden, beginnt oben und füllt sich
  linear über `rest_seconds`; danach ist die Zeile wieder offen. Keine Zahl, kein Ton, keine
  Vibration. Die bestehende Live-Region sagt einmal „Pause: {s} Sekunden.“, am Ende nichts.
- Nach dem letzten Durchgang einer Übung keine Pause (wie heute).

### Kopf der Durchführung (_neu_, Muster wie `GefuehrterAblauf`)

- Zeile 64, innen 8: links „Zurück“ (ab Übung 2; vorige Übung; Zeichen 24 und Wort, 48 hoch), rechts
  „Später weiter“ (_neu_; verlässt die Durchführung zur Herkunft, die Einheit bleibt offen), beide
  18/600 `accent`, Druck mit `surface-sunken`.
- Darunter, innen 0/20/12: Balken je Übung (4 hoch, Abstand 6, `accent` bis zur aktuellen, sonst
  `spur`, `aria-hidden`), daneben „Übung {n} von {m}“ (besteht) bzw. „Abschluss“ (_neu_) 18 Leise.
- Ohne Netz darunter `role="status"` auf `surface-sunken`, innen 10/20, mit dem WLAN-Zeichen:
  „Ohne Verbindung – Ihre Haken liegen auf diesem Gerät.“ (_neu_, Wortlaut aus dem Briefing).
- Steht fest oben (Linie `line` unten). Unter 23rem rollt er mit; „Übung {n} von {m}“ steht dann über
  den Balken.

### Fuß der Durchführung (_neu_)

- Fest unten, Fläche `surface`, Linie `line` oben, innen 12/20/16 und `env(safe-area-inset-bottom)`.
  Genau ein Hauptknopf `groesse="gross"` (56), volle Breite; ab 1024 px bis 360 breit, rechts in der
  Spalte.
- Darüber, sobald gehakt ist, `role="status"` 18: „Übertragen an die Praxis“ (_neu_) mit Kreis-Haken
  in Leise, oder „Auf diesem Gerät, noch nicht übertragen“ (_neu_) mit Telefon-Zeichen in `ink`. Der
  Wechsel zu „auf dem Gerät“ erst nach 1 s Warten, damit es beim normalen Übertragen nicht flackert.
  Mit gesperrter Anwendung bleibt der heutige Zusatz („… und Sie die Anwendung entsperrt haben“).
- Knopf: „Nächste Übung“ (besteht), bei der letzten Übung „Zum Abschluss“ (_neu_, statt „Fertig“),
  beim Beenden „Einheit beenden“ (besteht). Unter 23rem steht der Fuß am Ende des Inhalts.

### Endseite (_neu_, in `Durchfuehrung.tsx`, Muster „Alles bereit“ aus Briefing 1)

- Ohne Kopf; Inhalt senkrecht mittig, innen 48/24, Abstand 24. Kreis 96: übertragen
  `surface-inverse` mit Haken 44 in `surface`; auf dem Gerät `surface-sunken` mit Telefon 44 in
  `ink`. Titel `h1` in `text-gruss` und `accent`.
- Nach einer Linie `line` mit 16 Abstand der nächste Übungstag mit Kalender-Zeichen, wenn es einen
  gibt.
- Fuß wie oben mit Hauptknopf „Zur Übersicht“ (_neu_) und leise „Zu den Übungen“ (_neu_).

## 4 · Layout und Responsive-Verhalten

| Breite                      | Reiter                                                                                                | Durchführung                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| unter 23rem (200 %, 188 px) | Kopf mit „Menü“; Hero innen 16 ohne Laufrad, Titel 22; Wochenleiste als Raster; Übungszeile gestapelt | Kopf rollt mit, wird umgebrochen; Bühne innen 16, Titel 22, Hauptzahl 36; Marken als Zeilen; Fuß am Ende                             |
| unter 640 (Telefon, 375)    | Kopf 72, Reiterleiste unten; einspaltig, `px-5`, Abschnitte `gap-10`                                  | Vollbild ohne Reiterleiste; Kopf und Fuß fest, dazwischen rollt der Inhalt                                                           |
| 640 bis 1023                | wie am Telefon in `max-w-formular`                                                                    | wie am Telefon in `max-w-spalte`                                                                                                     |
| ab 1024 (Rechner, 1280)     | Navigation im Kopf; zwei Spalten: Plan links (`flex: 999 1 520px`), Vorschau rechts (bis 460)         | Kopf mit Balken in der Mitte (bis 960); Inhalt mittig in `max-w-spalte`; „So geht’s“ und Durchgänge nebeneinander ab Platz; Fuß fest |

- Reiter am Rechner: `flex-wrap` mit `row-reverse`, im Baum zuerst die Vorschau – am Telefon und für
  Vorlesesoftware steht sie oben, am Rechner rechts. Abstand 48; Titel 32; Hero innen 32, Knopf so
  breit wie sein Text. Wochenleiste höchstens 560 breit. PDF und Frage als Textlinks mit Zeichen in
  einer Reihe.
- „Sehr groß“ (125 %): alles in rem wächst; die Wochenleiste bleibt eine Reihe (die Breite bleibt
  335); Reiterleiste in zwei Reihen (Briefing 1); Hakenzeilen brechen den rechten Teil um, wenn nötig.

## 5 · Bildschirme

Beispieldaten synthetisch: Erika Beispiel (Behandlung, Anna Beispiel), Tina Training (Training),
„Heimprogramm Knie“ und der lange Plan der Prüfseite.

### 5.1 Reiter „Übungen“ / „Training“ (`Uebungen.tsx`)

Von oben: Seitentitel „Übungen“ bzw. „Training“ (`h1`, 28, Rechner 32) · Vorschau der Einheit
(Abschnitt 3) · je Plan ein Abschnitt. Die heutige `Rueckmeldung` „Ihre Einheit ist gespeichert.“
entfällt mit der Endseite (Frage 3); der Wartehinweis bleibt als `Statusmeldung` über der Vorschau.

- **Plan** (`section`, `h2` 22/700 mit dem Plannamen, `text-wrap: pretty`): darunter 18 Leise „Bis 29. Oktober · Stand 17. September“ (_neu_ als Wortform; bei Beginn in der Zukunft „Ab …“, beendet
  „Beendet am …“). Die Häufigkeit steht im Satz der Wochenleiste; ohne Wochenleiste (Einsicht,
  `can_choose_days` falsch) bleibt sie in dieser Zeile („… · 3-mal pro Woche“).
- **Ihre Übungstage** (Abschnitt 3), dann **Die Übungen** (`h3` 18/600 _neu_) mit Übungszeilen.
- **Zum Plan:** Liste mit Rahmen, zwei Zeilen je 60 hoch mit Zeichen 24 `accent` und Pfeil: „Plan als
  PDF“ (besteht) und „Frage zu diesem Plan“ (_neu_, statt „Frage zu diesem Plan stellen →“); die Frage
  nur bei `status` „assigned“ und nicht in der Einsicht, wie heute.
- **Mehrere Pläne:** Der Plan der Vorschau zuerst; jeder weitere Plan als eigener Abschnitt mit Linie
  oben und 40 Abstand, mit Wochenleiste, Übungen, Zweitknopf „Übungen beginnen“ und „Zum Plan“.
- **Lesefrist** (`status` „ended“): über der Vorschau `Statusmeldung` Warnung „Ihre Behandlung ist
  beendet. Sie können hier noch bis {Datum} lesen.“ (Wortlaut der Übersicht aus Briefing 1); Plan mit
  „Beendet am 15. Oktober · zum Nachlesen“ (_neu_), nur die Übungen. Der heutige Satz „Dieser Plan
  ist beendet …“ entfällt, die Vorschau sagt es.
- **Kein Plan:** Leerzustand mit Markenform (Briefing 1) in einer Karte: „Noch kein Plan“ und „{Name}
  stellt Ihnen hier Übungen zusammen.“ (_neu_ mit N1; ohne Namen besteht „Ihre Therapeut:in stellt
  Ihnen hier Übungen zusammen.“); im Training „Ihre Trainingsbetreuung stellt Ihnen hier Ihren Plan
  zusammen.“ (besteht).
- **Training:** Titel „Training“, Etikett nach Lage, Titel der Vorschau „Ihr Plan für zu Hause“
  (_neu_, wie in der Übersicht aus Briefing 1); sonst gleich.

### 5.2 Übung zum Nachlesen (`Uebungsfenster` in `Uebungen.tsx`)

Fenster über die ganze Höhe: Kopf 64 mit „Übung {n} von {m}“ (_neu_) 18 Leise links und „Schließen“
mit Kreuz rechts; Inhalt wie die Durchführung (Bühne, Marken, Regel, „So geht’s“ als `h3`, „Sie
brauchen“, „Hinweis“), ohne Durchgänge; am Ende Zweitknopf „Schließen“ (besteht). Der Fokus steht am
Anfang wie heute.

### 5.3 Durchführung (`Durchfuehrung.tsx`)

Kopf (Abschnitt 3) · Inhalt, innen 20/20/32, Abstand 24: Bühne · Marken · Steigerungsregel (wenn
eingetragen) · „So geht’s“ (`h2` 22/700, Schritte mit Nummer im Kreis 32 `accent-soft`, Text 18,
Abstand 14; mit einem einzigen Schritt als Absatz) · „Sie brauchen:“ und „Hinweis:“ mit Zeichen 22
(besteht) · „Durchgänge“ (`h2` _neu_) mit Hakenzeilen · Fuß.

- Die Reiterleiste ist auf dieser Route aus (PLATTFORM.md, Seitentyp Durchführung).
- „Weiter üben“ setzt auf die erste Übung mit offenem Durchgang (Abschnitt 0).
- Beim Wechsel der Übung rollt der Inhalt nach oben; der Fokus geht auf den Namen (`h1`, `tabIndex`
  −1).
- Abweisungen des Servers wie heute als `Statusmeldung` Fehler unter dem Kopf.
- **Mit Video** (nur Entwurf): siehe Bühne; alles darunter bleibt gleich.

### 5.4 Einheit beenden (`Abschluss` in `Durchfuehrung.tsx`)

Kopf mit „Zurück“ (zur letzten Übung) und „Später weiter“, Balken voll, „Abschluss“ · `h1` „Einheit
beenden“ (besteht) · darunter 18 Leise „{Plan} · Samstag, 24. Oktober“ (_neu_; der ganze Planname,
kein „Mehr“) · Abschnitt „Wie war es heute?“ (_neu_, `h2`) mit „Alle Angaben sind freiwillig.“ (_neu_)
· die drei Angaben aus `groessenImTakt('session')` als `Angabefeld` (Fragen und Enden unverändert, zwei
Reihen 0 bis 5 und 6 bis 10, Ziele 48, nichts vorgewählt, „Angabe entfernen“) · das freie Feld „Das
war schwierig, weil … (freiwillig)“ mit dem bestehenden Satz, mit Namen „{Name} sieht diesen Satz. Er
wird nicht laufend gelesen – bei akuten Beschwerden: 112 oder 116117.“ · Fuß „Einheit beenden“.

- Noch kein Haken: nur `Statusmeldung` „Sie haben noch keinen Durchgang abgehakt. Ohne Haken gibt es
  nichts zu speichern.“ (besteht); Fuß „Zurück zu den Übungen“ (besteht) als Hauptknopf.
- Ohne Einwilligung im Training: Seite entfällt (Abschnitt 0).
- Fehler beim Speichern wie heute als `Statusmeldung` über dem Fuß; „Wird gespeichert …“ im Knopf.

### 5.5 Endseite

- **Übertragen:** „Gespeichert“ (_neu_) · „Ihre Einheit vom Samstag, 24. Oktober ist bei der Praxis.“
  (_neu_) · Leise „{Name} sieht sie beim nächsten Termin.“ (_neu_; ohne Namen „Ihre Therapeut:in …“,
  im Training „Ihre Trainingsbetreuung …“) · „Nächster Übungstag: Montag, 26. Oktober“ (_neu_).
- **Auf dem Gerät:** Verbindungszeile oben, wenn ohne Netz · „Auf diesem Gerät gespeichert“ (_neu_) ·
  „Ihre Einheit ist noch nicht bei der Praxis. Sie wird übertragen, sobald Verbindung besteht.“
  (_neu_, fasst die heutige Warnung zusammen) · Leise „Bis dahin liegt sie nur auf diesem Telefon.“
  (_neu_) · nächster Übungstag.
- Welche Fassung, entscheidet wie heute `Beendetziel` (`gespeichert=1` oder `gespeichert=geraet`).

### 5.6 Ohne Verbindung, Praxis antwortet nicht, Fehler, Laden

- **Ohne Netz, Seite war geladen:** Verbindungszeile aus Briefing 1 („Keine Verbindung. Sie sehen den
  Stand von 08:12 Uhr.“); alles bleibt, die Vorschau sagt „Geht auch ohne Netz.“, die Wochenleiste
  ist gesperrt.
- **Durchführung ohne Netz:** Zeile im Kopf (Abschnitt 3), Fuß „Auf diesem Gerät, noch nicht
  übertragen“; sonst gleich.
- **Plan vom Gerät** (heute `OhneVerbindung`, aus `abgelegteZugaenge`): Die Ablage trägt nur die
  Felder der Durchführung, also Vorschau (Etikett „Ihr Plan auf diesem Gerät“) und Übungen, keine
  Wochenleiste, keine Laufzeit, kein PDF. Unter dem Plannamen 18 Leise: bei Verbindung ohne Antwort
  „Übungstage und Laufzeit sehen Sie wieder, sobald die Praxis antwortet.“ (_neu_), ohne Netz „…
  wieder mit Verbindung.“ (_neu_).
- **Praxis antwortet nicht** (Verbindung, Server-Fehler, Plan auf dem Gerät, BEF-197): unter dem Titel
  `Statusmeldung` Warnung „Die Praxis antwortet gerade nicht. Üben können Sie trotzdem – mit Ihrem Plan
  vom 24. Oktober, 08:12 Uhr.“ (_neu_; Zeit des letzten Abrufs, sonst ohne Zeit) und leise „Erneut
  versuchen“ (besteht). „Ohne Verbindung …“ steht hier nicht mehr.
- **Fehler, kein Plan auf dem Gerät:** `ErrorState` „Ihre Übungen lassen sich gerade nicht laden.“ /
  „Prüfen Sie die Verbindung oder versuchen Sie es gleich noch einmal.“ (_neu_, wie die Übersicht) mit
  „Erneut versuchen“.
- **Laden:** `Skelett` in der echten Form – Seitentitel steht, Hero 300 hoch, Plan mit zwei Zeilen,
  Leiste 56 und Liste; `aria-busy` und „Übungen werden geladen“ (_neu_) nur für Vorlesesoftware.
  Durchführung: „Später weiter“ steht, Bühne 200, Marken, Zeilen, Fuß als Fläche; „Übung wird
  geladen“ (_neu_).

### 5.7 Planblatt (`Planblatt.tsx`, `PlanblattPlattform`)

- **Bildschirm (Telefon):** Kopf und Reiterleiste · „Zurück“ (besteht) · `h1` „Plan als PDF“ (_neu_,
  sichtbar statt nur für Vorlesesoftware) · „Drucken Sie den Plan aus oder sichern Sie ihn als PDF.
  Die Datei bleibt auf Ihrem Gerät.“ (_neu_, fasst das heutige Kleingedruckte zusammen) · Hauptknopf
  „Drucken oder als PDF sichern“ (besteht) · darunter die Vorschau als Blatt: Fläche `surface-sunken`
  innen 12, darin das Blatt (Linie `line`, Radius 4, innen 20/16, Schrift 18).
- **Rechner:** dieselbe Ordnung in `max-w-spalte`, Titel 32, Knopf rechts neben Titel und Satz; Blatt
  innen 48.
- **Blatt und Druck (A4, schwarzweiß):** Kopf mit Wortmarke (farbige Datei, 40; im Druck dunkel
  genug) links, rechts „Ihr Übungsplan“ 700 und „Stand {Datum}“; Linie 1.5 `ink` · Planname 28/800 ·
  „Gültig vom 17. September bis 29. Oktober 2026 · 3-mal pro Woche“ · auf der Plattform „Ihre
  Übungstage: Montag, Mittwoch, Samstag“ (_neu_) · je Übung ein Block mit Linie oben: Nummer im Kreis
  32 mit Linie 1.5 `ink`, Name 20/700, Dosierung in einer Zeile 700 („3 Durchgänge mit je 8 bis 12
  Wiederholungen · 60 Sekunden Pause · mit Rucksack 3 kg“, _neu_ als Zeile), Steigerungsregel,
  nummerierte Schritte, „Sie brauchen:“, „Hinweis:“ · Fuß mit Linie: „Fragen zu den Übungen? Sprechen
  Sie uns beim nächsten Termin an.“ (besteht) und klein die Praxis.
- Druck: Text 16 (12 pt), Kleines 14, Linien ≥ 1, nur Tinte und Grau; `break-inside: avoid` je
  Übung; Kopf, Knöpfe und Kleingedrucktes der Seite `nicht-drucken` wie heute.

### 5.8 Rechner (1280)

- **Reiter:** wie Abschnitt 4; alle Zustände wie am Telefon (Skelett in zwei Spalten, Leerzustand
  und Fehler in `max-w-spalte`, ohne Netz mit Verbindungszeile unter dem Kopf).
- **Durchführung:** Kopf über die ganze Breite (innen bis 960: Zurück, Balken mit „Übung {n} von
  {m}“, Später weiter); Inhalt in `max-w-spalte`, Bühne innen 32 mit Titel 32 und Hauptzahl 56; „So
  geht’s“ mit „Sie brauchen“/„Hinweis“ links und „Durchgänge“ rechts, sobald beide Platz haben (je
  mindestens 340 und 260); Fuß fest mit Stand links und Hauptknopf 56 rechts.

## 6 · Barrierefreiheit

- **Kontraste** (in `src/lib/kontrast.test.ts` ergänzen, soweit neu): `surface` auf `accent` 11,3:1
  (gewählte Tage, Hauptknopf); `accent` auf `accent-soft` 9,6:1 (Nummern, „erledigt“-Fläche);
  `ink` auf `surface-sunken` etwa 16:1 (Marken); `accent` auf `surface-sunken` etwa 10:1 (Zeichen
  der Marken);
  `ink-muted` auf `surface` 6,3:1; `salbei` auf `surface-inverse` 5,9:1 (Etikett, Zeichen der
  Angaben); `line-strong` gegen `surface` 4,2:1 (Leiste, Kreise); `accent` gegen `surface` für den
  Ring (≥ 3:1, Grafik mit Bedeutung).
- **Ziele:** Knöpfe 48, Hauptknopf der Durchführung 56; Hakenzeilen ≥ 64 (Pause 76); Wochenleiste
  47,9 × 56 (Abschnitt 0), unter 23rem 48 × 48 mit Abstand 8; Übungszeilen ≥ 80, Zeilen „Zum Plan“
  60; „Zurück“, „Später weiter“, „Schließen“ 48; Skala 48; Textlinks 44.
- **Vorlesesoftware:** Seitentitel `h1`; Vorschau `section` mit `h2`; Wochenleiste `role="group"` mit
  Namen, Knöpfe mit `aria-pressed` und vollem Tagesnamen, Satz darunter `role="status"`;
  Hakenzeilen `aria-pressed`, „erledigt“ sichtbar als Wort; Ring, Balken, Laufrad und Zeichen
  `aria-hidden`; Pause einmal angesagt; Übertragungsstand und Zeile ohne Netz `role="status"`;
  „Übung {n} von {m}“ als Text; Skelett mit `aria-busy` und Text; Video mit Namen am Knopf.
- **Fokus:** sichtbarer Ring wie heute; in der Wochenleiste 3 px `ink` innen; auf Tiefgrün `surface`.
  Beim Übungswechsel Fokus auf den Namen.
- **Trennung:** `hyphens: manual` überall; unter 23rem die Ausnahme aus Frage 4. Kein Wort bricht ohne
  Strich (BEF-196); dafür sorgen der freie Titel (kein „Abbrechen“ mehr daneben), `text-hero` auf der
  Bühne und `white-space: nowrap` an „{n}. Durchgang“.
- **200 % und „Sehr groß“:** kein waagerechtes Rollen; Bühne, Marken, Hakenzeilen und Skala brechen
  um; Fuß unter 23rem am Ende.
- **Farbe nie allein:** gewählt = Fläche, Haken und Fettung; erledigt = Fläche, Linie, Haken und Wort;
  gesperrt = gestrichelt und Satz.

## 7 · Bewegung

| Was                               | Dauer                                 | Kurve                        | Bei „Bewegung reduzieren“                    |
| --------------------------------- | ------------------------------------- | ---------------------------- | -------------------------------------------- |
| Druck an Knopf, Zeile, Hakenzeile | 120 ms, Maßstab 0,98 und Fläche       | `cubic-bezier(.2,.7,.2,1)`   | nur die Fläche                               |
| Druck an der Wochenleiste         | 120 ms, nur Fläche                    | `cubic-bezier(.2,.7,.2,1)`   | nur die Fläche                               |
| Haken setzen (Kreis füllt sich)   | 160 ms                                | `cubic-bezier(.3,1.35,.5,1)` | sofort                                       |
| Pausenring                        | `rest_seconds`, linear                | linear                       | gestrichelter Ring ohne Lauf, Ende als Farbe |
| Wechsel der Übung                 | 200 ms Überblendung, Inhalt nach oben | `cubic-bezier(.2,.8,.2,1)`   | ohne                                         |
| Skelett                           | Puls 1,6 s, Deckkraft 1 bis 0,55      | ease-in-out                  | ohne Puls                                    |

Kein Markenmoment in der Durchführung und auf der Endseite; das Laufrad steht still.

## 8 · Prüfung

- Bildstrecke vorher und nachher: `pnpm bildstrecke --nur=plattform` mit Reiter, Durchführung,
  Pause, Beenden, Endseite, Planblatt bei 375 und 1280 px, dazu 188 px (200 %) und „Sehr groß“ für
  Reiter und Durchführung, langer Plan- und Übungsname (Prüfseite `plattform-uebungen.html`).
- `tests/e2e/plattform-barrierefreiheit.spec.ts`: axe auf allen neuen Zuständen; bei 188 px und
  „Sehr groß“ kein waagerechtes Rollen; die Durchführung ohne Reiterleiste; genau ein Hauptknopf je
  Ansicht. Ob ein Wort ohne Strich bricht (BEF-196), zeigt die Sichtung der Bildstrecke bei 188 px.
- `src/designsystem.test.ts` (Ratsche): unter `.plattform-schrift` keine Schrift unter 18 px, als
  Schatten nur `shadow-plattform`, keine Versalien-Etiketten.
- `src/lib/kontrast.test.ts`: die Paare aus Abschnitt 6.
- Komponententests: Wochenleiste (Satz für 0, 1 und n Tage, gesperrt ohne Netz, Speichern und
  Zurücknehmen), Lage der Vorschau (heute, anderer Tag, begonnen, geübt, Lesefrist, Plan vom Gerät),
  „Weiter üben“ an der ersten offenen Übung, Pause startet nach einem Haken und nicht nach dem letzten,
  Übertragungsstand (übertragen, auf dem Gerät, verzögert), Beenden mit einem Hauptknopf und ohne
  Seite bei `note_allowed` falsch, Endseite je `Beendetziel`, Trennung von Netzfehler und
  Serverfehler (BEF-197).
- Sichtung am Telefon in der Test-Umgebung als Patientin mit Plan, mit langem Plan, ohne Plan und
  in der Lesefrist, als Trainingskundin mit und ohne Einwilligung, im Flugmodus.

## 9 · Reihenfolge der Umsetzung

Je Schritt ein Pull Request über den Feature-Loop. K1: Kein Schritt berührt einen Auslöser aus
ADR-013 Punkt 9 – die Dauer wird geschätzt, nicht gespeichert (Frage 1), und Videos kommen erst mit
einem eigenen Auftrag. Standardprüfungen und Bildstrecke genügen.

1. **2a Bausteine:** `--text-hauptzahl`, Knopf `gross`, Bühne, Dosierungsmarken, Hakenzeile mit
   Pausenring, Kopf und Fuß der Durchführung, Wochenleiste, Endseite; Schätzung der Dauer als reine
   Funktion mit Tests (Frage 1); Trennung unter 23rem (Frage 4); Ratsche und Kontraste.
2. **2b Durchführung:** Vollbild ohne Reiterleiste, Kopf und Fuß, Übertragungsstand, Pause, Wechsel
   der Übung, „Weiter üben“ an der offenen Übung, Beenden mit einem Hauptknopf, Endseite, ohne Netz.
3. **2c Reiter:** Vorschau in allen Lagen mit Dauer („3 Übungen · etwa 10 Minuten“, ebenso die
   Übungskarte der Übersicht), Plan mit Wochenleiste, Übungszeilen, „Zum Plan“, mehrere Pläne,
   Lesefrist, kein Plan, Training; Skelett, Fehler, Plan vom Gerät, „Praxis antwortet nicht“
   (BEF-197); Fenster „Übung zum Nachlesen“; Rechner zweispaltig. 2b und 2c können nach 2a parallel
   laufen.
4. **2d Planblatt:** Bildschirm am Telefon und Rechner, Druck A4; die Praxis bekommt den Druck mit.
5. **Später, mit Medien:** Video in Bühne und Fenster nach Abschnitt 3 – eigener Auftrag mit
   Entscheidung zu Speicherort und Auslieferung (ADR-017).

## 10 · Beim Bauen nachzutragen

- `docs/decisions/ASSUMPTIONS.md`: je eine Annahme für die Festlegungen aus Abschnitt 0,
  insbesondere die Wochenleiste ohne Abstand, die Pause als Ring, die getrennten Meldungen für Netz
  und Server und den Rechner zweispaltig; die vier Fragen als „entschieden (Jannes)“ vom 24.10.2026:
  geschätzte Dauer, „Später weiter“, Endseite, Trennung unter 23rem.
- `docs/design/PLATTFORM.md`: Seitentyp Durchführung mit Kopf (Zurück, Später weiter, Balken) und
  Fuß (ein Hauptknopf 56, Stand); Rechner zweispaltig für den Reiter „Übungen“; Wochenleiste als
  Segment; Trennung unter 23rem (nach Frage 4); Bausteine Bühne, Wochenleiste, Hakenzeile.
- `docs/development/PLATTFORM-ANSICHTEN.md` (DSN-001) 4.1, Übungen: „Video oder Bild“ wird „Bühne;
  Video der Praxis, wenn vorhanden“; Ende einer Einheit mit eigener Seite.
- Prüfseite `tests/e2e/fixtures/plattform-uebungen.html`: Fälle für Lesefrist, mehrere Pläne, Plan
  vom Gerät und Serverfehler ergänzen.
- `docs/development/BEFUNDE.md`: DR-127 bis DR-130, BEF-196 und BEF-197 nach dem Bauen als erledigt;
  die Nummern trägt Jannes nach Wunsch selbst ein.
- Beim Bauen zu prüfen: Reicht `open_session.sets`, um „Weiter bei Übung {n}“ und „Heute erledigt“ zu
  bestimmen? Zeigt `Schrittliste` einen einzigen Schritt als Absatz? Bleibt `useBildschirmWach` auf
  der Endseite aus? Druckt Safari am iPhone `break-inside: avoid`?

Entwurf: Claude Design, 24.10.2026, Leinwand „Plattform – Übungen“ mit 41 Zeichenflächen (Reiter in
sieben Lagen, Übung zum Nachlesen mit und ohne Video, Durchführung spielbar und als ganze Seite, mit
Pause, langem Namen und Video, Beenden, Endseiten, ohne Netz, Praxis antwortet nicht, Fehler, Laden,
„Sehr groß“ und 200 %, Planblatt in drei Fassungen, Rechner, Bausteine). Beispieldaten synthetisch.
