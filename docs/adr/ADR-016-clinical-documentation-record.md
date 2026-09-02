# ADR-016: Klinische Dokumentation — Entwurf, Finalisierung und Änderbarkeit

## Status

Angenommen

## Datum

2026-09-01

## Kontext

`PROJECT_PRINCIPLES.md` §5 verlangt für die klinische Dokumentation
„finalisiert" und „nachvollziehbar", definiert beide Begriffe aber nicht.
`docs/decisions/OPEN_DECISIONS.md` führt sie in Abschnitt D als offen und nennt
die entscheidende Konsequenz: „Versionierung mit abrufbarem Originalinhalt (wie
§630f BGB verlangt) oder nur Änderungs-Log? Zwei verschiedene Datenmodelle."

Jannes hat am 2026-09-01 die Anforderung genannt und die Entscheidung
ausdrücklich delegiert: die Dokumentation soll sich an iPrax orientieren —
**jede:r Therapeut:in kann dokumentieren, und Einträge können auch im
Nachhinein geändert oder ergänzt werden.** Ob iPrax solche Änderungen
speichert, ist ihm nicht bekannt.

Diese Frage ist nur zum Teil eine Produktentscheidung. §630f Abs. 1 BGB
verlangt, dass bei Berichtigungen und Änderungen einer Patientenakte
**neben dem ursprünglichen Inhalt** erkennbar bleibt, wann sie vorgenommen
wurden, und stellt ausdrücklich klar, dass das auch für elektronisch geführte
Akten sicherzustellen ist. Ein reines Änderungs-Log, das den alten Inhalt
überschreibt, erfüllt das nicht. Der Freiheitsgrad liegt also nicht bei der
Frage *ob* versioniert wird, sondern nur bei Zuschnitt und Bedienung.

Weitere Randbedingungen aus bereits getroffenen Entscheidungen:

- [ADR-004](ADR-004-authorization-model.md): Therapeut:innen sehen
  grundsätzlich alle Akten der Organisation; Office hat keinen Zugriff auf
  klinische Freitexte.
- [ADR-001](ADR-001-online-first-limited-offline.md): Finalisierung erst nach
  Serversynchronisation; nicht finalisierte Entwürfe dürfen offline entstehen.
- [ADR-009](ADR-009-private-billing-model.md): Fakturierung grundsätzlich erst
  nach finalisierter Dokumentation.
- [ADR-008](ADR-008-data-retention-and-deletion.md): klinische Unterlagen
  10 Jahre nach Behandlungsabschluss.
- [ADR-010](ADR-010-audit-and-privileged-access.md): auditpflichtige
  Ereignisse, nur Metadaten ohne klinische Inhalte.

## Entscheidung

1. **Jede:r Therapeut:in darf dokumentieren, ergänzen und korrigieren** — auch
   Einträge, die eine andere Person verfasst hat. Es gibt keine Beschränkung
   auf den ursprünglichen Verfasser. Vertretung ist in einer kleinen Praxis der
   Regelfall, und ADR-004 gibt Therapeut:innen ohnehin Zugriff auf alle Akten.
   **Die Urheberschaft je Version bleibt dauerhaft erhalten.**

2. **Ein Dokumentationseintrag hat genau zwei Zustände: `Entwurf` und
   `finalisiert`.**

3. **Entwurf.** Frei änderbar ohne Versionierung. Für alle Therapeut:innen
   sichtbar, aber deutlich als Entwurf gekennzeichnet. Kein Nachweis im Sinne
   von §630f, keine Grundlage für eine Abrechnung (ADR-009). Ein Entwurf darf
   offline entstehen (ADR-001).

4. **Finalisierung** ist ein ausdrücklicher Schritt durch eine:n Therapeut:in.
   Ab diesem Zeitpunkt ist der Eintrag Bestandteil der Akte. Finalisieren darf
   jede:r Therapeut:in, nicht nur der Verfasser.

5. **Nach der Finalisierung erzeugt jede Änderung eine neue Version.** Der
   Inhalt jeder früheren Version bleibt **vollständig abrufbar**, zusammen mit
   Zeitpunkt und Urheber der Änderung. Es wird nicht überschrieben und nicht
   gelöscht. Das ist die Anforderung aus §630f Abs. 1 S. 2 und 3 BGB und keine
   Ermessensfrage.

6. **Ergänzung ist der Regelfall, Änderung die Ausnahme.** Eine nachträgliche
   Ergänzung wird als **eigener, mit dem Ursprungseintrag verknüpfter Eintrag**
   geführt, nicht als Änderung des alten Textes. Die Änderung eines
   finalisierten Eintrags bleibt echten Korrekturen vorbehalten und verlangt
   eine kurze Begründung.

7. **Automatische Finalisierung.** Ein Entwurf wird nach Ablauf einer
   konfigurierbaren Frist automatisch finalisiert; Voreinstellung ist das Ende
   des auf die Behandlung folgenden Kalendertages. Der Entwurfsstand wird dabei
   unverändert zur Version 1.

8. **Sichtbarkeit.** Office sieht weder Inhalte noch Versionen klinischer
   Einträge (ADR-004). Der Versionsverlauf unterliegt derselben
   rollenabhängigen Projektion wie der Eintrag selbst.

9. **Auditpflicht.** Erstellen, Finalisieren, Ändern und Lesen eines Eintrags
   sind auditpflichtig nach ADR-010 — als Metadaten, ohne klinischen Inhalt im
   Auditlog.

## Konsequenzen

- **Abschnitt D aus `OPEN_DECISIONS.md` ist für „finalisiert" und
  „nachvollziehbar" damit entschieden.** Die übrigen Begriffe dort bleiben
  offen.
- Das Datenmodell trägt Eintrag und Version als getrennte Ebenen. Der
  aktuelle Stand ist die jüngste Version; Lesepfade liefern
  standardmäßig diese und den Verlauf nur auf Anforderung.
- Punkt 7 erzeugt bewusst Reibung: eine automatische Finalisierung kann einen
  unfertigen Eintrag festschreiben. Die Alternative — ein Entwurf, der nie
  finalisiert wird — ist rechtlich der schlechtere Fall, weil dann gar keine
  Dokumentation im Sinne von §630f vorliegt. Version 1 lässt sich jederzeit
  durch eine Version 2 korrigieren; ein fehlender Eintrag lässt sich nicht
  nachträglich zeitnah machen. **Das ist der Punkt dieser Entscheidung, der am
  ehesten nachjustiert werden muss**, sobald die Praxis damit gearbeitet hat.
- Punkt 6 hält den Verlauf lesbar. Würde jede Ergänzung als Änderung geführt,
  entstünden lange Versionsketten, in denen nicht mehr erkennbar ist, was
  Korrektur und was Zusatz war.
- Die Speichermenge wächst, weil nichts überschrieben wird. Bei Textinhalten
  ist das im Verhältnis zur Aufbewahrungspflicht von zehn Jahren
  vernachlässigbar.
- Löschung nach ADR-008 erfasst **alle** Versionen eines Eintrags. Ein
  Versionsverlauf, der eine wirksame Löschung überlebt, wäre ein Fehler und
  muss im Test von LOE-002 abgedeckt sein.
- Die Anforderung „jede:r darf ändern" plus „Urheberschaft je Version bleibt"
  macht das Audit-Log zur einzigen verbleibenden Kontrolle — dieselbe Lage wie
  bei C4 in `OPEN_DECISIONS.md`. Der Versionsverlauf ist hier die
  kompensierende Maßnahme, weil er fachlich und nicht nur technisch lesbar ist.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die inhaltliche Struktur eines Eintrags (Vorlagen, Felder, SOAP oder
  Freitext). Das gehört in die Feature-Spezifikation von DOK-001.
- Eine elektronische Signatur oder ein qualifizierter Zeitstempel.
- Die Löschbarkeit einer finalisierten Dokumentation außerhalb von ADR-008.
- Der Umgang mit Dokumentation außerhalb der Heilbehandlung (B9).
- Diktat, Spracherkennung oder KI-gestützte Entwürfe. Dafür gelten ADR-005 und
  ADR-006 zusätzlich.

## Offene Folgefragen

- Ist die Voreinstellung „Ende des Folgetages" für die automatische
  Finalisierung praxistauglich, insbesondere bei Hausbesuchen am Freitag?
- Wird die Begründung bei einer Korrektur (Punkt 6) zum Pflichtfeld oder bleibt
  sie optional?
- Wie wird der Versionsverlauf dargestellt, ohne dass er den Alltagsblick auf
  die Akte überlagert?
- Gilt Punkt 1 auch für Auszubildende oder Praktikant:innen, sobald es eine
  solche Rolle gibt? ADR-004 kennt sie heute nicht.
