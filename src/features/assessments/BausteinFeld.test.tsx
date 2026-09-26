import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { BausteinFeld } from './BausteinFeld';
import { useBausteinAuswahl } from './bausteinauswahl';

/**
 * Das Bausteinfeld mit der Bibliothek des Releases (FRB-003b, Seitenwahl nach
 * ANN-129, Textform nach ANN-130). Die Texte der Tests stammen aus den
 * Definitionsdateien; der Code kennt sie nicht.
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

/** Feld auf, Region wählen, bei Extremitäten die Seite, dann den Block aufklappen. */
async function oeffnen(region: string, block: string, seite?: 'links' | 'rechts' | 'beidseits') {
  const user = userEvent.setup();
  const uebernehmen = vi.fn();
  render(<Feld onUebernehmen={uebernehmen} />);
  await user.click(screen.getByText('Befund aus Bausteinen'));
  await user.click(screen.getByRole('button', { name: region }));
  if (seite) {
    const wahl = screen.getByRole('group', { name: `Seite ${region}` });
    await user.click(within(wahl).getByRole('button', { name: seite }));
  }
  await user.click(screen.getByText(block));
  return { user, uebernehmen };
}

function test_(label: string) {
  return screen.getByRole('group', { name: label });
}

function vorschlag() {
  const bereich = screen.getByRole('region', { name: 'Vorschlag für den Eintrag' });
  return bereich.querySelector('p')?.textContent;
}

// Eine Region rendert alle Blöcke samt Schaltflächen, im Seitenvergleich
// doppelt; getByRole und axe darüber sind teuer. Unter voller Last der
// Testsuite reichen 5 s nicht immer (wie in ErhebungPage.test.tsx).
describe('BausteinFeld', { timeout: 20_000 }, () => {
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

  it('fragt an einer Extremität zuerst einmal die Seite, ohne Vorauswahl (ANN-129)', async () => {
    const user = userEvent.setup();
    render(<Feld onUebernehmen={vi.fn()} />);
    await user.click(screen.getByText('Befund aus Bausteinen'));
    await user.click(screen.getByRole('button', { name: 'Hüfte' }));

    const wahl = screen.getByRole('group', { name: 'Seite Hüfte' });
    for (const knopf of within(wahl).getAllByRole('button')) {
      expect(knopf).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByText(/Seite wählen — sie gilt für alle Tests/)).toBeInTheDocument();
    expect(screen.queryByText('Untersuchung Hüfte')).toBeNull();

    await user.click(within(wahl).getByRole('button', { name: 'rechts' }));
    expect(screen.getByText('Untersuchung Hüfte')).toBeInTheDocument();
  });

  it('erzeugt aus Ergebnis und Notiz den Vorschlag und übernimmt ihn', async () => {
    const { user, uebernehmen } = await oeffnen('Knie', 'Weiterführende Untersuchung', 'rechts');
    const lachmann = test_('Lachmann-Test');
    // Eine Seitenwahl je Test gibt es nicht mehr — die Region hat sie.
    expect(within(lachmann).queryByRole('button', { name: 'rechts' })).toBeNull();
    expect(within(lachmann).queryByRole('button', { name: 'Notiz' })).toBeNull();

    await user.click(within(lachmann).getByRole('button', { name: 'positiv' }));
    expect(within(lachmann).queryByLabelText('Notiz')).toBeNull();
    await user.click(within(lachmann).getByRole('button', { name: 'Notiz' }));
    expect(within(lachmann).getByLabelText('Notiz')).toHaveFocus();
    await user.type(within(lachmann).getByLabelText('Notiz'), 'Weicher Anschlag.');

    const erwartet =
      'Knie rechts – Weiterführende Untersuchung\n❗ Lachmann-Test – Weicher Anschlag.';
    expect(vorschlag()).toBe(erwartet);
    expect(screen.getByRole('button', { name: 'Knie · 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'In den Text übernehmen' }));
    expect(uebernehmen).toHaveBeenCalledWith(erwartet);
    // Übernommen heißt erledigt: Auswahl und Seite beginnen von vorn.
    expect(screen.queryByRole('region', { name: 'Vorschlag für den Eintrag' })).toBeNull();
    expect(screen.getByText(/Seite wählen — sie gilt für alle Tests/)).toBeInTheDocument();
  });

  it('bietet einem Test o.B., positiv und nicht getestet', async () => {
    const { user } = await oeffnen('Knie', 'Basisuntersuchung Knie', 'links');
    const kniebeuge = test_('Kniebeuge');
    expect(
      within(kniebeuge)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['✅ o.B.', '❗ positiv', 'nicht getestet']);
    await user.click(within(kniebeuge).getByRole('button', { name: 'nicht getestet' }));
    expect(vorschlag()).toBe('Basisuntersuchung Knie links\nNicht getestet: Kniebeuge');
  });

  it('hebt ein Ergebnis mit dem zweiten Tipp wieder auf', async () => {
    const { user } = await oeffnen('Knie', 'Weiterführende Untersuchung', 'rechts');
    const lachmann = test_('Lachmann-Test');
    const positiv = within(lachmann).getByRole('button', { name: 'positiv' });
    await user.click(positiv);
    expect(positiv).toHaveAttribute('aria-pressed', 'true');
    await user.click(positiv);
    expect(positiv).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('region', { name: 'Vorschlag für den Eintrag' })).toBeNull();
  });

  it('nimmt beim Wechsel der Seite die Angaben mit', async () => {
    const { user } = await oeffnen('Knie', 'Weiterführende Untersuchung', 'rechts');
    await user.click(within(test_('Lachmann-Test')).getByRole('button', { name: 'positiv' }));
    const wahl = screen.getByRole('group', { name: 'Seite Knie' });
    await user.click(within(wahl).getByRole('button', { name: 'links' }));

    expect(within(test_('Lachmann-Test')).getByRole('button', { name: 'positiv' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(vorschlag()).toBe('Knie links – Weiterführende Untersuchung\n❗ Lachmann-Test');
  });

  it('zeigt im Seitenvergleich je Test eine Zeile für links und rechts', async () => {
    const { user } = await oeffnen('Knie', 'Weiterführende Untersuchung', 'beidseits');
    await user.click(within(test_('Lachmann-Test, links')).getByRole('button', { name: 'o.B.' }));
    await user.click(
      within(test_('Lachmann-Test, rechts')).getByRole('button', { name: 'positiv' }),
    );
    expect(vorschlag()).toBe(
      'Knie – Weiterführende Untersuchung\n✅ Lachmann-Test li.\n❗ Lachmann-Test re.',
    );
  });

  it('fragt an der Wirbelsäule keine Regionsseite, aber je Nerventest links und rechts', async () => {
    const { user } = await oeffnen('LWS', 'Neurologische Untersuchungen (bei Bedarf)');
    expect(screen.queryByRole('group', { name: 'Seite LWS' })).toBeNull();
    await user.click(
      within(test_('Straight leg raise (evtl. mit Add/Ir), rechts')).getByRole('button', {
        name: 'positiv',
      }),
    );
    expect(vorschlag()).toBe(
      'LWS – Neurologische Untersuchungen (bei Bedarf)\n' +
        'Nervenprovokationstests:\n' +
        '  ❗ Straight leg raise (evtl. mit Add/Ir) re.',
    );
  });

  it('bietet einer Technik nur „durchgeführt“', async () => {
    const { user } = await oeffnen('LWS', 'Behandlung');
    const mmb = test_('MMB');
    expect(
      within(mmb)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['durchgeführt']);
    await user.click(within(mmb).getByRole('button', { name: 'durchgeführt' }));
    expect(vorschlag()).toBe('LWS – Behandlung\n• MMB');
  });

  it('kennzeichnet einen Block, an dem die Vorlage abbricht (ANN-118)', async () => {
    await oeffnen('Schulter', 'Untersuchung ACG', 'rechts');
    expect(screen.getByText('Vorlage unvollständig')).toBeInTheDocument();
    expect(screen.getByText(/In der Vorlage fehlen hier Einträge/)).toBeInTheDocument();
  });

  it('nimmt einen Messwert nur als Zahl in den Text', async () => {
    const { user } = await oeffnen('Fuß', 'Basisuntersuchung Fuß', 'rechts');
    const k2w = test_('Knee to Wall Test, links');
    await user.click(within(k2w).getByRole('button', { name: 'o.B.' }));
    const feld = within(k2w).getByLabelText('Messwert (cm)');

    await user.type(feld, 'acht');
    expect(within(k2w).getByText('Bitte eine Zahl eingeben, etwa 1,5.')).toBeInTheDocument();
    expect(vorschlag()).toBe('Basisuntersuchung Fuß rechts\n✅ Knee to Wall Test li.');
    // Übernommen würde der Text ohne den Wert — deshalb erst nach der Korrektur.
    expect(screen.getByRole('button', { name: 'In den Text übernehmen' })).toBeDisabled();

    await user.clear(feld);
    await user.type(feld, '8,5');
    expect(vorschlag()).toBe('Basisuntersuchung Fuß rechts\n✅ Knee to Wall Test li. 8,5 cm');
    expect(screen.getByRole('button', { name: 'In den Text übernehmen' })).toBeEnabled();
  });

  it('misst Knee to Wall und Navicular Drop auch bei einer Seite links und rechts', async () => {
    const { user } = await oeffnen('Fuß', 'Basisuntersuchung Fuß', 'rechts');
    const links = test_('Knee to Wall Test, links');
    const rechts = test_('Knee to Wall Test, rechts');
    await user.click(within(links).getByRole('button', { name: 'o.B.' }));
    await user.type(within(links).getByLabelText('Messwert (cm)'), '9');
    await user.click(within(rechts).getByRole('button', { name: 'positiv' }));
    await user.type(within(rechts).getByLabelText('Messwert (cm)'), '5');

    expect(vorschlag()).toBe(
      'Basisuntersuchung Fuß rechts\n' +
        '✅ Knee to Wall Test li. 9 cm\n' +
        '❗ Knee to Wall Test re. 5 cm',
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

  it('schreibt Unterpunkte eingerückt unter ihre Gruppe', async () => {
    const { user } = await oeffnen('Ellenbogen', 'Weiterführende Untersuchung', 'links');
    await user.click(within(test_('Cozen-Test')).getByRole('button', { name: 'o.B.' }));
    expect(vorschlag()).toBe(
      'Ellenbogen links – Weiterführende Untersuchung\nLET:\n  ✅ Cozen-Test',
    );
  });

  it('ist barrierefrei, aufgeklappt und mit Angabe', async () => {
    const { user } = await oeffnen('Knie', 'Basisuntersuchung Knie', 'beidseits');
    const rechts = test_('Kniebeuge, rechts');
    await user.click(within(rechts).getByRole('button', { name: 'positiv' }));
    await user.click(within(rechts).getByRole('button', { name: 'Notiz' }));
    await pruefeBarrierefreiheit(document.body);
  });

  it('verwirft den Vorschlag, ohne etwas zu übernehmen', async () => {
    const { user, uebernehmen } = await oeffnen('Knie', 'Basisuntersuchung Knie', 'rechts');
    await user.click(within(test_('Kniebeuge')).getByRole('button', { name: 'o.B.' }));
    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(uebernehmen).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Vorschlag für den Eintrag' })).toBeNull();
  });
});
