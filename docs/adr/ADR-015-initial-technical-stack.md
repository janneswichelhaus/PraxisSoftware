# ADR-015: Initialer technischer Stack
## Status
Angenommen (2026-08-28), Fassung 1; Punkt 16 abgelöst durch ADR-024 (2026-10-11).

## Kontext
Technologiewahl für Entwicklung und den ersten vertikalen Schnitt, nicht für den Betrieb mit realen
Gesundheitsdaten (ADR-002, ADR-007). Bewusst nicht Bestandteil: Freigabe von Supabase als produktiver
Auftragsverarbeiter, Cloudprojekt, Region, Produktionsbetrieb, Frontend-Hosting, Mail-, Karten-,
KI-Anbieter, Offline (ADR-024), Backups (ADR-012), weitere Bibliotheken, Design-System.

## Entscheidung
1. **Modularer Monolith** für die erste Anwendung.
2. **TypeScript**, **React**, **Vite**, **Tailwind CSS**.
3. **Zugängliche, wiederverwendbare UI-Komponenten**, kein proprietärer UI-Builder als Abhängigkeit.
4. **TanStack Query** für Server-State.
5. **Zod** für Runtime-Validierung.
6. **Supabase** als initiale Backend-Plattform.
7. **PostgreSQL** als Datenbank.
8. **Supabase Auth**.
9. **PostgreSQL Row Level Security** als Defense-in-Depth.
10. **Supabase Storage** für Dateien.
11. **pnpm** als Paketmanager.
12. **Vitest** und **Testing Library**.
13. **Playwright** für End-to-End-Tests.
14. **GitHub Actions** für CI.
15. **Die Anwendung wird zunächst als responsive Webanwendung entwickelt** (§2.2, ohne native Apps).
16. *Abgelöst durch ADR-024:* nur dessen schmaler Service Worker, kein generisches Offline-Caching.
17. **Supabase wird zunächst lokal für Entwicklung verwendet.**
18. **Durch diesen Auftrag dürfen keine** Produktionsressourcen, kein Produktionsprojekt, keine
    kostenpflichtigen Cloud-Ressourcen, keine echten Patientendaten angelegt oder verwendet werden.
19. **EU-Region:** Ein späteres Supabase-Cloudprojekt für personenbezogene Daten **MUSS** eine
    explizit freigegebene EU-Region verwenden; derzeit bevorzugt ist Frankfurt `eu-central-1`.
20. **Supabase Edge Functions sind NICHT automatisch für produktive Gesundheitsdaten freigegeben;**
    eine solche Nutzung braucht eine eigene Datenfluss- und Providerprüfung (ADR-002, ADR-007).
21. **Ausgeschlossen:** Microservices, Next.js, Vektordatenbank, Kubernetes, native Mobile-App; keine
    KI-Integration in diesem Auftrag.
22. **Kein Monorepo**, solange es nur eine Anwendung gibt: `src/` (`app`, `components`, `features`,
    `lib`, `routes`), `supabase/` (`migrations`, `tests`), `tests/`, `docs/`.
23. **Feature-Code fachlich modular**, ohne unnötig komplexe Clean-Architecture-Schichtung.

## Konsequenzen
- Solange die Prüfung nach ADR-002 nicht dokumentiert vorliegt, darf kein Cloudprojekt mit
  personenbezogenen Daten entstehen; nur so ist diese Wahl zulässig. RLS-Policies werden
  gegen echtes PostgreSQL getestet, nie gegen ein Mock. Jede zusätzliche Laufzeitkomponente
  vergrößert bei Bus-Faktor 1 die Dokumentations- und Wiederherstellungslast (ADR-012).

## Offene Folgefragen
- offen: A2/OPS-001 (Wechsel: Providerprüfung Teil 7), B16, OPS-002a, OPS-002 (OPEN_DECISIONS).
- Wie wird sichergestellt, dass nie ein `service_role`-Schlüssel in den Browser gelangt? (OPS-002)
- Ab wann wird der modulare Monolith zu groß, und woran erkennen wir das?

## Änderungshistorie
- Fassung 1 (2026-08-28): angenommen.
- Verdichtet 2026-10-27 (Aufräumen 5), Inhalt unverändert; früherer Wortlaut: `git log -p`.
