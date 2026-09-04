# Rückfragen, Medien und Kommunikation (KOM)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Jannes: „Es sollen Rückfragen gestellt werden können, zum Beispiel auch mit dem
Anhängen von Fotos oder Videos."

Das ist funktional der naheliegendste und datenschutzrechtlich der heikelste
Wunsch aus dem Brainstorming.

---

### IDEA-KOM-001 — Strukturierte Rückfrage statt offenem Chat

| | |
|---|---|
| Status | notiert · ausgearbeitet |
| Quelle | Jannes, 2026-09-01 · Ausarbeitung Claude |
| Berührt | `PROJECT_PRINCIPLES.md` §10, C2, [ADR-004](../../adr/ADR-004-authorization-model.md) |

**Idee.** Eine Rückfrage ist kein Chatverlauf, sondern ein Vorgang mit Typ,
Bezug und Zustand:

- **Typ**: Ausführung einer Übung · Schmerz oder Beschwerde · Ausrüstung ·
  Organisatorisches
- **Bezug**: zu einer Übung, einer Einheit, einem Plan oder ohne Bezug
- **Zustand**: offen · beantwortet · erledigt
- **Anhänge**: Foto, Video, siehe IDEA-KOM-003

**Warum.** Ein offener Chat erzeugt drei Probleme auf einmal: er hat keine
Erledigungslogik (Nachrichten gehen unter), er lässt sich nicht nach
Zuständigkeit trennen (C2: Office darf organisatorische, nicht klinische
Inhalte sehen), und er ist nicht der Akte zuordenbar, obwohl §10 genau das
verlangt. Ein typisierter Vorgang löst alle drei — und ist für die
antwortende Person schneller, weil der Kontext dranhängt.

**Offen.** C2 ist ein offener Widerspruch im Prinzipiendokument. Ohne dessen
Auflösung ist nicht entscheidbar, wer welche Rückfrage sieht. Ein Feature-Loop
darf das nicht selbst entscheiden.

---

### IDEA-KOM-002 — Asynchron mit Zusage, plus klare Notfallabgrenzung

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-006](../../adr/ADR-006-medical-device-boundary.md), `PROJECT_PRINCIPLES.md` §16 |

**Idee.** Zwei Dinge stehen an jedem Eingabefeld für Rückfragen, dauerhaft
sichtbar und nicht wegklickbar:

1. **Zusage**: „Antwort in der Regel innerhalb von X Werktagen." Sichtbar
   auch die Praxiszeiten und wann definitiv nicht geantwortet wird.
2. **Abgrenzung**: „Dieser Kanal ist nicht für akute Beschwerden. Bei
   Notfällen 112, außerhalb der Praxiszeiten der ärztliche Bereitschaftsdienst
   116117."

**Warum — das ist ein Patientensicherheitsthema, kein Rechtstext.** Ein Kanal,
in den Patient:innen schreiben können, wird für alles benutzt, auch für „seit
heute Morgen taub im Fuß" und „Druck auf der Brust beim Training". Wenn das
drei Tage ungelesen liegt, ist der Schaden real. §16 stellt Patientensicherheit
über alles andere; eine unbeantwortete Erwartungshaltung ist genau die Lücke,
die dabei entsteht.

**Vorsicht.** Der Hinweis ist statisch und identisch für alle. Eine
**inhaltsabhängige** Einstufung („diese Nachricht klingt dringend") wäre eine
Risikoklassifikation nach ADR-006 Punkt 4 und ist ausgeschlossen.

**Offen.** Wie wird die Zusage technisch eingehalten? Eine Zusage ohne
Überwachung ist schlechter als keine.

---

### IDEA-KOM-003 — Foto- und Videoanhänge: eigene Datenklasse

| | |
|---|---|
| Status | notiert · entscheidung nötig |
| Quelle | Jannes, 2026-09-01 · Ausarbeitung Claude |
| Berührt | E8, [ADR-002](../../adr/ADR-002-hosting-data-residency.md), [ADR-007](../../adr/ADR-007-data-protection-impact-assessment.md), [ADR-008](../../adr/ADR-008-data-retention-and-deletion.md) |

**Idee.** Patient:innen laden Bewegungsvideos oder Fotos zu einer Rückfrage
hoch, die Praxis antwortet darauf.

**Warum das fachlich viel wert ist.** Eine Ausführung sehen zu können, ersetzt
drei Absätze Beschreibung. Für Online-Betreuung ist es der Unterschied
zwischen Ratschlag und Anleitung.

**Vorsicht — die höchste Risikoklasse im ganzen System.** Ein Bewegungsvideo
zeigt Gesicht, Körper, Wohnung und Umfeld. Es ist damit deutlich
identifizierender als jeder Freitext. Mindestanforderungen, bevor so etwas
existiert:

- eigene, ausdrückliche und widerrufbare Einwilligung — nicht in einer
  Sammel-Einwilligung versteckt
- kurze Voreinstellung für die Aufbewahrung, mit sichtbarem Löschdatum;
  Verlängerung nur bewusst
- Standortdaten und Aufnahmemetadaten werden beim Hochladen entfernt
- Speicherung beim geprüften Dienstleister nach ADR-002, kein fremdes CDN,
  keine öffentlichen Links
- Zugriff nur über kurzlebige signierte Verweise, jeder Zugriff auditiert
- Virenprüfung beim Hochladen (E8 ist dafür offen)
- Löschung durch die Person selbst möglich, jederzeit
- **niemals** in Logs, Fehlerberichten oder KI-Aufrufen ohne eigene Prüfung

**Offen.** E8 (Dateiablage: Ort, Verschlüsselung, Virenprüfung, signierte
Verweise) ist als offener Punkt geführt und blockiert das. Zusätzlich offen:
Ist ein Bewegungsvideo ein biometrisches Datum? Die Frage gehört in die DSFA.

---

### IDEA-KOM-004 — Antwort mit Zeitmarke und Anmerkung im Video

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | IDEA-KOM-003 |

**Idee.** Antworten auf ein Video mit Bezug auf eine Stelle: Zeitmarke,
Einzelbild, eingezeichnete Linie, Zeitlupe, Gegenüberstellung zweier Aufnahmen
aus verschiedenen Wochen.

**Warum.** „Bei 0:12 knickt das Knie nach innen" ist eine Anleitung. „Achte auf
die Knieposition" ist es nicht. Die Gegenüberstellung über die Zeit ist
zusätzlich das stärkste Fortschrittsargument, das es gibt — sichtbarer als
jede Kurve.

---

### IDEA-KOM-005 — Kein automatisches Bewegungsurteil aus Video

| | |
|---|---|
| Status | bestätigt · Abgrenzung |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-005](../../adr/ADR-005-provider-independent-ai.md), [ADR-006](../../adr/ADR-006-medical-device-boundary.md) |

**Idee.** Bewusst festgehalten, was **nicht** gebaut wird: eine automatische
Bewegungsanalyse, die aus einem Video eine Aussage über Ausführungsqualität,
Technikfehler oder Belastung ableitet.

**Warum.** Fachlich: Kamerawinkel, Kleidung, Untergrund und Beleuchtung machen
solche Auswertungen unzuverlässig, und sie sind gegenüber Kompensationen, auf
die es klinisch ankommt, wenig empfindlich. Regulatorisch: es ist eine
klinische Bewertung durch Software, also ADR-006 Punkt 4. Datenschutzrechtlich:
es bedeutet, Bewegtbild von Patient:innen durch ein KI-Modell zu schicken.

**Konsequenz.** Wenn das Thema aufkommt: `MDR_REVIEW_REQUIRED`, und zwar vor
der ersten Zeile Code.

---

### IDEA-KOM-006 — Benachrichtigungen mit Regeln, nicht nach Gefühl

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-011](../../adr/ADR-011-logging-and-observability.md), [05 ALT](05-alltag-gewohnheiten-ernaehrung.md) |

**Idee.** Feste Regeln für jede ausgehende Nachricht:

- **Der Inhalt einer Benachrichtigung enthält niemals Gesundheitsdaten.**
  „Neue Nachricht aus der Praxis" — nicht „Antwort zu deinen Knieschmerzen".
  Eine Vorschau auf dem Sperrbildschirm ist eine Offenlegung an jeden, der
  danebensteht.
- Ruhezeiten, je Person einstellbar.
- Obergrenze pro Woche.
- Jede Benachrichtigungsart einzeln abschaltbar, Abschalten ohne Nachteil.
- Kein Nachfassen bei ausgebliebener Reaktion über eine definierte Grenze
  hinaus.

**Warum.** Die Nachrichtenmenge ist der schnellste Weg, einen Zugang
unbrauchbar zu machen: erst wird stummgeschaltet, dann deinstalliert. Und die
Sperrbildschirmvorschau ist eine der häufigsten unbeabsichtigten Offenlegungen
von Gesundheitsdaten überhaupt — sie passiert vor Kolleg:innen, Familie,
Mitfahrenden.

---

### IDEA-KOM-007 — Klinisch relevante Inhalte kommen in die Akte

| | |
|---|---|
| Status | bestätigt · entscheidung nötig |
| Quelle | Claude, 2026-09-01 |
| Berührt | C2, `PROJECT_PRINCIPLES.md` §5, §10 |

**Idee.** Eine Nachricht mit klinischem Inhalt wird der Akte zugeordnet — mit
sichtbarer Herkunft und ohne den Inhalt zu verändern.

**Warum.** §10 verlangt die Zuordnung, §5 verlangt Nachvollziehbarkeit. Eine
Behandlungsentscheidung, die auf einer Chatnachricht beruht, die nicht in der
Akte steht, ist nicht dokumentiert.

**Offen.** Das ist C2, wörtlich, und es ist ungelöst: Wer klassifiziert, wann,
und was passiert mit einer bereits erfolgten Einsicht durch Office? Ein Loop
darf das nicht nebenbei entscheiden.
