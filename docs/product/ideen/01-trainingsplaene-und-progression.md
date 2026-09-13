# Trainingspläne und Progression (TRN)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Der fachliche Kern des Brainstormings: Jannes will, dass die Plattform die
Progression regelt, „wissenschaftlich und praktisch", damit Patient:innen
nicht mehr selbst anpassen müssen.

**Vorab, für jeden Loop in diesem Bereich:** automatische Anpassung einer
Therapie ist genau die Funktion, die
[ADR-006](../../adr/ADR-006-medical-device-boundary.md) Punkt 4 für V1
ausschließt (keine Therapieempfehlungen, keine Behandlungsauswahl, keine
automatisierten klinischen Entscheidungen). Alles in dieser Datei ist deshalb
mindestens `MDR_REVIEW_REQUIRED`, solange es im Behandlungskontext läuft.
Diese Datei sammelt, **wie** man es bauen würde, wenn und sobald das geklärt
ist — nicht, dass man es bauen darf.

---

### IDEA-TRN-001 — Progression regelt die Plattform, nicht die Person

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-01 |
| Berührt | [ADR-006](../../adr/ADR-006-medical-device-boundary.md), B1, B10 |

**Idee.** Die Plattform steuert die Steigerung von Trainingsplänen
wissenschaftlich und praktisch fundiert. Patient:innen müssen nicht mehr
selbst entscheiden, wann sie mehr Gewicht, mehr Wiederholungen oder eine
schwerere Variante nehmen.

**Warum.** Das ist der wunde Punkt jedes Heimprogramms. Menschen steigern
entweder gar nicht — dann passiert nach vier Wochen nichts mehr — oder zu
schnell, dann kommt der Reizzustand zurück. Beides kostet Therapieerfolg.

**Vorsicht.** Zwischen „die Plattform schlägt vor, die Therapeutin gibt frei"
und „die Plattform entscheidet" liegt die MDR-Grenze. Der Unterschied ist
nicht kosmetisch und lässt sich nicht durch Formulierung in der Oberfläche
heilen (ADR-006, Konsequenzen: Sprache und Darstellung sind regulatorisch
relevant).

**Stand.** B10 ist am 2026-09-08 durch Jannes vorläufig entschieden: für V1
ausgeschlossen — ein Regelwerk je Plan gibt die Therapeutin frei, und **jeder
einzelne Progressionsschritt braucht ihre Bestätigung**, bevor er bei der
Person ankommt. Die Frage geht mit an die B1-Prüfung. „Die Plattform regelt"
heißt damit: sie rechnet und schlägt vor; entschieden wird von Hand.

**Offen.** Als Punkt B10 in `docs/decisions/OPEN_DECISIONS.md` geführt: Wo
genau verläuft die Grenze für automatisierte Progression, und unterscheidet
sie sich zwischen Heilbehandlung und Weiterbetreuung? Für V1 beantwortet
(siehe Stand); ob ein späterer Maßstab für die Weiterbetreuung anders liegt,
klärt die externe Prüfung (B1).

---

### IDEA-TRN-002 — Regelwerk statt Automatik: Therapeut gibt den Korridor frei

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-005](../../adr/ADR-005-provider-independent-ai.md), [ADR-006](../../adr/ADR-006-medical-device-boundary.md), [ADR-010](../../adr/ADR-010-audit-and-privileged-access.md) |

**Idee.** Die Progression ist kein Algorithmus, der über den Kopf der
Therapeutin hinweg entscheidet, sondern ein **versioniertes, deterministisches
Regelwerk**, das die Therapeutin je Plan auswählt, parametrisiert und freigibt.
Danach rechnet die Software nur noch aus, was die Therapeutin vorher
entschieden hat.

Kernpunkte:

- **Deterministisch, kein LLM.** Trennung nach ADR-005 §6.2. Ein
  Sprachmodell entscheidet keine Trainingslast.
- **Versioniert.** Jede Regelwerkversion ist unveränderlich; ein bestehender
  Plan behält die Version, mit der er freigegeben wurde. Änderungen wirken
  nicht rückwirkend. Dasselbe Prinzip wie Leistungskataloge in ADR-009.
- **Freigabe je Plan**, mit Grenzen: maximale Steigerung pro Schritt,
  Untergrenze, Obergrenze, Stopp-Kriterien.
- **Nachvollziehbare Spur.** Jeder Progressionsschritt speichert Eingaben,
  Regelversion, angewandte Regel und Ergebnis — reproduzierbar aus den
  gespeicherten Eingaben.
- **Erklärung in der Oberfläche.** „Steigerung, weil in den letzten zwei
  Einheiten die obere Wiederholungsgrenze bei RIR ≥ 2 und Schmerz ≤ 3
  erreicht wurde." Keine Blackbox.

**Warum.** Das verschiebt die Funktion von „Therapieentscheidung durch
Software" zu „transparente Berechnung nach der Vorschrift der Therapeutin" —
näher an ADR-006 Punkt 2. Ob das für die MDR reicht, entscheidet die externe
Prüfung, nicht dieser Eintrag. Unabhängig davon ist es die bessere Architektur:
testbar, erklärbar, reproduzierbar.

**Offen — beantwortet (B10, 2026-09-08).** Die Frage lautete: Reicht eine
einmalige Freigabe je Plan, oder braucht jeder Progressionsschritt eine
Bestätigung? Jannes hat vorläufig entschieden: **jeder einzelne
Progressionsschritt braucht die Bestätigung der Therapeut:in**, bevor er bei
der Person ankommt — die regulatorisch sauberere Variante. Ob sie praktisch
durchhaltbar ist, zeigt sich erst im Betrieb; das ändert die Entscheidung
nicht, sondern wäre eine neue.

---

### IDEA-TRN-003 — Ampelmodell auf Basis der Schmerzreaktion

| | |
|---|---|
| Status | zurückgestellt (B10) |
| Quelle | Claude, 2026-09-01 |
| Berührt | [02 TRK](02-tracking-und-parameter.md), [ADR-006](../../adr/ADR-006-medical-device-boundary.md), `PROJECT_PRINCIPLES.md` §17; B10, B1 |

**Stand.** B10 (Jannes, 2026-09-08): **Ein Ampelmodell wird auch mit
therapeutisch gesetzten Schwellen nicht gebaut** — eine Ampel *ist* eine
Risikoklassifikation, unabhängig davon, woher die Schwellen kommen; §17
schließt das für V1 aus. Die Frage geht mit an die B1-Prüfung. Der Eintrag
kommt nur mit einer neuen Entscheidung zurück; das Schmerzmonitoring als
**Erfassung** (Schmerz während der Belastung, Dauer bis zum Ausgangsniveau,
Morgensteifigkeit) ist davon nicht betroffen und steht in `IDEA-TRK-005`.

**Idee.** Als Grundregel das etablierte Schmerzmonitoring-Modell aus der
Sehnen- und Belastungsrehabilitation (Thomeé; Silbernagel), das nicht
Schmerzfreiheit fordert, sondern einen tolerierten Korridor:

- **Grün — steigern:** Schmerz während der Belastung ≤ 5/10, innerhalb von
  24 Stunden zurück auf Ausgangsniveau, keine verstärkte Morgensteifigkeit.
- **Gelb — halten:** Korridor eingehalten, aber Rückkehr auf Ausgangsniveau
  dauert länger oder Steifigkeit nimmt leicht zu.
- **Rot — reduzieren:** Schmerz über dem Korridor, Beschwerden am Folgetag
  deutlich verstärkt, oder Ausweichbewegungen nehmen zu.

Die Schwellen sind je Plan einstellbar, weil sie gewebe- und
diagnoseabhängig sind. Postoperative Protokolle sind strenger.

**Warum.** Weil es das praktisch bewährte und in der Literatur breit
verwendete Modell ist, das Patient:innen verstehen. „Schmerz bis 5 ist in
Ordnung, wenn er am nächsten Tag weg ist" ist ein Satz, den man am Küchentisch
erklären kann — und genau darin liegt sein Wert.

**Vorsicht.** Eine Ampel ist eine **Klassifikation**. ADR-006 Punkt 4 verbietet
eigene Risikoklassifikationen. Der Ausweg ist derselbe wie in IDEA-TRN-002:
die Schwellen kommen von der Therapeutin, die Software prüft die von ihr
gesetzte Bedingung. Ob das trägt, klärt B10. Bis dahin gilt: nicht bauen.

**Offen.** Wie wird verhindert, dass die Farbe als medizinische Aussage
gelesen wird? Farbe allein reicht ohnehin nicht — siehe
[IDEA-QSN-006](08-querschnitt-plattform.md).

---

### IDEA-TRN-004 — Progression ist mehrdimensional, nicht „mehr Gewicht"

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | IDEA-TRN-005 |

**Idee.** Steigerung entlang mehrerer Achsen, von denen die Regel jeweils
**eine** verändert:

| Achse                    | Beispiel                                                    |
| ------------------------ | ------------------------------------------------------------ |
| Last                     | 2 kg mehr                                                    |
| Wiederholungen           | 8 → 10 im selben Bereich                                     |
| Sätze / Volumen          | 2 → 3 Sätze                                                  |
| Bewegungsausmaß          | halbe → volle Kniebeuge                                      |
| Hebel                    | Knie gebeugt → gestreckt                                     |
| Unterstützung            | am Geländer → freistehend                                    |
| Unterstützungsfläche     | beidbeinig → einbeinig, fest → instabil                      |
| Tempo                    | 3 Sekunden exzentrisch, Pause in der Endposition             |
| Dichte                   | Pause von 90 auf 60 Sekunden                                 |
| Komplexität              | isoliert → kombiniert, mit Zweitaufgabe                      |
| Geschwindigkeit / Impuls | kontrolliert → federnd → Sprung                              |
| Frequenz                 | 2 → 3 Einheiten pro Woche                                    |

**Warum.** In der Rehabilitation ist die Last selten die begrenzende Größe.
Wer nur Gewicht steigert, hat für die Hälfte der Patient:innen keine
Progression im Angebot — bei Schmerz, Angst oder Instabilität sind Hebel,
Bewegungsausmaß und Unterstützung die relevanten Stellschrauben. Immer nur
eine Achse pro Schritt zu ändern ist zudem die Voraussetzung dafür, eine
Reaktion überhaupt zuordnen zu können.

**Offen.** Reihenfolge der Achsen: erst Wiederholungen, dann Last (doppelte
Progression) ist im Krafttraining Standard. Für die anderen Achsen gibt es
keine allgemeingültige Reihenfolge — sie ist Teil der therapeutischen
Entscheidung und gehört damit in die Planfreigabe, nicht in die Engine.

---

### IDEA-TRN-005 — Übungsbibliothek als Graph, nicht als Liste

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | IDEA-TRN-004, [ADR-014](../../adr/ADR-014-foundational-data-model.md) |

**Idee.** Trennung von **Übung** (Kniebeuge) und **Übungsvariante**
(Kniebeuge am Geländer, halbe Tiefe, beidbeinig). Varianten sind über
Kanten verbunden, die eine Achse aus IDEA-TRN-004 und eine Richtung tragen:
Regression und Progression. Die Engine bewegt sich entlang einer Kante — sie
erfindet keine Variante.

**Warum.** Das ist die Datenstruktur, die eine automatische Anpassung
überhaupt erst möglich und gleichzeitig sicher macht: die Software kann nur
das vorschlagen, was fachlich vorher als Nachbar hinterlegt wurde. Der
Bibliotheksinhalt ist dann eine kuratierte fachliche Leistung — und damit
prüfbar, versionierbar und im Zweifel korrigierbar.

Zusätzlich pro Variante nützlich: Zielgewebe und -funktion, benötigte
Ausrüstung, Kontraindikationen, Video, Kurzanleitung in Patientensprache,
typische Ausweichbewegungen.

**Vorsicht.** Kein prophylaktisches Schema. Der Punkt ist die
Modellierungsrichtung, falls und wenn eine Bibliothek gebaut wird — nicht,
sie jetzt anzulegen.

**Offen.** Eigene Videos oder lizenzierte? Eigene bedeuten
Produktionsaufwand, lizenzierte bedeuten einen weiteren Dienstleister mit
Prüfung nach [ADR-002](../../adr/ADR-002-hosting-data-residency.md).

---

### IDEA-TRN-006 — Autoregulation über RIR statt starrer Prozentwerte

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [02 TRK](02-tracking-und-parameter.md) |

**Idee.** Die Belastung wird nicht in Prozent eines Maximums vorgegeben,
sondern über die subjektive Reserve: „3 Sätze zu 8–10 Wiederholungen, so
dass am Ende noch 2 Wiederholungen möglich wären" (RIR 2, entspricht RPE 8).
Die Person wählt das Gewicht danach selbst; die Software wertet die
gemeldete Reserve aus.

**Warum.** Prozentwerte setzen ein bekanntes Maximum voraus. Ein Maximaltest
ist in der Rehabilitation oft nicht möglich, nicht sinnvoll und nicht
zumutbar. Die Tagesform schwankt zudem erheblich — nach schlechtem Schlaf ist
dasselbe Gewicht eine andere Belastung. Autoregulation fängt das ab, ohne dass
jemand rechnen muss.

**Vorsicht.** RIR-Schätzung ist bei Untrainierten anfangs unzuverlässig; sie
wird über Wochen besser. Eine Engine, die RIR-Meldungen in den ersten
Einheiten für bare Münze nimmt, steigert zu schnell. Eine Einführungsphase mit
gedämpfter Reaktion gehört dazu.

Eine selbsttätige Anpassung von Last, Umfang oder Plan ist nach ADR-006
Punkt 4 und B10 (2026-09-08) ausgeschlossen; jeder Schritt braucht die
Bestätigung der Therapeut:in. Dieser Eintrag beschreibt einen Vorschlag an die
Therapeut:in, keine Automatik.

**Offen.** RIR oder RPE in der Oberfläche? RIR ist konkreter erklärbar
(„wie viele hättest du noch geschafft"), RPE ist verbreiteter.

---

### IDEA-TRN-007 — Doppelte Progression als robuster Standardfall

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | IDEA-TRN-004 |

**Idee.** Als Voreinstellung das robusteste Schema: Wiederholungsbereich
vorgeben (z. B. 8–12). Erst wenn alle Sätze die Obergrenze bei passender
Reserve erreichen, wird die Last erhöht und die Wiederholungszahl fällt zurück
auf die Untergrenze.

**Warum.** Es kommt ohne Maximaltest aus, verzeiht Fehleinschätzungen,
funktioniert mit Bändern und Körpergewicht fast genauso und ist in einem Satz
erklärbar. Für den überwiegenden Teil der Heimprogramme ist es die richtige
Antwort — und für das erste Regelwerk der naheliegende Kandidat.

**Vorsicht.** Eine selbsttätige Anpassung von Last, Umfang oder Plan ist nach
ADR-006 Punkt 4 und B10 (2026-09-08) ausgeschlossen; jeder Schritt braucht die
Bestätigung der Therapeut:in. Dieser Eintrag beschreibt einen Vorschlag an die
Therapeut:in, keine Automatik.

---

### IDEA-TRN-008 — Phasenwechsel über Kriterien, nicht über den Kalender

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [04 OUT](04-assessments-outcomes-fortschritt.md), [ADR-006](../../adr/ADR-006-medical-device-boundary.md) |

**Idee.** Ein Plan besteht aus Phasen. Der Wechsel in die nächste Phase ist an
messbare Kriterien geknüpft, nicht an „ab Woche 6": erreichte
Bewegungsumfänge, Seitendifferenz in einem Krafttest, Testergebnisse,
Schmerzverhalten unter Belastung, absolvierte Mindestzahl an Einheiten.

**Warum.** Kalenderbasierte Protokolle richten sich nach dem Durchschnitt.
Der Durchschnitt sitzt nicht in der Praxis. Kriterienbasiertes Vorgehen ist in
der Rehabilitation nach Operationen und Verletzungen fachlich klar die
bessere Praxis — und es macht die Fortschrittsanzeige für Patient:innen
ehrlich: nicht „Woche 6 von 12", sondern „noch ein Kriterium bis Phase 3".

**Vorsicht.** Ein automatisch ausgelöster Phasenwechsel im
Behandlungskontext ist eine Behandlungsauswahl im Sinne von ADR-006 Punkt 4.
Ein **erfülltes Kriterium anzeigen** und die Therapeutin freigeben lassen ist
etwas anderes als selbst umzuschalten.

---

### IDEA-TRN-009 — Adhärenz ist eine Eingangsgröße der Progression

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [02 TRK](02-tracking-und-parameter.md), [05 ALT](05-alltag-gewohnheiten-ernaehrung.md) |

**Idee.** Wer in zwei Wochen zwei von sechs Einheiten gemacht hat, bekommt
keine Steigerung — sondern einen **kleineren Plan**. Die Regel reagiert auf
Adhärenz genauso wie auf Schmerz: unter einer Schwelle wird nicht gesteigert,
unter einer zweiten Schwelle wird der Umfang reduziert und die Rückfrage
angeboten, woran es liegt.

**Warum.** Der häufigste Grund für ausbleibenden Fortschritt ist nicht die
falsche Übungsauswahl, sondern dass das Programm nicht gemacht wird. Ein
System, das darauf mit „mehr" antwortet, verstärkt das Problem. Die minimale
wirksame Dosis, die tatsächlich stattfindet, schlägt das optimale Programm,
das liegen bleibt.

**Vorsicht.** Der Ton entscheidet. Die Reduktion darf nicht als Bestrafung
oder Beschämung ankommen. Kein Ausrufezeichen, keine roten Zahlen, keine
gebrochene Serie als Drama.

Eine selbsttätige Anpassung von Last, Umfang oder Plan ist nach ADR-006
Punkt 4 und B10 (2026-09-08) ausgeschlossen; jeder Schritt braucht die
Bestätigung der Therapeut:in. Dieser Eintrag beschreibt einen Vorschlag an die
Therapeut:in, keine Automatik.

---

### IDEA-TRN-010 — Wiedereinstieg nach Unterbrechung

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | IDEA-TRN-009 |

**Idee.** Nach Urlaub, Krankheit oder Schub setzt der Plan nicht dort fort, wo
er aufgehört hat. Definierte Wiedereinstiegsregel: Last um einen festgelegten
Anteil zurück, Volumen reduziert, Steigerung erst nach zwei toleriert
absolvierten Einheiten.

**Warum.** Der Wiedereinstieg auf dem alten Niveau ist eine der häufigsten
Ursachen für einen Rückfall — und einer der Momente, in denen Menschen die
Anpassung selbst nicht hinbekommen. Genau hier hilft Automatisierung am
meisten.

**Vorsicht.** Eine selbsttätige Anpassung von Last, Umfang oder Plan ist nach
ADR-006 Punkt 4 und B10 (2026-09-08) ausgeschlossen; jeder Schritt braucht die
Bestätigung der Therapeut:in. Dieser Eintrag beschreibt einen Vorschlag an die
Therapeut:in, keine Automatik — „hilft Automatisierung" heißt: die Rücknahme
wird vorgerechnet und vorgeschlagen, nicht angewendet.

**Offen.** Ab welcher Pausenlänge greift die Regel, und wie stark ist die
Rücknahme? Das ist gewebe- und kontextabhängig und gehört in die
Planparametrierung.

---

### IDEA-TRN-011 — Plan-Schnappschuss bei Zuweisung

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-009](../../adr/ADR-009-private-billing-model.md), [ADR-014](../../adr/ADR-014-foundational-data-model.md), `PROJECT_PRINCIPLES.md` §5 |

**Idee.** Vorlage, Zuweisung und Durchführung sind drei Dinge. Beim Zuweisen
wird der Planinhalt als Schnappschuss festgehalten. Eine spätere Änderung der
Vorlage verändert **nicht**, was die Person letzten Monat tatsächlich
bekommen hat.

**Warum.** Dasselbe Prinzip, das ADR-009 für ausgestellte Rechnungen und §5
für finalisierte Dokumentation festlegt. Ohne Schnappschuss ist im Nachhinein
nicht mehr feststellbar, was verordnet war — bei einer Beschwerde oder einem
Zwischenfall ist genau das die entscheidende Frage.

---

### IDEA-TRN-012 — Trockenlauf, bevor Automatik scharf geschaltet wird

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-006](../../adr/ADR-006-medical-device-boundary.md), [ADR-013](../../adr/ADR-013-ci-cd-and-release-governance.md), [08 QSN](08-querschnitt-plattform.md) |

**Idee.** Ein Regelwerk läuft zunächst im Schattenbetrieb: es rechnet mit,
zeigt der Therapeutin, was es vorgeschlagen hätte, greift aber nicht ein.
Erst wenn die Vorschläge über eine Zeit hinweg mit dem übereinstimmen, was die
Therapeutin ohnehin getan hätte, wird die Automatik für eine Person
freigeschaltet.

**Warum.** Zwei Fliegen: es ist der einzige belastbare Weg, ein Regelwerk vor
dem Echteinsatz zu validieren — und es ist genau das Material, das eine
externe MDR-Prüfung sehen will. Nebenbei ist es der beste Weg, überhaupt
herauszufinden, ob die Regel taugt.

**Vorsicht.** Ein Vergleich „Therapeutin gegen Regelwerk" über die Zeit ist
eine Auswertung je Beschäftigter (§20, B6: nein) — nur als Praxissumme ohne
Personenbezug denkbar. Dazu gilt B10: Auch nach dem Trockenlauf wird keine
Automatik „scharf geschaltet"; jeder Progressionsschritt braucht die
Bestätigung der Therapeut:in.

**Offen.** Wie lange, und wie wird Übereinstimmung gemessen — ohne dass daraus
eine Auswertung je Person entsteht?

---

### IDEA-TRN-013 — Belastungssteuerung über die Woche: mit Vorsicht

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [02 TRK](02-tracking-und-parameter.md) |

**Idee.** Wochenbelastung sichtbar machen (Trainingsumfang, Alltagsaktivität,
Sport außerhalb des Plans), damit Sprünge auffallen.

**Vorsicht — bewusst als Warnung notiert.** Das naheliegende Maß dafür, das
Verhältnis von akuter zu chronischer Belastung, ist methodisch stark
kritisiert worden; die Ableitung von Verletzungsrisiko daraus gilt als nicht
haltbar. Es wäre also **kein** validiertes Instrument im Sinne von ADR-006
Punkt 2, sondern ein selbst gebauter Score — und damit nach Punkt 4
ausgeschlossen.

**Konsequenz.** Belastung darstellen: ja. Daraus eine Risikoaussage ableiten:
nein. Diese Unterscheidung sollte in jeder Diskussion über
„Überlastungswarnungen" vorne stehen.
