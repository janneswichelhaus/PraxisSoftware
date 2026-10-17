import { TAGESZEIT_NAME, type Termin, type Terminwunsch } from './api';
import { tagKurz, uhrzeit, wochentagMitDatum } from './zeit';

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

const ART_KURZ: Record<Termin['appointment_type'], string> = {
  home_visit: 'Hausbesuch',
  practice: 'Praxistermin',
  video: 'Videotermin',
};

/**
 * Der Termin in einer Zeile für den Kopf eines Fensters: „Mo., 19.10 · 09:30 ·
 * Hausbesuch“ - Tag, Uhrzeit und Art, kurz genug für 375 px in 18 px.
 */
export function terminKurz(t: Termin): string {
  return `${tagKurz(t.starts_at)} · ${uhrzeit(t.starts_at)} · ${ART_KURZ[t.appointment_type]}`;
}

/** Was die Person gewünscht hat, in einem Satz. */
export function wunschText(w: Terminwunsch): string {
  const tage = w.preferred_days.map((t) => wochentagMitDatum(t)).join(', ');
  const zeiten = w.preferred_times.map((z) => TAGESZEIT_NAME[z]).join(', ');
  return [tage, zeiten].filter((teil) => teil.length > 0).join(' · ');
}
