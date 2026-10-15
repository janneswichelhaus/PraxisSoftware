import { createRoot } from 'react-dom/client';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { PlattformEinsicht } from '@/features/platform-access/PlattformEinsicht';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `einsicht.html` (E-001): die Seite der Praxis
 * mit Leiste, Rahmen und Plattform, an Erikas eigenem Zugang. Gelesen wird
 * wie in der Anwendung über `platform_preview`; die Antworten gibt der Test
 * (`tests/e2e/einsicht.spec.ts`). Alles ist synthetisch.
 */
const ZUGANG = 'cafecafe-cafe-4afe-8afe-000000000002';

const router = createMemoryRouter([{ path: '*', element: <PlattformEinsicht /> }], {
  initialEntries: [`/p?zugang=${ZUGANG}`],
});

createRoot(document.getElementById('wurzel')!).render(<RouterProvider router={router} />);
