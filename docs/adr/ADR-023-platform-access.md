# ADR-023: Plattformzugang — Konto je Person, Zugang je Verhältnis, Vertretung als eigene Beziehung

## Status

**Angenommen** (2026-09-30), alle 26 Punkte und die Wahlpunkte **W1 bis W6 wie empfohlen**
(Jannes, 2026-09-30). Die Punkte folgen aus §3.4, §4.6 bis §4.10, dem B5-Rahmen und den ADRs
004, 008, 010, 015 und 021; wo es eine echte Wahl gab, steht sie am Ende. POR-EPIC-001 kann
beginnen (Roadmap Block 4). Die Punkte 11, 13 und 5 gehen als Fragen ins Prüfpaket (B2, B5). Löst keinen ADR ab. Setzt [DSN-001](../development/PLATTFORM-ANSICHTEN.md)
voraus (bestätigt 2026-09-30), dessen Abschnitte 3 und 10 diese Fragen hierher verweisen.

**Fassung 2 (2026-09-30)**: Jannes hat sie am selben Tag nach der Durchsicht der drei Prüffragen
freigegeben. **Punkt 5 ändert seine Frist**: Konto und Zugang werden getrennt, der Zugang mit
seinem Nachweis hält drei Jahre statt zwölf Monate. Den Wortlaut der Fassung 1 zeigt der Punkt
selbst. **Punkte 11 und 13 werden geschärft**: Mail nur an eine persönlich bestätigte Adresse,
Ausweis und Vollmacht bei Vertretungen ansehen, Bedingungen der Einwilligung zur Begleitung. Die
übrigen 23 Punkte und W1 bis W6 bleiben unverändert.

**Ergänzt durch [ADR-025](ADR-025-session-lock.md)** (2026-10-02): Die Punkte 17 und 18 bekommen eine Sitzungssperre.

*Vermerk 2026-10-03 (LOG-EPIC-001): Was im Auditlog steht, regelt abschließend [ADR-010](ADR-010-audit-and-privileged-access.md) Fassung 3. Protokollvorgaben dieses ADR gelten nur, soweit sie dort aufgeführt sind; Schreibvorgänge weist das Datenmodell nach.* *Den Zweifel an der Einwilligungsfähigkeit (Punkt 13) vermerkt die Praxis am Zugang der rechtlichen Vertretung (`companion_declined_*`), nicht im Auditlog (ANN-207 Fassung 2).*

## Datum

2026-09-30 · Fassung 2: 2026-09-30

## Kontext

Die Plattform öffnet die Anwendung für Menschen außerhalb der Praxis: Patient:innen (§4.6) und
Kund:innen des Trainings (§4.10). Das ist das größte Risiko der Roadmap (R5): Ein Fehler zeigt
einer Person die Daten einer anderen. Vorher müssen fünf Fragen geklärt sein, die DSN-001
bewusst offen lässt: wie ein Konto entsteht, wie die Person nachweist, wer sie ist, wer für sie
handeln darf, wie lange eine Sitzung hält und wie die Datenbank „nur eigene Daten" durchsetzt.

**Was heute besteht** (Stand `main`, 2026-09-30):

- **Anmeldung** läuft ausschließlich über Supabase Auth (ADR-015 Punkt 8). Selbstregistrierung
  ist aus (`enable_signup = false` in `supabase/config.toml`). Praxiskonten entstehen in drei
  Schritten: Einladung, Anmeldung beim Anmeldedienst, Annahme. Die Einladung vergibt die
  Berechtigung. **Ein Konto, zu dem keine offene Einladung passt, hat keinen Zugriff** (ANN-025,
  `claim_staff_invitation`). Das Konto selbst legt heute noch ein Mensch auf der Oberfläche des
  Anmeldedienstes an: Die Admin-API braucht den `service_role`-Schlüssel und damit eine
  serverseitige Funktion. Die Edge Runtime ist für produktive Gesundheitsdaten nicht freigegeben
  (ADR-015 Punkt 20, OPS-001).
- **`user_profiles`** verbindet ein Konto mit Organisation und Person, höchstens eines je Person
  und Organisation (`unique (organization_id, person_id)`). `is_active` wird bei jeder Anfrage
  gelesen (ANN-044).
- **Die Rolle `patient`** steht seit der Gründungsmigration im Rollenkatalog, wurde aber nie
  vergeben. Einige frühe Policies enthalten trotzdem einen **Selbstzugriff über die Person**:
  `patients_select_scoped`, `persons_select_scoped`, `patient_contact_details_select_scoped` und
  `log_patient_record_view` lassen jedes Konto die Zeilen seiner eigenen `person_id` lesen.
  Dieses Muster ist älter als ADR-021 und hat zwei Fehler. Es fragt nach der Person statt nach
  dem Verhältnis und bricht damit §4.8, sobald eine Person beide Verhältnisse hat. Und es kennt
  keine Sperre des Zugangs, nur `is_active` am ganzen Konto.
- **Praxispfade** fragen durchweg nach Praxisrollen (`app.is_staff()`, `app.has_any_role(…)`).
  Drei Tabellen stehen jedem Konto der Organisation offen: `organizations`, `locations` und der
  Rollenkatalog `roles`.
- **Mailversand an Patient:innen gibt es nicht** (B13 wieder offen, BEF-026). Der eingebaute
  Versand des Anbieters stellt nur an das Projektteam zu. Bis zur Entscheidung wird hinter einem
  Adapter mit `mock`-Weg gebaut (Roadmap R8).
- **B5-Rahmen** (Jannes, 2026-09-08): Ein Konto gehört einer Person. Vertretung ist eine eigene
  Beziehung mit eigenem Konto und steht unterscheidbar im Auditlog, **niemals** als Weitergabe
  der Zugangsdaten. Der Portalzugang ist nicht die Einsicht nach § 630g BGB. Offen ist das
  Verfahren.

Die Menschen, um die es geht, sind oft hochbetagt und werden zu Hause behandelt. Sie haben
Angehörige, eine Betreuung oder eine Vorsorgevollmacht (B5: in der mobilen Versorgung „der
Regelfall"). Ein Verfahren, das nur mit Mail und Kennwortmanager funktioniert, erreicht sie
nicht (§2.2, `IDEA-QSN-006`).

## Entscheidung

### A. Konto und Zugang

**1. Ein Anmeldedienst für alle Konten.** Konten externer Personen sind Konten bei Supabase Auth,
wie die der Praxis. Es gibt keine zweite Identitätsinfrastruktur, kein eigenes Kennwortverfahren,
keine eigene Sitzungsmechanik (§3.4). Die Selbstregistrierung bleibt aus: **Ein Plattformkonto
entsteht nur aus einer Einladung der Praxis** (Punkte 6 bis 9).

**2. Ein Konto ist Praxiskonto oder Plattformkonto, nie beides.** Praxiskonten tragen Rollen in
`user_roles` (ADR-004). Ein Plattformkonto trägt **keine** Zeile in `user_roles`. Die Datenbank
erzwingt, dass ein Konto nicht beides zugleich hat; ein Test hält das fest. Wer ein Praxiskonto
hat, bekommt in V1 keinen Plattformzugang (**W1**).

**3. Zugriff folgt dem Zugang, nicht der Person.** Der Plattformzugang ist ein eigener Datensatz,
im Folgenden **Zugang** genannt (Bezeichner und Schema entscheidet der SPEC, ADR-014). Ein Zugang
verbindet **ein** Konto mit **einem** Verhältnis: einem Behandlungsverhältnis (`patients`) oder
einem Trainingsverhältnis. Er hat einen Zustand:

| Zustand       | Bedeutung                                    | Weiter nach                           |
| ------------- | -------------------------------------------- | ------------------------------------- |
| `invited`     | Einladung offen, noch kein Konto gebunden    | `active`, `revoked`, abgelaufen       |
| `active`      | Konto gebunden, Plattform nutzbar            | `locked`, `revoked`                   |
| `locked`      | vorübergehend gesperrt, rücknehmbar          | `active`, `revoked`                   |
| `revoked`     | entzogen, endgültig                          | — (ein neuer Zugang ist eine neue Einladung) |

Die Rollen aus §4.6 und §4.10 sind **keine Einträge in `user_roles`**. Sie ergeben sich aus den
aktiven Zugängen: Ein aktiver Zugang zu einem Behandlungsverhältnis bedeutet §4.6 für genau
dieses Verhältnis, nicht für die Person. Der Katalogeintrag `patient` wird nie vergeben. Ob der
SPEC ihn entfernt, entscheidet er; ein Test hält fest, dass keine Zeile in `user_roles` ihn trägt.

**4. Ein Konto je Person, höchstens ein Zugang je Konto und Verhältnis.** Hat eine Person beide
Verhältnisse, hat sie ein Konto und bis zu zwei Zugänge. Ein Verhältnis kann mehrere Zugänge
haben: den der Person selbst und die ihrer Vertretungen (Punkt 13). Jeder Zugang wird für sich
eingeladen, gesperrt und entzogen. Eine
Sperre im Training berührt die Behandlung nicht (§4.8). Der Bereichsschalter aus DSN-001 D6
zeigt nur Verhältnisse mit aktivem Zugang.

**5. Konto ist nicht Akte** (§4.6, §4.10, ADR-008 Punkt 9). Sperren und Entziehen ändern nur den
Zugang, nie das Verhältnis und nie seine Frist. Endet das Verhältnis (Abschluss der Versorgung,
Vertragsende), endet der Zugang nicht von selbst. Das Ende steuert, was die Person noch sieht:
30 Tage lesend, dann nur noch „Ich" (DSN-001 D2).

*(Fassung 2)* **Konto und Zugang haben getrennte Fristen**, weil sie verschiedene Daten sind:

| Was | Frist | Warum |
| --- | --- | --- |
| **Konto** (Anmeldedaten beim Anmeldedienst, `user_profiles`) | 30 Tage nach dem Ende des letzten Zugangs bzw. seiner Lesefrist (D2) | Zweck erledigt; der Puffer fängt ein versehentliches Entziehen ab |
| **Zugang mit Nachweis** (Übergabeweg, Bestätigung der Adresse, Vertretungsart, Nachweisvermerk, Einwilligung zur Begleitung und ihr Widerruf) | 3 Jahre nach dem Ende des Zugangs | so lange wie die Auditeinträge, die auf ihn zeigen (ADR-010 Punkt 5, ANN-029); zugleich die regelmäßige Verjährung nach § 195 BGB für den Nachweis der Einwilligung (Art. 7 Abs. 1 DSGVO) |

Datenklasse: **Zugangs- und Authentifizierungsdatum**. Fällt das Verhältnis im Löschlauf, endet
sein Zugang; der Nachweis läuft von da an seine drei Jahre und trägt dabei keinen Inhalt aus dem
Verhältnis. Ein Auditeintrag über einen Zugriff zeigt damit nie auf einen Zugang, der schon
gelöscht ist. Beide Fristen sind interne Initialentscheidungen und gehen in die Validierung
nach ADR-008.
*Fassung 1 lautete: „Datenklasse des Zugangs: Zugangs- und Authentifizierungsdatum wie die
Einladung (ANN-026), zwölf Monate nach seinem Ende (ADR-008, Tabelle). Fällt das Verhältnis im
Löschlauf, fällt sein Zugang mit. Das Konto fällt, sobald kein Zugang mehr darauf zeigt und
seine Frist abgelaufen ist."*

### B. Einladung und Zustellweg

**6. Eingeladen wird aus dem Verhältnis, von den Rollen, die es schreiben.** Behandlung: `owner`,
`therapist`, `team_lead`, `office` (`app.can_update_patient()`). Training: `owner`, `trainer`,
`office` (`app.can_write_training_relationships()`, ANN-172). Dieselben Rollen sperren, entsperren
und entziehen. Jeder dieser Vorgänge ist ein Auditereignis (ADR-010 Punkt 2: „Änderungen von
Portal-/Vertreterzugriffen"), ein abgewiesener Versuch ebenso (G6c). Angezeigt wird das im
Abschnitt **Plattform** an Akte und Trainingsverhältnis (DSN-001 Abschnitt 6).

**7. Dreischritt wie bei den Praxiskonten.** Die **Einladung** vergibt die Berechtigung und ist
14 Tage gültig (ANN-026). Das **Konto** entsteht beim Anmeldedienst. Die **Annahme** bindet es an
den Zugang. Die tragende Eigenschaft aus ANN-025 gilt unverändert: Ohne passende offene Einladung
bleibt ein Konto ohne jeden Zugriff. Die Einladung trägt einen einmaligen Code. Gespeichert wird
nur dessen Hash, nie der Code selbst, und er steht in keinem Log (ADR-011). Angemeldet wird mit
**E-Mail-Adresse und Kennwort**. Wer keine E-Mail-Adresse hat, bekommt in V1 kein eigenes Konto.
Er kann über eine Vertretung (Punkt 13) oder mit Plänen als PDF versorgt werden.

**8. Zwei Übergabewege, eine Einladung** (**W2**):

- **Vor Ort (Regelweg).** Die Praxis öffnet die Einladung auf ihrem Gerät, die Person scannt den
  Code als QR mit ihrem eigenen Telefon und legt dort Adresse und Kennwort fest. Das braucht
  keinen Mailversand, und die Übergabe selbst ist die Identitätsprüfung (Punkt 11).
- **Per Mail**, nur an die Adresse, die im Verhältnis steht, über den Zustellweg aus Punkt 10.

Beide Wege enden auf einer öffentlichen Seite der Anwendung, die die Einladung einlöst. Sie
kommt als dritte zu `/kennwort-neu` und `/zugang` hinzu und folgt ANN-043: `token_hash` statt
Sitzung in der Adresszeile. Für abgelaufene, benutzte und unbekannte Codes gibt sie dieselbe
Auskunft (§13).

**9. Das Konto legt ein serverseitiger Zugangsdienst an.** Der manuelle Handgriff aus ANN-025
trägt bei Patient:innen nicht: Er wäre je Person und Einladung nötig. Eine serverseitige Funktion
hält den Admin-Schlüssel als Secret. Sie prüft die offene Einladung und den Code, legt das Konto
beim Anmeldedienst an und bindet es in einem Aufruf. Der Browser sieht den Schlüssel nie. Die
Funktion läuft als Edge Function. Gebaut und getestet wird sie lokal mit synthetischen Daten
(§15.2). **Scharfgeschaltet wird sie erst**, wenn die Edge Runtime für produktive Daten geprüft
ist (ADR-015 Punkt 20, OPS-001). Das ist ein Gate für das Scharfschalten, kein Gate für das Bauen.

**10. Mails laufen über einen Adapter mit `mock`-Weg** (Roadmap R8, Grundsatz 5). `mock` stellt
lokal und im Test in das Postfach des lokalen Stacks zu. Der produktive Weg ist ein eigener
Versanddienst: B13, Anbieterprüfung nach ADR-002 in Block 11, eigener ADR bei der Wahl. Die
Plattform muss **ohne Mail benutzbar** sein. Das leistet der Weg vor Ort, und zwar auch für ein
vergessenes Kennwort: Die Praxis übergibt eine neue Einladung für das bestehende Konto, und die
Person setzt damit ein neues Kennwort. Der Wiederherstellungslink per Mail kommt mit B13 hinzu.

### C. Identität und Vertretung

**11. Die Identität prüft die Praxis, die die Person kennt.** Ein Zugang entsteht nur zu einem
Verhältnis, das die Praxis schon führt. Geprüft wird mit **persönlicher Übergabe** (Punkt 8, vor
Ort) oder mit **Mail an die Adresse im Verhältnis**, die die einladende Person mit der
Patient:in oder Kund:in abgeglichen hat. *(Fassung 2)* Abgeglichen heißt: **Die Person hat die
Adresse selbst bestätigt**, im Gespräch oder am Termin. Eine Adresse, die nur aus einer
Überweisung, einem Formular oder von Angehörigen stammt, genügt nicht. Gerade in der mobilen
Versorgung gehört die Adresse in der Akte oft der Tochter oder der ganzen Familie. Die Einladung
hält fest, wer sie auf welchem Weg übergeben hat und wer die Adresse wann bestätigt hat. Ändert
sich die Adresse, braucht es eine neue Einladung. Es gibt **keinen
Ausweisscan, kein Video-Ident, keinen externen Identitätsdienst**: Die Praxis kennt die Person,
und ein neuer Anbieter wäre ein neues Risiko ohne neue Sicherheit. Das Verfahren gilt vorläufig
bis zur Antwort auf B5 und ist an einer Stelle austauschbar, der Einladungsfunktion.

**12. Die Plattform ist keine Akteneinsicht** (B5 Rahmensatz 2, DSN-001 Abschnitt 2 Satz 3). Sie
zeigt nur, was für sie bestimmt ist (Punkt 22). Die Einsicht nach § 630g BGB bleibt ein eigener
Vorgang auf Antrag, mit eigener Identitätsprüfung und dokumentiertem Umfang. Er läuft in der
Praxis, als Kopie der Akte durch `owner` (OPS-006, `patient_record.exported`), und die Plattform ändert
ihn nicht.

**13. Vertretung ist ein Zugang mit eigenem Konto.** Die vertretende Person hat ihr eigenes Konto
(eigene Person, eigene Adresse, eigenes Kennwort). Ihr Zugang zeigt auf das Verhältnis der
vertretenen Person. Gehört das Konto nicht zur Person des Verhältnisses, ist der Zugang eine
Vertretung und braucht eine **Art** und einen **Nachweisvermerk**: wer welches Dokument wann
gesehen hat. *(Fassung 2)* Angesehen werden **der Ausweis der vertretenden Person** und bei
rechtlicher Vertretung **Vollmacht, Betreuerausweis oder Sorgerechtsnachweis**. Gespeichert wird
davon nichts, weder Scan noch Ausweisnummer. Der Vermerk hält nur fest, was wer wann gesehen hat.
Zwei Arten (**W3**):

| Art                     | Wer                                                                      | Darf                                                                                            |
| ----------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Rechtliche Vertretung** | Sorgeberechtigte, Betreuung mit passendem Aufgabenkreis, Vorsorgevollmacht | alles, was die Person darf, auch Einwilligungen erteilen und widerrufen                          |
| **Begleitung**          | Angehörige oder Vertraute, mit dokumentierter Zustimmung der Person      | lesen, Terminwünsche und Nachrichten schreiben; **keine** Einwilligung, kein Widerruf, kein Datenexport |

Die Zustimmung zur Begleitung ist zugleich die Entbindung von der Schweigepflicht gegenüber
dieser Person (§ 203 StGB). *(Fassung 2)* Weil die Begleitung Gesundheitsdaten sieht und die
Heilbehandlung (Art. 9 Abs. 2 lit. h DSGVO) die Weitergabe an Angehörige nicht trägt, ist sie eine
**ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO** und muss deren Bedingungen erfüllen:

- **konkret**: Sie nennt die begleitende Person und den Umfang, also die Bereiche aus der Tabelle,
  und ob frühere Nachrichten mit den Antworten der Praxis sichtbar sind.
- **informiert, freiwillig, jederzeit widerruflich**: Der Widerruf wirkt wie ein Entziehen.
- **nachweisbar** (Art. 7 Abs. 1): Am besten erteilt die Person sie selbst in ihrem Konto unter
  „Ich". Hat sie kein Konto, bestätigt sie sie auf dem Praxisgerät; der Vermerk nennt, wer dabei
  war.
- **von einer einwilligungsfähigen Person**: Hat die Praxis daran Zweifel, gibt es keine
  Begleitung, sondern nur die rechtliche Vertretung. Der Zweifel wird vermerkt, eine Diagnose
  nicht.

Den Wortlaut legt POR-EPIC-001b fest, geprüft wird er in B2. Das Weitergeben von Zugangsdaten
bleibt verboten (B5). Die Nutzungshinweise sagen
das, und weil es technisch nicht zu verhindern ist, muss der erlaubte Weg der leichtere sein:
Eine Begleitung ist vor Ort in zwei Minuten eingerichtet.

**14. Vertretung ist sichtbar und unterscheidbar.** Jeder Vorgang über einen Vertretungszugang
trägt den Zugang im Auditeintrag. Akteur ist das Konto der vertretenden Person, Gegenstand das
Verhältnis der vertretenen (B5 Rahmensatz 1). Die Ansicht zeigt dauerhaft „Sie handeln für …"
(DSN-001 Abschnitt 10). Hat die vertretene Person selbst ein Konto, sieht sie unter „Ich", wer
für sie Zugang hat. Eine Begleitung kann sie dort selbst beenden. Eine rechtliche Vertretung
beendet nur die Praxis.

**15. Minderjährige haben keinen eigenen Zugang** (**W4**). Unter 18 Jahren gibt es nur die
rechtliche Vertretung durch Sorgeberechtigte. Mit dem 18. Geburtstag endet deren Wirkung aus dem
Sorgerecht. Das prüft der Server am Geburtsdatum der Person, nicht die Oberfläche. Die Grenze ist
eine Zahl an einer Stelle.

**16. Wer eine Rechnung empfängt, hat deshalb noch keinen Zugang.** Der Adressat einer Rechnung
(ADR-009, Rechnungsempfänger ≠ Patient:in) bekommt daraus keinen Plattformzugang. Er sieht die
Rechnung nur, wenn er zugleich Vertretung ist. Die behandelte Person sieht ihre eigenen
Rechnungen auch dann, wenn sie an jemand anderen adressiert sind (DSN-001 D3). Damit ist die
Frage beantwortet, die D3 hierher verweist.

### D. Sitzung

**17. Sitzungen führt der Anmeldedienst, für alle Konten gleich.** Es gibt ein Projekt und eine
Konfiguration: `jwt_expiry`, Rotation der Erneuerungstoken und Mindestlänge des Kennworts
(12 Zeichen, ANN-027) gelten für Praxis- und Plattformkonten gleich. Eine eigene Sitzungsregel
für die Plattform würde Eigenbau bedeuten (§3.4).

**18. Was an der Plattform anders ist:**

- Anmeldung mit **E-Mail und Kennwort**, keine Anmeldung allein per Mail-Link. Sonst hinge jede
  Anmeldung an B13.
- Ein zweiter Faktor ist einrichtbar, wird aber nicht verlangt (wie ANN-028).
- „Abmelden" unter „Ich" beendet die Sitzung auf diesem Gerät (ANN-045). „Überall abmelden"
  steht daneben.
- **Sperren und Entziehen wirken bei der nächsten Anfrage.** Jede Plattformprojektion liest den
  Zustand des Zugangs, so wie die Praxispfade `is_active` lesen (ANN-044). Ein ausgestelltes
  Zugriffstoken zeigt danach nichts mehr, obwohl es bis `jwt_expiry` gültig bleibt.
- Kein Offline-Modus, kein Service Worker (ADR-015 Punkt 16). Das regelt ADR-024.

### E. Durchsetzung — „nur eigene Daten"

**19. Die Plattform liest und schreibt nur über Plattformprojektionen.** Das sind eigene
Funktionen, die den Zugriff aus `auth.uid()` über einen **aktiven Zugang** zum Verhältnis
ableiten. Eine Kennung, die der Browser mitschickt, wählt höchstens unter den eigenen Zugängen
aus und gewährt nie etwas. Für Plattformkonten gibt es keine Tabellen-Policy auf Praxistabellen
und kein direktes `SELECT`. Das ist ADR-004 Punkt 5, angewandt auf die neue Seite: Die
Projektion entscheidet, RLS bleibt die zweite Linie.

**20. Der Selbstzugriff über `person_id` entfällt.** Die Klauseln
`person_id = app.current_person_id()` bzw. `id = app.current_person_id()` in
`patients_select_scoped`, `persons_select_scoped`, `patient_contact_details_select_scoped` und
`log_patient_record_view` werden auf Praxiskonten beschränkt oder gestrichen, bevor der erste
Zugang aktiv werden kann. Das ist der erste Schritt von POR-EPIC-001. Selbstbezüge von
Mitarbeitenden auf ihre eigenen Daten (`staff_private_details`, Textbausteine, Vergütung) sind
davon nicht betroffen: Sie gehören zum Praxiskonto.

**21. Praxispfade verweigern Plattformkonten, und ein Test beweist es für alle.** Die drei offenen
Tabellen (`organizations`, `locations`, `roles`) werden auf Praxiskonten beschränkt. Was die
Plattform davon braucht, etwa Name und Marke der Praxis im Kopf, liefert eine Projektion. Ein
Test in `pnpm test:db` meldet ein Plattformkonto in jedem Zustand an. Er geht **alle** Tabellen
aus `pg_tables` und alle an `authenticated` freigegebenen Funktionen durch und verlangt: keine
Zeile, jeder Aufruf abgewiesen. Ausgenommen sind nur die Plattformprojektionen und die
Funktionen, die für jedes Konto gelten (etwa der Vermerk eines eigenen Sicherheitsereignisses,
STAFF-004). Diese Ausnahmen stehen als Liste im Test, und ein Eintrag dort ist Teil des Reviews.
Eine neue Tabelle oder Funktion ist damit automatisch geprüft, so wie `retention.test.ts` jede
neue Tabelle an ihre Datenklasse bindet.

**22. Was für die Plattform bestimmt ist, steht am Objekt, nicht in der Oberfläche.** Eine
Rechnung ist sichtbar, weil sie gestellt ist, ein Dokument, weil es einzeln freigegeben ist
(DSN-001 D3). Ein Termin ist sichtbar ohne interne Notiz, ein Plan, weil er der Person zugewiesen
ist. Jede Projektion gibt nur die Felder einer festen Liste heraus. Befund,
Behandlungsdokumentation, interne Notizen und Patientenfotos kommen in keiner vor (DSN-001
Abschnitt 2 Satz 3, ADR-017 Punkt 37).

**23. Jede Plattformprojektion hat ihre Negativfälle** (ADR-013 Punkt 9 Nr. 1, Fassung 4):

- fremde Person
- anderes Verhältnis derselben Person ohne Zugang (anderer Leistungsbereich)
- Zugang `invited`, `locked` und `revoked`
- abgelaufene Lesefrist (D2)
- Praxiskonto
- andere Organisation
- bei Einwilligung, Widerruf und Export zusätzlich die Begleitung

**24. Protokolliert wird, was nachzuweisen ist** (**W5**). In jedem Fall: jede Änderung an einem
Zugang, jeder Schreibvorgang der Person (Wunsch, Nachricht, Einwilligung, Widerruf), jeder
Dokumentabruf (Verweis als Download, ADR-010 Punkt 14), jeder Datenexport und **jeder Zugriff
über eine Vertretung, auch lesend**. Das bloße Lesen der eigenen Daten durch die Person selbst
wird nicht einzeln protokolliert. Ein solcher Eintrag würde nur zeigen, dass jemand seine eigenen
Termine gesehen hat, und das wiegt die Menge der Einträge nicht auf (Art. 5 Abs. 1 lit. c DSGVO).
Die Vorschau der Praxis (DSN-001 D7) ist davon getrennt und wird wie ein Lesezugriff auf die Akte
protokolliert.

### F. Abgrenzung zur Praxisoberfläche

**25. Eine Anwendung, zwei Oberflächen.** Es gibt kein zweites Deployment und keine zweite
Anwendung (ADR-015 Punkt 1). Das Gate unterscheidet nach der Art des Kontos: Ein Praxiskonto
bekommt die Praxisoberfläche, ein Plattformkonto das Gerüst aus DSN-001 unter eigenem Pfadpräfix
(der SPEC wählt es). Ein Plattformkonto sieht nie Seitenleiste, Funktionssuche oder Praxisbegriffe.
Ein Praxiskonto sieht das Plattformgerüst nur als Vorschau (D7, später). Die Weiche im Router
dient der Bedienung. **Der Schutz liegt in den Punkten 19 bis 21.**

**26. Der Plattformcode ist ein eigenes Feature** unter `src/features/` (ADR-015 Punkt 23). Er
spricht nur Plattformprojektionen an. Ein Test oder eine Lint-Regel prüft, dass er keine
Datenzugriffe der Praxisfeatures importiert. Gemeinsam sind nur Komponenten, Begriffe und
`marke/`.

## Konsequenzen

- **POR-EPIC-001 beginnt mit Aufräumen, nicht mit Bauen.** Erst Punkt 20 (Selbstzugriff) und
  Punkt 21 (offene Tabellen, Test über alle Tabellen), dann der Zugang. Umgekehrt stünde ein
  aktiver Zugang einen Moment lang auf alten Policies, die nach der Person fragen.
- **Der Löschlauf lernt das Konto.** `app.delete_patient_record` lässt die `persons`-Zeile stehen,
  solange `user_profiles` auf sie zeigt (`20260911180000_retention_run.sql`). Ohne Nachzug hielte
  ein Plattformkonto die Stammdaten einer gelöschten Akte fest. Mit dem Verhältnis endet deshalb
  sein Zugang, und das Konto fällt nach Punkt 5; der Löschlauf oder der Zugangsdienst entfernt es
  beim Anmeldedienst. *(Fassung 2)* Der Nachweis des Zugangs überdauert das Verhältnis um seine
  drei Jahre. Er darf dabei nicht an der `persons`-Zeile der Person des Verhältnisses hängen und
  nicht deren Namen tragen, sonst hielte er ihre Stammdaten ebenso fest. Er trägt die Kennung des
  Verhältnisses wie ein Auditeintrag. Bei einer Vertretung trägt er außerdem den Namen der
  vertretenden Person, als Teil des Nachweises, weil deren Konto nach 30 Tagen fällt. Den Weg
  legt der SPEC fest; ein Test in `retention-run` beweist ihn. Das ist
  dieselbe Art Folge wie die vierte Prüfung aus ADR-021.
- **Die Plattform ist gebaut, bevor sie scharf sein darf.** Zugangsdienst (Punkt 9) und
  Mailversand (Punkt 10) laufen mit `mock` und lokal. Echte Konten brauchen OPS-001 für die Edge
  Runtime, für Mails zusätzlich B13 mit eigener Anbieterprüfung. Beides steht in Block 11 und 12
  und hält POR-EPIC-001 bis -003 nicht auf (§15.2).
- **Personen ohne E-Mail-Adresse** bleiben in V1 ohne eigenes Konto (Punkt 7). Für hochbetagte
  Patient:innen ist das hinnehmbar, weil die Begleitung (Punkt 13) genau diesen Fall trägt. Eine
  Anmeldung per SMS hinge an B15 und ist nicht Teil dieses ADR.
- **Das Auditlog bekommt einen zweiten Akteurstyp.** Bisher ist jeder Akteur ein Praxiskonto.
  Plattformkonten und Vertretungen kommen hinzu. `list_audit_events` muss sie unterscheidbar
  zeigen (Punkt 14). Auditzeilen werden nie umgeschrieben; neue Werte treten neben die alten.
- **Die Datenschutzprüfung bekommt drei Fragen** (B2, B5): Genügt die persönliche Übergabe als
  Identitätsprüfung (Punkt 11)? Genügt die dokumentierte Zustimmung zur Begleitung als
  Schweigepflichtentbindung (Punkt 13)? Welche Frist gilt für Zugangsdaten (Punkt 5)? Fassung 2
  hat zu allen drei eine begründete Antwort vorgelegt; die Prüfung bestätigt oder ändert sie.
  Bis dahin gelten die Punkte als vorläufige Festlegung. Jeder ist an genau einer Stelle
  verankert, die der Loop benennt, der ihn baut.
- **Verworfen: der Selbstzugriff über `person_id`.** Er ist billig, weil er schon da ist. Aber er
  schließt über die gemeinsame Identität von einem Verhältnis aufs andere (§4.8) und kennt keine
  Sperre je Verhältnis.
- **Verworfen: die Rolle `patient` in `user_roles`.** Eine Rolle gilt für die Person in der ganzen
  Organisation. Die Plattform braucht einen Zugriff je Verhältnis und je Zustand. Zwei Quellen für
  dieselbe Frage würden auseinanderlaufen.
- **Verworfen: ein eigenes Portal als zweite Anwendung oder Subdomain.** Das hieße zweites
  Deployment, zweite Auth-Konfiguration und zweite Prüfung, für eine Trennung, die ohnehin in der
  Datenbank liegt (Punkt 19).
- **Verworfen: Anmeldung nur per Mail-Link.** Ohne Kennwort ist sie für Ältere bequemer, bindet
  aber jede Anmeldung an einen Versandweg, der fehlt (B13).
- **Verworfen: Identitätsnachweis per Ausweis oder Video-Ident.** Ein neuer Anbieter mit
  Gesundheitsbezug, ein Ausweisbild als neues Datum, und kein Gewinn gegenüber einer Praxis, die
  die Person seit Wochen behandelt.

## Bewusst nicht Bestandteil dieser Entscheidung

- **Benachrichtigungen und Offline-Erfassung**: ADR-024.
- **Einwilligungen als Funktion** (erteilen, nachweisen, widerrufen): POR-EPIC-003, auf PAT-006.
  Dieser ADR legt nur fest, **wer** sie abgeben darf (Punkt 13).
- **Das konkrete Schema**: Tabellen, Spalten, Funktionsnamen, Pfadpräfix. Das entscheidet der
  SPEC (ADR-014).
- **Die Wahl eines Versanddienstes**: B13, Block 11, eigener ADR nach ADR-002.
- **Das Einsichtsverfahren nach § 630g BGB** und seine Identitätsprüfung (Punkt 12).
- **Wortlaut** der Einladung, der Nutzungshinweise und der Hinweise zur Vertretung: im Loop und in
  `src/lib/begriffe.ts`.
- **Passkeys und Anmeldung per SMS**: erst, wenn der Anmeldedienst sie geprüft anbietet bzw. B15
  entschieden ist.

## Offene Folgefragen

- Was gilt beim **Tod** der vertretenen Person oder wenn eine Betreuung aufgehoben wird? Vorschlag:
  Die Praxis entzieht den Zugang, sobald sie davon erfährt. Ein automatischer Weg fehlt, weil die
  Anwendung davon nichts erfährt.
- Wie prüft die Praxis den **Aufgabenkreis einer Betreuung** (Gesundheitssorge)? Vorschlag:
  Vermerk „Betreuerausweis gesehen, Aufgabenkreis …" im Nachweis (Punkt 13). Rechtlich zu
  bestätigen in B5.
- Braucht eine Person mit **Praxiskonto** doch einen Plattformzugang (W1 b oder c)? Das fällt an,
  sobald eine Mitarbeiterin in Behandlung ist und ihre Übungen sehen will.
- ~~Wie lange bleibt ein Konto **ohne jeden Zugang** bestehen, bevor es fällt? (Punkt 5, B2.)~~
  *Beantwortet mit Fassung 2, Punkt 5: 30 Tage; der Zugang mit Nachweis drei Jahre.*

## Wahlpunkte — bestätigt

**Jannes hat am 2026-09-30 alle sechs wie empfohlen bestätigt.** Die verworfenen Optionen
bleiben als Rückweg stehen. Jede Wahl ist nach §15.1 reversibel gedacht. Die Rücknahme ist je Punkt genannt, verankert wird
im Loop, der sie baut.

**W1 — Person mit Praxiskonto.** (a) In V1 kein Plattformzugang für Personen mit Praxiskonto; sie
bekommen Pläne als PDF. (b) Ein zweites Konto mit anderer Adresse; dafür muss
`unique (organization_id, person_id)` in `user_profiles` fallen. (c) Ein Konto mit Umschalter
zwischen Praxis und Plattform.
**Empfehlung (a).** Der Fall ist selten. Mitarbeitende sehen ihre Akte als Therapeut:in ohnehin
(§4.2). (c) würde Punkt 2 aufweichen und damit die klarste Grenze der Plattform. Rücknahme nach
(b) `mittel`: eine Constraint, das Gate, der Löschlauf.

**W2 — Übergabe der Einladung.** (a) Vor Ort per QR als Regelweg, Mail als zweiter Weg. (b) Nur per
Mail.
**Empfehlung (a).** Der Weg vor Ort funktioniert ohne B13, ist für 78-Jährige beim Hausbesuch der
natürliche Moment und ist zugleich die Identitätsprüfung (Punkt 11). Rücknahme `klein`.

**W3 — Arten der Vertretung.** (a) Zwei: rechtliche Vertretung und Begleitung. (b) Nur rechtliche
Vertretung; Angehörige ohne Vollmacht bekommen keinen Zugang. (c) Eine Art ohne Unterschied.
**Empfehlung (a).** In der mobilen Versorgung ist die Tochter, die die Termine koordiniert, häufiger
als die Betreuerin. (b) würde sie zur Weitergabe der Zugangsdaten drängen, (c) sie Einwilligungen
abgeben lassen, die ihr nicht zustehen. Rücknahme `klein`: eine Art mehr oder weniger.

**W4 — Altersgrenze für ein eigenes Konto.** (a) 18 Jahre. (b) 16 Jahre, angelehnt an
Art. 8 DSGVO.
**Empfehlung (a).** Die restriktivere Seite (§16). Art. 8 regelt Einwilligungen in Dienste der
Informationsgesellschaft, nicht den Zugang zu Behandlungsdaten. Rücknahme `klein`: eine Zahl.

**W5 — Was protokolliert wird.** (a) Wie Punkt 24: alles Schreibende, Downloads, Export, jede
Vertretung, das eigene Lesen nicht. (b) Zusätzlich jedes Öffnen einer Plattformansicht durch die
Person selbst.
**Empfehlung (a).** Nachvollziehbarkeit ist die Kompensation für fremde Zugriffe (ADR-004), und
fremd ist hier nur die Vertretung. Rücknahme `klein`: ein Ereignis mehr in den Projektionen.

**W6 — Wann die Vertretung gebaut wird.** (a) In POR-EPIC-001, mit dem eigenen Zugang. (b) Als
eigener Loop **POR-EPIC-001b** direkt danach, vor POR-EPIC-002. Der Zugang aus POR-EPIC-001 ist
so gebaut, dass die Vertretung hinzukommt, ohne ihn umzubauen.
**Empfehlung (b).** POR-EPIC-001 ist mit Aufräumen, Zugang, Zugangsdienst und dem Test über alle
Tabellen schon ein kritischer Loop mit Zweitreview (ADR-013 Punkt 9). Die Vertretung bringt einen
zweiten Akteurstyp und eigene Negativfälle mit und verdient einen eigenen Review. Vor POR-EPIC-002
muss sie stehen, denn ab dort gibt es etwas zu sehen. Rücknahme `klein`: Reihenfolge.

## Änderungshistorie

| Fassung | Datum | Änderung |
| --- | --- | --- |
| 1 | 2026-09-30 | Erstfassung nach DSN-001 (bestätigt 2026-09-30); 26 Punkte, Wahlpunkte W1 bis W6; am selben Tag angenommen, W1 bis W6 wie empfohlen. |
| 2 | 2026-09-30 | **Punkt 5 geändert** (Jannes): Konto 30 Tage nach dem letzten Zugang, Zugang mit Nachweis drei Jahre wie das Auditlog statt zwölf Monate; Wortlaut der Fassung 1 im Punkt. Punkt 11: Mail nur an eine von der Person selbst bestätigte Adresse. Punkt 13: Ausweis und Vollmacht ansehen, nichts speichern; Einwilligung zur Begleitung nach Art. 9 Abs. 2 lit. a mit vier Bedingungen. Erledigungsvermerk in den Folgefragen. Übrige Punkte und W1 bis W6 unverändert. |
