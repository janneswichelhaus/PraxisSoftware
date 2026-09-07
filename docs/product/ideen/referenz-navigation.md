# Referenz: Navigation einer Coaching-Software

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Jannes hat am 2026-09-01 einen Screenshot einer Coaching-Software geteilt
(Klientenansicht). Die Software ist ein Online-Coaching-Werkzeug für
Personal Training, keine Physiotherapie-Software. Sie ist **Anregung, kein
Vorbild für Datenmodell, Berechtigungen oder Rechtsrahmen** — insbesondere
gilt für sie kein deutscher Heilberufsrahmen.

Festgehalten wird sie, weil Jannes ausdrücklich gebeten hat, sich die
Navigationspunkte zu merken, und weil sie eine durchdachte
Informationsarchitektur für genau den Bereich zeigt, der bei uns langfristig
dazukommen soll: die klientenzentrierte Betreuung zwischen den Terminen.

**Nachtrag 2026-09-06.** Jannes hat denselben Screenshot erneut geteilt und
eingeordnet: Die Praxissoftware ist nur ein Teilbereich; geplant ist eine
Plattform für seine Patient:innen **und** die Kund:innen seines Personal
Trainings (`IDEA-LZK-008`, Roadmap Stufe 3). Damit ist die Navigationsleiste
mehr als eine Anregung — sie ist die Themenliste für den klientenseitigen
Teil. Der Abschnitt „Was für uns anders sein muss" gilt unverändert. Der
Screenshot zeigt Name und E-Mail-Adresse einer Person; er liegt nicht im
Repository, und die Person wird hier nicht genannt.

**Herkunft (E-18, 2026-09-06):** ein fremdes Produkt. Jannes hat nur diesen
Screenshot und will den **Funktionsumfang nachbauen**. Das heißt: Vorlage
für Umfang, Ablauf und Informationsarchitektur — nicht für Datenmodell,
Berechtigungen oder Rechtsrahmen, und keine Übernahme von Texten, Grafiken,
Symbolen, Namen oder Code des fremden Produkts (Urheber- und Markenrecht).
Was übernommen wird, entsteht in unserer Sprache und in unserer Reihenfolge
(`docs/development/ROADMAP.md`, Stufe 3). Keine Nachrecherche.

---

## Die Navigationsleiste, vollständig und in Reihenfolge

Die Leiste ist **klientenbezogen**: sie erscheint innerhalb der Akte einer
Person, nicht als globale Hauptnavigation.

| # | Punkt              | Was dahinter zu vermuten ist                                    | Unsere Bereichsdatei                                     |
| - | ------------------ | ---------------------------------------------------------------- | -------------------------------------------------------- |
| 1 | **Übersicht**      | Einstiegsseite je Klient, Status auf einen Blick                 | [06 ORG](06-uebersicht-kalender-sessions.md)              |
| 2 | **Kalender**       | Termine und geplante Trainingstage der Person                    | [06 ORG](06-uebersicht-kalender-sessions.md)              |
| 3 | **Sessions**       | absolvierte Einheiten, Verlauf, Zähler im Kopfbereich (43)       | [06 ORG](06-uebersicht-kalender-sessions.md)              |
| 4 | **Check-ins**      | wiederkehrende Selbstauskunft in festem Takt                     | [02 TRK](02-tracking-und-parameter.md)                    |
| 5 | **Fortschritt**    | Verlaufsgrafiken; hier mit Zähler-Badge „12"                     | [04 OUT](04-assessments-outcomes-fortschritt.md)          |
| 6 | **Trainingspläne** | zugewiesene Pläne, vermutlich mit Wochenstruktur                 | [01 TRN](01-trainingsplaene-und-progression.md)           |
| 7 | **Übungsanalyse**  | Auswertung je Übung über die Zeit                                | [04 OUT](04-assessments-outcomes-fortschritt.md)          |
| 8 | **Aktivitäten**    | Alltagsbewegung und Sport außerhalb des Plans                    | [05 ALT](05-alltag-gewohnheiten-ernaehrung.md)            |
| 9 | **Assessments**    | strukturierte Tests und Messungen zu definierten Zeitpunkten     | [04 OUT](04-assessments-outcomes-fortschritt.md)          |
| 10 | **Athletenprofil** | Stammdaten, Ziele, Voraussetzungen der Person                    | [00 LZK](00-lebenszyklus-und-zugang.md)                   |
| 11 | **Gewohnheiten**   | Habit-Tracking mit Serien                                        | [05 ALT](05-alltag-gewohnheiten-ernaehrung.md)            |
| 12 | **Ernährung**      | Tagesprotokoll, Makroziele, Wasser                               | [05 ALT](05-alltag-gewohnheiten-ernaehrung.md)            |
| 13 | **Chat**           | Nachrichten zwischen Coach und Klient                            | [03 KOM](03-rueckfragen-medien-kommunikation.md)          |
| 14 | **Einstellungen**  | Konfiguration je Klient                                          | [08 QSN](08-querschnitt-plattform.md)                     |
| 15 | **KI-Analyse**     | abgesetzt als hervorgehobener Knopf unten, nicht als Listeneintrag | [07 KI](07-ki-assistenz.md)                             |

„Ernährung" war im Screenshot der aktive Punkt.

## Weiteres aus demselben Screenshot

**Kopfbereich:** Zurück-Pfeil · Profilbild · Name · E-Mail-Adresse ·
Kennzahl „⚡ 43 Sessions" · Chat-Symbol rechts oben.

**Inhaltsbereich (Ansicht „Ernährung"):**

- Abschnitt `TAGESPROTOKOLL` mit Datumsnavigation (`‹ Heute ›`) und einem
  Sprungknopf zurück auf „Heute".
- Vier Kennzahlkacheln im Muster *Ist / Ziel*: `0 / 2082 kcal`,
  `0g Protein / 126g`, `0g Kohlenhydrate / 237g`, `0g Fett / 70g`.
- Fortschrittsbalken `0.0L / 2.5L Wasser`.
- Mahlzeitenblöcke Frühstück / Mittagessen / Abendessen, je mit
  Kalorienspalte rechts und Leerzustand „Keine Einträge".
- Abschnitt `ZIELE & EINSTELLUNGEN` mit Unterabschnitt `COACH-KONTROLLE` und
  einem Schalter „Client-Onboarding überspringen".

**Fußzeile:** Impressum · Datenschutz · AGB · Changelog.

## Was daran gut ist — und für uns übertragbar

1. **Klientenbezogene Unternavigation.** Alles zu einer Person liegt unter
   einer Ebene. Unsere heutige Patientenakte ist eine Detailseite; sobald
   Trainingsbetreuung dazukommt, reicht das nicht mehr. Das ist die
   Strukturentscheidung, die dieser Screenshot am deutlichsten zeigt.
2. **Ist gegen Ziel, überall.** Jede Kachel zeigt beides. Ein nackter Wert
   ohne Bezugsgröße sagt weder Coach noch Klient etwas.
3. **Datumsnavigation mit Rücksprung auf heute.** Klein, aber in jeder
   tagesbezogenen Ansicht nötig.
4. **Explizite Leerzustände.** „Keine Einträge" statt einer leeren Fläche.
5. **`COACH-KONTROLLE` als eigener Abschnitt.** Überschreibbarkeit
   automatischer Abläufe durch die betreuende Person ist ein eigenes,
   sichtbares Konzept — nicht ein versteckter Schalter. Bei uns ist das
   regulatorisch sogar erforderlich, nicht bloß nett
   ([ADR-006](../../adr/ADR-006-medical-device-boundary.md)).
6. **KI abgesetzt vom Rest.** Die KI-Funktion ist optisch kein normaler
   Menüpunkt. Das passt zu [ADR-005](../../adr/ADR-005-provider-independent-ai.md):
   KI ist ein eigener Pfad, kein beiläufiger Teil der Fachlogik.

## Was für uns anders sein muss

Das ist der wichtigere Teil. Die Vorlage ist eine Trainingssoftware für
gesunde Kundschaft; wir betreuen zuerst Patient:innen in Heilbehandlung.

- **„Athlet" ist bei uns falsch.** Wir haben Patient:innen und — nach
  Therapieende — Klient:innen. Die Software muss beide Rollen
  auseinanderhalten, weil daran Rechtsgrundlage, Steuer, Aufbewahrung und
  Dokumentationspflicht hängen. Siehe
  [00 LZK](00-lebenszyklus-und-zugang.md).
- **Schmerz und Bewegungssicherheit fehlen in dieser Navigation komplett.**
  Genau das sind unsere zentralen Verlaufsgrößen, nicht Makronährstoffe.
- **Kein „Übungsanalyse"-Automatismus ohne MDR-Prüfung.** Eine Auswertung, die
  aus Trainingsdaten eine klinische Aussage macht, ist bei uns
  `MDR_REVIEW_REQUIRED`.
- **Ernährung ist bei uns berufsrechtlich heikel.** Siehe
  [IDEA-ALT-006](05-alltag-gewohnheiten-ernaehrung.md).
- **Die Nutzergruppe ist breiter.** Hausbesuche, hochbetagte Patient:innen,
  kleine Bildschirme, schlechte Verbindung. Eine Oberfläche, die einen
  25-jährigen Trainierenden voraussetzt, trägt bei uns nicht
  ([IDEA-QSN-006](08-querschnitt-plattform.md)).

## Merksatz

Die Navigationsleiste ist eine **Themenliste**, keine Roadmap. Sie sagt, welche
Inhaltsbereiche langfristig gefüllt werden sollen. In welcher Reihenfolge, in
welchem Umfang und ob überhaupt, entscheidet Jannes je Feature — nicht dieser
Screenshot.
