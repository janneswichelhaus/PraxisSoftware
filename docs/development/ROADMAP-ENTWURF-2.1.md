# Roadmap — Entwurf 2.1

Stand 2026-09-06 · **Entwurf, noch nicht in Kraft.** Er ersetzt `ROADMAP.md`
(Version 2.0), sobald Jannes die Entscheidungen aus
[`ROADMAP-REVIEW-2026-09-06.md`](ROADMAP-REVIEW-2026-09-06.md) Abschnitt 9
beantwortet hat. Bis dahin gilt Version 2.0 unverändert. Stellen, die von einer
dieser Entscheidungen abhängen, tragen die Markierung `[E-n]`.

Reihenfolge der Umsetzung. Beantwortet die Frage **„was als Nächstes"** — und
sonst nichts.

## Was dieses Dokument ist und was nicht

- **Es legt die Reihenfolge fest, nie den Scope.** Was ein Eintrag konkret
  umfasst, entsteht erst im SPEC-Schritt des Loops.
- **Es ist kein Auftrag.** Gebaut wird, was Jannes mit `/feature-loop`
  beauftragt. Ein Eintrag hier startet nichts von allein.
- **Es überschreibt nichts.** `PROJECT_PRINCIPLES.md`, die ADRs und
  `docs/decisions/OPEN_DECISIONS.md` gelten unverändert. Fehlt einem Eintrag
  eine Voraussetzung aus Spur B, gilt `PROJECT_PRINCIPLES.md` §15.1: reversibel
  überbrückbar → als Annahme registrieren und bauen; Hard-Stop-Liste → melden
  und nur den abhängigen Teil nicht beginnen.
- Die fachlichen Inhalte dahinter stehen im Ideenspeicher (`docs/product/`,
  nicht normativ). Verweise wie `IDEA-PRX-004` zeigen dorthin.
- Was in der Anwendung echt angebunden ist und was gekennzeichnete Vorschau,
  steht in [`ARBEITSBEREICHE.md`](ARBEITSBEREICHE.md).
- Wie ein Arbeitsbereich systematisch besser wird, steht in
  [`OPTIMIERUNG.md`](OPTIMIERUNG.md). Die Runden dort liefern Vorschläge; erst
  diese Roadmap gibt ihnen einen Platz.

Jeder Loop liest dieses Dokument zuerst und stellt am Ende die
Fortschrittstabelle und den Abschnitt „Nächster Loop" nach.

---

## Nächster Loop

```
/feature-loop VER-EPIC-001 Verordnungen: PAT-005, VER-001 bis VER-003
```

- **Danach, in dieser Reihenfolge:** `UI-000` Fundament · `UX-EPIC-001`
  Hausbesuchstag · `STAFF-EPIC-002` Konten `[E-4]`.
- **Ersatz**, falls VER-EPIC-001 blockiert ist: `UI-000`.
- **Parallel als Docs-Sessions** (kein Code), alle im September:
  `ADR-017 Dateiablage` · `ADR-018 Terminzustände` · `OPS-001 Providerprüfung`
  (Dokument). Jede endet mit einer Bestätigung durch Jannes.
- **Jannes-seitig diese Woche** (Meilenstein M0, 30.09.): Branch Protection und
  Secret Scanning in den GitHub-Einstellungen aktivieren (zehn Minuten,
  `docs/DEVELOPMENT.md` „Manuelle Schritte") · Anfragen B1, B2, B4 mit
  Fristwunsch verschicken und Stelle, Datum, Zusage in der Spur-B-Tabelle
  eintragen · `MIG-000` Bestandsaufnahme (eine Seite) · Entscheidungen aus dem
  Review beantworten.

Nach jedem abgeschlossenen Loop wird dieser Abschnitt auf den nächsten Eintrag
gestellt (Skill-Schritt I).

---

## Ziel: Produktivbetrieb Ende März 2027

Entschieden von Jannes am 2026-09-05: Die Praxis arbeitet **ab Q1 2027** real
mit der Software. Stichtag für die Planung ist der **31.03.2027**.

Zwei Zeitpunkte, die 2.0 vermischt hat, werden getrennt (ADR-007 Punkt 6
erlaubt vor dem Gate nur synthetische Daten):

- **Go-live-Gate** (M3, 19.03.2027): alle Vorbedingungen erfüllt, Freigabe
  durch Jannes.
- **Produktionsstart** (M4, 31.03.2027): Echtdaten im Produktivsystem, die
  Praxis arbeitet damit. Danach vier Wochen Stabilisierung `[E-7]`.

**Go-live-Umfang (Stufe 1) — Kern:** Patient:innen mit Zugangshinweis ·
Verordnungen · Termine mit Serien und Zustandsautomat (sechs erreichbare
Zustände) · Behandlungsdokumentation mit Abschluss in einem Schritt ·
Leistungen, Rechnung mit Empfänger, Storno, PDF · Zahlungen mit Teilzahlung ·
Mitarbeitende mit Konten, Rollen, Passwort-Selbstbedienung · Auditlog ·
Löschung und Retention · Dateiablage mit Verordnungsscan · Datenschutzinformation
· Bestandsdatenübernahme · Tagesplan druckbar · alles aus Etappe G und H.

**Komfort in Stufe 1** (wird bei Zeitnot zuerst geschoben, Abweichungsregel
Stufe 2): UI-001 Politur · OPS-005 als Automatisierung · Rückzahlungs-UI ·
Legal-Hold-Oberfläche · OPS-006 als vollständige Funktion.

**Nicht Teil des Go-live (Stufe 2, ab Mai 2027):** Anamnese und Fragebögen
(Etappe 2), Übungspläne (Etappe 3), der Praxisbetrieb aus Spur A2, Portal und
alles danach. Ebenfalls Stufe 2 und ausdrücklich bewusst: Terminerinnerung per
SMS/E-Mail, Online-Terminbuchung, Rechnungsversand aus der Plattform,
E-Rechnung, Mahnautomat, Kartenzahlung, Kartendienst — jeweils ein neuer
Dienstleister oder eine Einwilligung (§3.5, ADR-002). Die Vorschaubereiche
bleiben bis dahin gekennzeichnete Vorschau.

### Rückwärtsplan

Kapazität je Monat in Code-Loops (Annahme: zwei je Woche, siehe „Kapazität und
Puffer"); „Last" zählt nur Code-Loops. Docs-Sessions und Jannes-Aufgaben stehen
getrennt, weil sie andere Ressourcen brauchen.

| Monat    | Kap. | Code-Loops (Last)                                                                                             | Docs-Sessions                                                     | Jannes liefert / entscheidet                                                                                   | Extern                        | MS  |
| -------- | ---- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------- | --- |
| Sep 2026 | 7    | VER-EPIC-001 · UI-000 (2)                                                                                     | ADR-017 · ADR-018 · OPS-001 Providerprüfung                       | Branch Protection · B1/B2/B4 anfragen · MIG-000 · Review-Entscheidungen · ADR-017/018 bestätigen             | —                             | M0  |
| Okt 2026 | 9    | UX-EPIC-001 · STAFF-EPIC-002 · LOE-EPIC-001 · CAL-EPIC-003a Zustände (4)                                      | Optimierungsrunde Touren & Termine · VVT- und TOM-Entwurf         | Test-Cloudprojekt anlegen (nach OPS-001) · E10 · E-Mail-Anbieter `[E-4]` · erste Abnahmen · Urlaub eintragen | —                             | —   |
| Nov 2026 | 8    | CAL-EPIC-003b Serie · DAT-EPIC-001 · ABR-EPIC-001 · ABR-EPIC-002a Rechnung (4)                                | Optimierungsrunde Patient:innen · Löschkonzept, Breach-Prozess, Subprozessoren | Leistungskatalog mit Preisen · Praxisstammdaten, Logo, Bank · B4-Termin · B12 · PDF-Weg `[E-5]`   | B4 Ergebnis                   | —   |
| Dez 2026 | 6    | ABR-EPIC-002b Dokument/Storno · ABR-EPIC-003 Zahlungen · E2-Funktion Tagesplan · PAT-006 · MIG-001 (5)        | Optimierungsrunde Abrechnung · DSFA-Entwurf an die Prüfung (15.12.) | Ende-zu-Ende-Abnahme · Altdaten-Export als Datei · Feldtag 1                                                 | B2 Ergebnis                   | M1  |
| Jan 2027 | 8    | OPS-003 Backup/Restore · OPS-004 Logging (mit OPS-005 minimal) · OPS-006 minimal · OPS-007 Bootstrap · Befunde (5) | Betriebsdokumentation · BETRIEB-001 · Optimierungsrunde Mein Tag | Restore-Test mitführen · Notfallzugang verwahren · Endgeräte-Richtlinie                                   | DSFA-Rückfragen               | —   |
| Feb 2027 | 8    | Befunde aus Probewoche · UI-001 Politur (3)                                                                   | Rückfallplan · Kurzanleitung „erster Tag" · Messrunde vor Go-live | Probewoche H1 · Schulung H2 · Restore-Test 2 · Feldtag 2 · **Feature-Freeze 26.02.**                          | B1 Ergebnis · DSFA abgeschlossen | M2 |
| Mär 2027 | 8    | **Puffer** — nur Befunde und Dokumentation (0 geplant)                                                        | Nachweistabelle MUSS → Test/Policy                                | Go-live-Gate 19.03. · MIG-001 Probelauf · Produktions-Bootstrap · Echtdaten-Import 31.03.                     | —                             | M3, M4 |
| Apr 2027 | 8    | **Stabilisierung** — Hotfixes und Befunde (0 neue Epics)                                                      | —                                                                 | Parallel- oder Stichtagsbetrieb `[E-7]` · wöchentlicher Abgleich · Umschaltung 30.04.                          | —                             | M5  |
| Mai 2027 | —    | Spur A2 beginnt (URL-001) · Optimierungsrunde nach vier Wochen Betrieb                                        |                                                                   |                                                                                                                |                               |     |

Sperrzeit 21.12.2026 bis 04.01.2027; Jannes' Urlaub wird eingetragen, sobald
er feststeht. Rechnung: 27 Code-Loops von September bis Februar bei 46
Loop-Plätzen — knapp 60 Prozent Auslastung. Der Rest ist Puffer für Abnahme,
Befunde, Krankheit und dafür, dass die Startwoche kein Maß ist.

### Meilensteine

Ein Meilenstein gilt als erreicht, wenn **alle** Kriterien erfüllt sind. Das
Wochenupdate meldet je Meilenstein grün (auf Kurs), gelb (ein Kriterium
gefährdet), rot (Termin nicht haltbar).

| MS | Termin     | Name                     | Kriterien                                                                                                                                                                                                                                                      |
| -- | ---------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 | 30.09.2026 | Vorlauf gesichert        | B1, B2, B4 angefragt: Stelle benannt, Termin zugesagt · OPS-001 dokumentiert, Ergebnis positiv · ADR-017 und ADR-018 von Jannes bestätigt · Branch Protection und Secret Scanning aktiv · MIG-000 liegt vor · Review-Entscheidungen beantwortet             |
| M1 | 18.12.2026 | Kernprozess Ende-zu-Ende | Ein synthetischer Fall läuft auf der Test-Umgebung durch: Verordnung → Serie → Termin durchgeführt → Dokumentation finalisiert → Leistung → Rechnung als PDF → Zahlung · von Jannes abgenommen · jede Stufe-1-Datenklasse hat Löschpfad und Test · B4 liegt vor |
| M2 | 26.02.2027 | Betriebsbereit           | Restore-Test 1 bestanden inklusive Löschungen · Deployment aus Tag mit Freigabe · Redaction-Prüfung grün · Betriebsdokumentation (13 Positionen) · Probewoche durchlaufen, Befunde geschlossen · Team geschult · DSFA-Entwurf bei der Prüfung · **Feature-Freeze** |
| M3 | 19.03.2027 | Go-live-Gate             | ADR-007 sieben Vorbedingungen · B1- und B2-Ergebnis liegt vor · kein Register-Eintrag Datenschutz/Recht auf `offen` · Restore-Test 2 bestanden · MIG-001 Probelauf mit synthetischem Export erfolgreich · Rückfallplan unterschrieben · Zielwerte aus `OPTIMIERUNG.md` erreicht oder als Abweichung dokumentiert |
| M4 | 31.03.2027 | Produktionsstart         | Echtdaten-Import zum Stichtag · Praxis arbeitet mit der Software · altes Werkzeug bleibt bis M5 verfügbar `[E-7]`                                                                                                                                              |
| M5 | 30.04.2027 | Umschaltung              | Vier Wochen Betrieb ohne offenen Befund der Klasse „Datenverlust/Falschzuordnung" · altes Werkzeug nur noch lesbar · Spur A2 freigegeben                                                                                                                       |

### Kapazität und Puffer

Gemessen sind acht Epics in den ersten neun Tagen (109 Commits, 53 Prozent am
Wochenende); die Startwoche ist kein Maß. Der Plan rechnet mit **zwei
Code-Loops je Woche** und rund **fünf Stunden Jannes-Zeit je Woche**: Sessions
starten, Fragen beantworten, eine Stunde Abnahme. **Der Engpass ist nicht die
Baukapazität, sondern Jannes' Zeit für Entscheidungen, Abnahmen und externe
Anfragen.** Deshalb zählt die Fortschrittstabelle abgenommene, nicht gebaute
Epics.

Der Softwareanteil von Stufe 1 ist bis M1 eingeplant; Januar und Februar
gehören der Betriebsreife und der Einführung; **der März ist Puffer** und
nimmt nur Befunde und Dokumentation auf.

**Abweichungsregel, abgestuft:**

1. Ist M0 am 30.09. nicht erreicht, führt das Wochenupdate den fehlenden Punkt
   namentlich, bis er erledigt ist; kein Loop ersetzt ihn.
2. Ist M1 am 18.12. nicht erreicht, wandern die Komfort-Pakete hinter den
   Go-live. Der Kern wird nicht gekürzt.
3. Ist M2 am 26.02. nicht erreicht oder fehlt im Februar ein Ergebnis aus
   B1/B2, wird der **Termin** auf Q2 2027 gesetzt — nicht der Kern und keine
   Sicherheits- oder Datenschutzmaßnahme (`PROJECT_PRINCIPLES.md` §16).

### Risiken

| Nr  | Risiko                                                          | Eintritt | Wirkung   | Frühindikator                              | Gegenmaßnahme                                                                                  | Wer           |
| --- | --------------------------------------------------------------- | -------- | --------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------- |
| R1  | Externe Prüfungen B1/B2 liefern später als Februar              | hoch     | hoch      | M0 ohne zugesagten Termin                  | Anfrage im September mit Fristwunsch; Entwürfe bis 15.12.; zweite Stelle anfragen              | Jannes        |
| R2  | Providerprüfung Supabase negativ                                | niedrig  | sehr hoch | OPS-001 nicht bis 30.09. dokumentiert      | Prüfung vorziehen; erst danach ADR-017 und ABR-Datenmodell finalisieren                        | Claude/Jannes |
| R3  | Jannes' Zeit reicht nicht für Entscheidungen und Abnahmen       | hoch     | hoch      | zwei Wochen ohne abgenommenes Epic         | fester Wochentermin; gehostete Test-Umgebung; Entscheidungen als Optionen mit Empfehlung       | Jannes        |
| R4  | Neue Dienstleister (E-Mail, PDF) erst spät erkannt              | mittel   | mittel    | Spur-B-Punkt ohne Termin                   | B13/B14 in Spur B; Stufe 1 ohne Versand aus der Plattform                                     | Claude        |
| R5  | Feiertage und Urlaub kosten drei Wochen                         | sicher   | mittel    | —                                          | 21.12.–04.01. gesperrt; Urlaub im Rückwärtsplan                                                | Jannes        |
| R6  | Befunde aus der Abnahme kommen als Welle im Januar              | hoch     | mittel    | Fortschrittstabelle ohne Abnahmedatum      | Abnahme je Epic binnen sieben Tagen; Befunde im Folge-Loop derselben Spur                      | beide         |
| R7  | Scope wächst aus Ideenspeicher und Wettbewerbsvergleich         | mittel   | mittel    | Story ohne Bezug zum Stufe-1-Kern          | Feature-Freeze M2; Ideen nur eintragen; Scope-Bremse aus `OPTIMIERUNG.md`                      | beide         |
| R8  | Parallele Branches erzeugen Merge-Arbeit                        | mittel   | niedrig   | mehr als ein aktiver Feature-Branch        | Regel „ein Feature-Branch, Docs sofort mergen"                                                 | Claude        |
| R9  | `pg_cron` oder andere Annahmen gelten beim Provider nicht       | niedrig  | mittel    | OPS-001-Katalog                            | in OPS-001 prüfen; Fallback in ANN-007                                                         | Claude        |
| R10 | Mobile Endgeräte ohne Richtlinie (Verlust, Sperre, MFA)         | mittel   | hoch      | TOM ohne Abschnitt Endgeräte               | Endgeräte-Richtlinie in G12; Sitzungen beenden in STAFF-EPIC-002                               | beide         |
| R11 | Bestandsdaten lassen sich nicht sauber exportieren              | mittel   | hoch      | MIG-000 nennt kein Exportformat            | MIG-000 im September; notfalls manuelle Erfassung der aktiven Fälle mit Stichtag               | Jannes        |

---

## Drei Spuren zum Bauen, eine zum Entscheiden

| Spur   | Inhalt                                                                | Wer                   |
| ------ | --------------------------------------------------------------------- | --------------------- |
| **A1** | Kernprozess: Klinik, Bedienung im Hausbesuch, Abrechnung              | Claude, Feature-Loops |
| **A2** | Praxisbetrieb: Urlaub, Zeitkonto, Flotte, Erstattungen, Team, Touren  | Claude, nach M5       |
| **A3** | Betriebsreife (Etappe G) und Einführung (Etappe H)                    | Claude und Jannes     |
| **B**  | Entscheiden: offene Punkte mit Fälligkeit                             | Jannes, teils extern  |

**Takt:** A1 hat Vorrang bis M1. A3 läuft parallel, wo Jannes-seitige
Vorlaufarbeit nötig ist; ab Januar hat A3 Vorrang. A2 beginnt nach M5. Ein
Loop je Session; zwei Code-Loops je Woche sind das Maß.

---

## Spur A1 — Kernprozess

### Etappe 1 — Der Kernprozess wird vollständig und bedienbar (bis M1)

**Warum zuerst:** Verordnung → Termin → Dokumentation → Leistung → Rechnung
ist die Kette, auf der eine Praxis läuft. Neu gegenüber 2.0: die Kette wird
nicht nur fachlich geschlossen, sondern dort bedienbar gemacht, wo sie heute
schon reibt — Tagesliste ohne Adresse, kein Folgetermin, sechs Taps für die
Dokumentation, keine künftigen Termine in der Akte, kein Schutz vor
Textverlust (Review Abschnitt 5).

Spalten: Kennung · Ergebnis in einem Satz · Stories · Voraussetzung · Jannes
liefert.

| Loop                | Ergebnis                                                              | Stories                                                                                                                                                                                                                                                                                                          | Voraussetzung                          | Jannes liefert                   |
| ------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| ~~DOK-EPIC~~        | Behandlungsdokumentation mit Finalisierung                            | DOK-001 bis DOK-004                                                                                                                                                                                                                                                                                              | **fertig** (PR #5, PR #9)              | Abnahme steht aus                |
| **VER-EPIC-001**    | Verordnungen liegen in der Akte, mit Kontingent und Verordner:in      | **PAT-005** Stammdaten: Telefon (Geschäftlich), Mobil, Telefax, Einrichtung, Besonderheit, Bemerkung, feste Therapeut:in, **Zugangshinweis Hausbesuch** (`IDEA-PRX-001`) · **VER-001** Datenmodell Verordnung mit `prescribers`, Positionen mit verordneter/genutzter Menge, Erst-/Folgeverordnung, Empfehlung zum Verordnungsende · **VER-002** je Patient:in, nach Jahr · **VER-003** anlegen und bearbeiten | —                                      | —                                |
| **UI-000**          | Das Fundament trägt die nächsten zwanzig Seiten                       | Tokens `ink-subtle` und `line-strong` auf AA heben, Kontrast-Test · Bausteine `ButtonLink`, `Rueckfrage`, `Section`, `DataRow`, `Statusmeldung`, `SearchField` und Ersetzen der Duplikate · Druck-Basis · Verbindungsanzeige · 375-px-Screenshot-Helfer · Oberflächen-Checkliste in `docs/abnahme/README.md`                            | —                                      | axe als Dev-Abhängigkeit `[E-8]` |
| **UX-EPIC-001**     | Ein Hausbesuchstag läuft ohne Umwege durch die Anwendung              | Tagesliste mit Adresse, `tel:`-Link, Karten-Übergabe ohne Namen (`ANN`), Zugangshinweis, „Offen heute"; Vorschau-Karten zusammengefaltet · Folgetermin am Termin und Tap auf freie Zeit im Kalender, Vorbelegung Hausbesuch/ich/heute (`IDEA-PRX-007`) · nächste Termine in der Akte · „Behandlung abschließen" in einem Schritt · Textverlust-Schutz und Verbindungsanzeige (`ANN`) · Tagesplan-Cache lesend nach ADR-001 (`IDEA-PRX-014`) `[E-12]` · Touch-Ziehen erst nach Long-Press, Rückgängig-Leiste · serverseitige Patientensuche von jeder Seite (`IDEA-PRX-020`) · Textbausteine in der Dokumentation (`IDEA-PRX-011`) `[E-9]` | VER-EPIC-001, UI-000                   | Daumen-Test nach dem Loop        |
| **LOE-EPIC-001**    | Löschung und Retention sind gebaut und getestet                       | **LOE-001** Datenklassen und Retention Schedule an genau einer Stelle (ANN-001), Anker „Abschluss der Behandlung", Legal Hold (Modell; Oberfläche Komfort) · **LOE-002** Löschjournal mit idempotenter Wiederanwendung, Auditbezug, alle Versionen; `pnpm test:db` deckt jede Datenklasse ab                          | ANN-001, ANN-002; erfasst Verordnungen | —                                |
| **CAL-EPIC-003a**   | Termine kennen alle Zustände, die die Praxis heute braucht            | **CAL-008** Zustandsautomat nach ADR-018: bestätigt, abgesagt (mit Grund), nicht angetroffen (Ausfallhonorar-Kennzeichen), durchgeführt (aus „Behandlung abschließen"), dokumentiert (aus Finalisierung), abgerechnet (aus ABR-003); Migration der heutigen Status; Auditkatalog · **CAL-009** Tag umplanen: alle Termine einer Person eines Tages absagen/vormerken mit Anrufliste (`IDEA-PRX-004`) | ADR-018 von Jannes bestätigt           | —                                |
| **CAL-EPIC-003b**   | Eine Verordnung wird in einer Minute zu einer Terminserie             | **CAL-007** Serie aus der Verordnung: Anzahl aus dem Kontingent, fester Rhythmus, Konfliktprüfung je Termin inline, Einzelabweichung · **CAL-010** Fahrpuffer als Praxisregel: Mindestabstand zwischen Hausbesuchen an verschiedenen Adressen, Warnung deterministisch (`IDEA-PRX-002`, kein Kartendienst) · Terminzettel als PDF (`IDEA-PRX-006`) | VER-001, CAL-EPIC-003a, UI-000 (Druck) | —                                |
| **ABR-EPIC-001**    | Leistungen entstehen aus durchgeführten Terminen                      | **ABR-000** Praxis-Stammdaten für Rechnungen (Anschrift, Bank, Steuernummer, Logo, `owner`) · **ABR-001** Leistungskatalog versioniert, Steuerkennzeichen je Version, Hausbesuchspauschale und Ausfallhonorar als Katalogpositionen · **ABR-002** Leistungserfassung am durchgeführten Termin, vorbelegt aus der Verordnung, Kopplung an finalisierte Dokumentation mit protokolliertem Override (C1, ANN-006) | B4 als Annahme                         | Katalog mit Preisen, Stammdaten  |
| **ABR-EPIC-002a**   | Eine Rechnung entsteht aus Leistungen, mit dem richtigen Empfänger    | **ABR-003a** Rechnungsempfänger-Stammdaten (Beihilfe, PKV, Betreuung, Eltern; `IDEA-PRX-010`) · Rechnung: Zustände nach ADR-009 bis „ausgestellt", Nummer erst bei Ausstellung, Snapshot mit Verordnungsbezug, Sammelrechnung je Person und Monat mit Behandlungsnachweis                                                    | ABR-EPIC-001, B12                      | Nummernkreis-Entscheidung (B12)  |
| **ABR-EPIC-002b**   | Die Rechnung ist ein Dokument, das bleibt                             | **ABR-003b** PDF nach dem entschiedenen Weg (B14), Ablage nach ADR-017, Storno- und Korrekturdokument (einfache Kette), Zahlungserinnerung als Dokument ohne Stufenlogik (`IDEA-PRX-012`)                                                                                                                              | DAT-001, B14                           | —                                |
| **ABR-EPIC-003**    | Zahlungen und offene Posten sind nachvollziehbar                      | **ABR-004** Zahlungen als Transaktionen, Teilzahlung, offene Posten auf der Einstiegsseite; Rückzahlung im Modell, Oberfläche Komfort                                                                                                                                                                             | ABR-EPIC-002a                          | —                                |

**Bewusst nicht Teil von Etappe 1:** Mahnautomat mit Stufen (ABR-005, nach
Praxiserfahrung) · Kostenträger, Versichertennummer, Zuzahlung (GKV) ·
E-Rechnung · Kassenbuch, TSE, Kartenzahlung · Factoring · Terminerinnerung
per SMS/E-Mail und Online-Terminbuchung (Anbieter, Einwilligung; `B15`) ·
Warteliste mit Zeitfenstern (`IDEA-PRX-003`) `[E-9]` · automatische
Terminsuche (`IDEA-PRX-008`) · Kennzahlen (`IDEA-PRX-025`) · Export für die
Steuerberatung (`IDEA-PRX-026`, sobald B4 das Format nennt).

### Etappe 2 — Anamnese, Verlauf, Bericht (Stufe 2)

Unverändert gegenüber 2.0: FRB-EPIC-001, FRB-EPIC-002 (B8), DOK-005
Therapiebericht.

### Etappe 3 — Übungspläne innerhalb der Therapie (Stufe 2)

Unverändert gegenüber 2.0: UEB-EPIC-001, UEB-EPIC-002. Keine automatische
Anpassung (ADR-006 Punkt 2).

### Fernplan — Etappen 4 bis 10

Unverändert gegenüber 2.0. Vor Etappe 4 wird der Fernplan gegen die
Wettbewerbsreferenz (`docs/product/ideen/referenz-wettbewerb.md`) und die
Ergebnisse der ersten Betriebsmonate neu geprüft.

---

## Spur A2 — Praxisbetrieb (Stufe 2, nach M5)

Unverändert gegenüber 2.0: URL-001 → ZK-001 (B6) → FLT-EPIC-001 → ERS-001
(ADR-017, B4) → TEAM-001 (ADR-017) → TOUR-001 (B7). Drei Regeln bleiben: keine
neue Vorschau, keine Erweiterung einer Vorschau, jede Vorschau wird in ihrem
Loop ersetzt. Vor dem ersten A2-Loop entscheidet eine Optimierungsrunde mit
Zählung aus dem Betrieb, ob die Reihenfolge noch stimmt.

---

## Spur A3 — Etappe G: Betriebsreife (vor M3)

| #   | Paket                                        | Inhalt                                                                                                                                                                                                                                             | Wer                          | Termin   |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------- |
| G1  | **ADR-017 Dateiablage**                      | Supabase Storage nach ADR-015 Punkt 10, signierte Verweise, Datenklasse und Retention nach ADR-008, Zugriff nach ADR-004, Audit nach ADR-010, Virenprüfung erst bei Patienten-Uploads. Schließt E8. **Erst nach positivem OPS-001.**                | Claude (Docs), Jannes bestätigt | Sep 2026 |
| G2  | **STAFF-EPIC-002 Konten und Rollen**         | STAFF-002 Zugang einladen, Rolle vergeben und ändern (auditiert) · STAFF-003 sperren, Passwort zurücksetzen, MFA für `owner` · **STAFF-004** Passwort vergessen als Selbstbedienung, alle Sitzungen beenden. Löst E11; E10 als Annahme (`owner`). | Claude                       | Okt 2026 |
| G3  | **OPS-001 Providerprüfung und Cloudprojekt** | Prüfkatalog aus ADR-002 für Supabase dokumentieren; bei positivem Ergebnis Cloudprojekt in EU-Region und Umgebungen Dev/Test/Prod. **Dokument im September, Anlage im Oktober.** Keine Cloud-Ressource durch einen Agenten (ADR-013).            | Claude (Dokument), Jannes (Anlage) | Sep/Okt 2026 |
| G4  | **DAT-EPIC-001 Dateiablage**                 | DAT-001 Bucket, Berechtigungen, signierte Verweise, Datenklasse, Audit · VER-004 Scan-Anhang je Verordnung                                                                                                                                         | Claude                       | Nov 2026 |
| G5  | **OPS-002 Deployment und Freigabe**          | Frontend-Hosting mit Prüfung nach ADR-002; Release aus Tag mit menschlicher Freigabe; Migrationen nur über die Pipeline; Rollback; `service_role` nie im Browser; Review-Checkliste. **Test-Umgebung im November**, damit Jannes ohne Docker abnimmt. | Claude (Pipeline), Jannes (Freigabe) | Nov 2026 |
| G6  | **OPS-004 Logging, Redaction, Monitoring**   | Verbotsliste aus ADR-011 automatisiert geprüft, Entscheidung zu externem Error-Tracking, Alarmierung, Security-Log 12 Monate, Erkennung für Art. 33. **Enthält OPS-005 minimal:** Audit-Abfrage als Runbook für `owner`, abgewiesene Zugriffe protokolliert. | Claude                       | Jan 2027 |
| G7  | **OPS-003 Backup und Restore-Test**          | PITR aktiv, Backup-Lebenszyklus, Restore-Test in isolierter Umgebung inklusive Nachziehen der Löschungen, Notfallzugang verwahrt, Betriebsdokumentation mit den 13 Positionen aus ADR-012.                                                          | Jannes und Claude            | Jan 2027 |
| G8  | **PAT-006 Datenschutzinformation und Einwilligungen** | „Datenschutzinformation ausgehändigt am", Hinweis auf Behandlungsvertrag, minimale Einwilligungsstruktur je Zweck mit Widerruf; Textvorlage Ausfallhonorar-Regel.                                                                            | Claude                       | Dez 2026 |
| G9  | **OPS-006 Betroffenenrechte (minimal)**      | Verfahren dokumentiert; Export der Akte als einfache `owner`-Funktion, auditiert; begründete Ablehnung bei Aufbewahrungspflicht als Vorlage. Vollständige Funktion: Komfort.                                                                        | Claude                       | Jan 2027 |
| G10 | **E2 Ausfallkonzept**                        | Tagesplan mit Adressen und Telefonnummern druck- und exportierbar (**Dezember**, klein) · Praxisprozess für einen Tag ohne Anwendung (ADR-012).                                                                                                    | Claude (Funktion), Jannes (Prozess) | Dez 2026 / Jan 2027 |
| G11 | **OPS-007 Bootstrap Produktion**             | Runbook: Organisation, Standort, erstes `owner`-Konto, Mitarbeitende, Katalog, Praxisstammdaten ohne Seed anlegen; gegen die Test-Umgebung geprobt.                                                                                                | Claude                       | Jan 2027 |
| G12 | **MIG-000 Bestandsaufnahme**                 | Heutiges Werkzeug, Anzahl aktiver Patient:innen, laufende Verordnungen, offene Rechnungen, Exportformat, letzte Rechnungsnummer — eine Seite.                                                                                                       | Jannes                       | Sep 2026 |
| G13 | **MIG-001 Bestandsdatenübernahme**           | Importwerkzeug für Patientenstammdaten (synthetisch getestet) · laufende Verordnungen mit Restkontingent · Stichtagsregel: Rechnungen vor dem Stichtag bleiben im Altsystem, offene Posten als Saldo · Nummernkreis nach B12 · Probelauf vor M3, Echtlauf zu M4. | Claude (Werkzeug), Jannes (Daten) | Dez 2026 / Mär 2027 |
| G14 | **DSFA-Paket**                               | Schwellwertprüfung und DSB-Entscheidung (B2), Verzeichnis der Verarbeitungstätigkeiten, TOM (mit Endgeräte-Richtlinie), Löschkonzept (aus LOE), Subprozessoren (aus G3), Datenschutzinformationen (G8), Verfahren für Betroffenenrechte (G9), Data-Breach-Prozess; Nachweistabelle MUSS → Test/Policy/Prüfschritt; Zweckbestimmung (ADR-006). **Entwürfe ab Oktober als Docs-Sessions, Stand 15.12. an die Prüfung.** | Jannes, externe Prüfung      | Okt 2026 bis Feb 2027 |
| G15 | **B1 Regulatorische Prüfung**                | Externe Bestätigung der Zweckbestimmung und MDR-Abgrenzung (ADR-006), Einordnung nach EU AI Act.                                                                                                                                                   | Jannes, extern               | Feb 2027 |
| G16 | **BETRIEB-001 Betriebsmodell**               | Störungsmeldung ohne Patientendaten · Triage werktäglich durch Jannes · Hotfix-Weg nach ADR-013 als privilegierter Vorgang mit Audit · Release-Takt nach M4: ein Release je zwei Wochen aus Tag, Change-Freeze zwei Wochen um M4 · Endgeräte-Richtlinie · Vertretung bei Ausfall von Jannes (Notfallzugang aus G7). | Jannes mit Claude            | Feb 2027 |
| G17 | **UI-001 Politur und Barrierefreiheit**      | Feindesign auf den fertigen Seiten, PWA-Manifest ohne Service Worker, Befunde aus Feldtagen und Kolleg:innen-Tests. **Nicht:** Branding je Praxis (`IDEA-QSN-009`).                                                                                | Claude                       | Feb 2027 |
| G18 | **Go-live-Gate (M3)**                        | Sieben Vorbedingungen aus ADR-007 · Restore-Test 2 · alle Annahmen Datenschutz/Recht bestätigt oder geändert · Branch Protection und Secret Scanning aktiv · CI grün · Abnahmeschritte aus `docs/abnahme/` durchlaufen · Messrunde vor Go-live: kein täglicher Ablauf mit Score 0, Abweichungen bewusst dokumentiert (`OPTIMIERUNG.md`) `[E-11]`. | Jannes                       | 19.03.2027 |

Der Generator für synthetische Daten (E6) bleibt der Seed; die Probewoche (H1)
erweitert ihn um eine realistische Praxiswoche.

**Kleine Wartung** (ohne eigenen Loop): `supabase/config.toml` Abschnitt
`[inbucket]` nach `[local_smtp]` umbenennen.

## Spur A3 — Etappe H: Einführung (Feb bis Apr 2027)

ADR-007 Punkt 6 erlaubt vor dem Gate nur synthetische Daten. Deshalb in zwei
Schritten: erst spielen, dann echt.

| #  | Paket                          | Inhalt                                                                                                                                                                                                                                 | Wer                  | Termin     |
| -- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------- |
| H1 | **Probewoche (synthetisch)**   | Der Seed bildet eine Praxiswoche nach (Hausbesuche, Serien, ein No-show, eine Rechnung). Jannes und eine Kollegin arbeiten sie auf der Test-Umgebung am Smartphone durch; Befunde werden gesammelt, priorisiert, geschlossen.        | Jannes, Team, Claude | Feb 2027   |
| H2 | **Schulung**                   | Zwei Termine je zwei Stunden nach Rolle (Therapie / Office / Inhaber) auf Basis der Abnahmedateien; Kurzanleitung „erster Tag" als eine Seite; Erster-Tag-Protokoll nach `OPTIMIERUNG.md`.                                            | Jannes               | Feb 2027   |
| H3 | **Umstellung** `[E-7]`         | Option a: Parallelbetrieb — ab M4 jeder Vorgang in der neuen Software, altes Werkzeug bleibt für Rechnungen und Notfälle beschreibbar, wöchentlicher Abgleich. Option b: Stichtagsumstellung mit Rückfallplan, altes Werkzeug ab M4 nur lesend. | alle                 | Apr 2027   |
| H4 | **Rückfallplan**               | Abbruchkriterien (Datenverlust, Falschzuordnung, mehr als ein Tag Ausfall) · Rückweg: Export nach G9, Rückführung ins Altsystem, Sperrung des Produktivprojekts · verantwortlich Jannes.                                              | Jannes               | vor M4     |
| H5 | **Umschaltung (M5)**           | M5-Kriterien geprüft; Altsystem lesend; Stabilisierungsbefunde geschlossen; Spur A2 freigegeben; Optimierungsrunde nach vier Wochen Betrieb.                                                                                            | Jannes               | 30.04.2027 |

---

## Spur B — Entscheiden

Offene Punkte aus `docs/decisions/OPEN_DECISIONS.md` mit Fälligkeit. **Ein
Loop kann keine davon ersetzen.** Neu: die Spalten „angefragt am / bei wem /
zugesagt bis" pflegt Jannes; das Wochenupdate liest sie.

| Punkt                        | Was zu entscheiden ist                                                                                        | Wer                               | Fällig vor                      | Termin                | Stand (Jannes pflegt) |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------- | --------------------- | --------------------- |
| **E8 → ADR-017**             | Dateiablage: Ort, Zugriff, signierte Verweise, Retention, Virenprüfung                                        | Claude schreibt, Jannes bestätigt | DAT-EPIC-001, ABR-EPIC-002b     | Sep 2026              |                       |
| **D → ADR-018**              | Terminzustände: Übergänge, Auslöser, Migration; „angefragt"/„vorgemerkt" definiert, nicht gebaut             | Claude schreibt, Jannes bestätigt | CAL-EPIC-003a                   | Sep 2026              |                       |
| **Providerprüfung Supabase** | Prüfkatalog ADR-002 dokumentiert und bestanden — sonst Alternative                                            | Jannes mit Claude-Dokument        | ADR-017, OPS-001 Anlage         | 30.09.2026            |                       |
| **B13 E-Mail-Versand** `[E-4]` | Anbieter für Transaktions-E-Mail (Einladung, Passwort), AVV, Prüfung nach ADR-002 — oder Konten ohne E-Mail | Jannes, Prüfung nach ADR-002      | STAFF-EPIC-002                  | Okt 2026              |                       |
| **E10**                      | Wer darf Mitarbeiterdaten schreiben (bis dahin `owner`)                                                       | Jannes                            | STAFF-EPIC-002                  | Okt 2026              |                       |
| **B4**                       | Steuerliche Validierung: Leistungsarten, Umsatzsteuer, Belegfristen                                           | Steuerberatung                    | ABR-EPIC-001 (als Annahme)      | Nov 2026              |                       |
| **B12 Stichtag, Nummernkreis** | Fortführung der bisherigen Rechnungsnummern oder neuer Kreis ab Stichtag (GoBD); Altdaten im Altsystem     | Steuerberatung mit B4             | ABR-EPIC-002a, MIG-001          | Nov 2026              |                       |
| **B14 PDF-Weg** `[E-5]`      | Rechnungs-PDF: Browser-Druck, Bibliothek im Browser oder serverseitige Funktion — Ausführungsort und Abhängigkeit | Jannes mit Claude-Optionen     | ABR-EPIC-002b                   | Nov 2026              |                       |
| **B2**                       | DSFA-Schwellwertprüfung, DSB-Entscheidung, danach DSFA                                                        | externe Datenschutzberatung       | M3                              | Anfrage Sep, Ergebnis Dez, DSFA Feb |         |
| **B1**                       | Zweckbestimmung, MDR-Abgrenzung, EU AI Act                                                                    | externe Prüfstelle                | M3                              | Anfrage Sep, Ergebnis Feb |                   |
| **B3**                       | Validierung der internen Fristen (ANN-001), Belegarten                                                        | im DSFA-Prozess                   | M3                              | Feb 2027              |                       |
| **E2**                       | Ausfallkonzept als Praxisprozess                                                                              | Jannes mit Claude                 | M3                              | Jan 2027              |                       |
| **B15 Terminerinnerung** `[E-9]` | Kanal (SMS, E-Mail, Messenger), Anbieter, Einwilligung; oder Anrufliste bleibt der Weg                    | Jannes, Prüfung nach ADR-002      | Stufe 2                         | nach M5               |                       |
| **B6**                       | Beschäftigtendaten: aggregierte Auswertungen (§20)                                                            | Jannes, ggf. Beratung             | ZK-001, TOUR-001                | Stufe 2               |                       |
| **B7**                       | Kartendienst: Adressen oder Koordinaten, Anbieter, AVV/§203                                                   | Jannes und Prüfung nach ADR-002   | TOUR-001                        | Stufe 2               |                       |
| **B8**                       | Lizenzstatus DIGOTOR-Bogen und weiterer Instrumente                                                           | Jannes, Lizenzgeber               | FRB-003                         | Stufe 2               |                       |
| **B5**                       | Patientenidentität, Vertretung, §630g                                                                         | Jannes, ggf. Beratung             | Etappe 4                        | Stufe 2               |                       |
| **B9**                       | Betreuung nach Therapieende                                                                                   | Steuerberatung und Datenschutz    | Etappe 8                        | Beratung 2027         |                       |
| **B11**                      | Paketpreise, Guthaben, Verfall, Rabatte                                                                       | Jannes und Steuerberatung         | Etappe 8                        | mit B9                |                       |
| **B10**                      | Automatisierte Progression: MDR-Grenze                                                                        | externe regulatorische Prüfung    | Etappe 9                        | mit B1 anfragen       |                       |
| **C6**                       | KI: Schutzumfang und Provider                                                                                 | Jannes und Prüfung nach ADR-002/005 | Etappe 10                     | Stufe 2               |                       |

Erledigt: A1 bis A4, B1 bis B4 architektonisch, C1 bis C5, C8, D
„finalisiert"/„nachvollziehbar", E1, E3 bis E5, E7, E9, E11 (mit STAFF-002).

---

## Definition of Done

**Je Story:** vertikaler Schnitt, Tests, Abnahmeschritte in `docs/abnahme/`,
Registereinträge (Skill-Schritt D), Oberflächen-Checkliste abgehakt
(`docs/abnahme/README.md`). **Je neue Tabelle zusätzlich:** Datenklasse und
Frist als `COMMENT`, Löschpfad in LOE-002, ein `test:db`-Fall, der die Löschung
dieser Klasse prüft.

**Je Epic:** Checks nach Skill-Schritt H · Roadmap nachgestellt · **von Jannes
binnen sieben Tagen abgenommen** (Datum in der Fortschrittstabelle) · Befunde
als erste Story in den nächsten Loop derselben Spur.

**Etappe 1 fertig:** M1 erreicht; der Ende-zu-Ende-Fall liegt als E2E-Test
hinter der Anmeldung.

**Etappen G und H fertig:** M2 und M3 erreicht; die 13 Positionen aus ADR-012
und die sieben Vorbedingungen aus ADR-007 sind je mit Fundstelle nachgewiesen.

---

## Credit-Budget

**Sitzungszuschnitt**

1. **Ein Loop = eine Session = ein Epic aus mehreren Stories.** Je Story ein
   Commit und die eng betroffenen Checks. Danach Session beenden.
2. **Stories so schneiden, dass jeder Diff am Stück lesbar bleibt.** Die
   vollständige Testsuite läuft einmal am Ende des Epics.
3. **Neues Thema = neue Session.** Rückfragen zum laufenden Loop in derselben.
4. **Ein aktiver Feature-Branch.** Docs-Sessions werden sofort gemergt; die
   sieben Merge-Commits vom 04.09. sollen sich nicht wiederholen.

**Leseverhalten**

5. **Diese Roadmap zuerst lesen**, dann den Abschnitt „Nächster Loop".
6. **Die im SPEC benannten ADRs vollständig** — mindestens alle, die der Loop
   berührt. Bei RLS, Löschung und Abrechnung sind das mehr als zwei; das ist
   kein Grund zu kürzen.
7. **Höchstens eine Ideenspeicher-Datei** je Loop, nach dem Index in
   `IDEENSPEICHER.md`.
8. **Keine Subagenten** außer bei echt breiter Suche über viele Dateien.

**Verifikation**

9. Während der Entwicklung nur die eng betroffenen Checks; die vollständige
   Runde **einmal** am Ende (Skill-Schritt H).
10. Keine identischen teuren Läufe ohne Änderung dazwischen.
11. `pnpm test:db` läuft auch in der Cloudumgebung und ist bei Migrationen und
    Policies das wichtigste Gate.
12. **Unabhängiger Zweitreview** in frischer Session bei RLS-Policies,
    `SECURITY DEFINER`, Löschung, Rechnungsausstellung und Nummernkreis
    (`DEVELOPMENT_WORKFLOW.md`).

**Rhythmus**

13. **Zwei Code-Loops je Woche** sind das Maß; einer ist in Ordnung, drei
    bedeuten zu kleine Schnitte.
14. Die wöchentliche Planungssession ist **absichtlich klein**.
15. **Monatsreview** (30 Minuten, letzter Freitag): Meilenstein-Ampel,
    Spur-B-Stand, Risiken, Rückwärtsplan des Folgemonats.

**Faustregel:** Wenn eine Session anfängt, das Projekt zu erkunden statt zu
arbeiten, fehlt ein Eintrag in dieser Roadmap.

### Modell und Aufwand je Aufgabe

Modell und Aufwandsstufe werden zu Sitzungsbeginn gewählt und nicht gewechselt.

| Aufgabe                                                        | Modell    | Aufwand  |
| -------------------------------------------------------------- | --------- | -------- |
| Migration, RLS-Policy, RPC, Berechtigungen                     | Opus 5    | `xhigh`  |
| Architekturentscheidung, ADR, Sicherheitsreview eines Diffs    | Opus 5    | `xhigh`  |
| Löschung und Retention (LOE-EPIC-001)                          | Opus 5    | `max`    |
| Rechnungsausstellung, Nummernkreis, Snapshot (ABR-EPIC-002a)   | Opus 5    | `xhigh` + Zweitreview |
| Fachlogik ohne bestehendes Muster                              | Opus 5    | `high`   |
| Unabhängiger Zweitreview                                       | Opus 5    | `xhigh`, frische Session |
| UI-Seite nach dem Muster vorhandener Seiten, UI-000, UX-EPIC-001 | Sonnet 5 | `medium` |
| Tests zu bereits geschriebenem Code ergänzen                   | Sonnet 5  | `medium` |
| Optimierungsrunde (`OPTIMIERUNG.md`), Formulierung, Doku       | Sonnet 5  | `medium` |
| Wöchentliche Planungssession                                   | Haiku 4.5 | —        |

---

## Wochenupdate

Auftrag für die wöchentliche Planungssession. Sie **baut nichts.**

1. `git log --since='8 days ago' --oneline` und diese Datei lesen. Sonst
   nichts. (Das Praxistagebuch liegt nach `OPTIMIERUNG.md` nicht im
   Repository; Jannes nennt Störungen der Woche selbst.)
2. Feststellen, welche Loops seit dem letzten Update abgehakt **und
   abgenommen** wurden.
3. Den Abschnitt „Nächster Loop" wiedergeben und prüfen, ob seine
   Voraussetzung aus Spur B vorliegt; sonst den Ersatz nennen.
4. Prüfen, ob ein Termin aus Spur B oder ein Meilenstein fällig oder
   überschritten ist.
5. Antwort in festem Format, höchstens zwölf Zeilen: _diese Woche ansteht ·
   Jannes entscheidet oder liefert (mit Datum) · hängt (Spur-B-Punkte über
   Termin) · Ampel M0 bis M5 mit je einem Wort Begründung_.

Die eingerichtete Routine (montags 07:50 Uhr) ist in `docs/DEVELOPMENT.md`
beschrieben; ihr Prompt wird auf dieses Format umgestellt `[E-10]`.

---

## Fortschritt

Abgehakt wird hier, mit Datum und Commit. Ein Loop gilt als **fertig**, wenn
Skill-Schritt I durchlaufen ist, und als **abgenommen**, wenn Jannes die
Abnahmeschritte aus `docs/abnahme/` durchlaufen hat.

| Loop                           | Status | Fertig am  | Commit                                          | Abgenommen am |
| ------------------------------ | ------ | ---------- | ----------------------------------------------- | ------------- |
| PAT-001 bis PAT-004            | fertig | vor 2026-09-01 | PAT-004: Merge PR #1                        |               |
| CAL-001 bis CAL-006            | fertig | vor 2026-09-01 | —                                           |               |
| STAFF-001                      | fertig | 2026-08-30 | `e70775a`, `ca907e9`                            |               |
| DOK-001                        | fertig | 2026-09-01 | `7e18906`, Merge PR #5                          |               |
| DOK-002                        | fertig | 2026-09-02 | `491a0c0`, Merge PR #5                          |               |
| DOK-003                        | fertig | 2026-09-05 | `21d85dd`, `f565124`                            |               |
| DOK-004                        | fertig | 2026-09-05 | `e931068`, `960f34f`                            |               |
| Planungsreview und Roadmap 2.0 | fertig | 2026-09-05 | Merge PR #13                                    | —             |
| Wettbewerbsanalyse, Review 2.1, Optimierungsmethode | fertig | 2026-09-06 | Branch `claude/roadmap-optimization-competitor-analysis-r3qxl7` | — |

---

## Änderungsvermerk

| Version | Datum      | Änderung                                                                                                                                                                                                                                                                                                 |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1     | Entwurf    | Zwei Zeitpunkte statt einem (Gate, Produktionsstart) · Meilensteine M0 bis M5 · Risiken · Kapazität kalibriert, März als Puffer, abgestufte Abweichungsregel · Kern und Komfort getrennt · Etappe H Einführung · MIG, OPS-007, BETRIEB-001, STAFF-004 · UI-000 und UX-EPIC-001 aus dem Produktreview · CAL-EPIC-003 und ABR-EPIC-002 geteilt · B12 bis B15 · Definition of Done · Fortschritt mit Abnahme-Spalte · Optimierungsrunden nach `OPTIMIERUNG.md` · Wochenupdate mit Ampel |
| 2.0     | 2026-09-05 | Drei Spuren, Zieltermin März 2027, Spur B mit Fälligkeiten                                                                                                                                                                                                                                              |
