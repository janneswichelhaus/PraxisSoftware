# Sichtung — Block 7: Verlauf und Alltag

Stand 2026-10-12 · entsteht mit dem ersten Oberflächen-Loop des Blocks (TRK-EPIC-001).

**Deckt ab:** TRK-EPIC-001 (Schritte 1 bis 3).
**Wo:** lokal mit `pnpm dlx supabase@2.116.0 start`, am Handy im WLAN ([`../DEVELOPMENT.md`](../DEVELOPMENT.md)), oder auf der Test-Umgebung nach dem Merge. Konten: `DEVELOPMENT.md`, „Testkonten“. Im Seed ist noch kein Check-in eingestellt; Schritt 1 stellt ihn ein. Erika hat ein Heimprogramm, Tina einen Trainingsplan und die Einwilligung zu Gesundheitsangaben.
**Dauer:** rund 20 Minuten.

| #   | Rolle                      | Tun                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Erwarten                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Therapeutin, Büro, Trainer | Am Rechner als Anna: Akte **Erika** → **Doku** → unter den Übungsplänen **Zwischen den Terminen** → **Check-in einstellen**. „Alle 3 Tage“ wählen, **Schlaf** dazu abhaken, **Speichern**. Dann als Olivia dieselbe Stelle öffnen. Als Tom: **Training** → Tina → **Check-in einstellen** mit „täglich“ und nur **Stress**.                                                                                                                              | Voreingestellt sind drei Fragen; ab fünf lässt sich keine weitere abhaken. Nach dem Speichern „Check-in: alle 3 Tage · heute fällig“ und die vier Fragen. Olivia sieht dasselbe ohne Knöpfe. Bei Tom erscheint der Abschnitt am Trainingsverhältnis, bei Anna dort nicht.                                                                                                                  |
| 2   | Patientin, Trainingskundin | Am Handy als `erika.plattform` (Bereich Behandlung): **Übersicht** → Kachel **Check-in** → **Jetzt beantworten**. Drei Fragen beantworten, Schlaf offen lassen, **Absenden**. Dann **Ich → Meine Angaben**. Danach **Übungen** → **Jetzt üben**, einen Durchgang abhaken, bis **Fertig**, Anstrengung und Schmerz wählen, beim Schmerz **Angabe entfernen**, **Einheit beenden**. Zuletzt als `tina.plattform` den Check-in im **Training** beantworten. | Nichts ist vorausgewählt; ab dem zweiten Mal steht „Ihre letzte Angabe: …“ daneben. Nach dem Absenden steht oben: „Danke. Ihre Therapeut:in sieht Ihre Angaben beim nächsten Termin. Bei akuten Beschwerden: 112 oder 116117.“ – und die Kachel ist weg. Unter „Meine Angaben“ die Antworten mit Datum, ohne Farbe oder Tendenz. Bei 375 px stehen die Stufen 0–5 und 6–10 in zwei Reihen. |
| 3   | Therapeutin, Trainer       | Am Rechner als Anna: Akte **Erika** → **Doku** → **Zwischen den Terminen**, dann den Plan öffnen → **Durchgeführt**. **Check-in beenden**. Als Tom bei Tina **Zwischen den Terminen** ansehen.                                                                                                                                                                                                                                                           | Die Angaben stehen mit Datum und Wert, ohne Farbe, Pfeil oder Hinweis wie „hoch“. Am Plan „Angaben: Anstrengung …“ ohne Schmerz. Nach dem Beenden „Kein Check-in eingestellt.“, die Angaben bleiben. Es kam keine Benachrichtigung an die Praxis.                                                                                                                                          |

## Nicht in dieser Sichtung

- **Check-in ohne Oberfläche** (TRK-EPIC-001): Rollen je Bereich, Büro liest und schreibt nicht,
  Takt 1 bis 28 Tage, eine bis fünf Fragen, fällig vom letzten an und höchstens einer am Tag,
  Begleitung, gesperrter, entzogener und eingeladener Zugang, Lesefrist, Praxiskonto, fremde
  Person, andere Organisation, im Training nur mit Einwilligung, Auskunft, eigener Export,
  Zusammenführen, Löschen mit Akte und Trainingsverhältnis, Protokoll beim Lesen
  (`checkins.test.ts`, `patient-merge.test.ts`); Angaben zur Einheit mit falschen Werten und
  ohne Einwilligung (`platform-exercise-sessions.test.ts`); Katalog gleich in Datenbank und
  Oberfläche (`erfassungsgroessen.test.ts`); 375 px, Stufen ≥ 44 px, axe, keine Farbe als
  Bewertung (`tests/e2e/checkin.spec.ts`).

## Befunde

Noch keine Sichtung.
