import { createContext, useContext, type ComponentType } from 'react';
import type { CurrentUser } from '@/features/session/types';
import type { Appointment } from './api';

/**
 * Was andere Bereiche an einem Termin zeigen: Termine kennt nur den Platz, die App setzt den Inhalt
 * ein (ANN-748). So bindet die Dokumentation Termine ein, ohne dass Termine sie importiert.
 */
export interface TerminErweiterungen {
  /** Der Abschnitt der Behandlungsdokumentation in den Aktionen am Termin. */
  Behandlungsnotiz?: ComponentType<{
    appointment: Appointment;
    user: CurrentUser;
    eingehend?: string;
  }>;
}

export const TerminErweiterungenKontext = createContext<TerminErweiterungen>({});

export function useTerminErweiterungen(): TerminErweiterungen {
  return useContext(TerminErweiterungenKontext);
}
