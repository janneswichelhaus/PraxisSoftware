# ADR-008: Aufbewahrung und Löschung personenbezogener Daten
## Status
Angenommen (2026-08-28), Fassung 7 (2026-10-26); ergänzt durch ADR-012, ADR-017 Punkt 10.

## Kontext
Entschieden wird (B3), wie Aufbewahrungspflichten (§ 630f BGB, Steuerrecht) und Löschung (Art. 17,
Art. 5 Abs. 1 lit. e DSGVO) über Datenklassen mit Fristen zusammengehen, auch in Backups; nach ADR-007
Punkt 5 ist das Konzept Vorbedingung des Produktivstarts. Bewusst nicht Bestandteil: technische
Umsetzung von Löschung, Anonymisierung und Legal Hold, Backup-Lebenszyklus (ADR-012), abschließende
steuerrechtliche Bewertung der Belegarten und Fristen, Rechtsgrundlagen und Einwilligungsmodell
(ADR-007), Erhalt anonymisierter Daten nach Fristablauf, Versionierung klinischer Dokumentation (§5).

## Entscheidung
1. **Datenklassen.** Personenbezogene Daten werden Datenklassen zugeordnet und nach einem
   dokumentierten Retention Schedule verarbeitet: Frist, Anker, Norm je Klasse in
   `public.retention_classes`, Zuordnung je Tabelle in `public.retention_assignments` (ANN-001).
   Eine neue Datenklasse ohne Fristzuordnung ist ein Mangel, kein Sonderfall. Abweichend von `basis`
   dort gilt die klinische Akte als gesetzlich geprägt, das Löschjournal als abgeleitet. Logs und
   AI-Gateway-Auditmetadaten (ohne volle Prompts und Outputs): ADR-011 Punkt 4. Fristen ohne
   unmittelbare gesetzliche Vorgabe sind interne Initialentscheidungen und müssen vor Produktivstart
   im Datenschutz-/DSFA-Prozess validiert werden.
2. **Gesetzliche Aufbewahrungspflichten haben Vorrang vor regulärer Löschung.**
3. **Echte Löschung.** Nach Ablauf des Zwecks und aller Aufbewahrungsgründe MUSS echt gelöscht werden.
4. **Klinische Behandlungsunterlagen** bleiben grundsätzlich zehn Jahre nach Abschluss der Behandlung.
5. **Steuerlich relevante Rechnungen und Buchungsbelege** folgen der geltenden steuerlichen Frist.
6. **Operative Daten** erhalten deutlich kürzere Speicherfristen: Routing-Rohdaten höchstens 30
   Tage, nicht angenommene KI-Entwürfe höchstens 7 Tage (angenommene KI-Inhalte folgen dem
   Zieldokument), Terminanfragen ohne Behandlungsverhältnis 12 Monate nach letztem Kontakt.
7. **Legal Hold.** Ein dokumentierter Legal-Hold-Mechanismus verhindert automatische Löschung während
   laufender rechtlicher oder regulatorischer Vorgänge; ein Hold hat Beginn, Grund, verantwortliche
   Person und Ende und setzt nur die automatische Löschung aus, nicht die Zugriffsregeln (ADR-004).
8. **Backups** dürfen gelöschte Daten bis zum Ende des definierten Backup-Lebenszyklus enthalten, die
   nicht regulär zugänglich sein dürfen. Nach einer Wiederherstellung MÜSSEN seit Backup-Erstellung
   wirksam gewordene Löschungen erneut angewendet werden, aus einer Liste, die den Restore überlebt.
9. **Accounts und Authentifizierungsdaten** werden getrennt von aufbewahrungspflichtigen fachlichen
   Datensätzen behandelt: Ein Konto lässt sich löschen oder sperren, während die Dokumentation bleibt.
10. **Kein dauerhaftes Soft-Delete** ersetzt die gesetzlich beziehungsweise datenschutzrechtlich
    erforderliche endgültige Löschung; als Zwischenzustand ist es zulässig.
11. **Fristanker der Akte** (Fassung 3). Der „Abschluss der Behandlung“ (Punkt 4) ist der späteste
    Tag aus letzter Behandlung (Behandlungstermin abgehakt, dokumentiert, abgerechnet oder nicht
    angetroffen), letzter erfasster abrechenbarer Leistung und dem weiter möglichen ausdrücklichen
    Abschluss der Versorgung; so hat die Frist auch ohne ausdrücklichen Abschluss ein Datum (Jannes,
    B1; ANN-511). Steht ein Behandlungstermin bevor oder gab es keine Behandlung, läuft keine Frist;
    Rechnungen halten über ihre eigene Frist (Punkt 5).
12. **Teamchat** (Fassung 5). Jede Nachricht fällt zwölf Monate ab ihrem Tag endgültig, mit Eintrag
    im Löschjournal; eine neue Antwort verlängert keine ältere. Hat eine fällige Ausgangsnachricht
    laufende Antworten, fallen Text, Verfasser:in und Erwähnungen, die Zeile bleibt als Anker des
    Threads, bis die letzte Antwort fällt (kein Soft-Delete, Punkt 10: ohne Personenbezug).
    Dauerhaft Relevantes MUSS in den vorgesehenen Fachprozess übernommen werden (§10; ANN-610).
13. **Register der Querschnittsfunktionen** (Fassung 7). Jede Tabelle steht mit Personenbezug und
    den Entscheidungen zu Auskunft, Löschjournal und Zusammenführen in `public.data_registry`, eine
    Ausnahme mit Begründung; die Aufbewahrung zeigt per Fremdschlüssel darauf, ein Test wird rot bei
    fehlender Tabelle oder unbegründeter Entscheidung (ANN-751). Eine Tabelle mit eigenem Journal
    schreibt es bei jeder gelöschten Zeile selbst, auf jedem, auch künftigen Löschweg (Punkt 8,
    ANN-752). Eine zusammengeführte Akte steht im Journal als Zusammenführung, nach einer
    Wiederherstellung wird sie erneut zusammengeführt (ANN-150 Fassung 3).

## Konsequenzen
- Löschung ist ein aktiver, wiederkehrender Vorgang mit eigener Protokollierung und muss selbst
  nachweisbar sein. Ein Löschverlangen nach Art. 17 DSGVO erfasst die Akte in der Regel nicht; das
  Verfahren für Betroffenenrechte (ADR-007) muss diese Ablehnung begründet ausgeben können.

## Offene Folgefragen
- offen: B3 (OPEN_DECISIONS), die Validierung der Fristen im DSFA-Prozess und ihr Nachziehen.

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Fassung 2 (2026-10-03, LOG-EPIC-001): Fristen von Auditlog, Löschjournal und Löschaufträgen.
- Fassung 3 (2026-10-14, Jannes, B1): Punkt 11, Fristanker aus letzter Behandlung oder Leistung.
- Fassung 4 (2026-10-17, ORG-006, ANN-607): Rückmeldungen von Beschäftigten, 12 Monate (§20.2).
- Fassung 5 (2026-10-17, TEAM-001, ANN-610): Punkt 12, Teamchat je Nachricht, Anker im Thread.
- Fassung 6 (2026-10-18, ADR-027): Datenklasse Ernährungsberatung, 3 Jahre nach Ende des Profils.
- Fassung 7 (2026-10-26, Jannes, Aufräumen 4): Punkt 13, Register der Querschnittsfunktionen.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
