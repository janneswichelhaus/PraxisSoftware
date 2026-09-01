# Roadmap

Reihenfolge der Umsetzung. Beantwortet die Frage **„was als Nächstes"** — und
sonst nichts.

## Was dieses Dokument ist und was nicht

- **Es legt die Reihenfolge fest, nie den Scope.** Was ein Eintrag konkret
  umfasst, entsteht erst im SPEC-Schritt des Loops.
- **Es ist kein Auftrag.** Gebaut wird, was Jannes mit `/feature-loop`
  beauftragt. Ein Eintrag hier startet nichts von allein.
- **Es überschreibt nichts.** `PROJECT_PRINCIPLES.md`, die ADRs und
  `docs/decisions/OPEN_DECISIONS.md` gelten unverändert. Steht hier ein
  Eintrag, dessen Voraussetzung offen ist, wird er **nicht** gebaut, sondern
  die Voraussetzung gemeldet.
- Die fachlichen Inhalte dahinter stehen im Ideenspeicher
  (`docs/product/`, nicht normativ). Verweise wie `IDEA-TRN-005` zeigen dorthin.

Jeder Loop liest dieses Dokument zuerst und hakt am Ende seinen Eintrag ab. Das
ersetzt das Wiederherleiten des Projektstands in jeder Session und ist damit
die wichtigste Einzelmaßnahme gegen Credit-Verbrauch.

---

## Zwei Spuren

Die Arbeit läuft in zwei Spuren, die sich gegenseitig blockieren können.

**Spur A — Bauen.** Feature-Loops. Das macht Claude.

**Spur B — Entscheiden.** Offene Punkte aus `OPEN_DECISIONS.md`. Das macht
Jannes, teils mit externer Beratung. **Ein Loop kann das nicht ersetzen.**

Wenn Spur B stockt, läuft Spur A leer — deshalb steht bei jeder Etappe, welche
Entscheidung sie voraussetzt und wann sie spätestens fällig ist.

### Spur B: die Warteschlange

| Punkt                                   | Was zu entscheiden ist                                                                                                                                                               | Wer                                     | Fällig vor         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------ |
| ~~**D „finalisiert" / „nachvollziehbar"**~~ | **Erledigt am 2026-09-01 — [ADR-016](../adr/ADR-016-clinical-documentation-record.md).** Von Jannes delegiert, entschieden. DOK-001 ist damit frei.                                                              | erledigt                                | —                  |
| **B8**                                  | Lizenzstatus DIGOTOR-Bogen und weiterer Instrumente                                                                                                                                  | Jannes / Lizenzgeber                    | Etappe 3           |
| **B5**                                  | Patientenidentität, Vertretung, Zugang für Hochbetagte, Verhältnis zu §630g                                                                                                          | Jannes, ggf. Beratung                   | Etappe 4           |
| **C1, C2**                              | Was Office an Leistungsziffern und Nachrichten sieht                                                                                                                                 | Jannes allein                           | Etappe 2 bzw. 6    |
| **E8**                                  | Dateiablage: Ort, Verschlüsselung, Virenscan, signierte Verweise                                                                                                                     | Jannes                                  | Etappe 7           |
| **B9**                                  | Betreuung nach Therapieende: Vertrag, Steuer, Aufbewahrung, Zweckbindung                                                                                                             | Steuerberatung + Datenschutz            | Etappe 8           |
| **B11**                                 | Paketpreise, Guthaben, Verfall, Rabatte                                                                                                                                              | Jannes + Steuerberatung                 | Etappe 8           |
| **B10**                                 | Automatisierte Progression: MDR-Grenze                                                                                                                                               | externe regulatorische Prüfung (mit B1) | Etappe 9           |
| **B2, B7, E2**                          | DSFA-Schwellwert, Kartendienst, Ausfallkonzept                                                                                                                                       | Jannes + externe Prüfung                | vor Produktivstart |

**Die drei mit dem längsten Vorlauf sind B9, B10 und B1.** Sie brauchen externe
Termine. Wer sie erst ansetzt, wenn Etappe 8 erreicht ist, wartet dann drei
Monate. Sie sollten laufen, während Spur A an Etappe 1 bis 3 arbeitet.

---

## Ist-Stand (2026-09-01)

Gebaut: Anmeldung und Sitzung · Rollen und RLS · Audit-Log mit
eingeschränktem Lesepfad · Patienten anlegen, bearbeiten, Versorgungsstatus
(PAT-001 bis PAT-003) · Termine anlegen, Kalender, bearbeiten, absagen,
abschließen, Praxisraster, Arbeitszeiten, Verschieben (CAL-001 bis CAL-006).

Nicht gebaut: alles Übrige, insbesondere klinische Dokumentation, Abrechnung,
Löschung, Fragebögen, Portal.

---

## Kurzfristig

### Etappe 1 — Der Kernprozess wird vollständig

**Warum zuerst:** Termin → Dokumentation → Leistung → Rechnung ist die Kette,
auf der eine Praxis läuft. Sie ist heute nach dem ersten Glied abgeschnitten.
ADR-009 verlangt zudem, dass grundsätzlich erst nach finalisierter
Dokumentation fakturiert wird — die Reihenfolge ist damit vorgegeben, nicht
gewählt.

| #   | Loop    | Inhalt                                                                                     | Voraussetzung          |
| --- | ------- | ------------------------------------------------------------------------------------------ | ---------------------- |
| 1   | DOK-001 | Behandlungsdokumentation zum Termin anlegen und als Entwurf bearbeiten                     | **frei** (ADR-016)     |
| 2   | DOK-002 | Finalisierung von Hand, Versionierung, Nachtrag als eigener Eintrag (ADR-016 Punkte 4 bis 6) | DOK-001                |
| 3   | DOK-003 | Dokumentation in der Akte lesen, rollenabhängig projiziert (Office ohne klinischen Inhalt) | DOK-002, C1/C2 berührt |
| 3a  | DOK-004 | Automatische Finalisierung nach Frist (ADR-016 Punkt 7) — **braucht erst eine Entscheidung, siehe unten** | DOK-002                |
| 4   | LOE-001 | Datenklassen und Aufbewahrungsfristen als echte Struktur, Legal Hold                       | —                      |
| 5   | LOE-002 | Löschvorgang, Wiederanwendung nach Restore, `pnpm test:db`                                 | LOE-001                |
| 6   | ABR-001 | Leistungskatalog, versioniert, mit Steuerkennzeichen je Leistungsversion                   | B4 teilweise           |
| 7   | ABR-002 | Leistungserfassung am abgeschlossenen Termin                                               | ABR-001, DOK-002       |
| 8   | ABR-003 | Rechnung: Zustände, Nummernvergabe bei Ausstellung, Snapshot, PDF                          | ABR-002                |
| 9   | ABR-004 | Zahlungen als eigene Transaktionen, offene Posten                                          | ABR-003                |

**LOE-001 und LOE-002 sind Go-live-Blocker** (ADR-008, `DEVELOPMENT.md`). Sie
stehen bewusst mitten in der Etappe und nicht am Ende: ein Löschkonzept
nachträglich über gewachsene Daten zu legen ist deutlich teurer.

**DOK-004 ist von DOK-002 abgetrennt, weil das Projekt keinen Scheduler hat.**
Geprüft am 2026-09-01: weder `pg_cron` noch ein anderer Mechanismus für
zeitgesteuerte Aufgaben existiert. ADR-016 Punkt 7 verlangt eine automatische
Finalisierung nach Fristablauf — dafür gibt es drei Wege mit sehr
unterschiedlichem Preis:

1. **Berechnet statt gespeichert.** Ein Entwurf jenseits der Frist gilt beim
   Lesen als finalisiert. Kein neuer Mechanismus, aber der Zustand ist nicht
   materialisiert — und die Versionierung braucht einen festgeschriebenen
   Stand, an dem Version 1 hängt.
2. **`pg_cron`.** Sauber und materialisiert, aber eine neue Infrastruktur­
   abhängigkeit. Nach `PROJECT_PRINCIPLES.md` §11 und ADR-015 braucht das eine
   bewusste Entscheidung, keinen beiläufigen Einbau im Loop.
3. **Beim nächsten Zugriff nachziehen.** Billig, aber der Zeitpunkt der
   Finalisierung hängt dann davon ab, wann jemand die Akte öffnet — bei einer
   §630f-relevanten Frist die schlechteste Eigenschaft.

Die Wahl ist eine Architekturentscheidung und gehört vor DOK-004, nicht hinein.
DOK-002 und DOK-003 sind davon nicht betroffen.

**Ergebnis der Etappe:** Die Praxis könnte damit arbeiten — Termine
dokumentieren, Leistungen erfassen, Rechnungen stellen. Das ist der Punkt, ab
dem die Software Nutzen stiftet statt Aufwand zu erzeugen.

### Etappe 2 — Anamnese und Verlauf

**Warum hier:** Der strukturierte Erstbefund ist der zweitgrößte Zeitfresser
der Praxis nach der Dokumentation, und er ist die Datengrundlage für alles
Spätere.

| #   | Loop    | Inhalt                                                                                                            | Voraussetzung   |
| --- | ------- | ----------------------------------------------------------------------------------------------------------------- | --------------- |
| 10  | FRB-001 | Instrumentenbibliothek: Instrument versioniert, mit Lizenzfeld (`IDEA-OUT-001`)                                   | —               |
| 11  | FRB-002 | Freie Instrumente als erste Füllung: NRS und patientenspezifische Funktionsskala (`IDEA-OUT-003`, `IDEA-OUT-004`) | FRB-001         |
| 12  | FRB-003 | Strukturierter Anamnesebogen nach §7, in der Praxis ausfüllbar                                                    | FRB-001, **B8** |
| 13  | FRB-004 | Verlaufsdarstellung mit Ereignismarkierungen, ohne Bewertung (`IDEA-OUT-005`)                                     | FRB-002         |

### Etappe 3 — Übungspläne innerhalb der Therapie

**Warum das schon geht:** Ein Heimprogramm, das die Therapeutin zusammenstellt
und das die Software nur darstellt und ausgibt, ist Erfassen, Speichern,
Strukturieren und Darstellen — ADR-006 Punkt 2. **Keine automatische
Anpassung**, keine Progression, kein Vorschlag. Damit ist B10 hier noch nicht
nötig.

| #   | Loop    | Inhalt                                                                                                                                     | Voraussetzung |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| 14  | UEB-001 | Übungsbibliothek: Übung und Variante getrennt, Achsen und Nachbarschaften als Struktur, zwei Sprachebenen (`IDEA-TRN-005`, `IDEA-QSN-002`) | —             |
| 15  | UEB-002 | Plan zusammenstellen, zuweisen, Schnappschuss bei Zuweisung (`IDEA-TRN-011`)                                                               | UEB-001       |
| 16  | UEB-003 | Plan als PDF für Patient:innen — voller Nutzen ohne Portal                                                                                 | UEB-002       |
| 17  | UEB-004 | Planlaufzeit und Wiedervorlage (`IDEA-ORG-006`)                                                                                            | UEB-002       |

---

## Langfristig

Ab hier wird die Reihenfolge gröber. Was in Etappe 6 steht, wird vor Etappe 5
noch einmal überprüft — Pläne, die zwölf Monate voraus genau sind, sind
erfunden.

### Etappe 4 — Portalfundament · setzt **B5** voraus

Portalzugang getrennt vom Praxiszugang (Account ≠ Akte, §4.6) · Termine
ansehen · Fragebogen vor dem Erstkontakt ausfüllen · Dokumente und Rechnungen ·
Einwilligungsverwaltung · Datenexport (`IDEA-QSN-003`) · Onboarding mit
Überspringen (`IDEA-LZK-005`) · Barrierefreiheit als Abnahmekriterium
(`IDEA-QSN-006`).

Der **Intake vor dem Erstkontakt** ist der Einzelposten mit dem größten
Praxisnutzen in dieser Etappe.

### Etappe 5 — Tracking und Check-ins · setzt Etappe 4 voraus

Einheit protokollieren (Satz, Last, Reserve, Schmerz — `IDEA-TRK-001`) ·
Check-in mit einstellbarem Takt (`IDEA-TRK-004`) · Bewegungssicherheit als
eigene Größe (`IDEA-TRK-003`) · Auslassquote je Übung (`IDEA-OUT-006`) ·
Offline-Erfassung (`IDEA-TRK-008`) · Benachrichtigungen mit Regeln
(`IDEA-KOM-006`).

Erfassen und darstellen — **nicht** auswerten, nicht anpassen.

### Etappe 6 — Kommunikation · setzt **C2** und **E8** voraus

Strukturierte Rückfragen (`IDEA-KOM-001`) · Notfallabgrenzung und
Antwortzusage (`IDEA-KOM-002`) · Foto- und Videoanhänge mit eigener
Einwilligung, kurzer Aufbewahrung und Metadatenentfernung (`IDEA-KOM-003`) ·
Zuordnung klinischer Inhalte zur Akte (`IDEA-KOM-007`).

**E8 ist harte Voraussetzung** für alles mit Dateien.

### Etappe 7 — Zeitstrahl und Sitzungsvorbereitung

Ein Zeitstrahl über alle Bereiche (`IDEA-QSN-001`) · Vorbereitungsansicht vor
dem Termin (`IDEA-ORG-005`) · Arbeitsliste als Übersicht (`IDEA-ORG-001`).

Erst hier sinnvoll, weil vorher zu wenig Inhalt da ist, um ihn
zusammenzuführen.

### Etappe 8 — Weiterbetreuung nach Therapieende · setzt **B9** und **B11** voraus

Betreuungsepisode mit Typ (`IDEA-LZK-002`) · Zweckbindung beim Übergang
(`IDEA-LZK-003`) · Klientenprofil (`IDEA-LZK-004`) · Paketpreise und
Guthabenführung (`IDEA-ANG-001`) · Rückfall während eines Pakets
(`IDEA-ANG-003`) · Preisdarstellung (`IDEA-ANG-004`) · Offboarding
(`IDEA-LZK-006`).

**Das ist der Punkt, an dem aus der Praxissoftware eine Betreuungsplattform
wird.** Er steht hinten, weil er auf Dokumentation, Abrechnung und Portal
aufsetzt — nicht, weil er unwichtig wäre.

### Etappe 9 — Progression · setzt **B10** und die externe Prüfung aus **B1** voraus

Versioniertes deterministisches Regelwerk mit Freigabe je Plan
(`IDEA-TRN-002`) · Trockenlauf im Schattenbetrieb vor Aktivierung
(`IDEA-TRN-012`) · Regeltests gegen synthetische Verläufe (`IDEA-QSN-004`) ·
mehrdimensionale Progression (`IDEA-TRN-004`) · doppelte Progression als
Standard (`IDEA-TRN-007`) · Ampelmodell (`IDEA-TRN-003`) · Adhärenz als
Eingangsgröße (`IDEA-TRN-009`) · Wiedereinstieg nach Unterbrechung
(`IDEA-TRN-010`).

Bis B10 entschieden ist, ist jedes Feature dieser Etappe `MDR_REVIEW_REQUIRED`
und darf produktiv nicht erreichbar sein (ADR-006 Punkt 6).

### Etappe 10 — KI-Assistenz · setzt Etappe 1 bis 3 und ADR-005-Gateway voraus

Zuerst der zentrale Pfad, dann Features (`IDEA-KI-001`). Danach: Freitext
strukturieren, Übersetzung in Patientensprache, Antwortentwürfe — jeweils mit
Quellenbindung (`IDEA-KI-003`) und menschlicher Freigabe.

---

## Credit-Budget

Jeder Loop ist eine Session und kostet. Diese Regeln halten die Kosten
niedrig, ohne die Qualität zu senken.

**Sitzungszuschnitt**

1. **Ein Loop = eine Session = ein vertikaler Schnitt.** Danach Session
   beenden, nicht weiterplaudern. Jeder weitere Turn trägt den gesamten
   bisherigen Kontext mit.
2. **Migration und Oberfläche trennen**, wenn beides für sich groß ist. Zwei
   kleine Sessions sind billiger als eine, die am Ende viermal die Testsuite
   fährt.
3. **Neues Thema = neue Session.** Rückfragen zum laufenden Loop dagegen in
   derselben.

**Leseverhalten**

4. **Diese Roadmap zuerst lesen.** Sie ersetzt das Wiederherleiten des Stands.
5. **Höchstens zwei ADRs vollständig** je Loop, nach dem Index in `CLAUDE.md`.
6. **Höchstens eine Ideenspeicher-Datei** je Loop, nach dem Index in
   `IDEENSPEICHER.md`.
7. **Keine Subagenten** außer bei echt breiter Suche über viele Dateien. Ein
   Subagent startet ohne Kontext und muss ihn sich neu erarbeiten.

**Verifikation**

8. Während der Entwicklung nur die eng betroffenen Checks. Die vollständige
   Runde **einmal** am Ende (Skill-Schritt H).
9. Keine identischen teuren Läufe ohne Änderung dazwischen.
10. `pnpm test:db` läuft auch in der Cloudumgebung (kein Docker nötig) und ist
    bei Migrationen und Policies das wichtigste Gate — nicht überspringen. Der
    SessionStart-Hook in `.claude/hooks/` installiert die Abhängigkeiten
    vorab, ein manuelles `pnpm install` entfällt.

**Rhythmus**

11. **Ein bis zwei Loops pro Woche** sind für ein Nebenprojekt realistisch.
    Drei sind machbar, wenn die Schnitte klein sind. Mehr bedeutet in der
    Regel, dass die Schnitte zu klein oder die Reviews zu flach sind.
12. Die wöchentliche Planungssession ist **absichtlich klein**: sie liest
    diese Datei und das Git-Log, sonst nichts.

**Faustregel:** Wenn eine Session anfängt, das Projekt zu erkunden statt zu
arbeiten, fehlt ein Eintrag in dieser Roadmap. Dann diesen ergänzen — das ist
billiger als die Erkundung zu wiederholen.

### Modell und Aufwand je Aufgabe

Modell und Aufwandsstufe werden **zu Sitzungsbeginn** gewählt und danach nicht
mehr gewechselt: der Prompt-Cache ist modellgebunden, ein Wechsel mitten im
Loop wirft ihn weg und kostet mehr, als die Umstellung spart.

| Aufgabe                                                    | Modell      | Aufwand      |
| ---------------------------------------------------------- | ----------- | ------------ |
| Migration, RLS-Policy, RPC, Berechtigungen                 | Opus 5      | `xhigh`      |
| Architekturentscheidung, ADR, Sicherheitsreview eines Diffs | Opus 5      | `xhigh`      |
| Löschung und Retention (LOE-001, LOE-002)                  | Opus 5      | `max`        |
| Fachlogik ohne bestehendes Muster                          | Opus 5      | `high`       |
| UI-Seite nach dem Muster vorhandener Seiten                | Sonnet 5    | `medium`     |
| Tests zu bereits geschriebenem Code ergänzen               | Sonnet 5    | `medium`     |
| Formulierung, Doku, Roadmap abhaken, Commit-Nachricht      | Sonnet 5    | `low`        |
| Wöchentliche Planungssession                               | Haiku 4.5   | —            |

Begründung der drei Ausreißer:

- **`max` für Löschung und Retention.** Eine falsch gebaute Löschung ist der
  einzige Fehler in diesem Projekt, der sich nicht reparieren lässt — die Daten
  sind dann weg oder unzulässig noch da. Hier zählt Korrektheit mehr als Kosten.
- **`xhigh` statt `high` für alles Datenbanknahe.** Migrationen und Policies
  sind schwer rückgängig zu machen und der Ort, an dem `PROJECT_PRINCIPLES.md`
  §16 (Patientensicherheit vor Funktionsumfang) tatsächlich greift.
- **Haiku für das Wochenupdate.** Die Session liest zwei Dateien und schreibt
  zehn Zeilen. Sie auf einem Opus-Modell laufen zu lassen ist reine
  Verschwendung. Der kleinere Kontext von Haiku (200K statt 1M) reicht dafür
  mit großem Abstand.

Zwei Hinweise, die Geld kosten, wenn man sie übersieht:

- **Fast Mode (`/fast`) verdoppelt den Preis je Token.** Er ist für Momente
  gedacht, in denen Wartezeit teurer ist als Rechenzeit — nicht für einen
  Feature-Loop, der ohnehin im Hintergrund läuft.
- **Ein niedrigerer Aufwand auf einem neuen Modell schlägt oft einen höheren
  Aufwand auf einem älteren.** Wer sparen will, senkt zuerst den Aufwand und
  wechselt erst danach das Modell.

---

## Wochenupdate

Auftrag für die wöchentliche Planungssession. Sie **baut nichts.**

1. `git log --oneline -20` und diese Datei lesen. Sonst nichts.
2. Feststellen, welche Loops seit dem letzten Update abgehakt wurden.
3. Den nächsten offenen Loop nennen — genau einen, plus einen Ersatz, falls
   dessen Voraussetzung fehlt.
4. Prüfen, ob eine Entscheidung aus Spur B fällig geworden ist, und sie
   benennen — mit dem Hinweis, dass ein Loop sie nicht ersetzen kann.
5. Antwort in höchstens zehn Zeilen: _diese Woche ansteht · das braucht Jannes
   zu entscheiden · das hängt_.

Kein Codelesen, keine Analyse, keine Vorschläge über den nächsten Loop hinaus.

### Eingerichtete Routine

Seit 2026-09-01 läuft das als automatische Routine: **montags 07:50 Uhr**
startet eine frische Session mit genau diesem Auftrag; das Ergebnis kommt per
Push-Nachricht und E-Mail. Sie **baut nichts** und stoppt nach dem Bericht.

- Trigger-ID `trig_01N5FanspQGxJP9S9rnZiZHj`, erste Ausführung 2026-09-07,
  Modell **Haiku 4.5** (siehe „Modell und Aufwand je Aufgabe").
- Die Zeitangabe ist intern UTC (`50 5 * * 1`). **Nach der Zeitumstellung Ende
  Oktober fällt sie auf 06:50 Uhr** — wer das nicht will, ändert den
  Cron-Ausdruck dann auf `50 6 * * 1`.
- Die Routine liest den Branch `claude/physio-platform-features-u7uy15`,
  solange diese Datei nicht auf `main` liegt. Nach einem Merge nach `main`
  entfällt der Umweg von allein.
- Abschalten oder Takt ändern geht über die Routines-Oberfläche auf claude.ai
  oder durch eine Anweisung in einer Session.

---

## Fortschritt

Abgehakt wird hier, mit Datum und Commit. Ein Loop gilt als fertig, wenn
Skill-Schritt I durchlaufen ist.

| Loop                | Status                      | Datum          | Commit |
| ------------------- | --------------------------- | -------------- | ------ |
| PAT-001 bis PAT-003 | fertig                      | vor 2026-09-01 | —      |
| CAL-001 bis CAL-006 | fertig                      | vor 2026-09-01 | —      |
| DOK-001             | **bereit** — nicht begonnen | —              | —      |

Zuletzt aktualisiert: 2026-09-01
