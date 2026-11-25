# Schwellwertprüfung zur Datenschutz-Folgenabschätzung

Entwurf von Claude, Stand 25. November 2026; geht mit B2 an die Datenschutzberatung (ANN-873).
Geprüft wird nach ADR-007 Punkt 3, ob die acht Verarbeitungen aus [`vvt.md`](vvt.md) einer DSFA nach
Art. 35 DSGVO unterliegen. Maßstab sind Art. 35 Abs. 3 DSGVO, die Muss-Liste der
Datenschutzkonferenz (nicht-öffentlicher Bereich, Version 1.1 vom 17.10.2018) und die neun Kriterien
der Leitlinie WP 248 Rev. 01: Treffen zwei zu, ist die DSFA in den meisten Fällen Pflicht.

## Ergebnis

**Eine DSFA ist Pflicht.** Auslöser sind die Plattform (VVT 4 und 5) und die KI-Assistenz (VVT 8).
Für den Rest wäre sie bei einer einzelnen Praxis nicht vorgeschrieben; ADR-007 Punkt 1 verlangt sie
trotzdem. Es entsteht eine DSFA über alle acht (Art. 35 Abs. 1 Satz 2 DSGVO).

## Prüfung

- **Umfang (Art. 35 Abs. 3 lit. b): nein.** Die Verarbeitung durch einen einzelnen Angehörigen
  eines Gesundheitsberufs ist nicht umfangreich (Erwägungsgrund 91), in der Regel auch nicht mit
  angestellten Behandelnden (Beschluss der Datenschutzkonferenz vom 26.04.2018, Punkt 2). Damit
  greifen auch die Nummern 3, 4 und 8 der Muss-Liste nicht (Berufsgeheimnis, Aufenthalt, Verhalten
  von Beschäftigten); Wege und Fahrzeiten je Person speichert die Software nicht (§20).
- **Plattform (VVT 4 und 5): ja.** Nummer 16 der Muss-Liste: Gesundheitsdaten, auch wenn nicht
  umfangreich, die wiederholt über eine mobile Anwendung erhoben und zentral empfangen und
  aufbereitet werden. Patient:innen und Kund:innen melden Einheiten, Schmerz, Fragebögen, Fotos und
  Videos. Sensoren wie im Beispiel der Liste gibt es nicht; die Beschreibung trifft trotzdem zu.
  Nummer 17 (Leistungsfähigkeit aus Messdaten) greift nicht: keine
  Wearables, der Verlauf wird gezeigt, nicht bewertet (§17).
- **KI-Assistenz (VVT 8, noch abgeschaltet): ja.** Drei Kriterien: höchst persönliche Daten (4),
  schutzbedürftige Betroffene (7), neue Technologie (8), weil Ton, Texte der Dokumentation und
  Fotos von Verordnungen an einen KI-Anbieter gehen sollen. Die Nummern 11 und 13 der Muss-Liste
  greifen nicht: Die Assistenz ordnet und formuliert Texte der Praxis, bewertet niemanden, und
  Patient:innen haben keinen Kontakt mit ihr.
- **Übrige (VVT 1 bis 3, 6, 7): nein.** Zwei Kriterien treffen zu, (4) und (7) mit Patient:innen
  und Beschäftigten; für die einzelne Praxis verneint Erwägungsgrund 91 die Pflicht, die Leitlinie
  nennt sie als Beispiel ohne DSFA. Nicht erfüllt: Bewerten (1), automatisierte Entscheidung (2),
  Überwachung (3), Umfang (5), Zusammenführen (6), Hindern an einem Recht (9). Scores sind offene
  Rechenregeln, Entscheidungen trifft die Therapeut:in (§17), Behandlung und Training bleiben
  getrennt (ADR-021), Umsatz je Person dient der Vergütung (§20, ANN-156).

## Folgen

- **Datenschutzbeauftragte Person:** bei DSFA-Pflicht unabhängig von der Zahl der Beschäftigten zu
  benennen (§ 38 Abs. 1 Satz 2 BDSG, ADR-007 Punkt 4), vor den ersten echten Daten, mit Meldung an
  die Aufsichtsbehörde (Art. 37 Abs. 7 DSGVO) und Kontakt in der Datenschutzinformation (Art. 13
  Abs. 1 lit. b DSGVO). Jannes hat sich am 2026-09-08 vorläufig für eine externe entschieden (B2).
- **DSFA:** folgt als `dsfa.md` nach TOM und Auftragsverarbeitern; die datenschutzbeauftragte Person
  berät dabei (Art. 35 Abs. 2 DSGVO).
- **Wiedervorlage:** bei jeder Änderung aus ADR-007 Punkt 2 und sobald die Praxis Behandelnde
  anstellt. Offen für B2: ob Nummer 16 ohne Sensoren greift und ob Scores als Bewerten zählen.
