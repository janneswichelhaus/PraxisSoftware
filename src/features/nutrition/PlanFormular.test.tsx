import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { leererPlan } from './plaene';
import { PlanFormular } from './PlanFormular';
import type { Rezept } from './rezepte';
import type { Startrezept } from './startrezepte';

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

const LINSEN: Startrezept = {
  schluessel: 'linsensalat-paprika',
  name: 'Linsensalat mit Paprika',
  portionen: 2,
  zutaten: [{ suche: 'Linsen gekocht', menge: 300 }],
  zubereitung: 'Mischen.',
};

function formular(
  onSpeichern = vi.fn(),
  mitgeliefert?: { liste: Startrezept[]; uebernehmen: (s: Startrezept) => Promise<Rezept> },
) {
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
      {...(mitgeliefert ? { mitgeliefert } : {})}
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
    expect(screen.getByText('Tag 2 von 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nächster Tag' })).toBeDisabled();
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
    // Ein leerer Tag geht ohne Rückfrage.
    await nutzer.click(screen.getByRole('button', { name: 'Tag entfernen' }));
    expect(screen.queryByText(/von 2$/)).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Haferbrei mit Beeren entfernen' }));
    expect(screen.queryByRole('list', { name: 'Snacks' })).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Zuweisen' }));
    expect(onSpeichern).not.toHaveBeenCalled();
  });

  it('blättert durch sieben Tage; ein Tag mit Mahlzeiten geht nur nach einer Rückfrage', async () => {
    const nutzer = userEvent.setup();
    formular();
    await nutzer.click(screen.getByRole('button', { name: 'Frühstück hinzufügen' }));
    await nutzer.click(screen.getByRole('button', { name: /^Haferbrei mit Beeren/ }));
    await nutzer.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Hinzufügen' }),
    );
    for (let i = 0; i < 6; i += 1) {
      await nutzer.click(screen.getByRole('button', { name: 'Tag kopieren' }));
    }
    expect(screen.getByText('Tag 7 von 7')).toBeVisible();
    // Mehr als sieben Tage gibt es nicht.
    expect(screen.queryByRole('button', { name: 'Tag kopieren' })).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Vorheriger Tag' }));
    expect(screen.getByText('Tag 6 von 7')).toBeVisible();

    await nutzer.click(screen.getByRole('button', { name: 'Tag entfernen' }));
    expect(
      screen.getByText('Tag 6 mit seinen Mahlzeiten wird aus dem Plan genommen.'),
    ).toBeVisible();
    await nutzer.click(screen.getAllByRole('button', { name: 'Tag entfernen' }).at(-1)!);
    expect(screen.getByText('Tag 5 von 6')).toBeVisible();
  });

  it('ein mitgeliefertes Rezept wird beim Wählen übernommen und steht dann im Plan', async () => {
    const nutzer = userEvent.setup();
    const uebernommen: Rezept = {
      ...BREI,
      id: 'neu-linsen',
      name: LINSEN.name,
      starter_key: LINSEN.schluessel,
    };
    const uebernehmen = vi.fn().mockResolvedValue(uebernommen);
    const onSpeichern = formular(vi.fn(), { liste: [LINSEN], uebernehmen });
    await nutzer.click(screen.getByRole('button', { name: 'Mittagessen hinzufügen' }));
    await nutzer.click(screen.getByText('Mitgelieferte Rezepte'));
    await nutzer.click(screen.getByRole('button', { name: /^Linsensalat mit Paprika/ }));
    expect(uebernehmen).toHaveBeenCalledWith(LINSEN);
    const fenster = await screen.findByRole('dialog', { name: 'Linsensalat mit Paprika' });
    await nutzer.click(within(fenster).getByRole('button', { name: 'Hinzufügen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Zuweisen' }));
    expect(onSpeichern.mock.calls[0]![0]).toEqual({
      title: 'Tagesvorschlag',
      days: [{ lunch: [{ kind: 'recipe', id: 'neu-linsen', portion_count: 1 }] }],
    });
  });

  it('lässt sich ein mitgeliefertes Rezept nicht übernehmen, sagt es warum und bleibt in der Auswahl', async () => {
    const nutzer = userEvent.setup();
    const uebernehmen = vi
      .fn()
      .mockRejectedValue(
        new Error('„Linsensalat mit Paprika“ bitte unter Rezepte prüfen und übernehmen.'),
      );
    formular(vi.fn(), { liste: [LINSEN], uebernehmen });
    await nutzer.click(screen.getByRole('button', { name: 'Mittagessen hinzufügen' }));
    await nutzer.click(screen.getByText('Mitgelieferte Rezepte'));
    await nutzer.click(screen.getByRole('button', { name: /^Linsensalat mit Paprika/ }));
    expect(
      await screen.findByText(
        '„Linsensalat mit Paprika“ bitte unter Rezepte prüfen und übernehmen.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Mittagessen · Tag 1' })).toBeVisible();
  });

  it('ein schon übernommenes mitgeliefertes Rezept steht nur bei der Praxis', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <PlanFormular
        beschriftung="Plan zuweisen"
        anfang={leererPlan('Tagesvorschlag')}
        speichernText="Zuweisen"
        laeuft={false}
        onSpeichern={vi.fn()}
        onAbbrechen={vi.fn()}
        rezepte={[{ ...BREI, starter_key: 'haferbrei-beeren' }]}
        suchen={() => Promise.resolve([])}
        schluessel={['test', 'plan']}
        mitgeliefert={{
          liste: [{ ...LINSEN, schluessel: 'haferbrei-beeren', name: BREI.name }, LINSEN],
          uebernehmen: vi.fn(),
        }}
      />,
    );
    await nutzer.click(screen.getByRole('button', { name: 'Frühstück hinzufügen' }));
    await nutzer.click(screen.getByText('Mitgelieferte Rezepte'));
    const liste = screen.getByRole('list', { name: 'Mitgelieferte Rezepte' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(1);
    expect(within(liste).getByText('Linsensalat mit Paprika')).toBeVisible();
  });
});
