# Leitfaden: schlank und klar

Regeln aus Jannes' Beispielen, **Stück für Stück im ganzen Code** angewendet (Auftrag Jannes,
06.10.2026); neue Beispiele werden neue Regeln, die Nummern bleiben (Code und DESIGN.md zitieren
sie). Eine Entwurfsreferenz, die weder `PROJECT_PRINCIPLES.md` noch einen ADR überschreibt: Stößt
eine Regel an einen MUSS-Punkt, gilt der MUSS-Punkt, die Kollision geht an Jannes. Wortlaut der
Beispiele: `git show 9452575:docs/design/leitfaden-schlank.md`.

## L1 · Löschen statt mitschleppen

Beispiel: das Telefax der Patient:innen („… um die Anwendung schlanker zu machen“). Umgesetzt:
SLK-001, SLK-009 (ANN-260).

- Was keinen klaren Nutzen im Praxisalltag hat, wird **gelöscht**, nicht ausgeblendet: Feld,
  Datenbankspalte, Funktion, Text und Test. Solange die Anwendung nicht in Nutzung ist (keine echten
  Daten, §3.1), kostet das Löschen einer Spalte keine Daten.
- Gelöscht wird über eine **neue Migration**; ältere Migrationen bleiben unverändert. Eine Migration
  ist eine kritische Änderung (ADR-013 Punkt 9): `pnpm test:db` und Zweitreview gehören dazu.
- **Nicht** auf diesem Weg gelöscht werden Dinge, die ein MUSS tragen: Auditaktionen (ADR-010, nur
  mit ADR-Änderung und Label `freigabe-audit`), Aufbewahrung und Löschpfade (ADR-008), Einwilligungen,
  Sicherheitsmaßnahmen (§15.1). Solche Kandidaten werden mit Optionen vorgelegt.
- Was für eine **andere** Personengruppe Nutzen hat, bleibt dort: das Telefax der Verordner:innen.

## L2 · Ein Kasten je Aufgabe, nicht je Thema

Beispiel: die Stammdaten mit je einem Kasten für Person, Kontakt, Hausbesuch, Abrechnung, Praxis,
Verwaltung und Plattform. Umgesetzt: SLK-003, SLK-005 bis SLK-008, DOK-002.

- Zusammen steht, was man zusammen liest oder zusammen bearbeitet. Gruppen innerhalb eines Blocks
  trennt eine Zwischenüberschrift oder eine Linie, kein weiterer Rahmen. **Kein Kasten im Kasten.**
- Eine Zeile, die nur das Selbstverständliche wiederholt, entfällt. Eine Angabe, die meistens gleich
  ist, steht **nur bei Abweichung**: „Rechnung an“ nur, wenn die Rechnung nicht an die Patient:in
  selbst geht.
- Ein Bearbeiten-Weg je Block, nicht je Zeilengruppe.

## L3 · Jede Arbeit hat ihren Knopf an Ort und Stelle

Beispiel: „Doku“ stand in der Übersicht nur am ersten Termin ohne Dokumentation. Umgesetzt: SLK-002.

- Eine Liste von Dingen, an denen man arbeitet, trägt die Aktion **an jeder Zeile**, nicht nur am
  ersten offenen Eintrag. Erledigt heißt nicht unerreichbar.
- Was die Aktion öffnet, folgt dem Zustand: ohne Dokumentation die Schreibseite; mit Entwurf den
  Entwurf; nach dem Festschreiben den Eintrag mit dem Weg zum Nachtrag (ADR-016).

## L4 · Ein Balken zeigt leer und voll

Jede Fortschritts- oder Zeitspur zeigt ihre ganze Länge mit mindestens 3:1 gegen den Untergrund
(WCAG 1.4.11); die Füllung hebt sich davon ab. Beispiel: die Spur am Fahrzeit-Balken stand mit
1,01:1 auf der Seitenfläche. Umgesetzt: SLK-004, Token `--color-spur`.

## L5 · Neutraler, heller Grund

Die Seitenfläche und die Grautöne werden neutral; Farbe tragen nur Marke (Hauptfarbe, Tiefgrün der
Seitenleiste) und Bedeutung (Warnung, Fehler, erledigt). Beispiel: „das Ganze sieht etwas öko aus“.
Umgesetzt: SLK-004, Grundton B (ANN-253); Gruppen durch Linien statt Kästen werden Bereich für
Bereich nach L2 umgebaut.

## L6 · Eine Seite folgt DESIGN.md

Jede neue oder umgebaute Seite wählt einen Seitentyp aus [DESIGN.md](DESIGN.md) und baut sich aus
dessen Bausteinen; fehlt einer, entsteht er in `src/components/ui`, nicht in der Seite. Die Ratsche
in `src/designsystem.test.ts` hält den erreichten Stand je Verzeichnis (ANN-400).

## Vorgehen

1. Je Beispiel eine Regel hier.
2. Erst den gemeinsamen Baustein ändern (`src/components/ui`), dann Bereich für Bereich die Seiten.
3. Je Bereich eine Story `SLK-NNN`, ein Commit; mit Migration Pfad A, sonst Pfad S.
4. Unklare Löschkandidaten mit Ort, Grund und Abhängigem an Jannes; gelöscht wird auf sein Wort.

Die Löschkandidaten vom 2026-10-10 fallen alle weg (Jannes, BEF-140): der Aufklapper
„Organisatorisches und Kommunikation“, „Telefon (geschäftlich)“ außer an einer Akte mit Nummer
(ANN-340; `phone_work` bleibt), „Andere Ziel-App prüfen“ nach S-3.
