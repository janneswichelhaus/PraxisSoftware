# Assessments, Outcomes und Fortschritt (OUT)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Deckt die Navigationspunkte **Assessments**, **Fortschritt** und
**Übungsanalyse** ab. Hier liegt der größte Hebel für die fachliche Qualität —
und die dichteste Häufung von MDR-Grenzfällen.

---

### IDEA-OUT-001 — Instrumentenbibliothek mit Lizenzfeld

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | B8, `PROJECT_PRINCIPLES.md` §7, [ADR-006](../../adr/ADR-006-medical-device-boundary.md) |

**Stand.** Jannes hat am 2026-09-19 erklärt, die Praxis dürfe den
DIGOTOR-Bogen verwenden, und weitere Bögen angekündigt (B8). Der schriftliche
Beleg des Lizenzgebers fehlt weiter — das Lizenzfeld bleibt deshalb Teil des
Entwurfs, nicht weniger wichtig, sondern jetzt erst recht gefüllt.

**Nachtrag 2026-09-21.** Die angekündigten Bögen liegen vor: 18 Instrumente
samt Eckdaten und Rechenvorschrift in [`../../../quellen/README.md`](../../../quellen/README.md),
der Plan in [`../../development/FRB-BAUSTEINE-UND-SCORES.md`](../../development/FRB-BAUSTEINE-UND-SCORES.md).
Jannes hat am selben Tag erklärt, es gebe keine Lizenzierung. Das Lizenzfeld
bleibt trotzdem im Entwurf: Was für die 18 gilt, gilt nicht für das
neunzehnte, und das Feld ist der Ort, an dem das je Instrument steht.

**Idee.** Ein Instrument (Fragebogen, Test) ist ein versioniertes Objekt mit:
Quelle, Fassung, Sprache, **Lizenzstatus**, Rechenvorschrift, Wertebereich,
veröffentlichten Referenzwerten, Erhebungsbedingungen. Ohne geklärten
Lizenzstatus wird ein Instrument nicht aktiviert.

**Warum.** `PROJECT_PRINCIPLES.md` §7 sieht die Bibliothek vor, B8 führt die
Lizenzfrage als offen. Viele etablierte Fragebögen sind urheberrechtlich
geschützt und für digitale Nutzung lizenzpflichtig — die Prüfung je Instrument
ist keine Formalie, sondern der Grund, warum das Feld ins Schema gehört.

**Pragmatischer Einstieg.** Es gibt frei verwendbare, fachlich starke
Instrumente — die numerische Schmerzskala, die
patientenspezifische Funktionsskala (IDEA-OUT-003) und eine globale
Veränderungsfrage (IDEA-OUT-004). Damit lässt sich der überwiegende Teil des
Verlaufs abbilden, ohne eine einzige Lizenz.

---

### IDEA-OUT-002 — Berechnen ja, bewerten nein

| | |
|---|---|
| Status | bestätigt · entscheidung nötig |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-006](../../adr/ADR-006-medical-device-boundary.md), B1 |

**Idee.** Die Software rechnet einen Summenwert nach veröffentlichter
Vorschrift aus und zeigt ihn im Verlauf. Sie sagt nicht, was er bedeutet.

**Warum.** ADR-006 Punkt 2 erlaubt „transparente mathematische Berechnungen
validierter Instrumente" ausdrücklich. Punkt 4 verbietet die daraus
abgeleitete klinische Aussage.

**Offen — und in ADR-006 wörtlich als Folgefrage geführt.** Ist die Anzeige
eines **veröffentlichten** Schwellenwerts neben dem eigenen Ergebnis bereits
eine Klassifikation? Das betrifft unmittelbar die Frage, ob man den minimal
klinisch bedeutsamen Unterschied einblenden darf — praktisch die nützlichste
Zusatzangabe überhaupt, weil sie „3 Punkte besser" von „3 Punkte Rauschen"
trennt. Solange die Frage offen ist: nicht bauen.

---

### IDEA-OUT-003 — Patientenspezifische Funktionsskala als Ziel-Werkzeug

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [00 LZK](00-lebenszyklus-und-zugang.md), IDEA-OUT-001 |

**Idee.** Die Person benennt zu Beginn drei bis fünf konkrete Tätigkeiten, die
sie wegen der Beschwerden nicht oder nur eingeschränkt kann, und bewertet
jede von 0 bis 10. Dieselben Tätigkeiten werden im Verlauf wiederholt bewertet.

**Warum.** Es ist die direkte Verbindung zwischen Therapieziel und Messung.
„Ich kann meinen Enkel wieder hochheben" schlägt jeden Summenwert — für die
Motivation der Person, für das Gespräch und für die Beurteilung, ob die
Therapie das Richtige tut. Es ist frei verwendbar, in zwei Minuten erhoben
und funktioniert bei jeder Diagnose und jeder Körperregion.

**Konsequenz.** Wenn es je ein „Ziele"-Feature gibt, sollte es diese Struktur
haben — Tätigkeit plus Skala plus Verlauf — und nicht ein Freitextfeld
„Therapieziel".

---

### IDEA-OUT-004 — Globale Veränderungsfrage

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | B8, `PROJECT_PRINCIPLES.md` §7, IDEA-OUT-001 |

**Idee.** In regelmäßigen Abständen eine einzige Frage: „Wie geht es dir
verglichen mit dem Beginn der Behandlung?", auf einer Skala von deutlich
schlechter bis deutlich besser.

**Warum.** Eine Frage, Sekunden Aufwand, und sie fängt Veränderungen ein, die
kein Einzelinstrument abbildet. Sie eignet sich außerdem als Gegenprobe: wenn
alle Kurven steigen und die Person sagt „unverändert", stimmt etwas mit den
Kurven nicht — nicht mit der Person.

---

### IDEA-OUT-005 — Verlaufsgrafiken mit Ereignissen

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [08 QSN](08-querschnitt-plattform.md) |

**Idee.** Jede Verlaufskurve zeigt Ereignisse als Markierungen mit: Termine,
Planwechsel, Operationen, Urlaube, Krankheit, Schübe, Medikationsänderungen.

**Warum.** Das ist der Unterschied zwischen einer Kurve und einer
Behandlungsgeschichte. Ein Einbruch im März ist ohne Kontext beunruhigend; mit
der Markierung „zwei Wochen Grippe" ist er erklärt. Ohne die Markierungen
werden Kurven fehlinterpretiert — von der Praxis und noch mehr von den
Patient:innen selbst.

**Zusatz.** Weniger Mittelwert, mehr Rohdaten: bei vier Messpunkten ist der
Trend eine Erfindung. Wenige Werte als Punkte zeigen, nicht als Linie
verbinden.

---

### IDEA-OUT-006 — Übungsanalyse: Ausführung, Schmerz und Auslassung zusammen

| | |
|---|---|
| Status | notiert · ausgearbeitet |
| Quelle | Jannes, 2026-09-01 (Navigationspunkt „Übungsanalyse") · Ausarbeitung Claude |
| Berührt | [01 TRN](01-trainingsplaene-und-progression.md), [ADR-006](../../adr/ADR-006-medical-device-boundary.md) |

**Idee.** Je Übung über die Zeit: Last- und Wiederholungsverlauf, gemeldete
Reserve, Schmerz während und danach, Bewegungssicherheit — und, am
wichtigsten, **wie oft die Übung ausgelassen wurde**.

**Warum.** Die Auslassquote je Übung ist das ehrlichste Signal im ganzen
System. Eine Übung, die dreimal hintereinander übersprungen wird, ist zu
schwer, zu schmerzhaft, zu langweilig oder zu umständlich — und keiner dieser
vier Gründe steht in irgendeiner Kurve. Es ist die eine Zahl, die einen Plan
tatsächlich verbessert.

**Vorsicht.** Darstellen ist zulässig. Eine automatische Ursachenzuschreibung
oder ein Austauschvorschlag ist eine Behandlungsauswahl (ADR-006 Punkt 4).

---

### IDEA-OUT-007 — Assessments mit Protokoll und Wiedervorlage

| | |
|---|---|
| Status | notiert · ausgearbeitet |
| Quelle | Jannes, 2026-09-01 (Navigationspunkt „Assessments") · Ausarbeitung Claude |
| Berührt | [02 TRK](02-tracking-und-parameter.md) |

**Idee.** Ein Assessment ist eine Testbatterie mit festem Ablauf:
Durchführungsanleitung, Messbedingungen, Seitenvergleich, Ergebnisfelder — und
einer geplanten Wiederholung zu einem definierten Zeitpunkt.

**Warum.** Ein Test ohne Wiederholung ist eine Momentaufnahme ohne Nutzen. Und
ein Test ohne festgehaltene Durchführungsbedingungen ist nicht vergleichbar:
gleicher Test, andere Position, anderer Wert.

**Zusatz.** Der Seitenvergleich in Prozent ist in der Rehabilitation nach
Verletzungen die praktisch wichtigste abgeleitete Größe und gleichzeitig eine
reine Division — also unstrittig eine transparente Berechnung. Der daran
geknüpfte Freigabeschwellenwert ist es nicht; der gehört in die
Kriterienfreigabe durch die Therapeutin
([IDEA-TRN-008](01-trainingsplaene-und-progression.md)).

---

### IDEA-OUT-008 — Fortschritt in zwei Sprachen

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [08 QSN](08-querschnitt-plattform.md) |

**Idee.** Dieselben Daten, zwei Darstellungen: für die Praxis dicht,
vergleichend, mit Rohwerten. Für Patient:innen reduziert, auf die eigenen
Ziele bezogen, ohne Fachbegriffe und ohne Zahlen, die ohne Erklärung
beunruhigen.

**Warum.** Eine Kurve, die für die Therapeutin informativ ist, kann für die
Person, um deren Körper es geht, entmutigend sein. Fortschritt in der
Rehabilitation verläuft in Zacken; wer die Rohkurve ohne Einordnung sieht,
liest jeden Zacken als Rückschlag.

**Vorsicht.** Zwei Darstellungen dürfen nicht zwei Wahrheiten werden. Die
Patientensicht darf reduzieren, nicht beschönigen — und muss vollständigen
Zugang auf Wunsch zulassen (§630g BGB, B5).

---

### IDEA-OUT-009 — Ein Bild ruft den Test in Erinnerung

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-19 |
| Berührt | B8, IDEA-OUT-001, IDEA-OUT-007, [ADR-006](../../adr/ADR-006-medical-device-boundary.md), [ADR-017](../../adr/ADR-017-file-storage.md) |

**Idee.** Zu einem Test gehört ein Bild, das der Therapeutin die Durchführung
kurz ins Gedächtnis ruft — Ausgangsstellung, Griff, Messpunkt. Es steht am
Instrument der Bibliothek, nicht an der Messung, und wird beim Erheben
angezeigt.

**Warum.** Eine Testbatterie hat Dutzende Positionen, die eine Praxis
unterschiedlich oft braucht. Wer den Test dreimal im Jahr durchführt, schlägt
sonst nach oder führt ihn abweichend durch — und ein abweichend erhobener Wert
ist im Verlauf schlimmer als kein Wert, weil er Vergleichbarkeit behauptet.
Das Bild ist Gedächtnisstütze für Fachpersonal, keine Anleitung für
Patient:innen.

**Vorsicht.** Das Bild ist **Inhalt des Instruments** und fällt damit unter
dessen Lizenz (B8) — eine Abbildung aus einem geschützten Bogen ist nicht
freier als sein Text. Eigene Fotos zeigen eine Person; sind es Mitarbeitende,
gilt §20 und eine Einwilligung, sind es Patient:innen, ist es ausgeschlossen.
Eine gezeichnete Darstellung umgeht beides. Ablage nach ADR-017, kein
Patientenbezug. Keine Bewertung im Bild und keine Grenzwerte — das wäre die
Grenze aus ADR-006.

**Offen.** Woher die Bilder kommen (lizenziert, eigene Zeichnung, eigenes
Foto) und ob sie je Instrument oder je Testschritt hängen.
