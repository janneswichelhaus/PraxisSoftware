# Tracking und Parameter (TRK)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Jannes: „Alle denkbaren Parameter sollen getrackt werden. Bewegungssicherheit,
Schmerz, Anstrengung etc."

Diese Datei ordnet, **was** erfasst werden könnte — und hält gleichzeitig fest,
warum „alles" die falsche Zielgröße ist.

---

### IDEA-TRK-001 — Parameter nach Erfassungstakt ordnen

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 · ordnet Jannes' Aufzählung |
| Berührt | [ADR-014](../../adr/ADR-014-foundational-data-model.md) |

**Idee.** Vier Ebenen, weil sie unterschiedlich oft, von unterschiedlichen
Personen und mit unterschiedlichem Aufwand entstehen:

**Pro Satz** — während des Trainings, muss in Sekunden gehen:
Last · Wiederholungen · Reserve (RIR/RPE) · Schmerz während der Übung (NRS
0–10) · Bewegungsqualität (Selbsteinschätzung) · Abbruch mit Grund

**Pro Einheit** — direkt danach:
Dauer · Gesamtanstrengung · Schmerz vorher / nachher · Bewegungssicherheit ·
Ort und Ausrüstung · vollständig / teilweise / ausgefallen mit Grund · freie
Anmerkung

**Täglich oder mehrmals wöchentlich** — Check-in, siehe IDEA-TRK-004:
Schmerz in Ruhe und unter Belastung · Morgensteifigkeit in Minuten ·
Schlafdauer und -qualität · Stress · Stimmung · Bedarfsmedikation ·
Beeinträchtigung im Alltag · Schub ja/nein

**Periodisch** — alle 2 bis 12 Wochen, siehe
[04 OUT](04-assessments-outcomes-fortschritt.md):
PROMs · Funktionstests · Umfänge und Bewegungsausmaße · Fotos ·
Gesamtveränderung seit Beginn

**Warum.** Der Takt bestimmt die Oberfläche, die Erinnerungslogik, die
Datenmenge und die Aufbewahrungsfrist. Eine Struktur, die das vermischt,
erzeugt entweder unbenutzbare Formulare oder lückenhafte Zeitreihen.

---

### IDEA-TRK-002 — Weniger Fragen, dafür beantwortet

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | IDEA-TRK-001, [ADR-007](../../adr/ADR-007-data-protection-impact-assessment.md), [ADR-008](../../adr/ADR-008-data-retention-and-deletion.md) |

**Idee.** Ein voreingestellter Minimalsatz von drei bis fünf Größen je Person,
alles Weitere optional zuschaltbar. Standard könnte sein: Schmerz,
Anstrengung, Bewegungssicherheit, absolviert ja/nein.

**Warum, fachlich.** Ein Fragebogen nach jeder Einheit mit zwölf Skalen wird
nach zwei Wochen nicht mehr ausgefüllt — oder er wird durchgeklickt, was
schlimmer ist, weil die Daten dann falsch statt fehlend sind. Fehlende Daten
sind ehrlich, erfundene Daten sind gefährlich.

**Warum, rechtlich.** Datenminimierung ist keine Empfehlung. Jede erhobene
Größe braucht einen Zweck, eine Rechtsgrundlage und eine Löschfrist
(ADR-007, ADR-008). „Könnte man später mal brauchen" ist keiner davon.

**Konsequenz für Loops.** Der Wunsch „alle denkbaren Parameter" ist als
**Datenmodellanforderung** zu lesen (die Struktur muss erweiterbar sein), nicht
als Erfassungsanforderung (nicht alles gleichzeitig abfragen).

---

### IDEA-TRK-003 — Bewegungssicherheit als eigene Größe neben Schmerz

| | |
|---|---|
| Status | notiert · ausgearbeitet |
| Quelle | Jannes, 2026-09-01 · Ausarbeitung Claude |
| Berührt | [01 TRN](01-trainingsplaene-und-progression.md), B8 |

**Idee.** Bewegungssicherheit — Zutrauen, dass eine Bewegung gefahrlos möglich
ist — wird getrennt von Schmerz erfasst. Sie ist eine eigene Verlaufsgröße mit
eigener Zielrichtung.

**Warum.** Sie ist häufig der eigentliche limitierende Faktor und läuft dem
Schmerz nach: Menschen sind schmerzfrei und trauen sich trotzdem nicht, sich
zu bücken, zu laufen oder Treppen zu steigen. Wer nur Schmerz misst, sieht die
Hälfte des Verlaufs nicht — und übersieht genau den Teil, der über die
Rückkehr in den Alltag entscheidet.

Erhebbar auf drei Ebenen:

- **je Übung**, einfach: „Wie sicher hat sich das angefühlt?" 0–10
- **je Alltagsaktivität**, konkret: „Wie zuversichtlich, dass du heute
  einkaufen gehen kannst?"
- **standardisiert**, über validierte Instrumente zu Bewegungsangst und
  Selbstwirksamkeit — dann aber als Instrument mit Lizenzprüfung (B8), nicht
  als selbstgebaute Skala mit erfundenem Cutoff.

**Vorsicht.** Ein eigener Score mit eigener Schwelle wäre nach
[ADR-006](../../adr/ADR-006-medical-device-boundary.md) Punkt 4 unzulässig.
Eine rohe Selbsteinschätzung im Verlauf darzustellen ist zulässig.

---

### IDEA-TRK-004 — Check-in mit einstellbarem Takt

| | |
|---|---|
| Status | notiert · ausgearbeitet |
| Quelle | Jannes, 2026-09-01 (Navigationspunkt „Check-ins") · Ausarbeitung Claude |
| Berührt | [03 KOM](03-rueckfragen-medien-kommunikation.md), IDEA-TRK-002 |

**Idee.** Wiederkehrende Selbstauskunft in einem je Person festgelegten Takt
— täglich, wöchentlich, vor jeder Einheit. Kurz, mit vorausgefülltem letzten
Wert, in unter 30 Sekunden erledigt. Verpasste Check-ins werden nicht
nachgeholt und nicht angemahnt; sie sind selbst eine Information.

**Warum.** Der Check-in ist die Datenquelle für alles andere: Progression,
Verlaufskurven, Gesprächseinstieg beim nächsten Termin. Er ist gleichzeitig
das, was am schnellsten einschläft. Deshalb: kurz, vorausgefüllt, ohne
Schuldgefühl.

**Offen.** Wird ein Check-in mit auffälligen Angaben aktiv an die Praxis
gemeldet? Das ist attraktiv und regulatorisch heikel — eine automatische
Auffälligkeitsbewertung ist genau das, was ADR-006 ausschließt. Eine reine
Weiterleitung des unveränderten Werts ist etwas anderes.

---

### IDEA-TRK-005 — Schmerz differenziert erfassen

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | IDEA-TRK-001, [01 TRN](01-trainingsplaene-und-progression.md) |

**Idee.** „Schmerz 0–10" ist zu grob. Mindestens zu unterscheiden:

- **wann**: in Ruhe, bei Belastung, nach Belastung, nachts, morgens
- **wie lange**: Dauer bis zur Rückkehr auf Ausgangsniveau — die zentrale
  Größe im Ampelmodell ([IDEA-TRN-003](01-trainingsplaene-und-progression.md))
- **wo**: Lokalisation, idealerweise auf einer Körperkarte, mit der
  Möglichkeit von Ausstrahlung
- **Qualität**: dumpf, stechend, brennend, elektrisierend — für die
  Unterscheidung nozizeptiv gegenüber neuropathisch relevant
- **Verschiebung**: Zentralisierung oder Peripherisierung über die Zeit

**Warum.** Der reine Zahlenwert schwankt und hat eine schlechte
Reproduzierbarkeit. Die klinisch aussagekräftigen Größen sind die
Reaktionsdauer und die Verschiebung der Lokalisation. Beides ist erfassbar,
ohne dass die Software es bewertet.

**Vorsicht.** Erfassen und darstellen ist zulässig. Daraus eine Einordnung
ableiten („neuropathisches Muster") ist es nicht.

---

### IDEA-TRK-006 — Kontext mit erfassen, sonst ist die Zeitreihe Rauschen

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [04 OUT](04-assessments-outcomes-fortschritt.md) |

**Idee.** Zu jedem Messwert das Nötigste über die Messbedingungen: Uhrzeit,
Seite (links/rechts), Gerät oder Messmittel, mit oder ohne Aufwärmen, mit oder
ohne Schmerzmittel, Position.

**Warum.** Ohne Kontext ist eine Verlaufskurve nicht interpretierbar. Ein
Kraftwert morgens ohne Aufwärmen und einer nachmittags nach dem Training
unterscheiden sich um mehr als jeder Therapieeffekt. Das ist der Unterschied
zwischen Daten und Zahlen.

---

### IDEA-TRK-007 — Wearables und Gesundheits-Apps: später, und mit eigener Prüfung

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-002](../../adr/ADR-002-hosting-data-residency.md), [ADR-007](../../adr/ADR-007-data-protection-impact-assessment.md) |

**Idee.** Import von Schritten, Ruhepuls, Schlaf und Herzfrequenzvariabilität
aus Gesundheits-Apps oder Uhren. Als Kontextgröße für Belastbarkeit, nicht als
Steuergröße.

**Vorsicht.** Das ist ein neuer Datenfluss mit Gesundheitsdaten aus einem
Ökosystem außerhalb unserer Kontrolle. ADR-002 verlangt für jeden
Dienstleister mit Zugang zu solchen Daten den vollen Prüfkatalog; ADR-007
nennt neue Datenflüsse ausdrücklich als Wiedervorlagegrund für die DSFA. Das
ist kein Nachmittagsprojekt.

**Offen.** Reicht ein manueller Export-Import? Und: brauchen wir die Daten
überhaupt, oder sind sie nur interessant? Der Unterschied entscheidet über
die Zulässigkeit.

---

### IDEA-TRK-008 — Offline-Erfassung im Training

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-001](../../adr/ADR-001-online-first-limited-offline.md) |

**Idee.** Satzweises Protokollieren muss auch ohne Verbindung funktionieren.
Trainingsräume im Keller sind der Regelfall, nicht die Ausnahme.

**Warum.** ADR-001 hat den begrenzten Offline-Modus für Hausbesuche
entschieden. Das Training ist ein zweiter, bisher nicht betrachteter Fall mit
derselben Ursache und einer günstigeren Risikolage: ein Trainingsprotokoll auf
dem eigenen Gerät der Person ist etwas anderes als eine vollständige Akte auf
einem Praxisgerät.

**Offen.** Ob das unter ADR-001 fällt oder eine eigene Entscheidung braucht.
ADR-001 führt den konkreten Offline-Mechanismus ohnehin als offene Folgefrage.
