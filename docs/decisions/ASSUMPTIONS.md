# Annahmenregister
Zuletzt aktualisiert: 2026-10-30.

Begründete, **vorläufige** Festlegungen, die weder `PROJECT_PRINCIPLES.md` noch ein ADR noch die
Spezifikation trifft (§15.1, Rang 4). Eine Annahme füllt eine Lücke und überschreibt nichts; sie
DARF NICHT einer MUSS- oder DARF-NICHT-Anforderung widersprechen und keine Sicherheits- oder
Datenschutzmaßnahme aufweichen. Was das bräuchte, ist eine Änderungsanfrage an Jannes. Überbrückt
eine Annahme einen Punkt aus `OPEN_DECISIONS.md`, bleibt der Punkt dort offen.

**Aufbau.** Das **Prüfpaket** (Datenschutz und Recht), die offenen **Fachregeln** (Praxisprozess
und Technik, die das Bauen tragen) und die **übrigen Einträge** als Tabellenzeile, darunter jede
Fachregel, die Jannes entschieden hat. Jede Kennung steht genau einmal und wird nie neu vergeben.
Den früheren Wortlaut hält Git (`git log -p -- docs/decisions/ASSUMPTIONS.md`, die entschiedenen
Fachregeln `git show 676e6b6:docs/decisions/ASSUMPTIONS.md`); Einzelmigrationen vor der Basis vom
2026-10-25 zeigt `git show aabe5d0:<pfad>`.

**Statuszeile** `Kategorie · Status · Datum · Instanz · Zusatz · Wiedervorlage`:

- Kategorie `Datenschutz`, `Recht`, `Praxisprozess` oder `Technik`; lässt ein Eintrag eine Frage an
  Datenschutz-, Rechts- oder Steuerprüfung offen, ist er `Datenschutz` oder `Recht`.
- Status `offen` (umgesetzt, unbestätigt), `entschieden (Jannes)` (zählt fürs Bauen, bei
  Datenschutz und Recht nicht als Prüfung), `bestätigt (Prüfung)`, `geändert`, `verworfen` (nennt,
  was stattdessen gilt) oder `in ADR überführt`. Instanz: wer entschieden hat. Im Prüfpaket setzt
  erst die Prüfung einen abschließenden Status; steht die Regel schon in einem ADR, nennt sie den Punkt.
- Zusatz `Prüfpaket` genau dann, wenn Datenschutz oder Recht und nicht verworfen; sonst `erledigt`,
  bei `offen` `—`.

**Neuer Eintrag:** Kopf, Statuszeile und ein Absatz, höchstens 800 Bytes; im Prüfpaket
**Annahme**, **Grundlage**, **Anker** und **Rücknahme**, als Fachregel **Regel**, **Grundlage** und
**Anker**; entscheidet Jannes eine Fachregel, wird sie zur Tabellenzeile. Aufwand der Rücknahme:
`klein` (eine Stelle), `mittel` (ein Modul oder eine Migration ohne Datenumzug), `groß` (mehrere
Module oder Datenumzug). Jannes bestätigt nur Annahmen mit Aufwand `groß` oder einen Praxisprozess
nach §2.3; die PR fragt danach. Die Stelle, an der eine Annahme greift, nennt ihre Kennung im
Kommentar; `pnpm docs:check` prüft Anker, Zusatz, Grenzen.

**Prüfpaket:** Vor Produktivstart MUSS jeder Eintrag dort auf `bestätigt (Prüfung)`, `geändert`,
`verworfen` oder `in ADR überführt` stehen (ADR-007; ROADMAP M3). Wer prüft, nennt die
Wiedervorlage; die Rücknahme sagt vorab, was eine andere Festlegung kostet.

## Prüfpaket
### ANN-001 — Interne Fristen des Retention Schedule gelten vorläufig
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (DSFA vor Produktivstart)\
**Annahme.** Fristen ohne gesetzliche Vorgabe sind interne Initialentscheidungen und gelten bis zur Prüfung; das steht im Retention Schedule von ADR-008 und in ADR-011 Punkt 4. Das Auditlog hat zwei Klassen. Ob der Anbieter die 30 Tage der Betriebslogs einhält, ist offen (ROADMAP R9). **Grundlage.** Art. 5 Abs. 1 lit. e DSGVO; ADR-010 Punkt 18; Entscheidung Jannes 2026-10-02. **Anker.** `public.retention_classes`, `BETRIEBSLOG_FRIST_TAGE` in `src/lib/protokoll.ts`. **Rücknahme.** Frist per Migration in `public.retention_classes` und in ADR-008 ändern · Aufwand `klein`.

### ANN-003 — Hausbesuch kopiert die Adresse in den Termin
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (DSFA vor Produktivstart)\
**Annahme.** Bei der Anlage eines Hausbesuchs wird die Patientenadresse in `appointments.visit_*` kopiert; vergangene und abgesagte Termine behalten sie, abgesagte bis zur Löschung nach `termin_ohne_nachweis`. Künftige bestätigte Hausbesuche mit abweichender Adresse nennt die Akte und ändert sie nur auf Auftrag, ohne Auditeintrag. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO; ADR-010 Punkt 15 und 16; Entscheidung Jannes 2026-10-02. **Anker.** `public.update_home_visit_addresses`. **Rücknahme.** Adresse bei Absage leeren in `public.cancel_appointment` · Aufwand `klein`.

### ANN-008 — Finalisierungsfrist zählt ab Behandlungs- oder späterem Anlagetag
Datenschutz · entschieden (Jannes) · 2026-09-08 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Zeitpunktbegriff); Jannes nach den ersten Wochen (Zahl)\
**Annahme.** Die Frist ist eine praxisweite Zahl von Kalendertagen (0 bis 30, Vorgabe 1) und endet um Mitternacht der Praxiszeitzone nach dem N-ten Tag nach dem Behandlungstag oder dem späteren Anlagetag; setzen darf sie nur `owner`. `finalized_at` ist der Zeitpunkt der Festschreibung, nicht das Fristende. **Grundlage.** ADR-016 Punkt 7; §630f Abs. 1 S. 1 BGB. **Anker.** `app.documentation_deadline`. **Rücknahme.** Anderer Bezugstag oder eine Uhrzeit: `app.documentation_deadline` ersetzen · Aufwand `klein`.

### ANN-009 — Systemvorgänge stehen im Auditlog ohne Person
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (DSFA vor Produktivstart)\
**Annahme.** Auditeinträge ohne handelnden Account (Löschlauf, am Server verworfene Datei, Einrichtung der Organisation) tragen `actor_kind = 'system'` ohne `actor_user_id`; die Ansicht zeigt „System“. Die automatische Finalisierung trägt keine finalisierende Person ein. **Grundlage.** Art. 5 Abs. 1 lit. d DSGVO; ADR-010 Punkt 3; ADR-016 Punkt 1; Entscheidung Jannes 2026-10-02. **Anker.** Constraint `audit_log_actor_consistent`. **Rücknahme.** Pseudo-Account statt Systemakteur · Aufwand `mittel`, nicht empfohlen.

### ANN-010 — Interne Versorgungsangaben: organisatorisch, alle Praxisrollen, Frist der Akte
Datenschutz · entschieden (Jannes) · 2026-09-08 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (DSFA vor Produktivstart)\
**Annahme.** Zugangshinweis, Besonderheit, Bemerkung und feste Therapeut:in sind organisatorische Angaben ohne klinischen Inhalt; offen, ob in „Besonderheit“ Gesundheitsdaten geraten. `public.patient_care_details` lesen alle vier Praxisrollen, nicht Patientenkonto und `anon`; nie in Logs. Klasse `patientenakte`. **Grundlage.** §4.3 und §4.6 PROJECT_PRINCIPLES.md; ADR-008; ADR-011; Entscheidung Jannes 2026-09-08. **Anker.** Policy `patient_care_details_select_directory_only`. **Rücknahme.** Engere Rollen: Policy ersetzen · Aufwand `klein`.

### ANN-011 — Verordnung: zwei Projektionen, alle Praxisrollen lesen und schreiben
Datenschutz · entschieden (Jannes) · 2026-09-28 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2), mit E15\
**Annahme.** Die Verordnung wird organisatorisch und klinisch (dazu Diagnose, Therapieziel, Hinweis, Empfehlung) ausgeliefert. Alle vier Praxisrollen lesen und schreiben beide; Ziel, Hinweis, Empfehlung räumen nur therapeutische Rollen ab; Lesen steht als „Akte geöffnet“ je Tag im Auditlog. Klasse `patientenakte`. **Grundlage.** Art. 9 DSGVO; ADR-004 Punkt 3; ADR-010 Punkt 16; Entscheidung Jannes 2026-09-28. **Anker.** `app.can_write_treatment_bases`, `app.can_clear_treatment_basis_clinical_texts`. **Rücknahme.** Rollenschnitt in der `app.can_*`-Funktion · Aufwand `klein`.

### ANN-013 — Verordnerkartei: berufliche Kontaktdaten Dritter, Frist offen
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Verarbeitungsverzeichnis, Art. 14 DSGVO)\
**Annahme.** `public.prescribers` hält berufliche Kontaktdaten verordnender Ärzt:innen, kein Gesundheitsdatum, ohne LANR und BSNR; lesen dürfen nur Praxisrollen. Sie bleibt, solange eine Grundlage verweist; die Frist danach ist offen (Klasse `verordnerkartei`). **Grundlage.** Art. 6 Abs. 1 lit. b und f, Art. 5 Abs. 1 lit. c DSGVO; ADR-008 Punkt 2; Entscheidung Jannes 2026-10-02. **Anker.** Policy `prescribers_select_staff_only`. **Rücknahme.** Löschregel mit Frist ergänzen · Aufwand `klein`.

### ANN-014 — „Empfehlung zum Verordnungsende“ stammt von der Therapeut:in, nie vom System
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; MDR-Abgrenzung (B1, ADR-006 Punkt 7)\
**Annahme.** Die Empfehlung schreibt die Therapeut:in im Therapiebericht mit Name und Tag; Bestandstexte an der Grundlage bleiben. Die Anwendung erzeugt, ergänzt und bewertet sie nicht und zeigt daneben nur den Kontingentstand, ohne Ampel, Prognose oder Erinnerung. **Grundlage.** ADR-006 Punkt 2 und 4; Entscheidung Jannes 2026-10-02. **Anker.** `therapy_reports.recommendation`. **Rücknahme.** Feld umbenennen oder entfernen · Aufwand `klein`; eine Bewertung wäre `MDR_REVIEW_REQUIRED` (ADR-006 Punkt 6).

### ANN-016 — Koordinate als abgeleitetes Stammdatum der Adresse
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (DSFA Kartendienst)\
**Annahme.** Geocodiert wird nur beim Anlegen oder Ändern einer Adresse; die Koordinate liegt mit Klasse und Frist der Adresse bei ihr; das steht in ADR-019 Punkt 14. Ohne Rückfrage übernommen wird nur ein eindeutiger, hausnummergenauer Treffer (Punkt 37), eine Adressänderung verwirft sie; offen, ob sie bei abgesagten Hausbesuchen fällt. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO; ADR-019 Punkt 13, 14 und 37. **Anker.** `public.set_patient_address_coordinate`, `app.drop_coordinate_on_address_change`. **Rücknahme.** Geocoding je Route · Aufwand `mittel`.

### ANN-018 — Navigations-Handoff übergibt nur Ziel und Fahrradmodus
Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, §203 StGB, Art. 9 DSGVO)\
**Annahme.** Übergeben werden nur Ziel und Fahrradmodus, also die Koordinate, sonst die Anschrift ohne Namen; die URL entsteht erst beim Tippen und wird nie gespeichert; das steht in ADR-019 Punkt 20 bis 22. Ein Tageslink trägt höchstens drei Zwischenziele, der Rest kommt in sichtbare Abschnitte. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO; ADR-019 Punkt 12 und 23. **Anker.** `MAX_ZWISCHENZIELE` in `src/lib/location/navigation.ts`. **Rücknahme.** Handoff streichen, die Tagesliste zeigt die Adresse · Aufwand `klein`.

### ANN-020 — Textbausteine sind Betriebsdaten ohne Patientenbezug und ohne Frist
Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Ein Textbaustein hat keinen Patientenbezug und ist kein Gesundheitsdatum; ohne Spalte für Patient:in oder Termin; gegen Akteninhalte helfen nur Hinweis am Feld und 2 000 Zeichen. Er bleibt, bis die Praxis ihn löscht (Klasse `betriebsdaten`); ein persönlicher fällt mit dem Mitarbeiterdatensatz, Geschriebenes bleibt in der Akte. **Grundlage.** Art. 4 Nr. 1 und Art. 9 DSGVO; ADR-008; ADR-011; Entscheidung Jannes 2026-09-11. **Anker.** `public.treatment_text_snippets`. **Rücknahme.** Wie Aktendaten: Frist und Journal · Aufwand `klein`.

### ANN-021 — Tagesplan: acht Stunden im Speicher der Seite, Ablage nur auf dem Diensttelefon
Datenschutz · entschieden (Jannes) · 2026-10-10 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; Jannes nach dem ersten Feldtag\
**Annahme.** Die zuletzt geladene Tagesliste (nichts Klinisches) bleibt bis zu acht Stunden im Speicher der Seite bis Neuladen, Abmeldung, Tageswechsel; abgelegt wird nur auf dem Diensttelefon mit engerer Feldliste (ANN-361). Papier gibt der Browserdruck: eigene Termine des Tages mit Name, Anschrift, Zugangshinweis, Besonderheit, Telefon; ohne Export, nach dem Tag vernichtet. **Grundlage.** ADR-012 Punkt 9; Entscheidung Jannes 2026-10-09. **Anker.** `TAGESPLAN_VORHALTEDAUER_MS`. **Rücknahme.** Andere Dauer: diese Zahl · Aufwand `klein`.

### ANN-024 — Privatangaben Beschäftigter: Schreibrecht folgt dem Leserecht
Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (TOM)\
**Annahme.** Dienstliche Angaben (Name, dienstliche E-Mail, Diensttelefon, Hauptstandort) darf auch `office` schreiben. Die Privatangaben in `public.staff_private_details` liest und schreibt nur `owner`; lesen darf sie außerdem die Person selbst. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO; §4.7 und §20 PROJECT_PRINCIPLES.md; Entscheidung Jannes 2026-09-11. **Anker.** `app.can_manage_staff_private_details`. **Rücknahme.** Office einbeziehen: Funktion und Lese-Policy gemeinsam erweitern · Aufwand `klein`, berührt §20.

### ANN-025 — Die Anwendung legt keine Authentifizierungskonten an
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Die Anwendung verwaltet nur die Berechtigung: `invite_staff_account` legt die Einladung an, `claim_staff_invitation` bindet ein bestehendes Konto daran. Das Konto entsteht beim Anmeldedienst, Anmeldemails gehen nur an bestehende; ohne passende offene Einladung bleibt es zugriffslos; Übergang bis STAFF-005, das ganz aus der Anwendung einlädt. **Grundlage.** §4.2 und §15.1 PROJECT_PRINCIPLES.md; ADR-015 Punkt 20; Entscheidung Jannes 2026-10-02. **Anker.** `sendeZugangsMail` in `src/features/workforce/staff/konto-api.ts`. **Rücknahme.** Serverfunktion mit `service_role` · Aufwand `mittel`.

### ANN-026 — Die Einladung ist ein Zugangsdatum, 14 Tage gültig, mit eigener Frist
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Frist)\
**Annahme.** Eine Einladung ist ein Zugangsdatum, kein Gesundheits- und kein Beschäftigtendatum nach §20. Sie gilt 14 Tage und läuft ab, statt aufgeräumt zu werden; nach Abschluss fällt sie mit der Klasse `zugangseinladung`. Den Berechtigungsnachweis tragen getrennt die Auditeinträge `staff_account.invited` und `.roles_changed` (Klasse `auditlog`). **Grundlage.** Art. 5 Abs. 1 lit. c und e DSGVO; ADR-008; ADR-010 Punkt 16; Entscheidung Jannes 2026-10-02. **Anker.** `public.invite_staff_account`. **Rücknahme.** Andere Frist in `public.retention_classes` · Aufwand `klein`.

### ANN-028 — Zweiter Faktor einrichtbar, aber nicht erzwungen
Datenschutz · entschieden (Jannes) · 2026-10-06 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (TOM); Jannes nach dem Online-Schalten\
**Annahme.** Der zweite Faktor (TOTP) ist unter „Mein Konto“ einrichtbar, die Anmeldung verlangt ihn nicht: Keine Policy und keine Funktion liest `aal`. Angemeldet wird per Passkey (ADR-025 Punkt 10); Vorrang hat die Sitzungssperre. **Grundlage.** ADR-010 Punkt 10 und 11; ADR-012 (Bus-Faktor 1); Entscheidung Jannes 2026-10-06. **Anker.** Test „setzt heute nichts durch“ in `supabase/tests/staff-accounts.test.ts`. **Rücknahme.** `aal2` in den Policies der Zugangsverwaltung verlangen, erst mit zwei `owner`-Faktoren · Aufwand `klein`.

### ANN-029 — Auditeinträge folgen eigenen Fristen, nicht der Akte
Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (DSFA vor Produktivstart)\
**Annahme.** Ein Auditeintrag fällt nach seiner Klasse, `auditlog_lesen_sicherheit` für Lese- und Sicherheitsereignisse, sonst `auditlog`, unabhängig davon, ob die Akte noch besteht; ihre Löschung löscht die Einträge über Zugriffe auf sie nicht. Ein Legal Hold an der Akte hält sie. **Grundlage.** Art. 5 Abs. 2 und Art. 17 DSGVO; ADR-010 Punkt 18; Entscheidung Jannes 2026-09-11. **Anker.** `app.audit_retention_class`. **Rücknahme.** Einträge der Akte im Löschlauf mitlöschen · Aufwand `klein`.

### ANN-030 — Beschäftigtenstammdaten ohne Frist; Urlaub, Arbeitszeit und Zeitkonto mit eigener
Datenschutz · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; Jannes spätestens vor der ersten Einstellung\
**Annahme.** Mitarbeiterdatensatz, Privatangaben, Wochenplan und Abweichungen ohne Antrag fallen nicht automatisch (Klasse `beschaeftigtendaten`, Frist offen), weil ein Datum des Ausscheidens fehlt. Urlaub, Arbeitszeitänderungen und Zeitkonto haben eigene Fristen (ANN-579, ANN-591, ANN-597). **Grundlage.** Art. 5 Abs. 1 lit. e DSGVO; §20 PROJECT_PRINCIPLES.md; ADR-008; Entscheidung Jannes 2026-09-11. **Anker.** Klasse `beschaeftigtendaten`. **Rücknahme.** Datum des Ausscheidens, Löschregel · Aufwand `mittel`.

### ANN-033 — Legal Hold an Akte oder Beschäftigtendaten, nur `owner`, ohne Pflegeoberfläche
Recht · entschieden (Jannes) · 2026-09-11 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); beim ersten realen Vorgang\
**Annahme.** Eine Löschsperre wirkt auf eine Patientenakte, seit ANN-674 auch auf Beschäftigtendaten einer Person; eine Akte kann mehrere tragen (ANN-150). Nur `owner` setzt und hebt auf, mit Pflichtgrund; Aufheben schreibt Ende und Person fort. Keine Pflegeoberfläche; laufende Sperren zeigt die Aufbewahrungsübersicht. **Grundlage.** ADR-008 Punkt 7; §4.1 PROJECT_PRINCIPLES.md; Entscheidung Jannes 2026-09-11. **Anker.** `public.legal_holds`, `app.can_manage_legal_hold`. **Rücknahme.** Weiterer Gegenstand: `subject_type` erweitern · Aufwand `klein`.

### ANN-034 — Absagegrund als codierte Auswahl, kein Freitext
Datenschutz · entschieden (Jannes) · 2026-09-12 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Der Absagegrund ist eine codierte Auswahl ohne Freitext: Patient:in oder Praxis hat abgesagt, Patient:in oder Praxis hat verlegt, Sonstiger Grund; `moved` gilt nur an Bestandszeilen. Er ist Pflicht für jede neue Absage und steht an der Terminzeile, nicht im Auditlog. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO; §4.6 PROJECT_PRINCIPLES.md; ADR-018 Punkt 6 und 8. **Anker.** Constraint `appointments_cancellation_reason_values`. **Rücknahme.** Weiterer Wert: Constraint und `cancellationReasonLabels` · Aufwand `klein`; Freitext · Aufwand `mittel`.

### ANN-035 — No-show fällt unter die Frist der Absagen; mit Gebührenanlass wird nicht gelöscht
Recht · entschieden (Jannes) · 2026-09-16 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); Steuerberatung (B4)\
**Annahme.** Ein No-show ohne Behandlungsnachweis fällt wie eine Absage mit der Klasse `termin_ohne_nachweis`, ab dem Vermerk; trägt er einen Gebührenanlass, auch einen verzichteten, wird er nicht gelöscht. Das steht in ADR-018 Punkt 8 und im Retention Schedule von ADR-008. **Grundlage.** §147 AO; §257 HGB; ADR-008; ADR-018 Punkt 8. **Anker.** Bedingung `fee_basis is null` in `public.apply_retention`. **Rücknahme.** Rechnung statt Gebührenanlass als Haltegrund in `public.apply_retention` · Aufwand `klein`.

### ANN-039 — Terminzettel: nur Termine, Aufruf als „Akte geöffnet“
Datenschutz · entschieden (Jannes) · 2026-09-12 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Der Terminzettel nennt den Namen und je bevorstehendem bestätigtem Termin Datum, Uhrzeit, Ort und behandelnde Person, nie Status, Verordnung, Diagnose, Inhalt oder Hausbesuchsadresse. Sein Aufruf steht als „Akte geöffnet“ einmal je Person, Akte und Tag im Auditlog; erst „Wurde der Zettel ausgehändigt?“ schreibt den Mitteilungsvermerk. Versand: ANN-041. **Grundlage.** Art. 5 Abs. 1 lit. c und d DSGVO; ADR-010 Punkt 16. **Anker.** `public.list_patient_appointment_slip`. **Rücknahme.** Spaltenliste und Darstellung ändern · Aufwand `klein`.

### ANN-040 — Mitteilungsvermerk: vier Wege, gültig bis zur nächsten relevanten Änderung
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); Weg `email` mit B15\
**Annahme.** Ein Termin trägt den Vermerk, ob und wie er mitgeteilt wurde: persönlich, telefonisch, Terminzettel ausgehändigt oder per E-Mail, ohne SMS und Messenger. Er gilt bis zur nächsten für die Patient:in relevanten Änderung (Zeit, Art, Ort, Adresse, Person, Absage); wer ihn setzte, steht am Vermerk, nicht im Auditlog. **Grundlage.** §3.5 PROJECT_PRINCIPLES.md; ADR-010 Punkt 16; Entscheidung Jannes 2026-10-02. **Anker.** `app.appointment_notification_channels`. **Rücknahme.** Weg ergänzen oder streichen: Constraint und Text · Aufwand `klein`.

### ANN-041 — Termin-E-Mail als Handoff ins eigene Mailprogramm
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Auf Aktion entsteht eine `mailto:`-Adresse mit den Feldern des Terminzettels und neutralem Betreff, ohne Versand und Speicherung. Vorher stehen Text, Empfänger und ein Hinweis auf fehlende Verschlüsselung da; erst die Rückfrage danach vermerkt. Restrisiko: Nach DSK ist das Schutzniveau nicht abdingbar; es trägt Datenminimierung, ein Wunsch wird nicht vermerkt (PAT-006). **Grundlage.** Art. 5 Abs. 1 lit. c, Art. 9 DSGVO; DSK-Orientierungshilfe 2021; §3.5. **Anker.** `src/features/calendar/appointments/terminmail.ts`. **Rücknahme.** `TermineMailen` entfernen · Aufwand `klein`.

### ANN-043 — Auth-Links werden über den `token_hash` eingelöst, nie über die Adresszeile
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); Providerprüfung (Auth-Mails)\
**Annahme.** Auth-Mails tragen den einmaligen `token_hash` im Fragment; eingelöst wird mit `verifyOtp`, `detectSessionInUrl` bleibt `false`. Einlöseseiten sind `/zugang` und `/einladung`; der Code gilt eine Stunde, wird einmal gelesen und nie protokolliert; Fehler verraten keinen Kontobestand. **Grundlage.** §3.4 und §16 PROJECT_PRINCIPLES.md; ADR-025 Punkt 9 und 13; Entscheidung Jannes 2026-10-02. **Anker.** `src/features/core/auth/linkEinloesen.ts`. **Rücknahme.** Zurück auf `detectSessionInUrl: true` · Aufwand `klein`.

### ANN-044 — „Alle Sitzungen beenden“: Vermerk vorab, ohne den Vorgang aufzuhalten
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); `jwt_expiry` mit der Providerprüfung\
**Annahme.** Vor „Alle Sitzungen beenden“ steht `account.sessions_ended` als Vermerk des Versuchs; scheitert er, werden die Sitzungen trotzdem beendet, der Fehlschlag steht im Betriebslog. Restfenster: Ein ausgestelltes Zugriffstoken gilt bis `jwt_expiry`, sofort wirkt nur die Sperre des Zugangs. **Grundlage.** ADR-010 Punkt 16; ADR-025 Punkt 3; Entscheidung Jannes 2026-10-02. **Anker.** `meldeVersuch` in `src/features/workplace/account/api.ts`. **Rücknahme.** Restfenster über `jwt_expiry` verkleinern · Aufwand `klein`.

### ANN-052 — Eine Datei verlässt den Speicher nur über eine einmalige Freigabe
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); bei jedem Upgrade der Storage-API\
**Annahme.** Jede Storage-Operation an einer Akten-Datei braucht eine einmalige Freigabe aus `issue_patient_file_link` oder dem Löschauftrag; die RLS lässt nur gegen eine höchstens 30 Sekunden alte Freigabe zu und verbraucht sie. Der Verweis gilt 60 Sekunden und ist nicht entziehbar (OPS-001 Punkt 5); es darf keine UPDATE-Policy auf `storage.objects` geben. **Grundlage.** ADR-010 Punkt 14 und 16; ADR-017 Punkt 15; Entscheidung Jannes 2026-10-02. **Anker.** `app.patient_file_access_grant_ttl`. **Rücknahme.** Andere Wartezeit dort · Aufwand `klein`.

### ANN-060 — Die Bezeichnung einer Fehlzeit ist organisatorisch, geprüft wird am Feld
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (DSFA vor Produktivstart)\
**Annahme.** Die frei benannte Bezeichnung eines internen Termins ist organisatorisch: kein Patientenname, keine Diagnose, kein klinischer Inhalt. Das sichern der Hinweis am Feld und höchstens 120 Zeichen, keine Prüfung des Freitexts; der Titel steht nur an der Zeile und im Kalender, nie im Auditlog, Log oder in der Adresszeile. **Grundlage.** §4.6 PROJECT_PRINCIPLES.md; ADR-010 Punkt 18; ADR-011; Entscheidung Jannes 2026-10-02. **Anker.** Constraint `appointments_kind_fields`. **Rücknahme.** Auswahl aus einer Liste statt Freitext · Aufwand `mittel`.

### ANN-061 — Die Kopfleistensuche findet Funktionen und Namen, keine klinischen Inhalte
Datenschutz · entschieden (Jannes) · 2026-09-18 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (DSFA vor Produktivstart)\
**Annahme.** Die Suchleiste findet Funktionen (im Browser, aus der Navigation) und Namen von Patient:innen (`search_patients`, ab drei Zeichen, Obergrenze in der Datenbank), Funktionen zuerst, nie gemischt. Klinische Inhalte findet sie nicht, und ein Name steht nie in der Adresszeile. **Grundlage.** ADR-004 Punkt 6; ADR-011; Entscheidung Jannes 2026-09-18. **Anker.** `public.search_patients`, `src/app/Funktionssuche.tsx`. **Rücknahme.** Namen aus der Leiste nehmen · Aufwand `klein`.

### ANN-063 — Beim Umbenennen einer Tabelle zieht die Migration das Löschjournal mit
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (DSFA)\
**Annahme.** Benennt eine Migration eine Tabelle um, schreibt sie den Namen in `deletion_journal.target_table` und `retention_assignments.table_name` mit um; Zeile, Klasse und Zeitpunkt bleiben, sonst bräche `reapply_deletion_journal` nach einem Restore ab. Offen, ob die Prüfung den Eintrag als Nachweis sieht, der nicht angefasst werden darf. **Grundlage.** ADR-008 Punkt 8; Entscheidung Jannes 2026-10-02. **Anker.** `public.reapply_deletion_journal`. **Rücknahme.** Den alten Namen in einer eigenen Spalte mitführen · Aufwand `mittel`.

### ANN-065 — „Anmerkungen“ ist das organisatorische Feld der Grundlage
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Das Feld „Anmerkungen“ schreibt für beide Bauarten in die organisatorische Spalte `treatment_bases.note`, sichtbar für alle vier Praxisrollen. Therapieziel und Empfehlung nimmt das Formular nicht mehr an, Bestandstexte bleiben unverändert; den Hinweis pflegt die Akte (ANN-214). Offen: Abgeschriebenes vom Rezept in `note`. **Grundlage.** ADR-004 Punkt 3; ADR-020 Punkt 4; Entscheidung Jannes 2026-10-02. **Anker.** `public.update_treatment_basis`. **Rücknahme.** „Anmerkungen“ auf die klinische Spalte, eigenes Feld für Selbstzahler · Aufwand `mittel`.

### ANN-074 — Die Praxis-Stammdaten sind Pflichtangaben, der Umsatzsteuerstatus wird nicht geraten
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Steuerberatung (B4), vor dem ersten Rechnungslauf\
**Annahme.** Je Praxis ein Rechnungsabsender; Name, Anschrift, IBAN und Steuernummer oder USt-IdNr. sind Pflicht. `small_business` hat keine Vorgabe; mit ihr Hinweis statt Steuerausweis. Katalogpreise sind Endpreise, Steuer je Satz herausgerechnet; das Zahlungsziel (Vorgabe 14 Tage) bestimmt die Fälligkeit. **Grundlage.** § 19 und § 4 Nr. 14 UStG; ADR-009 Punkt 10; Entscheidung Jannes 2026-10-02. **Anker.** Constraint `practice_billing_profiles_tax_id_present`. **Rücknahme.** Netto je Zeile in `app.build_invoice_document` · Aufwand `klein`.

### ANN-075 — Rechnungsnummer: je Bereich lückenlos je Kalenderjahr, vergeben beim Ausstellen
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Steuerberatung (B4)\
**Annahme.** Die Nummer entsteht erst beim Ausstellen, je Leistungsbereich ein lückenloser Kreis je Kalenderjahr, jede Nummer einmalig über alle Kreise; das steht in ADR-009 Punkt 8 und 17. Format `Kürzel-Jahr-vierstellig` (`RG-2026-0001`), Kürzel je Bereich aus den Stammdaten; lückenlos ist Praxisregel, keine Pflicht. **Grundlage.** § 14 Abs. 4 Nr. 4 UStG; ADR-009 Punkt 8 und 17. **Anker.** `app.next_invoice_number`. **Rücknahme.** Anderes Format: die `return`-Zeile dort · Aufwand `klein`.

### ANN-079 — Storno ist ein eigenes Dokument, auch bei stehender Zahlung; „storniert“ wird abgeleitet
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Steuerberatung (B4)\
**Annahme.** Storniert wird per eigenem Dokument mit Grund und Nummer aus dem Kreis der Rechnung; es gibt die Leistungen frei, die Korrekturrechnung zeigt per `replaces_invoice_id` zurück. Eine stehende Zahlung sperrt nicht: Der Betrag wird zurückgezahlt oder verrechnet (ANN-215). Offen, ob die Steuerberatung einen eigenen Nummernkreis fürs Storno erwartet. **Grundlage.** ADR-009 Punkte 9 und 17; Abnahme Jannes 2026-10-02. **Anker.** `public.cancel_invoice`. **Rücknahme.** Eigener Nummernkreis fürs Storno · Aufwand `mittel`.

### ANN-082 — Der Befreiungsgrund ist ein fester Text je Steuerkennzeichen
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Steuerberatung (B4)\
**Annahme.** Der Grund der Steuerbefreiung ist ein fester Text je Kennzeichen an der Steuergruppe im Snapshot (`exempt_healthcare`: § 4 Nr. 14 lit. a UStG, `not_taxable`: kein Leistungsaustausch); ohne ihn wird eine Rechnung mit steuerfreiem Posten nicht ausgestellt. Offen sind der Wortlaut und die Einordnung des Ausfallhonorars. **Grundlage.** § 14 Abs. 4 Nr. 8 UStG; ADR-009 Punkt 18; Entscheidung Jannes 2026-10-02 vorbehaltlich B4. **Anker.** `app.tax_exemption_reason`, `app.assert_invoice_tax_lawful`. **Rücknahme.** Anderer Wortlaut: eine Zeile je Kennzeichen · Aufwand `klein`.

### ANN-086 — Ein Instrument ist nur aktiv, wenn sein Lizenzstatus `freigegeben` ist
Recht · entschieden (Jannes) · 2026-09-21 · Jannes · Prüfpaket · Wiedervorlage: Lizenzgeber (B8)\
**Annahme.** Jede Score-Definition trägt `lizenzstatus` (Status, Begründung, Stand); mit `lizenz_erforderlich` oder `ungeklaert` weist das Schema `aktiv` zurück. Für die 18 Vorlagen in `quellen/scores/pdf/` gilt `freigegeben` nach Jannes' Erklärung vom 2026-09-21; sie trägt das Bauen, nicht die Freigabe. **Grundlage.** Urheberrecht an Fragebögen (`IDEA-OUT-001`); Erklärung Jannes 2026-09-21, Beleg offen (B8). **Anker.** `lizenzstatusSchema` in `src/features/clinical/assessments/schema.ts`. **Rücknahme.** Status auf `lizenz_erforderlich`, `aktiv` auf `false` · Aufwand `klein`.

### ANN-088 — Zahlungen verteilen sich kumulativ und anteilig auf die Steuergruppen
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Steuerberatung (B9), wenn sie die Grundlage der Gewinnermittlung benennt\
**Annahme.** Nach Zufluss wird eine Zahlung nach dem Bruttoanteil der Steuergruppen verteilt, in ganzen Cent, Rest an die größten Bruchteile. Verteilt wird kumulativ über die Zahlungen der Rechnung, damit volle Zahlung genau die Gruppen ergibt und eine Rückzahlung ihren Eingang aufhebt. **Grundlage.** ADR-009 Punkt 19; § 366 BGB; Abnahme Jannes 2026-10-02. **Anker.** `app.distribute_to_tax_groups`. **Rücknahme.** Tilgungsbestimmung oder feste Reihenfolge der Kennzeichen · Aufwand `klein`.

### ANN-092 — Die Auskunft nach Art. 15 nennt die Zugriffe auf die Akte, ohne Namen der Beschäftigten
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2), DSFA (G14)\
**Annahme.** Die Auskunft enthält den Abschnitt `access_log`: Zeitpunkt, Aktion, Gegenstand, Ergebnis und Art des Handelnden je erfolgreichem Zugriff, ohne Kennung und Namen der Beschäftigten. Namen nur auf begründetes Verlangen nach Prüfung im Einzelfall, von Hand. **Grundlage.** Art. 15 Abs. 1 und 4 DSGVO; §20; ADR-010 Punkt 13 und 16; Entscheidung Jannes 2026-10-02. **Anker.** `public.export_patient_record`. **Rücknahme.** Namen aufnehmen oder Abschnitt streichen · Aufwand `klein`.

### ANN-093 — Einwilligung je Zweck, eingeholt für E-Mail und Arztbericht
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Die Behandlung braucht keine Einwilligung; die Praxis holt sie für `email_contact` und `prescriber_report` ein, `patient_photos` steht nur zum Widerruf, `message_attachments` regelt ANN-333. Papier bleibt Papier; vermerkt werden Datum und bei der Information die Fassung, ein Widerruf ist eine eigene Zeile. Den Mail-Handoff (ANN-041) prüft sie nicht. **Grundlage.** Art. 9 Abs. 2 lit. h DSGVO; Art. 7 Abs. 1 und 3 DSGVO; § 203 StGB; ADR-017 Punkt 57. **Anker.** Constraint `patient_privacy_records_purpose_check`. **Rücknahme.** Zweck ändern: Constraint · Aufwand `klein`.

### ANN-094 — Ein benannter Schalter öffnet den Kartendienst; in der Produktion nur `released`
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Gate aus ADR-019 Punkt 9\
**Annahme.** `location-provider` fragt einen Anbieter nur bei `LOCATION_DATA_GATE` gleich `synthetic` oder `released`, in der Produktion oder ohne `APP_ENVIRONMENT` nur bei `released`, und die Karte lädt Kacheln nur bei offenem Schalter; das steht in ADR-019 Punkt 35 und 36. **Grundlage.** ADR-019 Punkt 25, 35 und 36; ADR-007 Punkt 5. **Anker.** `richteEin` in `supabase/functions/location-provider/auswahl.ts`. **Rücknahme.** Weitere Stufe oder anderer Name: Konstante und Tests · Aufwand `klein`.

### ANN-096 — Auf der Karte nur Nummern; der Startort gilt für den Seitenbesuch
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Marker der Tagesroute tragen nur eine Nummer (Start „S“), kein Kürzel; Name und Anschrift stehen in der Tourenliste mit derselben Nummer. Startort ist der Standort der Praxis oder der erste Besuch, gewählt für den Seitenbesuch und nicht gespeichert; einen persönlichen Startort gibt es nicht. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO; ADR-019 Punkt 2; §20. **Anker.** `kartenmarker` in `src/features/calendar/tours/tagesroute.ts`. **Rücknahme.** Kürzel statt Nummer: `kartenmarker` und Test · Aufwand `klein`.

### ANN-104 — Hervorgehoben werden acht Fragen des Anamnesebogens, je Frage und ohne Verknüpfung
Recht · entschieden (Jannes) · 2026-09-26 · Jannes · Prüfpaket · Wiedervorlage: externe MDR-Prüfung (B1)\
**Annahme.** Hervorgehoben werden festgelegte Angaben zu den Fragen 4, 23 bis 26 und 28 bis 30 des Anamnesebogens nach Rahmenwerken der IFOMPT: wörtlich mit Frage, Datum und Regel samt Quelle, ohne Deutung, Ampelfarbe, Zählung oder Verknüpfung, nur am geltenden Bogen. **Grundlage.** §7.1; ADR-006 Punkt 3, 11 und 13; Regeln fachlich bestätigt von Jannes 2026-09-26. **Anker.** `src/features/clinical/assessments/hervorhebung.ts`. **Rücknahme.** Andere Fragen: Liste in der Definition, neue Version · Aufwand `klein`.

### ANN-116 — Die Behandlungsliege ist eine organisatorische Angabe der Person, gezeigt am Hausbesuch
Datenschutz · entschieden (Jannes) · 2026-10-05 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** „Behandlungsliege mitnehmen“ ist ja, nein oder leer (nicht entschieden) an der Person, kein Befundinhalt, mit Rollen und Frist der internen Versorgungsangaben (ANN-010). Der Server liefert sie am Behandlungstermin, die Oberfläche zeigt sie nur am Hausbesuch; Änderungen schreiben keinen Auditeintrag. **Grundlage.** Art. 9 DSGVO (mittelbar Gesundheitsdatum); ADR-004; ADR-010 Punkt 16; Entscheidung Jannes 2026-10-05. **Anker.** `public.set_treatment_table_required`. **Rücknahme.** Ohne Office: eigene Rollenfunktion und Projektion · Aufwand `mittel`.

### ANN-121 — Der Therapiebericht ist ein gespeicherter Datensatz und friert beim Abschluss als Snapshot ein
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Ein Bericht hängt an einer Verordnung und ist `entwurf` oder `abgeschlossen` (Snapshot, per Trigger unveränderlich); eine Korrektur ist ein neuer Bericht mit `supersedes_report_id` und Grund. Der Browserdruck ist ein Export (`therapy_report.exported`); eine Verordnung mit Bericht ist nicht löschbar. **Grundlage.** § 630f BGB; Art. 15 DSGVO; ADR-010 Punkt 16; Entscheidung Jannes 2026-10-02. **Anker.** `public.complete_therapy_report`, `app.therapy_report_unveraenderlich`. **Rücknahme.** Nur Druckansicht: Tabelle zurückbauen · Aufwand `mittel`.

### ANN-123 — Der Briefkopf kommt aus den Praxis-Stammdaten, ohne Steuer- und Bankangaben
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Kopf und Absender des Berichts tragen Name, Anschrift, Telefon und E-Mail aus `practice_billing_profiles`, fehlen sie, nur den Namen der Organisation. Dafür liest die Serverfunktion diese Felder auch für therapist und team_lead, nie Steuernummer und Bankverbindung. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO; ADR-004; ADR-013 Punkt 9; Entscheidung Jannes 2026-10-02. **Anker.** Schlüssel `praxis` in `app.therapy_report_dokument`. **Rücknahme.** Nur der Name der Organisation: den Zweig streichen · Aufwand `klein`.

### ANN-124 — Die Anwendung verschickt keinen Bericht; ob er an die Verordner:in gehen darf, entscheidet die Praxis
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Den Bericht druckt, speichert oder faxt die Praxis außerhalb der Anwendung; ob eine Schweigepflichtentbindung vorliegt, prüft die Anwendung beim Druck nicht, sie sagt nur „Die Anwendung verschickt nichts“. Die Grundlage der Übermittlung klärt B2 vor dem ersten echten Bericht. **Grundlage.** § 203 StGB; ADR-002; §15.2; Entscheidung Jannes 2026-10-02. **Anker.** `src/features/clinical/therapy-reports/TherapieberichtDruckPage.tsx`. **Rücknahme.** Vermerk „Einwilligung liegt vor“ als Bedingung am Druck · Aufwand `klein`.

### ANN-125 — Beim Entfernen der Metadaten bleiben nur Ausrichtung und, was der Dekoder braucht
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Vor jedem Upload eines JPEG oder PNG entfernt das Gerät nach einer Erlaubnisliste alle Metadaten außer Ausrichtung, Adobe-Segment und PNG-Farbangaben, Unbekanntes wird abgewiesen; ein Profil, das nicht sRGB ist, rechnet es vorher nach sRGB um. Der Server prüft dieselbe Liste. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO; ADR-017 Punkt 34, 49 und 53; Entscheidung Jannes 2026-10-02. **Anker.** `bereinigeJpeg`, `PNG_BEHALTEN` in `src/lib/dateien/metadaten.ts`. **Rücknahme.** Ein Segment mehr oder weniger: eine Bedingung · Aufwand `klein`.

### ANN-126 — Vorhandene Foto-Arbeitshilfen: höchstens zwölf Monate, gesperrt, sobald fällig
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2) und DSFA\
**Annahme.** Neue Fotos als Arbeitshilfe nimmt der Server nicht mehr an (ADR-017 Punkt 57). Vorhandene fallen zwölf Monate nach der Aufnahme, spätestens drei Monate nach dem festgehaltenen Abschluss der Versorgung und sofort beim Widerruf; ab Fälligkeit sind sie gesperrt, ein Legal Hold hält die Löschung an. **Grundlage.** Art. 9 Abs. 2 lit. a, Art. 5 Abs. 1 lit. e DSGVO; ADR-017 Punkte 35 und 38. **Anker.** Klasse `patientenfoto` in `public.retention_classes`. **Rücknahme.** Frist der Klasse ändern · Aufwand `klein`.

### ANN-127 — Eine Ablehnung ist ein eigener Vermerk; Fotoeinwilligung nur noch zum Widerruf
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** `consent_refused` ist ein eigener Vermerk für jeden Zweck, zulässig, solange der Zweck weder erteilt noch abgelehnt ist, und „abgelehnt am …“ gilt als erledigt. Die Fotoeinwilligung wird nicht mehr angeboten; ihr Widerruf löscht nur Foto-Arbeitshilfen, nie Dokumentationsfotos. **Grundlage.** Art. 7 Abs. 4 DSGVO; ADR-017 Punkt 35, 46 und 57; Entscheidung Jannes 2026-10-02. **Anker.** `public.record_patient_privacy_entry`, `einwilligungAngeboten` in `src/lib/einwilligung.ts`. **Rücknahme.** Ablehnung nur für Fotos: eine Bedingung · Aufwand `klein`.

### ANN-128 — Ein Patientenfoto gibt owner als Einzeldatei heraus, mit eigenem Auditereignis
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Die Auskunft führt jedes vorhandene Foto mit seiner Art, auch gesperrte; die Kopie gibt nur `owner` als JPEG je Foto heraus, protokolliert als `patient_file.handed_out` mit `gesperrt`, ein Paket gibt es nicht. Einen Auskunftsvorgang prüft die Datenbank nicht. **Grundlage.** Art. 15 Abs. 3 und Art. 20 DSGVO; ADR-017 Punkt 40 und 55; ADR-010 Punkt 16; Entscheidung Jannes 2026-10-02. **Anker.** `public.hand_out_patient_photo`. **Rücknahme.** Strenger: Auskunftsvorgang als Pflichtargument · Aufwand `mittel`.

### ANN-133 — Ein geschlossener Wartelisteneintrag fällt nach der Klasse `warteliste`
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Ein offener Eintrag bleibt, bis er geschlossen wird oder mit der Akte fällt; nach acht Wochen ohne Änderung legt „Warteliste prüfen“ ihn vor, „Noch aktuell“ setzt `updated_at` neu (ANN-220). Ein geschlossener fällt nach der Klasse `warteliste` mit Löschjournal, ein Legal Hold hält an, die Auskunft enthält die Einträge. **Grundlage.** Art. 5 Abs. 1 lit. e DSGVO; ADR-008 Punkt 6 und 7; Entscheidung Jannes 2026-10-02. **Anker.** `public.apply_retention`. **Rücknahme.** Andere Frist: `retention_interval` der Klasse · Aufwand `klein`.

### ANN-134 — Die Warteliste wird beim Lesen und Ändern nicht protokolliert, nur eine Abweisung
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Lesen, Anlegen, Ändern und Schließen eines Eintrags schreiben keinen Auditeintrag; wer anlegt, ändert und schließt, steht am Eintrag (`created_by`, `updated_by`, `closed_by`). Eine Abweisung steht als `access.denied` (`waitlist.read`). Restrisiko: Gesundheitsangaben in der Notiz. **Grundlage.** ADR-010 Punkt 15 und 16; Art. 5 Abs. 1 lit. c DSGVO; Entscheidung Jannes 2026-10-02. **Anker.** `public.list_waitlist_entries`. **Rücknahme.** Leseprotokoll: neue Aktion, nur mit Änderung von ADR-010 (Punkt 17) · Aufwand `klein`.

### ANN-137 — Kurzblick am Termin: aufklappbar, zählt als „Akte geöffnet“, letzter Haupteintrag im Wortlaut
Datenschutz · entschieden (Jannes) · 2026-09-29 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Der Kurzblick steht zugeklappt am Behandlungstermin und wird erst beim Aufklappen gelesen: Zugangshinweis, Besonderheit, feste Therapeut:in, Stand der Grundlage, letzter Haupteintrag im Wortlaut, ein Entwurf gekennzeichnet. Aufklappen schreibt „Akte geöffnet“ einmal je Person, Akte und Tag; ohne Termin- und Dokuleserecht folgt `access.denied`. **Grundlage.** ADR-006 Punkt 2 und 4; ADR-010 Punkt 16; §4.6. **Anker.** `public.get_appointment_brief`. **Rücknahme.** Nur finalisierte Einträge: Bedingung in der Auswahl · Aufwand `klein`.

### ANN-139 — Abrechnungslage am Termin: Position für alle, Empfänger und offene Rechnungen nur für owner und office
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Am Behandlungstermin sehen alle Terminrollen „Termin n von m“ mit der Bauart der Grundlage. Standard-Empfänger und offene Rechnungen der Person (Anzahl, Betrag, Überfälligkeit; offen ab Ausstellung) liefert die Datenbank nur owner und office, ohne Protokoll im Erfolgsfall. **Grundlage.** ADR-004; §4.3; ADR-009 Punkt 2; Entscheidung Jannes 2026-10-02. **Anker.** `public.get_appointment_billing_context`, `app.open_invoices`. **Rücknahme.** Behandelnde sehen „Rechnung offen“ ohne Betrag: eigene Bedingung · Aufwand `klein`.

### ANN-142 — Aufgaben: alle vier Praxisrollen sehen alle, erledigte fallen nach der Klasse `aufgabe`
Datenschutz · entschieden (Jannes) · 2026-09-29 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Alle vier Praxisrollen lesen und schreiben alle Aufgaben der Praxis; die Zuweisung ist keine Sichtgrenze, erledigte fallen nach der Klasse `aufgabe`, offene mit Personenbezug mit der Akte, ein Legal Hold hält an. Titel und Notiz stehen nie im Protokoll, Lesen wird nicht protokolliert, eine Abweisung schon. **Grundlage.** §4.7; Art. 5 Abs. 1 lit. e DSGVO; ADR-008 Punkt 6 und 7; Abnahme Jannes 2026-09-29. **Anker.** `app.can_manage_tasks`. **Rücknahme.** Nur eigene Aufgaben: Bedingung in `list_tasks` und Schreibpfaden · Aufwand `mittel`.

### ANN-144 — Anrufliste: „erreicht“ ist ein Mitteilungsvermerk, „nicht erreicht“ ein Stand am Termin
Datenschutz · entschieden (Jannes) · 2026-09-29 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** „Erreicht“ setzt den Mitteilungsvermerk „telefonisch“; „nicht erreicht“ und „Nachricht hinterlassen“ stehen in `appointment_call_states` (Ergebnis, Versuche, wann, wer), nie an der Person, und fallen nach der Klasse `anrufstand`. Rollen wie beim Mitteilungsvermerk, kein Auditeintrag, der Nachweis ist die Zeile. **Grundlage.** §20; ADR-010 Punkt 15 und 16; Art. 5 Abs. 1 lit. e DSGVO; Abnahme Jannes 2026-09-29. **Anker.** `public.record_call_outcome`. **Rücknahme.** Andere Frist: `retention_interval` der Klasse · Aufwand `klein`.

### ANN-148 — Zusammenführen: ein Abschluss bleibt nur, wenn beide Akten abgeschlossen sind, dann der spätere
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Nach dem Zusammenführen bleibt ein ausdrücklicher Abschluss nur, wenn beide Akten abgeschlossen waren, dann der spätere; Beginn ist der frühere. Einen Versorgungsstatus gibt es nicht mehr (ANN-510), und die Frist rechnet `app.patient_retention_anchor` über die ganze vereinte Akte (ANN-511). **Grundlage.** § 630f Abs. 3 BGB; Art. 5 Abs. 1 lit. e DSGVO; ADR-008 Punkt 11; Entscheidung Jannes 2026-10-02. **Anker.** Abschnitt Versorgungsstand in `app.merge_patients_core`. **Rücknahme.** Getrennte Fristen je Herkunft · Aufwand `groß`.

### ANN-150 — Zusammenführen: nicht rückgängig, alle Legal Holds wandern mit, Nachweis an der Akte und im Journal
Datenschutz · entschieden (Jannes) · 2026-10-26 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; OPS-003\
**Annahme.** Nur owner führt zusammen (`app.can_merge_patients`), nicht rückgängig; jeder Legal Hold der Dublette zieht mit seinem Grund auf die bleibende Akte. Nachweis sind `patient_merge_records` mit `merged_by` und ein Löschjournaleintrag mit `merged_into`, nach einem Restore führt das Journal erneut zusammen. **Grundlage.** ADR-008 Punkte 7, 8, 13; ADR-010 Punkt 15; Entscheidung Jannes 2026-10-02 und 2026-10-26. **Anker.** `app.merge_patients_core`. **Rücknahme.** Rückgängig binnen Frist: Herkunft je Zeile speichern · Aufwand `groß`.

### ANN-152 — Statistik: Auslastung zählt Behandlungs- und Trainingstermine in der Arbeitszeit, nur als Praxissumme
Datenschutz · entschieden (Jannes) · 2026-09-29 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B6)\
**Annahme.** Kennzahl (3) teilt die Minuten nicht abgesagter Behandlungs- und Trainingstermine in der Arbeitszeit durch die Arbeitszeit aller Einplanbaren, für 14 Tage ab heute; interne Termine zählen nicht, „nicht angetroffen“ zählt. Gerechnet je Person und Tag, geliefert nur die Praxissumme; offen, ob sie bei kleinem Team personenbeziehbar ist. **Grundlage.** §20; B6; `IDEA-PRX-025`; Bericht Jannes 2026-09-29. **Anker.** Abschnitt (3) in `public.get_practice_statistics`. **Rücknahme.** Werte je Person erst nach B6 · Aufwand `mittel`.

### ANN-154 — Statistik: Der erfolgreiche Aufruf wird nicht protokolliert, der abgewiesene schon
Datenschutz · entschieden (Jannes) · 2026-09-29 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** `get_practice_statistics` und `get_practice_targets` liefern nur Summen ohne Person; ein erfolgreicher Aufruf und der CSV-Export schreiben keinen Auditeintrag, ein abgewiesener steht als `access.denied` (Operation `statistics.read`). Geänderte Zielwerte weist `practice_targets.updated_by` nach. **Grundlage.** ADR-010 Punkte 15 und 16; Entscheidung Jannes 2026-09-29. **Anker.** `public.get_practice_statistics`, `public.get_practice_targets`. **Rücknahme.** Erfolgreiches Lesen protokollieren: neue Aktion, nur mit Änderung von ADR-010 · Aufwand `klein`.

### ANN-156 — Umsatz je Person: nach Behandlung zugeordnet; owner sieht alle, Beteiligte sich selbst; ohne Protokoll
Datenschutz · entschieden (Jannes) · 2026-10-03 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Art. 88 DSGVO)\
**Annahme.** Der Umsatz nach Rechnungsstellung zählt je Monat für die behandelnde Person, der Rest als „ohne Zuordnung“. `owner` sieht alle, wer Umsatzbeteiligung hat, nur sich, andere bekommen `access.denied`. Der Abruf wird nicht protokolliert; Zeiten, Wege, Ausfälle liest sie nicht. Empfohlen: Beschäftigte vorher nach Art. 13 informieren. **Grundlage.** ADR-010 Punkt 20; Entscheidung Jannes 2026-09-29 (B6). **Anker.** `public.list_revenue_by_staff`. **Rücknahme.** Nach Zahlungseingang zuordnen (ANN-088) · Aufwand `mittel`.

### ANN-172 — Trainingsverhältnisse anlegen, ändern und beenden: owner, Trainingsbetreuung und Büro
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, DSFA Training)\
**Annahme.** Ein Trainingsverhältnis legen `owner`, `trainer` und `office` an, ändern und beenden es; `therapist` und `team_lead` erreichen es weder lesend noch schreibend. Ein abgewiesener Versuch steht als `access.denied` im Protokoll und bekommt HTTP 403. **Grundlage.** `PROJECT_PRINCIPLES.md` §4.8 und §4.9; ADR-021 Punkt 10; Entscheidung Jannes 2026-10-02. **Anker.** `app.can_write_training_relationships`. **Rücknahme.** Büro nur lesend: `office` aus der Funktion nehmen, die Oberfläche folgt `canWriteTrainingClients` · Aufwand `klein`.

### ANN-173 — Das zweite Verhältnis entsteht nur bei owner und Büro, und aus der Akte wird nichts übernommen
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Wer schon eine Akte hat oder im Team ist, bekommt sein Trainingsverhältnis ohne zweite `persons`-Zeile nur durch `owner` oder `office`; der Trainingsbetreuung zeigt der Dublettenhinweis nur Trainingskund:innen. Aus der Akte wird nichts übernommen, auch kein Kontakt, nur Eingaben im Formular. **Grundlage.** ADR-021 Punkte 3 und 7. **Anker.** `public.start_training_for_person`, `public.find_possible_training_duplicates`. **Rücknahme.** Kontakt auf Bestätigung übernehmen: Kopie in `start_training_for_person` · Aufwand `klein`.

### ANN-174 — Der Name gehört der Person: Eine Änderung im Training gilt auch in der Akte
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Ändert die Trainingsbetreuung den Namen einer Trainingskund:in, ändert sie ihn in `persons` und damit auch in einer Akte derselben Person, von der sie nichts weiß. Ist die Person Mitarbeiter:in oder hat ein Konto, ändern ihn nur `owner` und `office`. Kein Auditeintrag; eine Abweisung steht als `access.denied`. **Grundlage.** ADR-021 Punkt 3; ADR-010 Punkt 16. **Anker.** `public.update_training_client`. **Rücknahme.** Name nur ohne weiteres Verhältnis änderbar, sonst Vorschlag an owner: Prüfung in `update_training_client` plus Aufgabe · Aufwand `mittel`.

### ANN-175 — Protokoll im Training: Öffnen einmal je Tag, Trefferliste und Dublettenhinweis nie
Datenschutz · entschieden (Jannes) · 2026-10-03 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Öffnen steht einmal je Person, Verhältnis und Tag als `training_relationship.viewed` (ADR-010 Punkt 16), Trefferliste und Dublettenhinweis nie. Der Dublettenhinweis nennt ein Geburtsdatum nur, wenn es genau das eingegebene ist. Wer Beginn oder Ende setzt, steht nirgends; ein Rückdatieren löst die Frist früher aus (hingenommen). **Grundlage.** ADR-010 Punkte 15 und 16; ADR-021 Punkt 8. **Anker.** `public.get_training_client`, `public.find_possible_training_duplicates`. **Rücknahme.** Trefferliste protokollieren: nur mit Änderung von ADR-010 · Aufwand `klein`.

### ANN-176 — Trainingstermine schreiben owner, Trainingsbetreuung und Büro; zugeordnet wird die Trainingsbetreuung
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Trainingstermine legen `owner`, `trainer` und `office` an, verschieben und sagen sie ab; `therapist` und `team_lead` finden sie über keinen Schreibweg. Betreuen kann, wer aktiv beschäftigt ist und die Rolle `trainer` mit aktivem Zugang hat oder von owner für Training eingeplant wurde (ANN-226). **Grundlage.** ADR-021 Punkt 6; ADR-022 Punkt 11. **Anker.** `app.may_write_appointment_context`, `app.is_assignable_trainer`. **Rücknahme.** Büro nur lesend: `office` aus `app.can_write_training_relationships` · Aufwand `klein`.

### ANN-177 — Hausbesuch im Training: Anschrift aus dem Trainingskontakt, Straße und Hausnummer getrennt
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-021 Punkt 3)\
**Annahme.** Ein Trainingstermin als Hausbesuch übernimmt die Anschrift als Kopie aus `training_contact_details`, nie aus der Akte, auch wenn dieselbe Person eine hat. Straße und Hausnummer stehen dort getrennt und gehen unverändert in den Termin; fehlt ein Teil, wird abgewiesen. **Grundlage.** ADR-021 Punkt 3; ADR-022 Punkt 9; Entscheidung Jannes 2026-10-02 (BEF-111). **Anker.** `app.training_visit_address`, `public.training_contact_details`. **Rücknahme.** Andere Quelle der Kopie: allein `app.training_visit_address` · Aufwand `klein`.

### ANN-178 — Eine Absage im Training setzt kein Ausfallhonorar-Kennzeichen
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Jannes (AGB Personal Training)\
**Annahme.** Wird ein Trainingstermin abgesagt, auch kurzfristig, setzt der Server keinen Gebührenanlass; die Oberfläche fragt nicht nach dem Eingang und nennt kein Ausfallhonorar. Die 24-Stunden-Regel der Behandlung gilt im Training nicht von selbst. **Grundlage.** ADR-022 (offene Folgefrage); ADR-018 Punkt 8; Entscheidung Jannes 2026-10-02. **Anker.** `public.cancel_appointment`, Constraint `appointments_fee_basis_values`. **Rücknahme.** Anlass auch im Training: Constraint um `training` erweitern, Bedingung in `cancel_appointment` · Aufwand `mittel`.

### ANN-180 — Die Trainingsbetreuung sieht im Kalender nur Trainingstermine, andere Belegung anonym
Datenschutz · entschieden (Jannes) · 2026-10-03 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Die Trainingsbetreuung sieht in Kalender und Tagesliste nur Trainingstermine, mit dem Namen aus dem Training; Behandlungs- und interne Termine nicht, belegte Zeiten buchbarer Mitarbeitender nur als Block „belegt“ (Person, Beginn, Ende). Lesen im Kalender schreibt keinen Auditeintrag, eine Abweisung `access.denied`. **Grundlage.** ADR-022 Punkt 11; Entscheidung Jannes 2026-10-02 (BEF-112). **Anker.** `app.may_read_appointment_context`, `public.list_busy_blocks`. **Rücknahme.** Interne Termine zeigen: Zweig `internal` erweitern · Aufwand `klein`.

### ANN-182 — Eine Trainingsrechnung geht an die Kund:in selbst, mit Anschrift aus dem Training, ohne Geburtsdatum
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Empfängerin einer Trainingsrechnung ist stets die Kund:in selbst, mit Name und Anschrift aus dem Trainingskontakt, nie aus der Akte. Sie steht als „Leistung für“, ohne Geburtsdatum. Ohne vollständige Empfängeranschrift stellt der Server keine Rechnung aus. **Grundlage.** ADR-021 Punkt 3; Art. 5 Abs. 1 lit. c DSGVO; § 14 Abs. 4 UStG. **Anker.** `app.build_invoice_document`, `app.assert_invoice_recipient_address`. **Rücknahme.** Eigene Empfänger im Training: Stammdaten am Verhältnis · Aufwand `mittel`.

### ANN-183 — Am Ende seiner Frist fällt das Trainingsverhältnis bis auf die Belege, die ihre steuerliche Frist halten
Datenschutz · entschieden (Jannes) · 2026-10-26 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Endet die Frist `trainingsverhaeltnis`, solange ein Beleg in der Frist `abrechnungsdaten` liegt, bleiben nur Belege, abgerechnete Termine mit Leistungen, Vertrag, Pakete, Verhältniszeile und Name; alles andere fällt, auch Protokolle, Screening und Übungspläne. Jede Löschung steht im Löschjournal. **Grundlage.** ADR-021 Punkt 4; ADR-008 Punkt 2; § 147 Abs. 3 AO. **Anker.** `app.reduce_training_relationship`. **Rücknahme.** Abgerechnete Termine früher löschen: Leistung vom Termin lösen · Aufwand `mittel`.

### ANN-184 — Trainingsprotokolle lesen owner, Trainingsbetreuung und Büro; schreiben nur owner und Trainingsbetreuung
Datenschutz · entschieden (Jannes) · 2026-10-03 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Trainingsprotokolle lesen `owner`, `trainer` und `office`, schreiben, abschließen und nachtragen nur `owner` und `trainer` – steht in ADR-021 Punkt 10. Lesen steht als „Trainingsverhältnis geöffnet“ einmal je Tag; mit echten Daten liest das Büro erst nach der DSFA. **Grundlage.** Art. 9 Abs. 2 lit. a DSGVO; ADR-021 Punkte 6 und 10. **Anker.** `app.can_read_training_protocols`, `app.can_access_training_protocols`. **Rücknahme.** Büro liest nicht: `office` aus der Lesefunktion, ADR-021 Punkt 10 ändern · Aufwand `klein`.

### ANN-188 — Mail-Einladung nur mit Vermerk „Adresse von der Person selbst bestätigt“, gespeichert an der Einladung
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5)\
**Annahme.** Per Mail wird nur an die Adresse im Verhältnis eingeladen, wenn die einladende Person angekreuzt hat, dass die Person sie selbst bestätigt hat; die Einladung speichert Adresse, wer und wann, und bei geänderter Adresse geht nichts hinaus – steht in ADR-023 Punkt 11. **Grundlage.** ADR-023 Punkt 11. **Anker.** `public.invite_platform_access`, Constraint `platform_access_invitations_email_channel`. **Rücknahme.** Bestätigung am Verhältnis statt an der Einladung: zwei Spalten an den Kontakttabellen · Aufwand `mittel`.

### ANN-189 — Ende des Zugangs: Entziehen, Lesefrist oder letzte Einladung; das Konto löscht der Zugangsdienst auf Auftrag
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Ein Zugang endet mit Entziehen, Ende der Lesefrist (30 Tage nach Ende des Verhältnisses bzw. eines Nachsorge-Abos, ANN-274) oder, nie eingelöst, mit seiner letzten Einladung; fällt das Verhältnis, sofort. 30 Tage nach dem Ende aller Zugänge erteilt der Löschlauf dem Zugangsdienst einen Löschauftrag (ANN-217). **Grundlage.** ADR-023 Punkt 5; Entscheidung Jannes (BEF-115). **Anker.** `app.platform_access_ended_at`, `public.platform_account_deletions`. **Rücknahme.** Andere Lesefrist: `app.platform_read_period` · Aufwand `klein`.

### ANN-191 — Beim Einlösen legt die Person ihre Adresse selbst fest; ein bestehendes Konto bestätigt sie per Passkey
Datenschutz · entschieden (Jannes) · 2026-10-10 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5)\
**Annahme.** Hat die Adresse kein Konto, legt der Zugangsdienst eines an; sonst meldet sich die Person vorher mit Passkey an und löst mit dieser Sitzung ein. Ohne Sitzung heißt eine vergebene Adresse `email_taken` und zählt als Fehlversuch, nach fünf ist die Einladung verbraucht. Fremde Konten und Praxiskonten weist die Datenbank ab. **Grundlage.** ADR-023 Punkte 4 und 8; ADR-025 Punkt 13. **Anker.** `supabase/functions/platform-access/handler.ts`. **Rücknahme.** Adresse wie im Verhältnis verlangen: Vergleich beim Einlösen · Aufwand `klein`.

### ANN-194 — Die Übersicht ruft die Route des eigenen Tages beim Öffnen ab
Datenschutz · entschieden (Jannes) · 2026-10-01 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, ADR-019 Punkt 9)\
**Annahme.** Beim Öffnen ruft die Übersicht für die angemeldete Person die eigene Tagesroute, den Tagesort (Garage oder Praxis, ANN-240) und eine Route über alle Stopps ab, solange ein Besuch mit Ort aussteht. Hinaus gehen nur Koordinaten in Fahrtreihenfolge und das Fahrprofil, gespeichert wird nichts; die Karte lädt erst auf Tipp. **Grundlage.** ADR-019 Punkte 12, 13, 15 und 16. **Anker.** `src/features/calendar/today/fahrzeiten.ts`. **Rücknahme.** Wieder nur auf Tipp: `FAHRZEITEN_BEIM_OEFFNEN` auf `false` · Aufwand `klein`.

### ANN-200 — Die bisherigen Einträge auf der Schreibseite öffnen nie von selbst
Datenschutz · entschieden (Jannes) · 2026-10-03 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Die bisherigen Einträge stehen hinter „Verlauf“, am Telefon als Blatt, ab 640 px als Spalte, und werden erst gelesen, wenn jemand sie öffnet. Das schreibt „Akte geöffnet“ höchstens einmal je Person, Akte und Tag. Gezeigt werden die jüngsten 20 Termine ohne den gerade dokumentierten, für Büro und Behandelnde gleich. **Grundlage.** ADR-010 Punkt 16; ADR-016 Punkt 4; Entscheidung Jannes (BEF-095). **Anker.** `src/features/clinical/documentation/BisherigeEintraege.tsx`. **Rücknahme.** Ab 640 px offen beginnen: `verlaufOffen` an die Breite binden · Aufwand `klein`.

### ANN-203 — Die vertretende Person bekommt keine Zeile in `persons`; ihr Name steht am Zugang als Nachweis
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, B5)\
**Annahme.** Eine Vertretung wird nicht als Person angelegt; ihr Name steht als Freitext am Zugang (`representative_name`) als Teil des Nachweises, mit der Frist der Klasse `plattformzugang`, auch wenn das Verhältnis vorher fällt. Der Name der vertretenen Person steht nie am Zugang. **Grundlage.** ADR-023 Punkt 5 und Konsequenzen. **Anker.** `public.platform_accesses.representative_name`. **Rücknahme.** Kürzere Frist für den Namen: im Löschlauf nach dem Ende leeren, Constraint lockern · Aufwand `mittel`.

### ANN-204 — Vertretungen werden in V1 nur vor Ort eingeladen
Datenschutz · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5)\
**Annahme.** Eine Vertretung bekommt ihren Code nur auf dem Praxisgerät zum Scannen; eine Einladung per Mail gibt es für sie nicht, und ihre Adresse speichert die Praxis nicht. Auch einen neuen Code, etwa für einen verlorenen Passkey, gibt es nur vor Ort. **Grundlage.** ADR-023 Punkte 10, 11 und 13; ADR-025 Punkt 12; Entscheidung Jannes 2026-10-02. **Anker.** `public.invite_platform_representation`, `public.renew_platform_representation_code`. **Rücknahme.** Mail für Vertretungen: Adressfeld am Zugang, Bestätigungsvermerk wie ANN-188, Versand über den Zugangsdienst · Aufwand `mittel`.

### ANN-205 — Der Nachweisvermerk besteht aus Häkchen je Dokumentart; gespeichert wird kein Dokument
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung, rechtliche Klärung (B5)\
**Annahme.** Vermerkt wird, welche Dokumentart wer wann sah: immer den Ausweis der Vertretung, bei rechtlicher Vertretung Sorgerechtsnachweis, Betreuerausweis oder Vollmacht. Bei Betreuung und Vollmacht ist das Häkchen Gesundheitssorge Pflicht, die Vermögenssorge wird stets vermerkt (ANN-216). Art und Nachweis ändern sich nie; kein Scan, keine Nummer. **Grundlage.** ADR-023 Punkt 13; Entscheidung Jannes (BEF-119). **Anker.** `app.assert_platform_representation`. **Rücknahme.** Weitere Dokumentarten: Werteliste und Constraint · Aufwand `klein`.

### ANN-206 — Wortlaut der Einwilligung zur Begleitung, versioniert und auf dem Praxisgerät bestätigt
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Die Einwilligung zur Begleitung hat einen versionierten Wortlaut je Bereich. Die Person liest ihn am Praxisgerät, die Praxis bestätigt per Häkchen; festgehalten werden Fassung, Begleitperson, Bereiche, Zeitpunkt und bestätigende Praxiskraft. Neue Sicht auf alte Nachrichten verlangt neue Einwilligung; ob das Häkchen genügt, entscheidet B2. **Grundlage.** Art. 9 Abs. 2 lit. a, Art. 7 Abs. 1 DSGVO; ADR-023 Punkt 13. **Anker.** `app.platform_companion_consent_version`, `src/lib/vertretung.ts`. **Rücknahme.** Unterschrift statt Häkchen · Aufwand `mittel`.

### ANN-207 — Ein Zweifel an der Einwilligungsfähigkeit steht am Zugang der rechtlichen Vertretung, ohne Diagnose
Datenschutz · entschieden (Jannes) · 2026-10-03 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Bei Zweifel an der Einwilligungsfähigkeit gibt es keine Begleitung, nur eine rechtliche Vertretung; der Zweifel steht als fester Wert an deren Zugang (`companion_declined_reason`), ohne Freitext, nicht im Auditlog; er sperrt keine spätere Begleitung. Folgt keine rechtliche Vertretung, wird nichts gespeichert. **Grundlage.** ADR-023 Punkt 13; ADR-010 Punkt 15. **Anker.** `public.invite_platform_representation`. **Rücknahme.** Sperre am Verhältnis: Spalte mit Datum, Prüfung in `app.assert_platform_representation` · Aufwand `mittel`.

### ANN-208 — Ohne Geburtsdatum keine Vertretung; das Sorgerecht endet am 18. Geburtstag in der Zeitzone der Praxis
Recht · entschieden (Jannes) · 2026-10-02 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5)\
**Annahme.** Eine Vertretung setzt ein Geburtsdatum voraus; unter 18 gibt es nur Sorgeberechtigte. Ein Zugang aus dem Sorgerecht endet am Tag der Volljährigkeit, 0 Uhr Praxiszeit, bei Geburt am 29. Februar im Nichtschaltjahr am 1. März; danach kein neuer Code; jede andere Vertretung endet, sobald das Geburtsdatum fehlt oder minderjährig macht. **Grundlage.** §§ 2, 1626, 187 Abs. 2, 188 Abs. 2 BGB; ADR-023 Punkt 15. **Anker.** `app.majority_date`, `app.platform_is_minor`. **Rücknahme.** Andere Altersgrenze: `app.platform_min_age_years` · Aufwand `klein`.

### ANN-209 — Lesen über eine Vertretung steht höchstens einmal je Tag und Akte im Protokoll
Datenschutz · entschieden (Jannes) · 2026-10-03 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Jeder Aufruf einer Plattformprojektion über eine Vertretung, auch des Gerüsts, schreibt `platform_representation.read`, höchstens einmal je Konto, Verhältnis und Tag, mit dem Konto der Vertretung als Akteur; das eigene Lesen der Person bleibt unprotokolliert – steht in ADR-010 Punkt 16 und ADR-023 Punkt 24. **Grundlage.** ADR-010 Punkte 16 und 22; ADR-023 Punkte 14 und 24. **Anker.** `app.log_platform_representation`. **Rücknahme.** Jeden Aufruf protokollieren: Tagesgrenze aufheben, nur mit Änderung von ADR-010 · Aufwand `klein`.

### ANN-214 — Den behandlungsrelevanten Hinweis erfassen alle Praxisrollen an der Verordnung in der Akte
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (mit ANN-065)\
**Annahme.** Der klinische Hinweis einer Verordnung (`prescriber_note`) wird an der Verordnung in der Akte erfasst, nicht im Formular der Grundlage. Schreiben dürfen owner, Therapeut:innen, Teamleitung und Büro, lesen alle mit dem Leserecht der Dokumentation; nie am Selbstzahler, Nachweis über `updated_by` statt Auditlog. **Grundlage.** ADR-020 Punkt 4; Entscheidung Jannes 2026-10-09 (BEF-134). **Anker.** `public.set_treatment_basis_clinical_note`. **Rücknahme.** Nur behandelnde Rollen: Prüfung auf `app.can_write_treatment_note` · Aufwand `klein`.

### ANN-215 — Ein Betrag an einer stornierten Rechnung wird nur mit ihrer Ersatzrechnung verrechnet, als Paar
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Steuerberatung (B9)\
**Annahme.** Verrechnet wird nur mit der ausgestellten Ersatzrechnung: Rückzahlung und Eingang (`method = 'offset'`), verbunden über `offset_group`, am Tag der Verrechnung, höchstens der eingegangene Betrag; storniert wird nur das Paar. Buchen: owner und office. Offen, ob die Zuflussrechnung den ursprünglichen Zahlungstag verlangt. **Grundlage.** Entscheidung Jannes 2026-10-09 (BEF-100). **Anker.** `public.offset_payment`, `public.void_offset_payments`. **Rücknahme.** Ursprünglichen Zahlungstag übernehmen · Aufwand `klein`.

### ANN-216 — Eine Vertretung trägt zwei Bereiche: Gesundheit immer, Rechnungen nur nachgewiesen
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, B5)\
**Annahme.** Gesundheit (Termine, Wünsche, Nachrichten, Befundbogen, Unterlagen) trägt jede Vertretung, Rechnungen nur mit `finance_scope` (Vermögenssorge bzw. Einwilligung). Einwilligung, Export und Begleitungen verwalten nur eigener Zugang und rechtliche Vertretung; eine Vollmacht ohne Vermerk der Gesundheitssorge wurde entzogen. Offen (B5): Vermerk auch beim Sorgerecht? **Grundlage.** ADR-023 Punkt 13; Entscheidung Jannes 2026-10-09 (BEF-119). **Anker.** `app.platform_access_allows`. **Rücknahme.** Nur Rechnungen: Gesundheitssorge freistellen · Aufwand `mittel`.

### ANN-218 — Mails des Anmeldedienstes prüft der Zugangsdienst über den Mail-Hook, der bis B13 und OPS-001 aus ist
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: B13 und OPS-001\
**Annahme.** Eingeschaltet ruft der Anmeldedienst für jede Mail den Zugangsdienst; der prüft die Signatur, fragt `public.auth_email_allowed` und verschickt oder verwirft stumm mit Erfolg, damit die Antwort kein Plattformkonto verrät. Erlaubt ist, was ANN-331 nennt. Bis dahin ist die Plattform nicht scharf. **Grundlage.** ADR-023 Punkt 10; ADR-025 Punkt 9; Entscheidung Jannes 2026-10-09 (BEF-118). **Anker.** `supabase/functions/platform-access/authmail.ts`. **Rücknahme.** Andere Regel: `public.auth_email_allowed` · Aufwand `klein`.

### ANN-229 — Die Diagnose der Verordnung steht auf der Rechnung
Datenschutz · entschieden (Jannes) · 2026-10-03 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzberatung vor dem Scharfschalten\
**Annahme.** Neue Rechnungsdokumente tragen je Verordnung ICD-10-Code und Diagnosetext, dazu Datum und verordnende Ärzt:in; Therapieziel und Verordnerhinweis nicht, am Selbstzahler keine Diagnose. Ausgestellte Rechnungen behalten ihren Snapshot. Unsicher: ob eine abweichende Empfänger:in, etwa Angehörige, eine Einwilligung verlangt. **Grundlage.** ADR-009 Punkte 10 und 23; Entscheidung Jannes 2026-10-03. **Anker.** `app.invoice_shows_diagnosis`, `public.treatment_bases.diagnosis_icd10`. **Rücknahme.** Diagnose wieder weg: der Schalter liefert `false` · Aufwand `klein`.

### ANN-230 — Protokollierung auf das Mindestmaß: Lesen je Akte und Tag, eine Aktion je Abweisung
Datenschutz · entschieden (Jannes) · 2026-10-03 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzberatung\
**Annahme.** Das Datenmodell ist der Nachweis; das Auditlog führt nur die 27 Aktionen aus `supabase/audit-aktionen.txt`: „Akte geöffnet“ höchstens einmal je Person, Akte und Tag, Herunterladen, Exporte, Portal, Konten, Abweisungen als `access.denied` mit Zähler – steht in ADR-010 Punkte 15 und 16. **Grundlage.** Art. 5 Abs. 1 lit. c, Art. 32 DSGVO; ADR-010 Punkt 21. **Anker.** `app.log_record_access`, `app.record_denied_read`. **Rücknahme.** Feinere Körnung: Tagesgrenze in `app.log_record_access` durch Stunde ersetzen · Aufwand `klein`.

### ANN-233 — Das Honorar wird auf die Heilmittel nach ihren Preisen in der Preisliste aufgeteilt
Recht · entschieden (Jannes) · 2026-10-05 · Jannes · Prüfpaket · Wiedervorlage: erster Erstattungsfall (Beihilfe, private Versicherung)\
**Annahme.** Je Termin wird das Terminhonorar auf die erfassten Heilmittel aufgeteilt, anteilig nach ihren Preisen in der am Leistungstag geltenden Preisliste, Restcents an den größten Bruchteil; die Summe ist genau das Honorar, ohne Vergleichsbetrag – steht in ADR-009 Punkt 23. **Grundlage.** BBhV, Anlage 9; ADR-009 Punkt 23. **Anker.** `app.session_fee_lines`. **Rücknahme.** Andere Gewichte oder eine Zeile je Termin: nur `app.session_fee_lines` · Aufwand `klein`.

### ANN-242 — Kalenderkachel: Straße und Hausnummer am Hausbesuch, Standort am Praxistermin
Datenschutz · entschieden (Jannes) · 2026-10-06 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Die Kachel nennt am Hausbesuch Straße und Hausnummer aus dem Snapshot des Termins (ANN-003), sonst den Standort; Postleitzahl, Ort, Koordinate und Kontaktdaten liefert der Kalender nicht. Am Trainingstermin stammt die Straße aus den Kontaktdaten des Trainings, nie aus der Akte. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO; ADR-021 Punkt 3; Entscheidung Jannes 2026-10-06. **Anker.** `public.list_appointments` (`visit_street`, `visit_house_number`). **Rücknahme.** Beide Spalten per Migration entfernen · Aufwand `klein`.

### ANN-245 — Tab-Titel fest je Route: „Seitenart – Own Motion“, nie ein Name
Datenschutz · entschieden (Jannes) · 2026-10-06 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Jeder Tab trägt einen festen Titel je Route aus einer Tabelle („Kalender – Own Motion“, „Akte – Own Motion“ für alle Aktenseiten), ohne Regel „Own Motion“. Nie aus dem Seitentitel, nie ein Name, eine Kennung oder klinischer Inhalt: Tab-Titel landen in Verlauf, Lesezeichen und Browser-Synchronisation. **Grundlage.** ADR-011; ADR-013 Punkt 9; Entscheidung Jannes 2026-10-05. **Anker.** `REGELN` in `src/app/tabtitel.ts`. **Rücknahme.** Andere Wörter in `REGELN`; ein Titel mit Daten wäre eine ADR-Frage · Aufwand `klein`.

### ANN-246 — Terminwunsch als eigener Datensatz, zwölf Monate nach Abschluss gelöscht
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Ein Wunsch der Plattform (neu, ändern, absagen) ist eine eigene Zeile mit Wunschtagen, Tageszeiten und einer freiwilligen Notiz; er erzeugt keinen Termin und keinen Terminzustand. Er fällt zwölf Monate nach der Antwort der Praxis oder dem Zurückziehen; offene bleiben, mit dem Verhältnis fallen sie. **Grundlage.** Art. 5 Abs. 1 lit. e DSGVO; ADR-018 (kein neuer Zustand). **Anker.** `public.platform_appointment_requests`; Klasse `terminwunsch` in `public.retention_classes`. **Rücknahme.** Frist der Klasse ändern · Aufwand `klein`.

### ANN-247 — Absagewunsch: Eingang ist die Wunschzeit, die Frist rechnet der Server
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutz- und Rechtsberatung\
**Annahme.** Trägt die Praxis eine Absage aus einem Wunsch ein, gilt als Eingang der Zeitpunkt, zu dem die Person ihn abschickte. Ob sie zu spät ist, rechnet nur der Server; die Plattform zeigt vorher den Hinweis im Wortlaut der Patienteninformation und entscheidet nicht über das Honorar. Hingenommen: Zur Zeitumstellung bis eine Stunde Versatz. **Grundlage.** §§ 130, 630c BGB; ADR-018 Punkt 8; Entscheidung Jannes 2026-10-09. **Anker.** `public.cancel_appointment_from_request`, `src/lib/ausfallhonorar.ts`. **Rücknahme.** `now()` statt `created_at` · Aufwand `klein`.

### ANN-248 — Befundbogen vorab nur durch Person oder rechtliche Vertretung; Absenden schließt ab
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Den Befundbogen füllen auf der Plattform nur Person und rechtliche Vertretung aus (Recht `questionnaire`), nie die Begleitung, nur Instrumente mit `ausgefuellt_von: 'patient'`. Absenden schließt die Erhebung mit Herkunft `platform` unveränderlich ab; die Plattform sieht nur eigene Erhebungen. **Grundlage.** ADR-023 Punkt 13; ADR-010 Punkt 15; offen: Art. 13 DSGVO; Entscheidung Jannes 2026-10-09. **Anker.** `public.complete_platform_questionnaire_response`. **Rücknahme.** Begleitung zulassen: `questionnaire` zur ersten Gruppe · Aufwand `klein`.

### ANN-249 — Dokumente einzeln freigegeben von owner, Therapeut:in, Teamleitung, nie Fotos; Abruf ohne Auditeintrag
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Eine Datei der Akte zeigt die Plattform erst nach einzelner, widerrufbarer Freigabe durch owner, Therapeut:in oder Teamleitung, nie das Büro; Fotos nie. Der Abruf schreibt keinen Auditeintrag; ruft eine Vertretung ab, zählt das als ihr Lesen (einmal je Tag). **Grundlage.** § 630g BGB (offen: Arztbriefe Dritter); ADR-010 Punkt 22; ADR-023 Punkte 22 und 24; Entscheidung Jannes 2026-10-09. **Anker.** `public.set_patient_file_release`, `public.issue_platform_file_link`. **Rücknahme.** Büro darf freigeben · Aufwand `klein`.

### ANN-250 — Eigene Rechnungen: nur ausgestellte, als Snapshot, mit Zahlungsstand; Recht `billing`
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Die Plattform zeigt ausgestellte Rechnungen des eigenen Verhältnisses, nie Entwürfe, als Blatt aus dem Snapshot mit Zahlungsstand vom Server, auch an andere adressierte. Recht `billing`: die Person, eine Begleitung nur mit Häkchen, eine Vertretung mit Vermögenssorge; Diagnose und Geburtsdatum stehen wie auf dem Druck. **Grundlage.** ADR-009 Punkte 10 und 12; ADR-023 Punkt 16; Entscheidung Jannes 2026-10-09. **Anker.** `public.platform_invoices`, `public.platform_invoice`. **Rücknahme.** Ohne Diagnose: Schlüssel aus `document` · Aufwand `klein`.

### ANN-251 — Eigene Termine: künftige und zwölf Monate zurück, feste Spalten ohne Dokumentation
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Die Plattform zeigt künftige Termine des Verhältnisses und die der letzten zwölf Monate mit Zeit, Art, Zustand in Worten der Person, Fachperson, Ort, Frist und offenem Wunsch; nichts aus der Dokumentation, kein Honorar, keine Notiz, keine internen Termine. Lesen über eine Vertretung wird protokolliert, das eigene nicht. **Grundlage.** PROJECT_PRINCIPLES.md §3.2; ADR-023 Punkte 22 und 24; Entscheidung Jannes 2026-10-09. **Anker.** `public.platform_appointments`. **Rücknahme.** Anderer Zeitraum: `app.platform_appointment_history` · Aufwand `klein`.

### ANN-256 — Sitzungssperre im Server: Anmeldung aus `amr`, Bedienung als Vermerk je Sitzung
Datenschutz · offen · 2026-10-06 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung vor dem Go-live\
**Annahme.** Die Datenbank sperrt 60 Minuten nach der letzten Anmeldung (`amr`) oder nach 30 Minuten ohne Bedienung, die die Anwendung höchstens minütlich je Sitzung vermerkt (ADR-025 Punkt 6, W2 a). Ohne `amr` oder `session_id` gilt ein Token als gesperrt. Der Vermerk trägt nur Konto und Zeit, kein Konto liest ihn, Klasse `sitzungsvermerk`. **Grundlage.** ADR-025 Punkte 1, 2 und 6; PROJECT_PRINCIPLES.md §20; Entscheidung Jannes 2026-10-06. **Anker.** `app.session_open`, `public.session_activity`. **Rücknahme.** Andere Fristen in `app.session_idle_timeout` · Aufwand `klein`.

### ANN-257 — Sitzungssperre der Oberfläche: Vorlauf, verborgene Seite, zwei Restlücken
Datenschutz · offen · 2026-10-10 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung und OPS-001\
**Annahme.** Die Oberfläche sperrt 20 Sekunden vor der Frist des Servers, sichert offene Texte höchstens 10 Sekunden als Entwurf und hält eine Seite mit ungesichertem Text bis zur Freigabe (Passkey, Rückweg App-PIN) verborgen und unbedienbar. Restlücken: `location-provider` und `patient-file-verify` prüfen nur die Anmeldung, nicht die Sperre; die Aktivität meldet die Anwendung selbst. **Grundlage.** ADR-025 Punkte 3 bis 5, 7 und 11; Art. 32 DSGVO. **Anker.** `VORLAUF_MS` in `sperrstand.ts`. **Rücknahme.** Text verwerfen statt halten · Aufwand `klein`.

### ANN-261 — Nach der Lesefrist widerruft die Person weiter; Export und Vertretung enden mit der Lesezeit
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Nach der Lesefrist (30 Tage nach Ende des Verhältnisses) kann die Person über ihren aktiven eigenen Zugang unter „Ich“ Einwilligungen widerrufen, nicht neu erteilen. Export nur in der Lesezeit, danach Auskunft durch die Praxis; Vertretungen nach ihrem Ende, gesperrte und entzogene Zugänge können nichts. **Grundlage.** Art. 7 Abs. 3 und Art. 15 DSGVO; ADR-023 Punkt 22; Entscheidung Jannes 2026-10-09. **Anker.** `app.platform_own_access_after_reading`. **Rücknahme.** Export danach: eigener Zweig der Projektionen · Aufwand `mittel`.

### ANN-262 — Eine Einwilligung auf der Plattform speichert die Fassung ihres Texts; alte Texte werden abgewiesen
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Erteilung und Widerruf auf der Plattform speichern die Fassung des Texts, den die Person sah; der Server kennt nur die aktuelle und weist ältere ab. Die Texte nennen je Zweck den Widerruf und dass Behandlung bzw. Vertrag nicht davon abhängen; eingewilligt wird über eine Rückfrage. **Grundlage.** Art. 7 Abs. 1, 3 und 4, Art. 9 Abs. 2 lit. a DSGVO; Entscheidung Jannes 2026-10-09. **Anker.** `app.platform_consent_wording_version`, `EINWILLIGUNGSFASSUNG`. **Rücknahme.** Neuer Wortlaut: Text und Fassung an beiden Stellen · Aufwand `klein`.

### ANN-264 — Einwilligung im Training: Vermerk am Verhältnis, ein Widerruf löscht nichts selbst
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Die Einwilligung zu Gesundheitsangaben (`training_health_data`) ist ein anhängender Vermerk am Verhältnis: von der Praxis vom Papier, auf der Plattform durch Person oder rechtliche Vertretung. Ein Widerruf löscht nichts selbst, über die Angaben entscheidet die Praxis mit der Person; ohne sie bleibt das Protokoll bedienbar. **Grundlage.** Art. 9 Abs. 2 lit. a, Art. 17 Abs. 1 lit. b DSGVO; ADR-021 Punkte 4 bis 6; Entscheidung Jannes 2026-10-09. **Anker.** `public.training_consent_records`. **Rücknahme.** Löschen nach Widerruf · Aufwand `mittel`.

### ANN-265 — Der Export der Plattform ist eine Auskunft nach Art. 15: dieselbe Aktion, Inhalt nur aus den Projektionen
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** „Meine Daten herunterladen“ liefert als JSON und Druckfassung genau, was die Plattform zeigt, und steht als `patient_record.exported` mit Zweck `platform_export` im Protokoll. Exportieren dürfen die Person und ihre rechtliche Vertretung, eine Begleitung nur ihre eigene Wahl zu Benachrichtigungen. **Grundlage.** Art. 15 Abs. 3 und Art. 20 DSGVO; ADR-010 Punkt 16; ADR-023 Punkte 12 und 13; Entscheidung Jannes 2026-10-09. **Anker.** `public.platform_export`. **Rücknahme.** Dokumente im Export: ZIP im Browser · Aufwand `mittel`.

### ANN-269 — Das Nachsorge-Abo ist bis zur Antwort der Steuerberatung steuerpflichtig zum Regelsatz
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Steuerberatung (B4)\
**Annahme.** „Nachsorge-Abo (Monat)“ trägt `taxable` 19 %, ein anderes Kennzeichen lässt die Datenbank nicht zu. Ohne Verordnung ist der Heilzweck kaum belegbar; ein Ausweis ohne Pflicht wird nach § 14c UStG geschuldet, bringt aber keine Nachforderung wie ein falsches „steuerfrei“. **Grundlage.** § 4 Nr. 14 lit. a UStG; UStAE 4.14.1; § 14c UStG; ADR-009 Punkte 15 und 21; Entscheidung Jannes 2026-10-09. **Anker.** `app.aftercare_tax_allowed`. **Rücknahme.** Funktion ändern, neue Preisliste, Storno ausgestellter Rechnungen · Aufwand `klein`.

### ANN-270 — Abo-Monate nach § 188 BGB, berechnet zu ihrem Beginn; Kündigung zum Ende des laufenden Monats
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Vertragsrecht)\
**Annahme.** Ein Abo-Monat läuft vom Tag des Beginns bis zum Vortag desselben Tags im Folgemonat, fehlt der Tag, bis zum Monatsletzten, stets vom Beginn aus (31.01.–28.02., 01.03.–30.03.); berechnet wird er zu seinem Beginn. Eine Kündigung wirkt zum Ende des laufenden Monats, vor dem Beginn ohne Monat. **Grundlage.** § 188 Abs. 2 und 3, § 309 Nr. 9 BGB; ADR-009 Punkt 21; offen: Erstattung bei Widerruf (§ 312g BGB). **Anker.** `app.aftercare_month_end`. **Rücknahme.** Kalendermonate: die Monatsfunktionen · Aufwand `klein`.

### ANN-272 — Das Abo schließt die Praxis; gekündigt wird per Knopf nach § 312k BGB
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Vertragsrecht); B13\
**Annahme.** Das Nachsorge-Abo legen owner oder Büro in der Akte an, nie die Plattform. Gekündigt wird unter „Ich“ per „Abo kündigen“ und „Jetzt kündigen“; die Bestätigung mit Datum und Uhrzeit steht dauerhaft da, Kündigungen per Telefon oder Brief und jede außerordentliche trägt die Praxis ein. **Grundlage.** § 312k BGB freiwillig angewandt; Seite statt Mail bis B13; offen: § 312g BGB beim Abschluss im Hausbesuch. **Anker.** `public.cancel_platform_aftercare`. **Rücknahme.** Abschluss über die Plattform mit Widerrufsbelehrung · Aufwand `groß`.

### ANN-273 — Kündigen dürfen die Person und ihre rechtliche Vertretung mit Vermögenssorge, nie die Begleitung
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5)\
**Annahme.** Den Kündigungsknopf haben der eigene Zugang und eine rechtliche Vertretung mit nachgewiesener Vermögenssorge (Recht `contract`); den Abo-Stand sieht, wer Rechnungen sieht. Die Kündigung trägt Zugang, Art und bei einer Vertretung deren Namen. **Grundlage.** Kündigung ist Vermögenssorge; ADR-023 Punkte 5 und 13; Entscheidung Jannes 2026-10-09; offen: Vorsorgevollmacht ohne ausdrückliche Vermögenssorge. **Anker.** Recht `contract` in `app.platform_access_allows`. **Rücknahme.** Der eine Zweig dort · Aufwand `klein`.

### ANN-274 — Ein Nachsorge-Abo hält den Plattformzugang offen; die Lesezeit zählt ab seinem Ende
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Speicherbegrenzung)\
**Annahme.** In der Behandlung zählt die Lesezeit ab Abschluss der Versorgung oder Ende des letzten Nachsorge-Abos, was später liegt; solange ein Abo läuft, endet der Zugang nicht. Zum Training verlängert es nichts; Klasse `plattformzugang` und Kontolöschung rechnen ab demselben Ende. **Grundlage.** PROJECT_PRINCIPLES.md §4.6, §4.8; ADR-023 Punkt 5; Entscheidung Jannes 2026-10-09; offen: Rechtsgrundlage der Abo-Zeit. **Anker.** `app.platform_read_from`, `app.platform_access_ended_at`. **Rücknahme.** Anderer Tag in der Funktion · Aufwand `klein`.

### ANN-275 — Trainingspaket: Laufzeit in Monaten, Umfang in der Bezeichnung, bis zur Antwort der Steuerberatung 19 % Umsatzsteuer
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Steuerberatung (B4)\
**Annahme.** Ein Trainingspaket ist eine eigene Positionsart mit 1 bis 24 Monaten Laufzeit, Bereich `training`, ohne Heilmittel, mit `taxable` 19 %; der Umfang steht in der Bezeichnung, gezählt wird nicht. Ob die Vorauszahlung etwas ändert, klärt B4. **Grundlage.** § 13 Abs. 1 Nr. 1 lit. a Satz 4 UStG; ADR-009 Punkte 5, 15 und 21; ADR-021; Entscheidung Jannes 2026-10-09. **Anker.** `app.training_package_tax_allowed`. **Rücknahme.** Funktion ändern, neue Preisliste · Aufwand `klein`.

### ANN-277 — Trainingspaket nach § 188 BGB, ohne Pause und Kündigung; der Vertrag endet nicht vor ihm
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Vertragsrecht)\
**Annahme.** Ein Paket über n Monate endet am Ende des n-ten Monats vom Beginn aus (wie ANN-270), ohne Zustand, Pause und Kündigung. Pakete eines Verhältnisses überschneiden sich nie; das Trainingsverhältnis und damit der Zugang enden nicht vor dem letzten Pakettag. **Grundlage.** § 188 Abs. 2 und 3 BGB; PROJECT_PRINCIPLES.md §4.10, §19; offen: § 627 BGB mit anteiliger Erstattung, bis dahin Storno. **Anker.** `app.training_package_ends_on`, `training_packages_no_overlap`. **Rücknahme.** Kündigung mit Korrekturrechnung · Aufwand `mittel`.

### ANN-280 — Bei einem Rückfall in die Heilbehandlung läuft das Paket weiter; die Software erstattet nichts
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Vertragsrecht)\
**Annahme.** Beginnt während eines Pakets eine Behandlung derselben Person, läuft das Paket ohne Pause, Ende oder Erstattung weiter; die Behandlung wird an ihren Terminen im eigenen Bereich abgerechnet. Kulanz läuft über Storno und neue Rechnung; die Bedingungen der Plattform sagen das vorher. **Grundlage.** PROJECT_PRINCIPLES.md §4.10, §19; ADR-009 Punkt 16; Entscheidung Jannes 2026-10-09; offen: § 627 BGB (ANN-277). **Anker.** `PAKETINHALT` in `paketbedingungen.ts`. **Rücknahme.** Erstattung des Restes per Korrekturrechnung · Aufwand `mittel`.

### ANN-281 — Preise der Pakete sieht jeder Zugang zum Training; unter „Ich → Trainingspaket“ kein Kaufknopf
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Fernabsatz)\
**Annahme.** Jeder Zugang zum Training sieht die Pakete der geltenden Preisliste mit Umfang, Laufzeit, Gesamtpreis, Umsatzsteuer und Bedingungen, das eigene Paket nur mit `billing`; Zugänge zur Behandlung sehen keine Preise. Ein Paket schließt die Praxis, nach der Behandlung die Person über das Angebot im Konto (ANN-288). **Grundlage.** § 3 PAngV; § 312d BGB; PROJECT_PRINCIPLES.md §4.8, §4.10. **Anker.** `public.platform_training_offers`, `PAKETBEDINGUNGEN`. **Rücknahme.** Preise auch in der Behandlung: eine Bedingung · Aufwand `klein`.

### ANN-282 — Trainingsangebote halten die Rollen der Akte fest; ob die Person schon trainiert, zeigt erst ihr Konto
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Ein Trainingsangebot legen owner, Therapeut:in, Teamleitung und Büro in der Akte an und ziehen es zurück; die Trainingsbetreuung sieht es nicht. Der Server fragt beim Anbieten nicht nach einem bestehenden Trainingsverhältnis; das zeigt erst die Seite im Konto der Person. **Grundlage.** PROJECT_PRINCIPLES.md §4.8, §4.10; ADR-021 Punkt 5; Entscheidung Jannes 2026-10-09. **Anker.** `app.can_update_patient` in `public.create_training_offer`. **Rücknahme.** Nur owner und Büro: `app.can_manage_training_packages` · Aufwand `klein`.

### ANN-283 — Aus der Behandlung wandern nur wörtlich formulierte Übergabeangaben, keine Felder der Akte
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Was ins Training mitgeht, formuliert die Praxis im Angebot als bis zu fünf Angaben (Überschrift 80, Text 600 Zeichen), wahlweise mit Kontaktdaten; die Person sieht jede wörtlich und gibt sie einzeln frei. Nur Freigegebenes geht als Kopie mit Herkunft ins Training; Felder aus Befund oder Dokumentation stehen nicht zur Wahl. **Grundlage.** Art. 4 Nr. 11, Art. 7 DSGVO; ADR-021 Punkt 7; Entscheidung Jannes 2026-10-09. **Anker.** `app.training_offer_handover_valid`. **Rücknahme.** Befundfelder zur Wahl: Kopierfunktion je Feld · Aufwand `groß`.

### ANN-285 — Die Akte erfährt nicht, ob ein Angebot angenommen wurde
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Die Akte zeigt ein Angebot als „offen“ bis zum Ende der Gültigkeit, dann „abgelaufen“, oder „zurückgezogen“, gleich ob gebucht wurde; den Zeitpunkt der Annahme liest nur die Projektion der Person. Zurückziehen berührt einen Vertrag nicht; die Buchungsseite sagt, dass die Akte es nicht erfährt. **Grundlage.** PROJECT_PRINCIPLES.md §4.8 (Rang 1); Entscheidung Jannes 2026-10-09. **Anker.** `app.training_offer_practice_state`, `AKTE_ERFAEHRT`. **Rücknahme.** Annahme mit Einwilligung zurück in die Akte · Aufwand `klein`.

### ANN-287 — Das Voraussetzungsprofil schreiben owner und Trainingsbetreuung; das Büro liest es
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Das Voraussetzungsprofil lesen owner, Trainingsbetreuung und Büro, schreiben nur owner und Trainingsbetreuung. Sieben Freitexte, dazu schreibgeschützte Übernahmen; ohne Einwilligung bleibt es bedienbar (wie ANN-264); nach dem Vertragsende wird nichts mehr gespeichert. **Grundlage.** ADR-021 Punkte 6 und 10; Entscheidung Jannes 2026-10-09. **Anker.** `public.get_training_profile`, `public.save_training_profile`. **Rücknahme.** Büro ausnehmen: eigene Leseprüfung statt `app.can_read_training_content` · Aufwand `klein`.

### ANN-288 — Trainingsvertrag im Konto: Musterbelehrung, „Zahlungspflichtig buchen“
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Fernabsatz); B13\
**Annahme.** Das Angebot zeigt Zeitraum, Gesamtpreis, Bedingungen, Musterbelehrung und -formular; der Vertrag entsteht mit „Zahlungspflichtig buchen“, Beginn binnen 14 Tagen nur auf ausdrückliches Verlangen. Gespeichert werden Preis, Fassungen, Freigaben, Einwilligung; die Bestätigung steht zum Speichern da; ob als dauerhafter Datenträger, ist offen (B13). **Grundlage.** Art. 246a § 1 Abs. 2 EGBGB; §§ 312f Abs. 2, 312j Abs. 3, 356 Abs. 4, 357a Abs. 2 BGB. **Anker.** `public.accept_platform_training_offer`. **Rücknahme.** Neue `VERTRAGSFASSUNG` · Aufwand `klein`.

### ANN-289 — Den Trainingsvertrag im Konto schließt nur die Person selbst
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5)\
**Annahme.** Annehmen kann nur der eigene Zugang der Person zu ihrer Behandlung; eine rechtliche Vertretung mit Vermögenssorge sieht Angebot und Seite ohne Knopf, eine Begleitung nichts. Mit dem Vertrag bekommt das Konto der Person einen Zugang zum Training; eine Vertretung dort richtet die Praxis mit eigenem Nachweis ein. **Grundlage.** PROJECT_PRINCIPLES.md §4.8; ADR-023 Punkt 13; Entscheidung Jannes 2026-10-09. **Anker.** `public.accept_platform_training_offer`. **Rücknahme.** Vertretung schließt ab: Zugang mit übernommenem Nachweis · Aufwand `mittel`.

### ANN-290 — Der Widerruf im Konto ist die Erklärung; die Praxis wickelt ab
Recht · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Vertragsrecht)\
**Annahme.** Unter „Ich → Trainingsvertrag“ steht bis zum Ende der Widerrufsfrist „Vertrag widerrufen“, dann „Widerruf bestätigen“ und sofort der Eingang mit Datum und Uhrzeit; widerrufen Person und rechtliche Vertretung mit Vermögenssorge, nie die Begleitung. Der Widerruf steht am Vertrag, in Offene Punkte (ANN-341) und am Verhältnis, storniert nichts selbst; die Praxis wickelt ab. **Grundlage.** § 356a BGB; § 357a Abs. 2 BGB. **Anker.** `public.withdraw_platform_training_contract`. **Rücknahme.** Widerruf per Brief vermerken: Praxisfunktion · Aufwand `klein`.

### ANN-291 — Mit dem Vertrag entsteht der Zugang zum Training ohne eigene Einladung
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B5)\
**Annahme.** Bucht die Person im Konto, bekommt dasselbe Konto im selben Aufruf einen aktiven eigenen Zugang zum neuen Trainingsverhältnis, ohne Einladung; der Wächter prüft wie sonst, das Protokoll nennt `platform_access.activated` mit `via: training_contract`. **Grundlage.** §4.10 der Prinzipien; ADR-023 Punkte 7 und 11 (Fassung 8): Die Identität prüfte die Einladung zur Behandlung; Entscheidung Jannes 2026-10-09. **Anker.** `public.accept_platform_training_offer`. **Rücknahme.** Zugang `invited` statt `active` · Aufwand `klein`.

### ANN-292 — Eine Übungsbibliothek für Behandlung und Training
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Die Praxis führt eine Übungsbibliothek für beide Leistungsbereiche; Übung und Variante tragen weder Leistungsbereich noch Personenbezug. Personenbezogen wird eine Übung erst im Plan, der an seinem Verhältnis hängt. **Grundlage.** PROJECT_PRINCIPLES.md §4.8; ADR-021 Punkt 6 (trennt Daten einer Person, nicht Fachwissen); Entscheidung Jannes 2026-10-09. **Anker.** `public.exercises`, `public.exercise_variants` ohne Spalte `service_area`. **Rücknahme.** Getrennte Bibliotheken: Spalte `service_area` und Filter in `public.list_exercise_library` · Aufwand `mittel`.

### ANN-297 — Ein Plan in einer Tabelle für beide Bereiche, genau ein Verhältnis
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Übungspläne beider Bereiche stehen in einer Tabelle; ein Plan trägt `service_area` und hängt an genau einem Verhältnis, Akte oder Trainingsverhältnis, eine Constraint verbietet beides und keines. Klasse je Zeile nach Bereich, `patientenakte` oder `trainingsverhaeltnis`; der Plan fällt mit seinem Verhältnis. **Grundlage.** ADR-021 Punkt 1; ADR-022 Punkt 3; ADR-008; Entscheidung Jannes 2026-10-09. **Anker.** Constraint `exercise_plans_one_relationship`. **Rücknahme.** Zwei Tabellen, Funktionen je Bereich · Aufwand `mittel`.

### ANN-306 — Einheiten erfassen Person und rechtliche Vertretung; im Training „schwierig, weil …“ nur mit Einwilligung
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Einheiten erfassen die Person und ihre rechtliche Vertretung (Recht `exercise`), nie die Begleitung; „Das war schwierig, weil …“ gibt es in der Behandlung immer, im Training nur mit Einwilligung `training_health_data`. Lesen dürfen die Rollen des Plans, im Training owner, Trainingsbetreuung und Büro. **Grundlage.** Art. 9 Abs. 2 lit. a DSGVO; ADR-021 Punkte 4 und 10; ADR-023 Punkt 13. **Anker.** `app.platform_exercise_note_allowed`. **Rücknahme.** Begleitung abhaken lassen: Recht `exercise` · Aufwand `klein`.

### ANN-311 — Training: Gesundheitsthemen nur mit Einwilligung; Büro liest alles, antwortet auf Termin, Rechnung, Sonstiges
Datenschutz · entschieden (Jannes) · 2026-10-10 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Im Training gibt es „Übung“ und „Beschwerden“ nur mit Einwilligung `training_health_data`, nach Widerruf keinen Nachtrag dazu, die übrigen Themen immer. Es lesen owner, Trainingsbetreuung und Büro; owner und Trainingsbetreuung antworten auf alles, das Büro auf „Termin oder Rechnung“ und „Sonstiges“. **Grundlage.** Art. 9 Abs. 2 lit. a DSGVO; ADR-021 Punkte 4 und 10. **Anker.** `app.platform_message_topic_allowed`, `app.can_answer_platform_message`. **Rücknahme.** Die jeweilige Funktion · Aufwand `klein`.

### ANN-312 — Klinisch Relevantes kommt als endgültiger Verweis am Vorgang in die Akte
Datenschutz · entschieden (Jannes) · 2026-10-09 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Rückfragen der Behandlung ordnen owner, Therapeut:innen und Teamleitung der Akte zu, nicht das Büro: als endgültiger Verweis auf den ganzen Vorgang. Zugeordnete gehören zur Klasse `patientenakte`, übrige der Behandlung zu `patientenkommunikation`, im Training mit dem Verhältnis. Ohne Zuordnung bleibt auch Klinisches bei `patientenkommunikation`. **Grundlage.** § 630f BGB; ADR-004 Punkt 3; ADR-008; ADR-016 Punkt 5; Entscheidung Jannes 2026-10-09. **Anker.** `public.assign_platform_message_to_record`. **Rücknahme.** Alles wie die Akte aufbewahren · Aufwand `klein`.

### ANN-315 — Eine Leseregel für das Training: owner, Trainingsbetreuung und Büro
Datenschutz · entschieden (Jannes) · 2026-10-10 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Alle Inhalte eines Trainingsverhältnisses, auch künftige, lesen owner, Trainingsbetreuung und Büro nach einer Funktion; schreiben regelt je Inhalt eine Funktion ohne Büro – steht in ADR-021 Punkt 10. Ausgenommen ist das Ernährungsprofil (ADR-021 Punkt 11). **Grundlage.** ADR-021 Punkte 6, 10 und 11; Entscheidung Jannes 2026-10-10; mit echten Daten erst nach B2. **Anker.** `app.can_read_training_content`. **Rücknahme.** Büro ausnehmen: `office` aus der Funktion · Aufwand `klein`.

### ANN-316 — Fotos aus dem Verlauf ohne Wahl; keine neue Arbeitshilfe, Fotoeinwilligung nur zum Widerruf
Datenschutz · entschieden (Jannes) · 2026-10-10 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Der Verlauf nimmt nur Dokumentationsfotos auf, ein Upload `patientenfoto` wird abgewiesen, vorhandene Arbeitshilfen bleiben bis Frist oder Widerruf – steht in ADR-017 Punkte 56 und 57. Die Fotoeinwilligung zeigen Akte und Plattform nur, solange sie erteilt ist, zum Widerruf; eine Erteilung bleibt ohne Wirkung (ersetzt ANN-221). **Grundlage.** ADR-017 Punkte 45, 56 und 57. **Anker.** `public.prepare_patient_file_upload`, `einwilligungAngeboten`. **Rücknahme.** Abweisung streichen, Wahl zurückholen · Aufwand `mittel`.

### ANN-323 — Blätter an Patient:innen tragen den Absender aus den Praxis-Stammdaten
Datenschutz · entschieden (Jannes) · 2026-10-10 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Aufnahmeblatt und Terminzettel tragen Name, Anschrift, Telefon und E-Mail der Praxis aus `practice_billing_profiles`; die Serverfunktion gibt allen vier Praxisrollen nur diese Felder, nie Steuer-, Bank- oder Nummernkreisangaben. Ohne Stammdaten nur der Name der Organisation. Offen, ob Art. 13 mehr verlangt, etwa die Datenschutzbeauftragte. **Grundlage.** Art. 13 Abs. 1 lit. a DSGVO; Entscheidung Jannes 2026-10-09; wie ANN-123. **Anker.** `public.get_practice_sender`. **Rücknahme.** Nur der Name der Organisation: den Zweig streichen · Aufwand `klein`.

### ANN-324 — App-PIN: sechs Ziffern, fünf Fehlversuche je Sitzung, danach ist die Sitzung verbraucht
Datenschutz · offen · 2026-10-10 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Die App-PIN hat sechs Ziffern, keine gleichen und keine auf- oder absteigende Reihe. Nach fünf Fehlversuchen in Folge ist die Sitzung verbraucht und wird beim Anmeldedienst beendet; weiter geht es nur per Passkey, die richtige PIN setzt den Zähler zurück, nach Zeit verfällt er nicht (Klasse `sitzungsvermerk`). Offen ist, ob die Prüfung eine längere PIN oder eine Wartezeit verlangt. **Grundlage.** ADR-025 Punkt 11. **Anker.** `app.pin_max_attempts`, `app.pin_problem`. **Rücknahme.** Andere Länge oder Zahl: die Konstante bzw. das Muster · Aufwand `klein`.

### ANN-329 — Ein Passkey öffnet eine Sitzung nur, wenn er in offener Sitzung freigegeben wurde
Datenschutz · offen · 2026-10-10 · — · Prüfpaket · Wiedervorlage: Providerprüfung Supabase (OPS-001)\
**Annahme.** Eine Passkey-Anmeldung zählt nur, wenn der Passkey in `passkey_approvals` steht; freigegeben wird nur in offener Sitzung, für das eigene Konto, höchstens zehn Minuten nach dem Anlegen. Restlücke wie in ADR-025: Mit gesperrtem Token lassen sich eigene Passkeys beim Anmeldedienst löschen (Aussperren). Ob der Anbieter `last_used_at` wie im Quelltext setzt, prüft OPS-001 (fail-closed). **Grundlage.** ADR-025 Punkte 6 und 10. **Anker.** `app.passkey_sign_in_approved`, `public.approve_own_passkey`. **Rücknahme.** Sperre im Hook des Anmeldedienstes · Aufwand `mittel`.

### ANN-330 — Kein Kennwort über den Anmeldedienst: ein Trigger an `auth.users`
Datenschutz · offen · 2026-10-10 · — · Prüfpaket · Wiedervorlage: Providerprüfung Supabase (OPS-001)\
**Annahme.** Ein Trigger an `auth.users` lehnt jedes Kennwort ab, das der Anmeldedienst setzt (Selbstbedienung, Admin-API, Wiederherstellung); Kennwörter synthetischer Testkonten kommen per SQL. Unsicher ist, ob der Anbieter den Trigger im Cloudprojekt zulässt. **Grundlage.** ADR-025 Punkt 9; ADR-004. **Anker.** Trigger `auth_users_no_password`, `app.reject_password_via_auth_service`. **Rücknahme.** Trigger entfernen, gegen ADR-025 Punkt 9 · Aufwand `klein`.

### ANN-331 — Mails des Anmeldedienstes: keine Wiederherstellung, Anmeldelinks nur mit Anlass
Datenschutz · offen · 2026-10-10 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung; Mail-Hook mit OPS-001 und B13\
**Annahme.** Kein Konto bekommt einen Wiederherstellungslink, Plattformkonten keine Mail des Anmeldedienstes. Ein Praxiskonto bekommt einen Anmeldelink nur zu einer offenen Einladung oder bis eine Stunde nach „Neuen Anmeldelink senden“, gelesen aus dem Auditlog; wirksam erst mit dem Mail-Hook. Offen, ob die Prüfung das Lesen des Auditlogs dafür trägt. **Grundlage.** ADR-025 Punkte 9 und 12; ADR-023 Punkt 10. **Anker.** `public.auth_email_allowed`. **Rücknahme.** Eigenes Merkmal am Profil statt Auditlog · Aufwand `klein`.

### ANN-332 — Anhänge an Rückfragen gibt es im Training und im laufenden Nachsorge-Abo, Frist der Klasse `rueckfrageanhang`
Datenschutz · offen · 2026-10-11 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, DSFA)\
**Annahme.** Fotos und Videos an Rückfragen gibt es im Training und in der Behandlung nur bei laufendem Nachsorge-Abo, mit der Frist der Klasse `rueckfrageanhang`; das steht in ADR-017 Punkte 59 und 65. Dazu gilt der Schalter der Organisation (ANN-371); nach der Frist ist ein Anhang unsichtbar. **Grundlage.** ADR-017 Punkte 59 und 65. **Anker.** `app.message_attachments_offered`, `app.message_attachment_visible`. **Rücknahme.** Anhänge auch in der Behandlung: ein Zweig in der Funktion · Aufwand `klein`.

### ANN-333 — Einwilligung zu Anhängen: eigener Zweck, beim ersten Anhängen angeboten, Widerruf auch vom Papier
Datenschutz · offen · 2026-10-11 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, Wortlaut)\
**Annahme.** Die Einwilligung ist der Zweck `message_attachments` in `patient_privacy_records` bzw. `training_consent_records`; die Plattform bietet sie beim ersten Anhängen an. Die Praxis erteilt sie nicht vom Papier, vermerkt aber in der Akte einen Widerruf vom Papier, der wie der auf der Plattform löscht; im Training nur über die Plattform. **Grundlage.** ADR-017 Punkt 61; Art. 7 Abs. 3 DSGVO. **Anker.** `public.record_patient_privacy_entry`, `public.record_platform_consent`. **Rücknahme.** Widerruf vom Papier auch im Training · Aufwand `klein`.

### ANN-334 — Anhänge: Öffnen, Anhängen, Löschen und Verwerfen ohne Auditeintrag; protokolliert wird nur die Herausgabe
Datenschutz · offen · 2026-10-11 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Öffnen, Anhängen, Löschen und Verwerfen nach Befund schreiben nichts ins Auditlog, nur die Kopie an die Person (`message_attachment.handed_out`, ANN-672); das steht in ADR-010 Punkt 16 und ADR-017 Punkt 67. Nachweis sind Zeile, Löschjournal und Löschauftrag. **Grundlage.** ADR-010 Punkte 15 bis 17; ADR-017 Punkte 67 und 96. **Anker.** `public.record_message_attachment_verification`. **Rücknahme.** Eigene Aktion fürs Verwerfen: ADR-010 ändern, mit Freigabe · Aufwand `klein`.

### ANN-335 — Anhänge unter Legal Hold: gesperrt statt gelöscht, im Training kein Hold
Datenschutz · offen · 2026-10-11 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Steht auf der Akte ein Legal Hold, löschen weder Frist noch Widerruf noch Person oder Praxis einen Anhang: Er wird gesperrt (`locked_at`), ist nicht mehr sichtbar und fällt im ersten Lauf nach dem Hold; die Kopie an die Person bleibt möglich (ANN-672). Im Training gibt es keinen Hold. **Grundlage.** ADR-017 Punkte 61 und 65; Art. 17 Abs. 3 lit. e und Art. 18 DSGVO. **Anker.** `app.remove_message_attachments`. **Rücknahme.** Hold ohne Wirkung auf Anhänge: Bedingung `gehalten` streichen · Aufwand `klein`.

### ANN-336 — Video: nur Bild, 30 Sekunden, begrenzte Bitrate, Containerangaben auf dem Gerät geleert
Datenschutz · offen · 2026-10-11 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); Sichtung am iPhone\
**Annahme.** Der Aufnahmedialog nimmt nur Bild auf, höchstens 30 Sekunden und 2 Mbit/s. Vor dem Upload überschreibt das Gerät Programm-, Zeit- und Titelangaben im WebM- bzw. MP4-Container mit gleich langen Leerfeldern, ohne Neukodieren; der Server prüft Signatur, Prüfsumme, Tonspur und diese Angaben, nicht die Dauer. **Grundlage.** ADR-017 Punkte 62 bis 64. **Anker.** `src/features/portal/platform/videometadaten.ts`, `VIDEO_BITRATE`. **Rücknahme.** Dauer auch am Server prüfen · Aufwand `mittel`.

### ANN-342 — Die Auskunft aus der Akte nennt die Zugänge zur Plattform, auch den Zweifel an der Einwilligungsfähigkeit
Datenschutz · offen · 2026-10-11 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** `export_patient_record` nennt je Zugang der Behandlung Art, Vertretung, Grundlage, Nachweise, Umfang, Einwilligung zur Begleitung und Zustand, dazu den Vermerk `capacity_doubt` (ANN-207), ohne Kennungen; die Zugänge des Trainings nennt die Auskunft je Trainingsverhältnis (ANN-763). **Grundlage.** Art. 15 DSGVO; § 630g BGB beschränkt nur die Einsicht in die Akte. **Anker.** Abschnitt `platform_accesses` in `public.export_patient_record`. **Rücknahme.** Vermerk nur auf Verlangen: zwei Felder streichen · Aufwand `klein`.

### ANN-344 — Die Praxis sieht nicht, wer Benachrichtigungen eingeschaltet hat; die Wahl ist ohne Auditereignis
Datenschutz · offen · 2026-10-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, DSFA)\
**Annahme.** Die Wahl der Person steht mit Zeitpunkt und Konto am Zugang und ist nur in der eigenen Plattformsicht lesbar; owner sieht nur die Arten, die die Praxis für alle abgeschaltet hat. Wählen, Abschalten und Gerät registrieren schreiben nichts ins Auditlog. Bis zur Prüfung genügt die Wahl für Erinnerungen per Mail und Push. **Grundlage.** ADR-024 Punkte 15 und 17; ADR-010 Punkt 15. **Anker.** `public.platform_notification_settings`. **Rücknahme.** Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO mit Textfassung · Aufwand `mittel`.

### ANN-345 — Ein Zustellauftrag trägt die Kennung seines Anlasses und fällt nach der Frist der Klasse `benachrichtigung`
Datenschutz · offen · 2026-10-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** `notification_deliveries` trägt Zugang, Art, Weg, Zeitpunkte, Zustand, die Kennung des Anlasses (Termin, Rückfrage, Wunsch, Plan) und Datum und Uhrzeit für den Text, nie Text, Mailadresse oder Endpunkt. Abgeschlossene Aufträge fallen täglich nach der Frist der Klasse `benachrichtigung`, ohne Löschjournal. **Grundlage.** ADR-024 Punkt 17. **Anker.** `public.purge_notification_deliveries`. **Rücknahme.** Kennung streichen, die Prüfung „noch sinnvoll“ aufgeben · Aufwand `klein`.

### ANN-358 — Jeder Haken geht über die Warteschlange; Pläne höchstens sieben Tage auf dem Gerät
Datenschutz · offen · 2026-10-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, DSFA)\
**Annahme.** Jeder Haken und das Ende gehen zuerst in die Warteschlange auf dem Gerät (unverschlüsselt; offen, ob die Prüfung das am Privattelefon trägt), dann an den Server. Auf dem Gerät liegen nur die Pläne, an denen der Zugang üben darf, mit den Feldern der Durchführung und dem Namen der vertretenen Person; alles fällt mit Abmelden, Kontowechsel, Wegfall beim Server und sieben Tage nach dem letzten Laden. **Grundlage.** ADR-024 Punkt 5. **Anker.** `OFFLINE_FRIST_TAGE`, `ablageplanSchema`. **Rücknahme.** Verschlüsseln oder nur im Speicher der Seite · Aufwand `klein`.

### ANN-360 — Das Diensttelefon wird je Konto und Gerät eingerichtet
Datenschutz · offen · 2026-10-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, DSFA)\
**Annahme.** Ein Konto mit Dokumentationsrecht und eigenem Tagesplan schaltet „Dokumentieren ohne Empfang“ für dieses Gerät ein, indem es die fünf Punkte der Gerätevorgabe bestätigt; vermerkt nur auf dem Gerät. Einrichtung und Entwürfe liegen in einer Dauerablage je Konto, die weder mit Abmelden, Kontowechsel noch Frist fällt, nur auf Wunsch. Offen, ob die Prüfung für Entwürfe eine Höchstdauer verlangt. **Grundlage.** ADR-024 Punkt 6. **Anker.** `ABLAGE_FUER_PRAXISKONTEN`, `dauerfachAendern`. **Rücknahme.** Ablage für Praxiskonten aus, Entwürfe vorher übertragen · Aufwand `klein`.

### ANN-361 — Der Tagesplan auf dem Gerät hat eine feste Feldliste ohne Zugangshinweis und gilt nur für heute
Datenschutz · offen · 2026-10-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Ein eingerichtetes Diensttelefon legt die eigene Tagesliste von heute ab: je Termin Kennung, Art, Zustand, Zeiten, Name, Adresse und Telefon, nie Zugangshinweis, Besonderheit, Doku-Stand, Kartenposition oder Kennung der Person. Sie fällt nach Tagesende, beim Abmelden, Kontowechsel, Ausschalten und bei gesperrtem Konto. **Grundlage.** ADR-024 Punkt 6. **Anker.** `tagesplanTerminSchema`, `alsTagesplanTermin`. **Rücknahme.** Zugangshinweis aufnehmen, mit Review · Aufwand `klein`.

### ANN-364 — Ereignisse im Training stehen am Trainingsverhältnis, brauchen die Einwilligung und erscheinen im Verlaufsbild
Datenschutz · offen · 2026-10-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Inhaber:in und Trainingsbetreuung vermerken am offenen Trainingsverhältnis Ereignisse (Arten wie in der Akte, Tag, Notiz) nur mit Einwilligung zu Gesundheitsangaben; Entfernen nimmt sie aus dem Verlauf, der Datensatz bleibt; das Büro liest. Je Frage zeigt ein Punktbild die Werte mit Ereignissen, Planwechseln und Terminen. **Grundlage.** ADR-021 Punkte 4 bis 6; Art. 9 Abs. 2 lit. a DSGVO. **Anker.** `public.training_course_events`, `app.training_health_consent`. **Rücknahme.** Ohne Einwilligung einzelne Arten erlauben · Aufwand `klein`.

### ANN-365 — Assessments im Training: frei benannte Tests, Seitenvergleich kleiner zu größer, nur mit Einwilligung
Datenschutz · offen · 2026-10-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); MDR-Prüfung (B1)\
**Annahme.** Ein Assessment ist ein frei benannter Test mit Tag, Messbedingungen, geplanter Wiederholung und 1 bis 20 Messungen, ohne Testbibliothek. Der Seitenvergleich ist die kleinere Seite in Prozent der größeren; welche Seite betroffen ist, sagt die Anwendung nicht. Festhalten dürfen Inhaber:in und Trainingsbetreuung, nur mit Einwilligung; das Büro liest. **Grundlage.** ADR-006 Punkte 2, 11 und 13; ADR-021 Punkt 4. **Anker.** `public.record_training_assessment`, `seitenProzent`. **Rücknahme.** Betroffene Seite wählbar · Aufwand `mittel`.

### ANN-370 — Gewohnheiten trägt die Praxis ein, die Person vermerkt Tage der letzten Woche
Datenschutz · offen · 2026-10-12 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Wer Pläne schreibt, trägt am offenen Verhältnis höchstens drei laufende Gewohnheiten ein. Die Person und ihre rechtliche Vertretung vermerken heute und die sechs Tage davor, nehmen Vermerke zurück (gelöscht) und pausieren; keine Serie, Quote oder Erinnerung. Im Training alles nur mit Einwilligung zu Gesundheitsangaben, weil offen ist, ob es solche sind. **Grundlage.** Art. 9 Abs. 2 lit. a DSGVO; ADR-021 Punkt 4; ADR-010 Punkt 15. **Anker.** `public.habits`, `app.habits_max_running`. **Rücknahme.** Zurücknehmen nachvollziehbar statt löschen · Aufwand `mittel`.

### ANN-371 — Anhänge von außen hängen an einem Schalter je Organisation, der von selbst an ist; ohne Virenprüfung
Datenschutz · entschieden (Jannes) · 2026-10-15 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, DSFA)\
**Annahme.** Ob Patient:innen und Kund:innen Fotos und Videos anhängen können, entscheidet `organizations.external_attachments_enabled`, Standard an; aus nur von Hand in der Datenbank, dann keine Aufnahme und kein Upload. Eine Virenprüfung gibt es nicht; Anhänge sind als „nicht auf Schadsoftware geprüft“ gekennzeichnet. **Grundlage.** Entscheidung Jannes 2026-10-15; ADR-017 Punkte 29 und 69. **Anker.** `app.external_attachments_enabled`. **Rücknahme.** Standard aus: Default und bestehende Zeilen auf `false` · Aufwand `klein`.

### ANN-386 — KI-erstellte Katalogtexte gelten bis zur Durchsicht als ungeprüft
Recht · offen · 2026-10-13 · — · Prüfpaket · Wiedervorlage: Rechtsprüfung (B2); Durchsicht durch Jannes vor dem Go-live\
**Annahme.** Ohne Prüfvermerk (setzt nur owner) gilt eine übernommene Variante als ungeprüft und heißt „KI-erstellt“; vor dem Einsatz bei Patient:innen sieht Jannes jede Übung eines Plans durch, eine Änderung des Inhalts nimmt den Vermerk. Art. 50 KI-VO verlangt wohl keine Kennzeichnung (Wortlaut ungeprüft), die Praxis ist kein Anbieter eines generativen Systems; der Hinweis ist freiwillig. **Grundlage.** § 630c Abs. 2 BGB; Art. 50 KI-VO. **Anker.** `public.set_exercise_variant_reviewed`. **Rücknahme.** Nur geprüfte Varianten zuweisen · Aufwand `klein`.

### ANN-476 — „Später da?“ als SMS aus der SMS-App des Diensttelefons
Datenschutz · offen · 2026-10-13 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007), mit B2 und PAT-006\
**Annahme.** „Später da?“ übergibt Mobilnummer und einen Vorlagentext ohne Namen und Gesundheitsangaben per `sms:` an die SMS-App; gesendet wird von Hand, ohne Dienstleister, Speicherung oder Protokoll. Praxisname und Nummer zeigen dem Netzbetreiber trotzdem die Beziehung. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO; § 203 StGB; wie Anruf und Terminmail aus dem eigenen Postfach (ANN-041). **Anker.** `verspaetungsText`, `smsHref` in `src/features/calendar/today/besuchswege.ts`. **Rücknahme.** `SpaeterDa` nicht mehr einsetzen · Aufwand `klein`.

### ANN-501 — Material und letzter Eintrag hinter „Vor der Tür“ an der Tageskarte
Datenschutz · offen · 2026-10-14 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung; Jannes (Sichtung Restbefunde)\
**Annahme.** „Vor der Tür“ an der Tageskarte zeigt neben Etage, Zugang und Kontakt das Material aus dem Tagesplan und, für Rollen mit Leserecht, den letzten Eintrag aus `get_appointment_brief`. Gelesen wird erst beim Öffnen, protokolliert wie der Kurzblick (`patient_record.viewed`, einmal je Akte und Tag). **Grundlage.** ADR-010 Punkt 16; ANN-200 (Lesen nur nach Handlung); ANN-138 (kein Material offen neben dem Namen). **Anker.** `mitEintrag` in `src/features/calendar/today/Tagesliste.tsx`. **Rücknahme.** Letzten Eintrag wieder nur im Kurzblick · Aufwand `klein`.

### ANN-511 — Fristanker der Akte: die letzte Behandlung, der Abschluss nur, wenn später
Datenschutz · entschieden (Jannes) · 2026-10-14 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (§ 630f Abs. 3 BGB)\
**Annahme.** Die Frist der Akte läuft ab dem spätesten Tag aus Behandlung, erfasster Leistung und Abschluss; ein künftiger Termin hält sie an, ohne Behandlung läuft keine; das steht in ADR-008 Punkt 11. Akten ohne Anker legt „Offen“ nach sechs Monaten vor. **Grundlage.** § 630f Abs. 3 BGB; ADR-008 Punkt 11; Entscheidung Jannes 2026-10-14. **Anker.** `app.patient_retention_anchor`, Klasse `patientenakte`, `public.list_care_without_conclusion`. **Rücknahme.** Anderer Anker in dieser Funktion · Aufwand `klein`, solange nichts gelöscht wurde.

### ANN-520 — Diktat: Vorschlag nur in der Seite, Rohaudio nie gespeichert
Datenschutz · entschieden (Jannes) · 2026-10-15 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung; Anbieter mit C6\
**Annahme.** Die Aufnahme geht nur für die Anfrage an den Gateway, sonst bleibt sie im Arbeitsspeicher; Transkript und Vorschlag nur im Zustand der Schreibseite, nie in Datenbank, Ablage, Log oder Gerätespeicher. Erst „Übernehmen“ macht den Text zum Entwurf; keine neue Datenklasse, E13 im Mock-Betrieb überbrückt. **Grundlage.** PROJECT_PRINCIPLES §6.3; ADR-016 Punkt 10; ADR-006 Punkt 8; Entscheidung Jannes 2026-10-15. **Anker.** `useDiktat` in `src/features/clinical/documentation/diktat.ts`. **Rücknahme.** Aufbewahren: Tabelle mit Klasse, Löschlauf, DSFA · Aufwand `groß`.

### ANN-541 — Umsatzsteuer: Heilbehandlung frei nur mit Verordnung, sonst Regelsatz am Posten
Recht · offen · 2026-10-15 · — · Prüfpaket · Wiedervorlage: Steuerberatung (B4, G13) vor dem ersten echten Rechnungslauf\
**Annahme.** Heilbehandlung, Hausbesuch als Nebenleistung und Wärmetherapie sind frei, wenn eine Verordnung den Zweck belegt; Ausfallhonorar ist nicht steuerbar; Abo, Personal Training und Pakete tragen 19 %. Ohne Verordnung gilt der Regelsatz, der ermäßigte ist gesperrt. Unter § 19 UStG trägt die Rechnung den festen Hinweis. **Grundlage.** § 4 Nr. 14 lit. a UStG; BFH V R 13/19; § 34a UStDV; ADR-009 Punkt 15. **Anker.** `app.small_business_notice`, `service_catalog_items_reduced_rate_not_activated`. **Rücknahme.** Constraint streichen · Aufwand `klein`.

### ANN-551 — Radflotte: eigene Fristen für Ereignisse und Schlüssel, keine Löschsperre
Datenschutz · offen · 2026-10-15 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Check-Ups, Pannen, Sperren und Stellen samt Fotos fallen nach `radflotte_ereignis` ab Ende des Ereignisjahres (Sperre: der Freigabe), nie bei offener Stelle oder Sperre; der Schlüsselverlauf nach `schluesselverlauf` ab der Rückgabe, nie je Person ausgewertet. Ein Rad kennt keine Löschsperre. **Grundlage.** §§ 195, 199 BGB (Nachweis der Pflege des Rads); PROJECT_PRINCIPLES §20. Unsicher: ob ein Unfall länger braucht. **Anker.** `public.retention_classes`. **Rücknahme.** Fristen der Klassen · Aufwand `klein`; Löschsperre am Rad · Aufwand `mittel`.

### ANN-552 — Fotos am Rad: eigener Bucket, derselbe Weg wie Dateien der Akte
Datenschutz · offen · 2026-10-15 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Fotos an einer Stelle oder am Check-Up liegen im privaten Bucket `radflotte`: zwei Phasen mit Prüfung am Server, ohne Metadaten, Ansehen über eine einmalige Freigabe. Hochladen nur zur eigenen Meldung binnen 24 Stunden, höchstens vier je Bezug; löschen dürfen die aufnehmende Person am selben Tag und `owner`. **Grundlage.** ADR-017 sinngemäß: Ein Foto kann nebenbei Personen oder Hausnummern zeigen, daher vor der Aufnahme „Nur das Rad fotografieren“. **Anker.** `app.fleet_photo_bucket`. **Rücknahme.** Bucket, Tabelle und Funktionen ändern oder Fotos abschalten · Aufwand `mittel`.

### ANN-558 — Pannenort als Freitext nur fürs Team, gelöscht mit der Freigabe
Datenschutz · offen · 2026-10-15 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Wo ein zurückgelassenes Rad steht, ist Freitext (bis 200 Zeichen) nur an einer Pannenmeldung mit diesem Abschluss. Er geht an keinen Dienst, nicht in die Werkstattunterlage und nicht in die Zusammenfassung und wird mit der Freigabe oder dem Ausmustern des Rads geleert. **Grundlage.** Der Ort liegt oft vor dem Haus einer Patientin und trüge nebenbei einen Patientenbezug (ADR-019); gebraucht wird er nur bis zur Abholung. **Anker.** Spalte `location_note` in `public.fleet_breakdowns`. **Rücknahme.** Leeren in `release_fleet_bike` streichen · Aufwand `klein`.

### ANN-560 — Vorlagen der Praxis: ohne Person, für alle Planrollen
Datenschutz · offen · 2026-10-16 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** „Als Vorlage speichern“ nimmt nur Varianten und Dosierung eines Plans, nie Hinweise, Person oder Leistungsbereich; Archiviertes bleibt draußen. Name, Ziel, Last und Tempo sind Freitext; dass dort kein Name steht, kann der Server nicht durchsetzen. Anlegen darf, wer Pläne schreibt, lesen, wer die Bibliothek liest; ändern und löschen Urheber:in und owner, ohne Frist. **Grundlage.** Fachwissen ohne Personenbezug wie die Bibliothek (ANN-292); Betriebsdaten (ADR-008). **Anker.** `app.can_write_exercise_plan_templates`. **Rücknahme.** Nur owner legt an: `app.can_manage_exercise_library()` · Aufwand `klein`.

### ANN-562 — Verordnung mit Verlauf: Fassung je Änderung, Löschen nur ohne Termine
Recht · offen · 2026-10-16 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (§ 630f BGB)\
**Annahme.** Jede Änderung am Inhalt einer Grundlage (Kopf, klinische Felder, Heilmittel und Menge) hält den Stand davor mit Zeitpunkt und Person fest, höchstens eine Fassung je Speichern; genutzte Menge, Freigabe und Reihenfolge zählen nicht. Löschen geht nur, solange nie ein Termin an ihr hing. **Grundlage.** § 630f Abs. 1 BGB; ADR-010 Punkt 15; ADR-016 Punkt 5; Art. 16 DSGVO (eine falsche Akte bleibt korrigierbar). **Anker.** `app.record_treatment_basis_version`. **Rücknahme.** Weiche Löschung statt Sperre, alle Lesepfade filtern · Aufwand `mittel`.

### ANN-569 — Meldungen der Flotte für Inhaber:in und Teamleitung
Datenschutz · entschieden (Jannes) · 2026-10-16 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (§20)\
**Annahme.** owner und team_lead lesen alle Check-Ups und Pannen in einer Liste (bis ein Jahr, höchstens 500) mit Prüfpunkten, Werbeflächen, Fotos, Stellen und dem Namen am Ereignis. Filter nach Art, Rad und Zeitraum, nie nach Person; keine Zählung je Person. **Grundlage.** PROJECT_PRINCIPLES §20 (keine Leistungs- oder Verhaltenskontrolle); dieselben Angaben zeigt `get_fleet_bike` jeder Praxisrolle je Rad; Entscheidung Jannes 2026-10-16. **Anker.** `app.can_read_fleet_reports`, `public.list_fleet_reports`. **Rücknahme.** Kreis in `app.can_read_fleet_reports` ändern · Aufwand `klein`.

### ANN-577 — Urlaubstage nach Wochenplan ohne Feiertage des Bundeslands
Recht · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Ein Urlaubstag ist ein Tag mit Block im geltenden Wochenplan (ohne Plan Montag bis Freitag), der kein gesetzlicher Feiertag des Bundeslands der Praxis ist (`organizations.federal_state`, BW oder NW, Voreinstellung BW). Gezählt wird am Server beim Beantragen, nur ganze Tage; ein Urlaub über den Jahreswechsel zählt je Jahr. **Grundlage.** § 3 Abs. 2 BUrlG; § 2 FeiertG NRW; Feiertagsgesetz BW; halbe Tage kennt das BUrlG nicht als Anspruch. **Anker.** `app.leave_days`, `app.is_public_holiday`. **Rücknahme.** Weitere Länder oder halbe Tage dort und in `feiertage.ts` · Aufwand `klein`.

### ANN-579 — Urlaub: Frist ab Jahresende, Abgelehntes und Zurückgezogenes kürzer
Datenschutz · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Genehmigte und stornierte Anträge sowie Ansprüche löscht der Lauf nach `urlaub` ab Ende des Kalenderjahres, abgelehnte und zurückgezogene nach `urlaub_kurz` ab ihrem Ende; Offenes nie. Storno und Abwesenheiten fallen mit, abweichend von ANN-030; mit Löschjournal. **Grundlage.** Keine gesetzliche Aufbewahrungspflicht; Verjährung nach §§ 195, 199 BGB, Verfallshinweis als Beweismittel (EuGH C-684/16); Art. 5 Abs. 1 lit. e DSGVO. **Anker.** Klassen `urlaub`, `urlaub_kurz`; `app.delete_due_staff_leave`. **Rücknahme.** Frist im Katalog ändern · Aufwand `klein`.

### ANN-580 — Urlaub: Notiz nur für die Person, fremde Konten nur owner
Datenschutz · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Die Notiz sieht nur die Person selbst. owner sieht am offenen Antrag Zeitraum, Tage, Konto, wer zugleich fehlt, Termine, abweichende Arbeitszeiten; fremde Konten nur owner. Andere sehen genehmigten Urlaub nur mit Name und Zeitraum ab heute, im Kalender ohne Bezug, Urheber, Zeitpunkt. **Grundlage.** Entscheidung Jannes 2026-10-09: „im Urlaub sehen andere nur den Zeitraum, nie den Grund“; Hinweispflicht des owner (EuGH C-684/16). **Anker.** `public.list_leave`, `app.can_read_staff_leave_balances`. **Rücknahme.** Notiz für Entscheidende öffnen (`to_decide`) · Aufwand `klein`.

### ANN-588 — Arbeitszeitänderung: nie weniger Stunden, Grenzen des ArbZG, nicht rückwirkend
Recht · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Ein Antrag sinkt nie unter die bisherige Arbeitszeit ohne Pausen (einmalig je Tag, dauerhaft je Woche) und gilt frühestens morgen. Gerät und Server prüfen: höchstens 10 h am Tag, Pause 30 min über 6 h und 45 min über 9 h in Abschnitten ab 15 min, höchstens 6 h am Stück, 11 h Ruhe. **Grundlage.** §§ 3, 4, 5 ArbZG (§ 5 Abs. 2 gilt nicht für eine Physiopraxis); Festlegung Jannes 2026-10-16. **Anker.** `app.working_time_problems`, `LIMITS` in `src/features/workforce/working-time/rules.ts`. **Rücknahme.** Grenzen in beiden Ankern · Aufwand `klein`.

### ANN-589 — Wochenplan in Fassungen ab einem Datum; beendete liest nur der Server
Datenschutz · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** `staff_working_hours` trägt `valid_from` und `valid_until`, je Tag gilt genau eine Fassung; eine genehmigte dauerhafte Änderung beendet die laufende am Vortag. Jede Praxisrolle liest die heute und künftig gültige Fassung des Wochenplans aller, beendete nur der Server, sonst stünde der Verlauf jeder Kollegin offen. **Grundlage.** PROJECT_PRINCIPLES §16; Entscheidung Jannes 2026-10-17. **Anker.** Policy `staff_working_hours_select_staff_only`. **Rücknahme.** Lesekreis der Policy ändern · Aufwand `klein`.

### ANN-590 — Arbeitszeitänderung: Zustände wie Urlaub, den Grund sehen nur die Person und owner
Datenschutz · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Beantragt, dann genehmigt oder abgelehnt (mit Grund), zurückziehen solange offen, kein Storno; owner entscheidet, nie den eigenen, und trägt die eigene direkt ein; genehmigt wird nur gegen den jetzigen Plan. Den freiwilligen Grund sehen nur die Person und owner, nicht das Büro und nicht die Teamleitung. **Grundlage.** Antragsmechanik wie Urlaub (ANN-576); Entscheidung Jannes 2026-10-17. **Anker.** `public.decide_working_time_request`, `public.list_working_time`. **Rücknahme.** Grund nur für die Person: ein Feld in `to_decide` · Aufwand `klein`.

### ANN-591 — Arbeitszeitänderung: Fristen
Datenschutz · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Genehmigte Anträge löscht der Lauf nach `arbeitszeit` ab Ende ihres Jahres, abgelehnte und zurückgezogene nach `arbeitszeit_kurz` ab ihrem Ende, offene nie; mit Löschjournal, auch nach einem Restore. Die Abweichung einer einmaligen Änderung fällt mit ihrem Antrag. Beendete Fassungen des Wochenplans bleiben ohne Frist (ANN-030) und sind nur für den Server lesbar. **Grundlage.** §§ 195, 199 BGB (Verjährung); keine Aufbewahrungspflicht. **Anker.** Klassen `arbeitszeit`, `arbeitszeit_kurz`; `app.delete_due_working_time_requests`. **Rücknahme.** Frist in `public.retention_classes` · Aufwand `klein`.

### ANN-593 — Zeitkonto: Einträge mit Beginn und Ende, gelten sofort
Recht · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Mehrarbeit und Freizeitausgleich stehen mit Datum, Beginn und Ende im Zeitkonto und gelten sofort, ohne Antrag. Mehrarbeit bis 31 Tage zurück, nie voraus und nur außerhalb der Arbeitszeit des Tages (an einem freien Tag ganz); Freizeitausgleich 31 Tage zurück bis ein Jahr voraus. Gezählt wird in Minuten am Server. **Grundlage.** EuGH C-55/18, BAG 1 ABR 22/21: Stunden ohne Lage genügen der Aufzeichnung nicht; Festlegung Jannes 2026-10-16. **Anker.** `app.time_account_check`, `src/features/workforce/timeaccount/rules.ts`. **Rücknahme.** Fristen an beiden Ankern · Aufwand `klein`.

### ANN-594 — Zeitkonto: Zurückweisen, Zurücknehmen, Buchen und Einsicht für andere
Datenschutz · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Nur owner weist Einträge mit Grund zurück, nie im eigenen Konto; sie bleiben sichtbar und zählen nicht. Zurücknehmen kann, wer eintrug, solange der Eintrag gilt, einen Freizeitausgleich nur bis zu seinem Beginn. owner und Büro buchen für andere und sehen fremde Zeitkonten, Korrekturen in Minuten mit Grund; im eigenen Konto nur owner. Die Teamleitung entscheidet nicht. **Grundlage.** Entscheidung Jannes 2026-10-17; wie ANN-576. **Anker.** `app.can_book_time_accounts`. **Rücknahme.** Büro aus `app.can_book_time_accounts` nehmen · Aufwand `klein`.

### ANN-596 — Zeitkonto: wer welches Konto sieht
Datenschutz · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Jede Person sieht ihr Konto mit Einträgen und Gründen; owner und Büro die Konten aller je Person samt Gründen, ohne Summe über alle; alle anderen Rollen nur ihr eigenes. Der Bezug einer Abweichung auf den Eintrag ist nicht lesbar. Wer für andere bucht, kann aus Minuten und Gründen der Vorschau die Zeiten der letzten 31 Tage erschließen. **Grundlage.** Entscheidung Jannes 2026-10-09 (BEF-066, Option 2 mit Büro); PROJECT_PRINCIPLES §20. **Anker.** `public.list_time_account`, `app.can_book_time_accounts`. **Rücknahme.** Gründe nur für owner: ein Feld in `list_time_account` · Aufwand `klein`.

### ANN-597 — Zeitkonto: Fristen
Datenschutz · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Gültige Einträge löscht der Lauf nach `zeitkonto` ab Ende ihres Jahres; ihr Saldo bleibt als Übertrag je Person und Jahr ohne Lage und Grund, ohne Frist (ANN-030). Zurückgewiesene und zurückgenommene fallen nach `zeitkonto_kurz`. Mit Löschjournal, auch nach einem Restore; die Abweichung fällt mit. Eine Löschsperre an der Person hält alle Einträge (ANN-674). **Grundlage.** §§ 195, 199 BGB; § 16 Abs. 2 ArbZG verlangt mindestens zwei Jahre. **Anker.** Klassen `zeitkonto`, `zeitkonto_kurz`; `app.delete_due_time_account_entries`. **Rücknahme.** Überträge mit dem Austritt befristen · Aufwand `klein`.

### ANN-601 — Erstattungen: IBAN je Person, maskiert, voll nur beim Auszahlen
Datenschutz · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Jede Person hinterlegt eine IBAN ohne eigenen Kontoinhaber, mit Prüfziffer am Server (ISO 13616). Person, owner und Büro sehen sie maskiert („DE89 •••• 3000“); voll sieht sie nur owner beim Auszahlen eines genehmigten Antrags, mit dem Tag der Hinterlegung. **Grundlage.** Art. 5 Abs. 1 lit. c, Art. 25 DSGVO; § 26 BDSG; Entscheidung Jannes 2026-10-17. **Anker.** `public.reimbursement_payout_details`, `app.mask_iban`. **Rücknahme.** Abweichender Kontoinhaber: Spalte und Feld · Aufwand `klein`.

### ANN-602 — Erstattungen: Fristen
Recht · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Ausgezahlte Anträge mit Belegen löscht der Lauf nach Klasse `erstattung` ab Ende des Jahres der Auszahlung, abgelehnte und zurückgezogene nach `erstattung_kurz` ab ihrem Ende, mit Journal; beantragte und genehmigte bleiben. Eine Löschsperre an der Person hält alle (ANN-674); die IBAN bleibt Beschäftigtendatum (ANN-030). **Grundlage.** § 147 Abs. 1 Nr. 4, Abs. 3 AO (Buchungsbelege); Entscheidung Jannes 2026-10-17. Unsicher, ob die Buchhaltung die Belege ohnehin aufbewahrt. **Anker.** `app.delete_due_reimbursements`. **Rücknahme.** Andere Frist: Intervall der Klasse `erstattung` · Aufwand `klein`.

### ANN-603 — Hinweise zwischendurch: ein Fenster zu passenden Zeitpunkten
Datenschutz · entschieden (Jannes) · 2026-10-17 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Ein Hinweis wie das Barometer erscheint nur in der Anwendung als Fenster zu passenden Zeitpunkten, an höchstens drei Tagen, nie als Push oder Mail; steht in ADR-024 Punkt 12 und §20.2 Nr. 2. Passend heißt: beim Öffnen der Übersicht, höchstens einmal am Tag, nicht im eigenen Termin oder 20 Minuten davor; der Merker liegt nur im Browser. **Grundlage.** §20.2 Nr. 2; ADR-024 Punkt 12. **Anker.** `passenderZeitpunkt` in `src/features/calendar/today/zwischendurch.ts`. **Rücknahme.** Abstand oder Häufigkeit: `ABSTAND_MINUTEN`, `HOECHSTENS_TAGE` · Aufwand `klein`.

### ANN-607 — Barometer: Fragen, namentlich, Frist
Datenschutz · entschieden (Jannes) · 2026-10-26 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Monatlich drei Skalen 1–9 (Stimmung, Touren, Miteinander) und zwei Freitexte, freiwillig, immer mit Namen und Zeitpunkt, einmal je Person und Monat, ab der ersten beschäftigten Person, nie für owner. owner liest jede Antwort einzeln, ohne Summe, Kurve oder Zählung; wer nicht antwortet, listet keine Funktion, ist aber ablesbar. **Grundlage.** §20.2; Art. 88 DSGVO, § 26 Abs. 2 BDSG (Freiwilligkeit offen); Entscheidung Jannes 2026-10-26. **Anker.** `public.submit_staff_barometer`, Klasse `rueckmeldung`. **Rücknahme.** Wieder ohne Namen: Wahl und Summe zurückholen · Aufwand `mittel`.

### ANN-608 — Rückmeldung an die Praxisleitung
Datenschutz · entschieden (Jannes) · 2026-10-26 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Jederzeit ein Freitext an owner, je Abgabe mit oder ohne Namen, nicht für owner. Ohne Namen zählt nur der Monat: owner sieht sie gemischt ab drei möglichen Teilnehmenden und fünf Rückmeldungen, in festen Blöcken abgeschlossener Monate; der Lauf schreibt sie dann neu, alte Zeilen bleiben bis VACUUM und in Backups lesbar (DSFA). Kein Auditeintrag, der Text nie in Fehlern. **Grundlage.** §20.2 Nr. 1 und 4; Art. 88 DSGVO, § 26 BDSG; ADR-010 Punkt 17. **Anker.** `public.submit_staff_feedback_message`. **Rücknahme.** Andere Schwelle in `app.staff_feedback_threshold` · Aufwand `klein`.

### ANN-609 — Teamchat: kein Lesen über andere, nur der eigene Stand
Datenschutz · offen · 2026-10-17 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Keine Lesebestätigung, kein Online-Status, kein „zuletzt gesehen“, keine Tipp-Anzeige. Der Lesestand je Person und Gespräch ist die Zeit der neuesten gesehenen Nachricht, nur für die eigenen Zähler; niemand sonst liest ihn, auch owner nicht, er fällt mit dem Ausscheiden. Direktnachrichten lesen nur die zwei Beteiligten. Bearbeiten ohne Verlauf, nur die Marke „bearbeitet“. **Grundlage.** §20; ADR-024 Punkt 12 sinngemäß; BAG 1 ABR 7/15; Art. 5 Abs. 1 lit. c DSGVO. **Anker.** `public.team_read_states`. **Rücknahme.** Freiwilliges „Gesehen“, mit ADR-Änderung · Aufwand `mittel`.

### ANN-610 — Teamchat: Löschen je Nachricht, Anker im Thread
Datenschutz · offen · 2026-10-17 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Jede Nachricht fällt nach Klasse `teamchat` ab ihrem Tag, mit Journal; eine fällige Ausgangsnachricht mit laufenden Antworten bleibt als Anker ohne Inhalt, auch nach eigenem Löschen; steht in ADR-008 Punkt 12. Leere Direkt- und Gruppennachrichten fallen nach derselben Frist ab Beginn, private Kanäle ohne aktives Mitglied sofort (ANN-642), offene Kanäle bleiben. **Grundlage.** Art. 5 Abs. 1 lit. e DSGVO. Unsicher, ob Direktnachrichten nach Austritt früher fallen. **Anker.** `app.delete_due_team_messages`. **Rücknahme.** Frist: Intervall der Klasse · Aufwand `klein`.

### ANN-616 — Büro sieht bei älteren Anträgen aus Touren weder Kilometer noch Betrag
Datenschutz · offen · 2026-10-26 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Gilt seit 2026-10-26 nur für ältere Ladestrom-Anträge aus Touren (ANN-749): Das Büro sieht sie mit Monat und Zustand, ohne Kilometer, Betrag, Verbrauch und Satz, weil der Betrag die Kilometer verriete; voll sehen sie nur die Person und owner. Das geht ANN-598 (Büro sieht alle Erstattungen) vor; für alle übrigen Anträge gilt ANN-598. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO, § 26 BDSG; §20 (Kilometer der Touren sind Standortdaten). **Anker.** `app.reimbursement_view`. **Rücknahme.** Büro sieht den Betrag: Tiefe in `list_reimbursements` · Aufwand `klein`.

### ANN-619 — Einwilligung am Profil, Frist und Zusammenführen
Datenschutz · entschieden (Jannes) · 2026-10-18 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (DSFA)\
**Annahme.** Die Einwilligung „Ernährungsberatung“ entsteht mit dem Profil; nach einem Widerruf ändern sich nur noch Einwilligung und Ende. Daten der Beratung fallen nach Klasse `ernaehrungsberatung` ab `ended_on`, früher mit dem Verhältnis; ein Legal Hold an der Akte hält, beim Zusammenführen zieht das Profil mit, ohne Zähler im Vermerk, ein zweites laufendes sperrt. **Grundlage.** Art. 7 Abs. 1 und 3 DSGVO; ADR-027 Punkte 3, 4 und 6; Entscheidung Jannes 2026-10-18. **Anker.** `app.delete_due_nutrition_profiles`. **Rücknahme.** Einwilligung je Verhältnis: Datenumzug · Aufwand `mittel`.

### ANN-622 — Ernährungsberatung als Position, erfasst am Termin
Recht · entschieden (Jannes) · 2026-10-18 · Jannes · Prüfpaket · Wiedervorlage: Steuerberatung (G13, B4)\
**Annahme.** Die Ernährungsberatung ist eine eigene Positionsart ohne Heilmittel, je Bereich eine Position; 19 % sind im Editor voreingestellt, nicht erzwungen. Erfasst wird sie am Termin mit dem Anlass „Ernährungsberatung“: Mit dem Haken entsteht die Position (ANN-664). **Grundlage.** ADR-027 Punkt 15; ADR-009 Punkte 15 und 16; Entscheidung Jannes 2026-10-18 (19 % bis G13, abgerechnet über einen eigenen Terminanlass). **Anker.** Constraint `service_catalog_items_nutrition_counselling`. **Rücknahme.** Kennzeichen erzwingen: eine Prüffunktion wie `app.aftercare_tax_allowed` · Aufwand `mittel`.

### ANN-640 — Teamchat: Lesestand je Thread, gelesen bis zur gezeigten Nachricht
Datenschutz · offen · 2026-10-18 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Jeder Thread hat einen eigenen Lesestand, gelesen gilt nur bis zur neuesten gezeigten Nachricht; man folgt, wenn man beginnt, antwortet oder erwähnt ist, in Direkt- und Gruppennachrichten jedem Thread, von Hand auch Folgen, Entfolgen und „ab hier ungelesen“. Den Stand sieht wie in ANN-609 nur die Person selbst. **Grundlage.** §20; ANN-609. **Anker.** `public.team_thread_states`, `app.team_unread`. **Rücknahme.** Folgen anders: `app.team_follow_thread` und seine Aufrufe · Aufwand `klein`.

### ANN-642 — Teamchat: private Kanäle und Gruppennachrichten
Datenschutz · entschieden (Jannes) · 2026-10-18 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Private Kanäle und Gruppennachrichten (drei bis neun Personen) lesen nur ihre Mitglieder, auch owner nicht. Private Kanäle legen owner und Teamleitung an, jedes Mitglied holt weitere dazu (sie lesen den Verlauf), verwaltende Mitglieder nehmen heraus, benennen um, archivieren; ohne aktives Mitglied fällt der Kanal mit Journal. Eindeutig sind nur Namen offener Kanäle; kein Umwandeln. **Grundlage.** §20; Art. 5 Abs. 1 lit. c DSGVO; Entscheidung Jannes 2026-10-18. **Anker.** `app.team_channel_readable`. **Rücknahme.** Alle legen an: `app.can_manage_team_channels` · Aufwand `klein`.

### ANN-644 — Teamchat: Reaktionen aus einer festen Auswahl, ohne Zeitpunkt
Datenschutz · offen · 2026-10-18 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Acht feste Reaktionen (Daumen, erledigt, schaue ich mir an, danke, Herz, lachen, feiern, Frage); wer reagiert hat, sehen alle, die das Gespräch lesen. Gespeichert wird kein Zeitpunkt, „Für dich“ meldet keine Reaktionen, sie fallen mit der Nachricht. **Grundlage.** §20 (freiwillige Antwort, keine Lesebestätigung); Art. 5 Abs. 1 lit. c DSGVO. **Anker.** Prüfung an `public.team_message_reactions`. **Rücknahme.** Andere Auswahl: Prüfung und `REAKTIONEN` im Client · Aufwand `klein`.

### ANN-646 — Teamchat: „Für später“ mit Erinnerung in der App
Datenschutz · offen · 2026-10-18 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Gemerktes sieht nur die Person selbst; eine Erinnerung (eine Minute bis 90 Tage) erscheint in der App und im Zähler, kein Push. Wann gemerkt oder erledigt wurde, wird nicht gespeichert; es verlängert keine Frist und fällt mit der Nachricht, beim Verlassen und mit dem Ausscheiden. **Grundlage.** §18, §20; ADR-024 W4 sinngemäß, den Teamchat regelt der ADR nicht. **Anker.** `public.team_saved_messages`, `public.list_team_saved`. **Rücknahme.** Push für Erinnerungen: eigener ADR zur Teamkommunikation · Aufwand `groß`.

### ANN-651 — Teamchat: Suche mit Filtern, nach einer Person nur mit Suchwort
Datenschutz · entschieden (Jannes) · 2026-10-18 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Die Suche findet in allen lesbaren Gesprächen ein Wort ab zwei Zeichen und filtert nach Gespräch, Person und Zeitraum; nach einer Person nur mit Suchwort. Das ist eine Hürde, keine Sperre; ob der Personenfilter bleibt, entscheidet die Datenschutzprüfung. Suchwörter stehen in keiner Adresse und keinem Log. **Grundlage.** §20 (keine Liste des Verhaltens einer Person); ADR-011; Entscheidung Jannes 2026-10-18. **Anker.** `public.search_team_messages`. **Rücknahme.** Ohne Personenfilter: `p_author` und das Feld „Von“ entfernen · Aufwand `klein`.

### ANN-652 — Teamchat: ungesendete Anhänge fallen beim Verwerfen oder nach 24 Stunden
Datenschutz · offen · 2026-10-26 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Ein Anhang ohne Nachricht fällt beim Entfernen oder nach einem Befund der Prüfung sofort, sonst im täglichen Lauf nach 24 Stunden, immer mit Löschauftrag und Journal, tageweise ohne Uhrzeit; der Lauf schreibt es über den Auslöser der Tabelle (ANN-752). Gebunden wird nur, was jünger als 24 Stunden ist; ungesendet sieht ihn niemand, je Person liegen höchstens 20. **Grundlage.** ADR-017 Punkte 7, 52 und 73; ADR-008 Punkt 8. **Anker.** `public.discard_stale_team_attachments`. **Rücknahme.** Lauf ohne Journal: Pause über `app.journal_paused` · Aufwand `klein`.

### ANN-655 — Teamchat: Sprachnachricht mit Dauer vom Gerät, eigene Datenschutzprüfung
Datenschutz · offen · 2026-10-18 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Die Dauer einer Sprachnachricht misst das Gerät, nur zur Anzeige, und die Datenschutzprüfung nimmt Sprachnachrichten als eigene Verarbeitung auf; steht in ADR-017 Punkt 84 und 87. Die zwei Minuten setzt die App durch, der Server prüft nur die gemeldete Dauer und die 10 MB; der Name lautet „Sprachnachricht TT.MM., hh:mm“. **Grundlage.** ADR-017 Punkte 83, 84 und 87; §20 (Stimme ohne Auswertung). **Anker.** `app.team_voice_max_seconds()`. **Rücknahme.** Dauer am Server lesen oder Größe je Sekunde begrenzen · Aufwand `mittel`.

### ANN-657 — Lizenzen der Lebensmitteldaten geprüft, Quellenangabe in der Anwendung
Recht · entschieden (Jannes) · 2026-10-19 · Jannes · Prüfpaket · Wiedervorlage: Rechtsberatung vor dem Start\
**Annahme.** BLS 4.0 steht seit 2025-12-16 unter CC BY 4.0 (Nennung des Max Rubner-Instituts mit DOI, Hinweis auf Änderungen), Open Food Facts unter ODbL 1.0 (Nennung, Lizenz). Beide Angaben zeigt die Anwendung aus `public.food_sources`; der Auszug wird nicht weitergegeben, darum keine Share-alike-Pflicht. **Grundlage.** CC BY 4.0; ODbL 1.0; ADR-027 Punkte 7 und 8; Entscheidung Jannes 2026-10-19. **Anker.** `public.food_sources`, `docs/betrieb/lebensmitteldaten.md`. **Rücknahme.** Text in `food_sources` per Migration ändern · Aufwand `klein`.

### ANN-665 — Den Anlass Ernährungsberatung sieht, wer den Termin sieht
Datenschutz · offen · 2026-10-19 · — · Prüfpaket · Wiedervorlage: DSFA (ADR-007)\
**Annahme.** Kalender, Tagesliste und Abrechnung zeigen den Anlass „Ernährungsberatung“ allen, die den Termin sehen (Büro, Therapie am Behandlungstermin); Profil, Zielwerte, Gewicht und Tagebuch bleiben bei der Fähigkeit. Die Plattform zeigt den Anlass nicht. **Grundlage.** ADR-027 Punkt 4 (schützt den Inhalt des Profils) und Punkt 15 (Rechnungsposten); ein verdeckter Termin machte Planen und Abrechnen unmöglich. **Anker.** Spalte `occasion` in `public.list_appointments`. **Rücknahme.** Anlass für Rollen ohne Fähigkeit in den Projektionen maskieren (`app.can_counsel_nutrition()`) · Aufwand `mittel`.

### ANN-667 — Profilbild: Einwilligung durch eigenes Hochladen, fällt mit dem Ausscheiden
Datenschutz · entschieden (Jannes) · 2026-10-19 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Ein Profilbild setzt nur die Person selbst; das Hochladen ist ihre Einwilligung, freiwillig, ohne Nachteil ohne Bild, jederzeit entfernbar. Sehen darf es nur das Team im Teamchat; es fällt beim Entfernen, Ersetzen und Ausscheiden sofort, mit Löschjournal (Klasse `profilbild`). **Grundlage.** Art. 6 Abs. 1 lit. a DSGVO, § 26 Abs. 2 BDSG; ADR-017 Punkt 95; Entscheidung Jannes 2026-10-19. Unsicher: § 26 BDSG nach EuGH C-34/21. **Anker.** `public.set_own_profile_picture`. **Rücknahme.** Schriftliche Einwilligung vor dem ersten Bild · Aufwand `mittel`.

### ANN-668 — Personenkarte im Teamchat: wer jemand in der Praxis ist, nicht was sie tut
Datenschutz · entschieden (Jannes) · 2026-10-19 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Ein Tipp auf das Bild einer Person öffnet ihre Karte mit Bild, Name, Praxisrollen und „Direktnachricht“; so sieht das Team die Rollen der anderen Teilnehmenden. Wer nicht teilnimmt, kommt ohne Namen und Rollen; Anwesenheit, „zuletzt aktiv“, Status, Telefon und Mail stehen nicht darauf. **Grundlage.** §20 (Verhalten wäre Leistungs- oder Verhaltenskontrolle); Entscheidung Jannes 2026-10-20 (Rollen sichtbar). **Anker.** `public.get_team_person`. **Rücknahme.** Rollen aus `get_team_person` nehmen · Aufwand `klein`.

### ANN-669 — Benachrichtigungen im Export, Ende mit der Lesezeit
Datenschutz · entschieden (Jannes) · 2026-10-19 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Der eigene Export trägt je Zugang die Wahl zu Benachrichtigungen, Tagebuch-Erinnerungen und Zustellaufträge, Geräte ohne Endpunkt; jede Vertretung exportiert ihre eigene Wahl, eine Begleitung nur diese. Wahl, Erinnerungen und Push-Registrierungen fallen mit Widerruf und Ende der Lesezeit, nicht mit einer Sperre, die aber den Export anhält; Zustellaufträge nach Klasse `benachrichtigung`. **Grundlage.** ADR-023 Punkt 13; ADR-024 Punkt 17; Entscheidung Jannes 2026-10-20. **Anker.** `public.platform_export_notifications`. **Rücknahme.** Begleitung ohne Export · Aufwand `klein`.

### ANN-672 — Anhänge an Rückfragen: Kopie je Anhang, auch gesperrt
Datenschutz · entschieden (Jannes) · 2026-10-20 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2); Verfahren der Betroffenenrechte (OPS-006)\
**Annahme.** owner gibt jeden bestätigten Anhang an einer Rückfrage einzeln als Kopie heraus, an Akte und Trainingsverhältnis, auch gesperrte; jede Kopie steht als `message_attachment.handed_out` im Protokoll; steht in ADR-017 Punkt 96 und ADR-010 Punkt 16. **Grundlage.** Art. 15 Abs. 3, Art. 20 DSGVO; Entscheidung Jannes 2026-10-20. **Anker.** `public.hand_out_message_attachment`. **Rücknahme.** Ohne eigene Aktion: `patient_file.handed_out` schreiben, die Aktion aus Katalog und Constraint nehmen · Aufwand `klein`.

### ANN-674 — Löschsperre auch für Beschäftigtendaten
Recht · entschieden (Jannes) · 2026-10-21 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** owner sperrt die Beschäftigtendaten einer Person wie eine Akte: Pflichtgrund, Aufheben schreibt fort, kein Auditeintrag. Solange die Sperre läuft, löscht der Lauf von dieser Person keinen Urlaub, keine Arbeitszeitänderung, keinen Zeitkonto-Eintrag und keine Erstattung, auch abgelehnte und zurückgezogene nicht; Teamchat, Radflotte und Rückmeldungen hält sie nicht. **Grundlage.** ADR-008 Punkt 7; Entscheidung Jannes 2026-10-17 (Zuschnitt). **Anker.** `public.place_staff_legal_hold`. **Rücknahme.** Teamchat oder Radflotte dazu: Prüfung in deren Löschregel · Aufwand `klein`.

### ANN-675 — Zeitkonto: Zurückweisung in der Übersicht ohne Grund
Datenschutz · entschieden (Jannes) · 2026-10-21 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Ein zurückgewiesener Freizeitausgleich steht bei der Person in der Übersicht unter „noch offen“, bis sein Tag vorbei ist: Tag und Zeiten, ohne Grund und ohne wer, die Zeile führt ins Zeitkonto. Zurückgewiesene Über- und Minusstunden stehen dort nicht; keine Benachrichtigung, kein Push, kein „gelesen“. **Grundlage.** §2.2 (die Übersicht steht in der Halterung, auch vor Patient:innen); Entscheidung Jannes 2026-10-17. **Anker.** `public.list_rejected_time_off`. **Rücknahme.** Grund in der Übersicht: ein Feld in `list_rejected_time_off` · Aufwand `klein`.

### ANN-677 — Quellenangabe der Nährwerte: Titel und Lizenz als Kopf, Zitierung auf Abruf
Recht · offen · 2026-10-22 · — · Prüfpaket · Wiedervorlage: Rechtsberatung vor dem Start (wie ANN-657)\
**Annahme.** Je Quelle stehen Titel und Lizenz sichtbar im Kopf eines Aufklappers; die volle Zitierung mit DOI, dem Hinweis auf Änderungen und dem Link zum Lizenztext steht darunter auf Abruf. Das genügt CC BY 4.0 und ODbL 1.0; unsicher bleibt, ob der Link zum Lizenztext sichtbar stehen muss. **Grundlage.** CC BY 4.0 Abschnitt 3(a)(2); ODbL 1.0 Abschnitt 4.3. **Anker.** `Quellenangabe` in `src/features/nutrition/LebensmittelSuche.tsx`. **Rücknahme.** Lizenzlink als Zeile über dem Aufklapper · Aufwand `klein`.

### ANN-689 — PIN-Felder der Einrichtung ohne Passwortmanager
Datenschutz · offen · 2026-10-23 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Die Felder „PIN“ und „PIN noch einmal“ in der Einrichtung tragen `autocomplete="off"`, nicht `new-password`, damit kein Passwortmanager die PIN speichert; sie bleiben ein Ziffernfeld (`inputmode="numeric"`). **Grundlage.** ADR-025 Punkt 11. **Anker.** `PinFestlegen` in `src/features/core/auth/einrichtung/PinFestlegen.tsx`. **Rücknahme.** `new-password` setzen · Aufwand `klein`.

### ANN-690 — Plattform: der eigene Name nur am lesbaren Zugang, die Vertretung mit ihrem eigenen
Datenschutz · offen · 2026-10-22 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Der Plattformkontext nennt an jedem lesbaren Zugang den eigenen Namen des Kontos: die Person mit Vor- und Nachnamen aus ihrem Verhältnis, eine Vertretung mit dem Namen aus ihrem Nachweis, nie dem der vertretenen Person. Gesperrt, nach der Lesefrist und in gesperrter Sitzung bleibt er leer. **Grundlage.** ADR-023 Punkt 22 (der eigene Name ist kein Inhalt der Akte). Unsicher, ob der Name aus dem Nachweis (ANN-203) dafür genutzt werden darf. **Anker.** `app.platform_own_name`. **Rücknahme.** Nur Vorname oder kein Name für Vertretungen: diese Funktion · Aufwand `klein`.

### ANN-693 — Einstieg: Einwilligung als gleich gewichtete Wahl
Datenschutz · offen · 2026-10-23 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Der Einstieg fragt nur offene, jetzt erteilbare Einwilligungen: „Ja, erlauben“ und „Nein“ stehen gleich gewichtet als Knöpfe, nichts vorgewählt, Pfeiltasten wählen nichts. Ein Ja gilt beim Wählen mit der Fassung des Texts, ein späteres Nein widerruft, die letzte Wahl gilt; ein Nein zu Offenem bleibt ungespeichert. **Grundlage.** Art. 9 Abs. 2 lit. a DSGVO; EDSA-Leitlinien 05/2020. Unsicher, ob die Prüfung eine Bestätigung verlangt. **Anker.** `offeneEinwilligungen` in `src/features/portal/platform/einstiegsablauf.ts`. **Rücknahme.** Rückfrage vor dem Ja wie unter „Ich“ · Aufwand `klein`.

### ANN-694 — Einstieg: ein Schalter für Mitteilungen, Push oder E-Mail
Datenschutz · offen · 2026-10-23 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2, mit ADR-024 Punkt 18)\
**Annahme.** Der Schalter schaltet je Zugang sechs Arten ein (Terminerinnerung, verschoben, abgesagt, Antwort auf eine Rückfrage, Terminwunsch beantwortet, neuer Plan), ohne, was die Praxis abgeschaltet hat: per Push, wenn das Gerät es kann, sonst per E-Mail. Aus nimmt sie heraus; das Telefon bleibt für andere Zugänge eingetragen. **Grundlage.** ADR-024 Punkte 11 und 15. Unsicher, ob eine Wahl für sechs Arten der Wahl je Art genügt. **Anker.** `MITTEILUNGSARTEN` in `src/features/portal/platform/einstiegsablauf.ts`. **Rücknahme.** Andere Arten in der Liste · Aufwand `klein`.

### ANN-703 — Löschjournal: Löschen einer Akten-Datei von Hand steht tageweise darin
Datenschutz · offen · 2026-10-27 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung (Löschkonzept)\
**Annahme.** Löscht eine Person eine Datei der Akte von Hand oder verwirft die Prüfung sie, steht das im Löschjournal ohne Lauf, tageweise (ANN-752). Wer von Hand gelöscht hat, steht am Löschauftrag (`ordered_by`), ein Verwerfen im Protokoll (`access.denied`), nicht im Journal. Offen, ob die Prüfung den Anlass im Journal verlangt. **Grundlage.** ADR-008 Punkt 8; ANN-752. **Anker.** `app.journal_patient_file_deletion`. **Rücknahme.** Anlass als Spalte im Löschjournal · Aufwand `mittel`.

### ANN-712 — Durchführung: wer die Einheit und den Satz sieht
Datenschutz · offen · 2026-10-24 · — · Prüfpaket · Wiedervorlage: vor dem Scharfschalten\
**Annahme.** Endseite und Satz am freien Feld nennen die Fachperson des nächsten bestätigten Termins („Anna Beispiel sieht …“), ohne Termin „Ihre Therapeut:in“ bzw. „Ihre Trainingsbetreuung“, auf der Endseite erst, wenn die Termine geantwortet haben. Ebenso nennt der Reiter Übungen, wer den Plan macht und die Einheit sieht (ANN-726). **Grundlage.** Handoff 2026-10-24, Abschnitt 5.5; der Plan trägt keinen Namen. **Anker.** `src/features/portal/platform/Durchfuehrung.tsx`. **Rücknahme.** Immer das Wort des Bereichs · Aufwand `klein`.

### ANN-750 — Auskunft für Beschäftigte und Verordner:innen von Hand
Datenschutz · offen · 2026-10-26 · — · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Für Beschäftigtendaten (Personal, Zeit, Urlaub, Erstattung, Radflotte, Teamchat, Praxiskonten) und für Verordner:innen gibt es keine Auskunftsfunktion; eine Auskunft nach Art. 15 DSGVO stellt die Inhaberin aus den Daten der Person zusammen. Das Register führt diese Tabellen als `manual`, mit Begründung. **Grundlage.** Art. 15 DSGVO; ADR-008 Punkt 13. Unsicher, ob die Prüfung für Beschäftigte eine Funktion verlangt. **Anker.** `public.data_registry` (`export_mode = 'manual'`). **Rücknahme.** Kopie für Beschäftigte wie `export_patient_record` · Aufwand `mittel`.

### ANN-752 — Löschjournal: ein Auslöser je Tabelle
Datenschutz · entschieden (Jannes) · 2026-10-27 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (ADR-007)\
**Annahme.** Jede Tabelle mit eigenem Journal trägt den Auslöser `journal_deletion`: Jede gelöschte Zeile steht im Löschjournal, auch aus Kaskaden; ein Lauf ergänzt den Eintrag, je Zeile und Transaktion bleibt einer. Ohne Lauf steht eine Löschung je Praxis und Tag ohne Uhrzeit, mit Uhrzeit nur beim Zusammenführen (ANN-150) und bei Verhältnis als Schlüssel; Nachziehen, Zusammenführen und Seed schalten den Auslöser ab. **Grundlage.** ADR-008 Punkte 8 und 13; §20; Entscheidung Jannes 2026-10-27. **Anker.** `app.journal_deletion`. **Rücknahme.** Wieder je Löschweg statt Auslöser · Aufwand `mittel`.

### ANN-753 — Zusammenführen: beendete Plattformzugänge der Dublette ziehen mit
Datenschutz · entschieden (Jannes) · 2026-10-27 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Beim Zusammenführen zieht ein entzogener Plattformzugang der Dublette samt Verhältnis und Einladungen auf die bleibende Akte und steht in deren Auskunft; Frist und Legal Hold folgen ihr. Ein laufender Zugang sperrt das Zusammenführen weiter; sonst bleiben Bezug und Verhältnis eines Zugangs fest. **Grundlage.** Entscheidung Jannes 2026-10-27; bisher stand ein solcher Zugang in keiner Auskunft. **Anker.** `app.platform_accesses_guard`, `app.merge_patients_core`. **Rücknahme.** Zurück zu `set null`: Umhängen und Ausnahme entfernen · Aufwand `klein`.

### ANN-763 — Auskunft nach Art. 15 auch je Trainingsverhältnis
Datenschutz · entschieden (Jannes) · 2026-10-18 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung\
**Annahme.** Die Praxis erteilt die Auskunft auch je Trainingsverhältnis: nur owner, auf Knopfdruck, als eigene Kopie ohne interne Kennungen. Geprüft und protokolliert wird sie wie die zur Akte, ein Eintrag `patient_record.exported` je Kopie. **Grundlage.** Art. 15 DSGVO; ADR-021 (eigenes Rechtsverhältnis mit eigener Kopie); Entscheidung Jannes 2026-10-18. **Anker.** `public.export_training_record`. **Rücknahme.** Mit der Auskunft zur Akte zusammenlegen · Aufwand `mittel`.

### ANN-814 — Widerruf zu Fotos trifft nur Arbeitshilfen
Datenschutz · entschieden (Jannes) · 2026-10-30 · Jannes · Prüfpaket · Wiedervorlage: Datenschutzprüfung (B2)\
**Annahme.** Widerruf: „Die Praxis löscht dann sofort alle Fotos, die als Arbeitshilfe entstanden sind; Fotos der Behandlungsdokumentation bleiben in der Akte.“ Fassung `2026-11` (ANN-262). **Grundlage.** ADR-017 Punkte 36 und 46; Art. 7 Abs. 3, Art. 17 Abs. 3 lit. b DSGVO; Jannes 2026-10-30. **Anker.** `EINWILLIGUNGSTEXTE` in `src/features/portal/platform/einwilligungstexte.ts`. **Rücknahme.** Wortlaut und Fassung an beiden Stellen · Aufwand `klein`.

## Fachregeln
### ANN-319 — Entwürfe sichern sich nach drei Sekunden Pause selbst; nach einem Fehlschlag setzt das aus
Technik · offen · 2026-10-10 · — · — · Wiedervorlage: —\
**Regel.** Steht ungespeicherter Text drei Sekunden still, sichert die Seite einen Entwurf (nie Finalisierung), an Termin, Nachtrag, Therapiebericht und Erhebung, nicht an Korrektur, Vermerk „Tür geöffnet, nicht behandelt“ oder ohne Netz. Ein abgebrochener Nachtrag bleibt und wird mit der Frist Version 1. **Grundlage.** ADR-016 Punkte 3 und 7. **Anker.** `SELBST_SICHERN_PAUSE_MS` in `Textverlustschutz.tsx`.

### ANN-320 — Im Konfliktfall wird der Text Nachtrag-Entwurf oder Korrektur; übergeben im Arbeitsspeicher
Praxisprozess · offen · 2026-10-10 · — · — · Wiedervorlage: —\
**Regel.** Ist ein Entwurf inzwischen finalisiert, bietet die Seite für eigenen Text „Als Nachtrag übernehmen“ (als Entwurf) und „In Korrektur übernehmen“. Der Text reist im Arbeitsspeicher, nie im Navigationszustand des Browsers; einen nur geänderten Entwurf ersetzt erst ausdrückliches Speichern. **Grundlage.** ADR-016 Punkte 3, 4 und 6. **Anker.** `useTextUebernahme` in `uebernahme.ts`.

### ANN-321 — Nach einem Storno sperrt das Datenmodell den Entwurf nur in derselben Klammer
Praxisprozess · offen · 2026-10-10 · — · — · Wiedervorlage: —\
**Regel.** Eine durch Storno freigegebene Leistung derselben Klammer (Person bzw. Verhältnis, Bereich, Grundlage, sonst Monat) kommt nur auf die Korrekturrechnung der stornierten Rechnung, solange diese keine Korrektur hat; je offenes Storno eine eigene. **Grundlage.** Entscheidung Jannes 2026-10-09 zum Weg mit Bezug, die Klammer ist angenommen; ADR-009 Punkt 9. **Anker.** `app.open_cancellation_holding_service`.

### ANN-341 — Ein Widerruf des Trainingsvertrags bleibt in Offene Punkte, bis sein Paket entfernt ist
Praxisprozess · offen · 2026-10-11 · — · — · Wiedervorlage: —\
**Regel.** Ein Widerruf über die Plattform steht in Offene Punkte, solange das Paket besteht und das Verhältnis nicht beendet ist, mindestens 14 Tage. Abgewickelt ist er erst mit dem Entfernen des Pakets; eine Rechnung darüber wird vorher storniert, ein Storno allein wickelt nicht ab, der Monatsentwurf sperrt kein Paket. **Grundlage.** ANN-290. **Anker.** `public.list_platform_training_withdrawals`.

### ANN-343 — Benachrichtigungen: Erinnerung am Vortag ab 17 Uhr, Ruhezeit 20 bis 8 Uhr für alle Arten, zehn je Woche und Weg
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Die Erinnerung entsteht ab 17 Uhr (Zeitzone der Praxis) für bestätigte Termine des nächsten Tages, freitags für Samstag bis Montag. Die Ruhezeit gilt für alle Arten; je Weg höchstens eine je Art und Tag und zehn je Woche; drei Zustellversuche, 24 Stunden nach Fälligkeit entfällt ein Auftrag. **Grundlage.** ADR-024 Punkte 15 und 16. **Anker.** `app.notification_rule`.

### ANN-346 — Ändert die Praxis einen Termin mit offenem Wunsch der Person, meldet nur die Antwort auf den Wunsch
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Verschiebt die Praxis einen Termin mit offenem Änderungs- oder Absagewunsch oder sagt ihn ab, entsteht keine Mitteilung „Termin verschoben/abgesagt“; die Person erfährt es als „Terminwunsch beantwortet“. Sonst ist jede Änderung eines bestätigten künftigen Termins eine Änderung durch die Praxis. **Grundlage.** ADR-024 Punkt 15. **Anker.** `app.notify_appointment_update`.

### ANN-348 — Erfassungsgrößen als Katalog nach Takt; nach einer Einheit Anstrengung und Schmerz, freiwillig
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Was erfasst werden kann, steht in einem Katalog mit Takt (`session` nach einer Einheit, `checkin`) und Wertebereich; eine neue Größe ist eine Zeile, kein neues Datenmodell. Nach einer Einheit fragt die Plattform Anstrengung und Schmerz (0 bis 10), freiwillig, im Training nur mit Einwilligung. **Grundlage.** ADR-006 Punkt 11. **Anker.** `app.tracking_parameters`.

### ANN-349 — Check-in: voreingestellt drei Fragen, höchstens fünf; der letzte Wert als Hinweis, nicht vorausgewählt
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Voreingestellt fragt ein Check-in Schmerz in Ruhe, Schmerz bei Belastung und Einschränkung im Alltag; die Praxis wählt eine bis fünf Fragen des Katalogs. Jede ist freiwillig, eine muss beantwortet sein; die letzte Angabe steht nur als Hinweis daneben. **Grundlage.** IDEA-TRK-002: Durchgeklickte Werte sind falsch statt fehlend. **Anker.** `app.checkin_keys_valid`.

### ANN-350 — Check-in alle 1 bis 28 Tage; fällig am Tag der Einstellung, dann vom letzten an; Verpasstes zählt nicht
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Die Praxis stellt je Verhältnis einen Takt von 1 bis 28 Tagen ein. Fällig ist der erste Check-in am Tag der Einstellung, jeder weitere den Takt nach dem letzten beantworteten; Verpasstes wird weder nachgeholt noch angemahnt, höchstens einer am Tag; nach dem Ende des Verhältnisses nichts mehr. **Grundlage.** IDEA-TRK-004. **Anker.** `app.checkin_due_on`.

### ANN-351 — Den Check-in stellen ein, die Pläne schreiben; lesen, die Pläne lesen
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Einstellen, ändern und beenden dürfen die Rollen, die im Bereich Übungspläne schreiben; lesen, wer die Pläne liest, auch das Büro. Das Lesen steht wie das Öffnen von Akte bzw. Trainingsverhältnis im Protokoll, eine Abweisung als `checkins.read`; keine neue Auditaktion. **Grundlage.** ADR-021 Punkt 10; ADR-010 Punkt 16. **Anker.** `app.can_write_exercise_plans`, `public.get_checkins`.

### ANN-352 — Check-in beantworten Person und rechtliche Vertretung, nicht die Begleitung; ohne Mitteilung an die Praxis
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Es antworten die Person und ihre rechtliche Vertretung, die Begleitung liest mit; im Training nur mit Einwilligung zu Gesundheitsangaben. Danach steht ein fester Satz mit 112 und 116117; die Praxis bekommt keine Mitteilung und keine Liste „Check-in ausgeblieben“ (ANN-762). **Grundlage.** ADR-023 Punkt 13; ADR-006 Punkt 11. **Anker.** Recht `checkin` in `app.platform_access_allows`.

### ANN-353 — Schmerz differenziert und Bewegungssicherheit als Fragen des Katalogs; nach der Einheit drei Fragen
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Der Check-in kennt Schmerz nach Belastung, nachts und morgens, die Dauer bis zum Ausgangsniveau (bis 72 Stunden), die Schmerzart (ANN-354) und die Bewegungssicherheit im Alltag. Nach einer Einheit fragt die Plattform als dritte freiwillige Frage, wie sicher sich die Übungen anfühlten. Keine Körperkarte. **Grundlage.** ADR-006 Punkte 4 und 11. **Anker.** `app.tracking_parameters`.

### ANN-354 — Eine Auswahl wird als ganze Zahl gespeichert; Schmerzart mit fünf Wörtern, eine Wahl
Technik · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Eine Frage mit Wörtern speichert die Stelle des Worts als ganze Zahl; die Wörter stehen nur in `src/lib/erfassungsgroessen.ts` und werden nie umsortiert, nur angehängt. Die Schmerzart fragt eines von dumpf, stechend, brennend, elektrisierend, ziehend. **Grundlage.** ADR-006 Punkt 11: Die Software ordnet die Art nicht ein. **Anker.** `pain_quality` in `app.tracking_parameters`, `wertText`.

### ANN-355 — Kontext zum Check-in: Uhrzeit von selbst, Schmerzmittel und Seite zuschaltbar neben den fünf Fragen
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Jeder Check-in trägt seine Uhrzeit, jede Einheit Beginn und Ende. Die Praxis kann Angaben zum Zusammenhang einschalten, „Schmerzmittel in den letzten 24 Stunden“ und „Seite“; sie zählen nicht zu den fünf Fragen, sind freiwillig und allein kein Check-in. **Grundlage.** Datenminimierung: nur auf Wahl der Praxis. **Anker.** Spalte `role` in `app.tracking_parameters`.

### ANN-366 — Die Übungsanalyse zählt je Übung beendete Einheiten mit allen, einem Teil oder keinem Satz
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Die Planseite zeigt je Position, in wie vielen beendeten Einheiten alle, ein Teil oder kein Satz abgehakt wurde, und die letzten fünf, je Planfassung. Keine Quote, keine Ursache, kein Austauschvorschlag; Last und Wiederholungen je Satz erfasst die Plattform nicht. **Grundlage.** ADR-006 Punkte 4, 10 und 13. **Anker.** `uebungsanalyse`, `app.exercise_plan_sessions_json`.

### ANN-368 — Schlafdauer in ganzen Stunden und Schmerzmittel an wie vielen der letzten 7 Tage sind Fragen des Check-ins
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Die Praxis kann zwei weitere Fragen wählen, die zu den fünf zählen: Schlafdauer der letzten Nacht in ganzen Stunden (0 bis 16) und an wie vielen der letzten 7 Tage Schmerzmittel bei Bedarf genommen wurden. Kein Wirkstoff, keine Dosis, kein Medikationsplan. **Grundlage.** ADR-006 Punkt 11. **Anker.** `sleep_hours`, `painkiller_days_7d` in `app.tracking_parameters`.

### ANN-369 — Aktivität außerhalb der Übungen: die größte Belastung seit dem letzten Check-in, als Zusammenhang
Praxisprozess · offen · 2026-10-12 · — · — · Wiedervorlage: —\
**Regel.** Der Check-in kann nach der größten Belastung außerhalb der Übungen fragen: Art (sieben Wörter), ungefähre Dauer und Anstrengung (drei Stufen). Es sind Angaben zum Zusammenhang wie in ANN-355, nur in der Tabelle; kein Freitext, kein Ziel, keine Summe, kein Vergleich. **Grundlage.** Art. 5 Abs. 1 lit. c DSGVO; ADR-006 Punkt 11. **Anker.** `activity_kind` in `app.tracking_parameters`.

### ANN-544 — Monatslauf: Verordnung erst mit Freigabe, sonst abgeschlossener Monat
Praxisprozess · offen · 2026-10-15 · — · — · Wiedervorlage: —\
**Regel.** Der Lauf legt Entwürfe nur für fertige Zeilen an: Verordnungen erst nach der Freigabe, alles andere nur abgeschlossene Monate; Korrekturen nach Storno bleiben einzeln. Ausgestellt wird nach Rückfrage jede Rechnung einzeln (`issue_invoice`), ein Fehlschlag hält die übrigen nicht auf. **Grundlage.** ADR-009 Punkt 24: Die Freigabe bedingt die einzelne Rechnung nicht. **Anker.** `fertig` in `src/features/billing/lauf.ts`.

### ANN-550 — Radflotte: Freigeben und von Hand sperren dürfen Inhaber:in und Teamleitung
Praxisprozess · offen · 2026-10-15 · — · — · Wiedervorlage: —\
**Regel.** Ein gesperrtes Rad freigeben (Sperre aufheben, offene Stellen erledigen) und ein Rad von Hand sperren dürfen `owner` und `team_lead`. Lesen, Schlüssel, Panne, Check-Up und Werkstattunterlage haben alle Behandlungsrollen samt Büro; Räder und Depots pflegt nur `owner`. **Grundlage.** PROJECT_PRINCIPLES §4.5; BEF-066. **Anker.** `app.can_release_fleet_bike`.

### ANN-553 — Check-Up: ein Haken der angemeldeten Person statt einer Unterschrift
Praxisprozess · offen · 2026-10-15 · — · — · Wiedervorlage: —\
**Regel.** Der Check-Up endet mit dem Kästchen „Ich, ‹Name›, habe das ganze Rad gründlich auf Sicherheit geprüft.“; am Check-Up stehen das angemeldete Konto und die Zeit, keine gezeichnete Unterschrift. **Grundlage.** Die Anmeldung mit Sitzungssperre (ADR-025) belegt die Person; eine Unterschrift wäre ein weiteres Datum über Beschäftigte. **Anker.** `p_confirmed` in `public.record_fleet_checkup`.

### ANN-554 — Radflotte: keine Schlüssel- und Zugangscodes, Standortvorlage nur zu lesen
Praxisprozess · offen · 2026-10-15 · — · — · Wiedervorlage: —\
**Regel.** Weder Rad noch Depot trägt einen Schlüssel-, Tresor- oder Zugangscode; ein Depot hat nur Name und Hinweis. Die Standortvorlage des Pannenablaufs (Köln, mit Platzhaltern) bleibt nur zu lesen, bis geprüfte Tübinger Angaben vorliegen. **Grundlage.** Ein Code gehört in die Zugangsverwaltung, nicht in jede Sicherung; PROJECT_PRINCIPLES §15.2. **Anker.** `Einstellungen` in `src/features/fleet/FleetPage.tsx`.

### ANN-561 — Durchsicht des Katalogs am Stück, nach Region, ein Tipp je Übung
Praxisprozess · offen · 2026-10-16 · — · — · Wiedervorlage: —\
**Regel.** Die Durchsicht zeigt owner jede übernommene, ungeprüfte, nicht archivierte Übung nach Region; „Durchgesehen“ setzt den Prüfvermerk (ANN-386), „Überspringen“ stellt sie hinten an. Einen Sammelvermerk gibt es nicht. **Grundlage.** ANN-386: Jannes sieht jede Übung an; ein Sammelvermerk lüde zum Abhaken ohne Lesen ein (§ 630c BGB). **Anker.** `offeneDurchsicht` in `src/features/exercise/exercises/durchsicht.ts`.

### ANN-611 — Teamchat: wer teilnimmt, wer Kanäle führt, wer entfernt
Praxisprozess · offen · 2026-10-17 · — · — · Wiedervorlage: —\
**Regel.** Jede Praxisrolle mit aktivem Mitarbeiterdatensatz nimmt teil, auch die Trainingsbetreuung; offene Kanäle legen owner und Teamleitung an und archivieren sie, ohne Startkanäle. owner entfernt fremde Nachrichten nur in offenen Kanälen und der Radflotte (`removed_by`, kein Audit); privat: ANN-642, @alle: ANN-647. **Grundlage.** §10; ADR-010 Punkt 15; Startkanäle: Jannes 2026-10-17. **Anker.** `app.can_manage_team_channels`.

### ANN-673 — Panne: Rufnummern der Stelle, letzte Behandlung bleibt eine Frage
Praxisprozess · offen · 2026-10-21 · — · — · Wiedervorlage: —\
**Regel.** Werkstatt und Teamleitung stehen in der Standortvorlage mit der Rufnummer der Stelle, nie einer Person; solange ein Platzhalter steht, zeigt die Panne „noch nicht hinterlegt“ statt eines Anrufknopfs. Der Ruhetag gilt nach dem Wochentag in der Zeit der Praxis; „Letzte Behandlung am Tag?“ bleibt eine Frage. **Grundlage.** ANN-554. **Anker.** `zustaendigeRufnummer` in `src/features/fleet/standortvorlage.ts`.

## Übrige Einträge
| Kennung | Titel | Kategorie · Status | Anker |
| --- | --- | --- | --- |
| ANN-002 | Versorgungsstatus `inactive` entfallen, jede Akte ist planbar | Praxisprozess · verworfen (→ ANN-510) | Constraint `patients_status_active_only` |
| ANN-004 | Raster und Arbeitszeiten schreiben keinen Auditeintrag | Datenschutz · verworfen (→ ADR-010 Punkt 16) | `public.set_appointment_grid` |
| ANN-005 | Abhaken ohne Dokumentationspflicht; die Kopplung sitzt an der Leistung | Praxisprozess · entschieden (Jannes) → ANN-513 | `public.complete_appointment` |
| ANN-006 | Office auf den Behandlungsnachweis beschränkt: aufgehoben, Office liest die Akte | Datenschutz · verworfen (→ ADR-004 Punkt 3) | `app.can_read_treatment_note` |
| ANN-007 | Automatische Finalisierung über `pg_cron` alle 15 Minuten | Technik · entschieden (Jannes) | `public.finalize_overdue_treatment_notes` |
| ANN-012 | Genutzte Menge wird nicht mehr von Hand gepflegt | Praxisprozess · verworfen (→ ANN-073) | `treatment_base_items.used_quantity` |
| ANN-015 | Verbindungsanzeige allein aus `navigator.onLine`, ohne Ping | Technik · entschieden (Jannes) | `src/app/verbindung.ts` |
| ANN-017 | Kartendienst-Adapter als Supabase Edge Function | Technik · in ADR überführt (ADR-019 Punkt 15) | `supabase/functions/location-provider/` |
| ANN-019 | Abstecher-Entwurf verfällt nicht, gebunden an Vorgang und Konto, nur im Arbeitsspeicher | Technik · entschieden (Jannes) | `src/lib/abstecher.ts` |
| ANN-022 | Tiefgrün der Marke ist der Hover-Zustand des Akzents | Technik · entschieden (Jannes) | `src/index.css` |
| ANN-023 | Kopfzeile zeigt die Marke, nicht den Organisationsnamen | Praxisprozess · entschieden (Jannes) | `src/app/AppShell.tsx` |
| ANN-027 | Kein Kennwort im Betrieb; 12 Zeichen gelten nur für Testkonten | Datenschutz · verworfen (→ ADR-025 Punkt 9) | `supabase/config.toml` |
| ANN-031 | Löschjournal hat eine eigene Frist (Klasse `loeschjournal`), länger als die Sicherungen | Datenschutz · verworfen (→ ADR-012 Punkt 12) | `public.deletion_journal` |
| ANN-032 | Ausdrücklicher Abschluss der Versorgung zählt nur, wenn er nach der letzten Behandlung liegt | Praxisprozess · verworfen (→ ADR-008 Punkt 11) | `app.patient_retention_anchor` |
| ANN-036 | Finalisierung hebt auch aus `confirmed` auf `documented`; den Haken setzt sie nur am Trainingstermin | Technik · in ADR überführt (ADR-018 Punkt 2) | `app.mark_appointment_documented` |
| ANN-037 | Feste Terminlänge entfallen; Länge im Raster, geprüft nur bei Änderung | Praxisprozess · verworfen (→ ANN-056) | `app.is_valid_treatment_length` |
| ANN-038 | Terminserie: drei Rhythmen, höchstens 30 Termine, das Kontingent begrenzt nicht | Praxisprozess · entschieden (Jannes) → ANN-210 | `app.appointment_series_limit` |
| ANN-042 | Ausgeschöpft ist eine Verordnung, wenn ihre möglichen Termine genutzt sind | Praxisprozess · entschieden (Jannes) | `verordnungszustand` in `src/features/patients/treatment-bases/grundlagen.ts` |
| ANN-045 | Gewöhnliches Abmelden beendet nur die eigene Sitzung (`scope: 'local'`) | Technik · entschieden (Jannes) | `src/features/core/auth/SessionProvider.tsx` |
| ANN-046 | Navigationsschutz: Data Router, drei Wege, „Speichern“ heißt Entwurf | Technik · entschieden (Jannes) | `src/app/Textverlustschutz.tsx` |
| ANN-047 | Ausfallgebühr nur bei Absage oder Verlegung durch die Patient:in | Praxisprozess · in ADR überführt (ADR-018 Punkt 8) | `app.is_late_cancellation` |
| ANN-048 | Eingang der Absage: „Gerade eben“ setzt der Server, sonst Ortszeit der Praxis | Praxisprozess · entschieden (Jannes) | `public.cancel_appointment` |
| ANN-049 | Interne Termine stehen in derselben Tabelle wie Behandlungstermine | Technik · entschieden (Jannes) → ADR-022 Punkt 1 | Constraint `appointments_kind_fields` |
| ANN-050 | Kalender trägt Patient:in und Verordnung als Kennung im Kontext | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/calendar.ts` |
| ANN-051 | Ein Teamereignis ist ein Vorgang, die einzelne Teilnahme bleibt getrennt | Praxisprozess · entschieden (Jannes) | `public.update_appointment_event` |
| ANN-053 | Server prüft Typ, SHA-256 und Metadaten am Inhalt, scharf mit der Providerprüfung | Technik · in ADR überführt (ADR-017 Punkt 49) | `app.patient_file_verification_required` |
| ANN-054 | Dependency-Audit blockiert den Merge ab Schweregrad `high` | Technik · entschieden (Jannes) | `.github/workflows/ci.yml` |
| ANN-055 | Protokoll und Ausfallgebühr des Nichtantreffens gelten am Hausbesuch | Praxisprozess · entschieden (Jannes) | `public.record_no_show` |
| ANN-056 | Terminlänge ist ein Vielfaches des Rasters, geprüft nur bei Änderung | Praxisprozess · entschieden (Jannes) | `app.is_valid_treatment_length` |
| ANN-057 | Ein vergangener Tag braucht eine Bestätigung, kein Auditkennzeichen | Praxisprozess · entschieden (Jannes) | `public.create_appointment` |
| ANN-058 | Rückfragen fern vom Auslöser erscheinen als Fenster über dem Inhalt | Technik · entschieden (Jannes) | `src/components/ui/Dialogfenster.tsx` |
| ANN-059 | Serie und Vorkommen sind zwei Kennungen, serienweite Vorgänge wirken nur nach vorn | Technik · entschieden (Jannes) | `public.update_event_series` |
| ANN-062 | Adresse der Akte behält `verordnungen`, die Beschriftung nicht | Technik · entschieden (Jannes) | `src/routes/AuthenticatedRoutes.tsx` |
| ANN-064 | Die Terminzahl steht an der Grundlage, die Leistungsmenge an der Position | Praxisprozess · entschieden (Jannes) | `app.treatment_basis_slot_counts` |
| ANN-066 | Heilmittelkatalog ist eine Liste im Code, die Datenbank prüft den Wert nicht | Technik · entschieden (Jannes) | `src/features/patients/treatment-bases/heilmittel.ts` |
| ANN-067 | Gedeckt sind die frühesten Termine einer Grundlage, gerechnet statt zugeteilt | Praxisprozess · entschieden (Jannes) | `app.appointment_basis_position` |
| ANN-068 | Übertragen wird jeder Termin der Patient:in außer abgesagten und abgerechneten | Praxisprozess · entschieden (Jannes) | `public.transfer_appointments_to_treatment_basis` |
| ANN-069 | Akte gruppiert Termine je Richtung, darin je Grundlage | Technik · entschieden (Jannes) | `src/features/calendar/appointments/PatientAppointmentsPage.tsx` |
| ANN-070 | Katalogversion ist eine eingefrorene Preisliste, die Leistung verweist auf ihre Position | Technik · in ADR überführt (ADR-009 Punkt 5) | `app.active_service_catalog_version` |
| ANN-071 | Preise pflegt `owner`; von Hand erfassen und lesen Leistungen `owner` und Büro | Praxisprozess · entschieden (Jannes) → ANN-513 | `app.can_record_billable_services` |
| ANN-072 | Leistung nur aus dokumentiertem und abgehaktem Termin oder Gebührenanlass, ohne Override | Praxisprozess · entschieden (Jannes) → ANN-513 | `app.appointment_is_billable` |
| ANN-073 | Genutzte Menge der Position schreibt die Leistungserfassung fort | Praxisprozess · entschieden (Jannes) | `billable_services.treatment_base_item_id` |
| ANN-076 | Der Rechnungsempfänger ist eine eigene Zeile, Vorgabe ist die Patientin selbst | Praxisprozess · entschieden (Jannes) | `public.invoice_recipients` |
| ANN-077 | Rechnung je Behandlungsgrundlage, ohne Grundlage je Person, Monat und Bereich; Diagnose im Snapshot | Praxisprozess · verworfen (→ ADR-009 Punkt 23) | `public.create_invoice_draft_for_basis` |
| ANN-078 | Zahlungen sind Transaktionen mit Richtung, der Zahlungsstand wird gerechnet | Praxisprozess · entschieden (Jannes) | `app.invoice_payment_state` |
| ANN-080 | Zahlungserinnerung ohne Stufen, mit festgeschriebenem Betrag | Praxisprozess · entschieden (Jannes) | `c_frist_tage` in `public.create_payment_reminder` |
| ANN-081 | Bis ADR-018 Punkt 2 umgesetzt ist, ist abgerechnet die Leistung, nicht der Termin | Technik · entschieden (Jannes) | `public.transfer_appointments_to_treatment_basis` |
| ANN-083 | Instrumentenbibliothek: Dateien im Release sind die Quelle, ohne Mandantenbezug; die Datenbank hält eine erzeugte Kopie (ANN-219) | Technik · entschieden (Jannes) | `src/features/clinical/assessments/definitionen.ts` |
| ANN-084 | Definitionen tragen eine semantische Version, Vergleichbarkeit vermerkt `meta.vergleichbar_mit` | Technik · entschieden (Jannes) | `versionSchema` in `src/features/clinical/assessments/schema.ts` |
| ANN-085 | Ein Instrument ohne Wertung trägt die Richtung `nicht_anwendbar`; rechnet es, ist `scoring.leseart` Pflicht | Technik · entschieden (Jannes) | `RICHTUNGEN` in `src/features/clinical/assessments/schema.ts` |
| ANN-087 | Kein `skip_logic` im Item-Schema, bis ein Instrument eine Sprungregel braucht | Technik · entschieden (Jannes) | `scoreItemSchema` in `src/features/clinical/assessments/schema.ts` |
| ANN-089 | `MDR_REVIEW_REQUIRED` als Register mit gesperrten Adressen; geöffnet wird nur mit vollständigem Freigabevermerk | Technik · entschieden (Jannes) (→ ADR-006 Punkt 6) | `src/app/mdr.ts` |
| ANN-090 | Fehlende Einrichtung des Kartendienstes ist die Fehlerklasse `not_configured`, nie die Nachbildung | Technik · entschieden (Jannes) | `LocationErrorCode` in `src/lib/location/contract.ts` |
| ANN-091 | Eine Fahrzeitmatrix trägt höchstens 25 × 25 Punkte, als interne Grenze, nicht als Anbieterlimit | Technik · entschieden (Jannes) | `MAX_MATRIX_PUNKTE` in `src/lib/location/matrix.ts` |
| ANN-095 | Verortet wird auf Handlung, ohne Rückfrage nur ein eindeutiger Treffer; die Koordinate geht in künftige Hausbesuche | Praxisprozess · entschieden (Jannes) (→ ADR-019 Punkt 37) | `public.set_patient_address_coordinate` |
| ANN-097 | Fahrpuffer: Fahrzeit live und mit Faktor, Rundung im Server, Warnung statt Sperre | Praxisprozess · entschieden (Jannes) | `public.check_travel_buffers` |
| ANN-098 | Fehlt ein gewerteter Wert, rechnet der Kern für die Skala keinen und nennt die fehlenden Items | Praxisprozess · entschieden (Jannes) | `src/features/clinical/assessments/rechnen.ts` |
| ANN-099 | Ohne Vorlage inaktiv; PSFS entfällt, NRS und Veränderungsfrage werden Praxisvorgabe | Technik · entschieden (Jannes) | `scoreDefinitionSchema` |
| ANN-100 | Test-Umgebung: Migrationen nach grüner CI, Neuaufsetzen mit Seed nur von Hand, Zugang aus einem Secret | Technik · entschieden (Jannes) | `supabase/testumgebung/neu-aufsetzen.psql` |
| ANN-101 | Test-Umgebung: Kopfzeilen und CSP über eine erzeugte `.htaccess`, zweite Tür per Basic-Auth nur optional | Technik · entschieden (Jannes) | `scripts/testumgebung.mjs` |
| ANN-102 | Anamnesebogen V8 ohne Punktwerte; eine Erhebung speichert die Kennung der Option | Technik · entschieden (Jannes) | `optionKennung` in `src/features/clinical/assessments/schema.ts` |
| ANN-103 | Ein Fragebogen ist Entwurf oder abgeschlossen; korrigiert wird als neue Erhebung | Praxisprozess · entschieden (Jannes) | `app.guard_questionnaire_response` |
| ANN-105 | Antworten prüft auch der Server gegen die Definition ihrer Fassung, nicht nur ihre Form | Technik · verworfen (→ ANN-219) | `app.assert_questionnaire_answers` |
| ANN-106 | Verlauf: Rohwerte als Punkte, fünf Ereignisarten; Entfernen setzt `removed_at` statt zu löschen | Praxisprozess · entschieden (Jannes) | `public.patient_course_events` |
| ANN-107 | Das Körperschema ist Jannes' Zeichnung; ein Kreis an der Stelle, gespeichert Stelle und nächster Bereich | Praxisprozess · entschieden (Jannes) | `src/features/clinical/assessments/koerperschema.ts` |
| ANN-108 | Anlegen-Menü als Leiste unter dem Raster; ein zweiter Tipp hebt auf oder zieht die Spanne auf | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/useSpanneAufziehen.ts` |
| ANN-109 | Über dem Kalender Monat, Person mit Woche und „Jetzt“; alles Übrige hinter der Ecke des Rasters | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/CalendarPage.tsx` |
| ANN-110 | Das Web-Manifest nennt das Master als maskierbares Symbol und öffnet mit `minimal-ui` | Technik · entschieden (Jannes) | `public/manifest.webmanifest` |
| ANN-111 | Begriffe stehen in einer Datei, abgelöste Wörter sperrt ein Test; im Kalender „Fehlzeit“, im Team „Mitarbeiter:in“ | Praxisprozess · entschieden (Jannes) | `ABGELOESTE_BEGRIFFE` in `src/lib/begriffe.ts` |
| ANN-112 | Ein Bereich öffnet auf seinem ersten echten Punkt; Vorschauen stehen eingeklappt dahinter | Praxisprozess · entschieden (Jannes) | `src/components/ui/SubNav.tsx` |
| ANN-113 | Die Tour ist eine Ansicht des Kalenders, ein Tipp im Kopf; der Kalender hat keine Unterzeile | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/CalendarPage.tsx` |
| ANN-114 | Der Kalender reicht bis an den Rand, Listen und Texte behalten die Kappung | Technik · entschieden (Jannes) | `RANDLOSE_SEITEN` in `src/app/navigation.tsx` |
| ANN-115 | Ein abgewiesener Schreibversuch steht als `access.denied` und antwortet mit HTTP 403; der Client prüft den Status | Technik · entschieden (Jannes) | `app.record_denied_write`, `src/lib/abgewiesen.ts` |
| ANN-117 | Tagesstart: der nächste Weg folgt der Uhr, „ab n. Besuch“ zählt unter den Hausbesuchen des Tages | Praxisprozess · entschieden (Jannes) | `src/features/calendar/today/tagesstart.ts` |
| ANN-118 | MT-Bausteine wörtlich: drei Lücken bleiben als unvollständig sichtbar, Hinweise getrennt, kein Grenzwert | Praxisprozess · entschieden (Jannes) | `blockSchema` in `src/features/clinical/assessments/schema.ts` |
| ANN-119 | Offensichtliche Tippfehler der Bausteinvorlage sind korrigiert (1.0.1), Kennungen und Dokumentation bleiben | Praxisprozess · entschieden (Jannes) | `src/features/clinical/assessments/definitionen/bausteine/README.md` |
| ANN-120 | Bausteine erzeugen Text für die Doku des Termins; Häkchen und Werte sichert `treatment_draft_findings` bis zum Festschreiben | Praxisprozess · entschieden (Jannes) | `public.save_treatment_draft_findings` |
| ANN-122 | Was in den Bericht geht, kreuzt die Therapeut:in an; nichts ist vorbelegt, alles wörtlich | Praxisprozess · entschieden (Jannes) | `app.therapy_report_pruefen` |
| ANN-129 | Seite an Extremitäten und Kiefer einmal je Region, an der Wirbelsäule je Test; „beidseits“ fragt vor dem Verwerfen | Praxisprozess · entschieden (Jannes) | `src/features/clinical/assessments/dokumentationstext.ts` |
| ANN-130 | Bausteintext gegliedert, Ergebnis ausgeschrieben, Zeichen nur ergänzend; Ausgangsstellung nur beim Abhaken | Praxisprozess · entschieden (Jannes) | `src/features/clinical/assessments/dokumentationstext.ts` |
| ANN-131 | Rechnung, Storno und Erinnerung für den Fensterumschlag nach DIN 5008 Form B, Fenster links | Praxisprozess · entschieden (Jannes) | `src/features/billing/Briefkopf.tsx` |
| ANN-132 | Die Dringlichkeit auf der Warteliste ist organisatorisch: drei Gründe und ein Datum | Praxisprozess · entschieden (Jannes) | `app.waitlist_check_input` |
| ANN-135 | Gebietstage: genaue Postleitzahl, Tageshälfte am Beginn, Warnung statt Sperre | Praxisprozess · entschieden (Jannes) | `app.territory_day_status` |
| ANN-136 | Terminsuche: dicht gepackte Vorschläge, Fahrzeit als Warnung für die ersten zehn | Praxisprozess · entschieden (Jannes) | `public.find_free_slots` |
| ANN-138 | „Mitnehmen“: von Hand gepflegte Liste an der Person, nie aus der Akte abgeleitet | Praxisprozess · entschieden (Jannes) | `public.set_take_along_items` |
| ANN-140 | Heilmittel am Termin bestätigen entfällt, die Leistung entsteht mit Haken und Doku; die Rollenregel am eigenen Termin bleibt | Praxisprozess · verworfen (→ ANN-513) | `app.can_record_services_for_appointment` |
| ANN-141 | Verordnung ohne Papier: Das Foto hängt bis zum Erfassen an der Person, sein Objektschlüssel bleibt | Praxisprozess · entschieden (Jannes) | `public.assign_prescription_scan` |
| ANN-143 | Erstaufnahme aus der Akte abgeleitet, heute zwei Punkte; die Liege leer heißt „noch nicht entschieden“ | Praxisprozess · verworfen (→ ANN-224) | `app.intake_checklist` |
| ANN-145 | Dublettenhinweis: gleicher Nachname und gleiches Geburtsdatum oder gleicher Vorname, nur als Hinweis | Praxisprozess · entschieden (Jannes) | `public.find_possible_duplicates` |
| ANN-146 | Erinnerungen fragen nur: Verordnung endet, Akte ohne Behandlung | Praxisprozess · entschieden (Jannes) | `app.ending_treatment_bases` |
| ANN-147 | Zusammenführen: die bleibende Akte behält ihre Stammdaten, Leeres füllt die Dublette, Freitexte werden angehängt | Praxisprozess · entschieden (Jannes) | `app.merge_patients_core` |
| ANN-149 | Zusammenführen sperrt statt zu raten: Konto oder nicht entzogener Zugang an der Dublette, zwei Monatsentwürfe, zwei offene Wartelisteneinträge, Textlänge | Praxisprozess · entschieden (Jannes) | `app.patient_merge_plan` |
| ANN-151 | Statistik: Umsatz brutto nach Rechnungsstellung als Praxissumme mit Aufteilung je Bereich, Zahlungseingang getrennt | Praxisprozess · entschieden (Jannes) | `public.get_practice_statistics` |
| ANN-153 | Statistik: Ausfälle sind Absagen und Verlegungen durch Patient:innen und Nichtantreffen; Honorar ist, was erfasst ist | Praxisprozess · entschieden (Jannes) | `public.get_practice_statistics` |
| ANN-155 | Statistik: Richtung der Zielwerte und genau eine Handlung je Kennzahl | Praxisprozess · entschieden (Jannes) | `src/features/billing/statistics/kennzahlen.ts` |
| ANN-157 | Vergütungsmodell: zwei Werte, owner trägt ein, ohne Angabe kein Umsatz für die Person | Praxisprozess · entschieden (Jannes) | `public.set_staff_compensation_model`, `app.has_revenue_share` |
| ANN-179 | Eine Vereinbarung im Training sperrt nicht, wenn die Anzahl erreicht ist | Praxisprozess · entschieden (Jannes) | `public.create_training_basis`, `public.conclude_training_basis` |
| ANN-181 | Im Training entsteht eine Leistung aus dem durchgeführten Termin, im Paketzeitraum keine | Praxisprozess · entschieden (Jannes) | `app.appointment_is_billable`, `app.training_package_covering` |
| ANN-185 | Ein abgeschlossenes Trainingsprotokoll ist unveränderlich; Korrekturen kommen als Nachtrag | Praxisprozess · entschieden (Jannes) | `public.training_protocols_guard`, `public.add_training_protocol_addendum` |
| ANN-186 | Am Trainingstermin vermerken owner, Trainingsbetreuung und Büro „durchgeführt“ | Praxisprozess · entschieden (Jannes) | `public.appointments_training_protocol_guard` |
| ANN-187 | Ein Plattformkonto hat kein Profil in `user_profiles`; Praxis- und Plattformkonto schließen sich aus | Technik · entschieden (Jannes) | `app.user_profiles_not_platform_account` |
| ANN-190 | Ohne Geburtsdatum gibt es keine Einladung zu einem eigenen Zugang | Praxisprozess · entschieden (Jannes) | `public.invite_platform_access`, `app.platform_min_age_years` |
| ANN-192 | Der Hausbesuch ist die Regel und trägt kein Wort; Praxis- und Videotermin tragen ihr Kennzeichen | Praxisprozess · entschieden (Jannes) | `src/lib/termin.ts` |
| ANN-193 | Die behandelnde Person steht am Termin nur, wenn sie nicht die angemeldete ist | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/AppointmentHeadline.tsx` |
| ANN-195 | Der Wegbalken rechnet in echten Minuten; die Rundung aus §8.1 bleibt beim Server | Praxisprozess · entschieden (Jannes) | `src/components/ui/travelPlan.ts` |
| ANN-196 | Wegbalken ab Ende des Termins davor, dann herunterzählend; der erste Weg beginnt jetzt, an Garage oder Praxis (ANN-240) | Praxisprozess · entschieden (Jannes) | `src/features/calendar/today/tagesstart.ts` |
| ANN-197 | Das Stockwerk kommt vom Anfang des Zugangshinweises, bis es ein eigenes Feld gibt | Technik · entschieden (Jannes) | `src/features/calendar/today/stockwerk.ts` |
| ANN-198 | Der Hinweis auf die vorherige Absage bleibt am Hausbesuch als eine Zeile | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/HomeVisitFlow.tsx` |
| ANN-199 | Haken und kompakte Knöpfe bleiben bei 44 px | Praxisprozess · entschieden (Jannes) | `src/components/ui/buttonStile.ts` |
| ANN-201 | „Doku offen“ sehen alle mit Leserecht der Dokumentation; die Aufgabe bleibt bei den Schreibenden | Praxisprozess · entschieden (Jannes) | `src/features/calendar/today/api.ts` |
| ANN-202 | Kalender nach dem Handoff: Panel als Karte, schlanker Kopf, Woche Montag bis Sonntag | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/TerminPanel.tsx` |
| ANN-210 | Genutzt ist ein durchgeführter Behandlungstermin, auch ohne finalisierte Dokumentation | Praxisprozess · entschieden (Jannes) | `app.treatment_basis_slot_counts` |
| ANN-211 | Durchgeführte Termine lassen sich übertragen, stehen aber zugeklappt und nicht vorgewählt | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/TermineUebertragenPage.tsx` |
| ANN-212 | Eine Verlegung mit Gebühr ist eine Absage „Patient:in hat verlegt“; nur die Zeit ändern bleibt gebührenfrei | Praxisprozess · in ADR überführt (ADR-018 Punkt 8) | `app.is_late_cancellation` |
| ANN-213 | Auf eine Gebühr verzichten owner und office, endgültig und nur vor der Erfassung | Praxisprozess · entschieden (Jannes) | `public.waive_appointment_fee` |
| ANN-217 | Den Zugangsdienst ruft nach dem Löschlauf der Zeitplan des Betriebs; bis OPS-001 bleiben fällige Konten gesperrt stehen | Technik · entschieden (Jannes) | `public.claim_platform_account_deletions` |
| ANN-219 | Fragebogendefinitionen kommen als erzeugte Migration auf den Server, nicht als zweite Fassung von Hand | Technik · entschieden (Jannes) | `scripts/definitionen-sql.mjs` |
| ANN-220 | Ein Wartelisteneintrag ist nach acht Wochen ohne Änderung zu prüfen | Praxisprozess · entschieden (Jannes) | `app.waitlist_review_interval`, `public.confirm_waitlist_entry` |
| ANN-221 | Fotoart vor dem Kamerastart wählen, mit Frist und Einwilligung im Wortlaut | Praxisprozess · verworfen (→ ANN-316) | `src/features/patients/files/FotosImVerlauf.tsx` |
| ANN-222 | Die Anwendung löst die Prüfung am Server nach der Bestätigung aus; fehlt die Function, bleibt die Datei ungeprüft | Technik · entschieden (Jannes) | `supabase/functions/patient-file-verify/` |
| ANN-223 | „Öffnen“ zeigt Bilder und PDF in der Anwendung, das PDF im Rahmen ohne `sandbox` | Technik · in ADR überführt (ADR-017 Punkt 58) | `src/components/ui/Dateiansicht.tsx` |
| ANN-224 | Erstaufnahme: nur Verordnungsfoto und Anmeldebogen; die zwei Vermerke erledigen den Anmeldebogen nur noch im Bestand | Praxisprozess · entschieden (Jannes) (→ ANN-227) | `app.intake_checklist` |
| ANN-225 | „Doku“ auf der Tageskarte führt in den Reiter Doku mit dem Termin oben; geschrieben wird auf der Schreibseite | Praxisprozess · entschieden (Jannes) | `src/features/calendar/today/MyDayPage.tsx` |
| ANN-226 | Im Kalender steht, wen owner dort hinnimmt, auch ohne eigenen Zugang | Praxisprozess · entschieden (Jannes) | `public.set_staff_member_schedulable` |
| ANN-227 | Der Anmeldebogen ist erledigt, sobald sein Foto in der Akte liegt | Praxisprozess · entschieden (Jannes) | `app.intake_checklist` |
| ANN-228 | Ohne eigene Angabe sind die Termine einer Verordnung die größte Anzahl ihrer Positionen | Praxisprozess · entschieden (Jannes) | `src/features/patients/treatment-bases/DatenUebertragenFenster.tsx` |
| ANN-231 | Terminhonorar: Tarif an der Preisliste, Vereinbarung je Person mit Gültigkeitsbeginn geht vor | Praxisprozess · in ADR überführt (ADR-009 Punkt 5) | `app.session_fee_on` |
| ANN-232 | Das Terminhonorar entsteht einmal je Termin und wird bei der Erfassung festgeschrieben | Praxisprozess · in ADR überführt (ADR-009 Punkt 22) | `public.appointment_session_fees` |
| ANN-234 | Die Übersicht wechselt den Tag um je einen Kalendertag, der Tag steht in der Adresse | Praxisprozess · entschieden (Jannes) | `src/features/calendar/today/tageswahl.ts` |
| ANN-235 | Fahrwege im Kalender: beim Anzeigen abgerufen, ab heute, erster Weg von Garage oder Praxis (ANN-240) | Technik · entschieden (Jannes) | `src/features/calendar/appointments/fahrwege.ts` |
| ANN-236 | Eine veraltete Anschrift am Termin ergibt keine Fahrzeit; nach dem Verorten fragt die Akte nach dem Umstellen | Praxisprozess · entschieden (Jannes) | `public.list_day_route` |
| ANN-237 | Fahrzeitfaktor: ein Wert je Praxis, angewendet im Browser an genau einer Stelle | Praxisprozess · entschieden (Jannes) | `src/features/calendar/tours/fahrzeitfaktor.ts` |
| ANN-238 | „Passt es?“: Luft nach §8.1, Nachbarn aus der Tagesroute, Tagesrand an Garage oder Praxis (ANN-240) | Praxisprozess · entschieden (Jannes) | `public.check_travel_fit` |
| ANN-239 | Lückenfinder: Tagesansicht mit Patientenfilter, eine Stufe je Lücke, 60 Minuten, sonst 45 (ANN-317) | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/lueckenfinder.ts` |
| ANN-240 | Garage je Standort: Beginn und Ende der Tour, getrennt vom Startort; Rückweg in Tour und Kalender | Praxisprozess · entschieden (Jannes) | `public.set_location_garage` |
| ANN-241 | Fahrweg im Kalender antippbar: ganzer Block als Fläche, Menü mit Navigation und Tour | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/FahrwegMenue.tsx` |
| ANN-243 | Startbild einmal je Tab beim Öffnen, Merker im Sitzungsspeicher des Tabs | Praxisprozess · entschieden (Jannes) | `src/lib/startbildMerker.ts` |
| ANN-244 | Tableiste nach Reife: ein Bereich ganz in Vorschau bekommt keinen der vier Plätze; heute keiner (ANN-314), Plätze je Rolle nach ANN-604 | Praxisprozess · entschieden (Jannes) | `tableiste` in `src/app/navigation.tsx` |
| ANN-252 | Schrift und Knöpfe: nichts unter 12 px außer der Absenderzeile, Kleingedrucktes 14 px, gesperrt heißt gestrichelt | Praxisprozess · entschieden (Jannes) | `src/index.css`, `src/components/ui/buttonStile.ts` |
| ANN-253 | Grundton B: weiße Fläche, neutrale Grautöne, sichtbare Spur der Balken | Praxisprozess · entschieden (Jannes) | `--color-spur` in `src/index.css` |
| ANN-254 | Tour am Handy: Liste vor Karte, Felder hinter „ändern“; ab 1024 px zwei Spalten | Praxisprozess · entschieden (Jannes) | `src/features/calendar/tours/TourenPage.tsx` |
| ANN-255 | Gesten-Hinweis im Kalender bis zur ersten Spanne; Merker als Wahrheitswert in `localStorage` | Technik · offen | `src/features/calendar/appointments/gestenMerker.ts` |
| ANN-258 | Skala am Handy in zwei Reihen, Befund aus Bausteinen ohne Kasten im Kasten | Praxisprozess · offen | `spaltenAmHandy` in `src/features/clinical/assessments/FragebogenFelder.tsx` |
| ANN-259 | Rechnungsliste: Suche als Teilstring ohne Platzhalter, „offen“ schließt überfällige ein, Seiten zu 100 | Praxisprozess · offen | `public.list_invoices` |
| ANN-260 | Leitfaden L2: Meldungen und Rückfragen mit Linie links statt als Karte; Erklärsatz über „Plattform“ entfällt | Praxisprozess · offen | `src/components/ui/Feedback.tsx`, `src/components/ui/Rueckfrage.tsx` |
| ANN-263 | Widerrufe über die Plattform stehen 14 Tage in Offene Punkte, ohne „gesehen“ | Praxisprozess · entschieden (Jannes) | `app.platform_withdrawal_notice_days`, `public.list_platform_consent_withdrawals` |
| ANN-266 | Der Einstieg gilt je Zugang, „Später“ beendet ihn, Überspringen berührt keine Einwilligung | Praxisprozess · entschieden (Jannes) | `public.skip_platform_onboarding` |
| ANN-267 | Plattform: keine Schrift unter 18 px, Schriftgröße nur auf dem Gerät, Ziele mindestens 44 px | Praxisprozess · entschieden (Jannes) | `.plattform-schrift` in `src/index.css` |
| ANN-268 | Das Nachsorge-Abo beginnt frühestens am Abschluss der Versorgung, höchstens 14 Tage rückwirkend | Praxisprozess · entschieden (Jannes) | `app.aftercare_earliest_start` |
| ANN-271 | Läuft die Behandlung wieder, wird kein Abo-Monat berechnet | Praxisprozess · entschieden (Jannes) | `app.aftercare_month_blocker` |
| ANN-276 | Ein Trainingspaket wird im Voraus berechnet: eine Leistung zum Beginn, eine Rechnung | Praxisprozess · entschieden (Jannes) | `public.create_training_package` |
| ANN-278 | Kein Trainingspaket während einer laufenden Behandlung derselben Person | Praxisprozess · entschieden (Jannes) | `app.training_package_start_blocker` |
| ANN-279 | Jeder Trainingstermin im Zeitraum eines Pakets ist mit dem Paket bezahlt | Praxisprozess · entschieden (Jannes) | `app.training_package_covering`, `app.training_package_guard` |
| ANN-284 | Ein Trainingsangebot gilt 14 Tage, höchstens bis zum Beginn; je Akte eines offen | Praxisprozess · entschieden (Jannes) | `app.training_offer_state`, `public.create_training_offer` |
| ANN-286 | Ans Abschlussgespräch erinnern Tageskarte und Termin an den letzten zwei Terminen einer Grundlage, bis ein Angebot in der Akte steht | Praxisprozess · entschieden (Jannes) | `app.closing_talk_due` |
| ANN-293 | Übungsbibliothek pflegt nur owner; lesen alle Praxisrollen, auch das Büro | Praxisprozess · entschieden (Jannes) → ADR-021 Punkt 10 | `app.can_manage_exercise_library`, `app.can_read_exercise_library` |
| ANN-294 | Eine Verbindung führt von leichter nach schwerer, in genau einer Achse | Praxisprozess · entschieden (Jannes) | `public.link_exercise_variants` |
| ANN-295 | Feste Körperregionen ohne Seite, Ausrüstung als freie Schlagworte | Technik · entschieden (Jannes) | `app.exercise_body_regions` |
| ANN-296 | Übungen werden archiviert; Löschen nur ohne Abhängige | Praxisprozess · entschieden (Jannes) | `public.set_exercise_archived`, `public.delete_exercise` |
| ANN-298 | Behandlungspläne schreiben Therapeut:innen, Trainingspläne owner und Trainingsbetreuung; das Büro liest beide | Praxisprozess · entschieden (Jannes) → ADR-021 Punkt 10 | `app.can_read_exercise_plans` |
| ANN-299 | Dosierung je Position: Sätze, Wiederholungen oder Dauer, Last und Tempo frei | Praxisprozess · entschieden (Jannes) | `public.save_exercise_plan_item` |
| ANN-300 | Mit der Zuweisung friert der Plan ein; danach ändern sich nur Laufzeit und Ende | Praxisprozess · entschieden (Jannes) | `public.assign_exercise_plan` |
| ANN-301 | Progression von Hand als neue Fassung: je Position höchstens ein Schritt in genau einer Achse | Praxisprozess · entschieden (Jannes) | `app.exercise_plan_step_check` |
| ANN-302 | Laufzeit sechs Wochen voreingestellt, höchstens 26; Wiedervorlage sieben Tage vorher, bis entschieden ist | Praxisprozess · entschieden (Jannes) | `app.exercise_plan_max_days`, `app.exercise_plan_review_days` |
| ANN-303 | Plan als PDF: Druckblatt aus dem Schnappschuss über den Browser, ohne Ablage | Technik · entschieden (Jannes) | `src/features/exercise/exercise-plans/Planblatt.tsx` |
| ANN-304 | Die Plattform zeigt zugewiesene Pläne, sonst den zuletzt beendeten | Praxisprozess · entschieden (Jannes) | `app.platform_visible_exercise_plans` |
| ANN-305 | Durchführung: Haken über die Warteschlange des Geräts; in der Lesefrist wird nicht erfasst, je Plan und Tag eine offene Einheit | Technik · entschieden (Jannes) → ANN-357, ANN-358 | `app.assert_platform_exercise` |
| ANN-307 | Übungstage wählt die Person; sie stehen nur in ihrer eigenen Woche | Praxisprozess · entschieden (Jannes) | `public.set_platform_exercise_days` |
| ANN-308 | Eine Frage ist ein Vorgang aus unveränderlichen Einträgen | Praxisprozess · entschieden (Jannes) | Trigger `platform_message_entries_guard` |
| ANN-309 | Antwortfrist in Werktagen aus den Stammdaten, überwacht über Fälligkeit | Praxisprozess · entschieden (Jannes) | `organizations.message_response_workdays` |
| ANN-310 | Behandlung: Das Büro liest alle Rückfragen und antwortet auf Termin, Rechnung und Sonstiges | Praxisprozess · entschieden (Jannes) | `app.can_answer_platform_message` |
| ANN-313 | In der Lesefrist werden keine Fragen mehr gestellt | Praxisprozess · entschieden (Jannes) | `app.assert_platform_message` |
| ANN-314 | Kommunikation ist mit den Rückfragen nicht mehr ganz Vorschau; der Bereich öffnet heute auf dem Teamchat (ANN-614) | Technik · entschieden (Jannes) → ANN-614 | `src/app/navigation.tsx` |
| ANN-317 | Lückenfinder: erst 60 Minuten, sonst 45, gekennzeichnet „nur 45 Min.“ | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/lueckenfinder.ts` |
| ANN-318 | Auch die Plattform bleibt bei einem gescheiterten Nachladen des Zugangs stehen | Technik · offen | `OhneProfil` in `src/app/App.tsx` |
| ANN-322 | „Alle Praxisrollen“ für die Instrumentenbibliothek heißt: die vier Rollen der Behandlungsseite | Technik · entschieden (Jannes) | `betriebUnterpunkte` in `src/app/navigation.tsx` |
| ANN-325 | Eine PIN festlegen geht nur höchstens zehn Minuten nach einer Anmeldung | Technik · offen | `app.pin_fresh_authentication`, `public.set_own_pin` |
| ANN-326 | Umgebung im Client: `VITE_APP_ENVIRONMENT`, ohne Wert gilt Produktion | Technik · offen | `readAppUmgebung` in `src/lib/env.ts` |
| ANN-327 | Passkey und PIN einzurichten ist Pflicht nur in Produktion; der letzte freigegebene Passkey bleibt | Technik · offen | `Einrichtungspflicht`, `PasskeyAbschnitt` |
| ANN-328 | Mitarbeitende: „Neuen Anmeldelink senden“ statt „Kennwort zurücksetzen“, im Protokoll unter dem alten Namen | Technik · offen | `sendeNeuenAnmeldelink`, `src/features/privacy/audit/actions.ts` |
| ANN-337 | Prüfung am Server für Anhänge hängt am Schalter der Akte; der Schalter der Virenprüfung bleibt aus | Technik · offen | `app.patient_file_verification_required`, `app.message_attachment_scan_required` |
| ANN-338 | Zeitmarke: eine ganze Sekunde in einem Video desselben Vorgangs | Praxisprozess · in ADR überführt (ADR-017 Punkt 68) | `attachment_mark_seconds`, `public.answer_platform_message` |
| ANN-339 | Rechnungslisten: Empfänger wie auf der Rechnung, Name der Person von heute | Praxisprozess · entschieden (Jannes) | `app.invoice_recipient_name` |
| ANN-340 | „Telefon (geschäftlich)“: nur noch an einer Akte, die schon eine Nummer trägt | Praxisprozess · entschieden (Jannes) | `mitGeschaeftlichemTelefon` in `src/features/patients/PatientMasterDataFields.tsx` |
| ANN-347 | Push nur an die Push-Dienste der Browserhersteller, höchstens fünf Geräte je Zugang | Technik · offen | `app.push_endpoint_allowed`, `app.notification_rule` |
| ANN-356 | Unter dem Punktbild steht die Zeitreihe als Tabelle je Größe, jüngste links; die Angaben nach den Einheiten daneben | Praxisprozess · offen (→ ANN-364, ANN-367) | `Verlaufstabelle` |
| ANN-357 | Eine Einheit wird als Ganzes übertragen; ihr Tag ist die Angabe des Geräts, höchstens sieben Tage zurück | Technik · offen | `public.sync_platform_exercise_session` |
| ANN-359 | Der Schlüssel der Freigabe ohne Netz kommt beim Einrichten aus dem Browser; aufs Gerät holen ihn Plattformkonten und eingerichtete Diensttelefone | Technik · offen | `public.own_offline_passkeys`, `schluesselAblegen` |
| ANN-362 | Ein Offline-Entwurf kommt als Ganzes an: angelegt, wiedererkannt oder Konflikt; nie eingemischt, nie still verworfen | Technik · offen | `public.sync_offline_treatment_note` |
| ANN-363 | Ohne Netz öffnet der Passkey für ein Praxiskonto Tagesplan und Entwürfe; beim Abmelden bleiben Entwürfe auf Wunsch auf dem Gerät | Praxisprozess · offen | `EntwurfAbmeldewache`, `praxisOhneNetz` |
| ANN-367 | „Meine Angaben“ je Frage als Punktbild, ohne Ereignisse der Praxis | Praxisprozess · geändert (→ ANN-799) | `public.platform_checkins` |
| ANN-380 | Der Seed übernimmt den ganzen Übungskatalog mit festen Kennungen; ein Namenskonflikt bricht den Seed ab | Technik · offen | `app.import_exercise_catalog_for`, `supabase/seed.sql` |
| ANN-381 | Kein Übungsbild als Posen-Beschreibung: Übungen haben keine Zeichnung | Technik · verworfen (→ ANN-539) | `supabase/migrations/20261225060000_uebungsbild_entfernt.sql` |
| ANN-382 | Der Übungskatalog ist Produktinhalt im Release; die Praxis übernimmt ihn als Kopie mit Herkunft, ein späterer Import überschreibt nichts | Technik · offen | `app.import_exercise_catalog_for` |
| ANN-383 | Ziel, Ausgangsstellung, Niveau 1–3 und Hilfsmittel sind feste Listen des Katalogs; kein Feld „Krankheitsbild“ | Praxisprozess · offen | `app.exercise_goals`, `src/features/exercise/exercises/katalog/typen.ts` |
| ANN-384 | Die Standarddosierung kommt aus dem Katalog; Positionen kennen Halten, je Seite und Häufigkeit am Tag | Praxisprozess · offen | `app.exercise_dosage_valid` |
| ANN-385 | Den ganzen Katalog übernimmt owner, wie er die Bibliothek pflegt | Praxisprozess · offen (→ ANN-293, ANN-536) | `public.import_exercise_catalog` |
| ANN-387 | Halten gehört zur Achse Wiederholungen; je Seite und Häufigkeit am Tag sind keine Achse | Praxisprozess · offen | `app.exercise_plan_step_check` |
| ANN-388 | Kennzeichnung der Linienfiguren nach Art. 50 KI-VO entfällt: Übungen haben keine Figuren | Recht · verworfen (→ ANN-539, ANN-386) | `uebernahmeSatz` in `src/features/exercise/exercises/UebungenPage.tsx` |
| ANN-400 | DESIGN.md ist die einzige Seitenrezeptur; eine Ratsche hält je Verzeichnis den Stand alter Muster | Technik · offen (→ DESIGN.md, Ratsche) | `GRENZEN` in `src/designsystem.grenzen.ts` |
| ANN-401 | Kein Dunkelmodus | Technik · offen (→ DESIGN.md 9.1) | `color-scheme: light` in `src/index.css` |
| ANN-402 | Zwei Inhaltsbreiten: Formular 36rem, Spalte 48rem | Technik · offen (→ DESIGN.md 9.3) | `--container-formular`, `--container-spalte` |
| ANN-403 | Aktionen im Seiten- und Objektkopf sind ohne Angabe kompakt; die Tour behält 48 px | Technik · offen | `KnopfGroesse` in `src/components/ui/knopfGroesse.ts` |
| ANN-404 | Medienbild für Fotos und Anhänge: 4:3, ganz statt beschnitten, Vorschau 56 px mit Radius 10 | Technik · offen | `Medienbild` in `src/components/ui/Medienbild.tsx` |
| ANN-405 | Filter am Telefon hinter „Filter (n)“, ab 640 px offen | Technik · offen (→ DESIGN.md 9.8) | `Filterleiste` in `src/components/ui/Filterleiste.tsx` |
| ANN-406 | Ein Satz für den Ladefehler, ein Baustein für alle Abfragezustände | Technik · offen | `VERBINDUNG_PRUEFEN`, `Abfragezustand` |
| ANN-407 | Vier Umschalter mit vier Rollen | Technik · offen (→ DESIGN.md 9.9) | `Segment`, `Filterchips` |
| ANN-430 | Patientenliste: ein Suchfeld über Name, Ort, PLZ, Telefon und E-Mail | Praxisprozess · offen (→ ANN-517) | `passtZurSuche` in `src/features/patients/uebersicht.ts` |
| ANN-435 | Arbeitszeiten: ein Speichern für den ganzen Wochenplan in einer Transaktion; einen Tag leert das Entfernen seiner Blöcke, mit Rückfrage | Praxisprozess · offen | `public.set_staff_working_week` |
| ANN-440 | Trainingskund:in mit Reitern wie die Akte, dazu Ernährung (ANN-620); ein Reiter lädt erst, wenn er offen ist | Technik · offen | `bereiche` in `src/features/training/TrainingClientPage.tsx` |
| ANN-443 | „Übungen hinzufügen“ fügt mehrere in einem Zug hinzu, jede mit ihrer Standarddosierung | Praxisprozess · offen | `fuegeHinzu`, `standardDosis` |
| ANN-444 | „Aus Vorlage“ findet die Übungen über den Katalogschlüssel; die Liste kennt nur die Vorlagen | Praxisprozess · offen (→ ANN-537) | `vorlagenZeilen`, `vorlagenListe` |
| ANN-445 | Nachtrag, Korrektur und Verlauf in der Hülle der Schreibseite, ohne eigenes „Abbrechen“ | Technik · offen | `Schreibflaeche` |
| ANN-446 | Die Erhebung zeigt den Bogen in Abschnitten von etwa acht Fragen | Technik · offen | `ABSCHNITT_GROESSE` in `src/features/clinical/assessments/abschnitte.ts` |
| ANN-450 | Offene Punkte sind ein Eingang: nur Gruppen mit Einträgen, das Dringlichste zuerst | Praxisprozess · offen | `useEingang`, `src/features/workplace/open-points/OpenPointsPage.tsx` |
| ANN-455 | Ausgestellte Rechnung: Reiter „Zahlungen“ vor „Positionen“, offener Reiter im Suchparameter | Praxisprozess · offen | `TEILE` in `src/features/billing/InvoiceDetailPage.tsx` |
| ANN-460 | Reiter und Detail ohne eigene Route stehen im Suchparameter | Technik · offen | `useOffenerReiter` in `src/components/ui/offenerReiter.ts` |
| ANN-461 | Ein Speichern für Kalender und Vergütung der Mitarbeiter:in | Praxisprozess · offen | `StaffEinsatz` in `src/features/workforce/staff/StaffEinsatz.tsx` |
| ANN-465 | Plattform-Übersicht: eine Hauptsache statt der Liste „Jetzt dran“ | Technik · verworfen (→ ANN-698) | `Uebersicht` in `src/features/portal/platform/Uebersicht.tsx` |
| ANN-466 | Übung auf der Plattform: kein Bildplatz, Dosierung als Marken unter der Bühne statt Kacheln | Technik · verworfen (→ Handoff 2026-10-24) | `Dosierungsmarken` in `src/features/portal/platform/Dosierungsmarken.tsx` |
| ANN-467 | Befundbogen auf der Plattform in Schritten zu höchstens acht Fragen | Praxisprozess · geändert (→ ANN-792) | `FRAGEN_JE_SCHRITT` in `src/features/portal/platform/bogenschritte.ts` |
| ANN-468 | Plattform-Einstellungen: Benachrichtigungen je Zugang und Passkey/PIN auf Abruf | Technik · offen | `Einstellungen` in `src/features/portal/platform/Einstellungen.tsx` |
| ANN-470 | Eine neue Übung entsteht mit ihrer ersten Variante in einem Formular | Praxisprozess · offen | `NeueUebungFormular` in `src/features/exercise/exercises/Formulare.tsx` |
| ANN-471 | Dosierung einer Position mit Zahlschritten; Übung tauschen durch Entfernen und Hinzufügen | Praxisprozess · offen | `PositionFormular` in `src/features/exercise/exercise-plans/PositionFormular.tsx` |
| ANN-472 | Filter der Bibliothek: ein Wert je Filter genügt, alle Filter zugleich; „nach Bedarf“ zählt mit | Praxisprozess · offen | `filtere` in `src/features/exercise/exercises/suche.ts` |
| ANN-475 | Keine Heilmittelbestätigung nach dem Festschreiben; Haken und Doku erfassen die Leistung | Praxisprozess · verworfen (→ ANN-513) | `app.record_default_services` |
| ANN-477 | Folgetermin aus Vorschlägen mit einem Tipp, ohne Grundlage | Praxisprozess · offen | `FolgeterminVorschlaege` in `src/features/calendar/appointments/FolgeterminVorschlaege.tsx` |
| ANN-478 | „Nachzuholen“: Besuche der letzten sieben Tage ohne Haken oder mit offener Doku, über die Tagesliste | Technik · offen | `NACHZUHOLEN_TAGE` in `src/features/calendar/today/NochOffen.tsx` |
| ANN-479 | „Niemand öffnet?“: 15-Minuten-Uhr ab dem Tipp zeigt die Wartezeit, sie hakt nichts vor | Praxisprozess · offen | `Wartezeit` in `src/features/calendar/appointments/HomeVisitFlow.tsx` |
| ANN-480 | Kein Übungsbild, auch nicht als Ausgangsstellung: Übungen haben keine Zeichnung | Praxisprozess · verworfen (→ ANN-539) | `src/components/ui/Schrittliste.tsx` |
| ANN-481 | Karte des Besuchs: „Doku“ ist der eine Hauptknopf, der Haken bleibt eigener Schritt mit Rahmen | Praxisprozess · offen | `karte()` in `src/features/calendar/today/MyDayPage.tsx` |
| ANN-482 | Ohne eigenen Besuch steht heute vor morgen | Praxisprozess · offen | `ohneBesuch` in `src/features/calendar/today/MyDayPage.tsx` |
| ANN-483 | „Rückgängig“ nach dem Haken geht jederzeit, auch am dokumentierten Termin | Praxisprozess · verworfen (→ ANN-512) | `HakenRueckgaengig` in `src/features/calendar/today/Besuchsknoepfe.tsx` |
| ANN-484 | Am Telefon weicht die Fahrzeit im Kicker, wenn die Kachel „Abfahrt“ sie nennt | Technik · offen | `wegTitel` in `src/features/calendar/today/MyDayPage.tsx` |
| ANN-485 | Zeichen für Zustände ohne eigenen Ton | Technik · offen | `STATUSZEICHEN` in `src/components/ui/Badge.tsx` |
| ANN-486 | Die Kachelleiste der Behandlungsgrundlagen bleibt bis zur Sichtung, als Weg zu „Daten übertragen“ | Praxisprozess · offen | `src/features/patients/treatment-bases/GrundlagenKacheln.tsx` |
| ANN-487 | „Kein Alarm je Check-in“ bleibt als Kleingedrucktes (Grenze aus ADR-006 Punkt 11) | Technik · offen | `src/features/exercise/checkins/ZwischenDenTerminen.tsx` |
| ANN-489 | Eine Zeitspanne (von/bis) steht am Telefon untereinander, ab 640 px in einer Zeile | Technik · offen | `BlockFelder` in `src/features/calendar/scheduling/ArbeitszeitJePerson.tsx` |
| ANN-493 | Unternavigation: eine einzelne Vorschau steht offen, erst ab zwei eingeklappt | Technik · offen | `einklappbar` in `src/components/ui/SubNav.tsx` |
| ANN-494 | Statistik: fünf Kennzahlen als beschriftete Liste in einer Karte, keine Kacheln | Technik · offen | `Kennzahlliste` in `src/features/billing/statistics/StatisticsPage.tsx` |
| ANN-497 | Kästchenspalten so breit wie das längste Wort der Frage | Technik · offen | `laengstesWort` in `src/features/clinical/assessments/darstellung.ts` |
| ANN-498 | Seiten des Körperschemas als Schrift über der Zeichnung | Technik · offen | `KoerperschemaBild` in `src/features/clinical/assessments/KoerperschemaFeld.tsx` |
| ANN-499 | Kachelbeschriftung auf der Plattform ohne Versalien | Technik · offen | `Tile` in `src/components/ui/Tile.tsx` |
| ANN-500 | Absage im Terminpanel, Grund als Chips | Praxisprozess · offen | `darfAbsagen` in `src/features/calendar/appointments/TerminPanel.tsx` |
| ANN-502 | „Wie zuletzt“ übernimmt den letzten Haupteintrag | Praxisprozess · offen | `WieZuletzt` in `src/features/clinical/documentation/WieZuletzt.tsx` |
| ANN-503 | Übung aus der Bibliothek in Entwurf, neue Fassung oder neuen Plan | Praxisprozess · offen | `planFuerUebung` in `src/features/exercise/exercise-plans/zielplan.ts` |
| ANN-510 | Kein Versorgungsstatus mehr: jede Akte ist planbar | Praxisprozess · entschieden (Jannes) | Constraint `patients_status_active_only` |
| ANN-512 | Der Haken ist ein Merkmal neben dem Zustand; Festschreiben hakt nicht ab | Praxisprozess · in ADR überführt (ADR-018 Punkt 10) | `app.mark_appointment_documented` |
| ANN-513 | Haken und Doku erfassen die Leistung von selbst | Praxisprozess · in ADR überführt (ADR-009 Punkt 24) | `app.record_default_services` |
| ANN-514 | Stand der Grundlage an einer Stelle; freigeben, sobald nichts offen ist | Praxisprozess · in ADR überführt (ADR-020 Punkt 9) | `app.treatment_basis_billing`, `app.can_release_treatment_basis` |
| ANN-515 | Nach der Freigabe sperrt der Server Doku, Zeit und Terminzahl | Praxisprozess · in ADR überführt (ADR-020 Punkt 9) | `app.appointments_basis_lock` |
| ANN-516 | „Zu mahnen“: überfällig und keine Erinnerung mit laufender Frist | Praxisprozess · entschieden (Jannes) | `app.invoice_reminder_due` |
| ANN-517 | Patientenliste: sortieren und zeigen statt Namenssuche ab drei Zeichen | Praxisprozess · entschieden (Jannes) | `leseSortierung` in `src/features/patients/uebersicht.ts` |
| ANN-521 | Schreibseite: „Sprechen“ ist Hauptknopf, solange das Feld leer ist | Praxisprozess · entschieden (Jannes) | `sprechenHaupt` in `src/features/clinical/documentation/CompleteTreatmentPage.tsx` |
| ANN-522 | Diktat: vier Abschnitte der Vorlage, Leeres entfällt | Praxisprozess · entschieden (Jannes) | `DIKTAT_ABSCHNITTE` in `src/lib/ki/gateway.ts` |
| ANN-523 | Diktat: höchstens fünf Minuten und 5 MiB je Aufnahme | Technik · entschieden (Jannes) | `DIKTAT_HOECHSTDAUER_S`, `DIKTAT_HOECHSTBYTES` in `src/lib/ki/gateway.ts` |
| ANN-524 | AI Gateway: Anbieter nur per Secret, ohne stillen Rückfall auf die Nachbildung | Technik · entschieden (Jannes) | `richteEin` in `supabase/functions/ai-gateway/auswahl.ts` |
| ANN-525 | Keine Einsicht der Praxis in die Plattform einer Person, auch nicht für owner | Praxisprozess · verworfen (→ ADR-023 Punkt 25) | `supabase/migrations/20261225070000_einsicht_entfernt.sql` |
| ANN-526 | Einsicht nur am eigenen, aktiven Zugang: entfallen mit der Einsicht | Praxisprozess · verworfen (→ ADR-023 Punkt 25) | `supabase/migrations/20261225070000_einsicht_entfernt.sql` |
| ANN-527 | Dokumente und Anhänge in der Einsicht: entfallen mit der Einsicht | Datenschutz · verworfen (→ ADR-023 Punkt 25) | `supabase/migrations/20261225070000_einsicht_entfernt.sql` |
| ANN-528 | Sicht einer Vertretung in der Einsicht: entfallen mit der Einsicht | Praxisprozess · verworfen (→ ADR-023 Punkt 25) | `supabase/migrations/20261225070000_einsicht_entfernt.sql` |
| ANN-529 | Nur lesende Transaktion der Einsicht: entfallen mit der Einsicht | Technik · verworfen (→ ADR-023 Punkt 25) | `app.platform_readable_access` |
| ANN-530 | „Passt es?“ bietet die früheste passende Zeit an, nur wenn die Gegenseite hält | Praxisprozess · entschieden (Jannes) | `wegangebot` in `src/features/calendar/appointments/wegpruefung.ts` |
| ANN-531 | Textbausteine: in der Leiste nur eigene, keine neuen Bausteine der Praxis | Praxisprozess · entschieden (Jannes) | `src/features/clinical/documentation/TextbausteinLeiste.tsx` |
| ANN-532 | Wegbalken an der Karte, am Telefon an Stelle der Minutenangabe | Technik · entschieden (Jannes) | `src/features/calendar/today/Tagesliste.tsx` |
| ANN-533 | „Ausfall“ ab Beginn des Termins und nur ohne Doku | Praxisprozess · entschieden (Jannes) | `ausfallMoeglich` in `src/features/calendar/today/besuchswege.ts` |
| ANN-534 | Eben angelegten Termin zurücknehmen: 15 Minuten, nur wer angelegt hat | Praxisprozess · entschieden (Jannes) | `public.undo_appointment_creation` |
| ANN-535 | Folgeterminvorschläge: zu knapp fällt weg, ungeprüft bleibt | Praxisprozess · entschieden (Jannes) | `urteilAus` in `src/features/calendar/appointments/folgetermin.ts` |
| ANN-536 | Katalogübungen übernimmt beim Hinzufügen nur owner, einzeln | Praxisprozess · entschieden (Jannes) | `v_pflegt` in `public.add_catalog_exercises_for_plan` |
| ANN-537 | Eine Vorlage zeigt ihre Übungen als Vorschau, vorgewählt außer schon Geplantem | Praxisprozess · entschieden (Jannes) | `vorausgewaehlt` in `src/features/exercise/exercise-plans/vorlagen.ts` |
| ANN-538 | Stand eines Plans: Fassung aus der Kette, Tag der Zuweisung, wer zugewiesen hat | Praxisprozess · entschieden (Jannes) | `standZeile` in `src/features/exercise/exercise-plans/fassung.ts` |
| ANN-539 | Übungen ohne Zeichnung; nummerierte Schritte erklären sie, bis eigene Bilder und Videos vorliegen | Praxisprozess · entschieden (Jannes) | `src/components/ui/Schrittliste.tsx` |
| ANN-542 | Erstaufnahme geführt: eine Seite ohne eigenen Zustand, Checkliste bleibt bei zwei Punkten | Praxisprozess · offen | `erstaufnahmestand` in `src/features/patients/intake/stand.ts` |
| ANN-543 | Neuaufnahme am Telefon: das Seltene eingeklappt, „Weiter“ springt ins nächste Feld | Praxisprozess · offen | `WEITERE` in `src/features/patients/PatientMasterDataFields.tsx` |
| ANN-546 | Übersicht ohne Abschlusskarte, ein Abstand zwischen den Abschnitten | Technik · entschieden (Jannes) | `MyDayPage` in `src/features/calendar/today/MyDayPage.tsx` |
| ANN-547 | Tagesfortschritt in zwei Hälften, ein Rad beim fertigen Tag, ohne Speichern und Zählen | Technik · entschieden (Jannes) | `tagesfortschritt` in `src/features/calendar/today/tagesstart.ts` |
| ANN-555 | Stellen am Rad: Bauteil aus der Liste, Nummer je Rad, die Freigabe erledigt sie | Technik · offen | `app.fleet_insert_spots` |
| ANN-556 | Kein 3D-Rad und kein three.js; Bauteile als Knöpfe und Liste | Technik · verworfen (Jannes 2026-10-26) | `Bauteilwahl` in `src/features/fleet/Bauteilwahl.tsx` |
| ANN-557 | Zustand eines Rads abgeleitet; mit Verlauf ausmustern statt löschen | Technik · offen | `radzustand` in `src/features/fleet/rad.ts` |
| ANN-559 | Auslieferung: SSH-Verbindung mit bis zu fünf Versuchen | Technik · offen | `SSH_PAUSEN` in `scripts/testumgebung.mjs` |
| ANN-563 | Check-Up geführt: eine Seite je Prüfpunkt, jeder Punkt bestätigt | Praxisprozess · offen | `src/features/fleet/CheckupFenster.tsx`, `TIPPSPERRE_MS` in `src/components/ui/GefuehrterAblauf.tsx` |
| ANN-564 | Auslieferung: Dateien früherer Stände bleiben 7 Tage | Technik · offen | `.github/workflows/test-umgebung.yml` |
| ANN-565 | Vermerk „ohne Behandlung“ braucht keinen eigenen Eintrag | Praxisprozess · entschieden (Jannes) | `inhaltMitVermerk` in `src/features/clinical/documentation/api.ts` |
| ANN-566 | Rückfrage vor dem Verlassen als Fenster, Fokus nie auf „Verwerfen“ | Praxisprozess · entschieden (Jannes) | `useTextverlustschutz` in `src/app/Textverlustschutz.tsx` |
| ANN-567 | Bewegung nur als Gestaltung (Leinwand „Lebendig“), reduziert springt alles | Technik · entschieden (Jannes) | `src/index.css`, `tests/e2e/bewegung.spec.ts` |
| ANN-568 | Check-Up: Werbeflächen abwischen und ein Foto je Seite | Praxisprozess · entschieden (Jannes) | `public.record_fleet_checkup`, `fleet_photos.side` |
| ANN-570 | Check-Up-Rhythmus als Hinweis, nie als Termin | Praxisprozess · entschieden (Jannes) | `organizations.fleet_checkup_interval_days`; `src/features/fleet/rhythmus.ts` |
| ANN-571 | CI in parallelen Teilen, E2E vor der Anmeldung nur am Telefon | Technik · entschieden (Jannes) | `.github/workflows/ci.yml`, `playwright.config.ts` |
| ANN-572 | Geführter Ablauf als Baustein: Frage oben, Antworten im festen Fuß | Technik · entschieden (Jannes) (→ DESIGN.md) | `src/components/ui/GefuehrterAblauf.tsx` |
| ANN-573 | Niemand öffnet: erst anrufen, dann die Uhr abwarten | Praxisprozess · entschieden (Jannes) | `src/features/calendar/appointments/niemandOeffnet.ts` |
| ANN-574 | Tag umplanen: Auswahl abwählbar, Anrufliste im Tab | Praxisprozess · entschieden (Jannes) | `leseAnrufliste` in `src/features/calendar/appointments/tagumplanen.ts` |
| ANN-575 | Schlüssel von Hand zu Hand in einem Vorgang, der Datensatz ist der Nachweis | Praxisprozess · entschieden (Jannes) | `public.hand_over_fleet_key` |
| ANN-576 | Urlaub: Antrag, Entscheidung, Storno als neuer Antrag | Praxisprozess · entschieden (Jannes) | `app.can_decide_staff_requests`, `public.decide_leave_request` |
| ANN-578 | Genehmigter Urlaub sperrt die Tage, Termine werden genannt | Praxisprozess · entschieden (Jannes) | `app.apply_leave`, `staff_working_hour_exceptions.leave_request_id` |
| ANN-581 | Einrichten: Wochenplan nur mit owner, die Person dafür in den Kalender | Praxisprozess · entschieden (Jannes) | `kontextFuer` in `src/features/workforce/staff/einrichtung.ts` |
| ANN-582 | Einrichten: Wochenplan und Rad nur, wenn die Person behandelt | Praxisprozess · entschieden (Jannes) | `behandelt` in `src/features/workforce/staff/einrichtung.ts` |
| ANN-583 | Plattform: Wunschtage als Wochentage | Praxisprozess · entschieden (Jannes) | `wunschtage` in `src/features/portal/platform/terminablauf.ts` |
| ANN-584 | Plattform: Fenster zeichnen in ein Ziel mit 18 px | Technik · entschieden (Jannes) | `MitFensterZiel` in `src/features/portal/platform/PlattformApp.tsx` |
| ANN-585 | Plattform: Ändern verlangt Tag und Tageszeit | Praxisprozess · entschieden (Jannes) | `wannFehlt` in `src/features/portal/platform/terminablauf.ts` |
| ANN-586 | Panne im Fenster: wann sie begonnen ist | Praxisprozess · entschieden (Jannes) | `ungespeichert` in `src/features/fleet/Pannenfenster.tsx` |
| ANN-587 | Schlüssel übergeben: ein Ablauf für Tresor und Hand zu Hand | Praxisprozess · entschieden (Jannes) | `src/features/fleet/schluesselablauf.ts` |
| ANN-592 | Arbeitszeitänderung: Pause im Formular | Praxisprozess · entschieden (Jannes) | `src/features/workforce/working-time/dayForm.ts` |
| ANN-595 | Freizeitausgleich nur an Tagen nach Wochenplan, in der Arbeitszeit, als Abweichung; solange er gilt, ändern Planung und Anträge den Tag nicht | Technik · entschieden (Jannes) | `public.record_time_account_entry` |
| ANN-598 | Erstattungen: Zustände und Rechte | Praxisprozess · entschieden (Jannes) | `app.can_read_all_reimbursements` |
| ANN-599 | Ladestrom als Einkauf mit Beleg statt Arbeitstage mal festem Satz | Praxisprozess · verworfen (→ ANN-749) | `supabase/migrations/20261225090000_ladestrom_wie_einkauf.sql` |
| ANN-600 | Einkauf: bis zehn Belege je Antrag als Datei, zweiphasig im eigenen Bucket | Technik · entschieden (Jannes) | `public.prepare_reimbursement_receipt_upload` |
| ANN-604 | Organisation: fünf Reiter, Ansichten darunter, Leiste je Rolle | Praxisprozess · entschieden (Jannes) | `betriebUnterpunkte` in `src/app/navigation.tsx` |
| ANN-605 | Ladestrom nach geplanten Stunden und Werten der Praxis entfällt, Ladestrom ist ein Einkauf mit Beleg | Praxisprozess · verworfen (→ ANN-749) | `supabase/migrations/20261225090000_ladestrom_wie_einkauf.sql` |
| ANN-606 | Zeitkonto: Überstunden und Minusstunden am Regler | Praxisprozess · entschieden (Jannes) | `app.time_account_check` |
| ANN-612 | Teamchat: Nachsehen alle 20 s statt Zustellen, Entwurf je Konto nur im Speicher | Technik · offen (→ ANN-641, ANN-644, ANN-647; Anhänge ADR-017 Punkt 71) | `NACHSEHEN_MS` in `src/features/teamchat/api.ts` |
| ANN-613 | Nachrichten zu Rädern stehen in der Radflotte, nicht im Teamchat | Praxisprozess · offen | `app.team_staff_reads_fleet` |
| ANN-614 | Nachrichten wie Slack: Teamchat, „Für dich“, Rückfragen; ohne Präsenz, „gesehen von“ und Push | Praxisprozess · offen (→ ANN-642, ANN-644, ANN-646, ANN-652) | `public.list_team_activity` |
| ANN-615 | Ladestrom aus Touren über eine eigene Edge Function entfällt | Technik · verworfen (→ ANN-749) | `supabase/migrations/20261225090000_ladestrom_wie_einkauf.sql` |
| ANN-617 | Gefahrene Tour als Grundlage des Ladestroms entfällt | Praxisprozess · verworfen (→ ANN-749) | `supabase/migrations/20261225090000_ladestrom_wie_einkauf.sql` |
| ANN-618 | Lesart der Zielwertregeln: höchste Stufe, Fett 30 %, 7000 kcal je kg, Rundung | Praxisprozess · entschieden (Jannes) | `app.nutrition_calculation` |
| ANN-620 | Ernährung als eigener Reiter an Akte und Trainingsverhältnis, nur mit der Fähigkeit | Praxisprozess · entschieden (Jannes) | `aktenBereiche` in `src/features/patients/akte.ts` |
| ANN-621 | Gewicht je Tag auf der Plattform, die Beratung dort nur, solange sie läuft | Praxisprozess · entschieden (Jannes) | `public.record_platform_nutrition_weight` |
| ANN-641 | Teamchat: Zustellung mit Gerätekennung, Blättern mit Cursor | Technik · offen | `app.team_message_key` |
| ANN-643 | Teamchat: Antworten auch im Kanal, Ausgangsnachrichten später senden | Praxisprozess · offen | `public.post_team_message` |
| ANN-645 | Teamchat: Anheften für alle, die lesen, ohne „von wem“ und „wann“ | Praxisprozess · offen | `public.set_team_message_pinned` |
| ANN-647 | Teamchat: Benachrichtigung nur in der App, Stufen je Gespräch, @alle | Praxisprozess · entschieden (Jannes) | `public.get_team_chat_summary` |
| ANN-648 | Teamchat: Chatfläche mit Gesprächsliste, Threadspalte und Tastatur | Praxisprozess · offen | `src/features/teamchat/flaeche.ts` |
| ANN-649 | Teamchat: Formatierung wie Slack, nur als React-Elemente, ohne Linkvorschau | Technik · offen | `src/features/teamchat/formatierung.ts` |
| ANN-650 | Teamchat: eine Nachricht als Aufgabe in die Offenen Punkte übernehmen | Praxisprozess · offen | `src/features/teamchat/AlsAufgabe.tsx` |
| ANN-653 | Teamchat: Nachricht nur mit Anhängen, ohne Text | Praxisprozess · offen | `app.team_message_body` |
| ANN-654 | Teamchat: Senden, während Anhänge hochladen | Technik · in ADR überführt (ADR-017 Punkt 74) | `anhaengeBereit` in `src/features/teamchat/ausgang.ts` |
| ANN-656 | Lebensmittelkatalog als Bezugsdaten ohne Organisation | Technik · entschieden (Jannes) | `public.food_catalog` |
| ANN-658 | Lebensmittelsuche: Trigramme, Rangfolge, Marken über nächste Nachbarn | Technik · entschieden (Jannes) | `app.food_search` |
| ANN-659 | Lebensmittelkatalog: Import nur durch den Betrieb, Zurückziehen statt Löschen, Startportionen | Technik · entschieden (Jannes) | `app.finish_food_catalog_import` |
| ANN-660 | Tagebucheintrag trägt den Stand des Lebensmittels | Technik · offen | `public.nutrition_diary_entries` |
| ANN-661 | Wasser je Tag, ein Glas sind 250 ml | Praxisprozess · offen | `app.nutrition_diary_rule` |
| ANN-662 | Tagebucherinnerung: eine je Mahlzeit und Tag, außerhalb der Wochengrenze | Praxisprozess · in ADR überführt (ADR-024 Punkt 15) | `app.notification_drop_reason` |
| ANN-663 | Richtung der Bewegung: waagerecht gleichrangig, senkrecht eine Ebene | Technik · entschieden (Jannes) | `src/components/ui/bewegung.ts` |
| ANN-664 | Ernährungsberatung als Terminanlass neben dem Kontext, abgerechnet mit dem Haken | Praxisprozess · offen | Constraint `appointments_nutrition_occasion` |
| ANN-666 | Farbe je Person im Teamchat: vergeben, selbst gewählt, doppelt erlaubt | Praxisprozess · offen | `app.next_staff_color()` |
| ANN-670 | Zuschnitt des Profilbilds: verschieben, bis dreifach vergrößern, Standard wie bisher | Technik · in ADR überführt (ADR-017 Punkt 89) | `VERGROESSERUNG_MAX` in `src/features/teamchat/profilbild.ts` |
| ANN-671 | Ein Fenster sperrt die Seite auch in einem eigenen Ziel, die Sperrseite nie | Technik · offen | `sperreDarunter` in `src/components/ui/Dialogfenster.tsx` |
| ANN-676 | Bildschirmtastatur: erkannt am Fokus eines Tippfelds bei Fingerbedienung | Technik · offen | `src/index.css` |
| ANN-678 | Plattform: eine Tiefenstufe nur für Hero-, Aufgaben- und Besuchskarte | Technik · entschieden (Jannes) | `--shadow-plattform` in `src/index.css` |
| ANN-679 | Reiterleiste der Plattform in drei Stufen, gemessen statt aus der Einstellung gelesen | Technik · entschieden (Jannes) | `reiterstufe` in `src/features/portal/platform/geruestbreite.ts` |
| ANN-680 | Plattform: Markenmoment B statt Startbild, entschieden an der Adresse beim Öffnen | Technik · entschieden (Jannes) | `useMarkenmoment` in `src/features/portal/platform/markenmoment.ts` |
| ANN-681 | Offene Tastatur auf der Plattform: zurück tritt, was unten fest steht oder nur schmückt | Technik · offen | `src/features/portal/platform/Navigation.tsx` |
| ANN-682 | Plattform unter 23rem: Menü statt Leiste, 12 px Rand, Foto und fester Fuß entfallen | Technik · entschieden (Jannes) | `src/features/portal/platform/Navigation.tsx` |
| ANN-683 | Plattform: Seiten- und Abschnittstitel in der Skala in rem, 40 und 48 zwischen Abschnitten | Technik · offen | `src/components/ui/Section.tsx` |
| ANN-684 | Türseiten oben und linksbündig, für Plattform und Praxis in derselben Hülle | Praxisprozess · entschieden (Jannes) | `Vollseite` in `src/app/Vollseite.tsx` |
| ANN-685 | Einrichtung ohne eigene Fertig-Seite: „Willkommen“ sagt es einmal | Praxisprozess · offen | `NACH_DER_EINRICHTUNG` in `src/features/portal/platform/pfade.ts` |
| ANN-686 | Einrichtung abbrechen: das ✕ fragt nach, statt abzumelden | Praxisprozess · offen | `src/features/core/auth/einrichtung/AnmeldungEinrichten.tsx` |
| ANN-687 | Sperre: die Fassung der Plattform nach der Marke des Kontos in der Sitzung | Technik · offen | `istPlattformkonto` in `src/features/core/auth/sitzungssperre/Sitzungssperre.tsx` |
| ANN-688 | „Praxis anrufen“ auf den Türen: gesperrter Zugang ja, Lesefrist vorbei und ungültige Einladung nein | Praxisprozess · entschieden (Jannes) | `OhneLesbarenZugang` in `src/features/portal/platform/PlattformApp.tsx` |
| ANN-691 | Rufnummer der Plattform aus dem Absender der Rechnungen; „Praxis anrufen“ auf den Türen nach ANN-688 | Praxisprozess · offen | `app.platform_practice_phone` |
| ANN-692 | Plattform: die erste Aufgabe an einer Stelle – Fragebogen, Check-in, Übungen für heute | Technik · offen | `ersteAufgabe` in `src/features/portal/platform/hauptsache.ts` |
| ANN-695 | Einrichtung ohne Fertig-Seite: „Anmeldung eingerichtet“ einmal auf „Willkommen“ | Technik · offen (→ ANN-685) | `useEinmaligeRueckmeldung` in `src/features/portal/platform/Einstieg.tsx` |
| ANN-696 | Plattform unter 23rem: ein Titel mit langem Wort in 22, damit kein Name bricht | Technik · offen | `titelklassen` in `src/components/ui/titelstufe.ts` |
| ANN-697 | Gruß der Übersicht nach der Uhr des Geräts | Technik · offen | `grussNachTageszeit` in `src/features/portal/platform/zeit.ts` |
| ANN-698 | Übersicht: eine Hauptsache – Unterlagen, Aufgabe, nächster Termin, sonst nichts zu tun | Technik · offen | `hauptsache` in `src/features/portal/platform/hauptsache.ts` |
| ANN-699 | Übersicht in einem Zustand: Skelett, bis alles da ist; ein Fehler gilt für die Seite | Technik · offen | `src/features/portal/platform/Uebersicht.tsx` |
| ANN-700 | Übersicht: was unter „Heute“ steht, höchstens drei Karten | Technik · offen | `src/features/portal/platform/Uebersicht.tsx` |
| ANN-701 | „Neu für Sie“: die Rechnung mit dem Wort der Rechnungsliste | Technik · entschieden (Jannes) | `src/features/portal/platform/zahlungsstand.ts` |
| ANN-702 | Übersicht: „Mitteilungen einschalten“ unter „Heute“, bis die Person gewählt hat | Technik · entschieden (Jannes) | `mitteilungenOffen` in `src/features/portal/platform/einstiegsablauf.ts` |
| ANN-704 | Übungen: Dauer der Einheit aus der Dosierung geschätzt, nichts gespeichert | Technik · entschieden (Jannes) | `dauerDerEinheit` in `src/features/portal/platform/dauer.ts` |
| ANN-705 | Durchführung: „Später weiter“ statt „Abbrechen“ | Technik · entschieden (Jannes) | `src/features/portal/platform/Durchfuehrungskopf.tsx` |
| ANN-706 | Durchführung: eigene Endseite nach „Einheit beenden“ | Technik · entschieden (Jannes) | `src/features/portal/platform/Endseite.tsx` |
| ANN-707 | Plattform: Plan- und Übungsnamen trennen unter 23rem an der Silbe | Technik · entschieden (Jannes) | `.trennen-schmal` in `src/index.css` |
| ANN-708 | Übungstage: die Wochenleiste als Segment ohne Abstand | Technik · offen | `src/components/ui/Wochenleiste.tsx` |
| ANN-709 | Durchführung: die Pause als Ring statt als Uhr | Technik · offen | `Pausenring` in `src/components/ui/Hakenzeile.tsx` |
| ANN-710 | Durchführung: der Übertragungsstand erst nach dem ersten Haken | Technik · offen | `useRuhigerStand` in `src/features/portal/platform/Durchfuehrungsfuss.tsx` |
| ANN-711 | Durchführung: „Weiter üben“ setzt bei der ersten offenen Übung ein | Technik · offen | `ersteOffeneUebung` in `src/features/portal/platform/haken.ts` |
| ANN-713 | Durchführung: „Praxis antwortet nicht“ getrennt von „ohne Verbindung“ | Technik · offen | `src/features/portal/platform/Durchfuehrung.tsx` |
| ANN-714 | Durchführung im Vollbild: was vom Gerüst bleibt | Technik · offen | `vollbild` in `src/features/portal/platform/PlattformApp.tsx` |
| ANN-715 | Durchführung: ohne Einwilligung beendet die letzte Übung direkt | Technik · offen | `src/features/portal/platform/Durchfuehrung.tsx` |
| ANN-716 | Durchführung: wann der Fuß „übertragen“ sagt | Technik · offen | `src/features/portal/platform/Durchfuehrung.tsx` |
| ANN-717 | Durchführung: ein Ende, zu dem der Server nichts anlegt, gilt als nicht übertragen | Technik · offen | `NICHTS_OFFEN` in `src/features/portal/platform/ablage.ts` |
| ANN-720 | Übungen: „Weiter bei“ und „Heute erledigt“ nicht mehr allein aus open_session.sets | Technik · verworfen (→ ANN-730) | `heutigeEinheit` in `src/features/portal/platform/haken.ts` |
| ANN-721 | Übungen: Praxis antwortet nicht – Plan vom Gerät mit dem Tag des Ladens | Technik · offen | `PlanVomGeraet` in `src/features/portal/platform/Uebungen.tsx` |
| ANN-722 | Übungen: Heute zuerst – die Vorschau der Einheit nach Lage | Technik · offen | `lageDesPlans` in `src/features/portal/platform/vorschau.ts` |
| ANN-723 | Übungstage: ohne Netz gesperrt statt zurückspringend | Technik · offen | `src/features/portal/platform/Uebungen.tsx` |
| ANN-724 | Reiter „Übungen“ am Rechner zweispaltig | Technik · offen | `src/features/portal/platform/Uebungen.tsx` |
| ANN-725 | Übungen: „Sie brauchen“ aus Hilfsmitteln und Lasten ohne Doppelte | Technik · offen | `wasManBraucht` in `src/features/portal/platform/vorschau.ts` |
| ANN-726 | Übungen: wer den Plan macht und die Einheit sieht | Technik · offen (→ ANN-712) | `src/features/portal/platform/Uebungen.tsx` |
| ANN-727 | Übersicht: Übungskarte mit Umfang und Dauer, ohne Netz dahinter | Technik · offen | `uebungenText` in `src/features/portal/platform/Uebersicht.tsx` |
| ANN-730 | Übungen: Die Vorschau rechnet mit der Einheit auf dem Gerät | Technik · offen | `heutigeEinheit` in `src/features/portal/platform/haken.ts` |
| ANN-731 | Planblatt: ein Stand für beide Ausdrucke, die Vorschau eckig und unter 23rem ohne Rahmen | Technik · offen | `src/features/exercise/exercise-plans/Planblatt.tsx` |
| ANN-748 | Modulgrenzen: ein Modul mit index.ts nur darüber, gemeinsamer Kern in src/lib | Technik · offen (→ DEVELOPMENT.md) | `scripts/eslint-modulgrenzen.mjs` |
| ANN-749 | Ladestrom wie ein Einkauf mit Beleg; ältere Anträge behalten ihren Rechenweg | Praxisprozess · entschieden (Jannes) | `src/features/workforce/reimbursements/RequestReimbursementPage.tsx` |
| ANN-751 | Ein Register je Tabelle über dem Aufbewahrungsplan | Technik · in ADR überführt (ADR-008 Punkt 13) | `public.data_registry` |
| ANN-754 | Domänenfolge: Seiten setzen zusammen, sonst nur nach unten | Technik · entschieden (Jannes) (→ DEVELOPMENT.md) | `scripts/eslint-modulgrenzen.mjs` |
| ANN-755 | Schnittstelle je Domäne: eine fremde Domäne nur über ihre index.ts, auch von Seiten | Technik · entschieden (Jannes) (→ DEVELOPMENT.md) | `scripts/eslint-modulgrenzen.mjs` |
| ANN-756 | Anmeldung: Die Maske nennt die Ursache, nie ein Konto | Technik · entschieden (Jannes) | `src/features/core/auth/anmeldefehler.ts` |
| ANN-757 | Hausbesuch: Abschluss über „Was ist passiert?“, nicht über „Finalisieren“ | Praxisprozess · entschieden (Jannes) | `ueberAbschluss` in `src/features/clinical/documentation/TreatmentNoteSection.tsx` |
| ANN-758 | Fotos im Verlauf: eine Zeile, zum Aufklappen | Praxisprozess · entschieden (Jannes) | `fotosOffen` in `src/features/patients/files/FotosImVerlauf.tsx` |
| ANN-759 | Behandlungsgrundlage: eine Hauptaktion je Zustand, Kontaktwege als Links | Praxisprozess · entschieden (Jannes) | `src/features/patients/treatment-bases/Kontaktwege.tsx` |
| ANN-760 | Rückfrage mit Kontrollwerten vor Ausstellen, Löschen und Entziehen | Praxisprozess · entschieden (Jannes) | `Kontrollwerte` in `src/features/billing/InvoiceDetailPage.tsx` |
| ANN-761 | Nachweisseiten: für die Praxisleitung, der Nachweis als Zusatz | Praxisprozess · entschieden (Jannes) | `src/features/privacy/retention/AufbewahrungPage.tsx` |
| ANN-762 | Übersicht der Praxis: keine Liste „Check-in ausgeblieben“ | Praxisprozess · entschieden (Jannes) | `src/features/workplace/open-points/OpenPointsPage.tsx` |
| ANN-764 | Termine: „Heute“ und „Morgen“ nach dem Tag des Geräts | Technik · offen | `tagInWorten` in `src/features/portal/platform/termintexte.ts` |
| ANN-765 | Plattform: Statuszeichen und Knöpfe brechen nur zwischen Wörtern | Technik · offen | `WORTWEISE` in `src/components/ui/buttonStile.ts` |
| ANN-766 | Termine: die Rolle ohne Geschlecht, Name mit Satzrest | Technik · offen | `rolle` in `src/features/portal/platform/termintexte.ts` |
| ANN-767 | Termine: Wünsche nach Wochentag mit „oder“ statt jedes Datum | Technik · offen | `wunschInWorten` in `src/features/portal/platform/termintexte.ts` |
| ANN-768 | Termine: „Praxis anrufen“ als Hauptknopf am vergangenen Termin | Technik · offen | `FragenZumTermin` in `src/features/portal/platform/Terminbausteine.tsx` |
| ANN-769 | Termine: die Rufnummer bricht bei 200 % zwischen ihren Gruppen | Technik · offen | `Fragezeile` in `src/features/portal/platform/Terminbausteine.tsx` |
| ANN-770 | „Wer und wo“ und Fragen: unter 23rem gestapelt, bei „Sehr groß“ nebeneinander | Technik · offen | `WerUndWo` in `src/features/portal/platform/Terminbausteine.tsx` |
| ANN-771 | Hero-Karte: das Personenbild auf seiner Farbe, nicht auf Papier | Technik · offen | `Personenbild` in `src/components/ui/HeroKarte.tsx` |
| ANN-772 | Termine: der nächste Termin als Hero-Karte, ein offener Wunsch dazu als Statuszeichen an der Karte | Technik · offen | `hauptsache` in `src/features/portal/platform/Termine.tsx` |
| ANN-773 | Termine: ohne Netz Wünschen und Zurückziehen gesperrt, ein Satz sagt warum | Technik · offen | `WUENSCHE_OHNE_NETZ` in `src/features/portal/platform/wunschtexte.ts` |
| ANN-774 | Termine: in der Lesefrist kein Knopf und keine Woche, der Satz zu neuen Terminen in der Meldung | Technik · offen | `wuenschen` in `src/features/portal/platform/Termine.tsx` |
| ANN-775 | Termine: am Rechner Hero und Knopf rechts, die Listen links ab 32.5rem | Technik · offen | `ZWEI_SPALTEN` in `src/features/portal/platform/Termine.tsx` |
| ANN-776 | Termine: jede Zeile führt zur Seite ihres Termins, auch vergangene und abgesagte | Technik · offen | `zielVon` in `src/features/portal/platform/Termine.tsx` |
| ANN-777 | „Diese Woche“: bei „Sehr groß“ der Tag über seinen Einträgen | Technik · offen | `WOCHENZEILE` in `src/features/portal/platform/Termine.tsx` |
| ANN-778 | Termine: Ändern und Absagen beginnen auf der Seite des Termins | Technik · offen | `TerminOderAblauf` in `src/features/portal/platform/PlattformApp.tsx` |
| ANN-779 | Seite des Termins: von der Übersicht reist der Rückweg als `zurueck` mit und heißt „Übersicht“ | Technik · offen | `zumTermin` in `src/features/portal/platform/Uebersicht.tsx` |
| ANN-780 | Termine: der Weg zur Praxis beim Fehler, ohne Netz beim Laden und in der Lesefrist (nur Anruf, vor dem Vergangenen) | Technik · offen | `PraxisErreichen` in `src/features/portal/platform/Terminbausteine.tsx` |
| ANN-781 | Seite des Termins in der Reihenfolge des Handoffs | Technik · geändert (→ ANN-804) | `Terminseite` in `src/features/portal/platform/Terminseite.tsx` |
| ANN-782 | Ändern, Absagen: ✕ ersetzt den Ablauf im Verlauf durch die Seite des Termins; `?art=` weg gilt als Weggehen | Technik · offen | `Aenderungsablauf` in `src/features/portal/platform/Terminaenderung.tsx` |
| ANN-783 | Abläufe: ohne Netz der Satz ruhig über dem gesperrten Senden, nicht noch einmal als Fehler; beim Absagen „Praxis anrufen“ | Technik · offen | `OhneNetzHinweis` in `src/features/portal/platform/Wunschfelder.tsx` |
| ANN-784 | Zusammenfassung: „Ändern“ in der Zeile der Bezeichnung | Technik · offen | `bezeichnung` in `src/components/ui/ListRow.tsx` |
| ANN-785 | Termin ändern: Zusammenfassung ohne „Ihr Termin“ (steht im Kopf), sonst rollt sie bei 375 × 667 | Technik · entschieden (Jannes) | `Wannangabe` in `src/features/portal/platform/Terminaenderung.tsx` |
| ANN-786 | Zeitumstellung: doppelte Ortszeit gilt als die frühere; der Absagewunsch gibt seinen Zeitpunkt genau weiter | Technik · offen | `local_time_instant` in `supabase/migrations/20261225180000_doppelte_ortszeit.sql` |
| ANN-787 | Skala: zwei gleiche Reihen, ab 44rem eine; Anker als Satz, letzte Angabe mit Tag; ein zweiter Tipp nimmt erst nach 0,5 s zurück (auch Wahlflächen) | Technik · offen | `Stufenskala` in `src/components/ui/Stufenskala.tsx` |
| ANN-788 | Unter 23rem trennen Fragen, Kurznamen, Themenzeilen (ab 10) und Wahlflächen (ab 8, auch „Sehr groß“) an der Silbe | Technik · offen | `mitUmbruch` in `src/components/ui/Wahlflaechen.tsx` |
| ANN-789 | Ablauf: Name im Kopf, am Rechner Spalte 48rem; im Fuß nur Zustand, Notfallsatz, Hauptknopf | Technik · offen | `BREITE_ABLAUFSPALTE` in `src/components/ui/GefuehrterAblauf.tsx` |
| ANN-790 | Check-in: eine Frage je Seite, „Weiter“ auch ohne Antwort, Senden von der letzten ohne Zusammenfassung | Praxisprozess · entschieden (Jannes) | `ablaufseiten` in `src/features/portal/platform/Checkin.tsx` |
| ANN-791 | Check-in: eine Zahl außerhalb ihres Bereichs hält „Weiter“ an | Technik · offen | `weiter` in `src/features/portal/platform/Checkin.tsx` |
| ANN-792 | Fragebogen in 14 Themen, gespeichert beim Weitergehen; Entwurf öffnet nach dem letzten beantworteten | Praxisprozess · entschieden (Jannes) | `PLAENE` in `src/features/portal/platform/bogenthemen.ts` |
| ANN-793 | Fragebogen ohne Papierhinweise und Praxisfeld; Folgefragen zu 26 erst mit „ja“; Abschluss mit offenen Themen | Praxisprozess · offen | `wortlaut` in `src/features/portal/platform/bogenthemen.ts` |
| ANN-794 | Fragebogen: Notfallsatz nur vor „Bogen senden“, nicht bei den Warnzeichen | Praxisprozess · entschieden (Jannes) | `NICHT_AKUT` in `src/features/portal/platform/Befundbogen.tsx` |
| ANN-795 | Tagebuch: „297 von 1466 kcal“ statt „Noch übrig“, über dem Ziel ohne Wort; Wasser in Litern | Praxisprozess · entschieden (Jannes) | `EnergieUndNaehrstoffe` in `src/features/portal/platform/Tagebuch.tsx` |
| ANN-796 | Tagebuch: Mahlzeiten vor Wasser und Energie, am Rechner daneben; Balken mit Kante, leere Mahlzeiten als Pillen | Technik · offen | `Mahlzeiten` in `src/features/portal/platform/Tagebuch.tsx` |
| ANN-797 | Ernährung: Hero „Heute“ nur mit Tagebuch und Schreibrecht, gelesen wie das Tagebuch, auch von Vertretungen | Technik · entschieden (Jannes) | `Heute` in `src/features/portal/platform/Ernaehrung.tsx` |
| ANN-798 | Rückweg nennt die Herkunft: „Übersicht“ oder „Ernährung“, auch über das Eintragen, das danach offen bleibt | Technik · offen | `zurueckZumTag` in `src/features/portal/platform/tagebuchAdresse.ts` |
| ANN-799 | Meine Angaben als Zeilen mit letztem Wert und Tag, Seite je Frage, Tabelle als Seite; ohne Ereignisse der Praxis | Praxisprozess · offen | `reihen` in `src/features/portal/platform/MeineAngaben.tsx` |
| ANN-800 | Gewohnheiten: Titel je Gewohnheit, Tage mit Tag im Monat und „heute“, pausiert als ruhige Zeile; der feste Satz darunter | Technik · offen | `Eintrag` in `src/features/portal/platform/Gewohnheiten.tsx` |
| ANN-801 | Leerzustände mit Markenform, Satz und Weg; im Check-in in fester Folge der Lagen | Technik · offen | `Zustand` in `src/features/portal/platform/Checkin.tsx` |
| ANN-802 | Ohne Netz: Schreibendes gestrichelt gesperrt, per `aria-disabled` erreichbar, mit Satz; Lesen bleibt | Technik · offen | `GESPERRT` in `src/features/portal/platform/Checkin.tsx` |
| ANN-803 | Leerzustand wie im Entwurf (mittig, Kreis 96); in der Karte nur, wo Karten daneben stehen | Technik · offen | `EmptyState` in `src/components/ui/Feedback.tsx` |
| ANN-804 | Termine: Handlung vor Inhalt, der Knopf mit 16 unter der Hero-Karte | Technik · entschieden (Jannes) | `Terminseite` in `src/features/portal/platform/Terminseite.tsx` |
| ANN-805 | Satz zum Verlegen unter 24 Stunden: Seite wie empfohlen, auf Schritt 1 kurz (sonst rollt er) | Praxisprozess · entschieden (Jannes) | `AUSFALLHONORAR_VERLEGEN` in `src/lib/ausfallhonorar.ts` |
| ANN-806 | Absagewunsch mit Tag und Uhrzeit des Eingangs, auf der Uhr des Geräts; „angefragt“ bleibt daneben | Technik · entschieden (Jannes) | `absageEingegangen` in `src/features/portal/platform/termintexte.ts` |
| ANN-807 | Lesefrist: Wünsche am Server abgewiesen, Absage per Anruf, Zurückziehen bleibt | Technik · offen | `request_platform_appointment` in `supabase/migrations/20261225190000_lesefrist_terminwuensche.sql` |
| ANN-808 | Fragebogen: Das Praxisfeld schreibt und sieht die Plattform nicht; es bleibt, außer beim Verwerfen | Technik · offen | `save_platform_questionnaire_response` in `supabase/migrations/20261225200000_fragebogen_praxisfeld.sql` |
| ANN-809 | Lesefrist vom Server für jeden Zugang, bei Vertretungen mit Namen | Technik · entschieden (Jannes) | `inLesefrist` in `src/features/portal/platform/hauptsache.ts` |
| ANN-810 | Fragebogen in der Lesefrist: kein Speichern und Senden, Verwerfen bleibt | Technik · entschieden (Jannes) | `EntwurfVerwerfen` in `src/features/portal/platform/Befundbogen.tsx` |
| ANN-811 | Termine: Schritt 2 wie Schritt 1, Eingang nach der Absage, Hero „Ansehen, ändern, absagen“ | Praxisprozess · entschieden (Jannes) | `heroWeg` in `src/features/portal/platform/termintexte.ts` |
| ANN-812 | Gewohnheiten: nur der feste Satz | Praxisprozess · entschieden (Jannes) | `Gewohnheiten` in `src/features/portal/platform/Gewohnheiten.tsx` |
| ANN-813 | Tagebuch: Haken am Eintrag, Satz für Vorlesesoftware, Fokus bleibt am „+“ | Technik · entschieden (Jannes) | `BESTAETIGUNG_MS` in `src/features/portal/platform/TagebuchEintragen.tsx` |
| ANN-815 | Reiterleiste: das Wort bleibt 18 px, eine Reihe auch bei „Groß“ und „Sehr groß“; zwei nur, wenn es so nicht passt | Technik · offen | `REITERWORT` in `src/features/portal/platform/Navigation.tsx` |
| ANN-816 | „Sehr groß“ am Telefon wie unter 23rem: Fuß der Abläufe rollt mit (unten, solange alles passt), ohne Bild, Hero innen 12 | Technik · offen | `SEHR_GROSS_ROLLT_ZUSAMMEN` in `src/components/ui/GefuehrterAblauf.tsx` |
