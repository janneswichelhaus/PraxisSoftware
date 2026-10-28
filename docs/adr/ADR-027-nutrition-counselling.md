# ADR-027: Ernährungsberatung als Zusatz zu Behandlung und Training, mit klassischem Ernährungstagebuch
## Status
Angenommen, Fassung 1 (2026-10-18, Jannes); löst den Zuschnitt aus B9 Punkt 6 (2026-09-22) ab.

## Kontext
Ernährungsberatung wird Zusatzleistung für Patient:innen und Trainingskund:innen statt Protokoll und
Zielwert im Training (B9 Punkt 6, §4.10), als klassischer Tracker im eigenen System wie die
Trainingsplanung; Regeln, die dem im Weg stehen, ändern sich, wo kein höherrangiges Prinzip
entgegensteht. Abschnitt A: Punkte 1–6, B: 7–9, C: 10–13, D: 14–15, Abschnitt E: 16–22 (Formeln und
Regeln).

## Entscheidung
1. **Ein Ernährungsprofil hängt an genau einem Verhältnis** (Akte oder Trainingsverhältnis), nie
   direkt an `persons` (ADR-021 Punkt 5), nie an beiden; je Person höchstens ein laufendes, bei
   beiden Verhältnissen wählt die Beratung. Kein Fremdschlüssel zwischen den Verhältnissen.
2. **Die Beratung legt das Profil an** (gebuchte Zusatzleistung) und beendet es; das Ende ist
   Fristanker (Punkt 6). Das Tagebuch schaltet die Person auf der Plattform an und aus, verlustfrei.
3. **Rechtsgrundlage ist eine eigene, ausdrückliche Einwilligung** „Ernährungsberatung“
   (Art. 9 Abs. 2 lit. a DSGVO), auch an einer Akte (nicht lit. h): ohne sie kein Profil, kein
   Eintrag; Widerruf hält das Tagebuch an (Daten: Punkt 6). Begleitung sieht nichts, rechtliche
   Vertretung mit Gesundheitssorge handelt wie die Person.
4. **Nur die Fähigkeit „Ernährungsberatung“** (ADR-004, `app.can_counsel_nutrition`, zunächst
   `owner`) liest und schreibt, abweichend von ADR-021 Punkt 10 und vom offenen Lesen der Akte
   (ADR-004 Punkt 2): Büro, Therapie, Teamleitung und Trainingsbetreuung lesen kein Profil, auch
   nicht am eigenen Verhältnis, durchgesetzt in RLS und Funktionen. Nachweis ist das Datenmodell,
   keine neue Protokollaktion (ADR-010 Fassung 3); Lesen zählt als Öffnen des Verhältnisses.
5. **Inhalt** (`nutrition_profiles`): Körperdaten (Geburtsjahr aus den Stammdaten, Geschlecht für
   die Formel), PAL, Ziel, Zielgewicht, berechnete und überschriebene Zielwerte, Notizen der
   Beratung, **keine Diagnose, kein Befund**; Gewicht tragen Person und Beratung als Verlauf ein.
6. **Datenklasse „Ernährungsberatung“** (ADR-008 Fassung 6): Profil, Tagebuch, Gewicht, eigene
   Lebensmittel und Rezepte fallen 3 Jahre nach Ende des Profils, unabhängig vom Verhältnis; fällt
   es früher, mit ihm; die der Praxis sind Inhalt. Auskunft und Export (Art. 15, 20 DSGVO): alles.
7. **Bundeslebensmittelschlüssel 4.0** (Max Rubner-Institut, lizenzkostenfrei seit 2025-12-16) für
   allgemeine Lebensmittel und Gerichte; Nutzungsbedingungen vor dem Import prüfen und im
   Repository vermerken.
8. **Open Food Facts** für Markenprodukte und Barcodes als Auszug für Deutschland auf eigenem Server
   (ODbL, Quellenangabe in der Anwendung), regelmäßig aktualisiert; zur Laufzeit fragt die Anwendung
   keinen fremden Dienst nach Lebensmittel oder Barcode (kein neuer Anbieter, ADR-002).
9. **Eigene Lebensmittel und Rezepte** von Person und Beratung, Rezepte aus den Zutaten gerechnet.
   Nährwerte rechnet immer die Anwendung, von Hand nur bei eigenen Lebensmitteln von der Verpackung.
10. **Klassisches Tagebuch:** Mahlzeiten (Frühstück, Mittag, Abend, Snacks), Suche, „zuletzt“,
    Favoriten, Mahlzeit oder Tag kopieren, Portionen (g, ml, Stück, Esslöffel, Portionsgrößen der
    Quelle), Wasser mit einem Tipp, Barcode-Scan per Kamera ohne gespeichertes Bild.
11. **Tracker-Anzeige ist zulässig:** verbleibende Kalorien, Ring oder Balken je Makronährstoff,
    Überschreitung als solche; nie Bewertung einzelner Lebensmittel als gut oder schlecht,
    Krankheitsbezug oder Aussagen über Gesundheit. „Zahlen ausblenden“ wählt die Person selbst.
12. **Erinnerungen sind optional,** anfangs aus, von der Person je Mahlzeit mit Uhrzeit gestellt:
    eine Art im Katalog nach ADR-024 Punkt 13 mit festem Text ohne Ernährungsbezug, per Push oder
    Mail, Ruhezeiten gelten, Abschalten kostet nichts (Punkte 14, 15 dort). Keine Erinnerung der
    Praxis auf diesem Weg, kein Nachfassen bei ausbleibenden Einträgen, keine Serie als Druckmittel.
13. **Kein Vergleich zwischen Personen** (IDEA-ALT-007).
14. **Tagesvorschläge, Pläne und Rezepte** weist Jannes zu und wählt selbst aus, nie aus einer
    Diagnose (ADR-006 Punkt 10 sinngemäß); Startinhalte (Rezepte) gehören zum Lieferumfang.
15. **Abrechnung:** Katalogposition „Ernährungsberatung“ im Bereich des Profils, Steuerkennzeichen
    am Posten (ADR-009 Fassung 2), voreingestellt „steuerpflichtig 19 %“, bis G13 mit B4 klärt.
16. **Grundumsatz:** Standard Mifflin-St Jeor (Gewicht, Größe, Alter, Geschlecht), mit Körperfett
    Cunningham; die Beratung stellt je Profil auf Katch-McArdle oder Harris-Benedict (revidiert) um.
    Ohne Angabe „weiblich“ oder „männlich“ das Mittel beider Varianten, sichtbar vermerkt.
17. **Gesamtumsatz** = Grundumsatz × PAL (DGE: 1,4 · 1,6 · 1,8 · 2,0, per Alltagsbeispiel gewählt).
18. **Energieziel:** halten = Gesamtumsatz; abnehmen −500 kcal am Tag, höchstens −20 % des
    Gesamtumsatzes; Muskelaufbau und zunehmen +300 kcal; nie unter dem Grundumsatz.
19. **Makronährstoffe:** Eiweiß 0,8 g je kg, ab 65 Jahren 1,0 g, bei Muskelaufbau oder im Training
    1,6 g (Beratung bis 2,0 g); Fett mindestens 30 % der Energie; Kohlenhydrate der Rest.
20. **Wasser:** 35 ml je kg, mindestens 1,5 l.
21. **Zielgewicht:** von der Person frei wählbar, nicht unter BMI 18,5; die Zeit bis zum Ziel nur
    aus dem gewählten Energieziel, ohne Versprechen.
22. **Überschreiben** nach ADR-006 Punkt 14 (d); ein Wert unter den Untergrenzen aus Punkt 18 und 21
    ist zusätzlich als solcher gekennzeichnet. Die Werte der Punkte 16 bis 21 stehen nur in
    `app.nutrition_calculation`, getestet an veröffentlichten Rechenbeispielen.

## Konsequenzen
- Die DSFA (ADR-007) erhält einen eigenen Abschnitt (Ernährungs- und Gewichtsdaten mit Einwilligung,
  nur `owner`, eigene Frist); echte Daten erst danach. ERN-Epics sind erst mit gemessenem
  Tipp-Budget fertig. Den Open-Food-Facts-Auszug pflegt der Betrieb (OPS: Aktualisierung, Größe).

## Offene Folgefragen
- Profil ohne Akte oder Trainingsverhältnis, als eigenes Verhältnis (ADR-021)? Erst bei Bedarf.
- Bekommen weitere Rollen die Fähigkeit „Ernährungsberatung“, etwa eine angestellte Fachkraft?
- offen: B9 (OPEN_DECISIONS), Berufsrecht bei Patient:innen mit Erkrankung (Diätassistentengesetz).

## Änderungshistorie
- Fassung 1 (2026-10-18, Jannes): Profil an einem Verhältnis mit Einwilligung, nur `owner`; BLS 4.0
  und Open-Food-Facts-Auszug; Tracker-Anzeige, Erinnerungen, Gewicht; Zielwerte nach Abschnitt E.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
