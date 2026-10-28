# ADR-006: Abgrenzung gegenüber Medical Device Software
## Status
Angenommen, Fassung 4 (2026-10-18, Jannes); ergänzt ADR-005 um die inhaltliche Grenze.

## Kontext
Die Grenze zieht die Zweckbestimmung (MDR, MDCG 2019-11), nicht Vertragstyp oder Nutzung, in beiden
Leistungsbereichen (§6, §7.1, E18). Ein Screening mit Trainingsfreigabe fiele unter MDR Anhang VIII
Regel 11 (Klasse IIa mit Benannter Stelle); deshalb die drei Verbote (Punkte 10 bis 12). Bewusst
nicht Bestandteil: spätere Versionen (eigener ADR), Risikoklasse, Konformitätsweg, QMS, klinische
Bewertung, technische Dokumentation, Instrumente (§7).

## Entscheidung
1. **Zweckbestimmung V1** (§17): weder Diagnose- noch Therapieentscheidungen oder -empfehlungen.
2. Die Anwendung **darf Gesundheitsinformationen erfassen, speichern, strukturieren und darstellen**
   sowie transparente Berechnungen validierter Instrumente durchführen.
3. **Patientenangaben dürfen unverändert bzw. eindeutig auf ihre Quelle zurückführbar hervorgehoben
   werden**, nach §7.1 auch Tumoranamnese und Gewichtsverlust als Hinweis auf die Angaben.
4. In V1 darf die Anwendung keine eigenen klinischen Risikoklassifikationen, Differentialdiagnosen,
   Therapieempfehlungen, Behandlungsauswahl oder automatisierten klinischen Entscheidungen erzeugen.
5. **Generative KI** dient in V1 Dokumentation, sprachlicher Transformation, Zusammenfassung und
   administrativer Assistenz und darf **keine neue klinische Interpretation hinzufügen**, die als
   Grundlage einer diagnostischen oder therapeutischen Entscheidung bestimmt ist, auch nicht in
   einer „Zusammenfassung“ (je Feature geprüft).
6. Features, die diese Grenze möglicherweise überschreiten, sind **`MDR_REVIEW_REQUIRED`** und
   dürfen vor einer dokumentierten regulatorischen Prüfung **nicht produktiv aktiviert werden**;
   das Merkmal ist geführt, sichtbar und technisch wirksam (`src/app/mdr.ts`, ANN-089).
7. **Externe Prüfung vor Produktivstart** (§17), mit Vorlauf und Kosten eingeplant.
8. **Sprachdokumentation fällt unter Punkt 5** (Fassung 2), enger: nichts hinzu, nichts weg, kein
   Zusammenfassen oder Verdichten; Einzelheiten §6.3, Weitergehendes ist `MDR_REVIEW_REQUIRED`.
9. **Beide Leistungsbereiche** (Fassung 3): Im Trainingsverhältnis (ADR-021) und an Terminen mit
   `kind = 'training'` (ADR-022 Punkt 2) gelten die Punkte 1 bis 8 unverändert: Eine
   gesundheitsbezogene Entscheidung oder ein Vorschlag aus Gesundheitsangaben ist dort so
   `MDR_REVIEW_REQUIRED` wie in der Behandlung; Punkt 2 gilt dort auch, ein Trainingsprotokoll
   (ADR-022) ist genau das.
10. **Keine automatische Übungsauswahl aus Diagnose oder Befund** (Verbot 1): Übungen, Dosierung,
    Intensität oder Progression werden nie aus Diagnose, Befund, Screening-Antwort oder Verlauf
    vorgeschlagen, vorsortiert, -gefiltert oder -belegt, auch nicht als Liste „passend zu“ einer
    klinischen Angabe mit offengelegter Regel und menschlicher Bestätigung. Erlaubt: Katalog,
    Suche, Vorlagen, gespeicherte Zusammenstellungen, das zuletzt Benutzte, Sortieren nach Name,
    Körperregion, Gerät oder Nutzungshäufigkeit; es wählt die behandelnde oder betreuende Person.
11. **Keine automatisierte Auswertung von Schmerzskala oder Verlauf mit Handlungsempfehlung**
    (Verbot 2): Zulässig sind Erfassen, Anzeigen, Verlaufskurve, die Rechnung eines validierten
    Instruments nach veröffentlichter Vorschrift und die Hervorhebung nach Punkt 3 mit Quelle und
    offengelegter Regel, ohne Aussage über die Bedeutung („NRS 8, Angabe vom 12.03.“, nicht
    „Schmerz verschlechtert“). Nie entsteht eine abgeleitete Bewertung: eigener Score,
    Risikoklasse, Ampel, Schwellenwertalarm, Hinweis wie „Verschlechterung“, „Therapie anpassen“,
    „Belastung reduzieren“, als Text, Farbe, Symbol oder Benachrichtigung.
12. **Kein Screening-Fragebogen, der selbst eine Trainingsfreigabe oder einen Abbruch ausspricht**
    (Verbot 3): Zulässig sind Erheben, Speichern, vollständiges Anzeigen, Hervorheben nach Punkt 3
    und ein allgemeiner, immer gleicher Sicherheitshinweis, unabhängig von den Antworten. Nie
    entsteht eine Ausgabe, die Eignung, Freigabe, Kontraindikation, Abbruch oder eine Empfehlung
    zum Arztbesuch ableitet, auch als Zwischenergebnis, Vorbelegung, mit menschlicher Bestätigung.
    Über Aufnahme und Fortsetzung entscheidet der Mensch, dokumentiert als seine Entscheidung.
13. **Die drei Verbote sind Ausschlusskriterien, nicht nur ein Prüfanlass** (§17); ein Feature-Flag
    ersetzt die Prüfung nicht. KI-Analyse und Assessments im Trainingsbereich werden nicht zuerst
    geschnitten, von ihnen bleibt die anzeigende und aufzeichnende Hälfte; Ernährung: Punkt 14.
14. **Ernährung: Bedarf und Zielwerte aus offengelegten Formeln** (Fassung 4): Grundumsatz,
    Gesamtumsatz und Zielwerte für Energie, Makronährstoffe und Wasser darf die Anwendung (Punkt 2)
    aus veröffentlichten, validierten Formeln berechnen, vorbelegen und wie ein Tracker anzeigen
    (ADR-027 Punkte 11, 16 bis 22); Zweck: allgemeine Ernährung und Körpergewicht im Alltag, nicht
    die Behandlung einer Krankheit. (a) Keine Diagnose, kein Befund, keine Erkrankung als Eingabe,
    keine krankheitsbezogene Anpassung (macht die Beratung von Hand); (b) Formel, Eingaben und
    Rechenweg sichtbar neben dem Ergebnis; (c) feste Untergrenzen für Rechnung und Wahl der Person:
    kein Energieziel unter dem Grundumsatz, kein Zielgewicht unter BMI 18,5; (d) die Beratung kann
    jeden Wert überschreiben, auch darunter, nach eigenem Urteil, gekennzeichnet; (e) nie Aussagen
    zum Gesundheitszustand, Lebensmittelbewertung mit Krankheitsbezug oder Ernährungsempfehlung für
    eine Erkrankung. Eigener Prüfpunkt nach Punkt 7; bis dahin §15.2.

## Konsequenzen
- Die Zweckbestimmung ist ein eigenes, gepflegtes Dokument; Beschriftung ist Zweckbestimmung, auch
  außen: „Hinweis auf Angabe“ ist keine „Warnung“, im Training: Trainingsprotokoll statt Befund,
  Screening-Antwort statt Risikoeinschätzung. Die drei Verbote setzt nichts technisch durch; sie
  wirken in Zuschnitt, Oberfläche und Zweitreview; jeder Loop an Screening, Verlauf, Übungen oder KI
  nennt sie und was nicht entsteht.

## Offene Folgefragen
- offen: B1 (OPEN_DECISIONS): wer die Zweckbestimmung wo pflegt, ob ein angezeigter Cutoff
  Klassifikation nach Punkt 4 ist, externe Prüfung, EU AI Act; E13: Prüfbarkeit von Punkt 8.
- Wer entscheidet, dass ein Feature `MDR_REVIEW_REQUIRED` ist?
- Wie wird verhindert und getestet (§12), dass KI klinisch interpretiert, und woran erkennt man es?
- Wie werden Hinweistexte und Beschriftungen geführt, ohne die Zweckbestimmung zu verschieben?
- Welcher Prozess greift, wenn ein Feature nach Produktivstart die Grenze berührt?
- Woran erkennt der Zweitreview, dass eine Sortierung (Punkt 10) keine klinische Vorauswahl ist?
- Ändert ein fester Sicherheitshinweis (Punkt 12) die Zweckbestimmung, wenn Antworten ihn nahelegen?

## Änderungshistorie
- Fassung 1 (2026-08-28, Jannes): angenommen, Punkte 1 bis 7 (B1).
- Fassung 2 (2026-09-08, Jannes): Punkt 8, Sprachdokumentation enger unter Punkt 5 (§6.3).
- Fassung 3 (2026-09-20, Jannes, E18): Punkte 9 bis 13, drei Verbote als Ausschlusskriterien.
- Fassung 4 (2026-10-18, Jannes): Punkt 14 Ernährung (Formeln, Untergrenzen), Umkehr in Punkt 13.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
