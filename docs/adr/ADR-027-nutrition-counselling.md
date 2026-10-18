# ADR-027: Ernährungsberatung als Zusatz zu Behandlung und Training, mit klassischem Ernährungstagebuch

## Status

**Angenommen (2026-10-18, Jannes).** Löst den Zuschnitt „Ernährung nur als Protokoll und
Zielwert im Training“ (B9 Punkt 6 vom 2026-09-22, ALT-EPIC-002) ab. Kein Code, keine Migration;
gebaut wird in ERN-EPIC-001 bis -006 (`docs/development/ROADMAP.md`).

## Datum

2026-10-18

## Kontext

B9 Punkt 6 hatte Ernährung am 2026-09-22 als **Protokoll und Zielwert ohne Urteil** in die Ansicht
der Trainingskund:innen geholt (`PROJECT_PRINCIPLES.md` §4.10, Version 0.27); die Zielwerte sollte
die Betreuung setzen, Kalorienzählen sollte standardmäßig aus sein (IDEA-ALT-005, -006). Ein
Entwurf danach (Branch `claude/modest-brown-7b15rr`, 2026-10-18, nicht gemergt) zeigte die Grenze
dieses Zuschnitts: ohne Lebensmitteldaten müssen Kund:innen Kalorien und Makronährstoffe selbst
eintragen – eine „halbe Sache“.

Jannes hat am 2026-10-18 neu entschieden:

- Ernährungsberatung ist eine **Zusatzleistung** zu bestehenden Angeboten – für Patient:innen
  **und** Trainingskund:innen. Jannes berät selbst.
- Gebaut wird eine **klassische Tracking-App** (Vorbilder Yazio, MyFitnessPal, Cronometer,
  Nutrilize), **im eigenen System**. Auslagern an einen Anbieter (geprüft: Nutrilize) ist
  verworfen: keine öffentliche Schnittstelle, zweite App und zweite Anmeldung, Gesundheitsdaten bei
  einem weiteren Anbieter mit § 203-Vertrag, kein gemeinsamer Verlauf mit Schmerz und Training.
  Die Trainingsplanung bleibt ebenfalls im eigenen System.
- Zielwerte entstehen aus **gewählten Formeln**, nicht nur von Hand; **Erinnerungen** sind
  optional möglich; die Person trägt ihr **Gewicht** selbst ein. Regeln, die einem klassischen
  Tracker im Weg stehen, werden geändert, wo kein höherrangiges Prinzip entgegensteht.

Rahmen: die Zweckbestimmung (ADR-006, dort Punkt 14 in Fassung 4), die Trennung der Verhältnisse
(ADR-021), Plattformzugang je Verhältnis (ADR-023), Benachrichtigungen (ADR-024), Aufbewahrung
(ADR-008), Abrechnung (ADR-009).

## Entscheidung

### A. Zuschnitt und Datenmodell

1. **Ein Ernährungsprofil hängt an genau einem Verhältnis** – an einer Akte oder an einem
   Trainingsverhältnis, nie direkt an `persons` (ADR-021 Punkt 5) und nie an beiden. Je Person ist
   höchstens **ein laufendes** Profil erlaubt; hat sie beide Verhältnisse, wählt die Beratung beim
   Anlegen, an welchem es hängt. Es entsteht kein Fremdschlüssel zwischen den Verhältnissen.
2. **Das Profil legt die Beratung an** (gebuchte Zusatzleistung) und beendet es; das Ende ist der
   Fristanker (Punkt 6). Das **Tagebuch** schaltet die Person auf der Plattform selbst ein und aus;
   Abschalten nimmt nichts weg.
3. **Rechtsgrundlage ist eine eigene, ausdrückliche Einwilligung** nach Art. 9 Abs. 2 lit. a DSGVO
   („Ernährungsberatung“) – auch an einer Akte: Ernährungsberatung ist keine Heilbehandlung, lit. h
   trägt sie nicht. Ohne Einwilligung kein Profil und kein Eintrag; ein Widerruf hält das Tagebuch
   an, die Daten folgen Punkt 6. Die Begleitung (ADR-023) sieht nichts; die rechtliche Vertretung
   mit Gesundheitssorge handelt wie die Person.
4. **Wer sieht und schreibt.** Eine eigene Fähigkeit „Ernährungsberatung“ (ADR-004), zunächst nur
   für `owner`. **Ausnahme zu ADR-021 Punkt 10 und zum offenen Lesen der Akte (ADR-004 Punkt 2):**
   Büro, Therapie, Teamleitung und Trainingsbetreuung lesen ein Ernährungsprofil nicht, auch nicht
   an „ihrem“ Verhältnis. Durchgesetzt in RLS und Funktionen, nie nur in der Oberfläche. Lesen und
   Schreiben weist das Datenmodell nach; keine neue Protokollaktion (ADR-010 Fassung 3), gelesen
   wird als Öffnen des Verhältnisses.
5. **Inhalt des Profils:** Körperdaten (Größe, Geburtsjahr aus den Stammdaten, Geschlecht für die
   Formel, optional Körperfettanteil), Aktivität (PAL), Ziel (abnehmen, halten, Muskelaufbau,
   zunehmen), Zielgewicht, berechnete und überschriebene Zielwerte (Energie, Eiweiß,
   Kohlenhydrate, Fett, Wasser), Notizen der Beratung. Das **Gewicht** trägt die Person selbst ein,
   die Beratung ebenfalls; es entsteht ein Verlauf. Keine Diagnose, kein Befund im Profil.
6. **Eigene Datenklasse „Ernährungsberatung“** (ADR-008 Fassung 6): Profil, Tagebuch, Gewicht,
   eigene Lebensmittel und Rezepte der Person werden **3 Jahre nach dem Ende des Profils**
   gelöscht, unabhängig von der Frist des Verhältnisses; fällt das Verhältnis früher, fallen sie
   mit ihm. Lebensmittel und Rezepte der Praxis sind Inhalt, keine Personendaten. Auskunft und
   Export (Art. 15, Art. 20) enthalten alles.

### B. Lebensmitteldaten

7. **Bundeslebensmittelschlüssel 4.0** (Max Rubner-Institut, seit 2025-12-16 lizenzkostenfrei) ist
   die Grundlage für allgemeine Lebensmittel und Gerichte; die Nutzungsbedingungen werden vor dem
   Import geprüft und im Repository vermerkt.
8. **Open Food Facts** liefert Markenprodukte und Barcodes – als **Auszug für Deutschland auf
   unserem eigenen Server** (ODbL, Quellenangabe in der Anwendung), regelmäßig aktualisiert. Die
   Anwendung fragt zur Laufzeit **keinen** fremden Dienst nach einem Lebensmittel oder Barcode:
   Die Frage verriete, was eine Person isst. Damit entsteht **kein neuer Anbieter** im Sinne von
   ADR-002.
9. **Eigene Lebensmittel und Rezepte** legen Person und Beratung an; Rezepte rechnen ihre Nährwerte
   aus den Zutaten. Nährwerte rechnet immer die Anwendung aus Lebensmittel und Menge – niemand tippt
   Makronährstoffe von Hand, außer bei einem eigenen Lebensmittel von der Verpackung.

### C. Tagebuch und Darstellung

10. **Klassisches Tagebuch:** Mahlzeiten (Frühstück, Mittag, Abend, Snacks), Suche, „zuletzt“,
    Favoriten, Mahlzeit oder Tag kopieren, Portionen (g, ml, Stück, Esslöffel und Portionsgrößen
    der Quelle), Wasser mit einem Tipp, Barcode-Scan mit der Kamera ohne Speichern eines Bildes.
11. **Darstellung wie bei klassischen Trackern ist zulässig:** verbleibende Kalorien („noch
    übrig“), Ring oder Balken je Makronährstoff, Überschreitung als solche benannt. Was nicht
    entsteht (ADR-006 Punkt 14): Bewertung einzelner Lebensmittel als gut oder schlecht,
    Krankheitsbezug, Aussagen über Gesundheit. Die Person kann **„Zahlen ausblenden“** – dann
    sieht sie Mahlzeiten ohne Kalorien und Makros; das ist ihre Einstellung, keine Vorgabe.
12. **Erinnerungen sind optional** und von Anfang an aus. Die Person stellt sie je Mahlzeit mit
    Uhrzeit ein. Sie sind eine neue Art im Katalog nach ADR-024 Punkt 13 mit festem Text **ohne
    Ernährungsbezug** („Erinnerung: Ihr Eintrag für heute“, Punkt 14 dort), über Push oder Mail,
    Ruhezeiten gelten, Abschalten kostet nichts (Punkt 15 dort). Keine Erinnerung von der Praxis an
    die Person über diesen Weg, kein Nachfassen bei ausbleibenden Einträgen, keine Serie als
    Druckmittel.
13. Kein Vergleich zwischen Personen (IDEA-ALT-007).

### D. Beratung und Abrechnung

14. **Pläne und Rezepte von der Beratung:** Jannes weist Tagesvorschläge, Pläne und Rezepte zu;
    die Auswahl trifft er (ADR-006 Punkt 10 gilt sinngemäß: keine Auswahl aus einer Diagnose).
    Startinhalte (Rezepte) gehören zum Lieferumfang.
15. **Abrechnung** über eine eigene Katalogposition „Ernährungsberatung“ mit Steuerkennzeichen am
    Posten (ADR-009 Fassung 2), auf der Rechnung des Bereichs, an dem das Profil hängt. Die
    umsatzsteuerliche Einordnung (voraussichtlich steuerpflichtig, keine Heilbehandlung) klärt G13
    mit B4; bis dahin trägt der Posten das Kennzeichen „steuerpflichtig 19 %“ als Voreinstellung.

### E. Formeln und Regeln der Zielwerte (ADR-006 Punkt 14)

16. **Grundumsatz:** Standard **Mifflin-St Jeor** (Gewicht, Größe, Alter, Geschlecht). Ist ein
    Körperfettanteil eingetragen, **Cunningham** (fettfreie Masse). Die Beratung kann je Profil auf
    **Katch-McArdle** oder **Harris-Benedict (revidiert)** umstellen. Eine Person ohne Angabe
    „weiblich“ oder „männlich“ rechnet mit dem Mittel beider Formelvarianten, sichtbar vermerkt.
17. **Gesamtumsatz:** Grundumsatz × **PAL** in den Stufen der DGE (1,4 · 1,6 · 1,8 · 2,0), gewählt
    über Alltagsbeispiele.
18. **Energieziel:** halten = Gesamtumsatz; abnehmen = −500 kcal am Tag, höchstens −20 % des
    Gesamtumsatzes; Muskelaufbau und zunehmen = +300 kcal. Nie unter dem Grundumsatz.
19. **Makronährstoffe:** Eiweiß 0,8 g je kg, ab 65 Jahren 1,0 g, bei Muskelaufbau oder im Training
    1,6 g (Beratung bis 2,0 g); Fett mindestens 30 % der Energie; Kohlenhydrate der Rest.
20. **Wasser:** 35 ml je kg, mindestens 1,5 l.
21. **Zielgewicht:** von der Person frei wählbar, aber nicht unter BMI 18,5; die Anwendung nennt die Zeit bis
    zum Ziel nur aus dem gewählten Energieziel, ohne Versprechen.
22. **Überschreiben:** Jeder Wert ist durch die Beratung überschreibbar und dann gekennzeichnet.
    Die Untergrenzen aus Punkt 18 und 21 gelten für die Berechnung und für die Wahl der Person,
    **nicht für die Überschreibung durch die Beratung** (Jannes 2026-10-18: „ich entscheide
    selbst“); ein Wert darunter ist als solcher gekennzeichnet. Die Werte der Punkte
    16 bis 21 stehen an **einer** Stelle im Code (eine Datei, getestet gegen veröffentlichte
    Rechenbeispiele).

## Konsequenzen

- Ernährung ist kein Teil mehr nur des Trainings; `PROJECT_PRINCIPLES.md` §4.6 und §4.10
  (Version 0.28) nennen sie als Zusatzleistung in beiden Bereichen.
- Die Zielwertberechnung ist eine transparente Rechnung nach ADR-006 Punkt 14 und geht mit in die
  externe MDR-Prüfung vor dem Start (Punkt 7 dort); bis dahin wird mit synthetischen Daten gebaut
  (§15.2).
- Die DSFA (ADR-007) bekommt einen eigenen Abschnitt: Ernährungs- und Gewichtsdaten mit
  Einwilligung, owner-only, eigene Frist. Echte Daten erst danach.
- Der Umfang ist groß. Er wird in sechs Epics mit Tipp-Budgets gebaut, mit einer Politurrunde für
  bestehende Bereiche nach ERN-EPIC-003; ein Epic ist fertig, wenn sein Budget gemessen ist.
- Die Pflege des Open-Food-Facts-Auszugs ist eine Betriebsaufgabe (Aktualisierung, Größe); sie
  steht in OPS, nicht in der Anwendung.
- **Verworfen:** Auslagerung an Nutrilize oder einen anderen Anbieter (siehe Kontext); ein
  Protokoll ohne Lebensmitteldaten; Zielwerte nur von Hand.

## Offene Folgefragen

- Ob ein Profil später auch ohne Akte oder Trainingsverhältnis entstehen soll (reine
  Ernährungsberatung als eigenes Verhältnis nach ADR-021) – erst, wenn es solche Kund:innen gibt.
- Ob weitere Rollen die Fähigkeit „Ernährungsberatung“ bekommen (eine angestellte Fachkraft).
- Die berufsrechtliche Grenze der Beratung bei Patient:innen mit Erkrankung (B9, Diätassistentengesetz):
  eine Frage an die Rechtsberatung, kein Hindernis für das Bauen.
