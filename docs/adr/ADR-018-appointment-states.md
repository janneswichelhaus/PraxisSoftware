# ADR-018: Zustandsautomat des Termins

## Status

**Angenommen** — vom Projektinhaber am 2026-09-11 bestätigt, alle sieben
Fragen wie empfohlen. `PROJECT_PRINCIPLES.md` §8 ist mit Version 0.7
nachgezogen (§21), Punkt D in `OPEN_DECISIONS.md` ist geschlossen.

**Fassung 2 (2026-09-12)** — begrenzte Ergänzung nach einer Festlegung des
Projektinhabers: Die Frist für das Ausfallhonorar ist entschieden (24 Stunden,
Punkt 8), und das Nichtantreffen verliert seine Pflichtentscheidung über das
Honorar (Punkt 4 neu gefasst). Fassung 1 hatte beides ausdrücklich offen
gelassen beziehungsweise anders geregelt; was sich ändert, steht in Punkt 8
und ist dort als Änderung gekennzeichnet. Alles Übrige gilt unverändert.

**Fassung 3 (2026-09-13)** — nach einer verbindlichen Festlegung des
Projektinhabers zu den Hausbesuch-Szenarien (E14 in `OPEN_DECISIONS.md`
erledigt; `PROJECT_PRINCIPLES.md` 0.10 §8): Das Nichtantreffen nach Protokoll
löst eine Ausfallgebühr aus, und „Tür geöffnet, keine Behandlung" gilt als
durchgeführt (Punkt 9 neu; Punkt 8 Nr. 5 und Punkt 4 entsprechend geändert).
Außerdem holt Fassung 3 drei Korrekturen aus dem Dokumentations-Audit nach:
der Übergang `confirmed → documented` aus ANN-036 steht jetzt im ADR, der
Storno-Rückweg nach `cancelled` ist benannt, und „genau ein Anlass" ist
berichtigt. Fassung 2 hatte Punkt 4 aus Fassung 1 umgekehrt; Fassung 3 kehrt
ihn in der Sache zurück — beides Festlegungen des Projektinhabers, beides hier
als Umkehr benannt (Fassungsregel in `docs/adr/README.md`).

## Datum

2026-09-11 · Fassung 2: 2026-09-12 · Fassung 3: 2026-09-13

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
  *Voraussetzung entfallen am 2026-09-22: Die Plattform gehört zum Umfang der
  Eröffnung (`PROJECT_PRINCIPLES.md` §4.6, §8, §14). Die Zustände werden damit
  zu einem konkreten Auftrag und entstehen mit dem Loop, der Terminwünsche
  einführt.*

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
| `confirmed` | `documented` | Finalisierung der Dokumentation eines noch nicht abgeschlossenen Termins, auch automatisch nach ADR-016 Punkt 7; setzt `completed_at` mit (**Fassung 3**, aus ANN-036) | derselbe Vorgang, dieselbe Transaktion |
| `completed` | `confirmed` | `reopen_appointment` | therapeutische Rollen |
| `no_show` | `confirmed` | `reopen_appointment` | therapeutische Rollen |
| `documented` | `invoiced` | Ausstellung der Rechnung (ABR-003) | derselbe Vorgang, dieselbe Transaktion |
| `no_show` | `invoiced` | Ausstellung der Rechnung über das Ausfallhonorar | wie oben |
| `cancelled` | `invoiced` | Ausstellung der Rechnung über die Ausfallgebühr einer Absage mit Gebührenanlass (**Fassung 2**, Punkt 8) | wie oben |
| `invoiced` | `documented`, `no_show` bzw. `cancelled` | Storno der Rechnung (ADR-009) — zurück in den Zustand vor der Ausstellung (**Fassung 3**: `cancelled` ergänzt) | wie oben |

**`cancelled` ist endgültig.** Ein versehentlich abgesagter Termin wird neu
angelegt, nicht wiederbelebt: Die Absage ist gegenüber der Patientin
kommuniziert worden, und ein stiller Rückweg würde diese Tatsache verwischen.
Endgültig heißt: **kein Rückweg nach `confirmed`.** Der Übergang nach
`invoiced` und zurück per Storno (Fassung 2 und 3) ändert daran nichts — der
Termin bleibt eine Absage, der Gebührenanlass ist ein Merkmal daneben.

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

**Fassung 2, 2026-09-12 — neu gefasst.** Der Termin trägt ein Kennzeichen
**Gebührenanlass** (`fee_basis`): entweder nichts, oder den Grund, aus dem eine
Gebühr entstehen soll. Es sagt damit nur, **ob** abgerechnet werden soll und
**woraus**. **Wie viel** steht im Leistungskatalog (ABR-001), und ob eine
Rechnung entsteht, entscheidet ABR-003. ADR-009 führt das Ausfallhonorar
bewusst als offenen Punkt; dieser ADR nimmt ihm nichts vorweg außer dem
Anknüpfungspunkt.

Gesetzt wird das Kennzeichen **ausschließlich vom Server**: aus der Frist in
Punkt 8 (`late_cancellation`) und — **Fassung 3** — aus dem bestätigten
Protokoll des Nichtantreffens in Punkt 9 (`no_show`). Es gibt in V1 damit
zwei Anlässe; Bestandszeilen aus Fassung 1 tragen `no_show` bereits.

*In Fassung 1 stand hier:* „`no_show` trägt ein **Pflicht**kennzeichen
‚Ausfallhonorar ja/nein', gesetzt im selben Schritt wie den Zustand." Fassung 2
hatte diese Entscheidung gestrichen; **Fassung 3** ersetzt sie nicht durch
eine Wahl, sondern durch eine Regel: Nach bestätigtem Protokoll entsteht die
Gebühr immer (Punkt 9). *(Fassung 2 sagte hier: „genau einen Anlass:
`late_cancellation`" — das war schon wegen der Bestandszeilen mit `no_show`
ungenau.)*

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

### 8. Die Frist des Ausfallhonorars — und warum das Nichtantreffen keine trägt

**Neu in Fassung 2 (2026-09-12).** Der Projektinhaber hat festgelegt:

> Patientenabsage weniger als 24 Stunden vor Behandlungsbeginn →
> Ausfallgebühr. Person beim Hausbesuch vor Ort nicht angetroffen → Termin
> abhaken mit Vermerk.

Daraus folgen fünf Festlegungen:

1. **Der Eingang der Absage ist ein eigenes Datum.** `cancellation_received_at`
   hält fest, **wann die Absage die Praxis erreicht hat**; `cancelled_at` hält
   unverändert fest, **wann sie eingetragen wurde**. Die beiden fallen im
   Alltag auseinander: Der Anruf kommt abends aufs Band, eingetragen wird am
   nächsten Morgen. Ohne die Trennung entschiede die Schreibgeschwindigkeit des
   Büros über eine Forderung gegen eine Patientin.
2. **Die Frist rechnet der Server**, aus dem Eingang und dem vereinbarten
   Beginn des Termins, nie aus der Eingabezeit und nie im Browser. Sie ist eine
   Geldfrage (§19); eine im Browser gerechnete Frist wäre weder prüfbar noch
   verlässlich.
3. **Weniger als 24 Stunden heißt weniger als 24 Stunden.** Genau 24 Stunden
   liegen **außerhalb** der Regel. Gerechnet wird in absoluten Stunden auf
   Zeitstempeln mit Zone; eine Zeitumstellung verschiebt die Grenze deshalb um
   die Stunde, die sie auch in Wirklichkeit verschiebt.
4. **Nur die Patientenabsage löst aus.** Eine praxisbedingte Absage
   (`practice_request`) löst nie eine Gebühr aus. „Verlegt" und „Sonstiger
   Grund" lösen ebenfalls keine automatische Gebühr aus — beides sagt über den
   Anlass zu wenig, und eine zu Unrecht vorgemerkte Forderung gegen eine
   Patientin ist teurer zurückzunehmen als eine nachzutragende (§16).
5. ~~**Das Nichtantreffen trägt keine Gebührenentscheidung.** Der Vermerk ist
   ein datensparsamer organisatorischer Abschluss: ein Tap, kein Formular. Aus
   ihm allein entsteht **keine** Gebühr. Ob das Nichtantreffen beim Hausbesuch
   eine eigene Gebührenregel bekommen soll, ist **offen**.~~ **Mit Fassung 3
   entschieden — siehe Punkt 9**, seit CAL-018 (2026-09-16) auch gebaut. Am
   Praxis- und am Videotermin gilt der hier beschriebene Stand weiter
   (ANN-055).

Der Termin bleibt in allen Fällen als **abgesagt** beziehungsweise **nicht
angetroffen** erkennbar. Der Gebührenanlass ist ein Merkmal daneben, kein
eigener Zustand: Eine Absage mit Gebühr ist eine Absage.

**Was das für Bestandsdaten heißt.** Nichts. Historische Vorgänge werden nicht
nachträglich umgedeutet und bekommen keine Gebühr: Für eine Absage ohne
festgehaltenen Eingang gibt es keine Frist zu rechnen, und ein bereits
gesetztes Ausfallhonorar-Kennzeichen aus Fassung 1 wandert unverändert als
`fee_basis = 'no_show'` mit — es war eine ausdrückliche Entscheidung eines
Menschen und bleibt eine.

**Was daran hängt.** Der Löschlauf (ADR-008, ANN-035): Ein Vorgang mit
Gebührenanlass wird **nicht** nach der Dreijahresfrist gelöscht — er ist die
Grundlage einer Forderung. Das galt bisher für den No-show mit Kennzeichen und
gilt ab jetzt genauso für die Absage mit `late_cancellation`. Und die
Rechnung: Zu den Übergängen in Punkt 2 tritt mit ABR-003
`cancelled → invoiced` für eine Absage mit Gebührenanlass, parallel zu
`no_show → invoiced` (seit Fassung 3 auch in der Tabelle in Punkt 2).

### 9. Die drei Hausbesuch-Szenarien

**Neu in Fassung 3 (2026-09-13).** Der Projektinhaber hat verbindlich
festgelegt (E14 erledigt, `PROJECT_PRINCIPLES.md` 0.10 §8):

> Tür geöffnet, Behandlung findet auf Angabe der Patient:in nicht statt →
> Termin gilt als durchgeführt, Pflichtvermerk in der Dokumentation, normale
> Abrechnung, keine Ausfallgebühr. Nicht angetroffen nach Protokoll
> (15 Minuten gewartet, geklingelt, angerufen) → nicht wahrgenommen,
> Ausfallgebühr. Absage unter 24 Stunden → Ausfallgebühr.

Daraus folgen vier Festlegungen:

1. **Das Nichtantreffen setzt den Gebührenanlass, sobald das Protokoll
   bestätigt ist.** `record_no_show` verlangt die Bestätigung der drei
   Protokollschritte als Pflichtangabe und setzt dann `fee_basis = 'no_show'`
   serverseitig; ohne Bestätigung gibt es kein Nichtantreffen — der Termin
   bleibt `confirmed`, bis die behandelnde Person entscheidet. Der Vermerk
   bleibt datensparsam: Er erscheint weder als Behandlung noch als verbrauchte
   Verordnungsleistung.
2. **„Tür geöffnet, keine Behandlung" ist kein eigener Zustand.** Der Termin
   wird über `complete_treatment` abgeschlossen und dokumentiert; die
   Dokumentation trägt einen **Pflichtvermerk** (ein Merkmal am Eintrag, dessen
   Zuschnitt CAL-018 festlegt — kein Freitext als einzige Quelle). Damit
   entsteht `documented`, und die Rechnung folgt dem regulären Weg aus Punkt 2.
   Eine Ausfallgebühr entsteht nicht; `fee_basis` bleibt leer.
3. **Die Oberfläche führt erklärend durch die drei Szenarien** — welcher Fall
   vorliegt, was daraus folgt, welche Angabe fehlt. Die Erklärung ist
   Bedienhilfe, keine Auswertung; sie wertet nichts je Person aus (§20).
4. **Rechnungstext und Rechtsgrundlage für Szenario 1** (Vergütung ohne
   erbrachte Behandlung) legt dieser ADR nicht fest; sie gehen als Festlegung
   des Projektinhabers in die Anfrage B4 (`OPEN_DECISIONS.md`, E14).

**Umgesetzt mit CAL-018 (2026-09-16).** `record_no_show` verlangt am
Hausbesuchstermin die Bestätigung des Protokolls und setzt daraufhin
`fee_basis = 'no_show'`; der Pflichtvermerk aus Nr. 2 ist das Merkmal
`treatment_notes.visit_without_treatment`, gesetzt im Abschluss. Für Praxis-
und Videotermine trifft E14 keine Aussage; dort bleibt es beim Vermerk ohne
Gebühr (ANN-055, Wiedervorlage bei Jannes).

## Konsequenzen

- §19 bekommt seinen technischen Anker: „Fakturierung erst nach finalisierter
  Dokumentation" ist ab jetzt prüfbar als „nur aus `documented` oder aus
  einem Vorgang mit Gebührenanlass (`no_show`, `late_cancellation`)". Einen
  Override gibt es nicht — `PROJECT_PRINCIPLES.md` 0.10 §19 sagt das seit
  Fassung 3 ausdrücklich. **ANN-005 bleibt trotzdem in Kraft** — ein Termin
  lässt sich weiterhin ohne Dokumentation abschließen; die Sperre sitzt an der
  Rechnung, nicht am Abschluss. Der Eintrag bekommt bei ABR-002 seine
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
  machen würde (Etappe 4). *Heute Block 4 der Roadmap; siehe den Vermerk im
  Kontext.*
- ~~Die Frage, ob eine Absage kurz vor dem Termin anders behandelt wird als
  eine frühe — eine Fristenregel für Ausfallhonorare ist Praxisprozess, nicht
  Datenmodell.~~ **Mit Fassung 2 entschieden** (Punkt 8). Die Einschätzung war
  richtig und nicht vollständig: Die Regel ist Praxisprozess, aber sie braucht
  ein Datum, das das Datenmodell bis dahin nicht hatte — den Eingang der
  Absage.

## Offene Folgefragen

- ~~Braucht „nicht angetroffen" eine eigene Frist im Retention Schedule, oder
  fällt es unter „abgesagte Termine und No-shows ohne Rechnung" (ADR-008,
  ANN-001)?~~ Mit ANN-035 beantwortet: dieselbe Klasse, Anker ist der Vermerk.
- ~~**Neu mit Fassung 2:** Soll das Nichtantreffen beim Hausbesuch eine eigene
  Gebührenregel bekommen — und wenn ja, welche?~~ Mit Fassung 3 (Punkt 9)
  entschieden: ja, nach bestätigtem Protokoll, immer.
- Wie verhält sich der Automat zu einem Termin, der von einer anderen Person
  abgeschlossen wird als der behandelnden?
- Soll die Praxis sehen können, wie oft eine Patientin nicht angetroffen wurde
  — und wäre das eine Auswertung im Sinne von §20?

## Bestätigungsfragen für Jannes — beantwortet am 2026-09-11

**Alle sieben wie empfohlen bestätigt.** Die Fragen bleiben mitsamt ihrer
Begründung stehen: Wer in zwei Jahren wissen will, warum `documented` kein
abgeleitetes Merkmal ist oder warum eine Absage keinen Rückweg hat, findet
hier die Abwägung und nicht nur das Ergebnis.

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

## Änderungshistorie

| Fassung | Datum | Änderung |
|---|---|---|
| 1 | 2026-09-11 | Angenommen, alle sieben Fragen wie empfohlen. |
| 2 | 2026-09-12 | Punkt 8 neu (24-Stunden-Frist, Eingang der Absage, nur Patientenabsage); Punkt 4 neu gefasst (Pflichtentscheidung beim Nichtantreffen entfällt) — eine Umkehr von Frage 6. |
| 3 | 2026-09-13 | Punkt 9 neu (Hausbesuch-Szenarien, E14 erledigt): Nichtantreffen nach Protokoll setzt `no_show` als Gebührenanlass; „Tür geöffnet, keine Behandlung" gilt als durchgeführt mit Pflichtvermerk. Punkt 8 Nr. 5 aufgehoben, Punkt 4 auf zwei Anlässe berichtigt. Korrekturen aus dem Audit: `confirmed → documented` (ANN-036) und Storno-Rückweg nach `cancelled` in der Tabelle; Klarstellung zu „endgültig". Umsetzung CAL-018. Punkte 1, 3, 5–7 unverändert. |
