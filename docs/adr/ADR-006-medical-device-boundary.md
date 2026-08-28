# ADR-006: Abgrenzung gegenüber Medical Device Software

## Status

Angenommen

## Datum

2026-08-28

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
- Änderungen an `PROJECT_PRINCIPLES.md`; §6 und §7.1 bleiben unverändert.

## Offene Folgefragen

- Wer verfasst und pflegt die Zweckbestimmung, und in welchem Dokument?
- Wer entscheidet, dass ein Feature `MDR_REVIEW_REQUIRED` ist, und wo wird
  diese Klassifikation geführt?
- Wie wird technisch sichergestellt und überprüfbar gemacht, dass ein so
  markiertes Feature produktiv nicht erreichbar ist?
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
