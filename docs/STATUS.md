# Status · Stand 2026-09-26 · letzte Session: FRB-EPIC-002

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**FRB-EPIC-002 gebaut** (Block 2): Anamnesebogen V8 in der Akte unter **Befund** — erheben, als Entwurf sichern, abschließen, korrigieren als neue Erhebung; Hervorhebung nach acht offengelegten Regeln ohne Bewertung; Körperschema; Verlauf als Punkte mit Ereignissen. Pull Request offen, wartet auf deinen Merge. Test-Umgebung `https://prtest.uber.space` wie bisher. Fortschritt **36,0 %**.

## Danach — Bauen

1. **G6c**, sobald deine Wahl unter „Blocker" da ist
2. **UX-EPIC-002** — frei: Die Begriffe sind in Ordnung (Jannes, 2026-09-26); Stoff sind BEF-035 bis BEF-040 aus der Kalendersichtung. `/weiter UX-EPIC-002`
3. Danach Block 2 weiter mit **FRB-EPIC-003** (Befund aus Bausteinen); D2/D3 gelten ohne Antwort wie im FRB-Plan vorgeschlagen

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2473**; `test:db` **1973** (neu: Fragebögen und Verlaufsereignisse, FRB-EPIC-002); `test:e2e` ohne Anmeldung: Prüfseiten grün, `login.spec.ts` in der Cloud rot — auf `main` identisch. Sichtprüfung der Tourenkomponenten, der Instrumente und des Befunds über die Prüfseiten `tests/e2e/fixtures/karte.html`, `instrumente.html` und `befund.html` bei 1280 und 375 px; die Seiten hinter der Anmeldung nur über Komponententests.

## Blocker (Jannes-seitig)

- **Sichtung** (E-6), ab jetzt am Handy auf der Test-Umgebung (erste freie Sichtung Kalender 2026-09-26: BEF-035 bis BEF-040, Stoff für UX-EPIC-002/003): Der Rückstand steht in vier Dateien zu höchstens 15 Schritten — [Kernprozess](sichtung/kernprozess.md), [Leistungsbereiche](sichtung/leistungsbereiche.md), [Kartendienst](sichtung/kartendienst.md) (Teil am Telefon: Wegpunktlimit, `MAX_ZWISCHENZIELE` bleibt bei drei), [Betriebsreife](sichtung/betriebsreife.md). Start mit `/sichtung`; Bedienung in [`DEVELOPMENT.md`](DEVELOPMENT.md), „Test-Umgebung".
- **Anamnese sichten** (neu, FRB-EPIC-002): Schritte 3 bis 5 in [Befund](sichtung/befund.md); **ANN-104** ist bestätigt (2026-09-26); für die externe Prüfung nach ADR-006 bleibt sie im Prüfpaket.
- **Bögen für NRS, PSFS und Veränderungsfrage** (ANN-099): die Vorlagen als PDF nach `quellen/scores/pdf/` — dann werden die drei auf 1.0.0 aktiviert und erscheinen im Befund und im Verlauf.
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

**FRB-EPIC-002 — Anamnese und Verlauf.** Fünf Stories: Definition des Bogens (ANN-102), Erhebungen mit unveränderlichem Abschluss und Korrekturkette (ANN-103, ANN-105), Hervorhebung nach §7.1 (ANN-104), Körperschema, Verlaufsereignisse (ANN-106). Zwei Migrationen, zwei neue Tabellen der Klasse Patientenakte, beide in der Auskunft nach Art. 15. Nicht gelaufen: angemeldete E2E (kein GoTrue in der Cloud). **Lokale Schritte:** `git pull origin claude/weiter-55ci36` (nach dem Merge `main`), dann `pnpm dlx supabase@2.116.0 db reset` (neue Migrationen). Keine neue Abhängigkeit.
