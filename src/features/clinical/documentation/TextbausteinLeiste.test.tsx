import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Bausteine from './textbausteine';
import { renderWithProviders } from '@/test-utils';

const fetchTextSnippets = vi.fn();

vi.mock('./textbausteine', async (importOriginal) => ({
  ...(await importOriginal<typeof Bausteine>()),
  fetchTextSnippets: () => fetchTextSnippets() as Promise<Bausteine.TextSnippet[]>,
}));

const { TextbausteinLeiste } = await import('./TextbausteinLeiste');

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

/** Die Schreibseite, auf der die Leiste steht - mit ihrem eigenen Rückweg. */
const SCHREIBSEITE = '/termine/t1/abschluss?zurueck=%2Fkalender';

/**
 * B5 (ANN-531): In der Leiste stehen nur die eigenen Bausteine. Ohne eigene
 * führt ein leiser Link zur Bausteinseite; „+ Befund“ davor stellt die
 * Schreibseite und bleibt, wie er ist.
 */
describe('TextbausteinLeiste', () => {
  beforeEach(() => {
    fetchTextSnippets.mockReset();
  });

  it.each([true, false])(
    'zeigt nur die eigenen Bausteine, nicht die der Praxis (Chips: %s)',
    async (alsChips) => {
      fetchTextSnippets.mockResolvedValue([PRAXIS, EIGEN]);
      renderWithProviders(<TextbausteinLeiste alsChips={alsChips} onEinfuegen={() => {}} />);

      const leiste = await screen.findByRole('group', { name: 'Textbausteine' });
      expect(leiste).toHaveTextContent('Manuelle Therapie');
      expect(screen.getAllByRole('button')).toHaveLength(1);
      expect(screen.queryByText(PRAXIS.title)).toBeNull();
      expect(screen.queryByRole('link')).toBeNull();
    },
  );

  it('fügt den eigenen Baustein mit einem Tap ein', async () => {
    fetchTextSnippets.mockResolvedValue([PRAXIS, EIGEN]);
    const onEinfuegen = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinLeiste alsChips onEinfuegen={onEinfuegen} />);

    await user.click(await screen.findByRole('button', { name: 'Manuelle Therapie' }));
    expect(onEinfuegen).toHaveBeenCalledWith(EIGEN.body, EIGEN.title);
  });

  it.each([true, false])(
    'führt ohne eigene Bausteine zur Bausteinseite, mit dem Rückweg hierher (Chips: %s)',
    async (alsChips) => {
      fetchTextSnippets.mockResolvedValue([PRAXIS]);
      renderWithProviders(
        <TextbausteinLeiste alsChips={alsChips} onEinfuegen={() => {}} />,
        SCHREIBSEITE,
      );

      const link = await screen.findByRole('link', { name: 'Eigene Bausteine anlegen' });
      expect(link).toHaveAttribute(
        'href',
        `/praxis/textbausteine?zurueck=${encodeURIComponent(SCHREIBSEITE)}`,
      );
      // Ein Link, kein Knopf - aber ein Tippziel von 44 px.
      expect(link).toHaveClass('min-h-11', 'underline');
      expect(screen.queryByRole('group', { name: 'Textbausteine' })).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByText(PRAXIS.title)).toBeNull();
    },
  );

  it('führt auch ganz ohne Bausteine zur Bausteinseite', async () => {
    fetchTextSnippets.mockResolvedValue([]);
    renderWithProviders(<TextbausteinLeiste alsChips onEinfuegen={() => {}} />, SCHREIBSEITE);

    expect(
      await screen.findByRole('link', { name: 'Eigene Bausteine anlegen' }),
    ).toBeInTheDocument();
  });

  it('bleibt bei einem Ladefehler still und blockiert nichts', async () => {
    fetchTextSnippets.mockRejectedValue(new Error('kaputt'));
    const { container } = renderWithProviders(
      <TextbausteinLeiste alsChips onEinfuegen={() => {}} />,
    );

    await waitFor(() => expect(screen.queryByTestId('bausteine-platzhalter')).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });
});
