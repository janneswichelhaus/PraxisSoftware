# ADR-018: Zustandsautomat des Termins

## Status

**Vorgeschlagen** — wartet auf die Bestätigung durch den Projektinhaber. Die
Bestätigungsfragen stehen am Ende. Erst mit der Bestätigung wird
`PROJECT_PRINCIPLES.md` §8 nachgezogen (§21); bis dahin bleibt dort der Satz
stehen, dass der Zustandsautomat nicht definiert ist.

## Datum

2026-09-11

## Kontext

§8 von `PROJECT_PRINCIPLES.md` behandelt bestätigte Termine als fix und
verbietet, sie automatisch zu verschieben — sagt aber ausdrücklich: „Der
Zustandsautomat des Termins ist noch nicht definiert." `OPEN_DECISIONS.md`
führt ihn als Punkt D mit Dringlichkeit P1.

Zwei Teile davon sind bereits entschieden:

- **Umfang (Jannes, 2026-09-05):** der vollständige Automat — angefragt,
  vorgemerkt, bestätigt, abgesagt, nicht angetroffen, durchgeführt,
  dokumentiert, abgerechnet. Ausdrücklich **nicht** die Minimalvariante mit
  nur „nicht angetroffen".
- **Eine Vorfrage (Jannes, 2026-09-08):** „angefragt" und „vorgemerkt" werden
  **nur vorgesehen, nicht gebaut**. Ohne Patientenportal gibt es niemanden,
  der einen Termin anfragt, und ADR-014 verbietet das Vorbauen.

Offen ist die Ausgestaltung: Übergänge und ihre Auslöser, die Migration der
heute vorhandenen Status, ob „dokumentiert" und „abgerechnet" gesetzt oder
abgeleitet werden, das Ausfallhonorar am Nichtantreffen und das Verhältnis von
Terminserie zu Terminstatus.

**Was heute existiert.** `public.appointments.status` kennt drei Werte:
`scheduled` (CAL-001), `completed` und `cancelled` (CAL-004). Ein
abgeschlossener Termin belegt seinen Zeitraum weiter, ist nicht direkt
bearbeitbar und muss zum Ändern ausdrücklich wieder geöffnet werden. Jeder
Wechsel schreibt einen Auditeintrag. `complete_treatment` (UX-007) fasst
Dokumentation und Abschluss in **einer** Transaktion zusammen, ohne eigene
Fachlogik: sie ruft die bestehenden Funktionen.

**Was daran hängt.** ADR-009 lässt Leistungen aus „durchgeführten Terminen"
entstehen und führt das Ausfallhonorar bei den bewusst offenen Punkten. §19
bindet die Fakturierung an eine finalisierte Dokumentation — bisher ohne
technischen Anker, weshalb ANN-005 diese Kopplung an Leistung und Rechnung
verweist statt an den Terminstatus.

## Entscheidung

### 1. Ein Statusfeld, acht Werte, sechs davon erreichbar

Der Zustand bleibt **ein** Feld auf `appointments`. Die Werte sind englische
Bezeichner wie bisher; die deutschen Beschriftungen liegen in der Oberfläche
(dasselbe Muster wie der Retention Schedule in LOE-001a).

| Wert | Deutsch | In V1 |
|---|---|---|
| `requested` | angefragt | **nur beschrieben, nicht gebaut** |
| `tentative` | vorgemerkt | **nur beschrieben, nicht gebaut** |
| `confirmed` | bestätigt | erreichbar |
| `cancelled` | abgesagt | erreichbar |
| `no_show` | nicht angetroffen | erreichbar |
| `completed` | durchgeführt | erreichbar |
| `documented` | dokumentiert | erreichbar |
| `invoiced` | abgerechnet | erreichbar (mit ABR-003) |

`requested` und `tentative` stehen **nicht** in der Datenbank-Constraint. Sie
sind hier benannt, damit die späteren Portal-Features (Etappe 4) keinen
zweiten Automaten erfinden — mehr nicht. Ein Wert, den niemand setzen kann,
wäre Vorbau (ADR-014).

### 2. Die Übergänge und wer sie auslöst

Alles, was schreibt, ist eine `SECURITY DEFINER`-Funktion mit eigener
Rollenprüfung und eigenem Auditereignis (ADR-004, ADR-010). Es gibt **keinen**
freien Statuswechsel über die Tabelle.

| Von | Nach | Auslöser | Wer |
|---|---|---|---|
| — | `confirmed` | `create_appointment` | Rollen der Terminverwaltung |
| `confirmed` | `cancelled` | `cancel_appointment` (Grund Pflicht) | Terminverwaltung |
| `confirmed` | `no_show` | `record_no_show` (Ausfallhonorar-Kennzeichen) | Terminverwaltung |
| `confirmed` | `completed` | `complete_appointment`, auch aus `complete_treatment` | therapeutische Rollen |
| `completed` | `documented` | Finalisierung der Dokumentation (ADR-016) | derselbe Vorgang, dieselbe Transaktion |
| `completed` | `confirmed` | `reopen_appointment` | therapeutische Rollen |
| `no_show` | `confirmed` | `reopen_appointment` | therapeutische Rollen |
| `documented` | `invoiced` | Ausstellung der Rechnung (ABR-003) | derselbe Vorgang, dieselbe Transaktion |
| `no_show` | `invoiced` | Ausstellung der Rechnung über das Ausfallhonorar | wie oben |
| `invoiced` | `documented` bzw. `no_show` | Storno der Rechnung (ADR-009) | wie oben |

**`cancelled` ist endgültig.** Ein versehentlich abgesagter Termin wird neu
angelegt, nicht wiederbelebt: Die Absage ist gegenüber der Patientin
kommuniziert worden, und ein stiller Rückweg würde diese Tatsache verwischen.

**`documented` kehrt nicht nach `confirmed` zurück.** Ist die Dokumentation
finalisiert, ist sie Bestandteil der Akte (ADR-016). Ein Irrtum wird dort
korrigiert — als Korrektur mit Begründung, die eine neue Version erzeugt —,
nicht dadurch, dass der Termin wieder aufgemacht wird. Eine Korrektur ändert
den Terminstatus **nicht**.

### 3. `documented` und `invoiced` werden gesetzt, nicht abgeleitet

Beide Werte setzt **der Vorgang, dem die Tatsache gehört**, in derselben
Transaktion: die Finalisierung beziehungsweise die Rechnungsausstellung. Es
gibt keine Oberfläche, die sie von Hand setzt, und keinen nachgelagerten Lauf,
der sie nachträgt.

Damit gilt als prüfbare Invariante: `status = 'documented'` **genau dann**,
wenn zu diesem Termin eine finalisierte Dokumentation existiert;
`status = 'invoiced'` **genau dann**, wenn eine ausgestellte, nicht stornierte
Rechnung ihn führt. Beide Richtungen gehören in `pnpm test:db`.

Die Alternative — beide nur aus den Quelltabellen ableiten und gar nicht im
Status führen — wäre normalisierter, verlangte aber für jede Terminliste einen
Join auf Dokumentation und Rechnung. Das trifft die Tagesliste und den
Kalender, also die beiden meistgelesenen Sichten. Die gewählte Lösung zahlt
dafür mit der Pflicht, die Invariante zu testen.

### 4. Das Ausfallhonorar ist ein Kennzeichen, kein Geldbetrag

`no_show` trägt ein Pflichtkennzeichen „Ausfallhonorar ja/nein", gesetzt im
selben Schritt wie der Zustand. Der Termin sagt damit nur, **ob** abgerechnet
werden soll. **Wie viel** steht im Leistungskatalog (ABR-001), und ob eine
Rechnung entsteht, entscheidet ABR-003. ADR-009 führt das Ausfallhonorar
bewusst als offenen Punkt; dieser ADR nimmt ihm nichts vorweg außer dem
Anknüpfungspunkt.

### 5. Die Serie hat keinen Status

Eine Terminserie (CAL-007) ist eine Erzeugungsregel, kein Zustandsträger.
Jeder Termin trägt seinen eigenen Status, und jede Änderung an einem Termin
der Serie ist ein eigener Vorgang mit eigenem Auditeintrag. „Die Serie
absagen" ist eine Bedienhilfe, die n Einzelabsagen auslöst — keine neunte
Zustandsänderung.

### 6. Migration der heutigen Daten

In derselben Migration, die die Constraint ersetzt:

- `scheduled` → `confirmed`,
- `cancelled` → `cancelled` (unverändert; siehe unten zum Grund),
- `completed` → `completed`, **außer** der Termin trägt bereits eine
  finalisierte Dokumentation: dann `documented`.

Die Umbenennung `scheduled` → `confirmed` berührt jede Abfrage, jeden Filter,
die EXCLUDE-Constraint und die Planungsregeln. Das ist mechanische, aber breite
Arbeit; sie gehört in CAL-008 und in keinen späteren Loop. Der Preis wird hier
bewusst bezahlt: Ein Feld, das `scheduled` heißt und „bestätigt" bedeutet,
wäre eine Lüge im Datenmodell, die jede spätere Portal-Erweiterung erbt.

**Der Absagegrund wird nicht rückwirkend erfunden.** Er ist Pflicht für jede
**neue** Absage; bestehende Zeilen behalten `null`. Dieselbe Abgrenzung wie
beim Terminfenster (CAL-010a) und beim Raster (CAL-005): Bestandsdaten bleiben
gültig.

### 7. Was der Automat nicht regelt

- **Keine automatischen Übergänge durch Zeitablauf.** Ein Termin, dessen Zeit
  vorbei ist, wird **nicht** von selbst `completed` oder `no_show`. Was
  stattgefunden hat, weiß nur die behandelnde Person. (Die automatische
  Finalisierung aus ADR-016 Punkt 7 bleibt davon unberührt: sie schreibt eine
  Dokumentation fest, die bereits existiert.)
- **Keine Zustandsänderung offline** (ADR-001).
- **Keine Statusänderung ohne Auditeintrag** (ADR-010).

## Konsequenzen

- §19 bekommt seinen technischen Anker: „Fakturierung erst nach finalisierter
  Dokumentation" ist ab jetzt prüfbar als „nur aus `documented` oder aus
  `no_show` mit Ausfallhonorar". **ANN-005 bleibt trotzdem in Kraft** — ein
  Termin lässt sich weiterhin ohne Dokumentation abschließen; die Sperre sitzt
  an der Rechnung, nicht am Abschluss. Der Eintrag bekommt bei ABR-002 seine
  Wiedervorlage.
- Der Auditkatalog wächst um `appointment.no_show`, `appointment.documented`
  und `appointment.invoiced`; `appointment.completed`, `.cancelled` und
  `.reopened` bleiben.
- Die Finalisierung der Dokumentation ändert ab jetzt einen Termin mit. Das
  ist ein neuer Seiteneffekt an einer Funktion, die ADR-016 gehört — er wird
  dort im Kopfkommentar benannt, damit ihn niemand für einen Fehler hält.
- Zwei Zustände existieren nur auf dem Papier. Wer die Liste liest, muss die
  Spalte „In V1" mitlesen; deshalb steht sie in der Tabelle und nicht in einer
  Fußnote.
- Die Umbenennung ist eine einmalige, breite Änderung mit Testabdeckung als
  einzigem Schutz. Sie wird teurer, je länger sie wartet — jeder weitere Loop
  schreibt `scheduled` in neue Abfragen.
- `cancelled` als Endzustand bedeutet: Wer versehentlich absagt, legt neu an.
  Das ist unbequem und beabsichtigt.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Werteliste der Absagegründe (CAL-008) und ihre Beschriftungen.
- Höhe, Steuerkennzeichen und Abrechnungsweg des Ausfallhonorars (ABR-001,
  ABR-003).
- Die Regeln der Terminserie selbst (CAL-007) und das Terminfenster
  (CAL-010a, §8.1).
- Das Patientenportal und alles, was `requested` und `tentative` erreichbar
  machen würde (Etappe 4).
- Die Frage, ob eine Absage kurz vor dem Termin anders behandelt wird als eine
  frühe — eine Fristenregel für Ausfallhonorare ist Praxisprozess, nicht
  Datenmodell.

## Offene Folgefragen

- Braucht „nicht angetroffen" eine eigene Frist im Retention Schedule, oder
  fällt es unter „abgesagte Termine und No-shows ohne Rechnung" (ADR-008,
  ANN-001)? Beim Bauen von CAL-008 zu prüfen — die Datenklasse existiert, die
  Regel im Löschlauf fragt heute nur nach `cancelled`.
- Wie verhält sich der Automat zu einem Termin, der von einer anderen Person
  abgeschlossen wird als der behandelnden?
- Soll die Praxis sehen können, wie oft eine Patientin nicht angetroffen wurde
  — und wäre das eine Auswertung im Sinne von §20?

## Bestätigungsfragen für Jannes

Je eine Zeile genügt; „wie empfohlen" reicht.

1. **`documented` und `invoiced` als Werte derselben Statusspalte** (Punkt 3)
   — oder lieber getrennte Merkmale neben dem Status?
   *Empfehlung: dieselbe Spalte.* Der Kalender und die Tagesliste bleiben
   dadurch einfache Abfragen; der Preis ist eine getestete Invariante.
2. **`scheduled` → `confirmed` umbenennen** (Punkt 6)?
   *Empfehlung: ja, in CAL-008.* Einmal breit, dafür heißt das Feld, was es
   bedeutet.
3. **Absagegrund als Pflicht** für neue Absagen, Bestandszeilen ohne Grund?
   *Empfehlung: ja.* Ohne Grund ist die Absagequote später nicht lesbar; mit
   rückwirkender Pflicht wäre die Migration eine Erfindung.
4. **`documented` ist nicht wieder zu öffnen** (Punkt 2)?
   *Empfehlung: ja.* Korrigiert wird in der Dokumentation, nicht im Kalender.
5. **`cancelled` ist endgültig** — versehentliche Absage heißt neu anlegen?
   *Empfehlung: ja.*
6. **Ausfallhonorar-Kennzeichen als Pflichtentscheidung** beim Nichtantreffen,
   Vorbelegung „nein"?
   *Empfehlung: ja.* Die Entscheidung fällt im Hausflur, nicht im Büro.
7. Nach deiner Bestätigung ziehe ich **§8 der Prinzipien** nach (§21, eigener
   Commit) und markiere Punkt D in `OPEN_DECISIONS.md` als erledigt. *Einverstanden?*
