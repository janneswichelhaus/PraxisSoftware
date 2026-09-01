# Alltag, Gewohnheiten und Ernährung (ALT)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Deckt die Navigationspunkte **Aktivitäten**, **Gewohnheiten** und **Ernährung**
ab. Fachlich der Bereich mit dem größten Wirkungspotenzial außerhalb der
Behandlungszeit — und berufsrechtlich der heikelste.

---

### IDEA-ALT-001 — Alltagsaktivität als Kontext, nicht als Wettbewerb

| | |
|---|---|
| Status | notiert · ausgearbeitet |
| Quelle | Jannes, 2026-09-01 (Navigationspunkt „Aktivitäten") · Ausarbeitung Claude |
| Berührt | [02 TRK](02-tracking-und-parameter.md) |

**Idee.** Erfassen, was außerhalb des Plans passiert: Gehen, Radfahren,
Gartenarbeit, Sport, körperliche Arbeit. Grob und ohne Genauigkeitsanspruch —
Art, ungefähre Dauer, ungefähre Intensität.

**Warum.** Ohne diese Information ist keine Trainingsreaktion deutbar. Wer am
Samstag sechs Stunden Umzug gemacht hat, hat am Montag nicht wegen des
Trainingsplans Schmerzen. Genau diese Verwechslung führt zu falschen
Planänderungen.

**Vorsicht.** Keine Bestenlisten, keine Vergleiche mit anderen. Bei
Schmerzpatient:innen ist die Aktivitätsanzeige eine
Selbstbewertungsmaschine — und ein schlechter Tag wird zum persönlichen
Versagen umgedeutet.

---

### IDEA-ALT-002 — Gewohnheiten mit sehr kleinen Zielen

| | |
|---|---|
| Status | notiert · ausgearbeitet |
| Quelle | Jannes, 2026-09-01 (Navigationspunkt „Gewohnheiten") · Ausarbeitung Claude |
| Berührt | [01 TRN](01-trainingsplaene-und-progression.md) |

**Idee.** Wenige, sehr kleine, sehr konkrete Gewohnheiten mit Verlauf: „nach
dem Zähneputzen zwei Minuten Mobilität", „eine Treppe statt Aufzug",
„Wasserflasche auf den Schreibtisch". Mit Auslöser, Ort und Zeitpunkt
formuliert, nicht als Vorsatz.

**Warum.** Verhaltensänderung scheitert an der Größe der Schritte und am
fehlenden Auslöser, nicht an der Motivation. Eine Gewohnheit, die an eine
bestehende Handlung gekoppelt ist, hält; eine, die „mehr Bewegung im Alltag"
heißt, hält nicht.

**Vorsicht.** Serien und Abzeichen wirken — solange sie nichts Klinisches
belohnen. **Niemals eine Serie an Schmerzfreiheit, Trainingsdurchführung trotz
Beschwerden oder eine Zielgewichtsangabe knüpfen.** Eine gebrochene Serie darf
kein Ereignis sein, das jemanden dazu bringt, gegen Schmerz zu trainieren.
Serien werden bei Krankheit pausiert, nicht gebrochen.

---

### IDEA-ALT-003 — Schlaf und Stress mitführen

| | |
|---|---|
| Status | vorschlag |
| Quelle | Claude, 2026-09-01 |
| Berührt | [02 TRK](02-tracking-und-parameter.md) |

**Idee.** Schlafdauer, Schlafqualität und Belastungsempfinden als tägliche
Ein-Klick-Werte im Check-in.

**Warum.** Beides gehört zu den stärksten Einflussgrößen auf
Schmerzempfinden und Belastbarkeit und erklärt einen erheblichen Teil der
Schwankungen, die sonst dem Training zugeschrieben werden. Zwei Klicks pro
Tag, hoher Erklärungswert.

**Vorsicht.** Erfassen und darstellen. Keine Ableitung wie „dein Schmerz kommt
vom Schlafmangel" — das ist eine klinische Aussage
([ADR-006](../../adr/ADR-006-medical-device-boundary.md) Punkt 4).

---

### IDEA-ALT-004 — Bedarfsmedikation als Verlaufsgröße

| | |
|---|---|
| Status | vorschlag |
| Quelle | Claude, 2026-09-01 |
| Berührt | [02 TRK](02-tracking-und-parameter.md), [ADR-008](../../adr/ADR-008-data-retention-and-deletion.md) |

**Idee.** Erfassen, ob und wie oft Schmerzmittel bei Bedarf genommen wurden —
als Häufigkeit, nicht als Medikationsplan.

**Warum.** Der Verbrauch von Bedarfsmedikation ist eine der aussagekräftigsten
Verlaufsgrößen überhaupt und wird fast nie erhoben. Ein gleichbleibender
Schmerzwert bei halbiertem Verbrauch ist eine deutliche Verbesserung — die man
sonst nicht sieht.

**Vorsicht.** Medikationsdaten sind besonders sensibel und erhöhen die
Anforderungen an Sichtbarkeit und Aufbewahrung. Eine
Medikationsverwaltung ist das ausdrücklich **nicht** — das wäre ein eigenes
Feature mit eigener regulatorischer Bewertung.

---

### IDEA-ALT-005 — Ernährung nur als Protokoll und Zielwert

| | |
|---|---|
| Status | notiert · entscheidung nötig |
| Quelle | Jannes, 2026-09-01 (Navigationspunkt „Ernährung") · Einordnung Claude |
| Berührt | B9, [ADR-006](../../adr/ADR-006-medical-device-boundary.md) |

**Idee.** Wie in der Referenzsoftware: Tagesprotokoll, Zielwerte für Energie
und Makronährstoffe, Wasseraufnahme.

**Vorsicht — berufsrechtlich, nicht nur datenschutzrechtlich.**
Physiotherapeutische Qualifikation deckt keine Ernährungstherapie ab.
Allgemeine Hinweise und ein Protokoll, das die Person selbst führt, sind etwas
anderes als eine individualisierte Ernährungsempfehlung bei bestehender
Erkrankung. Wo genau die Grenze liegt und ob eine Zusatzqualifikation
vorliegt, ist eine Frage an Jannes und gegebenenfalls an eine
berufsrechtliche Beratung — nicht an einen Loop.

**Offen.** Als Teil von B9 in `docs/decisions/OPEN_DECISIONS.md` mitgeführt.
Darf die Praxis Zielwerte vorgeben, oder setzt die Person sie selbst? Das ist
die entscheidende Unterscheidung.

---

### IDEA-ALT-006 — Kalorienzählen ist nicht für alle harmlos

| | |
|---|---|
| Status | vorschlag · Abgrenzung |
| Quelle | Claude, 2026-09-01 |
| Berührt | IDEA-ALT-005, `PROJECT_PRINCIPLES.md` §16 |

**Idee.** Falls je ein Ernährungsprotokoll entsteht: standardmäßig aus,
bewusst zuschaltbar, jederzeit abschaltbar; keine Bewertung einzelner
Lebensmittel als gut oder schlecht; keine automatische Gewichtszielsetzung;
kein Nachfassen bei ausbleibender Eingabe.

**Warum.** Tägliches Erfassen von Kalorien und Gewicht kann gestörtes
Essverhalten auslösen oder verstärken. In einer Praxis, in die Menschen mit
Schmerz, Bewegungsangst und oft belastetem Körperbild kommen, ist das keine
Randgruppe. §16 stellt Patientensicherheit über Funktionsumfang — das gilt
auch hier, wo der Schaden nicht körperlich ist.

**Konsequenz.** Wenn dieser Bereich gebaut wird, gehört diese Frage in die
Spezifikation, nicht in den Nachgang.

---

### IDEA-ALT-007 — Kein Vergleich zwischen Patient:innen

| | |
|---|---|
| Status | vorschlag · Abgrenzung |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-004](../../adr/ADR-004-authorization-model.md), [ADR-006](../../adr/ADR-006-medical-device-boundary.md) |

**Idee.** Bewusst festgehalten: keine Bestenlisten, keine Gruppenvergleiche,
keine Einordnung „du liegst über dem Durchschnitt".

**Warum.** Dreifach. Datenschutz: Vergleichswerte anderer Patient:innen
sichtbar zu machen, offenbart deren Daten, egal wie aggregiert. Fachlich:
Verläufe in der Rehabilitation sind individuell, ein Vergleich demotiviert
zuverlässig genau die Personen, die es am wenigsten brauchen können.
Regulatorisch: eine Einordnung gegenüber einem Kollektiv ist eine
Klassifikation.
