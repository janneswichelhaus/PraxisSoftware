# ADR-021: Leistungsbereiche und Rechtsverhältnisse — Behandlung und Training getrennt

## Status

**Angenommen** — vom Projektinhaber am 2026-09-20 angenommen, alle neun Punkte
wie vorgeschlagen; fachlich entschieden hatte er sie am 2026-09-17 (E18,
festgehalten in
[`../development/E18-LEISTUNGSBEREICHE.md`](../development/E18-LEISTUNGSBEREICHE.md)).
Der ADR steht damit im Index in `CLAUDE.md`, in der Tabelle in
[`README.md`](README.md) und in der Tabelle in `PROJECT_PRINCIPLES.md` §21
(Fassung 0.12.1).

Dieser ADR ist **Schritt 1 von sieben** aus E18. Er löst keinen ADR ab und
ändert keine Aussage der Prinzipien; er trägt das Fundament, auf dem die
Schritte 2 bis 5 stehen (Terminkontext, Zweckbestimmung, Abrechnung, Nachzug
an Rang 1). Mit der Annahme ist **Schritt 2 (ADR-022) frei**; ein Loop, der
Code baut, beginnt weiterhin erst, wenn der ADR über ihm steht.

## Datum

2026-09-20

## Kontext

Die Software wird vom Start weg für drei Zusammenhänge benutzt: Hausbesuche in
der Physiotherapie, Personal Training und Online Coaching (E18; §1.1 der
Prinzipien seit Version 0.12). Gebaut ist davon bisher nur der erste.

Das Datenmodell kennt heute genau ein Verhältnis: `patients` — eine Zeile je
Person und Organisation, mit `status` und `care_started_on`, ohne klinische
Inhalte, in der Datenklasse „klinische Patientenakte" mit zehn Jahren
Aufbewahrung (`supabase/migrations/20260828100000_foundation.sql`). `persons`
trägt die Identität, einmal je Mensch, und ist seit der Gründungsmigration von
Verhältnis und Authentifizierungsaccount getrennt (ADR-014).

Training ist **keine Heilbehandlung**. Daran hängt mehr als ein Etikett: eine
andere Rechtsgrundlage (kein Art. 9 Abs. 2 lit. h DSGVO), eine andere
Dokumentationspflicht (§ 630f BGB gilt nicht), eine andere Aufbewahrungsfrist,
ein anderes Steuerkennzeichen. Wer beides in einen Datensatz legt, kann diese
vier Dinge hinterher nicht mehr auseinandernehmen — und eine Person kann
gleichzeitig einen Behandlungsvertrag (§ 630a BGB) und einen Dienstvertrag über
Training (§ 611 BGB) haben. Die Trennung nach Person scheitert genau daran.

Die Entscheidung fällt jetzt, weil sie später teuer wird: Jede Tabelle, jede
Policy und jede Projektion, die auf `patients` als einziges Verhältnis
aufsetzt, verteuert den Einzug einer zweiten Klammer (dieselbe Asymmetrie, die
ADR-014 beschreibt). Die Datenbank trägt bis heute ausschließlich synthetische
Daten.

## Entscheidung

**1. Getrennt wird nach Rechtsverhältnis, nicht nach Person.** Eine Person
kann beide Verhältnisse zugleich haben. Das Datenmodell **erzwingt** die
Trennung; es bildet sie nicht nur ab.

**2. Das Trainingsverhältnis entsteht additiv neben dem Behandlungsverhältnis.**
`patients` **ist** bereits das Behandlungsverhältnis und wird **nicht**
aufgeteilt. Daneben entsteht eine zweite Verhältnistabelle für das Training,
analog gebaut: Verweis auf `persons`, Status, Beginn. `persons` bleibt
unverändert. Der genaue Bezeichner ist Sache des SPEC (ADR-014: das konkrete
Schema ist nicht Gegenstand eines ADR); im Code und im Datenmodell heißen die
beiden Bereiche `therapy` und `training`.

**3. Die einzige Verbindung zwischen beiden Verhältnissen ist `person_id`.**
**Keine Fremdschlüssel zwischen den Verhältnistabellen** und keiner zwischen
ihren Fachdaten. Die gemeinsame Identität ist der einzige geteilte Punkt.

**4. Rechtsgrundlage, Datenklasse und Frist hängen am Verhältnis.**

| Ebene                    | Rechtsgrundlage                                                                                                              | Aufbewahrung                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Identität (`persons`)    | —                                                                                                                            | folgt dem längsten Verhältnis, das auf sie zeigt       |
| Behandlungsverhältnis    | Art. 9 Abs. 2 lit. h DSGVO i. V. m. § 630f BGB                                                                               | 10 Jahre ab Abschluss der Behandlung (ADR-008)         |
| Trainingsverhältnis      | Vertragsdaten Art. 6 Abs. 1 lit. b; Screening und Gesundheitsangaben Art. 9 Abs. 2 lit. a — **ausdrückliche Einwilligung**    | 3 Jahre ab Vertragsende (§ 195 BGB), Screening früher  |

Die Heilbehandlungs-Ausnahme lit. h trägt im Training **nicht**. Das
Trainingsverhältnis bekommt deshalb eine **eigene Datenklasse im Retention
Schedule** (ADR-008) und den fachlichen **Anker** dafür in der Tabelle — so wie
`care_concluded_on` den Anker der Akte trägt. Ohne Anker läuft keine Frist.

**5. Erste harte Regel: Fachdaten hängen immer an einem Verhältnis, nie
direkt an `persons`.** Kein Fremdschlüssel von Trainings- auf
Behandlungsdaten. Eine Tabelle, die nur `person_id` trägt und Fachliches
enthält, ist ein Mangel und kein Sonderfall.

**6. Zweite harte Regel: kein Durchgriff.** Wer nur die Trainingsrolle hat,
sieht keine Befunde — und umgekehrt. Durchgesetzt wird das in den
**RLS-Policies**, nicht in der Oberfläche (ADR-004 Punkt 5; ausgeblendete
Elemente sind keine Zugriffskontrolle). Der offene Zugriff aller
Therapeut:innen auf alle Patientenakten (§4.2, ADR-004 Punkt 2) gilt
**innerhalb** des Behandlungsverhältnisses und begründet keinen Zugriff auf
Trainingsdaten.

**7. Dritte harte Regel: Übernahme von Befunddaten ins Training nur als
dokumentierte Kopie**, mit Einwilligung, **nie als Referenz**. Eine Referenz
hielte den Zweck der Erhebung offen und bräche die Zweckbindung (Art. 5 Abs. 1
lit. b DSGVO). Die Kopie ist ab dem Kopieren ein Trainingsdatum mit der Frist
des Trainingsverhältnisses.

**8. Für beide Bereiche gilt einheitlich das strengere § 203-Niveau.**
Physiotherapeut:innen sind Berufsgeheimnisträger nach § 203 Abs. 1 Nr. 1 StGB;
für reine Trainingsdaten greift § 203 nicht, aber im Training werden
Screening-Daten erhoben, und die Grenze ist im laufenden Betrieb nicht sauber
zu ziehen. Statt zweier Niveaus gilt **eines, und zwar das höhere** — für
Zugriffsschutz, Auditpflicht (ADR-010) und Dienstleister: § 203 Abs. 3 StGB
verlangt deren Verpflichtung zur Geheimhaltung zusätzlich zum
Auftragsverarbeitungsvertrag (ADR-002). Für die Klarnamen gilt dasselbe in die
andere Richtung: `PROJECT_PRINCIPLES.md` §1.1 (Version 0.12) verbietet zwei
Datenschutzniveaus in einer Anwendung ausdrücklich; dieser ADR wiederholt die
Aussage nicht, er wendet sie an.

**9. Sprachregelung, verbindlich für alle Folgedokumente:** „PT" wird **nicht**
als Abkürzung benutzt. Es heißt **Physiotherapie** oder **Personal Training**,
ausgeschrieben.

## Konsequenzen

- **Die zweite Verhältnistabelle trägt das volle Fundament** aus ADR-014 und
  ADR-003: UUID-Primärschlüssel, `organization_id`, zeitzonenbewusste
  Zeitstempel, `created_at`/`created_by`, RLS von der ersten Migration an. Eine
  Tabelle mit Gesundheitsbezug ohne Policy ist nach ADR-004 kein Entwurf sondern
  ein Fehler.
- **Der Löschlauf lernt ein viertes Verhältnis.**
  `app.delete_patient_record` löscht die `persons`-Zeile heute nur, wenn weder
  `patients` noch `staff_members` noch `user_profiles` auf sie zeigen
  (`supabase/migrations/20260911180000_retention_run.sql`). Ohne die vierte
  Prüfung bricht der Lauf am Fremdschlüssel ab oder nimmt einer laufenden
  Trainingsbetreuung ihre Stammdaten. Das ist die konkreteste Folge von Punkt 4
  und gehört in denselben Loop wie die Tabelle.
- **Die neue Datenklasse ist keine Fleißaufgabe.**
  `supabase/tests/retention.test.ts` prüft die Zuordnung aller Tabellen gegen
  `pg_tables`; eine neue Tabelle ohne Klasse macht `pnpm test:db` rot. Das ist
  die objektive Verifikation dafür, dass Punkt 4 eingehalten wird.
- **Das Ende eines Verhältnisses beendet das andere nicht.** Wer seine
  Behandlung abschließt und weiter trainiert, verliert seine Trainingsdaten
  nicht — und umgekehrt. Die Identität überlebt beide und fällt erst, wenn kein
  Verhältnis mehr auf sie zeigt.
- **Jede Abfrage, Policy und Projektion muss sich entscheiden**, an welchem
  Verhältnis sie hängt. Das ist der Preis der Trennung und derselbe Mehraufwand
  je Feature, den ADR-004 bereits hingenommen hat (§16).
- **Die Rollen tragen die zweite Regel heute noch nicht.** `roleKeySchema`
  (`src/features/session/types.ts`) führt `owner`, `therapist`, `team_lead`,
  `office`, `patient` — ausschließlich Behandlungsrollen. Ohne eine
  Trainingsrolle läuft „kein Durchgriff" ins Leere, weil es nichts gibt, das
  nur das Training sieht. Diese Rolle kommt mit dem Nachzug an §4 (E18
  Schritt 5), **nicht** mit diesem ADR — bis dahin ist die Regel in den Policies
  als Grenze vorhanden, aber unbesetzt.
- **Auditpflicht gilt beidseitig.** Aus dem einheitlichen § 203-Niveau folgt,
  dass lesende Zugriffe auf Trainingsdaten so protokolliert werden wie die auf
  die Akte (ADR-010). Die Auditwerte für das neue Verhältnis treten **neben**
  die bestehenden; Auditzeilen werden nie umgeschrieben.
- **Verworfen: ein gemeinsamer `patients`-Datensatz mit Kennzeichen.** Ein Feld
  „ist auch Trainingskunde" ist billig zu bauen und teuer zu bezahlen:
  Datenklasse, Rechtsgrundlage und Frist wären an derselben Zeile nicht mehr
  trennbar, und der Rollenschnitt kippt — wer die Zeile lesen darf, liest beides.
- **Verworfen: zwei vollständig getrennte Personendatensätze.** Dubletten,
  doppelte Stammdatenpflege, und bei jeder Adressänderung die Frage, welche der
  beiden Zeilen stimmt.
- **Verworfen: die Trennung erst beim Trainingsbereich einziehen.** Dann stünde
  die zweite Implementierung neben der ersten, die
  [`ARBEITSBEREICHE.md`](../development/ARBEITSBEREICHE.md) verhindern soll.

## Bewusst nicht Bestandteil dieser Entscheidung

- **Der Terminkontext** — ein Kalender, ein Kontext je Termin, und die
  Abgrenzung zu [ADR-020](ADR-020-treatment-basis.md): eigener ADR (E18
  Schritt 2). Ein Trainingstermin braucht ein Trainingsprotokoll, aber **keine**
  Behandlungsdokumentation; wo das steht, entscheidet jener ADR.
- **Steuerkennzeichen, getrennte Nummernkreise, § 14c-Riegel und der Report
  „Einnahmen je Leistungsart"** — neue Fassung von ADR-009 (E18 Schritt 4).
- **Die drei Feature-Verbote an der MDR-Grenze** — neue Fassung von ADR-006
  (E18 Schritt 3).
- **Der Nachzug an §1, §4 und §14** einschließlich der Trainingsrolle und des
  Gegenstücks zu §4.6 — `PROJECT_PRINCIPLES.md` in neuer Version (E18
  Schritt 5, §21).
- **Der Trainingsbereich selbst** — vierzehn Bereiche, einzeln geschnitten
  (E18 Abschnitt 6). Dieser ADR legt das Fundament, nicht die Oberfläche.
- **Das konkrete Schema**: Tabellen- und Spaltennamen, Indizes, Constraints.
  Das entscheidet der SPEC des Loops, der die Tabelle baut (ADR-014).
- **Die Verwaltung der Einwilligung als Funktion** — Erteilen, Nachweisen,
  Widerrufen. Dass die Kopie nach Punkt 7 eine dokumentierte Einwilligung
  braucht, steht hier; wie sie erfasst wird, gehört in den Loop und in die DSFA
  (ADR-007).
- **Kein Code, keine Migration.** Dieser ADR ist Entscheidungsarbeit.

## Offene Folgefragen

- Wie heißt der **Anker des Vertragsendes** im Trainingsverhältnis, und ist er
  wie `care_concluded_on` ein ausdrücklicher, rücknehmbarer Vorgang oder ein
  Datum? (SPEC des Loops, analog LOE-001b.)
- Wie lange genau ist „**Screening früher**"? Die Frist für Gesundheitsangaben
  ohne fortbestehenden Vertragszweck ist eine interne Initialentscheidung und
  gehört nach ADR-008 in den DSFA-Prozess — **Anfrage B2**.
- Wie wird die **Einwilligung** nach Art. 9 Abs. 2 lit. a technisch erfasst,
  nachgewiesen und widerrufen, und was geschieht beim Widerruf mit einer bereits
  gezogenen Kopie nach Punkt 7? (B2, DSFA nach ADR-007.)
- Wie wird die **datenschutzrechtliche Bewertung der Trennung** bestätigt —
  insbesondere, dass das einheitliche § 203-Niveau keine Erweiterung der
  Zweckbindung ist, sondern eine Verschärfung des Schutzes? (B2.)
- Was gilt, wenn eine Person **beide Verhältnisse** hat und in der Behandlung
  ein Legal Hold liegt (ADR-008 Punkt 7)? Der Hold hängt am Verhältnis; ob er
  die gemeinsame `persons`-Zeile mitbindet, entscheidet der Loop.
- Wie wird die erste harte Regel **erzwungen** statt nur vereinbart — Konvention,
  Migrationsprüfung oder Test (dieselbe offene Frage wie in ADR-014)?

## Änderungshistorie

| Fassung | Datum | Änderung |
| --- | --- | --- |
| 1 | 2026-09-20 | Erstfassung, vorgeschlagen nach E18 (Projektinhaber, 2026-09-17); Schritt 1 von sieben. |
</content>
