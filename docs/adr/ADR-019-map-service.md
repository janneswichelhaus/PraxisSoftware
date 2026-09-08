# ADR-019: Kartendienst — Navigationslink, In-App-Karte, Fahrzeiten

## Status

**Vorgeschlagen** — Bestätigung durch Jannes ausstehend.

Teil 1 (Navigationslink) und Teil 3 (Fahrzeiten) sind entscheidungsreif.
**Teil 2 (In-App-Karte) ist es nicht:** die Recherche zur Vertragsgrundlage
hat einen Widerspruch zu `PROJECT_PRINCIPLES.md` §3.5 ergeben, der vor der
Umsetzung aufzulösen ist (Abschnitt „Der ungelöste Punkt").

## Datum

2026-09-08

## Kontext

§9 verlangt einen professionellen Kartendienst und verbietet eine eigene
Routing-Engine. Am 2026-09-06 hat Jannes **Google Maps** als Kartendienst
festgelegt (E-16, Punkt B7 in `OPEN_DECISIONS.md`), am 2026-09-08 zusätzlich,
dass Fahrzeiten abgerufen, aber nicht gespeichert werden.

Drei verschiedene Datenwege stehen dahinter, die bisher unter einem Namen
liefen:

1. **Der Navigationslink** — die Anwendung zeigt einen Link; die Therapeutin
   tippt darauf, und **ihr Gerät** öffnet Google Maps. Gebraucht ab
   UX-EPIC-001 (Oktober 2026).
2. **Die In-App-Karte** — die Anwendung bettet einen Rahmen ein, den **sie
   selbst** mit den Adressen des Tages befüllt. Gebraucht ab TOUR-EPIC-001a
   (Stufe 2, April 2027).
3. **Die Fahrzeit je Weg** — die Anwendung fragt eine Dauer ab und zeigt sie
   an. Gebraucht ab TOUR-EPIC-001b (nach M6).

Der Unterschied ist nicht technisch, sondern datenschutzrechtlich: **Weg 1
sendet nichts aus der Anwendung an Google. Weg 2 und 3 tun es.** Diese Grenze
trägt die gesamte Entscheidung.

§9 stellt außerdem ausdrücklich fest: „Ein Kartendienst ist ein Dienstleister
mit Zugang zu Patientendaten im Sinne von §3.5, da eine Adresse in Verbindung
mit einem Behandlungstermin personenbezogen ist." §3.5 verlangt für einen
solchen Dienstleister **vor Freischaltung** unter anderem einen AVV/DPA und
die Eignung im Hinblick auf §203 StGB.

## Entscheidung

### Teil 1 — Navigationslink (ab UX-EPIC-001)

1. Aus der Anwendung führt ein **Link** zu Google Maps: je Termin und für den
   ganzen Tag. Die Anwendung erzeugt eine URL nach dem dokumentierten
   `maps` -URL-Schema und stellt sie dar; sie ruft Google **nicht** auf.
2. Der Link enthält **ausschließlich die Zieladresse**, den Modus
   `travelmode=bicycling` und — beim Tageslink — die weiteren Adressen in
   Terminreihenfolge. **Kein Name, keine Uhrzeit, keine Terminkennung, keine
   Diagnose, keine Patientenkennung.**
3. Der Link wird **nie automatisch geöffnet.** Er wirkt erst auf ausdrückliche
   Aktion. Das ist keine Komfortfrage: eine automatisch geladene Einbindung
   würde die Praxis nach der Rechtsprechung zu Drittinhalten
   (EuGH, C-40/17, *Fashion ID*) zur mitverantwortlichen Stelle für die
   Übermittlung machen — ein gesetzter Link tut das nicht.
4. Das genaue URL-Format und die übermittelte Feldliste werden als **`ANN`**
   im Annahmenregister verankert, an genau einer Stelle im Code (eine
   Funktion, die die URL baut). So bleibt eine Änderung eine begrenzte
   Änderung.
5. **Endgeräteregel.** Der Link öffnet Google Maps auf dem Telefon der
   Therapeutin. Ist dort ein privates Google-Konto angemeldet, speichert
   Google Suche und Weg in dessen Verlauf. Deshalb gilt: **auf dienstlich
   genutzten Geräten kein angemeldetes privates Google-Konto für die
   Navigation**, oder Web- und App-Aktivitäten sowie Standortverlauf sind
   deaktiviert. Die Regel gehört in die Endgeräte-Richtlinie (BETRIEB-001,
   Roadmap G14/G16) und ist Teil der TOM.
6. **Datenschutzinformation.** Die Information nach Art. 13 DSGVO (PAT-006)
   nennt, dass für die Anfahrt zu Hausbesuchen ein Kartendienst genutzt wird,
   welcher, dass dabei die Adresse ohne Namen übermittelt wird, und dass die
   Übermittlung erst auf Aktion der Therapeutin erfolgt.

### Teil 2 — In-App-Karte: nicht freigeschaltet

7. Die Karte der Tagesroute über die **Google Maps Embed API** ist der von
   Jannes gewählte Weg (E-16) und bleibt es. **Dieser ADR schaltet sie
   nicht frei.** Der Grund steht unten unter „Der ungelöste Punkt": die
   Prüfung nach ADR-002 hat ein Kriterium, das Google für Maps Platform nicht
   erfüllt.
8. Wird sie freigeschaltet, gelten unverändert die Festlegungen vom
   2026-09-06: Karte **nur auf ausdrückliche Aktion**, nie beim Öffnen einer
   Seite · Adressen **ohne Namen und ohne Uhrzeit** · API-Schlüssel an die
   Domain gebunden · **kein Standort der Person, kein Verlauf, keine
   Speicherung von Routing-Rohdaten** (§18, §20).
9. **Schlüsselverwaltung.** Der Schlüssel der Maps Embed API ist im Browser
   sichtbar und deshalb kein Geheimnis, sondern eine **Abrechnungskennung mit
   Missbrauchsrisiko**. Er wird daher: auf die Produktionsdomain per
   HTTP-Referrer beschränkt; auf die tatsächlich genutzte API beschränkt; je
   Umgebung getrennt vergeben (Dev, Test, Produktion — ADR-002 Punkt 5); mit
   einem Ausgabenlimit und einer Warnschwelle versehen; und bei Verdacht
   rotiert. Er wird **nicht** als Secret behandelt und gehört damit auch nicht
   in die Secret-Verwaltung — wohl aber in die Konfiguration je Umgebung.
   `.env*` außer `.env.example` bleibt ungetrackt.
10. **Zwischenziele.** Der Tageslink beziehungsweise die Karte teilt einen Tag
    in Abschnitte, wenn die Zahl der Zwischenziele die Grenze des Dienstes
    überschreitet. Nach Sekundärquellen liegt sie bei **20 Zwischenzielen**;
    der Wert ist **vor der Umsetzung gegen die Anbieterdokumentation zu
    prüfen** (aus dieser Umgebung war `developers.google.com` nicht
    erreichbar).

### Teil 3 — Fahrzeiten (ab TOUR-EPIC-001b)

11. Die Fahrzeit je Weg wird **im Moment der Planung abgerufen und angezeigt,
    nicht gespeichert** (entschieden 2026-09-08). Es entsteht kein
    Routing-Rohdatenbestand — damit ist die kurze Speicherfrist aus §18 und
    §9 nicht bloß kurz, sondern gegenstandslos.
12. Es gibt **keine Auswertung je Person** (B6, entschieden 2026-09-08: keine
    Leistungskontrolle aus Touren- und Zeitdaten). Ohne gespeicherte Fahrzeit
    gibt es nichts, woraus sich ein Bewegungs- oder Leistungsprofil bilden
    ließe. Das ist die technische Verankerung des „Nein" aus B6.
13. Der Abruf ist ein Aufruf der Anwendung an Google und fällt damit unter
    dieselbe Frage wie Teil 2 — er ist **erst zulässig, wenn diese geklärt
    ist**.

### Querschnitt

14. **DSFA-Wiedervorlage.** Die Einführung des Kartendienstes ist eine
    „wesentliche Änderung der Routing-/Standortverarbeitung" im Sinne von
    ADR-007 Punkt 2 und löst eine Wiedervorlage der DSFA aus — je Teil
    einzeln, nicht einmal für alle drei.
15. **Keine eigene Routing-Engine**, keine Tourenoptimierung, keine
    Speicherung von Kartenmaterial (§9, ADR-015).

## Prüfung nach ADR-002 Punkt 3 / §3.5

Der Prüfkatalog ist Pflicht **vor Freischaltung**. Hier das Ergebnis der
Recherche vom 2026-09-08. Die Zeilen betreffen **Teil 2 und 3** — für Teil 1
übermittelt die Anwendung nichts, siehe unten.

| Kriterium | Ergebnis für die Google Maps Platform |
|---|---|
| **AVV / DPA** | **Nicht erfüllt.** Google führt für die Maps Platform eigene „Controller-Controller Data Protection Terms" und eigene „Service Specific Terms" — getrennt vom Cloud Data Processing Addendum, unter dem Google für andere Cloud-Dienste Auftragsverarbeiter ist. Google verarbeitet die übermittelten Daten **als eigener Verantwortlicher**, nicht weisungsgebunden; die deutsche Praxisliteratur ist sich einig, dass für Google Maps kein AVV angeboten wird. **Belegtiefe:** Sekundärquellen und Google-Vertragsseiten in der Übersicht; die Vertragstexte selbst waren aus dieser Umgebung nur teilweise abrufbar (`developers.google.com` und `privacy.google.com` sind vom Egress-Proxy gesperrt). **Diese eine Zeile trägt die gesamte Entscheidung — sie ist als Erstes zu verifizieren**, im Zweifel durch die Datenschutzberatung (B2). |
| **§203 StGB** | **Nicht erfüllt.** Eine Verpflichtung zur Geheimhaltung nach §203 Abs. 4 StGB wird für die Maps Platform nicht angeboten. Sie ist auch nicht konstruierbar: eine Verpflichtung als „sonstige mitwirkende Person" setzt Weisungsgebundenheit voraus, die es bei einem eigenen Verantwortlichen nicht gibt. |
| **Verschlüsselung** | Erfüllt. Transport über TLS. |
| **Zugriffskontrolle** | Auf unserer Seite über die Schlüsselbindung (Punkt 9); auf Googles Seite nicht steuerbar, weil eigener Verantwortlicher. |
| **Retention und Löschung** | **Nicht steuerbar.** Als eigener Verantwortlicher bestimmt Google Zweck und Dauer selbst; es gibt keine zugesicherte Löschfrist für übermittelte Adressen. |
| **Unterauftragnehmer** | Nicht anwendbar — mangels Auftragsverarbeitung gibt es keine Unterauftragnehmerkette, die uns gegenüber offenzulegen wäre. |
| **Datenstandort** | **EU/EWR nicht zugesichert.** Die Maps Platform kennt keine EU-Region. Übermittlung in die USA auf Grundlage des EU-U.S. Data Privacy Framework. |

Zum letzten Punkt gehört ein Hinweis zur Lage: Das Data Privacy Framework ist
zum Stand dieses ADR **in Kraft**, aber angegriffen — die Nichtigkeitsklage
Latombe wurde am 2025-09-03 abgewiesen (T-553/23), das Rechtsmittel liegt seit
dem 2025-10-31 beim EuGH (C-703/25 P), und zwei institutionelle Stützen des
Angemessenheitsbeschlusses sind seither geschwächt: das PCLOB ist seit Januar
2025 ohne Beschlussfähigkeit, und die Entscheidung *Trump v. Slaughter* des
US Supreme Court vom 2026-06-29 hat die Unabhängigkeit der FTC in Frage
gestellt. **Fällt der Beschluss, entfällt die Übermittlungsgrundlage für Teil 2
und 3 sofort** — Standardvertragsklauseln als Auffanglösung setzen einen
Vertrag voraus, den es hier nicht gibt.

### Warum Teil 1 anders liegt

Beim Navigationslink übermittelt die Anwendung nichts. Sie stellt eine URL
dar; die Verbindung zu Google baut das Endgerät der Therapeutin auf, nachdem
sie getippt hat. Google ist dieser Person gegenüber eigener Verantwortlicher —
so wie bei jeder anderen Nutzung von Google Maps auf ihrem Telefon.

Die Praxis ist damit **nicht Dienstleister-einbindende Stelle im Sinne von
§3.5**, sondern Arbeitgeberin, die ein Werkzeug bereitstellt. Ihre Pflichten
sind entsprechend andere und werden erfüllt: die Endgeräteregel (Punkt 5) und
die Datenschutzinformation (Punkt 6). Die Grenze zwischen beiden Fällen ist
genau die Regel aus Punkt 3 — **nur auf Aktion, nie automatisch**. Sie ist
deshalb keine Bequemlichkeitsregel, sondern die tragende Bedingung dieser
Einordnung.

## Der ungelöste Punkt

**Teil 2 und 3 widersprechen `PROJECT_PRINCIPLES.md` §3.5 in einer
MUSS-Anforderung.** §9 ordnet den Kartendienst ausdrücklich als Dienstleister
mit Zugang zu Patientendaten ein; §3.5 verlangt für einen solchen
Dienstleister **vor Freischaltung** einen AVV/DPA und die Eignung im Hinblick
auf §203 StGB. Beides bietet Google für die Maps Platform nicht an, und beides
ist nicht verhandelbar — es ist eine Eigenschaft des Produkts.

Dass die Adressen ohne Namen und ohne Uhrzeit übermittelt werden, löst das
nicht auf. Google erfährt, dass **diese Physiotherapiepraxis heute diese acht
Adressen anfährt**; daraus folgt für die Menschen dort ein Gesundheitsbezug.
Genau diesen Fall beschreibt §9 mit „eine Adresse in Verbindung mit einem
Behandlungstermin".

Ein ADR darf `PROJECT_PRINCIPLES.md` nicht überschreiben (§21, CLAUDE.md).
Deshalb entscheidet dieser ADR Teil 2 und 3 **nicht**. Zur Auflösung stehen
drei Wege offen — die Wahl trifft Jannes, nicht dieser ADR:

- **A — Die Genehmigung schriftlich einholen und §3.5 ändern.** Jannes hat am
  2026-09-06 berichtet, die zuständige Datenschutz-Fachkraft habe den Datenweg
  genehmigt. Diese Genehmigung liegt bisher **nur mündlich** vor; die Roadmap
  führt sie als M0-Punkt („Genehmigung des Kartendienstes schriftlich
  ablegen"). Trägt die schriftliche Begründung, dass eine Übermittlung an
  einen eigenen Verantwortlichen hier zulässig ist, dann ist §3.5 zu eng
  formuliert und wird nach §21 in einer neuen Prinzipienversion um genau
  diesen Fall ergänzt. **Ohne die schriftliche Begründung geht dieser Weg
  nicht** — eine mündliche Auskunft kann eine MUSS-Anforderung nicht
  aufheben.
- **B — Ohne In-App-Karte auskommen.** Der Navigationslink deckt die
  Navigation vollständig ab; die Tourenliste (TOUR-004) deckt die Übersicht
  ab und ist ohnehin für den Ausfallbetrieb (E2) druckbar. Die Karte ist
  Komfort, kein Kernprozess. Dieser Weg kostet nichts außer der Karte und ist
  jederzeit umkehrbar.
- **C — Ein Kartendienst mit AVV für Teil 2 und 3.** Es gibt europäische
  Anbieter, die Auftragsverarbeitung anbieten und damit §3.5 erfüllen; der
  Navigationslink bliebe bei Google, weil er dort auf dem Gerät der
  Therapeutin ohnehin landet. Kosten: ein zweiter Anbieter, eine eigene
  Prüfung nach ADR-002, ein eigener ADR (ADR-002, Konsequenzen).

**Empfehlung: B, bis A geklärt ist.** UX-EPIC-001 braucht nur Teil 1, und der
ist frei. TOUR-EPIC-001a liegt im April 2027 — bis dahin ist reichlich Zeit,
die schriftliche Genehmigung einzuholen. So blockiert nichts, und es entsteht
keine Einbindung, die später zurückzubauen wäre.

## Konsequenzen

- **UX-EPIC-001 kann im Oktober ohne Vorbehalt bauen.** Die Google-Story ist
  nicht mehr „zuletzt oder gar nicht", sondern regulärer Bestandteil — Teil 1
  ist entschieden.
- **TOUR-EPIC-001a bleibt blockiert**, bis Weg A, B oder C gewählt ist. Das
  verschiebt nichts: das Epic liegt in Stufe 2.
- Die Endgeräteregel wird zur harten Voraussetzung des Navigationslinks. Ohne
  sie wandert der Wegverlauf in private Google-Konten — und das ist eine
  Verarbeitung, die niemand angeordnet hat.
- Die Regel „nur auf Aktion" ist ab jetzt eine **Prüfregel im Review**, nicht
  nur eine Gestaltungsempfehlung. Ein automatisch geladener Kartenrahmen kippt
  die Einordnung aus „Werkzeug bereitgestellt" in „Übermittlung veranlasst".
- Der API-Schlüssel wird bewusst **nicht** wie ein Secret behandelt. Wer ihn
  als Secret führt, wiegt sich in falscher Sicherheit: er steht im
  ausgelieferten HTML. Der Schutz ist die Domainbindung plus das Ausgabenlimit.
- Fällt der Angemessenheitsbeschluss zum Data Privacy Framework, sind Teil 2
  und 3 sofort betroffen, Teil 1 nur mittelbar. Das ist ein Grund mehr, die
  Karte nicht vorzuziehen.
- §9 („Routing-Rohdaten unterliegen einer kurzen Speicherfrist") wird durch
  Punkt 11 **strenger** erfüllt als gefordert: es entstehen keine.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Auswahl eines konkreten Alternativanbieters für Weg C.
- Die Tourenoptimierung (§9, „später KANN") und jede automatische
  Reihenfolgebildung.
- Der Inhalt der Endgeräte-Richtlinie über die Navigationsregel hinaus
  (BETRIEB-001, Roadmap G16).
- Der Wortlaut der Datenschutzinformation (PAT-006).
- Die aggregierte Auswertung von Tourendaten — mit B6 am 2026-09-08 verneint,
  hier nur nachvollzogen.

## Offene Folgefragen

- Welcher der drei Wege wird gewählt, und wann? (Bestätigungsfrage an Jannes.)
- Liegt die Genehmigung der Datenschutz-Fachkraft schriftlich vor, und deckt
  sie ausdrücklich die Übermittlung an einen **eigenen Verantwortlichen** ohne
  AVV ab — oder ist sie zu einer Auftragsverarbeitung ergangen, die es nicht
  gibt?
- Stimmt die Grenze von 20 Zwischenzielen? Vor TOUR-EPIC-001a gegen die
  Anbieterdokumentation prüfen.
- Wie wird die Endgeräteregel überprüft, ohne das Telefon der Therapeutin zu
  kontrollieren (§20)? Vorschlag für BETRIEB-001: schriftliche Bestätigung
  statt technischer Kontrolle.
- Braucht der Navigationslink eine Einwilligung der Patient:innen, oder trägt
  ihn Art. 9 Abs. 2 lit. h in Verbindung mit §22 BDSG als Teil der
  Behandlung? Frage an die Datenschutzberatung (B2).

## Quellen der Recherche vom 2026-09-08

- Google Maps Platform Service Specific Terms und Controller-Controller Data
  Protection Terms (Rolle als eigener Verantwortlicher, kein AVV) — Übersicht
  abgerufen, Volltext teils gesperrt.
- Cloud Data Processing Addendum (deckt „bestimmte Google-Cloud-Dienste" ab;
  die Maps Platform hat eigene Bedingungen). **Nicht abschließend verifiziert**
  — siehe Belegtiefe im Prüfkatalog.
- EuGH C-40/17 *Fashion ID* (Mitverantwortlichkeit bei eingebetteten
  Drittinhalten).
- EuG T-553/23 *Latombe* (2025-09-03, abgewiesen); Rechtsmittel EuGH
  C-703/25 P (anhängig seit 2025-10-31); US Supreme Court *Trump v. Slaughter*
  (2026-06-29).
- Sekundärquellen zur deutschen Praxis der Google-Maps-Einbindung.

**Rechtsberatung ersetzt das nicht.** Die Einordnung stammt aus einer
Dokumentenrecherche, nicht von einer Fachkraft; sie geht mit der Anfrage B2 an
die Datenschutzberatung.
