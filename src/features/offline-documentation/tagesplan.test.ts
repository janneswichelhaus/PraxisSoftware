import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ablageLeeren, fachLesen, speicherImSpeicher, speicherSetzen } from '@/lib/geraeteablage';
import { ausschalten, einrichten, einrichtungLesen } from './servicePhone';
import {
  alsTagesplanTermin,
  tagesplanAblegen,
  tagesplanLesen,
  tagesplanTerminSchema,
  tagesplanVerwerfen,
} from './tagesplan';
import { entwuerfeLesen, entwurfSchreiben } from './entwuerfe';
import type { DayPlanEntry } from '@/lib/tagesplan';

/** OFF-001: Einrichtung des Diensttelefons und die Feldliste des Tagesplans (ADR-024 Punkt 6). */

const ANNA = 'konto-anna';
const ZONE = 'Europe/Berlin';

function eintrag(teil: Partial<DayPlanEntry> = {}): DayPlanEntry {
  return {
    id: 'termin-1',
    patient_id: 'patient-1',
    staff_member_id: 'staff-anna',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: '2026-10-12T08:00:00.000Z',
    ends_at: '2026-10-12T08:45:00.000Z',
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: null,
    visit_street: 'Musterweg',
    visit_house_number: '3',
    visit_postal_code: '72070',
    visit_city: 'Tübingen',
    patient_phone: '07071 000000',
    patient_phone_mobile: null,
    home_visit_access_note: 'Klingel defekt, Rollator im Flur',
    special_note: 'Diabetes',
    documentation_status: 'draft',
    organization_time_zone: ZONE,
    visit_lat: 48.5,
    visit_lon: 9.05,
    treatment_table_required: true,
    take_along_items: ['Liege'],
    training_relationship_id: null,
    training_given_name: null,
    training_family_name: null,
    ...teil,
  };
}

beforeEach(() => {
  speicherSetzen(speicherImSpeicher());
  vi.useFakeTimers({ now: new Date('2026-10-12T07:00:00Z'), toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Diensttelefon einrichten (OFF-001)', () => {
  it('ist von Anfang an aus und gilt nur für das eigene Konto', async () => {
    expect(await einrichtungLesen(ANNA)).toBeNull();
    await einrichten(ANNA);
    expect(await einrichtungLesen(ANNA)).not.toBeNull();
    expect(await einrichtungLesen('konto-ben')).toBeNull();
  });

  it('überlebt das Abmelden (Dauerablage)', async () => {
    await einrichten(ANNA);
    await ablageLeeren();
    expect(await einrichtungLesen(ANNA)).not.toBeNull();
  });

  it('Ausschalten nimmt Tagesplan und Schlüssel mit', async () => {
    await einrichten(ANNA);
    await tagesplanAblegen(ANNA, ZONE, '2026-10-12', [eintrag()]);
    await ausschalten(ANNA);
    expect(await einrichtungLesen(ANNA)).toBeNull();
    expect(await fachLesen(ANNA, 'tagesplan')).toBeUndefined();
  });
});

describe('Tagesplan auf dem Gerät (OFF-001)', () => {
  it('legt ohne Einrichtung nichts ab', async () => {
    await tagesplanAblegen(ANNA, ZONE, '2026-10-12', [eintrag()]);
    expect(await tagesplanLesen(ANNA)).toBeNull();
  });

  it('legt genau die Feldliste ab - kein Zugangshinweis, keine Besonderheit, kein Dokumentationsstand', async () => {
    await einrichten(ANNA);
    await tagesplanAblegen(ANNA, ZONE, '2026-10-12', [eintrag()]);
    const plan = await tagesplanLesen(ANNA);
    expect(plan?.termine).toHaveLength(1);
    const termin = plan!.termine[0]!;
    expect(Object.keys(termin).sort()).toEqual(Object.keys(tagesplanTerminSchema.shape).sort());
    const roh = JSON.stringify(await fachLesen(ANNA, 'tagesplan'));
    for (const verboten of ['Klingel', 'Diabetes', 'Liege', 'patient-1', '48.5', 'draft']) {
      expect(roh).not.toContain(verboten);
    }
    expect(termin).toMatchObject({
      given_name: 'Erika',
      visit_city: 'Tübingen',
      phone: '07071 000000',
    });
  });

  it('nimmt am Training den Namen aus dem Training und an einem Ereignis nur den Titel', () => {
    expect(
      alsTagesplanTermin(
        eintrag({ kind: 'training', patient_given_name: null, training_given_name: 'Tom' }),
      ).given_name,
    ).toBe('Tom');
    expect(alsTagesplanTermin(eintrag({ kind: 'therapy', title: 'X' })).title).toBeNull();
    expect(alsTagesplanTermin(eintrag({ kind: 'internal', title: 'Teamrunde' }))).toMatchObject({
      title: 'Teamrunde',
      given_name: null,
      visit_street: null,
      phone: null,
    });
  });

  it('legt nur den Plan von heute ab', async () => {
    await einrichten(ANNA);
    await tagesplanAblegen(ANNA, ZONE, '2026-10-13', [eintrag()]);
    expect(await tagesplanLesen(ANNA)).toBeNull();
  });

  it('fällt am Ende des Tages', async () => {
    await einrichten(ANNA);
    await tagesplanAblegen(ANNA, ZONE, '2026-10-12', [eintrag()]);
    vi.setSystemTime(new Date('2026-10-12T21:59:00Z'));
    expect(await tagesplanLesen(ANNA)).not.toBeNull();
    vi.setSystemTime(new Date('2026-10-12T22:01:00Z'));
    expect(await tagesplanLesen(ANNA)).toBeNull();
    expect(await fachLesen(ANNA, 'tagesplan')).toBeUndefined();
  });

  it('fällt beim Abmelden', async () => {
    await einrichten(ANNA);
    await tagesplanAblegen(ANNA, ZONE, '2026-10-12', [eintrag()]);
    await ablageLeeren();
    expect(await tagesplanLesen(ANNA)).toBeNull();
  });
});

describe('Ohne Dokumentationsrecht (BEF-150)', () => {
  it('räumt den Tagesplan sofort, die Entwürfe bleiben', async () => {
    await einrichten(ANNA);
    await tagesplanAblegen(ANNA, ZONE, '2026-10-12', [eintrag()]);
    await entwurfSchreiben(
      ANNA,
      't1',
      {
        beginn: '2026-10-12T08:00:00Z',
        ende: '2026-10-12T08:45:00Z',
        zeitzone: ZONE,
        name: 'Erika Beispiel',
        terminart: 'home_visit',
      },
      'Synthetisch: geschrieben, bevor das Recht wegfiel.',
    );
    expect(await tagesplanLesen(ANNA)).not.toBeNull();
    await tagesplanVerwerfen(ANNA);
    expect(await fachLesen(ANNA, 'tagesplan')).toBeUndefined();
    // Die Einrichtung bleibt, und ein Entwurf fällt nie still (§13).
    expect(await einrichtungLesen(ANNA)).not.toBeNull();
    expect(await entwuerfeLesen(ANNA)).toHaveLength(1);
  });
});
