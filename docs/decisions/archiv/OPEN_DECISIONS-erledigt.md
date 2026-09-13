# Offene Entscheidungen — Archiv erledigter Punkte

Zweck: Volltexte der Punkte aus `../OPEN_DECISIONS.md`, die erledigt sind und
dort nur noch als Zweizeiler stehen (Überschrift plus Verweis hierher).
Verschoben am 2026-09-13 aus Struktur 2.1 (Stand `origin/main` `0090a93`).
Reihenfolge und Wortlaut sind unverändert; einzige Anpassung sind die relativen
Links auf `docs/adr/`, die wegen des tieferen Ordners ein `../` mehr tragen.

**Dieses Dokument hat keinen Rang** in der Dokumentenhierarchie. Es
entscheidet nichts; was hier steht, hat seine Fundstelle in einem ADR, in
`PROJECT_PRINCIPLES.md` oder als Vermerk mit Datum. Später erledigte Punkte
werden unten angehängt, in der Reihenfolge, in der sie aus
`../OPEN_DECISIONS.md` ausscheiden.

---

### B7 — Übermittlung von Adressdaten an den Kartendienst: überholte Stände

Aus dem Abschnitt B7 verschoben sind die Absätze, die durch ADR-019 Fassung 2
(Weg C, Nachtrag 2026-09-08) überholt sind — Google Maps als Kartendienst
(2026-09-06), die Embed API (E-16), das Ergebnis von ADR-019 Fassung 1 mit
den drei Wegen, die Auflösung und der damalige Blockiert-Vermerk; der geltende
Stand bleibt in `../OPEN_DECISIONS.md`.

**Entschieden am 2026-09-06 durch Jannes:** Der Kartendienst ist **Google
Maps**. Aus der Anwendung führt immer ein Link zur Navigation in Google Maps
— je Termin und für den ganzen Tag. Die Übermittlung der Adresse für die
Navigation ist datenschutzrechtlich genehmigt; die Entscheidung steht fest.
Umsetzung: Link in UX-EPIC-001 (Adresse ohne Namen, ohne Uhrzeit,
Fahrradmodus; URL-Format und Feldliste als `ANN`), Dokumentation der
Vertrags- und Datenschutzseite in ADR-019 (Roadmap G12), Nennung in der
Datenschutzinformation (PAT-006), DSFA-Wiedervorlage nach ADR-007 Punkt 2
(„wesentliche Änderung der Routing-/Standortverarbeitung").

**Entschieden am 2026-09-06 durch Jannes (E-16) — Datenweg der In-App-Karte:**
Die Karte der Tagesroute läuft über die **Google Maps Embed API** im
eingebetteten Rahmen — derselbe Anbieter wie der Link. Beim Öffnen gehen alle
Adressen eines Tages in einer Anfrage an den Dienst; die zuständige
Datenschutz-Fachkraft hat diesen Weg genehmigt (laut Jannes). Die Genehmigung
wird schriftlich zu den DSFA-Unterlagen gelegt (Roadmap G14, M0). Festgelegt
damit: Karte nur auf ausdrückliche Aktion, nie beim Öffnen einer Seite;
Adressen ohne Namen und ohne Uhrzeit; Schlüssel an die Domain gebunden; kein
Standort der Person, kein Verlauf, keine Speicherung von Routing-Rohdaten
(§18, §20). ADR-019 hält Vertragsgrundlage der Google Maps Platform,
Prüfkatalog aus ADR-002 und Schlüsselverwaltung fest; die Höchstzahl der
Zwischenziele je Anfrage kommt aus der Anbieterdokumentation.

**Ergebnis von ADR-019 (2026-09-08) — die drei Wege liegen unterschiedlich:**

- **Navigationslink: entschieden und frei.** Die Anwendung übermittelt nichts;
  die Verbindung baut das Endgerät der Therapeutin nach ihrem Tippen auf.
  Bedingung ist die Regel „nur auf Aktion, nie automatisch" — sie trägt diese
  Einordnung (EuGH C-40/17, *Fashion ID*). Dazu die Endgeräteregel und die
  Nennung in der Datenschutzinformation. UX-EPIC-001 kann bauen.
- **In-App-Karte und Fahrzeiten: nicht freigeschaltet.** Der Prüfkatalog nach
  ADR-002 scheitert an einem Kriterium, das nicht verhandelbar ist: Google
  bietet für die **Maps Platform keinen Auftragsverarbeitungsvertrag** an,
  sondern Controller-Controller-Bedingungen — Google verarbeitet als **eigener
  Verantwortlicher**. Damit fehlen AVV und §203-Verpflichtung, die §3.5 vor
  Freischaltung als MUSS verlangt, und §9 ordnet den Kartendienst
  ausdrücklich dort ein. **Das ist ein Widerspruch zu einer
  MUSS-Anforderung**, den ein ADR nicht auflösen darf (§21).

**Zur Auflösung** stehen drei Wege in ADR-019 („Der ungelöste Punkt"):
schriftliche Genehmigung plus Prinzipienänderung nach §21 (A), ohne In-App-Karte
auskommen (B), oder ein Kartendienst mit AVV für Karte und Fahrzeiten (C).
Empfehlung dort: **B, bis A geklärt ist** — das entspricht der bereits
vorgesehenen Gegenmaßnahme zu Risiko R12.

**Blockiert:** die In-App-Karte (TOUR-002) und die Fahrzeiten
(TOUR-EPIC-001b), bis A, B oder C gewählt ist. **Nicht blockiert:** der
Navigationslink, die Tourenliste, der Fahrpuffer als Praxisregel (CAL-010b).

### B12 — Stichtag der Umstellung und Rechnungsnummernkreis

| | |
|---|---|
| Dringlichkeit | erledigt |
| Bezug | §19; ADR-009 (Folgefrage Nummernkreis); GoBD |

**Erledigt am 2026-09-06 durch Jannes:** Es gibt kein altes Werkzeug. Die
Praxis nimmt den Betrieb am 01.07.2027 erstmals auf — ohne
Bestandspatient:innen, ohne laufende Verordnungen, ohne offene Rechnungen,
ohne bisherigen Nummernkreis. Damit entfallen Stichtag, Bestandsdatenübernahme
(MIG-000, MIG-001) und Parallelbetrieb. Der Nummernkreis beginnt mit der
ersten ausgestellten Rechnung; sein **Format** ist eine Frage an die
Steuerberatung und steht jetzt unter B4 (Punkt 3), bis dahin Annahme in
ABR-EPIC-002a.

### B13 — E-Mail-Versand aus der Plattform

| | |
|---|---|
| Dringlichkeit | P1 — vor STAFF-EPIC-002 |
| Bezug | §2.1, §3.5; ADR-002; ADR-012 Punkt 10 |

**Frage:** Über welchen Anbieter versendet die Plattform Transaktions-E-Mails
(Einladung eines Zugangs, Passwort zurücksetzen, später Rechnungsversand)?
Braucht das eine Prüfung nach ADR-002 und einen AVV, oder bleibt die Praxis in
Stufe 1 ohne Versand aus der Plattform (Einladung über die Provider-Oberfläche,
Rechnungsversand aus dem Praxispostfach)?

**Entschieden am 2026-09-06 durch Jannes (Option a der Entscheidung E-4):**
In Stufe 1 versendet die Plattform ausschließlich die **Auth-Mails des
geprüften Providers** — Einladung eines Zugangs, Passwort zurücksetzen. Sie
sind Teil der Providerprüfung OPS-001 (Roadmap G3); ein zweiter Dienstleister
kommt nicht hinzu. Rechnungen und alle anderen Nachrichten an Patient:innen
gehen aus dem Praxispostfach, außerhalb der Plattform; der Rechnungszustand
„versendet" wird von Hand gesetzt. Ein eigener E-Mail-Dienst mit AVV (Option b)
bleibt für Stufe 2 möglich und wäre eine neue Prüfung nach ADR-002.

**Warum das reicht:** Ein E-Mail-Dienst wäre ein neuer Dienstleister mit
Zugang zu personenbezogenen Daten (mindestens Adresse und Rolle der
Mitarbeitenden). Die Auth-Mails laufen beim Provider, der ohnehin geprüft wird.

**Blockiert:** nichts mehr; STAFF-EPIC-002 mit STAFF-004 läuft im Oktober,
sobald OPS-001 die Auth-Mails einschließt.

### D — „bestätigt": der Terminstatus-Automat

| | |
|---|---|
| Dringlichkeit | P1 — vor der Leistungserfassung (ABR-002) |
| Bezug | §8; ADR-009 (Ausfallhonorar, „durchgeführt" als abrechenbares Ereignis) |

**Entschieden am 2026-09-05 durch Jannes — Umfang:** der vollständige
Zustandsautomat: angefragt · vorgemerkt · bestätigt · abgesagt · nicht
angetroffen · durchgeführt · dokumentiert · abgerechnet. Nicht die
Minimalvariante (nur „nicht angetroffen").

**Noch offen — Ausgestaltung, als ADR-018 in CAL-EPIC-003:** Übergänge und wer
sie auslöst; Migration der heutigen Status (geplant, abgesagt, abgeschlossen);
ob „angefragt" und „vorgemerkt" vor dem Portal überhaupt erreichbar sind oder
nur vorgesehen werden; „dokumentiert" aus der Finalisierung (ADR-016) und
„abgerechnet" aus ABR-003 abgeleitet oder gesetzt; Ausfallhonorar als
Kennzeichen an „nicht angetroffen"; Terminserien (CAL-007) und ihr Verhältnis
zum Status je Termin. **Vorläufig entschieden am 2026-09-08 durch Jannes — eine der Vorfragen:**
„angefragt" und „vorgemerkt" werden **nur vorgesehen, nicht gebaut**. Ohne
Portal gibt es niemanden, der einen Termin anfragt; ADR-014 sagt „nicht
vorbauen". ADR-018 beschreibt die beiden Zustände, CAL-EPIC-003a implementiert
sie nicht. Rücknahme `klein`. Die übrigen Punkte der Ausgestaltung bleiben
offen.

**Erledigt am 2026-09-11.** [ADR-018](../../adr/ADR-018-appointment-states.md) ist
**angenommen** — Jannes hat alle sieben Bestätigungsfragen wie empfohlen
entschieden. Der ADR beantwortet die offenen Punkte der Ausgestaltung:
Übergänge und Auslöser, die Migration der drei heutigen Status, `documented`
und `invoiced` als gesetzte Werte derselben Spalte statt abgeleiteter Merkmale,
das Ausfallhonorar als Kennzeichen am Nichtantreffen, und die Serie ohne
eigenen Status.

Nachgezogen: `PROJECT_PRINCIPLES.md` **§8 in Version 0.7** (§21, eigener
Commit) — der Satz, der den Automaten als offenen Punkt führte, ist durch die
Aufzählung der acht Werte ersetzt.

**ANN-005 bleibt in Kraft** (Abschluss ohne Dokumentationspflicht): ADR-018
bestätigt sie ausdrücklich und setzt die Kopplung aus §19 an die Rechnung, nicht
an den Abschluss. Die Umsetzung des Automaten ist **CAL-EPIC-003a** und noch
nicht gebaut — bis dahin gelten in der Anwendung die drei heutigen Status.

**Nachtrag 2026-09-12:** Gebaut ist er inzwischen. CAL-EPIC-003a liegt mit
PR #28 in `main` und ist am 2026-09-12 von Jannes abgenommen; in der Anwendung
gelten damit die Werte aus ADR-018 statt der drei heutigen Status. `requested`
und `tentative` bleiben wie oben beschrieben ungebaut, `invoiced` steht im
Wertebereich und bekommt seinen Schreibpfad erst mit ABR-003.

### E8 — Dateiablage

| | |
|---|---|
| Dringlichkeit | P1 — DAT-EPIC-001 ist der nächste Loop; VER-004 und ABR-003b hängen daran |
| Bezug | §4.7, §12 („Dateizugriffe"), §18; ADR-004 Punkt 6, ADR-008, ADR-010 Punkt 2, ADR-012 Punkt 5, ADR-015 Punkt 10 |

**Frage:** Wo liegen Dateien, wer darf sie sehen, wie werden sie ausgeliefert,
wie lange bleiben sie, und wird auf Schadsoftware geprüft?

**Warum das offen war:** ADR-015 Punkt 10 hat den Ort gewählt — Supabase
Storage — und sonst nichts gesagt; derselbe ADR führt die Frage nach §12 und
ADR-008 als offene Folgefrage. ADR-004 nennt die Dateiablage zugleich den
„wahrscheinlichsten Umgehungsweg" des Berechtigungsmodells.

**Stand 2026-09-12: [ADR-017](../../adr/ADR-017-file-storage.md) liegt vor**,
Status **vorgeschlagen**. Er entscheidet dreißig Punkte, darunter: die
Datenbankzeile führt und das Objekt folgt (zweiphasiger Upload mit
Bestätigung) · Objektschlüssel nur aus Kennungen, nie ein Name · Dateien sind
unveränderlich · **Rollenschnitt an der Dokumentart**, der Verordnungsscan ist
klinisch, weil sich ein Scan nicht projizieren lässt (ANN-011) · Auslieferung
nur über **signierte Verweise mit 60 Sekunden**, ohne CDN-Zwischenspeicher und
ohne Teilen-Link, weil ein solcher Verweis nicht widerrufbar ist · drei
Auditereignisse samt der ehrlichen Grenze, dass die **Ausstellung** des
Verweises protokolliert wird und nicht das Laden · Datenklasse und Frist erbt
die Datei vom Bezugsdatensatz · **zweistufige Löschung mit Quittung**, weil
eine Datenbankfunktion kein Objekt löschen kann · **keine Virenprüfung in V1**,
Pflicht ab dem ersten Upload von außen.

**Was dabei herauskam und vorher niemand auf dem Zettel hatte:** Der
Objektspeicher läuft im Datenbank-Backup **nicht** mit. ADR-012 Punkt 5 hat das
vorausgesehen; ADR-017 macht daraus eine Vorbedingung für den Echtbetrieb mit
Dateien (OPS-003, Roadmap G7) und eine dreistufige Wiederherstellung.

**Erledigt am 2026-09-12:** Jannes hat **alle acht Bestätigungsfragen wie
empfohlen** beantwortet. ADR-017 ist damit **angenommen**, dieser Punkt ist
geschlossen, und DAT-EPIC-001 ist baubar.

**Was der Punkt nicht mehr, die Roadmap aber weiter offen führt:** Die
**produktive** Ablage hängt an OPS-001 (fünf zusätzliche Prüfpunkte zum
Objektspeicher, G3) und an einem dokumentierten, getesteten Sicherungsweg für
den Bucket (G7) — der Objektspeicher läuft im Datenbank-Backup nicht mit. Beides
ist Vorbedingung für die erste echte Datei, nicht für den Loop.

**Blockiert:** nichts mehr. DAT-EPIC-001 (Roadmap G4) kann starten; VER-004 und
ABR-003b hängen nur noch an ihren eigenen Vorläufern.

### E10 — Wer verwaltet Mitarbeiterdatensätze

| | |
|---|---|
| Dringlichkeit | P2 — vor STAFF-EPIC-002 |
| Bezug | §4.1, §4.3, §4.5 |

**Frage:** Dürfen neben `owner` auch Office („Mitarbeiterorganisation", §4.3)
und Teamleitung („Mitarbeiterplanung" als mögliches Zusatzrecht, §4.5)
Mitarbeiterdaten anlegen, ändern und den Beschäftigungsstatus wechseln?

**Warum offen:** Für den schreibenden Zugriff liegt nur für den Praxisinhaber
eine verbindliche Aussage vor. STAFF-001 folgt bis zur Entscheidung §13 („im
Zweifel blockieren"): Schreiben nur `owner`, Lesen für alle Praxisrollen.

**Entschieden am 2026-09-08 durch Jannes — dreigeteilt statt ja/nein:**

- **Stammdaten** (Name, Anschrift, Telefon, Arbeitszeitmodell): **`office` darf
  schreiben.** Das ist wörtlich die „Mitarbeiterorganisation" aus §4.3; liefe
  jede Adressänderung über den Praxisinhaber, wäre er das Nadelöhr — bei
  Bus-Faktor 1 ein reales Risiko (ADR-012).
- **Rollenvergabe** (wer wird `therapist`, wer `team_lead`): **nur `owner`.**
  Eine Rolle zu vergeben ist Berechtigungsvergabe und damit eine
  Sicherheitsentscheidung nach ADR-004.
- **Beschäftigungsstatus** (aktiv / ausgeschieden): **nur `owner`.** Der
  Wechsel sperrt einen Zugang und hat arbeitsrechtliche Wirkung.
- **`team_lead`: für nichts davon.** Die Rolle existiert für Planung; §16 sagt
  im Zweifel restriktiver, und später öffnen ist billig.

Kein Datenschutz- oder Rechtspunkt, sondern Praxisprozess — damit **entschieden**,
nicht `vorläufig entschieden`.

**Erledigt am 2026-09-11 (STAFF-002a).** Die Dreiteilung steht als
`app.can_manage_staff_master_data()`, `app.can_manage_staff_employment()` und
`app.can_manage_staff_accounts()` im Code; die Sammelfunktion
`app.can_manage_staff()` ist entfallen. §4.3 und §4.5 der Prinzipien sind nach
§21 nachgezogen (Version 0.6). **Eine Abgrenzung war zu treffen:** „Anschrift"
und „Telefon" sind als **dienstliche** Angaben umgesetzt; die Privatangaben
nach §20 bleiben bei `owner`, weil ein Schreibrecht ohne Leserecht die
gespeicherten Werte beim Speichern gelöscht hätte (ANN-024, von Jannes zu
bestätigen).

**Rücknahme:** `klein` — je Bereich eine Policy-Funktion.

**Blockiert:** nichts; STAFF-EPIC-002 übernimmt bis zur Entscheidung dieselbe
Annahme für Konten und Rollen.

### E11 — Wer gilt als behandelnde Person

| | |
|---|---|
| Dringlichkeit | P2 |
| Bezug | §4.2, ADR-014 |

**Stand:** Zuordenbar für Termine ist, wer aktiv beschäftigt ist **und** einen
eigenen aktiven Zugang mit therapeutischer Rolle besitzt (aus CAL-001). Eine
neu angelegte Therapeutin ohne Zugang kann deshalb weder eingeplant werden
noch Arbeitszeiten erhalten.

**Erledigt sich mit STAFF-EPIC-002** (entschieden 2026-09-05: Konten und
Rollen werden in der Anwendung verwaltet): Wer einen Mitarbeiterdatensatz
anlegt, lädt in derselben Oberfläche den Zugang ein und vergibt die Rolle. Die
Kopplung an den Zugang bleibt damit bewusst bestehen — ein Konto ist nach §4.2
ohnehin Pflicht. Sollte sich das im Praxisbetrieb als hinderlich erweisen
(Vertretung ohne Konto), wird der Punkt wieder geöffnet.

**Erledigt am 2026-09-11 (STAFF-002b).** Der Zugang wird am
Mitarbeiterdatensatz eingeladen (`invite_staff_account`), die Rollen entstehen
bei der Annahme (`claim_staff_invitation`). Eine neu angelegte Therapeutin ist
unmittelbar nach der Annahme für Termine zuordenbar — dafür gibt es einen Test
(`supabase/tests/staff-accounts.test.ts`, „macht die Person damit fuer Termine
zuordenbar"). Die Kopplung an den Zugang bleibt wie beschrieben bestehen.
