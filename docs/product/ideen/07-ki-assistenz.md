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
| Status | bestätigt |
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
| Status | bestätigt |
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
| Status | bestätigt |
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
| Status | bestätigt · Abgrenzung |
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
| Status | bestätigt |
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
| Status | bestätigt · Einordnung |
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

---

### IDEA-KI-007 — Sprachdokumentation: Diktat, Transkription, geprüfter Entwurf

| | |
|---|---|
| Status | Anforderung bestätigt (Jannes, 2026-09-08) · Umsetzung, Anbieterwahl und Einführung offen — eigener Auftrag |
| Quelle | Jannes, 2026-09-08 |
| Berührt | [ADR-005](../../adr/ADR-005-provider-independent-ai.md) (offene Folgefrage zu Diktat/Spracherkennung), [ADR-006](../../adr/ADR-006-medical-device-boundary.md) Punkt 2 und 5, [ADR-016](../../adr/ADR-016-clinical-documentation-record.md) (schließt Diktat/KI-Entwürfe ausdrücklich aus und verweist hierher), ADR-008 (Retention „nicht angenommene KI-Entwürfe"), `IDEA-KI-002`, `IDEA-KI-003` |

**Idee.** Statt der heutigen manuellen Texteingabe auf dem Smartphone
unmittelbar nach dem Hausbesuch: die eigene Dokumentation aus dem
zugehörigen Termin heraus einsprechen, transkribieren lassen und als
strukturierten Entwurf prüfen und korrigieren, bevor er zur Dokumentation
wird. Konkret gewünscht:

- Aufnahme startet ausdrücklich aus dem zugehörigen Termin; Patient:in und
  Termin sind dabei eindeutig zugeordnet.
- Gesprochenes wird transkribiert und in die passenden Abschnitte der
  Dokumentationsvorlage eingeordnet.
- Keine eigenständigen klinischen Schlussfolgerungen, Bewertungen,
  Empfehlungen oder Ergänzungen der KI.
- Ausdrücklich diktierte Einschätzungen und nächste Schritte werden
  übernommen — das sind Aussagen der Therapeutin, keine Ergänzung durch die
  KI.
- Zahlen, Einheiten, Körperseiten, Verneinungen, Unsicherheiten und die
  Unterscheidung Patientenaussage/eigene Beobachtung bleiben inhaltlich
  erhalten.
- Unverständliche Stellen werden gekennzeichnet, nicht geraten.
- Transkript und strukturierter Entwurf stehen zur Prüfung und Korrektur
  bereit, bevor irgendetwas Teil der Dokumentation wird.

**Warum.** Deckt sich mit dem bereits als zulässig eingeordneten
Anwendungsfall „Freitext strukturieren" aus `IDEA-KI-002` — mitgeschriebene
Notizen in die Dokumentationsvorlage überführen, ohne Inhalt hinzuzufügen —
nur dass die Notiz gesprochen statt geschrieben ist. Die Anforderungen an
Quellenbindung (`IDEA-KI-003`) und die Verbotsliste (`IDEA-KI-004`) gelten
unverändert: eine Spracherkennung, die Befunde zusammenfasst oder deutet,
unterliegt derselben Prüfung wie ein Textmodell. ADR-006 Punkt 5 erlaubt
„Dokumentation, sprachliche Transformation" ausdrücklich und verbietet nur
die hinzugefügte klinische Interpretation — genau diese Grenze zieht die
Anforderung bereits selbst („keine eigenständigen … Bewertungen"). Ein neuer
ADR zur grundsätzlichen Zulässigkeit ist damit voraussichtlich nicht nötig.
ADR-005 stellt allerdings selbst die offene Folgefrage, ob die
Providerunabhängigkeit auch für „Spracherkennung oder Diktat" gilt — diese
Anforderung beantwortet sie inhaltlich mit Ja: ein Diktier-/Transkriptionsdienst
ist ein Verarbeitungsdienst mit Zugang zu Gesundheitsdaten im Sinne von §3.5
und §6.1 und gehört hinter das AI Privacy Gateway, nicht als
Direktintegration in ein Fachmodul.

**Die offene Architekturfrage.** ADR-016 Punkt 7 finalisiert einen
Dokumentationsentwurf automatisch nach Ablauf einer Frist (Voreinstellung:
Ende des Folgetages) — ausdrücklich auch dann, wenn er unfertig ist, weil ein
fehlender Eintrag rechtlich schlechter ist als ein unfertiger (ADR-016,
Konsequenzen). Nach `PROJECT_PRINCIPLES.md` §6 und ADR-005 Punkt 7 darf ein
KI-Transkript oder ein strukturierter KI-Entwurf aber nicht ungeprüft
Bestandteil einer finalisierten Dokumentation werden — die automatische
Finalisierung darf also niemals einen unbestätigten KI-Entwurf erfassen. Ein
KI-Transkript/-Entwurf braucht damit einen eigenen Zustand **vor** dem
bestehenden `Entwurf` aus ADR-016 (zum Beispiel „KI-Vorschlag, ungeprüft")
und wird erst durch eine ausdrückliche Übernahme der Therapeutin zum
eigentlichen `Entwurf`, der danach normal weiterläuft — einschließlich der
Frist aus Punkt 7. Erst ab diesem Übernahmeschritt gilt der Text als von der
Therapeutin verfasst. ADR-016 nennt diese Zustandserweiterung ausdrücklich
als bewusst nicht entschieden („Diktat, Spracherkennung oder KI-gestützte
Entwürfe. Dafür gelten ADR-005 und ADR-006 zusätzlich.") — sie gehört in die
Feature-Spezifikation, sobald dieser Auftrag beauftragt wird.

**Retention.** ADR-008 führt bereits die Datenklasse „nicht angenommene
KI-Entwürfe" mit 7 Tagen Frist und „angenommene KI-Inhalte" mit der Frist des
Zieldokuments. Das deckt den ungeprüften Zwischenstand dieser Idee ab, ohne
dass dafür bei der Umsetzung selbst noch etwas Neues zur Aufbewahrung
entschieden werden müsste.

**Vorsicht.**

- Audio ist selbst ein besonders sensibles Gesundheitsdatum (Stimme plus
  Inhalt); Speicherort und -frist des Rohaudios sind hier nicht entschieden
  und gehören zusammen mit der Providerwahl geprüft (§3.5, ADR-002).
- „Ausdrücklich diktierte Einschätzung" und „von der KI ergänzte
  Einschätzung" müssen technisch unterscheidbar bleiben — sonst verwischt
  genau die Grenze, die ADR-006 zieht.
- Anbieterwahl für Spracherkennung/Transkription läuft über denselben
  Prüfkatalog wie jeder andere KI-/Verarbeitungsdienst (ADR-002, ADR-005
  Punkt 8) — kein Startvorteil, nur weil es „nur" Transkription ist.

---

Zuletzt aktualisiert: 2026-09-08 (`IDEA-KI-007` Sprachdokumentation ergänzt)
