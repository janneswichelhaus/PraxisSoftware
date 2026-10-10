import { createRoot } from 'react-dom/client';
import { Sperrseite } from '@/features/auth/sitzungssperre/Sperrseite';
import type { Sperrgrund } from '@/features/auth/sitzungssperre/sperrstand';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `sperre.html` (SEC-002): die Sperrseite allein,
 * ohne Anmeldedienst. Entsperren schlägt hier fehl - geprüft wird die Seite,
 * nicht der Dienst. Ob es eine App-PIN gibt, beantwortet der Test über eine
 * umgeleitete Anfrage (`own_pin_status`).
 */
const suche = new URLSearchParams(window.location.search);
const grund = (suche.get('grund') ?? 'inaktiv') as Sperrgrund;

createRoot(document.getElementById('wurzel')!).render(
  <Sperrseite
    grund={grund}
    haelt={suche.get('halten') === '1'}
    onEntsperrt={() => undefined}
    onAbmelden={() => undefined}
  />,
);
