import { createRoot } from 'react-dom/client';
import { Pruefseite } from './uebungsbilder-seite';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `uebungsbilder.html` (ANN-382): der Kontaktbogen
 * des Übungskatalogs. `?gruppe=kn` zeigt nur eine Gruppe, `?ansicht=bogen`
 * nur die Bewegungsbilder dicht nebeneinander. Die Seite selbst steht in
 * `uebungsbilder-seite.tsx`.
 */
const wurzel = document.getElementById('wurzel');
if (wurzel) createRoot(wurzel).render(<Pruefseite />);
