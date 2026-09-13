# ADR-015: Initialer technischer Stack

## Status

Angenommen

## Datum

2026-08-28

## Kontext

Mit ADR-001 bis ADR-014 sind alle technischen P0-Entscheidungen getroffen.
Offen war bewusst die konkrete Technologiewahl: ADR-002 legt Prüfkriterien für
Dienstleister fest, benennt aber keinen Anbieter; ADR-004 verlangt einen
zentralen Policy-Layer plus Datenbank-RLS, ohne die Datenbank zu bestimmen;
ADR-013 fordert CI-Gates, ohne eine Plattform zu nennen; ADR-014 beschreibt
Modellanforderungen, keine Werkzeuge.

Dieser ADR schließt diese Lücke für die erste Anwendung. Er trifft eine
Auswahl für Entwicklung und den ersten vertikalen Schnitt, nicht für den
produktiven Betrieb mit realen Gesundheitsdaten — die dafür nach ADR-002 und
ADR-007 erforderlichen Prüfungen sind nicht Gegenstand dieser Entscheidung.

Die Anforderung aus §2.2 lautet responsive Web-App/PWA ohne native Apps in der
ersten Phase. ADR-001 sieht eine begrenzte Offline-Fähigkeit vor, deren
technischer Mechanismus ausdrücklich offen ist. Daraus folgt, dass ein
generisches Offline-Caching jetzt nicht eingerichtet werden darf: Ein Service
Worker, der Anwendungs- oder Patientendaten unkontrolliert zwischenspeichert,
wäre die Vorwegnahme genau der Entscheidung, die ADR-001 offen gelassen hat —
und würde Patientendaten unkontrolliert auf Endgeräten ablegen.

## Entscheidung

### Architektur

1. Die erste Anwendung wird als **modularer Monolith** entwickelt.

### Stack

2. **TypeScript**, **React**, **Vite**, **Tailwind CSS**
3. **Zugängliche, wiederverwendbare UI-Komponenten**; **keine Abhängigkeit von
   einem proprietären UI-Builder**
4. **TanStack Query** für Server-State
5. **Zod** für Runtime-Validierung
6. **Supabase** als initiale Backend-Plattform
7. **PostgreSQL** als Datenbank
8. **Supabase Auth**
9. **PostgreSQL Row Level Security** als Defense-in-Depth
10. **Supabase Storage** für Dateien
11. **pnpm** als Paketmanager
12. **Vitest** und **Testing Library**
13. **Playwright** für End-to-End-Tests
14. **GitHub Actions** für CI

### Abgrenzungen

15. Die Anwendung wird zunächst als **responsive Webanwendung** entwickelt.
16. **Noch KEIN generischer Service Worker und KEIN automatisches
    Offline-Caching** von Anwendungs- oder Patientendaten. Der begrenzte
    Offline-Modus wird später separat gemäß
    [ADR-001](ADR-001-online-first-limited-offline.md) entwickelt.
17. **Supabase wird zunächst lokal für Entwicklung verwendet.**
18. Durch diesen Auftrag dürfen **keine Produktionsressourcen, kein
    Produktionsprojekt, keine kostenpflichtigen Cloud-Ressourcen und keine
    echten Patientendaten** angelegt oder verwendet werden.
19. Ein späteres Supabase-Cloudprojekt für personenbezogene Daten **MUSS eine
    explizit freigegebene EU-Region verwenden**; Frankfurt `eu-central-1` ist
    der derzeit bevorzugte Kandidat.
20. **Supabase Edge Functions sind NICHT automatisch für produktive
    Gesundheitsdaten freigegeben.** Eine solche Nutzung benötigt eine separate
    Datenfluss- und Providerprüfung.

### Ausgeschlossen

21. Keine Microservices. Kein Next.js. Keine Vektordatenbank. Kein Kubernetes.
    Keine native Mobile-App. Keine KI-Integration in diesem Auftrag.

### Repository-Struktur

22. Einfache, langfristig wartbare Struktur ohne Monorepo, solange es nur eine
    Anwendung gibt:

```
/
  src/
    app/
    components/
    features/
    lib/
    routes/
  supabase/
    migrations/
    tests/
  tests/
  docs/
```

23. Feature-Code wird **fachlich modular** organisiert. Technische Layer werden
    **nicht** zu einer unnötig komplexen Clean-Architecture-Struktur
    aufgebläht.

## Konsequenzen

- PostgreSQL mit RLS ist die technische Grundlage für die zweite
  Verteidigungslinie aus [ADR-004](ADR-004-authorization-model.md). Die dort
  geforderte Kombination aus zentralem Policy-Layer und RLS ist damit
  umsetzbar, und die Modellanforderungen aus
  [ADR-014](ADR-014-foundational-data-model.md) — UUID-Schlüssel,
  `organization_id`, zeitzonenbewusste Zeitstempel, exakte Geldwerte — sind
  nativ abbildbar.
- Supabase Auth erfüllt §3.4: Authentifizierung, Passwort-Hashing und
  Session-Security werden nicht selbst implementiert.
- Supabase ist ein US-amerikanisches Unternehmen. Nach ADR-002 ist das nicht
  ausgeschlossen, aber an die dortige Prüfung gebunden. **Solange diese Prüfung
  nicht dokumentiert vorliegt, darf kein Cloudprojekt mit personenbezogenen
  Daten entstehen.** Die Beschränkung auf lokale Entwicklung ist deshalb kein
  Zwischenschritt, sondern die Bedingung, unter der diese Wahl heute zulässig
  ist.
- Der ausdrückliche Vorbehalt für Edge Functions folgt derselben Logik: Sie
  laufen auf einer eigenen, global verteilten Laufzeit und sind damit ein
  eigener Datenfluss im Sinne von ADR-002 und ADR-007.
- Der Verzicht auf einen Service Worker hält ADR-001 offen und verhindert, dass
  Patientendaten unbemerkt auf Endgeräten liegen bleiben. Die Anwendung ist
  damit vorerst vollständig online-first, wie §2.2 es beschreibt.
- Der modulare Monolith hält die Betriebskomplexität niedrig. Das ist bei
  Bus-Faktor 1 kein Komfort, sondern eine Anforderung aus
  [ADR-012](ADR-012-backup-and-business-continuity.md): Jede zusätzliche
  Laufzeitkomponente vergrößert die Dokumentations- und Wiederherstellungslast.
- Vitest, Testing Library und Playwright decken die Testarten ab, die
  [ADR-013](ADR-013-ci-cd-and-release-governance.md) als Pflichtprüfungen
  verlangt. RLS-Policies werden gegen eine echte PostgreSQL-Instanz getestet,
  nicht gegen ein Mock — andernfalls wäre die Prüfung wertlos.
- Der Verzicht auf einen proprietären UI-Builder hält §2.1 ein: Die Oberfläche
  bleibt im eigenen Code und erzeugt keine Abhängigkeit von einem externen
  Anbieter für den Praxisalltag.
- Die Wahl bindet uns nicht dauerhaft: PostgreSQL, RLS und die Trennung von
  Fachcode und Datenzugriff erlauben einen späteren Wechsel der
  Backend-Plattform ohne Neuentwicklung der Fachlogik.

## Bewusst nicht Bestandteil dieser Entscheidung

- Die Freigabe von Supabase als produktiver Auftragsverarbeiter. Diese setzt
  die vollständige Prüfung nach ADR-002 voraus, einschließlich AVV/DPA,
  Eignung im Hinblick auf §203 StGB und Unterauftragnehmerkette.
- Die Anlage eines Supabase-Cloudprojekts, die Wahl der konkreten Region und
  jede Form von Produktionsbetrieb.
- Hosting des Frontends.
- E-Mail-Versand, Kartendienst und KI-Anbieter.
- Der technische Offline-Mechanismus (ADR-001).
- Backup-Lebenszyklus und Aufbewahrung der Backups (ADR-012).
- Zustandsverwaltung jenseits von Server-State, Routing-Bibliothek im Detail,
  Komponentenbibliothek im Einzelnen.
- Design-System und Branding.

## Offene Folgefragen

- Wann und durch wen erfolgt die Providerprüfung für Supabase nach ADR-002,
  und welche Alternativen bestehen, falls sie negativ ausfällt?
- Wie wird das Frontend gehostet, und unterliegt dieser Anbieter derselben
  Prüfung?
- Wie werden Supabase-Migrationen in CI gegen eine echte Datenbank getestet,
  ohne Produktionsdaten zu verwenden (ADR-013)?
- Wie wird sichergestellt, dass kein `service_role`-Schlüssel jemals in den
  Browser gelangt?
- Wie verhält sich Supabase Storage zu den Anforderungen aus §12
  (Dateizugriffe) und ADR-008 (Retention von Dateien)? *Beantwortet mit
  ADR-017 (angenommen 2026-09-12), gebaut mit DAT-EPIC-001.*
- Welche Teile des Backends müssten bei einem späteren Plattformwechsel
  ersetzt werden, und wie wird diese Abhängigkeit klein gehalten?
- Ab welchem Punkt wird der modulare Monolith zu groß, und woran würden wir
  das erkennen?
