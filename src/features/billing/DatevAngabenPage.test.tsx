import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DatevApi from './datev-api';
import { testUser } from '@/test-utils';
import { zeigeMitRouten } from './testumgebung';

const fetchDatevEinstellungen = vi.fn();
const speichereDatevEinstellungen = vi.fn();

vi.mock('./datev-api', async (importOriginal) => {
  const actual = await importOriginal<typeof DatevApi>();
  return {
    ...actual,
    fetchDatevEinstellungen: () => fetchDatevEinstellungen() as Promise<unknown>,
    speichereDatevEinstellungen: (...a: unknown[]) =>
      speichereDatevEinstellungen(...a) as Promise<void>,
  };
});

const { DatevAngabenPage } = await import('./DatevAngabenPage');
const { pruefeDatevAngaben } = await import('./datev');

function seite(rollen: Parameters<typeof testUser>[0] = ['owner']) {
  return zeigeMitRouten(
    [
      {
        path: '/abrechnung/steuerberatung/angaben',
        element: <DatevAngabenPage user={testUser(rollen)} />,
      },
      { path: '/abrechnung/steuerberatung', element: <p>Steuerberatung</p> },
    ],
    '/abrechnung/steuerberatung/angaben',
  );
}

describe('DatevAngabenPage', () => {
  beforeEach(() => {
    fetchDatevEinstellungen.mockReset();
    speichereDatevEinstellungen.mockReset();
    fetchDatevEinstellungen.mockResolvedValue(null);
    speichereDatevEinstellungen.mockResolvedValue(undefined);
  });

  it('belegt den Kontenrahmen nicht vor und nennt alle fehlenden Angaben', async () => {
    seite();
    const rahmen = await screen.findByLabelText('Kontenrahmen *');
    expect(rahmen).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getAllByText('Vier- bis siebenstellig, ab 1001.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mindestens eine Mandantennummer.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bitte wählen.').length).toBeGreaterThan(0);
    expect(speichereDatevEinstellungen).not.toHaveBeenCalled();
  });

  it('speichert und führt zurück zur Steuerberatung', async () => {
    const { router } = seite();
    await userEvent.type(await screen.findByLabelText('Beraternummer *'), '29098');
    await userEvent.type(screen.getByLabelText('Mandantennummer Behandlung'), '55003');
    await userEvent.selectOptions(screen.getByLabelText('Kontenrahmen *'), 'SKR04');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Steuerberatung')).toBeInTheDocument();
    expect(speichereDatevEinstellungen).toHaveBeenCalledWith({
      consultant_number: 29098,
      client_number_therapy: 55003,
      client_number_training: null,
      chart_of_accounts: 'SKR04',
    });
    expect(router.state.location.pathname).toBe('/abrechnung/steuerberatung');
  });

  it('zeigt dem Office kein Formular', async () => {
    seite(['office']);
    expect(await screen.findByText('Ändern kann sie die Praxisinhaber:in.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument();
  });
});

describe('pruefeDatevAngaben', () => {
  it('hält die Grenzen des Servers', () => {
    const gut = { berater: '1001', therapie: '1', training: '', rahmen: 'SKR03' } as const;
    expect(pruefeDatevAngaben(gut)).toEqual({});
    expect(pruefeDatevAngaben({ ...gut, berater: '1000' })).toHaveProperty('berater');
    expect(pruefeDatevAngaben({ ...gut, training: '100000' })).toHaveProperty('training');
    expect(pruefeDatevAngaben({ ...gut, training: 'abc' })).toHaveProperty('training');
  });
});
