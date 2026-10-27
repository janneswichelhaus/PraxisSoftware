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

/** Der Abschnitt „Vorschlag für den Eintrag" - über seine Überschrift. */
function vorschlagsbereich(): HTMLElement | null {
  return (
    screen.queryByRole('heading', { name: 'Vorschlag für den Eintrag' })?.closest('section') ?? null
  );
}

function vorschlag() {
  return vorschlagsbereich()?.querySelector('p')?.textContent;
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
    expect(screen.getByText(/Seite wählen – sie gilt für alle Tests/)).toBeInTheDocument();
    expect(screen.queryByText('Untersuchung Hüfte')).toBeNull();

    await user.click(within(wahl).getByRole('button', { name: 'rechts' }));
    expect(screen.getByText('Untersuchung Hüfte')).toBeInTheDocument();
  });

  it('erzeugt aus Ergebnis und Notiz den Vorschlag und übernimmt ihn', async () => {
    const { user, uebernehmen } = await oeffnen('Knie', 'Weiterführende Untersuchung', 'rechts');
    const lachmann = test_('Lachman-Test');
    // Eine Seitenwahl je Test gibt es nicht mehr — die Region hat sie.
    expect(within(lachmann).queryByRole('button', { name: 'rechts' })).toBeNull();
    expect(within(lachmann).queryByRole('button', { name: 'Notiz' })).toBeNull();

    await user.click(within(lachmann).getByRole('button', { name: 'positiv' }));
    expect(within(lachmann).queryByLabelText('Notiz')).toBeNull();
    await user.click(within(lachmann).getByRole('button', { name: 'Notiz' }));
    expect(within(lachmann).getByLabelText('Notiz')).toHaveFocus();
    await user.type(within(lachmann).getByLabelText('Notiz'), 'Weicher Anschlag.');

    const erwartet =
      'Knie rechts – Weiterführende Untersuchung\n❗ Lachman-Test: positiv – Weicher Anschlag.';
    expect(vorschlag()).toBe(erwartet);
    expect(screen.getByRole('button', { name: 'Knie · 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'In den Text übernehmen' }));
    expect(uebernehmen).toHaveBeenCalledWith(erwartet);
    // Übernommen heißt erledigt: Auswahl und Seite beginnen von vorn.
    expect(vorschlagsbereich()).toBeNull();
    expect(screen.getByText(/Seite wählen – sie gilt für alle Tests/)).toBeInTheDocument();
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

  it('klappt einen unauffälligen Test auf eine Zeile ein (BEF-076)', async () => {
    const { user } = await oeffnen('Knie', 'Weiterführende Untersuchung', 'rechts');
    const lachmann = test_('Lachman-Test');
    await user.click(within(lachmann).getByRole('button', { name: 'o.B.' }));

    // Nur noch Name, Ergebnis und „Ändern" - die Schaltflächen sind fort.
    expect(within(lachmann).queryByRole('button', { name: 'positiv' })).toBeNull();
    const aendern = within(lachmann).getByRole('button', { name: 'Ändern' });
    expect(aendern).toHaveFocus();
    expect(lachmann).toHaveTextContent('o.B.');
    // Eine Notiz geht auch eingeklappt mit einem Tipp.
    expect(within(lachmann).getByRole('button', { name: 'Notiz' })).toBeInTheDocument();

    await user.click(aendern);
    expect(within(lachmann).getByRole('button', { name: 'o.B.' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('hebt ein Ergebnis mit dem zweiten Tipp wieder auf', async () => {
    const { user } = await oeffnen('Knie', 'Weiterführende Untersuchung', 'rechts');
    const lachmann = test_('Lachman-Test');
    const positiv = within(lachmann).getByRole('button', { name: 'positiv' });
    await user.click(positiv);
    expect(positiv).toHaveAttribute('aria-pressed', 'true');
    await user.click(positiv);
    expect(positiv).toHaveAttribute('aria-pressed', 'false');
    expect(vorschlagsbereich()).toBeNull();
  });

  it('nimmt beim Wechsel der Seite die Angaben mit', async () => {
    const { user } = await oeffnen('Knie', 'Weiterführende Untersuchung', 'rechts');
    await user.click(within(test_('Lachman-Test')).getByRole('button', { name: 'positiv' }));
    const wahl = screen.getByRole('group', { name: 'Seite Knie' });
    await user.click(within(wahl).getByRole('button', { name: 'links' }));

    expect(within(test_('Lachman-Test')).getByRole('button', { name: 'positiv' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(vorschlag()).toBe('Knie links – Weiterführende Untersuchung\n❗ Lachman-Test: positiv');
  });

  it('zeigt im Seitenvergleich je Test eine Zeile für links und rechts', async () => {
    const { user } = await oeffnen('Knie', 'Weiterführende Untersuchung', 'beidseits');
    await user.click(within(test_('Lachman-Test, links')).getByRole('button', { name: 'o.B.' }));
    await user.click(
      within(test_('Lachman-Test, rechts')).getByRole('button', { name: 'positiv' }),
    );
    expect(vorschlag()).toBe(
      'Knie – Weiterführende Untersuchung\n✅ Lachman-Test li.: o.B.\n❗ Lachman-Test re.: positiv',
    );
  });

  it('fragt vor dem Wechsel von „beidseits“ auf eine Seite, statt Angaben still zu verwerfen (BEF-103)', async () => {
    const { user } = await oeffnen('Knie', 'Weiterführende Untersuchung', 'beidseits');
    await user.click(within(test_('Lachman-Test, links')).getByRole('button', { name: 'o.B.' }));
    await user.click(
      within(test_('Lachman-Test, rechts')).getByRole('button', { name: 'positiv' }),
    );
    const wahl = screen.getByRole('group', { name: 'Seite Knie' });
    await user.click(within(wahl).getByRole('button', { name: 'rechts' }));

    const frage = screen.getByRole('group', { name: 'Seite wechseln' });
    expect(frage).toHaveTextContent(
      'Nur rechts: Eine Angabe der anderen Seite geht dabei verloren.',
    );
    await user.click(within(frage).getByRole('button', { name: 'Abbrechen' }));
    // Nichts verloren.
    expect(vorschlag()).toBe(
      'Knie – Weiterführende Untersuchung\n✅ Lachman-Test li.: o.B.\n❗ Lachman-Test re.: positiv',
    );

    await user.click(within(wahl).getByRole('button', { name: 'rechts' }));
    await user.click(screen.getByRole('button', { name: 'Ja, nur rechts' }));
    expect(vorschlag()).toBe('Knie rechts – Weiterführende Untersuchung\n❗ Lachman-Test: positiv');
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
        '  ❗ Straight leg raise (evtl. mit Add/Ir) re.: positiv',
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
    expect(vorschlag()).toBe('Basisuntersuchung Fuß rechts\n✅ Knee to Wall Test li.: o.B.');
    // Übernommen würde der Text ohne den Wert — deshalb erst nach der Korrektur.
    expect(screen.getByRole('button', { name: 'In den Text übernehmen' })).toBeDisabled();

    await user.clear(feld);
    await user.type(feld, '8,5');
    expect(vorschlag()).toBe('Basisuntersuchung Fuß rechts\n✅ Knee to Wall Test li. 8,5 cm: o.B.');
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
        '✅ Knee to Wall Test li. 9 cm: o.B.\n' +
        '❗ Knee to Wall Test re. 5 cm: positiv',
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
      'Ellenbogen links – Weiterführende Untersuchung\nLET:\n  ✅ Cozen-Test: o.B.',
    );
  });

  it('ist barrierefrei, aufgeklappt und mit Angabe', async () => {
    const { user } = await oeffnen('Knie', 'Basisuntersuchung Knie', 'beidseits');
    const rechts = test_('Kniebeuge, rechts');
    await user.click(within(rechts).getByRole('button', { name: 'positiv' }));
    await user.click(within(rechts).getByRole('button', { name: 'Notiz' }));
    await pruefeBarrierefreiheit(document.body);
  });

  it('verwirft den Vorschlag erst nach einer Rückfrage, ohne etwas zu übernehmen (BEF-01)', async () => {
    const { user, uebernehmen } = await oeffnen('Knie', 'Basisuntersuchung Knie', 'rechts');
    await user.click(within(test_('Kniebeuge')).getByRole('button', { name: 'o.B.' }));
    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));

    // Ein Tipp allein verwirft nichts mehr.
    expect(vorschlag()).toBe('Basisuntersuchung Knie rechts\n✅ Kniebeuge: o.B.');
    const frage = screen.getByRole('group', { name: 'Alle Angaben aus den Bausteinen verwerfen' });
    expect(frage).toHaveTextContent(/Messwerte, Notizen und die Seitenwahl werden verworfen/);
    await user.click(within(frage).getByRole('button', { name: 'Abbrechen' }));
    expect(vorschlag()).toBe('Basisuntersuchung Knie rechts\n✅ Kniebeuge: o.B.');

    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, alle Angaben verwerfen' }));
    expect(uebernehmen).not.toHaveBeenCalled();
    expect(vorschlagsbereich()).toBeNull();
  });

  it('wählt ein Ergebnis mit Notiz erst nach einer Rückfrage ab (BEF-01)', async () => {
    const { user } = await oeffnen('Knie', 'Weiterführende Untersuchung', 'rechts');
    const lachmann = test_('Lachman-Test');
    const positiv = within(lachmann).getByRole('button', { name: 'positiv' });
    await user.click(positiv);
    await user.click(within(lachmann).getByRole('button', { name: 'Notiz' }));
    await user.type(within(lachmann).getByLabelText('Notiz'), 'Weicher Anschlag.');

    await user.click(positiv);
    const frage = within(lachmann).getByRole('group', { name: 'Ergebnis abwählen' });
    expect(frage).toHaveTextContent('Abwählen verwirft auch Messwert und Notiz.');
    expect(within(frage).getByRole('button', { name: 'Ja, abwählen' })).toHaveFocus();
    expect(positiv).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(frage).getByRole('button', { name: 'Behalten' }));
    expect(within(lachmann).getByLabelText('Notiz')).toHaveValue('Weicher Anschlag.');
    expect(positiv).toHaveFocus();

    await user.click(positiv);
    await user.click(within(lachmann).getByRole('button', { name: 'Ja, abwählen' }));
    expect(positiv).toHaveAttribute('aria-pressed', 'false');
    expect(within(lachmann).queryByLabelText('Notiz')).toBeNull();
    expect(vorschlagsbereich()).toBeNull();
  });

  it('schickt mit Enter in Notiz oder Messwert kein Formular ab (BEF-09)', async () => {
    const abgeschickt = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={abgeschickt}>
        <Feld onUebernehmen={vi.fn()} />
        <button type="submit">Behandlung abschließen</button>
      </form>,
    );
    await user.click(screen.getByText('Befund aus Bausteinen'));
    await user.click(screen.getByRole('button', { name: 'Fuß' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Seite Fuß' })).getByRole('button', {
        name: 'rechts',
      }),
    );
    await user.click(screen.getByText('Basisuntersuchung Fuß'));
    const k2w = test_('Knee to Wall Test, links');
    await user.click(within(k2w).getByRole('button', { name: 'o.B.' }));
    await user.type(within(k2w).getByLabelText('Messwert (cm)'), '8{Enter}');
    await user.click(within(k2w).getByRole('button', { name: 'Notiz' }));
    const notiz = within(k2w).getByLabelText('Notiz');
    expect(notiz).toHaveAttribute('enterkeyhint', 'done');
    await user.type(notiz, 'Ferse bleibt am Boden{Enter}');

    expect(abgeschickt).not.toHaveBeenCalled();
    expect(notiz).toHaveValue('Ferse bleibt am Boden');
  });

  it('nennt den Knopf der Rückfrage beim Namen und gliedert unter den Seitentitel (BEF-17, BEF-18)', async () => {
    const { user } = await oeffnen('Knie', 'Basisuntersuchung Knie', 'rechts');
    await user.click(within(test_('Kniebeuge')).getByRole('button', { name: 'o.B.' }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'Vorschlag für den Eintrag' }),
    ).toBeVisible();
    expect(vorschlagsbereich()).toHaveTextContent(/dort „Speichern und weitergehen“ wählt/);
  });

  it('zeigt an jedem Aufklapper ein Zeichen (RSP-07)', () => {
    const { container } = render(<Feld onUebernehmen={vi.fn()} />);
    for (const kopf of container.querySelectorAll('summary')) {
      expect(kopf.querySelector('[data-aufklappzeichen]')).not.toBeNull();
    }
  });
});
