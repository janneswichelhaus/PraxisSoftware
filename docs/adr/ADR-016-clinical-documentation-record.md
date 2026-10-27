# ADR-016: Klinische Dokumentation — Entwurf, Finalisierung und Änderbarkeit
## Status
Angenommen, Fassung 4 (2026-10-14); Fassung 3 kehrte Punkt 9 um (LOG-EPIC-001); Punkt 8 folgt
ADR-004 Fassung 2 (E15, 2026-09-13).

## Kontext
§5 verlangt „finalisiert“ und „nachvollziehbar“, ohne sie zu definieren; Jannes will, dass jede:r
Therapeut:in dokumentiert und Einträge nachträglich ändern oder ergänzen kann. § 630f Abs. 1 BGB
verlangt, dass bei Änderungen neben dem ursprünglichen Inhalt erkennbar bleibt, wann sie erfolgten,
auch elektronisch. Bewusst nicht Bestandteil: Struktur eines Eintrags (DOK-001), Signatur,
qualifizierter Zeitstempel, Löschung außerhalb von ADR-008, Doku außerhalb der Heilbehandlung (B9),
Diktat und KI-Entwürfe als Funktion außer Punkt 10 (ADR-005, ADR-006, E13).

## Entscheidung
1. **Jede:r Therapeut:in darf dokumentieren, ergänzen und korrigieren**, auch Einträge anderer,
   ohne Beschränkung auf den Verfasser; **die Urheberschaft je Version bleibt dauerhaft erhalten**.
2. **Ein Dokumentationseintrag hat genau zwei Zustände: `Entwurf` und `finalisiert`.**
3. **Entwurf:** frei änderbar ohne Versionierung, klar gekennzeichnet und allen Therapeut:innen
   sichtbar; kein Nachweis (§ 630f BGB), nicht abrechenbar (ADR-009), offline möglich (ADR-001).
4. **Finalisierung** ist ein ausdrücklicher Schritt, den jede:r Therapeut:in tun darf; ab da gehört
   der Eintrag zur Akte. Sie **hakt den Termin nicht ab** (Fassung 4, ADR-018 Punkt 10).
5. **Nach der Finalisierung erzeugt jede Änderung eine neue Version**; jede frühere bleibt mit
   Zeitpunkt und Urheber vollständig abrufbar, nichts wird überschrieben oder gelöscht
   (§ 630f Abs. 1 S. 2 und 3 BGB).
6. **Ergänzung ist der Regelfall, Änderung die Ausnahme:** Ergänzung als eigener, verknüpfter
   Eintrag; Änderung eines finalisierten Eintrags nur für echte Korrekturen, mit kurzer Begründung.
7. **Automatische Finalisierung** nach konfigurierbarer Frist, voreingestellt das Ende des auf die
   Behandlung folgenden Kalendertages; der Entwurfsstand wird unverändert zur Version 1.
8. **Sichtbarkeit:** Der Versionsverlauf folgt derselben rollenabhängigen Projektion wie der
   Eintrag; Office liest seit ADR-004 Fassung 2 im Umfang der Therapeut:innen und schreibt nicht.
9. **Auditpflicht** (Fassung 3): Schreibvorgänge weist der Eintrag selbst nach (`created_by`,
   `finalized_by`, `finalized_at`, Versionen); das Lesen steht als „Akte geöffnet“ höchstens einmal
   je Person, Akte und Kalendertag im Auditlog (ADR-010), ohne klinischen Inhalt.
10. **Ein KI-Vorschlag ist kein Entwurf** (Fassung 2, §6.3): Transkript oder strukturierter
    Vorschlag aus Diktat oder anderer KI-Verarbeitung ist kein Eintrag nach Punkt 2. Erst die
    ausdrückliche Übernahme durch eine:n Therapeut:in macht ihn zum `Entwurf`, verfasst von dieser
    Person; die automatische Finalisierung erfasst einen nicht übernommenen Vorschlag nie.
11. **Sperre nach der Freigabe zur Abrechnung** (Fassung 4): Ist die Grundlage eines Termins
    freigegeben (ADR-020 Punkt 9), sind seine Einträge gesperrt, kein Entwurf, keine Korrektur, kein
    Nachtrag, bis sie zurückgeholt ist, mit Rechnung erst nach Storno (ADR-009 Punkt 9); davor gilt
    Punkt 1. Freigegeben wird nur ohne offenen Entwurf, Punkt 7 trifft also nie Gesperrtes; der
    Server sperrt, nicht die Oberfläche (ANN-515).

## Konsequenzen
- Eintrag und Version sind getrennte Ebenen; Lesepfade liefern die jüngste Version, den Verlauf auf
  Anforderung. Weil jede:r ändern darf, kompensiert der lesbare Verlauf (wie C4). Löschung nach
  ADR-008 erfasst alle Versionen (Test in LOE-002); Fristen der KI-Entwürfe: ADR-008.
- Punkt 7 schreibt auch Unfertiges fest und wird am ehesten nachjustiert; Selbstgeschriebenes
  finalisiert weiter nach Punkt 7. Wie Punkt 10 trennt, wählt die Feature-Spezifikation;
  `pnpm test:db` prüft, dass die automatische Finalisierung nie Unübernommenes festschreibt.

## Offene Folgefragen
- offen: Frist am Freitag, Begründungspflicht, Azubi-Rolle (OPEN_DECISIONS, Folgefragen); E13.
- Wie zeigt die Oberfläche den Versionsverlauf, ohne den Alltagsblick auf die Akte zu überlagern?
- Sollen Nachträge nach der Freigabe möglich sein (Punkt 11)? Heute erst nach dem Zurückholen.

## Änderungshistorie
- Fassung 1 (2026-09-01, von Jannes delegiert): angenommen, Begriffe aus Abschnitt D entschieden.
- Fassung 2 (2026-09-08, Jannes): Punkt 10, ein KI-Vorschlag ist kein Entwurf (§6.3).
- Fassung 3 (2026-10-03, Jannes, LOG-EPIC-001): Punkt 9 umgekehrt, Lesen einmal je Akte und Tag.
- Fassung 4 (2026-10-14, B4, B7): hakt nicht ab (Punkt 4), Sperre nach Abrechnungsfreigabe.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
