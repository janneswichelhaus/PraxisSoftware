# ADR-017: Dateiablage — Ort, Zugriff, kurzlebige Verweise, Aufbewahrung, Virenprüfung

## Status

**Angenommen** — **Fassung 1** von Jannes am 2026-09-12 bestätigt, alle acht
Fragen wie empfohlen (Abschnitt am Ende). **Fassung 2 vorgeschlagen
(2026-09-26).**

Fassung 2 ergänzt **Abschnitt G** (Punkte 31 bis 42): **Fotos von
Patient:innen** mit eigener Einwilligung als Rechtsgrundlage, eigener
Datenklasse und kurzer Frist, Aufnahme **nur über die Kamera der Anwendung**
und ohne Aufnahmemetadaten; dazu die Regeln für Fotos von Dokumenten, die
auf demselben Weg entstehen. Sie ist der erste Schritt von **DOK-006**
([`../development/ROADMAP.md`](../development/ROADMAP.md), Block 2), den
Punkt 30 bisher versperrt. **Die Punkte 1 bis 30 bleiben Wort für Wort
stehen**; Punkt 30, „Bewusst nicht Bestandteil" und die HEIC-Folgefrage
tragen einen Vermerk.

**Bis zur Annahme durch den Projektinhaber gilt Fassung 1** — Punkt 30 gibt
Fotos von Patient:innen dann weiter nicht frei. Die Zeile in
[`README.md`](README.md) nennt bis zur Annahme keine Fassung und bleibt
unberührt; der Bau von DOK-006 beginnt, wenn der ADR über ihm steht.

Dieser ADR **legt keine Datei an und gibt keinen produktiven Speicher frei.**
Er legt fest, wie eine Datei in dieser Anwendung entsteht, wer sie sieht, wie
sie ausgeliefert wird, wann sie verschwindet und was vorher geprüft sein muss.
Die produktive Geltung hängt zusätzlich an **OPS-001**, der Providerprüfung für
Supabase nach ADR-002 (Roadmap G1: „Erst nach positivem OPS-001"). Warum der
ADR trotzdem jetzt geschrieben wird, steht im Kontext.

## Datum

2026-09-12 (Fassung 1); 2026-09-26 (Fassung 2, vorgeschlagen)

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

**Neu zur Fassung 2.** Im Produktgespräch vom 2026-09-23
([`../development/UMBAU.md`](../development/UMBAU.md)) hat Jannes zwei Dinge
festgelegt: Fotos von Patient:innen gehören in den Ablauf, „damit andere
Therapeut:innen einen Eindruck haben und für Vergleiche im Verlauf", und
Fotos entstehen nur über die Kamera der App, weil sonst Gesundheitsdaten in
der privaten Mediathek und ihrem Cloud-Backup liegen. §5 hat daraus gemacht:
Fotos von Dokumenten gehören in die Akte, Aufnahmen des Teams SOLLTEN über
die Kamera der Anwendung entstehen, und Fotos von Patient:innen „setzen eine
eigene Einwilligung voraus, und Frist und Umgang mit Aufnahmemetadaten
entscheidet der Loop, der sie baut". Punkt 30 nennt dieselben drei
Bedingungen und gibt deshalb nichts frei. Diese Fassung entscheidet sie.

Drei Befunde am Bestand bestimmen den Zuschnitt. **Erstens** gibt es das
Einwilligungsmodell schon: `patient_privacy_records` hält Erteilung und
Widerruf je Zweck als unveränderliche Vermerke fest (PAT-006, ANN-093), und
ANN-093 nennt „Fotos zur Verlaufsdokumentation" ausdrücklich als möglichen
weiteren Zweck. **Zweitens** hat der Katalog eine Lücke: Die Dokumentart
`klinisches_bild` ist in der Oberfläche mit „Bildgebung oder Aufnahme mit
klinischer Aussage" erläutert — das liest sich, als dürfe man ein Foto der
Person schon heute unter dieser Art ablegen, ohne Einwilligung und mit zehn
Jahren Frist. **Drittens** sperrt die Test-Umgebung die Kamera per
Kopfzeile (`Permissions-Policy: camera=()`, `scripts/testumgebung.mjs`). Eine
Sicherheitsmaßnahme zu öffnen ist nach §15.1 nichts, was ein Loop nebenbei
tut; Punkt 33 entscheidet es hier.

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
    *Vermerk 2026-09-13 (E15, ADR-004 Fassung 2):* `office` liest künftig
    auch die klinischen Dokumentarten. Die Dokumentart bleibt Katalog und
    Rollenschnitt — für Patient:innen (Etappe 4), Dritte und die
    Rechnungssicht; für die Praxisrollen ist die Grenze mit ROL-EPIC-001
    (PR #41) entfallen. Hochladen, Löschen und die Korrektur der Art folgen
    weiter dem Schreibrecht (Punkt 13).
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
    *Vermerk 2026-09-15 (FIX-015, BEF-004):* Die Ausstellung ist seitdem
    erzwungen, nicht nur der vorgesehene Weg. Signieren, Laden, Auflisten und
    Kopieren lässt die Storage-API nur gegen eine einmalige, 30 Sekunden
    gültige Freigabe zu, die `issue_patient_file_link` mit dem Auditeintrag
    anlegt; entfernt wird ein Objekt nur gegen die Freigabe aus
    `claim_storage_deletion_order` (`storage_deletion.claimed`), und diese
    Freigabe taugt nur zum Entfernen. `storage_deletion.claimed` ist damit ein
    Ereignis des Löschauftrags, kein Dateizugriff; Punkt 20 bleibt bei seinen
    drei Dateiereignissen. Die Grenze dieses Punkts bleibt: Ein ausgestellter
    Verweis gilt seine 60 Sekunden, und ob die Bytes geflossen sind, steht
    weiter nicht fest (ANN-052).
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
    *Vermerk 2026-09-26 (Fassung 2, vorgeschlagen):* Fotos von Patient:innen
    gibt Abschnitt G frei — unter genau den drei Bedingungen, die dieser
    Punkt nennt. Für Videos, Teamchat, Portal und Versand gilt er unverändert
    (Punkt 42).

### G. Fotos (Fassung 2)

31. **Zwei Arten von Fotos.** Ein **Foto eines Dokuments** — Verordnung,
    Anamnesebogen auf Papier, unterschriebene Einwilligung — ist eine Datei
    nach den Abschnitten A bis F mit ihrer bisherigen Dokumentart und Klasse
    `patientenakte`; neu sind für sie nur der Aufnahmeweg (Punkt 33) und die
    Entfernung der Metadaten (Punkt 34). Ein **Foto der Person** —
    Körperregion, Haltung, Schwellung, Narbe, Ausgangsstellung — ist die neue
    Dokumentart **`patientenfoto`** mit eigener Einwilligung, Klasse und Frist
    (Punkte 35 bis 38). Die Grenze folgt Punkt 12: **Zeigt ein Bild die
    Person, ist es ein Patientenfoto**, auch wenn zugleich ein Dokument darauf
    zu sehen ist. `klinisches_bild` bleibt **Bildgebung aus ärztlicher Hand**
    (Röntgen, MRT, Ultraschall) und ist nie ein Foto, das die Praxis von der
    Person macht; die Erläuterung in `src/features/files/dokumentarten.ts`
    wird in DOK-006 entsprechend geschärft.
32. **Derselbe Weg, ein eigener Bucket.** Patientenfotos laufen durch
    **dieselbe Fachtabelle und dieselben Vorgänge** wie jede Datei — zwei
    Phasen mit Bestätigung, unveränderlich, kurzlebige Verweise, drei
    Auditereignisse, zweistufige Löschung, Abgleich (Punkte 6 bis 27). Kein
    zweiter Upload-, Verweis- oder Löschweg. Nach Punkt 3 liegen sie in einem
    **eigenen privaten Bucket `patientenfotos`**, weil Frist und Löschweg an
    der Klasse hängen; seine Allowlist ist enger als Punkt 18: **nur JPEG**,
    höchstens 10 MB. Bezugsdatensatz ist die **Patient:in** (Punkt 10), nicht
    Termin oder Eintrag: Das Foto lebt kürzer als die Dokumentation, und ein
    finalisierter Eintrag (ADR-016) darf nicht auf etwas zeigen, das nach
    einem Jahr fehlt. Die Art `patientenfoto` wird **nicht korrigiert**,
    weder hin noch weg (Punkt 13) — eine Korrektur verschöbe Bucket, Klasse
    und Einwilligungsbindung; ein Foto in der falschen Art wird gelöscht und
    neu aufgenommen.
33. **Aufnahme nur über die Kamera der Anwendung.** Ein Patientenfoto
    entsteht **ausschließlich** im Kameradialog der Anwendung: Live-Bild über
    `getUserMedia` (nur Bild, nie Ton), Auslöser in der Anwendung, das Foto
    wird aus dem Kamerabild gerechnet. **Für `patientenfoto` gibt es keinen
    Dateiwähler**, auch nicht als Ausweg bei verweigerter Kamerafreigabe. Für
    Fotos von Dokumenten ist der Kameradialog auf dem Handy der angebotene
    Weg; der Dateiwähler bleibt für vorhandene Dateien (PDF einer Arztpraxis,
    Scan am Schreibtisch) — §5 verlangt dort ein SOLLTE, kein MUSS.
    - **Nicht `<input type="file" capture>`.** Die Spezifikation macht
      `capture` zu einer Empfehlung an den Browser, nicht zu einer Zusage, und
      die Aufnahme übernimmt die Kamera-App des Geräts. Was diese App ablegt
      und welche Metadaten sie schreibt, liegt außerhalb der Anwendung. Nur
      der eigene Dialog hält das Bild vom Sensor bis zum Upload in einer Hand.
    - **Bis zum Upload liegt das Bild nur im Arbeitsspeicher der Seite:**
      kein IndexedDB, kein Cache, kein Download, keine Warteschlange für
      später (ADR-001 Punkt 2; einen Service Worker gibt es nach ADR-015
      nicht). Ohne Verbindung gibt es kein Foto. Scheitert der Upload, sagt
      die Anwendung es, bietet die Wiederholung an, solange die Seite offen
      ist, und warnt vor dem Verlassen (§13). Die Kamera läuft nur, solange
      der Dialog offen ist, und endet beim Auslösen und beim Abbrechen.
    - **Die Permissions-Policy gibt die Kamera nur der eigenen Herkunft
      frei** (`camera=(self)`); Mikrofon, Zahlung und USB bleiben gesperrt.
      Die Öffnung in `scripts/testumgebung.mjs` und in jeder künftigen
      Auslieferung ist damit entschieden und gehört in DOK-006.
    - **Die Herkunft aus der Kamera ist eine Eigenschaft des Aufnahmewegs,
      keine Prüfung des Servers** — die Datenbank sieht die Bytes nie
      (ANN-053). Wer den Browser selbst steuert, kann anderes hochladen; die
      Kompensation ist dieselbe wie in Punkt 28: Hochladen nur durch
      angemeldete Praxiskonten auf Praxisgeräten.
34. **Aufnahmemetadaten entstehen nicht, und wo es sie gibt, entfernt sie das
    Gerät.** Ein Bild aus dem Kameradialog wird aus Pixeln neu kodiert und
    trägt keine EXIF-, XMP- oder IPTC-Daten: keinen Ort, kein Gerät, keine
    Aufnahmezeit, kein eingebettetes Vorschaubild. **Jedes Bild (JPEG, PNG),
    das über den Dateiwähler kommt**, wird vor dem Upload auf dem Gerät auf
    dieselbe Weise im selben Format neu geschrieben, die Ausrichtung vorher in
    die Pixel übernommen. Das eingebettete Vorschaubild ist der unterschätzte
    Teil: Es kann zeigen, was im Bild selbst weggeschnitten wurde. Der zweite
    Grund ist §20: Ort und Uhrzeit eines Hausbesuchsfotos sind zugleich die
    Adresse der Patient:in und ein Bewegungsprofil der Therapeut:in. Die
    Prüfsumme (Punkt 9) wird über die neu geschriebenen Bytes gebildet. Was
    die Anwendung **stattdessen** festhält, steht nur in der Zeile aus Punkt
    6: hochgeladen am, von wem, Anzeigename — kein Ort, kein Gerätemodell,
    auch nicht in der Datenbank. Wie Punkt 33 ist das eine Eigenschaft des
    Wegs; **nachgewiesen wird sie durch einen Test**, nicht durch diesen Satz:
    Ein Bild mit Ortsangabe geht durch den Weg, und in den hochgeladenen Bytes
    steht kein EXIF-Segment mehr. PDF bleibt unverändert (Folgefragen).
35. **Die eigene Einwilligung ist die Rechtsgrundlage.** Ein Patientenfoto
    stützt sich auf die **ausdrückliche Einwilligung** der Person (Art. 9
    Abs. 2 lit. a DSGVO), nicht auf den Behandlungsvertrag. §5 verlangt sie
    ohnehin; entschieden wird hier, dass sie die **Grundlage** ist und nicht
    nur eine Zusage neben ihr. Grund: Das Foto ist eine **Arbeitshilfe** für
    Übergabe und Vergleich, nicht die Dokumentation. §630f Abs. 2 BGB
    verlangt die Aufzeichnung der wesentlichen Maßnahmen und Ergebnisse; das
    leistet der Eintrag. Daraus folgt die Regel, ohne die diese Einordnung
    nicht trägt: **Ein Foto ersetzt keinen Eintrag.** Was die Therapeut:in
    auf einem Foto oder im Vergleich zweier Fotos als wesentlich sieht, steht
    in Worten in der Dokumentation. ANN-093 stellt die Behandlung nicht auf
    Einwilligung, weil sie wegen der jederzeitigen Widerrufbarkeit die
    schwächere Grundlage wäre (Art. 7 Abs. 3 DSGVO); beim Foto ist genau das
    gewollt — wer widerruft, soll die Fotos loswerden.
    - **Ein Zweck im vorhandenen Modell**, kein zweites: ein weiterer Wert in
      `patient_privacy_records` (ANN-093). Papier bleibt Papier (E-13); die
      Anwendung hält Erteilung und Widerruf mit dem Tag auf dem Papier fest,
      ein Scan kann als `einwilligung` abgelegt werden.
    - **Umfang**, den der Wortlaut abdecken muss (der Wortlaut selbst geht in
      B2): Aufnahme durch das Praxisteam während der Behandlung, Ablage in der
      Akte, Sichtbarkeit nach Punkt 37, Vergleich im Verlauf, Frist nach Punkt
      38, Widerruf jederzeit mit Löschung. **Nicht** abgedeckt und nicht
      gebaut: Weitergabe an Dritte einschließlich der verordnenden Praxis,
      Veröffentlichung, Schulung, Werbung, jede KI-Verarbeitung.
    - **Ohne Einwilligung wird genauso behandelt** (Art. 7 Abs. 4 DSGVO). Die
      Erstaufnahme (PRX-EPIC-003) führt die Fotoeinwilligung deshalb mit
      „abgelehnt" als erledigtem Stand, nicht als offenem Punkt.
    - Das Gesicht wird nur aufgenommen, wenn es die betroffene Region ist;
      der Kameradialog sagt das (Art. 5 Abs. 1 lit. c DSGVO).
36. **Die Einwilligung prüft der Server, der Widerruf wirkt sofort.** Die
    Prüfung sitzt in **einer** Funktion, die Vorbereitung und Bestätigung des
    Uploads (Punkt 7), die Liste und die Verweisausstellung (Punkt 15)
    gleichermaßen fragen — nicht in der Oberfläche (§4.7). Maßgeblich ist die
    jüngste Zeile des Zwecks. Der **Widerruf** schließt in derselben
    Transaktion alle vier Wege und löscht die Fotos der Person über Punkt 25
    — unverzüglich, nicht erst im nächsten Löschlauf (Art. 17 Abs. 1 lit. b
    DSGVO). Steht ein **Legal Hold** (Punkt 24, ANN-033), bleiben die Fotos
    gesperrt — keine Anzeige, kein Verweis — und werden gelöscht, sobald er
    endet (Art. 17 Abs. 3 lit. e DSGVO). Eine neue Einwilligung erlaubt neue
    Fotos; gelöschte kommen nicht zurück. Weil der Widerruf als Vermerk in der
    Datenbank steht, wendet der Löschlauf ihn nach einer Wiederherstellung
    von selbst erneut an (Punkt 26, ADR-008 Punkt 8).
37. **Rollenschnitt: klinisch.** Aufnehmen und löschen dürfen `owner`,
    `therapist` und `team_lead` (Punkt 13) — ein misslungenes Foto sofort,
    jedes andere jederzeit. Lesen folgt §4.3: `office` sieht Patientenfotos
    wie jeden klinischen Inhalt, jeder Zugriff ist auditiert; wer das enger
    will, ändert §4.3 und nicht diesen ADR. Das Foto gehört zum
    **Behandlungsverhältnis** (§4.8, ADR-021): Im Training gibt es in V1 keine
    Fotos, und eine Übernahme dorthin ist nicht vorgesehen. Patient:innen
    sehen ihre Fotos in V1 nicht (Punkt 14).
38. **Frist: zwölf Monate nach der Aufnahme, spätestens drei Monate nach
    Abschluss der Versorgung.** Die neue Datenklasse **`patientenfoto`**
    steht im Retention Schedule (LOE-001a). Fällig ist ein Foto zum
    **frühesten** von drei Zeitpunkten: zwölf Monate nach der Aufnahme, drei
    Monate nach `care_concluded_on` (ANN-032), Widerruf (Punkt 36). Der
    Löschlauf (`apply_retention`) löscht fällige Fotos **automatisch** über
    Punkt 25; ein Legal Hold hält an. Jedes Foto zeigt das Datum, an dem es
    spätestens gelöscht wird. **Keine Verlängerung in V1**: Wer nach einem
    Jahr noch vergleichen will, macht ein neues Foto; was das alte gezeigt
    hat, steht nach Punkt 35 im Eintrag. Zu den Zahlen: Übergabe und
    Vergleich gehören zur laufenden Versorgung. Zwölf Monate decken eine
    Rehabilitation nach Operation mit mehreren Folgeverordnungen; die Grenze
    ab Aufnahme hält die Frist auch dann kurz, wenn niemand die Versorgung
    abschließt — der Abschluss ist ein Vorgang von Hand (ANN-032). Drei
    Monate nach dem Abschluss fangen die Pause zwischen zwei Verordnungen und
    einen versehentlichen, zurückgenommenen Abschluss ab. Beide Zahlen sind
    nach ADR-008 interne Initialentscheidungen, die der DSFA-Prozess
    validiert, und stehen **an einer Stelle**: bei der Klasse im Retention
    Schedule, nicht verteilt über Code und Oberfläche.
39. **Vergleich ohne Bewertung.** Zwei Fotos derselben Person nebeneinander,
    gleich groß, jedes mit Aufnahmedatum, Anzeigename und aufnehmender Person
    — mehr nicht. Der Vergleich öffnet zwei Fotos und stellt damit zwei
    Verweise aus, also zwei Auditeinträge (Punkte 20 und 21). **Unzulässig**
    sind nach §17 und ADR-006 Punkt 11 jede automatische Ausrichtung,
    Überlagerung, Vermessung oder Markierung im Bild und jede Aussage über den
    Unterschied („Schwellung geringer"), gleich ob als Text, Farbe oder
    Symbol. Die Bewertung trifft die Therapeut:in und schreibt sie in den
    Eintrag. Patientenfotos gehen **nie** an das AI Gateway (ADR-005,
    „Bewusst nicht Bestandteil" unten) — auch nicht in die Erkennung des
    Verordnungsfotos aus KI-EPIC-002, die nur Dokumente sieht. Weil keine
    technische Auswertung stattfindet, sind die Fotos keine biometrischen
    Daten (Erwägungsgrund 51 DSGVO); Gesundheitsdaten bleiben sie.
40. **Anzeige nur in der Anwendung, keine Galerie, kein Download.** Ein
    Patientenfoto wird im eigenen Rahmen angezeigt (Punkt 19), **nicht zum
    Herunterladen oder Teilen angeboten** und ohne Zwischenspeicher des
    Browsers geladen (`no-store`), damit das Gerät nach dem Schließen kein
    Bild behält. Die Liste zeigt Datum, Anzeigename, aufnehmende Person und
    Löschdatum — **keine Vorschaubilder**: Eine Vorschau je Eintrag wäre ein
    Verweis je Eintrag, und Punkt 15 verbietet Verweise auf Vorrat für eine
    Liste. **Ein Bildschirmfoto kann eine Webanwendung nicht verhindern** —
    das gehört so in die Verfahrensbeschreibung, wie Punkt 21 die Grenze der
    Protokollierung benennt, und in die Endgeräte-Richtlinie aus BETRIEB-001.
41. **Gebaut wird mit synthetischen Bildern, scharfgeschaltet nach B2.** In
    Tests liefert Chromium eine künstliche Kamera mit Testbild; ein Foto
    einer echten Person — auch aus dem Team — gehört nicht in Tests,
    Bildschirmfotos oder die Test-Umgebung (§3.1). Bei der Sichtung am Handy
    wird ein Gegenstand fotografiert. Mit echten Personen wird die Funktion
    erst eingeschaltet, wenn B2 Wortlaut und Einordnung der Einwilligung
    (Punkt 35) und die Frist (Punkt 38) geprüft hat und die DSFA (ADR-007,
    G14) die Verarbeitung enthält — zusätzlich zu den Bedingungen aus Punkt 2
    und 26. Das Bauen wartet darauf nicht (§15.2).
42. **Weiter nicht freigegeben:** Videos und Audio von Patient:innen, Fotos
    im Trainingsverhältnis, Uploads durch Patient:innen oder aus einem Portal
    (dann gilt Punkt 29), Anhänge im Teamchat, Versand aus der Anwendung.

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

### Konsequenzen der Fassung 2

- **Ein Foto lebt kürzer als die Akte.** Das ist der Preis dafür, Fotos auf
  Einwilligung zu stellen: Wer über ein Jahr hinaus vergleichen will, hat das
  alte Foto nicht mehr, sondern nur den Eintrag dazu. Die Regel „ein Foto
  ersetzt keinen Eintrag" (Punkt 35) ist deshalb keine Stilfrage, sondern die
  Bedingung, unter der die Frist aus Punkt 38 nicht zur Dokumentationslücke
  wird.
- **Die Einordnung ist die Wette dieser Fassung.** Nach den Quellen dieser
  Recherche stützen Praxen medizinisch notwendige Verlaufsfotos überwiegend
  auf Art. 9 Abs. 2 lit. h DSGVO und führen sie als Teil der Akte. Punkt 35
  geht bewusst den anderen Weg. Hält B2 ihn nicht, gilt die Alternative aus
  Bestätigungsfrage 9: Klasse `patientenakte`, zehn Jahre, der Widerruf
  stoppt nur neue Fotos. Der Umbau ist `mittel` — eine Klassenzeile und das
  Verhalten beim Widerruf —, weil vor der Prüfung keine echten Fotos
  existieren (Punkt 41).
- **Keine Galerie.** Die Liste ohne Vorschaubilder ist spürbar weniger bequem
  als die Mediathek des Handys. Sie folgt aus Punkt 15 und ist dieselbe
  Abwägung wie der Verweis mit 60 Sekunden.
- **Die Kamera gibt es nur über HTTPS.** `getUserMedia` steht nur in einem
  sicheren Kontext zur Verfügung. Der Test im heimischen WLAN über eine
  IP-Adresse (E-2a) hat deshalb keine Kamera; die Test-Umgebung und
  `localhost` haben sie.
- **Eine Sicherheitskopfzeile wird geöffnet**, eng und hier entschieden:
  `camera=(self)` statt `camera=()`. Der Test der Kopfzeilen in
  `scripts/testumgebung.test.mjs` hält den neuen Wert fest, damit er nicht
  weiter aufgeht.
- **Eine falsch gewählte Art bleibt die scharfe Kante** (Konsequenz zu
  Punkt 12). Wer ein Foto der Person über den Dateiwähler als
  `klinisches_bild` ablegt, umgeht Einwilligung und Frist, und kein Server
  kann das am Inhalt erkennen. Dagegen stehen die geschärfte Erläuterung
  (Punkt 31), der Kameradialog als einziger Weg zu `patientenfoto` und die
  Sperre der Artkorrektur (Punkt 32).
- **Der Prüfaufbau wächst um eine künstliche Kamera** (Chromium mit
  Testbild) und um Datenbanktests für die Einwilligungsprüfung auf allen vier
  Wegen, das Löschen beim Widerruf, den Legal Hold und die gesperrte
  Artkorrektur (`pnpm test:db`, §12: Dateizugriffe sind testpflichtig).
- **Nachzuziehen nach der Annahme:** §5 sagt heute „noch nicht freigegeben
  (ADR-017 Punkt 30)" und bekommt in einem eigenen Commit mit neuer Version
  einen Verweis auf Abschnitt G (§21); die Zeile in `README.md` und der Index
  in `CLAUDE.md` nennen die Fassung. Die Annahme zur Einordnung (Punkt 35)
  und zur Frist (Punkt 38) wird mit dem Bau registriert, dort, wo sie im
  Code greift — der Klasse `patientenfoto` —, und ANN-093 bekommt den
  dritten Zweck.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Freigabe von Supabase als produktivem Auftragsverarbeiter — die bleibt
  bei OPS-001 und ADR-002.
- Der Weg, auf dem das Rechnungs-PDF **entsteht** (B14, ABR-EPIC-002a). Dieser
  ADR sagt nur, wie es abgelegt wird, wenn es existiert.
- Anbieter, Ausführungsort und Kosten einer späteren Virenprüfung.
- Fotos, Videos und Audiodateien von Patient:innen, einschließlich der
  Sprachdokumentation aus §6.3 und ADR-005. *Vermerk 2026-09-26 (Fassung 2,
  vorgeschlagen): Fotos regelt Abschnitt G; Videos und Audio bleiben
  ausgeschlossen (Punkt 42).*
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
  die Allowlist, nicht die Regel dahinter. *Vermerk 2026-09-26 (Fassung 2,
  vorgeschlagen): Für den Kameradialog erledigt — er liefert JPEG
  (Punkt 33). Für den Dateiwähler bleibt die Frage offen; die Neukodierung
  aus Punkt 34 hilft nur, wo der Browser HEIC selbst lesen kann.*
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

**Zur Fassung 2:**

- **Vertretung.** Wer erklärt die Fotoeinwilligung für ein Kind oder eine
  Person mit rechtlicher Betreuung, und soll der Vermerk festhalten, wer
  unterschrieben hat? `patient_privacy_records` kennt heute nur den Tag. Die
  Frage betrifft alle Zwecke aus ANN-093 und gehört mit ihnen in B2.
- **Bildqualität.** Reicht die Auflösung aus `getUserMedia` auf iPhone und
  Android für eine lesbare Verordnung? In DOK-006 am echten Gerät mit einem
  Musterrezept zu prüfen. Reicht sie nicht, bleibt für Dokumente der
  Dateiwähler mit Neukodierung (Punkte 33 und 34); für Patientenfotos ändert
  sich nichts.
- **PDF-Metadaten** (Autor, Erzeuger, Datum) bleiben unverändert. Sie stammen
  von Scanner oder Arztpraxis und tragen weder Ort noch Vorschaubild; ob sie
  bereinigt werden sollen, entscheidet ein Fall, der es zeigt.
- **Verlängerung im Einzelfall** (`IDEA-KOM-003`: „Verlängerung nur
  bewusst"). In V1 nicht (Punkt 38); sie käme als eigener, protokollierter
  Vorgang mit Obergrenze, wenn die Praxis den Bedarf zeigt.

## Bestätigungsfragen für Jannes — beantwortet am 2026-09-12

**Alle acht wie empfohlen bestätigt.** Damit ist Punkt E8 in
`docs/decisions/OPEN_DECISIONS.md` erledigt und DAT-EPIC-001 baubar. Die Fragen
bleiben mitsamt ihrer Begründung stehen: Wer in zwei Jahren wissen will, warum
ein Verweis nur eine Minute lebt oder warum `office` den Verordnungsscan nicht
sieht, findet hier die Abwägung und nicht nur das Ergebnis.

**Was die Bestätigung nicht erledigt:** Die **produktive** Ablage bleibt an
OPS-001 gebunden (fünf Prüfpunkte oben) und an den dokumentierten
Sicherungsweg für den Objektspeicher aus Frage 7 (OPS-003, Roadmap G7). Beides
ist Vorbedingung für die erste echte Datei, nicht für DAT-EPIC-001.

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

## Bestätigungsfragen zu Fassung 2 — offen

Sechs Fragen, jede mit Ja beantwortbar. Die Nummerierung setzt die der
Fassung 1 fort. **Was die Bestätigung nicht erledigt:** Einordnung, Wortlaut
und Frist sind Datenschutz und Recht; Jannes' Ja zählt fürs Bauen, die
Freigabe mit echten Personen hängt an B2 und der DSFA (Punkt 41).

9. **Fotos von Patient:innen stehen auf Einwilligung, sind Arbeitshilfe und
   nicht Teil der zehnjährigen Akte; der Widerruf löscht sofort; ein Foto
   ersetzt keinen Eintrag** (Punkte 35 und 36)?
   *Empfehlung: ja.* Das ist die Lesart, die §5 und `IDEA-KOM-003` („eigene
   Einwilligung, kurze Frist") meinen, und die sparsamste. *Alternative:* Das
   Foto ist Teil der Akte (Art. 9 Abs. 2 lit. h DSGVO), bleibt zehn Jahre,
   die Einwilligung ist nur Zusage, und ein Widerruf verhindert nur neue
   Fotos — rechtlich die verbreitetere Lesart, aber zehn Jahre Körperfotos
   auf einem Handy-Ablauf.
10. **Frist zwölf Monate nach der Aufnahme, spätestens drei Monate nach
    Abschluss der Versorgung, keine Verlängerung** (Punkt 38)?
    *Empfehlung: ja.* Deckt Rehabilitation und Folgeverordnungen, endet auch
    ohne Abschluss. *Alternative:* 24 Monate ab Aufnahme, wenn du über lange
    Verläufe vergleichen willst.
11. **Patientenfotos nur über den Kameradialog der Anwendung, ohne
    Dateiwähler, und die Kamera in der Permissions-Policy nur für die eigene
    Herkunft** (Punkt 33)?
    *Empfehlung: ja.* Nur so landet nichts in der Mediathek und ihrem
    Cloud-Backup — genau dein Anlass vom 2026-09-23.
12. **Jedes Bild wird vor dem Upload auf dem Gerät neu geschrieben**, auch das
    Foto einer Verordnung aus dem Dateiwähler (Punkt 34)?
    *Empfehlung: ja.* Eine Regel für alle Bilder statt zweier; der kleine
    Qualitätsverlust der Neukodierung ist bei einem Rezept unerheblich.
13. **Keine Vorschaubilder in der Liste, kein Download, kein Teilen**
    (Punkt 40) — auch wenn das weniger bequem ist als die Mediathek?
    *Empfehlung: ja.* Jede Vorschau wäre ein Verweis auf Vorrat; ein Foto
    öffnest du bewusst.
14. **Office sieht Patientenfotos wie jeden klinischen Inhalt** (Punkt 37,
    §4.3)?
    *Empfehlung: ja* — so hast du es mit E15 festgelegt, und das Auditlog
    kompensiert. Willst du Office bei Fotos ausnehmen, ändert das §4.3, nicht
    diesen ADR; der Mechanismus dafür (`app.can_see_patient_file_type`)
    existiert noch.

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

## Quellen der Recherche vom 2026-09-26 (Fassung 2)

Diesmal aus der lokalen Umgebung abgerufen, ohne Egress-Sperre:

- **§630f BGB** (`gesetze-im-internet.de/bgb/__630f.html`), jetzt aus der
  Primärquelle: Absatz 2 verlangt, „sämtliche aus fachlicher Sicht für die
  derzeitige und künftige Behandlung wesentlichen Maßnahmen und deren
  Ergebnisse aufzuzeichnen", Absatz 3 die zehnjährige Aufbewahrung der
  Behandlungsakte. Punkt 35 stützt sich auf Absatz 2: Die Pflicht gilt dem
  Inhalt, den der Eintrag trägt.
- **W3C, HTML Media Capture** (`w3.org/TR/html-media-capture/`): Mit
  `capture` SOLL der Browser einen Aufnahmedialog öffnen — eine Empfehlung,
  keine Zusage (Punkt 33). Dieselbe Spezifikation verbietet dem Browser, die
  Aufnahme abzulegen; sie bindet aber nur den Browser, nicht die Kamera-App,
  an die er übergibt.
- **MDN, `MediaDevices.getUserMedia()`**: nur in sicheren Kontexten (HTTPS,
  `localhost`), sonst ist `navigator.mediaDevices` nicht vorhanden; Freigabe
  über `Permissions-Policy: camera=(self)`; Bild und Ton werden getrennt
  angefordert.
- **Neukodierung über `canvas`** entfernt EXIF, XMP, IPTC und eingebettete
  Vorschaubilder — **nur aus Sekundärquellen** (Entwicklerartikel auf
  `dev.to`, Werkzeugseiten). Deshalb verlangt Punkt 34 den Nachweis durch
  einen Test und stützt sich nicht auf diese Aussage.
- **Einordnung von Verlaufsfotos** — **nur Sekundärquellen**
  (Datenschutzberatungen und Praxisleitfäden, darunter
  `community.robin-data.io`, `dr-datenschutz.de`, `munas.de`): Medizinisch
  notwendige Fotodokumentation wird dort überwiegend auf Art. 9 Abs. 2 lit. h
  DSGVO gestützt und als Teil der Akte geführt; eine Einwilligung verlangen
  sie für Zwecke darüber hinaus. Punkt 35 weicht davon bewusst ab; das ist
  der erste Prüfpunkt für B2 (Konsequenzen, Bestätigungsfrage 9).
- **Erwägungsgrund 51 DSGVO**: Lichtbilder sind nur dann biometrische Daten,
  wenn sie mit speziellen technischen Mitteln verarbeitet werden, die eine
  eindeutige Identifizierung ermöglichen (Punkt 39). Aus der Erinnerung
  zitiert, nicht in dieser Sitzung abgerufen.

**Rechtsberatung ersetzt auch das nicht.** Einordnung, Wortlaut der
Einwilligung und Frist gehen mit B2 an die Prüfung (Punkt 41).

## Änderungshistorie

| Fassung | Datum | Änderung |
|---|---|---|
| 1 | 2026-09-12 | angenommen, alle acht Bestätigungsfragen wie empfohlen |
| 2 | 2026-09-26 | **vorgeschlagen:** Abschnitt G (Punkte 31 bis 42) gibt Fotos von Patient:innen frei — Einwilligung als Rechtsgrundlage, eigene Klasse `patientenfoto` mit zwölf Monaten Frist, Aufnahme nur über den Kameradialog, keine Aufnahmemetadaten, Vergleich ohne Bewertung; Fotos von Dokumenten auf demselben Weg. Punkte 1 bis 30 unverändert; Vermerke an Punkt 30, „Bewusst nicht Bestandteil" und der HEIC-Folgefrage. Anlass: DOK-006, Produktgespräch vom 2026-09-23 |
