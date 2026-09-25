# Status · Stand 2026-09-25 · letzte Session: FRB-EPIC-001

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**FRB-EPIC-001 gebaut** (Block 2, zweiter Loop): Die Instrumentenbibliothek rechnet — Rechenkern für alle Formelarten, NRS, PSFS und globale Veränderungsfrage als Definitionen, Leseseite **Organisatorisches → Instrumente**. Die drei Instrumente bleiben **inaktiv**, bis ihr Bogen in `quellen/` liegt (ANN-099). Pull Request offen, **Merge bei dir**; kein Pflicht-Zweitreview (keine kritische Änderung nach ADR-013 Punkt 9). Fortschritt **34,7 %**.

## Danach — Bauen

1. **G6c**, sobald deine Wahl unter „Blocker" da ist
2. **OPS-002a Test-Umgebung** — die Konten stehen (2026-09-25), `/weiter OPS-002a`; danach UX-EPIC-002, sobald deine Begriffsliste da ist
3. Solange beides fehlt: **Block 2 weiter mit FRB-EPIC-002** (Anamnese und Verlauf in der Akte) — Bauen wartet nicht (§15.2)

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2394**; `test:db` **1937** (seit MAP-006 unverändert, FRB-EPIC-001 ohne Datenbank); `test:e2e` ohne Anmeldung: Prüfseiten grün, `login.spec.ts` in der Cloud rot — auf `main` identisch. Sichtprüfung der Tourenkomponenten und der Instrumente über die Prüfseiten `tests/e2e/fixtures/karte.html` und `instrumente.html` bei 1280 und 375 px; die Seiten hinter der Anmeldung nur über Komponententests.

## Blocker (Jannes-seitig)

- **Sichtung** (E-6): Der Rückstand steht in vier Dateien zu höchstens 15 Schritten — [Kernprozess](sichtung/kernprozess.md), [Leistungsbereiche](sichtung/leistungsbereiche.md), [Kartendienst](sichtung/kartendienst.md) (Teil am Telefon: Wegpunktlimit, `MAX_ZWISCHENZIELE` bleibt bei drei), [Betriebsreife](sichtung/betriebsreife.md). Start mit `/sichtung`; am Handy im WLAN nach [`DEVELOPMENT.md`](DEVELOPMENT.md), „Handytest im WLAN".
- **Bögen für NRS, PSFS und Veränderungsfrage** (neu, ANN-099): die Vorlagen, die die Praxis nutzt, als PDF nach `quellen/scores/pdf/` — dann wird der Wortlaut dagegen gehalten und die drei auf Version 1.0.0 aktiviert. Nicht dringend: Erhoben wird erst mit FRB-EPIC-002.
- **Begriffe sammeln**, die in der Anwendung stören (Stichworte oder Bildschirmfotos) — Grundlage für UX-EPIC-002.
- **G6c Schreibpfade** (Optionen in der Roadmap, Block 1): Empfehlung (a) HTTP 403 bei bestätigter Transaktion für Rollen und Konten, Legal Hold und Löschaufträge, (c) für den Rest. Ohne Antwort geht es mit Block 2 weiter.
- **Logfrist für Betriebslogs (R14 alt, jetzt R9):** (a) ADR-011 Punkt 4 senken oder (b) Ausleitungsweg. Empfehlung: nach G3. Gebraucht vor echten Daten.
- **BEF-026 / B13 (wieder offen):** Die Plattform braucht Mails an Patient:innen; Empfehlung: eigener SMTP-Anbieter, geprüft in Block 11. STAFF-004 ruht bis dahin.
- **D2/D3 aus dem FRB-Plan** vor FRB-EPIC-003; ohne Antwort gilt der Vorschlag dort.
- **Preise** für Abo und Pakete vor Block 5 (bis dahin synthetisch); **G13** (Umsatzsteuer-Status, Befreiungshinweis, Kürzel `RG`/`TR`) vor M3.
- **B8:** schriftlicher Lizenzbeleg bis M3.
- **Sieben alte Branches löschen** (freigegeben, aber aus der Cloud-Session gesperrt): `git push origin --delete claude/befunde-kalender-2026-09-18 claude/issue-42-status-fv319v claude/konsolidierung-r2 claude/nice-goldberg-kcnct0 claude/r3-analyse claude/r3-code-review-hardening-c22b8f claude/hopeful-mendel-ib440i` — ihr Inhalt steht auf `main`.
- **Ab Anfang 2027 parallel zum Bauen (E-1, 2026-09-23):** OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen.
- **Lokal:** `git pull`, **Node 22** (`.nvmrc`).

## Letzte Session

**FRB-EPIC-001 — Instrumentenbibliothek.** Rechenkern `rechne()` für alle Formelarten des Schemas samt neuer Form `mittelwert`; fehlt ein gewerteter Wert, gibt es keinen (ANN-098). NRS, PSFS (drei Aktivitäten) und Veränderungsfrage (−3 bis +3) als Definitionen in Version 0.1.0, inaktiv mit vorläufigem Wortlaut, weil keine Vorlage im Repository liegt (ANN-099); jede Definition rechnet ihre Referenzfälle nach. Leseseite `/praxis/instrumente` ohne Cut-off und MCID (ADR-006 Punkt 11). Neue Sichtung [Befund](sichtung/befund.md). **Lokale Schritte:** `git pull origin claude/weiter-c7lldw` (nach dem Merge `main`). Keine Migration, keine neue Abhängigkeit.
