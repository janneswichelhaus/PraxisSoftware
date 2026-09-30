# DSN-001 — Ansichten der Plattform für Patient:innen und Betreuung

Stand 2026-09-30 · **Bestätigt von Jannes am 2026-09-30**, D1 bis D7 wie empfohlen
(Roadmap Block 4) ·
**Loop-Vorgabe**: Eingabe für den SPEC-Schritt von POR-EPIC-001 bis -003 und
der Loops, die die Plattform füllen. Kein eigener Rang: Dieses Dokument legt
**Aufbau und Bedienung** fest, nicht Rechte, Fristen oder Datenmodell. Wo es
eine Regel nennt, zitiert es sie; wo es eine Wahl trifft, steht sie als
Festlegung **D1 bis D7** in Abschnitt 8, jede mit Empfehlung.

Die Ansicht der **Trainingskund:innen** entwirft dieses Dokument nicht neu:
Ihren Umfang legt `PROJECT_PRINCIPLES.md` §4.10 fest, ihr Vorbild ist
[`../product/ideen/referenz-navigation.md`](../product/ideen/referenz-navigation.md).
Sie bekommt hier nur ihren Platz im selben Gerüst (Abschnitt 5).

## 1. Worum es geht

**Drei Gruppen** benutzen die Plattform, eine vierte arbeitet in der Praxis mit
dem, was dort entsteht. Jede hat ihre eigene Leitfrage:

| Wer | Leitfrage | Grundlage |
| --- | --- | --- |
| **Patient:in während der Behandlung** (Stufe 1) | Was muss ich bis zum nächsten Termin tun? | §4.6, kostenlos, Teil der Heilbehandlung |
| **Patient:in im Nachsorge-Abo** (Stufe 2) | Wie bleibe ich dran, und wen frage ich? | §4.6, §19, ANG-EPIC-001 |
| **Trainingskund:in** | Was trainiere ich, und wie läuft es? | §4.10 |
| **Betreuung** (Praxisseite) | Was ist aus der Plattform bei mir angekommen? | §4.2, §4.3, §4.9 |

„Betreuung" meint hier die Praxisseite: owner, Therapeut:innen, Büro und
Trainingsbetreuung, jeweils in ihrem Bereich (§4.8). Sie arbeiten in der
bestehenden Praxisoberfläche weiter; die Plattform bekommt dort **keine
eigene Oberfläche**, sondern Abschnitte an den Stellen, an denen die Arbeit
heute schon liegt (Abschnitt 6).

## 2. Was vorher feststeht

Diese Sätze entscheidet DSN-001 nicht; es baut auf ihnen auf.

1. **Eigene Daten, sonst nichts** (§4.6, §4.10). Jede Sicht hat einen
   Negativfall „fremde Person" (Roadmap R5).
2. **Konto ist nicht Akte** (§4.6). Wer kein Konto will, wird behandelt wie
   bisher; Pläne gibt es dann als PDF. Sperren oder Entziehen des Zugangs
   berührt die Akte nicht.
3. **Der Zugang ist keine Akteneinsicht nach § 630g BGB** (B5, Rahmensatz 2).
   Die Plattform zeigt deshalb **nichts aus der Akte**, was nicht eigens für
   die Plattform bestimmt ist: keinen Befund, keine Behandlungsdokumentation,
   keine internen Notizen, keine Patientenfotos (ADR-017 Punkt 37). Die
   Einsicht bleibt ein eigener Vorgang auf Antrag.
4. **Ein Terminwunsch ist ein Wunsch** (§8). Einen Termin daraus macht das
   Büro; ADR-018 hat dafür die Zustände „angefragt" und „vorgemerkt"
   vorgesehen.
5. **Keine Bewertung** (§17, ADR-006 Punkte 10 bis 12). Die Plattform zeigt
   Angaben und Verläufe, nie eine Ampel, einen Schwellenwert, eine
   Empfehlung oder eine Freigabe. „NRS 4, Ihre Angabe vom 12.03." ja,
   „Es geht Ihnen besser" nein.
6. **Behandlung und Training bleiben getrennt, auch in der eigenen Sicht**
   (§4.10 letzter Absatz, §4.8).
7. **Ein Konto gehört einer Person; Vertretung ist eine eigene Beziehung mit
   eigenem Konto** (B5, Rahmensatz 1). Wie sie entsteht und was sie sieht,
   regelt ADR-023.
8. **Handy zuerst, für 78-Jährige** (§2.2, `IDEA-QSN-006`). Die
   Bedienprinzipien aus UX-EPIC-002 gelten: ein Hauptknopf je Ansicht, was
   nicht gebraucht wird, ist eingeklappt.
9. **Kein Mailversand an Patient:innen, solange B13 offen ist** (Roadmap R8).
   Einladungen laufen über einen Adapter mit `mock`-Weg; die Plattform muss
   ohne Benachrichtigung benutzbar sein. Die Übersicht ist der Ort, an dem
   man sieht, was zu tun ist — nicht ein Posteingang.

## 3. Das Gerüst — gleich für alle drei Gruppen

Eine Person, die die Plattform öffnet, sieht **nie** die Praxisoberfläche:
keine Seitenleiste mit Arbeitsbereichen, keine Funktionssuche, keine
Praxisbegriffe. Wie beide Oberflächen technisch getrennt werden (Routen,
Rollenprüfung, Sitzung), entscheidet ADR-023.

```
┌─────────────────────────────────────┐
│ [Wortmarke]            [Ich ◯ JW]   │  Kopf: Praxis und „Ich"
│ (Behandlung | Training)             │  nur bei zwei Verhältnissen (D6)
├─────────────────────────────────────┤
│                                     │
│   Inhalt des gewählten Reiters      │
│                                     │
├─────────────────────────────────────┤
│Übersicht Termine Übungen Nachrichten│ Reiterleiste unten
└─────────────────────────────────────┘
```

- **Unten höchstens fünf Reiter**, jeder mit Symbol **und** Wort. Ein Reiter
  erscheint erst, wenn der Loop gebaut ist, der ihn füllt — kein Reiter
  „kommt bald" (dieselbe Regel wie bei den Vorschauen, ANN-112).
- **Oben rechts „Ich"**: Rechnungen, Dokumente, Einwilligungen, Profil,
  Einstellungen, Datenexport, Abmelden. Was man selten braucht, liegt hier.
- **Was man gelernt hat, bleibt an seinem Platz.** Die Reiter verschieben
  sich zwischen den Stufen nicht; Stufe 2 fügt einen hinzu (Abschnitt 4.2).
- **Oben steht die Marke der Praxis** (Own Motion), aus `marke/`, keine
  zweite Fassung.

Die Reiter und ihre Leitfragen:

| Reiter | Leitfrage | Stufe 1 | Stufe 2 | Training |
| --- | --- | --- | --- | --- |
| **Übersicht** | Was ist jetzt dran? | ja | ja | ja |
| **Termine** | Wann komme ich dran, und was möchte ich ändern? | ja | ja | ja |
| **Übungen** (im Training: **Training**) | Was mache ich heute? | ja | ja | ja |
| **Verlauf** | Was habe ich angegeben, wie war es bisher? | — | ja | ja |
| **Nachrichten** | Wie frage ich die Praxis? | ja | ja | ja |

„Nachrichten" statt „Rückfragen": Das Wort versteht jede:r. Innen ist es
trotzdem eine strukturierte Rückfrage mit Typ, Bezug und Zustand
(`IDEA-KOM-001`), kein offener Chat.

## 4. Patient:innen

### 4.1 Stufe 1 — während der Behandlung

**Übersicht** ist eine kurze Liste dessen, was zu tun ist — keine Kennzahlen
(`IDEA-ORG-001`). Leer heißt: „Gerade ist nichts zu tun. Ihr nächster Termin:
…". Mögliche Einträge, in dieser Reihenfolge:

1. **Befundbogen ausfüllen** — vor dem ersten Termin, solange er offen ist
   (§7). Die Therapeut:in prüft ihn beim Termin.
2. **Nächster Termin** — Datum, Uhrzeit, wer kommt, und bei Hausbesuch die
   Anschrift, an die jemand kommt.
3. **Check-in fällig** — im Takt, den die Therapeut:in eingestellt hat
   (`IDEA-TRK-004`).
4. **Übungen für heute** — ein Knopf in den Plan.
5. **Antwort der Praxis** auf eine Nachricht.
6. **Offene Rechnung** — Betrag, Fälligkeit, Knopf zur Rechnung.

```
┌─────────────────────────────────────┐
│ [Wortmarke]            [Ich ◯ JW]   │
├─────────────────────────────────────┤
│ Guten Tag, Frau Beispiel            │
│                                     │
│ ┌─ Befundbogen ausfüllen ─────────┐ │
│ │ Vor Ihrem ersten Termin am      │ │
│ │ Di 14.10. · etwa 10 Minuten     │ │
│ │ [ Jetzt ausfüllen ]             │ │
│ └─────────────────────────────────┘ │
│ ┌─ Nächster Termin ───────────────┐ │
│ │ Di 14.10., 9:30 · Hausbesuch    │ │
│ │ Jannes kommt zu Ihnen           │ │
│ └─────────────────────────────────┘ │
│ ┌─ Check-in ──────────────────────┐ │
│ │ Drei kurze Fragen · 1 Minute    │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│Übersicht Termine Übungen Nachrichten│
└─────────────────────────────────────┘
```

**Termine** zeigt kommende und vergangene eigene Termine im Behandlungsbereich.
Zwei Handlungen, beide als Wunsch (§8, D4):

- **Termin wünschen**: Welche Tage und Tageszeiten passen (Vormittag,
  Mittag, Nachmittag), dazu eine freie Zeile. Zeigt die Anwendung später
  freie Zeitfenster zur Auswahl an, ist auch die Auswahl ein Wunsch.
- **Termin ändern oder absagen**: am einzelnen Termin. Vor dem Absenden steht
  der **Hinweis zum Ausfallhonorar** in festem Wortlaut aus den
  Praxisstammdaten, bei weniger als 24 Stunden deutlich über dem Knopf
  (ADR-018 Punkt 8; derselbe Mangel wie BEF-079 in der Praxisoberfläche darf
  hier nicht entstehen). Die Frist rechnet der Server.

Ein Wunsch steht bis zur Antwort als **„angefragt — die Praxis meldet sich"**
in der Liste, nie wie ein bestätigter Termin. Die Belegung anderer Personen
ist nie sichtbar, auch nicht als „belegt".

**Übungen** ist der Heimübungsplan: die Übungen des Tages in Reihenfolge, je
Übung Name, Video oder Bild, Dosierung in Worten („3 × 10, langsam"), Hinweis
der Therapeut:in. Ein Haken „gemacht" und ein freiwilliges Feld „Das war
schwierig, weil …". Keine Punktzahl, keine Serie, kein Lob aus der Software.
Liegt kein Plan vor: „Ihre Therapeut:in stellt Ihnen hier Übungen zusammen."
Gebaut wird der Plan in UEB-EPIC-001 bis -003.

**Nachrichten**: Neue Nachricht in zwei Schritten — **Worum geht es?**
(Übung · Beschwerden · Termin oder Rechnung · Sonstiges) und **Text**. Über
dem Eingabefeld, dauerhaft und nicht wegklickbar (`IDEA-KOM-002`):

> Antwort in der Regel innerhalb von zwei Werktagen.
> **Nicht für akute Beschwerden.** Im Notfall 112, außerhalb der
> Sprechzeiten der ärztliche Bereitschaftsdienst 116117.

Der Hinweis ist für alle gleich und hängt nie vom Inhalt ab — eine
Einstufung „klingt dringend" wäre eine Risikoklassifikation (ADR-006
Punkt 4). Die Frist „zwei Werktage" ist ein Platzhalter aus Praxisstammdaten,
festgelegt in KOM-EPIC-001. Fotos und Videos als Anhang nennt §4.6 erst für
die Stufe 2; in Stufe 1 gibt es sie nicht.

**Check-in** hat keinen eigenen Reiter: Er erscheint in der Übersicht, wenn
er fällig ist, und nach dem Absenden steht dort, **was mit den Angaben
geschieht**: „Danke. Ihre Therapeut:in sieht Ihre Angaben beim nächsten
Termin. Bei akuten Beschwerden: 112 oder 116117." Check-ins werden nicht
laufend überwacht; die Plattform darf das auch nicht versprechen (D5).
Die eigenen Antworten stehen in Stufe 1 unter **Ich → Meine Angaben** als
Liste mit Datum.

**Ich** in Stufe 1: Rechnungen (eigene, D3), Dokumente (einzeln freigegeben,
D3), Einwilligungen erteilen und widerrufen (POR-EPIC-003), Meine Angaben,
Profil (Anschrift, Telefon; Änderung als Hinweis an die Praxis), Einstellungen,
Datenexport (`IDEA-QSN-003`), Abmelden.

### 4.2 Stufe 2 — Nachsorge-Abo

Dasselbe Gerüst, dieselben Reiter. Neu ist der Reiter **Verlauf** zwischen
Übungen und Nachrichten, sonst wächst der Inhalt:

- **Übersicht** bekommt die Gewohnheiten des Tages (`IDEA-ALT-002`) als kleine
  Haken, ohne Serie und ohne Druck.
- **Übungen** heißt weiter so; das Heimprogramm bleibt aktiv und wird von der
  Therapeut:in angepasst. Oben steht, wann es zuletzt angepasst wurde.
- **Verlauf** zeigt die eigenen Angaben über die Zeit: Check-ins als Kurve
  **mit den Werten und Daten**, Ereignisse darunter (Planwechsel, Termin),
  gemachte Übungen je Woche. Keine Farbe als Bewertung, keine Trendlinie mit
  Deutung, kein Satz über die Bedeutung (ADR-006 Punkt 11). Die Liste aus
  „Meine Angaben" zieht hierher um.
- **Nachrichten** nehmen Foto und Video an, mit der zugesagten Antwortfrist
  des Abos (§4.6) — aber erst, wenn Anhänge von Patient:innen freigegeben
  sind: eigene Einwilligung, kurze Frist, Metadaten entfernt (ADR-017
  Punkte 30 und 42, `IDEA-KOM-003`). Bis dahin nur Text. Der Notfallhinweis
  bleibt.
- **Termine** bleibt: für Kontrolltermine, das Abschlussgespräch und eine
  neue Verordnung.

Kopf und „Ich" zeigen den **Abo-Stand**: seit wann, nächste Monatsrechnung,
Knopf **Abo kündigen** — ohne Umweg, ohne Rückhaltedialog (ANG-EPIC-001).

### 4.3 Übergänge

| Moment | Was die Person sieht |
| --- | --- |
| **Einladung** aus der Akte | Eine Einladung mit Anmeldeweg (ADR-023). Nach der ersten Anmeldung ein kurzer Einstieg: Willkommen, Einwilligungen, Benachrichtigungen. Die Praxis kann den Einstieg für die Person überspringen oder mit ihr gemeinsam ausfüllen — **Einwilligungen nie** (`IDEA-LZK-005`). |
| **Behandlung endet, kein Abo** | 30 Tage lesend, dann bleibt nur „Ich" (D2). Oben ein ruhiger Hinweis mit Datum und dem Plan als PDF. |
| **Abo beginnt** | Frühestens mit dem Ende der Behandlungsgrundlage (ADR-009 Punkt 21). Der Reiter „Verlauf" erscheint. |
| **Abo gekündigt** | 30 Tage lesend (§4.6): alle Knöpfe, die schreiben, fallen weg; oben „Lesend bis 31.10." und „Plan als PDF". Danach wie „Behandlung endet". |
| **Zugang gesperrt oder entzogen** | Anmeldung scheitert mit dem Satz, sich an die Praxis zu wenden. Die Akte bleibt unberührt (§4.6). |
| **Neue Behandlung** | Stufe 1 lebt wieder auf; der alte Verlauf bleibt, soweit er noch aufbewahrt wird. |

## 5. Trainingskund:innen

Dasselbe Gerüst, dieselben Plätze. Die fünfzehn Punkte aus §4.10 verteilen
sich so:

| Platz | Inhalt aus §4.10 |
| --- | --- |
| **Übersicht** | was zu tun ist; Check-in fällig; Gewohnheiten des Tages; nächste Einheit |
| **Termine** | Kalender: Einheiten und Termine im Training; Wunsch wie in 4.1 |
| **Training** | Plan des Tages; Einheiten, dazu das Trainingsprotokoll, soweit es freigegeben ist (§4.10). Heute lesen es nur owner und Trainingsbetreuung (ANN-184); die Freigabe an die Kund:in entsteht mit POR-EPIC-002 |
| **Verlauf** | Check-ins, Fortschritt, Assessments (nur Werte, ADR-006 Punkt 13), Aktivitäten, Ernährung als Protokoll und Zielwert |
| **Nachrichten** | Rückfragen wie in 4.2, mit Notfallhinweis |
| **Ich** | Profil, Einstellungen mit sichtbarer Coach-Kontrolle (`IDEA-QSN-005`), eigene Rechnungen, Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO, Paketstand, Datenexport |

Die KI-Analyse aus dem Vorbild entfällt (`src/app/mdr.ts`). Der Reiter heißt
„Training", nicht „Übungen", weil dort Einheiten und Plan zusammenkommen.

## 6. Betreuung — die Praxisseite

Die Praxisoberfläche bekommt **keinen neuen Arbeitsbereich** für die
Plattform. Was von der Plattform kommt, landet dort, wo die Arbeit schon
liegt.

**Trainingskund:innen leben im Bereich „Training".** Das ist seit
TRN-EPIC-001 so gebaut (`src/app/navigation.tsx`) und bleibt so: Die
Trainingsbetreuung sieht dort ihre Kund:innen, owner und Büro ebenfalls, die
Behandlungsrollen nicht (§4.8). Aus sechs Arbeitsbereichen sind damit sieben
geworden; `PRODUCT_VISION.md` §6a ist entsprechend nachgezogen.

| Was ankommt | Wo es in der Praxis erscheint | Wer es sieht |
| --- | --- | --- |
| **Terminwunsch**, Änderungs- oder Absagewunsch | Kalender als „angefragt" am gewünschten Tag bzw. am Termin; in der Übersicht unter „Offene Punkte" | wer Termine verwaltet (§4.3; im Training ANN-176) |
| **Nachricht** | Behandlung: Kommunikation, Liste „Rückfragen" mit Zustand offen · beantwortet · erledigt und der Zusagefrist. Training: im Bereich Training (D1). In der Übersicht die Zahl der offenen | Behandlung: owner, Therapeut:innen, Büro (§10). Training: owner, Trainingsbetreuung |
| **Befundbogen** | Akte, Erstbefund; in der Vorschau des Besuchs („ausgefüllt am …") | Behandlungsrollen (§7) |
| **Check-in** | Akte bzw. Trainingsverhältnis, Abschnitt „Zwischen den Terminen": Angaben mit Datum, als Liste und Kurve, keine Farbe als Bewertung | Behandlung: Behandlungsrollen und Büro; Training: owner und Trainingsbetreuung |
| **Check-in ausgeblieben** | Übersicht der zuständigen Person, als organisatorischer Punkt („seit 10 Tagen kein Check-in") | wie oben |
| **Abo gekündigt, Einwilligung widerrufen** | Übersicht; Akte bzw. Trainingsverhältnis | owner, Büro; ein Widerruf auch die Rollen, die im Verhältnis behandeln oder betreuen |

In der **Akte** und am **Trainingsverhältnis** kommt je ein Abschnitt
**Plattform** hinzu, eingeklappt, solange nichts zu tun ist:

```
┌─ Plattform ─────────────────────────┐
│ Zugang: aktiv seit 02.10.           │
│ [Einladen] [Sperren] [Entziehen]    │ nur der passende Knopf
│ Einstieg: übersprungen (Jannes)     │ Coach-Kontrolle, protokolliert
│ Check-in: alle 7 Tage   [ändern]    │
│ Freigegeben: 2 Dokumente [ansehen]  │
│ Was die Person sieht  [Vorschau]    │ D7
└─────────────────────────────────────┘
```

Die Abschnitte an Akte und Trainingsverhältnis sind **zwei**, nicht einer:
Hat eine Person beide Verhältnisse, gibt es keine gemeinsame Plattformseite
in der Praxis (§4.8). Der Zugang (das Konto) ist einer; seine Wirkung ist je
Verhältnis getrennt.

## 7. Barrierefreiheit — verbindlich für jede Plattformansicht

Aus `IDEA-QSN-006` (bestätigt) und §2.2, als Prüfpunkte für die Sichtung:

1. Schrift mindestens 18 px, bei 200 % Vergrößerung kein waagrechtes
   Scrollen bei 375 px.
2. Berührflächen mindestens 48 × 48 px, Abstand dazwischen.
3. Kontrast mindestens 4,5 : 1; **Farbe nie allein** — jedes Farbsignal hat
   ein Wort oder Symbol daneben.
4. Kurze Sätze, keine Fachwörter ohne Erklärung; Anrede nach D6.
5. Jede Ansicht mit Tastatur und Bildschirmleser bedienbar;
   Beschriftungen am Feld, nicht im Feld.
6. Leerzustände sagen, was passiert („Ihre Therapeut:in stellt …"), nie eine
   leere Fläche.
7. Ein Hauptknopf je Ansicht; Abbrechen ist immer sichtbar.
8. Keine Zeitdruck-Elemente: kein Countdown, keine Serie, keine rote Zahl.

## 8. Festlegungen — bestätigt

**Jannes hat am 2026-09-30 alle sieben Festlegungen wie empfohlen bestätigt.**
Gilt jeweils die Empfehlung; die verworfene Option bleibt als Rückweg stehen.

Jede Festlegung ist nach §15.1 reversibel gedacht; verankert wird sie im Loop,
der sie baut, nicht hier.

**D1 — Wo Nachrichten aus dem Training in der Praxis ankommen.**
(a) Wie in der Behandlung unter **Kommunikation**; die Trainingsbetreuung
bekommt den Bereich, sieht darin aber nur Rückfragen aus dem Training, der
Server liefert nichts anderes. (b) Im Bereich **Training**, am
Trainingsverhältnis und als Liste dort.
**Empfehlung (b).** Kommunikation ist heute ein Bereich der Behandlungsseite
(`isTherapyStaff`), mit Teamchat und Patient:innenpost. Eine Trainingsbetreuung
dort hineinzulassen hieße, den Bereich für eine zweite Rolle zu schneiden; im
Training liegt ohnehin schon alles zur Kund:in. Rücknahme `klein`: eine
Liste zieht um. Das Büro sieht im Training nur Nachrichten vom Typ „Termin
oder Rechnung" (wie ANN-184: organisatorisch) — das entscheidet KOM-EPIC-001.

**D2 — Behandlung endet ohne Abo.**
(a) Wie nach einer Kündigung: 30 Tage lesend, der Plan als PDF, danach
bleibt „Ich" (Rechnungen, Dokumente, Einwilligungen, Export). (b) Der Plan
bleibt lesend sichtbar, solange das Konto besteht.
**Empfehlung (a).** Eine Regel statt zwei, und die Grenze zwischen
kostenloser Stufe 1 und Abo bleibt klar. „Ich" bleibt, weil Widerruf und
Auskunft nicht an einem Abo hängen dürfen.

**D3 — Was als Dokument und Rechnung sichtbar wird.**
Eigene **Rechnungen** erscheinen ohne eigenen Schritt, sobald sie gestellt
sind, auch wenn die Rechnung an eine andere Person adressiert ist (ADR-009:
Rechnungsempfänger ist nicht gleich Patient:in — ob diese Person ebenfalls
sieht, entscheidet ADR-023). **Dokumente** erscheinen nur **einzeln
freigegeben** durch eine Behandlungsrolle, protokolliert; nichts ist
voreingestellt sichtbar. **Empfehlung wie beschrieben.**

**D4 — Absage über die Plattform.**
(a) **Absagewunsch**: Die Person sagt ab, das Büro trägt die Absage ein; als
Eingang der Absage (ADR-018 Punkt 8) gilt der Zeitpunkt des Wunsches. (b)
Die Absage wirkt sofort, ohne Büro.
**Empfehlung (a).** §8 kennt nur Wünsche; eine sofort wirkende Absage wäre
die erste Terminhandlung ohne Praxis. Der Eingang zählt trotzdem ab dem
Absenden, sonst trüge die Person das Risiko einer langsamen Bearbeitung.

**D5 — Was ein Check-in verspricht.**
Nach dem Absenden steht der feste Satz, dass die Angaben beim nächsten
Termin gelesen werden; kein Alarm, keine Benachrichtigung an die Praxis je
Check-in. „Check-in ausgeblieben" ist ein organisatorischer Punkt in der
Übersicht der Praxis. **Empfehlung wie beschrieben**: Ein Alarm auf einen
Wert wäre Verbot 2 (ADR-006 Punkt 11), und ein Versprechen, das niemand
einlöst, ist schlimmer als keines (`IDEA-KOM-002`).

**D6 — Anrede und Bereichsschalter.**
Anrede **„Sie"** in allen Ansichten, auch im Training; eine Umstellung auf
„du" je Person ist später eine Einstellung. Hat eine Person beide
Verhältnisse, steht im Kopf ein Schalter **Behandlung | Training**; jede
Seite hat ihre eigene Übersicht, und nichts wird gemischt (§4.10).
**Empfehlung wie beschrieben.** Beide Verhältnisse zugleich sind selten
(das Paket beginnt nach dem Ende der Behandlung), der Schalter kostet also
wenig Bedienung.

**D7 — Vorschau „Was die Person sieht".**
In der Praxis zeigt ein Knopf im Abschnitt Plattform die Ansicht der Person,
nur lesend, protokolliert wie ein Lesezugriff auf die Akte. Anlass: beim
Hausbesuch gemeinsam durchgehen (`IDEA-LZK-005`). (a) mit POR-EPIC-002, (b)
später.
**Empfehlung (b), später** — frühestens, wenn die Ansicht der Person steht;
bis dahin zeigt die Person ihr eigenes Handy. Aufgeführt, damit POR-EPIC-002
die Ansicht nicht so baut, dass die Vorschau später nicht geht.

## 9. Was daraus in welchem Loop entsteht

| Loop | Aus diesem Dokument |
| --- | --- |
| **POR-EPIC-001** | Gerüst (Abschnitt 3) mit Kopf, „Ich" und leerer Übersicht; Einladung, Anmeldung, Sperren, Entziehen; Abschnitt „Plattform" in Akte und Trainingsverhältnis (nur Zugang); Bereichsschalter (D6) |
| **POR-EPIC-002** | Übersicht mit Befundbogen, nächstem Termin und offener Rechnung; Reiter Termine mit Wunsch und Absagewunsch (D4); Rechnungen und Dokumente (D3); Terminwünsche im Kalender |
| **POR-EPIC-003** | Einstieg mit Überspringen; Einwilligungen; Datenexport; Einstellungen; Prüfpunkte aus Abschnitt 7 als Sichtung |
| **UEB-EPIC-001 bis -003** | Reiter Übungen bzw. Training |
| **KOM-EPIC-001** | Reiter Nachrichten mit Notfallhinweis; Rückfragen in Kommunikation bzw. Training (D1) |
| **TRK-EPIC-001** | Check-in in der Übersicht, „Meine Angaben", Abschnitt „Zwischen den Terminen" (D5) |
| **ANG-EPIC-001** | Stufe 2, Reiter Verlauf, Abo-Stand, Kündigung, 30 Tage lesend (D2) |
| **OUT-, ALT-EPIC** | Inhalt von Verlauf und Gewohnheiten |

## 10. Bewusst nicht Teil dieses Dokuments

- **Konten, Anmeldung, Identitätsprüfung, Vertretung, Sitzungsregeln,
  RLS-Muster** — ADR-023. Dieses Dokument setzt nur voraus, dass eine
  Vertreter:in die Sicht der vertretenen Person mit einem Hinweis „Sie handeln
  für …" sieht; was genau, entscheidet ADR-023.
- **Benachrichtigungen und Offline-Erfassung** — ADR-024.
- **Gestaltung im Einzelnen**: Farben, Symbole, Abstände folgen dem
  bestehenden Designsystem und `marke/`; die Skizzen oben zeigen Aufbau, nicht
  Aussehen.
- **Wortlaut** der festen Hinweise (Ausfallhonorar, Notfall, Check-in): Die
  Sätze oben sind Vorschläge; verbindlich wird der Wortlaut im jeweiligen
  Loop und in der Begriffsliste (`src/lib/begriffe.ts`).
- **Preise** von Abo und Paket (Blocker vor Block 5).
