import type { Termin } from './api';

/** Was auf der Zeile steht: Art und wer kommt (Titel), Ort (Nebenzeile). */
export function terminBeschreibung(t: Termin): { titel: string; ort: string | null } {
  const wer = t.staff_name ?? 'Ihre Praxis';
  if (t.appointment_type === 'home_visit') {
    const anschrift = [
      [t.visit_street, t.visit_house_number].filter(Boolean).join(' '),
      [t.visit_postal_code, t.visit_city].filter(Boolean).join(' '),
    ]
      .filter((teil) => teil.length > 0)
      .join(', ');
    return { titel: `Hausbesuch · ${wer} kommt zu Ihnen`, ort: anschrift || null };
  }
  if (t.appointment_type === 'video') {
    return { titel: `Videotermin mit ${wer}`, ort: null };
  }
  return { titel: `In der Praxis bei ${wer}`, ort: t.location_name };
}
