import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderMitVorschau, testUser } from '@/test-utils';
import { VacationPage } from './VacationPage';

/**
 * Urlaub ist der Ort, an dem Personal und Planung zusammenhängen. Geprüft wird
 * deshalb vor allem, dass eine Genehmigung sagt, was sie bewirkt - und was sie
 * ausdrücklich nicht bewirkt.
 */

function oeffne(rollen: Parameters<typeof testUser>[0] = ['owner']) {
  return renderMitVorschau(<VacationPage user={testUser(rollen)} />, '/betrieb/urlaub');
}

describe('Urlaub', () => {
  it('zeigt Leitungsrollen die offenen Anträge', () => {
    oeffne(['owner']);
    expect(screen.getByRole('heading', { name: /Offene Anträge \(2\)/ })).toBeInTheDocument();
  });

  it('bietet einer behandelnden Rolle keine Entscheidung an', () => {
    oeffne(['therapist']);
    expect(screen.queryByRole('heading', { name: /Offene Anträge/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Genehmigen' })).toBeNull();
  });

  it('warnt bei zeitgleicher Abwesenheit anderer Personen', () => {
    oeffne(['owner']);
    expect(screen.getAllByText(/Zeitgleich abwesend/).length).toBeGreaterThan(0);
  });

  it('nennt den Ablehnungsgrund am abgelehnten Antrag', () => {
    oeffne(['owner']);
    expect(
      screen.getByText(/Zeitraum bereits durch zwei Abwesenheiten belegt/),
    ).toBeInTheDocument();
  });

  describe('Genehmigung', () => {
    async function genehmige() {
      const nutzer = userEvent.setup();
      oeffne(['owner']);
      await nutzer.click(screen.getAllByRole('button', { name: 'Genehmigen' })[0]!);
      return nutzer;
    }

    it('weist vor der Entscheidung darauf hin, dass Termine nicht automatisch fallen', async () => {
      await genehmige();
      expect(screen.getByText(/Sie werden nicht automatisch abgesagt/)).toBeInTheDocument();
    });

    it('verbindet die Abwesenheit mit Kapazität und Radverfügbarkeit', async () => {
      const nutzer = await genehmige();
      await nutzer.click(screen.getByRole('button', { name: 'Genehmigung übernehmen' }));

      const meldung = screen.getByRole('status');
      expect(within(meldung).getByText(/Urlaub genehmigt/)).toBeInTheDocument();
      expect(
        within(meldung).getByText(/Planungskapazität dieser Person entfällt/),
      ).toBeInTheDocument();
      expect(
        within(meldung).getByText(/Stammrad .* ist im Zeitraum als frei markiert/),
      ).toBeInTheDocument();
    });

    it('behauptet keine E-Mail zur Sperrung des Terminplans', async () => {
      const nutzer = await genehmige();
      await nutzer.click(screen.getByRole('button', { name: 'Genehmigung übernehmen' }));

      const meldung = screen.getByRole('status');
      expect(
        within(meldung).getByText(/Keine E-Mail zur Sperrung des Terminplans versendet/),
      ).toBeInTheDocument();
      expect(
        within(meldung).getByText(/Keine bestehenden Termine abgesagt, verschoben oder vertreten/),
      ).toBeInTheDocument();
    });

    it('nimmt den Antrag danach aus den offenen heraus', async () => {
      const nutzer = await genehmige();
      await nutzer.click(screen.getByRole('button', { name: 'Genehmigung übernehmen' }));
      expect(screen.getByRole('heading', { name: /Offene Anträge \(1\)/ })).toBeInTheDocument();
    });
  });

  describe('Ablehnung', () => {
    it('verlangt eine Begruendung', async () => {
      const nutzer = userEvent.setup();
      oeffne(['owner']);
      await nutzer.click(screen.getAllByRole('button', { name: 'Ablehnen' })[0]!);

      expect(screen.getByRole('button', { name: 'Ablehnung übernehmen' })).toBeDisabled();
      await nutzer.type(
        screen.getByRole('textbox', { name: /Grund der Ablehnung/ }),
        'Zeitraum belegt',
      );
      expect(screen.getByRole('button', { name: 'Ablehnung übernehmen' })).toBeEnabled();
    });
  });

  describe('Antrag', () => {
    it('rechnet die Werktage des Zeitraums aus', async () => {
      const nutzer = userEvent.setup();
      oeffne(['therapist']);
      await nutzer.click(screen.getByRole('button', { name: 'Urlaub beantragen' }));

      await nutzer.type(screen.getByLabelText('Von'), '2026-09-07');
      await nutzer.type(screen.getByLabelText('Bis'), '2026-09-11');

      expect(screen.getByText(/Werktage im Zeitraum: 5/)).toBeInTheDocument();
    });

    it('meldet einen Zeitraum, der vor seinem Beginn endet', async () => {
      const nutzer = userEvent.setup();
      oeffne(['therapist']);
      await nutzer.click(screen.getByRole('button', { name: 'Urlaub beantragen' }));

      await nutzer.type(screen.getByLabelText('Von'), '2026-09-11');
      await nutzer.type(screen.getByLabelText('Bis'), '2026-09-07');

      expect(screen.getByText(/Das Ende liegt vor dem Beginn/)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Antrag in die Vorschau übernehmen/ }),
      ).toBeDisabled();
    });

    it('behauptet beim Einreichen keine Benachrichtigung', async () => {
      const nutzer = userEvent.setup();
      oeffne(['therapist']);
      await nutzer.click(screen.getByRole('button', { name: 'Urlaub beantragen' }));
      await nutzer.type(screen.getByLabelText('Von'), '2026-11-02');
      await nutzer.type(screen.getByLabelText('Bis'), '2026-11-06');
      await nutzer.click(screen.getByRole('button', { name: /Antrag in die Vorschau übernehmen/ }));

      const meldung = screen.getByRole('status');
      expect(
        within(meldung).getByText(/Keine Benachrichtigung an Leitung oder Teamleitung versendet/),
      ).toBeInTheDocument();
      expect(within(meldung).getByText(/erst mit der Genehmigung/)).toBeInTheDocument();
    });
  });
});
