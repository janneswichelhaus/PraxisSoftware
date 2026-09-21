# Providerprüfung Supabase (OPS-001)

Stand: 2026-09-21 · Prüfkatalog nach ADR-002 Punkt 3 und `PROJECT_PRINCIPLES.md`
§3.5 · Roadmap G3 · schließt die Auth-Mails (B13), die fünf
Objektspeicher-Punkte aus [ADR-017](../adr/ADR-017-file-storage.md) und die
Edge-Runtime-Frage aus [ADR-015](../adr/ADR-015-initial-technical-stack.md)
Punkt 20 ein

Dieses Dokument hält fest, **was zu Supabase belegt ist, was nur als Hinweis
vorliegt und was vor der ersten echten Datei vertraglich zu bestätigen ist.**
Es trifft keine Entscheidung — die steht in
[ADR-002](../adr/ADR-002-hosting-data-residency.md), und den Vertrag zeichnet
Jannes. Es ist die Arbeitsliste für den Vertragscheck und für die
Datenschutzberatung (B2) und wird bei jeder Verifikation fortgeschrieben.

**Das Ergebnis vorweg: die Prüfung ist nicht bestanden, und sie ist auch nicht
durchgefallen.** Kein einziges Vertragsdokument war von hier aus lesbar. Was
sich ohne Vertragstext beantworten ließ, steht unten; was nur der Vertrag
beantwortet, steht in der Gate-Liste in Teil 8. Damit bleibt alles gesperrt,
was ADR-017, ADR-015 Punkt 20 und die Roadmap an ein positives OPS-001 gebunden
haben.

## Belegtiefe — wie die Einträge zu lesen sind

Die Recherche vom 2026-09-21 lief aus der Cloud-Entwicklungsumgebung. Deren
Egress-Proxy sperrt **supabase.com vollständig** — geprüft mit `curl`
(`connect_rejected`) und mit dem Abrufwerkzeug (`EGRESS_BLOCKED`); ebenso
gesperrt sind der Dokumentationsspiegel `supabase-supabase.mintlify.app` und
`registora.com`. **Keine einzige Seite des Anbieters wurde geöffnet.** Alles,
was unten steht, stammt aus Suchmaschinen-Auszügen der jeweils genannten Seite
oder aus Drittquellen. Der Wortlaut ist nirgends geprüft.

| Kennzeichen                          | Bedeutung                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **belegt (Primärquelle)**            | Seite tatsächlich abgerufen, Wortlaut zitierbar — **in dieser Prüfung: kein einziger Eintrag**           |
| **Hinweis (Suchauszug)**             | Auszug einer Seite des Anbieters aus der Suche; Seite nicht abgerufen. Plausibel, nicht zitierfähig      |
| **Hinweis (Drittquelle)**            | dasselbe, aber die Quelle ist nicht der Anbieter — Blog, Vergleichsseite, Fachbeitrag. Schwächer         |
| **`CONTRACT_CONFIRMATION_REQUIRED`** | nicht aus Anbieterquellen belegbar; vor Echtdaten gegen die geltenden Vertragsunterlagen zu verifizieren |
| **nicht belegt**                     | keine Quelle gefunden — weder Beleg noch Gegenbeleg                                                      |

Regel aus dem Auftrag, wie schon beim Kartendienst
([`providerpruefung-kartendienst.md`](providerpruefung-kartendienst.md)):
**nicht raten.** Ein Punkt ohne Quelle bleibt offen, auch wenn ein Auszug ihn
nahelegt.

## Wer der Vertragspartner ist

| Frage                | Was die Auszüge sagen                                                                                                                       | Belegtiefe                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Gesellschaft         | **Supabase, Inc.**, 548 Market St, San Francisco, CA 94104 (USA)                                                                              | Hinweis (Drittquelle)                             |
| Gesellschaft für EWR | Für EWR, Vereinigtes Königreich und Schweiz nennen die Datenschutzangaben **Supabase Pte. Ltd.** — eine Gesellschaft mit Sitz in **Singapur** | Hinweis (Suchauszug) · `CONTRACT_CONFIRMATION_REQUIRED` |
| Kontakt Datenschutz  | `privacy@supabase.com`; als Grievance Officer benannt: General Counsel von Supabase, Inc.                                                    | Hinweis (Drittquelle)                             |
| Vertreter nach Art. 27 DSGVO | **nicht belegt** — kein Name, keine Anschrift gefunden                                                                              | nicht belegt                                      |

**Einordnung.** Beide genannten Gesellschaften sitzen in Drittländern. Das ist
nach ADR-002 Punkt 2 **kein Ausschlussgrund** — geprüft wird die tatsächliche
Verarbeitung, nicht der Firmensitz —, verschiebt aber das Gewicht: Ohne
EU-Gesellschaft als Vertragspartnerin tragen Standardvertragsklauseln und
Transferfolgenabschätzung die Zulässigkeit, und die Frage nach §203 StGB wird
schwerer, nicht leichter. Welche Gesellschaft den AVV zeichnet, ist die erste
Frage des Vertragschecks. Ein **Transfer Impact Assessment** existiert
offenbar als eigenes Dokument (`supabase.com/downloads/docs/Supabase+TIA+250314.pdf`,
Hinweis) — es gehört zu den Unterlagen in Teil 9.

## Teil 1 — Der Katalog aus ADR-002 Punkt 3

Sechs Punkte, für Supabase als **Plattform**: Datenbank, Auth, Objektspeicher
und Edge Runtime in einem Vertrag.

| Nr. | Punkt              | Ergebnis                                                                                                                                                                                                                                                                                                                                                                                       | Belegtiefe                                              |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | AVV / DPA          | Ein **Data Processing Addendum** liegt unter `supabase.com/legal/dpa` und `…/legal/customer-resources/data-processing-addendum`; Auszug: Fassung 1 vom 1. August 2026, veröffentlicht am 7. August 2026. Es bindet laut Auszug **mit der Annahme der Bedingungen** ein; es bezieht die **EU-Standardvertragsklauseln** und das UK-Addendum ein. Eine Klausel 3.3 untersagt Verkauf, Weitergabe für kontextübergreifende Werbung und Zusammenführung mit anderen Daten. | Hinweis (Suchauszug) · `CONTRACT_CONFIRMATION_REQUIRED` |
| 2   | Eignung §203 StGB  | **Kein Treffer** für „§ 203", „Berufsgeheimnis" oder „professional secrecy" auf einer Supabase-Domain — derselbe Befund wie bei PTV. Die deutsche Fachliteratur ist eindeutig: Neben der Vertraulichkeitspflicht nach Art. 28 Abs. 3 lit. b DSGVO braucht es die **gesonderte Verpflichtung nach §203 Abs. 4 StGB**; sie steht in keinem Standard-DPA. Supabase ist ein Selbstbedienungsangebot ohne Vertragsverhandlung — eine individuelle Verpflichtungserklärung ist voraussichtlich nur über den Vertrieb erreichbar. | nicht belegt · `CONTRACT_CONFIRMATION_REQUIRED`         |
| 3   | Verschlüsselung    | Ruhend **AES-256** für Datenbankdateien, Indizes und WAL, Schlüsselverwaltung über die Infrastruktur des Cloudanbieters; unterwegs TLS; Zugangstoken zusätzlich auf Anwendungsebene verschlüsselt. **Für die Objekte des Speichers sagt kein Auszug etwas** — siehe Teil 2 Punkt 2.                                                                                                        | Datenbank: Hinweis (Suchauszug) · Objekte: nicht belegt |
| 4   | Zugriffskontrolle  | Auf unserer Seite belegt genug: Rollen je Organisation und Projekt, projektgebundene Mitgliedschaften, MFA; `service_role` hat `BYPASSRLS` und gehört ausschließlich auf den Server. **Auf der Anbieterseite: nicht belegt.** Es wurde keine Aussage gefunden, ob und unter welchen Bedingungen Beschäftigte des Anbieters auf Projektdaten zugreifen können, und kein vom Kunden schaltbarer Support-Zugang. Das ist der Punkt, an dem ADR-010 (privilegierter Produktionszugriff) hängt. | Kundenseite: Hinweis (Suchauszug) · Anbieterseite: **nicht belegt** · `CONTRACT_CONFIRMATION_REQUIRED` |
| 5   | Retention, Löschung | Beim **Löschen eines Projekts** werden laut Auszug alle zugehörigen Daten dauerhaft entfernt, „einschließlich aller in S3 abgelegten Sicherungen". Aufbewahrung der täglichen Sicherungen: Pro 7, Team 14, Enterprise 30 Tage; PITR standardmäßig 7, wählbar bis 28 Tage. Plattformlogs: Free 1, Pro 7, Team 28, Enterprise 90 Tage. **Keine Aussage** zu Frist und Nachweis der tatsächlichen Löschung, zu Replikaten und zu anbietereigenen Sicherungen außerhalb der genannten. | Hinweis (Suchauszug/Drittquelle) · `CONTRACT_CONFIRMATION_REQUIRED` |
| 6   | Unterauftragnehmer | Eine **Unterauftragnehmerliste** wird als datiertes PDF geführt (`…/legal/customer-resources/subprocessor-list`); eine Drittquelle, die solche Listen täglich abgreift, zählte am 25. August 2026 **20 Einträge**. Aus den Auszügen ableitbar: **AWS** als Infrastruktur (Projekte laufen auf AWS), **Cloudflare** in der Auslieferungskette. Das Verfahren bei Wechsel — Ankündigungsfrist, Widerspruch, Sonderkündigung — ist **nicht belegt**. | Hinweis (Suchauszug/Drittquelle) · `CONTRACT_CONFIRMATION_REQUIRED` |

## Teil 2 — Die fünf Objektspeicher-Punkte aus ADR-017

ADR-017 hat sie benannt, damit OPS-001 sie mitprüfen kann; alle fünf sind laut
ADR **aus Verträgen zu belegen**, nicht aus Dokumentation.

| # | Prüfpunkt                                                          | Ergebnis                                                                                                                                                                                                                                                                                                | Belegtiefe                                              |
| - | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1 | Deckt der AVV die **Storage-Objekte** ausdrücklich mit ab?         | **Nicht belegt.** Der DPA-Text war nicht lesbar; ob er die Dienste einzeln nennt oder pauschal auf „the Services" verweist, ist ohne ihn nicht zu sagen. Dieselbe Frage stellt sich für Auth und Edge Functions.                                                                                       | nicht belegt · `CONTRACT_CONFIRMATION_REQUIRED`         |
| 2 | **Unterauftragskette** des Objektspeichers: welcher Speicher, welche Region, welche Verschlüsselung im Ruhezustand? | Auszüge stützen die Vermutung aus ADR-017: Im gehosteten Betrieb verwaltet Supabase den S3-Speicher selbst, und die Löschseite spricht von „backups stored in S3". Die **Projektregion** bestimmt laut Auszug Primärdaten und native Sicherungen. Zur **Verschlüsselung der Objekte im Ruhezustand: keine Aussage** — die AES-256-Zusage betrifft die Datenbank. | Hinweis (Suchauszug) · Verschlüsselung: **nicht belegt** · `CONTRACT_CONFIRMATION_REQUIRED` |
| 3 | **Löschung beim Anbieter**: wann ist ein Objekt wirklich weg?      | Teilantwort, und eine gute: Das Löschen eines Objekts macht laut Auszug **alle zwischengespeicherten Einträge dieses Objekts über alle Token hinweg ungültig**; die Ausbreitung dauert bis zu einer Minute. Eine Purge-Schnittstelle gibt es ab dem Pro-Plan. Offen bleiben Replikate, anbietereigene Sicherungen des Objektspeichers und eine zugesagte Frist. | Hinweis (Suchauszug) · Rest `CONTRACT_CONFIRMATION_REQUIRED` |
| 4 | **Sicherung der Objekte**: S3-kompatibler Zugang, Kosten, Ziel?    | **Ja, technisch vorhanden.** Ein S3-Protokoll-Endpunkt liegt unter `https://<ref>.supabase.co/storage/v1/s3` (alternativ `<ref>.storage.supabase.co`); Zugangsschlüsselpaare erzeugt das Dashboard unter Storage → S3 Configuration. **Preis dieses Weges:** Die Schlüssel haben laut Auszug vollen Zugriff auf **alle** Buckets und umgehen RLS — ein zweites `service_role`, nur für Dateien. Kosten und Ausgangsvolumen: **nicht belegt**. | Hinweis (Suchauszug) · Kosten: nicht belegt             |
| 5 | **Signierte Verweise**: Entzug vor Ablauf ohne Support?            | **Nein.** Auszug: Signierte Verweise bleiben bis zum Ablauf gültig, unabhängig von Schlüsselwechseln; „If you need to revoke signed URLs, contact Supabase support." Verschärfend: Ein abgelaufenes oder entzogenes Token **leert den CDN-Eintrag nicht** — eine zwischengespeicherte Antwort kann für denselben Verweis weiter ausgeliefert werden, bis die Cache-Dauer endet. | Hinweis (Suchauszug) · `CONTRACT_CONFIRMATION_REQUIRED` |

**Was Punkt 5 für den gebauten Stand bedeutet — und zwar sofort.** ADR-017 hatte
für den positiven Fall vorgesehen, den Entzug als *zusätzliches* Werkzeug
aufzunehmen. Der Fall tritt nicht ein. Damit bleibt die Gültigkeit von **60
Sekunden** (ADR-017 Punkt 15) die einzige Grenze, und die Zeile
`cacheControl: '0'` in [`src/features/files/api.ts`](../../src/features/files/api.ts)
ist keine Feinheit, sondern das, was diese Grenze überhaupt trägt: Der
Vorgabewert der Bibliothek ist 3600. Der Kommentar an dieser Stelle hat das
vorweggenommen; diese Prüfung bestätigt es aus der Anbieterseite. **Beides darf
kein späterer Loop anfassen, ohne diesen Absatz zu lesen.**

## Teil 3 — Auth-Mails (B13)

B13 ist am 2026-09-06 entschieden: **nur die Auth-Mails des Providers, kein
zweiter Dienst.** Der Prüfauftrag war, diese Mails in OPS-001 mitzuprüfen. Das
Ergebnis widerspricht der Entscheidung.

| Punkt                          | Was die Auszüge sagen                                                                                                                                                             | Belegtiefe            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Zweck des eingebauten Versands | Ein SMTP-Server liegt bei jedem Projekt, **„not meant for production use"** — gedacht zum Erkunden und Einrichten der Vorlagen                                                     | Hinweis (Suchauszug)  |
| Mengengrenze                   | **2 Mails je Stunde**                                                                                                                                                              | Hinweis (Suchauszug)  |
| Empfängerkreis                 | **Nur vorautorisierte Adressen**: Ohne eigenen SMTP-Server verweigert Supabase Auth die Zustellung an Adressen, die nicht zum **Team des Projekts** gehören                       | Hinweis (Suchauszug)  |
| Mit eigenem SMTP               | Grenze steigt auf 30 neue Nutzer je Stunde, einstellbar; genannte Anbieter sind Dritte (Resend, SendGrid, Postmark, AWS SES)                                                       | Hinweis (Suchauszug)  |

**Einordnung.** Fällt der Empfängerkreis so aus, wie der Auszug ihn beschreibt,
ist B13 **im Produktivbetrieb nicht einlösbar**: Eine angestellte Person, die
kein Mitglied des Supabase-Projekts ist, bekäme weder eine Einladung noch eine
Mail zum Zurücksetzen des Passworts. Das trifft STAFF-004 (Passwort vergessen
als Selbstbedienung, Roadmap G2) im Kern und bestätigt von der anderen Seite,
was ANN-025 schon für die Anlage von Konten festhält.

Es bleiben genau zwei Wege, und beide gehören Jannes: **(a)** ein eigener
SMTP-Anbieter — dann ein zweiter Auftragsverarbeiter mit eigener Prüfung nach
diesem Katalog, eigenem ADR und Rücknahme von B13; oder **(b)** kein
Mailversand — Zugänge und Zurücksetzen bleiben ein Handgriff in der Praxis,
wie ANN-025 ihn beschreibt, und STAFF-004 fällt auf diesen Weg zurück. Eine
dritte Möglichkeit ist nicht erkennbar. Festgehalten als **BEF-026**; die
Entscheidung gehört zur Vorlage von B13, nicht in dieses Dokument.

**Zuerst zu verifizieren ist der Empfängerkreis** — an ihm allein hängt, ob
überhaupt etwas zu entscheiden ist.

## Teil 4 — Edge Runtime (ADR-015 Punkt 20, Gate-Punkt 8 des Kartendienstes)

ADR-015 Punkt 20 hat die Edge Functions ausdrücklich **nicht** für produktive
Gesundheitsdaten freigegeben und eine Datenfluss- und Providerprüfung verlangt.
Hier ist sie.

| Punkt                | Was die Auszüge sagen                                                                                                                                                                                                                | Belegtiefe           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Vorgabeverhalten     | Funktionen laufen **global verteilt** über mehr als 30 Rechenzentren; ein API-Gateway bestimmt aus der **IP-Adresse des Aufrufers** den nächstgelegenen Ort. Eine Regionswahl war ausdrücklich nicht vorgesehen                        | Hinweis (Suchauszug) |
| Bindung an eine Region | **Möglich**: „Regional Invocations" — Kopfzeile `x-region` oder, wo Kopfzeilen nicht setzbar sind, der Abfrageparameter `forceFunctionRegion`. Die Antwort trägt den tatsächlichen Ort in `x-sb-edge-region`                        | Hinweis (Suchauszug) |
| Fehlerfall           | Ein **ungültiger** Wert in `x-region` führt laut Fehlerbericht **zur Umleitung in eine verfügbare Region** — nicht zur Ablehnung                                                                                                     | Hinweis (Drittquelle) |
| Vertragliche Deckung | Ob der DPA die Edge Functions nennt: **nicht belegt** (Teil 2 Punkt 1). Ob die Ausführungsorte in der Unterauftragnehmerliste stehen: **nicht belegt**                                                                                | nicht belegt         |

**Ergebnis: Die Edge Runtime bleibt für echte Gesundheitsdaten gesperrt** —
aber die Sperre hat jetzt eine Bedingung statt eines Fragezeichens. Was sie löst:

1. der AVV deckt die Edge Functions ausdrücklich;
2. die Bindung an eine EU-Region ist **nachweisbar** — geprüft wird sie an
   `x-sb-edge-region` in der Antwort, und ein abweichender Ort muss **den
   Aufruf scheitern lassen**, nicht ihn stillschweigend ausführen; eine
   Kopfzeile, die im Fehlerfall umgeleitet wird, ist für sich keine Zusage;
3. die Logs der Funktion erfüllen ADR-011 Punkt 2 (siehe Teil 5);
4. die Ausführungsorte stehen in der Unterauftragnehmerliste.

**Was das für MAP-004 heißt: nichts Neues und keine Blockade.** ADR-019 Punkt
15 erlaubt bis zu dieser Prüfung `mock`-Adapter oder synthetische Koordinaten —
genau das, worauf MAP-003 lokal läuft. Die Prüfung ist geführt, ihr Ergebnis ist
„noch nicht freigegeben, Bedingungen benannt", und MAP-004 arbeitet unter
denselben Bedingungen weiter wie MAP-003. Gesperrt bleibt **MAP-006**, also der
erste Lauf mit echten Adressen.

## Teil 5 — Umgebungen, Sicherung, Logs, technische Annahmen

| Anforderung                                                    | Was die Auszüge sagen                                                                                                                                                                                                              | Bewertung                                                                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **EU-Region** (ADR-015 Punkt 19)                               | `eu-central-1` (Frankfurt) wird angeboten; die bei der Anlage gewählte Region bestimmt Primärdaten und native Sicherungen. Ob sie später änderbar ist: **nicht belegt**                                                            | erfüllbar; die Regionswahl ist eine **Tür, die sich einmal öffnet** — sie gehört in das Anlage-Runbook (G3, Oktober)                   |
| **Dev, Test, Prod getrennt** (ADR-002 Punkt 5)                 | Die Trennlinie ist das Projekt. Der Free-Plan erlaubt 2 aktive Projekte je Organisation und **pausiert nach einer Woche Untätigkeit**                                                                                               | erfüllbar, aber **nicht im Free-Plan**: Eine pausierende Testumgebung ist keine                                                        |
| **RPO ≤ 1 Stunde** (ADR-012 Punkt 1)                           | Tägliche Sicherungen; **PITR** sichert WAL-Dateien in Abständen von zwei Minuten und ist ein nutzungsabhängiger Zusatz auf Pro und Team                                                                                             | **Tägliche Sicherungen genügen nicht** (bis zu 24 Stunden Verlust). **PITR ist damit keine Option, sondern die Bedingung für ADR-012** |
| **RTO ≤ 4 Stunden** (ADR-012 Punkt 1)                          | Zur Dauer einer Wiederherstellung sagt kein Auszug etwas                                                                                                                                                                            | **nicht belegt** — nur messbar, nicht belegbar: gehört in den Restore-Test OPS-003 (G7)                                               |
| **Operational Logs 30 Tage** (ADR-011 Punkt 4)                 | Plattformlogs: Free 1, Pro 7, Team 28, Enterprise 90 Tage                                                                                                                                                                          | **Widerspruch unterhalb von Enterprise.** Kein Plan bis Team erreicht 30 Tage; Team verfehlt sie um zwei                              |
| **Keine Patientendaten in Produktionslogs** (ADR-002 Punkt 6)  | Was der Anbieter selbst in seinen Plattformlogs führt (Gateway, Postgres, Edge Functions), ist **nicht belegt**                                                                                                                     | offen; gehört mit der Zeile darüber zu **OPS-004** (G6)                                                                               |
| **`pg_cron`** (ANN-007, Risiko R9)                             | Auf der gehosteten Plattform vorhanden, Fassung 1.6.4; legt ein `cron`-Schema an, Aufträge in `cron.job`, zusammen mit `pg_net` auch für Edge Functions                                                                             | **Risiko R9 entschärft**, nicht geschlossen: am angelegten Projekt zu bestätigen                                                      |
| **Storage-API bewegt sich** (ANN-052)                          | Allein in dieser Recherche: S3-Protokoll, Purge-Schnittstelle, eigener Speicher-Hostname                                                                                                                                           | Die Roadmap-Regel bleibt richtig: `tests/e2e/authenticated/patient-file-access.spec.ts` regelmäßig gegen Staging                       |

**Zum Gesundheitsdaten-Angebot des Anbieters.** Supabase bietet für
US-Recht einen HIPAA-Zusatz: Er setzt laut Auszügen mindestens den
**Team-Plan** und eine gezeichnete Vereinbarung voraus und schaltet für ein
Projekt zusätzliche Prüfungen frei (MFA erzwungen, PITR, TLS-Erzwingung,
Netzbeschränkungen). **Für uns ist das kein Rechtsinstrument** — HIPAA gilt
hier nicht, und die DSGVO kennt keinen Plan-Zuschnitt. Zwei Dinge sagt es
trotzdem: Der Anbieter selbst legt die Schwelle für Gesundheitsdaten bei einem
Plan von 599 $ im Monat, und die vier technischen Bedingungen sind unabhängig
davon eine brauchbare Liste für unser eigenes Projekt.

## Teil 6 — Kosten, soweit belegbar

Nur, was Auszüge hergeben. **Keine Schätzungen, keine Hochrechnung.**

| Frage                                     | Antwort                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Öffentlich genannte Pläne                 | Free 0 $, **Pro 25 $/Monat**, **Team 599 $/Monat**, Enterprise auf Anfrage. Ob Pro je Organisation oder je Projekt abgerechnet wird, sagen die Auszüge **widersprüchlich** — beides steht da. Rechenleistung getrennt ab 10 $/Monat (Micro)     |
| Was der Free-Plan nicht trägt             | Drei Umgebungen (2 aktive Projekte, Pause nach einer Woche), PITR, die Purge-Schnittstelle des CDN, Logaufbewahrung über einen Tag                                                                                                                |
| Was ADR-012 erzwingt                      | **PITR**, ein nutzungsabhängiger Zusatz auf Pro und Team — ohne ihn ist RPO ≤ 1 Stunde nicht erreichbar                                                                                                                                         |
| Keine belastbare Information              | Beträge in **Euro**, Umsatzsteuerbehandlung, Preis von PITR und Ausgangsvolumen, Preis des S3-Zugangs aus Teil 2 Punkt 4                                                                                                                         |

Keine einzige Zahl stammt von einer abgerufenen Seite des Anbieters. Sie stehen
hier als Größenordnung für die Entscheidung, nicht als Grundlage einer Rechnung.

## Teil 7 — Wenn die Prüfung negativ ausfällt

ADR-002 Punkt 4 legt keinen Anbieter fest, und die Roadmap nennt für den
negativen Fall ausdrücklich eine Alternative. Was ein Wechsel kostet, hängt an
drei Nähten — sie zu benennen ist Teil dieser Prüfung, die Auswahl ist es nicht:

- **Mitnehmbar ist der größte Teil:** Schema, Migrationen, RLS-Policies,
  Trigger und Funktionen sind gewöhnliches PostgreSQL. Sie laufen im Gate
  `pnpm test:db` bereits gegen ein nacktes PostgreSQL ohne Supabase.
- **Nicht mitnehmbar ist die Anmeldung:** Supabase Auth prägt Sitzungsmodell,
  `auth.uid()` und damit jede Policy. Der Ersatz ist ein eigenes Epic.
- **Nicht mitnehmbar ist die Dateiablage:** Objektschlüssel, signierte Verweise
  und die Zwei-Phasen-Übergabe aus ADR-017 sind an diese Schnittstelle gebaut.
  Der Vertrag in `src/features/files/api.ts` ist die Stelle, an der ein Wechsel
  ansetzen würde.

Ein zweiter Kandidat wird hier **nicht** benannt: Das wäre eine
Anbieterentscheidung, und die gehört nach ADR-002 in einen eigenen Prüfvorgang
mit diesem Katalog.

## Teil 8 — Was vor Echtdaten offen bleibt (Gate-Liste)

Dies ist das Gate aus Roadmap G3, ADR-017 und ADR-015 Punkt 20. **Keiner dieser
Punkte blockiert die weitere Entwicklung mit synthetischen Daten. Alle
zusammen blockieren die erste echte Datei, die erste echte Adresse und den
Produktivstart.**

1. **AVV-Text liegt vor**, zeichnende Gesellschaft ist benannt, und er nennt
   **Datenbank, Auth, Storage und Edge Functions** (Teil 1 Nr. 1, Teil 2 Nr. 1).
2. **Weisungsbindung nach Art. 28 Abs. 3 lit. a DSGVO** im geltenden Text.
3. **Verpflichtung nach §203 Abs. 4 StGB** — schriftlich oder eine Klausel, die
   die Datenschutzberatung (B2) als gleichwertig einstuft. **Der härteste
   Punkt**, und der einzige, dessen Scheitern den Anbieter kostet.
4. **Drittlandübermittlung** bewertet: Standardvertragsklauseln, Transfer
   Impact Assessment, Vertreter nach Art. 27 DSGVO (B2).
5. **Unterauftragnehmerliste** vollständig, mit Verfahren bei Wechsel; die
   Ausführungsorte der Edge Functions sind darin enthalten (Teil 1 Nr. 6).
6. **Zugriff durch Beschäftigte des Anbieters** beschrieben und begrenzt —
   ohne diese Auskunft ist ADR-010 nicht erfüllbar (Teil 1 Nr. 4).
7. **Verschlüsselung der Storage-Objekte im Ruhezustand** bestätigt, mit
   Region und darunterliegendem Speicher (Teil 2 Nr. 2).
8. **Löschung beim Anbieter** mit Frist, Replikaten und anbietereigenen
   Sicherungen (Teil 1 Nr. 5, Teil 2 Nr. 3).
9. **EU-Region `eu-central-1`** für alle drei Umgebungen, festgehalten im
   Anlage-Runbook; **PITR** aktiv, sonst ist ADR-012 nicht erfüllt.
10. **Logaufbewahrung**: der Widerspruch zu ADR-011 Punkt 4 ist aufgelöst —
    entweder ist die Frist eine andere oder es gibt einen Ausleitungsweg, und
    der ist dann selbst eine Verarbeitung mit diesem Katalog (OPS-004).
11. **B13 entschieden** in der Fassung, die Teil 3 erzwingt — mit eigenem
    SMTP-Anbieter samt Prüfung oder ohne Mailversand (BEF-026).
12. **DSFA** (ADR-007) und Verzeichnis der Verarbeitungstätigkeiten nennen
    Supabase mit allen vier Diensten; Wiedervorlage bei wesentlicher Änderung.

Die Punkte 1 bis 6 sind Vertragsarbeit und gehen zusammen mit der
Kartendienst-Liste an B2. Die Punkte 7 bis 10 sind Anbieterauskünfte, die der
Support beantworten kann. Punkt 11 ist eine Entscheidung von Jannes, Punkt 12
die Vorbedingung aus ADR-007.

## Teil 9 — Was Jannes von einem ungeproxten Rechner laden und ablegen sollte

Ohne diese Unterlagen bleibt jede Zeile oben ein Suchauszug.

- `https://supabase.com/legal/dpa` — Data Processing Addendum, vollständig
- `https://supabase.com/legal/customer-resources/subprocessor-list` — datierte
  Unterauftragnehmerliste
- `https://supabase.com/downloads/docs/Supabase+TIA+250314.pdf` — Transfer
  Impact Assessment
- `https://supabase.com/terms`, `https://supabase.com/privacy` — Bedingungen
  und Datenschutzerklärung, mit der Angabe der zeichnenden Gesellschaft
- `https://supabase.com/security` — Sicherheitsangaben, Verschlüsselung,
  SOC-2-Bericht (Zugang laut Auszug nur mit Team- oder Enterprise-Plan)
- `https://supabase.com/docs/guides/deployment/shared-responsibility-model` —
  wer was verantwortet
- `https://supabase.com/docs/guides/platform/backups`,
  `…/platform/delete-project`, `…/platform/regions` — Sicherung, Löschung, Region
- `https://supabase.com/docs/guides/auth/auth-smtp` — **zuerst**: der
  Empfängerkreis des eingebauten Versands (Teil 3)
- `https://supabase.com/docs/guides/functions/regional-invocation` — Bindung
  an eine Region und ihr Verhalten im Fehlerfall
- `https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache`,
  `…/storage/s3/authentication` — CDN-Purge und S3-Zugang

Dazu die zwei Fragen an den Support, die kein Dokument beantwortet: **Zugriff
durch Beschäftigte** (Teil 1 Nr. 4) und **Verschlüsselung der Objekte im
Ruhezustand** (Teil 2 Nr. 2).
