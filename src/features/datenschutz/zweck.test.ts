import { describe, expect, it } from 'vitest';
import { mitZweck, type Auskunft } from './api';

/** Zweck der Zugriffe in Worten (ABN-017, BEF-107). */
describe('mitZweck', () => {
  it('nennt jede Aktion so, wie das Protokoll der Praxis sie nennt', () => {
    const auskunft: Auskunft = {
      erstellt_am: '2026-10-02T10:00:00Z',
      organisation: 'Praxis',
      patient_id: 'p1',
      rechtsgrundlage: 'Art. 15 Abs. 3 DSGVO',
      tabellen: {
        access_log: [
          { aktion: 'patient_record.viewed', zeitpunkt: '2026-10-01T08:00:00Z' },
          { aktion: 'unbekannt.x', zeitpunkt: '2026-10-01T09:00:00Z' },
        ],
      },
      nicht_enthalten: [],
    };
    const zeilen = mitZweck(auskunft).tabellen['access_log']!;
    expect(zeilen[0]!['zweck']).toBe('Patientenakte geöffnet');
    expect(zeilen[1]!['zweck']).toBe('unbekannt.x');
  });
});
