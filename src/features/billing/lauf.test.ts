import { describe, expect, it } from 'vitest';
import { kleinunternehmerHinweis, type Kandidat } from './api';
import { jeKreis, laufKandidaten, laufstand } from './lauf';

function kandidat(zusatz: Partial<Kandidat> = {}): Kandidat {
  return {
    patient_id: 'p1',
    training_relationship_id: null,
    patient_name: 'Max Mustermann',
    period_month: '2026-09-01',
    service_area: 'therapy',
    service_count: 3,
    total_cents: 42_000,
    currency: 'EUR',
    has_draft: false,
    draft_id: null,
    treatment_basis_id: null,
    basis_kind: null,
    basis_issued_on: null,
    first_performed_on: null,
    last_performed_on: null,
    cancelled_invoice_id: null,
    cancelled_invoice_number: null,
    draft_replaces_invoice_number: null,
    basis_released_at: null,
    ...zusatz,
  };
}

const HEUTE = '2026-10-15';

describe('Monatslauf: welche Zeile er aufnimmt (K13, ANN-544)', () => {
  it('nimmt einen abgeschlossenen Monat ohne Verordnung auf, den laufenden nicht', () => {
    expect(laufstand(kandidat(), HEUTE)).toBe('im_lauf');
    expect(laufstand(kandidat({ period_month: '2026-10-01' }), HEUTE)).toBe('laufender_monat');
    // Am Monatsersten ist der Vormonat abgeschlossen.
    expect(laufstand(kandidat({ period_month: '2026-09-01' }), '2026-10-01')).toBe('im_lauf');
  });

  it('nimmt eine Verordnung erst mit der Freigabe zur Abrechnung auf - gleich in welchem Monat', () => {
    const verordnung = { treatment_basis_id: 'b1', period_month: '2026-10-01' };
    expect(laufstand(kandidat(verordnung), HEUTE)).toBe('nicht_freigegeben');
    expect(
      laufstand(kandidat({ ...verordnung, basis_released_at: '2026-10-14T09:00:00Z' }), HEUTE),
    ).toBe('im_lauf');
  });

  it('lässt Korrekturen und Zeilen mit stehendem Entwurf aus', () => {
    expect(
      laufstand(kandidat({ cancelled_invoice_id: 'r1', has_draft: true, draft_id: 'd1' }), HEUTE),
    ).toBe('korrektur');
    expect(laufstand(kandidat({ has_draft: true, draft_id: 'd1' }), HEUTE)).toBe('entwurf_steht');
  });

  it('filtert die Zeilen für den Lauf und zählt je Nummernkreis', () => {
    const zeilen = [
      kandidat(),
      kandidat({ period_month: '2026-10-01' }),
      kandidat({ service_area: 'training', patient_id: null, training_relationship_id: 't1' }),
    ];
    expect(laufKandidaten(zeilen, HEUTE)).toHaveLength(2);
    expect(jeKreis([{ service_area: 'therapy' }, { service_area: 'training' }])).toEqual({
      therapy: 1,
      training: 1,
    });
  });
});

describe('Hinweis nach § 19 UStG (BEF-165)', () => {
  it('nimmt den Wortlaut aus dem Dokument, auch wenn er heute anders lautete', () => {
    expect(
      kleinunternehmerHinweis({
        small_business: true,
        small_business_notice: 'Wortlaut von damals',
      }),
    ).toBe('Wortlaut von damals');
    expect(kleinunternehmerHinweis({ small_business: false, small_business_notice: null })).toBe(
      null,
    );
  });

  it('ergänzt ihn nur für ältere Snapshots ohne den Schlüssel', () => {
    expect(kleinunternehmerHinweis({ small_business: true })).toMatch(/§ 19 Abs\. 1 UStG/);
    expect(kleinunternehmerHinweis({ small_business: false })).toBeNull();
  });
});
