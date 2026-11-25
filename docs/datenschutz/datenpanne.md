# Vorgehen bei einer Datenpanne

Entwurf von Claude, Stand 25. November 2026; geht mit B2 an die Datenschutzberatung. Nach Art. 33
und 34 DSGVO, Vorbedingung aus ADR-007 Punkt 5. Gilt ab dem ersten echten Datensatz.

## Was eine Datenpanne ist

Jede Verletzung der Sicherheit, durch die personenbezogene Daten verloren gehen, verändert werden
oder Unbefugten offenstehen, ob aus Versehen oder mit Absicht (Art. 4 Nr. 12 DSGVO). Beispiele:

- Ein Diensttelefon ist verloren oder gestohlen.
- Eine Rechnung, ein Bericht oder eine Nachricht geht an die falsche Person.
- Jemand meldet sich mit einem fremden Konto an oder öffnet eine Akte ohne Anlass.
- Ein Fehler der Software: Eine Rolle sieht, was sie nicht sehen darf, oder Patientendaten stehen
  in Betriebslogs (ADR-011 Punkt 2, ANN-874).
- Daten sind weg: Eine Datei fehlt, eine Sicherung lässt sich nicht zurückspielen.
- Ein Auftragsverarbeiter meldet einen Vorfall bei sich.

## Ablauf

1. **Sofort sagen.** Wer etwas bemerkt, meldet es am selben Tag der Praxisleitung (`owner`):
   [Telefon]. Lieber einmal zu viel; eine Meldung hat für niemanden Nachteile.
2. **Zeit festhalten.** Die Praxisleitung notiert Datum und Uhrzeit, zu der sie von der Verletzung
   erfährt. Ab da laufen 72 Stunden (Art. 33 Abs. 1 DSGVO), auch am Wochenende.
3. **Eindämmen.** Verlorenes Gerät: alle Sitzungen beenden und den Zugang sperren (ADR-025
   Punkt 12). Falscher Empfänger: um Löschung bitten und sie bestätigen lassen. Fehler der
   Software: die Funktion abschalten, bis sie repariert ist.
4. **Feststellen,** welche Daten betroffen sind, wie viele Personen, seit wann und wer Zugriff
   hatte. Quellen: das Protokoll unter „Organisation → Protokoll“ (geöffnete Akten je Person und
   Tag, Downloads, Exporte, abgewiesene Zugriffe; ADR-010 Punkt 16) und die Auskunft des
   Auftragsverarbeiters.
5. **Bewerten** mit der datenschutzbeauftragten Person: kein Risiko, Risiko oder hohes Risiko für
   die Betroffenen. Es zählen Art der Daten, Zahl der Personen, mögliche Folgen und ob Unbefugte
   die Daten überhaupt lesen konnten. Bei Gesundheitsdaten gilt im Zweifel: Risiko.
6. **Der Aufsichtsbehörde melden,** binnen 72 Stunden, außer es besteht voraussichtlich kein
   Risiko (Art. 33 Abs. 1). Die Meldung nennt, was geschehen ist, Kategorien und ungefähre Zahl der
   Personen und Datensätze, den Kontakt der datenschutzbeauftragten Person, die wahrscheinlichen
   Folgen und die Maßnahmen (Abs. 3). Was fehlt, wird nachgereicht (Abs. 4); wer später meldet,
   begründet die Verspätung. Zuständig: [Aufsichtsbehörde des Landes, in dem die Praxis sitzt].
7. **Die Betroffenen benachrichtigen,** unverzüglich, wenn voraussichtlich ein hohes Risiko besteht
   (Art. 34 Abs. 1): in einfacher Sprache, was geschehen ist, an wen sie sich wenden können, welche
   Folgen möglich sind und was die Praxis tut. Das entfällt, wenn die Daten für Unbefugte unlesbar
   waren oder Maßnahmen das hohe Risiko beseitigt haben (Abs. 3).
8. **Aufschreiben, jede Verletzung,** auch die ohne Meldung (Art. 33 Abs. 5): Tatsachen,
   Auswirkungen, Maßnahmen, Bewertung mit Begründung, Zeitpunkte. Ablage: [Ordner der Praxis].
9. **Nacharbeiten.** Ursache beheben; bei einem Fehler der Software ein Befund mit Test;
   [`tom.md`](tom.md) und die DSFA anpassen, wenn die Verletzung eine Lücke zeigt.

## Wer was tut

- **Alle Mitarbeitenden:** melden, nichts selbst löschen oder reparieren.
- **Praxisleitung (`owner`):** entscheidet, meldet, benachrichtigt, schreibt auf.
- **Datenschutzbeauftragte Person:** berät bei Bewertung und Meldung und ist Anlaufstelle der
  Behörde [noch zu benennen, ANN-873].
- **Auftragsverarbeiter:** melden der Praxis jede Verletzung unverzüglich (Art. 33 Abs. 2); das
  gehört in jeden Vertrag zur Auftragsverarbeitung (OPS-001).
- **Vertretung der Praxisleitung:** [offen].

## Grenzen des heutigen Stands

- **Keine Alarmierung.** Die Software meldet keinen Vorfall von sich aus; das Protokoll wird nur
  bei Anlass gelesen (ADR-010 Punkt 19). Erkennung und Alarmierung kommen mit OPS-004 (G6), nach
  dem Cloudprojekt. Bis dahin beginnt jeder Vorgang mit dem Hinweis eines Menschen.
- **Eine Person.** Die Frist läuft auch, wenn die Praxisleitung krank oder im Urlaub ist. Wer dann
  meldet, legt BETRIEB-001 fest (G16).
- **Keine Vorgangsakte.** Die Aufzeichnung nach Schritt 8 führt die Praxis außerhalb der Software.
- **Logs des Anbieters.** Wer Betriebs- und Sicherheitslogs lesen darf, ist offen (ADR-011, G6).
