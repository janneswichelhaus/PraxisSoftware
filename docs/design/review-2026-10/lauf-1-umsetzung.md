# Design-Review Lauf 1 – Reihenfolge der Umsetzung

Stand 21.10.2026. Vorschlag zum [Bericht](lauf-1-bericht.md); verbindlich wird jeder Schritt erst
mit Jannes' Freigabe und – ab Schritt 1 – mit dem Handoff aus Claude Design. Je Schritt ein Pull
Request, nach K1 alles **Pfad S** (nur Oberfläche), soweit nicht anders vermerkt. Prüfung je
Schritt: Bildstrecke vorher und nachher (`pnpm bildstrecke --nur=plattform,anmeldung`, 375 und 1280
px), `plattform-barrierefreiheit.spec.ts`, Ratsche in `src/designsystem.test.ts`.

## Schritt 0 – Politur ohne Entwurf (Art a, sofort, unabhängig)

Nur, was ein Entwurf nicht ohnehin neu fasst. Drei kleine Pull Requests, in beliebiger Reihenfolge:

| PR  | Inhalt                                                                                                                                                                                                                                                                                                                                                      | Befunde                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 0a  | **Falsche Bestätigung:** Reiter tragen nur `bereich`/`zugang` weiter, Bestätigungs-Parameter werden verbraucht; Test „Wechsel nach dem Senden zeigt keine fremde Rückmeldung“.                                                                                                                                                                              | DR-160 (S1), Teil von DR-157                                                      |
| 0b  | **Barrierefreiheit Gerüst und Türen:** Türseiten in der Plattform-Schrift (18 px, Schriftgröße des Geräts); Silbentrennung nur für lange Wörter, nie in Namen und Adressen; Tab-Titel je Plattformseite; Reiterleiste bei Tastatur ausblenden; Verbindungszeile im Plattformkopf; Startbild-Landeplatz im Plattformkopf; `h1` und Überschriftenfolge (axe). | DR-102, DR-114, DR-115, DR-116, DR-118, DR-120, DR-158                            |
| 0c  | **Texte:** „Kennwort“ und „Mein Konto“ auf Plattformwegen, „Sitzung …“, „Anamnesebogen Version 8 (DIGOTOR)“ → „Fragebogen vor dem ersten Termin“, Zustandswörter der Nachrichten, ein Wort für „senden“, Rückweg „← Ich“ und nach Herkunft, „JSON“, Lizenzzeile einmal, „Abmelden“ leise.                                                                   | DR-104 bis DR-106, DR-125, DR-138, DR-140, DR-144, DR-146, DR-149, DR-150, DR-153 |

Bewusst **nicht** in Schritt 0: Typografie und Versalien (DR-154, DR-131), Reiterleiste bei 200 %
(DR-112), Druckzustand (DR-117, betrifft auch die Praxis-App – mit Lauf 2 abstimmen), Abstände
(DR-156) – das fasst Handoff 1 neu.

## Schritt 1 – Handoff 1: Erster Eindruck und Plattform-Sprache

Voraussetzung: Briefing 1 in Claude Design entworfen und von Jannes freigegeben. Fünf Pull Requests,
in dieser Reihenfolge:

1. **1a Sprache:** `docs/design/PLATTFORM.md` (Entwurf im Bericht) und Verweis in DESIGN.md (Art c,
   DESIGN.md steht an seiner Größengrenze); Tokens der Plattform (Schriftskala, Schattenstufe,
   Abstände 40/48, Seitenrand); Bausteine Hero-Karte, Aufgabenkarte, Skelett, Leerzustand mit Bild,
   Druckzustand, Notfallkarte; Ratsche um die Plattform ergänzen (DR-154 bis DR-157).
2. **1b Gerüst:** Kopf mit Initialen, Reiterleiste für 200 % und „Sehr groß“, Rechneransicht ab
   1024 px (DR-112, DR-113, DR-117, DR-119).
3. **1c Türen:** Einladung, Anmeldung einrichten (Passkey, PIN), Anmeldung, Sperre, Zugang beendet
   in der Plattform-Fassung (DR-101, DR-103, DR-107).
4. **1d Einstieg** als geführter Ablauf (DR-108 bis DR-111).
5. **1e Übersicht** mit Hero, Heute, nächstem Besuch und Liste – Behandlung, Training, Begleitung
   (DR-121 bis DR-124, DR-126).

Abhängigkeit: 1b bis 1e brauchen 1a. 1c und 1d können parallel laufen (verschiedene Dateien).

## Schritte 2 bis 7 – Handoffs je Bereich

Jeder Schritt braucht 1a (Sprache, Bausteine) und seinen freigegebenen Entwurf; untereinander sind
sie unabhängig und können in zwei Strängen laufen. Reihenfolge nach Hebel:

| Schritt | Briefing                      | Befunde                   | Abhängig von          | Hinweis                                                                     |
| ------- | ----------------------------- | ------------------------- | --------------------- | --------------------------------------------------------------------------- |
| 2       | 2 Übungen                     | DR-127 bis DR-131         | 1a                    | Variante „mit Video“ nur entwerfen, bauen erst mit eigenen Medien (ANN-539) |
| 3       | 3 Termine                     | DR-132 bis DR-136         | 1a, Karte aus 1e      | „Praxis anrufen“ erst mit Rufnummer (N2)                                    |
| 4       | 4 Selbstauskunft und Tagebuch | DR-141 bis DR-146, DR-161 | 1a                    | Fragebogen-Inhalt bleibt; nur Form und Schrittfolge                         |
| 5       | 5 Nachrichten                 | DR-137 bis DR-139         | 1a (Notfallkarte), 0a | Wortlaut Notfallhinweis bleibt                                              |
| 6       | 6 Unterlagen und Verträge     | DR-147 bis DR-149, DR-162 | 1a                    | Vertragsabschluss als geführter Ablauf; Widerrufsbelehrung unverändert      |
| 7       | 7 Ich und Datenschutz         | DR-151, DR-152            | 1a, Kopf aus 1b       | Einwilligungen ohne Drängen                                                 |

## Außerhalb dieser Reihe (Daten, Pfad A)

Name der Person, Rufnummer der Praxis und Bild der behandelnden Person auf der Plattform (Nebenbei
N1 bis N3) ändern Projektionen und Rechte – nach K1 **Pfad A** mit `pnpm test:db`. Die Entwürfe
zeigen dafür Varianten „wenn vorhanden“ mit Rückfall; gebaut wird zuerst ohne. Ob und wann, entscheidet
Jannes.

## Abgleich mit Lauf 2

Druckzustand, Silbentrennung und Tab-Titel betreffen auch die Praxis-App; Lauf 2 prüft dort dieselben
Bausteine und die Begriffe aus dem Plattform-Abschnitt. Schritt 0b und 1a vor dem Bau mit den
Ergebnissen von Lauf 2 abgleichen, damit kein Baustein zweimal geändert wird.
