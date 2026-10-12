import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { speicherImSpeicher, speicherSetzen } from '@/lib/geraeteablage';
import { DiensttelefonAbschnitt } from './DiensttelefonAbschnitt';
import { GERAETEVORGABE, einrichtungLesen } from './servicePhone';

/** OFF-001: Einschalten nur mit der ganzen Gerätevorgabe (ADR-024 Punkt 6). */

beforeEach(() => {
  speicherSetzen(speicherImSpeicher());
});

describe('DiensttelefonAbschnitt', () => {
  it('schaltet erst ein, wenn jede Zeile der Gerätevorgabe bestätigt ist', async () => {
    const user = userEvent.setup();
    render(<DiensttelefonAbschnitt besitzer="anna" />);
    const knopf = await screen.findByRole('button', { name: 'Auf diesem Gerät einschalten' });
    expect(knopf).toBeDisabled();
    const kaesten = screen.getAllByRole('checkbox');
    expect(kaesten).toHaveLength(GERAETEVORGABE.length);
    for (const k of kaesten.slice(0, -1)) await user.click(k);
    expect(knopf).toBeDisabled();
    await user.click(kaesten.at(-1)!);
    await user.click(knopf);
    expect(await screen.findByText(/Auf diesem Gerät eingeschaltet seit/)).toBeInTheDocument();
    expect(await einrichtungLesen('anna')).not.toBeNull();
  });

  it('lässt nicht ausschalten, solange Entwürfe nur auf dem Gerät liegen', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DiensttelefonAbschnitt besitzer="anna" />);
    for (const k of await screen.findAllByRole('checkbox')) await user.click(k);
    await user.click(screen.getByRole('button', { name: 'Auf diesem Gerät einschalten' }));
    rerender(<DiensttelefonAbschnitt besitzer="anna" wartend={2} />);
    expect(await screen.findByText(/2 Entwürfe liegen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auf diesem Gerät ausschalten' })).toBeDisabled();
    rerender(<DiensttelefonAbschnitt besitzer="anna" wartend={0} />);
    await user.click(screen.getByRole('button', { name: 'Auf diesem Gerät ausschalten' }));
    expect(
      await screen.findByRole('button', { name: 'Auf diesem Gerät einschalten' }),
    ).toBeInTheDocument();
    expect(await einrichtungLesen('anna')).toBeNull();
  });
});
