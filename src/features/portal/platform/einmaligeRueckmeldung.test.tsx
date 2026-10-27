import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import { useEinmaligeRueckmeldung } from './einmaligeRueckmeldung';

function Probe() {
  const gesendet = useEinmaligeRueckmeldung('gesendet');
  const { search } = useLocation();
  return (
    <>
      <p data-testid="wert">{gesendet ?? 'nichts'}</p>
      <p data-testid="adresse">{search}</p>
    </>
  );
}

describe('useEinmaligeRueckmeldung (DR-160)', () => {
  it('zeigt die Bestätigung und nimmt ihren Parameter aus der Adresse', async () => {
    renderWithProviders(<Probe />, '/p/termine?bereich=treatment&gesendet=1');
    expect(screen.getByTestId('wert')).toHaveTextContent('1');
    // Der Bereich bleibt, die Bestätigung reist nicht weiter.
    await waitFor(() =>
      expect(screen.getByTestId('adresse')).toHaveTextContent(/^\?bereich=treatment$/),
    );
    expect(screen.getByTestId('wert')).toHaveTextContent('1');
  });

  it('bleibt leer, wenn nichts gesendet wurde', () => {
    renderWithProviders(<Probe />, '/p/termine?bereich=treatment');
    expect(screen.getByTestId('wert')).toHaveTextContent('nichts');
    expect(screen.getByTestId('adresse')).toHaveTextContent(/^\?bereich=treatment$/);
  });
});
