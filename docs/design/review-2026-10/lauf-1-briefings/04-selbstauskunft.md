# Briefing 4 – Selbstauskunft und Tagebuch

Für Claude Design. Hebel 4 von 7. Quelle: Design-Review Lauf 1 vom 21.10.2026 (Befunde DR-125,
DR-141 bis DR-146, DR-161). Baut auf der Plattform-Sprache aus Briefing 1 auf; liegt deren Ergebnis
nicht vor, gelten die Leitplanken unten.

## Kontext

Own Motion ist eine private Physiotherapiepraxis in Tübingen (Eröffnung Juli 2027); jede Behandlung
ist ein Hausbesuch per Lastenrad. Zur Praxissoftware gehört eine Web-App für Patient:innen und
Trainingskund:innen, die „Plattform“: am eigenen Telefon (375 px zuerst), auch am Rechner, für
Menschen bis 78 Jahre, Anrede „Sie“.

Hier geben Menschen selbst etwas an – und die Software **bewertet es nie**: keine Ampel, kein
Score, keine Trendlinie mit Deutung, kein Lob. Die Angaben liest die Therapeutin beim nächsten
Termin; niemand überwacht sie laufend. Vier Stellen:

1. **Fragebogen vor dem ersten Termin** (heute „Anamnesebogen“): Beruf, Sport, Körperbild „Wo haben
   Sie Beschwerden?“, Schmerz 0–10, ja/nein, Mehrfachwahl; sieben Schritte; jede Frage darf offen
   bleiben; Zwischenspeichern.
2. **Check-in** zwischen den Terminen: wenige kurze Fragen (meist Skala 0–10 mit Ankern), „Ihre
   letzte Angabe“, danach ein fester Satz, wer die Angaben wann liest. Dazu kurze Angaben nach einer
   Übungseinheit.
3. **Meine Angaben** (Verlauf) und **Gewohnheiten** (kleine vereinbarte Gewohnheiten, Tage
   abhaken, ohne Serie: „Ein Tag ohne Haken ist einfach ein Tag ohne Haken“).
4. **Ernährung** als gebuchte Zusatzleistung: Zielwerte, Gewicht, **Tagebuch** (ein Tag, Wasser,
   Mahlzeiten), Lebensmittel nachschlagen und eigene anlegen.

## Ziel

Angaben machen soll sich anfühlen wie bei Apple Health oder How We Feel: eine Frage, eine klare
Antwort, ruhig, ohne Prüfungsgefühl. Heute sind die Seiten vollständig und ehrlich, aber lang und
kastig: sechs Fragen auf einem Bildschirm, eine Skala, die in 6 + 5 umbricht, ein Tagebuch aus
Kästen mit dunklen Balken und dreimal „Nichts eingetragen.“

## Ist-Zustand (Bilder zum Hochladen, Ordner `fuer-claude-design/04-selbstauskunft/`)

| Datei                           | Was zu sehen ist                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `01-fragebogen-375.png`         | Fragebogen Schritt 1 von 7 (2 491 px lang): Titel „Anamnesebogen Version 8 (DIGOTOR)“, sechs Fragen, drei Aktionen.  |
| `02-checkin-375.png`            | Check-in mit drei Fragen auf einer Seite, Skala 0–10 in zwei ungleichen Reihen, „Ihre letzte Angabe: 3“.             |
| `03-checkin-danke-375.png`      | Nach dem Absenden: grüne Rückmeldung mit dem festen Satz.                                                            |
| `04-meine-angaben-375.png`      | „Meine Angaben“: acht kleine Punktbilder untereinander (3 131 px), je mit Achse und Ankern.                          |
| `05-gewohnheiten-375.png`       | Gewohnheiten: Tage als Pillen mit Haken, „Pausieren, etwa bei Krankheit“.                                            |
| `06-checkin-leer-375.png`       | Leerzustand: „Ihre Praxis hat zurzeit keinen Check-in für Sie eingestellt.“                                          |
| `07-ernaehrung-375.png`         | Ernährung: Tagebuch, Gewicht eintragen, Verlauf, Zielwerte, Rechenweg, Lebensmittel, Einstellungen, Kleingedrucktes. |
| `08-tagebuch-375.png`           | Tagebuch: Restenergie, drei Balken, Wasser, je Mahlzeit Etikett + „Eintragen“ + leere Karte.                         |
| `09-tagebuch-eintragen-375.png` | Mahlzeit eintragen: Suche, „Zuletzt“ mit „+“, eigene Lebensmittel, Lizenzzeile doppelt.                              |
| `10-lebensmittel-375.png`       | Lebensmittel nachschlagen.                                                                                           |

Was trägt: das Körperbild, die Anker an der Skala („0 = keine, 10 = stärkste vorstellbare“), der Ton
der Gewohnheiten (keine Serie, die abreißt), der Satz unter „Meine Angaben“ („Was sie für Sie
bedeuten, besprechen Sie mit Ihrer Praxis“).

## Probleme nach Schwere

**S2:**

- Fragebogen: sechs Fragen je Schritt auf 2 491 px, drei Aktionen am Ende, große Textfelder für
  kurze Angaben (DR-141); Fachtitel „Anamnesebogen Version 8 (DIGOTOR)“ (DR-125).
- Skala 0–10 bricht bei 375 px in 6 + 5 – sie liest sich nicht mehr als Linie (DR-142).
- Tagebuch im Kastenlook: dunkle Balkenspur, Versal-Etiketten, dreimal dieselbe leere Karte
  (DR-145).

**S3:**

- „Meine Angaben“ als Stapel kleiner Punktbilder (DR-161).
- Leerzustände als ein Satz in einer Karte, ohne Perspektive (DR-143).
- Rückweg „Zur Übersicht“, obwohl man aus „Ich“ kam (DR-144); Lizenzzeile doppelt (DR-146).

## Referenzmuster

- **Apple Health, Gemütszustand** (Store und Hilfe): eine Frage je Bildschirm, Klartext über dem
  Wert, Vertiefung freiwillig, Nachtragen erlaubt. Nicht: Farbe als Wertung, Schieberegler (zu
  feinmotorisch).
- **Bearable** (App Store, gesehen): 0–10 als große Zifferntasten in zwei gleich langen Reihen,
  Notizfeld, „Fertig“. Nicht: Korrelationen, Rot/Grün.
- **How We Feel** (App Store, gesehen): Verlauf als ruhiger Kalender ohne Zahl; das
  Datenschutzversprechen als eigener Bildschirm. Nicht: Teilen mit Freunden.
- **AteMate** (App Store, gesehen): der Tag als Strom aus Mahlzeiten und Wasser, ohne Schuld. Nicht:
  Gesundheits-Score, KI-Coach.
- **Kaia** (App Store, gesehen): Werte je Tag als Balken mit Zahl, Anker im Untertitel, Tage ohne
  Eintrag bleiben leer. Nicht: „angepasst an deine Schmerzintensität“.

## Bildschirme und Zustände

1. **Fragebogen vor dem ersten Termin** (geführt): ein Thema je Schritt, Körperbild vorn und hinten
   mit Liste als Alternative, Skala, ja/nein, Mehrfachwahl, kurze Felder; Speichern leise oder im
   Hintergrund; Abschluss „Danke – Ihre Therapeutin geht den Bogen beim ersten Termin mit Ihnen
   durch“. Zustände: Entwurf vorhanden („weiter ausfüllen“), schon abgeschickt, Fehler beim Senden,
   ohne Netz.
2. **Check-in:** eine Frage je Bildschirm oder alle auf einem (Entscheidung mit Empfehlung), Skala in
   zwei gleich langen Reihen oder senkrecht, letzte Angabe dezent, Danke-Satz. Zustände: keiner
   eingestellt, Einwilligung fehlt (im Training: „Ihre Praxis bittet um einen Check-in“ mit Weg zur
   Einwilligung), schon beantwortet, Lesefrist.
3. **Angaben nach der Übungseinheit** (kommt aus Briefing 2): dieselben Skalen.
4. **Meine Angaben:** je Frage eine ruhige Zeile mit letztem Wert und Datum, Verlauf auf Abruf
   (Punkte oder Balken mit Zahl, keine Linie), „alle Antworten als Tabelle“.
5. **Gewohnheiten:** Tage abhaken mit sichtbarem Zustand, Pausieren und Fortsetzen; keine Serie.
6. **Ernährung, Tagebuch, Eintragen, Lebensmittel:** ein Tag als ruhiger Strom (Mahlzeiten als
   Zeilen mit „+“, leere Mahlzeiten zusammengefasst, Wasser mit großen Tasten), Zielwerte als
   ruhige Angaben ohne Wertung, Gewicht eintragen, eigenes Lebensmittel anlegen, Erinnerungen.

## Feste Grenzen

**Marke** (unverändert): Wortmarke „OWN / MOTION“ nur als gelieferte Datei – nicht umfärben, drehen,
dehnen, keine Kontur, kein Schatten, kein Piktogramm und kein Rad daneben; Schutzraum die Höhe der
MOTION-Zeile; Mindesthöhe 24 px. Farben: Hauptfarbe #004429, Tiefgrün #042c1b, Papier #f6f7f4.

**Werte der App:** Fläche #ffffff, Vertiefung #f4f5f7, Tinte #14181b, Leise #5a6169, Linie #e6e8eb,
Linie stark #767c84, Spur von Balken #8c939b (die leere Länge muss sich mit mindestens 3:1 vom Grund
abheben), Hauptfarbe #004429, Salbei hell #e1f0e4, Warnung #5a4300 auf #f3ead6, Fehler #7a2418 auf
#f4e3e0. Schrift Hanken Grotesk. Radien: Knopf und Feld 10, Karte 14, Bild 16, Pille rund. Knopf
48 px, kompakt 44. Rhythmus 4/8/12/16/24/32 px.

**Darf auf der Plattform abweichen:** Bilder (Platzhalter, keine KI-Bilder), mehr Weißraum (40/48
px), eine Schattenstufe, Markenfläche Tiefgrün, eigene Schriftskala ab 18 px, ruhige Bewegung.
Nicht: neue Farbfamilie, Dunkelmodus, zweite Fassung der Marke.

**Bausteine** (Werte dürfen sich ändern, nicht die Rolle): Seitenkopf, Abschnitt, Liste aus ganzen
Zeilen, Kachel, Knopf, Symbolknopf, Chip, Segment, Skala 0–10 (mindestens 44 px je Stufe),
Schieberegler (nur wo es heute einen gibt), Statuszeichen, Rückmeldung, Rückfrage, Fenster,
geführter Ablauf, Formularfuß, Verlaufstabelle, Laden/Fehler/Leer, Kleingedrucktes, Aufklapper.

**Nicht verhandelbar:**

- 375 px zuerst, dann 1280 px; Ziele ≥ 44 px; 200 % Zoom (188 px) und „Sehr groß“ ohne Verlust
  (die Skala darf dann umbrechen, aber in gleich langen Reihen).
- Kontrast ≥ 4,5:1 für Text, ≥ 3:1 für Linien; Farbe nie allein; sichtbarer Fokus.
- **Keine Bewertung:** keine Farbe als Wertung (kein Grün für „gut“, kein Rot für „schlecht“), keine
  Trendlinie, kein Satz über die Bedeutung eines Werts, kein Score, keine Serie, kein Lob.
- Fester Satz nach dem Check-in bleibt inhaltlich: „Danke. Ihre Therapeut:in sieht Ihre Angaben beim
  nächsten Termin.“ mit dem Notfallhinweis (112, 116117).
- Keine neuen Fragen, keine neuen Funktionen; die Inhalte des Fragebogens bleiben.
- Sprache: „Sie“; „Fragebogen vor dem ersten Termin“ statt „Anamnesebogen Version 8 (DIGOTOR)“
  (Quelle ins Kleingedruckte); Fachwörter nur mit Erklärung.
- Nur synthetische Daten.
- „Bewegung reduzieren“: nur Farbe.

## Gewünschtes Ergebnis

1. Entwürfe bei **375 px** und **1280 px** für die Bildschirme oben, je mit normal, leer, laden,
   Fehler, ohne Netz; „Sehr groß“ und 200 % für Skala und Fragebogen; offene Tastatur beim
   Eintragen.
2. Zwei Varianten für den Check-in (eine Frage je Bildschirm / alle auf einem), mit Empfehlung.
3. Übergabe für Claude Code im Format der bisherigen Handoffs (Markdown): 0 Entscheidungen · 1
   Geltung · 2 Tokens · 3 Bausteine · 4 Layout und Responsive · 5 Bildschirme mit Maßen und Texten
   (neue Texte _neu_) · 6 Barrierefreiheit · 7 Bewegung · 8 Prüfung · 9 Reihenfolge der Umsetzung
   (je Schritt ein Pull Request) · 10 Beim Bauen nachzutragen.
