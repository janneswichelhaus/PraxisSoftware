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

**Offen — beantwortet (B9 Punkt 5, 2026-09-08).** Die Frage lautete: Wer
entscheidet über die Übernahme, und in welche Richtung darf sie laufen? Was
passiert bei Widerruf der Einwilligung mit Trainingsdaten, die inzwischen
behandlungsrelevant geworden sind? Jannes hat vorläufig entschieden: **kein
automatischer Fluss, in keine Richtung** — aus der Akte ins Training nur auf
ausdrückliche Einwilligung und als Kopie mit Herkunftsvermerk, nie als
Verweis; vom Training in die Akte gar nicht, solange keine Heilbehandlung
läuft. Die Trennung entsteht technisch (eigene Tabellen, Rollenprüfung,
Policies nach ADR-004); Rücknahme `groß`. Bestätigung durch die
Datenschutzberatung (B2) steht aus. Der Widerrufsfall ist damit noch nicht im
Einzelnen beantwortet und gehört in die Spezifikation der Stufe 3.

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
| Status | überführt → LOE-001b |
| Quelle | Claude, 2026-09-01 |
| Berührt | [ADR-008](../../adr/ADR-008-data-retention-and-deletion.md), B3; LOE-001b, `ANN-032`; `IDEA-LZK-009`, `IDEA-QSN-003` |

**Stand.** Die Aufbewahrungsuhr ist gebaut: „Abschluss der Versorgung" als
ausdrücklicher, rücknehmbarer Vorgang in der Akte startet die zehnjährige
Aufbewahrung (LOE-001b, ANN-032; `../../development/ARBEITSBEREICHE.md`). Der
Rest — Datenexport beim Abschluss (Art. 20 DSGVO, siehe `IDEA-QSN-003`) und
ein definierter Zugangszustand — bleibt `bestätigt` und ist kein Auftrag. Der
Hinweis auf vergessene Abschlüsse steht als `IDEA-LZK-009`.

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
  Technisch steht einer proaktiven Erinnerung nichts mehr im Weg: der
  Scheduler existiert seit DOK-004 (`pg_cron`, ANN-007).

**Offen.** Wie die Empfehlung sich zur künftigen Betreuungsepisode
(IDEA-LZK-002) verhält, und ob für den Anfang ein Hinweis beim Öffnen einer
Verordnung mit niedrigem Restkontingent reicht oder eine proaktive Erinnerung
über den Scheduler gewünscht ist.

---

### IDEA-LZK-008 — Kund:innen des Personal Trainings ohne vorherige Heilbehandlung

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-06 |
| Berührt | B9 (erweitert), B4, B5, B11; `PROJECT_PRINCIPLES.md` §1, §14; `IDEA-LZK-002`; Roadmap Stufe 3; E-17, E-19 (entschieden 2026-09-06) |

**Idee.** Die Plattform ist für Patient:innen **und** für die Kund:innen von
Jannes' Personal Training gedacht. Eine Kundin kann sie nutzen, ohne je in
Heilbehandlung gewesen zu sein: kein Rezept, kein Behandlungsvertrag, keine
Akte nach §630f BGB — aber Trainingspläne, Check-ins, Fortschritt,
Gewohnheiten, Chat. Die Praxissoftware ist damit nur ein Teilbereich der
Software.

**Warum.** Jannes betreibt Personal Training neben der Physiotherapie; zwei
Werkzeuge für dieselben Abläufe widersprechen §2.1. Die Coaching-Referenz
([referenz-navigation.md](referenz-navigation.md)) zeigt, wie ein Werkzeug
für genau diese Gruppe aussieht.

**Vorsicht.** `IDEA-LZK-002` hat die Betreuungsepisode mit Typ vorgesehen —
hier entsteht der Fall „Episode `Training` ohne vorherige Episode
`Heilbehandlung`". Daran hängen von Anfang an: Dienstvertrag statt
Behandlungsvertrag, Umsatzsteuerpflicht, Einwilligung als Rechtsgrundlage,
eigene Aufbewahrungsfrist, keine Dokumentationspflicht (B9). Ob Personal
Training in derselben Praxis oder in einem eigenen Betrieb läuft, entscheidet
über Rechnungen und Stammdaten (B4). `PROJECT_PRINCIPLES.md` §1 nennt nur die
Physiotherapiepraxis; §14 nennt Online Coaching als spätere Erweiterung — die
Ergänzung von §1 nach §21 ist Jannes' Entscheidung (E-17). Gesundheitsdaten
bleiben es trotzdem: Verletzungen, Gewicht, Ernährung (Art. 9 DSGVO), mit
denselben Regeln wie in der Behandlung. Für den Ernährungsteil gilt
`IDEA-ALT-005` und `IDEA-ALT-006`.

**Antworten 2026-09-06 (E-17, E-19).** Das Personal Training beginnt
ebenfalls am 01.07.2027 — keine Bestandsdaten, kein Wunschtermin vor der
Eröffnung. Die Plattform dafür ist Stufe 3 nach dem ersten Betriebsmonat, in
der Reihenfolge Portalfundament → Übungspläne → Check-ins → Chat →
Kund:innen und Pakete → Gewohnheiten, Aktivitäten, Ernährung. Bis dahin werden
Kund:innen nicht als Patient:innen angelegt.

**Offen — beantwortet (B9, 2026-09-07: ein Unternehmen).** Die Frage lautete:
dieselbe Praxis oder eigener Betrieb? Jannes hat vorläufig entschieden, dass
Patient:innen und Kund:innen des Personal Trainings **über dasselbe
Unternehmen** betreut werden — eine `organization_id` nach ADR-003 für beides.
Die Festlegung geht als solche in die Anfrage B4; die steuerliche Bestätigung
steht aus. Die sechs Folgefragen (Vertragsart, Dokumentation, Aufbewahrung,
Rechtsgrundlage, Zweckbindung, Ernährung) hat er am 2026-09-08 vorläufig
entschieden (B9).

---

### IDEA-LZK-009 — Erinnerung an den vergessenen Abschluss der Versorgung

| | |
|---|---|
| Status | vorschlag |
| Quelle | Claude, 2026-09-11 (aus LOE-001b) |
| Berührt | [ADR-008](../../adr/ADR-008-data-retention-and-deletion.md), `ANN-032`, `IDEA-LZK-007`, B9 |

**Idee.** Eine Liste oder ein Hinweis für Akten, die seit langer Zeit keinen
Termin mehr hatten und trotzdem keinen Abschluss der Versorgung tragen — damit
die Praxis regelmäßig entscheidet, statt es zu vergessen.

**Warum.** Seit LOE-001b hängt die zehnjährige Aufbewahrung an einem
ausdrücklichen Vorgang: Ohne Abschluss läuft keine Frist, und die Akte wird
**nie** gelöscht. Das ist die sichere Richtung — ein vergessener Abschluss
verliert keine Daten —, aber auf Dauer eine Sammlung, die der
Speicherbegrenzung aus Art. 5 Abs. 1 lit. e DSGVO zuwiderläuft. Die Prüfung
wird das früher oder später ansprechen.

**Vorsicht.** Das ist ausdrücklich **keine** automatische Klassifizierung: Ein
Vorschlag darf keine Frist starten, sondern nur fragen. Die automatische
Variante ist `IDEA-LZK-007` und hängt an B9. Die Grenze ist wichtig, weil am
Abschluss eine Löschung hängt — eine Automatik, die sich irrt, löscht in zehn
Jahren eine Akte, die jemand noch braucht.

**Offen.** Ab wann „lange her" — und ob der Hinweis in die Akte gehört, in
„Übersicht" oder in eine eigene Liste für die Praxisleitung.
