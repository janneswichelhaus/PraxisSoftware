import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  ausfallhonorarRegel,
  datenschutzinformation,
  DATENSCHUTZINFORMATION_FASSUNG,
} from './patienteninformation';
import { datenschutzstand, EINWILLIGUNGSZWECKE, type Datenschutzvermerk } from './vermerke';

/**
 * Die jüngste Migration, die den Constraint der Zwecke setzt - seit DOK-006b
 * nicht mehr die, die die Tabelle angelegt hat.
 */
const MIGRATION = readdirSync('supabase/migrations')
  .filter((datei) => datei.endsWith('.sql'))
  .sort()
  .map((datei) => readFileSync(`supabase/migrations/${datei}`, 'utf8'))
  .filter((inhalt) => /check \(\s*purpose in \(/.test(inhalt))
  .at(-1)!;

function vermerk(
  rest: Partial<Datenschutzvermerk> & Pick<Datenschutzvermerk, 'record_kind'>,
): Datenschutzvermerk {
  return {
    id: crypto.randomUUID(),
    purpose: null,
    notice_version: null,
    occurred_on: '2026-09-01',
    recorded_at: '2026-09-01T08:00:00Z',
    ...rest,
  };
}

describe('datenschutzstand', () => {
  it('kennt ohne Vermerk nichts', () => {
    const stand = datenschutzstand([]);
    expect(stand.datenschutzinformation).toBeNull();
    expect(stand.behandlungsvertrag).toBeNull();
    expect(stand.einwilligungen.every((e) => !e.erteilt && e.seit === null)).toBe(true);
  });

  it('nimmt je Zweck die juengste Eingabe, nicht das juengste Papierdatum', () => {
    const stand = datenschutzstand([
      // Nachgetragen: der Widerruf wurde zuerst eingegeben, die Erteilung am
      // selben Papiertag erst danach - dann gilt die Erteilung.
      vermerk({
        record_kind: 'consent_granted',
        purpose: 'email_contact',
        occurred_on: '2026-09-03',
        recorded_at: '2026-09-05T10:00:00Z',
      }),
      vermerk({
        record_kind: 'consent_withdrawn',
        purpose: 'email_contact',
        occurred_on: '2026-09-04',
        recorded_at: '2026-09-04T10:00:00Z',
      }),
    ]);
    expect(stand.einwilligungen.find((e) => e.zweck === 'email_contact')).toEqual({
      zweck: 'email_contact',
      erteilt: true,
      abgelehnt: false,
      seit: '2026-09-03',
    });
  });

  it('haelt einen Widerruf als widerrufen, nicht als nie erteilt', () => {
    const stand = datenschutzstand([
      vermerk({ record_kind: 'consent_granted', purpose: 'prescriber_report' }),
      vermerk({
        record_kind: 'consent_withdrawn',
        purpose: 'prescriber_report',
        occurred_on: '2026-09-10',
        recorded_at: '2026-09-10T08:00:00Z',
      }),
    ]);
    expect(stand.einwilligungen.find((e) => e.zweck === 'prescriber_report')).toEqual({
      zweck: 'prescriber_report',
      erteilt: false,
      abgelehnt: false,
      seit: '2026-09-10',
    });
  });

  it('haelt eine Ablehnung als erledigten Stand, nicht als Widerruf (ADR-017 Punkt 35)', () => {
    const stand = datenschutzstand([
      vermerk({ record_kind: 'consent_refused', purpose: 'patient_photos' }),
    ]);
    expect(stand.einwilligungen.find((e) => e.zweck === 'patient_photos')).toEqual({
      zweck: 'patient_photos',
      erteilt: false,
      abgelehnt: true,
      seit: '2026-09-01',
    });
  });

  it('gibt nach einer Ablehnung eine spaetere Erteilung wieder', () => {
    const stand = datenschutzstand([
      vermerk({ record_kind: 'consent_refused', purpose: 'patient_photos' }),
      vermerk({
        record_kind: 'consent_granted',
        purpose: 'patient_photos',
        occurred_on: '2026-09-12',
        recorded_at: '2026-09-12T08:00:00Z',
      }),
    ]);
    const fotos = stand.einwilligungen.find((e) => e.zweck === 'patient_photos');
    expect(fotos?.erteilt).toBe(true);
    expect(fotos?.abgelehnt).toBe(false);
  });

  it('zeigt die zuletzt ausgehaendigte Fassung', () => {
    const stand = datenschutzstand([
      vermerk({ record_kind: 'privacy_notice_handed_out', notice_version: '2026-01' }),
      vermerk({
        record_kind: 'privacy_notice_handed_out',
        notice_version: '2026-09',
        occurred_on: '2026-09-20',
        recorded_at: '2026-09-20T08:00:00Z',
      }),
      vermerk({ record_kind: 'treatment_contract_signed', occurred_on: '2026-09-02' }),
    ]);
    expect(stand.datenschutzinformation).toEqual({ am: '2026-09-20', fassung: '2026-09' });
    expect(stand.behandlungsvertrag).toEqual({ am: '2026-09-02' });
  });
});

describe('ANN-093: Zwecke und Datenbank', () => {
  it('fuehrt dieselben Zwecke wie der Constraint', () => {
    const treffer = /check \(\s*purpose in \(([^)]*)\)\s*\)/.exec(MIGRATION);
    const inDatenbank = [...(treffer?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(inDatenbank.sort()).toEqual([...EINWILLIGUNGSZWECKE].sort());
  });

  it('fuehrt eine Fassung in der Form, die die Datenbank annimmt', () => {
    expect(DATENSCHUTZINFORMATION_FASSUNG).toMatch(/^[0-9]{4}-[0-9]{2}$/);
  });
});

describe('Datenschutzinformation', () => {
  const text = datenschutzinformation('Test Praxis')
    .flatMap((a) => [a.titel, ...a.absaetze])
    .join('\n');

  it('nennt den Kartendienst mit den Grenzen aus ADR-019', () => {
    expect(text).toMatch(/Kartendienst/);
    expect(text).toMatch(/nie Ihren Namen, keine Termine, keine Uhrzeiten/);
    expect(text).toMatch(/Navigations-App/);
    expect(text).toMatch(/nur das Ziel, ohne Ihren Namen/);
    expect(text).toMatch(/nie automatisch/);
  });

  it('nennt die Pflichtangaben nach Art. 13 DSGVO', () => {
    expect(text).toMatch(/Verantwortlich ist Test Praxis/);
    expect(text).toMatch(/Art\. 9 Abs\. 2 lit\. h DSGVO/);
    expect(text).toMatch(/zehn Jahre/);
    expect(text).toMatch(/Art\. 7 Abs\. 3 DSGVO/);
    expect(text).toMatch(/Art\. 77 DSGVO/);
  });
});

describe('Ausfallhonorar-Regel', () => {
  const text = ausfallhonorarRegel().absaetze.join('\n');

  it('gibt die Regel aus PROJECT_PRINCIPLES.md 8 wieder', () => {
    expect(text).toMatch(/weniger als 24 Stunden/);
    expect(text).toMatch(/Genau 24 Stunden vorher genügt/);
    expect(text).toMatch(/15 Minuten, klingeln und rufen Sie an/);
    expect(text).toMatch(/Sagen wir einen Termin ab, entsteht für Sie .* keine Gebühr/);
  });

  it('erfindet keinen Betrag', () => {
    expect(text).not.toMatch(/€|EUR|\d+,\d{2}/);
  });
});
