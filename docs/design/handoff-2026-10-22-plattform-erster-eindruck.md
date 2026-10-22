# Handoff: Plattform · Erster Eindruck und Plattform-Sprache (Briefing 1)

> **Entwurfsreferenz, kein Produktionscode.** Die Entwürfe liegen auf der Design-Leinwand „Plattform –
> Erster Eindruck“ (<https://claude.ai/artifact/Bxmw59n2BHREsQPjrfUwYJ>, privat bei Jannes), gebaut
> mit dem „Own Motion Designsystem“ (<https://claude.ai/artifact/HmuUQAQau7HT48PkmvSFQK>), das die
> Werte aus `src/index.css` und 23 Bausteine aus `src/components/ui` trägt. Umgesetzt wird in den
> bestehenden Bausteinen und Plattformseiten (`src/features/platform`, `src/features/auth`,
> `src/app`), mit deren Namen, Props und Verhalten. Neu sind **Werte, Anordnung und Wortlaute**, eine
> **Schriftskala der Plattform** und sechs Bausteine. Routen, Rechte, Projektionen, Lesepfade, Audit
> und die Sitzungssperre bleiben unverändert; Name und Rufnummer kommen als eigener Datenschritt
> (Abschnitt 9).

Stand 22.10.2026. Grundlage: Design-Review Lauf 1 ([Bericht](review-2026-10/lauf-1-bericht.md),
Befunde DR-101 bis DR-126 und DR-154 bis DR-160), [Briefing 1](review-2026-10/lauf-1-briefings/01-erster-eindruck.md)
und die [Reihenfolge der Umsetzung](review-2026-10/lauf-1-umsetzung.md). Gilt für die Wege unter
`/p`, für `/einladung` und für die Türseiten in ihrer Plattform-Fassung; die Praxis-App ändert sich
nicht. DSN-001 (`docs/development/PLATTFORM-ANSICHTEN.md`) bleibt die Vorgabe für Inhalt und
Reihenfolge; wo dieser Handoff davon abweicht, steht es in Abschnitt 0.

## 0 · Entscheidungen

### Von Jannes (22.10.2026), alle wie empfohlen

1. **Markenmoment B.** Auf Plattformwegen (`/p…`, `/einladung`) läuft kein Startbild. Die Seite steht
   sofort; beim ersten Erscheinen der Übersicht je Tab kommen die Inhalte gestaffelt, das Laufrad der
   Hero-Karte dreht eine Achteldrehung (Abschnitt 7). Das Startbild „Speiche wird O“ bleibt auf der
   Anmeldeseite und in der Praxis-App. Damit entfällt „Startbild-Landeplatz im Plattformkopf“ aus
   Schritt 0b (DR-116).
2. **Reiterleiste in drei Stufen.** Eine Reihe, solange die vier Wörter passen; sonst zwei Reihen mit
   dem Zeichen neben dem Wort („Groß“, „Sehr groß“); unter 23rem Fensterbreite (200 % Zoom am Telefon)
   der Knopf „Menü“ im Kopf statt der Leiste (DR-112). Variante „nur Zeichen“ verworfen.
3. **Daten.** Name mit Initialen (N1) und die Rufnummer der Praxis (N2) kommen auf die Plattform, als
   eigener Schritt nach Pfad A (Abschnitt 9). Das Foto der behandelnden Person (N3) erst später; bis
   dahin Initialen im `Personenbild`.
4. **Notfallhinweis** nur noch über dem Eingabefeld für Nachrichten (Notfallkarte, Abschnitt 3), nicht
   mehr auf der Übersicht (DR-123). Der Wortlaut bleibt.

**Freigabe:** Mit dem Merge dieses Handoffs gibt Jannes Schritt 1 der Umsetzung frei.

### Festlegungen aus dem Entwurf (beim Bauen als Annahmen eintragen)

- **Eine Hauptsache.** Die Übersicht zeigt oben genau eine Hero-Karte „Als Nächstes“. Sie nimmt die
  erste offene Aufgabe in der Reihenfolge von DSN-001 4.1: Befundbogen, Check-in fällig, Übungen für
  heute. Gibt es keine, nimmt sie den nächsten Termin; in der Lesefrist „Unterlagen sichern“. Antwort
  der Praxis und offene Rechnung werden nie Hauptsache (keine Dringlichkeit aus Geld), sie stehen unter
  „Neu für Sie“. **Abweichung von DSN-001 4.1:** Der nächste Termin steht nicht an Platz 2 der Liste,
  sondern als eigener Abschnitt „Nächster Besuch“ unter der Hauptsache.
- **Türen sprechen von „Zugang“**, nie von „Konto“ oder „Sitzung“.
- **Einrichtung fertig** ist kein eigener Bildschirm: Nach „PIN speichern“ beginnt der Einstieg;
  „Willkommen“ zeigt einmal oben „Anmeldung eingerichtet“.
- **Tastatur offen** auf Türseiten: Foto und Schritte treten zurück; Titel, Feld und Hauptknopf
  bleiben über der Tastatur.
- **Unter 23rem** (200 %) entfallen Fotos auf Türseiten und im Einstieg, und der Fuß geführter Abläufe
  steht am Ende des Inhalts statt fest unten.
- **„Sehr groß“:** Die Aufgabenkarte verliert den Pfeil rechts, damit der Text Platz hat.

## 1 · Geltung

**Unverändert bleiben:** Routen und Rückwege, `Abfragezustand`, Projektionen und was eine Rolle sehen
darf (eine Begleitung ohne Einwilligung sieht keine Rechnung), die Sitzungssperre mit ihren Fristen
(ADR-025), der Einlöseweg der Einladung (der Code verlässt die Adresszeile; unbekannte, abgelaufene
und benutzte Codes bekommen dieselbe Auskunft), die Einwilligungstexte (`einwilligungstexte.ts`), der
Notfallsatz (`NOTFALL`, `Notfallsatz.tsx`), der Hinweis zum Ausfallhonorar, die Schriftgrößen-Wahl
(`schriftgroesse.ts`: Normal, Groß 112,5 %, Sehr groß 125 % an `html[data-schrift]`), alle Farben aus
`src/index.css`, die Marke aus `marke/`.

**Texte:** Sie-Form wie im Repo; neue Wortlaute sind markiert (_neu_). Feste Wortlaute bleiben
inhaltlich: Notfallhinweis, Ausfallhonorar, „Danke. Ihre Therapeut:in sieht Ihre Angaben beim nächsten
Termin.“ (mit Namen statt Doppelpunkt, wo er bekannt ist). Auf der Plattform nie: Sitzung,
Projektion, Instrument, Mein Konto, Kennwort (außer „kein Kennwort“), Passwort, „Version“ oder
„DIGOTOR“ im Titel, Workout, Drill, „Kunde“ allein, PT, Mein Tag.

**Kein Scope:** Übungen, Termine, Nachrichten, Selbstauskunft, Unterlagen und Ich (Briefings 2 bis 7),
außer was das Gerüst für alle Seiten ändert (Schrift, Kopf, Reiterleiste, Tab-Titel). Die Praxis-App,
ihr Rahmen und ihr Startbild. Das Foto der behandelnden Person (N3).

## 2 · Tokens

Keine neue Farbe. Neu in `src/index.css` (`@theme`, mit `--…--line-height`, `--…--letter-spacing`
und `--…--font-weight` in Tailwinds Schreibweise), verwendet nur unter `.plattform-schrift`:

| Rolle                 | Token                            | Wert                                                              | Verwendung                                                                                    |
| --------------------- | -------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Gruß                  | `--text-gruss` (_neu_)           | 2.125rem (34) / 1.1 / 800 / −0.03em                               | Gruß der Übersicht, Titel der Einladung, „Willkommen“, „Alles bereit“; ab 1024 px 2.5rem (40) |
| Seitentitel Plattform | `--text-plattform-titel` (_neu_) | 1.75rem (28) / 1.1 / 800 / −0.03em                                | Titel jeder Plattform- und Türseite; unter 23rem auch der Gruß; ab 1024 px 2rem (32)          |
| Hero                  | `--text-hero` (_neu_)            | 1.625rem (26) / 1.15 / 800 / −0.02em                              | Titel der Hero-Karte; unter 23rem 1.375rem (22); ab 1024 px 2rem (32)                         |
| Abschnitt             | `--text-abschnitt` (_neu_)       | 1.375rem (22) / 1.25 / 700 / −0.01em                              | „Heute“, „Nächster Besuch“, Titel einer Einwilligung, Datum in der Besuchskarte               |
| Zeilentitel           | `--text-liste` (besteht)         | unter `.plattform-schrift` 1.125rem (18) / 1.4 / 600              | Titel in Karten und Zeilen                                                                    |
| Text und Leise        | `--text-base` (besteht)          | unter `.plattform-schrift` 1.125rem (18) / 1.5 / 400              | Fließtext; Leise in `ink-muted`                                                               |
| Tiefe                 | `--shadow-plattform` (_neu_)     | `0 1px 2px rgb(20 24 27 / 0.06), 0 6px 20px rgb(20 24 27 / 0.08)` | nur antippbare Karten: Hero-Karte, Aufgabenkarte, Besuchskarte. Listen bleiben Linie (DR-157) |

Abstände kommen aus der vorhandenen Skala: `gap-10` (40) zwischen Abschnitten am Telefon, `gap-12`
(48) ab 1024 px, `px-5` (20) Seitenrand, `p-6` (24) in der Hero-Karte, `gap-4` (16) von Titel zu
Inhalt, Türseiten `px-6` (24). Radien: Hero-Karte `rounded-image` (16), Karten `rounded-card` (14),
Knöpfe und Felder `rounded-button` (10). Alles in rem, damit „Groß“ und „Sehr groß“ mitwachsen.

Auf Tiefgrün (`surface-inverse`) steht Text in `surface` (Weiß, „Papier“ seit UI-002b) und das
Etikett in `salbei`. #f6f7f4 bleibt der Datei `own-motion-block-papier.svg` vorbehalten; der Entwurf
nutzt den Ton dort, wo im Code `surface` steht.

## 3 · Bausteine

### Hero-Karte (_neu_, `src/components/ui/HeroKarte.tsx`)

Props: `etikett` (Standard „Als Nächstes“ _neu_), `titel`, `satz?`, `person?` (`Personenbild` und
eine Zeile), `aktion` (`{ text, to }`), `markenmoment?` (Abschnitt 7).

- `section` mit `aria-labelledby` auf den Titel (`h2`). Fläche `surface-inverse`, `rounded-image`,
  innen 24 (ab 1024 px 32), Abstand 8, `shadow-plattform`.
- Etikett 18/600 `salbei`; Titel `text-hero` in `surface`, höchstens 11em breit; Satz 18 `surface`.
- Person (optional): `Personenbild` 56 und „{Name} kommt zu Ihnen“ 18/600 `surface`, 8 über dem Knopf.
- Knopf `ButtonLink` Variante `marke`, 16 Abstand darüber, volle Breite; ab 1024 px so breit wie sein
  Text (innen 28) und links.
- Markenform: das Laufrad, `aria-hidden`, 220 px, rechts oben um 72 px nach außen versetzt (ab
  1024 px 300 px, um 90 px), Farbe `accent` auf `surface-inverse`, abgeschnitten von der Karte.
  Zeichnung im 200er-Raster: Kreis Mitte 100/100 Radius 84 Strich 14; Nabe Radius 9 Strich 6; vier
  Durchmesser als Speichen `M100 16v168M16 100h168M41 41l118 118M159 41L41 159`, Strich 3, runde
  Enden. Nie neben der Wortmarke (`marke/README.md`).

### Aufgabenkarte (_neu_, `src/components/ui/Aufgabenkarte.tsx`)

Props: `zeichen` (Inline-SVG, Raster 24, Strich 2), `titel`, `satz`, `to`.

- Die ganze Karte ist ein Link: mindestens 80 hoch, innen 16, Abstand 16, Linie `line`,
  `rounded-card`, Fläche `surface`, `shadow-plattform`.
- Zeichen im Kreis 48 (`accent-soft`, Zeichen `accent`); Titel 18/600, Satz 18 `ink-muted`; Pfeil
  rechts 24 `ink-muted` (entfällt bei „Sehr groß“).
- Höchstens drei je Seite; alles Weitere als `ListRow`.

### Besuchskarte (_neu_, `src/features/platform/Besuchskarte.tsx`)

Der nächste Termin mit Person. Die ganze Karte ist der Link zum Termin; innen 20, Abstand 16, Linie
`line`, `rounded-card`, `shadow-plattform`. Oben Datum `text-abschnitt` („Samstag, 24. Oktober“),
darunter die Zeit 18 Leise („09:30 bis 10:30“). Nach einer Linie `line` und 16 Abstand:
`Personenbild` 56, „{Name} kommt zu Ihnen“ 18/600, Anschrift 18 Leise. Art und Ort des Termins kommen
wie heute aus `terminbeschreibung.ts`; neu ist nur die Anordnung.

### Personenbild (geändert, `src/components/ui/Personenbild.tsx`)

Neue Größe `karte` (_neu_) 56 px, Initialen 20/700 Weiß auf der Personenfarbe (≥ 4,5:1 wie die
übrigen Größen); in Hero-Karte, Besuchskarte und „Ihre Behandlung“. Mit Foto (N3, später) rund und
mit `alt` = Name.

### Skelett (_neu_, `src/components/ui/Skelett.tsx`)

Eine Fläche `surface-sunken` in der Form des Inhalts (Zeile Radius 6, Karte 14, Hero 16), pulsierend
(Abschnitt 7), `aria-hidden`. Der umgebende Bereich trägt `aria-busy="true"` und einen Text nur für
Vorlesesoftware „Übersicht wird geladen“ (_neu_). Ersetzt auf der Plattform den Satz „wird geladen …“
(DR-126); `LoadingState` bleibt für die Praxis-App.

### Leerzustand mit Markenform (geändert, `EmptyState` in `Feedback.tsx`)

Neue Prop `markenform` (_neu_): Kreis 64 `surface-inverse` mit dem Laufrad in `salbei`, darunter Titel
18/600 und ein Satz, was als Nächstes kommt. Beispiel: „Noch keine Termine“ / „Die Praxis trägt Ihren
ersten Termin hier ein.“ (_neu_).

### Notfallkarte (_neu_, `src/features/platform/Notfallkarte.tsx`, für Briefing 5)

Fläche `surface-sunken`, `rounded-card`, innen 20; vorn ein Telefon-Zeichen 24, daneben `Notfallsatz`
unverändert (112 und 116117 als `Notrufnummer`, Ziel ≥ 44). Steht über jedem Eingabefeld für
Nachrichten. Auf der Übersicht entfällt der Abschnitt „Fragen an die Praxis“ mit Satz und „Der Praxis
schreiben“ (Entscheidung 4).

### Knopf auf der Markenfläche (geändert, `buttonStile.ts`)

Neue Variante `marke` (_neu_), nur auf `surface-inverse`: Fläche `surface`, Schrift `surface-inverse`
700, 48 hoch, `rounded-button`, Fokusring 2 px `surface` mit Abstand 2; gedrückt Fläche
`surface-sunken`.

### Druckzustand (geändert: `buttonStile.ts`, `ListRow`, Aufgaben- und Besuchskarte, Reiter)

`active:` Fläche `surface-sunken` (Hauptknopf `accent-hover`), Maßstab 0,98, 120 ms. Bei reduzierter
Bewegung nur die Farbe (DR-117).

### Verbindungszeile (_neu_, im Plattformkopf; Schritt 0b baut sie)

Unter dem Kopf, solange keine Verbindung besteht: Fläche `surface-sunken`, innen 10/20, 18, vorn ein
durchgestrichenes WLAN-Zeichen 22, `role="status"`: „Keine Verbindung. Sie sehen den Stand von 08:12
Uhr.“ (_neu_; die Uhrzeit ist der letzte erfolgreiche Abruf). Der Inhalt bleibt stehen. Sind die
Übungen die Hauptsache, sagt die Hero-Karte ohne Netz „Geht auch ohne Netz.“ (_neu_) – die Pläne
liegen auf dem Gerät (`PlattformAblage.tsx`, `LokaleUebungen.tsx`).

### Kopf der Plattform (geändert, `PlattformApp.tsx`)

- Mindestens 72 hoch, innen 8/20, ohne Linie unten. Links `Wortmarke hoehe={28}` als Link zur
  Übersicht (`aria-label` „Übersicht“), rechts „Ich“ 18/600 mit den Initialen im Kreis 40
  (`accent-soft`, `accent`, 18/700); ohne Namen das Personen-Zeichen wie heute (DR-119).
- Unter 23rem steht rechts statt „Ich“ der Knopf „Menü“ (Reiterleiste, Stufe 3).
- Bereichsschalter und Begleitband „Sie handeln für …“ bleiben, wie sie sind.

### Reiterleiste (geändert, `PlattformApp.tsx`)

| Stufe | Wann                                         | Aussehen                                                                                                                                                                                      |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | die vier Wörter passen in eine Reihe         | vier Ziele nebeneinander, Zeichen 24 über dem Wort 18, mindestens 68 hoch, Breite nach Inhalt (Wörter brechen nie um); aktiv `accent` 700 mit Strich 3 oben, sonst `ink-muted` 500            |
| 2     | sie passen nicht („Groß“, „Sehr groß“)       | Raster 2 × 2 mit Abstand 4, innen 6/4/8; je Ziel Zeichen 28 neben dem Wort, mindestens 56 hoch, innen 6, `rounded-button`; aktiv Fläche `accent-soft` und `accent` 700, sonst `ink-muted` 500 |
| 3     | Fensterbreite unter 23rem (200 % am Telefon) | keine Leiste; im Kopf Zweitknopf „Menü“ (_neu_) mit drei Strichen, offen mit Kreuz, `aria-expanded`, `aria-controls`                                                                          |

- Das Menü öffnet unter dem Kopf über die ganze Breite: Übersicht, Termine, Übungen bzw. Training,
  Nachrichten, nach einer Linie „Ich“. Je Zeile 56 hoch, Zeichen 24 und Wort 18; aktiv Strich 3 links
  und `accent` 700. Esc und Tippen daneben schließen, der Fokus geht zurück auf „Menü“.
- Stufe 1 oder 2 wird **gemessen** (`ResizeObserver` an der Leiste, Breite der Wörter gegen die
  Leiste), nicht aus der Schrift-Einstellung gelesen; so greifen auch Systemschrift und Übersetzung.
  Stufe 3 ist eine Media-Query `max-width: 23rem` (bezieht sich auf die Standardschrift des Browsers,
  greift also beim Zoom).
- Bei offener Tastatur ausgeblendet (0b). Reiter tragen nur `bereich`/`zugang` weiter (0a).

## 4 · Layout und Responsive-Verhalten

| Breite                      | Plattform                                                                                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unter 23rem (200 %, 188 px) | Kopf mit Wortmarke 28 und „Menü“, keine Reiterleiste; Gruß in Größe des Seitentitels (28), Hero-Titel 22; Fotos entfallen; Fuß geführter Abläufe am Inhaltsende; Innenabstand 12                                                       |
| unter 640 (Telefon, 375)    | Kopf 72; Inhalt `px-5`, Abschnitte `gap-10`; Hero-Karte volle Breite; Reiterleiste unten in Stufe 1 oder 2                                                                                                                             |
| 640 bis 1023                | wie am Telefon, Inhalt und Leiste `max-w-formular` mittig                                                                                                                                                                              |
| ab 1024 (Rechner, 1280)     | Kopf mit Navigation: Übersicht, Termine, Übungen, Nachrichten als Links 48 hoch, innen 16, aktiv Fläche `accent-soft` und `accent` 700; „Ich“ rechts; keine Reiterleiste. Inhalt `max-w-inhalt`, `px-10`, Abschnitte `gap-12` (DR-113) |

Die Übersicht wird ab 900 px Inhaltsbreite zweispaltig (`repeat(auto-fit, minmax(min(420px, 100%),
1fr))`, Abstand 48): links Hauptsache und „Heute“, rechts „Nächster Besuch“ und „Neu für Sie“. Andere
Plattformseiten bleiben einspaltig in `max-w-spalte`.

## 5 · Bildschirme

### 5.1 Übersicht (`src/features/platform/Uebersicht.tsx`)

Von oben: Gruß · Hauptsache · Heute · Nächster Besuch · Neu für Sie. Abschnitte ohne Eintrag entfallen.

- **Gruß** als `h1` in `text-gruss` und `accent`: „Guten Morgen,“ (5 bis 11 Uhr), „Guten Tag,“ (11 bis
  18 Uhr), „Guten Abend,“ (ab 18 Uhr, Zeitzone der Praxis) (_neu_), dann in eigener Zeile der Name
  (N1). Ohne Namen „Guten Tag“ ohne Komma. Darunter das Datum 18 Leise, „Donnerstag, 22. Oktober“
  (_neu_). Der Satz „Sie sind bei … angemeldet – Bereich …“ mit „Mehr“ entfällt (DR-122).
- **Hauptsache:** Hero-Karte nach der Regel aus Abschnitt 0.

  | Lage                     | Titel                                                                                             | Satz                                                                                                             | Knopf                         |
  | ------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------- |
  | Befundbogen offen        | „Fragebogen vor Ihrem ersten Termin“ (_neu_, DR-125)                                              | „Etwa 10 Minuten. {Name} sieht Ihre Angaben beim ersten Termin.“ (_neu_; ohne Namen „Ihre Therapeut:in sieht …“) | „Fragebogen beginnen“ (_neu_) |
  | Check-in fällig          | Titel und Satz des heutigen Eintrags                                                              | –                                                                                                                | Verb des heutigen Eintrags    |
  | Übungen für heute        | „Ihre Übungen für heute“ (_neu_)                                                                  | „{n} Übungen aus Ihrem Plan“ (_neu_); ohne Netz „Geht auch ohne Netz.“                                           | „Übungen beginnen“ (_neu_)    |
  | sonst der nächste Termin | Hausbesuch „Besuch am Samstag“, Training „Training am Freitag“; über sechs Tage mit Datum (_neu_) | Datum und Zeit „23. Oktober, 18:00 bis 19:00“; dazu die Person „{Name} kommt zu Ihnen“                           | „Termin ansehen“ (_neu_)      |
  | Lesefrist                | „Unterlagen sichern“ (_neu_)                                                                      | „Rechnungen und Dokumente können Sie bis {Datum} herunterladen.“ (_neu_)                                         | „Unterlagen ansehen“ (_neu_)  |
  | nichts zu tun            | statt der Karte der Leerzustand mit Markenform: „Gerade ist nichts zu tun.“ (DSN-001)             | „Ihr nächster Termin: …“, wenn es einen gibt                                                                     | –                             |

- **Heute** (`h2` „Heute“ _neu_): weitere Aufgaben des Tages als Aufgabenkarten, heute die kleine
  Gewohnheit (`Gewohnheiten.tsx`) und ein Check-in, der nicht Hauptsache ist; höchstens drei.
- **Nächster Besuch** (`h2` _neu_; vor dem ersten Termin „Ihr erster Besuch“ _neu_): Besuchskarte.
  Entfällt, wenn der Termin schon die Hauptsache ist.
- **Neu für Sie** (`h2` _neu_): `ListRows` mit Rahmen; „Antwort der Praxis“ mit dem Inhalt des Wunschs,
  offene Rechnung mit Nummer, „Fällig am …“, Betrag und Zustand „Steht aus“.
- **Training:** Bereichsschalter wie heute; Hauptsache die nächste Einheit mit der Person; „Zwischen
  den Einheiten“ (_neu_) mit den Aufgabenkarten „Ihr Plan für zu Hause“ (_neu_) und
  „Ernährungstagebuch“ / „Mahlzeit eintragen“ (_neu_, nur mit gebuchter Ernährungsberatung); „Ihr
  Paket“ (_neu_) als Karte mit den Angaben, die heute unter „Ich“ zum Paket stehen (`Paket.tsx`).
- **Begleitung:** Begleitband bleibt; der Gruß gilt der Begleitperson; Hauptsache für die vertretene
  Person, beim Termin „Besuch bei {Name}“ und „{Therapeut:in} kommt“ (_neu_); „Für {Name}“ (_neu_)
  statt „Neu für Sie“; am Ende als Kleingedrucktes „Einwilligungen gibt nur {Name} selbst.“ (besteht).
- **Lesefrist:** über dem Gruß `Statusmeldung` Warnung „Ihre Behandlung ist beendet. Sie können hier
  noch bis {Datum} lesen.“; Hauptsache „Unterlagen sichern“; „Ihre Behandlung“ (_neu_) als Karte mit
  Person und Zeitraum („12. August bis 15. Oktober 2026“).
- **Entfällt:** „Jetzt dran“ in Versalien (DR-154) und der Abschnitt „Fragen an die Praxis“
  (Entscheidung 4).
- **Laden:** Skelett der echten Form (zwei Zeilen Gruß, Hero 230 hoch, Abschnitt mit Karte).
  **Fehler:** über dem `ErrorState` der Gruß ohne Namen; „Die Übersicht lässt sich gerade nicht
  laden.“ / „Prüfen Sie die Verbindung oder versuchen Sie es gleich noch einmal.“ (_neu_) mit
  „Erneut versuchen“. **Ohne Netz:** Verbindungszeile, der Inhalt bleibt.
- **„Sehr groß“:** alle Maße wachsen über rem mit; Reiterleiste Stufe 2. Lange Namen brechen nur am
  vorhandenen Bindestrich („Anna-Katharina Leutheusser-|Schnarrenberger“), nie mit Silbentrennung.

### 5.2 Türseiten (`src/app/Vollseite.tsx`, `EinladungPage.tsx`, `AnmeldungEinrichten.tsx`, `LoginPage.tsx`, `Sperrseite.tsx`)

Gemeinsam: Plattform-Schrift auch auf Türseiten (0b), linksbündig (DR-107); Wortmarke 40 oben links
(innen 20 oben, 24 seitlich, 16 unten); Titel `text-plattform-titel` in `accent` (Einladung
`text-gruss`); bei einem Zustand ein Zeichen im Kreis 64 (`accent-soft`, `accent`) über dem Titel;
Kleingedrucktes am Ende. Eine Markenfläche mit Laufrad nur, wo keine Wortmarke daneben steht.

**Einladung** (`/einladung`):

- Wortmarke · Foto 16:9 über die volle Breite, 180 hoch („Therapeutin mit Lastenrad vor einer
  Haustür“, eigenes Foto; bis es da ist, kein Foto) · `h1` „Own Motion lädt Sie ein“ (_neu_) · „Für
  Ihre Termine, Übungen und Nachrichten an die Praxis.“ (_neu_).
- `h2` „Drei Schritte, etwa 2 Minuten“ (_neu_) mit nummerierter Liste „Ihre E-Mail-Adresse“, „Gesicht
  oder Finger bestätigen“, „Eine PIN festlegen“ (_neu_; Ziffer im Kreis 36 `accent-soft`), darunter
  Leise „Ein Kennwort brauchen Sie nicht.“ (_neu_).
- Feld „E-Mail-Adresse“, Hauptknopf „Weiter“, dann als Kleingedrucktes „Die Einladung gilt 14 Tage und
  nur einmal. Der Zugang gehört nur Ihnen; Angehörige bekommen auf Wunsch einen eigenen von der
  Praxis.“ (_neu_; fasst den Satz über dem Feld und das heutige Kleingedruckte zusammen).
- **Tastatur offen:** Foto und Schritte treten zurück (`:focus-within` am Formular oder
  `visualViewport`); Wortmarke, Titel, Feld und „Weiter“ bleiben sichtbar. Fehler am Feld wie heute:
  „Bitte eine E-Mail-Adresse eingeben, etwa name@beispiel.de.“
- **Ungültig oder abgelaufen:** Zeichen Brief · „Diese Einladung lässt sich nicht verwenden“ ·
  „Einladungen gelten 14 Tage und nur einmal. Die Praxis stellt Ihnen gern eine neue aus.“ (besteht) ·
  mit Rufnummer (N2) Hauptknopf „Praxis anrufen“ (_neu_, `tel:`) und Zweitknopf „Zur Anmeldung“, sonst
  nur „Zur Anmeldung“ als Hauptknopf.
- **Adresse hat schon einen Zugang:** Zeichen Schlüssel · „Für diese Adresse gibt es schon einen
  Zugang“ (_neu_) · „Melden Sie sich mit dem Passkey dieses Zugangs an – dann gilt die Einladung
  dafür.“ (_neu_) · die Adresse Leise · „Mit Passkey anmelden und einlösen“ / „Andere Adresse eingeben“
  (bestehen).
- **Schon angemeldet:** Zeichen Person mit Haken · „Sie sind schon angemeldet“ (_neu_) · „Soll die
  Einladung für diesen Zugang gelten? Das passt etwa, wenn Sie selbst in Behandlung sind und jetzt auch
  jemanden begleiten.“ (_neu_) · „Für diesen Zugang einlösen“ / „Abmelden und neuen Zugang einrichten“
  (_neu_). Ohne Adresse, wie heute (ADR-025 Punkt 3).
- **Dienst nicht erreichbar:** Titel bleibt; darunter `Statusmeldung` Warnung „Der Zugang lässt sich
  gerade nicht einrichten. Ihre Einladung ist deswegen nicht verbraucht – bitte in ein paar Minuten
  erneut versuchen.“ (_neu_); das Feld behält die Adresse; Hauptknopf „Erneut versuchen“ (_neu_).
- Die übrigen Meldungen (`account_conflict`, `session_invalid`, „nicht angemeldet“) bekommen dieselbe
  Form, mit „Zugang“ statt „Konto“ und ohne „Sitzung“.

**Anmeldung einrichten** (`AnmeldungEinrichten.tsx`, in `GefuehrterAblauf`, `stand` „Schritt 2 von
3“ und „Schritt 3 von 3“; die Einladung ist Schritt 1):

- **Gesicht oder Finger:** Titel „Mit Gesicht oder Finger anmelden“ (_neu_) · „Ihr Telefon fragt
  gleich nach Gesicht, Finger oder Displaysperre. So melden Sie sich künftig an.“ (_neu_) · Bühne:
  schematische Abfrage (Fläche `surface-sunken`, Radius 16, darin eine Karte 240 breit mit
  Gesichts-Zeichen 48, „Own Motion“, Adresse, Balken „Fortfahren“; `aria-hidden`), Unterschrift „So
  etwa sieht die Abfrage Ihres Telefons aus.“ (_neu_) · mit Schloss-Zeichen „Gesicht und Fingerabdruck
  bleiben auf Ihrem Telefon. Own Motion bekommt sie nie.“ (_neu_) · `Disclosure` „Was passiert dabei
  genau?“ (_neu_) mit „Ihr Telefon legt einen Passkey an: einen Schlüssel, der nur zu Own Motion passt.
  Er bleibt auf dem Telefon oder in Ihrem Schlüsselbund.“ (_neu_) und dem bisherigen Satz zu
  Schlüssel und Prüfsumme · Fuß „Jetzt einrichten“ (_neu_). „1. PASSKEY“ entfällt (DR-103).
- **PIN:** Titel „Eine PIN festlegen“ (_neu_) · „Sechs Ziffern. Damit kommen Sie hinein, wenn Gesicht
  oder Finger einmal nicht gehen.“ (_neu_) · Feld „PIN“ (ein Feld, `inputmode="numeric"`,
  `autocomplete="new-password"`, 56 hoch, Ziffern 28 mittig, Laufweite 0.6em) mit Hinweis „Nicht die
  PIN Ihrer Bankkarte.“ (_neu_) · Feld „PIN noch einmal“ (_neu_) · Fuß „PIN speichern“ (_neu_).
- **Kein Passkey möglich:** Zeichen Telefon · „Hier lässt sich kein Passkey anlegen“ (_neu_) ·
  „Dafür braucht es ein aktuelles Telefon oder einen aktuellen Browser.“ · „Bitten Sie die Praxis um
  eine neue Einladung und öffnen Sie sie auf einem aktuellen Telefon.“ (_neu_) · Zweitknopf
  „Abmelden“.
- **Nicht bestätigt:** unter dem Titel `Statusmeldung` Warnung „Nicht bestätigt. Versuchen Sie es noch
  einmal – Ihr Telefon fragt dann erneut.“ (_neu_); Fuß „Erneut versuchen“ (_neu_).
- **Fertig:** kein Bildschirm (Abschnitt 0).

**Anmeldung** (`LoginPage.tsx`, gemeinsam mit der Praxis):

- Wortmarke · `h1` „Anmelden“ · „Mit Ihrem Gesicht, Ihrem Finger oder der Displaysperre.“ (_neu_) ·
  Hauptknopf „Mit Passkey anmelden“ · „**Passkey verloren?** Wenden Sie sich an die Praxis.“ (_neu_;
  der Entwurf sagt „… gibt Ihnen eine neue Einladung“, auf der gemeinsamen Seite allgemeiner, weil sich
  auch das Team hier anmeldet) · `Disclosure` „Am Rechner anmelden“ (_neu_): „Klicken Sie am Rechner
  auf „Mit Passkey anmelden“ und wählen Sie Ihr Telefon. Der Rechner zeigt einen Code; scannen Sie ihn
  mit der Kamera dieses Telefons.“ (_neu_).
- Der Aufklapper „Testkonten“ nur in der Test-Umgebung (wie heute). Das Startbild bleibt hier.

**Sperre** (`Sperrseite.tsx`, Plattform-Fassung für Plattformkonten; die Praxis-App behält ihre):

- Wortmarke · Kreis 72 `surface-inverse` mit Schloss in `surface` · `h1` „Zum Schutz gesperrt“ (_neu_)
  · „Offene Texte sind als Entwurf gesichert. Entsperren Sie mit Gesicht, Finger oder Ihrer PIN.“
  (_neu_) · Hauptknopf „Mit Passkey entsperren“ · Zweitknopf „Mit PIN entsperren“ · am Ende leise „Mit
  anderem Zugang anmelden“ (_neu_) · Kleingedrucktes „Die Plattform sperrt sich nach 30 Minuten ohne
  Bedienung und spätestens eine Stunde nach der Anmeldung. Das schützt Ihre Daten, wenn das Telefon
  liegen bleibt.“ (_neu_). Keine Angaben zur Person (ADR-025 Punkt 3).
- Ohne Passkey im Browser: `Statusmeldung` „Dieser Browser kann keine Passkeys. Entsperren geht hier mit
  der PIN.“ (_neu_), Hauptknopf „Mit PIN entsperren“.
- **Mit PIN:** Kopf „Zurück“ · „Mit PIN entsperren“ · Feld „PIN“ wie beim Festlegen, Hinweis „Die PIN
  von Own Motion, nicht die Ihres Telefons.“ (_neu_) · Fuß „Entsperren“. Falsche PIN: „Die PIN passt
  nicht. Noch {n} Versuche.“, beim letzten „Die PIN passt nicht. Noch ein Versuch – danach melden Sie
  sich mit dem Passkey neu an.“ (_neu_).
- **Zu viele Versuche:** Kreis mit Schloss · „Bitte neu anmelden“ (_neu_) · „Die PIN wurde zu oft
  falsch eingegeben. Melden Sie sich mit Ihrem Passkey neu an.“ (_neu_) · Fuß „Mit Passkey anmelden“.

**Zugang beendet oder gesperrt** (`OhneLesbarenZugang` in `PlattformApp.tsx`): Kopf mit „Ich“, keine
Reiterleiste; Markenfläche 160 hoch mit Laufrad; Titel und Satz wie heute; Zweitknopf „Zu „Ich““
(_neu_).

### 5.3 Einstieg (`Einstieg.tsx`, in `GefuehrterAblauf`, ohne Reiterleiste)

Gemeinsam: Kopf mit „Zurück“ (ab dem zweiten Schritt) und rechts „Später“ (beendet den Einstieg wie
heute); darunter Balken je Schritt, 4 hoch, `accent` erledigt und aktuell, `spur` offen
(`aria-hidden`), daneben „Schritt n von m“ 18 Leise; ein Hauptknopf im festen Fuß, keine zweite
Knopfebene (DR-109, DR-110). Titel `text-plattform-titel`, „Willkommen“ und „Alles bereit“ in
`text-gruss`.

- **Willkommen** (1 von 3): Foto 4:3 (Therapeutin mit Lastenrad; ohne Foto die Markenfläche mit
  Laufrad) · „Willkommen,“ und der Name in eigener Zeile (_neu_; ohne Namen „Willkommen“) · „Schön,
  dass Sie da sind. Hier finden Sie alles zu Ihrer Behandlung bei {Praxis}.“ (_neu_) · Leise „Noch zwei
  kurze Fragen, dann sind Sie fertig.“ (_neu_) · nach der Einrichtung einmal oben `Rueckmeldung`
  „Anmeldung eingerichtet“ (_neu_). Die Sätze „Unten finden Sie …“ und „Dieser Zugang gilt für: …“
  entfallen (DR-108).
- **Einwilligungen** (2 von 3): „Zwei Fragen zu Ihren Daten“ (_neu_; die Zahl folgt den
  Einwilligungen) · „Beides ist freiwillig. Ihre Behandlung hängt nicht davon ab.“ (_neu_) · je
  Einwilligung eine Karte (Linie, `rounded-card`, innen 20, kein Schatten): Titel `text-abschnitt`,
  Text unverändert aus `einwilligungstexte.ts`, `Wahlreihe` „Ja, erlauben“ / „Nein“ (_neu_; gleich
  gewichtet, nichts vorgewählt; die Wahl wird gespeichert wie heute der Knopf), Textlink „Ganzer Text“
  (_neu_) nur, wo es eine Langfassung gibt · Kleingedrucktes zum Widerruf (besteht). Die eigenen
  Knöpfe je Einwilligung entfallen.
- **Benachrichtigungen** (3 von 3): „Sollen wir Ihnen Bescheid geben?“ (_neu_) · „Zum Beispiel am
  Vortag eines Termins oder wenn die Praxis antwortet.“ (_neu_) · ein Schalter als Karte 80 hoch,
  `role="switch"`, „Mitteilungen auf diesem Telefon“ (_neu_) mit „Ihr Telefon fragt einmal um
  Erlaubnis.“ (_neu_) und dem Zustandswort „An“ / „Aus“ (_neu_) neben der Spur (56 × 32, aus
  `line-strong`, an `accent`, Knopf `surface` 24) · Leise „Welche Mitteilungen und ob auch per E-Mail,
  stellen Sie später unter „Ich“ ein.“ (_neu_). Die Regeltexte zu Ruhezeit und Arten bleiben unter
  „Ich“ → „Einstellungen“ (DR-111).
- **Alles bereit:** Kreis 96 `surface-inverse` mit Haken in `surface` · „Alles bereit“ (_neu_) · „Als
  Nächstes: {erste Aufgabe}.“ (_neu_; etwa „Ihr Fragebogen vor dem ersten Termin. Er dauert etwa 10
  Minuten.“) · Hauptknopf ist die Handlung der künftigen Hauptsache („Fragebogen beginnen“), darunter
  leise „Zur Übersicht“; ohne Aufgabe nur „Zur Übersicht“.
- **Begleitung:** Willkommen (1 von 2), Mitteilungen (2 von 2), Alles bereit; das Begleitband steht
  unter dem Fortschritt. Willkommen: „Willkommen,“ mit dem Namen der Begleitperson · „Hier sehen Sie,
  was {Praxis} für {Name} bereithält.“ (besteht) · Leise „Einwilligungen gibt nur {Name} selbst. Noch
  eine kurze Frage, dann sind Sie fertig.“ (_neu_). Mitteilungen: „Zum Beispiel am Vortag eines
  Termins von {Name} oder wenn die Praxis antwortet.“ und Leise „Die Mitteilungen gelten für Ihren
  Zugang. Feinheiten stellen Sie später unter „Ich“ ein.“ (_neu_). Alles bereit: „Die Übersicht zeigt,
  was für {Name} ansteht.“ (_neu_), Knopf „Zur Übersicht“.

### 5.4 Gerüst

- **Tab-Titel** je Plattformseite (0b), Muster „Seitenart – Own Motion“, nie ein Name: „Übersicht –
  Own Motion“, „Einladung – Own Motion“, „Willkommen – Own Motion“, „Gesperrt – Own Motion“ (DR-115).
- **Rechner** wie Abschnitt 4. **Bereichsschalter** und **Begleitband** bleiben.

## 6 · Barrierefreiheit

- **Kontraste** (in `src/lib/kontrast.test.ts` ergänzen): `surface` auf `surface-inverse` 15,2:1
  (Hero-Text, Knopf `marke` umgekehrt ebenso); `salbei` auf `surface-inverse` 5,9:1 (Etikett, ab
  18/600); `accent` auf `accent-soft` 9,6:1 (Initialen, Ziffern, Zeichen); `surface` auf `accent`
  11,3:1 (Begleitband); `ink-muted` auf `surface` 6,3:1; `line-strong` gegen `surface` 4,2:1 (Spur des
  Schalters, ≥ 3:1 für Bedienelemente); `warnung` auf `warnung-soft` 7,8:1.
- **Ziele:** Knöpfe 48; Aufgaben- und Besuchskarte ganz (≥ 80); Reiter 68 (Stufe 1) bzw. 56
  (Stufe 2); Menüzeilen 56; „Zurück“ und „Später“ 48; Textlinks 44 („Ganzer Text“); PIN-Feld 56;
  Abstand zwischen Zielen ≥ 8.
- **Fokus:** sichtbarer Ring wie heute; auf `surface-inverse` in `surface` (2 px, Abstand 2).
- **Vorlesesoftware:** Gruß ist `h1`, Hero-Karte eine `section` mit `h2`; die Aufgabenkarte ist ein
  Link, Titel und Satz bilden den Namen; Laufrad, Zeichen und Balken sind `aria-hidden`; „Schritt n
  von m“ steht als Text; Skelett mit `aria-busy` und Text; Verbindungszeile und Begleitband
  `role="status"`; „Menü“ mit `aria-expanded` und `aria-controls`; Schalter `role="switch"` mit
  `aria-checked`; Fotos mit `alt=""`, Personenfotos mit dem Namen.
- **Trennung:** `hyphens: manual` für Überschriften, Namen, Anschriften, Knöpfe und Reiter;
  `hyphens: auto` nur für Fließtext (0b, DR-114).
- **200 % und „Sehr groß“:** kein waagerechtes Rollen, kein abgeschnittenes Wort; Reiterleiste nach
  Abschnitt 3.
- **Reduzierte Bewegung:** Abschnitt 7.

## 7 · Bewegung

| Was                                    | Dauer                                          | Kurve                        | Bei „Bewegung reduzieren“ |
| -------------------------------------- | ---------------------------------------------- | ---------------------------- | ------------------------- |
| Druck an Knopf, Zeile, Karte, Reiter   | 120 ms, Maßstab 0,98 und Fläche                | `cubic-bezier(.2,.7,.2,1)`   | nur die Fläche            |
| Seitenwechsel unter `/p`               | 200 ms Überblendung                            | `cubic-bezier(.2,.8,.2,1)`   | ohne                      |
| Markenmoment B: Gruß                   | 0,06 bis 0,30 s, 8 px von unten und Deckkraft  | `cubic-bezier(.2,.7,.2,1)`   | steht sofort              |
| Markenmoment B: Hero-Karte             | 0,12 bis 0,40 s, 12 px von unten und Deckkraft | `cubic-bezier(.3,1.12,.5,1)` | steht sofort              |
| Markenmoment B: Laufrad der Hero-Karte | 0,12 bis 0,72 s, −45° bis 0° (eine Achtel)     | `cubic-bezier(.3,1.12,.5,1)` | ohne Drehung              |
| Markenmoment B: Abschnitte darunter    | ab 0,18 s, je 60 ms später, 0,28 s, 8 px       | `cubic-bezier(.2,.7,.2,1)`   | stehen sofort             |
| Skelett                                | Puls 1,6 s, Deckkraft 1 bis 0,55               | ease-in-out                  | ohne Puls                 |
| Menü auf und zu (Stufe 3)              | 160 ms, 8 px von oben                          | `cubic-bezier(.2,.8,.2,1)`   | ohne                      |

- **Markenmoment B** läuft einmal je Tab beim ersten Erscheinen der Übersicht (Merker in
  `sessionStorage` wie `startbildMerker`), nie beim Zurückkehren zur Übersicht. Inhalt nach 0,7 s.
- **Startbild:** `startbildFaellig` (`src/lib/startbildMerker.ts`, entschieden in `App.tsx`) gibt auf
  `/p…` und `/einladung` nichts zurück. Auf der Anmeldeseite und in der Praxis-App bleibt es, wie es ist
  (Handoff Rahmen, Abschnitt 6).
- Die Leinwand zeigt beide Varianten als laufende Schleife und ein Ablaufblatt mit den Zeiten; A
  („Startbild landet im Kopf“) bleibt dort nur zum Vergleich.

## 8 · Prüfung

- Bildstrecke vorher und nachher: `pnpm bildstrecke --nur=plattform,anmeldung` bei 375 und 1280 px,
  dazu 188 px (200 %) und „Sehr groß“ für Einladung, Einstieg, Übersicht und Reiterleiste sowie die
  Einladung mit offener Tastatur.
- `tests/e2e/plattform-barrierefreiheit.spec.ts`: axe auf allen neuen Zuständen; bei 188 px der Knopf
  „Menü“, bei „Sehr groß“ zwei Reihen, alle vier Ziele erreichbar, kein waagerechtes Rollen.
- `src/designsystem.test.ts` (Ratsche): unter `.plattform-schrift` keine Schrift unter 18 px, keine
  Versalien-Etiketten, als Schatten nur `shadow-plattform`.
- `src/lib/kontrast.test.ts`: die Paare aus Abschnitt 6.
- Komponententests: Wahl der Hauptsache (Reihenfolge, Lesefrist, nichts zu tun), Markenmoment einmal
  je Tab und reduziert, kein Startbild auf Plattformwegen, Stufen der Reiterleiste, Schalter mit
  `role="switch"`, Einwilligung speichert beim Wählen.
- Sichtung am Telefon in der Test-Umgebung als Patientin, als Trainingskundin und als Begleitperson.

## 9 · Reihenfolge der Umsetzung

Je Schritt ein Pull Request über den Feature-Loop (K1: Pfad A; Checkliste und Zweitreview nur, wo
der Diff einen Auslöser aus ADR-013 Punkt 9 berührt).
Schritt 0 (0a, 0b, 0c) geht voraus oder läuft parallel ohne Überschneidung.

1. **1a Sprache:** `docs/design/PLATTFORM.md` (Entwurf im Bericht, mit den Werten dieses Handoffs) und
   ein Verweis in DESIGN.md; Tokens (Abschnitt 2); Hero-Karte, Aufgabenkarte, Besuchskarte, Skelett,
   Leerzustand mit Markenform, Notfallkarte, Knopf `marke`, `Personenbild` 56, Druckzustand; Ratsche.
2. **1b Gerüst:** Kopf, Reiterleiste in drei Stufen mit Menü, Rechneransicht ab 1024 px, Markenmoment B
   und kein Startbild auf Plattformwegen.
3. **1c Türen:** Einladung mit ihren Zuständen, Anmeldung einrichten, Anmeldung, Sperre, Zugang
   beendet.
4. **1d Einstieg** mit der Fassung für Begleitpersonen. 1c und 1d können parallel laufen.
5. **1e Übersicht:** Hauptsache, Heute, Nächster Besuch, Neu für Sie; Training, Begleitung,
   Lesefrist; Laden, Fehler, ohne Netz; zweispaltig ab 1024 px.

**Daten (Pfad A, eigener Schritt, unabhängig von 1a bis 1e):** N1 Name und Initialen, N2 Rufnummer
der Praxis in der Plattform-Projektion, mit `pnpm test:db`. Bis sie da sind, zeigen 1b, 1c und 1e die
Fassung ohne: Gruß ohne Namen, Personen-Zeichen statt Initialen, kein „Praxis anrufen“.

## 10 · Beim Bauen nachzutragen

- `docs/decisions/ASSUMPTIONS.md`: je eine Annahme für die Wahl der Hauptsache (mit der Abweichung von
  DSN-001 4.1), Markenmoment B statt Startbild auf Plattformwegen, die drei Stufen der Reiterleiste,
  den Notfallhinweis nur am Nachrichtenfeld, die Einrichtung ohne eigene Fertig-Seite, die offene
  Tastatur und die Regeln unter 23rem.
- `docs/development/PLATTFORM-ANSICHTEN.md` (DSN-001): 4.1 um Hauptsache und „Nächster Besuch“
  ergänzen; der Notfallhinweis steht nicht mehr auf der Übersicht.
- `docs/design/DESIGN.md`: Verweis auf `PLATTFORM.md` (DESIGN.md steht an seiner Größengrenze).
- `marke/README.md`: das Laufrad als Markenform in Hero-Karte und Leerzustand; kein Startbild auf
  Plattformwegen.
- `src/lib/begriffe.ts`: die Wörter, die auf der Plattform nicht vorkommen (Abschnitt 1), in die
  bestehende Prüfung aufnehmen.
- Beim Bauen zu prüfen: Ist der Einladungscode nach dem E-Mail-Schritt verbraucht (Text „Kein Passkey
  möglich“)? Welche Mitteilungsarten schaltet der eine Schalter ein (`BENACHRICHTIGUNGEN`)? Kennt die
  Übersicht die Übungen des Tages (`uebungstage.ts`)?
- `docs/development/BEFUNDE.md`: Die DR-Nummern trägt Jannes nach Wunsch selbst ein.

Entwurf: Claude Design, 22.10.2026, Leinwand „Plattform – Erster Eindruck“ mit 44 Zeichenflächen
(Übersicht in fünf Fassungen, Türen mit Zuständen, Einstieg mit Begleitung, Gerüst, Rechner, „Sehr
groß“ und 200 %, Zustände, Markenmoment, Plattform-Sprache, Bausteine). Beispieldaten synthetisch.
