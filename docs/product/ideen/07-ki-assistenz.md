# KI-Assistenz (KI)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Zum Navigationspunkt **KI-Analyse**. Der Rahmen ist eng gesteckt und steht
bereits fest: [ADR-005](../../adr/ADR-005-provider-independent-ai.md) regelt
die Anbindung, [ADR-006](../../adr/ADR-006-medical-device-boundary.md) den
Inhalt. Diese Datei sammelt nur, **was** innerhalb dieses Rahmens sinnvoll
wäre — und was ausdrücklich nicht.

**Stand heute: es gibt keine produktive KI-Funktion.** Kein Eintrag hier ändert
daran etwas.

---

### IDEA-KI-001 — Der Rahmen zuerst, dann Features

| | |
|---|---|
| Status | vorschlag |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-005](../../adr/ADR-005-provider-independent-ai.md), C6 |

**Idee.** Bevor irgendein KI-Feature entsteht, existiert der zentrale Pfad aus
ADR-005: Berechtigungsprüfung, Zweckprüfung, Datenminimierung, zugelassener
Provider, Protokollierung. Kein Fachmodul ruft einen Provider direkt.

**Warum.** C6 benennt das Problem: „langfristig ein Gateway" ist
selbstaufhebend, weil das erste Feature sonst daran vorbeigebaut wird und
danach niemand mehr umbaut. ADR-005 hat das entschieden — der Eintrag hier
erinnert nur daran, dass die Reihenfolge nicht verhandelbar ist.

---

### IDEA-KI-002 — Zulässige Anwendungsfälle

| | |
|---|---|
| Status | vorschlag |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-006](../../adr/ADR-006-medical-device-boundary.md) Punkt 5 |

**Idee.** Anwendungsfälle, die innerhalb von ADR-006 Punkt 5 liegen — sprachlich
transformierend, nicht klinisch interpretierend:

- **Freitext strukturieren.** Mitgeschriebene Notizen in die
  Dokumentationsvorlage überführen, ohne Inhalt hinzuzufügen.
- **Übersetzen in Patientensprache.** Fachbegriffe in verständliche Sprache,
  auf Wunsch der Person, mit Freigabe durch die Praxis.
- **Entwurf einer Antwort auf eine Rückfrage**, den die Praxis prüft, ändert
  und freigibt. Nie automatisch versendet.
- **Verlaufszusammenfassung** aus vorhandenen Einträgen, ausschließlich
  zusammenfassend, mit Quellenverweis je Aussage.
- **Administratives**: Terminvorschlagstexte, Formulierungshilfen,
  Übersetzungen.

**Vorsicht.** ADR-006 nennt die Verlaufszusammenfassung ausdrücklich als
schwierigste Stelle: „Zusammenfassung" ist der Name, unter dem sich
Interpretation am leichtesten einschleicht. Ein Satz wie „insgesamt
rückläufige Beschwerden" ist bereits eine Bewertung, wenn er so in keiner
Quelle steht.

---

### IDEA-KI-003 — Quellenbindung als Bauprinzip

| | |
|---|---|
| Status | vorschlag |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-006](../../adr/ADR-006-medical-device-boundary.md), `PROJECT_PRINCIPLES.md` §12 |

**Idee.** Jede von einem Sprachmodell erzeugte Aussage in einem klinischen
Kontext trägt einen Verweis auf den Eintrag, aus dem sie stammt. Aussagen ohne
Quelle werden nicht angezeigt.

**Warum.** Das macht die Anforderung aus ADR-006 Punkt 5 überhaupt erst
prüfbar — und beantwortet die dort offene Folgefrage, woran ein Verstoß
erkennbar wäre: an einer Aussage ohne Beleg. Nebenbei ist es die einzige
Darstellung, der eine Therapeutin in einem Termin unter Zeitdruck vertrauen
kann.

**Offen.** Wie wird das getestet? Denkbar: ein fester Satz synthetischer
Fälle mit erwarteten Belegen, als Regressionstest bei jeder Modell- oder
Promptänderung. Ohne solche Prüfung ist die Anforderung eine Absichtserklärung.

---

### IDEA-KI-004 — Ausdrücklich ausgeschlossen

| | |
|---|---|
| Status | vorschlag · Abgrenzung |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-006](../../adr/ADR-006-medical-device-boundary.md) Punkt 4 |

Damit die Liste einmal geschrieben steht und nicht in jedem Loop neu
diskutiert wird — folgendes ist keine Frage der Umsetzungsqualität, sondern
ausgeschlossen:

- Verdachtsdiagnosen, Differentialdiagnosen, Befundinterpretation
- Bewertung von Red Flags oder deren Ausschluss
- Auswahl oder Änderung von Übungen und Belastung
- Prognosen zu Heilungsverlauf oder Dauer
- Einstufung von Nachrichten nach Dringlichkeit
- Bewertung von Bewegungsvideos
- eigene Scores, Risikoklassen, Cutoffs
- Texte, die ohne menschliche Freigabe an Patient:innen gehen

---

### IDEA-KI-005 — Nutzung sichtbar machen

| | |
|---|---|
| Status | vorschlag |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-010](../../adr/ADR-010-audit-and-privileged-access.md), [ADR-011](../../adr/ADR-011-logging-and-observability.md), B1 (AI Act) |

**Idee.** Wo KI beteiligt war, steht das dran — im Dokument, im Entwurf, in
der Akte. Zusätzlich: wer wann für welchen Zweck welche Daten an einen
Provider gegeben hat, ist protokolliert.

**Warum.** ADR-010 verlangt Auditierbarkeit relevanter Vorgänge; ADR-006 lässt
die Einordnung nach EU AI Act ausdrücklich offen, und dessen
Transparenzpflichten sind absehbar. Die Kennzeichnung nachträglich einzuziehen
ist teurer als sie von Anfang an mitzuführen — und sie kostet fast nichts.

---

### IDEA-KI-006 — Was in der Referenzsoftware „KI-Analyse" heißt

| | |
|---|---|
| Status | vorschlag · Einordnung |
| Quelle | Claude, 2026-09-01 |
| Berührt | [referenz-navigation.md](referenz-navigation.md) |

**Einordnung.** Der hervorgehobene Knopf „KI-Analyse" in der Referenzsoftware
suggeriert eine Auswertung der Klientendaten mit Handlungsempfehlung. Für ein
Personal-Training-Werkzeug mag das tragen. Bei uns wäre dieselbe Funktion im
Behandlungskontext eine automatisierte klinische Entscheidungsunterstützung —
also `MDR_REVIEW_REQUIRED` und vorher nicht aktivierbar.

**Konsequenz.** Wenn ein solcher Knopf je entsteht, ist sein Inhalt der
Gegenstand der Prüfung, nicht seine Beschriftung. Eine Umbenennung in
„Zusammenfassung" ändert die Zweckbestimmung nicht — ADR-006 sagt das
ausdrücklich.
