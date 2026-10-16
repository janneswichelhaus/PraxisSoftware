import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Zielanzeige } from './Testbausteine';

/**
 * Hilfen für die Komponententests der Radflotte: eine Seite unter ihrer Route
 * (für `useParams`) und daneben ein Ziel, das Pfad, Suchteil und mitgegebene
 * Meldung zeigt - so prüft ein Test, wohin ein Vorgang führt.
 */

export function rendereSeite(route: string, seite: ReactElement, pfad: string): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createMemoryRouter(
    [
      { path: route, element: seite },
      { path: '*', element: <Zielanzeige /> },
    ],
    { initialEntries: [pfad] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
