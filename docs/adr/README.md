# Architecture Decision Records (ADR)

In diesem Ordner liegen die **Architecture Decision Records** des Projekts.

Ein ADR ist nichts Kompliziertes: Es ist eine kurze Aktennotiz zu einer
technischen Entscheidung. Es hält fest, **was** entschieden wurde, **warum**,
und **was daraus folgt** — damit in zwei Jahren noch nachvollziehbar ist,
warum etwas so gebaut wurde.

## Beispiel

> **Entscheidung:** Wir bauen online-first mit begrenztem Offline-Modus.
>
> **Warum:** Hausbesuche können Funklöcher haben, vollständige Offline-Akten
> erhöhen aber das Datenschutzrisiko.
>
> **Konsequenz:** Heutige Tour und Entwürfe offline verfügbar; vollständige
> Akte nur online.

## Aufbau eines ADR

Kurz halten. Eine Seite reicht fast immer.

- **Titel** — die Entscheidung in einem Satz
- **Status** — vorgeschlagen / angenommen / abgelöst durch ADR-NNN;
  bei einer späteren begrenzten Ergänzung zusätzlich die **Fassung** mit Datum
- **Datum**
- **Kontext** — welches Problem stand an, welche Rahmenbedingungen galten
- **Entscheidung** — was wir tun
- **Konsequenzen** — was daraus folgt, auch die unangenehmen Seiten;
  gegebenenfalls die verworfenen Alternativen mit einem Satz Begründung

## Dateibenennung

`ADR-NNN-kurzer-titel.md`, fortlaufend nummeriert, zum Beispiel
`ADR-001-online-first-limited-offline.md`.

## Wann ein ADR geschrieben wird

Immer dann, wenn eine Entscheidung später teuer rückgängig zu machen ist oder
wenn sich jemand fragen könnte, warum es nicht anders gemacht wurde:
Datenhaltung, Autorisierung, Auswahl externer Anbieter, Umgang mit
Patientendaten, Grundsätze der Fehlerbehandlung.

Kein ADR nötig für alltägliche Umsetzungsdetails.

## Wann ein bestehender ADR eine neue Fassung bekommt

Ein **angenommener** ADR wird nicht umgeschrieben. Kommt später eine Festlegung
hinzu, die seine bisherigen Punkte unberührt lässt — eine Ergänzung, eine
Präzisierung, die Antwort auf eine seiner eigenen offenen Folgefragen —, dann
bekommt er eine **neue Fassung**: die Statuszeile nennt sie, die neuen Punkte
tragen den Hinweis `(Fassung N)`, und eine **Änderungshistorie** am Ende sagt
in einer Zeile, was sich geändert hat und was unverändert geblieben ist. Die
vorige Fassung bleibt in der Git-Historie lesbar.

Wird dagegen eine bestehende Aussage **zurückgenommen oder umgekehrt**, ist das
kein Fassungswechsel, sondern ein neuer ADR mit Status „abgelöst durch
ADR-NNN" am alten. **Eine Ausnahme** (festgelegt 2026-09-13): Kehrt der
Projektinhaber einen **einzelnen Punkt** eines angenommenen ADR ausdrücklich
um und bleiben die übrigen Punkte unberührt, DARF das als neue Fassung
geführt werden — wenn die Statuszeile und die Änderungshistorie die Umkehr
als solche benennen und der alte Wortlaut im Punkt lesbar bleibt
(durchgestrichen oder als „Fassung N lautete"). Wird die Entscheidung als
Ganzes umgekehrt, bleibt es beim neuen ADR. Berührt einer der Wege eine
Prinzipienaussage, wird `PROJECT_PRINCIPLES.md` in einem eigenen Commit mit
neuer Version nachgezogen (§21).

Eine Fassung **zitiert, statt zu wiederholen**: Steht eine Festlegung bereits
in `PROJECT_PRINCIPLES.md` oder einem anderen ADR, verweist die Fassung auf
die Stelle und ergänzt nur, was dieser ADR technisch daraus macht. Jeder ADR
mit mehr als einer Fassung führt am Ende eine **Änderungshistorie** als Tabelle
`Fassung | Datum | Änderung`.

Wird ein Punkt, den ein ADR als offen führt, anderswo entschieden (ADR,
Annahme, Prinzipienversion), bekommt die Stelle einen kurzen
**Erledigungsvermerk** in Kursiv („*Beantwortet mit …*") oder eine
Durchstreichung — der Wortlaut des angenommenen Punktes bleibt.

## Verhältnis zu den anderen Dokumenten

- `PROJECT_PRINCIPLES.md` — die verbindlichen Produkt- und Sicherheitsprinzipien (die aktuelle Version steht in dessen Dokumentinformation)
- `docs/decisions/OPEN_DECISIONS.md` — was noch **nicht** entschieden ist; ohne Rang
- `docs/decisions/ASSUMPTIONS.md` — begründete, **vorläufige** Annahmen, die eine Lücke füllen, bis sie bestätigt sind (`PROJECT_PRINCIPLES.md` §15.1)
- `docs/adr/` — was entschieden wurde und warum

Der übliche Weg: Ein Punkt aus `OPEN_DECISIONS.md` wird entschieden, bekommt
hier ein ADR und wird dort als erledigt markiert. Betrifft die Entscheidung die
Prinzipien, wird `PROJECT_PRINCIPLES.md` in einem eigenen Commit nachgezogen.
Eine bestätigte Annahme aus `ASSUMPTIONS.md`, deren Rücknahme teuer wäre, geht
denselben Weg und behält dort einen Verweis auf das ADR.

## Bestehende ADRs

| ADR | Titel | Status |
|---|---|---|
| [ADR-001](ADR-001-online-first-limited-offline.md) | Online-first mit begrenzter Offline-Fähigkeit | Angenommen |
| [ADR-002](ADR-002-hosting-data-residency.md) | Hosting und Datenstandort | Angenommen |
| [ADR-003](ADR-003-organization-location-model.md) | organization_id und location_id im Datenmodell | Angenommen |
| [ADR-004](ADR-004-authorization-model.md) | Berechtigungsmodell | Angenommen, **Fassung 2 (2026-09-13)**: Office liest klinische Inhalte (E15, Umkehr von Punkt 3) |
| [ADR-005](ADR-005-provider-independent-ai.md) | Providerunabhängige KI-Anbindung | Angenommen, Fassung 2 (2026-09-08) |
| [ADR-006](ADR-006-medical-device-boundary.md) | Abgrenzung gegenüber Medical Device Software | **Angenommen, Fassung 3 (2026-09-20, E18 Schritt 3)** — Zweckbestimmung über beide Leistungsbereiche, dazu die drei Feature-Verbote als Ausschlusskriterien (keine Übungsauswahl aus Diagnose oder Befund, keine automatisierte Verlaufsauswertung mit Handlungsempfehlung, kein Screening-Fragebogen mit Trainingsfreigabe); Ausgabeverbote, keine Datenverbote; kein Code, keine Migration |
| [ADR-007](ADR-007-data-protection-impact-assessment.md) | Datenschutz-Folgenabschätzung und Datenschutzprozess | Angenommen |
| [ADR-008](ADR-008-data-retention-and-deletion.md) | Aufbewahrung und Löschung personenbezogener Daten | Angenommen |
| [ADR-009](ADR-009-private-billing-model.md) | Privatabrechnung | Angenommen, Fassung 2 (2026-09-20): Steuerkennzeichen am Posten, ein Leistungsbereich je Rechnung, getrennte Nummernkreise, § 14c-Riegel, „Einnahmen je Leistungsart", kein § 33 UStDV; **Fassung 3 (2026-09-23)**: Nachsorge-Abo und Trainingspaket als abrechenbare Ereignisse |
| [ADR-010](ADR-010-audit-and-privileged-access.md) | Audit-Logging und privilegierter Produktionszugriff | Angenommen, Fassung 2 (2026-09-13): Lesepfad `owner`, Verweisausstellung gilt als Download |
| [ADR-011](ADR-011-logging-and-observability.md) | Logging und Observability | Angenommen |
| [ADR-012](ADR-012-backup-and-business-continuity.md) | Backup, Wiederherstellung und Betriebskontinuität | Angenommen |
| [ADR-013](ADR-013-ci-cd-and-release-governance.md) | CI/CD und Release-Governance | Angenommen, Fassung 2 (2026-09-13): „kritische Änderung" definiert, Review-Checkliste festgelegt (Punkt 9); **Fassung 3 (2026-09-15)**: Dokumentationsprüfung als zehnte Pflichtprüfung, Merge durch den Projektinhaber statt Auto-Merge; **Fassung 4 (2026-09-23)**: Negativfälle „fremde Person" und „anderer Leistungsbereich" |
| [ADR-014](ADR-014-foundational-data-model.md) | Grundlegende Datenmodell-Entscheidungen | Angenommen, **Fassung 2 (2026-09-23)**: „Abonnements" in der Negativliste meint nur das Abrechnungsmodell der Software; das Nachsorge-Abo ist freigegeben |
| [ADR-015](ADR-015-initial-technical-stack.md) | Initialer technischer Stack | Angenommen |
| [ADR-016](ADR-016-clinical-documentation-record.md) | Klinische Dokumentation: Entwurf, Finalisierung, Änderbarkeit | Angenommen, Fassung 2 (2026-09-08) |
| [ADR-017](ADR-017-file-storage.md) | Dateiablage: Ort, Zugriff, kurzlebige Verweise, Aufbewahrung, Virenprüfung | Angenommen (bestätigt 2026-09-12); produktive Ablage zusätzlich an OPS-001 und OPS-003 gebunden |
| [ADR-018](ADR-018-appointment-states.md) | Zustandsautomat des Termins | Angenommen (bestätigt 2026-09-11), Fassung 2 (2026-09-12): 24-Stunden-Frist; **Fassung 3 (2026-09-13)**: Hausbesuch-Szenarien (Nichtantreffen nach Protokoll mit Gebühr, „Tür geöffnet" gilt als durchgeführt), `confirmed → documented`, Storno-Rückweg |
| [ADR-019](ADR-019-map-service.md) | Kartendienst: In-App-Karte, Fahrradrouting, Fahrzeiten, Navigations-Handoff | **Angenommen (2026-09-22), Fassung 4** — Fassung 3 löst Punkt 6 ab und ergänzt Abschnitt F (Führung auf dem Gerät, Bedingungen aus §20.1); Fassung 4 rückt das Gate vom Baubeginn auf das Scharfschalten (§15.2), ohne seinen Umfang zu ändern; PTV Developer als Kandidat, produktive Freigabe am Vertrags-/§203-/DSFA-Gate |
| [ADR-020](ADR-020-treatment-basis.md) | Behandlungsgrundlage: Verordnung und Selbstzahler unter einer Klammer | Angenommen (bestätigt 2026-09-16, E16), Fassung 1.1 (2026-09-18): Bezeichner im SPEC von GRD-001 festgelegt, keine Entscheidung geändert |
| [ADR-021](ADR-021-service-areas-and-legal-relationships.md) | Leistungsbereiche und Rechtsverhältnisse: Behandlung und Training getrennt | **Angenommen (2026-09-20, E18 Schritt 1)** — Trennung nach Rechtsverhältnis, drei harte Regeln, einheitlich das strengere § 203-Niveau; kein Code, keine Migration |
| [ADR-022](ADR-022-appointment-context-and-training-basis.md) | Terminkontext und Trainingsgrundlage: ein Kalender, ein Kontext je Termin | **Angenommen (2026-09-20, E18 Schritt 2)** — eine Spalte mit drei Kontexten statt eines zweiten Feldes (`internal` ist `kind = 'event'`), je Kontext genau ein Verhältnis, Trainingsgrundlage ohne klinische Felder, keine Behandlungsdokumentation am Trainingstermin; kein Code, keine Migration |
