import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { useAbmeldeanfrage } from './abmeldeschutz';
import { AbmeldeschutzProvider } from './AbmeldeschutzProvider';
import { AbstecherAbmeldewache } from './AbstecherAbmeldewache';
import { abstecherAblegen, abstecherOffen, alleAbstecherVerwerfen } from '@/lib/abstecher';

/** Kein stilles Verwerfen eines Abstecher-Entwurfs beim Abmelden (ABN-019, BEF-110). */

function Kopfzeile() {
  const anfragen = useAbmeldeanfrage();
  return (
    <button type="button" onClick={() => anfragen?.()}>
      Abmelden
    </button>
  );
}

function zeigen(onAbmelden: () => void) {
  renderWithProviders(
    <AbmeldeschutzProvider onAbmelden={onAbmelden}>
      <AbstecherAbmeldewache userId="anna" />
      <Kopfzeile />
    </AbmeldeschutzProvider>,
  );
}

describe('AbstecherAbmeldewache', () => {
  afterEach(() => alleAbstecherVerwerfen());

  it('meldet ohne Entwurf sofort ab', async () => {
    const abmelden = vi.fn();
    zeigen(abmelden);
    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(abmelden).toHaveBeenCalledTimes(1);
  });

  it('fragt bei einem Entwurf und behält ihn bei „Zurück“', async () => {
    abstecherAblegen('v1', 'anna', { werte: {} });
    const abmelden = vi.fn();
    zeigen(abmelden);
    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(screen.getByRole('dialog', { name: 'Angefangenes Formular' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(abmelden).not.toHaveBeenCalled();
    expect(abstecherOffen('anna')).toBe(true);
  });

  it('verwirft nur nach ausdrücklicher Antwort, und nur die eigenen Entwürfe', async () => {
    abstecherAblegen('v1', 'anna', { werte: {} });
    abstecherAblegen('v2', 'bert', { werte: {} });
    const abmelden = vi.fn();
    zeigen(abmelden);
    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen und abmelden' }));
    expect(abmelden).toHaveBeenCalledTimes(1);
    expect(abstecherOffen('anna')).toBe(false);
    expect(abstecherOffen('bert')).toBe(true);
  });
});
