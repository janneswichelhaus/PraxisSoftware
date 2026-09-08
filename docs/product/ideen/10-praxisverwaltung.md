# Praxisverwaltung: Termine, Akte, Abrechnung, Hausbesuch (PRX)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Die Bereichsdatei für den **Praxisbetrieb vor dem Portal**: alles, was
Terminplanung, Patientenakte, Verordnung, Abrechnung und den Hausbesuch
betrifft. Sie fehlte bisher — der Ideenspeicher kannte fast nur die
Betreuungsplattform nach Therapieende. Die Einträge stammen aus der
Wettbewerbsanalyse und dem Produktreview vom 2026-09-06
([referenz-wettbewerb.md](referenz-wettbewerb.md),
Roadmap-Review vom 2026-09-06, in der Git-Historie unter Commit `7ab6f71`).
Sie stehen auf `vorschlag`, bis Jannes sie bestätigt; einige sind in der
Roadmap 2.1 verortet — das macht sie nicht zu Aufträgen. Am 2026-09-06 hat
Jannes vier davon bestätigt (`IDEA-PRX-003`, `-011`, `-012`, `-014`), einen
verworfen (`IDEA-PRX-015`) und zwei eigene Vorgaben zum
Lastenrad-Hausbesuchskonzept eingebracht (`IDEA-PRX-029`, `-030`); drei
Vorschläge dazu folgen (`IDEA-PRX-031` bis `-033`). Am 2026-09-08 hat Jannes
Terminlänge und Fahrpuffer verbindlich entschieden — `IDEA-PRX-002` ist damit
von `vorschlag` auf `entschieden` gestellt.

---

### IDEA-PRX-001 — Zugangshinweis je Patient:in

| | |
|---|---|
| Status | vorschlag |
| Quelle | Produktreview 2026-09-06 |
| Berührt | PAT-005, UX-EPIC-001 (Entwurf), ADR-011 |

**Idee.** Ein eigenes Feld in den Stammdaten: Etage, Klingelname, „Schlüssel
bei Nachbarin", „Hund", Rad-Abstellplatz, bevorzugte Zeiten. Sichtbar in der
Tagesliste und am Termin, nicht nur in der Akte.

**Warum.** Es gibt keine Rezeption, die die Tür öffnet. Der erste Besuch einer
Vertretung scheitert sonst am Klingelschild. Kein Wettbewerber hat das Feld,
weil ihre Praxen Räume haben.

**Vorsicht.** Organisatorisch, keine Gesundheitsdaten — aber Freitext, der
nie in Logs landen darf (ADR-011).

---

### IDEA-PRX-002 — Terminlänge und Fahrpuffer als Praxisregel, ohne Kartendienst

| | |
|---|---|
| Status | **entschieden — Jannes, 2026-09-08** |
| Quelle | Produktreview 2026-09-06; verbindlich entschieden von Jannes am 2026-09-08 |
| Berührt | `PROJECT_PRINCIPLES.md` §8, §9, §6.2; B7; CAL-EPIC-003b (CAL-010); bereits umgesetzt: CAL-005 (Raster) |

**Entscheidung (Jannes, 2026-09-08).**

1. Jeder angebotene Behandlungstermin hat ein Zeitfenster von **genau 60
   Minuten**. Die Dokumentation ist darin enthalten — es gibt **keinen
   separaten Dokumentationsblock** und **keine feste Aufteilung** zwischen
   Behandlung und Dokumentation innerhalb der 60 Minuten.
2. Terminstarts bleiben im bestehenden **5-Minuten-Raster** möglich, zum
   Beispiel 09:05, 09:10 oder 09:15 — keine Beschränkung auf volle Stunden.
3. Zwischen zwei Terminfenstern wird **zusätzlich** die Fahrzeit
   berücksichtigt. Sie darf **durch Rundung auf das Raster nicht verkürzt
   werden**: der früheste zulässige Folgetermin ist der nächste Rasterschritt
   **auf oder nach** Ende plus Fahrzeit — es wird auf das Raster **aufgerundet,
   nie abgerundet**.

   Beispiel ohne weitere Sperren oder Puffer: Termin 09:05–10:05, anschließend
   12 Minuten Fahrt (Ende plus Fahrzeit = 10:17). Der früheste Folgetermin
   beginnt um **10:20** — 10:17 selbst liegt auf keinem 5-Minuten-Raster, und
   ein Abrunden auf 10:15 würde die Fahrzeit verkürzen.

**Warum.** §9 verlangt, dass die Anwendung erkennt, ob zwei Termine zeitlich
erreichbar sind; §8 nennt Behandlungsdauer und Fahrzeit als Constraints der
Terminplanung. MD Therapie plant Fahrzeiten automatisch, THEORG kontrolliert
Abstände zwischen Terminen. Bis der Kartendienst (B7) für Fahrzeiten
entschieden ist, geht das deterministisch mit von der Praxis gepflegten
Zahlen — und danach bleibt die Regel als Untergrenze bestehen. Seit dem
2026-09-06 ist Google Maps als Kartendienst entschieden; Fahrzeiten aus dem
Dienst kommen mit TOUR-EPIC-001b (`IDEA-PRX-032`).

**Verhältnis zur bisherigen Fassung dieser Idee.** Der ursprüngliche Vorschlag
sah eine `owner`-Einstellung „Mindestabstand zwischen zwei Hausbesuchen an
verschiedenen Adressen" in Minuten vor, dazu optional von Hand gepflegte
Fahrminuten je Patient:in ab Depot, mit einer Warnung beim Anlegen und beim
Ziehen. Das bleibt der vorgesehene Mechanismus — deterministisch (§6.2), eine
Warnung statt einer Sperre, keine Verschiebung bestätigter Termine (§8) — jetzt
mit der von Jannes präzisierten Rundungsregel: **aufrunden auf den nächsten
Rasterschritt, nie abrunden.**

**Umsetzungsstand (Stand 2026-09-08).** Was von der Entscheidung bereits
gebaut ist und was noch fehlt:

- **Raster (Punkt 2): umgesetzt.** `appointment_grid_minutes` erlaubt 5, 10
  oder 15 Minuten, praxisweiter Standard ist bereits 5; der Beginn wird gegen
  Mitternacht der Praxiszeitzone geprüft (CAL-005,
  `supabase/migrations/20260830120000_scheduling_grid.sql`). Deckt sich mit
  der Entscheidung, sofern die Praxis beim 5-Minuten-Raster bleibt.
- **Feste 60-Minuten-Terminlänge (Punkt 1): nicht umgesetzt.**
  `create_appointment` und `update_appointment` lassen Beginn und Ende
  unabhängig frei wählen — „die Dauer bleibt frei" ist dort bewusst so
  kommentiert, damit ein Bestandstermin auf einem verschärften Raster
  verschiebbar bleibt
  (`supabase/migrations/20260830120200_appointment_scheduling_rules.sql`).
  Das Anlageformular (`AppointmentFormFields.tsx`) hat zwei unabhängige
  Zeitfelder „Beginn" und „Ende" ohne jede Vorbelegung; heute wird bei jedem
  Termin auch das Ende von Hand eingetragen. Die Entscheidung verlangt keine
  Änderung der freien Dauer auf Datenbankebene (das bleibt aus denselben
  Gründen sinnvoll), sondern einen Standard von 60 Minuten auf der
  Bedienebene.
- **Fahrpuffer zwischen Hausbesuchen (Punkt 3): nicht umgesetzt, geplant.**
  Es gibt weder eine Mindestabstands-Einstellung noch je Patient:in gepflegte
  Fahrminuten noch eine Warnung im Kalender; zwei Hausbesuche an
  verschiedenen Adressen lassen sich heute ohne jeden Abstand hintereinander
  anlegen. Vorgesehen als CAL-010 in CAL-EPIC-003b (Roadmap, Oktober 2026),
  nach VER-001 und CAL-EPIC-003a.

**Vorsicht.** Deterministisch (§6.2), keine Optimierung, keine Verschiebung
bestätigter Termine (§8). Die Aufrundungsregel aus Punkt 3 ist ein
eigenständiges, leicht falsch zu implementierendes Detail (naheliegend wäre
fälschlich Abrunden) und gehört als Testfall mit dem Beispiel oben in
`pnpm test:db`, sobald CAL-010 gebaut wird.

---

### IDEA-PRX-003 — Warteliste mit Zeitfenstern und Nachrücken

| | |
|---|---|
| Status | bestätigt für Stufe 2 (Jannes, 2026-09-06, E-9) |
| Quelle | Wettbewerbsanalyse 2026-09-06 (Standard bei sieben Produkten) |
| Berührt | §8; CAL-008 (Absage); B15 |

**Idee.** Personen ohne zeitnahen Termin stehen mit Wochentag- und
Tageszeitpräferenz, Dringlichkeit und Verordnungsbezug auf einer Liste. Wird
ein Termin abgesagt, zeigt die Software die passenden Einträge; die Praxis
ruft an (Anrufliste) und übernimmt den Termin mit einem Tap.

**Warum.** iPrax, THEORG, thevea, appointmed, Optica, MD und henara haben sie;
Nutzer:innen nennen sie als Zeitersparnis Nr. 1 im Alltag. Für eine Praxis,
deren Kapazität an Radwegen hängt, ist eine Lücke im Plan teurer als in einer
Praxis mit Räumen.

**Vorsicht.** Nachrücken „automatisch" hieße Benachrichtigung — das ist B15.
Bis dahin ist die Warteliste eine Liste mit Anrufhinweis.

**Entschieden 2026-09-06 (E-9):** Stufe 2, erster Loop nach dem ersten
Betriebsmonat (M6) — die Praxis eröffnet am 01.07.2027 und weiß erst dann,
wie groß die Nachfrage ist.

---

### IDEA-PRX-004 — Tag umplanen bei Ausfall, mit Anrufliste

| | |
|---|---|
| Status | vorschlag |
| Quelle | Produktreview 2026-09-06 |
| Berührt | ADR-018, CAL-EPIC-003a (Entwurf CAL-009), §4.3 |

**Idee.** Ein Platten um 8:10 Uhr trifft sechs Haushalte ohne Wartezimmer.
Eine Aktion „Tag umplanen": alle Termine einer Person eines Tages auf
„abgesagt" oder „vorgemerkt" setzen, dazu eine Anrufliste mit Name, Nummer,
Uhrzeit und Erledigt-Haken; optional Übergabe an eine Kollegin.

**Warum.** Heute sechsmal Termin öffnen, absagen, bestätigen und die Nummern
zusammensuchen. Optica benachrichtigt bei Therapeutenausfall automatisch —
das ist bei uns B15; die Anrufliste geht sofort.

**Vorsicht.** Absage ist Statuswechsel und wird auditiert; die Anrufliste ist
organisatorisch (§4.3).

---

### IDEA-PRX-005 — Anrufliste für morgen

| | |
|---|---|
| Status | vorschlag |
| Quelle | Produktreview 2026-09-06 |
| Berührt | B15, CAL-008 |

**Idee.** Eine Liste für das Office: wen für morgen anrufen oder bestätigen,
mit Erledigt-Haken. Der Ersatz für die Terminerinnerung per SMS, solange kein
Anbieter geprüft und keine Einwilligung eingeholt ist.

**Warum.** Erinnerungen 24 Stunden vorher senken Ausfälle laut Portalen um
bis zu 30 Prozent. Das Telefon ist der Kanal, den es schon gibt.

---

### IDEA-PRX-006 — Terminzettel und Terminübersicht als PDF

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (THEORG, appointmed, iPrax, Optica) |
| Berührt | CAL-007, UI-000 (Druck-Basis), B14 |

**Idee.** „Ihre nächsten Termine" als Ausdruck oder PDF je Person; eine
Tages- oder Tourenliste je Therapeut:in zum Drucken (deckt E2 mit ab).

**Warum.** Hochbetagte Patient:innen ohne Portal; heute schreibt die
Therapeutin Zettel per Hand. THEORG verkauft dafür sogar Papierblöcke.

**Vorsicht.** Das Dokument enthält Termine, also ein Gesundheitsdatum;
Ausgabe nur an die Person selbst, kein Versand ohne B15.

---

### IDEA-PRX-007 — Folgetermin und Schnellanlage

| | |
|---|---|
| Status | vorschlag |
| Quelle | Produktreview 2026-09-06; iPrax „Weiterer Termin" |
| Berührt | UX-EPIC-001 (Entwurf) |

**Idee.** Am Termin ein Knopf „Folgetermin": dieselbe Person, dieselbe Art,
dieselbe Dauer, eine Woche später zur gleichen Zeit — anpassbar mit einem
Tap. Im Kalender Tap auf freie Zeit → Patientensuche. Vorbelegung überall:
Hausbesuch, angemeldete Person, heute.

**Warum.** Der häufigste Einzelvorgang am Ende jedes Besuchs ist heute der
teuerste der Anwendung (acht Interaktionen über drei Seiten).

---

### IDEA-PRX-008 — Automatische Terminsuche

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (Standard) |
| Berührt | §8, §9; CAL-007; B7 |

**Idee.** „Nächster freier Termin für diese Person": Vorschläge nach
Therapeut:in, Dauer, Wunschzeitfenster, Fahrpuffer; thevea trägt so eine
ganze Verordnung mit wenigen Klicks ein.

**Warum.** Bei allen sechs Systemen vorhanden. Bei uns ist der Nutzen erst
groß, wenn Fahrzeiten bekannt sind — vorher schlägt die Suche Termine vor, die
auf dem Rad nicht erreichbar sind.

**Offen.** Erst nach TOUR-EPIC-001b (Fahrzeiten) oder mit der Regel aus
PRX-002 und den Gebietstagen aus PRX-031 als Näherung?

---

### IDEA-PRX-009 — Verordnungszähler am Termin

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (thevea „8/10", THEORG Terminblatt) |
| Berührt | VER-001, CAL-007, ABR-002, ADR-009 |

**Idee.** Jeder Termin kennt seine Verordnung und seine Position darin
(„Termin 8 von 10"); die Akte zeigt das Restkontingent; ABR-002 verbraucht
es bei der Leistungserfassung. Nachträgliches Verknüpfen möglich.

**Warum.** Roadmap 2.0 nennt den automatischen Kontingentverbrauch als „wird
in ABR-002 entschieden". thevea und THEORG zeigen, dass der Zähler am Termin
der Ort ist, an dem Praxen ihn erwarten.

---

### IDEA-PRX-010 — Rechnungsempfänger-Stammdaten und verknüpfte Kontakte

| | |
|---|---|
| Status | vorschlag |
| Quelle | Produktreview und Wettbewerbsanalyse 2026-09-06 |
| Berührt | §19, ADR-009, ADR-008; ABR-003 (Entwurf ABR-003a); B5 |

**Idee.** Beihilfestelle, PKV, Betreuung, Eltern als eigene Kontakte mit
Rolle, verknüpft mit der Patientin; die Rechnung trägt Patient:in und
Empfänger. Gepflegt vom Office in der Akte.

**Warum.** §19 trennt Patient:in und Empfänger; nirgends stand, wer den
Empfänger anlegt und wo. appointmed druckt beide Datensätze auf die Rechnung,
THEORG und thevea führen den abweichenden Empfänger je Patient:in.

**Vorsicht.** Daten Dritter; Zweck Abrechnung; Frist wie die Rechnung.
Vertretungszugriff auf die Akte ist etwas anderes (B5).

---

### IDEA-PRX-011 — Persönliche Textbausteine in der Dokumentation

| | |
|---|---|
| Status | bestätigt (Jannes, 2026-09-06, E-9) |
| Quelle | Wettbewerbsanalyse 2026-09-06 (Standard bei fünf Produkten) |
| Berührt | ADR-016, ADR-006, ADR-005; UX-EPIC-001 |

**Idee.** Bausteine je Therapeut:in und je Praxis, per Tap in den Freitext
eingefügt; keine Variablen aus der Akte in der ersten Stufe; kein
Sprachmodell.

**Warum.** Am Telefon getippte Freitexte sind der Zeitfresser Nr. 1;
Nutzer:innen wollen „digital direkt während der Behandlung dokumentieren".
Deterministisch, ohne Patientenbezug in den Bausteinen, ADR-006 unberührt.

**Entschieden 2026-09-06 (E-9):** Stufe 1, als kleine Story in UX-EPIC-001.

---

### IDEA-PRX-012 — Zahlungserinnerung als Dokument

| | |
|---|---|
| Status | bestätigt (Jannes, 2026-09-06, E-9) |
| Quelle | Produktreview und Wettbewerbsanalyse 2026-09-06 |
| Berührt | ADR-009 (Mahnwesen offen), ABR-EPIC-002b, ABR-005 |

**Idee.** Aus einer überfälligen Rechnung eine Zahlungserinnerung als
Dokument erzeugen (Datum, Betrag, Frist), ohne Stufenlogik, ohne Gebühren,
ohne Automatik. Mahnstufen kommen mit ABR-005 nach Praxiserfahrung.

**Warum.** Die Roadmap hält Mahnwesen bewusst aus Stufe 1 heraus. Ohne die
minimale Erinnerung beginnt das Office ab der Eröffnung im Juli 2027 mit
Handarbeit außerhalb der Plattform (§2.1). THEORG, thevea, Optica, MD und
iPrax haben Mahnwesen. **Entschieden 2026-09-06 (E-9):** Stufe 1, als
Dokument in ABR-EPIC-002b, ohne Stufen und Gebühren.

---

### IDEA-PRX-013 — Sammelrechnung je Person und Monat mit Behandlungsnachweis

| | |
|---|---|
| Status | vorschlag |
| Quelle | Produktreview und Wettbewerbsanalyse 2026-09-06 |
| Berührt | ADR-009, §4.4 (C1, ANN-006), ABR-003 |

**Idee.** Mehrere Leistungen einer Person zu einer Rechnung bündeln; Anhang
mit Datum, Leistungskürzel und Therapeut:in je Termin; auch aus bereits bar
quittierten Terminen (appointmed).

**Warum.** Privatabrechnung an Beihilfe und PKV wird monatlich gebündelt
eingereicht; C1 hat die Kürzel für das Office freigegeben.

**Vorsicht.** Snapshot nach ADR-009; keine Diagnosetexte (§4.4).

---

### IDEA-PRX-014 — Tagesplan-Cache für den Funkloch-Moment

| | |
|---|---|
| Status | bestätigt (Jannes, 2026-09-06, E-12) |
| Quelle | Produktreview 2026-09-06; thevea Offline-Kalender, iPrax Offline-first |
| Berührt | ADR-001 (offene Folgefrage Feldliste), ADR-015 (kein Service Worker), §2.2; UX-EPIC-001 |

**Idee.** Die heute geladenen eigenen Termine mit Adresse und Zugangshinweis
bleiben im Speicher der Seite lesbar, klar markiert „Stand von 07:52"; am
Tagesende verworfen. Kein Service Worker, keine Akte offline.

**Warum.** ADR-001 nennt „Tagesplan" und „minimal notwendige
Hausbesuchsdaten" ausdrücklich; E2 liefert nur Papier. thevea speichert den
Kalender lesend auf dem Gerät, iPrax alles.

**Entschieden 2026-09-06 (E-12):** eine Story in UX-EPIC-001. Feldliste,
Vorhaltedauer und Verschlüsselung werden beim Bau als `ANN` nach ADR-001
registriert; kein Service Worker, keine Akte offline.

---

### IDEA-PRX-015 — Unterschrift am Hausbesuch, digitale Vorlagen

| | |
|---|---|
| Status | verworfen (Jannes, 2026-09-06, E-13) |
| Quelle | Wettbewerbsanalyse 2026-09-06 (iPrax, THEORG Klemmbrett, thevea Signatur) |
| Berührt | §4.4 („gegebenenfalls Signatur"), ADR-008, ADR-017, PAT-006 |

**Idee.** Behandlungsvertrag, Datenschutzinformation, Ausfallhonorar-Regel und
gegebenenfalls eine Behandlungsbestätigung je Termin auf dem Telefon der
Therapeutin unterschreiben; Ablage nach ADR-017.

**Warum.** Ohne Praxis gibt es keinen anderen Ort dafür. Bei Beihilfe und PKV
wird eine Bestätigung der Leistungen gelegentlich verlangt.

**Vorsicht.** Eine Unterschrift ist ein personenbezogenes Datum mit
Beweisfunktion: Speicherform, Frist, Zugriff nach ADR-008 und ADR-004.

**Verworfen am 2026-09-06 durch Jannes:** Es wird keine Unterschrift und
keine Behandlungsbestätigung je Termin benötigt. Behandlungsvertrag und
Datenschutzinformation bleiben in Stufe 1 Papier mit Vermerk in der Akte
(PAT-006). Der Eintrag bleibt stehen, damit die Frage nicht wiederkommt.

---

### IDEA-PRX-016 — Vertretungs-Kurzblick am Termin

| | |
|---|---|
| Status | vorschlag |
| Quelle | Produktreview 2026-09-06 |
| Berührt | §4.2 (Vertretung), ADR-010, `IDEA-ORG-005` |

**Idee.** Am Termin, aufklappbar und auditiert: letzter Eintrag,
Zugangshinweis, feste Therapeut:in, Verordnungsstand. Für die Vertreterin,
die mit dem Rad vor einer fremden Tür steht — und für alle, deren
Vorbereitungszeit die Fahrtzeit ist.

**Vorsicht.** Auswählen und anordnen, nicht interpretieren (ADR-006).

---

### IDEA-PRX-017 — Startort je Tag

| | |
|---|---|
| Status | vorschlag |
| Quelle | Produktreview 2026-09-06; `PRODUCT_VISION.md` §1.1 |
| Berührt | §20, TOUR-EPIC-001a (TOUR-001), FLT-EPIC-001 |

**Idee.** Je Therapeutin und Tag: Start und Ende am Depot oder am
persönlichen Startort. Grundlage jeder Reihenfolge und jedes Puffers.

**Vorsicht.** Die Wohnadresse einer Mitarbeiterin ist ein Beschäftigtendatum
(§20): nur die Person selbst pflegt und sieht sie; bis TOUR-EPIC-001a genügt
eine Praxiseinstellung „Standard-Depot". Als Startort der Tagesroute wird sie
nur auf Aktion der Person an den Kartendienst gegeben (`IDEA-PRX-029`).

---

### IDEA-PRX-018 — Dublettenprüfung und Zusammenführen

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (thevea) |
| Berührt | ADR-014, ADR-010, LOE-002 |

**Idee.** Beim Anlegen Hinweis auf gleichen Namen und Geburtsdatum; ein
`owner`-Vorgang „Zusammenführen", der Termine, Dokumentation und Rechnungen
einer Dublette auf die richtige Akte umhängt — auditiert, nie automatisch.

**Vorsicht.** Zusammenführen berührt Unveränderbares (finalisierte
Dokumentation, ausgestellte Rechnungen); der Bezug wechselt, der Inhalt nicht.

---

### IDEA-PRX-019 — Aufgaben und Wiedervorlagen mit Patientenbezug

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (appointmed, MD Therapie) |
| Berührt | `IDEA-ORG-001`, §4.3, §10 |

**Idee.** Eine Aufgabe mit Fälligkeit und Zuweisung, optional mit Bezug auf
eine Person („Verordnung nachfordern", „Rückruf Frau X"); überfällige als
Abschnitt in „Mein Tag" und als Zähler im Menü.

**Warum.** Die häufigste Frage „was muss ich als Nächstes tun" bekommt einen
zweiten Inhalt neben den Terminen. Organisatorisch, keine klinische Bewertung.

**Vorsicht.** Ein Bezug erweitert keine Berechtigung (§4.7). Abgrenzung zum
Teamchat (TEAM-001): eine Aufgabe ist ein Vorgang, keine Nachricht.

---

### IDEA-PRX-020 — Globale Suche und Schnellanlegen

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (thevea, appointmed „Neu →", THEORG Tastenkürzel) |
| Berührt | UX-EPIC-001 (Entwurf), ADR-004 |

**Idee.** Ein Suchfeld, das von jeder Seite erreichbar ist und nach drei
Buchstaben Personen findet (serverseitig, RLS, umlautunempfindlich); ein
„Neu"-Menü für Termin, Patient:in, später Rechnung; Tastenkürzel am
Rechner.

**Warum.** Die Patientenliste lädt heute alle Datensätze und filtert im
Browser; von Kalender und Mein Tag gibt es keinen Weg zur Akte ohne Umweg.

---

### IDEA-PRX-021 — Farbcodierung je Terminart und Person

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (appointmed, thevea, iPrax, THEORG) |
| Berührt | UI-001, `IDEA-QSN-006` |

**Idee.** Terminart und Leistung als Farbe in der Kachel, Person als
Spaltenfarbe, freie Zeiten hervorgehoben — zusätzlich zum Text, nie statt
des Textes (WCAG 1.4.1).

---

### IDEA-PRX-022 — Kartenzahlung beim Hausbesuch

| | |
|---|---|
| Status | vorschlag · entscheidung nötig |
| Quelle | Wettbewerbsanalyse 2026-09-06 (iPrax, thevea, appointmed mit SumUp) |
| Berührt | §3.5, ADR-002, ADR-009, ABR-004 |

**Idee.** Betrag aus der Rechnung an ein mobiles Terminal übergeben, Zahlung
automatisch der Rechnung zuordnen, Beleg erzeugen.

**Warum.** Drei Wettbewerber, alle mit demselben Anbieter; iPrax und thevea
handeln Sonderkonditionen aus. Für eine Praxis ohne Tresen ist das Terminal
am Rad der einzige Ort für Sofortzahlung.

**Vorsicht.** Neuer Dienstleister mit Zahlungsdaten und Behandlungsbezug:
Prüfung nach ADR-002, AVV, Kassenbuchpflicht bei Barzahlungen. Roadmap 2.0
hält Kartenzahlung bewusst aus Stufe 1.

---

### IDEA-PRX-023 — Verordnung per Kamera erfassen

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (thevea Scan-App, iPrax Clever-Scan, THEORG, MD, Optica) |
| Berührt | VER-004, ADR-017, ADR-005 |

**Idee.** Erste Stufe: Foto der Verordnung als Anhang (VER-004). Zweite Stufe:
Felder aus dem Foto vorschlagen, unsichere Felder markiert, Übernahme nur nach
Bestätigung.

**Vorsicht.** Texterkennung mit einem Modell ist ein KI-Pfad nach ADR-005
(Gateway, Provider, C6); deterministische Erkennung ohne Sprachmodell wäre
eine eigene Abhängigkeit. Beides Stufe 2.

---

### IDEA-PRX-024 — Kalender-Abo für den eigenen Kalender

| | |
|---|---|
| Status | vorschlag · Bedenken |
| Quelle | Wettbewerbsanalyse 2026-09-06 (appointmed, nur lesend) |
| Berührt | ADR-002, `IDEA-ORG-004`, §3.5 |

**Idee.** Die eigenen Termine als lesbaren Kalender in Apple, Google oder
Outlook abonnieren.

**Bedenken.** Die Termine verlassen die Anwendung und landen beim
Kalenderanbieter der Person: dass jemand zu einer Zeit Physiotherapie hat, ist
ein Gesundheitsdatum, und der Name der Patientin stünde im Titel. `IDEA-ORG-004`
hat das bereits als eigene Entscheidung nach ADR-002 markiert. Wenn
überhaupt, dann ohne Namen („Hausbesuch 09:00") — und auch das ist eine
Prüfung, kein Detail.

---

### IDEA-PRX-025 — Kennzahlen für die Praxisführung

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (Standard bei sechs Produkten) |
| Berührt | §20, B6, ADR-004, ADR-009 |

**Idee.** Für `owner`: Umsatz je Monat, offene Posten, Behandlungen je
Verordnung, Auslastung als Praxissumme, Ausfälle — als Zeitraumvergleich und
CSV. Keine Werte je Person, bis B6 entschieden ist.

**Warum.** Alle sechs Systeme haben Statistik; für eine Praxis ist der
Monatsabschluss sonst Handarbeit. §20 setzt die Grenze bei
Beschäftigtendaten; Praxissummen sind davon nicht berührt.

---

### IDEA-PRX-026 — Export für die Steuerberatung

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (thevea, Optica, THEORG, appointmed) |
| Berührt | B4, ADR-009, ABR-EPIC-003 |

**Idee.** Rechnungen und Zahlungen als CSV in einem Format, das die
Steuerberatung einlesen kann; DATEV-Format, wenn B4 es verlangt.

**Warum.** Vergleiche nennen „Rechnung mit Zahlungsstatus und DATEV-Export"
als das, was eine Privatpraxis braucht. Eine CSV ist billig; die Frage ist nur
das Format — die stellt B4.

---

### IDEA-PRX-027 — Körperschema im Befund

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (appointmed, THEORG, Optica, MD; iPrax 3D) |
| Berührt | Etappe 2 (FRB), ADR-006, ADR-016 |

**Idee.** Vorder-, Rück- und Seitenansicht mit Markern und Beschriftung als
Teil des Befunds; iPrax zeigt ein 3D-Modell in zehn Schichten.

**Vorsicht.** Ein Körperschema dokumentiert, es bewertet nicht — das hält
ADR-006 ein. Es gehört zum Befund (Etappe 2), nicht zur Verlaufsnotiz.

---

### IDEA-PRX-028 — Diktat in der Dokumentation

| | |
|---|---|
| Status | vorschlag |
| Quelle | Wettbewerbsanalyse 2026-09-06 (iPrax Siri, thevea, MD, THEORG 2GO) |
| Berührt | `PRODUCT_VISION.md` §6 (eigener Datenfluss), ADR-002, ADR-005 |

**Idee.** Diktat über die Systemtastatur des Geräts oder einen geprüften
Dienst; Nutzer:innen berichten, dass Fachwörter schlecht erkannt werden.

**Vorsicht.** Das Systemdiktat sendet die Sprache an den Gerätehersteller —
ein Datenfluss mit Gesundheitsdaten, der vor der Nutzung bewertet werden muss
(Vision §6). Kein Loop entscheidet das.

---

### IDEA-PRX-029 — Tagesroute auf der Karte

| | |
|---|---|
| Status | bestätigt — Jannes, 2026-09-06: „Diese Entscheidung steht fest" |
| Quelle | Jannes, 2026-09-06 (Lastenrad-Hausbesuchskonzept) |
| Berührt | §9, §18, §20, §3.5; ADR-002, ADR-007; B7; ADR-019; TOUR-EPIC-001a (Roadmap Etappe T); E-16 (entschieden 2026-09-06) |

**Idee.** Eine Karte zeigt die gesamte Route des Tages: alle Wege zwischen
Startort, Hausbesuchen und Endort in Terminreihenfolge — auf einmal, oder ein
einzelner Weg als Vorschau. In „Mein Tag" und unter Touren; aus jeder Ansicht
führt ein Link zur Navigation (`IDEA-PRX-030`).

**Warum.** Das Lastenrad-Hausbesuchskonzept lebt von der Route: Reihenfolge,
Länge und Anschluss der Wege bestimmen den Tag, nicht die Raumbelegung. Kein
Wettbewerber zeigt das, weil ihre Praxen Räume haben; MD Therapie plant
Fahrzeiten, zeigt aber keine Radroute.

**Vorsicht.** Beim Öffnen der Karte gehen alle Adressen des Tages in einer
Anfrage an den Kartenanbieter — deshalb Adressen ohne Namen und ohne Uhrzeit,
Karte nur auf ausdrückliche Aktion laden, kein Standort der Person, kein
Verlauf, keine Speicherung von Routing-Rohdaten (§18, §20). Der persönliche
Startort einer Therapeutin ist ein Beschäftigtendatum (`IDEA-PRX-017`). Ein
privates Google-Konto auf dem Diensttelefon speichert Wege — das regelt die
Endgeräte-Richtlinie.

**Entschieden 2026-09-06 (E-16):** Datenweg über die Google Maps Embed API,
derselbe Anbieter wie der genehmigte Link; die zuständige
Datenschutz-Fachkraft hat genehmigt. Namen erscheinen nie auf der Karte.
Dokumentation in ADR-019.

**Offen.** Nur noch die Höchstzahl der Zwischenziele je Anfrage
(Anbieterdokumentation); bei Überschreitung wird der Tag in Abschnitte geteilt.

---

### IDEA-PRX-030 — Navigationslink zu Google Maps, je Weg und für den Tag

| | |
|---|---|
| Status | bestätigt — Jannes, 2026-09-06, datenschutzrechtlich genehmigt |
| Quelle | Jannes, 2026-09-06 |
| Berührt | B7, ADR-019, UX-EPIC-001, PAT-006; URL-Format und Feldliste als `ANN` |

**Idee.** Aus jeder Adresse in Tagesliste, Termin und Karte führt ein Link,
der Google Maps mit dem Ziel im Fahrradmodus öffnet; für den ganzen Tag ein
Link mit allen Zielen in Terminreihenfolge. Nichts wird in der Anwendung
nachgebaut — die Navigation macht die App, die auf dem Telefon schon ist
(§2.1, §3.4).

**Warum.** THEORG 2GO und MD Therapie übergeben Adressen an die Karten-App.
Auf dem Rad ist die Sprachnavigation der einzige praktikable Weg; die
Tagesliste ohne Adresse und ohne Link war Bruchstelle Nr. 1 im Produktreview.

**Vorsicht.** Der Link trägt die Adresse — nie den Namen, nie die Uhrzeit, nie
die Verordnung. Der Tages-Link enthält alle Adressen eines Tages; er wird erst
auf Tap gebaut und nirgends gespeichert. Die Datenschutzinformation nennt
Google Maps (PAT-006). Die Höchstzahl der Zwischenziele je Link steht in der
Anbieterdokumentation; wird sie überschritten, wird der Tag in Abschnitte
geteilt.

---

### IDEA-PRX-031 — Gebietstage für die Terminvergabe

| | |
|---|---|
| Status | vorschlag |
| Quelle | Claude, 2026-09-06, aus dem Lastenrad-Konzept |
| Berührt | §6.2, §8, §9; CAL-007, CAL-010; `IDEA-PRX-008`; B6 |

**Idee.** Die Praxis ordnet Gebieten (Stadtteile, Postleitzahlen) feste
Wochentage oder Tageshälften zu. Beim Anlegen und bei der Serie schlägt der
Kalender Termine im Gebietstag der Adresse vor und warnt bei Terminen
außerhalb. Eine Vorbelegung, keine Optimierung.

**Warum.** Auf dem Rad ist die Bündelung nach Gebiet der größte Hebel gegen
Leerfahrten — und das einzige Mittel, das ohne Kartendienst funktioniert, weil
es eine Praxisregel ist (§6.2, deterministisch). Eine Stadtteil-Praxis wirbt
genau damit.

**Vorsicht.** Gebiete sind Praxisregeln, keine Auswertung je Person (B6).
Termine bleiben frei vergebbar; die Regel warnt, sie verbietet nicht.

---

### IDEA-PRX-032 — Fahrzeit je Weg aus dem Kartendienst

| | |
|---|---|
| Status | vorschlag |
| Quelle | Claude, 2026-09-06 |
| Berührt | §9, §18, §20; B6, B7; TOUR-EPIC-001b; `IDEA-PRX-002` |

**Idee.** Zu jedem Weg der Tagesroute die Fahrzeit mit dem Rad aus dem
Kartendienst; im Kalender die Erreichbarkeit zweier Termine als Warnung,
ergänzend zur Praxisregel aus `IDEA-PRX-002`; die Auswirkung einer
Terminänderung sichtbar.

**Warum.** §9 verlangt für die erste Ausbaustufe, dass die Anwendung erkennt,
ob zwei Termine zeitlich erreichbar sind. Ohne Fahrzeiten schlägt jede
automatische Terminsuche (`IDEA-PRX-008`) Termine vor, die auf dem Rad nicht
erreichbar sind.

**Vorsicht.** Fahrzeiten sind Routing-Rohdaten mit kurzer Speicherfrist (§18)
und dürfen nicht zur Leistungskontrolle werden (§20, B6): Speicherung nur je
Weg und Tag, keine Summen je Person. Erst nach Betriebserfahrung (nach M6),
weil erst dann klar ist, wie oft eine Warnung nützt und wie oft sie stört.

---

### IDEA-PRX-033 — Planungskarte der aktiven Adressen

| | |
|---|---|
| Status | vorschlag · Bedenken |
| Quelle | Claude, 2026-09-06 |
| Berührt | §3.5, §9; ADR-002, ADR-004, ADR-007; B7; `IDEA-PRX-031` |

**Idee.** Für die Planung eine Karte mit den Adressen aller aktiven
Patient:innen als Punkte ohne Namen — um Gebietstage zu schneiden und neue
Anfragen einem Gebiet zuzuordnen.

**Bedenken.** Eine Karte aller Adressen ist eine Übermittlung aller aktiven
Adressen an den Kartenanbieter in einer Anfrage und ein Bild, das mehr sagt
als jede Liste. Wenn überhaupt, dann als `owner`-Funktion, auditiert, mit
eigener Prüfung nach ADR-002 und DSFA-Wiedervorlage. Gebietstage aus
`IDEA-PRX-031` funktionieren auch mit einer Postleitzahl-Liste ohne Karte.
Bis eine Entscheidung vorliegt: nicht bauen.

---

Zuletzt aktualisiert: 2026-09-08 (Terminlänge und Fahrpuffer `IDEA-PRX-002`
verbindlich entschieden). Vorherige Aktualisierung: 2026-09-06 (Entscheidungen
E-9, E-12, E-13; Tagesroute `IDEA-PRX-029` bis `-033`)
