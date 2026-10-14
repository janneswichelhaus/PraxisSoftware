import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Bausteine from './textbausteine';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchTextSnippets = vi.fn();
const createTextSnippet = vi.fn();
const updateTextSnippet = vi.fn();
const deleteTextSnippet = vi.fn();

vi.mock('./textbausteine', async (importOriginal) => {
  const actual = await importOriginal<typeof Bausteine>();
  return {
    ...actual,
    fetchTextSnippets: () => fetchTextSnippets() as Promise<Bausteine.TextSnippet[]>,
    createTextSnippet: (...args: unknown[]) => createTextSnippet(...args) as Promise<string>,
    updateTextSnippet: (...args: unknown[]) => updateTextSnippet(...args) as Promise<void>,
    deleteTextSnippet: (...args: unknown[]) => deleteTextSnippet(...args) as Promise<void>,
  };
});

const { TextbausteinePage } = await import('./TextbausteinePage');

const PRAXIS: Bausteine.TextSnippet = {
  id: 'b1',
  title: 'Hausbesuch durchgefuehrt',
  body: 'Hausbesuch wie vereinbart durchgefuehrt.',
  shared: true,
  editable: false,
};

const EIGEN: Bausteine.TextSnippet = {
  id: 'b2',
  title: 'Manuelle Therapie',
  body: 'Manuelle Techniken angewendet.',
  shared: false,
  editable: true,
};

/** Für die Praxisinhaber:in ist ein Baustein der Praxis änderbar (Serverfunktion). */
const PRAXIS_FUER_OWNER: Bausteine.TextSnippet = { ...PRAXIS, editable: true };

const OWNER = testUser(['owner', 'therapist'], 'Jannes Test');

/**
 * Ohne diese Seite bliebe die Bausteinleiste leer (UX-008). Seit B5 legt
 * jede Person eigene Bausteine an: „Meine Bausteine“ ist der Inhalt, einen
 * Baustein der Praxis legt niemand mehr an. Vorhandene sieht nur die
 * Praxisinhaber:in, eingeklappt, zum Löschen; wer ihn nicht ändern darf,
 * bekommt ihn gar nicht erst zu sehen - die Serverfunktion weist ohnehin ab.
 */
describe('TextbausteinePage', () => {
  beforeEach(() => {
    fetchTextSnippets.mockReset();
    createTextSnippet.mockReset();
    updateTextSnippet.mockReset();
    deleteTextSnippet.mockReset();
    fetchTextSnippets.mockResolvedValue([PRAXIS, EIGEN]);
    createTextSnippet.mockResolvedValue('neu');
    updateTextSnippet.mockResolvedValue(undefined);
    deleteTextSnippet.mockResolvedValue(undefined);
  });

  it('zeigt einer Therapeut:in nur ihre eigenen Bausteine (B5)', async () => {
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    const eigene = (await screen.findByRole('heading', { name: 'Meine Bausteine (1)' })).closest(
      'section',
    )!;
    expect(within(eigene).getByText('Manuelle Therapie')).toBeInTheDocument();
    expect(screen.queryByText(PRAXIS.title)).toBeNull();
    expect(screen.queryByText(/Bausteine der Praxis/)).toBeNull();
  });

  it('zeigt der Praxisinhaber:in die Bausteine der Praxis eingeklappt am Ende (B5)', async () => {
    fetchTextSnippets.mockResolvedValue([PRAXIS_FUER_OWNER, EIGEN]);
    renderWithProviders(<TextbausteinePage user={OWNER} />, '/praxis/textbausteine');

    const eigene = await screen.findByRole('heading', { name: 'Meine Bausteine (1)' });
    const kopf = screen.getByText('Bausteine der Praxis (nicht in der Leiste)');
    const aufklapper = kopf.closest('details')!;
    expect(aufklapper).not.toHaveAttribute('open');
    // „Meine Bausteine“ zuerst, die Bausteine der Praxis danach.
    expect(eigene.compareDocumentPosition(aufklapper)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      within(aufklapper).getByRole('link', { name: /Hausbesuch durchgefuehrt/ }),
    ).toHaveAttribute('href', '/praxis/textbausteine?baustein=b1');
  });

  it('zeigt der Praxisinhaber:in ohne Bausteine der Praxis keinen Aufklapper', async () => {
    fetchTextSnippets.mockResolvedValue([EIGEN]);
    renderWithProviders(<TextbausteinePage user={OWNER} />);

    await screen.findByRole('heading', { name: 'Meine Bausteine (1)' });
    expect(screen.queryByText(/Bausteine der Praxis/)).toBeNull();
  });

  it('führt aus der Liste in den einzelnen Baustein, mit dem mitgereisten Rückweg', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TextbausteinePage user={testUser(['therapist'])} />,
      '/praxis/textbausteine?zurueck=%2Ftermine%2Ft1%2Fabschluss',
    );

    const zeile = await screen.findByRole('link', { name: /Manuelle Therapie/ });
    expect(zeile).toHaveAttribute(
      'href',
      '/praxis/textbausteine?zurueck=%2Ftermine%2Ft1%2Fabschluss&baustein=b2',
    );
    await user.click(zeile);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Manuelle Therapie' }),
    ).toBeInTheDocument();
    expect(screen.getByText(EIGEN.body)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alle Textbausteine/ })).toHaveAttribute(
      'href',
      '/praxis/textbausteine?zurueck=%2Ftermine%2Ft1%2Fabschluss',
    );
  });

  it('kennzeichnet den Geltungsbereich als Text, nicht als Farbe', async () => {
    fetchTextSnippets.mockResolvedValue([PRAXIS_FUER_OWNER, EIGEN]);
    const praxis = renderWithProviders(
      <TextbausteinePage user={OWNER} />,
      '/praxis/textbausteine?baustein=b1',
    );
    expect(await screen.findByText('Praxis')).toBeInTheDocument();
    praxis.unmount();
    renderWithProviders(
      <TextbausteinePage user={testUser(['therapist'])} />,
      '/praxis/textbausteine?baustein=b2',
    );
    expect(await screen.findByText('Nur ich')).toBeInTheDocument();
  });

  it('zeigt einem therapist den Baustein der Praxis auch über die Adresse nicht', async () => {
    renderWithProviders(
      <TextbausteinePage user={testUser(['therapist'])} />,
      '/praxis/textbausteine?baustein=b1',
    );

    // Statt des Bausteins steht die Liste da - ohne ihn, ohne Knöpfe für ihn.
    await screen.findByRole('heading', { name: 'Meine Bausteine (1)' });
    expect(screen.getByRole('heading', { level: 1, name: 'Textbausteine' })).toBeInTheDocument();
    expect(screen.queryByText(PRAXIS.title)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Löschen' })).toBeNull();
  });

  it('lässt die Praxisinhaber:in einen Baustein der Praxis löschen, nicht mehr bearbeiten', async () => {
    fetchTextSnippets.mockResolvedValue([PRAXIS_FUER_OWNER, EIGEN]);
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinePage user={OWNER} />, '/praxis/textbausteine?baustein=b1');

    await screen.findByRole('heading', { level: 1, name: PRAXIS.title });
    expect(screen.getByText('Baustein der Praxis, nicht in der Leiste.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(deleteTextSnippet).not.toHaveBeenCalled();
    fetchTextSnippets.mockResolvedValue([EIGEN]);
    await user.click(screen.getByRole('button', { name: 'Ja, Baustein löschen' }));
    await waitFor(() => expect(deleteTextSnippet).toHaveBeenCalledWith(PRAXIS.id));
    expect(
      await screen.findByText(/Baustein „Hausbesuch durchgefuehrt“ gelöscht\./),
    ).toBeInTheDocument();
  });

  it('zeigt ohne Recht der Serverfunktion weder „Löschen“ noch einen Erklärsatz', async () => {
    // Rolle aus der Sitzung, `editable` vom Server: Widersprechen sie sich
    // (Rolle inzwischen entzogen), endet der Baustein mit seinem Text.
    renderWithProviders(<TextbausteinePage user={OWNER} />, '/praxis/textbausteine?baustein=b1');

    await screen.findByRole('heading', { level: 1, name: PRAXIS.title });
    expect(screen.getByText(PRAXIS.body)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).toBeNull();
    expect(screen.queryByText(/pflegt die Praxisinhaber:in/)).toBeNull();
  });

  it('bearbeitet den eigenen Baustein im Einzelnen', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TextbausteinePage user={testUser(['therapist'])} />,
      '/praxis/textbausteine?baustein=b2',
    );

    await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    await user.type(screen.getByLabelText('Text *'), ' Ergänzt.');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(updateTextSnippet).toHaveBeenCalledWith(
        EIGEN.id,
        EIGEN.title,
        `${EIGEN.body} Ergänzt.`,
      ),
    );
  });

  it('legt auch für die Praxisinhaber:in nur noch eigene Bausteine an (B5)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinePage user={OWNER} />);

    await user.click(await screen.findByRole('button', { name: 'Baustein anlegen' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByLabelText(/Baustein der Praxis/)).toBeNull();
    await user.type(screen.getByLabelText('Titel *'), 'Neuer Baustein');
    await user.type(screen.getByLabelText('Text *'), 'Neuer Text');
    await user.click(screen.getByRole('button', { name: 'Baustein anlegen' }));

    await waitFor(() =>
      expect(createTextSnippet).toHaveBeenCalledWith('Neuer Baustein', 'Neuer Text', false),
    );
  });

  it('bietet einem therapist die Wahl des Geltungsbereichs nicht an', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    await user.click(await screen.findByRole('button', { name: 'Baustein anlegen' }));
    expect(screen.queryByLabelText(/Baustein der Praxis/)).toBeNull();
  });

  it('legt einen persoenlichen Baustein an', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    await user.click(await screen.findByRole('button', { name: 'Baustein anlegen' }));
    await user.type(screen.getByLabelText('Titel *'), 'Neuer Baustein');
    await user.type(screen.getByLabelText('Text *'), 'Neuer Text');
    await user.click(screen.getByRole('button', { name: 'Baustein anlegen' }));

    await waitFor(() =>
      expect(createTextSnippet).toHaveBeenCalledWith('Neuer Baustein', 'Neuer Text', false),
    );
  });

  it('haelt eine leere Eingabe inline auf und schreibt nicht', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    await user.click(await screen.findByRole('button', { name: 'Baustein anlegen' }));
    await user.click(screen.getByRole('button', { name: 'Baustein anlegen' }));

    expect(await screen.findByText('Ein Titel ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Der Baustein darf nicht leer sein.')).toBeInTheDocument();
    expect(createTextSnippet).not.toHaveBeenCalled();
  });

  it('fragt vor dem Loeschen nach und meldet es danach über der Liste', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TextbausteinePage user={testUser(['therapist'])} />,
      '/praxis/textbausteine?baustein=b2',
    );

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(
      await screen.findByRole('group', { name: /Baustein .Manuelle Therapie. löschen/ }),
    ).toBeInTheDocument();
    expect(deleteTextSnippet).not.toHaveBeenCalled();

    fetchTextSnippets.mockResolvedValue([PRAXIS]);
    await user.click(screen.getByRole('button', { name: 'Ja, Baustein löschen' }));
    await waitFor(() => expect(deleteTextSnippet).toHaveBeenCalledWith(EIGEN.id));
    expect(await screen.findByText(/Baustein „Manuelle Therapie“ gelöscht\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Textbausteine' })).toBeInTheDocument();
  });

  it('sagt beim Loeschen, dass geschriebene Dokumentation unberuehrt bleibt', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TextbausteinePage user={testUser(['therapist'])} />,
      '/praxis/textbausteine?baustein=b2',
    );

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(await screen.findByText(/bleibt davon unberührt/)).toBeInTheDocument();
  });

  it('ist fuer office nicht freigegeben und fragt nichts ab', async () => {
    renderWithProviders(<TextbausteinePage user={testUser(['office'], 'Olivia Office')} />);
    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    expect(fetchTextSnippets).not.toHaveBeenCalled();
  });

  it('bestätigt das Anlegen über der Liste und setzt den Fokus dorthin (DOK-15)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    await user.click(await screen.findByRole('button', { name: 'Baustein anlegen' }));
    await user.type(screen.getByLabelText('Titel *'), 'Neuer Baustein');
    await user.type(screen.getByLabelText('Text *'), 'Neuer Text');
    await user.click(screen.getByRole('button', { name: 'Baustein anlegen' }));

    const meldung = await screen.findByText('Baustein „Neuer Baustein“ angelegt.');
    await waitFor(() => expect(meldung.closest('[tabindex="-1"]')).toHaveFocus());
  });

  it('sagt beim Löschen, was geschieht, mit schließendem Anführungszeichen (WRT-06, WRT-21)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TextbausteinePage user={testUser(['therapist'])} />,
      '/praxis/textbausteine?baustein=b2',
    );

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    const kasten = await screen.findByRole('group', {
      name: 'Baustein „Manuelle Therapie“ löschen',
    });
    expect(kasten).toHaveTextContent('Der Baustein wird gelöscht.');
  });

  it('bietet bei einem Ladefehler einen neuen Versuch an (WRT-01)', async () => {
    fetchTextSnippets.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(<TextbausteinePage user={testUser(['therapist'])} />);

    expect(
      await screen.findByText('Die Textbausteine konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });

  describe('Rückweg und Schutz ungespeicherter Eingaben (DOK-01, DOK-03)', () => {
    const DOKU = '/termine/t1/dokumentation';

    it('hat als Bereichsseite ohne mitgereisten Rückweg keinen', async () => {
      renderWithProviders(
        <TextbausteinePage user={testUser(['therapist'])} />,
        '/praxis/textbausteine',
      );

      await screen.findByRole('heading', { name: /^Meine Bausteine/ });
      expect(screen.queryByRole('link', { name: /Zurück/ })).toBeNull();
    });

    it('führt aus der Dokumentation dorthin zurück', async () => {
      renderWithProviders(
        <TextbausteinePage user={testUser(['therapist'])} />,
        `/praxis/textbausteine?zurueck=${encodeURIComponent(DOKU)}`,
      );

      expect(await screen.findByRole('link', { name: /Zurück zur Dokumentation/ })).toHaveAttribute(
        'href',
        DOKU,
      );
    });

    it('fragt vor dem Weggehen nach, wenn ein Baustein halb geschrieben ist', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <TextbausteinePage user={testUser(['therapist'])} />,
        `/praxis/textbausteine?zurueck=${encodeURIComponent(DOKU)}`,
      );

      await user.click(await screen.findByRole('button', { name: 'Baustein anlegen' }));
      await user.type(screen.getByLabelText('Text *'), 'Halb geschrieben');
      await user.click(screen.getByRole('link', { name: /Zurück zur Dokumentation/ }));

      const kasten = await screen.findByRole('group', { name: 'Ungespeicherter Textbaustein' });
      expect(kasten).toHaveTextContent(
        'Die Eingaben sind noch nicht gespeichert. Beim Weitergehen gehen sie verloren.',
      );
      // Ein Baustein kennt keinen Entwurf: nur Verwerfen oder Bleiben (ANN-046).
      expect(within(kasten).queryByRole('button', { name: /Speichern/ })).toBeNull();
      await user.click(within(kasten).getByRole('button', { name: 'Hier bleiben' }));
      expect(screen.getByLabelText('Text *')).toHaveValue('Halb geschrieben');
    });

    it('lässt ohne Eingaben ohne Rückfrage gehen', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <TextbausteinePage user={testUser(['therapist'])} />,
        `/praxis/textbausteine?zurueck=${encodeURIComponent(DOKU)}`,
      );

      await user.click(await screen.findByRole('button', { name: 'Baustein anlegen' }));
      await user.click(screen.getByRole('link', { name: /Zurück zur Dokumentation/ }));
      expect(screen.queryByRole('group', { name: 'Ungespeicherter Textbaustein' })).toBeNull();
    });
  });
});
