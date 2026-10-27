import { createRoot } from 'react-dom/client';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { InstrumentePage } from '@/features/clinical/assessments/InstrumentePage';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `instrumente.html` (FRB-010).
 *
 * Die Seite ist eine reine Leseseite ohne Server — gezeigt wird genau das,
 * was die Anwendung unter `/praxis/instrumente` zeigt: die Liste, mit
 * `?instrument=<Kennung>` ein Instrument im Einzelnen (Design-Rollout B4).
 * Der Router läuft im Speicher und beginnt mit dem Suchteil dieser Seite.
 */
const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');

const router = createMemoryRouter(
  [
    {
      path: '/praxis/instrumente',
      element: (
        // Derselbe Inhaltsbereich wie in der Anwendung (AppShell).
        <main className="max-w-inhalt mx-auto w-full min-w-0 px-4 pt-4 pb-28 sm:px-6 sm:pt-6 sm:pb-10 lg:px-8 lg:pb-12">
          <InstrumentePage />
        </main>
      ),
    },
  ],
  { initialEntries: [`/praxis/instrumente${window.location.search}`] },
);

createRoot(wurzel).render(<RouterProvider router={router} />);
