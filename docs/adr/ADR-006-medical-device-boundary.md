# ADR-006: Abgrenzung gegenüber Medical Device Software

## Status

**Angenommen — Fassung 3** (vom Projektinhaber am 2026-09-20 angenommen, alle
fünf neuen Punkte wie vorgeschlagen; fachlich entschieden hatte er sie am
2026-09-17, E18). Fassung 1 ist am 2026-08-28 angenommen, Fassung 2 am
2026-09-08.

Fassung 2 ergänzt Punkt 8 und präzisiert damit Punkt 5 für den Sonderfall der
Sprachdokumentation. Die Punkte 1 bis 7 sind unverändert; Einzelheiten unten in
der Änderungshistorie.

Fassung 3 ergänzt die Punkte 9 bis 13: die Geltung der Zweckbestimmung über
beide Leistungsbereiche und die **drei Feature-Verbote** an der MDR-Grenze. Sie
ist **Schritt 3 von sieben** aus E18
([`../development/E18-LEISTUNGSBEREICHE.md`](../development/E18-LEISTUNGSBEREICHE.md),
Abschnitt 4) und setzt
[ADR-021](ADR-021-service-areas-and-legal-relationships.md) und
[ADR-022](ADR-022-appointment-context-and-training-basis.md) fort. Die Punkte 1
bis 8 sind unverändert; die neuen Punkte fassen sie **enger**, nie lockerer.

Die geltende Fassung steht mit der Annahme auf **3** in der Tabelle in
[`README.md`](README.md) — der einzigen Stelle, die Fassung und Status führt
(`PROJECT_PRINCIPLES.md` §21). Weder §21 noch der Index in `CLAUDE.md` nennen
eine Fassung; beide bleiben unverändert, und die Paragraphen, die dieser ADR
trägt (§7.1, §17, §6.3), ändern sich nicht — der Nachzug an §1, §4 und §14
ist **Schritt 5** aus E18. Mit der Annahme ist **Schritt 4 (ADR-009 neue
Fassung, Steuerkennzeichen und getrennte Nummernkreise) frei**; ein Loop, der
Code baut, beginnt weiterhin erst, wenn der ADR über ihm steht.

## Datum

2026-08-28 (Fassung 1); 2026-09-08 (Fassung 2); 2026-09-20 (Fassung 3)

## Kontext

`PROJECT_PRINCIPLES.md` beschreibt in §6 KI als Assistenzsystem mit einer
klaren Negativliste — keine autonomen Diagnosen, kein Ausschluss von Red
Flags, keine klinisch relevanten Entscheidungen. §7.1 erlaubt der Anwendung,
auffällige Angaben anhand transparenter definierter Regeln hervorzuheben, und
verbietet erfundene Diagnosen und proprietäre Scores. Die Entscheidung trifft
ausdrücklich der Therapeut.

Was das Dokument nicht enthält, ist die regulatorische Einordnung. Ob Software
ein Medizinprodukt ist, richtet sich nach ihrer **Zweckbestimmung**. Software,
die Informationen für diagnostische oder therapeutische Entscheidungen liefert,
kann nach MDR und MDCG 2019-11 als Medical Device Software einzustufen sein.
Eine reine Dokumentations-, Termin- und Abrechnungssoftware ist es nicht.
Zwischen beidem liegt genau das Feld, in dem sich §7.1 und die
Assistenzfunktionen aus §6 bewegen.

Die Zweckbestimmung entsteht dabei nicht nur aus dem Code, sondern auch aus
Beschriftung, Darstellung und Außendarstellung. Sie muss deshalb bewusst
festgelegt und gepflegt werden, statt sich implizit aus der Summe der Features
zu ergeben.

Diese Entscheidung war als Punkt B1 in `docs/decisions/OPEN_DECISIONS.md`
als P0 offen. Sie ergänzt ADR-005, das die technische KI-Anbindung regelt,
um die inhaltliche Grenze.

**Neu zur Fassung 3.** Seit den Festlegungen des Projektinhabers vom
2026-09-17 (E18) deckt die Anwendung zwei Leistungsbereiche ab:
Heilbehandlung und Leistungen ohne Heilbehandlungszweck. ADR-021 trennt sie
nach dem **Rechtsverhältnis**, ADR-022 gibt jedem Termin **genau einen
Kontext**. Damit entstehen Funktionen, die es in Fassung 1 und 2 nicht gab —
Screening vor dem Training, Trainingspläne, Verlaufsdaten aus dem Training,
und mit dem Trainingsbereich vierzehn weitere Bereiche, von denen drei an der
MDR-Grenze liegen (E18 Abschnitt 6: KI-Analyse, Assessments, Ernährung).

Die Grenze verläuft dabei **nicht** zwischen den Leistungsbereichen. Ob
Software ein Medizinprodukt ist, entscheidet die Zweckbestimmung des
Herstellers, nicht der Vertragstyp und nicht die tatsächliche Nutzung.
Trainingsplanung ohne medizinische Zweckbestimmung ist kein Medizinprodukt;
ein Screening, das eine Trainingsfreigabe ausspricht, liefert Informationen
für eine gesundheitsbezogene Entscheidung und fällt unter **Regel 11** —
Klasse IIa mit Benannter Stelle. Genau deshalb hat E18 aus der Rechtslage
drei **Feature-Verbote** abgeleitet, statt es bei Punkt 4 zu belassen: Punkt 4
verbietet die klinische Aussage allgemein, die drei Verbote benennen die drei
Funktionen, an denen sie in diesem Produkt konkret entstehen würde.

## Entscheidung

1. Die erste Produktversion wird **nicht mit der Zweckbestimmung entwickelt,
   diagnostische oder therapeutische Entscheidungen zu treffen oder
   entsprechende Empfehlungen bereitzustellen**.
2. Die Anwendung darf Gesundheitsinformationen **erfassen, speichern,
   strukturieren und darstellen** sowie **transparente mathematische
   Berechnungen validierter Instrumente** durchführen.
3. **Patientenangaben dürfen unverändert beziehungsweise eindeutig auf ihre
   Quelle zurückführbar hervorgehoben werden.**
4. Die Anwendung darf in V1 **keine eigenen klinischen
   Risikoklassifikationen, Differentialdiagnosen, Therapieempfehlungen,
   Behandlungsauswahl oder automatisierten klinischen Entscheidungen**
   erzeugen.
5. **Generative KI wird in V1 für Dokumentation, sprachliche Transformation,
   Zusammenfassung und administrative Assistenz eingesetzt.** Sie darf **keine
   neue klinische Interpretation hinzufügen**, die als Grundlage einer
   diagnostischen oder therapeutischen Entscheidung bestimmt ist.
6. Features, die diese Grenze möglicherweise überschreiten, werden separat als
   **`MDR_REVIEW_REQUIRED`** klassifiziert und dürfen **vor einer
   dokumentierten regulatorischen Prüfung nicht produktiv aktiviert werden**.
7. **Vor Produktivstart** werden Zweckbestimmung und Abgrenzung gegenüber
   Medical Device Software **anhand der dann aktuellen MDR-/MDCG-Regeln extern
   überprüft**.
8. **Sprachdokumentation fällt unter Punkt 5** (Fassung 2) — Transkription des
   Gesprochenen und Einordnung in die Dokumentationsvorlage sind sprachliche
   Transformation und bleiben zulässig, solange nichts hinzukommt und nichts
   wegfällt. Für diesen Anwendungsfall gilt Punkt 5 **enger** als sonst: das
   dort ebenfalls erlaubte Zusammenfassen und Verdichten ist hier nicht
   gedeckt, weil eine Auslassung den Inhalt der Akte verändert. Erhalten
   bleiben Zahlen, Einheiten, Körperseiten, Verneinungen, geäußerte
   Unsicherheiten und die Unterscheidung zwischen Patientenaussage und eigener
   Beobachtung; unverständliche Stellen werden gekennzeichnet statt geraten.
   Eine ausdrücklich diktierte Einschätzung ist eine Aussage der Therapeut:in
   und keine hinzugefügte Interpretation. Eine Funktion, die darüber
   hinausgeht, ist nach Punkt 6 `MDR_REVIEW_REQUIRED`. Der vollständige
   Anforderungstext steht in `PROJECT_PRINCIPLES.md` §6.3.
9. **Die Zweckbestimmung gilt in beiden Leistungsbereichen** (Fassung 3). Die
   Punkte 1 bis 8 gelten unverändert auch für das Trainingsverhältnis nach
   ADR-021 und für Termine mit `context = 'training'` nach ADR-022. Dass
   Training keine Heilbehandlung ist, macht die MDR-Grenze nicht weiter,
   sondern nur die Rechtsgrundlage der Daten anders: Erhoben werden auch dort
   Gesundheitsangaben, und eine Funktion, die daraus eine gesundheitsbezogene
   Entscheidung trifft oder vorschlägt, ist im Training so
   `MDR_REVIEW_REQUIRED` wie in der Behandlung. Umgekehrt gilt auch die
   Erlaubnis aus Punkt 2 dort: Erfassen, Speichern, Strukturieren und
   Darstellen bleibt zulässig, und ein Trainingsprotokoll nach ADR-022 ist
   genau das.
10. **Keine automatische Übungsauswahl aus Diagnose oder Befund** (Verbot 1,
    Fassung 3). Zulässig sind Übungskatalog, Suche, Vorlagen, gespeicherte
    Zusammenstellungen und die Wiederverwendung dessen, was zuletzt benutzt
    wurde. **Unzulässig ist jede Funktion, die aus Diagnose, Befund,
    Screening-Antwort oder Verlauf heraus Übungen, Dosierung, Intensität oder
    Progression vorschlägt, vorsortiert, vorfiltert oder vorbelegt.** Die
    Auswahl trifft die behandelnde oder betreuende Person. Eine Sortierung
    nach Name, Körperregion, Gerät oder Benutzungshäufigkeit ist keine solche
    Vorauswahl; eine Liste „passend zu" einer klinischen Angabe ist es — auch
    dann, wenn die Regel dahinter offenliegt und ein Mensch die Liste danach
    bestätigt.
11. **Keine automatisierte Auswertung von Schmerzskala oder Verlauf mit
    Handlungsempfehlung** (Verbot 2, Fassung 3). Erfassen, Anzeigen und das
    Zeichnen eines Verlaufs über die Zeit sind nach Punkt 2 zulässig, ebenso
    die transparente Rechnung eines validierten Instruments nach
    veröffentlichter Rechenvorschrift. **Unzulässig ist die daraus abgeleitete
    Bewertung:** eigener Score, Risikoklasse, Ampel, Schwellenwertalarm oder
    ein Hinweis der Art „Verschlechterung", „Therapie anpassen", „Belastung
    reduzieren" — gleich ob als Text, Farbe, Symbol oder Benachrichtigung. Die
    Hervorhebung nach Punkt 3 und `PROJECT_PRINCIPLES.md` §7.1 bleibt
    unberührt, solange sie die Angabe selbst mit erkennbarer Quelle und nach
    einer offengelegten Regel sichtbar macht und nichts über ihre Bedeutung
    sagt. Der Unterschied ist der zwischen „NRS 8, Angabe vom 12.03." und
    „Schmerz verschlechtert".
12. **Kein Screening-Fragebogen, der selbst eine Trainingsfreigabe oder einen
    Abbruch ausspricht** (Verbot 3, Fassung 3). Ein Screening vor dem Training
    darf erhoben, gespeichert, vollständig angezeigt und nach Punkt 3
    hervorgehoben werden. **Unzulässig ist jede Ausgabe, die daraus Eignung,
    Freigabe, Kontraindikation, Abbruch oder eine Empfehlung zum Arztbesuch
    ableitet** — auch als Zwischenergebnis, auch als Vorbelegung eines Feldes,
    auch wenn ein Mensch sie danach bestätigt. Ein allgemeiner, immer gleicher
    Sicherheitshinweis, der nicht von den Antworten abhängt, ist keine solche
    Ableitung. Die Entscheidung über Aufnahme und Fortsetzung des Trainings
    trifft der Mensch und wird als seine Entscheidung dokumentiert.
13. **Die drei Verbote sind Ausschlusskriterien, nicht nur ein Prüfanlass**
    (Fassung 3). Eine Funktion, die eines von ihnen berührt, entsteht in V1
    nicht; sie ist zugleich nach Punkt 6 `MDR_REVIEW_REQUIRED` und darf ohne
    dokumentierte regulatorische Prüfung auch nicht hinter einem Schalter
    produktiv erreichbar sein. **Ein Feature-Flag ersetzt die Prüfung nicht.**
    Für die drei Bereiche des Trainingsbereichs an dieser Grenze — KI-Analyse,
    Assessments, Ernährung — gilt das vorab: Sie werden nicht zuerst
    geschnitten, und was von ihnen bleibt, ist die anzeigende und
    aufzeichnende Hälfte.

## Konsequenzen

- Die Zweckbestimmung wird ein eigenes, gepflegtes Dokument und ein bewusst
  gesetzter Rahmen. Sie ist kein Nebenprodukt der Feature-Entwicklung.
- §7.1 wird dadurch präzisiert: Erlaubt ist das **Anzeigen** einer vom
  Patienten selbst gemachten Angabe mit erkennbarer Quelle. Nicht erlaubt ist
  eine eigene **Bewertung** dieser Angabe in Form einer Risikoklasse, eines
  Scores oder einer Handlungsempfehlung. Die im Prinzipiendokument genannte
  Kombination aus Tumoranamnese und Gewichtsverlust darf als
  zusammengehörender Hinweis auf die zugrundeliegenden Angaben sichtbar
  gemacht werden; die klinische Bewertung bleibt beim Therapeuten.
- Validierte Instrumente dürfen nach veröffentlichter, nachvollziehbarer
  Rechenvorschrift ausgewertet werden. Die Rechnung selbst ist zulässig; eine
  daraus abgeleitete eigene klinische Aussage fällt unter Punkt 4.
- Die Trennung von LLM und Determinismus aus ADR-005 erhält damit eine
  inhaltliche Begründung: sie ist nicht nur Architekturhygiene, sondern Teil
  der regulatorischen Abgrenzung.
- Für generative KI folgt eine Entwurfsdisziplin: Umformulieren, Ordnen,
  Zusammenfassen und Verdichten sind zulässig; das Ergänzen einer Einschätzung,
  die in der Quelle nicht steht, ist es nicht — auch dann nicht, wenn die
  Funktion „Zusammenfassung" heißt. Das ist bei Verlaufszusammenfassungen und
  Berichtsentwürfen die schwierigste Stelle und braucht Prüfung je Feature.
- `MDR_REVIEW_REQUIRED` wird ein verbindliches Merkmal im Feature-Prozess. Es
  muss geführt, sichtbar und technisch wirksam sein: ein so markiertes Feature
  darf in der Produktionsumgebung nicht erreichbar sein, solange die Prüfung
  nicht dokumentiert vorliegt.
- Es entsteht bewusst eine Funktionslücke gegenüber dem technisch Möglichen.
  Das folgt der Prioritätenordnung aus §16, in der Patientensicherheit und
  korrekte Funktion über zusätzlichen Features stehen.
- Sprache und Darstellung in der Oberfläche werden regulatorisch relevant.
  „Hinweis auf Angabe" und „Warnung" sind nicht austauschbar; dasselbe gilt für
  Marketing- und Außendarstellung.
- Die externe Prüfung vor Produktivstart ist eine harte Voraussetzung mit
  Vorlauf und Kosten und gehört in die Terminplanung, nicht an deren Ende.
- **Die drei Verbote sind Ausgabeverbote, keine Datenverbote** (Fassung 3).
  Erhoben, gespeichert und angezeigt wird, was fachlich gebraucht wird; was
  nicht entsteht, ist die abgeleitete Aussage. Damit liegt die Grenze dort, wo
  sie sich prüfen lässt — an dem, was auf dem Bildschirm steht, nicht an dem,
  was in der Datenbank liegt.
- Der Zuschnitt eines Loops, der Screening, Verlaufsdaten, Übungen oder eine
  KI-Ausgabe berührt, benennt die drei Verbote und sagt, welche Ausgabe
  **nicht** entsteht. Das ist die Stelle, an der ein Verstoß auffällt, solange
  er noch billig ist; im fertigen Feature ist er teuer.
- Die Übungsbibliothek (UEB-EPIC-001/002) ist damit vorab beschrieben: Katalog,
  Suche, Vorlagen — keine Empfehlung. Eine Empfehlungsfunktion wäre nicht ein
  Feature mehr, sondern ein anderes Produkt mit Benannter Stelle.
- Drei Bereiche des Trainingsbereichs verlieren ihren verlockendsten Teil, und
  zwar bevor sie geschnitten werden. Das ist dieselbe bewusste Funktionslücke
  wie in Fassung 1 und folgt derselben Prioritätenordnung aus §16.
- Der Preis der Gegenseite steht damit fest: Ohne die Verbote greift Regel 11,
  also Klasse IIa mit Benannter Stelle, technischer Dokumentation, klinischer
  Bewertung und Qualitätsmanagementsystem. Das ist kein Mehraufwand an einem
  Feature, sondern ein anderer Produktzustand.
- Die Sprachregel aus Fassung 1 gilt im Training genauso: Was dort entsteht,
  heißt **Trainingsprotokoll**, nicht Befund, und **Screening-Antwort**, nicht
  Risikoeinschätzung. Beschriftung ist Zweckbestimmung.

## Bewusst nicht Bestandteil dieser Entscheidung

- Eine Aussage über spätere Versionen. Dies ist eine V1-Entscheidung; eine
  spätere Erweiterung der Zweckbestimmung wäre ein eigener ADR mit eigener
  regulatorischer Bewertung.
- Eine Einstufung in eine MDR-Risikoklasse oder ein Konformitätsbewertungsweg.
- Aufbau eines Qualitätsmanagementsystems, klinische Bewertung, technische
  Dokumentation im MDR-Sinn.
- Die Einordnung nach EU AI Act. Sie wird durch diesen ADR nicht getroffen und
  bleibt zu klären.
- Die Auswahl der prüfenden Stelle und der Zeitpunkt der externen Prüfung.
- Welche Instrumente in die Bibliothek nach §7 aufgenommen werden.
- Änderungen an `PROJECT_PRINCIPLES.md`; §6 und §7.1 bleiben unverändert. Der
  mit Version 0.5 neu hinzugekommene §6.3 (Sprachdokumentation) berührt beide
  nicht: er hält eine Produktentscheidung fest und zieht die Grenze aus Punkt 5
  und Punkt 8 dieses ADR nach, statt sie zu verschieben.
- **Auch Fassung 3 ändert nichts an Rang 1** (`PROJECT_PRINCIPLES.md`). Der
  Satz zur Zweckbestimmung, der nach §1 gehört, und die Sätze zu §4 und §14
  entstehen in **Schritt 5** aus E18, nicht hier. Punkt 11 beschreibt §7.1 nur
  an seiner Kante, er verschiebt ihn nicht.
- Die Steuerkennzeichen am Posten (E18 Abschnitt 3, **Schritt 4**: ADR-009 neue
  Fassung) und der Zuschnitt des Trainingsbereichs (E18 Abschnitt 6,
  Schritt 7).
- Eine technische Durchsetzung der drei Verbote: kein Schema, keine Migration,
  kein Code, kein Test. Sie wirken im Zuschnitt, in der Oberfläche und im
  Zweitreview — ein Verbot, etwas **nicht** zu bauen, lässt sich nicht
  serverseitig erzwingen.
- Eine Aussage darüber, ob eine der drei Funktionen in einer späteren Version
  entsteht. Das wäre nach Punkt 7 eine eigene regulatorische Bewertung.

## Offene Folgefragen

- Wer verfasst und pflegt die Zweckbestimmung, und in welchem Dokument?
- Wer entscheidet, dass ein Feature `MDR_REVIEW_REQUIRED` ist, und wo wird
  diese Klassifikation geführt? *Vermerk 2026-09-21: Das **Wo** ist
  beantwortet — `src/app/mdr.ts` (ANN-089). Das **Wer** bleibt offen.*
- Wie wird technisch sichergestellt und überprüfbar gemacht, dass ein so
  markiertes Feature produktiv nicht erreichbar ist? *Vermerk 2026-09-21: Für
  einen Eintrag mit eigener Adresse durch einen Riegel über der Routentabelle,
  geprüft in `src/app/mdr.test.ts` und
  `src/routes/AuthenticatedRoutes.test.tsx` (ANN-089). Für ein Ausgabeverbot
  ohne Adresse bleibt es beim Zuschnitt und beim Zweitreview, wie unten
  festgehalten.*
- Gilt die Anzeige eines veröffentlichten Cutoffs zu einem validierten
  Instrument bereits als Klassifikation im Sinne von Punkt 4?
- Wie wird verhindert und getestet, dass generative KI eine klinische
  Interpretation ergänzt — und woran wird ein Verstoß erkannt (§12)?
- Wie werden Hinweistexte und Beschriftungen sprachlich geführt, damit die
  Zweckbestimmung nicht durch die Oberfläche verschoben wird?
- Welche Stelle führt die externe Prüfung durch, wann, und in welcher Form
  wird das Ergebnis festgehalten?
- Wie verhält sich diese Abgrenzung zum EU AI Act, insbesondere zu
  Transparenzpflichten gegenüber Patienten und Beschäftigten?
- Was geschieht, wenn ein Feature nach Produktivstart die Grenze berührt —
  welcher Prozess greift dann?
- Woran wird bei einer Sprachdokumentation (Punkt 8) geprüft, dass nichts
  ergänzt und nichts ausgelassen wurde — und was ist der objektive Testfall
  dafür, wenn die Quelle gesprochene Sprache ist?
- Woran erkennt der Zweitreview bei Verbot 1 (Punkt 10), dass eine Sortierung
  der Übungsliste keine klinische Vorauswahl ist — reicht dafür die Frage,
  welche Felder in die Sortierung eingehen?
- Verschiebt ein statischer Sicherheitshinweis im Screening (Punkt 12) die
  Zweckbestimmung, wenn er neben Antworten steht, die ihn nahelegen — oder
  bleibt er auch dann unabhängig von ihnen?
- `MDR_REVIEW_REQUIRED` existiert bisher an keiner Codestelle, sondern nur in
  der Dokumentation. Mit drei benannten Verboten und drei benannten Bereichen
  wird die Frage aus Fassung 1 dringlicher: Wo wird die Klassifikation
  geführt, und wie wird sie technisch wirksam? *Vermerk 2026-09-21: Erledigt.
  Geführt wird sie in `src/app/mdr.ts` — sieben Einträge, jeder mit
  Fundstelle und dem Satz, welche Ausgabe nicht entsteht. Wirksam ist sie für
  die Einträge mit eigener Adresse: Sie ist reserviert und gesperrt, und es
  gibt keinen Schalter, der sie öffnet (ANN-089). Dieser Vermerk hält einen
  Stand fest und ändert keine Entscheidung; die Punkte 1 bis 13 bleiben
  unberührt.*

## Änderungshistorie

| Fassung | Datum      | Änderung                                                                                                                                                                                                                                          |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | 2026-08-28 | Erstfassung, angenommen.                                                                                                                                                                                                                          |
| 2       | 2026-09-08 | **Punkt 8 ergänzt:** Sprachdokumentation fällt unter Punkt 5, dort aber enger — kein Verdichten, keine inhaltliche Auslassung, Kennzeichnung unverständlicher Stellen; eine diktierte Einschätzung ist keine hinzugefügte Interpretation. Dazu eine offene Folgefrage zur Prüfbarkeit und eine Klarstellung zu `PROJECT_PRINCIPLES.md` §6.3. Anlass: Entscheidung von Jannes zur Sprachdokumentation (Version 0.5). Die Punkte 1 bis 7 sind unverändert. |
| 3       | 2026-09-20 | **Punkte 9 bis 13 ergänzt, angenommen:** Die Zweckbestimmung gilt in beiden Leistungsbereichen (Punkt 9, nach ADR-021 und ADR-022), dazu die drei Feature-Verbote aus E18 Abschnitt 4 — keine automatische Übungsauswahl aus Diagnose oder Befund (Punkt 10), keine automatisierte Auswertung von Schmerzskala oder Verlauf mit Handlungsempfehlung (Punkt 11), kein Screening-Fragebogen, der selbst eine Trainingsfreigabe oder einen Abbruch ausspricht (Punkt 12). Punkt 13 macht sie zu Ausschlusskriterien: Ein Feature-Flag ersetzt die Prüfung nicht, und KI-Analyse, Assessments und Ernährung werden nicht zuerst geschnitten. Anlass: Festlegungen des Projektinhabers vom 2026-09-17 (E18), Schritt 3 von sieben. Die Punkte 1 bis 8 sind unverändert und werden nur enger gefasst. |
