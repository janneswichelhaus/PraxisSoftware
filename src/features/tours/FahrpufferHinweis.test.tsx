import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';

/** MAP-006c: der Fahrpuffer im Kalender — Warnung, keine Sperre. */

const zustand = vi.hoisted(() => ({
  stopps: [] as unknown[],
  zwischen: [] as unknown[],
}));

vi.mock('./fahrpuffer', () => ({
  useTagesstopps: () => ({ stopps: zustand.stopps, laedt: false, fehler: false }),
  useFahrten: () => ({
    route: { isFetching: false, data: { ok: true } },
    zwischen: zustand.zwischen,
    pruefungFehler: false,
  }),
}));

const { FahrpufferHinweis } = await import('./FahrpufferHinweis');

const ZWEI = [
  {
    nummer: 1,
    termin: { id: 'a', starts_at: '2026-09-10T07:05:00Z', ends_at: '2026-09-10T08:05:00Z' },
  },
  {
    nummer: 2,
    termin: { id: 'b', starts_at: '2026-09-10T08:15:00Z', ends_at: '2026-09-10T09:00:00Z' },
  },
];

function zeige() {
  renderWithProviders(
    <FahrpufferHinweis datum="2026-09-10" staffMemberId="anna" zeitzone="Europe/Berlin" stand="" />,
  );
}

beforeEach(() => {
  zustand.stopps = ZWEI;
});

describe('FahrpufferHinweis', () => {
  it('nennt den knappen Uebergang mit Minuten und fruehestem Beginn', () => {
    zustand.zwischen = [
      {
        sekunden: 720,
        pruefung: {
          from_appointment_id: 'a',
          to_appointment_id: 'b',
          travel_seconds: 720,
          earliest_start: '2026-09-10T08:20:00Z',
          shortfall_minutes: 5,
        },
      },
    ];
    zeige();
    expect(screen.getByText(/ein Übergang ist/)).toBeInTheDocument();
    expect(
      screen.getByText(/10:05 → 10:15: 5 Min. zu wenig, frühester Beginn 10:20 Uhr/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Tour' })).toHaveAttribute(
      'href',
      '/touren?person=anna&tag=2026-09-10',
    );
  });

  it('sagt "ungeprueft" statt "passt", wenn die Fahrzeit fehlt', () => {
    zustand.zwischen = [{ sekunden: null, pruefung: null }];
    zeige();
    expect(screen.getByText(/ohne Fahrzeit und deshalb nicht geprüft/)).toBeInTheDocument();
    expect(screen.queryByText(/rechtzeitig erreichbar/)).toBeNull();
  });

  it('bestaetigt, wenn alles passt', () => {
    zustand.zwischen = [
      {
        sekunden: 300,
        pruefung: {
          from_appointment_id: 'a',
          to_appointment_id: 'b',
          travel_seconds: 300,
          earliest_start: '2026-09-10T08:10:00Z',
          shortfall_minutes: 0,
        },
      },
    ];
    zeige();
    expect(screen.getByText(/rechtzeitig erreichbar/)).toBeInTheDocument();
  });

  it('zeigt nichts bei weniger als zwei Stopps', () => {
    zustand.stopps = ZWEI.slice(0, 1);
    zustand.zwischen = [];
    zeige();
    expect(screen.queryByText(/Fahrpuffer/)).toBeNull();
  });
});
