# Status · Stand 2026-09-22 · letzte Sessions: OPS-006 Betroffenenrechte · Kennzeichnungen weg

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**Eine Patientin kann ihre Rechte jetzt geltend machen, und die Praxis kann antworten.** OPS-006 (minimal) ist die Vorbedingung aus ADR-007 Punkt 5, die als erste von außen ausgelöst wird. Drei Teile: Das **Verfahren** steht als [`datenschutz/betroffenenrechte.md`](datenschutz/betroffenenrechte.md) — Fristen nach Art. 12 Abs. 3 DSGVO, Ablauf vom Eingang bis zur Ablage, die sieben Rechte einzeln und, ausdrücklich, die **Grenzen des heutigen Stands**. Die **Auskunft** nach Art. 15 Abs. 3 DSGVO ist `export_patient_record`: nur `owner`, nur die eigene Organisation, jeder Aufruf als `patient_record.exported` protokolliert — und **vollständig geprüft gegen den Aufbewahrungsplan**, nicht gegen eine Liste im Test; eine neue Tabelle der Klasse `patientenakte` macht den Test rot. Die **begründete Ablehnung** eines Löschverlangens ist kein feststehender Text, sondern ein Entwurf mit Grundlage, Ankerdatum und Fristende dieser einen Akte; läuft die Behandlung noch, nennt er kein Löschdatum. Eine neue Annahme: **ANN-092** — das Zugriffsprotokoll ist nicht Teil der Auskunft (Art. 15 Abs. 4 DSGVO, §20), auf Verlangen wird es von Hand erteilt. Fortschritt **46,4 → 47,3 %**.

**Was bewusst nicht gebaut ist**, steht im Verfahren statt in einer Fußnote: keine Vorgangsakte für Frist und Wiedervorlage, kein Zugriffsprotokoll auf Knopfdruck, kein eigener Zustand für Art. 18, keine Selbstbedienung, Trainingsdaten von Hand. Jeder dieser Punkte ist mit dem Verfahren auch ohne Software zu erfüllen — deshalb Komfort und kein Mangel.

**Dazu aus paralleler Sitzung: Die Vorschaukennzeichnungen sind weg** (Entscheidung von Jannes) — kein Banner „noch keine echte Speicherung", keine Kästen „Fachlich offen", elf Seiten. **Zustandsmeldungen bleiben vollständig**, ebenso jede Prüfung in `ehrlichkeit.test.tsx`. Drei Aussagen sind **umgezogen statt gelöscht**, weil sie auch im Echtbetrieb gelten: das Gate aus ADR-019 Punkt 9 auf der Kartenseite, die Zusage aus §20 auf der Tourenseite, die Rechengrundlage der Fahrzeitmatrix — jetzt als Abschnitt, nicht als Warnkasten. Die Trennlinie für künftige Loops steht in [`development/ARBEITSBEREICHE.md`](development/ARBEITSBEREICHE.md), Abschnitt 2.

## Danach — Reihenfolge seit 2026-09-22

1. **OPS-007** — Bootstrap-Runbook, gegen die Testumgebung geprobt (G11, M3)
2. **OPS-004, Rest** — davon gehen ohne Cloudprojekt nur zwei: Entscheidung zu externem
   Error-Tracking und „abgewiesene Zugriffe protokolliert"; Alarmierung, Security-Log 12 Monate
   und die Erkennung für Art. 33 warten auf **G3**
3. **PAT-006 (G8)** — Datenschutzinformation und Einwilligungen; das Verfahren aus OPS-006 verweist
   an zwei Stellen darauf, und ohne Einwilligung gibt es nichts zu widerrufen

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2306** (zwei reine Bannerprüfungen entfallen, keine abgeschwächt); `test:db` **1788** — in dieser Session **vollständig gelaufen**, weil eine Migration dazukam. `ASSUMPTIONS.md`: **1210** Zeilen (ANN-092; Obergrenze zum zehnten Mal nachgezogen). **Nicht gelaufen: die Sichtprüfung im Browser** — hinter der Anmeldung startet in der Cloud kein GoTrue; sie steht als Abnahmeschritt.

## Blocker (Jannes-seitig)

- **Logfrist für Betriebslogs entscheiden (R14)** — neu aus dieser Session, und es ist eine Wahl mit
  zwei Wegen: **(a) andere Frist** — ADR-011 Punkt 4 in einer neuen Fassung auf das senken, was die
  Plattform hält (1 bis 28 Tage); billig, aber es verkürzt die Zeit, in der ein Vorfall nach Art. 33
  überhaupt noch nachweisbar ist. **(b) Ausleitungsweg** — Logs zu einem eigenen Ziel schreiben;
  hält die 30 Tage, ist aber ein **zweiter Auftragsverarbeiter** mit eigenem Prüfkatalog nach
  ADR-002. **Empfehlung: (a) vorerst nicht, (b) erst nach G3** — bis zum Scharfschalten ist nichts
  davon nötig, und mit synthetischen Daten kostet die Lücke nichts. Gebraucht wird die Antwort,
  **bevor echte Daten laufen**; bis dahin steht die 30 im Code als Anforderung, nicht als Zusage.
- **OPS-001 weitertragen** — sonst bleibt jede Zeile der Prüfung ein Suchauszug: Unterlagen aus Teil 9 von einem **ungeproxten Rechner** laden; zwei Fragen an den Support (**Zugriff durch Beschäftigte**, **Verschlüsselung der Objekte**); Gate-Punkt 1 bis 6 an **B2**, darunter **§203 Abs. 4 StGB** — der einzige, dessen Scheitern den Anbieter kostet. **Zuerst** `auth-smtp`.
- **BEF-026 / B13:** Der eingebaute Mailversand stellt laut Auszug nur an Adressen des Projektteams zu. Entweder eigener SMTP-Anbieter (zweiter Auftragsverarbeiter, eigene Prüfung, Rücknahme von B13) oder kein Mailversand (Handgriff nach ANN-025). **STAFF-004 ruht bis dahin.**
- **MAP-003, MAP-004 und MAP-005 abnehmen** ([`abnahme/etappe-t-kartendienst.md`](abnahme/etappe-t-kartendienst.md)): MAP-003 und MAP-004 nur lokal — `[edge_runtime] enabled = true` **für den Lauf** (im Repository bleibt `false`), `supabase/functions/.env.local`, `functions serve`. MAP-003 Schritt 1 und 4 **durch**, **BEF-027 behoben**; offen bleiben Schritt 2, 3 und 5 sowie **alle fünf Schritte von MAP-004**. **MAP-005 Teil A ist durch** (Laptop, 2026-09-22) — die drei Befunde daraus sind behoben und in Teil A **erneut zu prüfen**, weil die Seite sich geändert hat; dabei gleich **MAP-002 Schritt 3** mitprüfen, der ohne Vorschaubanner neu geschrieben ist. **Teil B am Telefon ruht**, bis ein Gerät da ist. Bis dahin bleibt `MAX_ZWISCHENZIELE` bei drei.
- **Freigabe für Etappe TR.** §14 nimmt den **Trainingsbereich selbst** aus; ohne neue Version nach §21 beginnt dort kein Loop — gebraucht, wenn Etappe TR an der Reihe ist.
- **PTV:** Karte und Schlüssel tragen auch serverseitig (BEF-021, BEF-022). Offen: **Domainbindung** (ADR-019 Punkt 19) und die **Höchstzahl der Relationen je Matrix-Anfrage** (ANN-091 überbrückt sie mit 25 × 25); nur synthetische Koordinaten.
- **Lokal:** `git pull`. Keine neue Abhängigkeit, keine Migration. **Node 22** (`.nvmrc`), sonst rot.
- **G13 fehlt:** Umsatzsteuer-Status, **Wortlaut des Befreiungshinweises**, die **Kürzel der beiden Nummernkreise** (`RG`/`TR`) — ANN-074/075/082; dazu echte Preise. **B4** entscheidet zusätzlich über den **ermäßigten Satz**; bis dahin weist eine Constraint ihn ab.
- **B9:** Die Auswertung liefert beide Grundlagen und wählt keine; welche die Gewinnermittlung verlangt, gehört mit B4 in dieselbe Frage (**ANN-088**).
- **M0 (Vorlauf):** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) — **B2 trägt** die
  Trennung aus ADR-021, die Einwilligung im Training, die Office-Sicht (§4.8), **die Frist für
  Screening-Daten**, den **Handoff** (ADR-019 Punkt 23) · **Secret Scanning** · Kartendienst ablegen.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018, CAL-EPIC-004a/b/c,
  FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001/002a/b/003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); **Sichtprüfung hinter der Anmeldung wartet auf OPS-002** — in der Cloud startet kein GoTrue.
- **B8:** Lizenzbeleg · ungemergt liegen `claude/issue-42-status-fv319v` (3), `claude/r3-analyse` (5) und `claude/r3-code-review-hardening-c22b8f` (1 Commit).

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004, LEI-EPIC-001, FRB-EPIC-000, CAL-EPIC-005 samt CAL-027, ABR-EPIC-005, ABR-EPIC-006 ([`Etappe L`](abnahme/etappe-l-leistungsbereiche.md)) und MAP-002 samt MAP-003, MAP-004 und MAP-005 ([`Etappe T`](abnahme/etappe-t-kartendienst.md)); FIX-EPIC-001, MAP-003 und MAP-004 brauchen Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md). **OPS-006** kommt neu dazu ([Etappe G](abnahme/etappe-g-betriebsreife.md)); **OPS-004 steht nicht dabei** — was der Loop davor gebaut hat, prüfen Tests und Lint, nicht ein Klickweg.

## Letzte Session

**Eine Kopie, die ihre eigenen Lücken verschweigt, ist die schlechtere Auskunft.** Die Auskunft nach Art. 15 nennt deshalb in der Antwort selbst, was sie nicht enthält — Dateiinhalte, Trainingsdaten, das Zugriffsprotokoll. Die eigentliche Entscheidung war die **Richtung der Vollständigkeitsprüfung**: Der Test liest die Tabellen der Akte aus `retention_assignments` und vergleicht sie gegen die Abschnitte der Kopie; eine Liste im Test wäre beim ersten neuen Feature still veraltet, und eine unvollständige Auskunft merkt niemand. **ANN-092** ist die einzige neue Annahme und trägt die unbequeme Mitte: Das Auditlog ganz herauszugeben, hübe die Beschränkung aus ADR-010 Punkt 13 über den Umweg der Auskunft auf — jede Zeile ist auch ein Datensatz über eine beschäftigte Person; die Auskunft ganz zu verweigern, wäre der umgekehrte Fehler. Erteilt wird sie auf Verlangen, von Hand, ohne die Namen. Ebenfalls eine Entscheidung und keine Kleinigkeit: **Die Seite exportiert nicht beim Öffnen.** Ein Export beim Blättern machte das Protokoll wertlos, das ihn festhält. Der Ablehnungsentwurf rechnet aus `retention_classes` und `app.retention_due_at` — ein geänderter Aufbewahrungsplan ändert den Brief mit, und nirgends steht eine Frist ein zweites Mal. **BEF-033** neu, aufgefallen und bewusst nicht mitgemacht: Die Aufbewahrungsseite zeigt `Par. 630f Abs. 3 BGB` statt `§ 630f Abs. 3 BGB`; die Funktion dafür gibt es jetzt, die Änderung gehört in den Loop, der die Seite ohnehin anfasst.
