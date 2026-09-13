# Übersicht, Kalender und Sessions (ORG)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Deckt die Navigationspunkte **Übersicht**, **Kalender** und **Sessions** ab —
also die Oberfläche, auf der der Betreuungsalltag stattfindet.

---

### IDEA-ORG-001 — Übersicht zeigt, was zu tun ist, nicht wie es läuft

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-004](../../adr/ADR-004-authorization-model.md), [ADR-006](../../adr/ADR-006-medical-device-boundary.md) |

**Idee.** Die Einstiegsseite je Person ist eine Arbeitsliste, keine
Kennzahlensammlung. Für die Praxis etwa: offene Rückfragen, Check-in seit
X Tagen ausgeblieben, Plan läuft in einer Woche aus, Wiedervorlage für ein
Assessment fällig, Termin ohne abgeschlossene Dokumentation.

**Warum.** Kennzahlen ohne Handlungsbezug werden nach zwei Wochen nicht mehr
angesehen. Eine Liste mit Fälligkeiten wird benutzt, weil sie kleiner wird,
wenn man arbeitet.

**Vorsicht.** Die zulässigen Einträge sind **organisatorische** Fälligkeiten
und Fristen. „Schmerzwert gestiegen" als Systemhinweis wäre eine Bewertung
klinischer Daten durch Software (ADR-006 Punkt 4). Der Rohwert unverändert im
Verlauf: zulässig. Die daraus abgeleitete Aufforderung: nicht.

---

### IDEA-ORG-002 — Behandlungstermin und Trainingseinheit sind zwei Dinge

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-009](../../adr/ADR-009-private-billing-model.md), [ADR-014](../../adr/ADR-014-foundational-data-model.md), [ADR-018](../../adr/ADR-018-appointment-states.md) (Terminzustände, angenommen 2026-09-11), [00 LZK](00-lebenszyklus-und-zugang.md) |

**Idee.** Ein **Termin** ist ein vereinbarter Kontakt mit der Praxis: hat
Zeit, Ort, Therapeut:in, Status, führt zu Dokumentation und Abrechnung. Eine
**Trainingseinheit** ist eine von der Person selbst absolvierte Durchführung
eines Plans: hat keinen Termin, keine Therapeut:in, keine Abrechnung, keine
Dokumentationspflicht.

Der Zähler „43 Sessions" aus der Referenzsoftware mischt genau das.

**Warum.** Die Trennung entscheidet über Abrechnung, Dokumentationspflicht,
Aufbewahrungsfrist und Sichtbarkeit. Sie nachträglich einzuziehen bedeutet,
jede Auswertung anzufassen. Umgekehrt: heute existieren Termine bereits
(`src/features/appointments`), Trainingseinheiten nicht — die Trennung kostet
also gerade nichts, solange man sie nicht verletzt.

**Konsequenz für Loops.** Trainingseinheiten **nicht** in die bestehende
Termintabelle einbauen, wenn es so weit ist. Das ist kein Vorbauen, sondern
eine Nichthandlung.

---

### IDEA-ORG-003 — Durchführungsansicht für die Einheit

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [02 TRK](02-tracking-und-parameter.md), [ADR-001](../../adr/ADR-001-online-first-limited-offline.md) |

**Idee.** Eine Ansicht für die Situation „ich stehe gerade in der Küche und
mache meine Übungen": Übung für Übung, große Bedienelemente, Satz abhaken,
letzte Werte vorausgefüllt, Pausenzeit, Video eine Handbewegung entfernt,
Abbrechen ohne Datenverlust jederzeit möglich.

**Warum.** Das ist der Moment, in dem die Software tatsächlich benutzt wird.
Alles andere in dieser Datei ist Vor- und Nachbereitung. Wenn diese eine
Ansicht schlecht ist, entstehen keine Daten und der Rest hat keinen Inhalt.

**Anforderungen, die daraus folgen:** ein Finger, eine Hand, verschwitzt,
schlechtes Licht, Bildschirmsperre unterwegs, keine Verbindung
([IDEA-TRK-008](02-tracking-und-parameter.md)).

---

### IDEA-ORG-004 — Kalender führt Termine und Trainingstage zusammen

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-003](../../adr/ADR-003-organization-location-model.md), IDEA-ORG-002 |

**Idee.** Eine Ansicht für die Person: Praxistermine und geplante
Trainingstage nebeneinander, klar unterscheidbar. Für die Praxis bleibt der
bestehende Kalender die Arbeitsansicht.

**Warum.** Aus Sicht der Person ist beides „was diese Woche ansteht". Zwei
getrennte Kalender führen dazu, dass einer ignoriert wird.

**Vorsicht.** Eine Kalenderweitergabe nach außen (Abonnement-Verweis) würde
Termindaten aus der Anwendung herausführen. Dass jemand zu einer bestimmten
Zeit Physiotherapie hat, ist ein Gesundheitsdatum. Das wäre eine eigene
Entscheidung nach ADR-002, kein Detail.

---

### IDEA-ORG-005 — Sitzungsvorbereitung für die Praxis

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [07 KI](07-ki-assistenz.md), [ADR-004](../../adr/ADR-004-authorization-model.md), [ADR-010](../../adr/ADR-010-audit-and-privileged-access.md) |

**Idee.** Vor einem Termin eine kompakte Ansicht: was seit dem letzten Mal
passiert ist — absolvierte Einheiten, Check-in-Verlauf, offene Rückfragen,
Auffälligkeiten in den eigenen Angaben der Person, letzte Ziele.

**Warum.** Bei Hausbesuchen zwischen zwei Terminen ist die Vorbereitungszeit
die Fahrtzeit. Eine Ansicht, die in einer Minute erfassbar ist, verändert die
Qualität des Termins mehr als jede Auswertung im Nachgang.

**Vorsicht.** Zusammenfassen heißt hier: **auswählen und anordnen**, nicht
interpretieren. Sobald ein Sprachmodell beteiligt ist, gilt ADR-005 (Gateway)
und ADR-006 Punkt 5 — und die Zusammenfassung darf nichts enthalten, was in
den Quellen nicht steht. Das ist laut ADR-006 die schwierigste Stelle
überhaupt.

---

### IDEA-ORG-006 — Planlaufzeit und Wiedervorlage

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [01 TRN](01-trainingsplaene-und-progression.md) |

**Idee.** Jeder zugewiesene Plan hat ein Ende. Vor dem Ende steht eine
Wiedervorlage bei der Praxis an: verlängern, ändern, beenden.

**Warum.** Pläne ohne Ablaufdatum laufen ewig weiter. Nach vier Monaten
trainiert jemand ein Programm, das für die zweite Woche nach einer Verletzung
gedacht war — und niemand merkt es, weil nichts danach fragt. Ein Ablaufdatum
erzwingt genau eine bewusste Entscheidung pro Zyklus.
