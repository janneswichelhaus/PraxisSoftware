# ADR-023: Plattformzugang — Konto je Person, Zugang je Verhältnis, Vertretung als eigene Beziehung
## Status
Angenommen (2026-09-30, Jannes), Fassung 8 (2026-10-27); setzt DSN-001 voraus
(`git show 9452575:docs/development/PLATTFORM-ANSICHTEN.md`), löst keinen ADR ab, ergänzt durch
ADR-025 (Sperre zu Punkten 17 und 18). Protokollvorgaben gelten nur, soweit ADR-010 Punkt 16 sie
aufführt; Schreibvorgänge weist das Datenmodell nach (Vermerk 2026-10-03).

## Kontext
Die Plattform öffnet die Anwendung für Patient:innen (§4.6) und Kund:innen des Trainings (§4.10),
oft hochbetagt und vertreten (§2.2); ein Fehler zeigt einer Person fremde Daten (R5). Zu entscheiden
sind im Rahmen von B5 (Jannes, 2026-09-08) Konto, Identität, Vertretung, Sitzung und Durchsetzung.
Nicht Bestandteil: Benachrichtigungen (ADR-024), Einwilligungen als Funktion (POR-EPIC-003), Schema
(SPEC, ADR-014), Wortlaute (`src/lib/begriffe.ts`), SMS (B15).

## Entscheidung
Abschnitt C (Identität und Vertretung) umfasst die Punkte 11 bis 16.

1. **Ein Anmeldedienst für alle Konten:** Plattformkonten sind Konten bei Supabase Auth wie die der
Praxis, ohne zweite Identitätsinfrastruktur, eigenes Kennwort- oder Sitzungsverfahren (§3.4);
einzige Ausnahme vom eigenen Prüfverfahren ist die App-PIN der gesperrten Sitzung (Fassung 4;
ADR-025 Punkt 11). Ohne Selbstregistrierung entsteht ein Plattformkonto nur aus einer Einladung der
Praxis (Punkte 6 bis 9).
2. **Ein Konto ist Praxiskonto oder Plattformkonto, nie beides:** Nur Praxiskonten tragen Rollen in
`user_roles` (ADR-004); die Datenbank erzwingt das, ein Test hält es fest. Mit Praxiskonto gibt es
in V1 keinen Plattformzugang, nur Pläne als PDF (W1).
3. **Zugriff folgt dem Zugang, nicht der Person:** Ein Zugang (`public.platform_accesses`) verbindet
ein Konto mit einem Behandlungs- (`patients`) oder Trainingsverhältnis; Zustände `invited`
(Einladung offen, kein Konto, kann ablaufen) → `active` ⇄ `locked` (vorübergehend), aus jedem nach
`revoked` (endgültig; neu heißt neue Einladung). Die Rollen aus §4.6 und §4.10 gibt ein aktiver
Zugang für genau sein Verhältnis, nicht für die Person, nie über `user_roles`; der Katalogeintrag
`patient` wird nie vergeben (Test).
4. **Ein Konto je Person, höchstens ein Zugang je Konto und Verhältnis:** Mit beiden Verhältnissen
hat eine Person ein Konto und bis zu zwei Zugänge, ein Verhältnis neben ihrem Zugang die ihrer
Vertretungen (Punkt 13). Jeder Zugang wird für sich eingeladen, gesperrt und entzogen, eine Sperre
im Training berührt die Behandlung nicht (§4.8). Der Bereichsschalter (DSN-001 D6) zeigt nur
Verhältnisse mit aktivem Zugang.
5. **Konto ist nicht Akte** (§4.6, §4.10, ADR-008 Punkt 9): Sperren und Entziehen ändern nur den
Zugang, nie das Verhältnis oder seine Frist. Endet das Verhältnis (Abschluss der Versorgung,
Vertragsende), endet der Zugang nicht von selbst; die Person sieht 30 Tage lesend, dann nur „Ich"
(DSN-001 D2). Getrennte Fristen *(Fassung 2)*, Klasse `plattformzugang`: das Konto (Anmeldedaten,
`user_profiles`) 30 Tage nach dem Ende des letzten Zugangs bzw. seiner Lesefrist, der Zugang mit
seinem Nachweis drei Jahre nach seinem Ende wie die auf ihn zeigenden Auditeinträge
(ADR-010 Punkt 5, ANN-029; § 195 BGB, Art. 7 Abs. 1 DSGVO).
6. **Eingeladen wird aus dem Verhältnis, von den Rollen, die es schreiben**
(`app.can_update_patient()`, `app.can_write_training_relationships()`, ANN-172); sie sperren,
entsperren und entziehen auch. Der Abschnitt „Plattform" von Akte und Trainingsverhältnis zeigt das
und was die Person auf der Plattform hat.
7. **Dreischritt wie bei den Praxiskonten:** Die Einladung vergibt die Berechtigung und gilt 14 Tage
(ANN-026), das Konto entsteht beim Anmeldedienst, die Annahme bindet es an den Zugang; ohne passende
offene Einladung bleibt ein Konto ohne jeden Zugriff (ANN-025). Ihr einmaliger Code wird nur als
Hash gespeichert, nie geloggt (ADR-011). Kennung bleibt die E-Mail-Adresse, angemeldet wird per
Passkey (Fassung 4; ADR-025 Punkte 9 bis 11); ohne E-Mail-Adresse oder Gerät mit Passkey gibt es in
V1 kein eigenes Konto, versorgt wird über eine Vertretung (Punkt 13) oder mit Plänen als PDF.
Ausnahme nach §4.10 *(Fassung 8)*: Wer mit eigenem Zugang den Trainingsvertrag über sein Konto
bucht, bekommt im selben Aufruf ohne Einladung einen aktiven Zugang zum neuen Trainingsverhältnis
(ANN-291).
8. **Zwei Übergabewege, eine Einladung** (W2): Regelweg vor Ort, ohne Mail: Die Praxis öffnet die
Einladung auf ihrem Gerät, die Person scannt den Code als QR mit ihrem eigenen Telefon und legt dort
Adresse, Passkey und PIN fest (Fassung 4; ADR-025 Punkt 13). Per Mail nur an die Adresse im
Verhältnis (Punkt 10). Beide enden auf einer öffentlichen Einlöseseite neben `/zugang` (ANN-043) mit
gleicher Auskunft für abgelaufene, benutzte und unbekannte Codes (§13).
9. **Das Konto legt ein serverseitiger Zugangsdienst an:** eine Edge Function, die den
Admin-Schlüssel als Secret hält (nie im Browser), offene Einladung und Code prüft und das Konto beim
Anmeldedienst in einem Aufruf anlegt und bindet. Scharf erst, wenn die Edge Runtime für produktive
Daten geprüft ist (ADR-015 Punkt 20, OPS-001); gebaut und getestet wird vorher lokal mit
synthetischen Daten (§15.2).
10. **Mails laufen über einen Adapter mit `mock`-Weg** (Roadmap R8), produktiv über einen eigenen
Versanddienst (B13; Prüfung nach ADR-002, eigener ADR). Die Plattform muss ohne Mail benutzbar sein,
über den Weg vor Ort, auch bei verlorenem Passkey (neue Einladung für das bestehende Konto,
ADR-025 Punkt 12). Einen Wiederherstellungslink gibt es nicht, Plattformkonten bekommen keine Mail
des Anmeldedienstes (Fassung 4, ANN-331).
11. **Die Identität prüft die Praxis, die die Person kennt:** Ein Zugang entsteht nur zu einem
Verhältnis, das sie schon führt, geprüft durch persönliche Übergabe (Punkt 8) oder Mail an die
Adresse im Verhältnis, die die Person der einladenden Person selbst bestätigt hat, im Gespräch oder
am Termin *(Fassung 2)*; eine Adresse nur aus Überweisung, Formular oder von Angehörigen genügt
nicht. Die Einladung hält fest, wer sie wie übergab und wer die Adresse wann bestätigte; eine neue
Adresse braucht eine neue Einladung. Kein Ausweisscan, kein Video-Ident, kein externer
Identitätsdienst. Das Verfahren ist an einer Stelle austauschbar, der Einladungsfunktion. Für den
Zugang aus dem Trainingsvertrag (Punkt 7) gilt die Prüfung der Einladung zur Behandlung (Fassung 8).
12. **Die Plattform ist keine Akteneinsicht** (B5 Rahmensatz 2) und zeigt nur, was für sie bestimmt
ist (Punkt 22). Die Einsicht nach § 630g BGB bleibt ein eigener Vorgang auf Antrag mit eigener
Identitätsprüfung und dokumentiertem Umfang, in der Praxis als Kopie der Akte durch `owner`
(OPS-006, `patient_record.exported`); die Plattform ändert ihn nicht.
13. **Vertretung ist ein Zugang mit eigenem Konto** (eigene Person, Adresse, Passkey) zum Verhältnis
der vertretenen Person. Gehört das Konto nicht zur Person des Verhältnisses, braucht der Zugang Art
und Nachweisvermerk, wer welches Dokument wann sah *(Fassung 2: Ausweis der vertretenden Person, bei
rechtlicher Vertretung Vollmacht, Betreuerausweis oder Sorgerechtsnachweis; gespeichert wird nichts
davon, kein Scan, keine Ausweisnummer)*. Zwei Arten (W3): Die **rechtliche Vertretung**
(Sorgeberechtigte, Betreuung mit passendem Aufgabenkreis, Vorsorgevollmacht) darf alles, was die
Person darf, auch Einwilligungen erteilen und widerrufen; die **Begleitung** (Angehörige, Vertraute,
mit dokumentierter Zustimmung der Person) darf lesen sowie Terminwünsche und Nachrichten schreiben,
ohne
Einwilligung, Widerruf oder Datenexport der Person, exportiert aber ihre eigene Wahl zu
Benachrichtigungen (Arten, Wege, Ruhezeit, Geräte, Zustellungen ihres Zugangs), protokolliert wie
jeder Export ohne neue Aktion (Fassung 6). Die Zustimmung zur Begleitung entbindet gegenüber der
begleitenden Person von der Schweigepflicht (§ 203 StGB) und ist eine ausdrückliche Einwilligung
nach Art. 9 Abs. 2 lit. a DSGVO *(Fassung 2)*: konkret (begleitende Person, Bereiche, ob frühere
Nachrichten samt Antworten der Praxis sichtbar sind), informiert, freiwillig, jederzeit widerruflich
(wie Entziehen), nachweisbar (Art. 7 Abs. 1 DSGVO; am besten von der Person unter „Ich", ohne Konto
auf dem Praxisgerät bestätigt mit Vermerk, wer dabei war) und von einer einwilligungsfähigen Person
(bei Zweifel der Praxis nur rechtliche Vertretung; der Zweifel steht an deren Zugang,
`companion_declined_*`, ANN-207, nicht im Auditlog, ohne Diagnose). Wortlaut: POR-EPIC-001b (W6),
geprüft in B2. Zugangsdaten weiterzugeben bleibt verboten (B5, Nutzungshinweise); der erlaubte Weg
muss der leichtere sein, eine Begleitung ist vor Ort in zwei Minuten eingerichtet.
14. **Vertretung ist sichtbar und unterscheidbar:** Jeder Vorgang über einen Vertretungszugang trägt
den Zugang im Auditeintrag, Akteur ist das Konto der vertretenden Person, Gegenstand das Verhältnis
der vertretenen (B5 Rahmensatz 1); `list_audit_events` muss Plattformkonten und Vertretungen
unterscheidbar zeigen, mit neuen Werten neben den alten (ADR-010 Punkt 4). Die Ansicht zeigt
dauerhaft „Sie handeln für …". Hat die vertretene Person ein Konto, sieht sie unter „Ich", wer für
sie Zugang hat, und kann dort eine Begleitung beenden; eine rechtliche Vertretung beendet nur die
Praxis.
15. **Minderjährige haben keinen eigenen Zugang** (W4): Unter 18 Jahren gibt es nur die rechtliche
Vertretung durch Sorgeberechtigte, deren Wirkung aus dem Sorgerecht mit dem 18. Geburtstag endet;
das prüft der Server am Geburtsdatum, nicht die Oberfläche, die Grenze ist eine Zahl an einer Stelle
(`app.platform_min_age_years`, gerechnet in `app.majority_date`).
16. **Wer eine Rechnung empfängt, hat deshalb noch keinen Zugang** (ADR-009: Rechnungsempfänger ≠
Patient:in) und sieht sie nur, wenn er zugleich Vertretung ist. Die behandelte Person sieht ihre
eigenen Rechnungen auch, wenn sie an jemand anderen adressiert sind (DSN-001 D3).
17. **Sitzungen führt der Anmeldedienst, für alle Konten gleich:** ein Projekt, eine Konfiguration;
`jwt_expiry`, Rotation der Erneuerungstoken und Passkey-Einstellungen gelten für Praxis- und
Plattformkonten gleich (Fassung 4). Keine eigene Sitzungsregel der Plattform (§3.4), die
Sitzungssperre regelt ADR-025.
18. **Was an der Plattform anders ist:** keine Anmeldung allein per Mail-Link (Fassung 4: Passkey,
Punkt 7). Ein zweiter Faktor ist einrichtbar, nicht verlangt (ANN-028), dessen Warnhinweis entfällt
für Konten mit Passkey. „Abmelden" unter „Ich" beendet die Sitzung auf diesem Gerät (ANN-045),
„Überall abmelden" steht daneben. Sperren und Entziehen wirken bei der nächsten Anfrage, auch bei
noch gültigem Zugriffstoken: Jede Plattformprojektion liest den Zustand des Zugangs wie die
Praxispfade `is_active` (ANN-044). Ohne Netz geht nur die Durchführung (ADR-024 Punkte 4 und 5).
19. **Die Plattform liest und schreibt nur über Plattformprojektionen,** Funktionen, die den Zugriff
aus `auth.uid()` über einen aktiven Zugang zum Verhältnis ableiten; eine Kennung aus dem Browser
wählt höchstens unter den eigenen Zugängen und gewährt nie etwas. Für Plattformkonten gibt es keine
Tabellen-Policy auf Praxistabellen und kein direktes `SELECT` (ADR-004 Punkt 5). Der Wächter kennt
nur den eigenen aktiven Zugang der Person oder ihrer Vertretung (Fassung 7).
20. **Der Selbstzugriff über `person_id` entfällt:** Die Klauseln mit `app.current_person_id()` in
`patients_select_scoped`, `persons_select_scoped`, `patient_contact_details_select_scoped` und
`log_patient_record_view` werden auf Praxiskonten beschränkt oder gestrichen. Selbstbezüge von
Mitarbeitenden (`staff_private_details`, Textbausteine, Vergütung) gehören zum Praxiskonto und
bleiben.
21. **Praxispfade verweigern Plattformkonten, ein Test beweist es für alle:** `organizations`,
`locations` und `roles` nur für Praxiskonten, das Nötige liefert eine Projektion. Ein Test in
`pnpm test:db` meldet ein Plattformkonto in jedem Zustand an und verlangt für alle Tabellen aus
`pg_tables` und alle an `authenticated` freigegebenen Funktionen, auch neue: keine Zeile, jeder
Aufruf abgewiesen; ausgenommen nur Plattformprojektionen und Funktionen für jedes Konto, als Liste
im Test, deren Einträge Teil des Reviews sind.
22. **Was für die Plattform bestimmt ist, steht am Objekt, nicht in der Oberfläche:** eine Rechnung,
weil sie gestellt ist, ein Dokument, weil es einzeln freigegeben ist (DSN-001 D3), ein Termin ohne
interne Notiz, ein Plan, weil er der Person zugewiesen ist. Jede Projektion gibt nur die Felder
einer festen Liste heraus; Befund, Behandlungsdokumentation, interne Notizen und Patientenfotos
kommen in keiner vor (ADR-017 Punkt 37).
23. **Jede Plattformprojektion hat ihre Negativfälle** (ADR-013 Fassung 4, Punkt 9 Nr. 1): fremde
Person; anderes Verhältnis derselben Person ohne Zugang (anderer Leistungsbereich); Zugang
`invited`, `locked` und `revoked`; abgelaufene Lesefrist (D2); Praxiskonto; andere Organisation; bei
Einwilligung, Widerruf und Export zusätzlich die Begleitung.
24. **Protokolliert wird, was nachzuweisen ist** (W5): jede Änderung an einem Zugang und jeder
abgewiesene Versuch dazu (G6c), jeder Schreibvorgang der Person (Wunsch, Nachricht, Einwilligung,
Widerruf), jeder Datenexport und jeder Zugriff über eine Vertretung, auch lesend. *(Fassung 3)* Für
den Abruf freigegebener Dokumente gilt ADR-010 Punkt 22. Das bloße Lesen der eigenen Daten durch
die Person wird nicht einzeln protokolliert (Art. 5 Abs. 1 lit. c DSGVO).
25. **Eine Anwendung, zwei Oberflächen:** kein zweites Deployment, keine zweite Anwendung oder
Subdomain (ADR-015 Punkt 1). Das Gate unterscheidet nach Kontoart: Praxiskonten bekommen die
Praxisoberfläche, Plattformkonten das Gerüst aus DSN-001 unter eigenem Pfadpräfix, nie Seitenleiste,
Funktionssuche oder Praxisbegriffe. Die Weiche im Router dient der Bedienung, der Schutz liegt in
den Punkten 19 bis 21. Ein Praxiskonto sieht das Plattformgerüst nicht, auch nicht als Vorschau
(Fassung 7; dafür Punkt 6).
26. **Der Plattformcode ist ein eigenes Feature** unter `src/features/` (ADR-015 Punkt 23) und
spricht nur Plattformprojektionen an; ein Test oder eine Lint-Regel prüft, dass er keine
Datenzugriffe der Praxisfeatures importiert. Gemeinsam sind nur Komponenten, Begriffe und `marke/`.

## Konsequenzen
- **Der Löschlauf lernt das Konto:** Fällt das Verhältnis im Löschlauf, endet sein Zugang, und das
Konto fällt nach Punkt 5 auch beim Anmeldedienst, damit es keine `persons`-Zeile einer gelöschten
Akte hält (`app.delete_patient_record`). Der Nachweis läuft ohne Inhalt aus dem Verhältnis weiter:
nicht an der `persons`-Zeile der Person und ohne ihren Namen, mit der Kennung des Verhältnisses wie
ein Auditeintrag, bei einer Vertretung mit dem Namen der vertretenden Person; ein Test in
`retention-run` beweist es.

## Offene Folgefragen
- offen: B5 (OPEN_DECISIONS, ANFRAGEN Fragen 1 bis 4); bis dahin gelten Punkte 5, 11, 13 vorläufig.
- Tod der Vertretenen, Aufhebung der Betreuung: Vorschlag, Entzug durch die Praxis, sobald bekannt.
- Zugang mit Praxiskonto, wenn eine Mitarbeiterin in Behandlung ihre Übungen sehen will? W1 b:
zweites Konto, `unique (organization_id, person_id)` fällt; c: Umschalter.

## Änderungshistorie
- Fassung 1 (2026-09-30, Jannes): angenommen, W1 bis W6 wie empfohlen.
- Fassung 2 (2026-09-30, Jannes): Konto 30 Tage, Zugang mit Nachweis drei Jahre statt zwölf Monate
(Punkt 5), bestätigte Mailadresse, Ausweis und Vollmacht ansehen, Bedingungen der Begleitung
(Punkte 11, 13).
- Fassung 3 (2026-10-09, Jannes, BEF-138, ANN-249): Punkt 24 ohne Dokumentabruf.
- Fassung 4 (2026-10-10, Jannes): Passkey statt E-Mail und Kennwort (ADR-025 Fassung 2).
- Fassung 5 (2026-10-14, E-001, Befund B11): Einsicht der Praxis (D7) für `owner`, nur lesend.
- Fassung 6 (2026-10-20, Jannes, BEF-189): Export der Begleitung (Punkt 13).
- Fassung 7 (2026-10-26, Jannes): Einsicht der Praxis entfällt (Punkte 19, 25).
- Fassung 8 (2026-10-27, Jannes): Trainingszugang aus dem Vertrag ohne Einladung (Punkte 7, 11,
ANN-291).
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
