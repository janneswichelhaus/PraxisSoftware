

### BEF-057 — Dokumentieren und Erheben am Handy: Das Textfeld beginnt bei 458 px, Bausteinzeilen brauchen zwei Reihen, Skalenstufen sind 29 px breit

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Bereich | Behandlungsdokumentation (`/termine/:id/abschluss`, `/termine/:id/dokumentation`, Nachtrag); Befund aus Bausteinen; Erhebung (Skalenfragen)                                                                                                                                                                                                                                                                                                                           |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 375, 390 und 820 px, Gegenprüfung; Review-IDs DOK-09, BEF-21, BEF-05                                                                                                                                                                                                                                                                                                                                                |
| Status  | entschieden 2026-10-05 (Jannes), Option 2 — Teil 1 (Textfeld) erledigt in UI-Redesign Zyklus 2 (Schreibseite, Messung bei BEF-001); Teile 2 und 3 erledigt mit DOK-001 bis DOK-004 (2026-10-06: Skala zweireihig mit gewähltem Wert, Bausteinfeld ohne Kasten im Kasten, Bausteinleiste einreihig ohne Sprung, Ursprung im Nachtrag zugeklappt; ANN-258) |
| Berührt | `src/features/documentation/TextbausteinLeiste.tsx` (Z. 29–35), `src/features/documentation/DocumentationShell.tsx` (Z. 56), `src/features/documentation/CompleteTreatmentPage.tsx` (Z. 202, 240), `src/features/documentation/TreatmentNoteAddendumPage.tsx` (Z. 91), `src/features/assessments/BausteinFeld.tsx` (Z. 90, 229–285, 418–440), `src/features/assessments/FragebogenFelder.tsx` (Z. 208–228); BEF-001; ANN-129, ANN-130; Oberflächen-Checkliste Punkt 1 |

**Beobachtung.** BEF-001 verlangt, vor jeder Umsortierung neu zu messen.
Gemessen bei 390 × 844 und 375 × 667:

- **Textfeld.** Auf Abschluss und Dokumentation beginnt es bei **458 px** (am
  2026-09-11: 359). Davor stehen Rückweg, kompakter Kopf, die Textbausteinleiste
  (drei Bausteine brauchen zwei bis drei Zeilen, dazu „Bausteine verwalten“) und
  ein zweizeiliger Hinweis, der den Folgesatz vor dem Knopf wiederholt. Beim
  ersten Laden springt das Feld um 160 px, weil die Leiste während des Ladens
  nichts zeichnet. Mit „Ohne Behandlung“ (Vermerk vor dem Feld) beginnt es bei
  669 px — bei 667 px Höhe ganz unter dem Falz. Der Nachtrag zeigt den
  vollständigen Ursprungseintrag vor dem Feld.
- **Befund aus Bausteinen.** Nach Feld-, Block- und Gruppenrahmen und der
  Seitenspalte bleiben 240 bis 290 px für „o.B.“, „positiv“ und „nicht
  getestet“, die zusammen rund 350 px brauchen: Jede Testzeile belegt zwei
  Reihen, bei „beidseits“ zwei Zeilen je Test. Ein Block wird am Handy etwa
  doppelt so lang.
- **Skalenfragen** (Schmerzstärke, Stress). Elf Stufen von je rund 29 × 44 px
  mit 2 px Abstand; ab 640 px bleibt die Reihe unnötig bei 448 px. Der gewählte
  Wert steht nirgends als Text. Mit Handschuhen oder im Stehen trifft man leicht
  die Nachbarstufe — und der Wert steht danach als Messpunkt im Verlauf.

**Frage an Jannes.** Welche Höhe über dem Feld darf weg — und welche Form sollen
Bausteinzeile und 0–10-Skala am Handy haben?

**Optionen.**

1. **Ohne Gestaltungsänderung:** den Platz der Bausteinleiste beim Laden
   freihalten (kein Sprung), die Skala ab 640 px auf ganze Breite (mindestens
   59 px je Stufe), den gewählten Wert als Text („gewählt: 6“). Folge: Das Feld
   beginnt weiter bei 458 px, die Skala bleibt am Handy 29 px breit je Stufe.
2. **Dichter am Handy:** wie 1, dazu die Bausteinleiste unter 640 px einzeilig
   und waagerecht scrollbar, den Hinweis kürzen, wo der Folgesatz ohnehin vor
   dem Knopf steht, den Vermerk „Ohne Behandlung“ einzeilig mit „Mehr“, den
   Ursprung im Nachtrag zugeklappt; im Bausteinfeld die Seitenmarke über der
   Knopfreihe statt als Spalte, schmalere Ergebnisknöpfe, der Block ohne eigenen
   Rahmen. Folge: Feld und Testzeilen rücken deutlich nach oben, eine Testzeile
   passt in eine Reihe; Name, Datum und Uhrzeit bleiben im Kopf (BEF-001: Schutz
   vor Falschzuordnung).
3. **Skala am Handy in zwei Reihen,** 0–5 und 6–10, mit Stufen von mindestens
   44 px. Folge: Das Tippziel erfüllt Checkliste Punkt 1; die Skala sieht am
   Handy anders aus als auf dem Papierbogen.

**Empfehlung.** Option 2 mit der Skala aus 3 — ein Fehltipp auf einer Messskala
verfälscht einen Wert, der im Verlauf weiterlebt. Option 1 sofort, sie ändert
nichts an der Gestaltung. Deine Beobachtung an einem echten Tag bleibt Eingabe,
wie BEF-001 es verlangt; nach der Umsetzung bei 375 px nachmessen.
