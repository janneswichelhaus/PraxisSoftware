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
das Terminfenster verbindlich entschieden; die Entscheidung steht in
`PROJECT_PRINCIPLES.md` §8.1, und `IDEA-PRX-002` ist deshalb auf `überführt`
gestellt — der dort vorgeschlagene Mechanismus für den Fahrpuffer bleibt
davon unberührt ein Vorschlag (`OPEN_DECISIONS.md` E12).

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

### IDEA-PRX-002 — Fahrpuffer als Praxisregel, ohne Kartendienst

| | |
|---|---|
| Status | **überführt** (2026-09-08) — der Kern ist entschieden und steht in `PROJECT_PRINCIPLES.md` §8.1; der hier vorgeschlagene Mechanismus bleibt `vorschlag` |
| Quelle | Produktreview 2026-09-06 |
| Berührt | `PROJECT_PRINCIPLES.md` §8.1, §9, §6.2; `OPEN_DECISIONS.md` E12, B7; CAL-EPIC-003b (CAL-010a, CAL-010b); ADR-019 |

**Wohin die Idee gegangen ist.** Jannes hat am 2026-09-08 das Terminfenster
entschieden — 60 Minuten je angebotenem Termin einschließlich Dokumentation,
Beginn weiter frei im 5-Minuten-Raster, Fahrzeit zusätzlich zwischen den
Terminfenstern, früheste Folgezeit auf dem ersten Rasterpunkt auf oder nach
Ende plus Fahrzeit. **Verbindlich ist allein `PROJECT_PRINCIPLES.md` §8.1.**
Dieser Eintrag regelt nichts und gibt den Wortlaut bewusst nicht wieder; wer
die Regel braucht, liest §8.1.

**Idee (unverändert, weiterhin nur Vorschlag).** Eine `owner`-Einstellung
„Mindestabstand zwischen zwei Hausbesuchen an verschiedenen Adressen" in
Minuten, dazu optional von Hand gepflegte Fahrminuten je Patient:in ab Depot.
Der Kalender warnt beim Anlegen und beim Ziehen, wenn der Abstand
unterschritten wird.

**Was daran nicht entschieden ist.** Genau dieser Mechanismus — pauschaler
Mindestabstand, gepflegte Fahrminuten, Warnung statt Sperre. §8.1 sagt, **wie**
aus einer Fahrzeit die früheste Folgezeit wird, nicht **woher** die Fahrzeit
kommt und was bei Unterschreitung passiert. Das steht als **E12** in
`../../decisions/OPEN_DECISIONS.md` und wird dort entschieden, nicht hier.

**Warum.** §9 verlangt, dass die Anwendung erkennt, ob zwei Termine zeitlich
erreichbar sind; §8 nennt Behandlungsdauer und Fahrzeit als harte Constraints
der Terminplanung. MD Therapie plant Fahrzeiten automatisch, THEORG
kontrolliert Abstände zwischen Terminen. Seit dem 2026-09-08 (MAP-001, ADR-019
Fassung 2) ist PTV Developer Kandidat für den Kartendienst, noch nicht
freigegeben; Fahrzeiten aus dem Dienst kommen mit MAP-006 (`IDEA-PRX-032`).
Bis dahin müsste die Zahl aus der Praxis kommen — genau das ist die offene
Frage aus E12.

**Umsetzungsstand (2026-09-12).**

- **Raster: gebaut.** `appointment_grid_minutes` erlaubt 5, 10 oder 15
  Minuten, praxisweiter Standard ist 5; der Beginn wird gegen Mitternacht der
  Praxiszeitzone geprüft (CAL-005,
  `supabase/migrations/20260830120000_scheduling_grid.sql`).
- **60-Minuten-Terminfenster: gebaut** (CAL-010a, 2026-09-12).
  `app.appointment_window_minutes()` hält die Zahl an einer Stelle;
  `create_appointment` verlangt sie immer, `update_appointment` prüft sie,
  sobald sich die Länge ändert. Im Formular ist das Ende eine Ableitung statt
  eines Feldes. Bestandstermine mit abweichender Länge bleiben gültig und
  verschiebbar — die Abgrenzung steht als **ANN-037** im Register.
- **Fahrpuffer: nicht gebaut.** Weder eine Mindestabstands-Einstellung noch je
  Patient:in gepflegte Fahrminuten noch eine Warnung im Kalender; zwei
  Hausbesuche an verschiedenen Adressen lassen sich heute ohne jeden Abstand
  hintereinander anlegen. **CAL-EPIC-003b hat CAL-010b bewusst liegen
  gelassen** (2026-09-12): E12 Punkt 3 und 4 sind offen, und ein pauschaler
  Wert neben den echten Fahrzeiten aus MAP-004 wäre genau der zweite,
  schlechtere Mechanismus, vor dem E12 warnt.

**Vorsicht.** Deterministisch (§6.2), keine Optimierung, keine Verschiebung
bestätigter Termine (§8). Die Aufrundungsregel ist ein eigenständiges, leicht
falsch zu implementierendes Detail — naheliegend wäre fälschlich Abrunden —
und gehört mit dem Beispiel aus §8.1 als Testfall in `pnpm test:db`, sobald
CAL-010b gebaut wird.

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
| Status | **überführt** — gebaut als CAL-009 am 2026-09-12 |
| Quelle | Produktreview 2026-09-06 |
| Berührt | ADR-018, CAL-EPIC-003a (CAL-009), §4.3 |

**Was davon gebaut ist.** Alle bestätigten Termine einer Person eines Tages
werden in einer Transaktion abgesagt, danach steht die Anrufliste mit Uhrzeit,
Name und Wählziel auf derselben Seite. **Nicht gebaut:** „vorgemerkt" (der
Zustand existiert nach ADR-018 nur auf dem Papier), die Übergabe an eine
Kollegin und ein **gespeicherter** Erledigt-Haken — der Haken hält heute nur,
solange die Seite offen ist. Siehe `IDEA-PRX-041`.

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
| Status | **überführt** (2026-09-12) — als Druckansicht gebaut (CAL-011), der E-Mail-Weg als Handoff (CAL-013); der PDF-Teil und die Tourenliste bleiben `vorschlag` |
| Quelle | Wettbewerbsanalyse 2026-09-06 (THEORG, appointmed, iPrax, Optica) |
| Berührt | CAL-011 und CAL-013 (gebaut), UI-000 (Druck-Basis), B14, B15; ANN-039, ANN-041 |

**Gebaut ist der Terminzettel je Person** (CAL-011, 2026-09-12): „Ihre
nächsten Termine" unter `/patienten/:id/terminzettel`, erreichbar aus dem
Abschnitt „Nächste Termine" der Akte. Datum, Uhrzeit, Ort und behandelnde
Person der nächsten bestätigten Termine; kein Status, keine Verordnung, keine
Adresse. **Nur Druck über die Druck-Basis aus UI-000**, kein PDF und kein
Versand. Was der Zettel enthält und warum, steht als **ANN-039** im Register
und ist dort verbindlich, nicht hier.

**Gebaut ist auch der E-Mail-Weg** (CAL-013, 2026-09-12), nachdem Jannes den
Versand von Terminmails ausdrücklich vorgesehen hat (B15-Nachtrag): dieselbe
Liste als fertiger Entwurf im Mailprogramm der Praxis, gesendet wird dort von
Hand. Verbindlich ist dazu **ANN-041**, nicht dieser Eintrag.

**Offen geblieben (weiter nur Vorschlag).** Das PDF als Datei (hängt an B14,
dem PDF-Weg der Rechnung) · der Versand per **SMS** (bleibt an B15; Messenger
ist ausgeschlossen) · echter Versand **aus der Anwendung** statt eines
Handoffs, also mit Dienstleister und Zustellstatus · die **Tages- oder
Tourenliste je Therapeut:in** zum Drucken, die E2 mit abdecken würde — sie ist
ein anderer Ausdruck mit anderem Empfänger und anderer Datenlage.

**Warum.** Hochbetagte Patient:innen ohne Portal; heute schreibt die
Therapeutin Zettel per Hand. THEORG verkauft dafür sogar Papierblöcke.

**Vorsicht.** Das Dokument enthält Termine, also ein Gesundheitsdatum;
Ausgabe nur an die Person selbst. Für die E-Mail gilt zusätzlich, was ANN-041
festhält: nur auf ausdrücklichen Wunsch, Inhalt auf das Organisatorische
begrenzt, Betreff ohne Aussage.

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

**Offen.** Erst nach MAP-006 (Fahrzeiten) oder mit der Regel aus
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
| Berührt | §9, §18, §20, §3.5; ADR-002, ADR-007; B7; ADR-019 Fassung 2; MAP-002 bis MAP-006 (Roadmap Etappe T); E-16 überholt, siehe Nachtrag |

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

**Nachtrag 2026-09-08 (MAP-001):** Die Embed API ist überholt — Google bietet
für die Maps Platform keinen AVV. ADR-019 Fassung 2 setzt auf MapLibre in der
Anwendung mit PTV Developer als Kandidat; Umsetzung in MAP-002 bis MAP-006
(`development/MAP-LOOPS.md`). Die Idee selbst bleibt bestätigt.

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

**Nachtrag 2026-09-08 (MAP-001):** Als Navigations-Handoff in ADR-019
Fassung 2 (Punkt 20 bis 23) und ANN-018 gefasst — Ziel-Apps Google Maps,
Apple Maps oder Systemnavigation, nur Ziel und Fahrradmodus, Bewertung der
Ziel-Apps in MAP-005. Nicht automatisch risikofrei; Frage an B2.

---

### IDEA-PRX-031 — Gebietstage für die Terminvergabe

| | |
|---|---|
| Status | vorschlag |
| Quelle | Claude, 2026-09-06, aus dem Lastenrad-Konzept |
| Berührt | §6.2, §8, §9; CAL-007, CAL-010b; `IDEA-PRX-008`; B6 |

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
| Berührt | §9, §18, §20; B6, B7; MAP-006; `IDEA-PRX-002` |

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
Damit sind es synthetische Daten, und die Datei ist nachgelegt.

Für den nächsten Entwurf dieser Art: Namen im Muster des Seeds („Anna
Beispiel", „Max Mustermann") ersparen die Rückfrage — sie sind als erfunden
erkennbar, ohne dass jemand danach fragen muss.

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

**Offen.** Von Hand gepflegt oder abgeleitet? Am Termin, an der Person oder am
Tag? Ohne diese Entscheidung ist nichts spezifizierbar.

---

### IDEA-PRX-036 — Indikation in der Tagesliste

| | |
|---|---|
| Status | **verworfen** in dieser Form (2026-09-11) — das Bedürfnis lebt in `IDEA-PRX-016` weiter |
| Quelle | Jannes, 2026-09-11 (Kanvas „Own Motion · Praxis") |
| Berührt | §4.3, §4.6, §16; ADR-004; `IDEA-PRX-016`; `list_day_plan` (UX-001) |

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
| Status | notiert — Eingabe für die Ablaufrunde „Mein Tag" (Jan 2027) |
| Quelle | Jannes, 2026-09-11 |
| Berührt | §8.1; ADR-016; UX-007, UX-009, DOK-001/002; `ANN-015`, `ANN-019`; ABR-002 |

**Idee.** Die Textfelder der Dokumentation sollen ohne Scrollen sichtbar sein;
womöglich helfen Unterseiten, damit das Auge nicht an Unwichtigem hängen
bleibt.

**Befund aus dem Code (2026-09-11), bevor irgendetwas gebaut wird.** Die
beiden Dokumentationsseiten sind **nicht** schlecht sortiert.
`CompleteTreatmentPage` und `TreatmentNotePage` stellen das Textfeld an die
zweite Stelle, direkt hinter die Textbausteinleiste. Wer hier „Feld nach oben"
baut, baut etwas, das schon so ist. Das Scrollen kommt aus zwei anderen
Richtungen:

1. **Das Gerüst über dem Feld.** Auf einem 375 × 667-Telefon stehen vor dem
   Feld: Kopfzeile (56), Untermenü, Seitentitel mit Beschreibung,
   Textbausteinleiste. Das sind grob 250 von 667 Punkten, bevor die erste
   Zeile kommt. Seit DS-001 ist der Seitentitel 32 px statt 22 — der Befund
   hat sich also gerade **verschärft**, nicht entspannt.
2. **Der Weg dorthin.** Aus der Akte heraus liegt die Dokumentation hinter
   Person, Kontakt, Hausbesuch und Versorgung. Der kurze Weg ist der über
   „Mein Tag" → „Behandlung abschließen"; wer ihn nicht kennt, scrollt.

**Potenziale.**

- Ein eigener Schreibmodus: Feld, Textbausteine, eine Aktion. Kein Untermenü,
  keine Seitenbeschreibung, Titel einzeilig. Das ist der größte Hebel und
  ändert an der Fachlogik nichts.
- Fokus auf das Feld beim Öffnen — spart den ersten Tipp.
- Unterseiten je Schritt (Doku → Heilmittel → Abschluss), wenn der Abschluss
  ohnehin mehr entscheidet als heute (siehe `IDEA-PRX-039`).

**Risiken — und eines davon ist ein Stopp.**

- **Die Patientenidentität darf nicht verschwinden.** Der Seitentitel trägt
  heute Name, Datum und Uhrzeit. Wer ihn wegkürzt, um Platz zu gewinnen,
  nimmt die einzige Kontrolle gegen die Falschzuordnung heraus — und
  „Datenverlust/Falschzuordnung" ist genau die Befundklasse, an der M6
  hängt. Platz sparen ja, Identität nein.
- **Unterseiten vervielfachen die Stellen, an denen Text verloren geht.**
  Es gibt bewusst keinen lokalen Zwischenspeicher (`ANN-015`); der Entwurf
  liegt serverseitig. Der bekannte Restpunkt aus VER-003 — Entwurf bleibt beim
  Verlassen über die Hauptnavigation liegen statt verworfen zu werden — ist
  genau dieser Fehlerklasse. Jede zusätzliche Seite ist eine zusätzliche
  Gelegenheit dafür.
- **ADR-016 Punkt 4 und 5 verbieten, die Folge zu verstecken.** Der Text
  „Mit dem Abschluss geschieht zweierlei …" steht heute absichtlich **vor**
  der Schaltfläche, nicht in einer Rückfrage danach. Auf eine andere
  Unterseite geschoben wäre das eine Aufweichung, kein Feinschliff.
- **§8.1 gibt 60 Minuten einschließlich Dokumentation.** Ein Assistent mit
  vier Schritten kostet Tipps und schafft vier Stellen zum Steckenbleiben.
  Mehr Seiten sind nur dann besser, wenn jede Seite eine Entscheidung
  abnimmt — nicht, wenn sie nur aufteilt.
- Mehr Routen heißen mehr Routen-Wächter und mehr RLS-Fläche (ADR-004).

**Gemessen am 2026-09-11, nach dem ersten kleinen Schritt.** Der Seitentitel
der Dokumentationsseiten ist jetzt kompakt (`PageHeader kompakt`). Auf
375 × 667 beginnt das Textfeld damit bei **359 statt 413 Punkten**, sichtbar
sind **308 statt 254**. Das sind 54 Punkte und ein Fünftel mehr Feld — und es
**löst den Befund nicht**: das Feld startet weiter über der Hälfte des
Schirms. Die verbleibende Höhe steckt in der Kopfzeile (56), im Untermenü
„Kalender · Touren" — das beim Schreiben nichts beiträgt — und in der
Polsterung des Inhalts. Der nächstgrößere Hebel ist damit benannt und
gemessen, nicht vermutet.

**Wie es weitergehen sollte.** Nicht als freier Umbau, sondern als
Ablaufrunde nach `../../development/OPTIMIERUNG.md`. Die misst den echten
Ablauf („Besuch dokumentieren und abschließen") gegen die sechs Bedingungen
und schreibt Akzeptanzhinweise in bestehende Roadmap-Zeilen. Die Runde
braucht als Eingabe Jannes' eigene Beobachtung an einem echten Tag (§20:
gemessen wird nur durch ihn selbst) — ohne die bleibt jede Umsortierung
geraten.

---

### IDEA-PRX-039 — Termin abhaken: Heilmittel, Kontingent und die Freigabe zur Abrechnung

| | |
|---|---|
| Status | notiert — überschneidet sich absichtlich mit ABR-002 |
| Quelle | Jannes, 2026-09-11 |
| Berührt | ADR-009, ADR-016; ABR-001, **ABR-002**; VER-002, VER-003; `ANN-006`, C1 |

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
| Status | notiert — Eingabe für die Ablaufrunde „Mein Tag" |
| Quelle | Jannes, 2026-09-11 (mit Screenshot) |
| Berührt | UX-001, UX-007; ADR-019; MAP-005, MAP-006; `IDEA-PRX-039` |

**Idee.** Die Reihenfolge der Aktionen auf der Tageskarte stimmt nicht: die
Telefonnummern stehen vorn, obwohl sie selten gebraucht werden. Gewünscht
sind stattdessen ein eigenes Feld **„Doku"**, ein Abhaken statt „Behandlung
abschließen" (siehe `IDEA-PRX-039`), und „Navigation starten" braucht es hier
womöglich gar nicht mehr, sobald die Karte in der Anwendung steht.

**Potenziale.**

- „Doku" als eigene Aktion macht den häufigsten Weg zum kürzesten und zahlt
  direkt auf `IDEA-PRX-038` ein.
- Weniger Schaltflächen nebeneinander heißt größere Ziele auf dem Telefon.

**Risiken.**

- **Die Rufnummer ist die Rettung des gescheiterten Besuchs.** Wenn niemand
  öffnet, ist sie die einzige Handlung, die den Termin noch rettet — und
  genau dann steht man im Hausflur, mit Handschuhen. Nach hinten ja,
  weggeklappt nein. Ihre heutige Stelle stammt aus UX-001, nicht aus
  Zufall.
- **„Navigation starten" darf erst weichen, wenn die Karte wirklich da ist.**
  Der Handoff ist heute der einzige Weg zur Route. Die Karte kommt mit
  MAP-005/MAP-006 und hängt an ADR-019 — und dessen produktive Freigabe
  steht am Vertrags-, §203- und DSFA-Gate. Die Aktion vorher zu entfernen
  hieße, einen funktionierenden Weg gegen einen geplanten zu tauschen.

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

Zuletzt aktualisiert: 2026-09-12 (`IDEA-PRX-004` auf `überführt`, neu `IDEA-PRX-041` aus CAL-009). Vorherige Aktualisierung: 2026-09-11 (`IDEA-PRX-038` bis `-040` aus dem Gespräch über Dokumentationsablauf, Tageskarte und Kalenderwechsel). Vorherige Aktualisierung: 2026-09-11 (`IDEA-PRX-034` bis `-037` aus dem Design-Kanvas „Own Motion · Praxis"; die Kanvas-Datei liegt seit der Bestätigung, dass die Namen erfunden sind, unter `../kanvas/own-motion-praxis.html`). Vorherige Aktualisierung: 2026-09-08 (`IDEA-PRX-002` auf `überführt`; das
Terminfenster steht als §8.1 in den Prinzipien, der Fahrpuffer-Mechanismus als
E12 in den offenen Entscheidungen). Vorherige Aktualisierung: 2026-09-06
(Entscheidungen E-9, E-12, E-13; Tagesroute `IDEA-PRX-029` bis `-033`)
