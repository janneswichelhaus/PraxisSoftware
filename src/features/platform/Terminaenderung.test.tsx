import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Plattformzugang, Termin } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Termin ändern oder absagen (POR-010, DSN-001 4.1, D4): zwei Knöpfe, der
 * Hinweis zum Ausfallhonorar vor dem Senden - unter 24 Stunden deutlich -,
 * und beides geht als Wunsch an den Server, nie als Absage.
 */

const ladeTermine = vi.fn();
const terminAendernWuenschen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeTermine: (...args: unknown[]) => ladeTermine(...args) as Promise<Termin[]>,
  terminAendernWuenschen: (...args: unknown[]) =>
    terminAendernWuenschen(...args) as Promise<string>,
}));

const { Terminaenderung } = await import('./Terminaenderung');
const { WUNSCHTAGE } = await import('./Wunschfelder');
const { naechsteWerktage, wochentagMitDatum } = await import('./zeit');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

function inStunden(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

const TERMIN: Termin = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  starts_at: inStunden(72),
  ends_at: inStunden(73),
  appointment_type: 'home_visit',
  status: 'confirmed',
  staff_name: 'Anna Beispiel',
  location_name: null,
  visit_street: 'Testweg',
  visit_house_number: '7',
  visit_postal_code: '72072',
  visit_city: 'Tuebingen',
  late_notice: false,
  open_request_kind: null,
};

function zeige(termin: Termin, pfad = `/p/termine/${termin.id}?bereich=treatment`) {
  ladeTermine.mockResolvedValue([termin]);
  return renderWithProviders(<Terminaenderung zugang={ZUGANG} />, pfad);
}

beforeEach(() => {
  vi.clearAllMocks();
  terminAendernWuenschen.mockResolvedValue('dddddddd-dddd-4ddd-8ddd-000000000001');
});

describe('Terminaenderung (POR-010)', () => {
  it('zeigt den Termin und die zwei Knoepfe', async () => {
    zeige(TERMIN);
    expect(await screen.findByRole('button', { name: 'Termin ändern' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Termin absagen' })).toBeInTheDocument();
    expect(
      screen.getByText('Hausbesuch · Anna Beispiel kommt zu Ihnen', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Zu den Terminen' })).toHaveAttribute(
      'href',
      '/p/termine?bereich=treatment',
    );
  });

  it('sagt vor dem Absagewunsch rechtzeitig, dass kein Ausfallhonorar entsteht', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN);
    await nutzer.click(await screen.findByRole('button', { name: 'Termin absagen' }));
    expect(screen.getByRole('status')).toHaveTextContent('kein Ausfallhonorar');
    expect(screen.getByText(/Als Eingang Ihrer Absage gilt der Zeitpunkt/)).toBeInTheDocument();
    await nutzer.type(screen.getByLabelText(/etwas mitteilen/), 'Bin verreist.');
    await nutzer.click(screen.getByRole('button', { name: 'Absagewunsch senden' }));
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith({
        zugangId: ZUGANG.access_id,
        terminId: TERMIN.id,
        art: 'cancel',
        tage: [],
        zeiten: [],
        notiz: 'Bin verreist.',
      }),
    );
  });

  it('warnt unter 24 Stunden deutlich vor dem Ausfallhonorar (ADR-018 Punkt 8)', async () => {
    const nutzer = userEvent.setup();
    zeige({ ...TERMIN, starts_at: inStunden(20), ends_at: inStunden(21), late_notice: true });
    await nutzer.click(await screen.findByRole('button', { name: 'Termin absagen' }));
    const hinweis = screen.getByRole('status');
    expect(hinweis).toHaveTextContent('weniger als 24 Stunden');
    expect(hinweis).toHaveTextContent('berechnen wir ein Ausfallhonorar');
    // Der Hinweis steht vor dem Knopf (BEF-079 darf hier nicht entstehen).
    const knopf = screen.getByRole('button', { name: 'Absagewunsch senden' });
    expect(hinweis.compareDocumentPosition(knopf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sendet einen Aenderungswunsch mit Tagen und Tageszeit', async () => {
    const nutzer = userEvent.setup();
    zeige(TERMIN);
    await nutzer.click(await screen.findByRole('button', { name: 'Termin ändern' }));
    const [erster] = naechsteWerktage(WUNSCHTAGE);
    await nutzer.click(screen.getByRole('checkbox', { name: wochentagMitDatum(erster!) }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Vormittag' }));
    await nutzer.click(screen.getByRole('button', { name: 'Änderungswunsch senden' }));
    await waitFor(() =>
      expect(terminAendernWuenschen).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'change', tage: [erster], zeiten: ['morning'] }),
      ),
    );
  });

  it('zeigt bei offenem Wunsch keine Knoepfe mehr', async () => {
    zeige({ ...TERMIN, open_request_kind: 'cancel' });
    expect(await screen.findByText(/Ihr Absagewunsch ist bei der Praxis/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Termin absagen' })).not.toBeInTheDocument();
  });

  it('laesst einen vergangenen oder abgesagten Termin nicht aendern', async () => {
    zeige({ ...TERMIN, status: 'cancelled', late_notice: null });
    expect(await screen.findByText(/lässt sich hier nicht mehr ändern/)).toBeInTheDocument();
  });

  it('zeigt die Abweisung des Servers als Satz', async () => {
    const nutzer = userEvent.setup();
    terminAendernWuenschen.mockRejectedValue(
      new Error('Zu diesem Termin liegt schon ein Wunsch vor. Die Praxis meldet sich.'),
    );
    zeige(TERMIN);
    await nutzer.click(await screen.findByRole('button', { name: 'Termin absagen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Absagewunsch senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('schon ein Wunsch vor');
  });
});
