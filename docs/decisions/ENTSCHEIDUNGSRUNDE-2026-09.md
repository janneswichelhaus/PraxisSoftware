# Entscheidungsrunde September 2026

Arbeitsdokument, kein Register. Hier stehen **alle offenen Entscheidungen** mit
je einer Empfehlung und einer Zeile zum Ausfüllen. Wenn du durch bist,
übertrage ich die Antworten nach `OPEN_DECISIONS.md`, `ASSUMPTIONS.md` und —
wo nötig — in die Prinzipien nach §21, und **diese Datei wird gelöscht**. Sie
bleibt in der Git-Historie.

**So ist es gemeint.** Jede Entscheidung hier ist nach der Regel vom
2026-09-07 **vorläufig**: sie löst die Arbeit, ersetzt aber keine externe
Bestätigung. Wo eine externe Stelle widerspricht, wird zurückgenommen. Bei
jedem Punkt steht deshalb, **was die Rücknahme kostet** — `klein` (eine
Stelle), `mittel` (ein Modul oder eine Migration), `groß` (mehrere Module oder
Datenumzug). Bei `groß` würde ich lieber warten; das steht dann dabei.

Du musst nicht alles beantworten. **Abschnitt A ist das Dringende** (bis
November). Abschnitt B kann warten, ist aber jetzt schon entscheidbar.
Abschnitt C sind Annahmen, die ich getroffen habe und die nur noch dein Ja
brauchen. Abschnitt D ist das, was nicht du entscheidest — der Vollständigkeit
halber.

Wo ich Rechtsnormen nenne, habe ich sie nachgeschlagen; **ich bin weder
Jurist noch Steuerberater**, und wo ich unsicher bin, steht es da.

---

## A. Fällig bis November — die sechs, die zählen

### A1 · E10 — Wer darf Mitarbeiterdaten schreiben?

**Frage.** Heute darf nur `owner` Mitarbeiterdatensätze anlegen und ändern.
Sollen Office („Mitarbeiterorganisation", §4.3) und Teamleitung
(„Mitarbeiterplanung", §4.5) das auch dürfen — inklusive Rollenvergabe und
Beschäftigungsstatus? Fällig vor STAFF-EPIC-002 (Oktober).

**Empfehlung — dreigeteilt statt ja/nein:**

- **Stammdaten** (Name, Anschrift, Telefon, Arbeitszeitmodell): **Office ja.**
  Das ist wörtlich die „Mitarbeiterorganisation" aus §4.3, und wenn jede
  Adressänderung über dich läuft, wirst du zum Nadelöhr — bei Bus-Faktor 1 ein
  echtes Risiko, kein theoretisches.
- **Rollenvergabe** (wer wird `therapist`, wer `team_lead`): **nur du.** Eine
  Rolle zu vergeben ist Berechtigungsvergabe, also eine Sicherheitsentscheidung
  nach ADR-004, keine Verwaltungstätigkeit.
- **Beschäftigungsstatus** (aktiv / ausgeschieden): **nur du.** Der Wechsel
  sperrt einen Zugang und hat arbeitsrechtliche Wirkung.
- **Teamleitung: nein**, für nichts davon. Die Rolle existiert für Planung. §16
  sagt im Zweifel restriktiver; später öffnen ist billig, zurücknehmen nicht.

**Rücknahme:** `klein` — eine Policy-Funktion je Bereich.

**Meine Entscheidung:**

---

### A2 · B2 — Benennst du einen Datenschutzbeauftragten?

**Frage.** ADR-007 Punkt 4 sagt: bei gesetzlicher DSFA-Pflicht wird ein DSB
benannt. Offen ist, ob du **auch ohne** festgestellte Pflicht einen benennst.
Die Anfrage an die Datenschutzberatung geht diesen Monat raus.

**Was ich dazu gefunden habe.** Die Pflicht nach Art. 37 Abs. 1 lit. c DSGVO
greift bei **umfangreicher** Verarbeitung besonderer Datenkategorien. Der
Erwägungsgrund 91 und die Leitlinien der Art.-29-Gruppe (WP 243) nennen
ausdrücklich den **einzelnen Arzt als Gegenbeispiel** — eine Einzelpraxis gilt
danach regelmäßig nicht als „umfangreich". §38 Abs. 1 BDSG knüpft zusätzlich an
20 Personen mit ständiger automatisierter Verarbeitung. **Wahrscheinlich also
keine Pflicht** — sicher ist das erst mit der Schwellwertprüfung (B2).

**Empfehlung: trotzdem einen externen DSB beauftragen.** Nicht wegen der
Pflicht, sondern wegen der Lage: du verarbeitest Gesundheitsdaten als
Kerntätigkeit, entwickelst die Software selbst, hast keine eigene
Datenschutzexpertise und niemanden, der gegenliest. Genau diese Kombination ist
der Grund, warum du die Punkte hier überhaupt allein entscheiden musst. Ein
externer DSB kostet laufend Geld (grob im niedrigen dreistelligen Bereich pro
Monat, je nach Anbieter — nicht belegt, bitte selbst einholen), ersetzt aber
einen Teil der externen Beratung, die du sonst punktuell einkaufst, und ist der
Ansprechpartner, wenn etwas passiert.

**Rücknahme:** `klein` in der Software (nur Nennung in den
Datenschutzinformationen), aber ein laufender Vertrag — das ist eine
Kostenentscheidung, keine technische.

**Meine Entscheidung:**

---

### A3 · B1 — Der Wortlaut der Zweckbestimmung

**Frage.** Die externe MDR-Prüfung braucht einen Text, den sie prüfen kann. Du
legst ihn fest — als Hersteller im Sinne der MDR bist du das, wer sonst. Die
Prüfung bleibt Pflicht (§17, ADR-006 Punkt 7), aber sie geht schneller und
billiger, wenn sie einen fertigen Satz vor sich hat statt einer offenen Frage.

**Empfehlung — dieser Wortlaut, wörtlich aus §17 und ADR-006 abgeleitet:**

> Die Software dient der Organisation, Dokumentation und Abrechnung
> physiotherapeutischer Leistungen einer privat abrechnenden Praxis. Sie
> erfasst, speichert, strukturiert und stellt Gesundheitsinformationen dar und
> führt transparente mathematische Berechnungen validierter Instrumente durch.
>
> Sie ist **nicht** dazu bestimmt, diagnostische oder therapeutische
> Entscheidungen zu treffen, Therapieempfehlungen zu geben, klinische
> Risikoklassifikationen oder Differentialdiagnosen zu erzeugen oder klinische
> Entscheidungen zu automatisieren. Eingesetzte generative KI dient der
> Dokumentation, sprachlichen Umformung, Zusammenfassung und administrativen
> Assistenz und fügt keine klinische Interpretation hinzu.
>
> Alle klinischen Entscheidungen trifft die behandelnde Therapeutin.

**Warum so.** Der zweite Absatz ist der wichtige: er benennt die Ausschlüsse
positiv, statt sie offenzulassen. Genau daran entscheidet sich die
MDR-Einordnung.

**Rücknahme:** `klein` heute (ein Dokument), `groß` später — wenn die Prüfung
die Abgrenzung anders zieht, betrifft das Features, nicht Text. Deshalb jetzt
festlegen und prüfen lassen, nicht umgekehrt.

**Meine Entscheidung:**

---

### A4 · B4 — Die steuerlichen Grundeinstellungen

**Frage.** Vier Festlegungen, die in die Anfrage an die Steuerberatung gehen
und die Rechnung in ABR-EPIC-001/002a bestimmen. **Hier gilt besonders: das
sind Vorlagen für die Steuerberatung, keine Beratung.**

**A4.1 — Umsatzsteuerliche Einordnung je Katalogposition.**
*Empfehlung:* je Katalogposition ein Steuerkennzeichen führen (ADR-009 Punkt 6
verlangt es ohnehin), Voreinstellung **befreit nach §4 Nr. 14a UStG** für
Heilbehandlung auf Verordnung, **steuerpflichtig** für Prävention,
Selbstzahler ohne Verordnung und Personal Training. Gemischte Fälle: **getrennte
Rechnungen**, nicht eine Rechnung mit zwei Steuersätzen — einfacher zu prüfen,
einfacher zu bauen, und die Trennung von Heilbehandlung und Training ist
ohnehin die Linie, die du sauber halten willst (B9).
*Rücknahme:* `klein`, das Kennzeichen ist ein Feld je Katalogversion.

**A4.2 — Kleinunternehmerregelung nach §19 UStG.**
*Empfehlung:* **in Anspruch nehmen**, solange der Personal-Training-Umsatz
unter der geltenden Grenze bleibt. Begründung: Der Vorsteuerabzug, den du damit
aufgibst, nützt dir im Heilbehandlungsteil ohnehin nichts — §15 Abs. 2 Nr. 1
UStG schließt ihn für steuerfreie Umsätze aus. Es bliebe also nur der Anteil,
der aufs Training entfällt. Dem steht die gesamte Umsatzsteuer-Mechanik
gegenüber: Voranmeldungen, Steuersätze auf der Rechnung, ein zweiter
Hinweistext. **Für die Software heißt das: ein Umsatzsteuer-Status, ein
Hinweistext, keine zwei Steuersätze.**
*Unsicher und ausdrücklich zu fragen:* die geltende Grenze für 2027 (§19 wurde
zum 01.01.2025 geändert) und ob der Gesamtumsatz nach §19 Abs. 3 UStG die
befreiten Heilbehandlungsumsätze tatsächlich vollständig herausnimmt — dann
zählt im Kern nur das Training gegen die Grenze, und die Grenze wird zur
Wachstumsschwelle für den PT-Zweig.
*Rücknahme:* `mittel` — ein Statuswechsel mitten im Jahr zieht sich durch
Rechnungsvorlage und Katalog.

**A4.3 — Format des Rechnungsnummernkreises.**
*Empfehlung:* `RG-JJJJ-NNNN`, je Kalenderjahr neu bei `0001`, lückenlos, die
Nummer wird **erst bei Ausstellung** vergeben (steht schon in ADR-009). §14
Abs. 4 Nr. 4 UStG verlangt eine einmalig vergebene fortlaufende Nummer; das
Jahrespräfix ist branchenüblich und macht eine Lücke sofort sichtbar.
*Rücknahme:* `klein` **vor** der ersten Rechnung, danach faktisch `groß` — ein
Nummernkreis wird nicht rückwirkend umformatiert. Also vor dem 01.07.2027
festzurren.

**A4.4 — Belegfristen.**
*Empfehlung:* keine eigene Festlegung, sondern die gesetzlichen übernehmen
(§147 AO, §257 HGB) und im Retention Schedule als eigene Datenklasse führen,
getrennt von der Patientenakte. Rechnungen und Buchungsbelege folgen der
Steuerfrist, klinische Unterlagen der Behandlungsfrist — die beiden Uhren
laufen unterschiedlich.
*Rücknahme:* `klein`, eine Zeile im Retention Schedule.

**Meine Entscheidung:**

---

### A5 · B14 — Wie entsteht das Rechnungs-PDF?

**Frage.** Browser-Druck aus einer Druckansicht, eine PDF-Bibliothek im
Browser oder eine serverseitige Funktion? Am 2026-09-06 (E-5) hast du
festgelegt, dass ABR-EPIC-002a die Optionen mit Aufwand vorlegt — im November.

**Empfehlung: jetzt nicht entscheiden, aber die Richtung kennen.** Meine
Tendenz ist die **serverseitige Funktion**, und zwar aus einem Grund, der die
anderen beiden Optionen wahrscheinlich ausschließt: Die Rechnung muss nach
ADR-009 und ADR-017 **unveränderbar abgelegt** werden. Ein Browser-Druck
erzeugt eine Datei beim Nutzer, die die Anwendung nie zu sehen bekommt — sie
kann sie also nicht ablegen und nicht garantieren, dass die abgelegte Fassung
die versendete ist. Eine Bibliothek im Browser löst das halb (die Datei
entsteht in der Anwendung), fügt aber eine wesentliche Abhängigkeit hinzu und
verlagert die Erzeugung auf ein Gerät, dessen Schriftarten und Rendering du
nicht kontrollierst.

Das ist eine Tendenz, keine Entscheidung — die Aufwände kenne ich erst mit den
Optionen. Der Punkt ist, dass du im November nicht bei null anfängst.

**Rücknahme:** vor ABR-EPIC-002b `klein`, danach `mittel`.

**Meine Entscheidung (oder: „bleibt bis November offen"):**

---

### A6 · E2 — Was passiert, wenn die Anwendung einen Tag steht?

**Frage.** ADR-012 verlangt ein dokumentiertes Degraded-Verfahren; der Inhalt
ist offen. Seit dem 2026-09-06 ist dieser Papierprozess zugleich der
Rückfallplan der Eröffnung (Roadmap H4), weil es kein Altsystem gibt. Fällig
Januar 2027, aber der Kern ist heute entscheidbar.

**Empfehlung — drei Sätze, die den Rest tragen:**

1. **Der Tagesplan liegt jeden Morgen auf Papier oder als PDF auf dem Telefon**
   — mit Adressen und Telefonnummern. Die Druckansicht dafür existiert seit
   UI-000; es fehlt nur die Gewohnheit. Das ist die einzige Stelle, an der die
   Software etwas beitragen muss.
2. **Dokumentation auf Papier, Nachtrag binnen 24 Stunden** nach ADR-016 mit
   Begründung „Ausfall". Kein Warten bis zur Wiederherstellung.
3. **Rechnungen ruhen.** Keine handschriftliche Rechnung aus dem Nummernkreis,
   solange die Software steht — eine von Hand vergebene Nummer, die das System
   nicht kennt, reißt genau die Lücke, die §14 UStG nicht haben will. Rechnungen
   werden nachgeholt.

Punkt 3 weicht bewusst von der heutigen Formulierung in H4 ab („Rechnung von
Hand mit fortlaufender Nummer aus dem Nummernkreis"). Ich halte das für den
riskanteren Weg: eine Behandlung kann man nachdokumentieren, eine Nummernlücke
nicht heilen. Wenn du das anders siehst, sag es — dann bleibt H4 wie es ist.

**Abbruchkriterien** (wann der Papierprozess endet und du absagst): Datenverlust,
eine Falschzuordnung, oder mehr als ein Tag Ausfall.

**Rücknahme:** `klein`, ein Dokument.

**Meine Entscheidung:**

---

## B. Später fällig, aber jetzt entscheidbar

### B1 · B6 — Werden Touren- und Arbeitszeitdaten zur Leistungskontrolle genutzt?

**Frage.** Ja oder nein. Routenplanung plus Zeiterfassung ergibt ein
lückenloses Bewegungs- und Leistungsprofil deiner Therapeut:innen. Fällig vor
ZK-001 und TOUR-EPIC-001b (Stufe 2).

**Empfehlung: nein — klar, schriftlich, und technisch verankert.** §26 BDSG
setzt der Verhaltens- und Leistungskontrolle enge Grenzen, §20 verbietet dir
schon heute die Live-Ortung. Ein „Ja" wäre begründungs- und (ab einem
Betriebsrat) mitbestimmungspflichtig, würde die DSFA erheblich aufblähen und
dir bei einer Praxis dieser Größe nichts sagen, was du nicht ohnehin weißt. Ein
„Nein" ist die datensparsamere Option (§16), lässt sich technisch abbilden
(Aggregation, kurze Fristen, keine Auswertung je Person) und ist der Satz, den
du deinen Leuten sagen kannst.

**Rücknahme:** `mittel` — das „Nein" wird zu Löschfristen und fehlenden
Auswertungen; ein späteres „Ja" bräuchte neue Daten, aber keinen Umbau.

**Meine Entscheidung:**

---

### B2 · B7 — Fahrzeiten aus dem Kartendienst

**Frage.** Der Navigationslink und die In-App-Karte sind entschieden und
genehmigt. Offen: dürfen **Fahrzeiten je Weg** aus dem Dienst abgerufen und
gespeichert werden?

**Empfehlung: abrufen ja, speichern nein.** Fahrzeit nur zur Anzeige in der
Tagesplanung, im Moment der Planung, nicht persistiert und nie je Person
ausgewertet. Damit hängt der Punkt sauber an B6: keine gespeicherte Fahrzeit
heißt, es gibt gar nichts, woraus sich ein Leistungsprofil bauen ließe. Die
Alternative — Fahrzeiten speichern, um Touren zu optimieren — wäre nützlich,
aber sie erzeugt genau den Datenbestand, den du bei B6 gerade ausschließen
willst.

**Rücknahme:** `klein`, solange nichts gespeichert wird.

**Meine Entscheidung:**

---

### B3 · B9 (Rest) — Personal Training: die sechs verbleibenden Fragen

Dass beides über **ein Unternehmen** läuft, ist seit dem 2026-09-07 vorläufig
entschieden. Was das ausdrücklich **nicht** mitentscheidet, steht hier. Fällig
vor Etappe 8 (Stufe 3), aber jede Antwort formt das Datenmodell — deshalb
lohnt es, sie früh zu haben.

**B3.1 Vertragsart.** *Empfehlung:* Dienstvertrag (§611 BGB) für Training,
Behandlungsvertrag (§630a BGB) nur bei Heilbehandlung. Keine Mischform.
*Rücknahme:* `klein`.

**B3.2 Dokumentationspflicht.** *Empfehlung:* §630f BGB gilt fürs Training
nicht. Trotzdem eine Trainingsdokumentation führen — aber in **eigener
Struktur**, nie in der Patientenakte. Wer nie in Heilbehandlung war, bekommt
keine Akte.
*Rücknahme:* `groß`, wenn erst gemeinsam gespeichert und später getrennt wird.
**Das ist der Punkt, an dem eine frühe Entscheidung am meisten spart.**

**B3.3 Aufbewahrung.** *Empfehlung:* Trainingsdaten **nicht** zehn Jahre.
Vorschlag: **drei Jahre nach Ende der Betreuung**, angelehnt an die
Regelverjährung (§§195, 199 BGB) — das ist der Zeitraum, in dem noch Ansprüche
aus dem Vertrag entstehen können. Rechnungen und Buchungsbelege laufen davon
getrennt auf der Steuerfrist (A4.4).
*Rücknahme:* `klein` (eine Zeile im Retention Schedule), solange die Trennung
aus B3.2 steht.

**B3.4 Rechtsgrundlage.** *Empfehlung:* Für Gesundheitsdaten im Training
**Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO** mit Widerruf, für die
Vertrags- und Abrechnungsdaten Art. 6 Abs. 1 lit. b. Nicht lit. h — der greift
für Heilbehandlung, und das Training ist keine.
*Rücknahme:* `mittel`, ein Einwilligungsmodell im Datenmodell.

**B3.5 Zweckbindung zwischen Akte und Training.** *Empfehlung:* **kein
automatischer Fluss, in keine Richtung.** Aus der Akte ins Training nur auf
ausdrückliche Einwilligung und als **Kopie mit Herkunftsvermerk**, nie als
Verweis. Vom Training in die Akte gar nicht, solange keine Heilbehandlung
läuft. Weil es nur ein Unternehmen und eine `organization_id` gibt, muss diese
Trennung **technisch** entstehen — eigene Tabellen, eigene Rollenprüfung,
eigene Policies nach ADR-004. Sie kann sich nicht mehr an zwei Betrieben
festmachen.
*Rücknahme:* `groß`. **Das ist die teuerste Entscheidung in diesem Dokument.**

**B3.6 Berufsrecht Ernährung.** *Empfehlung:* **vorerst nicht anbieten.**
Ernährungsberatung ist nicht Teil der physiotherapeutischen Ausbildung nach dem
Masseur- und Physiotherapeutengesetz; die Abgrenzung zwischen zulässiger
allgemeiner Information und beratender Tätigkeit ist heikel und
wettbewerbsrechtlich angreifbar. Wenn du es willst, ist es eine eigene
Qualifikation plus eine Frage an den Berufsverband — keine Softwarefrage.
*Rücknahme:* `klein`, es wird nichts gebaut.

**Meine Entscheidung:**

---

### B4 · B15 — Terminerinnerung und Online-Buchung

**Frage.** Über welchen Kanal erinnerst du an Termine, mit welchem Anbieter,
und soll es eine Online-Terminanfrage geben? Stufe 2 nach der Eröffnung.

**Empfehlung: in Stufe 1 und 2 keine automatische Erinnerung — die Anrufliste
bleibt.** Das klingt rückständig, hat aber einen konkreten Grund: Jeder Kanal,
den du automatisierst, ist ein **neuer Dienstleister mit einem
Gesundheitsdatum** — die Information, dass jemand einen Physiotherapietermin
hat, ist bereits eines. Das löst eine Prüfung nach ADR-002, eine
DSFA-Wiedervorlage und eine eigene Einwilligung aus (PAT-006). Am 2026-09-06
hast du dich bei B13 gerade dagegen entschieden, einen zweiten E-Mail-Dienst
einzuführen; eine Terminerinnerung ist keine Auth-Mail und ginge deshalb
**nicht** über den bestehenden Weg.

**Wenn doch, dann E-Mail vor SMS vor Messenger** — in dieser Reihenfolge nimmt
die Zahl der beteiligten Dritten zu. Messenger schließe ich aus.

**Online-Buchung:** eigenes Thema, setzt das Portal und damit B5 voraus. Nicht
in Stufe 2.

**Rücknahme:** `klein` — es wird nichts gebaut, was zurückzunehmen wäre.

**Meine Entscheidung:**

---

### B5 · B5 — Patientenidentität und Vertretung

**Frage.** Wie authentifizieren sich Patient:innen, wie wird ihre Identität
geprüft, wer darf in ihrem Namen handeln? Fällig für das Portal (Etappe 4,
Stufe 3).

**Empfehlung: heute nur den Rahmen entscheiden, nicht das Verfahren.** Das
Verfahren (Zugangscodes, Ausweisprüfung, Verfahren für Hochbetagte) hängt an
einem Portal, das es nicht gibt — dort zu entscheiden hieße raten. Zwei
Rahmensätze sind aber jetzt fällig, weil sie das Datenmodell bestimmen:

1. **Ein Konto gehört einer Person.** Vertretung — Angehörige, Betreuung,
   Eltern Minderjähriger — wird als **eigene Beziehung** modelliert: eigenes
   Konto, ausdrücklich erteilter Zugriff, im Auditlog unterscheidbar. **Niemals
   durch Weitergabe der Zugangsdaten.** Sobald Angehörige das Patientenkonto
   mitbenutzen, ist jede Zurechnung im Auditlog wertlos — und das Auditlog ist
   nach ADR-010 die Kompensation für ziemlich viel anderes.
2. **Der Portalzugang ist nicht automatisch die Einsicht nach §630g BGB.** Die
   Einsicht erfolgt auf Antrag, mit dokumentierter Identitätsprüfung und
   dokumentiertem Umfang. Was im Portal steht, entscheidest du separat.

**Rücknahme:** Rahmensatz 1 später einzuziehen wäre `groß` (Auditlog und
Zugriffsmodell), deshalb jetzt. Alles andere `klein`, weil noch nichts existiert.

**Meine Entscheidung:**

---

### B6 · B11 — Pakete, Vorauszahlung, Rabatte

**Frage.** Wie werden vorausbezahlte Betreuungspakete abgebildet, und welche
Rabatt- und Anreizformen sind zulässig? Fällig vor Etappe 8.

**Empfehlung — zwei getrennte Antworten:**

- **Pakete: vorerst nicht anbieten**, bis B4 zurück ist. Eine Vorauszahlung ist
  kein Preismodell, sondern ein **Guthabenkonto**: Steuerentstehung bereits bei
  Vereinnahmung (§13 Abs. 1 Nr. 1 lit. a Satz 4 UStG), GoBD-Pflichten für das
  Guthaben, Verfall und Laufzeit, und keine gemischten Pakete aus befreiter und
  steuerpflichtiger Leistung. Das ist Buchhaltungsmechanik, die ADR-009 nicht
  kennt — teuer nachzurüsten, wenn man sie falsch anfängt.
- **Rabatt für eine Google-Bewertung: nein.** Die Ideenkarte `IDEA-ANG-002` rät
  bereits ab, und ich schließe mich an: gekaufte Bewertungen sind
  wettbewerbsrechtlich angreifbar (UWG), im Heilbereich kommt das HWG dazu, und
  eine Bewertung, für die bezahlt wurde, ist ihr Geld nicht wert. Wenn du es
  trotzdem willst, vorher anwaltlich prüfen lassen — nicht als Annahme.

**Rücknahme:** `klein`, es wird nichts gebaut.

**Meine Entscheidung:**

---

### B7 · B10 — Automatisierte Progression von Trainingsplänen

**Frage.** Darf die Plattform die Belastung eines Trainingsplans selbsttätig
anpassen? Fällig vor Etappe 9.

**Empfehlung: für V1 ausschließen, und zwar so, dass es hält.** Konkret: Ein
Regelwerk je Plan wird von der Therapeutin freigegeben, **jeder einzelne
Progressionsschritt braucht ihre Bestätigung**, bevor er beim Patienten
ankommt. Damit bleibt die Anwendung auf der richtigen Seite von ADR-006 Punkt 2
(transparente Berechnung) und verletzt Punkt 4 nicht.

**Ein Ampelmodell mit therapeutisch gesetzten Schwellen würde ich nicht bauen**
— eine Ampel *ist* eine Risikoklassifikation, auch wenn die Schwellen von einem
Menschen kommen. Genau das schließt §17 für V1 aus. Diese Frage gehört
ausdrücklich mit an die B1-Prüfung.

**Rücknahme:** `klein` heute (es wird nichts gebaut), `groß` in die andere
Richtung — ein Feature, das die Grenze überschreitet, ist produktiv gesperrt
(`MDR_REVIEW_REQUIRED`) und braucht eine eigene Prüfung.

**Meine Entscheidung:**

---

### B8 · C6 — KI: Schutzumfang

**Frage.** Welchen Schutz leistet Pseudonymisierung bei klinischem Freitext,
und welche vertraglichen Zusagen treten an ihre Stelle? Welcher Anbieter?
Fällig für Etappe 10 (Stufe 3).

**Empfehlung: den Schutzumfang jetzt festlegen, den Anbieter nicht.**

Zum Schutzumfang, und das ist die unbequeme Hälfte: **Pseudonymisierung ist bei
klinischem Freitext kein wirksamer Schutz.** Ein Befundtext identifiziert die
Person über den Inhalt — Diagnose, Beruf, Wohnsituation, Verlauf — auch ohne
Namen. Wer etwas anderes annimmt, baut auf Sand. Die Last tragen deshalb die
**Vertragszusagen**, und die sind die eigentliche Entscheidung:

- Verarbeitung ausschließlich in der EU,
- **keine Nutzung der Eingaben zu Trainingszwecken**, vertraglich zugesichert,
- keine oder sehr kurze Aufbewahrung („zero retention"),
- Auftragsverarbeitungsvertrag nach Art. 28 DSGVO,
- Verpflichtung der Beschäftigten des Anbieters nach §203 StGB — bei
  Gesundheitsdaten der Punkt, an dem die meisten Anbieter ausscheiden.

**Ohne alle fünf kein Anbieter.** Die Auswahl selbst kommt mit Etappe 10 und
läuft dann durch die Prüfung nach ADR-002.

**Rücknahme:** `klein` heute, weil noch nichts angebunden ist.

**Meine Entscheidung:**

---

## C. Annahmen, die nur noch dein Ja brauchen

Diese habe ich beim Bauen getroffen und im Register begründet. Sie laufen
heute produktiv im Code. Ein „passt" genügt; wenn nicht, sag was du anders
willst — alle sind `klein` bis `mittel` zurückzunehmen.

| | Annahme | Empfehlung |
|---|---|---|
| **C1** · ANN-002 | `inactive` ist eine organisatorische Markierung, kein Behandlungsabschluss, startet keine Frist. Wechseln dürfen `owner`, `team_lead`, `office` — `therapist` nicht. | bestätigen |
| **C2** · ANN-005 | Ein Termin lässt sich abschließen, ohne dass eine Dokumentation existiert; die Kopplung „Rechnung erst nach finalisierter Doku" hängt an der Leistung, nicht am Terminstatus. | bestätigen; wird mit ADR-018 verbindlich |
| **C3** · ANN-008 | Die Frist der automatischen Finalisierung ist praxisweit einstellbar (0–30 Tage, **Voreinstellung 1**) und läuft ab dem Behandlungstag, bei Nachträgen ab dem Anlagetag. | bestätigen, **aber die Zahl erst nach den ersten Praxiswochen festzurren** — ADR-016 nennt genau diesen Punkt als den, der am ehesten nachjustiert wird |
| **C4** · ANN-010 | Zugangshinweis, Besonderheit, Bemerkung und feste Therapeut:in sind organisatorische Angaben: für alle vier Praxisrollen **einschließlich Office** sichtbar, **nicht** fürs Patientenkonto, Frist wie die Akte. | bestätigen — den Praxisnutzen-Teil; die Datenschutz-Seite geht an die Prüfung |
| **C5** · ANN-012 | Die genutzte Menge je Verordnungsposition pflegt ihr **von Hand**, bis CAL-007 und ABR-002 sie automatisch fortschreiben. | bestätigen |
| **C6** · ANN-015 | Die Verbindungsanzeige stützt sich allein auf `navigator.onLine`, ohne Ping und ohne Abfragetakt. Preis: ein Gerät hinter einem Anmeldeportal gilt als verbunden. | bestätigen |

**Meine Entscheidung (oder: „C1 bis C6 passen"):**

---

## D. Nicht deine Entscheidung — nur zur Vollständigkeit

Damit die Liste vollständig ist und du weißt, worauf du **wirklich** wartest:

| Punkt | Warum du das nicht entscheiden kannst |
|---|---|
| **B8** Lizenzen (DIGOTOR-Bogen) | Eine **Auskunft des Lizenzgebers**, keine Entscheidung. Zu entscheiden ist nur der Rückfall — bis zur Klärung ausschließlich lizenzfreie Instrumente (NRS, patientenspezifische Funktionsskala, globale Veränderungsfrage). *Empfehlung: so machen, und den Lizenzgeber im Oktober anschreiben.* |
| **A2** Providerprüfung Supabase | Eine **Prüfung nach ADR-002**, kein Beschluss. Fällig 30.09. (M0). Das Dokument dafür schreibe ich, du führst die Prüfung. |
| **B1** MDR-Prüfung selbst | MUSS nach §17 und ADR-006 Punkt 7. Den **Text** legst du fest (A3), die Prüfung entfällt dadurch nicht. |
| **B3** Fristen-Validierung | Läuft im DSFA-Prozess und validiert ANN-001/ANN-002. Du kannst bestätigen, dass die Fristen so **gelten sollen** — das tust du mit C1. |
| **ADR-007** sieben Vorbedingungen | Sieben Dokumente, die vorliegen müssen. Ihren Inhalt entscheidest du, ihr Vorliegen ist nicht ersetzbar. |
| **ADR-017/018/019** | Ich schreibe, du bestätigst. Kommen als eigene Vorlagen — Dateiablage und Terminstatus im September, Kartendienst im Oktober. |

**Eine Vorfrage zu ADR-018 kannst du aber jetzt beantworten:** Sollen die
Zustände „angefragt" und „vorgemerkt" vor dem Portal überhaupt erreichbar sein,
oder nur vorgesehen werden? *Empfehlung: nur vorsehen, nicht bauen* — ohne
Portal gibt es niemanden, der einen Termin anfragt, und ADR-014 sagt „nicht
vorbauen".

**Meine Entscheidung:**

---

## Wenn du durch bist

Schreib deine Antworten hinter die `Meine Entscheidung:`-Zeilen, committe die
Datei und sag Bescheid. Ich übertrage sie dann in `OPEN_DECISIONS.md` (Status
`vorläufig entschieden (Jannes)`), lege für alles, was im Code greift, einen
Registereintrag an, ziehe die Prinzipien nach, wo §21 es verlangt, und lösche
dieses Dokument.

Du musst nicht alles auf einmal. **Abschnitt A und C reichen für den Anfang** —
A, weil es bis November fällig ist, C, weil es heute schon läuft.
