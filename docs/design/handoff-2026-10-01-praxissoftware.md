# Handoff: Redesign Praxissoftware (Übersicht, Termin, Patientenakte)

> **Entwurfsreferenzen in HTML, kein Produktionscode.** Aufgabe ist, die Entwürfe in der bestehenden Codebasis (React + Tailwind 4 + Supabase, `src/components/ui`, `src/features/*`) mit deren Mustern nachzubauen. Nichts aus `entwuerfe/` wird kopiert oder importiert.

## Inhalt dieses Pakets

- `README.md` – diese Spezifikation (Tokens, Bausteine, Layout, Screens, Zustände, Reihenfolge).
- `AUFTRAG-CLAUDE-CODE.md` – Vorgehen (lokaler Ordner, kein Kopieren) und der Startprompt für Claude Code, Schritt für Schritt; am Ende das Muster für weitere Bereiche.
- `entwuerfe/Praxis App - offline.html` – **klickbarer Prototyp zum Doppelklicken**, alles in einer Datei (Schrift, Design System, Logik). Vorschau-Leiste oben: Auto / Handy / Tablet / PC. Tweaks „Uhrzeit“ und „Fahrzeit“ spielen den Tag durch.
- `entwuerfe/Praxis App.dc.html` – derselbe Prototyp als Quelldatei mit Nachbardateien (`support.js`, `_ds/`, `assets/`). Braucht einen lokalen Server (`npx serve entwuerfe` oder `python3 -m http.server`), direkt per Doppelklick blockiert der Browser Teile davon. URL-Parameter: `?geraet=handy&variante=b&start=uebersicht|termin|akte&zustand=normal|laden|fehler|leer|veraltet&terminStatus=confirmed|completed|no_show|cancelled&fahrzeit=12`.
- `entwuerfe/Praxissoftware Redesign.dc.html` – Entwurfsdokument mit allen Optionen 1a–1o, Mustern, DS-Ergänzungen.
- `entwuerfe/Uebergabe Claude Code - offline.html` – diese Spezifikation als HTML, Doppelklick genügt (`…Claude Code.dc.html` ist die Quelldatei).
- `entwuerfe/_ds/…` – Design-System-Tokens und Bundle, nur damit die Entwürfe rendern.

## Entscheidungen von Jannes (01.10.2026)

- Handy-Layout der Übersicht: **Zeitstrahl** (1b). 1a und 1c entfernt.
- Keine Kachel „Mitnehmen“; einzige Tagesfrage ist die Liege.
- Wegbalken mit Farbstufen nach Puffer (≤ 0 rot, ≤ 3 dunkles Orange, < 5 helleres Orange, ≥ 5 grün), Fahrt mittig.
- Zugang/Besonderheit auf der Karte hinter Pillen (Stockwerk, Liege, Erstaufnahme) und Info-Knopf.
- Erklärende Hinweistexte gestrichen (Liste in Abschnitt 1); „Navigation: ganzer Tag“ nicht in der Übersicht.

Übergabe an Claude Code · Stand 01.10.2026

# Redesign Praxissoftware: Übersicht, Termin, Patientenakte

Dieses Dokument beschreibt, wie die drei Entwürfe in `janneswichelhaus/PraxisSoftware` (React, Tailwind 4, Supabase) umgesetzt werden. Es ergänzt das Own Motion Design System und ändert keine Abläufe, Routen oder Berechtigungen.

**Dateien dieses Entwurfs**

- [Praxissoftware Redesign.dc.html](entwuerfe/Praxissoftware Redesign.dc.html) · Entwurfsdokument mit allen Optionen 1a–1o, Mustern und Begründung.
- [Praxis App.dc.html](entwuerfe/Praxis App.dc.html) · klickbarer Prototyp aller drei Ansichten. Vorschau-Leiste oben: Handy (390 px mittig), Tablet (834), PC, Automatisch. Auch per URL: `?geraet=handy|tablet|pc&variante=a|b|c&start=uebersicht|termin|akte&zustand=normal|laden|fehler|leer|veraltet&terminStatus=confirmed|completed|no_show|cancelled&leiste=0`.
- Design System: `_ds/own-motion-design-system-…/` (Tokens, Komponenten, Leitfaden). Werte im Repo stehen in `src/index.css` `@theme`.

! Die HTML-Dateien sind Entwurfsreferenzen, kein Produktionscode. Umgesetzt wird in den bestehenden Komponenten unter src/components/ui und den drei Feature-Seiten. Namen, Props und Verhalten der Repo-Bausteine bleiben; es ändern sich Werte, Anordnung und fünf neue Bausteine. Erklärende Hinweistexte entfallen (Abschnitt 1).

## 1 · Genauigkeit und Geltung

**High-fidelity.** Farben, Schrift, Maße und Zustände sind final und unten verbindlich aufgeführt. Texte stammen aus dem Repo (Sie-Form, Begriffe aus `src/lib/begriffe.ts`) und bleiben unverändert; neue Beschriftungen sind markiert.

**Unverändert bleiben:** Routen und Rückweg (`mitRueckweg`), Rollenprüfungen (`canManageAppointments`, `canWriteTreatmentNote`, …), Datenpfade (`list_day_plan`, Kalenderabfrage), Audit-Verhalten (Kurzblick und Verlauf protokollieren Lesezugriffe), die drei Hausbesuch-Szenarien (ADR-018), Rückfragen vor Absage und Nichtantreffen, Navigation-Handoff-Hinweis (ADR-019 Punkt 23), Druck-Regeln.

**Gestrichene Texte (Jannes, 01.10.):** Google-Maps-Hinweis unter der Tageskarte, „Hat die Patient:in vorher abgesagt? …“ unter den Szenarien, „Organisatorischer Vermerk …“ im Protokoll-Kasten, „Abschluss und Wiederöffnen brauchen keine Rückfrage“, „Wird unter Abrechnung → Leistungen erfasst“, Fußnote „Zugriffe auf Patientenakten werden protokolliert“. Bleiben: „Lesen wird protokolliert“ am Kurzblick, „Jeder gelesene Eintrag wird protokolliert“ im Verlauf, die 24-Stunden-Regel in der Absage-Rückfrage. Ob Hinweise mit Rechtsbezug (ADR-010, ADR-019) an anderer Stelle stehen müssen, prüft Jannes.

**Entschieden (01.10.):** Handy-Layout der Übersicht ist der **Zeitstrahl** ([1b](entwuerfe/Praxissoftware Redesign.dc.html#1b)). Die Layouts 1a und 1c sind aus Prototyp und Entwurfsdokument entfernt; die Beschreibung unten gilt für den Zeitstrahl.

## 2 · Tokens

Alle Werte existieren im Repo-`@theme`. Neu sind drei Einträge (fett) sowie `--color-warnung-mittel` (Abschnitt 3, Wegbalken).

| Rolle                       | Tailwind                                           | Wert                                                | Verwendung im Entwurf                                                     |
| --------------------------- | -------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Seitengrund                 | `bg-canvas`                                        | #eceee8                                             | Hintergrund der Anwendung, neutrale Kachel                                |
| Karte, Kopfzeile, Tableiste | `bg-surface`                                       | #ffffff                                             | Alle Karten, Zeilenlisten in Karten                                       |
| Akzentfläche                | `bg-accent-soft`                                   | #e1f0e4                                             | Akzent-Kachel, Rückmeldung, aktive Akte-Pille, Pille „Liege“              |
| Inverse Fläche              | `bg-surface-inverse`                               | #042c1b                                             | Seitenleiste; in 1c die Aufkleber-Karte                                   |
| Hauptfarbe                  | `text-accent` / `bg-accent`                        | #004429                                             | Titel, Links, Primärknopf, aktiver Bereich, Fortschrittsbalken            |
| Tinte / Leise               | `text-ink` / `text-ink-muted`                      | #111e17 / #545d58                                   | Text / Meta, Labels, Konto, Abmelden                                      |
| Salbei                      | `text-salbei`                                      | #87a98d                                             | Nur auf Tiefgrün: inaktive Seitenleisten-Einträge, Kicker in 1c           |
| Linien                      | `border-line` / `border-line-strong`               | #d7d8d2 / #6f7873                                   | Trenner, Kartenrahmen / Felder, Rückfrage-Kasten, hohle Zeitstrahl-Punkte |
| Status                      | `positiv` / `warnung` / `danger` (+ `-soft`)       | #004429·#e1f0e4 / #5a4300·#f3ead6 / #7a2418·#f4e3e0 | Badges, Warn-Kachel „Erstaufnahme“, Veraltet-Fläche, ErrorState           |
| Radien                      | `rounded-card` / `rounded-button` / `rounded-pill` | 14 / 10 / 999                                       | Karten und Kacheln 14, Knöpfe und Felder 10, Pillen 999                   |
| **Seitentitel Handy**       | `text-h2-mobil` (neu)                              | 26px / 1.05 / 800 / −0.03em                         | PageHeader unter 640 px; ab 640 `text-h2` 32                              |
| **Zweispalten-Schwelle**    | `--breakpoint-zweispaltig` (neu)                   | 900 px Inhaltsbreite                                | Kontextspalte rechts (Übersicht, Termin, Akte)                            |
| **Kachel-Innenabstand**     | `--spacing-kachel` (neu)                           | 12px 14px (Kopf der Akte 10px 14px)                 | Kachel                                                                    |
| Bewegung                    | —                                                  | 120 ms, cubic-bezier(.2,.7,.2,1)                    | Hintergrundwechsel bei Hover, Chevron-Drehung. Kein Fade, kein Bounce.    |

## 3 · Neue und geänderte Bausteine (`src/components/ui`)

### Wegbalken.tsx (neu)

```
type WegbalkenProps = {
von: { zeit: string; label: string };      // Ende des vorigen Termins oder Startort
bis: { zeit: string; label: string };      // Beginn des nächsten Termins
fahrtMin: number;                          // geschätzte Fahrzeit (ADR-019)
ton?: 'hell' | 'dunkel';                   // dunkel nur im Aufkleber (1c)
};
// geplantMin = bis - von; pufferMin = geplantMin - fahrtMin; abfahrt = bis - fahrtMin
// Stufen nach pufferMin: ≤ 0 rot (danger / danger-soft) · ≤ 3 dunkles Orange (warnung / warnung-soft)
//   · unter 5 helleres Orange (neu --color-warnung-mittel oklch(60% .12 68) / warnung-soft) · ≥ 5 grün (accent / accent-soft)
// Kopfzeile: „Abfahrt spätestens hh:mm“ · knapp: „! Knapp, Abfahrt spätestens“ · rot: „! Zu spät, Abfahrt sofort“
```

- Spur 6 px (Puffer-Farbe), Fahrt als Pille 10 px **mittig** auf der Spur (`left: (100 − anteil)/2 %`, `width: fahrt/geplant`, min 20 px); Puffer bleibt links und rechts sichtbar. Keine Marker, keine Kreise. Legende darunter dreispaltig 14: „28 min Puffer“ (Puffer-Farbe, 600), „≈ 12 min Rad“ (Tinte, 600), „40 min eingeplant“ (Leise, rechts).
- Farbe trägt nie allein: Stufe steht im Kopftext („! Knapp …“, „! Zu spät …“) und in der Pufferzahl. Neues Token `--color-warnung-mittel` für die hellere Orange-Stufe; im Kontrast-Test als Flächenpaar ergänzen (kein Text in dieser Farbe).
- Keine Animation. Zahlen tabular. Zwei Farben plus Warnfläche; keine weiteren Töne.

### Kachel.tsx (neu)

```
type KachelProps = {
ton?: 'neutral' | 'akzent' | 'warnung';   // Fläche: canvas+line | accent-soft | warnung-soft
label: string;                             // 12/600, tracking .14em, Versalien; Farbe: ink-muted | accent | warnung
children: ReactNode;                       // Wert: 16/600, Zeilenhöhe 1.3 (Kopf der Akte: 15/600)
zusatz?: ReactNode;                        // 14, ink-muted (akzent: accent; warnung: warnung); mt 2
aktion?: ReactNode;                        // Textlink 14/600 mit Pfeil, min-h 36
};
```

- Radius 14, Innenabstand 12/14, `min-h 72` in Reihen, `box-border`. Neutral trägt 1 px `line`, akzent und warnung keinen Rahmen.
- Reihe: `grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-2`; im Kopf der Akte 160 px. Höchstens vier Kacheln je Reihe.
- Warnung nur mit „!“ im Label (`aria-hidden`), Text trägt die Bedeutung. Keine Kachel für Fließtext.

### Zeile.tsx (neu)

```
type ZeileProps = {
zeit: ReactNode;          // 15/600 tabular-nums; erledigt: ink-muted. Zwei Zeilen erlaubt (Datum / Uhrzeit)
titel: ReactNode;         // 16/600
meta?: ReactNode;         // 14 ink-muted
status?: ReactNode;       // Badge oder Statuszeichen, rechts
to?: string; onClick?: () => void;   // ganze Zeile ist das Ziel (Link oder Button), sonst div
gedaempft?: boolean;      // erledigt: Zeit und Titel ink-muted, Titel 500
};
```

- `grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 min-h-14 py-2`; Trenner `border-t border-line` ab der zweiten Zeile; Hover `bg-surface-sunken`.
- In einer Karte: `ul` mit `rounded-card border border-line bg-surface px-4`, keine Außenabstände der Zeilen. Dichte Variante (Team-Spalte): `min-h-12 py-1.5`, Zeit 14, Meta 13, Namen mit `truncate`.
- Ersetzt Listen mit bis zu vier Spalten. Tabellen bleiben in Leistungen, Rechnungen, Katalog, Mitarbeitende (Vergleich/Bearbeitung).

### Aufklapper.tsx (neu; verallgemeinert `aufklappStile.ts`)

```
type AufklapperProps = { titel: string; anzahl?: number; offenAb?: 'lg'; inKarte?: boolean; children: ReactNode };
```

- `details/summary`, Summary `flex items-center gap-2 min-h-11`, Chevron 16 px dreht um 90° in 120 ms (`group-open:rotate-90`). Titel als Label-Stil (12 Versalien ink-muted) oder 14/600 ink-muted mit Zähler in Klammern.
- `inKarte`: Karte mit `px-4`, Summary 52 hoch, Inhalt mit `border-t border-line pt-3 pb-3.5`. `offenAb="lg"`: ab 1024 px `open` gesetzt.

### Rueckmeldung (bestehend in `appointments/Rueckmeldungen.tsx`, neues Aussehen)

- `role="status"`, nimmt Fokus; Fläche accent-soft, Radius 14, Innenabstand 12/16, Text 15/600 accent, Zeichen „✓“ vorn (`aria-hidden`). Steht unter dem Seitenkopf, über den Kacheln.

### Statuszeichen (neu, für dichte Listen)

- Zeichen + Wort ohne Pille, 14/600: erledigt „✓ erledigt“ in accent, „! nicht angetroffen“ in warnung, „× abgesagt“ in danger, bestätigt ohne Zeichen. Nur dort, wo ein Badge die Zeile sprengt (Tagesplan des Teams, Liste „Heute“ in 1c).

### Geänderte Werte bestehender Bausteine

| Baustein                                     | Änderung                                                                                                                                                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageHeader`                                 | Titel 26 px unter 640, 32 ab 640. Beschreibung 14 ink-muted, `mt-1`. Aktionen rechts, kompakt (40). Flex mit `items-end` und Umbruch.                                                                                                                                  |
| `AppShell` Kopfzeile                         | Höhe 56. Handy: Wortmarke 24 hoch + Bereichsname 14 ink-muted; Lupe als 44er Symbolknopf in accent. „Mein Konto“ 14/600 ink-muted, Name daneben ab md; „Abmelden“ 14/400 ink-muted, kein Hauptfarbe-Fett. Suche am PC 40 hoch, Rahmen line-strong, Radius 10, max 384. |
| `AppShell` Seitenleiste                      | Unverändert (248 / 72, Tiefgrün). Inaktive Einträge Salbei 15/500, aktiv accent-Fläche + Papier 600, Radius 10, min-h 44.                                                                                                                                              |
| `Card`                                       | Weiß, Radius 14, 1 px line, Innenabstand 16 (Kopf der Akte 16/16/12). Kein Schatten.                                                                                                                                                                                   |
| `Badge`                                      | Zeichen je Ton bleibt (positiv ✓, warnung !, kritisch ×, neutral ohne). 28 hoch, 14/600, Padding 0 12.                                                                                                                                                                 |
| `Section`                                    | Kopfzeile `min-h 32` statt 40 wenn die Aktion ein Textlink ist; Hinweis entfällt, wo die Kacheln ihn tragen („Ihre Besuche mit Anschrift …“ entfällt).                                                                                                                 |
| `Rueckfrage`                                 | Unverändert im Verhalten. Kasten Radius 14, Rahmen line-strong, Innenabstand 16; Auslöser als `quiet` am Seitenende („Termin absagen“).                                                                                                                                |
| `EmptyState` / `LoadingState` / `ErrorState` | Stehen in einer Karte (Leer, Laden) bzw. frei (Fehler) mit „Erneut versuchen“ als Sekundärknopf darunter. Laden zusätzlich mit leeren Kachelflächen in Zielgröße (72 px, Karte weiß, line).                                                                            |
| Kalender-Kacheln (`CalendarGrid`)            | Nicht Teil der Entwürfe, aber aus den Screenshots: Schatten und orangene Kante entfernen; Status über 3 px Linie links in Hauptfarbe (bestätigt), line-strong (abgeschlossen), Warn-/Fehlerfarbe mit Zeichen im Text.                                                  |

## 4 · Layout und Responsive-Verhalten

| Breite            | Gerüst                                                                     | Inhalt                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| < 640 (Handy)     | Kopfzeile mit Marke, Tableiste unten (56 + safe-area), 4 Bereiche + „Mehr“ | Padding 16, eine Spalte, Seitentitel 26, Kontext als Aufklapper                                                                                                            |
| 640–1023 (Tablet) | Symbolspalte 72 (Monogramm 40), Kopfzeile mit Suche                        | Padding 24, zwei Spalten ab 900 px Inhaltsbreite (ab ca. 1000 px Fenster)                                                                                                  |
| ≥ 1024 (PC)       | Seitenleiste 248 mit Wortmarke Papier 36                                   | Padding 24/32, max 1200 zentriert, zwei Spalten: `grid-cols-[minmax(0,1fr)_minmax(300px,380px)]` (Übersicht) bzw. `minmax(280px,340px)` (Termin, Akte), `gap-6 lg:gap-x-8` |

Zwei Spalten per Container-Query auf `main` (`@container (min-width: 900px)`) oder, ohne Container-Queries, ab `lg` (1024) plus Seitenleiste. Die Kontextspalte wird unterhalb nicht ausgeblendet, sondern als Aufklapper in die Hauptspalte gesetzt (Tagesplan des Teams, Alle Angaben).

## 5 · Übersicht (`src/features/today/MyDayPage.tsx`)

**Reihenfolge Hauptspalte**

- `PageHeader` „Guten Morgen, Jannes“ + Datum lang („Donnerstag, 1. Oktober 2026“). **Ohne** „Navigation: ganzer Tag“ (Jannes, 01.10.); `NavigationFuerDenTag` bleibt in der Tour-Ansicht.
- Veraltet-Hinweis (nur bei `isError && termine`): Fläche warnung-soft, Radius 14, Innenabstand 12/16, `Statusmeldung ton="warnung"` + Sekundärknopf kompakt „Jetzt aktualisieren“.
- Liege-Zeile: Akzentfläche (accent-soft, Radius 14, 52 hoch, Padding 8/16): links Label „Liege heute“ (12 Versalien accent), rechts „✓ Ja · ab 1. Besuch 09:10“ (16/600 accent, `liegeText`). Bei „nein“ steht „Nein“. **Keine Kachel „Mitnehmen“** (Entscheidung Jannes 01.10.; `mitnehmenText` bleibt im Kurzblick am Termin).
- **Wegbalken** (neu, Karte weiß, Padding 14/16/12): Kopf Label „Nächster Weg“ + rechts „Abfahrt spätestens **08:58**“ (14, Zeit 700 tabular). Grid `auto minmax(0,1fr) auto`: links Ende des vorigen Termins (16/700 tabular) + „Ende Peter Lang“ (13 ink-muted), rechts Beginn des nächsten + Name. Strecke 12 px hoch, Radius 999: Puffer accent-soft über die volle Breite, Fahrt accent rechtsbündig mit Breite `fahrt/geplant` (min 24 px); Marker: Start 14 px weiß mit 2 px line-strong, Abfahrt 20 px weiß mit 3 px accent (Ring an der Grenze), Ankunft 18 px accent mit 3 px weißem Rand. Darunter Legende 14: „28 min Puffer“ (Punkt accent-soft), „≈ 12 min Rad“ (Punkt accent), „40 min eingeplant“ (600). Daten: `wegeDesTages` (Fahrzeit nach ADR-019, geschätzt), Ende des vorigen Termins bzw. Startort. **Knapp** (Puffer < 5 min): Puffer-Fläche warnung-soft, Kopf „! Sofort los, spätestens 08:58“ in warnung, Legende „kaum Puffer“ / „n min zu knapp“. Ohne vorigen Termin: „Start am Rad“ mit Startort-Zeit.
- „Heute außerdem:“ als Zeile 14 (`HeuteAusserdem`, unverändert).
- Abschnitt „Erster Weg“ / „Nächster Weg“: Label links, rechts „in 25 Minuten“ 14 ink-muted (Differenz zu `starts_at`, nur wenn < 3 h). Darunter die **Tageskarte** (siehe unten). **Kein Handoff-Hinweis** mehr unter der Karte; der Satz zur Datenübergabe (ADR-019 Punkt 23) gehört in den ersten Aufruf der Navigation oder nach „Mein Konto“ – fachlich prüfen.
- Abschnitt „Danach“ (`Vorschau`): eine `Zeile`: Uhrzeit · Name · „Wilhelmstraße 8 · Liege · Anfahrt ≈ 9 min“, Pfeil rechts; führt in den Termin.
- Aufklapper „Weitere offene heute (n)“ und „Erledigt heute (n)“: Zeilen statt Karten; Badge aus `dayPlanStatusTon`. Erledigte gedämpft.
- `OpenPointsSummary` als Karten-Zeile 60 hoch: „Offene Punkte“ 16/600, darunter „2 Aufgaben · 1 Anruf · 1 Erstaufnahme“ 14 ink-muted, rechts Zahl 16/700 accent + Pfeil; Hover accent-soft. Nur wenn etwas fällig ist (bestehende Regel).
- Unter 900 px: Aufklapper „Tagesplan des Teams (n)“ mit dichten Zeilen in Karte und Textlink „Zum Kalender →“.

**Tageskarte (`Tagesliste.tsx`)**

- Kopf: Zeitspanne 16/600 tabular links, Badge rechts. Name 20/700 als Link in accent, Unterstrich 2 px, Offset 4 (`Textlink alleinstehend`). Meta 14 ink-muted: „Hausbesuch · Termin 2 von 6“ (_neu:_ Nummer aus `Abrechnungslage`, wenn geladen).
- **Pillenreihe statt Textblock** (Jannes, 01.10.): „2. OG links“ (Stockwerk, Knopf), „✓ Liege“ (accent-soft), „! Erstaufnahme offen →“ (warnung-soft, Knopf → Akte); alle 36 hoch, 14/600. Der Info-Knopf steht **am Ende der Adresszeile**: Ring 22 px, 1,5 px accent, „i“ 13/700, Tippziel 44 via negativem Rand, `aria-expanded`. Er klappt unter der Pillenreihe eine `dl` auf (Fläche canvas, Radius 10, 10/12 innen, 14): „Zugang“ (`home_visit_access_note` ohne Stockwerk) und „Besonderheit“ (`special_note`). Ohne Hinweise kein Knopf. _Neu im Datenmodell:_ Feld `home_visit_floor` (Stockwerk/Lage, kurz) in den Stammdaten; bis dahin aus dem Zugangshinweis vorn abtrennen.
- Anschrift 16/1.4, `mt-3`. Zugang und Besonderheit stehen nicht mehr offen auf der Karte (siehe Pillenreihe und Info-Knopf). Was zur Erstaufnahme fehlt, steht in der Akte; die Pille sagt nur, dass etwas fehlt.
- Handlungen: Primärknopf „Navigation starten“ in voller Breite (48). Zweite Reihe kompakte Sekundärknöpfe „Bisherige Doku“, „Doku“, „Abschließen“ (_neu: Kurzform_ für „Behandlung abschließen“; `sr-only` „Behandlung“ ergänzen). Ohne Navigationsziel ist „Abschließen“ der Primärknopf (bestehende Regel).
- Fußzeile `border-t line pt-3`: links Rufnummern als Textlink („Mobil“ ink-muted + Nummer tabular), rechts „Termin öffnen →“. Beide min-h 44.

**Kontextspalte (≥ 900)**

- Karte „Tagesplan des Teams“: Label + Textlink „Kalender →“; dichte Zeilen (48) mit Statuszeichen; Zeit 14/600, Name 15/600 truncate, „Lena Vogt · Hausbesuch“ 13.
- Karte „Tagesroute“: Label + Textlink „Tour →“; Karte 16:10 (`TagesrouteKarte`, erst laden, wenn sichtbar), darunter „Start 08:45 · ≈ 35 min · Wegzeiten geschätzt“ 14 ink-muted.

**Zeitstrahl (ersetzt Aufklapper „Weitere offene“ und „Erledigt“)**

- Liege-Zeile und Wegbalken wie in 1a; darunter direkt der Zeitstrahl, keine Aufklapper für offen/erledigt. **Bevorzugt von Jannes (01.10.).**
- Kompakte Einträge: Name 16/600, darunter Ort statt Art: „Wilhelmstraße 8 · Anfahrt ≈ 9 min“, „Videotermin · Termin 1 von 10“, „Fehlzeit · Video“. Badge nur bei erledigt/abgesagt, kein „Steht aus“. Ausgeklappte Karte ohne doppelte Uhrzeit (steht am Strahl), Meta „Hausbesuch · Termin 2 von 6“, dann Anschrift, Pillenreihe mit Info-Knopf, Knöpfe.
- `ol` mit `grid-cols-[52px_20px_minmax(0,1fr)] gap-x-2.5`; Schiene 2 px line, Punkt 14 px: nächster und erledigte gefüllt accent (erledigt mit ✓ 10 px Papier), spätere hohl line-strong. Der nächste Termin steht als Karte (Kicker „Nächster Weg · ≈ 12 min“ accent, Badge, Name, Meta + Zeitspanne, Anschrift, Zugang/Besonderheit, Pillen, Grid `1fr auto` „Navigation starten“ + „Termin“, Textlinks „Bisherige Doku“, Rufnummer). Alle anderen als kompakte Zeile 44 mit Badge; Meta erhält „· Anfahrt ≈ 9 min“. Keine Aufklapper für offen/erledigt.

**Zustände**

- **Laden:** leere Flächen in Zielgröße (Liege-Zeile 52, Wegbalken-Karte 120; weiß, line, `aria-hidden`) + Karte mit `LoadingState` „Tagesliste wird geladen …“.
- **Fehler ohne Stand:** `ErrorState` + Sekundärknopf „Erneut versuchen“ (`refetch`). **Fehler mit Stand:** Veraltet-Hinweis oben, Liste bleibt.
- **Leer:** Karte mit `EmptyState` „Heute sind Ihnen keine Besuche zugeordnet“ / „Heute ist nichts mehr offen“; Beschreibung „Der Tagesplan des Teams steht unten.“ (_neu_) bzw. „Alle Besuche des Tages sind erledigt.“

## 5a · Ergänzungen vom 01.10. (nachmittags): acht Verfeinerungen

Alle acht sind im Prototyp umgesetzt (Tweaks „Uhrzeit“ und „Fahrzeit“ zeigen die Zustände). Datenquelle für Zeiten ist die Uhr der Organisation (`todayInTimeZone`, Minutenauflösung), nicht die Geräteuhr.

1. **Jetzt-Marke im Zeitstrahl (1b).** Chronologisch vor dem ersten Termin mit `starts_at > jetzt`: Zeit 12/700 accent, 8-px-Punkt accent auf der Schiene, 2-px-Linie accent über die Inhaltsspalte; sr-only „Jetzt, 08:45 Uhr“. Aktualisierung jede Minute. Punkt des nächsten Termins hohl (weiß, 2 px accent), gefüllt ab < 30 min bis Beginn; erledigt accent mit ✓, abgesagt/nicht angetroffen ×.
2. **Übergänge zwischen allen Terminen.** Über jedem kommenden Hausbesuch nach dem nächsten ein schmaler Wegbalken: Spur 4 px, Fahrt 6 px mittig, Text 12/600 „≈ 9 min Rad · 11 min Puffer“ in der Stufenfarbe (`Wegbalken size="klein"`). Kein Balken bei Video, Praxis oder fehlender Fahrzeit.
3. **Tagesfortschritt im Kopf.** Rechts neben dem Gruß: Punktreihe 12 px je Behandlungstermin (erledigt gefüllt accent, nächster hohl accent, spätere hohl line-strong, abgesagt danger, nicht angetroffen warnung; transition 200 ms) + „1 von 4 Besuchen erledigt“ 14 ink-muted. Fehlzeiten zählen nicht.
4. **Abschluss-Moment.** Läuft ein Termin (7), schließt „Dokumentieren und abschließen“ auf der Karte ab: Punkt → ✓ in 200 ms, Zeitstrahl rückt weiter, Rückmeldung oben „✓ Anna Berger abgeschlossen. Dokumentation als Version 1 festgeschrieben.“ (accent-soft, role=status). Im Repo führt der Knopf nach `/termine/:id/abschluss`; die Rückkehr trägt die Meldung als `eingangsmeldung`.
5. **Liege-Zeile mit Wochentakt.** Rechts fünf Punkte Mo–Fr (12 px, Rahmen 2 px accent, gefüllt an Liege-Tagen, heute mit 2-px-Outline, Kürzel 11 px). Quelle: Termine der Woche mit `treatment_table_required`; aria-label nennt die Tage.
6. **Pillen sind Ziele.** „2. OG links“ = Knopf (36 hoch, Rahmen line-strong, aria-expanded) → Zugang/Besonderheit wie der i-Knopf; „! Erstaufnahme offen →“ → Akte. „✓ Liege“ bleibt Text. Pillenhöhe 36.
7. **Karte wird Arbeitskarte.** Ab `starts_at ≤ jetzt < ends_at`: Kicker „Jetzt · bis 10:10“, Hauptknopf „Dokumentieren und abschließen“, Navigation und sekundäres „Abschließen“ entfallen; großer Wegbalken zeigt „Nächster Weg danach“ (von = Ende des laufenden Termins). Abschnittslabel „Erster Weg“ → „Nächster Weg“ → „Jetzt“.
8. **Tagesabschluss in Tiefgrün.** Kein `confirmed` mehr: Tiefgrün-Karte ersetzt Liege-Zeile und Wegbalken (1c: den Aufkleber). Kicker „Heute“ Salbei, „✓ Alle Besuche erledigt“ 24/800 Papier, „4 von 4 Besuchen erledigt · 3 Dokus festgeschrieben“ accent-soft, Textlink „Morgen im Kalender →“ Papier. Höchstens einmal am Tag.

Prototyp-Hilfen ohne Repo-Entsprechung: Tweak „Uhrzeit“, Tweak „Fahrzeit“. Erledigt-Status ergibt sich im Prototyp aus der Uhr; im Repo bleibt er Serverzustand.

## 6 · Termin (`src/features/appointments/AppointmentDetailPage.tsx`)

- `Rueckweg` 44 hoch, 14 ink-muted, „← Übersicht“.
- Kopf: Kicker 12 Versalien „Termin · Hausbesuch“ (Fehlzeit: „Fehlzeit“), `h1` Name als Link in die Akte (26/32, 800, Unterstrich 2 px Offset 5, Hover ohne), darunter Badge (`appointmentStatusTon`) + `zustandsHinweis` 14 ink-muted. Rechts „Bearbeiten“ kompakt sekundär (nur `darfAendern`; Fehlzeit zusätzlich „Fehlzeit bearbeiten“).
- `Rueckmeldung` (Vorgang, Folgetermin, Eingangsmeldung) unter dem Kopf.
- Kachelreihe: **Wann** („Do 01.10.2026“ / „09:10–10:10 · 60 min“, `Laengenzeichen` in der Nebenzeile), **Anschrift** bzw. **Ort** (zwei Zeilen; Hausbesuch: Textlink „Navigation starten →“ = `NavigationZumTermin`), **Grundlage** (akzent; „Termin 2 von 6“, Nebenzeile „✓ gedeckt · Verordnung Dr. Roth“; `Deckungszeichen` + Textlink „Auf andere Grundlage übertragen“, wenn nicht gedeckt). Nur `kind === 'therapy'`.
- Aufklapper in Karte „Vor der Tür“ (= `Kurzblick`), rechts im Summary „Lesen wird protokolliert“ 13; offen ab 1024. Inhalt als zweispaltige `dl` 15: Liege, Zugang, Besonderheit, Zuletzt (letzte Doku + Textlink „Verlauf →“), Mitnehmen. Laden erst beim Öffnen (bestehend).
- Karte „Was ist passiert?“ (nur bestätigter Hausbesuch): `h2` 20/700, Hinweis 14. Drei Zeilen `py-3.5 border-t line`, je `flex flex-wrap items-center justify-between gap-2/4`: Text (16/600 + 14 ink-muted, `flex-1 basis-[220px]`) und Knopf rechts (volle Breite, wenn umgebrochen). 1 Primär „Dokumentieren und abschließen“, 2 Sekundär „Ohne Behandlung abschließen“, 3 Sekundär „Niemand angetroffen“ → öffnet unter der Zeile den Rückfrage-Kasten (Rahmen line-strong, Radius 14, 16 innen) mit Satz, `fieldset` „Protokoll vor Ort“ (3 Checkboxen), Fehler als `Statusmeldung ton="fehler"`, Hinweis 14 ink-muted, Knöpfe „Ja, niemand angetroffen“ (primär) + „Abbrechen“ (quiet). Fußzeile 14 ink-muted: „Hat die Patient:in vorher abgesagt? …“ (gekürzt, _neuer Text_). Praxis/Video: Karte „Nach dem Termin“ mit Primär „Dokumentieren und abschließen“ + Sekundär „Nicht angetroffen“.
- **Zyklus 3, kompakt:** Kopf = `h1` Name + Badge + quiet „Bearbeiten“ in einer Zeile; darunter **eine Metazeile** 14 ink-muted „Hausbesuch · Do 01.10.2026 · 09:10–10:10 · 60 min · Termin 2 von 6 · ✓ gedeckt · Verordnung Dr. Roth“ (ersetzt Kicker und Kachelreihe). **Aktionsleiste** (bestätigter Behandlungstermin) mit Hairlines oben/unten, 12 innen: Haken 40 (primär), „Doku“ (primär kompakt), Hausbesuch: „Niemand öffnet?“ (sekundär, `aria-expanded`, Protokoll klappt darunter auf) und „Ohne Behandlung“ (quiet); Praxis/Video: „Nicht angetroffen“ (sekundär). Keine Karte „Was ist passiert?“ und keine Erklärsätze mehr. **Dokumentation** als Abschnitt ohne Karte (Label 12 + Badge, Text in Papierfeld mit Hairline, Meta 13, kompakte Knöpfe). Danach eine **Zeilenliste** (`dl`, Zeilen 8 innen, Hairline, Spalten 96/132 + Rest): Anschrift + „Navigation →“, „Vor der Tür“ (Textknopf „Zugang, Besonderheit, Liege anzeigen · Lesen wird protokolliert“, offen ab PC; Unterzeilen Liege/Zugang/Besonderheit/Material), Zuletzt + „Verlauf →“. Abschluss/Absage ebenfalls als Zeilen. „Angaben“ und „Abrechnung“ als Zeilenlisten (Handy unten, PC Kontextspalte). Die Karten-Beschreibung darunter ist damit überholt, die Inhalte gelten weiter.
- _Zyklus 2 (ersetzt):_ Karte „Dokumentation“ direkt unter Kopf und Rückmeldung, sobald ein Eintrag existiert oder der Termin vorbei ist (ersetzt `TreatmentNoteSection` am Seitenende): `h2` 20/700 + Badge rechts: „✓ Festgeschrieben · Version 1“ (positiv) / „! Entwurf · Frist 08.10.“ (warnung) / „! Dokumentation fehlt“ (warnung). Freitext in vertieftem Feld (canvas, Radius 10, 12/14 innen, 16/1.5, `whitespace-pre-wrap`). Meta 14: festgeschrieben am … bzw. in Warnfarbe „Zuletzt geändert … Wird am 08.10.2026 automatisch festgeschrieben, wenn niemand vorher finalisiert.“ Knöpfe: Entwurf → Primär „Doku“ + `Rueckfrage` „Finalisieren“ (sekundär); fehlt → Primär „Doku“; final → kompakt „Nachtrag hinzufügen“ (sekundär), „Korrigieren“ (quiet). Rechts Textlink „Eintrag in der Akte →“ (Verlauf). Liegt ein Entwurf vor, entfällt die Karte „Was ist passiert?“.
- Reihenfolge der Hauptspalte (Zyklus 3): Kopf, Metazeile, Rückmeldung, Aktionsleiste (+ Protokoll), Dokumentation, Zeilenliste Anschrift/Vor der Tür/Zuletzt, Abschluss- bzw. Absage-Zeilen, Angaben (Handy), Absage-Rückfrage.
- Nach Abschluss / Nichtantreffen: Karte mit `dl` (Abgeschlossen am, Protokoll, Ausfallhonorar mit Hinweis „Wird unter Abrechnung → Leistungen erfasst.“) und Sekundärknopf „Termin wieder öffnen“. Die Zeile „Dokumentation + Öffnen →“ entfällt (steht in der Karte oben). Abgesagt: `dl` Absagegrund, Eingegangen, Ausfallhonorar; Satz „Eine Absage wird nicht zurückgenommen. Für einen neuen Termin: Termin anlegen in der Akte →“.
- Unter 900 px: Aufklapper in Karte „Alle Angaben“ (`DetailList` als zweispaltige `dl` 15: Patient:in, Behandelnde Person, Art, Status, Grundlage, Datum, Zeit, Anschrift, Beteiligte/Serie bei Fehlzeit). Ab 900 px in der Kontextspalte als Karte „Angaben“, darunter Karte „Abrechnung“ (`AbrechnungAbschnitt`: Empfänger, Rechnungen, Honorar; nur owner/office).
- Absage: `Rueckfrage` am Seitenende, Auslöser quiet „Termin absagen“ / „Nur diese Teilnahme absagen“; Inhalt unverändert (Pflichtgrund, Eingang, Datum/Uhrzeit bei „früher“, Hinweise). Selects in `grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3`. Fehlzeit zusätzlich „Fehlzeit absagen“, „Ganze Serie absagen“ (bestehend).

## 6a · Schreibseite (`CompleteTreatmentPage.tsx`; `TreatmentNotePage.tsx` entfällt als eigener Weg)

**Straffung (Jannes, 01.10., Zyklus 3): kompakt wie Fachsoftware.** Eine Fläche statt Karten, Trennung über Hairlines (`border-line`), Rhythmus 8/12/16, 12-px-Versalien nur für Abschnittstitel, Meta 13–14, Text 15–16, kompakte Knöpfe (40) und Chips (36/32). **Entschieden (Jannes, 01.10.): Richtung A · Freitext-Werkbank.** Richtung B (strukturierte Felder mit „Wie zuletzt“) ist aus dem Prototyp entfernt; die Beschreibung bleibt unten als verworfene Alternative.
**Abschließen und Dokumentieren sind getrennt (Jannes, 01.10.):** Der Termin wird über einen **Haken-Knopf** abgeschlossen (Übersicht: Karte und Zeilen; Kalender: Kachel bzw. Detailleiste; Termin: Zeile „Die Behandlung hat stattgefunden“). Der Knopf zur Dokumentation heißt überall nur **„Doku“**. Haken = `IconButton` 48 (primär, Hauptfarbe) bzw. 40/44 (sekundär, Rahmen line-strong) mit Strich-Haken (viewBox 20, Strich 2), `aria-label` „Termin abschließen“, `title`. Abschluss ohne Eintrag setzt den Termin auf „abgeschlossen“ und zeigt „Doku offen“ (warnung) in Übersicht und Kalender. Festschreiben der Dokumentation führt den Termin weiterhin als durchgeführt (ADR-018).

**Schreibseite.** Kopfzeile 48: Pfeil zurück (40, läuft durch den Textverlustschutz), Name 15/700, darunter 13 ink-muted „Dokumentation · Do 01.10. · 09:10–10:10 · Termin 2 von 6“. Kein `PageHeader`, kein `max-w`: die Seite füllt die Höhe. Türfall: eine Warnzeile (warnung-soft, 14) statt Kasten. Fehler als rote Zeile über dem Feld (`role=alert`). **Fußleiste** sticky unten (Papier, Hairline oben, 8/12 innen): links Chip „Verlauf (2) ▴“ (`aria-expanded`), rechts quiet „Entwurf“ + primär „Festschreiben“ (Türfall: „Mit Vermerk festschreiben“), beide kompakt 40. **Bisherige Einträge:** Handy als Blatt von unten (`position:absolute`, max. 62 % Höhe, Radius 14 oben, Rahmen line-strong; das Feld bleibt darüber sichtbar), ab Tablet als zweite Spalte 240–320 rechts (Hairline links), auf Tablet/PC standardmäßig offen, auf dem Handy zu. Kopf 44: „Bisherige Einträge (2)“ 14/700, „Lesen protokolliert“ 12, × 40. Alle Einträge untereinander, je Datum 14/700, Titel 13, „Version 1“ 12 rechts, Text 14/1.5; Fuß „Verlauf in der Akte →“. Textverlustschutz als Zeile über der Fußleiste (canvas, Hairline line-strong): „Text noch nicht gespeichert.“ + drei kompakte Knöpfe.

**Freitext-Werkbank (umgesetzt).** Chipzeile 36 direkt unter dem Kopf (Hairline unten, waagerecht scrollbar, kein Umbruch): Textbausteine (`TextbausteinLeiste`), Trenner, „+ Befund“ (`aria-expanded`, Zähler „· 3“). Befund-Werkzeug klappt als canvas-Streifen auf: Region-Chips 32 (gewählt = Hauptfarbe gefüllt), je Test eine Zeile mit „✓ unauffällig“ / „! auffällig“ (32), darunter Vorschlagssatz + „Übernehmen“ (gefüllt 32) / „Verwerfen“. Das Feld ist eine rahmenlose `textarea` auf Papier, 16/1.55, 14/16 innen, füllt die restliche Höhe (min 160). `Einfuegemeldung` 13 am unteren Feldrand.

**Verworfen · Richtung B, strukturierte Felder.** Vier Abschnitte mit Hairline: Verlauf, Befund (eingeklappt, „+ Befund hinzufügen“), Behandlung, Heimübungen. Je Abschnitt: Label 12 Versalien, rechts Chip „Wie zuletzt“ (28, kopiert den Abschnitt des letzten Eintrags), darunter „Zuletzt …“ 13 ink-muted (zwei Zeilen, `line-clamp`), rahmenlose `textarea` 2 Zeilen, 16/1.5. Gespeichert wird weiterhin **ein** Freitext: `Verlauf: …\nBehandlung: …\nHeimübungen: …` (ADR-006 bleibt; die Marken sind reiner Text). Beim Öffnen eines Entwurfs werden die Abschnitte an denselben Marken wieder zerlegt. Keine Textbausteine, kein Befund-Werkzeug (die Struktur ersetzt sie).

_Frühere Fassung (Zyklus 2, ersetzt):_ Eine Seite für Festschreiben und Entwurf. `Rueckweg` „← Termin/Übersicht“, Kicker „Dokumentation“ / „Ohne Behandlung dokumentieren“ / „Entwurf weiterschreiben“, `h1` Name, Meta 14 „Do 01.10.2026 · 09:10–10:10 · Termin 2 von 6“. `max-w-[720px]`.

- Türfall: Vermerk-Kasten (canvas, Rahmen line, Radius 14, 15/1.5) wie bisher, gekürzt auf zwei Sätze.
- **Karte „Bisherige Einträge (n) · zuletzt 28.09.2026“ (neu):** Aufklapper in Karte, zu; rechts „Lesen wird protokolliert“ 13. Lesen erst beim Öffnen (ANN-137). Offen: alle früheren Einträge als Zeilen (Datum 15/600, Titel 14 ink-muted, Badge rechts), jede Zeile selbst aufklappbar; der jüngste Eintrag ist offen, Freitext im vertieften Feld 15, Meta darunter. Fußzeile Textlink „Verlauf in der Akte →“ (läuft durch den Textverlustschutz). Ohne Vorgänger eine Zeile „Noch kein Eintrag vor diesem Termin.“
- `TextbausteinLeiste` als Reihe kompakter Sekundärknöpfe über dem Feld (bestehend). `TextArea` „Eintrag zur Behandlung“, 10 Zeilen, **ohne Hint**; `Einfuegemeldung` darunter 14 mit Textknopf „Rückgängig“.
- `BausteinFeld` als Aufklapper mit Rahmen line-strong unter dem Feld (bestehend), Badge „n angegeben“ im Kopf. Region-Chips (kompakt, primär = gewählt), je Test eine Zeile mit zwei Chips „✓ unauffällig“ / „! auffällig“; Vorschlag im vertieften Feld, Knöpfe „In den Text übernehmen“ (sekundär), „Verwerfen“ (quiet).
- `Textverlustschutz` als Kasten (Rahmen line-strong, 16 innen) über den Knöpfen: „Der Text ist noch nicht gespeichert.“ + „Speichern und weitergehen“ (primär), „Verwerfen“ (sekundär), „Weiterschreiben“ (quiet).
- Folgesatz 14 ink-muted direkt über den Knöpfen (ersetzt Folgen-Kasten, Feld-Hint und Fußnote): „Schreibt den Eintrag als Version 1 fest; der Termin gilt damit als durchgeführt. Danach nur mit Begründung änderbar.“ Knöpfe: Primär „Festschreiben“ (Türfall: „Mit Vermerk festschreiben“), Sekundär „Nur als Entwurf speichern“, quiet „Abbrechen“; unter 640 px untereinander, volle Breite.
- Nach Festschreiben/Entwurf: zurück zum Termin mit `Rueckmeldung` („Eintrag als Version 1 festgeschrieben. Der Termin ist abgeschlossen.“ / „Entwurf gespeichert – noch nicht finalisiert. Frist: 08.10.2026.“); die Karte „Dokumentation“ steht dort oben.
- Übersicht: Karte während des Besuchs: Haken (48, primär) + „Doku“ (primär, restliche Breite); vor dem Beginn Haken (40, sekundär) in der Zeile neben „Termin“ und „Bisherige Doku“ (öffnet den Behandlungsverlauf). Kompakte Zeilen offener Termine tragen rechts einen Haken 44 (sekundär).

## 7 · Patientenakte (`src/features/patients/PatientRecordLayout.tsx` + Bereiche)

- `Rueckweg`; bei Laden/Fehler `PageHeader` „Patientenakte“ + `LoadingState` in Karte bzw. `ErrorState` + „Erneut versuchen“; „Nicht gefunden“ unverändert.
- Kopfkarte (`PatientKopf`): `h1` Name 26/32 800 accent; Zeile 14 ink-muted „geb. 12.03.1961 · 65 Jahre · Tübingen“ + Badge „✓ In Versorgung“ / „! Nicht in laufender Versorgung“ / „Versorgung abgeschlossen am …“. Rechts kompakte Knöpfe „Termin anlegen“ (primär, nur aktiv + `canManageAppointments`) und „Grundlage erfassen“ (sekundär, `canWriteTreatmentBases`). `OhneNeueTermine` darunter 14.
- Kachelreihe im Kopf (ersetzt `HausbesuchHinweise` und `IntakeHint`): **Liege** akzent „mitnehmen“ (nur `treatment_table_required`), **Zugangshinweis**, **Besonderheit** (nur wenn hinterlegt; `whitespace-pre-line wrap-anywhere`), **! Erstaufnahme offen** warnung mit `openItemsText` und Textlink „Erledigen →“ (Ziel wie `IntakeHint`). Keine Reihe, wenn nichts hinterlegt.
- `Aktenavigation` unverändert: Pillen 44 hoch, 15, aktiv accent-soft/accent 600, `border-t line`, scrollt waagerecht unter 640, bricht ab 640 um.
- Bereich **Termine**: Kacheln „Nächster Termin“ (akzent; „Heute · 09:10–10:10“, „Hausbesuch · Jannes Wichelhaus“) und „Grundlage“ (neutral; „1 von 6 verbraucht“, Fortschrittsbalken 6 px line/accent, „Verordnung · gültig bis 31.12.2026“). Abschnitt „Kommende (n)“ mit Textlink „Dauertermin anlegen →“; Zeilen in Karte: Zeit zweizeilig (Wochentag Datum / Spanne), Titel = Art, Meta „Termin 3 von 6 · Person“, Badge „Geplant“ (neutral) oder Status. Aufklapper „Vergangene (n)“ gedämpft mit „✓ Dokumentiert“. Leer: Karte mit `EmptyState` „Noch keine Termine“ + Primärknopf „Termin anlegen“.
- Bereich **Behandlungsverlauf** (Zyklus 2, 01.10.): **Sprungleiste** sticky am oberen Rand von `main` (canvas-Grund, 8 px vertikal): Label „Springen zu“ 12 Versalien, je Monat eine Pille 36 hoch (Rahmen line-strong, Hover accent-soft), rechts „Lesen wird protokolliert“ 13; nur ab zwei Monaten. Kein Schreibknopf („Behandlungsnotiz“ entfällt, geschrieben wird am Termin). Einträge nach Monat gruppiert (Abschnittstitel 12 Versalien „September 2026“), als Karten (14/16 innen): Kopf „28.09.2026 · Behandlung 1 von 6“ 15/600, Datum = Link zum Termin, Badge „✓ Version 1“ / „Erstbefund“ (neutral) / „! Entwurf · Frist 08.10.“ (warnung); Freitext im vertieften Feld 15; Fußzeile 14 ink-muted (Person, festgeschrieben am bzw. „zuletzt geändert … wird am 08.10.2026 automatisch festgeschrieben“). Sprung per Anker scrollt `main`, 60 px Abstand für die Leiste. Leer: `EmptyState` „Noch kein Eintrag.“
- Bereich **Stammdaten**: Knopf „Stammdaten bearbeiten“ rechts; vier Karten `grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-2`: Person, Kontakt (Rufnummern/E-Mail als Links), Hausbesuch (Zugangshinweis, Besonderheit, Liege, Feste Therapeut:in), Verwaltung (Beginn, Status, `Rueckfrage` „Als inaktiv markieren“ unverändert).
- Kontextspalte ≥ 900 in allen Bereichen: Karte „Behandlungsgrundlage“ (Verordner:in, Umfang, ausgestellt, Fortschritt, „1 von 6 verbraucht · 4 geplant · 1 frei“), Karte „Kontakt“ (Mobil, E-Mail, Anschrift).
- Keine Fußnote „Zugriffe auf Patientenakten werden protokolliert.“ mehr (gestrichen, siehe Abschnitt 1).

## 7a · Kalender (`src/features/appointments/CalendarPage.tsx`, `CalendarGrid.tsx`) · Zyklus 4, 01.10.

Entscheidungen von Jannes: Woche nur mit eigenen Terminen, zusätzlich **Team-Tagesansicht** (Therapeut:innen nebeneinander), Handy = Tagesliste mit Wegbalken, Haken erst nach Tipp auf die Kachel.

- **Ansichtswechsel** im Kopf (Segment 40 hoch, gewählt Hauptfarbe gefüllt): Tablet/PC „Woche | Team“, Handy „Tag | Team“. Team = ein Tag, Spalte je Therapeut:in (Kopf: Name 14/700, „3 Termine“ 12), gleiche Kacheln; auf dem Handy waagerecht scrollbar (Spalten ≥ 150). ‹ › blättern in der Team-Ansicht tageweise. Fremde Termine im Panel ohne Haken und ohne „Doku“, mit Zeile der behandelnden Person.
- Kopf: `h1` „Kalender“, darunter 14 ink-muted „KW 40 · 28.09.–02.10.2026“ (Handy: „Donnerstag, 1. Oktober 2026“). Rechts Gruppe ‹ „Heute“ › (40 hoch; Pfeile als Icon-Knöpfe mit Rahmen line-strong, `aria-label` „Vorherige Woche“ / „Vortag“). „Heute“ deaktiviert, wenn schon heute.
- **Wochenraster (≥ 640):** Karte mit Hairlines, Spalten 48 + Mo–Fr, Zeitachse 07:00–18:00, 56 px je Stunde, Stundenlinien `line`. Heutige Spalte canvas-Grund, Tageszahl als gefüllte Pille (Hauptfarbe/Papier), Jetzt-Linie 2 px Hauptfarbe. Kachel = `button` (Radius 8, Rahmen line, **3 px Linie links** nach Status: bestätigt Hauptfarbe, dokumentiert line-strong (Text ink-muted), abgeschlossen ohne Doku warnung, nicht angetroffen warnung auf canvas, abgesagt danger auf canvas, Fehlzeit line-strong auf canvas); drei Zeilen 12/13/12: Zeit, Name, Unterzeile („Hausbesuch · Termin 2 von 6“, „✓ Dokumentiert“, „! Doku offen“, „× Abgesagt“). Gewählt: Rahmen Hauptfarbe, `aria-pressed`. Kein Schatten, kein Blur.
- **Tagesliste (Handy):** Zeilen 56 (`button`, `aria-pressed`): Zeit 15/600, Name 16/600 + Unterzeile 14, rechts 3 px Statuslinie; zwischen offenen Hausbesuchen der kleine Wegbalken (`Wegbalken` klein, Farbstufen wie Übersicht). Leer: „Keine Termine an diesem Tag.“ ‹ › blättern tageweise.
- **Terminpanel nach Tipp:** Kicker „Termin · Hausbesuch · Do 01.10.2026“, Name 20/700 als Link, Meta „09:10–10:10 · Termin 2 von 6“, Anschrift + Stockwerk, Badge Status (+ „! Doku offen“), Aktionen: **Haken 40 primär** (nur bestätigt), „Doku“ (sekundär; primär, wenn abgeschlossen ohne Doku), Textlinks „Bisherige Doku →“, „Termin →“, × 40. Platz: ≥ 1200 als Spalte 320 rechts neben dem Raster; darunter als Karte 380 unten rechts (Rahmen line-strong); Handy als Blatt über der Tab-Leiste (Radius 14 oben). Rückmeldung nach Haken als Statuszeile unter dem Kopf.
- Termin-Seite und Schreibseite öffnen aus dem Kalender mit Rückweg „← Kalender“; Datum/Metazeile kommen aus dem Termin (nicht mehr fest „01.10.2026“).

## 8 · Zustandsmodell des Prototyps (zur Orientierung)

```
screen: 'uebersicht' | 'termin' | 'akte' | 'platzhalter'   // + Rückweg-Stapel
terminId, patientId, bereich ('termine' | 'verlauf' | 'stammdaten' | …)
status[terminId]: 'confirmed' | 'completed' | 'no_show' | 'cancelled'   // Mutationen: complete, recordNoShow(protokoll), cancel(grund, eingang), reopen
rueckmeldung: string | null     // nach jedem Vorgang, role=status, nimmt Fokus
protokoll: [bool, bool, bool] + fehler   // alle drei Pflicht, sonst Statusmeldung fehler
absage: grund ('' | patient_request | practice_request | other), eingang ('jetzt' | 'frueher')  // grund Pflicht
zustand: 'normal' | 'laden' | 'fehler' | 'leer' | 'veraltet'   // Abfragezustände
geraet: Breite < 640 handy, < 1024 tablet, sonst pc; zweiSpalten = Inhaltsbreite ≥ 900
```

## 9 · Barrierefreiheit

- Ziele ≥ 44 px (Zeilen 56, Pillen-Navigation 44, Textlinks min-h 44, Kopfzeilen-Knöpfe 44). Kompakte Knöpfe 40 mit 8 px Abstand bleiben zulässig (bestehende Regel 44 für Tippziele: Innenabstand der Karte zählt mit; sonst 44 setzen).
- Status immer Zeichen + Wort. Kacheln tragen Text, keine reine Farbe. Fortschrittsbalken `aria-hidden`, Zahl steht daneben.
- `aria-current="page"` in Seitenleiste, Tableiste, Akte-Pillen. Rückmeldung `role="status"`, Fehler `role="alert"`. Aufklapper nativ (`details`), Chevron dekorativ.
- Fokus 2 px accent, Offset 2; auf Tiefgrün (1c) 2 px Papier. Kontraste: alle Paare aus `src/lib/kontrast.test.ts`; neu zu prüfen: Salbei-Kicker auf Tiefgrün nur ≥ 12/600 (5.9:1), Warn-Text auf Warnfläche (7.9:1).
- Druck: Kacheln werden zu Rahmen (Flächen transparent, bestehende Regel), Aufklapper im Druck `open`.

## 10 · Reihenfolge der Umsetzung

- Tokens ergänzen (`text-h2-mobil`, Schwelle, Kachel-Abstand); `PageHeader`, Kopfzeile, `Card` anpassen. Screenshot-Vergleich Desktop + 375.
- Bausteine `Wegbalken` (groß und klein), `Kachel`, `Zeile`, `Aufklapper`, `Statuszeichen`, `Fortschrittspunkte`, `JetztMarke` mit Tests in `bausteine.test.tsx`.
- Übersicht (nach Entscheidung 1a/1b/1c), dann Termin, dann Akte. Tests der Seiten bleiben grün: Texte unverändert, nur Struktur.
- Kalender-Kacheln ohne Schatten (eigener kleiner Loop).

Entwurf: Claude Design, 01.10.2026. Beispieldaten synthetisch. Rückfragen zu Varianten über die Kennungen 1a–1o im Entwurfsdokument.
