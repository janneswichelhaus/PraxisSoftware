import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { LebensmittelFormular } from './LebensmittelFormular';
import { leereLebensmittelWerte } from './lebensmittel';

// Der Barcode aus dem Scan (ANN-841): behalten ist vorgewählt, abgewählt geht null hinaus, ohne
// Barcode bleibt der Schlüssel weg (der Server lässt den gespeicherten dann stehen).

async function ausfuellen(nutzer: ReturnType<typeof userEvent.setup>) {
  await nutzer.type(screen.getByLabelText('Name'), 'Bäckerbrot');
  await nutzer.type(screen.getByLabelText('Energie (kcal)'), '240');
  await nutzer.type(screen.getByLabelText('Eiweiß (g)'), '9');
  await nutzer.type(screen.getByLabelText('Fett (g)'), '2');
  await nutzer.type(screen.getByLabelText('Kohlenhydrate (g)'), '44');
}

function formular(onSpeichern: ReturnType<typeof vi.fn>, barcode?: string) {
  renderWithProviders(
    <LebensmittelFormular
      beschriftung="Eigenes Lebensmittel anlegen"
      anfang={leereLebensmittelWerte()}
      speichernText="Anlegen"
      laeuft={false}
      onSpeichern={onSpeichern}
      onAbbrechen={vi.fn()}
      barcode={barcode}
    />,
  );
}

describe('Lebensmittelformular mit Barcode', () => {
  it('behält den Barcode, wenn er stehen bleibt', async () => {
    const nutzer = userEvent.setup();
    const onSpeichern = vi.fn();
    formular(onSpeichern, '2009990000012');
    expect(screen.getByLabelText('Barcode behalten')).toBeChecked();
    expect(screen.getByText('2009990000012')).toBeVisible();
    await ausfuellen(nutzer);
    await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(onSpeichern.mock.calls[0]![0]).toMatchObject({ barcode: '2009990000012' });
  });

  it('abgewählt geht null hinaus', async () => {
    const nutzer = userEvent.setup();
    const onSpeichern = vi.fn();
    formular(onSpeichern, '2009990000012');
    await nutzer.click(screen.getByLabelText('Barcode behalten'));
    await ausfuellen(nutzer);
    await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(onSpeichern.mock.calls[0]![0]).toMatchObject({ barcode: null });
  });

  it('ohne Barcode kein Kästchen und kein Schlüssel', async () => {
    const nutzer = userEvent.setup();
    const onSpeichern = vi.fn();
    formular(onSpeichern);
    expect(screen.queryByLabelText('Barcode behalten')).toBeNull();
    await ausfuellen(nutzer);
    await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(onSpeichern.mock.calls[0]![0]).not.toHaveProperty('barcode');
  });
});
