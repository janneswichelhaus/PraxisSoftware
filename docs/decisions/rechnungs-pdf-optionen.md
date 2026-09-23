# B14 — Optionen für das Rechnungs-PDF

Vorlage aus ABR-EPIC-002a, 2026-09-19. **Entschieden am 2026-09-19** (Jannes,
B14 in [`OPEN_DECISIONS.md`](OPEN_DECISIONS.md)): **Weg 1 jetzt, Weg 3 nach
OPS-001**, Weg 2 entfällt; Weg 1 ist mit ABR-EPIC-002b gebaut. Das Dokument
hat keinen Rang und bleibt als Begründung der Wahl stehen.

## Worum es geht

ADR-009 Punkt 11 verlangt, dass „das ausgestellte Rechnungsdokument in seiner
damaligen Form aufbewahrt" wird, Punkt 14 nennt PDF für private Empfänger und
verlangt, die Tür zur strukturierten E-Rechnung nicht zuzumauern. ADR-017 legt
fest, wo Dateien liegen und wie auf sie verwiesen wird.

Die Datengrundlage ist **fertig**: Mit dem Ausstellen entsteht ein Snapshot mit
allen rechnungsrelevanten Angaben (`invoices.snapshot`, eigene
`schema_version`). Jeder der drei Wege liest genau dieses Dokument; keiner
braucht eine zweite Datenhaltung. Offen ist allein, **wo** aus dem Dokument ein
PDF wird.

## Die drei Wege

### Weg 1 — Browser-Druck der bestehenden Rechnungsansicht

Die Seite bekommt eine `@media print`-Fassung; die Praxis druckt sie über den
Browser nach PDF.

- **Aufwand:** klein (etwa ein halber Loop). Die Druckansichten für Tagesplan,
  Terminzettel und Tourenliste stehen bereits; dieselbe Technik.
- **Neue Abhängigkeit:** keine. **Neuer Ausführungsort:** keiner.
- **Preis:** Die Datei entsteht beim Nutzer, und die Anwendung sieht sie nie.
  Damit ist Punkt 11 **nicht** erfüllt — aufbewahrt wird der Snapshot, nicht
  das Dokument, das die Praxis verschickt hat. Seitenumbruch, Kopfzeile und
  Ränder hängen am Browser und an dessen Einstellungen.
- **Taugt für:** eine Übergangszeit, in der die Praxis ohnehin nur wenige
  Rechnungen im Monat schreibt.

### Weg 2 — Erzeugung im Browser mit einer Bibliothek

Eine JavaScript-Bibliothek erzeugt das PDF im Browser; die Anwendung lädt es in
die Ablage nach ADR-017 hoch und verweist wie auf jede andere Datei darauf.

- **Aufwand:** mittel (etwa ein Loop). Layout, Schrifteinbettung und der
  Upload-Pfad sind neu.
- **Neue Abhängigkeit:** ja — eine Bibliothek im Auslieferungsstand
  (Größenordnung mehrere hundert Kilobyte). Nach den harten Regeln in
  `CLAUDE.md` ist das eine Prüfung gegen die ADRs, kein Nebenbei.
  **Neuer Ausführungsort:** keiner.
- **Preis:** Das Dokument entsteht auf dem Gerät der Praxis. Zwei Geräte mit
  zwei Bibliotheksversionen können zwei verschiedene PDFs derselben Rechnung
  erzeugen; aufbewahrt wird, was zufällig zuerst hochgeladen wurde.
- **Taugt für:** den Fall, dass ein serverseitiger Ausführungsort dauerhaft
  ausgeschlossen bleiben soll.

### Weg 3 — Serverseitige Erzeugung (vermerkte Tendenz aus B14)

Eine Serverfunktion liest den Snapshot, erzeugt daraus das PDF, legt es nach
ADR-017 ab und verknüpft es unveränderlich mit der Rechnung.

- **Aufwand:** groß (ein bis zwei Loops), davon der größere Teil Betrieb und
  Prüfung, nicht Layout.
- **Neue Abhängigkeit:** eine serverseitige Bibliothek. **Neuer
  Ausführungsort:** ja — und genau das ist nach `PROJECT_PRINCIPLES.md` §15.1
  ein **Stopp**: Der Ort muss gegen ADR-002 (Datenstandort, Auftragsverarbeitung)
  geprüft und in der DSFA (ADR-007) nachgeführt werden, bevor er entsteht.
- **Preis:** der höchste Aufwand vorab. Dafür entsteht das Dokument genau
  einmal, an einem Ort, mit einer Fassung — das ist, was Punkt 11 verlangt.
- **Taugt für:** den Dauerbetrieb.

## Was die Wege gemeinsam haben

- Keiner ändert das Datenmodell. Der Snapshot ist die Quelle, das PDF seine
  Darstellung — so hält ADR-009 Punkt 14 die Tür zur E-Rechnung offen.
- Keiner braucht neue Angaben von Jannes außer den Praxis-Stammdaten, die seit
  ABR-000 erfasst werden.
- Die schwarze Wortmarke für den Rechnungskopf liegt fertig in
  [`marke/logo/own-motion-block-schwarz.svg`](../../marke/logo/own-motion-block-schwarz.svg);
  `marke/README.md` nennt Rechnung und Fax als genau ihren Fall. Sie wird mit
  dem gewählten Weg ausgeliefert, nicht vorher — eine Kopie in `public/marke/`
  ohne Verwendung wäre eine zweite Fassung ohne Zweck.

## Empfehlung

**Weg 3**, und bis zu seiner Freigabe Weg 1 als Übergang. Weg 2 kauft die
Nachteile beider Seiten: eine neue Abhängigkeit im Auslieferungsstand, ohne das
Problem der einen verbindlichen Fassung zu lösen.

Der Stopp in Weg 3 ist kein Argument gegen ihn, sondern seine Reihenfolge:
erst die Prüfung des Ausführungsortes gegen ADR-002 und ADR-007, dann der Bau.
Weg 1 hält die Praxis in der Zwischenzeit arbeitsfähig, ohne eine Entscheidung
vorwegzunehmen — er legt nichts an, was später im Weg stünde.
