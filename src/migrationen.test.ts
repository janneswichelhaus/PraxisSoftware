import { describe, expect, it } from 'vitest';
import { erlaubteWerte, letzteFassung } from '../supabase/tests/helpers/migrationen';

const BASIS = `CREATE TABLE public.a (
    kind text NOT NULL,
    CONSTRAINT a_kind_check CHECK ((kind = ANY (ARRAY['eins'::text, 'zwei'::text])))
);
CREATE FUNCTION app.liste() RETURNS text[]
    AS $$ select array['basis'] $$;
REVOKE ALL ON FUNCTION app.liste() FROM PUBLIC;`;

describe('Leser der Migrationen', () => {
  it('liest die Werte einer Constraint aus dem Abzug der Basis', () => {
    expect(erlaubteWerte('a_kind_check', BASIS)).toEqual(['eins', 'zwei']);
  });

  it('nimmt eine spaetere Fassung von Hand', () => {
    const spaeter = `${BASIS}
alter table public.a drop constraint a_kind_check,
  add constraint a_kind_check
  check (kind in ('eins', 'zwei', 'drei'));`;
    expect(erlaubteWerte('a_kind_check', spaeter)).toEqual(['eins', 'zwei', 'drei']);
  });

  it('bricht ab, wenn es die Constraint nicht gibt', () => {
    expect(() => erlaubteWerte('b_kind_check', BASIS)).toThrow(/fehlt/);
  });

  it('findet die juengste Fassung einer Funktion, nicht ihre Rechte', () => {
    expect(letzteFassung('app.liste', BASIS)).toMatch(/^CREATE FUNCTION app\.liste\(\)[^]*'basis'/);
    const spaeter = `${BASIS}\ncreate or replace function app.liste() returns text[] as $$ select array['neu'] $$;`;
    expect(letzteFassung('app.liste', spaeter)).toMatch(/^create or replace function[^]*'neu'/);
  });

  it('liest die echten Migrationen', () => {
    expect(erlaubteWerte('audit_log_subject_type_check')).toContain('patient');
  });
});
