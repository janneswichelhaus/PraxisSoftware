# Roadmap

Version 4.3 · Stand 2026-09-12 · **in Kraft**

Reihenfolge der Umsetzung. Beantwortet die Frage **„was als Nächstes"** — und
sonst nichts.

Version 2.1 setzt die Entscheidungen E-1 bis E-14 aus dem Roadmap-Review vom
2026-09-06 um; Jannes hat sie am 2026-09-06 beantwortet (Wortlaut in
`docs/decisions/OPEN_DECISIONS.md`, Historie). Review und Entwurf sind nach
ihrer eigenen Regel gelöscht und liegen in der Git-Historie (Commit
`7ab6f71`). Aus derselben Antwort stammen drei neue Vorgaben — **die Praxis
eröffnet am 01.07.2027 ohne Vorgängersystem**, **Navigation über Google Maps
ist entschieden**, **eine Plattform für Patient:innen und
Personal-Training-Kund:innen gehört zum Zielbild**. Die fünf Rückfragen dazu
(E-15 bis E-19) hat Jannes am selben Tag beantwortet; die Antworten stehen im
Abschnitt „Antworten E-15 bis E-19" und in der Historie von
`OPEN_DECISIONS.md`. **Die wichtigste: Die Reihenfolge ist verbindlich, der
Kalender nachrangig** (E-15) — siehe „Sessions starten".

## Was dieses Dokument ist und was nicht

- **Es legt die Reihenfolge fest, nie den Scope.** Was ein Eintrag konkret
  umfasst, entsteht erst im SPEC-Schritt des Loops.
- **Es ist kein Auftrag.** Gebaut wird, was Jannes mit `/feature-loop`
  beauftragt. Ein Eintrag hier startet nichts von allein.
- **Es überschreibt nichts.** `PROJECT_PRINCIPLES.md`, die ADRs und
  `docs/decisions/OPEN_DECISIONS.md` gelten unverändert. Fehlt einem Eintrag
  eine Voraussetzung aus Spur B, gilt `PROJECT_PRINCIPLES.md` §15.1: reversibel
  überbrückbar → als Annahme registrieren und bauen; Hard-Stop-Liste → melden
  und nur den abhängigen Teil nicht beginnen.
- Die fachlichen Inhalte dahinter stehen im Ideenspeicher (`docs/product/`,
  nicht normativ). Verweise wie `IDEA-PRX-004` zeigen dorthin.
- Was in der Anwendung echt angebunden ist und was gekennzeichnete Vorschau,
  steht in [`ARBEITSBEREICHE.md`](ARBEITSBEREICHE.md).
- Wie ein Arbeitsbereich systematisch besser wird, steht in
  [`OPTIMIERUNG.md`](OPTIMIERUNG.md). Die Runden dort liefern Vorschläge; erst
  diese Roadmap gibt ihnen einen Platz.

Jeder Loop liest dieses Dokument zuerst und stellt am Ende die
Fortschrittstabelle und den Abschnitt „Nächster Loop" nach.

---

## Nächster Loop

```
/feature-loop DAT-EPIC-001 Dateiablage
```

- **Voraussetzung:** ADR-017 Dateiablage. Der ADR ist noch nicht geschrieben
  (Etappe G, Zeile G1) — er läuft als Docs-Session und wartet auf Jannes'
  Bestätigung. Bis dahin kann DAT-EPIC-001 nicht sinnvoll beginnen; wer früher
  starten will, zieht `ABR-EPIC-001` vor (Voraussetzung: B4 als Annahme).
- **`UI-002 Lesbarkeit` ist am 2026-09-12 fertig** (vier Stories) — ein Epic
  aus Jannes' Rückmeldung an der laufenden Anwendung, **nicht** aus dieser
  Reihenfolge. Der Bereich **„Übersicht" der Akte ist entfallen**; er war ein
  Auszug aus den vier anderen Bereichen, und `/patienten/:id` führt jetzt in
  den ersten Bereich, den die Rolle sehen darf. Zugangshinweis und
  Besonderheit stehen im Kopf, damit sie nicht hinter einen Bereichswechsel
  rutschen (UI-002a) · **Papier ist weiß**: Karte und Seitengrund lagen bei
  1,09:1 und waren als Ebenen nicht unterscheidbar; ein Token, 103 Stellen
  (UI-002b) · **Termine, Listen und Auskünfte stehen im weißen Rahmen**, die
  Bedienung — Filterleisten, Legenden, Rückfragen — bleibt vertieft; die Regel
  dazu trägt `Section rahmen` (UI-002c) · **„Mein Konto" sagt, dass die
  Anmeldung den zweiten Faktor noch nicht abfragt** (UI-002d). Keine
  Migration, keine neuen Rechte. **Seine Abnahme steht aus**
  (`docs/abnahme/etappe-1-kernprozess.md`, Abschnitt UI-002).
- **Zweiter Faktor: vertagt bis nach dem Online-Schalten (Jannes,
  2026-09-12).** Damit rückt `FIX-EPIC-002` hinter die Inbetriebnahme, und
  ANN-028 hat seine Wiedervorlage von dort statt von der Domain (Nachtrag im
  Register). Die **Zusage ohne Deckung ist mit UI-002d geschlossen**: „Mein
  Konto" sagt vor der Einrichtung, dass die Anmeldung den Faktor derzeit nicht
  abfragt. Der Nachtrag benennt außerdem den Unterschied, den ANN-028 bis
  dahin verwischte — „nicht erzwungen" hieß in Wirklichkeit „gar nicht
  geprüft".
- **Terminieren mit ausgewählter Person (`CAL-EPIC-004`, vorgeschlagen, noch
  ohne Platz in der Reihenfolge).** Jannes' Vorgabe vom 2026-09-12 steht als
  `IDEA-PRX-042` im Ideenspeicher. Sie zerfällt sauber in zwei Teile: Person
  auswählen, durch den Kalender scrollen, freie Lücke antippen — das ginge
  **jetzt**, ohne Kartendienst. Die Einfärbung „hier passt der Termin mit
  Fahrweg hin" (Tiefgarage → Termin → nächster Termin → Tiefgarage) braucht
  Fahrzeiten und damit **MAP-006**, das am Gate aus ADR-019 Punkt 9 hängt.
  Vorher gebaut wäre sie eine geschätzte Zahl neben einer gemessenen — genau
  das, was E12 Punkt 3 und 4 am 2026-09-12 ausgeschlossen haben.
- **FIX-EPIC-001 ist am 2026-09-12 fertig** (fünf Stories) — ein Befund-Loop
  aus einer Prüfung, nicht aus dieser Reihenfolge (R6). Er hat drei Zusagen
  eingelöst, die die Oberfläche gab, ohne sie zu halten: Auth-Links hatten
  keinen Empfangspfad, der Abfragespeicher wurde nur an einem von vier Wegen
  geräumt, und „Alle Sitzungen beenden" versprach mehr, als der Anmeldedienst
  leistet. **Seine Abnahme steht aus** und braucht Docker (Mailfänger).
- **Zwei Befunde daraus sind eigene Epics und ungebaut**: der zweite Faktor
  wird beim Anmelden nie abgefragt (`FIX-EPIC-002`, sicherheitsrelevant), und
  ungespeicherte Dokumentation ist bei interner Navigation ungeschützt
  (`FIX-EPIC-003`, braucht eine Entscheidung zum Router). Beide stehen im
  Bericht zu FIX-EPIC-001 mit Zuschnitt.
- **CAL-EPIC-003b ist am 2026-09-12 fertig** (drei Stories): 60-Minuten-Terminfenster
  nach §8.1, serverseitig durchgesetzt in beiden Schreibpfaden, mit
  abgeleitetem Ende im Formular und Bestandsschutz (CAL-010a) · Terminserie aus
  einer Verordnung in **einem** Vorgang mit Anzahl aus dem Kontingent, drei
  Rhythmen, Konfliktprüfung je Zeile und Einzelabweichung (CAL-007) ·
  Terminzettel als Druckansicht (CAL-011, `IDEA-PRX-006`, damit überführt).
  **ANN-037 bis ANN-039 hat Jannes am 2026-09-12 wie empfohlen bestätigt** —
  Prüfung der Terminfensterlänge statt des Zeitpunkts, „verplant ist nicht
  genutzt" samt Rhythmen und Obergrenze, Inhalt und Ausgabeweg des
  Terminzettels. ANN-037 und ANN-038 sind `Praxisprozess` und damit erledigt;
  **ANN-039 (`Datenschutz`) bleibt im Prüfpaket** und gehört in die Anfrage B2.
- **Als Folgeauftrag nachgereicht: CAL-012 Mitteilungsvermerk am Termin**
  (2026-09-12, Vorbild iPrax). Hinter jedem Termin der Akte steht, ob und auf
  welchem Weg er mitgeteilt wurde; der Vermerk verfällt mit jeder
  Terminänderung. **ANN-040 ist neu und `Datenschutz`**: Er gehört in die
  Anfrage B2, zusammen mit der Frage, ob der Weg „per E-Mail mitgeteilt" in
  der Auswahl bleiben soll.
- **Als eigener Auftrag nachgereicht: die Patientenakte als Arbeitsplatz**
  (AKTE-000 bis AKTE-005, 2026-09-12). Jannes hat die Akte anhand eines
  Screenrecordings beurteilt: zu viel Scrollen, die aktuellen Arbeitsaufgaben
  zu weit unten. Gebaut ist ein Rahmen mit kompaktem Kopf und fünf Bereichen;
  die Übersicht beantwortet „was ist zu tun", alles Seltene ist einen Tap
  entfernt. Dazu zwei rein organisatorische Lesepfade und die Trennung von
  **Leistungseinheiten** und **Terminen**, die vorher beide „Kontingent"
  hießen (ANN-038 unverändert, nur sauber benannt). **Keine neue Annahme** —
  Rollenschnitte, Lesepfade und Fachregeln sind dieselben.
- **Als eigener Auftrag nachgereicht: die Bedienabläufe zwischen den
  Bereichen** (UX-012a bis UX-012f, 2026-09-12). Kein neuer Bereich, sondern
  die Wege **zwischen** den vorhandenen: Rückwege, die Ansicht, Person, Datum
  und Filter erhalten; Anlegen und Ergänzen aus dem laufenden Vorgang heraus,
  ohne das Eingetippte zu verlieren; Kontext und eindeutige Benennung in
  Formularen; Formularfehler oben mit dem Weg ins Feld; Suchfehler getrennt
  von „Kein Treffer". Dazu **zwei echte Fehler**: Nach dem Anlegen einer
  Terminserie stand ein falscher Abfrageschlüssel, sodass die Akte veraltet
  blieb; und die Serienprüfung konnte ein altes Ergebnis für eine **geänderte**
  Liste als gültig ansehen. **ANN-039 und ANN-041 in Fassung 2**: Drucken und
  Mailen **bereiten** nur vor — vermerkt wird erst auf Bestätigung, weil der
  Vermerk sonst eine Übergabe behauptet, die niemand gesehen hat.
- **Als Folgeauftrag nachgereicht: CAL-013 Termine per E-Mail** (2026-09-12).
  Jannes hat den Versand von Terminmails ausdrücklich vorgesehen und damit
  seine eigene vorläufige Entscheidung zu **B15** in einem Punkt geändert
  (Nachtrag dort). Gebaut ist ein **Handoff**: Die Anwendung baut aus den
  Terminen des Zettels einen fertigen Entwurf und übergibt ihn dem
  Mailprogramm der Praxis; gesendet wird dort von Hand. Kein Dienstleister,
  keine automatische Erinnerung, kein SMS- oder Messenger-Weg. Der Vermerk
  entsteht dabei von allein — wie beim Druck seit CAL-012. **ANN-041 ist neu
  und `Datenschutz`**: Er gehört in die Anfrage B2, zusammen mit der Frage,
  ob der Hinweis an der Stelle der Entscheidung reicht oder ein dokumentierter
  Wunsch je Patient:in verlangt wird (PAT-006).
- **E12 Punkt 3 und 4 sind am 2026-09-12 vorläufig entschieden: der Fahrpuffer
  kommt erst mit MAP-006.** Kein pauschaler Mindestabstand, keine von Hand
  gepflegten Fahrminuten. **CAL-010b entfällt als eigene Story** und geht in
  MAP-006 auf — samt der Aufrundungsregel aus §8.1 und ihrem Testfall. Offen
  bleiben allein E12 Punkt 1 und 2 (begründete Abweichung von 60 Minuten,
  Länge je Praxis einstellbar); sie hängen als Wiedervorlage an ANN-037.
- **CAL-EPIC-003a ist am 2026-09-12 fertig** (fünf Stories): sechs
  Terminzustände nach ADR-018 mit der Umbenennung `scheduled` → `confirmed` ·
  Absage nur mit codiertem Pflichtgrund und ohne Rückweg · „nicht angetroffen"
  mit Pflichtentscheidung zum Ausfallhonorar, samt Löschregel · `documented`
  aus der Finalisierung mit getesteter Invariante · Tag umplanen mit
  Anrufliste (`IDEA-PRX-004`, jetzt überführt). **ANN-034 bis ANN-036 hat
  Jannes am 2026-09-12 wie empfohlen bestätigt** — Absagegrund als codierte
  Auswahl ohne Freitext, No-show unter der Frist der abgesagten Termine (mit
  Ausfallhonorar keine Löschung), `documented` auch aus `confirmed`. ANN-034
  (`Datenschutz`) und ANN-035 (`Recht`) bleiben deshalb **im Prüfpaket**;
  ANN-036 ist `Technik` und damit erledigt. Die
  Abnahmeschritte stehen in `docs/abnahme/etappe-1-kernprozess.md`; die
  Oberfläche ist hinter der Anmeldung maschinell geprüft
  (`tests/e2e/authenticated/appointment-states.spec.ts`, läuft in CI).
  **`invoiced` ist im Wertebereich, hat aber keinen Schreibpfad** — den bringt
  ABR-003, zusammen mit dem Auditereignis `appointment.invoiced` und der
  Anpassung der beiden Feld-Constraints.
- **Danach, in dieser Reihenfolge:** `ABR-EPIC-001` · `ABR-EPIC-002a` ·
  `ABR-EPIC-002b`.
- **LOE-EPIC-001 ist am 2026-09-11 fertig** (fünf Stories): Retention Schedule
  als Daten, Anker „Abschluss der Versorgung", Legal Hold, täglicher Löschlauf
  mit Löschjournal und Wiederanwendung nach einem Restore, Aufbewahrungs-
  übersicht für `owner`. Zwei betriebliche Punkte hängen daran und stehen in
  `docs/DEVELOPMENT.md`: Der Löschlauf braucht `pg_cron` im Produktivprojekt
  (OPS-001), und das Restore-Verfahren muss das Löschjournal sichern und
  wieder einspielen (OPS-003).
- **Sechs Epics sind am 2026-09-11 von Jannes abgenommen:** DOK-001 bis
  DOK-004, VER-EPIC-001, UI-000, MARKE-001, UX-EPIC-001 und LOE-EPIC-001.
  Zusammen mit STAFF-EPIC-002 wartet damit nur CAL-EPIC-003a auf Abnahme.
  Die Gegenmaßnahme zu R6 (Befundwelle aus späten Abnahmen) greift damit;
  Befunde aus den Abnahmen gehören als erste Story in den nächsten Loop
  derselben Spur, nicht in einen eigenen.
- **MFA vertagt (Jannes, 2026-09-11).** Die **Pflicht** zum zweiten Faktor für
  `owner` wird erst geplant, **wenn eine Domain für die Anwendung feststeht**
  — also frühestens mit dem Frontend-Hosting (G5/OPS-002). Gebaut und
  benutzbar ist sie bereits; ANN-028 hält den Stand und den Weg dorthin fest.
- **Zuschnitt geklärt (ADR-019 Fassung 2, MAP-001, 2026-09-08), mit UX-002
  umgesetzt:** der Handoff übermittelt nichts aus der Anwendung; er baut die
  URL nach ANN-018 (Adresse ohne Namen, Fahrradmodus) und ist nicht
  automatisch risikofrei (ADR-019 Punkt 23, Frage an B2). Bedingung: **nur
  auf Aktion, nie automatisch**. Die **In-App-Karte** und die **Fahrzeiten**
  kommen als MAP-002 bis MAP-006 (Etappe T, `MAP-LOOPS.md`) mit **PTV
  Developer** als Kandidat.
- **Parallel startbar, sobald der PTV-Schlüssel vorliegt:**
  `/feature-loop MAP-002 In-App-Kartenprototyp nach docs/development/MAP-LOOPS.md`
  — nur synthetische Daten.
- **Offen aus UI-000:** die Vorschaubereiche nutzen die gemeinsamen
  Bausteine noch nicht. Sie werden in ihrem eigenen Loop ersetzt, nicht
  vorher umgestellt (ARBEITSBEREICHE.md).
- **Von Jannes bestätigt:** am 2026-09-12 ANN-037 bis ANN-039 aus
  CAL-EPIC-003b; am 2026-09-11 ANN-018, ANN-020, ANN-021 aus
  UX-EPIC-001, ANN-024, ANN-027, ANN-028 aus STAFF-EPIC-002 und ANN-029 bis
  ANN-033 aus LOE-EPIC-001; am 2026-09-12 ANN-034 bis ANN-036 aus
  CAL-EPIC-003a. Alle mit Kategorie `Datenschutz` oder `Recht` bleiben **im
  Prüfpaket**: Die Bestätigung des Projektinhabers ersetzt die
  Datenschutzprüfung nicht. Erledigt sind damit allein ANN-032 und ANN-036 —
  die beiden Einträge der Kategorien `Praxisprozess` und `Technik`.
- **Weiter offen:** ANN-001, ANN-004, ANN-005, ANN-008, ANN-009, ANN-011,
  ANN-013, ANN-014, ANN-016, ANN-017 und die Providerfrage aus ANN-007. Sie
  blockieren nichts, aber ANN-011 (Rollenschnitt der Verordnung) und ANN-014
  (Empfehlung zum Verordnungsende, ADR-006) gehören in die Anfragen B1 und B2,
  ANN-016 und ANN-017 in die Anfrage B2, und ANN-015 gehört auf den ersten
  Feldtag.
- **Zu beantworten (MAP-001):** E-20 ADR-019 Fassung 2 bestätigen — damit
  entfällt die Google Maps Embed API aus E-16.
- **Entschieden am 2026-09-08, noch nicht gebaut:** Terminfenster
  (`PROJECT_PRINCIPLES.md` §8.1) und Sprachdokumentation (§6.3). Das
  Terminfenster kommt als **CAL-010a** im nächsten Loop; die
  Sprachdokumentation bekommt einen **eigenen Auftrag** und steht bewusst in
  keiner Etappe. Offen geblieben sind **E12** und **E13** — beide blockieren
  nichts.
- **Parallel als Docs-Sessions** (kein Code): im September `ADR-017
  Dateiablage` · `OPS-001 Providerprüfung` (Dokument). `ADR-019 Kartendienst`
  liegt seit dem 2026-09-08 in Fassung 2 vor (MAP-001) und wartet auf E-20.
  Jede endet mit einer Bestätigung durch Jannes.
- **Jannes-seitig diese Woche** (Meilenstein M0, 30.09.): Branch Protection
  und Secret Scanning in den GitHub-Einstellungen aktivieren (zehn Minuten,
  `docs/DEVELOPMENT.md` „Manuelle Schritte") · Anfragen B1, B2, B4 mit
  Fristwunsch verschicken — B4 mit den Steuerfragen aus `OPEN_DECISIONS.md`
  (Umsatzsteuer, Kleinunternehmerregelung, Nummernkreis), B2 mit dem
  Kartendienst (B7), der Terminerinnerung (B15) und den beiden bestätigten,
  aber weiter prüfpflichtigen Annahmen aus CAL-EPIC-003a (ANN-034, ANN-035) —
  und Stelle, Datum, Zusage in der Spur-B-Tabelle
  eintragen · die Genehmigung der Datenschutz-Fachkraft für den Kartendienst
  schriftlich zu den DSFA-Unterlagen legen (G14) · **vor MAP-002:**
  kostenloses PTV-Developer-Abo anlegen (nur Test, ein Schlüssel) und den
  Schlüssel in `.env.local` ablegen — nie im Repository; **vor MAP-006:** die
  PTV-Vertragsdokumente von einem ungeproxten Rechner laden (Liste in
  `docs/decisions/providerpruefung-kartendienst.md`, Teil 1) und mit B2 an
  die Datenschutzberatung geben.

Nach jedem abgeschlossenen Loop wird dieser Abschnitt auf den nächsten Eintrag
gestellt (Skill-Schritt I).

---

## Sessions starten

Jannes entschied am 2026-09-06 (E-15): **Die Reihenfolge ist verbindlich, der
Kalender nachrangig.** Ein Eintrag darf früher beginnen, sobald der vorherige
fertig und abgenommen ist und seine Voraussetzung aus Spur B vorliegt. Die
Monate im Rückwärtsplan sind Spätest-Termine, keine Wartezeiten; die
Meilensteine bleiben die Messlatte für das Wochenupdate.

Vier Regeln, damit jede Session weiß, was sie tun soll, und nichts verloren
geht:

1. **Vorher:** `git pull --ff-only origin main`, dann diesen Abschnitt und
   „Nächster Loop" lesen. Mehr Vorbereitung braucht es nicht — die Session
   liest den Rest selbst.
2. **Aufruf:** genau einen Aufruf aus der Tabelle unten, unverändert, als
   erste Nachricht. **Ein Thema je Session.** Ein zweiter Wunsch geht nicht in
   dieselbe Session — er wird ein eigener Aufruf oder eine Zeile im
   Ideenspeicher (Aufruf „Idee").
3. **Nachher:** den Bericht lesen und die Fragen mit je einem Satz
   beantworten („wie empfohlen" reicht); den Pull Request mergen — Docs sofort,
   Code nach der Abnahme; die Abnahmeschritte aus `docs/abnahme/` am eigenen
   Rechner durchgehen und der nächsten Session sagen „Abnahme <Loop> am
   <Datum> erledigt", damit sie das Datum in der Fortschrittstabelle
   einträgt.
4. **Montags** sagt das Wochenupdate, was fällig ist. Es liest `main` —
   deshalb Regel 3.

Wie Antworten am besten aussehen: mit der Kennung (`E-16: a`, `B4: liegt vor,
Ergebnis …`), Entscheidungen als „entschieden: …", Ideen als „Idee: …". So
landet jeder Satz an der richtigen Stelle im Register, im Ideenspeicher oder
in dieser Roadmap.

| Zweck                           | Aufruf (kopieren, nichts ergänzen)                                                                                                                                                                                                                                                       | Modell (Tabelle unten) |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Code-Loop                       | der Befehl aus „Nächster Loop", zum Beispiel `/feature-loop UX-EPIC-001 Hausbesuchstag: Tagesliste, Folgetermin, Textbausteine`                                                                                                                                                                     | nach Aufgabe           |
| Docs-Session ADR                | `Docs-Session ohne Code: ADR-017 Dateiablage schreiben. Vorgaben: docs/development/ROADMAP.md, Etappe G, Zeile G1, und die dort genannten ADRs. Am Ende die Bestätigungsfragen für Jannes als Liste mit Empfehlung.` — für ADR-018 (Spur B, Zeile D) und ADR-019 (G12) entsprechend | Opus 5 `xhigh`         |
| Docs-Session Providerprüfung    | `Docs-Session ohne Code: OPS-001 Providerprüfung Supabase nach dem Prüfkatalog aus ADR-002 als Dokument, einschließlich der Auth-Mails (B13). Vorgaben: docs/development/ROADMAP.md, Zeile G3. Keine Cloud-Ressource anlegen.`                                                              | Opus 5 `high`          |
| Ablaufrunde                     | `Ablaufrunde Kalender nach docs/development/OPTIMIERUNG.md` — Bereich nach Rückwärtsplan                                                                                                                                                                                         | Sonnet 5 `medium`      |
| Kartendienst-Loop               | `/feature-loop MAP-002 In-App-Kartenprototyp nach docs/development/MAP-LOOPS.md` — für MAP-003 bis MAP-005 entsprechend; MAP-006 erst nach dem Gate aus ADR-019                                                                                                                       | Opus 5 `high`          |
| Antworten und Abnahmen eintragen | `Docs-Session ohne Code: meine Antworten und Abnahmen in docs/development/ROADMAP.md und docs/decisions/OPEN_DECISIONS.md einarbeiten. Antworten: …`                                                                                                                                    | Sonnet 5 `low`         |
| Idee                            | `Ideenspeicher: <Idee in zwei Sätzen>. Nur eintragen, nicht bauen.`                                                                                                                                                                                                                      | Sonnet 5 `low`         |
| Roadmap prüfen                  | `Planungssession ohne Code: Gesamtstand prüfen (git fetch, Branches, Pull Requests), docs/development/ROADMAP.md gegen den Stand nachstellen, nächsten Loop vorschlagen. Nichts bauen.`                                                                                                   | Sonnet 5 `medium`      |

---

## Ziel: Produktionsreife Ende März 2027, Eröffnung 01.07.2027

Entschieden von Jannes am 2026-09-05 und präzisiert am 2026-09-06: Die Praxis
**nimmt den Betrieb am 01.07.2027 auf**, das Personal Training ebenfalls. Es
gibt kein Vorgängersystem, keine Bestandspatient:innen, keine offenen
Rechnungen und keinen alten Nummernkreis — deshalb keine
Bestandsdatenübernahme und keinen Parallelbetrieb. Die Software ist
**spätestens zum 31.03.2027 produktionsreif**; die drei Monate bis zur
Eröffnung sind Puffer und Eröffnungsvorbereitung. Früher ist erlaubt (E-15):
Was fertig und abgenommen ist, wartet nicht auf seinen Monat.

Drei Zeitpunkte, die auseinandergehalten werden (ADR-007 Punkt 6 erlaubt vor
dem Gate nur synthetische Daten):

- **Go-live-Gate** (M3, 19.03.2027): alle Vorbedingungen erfüllt, Freigabe
  durch Jannes.
- **Produktionssystem steht** (M4, 31.03.2027): Produktivprojekt angelegt und
  nach OPS-007 erstbefüllt — Organisation, Standort, `owner`, Katalog,
  Stammdaten. Ab hier dürfen echte Daten hinein (etwa Anmeldungen für die
  Eröffnung), müssen aber nicht.
- **Eröffnung** (M5, 01.07.2027): erster Behandlungstag mit der Software.
  Danach vier Wochen Stabilisierung bis M6 (31.07.2027).

**Go-live-Umfang (Stufe 1) — Kern:** Patient:innen mit Zugangshinweis ·
Verordnungen · Termine mit Serien und Zustandsautomat (sechs erreichbare
Zustände) · Behandlungsdokumentation mit Abschluss in einem Schritt und
Textbausteinen · Navigations-Handoff (Google Maps, Apple Maps) aus der Tagesliste ·
Tagesplan-Cache lesend · Leistungen, Rechnung mit Empfänger, Storno, PDF,
Zahlungserinnerung · Zahlungen mit Teilzahlung · Mitarbeitende mit Konten,
Rollen, Passwort-Selbstbedienung · Auditlog · Löschung und Retention ·
Dateiablage mit Verordnungsscan · Datenschutzinformation · Tagesplan
druckbar · alles aus Etappe G und H.

**Komfort in Stufe 1** (wird bei Zeitnot zuerst geschoben, Abweichungsregel
2): UI-001 Politur · OPS-005 als Automatisierung · Rückzahlungs-UI ·
Legal-Hold-Oberfläche · OPS-006 als vollständige Funktion.

**Stufe 2 vor der Eröffnung (spätestens April bis Juni 2027):** Tagesroute
auf der Karte mit Navigation (MAP-002 bis MAP-006, ADR-019 Fassung 2) · dann
Anamnese und Fragebögen (Etappe 2), weil zur Eröffnung jede Patientin neu ist
· der letzte Monat vor der Eröffnung bleibt frei für Probewoche 2 und Befunde.

**Stufe 2 nach der Eröffnung (ab August 2027):** Übungspläne (Etappe 3) ·
Warteliste (`IDEA-PRX-003`) · Terminerinnerung und Online-Anfrage (B15) ·
Fahrzeiten und Erreichbarkeit (MAP-006) · der Praxisbetrieb aus Spur
A2 · Kennzahlen, Export für die Steuerberatung. Bewusst nicht früher, weil
jeder Punkt einen neuen Dienstleister, eine Einwilligung oder Betriebserfahrung
braucht (§3.5, ADR-002). Die Vorschaubereiche bleiben bis dahin
gekennzeichnete Vorschau.

**Stufe 3 (frühestens Q4 2027):** die Plattform für Patient:innen und
Kund:innen — Etappen 4 bis 10, siehe eigenen Abschnitt.

### Rückwärtsplan

Kapazität je Monat in Code-Loops (Annahme: zwei je Woche, siehe „Kapazität und
Puffer"); „Last" zählt nur Code-Loops. Docs-Sessions und Jannes-Aufgaben stehen
getrennt, weil sie andere Ressourcen brauchen. Die Monate sind
Spätest-Termine; die Reihenfolge innerhalb einer Spalte und über die Zeilen
hinweg ist das Verbindliche (E-15).

| Monat       | Kap. | Code-Loops (Last)                                                                                   | Docs-Sessions                                                                          | Jannes liefert / entscheidet                                                                                                                              | Extern                           | MS     |
| ----------- | ---- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------ |
| Sep 2026    | 7    | VER-EPIC-001 · UI-000 (2)                                                                           | ADR-017 · ADR-018 · OPS-001 Providerprüfung                                            | Branch Protection · B1/B2/B4 anfragen · Genehmigung Kartendienst schriftlich ablegen · ADR-017 bestätigen (ADR-018 am 2026-09-11 erledigt)                | —                                | M0     |
| Okt 2026    | 9    | UX-EPIC-001 · STAFF-EPIC-002 · LOE-EPIC-001 · CAL-EPIC-003a Zustände (4)                            | ADR-019 Fassung 2 bestätigen (E-20) · Optimierungsrunde Kalender · VVT- und TOM-Entwurf | Test-Cloudprojekt anlegen (nach OPS-001) · E10 · ADR-019 bestätigen · erste Abnahmen · Urlaub eintragen                                                   | —                                | —      |
| Nov 2026    | 8    | CAL-EPIC-003b Serie · DAT-EPIC-001 · ABR-EPIC-001 · ABR-EPIC-002a Rechnung (4)                      | Optimierungsrunde Patient:innen · Löschkonzept, Breach-Prozess, Subprozessoren        | Leistungskatalog mit Preisen · Praxisstammdaten, Logo, Bank · B4-Termin · steuerliche Grundeinstellungen (G13) · PDF-Weg für die Rechnung (B14)          | B4 Ergebnis                      | —      |
| Dez 2026    | 6    | ABR-EPIC-002b Dokument/Storno · ABR-EPIC-003 Zahlungen · E2-Funktion Tagesplan · PAT-006 (4)        | Optimierungsrunde Abrechnung · DSFA-Entwurf an die Prüfung (15.12.)                    | Ende-zu-Ende-Abnahme · Feldtag 1                                                                                                                          | B2 Ergebnis                      | M1     |
| Jan 2027    | 8    | OPS-003 Backup/Restore · OPS-004 Logging (mit OPS-005 minimal) · OPS-006 minimal · OPS-007 Bootstrap · Befunde (5) | Betriebsdokumentation · BETRIEB-001 · Optimierungsrunde Übersicht                       | Restore-Test mitführen · Notfallzugang verwahren · Endgeräte-Richtlinie                                                                                    | DSFA-Rückfragen                  | —      |
| Feb 2027    | 8    | Befunde aus Probewoche 1 · UI-001 Politur (3)                                                       | Rückfallplan (Papierprozess aus E2) · Kurzanleitung „erster Tag" · Messrunde vor dem Gate | Probewoche 1 (H1) · Restore-Test 2 · Feldtag 2 · **Feature-Freeze Stufe 1 am 26.02.**                                                                     | B1 Ergebnis · DSFA abgeschlossen | M2     |
| Mär 2027    | 8    | **Puffer** — nur Befunde und Dokumentation (0 geplant)                                              | Nachweistabelle MUSS → Test/Policy · Vertragscheck PTV Developer (Gate aus ADR-019)     | Go-live-Gate 19.03. · Produktions-Bootstrap nach OPS-007 am 31.03.                                                                                        | —                                | M3, M4 |
| Apr 2027    | 8    | MAP-006 Patient/Tour-Integration · Befunde aus dem Produktivsystem (1)                                     | DSFA-Wiedervorlage Kartendienst                                                        | PTV Paid Plan und Server-Schlüssel (Jannes, nicht der Agent) · Abnahme auf einer echten Radrunde mit synthetischen Adressen                                    | —                                | —      |
| Mai 2027    | 8    | FRB-EPIC-001 · FRB-EPIC-002 (2)                                                                     | Optimierungsrunde Touren (vier Wochen nach MAP-006)                             | B8 Lizenzfrage klären · Probewoche 2 vorbereiten (Seed: eine Eröffnungswoche)                                                                             | B8                               | —      |
| Jun 2027    | 8    | **Puffer** — Befunde aus Probewoche 2 (0 geplant)                                                   | Erster-Tag-Protokoll · Schulung, falls eine zweite Person da ist                        | Probewoche 2 (H5) · Restore-Test 3 · **Change-Freeze ab 17.06.** · erste echte Patient:innen anlegen                                                      | —                                | —      |
| Jul 2027    | 4    | **Stabilisierung** — Hotfixes und Befunde (0 neue Epics)                                            | —                                                                                      | **Eröffnung 01.07.** · Störfallliste führen · Optimierungsrunde nach vier Wochen Betrieb                                                                   | —                                | M5, M6 |
| ab Aug 2027 | —    | Stufe 2 nach der Eröffnung (Etappe 3, Warteliste, Feinjustierung der Erreichbarkeitswarnung aus MAP-006, Spur A2) · danach Stufe 3 in der Reihenfolge des Abschnitts „Stufe 3" |                                                                                        |                                                                                                                                                           |                                  |        |

Sperrzeit 21.12.2026 bis 04.01.2027; Jannes' Urlaub wird eingetragen, sobald
er feststeht. Rechnung: rund 22 Code-Loops von September bis Februar bei 46
Loop-Plätzen — knapp die Hälfte. Von April bis Juni drei Loops bei 24 Plätzen.
Der Rest ist Puffer für Abnahme, Befunde, Krankheit und dafür, dass die
Startwoche kein Maß ist.

### Meilensteine

Ein Meilenstein gilt als erreicht, wenn **alle** Kriterien erfüllt sind. Das
Wochenupdate meldet je Meilenstein grün (auf Kurs), gelb (ein Kriterium
gefährdet), rot (Termin nicht haltbar).

| MS  | Termin     | Name                     | Kriterien                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0  | 30.09.2026 | Vorlauf gesichert        | B1, B2, B4 angefragt: Stelle benannt, Termin zugesagt · OPS-001 dokumentiert, Ergebnis positiv · ADR-017 von Jannes bestätigt (ADR-018 am 2026-09-11 angenommen) · Branch Protection und Secret Scanning aktiv · Genehmigung des Kartendienstes schriftlich abgelegt                                                                                                    |
| M1  | 18.12.2026 | Kernprozess Ende-zu-Ende | Ein synthetischer Fall läuft auf der Test-Umgebung durch: Verordnung → Serie → Termin durchgeführt → Dokumentation finalisiert → Leistung → Rechnung als PDF → Zahlung · von Jannes abgenommen · jede Stufe-1-Datenklasse hat Löschpfad und Test · B4 liegt vor                                                                                  |
| M2  | 26.02.2027 | Betriebsbereit           | Restore-Test 1 bestanden inklusive Löschungen · Deployment aus Tag mit Freigabe · Redaction-Prüfung grün · Betriebsdokumentation (13 Positionen) · Probewoche 1 durchlaufen, Befunde geschlossen · Kollegin-Test durchlaufen · DSFA-Entwurf bei der Prüfung · **Feature-Freeze Stufe 1**                                                        |
| M3  | 19.03.2027 | Go-live-Gate             | ADR-007 sieben Vorbedingungen · B1- und B2-Ergebnis liegt vor · kein Register-Eintrag Datenschutz/Recht auf `offen` oder `entschieden (Jannes)`, kein Punkt in `OPEN_DECISIONS.md` auf `vorläufig entschieden` · Restore-Test 2 bestanden · OPS-007 gegen die Test-Umgebung geprobt · Rückfallplan (Papierprozess) unterschrieben · Messrunde: Zielwerte aus `OPTIMIERUNG.md` erreicht oder als Abweichung dokumentiert, kein täglicher Ablauf mit Score 0 |
| M4  | 31.03.2027 | Produktionssystem steht  | Produktivprojekt in freigegebener EU-Region aus dem freigegebenen Tag · OPS-007 durchlaufen: Organisation, Standort, `owner`, Katalog, Stammdaten · keine synthetischen Daten im Produktivsystem · Backup, Monitoring und Release-Takt nach BETRIEB-001 aktiv                                                                                    |
| M5  | 01.07.2027 | Eröffnung                | Probewoche 2 durchlaufen, Befunde geschlossen · Restore-Test 3 bestanden · Change-Freeze seit 17.06. eingehalten · Datenschutzinformation und Behandlungsvertrag in der Fassung mit Kartendienst liegen vor (PAT-006) · erster Behandlungstag läuft mit der Software                                                                            |
| M6  | 31.07.2027 | Erster Betriebsmonat     | Vier Wochen Betrieb ohne offenen Befund der Klasse „Datenverlust/Falschzuordnung" · Störfallliste ausgewertet · Optimierungsrunde nach vier Wochen Betrieb durchgeführt · Spur A2 und Stufe 3 freigegeben                                                                                                                                       |

### Kapazität und Puffer

Gemessen sind acht Epics in den ersten neun Tagen (109 Commits, 53 Prozent am
Wochenende); die Startwoche ist kein Maß. Der Plan rechnet mit **zwei
Code-Loops je Woche** und rund **fünf Stunden Jannes-Zeit je Woche**: Sessions
starten, Fragen beantworten, eine Stunde Abnahme. **Der Engpass ist nicht die
Baukapazität, sondern Jannes' Zeit für Entscheidungen, Abnahmen und externe
Anfragen.** Deshalb zählt die Fortschrittstabelle abgenommene, nicht gebaute
Epics.

Der Softwareanteil von Stufe 1 ist bis M1 eingeplant; Januar und Februar
gehören der Betriebsreife und der Probewoche; **der März ist Puffer** und
nimmt nur Befunde und Dokumentation auf. **April bis Juni** sind das zweite
Polster: zwei Stufe-2-Loops, die als erste entfallen, wenn Stufe 1 rutscht.

**Abweichungsregel, abgestuft:**

1. Ist M0 am 30.09. nicht erreicht, führt das Wochenupdate den fehlenden Punkt
   namentlich, bis er erledigt ist; kein Loop ersetzt ihn.
2. Ist M1 am 18.12. nicht erreicht, wandern die Komfort-Pakete hinter M4. Der
   Kern wird nicht gekürzt.
3. Ist M2 am 26.02. nicht erreicht oder fehlt im Februar ein Ergebnis aus
   B1/B2, rutschen M3 und M4 monatsweise. **Die Eröffnung am 01.07.2027 rutscht
   nicht.** Zuerst entfallen die Stufe-2-Loops vor der Eröffnung (FRB vor
   TOUR), dann schrumpft der Juni-Puffer. Ist M4 am 31.05.2027 nicht erreicht,
   eröffnet die Praxis mit dem Papierprozess aus E2 (H4), und die Software
   folgt — nie umgekehrt, und nie auf Kosten einer Sicherheits- oder
   Datenschutzmaßnahme (`PROJECT_PRINCIPLES.md` §16).

### Risiken

| Nr  | Risiko                                                                          | Eintritt | Wirkung   | Frühindikator                              | Gegenmaßnahme                                                                                       | Wer           |
| --- | ------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------- |
| R1  | Externe Prüfungen B1/B2 liefern später als Februar                              | hoch     | hoch      | M0 ohne zugesagten Termin                  | Anfrage im September mit Fristwunsch; Entwürfe bis 15.12.; zweite Stelle anfragen; April–Juni als Reserve | Jannes        |
| R2  | Providerprüfung Supabase negativ                                                | niedrig  | sehr hoch | OPS-001 nicht bis 30.09. dokumentiert      | Prüfung vorziehen; erst danach ADR-017 und ABR-Datenmodell finalisieren                            | Claude/Jannes |
| R3  | Jannes' Zeit reicht nicht für Entscheidungen und Abnahmen                       | hoch     | hoch      | zwei Wochen ohne abgenommenes Epic         | fester Wochentermin; gehostete Test-Umgebung; Entscheidungen als Optionen mit Empfehlung             | Jannes        |
| R4  | Neue Dienstleister (PDF, Kartendienst) erst spät geprüft                        | mittel   | mittel    | Spur-B-Punkt ohne Termin                   | B14 im November; Kartendienst: Prüfkatalog liegt seit MAP-001 vor, Vertragsdokumente im Oktober laden, Gate mit B2; Prototypen MAP-002 bis MAP-005 hängen nicht am Vertrag | Claude/Jannes |
| R5  | Feiertage und Urlaub kosten drei Wochen                                         | sicher   | mittel    | —                                          | 21.12.–04.01. gesperrt; Urlaub im Rückwärtsplan                                                     | Jannes        |
| R6  | Befunde aus der Abnahme kommen als Welle im Januar                              | hoch     | mittel    | Fortschrittstabelle ohne Abnahmedatum      | Abnahme je Epic binnen sieben Tagen; Befunde im Folge-Loop derselben Spur                           | beide         |
| R7  | Scope wächst aus Ideenspeicher, Wettbewerbsvergleich und Plattform-Zielbild     | mittel   | mittel    | Story ohne Bezug zum Stufe-1-Kern          | Feature-Freeze M2; Ideen nur eintragen; Scope-Bremse aus `OPTIMIERUNG.md`; Stufe 3 erst nach M6    | beide         |
| R8  | Parallele Branches erzeugen Merge-Arbeit                                        | mittel   | niedrig   | mehr als ein aktiver Feature-Branch        | Regel „ein Feature-Branch, Docs sofort mergen"                                                      | Claude        |
| R9  | `pg_cron` oder andere Annahmen gelten beim Provider nicht                       | niedrig  | mittel    | OPS-001-Katalog                            | in OPS-001 prüfen; Fallback in ANN-007                                                              | Claude        |
| R10 | Mobile Endgeräte ohne Richtlinie (Verlust, Sperre, MFA, Kartenverlauf)          | mittel   | hoch      | TOM ohne Abschnitt Endgeräte               | Endgeräte-Richtlinie in G14 (mit Google-Konto und Kartenverlauf); „Alle Sitzungen beenden" **gebaut** (STAFF-004); MFA einrichtbar, Pflicht vertagt bis zur Domain (ANN-028) | beide         |
| R11 | Eröffnung ohne Software, weil M4 um mehr als zwei Monate rutscht                | niedrig  | sehr hoch | M3 im März verfehlt                        | Abweichungsregel 3; Papierprozess aus E2 als Rückfall; Stufe-2-Fenster als Reserve                  | Jannes        |
| R12 | **Eingetreten 2026-09-08, aufgelöst am selben Tag.** Kein AVV für die Google Maps Platform | eingetreten | niedrig | ADR-019 Fassung 1                        | Weg C statt Weg B: Anbieter mit AVV (PTV Developer als Kandidat, ADR-019 Fassung 2); Rest-Risiko R13 | Claude/Jannes |
| R13 | PTV Developer scheitert am Vertrags-/§203-Gate (kein §203-Wortlaut gefunden, Retention unbekannt, Zweitnutzungsklausel in US-Terms) | mittel   | mittel    | ein Gate-Punkt aus Teil 5 des Prüfdokuments negativ | Adapter hinter `contract.ts` — Anbieterwechsel ohne UI-Umbau; zweite Wahl MapTiler (Karte) und HERE (Routing) mit eigener Prüfung; Vertragsdokumente früh laden | Claude/Jannes |

---

## Drei Spuren zum Bauen, eine zum Entscheiden

| Spur   | Inhalt                                                                          | Wer                   |
| ------ | ------------------------------------------------------------------------------- | --------------------- |
| **A1** | Kernprozess: Klinik, Bedienung im Hausbesuch, Tagesroute, Abrechnung; Fernplan | Claude, Feature-Loops |
| **A2** | Praxisbetrieb: Urlaub, Zeitkonto, Flotte, Erstattungen, Team                    | Claude, nach M6       |
| **A3** | Betriebsreife (Etappe G) und Eröffnung (Etappe H)                               | Claude und Jannes     |
| **B**  | Entscheiden: offene Punkte mit Fälligkeit                                       | Jannes, teils extern  |

**Takt:** A1 hat Vorrang bis M1. A3 läuft parallel, wo Jannes-seitige
Vorlaufarbeit nötig ist; ab Januar hat A3 Vorrang. Von April bis Juni läuft
A1 mit Stufe 2 in dem Maß, das Stufe 1 übrig lässt. A2 beginnt nach M6. Ein
Loop je Session; zwei Code-Loops je Woche sind das Maß.

---

## Spur A1 — Kernprozess

### Etappe 1 — Der Kernprozess wird vollständig und bedienbar (bis M1)

**Warum zuerst:** Verordnung → Termin → Dokumentation → Leistung → Rechnung
ist die Kette, auf der eine Praxis läuft. Neu gegenüber 2.0: die Kette wird
nicht nur fachlich geschlossen, sondern dort bedienbar gemacht, wo sie heute
schon reibt — Tagesliste ohne Adresse, kein Folgetermin, sechs Taps für die
Dokumentation, keine künftigen Termine in der Akte, kein Schutz vor
Textverlust (Produktreview vom 2026-09-06, in der Git-Historie).

Spalten: Kennung · Ergebnis in einem Satz · Stories · Voraussetzung · Jannes
liefert.

| Loop              | Ergebnis                                                           | Stories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Voraussetzung                                                     | Jannes liefert                                          |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| ~~DOK-EPIC~~      | Behandlungsdokumentation mit Finalisierung                         | DOK-001 bis DOK-004                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **fertig** (PR #5, PR #9)                                         | abgenommen 2026-09-11                                   |
| **VER-EPIC-001**  | Verordnungen liegen in der Akte, mit Kontingent und Verordner:in   | **PAT-005** Stammdaten: Telefon (Geschäftlich), Mobil, Telefax, Einrichtung, Besonderheit, Bemerkung, feste Therapeut:in, **Zugangshinweis Hausbesuch** (`IDEA-PRX-001`) · **VER-001** Datenmodell Verordnung mit `prescribers`, Positionen mit verordneter/genutzter Menge, Erst-/Folgeverordnung, Empfehlung zum Verordnungsende · **VER-002** je Patient:in, nach Jahr · **VER-003** anlegen und bearbeiten                                                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                 | —                                                       |
| **UI-000**        | Das Fundament trägt die nächsten zwanzig Seiten                    | Tokens `ink-subtle` und `line-strong` auf AA heben, Kontrast-Test · Bausteine `ButtonLink`, `Rueckfrage`, `Section`, `DataRow`, `Statusmeldung`, `SearchField` und Ersetzen der Duplikate · Druck-Basis (`@media print`, entschieden 2026-09-06) · Verbindungsanzeige · 375-px-Screenshot-Helfer · axe als Dev-Abhängigkeit für die automatische Barrierefreiheitsprüfung (entschieden 2026-09-06) · Oberflächen-Checkliste in `docs/abnahme/README.md`                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                 | —                                                       |
| **UX-EPIC-001**   | Ein Hausbesuchstag läuft ohne Umwege durch die Anwendung           | Tagesliste mit Adresse, `tel:`-Link, Zugangshinweis, „Offen heute"; Vorschau-Karten zusammengefaltet · **Navigation über Google Maps** (entschieden 2026-09-06, `IDEA-PRX-030`): Link je Termin mit Adresse ohne Namen im Fahrradmodus, Link „ganzer Tag" mit allen Adressen in Terminreihenfolge; URL-Format und Feldliste als `ANN`, Vertrags- und Datenschutzseite in ADR-019 · Folgetermin am Termin und Tap auf freie Zeit im Kalender, Vorbelegung Hausbesuch/ich/heute (`IDEA-PRX-007`) · nächste Termine in der Akte · „Behandlung abschließen" in einem Schritt · Textverlust-Schutz und Verbindungsanzeige (`ANN`), **darin der bekannte Restpunkt aus VER-003:** wer die Verordner:innen-Anlage über die Hauptnavigation verlässt statt über „Abbrechen", bricht den Abstecher ab — der Entwurf bleibt aber bis zum Ablauf der 30 Minuten aus ANN-019 liegen und taucht bei einem unabhängigen neuen Versuch auf demselben Pfad wieder auf (`src/features/prescriptions/api.ts`, `entwurfAnsehen`; der Kommentar dort benennt genau diesen Fall). Zu bauen: den Entwurf beim Verlassen des Abstechers verwerfen, statt sich auf die Frist zu verlassen; Test mit echtem Seitenwechsel wie in `PrescriptionFormPage.entwurf.test.tsx` · Tagesplan-Cache lesend nach ADR-001, Feldliste als `ANN` (`IDEA-PRX-014`, entschieden 2026-09-06) · Touch-Ziehen erst nach Long-Press, Rückgängig-Leiste · serverseitige Patientensuche von jeder Seite (`IDEA-PRX-020`) · Textbausteine in der Dokumentation (`IDEA-PRX-011`, entschieden 2026-09-06) | VER-EPIC-001, UI-000; Google-Link durch ADR-019 frei (Teil 1)                          | Daumen-Test nach dem Loop                               |
| **LOE-EPIC-001**  | Löschung und Retention sind gebaut und getestet                    | **LOE-001** Datenklassen und Retention Schedule an genau einer Stelle (ANN-001), Anker „Abschluss der Behandlung", Legal Hold (Modell; Oberfläche Komfort) · **LOE-002** Löschjournal mit idempotenter Wiederanwendung, Auditbezug, alle Versionen; `pnpm test:db` deckt jede Datenklasse ab                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ANN-001, ANN-002; erfasst Verordnungen                            | —                                                       |
| **CAL-EPIC-003a** | Termine kennen alle Zustände, die die Praxis heute braucht         | **CAL-008** Zustandsautomat nach ADR-018: bestätigt, abgesagt (mit Grund), nicht angetroffen (Ausfallhonorar-Kennzeichen), durchgeführt (aus „Behandlung abschließen"), dokumentiert (aus Finalisierung), abgerechnet (aus ABR-003); Migration der heutigen Status; Auditkatalog · **CAL-009** Tag umplanen: alle Termine einer Person eines Tages absagen/vormerken mit Anrufliste (`IDEA-PRX-004`)                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ADR-018 von Jannes bestätigt                                      | —                                                       |
| **CAL-EPIC-003b** | Eine Verordnung wird in einer Minute zu einer Terminserie          | **CAL-007** Serie aus der Verordnung: Anzahl aus dem Kontingent, fester Rhythmus, Konfliktprüfung je Termin inline, Einzelabweichung · **CAL-010a** Terminfenster nach `PROJECT_PRINCIPLES.md` §8.1 (entschieden 2026-09-08): 60 Minuten einschließlich Dokumentation, Vorbelegung im Formular **und** serverseitige Durchsetzung in `create_appointment`/`update_appointment` — eine Vorbelegung allein erfüllt §8.1 nicht; geprüft wird nur ein **neu gesetztes** Zeitfenster, Bestandstermine bleiben gültig und rein organisatorisch bearbeitbar (dieselbe Abgrenzung wie beim Raster, CAL-005); Beginn weiter frei im 5-Minuten-Raster; Testfälle in `pnpm test:db` für beide Schreibpfade und für den Bestandstermin · ~~**CAL-010b** Fahrpuffer~~ **entfällt** (E12 Punkt 3 und 4, Jannes 2026-09-12): kein pauschaler Mindestabstand und keine von Hand gepflegten Fahrminuten — der Fahrpuffer kommt mit **MAP-006** aus echten Fahrzeiten, samt der Aufrundungsregel aus §8.1 und ihrem Testfall · **CAL-011** Terminzettel als Druckansicht (`IDEA-PRX-006`)                                                                                                                                                                                                                                                                                                                                                                                                                                       | VER-001, CAL-EPIC-003a, UI-000 (Druck); §8.1 für CAL-010a         | Antwort auf E12 (blockiert nichts) |
| **ABR-EPIC-001**  | Leistungen entstehen aus durchgeführten Terminen                   | **ABR-000** Praxis-Stammdaten für Rechnungen (Anschrift, Bank, Steuernummer, Umsatzsteuer-Status, Logo — die Datei liegt fertig in `marke/logo/own-motion-block-schwarz.svg`, schwarz ist laut `marke/README.md` genau der Fall Rechnung und Fax —, `owner`) · **ABR-001** Leistungskatalog versioniert, Steuerkennzeichen je Version, Hausbesuchspauschale und Ausfallhonorar als Katalogpositionen · **ABR-002** Leistungserfassung am durchgeführten Termin, vorbelegt aus der Verordnung, Kopplung an finalisierte Dokumentation mit protokolliertem Override (C1, ANN-006)                                                                                                                                                                                                                                                                                                                                                                                                                       | B4 als Annahme                                                    | Katalog mit Preisen, Stammdaten, Antwort aus G13        |
| **ABR-EPIC-002a** | Eine Rechnung entsteht aus Leistungen, mit dem richtigen Empfänger | **ABR-003a** Rechnungsempfänger-Stammdaten (Beihilfe, PKV, Betreuung, Eltern; `IDEA-PRX-010`) · Rechnung: Zustände nach ADR-009 bis „ausgestellt", Nummer erst bei Ausstellung, neuer Nummernkreis ab der ersten Rechnung (kein Altsystem; Format als Annahme, B4 bestätigt), Snapshot mit Verordnungsbezug, Sammelrechnung je Person und Monat mit Behandlungsnachweis (`IDEA-PRX-013`) · Optionen für das Rechnungs-PDF mit Aufwand vorlegen (B14)                                                                                                                                                                                                                                                                                                                                                                                                | ABR-EPIC-001                                                      | Nummernformat und Umsatzsteuer-Status (G13); PDF-Weg   |
| **ABR-EPIC-002b** | Die Rechnung ist ein Dokument, das bleibt                          | **ABR-003b** PDF nach dem in B14 entschiedenen Weg, Ablage nach ADR-017, Storno- und Korrekturdokument (einfache Kette), Zahlungserinnerung als Dokument ohne Stufenlogik (`IDEA-PRX-012`, entschieden 2026-09-06)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | DAT-001, B14                                                      | —                                                       |
| **ABR-EPIC-003**  | Zahlungen und offene Posten sind nachvollziehbar                   | **ABR-004** Zahlungen als Transaktionen, Teilzahlung, offene Posten auf der Einstiegsseite; Rückzahlung im Modell, Oberfläche Komfort                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ABR-EPIC-002a                                                     | —                                                       |
| ~~FIX-EPIC-001~~  | Zugang und Sitzung halten, was sie versprechen                     | **FIX-001** Links aus den Auth-Mails haben einen Empfangspfad: zwei oeffentliche Seiten `/kennwort-neu` und `/zugang`, eingeloest ueber `token_hash` und `verifyOtp` statt ueber eine Sitzung in der Adresszeile, eigene Mailvorlagen, Gate mit oeffentlichem Routenzweig (ANN-043) · **FIX-003** Auditvermerk zu "Alle Sitzungen beenden" als Vorbedingung statt Scheinbeleg, `melde()` erkennt Fehlschlaege, die Zusage nennt das Restfenster und verweist auf die Sperre (ANN-044) · **FIX-004** gewoehnliches Abmelden endet nur diese Sitzung (ANN-045) · **FIX-005** Cache und Entwuerfe werden an jeder Identitaetsgrenze geraeumt, nicht nur beim Knopf in der Kopfzeile (ANN-021 umgezogen) · **FIX-006** Abnahmeschritte, Register, Roadmap | **fertig** (2026-09-12)                                           | Abnahme offen — braucht Docker                          |

**Bewusst nicht Teil von Etappe 1:** Mahnautomat mit Stufen (ABR-005, nach
Praxiserfahrung) · Kostenträger, Versichertennummer, Zuzahlung (GKV) ·
E-Rechnung · Kassenbuch, TSE, Kartenzahlung · Factoring · Terminerinnerung
per SMS/E-Mail und Online-Terminbuchung (Anbieter, Einwilligung; `B15`) ·
Warteliste mit Zeitfenstern (`IDEA-PRX-003`, Stufe 2 nach der Eröffnung,
entschieden 2026-09-06) · automatische Terminsuche (`IDEA-PRX-008`) ·
Kennzahlen (`IDEA-PRX-025`) · Export für die Steuerberatung (`IDEA-PRX-026`,
sobald B4 das Format nennt) · Unterschrift und Behandlungsbestätigung am
Hausbesuch (`IDEA-PRX-015`, verworfen 2026-09-06: nicht nötig).

### Etappe T — Tagesroute und Navigation (Stufe 2, April 2027)

**Warum hier:** Das Lastenrad-Hausbesuchskonzept lebt von der Route. Jannes
hat am 2026-09-06 entschieden: eine Karte der gesamten Tagesroute, alle Wege
eines Tages auf einmal oder ein einzelner Weg als Vorschau, und immer ein
Handoff zur Navigation; am 2026-09-08 dazu: **Convenience hat hohe
Priorität** — In-App-Karte, Fahrradrouting und Fahrzeiten sind Produktziel,
kein Komfort. Die Google Maps Embed API aus E-16 ist damit überholt: Google
verarbeitet auf der Maps Platform als eigener Verantwortlicher, ein AVV fehlt
(§3.5). **ADR-019 Fassung 2** (MAP-001, 2026-09-08) setzt stattdessen auf
MapLibre im Browser, einen serverseitigen Anbieteradapter und **PTV Developer
als Kandidat für Prototyp und Bewertung**; Google Maps bleibt möglicher
Handoff-Zielpunkt. Die Loops MAP-002 bis MAP-006 stehen ausführlich in
[`MAP-LOOPS.md`](MAP-LOOPS.md); **TOUR-EPIC-001a und -001b sind darin
aufgegangen** (TOUR-001 bis TOUR-004 in MAP-006). MAP-002 bis MAP-005 laufen
mit synthetischen Daten und dem kostenlosen PTV-Abo, unabhängig vom
Vertragsstand; **MAP-006 erst nach dem Vertrags-/§203-/DSFA-Gate.** Ihre
Einordnung in den Rückwärtsplan legt Jannes mit E-21 fest; Vorschlag:
MAP-002 und MAP-003 im November/Dezember 2026 neben den Docs-Sessions,
MAP-004 und MAP-005 im Januar 2027, MAP-006 im April 2027 an der Stelle von
TOUR-EPIC-001a.

| Loop               | Ergebnis                                                              | Stories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Voraussetzung                                                                          | Jannes liefert                                                                     |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **MAP-002** | Eine In-App-Karte mit nummerierten Teststopps läuft auf Desktop und 375 px | MapLibre-Komponente, PTV Vector Maps OSM, Overlays lokal, Fit-Bounds/Pan/Zoom, Vorschauseite `/touren/karte`; nur synthetische Tübinger Koordinaten | MAP-001; PTV-Free-Schlüssel (Jannes); E-21 | Schlüssel in `.env.local`; Support-Frage zur Domainbindung |
| **MAP-003** | Eine Fahrradroute zwischen Teststopps liegt als Linie auf der Karte, mit Distanz und Fahrzeit | Edge Function `location-provider` mit PTV- und Mock-Adapter (ANN-017), `OSM_BICYCLE` vs. `OSM_CARGO_BICYCLE`, Fehler-/Timeout-Zustände, keine Speicherung | MAP-002 | Server-Schlüssel als lokales Supabase-Secret |
| **MAP-004** | Fahrzeiten zwischen mehreren Stopps sagen deterministisch, ob zwei Termine erreichbar wären | `calculateMatrix()`, Domänenfunktion Erreichbarkeit in `scheduling`, Vorschau-Matrix; nichts persistent | MAP-003 | — |
| **MAP-005** | „Navigation starten" öffnet mit einem Tap die Navigations-App mit Zielkoordinate | `buildNavigationUrl` (ANN-018) für Google Maps, Apple Maps, `geo:`; Wegpunktlimit verifiziert; Gerätebewertung; keine Präferenz vorgebaut | MAP-002; UX-EPIC-001 (Adress-Handoff) | Gerätebewertung Android/iOS nach `docs/abnahme/` |
| **MAP-006** | Die Tagesroute liegt mit echten Adressen auf der Karte, mit Route, Fahrzeiten und Erreichbarkeit im Kalender | Koordinaten bei der Adresse (ANN-016), Geocoding beim Adress-Upsert, Startort (TOUR-001, §20), Marker lokal ohne Vollnamen, Route und Fahrzeiten (TOUR-002/003), Tourenliste druckbar (TOUR-004), Handoff mit Koordinaten, PAT-006, VVT, DSFA-Wiedervorlage; keine Speicherung von Fahrzeiten, kein Standort, kein Verlauf (§18, §20) · **dazu der Fahrpuffer aus §8.1** (früheste Folgezeit auf dem ersten Rasterpunkt auf oder nach Ende plus Fahrzeit, **aufrunden, nie abrunden** — Beispiel 09:05–10:05 plus 12 Minuten ergibt 10:20, als Testfall), sowie Warnung oder Sperre bei Unterschreitung: **E12 Punkt 3 und 4, hierher verlegt am 2026-09-12** | **Gate aus ADR-019 Punkt 9** (DPA, §203, Subprozessoren, Retention, EU-Region, Paid Plan, Edge-Runtime-Prüfung, DSFA) · MAP-003 bis MAP-005 · UX-EPIC-001 | Paid Plan, DPA-Ablage (G14), Abnahme auf einer echten Radrunde mit synthetischen Adressen |

### Etappe 2 — Anamnese, Verlauf, Bericht (Stufe 2, nach Etappe T, spätestens Mai 2027)

**Warum hier:** Der strukturierte Erstbefund ist der zweitgrößte Zeitfresser
nach der Dokumentation und die Datengrundlage für alles Spätere. Zur Eröffnung
ist **jede** Patientin eine Neuaufnahme — deshalb vor der Eröffnung, nicht
danach.

| Loop         | Stories                                                                                                                                                                                                       | Voraussetzung        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| FRB-EPIC-001 | **FRB-001** Instrumentenbibliothek, versioniert, mit Lizenzfeld (`IDEA-OUT-001`) · **FRB-002** freie Instrumente: NRS, patientenspezifische Funktionsskala (`IDEA-OUT-003`, `IDEA-OUT-004`)                   | —                    |
| FRB-EPIC-002 | **FRB-003** Anamnesebogen nach §7, in der Praxis ausfüllbar · **FRB-004** Verlaufsdarstellung mit Ereignismarkierungen, ohne Bewertung (`IDEA-OUT-005`) · Körperschema als Teil des Befunds (`IDEA-PRX-027`) | FRB-EPIC-001, **B8** |
| DOK-005      | Therapiebericht an die Verordner:in aus Befund und Verlauf (`PROJECT_PRINCIPLES.md` §4.2) — nach der Eröffnung                                                                                                | FRB-EPIC-002         |

### Etappe 3 — Übungspläne innerhalb der Therapie (Stufe 2, nach der Eröffnung)

Ein Heimprogramm, das die Therapeutin zusammenstellt und die Software nur
darstellt und ausgibt — Erfassen, Speichern, Strukturieren, Darstellen
(ADR-006 Punkt 2). **Keine automatische Anpassung**, keine Progression, kein
Vorschlag; B10 ist hier noch nicht nötig.

| Loop         | Stories                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UEB-EPIC-001 | **UEB-001** Übungsbibliothek: Übung und Variante getrennt, Achsen und Nachbarschaften, zwei Sprachebenen (`IDEA-TRN-005`, `IDEA-QSN-002`) · **UEB-002** Plan zusammenstellen, zuweisen, Schnappschuss (`IDEA-TRN-011`) |
| UEB-EPIC-002 | **UEB-003** Plan als PDF — voller Nutzen ohne Portal · **UEB-004** Planlaufzeit und Wiedervorlage (`IDEA-ORG-006`)                                                                                            |

### Stufe 3 — Plattform für Patient:innen und Kund:innen (frühestens Q4 2027)

Jannes am 2026-09-06: Die Praxissoftware ist nur ein Teilbereich. Geplant ist
eine Plattform für Patient:innen **und** für die Kund:innen seines Personal
Trainings, das ebenfalls am 01.07.2027 beginnt. Vorlage ist die fremde
Coaching-Software aus
[`../product/ideen/referenz-navigation.md`](../product/ideen/referenz-navigation.md)
(Übersicht, Kalender, Sessions, Check-ins, Fortschritt, Trainingspläne,
Übungsanalyse, Aktivitäten, Assessments, Athletenprofil, Gewohnheiten,
Ernährung, Chat, KI-Analyse); Jannes will ihren **Funktionsumfang
nachbauen** (E-18) — Vorlage für Umfang und Ablauf, nicht für Datenmodell,
Berechtigungen, Rechtsrahmen oder gestaltete Inhalte. Die Inhalte dazu stehen
seit dem 2026-09-01 im Ideenspeicher (Bereichsdateien 00 bis 09); neu ist,
dass Kund:innen **ohne vorherige Heilbehandlung** dazukommen
(`IDEA-LZK-008`). Bis Stufe 3 läuft das Personal Training außerhalb der
Plattform: Kund:innen werden nicht als Patient:innen angelegt (andere
Datenklasse, andere Frist, kein Behandlungsvertrag), Rechnungen dafür
entstehen außerhalb; wie, klärt B4.

Was das für die Planung heißt:

- **Die Etappen 4 bis 10 des Fernplans sind diese Plattform.** Die Reihenfolge
  bleibt; die Plattform ist kein zusätzliches Programm daneben
  (`PROJECT_PRINCIPLES.md` §2.1).
- **Vorher zu entscheiden:** B5 (Identität, Vertretung) · B9, erweitert um
  Kund:innen ohne Heilbehandlung (Vertrag, Umsatzsteuer, Aufbewahrung,
  Rechtsgrundlage, Ernährung berufsrechtlich) · B11 (Pakete) ·
  `PROJECT_PRINCIPLES.md` §1 nennt bisher nur die Physiotherapiepraxis; die
  Ergänzung um Personal Training nach §21 kommt, wenn Stufe 3 beginnt
  (entschieden 2026-09-06, E-17) · Push-Nachrichten
  und Offline-Erfassung brauchen einen Service Worker — ADR-015 Punkt 16 wäre
  dann durch einen eigenen ADR zu ersetzen · Übungsanalyse, Assessments mit
  Bewertung und eine „KI-Analyse" sind `MDR_REVIEW_REQUIRED` (ADR-006,
  `IDEA-KI-006`).
- **Reihenfolge (entschieden 2026-09-06, E-19):** Etappe 4 Portalfundament →
  Etappe 3 Übungspläne mit Ausgabe im Portal → Etappe 5 Tracking und
  Check-ins → Etappe 6 Kommunikation (Chat als strukturierte Rückfrage) →
  Etappe 8 Kund:innen, Episoden und Pakete → Gewohnheiten, Aktivitäten und
  Ernährung zuletzt (`IDEA-ALT-005`, `IDEA-ALT-006`; nur nach Klärung in B9)
  → Etappen 9 und 10 nach B10 und C6. Beginn frühestens nach M6, früher nur,
  wenn Stufe 1 und Stufe 2 vor der Eröffnung fertig und abgenommen sind
  (E-15).
- **Was aus dem Screenshot nicht übernommen wird:** „Athlet" (bei uns
  Patient:in oder Kund:in) · ein Sessions-Zähler, der Termine und
  Trainingseinheiten mischt (`IDEA-ORG-002`) · „KI-Analyse" als
  Handlungsempfehlung · eine Oberfläche, die eine 25-jährige Trainierende
  voraussetzt (`IDEA-QSN-006`).

### Fernplan — Etappen 4 bis 10

Ab hier wird die Reihenfolge gröber. Was in Etappe 6 steht, wird vor Etappe 5
noch einmal überprüft — Pläne, die zwölf Monate voraus genau sind, sind
erfunden. Vor Etappe 4 wird der Fernplan gegen die Wettbewerbsreferenz
(`docs/product/ideen/referenz-wettbewerb.md`), die Navigationsreferenz und die
Ergebnisse der ersten Betriebsmonate neu geprüft.

| Etappe | Inhalt                                                                                                                                                                                                                                                                                                                                                                                      | Voraussetzung                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 4      | **Portalfundament:** Zugang getrennt vom Praxiszugang (Account ≠ Akte, §4.6) · Termine ansehen · Intake vor dem Erstkontakt (größter Einzelnutzen) · Dokumente und Rechnungen · Einwilligungsverwaltung auf PAT-006 aufbauend · Datenexport (`IDEA-QSN-003`) · Onboarding mit Überspringen (`IDEA-LZK-005`) · Barrierefreiheit als Abnahmekriterium (`IDEA-QSN-006`)                     | **B5**                                   |
| 5      | **Tracking und Check-ins:** Einheit protokollieren (`IDEA-TRK-001`) · Check-in mit Takt (`IDEA-TRK-004`) · Bewegungssicherheit (`IDEA-TRK-003`) · Auslassquote (`IDEA-OUT-006`) · Offline-Erfassung (`IDEA-TRK-008`) · Benachrichtigungen mit Regeln (`IDEA-KOM-006`). Erfassen und darstellen, **nicht** auswerten.                                                                     | Etappe 4                                 |
| 6      | **Kommunikation:** strukturierte Rückfragen (`IDEA-KOM-001`) · Notfallabgrenzung (`IDEA-KOM-002`) · Foto/Video mit eigener Einwilligung, kurzer Frist, Metadatenentfernung (`IDEA-KOM-003`) · Zuordnung zur Akte (`IDEA-KOM-007`)                                                                                                                                                           | ADR-017, C2 (erledigt)                   |
| 7      | **Zeitstrahl und Sitzungsvorbereitung:** `IDEA-QSN-001`, `IDEA-ORG-005`, `IDEA-ORG-001`                                                                                                                                                                                                                                                                                                     | genug Inhalt aus 2 bis 6                 |
| 8      | **Kund:innen und Weiterbetreuung:** Betreuungsepisode mit Typ (`IDEA-LZK-002`), Kund:innen ohne vorherige Heilbehandlung (`IDEA-LZK-008`), Zweckbindung (`IDEA-LZK-003`), Klientenprofil (`IDEA-LZK-004`), Pakete und Guthaben (`IDEA-ANG-001`), Rückfall (`IDEA-ANG-003`), Preise (`IDEA-ANG-004`), Offboarding (`IDEA-LZK-006`). Hier wird aus der Praxissoftware eine Betreuungsplattform. | **B9** (erweitert), **B11**, §1-Ergänzung nach §21 |
| 9      | **Progression:** versioniertes deterministisches Regelwerk (`IDEA-TRN-002`), Schattenbetrieb (`IDEA-TRN-012`), Regeltests (`IDEA-QSN-004`), mehrdimensional (`IDEA-TRN-004`), doppelte Progression (`IDEA-TRN-007`), Ampel (`IDEA-TRN-003`), Adhärenz (`IDEA-TRN-009`), Wiedereinstieg (`IDEA-TRN-010`). Bis B10 entschieden ist: `MDR_REVIEW_REQUIRED`, produktiv nicht erreichbar.        | **B10** und externe Prüfung aus **B1**   |
| 10     | **KI-Assistenz:** zuerst der zentrale Pfad (`IDEA-KI-001`), dann Freitext strukturieren, Patientensprache, Antwortentwürfe — mit Quellenbindung (`IDEA-KI-003`) und menschlicher Freigabe                                                                                                                                                                                                   | Etappen 1 bis 3, ADR-005-Gateway, **C6** |

---

## Spur A2 — Praxisbetrieb (Stufe 2, nach M6)

Die Vorschaubereiche aus [`ARBEITSBEREICHE.md`](ARBEITSBEREICHE.md) bleiben
bis zu ihrem Loop stehen (entschieden 2026-09-05). Drei Regeln: **keine neue
Vorschau**, **keine Erweiterung einer Vorschau**, und jede Vorschau wird in
ihrem Loop **ersetzt**, nicht daneben gebaut. Vor dem ersten A2-Loop
entscheidet eine Optimierungsrunde mit Zählung aus dem Betrieb, ob die
Reihenfolge noch stimmt. Die Vorschau `/touren` ersetzt MAP-006 schon
im April 2027 (Etappe T).

| Reihenfolge | Loop                                                                                                                         | Ersetzt Vorschau        | Voraussetzung                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| 1           | **URL-001** Urlaub: Antrag, Genehmigung durch Teamleitung/Inhaber, Abwesenheit wirkt auf Kalender und Kapazität              | `/betrieb/urlaub`       | Urlaubsanspruch am Mitarbeiterdatensatz (`IDEA-QSN-010`) — Teil des Loops     |
| 2           | **ZK-001** Zeitkonto: Buchungen, Saldo je Person, keine Auswertung über Beschäftigte hinweg                                  | `/betrieb/zeitkonto`    | **B6** als Annahme (keine Leistungskontrolle, §20)                            |
| 3           | **FLT-EPIC-001** Radflotte: FLT-001 Räder, Depot, Schlüssel · FLT-002 Check-Up · FLT-003 Pannenassistent                     | `/betrieb/flotte…`      | Standortvorlage für Tübingen prüfen; Rad als Planungsressource des Kalenders  |
| 4           | **ERS-001** Erstattungen: eingereicht → genehmigt → ausgezahlt, Belege als Dateien                                           | `/betrieb/erstattungen` | ADR-017; steuerliche Belegaufbewahrung (B4)                                   |
| 5           | **TEAM-001** Teamkommunikation: Kanäle, Direktnachrichten, Threads, rollierende Speicherfrist (ANN-001), Anhänge nach ADR-017 | `/team`                 | ADR-017                                                                       |

---

## Spur A3 — Etappe G: Betriebsreife (vor M3)

| #   | Paket                                                 | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                                                | Wer                                   | Termin                  |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------- |
| G1  | **ADR-017 Dateiablage**                               | Supabase Storage nach ADR-015 Punkt 10, signierte Verweise, Datenklasse und Retention nach ADR-008, Zugriff nach ADR-004, Audit nach ADR-010, Virenprüfung erst bei Patienten-Uploads. Schließt E8. **Erst nach positivem OPS-001.**                                                                                                                                                                                                    | Claude (Docs), Jannes bestätigt       | Sep 2026                |
| G2  | **STAFF-EPIC-002 Konten und Rollen**                  | STAFF-002 Zugang einladen, Rolle vergeben und ändern (auditiert) · STAFF-003 sperren, Passwort zurücksetzen, MFA für `owner` · **STAFF-004** Passwort vergessen als Selbstbedienung, alle Sitzungen beenden. E-Mails ausschließlich über die Auth-Mails des geprüften Providers (B13, entschieden 2026-09-06). Löst E11; E10 als Annahme (`owner`).                                                                                    | Claude                                | Okt 2026                |
| G3  | **OPS-001 Providerprüfung und Cloudprojekt**          | Prüfkatalog aus ADR-002 für Supabase dokumentieren, einschließlich der Auth-Mails (B13); bei positivem Ergebnis Cloudprojekt in EU-Region und Umgebungen Dev/Test/Prod. **Dokument im September, Anlage im Oktober.** Keine Cloud-Ressource durch einen Agenten (ADR-013).                                                                                                                                                              | Claude (Dokument), Jannes (Anlage)    | Sep/Okt 2026            |
| G4  | **DAT-EPIC-001 Dateiablage**                          | DAT-001 Bucket, Berechtigungen, signierte Verweise, Datenklasse, Audit · VER-004 Scan-Anhang je Verordnung                                                                                                                                                                                                                                                                                                                             | Claude                                | Nov 2026                |
| G5  | **OPS-002 Deployment und Freigabe**                   | Frontend-Hosting mit Prüfung nach ADR-002; Release aus Tag mit menschlicher Freigabe; Migrationen nur über die Pipeline; Rollback; `service_role` nie im Browser; Review-Checkliste. **Test-Umgebung im November**, damit Jannes ohne Docker abnimmt.                                                                                                                                                                                  | Claude (Pipeline), Jannes (Freigabe)  | Nov 2026                |
| G6  | **OPS-004 Logging, Redaction, Monitoring**            | Verbotsliste aus ADR-011 automatisiert geprüft, Entscheidung zu externem Error-Tracking, Alarmierung, Security-Log 12 Monate, Erkennung für Art. 33. **Enthält OPS-005 minimal:** Audit-Abfrage als Runbook für `owner`, abgewiesene Zugriffe protokolliert.                                                                                                                                                                              | Claude                                | Jan 2027                |
| G7  | **OPS-003 Backup und Restore-Test**                   | PITR aktiv, Backup-Lebenszyklus, Restore-Test in isolierter Umgebung inklusive Nachziehen der Löschungen, Notfallzugang verwahrt, Betriebsdokumentation mit den 13 Positionen aus ADR-012.                                                                                                                                                                                                                                              | Jannes und Claude                     | Jan 2027                |
| G8  | **PAT-006 Datenschutzinformation und Einwilligungen** | „Datenschutzinformation ausgehändigt am", Hinweis auf Behandlungsvertrag, minimale Einwilligungsstruktur je Zweck mit Widerruf; Textvorlage Ausfallhonorar-Regel; die Datenschutzinformation nennt den Kartendienst (ADR-019). Behandlungsvertrag und Datenschutzinformation bleiben Papier mit Vermerk; keine Unterschrift in der Anwendung (E-13).                                                                                     | Claude                                | Dez 2026                |
| G9  | **OPS-006 Betroffenenrechte (minimal)**               | Verfahren dokumentiert; Export der Akte als einfache `owner`-Funktion, auditiert; begründete Ablehnung bei Aufbewahrungspflicht als Vorlage. Vollständige Funktion: Komfort.                                                                                                                                                                                                                                                              | Claude                                | Jan 2027                |
| G10 | **E2 Ausfallkonzept**                                 | Tagesplan mit Adressen und Telefonnummern druck- und exportierbar (**Dezember**, klein) · Praxisprozess für einen Tag ohne Anwendung (ADR-012). Ist zugleich der Rückfallplan der Eröffnung (H4), weil es kein Altsystem gibt.                                                                                                                                                                                                             | Claude (Funktion), Jannes (Prozess)   | Dez 2026 / Jan 2027     |
| G11 | **OPS-007 Bootstrap Produktion**                      | Runbook: Organisation, Standort, erstes `owner`-Konto, Mitarbeitende, Katalog, Praxisstammdaten ohne Seed anlegen; gegen die Test-Umgebung geprobt (M3), am 31.03.2027 im Produktivprojekt durchlaufen (M4).                                                                                                                                                                                                                              | Claude (Runbook), Jannes (Durchlauf)  | Jan / Mär 2027          |
| G12 | **ADR-019 Kartendienst** — *Fassung 2 vom 2026-09-08 (MAP-001), Bestätigung offen (E-20)* | In-App-Karte, Fahrradrouting, Fahrzeiten und Handoff als Produktziel; Zielarchitektur MapLibre + serverseitiger Adapter (`src/lib/location/contract.ts`); PTV Developer als Kandidat für Prototyp und Bewertung, **nicht** produktiv freigegeben; Google Maps nur als Handoff-Ziel; Privacy-Regeln als Prüfregeln; Prüfkatalog nach ADR-002 mit Belegtiefe in `docs/decisions/providerpruefung-kartendienst.md` — alle Vertragspunkte `CONTRACT_CONFIRMATION_REQUIRED`. DSFA-Wiedervorlage je Datenweg (ADR-007). Schließt B7 bis auf das Gate. | Claude (Docs), Jannes bestätigt; Vertragscheck mit B2 | Okt 2026 (E-20) / Mär 2027 (Gate) |
| G13 | **Steuerliche Grundeinstellungen**                    | Aus B4: Format des neuen Nummernkreises, Umsatzsteuer-Status der Praxis (Kleinunternehmerregelung ja/nein, Steuernummer), steuerliche Einordnung der Katalogpositionen, Belegfristen. Eine Seite, vor ABR-EPIC-002a.                                                                                                                                                                                                                       | Jannes mit Steuerberatung             | Nov 2026                |
| G14 | **DSFA-Paket**                                        | Schwellwertprüfung und DSB-Entscheidung (B2), Verzeichnis der Verarbeitungstätigkeiten, TOM (mit Endgeräte-Richtlinie), Löschkonzept (aus LOE), Subprozessoren (aus G3 und G12), Datenschutzinformationen (G8), Verfahren für Betroffenenrechte (G9), Data-Breach-Prozess; Nachweistabelle MUSS → Test/Policy/Prüfschritt; Zweckbestimmung (ADR-006). **Entwürfe ab Oktober als Docs-Sessions, Stand 15.12. an die Prüfung.**              | Jannes, externe Prüfung               | Okt 2026 bis Feb 2027   |
| G15 | **B1 Regulatorische Prüfung**                         | Externe Bestätigung der Zweckbestimmung und MDR-Abgrenzung (ADR-006), Einordnung nach EU AI Act.                                                                                                                                                                                                                                                                                                                                       | Jannes, extern                        | Feb 2027                |
| G16 | **BETRIEB-001 Betriebsmodell**                        | Störungsmeldung ohne Patientendaten · Triage werktäglich durch Jannes · Hotfix-Weg nach ADR-013 als privilegierter Vorgang mit Audit · Release-Takt nach M4: ein Release je zwei Wochen aus Tag, Change-Freeze zwei Wochen vor und nach M5 · Endgeräte-Richtlinie · Vertretung bei Ausfall von Jannes (Notfallzugang aus G7).                                                                                                              | Jannes mit Claude                     | Feb 2027                |
| G17 | **UI-001 Politur und Barrierefreiheit**               | Feindesign auf den fertigen Seiten, PWA-Manifest ohne Service Worker, Befunde aus Feldtagen und Kolleg:innen-Tests, speist sich aus den Ablaufrunden nach `OPTIMIERUNG.md`. **Nicht:** Branding je Praxis (`IDEA-QSN-009`).                                                                                                                                                                                                              | Claude                                | Feb 2027                |
| G18 | **Go-live-Gate (M3)**                                 | Sieben Vorbedingungen aus ADR-007 · Restore-Test 2 · alle Annahmen Datenschutz/Recht **von der Prüfung** bestätigt oder geändert — eine Festlegung durch Jannes allein (`entschieden (Jannes)`, `vorläufig entschieden`) reicht hier nicht · Branch Protection und Secret Scanning aktiv · CI grün · Abnahmeschritte aus `docs/abnahme/` durchlaufen · Messrunde vor dem Gate: kein täglicher Ablauf mit Score 0, Abweichungen bewusst dokumentiert (`OPTIMIERUNG.md`; entschieden 2026-09-06).                                                                        | Jannes                                | 19.03.2027              |

Der Generator für synthetische Daten (E6) bleibt der Seed; die Probewochen
(H1, H5) erweitern ihn um eine realistische Praxiswoche und eine
Eröffnungswoche.

**Kleine Wartung** (ohne eigenen Loop): `supabase/config.toml` Abschnitt
`[inbucket]` nach `[local_smtp]` umbenennen.

## Spur A3 — Etappe H: Eröffnung (Feb bis Jul 2027)

ADR-007 Punkt 6 erlaubt vor dem Gate nur synthetische Daten. Es gibt kein
Altsystem, also weder Parallelbetrieb noch Stichtagsumstellung: erst spielen,
dann das leere Produktivsystem, dann die Eröffnung.

| #  | Paket                              | Inhalt                                                                                                                                                                                                                                                                                                 | Wer                  | Termin              |
| -- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------------------- |
| H1 | **Probewoche 1 (synthetisch)**     | Der Seed bildet eine Praxiswoche nach (Hausbesuche, Serien, ein No-show, eine Rechnung). Jannes und eine zweite Person arbeiten sie auf der Test-Umgebung am Smartphone durch; Befunde werden gesammelt, priorisiert, geschlossen.                                                                     | Jannes, Claude       | Feb 2027            |
| H2 | **Kurzanleitung und Schulung**     | Kurzanleitung „erster Tag" als eine Seite; Erster-Tag-Protokoll nach `OPTIMIERUNG.md`; Schulung je Rolle (zwei Stunden) erst, wenn eine zweite Person eingestellt ist.                                                                                                                                | Jannes               | Feb / Jun 2027      |
| H3 | **Produktionssystem (M4)**         | Nach dem Gate: Produktivprojekt aus dem freigegebenen Tag, OPS-007 durchlaufen, keine synthetischen Daten, Release-Takt beginnt. Echte Daten nur, wenn sie anfallen (Anmeldungen).                                                                                                                     | Jannes, Claude       | 31.03.2027          |
| H4 | **Rückfallplan**                   | Es gibt kein Altsystem. Rückfall ist der Papierprozess aus E2: gedruckter Tagesplan mit Adressen und Telefonnummern, Dokumentation auf Papier mit Nachtrag binnen 24 h. **Rechnungen ruhen und werden nachgeholt** — keine handschriftliche Nummer aus dem Nummernkreis (entschieden 2026-09-08: eine Behandlung lässt sich nachdokumentieren, eine Nummernlücke nach §14 UStG nicht heilen). Abbruchkriterien (Datenverlust, Falschzuordnung, mehr als ein Tag Ausfall); Export nach G9; verantwortlich Jannes. | Jannes               | vor M3              |
| H5 | **Probewoche 2 (Eröffnungswoche)** | Der Seed bildet die Eröffnungswoche nach: nur Neuaufnahmen, erste Verordnungen, erste Serien, erste Rechnung am Monatsende; auf der Test-Umgebung mit dem Stand, der zur Eröffnung läuft (einschließlich Etappe T und 2). Befunde geschlossen vor dem Change-Freeze.                                     | Jannes, Claude       | Jun 2027            |
| H6 | **Eröffnung (M5)**                 | Change-Freeze ab 17.06. bis 15.07. (nur Hotfixes nach BETRIEB-001); Restore-Test 3; erste echte Patient:innen aus Anmeldungen; erster Behandlungstag am 01.07.2027 mit der Software; Störfallliste ab Tag 1.                                                                                             | alle                 | 01.07.2027          |
| H7 | **Erster Betriebsmonat (M6)**      | M6-Kriterien geprüft; Stabilisierungsbefunde geschlossen; Optimierungsrunde nach vier Wochen Betrieb; Spur A2 und Stufe 3 freigegeben.                                                                                                                                                                 | Jannes               | 31.07.2027          |

---

## Spur B — Entscheiden

Offene Punkte aus `docs/decisions/OPEN_DECISIONS.md` mit Fälligkeit. **Ein
Loop kann keine davon ersetzen.** Die Spalten „angefragt am / bei wem /
zugesagt bis" pflegt Jannes; das Wochenupdate liest sie.

**Jannes darf jeden dieser Punkte vorläufig selbst entscheiden** und die
Entscheidung zurücknehmen, wenn die externe Stelle widerspricht (Status
`vorläufig entschieden (Jannes)`, Regeln in `OPEN_DECISIONS.md`). Das löst die
Sperre fürs Bauen und macht aus der Anfrage eine Vorlage statt einer offenen
Frage. **Für M3 zählt es nicht** — dort gilt weiter das Ergebnis der externen
Stelle. Nicht so entscheidbar: **B8** (Tatsache über einen Lizenzgeber, nicht
Entscheidung der Praxis) und die externe MDR-Prüfung selbst (§17, ADR-006
Punkt 7 — MUSS; der Inhalt der Zweckbestimmung dagegen schon).

| Punkt                        | Was zu entscheiden ist                                                                                                                             | Wer                                 | Fällig vor                   | Termin                              | Stand (Jannes pflegt) |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------- | ----------------------------------- | --------------------- |
| **E8 → ADR-017**             | Dateiablage: Ort, Zugriff, signierte Verweise, Retention, Virenprüfung                                                                             | Claude schreibt, Jannes bestätigt   | DAT-EPIC-001, ABR-EPIC-002b  | Sep 2026                            |                       |
| **D → ADR-018**              | Terminzustände: Übergänge, Auslöser, Migration; „angefragt"/„vorgemerkt" definiert, nicht gebaut                                                   | Claude schreibt, Jannes bestätigt   | CAL-EPIC-003a                | Sep 2026                            | **erledigt 2026-09-11** — angenommen, alle sieben Fragen wie empfohlen; §8 auf 0.7 nachgezogen |
| **Providerprüfung Supabase** | Prüfkatalog ADR-002 dokumentiert und bestanden — sonst Alternative; schließt die Auth-Mails ein (B13)                                              | Jannes mit Claude-Dokument          | ADR-017, OPS-001 Anlage      | 30.09.2026                          |                       |
| **B7 → ADR-019**             | **Weg C gewählt (MAP-001, 2026-09-08):** Handoff nicht blockiert (ANN-018, Frage an B2); Karte und Fahrzeiten über PTV Developer als Kandidat; produktive Freigabe am Gate aus ADR-019 Punkt 9 — neun Punkte, alle `CONTRACT_CONFIRMATION_REQUIRED` | Jannes (Vertragsdokumente, PTV-Support), Datenschutzberatung (B2) | MAP-006 | Dokumente Okt 2026; Gate mit B2 bis Feb 2027 | ADR-019 Fassung 2 |
| **E10**                      | Wer darf Mitarbeiterdaten schreiben (bis dahin `owner`)                                                                                            | Jannes                              | STAFF-EPIC-002               | Okt 2026                            | entschieden 2026-09-08 |
| **B4**                       | Steuerliche Validierung: Leistungsarten, Umsatzsteuer (Personal Training im **selben** Unternehmen, B9), Kleinunternehmerregelung und Gesamtumsatz nach §19 Abs. 3 UStG, Nummernkreis-Format, Belegfristen | Steuerberatung                      | ABR-EPIC-001 (als Annahme)   | Nov 2026                            | Festlegungen stehen 2026-09-08; Anfrage Sep |
| **B14 PDF-Weg**              | Rechnungs-PDF: Browser-Druck, Bibliothek im Browser oder serverseitige Funktion — Optionen legt ABR-EPIC-002a vor; Druckansichten sind entschieden | Jannes mit Claude-Optionen          | ABR-EPIC-002b                | Nov 2026                            | bewusst offen; Tendenz serverseitig |
| **B2**                       | DSFA-Schwellwertprüfung, DSB-Entscheidung, danach DSFA; Kartendienst und Terminerinnerung mit anfragen                                             | externe Datenschutzberatung         | M3                           | Anfrage Sep, Ergebnis Dez, DSFA Feb | DSB entschieden 2026-09-08; Anfrage Sep |
| **B1**                       | Zweckbestimmung, MDR-Abgrenzung, EU AI Act                                                                                                         | externe Prüfstelle                  | M3                           | Anfrage Sep, Ergebnis Feb           | Zweckbestimmung steht 2026-09-08; Anfrage Sep |
| **B3**                       | Validierung der internen Fristen (ANN-001), Belegarten                                                                                             | im DSFA-Prozess                     | M3                           | Feb 2027                            | gilt wie ANN-001; Prüfung Feb |
| **E2**                       | Ausfallkonzept als Praxisprozess — zugleich Rückfallplan der Eröffnung                                                                             | Jannes mit Claude                   | M3                           | Jan 2027                            | Kern entschieden 2026-09-08 |
| **B8**                       | Lizenzstatus DIGOTOR-Bogen und weiterer Instrumente — **keine Entscheidung, eine Auskunft des Lizenzgebers**; entscheidbar ist nur der Rückfall: bis zur Klärung nur lizenzfreie Instrumente | Jannes, Lizenzgeber                 | FRB-003                      | vor FRB-EPIC-002, spätestens Apr 2027 | Rückfall entschieden; Anfrage Okt |
| **B15 Terminerinnerung**     | Kanal (SMS, E-Mail, Messenger), Anbieter, Einwilligung; Online-Anfrage — oder Anrufliste bleibt der Weg                                            | Jannes, Prüfung nach ADR-002        | Stufe 2 nach der Eröffnung   | Anfrage mit B2, Entscheidung bis M6 | entschieden 2026-09-08: keine |
| **B6**                       | Beschäftigtendaten: aggregierte Auswertungen (§20)                                                                                                 | Jannes, ggf. Beratung               | ZK-001, MAP-006              | Stufe 2                             | entschieden 2026-09-08: nein |
| **B5**                       | Patientenidentität, Vertretung, §630g                                                                                                              | Jannes, ggf. Beratung               | Etappe 4                     | Stufe 3                             | Rahmen entschieden 2026-09-08 |
| **B9**                       | Betreuung ohne und nach Heilbehandlung: Vertrag, Steuer, Aufbewahrung, Zweckbindung, Berufsrecht (Ernährung). **Ein Unternehmen für beides: vorläufig entschieden 2026-09-07** — geht als Festlegung in B4 | Steuerberatung und Datenschutz      | Etappe 8                     | Steuerteil mit B4 anfragen, Rest 2027 | entschieden 2026-09-08 |
| **B11**                      | Paketpreise, Guthaben, Verfall, Rabatte                                                                                                            | Jannes und Steuerberatung           | Etappe 8                     | mit B9                              | entschieden 2026-09-08: nein |
| **B10**                      | Automatisierte Progression: MDR-Grenze                                                                                                             | externe regulatorische Prüfung      | Etappe 9                     | mit B1 anfragen                     | entschieden 2026-09-08: V1 aus |
| **C6**                       | KI: Schutzumfang und Provider                                                                                                                      | Jannes und Prüfung nach ADR-002/005 | Etappe 10                    | Stufe 3                             | Schutzumfang entschieden 2026-09-08 |

Erledigt: A1 bis A4, B1 bis B4 architektonisch, B12 (kein Altsystem), B13
(Auth-Mails des Providers, kein zweiter Dienst), C1 bis C5, C8, D
„finalisiert"/„nachvollziehbar", E1, E3 bis E5, E7, E9, E11 (mit STAFF-002),
E-13 (keine Unterschrift am Hausbesuch).

**Stand 2026-09-08: kein Punkt blockiert mehr das Bauen.** Jannes hat die
Entscheidungsrunde vom Vortag ausnahmslos entschieden (Historie in
`OPEN_DECISIONS.md`). Was in der Spalte „Stand" jetzt ein Datum trägt, ist
**vorläufig entschieden** und wartet nur noch auf die externe Bestätigung —
fällig für M3, nicht für den nächsten Loop. Echte Restfragen sind allein: die
Auskunft des Lizenzgebers (B8), der PDF-Weg (B14, auf ABR-EPIC-002a vertagt),
die Anbieterwahl der KI (C6) und das Verfahren der Patientenidentität (B5).

---

## Definition of Done

**Je Story:** vertikaler Schnitt, Tests, Abnahmeschritte in `docs/abnahme/`,
Registereinträge (Skill-Schritt D), Oberflächen-Checkliste abgehakt
(`docs/abnahme/README.md`). **Je neue Tabelle zusätzlich:** Datenklasse und
Frist als `COMMENT`, Löschpfad in LOE-002, ein `test:db`-Fall, der die Löschung
dieser Klasse prüft.

**Je Epic:** Checks nach Skill-Schritt H · Roadmap nachgestellt · **von Jannes
binnen sieben Tagen abgenommen** (Datum in der Fortschrittstabelle) · Befunde
als erste Story in den nächsten Loop derselben Spur.

**Etappe 1 fertig:** M1 erreicht; der Ende-zu-Ende-Fall liegt als E2E-Test
hinter der Anmeldung.

**Etappen G und H fertig:** M2 und M3 erreicht; die 13 Positionen aus ADR-012
und die sieben Vorbedingungen aus ADR-007 sind je mit Fundstelle nachgewiesen.
Die Eröffnung (M5) ist erreicht, wenn der erste Behandlungstag mit der Software
gelaufen ist.

---

## Credit-Budget

**Sitzungszuschnitt**

1. **Ein Loop = eine Session = ein Epic aus mehreren Stories.** Je Story ein
   Commit und die eng betroffenen Checks. Danach Session beenden.
2. **Stories so schneiden, dass jeder Diff am Stück lesbar bleibt.** Die
   vollständige Testsuite läuft einmal am Ende des Epics.
3. **Neues Thema = neue Session.** Rückfragen zum laufenden Loop in derselben.
4. **Ein aktiver Feature-Branch.** Docs-Sessions werden sofort gemergt; die
   sieben Merge-Commits vom 04.09. sollen sich nicht wiederholen.

**Leseverhalten**

5. **Diese Roadmap zuerst lesen**, dann den Abschnitt „Nächster Loop".
6. **Die im SPEC benannten ADRs vollständig** — mindestens alle, die der Loop
   berührt. Bei RLS, Löschung und Abrechnung sind das mehr als zwei; das ist
   kein Grund zu kürzen.
7. **Höchstens eine Ideenspeicher-Datei** je Loop, nach dem Index in
   `IDEENSPEICHER.md`.
8. **Keine Subagenten** außer bei echt breiter Suche über viele Dateien.

**Verifikation**

9. Während der Entwicklung nur die eng betroffenen Checks; die vollständige
   Runde **einmal** am Ende (Skill-Schritt H).
10. Keine identischen teuren Läufe ohne Änderung dazwischen.
11. `pnpm test:db` läuft auch in der Cloudumgebung und ist bei Migrationen und
    Policies das wichtigste Gate.
12. **Unabhängiger Zweitreview** in frischer Session bei RLS-Policies,
    `SECURITY DEFINER`, Löschung, Rechnungsausstellung und Nummernkreis
    (`DEVELOPMENT_WORKFLOW.md`).

**Rhythmus**

13. **Zwei Code-Loops je Woche** sind das Maß; einer ist in Ordnung, drei
    bedeuten zu kleine Schnitte.
14. Die wöchentliche Planungssession ist **absichtlich klein**.
15. **Monatsreview** (30 Minuten, letzter Freitag): Meilenstein-Ampel,
    Spur-B-Stand, Risiken, Rückwärtsplan des Folgemonats.

**Faustregel:** Wenn eine Session anfängt, das Projekt zu erkunden statt zu
arbeiten, fehlt ein Eintrag in dieser Roadmap.

### Modell und Aufwand je Aufgabe

Modell und Aufwandsstufe werden zu Sitzungsbeginn gewählt und nicht gewechselt.

| Aufgabe                                                          | Modell    | Aufwand                  |
| ---------------------------------------------------------------- | --------- | ------------------------ |
| Migration, RLS-Policy, RPC, Berechtigungen                       | Opus 5    | `xhigh`                  |
| Architekturentscheidung, ADR, Sicherheitsreview eines Diffs      | Opus 5    | `xhigh`                  |
| Löschung und Retention (LOE-EPIC-001)                            | Opus 5    | `max`                    |
| Rechnungsausstellung, Nummernkreis, Snapshot (ABR-EPIC-002a)     | Opus 5    | `xhigh` + Zweitreview    |
| Fachlogik ohne bestehendes Muster; neuer Datenweg (MAP-003, MAP-006) | Opus 5  | `high`                   |
| Unabhängiger Zweitreview                                         | Opus 5    | `xhigh`, frische Session |
| UI-Seite nach dem Muster vorhandener Seiten, UI-000, UX-EPIC-001 | Sonnet 5  | `medium`                 |
| Tests zu bereits geschriebenem Code ergänzen                     | Sonnet 5  | `medium`                 |
| Vollrunde (`OPTIMIERUNG.md`), Formulierung, Doku                 | Sonnet 5  | `medium`                 |
| Messrunde (`OPTIMIERUNG.md`)                                     | Sonnet 5  | `low`                    |
| Wöchentliche Planungssession                                     | Haiku 4.5 | —                        |

---

## Wochenupdate

Auftrag für die wöchentliche Planungssession. Sie **baut nichts.**

1. `git log --since='8 days ago' --oneline` und diese Datei lesen. Sonst
   nichts. (Das Praxistagebuch liegt nach `OPTIMIERUNG.md` nicht im
   Repository; Jannes nennt Störungen der Woche selbst.)
2. Feststellen, welche Loops seit dem letzten Update abgehakt **und
   abgenommen** wurden.
3. Den Abschnitt „Nächster Loop" wiedergeben und prüfen, ob seine
   Voraussetzung aus Spur B vorliegt; sonst den Ersatz nennen.
4. Prüfen, ob ein Termin aus Spur B, aus dem Rückwärtsplan oder ein
   Meilenstein fällig oder überschritten ist; bei einem verfehlten
   Meilenstein die Abweichungsregel anwenden.
5. Antwort in festem Format, höchstens zwölf Zeilen: _diese Woche ansteht ·
   Jannes entscheidet oder liefert (mit Datum) · hängt (Spur-B-Punkte über
   Termin) · Ampel M0 bis M6 mit je einem Wort Begründung_.

Die eingerichtete Routine (montags 07:50 Uhr) ist in `docs/DEVELOPMENT.md`
beschrieben; ihr Prompt wurde am 2026-09-06 auf dieses Format umgestellt
(E-10). Sie liest `main`.

---

## Antworten E-15 bis E-19

Gestellt und beantwortet am 2026-09-06; die Fragen im Wortlaut stehen in der
Git-Historie (Commit `ba46307`). Eingearbeitet an den betreffenden Stellen.

1. **E-15 Zeitfenster vor der Eröffnung:** Die Reihenfolge der Umsetzung
   ist verbindlich, der Zeitpunkt im Kalender zweitrangig; Jannes hält sich
   offen, Themen früher abzuarbeiten. Folge: Abschnitt „Sessions starten",
   Monate als Spätest-Termine, Reihenfolge TOUR-EPIC-001a → Etappe 2 → freier
   Monat vor der Eröffnung. Eröffnung 01.07.2027 bestätigt.
2. **E-16 In-App-Karte:** Empfehlung angenommen — Google Maps Embed API. Die
   zuständige Datenschutz-Fachkraft hat genehmigt. Folge: B7 bis auf die
   Fahrzeiten entschieden; ADR-019 dokumentiert; die Genehmigung kommt
   schriftlich zu den DSFA-Unterlagen (M0). **Nachtrag 2026-09-08:** ADR-019
   hat die Vertragsgrundlage geprüft und die Karte **nicht** freigeschaltet —
   Google bietet für die Maps Platform keinen AVV an, was §3.5 als MUSS
   verlangt. Die schriftliche Genehmigung wird damit von einer Formalie zur
   Voraussetzung; sie muss ausdrücklich die Übermittlung an einen **eigenen
   Verantwortlichen** decken. **Nachtrag 2 (2026-09-08, MAP-001):** Jannes
   hat Convenience hoch priorisiert; die In-App-Karte ist Produktziel. ADR-019
   Fassung 2 ersetzt die Embed API durch MapLibre mit PTV Developer als
   Kandidat (Weg C). E-16 ist damit überholt — Bestätigung als **E-20**.
3. **E-17 Personal Training:** beginnt ebenfalls am 01.07.2027, also keine
   Bestandsdaten; Empfehlung angenommen — Stufe 3 nach M6, §1 der Prinzipien
   wird dann ergänzt. Ob dieselbe Praxis oder ein eigener Betrieb, klärt die
   Steuerberatung mit B4.
4. **E-18 Screenshot:** ein fremdes Produkt; Jannes hat nur diesen Screenshot
   und will den Funktionsumfang nachbauen. Folge: Vorlage für Umfang und
   Ablauf, nicht für Datenmodell, Berechtigungen, Rechtsrahmen oder gestaltete
   Inhalte; keine Nachrecherche.
5. **E-19 Reihenfolge Stufe 3:** Empfehlung angenommen.

---

## Fortschritt

Abgehakt wird hier, mit Datum und Commit. Ein Loop gilt als **fertig**, wenn
Skill-Schritt I durchlaufen ist, und als **abgenommen**, wenn Jannes die
Abnahmeschritte aus `docs/abnahme/` durchlaufen hat.

### Eine Zahl für den Gesamtstand

```bash
pnpm fortschritt            # Übersicht je Block
pnpm fortschritt --posten   # jeder einzelne Posten
pnpm fortschritt --json     # maschinenlesbar
```

Die Tabelle unten zählt abgehakte Loops. Sie sagt damit nicht, **wie weit es
insgesamt** ist — ein Loop wiegt nicht so viel wie eine Probewoche und eine
Probewoche nicht so viel wie die externe Datenschutzprüfung. Dafür gewichtet
`docs/development/fortschritt.json` fünf Blöcke gegeneinander und
`scripts/fortschritt.mjs` rechnet sie zu einem Prozentwert zusammen.

| Block | Inhalt                                              | Gewicht |
| ----- | --------------------------------------------------- | ------- |
| A     | Kernprozess — Software Stufe 1 (Etappe 1, bis M1)   | 30      |
| B     | Software Stufe 2 vor der Eröffnung (Etappe T und 2) | 10      |
| C     | Betriebsreife (Etappe G, vor M3)                    | 25      |
| D     | Eröffnung (Etappe H, bis M5)                        | 15      |
| E     | Entscheidungen und externe Prüfungen (Spur B)       | 20      |

Drei Festlegungen, damit die Zahl nicht schmeichelt:

- **Gerechnet wird gegen M5**, den ersten Behandlungstag mit der Software —
  nicht gegen „Code fertig". Software ist deshalb 40 Prozent, der Rest 60.
  Das folgt „Kapazität und Puffer": Der Engpass ist nicht die Baukapazität,
  sondern Jannes' Zeit für Entscheidungen, Abnahmen und externe Anfragen.
- **Gebaut ist nicht fertig.** Ein Loop ohne Abnahme zählt `0,85`; die
  restlichen 15 Prozent holt die Abnahme (Definition of Done).
- **Vorläufig entschieden ist halb entschieden.** Ein Punkt aus Spur B mit
  Status `vorläufig entschieden (Jannes)` zählt `0,5` — er löst das Bauen,
  für M3 zählt er nicht.

Das Ergebnis ist eine **Schätzung mit offengelegtem Modell**, keine Messung.
Wer die Gewichte für falsch hält, ändert sie in der JSON-Datei; das Skript
prüft nur, dass die Blockgewichte 100 ergeben. **Gepflegt wird die Datei am
Ende eines Loops**, zusammen mit der Tabelle unten.

| Loop                                                   | Status | Fertig am      | Commit                                                              | Abgenommen am |
| ------------------------------------------------------ | ------ | -------------- | ------------------------------------------------------------------- | ------------- |
| PAT-001 bis PAT-004                                    | fertig | vor 2026-09-01 | PAT-004: Merge PR #1                                                |               |
| CAL-001 bis CAL-006                                    | fertig | vor 2026-09-01 | —                                                                   |               |
| STAFF-001                                              | fertig | 2026-08-30     | `e70775a`, `ca907e9`                                                |               |
| DOK-001                                                | fertig | 2026-09-01     | `7e18906`, Merge PR #5                                              | 2026-09-11    |
| DOK-002                                                | fertig | 2026-09-02     | `491a0c0`, Merge PR #5                                              | 2026-09-11    |
| DOK-003                                                | fertig | 2026-09-05     | `21d85dd`, `f565124`                                                | 2026-09-11    |
| DOK-004                                                | fertig | 2026-09-05     | `e931068`, `960f34f`                                                | 2026-09-11    |
| Planungsreview und Roadmap 2.0                         | fertig | 2026-09-05     | Merge PR #13                                                        | —             |
| Wettbewerbsanalyse, Review 2.1, Optimierungsmethode    | fertig | 2026-09-06     | `7ab6f71`, Branch `claude/roadmap-optimization-competitor-analysis-r3qxl7` | —      |
| Roadmap 2.1 in Kraft, Tagesroute und Plattform geplant | fertig | 2026-09-06     | `ba46307`, `879048c`, Branch `claude/competitor-analysis-roadmap-eercd3` | —        |
| VER-EPIC-001 (PAT-005, VER-001 bis VER-003)             | fertig | 2026-09-07     | `2c3c1de`, `18e5131`, `a2c42b1`, `159c1bb`                          | 2026-09-11    |
| ADR-019 Kartendienst (Docs), Fassung 1                  | ersetzt durch Fassung 2 | 2026-09-08 | `c5c7b21`                                                           | —             |
| MAP-001 Mapping-Architektur und Providerentscheidung    | fertig | 2026-09-08     | `f52e555`, `5d51d97`, Roadmap-Commit auf Branch `claude/mapping-architecture-provider-ujy45m` | —             |
| UI-000 Fundament                                        | fertig | 2026-09-07     | `4a4440f`, `45e8222`, `df8a294`, `11a9977`, `afb5ba5`, `e6b4ab6`    | 2026-09-11    |
| Produktentscheidungen Terminfenster und Sprachdokumentation (Docs) | fertig | 2026-09-08 | Branch `claude/praxissoftware-product-decisions-1uk1d8`             | —             |
| UX-EPIC-001 (UX-001 bis UX-011)                         | fertig | 2026-09-11     | `ee19a16`, `2b927f5`, `ef82a19`, `18ec31b`, `b3f1440`, `6fad6bc`, `c42e1f5`, `4e2ee46`, `9dbe56a`, `1b5b065`, `9ab6ad7`, Merge PR #18 | 2026-09-11    |
| Marke Own Motion als Dateien und Regel (Docs)           | fertig | 2026-09-10     | `eb5c234`                                                           | —             |
| MARKE-001 Marke in der Anwendung                        | fertig | 2026-09-11     | `577ecd6`, `fb5cee0`, `7486c95`, `7109595`, `8f576b2`, Merge PR #19 | 2026-09-11    |
| STAFF-EPIC-002 (STAFF-002a/b/c, STAFF-003, STAFF-004)   | fertig | 2026-09-11     | `3938482`, `06b758c`, `0d7bd3c`, `719faed`, `56b2706`, `4afaf97`, `23cfb35`, PR #20 | 2026-09-11    |
| LOE-EPIC-001 (LOE-001a/b/c, LOE-002a/b)                 | fertig | 2026-09-11     | `042c325`, `169469d`, `310dc3b`, `0a3a2d7`, `c88bc71`, `ae4e85a`, Merge PR #25 | 2026-09-11    |
| ADR-018 Terminzustände (Docs)                            | fertig | 2026-09-11     | angenommen 2026-09-11, alle sieben Fragen wie empfohlen; §8 auf 0.7 nachgezogen | —             |
| CAL-EPIC-003a (CAL-008a bis CAL-008d, CAL-009)           | fertig | 2026-09-12     | `42f9fc3`, `262b5cd`, `718bd59`, `6eccadb`, `6ed26e5`, `6cd2c6b`    |               |
| CAL-EPIC-003b (CAL-010a, CAL-007, CAL-011)               | fertig | 2026-09-12     | `b2626ae`, `89ab30b`, `acddcc6`                                     |               |
| CAL-012 Mitteilungsvermerk am Termin                     | fertig | 2026-09-12     | Folgeauftrag zu CAL-EPIC-003b                                       |               |
| CAL-013 Termine per E-Mail (Handoff)                     | fertig | 2026-09-12     | Folgeauftrag zu CAL-012; B15-Nachtrag, ANN-041                      |               |
| AKTE-000 bis AKTE-005 Patientenakte als Arbeitsplatz     | fertig | 2026-09-12     | `77ab995`, `1c7219c`, `d9eda45` — eigener Auftrag von Jannes nach einem Screenrecording, **nicht** aus der Roadmap |               |
| UI-002a bis UI-002d Lesbarkeit (Akte ohne Übersicht, weißes Papier, weiße Rahmen, zweiter Faktor) | fertig | 2026-09-12 | `bc2713a`, `a6d9cea`, `c4d8517`, `5e977b6`, `ac1fcd7` — eigener Auftrag von Jannes aus der Sicht auf die laufende Anwendung, **nicht** aus der Roadmap; ANN-028 mit Nachtrag |               |
| UX-012a bis UX-012f Bedienabläufe zwischen den Bereichen | fertig | 2026-09-12     | `5d29756`, `65886e8`, `68e62c8`, `6edc13a`, `ccb4a24`, `dedb380` — eigener Auftrag von Jannes, **nicht** aus der Roadmap; ANN-039 und ANN-041 in Fassung 2 |               |

---

## Änderungsvermerk

| Version | Datum      | Änderung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.3     | 2026-09-12 | **UI-002 Lesbarkeit fertig** (vier Stories, eigener Auftrag von Jannes aus der Sicht auf die laufende Anwendung). Der Bereich **„Übersicht" der Akte ist entfallen** — er war ein Auszug aus den vier anderen Bereichen und kostete bei jedem Aufruf einen Tap; `/patienten/:id` führt jetzt in den ersten Bereich, den die Rolle sehen darf, und die Suchparameter wandern mit, damit der Rückweg nicht beim Öffnen verloren geht. Zugangshinweis und Besonderheit stehen im Kopf der Akte (UI-002a). **Papier ist weiß** — Karte (#f6f7f4) und Seitengrund (#eceee8) lagen bei 1,09:1, also praktisch nicht unterscheidbar; der getönte Grund stand optisch hinter dem Inhalt statt unter ihm. Ein Token, 103 Stellen; die Folge für Eingabefelder (nicht mehr die hellste Fläche, erkennbar allein an `line-strong` mit 4,56:1) ist als Test festgehalten (UI-002b). **Termine, Listen und Auskünfte stehen im weißen Rahmen**, die Bedienung bleibt vertieft — die Regel trägt `Section rahmen` und `Inhaltsflaeche`, nicht dreißig einzelne Klassenlisten (UI-002c). **„Mein Konto" sagt vor der Einrichtung, dass die Anmeldung den zweiten Faktor derzeit nicht abfragt** (UI-002d) — Jannes hat am selben Tag entschieden, den Faktor erst nach dem Online-Schalten zu integrieren, und ANN-028 trägt den Nachtrag samt der Berichtigung „nicht erzwungen" → „nicht abgefragt". Keine Migration, keine neuen Rechte, keine neue Annahme. **Nächster Loop unverändert: DAT-EPIC-001**, sobald ADR-017 bestätigt ist; sonst `ABR-EPIC-001` vorziehen. |
| 4.2     | 2026-09-12 | **Planungssession ohne Code.** Gesamtstand geprüft: alle sechs Remote-Branches sind in `main` aufgegangen, **kein unveröffentlichter Code** — offen ist allein ein Docs-Stand auf `claude/jolly-galileo-vgpuzb` (Abnahme von CAL-EPIC-003a am 2026-09-12), der in `main` fehlt und nachgetragen wird, sobald Jannes ihn bestätigt. Drei Vorgaben von Jannes aufgenommen: **`UI-002 Lesbarkeit`** als neues Epic und Vorschlag für den nächsten Loop (Bereich „Übersicht" der Akte entfällt · wichtige Inhalte auf Weiß statt auf getönter Fläche · Kopf und Bereichsleiste bleiben) · **der zweite Faktor wird erst nach dem Online-Schalten integriert**, womit `FIX-EPIC-002` hinter die Inbetriebnahme rückt und die ungedeckte Zusage in „Mein Konto" bis dahin benannt werden muss · **Terminieren mit ausgewählter Person** als `IDEA-PRX-042` im Ideenspeicher und `CAL-EPIC-004` als Vorschlag, dessen Fahrweg-Einfärbung an MAP-006 und dem Gate aus ADR-019 hängt. **Reihenfolge unverändert**, solange Jannes UI-002 nicht vorzieht. |
| 4.1     | 2026-09-12 | **FIX-EPIC-001 fertig** (fuenf Stories) — ein Befund-Loop aus einer Pruefung, nicht aus der Reihenfolge dieser Roadmap (R6). Links aus den Auth-Mails hatten keinen Empfangspfad: `detectSessionInUrl` steht auf `false`, und es gab im ganzen Projekt kein `verifyOtp`, `exchangeCodeForSession` oder `setSession`; `/kennwort-neu` war eine Adresse ohne Route. Jetzt zwei oeffentliche Seiten, eingeloest ueber den einmaligen `token_hash` mit eigenen Mailvorlagen — datensparsamer als Token im Adressfragment und der einzige Weg, der geraeteuebergreifend traegt (ANN-043) · Der Auditvermerk zu "Alle Sitzungen beenden" stand vor dem Vorgang und blieb auch bei dessen Fehlschlag stehen; ein blosses Vertauschen haette ihn ersatzlos geloescht, weil `log_account_security_event` `auth.uid()` verlangt. Er ist jetzt Vorbedingung, `melde()` erkennt Fehlschlaege ueberhaupt erst, und die Zusage nennt das Restfenster von bis zu einer Stunde samt Verweis auf die sofort wirkende Sperre (ANN-044) · Das gewoehnliche Abmelden lief mit dem supabase-js-Default `scope: 'global'` und beendete alle Geraete, waehrend "Mein Konto" das Gegenteil versprach (ANN-045) · Der Abfragespeicher wurde nur beim Knopf in der Kopfzeile geraeumt; "Alle Sitzungen beenden", die Abmeldung im zweiten Tab und die abgelaufene Sitzung liefen daran vorbei. Die Raeumung steht jetzt im Ereignisstrom und vergleicht die Benutzerkennung, damit `TOKEN_REFRESHED` nicht stuendlich die acht Stunden aus ANN-021 zuruecknimmt (ANN-021 umgezogen). **Drei Abnahmeschritte beschrieben Verhalten, das es nicht gibt** und sind berichtigt — darunter STAFF-004 Nr. 9: ein eingerichteter zweiter Faktor wird beim Anmelden **nie abgefragt**. Das ist ein eigenes Epic (`FIX-EPIC-002`), ebenso der Navigationsschutz fuer ungespeicherte Dokumentation (`FIX-EPIC-003`). **Naechster Loop unveraendert: DAT-EPIC-001**, sobald ADR-017 bestaetigt ist; sonst `ABR-EPIC-001` vorziehen. |
| 4.0     | 2026-09-12 | **Die Bedienabläufe zwischen den Bereichen sind überarbeitet** (eigener Auftrag von Jannes, **nicht** aus der Roadmap). Kein neuer Bereich — die **Wege** dazwischen: Der Name im Terminkopf führt in die Akte; **Rückwege** tragen Ansicht, Person, Datum, Filter und den Stand der Patientensuche mit (`?zurueck=`, nur interne Pfade, nie ein Name in der Adresszeile nach ADR-011); **Patient:in anlegen** und **Adresse ergänzen** gehen aus dem laufenden Vorgang heraus und kommen mit allem Eingetippten zurück; das Verordnungsformular nennt die Person, für die geschrieben wird; **Formularfehler** stehen als Zusammenfassung über den Feldern und führen mit Klick, Tap oder Tastatur ins Feld; ein **Suchfehler** ist nicht mehr „Kein Treffer"; der Mitarbeiterdatensatz verbindet Telefon, E-Mail, Kalenderwoche und Arbeitszeiten. **Zwei echte Fehler behoben:** ein falscher Abfrageschlüssel ließ die Akte nach dem Anlegen einer Terminserie veraltet stehen, und die Serienprüfung konnte ein altes Ergebnis für eine **geänderte** Liste als gültig ansehen — sie ist jetzt an ihren Vorschlag gebunden. **ANN-039 und ANN-041 in Fassung 2:** Drucken und Mailen **bereiten vor**; der Mitteilungsvermerk entsteht erst auf ausdrückliche Bestätigung, weil er sonst eine Übergabe behauptet, die niemand gesehen hat. Keine Migration, keine neuen Rechte. **Nächster Loop unverändert: DAT-EPIC-001**, sobald ADR-017 bestätigt ist; sonst `ABR-EPIC-001` vorziehen. |
| 3.9     | 2026-09-12 | **Die Patientenakte ist umgebaut** (eigener Auftrag von Jannes anhand eines Screenrecordings, **nicht** aus der Roadmap — wie MARKE-001). Aus einer sehr langen Seite werden ein Kopf und fünf Bereiche: **Übersicht** mit nächsten Terminen, laufenden Verordnungen und letztem Behandlungsstand · **Termine** mit Historie, allen Zuständen und Filter auf eine Verordnung · **Verordnungen** getrennt nach laufend und ausgeschöpft · **Behandlungsverlauf** · **Stammdaten** mit den seltenen Verwaltungsvorgängen am Ende. Zwei neue Lesepfade (`list_patient_appointments`, `list_patient_prescription_slots`), keine neuen Rechte, keine neuen Felder. **Sachlich korrigiert:** „Kontingent" stand über zwei verschiedenen Zahlen — Leistungseinheiten aus den Positionen und verplante Termine (ANN-038); beide tragen jetzt ihre Einheit im Namen, und „Terminserie anlegen" steht nur noch an einer Verordnung, an der sich etwas planen lässt. Neu: der **Patientenfilter im Kalender** (`?patient=`), übergeben aus der Akte. **Keine neue Annahme.** **Nächster Loop unverändert: DAT-EPIC-001**, sobald ADR-017 bestätigt ist; sonst `ABR-EPIC-001` vorziehen. |
| 3.8     | 2026-09-12 | **B15 im Nachtrag geändert und CAL-013 gebaut.** Jannes hat ausdrücklich vorgesehen, dass die Praxis Terminmails verschickt, und damit seine eigene vorläufige Entscheidung vom 2026-09-08 in **einem** Punkt geändert. Der Nachtrag in `OPEN_DECISIONS.md` B15 trennt, was dort in einem Satz stand: **keine automatische Erinnerung über einen Versanddienstleister** (unverändert) und **die Terminmail aus dem eigenen Postfach, auf Klick** (neu). **Neu gebaut: CAL-013 Termine per E-Mail** — die Anwendung baut aus den Terminen des Zettels einen fertigen Entwurf und übergibt ihn dem Mailprogramm der Praxis; gesendet wird dort von Hand. Inhalt und Betreff sind auf das Organisatorische begrenzt, der Hinweis auf die fehlende Verschlüsselung steht an der Stelle der Entscheidung, und vermerkt wird **vor** der Übergabe und nur, was auch im Text steht. Aus dem Knopf „Terminzettel" wird „Termine mitteilen". Neu offen: **ANN-041** (`Datenschutz`, Prüfpaket) — offen bleibt der dokumentierte Wunsch je Patient:in (PAT-006). |
| 3.7     | 2026-09-12 | **ANN-037 bis ANN-039 von Jannes bestätigt** — alle drei wie empfohlen. ANN-037 und ANN-038 sind `Praxisprozess` und damit **erledigt**; ANN-039 (`Datenschutz`) bleibt im Prüfpaket und gehört in die Anfrage B2. **E12 Punkt 3 und 4 vorläufig entschieden: der Fahrpuffer kommt erst mit MAP-006** — kein pauschaler Mindestabstand, keine von Hand gepflegten Fahrminuten. **CAL-010b entfällt** als eigene Story und geht samt der Aufrundungsregel aus §8.1 in MAP-006 auf; offen bleiben allein E12 Punkt 1 und 2. **Neu gebaut: CAL-012 Mitteilungsvermerk am Termin** (Folgeauftrag von Jannes, Vorbild iPrax): In der Terminliste der Akte steht hinter jedem Termin, ob und auf welchem Weg er mitgeteilt wurde — persönlich, telefonisch, Terminzettel, E-Mail. Der Vermerk verfällt automatisch mit jeder Terminänderung; der Druck des Terminzettels vermerkt alle aufgeführten Termine. **Die Anwendung verschickt weiterhin nichts** (B15 unverändert). Neu offen: **ANN-040** (`Datenschutz`, Prüfpaket). |
| 3.6     | 2026-09-12 | **CAL-EPIC-003b fertig** (drei Stories): Das 60-Minuten-Terminfenster aus §8.1 wird serverseitig durchgesetzt — beide Schreibpfade, abgeleitetes Ende im Formular, Bestandstermine bleiben gültig und verschiebbar (CAL-010a, ANN-037) · Eine Verordnung wird in **einem** Vorgang zur Terminserie: Anzahl aus dem offenen Kontingent, drei Rhythmen, serverseitige Konfliktprüfung je Zeile, Einzelabweichung, alles oder nichts; der Termin kennt seine Verordnung (CAL-007, ANN-038) · Terminzettel als Druckansicht, nur Druck und kein Versand (CAL-011, `IDEA-PRX-006` überführt, ANN-039). **CAL-010b (Fahrpuffer) bleibt liegen** — E12 Punkt 3 und 4 sind offen; ein pauschaler Wert wäre neben MAP-004 ein zweiter, schlechterer Mechanismus. **Nächster Loop: DAT-EPIC-001**, sobald ADR-017 bestätigt ist; sonst `ABR-EPIC-001` vorziehen. |
| 3.5     | 2026-09-12 | **ANN-034 bis ANN-036 von Jannes bestätigt** — alle drei wie empfohlen. ANN-034 (Absagegrund als codierte Auswahl ohne Freitext) und ANN-035 (No-show unter der Frist der abgesagten Termine, mit Ausfallhonorar keine Löschung) wechseln auf `entschieden (Jannes)` und bleiben als `Datenschutz` beziehungsweise `Recht` **im Prüfpaket**: Die Bestätigung des Projektinhabers ersetzt die Datenschutzprüfung nicht (§15.1 Punkt 5). Beide gehören damit in die Anfrage B2. ANN-036 (`documented` auch aus `confirmed`) ist `Technik` und **erledigt**; er kommt nur zurück, wenn ABR-003 `invoiced` denselben Weg gehen lässt. **Reihenfolge unverändert — CAL-EPIC-003b bleibt der nächste Loop**; CAL-EPIC-003a wartet nur noch auf die Abnahme am eigenen Rechner. |
| 3.4     | 2026-09-12 | **CAL-EPIC-003a fertig** (fünf Stories): Ein Statusfeld mit sechs in V1 erreichbaren Werten nach ADR-018, samt der Umbenennung `scheduled` → `confirmed` quer durch Migrationen, Lesepfade, Filter, Planungsregeln und Oberfläche · Absage nur mit codiertem Pflichtgrund und ohne Rückweg (ANN-034) · „nicht angetroffen" mit Pflichtentscheidung zum Ausfallhonorar, Wiederöffnen und eigener Löschregel (ANN-035) · `documented` setzt die Finalisierung in derselben Transaktion, mit der von ADR-018 verlangten Invariante in beiden Richtungen (ANN-036) · `cancel_staff_day` plant einen ganzen Tag in einem Vorgang um und zeigt danach die Anrufliste (CAL-009, `IDEA-PRX-004` überführt). Neu hinter der Anmeldung maschinell geprüft: `tests/e2e/authenticated/appointment-states.spec.ts`. Der Punkt „Terminstatusautomat" fällt aus der Liste offener Entscheidungen in `ARBEITSBEREICHE.md`. **Nächster Loop: CAL-EPIC-003b.** |
| 3.3     | 2026-09-11 | **Sechs Epics von Jannes abgenommen** (DOK-001 bis DOK-004, VER-EPIC-001, UI-000, MARKE-001, UX-EPIC-001, LOE-EPIC-001) — die Spalte „Abgenommen am" trägt jetzt überall dort ein Datum. Damit ist der Kernprozess zur Hälfte erledigt: Block A des Fortschrittsmodells steht auf 50 Prozent, der Gesamtstand auf **25,3 Prozent** (vorher 23,5). Neu ist dieses Modell selbst — `docs/development/fortschritt.json`, `scripts/fortschritt.mjs` und `pnpm fortschritt` beantworten „wie weit sind wir insgesamt", was die Fortschrittstabelle absichtlich nicht tut; die Gewichte und die drei Festlegungen dahinter stehen im Abschnitt „Eine Zahl für den Gesamtstand". **Reihenfolge unverändert — CAL-EPIC-003a bleibt der nächste Loop**, seine Voraussetzung ADR-018 ist mit PR #26 in `main`. |
| 3.2     | 2026-09-11 | **ADR-018 angenommen** — Jannes hat alle sieben Bestätigungsfragen wie empfohlen entschieden. Nachgezogen wie in 3.1 angekündigt: `PROJECT_PRINCIPLES.md` **Version 0.7** ersetzt in §8 den Satz, der den Zustandsautomaten als offenen Punkt führte, durch die acht Werte und den Hinweis, welche zwei davon nur beschrieben sind (§21, eigener Commit, Änderungsvermerk im Dokument) · **Punkt D („bestätigt") in `OPEN_DECISIONS.md` ist erledigt** · **ANN-005 bleibt in Kraft** und wechselt auf `entschieden (Jannes)`: ADR-018 bestätigt sie ausdrücklich und setzt die §19-Kopplung an die Rechnung, nicht an den Abschluss; Wiedervorlage zurück auf ABR-002. Die Umsetzung selbst ist unverändert **CAL-EPIC-003a** — die Entscheidung ist deren Vorbedingung, nicht ihr Ersatz. **Nächster Loop bleibt CAL-EPIC-003a.** |
| 3.1     | 2026-09-11 | **ADR-018 Terminzustände geschrieben** (Docs-Session, Status vorgeschlagen): ein Statusfeld mit acht Werten, sechs davon in V1 erreichbar — `requested` und `tentative` bleiben beschrieben und ungebaut (Entscheidung vom 2026-09-08) · Übergänge samt Auslöser, `cancelled` und `documented` ohne Rückweg · `documented` und `invoiced` werden vom besitzenden Vorgang in derselben Transaktion gesetzt, nicht abgeleitet, mit getesteter Invariante · Ausfallhonorar als Pflichtkennzeichen am Nichtantreffen, Betrag bleibt bei ABR · Serie ohne eigenen Status · Migration der drei heutigen Werte samt Umbenennung `scheduled` → `confirmed`. Sieben Bestätigungsfragen offen; erst danach werden §8 (§21) und Punkt D geschlossen. Außerdem: der ADR-Index in `CLAUDE.md` führte ADR-018 und ADR-019 nicht, die Aufruftabelle verwies für ADR-018 auf die falsche Zeile — beides berichtigt. **Nächster Loop bleibt CAL-EPIC-003a.** |
| 3.0     | 2026-09-11 | **LOE-EPIC-001 fertig** (fünf Stories): Retention Schedule und Datenklassen an genau einer Stelle — `retention_classes`/`retention_assignments`, jede der 22 Tabellen zugeordnet, ein Test gegen `pg_tables` (ANN-001 verankert, ANN-029 bis ANN-031 neu) · Anker „Abschluss der Versorgung" als ausdrücklicher, rücknehmbarer Vorgang in der Akte, Rollenschnitt ohne `office` (ANN-032) · Legal Hold als expliziter Zustand mit Beginn, Grund, Person und Ende, nur `owner`, ohne Pflegeoberfläche (ANN-033) · täglicher Löschlauf mit vier Regeln, Löschjournal als Nachweis und idempotente Wiederanwendung nach einem Restore · Aufbewahrungsübersicht für `owner` unter Betrieb → Aufbewahrung. Go-live-Blocker 1 in `docs/DEVELOPMENT.md` ist damit auf zwei betriebliche Punkte geschrumpft (pg_cron im Produktivprojekt, Journal-Sicherung im Restore-Verfahren). **Nächster Loop: CAL-EPIC-003a.** |
| 2.9     | 2026-09-11 | **STAFF-EPIC-002 fertig** (fünf Stories): Rechteschnitt nach E10 — Stammdaten `owner` und `office`, Beschäftigungsstatus und Zugänge nur `owner`, Privatangaben folgen dem Leserecht (ANN-024); `PROJECT_PRINCIPLES.md` 0.6 zieht §4.3 und §4.5 nach §21 nach · Zugang einladen, annehmen, zurücknehmen: die Berechtigung entsteht in der Datenbank, das Konto beim Anmeldedienst, und ein Konto ohne offene Einladung bleibt zugriffslos (ANN-025, ANN-026) · Rollen ändern und Zugang sperren mit Aussperrschutz für die letzte aktive Inhaberin · Kennwort zurücksetzen über die Auth-Mails des Providers (B13) · Selbstbedienung „Mein Konto": Kennwort (ANN-027), zweiter Faktor als TOTP, alle Sitzungen beenden (R10) · MFA für `owner` eingerichtet und sichtbar, **nicht** erzwungen (ANN-028; Jannes hat am selben Tag entschieden, die Pflicht erst mit einer feststehenden Domain zu planen). **E10 und E11 erledigt. Nächster Loop: LOE-EPIC-001.** |
| 2.8     | 2026-09-11 | **MARKE-001 — die Anwendung trägt die Marke Own Motion** (auf ausdrücklichen Auftrag, **nicht** aus der Roadmap): Favicon und App-Symbol über byte-gleiche Kopien in `public/marke/` (`src/marke.test.ts` hält die Gleichheit fest, `marke/` bleibt einzige Quelle); `--color-accent` auf die Hauptfarbe `#004429`, Hover auf das Tiefgrün `#042c1b` der Marke (ANN-022) — dunkler statt heller, weil `accent-hover` überwiegend Textfarbe ist; Wortmarke in Kopfzeile und Anmeldemaske, Seitentitel „Own Motion", der Organisationsname entfällt aus der Kopfzeile (ANN-023). Kontrastgate erweitert statt abgeschwächt. Abnahmeschritt MARKE-001 in `docs/abnahme/etappe-1-kernprozess.md`. Offen bleiben die drei Befunde aus `marke/README.md` (Favicon bei 16 px unlesbar, App-Symbole nur als PNG, C2PA-Metadaten) sowie Schrift und Radien. Beim Zusammenführen mit UX-EPIC-001 wurden die beiden Annahmen der Marke von ANN-020/021 auf **ANN-022/023** umnummeriert: Beide Zweige hatten parallel dieselben freien Nummern gegriffen. **Nächster Loop bleibt STAFF-EPIC-002.** |
| 2.7     | 2026-09-11 | **UX-EPIC-001 fertig** (elf Stories): Tagesliste des Hausbesuchstags mit Anschrift, `tel:`-Link und Zugangshinweis · Navigations-Handoff an Google Maps (ANN-018 verankert, nur auf Aktion) · Folgetermin und Vorbelegung „Hausbesuch, ich, heute" · serverseitige Patientensuche von jeder Seite · Tap auf freie Zeit im Kalender · nächste Termine in der Akte · „Behandlung abschließen" in einem serverseitigen Vorgang · Textbausteine (ANN-020) · Textverlust-Schutz und Behebung des VER-003-Restpunkts aus ANN-019 · langer Druck am Finger und Rückgängig-Leiste · Tagesplan im Funkloch lesbar (ANN-021, beantwortet die offene Folgefrage aus ADR-001). **Nächster Loop: STAFF-EPIC-002.** |
| 2.6     | 2026-09-08 | **Produktentscheidungen Terminfenster und Sprachdokumentation** (Docs, kein Code): `PROJECT_PRINCIPLES.md` 0.5 mit §8.1 (60-Minuten-Terminfenster einschließlich Dokumentation, 5-Minuten-Raster, Fahrzeit zusätzlich, Aufrunden auf den Rasterpunkt, Bestandstermine unverändert, serverseitige Durchsetzung) und §6.3 (Sprachdokumentation mit ausdrücklicher Übernahme); ADR-005/006/016 je Fassung 2; CAL-010 in CAL-EPIC-003b zu CAL-010a/CAL-010b präzisiert; VER-003-Restpunkt als konkrete Folgeaufgabe in UX-EPIC-001; E12 und E13 neu offen. **Reihenfolge unverändert — UX-EPIC-001 bleibt der nächste Loop.** |
| 2.5     | 2026-09-08 | **MAP-001:** In-App-Karte, Fahrradrouting und Fahrzeiten sind Produktziel (Convenience hoch priorisiert). ADR-019 Fassung 2: MapLibre + serverseitiger Adapter, PTV Developer als Kandidat für Prototyp/Bewertung, Google nur als Handoff-Ziel, Gate vor Echtdaten; Prüfdokument `providerpruefung-kartendienst.md`; Vertrag `src/lib/location/contract.ts`; ANN-016 bis ANN-018; Etappe T mit MAP-002 bis MAP-006 (`MAP-LOOPS.md`), TOUR-EPIC-001a/b aufgegangen; R12 aufgelöst, R13 neu; E-20/E-21 offen |
| 2.4     | 2026-09-08 | ADR-019 geschrieben. Navigationslink frei — UX-EPIC-001 ohne Vorbehalt. **In-App-Karte und Fahrzeiten blockiert**: Google bietet für die Maps Platform keinen AVV, sondern Controller-Controller-Bedingungen; §3.5 verlangt den AVV als MUSS und §9 ordnet den Kartendienst dort ein. R12 eingetreten, Gegenmaßnahme greift wie vorgesehen (Weg B) |
| 2.3     | 2026-09-08 | Entscheidungsrunde September ausnahmslos entschieden (Historie in `OPEN_DECISIONS.md`): Spur B trägt in „Stand" überall ein Datum, kein Punkt blockiert mehr das Bauen · H4 geändert — Rechnungen ruhen im Ausfall, statt von Hand aus dem Nummernkreis (E2) · E10 entschieden, §4.3/§4.5 werden mit STAFF-EPIC-002 nach §21 nachgezogen |
| 2.2     | 2026-09-07 | Spur B wartet nicht mehr: Jannes entscheidet vorläufig selbst (`vorläufig entschieden (Jannes)`), das löst das Bauen, nicht die Freigabe · M3 und G18 entsprechend **verschärft** — eine Festlegung durch Jannes allein erfüllt das Gate nicht · B9: ein Unternehmen für Heilbehandlung und Personal Training, geht als Festlegung in B4 · B4 um den Gesamtumsatz nach §19 Abs. 3 UStG erweitert · B8 als Auskunft statt Entscheidung gekennzeichnet |
| 2.1     | 2026-09-06 | In Kraft nach den Antworten E-1 bis E-14. Zwei Zeitpunkte statt einem (Gate, Produktionssystem) und die Eröffnung am 01.07.2027 als dritter · kein Altsystem: MIG-000/001, B12 und Parallelbetrieb gestrichen, Rückfall ist der Papierprozess · Meilensteine M0 bis M6 · Risiken · Kapazität kalibriert, März und Juni als Puffer, abgestufte Abweichungsregel mit festem Eröffnungstermin · Kern und Komfort getrennt · Etappe H als Eröffnung · Etappe T Tagesroute und Navigation über Google Maps (TOUR-EPIC-001a/b, ADR-019) · Etappe 2 vor der Eröffnung · Stufe 3 Plattform für Patient:innen und Kund:innen · OPS-007, BETRIEB-001, STAFF-004, G13 · UI-000 und UX-EPIC-001 · CAL-EPIC-003 und ABR-EPIC-002 geteilt · B13, B14, E-13 entschieden · Definition of Done · Fortschritt mit Abnahme-Spalte · Optimierungsrunden · Wochenupdate mit Ampel · Rückfragen E-15 bis E-19 |
| 2.1.1   | 2026-09-06 | Antworten E-15 bis E-19 eingearbeitet: Reihenfolge verbindlich, Kalender nachrangig (Monate als Spätest-Termine) · In-App-Karte über Google Maps Embed API, genehmigt · Personal Training ab 01.07.2027, Stufe 3 nach M6 · Referenz-Screenshot ist ein fremdes Produkt, Nachbau des Umfangs · Reihenfolge Stufe 3 bestätigt · neuer Abschnitt „Sessions starten" mit kopierbaren Aufrufen                                                                                                                                                                                                                                                             |
| 2.0     | 2026-09-05 | Drei Spuren, Zieltermin März 2027, Spur B mit Fälligkeiten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
