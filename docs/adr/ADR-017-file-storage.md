# ADR-017: Dateiablage — Ort, Zugriff, kurzlebige Verweise, Aufbewahrung, Virenprüfung

## Status

**Vorgeschlagen** — Bestätigung durch Jannes ausstehend (Fragen am Ende).

Dieser ADR **legt keine Datei an und gibt keinen produktiven Speicher frei.**
Er legt fest, wie eine Datei in dieser Anwendung entsteht, wer sie sieht, wie
sie ausgeliefert wird, wann sie verschwindet und was vorher geprüft sein muss.
Die produktive Geltung hängt zusätzlich an **OPS-001**, der Providerprüfung für
Supabase nach ADR-002 (Roadmap G1: „Erst nach positivem OPS-001"). Warum der
ADR trotzdem jetzt geschrieben wird, steht im Kontext.

## Datum

2026-09-12

## Kontext

Punkt **E8** in `docs/decisions/OPEN_DECISIONS.md` ist seit dem 2026-09-05 als
ADR-017 beauftragt und seitdem offen. Er blockiert nicht abstrakt, sondern
konkret: **DAT-EPIC-001** (Bucket, Berechtigungen, signierte Verweise,
Datenklasse, Audit; Roadmap G4) ist der nächste Loop und kann ohne diese
Entscheidung nicht sinnvoll beginnen. **VER-004** (Verordnungsscan am Rezept)
wartet seit dem 2026-09-07 — die Migration `20260907110000_prescriptions.sql`
führt ihn im Kopfkommentar ausdrücklich als „braucht ADR-017". **ABR-003b**
(Rechnungs-PDF, Roadmap Nov 2026) braucht ihn ebenfalls: ADR-009 Punkt 9
verlangt, dass eine ausgestellte Rechnung unveränderbar ist, und B14 hält fest,
dass ein Browser-Druck genau das nicht leisten kann, weil die Anwendung die
erzeugte Datei nie zu sehen bekommt.

Vorgegeben ist die Richtung bereits an drei Stellen:

- **ADR-015 Punkt 10** wählt **Supabase Storage** als Dateiablage — ohne eine
  einzige Regel dazu. Derselbe ADR führt als offene Folgefrage: „Wie verhält
  sich Supabase Storage zu den Anforderungen aus §12 (Dateizugriffe) und
  ADR-008 (Retention von Dateien)?" Diese Frage wird hier beantwortet.
- **§4.7 und ADR-004 Punkt 6** stellen Dateien ausdrücklich mit Suche, Exporten
  und späteren KI-Funktionen in eine Reihe: Sie **müssen dieselben
  Berechtigungsregeln respektieren**. ADR-004 nennt sie zugleich den
  „wahrscheinlichsten Umgehungsweg des Modells". **§12** führt „Dateizugriffe"
  in der Liste der besonders kritischen, testpflichtigen Funktionen.
- **ADR-008** verlangt für jede fachliche Entität eine Datenklasse mit Frist
  und stellt selbst die offene Folgefrage, wie Dateien zu behandeln sind, die
  in mehreren Kontexten referenziert sind. **ADR-012 Punkt 5** sagt in einem
  Satz, was dieser ADR ausbuchstabieren muss: „Datei- und Objektspeicher
  benötigt eine eigenständige Backup- und Versionierungsstrategie."

**Warum der ADR vor OPS-001 geschrieben wird.** Die Roadmap bindet ihn an ein
positives Ergebnis der Providerprüfung (G1), und Risiko R2 sagt dasselbe noch
einmal. Das ist richtig für die **Freigabe**, nicht für den **Text**: Supabase
Storage ist kein neuer Dienstleister, sondern derselbe Anbieter, dasselbe
Projekt, derselbe Vertrag und dieselbe Unterauftragskette wie die Datenbank,
die ADR-015 bereits gewählt hat. Es entsteht also kein zweiter Prüfvorgang nach
ADR-002 Punkt 3, sondern ein **Satz zusätzlicher Prüfpunkte für OPS-001** — und
den kann OPS-001 nur mitprüfen, wenn er vorher benannt ist. Fällt OPS-001
negativ aus, fällt mit der Datenbank auch die Ablage; die Regeln dieses ADR
(Datenbank führt, kurzlebige Verweise, Rollenschnitt an der Dokumentart,
zweistufige Löschung) gelten dann für den Nachfolger genauso, weil keine von
ihnen an einem Anbieterdetail hängt. Diese Reihenfolge ist damit die
umkehrbarere von beiden (§16).

**Recherchelage.** `supabase.com` ist aus der Cloud-Entwicklungsumgebung durch
den Egress-Proxy gesperrt — wie schon bei ADR-019. Belegbar war die
**Dokumentation im Quelltext** (`raw.githubusercontent.com`, Repository
`supabase/supabase`, Verzeichnis `apps/docs/content/guides/`) und der
**Quelltext der Client-Bibliothek** (`supabase/storage-js`). Beides ist die
Quelle der veröffentlichten Seiten, nicht deren Nacherzählung. Aussagen aus
Community-Diskussionen und Suchauszügen sind unten als solche gekennzeichnet
und gehören in den Prüfkatalog von OPS-001, nicht in diese Entscheidung.

## Entscheidung

### A. Ort, Abgrenzung, Anbieter

1. **Dateien liegen in Supabase Storage desselben Projekts wie die Datenbank**,
   in derselben ausdrücklich freigegebenen EU-Region (ADR-015 Punkt 10 und 19).
   Kein zweiter Anbieter, kein fremdes CDN, **kein öffentlicher Bucket** —
   auch nicht „nur für ein Logo".
2. **Storage ist kein neuer Dienstleister** und bekommt deshalb keine eigene
   Providerprüfung, sondern **fünf zusätzliche Punkte im Katalog von OPS-001**
   (Abschnitt „Was OPS-001 zusätzlich prüfen muss"). **Bis OPS-001 positiv
   dokumentiert ist, entsteht kein produktiver Bucket und wird keine Datei mit
   Personenbezug hochgeladen** (ADR-015 Punkt 18, Roadmap G1).
3. **Ein privater Bucket je Datenklasse**, angelegt erst mit der ersten Datei
   dieser Klasse — nicht auf Vorrat (ADR-014, §14). Für DAT-EPIC-001 ist das
   genau einer: `patientenakte`. Der Bucket für Abrechnungsbelege entsteht mit
   ABR-EPIC-002b. Getrennt wird nach Datenklasse, weil Frist, Löschweg und
   Rollenschnitt an ihr hängen und nicht an der Datei.
4. **Anwendungsdateien gehören nicht in die Ablage.** Wortmarke und App-Symbole
   werden als byte-gleiche Kopien aus `marke/` über `public/marke/`
   ausgeliefert (MARKE-001, `src/marke.test.ts`). Die Ablage ist für Dokumente
   der Praxis und ihrer Patient:innen da.
5. **Objektschlüssel tragen nur Kennungen:**
   `<organization_id>/<bezugsdatensatz_id>/<datei_id>` — ohne Dateiendung, ohne
   Namen, ohne Datum, ohne Dokumenttitel. Der Anzeigename steht in der
   Datenbank (Punkt 6). Grund: Der Schlüssel steht in URLs, in Fehlermeldungen
   und in Logs des Anbieters, die wir nicht filtern können (ADR-011, §3.6). Ein
   Schlüssel wie `Mueller_Anna_MRT_Befund.pdf` wäre ein Patientendatum in genau
   diesen Kanälen. Die erste Ebene ist immer die Organisation (ADR-003), damit
   Mandantentrennung auch im Objektspeicher sichtbar und in einer Policy
   prüfbar ist.

### B. Die Datenbank führt, nicht der Bucket

6. **Zu jeder Datei gehört genau eine Zeile in einer Fachtabelle** — für
   DAT-001 `patient_files` — mit Organisation, Bezugsdatensatz, **Dokumentart**
   aus festem Katalog, Anzeigename, MIME-Typ, Größe, **SHA-256-Prüfsumme**,
   Zustand, hochgeladen von und hochgeladen am. **Diese Zeile ist die
   Wahrheit.** Ein Objekt ohne Zeile ist Abfall, eine Zeile ohne Objekt ist ein
   Fehler (Punkt 27).
7. **Der Upload läuft in zwei Phasen mit einer Bestätigung.**
   (a) Die Anwendung legt die Zeile im Zustand `pending` an und leitet daraus
   den Objektschlüssel ab — hier wird die Berechtigung geprüft, **bevor** Bytes
   fließen. (b) Der Browser lädt das Objekt unter genau diesem Schlüssel hoch.
   (c) Ein serverseitiger Vorgang prüft Größe, MIME-Typ und Prüfsumme gegen die
   Vorgabe und setzt `ready`. **Nur `ready` ist sichtbar und verweisfähig.**
   Eine `pending`-Zeile, die älter als **24 Stunden** ist, wird samt Objekt
   verworfen. Ohne (a) gäbe es keine Stelle für die Berechtigungsprüfung, ohne
   (c) wäre „hochgeladen" eine Behauptung des Browsers.
8. **Dateien sind unveränderlich.** Kein Überschreiben (`upsert` aus, kein
   UPDATE-Recht auf `storage.objects`), keine Korrektur an Ort und Stelle. Eine
   berichtigte Fassung ist eine **neue Datei mit Verweis auf die ersetzte**;
   die ersetzte bleibt bis zu ihrer Frist. Das ist dieselbe Logik wie ADR-016
   für die Dokumentation und §13: Ein Befund oder eine Rechnung, die sich unter
   demselben Verweis ändern kann, ist kein Dokument mehr.
9. **Die Prüfsumme ist kein Selbstzweck.** Sie ist der Nachweis, dass die
   abgelegte Fassung die erzeugte ist — die Bedingung, unter der ADR-009
   Punkt 9 („eine ausgestellte Rechnung ist unveränderbar") für ein PDF
   überhaupt prüfbar wird, und der einzige Weg, einen stillen Bitfehler oder
   eine unvollständige Wiederherstellung zu erkennen.
10. **Jede Datei hängt an einem Bezugsdatensatz** — Verordnung, Patient:in,
    Rechnung, Termin —, nie frei im Raum. **Es gibt keine allgemeine Ablage.**
    Ohne Eigentümer gibt es weder eine Berechtigung noch eine Frist; ADR-008
    nennt eine Datenklasse ohne Fristzuordnung „einen Mangel, nicht einen
    Sonderfall". Eine Datei, die in mehreren Kontexten gebraucht wird
    (offene Folgefrage in ADR-008), wird **nicht mehrfach referenziert, sondern
    einmal abgelegt und von einem Ort aus verlinkt** — sonst hätte sie zwei
    Fristen.

### C. Zugriff und Auslieferung

11. **Berechtigungen laufen über den zentralen Policy-Layer und zusätzlich über
    RLS auf `storage.objects`** (ADR-004 Punkt 5 und 6, §4.7). Der
    `service_role`-Schlüssel erreicht niemals den Browser. Die Policies auf
    `storage.objects` leiten sich aus denselben `app.can_*`-Funktionen ab wie
    die Fachtabellen; sie sind keine zweite, eigene Rechtelogik.
12. **Jede Datei trägt eine Dokumentart aus einem festen Katalog, und die Art
    bestimmt den Rollenschnitt.** Klinisch — Befund, Arztbrief,
    **Verordnungsscan**, klinisches Bild — sehen `owner`, `therapist`,
    `team_lead`. Organisatorisch — Einwilligung, Vertrag, Rechnung,
    Kostenvoranschlag — sieht zusätzlich `office` (§4.3). **Keine freie Eingabe
    der Art, keine Datei ohne Art.** Der Verordnungsscan ist klinisch, obwohl
    die Verordnung selbst organisatorische Felder hat (ANN-011): **Ein Scan
    lässt sich nicht projizieren.** Er zeigt alles, was auf dem Blatt steht,
    einschließlich Diagnose — die Trennung in zwei Sichten, die bei der
    strukturierten Verordnung funktioniert, gibt es beim Bild davon nicht.
    Deshalb folgt eine Datei immer dem **strengsten** Teil ihres Inhalts.
13. **Wer hochladen, die Art ändern oder löschen darf, folgt dem Schreibrecht
    am Bezugsdatensatz**, nicht dem Leserecht an der Datei. Eine Korrektur der
    Dokumentart ist ein protokollierter Vorgang der therapeutischen Rollen: Sie
    verschiebt eine Sichtbarkeitsgrenze und ist damit keine Stammdatenpflege.
14. **Patient:innen laden in V1 nichts hoch und sehen nichts.** Es gibt kein
    Portal (ADR-014, §14), und dieser ADR baut keines vor.
15. **Ausgeliefert wird ausschließlich über kurzlebige signierte Verweise:**
    erzeugt **auf ausdrückliche Aktion** („Datei öffnen"), **je Zugriff neu**,
    Gültigkeit **60 Sekunden**, mit dem Anzeigenamen als Downloadnamen. Nie im
    Voraus, nie für eine ganze Liste, nie gespeichert, nie in einer E-Mail, nie
    in der Adresszeile der Anwendung (ADR-011; dieselbe Regel wie bei den
    Rückwegen aus UX-012: kein Name in der Adresszeile).
16. **Objekte werden mit `cacheControl: '0'` hochgeladen.** Der Standardwert
    der Bibliothek ist `3600`. Grund, belegt aus der Anbieterdokumentation:
    Eine am CDN zwischengespeicherte Antwort zu einem signierten Verweis kann
    weiter ausgeliefert werden, **nachdem das Token abgelaufen ist**; dieselbe
    Seite empfiehlt, für einen echten Entzug das Objekt zu löschen. Ohne diesen
    Punkt wäre die kurze Gültigkeit aus Punkt 15 eine Zusage, die der Cache
    nicht hält.
17. **Ein signierter Verweis ist nicht widerrufbar.** Belegt: Er bleibt bis zu
    seinem Ablauf gültig, unabhängig von einem Wechsel der Auth-Schlüssel; ein
    vorzeitiger Entzug geht nur über den Support des Anbieters. Daraus folgen
    Punkt 15 und 16 — und: **Es gibt keinen Teilen-Link.** Wer einer Ärztin
    einen Befund schickt, tut das außerhalb der Anwendung und trägt die
    Verantwortung dafür. Einen Versandweg baut die Anwendung nicht, bevor
    PAT-006 (Datenschutzinformation) und B2 (Datenschutzberatung) geklärt sind.
18. **Formate und Größe sind eine Allowlist, doppelt durchgesetzt** — am Bucket
    und noch einmal bei der Bestätigung aus Punkt 7c: **PDF, JPEG, PNG,
    höchstens 10 MB je Datei.** Ausgeschlossen sind **SVG, HTML,
    Office-Dokumente, Archive, Videos und alles Ausführbare**: SVG und HTML
    tragen Skript und würden auf der Domäne des Anbieters ausgeliefert; Videos
    sind eine eigene Risikoklasse mit eigener Einwilligung und eigener Frist
    (`IDEA-KOM-003`) und nicht Gegenstand dieses ADR.
19. **Angezeigt wird nur, was sich sicher anzeigen lässt:** PDF und Bild im
    eigenen Rahmen der Anwendung, sonst nichts. Kein eingebettetes HTML, keine
    Bibliothek, die Fremdinhalte ausführt, keine Vorschaubilder, die der
    Anbieter aus dem Original rechnet.

### D. Audit

20. **Auditpflichtig sind drei Ereignisse** — sie erfüllen „Zugriff auf
    klinische Dokumente" und „Download/Export klinischer Daten" aus ADR-010
    Punkt 2: `patient_file.uploaded`, `patient_file.link_issued`,
    `patient_file.deleted`. Der Eintrag trägt Datei- und Patientenkennung,
    Dokumentart und Zeitpunkt — **nie den Anzeigenamen, nie den
    Objektschlüssel, nie Inhalt** (ADR-010 Punkt 3, ADR-011).
21. **Protokolliert wird die Ausstellung des Verweises, nicht das Laden der
    Datei.** Das ist eine Grenze und keine Nachlässigkeit: Die Anfrage am
    Objekt läuft zwischen Browser und Anbieter, die Anwendung sieht sie nicht.
    Wer den Verweis erzeugt hat, **hatte** den Zugriff; ob die Bytes geflossen
    sind, steht nicht fest. Diese Aussage gehört so in die DSFA und in die
    Verfahrensbeschreibung, statt einen stärkeren Nachweis zu behaupten.
    Punkt 15 hält den Unterschied klein: ein Verweis je bewusstem Zugriff, nie
    auf Vorrat für eine Liste.
22. **Das Auflisten der Dateien einer Akte ist kein eigenes Auditereignis.**
    Das Öffnen der Akte ist bereits auditiert; ADR-010 wägt genauso zwischen
    Aussagekraft und Logvolumen ab („Detailansicht ja, Trefferliste nein").

### E. Aufbewahrung, Löschung, Sicherung

23. **Die Datei erbt die Datenklasse ihres Bezugsdatensatzes** und steht damit
    im Retention Schedule (LOE-001a, Tabellen `retention_classes` und
    `retention_assignments`): Verordnungsscan und klinische Dokumente gehören
    zur Klasse `patientenakte` — zehn Jahre nach Abschluss der Versorgung
    (§630f BGB, ADR-008 Punkt 4, Anker `patients.care_concluded_on`).
    Abrechnungsbelege bekommen die steuerliche Klasse, die mit ABR-EPIC-002b
    entsteht. **Keine Datei ohne Klasse.**
24. **Ein Legal Hold der Patient:in erfasst ihre Dateien mit** (ANN-033). Es
    gibt keinen eigenen Hold je Datei — das wäre ein zweiter Mechanismus für
    dieselbe Frage.
25. **Löschen ist zweistufig und selbst nachweispflichtig.** Der Löschlauf
    (`apply_retention`, LOE-002a) löscht die Zeile und schreibt einen
    **Löschauftrag für das Objekt**; ein angemeldeter Vorgang der Anwendung
    führt ihn aus und **quittiert** ihn. Erst die Quittung schließt die
    Löschung ab. Offene Aufträge sind sichtbar und gehören in den monatlichen
    Bericht (ADR-010 Punkt 6), nicht in eine stille Warteschlange. Grund: Eine
    Datenbankfunktion kann kein Objekt löschen, und eine Edge Function ist für
    produktive Gesundheitsdaten nach ADR-015 Punkt 20 nicht freigegeben. Das
    Löschjournal weist die Zeile nach (ANN-031), die Quittung das Objekt — ohne
    sie wäre „gelöscht" nur für die Hälfte der Daten belegt.
26. **Der Objektspeicher läuft im Datenbank-Backup nicht mit.** Belegt aus der
    Anbieterdokumentation: Datenbanksicherungen enthalten die über die
    Storage-API abgelegten Objekte nicht, weil die Datenbank nur deren
    Metadaten führt; das Zurückspielen einer alten Sicherung bringt später
    gelöschte Objekte nicht zurück. Daraus folgt dreierlei:
    - ADR-012 Punkt 5 wird zur **Vorbedingung**: **Ohne dokumentierten und
      getesteten Sicherungs- und Wiederherstellungsweg für den Bucket wird
      produktiv keine Datei angenommen.** Das gehört in OPS-003 (Roadmap G7)
      und in den Restore-Test vor Go-live (ADR-012 Punkt 6).
    - Die Wiederherstellung ist **dreistufig**: Datenbank zurückspielen,
      Objekte zurückspielen, **dann Löschjournal und offene Löschaufträge
      erneut anwenden** — auf beiden Seiten (ADR-008 Punkt 8).
    - Der Zielwert **RPO ≤ 1 Stunde** aus ADR-012 Punkt 1 gilt auch für
      Dateien. Ein täglicher Abzug erfüllt ihn nicht; die Taktung ist in
      OPS-003 zu entscheiden.
27. **Abgleich statt Vertrauen.** Ein wiederkehrender Abgleich meldet
    **verwaiste Objekte** (kein Datensatz) und **fehlende Objekte** (Datensatz
    ohne Objekt). Verwaiste werden gelöscht; fehlende sind ein **sichtbarer
    Fehler an der Datei** — keine leere Fläche, kein stiller Ausgleich (§13:
    Dokumentation darf nicht unbemerkt verloren gehen).

### F. Virenprüfung und Uploads Dritter

28. **In V1 wird nicht auf Schadsoftware geprüft.** Belegt: Der Anbieter
    analysiert Dateiinhalte nicht. Hochgeladen wird ausschließlich von
    angemeldeten Praxiskonten auf Praxisgeräten, und keine Datei wird jemals
    ausgeführt. Die Kompensation sind Punkt 8 (Unveränderbarkeit), Punkt 18
    (Allowlist und Größe), Punkt 19 (Auslieferung nur als Anzeige oder
    Download) und die Endgeräte-Richtlinie aus BETRIEB-001.
29. **Vor dem ersten Upload durch Patient:innen oder andere Externe ist eine
    Virenprüfung MUSS** (Roadmap G1). Der Ablauf steht schon fest, damit später
    niemand ihn erfindet: Die Datei bleibt `pending`, bis ein Prüfergebnis
    vorliegt; ein Befund heißt **kein `ready`**, Objekt gelöscht, Auditeintrag,
    Meldung an die Praxis. **Der Ausführungsort einer solchen Prüfung ist eine
    neue wesentliche Abhängigkeit** und damit nach §15.1 ein Stopp: eigener
    ADR, eigener Auftrag, eigene Providerprüfung, wenn sie außer Haus läuft.
30. **Dieser ADR gibt nicht frei:** Fotos und Videos von Patient:innen
    (`IDEA-KOM-003` — eigene Einwilligung, kurze Frist, Entfernung der
    Aufnahmemetadaten), Anhänge im Teamchat (TEAM-001), Uploads aus einem
    Portal, den Versand von Dokumenten aus der Anwendung heraus.

## Was OPS-001 zusätzlich prüfen muss

Fünf Punkte, die der Katalog aus ADR-002 Punkt 3 für die Datenbank ohnehin
stellt, für den Objektspeicher aber **gesondert** beantworten muss. Alle fünf
sind **aus Verträgen zu belegen**, nicht aus Dokumentation und erst recht nicht
aus Forendiskussionen:

| # | Prüfpunkt | Warum |
|---|---|---|
| 1 | Deckt der AVV/DPA die **Storage-Objekte** ausdrücklich mit ab, nicht nur die Datenbank? | §3.5 verlangt den Nachweis je Verarbeitung; „das Projekt ist abgedeckt" ist keine Fundstelle |
| 2 | **Unterauftragskette des Objektspeichers**: Welcher Objektspeicher liegt darunter, in welcher Region, mit welcher Verschlüsselung im Ruhezustand? | ADR-002 Punkt 3; Suchauszüge nennen AWS (S3) in der Projektregion und AES-256, teils mit anbietereigenen Schlüsseln — **nicht belegt**, gehört in den Vertrag |
| 3 | **Löschung beim Anbieter**: Wann ist ein gelöschtes Objekt tatsächlich weg — Cache, Replikate, anbietereigene Sicherungen? | ADR-008 Punkt 3 verlangt echte Löschung; die Quittung aus Punkt 25 belegt nur unsere Seite |
| 4 | **Sicherung der Objekte**: Steht ein S3-kompatibler Zugang zur Verfügung, was kostet er, und wo liegt das Sicherungsziel? | Punkt 26; das Sicherungsziel ist eine eigene Verarbeitung mit denselben Anforderungen (EU, AVV) |
| 5 | **Signierte Verweise**: Gibt es einen Entzug vor Ablauf, der nicht über den Support läuft? | Punkt 17; fällt die Antwort positiv aus, wird die Gültigkeit aus Punkt 15 nicht länger, sondern der Entzug ein zusätzliches Werkzeug |

## Konsequenzen

- **Es gibt ab jetzt zwei Speicher, die auseinanderlaufen können.** Sicherung,
  Wiederherstellung, Löschung und Abgleich sind von hier an zweiseitig. Das ist
  der eigentliche Preis dafür, überhaupt Dateien zu führen — nicht der Bucket.
- **Ein kopierter Verweis funktioniert nach einer Minute nicht mehr.** Wer eine
  Datei „schnell rüberschicken" will, wird das als Schikane erleben. Es ist
  genau die Zusage, die Punkt 17 einhalten kann, und keine, die er nicht
  einhalten kann.
- **`cacheControl: '0'` verschenkt den CDN-Nutzen.** Bei einer Praxis mit einer
  Handvoll Zugriffen am Tag ist das messbar nichts; bei einem Bildarchiv wäre
  es eine Entscheidung mit Kostenfolge.
- **Aus der Anwendung heraus geht kein Dokument nach außen.** Für die
  Zusammenarbeit mit Ärzt:innen bleiben Post, Fax und das eigene Postfach, wie
  bei den Terminmails (CAL-013). Das ist bewusst eng, bis B2 antwortet.
- **Der Rollenschnitt an der Dokumentart ist eine Pflegeliste mit scharfer
  Kante.** Eine falsch gewählte Art ist eine Offenlegung nach §13, kein
  Schönheitsfehler. Deshalb Vorbelegung aus dem Kontext (der Scan an der
  Verordnung ist klinisch), Korrektur nur durch therapeutische Rollen, und die
  Korrektur ist protokolliert.
- **Eine Datei kostet zwei Vorgänge, drei Zustände, einen Abgleich und eine
  Quittung.** Das ist deutlich mehr als „Datei hochladen" — und es ist die
  Mindestmenge, mit der §12 („Dateizugriffe sind testpflichtig"), ADR-008
  (echte Löschung) und §13 (kein stiller Verlust) gleichzeitig erfüllbar sind.
- **Der Testaufbau der Cloudumgebung muss wachsen.** `pnpm test:db` läuft gegen
  reines PostgreSQL mit dem Shim in `supabase/tests/helpers/supabase-shim.sql`;
  der bildet heute `auth` nach, aber **kein `storage`-Schema**. Ohne eine
  minimale Nachbildung von `storage.objects` bliebe ausgerechnet der
  Dateizugriff im wichtigsten Gate der Cloudumgebung ungeprüft. Das gehört in
  DAT-001 und ist dort kein Nebenschauplatz.
- **Die Virenprüfung ist gestundet, nicht erlassen.** Jede Erweiterung auf
  Uploads von außen bezahlt sie nach — mit einem eigenen ADR und
  gegebenenfalls einem neuen Dienstleister.
- **Für das Rechnungs-PDF ist damit eine Option gestorben.** Ein reiner
  Browser-Druck erzeugt eine Datei, die die Anwendung nie sieht: kein
  Objektschlüssel, keine Prüfsumme, keine Frist, kein Auditeintrag. B14 bleibt
  offen, aber die Tendenz aus `OPEN_DECISIONS.md` (serverseitige Erzeugung)
  wird durch diesen ADR nicht schwächer.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Freigabe von Supabase als produktivem Auftragsverarbeiter — die bleibt
  bei OPS-001 und ADR-002.
- Der Weg, auf dem das Rechnungs-PDF **entsteht** (B14, ABR-EPIC-002a). Dieser
  ADR sagt nur, wie es abgelegt wird, wenn es existiert.
- Anbieter, Ausführungsort und Kosten einer späteren Virenprüfung.
- Fotos, Videos und Audiodateien von Patient:innen, einschließlich der
  Sprachdokumentation aus §6.3 und ADR-005.
- Anhänge im internen Teamchat (TEAM-001) und in der Patientenkommunikation.
- Volltextsuche in Dateien, Texterkennung, Bildtransformationen und jede Form
  von KI auf Dateiinhalten (ADR-005 bleibt maßgeblich).
- Elektronische Signaturen. `IDEA-PRX-015` (Unterschrift am Hausbesuch) ist am
  2026-09-06 verworfen; Behandlungsvertrag und Datenschutzinformation bleiben
  Papier mit Vermerk (E-13, Roadmap G8).
- Die Oberfläche: Wie ein Upload aussieht, wo die Dateiliste in der Akte steht
  und wie eine fehlende Datei gemeldet wird, entscheidet DAT-EPIC-001.

## Offene Folgefragen

- **HEIC.** Ein mit dem iPhone aufgenommenes Foto kommt je nach Einstellung als
  HEIC an und wäre nach Punkt 18 abgelehnt. Ob der Dateiwähler zuverlässig
  JPEG liefert, ist in DAT-001 am echten Gerät zu prüfen — die Antwort ändert
  die Allowlist, nicht die Regel dahinter.
- **Wie wird eine ersetzte Datei angezeigt** (Punkt 8)? Sichtbar mit Vermerk
  „ersetzt" wie bei der Dokumentation (ADR-016), oder nur für therapeutische
  Rollen? Fällt mit der Oberfläche in DAT-001.
- **Wer führt den Löschauftrag aus** (Punkt 25), wenn Jannes im Urlaub ist?
  Der Auftrag wartet — aber wie lange darf er warten, bevor die Löschung nicht
  mehr „unverzüglich" ist? Gehört in BETRIEB-001 und in das Löschkonzept (G14).
- **Zählt die Ausstellung eines Verweises als „größerer Datenexport"** im Sinne
  von ADR-010, wenn jemand zwanzig Dateien nacheinander öffnet? Die
  Schwellenfrage ist in ADR-010 offen und wird durch Dateien dringlicher.
- **Was passiert mit den Dateien, wenn OPS-001 negativ ausfällt** und die
  Plattform wechselt? Die Regeln überleben, die Policies auf `storage.objects`
  nicht. Der Aufwand wäre `mittel` und beträfe nur die Ablageschicht.

## Bestätigungsfragen für Jannes

Je eine Zeile genügt; „wie empfohlen" reicht. Erst nach der Bestätigung wird
E8 in `docs/decisions/OPEN_DECISIONS.md` geschlossen und DAT-EPIC-001 gestartet.

1. **Kurzlebige Verweise mit 60 Sekunden, kein Teilen-Link** (Punkt 15 bis 17)
   — auch um den Preis, dass man eine Datei nicht „mal eben" per Link
   weitergeben kann?
   *Empfehlung: ja.* Ein Verweis, der sich nicht widerrufen lässt, darf nicht
   lange leben. Weitergeben geht weiterhin — bewusst, außerhalb der Anwendung.
2. **Rollenschnitt an der Dokumentart, Verordnungsscan klinisch** (Punkt 12) —
   `office` sieht den Scan also **nicht**, obwohl es die Verordnungsdaten
   organisatorisch sieht (ANN-011)?
   *Empfehlung: ja.* Ein Scan zeigt das ganze Blatt samt Diagnose; projizieren
   lässt sich nur ein Datensatz, kein Bild.
3. **Formate PDF, JPEG, PNG und höchstens 10 MB je Datei** (Punkt 18)?
   *Empfehlung: ja.* Deckt Rezeptscan, Arztbrief und Foto ab; alles andere
   kommt, wenn ein Fall es verlangt — nicht auf Vorrat.
4. **Keine Virenprüfung in V1**, Pflicht ab dem ersten Upload von außen
   (Punkt 28 und 29)?
   *Empfehlung: ja* — so steht es auch in der Roadmap G1. Es lädt nur die
   Praxis von eigenen Geräten hoch, und keine Datei wird ausgeführt.
5. **Dateien sind unveränderlich; eine Korrektur ist eine neue Datei**
   (Punkt 8), die alte bleibt bis zur Frist sichtbar?
   *Empfehlung: ja.* Alles andere wäre ein Dokument, das sich unter der Hand
   ändert.
6. **Zweistufige Löschung mit Quittung statt Edge Function** (Punkt 25) — das
   Löschen der Dateien braucht also einen angemeldeten Vorgang und ist nicht
   vollautomatisch?
   *Empfehlung: ja, vorerst.* Sobald OPS-001 die Edge Runtime freigibt, kann
   derselbe Auftrag automatisch abgearbeitet werden; der Nachweisweg bleibt.
7. **Keine Datei produktiv, bevor die Objektsicherung dokumentiert und getestet
   ist** (Punkt 26) — auch wenn das DAT-EPIC-001 nicht blockiert, aber den
   Echtbetrieb mit Dateien an OPS-003 bindet?
   *Empfehlung: ja.* Eine Datei, die nur in einem Speicher liegt, ist eine
   Datei, die man verlieren kann; ADR-012 verlangt das ohnehin.
8. **Die fünf zusätzlichen Prüfpunkte gehen in OPS-001** (Abschnitt oben) —
   die Providerprüfung wird dadurch etwas länger. *Einverstanden?*
   *Empfehlung: ja.* Sie jetzt zu benennen kostet eine halbe Seite; sie später
   nachzureichen kostet eine zweite Anfrage beim Anbieter.

## Quellen der Recherche vom 2026-09-12

`supabase.com` ist aus dieser Umgebung gesperrt (Egress-Proxy). Abgerufen
wurden stattdessen die Quelltexte derselben Dokumentation und der Bibliothek:

- `raw.githubusercontent.com/supabase/supabase` — `apps/docs/content/guides/`:
  `platform/backups.mdx` („Database backups do not include objects you store
  via the Storage API"; „Restoring an old backup does not restore objects you
  deleted after that backup"), `storage/security/access-control.mdx`
  („By default Storage does not allow any uploads to buckets without RLS
  policies"), `storage/serving/downloads.mdx` (private Buckets, signierte
  Verweise: „remain valid until their expiry time regardless of any Auth key
  changes"; Entzug nur über den Support), `storage/uploads/file-limits.mdx`
  (globales Limit und niedrigeres Limit je Bucket),
  `storage/uploads/standard-uploads.mdx` (6-MB-Schwelle zu Resumable Uploads),
  `storage/cdn/fundamentals.mdx`, `storage/cdn/smart-cdn.mdx`
  (Invalidierung „up to 60 seconds"; eine zwischengespeicherte Antwort „can
  continue to be served for the same signed URL until the CDN cache duration
  expires, even if the token in that URL has already expired").
- `raw.githubusercontent.com/supabase/storage-js` —
  `src/packages/StorageFileApi.ts`: Standardwert `cacheControl: '3600'`,
  Umsetzung als `cache-control: max-age=…`; `createSignedUrl(path, expiresIn,
  { download })`.
- **Nur als Suchauszug, nicht belegt** und deshalb in OPS-001 verwiesen:
  Verschlüsselung im Ruhezustand (AES-256, teils anbietereigene Schlüssel),
  AWS/S3 als darunterliegender Objektspeicher in der Projektregion, fehlende
  Inhaltsanalyse auf Schadsoftware (Community-Diskussionen im Repository
  `supabase/supabase`).
- Die zehnjährige Frist aus **§630f BGB** ist bereits über ADR-008 Punkt 4 und
  die Klasse `patientenakte` im Retention Schedule verankert; sie wurde in
  dieser Sitzung nicht erneut aus der Primärquelle geprüft
  (`gesetze-im-internet.de` ist aus dieser Umgebung ebenfalls gesperrt).

**Rechtsberatung ersetzt das nicht.** Die datenschutzrechtliche Einordnung der
Ablage geht mit dem DSFA-Paket (G14) an die Prüfung; die vertraglichen Punkte
gehen mit OPS-001 an den Anbieter.
