import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeroKarte } from '@/components/ui/HeroKarte';
import { Wahlflaechen } from '@/components/ui/Wahlflaechen';
import { Wochenleiste } from '@/components/ui/Wochenleiste';
import { renderWithProviders } from '@/test-utils';
import type { Termin, Terminwunsch } from './api';
import {
  FragenZumTermin,
  Terminliste,
  Terminzeile,
  WerUndWo,
  Wunschzeile,
} from './Terminbausteine';

/**
 * Die Bausteine der Termine (Schritt 3a, Handoff 2026-10-24 „Termine“,
 * Abschnitt 3): Rollen, Namen und welche Teile in welcher Lage stehen.
 * Maße, Umbrüche und axe prüft `tests/e2e/plattform-terminbausteine.spec.ts`.
 */
const JETZT = new Date(2026, 9, 24, 8, 0);

function termin(tag: string, teil: Partial<Termin> = {}): Termin {
  const beginn = new Date(`${tag}T09:30:00`);
  return {
    id: 'cccccccc-0000-4000-8000-000000000001',
    starts_at: beginn.toISOString(),
    ends_at: new Date(beginn.getTime() + 60 * 60 * 1000).toISOString(),
    appointment_type: 'home_visit',
    status: 'confirmed',
    staff_name: 'Anna Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tübingen',
    late_notice: false,
    open_request_kind: null,
    ...teil,
  };
}

describe('Terminzeile', () => {
  it('führt als ganze Zeile zur Seite des Termins und sagt alles im Namen', () => {
    renderWithProviders(
      <Terminliste name="Weitere Termine">
        <Terminzeile
          termin={termin('2026-11-04', {
            appointment_type: 'practice',
            staff_name: 'Jannes Test',
            open_request_kind: 'cancel',
          })}
          bereich="treatment"
          to="/p/termine/1?bereich=treatment"
          jetzt={JETZT}
        />
      </Terminliste>,
    );
    const zeile = within(screen.getByRole('list', { name: 'Weitere Termine' })).getByRole('link');
    expect(zeile).toHaveAttribute('href', '/p/termine/1?bereich=treatment');
    // Tag und Monat sind mit einem geschützten Leerzeichen verbunden.
    expect(zeile).toHaveAccessibleName(
      /^Mittwoch, 4\.\sNovember, 09:30 bis 10:30, Praxis · Jannes Test, Absage angefragt$/,
    );
    expect(zeile).toHaveTextContent('Absage angefragt');
  });

  it('dämpft einen vergangenen Termin, mit Zustand', () => {
    renderWithProviders(
      <Terminliste>
        <Terminzeile
          termin={termin('2026-10-17', { status: 'completed' })}
          bereich="treatment"
          to="/p/termine/1"
          jetzt={JETZT}
        />
      </Terminliste>,
    );
    expect(screen.getByText('Samstag, 17. Oktober')).toHaveClass('text-ink-muted');
    expect(screen.getByText('durchgeführt')).toBeInTheDocument();
  });
});

describe('Wunschzeile', () => {
  const wunsch: Terminwunsch = {
    id: 'dddddddd-0000-4000-8000-000000000001',
    kind: 'change',
    appointment_id: 'cccccccc-0000-4000-8000-000000000001',
    preferred_days: ['2026-10-27', '2026-10-29'],
    preferred_times: ['morning'],
    note: 'Gern nicht vor 9 Uhr.',
    status: 'open',
    created_at: '2026-10-22T10:00:00+02:00',
    resolved_at: null,
    answer: null,
  };

  it('nennt was, wann, die Nachricht und wann gesendet; Zurückziehen reicht die Seite herein', () => {
    renderWithProviders(
      <Terminliste>
        <Wunschzeile
          wunsch={wunsch}
          termine={[termin('2026-11-04')]}
          zurueckziehen={<button type="button">Wunsch zurückziehen</button>}
          jetzt={JETZT}
        />
      </Terminliste>,
    );
    const zeile = screen.getByRole('listitem');
    expect(zeile).toHaveTextContent('Änderung für Mi., 4. November');
    expect(zeile).toHaveTextContent('angefragt');
    expect(zeile).toHaveTextContent('Dienstag oder Donnerstag, vormittags');
    expect(zeile).toHaveTextContent('„Gern nicht vor 9 Uhr.“');
    expect(zeile).toHaveTextContent('Gesendet am 22. Oktober');
    expect(within(zeile).getByRole('button', { name: 'Wunsch zurückziehen' })).toBeInTheDocument();
  });

  it('ohne Seite kein Zurückziehen, mit Antwort der Praxis', () => {
    renderWithProviders(
      <Terminliste>
        <Wunschzeile
          wunsch={{ ...wunsch, status: 'declined', answer: 'Bitte rufen Sie an.' }}
          termine={[]}
          jetzt={JETZT}
        />
      </Terminliste>,
    );
    const zeile = screen.getByRole('listitem');
    expect(zeile).toHaveTextContent('Änderungswunsch');
    expect(zeile).toHaveTextContent('nicht möglich');
    expect(zeile).toHaveTextContent('Antwort der Praxis: Bitte rufen Sie an.');
    expect(within(zeile).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('WerUndWo', () => {
  it('nennt Person, Rolle und Ort; beim Video ohne Ort', () => {
    const { unmount } = renderWithProviders(
      <WerUndWo termin={termin('2026-11-04')} vertretung={null} jetzt={JETZT} />,
    );
    const karte = screen.getByRole('region', { name: 'Wer und wo' });
    expect(karte).toHaveTextContent('Anna Beispiel');
    expect(karte).toHaveTextContent('kommt zu Ihnen');
    expect(karte).toHaveTextContent('Testweg 7, 72072 Tübingen');
    unmount();

    renderWithProviders(
      <WerUndWo
        termin={termin('2026-11-04', { appointment_type: 'video', staff_name: 'Tom Training' })}
        vertretung={null}
        jetzt={JETZT}
      />,
    );
    const video = screen.getByRole('region', { name: 'Wer und wo' });
    expect(video).toHaveTextContent('per Video');
    expect(video).not.toHaveTextContent('Testweg');
  });

  it('zeigt nichts ohne Namen und Ort', () => {
    renderWithProviders(
      <WerUndWo
        termin={termin('2026-11-04', { appointment_type: 'video', staff_name: null })}
        vertretung={null}
        jetzt={JETZT}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Wer und wo' })).not.toBeInTheDocument();
  });
});

describe('FragenZumTermin', () => {
  it('mit Nummer: anrufen und schreiben als Liste', () => {
    renderWithProviders(
      <FragenZumTermin rufnummer="+49 7071 0000000" schreiben="/p/nachrichten/neu" />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Fragen zu diesem Termin?' }),
    ).toBeInTheDocument();
    const liste = screen.getByRole('list');
    expect(within(liste).getByRole('link', { name: /Praxis anrufen/ })).toHaveAttribute(
      'href',
      'tel:+4970710000000',
    );
    expect(within(liste).getByRole('link', { name: 'Der Praxis schreiben' })).toHaveAttribute(
      'href',
      '/p/nachrichten/neu',
    );
  });

  it('am vergangenen Termin anrufen als Hauptknopf über der Liste; ohne Nummer nur schreiben', () => {
    const { unmount } = renderWithProviders(
      <FragenZumTermin
        rufnummer="+49 7071 0000000"
        schreiben="/p/nachrichten/neu"
        anrufenAlsHauptknopf
      />,
    );
    expect(within(screen.getByRole('list')).getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Praxis anrufen/ })).toHaveTextContent(
      '+49 7071 0000000',
    );
    unmount();

    renderWithProviders(
      <FragenZumTermin rufnummer={null} schreiben="/p/nachrichten/neu" anrufenAlsHauptknopf />,
    );
    expect(screen.queryByRole('link', { name: /Praxis anrufen/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Der Praxis schreiben' })).toBeInTheDocument();
  });
});

describe('HeroKarte mit Ziel', () => {
  it('ist als ganze Karte ein Link mit dem Titel als Namen; „Termin ansehen“ nur sichtbar', () => {
    renderWithProviders(
      <HeroKarte
        etikett="Ihr nächster Besuch"
        titel="Besuch am Mittwoch"
        satz="28. Oktober, 09:30 bis 10:30"
        person={{ name: 'Anna Beispiel', zeile: 'Anna Beispiel kommt zu Ihnen', ort: 'Testweg 7' }}
        ziel={{ text: 'Termin ansehen', to: '/p/termine/1' }}
      />,
    );
    const karte = screen.getByRole('region', { name: 'Besuch am Mittwoch' });
    expect(within(karte).getByRole('link', { name: 'Besuch am Mittwoch' })).toHaveAttribute(
      'href',
      '/p/termine/1',
    );
    expect(within(karte).getAllByRole('link')).toHaveLength(1);
    expect(within(karte).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(karte).getByText('Termin ansehen').closest('[aria-hidden="true"]'),
    ).not.toBeNull();
    expect(karte).toHaveTextContent('Testweg 7');
  });
});

describe('Wahlflaechen und Wochenleiste', () => {
  it('Wahlflächen: eine Gruppe mit Schaltern, die Seite entscheidet', async () => {
    const umschalten = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Wahlflaechen
        titel="Zu welcher Tageszeit?"
        wahlen={[
          { schluessel: 'morning', text: 'Vormittag' },
          { schluessel: 'egal', text: 'Egal' },
        ]}
        gewaehlt={['egal']}
        onUmschalten={umschalten}
      />,
    );
    const gruppe = screen.getByRole('group', { name: 'Zu welcher Tageszeit?' });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Zu welcher Tageszeit?' }),
    ).toBeInTheDocument();
    expect(within(gruppe).getByRole('button', { name: 'Egal' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(gruppe).getByRole('button', { name: 'Vormittag' }));
    expect(umschalten).toHaveBeenCalledWith('morning');
  });

  it('Wochenleiste: Überschrift auf Wunsch als h2, so viele Spalten wie Tage', () => {
    renderWithProviders(
      <Wochenleiste
        titel="An welchen Tagen?"
        ebene={2}
        wochentage={[
          { nummer: 1, kurz: 'Mo', lang: 'Montag' },
          { nummer: 2, kurz: 'Di', lang: 'Dienstag' },
        ]}
        tage={[]}
        onUmschalten={() => undefined}
        satz="Wählen Sie einen oder mehrere Tage."
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'An welchen Tagen?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'An welchen Tagen?' })).toHaveStyle({
      '--spalten': '2',
    });
  });
});
