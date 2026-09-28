import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';

/**
 * Testumgebung der Abrechnung mit echten Routen und sichtbarem Abfrage-Client
 * (UXR-010).
 *
 * `renderWithProviders` legt Client und Router verborgen an und kennt nur
 * eine Platzhalterroute. Zwei Dinge lassen sich damit nicht prüfen, um die es
 * in UXR-010 geht: **welche Abfragen** nach einem Vorgang neu geladen werden
 * (ABR-01) und **wohin** eine Seite danach führt (ABR-10). Hier sind beide
 * sichtbar - der Client für `vi.spyOn(client, 'invalidateQueries')`, der
 * Router für `router.state.location`.
 *
 * Nur für Tests; die Anwendung importiert diese Datei nicht.
 */
export function zeigeMitRouten(
  routen: RouteObject[],
  pfad: string,
): RenderResult & { client: QueryClient; router: ReturnType<typeof createMemoryRouter> } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const router = createMemoryRouter(routen, { initialEntries: [pfad] });
  const ergebnis = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...ergebnis, client, router };
}
