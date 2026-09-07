import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { ButtonLink } from './ButtonLink';
import { DetailList, DetailRow } from './DetailList';
import { Rueckfrage } from './Rueckfrage';
import { SearchField } from './SearchField';
import { Feldgruppe, Section } from './Section';
import { Statusmeldung } from './Statusmeldung';

describe('ButtonLink', () => {
  it('ist ein Link und keine Schaltflaeche', () => {
    renderWithProviders(<ButtonLink to="/patienten/neu">Patient anlegen</ButtonLink>);

    const link = screen.getByRole('link', { name: 'Patient anlegen' });
    expect(link).toHaveAttribute('href', '/patienten/neu');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('traegt dieselben Klassen wie die Schaltflaeche und ein Tippziel von 44 px', () => {
    renderWithProviders(<ButtonLink to="/a">Primaer</ButtonLink>);
    const link = screen.getByRole('link', { name: 'Primaer' });
    expect(link.className).toContain('min-h-11');
    expect(link.className).toContain('bg-accent');
  });

  it('kennt die sekundaere Variante', () => {
    renderWithProviders(
      <ButtonLink to="/a" variant="secondary">
        Sekundaer
      </ButtonLink>,
    );
    expect(screen.getByRole('link', { name: 'Sekundaer' }).className).toContain(
      'border-line-strong',
    );
  });
});

describe('Statusmeldung', () => {
  it('unterbricht bei einem Fehler und wird sonst nur gelesen', () => {
    renderWithProviders(
      <>
        <Statusmeldung ton="fehler">Speichern fehlgeschlagen.</Statusmeldung>
        <Statusmeldung>3 von 12 Terminen</Statusmeldung>
      </>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen.');
    expect(screen.getByRole('status')).toHaveTextContent('3 von 12 Terminen');
  });
});

describe('Section', () => {
  it('setzt die Ueberschriftenebene, ohne das Aussehen zu aendern', () => {
    renderWithProviders(
      <>
        <Section titel="Kontakt">
          <p>Inhalt</p>
        </Section>
        <Section titel="Positionen" ebene={3} hinweis="Je Heilmittel eine Position.">
          <p>Inhalt</p>
        </Section>
      </>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Kontakt' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Positionen' })).toBeInTheDocument();
    expect(screen.getByText('Je Heilmittel eine Position.')).toBeInTheDocument();
  });

  it('nimmt eine Aktion neben der Ueberschrift auf', () => {
    renderWithProviders(
      <Section titel="Verordnungen" aktion={<ButtonLink to="/x">Erfassen</ButtonLink>}>
        <p>Inhalt</p>
      </Section>,
    );
    expect(screen.getByRole('link', { name: 'Erfassen' })).toBeInTheDocument();
  });

  it('stapelt Felder in der Feldgruppe', () => {
    const { container } = renderWithProviders(
      <Feldgruppe>
        <input aria-label="a" />
      </Feldgruppe>,
    );
    expect(container.querySelector('.flex-col')).not.toBeNull();
  });
});

describe('DetailList', () => {
  it('liest Bezeichnung und Wert als Definitionsliste zusammen', () => {
    renderWithProviders(
      <DetailList>
        <DetailRow label="Mobil">
          <a href="tel:+491600000005">+49 160 0000005</a>
        </DetailRow>
      </DetailList>,
    );

    expect(screen.getByText('Mobil').tagName).toBe('DT');
    expect(screen.getByRole('link', { name: '+49 160 0000005' })).toBeInTheDocument();
  });
});

describe('SearchField', () => {
  it('hat immer eine Beschriftung, nicht nur einen Platzhalter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<SearchField placeholder="Name, Ort" value="" onChange={onChange} />);

    const feld = screen.getByLabelText('Suche');
    expect(feld).toHaveAttribute('type', 'search');
    expect(feld).toHaveAttribute('placeholder', 'Name, Ort');

    await user.type(feld, 'M');
    expect(onChange).toHaveBeenCalledWith('M');
  });
});

describe('Rueckfrage', () => {
  function aufbau(rest: Partial<React.ComponentProps<typeof Rueckfrage>> = {}) {
    const onBestaetigen = vi.fn();
    renderWithProviders(
      <Rueckfrage
        ausloeser="Verordnung löschen"
        bestaetigen="Ja, Verordnung löschen"
        abbrechen="Nicht löschen"
        onBestaetigen={onBestaetigen}
        {...rest}
      >
        Die Verordnung wird endgültig entfernt.
      </Rueckfrage>,
    );
    return { onBestaetigen };
  }

  it('zeigt zuerst nur die ausloesende Schaltflaeche', () => {
    aufbau();
    expect(screen.getByRole('button', { name: 'Verordnung löschen' })).toBeInTheDocument();
    expect(screen.queryByText('Die Verordnung wird endgültig entfernt.')).not.toBeInTheDocument();
  });

  it('schreibt erst nach der Rueckfrage', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau();

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    expect(onBestaetigen).not.toHaveBeenCalled();
    expect(screen.getByText('Die Verordnung wird endgültig entfernt.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ja, Verordnung löschen' }));
    expect(onBestaetigen).toHaveBeenCalledTimes(1);
  });

  it('fuehrt den Fokus in die Rueckfrage und wieder zurueck', async () => {
    const user = userEvent.setup();
    aufbau();

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ja, Verordnung löschen' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('button', { name: 'Nicht löschen' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Verordnung löschen' })).toHaveFocus(),
    );
  });

  it('benennt den Kasten fuer Vorlesesoftware', async () => {
    const user = userEvent.setup();
    aufbau({ bezeichnung: 'Verordnung endgültig löschen' });

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    expect(screen.getByRole('group', { name: 'Verordnung endgültig löschen' })).toBeInTheDocument();
  });

  it('meldet einen Fehler so, dass er vorgelesen wird', async () => {
    const user = userEvent.setup();
    aufbau({ fehler: 'Die Verordnung konnte nicht gelöscht werden.' });

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Die Verordnung konnte nicht gelöscht werden.',
    );
  });

  it('schliesst sich nach einem erfolgreichen Vorgang', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau();
    onBestaetigen.mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, Verordnung löschen' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Verordnung löschen' })).toBeInTheDocument(),
    );
  });

  it('bleibt nach einem gescheiterten Vorgang offen', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau();
    onBestaetigen.mockRejectedValue(new Error('kaputt'));

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, Verordnung löschen' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ja, Verordnung löschen' })).toBeInTheDocument(),
    );
  });

  it('loest bei doppeltem Klick nur einen Vorgang aus', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau();
    let aufloesen: () => void = () => {};
    onBestaetigen.mockReturnValue(
      new Promise<void>((resolve) => {
        aufloesen = resolve;
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    const knopf = screen.getByRole('button', { name: 'Ja, Verordnung löschen' });
    await user.click(knopf);
    await user.click(knopf);

    expect(onBestaetigen).toHaveBeenCalledTimes(1);
    aufloesen();
  });

  it('sperrt die Schaltflaeche, solange der Vorgang laeuft', async () => {
    const user = userEvent.setup();
    aufbau({ laeuft: true, bestaetigenLaeuft: 'Wird gelöscht …' });

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    expect(screen.getByRole('button', { name: 'Wird gelöscht …' })).toBeDisabled();
  });
});
