# Leitfaden: schlank und klar

Stand 06.10.2026. Regeln, die Jannes an Beispielen beschrieben hat und die **Stück für Stück im
ganzen Code** angewendet werden (Auftrag Jannes, 06.10.2026). Je Beispiel steht hier die Regel, die
daraus folgt, und wo sie schon umgesetzt ist. Neue Beispiele kommen als neue Regel dazu.

Der Leitfaden ist eine Entwurfsreferenz wie die Handoffs unter `docs/design/`. Er überschreibt weder
`PROJECT_PRINCIPLES.md` noch einen ADR; wo eine Regel an einen MUSS-Punkt stößt, gilt der MUSS-Punkt,
und die Kollision wird Jannes vorgelegt.

## L1 · Löschen statt mitschleppen

**Beispiel (Jannes):** Das Telefax der Patient:innen ist irrelevant und kann gelöscht werden. „Die
Anwendung wird noch nicht genutzt und es gehen keine Daten verloren. Es sollen auch andere Sachen noch
gelöscht werden, um die Anwendung schlanker zu machen.“

**Regel:**

- Was keinen klaren Nutzen im Praxisalltag hat, wird **gelöscht**, nicht ausgeblendet: Feld,
  Datenbankspalte, Funktion, Text und Test. Solange die Anwendung nicht in Nutzung ist (keine echten
  Daten, PROJECT_PRINCIPLES.md §3.1), kostet das Löschen einer Spalte keine Daten.
- Gelöscht wird über eine **neue Migration**; ältere Migrationen bleiben unverändert. Eine Migration
  ist eine kritische Änderung (ADR-013 Punkt 9): `pnpm test:db` und Zweitreview gehören dazu.
- **Nicht** auf diesem Weg gelöscht werden Dinge, die ein MUSS tragen: Auditaktionen (ADR-010, nur mit
  ADR-Änderung und Label `freigabe-audit`), Aufbewahrung und Löschpfade (ADR-008), Einwilligungen,
  Sicherheitsmaßnahmen (§15.1). Solche Kandidaten werden mit Optionen vorgelegt.
- Was für eine **andere** Personengruppe Nutzen hat, bleibt dort: Das Telefax der Verordner:innen
  bleibt, weil Arztpraxen es als Kontaktweg führen.

**Umgesetzt:** SLK-001 (Telefax der Patient:innen).

## L2 · Ein Kasten je Aufgabe, nicht je Thema

**Beispiel (Jannes):** Die Stammdaten haben je einen Kasten für Person, Kontakt, Hausbesuch,
Abrechnung, Praxis, Verwaltung und Plattform. Person, Kontakt, Adresse und die Abrechnungsart passen
in einen Block; „Rechnung an“ und „Anschrift“ sind überflüssig.

**Regel:**

- Zusammen steht, was man zusammen liest oder zusammen bearbeitet. Gruppen innerhalb eines Blocks
  trennt eine Zwischenüberschrift oder eine Linie, kein weiterer Rahmen. **Kein Kasten im Kasten.**
- Eine Zeile, die nur das Selbstverständliche wiederholt, entfällt. Eine Angabe, die meistens gleich
  ist, steht **nur bei Abweichung**: „Rechnung an“ erscheint nur, wenn die Rechnung nicht an die
  Patient:in selbst geht (etwa an die Eltern eines Kindes).
- Ein Bearbeiten-Weg je Block, nicht je Zeilengruppe.

**Umgesetzt:** SLK-003 (Stammdaten: Person, Kontakt, Adresse und Versicherung in einem Block).

## L3 · Jede Arbeit hat ihren Knopf an Ort und Stelle

**Beispiel (Jannes):** In der Übersicht gibt es „Doku“ nur am ersten Termin ohne Dokumentation;
nach dem Abschließen aller Termine lässt sich kein einzelner Termin mehr direkt dokumentieren. „Ich
möchte einen Doku-Button bei jedem Patienten und bei jedem abgeschlossenen Patienten auch.“

**Regel:**

- Eine Liste von Dingen, an denen man arbeitet, trägt die Aktion **an jeder Zeile**, nicht nur am
  ersten offenen Eintrag. Erledigt heißt nicht unerreichbar.
- Was die Aktion öffnet, folgt dem Zustand: ohne Dokumentation die Schreibseite; mit Entwurf den
  Entwurf; nach dem Festschreiben den Eintrag mit dem Weg zum Nachtrag (ADR-016).

**Umgesetzt:** SLK-002 (Übersicht, Zeitstrahl).

## L4 · Ein Balken zeigt leer und voll

**Beispiel (Jannes):** Am Fahrzeit-Balken der Übersicht sieht man die grüne Füllung, aber nicht den
leeren Balken. Gemessen: Die Spur in Salbei hell steht auf der Seitenfläche mit 1,01:1.

**Regel:** Jede Fortschritts- oder Zeitspur zeigt ihre ganze Länge mit mindestens 3:1 gegen den
Untergrund (WCAG 1.4.11); die Füllung hebt sich davon ab.

**Umgesetzt:** offen, kommt mit L5 (der Untergrund ändert sich).

## L5 · Neutraler, heller Grund

**Beispiel (Jannes):** Der Hintergrund ist zu grau-grünlich, „das Ganze sieht etwas öko aus“, der
moderne Touch fehlt.

**Regel:** Die Seitenfläche und die Grautöne werden neutral; Farbe tragen nur Marke (Hauptfarbe,
Tiefgrün der Seitenleiste) und Bedeutung (Warnung, Fehler, erledigt).

**Umgesetzt:** offen. Varianten auf der Leinwand „Design-Audit Praxisplattform“, Reihe 7; Jannes
wählt. Danach ändern sich die Tokens in `src/index.css` und die Kontrastpaare in
`src/lib/kontrast.test.ts`.

## Vorgehen

1. Je Beispiel eine Regel hier.
2. Erst den gemeinsamen Baustein ändern (`src/components/ui`), dann Bereich für Bereich die Seiten.
3. Je Bereich eine Story `SLK-NNN`, ein Commit; mit Migration Pfad A, sonst Pfad S.
4. Was beim Durchgehen als Löschkandidat auffällt, aber nicht eindeutig ist, sammelt die Liste unten
   für Jannes.

## Löschkandidaten zur Entscheidung

Einträge mit Ort, Begründung und dem, was am Löschen hängt. Nichts davon ist entschieden; gelöscht
wird erst auf Jannes' Wort.

| Kandidat                                                       | Ort                             | Warum                                                                   | Was daran hängt                                                       |
| -------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| „Telefon (geschäftlich)“ als drittes Telefonfeld               | Stammdaten, Formular der Person | neben Mobil und privat selten gebraucht                                 | Spalte `phone_work`, Formular, Auskunft, Zusammenführen, Seeds, Tests |
| „Andere Ziel-App prüfen (für die Gerätebewertung)“             | Tour, unter der Liste           | Prüfwerkzeug aus dem Kartendienst-Aufbau, im Praxisalltag ohne Nutzen   | Sichtung Kartendienst (Gerätebewertung), Komponente und Test          |
| Erklärsatz über dem Abschnitt „Plattform“                      | Stammdaten                      | wiederholt, was der Abschnitt zeigt (L2: Selbstverständliches entfällt) | nur Text und ein Test                                                 |
| Aufklapper „Organisatorisches und Kommunikation“ am Seitenende | Übersicht                       | Wege, die Seitenleiste und Tableiste schon haben                        | Komponente, Tests der Übersicht                                       |
