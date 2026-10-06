import { TAGESZEIT_NAME, type Termin, type Terminwunsch } from './api';
import { wochentagMitDatum } from './zeit';

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

/** Was die Person gewünscht hat, in einem Satz. */
export function wunschText(w: Terminwunsch): string {
  const tage = w.preferred_days.map((t) => wochentagMitDatum(t)).join(', ');
  const zeiten = w.preferred_times.map((z) => TAGESZEIT_NAME[z]).join(', ');
  return [tage, zeiten].filter((teil) => teil.length > 0).join(' · ');
}
