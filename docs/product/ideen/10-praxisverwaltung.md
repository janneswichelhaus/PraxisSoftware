# Praxisverwaltung: Termine, Akte, Abrechnung, Hausbesuch (PRX)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Die Bereichsdatei für den **Praxisbetrieb vor dem Portal**: alles, was
Terminplanung, Patientenakte, Verordnung, Abrechnung und den Hausbesuch
betrifft. Sie fehlte bisher — der Ideenspeicher kannte fast nur die
Betreuungsplattform nach Therapieende. Die Einträge stammen aus der
Wettbewerbsanalyse und dem Produktreview vom 2026-09-06
([referenz-wettbewerb.md](referenz-wettbewerb.md),
Roadmap-Review vom 2026-09-06, in der Git-Historie unter Commit `7ab6f71`).
Sie stehen auf `vorschlag`, bis Jannes sie bestätigt; eine Verortung in der
Roadmap macht sie nicht zu Aufträgen. Was inzwischen gebaut ist, trägt
`überführt` mit der Kennung der Story — der Umsetzungsstand selbst steht in
`../../development/ARBEITSBEREICHE.md`, nicht hier. Zwei Befunde an der
gebauten Oberfläche (`IDEA-PRX-038`, `-040`) sind am 2026-09-13 nach
`../../development/BEFUNDE.md` gegangen; hier bleibt je ein Stub. Das Journal
der Entscheidungen führt allein `../IDEENSPEICHER.md` unter „Bestätigungen".

---

### IDEA-PRX-001 — Zugangshinweis je Patient:in

| | |
|---|---|
| Status | überführt → PAT-005 |
| Quelle | Produktreview 2026-09-06 |
| Berührt | PAT-005, UX-001, UI-002a, ADR-011 |

**Stand.** Gebaut: Zugangshinweis und Besonderheit vor dem Hausbesuch in den
Stammdaten (PAT-005, 2026-09-07), in der Tagesliste des Hausbesuchstags
(UX-001) und seit UI-002a im Kopf der Akte
(`../../development/ARBEITSBEREICHE.md`). Bevorzugte Zeiten sind kein Feld —
das wäre `IDEA-PRX-003`.

---

### IDEA-PRX-002 — Fahrpuffer als Praxisregel, ohne Kartendienst

| | |
|---|---|
| Status | überführt → `PROJECT_PRINCIPLES.md` §8.1 |
| Quelle | Produktreview 2026-09-06 |
| Berührt | `PROJECT_PRINCIPLES.md` §8.1 (Fassung 0.9), §9, §6.2; `OPEN_DECISIONS.md` E12, B7; CAL-EPIC-003b (CAL-010a gebaut; CAL-010b entfallen, Fahrpuffer mit MAP-006 — E12 Punkt 3/4); ADR-019 |

**Stand.** Überführt am 2026-09-08: Der Kern steht als §8.1 in den Prinzipien
und ist gebaut — Raster (CAL-005) und Terminfenster mit **60 oder 45 Minuten**
(CAL-010a, CAL-015b, ANN-037; `../../development/ARBEITSBEREICHE.md`). Der
hier vorgeschlagene **Mechanismus ist durch E12 Punkt 3 und 4 (2026-09-12)
überholt**: kein pauschaler Mindestabstand, keine von Hand gepflegten
Fahrminuten; der Fahrpuffer kommt erst mit MAP-006 aus dem Kartendienst.
CAL-010b ist als eigene Story entfallen. Der Text bleibt lesbar.

---

### IDEA-PRX-003 — Warteliste mit Zeitfenstern und Nachrücken

| | |
|---|---|
| Status | bestätigt |
| Quelle | Wettbewerbsanalyse 2026-09-06 (Standard bei sieben Produkten) |
| Berührt | §8; CAL-008 (Absage, gebaut); B15; ADR-006 Punkt 4 |

**Stand.** Bestätigt durch Jannes am 2026-09-06 (E-9) für Stufe 2: erster
Loop nach dem ersten Betriebsmonat (M6) — die Praxis eröffnet am 01.07.2027
und weiß erst dann, wie groß die Nachfrage ist. Die Reihenfolge steht in
`../../development/ROADMAP.md`, nicht hier.

**Idee.** Personen ohne zeitnahen Termin stehen mit Wochentag- und
Tageszeitpräferenz, Dringlichkeit und Verordnungsbezug auf einer Liste. Wird
ein Termin abgesagt, zeigt die Software die passenden Einträge; die Praxis
ruft an (Anrufliste) und übernimmt den Termin mit einem Tap.

**Warum.** iPrax, THEORG, thevea, appointmed, Optica, MD und henara haben sie;
Nutzer:innen nennen sie als Zeitersparnis Nr. 1 im Alltag. Für eine Praxis,
deren Kapazität an Radwegen hängt, ist eine Lücke im Plan teurer als in einer
Praxis mit Räumen.

**Vorsicht.** Nachrücken „automatisch" hieße Benachrichtigung — das ist B15
(2026-09-08: keine automatische Erinnerung, die Anrufliste bleibt). Bis dahin
ist die Warteliste eine Liste mit Anrufhinweis. Eine **„Dringlichkeit"** auf
der Warteliste ist organisatorisch zu fassen — Wunsch der Person, Ende einer
Verordnung, Vorgabe der Praxis —, nicht als klinische Einstufung: Eine
Einordnung nach Beschwerdebild wäre eine Risikoklassifikation und nach
ADR-006 Punkt 4 ausgeschlossen.

---

### IDEA-PRX-004 — Tag umplanen bei Ausfall, mit Anrufliste

| | |
|---|---|
| Status | überführt → CAL-009 |
| Quelle | Produktreview 2026-09-06 |
| Berührt | ADR-018, CAL-EPIC-003a (CAL-009), §4.3; `IDEA-PRX-041` |

**Stand.** Gebaut als CAL-009 am 2026-09-12 („Tag umplanen mit Anrufliste",
`../../development/ARBEITSBEREICHE.md`); nicht gebaut sind „vorgemerkt"
(ADR-018: nur beschrieben), die Übergabe an eine Kollegin und ein
gespeicherter Erledigt-Haken — Letzteres ist `IDEA-PRX-041`.

---

### IDEA-PRX-005 — Anrufliste für morgen

| | |
|---|---|
| Status | vorschlag |
| Quelle | Produktreview 2026-09-06 |
| Berührt | B15 (2026-09-08), CAL-008, CAL-013 |

**Stand.** B15 (Jannes, 2026-09-08): keine automatische Terminerinnerung in
Stufe 1 und 2 — **„die Anrufliste bleibt."** Der Nachtrag vom 2026-09-12
ändert daran nichts: Die Terminmail aus dem Praxispostfach (CAL-013) ist ein
Handoff auf Klick, keine Erinnerung. Die Liste selbst ist nicht gebaut;
verwandt ist die Anrufliste nach „Tag umplanen" (CAL-009).

**Idee.** Eine Liste für das Office: wen für morgen anrufen oder bestätigen,
mit Erledigt-Haken. Der Ersatz für die Terminerinnerung per SMS, solange kein
Anbieter geprüft und keine Einwilligung eingeholt ist.

**Warum.** Erinnerungen 24 Stunden vorher senken Ausfälle laut Portalen um
bis zu 30 Prozent. Das Telefon ist der Kanal, den es schon gibt.

---

### IDEA-PRX-006 — Terminzettel und Terminübersicht als PDF

| | |
|---|---|
| Status | überführt → CAL-011, CAL-013 |
| Quelle | Wettbewerbsanalyse 2026-09-06 (THEORG, appointmed, iPrax, Optica) |
| Berührt | CAL-011, CAL-012, CAL-013 (gebaut), UI-000 (Druck-Basis), B14, B15; ANN-039, ANN-041 |

**Stand.** Gebaut am 2026-09-12: der Terminzettel je Person als Druckansicht
(CAL-011, Inhalt verbindlich in ANN-039) und derselbe Inhalt als E-Mail-Entwurf
im Praxispostfach (CAL-013, Handoff nach dem B15-Nachtrag, ANN-041), dazu der
Mitteilungsvermerk am Termin (CAL-012) — Stand in
`../../development/ARBEITSBEREICHE.md`. Der PDF-Teil und die Tourenliste
bleiben `vorschlag`.

---

### IDEA-PRX-007 — Folgetermin und Schnellanlage

| | |
|---|---|
| Status | überführt → UX-003 |
| Quelle | Produktreview 2026-09-06; iPrax „Weiterer Termin" |
| Berührt | UX-003, UX-005 (gebaut); CAL-010a |

**Stand.** Gebaut am 2026-09-11: Folgetermin und Vorbelegung „Hausbesuch, ich,
heute" (UX-003) sowie Tap auf freie Zeit im Kalender mit Patientensuche
(UX-005); das Ende kommt aus dem Terminfenster, nicht aus der Dauer des
Ausgangstermins (CAL-010a) — `../../development/ARBEITSBEREICHE.md`.

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

**Offen.** Erst nach MAP-006 (Fahrzeiten) oder mit den Gebietstagen aus
PRX-031 als Näherung? Eine pauschale Fahrzeitregel als Näherung ist seit E12
Punkt 3 und 4 (2026-09-12) ausgeschlossen. Der Kalender als Suchfläche
(`IDEA-PRX-042`, CAL-015c) ist bereits die Bedienform ohne Automatik.

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
| Status | überführt → UX-008 |
| Quelle | Wettbewerbsanalyse 2026-09-06 (Standard bei fünf Produkten) |
| Berührt | ADR-016, ADR-006, ADR-005; UX-008 (gebaut), ANN-020 |

**Stand.** Bestätigt durch Jannes am 2026-09-06 (E-9) und am 2026-09-11 als
UX-008 gebaut: persönlich oder praxisweit, kein Patientenbezug, keine
Platzhalter, kein Sprachmodell (ANN-020; `../../development/ARBEITSBEREICHE.md`).

---

### IDEA-PRX-012 — Zahlungserinnerung als Dokument

| | |
|---|---|
| Status | bestätigt |
| Quelle | Produktreview und Wettbewerbsanalyse 2026-09-06 |
| Berührt | ADR-009 (Mahnwesen offen), ABR-EPIC-002b, ABR-005 |

**Stand.** Bestätigt durch Jannes am 2026-09-06 (E-9): als Dokument in
ABR-EPIC-002b, ohne Stufen und Gebühren. Noch nicht gebaut; die Reihenfolge
steht in `../../development/ROADMAP.md`.

**Idee.** Aus einer überfälligen Rechnung eine Zahlungserinnerung als
Dokument erzeugen (Datum, Betrag, Frist), ohne Stufenlogik, ohne Gebühren,
ohne Automatik. Mahnstufen kommen mit ABR-005 nach Praxiserfahrung.

**Warum.** Die Roadmap hält Mahnwesen bewusst aus Stufe 1 heraus. Ohne die
minimale Erinnerung beginnt das Office ab der Eröffnung im Juli 2027 mit
Handarbeit außerhalb der Plattform (§2.1). THEORG, thevea, Optica, MD und
iPrax haben Mahnwesen.

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
| Status | überführt → UX-011 |
| Quelle | Produktreview 2026-09-06; thevea Offline-Kalender, iPrax Offline-first |
| Berührt | ADR-001 (Folgefrage Feldliste, beantwortet durch ANN-021), ADR-015 (kein Service Worker), §2.2; UX-011 (gebaut) |

**Stand.** Bestätigt durch Jannes am 2026-09-06 (E-12) und am 2026-09-11 als
UX-011 gebaut: Die zuletzt geladene Tagesliste bleibt im Funkloch lesbar und
als älterer Stand gekennzeichnet — kein Offline-Modus, kein Service Worker,
keine Akte offline; Feldliste und Vorhaltedauer stehen als ANN-021
(`../../development/ARBEITSBEREICHE.md`).

---

### IDEA-PRX-015 — Unterschrift am Hausbesuch, digitale Vorlagen

| | |
|---|---|
| Status | verworfen (E-13) |
| Quelle | Wettbewerbsanalyse 2026-09-06 (iPrax, THEORG Klemmbrett, thevea Signatur) |
| Berührt | §4.4 („gegebenenfalls Signatur"), ADR-008, ADR-017, PAT-006 |

**Stand.** Verworfen am 2026-09-06 durch Jannes (E-13): Es wird keine
Unterschrift und keine Behandlungsbestätigung je Termin benötigt.
Behandlungsvertrag und Datenschutzinformation bleiben in Stufe 1 Papier mit
Vermerk in der Akte (PAT-006). Der Eintrag bleibt stehen, damit die Frage
nicht wiederkommt.

**Idee.** Behandlungsvertrag, Datenschutzinformation, Ausfallhonorar-Regel und
gegebenenfalls eine Behandlungsbestätigung je Termin auf dem Telefon der
Therapeutin unterschreiben; Ablage nach ADR-017.

**Warum.** Ohne Praxis gibt es keinen anderen Ort dafür. Bei Beihilfe und PKV
wird eine Bestätigung der Leistungen gelegentlich verlangt.

**Vorsicht.** Eine Unterschrift ist ein personenbezogenes Datum mit
Beweisfunktion: Speicherform, Frist, Zugriff nach ADR-008 und ADR-004.

---

### IDEA-PRX-016 — Vertretungs-Kurzblick am Termin

| | |
|---|---|
| Status | vorschlag |
| Quelle | Produktreview 2026-09-06 |
| Berührt | §4.2 (Vertretung), ADR-010, `IDEA-ORG-005`, `IDEA-PRX-036`; PAT-005, UI-002a |

**Stand.** Zugangshinweis und Besonderheit stehen seit UI-002a (2026-09-12)
im Kopf der Akte (PAT-005) und in der Tagesliste (UX-001); der aufklappbare,
auditierte Kurzblick **am Termin** mit letztem Eintrag und Verordnungsstand
ist nicht gebaut. Seit dem 2026-09-11 trägt der Eintrag zusätzlich das
Bedürfnis aus dem verworfenen `IDEA-PRX-036`.

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
| Berührt | §20, MAP-006 (TOUR-001), FLT-EPIC-001 |

**Idee.** Je Therapeutin und Tag: Start und Ende am Depot oder am
persönlichen Startort. Grundlage jeder Reihenfolge und jedes Puffers.

**Vorsicht.** Die Wohnadresse einer Mitarbeiterin ist ein Beschäftigtendatum
(§20): nur die Person selbst pflegt und sieht sie; bis MAP-006 genügt
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
Abschnitt in „Übersicht" und als Zähler im Menü.

**Warum.** Die häufigste Frage „was muss ich als Nächstes tun" bekommt einen
zweiten Inhalt neben den Terminen. Organisatorisch, keine klinische Bewertung.

**Vorsicht.** Ein Bezug erweitert keine Berechtigung (§4.7). Abgrenzung zum
Teamchat (TEAM-001): eine Aufgabe ist ein Vorgang, keine Nachricht.

---

### IDEA-PRX-020 — Globale Suche und Schnellanlegen

| | |
|---|---|
| Status | überführt → UX-004 |
| Quelle | Wettbewerbsanalyse 2026-09-06 (thevea, appointmed „Neu →", THEORG Tastenkürzel) |
| Berührt | UX-004, UX-005, UX-012a (gebaut), ADR-004 |

**Stand.** Gebaut am 2026-09-11: Patientensuche von jeder Seite, serverseitig
ab drei Zeichen, umlautunempfindlich, RLS-gestützt (UX-004; seit UX-012a mit
unterscheidbarem Fehlerzustand); der Weg vom Kalender zur Akte über den Tap
auf freie Zeit (UX-005) — `../../development/ARBEITSBEREICHE.md`. Das
„Neu"-Menü und Tastenkürzel am Rechner bleiben `vorschlag`.

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
| Status | überführt → `IDEA-KI-007` / `PROJECT_PRINCIPLES.md` §6.3 |
| Quelle | Wettbewerbsanalyse 2026-09-06 (iPrax Siri, thevea, MD, THEORG 2GO) |
| Berührt | `PROJECT_PRINCIPLES.md` §6.3, `OPEN_DECISIONS.md` E13; ADR-002, ADR-005 Punkt 9; Roadmap G14/G16 (Endgeräte-Richtlinie) |

**Stand.** Überführt am 2026-09-13: Der geprüfte Dienst ist die
Sprachdokumentation aus `IDEA-KI-007` — entschieden als
`PROJECT_PRINCIPLES.md` §6.3 (2026-09-08), Umsetzung offen als E13. Das
Diktat über die **Systemtastatur** ist ein Datenfluss an den Betreiber des
Geräts und gehört in die Endgeräte-Richtlinie (Roadmap G14/G16), nicht in
eine Idee.

---

### IDEA-PRX-029 — Tagesroute auf der Karte

| | |
|---|---|
| Status | überführt → ADR-019 / MAP-002 bis MAP-006 |
| Quelle | Jannes, 2026-09-06 (Lastenrad-Hausbesuchskonzept) |
| Berührt | §9, §18, §20, §3.5; ADR-002, ADR-007; B7; ADR-019 Fassung 2 (E-20 angenommen 2026-09-13); MAP-002 bis MAP-006 (Roadmap Etappe T); E-16 überholt |

**Stand.** Bestätigt durch Jannes am 2026-09-06 („Diese Entscheidung steht
fest"), am 2026-09-08 als ADR-019 Fassung 2 gefasst (MapLibre, serverseitiger
Adapter, PTV Developer als Kandidat; E-16 überholt) und am 2026-09-13 mit
**E-20** angenommen. Umsetzung als MAP-002 bis MAP-006
(`../../development/MAP-LOOPS.md`); produktive Freigabe am Vertrags-/§203-/
DSFA-Gate aus ADR-019 Punkt 9. Noch nichts davon ist gebaut.

---

### IDEA-PRX-030 — Navigationslink zu Google Maps, je Weg und für den Tag

| | |
|---|---|
| Status | überführt → UX-002 / ADR-019 / ANN-018 |
| Quelle | Jannes, 2026-09-06 |
| Berührt | B7, ADR-019 Punkt 20 bis 23 (E-20 angenommen 2026-09-13), UX-002 (gebaut), MAP-005, PAT-006; ANN-018 |

**Stand.** Bestätigt durch Jannes am 2026-09-06 (datenschutzrechtlich
genehmigt) und am 2026-09-11 als UX-002 gebaut: „Navigation starten" aus
Tagesliste und Termin übergibt nur die Anschrift ohne Namen, im Fahrradmodus,
erst beim Tippen (ADR-019 Punkt 20, ANN-018;
`../../development/ARBEITSBEREICHE.md`). Apple Maps und `geo:` kommen mit
MAP-005; der Tages-Link mit allen Zielen ist nicht gebaut.

---

### IDEA-PRX-031 — Gebietstage für die Terminvergabe

| | |
|---|---|
| Status | vorschlag |
| Quelle | Claude, 2026-09-06, aus dem Lastenrad-Konzept |
| Berührt | §6.2, §8, §9; CAL-007, MAP-006 (CAL-010b entfallen, E12); `IDEA-PRX-008`; B6 |

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
| Status | überführt → MAP-003 / MAP-004 / MAP-006 |
| Quelle | Claude, 2026-09-06 |
| Berührt | §9, §18, §20; B6, B7; ADR-019 Punkt 16 und 17; MAP-003, MAP-004, MAP-006; E12 Punkt 3/4; `IDEA-PRX-002`, `IDEA-PRX-042` |

**Stand.** Überführt am 2026-09-13: Fahrzeit je Weg (MAP-003), Erreichbarkeit
zweier Termine (MAP-004) und die Warnung im Kalender mit echten Terminen
(MAP-006) stehen als Loops in `../../development/MAP-LOOPS.md`; E12 Punkt 3
und 4 (2026-09-12) haben festgelegt, dass die Fahrzeit nur aus dem Kartendienst
kommt. Noch nichts davon ist gebaut.

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

### IDEA-PRX-034 — Entwurf „Own Motion · Praxis": der Tagesplan als Startseite

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-11 (Design-Kanvas „Own Motion · Praxis", als Anhang geteilt) |
| Berührt | UX-EPIC-001 (gebaut), MARKE-001, `IDEA-PRX-017`, `-029`, `-032`; ADR-019 |

**Idee.** Ein gestalteter Entwurf der Tagesansicht: links eine dunkelgrüne
Leiste mit der Marke und vier Punkten (Tagesplan, Patient:innen, Rechnungen,
Einstellungen) samt Tagesbilanz am Fuß; in der Mitte die Termine als Karten
mit Uhrzeit, Dauer, Anschrift und zwei Aktionen („Absagen",
„Behandlung starten"), zwischen den Karten die Radstrecke zum nächsten Stopp;
rechts die Tageskarte mit Route und eine Merkliste. Kopfzeile: Datum,
„4 Termine · 11 km · Start 8:45 zu Hause", „Route öffnen" und „+ Termin".

**Warum.** Der Entwurf zeigt, wie Jannes sich den Hausbesuchstag vorstellt,
wenn Karte und Fahrzeiten da sind. Er deckt sich in den tragenden Teilen mit
dem, was UX-EPIC-001 gebaut hat — Tagesliste mit Anschrift, Abschluss in einem
Schritt, Folgetermin —, und er zeigt an drei Stellen darüber hinaus (siehe
`IDEA-PRX-035` bis `-037`).

**Vorsicht.** Zwei Abweichungen sind keine Gestaltungsfragen. Erstens zeigt der
Entwurf zu jedem Termin die **Indikation** — dazu `IDEA-PRX-036`. Zweitens
setzt er Karte und Fahrzeiten als vorhanden voraus; beides hängt am Gate aus
ADR-019 Punkt 9 und kommt frühestens mit MAP-002 bis MAP-006. Die
Navigationsleiste des Entwurfs kennt vier Bereiche, die Anwendung sechs — der
Entwurf ist keine Vorgabe für die Informationsarchitektur.

**Die Kanvas-Datei liegt unter**
[`../kanvas/own-motion-praxis.html`](../kanvas/own-motion-praxis.html) — eine
in sich geschlossene HTML-Datei, die sich in jedem Browser öffnen lässt.

Sie zeigt vier Personen mit vollständiger Anschrift und Indikation. Deshalb
lag sie zunächst **nicht** im Repository: §3.1 erlaubt ausschließlich
synthetische Daten, und von außen war nicht feststellbar, ob die Namen
erfunden sind — §16 entscheidet in diesem Zweifel für die datensparsamere
Seite, und dieselbe Linie gilt seit dem 2026-09-01 für den
Referenz-Screenshot in [referenz-navigation.md](referenz-navigation.md).
**Jannes hat am 2026-09-11 bestätigt, dass die vier Namen erfunden sind.**
Damit sind es synthetische Daten, und die Datei ist nachgelegt. Die Regel für
den nächsten Entwurf dieser Art (Namen im Muster des Seeds) steht in
`docs/DEVELOPMENT.md`, nicht hier.

**Offen.** Ob die Tagesansicht diese Gestalt bekommen soll, entscheidet eine
Ablaufrunde oder ein eigenes Epic — nicht dieser Eintrag.

---

### IDEA-PRX-035 — „Mitnehmen": Materialliste aus den letzten Befunden

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-11 (Kanvas „Own Motion · Praxis") |
| Berührt | DOK-EPIC, ADR-006, §4.6 |

**Idee.** Eine kurze Liste am Tagesplan: was heute ins Lastenrad gehört —
ein Theraband, Kinesiotape, ein ausgedruckter Übungsplan, jeweils mit der
Person dahinter. Überschrift im Entwurf: „Aus den letzten Befunden".

**Warum.** Das ist der Zettel, den eine Hausbesuchspraxis heute an den
Kühlschrank klebt. Wer ohne das Material vor der Tür steht, fährt zweimal.

**Vorsicht.** „Aus den letzten Befunden" ist die heikle Stelle: Automatisch aus
Dokumentationstext abgeleitete Materialvorschläge wären eine Auswertung
klinischer Inhalte und fielen unter ADR-006 (auswählen und anordnen, nicht
interpretieren). Eine von Hand geführte Liste je Termin ist das nicht.

Dazu der Ort — derselbe Einwand wie bei `IDEA-PRX-036`: Eine Liste **am
Tagesplan**, die klinisch abgeleitete Inhalte trägt (Kinesiotape für Frau X
sagt etwas über ihre Behandlung), wird im Treppenhaus mitgelesen — im Aufzug,
an der Wohnungstür, neben einer fremden Person. Besser aufklappbar **am
Termin**, nur auf Anforderung sichtbar (§4.3, §4.6).

**Offen.** Von Hand gepflegt oder abgeleitet? Am Termin, an der Person oder am
Tag? Ohne diese Entscheidung ist nichts spezifizierbar.

---

### IDEA-PRX-036 — Indikation in der Tagesliste

| | |
|---|---|
| Status | verworfen |
| Quelle | Jannes, 2026-09-11 (Kanvas „Own Motion · Praxis") |
| Berührt | §4.3, §4.6, §16; ADR-004; `IDEA-PRX-016`; `list_day_plan` (UX-001) |

**Stand.** Verworfen in dieser Form am 2026-09-11 durch Jannes (Entscheidung
ausdrücklich abgegeben, Journal in `../IDEENSPEICHER.md`); das Bedürfnis lebt
in `IDEA-PRX-016` weiter.

**Idee.** Der Entwurf nennt zu jedem Termin die Indikation — Diagnose und
Verlaufswoche — direkt in der Liste, ohne Aufklappen.

**Warum.** Auf dem Rad zwischen zwei Terminen ist die Vorbereitungszeit die
Fahrtzeit. Wer weiß, was ansteht, kommt vorbereitet an.

**Entscheidung (2026-09-11).** Jannes hat die Entscheidung ausdrücklich
abgegeben; sie lautet: **nein, nicht ständig sichtbar.** Verworfen ist damit
die Form, nicht das Bedürfnis.

Ausschlaggebend ist nicht die Regel, sondern der Ort. §4.3 und §4.6 halten
klinische Angaben aus organisatorischen Ansichten heraus, und die Tagesliste
ist eine — aber der eigentliche Grund steht im Treppenhaus: Eine Tagesliste
ist der Bildschirm, der im Aufzug offen ist, an der Wohnungstür, im Hausflur
neben einer fremden Person. Ständig sichtbar heißt hier: mitlesbar von
jemandem, der nichts damit zu tun hat. Auf Anforderung sichtbar heißt: nur,
wenn jemand hinsieht, der hinsehen will. Das ist der ganze Unterschied, und er
kostet einen Tipp.

`IDEA-PRX-016` löst dasselbe Bedürfnis längst, und zwar besser: letzter
Eintrag, Zugangshinweis, feste Therapeut:in und Verordnungsstand am Termin,
**aufklappbar und auditiert**. Wer die Fahrtzeit zum Vorbereiten nutzt, tippt
einmal und hat mehr vor sich als eine Diagnosezeile. Deshalb wird nicht neu
gebaut, was es schon gibt.

**Umkehrbar, falls sich das als falsch erweist.** Die Angabe käme aus
`list_day_plan`; das ist eine Funktion und eine Projektion. Ergibt der erste
Feldtag, dass der zusätzliche Tipp im Hausflur mit Handschuhen nicht
funktioniert, ist das ein Befund für die Ablaufrunde — dann wird `IDEA-PRX-016`
neu zugeschnitten, nicht dieser Eintrag wiederbelebt.

---

### IDEA-PRX-037 — Abrechnungslage am Termin

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-11 (Kanvas „Own Motion · Praxis") |
| Berührt | ADR-009; ABR-EPIC; `IDEA-PRX-010`, `-012` |

**Idee.** Am Termin zwei Abzeichen: die Kostenträgerart (Beihilfe,
Selbstzahler, Privat) und ein Warnhinweis, wenn für diese Person eine Rechnung
offen ist.

**Warum.** Beides entscheidet, was am Termin zu tun ist — ob abkassiert wird
und ob ein offener Betrag anzusprechen ist. Heute stünde es in der Akte, nicht
am Termin.

**Vorsicht.** „Rechnung offen" am Termin ist eine Zahlungsinformation in einer
Ansicht, die auch eine Vertretung sieht. Rollenschnitt und Sichtbarkeit gehören
geklärt, bevor das gebaut wird (ADR-004).

**Offen.** Ab wann gilt eine Rechnung als „offen" — nach Fälligkeit oder ab
Versand? Das ist eine Frage an ADR-009, nicht an die Oberfläche.

---

### IDEA-PRX-038 — Dokumentieren ohne Scrollen: was wirklich im Weg steht

| | |
|---|---|
| Status | überführt → `docs/development/BEFUNDE.md` |
| Quelle | Jannes, 2026-09-11 |
| Berührt | BEF-001; §8.1; ADR-016; UX-007, UX-009, DOK-001/002; `ANN-015`, `ANN-019`; ABR-002 |

**Stand.** Kein Eintrag für später, sondern ein Befund an Gebautem: Codebefund,
Pixelmessung auf 375 × 667 und Risikoanalyse stehen seit dem 2026-09-13
vollständig als **BEF-001** in
[`../../development/BEFUNDE.md`](../../development/BEFUNDE.md) und gehen von
dort nach Roadmap-Regel R6 in die erste Story des nächsten Loops derselben
Spur. Hier bleibt nur die Kennung.

---

### IDEA-PRX-039 — Termin abhaken: Heilmittel, Kontingent und die Freigabe zur Abrechnung

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-11 |
| Berührt | ADR-009, ADR-016; ABR-001, **ABR-002**; VER-002, VER-003; `ANN-006`, C1; E14 (erledigt 2026-09-13, CAL-018) |

**Stand.** Überschneidet sich absichtlich mit ABR-002 — die Heilmittelauswahl
ist dessen Oberfläche (Empfehlung unten). Seit E14 (Jannes, 2026-09-13) ist
außerdem entschieden, was beim Hausbesuch als „durchgeführt" gilt: Tür
geöffnet, keine Behandlung → durchgeführt mit Pflichtvermerk, normale
Abrechnung; nicht angetroffen nach Protokoll (15 Minuten, Klingeln, Anruf) →
Ausfallgebühr; Absage unter 24 Stunden → Ausfallgebühr; Umsetzung CAL-018. Das
„Abhaken" hier trifft also auf einen Vorgang, der diese Fälle schon kennt.

**Idee.** „Termin abhaken" statt „erledigen", womöglich als Kästchen. Beim
Abhaken wird entschieden, **welche Heilmittel des Rezepts tatsächlich
geleistet wurden**. Ist das Kontingent der Verordnung erreicht, wird hier
entschieden, ob die Verordnung in die Abrechnung geht — nach ausdrücklicher
Bestätigung der behandelnden Person.

**Warum das kein reiner Oberflächenwunsch ist.** Die Heilmittelauswahl ist
genau die Eingabe, die `ABR-002` („Leistungserfassung am durchgeführten
Termin, vorbelegt aus der Verordnung") ohnehin braucht. Der Wunsch beschreibt
also nicht eine zweite Lösung, sondern die Bedienoberfläche einer bereits
eingeplanten Funktion. Das sollte **eine** Sache werden, nicht zwei.

**Potenziale.**

- Eine Geste statt mehrerer Wege: abhaken, Heilmittel bestätigen, fertig.
- Die Vorbelegung aus der Verordnung macht den Normalfall zu einem Tipp und
  die Abweichung zur bewussten Handlung.
- Das Kontingent wird dort sichtbar, wo es zählt — am Termin, nicht in der
  Akte (verwandt mit `IDEA-PRX-037`).

**Risiken.**

- **Ein Kästchen ist die falsche Zusage für einen irreversiblen Schritt.**
  Eine Verordnung in die Abrechnung zu geben ist ein rechnungsrelevanter
  Vorgang; ein Rechnungsnummernkreis lässt sich nach §14 UStG nicht
  nachträglich heilen (Roadmap H4 sagt das ausdrücklich). Abhaken darf leicht
  sein — die Freigabe zur Abrechnung braucht eine eigene, benannte
  Bestätigung. Genau das schreibt Jannes selbst schon.
- **ADR-016 bleibt vorgeschaltet.** ABR-002 koppelt die Leistung an die
  finalisierte Dokumentation, mit protokolliertem Override (`ANN-006`, C1).
  Ein schnelles Häkchen darf diese Kopplung nicht umgehen.
- **Rollenschnitt.** Welche Heilmittel geleistet wurden, ist eine
  therapeutische Aussage mit Abrechnungsfolge. Wer sie setzen darf und wer
  sie nur liest, gehört vor dem Bauen geklärt (ADR-004).
- „Abhaken" darf nicht so aussehen, als ließe es sich durch erneutes
  Antippen zurücknehmen, wenn dahinter ein Schreibvorgang mit Auditeintrag
  steht.

**Empfehlung.** Nicht vorziehen, sondern `ABR-002` damit anreichern: die
Heilmittelauswahl ist dessen Oberfläche, die Kontingentfreigabe dessen
Grenzfall. `ABR-EPIC-001` steht für **November 2026**.

---

### IDEA-PRX-040 — Aktionen der Tageskarte neu ordnen

| | |
|---|---|
| Status | überführt → `docs/development/BEFUNDE.md` |
| Quelle | Jannes, 2026-09-11 (mit Screenshot) |
| Berührt | BEF-002; UX-001, UX-007; ADR-019; MAP-005, MAP-006; `IDEA-PRX-039` |

**Stand.** Ein Befund an der gebauten Tageskarte, keine Idee: Potenziale und
Risiken (Rufnummer als Rettung des gescheiterten Besuchs, „Navigation starten"
erst nach der Karte) stehen seit dem 2026-09-13 vollständig als **BEF-002** in
[`../../development/BEFUNDE.md`](../../development/BEFUNDE.md). Hier bleibt
nur die Kennung.

---

### IDEA-PRX-041 — Anrufliste mit gespeichertem Stand

| | |
|---|---|
| Status | vorschlag |
| Quelle | CAL-009, 2026-09-12 |
| Berührt | CAL-009, ADR-008 (Frist), §20 |

**Idee.** Der Erledigt-Haken der Anrufliste überlebt heute kein Neuladen und
keinen Gerätewechsel. Wer den Tag zu zweit abtelefoniert oder zwischendurch
etwas anderes tun muss, fängt von vorn an. Ein gespeicherter Stand — wer wann
angerufen wurde, vielleicht mit „nicht erreicht" — würde das lösen.

**Warum nicht in CAL-009.** Das ist eine neue Tabelle mit Personenbezug: sie
braucht eine Datenklasse, eine Frist, eine Zuordnung im Retention Schedule und
eine Antwort darauf, ob „nicht erreicht" ein Merkmal an der Patientin wird
(§20). Das ist ein eigenes Epic, keine Ergänzung.

**Offene Frage.** Gehört der Stand an den Termin oder an einen eigenen Vorgang
„Umplanung"? Die zweite Form würde auch beantworten, warum ein Tag umgeplant
wurde — heute steht das nur als Absagegrund an jedem einzelnen Termin.

---

### IDEA-PRX-042 — Terminieren mit ausgewählter Person: der Kalender als Suchfläche

| | |
|---|---|
| Status | überführt → CAL-015c |
| Quelle | Jannes, 2026-09-12 (Gespräch über die Oberfläche) |
| Berührt | §8.1, §9, §20; CAL-015c (gebaut), ANN-050; `IDEA-PRX-008` (automatische Terminsuche), `IDEA-PRX-017` (Startort je Tag), `IDEA-PRX-031` (Gebietstage), `IDEA-PRX-032` (Fahrzeit je Weg); MAP-004, MAP-006; E12; B6 |

**Stand.** Teil 1 — Person beziehungsweise Verordnung auswählen, durch den
Kalender scrollen, freie Lücke antippen — ist am 2026-09-12 als CAL-015c
gebaut (ANN-050; `../../development/ARBEITSBEREICHE.md`, „Von der Verordnung
in den Kalender"). Teil 2 — die Einfärbung, wo der Termin mit Fahrweg
hineinpasst — hängt an MAP-006 und dem Gate aus ADR-019 und bleibt `notiert`.

**Idee.** Zwei Schritte statt eines Formulars. Erst **eine Person auswählen**,
dann **durch den Kalender scrollen** und die Lücke selbst suchen. Der Kalender
bleibt dabei der Kalender — kein eigener Suchdialog, keine Vorschlagsliste:
Wer scrollt, sieht den ganzen Tag und entscheidet mit dem, was er über die
Woche weiß. Die ausgewählte Person bleibt oben sichtbar, der Tap auf eine freie
Stelle legt den Termin an.

Der zweite Teil ist der eigentliche Hebel und setzt Fahrzeiten voraus: Solange
eine Person ausgewählt ist, färbt der Kalender ein, **wo dieser Termin
hinpasst** — gerechnet aus dem Weg vom vorherigen Termin (oder von der
Tiefgarage zu Tagesbeginn) zur Adresse dieser Person und von dort weiter zum
nächsten Termin (oder zurück zur Tiefgarage zum Feierabend). Eine Lücke, die
nur auf dem Papier frei ist, sieht dann auch auf dem Bildschirm nicht frei aus.

**Warum.** Das Terminieren ist der häufigste Vorgang der Praxis, und auf dem
Rad entscheidet nicht die freie Zeile, sondern der Weg dorthin. Genau das
unterscheidet eine Hausbesuchspraxis von einer Praxis mit Behandlungsräumen:
Dort ist jede freie Zeile gleich gut, hier nicht. Dass die Anwendung erkennen
muss, ob zwei Termine erreichbar sind, verlangt bereits §9; sichtbar zu machen,
**wo** ein Termin noch hineinpasst, ist die Bedienform dazu.

**Vorsicht.**

- **Der zweite Teil hängt am Gate.** Fahrzeiten kommen frühestens mit MAP-006
  (ADR-019 Punkt 9: DPA, §203-Verpflichtung, Subprozessoren, EU-Region, Paid
  Plan, DSFA-Wiedervorlage). Ohne das Gate gibt es keine Fahrzeit und damit
  keine belastbare Einfärbung — eine geschätzte wäre schlimmer als keine, weil
  sie eine Genauigkeit behauptet, die sie nicht hat (E12 Punkt 3 und 4 sind
  genau deshalb so entschieden worden).
- **Die Tiefgarage ist ein Startort, kein Gerät.** Start und Ende des Tages
  gehören zu `IDEA-PRX-017`; die Praxiseinstellung „Standard-Depot" reicht bis
  MAP-006. Ein persönlicher Startort bleibt ein Beschäftigtendatum (§20).
- **Einfärben ist eine Auskunft, keine Sperre** (B6, `IDEA-PRX-032`): Termine
  bleiben frei vergebbar, und nichts davon wird je Person ausgewertet.
- **Kein Name in der Adresszeile**, auch nicht im Auswahlmodus (ADR-011) — der
  Patientenfilter des Kalenders trägt bereits nur die Kennung.

**Was schon davon steht.** Der erste Teil ist gebaut (CAL-015c, siehe Stand;
`../../development/ARBEITSBEREICHE.md`), nur die Einfärbung wartet auf MAP-006.

**Offene Frage.** Ist die Einfärbung ein Band je Tag („ab 14:20 erreichbar"),
eine Markierung je freier Lücke oder eine Abstufung (erreichbar / knapp /
nicht)? Das entscheidet sich am besten an echten Wegen, also nach MAP-004.


---

### IDEA-PRX-043 — Textbausteine auch im Befund

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-19 |
| Berührt | UX-008, ANN-020, [ADR-016](../../adr/ADR-016-clinical-documentation-record.md), [ADR-005](../../adr/ADR-005-provider-independent-ai.md) |

**Stand.** Textbausteine gibt es seit UX-008 — persönlich oder praxisweit, ohne
Patientenbezug, ohne Platzhalter, ohne Sprachmodell (ANN-020). Sie stehen
heute an den Dokumentationsformularen. Der Befund selbst ist noch nicht
gebaut; er kommt mit den FRB-Loops.

**Idee.** Dieselben Textbausteine stehen auch im Befund zur Verfügung — kein
zweiter Vorrat, kein zweites Pflegeformular, dieselbe Liste an einer weiteren
Stelle.

**Warum.** Ein Erstbefund ist das längste Formular der Praxis und das mit den
meisten wiederkehrenden Formulierungen. Wer die Bausteine dort nicht hat,
tippt sie neu oder pflegt sie ein zweites Mal woanders — und ein zweiter
Vorrat für denselben Zweck ist genau der zweite Wert, den §13 ausschließt.

**Vorsicht.** Die drei Grenzen aus ANN-020 bleiben: kein Patientenbezug im
Baustein, keine Platzhalter, die beim Einfügen gefüllt werden, und kein
Sprachmodell, das Bausteine vorschlägt. Ein Baustein ist Text, den ein Mensch
geschrieben hat und ein Mensch einsetzt; alles andere wäre eine andere
Entscheidung (ADR-005, ADR-006 Punkt 4).

**Offen.** Ob der Befund eigene Kategorien braucht (Anamnese, Inspektion,
Palpation, Test) oder ob eine flache Liste reicht — das entscheidet sich am
fertigen Befundformular, nicht vorher.
