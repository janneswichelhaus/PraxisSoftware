import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { leererPlan } from './plaene';
import { PlanFormular } from './PlanFormular';
import type { Rezept } from './rezepte';

const BREI: Rezept = {
  kind: 'recipe',
  id: '0b6a2f2e-0000-4000-8000-0000000000aa',
  owner: 'practice',
  name: 'Haferbrei mit Beeren',
  servings: 2,
  instructions: null,
  base_unit: 'g',
  ingredients: [],
  total_amount: 600,
  per_portion: { energy_kcal: 311, protein_g: 12, fat_g: 6, carbohydrate_g: 49 },
  per_100: {
    energy_kcal: 103.7,
    protein_g: 4,
    fat_g: 2,
    carbohydrate_g: 16.3,
    sugar_g: null,
    fibre_g: null,
    saturated_fat_g: null,
    salt_g: null,
  },
  portions: [{ label: '1 Portion', amount: 300 }],
  starter_key: null,
  updated_at: '2026-11-06T10:00:00Z',
};

function formular(onSpeichern = vi.fn()) {
  renderWithProviders(
    <PlanFormular
      beschriftung="Plan zuweisen"
      anfang={leererPlan('Tagesvorschlag')}
      speichernText="Zuweisen"
      laeuft={false}
      onSpeichern={onSpeichern}
      onAbbrechen={vi.fn()}
      rezepte={[BREI]}
      suchen={() => Promise.resolve([])}
      schluessel={['test', 'plan']}
      ziel={1700}
    />,
  );
  return onSpeichern;
}

describe('Planformular (ADR-027 Punkt 14)', () => {
  it('nimmt ein Rezept der Praxis in drei Tipps zum Frühstück, kopiert den Tag und weist zu', async () => {
    const nutzer = userEvent.setup();
    const onSpeichern = formular();
    expect(screen.getByText(/Tag 1 · 0\skcal · Ziel 1700\skcal/)).toBeVisible();

    await nutzer.click(screen.getByRole('button', { name: 'Frühstück hinzufügen' }));
    await nutzer.click(screen.getByRole('button', { name: /^Haferbrei mit Beeren/ }));
    const fenster = screen.getByRole('dialog');
    // Ein Rezept nur in Portionen, ohne Gramm.
    expect(within(fenster).queryByText('Gramm')).toBeNull();
    await nutzer.click(within(fenster).getByRole('button', { name: 'Hinzufügen' }));

    const fruehstueck = screen.getByRole('list', { name: 'Frühstück' });
    expect(within(fruehstueck).getByText(/^1 Portion · 311\skcal$/)).toBeVisible();
    expect(screen.getByText(/Tag 1 · 311\skcal/)).toBeVisible();

    await nutzer.click(screen.getByRole('button', { name: 'Tag kopieren' }));
    expect(screen.getByRole('button', { name: 'Tag 2', pressed: true })).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Frühstück' })).getByText('Haferbrei mit Beeren'),
    ).toBeVisible();

    await nutzer.click(screen.getByRole('button', { name: 'Zuweisen' }));
    expect(onSpeichern.mock.calls[0]![0]).toEqual({
      title: 'Tagesvorschlag',
      days: [
        { breakfast: [{ kind: 'recipe', id: BREI.id, portion_count: 1 }] },
        { breakfast: [{ kind: 'recipe', id: BREI.id, portion_count: 1 }] },
      ],
    });
  });

  it('ohne Rezept oder Lebensmittel weist es nicht zu und sagt warum', async () => {
    const nutzer = userEvent.setup();
    const onSpeichern = formular();
    await nutzer.click(screen.getByRole('button', { name: 'Zuweisen' }));
    expect(onSpeichern).not.toHaveBeenCalled();
    expect(
      screen.getAllByText('Bitte mindestens ein Rezept oder Lebensmittel hinzufügen.').length,
    ).toBeGreaterThan(0);
  });

  it('entfernt eine Position und einen Tag', async () => {
    const nutzer = userEvent.setup();
    const onSpeichern = formular();
    await nutzer.click(screen.getByRole('button', { name: 'Snacks hinzufügen' }));
    await nutzer.click(screen.getByRole('button', { name: /^Haferbrei mit Beeren/ }));
    await nutzer.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Hinzufügen' }),
    );
    await nutzer.click(screen.getByRole('button', { name: 'Tag hinzufügen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Tag entfernen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Haferbrei mit Beeren entfernen' }));
    expect(screen.queryByRole('list', { name: 'Snacks' })).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Zuweisen' }));
    expect(onSpeichern).not.toHaveBeenCalled();
  });
});
