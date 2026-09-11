import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { Badge } from './Badge';
import { ButtonLink } from './ButtonLink';
import { PageHeader } from './PageHeader';
import { kartenAktionKlassen } from './buttonStile';
import { DetailList, DetailRow } from './DetailList';
import { Rueckfrage } from './Rueckfrage';
import { SearchField } from './SearchField';
import { Feldgruppe, Section } from './Section';
import { Statusmeldung } from './Statusmeldung';

describe('Badge', () => {
  /**
   * Seit DS-001 sind `akzent` und `positiv` dieselbe Farbe (Hauptfarbe auf
   * Salbei hell). Vorher hielt sie ein Kontrasttest ueber ihre Buntheit
   * auseinander; jetzt traegt das Zeichen die Unterscheidung. Faellt es weg,
   * sind zwei Abzeichen nebeneinander nicht mehr zu trennen.
   */
  it('setzt positiv mit einem Zeichen von akzent ab', () => {
    const { unmount } = renderWithProviders(<Badge ton="positiv">Abgeschlossen</Badge>);
    expect(screen.getByText('Abgeschlossen').parentElement?.textContent).toBe('✓Abgeschlossen');
    unmount();

    renderWithProviders(<Badge ton="akzent">Vorschau</Badge>);
    expect(screen.getByText('Vorschau').parentElement?.textContent).toBe('Vorschau');
  });

  it('kennzeichnet Warnung und Kritisch mit eigenen Zeichen', () => {
    const { unmount } = renderWithProviders(<Badge ton="warnung">Offen</Badge>);
    expect(screen.getByText('Offen').parentElement?.textContent).toBe('!Offen');
    unmount();

    renderWithProviders(<Badge ton="kritisch">Abgesagt</Badge>);
    expect(screen.getByText('Abgesagt').parentElement?.textContent).toBe('×Abgesagt');
  });

  it('haelt das Zeichen aus dem Vorlesetext heraus', () => {
    // Der Zustand steht als Wort daneben; "Haekchen Abgeschlossen" waere nur
    // Rauschen.
    renderWithProviders(<Badge ton="positiv">Abgeschlossen</Badge>);
    expect(screen.getByText('✓')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('PageHeader', () => {
  it('haelt den kompakten Kopf flach, ohne die Identitaet wegzunehmen', () => {
    // IDEA-PRX-038: auf den Dokumentationsseiten muss das Textfeld ohne
    // Scrollen erreichbar sein. Gespart wird Hoehe - nicht die Zeile, die
    // sagt, in wessen Akte gerade geschrieben wird.
    renderWithProviders(
      <PageHeader
        title="Behandlung abschließen"
        description="Max Mustermann · 12.05.2027, 09:00–10:00"
        kompakt
      />,
    );

    const titel = screen.getByRole('heading', { name: 'Behandlung abschließen' });
    expect(titel.className).toContain('text-h4');
    expect(titel.className).not.toContain('text-h2');
    expect(screen.getByText('Max Mustermann · 12.05.2027, 09:00–10:00')).toBeInTheDocument();
  });

  it('bleibt ohne kompakt beim vollen Seitentitel', () => {
    renderWithProviders(<PageHeader title="Patient:innen" />);
    expect(screen.getByRole('heading', { name: 'Patient:innen' }).className).toContain('text-h2');
  });
});

describe('ButtonLink', () => {
  it('ist ein Link und keine Schaltflaeche', () => {
    renderWithProviders(<ButtonLink to="/patienten/neu">Patient anlegen</ButtonLink>);

    const link = screen.getByRole('link', { name: 'Patient anlegen' });
    expect(link).toHaveAttribute('href', '/patienten/neu');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('traegt dieselben Klassen wie die Schaltflaeche und ein ausreichendes Tippziel', () => {
    renderWithProviders(<ButtonLink to="/a">Primaer</ButtonLink>);
    const link = screen.getByRole('link', { name: 'Primaer' });
    // Seit DS-001 ist die Schaltflaeche 48 px hoch (`--control-height`); die
    // Untergrenze von 44 px aus der Oberflaechen-Checkliste bleibt damit
    // erfuellt. Geprueft wird die Hoehe, nicht eine bestimmte Klasse.
    expect(link.className).toMatch(/\bh-12\b/);
    expect(link.className).toContain('bg-accent');
  });

  it('haelt die kompakte Variante bei 44 px', () => {
    // Das Design System nennt 40 px fuer den kompakten Knopf und zugleich
    // "Ziele >= 44". Fuer einen Knopf ohne umgebende Polsterung widersprechen
    // sich beide; es gilt die zugaengliche Lesart.
    expect(kartenAktionKlassen()).toMatch(/\bmin-h-11\b/);
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

  it('unterbricht bei einer Warnung nicht - sie muss sichtbar sein, nicht dringend', () => {
    renderWithProviders(<Statusmeldung ton="warnung">Der Stand kann veraltet sein.</Statusmeldung>);

    const meldung = screen.getByRole('status');
    expect(meldung).toHaveTextContent('Der Stand kann veraltet sein.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Der Zustand haengt nicht allein an der Farbe, aber die Farbe traegt ihn
    // mit (Oberflaechen-Checkliste Punkt 4).
    expect(meldung.className).toContain('text-warnung');
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

describe('Druck-Basis', () => {
  it('nimmt Schaltflaechen und Schaltflaechen-Links vom Druck aus', () => {
    renderWithProviders(
      <>
        <ButtonLink to="/x">Erfassen</ButtonLink>
        <button type="button">Speichern</button>
      </>,
    );
    // Der Link ist ein <a>; die Regel `button { display: none }` im Druck
    // greift dort nicht. Deshalb traegt er die Markierung selbst (UI-000).
    expect(screen.getByRole('link', { name: 'Erfassen' }).className).toContain('nicht-drucken');
  });
});
