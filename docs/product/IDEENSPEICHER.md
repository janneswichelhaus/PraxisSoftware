# Ideenspeicher
> **Nicht normativ** (Rang 6, `PROJECT_PRINCIPLES.md` §21): kein Auftrag, keine Spezifikation,
> keine Freigabe. Aus keinem Eintrag folgt Scope, und eine offene Frage aus
> `../decisions/OPEN_DECISIONS.md` beantwortet er nicht.

**Wozu.** Jannes sammelt Ideen über lange Zeit; jede hat eine stabile Kennung und bleibt
auffindbar. Wer weiß, was kommen kann, benennt heute passend. Benennen kostet nichts, Vorbauen
ist verboten.

**Ein Loop darf** im SPEC-Schritt die Zeilen des passenden Bereichs lesen, daraus bessere
Rückfragen ableiten und bei einer ohnehin anstehenden Entscheidung die Variante wählen, die eine
Richtung nicht verbaut, solange das nichts zusätzlich kostet. **Verboten** sind Spalten, Tabellen,
Felder, Endpunkte, Status oder Oberfläche „für später“ (§11, ADR-014), ein Eintrag als Begründung
für Scope und die eigene Antwort auf eine hier offene Frage. Kostet ein Hinweis Mehrarbeit oder
eine fachliche Entscheidung: stoppen, als Frage in den Bericht, ohne ihn weiterbauen.

**Weg.** Idee → offene Entscheidung, falls nötig → ADR, falls teuer rückgängig zu machen →
Spezifikation → `/feature-loop` oder `/bereich`; danach steht die Zeile auf `überführt → Ziel`.

**Status** (kein Freitext): `notiert` (von Jannes), `vorschlag` (von Claude, unbestätigt),
`bestätigt` (Richtung bestätigt, weiter kein Auftrag), `entscheidung nötig` (allein oder als
Zusatz), `zurückgestellt (Kennung)`, `überführt → Ziel`, `verworfen (Kennung)`. Zusätze mit ` · `:
`ausgearbeitet`, `Abgrenzung` (hält fest, was nicht gebaut wird), `Einordnung` (bewertet Fremdes),
`Bedenken` (begründetes Abraten).

**Neue Idee** (`/idee`): eine Zeile nach der letzten ihres Bereichs, Kennung `IDEA-<Kürzel>-NNN`
mit der nächsten freien Nummer (nie wiederverwendet, nie umnummeriert), der Kern der Idee als
Titel, Status `notiert`. Herleitung und Bedenken stehen im Commit, nicht hier.

**Früherer Wortlaut.** Idee, Warum, Vorsicht, Offen, Quellen und die Referenz-Recherchen
(iPrax, Navigation, Slack, Wettbewerb) bis 2026-10-27: `git show 9452575:docs/product/ideen/`
listet die Dateien, `git show 9452575:docs/product/ideen/<datei>` zeigt eine.

## Ideen
**Bereiche** (Kürzel der Kennung): LZK Lebenszyklus und Zugang · TRN Trainingspläne und Progression
· TRK Tracking und Parameter · KOM Rückfragen, Medien, Kommunikation · OUT Assessments, Outcomes,
Fortschritt · ALT Alltag, Gewohnheiten, Ernährung · ORG Übersicht, Kalender, Sessions · KI
KI-Assistenz · QSN Querschnitt der Plattform · ANG Angebote und Abrechnung · PRX Praxisverwaltung.

| Kennung | Idee | Status |
| --- | --- | --- |
| IDEA-LZK-001 | Zugang ab dem Moment, in dem jemand Patient wird | notiert |
| IDEA-LZK-002 | Betreuungsepisode als eigene Entität mit Typ | bestätigt · entscheidung nötig |
| IDEA-LZK-003 | Zweckbindung beim Übergang, nicht stiller Datenfluss | bestätigt |
| IDEA-LZK-004 | Klientenprofil als Voraussetzungsprofil | bestätigt |
| IDEA-LZK-005 | Onboarding mit Überspringen-Möglichkeit für die Praxis | bestätigt |
| IDEA-LZK-006 | Offboarding als eigener Vorgang | überführt → LOE-001b |
| IDEA-LZK-007 | Empfehlung und Erinnerung am Rezeptende | notiert |
| IDEA-LZK-008 | Kund:innen des Personal Trainings ohne vorherige Heilbehandlung | notiert |
| IDEA-LZK-009 | Erinnerung an den vergessenen Abschluss der Versorgung | überführt → PRX-016 |
| IDEA-TRN-001 | Progression regelt die Plattform, nicht die Person | notiert |
| IDEA-TRN-002 | Regelwerk statt Automatik: Therapeut gibt den Korridor frei | bestätigt |
| IDEA-TRN-003 | Ampelmodell auf Basis der Schmerzreaktion | zurückgestellt (B10) |
| IDEA-TRN-004 | Progression ist mehrdimensional, nicht „mehr Gewicht" | bestätigt |
| IDEA-TRN-005 | Übungsbibliothek als Graph, nicht als Liste | bestätigt |
| IDEA-TRN-006 | Autoregulation über RIR statt starrer Prozentwerte | bestätigt |
| IDEA-TRN-007 | Doppelte Progression als robuster Standardfall | bestätigt |
| IDEA-TRN-008 | Phasenwechsel über Kriterien, nicht über den Kalender | bestätigt |
| IDEA-TRN-009 | Adhärenz ist eine Eingangsgröße der Progression | bestätigt |
| IDEA-TRN-010 | Wiedereinstieg nach Unterbrechung | bestätigt |
| IDEA-TRN-011 | Plan-Schnappschuss bei Zuweisung | bestätigt |
| IDEA-TRN-012 | Trockenlauf, bevor Automatik scharf geschaltet wird | bestätigt |
| IDEA-TRN-013 | Belastungssteuerung über die Woche: mit Vorsicht | bestätigt |
| IDEA-TRN-014 | Progressionsschema je Übungsgruppe, angezeigt neben der letzten Einheit | vorschlag |
| IDEA-TRN-015 | Übungen in der Dokumentation strukturiert erfassen | vorschlag |
| IDEA-TRN-016 | Planvorlagen der Praxis ohne Person | vorschlag |
| IDEA-TRK-001 | Parameter nach Erfassungstakt ordnen | bestätigt |
| IDEA-TRK-002 | Weniger Fragen, dafür beantwortet | bestätigt |
| IDEA-TRK-003 | Bewegungssicherheit als eigene Größe neben Schmerz | notiert · ausgearbeitet |
| IDEA-TRK-004 | Check-in mit einstellbarem Takt | notiert · ausgearbeitet |
| IDEA-TRK-005 | Schmerz differenziert erfassen | bestätigt |
| IDEA-TRK-006 | Kontext mit erfassen, sonst ist die Zeitreihe Rauschen | bestätigt |
| IDEA-TRK-007 | Wearables und Gesundheits-Apps: später, und mit eigener Prüfung | bestätigt |
| IDEA-TRK-008 | Offline-Erfassung im Training | bestätigt |
| IDEA-KOM-001 | Strukturierte Rückfrage statt offenem Chat | notiert · ausgearbeitet |
| IDEA-KOM-002 | Asynchron mit Zusage, plus klare Notfallabgrenzung | bestätigt |
| IDEA-KOM-003 | Foto- und Videoanhänge: eigene Datenklasse | notiert · entscheidung nötig |
| IDEA-KOM-004 | Antwort mit Zeitmarke und Anmerkung im Video | bestätigt |
| IDEA-KOM-005 | Kein automatisches Bewegungsurteil aus Video | bestätigt · Abgrenzung |
| IDEA-KOM-006 | Benachrichtigungen mit Regeln, nicht nach Gefühl | bestätigt |
| IDEA-KOM-007 | Klinisch relevante Inhalte kommen in die Akte | bestätigt |
| IDEA-KOM-008 | Praxispostfach in der Anwendung: Terminwünsche erkennen, Antworten vorformulieren | notiert · entscheidung nötig |
| IDEA-OUT-001 | Instrumentenbibliothek mit Lizenzfeld | bestätigt |
| IDEA-OUT-002 | Berechnen ja, bewerten nein | bestätigt · entscheidung nötig |
| IDEA-OUT-003 | Patientenspezifische Funktionsskala als Ziel-Werkzeug | bestätigt |
| IDEA-OUT-004 | Globale Veränderungsfrage | bestätigt |
| IDEA-OUT-005 | Verlaufsgrafiken mit Ereignissen | bestätigt |
| IDEA-OUT-006 | Übungsanalyse: Ausführung, Schmerz und Auslassung zusammen | notiert · ausgearbeitet |
| IDEA-OUT-007 | Assessments mit Protokoll und Wiedervorlage | notiert · ausgearbeitet |
| IDEA-OUT-008 | Fortschritt in zwei Sprachen | bestätigt |
| IDEA-OUT-009 | Ein Bild ruft den Test in Erinnerung | notiert |
| IDEA-OUT-010 | Bewegungsstern für LWS und HWS | vorschlag |
| IDEA-OUT-011 | Richtung getrennt statt „rechts/links" in einem Test | vorschlag |
| IDEA-OUT-012 | Segmenthöhe antippen statt tippen | vorschlag |
| IDEA-OUT-013 | Eigene Ergebnisse für wiederholte Bewegungen | vorschlag |
| IDEA-OUT-014 | Schnellnotizen unter „positiv" | vorschlag |
| IDEA-OUT-015 | Kopfzeile mit den positiven Tests | vorschlag |
| IDEA-OUT-016 | Instrumente in der Praxis pflegen: ändern, hinzufügen, entfernen | vorschlag |
| IDEA-ALT-001 | Alltagsaktivität als Kontext, nicht als Wettbewerb | notiert · ausgearbeitet |
| IDEA-ALT-002 | Gewohnheiten mit sehr kleinen Zielen | notiert · ausgearbeitet |
| IDEA-ALT-003 | Schlaf und Stress mitführen | bestätigt |
| IDEA-ALT-004 | Bedarfsmedikation als Verlaufsgröße | bestätigt |
| IDEA-ALT-005 | Ernährung nur als Protokoll und Zielwert | bestätigt |
| IDEA-ALT-006 | Kalorienzählen ist nicht für alle harmlos | bestätigt · Abgrenzung |
| IDEA-ALT-007 | Kein Vergleich zwischen Patient:innen | bestätigt · Abgrenzung |
| IDEA-ORG-001 | Übersicht zeigt, was zu tun ist, nicht wie es läuft | bestätigt |
| IDEA-ORG-002 | Behandlungstermin und Trainingseinheit sind zwei Dinge | bestätigt |
| IDEA-ORG-003 | Durchführungsansicht für die Einheit | bestätigt |
| IDEA-ORG-004 | Kalender führt Termine und Trainingstage zusammen | bestätigt |
| IDEA-ORG-005 | Sitzungsvorbereitung für die Praxis | bestätigt |
| IDEA-ORG-006 | Planlaufzeit und Wiedervorlage | bestätigt |
| IDEA-KI-001 | Der Rahmen zuerst, dann Features | bestätigt |
| IDEA-KI-002 | Zulässige Anwendungsfälle | bestätigt |
| IDEA-KI-003 | Quellenbindung als Bauprinzip | bestätigt |
| IDEA-KI-004 | Ausdrücklich ausgeschlossen | bestätigt · Abgrenzung |
| IDEA-KI-005 | Nutzung sichtbar machen | bestätigt |
| IDEA-KI-006 | Was in der Referenzsoftware „KI-Analyse" heißt | bestätigt · Einordnung |
| IDEA-KI-007 | Sprachdokumentation: Diktat, Transkription, geprüfter Entwurf | überführt → `PROJECT_PRINCIPLES.md` §6.3 |
| IDEA-QSN-001 | Ein Zeitstrahl über alle Bereiche | bestätigt |
| IDEA-QSN-002 | Zwei Sprachebenen im Datenmodell | bestätigt |
| IDEA-QSN-003 | Datenexport als Funktion, nicht als Anfrage | bestätigt |
| IDEA-QSN-004 | Regelwerke gegen synthetische Verläufe testen | bestätigt |
| IDEA-QSN-005 | Alles Automatische braucht einen protokollierten Override | bestätigt |
| IDEA-QSN-006 | Die Oberfläche muss für 78-Jährige funktionieren | bestätigt |
| IDEA-QSN-007 | Fremde Begriffe nicht ungeprüft übernehmen | bestätigt |
| IDEA-QSN-008 | Interoperabilität als Fernziel benennen, nicht bauen | bestätigt |
| IDEA-QSN-009 | Mandantenfähigkeit mit Branding pro Praxis | notiert |
| IDEA-QSN-010 | Beschäftigtenangaben über die Stammdaten hinaus | notiert |
| IDEA-QSN-011 | Lesbare Patientennummer neben dem technischen Schlüssel | verworfen |
| IDEA-QSN-012 | Zwischen den Bereichen wischen | zurückgestellt (ANN-663) |
| IDEA-ANG-001 | Coaching als Paketpreis | bestätigt |
| IDEA-ANG-002 | Rabatt für eine Google-Bewertung: so nicht | verworfen (B11) |
| IDEA-ANG-003 | Rückfall in die Heilbehandlung während eines Pakets | bestätigt |
| IDEA-ANG-004 | Preise sichtbar, bevor jemand fragt | bestätigt |
| IDEA-PRX-001 | Zugangshinweis je Patient:in | überführt → PAT-005 |
| IDEA-PRX-002 | Fahrpuffer als Praxisregel, ohne Kartendienst | überführt → `PROJECT_PRINCIPLES.md` §8.1 |
| IDEA-PRX-003 | Warteliste mit Zeitfenstern und Nachrücken | überführt → PRX-EPIC-001 (gebaut 2026-09-28) |
| IDEA-PRX-004 | Tag umplanen bei Ausfall, mit Anrufliste | überführt → CAL-009 |
| IDEA-PRX-005 | Anrufliste für morgen | überführt → PRX-014 |
| IDEA-PRX-006 | Terminzettel und Terminübersicht als PDF | überführt → CAL-011, CAL-013 |
| IDEA-PRX-007 | Folgetermin und Schnellanlage | überführt → UX-003 |
| IDEA-PRX-008 | Automatische Terminsuche | überführt → PRX-EPIC-001 (gebaut 2026-09-28) |
| IDEA-PRX-009 | Verordnungszähler am Termin | überführt → PRX-EPIC-002 (gebaut 2026-09-28) |
| IDEA-PRX-010 | Rechnungsempfänger-Stammdaten und verknüpfte Kontakte | vorschlag |
| IDEA-PRX-011 | Persönliche Textbausteine in der Dokumentation | überführt → UX-008 |
| IDEA-PRX-012 | Zahlungserinnerung als Dokument | bestätigt |
| IDEA-PRX-013 | Sammelrechnung je Person und Monat mit Behandlungsnachweis | vorschlag |
| IDEA-PRX-014 | Tagesplan-Cache für den Funkloch-Moment | überführt → UX-011 |
| IDEA-PRX-015 | Unterschrift am Hausbesuch, digitale Vorlagen | verworfen (E-13) |
| IDEA-PRX-016 | Vertretungs-Kurzblick am Termin | überführt → PRX-EPIC-002 (gebaut 2026-09-28) |
| IDEA-PRX-017 | Startort je Tag | vorschlag |
| IDEA-PRX-018 | Dublettenprüfung und Zusammenführen | überführt → PRX-015 |
| IDEA-PRX-019 | Aufgaben und Wiedervorlagen mit Patientenbezug | überführt → PRX-012 |
| IDEA-PRX-020 | Globale Suche und Schnellanlegen | überführt → UX-004 |
| IDEA-PRX-021 | Farbcodierung je Terminart und Person | vorschlag |
| IDEA-PRX-022 | Kartenzahlung beim Hausbesuch | notiert · entscheidung nötig |
| IDEA-PRX-023 | Verordnung per Kamera erfassen | überführt → PRX-011 |
| IDEA-PRX-024 | Kalender-Abo für den eigenen Kalender | vorschlag · Bedenken |
| IDEA-PRX-025 | Kennzahlen für die Praxisführung | bestätigt (Roadmap: STA-EPIC-001) |
| IDEA-PRX-026 | Export für die Steuerberatung | bestätigt |
| IDEA-PRX-027 | Körperschema im Befund | vorschlag |
| IDEA-PRX-028 | Diktat in der Dokumentation | überführt → `IDEA-KI-007` / `PROJECT_PRINCIPLES.md` §6.3 |
| IDEA-PRX-029 | Tagesroute auf der Karte | überführt → ADR-019 / MAP-002 bis MAP-006 |
| IDEA-PRX-030 | Navigationslink zu Google Maps, je Weg und für den Tag | überführt → UX-002 / ADR-019 / ANN-018 |
| IDEA-PRX-031 | Gebietstage für die Terminvergabe | überführt → PRX-EPIC-001 (gebaut 2026-09-28) |
| IDEA-PRX-032 | Fahrzeit je Weg aus dem Kartendienst | überführt → MAP-003 / MAP-004 / MAP-006 |
| IDEA-PRX-044 | Führung auf dem Rad innerhalb der Software | überführt → ADR-019 Fassung 3, Abschnitt F / §20.1 / MAP-007 |
| IDEA-PRX-033 | Planungskarte der aktiven Adressen | vorschlag · Bedenken |
| IDEA-PRX-034 | Entwurf „Own Motion · Praxis": der Tagesplan als Startseite | notiert |
| IDEA-PRX-035 | „Mitnehmen": Materialliste aus den letzten Befunden | überführt → PRX-EPIC-002 (gebaut 2026-09-28) |
| IDEA-PRX-036 | Indikation in der Tagesliste | verworfen |
| IDEA-PRX-037 | Abrechnungslage am Termin | überführt → PRX-EPIC-002 (gebaut 2026-09-28) |
| IDEA-PRX-038 | Dokumentieren ohne Scrollen: was wirklich im Weg steht | überführt → `docs/development/BEFUNDE.md` |
| IDEA-PRX-039 | Termin abhaken: Heilmittel, Kontingent und die Freigabe zur Abrechnung | überführt → PRX-EPIC-002 (gebaut 2026-09-28) |
| IDEA-PRX-040 | Aktionen der Tageskarte neu ordnen | überführt → `docs/development/BEFUNDE.md` |
| IDEA-PRX-041 | Anrufliste mit gespeichertem Stand | überführt → PRX-014 |
| IDEA-PRX-042 | Terminieren mit ausgewählter Person: der Kalender als Suchfläche | überführt → CAL-015c, UBK-014 |
| IDEA-PRX-043 | Textbausteine auch im Befund | notiert |
| IDEA-PRX-045 | Kalender endlos wischen: am Ende des Tags oder der Woche geht es weiter | vorschlag |
| IDEA-PRX-047 | Vergütungsmodelle mit Umsatzbeteiligung | bestätigt (Grundlage in STA-005, das Übrige offen) |
| IDEA-PRX-048 | Lastenrad als 3D-Modell (Design-Export „Lastenrad") | notiert · Abgrenzung |
| IDEA-PRX-049 | Geburtsdatum aller Mitarbeitenden hinterlegt | notiert |
| IDEA-PRX-050 | Stockwerk als eigenes Feld am Hausbesuch (`home_visit_floor`) | notiert |
| IDEA-PRX-051 | Wochentakt der Liege in der Übersicht | notiert |
| IDEA-PRX-052 | Bestätigung des Abschlusses auf der Übersicht | notiert |
| IDEA-PRX-053 | Zahlungs-QR-Code auf Rechnung und Zahlungserinnerung | notiert |
| IDEA-PRX-046 | Kostenvoranschlag zur Abklärung mit der privaten Krankenversicherung | notiert · entscheidung nötig |
| IDEA-PRX-054 | Eigener Anmeldebogen der Praxis zum Ausdrucken | notiert |
| IDEA-PRX-055 | Verordnung vom Foto automatisch erkennen | notiert |
| IDEA-PRX-056 | Reihenfolgevorschlag für den Tag | notiert · entscheidung nötig |
| IDEA-PRX-057 | Schäden am Lastenrad im 3D-Modell markieren | bestätigt · ausgearbeitet |
| IDEA-PRX-058 | Aus dem Check-Up gleich Panne melden oder das Rad sperren lassen | vorschlag |
