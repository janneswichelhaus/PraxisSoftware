# Lebenszyklus und Zugang (LZK)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Dieser Bereich behandelt die Frage, **wann jemand welche Art von Zugang zur
Plattform bekommt** und was sich ändert, wenn aus einer Heilbehandlung eine
freiwillige Weiterbetreuung wird.

Das ist nicht bloß ein Feature. Es ist die strukturell folgenreichste Idee aus
dem Brainstorming, weil an ihr Rechtsgrundlage, Steuer, Aufbewahrungsfrist,
Dokumentationspflicht und MDR-Einordnung gleichzeitig hängen.

---

### IDEA-LZK-001 — Zugang ab dem Moment, in dem jemand Patient wird

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-01 |
| Berührt | [ADR-004](../../adr/ADR-004-authorization-model.md), B5, `PROJECT_PRINCIPLES.md` §4.6 |

**Idee.** Die Plattform wird für eine Person zugänglich, sobald sie Patient:in
wird — nicht erst nach Therapieende. Der Zugang wächst dann mit: erst
Termine, Fragebögen, Dokumente; später Trainingspläne und Betreuung.

**Warum.** Ein Zugang, der erst nach Therapieende entsteht, wird nie genutzt.
Die Gewöhnung muss in der Behandlungsphase passieren, solange der persönliche
Kontakt trägt.

**Vorsicht.** §4.6 und ADR-014 trennen Patient, Person und Auth-Account
bewusst. „Zugänglich sobald Patient" darf nicht zu „jeder Patient bekommt
automatisch einen Account" werden — beides sind verschiedene Aussagen. B5
(Identitätsprüfung, Vertretung, hochbetagte Patient:innen) ist offen und
blockiert das Portaldesign.

**Offen.** Wer löst den Zugang aus? Was sieht eine Person mit Zugang während
laufender Behandlung? Entspricht das der Einsicht nach §630g BGB — und wenn
ja, welche Teile der Akte?

---

### IDEA-LZK-002 — Betreuungsepisode als eigene Entität mit Typ

| | |
|---|---|
| Status | bestätigt · entscheidung nötig |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-008](../../adr/ADR-008-data-retention-and-deletion.md), [ADR-009](../../adr/ADR-009-private-billing-model.md), [ADR-014](../../adr/ADR-014-foundational-data-model.md), B3, B4, B9 |

**Idee.** Nicht „Patient hat Trainingspläne", sondern: eine Person hat eine
Folge von **Episoden**. Jede Episode hat einen Typ — mindestens
`Heilbehandlung` und `Weiterbetreuung / Prävention` — und trägt daran
gebunden: Rechtsgrundlage der Verarbeitung, umsatzsteuerliche Einordnung,
Dokumentationspflicht, Aufbewahrungsfrist, Einwilligungen.

**Warum.** Beim Übergang vom Rezept zur Weiterbetreuung ändert sich fast
alles gleichzeitig:

| Merkmal                | Heilbehandlung                     | Weiterbetreuung / Training              |
| ---------------------- | ---------------------------------- | ---------------------------------------- |
| Vertrag                | Behandlungsvertrag (§630a BGB)     | Dienstvertrag                            |
| Dokumentationspflicht  | §630f BGB, verpflichtend           | keine gesetzliche Pflicht                |
| Aufbewahrung           | 10 Jahre nach Behandlungsabschluss | eigene Frist zu definieren               |
| Umsatzsteuer           | i. d. R. befreit (§4 Nr. 14a UStG) | i. d. R. steuerpflichtig                 |
| DSGVO-Rechtsgrundlage  | Art. 9 Abs. 2 lit. h               | eher Art. 9 Abs. 2 lit. a (Einwilligung) |
| MDR-Bezug              | therapeutischer Zweck naheliegend  | schwächer, aber nicht automatisch weg    |

Ohne eine tragende Entität landet diese Unterscheidung als Bool-Flag
irgendwo im Patientendatensatz — und ist damit nicht historisierbar. Eine
Person kann mehrfach zwischen den Zuständen wechseln: Rezept, Training,
Rückfall, neues Rezept.

**Vorsicht.** Das ist ausdrücklich **kein Auftrag, das jetzt zu bauen**. §11
und ADR-014 verbieten prophylaktisches Vorbauen. Der Punkt ist: sobald das
erste Feature entsteht, das über die reine Heilbehandlung hinausgeht, ist
diese Entscheidung fällig — und vorher nicht.

**Offen.** Ist die Episode dasselbe wie eine „Behandlungsserie"? Wie verhält
sie sich zum in ADR-008 offenen Begriff „Abschluss der Behandlung"? Als
neuer Punkt B9 in `docs/decisions/OPEN_DECISIONS.md` aufgenommen.

---

### IDEA-LZK-003 — Zweckbindung beim Übergang, nicht stiller Datenfluss

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-004](../../adr/ADR-004-authorization-model.md), [ADR-007](../../adr/ADR-007-data-protection-impact-assessment.md), B9 |

**Idee.** Beim Wechsel in die Weiterbetreuung fließen Daten nicht automatisch
mit. Was aus der Behandlungsakte in den Trainingskontext übernommen wird, ist
eine bewusste, protokollierte Übernahme mit Einwilligung — zum Beispiel
Kontraindikationen, Belastungsgrenzen, Verletzungshistorie. Der Rest bleibt in
der Akte.

**Warum.** Die Daten stammen aus einer Verarbeitung zu Behandlungszwecken.
Sie in ein kostenpflichtiges Trainingsangebot zu übernehmen, ist ein neuer
Zweck. Umgekehrt gilt dasselbe: Trainingsdaten sind nicht automatisch Teil
der Patientenakte — bis die Person wieder in Behandlung kommt, dann werden sie
es unter Umständen sehr wohl.

**Vorsicht.** Das ist derselbe Konflikt wie C2 (klinische Inhalte in
organisatorischen Kanälen), nur eine Ebene höher. Wer trainiert und dabei
„seit Dienstag Taubheit im Fuß" einträgt, hat klinisch relevante Information
im Trainingskontext abgelegt.

**Offen.** Wer entscheidet über die Übernahme, und in welche Richtung darf sie
laufen? Was passiert bei Widerruf der Einwilligung mit Trainingsdaten, die
inzwischen behandlungsrelevant geworden sind?

---

### IDEA-LZK-004 — Klientenprofil als Voraussetzungsprofil

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 · angeregt durch „Athletenprofil" |
| Berührt | [01 TRN](01-trainingsplaene-und-progression.md) |

**Idee.** Das Profil ist nicht Stammdaten mit Sportfoto, sondern das, was ein
Plan braucht, um überhaupt durchführbar zu sein:

- **Ziele** in der Sprache der Person, nicht in Fachbegriffen — dafür eignet
  sich die Patient-Specific Functional Scale (siehe
  [IDEA-OUT-003](04-assessments-outcomes-fortschritt.md))
- **verfügbare Ausrüstung** (nichts / Bänder / Kurzhanteln / Studio)
- **realistisches Zeitbudget** pro Woche und pro Einheit
- **Trainingsorte** (zu Hause, Studio, unterwegs)
- **Kontraindikationen und Belastungsgrenzen**, aus der Behandlung übernommen
- **Verletzungs- und Operationshistorie**
- **Vorlieben und Abneigungen** — was die Person erfahrungsgemäß nicht macht

**Warum.** Die beiden häufigsten Gründe, warum ein fachlich guter Plan nicht
funktioniert, sind fehlende Ausrüstung und fehlende Zeit. Beides ist bekannt,
bevor der Plan geschrieben wird — es wird nur meistens nicht erfasst. Ein Plan,
der 45 Minuten und eine Langhantel voraussetzt, während die Person 15 Minuten
und ein Theraband hat, ist kein Plan.

**Offen.** Wie oft wird das Profil überprüft? Ein Zeitbudget aus dem Januar
gilt im Juni nicht mehr.

---

### IDEA-LZK-005 — Onboarding mit Überspringen-Möglichkeit für die Praxis

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 · angeregt durch „Client-Onboarding überspringen" |
| Berührt | [ADR-010](../../adr/ADR-010-audit-and-privileged-access.md) |

**Idee.** Ein geführter Einstieg für neue Zugänge (Einwilligungen, Profil,
erste Ziele, Benachrichtigungseinstellungen) — den die Praxis für eine
konkrete Person überspringen oder vorab ausfüllen kann. Überspringen wird
protokolliert.

**Warum.** Bei Hausbesuchen und älteren Patient:innen sitzt die Therapeutin
oft daneben und füllt gemeinsam aus. Ein Onboarding, das sich nicht
überspringen lässt, wird dann zum Hindernis. Dasselbe Muster wie der
Override in ADR-009 bei der Fakturierung: automatischer Ablauf als Regelfall,
begründeter Override als dokumentierte Ausnahme.

**Vorsicht.** Einwilligungen sind vom Überspringen ausgenommen. Eine
Einwilligung, die jemand anders für die Person geklickt hat, ist keine.

---

### IDEA-LZK-006 — Offboarding als eigener Vorgang

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-008](../../adr/ADR-008-data-retention-and-deletion.md), B3 |

**Idee.** Das Ende einer Betreuung ist ein Vorgang, kein Verstummen: Abschluss
festhalten, Datenexport anbieten (Art. 20 DSGVO), Zugang in einen definierten
Zustand versetzen, Aufbewahrungsuhr starten.

**Warum.** ADR-008 knüpft die 10-Jahres-Frist an den „Abschluss der
Behandlung" — ein Begriff, der laut ADR-008 selbst noch zu definieren ist.
Ohne expliziten Abschlussvorgang gibt es kein Ereignis, an dem die Frist
beginnen könnte. Der Löschmechanismus aus ADR-008 ist ohnehin als
Go-live-Blocker offen.

**Offen.** Was ist der Unterschied zwischen „Betreuung beendet", „Akte
geschlossen" und „Konto gelöscht"? Behält jemand nach dem Ende Lesezugriff auf
die eigenen Trainingsdaten?

---

### IDEA-LZK-007 — Empfehlung und Erinnerung am Rezeptende

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-05 |
| Berührt | B9, `IDEA-LZK-002`, `IDEA-LZK-003` |

**Idee.** Statt eines manuell gepflegten Aktiv/Inaktiv-Status: eine
automatische Klassifizierung, gekoppelt an eine Erinnerung für
Therapeut:innen gegen Rezeptende. Die Therapeutin hinterlegt dabei eine
Empfehlung zum weiteren Vorgehen — Folgeverordnung sinnvoll, aktuell keine
weitere Therapie nötig, oder noch offen. Langfristig soll das nicht auf
„Folgeverordnung ja/nein" beschränkt bleiben, sondern auch den Übergang in
ein Personal-Training-/Coaching-Angebot ohne Verordnung abdecken.

**Warum.** Rückmeldung von Jannes zu ANN-002
(`docs/decisions/ASSUMPTIONS.md`): ein manuelles Aktiv/Inaktiv sei
praxisfern. Näher an der Praxisrealität ist eine Einschätzung, die am
Behandlungsverlauf hängt — genau das, was `IDEA-LZK-002` mit der
Betreuungsepisode und ihrem Typ bereits konzeptionell vorsieht, hier ergänzt
um die konkrete Erinnerungs- und Empfehlungsmechanik.

**Vorsicht.** Zwei Teile dieser Idee sind unterschiedlich teuer:

- Die reine **Empfehlung der Therapeutin auf der Verordnung** („weitere
  Verordnung sinnvoll" / „keine weitere Therapie nötig" / „offen") ist
  normale Verlaufsdokumentation innerhalb der laufenden Heilbehandlung —
  keine automatisierte Einschätzung durch die Software, kein B9-Bezug.
- Die **automatische Klassifizierung, eine proaktive Erinnerung und der
  tatsächliche Übergang in ein verordnungsfreies Coaching-Angebot** sind
  durch **B9** blockiert (Rechtsrahmen für die Betreuung nach
  Therapieende ist offen, siehe `IDEA-LZK-002`/`IDEA-LZK-003`).
  Eine proaktive Erinnerung bräuchte außerdem einen Scheduler, den es nach
  `docs/development/ROADMAP.md` noch nicht gibt — dieselbe offene Frage wie
  bei DOK-004.

**Offen.** Wie die Empfehlung sich zur künftigen Betreuungsepisode
(IDEA-LZK-002) verhält, und ob eine ohne Scheduler auskommende Variante (z. B.
ein Hinweis beim Öffnen einer Verordnung mit niedrigem Restkontingent statt
einer proaktiven Benachrichtigung) für den Anfang reicht.
