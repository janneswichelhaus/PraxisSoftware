# Score-Inventar

Lesbare Fassung von [`Score-Inventar_Praxissoftware_v1.xlsx`](Score-Inventar_Praxissoftware_v1.xlsx).
Erzeugt am 2026-09-21 aus den Blättern **Inventar**, **Scoring** und **Quellen**; die Tabelle
bleibt die Quelle, diese Datei ist ihre Wiedergabe. Wo beide auseinandergehen, gilt die Tabelle.

**Die Feldwerte sind wörtlich übernommen**, samt der ASCII-Umschrift der Vorlage
(„Wirbelsaeule", „Huefte") und samt der Hinweise „im PDF nicht angegeben" und „im PDF nicht
geregelt". Diese Hinweise sind Befunde, keine Lücken zum Auffüllen.

## Anleitung (Blatt 1)

- **Score-Inventar fuer die Praxissoftware**
- **18 Scores aus dem Download-Bereich von digotor.info | Stand: 20.09.2026 | Version 1.0**
- **Zweck** — Entscheidungsgrundlage: welche Scores kommen in welcher Reihenfolge in die Software, und welche Rechte muessen vorher geklaert sein.
- **Blatt 'Inventar'** — Klinische und psychometrische Eckdaten je Score: Items, Antwortformat, Wertebereich, Richtung, Subskalen, MCID/MDC, Interpretation.
- **Blatt 'Scoring'** — Rechenregeln und Sonderfaelle (fehlende Werte, nicht gewertete Items) - die Vorlage fuer die JSON-Definition.
- **Blatt 'Quellen'** — Zitate, Dateinamen und Direktlinks zu den Original-PDFs.
- **WICHTIG - Itemtexte** — Layout, Logo und Farben gehoeren der Marke, der Wortlaut gehoert dem Instrument. Eine geaenderte Formulierung hebt die Validitaet und die Vergleichbarkeit mit den Normwerten auf - Cut-offs und MCID gelten dann nicht mehr.
- **WICHTIG - offene Felder** — Wo 'im PDF nicht angegeben' oder 'im PDF nicht geregelt' steht, fehlt die Angabe in der Quelle. Diese Felder sind vor der Implementierung aus der Primaerliteratur zu ergaenzen oder bewusst selbst festzulegen - nicht zu schaetzen.
- **Umfang (live aus dem Inventar)**
- **Eintraege gesamt** — 18
- **Prioritaet A (Kern/Basis)** — 14
- **Prioritaet B (Erweiterung)** — 4
- **Items gesamt (nur eindeutig bezifferte)** — 311

## Die 18 Einträge

### 1 · Anamnesebogen V8 — Anamnesebogen Version 8 (DIGOTOR)

- **Region / Domäne:** Allgemein / Erstkontakt
- **Konstrukt:** Anamnese, Schmerzlokalisation, Red Flags, Vorgeschichte
- **Ausgefüllt von:** Patient
- **Items:** 39 nummerierte Fragen (gemischt)
- **Antwortformat:** Ja/Nein, Mehrfachauswahl, NRS 0-10, Freitext
- **Wertebereich:** kein Summenscore
- **Richtung:** n/a (kein Score)
- **Subskalen:** keine
- **MCID / MDC:** n/a
- **Interpretation / Cut-offs:** Screening-Instrument: Schmerzbild, Verlauf, Provokation/Linderung, neuropathische Merkmale
- **Sprachversion:** Deutsch (Originaldokument DIGOTOR)
- **Priorität:** A - Basis
- **Scoring-Regel:** Kein Scoring - reine Informationserfassung
- **Fehlende Werte:** n/a
- **Quelle (Validierung / Original):** DIGOTOR GbR, Version 8, 07/2026
- **Datei:** `Anamnesebogen_Version-8_DIGOTOR_07-2026.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/07/Anamnesebogen_Version-8_DIGOTOR_07-2026.pdf

### 2 · ODI — Oswestry Disability Index

- **Region / Domäne:** Wirbelsaeule / LWS
- **Konstrukt:** Funktionseinschraenkung bei Rueckenschmerz
- **Ausgefüllt von:** Patient
- **Items:** 10 Sektionen
- **Antwortformat:** je 6 Aussagen, 0-5 Punkte
- **Wertebereich:** 0-100 %
- **Richtung:** hoch = schlechter
- **Subskalen:** keine (Gesamtscore)
- **MCID / MDC:** MDC95: 9 (Mannion 2006) / 11,75 (Johnsen 2013) / 13,47 (Monticone 2012); MCID: 5-17 bzw. 12,8
- **Interpretation / Cut-offs:** 0-20% minimal | 21-40% moderat | 41-60% stark | 61-80% sehr stark | 81-100% bettlaegerig (Fairbank 2000)
- **Sprachversion:** Deutsch, validiert (Mannion et al. 2006)
- **Priorität:** A - Kern
- **Scoring-Regel:** Summe der 10 Sektionen (0-50), x 2 = Prozentwert
- **Fehlende Werte:** im PDF nicht geregelt - Regel selbst definieren
- **Quelle (Validierung / Original):** Mannion et al., Eur Spine J 2006;15:55; Fairbank & Pynsent, Spine 2000;25:2940
- **Datei:** `Oswestry-Disability-Index-ODI_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Oswestry-Disability-Index-ODI_09-2023.pdf

### 3 · RMDQ — Roland and Morris Disability Questionnaire

- **Region / Domäne:** Wirbelsaeule / LWS
- **Konstrukt:** Funktionseinschraenkung bei Rueckenschmerz (heute)
- **Ausgefüllt von:** Patient
- **Items:** 24
- **Antwortformat:** Ja/Nein (Ankreuzen = 1 Punkt)
- **Wertebereich:** 0-24
- **Richtung:** hoch = schlechter
- **Subskalen:** keine
- **MCID / MDC:** MCID abhaengig vom Ausgangswert: <9 Punkte -> 1-2 | >16 Punkte -> 8 | unbestimmt -> 5
- **Interpretation / Cut-offs:** Bei Ausgangswerten <4 oder >20 wenig aussagekraeftig (Boden-/Deckeneffekt)
- **Sprachversion:** Deutsch, validiert (Exner & Keel 2000)
- **Priorität:** A - Kern
- **Scoring-Regel:** Summe der angekreuzten Aussagen
- **Fehlende Werte:** im PDF nicht geregelt - Regel selbst definieren
- **Quelle (Validierung / Original):** Exner & Keel, Schmerz 2000;14:392; Roland & Morris, Spine 1983;8:141
- **Datei:** `Roland-and-Morris-Disability-Questionnaire-RMDQ_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Roland-and-Morris-Disability-Questionnaire-RMDQ_09-2023.pdf

### 4 · NDI — Neck Disability Index

- **Region / Domäne:** Wirbelsaeule / HWS
- **Konstrukt:** Funktionseinschraenkung bei Nackenschmerz
- **Ausgefüllt von:** Patient
- **Items:** 10 Sektionen
- **Antwortformat:** je 6 Aussagen, 0-5 Punkte
- **Wertebereich:** 0-100 %
- **Richtung:** hoch = schlechter
- **Subskalen:** keine
- **MCID / MDC:** MDC: 5 Punkte bzw. 10 % (Vernon 1991); MCID: 3,5-9,5 (Schellingerhout 2012), 8,4 (Jorritsma 2012)
- **Interpretation / Cut-offs:** <=8 % geringe Symptomatik | >40 % sehr schwere Symptomatik, Chronifizierungsrisiko
- **Sprachversion:** Deutsch, validiert (Cramer et al. 2014)
- **Priorität:** A - Kern
- **Scoring-Regel:** (Summe / 50) x 100 = Score in %
- **Fehlende Werte:** im PDF nicht geregelt - Regel selbst definieren
- **Quelle (Validierung / Original):** Cramer et al., BMC Musculoskelet Disord 2014;15:91; Vernon & Mior, JMPT 1991;14:409
- **Datei:** `Neck-Disability-Index_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Neck-Disability-Index_09-2023.pdf

### 5 · SPADI — Shoulder Pain and Disability Index

- **Region / Domäne:** Obere Extremitaet / Schulter
- **Konstrukt:** Schmerz und Funktion der Schulter
- **Ausgefüllt von:** Patient
- **Items:** 13 (5 Schmerz + 8 Funktion)
- **Antwortformat:** NRS 0-10 je Item
- **Wertebereich:** 0-100 %
- **Richtung:** hoch = schlechter
- **Subskalen:** Schmerz (0-50) | Funktion (0-80)
- **MCID / MDC:** MDC: 18 Punkte (Angst et al. 2007)
- **Interpretation / Cut-offs:** 0 = keine Schmerzen/keine Schwierigkeiten; 100 = maximale Schmerzen, keine Taetigkeit moeglich
- **Sprachversion:** Deutsch, validiert (Angst et al. 2007)
- **Priorität:** A - Kern
- **Scoring-Regel:** (Summe aller Antwortpunkte / 130) x 100
- **Fehlende Werte:** Alle Fragen muessen beantwortet werden (Hinweis im PDF)
- **Quelle (Validierung / Original):** Angst et al., Rheumatology 2007;46:87; Roach et al., Arthritis Care Res 1991;4:143
- **Datei:** `Shoulder-Pain-and-Disability-Index-SPADI_03-2026.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Shoulder-Pain-and-Disability-Index-SPADI_03-2026.pdf

### 6 · PRWE-G — Patient-Rated Wrist Evaluation

- **Region / Domäne:** Obere Extremitaet / Handgelenk
- **Konstrukt:** Schmerz und Funktion des Handgelenks (letzte Woche)
- **Ausgefüllt von:** Patient
- **Items:** 15 (5 Schmerz + 10 Funktion)
- **Antwortformat:** NRS 0-10 je Item
- **Wertebereich:** 0-100
- **Richtung:** hoch = schlechter
- **Subskalen:** Schmerz Items 1-5 (0-50) | Funktion Items 6-15 (Summe/2 = 0-50)
- **MCID / MDC:** MCID: ca. 11-12 Punkte im Gesamtscore
- **Interpretation / Cut-offs:** niedriger Wert = weniger Schmerz/Beeintraechtigung
- **Sprachversion:** Deutsch, validiert (John et al. 2008)
- **Priorität:** B - Erweiterung
- **Scoring-Regel:** Schmerz-Summe + (Funktions-Summe / 2) = Gesamtscore 0-100
- **Fehlende Werte:** 'trifft nicht zu' wird in der jeweiligen Subskala nicht mitgezaehlt
- **Quelle (Validierung / Original):** John et al., Clin Exp Rheumatol 2008;26:1047
- **Datei:** `Patient-Rated-Wrist-Evaluation-Score-PRWE-G_08-2026.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/08/Patient-Rated-Wrist-Evaluation-Score-PRWE-G_08-2026.pdf

### 7 · LEFS — Lower Extremity Functional Scale

- **Region / Domäne:** Untere Extremitaet / allgemein
- **Konstrukt:** Aktivitaetseinschraenkung der unteren Extremitaet
- **Ausgefüllt von:** Patient
- **Items:** 20
- **Antwortformat:** 5-stufig, 0-4 Punkte
- **Wertebereich:** 0-80
- **Richtung:** hoch = besser
- **Subskalen:** keine
- **MCID / MDC:** im PDF nicht angegeben - vor Implementierung aus Literatur ergaenzen
- **Interpretation / Cut-offs:** 52 Punkte = guter Aktivitaetsstatus (68-80 J.); <20 Punkte = grundlegende Hilfsbeduerftigkeit
- **Sprachversion:** Deutsch, validiert (Naal et al. 2015)
- **Priorität:** A - Kern
- **Scoring-Regel:** Summe aller Antwortpunkte
- **Fehlende Werte:** maximal 4 unbeantwortete Fragen zulaessig, sonst nicht valide interpretierbar
- **Quelle (Validierung / Original):** Naal et al., Qual Life Res 2015;24:405
- **Datei:** `Lower-Extremity-Functional-Scale-LEFS_05-2024.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Lower-Extremity-Functional-Scale-LEFS_05-2024.pdf

### 8 · KOOS — Knee Injury and Osteoarthritis Outcome Score

- **Region / Domäne:** Untere Extremitaet / Knie
- **Konstrukt:** Knie: Schmerz, Symptome, ADL, Sport, Lebensqualitaet
- **Ausgefüllt von:** Patient
- **Items:** 42 (P9, S7, A17, SP5, Q4)
- **Antwortformat:** 5-stufig, 0-4 Punkte (0 = gering, 4 = stark)
- **Wertebereich:** 0-100 je Subskala
- **Richtung:** hoch = besser
- **Subskalen:** Schmerz (9) | Symptome (7) | ADL (17) | Sport/Freizeit (5) | Lebensqualitaet (4)
- **MCID / MDC:** MDC je Subskala (Collins 2011): Schmerz 6-6,1 | Symptome 5-8,5 | ADL 7-8 | Sport 5,8-12 | QoL 7,2
- **Interpretation / Cut-offs:** Subskalen einzeln auswerten - kein Gesamtscore bilden
- **Sprachversion:** Deutsch, validiert (Kessler et al. 2003)
- **Priorität:** A - Kern
- **Scoring-Regel:** Je Subskala: 100 - (Mittelwert der Items x 100 / 4)
- **Fehlende Werte:** Nicht durchfuehrbare Aktivitaet = schlechteste Punktzahl. Nicht-Sportler: Sport-Subskala auslassen; Aktive: ADL auslassen
- **Quelle (Validierung / Original):** Kessler et al. 2003; Collins et al. 2011
- **Datei:** `Knee-Injury-Osteoarthritis-Outcome-Score-KOOS_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Knee-Injury-Osteoarthritis-Outcome-Score-KOOS_09-2023.pdf

### 9 · HOOS — Hip Osteoarthritis Outcome Score

- **Region / Domäne:** Untere Extremitaet / Huefte
- **Konstrukt:** Huefte: Symptome, Schmerz, ADL, Sport, Lebensqualitaet
- **Ausgefüllt von:** Patient
- **Items:** 39 laut PDF (max. 156 Punkte) - Originalversion hat 40 Items, vor Implementierung pruefen
- **Antwortformat:** 5-stufig, 0-4 Punkte (4 = gering, 0 = stark)
- **Wertebereich:** 0-100 %
- **Richtung:** hoch = besser
- **Subskalen:** Symptome | Schmerz | ADL | Sport/Freizeit | Lebensqualitaet
- **MCID / MDC:** MDC/MCID je Subskala (Kemp 2013): Symptome 14/9 | Schmerz 10/9 | ADL 9/6 | Sport 17/10 | QoL 15/11
- **Interpretation / Cut-offs:** ACHTUNG: Punktrichtung gegenlaeufig zum KOOS - beim Import nicht verwechseln
- **Sprachversion:** Deutsch, validiert (Blasimann et al. 2014)
- **Priorität:** A - Kern
- **Scoring-Regel:** Punktsumme (max. 156) in Prozentwert 0-100 umrechnen; Subskalen separat
- **Fehlende Werte:** mindestens 50 % der Fragen muessen beantwortet sein; nicht durchfuehrbare Aktivitaet = 0 Punkte
- **Quelle (Validierung / Original):** Blasimann et al., JOSPT 2014;44:989; Kemp et al., AJSM 2013;41:2065
- **Datei:** `Hip-Osteoarthritis-Outcome-Score-HOOS_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Hip-Osteoarthritis-Outcome-Score-HOOS_09-2023.pdf

### 10 · FAAM-G — Foot and Ankle Ability Measure

- **Region / Domäne:** Untere Extremitaet / Fuss & Sprunggelenk
- **Konstrukt:** Funktion Fuss/Sprunggelenk in Alltag und Sport
- **Ausgefüllt von:** Patient
- **Items:** 29 (21 ADL + 8 Sport)
- **Antwortformat:** 5-stufig, 4-0 Punkte absteigend; 'nicht zutreffend' = nicht gewertet
- **Wertebereich:** 0-100 % je Subskala
- **Richtung:** hoch = besser
- **Subskalen:** ADL (max. 84 Punkte) | Sport (max. 32 Punkte)
- **MCID / MDC:** MCID: 8-9 Punkte (ADL und Sport; Kivlan 2011, Martin 2005)
- **Interpretation / Cut-offs:** hohe Werte = geringe Funktionseinschraenkung
- **Sprachversion:** Deutsch, validiert (Nauck & Lohrer 2011)
- **Priorität:** B - Erweiterung
- **Scoring-Regel:** (erreichte Punkte / maximal moegliche Punkte) x 100 - je Subskala getrennt
- **Fehlende Werte:** 'nicht zutreffend' reduziert das Maximum, wird nicht als 0 gewertet
- **Quelle (Validierung / Original):** Nauck & Lohrer, Br J Sports Med 2011;45:785; Martin et al. 2005
- **Datei:** `Foot-and-Ankle-Ability-Measure-FAAM-G_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Foot-and-Ankle-Ability-Measure-FAAM-G_09-2023.pdf

### 11 · VISA-A — VISA-A Score

- **Region / Domäne:** Untere Extremitaet / Achillessehne
- **Konstrukt:** Schweregrad und Verlauf der Achillessehnen-Tendinopathie
- **Ausgefüllt von:** Patient
- **Items:** 8
- **Antwortformat:** gemischt (NRS, Kategorien, Aktivitaetsminuten)
- **Wertebereich:** 0-100
- **Richtung:** hoch = besser
- **Subskalen:** keine
- **MCID / MDC:** MCID: mindestens 12 Punkte (van Sterkenburg 2012)
- **Interpretation / Cut-offs:** 100 = beschwerdefrei; Reliabilitaet ICC 0,6-0,97
- **Sprachversion:** Deutsch, validiert (Lohrer & Nauck 2009/2011)
- **Priorität:** A - Kern
- **Scoring-Regel:** Summe der Antwortwerte, dargestellt als x/100 bzw. %
- **Fehlende Werte:** im PDF nicht geregelt - alle Fragen erforderlich
- **Quelle (Validierung / Original):** Lohrer & Nauck, BMC Musculoskelet Disord 2009;10:134; Robinson et al., BJSM 2001;35:335
- **Datei:** `VISA-A-Score_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/VISA-A-Score_09-2023.pdf

### 12 · VISA-P-G — VISA-P Score (deutsch)

- **Region / Domäne:** Untere Extremitaet / Patellasehne
- **Konstrukt:** Schweregrad und Verlauf der Patellasehnen-Tendinopathie
- **Ausgefüllt von:** Patient
- **Items:** 8
- **Antwortformat:** gemischt (NRS, Kategorien, Aktivitaetsminuten)
- **Wertebereich:** 0-100
- **Richtung:** hoch = besser
- **Subskalen:** keine
- **MCID / MDC:** MDC: 12,6 Punkte; MCID: >13 Punkte
- **Interpretation / Cut-offs:** nicht zur Diagnosestellung geeignet - nur Schweregrad und Verlauf
- **Sprachversion:** Deutsch, validiert (Lohrer & Nauck 2011)
- **Priorität:** B - Erweiterung
- **Scoring-Regel:** Summe der Antwortwerte, max. 100 Punkte
- **Fehlende Werte:** im PDF nicht geregelt - alle Fragen erforderlich
- **Quelle (Validierung / Original):** Lohrer & Nauck, JOSPT 2011;41:180; Visentini et al. 1998
- **Datei:** `VISA-P-G-Score_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/VISA-P-G-Score_09-2023.pdf

### 13 · Tegner (TAS) — Tegner Activity Scale

- **Region / Domäne:** Untere Extremitaet / Knie
- **Konstrukt:** Alltags- und sportartspezifisches Aktivitaetsniveau
- **Ausgefüllt von:** Patient
- **Items:** 1
- **Antwortformat:** Einstufige Skala 0-10 mit Taetigkeitsbeschreibungen
- **Wertebereich:** 0-10
- **Richtung:** hoch = aktiver
- **Subskalen:** keine
- **MCID / MDC:** MCID: 1,4 Punkte (Wirth et al. 2013)
- **Interpretation / Cut-offs:** Verlaufskontrolle prae-/postoperativ; ergaenzt KOOS gut
- **Sprachversion:** Deutsch, validiert (Wirth et al. 2013)
- **Priorität:** B - Erweiterung
- **Scoring-Regel:** Direkte Einstufung - keine Berechnung
- **Fehlende Werte:** n/a
- **Quelle (Validierung / Original):** Tegner & Lysholm, Clin Orthop 1985;198:43; Wirth et al., Sportverletz Sportschaden 2013;27:21
- **Datei:** `Tegner-Activity-Scale-TAS_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Tegner-Activity-Scale-TAS_09-2023.pdf

### 14 · FABQ — Fear Avoidance Beliefs Questionnaire

- **Region / Domäne:** Schmerz / Psychosozial
- **Konstrukt:** Angst-Vermeidungs-Ueberzeugungen bei Rueckenschmerz
- **Ausgefüllt von:** Patient
- **Items:** 16 (davon 11 gewertet)
- **Antwortformat:** 7-stufig, 0-6 Punkte
- **Wertebereich:** PA 0-24 | W 0-42
- **Richtung:** hoch = schlechter
- **Subskalen:** FABQ-PA: Items 2,3,4,5 | FABQ-W: Items 6,7,9,10,11,12,15
- **MCID / MDC:** MDC: PA 5,4 | W 6,8 (George 2010)
- **Interpretation / Cut-offs:** Erhoehtes Chronifizierungsrisiko: PA >15 | W >34
- **Sprachversion:** Deutsch, validiert (Pfingsten et al. 2000)
- **Priorität:** A - Kern
- **Scoring-Regel:** Subskalen getrennt summieren - Items 1, 8, 13, 14, 16 werden NICHT gewertet
- **Fehlende Werte:** im PDF nicht geregelt - Regel selbst definieren
- **Quelle (Validierung / Original):** Pfingsten et al., Eur J Pain 2000;4:259; Waddell et al., Pain 1993;52:157
- **Datei:** `Fear-Avoidance-Belief-Questionnaire-FABQ_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Fear-Avoidance-Belief-Questionnaire-FABQ_09-2023.pdf

### 15 · STarT Back — STarT Back Screening Tool

- **Region / Domäne:** Wirbelsaeule / LWS
- **Konstrukt:** Risikostratifizierung Chronifizierung bei Rueckenschmerz
- **Ausgefüllt von:** Patient
- **Items:** 9
- **Antwortformat:** 8x Ja/Nein (0/1) + Item 9 5-stufig (sehr/extrem = 1)
- **Wertebereich:** Gesamt 0-9 | Teilscore 0-5
- **Richtung:** hoch = schlechter
- **Subskalen:** Gesamtscore (Items 1-9) | psychosozialer Teilscore (Items 5-9)
- **MCID / MDC:** im PDF nicht angegeben (Stratifizierungsinstrument, kein Verlaufsscore)
- **Interpretation / Cut-offs:** Gesamt <=3 = niedriges Risiko | >=4 und Teilscore <=3 = mittleres Risiko | Teilscore 4-5 = hohes Risiko (multidisziplinaer)
- **Sprachversion:** Deutsch, validiert (Aebischer et al. 2015)
- **Priorität:** A - Kern
- **Scoring-Regel:** Gesamt <=3 -> geringes Risiko; >=4 -> Teilscore Items 5-9 betrachten
- **Fehlende Werte:** im PDF nicht geregelt - alle Items erforderlich
- **Quelle (Validierung / Original):** Aebischer et al., PLoS One 2015; Hill et al., Lancet 2011;378:1560
- **Datei:** `STarT-Back-Screening-Tool-Deutsch_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/STarT-Back-Screening-Tool-Deutsch_09-2023.pdf

### 16 · PHQ-4 — Patient Health Questionnaire 4

- **Region / Domäne:** Schmerz / Psychosozial
- **Konstrukt:** Ultrakurz-Screening Depression und Angst (letzte 2 Wochen)
- **Ausgefüllt von:** Patient
- **Items:** 4
- **Antwortformat:** 4-stufig, 0-3 Punkte
- **Wertebereich:** 0-12
- **Richtung:** hoch = schlechter
- **Subskalen:** Depression (Items 1+2, 0-6) | Angst (Items 3+4, 0-6)
- **MCID / MDC:** im PDF nicht angegeben
- **Interpretation / Cut-offs:** 0-2 kein | 3-5 gering | 6-8 moderat | 9-12 starker Distress; Subskala >=3 = positives Screening
- **Sprachversion:** Deutsch, validiert (Loewe et al. 2010)
- **Priorität:** A - Kern
- **Scoring-Regel:** Summe aller 4 Items = Gesamtscore; Subskalen als Item-Paare
- **Fehlende Werte:** im PDF nicht geregelt - alle Items erforderlich
- **Quelle (Validierung / Original):** Loewe et al., J Affect Disord 2010;122:86; Kroenke et al., Psychosomatics 2009;50:613
- **Datei:** `Patient-Health-Questionnaire-4-PHQ-4_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Patient-Health-Questionnaire-4-PHQ-4_09-2023.pdf

### 17 · TSK-GV — Tampa Scale of Kinesiophobia (dt. Kurzversion)

- **Region / Domäne:** Schmerz / Psychosozial
- **Konstrukt:** Bewegungsangst / Kinesiophobie
- **Ausgefüllt von:** Patient
- **Items:** 11
- **Antwortformat:** 4-stufig A-D; Punktwerte im PDF nicht ausgewiesen (Standard 1-4) - vor Implementierung pruefen
- **Wertebereich:** 11-44 (bei Standardvergabe 1-4)
- **Richtung:** hoch = schlechter
- **Subskalen:** keine - PDF empfiehlt ausdruecklich nur den Gesamtwert
- **MCID / MDC:** im PDF nicht angegeben
- **Interpretation / Cut-offs:** hoher Wert = ausgepraegte Kinesiophobie
- **Sprachversion:** Deutsch, validiert (Rusu et al. 2014)
- **Priorität:** A - Kern
- **Scoring-Regel:** Summe aller 11 Items; Einzelitems laut PDF nicht aussagekraeftig
- **Fehlende Werte:** im PDF nicht geregelt
- **Quelle (Validierung / Original):** Rusu et al., BMC Musculoskelet Disord 2014;15:280
- **Datei:** `Tampa-Scale-of-Kinesiophobia_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Tampa-Scale-of-Kinesiophobia_09-2023.pdf

### 18 · PCS — Pain Catastrophizing Scale

- **Region / Domäne:** Schmerz / Psychosozial
- **Konstrukt:** Schmerzkatastrophisieren
- **Ausgefüllt von:** Patient
- **Items:** 13
- **Antwortformat:** 5-stufig, 0-4 Punkte
- **Wertebereich:** 0-52
- **Richtung:** hoch = schlechter
- **Subskalen:** Hilflosigkeit (1-5, 12) | Verstaerkung (6, 7, 13) | Gruebeln (8-11)
- **MCID / MDC:** MDC: Gesamt 12,79 | Hilflosigkeit 6,46 | Verstaerkung 4,02 | Gruebeln 5,06 (SEM Gesamt 4,61)
- **Interpretation / Cut-offs:** hoher Wert = ausgepraegtes Katastrophisieren
- **Sprachversion:** Deutsch, validiert (Meyer et al. 2008)
- **Priorität:** A - Kern
- **Scoring-Regel:** Subskalen = Summe der zugehoerigen Items; Gesamt = Summe aller 13 Items
- **Fehlende Werte:** im PDF nicht geregelt - Regel selbst definieren
- **Quelle (Validierung / Original):** Meyer et al., J Psychosom Res 2008;64:469
- **Datei:** `Pain-Catastrophizing-Scale-PCS_09-2023.pdf`
- **Direktlink:** https://digotor.info/wp-content/uploads/2026/05/Pain-Catastrophizing-Scale-PCS_09-2023.pdf
