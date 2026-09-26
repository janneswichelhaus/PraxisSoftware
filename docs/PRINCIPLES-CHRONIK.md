# Chronik von PROJECT_PRINCIPLES.md

Die Änderungsvermerke aller Versionen, ausgelagert mit 0.17, damit das Dokument selbst nur den
geltenden Stand trägt. Neueste Version zuerst. Ältere Vermerke beschreiben den Stand ihrer Zeit und
werden nicht nachträglich geändert; wer den damaligen Wortlaut braucht, findet ihn im Git-Verlauf.

## Änderungsvermerke

### Änderungsvermerk 0.18

Nachzug an Rang 2 nach der Annahme von ADR-017 Fassung 2 (Abschnitt G) durch den Projektinhaber am
2026-09-26, erster Schritt von DOK-006. Geändert ist nur **§5**, Absatz „Fotos":

- **Fotos von Patient:innen** sind nicht mehr „vorgesehen, aber noch nicht freigegeben", sondern
  freigegeben. Die Aufnahme über die Kamera der Anwendung ist für sie ein MUSS; für die übrigen
  Aufnahmen des Teams bleibt es beim SOLLTE.
- Die eigene Einwilligung bleibt Voraussetzung; neu steht dort, dass niemand ohne sie schlechter
  behandelt wird.
- Neu ist die Regel „ein Foto ersetzt keinen Eintrag" mit dem Verweis auf §17: Den Unterschied
  zweier Fotos bewertet die Therapeut:in, nicht die Anwendung.
- Der Satz, Frist und Aufnahmemetadaten entscheide „der Loop, der sie baut", entfällt; das regelt
  jetzt ADR-017 Abschnitt G.

Keine andere Leitplanke ändert sich. Die Tabelle in §21 nennt ADR-017 bereits bei §5.

### Änderungsvermerk 0.17

Umbau U1 nach dem Produktgespräch vom 2026-09-23 (`docs/development/UMBAU.md`).
**Eingearbeitet statt angehängt**, und die Änderungsvermerke stehen seitdem in
dieser Chronik statt am Ende des Dokuments.

- **§14** neu gefasst als „Umfang und Skalierbarkeit": ein Text mit dem Umfang
  vom 2026-09-22. Die ältere Sperre für Training und Abonnements und die
  „eng gefasste Aufhebung für Online Coaching" entfallen, weil der Umfang sie
  ersetzt.
- **§4.6** Plattformstufen: während der Behandlung ohne Entgelt, danach
  Nachsorge-Abo; Terminanfrage ist ein Wunsch; Identitätsprüfung und
  Vertretung mit ADR-023. **§4.10** Ansicht der Trainingskund:innen, Paket nach
  Zeitraum, Übergang aus der Behandlung.
- **§1** Betriebsbild (keine Räume, Hausbesuch per Rad, Verweis auf die
  Produktbeschreibung); **§1.2** Ort des Trainings und Übergang aus der
  Behandlung.
- **§2.2** zwei neue SOLLTE: Die Oberfläche zeigt, was der nächste Schritt
  braucht; Beschriftungen folgen der Sprache der Praxis.
- **§4** Einleitung: Der Praxisinhaber SOLLTE neue Teammitglieder selbst
  einbinden können (heute noch ANN-025). **§4.3, §4.4** Verlaufsnotizen zu E15
  und C1 entfernt, Inhalt unverändert.
- **§5** Fotos der Verordnung und von Papierbögen in die Akte; Aufnahmen des
  Teams SOLLTEN über die App-Kamera entstehen; Fotos von Patient:innen
  vorgesehen, aber nach ADR-017 Punkt 30 noch nicht freigegeben. Neues MUSS:
  Wo Sprachdokumentation angeboten wird, gibt es denselben Weg ohne Sprechen.
  Erstaufnahme bleibt sichtbar offen (SOLLTE).
- **§6.1** Gateway ab dem ersten KI-Feature, auch mit Mock. **§6.3** ohne
  „kein Implementierungsauftrag"; Tastaturdiktat nicht als Weg angeboten.
- **§7** Befundbogen vorab über die Plattform oder als Foto.
- **§8** Terminanfrage als Wunsch; Terminvorschläge ohne „spätere
  Ausbaustufe"; Länge frei ohne den widersprechenden Satz „genau zwei Längen";
  Fahrpuffer mit MAP-006, offen nur E12 Punkt 3a; Verweis §6 → §5.
- **§9** Tagesroute mit Vorschau; neues MUSS: Bedarf der Behandlungsliege
  beim Tagesstart erkennbar.
- **§10** Die Zuordnung klinischer Inhalte zur Akte ist als MUSS formuliert
  (vorher „bleibt Pflicht").
- **§14** zusätzlich gesperrt: Gesundheits-Apps, wie in der Roadmap unter
  „Nicht in V1" neben den Wearables.
- **§17** Verweise ohne Fassungsnummer, Inhalt unverändert.
- **§15** Die Liste „Eine Annahme DARF NICHT" steht bei §15.1; §15.2 mit den
  Anfragen ab Anfang 2027 parallel zum Bauen.
- **§19** abrechenbare Ereignisse (nicht abschließend): Termin,
  Gebührenanlass, Trainingsleistung, Paket, Nachsorge-Abo im Bereich
  `therapy` ab Ende der Behandlungsgrundlage; „ausschließlich aus dokumentiert"
  gilt für den Behandlungstermin, ebenso in §8.
- **§21** Änderungen ersetzen den Text an seiner Stelle; Vermerke in dieser
  Chronik; `docs/STATUS.md` richtig verortet.
- Verlaufsnotizen („Bis Version 0.9 galt …", „seit 0.11", „überholt durch E15")
  aus dem normativen Text entfernt.

### Änderungsvermerk 0.16

Eine Entscheidung des Projektinhabers vom 2026-09-22: **Zur Eröffnung soll das
Endprodukt laufen.** Geändert ist allein **§14**; keine Korrekturversion (§21),
weil sich die Reichweite einer Sperre ändert.

- **Freigegeben** sind der Trainingsbereich selbst (bis 0.15 ausdrücklich
  ausgenommen), die Plattform für Patient:innen und Kund:innen, die §4.6 und
  §4.10 seit Langem beschreiben, und ein Abonnement der Patient:innen für diese
  Plattform als Monatsrechnung der Praxis.
- **Präzisiert** ist das Wort „Abonnements": gemeint war und bleibt das
  Abrechnungsmodell der Software für Dritte (ADR-014, Negativliste). Das
  Portal-Abo einer Patientin ist eine Leistung der Praxis, kein SaaS-Vertrag.
- **Nicht geändert:** §17 mit seinen drei Verboten, §20 samt §20.1, die
  Sperren für Wearables, Standorte und Vermarktung, und §15.2 — die
  Freigabe betrifft das Bauen, das Scharfschalten hängt weiter an den
  Prüfungen vor dem Go-live-Gate.

### Änderungsvermerk 0.15

Eine Entscheidung des Projektinhabers vom 2026-09-22: **Offene externe
Klärungen sollen das Bauen nicht länger anhalten.** Die Version fügt **§15.2**
hinzu und ist damit keine Korrekturversion (§21).

- **Was §15.2 festlegt.** Eine ausstehende Antwort von außen blockiert das
  **Scharfschalten**, nicht das **Bauen**. Eine Spezifikation DARF eine offene
  externe Klärung nicht zur Startbedingung eines Loops machen; sie wird zur
  Bedingung des Go-live-Gates (§3.7, ADR-007 Punkt 5). Ein Zuschnitt, der das
  Bauen an eine externe Antwort bindet, ist neu zu schneiden.
- **Das ist keine Lockerung, sondern die Auflösung eines Widerspruchs.**
  ADR-007 Punkt 6 erlaubt Entwicklungsarbeiten vor Abschluss der DSFA,
  solange ausschließlich synthetische Daten verwendet werden — seit 2026-09-05.
  §15.1 Ziffer 5 verlegt die Validierung von Annahmen ohnehin auf „vor
  Produktivstart". Mehrere nachgelagerte Dokumente hatten daraus trotzdem
  **Startbedingungen einzelner Loops** gemacht (ADR-019 Punkt 25 und 32,
  `MAP-LOOPS.md`, `OPEN_DECISIONS.md` B7). Das war ein Abweichen nach unten,
  nicht nach oben; §15.2 stellt es richtig und macht die Regel ausdrücklich,
  damit die Abweichung nicht wiederkehrt.
- **Was NICHT geändert wurde.** Die Verbotsliste aus §15.1 steht unverändert:
  echte Patientendaten, Produktionscredentials, Secrets, Produktivdeployment,
  neuer Anbieter, Aufweichen von Schutzmaßnahme, Test oder Gate. Die sieben
  Vorbedingungen aus ADR-007 Punkt 5, die DSFA und die Prüfung nach §3.7
  entfallen nicht — sie rücken an die Stelle, an der sie wirken: vor den
  Produktivstart.
- **Der Preis steht im Text.** Eine späte externe Antwort kann eine gebaute
  Annahme widerlegen. §15.2 verschärft dafür Ziffer 4: **jede so getragene
  Annahme MUSS an genau einer Stelle reversibel verankert sein.** Wer das
  unterlässt, hat nicht schneller gebaut, sondern nur später umgebaut.

### Änderungsvermerk 0.14

Der **Nachzug an Rang 1** zu ADR-019 Fassung 3, fachlich entschieden vom
Projektinhaber am 2026-09-22. Die Version fügt **§20.1** hinzu und ist damit
keine Korrekturversion (§21). Geändert wird **nur** §20; alle übrigen
Paragraphen bleiben Wort für Wort, wie sie in 0.13 standen.

- **§20.1 neu — Navigationsführung auf dem Gerät.** Eine Führung während der
  Fahrt ist zulässig, wenn sie vier Bedingungen **kumulativ** erfüllt:
  Position nur auf dem Gerät, Start nur auf Aktion und jederzeit abbrechbar,
  Übermittlung an den Kartendienst nur zur Neuberechnung, keine Auswertung
  und kein Bewegungsprofil. Dazu ein ausdrückliches DARF-NICHT: Der
  Arbeitgeber darf aus der Funktion **keinen Standort ableiten können** —
  unabhängig davon, ob er es täte.
- **Was ausdrücklich NICHT geändert wurde.** Der Satz „Eine permanente GPS-
  oder Live-Ortung von Mitarbeiter:innen findet NICHT statt" steht
  unverändert und ist durch §20.1 **nicht** eingeschränkt. §20.1 beschreibt
  eine Funktion, die gerade keine Ortung ist, weil niemand außer der
  fahrenden Person je erfährt, wo sie ist. Wäre sie eine, wäre sie nicht
  gedeckt.
- **Warum überhaupt.** Die Nachfrage des Projektinhabers am 2026-09-22 zielte
  auf eine Führung innerhalb der Software. Die Prüfung ergab, dass der
  Kartendienst eine Führung nicht als Auftragsverarbeitung liefert (ADR-019
  Abschnitt F) — sie wäre also ohnehin im Browser zu bauen. Genau das macht
  den engen Zuschnitt möglich: Eine Führung auf dem Gerät braucht keine
  Ortung durch die Praxis, und deshalb wird dieser Paragraph präziser statt
  schwächer. Eine Fassung, die die Ortung erlaubt hätte, wurde erwogen und
  verworfen: Sie hätte für dieselbe Funktion die Leitplanke gekostet.
- **Was daran offen bleibt.** Ob die vier Bedingungen rechtlich ausreichen,
  ist eine Frage an die Datenschutzberatung (**B2**, erweitert). Bis zu ihrer
  Antwort gilt dieser Paragraph, und kein Loop baut die Führung: ADR-019
  Punkt 32 setzt sie ohnehin hinter MAP-006 und hinter das Gate.

### Änderungsvermerk 0.13

Der **Nachzug an Rang 1** aus E18 — Schritt 5 von sieben, fachlich entschieden
vom Projektinhaber am 2026-09-17, jetzt fällig, weil die vier ADRs darunter
seit dem 2026-09-20 stehen (ADR-021, ADR-022, ADR-006 Fassung 3, ADR-009
Fassung 2). Die Version fügt MUSS- und DARF-NICHT-Aussagen in §1, §4, §14 und
§17 hinzu und ist deshalb keine Korrekturversion (§21).

- **§1.2 neu — zwei Leistungsbereiche.** Die Software deckt Heilbehandlung und
  Leistungen ohne Heilbehandlungszweck ab; getrennt wird nach
  **Rechtsverhältnis, nicht nach Person**, und das Datenmodell MUSS die
  Trennung erzwingen. Im Zweifel gilt das strengere Behandlungsregime — für
  Schutz, Zugriff, Dokumentation und Frist. **Ausdrücklich nicht** für die
  steuerliche Einordnung: Dort hängt das Kennzeichen am Posten (ADR-009
  Punkt 15), und ein im Zweifel gewähltes „steuerfrei" wäre eine falsche
  Angabe, keine Vorsicht.
- **§4.8 neu — „Zugriff folgt dem Verhältnis, nicht der Person."** Der Satz im
  Wortlaut vom 2026-09-17, normativ gefasst: Jede Rolle benennt ihren Bereich,
  aus einer Rolle des einen folgt kein Zugriff auf den anderen, durchgesetzt in
  den Policies und in der RLS statt in der Oberfläche, Übernahme nur als
  dokumentierte Kopie, Auditpflicht beidseitig. Die Ziffer steht **über** allen
  Rollen und in keiner. Die Tabelle dort ordnet jede vorhandene Rolle einem
  Bereich zu; dabei ist eine Lücke geschlossen worden, die bisher niemand
  beantwortet hatte: **Office sieht im Training nur Organisatorisches**
  (Termin, Vertragsstatus, Leistung, Rechnung, Zahlung) — Screening- und
  Gesundheitsangaben bleiben gesperrt, bis die DSFA sie bewertet (B2, §16).
- **§4.9 neu — Trainingsbetreuung.** Die Rolle, ohne die „kein Durchgriff" eine
  unbesetzte Grenze blieb (ADR-021, Konsequenzen). Sie führt Verhältnis,
  Termin, Trainingsgrundlage und Protokoll und sieht **keine** Akte, keinen
  Befund, keine Verordnung. Ihr Bezeichner im Code bleibt Sache des SPEC
  (ADR-014); dieses Dokument legt den Schnitt fest, nicht den Schlüssel.
- **§4.10 neu — Trainingskund:in**, das Gegenstück zu §4.6: eigene Daten des
  Trainingsverhältnisses, Konto und Verhältnis getrennt wie dort, eigene Frist
  nach ADR-021 Punkt 4. Bei einer Person mit beiden Verhältnissen bleiben die
  Bereiche auch in ihrer eigenen Sicht getrennt. §4.6 sagt jetzt außerdem, dass
  der dort genannte Trainingsplan die **Heimübungen der Behandlung** meint und
  nicht das Trainingsverhältnis.
- **§14 — eng gefasste Aufhebung.** Online Coaching ist aus der Sperrliste
  freigegeben, **begrenzt auf Terminkontext, Trainingsverhältnis und die
  Abrechnung der Trainingsleistung**. Alle übrigen Einträge bleiben gesperrt,
  der Trainingsbereich selbst ist nicht freigegeben, und auch das Freigegebene
  entsteht nur mit konkretem Auftrag. Die Enge ist der Punkt — sonst reißt eine
  Freigabe die ganze Liste auf.
- **§17 — Zweckbestimmung als eigener Satz** und über beide Bereiche: Die
  Software trifft keine diagnostischen oder therapeutischen Entscheidungen und
  schlägt keine vor. Die drei Feature-Verbote aus ADR-006 Fassung 3 stehen
  jetzt als DARF-NICHT-Aussagen an Rang 1 und sind Ausschlusskriterien; ein
  Feature-Flag ersetzt die Prüfung nicht. Die **Auslegung** — wo die Kante
  jedes Verbots verläuft — bleibt in ADR-006, damit nicht zwei Texte dasselbe
  behaupten und auseinanderdriften.
- **§21:** ADR-021 und ADR-022 tragen zusätzlich §1.2; der Rollenschnitt des
  zweiten Bereichs ist als Produktentscheidung benannt, wie schon der in §4.3.

**Nicht Gegenstand dieser Version:** kein Code, kein Schema, keine Migration,
kein Test. Die zweite Verhältnistabelle, der Terminkontext, der Rollenschlüssel
im Code, die getrennten Nummernkreise und der § 14c-Riegel entstehen erst in
den Loops, die sie bauen — Schritt 6 schneidet sie. Ebenfalls offen: der
Trainingsbereich selbst (Schritt 7), **BEF-019** und die Frage, wo
`MDR_REVIEW_REQUIRED` im Code geführt wird. Extern zu bestätigen bleiben B2
(Trennung, Einwilligung, Screening-Frist, Office-Sicht im Training), B4 und B9.

### Änderungsvermerk 0.12.2

Korrekturversion, ändert keine Leitplanke. **ADR-022** (Terminkontext und
Trainingsgrundlage: ein Kalender, ein Kontext je Termin) ist am 2026-09-20 vom
Projektinhaber angenommen und steht deshalb in der Tabelle in §21. Der ADR
ändert keine Aussage dieses Dokuments, er zieht in vier Paragraphen eine
Grenze: Der Kalender aus §8 trägt künftig drei Kontexte statt zwei, und der
Zustandsautomat gilt unverändert, wird aber je Kontext gelesen; die
Dokumentationspflicht aus §5 gilt allein am Behandlungstermin, und ein
Trainingstermin kann keinen Eintrag erzeugen — durchgesetzt in der Datenbank,
nicht in der Oberfläche (§4.7); die Policies auf dem Kalender filtern nach
Kontext (§4); und die Löschung nach §18 trifft künftig zwei Fristen in einer
Tabelle und muss deshalb **je Zeile am Kontext** greifen, nicht je Tabelle.

**Nicht Gegenstand dieser Version:** das konkrete Schema, der Trainingsbereich,
das Trainingsprotokoll als Funktion, die Trainingsrolle und der Nachzug an §1,
§4 und §14 — Schritt 5 aus E18, unverändert offen. Die Grenze aus §4 ist damit
weiter gezogen, ohne dass jemand auf der anderen Seite steht (ADR-022,
Konsequenzen).

### Änderungsvermerk 0.12.1

Korrekturversion, ändert keine Leitplanke. **ADR-021** (Leistungsbereiche und
Rechtsverhältnisse: Behandlung und Training getrennt) ist am 2026-09-20 vom
Projektinhaber angenommen und steht deshalb in der Tabelle in §21. Der ADR
ändert keine Aussage dieses Dokuments, er wendet sie an: Rechtsgrundlage,
Datenklasse und Frist hängen am **Rechtsverhältnis** und nicht an der Person
(§14, §18); der Ausschluss des Durchgriffs zwischen beiden Bereichen wird in
den RLS-Policies durchgesetzt und nicht in der Oberfläche (§4.7); und für
Behandlung wie Training gilt **ein** Schutzniveau, das höhere — genau das sagt
§1.1 seit 0.12.

**Nicht Gegenstand dieser Version:** der Nachzug an §1, §4 und §14
einschließlich der Trainingsrolle und des Gegenstücks zu §4.6. Er ist
Schritt 5 aus E18 und kommt, wenn ADR-022, ADR-006 und ADR-009 darunter
stehen. Bis dahin bleibt die zweite harte Regel eine Grenze, die keine Rolle
besetzt (ADR-021, Konsequenzen).

### Änderungsvermerk 0.12

Eine Festlegung des Projektinhabers vom 2026-09-17. Sie fügt eine
MUSS-/DARF-NICHT-Aussage hinzu und braucht deshalb eine eigene Version (§21).

- **§1.1 neu:** Personen werden mit **Klarnamen** geführt; eine
  pseudonymisierende Codearchitektur wird nicht eingeführt. Das Schutzniveau
  liefern Zugriffskontrolle, Auditpflicht und Verschlüsselung. Es gilt für
  alle Personen gleich — zwei Datenschutzniveaus in einer Anwendung DÜRFEN
  NICHT entstehen. Das ist keine Absenkung gegenüber dem gebauten Stand,
  sondern seine ausdrückliche Bestätigung: Klarnamen in `persons` gibt es seit
  der Gründungsmigration, geschützt über RLS und Auditpflicht.
- **Warum in §1 und nicht in einem ADR:** Die Aussage bestimmt Datenmodell,
  Oberfläche, Abrechnung und Kommunikation gleichermaßen. Ein ADR stünde
  darunter.
- **Anlass** ist E18 (zwei Leistungsbereiche,
  `docs/development/E18-LEISTUNGSBEREICHE.md`): Für das Trainingsverhältnis
  war zu klären, ob dort ein anderes Niveau gilt. Es gilt dasselbe.
- **Nicht Gegenstand dieser Version:** die übrigen Nachzüge aus E18 in §1, §4
  und §14. Sie kommen gemeinsam, wenn die ADRs darunter stehen.

### Änderungsvermerk 0.11.2

Korrekturversion, ändert keine Leitplanke. Die Hausbesuch-Szenarien in **§8**
sind mit **CAL-018** (2026-09-16) gebaut; der Umsetzungsvermerk dort sagt das
jetzt, statt den Bau anzukündigen. Die MUSS-Anforderungen des Abschnitts
bleiben Wort für Wort, wie sie mit 0.10 festgelegt wurden. Ergänzt ist eine
Abgrenzung, die der Bau sichtbar gemacht hat: Für Termine außerhalb des
Hausbesuchs trifft E14 keine Aussage, dort gilt weiter der Stand aus 0.8
(Nichtantreffen als Vermerk ohne Gebühr) — als Annahme **ANN-055** registriert
und bei Jannes zur Wiedervorlage. Außerdem berichtigt: Die Dokumentinformation
nannte noch „ADR-001 bis ADR-019", obwohl ADR-020 seit 0.11.1 in §21 steht.

### Änderungsvermerk 0.11.1

Korrekturversion, ändert keine Leitplanke. **ADR-020** (Behandlungsgrundlage:
Verordnung und Selbstzahler unter einer Klammer) ist am 2026-09-16 vom
Projektinhaber angenommen und steht deshalb in der Tabelle in §21. Der ADR
führt §14 und §19 für die Planungsklammer aus, ohne eine Aussage dieses
Dokuments zu ändern: Leistungen bleiben unabhängig von Rechnungen (§19), und
das Kontingent bleibt gegen die Abrechnung geschützt (§13). `OPEN_DECISIONS.md`
E16 ist geschlossen; gebaut wird es in GRD-001.

### Änderungsvermerk 0.11

Eine Festlegung des Projektinhabers vom 2026-09-16 zur Terminlänge. Sie ändert
eine MUSS-Anforderung und braucht deshalb eine eigene Version (§21). Anlass
ist der Vergleich mit der heute benutzten Praxissoftware
(`docs/product/ideen/referenz-iprax.md`); gebaut wird sie in **CAL-020**
(`docs/development/CAL-EPIC-004.md`).

- **§8.1 geändert:** Die Länge eines Behandlungstermins ist **frei wählbar**,
  mindestens ein Rasterschritt, Ende nach Beginn. Was vorher galt („60 oder
  45, andere Längen nicht zulässig, serverseitig geprüft"), steht in der
  Vorversion. **60 bleibt die Vorbelegung**, 45 die zweite Regellänge.
- **§8.1 ergänzt:** Weicht die Länge eines Behandlungstermins von 45 oder 60
  Minuten ab, MUSS die Anzeige das kennzeichnen — im Kalender und in jeder
  Terminliste, ohne Farbe allein, und nur für Termine mit Patient:in. Damit
  wandert die Durchsetzung von der Schranke zur Sichtbarkeit: Die Praxis soll
  abweichen dürfen, aber nicht versehentlich.
- **Folgen:** **E12 Punkt 1** ist neu beantwortet (frei statt zwei Längen) und
  **Punkt 2** (Länge je Praxis einstellbar) damit gegenstandslos. **ANN-037**
  verliert ihren Gegenstand, sobald CAL-020 gebaut ist — bis dahin gilt sie
  unverändert. Die serverseitigen Tests aus CAL-010a und CAL-015b werden
  umgeschrieben, nicht gelöscht: Sie prüfen danach die Annahme **und** die
  Kennzeichnung.
- **Unverändert:** die Fahrzeitregel samt Aufrundung, das Praxisraster, der
  Ausschluss eines eigenen Dokumentationsblocks, die Abgrenzung der Termine
  ohne Behandlung, §8 im Übrigen, §13, §19 und der Rollenschnitt in §4.

### Änderungsvermerk 0.10.2

Korrekturversion, ändert keine Leitplanke. Der Satz am Ende von §4.3 („Umgesetzt
wird der Rollenschnitt in ROL-EPIC-001; bis dahin gilt der gebaute Stand")
nennt jetzt den Umsetzungsstand: Der Rollenschnitt aus E15 ist mit
ROL-EPIC-001 gebaut (PR #41, 2026-09-15). Dieselbe Nachführung steht in
ADR-004, ADR-016, ADR-017 Punkt 12 und `OPEN_DECISIONS.md` E15.

### Änderungsvermerk 0.10.1

Korrekturversion nach dem Muster von 0.2.1. Sie behebt ausschließlich
Widersprüche und Dopplungen, die die Konsolidierung R2 gefunden hat, und
ändert keine einzige Leitplanke:

- **§21 trägt jetzt die Rangfolge.** Die sechsstufige Ordnung stand bisher nur
  in `CLAUDE.md` — einem Dokument ohne Rang. Damit hing die Regel, welches
  Dokument gewinnt, an einer Stelle, die selbst nicht verbindlich ist.
  `CLAUDE.md` verweist jetzt hierher. Inhaltlich ist die Ordnung unverändert;
  neu benannt sind nur die Ränge 3 (Feature-Spezifikation), 5
  (`PRODUCT_VISION.md`) und 6 (`docs/product/`), die vorher ungeschrieben
  galten, sowie die Feststellung, dass `docs/development/` keinen Rang hat.
- **Die ADR-Tabelle nennt keine Fassungen und keinen Status mehr.** Sie stand
  in zwei Dokumenten, und beide waren nicht deckungsgleich: ADR-013 Fassung 2
  fehlte hier. Fassung und Status führt ab sofort allein
  `docs/adr/README.md`; die Tabelle hier ordnet ADR zu Paragraph.

Nicht Teil dieser Version: eine Kürzung des Dokuments. Mit 1 550 Zeilen wird
es selten ganz gelesen, und was selten ganz gelesen wird, wird zur
Dopplungsquelle (§16). Eine Kürzung ohne Regeländerung ist Arbeit einer
eigenen Docs-Session und gehört nicht in eine Korrekturversion.

### Änderungsvermerk 0.10

Drei Festlegungen des Projektinhabers vom 2026-09-13 und die Bereinigung aus
dem Dokumentations-Audit vom selben Tag. Zwei davon ändern MUSS-Anforderungen
und brauchen deshalb eine eigene Version (§21):

- **§4.3 und §4.4 geändert (E15):** Office hat lesenden Zugriff auf alle
  klinischen Inhalte einer Patientenakte im selben Umfang wie
  Therapeut:innen. Der Satz „Office hat standardmäßig KEINEN Zugriff auf
  klinischen Freitext" entfällt; der Behandlungsnachweis bleibt als
  datensparsame Sicht, ist aber keine Zugriffsgrenze mehr; der fallbezogene
  Sonderzugriff entfällt. C1 (Diagnosetext gesperrt) und die „akzeptierte
  Ausnahme" aus C2 (§10) sind damit überholt. ADR-004 Fassung 2 zieht nach;
  umgesetzt wird der Rollenschnitt in ROL-EPIC-001. Die datenschutzrechtliche
  Bewertung (Need-to-know, DSFA) geht in die Anfrage B2.
- **§8 ergänzt (E14 erledigt):** drei verbindliche Hausbesuch-Szenarien —
  Tür geöffnet ohne Behandlung gilt als durchgeführt mit Pflichtvermerk und
  normaler Abrechnung; Nichtantreffen nach Protokoll (15 Minuten, Klingeln,
  Anruf) löst eine Ausfallgebühr aus; Absage unter 24 Stunden unverändert.
  Die Anwendung führt erklärend durch die Szenarien. ADR-018 Fassung 3;
  gebaut wird das in CAL-018.
- **§19 präzisiert, nicht geändert:** In V1 gibt es keinen Override;
  fakturiert wird aus „dokumentiert" oder aus einem Vorgang mit
  Gebührenanlass (ADR-018). Der bisherige Wortlaut ließ offen, ob ein Override
  existiert; ADR-018 hatte ihn stillschweigend ausgeschlossen.
- **§4.2 präzisiert:** Wer das Auditlog liest, ist mit ADR-010 Fassung 2
  festgelegt (Praxisinhaber, eigener auditierter Lesepfad); der Satz „als
  offene Folgefrage geführt" entfällt. Die Auditpflicht gilt ausdrücklich
  auch für lesende Zugriffe des Office.
- **§10 ergänzt:** Folge von E15 für die Patientenkommunikation.
- **§21 ergänzt:** ADR-019 (Kartendienst) ist am 2026-09-13 angenommen
  (E-20) und steht in der Tabelle; `docs/decisions/OPEN_DECISIONS.md` ist
  ausdrücklich ohne Rang.
- **Korrekturen:** toter Verweis auf ADR-012 in §4.3 berichtigt; die
  Änderungsvermerke stehen ab dieser Version am Ende des Dokuments, damit der
  normative Text mit §0 beginnt.
- **Unverändert:** §3, §6, §8.1, §12, §13, §16, der Rollenschnitt in §4.1,
  §4.5 und §4.6.

### Änderungsvermerk 0.9

Zwei Festlegungen des Projektinhabers vom 2026-09-12 zum Kalender, beide in
§8.1. Sie ändern eine MUSS-Anforderung und brauchen deshalb eine eigene
Version (§21):

- **§8.1 geändert:** Ein Behandlungstermin hat **60 oder 45 Minuten**. 60
  bleibt die Vorbelegung; eine dritte Länge lässt der Server nicht zu. Damit
  ist **E12 Punkt 1** beantwortet — es gibt eine Abweichung, aber keine freie
  und keine begründete. Was vorher galt („MUSS 60 Minuten"), steht in der
  Vorversion; Bestandstermine bleiben unverändert gültig (die Abgrenzung aus
  ANN-037 gilt weiter).
- **§8.1 ergänzt:** Termine, die **keine Behandlung** sind — Besprechungen,
  Teamtermine, andere Ereignisse des Praxisbetriebs — fallen nicht unter die
  Fensterregel. Beginn und Ende sind im Praxisraster frei. Sie haben weder
  Patient:in noch Verordnung und DÜRFEN keine abrechenbare Leistung erzeugen.
  Damit bekommt §19 eine Abgrenzung, die es vorher nicht brauchte, weil es
  keine terminlosen Termine gab.
- **Unverändert:** die Fahrzeitregel samt Aufrundung, das Praxisraster, §8 im
  Übrigen und der Rollenschnitt.

Gebaut wird das in CAL-015.

### Änderungsvermerk 0.8

Der Projektinhaber hat am 2026-09-12 zwei Dinge festgelegt, die §8 bis dahin
offen ließ: **eine Patientenabsage weniger als 24 Stunden vor
Behandlungsbeginn löst eine Ausfallgebühr aus**, und **eine beim Hausbesuch
nicht angetroffene Person wird mit einem Vermerk abgehakt** — ohne
Gebührenentscheidung in diesem Schritt. ADR-018 ist dafür in **Fassung 2**
ergänzt (Punkt 8); §21 verlangt, dass die Prinzipien nachziehen.

- **§8 ergänzt** um vier verbindliche Aussagen: Der **Eingang** einer Absage
  wird getrennt vom Zeitpunkt ihrer Eingabe festgehalten · die Frist rechnet
  **der Server** aus Eingang und vereinbartem Beginn · **genau 24 Stunden**
  liegen außerhalb der Regel · eine **praxisbedingte** Absage löst sie nicht
  aus. Dazu die Klarstellung, dass das Nichtantreffen keine Gebühr erzeugt und
  nicht als Behandlung erscheint.
- **§19 unverändert,** aber sein Anker wird genauer: Fakturiert wird aus
  `documented` oder aus einem Vorgang mit **Gebührenanlass** — das ist ab jetzt
  die Absage unter 24 Stunden, und es bleibt der No-show mit einem Kennzeichen
  aus der Zeit vor dieser Version.
- **§18 unverändert,** mit einer Folge: Ein Vorgang mit Gebührenanlass fällt
  nicht unter die interne Dreijahresfrist, solange die Forderung nicht
  abgerechnet ist (ADR-008, ANN-035).
- **§21 ergänzt:** ADR-017 (Dateiablage) ist am 2026-09-12 angenommen worden
  und steht jetzt in der Tabelle. ADR-019 (Kartendienst) ist weiterhin nur
  **vorgeschlagen** und steht deshalb nicht darin.
- **Unverändert:** §8.1, der Rollenschnitt in §4, §6 und §5.

Gebaut wird das in CAL-014. Historische Vorgänge werden **nicht** nachträglich
umgedeutet und bekommen keine Gebühr.

### Änderungsvermerk 0.7

**ADR-018** (Zustandsautomat des Termins) ist am 2026-09-11 vom Projektinhaber
angenommen worden — alle sieben Bestätigungsfragen wie empfohlen. Anlass für
diese Version: §8 führte den Zustandsautomaten bis dahin ausdrücklich als
offenen Punkt; §21 verlangt, dass eine so geänderte Prinzipienaussage in einer
neuen Version nachgezogen wird.

- **§8 geändert:** Der Satz „Der Zustandsautomat des Termins ist noch nicht
  definiert …" entfällt. An seine Stelle treten die acht Zustände, der Hinweis,
  dass „angefragt" und „vorgemerkt" beschrieben, aber nicht gebaut sind, und
  drei verbindliche Aussagen: jeder Wechsel über eine Serverfunktion mit
  Rollenprüfung und Auditeintrag; „dokumentiert" und „abgerechnet" setzt der
  Vorgang, dem die Tatsache gehört; Absage und finalisierte Dokumentation ohne
  Rückweg.
- **§19 bekommt seinen technischen Anker,** ohne selbst geändert zu werden:
  „Fakturierung erst nach finalisierter Dokumentation" ist ab jetzt prüfbar als
  „aus `documented` oder aus `no_show` mit Ausfallhonorar". Der Abschluss eines
  Termins verlangt weiterhin keine Dokumentation (ANN-005 bleibt in Kraft).
- **§21 ergänzt:** ADR-018 steht in der Tabelle der angenommenen ADRs.
- **Unverändert:** §8.1 (Terminfenster), §6 und §6.3, §4 und der Rollenschnitt.
  ADR-018 legt Zustände und Übergänge fest, keine Rechte.

Nicht gebaut: Die Umsetzung ist CAL-EPIC-003a. Bis dahin kennt die Anwendung
die drei bisherigen Werte; diese Version entscheidet, sie beschreibt keinen
erreichten Stand.

### Änderungsvermerk 0.6

Die Entscheidung **E10** des Projektinhabers vom 2026-09-08 wird verbindlich.
Anlass: Sie war bis dahin nur in `docs/decisions/OPEN_DECISIONS.md` festgehalten;
§21 verlangt, dass eine geänderte Prinzipienaussage in einer neuen Version
nachgezogen wird, sobald die Aufteilung im Code steht und getestet ist
(STAFF-002a).

- **§4.3 präzisiert:** „Mitarbeiterorganisation" ist für das Office ein
  **schreibendes** Recht auf die **Stammdaten** einer beschäftigten Person —
  Name, dienstliche Erreichbarkeit, Hauptstandort. Nicht dazu gehören
  Rollenvergabe, Beschäftigungsstatus und die Privatangaben nach §20.
- **§4.5 präzisiert:** „Mitarbeiterplanung" bleibt für die Teamleitung ein
  **mögliches**, nicht vergebenes Zusatzrecht. Sie schreibt weder Stammdaten
  noch Rollen noch den Beschäftigungsstatus.
- **§4.1 unverändert:** Rollenvergabe und Beschäftigungsstatus bleiben beim
  Praxisinhaber. Eine Rolle zu vergeben ist Berechtigungsvergabe und damit
  eine Sicherheitsentscheidung nach ADR-004.

### Änderungsvermerk 0.5

Zwei Produktentscheidungen des Projektinhabers vom 2026-09-08 werden
verbindlich. Anlass: Jannes hat beide selbst getroffen und zur Aufnahme in die
verbindlichen Dokumente beauftragt.

- **Neu §8.1 „Terminfenster, Dokumentationszeit und Fahrzeit":** ein
  angebotener Behandlungstermin dauert 60 Minuten einschließlich
  Dokumentation, ohne eigenen Dokumentationsblock und ohne feste Aufteilung;
  der Beginn bleibt frei auf dem Praxisraster (heute 5 Minuten); eine Fahrzeit
  kommt zwischen den Terminfenstern hinzu, und der früheste Folgetermin liegt
  auf dem ersten Rasterpunkt auf oder nach Ende plus Fahrzeit (aufrunden, nie
  abrunden).
  Es ist eine **Angebotsregel mit serverseitiger Durchsetzung**, keine
  Voreinstellung der Oberfläche. Bestehende Termine bleiben unverändert.
- **Neu §6.3 „Sprachdokumentation: Diktat, Transkription und Übernahme":**
  bewusst gestartetes Nachdiktat aus dem Termin, inhaltstreue Transkription
  und Strukturierung ohne eigene klinische Ergänzung und ohne inhaltliche
  Auslassung, Kennzeichnung unverständlicher Stellen, Prüfung und Korrektur
  vor der Übernahme. Ein KI-Vorschlag ist **kein Dokumentationsentwurf**; die
  automatische Finalisierung nach ADR-016 Punkt 7 DARF ihn NICHT erfassen.
- §5 verweist auf §6.3; §8 verweist auf §8.1; §21 führt die geänderten ADRs
  nach (ADR-005 Fassung 2, ADR-006 Fassung 2, ADR-016 Fassung 2).
- Beide Abschnitte halten die Anforderung fest und sind **kein
  Implementierungsauftrag**. Was an ihnen nicht entschieden ist, steht als
  E12 und E13 in `docs/decisions/OPEN_DECISIONS.md`.
- Keine Anforderung aus §3, §12, §13 oder §16 wurde geändert oder
  abgeschwächt. §6, §7.1 und die Liste der Constraints in §8 sind unverändert.

### Änderungsvermerk 0.4

C1 und C2 entschieden. Anlass: Jannes hat beide in
`docs/decisions/OPEN_DECISIONS.md` Abschnitt C geführten Widersprüche
aufgelöst (2026-09-05):

- §4.4 legt fest, dass Leistungskürzel (z. B. „MT", „KG") als organisatorische
  Information gelten und dem Office wie die übrige Rechnung zugänglich
  bleiben; der Diagnosetext bleibt klinisch und gesperrt.
- §10 legt fest, dass Patientenkommunikation über einen gemeinsamen Kanal
  läuft; erkennt eine Therapeutin nachträglich klinischen Inhalt, ordnet sie
  ihn der Akte zu. Dass das Office eine solche Nachricht bis zur Zuordnung
  gelesen haben kann, ist eine akzeptierte, dokumentierte Ausnahme, kein
  Fehler.

Keine Anforderung aus §3, §12, §13 oder §16 wurde geändert oder abgeschwächt.

### Änderungsvermerk 0.3

Arbeitsweise bei fehlenden Entscheidungen. Anlass: Der Projektinhaber hat
festgestellt, dass die Regel „nicht eigenständig entscheiden, stoppen und
vorlegen" die Entwicklung blockiert, weil er insbesondere datenschutz- und
rechtsbezogene Detailfragen selbst nicht beantworten kann. Eine
Datenschutzprüfung steht bevor; das Produkt muss deren Ergebnis aufnehmen
können, ohne dass die Entwicklung bis dahin wartet.

- Neu §15.1 „Begründete Annahmen": Fehlt eine Entscheidung, wird recherchiert,
  nach bestem Wissen entschieden, die Annahme im Annahmenregister
  (`docs/decisions/ASSUMPTIONS.md`) dokumentiert und reversibel verankert.
  Datenschutz- und rechtsbezogene Annahmen MÜSSEN vor Produktivstart
  validiert werden. §15.1 nennt abschließend, was keine Annahme sein darf.
- §2.3 präzisiert: Detailentscheidungen innerhalb einer beauftragten Aufgabe
  sind keine „grundlegenden Praxisprozesse" und werden nach §15.1 getroffen.
- §11 nennt Recherche und das Schließen von Lücken durch dokumentierte
  Annahmen als zulässige Tätigkeiten; die Verbotsliste ist unverändert.
- §21 nimmt das Annahmenregister in die Dokumentenordnung auf, regelt den
  Umgang mit einem entdeckten Widerspruch bis zu seiner Auflösung und führt
  ADR-015 und ADR-016 in der Tabelle nach.
- Keine Anforderung aus §3 (Datenschutz und Sicherheit), §12, §13 oder §16
  wurde geändert oder abgeschwächt.

### Änderungsvermerk 0.2.2

Korrekturversion. Sie behebt ausschließlich eine Aussage, die durch ADR-016
überholt ist, und ändert keine Anforderung:

- §5 bezeichnete den Mechanismus der Nachvollziehbarkeit — Versionierung
  gegenüber Änderungsprotokoll — als offen. ADR-016 hat ihn am 2026-09-01
  entschieden; `docs/decisions/OPEN_DECISIONS.md` Abschnitt D führt ihn
  seither nicht mehr als offen. Die MUSS-Anforderungen aus §5 bleiben
  unverändert — ADR-016 erfüllt sie und erweitert sie nicht.

### Änderungsvermerk 0.2.1

Korrekturversion. Sie behebt ausschließlich Widersprüche, die durch ADR-010 bis
ADR-014 entstanden sind, und enthält keine stilistischen Änderungen:

- §4.2 bezeichnete Umfang und Aufbewahrung des Auditlogs als offen; das ist
  seit ADR-010 falsch.
- §13 bezeichnete ein Notfallzugriffskonzept als offen; ADR-010 stellt fest,
  dass ein klinischer Break Glass in V1 nicht erforderlich ist.
- §14 beschränkte die strukturelle Vorbereitung auf ADR-003; ADR-014 legt eine
  umfassendere verbindliche Liste fest.
- §21 führte die zitierten ADRs nicht auf.

### Änderungsvermerk 0.2

- Normative Begriffe eingeführt (§0). Sicherheitskritische Formulierungen wie
  „langfristig", „perspektivisch", „möglichst" und „soll" wurden durch
  eindeutige normative Aussagen ersetzt, soweit eine Entscheidung vorliegt.
- Die angenommenen Architekturentscheidungen ADR-001 bis ADR-009 wurden auf
  Prinzipienebene konsolidiert. Details, die im jeweiligen ADR vollständig
  geregelt sind, werden hier nicht wiederholt, sondern verlinkt.
- Neue Abschnitte: §17 Regulatorische Abgrenzung, §18 Aufbewahrung und
  Löschung, §19 Abrechnung, §20 Beschäftigtendaten, §21 Governance.
- Die Nummerierung der Abschnitte §1 bis §16 ist unverändert, damit bestehende
  Verweise aus den ADRs gültig bleiben.
- Es wurde keine Anforderung der Baseline entfernt. Offene Punkte sind als
  offen gekennzeichnet und nicht durch Formulierung geschlossen worden.
