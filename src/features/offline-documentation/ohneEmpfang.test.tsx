import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import {
  ablageLeeren,
  dauerfachAendern,
  speicherImSpeicher,
  speicherSetzen,
} from '@/lib/geraeteablage';
import { useAbmeldeanfrage } from '@/app/abmeldeschutz';
import { AbmeldeschutzProvider } from '@/app/AbmeldeschutzProvider';
import { ohneNetzFuer } from '@/app/ohneNetz';
import { AufGeraetSichern } from './AufGeraetSichern';
import { EntwurfAbmeldewache } from './EntwurfAbmeldewache';
import { Geraetehinweis } from './Geraetehinweis';
import { TagesplanRaeumen } from './TagesplanRaeumen';
import { entwuerfeLesen, entwuerfeZuruecksetzen, entwurfSchreiben } from './entwuerfe';
import { praxisOhneNetz } from './ohneNetz';
import { einrichten } from './servicePhone';
import { tagesplanAblegen, tagesplanLesen } from './tagesplan';
import type { DayPlanEntry } from '@/features/day-plan/api';

/**
 * OFF-003: Abmelden mit Entwürfen, „Noch nicht übertragen", die Freigabe ohne
 * Netz für Praxiskonten und das Sichern an der Schreibseite (ADR-024 Punkte 6
 * und 9).
 */

const ANNA = 'konto-anna';
const ZONE = 'Europe/Berlin';
const KOPF = {
  beginn: '2026-10-12T08:00:00Z',
  ende: '2026-10-12T08:45:00Z',
  zeitzone: ZONE,
  name: 'Erika Beispiel',
  terminart: 'home_visit',
};

function verbunden(wert: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: wert, configurable: true });
}

function Kopfzeile() {
  const anfragen = useAbmeldeanfrage();
  return (
    <button type="button" onClick={() => anfragen?.()}>
      Abmelden
    </button>
  );
}

beforeEach(() => {
  speicherSetzen(speicherImSpeicher());
  entwuerfeZuruecksetzen();
});

afterEach(() => verbunden(true));

describe('EntwurfAbmeldewache', () => {
  it('meldet ohne Entwürfe sofort ab', async () => {
    const abmelden = vi.fn();
    renderWithProviders(
      <AbmeldeschutzProvider onAbmelden={abmelden}>
        <EntwurfAbmeldewache besitzer={ANNA} />
        <Kopfzeile />
      </AbmeldeschutzProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(abmelden).toHaveBeenCalledTimes(1);
  });

  it('nennt die Zahl; „auf dem Gerät lassen" behält, „verwerfen" verwirft ausdrücklich', async () => {
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: eins.');
    await entwurfSchreiben(ANNA, 't2', KOPF, 'Synthetisch: zwei.');
    const abmelden = vi.fn();
    renderWithProviders(
      <AbmeldeschutzProvider onAbmelden={abmelden}>
        <EntwurfAbmeldewache besitzer={ANNA} />
        <Kopfzeile />
      </AbmeldeschutzProvider>,
    );
    // Die Wache kennt die Zahl, sobald sie gelesen ist.
    await waitFor(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
      expect(screen.getByRole('dialog', { name: 'Noch nicht übertragen' })).toBeInTheDocument();
    });
    expect(screen.getByText(/2 Entwürfe/)).toBeInTheDocument();
    expect(abmelden).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Auf dem Gerät lassen und abmelden' }),
    );
    expect(abmelden).toHaveBeenCalledTimes(1);
    expect(await entwuerfeLesen(ANNA)).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    // Verwerfen nur nach Rückfrage: ein Tipp allein nimmt nichts (BEF-150).
    await userEvent.click(await screen.findByRole('button', { name: 'Verwerfen und abmelden' }));
    expect(abmelden).toHaveBeenCalledTimes(1);
    expect(await entwuerfeLesen(ANNA)).toHaveLength(2);
    expect(screen.getByText(/Verworfen sind sie weg – auch für die Praxis/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Endgültig verwerfen und abmelden' }));
    await waitFor(() => expect(abmelden).toHaveBeenCalledTimes(2));
    expect(await entwuerfeLesen(ANNA)).toHaveLength(0);
  });

  it('zählt Einträge mit, die diese Fassung nicht lesen kann, und nennt sie (BEF-150)', async () => {
    await dauerfachAendern(ANNA, 'entwuerfe', () => ({
      entwuerfe: [{ aus: 'einer späteren Fassung' }],
      unlesbar: [],
    }));
    const abmelden = vi.fn();
    renderWithProviders(
      <AbmeldeschutzProvider onAbmelden={abmelden}>
        <EntwurfAbmeldewache besitzer={ANNA} />
        <Kopfzeile />
      </AbmeldeschutzProvider>,
    );
    await waitFor(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
      expect(screen.getByRole('dialog', { name: 'Noch nicht übertragen' })).toBeInTheDocument();
    });
    expect(abmelden).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Darunter ein Eintrag, den diese Fassung der Anwendung nicht lesen kann/),
    ).toBeInTheDocument();
  });
});

describe('Geraetehinweis', () => {
  it('zählt auch Einträge, die diese Fassung nicht lesen kann (BEF-150)', async () => {
    await dauerfachAendern(ANNA, 'entwuerfe', () => ({ entwuerfe: [], unlesbar: [{ x: 1 }] }));
    renderWithProviders(<Geraetehinweis besitzer={ANNA} />);
    expect(await screen.findByText('Noch nicht übertragen:')).toBeInTheDocument();
    expect(screen.getByText(/ein Entwurf auf/)).toBeInTheDocument();
  });

  it('sagt „Noch nicht übertragen" mit der Zahl, auch mit Verbindung', async () => {
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch.');
    renderWithProviders(<Geraetehinweis besitzer={ANNA} />);
    expect(await screen.findByText('Noch nicht übertragen:')).toBeInTheDocument();
    expect(screen.getByText(/ein Entwurf auf/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Auf dem Gerät ansehen' })).toHaveAttribute(
      'href',
      '/auf-dem-geraet',
    );
  });

  it('steht ohne Entwürfe nur ohne Verbindung und nur auf einem eingerichteten Gerät', async () => {
    verbunden(false);
    const { unmount } = renderWithProviders(<Geraetehinweis besitzer={ANNA} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('link')).toBeNull();
    unmount();
    await einrichten(ANNA);
    renderWithProviders(<Geraetehinweis besitzer={ANNA} />);
    expect(await screen.findByText(/liegen auf diesem Gerät/)).toBeInTheDocument();
  });
});

describe('Freigabe ohne Netz für Praxiskonten', () => {
  it('öffnet nur mit Entwürfen oder dem Tagesplan auf einem eingerichteten Gerät', async () => {
    const ohne = praxisOhneNetz(ANNA);
    expect(await ohne.hatAblage()).toBe(false);
    await einrichten(ANNA);
    expect(await ohne.hatAblage()).toBe(false);
    const heute = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
    await tagesplanAblegen(ANNA, ZONE, heute, [
      {
        id: 't1',
        kind: 'therapy',
        appointment_type: 'home_visit',
        status: 'confirmed',
        starts_at: `${heute}T08:00:00Z`,
        ends_at: `${heute}T08:45:00Z`,
        title: null,
        patient_given_name: 'Erika',
        patient_family_name: 'Beispiel',
        visit_street: null,
        visit_house_number: null,
        visit_postal_code: null,
        visit_city: null,
        patient_phone: null,
        patient_phone_mobile: null,
      } as unknown as DayPlanEntry,
    ]);
    expect(await ohne.hatAblage()).toBe(true);
    await ablageLeeren();
    expect(await ohne.hatAblage()).toBe(false);
    // Ein Entwurf öffnet auch nach dem Abmelden (Dauerablage).
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch.');
    expect(await ohne.hatAblage()).toBe(true);
  });

  it('die Sperre wählt die Praxis, wenn dort etwas liegt, und sagt, was sich öffnet', async () => {
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch.');
    const ohne = ohneNetzFuer(ANNA);
    expect(await ohne.hatAblage()).toBe(true);
    expect(ohne.einleitung).toMatch(/Tagesplan von heute und Ihre Entwürfe/);
    const fremd = ohneNetzFuer('konto-ben');
    expect(await fremd.hatAblage()).toBe(false);
  });
});

describe('AufGeraetSichern an der Schreibseite', () => {
  it('steht nur ohne Verbindung auf einem eingerichteten Gerät und sichert dorthin', async () => {
    const gesichert = vi.fn();
    verbunden(false);
    const { unmount } = renderWithProviders(
      <AufGeraetSichern
        besitzer={ANNA}
        terminId="t1"
        kopf={KOPF}
        text="Synthetisch."
        onGesichert={gesichert}
      />,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: 'Auf dem Gerät sichern' })).toBeNull();
    unmount();
    await einrichten(ANNA);
    renderWithProviders(
      <AufGeraetSichern
        besitzer={ANNA}
        terminId="t1"
        kopf={KOPF}
        text="Synthetisch."
        onGesichert={gesichert}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Auf dem Gerät sichern' }));
    await waitFor(() => expect(gesichert).toHaveBeenCalled());
    expect((await entwuerfeLesen(ANNA))[0]).toMatchObject({ terminId: 't1', text: 'Synthetisch.' });
  });
});

describe('TagesplanRaeumen (BEF-150)', () => {
  it('nimmt den Tagesplan vom Gerät, sobald das Konto nicht mehr dokumentieren darf', async () => {
    await einrichten(ANNA);
    const heute = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
    await tagesplanAblegen(ANNA, ZONE, heute, []);
    expect(await tagesplanLesen(ANNA)).not.toBeNull();
    renderWithProviders(<TagesplanRaeumen besitzer={ANNA} />);
    await waitFor(async () => expect(await tagesplanLesen(ANNA)).toBeNull());
  });
});
