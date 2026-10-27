import { createRoot } from 'react-dom/client';
import { PlattformSperrseite } from '@/features/core/auth/sitzungssperre/PlattformSperrseite';
import { Sperrseite } from '@/features/core/auth/sitzungssperre/Sperrseite';
import type { Sperrgrund } from '@/features/core/auth/sitzungssperre/sperrstand';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `sperre.html` (SEC-002): die Sperrseite allein,
 * ohne Anmeldedienst. Entsperren schlägt hier fehl - geprüft wird die Seite,
 * nicht der Dienst. Ob es eine App-PIN gibt, beantwortet der Test über eine
 * umgeleitete Anfrage (`own_pin_status`). `?fassung=plattform` zeigt die
 * Fassung der Plattform (Handoff 2026-10-22, Abschnitt 5.2).
 */
const suche = new URLSearchParams(window.location.search);
const grund = (suche.get('grund') ?? 'inaktiv') as Sperrgrund;

createRoot(document.getElementById('wurzel')!).render(
  suche.get('fassung') === 'plattform' ? (
    <PlattformSperrseite
      haelt={suche.get('halten') === '1'}
      verbrauchtAnfangs={grund === 'verbraucht'}
      onEntsperrt={() => undefined}
      onAbmelden={() => undefined}
    />
  ) : (
    <Sperrseite
      grund={grund}
      haelt={suche.get('halten') === '1'}
      onEntsperrt={() => undefined}
      onAbmelden={() => undefined}
    />
  ),
);
