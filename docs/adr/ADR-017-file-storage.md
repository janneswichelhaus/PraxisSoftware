# ADR-017: Dateiablage — Ort, Zugriff, kurzlebige Verweise, Aufbewahrung, Virenprüfung
## Status
**Angenommen** (Jannes), geltend **Fassung 12** (2026-10-20); Fassung 9 vorgeschlagen, Fragen 33, 34 offen.

## Kontext
ADR-015 Punkt 10 wählt Supabase Storage; dieser ADR (E8) setzt vor OPS-001 die Regeln aus §4.7, §12,
ADR-004 Punkt 6, ADR-008 und ADR-012 Punkt 5, da Storage Anbieter, Projekt und Vertrag der Datenbank
teilt (§16). **Nicht Bestandteil:** Freigabe von Supabase (OPS-001, ADR-002), Entstehung des
Rechnungs-PDF (B14; ein Browser-Druck ist keines), elektronische Signaturen (IDEA-PRX-015 verworfen,
E-13), Volltextsuche, Texterkennung, Bildtransformation (Punkt 34 ist keine), KI auf Dateiinhalten
samt Transkription (ADR-005), Sprachdokumentation (§6.3), Aussehen der Oberfläche.

## Entscheidung
### A. Ort, Abgrenzung, Anbieter
1. **Ort.** Supabase Storage im Datenbankprojekt, EU-Region (ADR-015 Punkte 10, 19), *(Fassung 10)*
   außer Profilbildern (Punkt 91); kein zweiter Anbieter, fremdes CDN, öffentlicher Bucket.
2. **Kein neuer Dienstleister.** OPS-001 prüft zusätzlich, aus Verträgen belegt: (1) der AVV deckt
   die Storage-Objekte (§3.5); (2) Unterauftragskette, Region, Verschlüsselung im Ruhezustand
   (ADR-002 Punkt 3); (3) wann ein gelöschtes Objekt auch aus Cache, Replikaten, Sicherungen weg ist
   (ADR-008 Punkt 3); (4) S3-Zugang, Kosten, Ziel der Objektsicherung als eigene Verarbeitung (EU,
   AVV); (5) ein Entzug signierter Verweise ohne Support käme hinzu, ohne Punkt 15 zu verlängern.
   Vor positivem OPS-001 kein produktiver Bucket, keine Datei mit Personenbezug (ADR-015 Punkt 18).
3. **Ein privater Bucket je Datenklasse,** angelegt mit ihrer ersten Datei (ADR-014, §14;
   `app.patient_file_bucket_for`): `patientenakte`, für Abrechnungsbelege mit ABR-EPIC-002b.
4. **Keine Anwendungsdateien;** Wortmarke, App-Symbole byte-gleich aus `marke/` (MARKE-001).
5. **Schlüssel aus Kennungen:** `<organization_id>/<bezugsdatensatz_id>/<datei_id>`, ohne Endung,
   Name, Datum, Titel (ADR-011, §3.6); Organisation vorn, in Policies prüfbar (ADR-003).

### B. Die Datenbank führt, nicht der Bucket
6. **Die Zeile ist die Wahrheit.** Je Datei eine Zeile (`patient_files`): Organisation,
   Bezugsdatensatz, Dokumentart, Anzeigename, MIME-Typ, Größe, SHA-256, Zustand, hochgeladen von und
   am. Objekt ohne Zeile ist Abfall, Zeile ohne Objekt ein Fehler.
7. **Zwei Phasen.** (a) `prepare_patient_file_upload` legt die Zeile `pending` an und prüft die
   Berechtigung, bevor Bytes fließen; (b) der Browser lädt unter dem Schlüssel hoch; (c)
   `confirm_patient_file_upload` prüft Größe und MIME-Typ und setzt `ready`, die Prüfsumme die
   Prüfung am Inhalt (Punkt 49). Nur `ready` ist
   sichtbar und verweisbar; `pending` über 24 Stunden fällt samt Objekt. *(Fassung 3)* Der MIME-Typ
   ist Browserangabe (ANN-053); Inhalt: Punkt 49.
8. **Unveränderlich:** kein Überschreiben (`upsert` aus, kein UPDATE auf `storage.objects`);
   Berichtigung als neue Datei mit Verweis auf die ersetzte (bleibt bis zur Frist; ADR-016, §13).
9. **Die Prüfsumme** belegt die abgelegte Fassung (ADR-009 Punkt 9) und deckt Bitfehler auf.
10. **Bezugsdatensatz Pflicht** (etwa Verordnung, Patient:in, Rechnung, Termin), keine allgemeine
    Ablage (ADR-008); bei mehreren Kontexten einmal abgelegt und verlinkt, nie doppelt.

### C. Zugriff und Auslieferung
11. **Zwei Schichten:** Policy-Layer und RLS auf `storage.objects` aus denselben
    `app.can_*`-Funktionen (ADR-004 Punkte 5, 6, §4.7); `service_role` erreicht nie den Browser.
12. **Dokumentart.** Fester Katalog, keine freie Eingabe, keine Datei ohne Art; klinisch (Befund,
    Arztbrief, Verordnungsscan, klinisches Bild) für `owner`, `therapist`, `team_lead`,
    organisatorisch (Einwilligung, Vertrag, Rechnung, Kostenvoranschlag) auch `office` (§4.3); der
    strengste Inhalt entscheidet (ANN-011). *(Vermerk E15, ADR-004 Fassung 2)* `office` liest auch
    Klinisches (ROL-EPIC-001); der Schnitt bleibt für Patient:innen, Dritte, Rechnungssicht.
13. **Schreibrecht** am Bezugsdatensatz für Hochladen, Artkorrektur, Löschen; die Artkorrektur ist
    ein protokollierter Vorgang therapeutischer Rollen, *(Fassungen 2, 3)* nie bei Fotos (Punkt 47).
14. **Patient:innen laden in V1 nichts hoch, sehen nichts,** *(Fassung 5)* außer nach Punkt 59.
15. **Ausgeliefert nur über signierte Verweise,** auf ausdrückliche Aktion, je Zugriff neu, 60
    Sekunden gültig; nie im Voraus, für Listen, gespeichert, per E-Mail, in der Adresszeile
    (ADR-011). *(Fassung 3)* Downloadnamen nur beim Herunterladen (Punkt 55). *(Fassung 10)*
    Profilbilder: Punkt 92.
16. **`cacheControl: '0'`:** Das CDN liefert nach Ablauf nichts; Entzug nur durch Löschen.
17. **Kein Teilen-Link:** Verweise sind unwiderruflich (außer per Support). Befunde an Ärzt:innen
    gehen außerhalb der Anwendung, auf Verantwortung der Sendenden; Versand erst nach PAT-006, B2.
18. **Allowlist** am Bucket und bei der Bestätigung (Punkt 7c): PDF, JPEG, PNG, höchstens 10 MB,
    erweitert nur für einen Fall; nie SVG, HTML, Office, Archive, Videos, Ausführbares.
    *(Fassung 5)* WebM, MP4 ohne Ton an Rückfragen (Punkt 63); *(Fassung 9)* WebM (Opus), MP4 (AAC)
    nur mit Ton als Sprachnachricht (Punkt 84).
19. **Sichere Anzeige:** PDF, Bild im eigenen Rahmen; kein eingebettetes HTML, keine Bibliothek, die
    Fremdes ausführt, keine Anbietervorschau. Video an Rückfragen im Medienelement
    (Punkt 69); *(Fassung 9)* Ton ebenso.

### D. Audit
20. **ADR-010 regelt das Auditlog** *(Vermerk LOG-EPIC-001; dort Punkte 14 bis 16, 22)*: von Dateien
    `patient_file.downloaded` (Punkt 55) und die Herausgabe an die Person (Punkte 40, 96), nicht
    Anzeigen, nicht Plattformabruf; Schreibvorgänge
    belegt das Datenmodell (Zeile, `ordered_by`). Protokollvorgaben dieses ADR gelten nur, soweit
    ADR-010 sie nennt; nie Anzeigename, Objektschlüssel, Inhalt (ADR-011).
21. **Protokolliert wird die Ausstellung des Download-Verweises, nicht das Laden** (Punkt 55); ob
    Bytes flossen, steht nicht fest (so in DSFA und Verfahrensbeschreibung).
    *(Vermerk FIX-015, BEF-004, ANN-052)* Signieren, Laden, Auflisten, Kopieren nur gegen einmalige,
    30 Sekunden gültige Freigaben aus `issue_patient_file_link`, Entfernen nur gegen die nur dafür
    taugende aus `claim_storage_deletion_order`.
22. **Das Auflisten der Dateien** ist kein Auditereignis, das Öffnen der Akte schon (ADR-010).

### E. Aufbewahrung, Löschung, Sicherung
23. **Klasse vom Bezugsdatensatz,** keine Datei ohne (`retention_classes`): Verordnungsscan,
    Klinisches `patientenakte` (§ 630f BGB, ADR-008 Punkte 4, 11: zehn Jahre nach Abschluss der
    Versorgung), Abrechnungsbelege die steuerliche Klasse. *(Fassung 2)* `patientenfoto`: Punkt 38.
24. **Der Legal Hold** der Patient:in erfasst ihre Dateien (ANN-033), keiner je Datei.
25. **Löschen mit Quittung:** `apply_retention` löscht die Zeile und schreibt einen Auftrag
    (`storage_deletion_orders`), ein angemeldeter Vorgang führt ihn aus, erst
    `receipt_storage_deletion_order` schließt ab. Offene Aufträge sind sichtbar, im monatlichen
    Bericht (ADR-010 Punkt 6); nach Freigabe der Edge Runtime (OPS-001) darf er automatisch laufen.
    Das Löschjournal (ANN-031) belegt die Zeile.
26. **Objekte sichern** (nicht im Datenbank-Backup): keine produktive Datei ohne dokumentierte und
    getestete Sicherung und Wiederherstellung (ADR-012 Punkte 5, 6; OPS-003). Wiederherstellung:
    Datenbank, Objekte, dann Löschjournal, offene Aufträge erneut (ADR-008 Punkt 8); RPO ≤ 1 Stunde
    (ADR-012 Punkt 1).
27. **Abgleich,** wiederkehrend: verwaiste Objekte löschen, fehlende als sichtbaren Fehler zeigen
    (`list_missing_patient_file_objects`), nie still (§13).

### F. Virenprüfung und Uploads Dritter
28. **Keine Virenprüfung** *(Fassung 7)*, auch nicht beim Anbieter. Hoch laden Praxiskonten auf
    Praxisgeräten, von außen nur nach L; Kompensation: Punkte 8, 18, 19, 49 bis 52,
    BETRIEB-001.
29. *Entfallen (Fassung 7):* Virenprüfung vor Uploads von außen (an Rückfragen schon Fassung 6),
    Jannes: „Keine Virenprüfung in der gesamten Anwendung!“; ADR-026 abgelehnt.
30. **Nicht freigegeben:** Fotos und Videos von Patient:innen (`IDEA-KOM-003`), Anhänge im Teamchat
    (TEAM-001), Uploads aus einem Portal, Versand aus der Anwendung (Punkt 42), außer nach G
    (Fassung 2), L (Fassung 5), M (Fassung 8).

### G. Fotos (Fassung 2)
31. **Dokument oder Person.** Ein Foto eines Dokuments (Verordnung, Anamnesebogen, Einwilligung) ist
    eine Datei nach A bis F, mit seiner Art, Klasse `patientenakte`, neu nur Aufnahme und Metadaten
    (Punkte 33, 34). Was die Praxis von der Person aufnimmt (Körperregion, Haltung, Narbe), ist ein
    Foto der Person, auch mit Dokument im Bild, *(Fassung 3)* nach Punkt 43; `klinisches_bild`
    bleibt fremde ärztliche Bildgebung.
32. **Eigener Bucket.** `patientenfoto` nimmt den Weg jeder Datei (Punkte 6 bis 27), mit drei
    Abweichungen: keine Artkorrektur, kein Downloadname, Klasse nach der Art (Punkte 13, 15, 38).
    Bucket `patientenfotos`, nur JPEG, höchstens 10 MB, Bezugsdatensatz die Patient:in; falsche Art:
    löschen, neu aufnehmen. *(Fassung 3)* Punkte 45, 47.
33. **Nur der Kameradialog** (`getUserMedia`, nur Bild), ohne Dateiwähler, auch bei verweigerter
    Kamera, nie `<input type="file" capture>` (W3C HTML Media Capture). Bis zum Upload nur im
    Arbeitsspeicher (ADR-001 Punkt 2): ohne Verbindung kein Foto, bei Fehler Hinweis und
    Wiederholung, solange die Seite offen ist, Warnung vor dem Verlassen (§13); die Kamera läuft nur
    im offenen Dialog bis zum Auslösen. Dokumentfotos: Kameradialog angeboten, Dateiwähler bleibt
    (§5: SOLLTE). Permissions-Policy für die eigene Herkunft in jeder Auslieferung samt
    `scripts/testumgebung.mjs` (ganzer Wert getestet): `camera=(self)`, Mikrofon gesperrt, *(Fassung
    9, Frage 34)* `microphone=(self)` (Punkt 83); Zahlung und USB gesperrt; Diktat (§6.3) nur mit
    eingerichtetem Gateway. Die Herkunft prüft kein Server (ANN-053; Punkt 28).
34. **Keine Aufnahmemetadaten.** Kamerabilder entstehen aus Pixeln ohne EXIF, XMP, IPTC (kein Ort,
    Gerät, Zeit, Vorschaubild); JPEG und PNG aus dem Dateiwähler verlieren vor dem Upload
    verlustfrei ihre Metadatensegmente bis auf die Ausrichtung (Farbprofil: Punkt 53). Prüfsumme
    über die bereinigten Bytes; Ort und Gerät hält niemand fest (§20). Tests belegen es (Bild mit
    Ort und Vorschaubild, Kamerabild ohne EXIF); PDF bleibt unverändert.
35. **Einwilligung als Grundlage** der Arbeitshilfe, eigen und ausdrücklich (Art. 9 Abs. 2 lit. a
    DSGVO), nicht der Behandlungsvertrag, *(Fassung 3)* nicht beim Dokumentationsfoto. Ein Foto
    ersetzt keinen Eintrag (§ 630f Abs. 2 BGB), Wesentliches steht in Worten darin; der Widerruf
    (Art. 7 Abs. 3 DSGVO) beseitigt die Fotos. Zweck in `patient_privacy_records` (ANN-093), Papier
    bleibt Quelle (E-13): Vermerk mit dem Tag des Papiers, Scan als `einwilligung`, Ablehnung als
    dritter Vermerk (ANN-127). Der Wortlaut (B2) deckt Aufnahme im Team, Ablage neben der Akte,
    Sichtbarkeit, Vergleich, Frist, Widerruf mit Löschung; nicht abgedeckt und nicht gebaut:
    Weitergabe (auch an Verordnende), Veröffentlichung, Schulung, Werbung, KI. Ohne Einwilligung
    gleiche Behandlung (Art. 7 Abs. 4 DSGVO), die Erstaufnahme (PRX-EPIC-003) führt „abgelehnt“ als
    erledigt. Gesicht nur als betroffene Region, der Dialog sagt es (Art. 5 Abs. 1 lit. c DSGVO).
36. **Server prüft, Widerruf sperrt.** Eine Prüfung (`app.patient_photo_accessible`) für
    Vorbereitung, Bestätigung, Liste, Verweis, nicht in der Oberfläche (§4.7). Neue Fotos brauchen
    eine Erteilung als jüngsten Vermerk; ein Foto mit späterem Widerruf ist gesperrt und fällig,
    auch bei neuer Einwilligung. In derselben Transaktion: Sperre auf allen vier Wegen, Zeilen und
    Löschaufträge (Art. 17 Abs. 1 lit. b DSGVO), `deletion_journal` (ANN-031); Objekt nach Punkt 25.
    Geht ein Widerruf durch Wiederherstellung verloren, trägt OPS-003 ihn vom Papier nach (E-13).
    Vermerken darf auch `office`; die Löschung folgt der Erklärung, nicht Punkt 37. Unter Legal Hold
    gesperrt, gelöscht mit seinem Ende (Art. 17 Abs. 3 lit. e DSGVO). *(Fassung 3)* Punkt 46.
37. **Klinische Rollen:** Aufnehmen, löschen jederzeit `owner`, `therapist`, `team_lead` (Punkt 13;
    *(Fassung 3)* Dokumentationsfoto: Punkt 48); `office` liest wie Klinisches, enger nur über §4.3.
    Fotos gehören zur Behandlung (§4.8, ADR-021), in V1 nicht zu Training und Plattform (§4.6).
38. **Frist** *(Fassung 3: nur der Arbeitshilfe)*: zwölf Monate nach Aufnahme, spätestens drei
    Monate nach Abschluss der Versorgung oder mit dem Widerruf; Klasse `patientenfoto`, Anker
    `care_concluded_at`, nicht der zurückdatierbare `care_concluded_on` (ANN-032), Obergrenze per
    `app.retention_upper_interval` (ANN-001). `apply_retention` löscht automatisch, Legal Hold hält
    an, Löschdatum sichtbar; keine Verlängerung in V1; Zahlen validiert die DSFA (ADR-008).
39. **Vergleich ohne Bewertung:** zwei Fotos derselben Person gleich groß nebeneinander, nur mit
    Datum, Name, aufnehmender Person; keine Aussage zum Unterschied (§17, ADR-006 Punkt 11), keine
    automatische Ausrichtung, Überlagerung, Vermessung, Markierung (Erwägungsgrund 51 DSGVO). Nie an
    das AI Gateway (ADR-005), auch nicht zur Verordnungserkennung (KI-EPIC-002).
40. **Nur in der Anwendung:** keine Galerie, kein Download, kein Teilen; Verweis ohne Downloadnamen,
    `fetch` mit `cache: 'no-store'`, Anzeige aus einer Objekt-URL, beim Schließen freigegeben, kein
    Fenster. Liste: Datum, Name, aufnehmende Person, Löschdatum, keine Vorschau. Einzige Herausgabe
    an die Person (Art. 15 Abs. 3, Art. 20 DSGVO) durch `owner` (OPS-006) als Einzeldatei,
    `patient_file.handed_out` (ANN-128). Bildschirmfotos: Verfahrensbeschreibung, BETRIEB-001.
41. **Synthetisch gebaut,** mit Chromiums künstlicher Kamera; kein Foto echter Personen in Tests,
    Bildschirmfotos, Test-Umgebung (§3.1). Echte Personen erst nach B2 (Einwilligung, Frist) und
    DSFA (ADR-007, G14), dazu Punkte 2, 26; das Bauen wartet nicht (§15.2).
42. **Weiter nicht frei:** Video und Audio von Patient:innen, Fotos im Training, Uploads durch
    Patient:innen oder über die Plattform, Video im Teamchat, Versand; geschickte Bilder legt die
    Praxis in V1 nicht ab, ihr Inhalt gehört in den Eintrag. Ausnahmen: L, M; N gibt nur Ton aus dem
    Team frei, Audio von Patient:innen bleibt überall aus.

### H. Drei Arten von Fotos (Fassung 3)
43. **Drei Arten nach Zweck:** Foto eines Dokuments (Punkt 31); `dokumentationsfoto`, für die
    Dokumentation erforderlich (Ausgangsbefund, Wunde, Narbe, Schwellung), Teil der Akte (§ 630f
    BGB); Arbeitshilfe (`patientenfoto`) für Übergabe, Vergleich, Punkte 35 bis 38, *(Fassung 4)*
    keine neue. Den Zweck wählt die Therapeut:in fachlich; die DSFA (G14) bewertet beide getrennt.
44. *Entfallen (Fassung 4):* die Wahl der Fotoart vor der Aufnahme (Punkt 56).
45. **Dokumentationsfoto zur Akte.** Grundlage die Behandlung (Art. 9 Abs. 2 lit. h DSGVO, § 22
    Abs. 1 Nr. 1 lit. b BDSG, ANN-093), keine Einwilligung, nicht Punkt 36; Einordnung in B2
    (§15.2). Klasse und Bucket `patientenakte` (Punkte 23, 24), nur JPEG (Punkt 7a); sonst wie die
    Arbeitshilfe (Punkte 32 bis 34, 37, 39, 40; Gesicht: 35). Ersetzt keinen Eintrag (§5, §17).
46. **Widerruf nur für Arbeitshilfen;** Löschverlangen zu Dokumentationsfotos beantwortet OPS-006:
    Die Aufbewahrungspflicht geht vor (Art. 17 Abs. 3 lit. b DSGVO). Legal Hold hält beide.
47. **Keine Korrektur zwischen den Arten,** in keine Richtung; was nachträglich zur Dokumentation
    gehört, wird neu aufgenommen oder in Worten eingetragen.
48. **Löschen am Aufnahmetag:** nur dann die aufnehmende Person oder `owner` (Fehlaufnahme,
    Punkt 20), danach nur der Löschlauf (§ 630f Abs. 1 BGB, ADR-016).

### I. Prüfung am Server und Farbe (Fassung 3)
49. **Prüfung am Inhalt** nach Phase (c): (1) Typ an der Signatur gegen Allowlist (Punkte 18, 45)
    und Ankündigung, (2) SHA-256 der abgelegten Bytes gegen die angekündigte, (3) bei JPEG und PNG
    Metadatenfreiheit nach der Liste des Geräts (Punkt 34, ANN-125); Ergebnis an der Zeile
    (`record_patient_file_verification`).
50. **Edge Function `patient-file-verify`** desselben Projekts: kein neuer Anbieter, aber Edge
    Runtime (ADR-015 Punkt 20), daher scharf erst mit OPS-001. Eigener Service-Schlüssel, schreibt
    nur das Ergebnis, loggt nur Kennung, Ergebnisklasse, Dauer (ADR-011). *(Fassung 7)* Keine
    Virenprüfung. *(Fassung 10)* Punkt 90.
51. **Bis dahin gekennzeichnet:** ungeprüft sichtbar „nicht serverseitig geprüft“, ohne Edge Runtime
    trotzdem `ready`; scharf macht `app.patient_file_verification_required` die Prüfung zur
    Bedingung (ADR-007 Punkt 5, ANN-094).
52. **Befund heißt Verwerfen:** Falscher Typ, andere Prüfsumme, fremde Metadaten: nicht `ready` oder
    gesperrt, Objekt per Löschauftrag weg, die hochladende Person informiert; nie umschreiben
    (Punkte 8, 9).
53. **sRGB:** Ein Bild aus dem Dateiwähler mit Farbprofil rechnet das Gerät vor dem Entfernen nach
    sRGB um und kodiert neu (begrenzte Ausnahme, ANN-125); ohne Profil byte-gleich.

### J. Öffnen heißt Anzeigen (Fassung 3)
54. **Der Anzeigeweg aus Punkt 40 gilt für alle Arten** (BEF-059), *(Fassung 4)* PDF: Punkt 58;
    keine neue PDF-Bibliothek.
55. **Herunterladen** außer `dokumentationsfoto` und `patientenfoto` als eigene Aktion mit
    Downloadnamen: `patient_file.downloaded`.

### K. Ein Zweck für Fotos der Person, PDF im Rahmen (Fassung 4)
56. **Fotos aus der Dokumentation** sind Dokumentationsfotos, ohne Rückfrage (BEF-135, ANN-221);
    Anmeldebogen und Rezept als Foto eines Dokuments an ihrer Stelle, die daran erinnert, solange
    sie fehlen.
57. **Keine neue Arbeitshilfe:** `prepare_patient_file_upload` weist `patientenfoto` ab, die
    Fotoeinwilligung wird nicht mehr angeboten; vorhandene (synthetische) laufen nach Punkten 35 bis
    38 aus; Widerruf, Löschlauf, Art, Klasse und Bucket bleiben.
58. **PDF ohne `sandbox`** (BEF-133, ANN-223): Objekt-URL mit festem Typ `application/pdf`; die CSP
    erlaubt nur zusätzlich `frame-src blob:`, `object-src 'none'` bleibt; Ausweg Punkt 55.

### L. Foto und Video an einer Rückfrage (Fassung 5)
59. **Freigabe** (KOM-EPIC-002): Die Person oder ihre gesetzliche Vertretung, nie eine Begleitperson
    (ADR-023), hängt an die eigene Rückfrage (KOM-EPIC-001) ein Foto oder Video, höchstens drei je
    Vorgang, im Nachsorge-Abo (§4.6, Stufe 2) und im Training (§4.10), nicht in der Behandlung
    (Stufe 1). Antwort der Praxis ohne Anhänge. Ausnahme nur hierfür von Punkten 14, 18, 30, 37, 42.
60. **Eigener Weg:** `platform_message_attachments`, Klasse `rueckfrageanhang`, eigener Bucket,
    Bezug die Rückfrage; sonst Punkte 5, 7 bis 9, 15 bis 17, 25, 27, 49 bis 52, 54.
61. **Eigene Einwilligung** (Art. 9 Abs. 2 lit. a DSGVO) als Zweck in `patient_privacy_records`
    (Abo) und `training_consent_records`, auf der Plattform erteilt und widerrufen (POR-016), beim
    ersten Anhängen angeboten, nie gesammelt; ohne sie Rückfrage in Worten (Art. 7 Abs. 4 DSGVO).
    Widerruf löscht sofort alle Anhänge der Person (Punkt 36); Wortlaut als Annahme, B2.
62. **Nur in der Anwendung:** Foto im Kameradialog, Video im gleichartigen Dialog (`MediaRecorder`),
    nur Bild, höchstens 30 Sekunden, nur im Arbeitsspeicher, nie Dateiwähler; Gesicht nur, wenn es
    die Bewegung zeigt; der Dialog sagt es (Punkt 35). *(Fassung 9)* Trotz freiem Mikrofon kein Ton:
    Dialog (`audio: false`), Gerät, Server (Punkte 63, 64), gegen fremden Code die CSP (`script-src
    'self'`).
63. **Formate:** Foto JPEG, Video WebM (VP8/VP9) oder MP4 (H.264) ohne Tonspur, höchstens 10 MB (am
    Bucket und bei der Vorbereitung durchgesetzt), Bitrate für 30 Sekunden; der Server prüft die
    Signatur und lehnt Ton ab.
64. **Keine Metadaten:** Ort, Gerät fehlen; Zeit-, Programmangaben leert das Gerät (Tests, iPhone).
65. **Frist 30 Tage** nach Aufnahme, automatisch, Legal Hold hält an, Löschdatum sichtbar, fällt mit
    dem Vorgang, keine Verlängerung; die DSFA validiert (ADR-008).
66. **Nicht in Akte oder Trainingsprotokoll:** Bei Zuordnung (KOM-004) gehen nur die Worte mit; was
    ein Anhang zeigt, schreibt die Therapeut:in in Worten in den Eintrag (Punkt 35); Anhänge
    behalten Klasse und Frist, werden kein Dokumentationsfoto.
67. **Sehen und Löschen:** Sehen: Person und gesetzliche Vertretung, nie Begleitperson; in der
    Praxis, wer die Rückfrage lesen darf (`app.can_read_platform_message`, auch `office`, BEF-137).
    Öffnen ist Anzeigen ohne Download, Teilen, Vorschau, ohne neues Protokoll (ADR-010 Punkt 14).
    Löschen: die Person jederzeit, die Praxis mit Antwortrecht (`ordered_by`). *(Fassung 12)* Punkt
    96.
68. **Zeitmarke, kein Urteil:** Die Antwort darf auf eine Videostelle zeigen, auf der Plattform
    springt ein Tipp dorthin; keine Zeichnung, kein
    Einzelbild als Datei, kein Nebeneinander, keine Auswertung (`IDEA-KOM-005`), nie AI Gateway.
69. **Ohne Virenprüfung** *(Fassung 6)*: Anhänge werden nach Punkt 49 `ready` mit sichtbarem „nicht
    auf Schadsoftware geprüft“, `app.message_attachment_scan_required()` bleibt aus (KOM-013); dafür
    Aufnahme nur in der Anwendung, Signatur- und Containerprüfung, nur im Medienelement.
70. **Scharf erst nach** B2 (Einwilligung, Frist, Video als identifizierend), DSFA (G14), OPS-001,
    OPS-003, *(Fassung 6)* ohne Prüfer-ADR; gebaut mit Aufnahmen aus Chromium.

### M. Anhänge im Teamchat (Fassung 8)
71. **Freigabe:** Wer im Teamchat schreibt (ANN-611, nur Praxiskonten), hängt in Kanal, privatem
    Kanal, Direkt-, Gruppennachricht, Radflotte, Thread bis zu fünf Fotos (JPEG, PNG) oder PDF an,
    je höchstens 10 MB, nicht an geplante; kein Video, *(Fassung 9)* Sprachnachrichten nach N.
72. **Keine Patientendaten:** Anhänge nie in die Akte; Fotos von Patient:innen, Befunde, Arztbriefe
    gehören in sie (§10), der Hinweis „Befunde und Diagnosen gehören in die Akte.“ gilt auch hier.
73. **Eigener Weg:** `team_message_attachments`, eigener Bucket, Klasse `teamchat`, Bezug die
    Nachricht, sonst Punkt 60; vor dem Senden hochgeladen, ohne Nachricht nach 24 Stunden verworfen.
74. **Aufnahme:** Foto im Kameradialog oder per Dateiwähler samt Mediathek, PDF per Dateiwähler;
    Metadaten fallen auf dem Gerät (Punkte 34, 53); nur im Arbeitsspeicher, Wiederholung, solange
    die Seite offen ist. Die Nachricht geht erst hinaus, wenn ihre Anhänge oben sind;
    nur das Senden selbst wartet dann im Ausgang (ANN-641). *(Fassung 9)* Senden geht schon beim
    Hochladen: Sie wartet sichtbar im Ausgang, im Arbeitsspeicher wie ihre Anhänge, und geht von
    selbst, wenn alle oben sind; scheitert einer endgültig, bleibt sie mit Grund stehen (ANN-654).
75. **Frist der Nachricht** (zwölf Monate, ADR-008 Punkt 12, ANN-610): fällt mit ihr, ihrem Inhalt
    (Anker ohne Inhalt), dem Gespräch, mit Löschjournal und Löschauftrag; keine Verlängerung.
76. **Sehen:** wer die Nachricht lesen darf; privat nur Mitglieder, auch nicht `owner` (ANN-642).
77. **Anzeigen:** eine Zeile mit Art, Name, Größe, ohne Vorschau, Öffnen im Rahmen (Punkte 54, 58),
    kein Herunterladen, kein Teilen (§10). *(Fassung 9)* Punkt 86.
78. **Protokoll:** nichts Neues (ADR-010 Punkte 14 bis 17); die Zeile zeigt, wer was wann anhängte.
79. **Löschen:** vor dem Senden einzeln, danach mit der Nachricht (ANN-611), einzeln in V1 nie.
80. **Je Gespräch:** Liste mit Art, Name, Größe, wer, wann, ohne Vorschau; keine Suche darin.
81. **Scharf** mit OPS-001 und OPS-003; gebaut mit synthetischen Dateien.

### N. Sprachnachrichten im Teamchat (Fassung 9)
82. **Freigabe:** eine in der Anwendung aufgenommene Sprachnachricht als einer der fünf Anhänge,
    nicht an geplante; kein Video, kein Ton aus Dateien, keine Transkription, kein AI Gateway
    (ADR-005), keine Suche; Stimme nur zur Absprache, nie zur Auswertung (§20).
83. **Aufnahme sichtbar:** nur auf den Tipp „Sprachnachricht aufnehmen“, mit laufender Zeit (§6.3);
    Ende mit „Fertig“, nach zwei Minuten, bei verborgener Seite oder fehlendem Mikrofon; „Abbrechen“
    verwirft; danach enden die Spuren; nur im Arbeitsspeicher.
84. **Format:** WebM (Opus) oder MP4 (AAC) aus `MediaRecorder`, nur Ton, begrenzte Bitrate,
    höchstens 10 MB; das Gerät leert Angaben, der Server prüft die Struktur (nur Tonspuren, kein
    Kopf mit Angaben) ohne Umschreiben; Dauer vom Gerät, nur zur Anzeige (ANN-655).
85. **Hinweis im Dialog:** Gespräche mit Patient:innen und Befunde gehören nicht hierher.
86. **Abspielen:** eine Zeile mit Dauer und Größe; erst ein Tipp lädt, dann im Medienelement ohne
    Download (`controlsList="nodownload"`), mit Hinweis, wo ein Gerät das Format nicht kann (WebM
    vor iOS 17.4); sonst Punkte 75, 76, 78, 79.
87. **Scharf** mit OPS-001 und OPS-003, eigene Verarbeitung in der Prüfung vor dem Go-live (ADR-007,
    ANN-655); gebaut mit Chromiums künstlichem Mikrofon.

### O. Profilbilder im Teamchat (Fassung 10)
88. **Freigabe** (TEAM-007): Wer am Teamchat teilnimmt (ANN-611), setzt sich selbst ein Profilbild,
    freiwillig, jederzeit ersetzbar und entfernbar, niemand sonst, auch nicht `owner`; zu sehen im
    Teamchat und in „Mein Konto“, nie auf der Plattform, in Dokumenten, Rechnungen, Exporten; nie
    Patient:innen darauf (ungeprüft).
89. **Auf dem Gerät gerechnet:** aus einem Foto (Dateiwähler samt Mediathek) ein JPEG aus Pixeln,
    256 × 256, höchstens 64 KiB, ohne Metadaten; das Original bleibt im Arbeitsspeicher. *(Fassung
    11)* Ausschnitt verschiebt und vergrößert (bis dreifach) die Person, das Quadrat bleibt im Foto;
    sonst Mitte, beim Hochformat oben; gerechnet beim Speichern. Keine Gesichtserkennung, kein AI
    Gateway.
90. **Prüfung in derselben Transaktion** (`app.profile_picture_problem`): ganzes JPEG, nur
    Bilddaten- und Adobe-Segment, ein Rahmen 256 × 256, höchstens 64 KiB; belegt ist „kein Segment
    mit Metadaten“, nicht „kein Byte außer Pixeln“; ablehnen ohne Umschreiben, sofort scharf.
91. **In der Datenbank** *(Fassung 10, Umkehr von Punkt 1)*: `staff_profile_pictures`, ein Bild je
    Person, kein Verweis (Punkte 15 bis 17), Löschen mit Löschjournal ohne Auftrag, Sicherung mit
    der Datenbank (Punkt 26 entfällt); Bezug der Mitarbeiterdatensatz, unveränderlich.
92. **Sehen:** wer am Teamchat der Praxis teilnimmt, nie Patient:innen, Kund:innen, Plattform,
    andere Praxis, bei jedem Abruf geprüft; Ausgeschiedene ohne Bild. Als Text an die Sitzung,
    gezeigt aus einer Objekt-URL, ohne Download, in Listen ausdrücklich.
93. **Löschen:** Klasse `profilbild`, sofort mit Entfernen, Ersetzen, Ausscheiden
    (`app.staff_profile_picture_on_leave`), mit Löschjournal (ADR-008 Punkt 8); keine Zeitfrist.
94. **Protokoll:** nichts Neues (ADR-010 Punkte 14 bis 17); die Zeile zeigt das Setzen.
95. **Scharf** mit OPS-001; Grundlage die Einwilligung durch eigenes Hochladen (ANN-667), eigene
    Verarbeitung in der Prüfung vor dem Go-live (ADR-007); nur synthetische Bilder.

### P. Herausgabe der Anhänge an Rückfragen (Fassung 12)
96. **Kopie je Anhang durch `owner`** (BEF-188): Verlangt die Person eine Kopie (Art. 15 Abs. 3
    DSGVO) oder ihre Daten (Art. 20 DSGVO, Einwilligung aus Punkt 61), gibt `owner` jeden
    bestätigten Anhang ihrer Rückfragen als Einzeldatei heraus (Betroffenenrechte an Akte und
    Trainingsverhältnis), geprüft wie die Auskunft, auch gesperrte: Der Legal Hold (ANN-335) gilt
    der Arbeit, nicht der Auskunft (wie Punkt 40, ABN-017); Unbestätigte nennt die Auskunft nur.
    Protokoll: `message_attachment.handed_out` am Gegenstand `platform_message_attachment`, mit Akte
    oder Verhältnis und Sperrstand (ADR-010 Fassung 5, ANN-672). Weg wie Punkt 21: Freigabe nur für
    diesen Anhang und dieses Konto, ohne Downloadnamen, Dateiname ohne Namen der Person. An der
    Rückfrage bleibt es beim Ansehen; Punkt 59 meint die Antwort.

## Konsequenzen
- **Zwei Speicher** laufen auseinander, bleiben Sicherung, Löschung oder Abgleich einseitig.
- **Scharfe Kante:** Eine falsche Dokumentart legt offen (§13); ein Foto der Person als
  `klinisches_bild` umginge Einwilligung und Frist. Dagegen Vorbelegung der Art aus dem Kontext (der
  Scan an der Verordnung ist klinisch) und Punkt 13.
- **Nach außen** bleiben Post, Fax, Postfach (CAL-013), bis B2 antwortet.
- **Die Kamera** gibt es nur über HTTPS oder `localhost`, nicht über eine IP-Adresse im WLAN (E-2a).

## Offene Folgefragen
- **Frage 33** (Fassung 9): höchstens zwei Minuten je Sprachnachricht (Punkt 83)? Empfehlung ja.
- **Frage 34** (Fassung 9): Mikrofon für die eigene Herkunft, jede Seite (Punkt 33)? Empfehlung ja.
- **HEIC** (Punkt 18): Liefert der Dateiwähler am iPhone verlässlich JPEG?
- **Ersetzte Datei** (Punkt 8): „ersetzt“ für alle sichtbar (ADR-016) oder nur therapeutisch?
- **Löschauftrag** (Punkt 25): Wer, wenn Jannes im Urlaub ist, wie lange? BETRIEB-001, G14.
- **OPS-001 negativ:** Regeln bleiben, die Policies auf `storage.objects` nicht (Aufwand `mittel`).
- **Vertretung** (B2, ANN-093): Wer willigt für Kinder, Betreute ein? Nennt der Vermerk, wer?
- **Dokumentationsfoto** (B2): Genügt PAT-006, oder sagt die Therapeut:in es jedes Mal?
- **Bildqualität:** Lesbar? Schritt 10 in `git show 9452575:docs/sichtung/befund.md`.
- **Geschickte Bilder** (42), **PDF-Metadaten** (49), **Verlängerung** (38): entscheidet ein Fall.
- **Dokumentationsfotos auf der Plattform:** entscheidet POR-EPIC-002.

## Änderungshistorie
- Fassung 1 (2026-09-12, Jannes): angenommen, Fragen 1 bis 8 wie empfohlen; E8 erledigt.
- Fassung 2 (2026-09-26, Jannes, Fragen 9 bis 14): Abschnitt G; §5 der Prinzipien, Version 0.18.
- Fassung 3 (2026-10-02, Jannes, Fragen 15 bis 22): H bis J (BEF-105, BEF-106, ANN-126); §5, 0.20.
- Fassung 4 (2026-10-09, Jannes, Abnahme): Abschnitt K; Punkt 44 entfällt; §5, 0.22.
- Fassung 5 (2026-10-10, Jannes, Fragen 23 bis 29): Abschnitt L (KOM-EPIC-002); §5, 0.24.
- Fassung 6 (2026-10-15, Jannes): Rückfrage-Anhänge ohne Virenprüfung, ADR-026 abgelehnt, Schalter
  `external_attachments_enabled` von selbst an (KOM-013).
- Fassung 7 (2026-10-18, Jannes, Frage 1 der PR #272): keine Virenprüfung, Punkt 29 entfällt.
- Fassung 8 (2026-10-18, Jannes, Fragen 30 bis 32): Abschnitt M (TEAM-003).
- Fassung 9 (2026-10-18, vorgeschlagen, Kern Jannes): Abschnitt N (TEAM-004/005), Punkte 33, 71, 74.
- Fassung 10 (2026-10-19, Jannes, Fragen 35 bis 37): Abschnitt O (TEAM-007), Umkehr von Punkt 1.
- Fassung 11 (2026-10-20, Jannes, Befund): Ausschnitt des Profilbilds wählbar (Punkt 89).
- Fassung 12 (2026-10-20, Jannes, Fragen wie empfohlen): Abschnitt P (BEF-188, ANN-672).
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
