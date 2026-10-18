import type { BerechneteZielwerte, Formel, Geschlecht, Ziel } from './zielwerte';

/**
 * Die Wörter der Ernährungsberatung (ERN-001) - für Praxis und Plattform.
 *
 * Beschriftung ist Zweckbestimmung (ADR-006, Konsequenzen): Hier steht nur,
 * was gerechnet wurde und woraus, nie eine Aussage über die Gesundheit und
 * kein Etikett zum Gewicht (ADR-006 Punkt 14 e).
 */

export const ZIEL_TEXTE: Record<Ziel, string> = {
  lose: 'Abnehmen',
  maintain: 'Gewicht halten',
  build_muscle: 'Muskelaufbau',
  gain: 'Zunehmen',
};

export const GESCHLECHT_TEXTE: Record<Geschlecht, string> = {
  female: 'Weiblich',
  male: 'Männlich',
  unspecified: 'Ohne Angabe',
};

/** Die Stufen der DGE mit Alltagsbeispielen (ADR-027 Punkt 17). */
export const PAL_TEXTE: Record<string, { kurz: string; beispiel: string }> = {
  '1.4': { kurz: 'Sitzend', beispiel: 'Büro, kaum Bewegung in der Freizeit' },
  '1.6': { kurz: 'Sitzend mit Bewegung', beispiel: 'Büro mit Wegen, etwas Sport' },
  '1.8': { kurz: 'Gehend und stehend', beispiel: 'Verkauf, Handwerk, Pflege' },
  '2.0': { kurz: 'Körperlich anstrengend', beispiel: 'Bau, Landwirtschaft, viel Sport' },
};

export function palText(pal: number): string {
  const text = PAL_TEXTE[pal.toFixed(1)];
  return text ? `${zahl(pal, 1)} · ${text.kurz}` : zahl(pal, 1);
}

export const FORMEL_TEXTE: Record<Formel, string> = {
  standard: 'Standard: Mifflin-St Jeor, mit Körperfett Cunningham',
  katch_mcardle: 'Katch-McArdle',
  harris_benedict_revised: 'Harris-Benedict (revidiert)',
};

export const GRUNDUMSATZ_FORMELN: Record<BerechneteZielwerte['bmr']['formula'], string> = {
  mifflin_st_jeor: 'Mifflin-St Jeor',
  cunningham: 'Cunningham',
  katch_mcardle: 'Katch-McArdle',
  harris_benedict_revised: 'Harris-Benedict (revidiert)',
};

export const EINGABE_TEXTE: Record<string, { name: string; einheit: string }> = {
  weight_kg: { name: 'Gewicht', einheit: 'kg' },
  height_cm: { name: 'Größe', einheit: 'cm' },
  age_years: { name: 'Alter', einheit: 'Jahre' },
  lean_mass_kg: { name: 'fettfreie Masse', einheit: 'kg' },
};

/** Zahlen wie im Deutschen: Komma, ohne Tausenderpunkt bei kcal. */
export function zahl(wert: number, stellen = 0): string {
  return wert.toLocaleString('de-DE', {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
    useGrouping: false,
  });
}

/** „72,5 kg“ - eine Nachkommastelle, wie gespeichert. */
export function kg(wert: number): string {
  return `${zahl(wert, 1)} kg`;
}

/** „2,8 l“ aus Millilitern. */
export function liter(ml: number): string {
  return `${zahl(ml / 1000, 1)} l`;
}

export const FEHLT_TEXTE: Record<string, string> = {
  weight: 'Gewicht',
  height: 'Größe',
  birth_date: 'Geburtsdatum in den Stammdaten',
  body_fat: 'Körperfettanteil für Katch-McArdle',
};

/** Wie das Energieziel aus dem Gesamtumsatz entsteht (ADR-027 Punkt 18). */
export function energieRegel(z: BerechneteZielwerte): string {
  const e = z.energy;
  switch (e.rule) {
    case 'maintain':
      return 'Halten: Gesamtumsatz';
    case 'deficit':
      return `Abnehmen: −${zahl(Math.abs(e.change_kcal))} kcal am Tag`;
    case 'deficit_capped':
      return `Abnehmen: höchstens ${zahl(e.deficit_max_share * 100)} % des Gesamtumsatzes, −${zahl(Math.abs(e.change_kcal))} kcal am Tag`;
    case 'surplus':
      return `${ZIEL_TEXTE[z.inputs.goal]}: +${zahl(e.change_kcal)} kcal am Tag`;
  }
}

export const EIWEISS_GRUNDLAGE: Record<BerechneteZielwerte['protein']['basis'], string> = {
  standard: 'Erwachsene',
  from_65: 'ab 65 Jahren',
  muscle_or_training: 'Muskelaufbau oder Training',
};

/** „Erteilt am …“ - wer, steht daneben. */
export function einwilligungVon(
  quelle: 'practice' | 'platform',
  vertretung: string | null,
): string | null {
  if (quelle === 'practice') return null;
  return vertretung
    ? `auf der Plattform von ${vertretung} (rechtliche Vertretung)`
    : 'auf der Plattform von der Person selbst';
}

/**
 * Der Wortlaut der Einwilligung „Ernährungsberatung“ auf der Plattform
 * (ADR-027 Punkt 3) - Fassung wie `app.platform_consent_wording_version()`.
 * Geprüft wird er mit den übrigen Einwilligungstexten in B2.
 */
export const ERNAEHRUNG_EINWILLIGUNG =
  'Ich willige ein, dass die Praxis meine Angaben zu Ernährung und Körpergewicht – Profil, Zielwerte, Gewicht und Tagebuch – für die Ernährungsberatung verarbeitet (Art. 9 Abs. 2 lit. a DSGVO). Die Einwilligung ist freiwillig und jederzeit widerrufbar. Nach einem Widerruf wird nichts mehr eingetragen; was mit den bisherigen Angaben geschieht, klärt die Praxis mit mir.';
