# Roadmap-Review 2026-09-06: Wettbewerb, Produktstand, Plan

> **Einmaliger Befund, nicht normativ.** Diese Datei steht unterhalb aller
> Planungsdokumente und entscheidet nichts. Sie beantwortet vier Fragen: Was
> haben vergleichbare Praxisprogramme, das uns fehlt? Wo reibt der heutige
> Produktstand im Alltag? Was fehlt der Roadmap 2.0, damit sie ein
> professioneller Plan bis zum Produktivbetrieb ist? Und mit welchem Verfahren
> werden die übrigen Bereiche systematisch besser? Sobald die Entscheidungen
> aus Abschnitt 8 in `ROADMAP.md`, `OPEN_DECISIONS.md` und `OPTIMIERUNG.md`
> eingearbeitet sind, wird diese Datei **gelöscht** — wie das Planungsreview
> vom 2026-09-05.

Ergebnisdateien dieses Reviews:

| Datei                                                                            | Inhalt                                                                          | Rang                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------- |
| [`ROADMAP-ENTWURF-2.1.md`](ROADMAP-ENTWURF-2.1.md)                               | Vollständiger Entwurf der Roadmap 2.1, ersetzt 2.0 nach den Entscheidungen      | Steuerung, kein Rang    |
| [`OPTIMIERUNG.md`](OPTIMIERUNG.md)                                               | Verfahren „Ablaufrunden": wie ein Arbeitsbereich messbar besser wird            | Steuerung, kein Rang    |
| [`../product/ideen/referenz-wettbewerb.md`](../product/ideen/referenz-wettbewerb.md) | Funktionsreferenz iPrax, THEORG, thevea, appointmed, Optica u. a. mit Quellen | Rang 6, nicht normativ  |
| [`../product/ideen/10-praxisverwaltung.md`](../product/ideen/10-praxisverwaltung.md) | Neue Bereichsdatei `PRX`: Ideen für Terminplanung, Akte, Abrechnung, Hausbesuch | Rang 6, nicht normativ |
| `OPEN_DECISIONS.md` B12 bis B15                                                  | Stichtag/Nummernkreis, E-Mail-Versand, PDF-Erzeugung, Terminerinnerung          | Register                |

---

## 1. Auftrag und Vorgehen

**Auftrag (Jannes, 2026-09-05):** Roadmap reviewen und professionalisieren, ein
möglichst finaler Plan für eine exzellente Software. Recherchieren, welche
Funktionen vergleichbare Terminierungsprogramme (iPrax, THEORG, thevea) haben,
die bei uns fehlen — so detailliert wie möglich, mit Screenshots und anderen
Quellen. Für die übrigen Bereiche und Oberflächen eine Herangehensweise
finden, mit der ihre Optimierung geplant werden kann.

**Vorgehen.** Sieben unabhängige Analysen, jede mit eigenem Blickwinkel, dann
Zusammenführung:

1. **Bestandsaufnahme des Codes** — 119 Fähigkeiten aus `src/`, Migrationen
   und Seed, je Kategorie mit Status (96 funktional, 23 Vorschau) und den
   ausdrücklich fehlenden Dingen.
2. **Bestandsaufnahme der Planung** — 77 Roadmap-Einträge, 77 Ideen, 27
   offene Punkte, damit jede Wettbewerbsfunktion eingeordnet werden kann als
   vorhanden, geplant, als Idee notiert, ausgeschlossen oder wirklich neu.
3. **Wettbewerbsrecherche** je Produkt und Querschnitt (Abschnitt 3).
4. **Roadmap-Kritik aus Lieferungssicht** — Kapazität, kritischer Pfad,
   fehlende Planelemente (Abschnitt 5).
5. **Roadmap-Kritik aus Produkt- und Nutzungssicht** — Kernabläufe, Bedienung
   im Hausbesuch, UI-Fundament (Abschnitt 4).
6. **Drei Methodenvorschläge** für die Optimierung der Bereiche
   (prozessbasiert, maßstabbasiert, portfoliobasiert), bewertet von drei
   Juroren mit verschiedenen Blickwinkeln, dann zu einem Verfahren
   zusammengeführt (Abschnitt 7).
7. **Gegenprüfung** der wichtigsten Behauptungen im Repository (Kontrastwerte
   der Design-Tokens nachgerechnet, Git-Log ausgezählt, fehlende Links und
   Druckstile per Suche belegt).

**Grenzen, ehrlich benannt.**

- **Keine Screenshots, keine Direktabrufe.** Der Egress-Proxy der
  Cloud-Umgebung blockiert alle Herstellerseiten, App-Stores, Hilfecenter und
  Vergleichsportale (`EGRESS_BLOCKED` für iprax-systems.com, sovdwaer.de,
  thevea.de, optica.de, physiosoftware-vergleich.de, apps.apple.com,
  intercom.help). Die Recherche stützt sich deshalb ausschließlich auf die
  Websuche, die je Treffer die URL und eine Zusammenfassung des Seiteninhalts
  liefert. Jede Funktion in der Referenz trägt ihre Quell-URL; wer sie prüfen
  will, öffnet sie auf einem Rechner ohne Proxy. Bildschirmfotos konnten nicht
  ausgewertet werden — die Referenz beschreibt, was Herstellertexte,
  App-Store-Einträge und Testberichte über die Oberflächen sagen.
- **Die Anwendung lief nicht.** Ohne Supabase in der Cloud-Umgebung sind
  Befunde zu Touch-Verhalten und Lesbarkeit aus dem Code abgeleitet und als
  „vermutet" gekennzeichnet; die Kontrastwerte sind aus den OKLCH-Tokens
  berechnet.
- **Eine Person, ein Projekt.** Alle Zahlen zur Nutzung sind geschätzt, bis
  eine Optimierungsrunde sie misst (`OPTIMIERUNG.md`, Evidenzstufe).

---

## 2. Gesamtstand

| Punkt              | Stand                                                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`             | `a9414c1` (Merge PR #13, Roadmap 2.0). Keine offenen Pull Requests, keine Remote-Branches außer `main`.                                                                                                             |
| Commits            | 109 seit 2026-08-28 (9 Kalendertage): 12 · 9 · **34** · 3 · 9 · 3 · 3 · 21 · 15 je Tag; 58 davon (53 %) an Samstag und Sonntag.                                                                                    |
| Gebaute Epics      | 8 in 9 Tagen (PAT, CAL ×2, STAFF-001, Vorschau-Umbau, DOK ×2 Loops, Planungsreview). Median 6 600 Diff-Zeilen je Epic; reine Bauzeit je Epic 30 bis 60 Minuten, Integration und CI-Reparatur dominieren die Kalenderzeit. |
| Abgenommene Epics  | **0 belegt.** Die Fortschrittstabelle hat keine Abnahme-Spalte; `docs/abnahme/` führt keinen Status.                                                                                                                |
| Codebasis          | 23 Migrationen, 16 Tabellen, 27 RPCs, rund 17 000 Zeilen `src/` ohne Tests; 18 Datenbank-, 42 Komponenten-, 15 E2E-Testdateien.                                                                                     |
| Funktional         | Patient:innen, Kalender Tag/Woche mit Ziehen, Termin anlegen/ändern/absagen/abschließen, Dokumentation mit Finalisierung und Korrektur, Mitarbeitende, Arbeitszeiten, Audit, Mein Tag.                              |
| Vorschau           | Abrechnung, Radflotte, Urlaub, Zeitkonto, Erstattungen, Teamchat, Touren — rund ein Drittel des Quelltexts, ohne Persistenz.                                                                                        |
| Ausdrücklich nicht | Verordnungen · Dokumente/Anhänge/Vorlagen · Terminserien · Absagegrund, No-show, Ausfallhonorar · Rechnungen · Benachrichtigungen jeder Art · Druck/Export · Konten/Passwort-Reset in der Anwendung · Löschung · Routing · Offline · KI. |

**Interpretation der Zahlen.** Das Planmaß „ein Loop pro Woche" aus Roadmap
2.0 ist um das Fünffache unterschritten worden — in einer Startwoche mit
grüner Wiese, klaren Mustern und ohne eine einzige Abnahme. Die Baukapazität
ist nicht der Engpass. Der Engpass ist Jannes' Zeit für Entscheidungen,
Abnahmen und externe Anfragen; ab November brauchen neun der Betriebsreife-
Pakete seine Hände oder Externe. Der Entwurf 2.1 rechnet deshalb mit zwei
Code-Loops je Woche und fünf Stunden Jannes-Zeit je Woche und zählt
abgenommene statt gebaute Epics.

---

## 3. Wettbewerbsanalyse — was andere haben und uns fehlt

Vollständige Tabellen je Kategorie mit Belegen:
[`referenz-wettbewerb.md`](../product/ideen/referenz-wettbewerb.md).
Hier das Ergebnis.

### 3.1 Umfang und Methode

| Produkt                 | Belegte Funktionen | Quellen | Konfidenz hoch |
| ----------------------- | ------------------ | ------- | -------------- |
| iPrax                   | 97                 | 33      | 75             |
| THEORG (mit 2GO, Klemmbrett, TheraConnect) | 112 | 88     | überwiegend    |
| thevea (mit Scan-App)   | 105                | 107     | überwiegend    |
| appointmed              | 114                | 108     | 94             |
| Optica Viva, MD Therapie, Starke Praxis, azh, NOVENTI u. a. | 111 | 65 | überwiegend |
| Querschnitt Hausbesuch, Mobil, Kommunikation | 49    | 36      | mittel         |
| Kriterien und Nutzerstimmen | 60 Kriterien, 56 Erwartungen, 18 Schmerzpunkte | 77 | — |

588 Rohbelege, mechanisch zusammengeführt und von Hand gegen die
Bestandsaufnahme des Codes (119 Fähigkeiten), die Roadmap (77 Einträge) und
den Ideenspeicher (77 Ideen) abgeglichen. Grenzen: nur Websuche, keine
Direktabrufe, keine Screenshots, Suchkontingent vor Abschluss erschöpft
(Abschnitt 1). Die Zahlen sind deshalb eine Untergrenze; die Einordnung je
Funktion ist belastbar, weil sie auf Herstellertexten beruht, nicht auf
Vermutung.

### 3.2 Das Ergebnis in vier Sätzen

Die Kette Verordnung → Serie → Zustände → Leistung → Rechnung → Zahlung, die
Roadmap 2.0 bis Dezember schließt, ist bei allen sechs Systemen Standard — dort
holen wir Parität nach, nicht Vorsprung. **Vier Funktionen stehen bei drei
oder mehr Wettbewerbern und nirgends bei uns:** Warteliste mit Nachrücken,
Terminerinnerung mit Einwilligung, Textbausteine in der Dokumentation und
Kennzahlen für die Praxisführung. **Kein Wettbewerber** hat ein Portal mit
Intake und Übungsplänen, eine Betreuung nach Therapieende oder ein Rollen- und
Auditmodell wie unseres; nur iPrax (Offline-first) und thevea (lesender
Offline-Kalender) lösen den Funkloch-Fall. Was den Wettbewerbern die meiste
Kritik einbringt — schwer erreichbarer Support, Instabilität, hoher
Einrichtungsaufwand, altbackene Oberflächen, mobile Apps ohne echten Nutzen —
ist zugleich die Liste dessen, was `OPTIMIERUNG.md` misst.

### 3.3 Fehlt und relevant — was in die Planung gehört

| Funktion (Wettbewerb)                                                  | Verbreitung          | Bei uns heute                          | Vorschlag                                   |
| ---------------------------------------------------------------------- | -------------------- | -------------------------------------- | ------------------------------------------- |
| Folgetermin ohne Neuauswahl, Anlegen per Tap auf freie Zeit            | iPrax, thevea        | nur aus der Akte                       | **Stufe 1**, UX-EPIC-001 (`IDEA-PRX-007`)   |
| Direktkontakt `tel:`, Adresse an Karten-App (THEORG 2GO, MD)           | 2 bis 3              | Nummer als Text                        | **Stufe 1**, UX-EPIC-001                    |
| Nächste Termine in der Akte, Akte als Gesamtübersicht                  | thevea, iPrax        | Akte ohne Termine                      | **Stufe 1**, UX-EPIC-001                    |
| Rechnungsempfänger-Stammdaten, verknüpfte Kontakte, beide auf der Rechnung | THEORG, appointmed, thevea | fehlt                          | **Stufe 1**, ABR-EPIC-002a (`IDEA-PRX-010`) |
| Sammelrechnung je Person und Monat mit Nachweis                        | appointmed, thevea, THEORG | fehlt                            | **Stufe 1**, ABR-EPIC-002a (`IDEA-PRX-013`) |
| Terminzettel, Terminübersicht, Tourenliste drucken                     | THEORG, appointmed, iPrax, Optica | fehlt                     | **Stufe 1**, CAL-EPIC-003b, E2 (`IDEA-PRX-006`) |
| Abstands-/Fahrpuffer-Prüfung (THEORG Abstände, MD Fahrzeiten)          | 2                    | fehlt                                  | **Stufe 1** als Regel, CAL-010 (`IDEA-PRX-002`) |
| Ausfallrechnung, Ausfallhonorar-Regel kommuniziert                     | iPrax; thevea Vorlagen | fehlt                                | **Stufe 1**, CAL-008 + ABR-001 + PAT-006    |
| Import bestehender Stammdaten (CSV), Wechselservice                    | iPrax, thevea, Optica | fehlt                                 | **Stufe 1**, MIG-001                        |
| Sitzungsschutz auf dem Handy, biometrischer Login                      | appointmed; Nutzerforderung | fehlt                           | **Stufe 1**, STAFF-004, Endgeräte-Richtlinie |
| Globale Suche, Schnellanlegen                                          | thevea, appointmed   | Suche nur in der Liste                 | **Stufe 1**, UX-EPIC-001 (`IDEA-PRX-020`)   |
| Verordnungszähler am Termin (8/10)                                     | thevea, THEORG       | fehlt                                  | **Stufe 1** als Akzeptanzhinweis CAL-007/ABR-002 (`IDEA-PRX-009`) |
| Textbausteine in der Dokumentation                                     | 5 Produkte, Standard | Freitext                               | **Entscheidung E-9** (`IDEA-PRX-011`)       |
| Zahlungserinnerung als Dokument (Mahnwesen bei 5 Produkten)            | Standard             | bewusst nicht Stufe 1                  | **Entscheidung E-9** (`IDEA-PRX-012`)       |
| Warteliste mit Zeitfenstern und Nachrücken                             | 7 Produkte, Standard | fehlt                                  | **Stufe 2**, Entscheidung E-9 (`IDEA-PRX-003`) |
| Terminerinnerung SMS/E-Mail, Bestätigung, Absage-Info                  | Standard             | keine Benachrichtigung                 | **Stufe 2**, B15; Stufe 1 Anrufliste (`IDEA-PRX-005`) |
| Automatische Terminsuche                                               | Standard             | fehlt                                  | **Stufe 2** (`IDEA-PRX-008`)                |
| Kennzahlen: Umsatz, Auslastung, offene Posten                          | Standard             | fehlt                                  | **Stufe 2** (`IDEA-PRX-025`), §20           |
| DATEV/CSV-Export für die Steuerberatung                                | 4 Produkte           | fehlt                                  | **Stufe 2** oder minimal in ABR-EPIC-003, B4 (`IDEA-PRX-026`) |
| Offline-Kalender lesend (thevea), Offline-first (iPrax)                | 2                    | nichts                                 | **Entscheidung E-12** (`IDEA-PRX-014`)      |
| Dokumente digital unterschreiben (iPrax, THEORG Klemmbrett, thevea)   | 3                    | fehlt                                  | **Entscheidung E-13** (`IDEA-PRX-015`)      |
| Aufgaben und Wiedervorlagen mit Patientenbezug                         | appointmed, MD       | fehlt                                  | Idee (`IDEA-PRX-019`)                       |
| Dublettenprüfung und Zusammenführen                                    | thevea               | fehlt                                  | Idee (`IDEA-PRX-018`)                       |
| Körperschema, Diktat, Foto an Doku, Verordnungsscan mit Erkennung      | Standard             | fehlt                                  | Etappe 2 bzw. Stufe 2 (`IDEA-PRX-023`, `-027`, `-028`) |
| Kartenzahlung SumUp beim Hausbesuch                                    | iPrax, thevea, appointmed | fehlt                             | Stufe 2, ADR-002 (`IDEA-PRX-022`)           |
| Online-Buchung oder -anfrage, Patienten-App                            | Standard (nicht iPrax) | fehlt                                | Etappe 4, B15                               |

### 3.4 Fehlt, aber außerhalb des Zielbetriebs

Räume, Geräte und Gruppentermine · Heilmittelkatalog, Fristen- und
Frequenzprüfung, Blankoverordnung, Rahmenverträge · GKV-Abrechnung,
Zuzahlung, Abrechnungszentrum, Preislistenservice · eGK, VSDM, TI, KIM ·
Kassenbuch mit TSE (nur bei Barzahlung) · E-Rechnung (bei keinem Produkt
belegt; Rechnungen an Verbraucher sind ausgenommen) · Provisionen,
Mandanten, mehrere Standorte · Selektionen und Serienbriefe für Marketing
(HWG, `IDEA-ANG-002`) · Gutscheine, Kurse, Rehasport. Nichts davon gehört in
die Roadmap; die Referenz nennt es, damit die Frage nicht wiederkommt.

### 3.5 Vorhanden oder Vorsprung

Rollenmodell mit vier Rollen und RLS (Wettbewerber: zwei bis drei Rollen,
2FA nirgends belegt) · Auditlog (Prüfkriterium der Portale, bei den
Produkten kaum belegt) · versionierte Dokumentation mit Korrektur, Nachtrag,
automatischer Finalisierung (nur Optica versioniert) · Arbeitszeiten und
Ausnahmen je Person · Terminänderungen serverseitig protokolliert ·
mobile-first ohne separate App · Datenminimierung (Office ohne klinischen
Inhalt) — und der gesamte Fernplan (Portal, Intake, Übungspläne, Tracking,
Betreuung nach Therapieende), den kein Wettbewerber hat.

### 3.6 Was die Recherche nicht leisten konnte

Screenshots und Handbuchkapitel im Original (Proxy); Details zu THEORG
Terminplan-Ansichten, Rechtemodell und Rechnungslayout; Optica-Handbuch;
Preise als verlässliche Angaben. Entscheidung E-14 schlägt vor, wie das
nachgeholt wird.

---

## 4. Produktstand aus Nutzungssicht

Maßstab: „exzellent" für genau diesen Betrieb — nur Hausbesuche, alle Wege
per Fahrrad, Privatabrechnung, Smartphone als Hauptgerät. Was bereits gut ist,
vorweg: Design-Tokens statt Farbwerte im Code, sichtbarer Fokus, Skip-Link,
Labels und `aria-describedby`, 44-px-Ziele, Tableiste mit „Mehr", Lade-, Leer-
und Fehlerzustände als Komponenten, Status immer als Text, ehrliche
Vorschau-Kennzeichnung, Rückfrage vor Irreversiblem, Kalenderzustand in der
Adresszeile, automatische Finalisierung. Für einen Stand nach neun Tagen ist
das ungewöhnlich sauber.

### 4.1 Die Bruchstellen im Hausbesuchstag (nachgeprüft)

| Nr   | Befund                                                                                                                                                                                                                                  | Beleg                                                                                             | Schwere |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------- |
| P-01 | Die Tagesliste zeigt Uhrzeit, Name und „Hausbesuch" — **keine Adresse, keine Telefonnummer, keinen Zugangshinweis**. Was die Therapeutin am Rad braucht, liegt einen Tap tiefer; `tel:`-Links gibt es nirgends in `src/`.               | `MyDayPage.tsx`, `appointments/api.ts` (`calendarEntrySchema` ohne `visit_*`); Suche nach `tel:` ohne Treffer | hoch |
| P-02 | **Termin anlegen geht nur aus der Patientenakte.** Aus Kalender, Mein Tag oder dem behandelten Termin gibt es keinen Weg; „Folgetermin" existiert nicht. Vorbelegung: Terminart „Praxis" (die Praxis hat keine Räume), Person leer, Datum leer. | `AuthenticatedRoutes.tsx`, `NewAppointmentPage.tsx`, `api.ts` (`leererTermin`)                    | hoch    |
| P-03 | **Die Akte zeigt keine künftigen Termine** — die häufigste Telefonfrage des Office („wann ist mein nächster Termin?") ist ein Kalenderdurchsuchen.                                                                                       | `PatientRecordDocumentation.tsx`, Abnahme DOK-003                                                 | hoch    |
| P-04 | Dokumentieren kostet **sechs Taps über drei Seiten** (Termin → Dokumentation anlegen → Entwurf speichern → Finalisieren → Bestätigen → Termin abschließen). Mit ABR-002 käme „Leistung erfassen" als weiterer Schritt dazu.             | `TreatmentNoteSection.tsx`, `TreatmentNotePage.tsx`, `AppointmentDetailPage.tsx`                  | hoch    |
| P-05 | **Kein Schutz gegen Textverlust im Feld**: kein Router-Blocker, kein `beforeunload`, kein Zwischenspeicher, keine Verbindungsanzeige (`navigator.onLine` kommt nicht vor). ADR-001 nennt unfinalisierte Entwürfe ausdrücklich als Offline-Umfang. | `TreatmentNotePage.tsx`; Suche ohne Treffer                                                     | hoch    |
| P-06 | Ziehen im Kalender startet nach **6 px** Bewegung, Kacheln tragen `touch-action: none`: auf dem Telefon wird ein Daumen-Scroll vermutlich zum sofort geschriebenen Verschieben ohne Rückgängig.                                           | `useTerminZiehen.ts` (`SCHWELLE = 6`), `CalendarGrid.tsx`                                          | hoch (vermutet) |
| P-07 | **Zwei Design-Tokens verfehlen die eigene AA-Zusage** in `index.css`: `ink-subtle` 3,9:1 (Feldhinweise, Zeitachse, Fußnoten; Grenze 4,5:1) und `line-strong` 1,7:1 (Feldränder; Grenze 3:1). Nachgerechnet aus den OKLCH-Werten.        | `src/index.css` Zeilen 21 und 24                                                                  | hoch    |
| P-08 | Fahrzeit zwischen zwei Hausbesuchen ist nirgends sichtbar; Touren sind Vorschau bis Stufe 2 (B7). Für eine Fahrradpraxis ist die Lücke zwischen zwei Terminen die zentrale Planungsgröße.                                                | `ToursPage.tsx`, Roadmap A2 Nr. 6                                                                 | hoch (planerisch) |
| P-09 | Patientenliste lädt alle Datensätze und filtert im Browser; Schnellsuche von Kalender, Mein Tag oder Terminformular gibt es nicht.                                                                                                       | `patients/api.ts`, `PatientsListPage.tsx`                                                         | mittel  |
| P-10 | Wochenansicht zeigt ohne Wahl die erste Person der Praxis, nicht die angemeldete Therapeutin; Zurück-Link am Termin führt immer zur Patientenliste.                                                                                      | `CalendarPage.tsx`, `AppointmentDetailPage.tsx`                                                   | mittel  |
| P-11 | Muster sind nicht als Bausteine verankert: Link-als-Button sechsmal kopiert, drei `DataRow`, drei `Section`, fünf handgebaute Rückfragen mit uneinheitlicher Fokusführung, kein Statusfeedback nach dem Speichern, roher `<select>` neben `Select`. | `src/components/ui`, `PatientDetailPage.tsx`, `AppointmentDetailPage.tsx` u. a.               | mittel  |
| P-12 | Keine Druckstile (`@media print` kommt nicht vor); E2 (Januar) verlangt einen druckbaren Tagesplan, Terminzettel und Rechnungs-PDF brauchen Druck ebenfalls.                                                                             | Suche ohne Treffer                                                                                | niedrig, wird Pflicht |
| P-13 | Kein „Kennwort vergessen", kein erkennbarer Sitzungsablauf; Fehlertexte raten „Sind Sie noch angemeldet?".                                                                                                                              | `LoginPage.tsx`, `MyDayPage.tsx`                                                                  | niedrig |
| P-14 | Vier Vorschau-Karten mit synthetischen Daten stehen bis Q2 2027 auf der täglichen Einstiegsseite unter den echten Terminen.                                                                                                            | `MyDayPage.tsx`                                                                                   | mittel  |

**Folgerung.** Die Roadmap 2.0 schließt die *fachlichen* Lücken der Kette
bis Dezember. Sie schließt nicht die *Bedienlücken*, an denen die Kette heute
schon reibt. Keine davon ist ein eigenes Epic; zusammen sind sie ein Loop von
der Größe eines DOK-Epics — und der Unterschied zwischen „funktioniert" und
„exzellent". Der Entwurf 2.1 fasst sie als **UX-EPIC-001 Hausbesuchstag**
direkt nach VER-EPIC-001, damit CAL-EPIC-003 und ABR-002 auf einem Schritt
„Behandlung abschließen" aufsetzen, statt ihn später umzubauen.

### 4.2 UI-Fundament: jetzt, nicht im Februar

UI-001 „Feindesign, Politur, Barrierefreiheit" steht in 2.0 im Februar 2027 —
nach rund zwanzig Loops, die neue Seiten auf dem heutigen Fundament bauen, und
parallel zu DSFA-Abschluss und Go-live-Vorbereitung. Die Kontrastfrage ist
eine Token-Änderung mit Test; die sechs fehlenden Bausteine (`ButtonLink`,
`Rueckfrage`, `Section`, `DataRow`, `Statusmeldung`, `SearchField`) verhindern
weitere Kopien. Beides gehört in einen kleinen Loop **UI-000 Fundament**
sofort nach VER-EPIC-001; UI-001 bleibt als Politur im Februar.

### 4.3 Funktionen, die aus dem besonderen Modell folgen

Kein Wettbewerber zeigt sie, weil Praxissysteme für Räume, Rezeption und GKV
gebaut sind. Sie stehen zusammen mit den Wettbewerbslücken als
`IDEA-PRX-001` bis `IDEA-PRX-028` im Ideenspeicher
([`10-praxisverwaltung.md`](../product/ideen/10-praxisverwaltung.md)); die
wichtigsten sind im Entwurf 2.1 verortet:

- **Zugangshinweis je Patient:in** (Etage, Klingelname, Schlüssel bei …,
  Hund, Rad-Abstellplatz) sichtbar in der Tagesliste — PAT-005.
- **Fahrpuffer als Praxisregel** ohne Kartendienst: Mindestabstand zwischen
  Hausbesuchen an verschiedenen Adressen, Warnung im Kalender — CAL-010.
- **Tag umplanen bei Ausfall** (Panne, Krankheit) mit Anrufliste — CAL-009.
- **Anrufliste für morgen** statt SMS-Erinnerung in Stufe 1.
- **Terminzettel als PDF** für Patient:innen ohne Portal.
- **Sammelrechnung je Person und Monat** mit Behandlungsnachweis;
  **Rechnungsempfänger-Stammdaten** (Beihilfe, PKV, Betreuung, Eltern).
- **Tagesplan-Cache für den Funkloch-Moment** — eine Entscheidung nach
  ADR-001, kein Automatismus.
- **Behandlungsbestätigung am Hausbesuch** (Unterschrift je Termin) — eine
  Entscheidung mit der Steuerberatung, nicht bauen.

---

## 5. Roadmap 2.0 aus Lieferungssicht

Roadmap 2.0 ist ein deutlicher Fortschritt: Zieltermin, drei Spuren, Spur B
mit Fälligkeiten, Etappe G mit Verantwortlichen, eine ehrliche
Abweichungsregel. Was ihr fehlt, ist die zweite Hälfte eines Einführungsplans
für Software, die Gesundheitsdaten verarbeitet.

### 5.1 Befunde

| Nr   | Befund                                                                                                                                                                                                                                        | Schwere | Im Entwurf 2.1                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| L-01 | Kapazität falsch gerahmt: „23 Loops in 29 Wochen ohne Puffer" beschreibt die Baukapazität; gemessen sind 8 Epics in 9 Tagen und 0 Abnahmen. Engpass ist Jannes' Zeit.                                                                          | hoch    | Kapazität kalibriert (2 Loops/Woche, 5 h Jannes/Woche), Abnahme-Spalte, Monatsreview               |
| L-02 | Keine Kalenderrealität: Feiertage, Urlaub, Praxisspitzen fehlen; Januar trägt sechs Pakete, September einen Loop; das Abbruchkriterium (ABR-EPIC-002 am 31.12.) liegt in den Feiertagen.                                                       | mittel  | Sperrzeit 21.12.–04.01., Last nach vorn, März als Puffer                                            |
| L-03 | **CAL-EPIC-003 zu groß**: ADR schreiben + Serie + acht Zustände mit Migration + Kalender-UI + Ausfallhonorar + Auditkatalog — so groß wie CAL-EPIC-001 und -002 zusammen.                                                                       | hoch    | ADR-018 als Docs-Session im September; CAL-EPIC-003a Zustände, CAL-EPIC-003b Serie                  |
| L-04 | **ABR-EPIC-002 zu groß**: Rechnungsempfänger, sieben Zustände, Nummernkreis unter Nebenläufigkeit, Snapshot, PDF, Archiv, Storno-Kette, Zahlungen — und neun offene ADR-009-Folgefragen.                                                       | hoch    | ABR-EPIC-002a Rechnung, ABR-EPIC-002b Dokument/Storno, ABR-EPIC-003 Zahlungen                       |
| L-05 | ABR-003 setzt eine PDF-Erzeugung voraus; Ausführungsort und Abhängigkeit sind nach §15.1 ein Stopp und nirgends entschieden.                                                                                                                   | mittel  | B14 in Spur B, fällig vor ABR-EPIC-002b                                                             |
| L-06 | Versteckte Abhängigkeit: das Rechnungsdokument muss „in seiner damaligen Form aufbewahrt" werden — braucht die Dateiablage; die Voraussetzungsspalte nennt nur ABR-EPIC-001.                                                                    | mittel  | DAT-001 als Voraussetzung von ABR-EPIC-002b                                                         |
| L-07 | Versteckte Abhängigkeit: Einladung und Passwort-Reset brauchen Transaktions-E-Mail — ein neuer Dienstleister nach §3.5, den kein Plan-Punkt nennt.                                                                                             | hoch    | B13 in Spur B, fällig vor STAFF-EPIC-002; Stufe 1 ohne Versand aus der Plattform als Option         |
| L-08 | ADR-018 entsteht als „erste Story" im Code-Loop; die Migration wäre eingespielt, bevor Jannes den ADR bestätigt hat.                                                                                                                            | mittel  | ADR-018 als Docs-Session, Bestätigung als Voraussetzung                                             |
| L-09 | Providerprüfung Supabase erst Okt/Nov; ein Nein hieße Wechsel von Auth, Storage, `pg_cron` und Deployment im November — ohne Gegenmaßnahme.                                                                                                     | hoch    | OPS-001-Dokument bis 30.09. (M0), erst danach ADR-017                                               |
| L-10 | Gegen Verzögerung der externen Prüfungen B1/B2 ist der Plan nicht robust: eine späte Binärregel, kein Nachhalten, kein Zwischen-Datum.                                                                                                        | hoch    | Meilensteine M0–M5 mit Ampel, Spur-B-Spalte „Stand", abgestufte Abweichungsregel, Risiko R1        |
| L-11 | **Bestandsdaten fehlen vollständig**: kein Wort zu Altsystem, Bestandspatient:innen, Stichtag, Import, laufenden Verordnungen, offenen Rechnungen, Nummernkreis.                                                                              | hoch    | MIG-000 (September, Jannes), MIG-001 (Dezember/März), B12                                           |
| L-12 | **Einführung fehlt**: kein Probebetrieb, keine Schulung, keine Stabilisierung, kein Rückfallplan; „Produktivbetrieb 31.03." vermischt „Gate bestanden" und „Praxis arbeitet damit" (ADR-007 Punkt 6 erlaubt vor dem Gate nur synthetische Daten). | hoch | Etappe H mit Probewoche, Schulung, Umstellung, Rückfallplan, Umschaltung; Gate M3 und Start M4 getrennt |
| L-13 | **Betriebsmodell fehlt**: Störungsmeldung, Hotfix-Weg (ADR-013 nennt ihn „nicht eingerichtet"), Release-Takt nach Go-live, Endgeräte-Richtlinie (Smartphone mit Akte im Hausbesuch ist die größte reale Angriffsfläche).                        | hoch    | BETRIEB-001, Endgeräte-Richtlinie in G14, „Sitzungen beenden" in STAFF-004                          |
| L-14 | Erstbefüllung der Produktion (Organisation, erstes `owner`-Konto, Katalog) ohne Seed hat kein Runbook.                                                                                                                                         | mittel  | OPS-007                                                                                             |
| L-15 | Jannes' Lieferungen (Katalog mit Preisen, Stammdaten, Logo, Bank, Altdaten-Export, Prüfstellen) sind nicht als Aufgaben mit Termin geführt.                                                                                                     | mittel  | Spalte „Jannes liefert" und Rückwärtsplan-Spalte                                                    |
| L-16 | Kein Risikoregister, kein Puffer, keine Definition of Done, keine Meilensteine außer G15.                                                                                                                                                      | hoch    | alle vier ergänzt                                                                                   |
| L-17 | Stufe 1 enthält die Portal-Zustände „angefragt", „vorgemerkt" (ADR-014: nicht vorbauen), aber nicht „Passwort vergessen" und „Sitzungen beenden".                                                                                             | mittel  | ADR-018 definiert acht, CAL-008 baut sechs; STAFF-004                                               |
| L-18 | Struktur: Status an drei Orten, Pakete an zwei Orten mit Inkonsistenzen (Betriebsdokumentation Jan/Feb, Providerprüfung Okt/Nov); keine Spalten für Ergebnis, Art, Aufwand; „Loop" zählt Code, Docs und Jannes-Aufgaben gleich.                 | niedrig | Rückwärtsplan trennt Code, Docs, Jannes, Extern; Ergebnis-Spalte; Änderungsvermerk                  |
| L-19 | **ADR-013 MUSS unerfüllt**: Branch Protection und Secret Scanning gelten „ab dem ersten Anwendungscode" (28.08.), stehen aber erst im Go-live-Kriterium.                                                                                       | hoch    | „Jannes-seitig diese Woche", Kriterium in M0                                                        |
| L-20 | Wochenupdate: `git log -20` sieht bei 21 bis 34 Commits je Tag keinen Tag; der Stand von Spur B steht nicht im Git — das Update sieht das eigentliche Risiko nie.                                                                               | mittel  | `--since='8 days ago'`, Spur-B-Spalte „Stand", festes Ausgabeformat mit Ampel                       |
| L-21 | Credit-Regeln: „höchstens zwei ADRs" kollidiert bei ABR und LOE mit der Sicherheitsanforderung; der unabhängige Zweitreview aus `DEVELOPMENT_WORKFLOW.md` fehlt in der Modelltabelle; Branch-Hygiene ungeregelt (sieben Merge-Commits am 04.09.). | mittel | Regel 6, 4 und 12 im Entwurf; Zweitreview-Zeile                                                     |
| L-22 | Abnahme: `docs/abnahme/` ist gut, aber ohne Status und Befundliste; lokale Abnahme braucht Docker Desktop, `test:db` läuft unter Windows nicht — Reibung, die die Abnahmerate senkt.                                                            | mittel  | Kopfzeile je Loop „abgenommen am"; Test-Umgebung im November (OPS-002)                              |

### 5.2 Was im Stufe-1-Umfang fehlt und was hinter den Go-live kann

**Rein:** Bestandsdatenübernahme (MIG) · Stichtag und Nummernkreis (B12) ·
Erstbefüllung (OPS-007) · Passwort vergessen, Sitzungen beenden (STAFF-004) ·
E-Mail-Entscheidung (B13) · PDF-Entscheidung (B14) · Tagesplan drucken im
Dezember statt Januar · Probewoche, Schulung, Umstellung, Rückfallplan (Etappe
H) · Endgeräte-Richtlinie · Betriebsmodell · die Bedienlücken aus 4.1
(UX-EPIC-001) · das Fundament (UI-000).

**Raus oder minimal:** Portal-Terminzustände · Rückzahlungs-UI (Modell ja) ·
mehrstufige Korrekturkette · OPS-005 als Automatisierung · OPS-006 als
vollständige Funktion · UI-001 als Feindesign · Legal-Hold-Oberfläche.

**Ausdrücklich Stufe 2, damit die Erwartung stimmt:** Terminerinnerung,
Online-Buchung, Rechnungsversand aus der Plattform, E-Rechnung, Mahnautomat,
Kartenzahlung, Kartendienst.

---

## 6. Vorschlag: Roadmap 2.1

Der vollständige Text steht in [`ROADMAP-ENTWURF-2.1.md`](ROADMAP-ENTWURF-2.1.md).
Die Änderungen gegenüber 2.0 in einem Blick:

1. **Zwei Zeitpunkte statt einem.** Go-live-Gate M3 (19.03.2027) und
   Produktionsstart M4 (31.03.2027), danach Stabilisierung bis M5 (30.04.).
2. **Meilensteine M0 bis M5** mit Kriterien und Ampel im Wochenupdate.
3. **Kapazität kalibriert:** zwei Code-Loops je Woche, fünf Stunden Jannes je
   Woche, Sperrzeit über die Feiertage, März als Puffer, knapp 60 Prozent
   Auslastung von September bis Februar.
4. **Abgestufte Abweichungsregel** und Trennung von Kern und Komfort.
5. **Risikoregister** R1 bis R11 mit Frühindikatoren.
6. **Etappe 1 neu geschnitten:** VER → UI-000 → UX-EPIC-001 → STAFF-EPIC-002
   (mit STAFF-004) → LOE → CAL-EPIC-003a → CAL-EPIC-003b → DAT → ABR-EPIC-001
   → ABR-EPIC-002a → ABR-EPIC-002b → ABR-EPIC-003; Softwareanteil bis M1
   (18.12.2026).
7. **Etappe G ergänzt:** MIG-000/001, OPS-007, BETRIEB-001, STAFF-004, E2-Funktion
   im Dezember, DSFA-Entwürfe ab Oktober, Test-Umgebung im November.
8. **Etappe H Einführung:** Probewoche, Schulung, Umstellung (Parallel- oder
   Stichtagsbetrieb), Rückfallplan, Umschaltung.
9. **Spur B ergänzt** um B12 bis B15 und eine Spalte „Stand", die Jannes
   pflegt; Providerprüfung auf den 30.09. vorgezogen.
10. **Definition of Done** je Story, Epic, Etappe; Löschpfad-Regel je neue
    Tabelle.
11. **Fortschritt mit Abnahme-Spalte**; Wochenupdate mit `--since`, Ampel und
    Praxistagebuch; Monatsreview.
12. **Optimierungsrunden** aus `OPTIMIERUNG.md` im Rückwärtsplan: Touren &
    Termine (Oktober), Patient:innen (November), Abrechnung (Dezember), Mein
    Tag (Januar), Messrunde vor dem Gate, Vollrunde nach vier Wochen Betrieb.
13. **Credit-Regeln korrigiert:** alle betroffenen ADRs statt höchstens zwei,
    ein aktiver Feature-Branch, Zweitreview für RLS, Löschung und
    Rechnungsausstellung.

Der Termin 31.03.2027 bleibt. Was sich ändert, ist, dass er jetzt ein Datum
mit Kriterien ist und nicht nur ein Datum.

---

## 7. Herangehensweise für die übrigen Bereiche und Oberflächen

**Frage.** Wie werden Mein Tag, Touren & Termine, Patient:innen, Team,
Betrieb und Abrechnung — und die vielen Oberflächen dahinter — systematisch
exzellent, ohne dass jede Session das Projekt neu erkundet oder ein
Methoden-Apparat entsteht, den nach zwei Runden niemand mehr pflegt?

**Verfahren zur Antwort.** Drei unabhängige Vorschläge aus verschiedenen
Blickwinkeln — (A) ablaufbasiert, (B) maßstab- und auditbasiert, (C)
portfoliobasiert — wurden von drei Juroren bewertet: Praxisnähe und Aufwand
für Jannes, Produkt- und UX-Fachlichkeit, Passung zur Projekt-Governance.

| Vorschlag                   | Jury Praxis | Jury UX | Jury Governance | Summe  |
| --------------------------- | ----------- | ------- | --------------- | ------ |
| A Ablaufrunden              | 8           | 7       | 8               | **23** |
| B Qualitätsmaßstab und Audit | 6          | 8       | 5               | 19     |
| C Portfolio und Evidenz     | 4           | 5       | 6               | 15     |

**Ergebnis.** A wird das Rückgrat: Die Einheit der Optimierung ist der
**Ablauf** (ein Job, den eine Rolle vom Auslöser bis zum Ergebnis erledigt),
nicht der Bildschirm und nicht die Funktion. Gemessen wird, wo der Ablauf
bricht — Zeit, Taps, Kontextwechsel, Doppelerfassung, Bruchstellen — unter den
sechs Betriebsbedingungen **Zeit, Hand, Licht, Netz, Schulung, Fehler**. Jede
Bruchstelle bekommt genau ein Ziel: Akzeptanzhinweis an ein geplantes Epic,
neues Epic (höchstens eines je Runde), Idee im Ideenspeicher, Verweis auf eine
offene Entscheidung, oder „Praxisprozess, akzeptiert". Aus B kommen der
Praxistest-Bogen für Jannes, die Oberflächen-Checkliste je Story und die
automatischen Prüfungen (375 px, Kontrast); aus C die Evidenzstufe an jeder
Zahl (gezählt, gemessen, geschätzt), die Störfallliste im Betrieb und die
§20-Regeln für jede Erhebung. Was in allen drei fehlte und aufgenommen wurde:
Erster-Tag-Protokoll, Fehlerpfade, Unterbrechungstest, Funkloch-Probe,
Schattentag, eine zweite Person vor dem Go-live, die Latte „nicht langsamer
als Papier", und eine Abbruchregel für die Methode selbst.

**Was das Verfahren nicht tut:** keine Telemetrie, keine Messung an
Mitarbeitenden (§20), keine Personas, kein Heuristik-Audit je Bildschirm,
keine Feature-Parität um ihrer selbst willen, keine zweite Reihenfolge neben
der Roadmap, kein neuer Rang, kein ADR, kein Skill.

Das Verfahren steht in [`OPTIMIERUNG.md`](OPTIMIERUNG.md); die Runden stehen
im Rückwärtsplan des Entwurfs 2.1; Verankerung in `CLAUDE.md`, im
Feature-Loop-Skill und in `docs/abnahme/README.md` ist Teil dieses Branches.

---

## 8. Entscheidungen für Jannes

Jede Frage ist so gestellt, dass ein Satz als Antwort reicht. Die Empfehlung
steht dabei; „Konsequenz" nennt, was die Antwort verändert. Der Entwurf 2.1
markiert die abhängigen Stellen mit `[E-n]`.

1. **E-1 Roadmap 2.1 als Rahmen.** Zwei Zeitpunkte (Gate 19.03., Start
   31.03.), Meilensteine M0 bis M5, kalibrierte Kapazität mit März als
   Puffer, Kern und Komfort getrennt, Risikoregister, Definition of Done,
   Etappe H. **Empfehlung: ja.** Konsequenz: der Entwurf ersetzt
   `ROADMAP.md`; das Wochenupdate meldet Ampeln; der Termin bleibt.
2. **E-2 UI-000 und UX-EPIC-001 direkt nach VER-EPIC-001.** Fundament
   (Tokens, sechs Bausteine, Druck, Verbindungsanzeige) und Hausbesuchstag
   (Tagesliste mit Adresse und Anruf, Folgetermin, nächste Termine in der
   Akte, „Behandlung abschließen", Textverlust-Schutz, Touch-Ziehen,
   Schnellsuche, Vorschau-Karten auf „Mein Tag" zusammengefaltet).
   **Empfehlung: ja.** Konsequenz: LOE und CAL rutschen zwei Wochen; jede
   spätere Seite entsteht auf dem korrigierten Fundament.
3. **E-3 Loops teilen.** ADR-018 als Docs-Session im September mit
   Bestätigung; CAL-EPIC-003 in Zustände (a) und Serie (b); ABR-EPIC-002 in
   Rechnung (a), Dokument und Storno (b) und Zahlungen (ABR-EPIC-003).
   **Empfehlung: ja.** Konsequenz: mehr Sessions, jede lesbar; keine
   Migration vor einem bestätigten ADR.
4. **E-4 E-Mail-Versand (B13).** Option a: nur die Auth-Mails des geprüften
   Providers (Einladung, Passwort zurücksetzen) — Teil der Providerprüfung
   OPS-001, kein zweiter Dienstleister; Rechnungen gehen aus dem
   Praxispostfach. Option b: eigener E-Mail-Dienst mit AVV jetzt. Option c:
   Stufe 1 ganz ohne Versand, Einladung über die Provider-Oberfläche.
   **Empfehlung: a.** Konsequenz: STAFF-EPIC-002 mit STAFF-004 kann im
   Oktober laufen; b und c bleiben möglich.
5. **E-5 PDF-Weg (B14).** Sofort: Druckansicht mit `@media print` für
   Tagesplan und Terminzettel (keine Abhängigkeit). Für die unveränderbare
   Rechnung legt ABR-EPIC-002a die Optionen (Browser-Druck in PDF,
   Bibliothek, serverseitige Funktion) mit Aufwand vor; Entscheidung dann.
   **Empfehlung: so.** Konsequenz: kein Stopp im November.
6. **E-6 STAFF-EPIC-002 in den Oktober vorziehen, mit STAFF-004** (Passwort
   vergessen, alle Sitzungen beenden). **Empfehlung: ja** — die erste
   Kollegin braucht vor der Probewoche ein Konto, und ein verlorenes Telefon
   braucht „Sitzungen beenden" am Tag 1. Konsequenz: hängt an E-4.
7. **E-7 Umstellung (Etappe H3).** Option a: vier Wochen Parallelbetrieb,
   altes Werkzeug für Rechnungen und Notfälle beschreibbar, wöchentlicher
   Abgleich. Option b: Stichtagsumstellung mit Rückfallplan, altes Werkzeug
   ab 31.03. nur lesend. **Empfehlung: a**, weil ein Fehler in der ersten
   Rechnung sonst ohne Netz bleibt; Kosten: Doppelerfassung für vier Wochen.
   Konsequenz: M5 am 30.04.; bei b endet Etappe H am 15.04.
8. **E-8 axe als Dev-Abhängigkeit** (`@axe-core/playwright`) für die
   automatische Barrierefreiheitsprüfung. Neue Abhängigkeit nach
   `CLAUDE.md`, nur in Tests. **Empfehlung: ja.** Konsequenz: eine Story in
   UI-000; ohne axe reicht der Kontrast-Test zum Start.
9. **E-9 Wettbewerbslücken in Stufe 1?** Drei Fragen mit einem Satz:
   Textbausteine als kleine Story in UX-EPIC-001 (**Empfehlung: ja**, billig,
   deterministisch, Zeitfresser Nr. 1) · Zahlungserinnerung als Dokument in
   ABR-EPIC-002b (**Empfehlung: ja**, ohne Stufen und Gebühren) · Warteliste
   und Terminerinnerung (**Empfehlung: Stufe 2**, erste Loops nach M5; B15
   mit der Datenschutzberatung anfragen). Konsequenz: je ein bis zwei
   Stories mehr in Stufe 1, B15 bekommt einen Termin.
10. **E-10 Wochenupdate-Prompt** auf das Format des Entwurfs umstellen
    (`--since`, Ampel M0 bis M5, Jannes liefert). **Empfehlung: ja**, über
    die Routines-Oberfläche oder eine Session. Konsequenz: das Update sieht
    Spur B.
11. **E-11 Optimierungsrunden** nach `OPTIMIERUNG.md`: erste Vollrunde Touren
    & Termine im Oktober (vor CAL-EPIC-003a), dann Patient:innen, Abrechnung,
    Mein Tag; Messrunde vor dem Gate; Zusatzkriterium in G18 „kein täglicher
    Ablauf mit Score 0". **Empfehlung: ja**, mit dem Zusatzkriterium.
    Konsequenz: rund zehn Stunden Jannes-Zeit bis März, anderthalb Loops
    Credits; die Roadmap bekommt Akzeptanzhinweise statt Bauchgefühl.
12. **E-12 Tagesplan-Cache für den Funkloch-Moment** (`IDEA-PRX-014`): die
    heute geladenen eigenen Termine bleiben lesbar, klar als Stand markiert,
    am Tagesende verworfen; Feldliste als `ANN` nach ADR-001. **Empfehlung:
    ja, als Story in UX-EPIC-001**, weil ADR-001 genau das vorsieht und E2 nur
    Papier liefert. Konsequenz: eine Annahme mehr im Register; kein Service
    Worker, keine Akte offline.
13. **E-13 Unterschrift am Hausbesuch** (`IDEA-PRX-015`): ob eine
    Behandlungsbestätigung je Termin für Beihilfe und PKV nötig ist, wird
    als Frage an die Steuerberatung (B4) mitgegeben; Behandlungsvertrag und
    Datenschutzinformation bleiben in Stufe 1 Papier mit Vermerk (PAT-006).
    **Empfehlung: so.** Konsequenz: keine Story vor der Antwort.
14. **E-14 Nachrecherche mit Screenshots.** Option a: Jannes öffnet die
    wichtigsten Seiten selbst (iPrax Funktionsseite, THEORG Terminplan,
    thevea Hilfeartikel, appointmed Help-Center) und schickt Bildschirmfotos
    in eine Docs-Session, die die Referenz ergänzt. Option b: eine Session
    mit erhöhtem Suchlimit, weiter ohne Bilder. **Empfehlung: a** für zehn
    Seiten, die in der Referenz mit „nicht belegt" markiert sind.
    Konsequenz: eine Docs-Session; sonst bleibt die Referenz, wie sie ist.

Nicht zu entscheiden, aber zu liefern (M0, 30.09.): Branch Protection und
Secret Scanning · Anfragen B1, B2, B4 mit Fristwunsch · MIG-000 (heutiges
Werkzeug, Zahl der aktiven Patient:innen, laufende Verordnungen, offene
Rechnungen, Exportformat, letzte Rechnungsnummer) · Urlaubszeiten bis März.

---

## 9. Nächste Schritte und lokale Umgebung

**Reihenfolge:**

1. Diesen Branch ansehen und mergen (Pull Request oder lokal).
2. Die vierzehn Fragen aus Abschnitt 8 beantworten — ein Satz je Frage
   reicht; „wie empfohlen" genügt als Antwort für alle.
3. Docs-Session „Roadmap 2.1 in Kraft setzen": Antworten in den Entwurf
   einarbeiten, `ROADMAP-ENTWURF-2.1.md` nach `ROADMAP.md` verschieben,
   `[E-n]`-Marker auflösen, Wochenupdate-Prompt anpassen (E-10), diese Datei
   löschen. Sonnet 5, `low`, kein Code.
4. Parallel die drei Docs-Sessions des Septembers: ADR-017, ADR-018,
   OPS-001-Dokument.
5. Erst danach `/feature-loop VER-EPIC-001` — der nächste Loop ist in beiden
   Roadmap-Versionen derselbe.

**Lokale Umgebung nachziehen** (Windows, Git Bash; nur Dokumentation, keine
Migration, keine neue Abhängigkeit):

```bash
git fetch origin --prune
git checkout claude/roadmap-optimization-competitor-analysis-r3qxl7   # zum Ansehen
git checkout main && git pull --ff-only origin main                   # nach dem Merge
```

Kein `pnpm install`, kein `supabase db reset` nötig. Die neuen und
geänderten Dateien: `docs/development/ROADMAP-REVIEW-2026-09-06.md`,
`ROADMAP-ENTWURF-2.1.md`, `OPTIMIERUNG.md`, `ROADMAP.md` (Hinweis,
Fortschritt), `ARBEITSBEREICHE.md` (ein Satz), `docs/product/ideen/
referenz-wettbewerb.md`, `10-praxisverwaltung.md`, `IDEENSPEICHER.md`
(Index), `docs/decisions/OPEN_DECISIONS.md` (B12 bis B15),
`docs/abnahme/README.md` (Oberflächen-Checkliste), `CLAUDE.md`
(Ablaufrunden), `.claude/skills/feature-loop/SKILL.md` (zwei Zeilen).
