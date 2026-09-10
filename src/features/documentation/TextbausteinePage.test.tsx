import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Bausteine from './textbausteine';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchTextSnippets = vi.fn();
const createTextSnippet = vi.fn();
const updateTextSnippet = vi.fn();
const deleteTextSnippet = vi.fn();

vi.mock('./textbausteine', async (importOriginal) => {
  const actual = await importOriginal<typeof Bausteine>();
  return {
    ...actual,
    fetchTextSnippets: () => fetchTextSnippets() as Promise<Bausteine.TextSnippet[]>,
    createTextSnippet: (...args: unknown[]) => createTextSnippet(...args) as Promise<string>,
    updateTextSnippet: (...args: unknown[]) => updateTextSnippet(...args) as Promise<void>,
    deleteTextSnippet: (...args: unknown[]) => deleteTextSnippet(...args) as Promise<void>,
  };
});

const { TextbausteinePage } = await import('./TextbausteinePage');

const PRAXIS: Bausteine.TextSnippet = {
  id: 'b1',
  title: 'Hausbesuch durchgefuehrt',
  body: 'Hausbesuch wie vereinbart durchgefuehrt.',
  shared: true,
  editable: false,
};

const EIGEN: Bausteine.TextSnippet = {
  id: 'b2',
  title: 'Manuelle Therapie',
  body: 'Manuelle Techniken angewendet.',
  shared: false,
  editable: true,
};

/**
 * Ohne diese Seite bliebe die Bausteinleiste leer (UX-008). Geprüft wird der
 * Rollenschnitt: die beiden Geltungsbereiche sind sichtbar getrennt, und wer
 * einen praxisweiten Baustein nicht ändern darf, bekommt dafür auch keine
 * Schaltfläche — die Serverfunktion weist ihn ohnehin ab.
 */
describe('TextbausteinePage', () => {
  beforeEach(() => {
    fetchTextSnippets.mockReset();
    createTextSnippet.mockReset();
    updateTextSnippet.mockReset();
    deleteTextSnippet.mockReset();
    fetchTextSnippets.mockResolvedValue([PRAXIS, EIGEN]);
    createTextSnippet.mockResolvedValue('neu');
    updateTextSnippet.mockResolvedValue(undefined);
    deleteTextSnippet.mockResolvedValue(undefined);
  });

  it('trennt Bausteine der Praxis von den eigenen', async () => {
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    const praxis = (await screen.findByRole('heading', { name: 'Bausteine der Praxis' })).closest(
      'section',
    )!;
    const eigene = screen.getByRole('heading', { name: 'Meine Bausteine' }).closest('section')!;

    expect(within(praxis).getByText('Hausbesuch durchgefuehrt')).toBeInTheDocument();
    expect(within(eigene).getByText('Manuelle Therapie')).toBeInTheDocument();
  });

  it('kennzeichnet den Geltungsbereich als Text, nicht als Farbe', async () => {
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);
    expect(await screen.findByText('Praxis')).toBeInTheDocument();
    expect(screen.getByText('Nur ich')).toBeInTheDocument();
  });

  it('bietet einem therapist keine Aenderung am Baustein der Praxis an', async () => {
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    const praxis = (await screen.findByRole('heading', { name: 'Bausteine der Praxis' })).closest(
      'section',
    )!;
    expect(within(praxis).queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
    expect(within(praxis).getByText(/pflegt die Praxisleitung/)).toBeInTheDocument();
  });

  it('bietet dem owner die Wahl des Geltungsbereichs beim Anlegen', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TextbausteinePage user={testUser(['owner', 'therapist'], 'Jannes Test')} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Baustein anlegen' }));
    expect(screen.getByLabelText(/Baustein der Praxis/)).toBeInTheDocument();
  });

  it('bietet einem therapist die Wahl des Geltungsbereichs nicht an', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    await user.click(await screen.findByRole('button', { name: 'Baustein anlegen' }));
    expect(screen.queryByLabelText(/Baustein der Praxis/)).toBeNull();
  });

  it('legt einen persoenlichen Baustein an', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    await user.click(await screen.findByRole('button', { name: 'Baustein anlegen' }));
    await user.type(screen.getByLabelText('Titel *'), 'Neuer Baustein');
    await user.type(screen.getByLabelText('Text *'), 'Neuer Text');
    await user.click(screen.getByRole('button', { name: 'Baustein anlegen' }));

    await waitFor(() =>
      expect(createTextSnippet).toHaveBeenCalledWith('Neuer Baustein', 'Neuer Text', false),
    );
  });

  it('haelt eine leere Eingabe inline auf und schreibt nicht', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    await user.click(await screen.findByRole('button', { name: 'Baustein anlegen' }));
    await user.click(screen.getByRole('button', { name: 'Baustein anlegen' }));

    expect(await screen.findByText('Ein Titel ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Der Baustein darf nicht leer sein.')).toBeInTheDocument();
    expect(createTextSnippet).not.toHaveBeenCalled();
  });

  it('fragt vor dem Loeschen nach', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(
      await screen.findByRole('group', { name: /Baustein .Manuelle Therapie. löschen/ }),
    ).toBeInTheDocument();
    expect(deleteTextSnippet).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Ja, Baustein löschen' }));
    await waitFor(() => expect(deleteTextSnippet).toHaveBeenCalledWith(EIGEN.id));
  });

  it('sagt beim Loeschen, dass geschriebene Dokumentation unberuehrt bleibt', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(await screen.findByText(/bleibt davon unberührt/)).toBeInTheDocument();
  });

  it('ist fuer office nicht freigegeben und fragt nichts ab', async () => {
    renderWithProviders(<TextbausteinePage user={testUser(['office'], 'Olivia Office')} />);
    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    expect(fetchTextSnippets).not.toHaveBeenCalled();
  });
});
