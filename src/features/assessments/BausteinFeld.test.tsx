import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { BausteinFeld } from './BausteinFeld';
import { useBausteinAuswahl } from './bausteinauswahl';

/**
 * Das Bausteinfeld mit der Bibliothek des Releases (FRB-003b). Die Texte der
 * Tests stammen aus den Definitionsdateien; der Code kennt sie nicht.
 */
function Feld({
  onUebernehmen,
  gesperrt = false,
}: {
  onUebernehmen: (text: string) => void;
  gesperrt?: boolean;
}) {
  const bausteine = useBausteinAuswahl();
  return <BausteinFeld bausteine={bausteine} onUebernehmen={onUebernehmen} gesperrt={gesperrt} />;
}

async function oeffnen(region: string, block: string) {
  const user = userEvent.setup();
  const uebernehmen = vi.fn();
  render(<Feld onUebernehmen={uebernehmen} />);
  await user.click(screen.getByText('Befund aus Bausteinen'));
  await user.click(screen.getByRole('button', { name: region }));
  await user.click(screen.getByText(block));
  return { user, uebernehmen };
}

function test_(label: string) {
  return screen.getByRole('group', { name: label });
}

describe('BausteinFeld', () => {
  it('zeigt die neun Regionen und ohne Wahl keinen Test', async () => {
    const user = userEvent.setup();
    render(<Feld onUebernehmen={vi.fn()} />);
    await user.click(screen.getByText('Befund aus Bausteinen'));
    const regionen = within(screen.getByRole('group', { name: 'Region' })).getAllByRole('button');
    expect(regionen.map((r) => r.textContent)).toEqual([
      'HWS',
      'LWS',
      'Schulter',
      'Ellenbogen',
      'Hand',
      'Hüfte',
      'Knie',
      'Fuß',
      'Kiefer',
    ]);
    expect(screen.getByText('Region wählen, um die Tests aufzuklappen.')).toBeInTheDocument();
  });

  it('erzeugt aus Ergebnis, Seite und Notiz den Vorschlag und übernimmt ihn', async () => {
    const { user, uebernehmen } = await oeffnen('Knie', 'Weiterführende Untersuchung');
    const lachmann = test_('Lachmann-Test');
    await user.click(within(lachmann).getByRole('button', { name: 'positiv' }));
    await user.click(within(lachmann).getByRole('button', { name: 'rechts' }));
    await user.type(within(lachmann).getByLabelText('Notiz'), 'Weicher Anschlag.');

    const erwartet =
      'Knie – Weiterführende Untersuchung\nLachmann-Test, rechts: positiv. Weicher Anschlag.';
    const vorschlag = screen.getByRole('region', { name: 'Vorschlag für den Eintrag' });
    expect(within(vorschlag).getByText(/Lachmann-Test, rechts/).textContent).toBe(erwartet);
    expect(screen.getByRole('button', { name: 'Knie · 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'In den Text übernehmen' }));
    expect(uebernehmen).toHaveBeenCalledWith(erwartet);
    // Übernommen heißt erledigt: Die Auswahl beginnt von vorn.
    expect(screen.queryByRole('region', { name: 'Vorschlag für den Eintrag' })).toBeNull();
  });

  it('hebt ein Ergebnis mit dem zweiten Tipp wieder auf', async () => {
    const { user } = await oeffnen('Knie', 'Weiterführende Untersuchung');
    const lachmann = test_('Lachmann-Test');
    const positiv = within(lachmann).getByRole('button', { name: 'positiv' });
    await user.click(positiv);
    expect(positiv).toHaveAttribute('aria-pressed', 'true');
    await user.click(positiv);
    expect(positiv).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('region', { name: 'Vorschlag für den Eintrag' })).toBeNull();
  });

  it('bietet einer Technik nur „durchgeführt“ und der Wirbelsäule keine Seite', async () => {
    const { user } = await oeffnen('LWS', 'Behandlung');
    const mmb = test_('MMB');
    expect(
      within(mmb)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['durchgeführt']);
    await user.click(within(mmb).getByRole('button', { name: 'durchgeführt' }));
    expect(within(mmb).queryByRole('group', { name: 'Seite' })).toBeNull();
  });

  it('kennzeichnet einen Block, an dem die Vorlage abbricht (ANN-118)', async () => {
    await oeffnen('Schulter', 'Untersuchung ACG');
    expect(screen.getByText('Vorlage unvollständig')).toBeInTheDocument();
    expect(screen.getByText(/In der Vorlage fehlen hier Einträge/)).toBeInTheDocument();
  });

  it('nimmt einen Messwert nur als Zahl in den Text', async () => {
    const { user } = await oeffnen('Fuß', 'Basisuntersuchung Fuß');
    const k2w = test_('Knee to Wall Test, links');
    await user.click(within(k2w).getByRole('button', { name: 'ohne Befund' }));
    const feld = within(k2w).getByLabelText('Messwert (cm)');

    await user.type(feld, 'acht');
    expect(within(k2w).getByText('Bitte eine Zahl eingeben, etwa 1,5.')).toBeInTheDocument();
    expect(screen.getByText(/Knee to Wall Test, links: ohne Befund\.$/)).toBeInTheDocument();
    // Übernommen würde der Text ohne den Wert — deshalb erst nach der Korrektur.
    expect(screen.getByRole('button', { name: 'In den Text übernehmen' })).toBeDisabled();

    await user.clear(feld);
    await user.type(feld, '8,5');
    expect(screen.getByText(/Knee to Wall Test, links: ohne Befund, 8,5 cm\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In den Text übernehmen' })).toBeEnabled();
  });

  it('misst Knee to Wall und Navicular Drop links und rechts getrennt', async () => {
    const { user } = await oeffnen('Fuß', 'Basisuntersuchung Fuß');
    const links = test_('Knee to Wall Test, links');
    const rechts = test_('Knee to Wall Test, rechts');
    await user.click(within(links).getByRole('button', { name: 'ohne Befund' }));
    await user.type(within(links).getByLabelText('Messwert (cm)'), '9');
    await user.click(within(rechts).getByRole('button', { name: 'positiv' }));
    await user.type(within(rechts).getByLabelText('Messwert (cm)'), '5');
    // Die Seite steht fest; eine Auswahl links/rechts/beidseits gibt es hier nicht.
    expect(within(rechts).queryByRole('group', { name: 'Seite' })).toBeNull();

    const vorschlag = screen.getByRole('region', { name: 'Vorschlag für den Eintrag' });
    expect(within(vorschlag).getByText(/Knee to Wall/).textContent).toBe(
      'Basisuntersuchung Fuß\n' +
        'Knee to Wall Test, links: ohne Befund, 9 cm.\n' +
        'Knee to Wall Test, rechts: positiv, 5 cm.',
    );

    await user.click(screen.getByText('Weiterführende Untersuchung'));
    expect(test_('Navicular Drop Test, links')).toBeInTheDocument();
    expect(test_('Navicular Drop Test, rechts')).toBeInTheDocument();
  });

  it('sperrt jede Eingabe, solange die Seite schreibt', async () => {
    const user = userEvent.setup();
    render(<Feld onUebernehmen={vi.fn()} gesperrt />);
    await user.click(screen.getByText('Befund aus Bausteinen'));
    expect(screen.getByRole('group', { name: 'Befund aus Bausteinen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Knie' })).toBeDisabled();
  });

  it('schreibt einen Unterpunkt mit seiner Gruppe', async () => {
    const { user } = await oeffnen('Ellenbogen', 'Weiterführende Untersuchung');
    await user.click(within(test_('Cozen-Test')).getByRole('button', { name: 'negativ' }));
    expect(screen.getByText(/LET – Cozen-Test: negativ\./)).toBeInTheDocument();
  });

  it('ist barrierefrei, aufgeklappt und mit Angabe', async () => {
    const { user } = await oeffnen('Knie', 'Basisuntersuchung Knie');
    await user.click(within(test_('Kniebeuge')).getByRole('button', { name: 'positiv' }));
    await pruefeBarrierefreiheit(document.body);
  });

  it('verwirft den Vorschlag, ohne etwas zu übernehmen', async () => {
    const { user, uebernehmen } = await oeffnen('Knie', 'Basisuntersuchung Knie');
    await user.click(within(test_('Kniebeuge')).getByRole('button', { name: 'ohne Befund' }));
    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(uebernehmen).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Vorschlag für den Eintrag' })).toBeNull();
  });
});
