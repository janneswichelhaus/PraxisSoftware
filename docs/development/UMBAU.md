# Umbau der Dokumentation und des Ablaufs

Stand 2026-09-23 · Arbeitsplan ohne Rang (wie alles unter `docs/development/`). Er hält fest, was
Jannes am 2026-09-23 entschieden und beschrieben hat, und in welchen Schritten das in die
verbindlichen Dokumente kommt. **Nach U5 ist er erledigt** und wandert ins Archiv.

Aufruf einer Umbau-Session: **„Umbau U&lt;n&gt; nach `docs/development/UMBAU.md`"**. Jede Session
bearbeitet genau einen Schritt, endet mit einer Pull Request und hakt den Schritt unten ab.

## Regeln für jeden Schritt

- **Einarbeiten, nicht anhängen.** Was sich geändert hat, ersetzt den alten Text an seiner Stelle.
  Kein „Präzisierung vom …"-Absatz, keine Verlaufsnotiz im normativen Text; Geschichte gehört in
  Chronik oder Git.
- **Kürzen, wo es ohne Informationsverlust geht.** Eine Regel steht an einer Stelle; andere
  Dokumente verweisen.
- **Kein Gate wird abgeschwächt** — keine Sicherheits-, RLS-, Datenschutz- oder CI-Prüfung
  (`CLAUDE.md`, „Harte Regeln"). Ein Umbau-Schritt ändert keinen Produktivcode außer Kommentaren
  und Prüfskripten der Dokumentation.
- Prüfung vor der PR: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check`.

## Was Jannes am 2026-09-23 beschrieben hat

Gilt ab sofort; U1 und U2 arbeiten es in die Dokumente ein.

**Team und Wachstum**

- Zur Eröffnung arbeitet sehr wahrscheinlich nur Jannes mit der Software, eventuell eine weitere
  Person. Das Wachstumstempo ist offen.
- Der Owner stellt alles selbst ein: Teammitglied anlegen, Rolle wählen — die Person ist je nach
  Rolle eingebunden.
- Das Büro macht anfangs Jannes, bald eine Person, die nur im Büro arbeitet.
- Training betreut zuerst nur Jannes, später auch andere Therapeut:innen.
- Jede:r Therapeut:in hat ein eigenes Rad; es gibt so viele Räder wie Therapeut:innen.
- Jannes will bald nur noch 2–3 Patient:innen am Tag behandeln; der Rest ist Organisation und
  Weiterentwicklung. **Organisation und Steuerung sind für den Owner Kernfunktionen, kein Komfort.**

**Ein Behandlungstag**

1. Am Radstellplatz kommt das Handy in die Halterung. Die Oberfläche ist ruhig und überschüttet
   nicht mit Informationen.
2. Sie zeigt den ersten Weg, eine Vorschau auf den nächsten und kurz, was beim Patienten zu
   beachten ist.
3. Die Navigation übernimmt die Navigations-App des Geräts.
4. **Behandlungsliege:** Je Patient:in ein Merkmal „Liege benötigt", gesetzt im Befund. Beim
   Losfahren ist sichtbar, ob die Liege heute gebraucht wird — auch wenn erst ein späterer Besuch
   sie braucht.
5. Vor der Tür: die bisherige Dokumentation kurz ansehen.
6. Dokumentieren ohne ausschließlich zu tippen: aktuelle Lage über Skalen, dann per Sprache, die
   KI strukturiert. **Es gibt eine Alternative ohne Sprechen.**
7. **Fotos von Patient:innen** — damit andere Therapeut:innen einen Eindruck haben und für
   Vergleiche im Verlauf.
8. **Erstaufnahme:** Befund, Scores, dazu ein Foto der Verordnung und des ausgefüllten
   Anmeldebogens, sinnvoll in der Akte abgelegt. Das muss für alle Therapeut:innen einfach sein und
   **darf nicht vergessen werden**.
9. Am Ende wird das Rad abgestellt.

**Geschäft**

- Anfangs ist das Geschäft praktisch nur Heilbehandlung. Training nehmen einzelne Patient:innen in
  Anspruch, die nach ihrer Verordnung weitermachen wollen.
- Training findet bei den Kund:innen, draußen oder per Video statt und steht **in derselben
  Tagesroute** wie die Behandlungen.
- Ein Trainingspaket ist **nach Zeitraum** geschnitten und **nicht pausierbar**.

**Plattform**

- Die 15 Punkte aus `../product/ideen/referenz-navigation.md` sind die **Ansicht der
  Trainingskund:innen**. Die Ansichten für Patient:innen und für Betreuer:innen sind noch nicht
  entworfen.
- Eine Terminanfrage über die Plattform ist **nur ein Wunsch**; das Büro bestätigt.
- Ein Befundbogen wird idealerweise **vorab** von den Patient:innen ausgefüllt.

**Räume**

- Es gibt keine Behandlungsräume. In etwa drei Jahren ist ein Standort mit Büro, Trainingsgeräten
  und Kursraum denkbar; die Struktur dafür ist angelegt (`location_id`, ADR-003).

**Zusammenarbeit**

- Abnahmen nach jeder kleinen Umsetzung sind zu viel; gesichtet wird Stück für Stück.
- **Qualität ist am wichtigsten**; produktiver bei gleicher Qualität ist erwünscht.
- Die Oberfläche ist auch am Desktop oft unübersichtlich, Beschriftungen sind nicht intuitiv. Jannes
  will bald auf dem eigenen Handy testen.

## Entscheidungen vom 2026-09-23

| Nr | Entscheidung |
| --- | --- |
| E-1 | Die externen Anfragen (OPS-001, B1, B2 mit DSFA, B4) gehen **ab Anfang 2027 parallel zum Bauen** hinaus, nicht erst nach M2. Das Bauen wartet weiterhin nie auf eine Antwort (§15.2). |
| E-2 | Test auf dem eigenen Handy: (a) sofort lokal im WLAN; (b) eine Test-Umgebung in der Cloud mit eigener Domain, **nur synthetische Daten**, Supabase in der EU — vorgezogen aus Block 12, direkt nach dem Umbau. Konten legt Jannes selbst an. |
| E-3 | Übergang Patient:in → Trainingskund:in: In den letzten ein bis zwei Terminen einer Verordnung erinnert die App an das Abschlussgespräch. Das Angebot ist mündlich; der Trainingsvertrag wird per Link im eigenen Konto geschlossen, mit Widerrufsbelehrung und eigener Einwilligung. Aus der Akte wird nur übernommen, was die Person ausdrücklich freigibt. Das Paket beginnt nach dem Ende der Verordnung. |
| E-4 | Plattform für Patient:innen, **Option B**: Während der Behandlung ist alles kostenlos — Befundbogen vorab, Termine und Terminwünsche, Rechnungen und Dokumente, Heimübungsplan mit Videos, Check-ins, Einwilligungen. Nach dem Ende der Verordnung gibt es ein **Nachsorge-Abo**, monatlich kündbar: Heimprogramm bleibt aktiv und wird angepasst, Fortschritt, Gewohnheiten, Rückfragen mit Foto oder Video und fester Antwortfrist. Nach einer Kündigung 30 Tage lesender Zugriff und Plan als PDF. Trainingskund:innen haben alles im Paketpreis. |
| E-5 | **UX-Fundament vorziehen:** Begriffsliste in Jannes' Sprache, Bedienprinzipien, Tagesansicht zuerst für das Handy — vor weiteren Oberflächen. |
| E-6 | Sessionstart mit drei Befehlen — `/weiter`, `/idee <Text>`, `/sichtung`. **Keine Abnahme je Epic:** Ohne Oberfläche gilt ein Loop mit grüner CI, `pnpm test:db` und Zweitreview als fertig; mit Oberfläche bringt die PR Bildschirmfotos (Desktop und 375 px), gesichtet wird gesammelt je Block am Handy. |
| E-7 | Alles oben gilt ab sofort und wird eingearbeitet, nicht angehängt; gekürzt wird, wo es geht. |

## Vorschläge für neue Anforderungen

Werden in U2 in die Roadmap eingeplant; ausgearbeitet im SPEC-Schritt des jeweiligen Loops.

- **Erstaufnahme-Checkliste je neuer Person:** Verordnungsfoto, Befundbogen (vorab ausgefüllt oder
  als Foto des Papierbogens), Einwilligungen einschließlich Fotoeinwilligung, Befund,
  Liege-Merkmal. Offene Punkte stehen in der Tagesansicht, im Kopf der Akte und in einer Büroliste,
  bis sie erledigt sind.
- **Fotos nur über die Kamera der App**, nicht über die Galerie — sonst liegen Gesundheitsdaten in
  der privaten Mediathek und ihrem Cloud-Backup. Fotos von Patient:innen brauchen eine eigene
  Einwilligung.
- **Verordnungsfoto mit KI-Vorschlag** für die Felder (über das AI Gateway, ADR-005); der Mensch
  bestätigt.
- **Liege** als Merkmal der Person; Tagesstart zeigt „Liege heute: ja, ab 2. Besuch".
- **Dokumentation ohne Sprechen:** Skalen und Bausteine zum Antippen, Textbausteine, Nachtragen am
  Abend. Die Diktierfunktion der Handy-Tastatur schickt Audio an Apple oder Google und ist für
  Gesundheitsdaten nicht zulässig.

## Befunde der Durchsicht vom 2026-09-23

Drei Durchsichten (Grundlagen, Ablauf, Produkt und Register), nur lesend. Die Zuordnung zu den
Schritten steht unten; Zeilenangaben beziehen sich auf den Stand vor U1.

**Muster:** Neues wurde angehängt statt eingearbeitet — der Umfang vom 2026-09-22 steht als
Zusatzabsatz in §14, während §4.6, §4.10, §8, §19, ADR-014 und ADR-013 vom alten Umfang ausgehen.
Die Produktvision beschreibt Regeln, kaum das Produkt. Der Ablauf kostet mehr, als er bringt: drei
widersprüchliche Startwege, fünf Dokumente Pflege je Loop, ein Abnahmerückstand, den eine Person
nicht abbauen kann.

## Schritte

### U0 — Plan ins Repository · erledigt 2026-09-23

### U1 — Grundlagen neu fassen (Rang 1 und 2) · erledigt 2026-09-23

Ergebnis: `PROJECT_PRINCIPLES.md` 0.17 (Datei 2 161 → rund 1 640 Zeilen, allein durch die
Auslagerung der Vermerke nach `docs/PRINCIPLES-CHRONIK.md`; der normative Text ist gleich lang
geblieben, weil Streichungen und neue Festlegungen sich aufheben), ADR-014 Fassung 2, ADR-013
Fassung 4, ADR-009 Fassung 3, Vermerke in ADR-018 und ADR-007, gekürzte
Statusabschnitte in ADR-006, -009, -021, -022. Weiter zu kürzen hieße,
normative Aussagen zu streichen. **Nicht gemacht:** ADR-006 Punkt 8
wiederholt §6.3 weiter — ein angenommener Punkt wird nach `docs/adr/README.md`
nicht umgeschrieben. Die Offline-Frage (ADR-001 Punkt 3) geht mit U2 in den
Auftrag für ADR-024.

Auftrag war:

- `PROJECT_PRINCIPLES.md` neue Version, **zusammengeführt statt ergänzt**:
  - §14 als ein Text mit dem heutigen Umfang (Training, Plattform, Nachsorge-Abo, Pakete sind
    freigegeben; die Sperren davor entfallen).
  - §4.6 und §4.10: Plattformstufen nach E-4, Ansicht der Trainingskund:innen, Terminwunsch statt
    Termin, Befundbogen vorab; Identitätsprüfung und Vertretung verweisen auf ADR-023.
  - §8: Terminlänge frei (Abweichung von 45/60 gekennzeichnet), Fahrzeit nach ADR-019, Zustände
    „angefragt/vorgemerkt" erreichbar mit der Plattform, automatische Terminsuche ist V1.
  - §19: Nachsorge-Abo, Paket nach Zeitraum und Trainingsleistung als abrechenbare Ereignisse;
    „fakturiert ausschließlich aus dokumentiert" gilt für Heilbehandlung am Termin.
  - §15: Die Stoppliste steht bei §15.1; §15.2 übernimmt E-1.
  - §6.1 Gateway „ab dem ersten KI-Feature, auch mit Mock"; §6.3 verweist auf KI-EPIC-001.
  - Verweis §6 → §5 bei der Korrektur klinischer Dokumentation; STATUS-Pfad in §21.
  - Änderungsvermerke in eine eigene Chronik, Verlaufsnotizen aus dem Text. **Ziel: rund ein
    Drittel kürzer.**
- ADR-014 neue Fassung: „Abonnements" in der Negativliste nur noch als SaaS-Abrechnung für Dritte.
- ADR-013 neue Fassung: Negativfälle „fremde Person/Kund:in" und „anderer Leistungsbereich";
  „zehn Prüfungen"; Verweise ohne Fassungsnummer, wo der Punkt weiter gilt.
- ADR-009: Nachsorge-Abo und Paket; Punkt 13 (Override) als in V1 nicht vorgesehen kennzeichnen.
- ADR-018, ADR-007: Sätze „ohne Patientenportal …" auf den heutigen Umfang.
- ADR-006 Punkt 8 verweist auf §6.3 statt die Liste zu wiederholen.
- Status-Abschnitte der ADRs auf Zustand, Fassung, Datum kürzen; `docs/adr/README.md` ohne
  Versionsangabe der Prinzipien; ADR-Liste nur an einer Stelle vollständig.
- Offline für Therapeut:innen (ADR-001 Punkt 3) als Frage in den Auftrag für ADR-024.

### U2 — Produktbeschreibung und Roadmap 7.0 · erledigt 2026-09-23

Ergebnis: `docs/PRODUCT_VISION.md` ist die Produktbeschreibung (Praxis, wer damit arbeitet,
Behandlungstag, Plattformstufen, Geschäftsmodell, Bedienung). Roadmap 7.0 mit Block 1a, DOK-006,
DSN-001, UI-003, Sichtung statt Abnahme je Epic, Anfragen ab Anfang 2027; `fortschritt.json`
ergänzt. Ideenspeicher (ANG-001/003/004, ALT-005, LZK, PRX-003, Anrufliste, Kartenzahlung,
Navigationsleiste) und Anfragen B4 (Fragen 6 und 7), B9, B11 auf den Stand. Die Regel „Sichtung"
steht in der Roadmap; Skills, Abnahme-README und Fortschrittsstufen zieht U3 nach.

Auftrag war:

- `docs/PRODUCT_VISION.md` wird zur Produktbeschreibung: Geschäftsmodell (Behandlung →
  Nachsorge-Abo → Training), Nutzer:innen und Wachstum, Behandlungstag, Erstaufnahme, Plattform-
  stufen, später ein Standort. Kurz, fachlich, ohne Regeln zu wiederholen.
- Roadmap 7.0:
  - Nach Block 1 neuer Block **„Handy und UX-Fundament"**: Test-Umgebung (U5), Begriffsliste,
    Bedienprinzipien, Tagesansicht zuerst für das Handy mit Liege und Vorschau.
  - Neue Anforderungen aus „Vorschläge" einplanen (Befund-, Dokumentations- und KI-Loops).
  - Designschritt „Ansichten für Patient:innen und Betreuer:innen" vor Block 4.
  - Block 5 baut das Nachsorge-Abo (E-4) und das Paket nach Zeitraum.
  - Anfragen ab Anfang 2027 parallel (E-1), R1 neu bewerten.
  - Grundsatz 3: Organisation ist für den Owner Kern, nicht Komfort.
  - Kennung `UI-001` ist doppelt vergeben — das Block-9-Epic umbenennen.
  - Keine neue Fassungsnummer je Loop; Geschichte in die Chronik.
- Ideenspeicher auf den Stand der Roadmap: `ideen/00`, `05`, `09`, `10`, `referenz-navigation.md`
  (Ansicht der Trainingskund:innen); in `IDEENSPEICHER.md` den Satz „verliert auch gegen
  OPEN_DECISIONS" streichen.
- Aus U1: Die Frage, ob Offline für Therapeut:innen (ADR-001 Punkt 3) in V1 kommt, in den
  Auftrag für ADR-024; Verweise auf „`PROJECT_PRINCIPLES.md` 0.16 §14" auf §14 umstellen.
- Aus dem Zweitreview von U1: In die Anfrage B2 die Frage zur Zweckbindung aufnehmen — die
  Erinnerung an das Abschlussgespräch nutzt Behandlungsdaten (Ende der Behandlung) für ein
  Angebot außerhalb der Heilbehandlung (§4.10).
- Für U4: ANN-025 mit dem neuen SOLLTE in §4 und mit B13 zusammenführen.
- `docs/decisions/ANFRAGEN.md`: B4, B9, B11 auf den heutigen Umfang, Steuerfrage zum
  Nachsorge-Abo, Versand ab Anfang 2027.

### U3 — Ablauf schlank

- Skills `/weiter` (erste Aufgabe aus STATUS, dann der Feature-Loop), `/idee`, `/sichtung`.
- `SESSION-START.md` auf einen Satz; **eine** Leseregel im Skill: STATUS, die Zeile der Etappe,
  die benannten ADRs.
- Fortschritt: `fortschritt.json` ist die einzige Quelle; die Tabelle der Roadmap wird daraus
  erzeugt oder gegen sie geprüft.
- Abnahme → Sichtung nach E-6; der Rückstand wird zu einer Sichtung je Etappe mit höchstens 15
  Schritten verdichtet. `GRAPH-ENGINEERING-WORKFLOW.md`, `OPTIMIERUNG.md` und die Roadmap-Regel
  entsprechend.
- Erledigte Pläne nach `docs/development/archiv/`: `CAL-EPIC-004.md`, `VER-EPIC-002.md`,
  `E18-LEISTUNGSBEREICHE.md`, erledigte Teile von `MAP-LOOPS.md`.
- `docs/DEVELOPMENT.md`: Handytest im WLAN (E-2 a), Wochenroutine prüfen oder abschalten,
  erledigte Einschränkungen streichen.
- STATUS: alle ungemergten Branches nennen und mit Jannes sichten (löschen nur mit seinem OK).
- `docs:check`: Grenze des Annahmenregisters je Eintrag statt als Gesamtzahl.

### U4 — Register aufräumen

- `ASSUMPTIONS.md`: tote Anker (ANN-011, -012, -013, -014, -019, -032 zeigen auf das frühere
  Verordnungsmodul), abgelöste Einträge (ANN-012, ANN-037), Prüfpaket-Markierung einheitlich,
  abgelaufene Wiedervorlagen, ANN-025 an B13; Kommentar zu ANN-006 in `src/features/today/api.ts`.
- `OPEN_DECISIONS.md`: B13 wieder offen (Mails an Patient:innen), Termine entfernen, Kopf von E16,
  tote und falsche Kennungen.
- `BEFUNDE.md`: erledigte Befunde schließen (BEF-004, -007, -020).
- `ARBEITSBEREICHE.md`: Terminlänge, Apple Maps, Widerspruch zur Vorschau-Kennzeichnung.
- Kopfzeilen von `providerpruefung-kartendienst.md` und `rechnungs-pdf-optionen.md`.

### U5 — Test-Umgebung

- Optionen für das Hosting der Oberfläche mit Empfehlung (neuer Anbieter → Prüfung nach ADR-002);
  Jannes entscheidet.
- Jannes legt das Supabase-Projekt in der EU und die Domain an; Deployment aus `main` nur in die
  Test-Umgebung, nur synthetische Daten, Zugang geschützt.

**Danach:** `/weiter` — G6c, sobald Jannes' Wahl da ist, sonst Block „Handy und UX-Fundament".
**Für Jannes vor dem UX-Block:** Begriffe und Stellen sammeln, die stören (Stichworte oder
Bildschirmfotos).
