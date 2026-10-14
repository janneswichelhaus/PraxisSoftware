import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, useSearchParams } from 'react-router-dom';
import type * as UebersichtApi from './uebersicht';
import type { Patienteneintrag } from './uebersicht';
import { renderWithProviders } from '@/test-utils';

/** Macht die aktuelle URL innerhalb des MemoryRouter fuer Assertions sichtbar. */
function SearchParamsProbe() {
  const [params] = useSearchParams();
  return <span data-testid="search-params">{params.toString()}</span>;
}

/** Zeigt den Pfad im MemoryRouter - für den Sprung in die Akte. */
function OrtProbe() {
  return <span data-testid="ort">{useLocation().pathname}</span>;
}

const fetchPatientOverview = vi.fn();
vi.mock('./uebersicht', async (importOriginal) => {
  const actual = await importOriginal<typeof UebersichtApi>();
  return {
    ...actual,
    fetchPatientOverview: () => fetchPatientOverview() as Promise<Patienteneintrag[]>,
  };
});

const { PatientsListPage } = await import('./PatientsListPage');

function eintrag(
  id: string,
  given: string,
  family: string,
  overrides: Partial<Patienteneintrag> = {},
): Patienteneintrag {
  return {
    id,
    given_name: given,
    family_name: family,
    date_of_birth: '1957-04-30',
    email: null,
    phone: null,
    postal_code: '72070',
    city: 'Tuebingen',
    last_visit_on: null,
    next_appointment_at: null,
    open_bases: 0,
    bases_need_appointments: 0,
    bases_need_followup: 0,
    bases_ready: 0,
    bases_in_billing: 0,
    billing_visible: false,
    invoices_issued: null,
    invoices_paid: null,
    outstanding_cents: null,
    invoices_overdue: null,
    reminders_due: null,
    ...overrides,
  };
}

/** Die Namen der Zeilen in der angezeigten Reihenfolge. */
function reihenfolge(): string[] {
  return screen
    .getAllByRole('link', { name: /, / })
    .map((link) => (link.textContent ?? '').split(/\d/)[0]?.trim() ?? '');
}

describe('PatientsListPage (B1, B10)', () => {
  it('listet die vom Server freigegebenen Patient:innen - ohne „Nicht in Versorgung“', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Max', 'Mustermann'),
      eintrag('2', 'Erika', 'Beispiel'),
    ]);

    renderWithProviders(<PatientsListPage />);

    expect(await screen.findByRole('link', { name: /Mustermann, Max/ })).toHaveAttribute(
      'href',
      '/patienten/1',
    );
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();
    // BEF-151: Den Versorgungsstatus gibt es nicht mehr - weder als Etikett
    // noch als Filter.
    expect(screen.queryByText(/in Versorgung/i)).toBeNull();
    expect(screen.queryByLabelText('Versorgung')).toBeNull();
  });

  it('bietet das Anlegen unter demselben Namen wie die Kopfsuche an (PAT-21)', async () => {
    fetchPatientOverview.mockResolvedValue([]);
    renderWithProviders(<PatientsListPage />);

    expect(await screen.findByRole('link', { name: 'Patient:in anlegen' })).toHaveAttribute(
      'href',
      '/patienten/neu',
    );
  });

  // PAT-08: Die Akte führt zurück in genau diese Ansicht.
  it('gibt der Akte Suche, Sortierung und Auswahl als Rückweg mit', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Max', 'Mustermann'),
      eintrag('2', 'Erika', 'Beispiel', { bases_need_appointments: 1, open_bases: 1 }),
    ]);

    renderWithProviders(<PatientsListPage />, '/patienten?q=erika&sort=name&zeigen=termine_fehlen');

    const link = await screen.findByRole('link', { name: /Beispiel, Erika/ });
    const ziel = new URL(link.getAttribute('href') ?? '', 'http://liste.test');
    expect(ziel.pathname).toBe('/patienten/2');
    expect(ziel.searchParams.get('zurueck')).toBe(
      '/patienten?q=erika&sort=name&zeigen=termine_fehlen',
    );
  });

  it('sortiert nach zuletzt behandelt, offener Verordnung und A–Z', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Anna', 'Alt', { last_visit_on: '2026-01-10' }),
      eintrag('2', 'Bert', 'Brandneu', { last_visit_on: '2026-10-13' }),
      eintrag('3', 'Carla', 'Nie'),
      eintrag('4', 'Dora', 'Dazwischen', {
        last_visit_on: '2026-06-01',
        open_bases: 1,
        bases_need_appointments: 1,
      }),
      eintrag('5', 'Emil', 'Ende', { last_visit_on: '2026-09-01', open_bases: 1 }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Alt, Anna/ });

    // Vorgabe: zuletzt behandelt zuerst, nie Behandelte am Ende.
    expect(screen.getByRole('button', { name: 'Zuletzt' })).toHaveAttribute('aria-pressed', 'true');
    expect(reihenfolge()).toEqual([
      'Brandneu, Bert',
      'Ende, Emil',
      'Dazwischen, Dora',
      'Alt, Anna',
      'Nie, Carla',
    ]);

    // Offene Verordnung zuerst: was Arbeit verlangt, dann was läuft, dann A–Z.
    await user.click(screen.getByRole('button', { name: 'Verordnung' }));
    expect(reihenfolge()).toEqual([
      'Dazwischen, Dora',
      'Ende, Emil',
      'Alt, Anna',
      'Brandneu, Bert',
      'Nie, Carla',
    ]);

    await user.click(screen.getByRole('button', { name: 'A–Z' }));
    expect(reihenfolge()).toEqual([
      'Alt, Anna',
      'Brandneu, Bert',
      'Dazwischen, Dora',
      'Ende, Emil',
      'Nie, Carla',
    ]);
  });

  it('macht Karteileichen sichtbar: Auswahl mit Anzahl, Zeichen und Wort an der Zeile', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Max', 'Mustermann', { open_bases: 1, bases_need_appointments: 1 }),
      eintrag('2', 'Erika', 'Beispiel', { open_bases: 1, bases_ready: 1 }),
      eintrag('3', 'Jonas', 'Nachtrag', { open_bases: 1, bases_need_followup: 1 }),
      eintrag('4', 'Lea', 'Ruhig'),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Mustermann, Max/ });

    const zeigen = screen.getByRole('group', { name: 'Zeigen' });
    expect(
      within(zeigen).getByRole('button', { name: /Termine fehlen \(1\)/ }),
    ).toBeInTheDocument();
    expect(within(zeigen).getByRole('button', { name: /Abrechnen \(1\)/ })).toBeInTheDocument();
    expect(
      within(zeigen).getByRole('button', { name: /Haken oder Doku fehlt \(1\)/ }),
    ).toBeInTheDocument();
    // Ohne Treffer keine Auswahl - und Geld nur mit Recht.
    expect(within(zeigen).queryByRole('button', { name: /In der Abrechnung/ })).toBeNull();
    expect(within(zeigen).queryByRole('button', { name: /Zu mahnen/ })).toBeNull();

    // Zeichen und Wort an der Zeile (DESIGN.md Regel 5).
    expect(
      within(screen.getByRole('link', { name: /Mustermann, Max/ })).getByText('Termine fehlen'),
    ).toHaveTextContent('!Termine fehlen');
    expect(
      within(screen.getByRole('link', { name: /Beispiel, Erika/ })).getByText('Abrechnen'),
    ).toBeInTheDocument();

    await user.click(within(zeigen).getByRole('button', { name: /Abrechnen \(1\)/ }));
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Mustermann, Max/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ruhig, Lea/ })).toBeNull();
  });

  it('zeigt Offenes und zu Mahnendes nur, wenn der Server es liefert (ANN-139, ANN-516)', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Max', 'Mustermann', {
        billing_visible: true,
        invoices_issued: 2,
        invoices_paid: 1,
        outstanding_cents: 12000,
        invoices_overdue: 1,
        reminders_due: 1,
      }),
      eintrag('2', 'Erika', 'Beispiel', {
        billing_visible: true,
        invoices_issued: 1,
        invoices_paid: 1,
        outstanding_cents: 0,
        invoices_overdue: 0,
        reminders_due: 0,
      }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<PatientsListPage />);
    const max = await screen.findByRole('link', { name: /Mustermann, Max/ });

    expect(within(max).getByText('Zu mahnen')).toBeInTheDocument();
    expect(within(max).getByText(/120,00/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('link', { name: /Beispiel, Erika/ })).queryByText(/€/),
    ).toBeNull();

    const zeigen = screen.getByRole('group', { name: 'Zeigen' });
    await user.click(within(zeigen).getByRole('button', { name: /Zu mahnen \(1\)/ }));
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Beispiel, Erika/ })).toBeNull();
    });
    expect(
      within(zeigen).getByRole('button', { name: /Offene Rechnung \(1\)/ }),
    ).toBeInTheDocument();
  });

  it('filtert die Anzeige ueber die Suche', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Max', 'Mustermann'),
      eintrag('2', 'Erika', 'Beispiel'),
    ]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Mustermann, Max/ });

    // B10: ab dem ersten Zeichen, keine Mindestlänge - „k“ trifft nur Erika.
    await user.type(screen.getByLabelText('Patient:in suchen'), 'k');

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Mustermann, Max/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();
  });

  it('zeigt bei einem Fehler eine verstaendliche Meldung statt einer leeren Liste', async () => {
    fetchPatientOverview.mockRejectedValue(new Error('rls'));

    renderWithProviders(<PatientsListPage />);

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Die Patientenliste konnte nicht geladen werden.');
    // Kein technisches Detail nach aussen (PROJECT_PRINCIPLES.md 13).
    expect(meldung.textContent).not.toMatch(/rls/i);
    expect(meldung.textContent).not.toMatch(/angemeldet/);
    expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
  });

  it('laedt die Liste nach einem Fehler auf Wunsch erneut (UIK-16)', async () => {
    fetchPatientOverview.mockReset();
    fetchPatientOverview.mockRejectedValueOnce(new Error('offline'));
    fetchPatientOverview.mockResolvedValueOnce([eintrag('1', 'Max', 'Mustermann')]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    const meldung = await screen.findByRole('alert');
    await user.click(within(meldung).getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByRole('link', { name: /Mustermann, Max/ })).toBeInTheDocument();
    expect(fetchPatientOverview).toHaveBeenCalledTimes(2);
  });

  it('zeigt eine leere Kartei ohne Fehlermeldung', async () => {
    fetchPatientOverview.mockResolvedValue([]);

    renderWithProviders(<PatientsListPage />);

    expect(await screen.findByText('Noch keine Patient:innen')).toBeInTheDocument();
    expect(
      screen.getByText('Die erste Akte entsteht über „Patient:in anlegen“.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('filtert ueber die Suche auch nach Ort, Telefon und E-Mail', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Max', 'Mustermann', { city: 'Tuebingen' }),
      eintrag('2', 'Erika', 'Beispiel', {
        city: 'Hamburg',
        phone: '0221 555123',
        email: 'erika@example.test',
      }),
    ]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Mustermann, Max/ });

    await user.type(screen.getByLabelText('Patient:in suchen'), '555123');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Mustermann, Max/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Patient:in suchen'));
    await user.type(screen.getByLabelText('Patient:in suchen'), 'hamburg');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Mustermann, Max/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();
  });

  it('zeigt "Keine Treffer" statt der Leerlauf-Meldung, wenn die Suche alles ausblendet', async () => {
    fetchPatientOverview.mockResolvedValue([eintrag('1', 'Max', 'Mustermann')]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Mustermann, Max/ });

    await user.type(screen.getByLabelText('Patient:in suchen'), 'zzz');

    expect(await screen.findByText('Keine Treffer')).toBeInTheDocument();
    expect(screen.queryByText('Noch keine Patient:innen')).toBeNull();
  });

  it('spiegelt Suche, Sortierung und Auswahl in der URL', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Max', 'Mustermann'),
      eintrag('2', 'Erika', 'Beispiel', { open_bases: 1, bases_ready: 1 }),
    ]);
    const user = userEvent.setup();

    renderWithProviders(
      <>
        <PatientsListPage />
        <SearchParamsProbe />
      </>,
    );
    await screen.findByRole('link', { name: /Mustermann, Max/ });
    expect(screen.getByTestId('search-params')).toHaveTextContent('');

    await user.type(screen.getByLabelText('Patient:in suchen'), 'erika');
    await waitFor(() => {
      expect(screen.getByTestId('search-params')).toHaveTextContent('q=erika');
    });

    await user.click(screen.getByRole('button', { name: 'A–Z' }));
    await user.click(screen.getByRole('button', { name: /Abrechnen \(1\)/ }));
    await waitFor(() => {
      const params = screen.getByTestId('search-params').textContent ?? '';
      expect(params).toContain('q=erika');
      expect(params).toContain('sort=name');
      expect(params).toContain('zeigen=abrechnen');
    });

    // Ein zweiter Tipp hebt die Auswahl auf; „Zuletzt“ ist die Vorgabe und
    // steht nicht in der Adresse.
    await user.click(screen.getByRole('button', { name: /Abrechnen \(1\)/ }));
    await user.click(screen.getByRole('button', { name: 'Zuletzt' }));
    await waitFor(() => {
      const params = screen.getByTestId('search-params').textContent ?? '';
      expect(params).toContain('q=erika');
      expect(params).not.toContain('zeigen');
      expect(params).not.toContain('sort');
    });
  });

  it('stellt Suche, Sortierung und Auswahl beim Aufruf einer geteilten URL wieder her', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Max', 'Mustermann', { open_bases: 1, bases_ready: 1 }),
      eintrag('2', 'Erika', 'Beispiel', { open_bases: 1, bases_ready: 1 }),
      eintrag('3', 'Erich', 'Zeisig'),
    ]);

    renderWithProviders(<PatientsListPage />, '/patienten?q=eri&sort=name&zeigen=abrechnen');

    expect(await screen.findByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Mustermann, Max/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Zeisig, Erich/ })).toBeNull();
    expect(screen.getByLabelText('Patient:in suchen')).toHaveValue('eri');
    expect(screen.getByRole('button', { name: 'A–Z' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignoriert ungueltige Werte aus der URL statt abzustuerzen', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Max', 'Mustermann'),
      eintrag('2', 'Erika', 'Beispiel'),
    ]);

    renderWithProviders(<PatientsListPage />, '/patienten?status=inactive&sort=quer&zeigen=x');

    expect(await screen.findByRole('link', { name: /Mustermann, Max/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zuletzt' })).toHaveAttribute('aria-pressed', 'true');
  });

  // B1, ANN-430: Ein Feld - Name in beiden Richtungen, Umlaute eingeebnet.
  it('sucht in einem Feld: Name in beiden Richtungen, ohne Umlautsorgen', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Max', 'Mustermann'),
      eintrag('2', 'Jürgen', 'Müller'),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Mustermann, Max/ });

    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
    expect(screen.queryByRole('combobox', { name: 'Patient:in suchen' })).toBeNull();

    const feld = screen.getByLabelText('Patient:in suchen');
    await user.type(feld, 'mueller jur');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Mustermann, Max/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Müller, Jürgen/ })).toBeInTheDocument();

    await user.clear(feld);
    await user.type(feld, 'Max Muster');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Müller, Jürgen/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Mustermann, Max/ })).toBeInTheDocument();
  });

  it('öffnet mit der Eingabetaste die Akte, wenn genau eine übrig ist', async () => {
    fetchPatientOverview.mockResolvedValue([
      eintrag('1', 'Max', 'Mustermann'),
      eintrag('2', 'Erika', 'Beispiel'),
    ]);
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <PatientsListPage />
        <OrtProbe />
      </>,
    );
    await screen.findByRole('link', { name: /Mustermann, Max/ });

    // Bei zwei Treffern bleibt die Liste stehen.
    await user.type(screen.getByLabelText('Patient:in suchen'), 'e{Enter}');
    expect(screen.getByTestId('ort')).toHaveTextContent(/^\/$/);

    await user.clear(screen.getByLabelText('Patient:in suchen'));
    await user.type(screen.getByLabelText('Patient:in suchen'), 'erika{Enter}');
    await waitFor(() => {
      expect(screen.getByTestId('ort')).toHaveTextContent('/patienten/2');
    });
  });
});
