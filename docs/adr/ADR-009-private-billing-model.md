# ADR-009: Privatabrechnung

## Status

Angenommen — **Fassung 1** (2026-08-28). **Fassung 2 vorgeschlagen**
(2026-09-20).

Fassung 2 ergänzt die Punkte 15 bis 20: das Steuerkennzeichen am **Posten**,
die Rechnung mit **genau einem Leistungsbereich**, **getrennte Nummernkreise**,
den **§ 14c-Riegel**, die Auswertung „Einnahmen je Leistungsart" und den
Verzicht auf die Kleinbetragsrechnung. Sie ist **Schritt 4 von sieben** aus E18
([`../development/E18-LEISTUNGSBEREICHE.md`](../development/E18-LEISTUNGSBEREICHE.md),
Abschnitt 3) und setzt
[ADR-021](ADR-021-service-areas-and-legal-relationships.md),
[ADR-022](ADR-022-appointment-context-and-training-basis.md) und
[ADR-006](ADR-006-medical-device-boundary.md) Fassung 3 fort. **Die Punkte 1
bis 14 sind unverändert**; die neuen Punkte machen Punkt 6 und Punkt 8 an
genau den Stellen konkret, an denen zwei Leistungsbereiche sie mehrdeutig
lassen — sie fassen sie **enger**, nie lockerer.

**Bis zur Annahme durch den Projektinhaber gilt Fassung 1.** Der ADR steht
bereits im Index in `CLAUDE.md` und in der Tabelle in
[`README.md`](README.md) — der einzigen Stelle, die Fassung und Status führt
(`PROJECT_PRINCIPLES.md` §21). Die dortige Zeile nennt bis zur Annahme keine
Fassung und bleibt unberührt; §21 nennt ohnehin keine und ändert sich nicht.
Bis dahin beginnt **Schritt 5** (`PROJECT_PRINCIPLES.md` neue Version) nicht,
und ein Loop, der Code baut, beginnt weiterhin erst, wenn der ADR über ihm
steht.

## Datum

2026-08-28 (Fassung 1); 2026-09-20 (Fassung 2, vorgeschlagen)

## Kontext

§1 von `PROJECT_PRINCIPLES.md` nennt Privatrechnungen als einen der
Kernprozesse, §4.3 gibt dem Office Zugriff auf Rechnungen und Zahlungsstatus,
§12 zählt Rechnungsdaten zu den besonders kritischen Funktionen und §13
verbietet, Rechnungen unbemerkt falsch zuzuordnen. Mehr steht in der Baseline
nicht.

Dahinter liegen mehrere Entscheidungen, die das Datenmodell festlegen. Ob die
Praxis selbst abrechnet oder über einen Abrechnungsdienstleister, ändert die
Anforderungen an Einwilligungen und Datenflüsse grundlegend. Rechnungsempfänger
sind bei Beihilfe, privater Versicherung, Betreuung oder minderjährigen
Patienten regelmäßig nicht die Patienten selbst. Und die Abrechnung unterliegt
mit den GoBD-Anforderungen einem eigenen Unveränderbarkeitsregime, das neben
der klinischen Versionierung aus §5 steht und anderen Regeln folgt: dort
Korrektur mit Historie, hier Storno und Neuausstellung.

Hinzu kommt eine fachliche Kopplung, die in der Praxis regelmäßig
auseinanderläuft: Eine Leistung entsteht am Termin, eine Rechnung entsteht
später und fasst mehrere Leistungen zusammen. Werden beide nicht getrennt
modelliert, entstehen Doppelabrechnungen oder nicht abgerechnete Leistungen.

Diese Entscheidung war als Punkt B4 in `docs/decisions/OPEN_DECISIONS.md`
offen.

**Neu zur Fassung 2.** Fassung 1 kannte einen Leistungsbereich. Seit den
Festlegungen des Projektinhabers vom 2026-09-17 (E18) deckt die Anwendung
zwei ab: Heilbehandlung und Leistungen ohne Heilbehandlungszweck. ADR-021
trennt sie nach dem **Rechtsverhältnis**, ADR-022 gibt jedem Termin **genau
einen Kontext**, ADR-006 Fassung 3 zieht die Zweckbestimmung über beide. Für
die Abrechnung ist das keine Nebenwirkung, sondern der Kern: Der Betrieb ist
**regelbesteuert**, und damit stehen steuerfreie Heilbehandlungen (§ 4 Nr. 14
lit. a UStG) und steuerpflichtige Trainingsleistungen nebeneinander auf
denselben Bildschirmen.

Punkt 6 sagt bereits, dass steuerliche Eigenschaften je Leistung gespeichert
und nicht abgeleitet werden. Was er nicht sagt: **woran** sie hängen dürfen,
wenn es zwei Bereiche gibt. Die naheliegende und falsche Antwort ist der
Kunde — „Trainingskundin, also 19 Prozent". Sie ist falsch, weil eine Person
beide Verhältnisse haben kann (ADR-021) und weil eine Heilbehandlung auch
dann steuerfrei bleibt, wenn sie in derselben Woche neben einer
Trainingsstunde steht.

Der teuerste Fehler steht daneben: Wer an einem steuerfreien Posten
Umsatzsteuer ausweist, **schuldet sie nach § 14c UStG** — unabhängig davon,
ob sie je gezahlt wurde und ob der Ausweis ein Versehen war. Das ist kein
Bedienfehler, den Sorgfalt abfängt, sondern eine Rechenoperation, die
unterbleiben muss. § 14 Abs. 4 UStG verlangt zugleich bei steuerfreien
Posten den **Grund der Befreiung** als Pflichtangabe (Nr. 8) und erlaubt bei
der fortlaufenden Nummer ausdrücklich **mehrere Zahlenreihen** (Nr. 4).

Hinzu kommt die getrennte Gewinnermittlung: Physiotherapie ist
freiberuflich, Personal Training gewerblich. Als Einzelunternehmen droht
keine Abfärbung nach § 15 Abs. 3 Nr. 1 EStG, bei einer späteren
Personengesellschaft schon. Die Zahlen dafür müssen von Anfang an getrennt
entstehen; sie später auseinanderzurechnen kostet ein Vielfaches.

**Geprüft am Bestand (2026-09-20).** Die Abrechnung der Etappe 1 ist gebaut,
und sie trägt die Steuermerkmale bereits am richtigen Ort: Eine
Katalogposition hat `tax_treatment` (`exempt_healthcare`, `taxable`,
`not_taxable`) und `tax_rate_permille`, und
`app.build_invoice_document` rechnet die enthaltene Steuer nur an
steuerpflichtigen Gruppen und unter der Kleinunternehmerregelung gar nicht.
Fassung 2 baut darauf auf, statt daneben etwas Zweites zu stellen.

## Entscheidung

1. Die erste Produktversion **führt die Privatabrechnung innerhalb der
   Plattform durch**. **Factoring beziehungsweise externe
   Abrechnungsdienstleister sind nicht Bestandteil von V1.**
2. **Patient und Rechnungsempfänger werden als getrennte Entitäten
   modelliert.**
3. **Abrechenbare Leistungen existieren unabhängig von Rechnungen** und werden
   aus durchgeführten Terminen beziehungsweise anderen abrechenbaren
   Ereignissen erzeugt.
4. **Eine Leistung darf nicht unbeabsichtigt mehrfach abgerechnet werden.**
5. **Leistungskatalog und Preisvereinbarungen werden versioniert.**
   Historische Leistungen und Rechnungen dürfen durch spätere Preisänderungen
   nicht verändert werden.
6. **Steuerliche Eigenschaften werden explizit pro Leistung beziehungsweise
   Leistungsversion gespeichert und nicht durch KI bestimmt.**
7. Rechnungen besitzen mindestens die Zustände **Entwurf, ausgestellt,
   versendet, teilweise bezahlt, bezahlt, überfällig und
   korrigiert/storniert**.
8. Eine **Rechnungsnummer wird erst bei Ausstellung vergeben**. Die Vergabe
   **MUSS eindeutig erfolgen**, und eine einmal vergebene Nummer **darf nicht
   wiederverwendet werden**.
9. Eine **ausgestellte Rechnung ist unveränderbar**. Korrekturen erfolgen
   durch nachvollziehbare **Korrektur-/Stornodokumente** und gegebenenfalls
   eine neue Rechnung.
10. **Beim Ausstellen werden alle rechnungsrelevanten Stammdaten,
    Leistungsdaten, Preise und Steuerinformationen als historischer Snapshot
    gespeichert.**
11. Das **ausgestellte Rechnungsdokument wird in seiner damaligen Form
    aufbewahrt**.
12. **Zahlungen werden als eigene Transaktionen modelliert** und ermöglichen
    **Teilzahlungen sowie spätere Rückzahlungen**.
13. Therapeutische Leistungen **sollen grundsätzlich erst endgültig fakturiert
    werden können, wenn die zugehörige Dokumentation finalisiert ist**.
    **Berechtigte Overrides müssen begründet und protokolliert werden.**
14. V1 unterstützt **PDF-Rechnungen für private Rechnungsempfänger**. Die
    Architektur **darf spätere strukturierte E-Rechnungen nicht verhindern**.
15. *(Fassung 2)* **Das Steuerkennzeichen hängt am Posten, nie am Kunden.**
    Die steuerliche Einordnung einer Rechnungszeile folgt ausschließlich der
    abgerechneten Leistung beziehungsweise ihrer Katalogversion (Punkt 5 und
    6) — **nicht** dem Rechtsverhältnis (ADR-021), **nicht** dem Terminkontext
    (ADR-022), **nicht** dem Rechnungsempfänger (Punkt 2) und **nicht** der
    Person. Drei Kennzeichen sind vorgesehen: **steuerfreie Heilbehandlung**
    (§ 4 Nr. 14 lit. a UStG), **steuerpflichtige Leistung ohne
    Heilbehandlungszweck** zum Regelsatz (Personal Training, Prävention,
    Gerätetraining) und **steuerpflichtige Leistung zum ermäßigten Satz** für
    verordnungsfähige Leistungen ohne Verordnung. Das dritte wird **angelegt,
    aber nicht aktiviert**, bis die Steuerberatung es freigibt (B4); seine
    Rechtslage ist umstritten. Das vorhandene Kennzeichen **nicht steuerbar**
    (kein Leistungsaustausch, der Fall des Ausfallhonorars) bleibt daneben
    bestehen.
16. *(Fassung 2)* **Eine Rechnung trägt genau einen Leistungsbereich.**
    Gemischte Rechnungen über Heilbehandlung und Trainingsleistung sind
    **ausgeschlossen**; der Bereich einer Rechnung ergibt sich aus ihren
    Posten und nicht aus ihrem Empfänger. Eine erfasste Leistung trägt ihren
    Bereich aus der Katalogposition. Widerspricht er dem Kontext des Termins,
    an dem sie entstanden ist (ADR-022), ist das ein **Fehler bei der
    Erfassung** und keine stille Korrektur. Die Regel ist eine Invariante des
    Datenmodells, keine Regel der Oberfläche.
17. *(Fassung 2)* **Je Leistungsbereich ein eigener Nummernkreis.** Punkt 8
    gilt unverändert; er wird nur je Kreis gelesen. Jeder Kreis läuft
    **lückenlos** innerhalb seines Kalenderjahres, und **jede vergebene Nummer
    bleibt innerhalb der Organisation einmalig** — mehrere Zahlenreihen sind
    nach § 14 Abs. 4 Nr. 4 UStG ausdrücklich zulässig, doppelte Nummern nicht.
    Am ausgestellten Dokument muss erkennbar sein, aus welchem Kreis seine
    Nummer stammt. Korrektur- und Stornodokumente (Punkt 9) nehmen ihre Nummer
    aus dem Kreis der Rechnung, die sie betreffen.
18. *(Fassung 2)* **Der § 14c-Riegel: An einem steuerfreien oder nicht
    steuerbaren Posten wird kein Steuerbetrag ausgewiesen** — weder an der
    Zeile noch an der Steuergruppe noch in der Summe; unter der
    Kleinunternehmerregelung (§ 19 UStG) gilt das für die gesamte Rechnung.
    Bei steuerfreien Posten ist der **Grund der Steuerbefreiung Pflichtangabe**
    (§ 14 Abs. 4 Nr. 8 UStG); er gehört in den Snapshot nach Punkt 10, nicht
    nur in die Darstellung. Die Sperre wirkt **vor der Ausstellung** und
    **serverseitig**; die Oberfläche ist nicht die Stelle (ADR-004, §4.7). Sie
    ist eine der Invarianten, die `pnpm test:db` prüft, und der Testfall ist
    **verbindlich**. Eine ausgestellte Rechnung mit falschem Ausweis wird
    nicht repariert, sondern nach Punkt 9 storniert und neu ausgestellt.
19. *(Fassung 2)* **Die Plattform führt eine Auswertung „Einnahmen je
    Leistungsart".** Sie trennt die Erlöse **je Leistungsbereich** und
    schlüsselt sie innerhalb des Bereichs je Steuerkennzeichen und Satz auf.
    Sie rechnet ausschließlich aus ausgestellten Rechnungen (Snapshot,
    Punkt 10), Korrektur- und Stornodokumenten (Punkt 9) und gebuchten
    Zahlungen (Punkt 12). Sie **benennt ihre Grundlage ausdrücklich** — Zufluss
    oder Rechnungsstellung — und mischt beide **nie in einer Zahl**; welche
    Grundlage die Gewinnermittlung verlangt, entscheidet die Steuerberatung
    (B9) und nicht die Software. Sie ist **deterministisch und ohne KI**
    (Punkt 6, ADR-005) und **kein steuerlicher Abschluss**: eine Summe, keine
    Bewertung.
20. *(Fassung 2)* **V1 macht von der Kleinbetragsrechnung keinen Gebrauch.**
    Jede Rechnung trägt den vollen Satz der Pflichtangaben nach § 14 Abs. 4
    UStG, auch unter 250 Euro. § 33 UStDV ist eine Erleichterung, keine
    Pflicht; was sie erspart, ist im Wesentlichen die Angabe des
    Leistungsempfängers — und genau die braucht diese Praxis für Beihilfe und
    private Versicherung ohnehin (Punkt 2).

## Konsequenzen

- Ohne Factoring in V1 verlassen Patientendaten die Plattform nicht zu
  Abrechnungszwecken. Die sonst nötige ausdrückliche Einwilligung für die
  Übermittlung an einen Abrechnungsdienstleister entfällt in V1; ein späterer
  Wechsel wäre ein eigener ADR mit eigener Einwilligungs- und
  DSFA-Betrachtung (ADR-007 nennt neue Datenflüsse als Wiedervorlagegrund).
- Die Trennung von Patient und Rechnungsempfänger ist die Voraussetzung für
  Beihilfe, private Versicherung, Betreuung und minderjährige Patienten. Sie
  greift in den offenen Punkt B5 (Vertretung und Angehörigenzugriff), ohne ihn
  zu entscheiden: Hier geht es um den Adressaten der Rechnung, nicht um
  Zugriffsrechte auf die Akte.
- Leistung und Rechnung sind getrennte Lebenszyklen. Eine Leistung trägt einen
  eigenen Abrechnungsstatus; die Regel gegen unbeabsichtigte Mehrfachabrechnung
  wird damit zu einer prüfbaren Invariante des Datenmodells und nicht zu einer
  Sorgfaltsfrage im Bedienablauf. Das ist die direkte Umsetzung von §13.
- Versionierte Kataloge und Preise bedeuten, dass eine Leistung auf eine
  Katalogversion verweist und nicht auf einen aktuellen Preis. Preispflege
  wird dadurch aufwendiger und historisch korrekt.
- Steuerliche Eigenschaften je Leistungsversion sind eine bewusste Absage an
  eine globale Steuerlogik: Heilbehandlungen und nicht befreite Angebote wie
  Prävention oder Selbstzahler-Training können nebeneinander existieren. Der
  ausdrückliche Ausschluss von KI an dieser Stelle folgt der Trennung aus
  ADR-005 und der Abgrenzung aus ADR-006.
- Der Zustandsautomat der Rechnung ist normativ. Das schließt die bisher
  fehlende Modellierung der Rechnungsseite; der Terminstatus bleibt davon
  unberührt und weiterhin offen. *(Seit ADR-018 entschieden; die Kopplung an
  die Rechnung steht dort in Punkt 2 und 3.)*
- Nummernvergabe erst bei Ausstellung heißt, dass Entwürfe keine Nummer tragen
  und beliebig verworfen werden können, ohne Lücken zu erzeugen. Die Eindeutigkeit
  und Nichtwiederverwendung ist unter gleichzeitigen Zugriffen sicherzustellen.
- Unveränderbarkeit plus Snapshot bedeutet: Eine Rechnung ist nach Ausstellung
  von späteren Änderungen an Stammdaten, Preisen und Katalog unabhängig. Damit
  entsteht bewusst Datenredundanz — sie ist hier Zweck und nicht Fehler.
- Neben der klinischen Versionierung aus §5 existiert damit ein zweites
  Unveränderbarkeitsregime mit anderer Korrekturlogik. Beide dürfen nicht
  vermischt werden: klinische Korrektur erzeugt eine neue Version, eine
  Rechnungskorrektur erzeugt ein eigenes Dokument.
- Die Aufbewahrung des ausgestellten Dokuments in seiner damaligen Form
  verbindet diesen ADR mit ADR-008: Rechnungen und Buchungsbelege folgen der
  steuerlichen Frist, nicht der Frist der Patientenakte.
- Zahlungen als eigene Transaktionen erlauben Teilzahlungen, Überzahlungen und
  Rückzahlungen, ohne den Rechnungsdatensatz zu verändern. Der Zahlungsstatus
  ist damit abgeleitet, nicht gesetzt.
- Die Kopplung von Fakturierung an finalisierte Dokumentation verbindet
  Abrechnung und klinische Doku. Sie kann im Alltag stören — deshalb der
  begründete und protokollierte Override, der Teil des Audit-Umfangs aus
  ADR-004 wird. Zugleich hängt sie an ADR-001: Finalisierung ist ein
  serverseitiger Vorgang und offline nicht möglich.
- PDF in V1 mit offener Tür zur E-Rechnung heißt praktisch, dass die
  Rechnungsdaten strukturiert vorliegen müssen und das PDF eine Darstellung
  ist — nicht die einzige Quelle.

**Zur Fassung 2:**

- **Punkt 15 kostet kein neues Feld.** Die drei Kennzeichen sind keine vierte
  Spalte, sondern **Werte des vorhandenen Paars** aus `tax_treatment` und
  `tax_rate_permille` an der Katalogposition
  (`supabase/migrations/20260919100000_service_catalog.sql`): steuerfreie
  Heilbehandlung ist `exempt_healthcare`, die beiden steuerpflichtigen Fälle
  sind `taxable` mit verschiedenem Satz, das Ausfallhonorar bleibt
  `not_taxable`. Ein zweites Feld daneben wären zwei Wahrheiten über
  dieselbe Position — genau die zweite Implementierung, die
  `ARBEITSBEREICHE.md` verhindern soll. Die Constraint, die den Satz an die
  Einordnung bindet, steht dort bereits.
- **Der § 14c-Riegel ist zur Hälfte gebaut und zur Hälfte offen.**
  `app.build_invoice_document` rechnet die enthaltene Steuer heute schon nur
  an steuerpflichtigen Gruppen und unter § 19 UStG gar nicht — die
  Rechenseite von Punkt 18 steht. **Der Grund der Steuerbefreiung steht
  heute auf keiner Rechnung**, weder im Snapshot noch im Ausdruck; das ist
  die konkreteste Lücke dieser Fassung und eine Pflichtangabe, kein
  Schönheitsfehler. Sie wird eine Roadmap-Zeile, kein Nachtrag im Vorbeigehen.
- **Getrennte Nummernkreise fassen zwei Annahmen enger, ohne sie
  umzukehren.** `invoice_number_series` ist heute je Organisation und
  Kalenderjahr geführt (ANN-075) und braucht einen dritten Schlüsselteil;
  das Kürzel in den Praxis-Stammdaten wird eines je Bereich. ANN-079 gilt
  weiter, jetzt je Kreis gelesen: Das Storno nimmt die Nummer der Rechnung,
  die es betrifft. **Ein Übergangsproblem entsteht nicht** — produktiv ist
  noch keine Rechnung ausgestellt (B12: kein Altsystem), der vorhandene
  Kreis wird der Kreis der Heilbehandlung, der zweite beginnt bei 1.
- **Punkt 16 gibt ANN-077 einen dritten Schlüssel.** Eine Rechnung bündelt
  heute Person und Kalendermonat; künftig Person, Kalendermonat **und**
  Leistungsbereich. Eine Person mit beiden Verhältnissen bekommt in einem
  Monat damit **zwei** Rechnungen. Das ist gewollt: Es ist der Preis dafür,
  dass keine Summe über zwei Steuerregime läuft und die getrennte
  Gewinnermittlung ohne Nachrechnen funktioniert.
- **Das § 14c-Risiko ist rechnerisch, nicht organisatorisch.** Die Schuld
  entsteht mit dem **Ausweis**, nicht mit der Zahlung und nicht mit der
  Absicht. Deshalb sitzt die Sperre vor der Ausstellung und nicht in einer
  Prüfroutine danach, und deshalb steht sie in der Datenbank und nicht in der
  Oberfläche: Eine ausgestellte Rechnung ist unveränderbar (Punkt 9) — was
  einmal falsch draufsteht, kostet ein Storno.
- **Die Auswertung aus Punkt 19 ist die einzige neue Funktion dieser
  Fassung.** Sie rechnet aus Snapshots und Zahlungen, die **keine klinischen
  Inhalte** tragen (Punkt 10), und braucht deshalb keinen Zugriff auf die
  Akte. Wer sie sehen darf, folgt ADR-004 und §4.3 und wird hier nicht neu
  entschieden. Dass sie ihre Grundlage benennt statt sie zu wählen, ist
  dieselbe Zurückhaltung wie beim Umsatzsteuerstatus der Praxis: Die Software
  rät den steuerlichen Rahmen nicht.
- **Punkt 20 spart eine zweite Dokumentform.** Eine eigene Darstellung für
  Rechnungen unter 250 Euro wäre ein zweiter Weg mit eigenen Fehlern und
  eigenem Testbedarf — für eine Erleichterung, die diese Praxis nicht braucht.
  Die Entscheidung gilt für V1 und ist billig zurückzunehmen.
- **Kein Code, kein Schema, keine Migration, kein Test.** Nichts davon
  entsteht mit dieser Fassung. Sie macht den Loop zulässig, der es baut; sie
  beginnt ihn nicht.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Auswahl eines Leistungs- und Gebührenkatalogs sowie dessen Inhalte.
- Die abschließende steuerrechtliche Bewertung einzelner Leistungsarten und
  die Umsatzsteuerbehandlung im Einzelfall.
- Das Format und der Zeitpunkt einer späteren strukturierten E-Rechnung.
- Mahnwesen, Ausfallhonorar und Zahlungserinnerungen.
- Zahlungsanbieter, Bankanbindung, Kontoauszugsabgleich.
- Der Terminstatus-Automat (entschieden mit ADR-018, 2026-09-11).
- Die Einordnung von Leistungsziffern als organisatorische oder klinische
  Daten (C1 — entschieden 2026-09-05: organisatorisch; der Umfang des
  Behandlungsnachweises ist mit E15 vom 2026-09-13 nur noch eine
  Rechnungssicht, ADR-004 Fassung 2).
- Vertretungs- und Vollmachtsregelungen für den Zugriff auf Daten
  (B5 — Rahmen vorläufig entschieden 2026-09-08, Verfahren offen).
- Die Verfahrensdokumentation nach GoBD als Dokument.
- *(Fassung 2)* Die **Aktivierung des ermäßigten Kennzeichens** aus Punkt 15
  und die steuerliche Einordnung einzelner Katalogpositionen. Beides gehört
  zur Steuerberatung (B4, Roadmap G13); Fassung 2 legt nur an, wo es hängt.
- *(Fassung 2)* Die **Wahl der Gewinnermittlungsart**, getrennte Konten und
  die Frage einer späteren Personengesellschaft (B9). Punkt 19 liefert die
  Zahlen, nicht die Rechtsform.
- *(Fassung 2)* Das **Format der Nummernkreise** und ihre Kürzel. Die Bezeichner
  bleiben Sache des SPEC (ADR-014); die Antwort aus G13 kann sie ändern, ohne
  Punkt 17 zu berühren.
- *(Fassung 2)* Der **Nachzug an `PROJECT_PRINCIPLES.md`** §1, §4 und §14. Das
  ist Schritt 5 aus E18 und kommt zuletzt, nicht hier. §19 trägt diesen ADR
  und ändert sich nicht.

## Offene Folgefragen

- Welche abrechenbaren Ereignisse gibt es neben durchgeführten Terminen?
- Wie wird die Nichtwiederverwendung von Rechnungsnummern unter gleichzeitigen
  Zugriffen und bei fehlgeschlagenen Ausstellungsvorgängen technisch
  garantiert?
- ~~Wie wird ein Nummernkreis geführt — pro Organisation, pro Jahr,
  fortlaufend?~~ *(Beantwortet mit Punkt 17, Fassung 2: je Organisation,
  Kalenderjahr **und Leistungsbereich**, lückenlos je Kreis und einmalig über
  alle Kreise. Die Form der Nummer hält ANN-075 vorläufig fest.)*
- Wer darf einen Override der Fakturierungssperre setzen, und wie wird er
  ausgewertet?
- Wie verhält sich der Rechnungszustand „überfällig" zu Zahlungszielen und
  Mahnwesen, das hier nicht entschieden wird?
- Welche Felder umfasst der Snapshot genau, und wie wird er gegen spätere
  Schemaänderungen robust gehalten?
- Wie wird eine Storno- und Korrekturkette dargestellt, wenn mehrfach
  korrigiert wird?
- Wie werden Rechnungen an Beihilfestellen und private Versicherer
  adressiert, und benötigt das eigene Empfängertypen?
- Wie greifen Zugriffsrechte des Office (§4.3) auf Rechnungen mit
  Leistungsangaben, solange C1 nicht entschieden ist?

**Neu mit Fassung 2:**

- Wie wird der **Grund der Steuerbefreiung** geführt — als fester Text je
  Kennzeichen oder als Feld an der Katalogposition? Das Zweite erlaubt
  verschiedene Befreiungstatbestände, das Erste verhindert einen falschen.
- Wie wird eine Leistung abgerechnet, die **beide Bereiche berührt** — etwa
  eine Hausbesuchspauschale zu einem Trainingstermin? Ist sie je Bereich eine
  eigene Katalogposition, oder folgt sie der Hauptleistung?
- Trägt die Auswertung aus Punkt 19 auch **Ausfallhonorare** (nicht steuerbar,
  kein Leistungsaustausch), und in welchem Bereich erscheinen sie?
- Was gilt, wenn ein **Kennzeichen nachträglich falsch** war — etwa nach einer
  Klärung durch die Steuerberatung? Punkt 9 gibt die Antwort für die
  ausgestellte Rechnung; offen ist, wie eine Katalogposition korrigiert wird,
  ohne die Historie zu verfälschen (Punkt 5).
- Wie wird geprüft, dass **kein Weg an Punkt 16 vorbeiführt** — reicht eine
  Constraint über die Posten einer Rechnung, oder braucht es die Prüfung schon
  bei der Bündelung?

## Änderungshistorie

| Fassung | Datum      | Änderung |
| ------- | ---------- | -------- |
| 1       | 2026-08-28 | Erstfassung, angenommen. Punkte 1 bis 14. |
| 2       | 2026-09-20 | **Punkte 15 bis 20 ergänzt, Status vorgeschlagen:** Das Steuerkennzeichen hängt am **Posten**, nie am Kunden, am Rechtsverhältnis oder am Terminkontext (Punkt 15, drei Kennzeichen; das ermäßigte bleibt bis B4 inaktiv). Eine Rechnung trägt **genau einen Leistungsbereich**, gemischte sind ausgeschlossen (Punkt 16). Daraus folgen **getrennte Nummernkreise** je Bereich und Kalenderjahr, lückenlos je Kreis und einmalig über alle (Punkt 17, § 14 Abs. 4 Nr. 4 UStG) — das beantwortet die offene Folgefrage aus Fassung 1 zur Führung des Nummernkreises. Punkt 18 ist der **§ 14c-Riegel**: kein Steuerausweis am steuerfreien Posten, der Befreiungsgrund als Pflichtangabe im Snapshot, die Sperre serverseitig und als verbindlicher Testfall in `pnpm test:db`. Punkt 19 führt die Auswertung **„Einnahmen je Leistungsart"** für die getrennte Gewinnermittlung ein; sie benennt ihre Grundlage, statt sie zu wählen. Punkt 20 verzichtet in V1 auf die **Kleinbetragsrechnung** nach § 33 UStDV. Anlass: Festlegungen des Projektinhabers vom 2026-09-17 (E18 Abschnitt 3), **Schritt 4 von sieben**. Die Punkte 1 bis 14 sind unverändert und werden nur enger gefasst; kein Code, kein Schema, keine Migration. |
