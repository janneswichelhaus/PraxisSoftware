# Befunde an der laufenden Anwendung

Stand: 2026-10-02

## Zweck

Hier stehen **Befunde aus Sichtungen (früher Abnahmen), Screenrecordings und Reviews an der
laufenden Anwendung** — Beobachtungen an etwas, das gebaut ist, nicht Ideen
für etwas, das fehlt. Ideen gehören in `docs/product/` (Rang 6); ein Befund
gehört hierher, weil er Gebautes korrigiert.

Die Liste ist die **Eingabe für die erste Story des nächsten Loops derselben
Spur** — so verlangt es Roadmap-Regel R6 („Befunde im Folge-Loop derselben
Spur", `ROADMAP.md`, Risiken). Sie hat **keinen Rang** in der
Dokumentenhierarchie, ist **kein Auftrag** und führt **keine zweite
Reihenfolge**: Was wann gebaut wird, steht ausschließlich in `ROADMAP.md`.
Ein Befund wird verbindlich erst im SPEC-Schritt des Loops, der ihn aufnimmt.
Zu jedem offenen Befund steht in [`BEFUNDE-LOESUNGEN.md`](BEFUNDE-LOESUNGEN.md)
(Stand 2026-10-02) der heutige Codestand, die empfohlene Lösung und der
Umsetzungspfad; auch diese Analyse hat keinen Rang.

**Ablaufrunden ruhen.** Die Ablaufrunden nach [`OPTIMIERUNG.md`](OPTIMIERUNG.md)
sind bis Probewoche 1 (Roadmap H1, Feb 2027) eingefroren — Entscheidung von
Jannes vom 2026-09-13. Bis dahin werden Befunde nicht in Ablaufkarten
gemessen, sondern **hier gesammelt** und über R6 in die Loops gegeben. Was
eine Ablaufrunde später messen soll, bleibt hier als Befund stehen, bis die
Runden wieder aufgenommen werden.

## Form

Jeder Befund trägt:

| Feld    | Inhalt                                                                                   |
| ------- | ---------------------------------------------------------------------------------------- |
| Kennung | `BEF-NNN`, fortlaufend, nie wiederverwendet, nie umnummeriert                           |
| Datum   | Tag der Beobachtung                                                                      |
| Bereich | Arbeitsbereich oder Seite (`ARBEITSBEREICHE.md`)                                         |
| Quelle  | Wer hat es wie gesehen: Sichtung, Screenrecording, Review, Herkunft aus dem Ideenspeicher |
| Status  | `offen` · `eingeplant in <Loop>` · `erledigt in <Loop>`                                  |

Ein erledigter Befund zieht mit dem Loop, der ihn geschlossen hat, nach
[`archiv/BEFUNDE-ERLEDIGT.md`](archiv/BEFUNDE-ERLEDIGT.md) um — unverändert,
Kennung und Wortlaut bleiben. Hier stehen nur offene, eingeplante und teilweise
erledigte Befunde. Die nächste Kennung ist die höchste aus beiden Dateien plus
eins; `pnpm docs:check` meldet eine doppelt vergebene.
Messwerte (Pixel, Taps, Sekunden) sind Beobachtungen von Jannes selbst oder
aus dem Code — nie aus Telemetrie und nie an Mitarbeitenden (§20).

---

### BEF-010 — Ein gemeinsames Schema über zwei Lesepfade fällt keinem lokalen Gate auf

|         |                                                                                               |
| ------- | --------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-17                                                                                    |
| Bereich | Behandlungsdokumentation: Termin (`/termine/:id`) und Akte (`…/verlauf`)                       |
| Quelle  | Jannes, angemeldeter E2E-Lauf zu CAL-018; behoben in CAL-018d                                  |
| Status  | erledigt für den Einzelfall (CAL-018d), offen als Muster                                       |
| Berührt | `src/features/documentation/api.ts` (`treatmentNoteSchema`), `get_treatment_note`, `list_patient_treatment_notes` |

**Beobachtung.** CAL-018 machte `visit_without_treatment` zum Pflichtfeld des
Eintragsschemas. Dieses Schema liegt unter **zwei** Serverfunktionen;
nachgezogen war nur eine. Die Akte bekam Einträge ohne das Feld, die Prüfung
im Browser wies die ganze Seite ab, und der Behandlungsverlauf blieb leer —
in jeder Akte mit Dokumentation, nicht nur im Test.

**Warum das zählt.** Sieben lokale Gates waren grün. Die Komponententests
reichen ihre Einträge als **getippte Vorgabe** herein, und genau dort wurde
das Feld ergänzt: Der Typ stimmte, die Wirklichkeit nicht. Sichtbar wurde es
erst, wo echte Daten durch den echten Lesepfad laufen — und dieser Lauf ist in
der Cloud-Umgebung nicht möglich. Das Muster wiederholt sich bei jedem
weiteren Feld an jedem Schema, das mehr als eine Funktion bedient.

**Richtung.** Für den Einzelfall genügt der Datenbanktest aus CAL-018d, der
beide Lesepfade in einem Fall zusammenhält. Als Muster fehlt eine Prüfung, die
je Schema alle bedienenden Funktionen kennt — denkbar als Datenbanktest, der
die Schlüssel der Rückgabe gegen eine Liste hält, oder als Regel, dass ein
Schema genau einer Funktion gehört und die zweite Sicht ihr eigenes bekommt.
Entschieden ist das nicht; es gehört in den Loop, der das nächste Feld an ein
geteiltes Schema hängt.

### BEF-024 — Der Terminkontext steht in zwei Schemata

|         |                                                                                  |
| ------- | -------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                       |
| Bereich | Oberfläche: `src/features/appointments/api.ts`, `src/features/staff/api.ts`      |
| Quelle  | Loop CAL-027, beim Umbenennen der Bestandswerte                                  |
| Status  | offen                                                                            |
| Berührt | `futureAppointmentSchema`; nichts an der Datenbank                               |

**Beobachtung.** `appointmentKindSchema` ist als eine Quelle angelegt und wird
von den Terminschemata benutzt. `futureAppointmentSchema` in `features/staff`
zählt dieselben drei Werte stattdessen ein zweites Mal auf, statt sie zu
importieren.

**Warum das zählt.** CAL-027 hat beide Stellen anfassen müssen, und die zweite
fiel nur auf, weil ein `grep` sie fand — kein Gate hätte sie gemeldet. Ein
vierter Kontext (oder eine weitere Umbenennung) trifft dieselbe Lücke, und
dann steht in der Verwaltung der Zugänge ein Schema, das den neuen Wert
verwirft, während der Kalender ihn kennt: eine Zod-Ausnahme in einer Liste,
die mit dem Kontext gar nichts vorhat.

**Richtung.** `appointmentKindSchema` importieren statt aufzählen — eine
Zeile, gehört in den nächsten Loop, der `features/staff` ohnehin anfasst. Als
eigener Auftrag lohnt sie nicht.

### BEF-026 — B13 ist mit dem eingebauten Mailversand nicht einlösbar

|         |                                                                                       |
| ------- | ------------------------------------------------------------------------------------- |
| Datum   | 2026-09-21                                                                            |
| Bereich | Zugänge und Rollen (`/team…`), Passwort vergessen · STAFF-004, Roadmap G2             |
| Quelle  | Loop OPS-001, Providerprüfung ([`../decisions/providerpruefung-supabase.md`](../decisions/providerpruefung-supabase.md), Teil 3) |
| Status  | offen                                                                                 |
| Berührt | B13 · STAFF-004 · `ANN-025` · Roadmap G2 und G3 · Gate-Punkt 11 der Providerprüfung   |

**Beobachtung.** B13 ist am 2026-09-06 entschieden: nur die Auth-Mails des
Providers, kein zweiter Dienst. Die Providerprüfung findet dazu drei Auszüge,
die zusammen etwas anderes sagen als die Entscheidung: Der eingebaute
SMTP-Server ist „not meant for production use", er sendet **2 Mails je
Stunde**, und ohne eigenen SMTP-Server stellt Supabase Auth **nur an
vorautorisierte Adressen** zu — an das Team des Projekts. Eine angestellte
Person, die kein Mitglied des Supabase-Projekts ist, bekäme danach weder eine
Einladung noch eine Mail zum Zurücksetzen des Passworts.

**Warum das zählt.** STAFF-004 („Passwort vergessen als Selbstbedienung")
steht in Roadmap G2 und setzt genau diesen Versandweg voraus. Trifft der
Auszug zu, gibt es zwei Wege und keinen dritten: ein eigener SMTP-Anbieter —
dann ein zweiter Auftragsverarbeiter mit eigener Prüfung, eigenem ADR und
Rücknahme von B13 — oder kein Mailversand, also der Handgriff in der Praxis,
den `ANN-025` für die Anlage von Konten schon beschreibt. Beides ist eine
Entscheidung von Jannes, keine des Loops.

**Richtung.** Zuerst den **Empfängerkreis verifizieren**
(`supabase.com/docs/guides/auth/auth-smtp`, von einem ungeproxten Rechner) —
an ihm allein hängt, ob überhaupt etwas zu entscheiden ist. Fällt er so aus,
geht B13 als Vorlage mit zwei Optionen zurück an Jannes, zusammen mit den
übrigen Punkten der Providerprüfung. Vor dieser Klärung baut niemand an
STAFF-004.

### BEF-028 — Querverweise zwischen Dokumenten veralten unbemerkt

| | |
|---|---|
| Datum | 2026-09-22 |
| Bereich | Dokumentation (kein Anwendungsbereich): `docs/`, `PROJECT_PRINCIPLES.md`, `CLAUDE.md` |
| Quelle | Frage von Jannes am 2026-09-22 („haben sich Unstimmigkeiten angesammelt?"), belegt mit `grep` über 76 Markdown-Dateien |
| Status | erledigt in G19 (2026-09-22) — Gate erweitert; Nebenbefund Obergrenzen offen |
| Berührt | `scripts/docs-check.mjs`; §21 (Rangfolge), ADR-013 (CI-Gates); BEF-026/BEF-027 (Nummernkollision) |

**Beobachtung.** Dokumente behaupten etwas über andere Dokumente, und diese
Behauptungen veralten, ohne dass es auffällt. Vier Belege vom selben Tag, als
ADR-019 auf Fassung 4 stand:

| Datei | sagt |
| --- | --- |
| `MAP-LOOPS.md` | „Grundlage sind ADR-019 **Fassung 3**" |
| `ARBEITSBEREICHE.md` | „ADR-019 **Fassung 2**, angenommen 2026-09-13" |
| `abnahme/etappe-t-kartendienst.md` | „Grundlage: ADR-019 **Fassung 2**" |
| `OPEN_DECISIONS.md`, B7 | „**Fassung 2**, 2026-09-08" |

**Der erste Eintrag ist der wichtigste**: Er entstand am Morgen desselben
Tages und war zwei Stunden später überholt — geschrieben von derselben
Sitzung, die auch Fassung 4 verfasst hat. Das ist kein Nachlässigkeitsproblem,
das eine Aufräumaktion löst: Niemand hält die Querverweise von 76 Dateien im
Kopf, und eine Aufräumaktion stellt denselben Zustand nur einmal wieder her.

**Zwei weitere Formen desselben Musters.**

1. **Nummernkollision.** Am 2026-09-22 vergaben zwei parallele Sitzungen
   **BEF-026** doppelt; gefunden wurde es von Hand. Heute sind `ANN-`, `BEF-`
   und `IDEA-`-Nummern eindeutig — geprüft, aber durch Glück, nicht durch ein
   Gate.
2. **Normative Drift.** ADR-007 Punkt 6 erlaubt seit dem 2026-09-05
   Entwicklung vor der DSFA. Drei später geschriebene Stellen machten daraus
   trotzdem Startbedingungen einzelner Loops (ADR-019 Punkt 25 und 32,
   `MAP-LOOPS.md`, `OPEN_DECISIONS.md` B7). Der Widerspruch bestand
   **17 Tage** und fiel erst auf, als Jannes danach fragte. Behoben mit
   §15.2 (Version 0.15) und ADR-019 Fassung 4.

**Was das Gate heute prüft und was nicht.** `docs:check` prüft
Zeilenobergrenzen, Register-Anker und Links. Es prüft **nicht, ob eine
Aussage über ein anderes Dokument noch stimmt** — genau die Klasse, die hier
verrottet.

**Nebenbefund: drei von drei festen Obergrenzen sind voll** — `CLAUDE.md`
150/150, `STATUS.md` 60/60, `OPEN_DECISIONS.md` 400/400. (Die 1186 bei
`ASSUMPTIONS.md` zählen nicht: Diese Grenze wandert mit der Zahl der Einträge
und ist konstruktionsbedingt immer voll.) Jede Eintragung verdrängt seitdem
eine andere, und die Auswahl fällt unter Zeitdruck — am 2026-09-22 dreimal in
einer Sitzung. Das ist die Stelle, an der Genauigkeit verloren geht; entweder
steigen die Grenzen bewusst, oder Inhalt zieht tatsächlich aus.

**Vorschlag (kein Auftrag).** Nicht aufräumen, sondern messbar machen: das
Dokumentationsgate um die maschinell prüfbaren Fälle erweitern — Verweise auf
eine ADR-Fassung und auf eine Version von `PROJECT_PRINCIPLES.md` gegen den
tatsächlichen Stand, `§NN`-Verweise gegen vorhandene Abschnitte, Eindeutigkeit
der Registernummern. Historische Nennungen in Änderungsvermerken müssen dabei
erlaubt bleiben, sonst prüft das Gate die Vergangenheit falsch.

**Die inhaltliche Durchsicht ist davon getrennt** und hat ihren Zeitpunkt:
**vor dem B2-Paket**. Widersprüchliche Unterlagen erzeugen eine schlechtere
Auskunft der Datenschutzberatung, und diese Auskunft ist teuer. Vorher kosten
Widersprüche wenig — kein Nutzer, kein Produktivbetrieb, alles umkehrbar.

**Umgesetzt in G19.** `docs:check` prüft jetzt, dass genannte ADR-Fassungen,
Versionen und `§`-Abschnitte der Prinzipien existieren, dass eine als
„Grundlage“ genannte Fassung die geltende ist, und dass jede `ANN-`/`BEF-`/
`IDEA-`-Kennung einmal als Überschrift steht; Änderungsvermerke sind
ausgenommen (`scripts/docs-check-regeln.mjs`). Neun veraltete Grundlagen
korrigiert. **Grenze:** Ohne das Wort „Grundlage“ gilt eine ältere Fassung als
Herkunft — die Belege aus `ARBEITSBEREICHE.md` und `OPEN_DECISIONS.md` B7
fängt das Gate deshalb nicht; sie gehören in die Durchsicht vor B2.

### BEF-034 — Die Teamseiten fragen für trainer die zuordenbaren Personen ab

|         |                                                                                     |
| ------- | ----------------------------------------------------------------------------------- |
| Datum   | 2026-09-23                                                                          |
| Bereich | Organisatorisches → Team (`/praxis/team`, `/praxis/team/:id`)                       |
| Quelle  | Aufgefallen bei der Bestandsaufnahme für G6b Teil 1                                 |
| Status  | erledigt in UX-EPIC-002 (UX-002h, 2026-09-26); Ausgang des Lesepfads in G6b bleibt offen |
| Berührt | `src/features/staff/StaffListPage.tsx`, `src/features/staff/StaffMemberDetailPage.tsx` |

**Beobachtung.** Beide Seiten laden `list_assignable_therapists` ohne
Rollenbedingung. Für ein trainer-Konto weist die Datenbank den Aufruf ab; die
Spalte „zuordenbar" bleibt leer, die Seite lädt sonst.

**Folge für G6b.** Der Pfad behält deshalb die Ausnahme: Die Oberfläche ruft
ihn für die abgewiesene Rolle auf, ein `denied`-Eintrag stünde bei jedem
Seitenaufruf im Auditlog. **Der Weg:** `enabled: canManageAppointments(roles)`
an beiden Abfragen; danach kann der Pfad denselben Ausgang bekommen wie die
übrigen Lesepfade. Dazu, gleich gefunden: Das Menü zeigt trainer
„Arbeitszeiten" (`navigation.tsx`), die Route leitet ohne Aufruf auf `/` um.

### BEF-046 — Ein gescheitertes Nachladen des Profils ersetzt die laufende Anwendung

|         |                                                                                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                         |
| Bereich | Rahmen aller Seiten hinter der Anmeldung (`App.tsx`): Vollseite „Zugang nicht vollständig eingerichtet“                                                                                                                                                            |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-IDs AUTH-02, ZST-01, dazu NAV-12                                                                                                                                           |
| Status  | offen                                                                                                                                                                                                                                                              |
| Berührt | `src/app/App.tsx` (Z. 101–121), `src/features/session/useCurrentUser.ts` (`staleTime`, `retry: false`), `src/features/scheduling/SchedulingPage.tsx` (Z. 82); §13; ANN-021, ANN-044, ANN-046; Oberflächen-Checkliste Punkt 5; ADR-013 Punkt 9 (Sitzungen); BEF-070 |

**Beobachtung.** `App.tsx:104` ersetzt die Anwendung bei `isError || !user`
durch eine Vollseite, deren einziger Knopf „Abmelden“ ist. `isError` wird aber
auch wahr, wenn das Profil längst geladen ist und nur ein **Nachladen**
scheitert. Nachgeladen wird nach jedem Wieder-online, sobald das Profil älter
als fünf Minuten ist, und nach „Raster speichern“; die Anwendung selbst
wiederholt die Abfrage nicht (`retry: false`), die Datenbankbibliothek versucht
es nur kurz dreimal. Im Browser zweimal nachgestellt (therapist und office,
390 px): Nach dem Wieder-online scheitert die Profilabfrage, nach rund 7,6 s
steht „Zugang nicht vollständig eingerichtet – Profil konnte nicht geladen
werden.“ an Stelle der Übersicht. Die vorgehaltene Tagesliste (ANN-021) und ein
halb ausgefülltes Formular sind weg; der Textverlustschutz greift nicht, weil
der ganze Baum abgebaut wird. Erholt sich das Netz binnen rund 7 s, bleibt alles
stehen. Scheitert die Profilabfrage schon beim Start (Serverfehler, keine
Verbindung), erscheint dieselbe Seite mit derselben falschen Ursache (Review
NAV-12); „Abmelden“ löscht dort die Sitzung, und ohne Netz gibt es keine neue
Anmeldung.

Der Kommentar über der Sperre beruft sich auf §13. Dort ist das Blockieren aber
auf schreibende und offenlegende Vorgänge bezogen, und derselbe Abschnitt
verlangt, dass ein Fehler niemals unbemerkt Dokumentation verliert; Checkliste
Punkt 5 verlangt den Schutz ungespeicherter Eingaben „auch bei …
Sitzungsverlust“.

**Frage an Jannes.** Ist ein Profil, das schon geladen war und nur beim
Aktualisieren nicht erreichbar ist, ein unsicherer Zustand, der die ganze
Anwendung sperren muss — oder darf sie weiterlaufen, weil die Datenbank jede
Anfrage ohnehin selbst prüft?

**Optionen.**

1. **Wie heute:** Jede gescheiterte Profilabfrage sperrt. Folge: Nach einem
   Funkloch kann getippter Text verloren gehen; die Seite nennt eine falsche
   Ursache, und ihr einziger Knopf meldet im Funkloch endgültig ab.
2. **Sperren nur ohne geladenes Profil:** Beim Erstladen eine Vollseite „Die
   Anwendung konnte nicht geladen werden“ mit „Erneut versuchen“ als Hauptknopf
   und „Abmelden“ daneben; „kein Profil“ und „Zugang gesperrt“ ersetzen weiter
   sofort. Scheitert nur das Nachladen, bleibt die Anwendung stehen, oben eine
   Statusmeldung „Ihr Profil ließ sich gerade nicht aktualisieren. Eingaben
   bleiben erhalten.“ mit „Erneut versuchen“. Folge: Bis zum nächsten
   erfolgreichen Laden zeigt die Oberfläche womöglich einen älteren Rollenstand;
   Rechte und Sperre prüft die Datenbank weiter bei jeder Anfrage (ADR-004;
   ANN-044: Die Sperre wirkt sofort, weil jede Anfrage `is_active` liest).
3. **Wie 2, zusätzlich Speichern anhalten,** bis das Profil wieder geladen ist.
   Folge: Der Text bleibt im Feld, gespeichert wird erst danach — eine zweite
   Sperre neben der RLS, die kein Recht schützt, das der Server nicht schon
   schützt.

**Empfehlung.** Option 2. Was §13 blockieren will, prüft der Server bei jeder
Anfrage selbst; ein älterer Profilstand in der Oberfläche erweitert kein Recht.
Der stille Verlust getippter Dokumentation ist dagegen genau, was §13
ausschließt. Ein Loop im kritischen Pfad (Sitzungen), zusammen mit festen Sätzen
auf der Erstlade-Seite statt `error.message` und dem Profilweg aus BEF-070.
Test: Ein Nachladefehler lässt `AuthenticatedRoutes` eingehängt; „Zugang
gesperrt“ ersetzt weiter sofort.

### BEF-047 — Die Anmeldemaske sagt nie, warum sie erscheint, und am Praxisrechner endet keine Sitzung von selbst

|         |                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                 |
| Bereich | Anmeldung (jede Adresse ohne Sitzung); Sitzung auf allen Seiten, besonders am Praxisrechner                                                                                                                                                                                                                                                                                                |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs AUTH-01, AUTH-03, ZST-23, AUTH-09                                                                                                                                                                                                                                                              |
| Status  | offen                                                                                                                                                                                                                                                                                                                                                                                      |
| Berührt | `src/features/auth/LoginPage.tsx` (Z. 134–138), `src/features/auth/SessionProvider.tsx` (Z. 74 ff., 85), `src/app/abmeldeschutz.ts` (Z. 23), `src/features/documentation/Textverlustschutz.tsx` (Z. 27–29), `src/lib/supabase.ts` (Z. 21), `supabase/config.toml` (kein Abschnitt `[auth.sessions]`); §3.4, §13; ANN-044, ANN-045; OPS-001; ADR-013 Punkt 9 (Authentifizierung, Sitzungen) |

**Beobachtung.**

- **Funkloch wie falsches Kennwort.** Die Anmeldeseite wertet jeden
  zurückgegebenen Fehler als falsche Eingabe. Die Anmeldebibliothek wirft bei
  Netzfehlern nicht, sie gibt einen eigenen Fehler zurück
  (`AuthRetryableFetchError`); der vorgesehene Satz „derzeit nicht erreichbar“
  erscheint deshalb nie. Im Browser mit abgebrochener Anfrage (390 px):
  „Anmeldung nicht möglich. Bitte E-Mail-Adresse und Kennwort prüfen.“ —
  wortgleich mit einem falschen Kennwort; ebenso bei „zu viele Versuche“ und bei
  leeren Feldern.
- **Fremdes Sitzungsende ohne Satz.** Endet die Sitzung von außen — Abmelden in
  einem zweiten Tab, „Alle Sitzungen beenden“ an einem anderen Gerät, abgelehnte
  Erneuerung —, zeigt die Seite dieselbe Anmeldemaske wie beim ersten Aufruf
  (mit zwei Tabs nachgestellt, office, 1440 px). Ungespeicherte Eingaben sind
  weg; der Abmeldeschutz lässt diesen Fall bewusst durch.
- **Kein Ablauf.** Die Sitzung wird dauerhaft gespeichert und von einem offenen
  Tab stündlich erneuert; eine Höchstdauer ist nicht eingestellt, Abmelden
  bleibt Handarbeit (ANN-045). Der Code kennt die Lage („Auf dem Praxisrechner
  bleibt schnell eine Sitzung stehen“, `KennwortNeuPage.tsx:55`) und behandelt
  sie nur beim Einlösen eines Links. Nur an Code und Konfiguration belegt.

**Frage an Jannes.** (1) Soll eine Sitzung nach einer Höchstdauer von selbst
enden, auch bei offenem Tab? (2) Soll die Anmeldemaske sagen, warum sie
erscheint?

**Optionen.**

1. **Wie heute.** Folge: Eine am Praxisrechner vergessene Sitzung bleibt über
   Nacht und Tage offen; wer als Nächstes kommt, dokumentiert unter fremdem
   Namen, und das Auditlog trägt die falsche Person. Im Funkloch zweifelt man am
   richtigen Kennwort und fordert womöglich eine Rücksetzmail an.
2. **Die Maske erklärt sich:** eigene Sätze für „Keine Verbindung zum
   Anmeldedienst. Ihre Angaben wurden nicht geprüft.“, „Zu viele Versuche. Bitte
   in einigen Minuten erneut versuchen.“ und nach einem Ende von außen „Ihre
   Sitzung wurde beendet. Nicht gespeicherte Eingaben sind nicht erhalten.“ —
   ohne Grund, damit nichts über eine Sperre verraten wird; unbekanntes Konto
   und falsches Kennwort bleiben ununterscheidbar. Folge: Der Verlust wird
   bemerkt; die offene Sitzung am Praxisrechner bleibt.
3. **Wie 2, dazu eine Höchstdauer über den Anmeldedienst** (`timebox` in
   `[auth.sessions]`), keine eigene Sitzungslogik (§3.4). Folge: jeden Morgen
   eine neue Anmeldung, auch am Diensthandy. Das begrenzt eine vergessene
   Sitzung auf einen Tag; gegen die Übergabe am selben Tag hilft weiter nur
   Abmelden. Eine reine Inaktivitätsgrenze genügt nicht, weil ein offener Tab
   sich selbst erneuert, und am Handy im Hintergrund würde sie tagsüber
   abmelden. Ob der Tarif `timebox` bietet, klärt OPS-001; bietet er es nicht,
   bleibt es bei 2.

**Empfehlung.** Option 3 mit etwa 14 Stunden als Startwert — länger als ein
Arbeitstag, kürzer als bis zum nächsten Morgen —, als Annahme registriert.
Beides in einem Loop im kritischen Pfad: Eine Höchstdauer ohne erklärende Maske
erzeugte genau das unerklärte Sitzungsende, das Option 2 behebt. Den Sonderfall
„Seite startet ohne Netz mit abgelaufenem Zugriffstoken“ (dann erscheint die
Maske, obwohl eine Sitzung gespeichert ist, `SessionProvider.tsx:85`) nimmt der
Loop nur mit eigenem Zweitreview mit.

### BEF-048 — Rahmen: Am Tablet nennt nichts den Bereich, „Abmelden“ ist das auffälligste Element der Kopfzeile, über der Akte stehen drei Navigationsebenen

|         |                                                                                                                                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                  |
| Bereich | Rahmen aller Seiten: Seitenleiste und Symbolspalte (ab 640 px), Kopfzeile, Untermenü über der Akte (unter 640 px), Web-Manifest                                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-IDs NAV-06, NAV-18, PAT-09, AUTH-07                                                                                                                                                                                                                 |
| Status | offen — (2) erledigt im UI-Redesign (`abmeldeKnopf` 14 px grau); (1), (3), (4) offen, Lösung in `BEFUNDE-LOESUNGEN.md` |
| Berührt | `src/app/AppShell.tsx` (Z. 43–51, 165–194, 237, 262), `src/components/ui/buttonStile.ts` (Z. 33), `src/app/navigation.tsx` (Z. 234), `src/features/patients/PatientRecordLayout.tsx` (Z. 247–260), `index.html`, `public/manifest.webmanifest`, `src/marke.test.ts`; DS-001; ANN-109, ANN-110, ANN-113; AKTE-000, UX-002h; BEF-001, BEF-044 |

**Beobachtung.**

- **Seitenleiste am Tablet.** Zwischen 640 und 1023 px ist die Beschriftung der
  Symbolspalte unsichtbar (so in DS-001 festgelegt), es gibt keinen Tooltip, und
  der Bereichsname in der Kopfzeile steht nur unter 640 px: Bei 820 px nennt
  kein Element den Bereich. Am Tablet ohne Hover sind die Symbole auswendig zu
  deuten. Hover und Auswahl sind gleich gefüllt, und die Auswahl hebt sich mit
  1,35:1 kaum vom Tiefgrün ab.
- **Abmelden.** „Abmelden“ steht in 16 px fett in der Hauptfarbe, „Konto“ bzw.
  der Name in 14 px grau 8 px daneben. Abgemeldet wird ohne Rückfrage (außer bei
  ungesicherter Dokumentation) und ohne „Wird abgemeldet …“. Die seltenste
  Handlung zieht auf jeder Seite den Blick; ein Fehltipp am Lenker kostet eine
  Neuanmeldung mit mindestens zwölf Zeichen Kennwort.
- **Über der Akte.** Bei 390 px stehen über jedem Reiterinhalt die Kopfzeile,
  das Untermenü „Patient:innen | Verordner:innen“ (in der Akte als
  „Patient:innen“ markiert), „← Zurück zur Liste“ mit demselben Ziel, die
  Kopfkarte und die Reiterleiste. Der Inhalt beginnt je nach Länge der Hinweise
  bei 426, 538 oder 663 px; über der Tableiste bleiben 362, 250 bzw. 125 px.
- **Installierte App.** Das Web-Manifest hat weder `theme_color` noch
  `background_color`, `index.html` kein `theme-color`: Leiste und Startbild der
  installierten App tragen keine Markenfarbe.

**Frage an Jannes.** Vier kleine Gestaltungsfragen am Rahmen: (1) Soll am Tablet
ein Bereichsname sichtbar sein? (2) „Abmelden“ ruhiger oder am Handy nur noch
auf „Mein Konto“? (3) Das Untermenü in der Akte (`/patienten/:id`, auch die
Formulare) ausblenden? (4) Welche Farbe tragen Leiste und Startbild der App?

**Optionen.**

1. **Alle vier Vorschläge:** (1) an der Auswahl zusätzlich ein Salbei-Strich
   links, zwischen 640 und 1023 px der Bereichsname in der Kopfzeile, Tooltips
   an den Symbolen; (2) „Abmelden“ klein und grau wie der Kontolink, mit mehr
   Abstand und „Wird abgemeldet …“; (3) Untermenü in der Akte ausblenden —
   Rückweg und Tableiste führen zur Liste, Verordner:innen bleibt über die Liste
   erreichbar; (4) `theme_color` Weiß wie die Kopfzeile, `background_color` die
   Seitenfläche (#eceee8). Folge: Kein Recht und kein Ablauf ändert sich; der
   Reiterinhalt gewinnt am Handy 60 bis 130 px; (1) ergänzt DS-001, ohne die
   Symbolspalte zu ändern; auf der Liste bleibt die Zeile, wie ANN-113 sie für
   den Bereich Patient:innen festhält.
2. **Wie 1, aber zurückhaltender am Handy:** „Abmelden“ nur noch auf „Mein
   Konto“, und statt das Untermenü auszublenden, wandert der Rückweg in die
   Kopfkarte. Folge: noch ruhigere Kopfzeile, ein Tipp mehr zum Abmelden; das
   Untermenü bleibt, der Rückweg spart eine Zeile.
3. **Nichts ändern** (DS-001 und ANN-109 wie festgelegt). Folge: Am Tablet
   bleiben die Symbole ohne Namen; die Akte beginnt am Handy im zweiten Drittel
   des Bildschirms.

**Empfehlung.** Option 1. Ohne Entscheidung und im selben Schritt: Hover ohne
Fläche. Das helle Schema allein meldet `index.html` seit UXR-001 an (vorher
„light dark“ mit dunklen Auswahllisten auf dunkel eingestellten Handys, Review
NAV-10).

### BEF-049 — Menü und Untermenü: Die Vorschau „Kommunikation“ belegt einen Tab, Organisatorisches ist am Handy zu lang, „Arbeitszeiten“ beginnt mit Einstellungen

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Bereich | Tableiste (unter 640 px), Alle Bereiche (`/bereiche`), Kopfsuche, Kommunikation (`/team`), Untermenü Organisatorisches, Arbeitszeiten (`/praxis/planung`), Radflotte (Vorschau)                                                                                                                                                                                                                                                                                                           |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-IDs NAV-07, VOR-04, VOR-09, ORG-08, ORG-06                                                                                                                                                                                                                                                                                                                                                        |
| Status  | offen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Berührt | `src/app/navigation.tsx` (`betriebUnterpunkte`, `tableiste`), `src/app/BereichePage.tsx` (Z. 38–41), `src/app/funktionen.ts` (Z. 245–266), `src/components/ui/SubNav.tsx` (Z. 40–58), `src/features/scheduling/SchedulingPage.tsx` (Z. 122, 211, 580–603), `src/features/staff/StaffMemberDetailPage.tsx` (Z. 259–264), `tests/e2e/organisation.spec.ts` (Z. 26–28); ANN-111, ANN-112; Festlegung vom 2026-09-22 (keine neuen Vorschau-Kennzeichnungen, `ARBEITSBEREICHE.md` Abschnitt 2) |

**Beobachtung.**

- **Tableiste und Kennzeichnung.** Die Tableiste nimmt bei mehr als fünf
  Bereichen die ersten vier — für owner und office Übersicht, Kalender,
  Patienten, Nachrichten; Abrechnung und Organisatorisches liegen hinter „Mehr“.
  „Kommunikation“ ist ganz Vorschau (Teamchat ohne Versand) und trägt weder in
  Seitenleiste, Tableiste noch Kopfsuche ein Vorschau-Zeichen; die Seite sagt es
  nur im Knopf „In die Vorschau schreiben“. `/bereiche` behauptet: „Bereiche
  ohne fertige Hintergrundfunktionen sind als Vorschau gekennzeichnet.“ — die
  Liste darüber kennzeichnet keinen. Der einzige Weg zum Vorschau-Protokoll
  steht dort; therapist und team_lead haben keinen „Mehr“-Eintrag, und ab 640 px
  führt kein Menü hin.
- **Untermenü Organisatorisches.** owner hat sechs Punkte plus „Vorschau (4)“;
  bei 390 px sind nur Mitarbeitende, Arbeitszeiten und Textbausteine ganz zu
  sehen, der Rest liegt rechts außerhalb, ohne Verlauf oder Pfeil — auf den
  Sicherheitsseiten auch der aktive Punkt selbst. Das beantwortet die offene
  Frage aus ANN-112 mit einer Messung: Auch eingeklappt ist die Leiste für owner
  zu lang.
- **Pannenweg.** „Panne melden“ liegt vier (therapist) bzw. fünf Tipps (owner,
  office) tief; die Kopfsuche findet „Panne“ nicht.
- **Arbeitszeiten.** Für owner stehen Praxisraster, Frist der automatischen
  Finalisierung und Startort der Touren als offene Karten mit eigenen
  Hauptknöpfen vor den Arbeitszeiten; „Behandelnde Person“ beginnt bei 1 610 px
  (390), 1 361 px (820) und 1 314 px (1440). Der Weg „Arbeitszeiten“ aus dem
  Mitarbeiterdatensatz landet beim Minutenraster, und die Dokumentationsfrist
  sucht unter „Arbeitszeiten“ niemand.

**Frage an Jannes.** (1) Wie weit sollen Vorschauen aus der Navigation
zurücktreten — bis ganz aus dem Menü (die offene Frage aus ANN-112)? (2) Wohin
gehören Raster, Frist und Startort?

**Optionen.**

1. **Nur berichtigen:** den Satz auf `/bereiche` an den Stand anpassen (etwa
   „Vorschauen — im Untermenü so bezeichnet — und die Kommunikation speichern
   nichts; was dort simuliert wurde, steht im Vorschau-Protokoll.“), von dort
   und aus der Suche ein Weg zum Vorschau-Protokoll für alle Rollen;
   Arbeitszeiten zuerst, Raster, Frist und Startort darunter eingeklappt als
   „Praxiseinstellungen“. Folge: kleinste Änderung; ein Daumenziel führt weiter
   in einen Chat ohne Versand, das Untermenü bleibt am Handy zu lang.
2. **Wie 1, dazu Reife vor Reihenfolge:** Die Tableiste überspringt Bereiche,
   die ganz Vorschau sind — owner und office sehen Übersicht, Kalender,
   Patienten, Abrechnung, Mehr; Sicherheit und Aufbewahrung werden ein Punkt;
   „Panne melden“ und „Schlüssel entnehmen“ findet die Suche als Vorgänge.
   Folge: Abrechnung mit einem Tipp, ein kürzeres Untermenü; die sechs Bereiche
   und ihre Reihenfolge in der Seitenleiste bleiben, und es entsteht keine neue
   Vorschau-Kennzeichnung.
3. **Vorschauen ganz aus dem Menü,** erreichbar nur über „Alle Bereiche“ und die
   Suche. Folge: das kürzeste Menü; wer eine Vorschau zeigen will, muss sie
   suchen.

**Empfehlung.** Option 2, Raster, Frist und Startort eingeklappt unter den
Arbeitszeiten (kein neuer Menüpunkt, das Untermenü soll kürzer werden). Ein
Vorschau-Zeichen an „Kommunikation“ empfiehlt dieser Befund bewusst nicht: Nach
deiner Festlegung vom 2026-09-22 entsteht eine Kennzeichnung nicht neu
(`ARBEITSBEREICHE.md` Abschnitt 2); der Satz auf `/bereiche` wird deshalb an den
Stand angepasst, nicht die Bereiche an den Satz. Den aktiven Punkt rollt das
Untermenü seit UXR-001 ins Bild (Review VOR-05, UIK-10); ohne Entscheidung
offen bleibt ein Verlauf am scrollbaren Rand; die E2E-Prüfung soll Sichtbarkeit prüfen statt
zu klicken. Den Pannenweg mit einem Tipp von der Übersicht baut FLT-EPIC-001.

### BEF-050 — Jede Seite heißt im Browser-Tab „Own Motion“

|         |                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                  |
| Bereich | Alle Seiten: Titel im Browser-Tab, Verlauf und Lesezeichen; Ansage der Vorlesesoftware beim Seitenwechsel                                                   |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-ID UIK-12                                                           |
| Status  | offen                                                                                                                                                       |
| Berührt | `index.html` (Z. 49), `src/components/ui/PageHeader.tsx`, `src/app/AppShell.tsx`; ADR-011; ADR-013 Punkt 9 (externer Datenfluss; Checkliste Nr. 5); ANN-023 |

**Beobachtung.** In allen Aufnahmen der laufenden Anwendung — über 1 100 — heißt
die Seite „Own Motion“: Übersicht, Akte, Kalender und Rechnung gleich. Gesetzt
wird der Titel nur in `index.html`; beim Seitenwechsel ändern sich weder Titel
noch Fokus. Vorlesesoftware sagt einen Seitenwechsel deshalb nicht an, und im
Büro heißen alle Tabs, Verlaufseinträge und Lesezeichen gleich — die richtige
Seite findet man nur durch Anklicken. Die Seitentitel selbst taugen nicht als
Quelle: Sie tragen Namen („Termin – Max Mustermann“, „Guten Morgen, Anna“), und
ein Tab-Titel landet in Verlauf, Lesezeichen und Browser-Synchronisation.

**Frage an Jannes.** Welche Titel tragen die Tabs? Fest steht nur: nie ein Name,
nie ein klinischer Inhalt.

**Optionen.**

1. **Seitenart und Marke:** „Kalender – Own Motion“, „Akte – Own Motion“,
   „Termin – Own Motion“, „Rechnung – Own Motion“, fest je Route und nie aus dem
   Seitentitel abgeleitet; Vollseiten mit eigenem Titel („Anmelden – Own
   Motion“); nach dem Seitenwechsel springt der Fokus auf den Inhalt. Folge:
   unterscheidbare Tabs und eine Ansage beim Seitenwechsel; ein Test hält fest,
   dass kein Titel Daten aus einer Abfrage enthält.
2. **Mit Bereich:** „Rechnungen – Abrechnung – Own Motion“. Folge: genauer, aber
   länger; im Tab ist meist nur der Anfang zu sehen.
3. **Mit Namen:** „Max Mustermann – Akte“. Folge: am bequemsten, aber Namen
   stünden im Browserverlauf und womöglich in der Synchronisation eines privaten
   Kontos — ein externer Datenfluss, den ADR-013 Punkt 9 für die Adresszeile
   schon ausschließt.

**Empfehlung.** Option 1; die Titelliste legst du fest, der Loop setzt sie mit
einem Titel je Route. „Own Motion“ bleibt als Zusatz, wie ANN-023 es für die
Marke vorsieht.

### BEF-052 — Gedruckte Blätter: Die Übersicht druckt ohne Rufnummern und spätere Besuche; Aufnahmeblätter und Terminzettel tragen keinen Absender

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Bereich | Übersicht (`/`, Browserdruck als Papierweg); Aufnahmeblätter (`/patienten/:id/aufnahmeblaetter`); Terminzettel (`/patienten/:id/terminzettel`)                                                                                                                                                                                                                                                                                                                                                                                                 |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs UEB-01, UEB-09, TER-19                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Status  | offen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Berührt | `src/index.css` (Druck-Basis, Z. 255–260), `src/features/today/MyDayPage.tsx` (Z. 326–347, 461–464), `src/features/today/Tagesliste.tsx` (Z. 118), `src/components/ui/buttonStile.ts` (Z. 53), `src/features/datenschutz/AufnahmeblaetterPage.tsx` (Z. 25–53), `src/features/datenschutz/patienteninformation.ts` (Z. 37), `src/features/appointments/AppointmentSlipPage.tsx` (Z. 39–42, 144–152), `tests/e2e/bericht.spec.ts` (Muster für einen Drucktest); ANN-021, ANN-039, ANN-041, ANN-123; ADR-012 Punkt 8 und 9; `marke/README.md`; B2 |

**Beobachtung.**

- **Übersicht als Papierweg.** ANN-021 macht den Browserdruck der Übersicht zum
  Papierweg für den Ausfall (ADR-012 Punkt 9). Die Druck-Basis blendet
  Kopfbereiche und Knöpfe aus. Datum und Name druckt der Seitenkopf seit UXR-001
  mit; es fehlen aber jede Rufnummer (sie ist ein Kartenknopf) und jeder
  Besuch ab dem dritten (er steht im zugeklappten „Weitere offene heute“); dafür
  stehen „Termin öffnen →“ und leere Aufklapper-Überschriften darauf. Belegt mit
  einem PDF aus der laufenden Anwendung (therapist, 390 px): keine der fünf
  Rufnummern, ein Besuch fehlt. Der Hinweis auf der Seite verspricht weiter
  „Anschrift, Rufnummer“.
- **Aufnahmeblätter.** Das Blatt für Patient:innen nennt als Praxis nur den
  Organisationsnamen und bittet, sich „persönlich, telefonisch oder schriftlich“
  an die Praxis zu wenden — Anschrift, Telefon und E-Mail stehen nicht darauf.
  Art. 13 Abs. 1 lit. a DSGVO verlangt die Kontaktdaten des Verantwortlichen.
- **Terminzettel.** Name, Termine und „Bitte sagen Sie einen Termin rechtzeitig
  ab …“ — Praxis und Telefon fehlen, Praxistermine nennen nur den internen
  Standortnamen. Eine zu späte Absage kann ein Ausfallhonorar auslösen. Der
  Kommentar im Code vertröstet auf die Praxis-Stammdaten aus ABR-000; die gibt
  es inzwischen, mit Feld Telefon.

**Frage an Jannes.** (1) Was muss auf dem Papier der Übersicht stehen, damit es
im Ausfall trägt — alle eigenen Besuche mit Anschrift und Rufnummer? (2) Sollen
Aufnahmeblätter und Terminzettel einen Absender aus den Praxis-Stammdaten
tragen, auch wenn therapist sie druckt?

**Optionen.**

1. **Vollständig:** Datum und Name als eigene Druckzeile, Rufnummern zusätzlich
   als Text, „Weitere offene heute“ beim Drucken aufgeklappt, Links und leere
   Überschriften weg. Auf beiden Patientenblättern ein Absender (Name,
   Anschrift, Telefon, E-Mail; beim Praxistermin die Standortanschrift) über
   eine Projektion nach dem Muster ANN-123, ohne Wortmarke. Folge: Das Papier
   trägt im Ausfall und nennt den Verantwortlichen; therapist liest über die
   Projektion die Briefkopffelder — dieselbe Öffnung wie beim Bericht (ANN-123),
   Teil der Prüfung B2; Projektion und Rollenschnitt gehen durch den kritischen
   Pfad.
2. **Übersicht knapp:** Datum, Uhrzeit, Name und Rufnummer, aber keine
   Anschriften — ANN-021 nennt ein Papier mit den Anschriften eines Tages einen
   Datenabfluss ohne Löschfrist. Absender wie 1. Folge: weniger auf Papier; im
   Ausfall fehlt die Anschrift, die man für den Weg braucht.
3. **Druck als ungeeignet kennzeichnen** und den Papierweg neu lösen. Folge:
   ADR-012 Punkt 9 ist dann wieder offen.

**Empfehlung.** Option 1, mit einem Drucktest je Blatt. Ein Blatt ohne Rufnummer
und Anschrift hilft im Ausfall nicht, und es enthält nur die eigenen Besuche
eines Tages — dieselben Angaben, die ohnehin auf dem Handy stehen. ANN-021 wird
damit fortgeschrieben: Die Anschriften stehen dann ausdrücklich auf dem Papier.

### BEF-053 — Kalender: Beim Planen aus der Verordnung wirken belegte Zeiten frei, und die Anlegen-Leiste deckt am Handy die Auswahl zu

|         |                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                            |
| Bereich | Kalender (`/kalender`): Planen aus Akte und Verordnung (`?patient=…&verordnung=…`), Anlegen-Leiste                                                                                                                                                                                                                                                                                                    |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs KAL-04, KAL-12, RSP-17                                                                                                                                                                                                                                                                                    |
| Status  | offen — (1) erledigt mit UBK-014 (2026-10-05, Option 1: andere Termine als „belegt“, ANN-239); (2) Anlegen-Leiste offen                                                                                                                                                                                                                                                                                |
| Berührt | `src/features/appointments/CalendarPage.tsx` (Z. 466, 618–625, 1028), `src/features/appointments/calendar.ts` (Z. 146), `src/features/treatment-bases/PatientTreatmentBasesPage.tsx` (Z. 296), `src/features/appointments/CalendarGrid.tsx` (Z. 709), `src/features/appointments/AnlegenMenue.tsx` (Z. 54–97), `tests/e2e/kalender.spec.ts` (Z. 42); ANN-050, ANN-108; AKTE-003; `ARBEITSBEREICHE.md` |

**Beobachtung.**

- **Patientenfilter.** Mit `?patient=` zeigt das Raster nur die Termine dieser
  Person; alle anderen Termine und Fehlzeiten verschwinden („Andere Termine …
  ausgeblendet“). Genau das ist der Planungsweg aus Akte und Verordnung:
  Tagesansicht aller Personen, ein Tipp auf eine scheinbar freie Stelle führt
  direkt ins Formular (ANN-050). Jede Zeit wirkt frei; die Überschneidung meldet
  erst der Server nach dem Ausfüllen — dann zurück, raten, neu versuchen. Die
  eigene Beschreibung des Parameters sagt etwas anderes: „was im Gitter
  hervorgehoben bleibt“ (`calendar.ts:146`). Am Code belegt, ohne Bild.
- **Anlegen-Leiste.** Die Leiste ist bei 390 × 844 rund 190 px hoch und steht
  über der Tableiste; unten sind damit rund 250 px belegt. Im Browser liegt nach
  einem Tipp bei 15:00 die ganze Auswahl unter der Leiste, der Fokus springt
  ohne Bildlauf hinein, und das Feld für den zweiten Tipp einer Spanne ist
  verdeckt. Bei 1440 px steht die Leiste am Fensterende, rund 470 px von der
  Auswahl. Der E2E-Test rollt die Auswahl eigens nach oben und prüft „deckt
  nicht zu“ nur dort. Das beantwortet die offene Frage aus ANN-108 („ob die
  Leiste … zu viel vom Raster verdeckt“) mit ja.

**Frage an Jannes.** (1) Soll der Patientenfilter die übrigen Termine
zurücknehmen statt ausblenden? (2) Wie soll die Leiste mit einer Auswahl im
unteren Drittel umgehen?

**Optionen.**

1. **Zurücknehmen und hochrollen:** Andere Einträge erscheinen als neutrale,
   gestrichelte Kachel „belegt“ mit vollem Text, die der Patient:in wie bisher;
   der Hinweis sagt „Termine von … sind hervorgehoben; andere Zeiten sind als
   belegt markiert.“ Nach dem Öffnen der Leiste rollt das Raster, bis die
   Auswahl über ihr steht; am Handy wird die Leiste dichter (Hinweiszeilen der
   Einträge weg, Gesten-Hinweis nur beim ersten Mal, rund 140 statt 190 px).
   Folge: Planen ohne Fehlversuche; sichtbar wird nichts Neues, der Ausschnitt
   ist ohnehin geladen (ANN-050, AKTE-003).
2. **Filter bleibt, Leiste wandert:** Ausblenden wie heute; die Leiste zurück an
   die Auswahl, aber seitlich (Änderungspfad von ANN-108). Folge: Das Raster
   zeigt weiter nicht, was belegt ist; neben einer schmalen Spalte ist am Handy
   wenig Platz.
3. **Wie heute.** Folge: Fehlversuche beim Planen aus der Verordnung und eine
   verdeckte Auswahl im unteren Drittel.

**Empfehlung.** Option 1 — ANN-050 nennt „hervorheben statt ausblenden“ selbst
im Änderungspfad. Dazu ein E2E-Fall mit einem Tipp im unteren Drittel, und die
Zeile in `ARBEITSBEREICHE.md` nachziehen.

### BEF-054 — Kalender und Tour: Tour braucht zwei Tipps und zeigt am Handy zuerst Filter und Karte, die Woche passt am Tablet nicht, Personenfarben tragen keine Bedeutung

|         |                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                       |
| Bereich | Kalender (`/kalender`): „Ansicht und Filter“, Wochenansicht, Kacheln; Tour (`/touren`)                                                                                                                                                                                                                                                                           |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-IDs KAL-14, TER-08, KAL-15, KAL-25                                                                                                                                                                                                                                       |
| Status | offen — (4) erledigt im UI-Redesign (Personenfarben weg, die Linie an der Kachel sagt den Zustand); (1) bis (3) offen, Lösung in `BEFUNDE-LOESUNGEN.md` |
| Berührt | `src/features/appointments/CalendarPage.tsx` (Z. 81–88, 446–455, 836–946), `src/features/appointments/CalendarGrid.tsx` (Z. 72–84, 347, 788), `src/features/tours/karte/Karte.tsx` (Z. 147, 309), `src/features/tours/TourenPage.tsx` (Z. 103, 146), `src/features/tours/Tourenliste.tsx` (Z. 75), `src/lib/kontrast.test.ts`; ANN-109, ANN-113, ANN-114; DS-001 |

**Beobachtung.**

- **Ansicht und Filter.** Hinter dem Symbol in der Rasterecke liegen neben den
  Filtern auch „Tour“, „Tag umplanen“ und alle Anlegewege. Das Feld ist bei
  390 px rund 490 px hoch und schiebt das Raster nach unten; Standort und Status
  sind bei 1440 px je rund 560 px breit. Die Tour braucht damit zwei Tipps — die
  offene Frage aus ANN-113.
- **Tour am Handy.** Reihenfolge bei 390 px: Kopf mit „Zum Kalender“ (rund
  150 px), drei gestapelte Filter (rund 250 px), die Karte mit 60 % der
  Fensterhöhe (bei 844 px rund 506 px), erst dann Routensumme, „Ganzer Tag“ und
  Stopps — „Ganzer Tag“ erst unterhalb von rund 1 100 px. Ein Finger auf der
  Karte verschiebt die Karte, nicht die Seite. Bei 1440 px stehen Karte und
  Liste untereinander, die Liste beginnt unter dem Falz.
- **Woche am Tablet.** Jede Spalte ist mindestens 144 px breit, und die Woche
  hat immer sieben Tage: 1 060 px. Bei 820 px sind 724 px nutzbar — 4,7 Tage,
  Freitag angeschnitten, Samstag und Sonntag nur per waagerechtem Wischen, das
  mit Ziehen und Blättern konkurriert; bei 1280 px fehlt ein Stück vom Sonntag.
  Das Wochenende steht auch ohne Arbeitszeit da. Die Begründung für breite
  Spalten im Code gilt der Tagesansicht mit sechs Personen.
- **Personenfarben.** Sechs Farben als freie Werte im Code, weder in der Palette
  noch im Kontrasttest; eine liegt nahe der Farbe für Fehler. Sie unterscheiden
  nichts, was nicht schon die Spalte (Tagesansicht) oder die einzige Person
  (Woche) sagt.

**Frage an Jannes.** (1) Tour mit einem Tipp? (2) Am Handy zuerst Liste oder
Karte? (3) Wochenende ohne Arbeitszeit schmal oder weg? (4) Personenfarben
behalten?

**Optionen.**

1. **Klein:** „Tour“ ab 640 px neben „Jetzt“ (Änderungspfad von ANN-113); die
   Anlegeknöpfe im Feld eingeklappt („Ohne Raster anlegen“); in der Woche
   schmalere Spalten (rund 96 px, die Tagesansicht bleibt bei 144 px);
   Personenfarben gestrichen (die eigene Person in der Hauptfarbe, andere
   neutral). Folge: Das Feld wird am Handy kürzer, die Woche passt bei 820 px;
   die Tour bleibt am Handy kartenlastig.
2. **Wie 1, dazu die Tour ordnen:** unter 640 px die Liste mit „Ganzer Tag“ vor
   der Karte (oder die Karte auf rund 40 % der Höhe), die Filter als eine Zeile
   „Anna Beispiel · So., 27.09. – ändern“, ab 1024 px Karte und Liste
   nebeneinander; Wochenende ohne Arbeitszeit und ohne Termine schmal, nicht
   ausgeblendet. Folge: Die Tour ist am Lenker in einem Bildschirm bedienbar;
   ANN-113 und ANN-114 werden fortgeschrieben.
3. **Personenfarben behalten, aber als Tokens** mit Kontrastprüfung (mindestens
   3:1) und ohne den rötlichen Ton. Folge: Farbe bleibt ein
   Wiedererkennungszeichen, trägt aber keine eigene Bedeutung.

**Empfehlung.** Option 2 mit gestrichenen Personenfarben. Ohne Entscheidung und
sofort: die Karte nur mit zwei Fingern verschieben (`cooperativeGestures`, gilt
auch für die Tagesroute der Übersicht), Standort und Status in schmaler Breite,
Fokus und Escape im Feld (Review KAL-21).

### BEF-055 — Am Termin schließt „Finalisieren“ einen offenen Besuch mit ab, ohne es zu sagen; dazu drei ähnliche Abschlusswege und zwei Hauptknöpfe

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Bereich | Termin (`/termine/:id`): geführter Ablauf „Was ist passiert?“, Abschnitt Behandlungsdokumentation; Schreibseiten der Dokumentation                                                                                                                                                                                                                                                                                                                                         |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs DOK-04, TER-02, dazu DOK-02                                                                                                                                                                                                                                                                                                                                                             |
| Status  | Teil 1 erledigt (PRX-005, 2026-09-28): Die Rückfrage am offenen Termin nennt die Folge für den Termin; der Hinweis auf die automatische Finalisierung stand schon an den Schreibseiten. Offen: Option 2 und 3 mit AKTE-006 |
| Berührt | `src/features/documentation/TreatmentNoteSection.tsx` (Z. 103–166, 224), `src/features/appointments/AppointmentDetailPage.tsx` (Z. 637–653, 770, 874, 1013–1050), `src/features/documentation/TreatmentNotePage.tsx` (Z. 168), `src/features/documentation/TreatmentNoteAddendumPage.tsx` (Z. 103), `app.mark_appointment_documented()` (Migration `20260912130000_appointment_documented.sql`); ADR-016 Punkt 4 und 7; ADR-018 Punkt 2 und 9; ANN-036; BEF-006 (AKTE-006) |

**Beobachtung.**

- **Finalisieren.** Steht zu einem Termin ein Entwurf, zeigt der Abschnitt
  „Finalisieren“ als Hauptknopf — auch am noch offenen Termin. Die Rückfrage
  sagt nur, dass der Wortlaut als Version 1 festgeschrieben wird. Die
  Finalisierung setzt den Termin aber auf „dokumentiert“ samt Abschlusszeit
  (ADR-018 Fassung 3, aus ANN-036) — derselbe Doppelschritt, den „Behandlung
  abschließen“ ausdrücklich ansagt („Mit dem Abschluss geschieht zweierlei …“).
  Am Hausbesuch umgeht das „Was ist passiert?“: „Tür geöffnet, nicht behandelt“
  (Pflichtvermerk) und „nicht angetroffen“ (Gebührenanlass) sind danach nicht
  mehr wählbar. Die Rückfrage ist eigens gebaut, der Fokus bleibt auf dem
  Auslöser. Live nachgestellt (390 px, Hausbesuch mit Entwurf). Dasselbe löst
  die automatische Finalisierung zum Fristende aus — dass es sie gibt, sagt die
  Schreibseite nicht; dort steht „Der Eintrag bleibt ein Entwurf; die
  Finalisierung ist ein eigener Schritt am Termin.“ (Review DOK-02).
- **Abschlusswege.** Am Hausbesuch sehen Behandelnde „Dokumentieren und
  abschließen“ (Hauptknopf), „Ohne Behandlung abschließen“, „Niemand
  angetroffen“, darunter „Ohne Dokumentation abschließen“ und im Doku-Abschnitt
  einen zweiten Hauptknopf („Dokumentation anlegen“ bzw. „Finalisieren“). „Ohne
  Behandlung“ und „Ohne Dokumentation“ klingen gleich und haben verschiedene
  Folgen. office und owner ohne Doku-Recht sehen die ersten beiden Szenarien
  ohne Knopf; ihr „Termin abschließen“ steht erst unter der Liste. Der geführte
  Ablauf beginnt bei 390 px erst unter der achtzeiligen Detailtabelle, bei rund
  1 000 px.

**Frage an Jannes.** (1) Darf am offenen Hausbesuch „Finalisieren“ angeboten
werden, oder führt der Weg dort immer über „Was ist passiert?“? (2) Wie heißen
und ordnen sich die Abschlusswege — als Eingabe für AKTE-006 (BEF-006)?

**Optionen.**

1. **Nur die Folge nennen:** Rückfrage-Baustein statt Eigenbau, und am offenen
   Termin der Satz „Der Termin wird dabei als durchgeführt geführt.“ Folge: Die
   Folge steht da (ADR-016 Punkt 4); am Hausbesuch bleibt der Umweg um die drei
   Szenarien möglich.
2. **Am offenen Hausbesuch kein „Finalisieren“,** stattdessen der Verweis auf
   „Was ist passiert?“ bzw. den Abschluss; an Praxisterminen wie 1. Folge: Die
   drei Szenarien aus ADR-018 Punkt 9 lassen sich am Knopf nicht mehr umgehen —
   über die automatische Finalisierung zum Fristende weiterhin.
3. **Wie 2, dazu die Abschlusswege ordnen:** ein Hauptknopf je Ansicht (der
   Doku-Abschnitt nachrangig, solange oben der Abschluss steht), „Ohne
   Dokumentation abschließen“ als „Nur Termin abschließen“ benannt und
   eingeklappt, für Rollen ohne Doku-Recht „Termin abschließen“ mit ehrlicher
   Folge im Szenario, der geführte Ablauf vor der Detailtabelle. Folge: Das ist
   der Zuschnitt aus BEF-006, jetzt mit Messwerten.

**Empfehlung.** Option 3 — den Teil aus 1 sofort, den Rest mit AKTE-006. Den
Hinweis auf die automatische Finalisierung an den Schreibseiten gleich mitnehmen
(„spätestens automatisch mit Ablauf der Dokumentationsfrist der Praxis“); ein
konkretes Datum am Eintrag bräuchte einen geänderten Lesepfad und bliebe eine
eigene Entscheidung.

### BEF-056 — Ungesicherter Text: kein Zwischenstand ohne Verlassen, kein Ausweg im Konfliktfall, Nachtrag festschreiben nur über den Termin

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bereich | Behandlungsdokumentation (Abschluss, Entwurf, Nachtrag, Korrektur), Therapiebericht, Erhebung (`/patienten/:id/befund/erheben`)                                                                                                                                                                                                                                                                                                                                                              |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs DOK-06, BEF-10, DOK-07, DOK-17                                                                                                                                                                                                                                                                                                                                                                            |
| Status  | offen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Berührt | `src/features/documentation/Textverlustschutz.tsx` (Z. 31, 112–124, 223), `src/features/documentation/api.ts` (Z. 140–174, 306), `src/features/therapy-reports/api.ts` (Z. 140), `src/features/assessments/ErhebungPage.tsx` (Z. 277–343), `src/features/documentation/TreatmentNoteAddendumPage.tsx` (Z. 91–119), `src/features/documentation/TreatmentNotePage.tsx` (Z. 147–164); ADR-001, ADR-015, ADR-016 Punkt 4, 6, 7 und 9; ANN-015, ANN-046, ANN-120; Oberflächen-Checkliste Punkt 5 |

**Beobachtung.**

- **iPhone.** Beim Neuladen und Schließen verlässt sich der Textverlustschutz
  auf `beforeunload`. Safari auf iOS zeigt dafür nach bekanntem Verhalten keine
  Rückfrage (am Gerät zu bestätigen, hier nicht prüfbar); Wegwischen der App
  oder das Verdrängen im Hintergrund beendet jede Seite still. Ein lokaler
  Zwischenspeicher ist ausgeschlossen (ANN-015, ADR-015) — der Schutz endet
  dort, wo unterwegs am meisten passiert.
- **Erhebung.** Datum, „Abschließen“ und „Als Entwurf speichern“ stehen nur nach
  der letzten Frage (Bogenhöhe 11 315 px), und beide Wege verlassen den Bogen.
  Einen Zwischenstand, ohne den Bogen zu verlassen, gibt es nicht.
- **Konfliktfall.** Die Meldungen raten „Bitte den eigenen Text sichern, die
  Ansicht neu laden …“. Neuladen verwirft den Text; „sichern“ geht am Handy nur
  über Kopieren in die Zwischenablage, die ANN-120 für Gesundheitsdaten meidet.
  Ist der Entwurf inzwischen automatisch finalisiert, lehnt der Server jedes
  Speichern ab; die Rückfrage bietet „Speichern“, das wieder scheitert, sonst
  nur „Verwerfen“. Am Code belegt, nicht nachgestellt (verlangt eine
  Datenänderung).
- **Nachtrag.** Festschreiben geht nur über den Termin: speichern, Termin
  öffnen, zum Abschnitt scrollen, „Finalisieren“, „Ja, jetzt finalisieren“. Beim
  Anlegen fehlt die Bausteinleiste, beim Bearbeiten der Ursprungseintrag. Bleibt
  ein Nachtrag liegen, wird er zum Fristende ungeprüft festgeschrieben (ADR-016
  Punkt 7).

**Frage an Jannes.** (1) Soll ein Entwurf während des Schreibens auf dem Server
gesichert werden, ohne die Seite zu verlassen — auf Knopfdruck oder von selbst?
(2) Soll der Konfliktfall den getippten Text als Nachtrag oder Korrektur
übernehmen können, und soll ein Nachtrag auf seiner eigenen Seite
festgeschrieben werden?

**Optionen.**

1. **Auf Knopfdruck:** „Zwischenstand sichern“ auf Dokumentation, Bericht und
   Erhebung, die Seite bleibt offen, mit Statusmeldung „Als Entwurf gesichert um
   10:42“ (in der Erhebung dazu „23 von 46 beantwortet“ in einer schmalen Leiste
   am unteren Rand). Folge: Verloren gehen kann nur, was nach dem letzten Tipp
   kam; am iPhone hilft es nur, wenn man daran denkt.
2. **Von selbst:** nach einer Pause im Tippen als Entwurf sichern — nur der
   eigene Text, nie ein offener Bausteinvorschlag (ANN-120) —, mit sichtbarem
   Stand. Folge: Der Schutz greift auch am iPhone; Entwürfe entstehen früher und
   laufen früher in die Frist (ADR-016 Punkt 7), es gibt mehr Auditeinträge
   (Punkt 9); ANN-046 („Speichern heißt Entwurf“) wird fortgeschrieben.
3. **Erst messen:** bis zum ersten Feldtag nichts ändern (Wiedervorlage von
   ANN-046) und am iPhone prüfen, ob `beforeunload` wirklich schweigt. Folge:
   Bis dahin bleibt der stille Verlust am iPhone möglich.

Zu (2), unabhängig davon: im Konfliktfall „Als Nachtrag übernehmen“ bzw. „In
Korrektur übernehmen“ mit dem Feldinhalt (ADR-016 Punkt 6), und „Nachtrag
festschreiben“ auf der Nachtragsseite mit dem Folgesatz über dem Knopf (Muster
ADR-016 Punkt 4). Folge: Der Text findet immer einen Weg in die Akte; beides ist
ein neuer Serverweg zur Finalisierung und deshalb nie nebenbei.

**Empfehlung.** Zu (1) Option 2, abgesichert durch die Messung aus 3: Zeigt das
iPhone die Rückfrage doch, reicht Option 1. Zu (2) beides. Ein Loop im
kritischen Pfad. Ohne Entscheidung und sofort: kein „neu laden“, solange Text im
Feld steht; beim Terminkonflikt auf „Nur als Entwurf speichern“ verweisen;
Bausteinleiste auch beim Anlegen eines Nachtrags; Ursprung beim Bearbeiten
zugeklappt. Davon getrennt, ebenfalls ohne Entscheidung: Der Therapiebericht und
mehrere Formulare haben gar keinen Schutz vor Verlust (Review ZST-02, NAV-01).

### BEF-057 — Dokumentieren und Erheben am Handy: Das Textfeld beginnt bei 458 px, Bausteinzeilen brauchen zwei Reihen, Skalenstufen sind 29 px breit

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Bereich | Behandlungsdokumentation (`/termine/:id/abschluss`, `/termine/:id/dokumentation`, Nachtrag); Befund aus Bausteinen; Erhebung (Skalenfragen)                                                                                                                                                                                                                                                                                                                           |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 375, 390 und 820 px, Gegenprüfung; Review-IDs DOK-09, BEF-21, BEF-05                                                                                                                                                                                                                                                                                                                                                |
| Status | offen — Teil 1 (Textfeld) erledigt in UI-Redesign Zyklus 2 (Schreibseite, Messung bei BEF-001); Bausteinzeile und Skala offen, Lösung in `BEFUNDE-LOESUNGEN.md` |
| Berührt | `src/features/documentation/TextbausteinLeiste.tsx` (Z. 29–35), `src/features/documentation/DocumentationShell.tsx` (Z. 56), `src/features/documentation/CompleteTreatmentPage.tsx` (Z. 202, 240), `src/features/documentation/TreatmentNoteAddendumPage.tsx` (Z. 91), `src/features/assessments/BausteinFeld.tsx` (Z. 90, 229–285, 418–440), `src/features/assessments/FragebogenFelder.tsx` (Z. 208–228); BEF-001; ANN-129, ANN-130; Oberflächen-Checkliste Punkt 1 |

**Beobachtung.** BEF-001 verlangt, vor jeder Umsortierung neu zu messen.
Gemessen bei 390 × 844 und 375 × 667:

- **Textfeld.** Auf Abschluss und Dokumentation beginnt es bei **458 px** (am
  2026-09-11: 359). Davor stehen Rückweg, kompakter Kopf, die Textbausteinleiste
  (drei Bausteine brauchen zwei bis drei Zeilen, dazu „Bausteine verwalten“) und
  ein zweizeiliger Hinweis, der den Folgesatz vor dem Knopf wiederholt. Beim
  ersten Laden springt das Feld um 160 px, weil die Leiste während des Ladens
  nichts zeichnet. Mit „Ohne Behandlung“ (Vermerk vor dem Feld) beginnt es bei
  669 px — bei 667 px Höhe ganz unter dem Falz. Der Nachtrag zeigt den
  vollständigen Ursprungseintrag vor dem Feld.
- **Befund aus Bausteinen.** Nach Feld-, Block- und Gruppenrahmen und der
  Seitenspalte bleiben 240 bis 290 px für „o.B.“, „positiv“ und „nicht
  getestet“, die zusammen rund 350 px brauchen: Jede Testzeile belegt zwei
  Reihen, bei „beidseits“ zwei Zeilen je Test. Ein Block wird am Handy etwa
  doppelt so lang.
- **Skalenfragen** (Schmerzstärke, Stress). Elf Stufen von je rund 29 × 44 px
  mit 2 px Abstand; ab 640 px bleibt die Reihe unnötig bei 448 px. Der gewählte
  Wert steht nirgends als Text. Mit Handschuhen oder im Stehen trifft man leicht
  die Nachbarstufe — und der Wert steht danach als Messpunkt im Verlauf.

**Frage an Jannes.** Welche Höhe über dem Feld darf weg — und welche Form sollen
Bausteinzeile und 0–10-Skala am Handy haben?

**Optionen.**

1. **Ohne Gestaltungsänderung:** den Platz der Bausteinleiste beim Laden
   freihalten (kein Sprung), die Skala ab 640 px auf ganze Breite (mindestens
   59 px je Stufe), den gewählten Wert als Text („gewählt: 6“). Folge: Das Feld
   beginnt weiter bei 458 px, die Skala bleibt am Handy 29 px breit je Stufe.
2. **Dichter am Handy:** wie 1, dazu die Bausteinleiste unter 640 px einzeilig
   und waagerecht scrollbar, den Hinweis kürzen, wo der Folgesatz ohnehin vor
   dem Knopf steht, den Vermerk „Ohne Behandlung“ einzeilig mit „Mehr“, den
   Ursprung im Nachtrag zugeklappt; im Bausteinfeld die Seitenmarke über der
   Knopfreihe statt als Spalte, schmalere Ergebnisknöpfe, der Block ohne eigenen
   Rahmen. Folge: Feld und Testzeilen rücken deutlich nach oben, eine Testzeile
   passt in eine Reihe; Name, Datum und Uhrzeit bleiben im Kopf (BEF-001: Schutz
   vor Falschzuordnung).
3. **Skala am Handy in zwei Reihen,** 0–5 und 6–10, mit Stufen von mindestens
   44 px. Folge: Das Tippziel erfüllt Checkliste Punkt 1; die Skala sieht am
   Handy anders aus als auf dem Papierbogen.

**Empfehlung.** Option 2 mit der Skala aus 3 — ein Fehltipp auf einer Messskala
verfälscht einen Wert, der im Verlauf weiterlebt. Option 1 sofort, sie ändert
nichts an der Gestaltung. Deine Beobachtung an einem echten Tag bleibt Eingabe,
wie BEF-001 es verlangt; nach der Umsetzung bei 375 px nachmessen.

### BEF-058 — Der Fotobereich steht vor dem Behandlungsverlauf, auch ohne Einwilligung und ohne Fotos

|         |                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                        |
| Bereich | Akte → Verlauf (`/patienten/:id/verlauf`), Einstieg „Bisherige Doku“ auf der Tageskarte der Übersicht                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 820 px, Gegenprüfung; Review-IDs DAT-16, DOK-16                                                                                                                                                                                         |
| Status  | offen                                                                                                                                                                                                                                                                                             |
| Berührt | `src/features/documentation/PatientCoursePage.tsx` (Z. 17–21), `src/features/files/FotosImVerlauf.tsx` (Z. 485–563), `src/features/documentation/PatientRecordDocumentation.tsx` (Z. 159–166), `src/features/today/MyDayPage.tsx` (Z. 243); DOK-006; UX-EPIC-003; Oberflächen-Checkliste Punkt 11 |

**Beobachtung.** Die Seite stellt „Patientenfotos“ vor die Dokumentation (so
gebaut in DOK-006) und zeigt den Abschnitt immer ganz: Titel, dreizeiliger
Hinweis, Einwilligungsstand, bei null Fotos ein Leerzustand mit großem
Innenabstand und das Kleingedruckte. Ohne Einwilligung und ohne Fotos belegt er
bei 390 px rund 420 px. Mit Rückweg, Aktenkopf und Bereichsleiste beginnt der
erste Termin in einer gefüllten Akte erst bei rund 1 130 px; bei langem
Aktenkopf beginnen schon die Fotos erst bei rund 670 px. Genau hierher führt
„Bisherige Doku“ auf der Tageskarte — der Weg, der vor der Tür mit einem Tipp
zur letzten Behandlung führen soll (UX-EPIC-003).

**Frage an Jannes.** Soll der Verlauf mit den jüngsten Einträgen beginnen und
die Fotos danach oder zugeklappt zeigen?

**Optionen.**

1. **Reihenfolge bleibt, Umfang schrumpft:** ohne Fotos eine Zeile („Fotos:
   keine · Einwilligung nicht vermerkt“, bei erteilter Einwilligung „Foto
   aufnehmen“ daneben), mit Fotos „Fotos (3)“ zum Aufklappen, nach einer
   Aufnahme offen; das Kleingedruckte in den Hinweis. Folge: Die Festlegung aus
   DOK-006 bleibt, der erste Eintrag rückt um rund 350 px nach oben.
2. **Fotos unter die jüngsten Einträge.** Folge: Die Dokumentation steht nach
   einem Tipp oben; ändert die Reihenfolge aus DOK-006.
3. **„Bisherige Doku“ springt direkt zum ersten Eintrag** (Anker), die Seite
   bleibt. Folge: Nur der Weg aus der Übersicht wird kurz; wer die Akte über die
   Reiter öffnet, scrollt weiter.

**Empfehlung.** Option 1 zusammen mit dem Anker aus 3 — beides ändert keine
Festlegung, und der erste Eintrag steht bei 390 px wieder im ersten oder zweiten
Bildschirm. Nach der Umsetzung neu messen.

### BEF-059 — Dateien: „Öffnen“ lädt herunter, die Art ist mit „Befund“ vorbelegt, und die vorgeschlagenen Namen unterscheiden nichts

|         |                                                                                                                                                                                                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                       |
| Bereich | Akte → Dateien (`/patienten/:id/dateien`); Behandlungsgrundlagen → „Scan des Rezepts“; Verlauf → Fotos                                                                                                                                                                                                                           |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs DAT-02, DAT-07, DAT-18                                                                                                                                                                                                                        |
| Status  | offen — Teil (1) „Öffnen heißt Anzeigen“ erledigt in ABN-EPIC-001c (ABN-027; PDF in der App offen, ANN-223); Teile (2) und (3) offen |
| Berührt | `src/features/files/api.ts` (Z. 235–237), `src/features/files/Dateiliste.tsx` (Z. 64, 100, 126, 213, 362–400), `src/features/files/dokumentarten.ts` (Z. 77–78), `src/features/files/kamera.ts` (Z. 16–22), `src/features/files/FotosImVerlauf.tsx` (Z. 160, 190); ADR-017 Punkt 12, 15, 17, 19 und 40; ANN-129; ADR-013 Punkt 9 |

**Beobachtung.**

- **Öffnen.** Der Verweis wird mit dem Anzeigenamen als Downloadnamen signiert
  (ADR-017 Punkt 15), die Antwort kommt als Anhang. Am iPhone erscheint statt
  des Rezepts eine Download-Rückfrage, und die Datei liegt danach in
  „Downloads“, womöglich in iCloud Drive — genau das, was ADR-017 Punkt 40 für
  Fotos ausschließt; Punkt 19 sieht für alle Dateien die Anzeige „im eigenen
  Rahmen der Anwendung“ vor. Das Fenster öffnet sich erst nach zwei
  Serveraufrufen, mit `noopener`; ein Popup-Blocker bliebe unbemerkt, der
  Zugriff wäre trotzdem protokolliert. Der Knopf heißt „Öffnen“. Nicht ausgelöst
  (jedes Öffnen schreibt einen Auditeintrag).
- **Vorbelegte Art.** Ohne Kontext wählt das Formular die erste Art: für
  behandelnde Rollen „Befund“, für office „Einwilligung“. Wer nur die Datei
  wählt und „Datei hinzufügen“ tippt, legt sie still als Befund ab — die Art
  bestimmt, wer löschen darf, und ist nach ADR-017 eine Sichtbarkeitsgrenze;
  vorbelegt werden soll nur „aus dem Kontext“. Der artabhängige Hinweis steht
  zwischen Beschriftung und Auswahl und lässt das Feld bei jedem Wechsel
  springen (40 px bei 390 px).
- **Namen.** Der Anzeigename wird mit dem rohen Dateinamen vorbelegt (etwa
  `IMG_4711.jpg`), Kamerafotos heißen „Foto vom 27.09.2026“ — zwei Aufnahmen
  eines Tages tragen denselben Namen. Ohne Vorschaubilder (Punkt 40) ist der
  Name das einzige Merkmal; wer das richtige Foto sucht, öffnet mehrere, und
  jedes Öffnen ist ein Auditeintrag.

**Frage an Jannes.** (1) Soll „Öffnen“ eine Datei in der Anwendung zeigen statt
herunterzuladen? Das braucht eine neue Fassung von ADR-017 Punkt 15. (2) Soll
die Dokumentart ohne Vorauswahl starten? (3) Welches Namensschema?

**Optionen.**

- Zu (1):
  - **a) Download bleibt,** der Knopf heißt ehrlich „Herunterladen“. Folge:
    keine ADR-Änderung; Gesundheitsdaten landen weiter im Download-Ordner des
    Geräts.
  - **b) Anzeigen im eigenen Rahmen** wie bei Patientenfotos (in den Speicher
    der Seite laden, `no-store`, PDF und Bild), „Herunterladen“ als eigener,
    ebenso protokollierter Schritt für den Versand außerhalb der Anwendung
    (Punkt 17). Folge: neue Fassung von ADR-017 für Punkt 15; der Anzeigeweg aus
    Punkt 40 ist schon gebaut.
  - **c) Nur anzeigen, kein Download.** Folge: wie bei Fotos; ein Befund für die
    Ärzt:in ließe sich dann nur noch drucken.
- Zu (2): **a)** wie heute; **b)** leere Option „Bitte wählen …“, „Datei
  hinzufügen“ erst mit gewählter Art — wie die Seitenwahl ohne Vorauswahl
  (ANN-129). Folge von b: ein Tipp mehr, keine still falsch eingeordnete Datei.
- Zu (3): **a)** in „Dateien“ „‹Art› vom ‹Datum›“ ohne Endung vorschlagen, Fotos
  mit Uhrzeit („Foto vom 27.09.2026, 10:42“), den Verordnungsscan mit seinem
  Verordnungsdatum zeigen; **b)** die Körperregion als Pflichtangabe am Foto.
  Folge von b: aussagekräftiger, aber eine Eingabe mehr je Aufnahme.

**Empfehlung.** (1) b, (2) b, (3) a. Für (1) eine Docs-Session zu ADR-017 vor
dem nächsten Loop an den Dateien, weil es vor der ersten echten Datei geklärt
sein muss; der Rest im selben Loop. Unabhängig davon am echten iPhone prüfen, ob
das Fenster nach zwei Serveraufrufen blockiert wird. Ohne Entscheidung: an den
Namensfeldern kein Autofill, Enter löst Hinzufügen bzw. Speichern aus; der
gleichbleibende Satz „sichtbar für alle Praxisrollen“ entfällt, die artabhängige
Erläuterung steht unter der Auswahl.

### BEF-060 — Behandlungsgrundlage: Bauart mit „Erstverordnung“ vorbelegt, Karte ohne Hauptaktion, Kontakt der Verordner:innen nur im Formular

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Bereich | Akte → Behandlungsgrundlagen (`/patienten/:id/verordnungen`), Grundlage erfassen und bearbeiten; Verordner:innen (`/verordner`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs VER-07, DAT-17, VER-18, VER-10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Status  | Teile 1 und 2 erledigt in PRX-EPIC-003 (PRX-010, PRX-011, 2026-09-29): Art ohne Vorbelegung, „Weiteren Scan hinzufügen“ neben einem vorhandenen Scan; offen: Hauptaktion je Zustand der Karte (Rest von 2) und Kontaktwege der Verordner:innen (3) |
| Berührt | `src/features/treatment-bases/api.ts` (Z. 532), `src/features/treatment-bases/TreatmentBasisFormFields.tsx` (Z. 78–93, 266–268), `src/features/treatment-bases/TreatmentBasisFormPage.tsx` (Z. 172–187), `update_treatment_basis` (Migration `20260918130000_appointment_count.sql`, Z. 498–503), `src/features/treatment-bases/PatientTreatmentBasesPage.tsx` (Z. 146, 310–361, 396–401), `src/features/files/Dateiliste.tsx` (Z. 174, 505, 527), `src/features/therapy-reports/BerichteDerVerordnung.tsx` (Z. 113), `src/features/treatment-bases/PrescribersListPage.tsx` (Z. 81–92), `src/features/treatment-bases/PrescriberFormFields.tsx` (Z. 117–144), `src/features/billing/InvoicePrintPage.tsx` (Z. 341); ADR-017 Punkt 10; ADR-020 Punkt 3 und 4; ANN-074; Oberflächen-Checkliste Punkte 8 und 11 |

**Beobachtung.**

- **Bauart.** Eine neue Grundlage ist als „Erstverordnung“ vorbelegt; das Feld
  „Art“ hat keine leere Option. Folgeverordnung oder Selbstzahler werden so ohne
  bewusste Wahl als Erstverordnung gespeichert — und die Bauart steht auf
  Rechnung und Therapiebericht. Der Wechsel auf Selbstzahler leert Verordner:in
  und Diagnose und blendet beide im selben Moment aus; beim Speichern räumt der
  Server zusätzlich Therapieziel, Verordnerhinweis und Empfehlung ab, während
  der Kasten „Aus dem Bestand“ versichert, sie „bleiben beim Speichern
  unverändert stehen“. Im Browser nachgestellt (therapist, 390 px, nichts
  gespeichert).
- **Karte.** Bis zu vier Aktionen („Terminserie anlegen“, „Im Kalender einen
  Platz suchen“, „Termine übertragen“, „Bearbeiten“) stehen als gleichrangige
  Textlinks nebeneinander, darunter „Therapiebericht schreiben“ als größter
  Knopf der Karte. An jeder laufenden Verordnung stehen ein Leerzustand und das
  volle Uploadfeld mit Hauptknopf — auch wenn schon ein Scan da ist; office
  liest dort eine Aufforderung, der es nicht folgen darf. In „Dateien“ steht das
  Uploadfeld unter der Liste, das Ergebnis erscheint oben (bei 390 px beginnt
  das Formular bei rund 1 040 px).
- **Verordner:innen.** Die Kartei zeigt Praxis, Fachrichtung und Ort; die ganze
  Zeile führt ins Bearbeitungsformular, bei 1440 px bleiben rechts rund 750 px
  leer. Telefon, Fax und E-Mail gibt es nur als Eingabefelder, nirgends `tel:`
  oder `mailto:`, und die Verordnungskarte nennt nur Name und Praxis. Wer eine
  Folgeverordnung anfordern will, schreibt die Nummer aus einem offenen Formular
  ab.

**Frage an Jannes.** (1) Soll die Bauart ohne Vorauswahl starten? (2) Welche
Aktion ist je Zustand der Verordnung die Hauptaktion? (3) Brauchen
Verordner:innen eine Leseansicht mit Kontaktwegen, auch an der Verordnungskarte?

**Optionen.**

- Zu (1): **a)** Vorbelegung bleibt — Folge: stille Erstverordnungen auf
  Rechnung und Bericht; **b)** „Bitte wählen …“ als erste Option, kein geratener
  Wert, der auf der Rechnung steht (wie ANN-074 beim Umsatzsteuerstatus) —
  Folge: ein Tipp mehr bei jeder neuen Grundlage.
- Zu (2): **a)** gleichrangig wie heute; **b)** je Zustand eine Hauptaktion —
  offen: „Terminserie anlegen“, verplant: „Termine übertragen“ —, „Bearbeiten“
  ruhig in den Kartenkopf, der Bericht als ruhige Aktion, der Scan als eine
  Zeile mit Zustand und „Scan hinzufügen“ zum Aufklappen (liegt einer vor:
  „Weiteren Scan hinzufügen“), für Rollen ohne Hinzufügen nur „Noch kein Scan.“;
  in „Dateien“ „Datei hinzufügen“ oben. Folge von b: Die laufende Karte wird am
  Handy deutlich kürzer (heute rund 1 790 px, davon rund 760 px Bericht, Scan
  und Upload); der nächste Schritt ist erkennbar.
- Zu (3): **a)** Kontaktwege in der Karteizeile als eigene Links (Telefon,
  E-Mail; Fax als Text), die Zeile führt weiter zum Bearbeiten, dazu Telefon und
  Fax an der Verordnungskarte; **b)** eine eigene Leseansicht, Bearbeiten als
  Aktion darin. Folge von b: eine Seite mehr, dafür kein Nachschlagen in einem
  offenen Formular.

**Empfehlung.** (1) b, (2) b, (3) a — sie erfüllt Checkliste Punkt 8 ohne neue
Seite. Ohne Entscheidung beim Wechsel der Bauart: Werte im Zustand behalten und
nur nicht senden, der sichtbare Satz „Verordner:in und Diagnose entfallen beim
Selbstzahler.“, der Kasten „Aus dem Bestand“ sagt „werden beim Speichern
entfernt“, und das Speichern fragt nach.

### BEF-061 — Die Rechnungsliste endet stumm bei 100 Rechnungen, es gibt keine Suche, und am Rechner sind Rechnungen gestreckte Handy-Karten

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Bereich | Abrechnung (`/abrechnung`): Rechnungen, Offene Posten, Zahlungen, erfasste Leistungen; Rechnung und Druckblätter bei 1440 px                                                                                                                                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs ABR-02, ABR-32                                                                                                                                                                                                                                                                                                                               |
| Status  | offen                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Berührt | `src/features/billing/api.ts` (`list_invoices`, `list_open_items`, `list_payments` mit `p_limit: 100`), `src/features/billing/InvoicesPage.tsx` (Z. 130–134, 201, 249, 354), `src/features/billing/InvoiceDetailPage.tsx` (Z. 165), `src/features/billing/InvoicePrintPage.tsx` (Z. 78–85, 323), `list_invoices` (Migration `20260923120000_abgewiesene_lesezugriffe_rest.sql`); ANN-061; ADR-009; ADR-013 Punkt 9 (RPC, Rechnungsdaten) |

**Beobachtung.**

- **Obergrenze.** Die Liste lädt höchstens 100 Rechnungen, Entwürfe zuerst, dann
  nach Monat absteigend. Die Seite sagt nicht, dass gekürzt ist, und bietet
  weder Suche (Nummer, Name) noch Filter (Entwurf, offen, überfällig, storniert)
  noch Blättern. Eine Rechnung ist sonst nirgends erreichbar — nicht aus der
  Akte und bewusst nicht über die Kopfsuche (ANN-061). Offene Posten und
  Zahlungen enden ebenso bei 100, erfasste Leistungen bei 200. Der Hinweis unter
  „Offene Posten“ nennt die gekürzte Anzahl, aber die ungekürzte Summe. Sobald
  mehr als 100 Rechnungen bestehen — bei monatlicher Abrechnung je Person nach
  wenigen Monaten —, verschwinden die ältesten ohne Hinweis; Nachdruck, Storno
  oder das Zuordnen eines Zahlungseingangs über die Rechnungsnummer werden dann
  zur Suche von Hand oder unmöglich. Am Code belegt; der Seed hat fünf
  Rechnungen.
- **Am Rechner.** Bei 1440 px stehen Bezeichnung und Betrag rund 1 000 px
  auseinander, jede Rechnungszeile trägt einen eigenen 48-px-Knopf „Rechnung
  ansehen“, die Nummer ist kein Link (unter „Zahlungen“ schon), und unter
  „Abzurechnen“ steht die Summe mitten in der Zeile. Auf den Druckseiten stehen
  „← Zurück“ und „Rechnung drucken“ links außerhalb der Blattkante.

**Frage an Jannes.** Soll die Abrechnung eine Suche und Filter bekommen — und
bis dahin wenigstens sagen, dass die Liste gekürzt ist? Und soll sie am Rechner
als kompakte Liste erscheinen?

**Optionen.**

1. **Nur ehrlich machen:** Ist die Grenze erreicht, steht „Es werden die 100
   zuletzt abgerechneten Rechnungen gezeigt.“; unter „Offene Posten“ nur die
   Summe. Folge: reine Anzeige, sofort möglich; ältere Rechnungen bleiben
   unerreichbar.
2. **Suche und Filter auf dem Server:** Suche nach Nummer und Name, Filter nach
   Zustand und Monat, „Weitere laden“ oder Blättern, die Anzahl offener Posten
   vom Server. Folge: geänderte Lesepfade der Abrechnung, also kritischer Pfad
   mit Tests in `pnpm test:db`.
3. **Wie 2, dazu am Rechner eine Listenform:** ab 1024 px kompakte Zeilen, die
   Nummer als Link, der Betrag rechtsbündig in eigener Spalte; Rechnungsbild und
   Druckknöpfe auf Blattbreite. Folge: mehr Umbau, deutlich mehr Überblick am
   Arbeitsplatz des Büros.

**Empfehlung.** Option 1 sofort, Option 3 im nächsten Loop der Abrechnung — vor
dem ersten echten Rechnungslauf, weil die Grenze danach still erreicht wird.

### BEF-062 — Nach einem Storno führen zwei Wege zur neuen Rechnung, und nur einer behält den Bezug; Empfänger lassen sich nur anlegen

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Bereich | Abrechnung: „Abzurechnen“ (`/abrechnung`), stornierte Rechnung und Rechnungsentwurf (`/abrechnung/rechnungen/:id`), Abschnitt „Empfänger“                                                                                                                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs ABR-08, ABR-19                                                                                                                                                                                                                                                                                                                                     |
| Status  | offen                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Berührt | `create_invoice_draft`, `create_correction_draft` (Migration `20260921140000_invoice_service_area.sql`, Z. 627–629), `list_invoice_candidates`, `save_invoice_recipient`; `src/features/billing/api.ts` (Z. 263, 592–594), `src/features/billing/InvoicesPage.tsx` (Z. 336–358), `src/features/billing/InvoiceDetailPage.tsx` (Z. 566, 682–733, 807); ADR-009 Punkt 9 und 10; ANN-079; BEF-018; ADR-013 Punkt 9 (Rechnungsdaten, RPC) |

**Beobachtung.**

- **Korrekturbezug.** Nach dem Storno stehen die Leistungen wieder unter
  „Abzurechnen“ mit dem gewohnten „Entwurf anlegen“ — ohne Bezug zur stornierten
  Rechnung. Nur „Korrekturrechnung erstellen“ an der stornierten Rechnung
  verknüpft (ANN-079). Wer den Weg der Startseite nimmt, bekommt eine Rechnung
  ohne den Satz „Korrekturrechnung zur stornierten Rechnung …“ auf dem Blatt;
  ein späterer Klick auf „Korrekturrechnung erstellen“ meldet „… steht bereits
  ein Entwurf. Er ist die Korrektur.“ — obwohl er nicht verknüpft ist. Die Zeile
  unter „Abzurechnen“ verrät die Herkunft nicht. Der Seed zeigt beide Wege
  zugleich. Beim Empfänger liegen dann zwei Rechnungen über dieselben Leistungen
  ohne Bezug — genau der Fall, den ADR-009 Punkt 9 vermeiden soll.
- **Empfänger.** Hinterlegte Empfänger lassen sich nur neu anlegen, nicht
  korrigieren oder entfernen, obwohl die Speicherfunktion eine Kennung annimmt.
  Einen Standardempfänger gibt es nicht, ein neu gespeicherter Empfänger ist
  danach nicht gewählt, die Art ist mit „Beihilfestelle“ vorbelegt. Bei 390 px
  bricht „Empfänger speichern“ zweizeilig im 48-px-Knopf um, und der gesperrte
  Knopf sagt nicht, was fehlt. Ein Tippfehler in der Anschrift einer
  Beihilfestelle bleibt stehen; jeden Monat ist der Empfänger je Person neu zu
  wählen.

**Frage an Jannes.** (1) Welcher Weg soll nach einem Storno zur neuen Rechnung
führen? (2) Sollen Empfänger bearbeitbar sein und einer je Person als Standard
gelten?

**Optionen.**

- Zu (1):
  - **a) Der Server verknüpft selbst:** Ein neuer Entwurf bezieht sich auf die
    stornierte Rechnung desselben Monats und Leistungsbereichs. Folge: Beide
    Wege ergeben dasselbe; die Regel muss eindeutig sein, auch bei zwei Stornos.
  - **b) Nur ein Weg:** Die Zeile unter „Abzurechnen“ nennt die Herkunft („aus
    stornierter RG-… – Korrekturrechnung erstellen“) und bietet nur diesen Weg.
    Folge: Der Bezug entsteht immer sichtbar; eine Zeile mehr Text.
- Zu (2):
  - **a) Wie heute** (nur anlegen). Folge: siehe oben.
  - **b) Bearbeiten und Standard:** Empfänger korrigieren und einen je Person
    als Standard setzen; der neu gespeicherte wird gleich gewählt. Wirkt auf
    Entwürfe, nie auf ausgestellte Rechnungen (Snapshot, ADR-009 Punkt 10).
    Folge: geänderte Rechnungsdaten, kritischer Pfad.

**Empfehlung.** (1) b — der sichtbare Weg ist leichter zu prüfen als eine
Zuordnung im Hintergrund und beantwortet genau die Wiedervorlage von ANN-079
(„ob die Praxis die Korrekturrechnung so findet“). (2) b. Beides ein Loop im
kritischen Pfad. Sofort und nur Text: die Meldung „Er ist die Korrektur.“
ehrlich machen („… ein Entwurf ohne Bezug zur stornierten Rechnung. Bitte
verwerfen und hier neu anlegen.“). Ohne Entscheidung: Knopfzeile umbrechen, die
Art ohne Vorbelegung („Bitte wählen …“), der Grund am gesperrten Knopf („Name
oder Stelle fehlt“).

### BEF-063 — „Rechnung ausstellen“ geschieht mit einem Tipp, während folgenlose Schritte nachfragen

|         |                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                  |
| Bereich | Rechnungsentwurf (`/abrechnung/rechnungen/:id`); Datenschutz der Akte (`/patienten/:id/datenschutz`), Widerruf der Fotoeinwilligung                                                                                                                                                                                                                         |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 px, Gegenprüfung; Review-IDs ABR-15, ZST-15                                                                                                                                                                                                                                                           |
| Status  | offen                                                                                                                                                                                                                                                                                                                                                       |
| Berührt | `src/features/billing/InvoiceDetailPage.tsx` (Z. 847–869), `src/features/billing/CatalogPage.tsx` (Z. 423), `src/features/datenschutz/PatientDatenschutzPage.tsx` (Z. 245, 270), `src/features/files/FotosImVerlauf.tsx` (Z. 394); ADR-009 Punkt 9; ADR-016 Punkt 4 (Muster „Folge vor dem Knopf“); ANN-127; `OPTIMIERUNG.md` (Messgrößen Z und F); BEF-064 |

**Stand nach UXR-006.** Der Foto-Widerruf fragt inzwischen nach (Review PAT-04,
umgesetzt an genau einer Stelle, `VermerkErfassen`); offen ist nur noch die
Frage zum Ausstellen der Rechnung.

**Beobachtung.** Ausstellen vergibt eine Nummer aus dem lückenlosen Kreis und
macht die Rechnung unveränderlich; korrigierbar ist sie nur per Storno mit
eigener Nummer und neuer Rechnung. Dafür genügt ein Tipp auf den Hauptknopf; die
Folge steht als Absatz davor — dasselbe Muster wie beim Abschluss der
Dokumentation (ADR-016 Punkt 4). Das folgenlose „Entwurf verwerfen“ daneben und
„In Kraft setzen“ im Katalog fragen dagegen nach; ist die Verwerfen-Rückfrage
offen, stehen ihr „Verwerfen“ und „Rechnung ausstellen“ als zwei gefüllte Knöpfe
direkt untereinander. Der Widerruf der Fotoeinwilligung löscht alle Fotos der
Person sofort (ANN-127); auch dort stehen nur ein Feldhinweis und die
Knopfbeschriftung, während das Löschen eines einzelnen Fotos mit „Endgültig
löschen“ nachfragt. Eine Festlegung, welches Muster für diese beiden gilt, gibt
es nicht. `OPTIMIERUNG.md` nennt für eine Rechnung „≤ 60 s“ und für Fehlerpfade
„Irreversibles nur mit Rückfrage“.

**Frage an Jannes.** Sollen unumkehrbare Schritte mit Außenwirkung — eine
Rechnung ausstellen, alle Fotos einer Person löschen — eine Rückfrage bekommen,
oder gilt auch hier „die Folge steht vor dem Knopf“?

**Optionen.**

1. **Folge vor dem Knopf, ein Tipp** (wie heute), als Annahme festgehalten.
   Folge: schnell; ein Fehlgriff erzeugt Storno, neue Rechnung und zwei
   Schreiben an den Empfänger bzw. löscht alle Fotos einer Person.
2. **Rückfrage im Fluss mit Kontrollwerten:** „An Beihilfestelle …, 45,00 €,
   Kreis RG. Danach unveränderlich. — Ja, Rechnung ausstellen“ bzw. „Ja,
   widerrufen und alle Fotos löschen“. Folge: ein Tipp mehr je Rechnung; die
   Rückfrage zeigt Empfänger und Betrag noch einmal — die häufigsten Fehlgriffe.
3. **Rückfrage nur beim Foto-Widerruf,** die Rechnung bleibt bei einem Tipp.
   Folge: Die Löschung ist geschützt, das Ausstellen schnell.

**Empfehlung.** Option 2 für beide. Die Rückfrage kostet einen Tipp und erspart
im Fehlerfall ein Storno mit zweiter Nummer bzw. eine unwiderrufliche Löschung;
sie zeigt dabei Empfänger und Betrag, die vorher niemand noch einmal ansieht.
Unabhängig davon „Entwurf verwerfen“ als ruhige Aktion mit Abstand, damit seine
Bestätigung nicht unter „Rechnung ausstellen“ steht. Dieselbe Frage stellt sich
beim Entziehen einer Rolle (BEF-064). Die Umsetzung ändert keinen Aufruf, liegt
aber im Ausstellungs- und Löschweg; ADR-013 Punkt 9 dabei prüfen.

### BEF-064 — Zugang und Rollen: Die Trainingsbetreuung erscheint rollenlos, Rollen wirken ohne Rückfrage, und die Praxisleitung findet die Instrumente nicht

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bereich | Organisatorisches → Mitarbeitende → Datensatz (`/praxis/team/:id`), Abschnitt „Zugang“; Organisatorisches → Instrumente (`/praxis/instrumente`); Befund der Akte                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Gegenprüfung; Review-IDs ORG-09, ORG-18, BEF-19                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Status | offen — Trainingsbetreuung erledigt in TRN-003 (`trainer` in `WAEHLBARE_ROLLEN`, Server nimmt ihn an); Rückfragen und Instrumente offen, Lösung in `BEFUNDE-LOESUNGEN.md` |
| Berührt | `src/features/staff/StaffAccountSection.tsx` (Z. 34, 270, 290, 354–410), `src/features/staff/StaffMemberDetailPage.tsx` (Z. 149–176, 284–288), `src/app/navigation.tsx` (`betriebUnterpunkte`), `src/routes/AuthenticatedRoutes.tsx` (Z. 135, 326), `src/features/assessments/PatientBefundPage.tsx` (Z. 111), `src/features/assessments/VerlaufAbschnitt.tsx` (Z. 105); `app.assert_staff_role_keys` (Migration `20260911110000_staff_account_invitations.sql`), Migration `20260920132000_training_role.sql`; ADR-004; ADR-021; ANN-103; STAFF-001; ADR-013 Punkt 9 (Rollen, Sichtbarkeit zwischen Rollen) |

**Beobachtung.**

- **Trainingsbetreuung.** Die Rollenwahl kennt vier Kästchen (Therapeut:in,
  Teamleitung, Praxismanagement, Praxisinhaber:in). Für einen Zugang mit der
  Rolle `trainer` (im Seed ein Konto der Trainingsbetreuung) zeigt der Abschnitt
  „Stand: Eingerichtet“ und vier leere Kästchen — die tatsächliche Rolle steht
  nirgends. Hakt man eine Rolle an, geht `trainer` mit hinaus, der Server lehnt
  sie ab, und die Seite sagt nur „Der Vorgang konnte nicht ausgeführt werden.“
  Dass `trainer` hier nicht zuweisbar ist, ist gewollt: Die Rolle wird
  zuweisbar, wenn es im Trainingsbereich etwas zu bedienen gibt (E18 Schritt 7).
- **Rückfragen.** „Rollen speichern“ wirkt sofort auf den Aktenzugriff, ohne
  Rückfrage; „Kennwort zurücksetzen“, das keine Berechtigung ändert, fragt nach.
  Am eigenen Datensatz wird „Zugang sperren“ angeboten und erst nach der
  Bestätigung abgewiesen. Deaktivieren mit offenen Terminen braucht drei Tipps;
  der zweite Schritt erscheint als rote Fehlermeldung, obwohl er eine gewollte
  Bestätigung ist. Ein Häkchen weniger nimmt einer Kollegin im Hausbesuch sofort
  die Akten.
- **Instrumente.** Route und Menüpunkt hängen am Recht, Behandlungen zu
  dokumentieren (therapist, team_lead). Ein reines owner-Konto darf Fragebögen
  erheben (ANN-103), erreicht die Bibliothek mit Wortlaut und Lizenz aber gar
  nicht, auch nicht über die Adresse. office sieht am Bogen nur „Noch nicht
  erhoben.“ ohne Satz, wer erhebt.

**Frage an Jannes.** (1) Soll das Entziehen einer Rolle nachfragen — so wie
heute schon das Zurücksetzen eines Kennworts? (2) Wer soll die
Instrumente-Bibliothek sehen: alle, die erheben dürfen, oder alle Praxisrollen?

**Optionen.**

- Zu (1): **a)** keine Rückfrage wie heute — Folge: ein Fehltipp nimmt sofort
  den Aktenzugriff; **b)** Rückfrage nur beim Entziehen („… verliert damit
  sofort den Zugriff auf die Akten.“) — Folge: ein Tipp mehr, nur im
  folgenreichen Fall.
- Zu (2): **a)** alle, die erheben dürfen (owner, therapist, team_lead) — Folge:
  Die Praxisleitung findet Wortlaut und Lizenz, office nicht; **b)** alle
  Praxisrollen, weil die Bibliothek keinen Personenbezug hat — Folge: auch
  office liest die Bögen, ohne sie erheben zu dürfen.

**Empfehlung.** (1) b, (2) a. Dazu, ohne neue Festlegung, aber im kritischen
Pfad (Rollen): eine hier nicht vergebbare Rolle als Rollenabzeichen
„Trainingsbetreuung – hier nicht änderbar“ zeigen und die Kästchen für solche
Zugänge mit Erklärung sperren; am eigenen Datensatz statt „Zugang sperren“ der
Satz „Den eigenen Zugang können Sie nicht sperren.“; offene Termine beim
Deaktivieren gleich beim Öffnen laden und in einem Schritt bestätigen lassen
(die Prüfung auf dem Server aus STAFF-001 bleibt); für Leserollen am Bogen
„Erhoben wird von den behandelnden Rollen.“

### BEF-065 — Audit, Aufbewahrung und MDR-Sperre: Die Nachweisseiten sprechen Projektsprache und stellen die Arbeit nach hinten

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Bereich | Organisatorisches → Sicherheit → Audit (`/praxis/sicherheit/audit`) und Aufbewahrung (`/praxis/sicherheit/aufbewahrung`); MDR-Sperrseite (reservierte Adressen, etwa `/training/ki-analyse`)                                                                                                                                                                                                                                                               |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs ORG-13, ORG-19, ORG-23, ORG-B02, NAV-23                                                                                                                                                                                                                                                                                                                        |
| Status  | offen                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Berührt | `src/features/audit/AuditLogPage.tsx` (Z. 50–83, 164–207), `src/features/audit/api.ts` (Z. 97), `list_audit_events` (Migration `20260922120000_abgewiesene_zugriffe.sql`, Z. 256), `src/features/retention/AufbewahrungPage.tsx` (Z. 72, 231–421), `src/features/retention/klassen.ts`, `src/app/MdrSperre.tsx` (Z. 24–33), `tests/e2e/mdr-sperre.spec.ts` (Z. 21–25); ADR-006; ADR-008; ADR-010 Punkt 3 und 13; ANN-089; ADR-013 Punkt 9 (Audit-Lesepfad) |

**Beobachtung.**

- **Audit.** Der Gegenstand einer Zeile steht als „…“ plus die letzten
  12 Zeichen der Kennung; die volle Kennung nur im Tooltip — am Handy nicht
  erreichbar und nirgends verlinkt. „Abgewiesen“ steht in derselben grauen
  14-px-Zeile wie „Erfolgreich“. Der Aktionsfilter bietet 118 Einträge in
  technischer Reihenfolge. Jede Seite ist eine neue Abfrage ohne Platzhalter,
  Liste und Blätterleiste verschwinden kurz; weil jeder Lesevorgang selbst
  „Auditlog gelesen“ oben ins Log schreibt (ADR-010 Punkt 13), rückt beim
  Weiterblättern alles um eins, der letzte Eintrag der Vorseite erscheint
  erneut. Filter stehen nicht in der Adresse und gehen beim Neuladen verloren;
  am Handy stehen alle vier offen über der Liste (rund 330 px). Die Kernfrage —
  wer hat wessen Akte geöffnet — lässt sich aus der Liste nicht beantworten, und
  abgewiesene Zugriffe gehen in der Masse unter.
- **Aufbewahrung.** Datenklassen tragen die Annahmenkennung als Etikett
  („ANN-126“), Texte verweisen auf ADRs, sprechen von „Objektspeicher“ und
  „Fristen ändern sich über eine Migration“. Offene Löschaufträge und der
  Abgleich der Dateiablage — die einzigen Arbeitsaufgaben der Seite — beginnen
  erst nach 15 Planungskarten: bei 390 px nach 5 460 px (Seitenhöhe 6 498 px),
  bei 1440 px nach 2 305 px.
- **MDR-Sperre.** „Sie ist als MDR_REVIEW_REQUIRED klassifiziert.“ und „Ein
  Feature-Flag ersetzt diese Prüfung nicht …“. Der E2E-Test hält beide Sätze
  fest, die Kennung bewusst (auffindbar für ADR-006 und das Register).
  Erreichbar nur über reservierte Adressen.

**Frage an Jannes.** An wen richten sich diese Seiten — an die Praxisleitung im
Alltag oder an eine Prüfer:in? Und soll das Audit zu einer Zeile die Akte oder
den Termin öffnen können?

**Optionen.**

1. **Für Prüfer:innen lassen** (Kürzel, Verweise und Reihenfolge wie heute).
   Folge: nachvollziehbar für die Prüfung; die Praxisleitung übersieht am Handy
   offene Löschaufträge und abgewiesene Zugriffe.
2. **Für die Praxisleitung schreiben, den Nachweis als Zusatz:** Aufbewahrung
   oben mit einem Zustandsblock (offene Aufträge und Abgleich, leer als eine
   Zeile „Nichts offen, beide Speicher deckungsgleich“), danach Löschsperren,
   Plan und Journal; das Etikett „Annahme – Prüfung offen“ mit der Kennung als
   Zusatz, ADR-Verweise in einer aufklappbaren „Grundlagen“-Zeile,
   „Programmänderung“ statt „Migration“. Audit: „Abgewiesen“ als kritisches
   Abzeichen, Aktionen gruppiert, Filter in der Adresse und am Handy
   eingeklappt, Blättern auf einem festen Zeitpunkt („Stand 14:03 – neu laden“).
   MDR-Seite: Haupttext in Praxissprache („Diese Funktion bleibt gesperrt, bis
   eine Prüfung nach dem Medizinprodukterecht dokumentiert ist.“), die Kennung
   als Fußzeile; der E2E-Test prüft weiter die Kennung und den neuen Satz statt
   „Feature-Flag“, gleich streng. Folge: dieselben Angaben, andere Reihenfolge
   und Sprache; der feste Zeitpunkt ändert den Aufruf des Audit-Lesepfads
   (kritischer Pfad), und der geänderte E2E-Text braucht deine Freigabe, weil er
   eine Sperrprüfung betrifft.
3. **Wie 2, dazu je Auditzeile „Akte öffnen“ bzw. Namen statt Kennung.** Folge:
   Die Kernfrage ist mit einem Tipp beantwortet; Namen im Audit-Lesepfad oder
   ein Sprung in die Akte ändern aber den Lesepfad nach ADR-010 Punkt 13 — und
   jeder Sprung ist selbst ein Aktenzugriff.

**Empfehlung.** Option 2. Sie macht die Arbeit sichtbar, ohne den Nachweis zu
verlieren. Option 3 erst mit der Datenschutzprüfung (B2), weil sie ADR-010
berührt.

### BEF-066 — Vorschauen des Praxisbetriebs: Jede Rolle sieht Salden, IBAN und Urlaubsgründe aller und darf Räder anlegen und entfernen

|         |                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                  |
| Bereich | Organisatorisches → Vorschau: Zeitkonto (`/betrieb/zeitkonto`), Erstattungen (`/betrieb/erstattungen`), Urlaub (`/betrieb/urlaub`), Radflotte (`/betrieb/flotte`)                                                                                                                                                                                                                                           |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs VOR-14, VOR-22                                                                                                                                                                                                                                                                                                  |
| Status  | offen                                                                                                                                                                                                                                                                                                                                                                                                       |
| Berührt | `src/features/timeaccount/TimeAccountPage.tsx` (Z. 77, 96), `src/features/reimbursements/ReimbursementsPage.tsx` (Z. 68, 254, 337), `src/features/vacation/VacationPage.tsx` (Z. 158, 214, 490), `src/features/fleet/FleetPage.tsx` (Z. 193–229, 343), `src/features/fleet/BikeEditPage.tsx` (Z. 294); §4.3, §4.5, §16, §20; B6; ANN-024; ADR-004; Roadmap Block 8 (FLT-EPIC-001, URL-001, ZK-001, ERS-001) |

**Beobachtung.** Als therapist angemeldet: „Saldo über alle Personen: −3,25 h“
und „Alle Zeitkonten“ mit dem Saldo jeder Person; jede Erstattungskarte mit
voller IBAN, die „Historie je Person“ mit allen Beträgen; unter „Alle Anträge“
im Urlaub „Grund: Familienurlaub“ und „Grund: Umzug“ — während das Formular sagt
„Private Gründe müssen nicht angegeben werden.“ In der Radflotte ist „Rad
hinzufügen“ für jede Rolle der Hauptknopf, Bearbeiten und „Rad entfernen“ stehen
allen offen; die Alltagswege Schlüssel, Panne und Check-Up sind nachrangig, und
die erste Radkarte beginnt bei 390 px erst bei rund 830 px. Privatangaben
Beschäftigter liest heute nur owner (§4.3, ANN-024) — eine Bankverbindung ist
von derselben Art. Die Daten sind synthetisch, die Vorschau speichert nichts;
sie ist aber das Vorbild der Loops, die sie in Block 8 ersetzen.

**Frage an Jannes.** Wer sieht in Zeitkonto, Erstattungen und Urlaub die
Einträge anderer, und wer verwaltet die Räder?

**Optionen.**

1. **Wie die Vorschau:** Alle sehen alles, alle dürfen alles. Folge:
   Überstunden, Bankverbindung und private Gründe liegen im Team offen; eine
   Summe über alle Personen ist eine Auswertung über Beschäftigte, die B6 und
   §20 eng begrenzen.
2. **Eng (§16):** Eigenes sieht jede Person; Fremdes in Zeitkonto und
   Erstattungen nur owner; im Urlaub sehen andere nur den Zeitraum, nie den
   Grund; die IBAN nur maskiert („DE02 •••• 01“); keine Summe über alle
   Personen. Räder anlegen und entfernen nur owner, Schlüssel, Panne und
   Check-Up alle. Verbindlich über RLS (ADR-004). Folge: später zu öffnen ist
   billig; jede Öffnung ist eine eigene Rollenentscheidung.
3. **Wie 2, mit den Zusatzrechten aus §4.3 und §4.5 gleich vergeben:** office
   sieht die Belege der Erstattungen, team_lead bearbeitet Urlaubsanträge und
   teilt Räder zu. Folge: näher an einer größeren Praxis, mehr Sichtbarkeit von
   Anfang an.

**Empfehlung.** Option 2, als Vorgabe in den Zuschnitt von FLT-EPIC-001,
URL-001, ZK-001 und ERS-001; die Vorschau selbst wird nicht umgebaut, sondern
ersetzt. Dort auch: der Hauptknopf nach Rolle (Behandelnde „Schlüssel
entnehmen“, „Rad hinzufügen“ nachrangig für owner), Suche und Filter
eingeklappt.

### BEF-067 — Begriffe: Dieselbe Sache heißt an verschiedenen Stellen verschieden

|         |                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                          |
| Bereich | Querschnitt: Kalender, Termin, Übersicht, Akte, Patient:innen, Anmeldung, Mein Konto, Anlegeseiten                                                                  |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Gegenprüfung; Review-IDs WRT-04, WRT-05, WRT-18, KAL-28, UEB-14, AUTH-14, NAV-21, PAT-06, PAT-10 |
| Status  | offen                                                                                                                                                               |
| Berührt | `src/lib/begriffe.ts`, `src/lib/begriffe.test.ts`; Fundstellen je Zeile unten; ANN-002, ANN-023, ANN-025, ANN-032, ANN-111; BEF-035; Oberflächen-Checkliste Punkt 9 |

**Beobachtung.** Checkliste Punkt 9 verlangt „gleiche Sache, gleiches Wort“,
ANN-111 führt die Begriffe an einer Stelle. Neun Stellen weichen ab:

| Sache                                  | heute                                                                                                                                                                                                       | Fundstellen                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serie von Terminen aus einer Grundlage | „Dauertermin“ (Kalender, `begriffe.ts`), „Terminserie“ (Serienseite, Akte, Fehlermeldung)                                                                                                                   | `CalendarPage.tsx:657`, `DauerterminStartPage.tsx:153`, `AppointmentSeriesPage.tsx:291`, `PatientTreatmentBasesPage.tsx:319`                             |
| Länge eines Termins                    | „Dauer“ (Feld), „Andere Länge …“, „Länge in Minuten“, „Fenster“, „Terminfenster“, „Länge weicht ab“                                                                                                         | `AppointmentFormFields.tsx:259–283`, `AppointmentSeriesPage.tsx:392–393`, `appointments/api.ts:546, 1363`                                                |
| Eintrag ohne Patient:in                | „Fehlzeit“, beschrieben als „Besprechung, Teamtermin“, mit der Rückfrage „Außerhalb der Arbeitszeit“                                                                                                        | `NewEventPage.tsx:159`, `EreignisFormFields.tsx:148–151`                                                                                                 |
| alle Termine eines Tages absagen       | „Tag umplanen“; der Knopf dahinter heißt „2 Termine absagen“                                                                                                                                                | `TagUmplanenPage.tsx:193, 266`                                                                                                                           |
| bestätigter, noch offener Termin       | Tageskarte „Steht aus“, Terminseite „Status: Bestätigt“; in der Akte steht ein vergangener, offener Termin ohne Zustandswort                                                                                | `today/api.ts:195`, `AppointmentDetailPage.tsx:922`                                                                                                      |
| Titel der Anlegeseiten                 | drei Nomen („Neue:r Patient:in“, „Neue:r Mitarbeiter:in“, „Neue:r Verordner:in“), sonst Verben („Termin anlegen“ …)                                                                                         | `NewPatientPage.tsx:103`, `NewStaffMemberPage.tsx:83`, `PrescriberFormPage.tsx:105`                                                                      |
| Anmeldung mit E-Mail und Kennwort      | „Konto“ und „Zugang“ im selben Absatz; die Mail heißt „Zugangsmail“, am Knopf „Anmeldemail senden“, im Betreff „Zugang zur Praxisanwendung“; „Anmeldemaske“                                                 | `LoginPage.tsx:193`, `ZugangEinrichtenPage.tsx:49`, `ZugangPage.tsx:113`, `StaffAccountSection.tsx:218`, `supabase/config.toml:100`, `MeinKontoPage.tsx` |
| Versorgungsstatus                      | „Aktiv/Inaktiv“, „inaktiv“, „Nicht in Versorgung“, „In Versorgung“/„Nicht in laufender Versorgung“; eine abgeschlossene, aktive Person trägt zugleich „✓ In Versorgung“ und „Versorgung abgeschlossen am …“ | `PatientRecordLayout.tsx:152–160`, `PatientMasterDataPage.tsx:311–320`, `PatientsListPage.tsx:118, 160`, `Patientensuche.tsx:35`                         |
| Name in der Patientenliste             | sortiert nach Nachname, angezeigt „Vorname Nachname“; am Handy wird zuerst der Nachname gekürzt                                                                                                             | `patients/api.ts:101, 185`, `PatientsListPage.tsx:147–150`                                                                                               |

**Frage an Jannes.** Welches Wort gilt je Zeile? Es steht danach in
`begriffe.ts`, und der Test hält die übrigen Stellen fern.

**Optionen.** Je Zeile ein Vorschlag und eine Alternative:

| Sache                   | Vorschlag                                                                                                                                                                                        | Alternative                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Serie                   | „Dauertermin“ überall, auch in Titel, Knopf und Fehlermeldung; „Serie“ bleibt das Wort für die Vorkommen („Ganze Serie absagen“)                                                                 | „Terminserie“ überall, dann auch im Kalender                                                                             |
| Länge                   | „Dauer“ überall („Andere Dauer …“, „Dauer in Minuten“, „Dauer: 60 Minuten, Dokumentation eingeschlossen“, „Dauer weicht ab“); die Begriffe aus §8.1 bleiben im Code                              | „Länge“ überall, auch am Feld                                                                                            |
| Eintrag ohne Patient:in | „Fehlzeit“ bleibt, bis du die offene Frage aus ANN-111 in der Sichtung beantwortet hast; die Beispiele im Formular an `BEGRIFFE.fehlzeit` festhalten                                             | ein Wort, das Arbeitszeit einschließt (etwa „Blockzeit“) — nicht „Praxistermin“, so heißt schon der Termin in der Praxis |
| Tag absagen             | „Tag umplanen“ bleibt (von dir am 2026-09-26 bestätigt)                                                                                                                                          | „Tag absagen“                                                                                                            |
| offener Termin          | „Steht aus“ überall, neutral, auch in der Akte für vergangene, noch offene Termine                                                                                                               | „Bestätigt“ überall                                                                                                      |
| Titel                   | Verben überall: „Patient:in anlegen“, „Mitarbeiter:in anlegen“, „Verordner:in anlegen“; die Anlegen-Leiste behält deine Nomen („Neuer Termin · Dauertermin · Fehlzeit · Dauerfehlzeit“, BEF-035) | Nomen überall                                                                                                            |
| Konto/Zugang            | „Konto“ = Anmeldung mit E-Mail und Kennwort, „Zugang“ = Freischaltung durch die Praxis (ANN-025); eine Mail, ein Wort: „Anmeldemail“, auch im Betreff; „Anmeldeseite“ statt „Anmeldemaske“       | ein Wort für beides                                                                                                      |
| Versorgungsstatus       | „in Versorgung“ / „nicht in Versorgung“ in Filter, Liste, Suche, Stammdaten und Knopf; „abgeschlossen“ nur für den Abschluss; ist der Abschluss gesetzt, zeigt der Kopf nur ihn                  | „aktiv“ / „inaktiv“                                                                                                      |
| Name in Listen          | „Nachname, Vorname“ mit hervorgehobenem Nachnamen, Sortierung bleibt                                                                                                                             | Anzeige bleibt, Sortierung nach Vorname                                                                                  |

Folge in jedem Fall: ein Durchgang durch die Fundstellen, ANN-111 wird
fortgeschrieben; Wortlaut-Tests ziehen mit.

**Empfehlung.** Die Spalte „Vorschlag“ in einem Durchgang. Ohne Entscheidung
sofort: die Zeile „Praxis: …“ auf „Mein Konto“ streichen (ANN-023 zeigt den
Organisationsnamen nicht an), „Laufende Versorgung“ in den Stammdaten durch
„nicht abgeschlossen“ ersetzen, Gedankenstrich statt Bindestrich, Namen in der
Patientenliste umbrechen statt kürzen.

### BEF-068 — Schrift: 11 px ohne Token an Tableiste und Kalender, 12 px für Hinweise und Fehler, Abzeichen unter dem Maß des Handoffs

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Bereich | Querschnitt: Tableiste (unter 640 px), Kalender (Stundenachse, Kacheln), Befund-Verlauf (Messreihe), Untermenü (Vorschau-Zeichen), Kopfsuche („Strg K“); Kleingedrucktes am Seitenende; Baustein `Badge`                                                                                                                                                                                                                                                                                                                  |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390/820/1440 px, Messwerte aller Aufnahmen, Gegenprüfung; Review-IDs TOK-02, TOK-03, UIK-23, TOK-04, UIK-B01                                                                                                                                                                                                                                                                                                                                                            |
| Status | offen — `Badge` (28 px, 14 px, Gewicht 600) und die drei 12-px-Fehlertexte erledigt im UI-Redesign; freie Werte unter 12 px und Kleingedrucktes offen, Lösung in `BEFUNDE-LOESUNGEN.md` |
| Berührt | `src/app/AppShell.tsx` (Z. 51), `src/app/navigation.tsx` (Z. 37–45), `src/lib/begriffe.test.ts` (Z. 101), `src/features/appointments/CalendarGrid.tsx` (Z. 411, 425, 827, 832), `src/features/assessments/Messreihenbild.tsx`, `src/components/ui/SubNav.tsx` (Z. 58), `src/app/Funktionssuche.tsx` (Z. 262), `src/components/ui/Badge.tsx` (Z. 56), `src/components/ui/RoleBadge.tsx`, `src/features/account/MeinKontoPage.tsx` (Z. 234), `src/index.css`; DS-001; `docs/product/kanvas/own-motion-praxis.html`; ANN-111 |

**Beobachtung.**

- **Unter 12 px.** Die kleinste Stufe des Systems ist 12 px. Darunter liegen:
  die Beschriftung der Tableiste (11 px, auf jeder Seite unter 640 px),
  Stundenachse und Kachelzeilen im Kalender (11 px; die Kachel kürzt schon so
  „Dokumen…“), die halben Stunden (10 px in abgeschwächter Farbe, rund 3,4:1 auf
  Weiß — unter AA; nur bei großer Stundenhöhe sichtbar), das Vorschau-Zeichen
  und „Strg K“ (11 px), die Messreihe im Befund-Verlauf (9 px in Bildeinheiten,
  am Handy effektiv rund 10 px). Keiner dieser Werte ist ein Token. Die 11 px
  der Tableiste stecken in der Rechnung der Kurzformen: „Organisation“ braucht
  in 12 px 68,4 px, Platz je Ziel ist bei 375 px 67 px; mit knapperem
  Innenabstand passt es bei 375 px, bei 360 px (eine häufige Android-Breite)
  nicht.
- **12 px als Hinweisgröße.** 55 Stellen setzen dieselbe Kette als
  Kleingedrucktes am Seitenende — darunter „Jedes Öffnen eines Fotos wird
  protokolliert.“ —, dazu 32 Meta- und Statustexte und drei Fehlertexte (Termin,
  Fehlzeit, Serie), während die Feldbausteine Fehler in 14 px setzen. Das
  Geheimnis zum Abtippen bei der Zwei-Faktor-Einrichtung steht in 12 px. Der
  Handoff sieht für Hinweis und Meta 14 px vor (`--type-body-sm`), 12 px nur für
  Etikett und Label.
- **Abzeichen.** `Badge` setzt 12 px mit Gewicht 500 und ist rund 20 px hoch;
  der Handoff legt 28 px Höhe, 14 px mit Gewicht 600 und 12 px Innenabstand
  fest. Der Grundlagen-Commit von DS-001 kündigte die Abzeichen „in eigenen
  Stories“ an; typografisch angefasst wurde der Baustein seitdem nicht.
  Statusangaben wie „Steht aus“ sind damit die kleinste Schrift auf der Karte.

**Frage an Jannes.** Gilt „kein Text unter 12 px“ als Regel des Design-Systems,
und mit welchen Ausnahmen? Wie groß ist Kleingedrucktes? Übernimmt `Badge` das
Maß des Handoffs?

**Optionen.**

1. **Festschreiben, was ist:** 11 px als benanntes Token für Tableiste und
   Tastenhinweis, 12 px als benannte Fußnoten-Rolle, das kompakte Abzeichen als
   bewusste Abweichung vom Handoff; nur die Pflicht umsetzen (halbe Stunde ohne
   Abschwächung, die drei Fehlertexte wie am Feld). Folge: optisch fast nichts;
   keine freien Werte mehr, ein Test verbietet neue.
2. **Mindestens 12 px, Hinweise 14 px:** Stundenachse, Kachelzeilen und
   Vorschau-Zeichen auf 12 px (zusammen mit dem Kachelaufbau, Review KAL-23 —
   12 px kostet dort Zeilen), die Messreihe so gerechnet, dass ab 300 px
   Bildbreite 12 px entstehen, Kleingedrucktes über einen Baustein in 14 px,
   `Badge` nach Handoff (28 px). Die Tableiste bleibt bei 11 px, als Token.
   Folge: besser lesbar am Lenker; die dichten Stellen (Tageskarte,
   Listenzeilen, Suchtreffer) sind nach dem Umbau der Abzeichen zu sichten.
3. **Wie 2, auch die Tableiste auf 12 px** mit knapperem Innenabstand und einem
   E2E-Test bei 360 und 375 px. Folge: Bei 360 px schiebt die Leiste die Seite
   um knapp 1 px quer, solange keine Kurzform kürzer wird.

**Empfehlung.** Option 2. Zuerst den Baustein „Kleingedrucktes“ mit der heutigen
Optik anlegen und die 55 Stellen umstellen — die Größe ist danach eine Zeile.
Ohne Entscheidung und sofort (die halbe Stunde ohne Abschwächung ist seit
UXR-001 erledigt): die drei
Fehlertexte wie am Feld, das Geheimnis in 14 px Festbreitenschrift;
Statusetiketten, die heute als eigene Pillen gebaut sind, über `Badge` (Review
UIK-18).

### BEF-069 — Ein gesperrter Hauptknopf ist auf der Seitenfläche nicht als Knopf zu erkennen

|         |                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                              |
| Bereich | Formulare ohne Kasten (UI-002c): Dokumentation, Korrektur, Nachtrag, Abschluss; Kommunikation und „Schlüssel entnehmen“ (Vorschau); Rückfragen während „Wird ausgeführt …“                                                                                                                                                                                                              |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Browser bei 390 und 1440 px, Pixelprobe, Gegenprüfung; Review-IDs UIK-04, VOR-19                                                                                                                                                                                                                                                                  |
| Status  | offen                                                                                                                                                                                                                                                                                                                                                                                   |
| Berührt | `src/components/ui/buttonStile.ts` (Z. 24, 56), `src/index.css` (Z. 62, 70), `src/components/ui/Rueckfrage.tsx` (Z. 115), `src/features/documentation/TreatmentNotePage.tsx` (Z. 192), `src/features/teamchat/TeamChatPage.tsx` (Z. 260), `src/features/fleet/KeyPage.tsx` (Z. 102), `src/lib/kontrast.test.ts`; DS-001; UI-002b, UI-002c; `docs/product/kanvas/own-motion-praxis.html` |

**Beobachtung.** Gesperrt heißt
`disabled:bg-surface-sunken disabled:text-ink-muted`; `surface-sunken` und
`canvas` tragen denselben Wert (#eceee8), und der Hauptknopf hat keinen Rand.
Seit UI-002b/UI-002c stehen Formulare direkt auf der Seitenfläche — dort
verschwindet die Knopfform. Pixelprobe in der leeren Dokumentation (390 px): Die
ganze Zeile um „Als Entwurf speichern“ ist einheitlich #eceee8; übrig bleibt
grauer Fettdruck neben dem ebenso grauen „Abbrechen“. Gesperrt ist der Knopf
dort bis zur ersten Eingabe, und nichts sagt, warum. Dasselbe in Kommunikation,
auf der Schlüsselseite — dort sehen „Entnahme bestätigen“ und der Link „Zurück
zur Radflotte“ gleich aus — und in der Rückfrage während „Wird ausgeführt …“.
Der Handoff sieht diese Fläche vor, gedacht war sie für Papierweiß, nicht für
die Seitenfläche. Eigene Farben statt Transparenz sind in DS-001 festgelegt.

**Frage an Jannes.** Wie soll ein gesperrter Hauptknopf aussehen?

**Optionen.**

1. **Kontur:** Rand in `line-strong`, die Fläche bleibt. Folge: die kleinste
   Änderung; trägt auf der Seitenfläche und in der Rückfrage und bleibt bei den
   eigenen Farben aus DS-001.
2. **Dunklere Füllung** (`line`): Text darauf 4,75:1 (AA), gegen die
   Seitenfläche aber nur 1,23:1. Folge: mehr Fläche, weniger Form.
3. **Nicht sperren,** sondern beim Tippen ohne Änderung sagen, was fehlt (wie im
   Check-Up: „Die Bestätigung fehlt noch …“). Folge: eine Verhaltensänderung in
   jedem Formular, ein eigener Loop.

**Empfehlung.** Option 1, das Farbpaar in `kontrast.test.ts` festhalten; wo der
Grund nicht offensichtlich ist, steht neben dem Knopf, was fehlt.

### BEF-070 — Unerwartete Serverantworten erscheinen als englischer Prüftext

|         |                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datum   | 2026-09-27                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Bereich | Akte → Dateien und Fotos; Organisatorisches → Sicherheit → Aufbewahrung (Löschaufträge); Therapiebericht; Erhebung; Start der Anwendung (Profil)                                                                                                                                                                                                                                                                                  |
| Quelle  | UX-Review Claude 2026-09-26/27: Code, Gegenprüfung (nicht im Browser ausgelöst); Review-ID WRT-20                                                                                                                                                                                                                                                                                                                                 |
| Status  | offen                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Berührt | `src/lib/antwort.ts`; `src/features/files/api.ts` (Z. 141, 230, 327), `src/features/files/patientenfotos.ts` (Z. 101, 140), `src/features/files/dateien.ts` (Z. 162), `src/features/therapy-reports/api.ts` (Z. 200, 225), `src/features/assessments/api.ts` (Z. 90), `src/features/session/useCurrentUser.ts` (Z. 63); R3-023; ADR-008; ADR-013 Punkt 9 (Löschpfad, Sitzungen); Oberflächen-Checkliste Punkt 6; BEF-010, BEF-046 |

**Beobachtung.** Seit R3-023 gibt es `antwort(schema, data, satz)`: Passt eine
Serverantwort nicht zum erwarteten Schema, wirft sie einen deutschen Satz statt
des Prüffehlers, dessen Meldung englisches JSON ist
(`[{"code":"invalid_type" …`). Benutzt wird sie nur in
`features/appointments/api.ts`. Neun Wege prüfen die Antwort direkt, und ihre
Seiten zeigen die Meldung wörtlich: Datei hinzufügen und öffnen, Löschauftrag,
Foto öffnen und herausgeben, Therapiebericht anlegen und speichern, Erhebung
speichern, Profil beim Start. Das tritt nur bei einer abweichenden Antwort auf —
etwa nach einer Datenbankänderung, die eine Oberfläche nicht nachgezogen hat
(das Muster aus BEF-010). Zwei der neun Stellen liegen im Löschpfad (ADR-008)
und im Sitzungsprofil; die kleine Änderung ist damit eine kritische nach ADR-013
Punkt 9.

**Frage an Jannes.** Kein fachlicher Inhalt ist offen, nur der Weg: eigener
kleiner Loop oder je Spur, wenn ein Loop das Modul ohnehin anfasst?

**Optionen.**

1. **Je Spur mitnehmen,** wenn ein Loop Dateien, Bericht oder Erhebung anfasst.
   Folge: Bis dahin bleibt Entwicklertext im Bedienbildschirm möglich; drei
   Zweitreviews statt einem.
2. **Ein kleiner Loop für alle neun Wege** im kritischen Pfad, je Modul ein Test
   mit verfälschter Antwort (Muster `appointments/api.antwort.test.ts`); der
   Profilweg gemeinsam mit BEF-046. Folge: ein Zweitreview, danach überall ein
   deutscher Satz, der sagt, was zu tun ist.

**Empfehlung.** Option 2 — die Änderung ist klein, und der Löschpfad soll
ohnehin nicht nebenbei angefasst werden.

### BEF-082 — Sechzehn Lesepfade verlieren ihren Abweisungseintrag hinter PostgREST

|         |   |
| ------- | - |
| Datum   | 2026-09-30 |
| Bereich | Serverfunktionen mit protokollierter Abweisung (ADR-010, G6a/G6b) |
| Quelle  | Zweitreview TRN-EPIC-001 (Review-Subagent), Katalogabfrage in `supabase/tests/audit.test.ts` |
| Status  | offen |
| Berührt | `find_free_slots`, `find_possible_duplicates`, `get_intake_checklist`, `get_practice_statistics`, `get_practice_targets`, `list_call_list`, `list_care_without_conclusion`, `list_ending_prescriptions`, `list_open_intakes`, `list_open_prescription_scans`, `list_practice_revenue_months`, `list_tasks`, `list_top_services`, `list_waitlist_entries`, `list_waitlist_matches`, `rate_slot_travel`; Muster aus `20260923120000_abgewiesene_lesezugriffe_rest.sql` |

**Beobachtung.** Diese Funktionen sind `STABLE` und schreiben im abgewiesenen Fall über `app.record_denied_read` einen `denied`-Eintrag. PostgREST ruft `STABLE`-Funktionen in einer lesenden Transaktion auf; das INSERT scheitert dort mit 25006, der Aufrufer bekommt einen Fehler statt einer leeren Antwort, und der Versuch steht **nicht** im Protokoll. `pnpm test:db` sieht das nicht, weil es über eine direkte Verbindung ohne lesende Transaktion ruft. Für die Pfade von TRN-EPIC-001 ist es behoben; eine Katalogregel in `audit.test.ts` hält die Liste fest und lässt sie nur schrumpfen.

**Erwartet.** Eine Migration, die die sechzehn Funktionen auf `VOLATILE` stellt (`alter function … volatile`, kein Neuschreiben), danach die Liste im Test leeren. Lokal mit `supabase start` als therapist gegenprüfen, dass ein abgewiesener Aufruf 200 mit leerer Antwort liefert und im Protokoll steht.

### BEF-114 — Training: Paketpreise für drei oder sechs Monate

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Abrechnung im Training |
| Quelle  | Jannes, Abnahme der Annahmen Block 8 (ANN-181) |
| Status  | offen |
| Berührt | ANN-181 (`app.appointment_is_billable`); ADR-009 Punkt 21 (Trainingspaket); ABR-EPIC-007 |

**Erwartet** (Jannes, 2026-10-02): Langfristig feste Paketpreise für drei oder sechs Monate Betreuung. Das Terminhonorar der Behandlung (140 €, ADR-009 Punkt 22) wird nicht übernommen. Bei einem Paket entsteht die Forderung aus der Paketvereinbarung; Termine im Paket erzeugen keine weitere Forderung. Preis, Leistungsumfang und Zahlungsweise legt Jannes noch fest; bis dahin bleibt es bei ANN-181 (Leistung aus dem durchgeführten Termin, für Einzelstunden). **2026-10-05:** aus ABR-EPIC-007 herausgelöst, eigener kleiner Loop, sobald die drei Angaben feststehen.


### BEF-120 — Ein Übersichtstest hängt an der Uhrzeit des Laufs

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Tests, Übersicht |
| Quelle  | Loop ABN-EPIC-001b, voller Lauf von `pnpm test` am Abend |
| Status  | erledigt in ABN-EPIC-001b (PR #169: Uhr im Test festgesetzt) |
| Berührt | `src/features/today/MyDayPage.test.tsx` („fragt beim Oeffnen die Route des Tages ab …“, ANN-194) |

**Beobachtet:** Der Test legt die Termine relativ zur echten Uhr (in 60 Minuten, danach 75 Minuten Abstand). Um 21:18 Uhr Berliner Zeit fällt der zweite Termin über Mitternacht, und „≈ 9 min Rad · 66 min Puffer“ erscheint nicht; auf `main` ebenso rot, also unabhängig von ABN-EPIC-001b. **Erwartet:** Der Test setzt die Uhr fest (`vi.setSystemTime` auf einen Vormittag) und ist zu jeder Tageszeit grün. Behoben im selben PR, weil die CI sonst am Abend rot wird.

### BEF-121 — Ein Plattformtest hängt an der Uhrzeit des Laufs (Volljährigkeit)

|         |   |
| ------- | - |
| Datum   | 2026-10-02 |
| Bereich | Tests, Plattformzugang |
| Quelle  | Loop ABN-EPIC-001c, voller Lauf von `pnpm test:db` um 22:40 Uhr UTC |
| Status  | erledigt in ABN-EPIC-001c (PR #171: Tag der Praxis im Test; die CI war zur selben Uhrzeit rot) |
| Berührt | `supabase/tests/platform-accesses.test.ts` („verlangt ein Geburtsdatum und mindestens 18 Jahre“, ANN-190, ANN-208) |

**Beobachtet:** Der Test setzt das Geburtsdatum über `current_date` der Datenbank (UTC), die Einladung rechnet die Volljährigkeit am Tag der Praxis (Europe/Berlin). Zwischen 22 und 24 Uhr UTC ist das schon der nächste Tag; „noch nicht 18“ wird dann zu „18“, und die Einladung geht durch. Unabhängig von ABN-EPIC-001c (Datei nicht berührt). **Erwartet:** Der Test rechnet das Geburtsdatum mit dem Tag in der Zeitzone der Praxis (`(now() at time zone 'Europe/Berlin')::date`) und ist zu jeder Uhrzeit grün. Klein, Pfad S.

### BEF-122 — Ein Zusammenführungstest hängt an der Uhrzeit des Laufs (Terminüberschneidung)

|         |   |
| ------- | - |
| Datum   | 2026-10-03 |
| Bereich | Tests, Dubletten |
| Quelle  | CI von PR #172 (AKTE-007), Lauf um 06:14 Uhr UTC; lokal auf `main` um 06:36 Uhr UTC reproduziert |
| Status  | erledigt in AKTE-007 (PR #172: fester Terminbeginn um 20:00 UTC) |
| Berührt | `supabase/tests/patient-merge.test.ts` (`fuelle()`, PRX-017) |

**Beobachtet:** `fuelle()` legt für Anna einen 45-Minuten-Termin auf `now() - (100 + n) Tage`. Der Seed hat für Anna samstags Termine von 07:00 bis 08:00 UTC; läuft der Test zwischen etwa 06:15 und 08:00 UTC an einem Tag, an dem `100 + n` auf einen solchen Samstag fällt, verletzt der Termin `appointments_no_overlap`. Unabhängig von AKTE-007 (Datei nicht berührt). **Erwartet:** Der Termin beginnt `100 + n` Tage zurück immer um 20:00 UTC, wo kein Seed-Termin liegt, und der Test ist zu jeder Uhrzeit grün. Klein, Pfad S.

### BEF-123 — Eine ausgelieferte Migration wurde nachträglich geändert; die Test-Umgebung lief auseinander

|         |   |
| ------- | - |
| Datum   | 2026-10-03 |
| Bereich | CI, Migrationen, Test-Umgebung |
| Quelle  | Auslieferung „Test-Umgebung“ ab Lauf 62 rot; Ursache in PR #130 (Commit `5d11f19`, 2026-09-26) |
| Status  | erledigt (Gate `pnpm migrationen:check` im Job „Migrationen und RLS-Policies“; Test-Datenbank am 2026-10-03 neu aufgebaut) |
| Berührt | `supabase/migrations/20260926150000_dok_006b_patient_photos.sql`, `…160000_dok_006d_patient_photo_handout.sql`, `.github/workflows/ci.yml`, `scripts/migrationen-check.mjs` |

**Beobachtet:** PR #129 brachte `dok_006b` und `dok_006d` auf `main`, die Test-Umgebung spielte sie ein. PR #130 änderte beide Dateien eine halbe Stunde später (dritter Parameter `p_locked_at`, Spalte `photo_locked_at`, geänderte Rümpfe). `db push` führt eine eingespielte Version nie wieder aus; lokal und in der CI entstand die Datenbank aus der neuen Fassung, in der Test-Umgebung blieb die alte. Eine Woche später scheiterte `abn_023` dort an `app.patient_photo_accessible(uuid, timestamptz, timestamptz)`, und keine Auslieferung kam mehr an. **Erwartet:** Eine Migration auf `main` ist unveränderlich; eine Korrektur ist eine neue Migration, und eine neue Migration liegt hinter der jüngsten. Das prüft jetzt ein Gate; gegen die Historie gelaufen, hätte es genau PR #130 abgewiesen und sonst keinen der letzten 120 Merges.


### BEF-124 — Eine Verordnung kann hart gelöscht und ohne Verlauf geändert werden

|         |   |
| ------- | - |
| Datum   | 2026-10-03 |
| Bereich | Behandlungsgrundlage, Akte, § 630f BGB |
| Quelle  | LOG-EPIC-001, Inventur der Protokollierung (Vorgabe Jannes, 2026-10-03) |
| Status  | offen (eigenes Ticket, nicht in LOG-EPIC-001) |
| Berührt | `public.delete_treatment_basis`, `public.update_treatment_basis`, `public.transfer_appointments_to_treatment_basis`, `public.treatment_bases` |

**Beobachtet:** Seit LOG-EPIC-001 steht das Ändern, Löschen und Umhängen einer Behandlungsgrundlage nicht mehr im Auditlog. Das Datenmodell hält nur den letzten Stand (`updated_by`, `updated_at`); eine gelöschte Grundlage verschwindet ganz, auch wenn Termine an ihr hingen. Den Inhalt einer Änderung hat schon das alte Auditlog nicht gehalten. **Erwartet:** Eine Verordnung ist Teil der Akte. Sobald Termine an ihr hängen, wird sie nicht mehr hart gelöscht; ihre Änderungen bleiben mit ursprünglichem Inhalt und Zeitpunkt erkennbar (§ 630f Abs. 1 BGB), etwa über eine Versionstabelle wie bei der Dokumentation (ADR-016). Zu prüfen: welche Felder fachlich änderbar bleiben müssen und ob ADR-020 dafür eine Fassung braucht.

### BEF-127 — Die Koordinaten-Constraints lassen eine Breite ohne Länge durch

|         |   |
| ------- | - |
| Datum   | 2026-10-05 |
| Bereich | Datenmodell, Kartendienst |
| Quelle  | UBK-EPIC-002, Zweitreview (Testlücke am Garagen-Constraint) |
| Status  | offen (eigenes Ticket; der Garagen-Constraint aus UBK-015 ist bereits dicht) |
| Berührt | `patient_contact_details_coordinate_check`, `appointments_visit_coordinate_check`, `locations_coordinate_check` (Migration `20260925100000_map_006a_coordinates.sql`) |

**Beobachtet:** Die drei Constraints prüfen `lat between …`, `lon between …` und `geocode_precision in (…)` ohne ausdrückliches `is not null`. Ein CHECK, der NULL ergibt, gilt als erfüllt: Eine Breite ohne Länge oder eine Genauigkeit ohne Koordinate kommt durch, sobald die Adresse vollständig ist. Geschrieben wird heute nur über die Funktionen, die beides zusammen setzen, und der Trigger verwirft die Koordinate mit der Adresse - ein Fehler entsteht deshalb erst mit einem neuen Schreibweg. **Erwartet:** Eine neue Migration ersetzt die drei Constraints durch die dichte Form aus `locations_garage_coordinate_check` (UBK-015); vorher prüft sie, dass keine Zeile die engere Regel verletzt. Ein Test je Tabelle wie in `supabase/tests/garage.test.ts`. Klein, Pfad A (Migration).
