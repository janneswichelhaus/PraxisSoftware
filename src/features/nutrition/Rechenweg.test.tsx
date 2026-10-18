import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { leseZahl } from './eingabe';
import { Zielwertliste } from './Rechenweg';
import { zielwerteSchema } from './zielwerte';

/**
 * Anzeige der Zielwerte (ERN-001, ADR-006 Punkt 14 b): Ergebnis, Formel,
 * Eingaben und Rechenweg aus der Antwort des Servers. Die beiden Antworten
 * unten stammen unverändert aus `app.nutrition_calculation`.
 */

// Mann, 86,4 kg, 178 cm, 69 Jahre, PAL 1,6, abnehmen; Energie von der Beratung
// auf 1500 kcal gesetzt (unter dem Grundumsatz), Zielgewicht 60 kg.
const UEBERSCHRIEBEN = zielwerteSchema.parse({
  bmr: {
    kcal: 1637,
    formula: 'mifflin_st_jeor',
    averaged: false,
    variants: [
      {
        sex: 'male',
        kcal: 1637,
        terms: [
          { input: 'weight_kg', factor: 10 },
          { input: 'height_cm', factor: 6.25 },
          { input: 'age_years', factor: -5 },
        ],
        constant: 5,
      },
    ],
    lean_mass_kg: null,
  },
  fat: { g: 50, share: 0.3, computed_g: 71, kcal_per_g: 9, overridden: false },
  tee: { pal: 1.6, kcal: 2619 },
  water: {
    ml: 3020,
    ml_per_kg: 35,
    minimum_ml: 1500,
    overridden: false,
    computed_ml: 3020,
    floor_applied: false,
  },
  energy: {
    kcal: 1500,
    rule: 'deficit',
    below_bmr: true,
    overridden: true,
    change_kcal: -500,
    computed_kcal: 2119,
    floor_applied: false,
    deficit_max_kcal: 500,
    deficit_max_share: 0.2,
  },
  inputs: {
    pal: 1.6,
    sex: 'male',
    goal: 'lose',
    formula: 'standard',
    age_years: 69,
    height_cm: 178,
    weight_kg: 86.4,
    in_training: false,
    body_fat_percent: null,
  },
  status: 'ok',
  protein: {
    g: 86,
    basis: 'from_65',
    g_per_kg: 1.0,
    computed_g: 86,
    kcal_per_g: 4,
    overridden: false,
  },
  carbohydrate: { g: 177, computed_g: 284, kcal_per_g: 4, overridden: false },
  target_weight: {
    kg: 60,
    weeks: 24,
    floor_kg: 58.7,
    bmi_floor: 18.5,
    below_floor: false,
    kcal_per_kg: 7000,
  },
});

// Ohne Angabe des Geschlechts, mit Körperfett: Cunningham, kein Mittel.
const CUNNINGHAM = zielwerteSchema.parse({
  bmr: {
    kcal: 1688,
    formula: 'cunningham',
    averaged: false,
    variants: [
      { sex: null, kcal: 1688, terms: [{ input: 'lean_mass_kg', factor: 22 }], constant: 500 },
    ],
    lean_mass_kg: 54.0,
  },
  fat: { g: 79, share: 0.3, computed_g: 79, kcal_per_g: 9, overridden: false },
  tee: { pal: 1.4, kcal: 2363 },
  water: {
    ml: 2630,
    ml_per_kg: 35,
    minimum_ml: 1500,
    overridden: false,
    computed_ml: 2630,
    floor_applied: false,
  },
  energy: {
    kcal: 2363,
    rule: 'maintain',
    below_bmr: false,
    overridden: false,
    change_kcal: 0,
    computed_kcal: 2363,
    floor_applied: false,
    deficit_max_kcal: 500,
    deficit_max_share: 0.2,
  },
  inputs: {
    pal: 1.4,
    sex: 'unspecified',
    goal: 'maintain',
    formula: 'standard',
    age_years: 30,
    height_cm: 170,
    weight_kg: 75,
    in_training: false,
    body_fat_percent: 28,
  },
  status: 'ok',
  protein: {
    g: 60,
    basis: 'standard',
    g_per_kg: 0.8,
    computed_g: 60,
    kcal_per_g: 4,
    overridden: false,
  },
  carbohydrate: { g: 353, computed_g: 353, kcal_per_g: 4, overridden: false },
  target_weight: {
    kg: null,
    weeks: null,
    floor_kg: 53.5,
    bmi_floor: 18.5,
    below_floor: false,
    kcal_per_kg: 7000,
  },
});

describe('Zielwertliste (ERN-001)', () => {
  it('zeigt die geltenden Werte und kennzeichnet die Überschreibung', () => {
    render(<Zielwertliste zielwerte={UEBERSCHRIEBEN} />);
    expect(screen.getByText('1500 kcal')).toBeInTheDocument();
    expect(screen.getByText('unter dem Grundumsatz')).toBeInTheDocument();
    expect(screen.getAllByText('von der Beratung gesetzt')).toHaveLength(1);
    // Fett und Kohlenhydrate folgen dem gesetzten Energieziel.
    expect(screen.getByText('50 g')).toBeInTheDocument();
    expect(screen.getByText('177 g')).toBeInTheDocument();
    expect(screen.getByText('3,0 l')).toBeInTheDocument();
    expect(screen.getByText('· rechnerisch etwa 24 Wochen')).toBeInTheDocument();
    // Kein Etikett zum Gewicht, keine Aussage über die Gesundheit.
    expect(screen.queryByText(/Untergewicht|Übergewicht|gesund/i)).toBeNull();
  });

  it('zeigt den Rechenweg mit den Faktoren des Servers', async () => {
    render(<Zielwertliste zielwerte={UEBERSCHRIEBEN} />);
    await userEvent.click(screen.getByText('Rechenweg'));
    expect(
      screen.getByText('10 × 86,4 kg + 6,25 × 178 cm − 5 × 69 Jahre + 5 = 1637 kcal'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1637 kcal × PAL 1,6 · Sitzend mit Bewegung = 2619 kcal/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Abnehmen: −500 kcal am Tag = 2119 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/von der Beratung gesetzt: 1500 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/1,0 g je kg \(ab 65 Jahren\)/)).toBeInTheDocument();
    expect(screen.getByText(/nicht unter BMI 18,5: 58,7 kg bei 178 cm/)).toBeInTheDocument();
  });

  it('rechnet mit Körperfett nach Cunningham und nennt die fettfreie Masse', async () => {
    render(<Zielwertliste zielwerte={CUNNINGHAM} />);
    await userEvent.click(screen.getByText('Rechenweg'));
    expect(screen.getByText('Grundumsatz nach Cunningham')).toBeInTheDocument();
    expect(
      screen.getByText(/fettfreie Masse = 75,0 kg × \(1 − 28,0 %\) = 54,0 kg/),
    ).toBeInTheDocument();
    expect(screen.getByText('500 + 22 × 54,0 kg = 1688 kcal')).toBeInTheDocument();
    expect(screen.queryByText(/Mittel beider Varianten/)).toBeNull();
  });

  it('sagt, was für die Rechnung fehlt', () => {
    render(
      <Zielwertliste zielwerte={{ status: 'missing', missing: ['birth_date', 'body_fat'] }} />,
    );
    expect(
      screen.getByText(
        'Für Zielwerte fehlt noch: Geburtsdatum in den Stammdaten, Körperfettanteil für Katch-McArdle.',
      ),
    ).toBeInTheDocument();
  });
});

describe('leseZahl', () => {
  it('liest Komma und Punkt, leer ist keine Angabe', () => {
    expect(leseZahl('72,5')).toBe(72.5);
    expect(leseZahl(' 72.5 ')).toBe(72.5);
    expect(leseZahl('')).toBeNull();
    expect(leseZahl('abc')).toBeNull();
  });
});
