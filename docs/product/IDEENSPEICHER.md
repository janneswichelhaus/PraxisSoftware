# Ideenspeicher

> **Dieses Dokument und der gesamte Ordner `docs/product/` sind nicht
> normativ.**
>
> Hier steht, was langfristig einmal in der Plattform stecken könnte — roh,
> unbewertet, unvollständig. Es ist **kein Implementierungsauftrag**, **keine
> Feature-Spezifikation** und **keine Freigabe**. Aus keinem Eintrag darf eine
> Erweiterung eines aktuellen Feature-Scopes abgeleitet werden.

## Rang

Rang 6 der Rangfolge in `PROJECT_PRINCIPLES.md` §21, die **schwächste** Ebene:
Ein Eintrag verliert gegen alles darüber. Eine offene Frage aus
`../decisions/OPEN_DECISIONS.md` beantwortet er nicht, egal wie ausgearbeitet
die Idee hier aussieht.

## Wozu das Ganze

Jannes sammelt Funktionsideen laufend und über lange Zeiträume. Ohne festen
Ort landen sie im Chatverlauf und sind im nächsten Loop weg. Dieser Ordner ist
der Ort. Er hat drei Aufgaben:

1. **Nichts verlieren.** Jede Idee bekommt eine stabile ID und bleibt
   auffindbar, auch wenn sie zwei Jahre liegt.
2. **Später gezielt wiederfinden.** Der Index unten sagt, welche Datei für
   welche Aufgabe relevant ist — genauso wie der ADR-Index in `CLAUDE.md`.
3. **Sackgassen vermeiden.** Wer weiß, was später kommen soll, benennt Dinge
   heute anders. Benennen kostet nichts. **Vorbauen kostet — und ist
   verboten.**

## Was ein Loop damit darf — und was nicht

**Erlaubt:**

- Im SPEC-Schritt **die eine** zum Auftrag passende Bereichsdatei lesen. Nicht
  alle. Der Index unten sagt, welche.
- Daraus **bessere Rückfragen** an Jannes ableiten.
- Bei einer ohnehin anstehenden Entscheidung (Benennung, Feldzuschnitt,
  Query-Form) die Variante wählen, die eine hier notierte Richtung nicht
  unnötig verbaut — **solange das im aktuellen Scope nichts zusätzlich
  kostet**.

**Verboten:**

- Zusätzliche Spalten, Tabellen, Felder, Endpunkte, Statuswerte oder
  UI-Elemente „für später" (`PROJECT_PRINCIPLES.md` §11,
  [ADR-014](../adr/ADR-014-foundational-data-model.md)).
- Einen Eintrag von hier als Begründung für Scope zitieren. Er begründet
  **nie** eine Implementierung.
- Eine hier notierte offene Frage selbst beantworten.

**Wenn ein Hinweis von hier Mehrarbeit oder eine fachliche Entscheidung
bedeuten würde:** stoppen, im Bericht als offene Frage nennen, weiterarbeiten
ohne ihn.

## Weg von der Idee zum Code

```
Idee (hier)
  → offene Entscheidung (docs/decisions/OPEN_DECISIONS.md), falls eine nötig ist
  → ADR (docs/adr/), falls die Entscheidung teuer rückgängig zu machen ist
  → Feature-Spezifikation
  → /feature-loop
```

Ist ein Eintrag diesen Weg gegangen, steht er auf `überführt` mit Ziel.
Überführte Einträge behalten Kopf und Stand-Zeile; die Begründung liegt im
Ziel und in Git.

## Statusmodell

| Status               | Bedeutung                                                                     |
| -------------------- | ----------------------------------------------------------------------------- |
| `notiert`            | Von Jannes eingebracht. Festgehalten, nicht bewertet.                         |
| `vorschlag`          | Von Claude vorgeschlagen. **Noch nicht von Jannes bestätigt.**                |
| `bestätigt`          | Jannes hat die Richtung bestätigt. Weiterhin **kein Auftrag**.                |
| `entscheidung nötig` | Vor jeder Spezifikation braucht es eine Entscheidung (siehe „Berührt"). Steht allein oder als Zusatz zu `notiert`, `vorschlag` oder `bestätigt`. |
| `zurückgestellt`     | Durch eine Entscheidung (`OPEN_DECISIONS.md`, ADR, Prinzipien) vorerst ausgeschlossen; **Verweis auf die Entscheidung Pflicht**, in Klammern. Kommt nur mit einer neuen Entscheidung zurück. |
| `überführt`          | Als ADR, offene Entscheidung, Feature-Spec oder gebaute Story weitergeführt. **Ziel nach einem Pfeil** (`überführt → CAL-009`). |
| `verworfen`          | Bewusst nicht weiterverfolgt. Bleibt mit Begründung stehen; Verweis auf die Entscheidung in Klammern, wenn es eine Kennung gibt. |

**Erlaubte Zusätze**, mit ` · ` an den Status gehängt:

| Zusatz          | Bedeutung                                                                   | Zu                                   |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| `ausgearbeitet` | Von Jannes eingebracht oder bestätigt, von Claude ausgearbeitet.            | `notiert`, `vorschlag`, `bestätigt`  |
| `Abgrenzung`    | Der Eintrag hält fest, was **nicht** gebaut wird.                           | `notiert`, `vorschlag`, `bestätigt`  |
| `Einordnung`    | Der Eintrag bewertet etwas Fremdes (Referenz, Begriff), schlägt nichts vor. | `notiert`, `vorschlag`, `bestätigt`  |
| `Bedenken`      | Festgehalten, aber mit begründetem Abraten.                                 | `notiert`, `vorschlag`               |

**Freitext im Statusfeld ist nicht zulässig** — kein Datum, kein Name, keine
Begründung, keine Bedingung. Erlaubt sind allein die Werte und Zusätze oben,
der Pfeil mit Ziel bei `überführt` und die Kennung in Klammern bei
`zurückgestellt` und `verworfen`. **Erläuterungen stehen in einer Zeile
`**Stand.**` unter der Tabelle** — was gebaut ist, wer wann entschieden hat,
was übrig bleibt. Umsetzungsstände im Einzelnen stehen nicht hier, sondern in
`../development/ARBEITSBEREICHE.md` und `../development/ROADMAP.md`; ein
Eintrag verweist nur auf die Kennung.

## Eintragsformat

Jeder Eintrag folgt demselben Aufbau, damit er maschinell und menschlich
schnell erfassbar bleibt:

```markdown
### IDEA-XXX-000 — Titel

| | |
|---|---|
| Status | notiert |
| Quelle | Jannes, 2026-09-01 |
| Berührt | ADR-006, B1 |

**Stand.** Nur wenn nötig: was davon gebaut ist (Kennung), wer wann
entschieden hat, was übrig bleibt. Ein Satz, kein Umsetzungsbericht.

**Idee.** Ein bis drei Sätze.

**Warum.** Fachliche Begründung.

**Vorsicht.** Regulatorisches, Datenschutz, bekannte Fallstricke. Weglassen,
wenn es nichts gibt.

**Offen.** Was entschieden werden muss, bevor das spezifiziert werden kann.
```

IDs werden **nie wiederverwendet** und **nie umnummeriert**, auch nicht nach
einem Verwurf. Neue Einträge hängen hinten an.

## Bestätigungen

- **2026-09-01** — Jannes hat alle 58 damals als `vorschlag` geführten Einträge
  (Zählung 2026-09-01; heute tragen 60 Einträge die Quelle Claude, 2026-09-01)
  auf `bestätigt` gesetzt. Sie sind damit als Zielrichtung bestätigt und
  weiterhin **kein Auftrag**: gebaut wird nur, was in
  `docs/development/ROADMAP.md` an der Reihe ist und im Loop eine eigene
  Spezifikation bekommt.
- **2026-09-06** — Mit den Antworten auf das Roadmap-Review: `IDEA-PRX-003`
  (Stufe 2), `IDEA-PRX-011`, `IDEA-PRX-012` und `IDEA-PRX-014` bestätigt;
  `IDEA-PRX-015` verworfen (keine Unterschrift nötig). Zwei eigene Vorgaben
  von Jannes zum Lastenrad-Hausbesuchskonzept als bestätigt eingetragen:
  `IDEA-PRX-029` Tagesroute auf der Karte und `IDEA-PRX-030` Navigationslink
  zu Google Maps. Neu notiert: `IDEA-LZK-008` Kund:innen des Personal
  Trainings ohne vorherige Heilbehandlung. Die übrigen `PRX`-Einträge bleiben
  `vorschlag`.
- **2026-09-08** — Zwei eigene Entscheidungen von Jannes verlassen den
  Ideenspeicher und werden verbindlich: das **Terminfenster**
  (`IDEA-PRX-002` → `PROJECT_PRINCIPLES.md` §8.1) und die
  **Sprachdokumentation** (`IDEA-KI-007` → §6.3, dazu ADR-005 Punkt 9,
  ADR-006 Punkt 8, ADR-016 Punkt 10). Beide Einträge stehen jetzt auf
  `überführt` und verweisen nur noch; was an ihnen offen geblieben ist, steht
  als E12 und E13 in `../decisions/OPEN_DECISIONS.md`. **Entschieden heißt
  weiterhin nicht gebaut** — beide sind noch nicht umgesetzt.

- **2026-09-11** — Jannes hat zwei Design-Kanvas geteilt. Der Logo-Kanvas
  liegt jetzt als Beleg im Markenverzeichnis (`marke/kanvas/`) — er gehört
  nicht hierher, weil `marke/` für die Marke verbindlich ist und nicht Rang 6.
  Aus dem zweiten, „Own Motion · Praxis", sind `IDEA-PRX-034` bis `-037`
  entstanden: der Entwurf selbst, die Merkliste „Mitnehmen", die Indikation in
  der Tagesliste (mit Bedenken) und die Abrechnungslage am Termin. Die
  Kanvas-Datei lag zunächst **nicht** im Repository: Sie zeigt vier Personen
  mit Anschrift und Indikation, und §3.1 lässt nur synthetische Daten zu.
  **Jannes hat noch am selben Tag bestätigt, dass die Namen erfunden sind** —
  die Datei liegt seitdem unter `kanvas/own-motion-praxis.html`.

- **2026-09-11, zweite Runde** — Jannes hat zwei Entscheidungen getroffen und
  eine abgegeben. **Monogramm** für das Kleinformat der Marke (Befund 2 in
  `marke/README.md`, umgesetzt). **`IDEA-PRX-036` verworfen** in der Form
  „Indikation ständig sichtbar in der Tagesliste" — die Entscheidung hat er
  ausdrücklich abgegeben, die Begründung steht am Eintrag. Das Bedürfnis lebt
  in `IDEA-PRX-016` weiter: aufklappbar und auditiert am Termin, nicht offen
  in einer Liste, die im Treppenhaus mitgelesen wird.

- **2026-09-12** — Aus dem Gespräch über die Oberfläche: `IDEA-PRX-042`
  notiert — eine Person auswählen, durch den Kalender scrollen, die Lücke
  selbst finden, und der Kalender färbt ein, wo der Termin mit Fahrweg
  hinpasst (Tiefgarage als Start und Feierabendziel). Der erste Teil ginge
  ohne Kartendienst, die Einfärbung **nicht**: Sie hängt am Gate aus ADR-019
  und kommt frühestens mit MAP-006. Die Rückmeldungen zur bestehenden
  Oberfläche aus demselben Gespräch stehen **nicht** hier, sondern als Epic
  `UI-002` in `../development/ROADMAP.md` — sie korrigieren Gebautes und sind
  keine Idee für später.

- **2026-09-13** — Bereinigung nach den Entscheidungen des Tages:
  Statusmodell um `zurückgestellt` und die Zusätze erweitert, Freitext im
  Statusfeld nicht mehr zulässig, alle Einträge auf diese Form gebracht.
  **Überführt**, weil gebaut: `IDEA-PRX-001`, `-007`, `-011`, `-014`, `-020`,
  `-042` Teil 1, `IDEA-LZK-006` in Teilen; überführt in Entscheidungen und
  Loops, **noch nicht gebaut**: `IDEA-PRX-029` und `-032` (ADR-019, MAP-Loops),
  `-030` außer dem Einzel-Link aus UX-002, `-028` (→ `IDEA-KI-007`).
  **Zurückgestellt** oder **verworfen** nach B9, B10 und B11. Die UI-Befunde
  `IDEA-PRX-038` und `-040` stehen als BEF-001 und BEF-002 in
  `../development/BEFUNDE.md`.

- **2026-09-19** — Aus der Entscheidungsrunde zu ABR-EPIC-003 kommen zwei
  Funktionsideen von Jannes hierher statt in den Code: `IDEA-OUT-009` (ein
  Bild ruft die Durchführung eines Tests in Erinnerung) und `IDEA-PRX-043`
  (die vorhandenen Textbausteine stehen auch im Befund zur Verfügung). Dazu
  eine Stand-Zeile an `IDEA-OUT-001`: Jannes hat erklärt, die Praxis dürfe den
  DIGOTOR-Bogen verwenden, und weitere Bögen angekündigt — der schriftliche
  Beleg des Lizenzgebers bleibt offen (B8), das Lizenzfeld damit erst recht.
  **Keine der drei ist ein Auftrag**; gebaut wird, was die Roadmap aufruft.

- **2026-09-22** — Eine Idee von Jannes hat es in den seltenen Fall geschafft,
  eine verbindliche Festlegung zu bewegen: die **Führung auf dem Rad
  innerhalb der Software** (`IDEA-PRX-044`). Sie steht seitdem auf `überführt`
  — ADR-019 Fassung 3 löst Punkt 6 ab („eine eigene Turn-by-Turn-Engine ist
  nicht Ziel") und ergänzt Abschnitt F; `PROJECT_PRINCIPLES.md` 0.14 zieht mit
  §20.1 nach. **Das Ortungsverbot in §20 ist dabei nicht gefallen**, sondern
  um vier Bedingungen und ein DARF-NICHT ergänzt worden: Die Führung läuft auf
  dem Gerät und meldet der Praxis keinen Standort. Der Weg dorthin gehört zur
  Sache — erst die Prüfung, dass der Anbieter eine Führung **nicht** als
  Auftragsverarbeitung liefert, hat den Zuschnitt ergeben, der ohne Ortung
  auskommt. Gebaut ist nichts: **MAP-007** steht hinter MAP-006, hinter dem
  Gate und hinter **E-24**.

- **2026-09-21** — Jannes hat gefragt, ob eine lesbare Patientennummer wie in
  iPrax bei uns Datenschutzfragen lösen würde, und den Gedanken nach der
  Prüfung noch am selben Tag **verworfen** (`IDEA-QSN-011`). Der Eintrag
  bleibt mit der Begründung stehen: Eine Nummer wäre ein zusätzliches
  personenbezogenes Datum, die Stellen mit namensfreiem Bezug tragen ihn
  bereits, und ADR-021 Punkt 3 ließe sie weder an `persons` noch je
  Verhältnis unterbringen. `PROJECT_PRINCIPLES.md` §1.1 bleibt unberührt.

## Index — welche Datei wofür

| Datei                                                                       | Lesen, wenn es um … geht                                                                   | Präfix |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ |
| [referenz-navigation.md](ideen/referenz-navigation.md)                       | Informationsarchitektur, Navigation, Vergleichssoftware, Screenshot-Referenzen              | —      |
| [referenz-wettbewerb.md](ideen/referenz-wettbewerb.md)                       | Funktionen von iPrax, THEORG, thevea, appointmed, Optica u. a. mit Quellen; „wie lösen es andere" | —  |
| [referenz-iprax.md](ideen/referenz-iprax.md)                                 | Bildschirmfotos aus iPrax (2026-09-16): Anlegen-Menü im Kalender, Zeitspanne aufziehen, personenzentrierte Unterbereiche | —      |
| [10-praxisverwaltung.md](ideen/10-praxisverwaltung.md)                       | Terminplanung, Warteliste, Akte, Verordnung, Privatabrechnung, Hausbesuch, Kennzahlen       | PRX    |
| [00-lebenszyklus-und-zugang.md](ideen/00-lebenszyklus-und-zugang.md)         | Patient wird Klient, Betreuung nach Rezeptende, Portalzugang, Onboarding, Rechtsrahmen      | LZK    |
| [01-trainingsplaene-und-progression.md](ideen/01-trainingsplaene-und-progression.md) | Trainingspläne, Übungsbibliothek, Progressionsregeln, Periodisierung, Autoregulation | TRN    |
| [02-tracking-und-parameter.md](ideen/02-tracking-und-parameter.md)           | Was gemessen wird: Schmerz, Anstrengung, Bewegungssicherheit, Check-ins, Wearables           | TRK    |
| [03-rueckfragen-medien-kommunikation.md](ideen/03-rueckfragen-medien-kommunikation.md) | Rückfragen, Foto-/Videoanhänge, Chat, Benachrichtigungen, Notfallabgrenzung        | KOM    |
| [04-assessments-outcomes-fortschritt.md](ideen/04-assessments-outcomes-fortschritt.md) | Assessments, PROMs, Testbatterien, Fortschrittsdarstellung, Übungsanalyse          | OUT    |
| [05-alltag-gewohnheiten-ernaehrung.md](ideen/05-alltag-gewohnheiten-ernaehrung.md) | Gewohnheiten, Aktivitäten, Schlaf, Ernährung, Verhaltensänderung                        | ALT    |
| [06-uebersicht-kalender-sessions.md](ideen/06-uebersicht-kalender-sessions.md) | Übersicht/Dashboard, Kalender, Sessions, Durchführung einer Trainingseinheit             | ORG    |
| [07-ki-assistenz.md](ideen/07-ki-assistenz.md)                               | KI-Analyse, Assistenzfunktionen, Grenzen nach ADR-005 und ADR-006                           | KI     |
| [08-querschnitt-plattform.md](ideen/08-querschnitt-plattform.md)             | Themen über alle Bereiche: Zeitstrahl, Sprache, Barrierefreiheit, Export, Testbarkeit       | QSN    |
| [09-angebote-und-abrechnung.md](ideen/09-angebote-und-abrechnung.md)         | Paketpreise, Vorauszahlung, Rabatte, Anreize, Preisdarstellung im Portal                    | ANG    |
| [kanvas/own-motion-praxis.html](kanvas/own-motion-praxis.html)               | Design-Kanvas „Own Motion · Praxis" von Jannes (2026-09-11): 1,2 MB gebündelter HTML-Export, nur **Beleg** für `IDEA-PRX-034` bis `-037`; keine Vorgabe, nichts daraus übernehmen | —      |

## Pflege

- Neue Ideen von Jannes kommen als `notiert` in die passende Bereichsdatei.
- Entsteht in einem Loop eine Idee außerhalb des Auftrags, wird sie hier als
  `vorschlag` abgelegt — **nicht** gebaut.
- Der Ordner ist von Prettier ausgenommen (wie `docs/adr/` und
  `docs/decisions/`) und wird von Hand gepflegt.

Zuletzt aktualisiert: 2026-09-14 (Konsolidierung R2: überführte Einträge auf
Kopf und Stand-Zeile). Ältere Stände: `git log -- docs/product/`.
