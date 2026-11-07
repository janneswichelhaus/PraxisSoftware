import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import type { Lebensmittel } from './lebensmittel';
import { RezeptFormular } from './RezeptFormular';
import { leereRezeptWerte } from './rezepte';

const HAFER: Lebensmittel = {
  kind: 'catalog',
  id: '0b6a2f2e-0000-4000-8000-000000000001',
  source: 'bls',
  name: 'Haferflocken',
  brand: null,
  base_unit: 'g',
  per_100: {
    energy_kcal: 370,
    protein_g: 13.5,
    fat_g: 7,
    carbohydrate_g: 58.7,
    sugar_g: 1.2,
    fibre_g: 10,
    saturated_fat_g: 1.3,
    salt_g: 0,
  },
  portions: [
    { label: '1 Esslöffel', amount: 10 },
    { label: '1 Portion', amount: 50 },
  ],
};

function formular(onSpeichern = vi.fn(), zusatz?: { starter_key: string }) {
  renderWithProviders(
    <RezeptFormular
      beschriftung="Rezept anlegen"
      anfang={leereRezeptWerte()}
      speichernText="Anlegen"
      laeuft={false}
      onSpeichern={onSpeichern}
      onAbbrechen={vi.fn()}
      suchen={() => Promise.resolve([HAFER])}
      schluessel={['test', 'rezept']}
      {...(zusatz ? { zusatz } : {})}
    />,
  );
  return onSpeichern;
}

describe('Rezeptformular (ERN-016)', () => {
  it('fügt eine Zutat aus der Suche hinzu, zeigt die Vorschau und speichert Lebensmittel und Menge', async () => {
    const nutzer = userEvent.setup();
    const onSpeichern = formular();
    await nutzer.type(screen.getByLabelText('Name'), 'Porridge');
    await nutzer.clear(screen.getByLabelText('Portionen'));
    await nutzer.type(screen.getByLabelText('Portionen'), '1');

    await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await nutzer.type(screen.getByLabelText('Lebensmittel suchen'), 'Hafer');
    await nutzer.click(await screen.findByRole('button', { name: /^Haferflocken/ }));
    const fenster = screen.getByRole('dialog');
    // Vorbelegt mit der ersten Portion; zwei Portionen sind 100 g.
    await nutzer.click(within(fenster).getByRole('radio', { name: '1 Portion' }));
    await nutzer.clear(within(fenster).getByLabelText('Anzahl'));
    await nutzer.type(within(fenster).getByLabelText('Anzahl'), '2');
    expect(within(fenster).getByText(/^370\skcal$/)).toBeVisible();
    await nutzer.click(within(fenster).getByRole('button', { name: 'Hinzufügen' }));

    // Zurück im Formular: die Zutat mit Menge und Energie, darunter die Vorschau je Portion.
    const zutaten = screen.getByRole('list', { name: 'Zutaten' });
    expect(within(zutaten).getByText('Haferflocken')).toBeVisible();
    expect(within(zutaten).getByText(/^2 × 1 Portion · 100 g · 370\skcal$/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Je Portion' })).toBeVisible();

    await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(onSpeichern.mock.calls[0]![0]).toEqual({
      name: 'Porridge',
      servings: 1,
      instructions: null,
      ingredients: [
        { food_kind: 'catalog', food_id: HAFER.id, portion_label: '1 Portion', portion_count: 2 },
      ],
    });
  });

  it('ohne Zutat speichert es nicht und nennt den Grund', async () => {
    const nutzer = userEvent.setup();
    const onSpeichern = formular();
    await nutzer.type(screen.getByLabelText('Name'), 'Leer');
    await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(onSpeichern).not.toHaveBeenCalled();
    expect(screen.getAllByText('Bitte mindestens eine Zutat hinzufügen.').length).toBeGreaterThan(
      0,
    );
  });

  it('entfernt eine Zutat mit einem Tipp und schickt den Schlüssel eines mitgelieferten Rezepts mit', async () => {
    const nutzer = userEvent.setup();
    const onSpeichern = formular(vi.fn(), { starter_key: 'porridge' });
    await nutzer.type(screen.getByLabelText('Name'), 'Porridge');
    for (let i = 0; i < 2; i += 1) {
      await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen' }));
      await nutzer.click(await screen.findByRole('button', { name: /^Haferflocken/ }));
      await nutzer.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Hinzufügen' }),
      );
    }
    const entfernen = screen.getAllByRole('button', { name: 'Haferflocken entfernen' });
    expect(entfernen).toHaveLength(2);
    await nutzer.click(entfernen[0]!);
    await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(onSpeichern.mock.calls[0]![0]).toMatchObject({
      starter_key: 'porridge',
      ingredients: [{ food_id: HAFER.id, portion_label: '1 Esslöffel', portion_count: 1 }],
    });
  });
});
