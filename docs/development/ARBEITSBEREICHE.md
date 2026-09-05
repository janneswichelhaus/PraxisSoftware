# Arbeitsbereiche: was funktioniert, was Vorschau ist, was offen ist

Stand: 05.09.2026

Diese Liste ist die Antwort auf eine einzige Frage: **Worauf kann ich mich in
der laufenden Anwendung verlassen?** Sie ergänzt
[`../PRODUCT_VISION.md`](../PRODUCT_VISION.md) §6a um den Umsetzungsstand und
ersetzt keine Feature-Spezifikation.

Vier Zustände:

| Zustand                  | Bedeutung                                                                     |
| ------------------------ | ----------------------------------------------------------------------------- |
| **funktional**           | Echte Anbindung an Datenbank, RLS und Audit. Nutzbar mit synthetischen Daten. |
| **Vorschau**             | Bedienbar, aber ohne Hintergrundfunktionen. Zustand nur im Arbeitsspeicher.   |
| **offen**                | Fachliche oder rechtliche Entscheidung steht aus. Die Ansicht zeigt das.      |
| **begründet abweichend** | Weicht bewusst von der Team-App-Vorlage ab. Begründung steht dabei.           |

---

## 1. Funktional

Unverändert an ihren echten Anbindungen. Der Umbau hat Einordnung und
Beschriftung geändert, nicht das Verhalten.

| Bereich                                 | Route                                                   | Anmerkung                                        |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Patientenliste, Suche                   | `/patienten`                                            | RLS-gestützt, Audit auf Aktenzugriff             |
| Patient anlegen / ändern                | `/patienten/neu`, `…/bearbeiten`                        | serverseitige Prüfung in `create/update_patient` |
| Patientenakte                           | `/patienten/:id`                                        |                                                  |
| Kalender Tag / Woche                    | `/kalender`                                             | Datum, Ansicht und Filter stehen in der Adresse  |
| Termin anlegen / ändern                 | `/patienten/:id/termine/neu`, `/termine/:id/bearbeiten` |                                                  |
| Termin absagen / abschließen            | `/termine/:id`                                          |                                                  |
| Behandlungsdokumentation                | `/termine/:id/dokumentation…`                           | Entwurf, Finalisierung, Korrektur, Nachtrag, Änderungsverlauf (DOK-001/002) |
| Dokumentation in der Akte               | `/patienten/:id`                                        | rollenabhängig projiziert; Office sieht den Behandlungsnachweis ohne klinischen Inhalt (DOK-003) |
| Mitarbeiterverwaltung                   | `/praxis/team…`                                         | Liste für alle Praxisrollen, Schreiben nur `owner`; Privatdaten für `office` gar nicht geliefert (STAFF-001) |
| Arbeitszeiten und Raster                | `/praxis/planung`                                       | im Menü jetzt unter „Betrieb"                    |
| Auditansicht                            | `/praxis/sicherheit/audit`                              | nur `owner`; kennt seit DOK-004 einen Systemakteur |
| Mein Tag – eigene Besuche und Tagesplan | `/`                                                     | liest denselben Kalender, keine zweite Liste     |

## 2. Vorschau

Bedienbar mit synthetischen Daten. Jede Seite trägt oben den Hinweis
„noch keine echte Speicherung"; jede Aktion meldet, was übernommen wurde **und
was ausdrücklich nicht passiert ist**. Der Stand liegt ausschließlich im
Arbeitsspeicher der Sitzung — ein Neuladen setzt ihn zurück. Was in einer
Sitzung simuliert wurde, steht unter `/vorschau/protokoll`.

| Bereich                  | Route                         | Aus der Vorlage übernommen                                                                                                                                    |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Radflotte                | `/betrieb/flotte`             | Liste nach Depot, Suche, Status- und Tagesfilter, Wochenübersicht, Schlüsselstand, Verläufe für Schlüssel/Panne/Check-Up, Vertretungshinweis, Standortwarnung |
| Rad anlegen / bearbeiten | `/betrieb/flotte/rad/:id`     | alle Felder der Vorlage inklusive Wochenplan, Ersatzrad, Sonderstandort, Schlüsselcode                                                                        |
| Schlüsselentnahme        | `/betrieb/flotte/schluessel`  | Radauswahl, Name, Bestätigung, Verlauf                                                                                                                        |
| Fahrrad-Check-Up         | `/betrieb/flotte/checkup`     | Prüfpunkte mit drei Bewertungen und Notiz, Gesamtnotiz, Fotos, Erklärung, Unterschrift                                                                        |
| Pannenassistent          | `/betrieb/flotte/panne`       | vollständige Schrittfolge mit allen Verzweigungen, Rückweg, Zusammenfassung und den verschiedenen Abschlüssen                                                 |
| Urlaub                   | `/betrieb/urlaub`             | Antrag, Wochenübersicht, offene Anträge, Genehmigung und Ablehnung mit Unterschrift, Überschneidungswarnung, Resturlaubsanzeige                               |
| Zeitkonto                | `/betrieb/zeitkonto`          | Buchungen geleistet/abgebaut mit Datum, Grund und laufendem Saldo je Person                                                                                   |
| Erstattungen             | `/betrieb/erstattungen`       | Strom und Einkauf, IBAN, Zeitraum, Arbeitstage mit Berechnung, Positionen mit Summe, Belege, Erklärung, Unterschrift, Historie je Person                      |
| Teamkommunikation        | `/team`                       | eigene Anforderung: Kanäle, Direktnachrichten, Threads, Erwähnungen, Ungelesenes, Suche                                                                       |
| Touren                   | `/touren`                     | eigene Anforderung: Besuchsfolge mit unterscheidbarer Behandlungs- und Wegzeit                                                                                |
| Abrechnung               | `/abrechnung` und Unterseiten | eigene Anforderung: Rechnungen, Leistungen, Katalog, Zahlungen                                                                                                |

### Entfallen: Teamverzeichnis und Personalakte

Beide waren in diesem Umbau als Vorschau angelegt. Beim Zusammenführen mit
`main` sind sie ersatzlos entfallen: STAFF-001 liefert die
Mitarbeiterverwaltung unter `/praxis/team` **echt** — mit RLS, Audit und der
Zusicherung, dass `office` die geschützten Privatangaben gar nicht erst
ausgeliefert bekommt. Eine synthetische Personalakte daneben wäre eine zweite
Personenverwaltung gewesen, und ein Verzeichnis mit erfundenen Kontaktdaten
eine vorgetäuschte Funktion.

Was die Vorlage dort zeigte und STAFF-001 heute nicht hat — Eintrittsdatum,
Urlaubsanspruch, Resturlaub, Notfallkontakt, interne Notiz — steht als
`IDEA-QSN-010` im Ideenspeicher, nicht als Attrappe im Code.

### Was in der Vorschau technisch ausgeschlossen ist

Der Vorschaucode enthält keinen Datenbankzugriff, keinen Netzwerkaufruf und
keine Persistenz. Das ist nicht nur Absicht, sondern geprüft:
`src/features/preview/trennung.test.ts` scannt die Vorschaubereiche auf
`getSupabase`, `fetch`, `localStorage` und Vergleichbares.
`src/features/preview/ehrlichkeit.test.tsx` prüft an den heikelsten Stellen,
dass keine Erfolgsmeldung behauptet wird, die es nicht gibt.

## 3. Offen

Sichtbar platziert, aber fachlich noch nicht entschieden. Die Ansichten
benennen die offene Frage, statt sie zu verstecken.

| Offener Punkt                                             | Wo sichtbar             | Quelle                           |
| --------------------------------------------------------- | ----------------------- | -------------------------------- |
| Finalisierung klinischer Dokumentation                    | Abrechnung → Leistungen | `PROJECT_PRINCIPLES.md` §5       |
| Endgültige Fakturierung erst nach Finalisierung           | Abrechnung → Leistungen | `PROJECT_PRINCIPLES.md` §19      |
| Kartendienst, Datenfluss und Vertragsgrundlage            | Touren                  | §3.5, §9, `OPEN_DECISIONS.md` B7 |
| Aggregierte Auswertungen über Beschäftigte                | Zeitkonto               | §20, `OPEN_DECISIONS.md` B6      |
| Speicherfrist des Teamchats, Anhänge, klinische Zuordnung | Team                    | §10, §18                         |
| Aufbewahrung und Löschung von Beschäftigtendaten          | Personalakte            | ADR-008                          |
| Aufbewahrung von Belegen, Bestätigung der Auszahlung      | Erstattungen            | ADR-008, ADR-009                 |
| Tübinger Werkstatt, Ruhetag, Depot, Transportoptionen     | Pannenassistent, Flotte | Standortvorlage, ungeprüft       |
| Terminstatusautomat                                       | Kalender                | §8, `OPEN_DECISIONS.md`          |

Diese Punkte blockieren die davon abhängigen **echten** Aktionen. Sie blockieren
nicht, dass ihre gekennzeichneten Ansichten schon stehen.

## 4. Begründet abweichend von der Team-App-Vorlage

| Vorlage                                                                   | Hier                                                                 | Begründung                                                                                                             |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Zugriff auf geschützte Angaben über eine PIN im Quelltext                 | Rolle des angemeldeten Kontos                                        | Eine PIN im Browser ist keine Zugriffskontrolle. Individuelle Konten sind Pflicht (§3.2, §4.7).                        |
| Eigene Mitarbeiterliste in der Radflotte für die Stammnutzer              | Auswahl aus dem gemeinsamen Mitarbeiterstamm                         | Keine zweite Personenverwaltung; Freitext ordnet ein Rad einer nicht existierenden Person zu.                          |
| Erstattung mit den Ständen „offen" und „erstattet"                        | eingereicht → genehmigt → ausgezahlt, dazu abgelehnt                 | Einreichen, Entscheiden und Auszahlen sind verschiedene Vorgänge. „Genehmigt" heißt nicht „bezahlt".                   |
| Nach jeder Urlaubsgenehmigung eine E-Mail zur Terminplansperre            | Die genehmigte Abwesenheit selbst wirkt auf Kapazität und Radplanung | Geht eine Nachricht verloren, muss die Sperre trotzdem stimmen. Doppeltes Auslösen erzeugt keine doppelte Abwesenheit. |
| Betriebliche Kontakte, Ansprechpartner, Tiefgaragen-Passwort im Quelltext | Standortvorlage mit Platzhaltern, Zugangscode gar nicht hinterlegt   | Keine Secrets im Repository (§3.3); Kölner Angaben sind für Tübingen nicht geprüft.                                    |
| Namentliche Zuständigkeit im Pannenablauf                                 | Rolle („Teamleitung")                                                | Ein Ablauf soll einen Personalwechsel überleben.                                                                       |
| E-Mail-Versand bei Check-Up-Problemen                                     | kein Versand, Hinweis auf den offenen Meldeweg                       | Ein vorgetäuschter Versand ist schlimmer als gar keiner.                                                               |
| `tel:`- und `mailto:`-Links im Teamverzeichnis                            | Kontaktdaten als Text                                                | Die Kontakte sind synthetisch; ein Anruf daraus wäre eine vorgetäuschte Funktion.                                      |
| Push-Benachrichtigung über einen externen Dienst                          | nicht übernommen                                                     | Neuer Dienstleister ohne fachliche Notwendigkeit und ohne Prüfung nach §3.5.                                           |
| Unterschrift ausschließlich als Zeichenfeld                               | zusätzlich Namenseingabe als gleichwertiger Weg                      | Ein reines Zeichenfeld ist mit Tastatur nicht bedienbar.                                                               |

## 5. Was nicht Teil dieses Umbaus war

- Kein Routingdienst, kein KI-Planer, keine automatische Tourenoptimierung.
- Keine neue Abhängigkeit, kein neues Designsystem, kein Service Worker
  ([ADR-015](../adr/ADR-015-initial-technical-stack.md)).
- Keine Datenbankmigration. Die Vorschaubereiche legen bewusst noch keine
  Tabellen und keine Schnittstellen fest ([ADR-014](../adr/ADR-014-foundational-data-model.md)).
- Keine Änderung an RLS, Audit oder Rollen.
- Die Go-live-Blocker aus `docs/DEVELOPMENT.md` bestehen unverändert fort.

## 6. Nächste sinnvolle Schritte

Die Reihenfolge ergibt sich aus dem Gerüst und ist ein Vorschlag, keine
Festlegung:

1. **Mitarbeiterstamm anbinden.** Er trägt Verzeichnis, Personalakte, Urlaub,
   Zeitkonto, Erstattungen und die Stammnutzer der Flotte — der größte Nutzen je
   Aufwand.
2. **Radflotte anbinden.** Danach sind Schlüssel, Check-Up und Panne echte
   Vorgänge, und die Flotte wird als Planungsressource nutzbar.
3. **Urlaub anbinden**, sobald der Mitarbeiterstamm steht. Erst dann wirkt eine
   genehmigte Abwesenheit wirklich auf die Planung.
4. **Dokumentationsentscheidung treffen** (§5). Sie ist die Voraussetzung für
   Dokumentation und damit für die endgültige Fakturierung.
5. **Teamkommunikation**, mit Speicherfrist und Anhangskonzept von Beginn an.
