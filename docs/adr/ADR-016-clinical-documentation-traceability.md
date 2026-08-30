# ADR-016: Klinische Dokumentation — Nachvollziehbarkeit und Finalisierung

## Status

**Vorgeschlagen** — noch nicht angenommen. Dieser Entwurf ist bis zu einer
ausdrücklichen Entscheidung der Praxisleitung **nicht verbindlich**; er
begründet keinen Implementierungsauftrag. Die unten unter „Offene
Entscheidungen" geführten Punkte sind vor der Annahme zu beantworten.

## Datum

2026-08-30

## Kontext

`PROJECT_PRINCIPLES.md` §5 verlangt, dass Behandlungsdokumentation
nachvollziehbar gespeichert wird, dass eine finalisierte Dokumentation gegen
unbemerktes Überschreiben geschützt ist und dass mindestens Autor,
Erstellungszeitpunkt, Zeitpunkt späterer Änderungen sowie ursprüngliche und
geänderte Version erfasst werden. §5 hält den technischen Mechanismus
ausdrücklich offen.

`docs/decisions/OPEN_DECISIONS.md` führt in Abschnitt D genau diese beiden
Lücken:

- **„finalisiert"** — expliziter Abschlussschritt? Frist? Wer darf
  finalisieren? Kann eine finalisierte Dokumentation je gelöscht werden?
- **„nachvollziehbar"** — Versionierung mit abrufbarem Originalinhalt oder nur
  ein Änderungsprotokoll? Zwei verschiedene Datenmodelle.

Beides muss vor dem ersten Dokumentationsfeature entschieden sein, weil es das
Datenmodell festlegt und nachträglich nur mit erheblichem Umbau korrigierbar
ist (ADR-014).

### Rechtlicher Rahmen

Maßgeblich ist **§ 630f BGB**. Der aktuelle Wortlaut (geprüft am 2026-08-30):

- **Abs. 1 Satz 1** verpflichtet, „in unmittelbarem zeitlichen Zusammenhang mit
  der Behandlung eine Patientenakte in Papierform oder elektronisch zu führen".
- **Abs. 1 Satz 2** erlaubt Berichtigungen und Änderungen von Eintragungen nur,
  „wenn neben dem ursprünglichen Inhalt erkennbar bleibt, wann sie vorgenommen
  worden sind".
- **Abs. 1 Satz 3** stellt klar: „Dies ist auch für elektronisch geführte
  Patientenakten sicherzustellen."
- **Abs. 2** benennt, was aufzuzeichnen ist (Anamnese, Diagnosen,
  Untersuchungen und Ergebnisse, Befunde, Therapien und Wirkungen, Eingriffe
  und Wirkungen, Einwilligungen, Aufklärungen); Arztbriefe sind aufzunehmen.
- **Abs. 3** verlangt die Aufbewahrung für zehn Jahre nach Abschluss der
  Behandlung, soweit nicht andere Vorschriften andere Fristen vorsehen.

**Die Vorschrift schreibt keine Datenbanktechnik vor.** Sie nennt kein
Versionierungsverfahren, kein Änderungsprotokoll und keine bestimmte
Speicherform. Was sie verlangt, ist ein Ergebnis: Der **ursprüngliche Inhalt**
muss neben der Änderung erkennbar bleiben, und der **Zeitpunkt der Änderung**
muss erkennbar sein. Jede Umsetzung, die das zuverlässig leistet, erfüllt die
Norm; jede Umsetzung, die es nur rechnerisch rekonstruieren kann, trägt das
Risiko, es im Streitfall nicht belegen zu können. Die Auswahl unten wird
deshalb an dieser Wirkung gemessen, nicht an einer angeblichen gesetzlichen
Technikvorgabe.

Der Vollständigkeit halber: Für Physiotherapie gelten daneben die
Dokumentationspflichten aus dem jeweiligen Berufs- und Vertragsrecht. Deren
abschließende Prüfung ist nicht Gegenstand dieses ADR und bleibt Teil der
externen Validierung vor Produktivstart (ADR-006, ADR-007).

### Angrenzende bereits getroffene Entscheidungen

- [ADR-001](ADR-001-online-first-limited-offline.md): nicht finalisierte
  Entwürfe dürfen offline entstehen; **finalisiert werden darf erst nach
  erfolgreicher Serversynchronisation**; kein Last-Write-Wins für klinische
  Dokumentation.
- [ADR-004](ADR-004-authorization-model.md): zentraler Policy-Layer plus RLS;
  Antworten sind rollenabhängige Projektionen; Office hat standardmäßig keinen
  Zugriff auf klinische Freitexte.
- [ADR-006](ADR-006-medical-device-boundary.md): Zweckbestimmung von V1 ohne
  diagnostische oder therapeutische Entscheidungsunterstützung; Grenzfälle sind
  `MDR_REVIEW_REQUIRED`.
- [ADR-008](ADR-008-data-retention-and-deletion.md): klinische
  Behandlungsunterlagen zehn Jahre nach Abschluss der Behandlung; danach echte
  Löschung; Legal Hold setzt die automatische Löschung aus; ein dauerhaftes
  Soft-Delete ersetzt die Löschung **nicht**.
- [ADR-009](ADR-009-private-billing-model.md): Leistungen entstehen aus
  durchgeführten Terminen; Rechnungssnapshot beim Ausstellen; ausgestellte
  Rechnungen sind unveränderbar; therapeutische Leistungen sollen erst
  fakturiert werden, wenn die Dokumentation finalisiert ist, mit begründetem
  und protokolliertem Override.
- [ADR-010](ADR-010-audit-and-privileged-access.md): Erstellung, Änderung und
  Finalisierung klinischer Dokumentation sind auditpflichtig; Audit-Einträge
  enthalten **nur Metadaten**.
- [ADR-014](ADR-014-foundational-data-model.md): „klinische
  Versionierungsanforderungen" gehören zu den ab dem ersten Datenmodell
  getragenen Architekturkosten; der Zustandsautomat für Termine ist
  ausdrücklich **nicht** Bestandteil von ADR-014.

## Entscheidungsvorschlag

### A. Gegenstand und Zweckbestimmung

1. Gegenstand ist die **frei befüllbare strukturierte Behandlungsdokumentation**:
   benannte Abschnitte mit Freitext und einfachen Feldern, die die behandelnde
   Person selbst befüllt.
2. **Nicht Bestandteil**: Score-Berechnung, Red-Flag-Logik, klinische
   Ableitungen, Vorschläge, Bewertungen und jede KI-Funktion. Diese
   Abgrenzung ist Teil der Zweckbestimmung und nicht nur ein Lieferumfang.
3. Die **Zweckbestimmung** lautet: Gesundheitsinformationen erfassen,
   strukturieren, speichern, anzeigen und nachweisbar aufbewahren. Sie umfasst
   ausdrücklich **nicht**, diagnostische oder therapeutische Entscheidungen zu
   treffen oder zu empfehlen (ADR-006 Nr. 1).
4. **Die regulatorische Einordnung folgt nicht daraus, dass einzelne Funktionen
   fehlen.** Maßgeblich ist die dokumentierte Zweckbestimmung; sie ist vor
   Produktivstart extern zu prüfen (ADR-006 Nr. 7). Eine spätere Ergänzung um
   Scores, Red Flags oder klinische Ableitungen ist `MDR_REVIEW_REQUIRED` und
   darf ohne dokumentierte Prüfung nicht produktiv aktiviert werden.

### B. Entwurf, Zugehörigkeit zur Akte und Nachvollziehbarkeit vor der Finalisierung

5. Eine Dokumentation hat genau zwei fachliche Zustände: **Entwurf** und
   **finalisiert**. Es gibt keinen dritten, halbverbindlichen Zustand.
6. **Ein Entwurf gehört zur Behandlungsakte, sobald er auf dem Server
   gespeichert ist.** Er ist ab diesem Zeitpunkt lesbar, auditiert,
   aufbewahrungspflichtig und unterliegt den Zugriffsregeln aus ADR-004. Ein
   ausschließlich auf dem Gerät liegender Entwurf ist noch keine Eintragung;
   die Synchronisation, nicht das Tippen, macht ihn zum Aktenbestandteil
   (ADR-001).
7. **Vor der Finalisierung** werden erfasst: Autor, Erstellungszeitpunkt und
   Zeitpunkt der letzten Änderung — jeweils Serverzeit. **Ein vollständiger
   Versionsverlauf entsteht für Entwürfe nicht** (siehe Offene Entscheidung
   D2). Der Übergang Entwurf → finalisiert erzeugt **Version 1** mit dem
   vollständigen Inhalt.
8. Damit ein Entwurf nicht unbemerkt beliebig lange offen bleibt, gilt eine
   **organisatorische Frist**: Wird eine Dokumentation nicht innerhalb der
   festgelegten Frist finalisiert, erscheint sie in einer Arbeitsliste der
   behandelnden Person und der Praxisleitung. **Die Frist sperrt nichts**; sie
   macht sichtbar (siehe Offene Entscheidung D4).

### C. Nachvollziehbarkeit ab der Finalisierung

9. **Nachvollziehbarkeit wird über vollständige, unmittelbar abrufbare
   Dokumentversionen hergestellt**, nicht über ein Änderungsprotokoll, aus dem
   der frühere Stand erst errechnet werden müsste (Begründung siehe „Abwägung"
   und Offene Entscheidung D1).
10. Jede finalisierte Version ist **inhaltlich unveränderlich**. Über den
    Anwendungspfad existieren für Versionen weder UPDATE noch DELETE — dieselbe
    Zusage wie beim Auditlog (ADR-010 Nr. 4) und bei ausgestellten Rechnungen
    (ADR-009 Nr. 9).
11. Zu jeder Version werden festgehalten: **Dokument, Versionsnummer, Autor
    (Benutzerkonto und Person), Erstellungszeitpunkt, Finalisierungszeitpunkt,
    die abgelöste Vorversion** und — bei einer Berichtigung — der
    **Berichtigungsgrund**.
12. **Alle Zeitpunkte sind Serverzeitpunkte.** Eine vom Client gelieferte Zeit
    wird nie als Dokumentationszeit übernommen. Eine Rückdatierung gibt es
    nicht.

### D. Finalisierung

13. **Die Finalisierung ist ein serverseitiger Vorgang.** Sie wird
    ausschließlich durch eine Serverfunktion ausgelöst, die Berechtigung,
    Organisationszugehörigkeit, Zustand und Vollständigkeit selbst prüft. Der
    Client kann eine Dokumentation nicht als final kennzeichnen.
14. **Offline kann nicht finalisiert werden.** Ein offline entstandener
    Entwurf wird zunächst synchronisiert; erst danach ist die Finalisierung
    möglich (ADR-001 Nr. 4). Eine „ausstehende Finalisierung" auf dem Gerät
    hat keinerlei rechtliche oder fachliche Wirkung.
15. **Finalisieren darf nur, wer eine therapeutische Rolle besitzt.**
    Administrative Befugnis ist keine klinische Befugnis: Die Rolle
    „Praxisinhaber" umfasst nach §4.1 umfassenden **Zugriff**, nicht die
    Autorschaft einer Behandlung, die diese Person nicht durchgeführt hat.
    Office finalisiert nie.
16. **Vertretung**: Dokumentiert wird von der Person, die behandelt hat.
    Weichen behandelnde und dokumentierende Person voneinander ab, werden
    **beide** festgehalten. Eine Vertretung darf finalisieren, wenn sie die
    Behandlung tatsächlich durchgeführt hat; jede weitergehende Vertretung
    braucht eine ausdrückliche Regel (siehe Offene Entscheidung D3).
17. **Verspätete Dokumentation ist zulässig und wird nie blockiert.** Eine
    unvollständige Akte ist der schlechtere Zustand. Festgehalten wird
    stattdessen der tatsächliche Finalisierungszeitpunkt; der zeitliche Abstand
    zum Termin ist damit erkennbar (§ 630f Abs. 1 Satz 1).

### E. Berichtigung und Nachtrag nach der Finalisierung

18. Es gibt zwei getrennte Vorgänge:
    - **Berichtigung** — ein bereits finalisierter Inhalt war falsch. Sie
      erzeugt eine **neue Version** desselben Dokuments. Die Vorversion bleibt
      vollständig abrufbar. Ein Berichtigungsgrund wird erfasst.
    - **Nachtrag** — es kommt etwas hinzu, was vorher nicht bekannt war. Er
      erzeugt einen **eigenen, verknüpften Eintrag** mit eigenem Autor und
      eigenem Zeitpunkt und verändert die bestehende Version nicht.
19. **Ein finalisierter Inhalt wird niemals überschrieben und über den
    Anwendungspfad niemals gelöscht.** Auch eine Berichtigung entfernt nichts;
    sie stellt daneben.
20. Die **aktuelle Fassung** eines Dokuments ist immer die jüngste finalisierte
    Version. Ältere Versionen sind für berechtigte Rollen abrufbar und als
    „abgelöst" gekennzeichnet — sie verschwinden nicht aus der Anzeige.

### F. Gleichzeitiges Bearbeiten

21. Schreibende Vorgänge auf einer Dokumentation verwenden **optimistische
    Nebenläufigkeitskontrolle**: Der Aufruf führt den erwarteten Stand mit; wer
    auf einem veralteten Stand speichert, wird **abgewiesen** — ohne
    Teiländerung und ohne Erfolgsaudit. Dasselbe Verfahren ist bereits für
    Termine im Einsatz.
22. **Last-Write-Wins ist ausgeschlossen** (ADR-001 Nr. 5). Ein Konflikt wird
    der bearbeitenden Person gezeigt, nicht stillschweigend aufgelöst. Bei der
    Zusammenführung offline entstandener Entwürfe gilt additive Zusammenführung;
    fremde Änderungen gehen dabei nie verloren.
23. Die Finalisierung selbst prüft den erwarteten Stand ebenfalls. Zwei
    gleichzeitige Finalisierungen können nicht beide erfolgreich sein.

### G. Was als ausreichend finalisiert gilt, und das Zusammenspiel mit der Abrechnung

24. Eine Behandlung gilt als **ausreichend dokumentiert**, wenn zu ihr
    mindestens eine **finalisierte Version** existiert. Ein Entwurf genügt
    nicht.
25. Eine abrechenbare Leistung **referenziert eine konkrete Dokumentversion**,
    nicht nur das Dokument. Beim Ausstellen der Rechnung geht diese
    Versionsangabe in den Rechnungssnapshot ein (ADR-009 Nr. 10).
26. **Eine spätere Berichtigung ändert eine ausgestellte Rechnung nicht.** Die
    Rechnung bleibt unveränderbar (ADR-009 Nr. 9). Ändert die Berichtigung
    abrechnungsrelevante Tatsachen, entsteht ein Korrektur- beziehungsweise
    Stornodokument und gegebenenfalls eine neue Rechnung. Ändert sie nur den
    klinischen Inhalt, bleibt die Abrechnung unberührt; die Rechnung verweist
    weiterhin auf die damals gültige Version, und die Berichtigung ist über die
    Versionskette auffindbar.
27. Der von ADR-009 Nr. 13 vorgesehene **Override** — fakturieren trotz
    fehlender Finalisierung — bleibt möglich, muss begründet und protokolliert
    werden und ist auf eine ausdrücklich berechtigte Rolle beschränkt (siehe
    Offene Entscheidung D6).

### H. Getrennte Zustandsbereiche

28. **Terminablauf, Dokumentationsstand, Abrechnung und Zahlung sind vier
    getrennte Zustandsbereiche.** Sie hängen fachlich zusammen, sind aber nicht
    Stufen desselben Zustands.
29. **„Dokumentiert" und „abgerechnet" sind keine Terminstatus.** Der
    Terminstatus beschreibt, was mit dem Termin geschehen ist; der
    Dokumentationsstand gehört zum Dokument; der Rechnungszustand zur Rechnung
    (ADR-009 Nr. 7); der Zahlungsstand zur Zahlung (ADR-009 Nr. 12).
30. Der Normalfall belegt die Trennung: Ein Termin ist **durchgeführt**, seine
    Dokumentation **finalisiert**, die Rechnung **ausgestellt** und die Zahlung
    trotzdem **offen**. Vier Zustände, vier Bereiche, keine Reihenfolge, die
    sich in einen einzigen Automaten pressen ließe.
31. **Der Terminstatus-Automat wird in diesem ADR nicht erweitert.** „Nicht
    angetroffen", weitere Übergänge und die Voraussetzungen für Ausfallhonorare
    sind spätestens vor dem Abrechnungs-Epic zu entscheiden. **Ein Terminstatus
    allein löst niemals automatisch eine Honorarforderung aus**; eine
    Forderung entsteht erst durch eine ausdrückliche, begründete
    Abrechnungsentscheidung.

### I. Aufbewahrung, Löschung und Legal Hold

32. Dokumentversionen sind **klinische Behandlungsunterlagen** im Sinne von
    ADR-008: Aufbewahrung zehn Jahre nach Abschluss der Behandlung.
33. **„Unveränderbar" heißt nicht „für immer gespeichert".** Unveränderbarkeit
    gilt **über den Anwendungspfad und für die Dauer der Aufbewahrung**. Nach
    Ablauf aller Aufbewahrungsgründe erfolgt eine **echte Löschung** (ADR-008
    Nr. 3, Nr. 10) — nicht ein Ausblenden und nicht ein dauerhaftes
    Soft-Delete.
34. Die Löschung erfasst **ein Dokument mit allen seinen Versionen und
    Nachträgen als eine Einheit**. Eine einzelne Version zu löschen und die
    übrigen zu behalten würde die Nachvollziehbarkeit zerstören, die dieser ADR
    herstellt.
35. Ein **Legal Hold** setzt die Löschung für die betroffenen Dokumente aus,
    ohne die Zugriffsregeln zu verändern (ADR-008 Nr. 7).
36. **Die Umsetzung von Aufbewahrung, Löschung und Legal Hold ist
    Voraussetzung für den Echtbetrieb**, nicht eine spätere Ergänzung. Eine
    Dokumentation, die unbegrenzt wächst und nie gelöscht werden kann,
    verletzt Art. 5 Abs. 1 lit. e DSGVO und §18 der Prinzipien.

### J. Audit und Sichtbarkeit klinischer Inhalte

37. **Klinische Versionen liegen ausschließlich in der geschützten
    Dokumentation** und unterliegen dort den Zugriffsregeln aus ADR-004.
38. **Das allgemeine Auditlog enthält nur Metadaten**: wer, wann, welches
    Dokument, welche Versionsnummer, welcher Vorgang, welches Ergebnis. Es
    enthält **keine Inhalte, keine Auszüge, keine Differenzen** und
    **insbesondere keinen Berichtigungsgrund** — dieser ist Freitext und kann
    klinische Angaben tragen; er gehört deshalb in die Dokumentation, nicht ins
    Audit.
39. **Klinische Inhalte dürfen niemals über Auditdaten für Rollen sichtbar
    werden, denen der Zugriff auf diese Inhalte verwehrt ist.** Das ist eine
    Anforderung an jeden neuen Audit-Ereignistyp, nicht nur an die heutigen.
40. Auditpflichtig sind mindestens: Anlegen eines Entwurfs, Finalisierung,
    Berichtigung, Nachtrag, Lesen einer Dokumentation, Export sowie ein
    Override nach Nr. 27 (ADR-010 Nr. 2).

## Abwägung: vollständige Versionen gegenüber einem Änderungsprotokoll

Die beiden Modelle unterscheiden sich darin, **was gespeichert wird**:
vollständige Fassungen des Textes, oder nur die jeweilige Änderung, aus der
sich ein früherer Stand rechnerisch wiederherstellen lässt.

| Kriterium | Vollständige Versionen | Änderungsprotokoll |
|---|---|---|
| **Nachvollziehbarkeit** | Der ursprüngliche Inhalt liegt unmittelbar vor und ist ohne Zwischenschritt lesbar. | Der ursprüngliche Inhalt ist ein Rechenergebnis. Fehlt eine Änderung oder ist die Reihenfolge gestört, ist der frühere Stand still verfälscht. |
| **Prüfbarkeit** | Im Streitfall wird eine gespeicherte Fassung vorgelegt. Ein Test vergleicht zwei Texte. | Vorgelegt wird das Ergebnis eines Programms. Die Beweisführung hängt an der Korrektheit dieses Programms — auch an der Version von vor sieben Jahren. |
| **Komplexität** | Einfaches Modell: eine Zeile je Version, kein UPDATE, kein DELETE. Der Aufwand liegt im Speicher, und der ist bei Praxisgrößen unerheblich. | Anspruchsvoll: Differenzbildung, Zusammenführung, Migration der Differenzformate. Genau der Code, der bei einer späteren Schemaänderung bricht. |
| **Datenschutz** | Mehrere vollständige Kopien desselben Inhalts. Löschung und Auskunft müssen alle Versionen erfassen. | Ebenfalls mehrere Kopien — Differenzen enthalten die geänderten Inhalte im Klartext. Die Datenmenge ist kleiner, der Personenbezug identisch. |

**Empfehlung: vollständige Versionen.** Der ausschlaggebende Punkt ist nicht
der Speicherplatz, sondern die Beweislage. § 630f Abs. 1 Satz 2 verlangt, dass
der ursprüngliche Inhalt erkennbar **bleibt**. Ein Modell, das ihn erst
errechnet, erfüllt das nur so lange, wie die Rechnung stimmt — und diese
Rechnung müsste über die gesamte Aufbewahrungsfrist von zehn Jahren, über
Schemaänderungen und Migrationen hinweg korrekt bleiben. Beim Datenschutz
nehmen sich beide Modelle wenig; die vermeintliche Datensparsamkeit des
Änderungsprotokolls ist gering, weil Differenzen die geänderten Inhalte
ohnehin im Klartext tragen. Die Komplexität spricht deutlich für Versionen.

**Verworfen** wurde zusätzlich ein drittes Modell: die finalisierte
Dokumentation als **PDF-Momentaufnahme** einzufrieren. Es wäre beweisstark,
macht die Inhalte aber unsuchbar, unstrukturiert und für Auskunft, Löschung und
spätere Auswertung praktisch unbrauchbar. Ein PDF bleibt als **zusätzliche**
Ausgabeform sinnvoll, nicht als führende Speicherform.

## Konsequenzen

- Das Datenmodell erhält eine Dokument-Entität und eine Versions-Entität. Die
  Versionstabelle ist append-only: für `authenticated` gibt es kein UPDATE und
  kein DELETE, und Versionen entstehen ausschließlich über
  SECURITY-DEFINER-Funktionen. Das ist dieselbe Bauweise wie bei Patienten,
  Terminen und Mitarbeitenden.
- Die Anzeige wird aufwendiger: Es gibt nicht mehr „den Text", sondern eine
  aktuelle Fassung mit Vorgeschichte. Berichtigungen müssen als solche
  erkennbar sein, ohne die Lesbarkeit zu zerstören.
- Der Retention-Vorgang aus ADR-008 wird anspruchsvoller, weil er Dokumente
  mitsamt ihrer Versionskette behandelt und nicht einzelne Zeilen. Ohne ihn
  ist der Echtbetrieb nicht zulässig.
- Die Trennung der Zustandsbereiche kostet zunächst mehr Modell und mehr
  Abfragen als ein einziger Terminstatus. Sie verhindert dafür, dass eine
  Abrechnungsfrage später den Terminstatus verbiegt oder umgekehrt.
- Die Beschränkung der Finalisierung auf therapeutische Rollen bedeutet, dass
  die Praxisleitung eine fehlende Dokumentation **nicht** selbst
  abschließen kann. Das ist unbequem und beabsichtigt: die Alternative wäre
  eine Autorschaft ohne Behandlung.
- Optimistische Nebenläufigkeit erzeugt sichtbare Abweisungen. Eine
  verweigerte Speicherung mit klarer Meldung ist der bessere Zustand als eine
  stillschweigend überschriebene Änderung einer Kollegin (§13).
- Weil Entwürfe keinen Versionsverlauf führen, bleibt ein Restrisiko: Eine
  späte, unbemerkte Umschreibung eines noch nicht finalisierten Entwurfs
  hinterlässt außer dem Änderungszeitpunkt keine Spur. Die Gegenmaßnahmen sind
  die Frist nach Nr. 8 und die Auditmetadaten. Wer dieses Risiko nicht tragen
  will, wählt in D2 die strengere Variante.

## Bewusst nicht Bestandteil dieser Entscheidung

- Der fachliche Aufbau der Dokumentation: welche Abschnitte, welche Felder,
  welche Pflichtangaben je Behandlungsart.
- Die Struktur von Erstbefund gegenüber Verlaufsdokumentation.
- Fragebögen, PROMs und die Instrumentenbibliothek (§7, offener Punkt B8).
- Der konkrete technische Offline-Mechanismus (ADR-001, weiterhin offen).
- Der fallbezogene Sonderzugriff des Office auf vollständige klinische
  Dokumentation nach §4.4 (weiterhin offen).
- Die Definition des „Abschlusses der Behandlung", an der die Zehnjahresfrist
  hängt (ADR-008, offene Folgefrage).
- Der Terminstatus-Automat einschließlich „nicht angetroffen" und der
  Voraussetzungen für Ausfallhonorare.
- Signatur- oder Zeitstempelverfahren mit kryptografischem Nachweis.

## Prüfung gegen die bestehenden Entscheidungen

Die vorgeschlagene Trennung der Zustandsbereiche wurde gegen die angenommenen
ADRs geprüft. **Ein echter Widerspruch besteht nicht**; eine offene Spannung ist
aufzulösen:

- **ADR-009** modelliert Rechnungs- und Zahlungszustände bereits als eigene
  Zustände und leitet Leistungen aus durchgeführten Terminen ab. Das setzt die
  Trennung voraus und stützt sie.
- **ADR-014** nimmt den Zustandsautomaten für Termine ausdrücklich aus. Es gibt
  also keine getroffene Entscheidung, gegen die dieser Vorschlag verstößt.
- **Aufzulösen:** `docs/decisions/OPEN_DECISIONS.md`, Abschnitt D, Zeile
  „bestätigt" (§8) beschreibt einen möglichen Terminautomaten mit den Stufen
  „… / durchgeführt / dokumentiert / abgerechnet". Das ist dort als **offener
  Punkt** formuliert, nicht als Entscheidung — es ist damit kein Widerspruch zu
  einer geltenden Festlegung, aber die einzige Stelle im Projekt, an der
  „dokumentiert" und „abgerechnet" als Terminstatus auftauchen. **Wird dieser
  ADR angenommen, ist jene Zeile im selben Zug zu korrigieren**, sonst bleiben
  zwei widersprüchliche Lesarten nebeneinander stehen.

## Offene Entscheidungen

Diese Punkte sind **vor der Annahme** zu beantworten. Jeder trägt eine
Empfehlung; keiner ist durch diesen Entwurf bereits entschieden.

| Nr. | Frage | Empfehlung |
|---|---|---|
| **D1** | Vollständige Versionen oder Änderungsprotokoll? | **Vollständige Versionen** — der ursprüngliche Inhalt liegt unmittelbar vor und muss nicht errechnet werden (siehe Abwägung). |
| **D2** | Führt schon ein Entwurf einen Versionsverlauf, oder erst die Finalisierung? | **Erst die Finalisierung.** Während der Erstellung entstünden sonst dutzende Versionen ohne Aussagewert. Restrisiko und Gegenmaßnahme sind unter „Konsequenzen" benannt. Wer das Restrisiko nicht tragen will, wählt „Version bei jedem Speichern". |
| **D3** | Wer darf finalisieren — nur die behandelnde Person, oder auch eine benannte Vertretung? | **Nur therapeutische Rollen.** Regelfall: die behandelnde Person. Eine Vertretung finalisiert, wenn sie tatsächlich behandelt hat. Eine darüber hinausgehende Vertretung (z. B. bei längerer Abwesenheit) sollte ausdrücklich benannt und im Dokument vermerkt werden. Administrative Rollen finalisieren nie. |
| **D4** | Bis wann soll eine Dokumentation finalisiert sein? | **Bis zum Ende des auf den Termin folgenden Werktags**, rein organisatorisch: Arbeitsliste und Hinweis, **keine Sperre**. Die Frist ist eine Praxisvereinbarung, keine gesetzliche Vorgabe. |
| **D5** | Wer darf eine Berichtigung vornehmen — nur der ursprüngliche Autor oder jede therapeutische Rolle? | **Jede therapeutische Rolle**, weil eine ausgeschiedene Kollegin sonst eine falsche Eintragung dauerhaft unkorrigierbar machen würde. Der Autor jeder Version wird ohnehin einzeln festgehalten. |
| **D6** | Wer darf trotz fehlender Finalisierung fakturieren (Override nach ADR-009 Nr. 13)? | **Nur die administrative Praxisrolle**, mit Pflichtbegründung und Auditeintrag. Der Override ist ein Ausnahmefall, kein Bedienweg. |
| **D7** | Was geschieht mit einer bereits ausgestellten Rechnung, wenn die Dokumentation später berichtigt wird? | **Die Rechnung bleibt unverändert.** Nur wenn die Berichtigung abrechnungsrelevante Tatsachen ändert, entstehen Storno/Korrektur und ggf. eine neue Rechnung. |
| **D8** | Kann eine finalisierte Dokumentation auf Verlangen der Patientin gelöscht werden? | **Nein, solange die Aufbewahrungspflicht läuft.** Die gesetzliche Aufbewahrung geht dem Löschverlangen vor; die Ablehnung wird begründet ausgegeben (ADR-007, ADR-008). Nach Fristablauf wird echt gelöscht. |
| **D9** | Sollen ältere Versionen für alle therapeutischen Rollen sichtbar sein oder nur für Autor und Praxisleitung? | **Für alle Rollen mit Zugriff auf die Akte**, entsprechend §4.2. Eine Versionsgeschichte, die nur einzelne sehen, wäre eine zweite, verdeckte Berechtigungsebene. |

## Offene Folgefragen

- Wie wird eine berichtigte Fassung angezeigt, ohne dass die Lesbarkeit der
  Akte leidet — nebeneinander, nacheinander, oder auf Abruf?
- Wie verhält sich die Versionskette zu einem späteren Export und zur
  Auskunft nach Art. 15 DSGVO: alle Versionen oder nur die aktuelle Fassung?
- Wie wird ein offline entstandener Entwurf zusammengeführt, wenn dieselbe
  Dokumentation zwischenzeitlich am Server geändert wurde (ADR-001)?
- Wann genau gilt eine Behandlung als abgeschlossen, sodass die
  Zehnjahresfrist beginnt (ADR-008, offene Folgefrage)?
- Wie werden Nachträge gezählt, wenn eine Leistung bereits abgerechnet ist —
  begründen sie eine eigene Leistung?
- Braucht die Finalisierung eine gesonderte Bestätigung („Ich habe geprüft"),
  oder genügt die Schaltfläche mit klarer Beschriftung?
