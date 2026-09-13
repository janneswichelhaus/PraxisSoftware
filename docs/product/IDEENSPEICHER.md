# Ideenspeicher

> **Dieses Dokument und der gesamte Ordner `docs/product/` sind nicht
> normativ.**
>
> Hier steht, was langfristig einmal in der Plattform stecken könnte — roh,
> unbewertet, unvollständig. Es ist **kein Implementierungsauftrag**, **keine
> Feature-Spezifikation** und **keine Freigabe**. Aus keinem Eintrag darf eine
> Erweiterung eines aktuellen Feature-Scopes abgeleitet werden.

## Rang in der Dokumentenhierarchie

| Rang | Dokument                             | Rolle                                          |
| ---- | ------------------------------------ | ---------------------------------------------- |
| 1    | `../../PROJECT_PRINCIPLES.md`        | Leitplanken. Verbindlich.                      |
| 2    | `../adr/`                            | Architekturentscheidungen. Verbindlich.        |
| 3    | konkrete Feature-Spezifikation       | Scope einer Aufgabe. Verbindlich für sie.      |
| 4    | `../decisions/ASSUMPTIONS.md`        | Begründete, vorläufige Annahmen (§15.1).       |
| 5    | `../PRODUCT_VISION.md`               | Zielbild. Nicht normativ.                      |
| 6    | **dieser Ordner (`docs/product/`)**  | Ideen und Rohmaterial. **Nicht normativ.**     |

Rang 6 ist die **schwächste** Ebene im Projekt. Ein Ideenspeicher-Eintrag
verliert gegen alles darüber — ohne Diskussion und ohne Auslegung zugunsten
der Idee. Er verliert auch gegen `docs/decisions/OPEN_DECISIONS.md`: was dort
als offen geführt wird, ist offen, egal wie ausgearbeitet die Idee hier
aussieht.

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

Ist ein Eintrag diesen Weg gegangen, wird er hier auf `überführt` gesetzt und
verweist auf das Ziel. Er wird **nicht gelöscht** — die Begründung bleibt
lesbar.

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
  `vorschlag`. Mit den Antworten E-15 bis E-19 vom selben Tag: Datenweg der
  Karte über die Google Maps Embed API entschieden und genehmigt — **am
  2026-09-08 durch MAP-001 überholt**, siehe ADR-019 Fassung 2 (MapLibre,
  serverseitiger Adapter, PTV Developer als Kandidat); der
  Referenz-Screenshot ist ein fremdes Produkt, dessen Funktionsumfang
  nachgebaut werden soll (Regeln in `referenz-navigation.md`).
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

- **2026-09-13** — Bereinigung des Ideenspeichers nach den Entscheidungen des
  Tages. **Statusmodell** erweitert: neuer Status `zurückgestellt`, die
  Zusätze `ausgearbeitet`, `Abgrenzung`, `Einordnung` und `Bedenken` sind
  definiert, Freitext im Statusfeld ist nicht mehr zulässig — Erläuterungen
  stehen in einer Zeile `**Stand.**`; alle 121 Einträge sind auf diese Form
  gebracht. **Überführt**, weil gebaut: `IDEA-PRX-001` (PAT-005), `-007`
  (UX-003), `-011` (UX-008), `-014` (UX-011), `-020` (UX-004), `-029` und
  `-030` (ADR-019, UX-002), `-032` (MAP-003/004/006), `-042` Teil 1
  (CAL-015c), `IDEA-LZK-006` in Teilen (LOE-001b) und `IDEA-PRX-028` (→
  `IDEA-KI-007`, §6.3). **Zurückgestellt** nach Entscheidung: `IDEA-ALT-005`
  (B9 Punkt 6), `IDEA-TRN-003` (B10: kein Ampelmodell), `IDEA-ANG-001` und
  `-004` (B11); `IDEA-ANG-002` **verworfen** (B11). **E14 erledigt** —
  Hausbesuch-Szenarien: Tür geöffnet, keine Behandlung → durchgeführt mit
  Pflichtvermerk, normale Abrechnung; nicht angetroffen nach Protokoll (15
  Minuten, Klingeln, Anruf) → Ausfallgebühr; Absage unter 24 Stunden →
  Ausfallgebühr; Umsetzung CAL-018. **E15** — Office hat lesenden Zugriff auf
  alle klinischen Inhalte wie Therapeut:innen (Umsetzung ROL-EPIC-001); die
  „akzeptierte Ausnahme" aus §10 entfällt damit (`IDEA-KOM-001`, `-007`).
  **E-20** — ADR-019 Fassung 2 angenommen. Die beiden UI-Befunde
  `IDEA-PRX-038` und `-040` sind keine Ideen und stehen jetzt als BEF-001 und
  BEF-002 in `../development/BEFUNDE.md` — der neuen Sammelstelle für
  Befunde an der laufenden Anwendung, solange die Ablaufrunden bis Probewoche 1
  ruhen; hier bleibt je ein Stub. Die Wettbewerbsreferenz führt in der Spalte
  „Bei uns" den Stand vom 2026-09-13 und keine Reihenfolge mehr.

## Index — welche Datei wofür

| Datei                                                                       | Lesen, wenn es um … geht                                                                   | Präfix |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ |
| [referenz-navigation.md](ideen/referenz-navigation.md)                       | Informationsarchitektur, Navigation, Vergleichssoftware, Screenshot-Referenzen              | —      |
| [referenz-wettbewerb.md](ideen/referenz-wettbewerb.md)                       | Funktionen von iPrax, THEORG, thevea, appointmed, Optica u. a. mit Quellen; „wie lösen es andere" | —  |
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

Zuletzt aktualisiert: 2026-09-13 (Bereinigung: Statusmodell, Stände nach
E14/E15/E-20, `BEFUNDE.md`, Wettbewerbsreferenz). Vorherige Aktualisierung:
2026-09-12 (`IDEA-PRX-042` notiert). Vorherige
Aktualisierung: 2026-09-08 (`IDEA-PRX-002` und `IDEA-KI-007` auf
`überführt`; Google-Maps-Vermerk vom 2026-09-06 als überholt gekennzeichnet).
Vorherige Aktualisierung: 2026-09-06 (Wettbewerbsreferenz und Bereichsdatei
Praxisverwaltung mit `IDEA-PRX-001` bis `IDEA-PRX-028`; Entscheidungen vom
2026-09-06, Tagesroute `IDEA-PRX-029` bis `-033`, `IDEA-LZK-008`)
