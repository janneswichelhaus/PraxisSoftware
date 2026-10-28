# ADR-004: Berechtigungsmodell
## Status
Angenommen (2026-08-28), geltend Fassung 2 (2026-09-13, Jannes, E15): Umkehr von Punkt 3;
schloss A4. Vermerk 2026-10-03: Was ins Auditlog kommt, regelt abschließend ADR-010 (Fassung 3).

## Kontext
§4.2 öffnet allen Therapeut:innen alle Akten der Organisation. Bewusst nicht Bestandteil:
Identity-Provider, Auth-Framework, Session-Verfahren (§3.4), die vollständige Rechtematrix, Auditlog,
Break Glass und Besetzung der Administratorrolle (ADR-010), Identität und Vertretung (B5, ADR-023).

## Entscheidung
1. **Ein Benutzer kann mehrere Rollen besitzen.**
2. **Alle Therapeut:innen dürfen grundsätzlich alle Patientenakten ihrer Organisation einsehen.**
3. **Office hat lesenden Zugriff auf alle klinischen Inhalte einer Patientenakte im selben Umfang wie
   Therapeut:innen** (Fassung 2, E15): Diagnose und Verordnung samt Scan, Behandlungsdokumentation
   mit Verlauf, Befunde, patientenbezogene Nachrichten. Office schreibt keine klinische
   Dokumentation; jeder Zugriff ist auditpflichtig wie bei Therapeut:innen (Punkt 7, ADR-010);
   die Bewertung (Need-to-know, DSFA) gehört in B2 (§4.3).
4. **Behandlungsnachweis:** Für Rechnung und organisatorische Streitfälle bleibt ein datensparsamer
   Behandlungsnachweis als eigene Sicht mit eigenem Datenumfang ohne klinischen Inhalt; (Fassung 2)
   keine Zugriffsgrenze, sondern die Sicht, die außerhalb der Praxis gezeigt werden kann.
5. **Zentraler Policy-/Authorization-Layer** mit Datenbank-RLS als Defense-in-Depth.
6. **Suche, Dateien, Exporte und spätere KI-/RAG-Funktionen müssen dieselben Berechtigungsregeln
   respektieren**, auch ihre Kopien und Sichten (Suchindex, Dateiablage, Exporte,
   Embedding-/RAG-Speicher).
7. **Audit-Logging relevanter Zugriffe und sicherheitsrelevanter Aktionen ist verpflichtend.**
8. **Die technische Administratorrolle wird von den normalen Praxisrollen getrennt** (§4.1).

## Konsequenzen
- Die Berechtigung ist die Vereinigung der Rollen (§4). Eine zentrale, testbare Stelle entscheidet
  (ADR-013), Fachmodule fragen an; Datenbankzugriffe müssen den handelnden Benutzerkontext mitführen,
  auch Hintergrundjobs, Reports und Datenmigrationen; keine allmächtige technische Kennung. Antworten
  sind Projektionen (§4.7); das Auditlog ist sicherheitskritisch und selbst zu schützen (§4.2, §4.3,
  ADR-010). Jeder neue Endpunkt, Report und Export braucht eine bewusste Berechtigungsentscheidung.

## Offene Folgefragen
- offen: STAFF-EPIC-002, G6 (OPEN_DECISIONS): Umgehungsschutz, Protokoll von Rechteänderungen.

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Fassung 2 (2026-09-13, Jannes, E15): Office liest klinische Inhalte (Umkehr Punkt 3), Punkt 4 neu.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
