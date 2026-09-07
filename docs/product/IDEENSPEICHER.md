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
| `Bedenken`           | Festgehalten, aber mit begründetem Abraten. Zusatz zu `notiert`.              |
| `entscheidung nötig` | Vor jeder Spezifikation braucht es eine Entscheidung (siehe „Berührt").       |
| `überführt`          | Als ADR, offene Entscheidung oder Feature-Spec weitergeführt. Verweis dabei.  |
| `verworfen`          | Bewusst nicht weiterverfolgt. Bleibt mit Begründung stehen.                   |

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
  Karte über die Google Maps Embed API entschieden und genehmigt; der
  Referenz-Screenshot ist ein fremdes Produkt, dessen Funktionsumfang
  nachgebaut werden soll (Regeln in `referenz-navigation.md`).

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

## Pflege

- Neue Ideen von Jannes kommen als `notiert` in die passende Bereichsdatei.
- Entsteht in einem Loop eine Idee außerhalb des Auftrags, wird sie hier als
  `vorschlag` abgelegt — **nicht** gebaut.
- Der Ordner ist von Prettier ausgenommen (wie `docs/adr/` und
  `docs/decisions/`) und wird von Hand gepflegt.

Zuletzt aktualisiert: 2026-09-06 (Wettbewerbsreferenz und Bereichsdatei
Praxisverwaltung mit `IDEA-PRX-001` bis `IDEA-PRX-028`; Entscheidungen vom
2026-09-06, Tagesroute `IDEA-PRX-029` bis `-033`, `IDEA-LZK-008`)
