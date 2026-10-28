# Providerprüfung Supabase (OPS-001)
Stand der Prüfung: 2026-09-21 · Katalog nach ADR-002 Punkt 3 und §3.5 · Roadmap G3 · mit B13, ADR-017
und [ADR-015](../adr/ADR-015-initial-technical-stack.md) Punkt 20

Arbeitsliste für den Vertragscheck durch Jannes und für B2; entschieden wird in
[ADR-002](../adr/ADR-002-hosting-data-residency.md). **Ergebnis: nicht bestanden und nicht
durchgefallen.** Der Proxy sperrt supabase.com: Jede Angabe ist ein **Hinweis** (Suchauszug oder
Drittquelle) oder **nicht belegt**, alles Vertragliche `CONTRACT_CONFIRMATION_REQUIRED`. Regel: nicht
raten. Recherchegang und Quellen: `git show 9452575:docs/decisions/providerpruefung-supabase.md`.

## Teil 1 — Katalog aus ADR-002 Punkt 3
| Nr. | Punkt | Befund (Hinweis) | Offen |
| --- | --- | --- | --- |
| 1 | AVV | DPA vom 1. August 2026 mit EU-Standardvertragsklauseln und UK-Addendum, gilt mit Annahme der Bedingungen; Vertragspartner Supabase, Inc. (USA), für den EWR Supabase Pte. Ltd. (Singapur) | Text, zeichnende Gesellschaft, erfasste Dienste; Vertreter nach Art. 27 DSGVO nicht belegt |
| 2 | §203 StGB | kein Treffer zu § 203 oder Berufsgeheimnis; die Verpflichtung nach §203 Abs. 4 StGB steht in keinem Standard-DPA | eigene Erklärung, wohl nur über den Vertrieb |
| 3 | Verschlüsselung | Datenbank ruhend AES-256 (Dateien, Indizes, WAL), unterwegs TLS | Objekte des Speichers: nicht belegt |
| 4 | Zugriffskontrolle | Kundenseite: Rollen, MFA; `service_role` hat `BYPASSRLS` und gehört nur auf den Server | Zugriff von Beschäftigten des Anbieters (ADR-010): nicht belegt |
| 5 | Retention, Löschung | Projektlöschung entfernt alles samt S3-Sicherungen; Sicherungen Pro 7, Team 14, Enterprise 30 Tage; PITR 7 bis 28 Tage | Frist und Nachweis, Replikate, eigene Sicherungen |
| 6 | Unterauftragnehmer | datierte Liste (20 Einträge am 2026-08-25, Drittquelle), darin AWS und Cloudflare | Verfahren bei Wechsel |

## Teil 2 — Objektspeicher (ADR-017)
| Nr. | Prüfpunkt | Befund (Hinweis) |
| --- | --- | --- |
| 1 | AVV deckt Storage, Auth und Edge Functions ausdrücklich | nicht belegt |
| 2 | Speicher, Region, Verschlüsselung der Objekte | S3 vom Anbieter verwaltet, Region des Projekts; Verschlüsselung nicht belegt |
| 3 | Löschung beim Anbieter | entwertet den CDN-Cache über alle Token binnen einer Minute, Purge ab Pro; Replikate, Sicherungen, Frist offen |
| 4 | Sicherung der Objekte | S3-Endpunkt `https://<ref>.supabase.co/storage/v1/s3`; seine Schlüssel sehen alle Buckets und umgehen RLS; Kosten nicht belegt |
| 5 | Signierte Verweise vor Ablauf entziehen | **nein**, nur über den Support; ein abgelaufenes Token leert den CDN-Eintrag nicht |

**Folge von Punkt 5:** Die 60 Sekunden aus ADR-017 Punkt 15 bleiben die einzige Grenze; sie trägt
`cacheControl: '0'` in [`src/features/patients/files/api.ts`](../../src/features/patients/files/api.ts)
(Vorgabe der Bibliothek: 3600). **Beides darf kein späterer Loop anfassen, ohne diesen Absatz zu lesen.**

## Teil 3 und 4 — Auth-Mails (B13), Edge Runtime (ADR-015 Punkt 20)
**Teil 3.** Der eingebaute Versand („not meant for production use“, 2 Mails je Stunde) stellt **nur
an Adressen des Projektteams** zu (zuerst zu verifizieren): keine Einladung, kein Zurücksetzen, auch
nicht über eine Edge Function (BEF-026, ANN-025). B13 seit 2026-10-10: eigener SMTP-Anbieter.

**Teil 4.** Funktionen laufen global; `x-region` oder `forceFunctionRegion` binden eine Region,
`x-sb-edge-region` nennt den Ort, ein ungültiger Wert leitet um, statt abzulehnen. **Gesperrt für
echte Gesundheitsdaten**, bis (1) der AVV die Edge Functions nennt, (2) die EU-Bindung nachweisbar ist
und ein abweichender Ort den Aufruf scheitern lässt, (3) die Logs ADR-011 Punkt 2 erfüllen, (4) die
Orte in der Unterauftragnehmerliste stehen. Bis dahin `mock` oder synthetische Daten (ADR-019 Punkt 15).

## Teil 5 — Umgebungen, Sicherung, Logs, Kosten
| Anforderung | Befund (Hinweis) | Folge |
| --- | --- | --- |
| EU-Region (ADR-015 Punkt 19) | `eu-central-1` (Frankfurt), bei der Anlage gewählt; Änderbarkeit nicht belegt | ins Anlage-Runbook (G3) |
| Dev, Test, Prod getrennt (ADR-002 Punkt 5) | Trennlinie ist das Projekt; Free: 2 aktive Projekte, Pause nach einer Woche | nicht im Free-Plan |
| RPO ≤ 1 Stunde (ADR-012 Punkt 1) | täglich gesichert; PITR (WAL alle zwei Minuten) als Zusatz auf Pro und Team | **PITR ist Bedingung** |
| RTO ≤ 4 Stunden | nicht belegt | im Restore-Test messen (OPS-003, G7) |
| Betriebslogs 30 Tage (ADR-011 Punkt 4) | Plattformlogs Free 1, Pro 7, Team 28, Enterprise 90 Tage | **Widerspruch unterhalb Enterprise**; Jannes entscheidet nach G3 |
| keine Patientendaten in Produktionslogs (ADR-002 Punkt 6) | Inhalt der Plattformlogs nicht belegt | OPS-004 (G6) |
| `pg_cron` (ANN-007, Risiko R9) | vorhanden, Fassung 1.6.4 | am angelegten Projekt bestätigen |
| Storage-API bewegt sich (ANN-052) | S3-Protokoll, Purge, eigener Hostname | `tests/e2e/authenticated/patient-file-access.spec.ts` regelmäßig gegen die Test-Umgebung |
| Kosten | Free 0 $, Pro 25 $, Team 599 $ im Monat, Rechenleistung ab 10 $ | Euro, Steuer, PITR, Ausgangsvolumen, S3-Zugang nicht belegt |

## Teil 7 — Wenn die Prüfung negativ ausfällt
Mitnehmbar: Schema, Migrationen, Policies, Funktionen (reines PostgreSQL in `pnpm test:db`; was
fehlt, steht in `supabase/tests/helpers/supabase-shim.sql`). Nicht mitnehmbar: die Anmeldung
(`auth.uid()` in jeder Policy) und die Dateiablage nach ADR-017 (`src/features/patients/files/api.ts`).

## Teil 8 — Gate-Liste vor Echtdaten
Gate aus Roadmap G3, ADR-017 und ADR-015 Punkt 20. **Keiner der Punkte blockiert die Entwicklung mit
synthetischen Daten; alle zusammen blockieren die erste echte Datei, die erste echte Adresse und den
Produktivstart.** Stand 2026-10-27: keiner erfüllt.

| Nr. | Gate-Punkt | Wer |
| --- | --- | --- |
| 1 | AVV-Text liegt vor, die zeichnende Gesellschaft ist benannt, er nennt Datenbank, Auth, Storage und Edge Functions (Teil 1 Nr. 1, Teil 2 Nr. 1) | Vertrag, mit B2 |
| 2 | Weisungsbindung nach Art. 28 Abs. 3 lit. a DSGVO im geltenden Text | Vertrag, mit B2 |
| 3 | **Verpflichtung nach §203 Abs. 4 StGB**, schriftlich oder als Klausel, die B2 als gleichwertig einstuft: der härteste Punkt und der einzige, dessen Scheitern den Anbieter kostet | Vertrag, mit B2 |
| 4 | Drittlandübermittlung bewertet (beide Gesellschaften in Drittländern, nach ADR-002 Punkt 2 kein Ausschluss): Standardvertragsklauseln, Transfer Impact Assessment, Vertreter nach Art. 27 DSGVO | Vertrag, mit B2 |
| 5 | Unterauftragnehmerliste vollständig, mit Verfahren bei Wechsel und den Orten der Edge Functions | Vertrag, mit B2 |
| 6 | Zugriff durch Beschäftigte des Anbieters beschrieben und begrenzt (Teil 1 Nr. 4, ADR-010) | Vertrag, mit B2 |
| 7 | Verschlüsselung der Storage-Objekte im Ruhezustand bestätigt, mit Region und Speicher | Support |
| 8 | Löschung beim Anbieter mit Frist, Replikaten und eigenen Sicherungen (Teil 1 Nr. 5, Teil 2 Nr. 3) | Support |
| 9 | `eu-central-1` für alle drei Umgebungen im Anlage-Runbook; PITR aktiv, sonst ist ADR-012 verfehlt | Support, Anlage |
| 10 | Logaufbewahrung: Widerspruch zu ADR-011 Punkt 4 aufgelöst, durch eine andere Frist oder einen Ausleitungsweg, der selbst diesen Katalog durchläuft (OPS-004) | Support, Jannes |
| 11 | B13: Der eigene SMTP-Anbieter ist ausgewählt und nach diesem Katalog geprüft (Teil 3) | Jannes |
| 12 | DSFA (ADR-007) und Verzeichnis der Verarbeitungstätigkeiten nennen Supabase mit allen vier Diensten; Wiedervorlage bei wesentlicher Änderung | Vorbedingung aus ADR-007 |

## Teil 9 — Unterlagen, die Jannes von einem ungeproxten Rechner lädt
Unter `https://supabase.com/`: `legal/dpa`, `legal/customer-resources/subprocessor-list`,
`downloads/docs/Supabase+TIA+250314.pdf`, `terms`, `privacy`, `security` (SOC-2 ab Team); unter
`docs/guides/`: `deployment/shared-responsibility-model`, `platform/backups`, `platform/delete-project`,
`platform/regions`, **zuerst** `auth/auth-smtp`, `functions/regional-invocation`,
`storage/cdn/purge-cdn-cache`, `storage/s3/authentication`. Zwei Fragen an den Support: Teil 1 Nr. 4
und Teil 2 Nr. 2.
