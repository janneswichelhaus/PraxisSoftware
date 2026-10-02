-- =============================================================================
-- ABN-010 (BEF-119, BEF-116): Vertretung nur fuer nachgewiesene Bereiche
--
-- Abnahme Jannes, 2026-10-02 (ANN-205, ANN-206):
--
--   * Freigegeben werden nur die nachgewiesenen Bereiche, nie pauschal alles.
--     Zwei Bereiche: GESUNDHEIT (Termine, Wuensche, Nachrichten, Befundbogen,
--     freigegebene Unterlagen) und RECHNUNGEN (Rechnungen und Zahlungen).
--   * Rechtliche Vertretung: Gesundheitssorge vermerkt die Praxis bei
--     Betreuung (wie bisher) und jetzt auch bei der Vorsorgevollmacht; das
--     Sorgerecht umfasst sie. Rechnungen nur mit dem zweiten Haekchen
--     "Aufgabenkreis umfasst Vermoegenssorge". Gesundheitssorge allein gibt
--     keinen Abrechnungszugriff.
--   * Begleitung: Der Umfang steht ausdruecklich in der Einwilligung, je
--     Bereich: Termine und Unterlagen (immer), fruehere Nachrichten (ja/nein),
--     Rechnungen (ja/nein). Neue Fassung des Wortlauts.
--   * Die Rechte stehen an EINER Stelle: app.platform_access_allows, mit der
--     neuen Faehigkeit 'billing'.
--
-- Bestand: Rechtliche Vertretungen bekommen keine Rechnungen (nicht
-- nachgewiesen). Eine Vorsorgevollmacht ohne Vermerk der Gesundheitssorge
-- wird ENTZOGEN (revoked_reason 'scope_unproven'), statt den Nachweis zu
-- unterstellen (Zweitreview B7); eine neue Vertretung mit Vermerk ersetzt
-- sie. Begleitungen der Fassung begleitung-2026-10-02 behalten die
-- Rechnungen, denn ihr Wortlaut nannte sie.
-- =============================================================================

alter table public.platform_accesses drop constraint platform_accesses_kind_fields;
alter table public.platform_accesses rename column guardianship_health_scope to health_scope;
alter table public.platform_accesses drop constraint platform_accesses_revoked_reason_check;
alter table public.platform_accesses
  add constraint platform_accesses_revoked_reason_check check (
    revoked_reason in ('practice', 'relationship_deleted', 'account_deleted', 'consent_withdrawn',
                       'scope_unproven')
  );
alter table public.platform_accesses add column finance_scope boolean;

-- Der Waechter nennt die neuen Spalten (Art und Nachweis aendern sich nie;
-- Rumpf aus dem heutigen Stand, eine Stelle geaendert).
CREATE OR REPLACE FUNCTION app.platform_accesses_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_person uuid;
begin
  -- Faellt das Verhaeltnis (on delete set null), endet der Zugang, und seine
  -- Einladungen verlieren die Adresse (ADR-023 Punkt 5).
  if tg_op = 'UPDATE'
     and new.patient_id is null and new.training_relationship_id is null
     and (old.patient_id is not null or old.training_relationship_id is not null) then
    if new.status <> 'revoked' then
      new.status := 'revoked';
      new.revoked_at := now();
      new.revoked_by := null;
      new.revoked_reason := 'relationship_deleted';
      new.locked_at := null;
      new.locked_by := null;
    end if;
    update public.platform_access_invitations i
       set email = null,
           status = case when i.status = 'pending' then 'revoked' else i.status end,
           revoked_at = case when i.status = 'pending' then now() else i.revoked_at end
     where i.platform_access_id = new.id;
    if old.status <> 'revoked' then
      perform app.log_platform_access_event(
        new.organization_id, null, 'system', 'platform_access.revoked', new.id,
        jsonb_build_object('surface', 'system', 'reason', 'relationship_deleted')
      );
    end if;
    return new;
  end if;

  -- POR-005: Art und Nachweis eines Zugangs aendern sich nie. Ein anderer
  -- Umfang ist eine neue Einladung.
  if tg_op = 'UPDATE' and (
       new.access_kind is distinct from old.access_kind
       or new.legal_basis is distinct from old.legal_basis
       or new.representative_name is distinct from old.representative_name
       or new.proof_documents is distinct from old.proof_documents
       or new.consent_text_version is distinct from old.consent_text_version
       or new.consent_earlier_messages is distinct from old.consent_earlier_messages
       or new.health_scope is distinct from old.health_scope
       or new.finance_scope is distinct from old.finance_scope
       or new.proof_recorded_by is distinct from old.proof_recorded_by
       or new.proof_recorded_at is distinct from old.proof_recorded_at
       or new.consent_recorded_by is distinct from old.consent_recorded_by
       or new.consent_recorded_at is distinct from old.consent_recorded_at
       or new.relationship_kind is distinct from old.relationship_kind
       or new.organization_id is distinct from old.organization_id
       or new.relationship_id is distinct from old.relationship_id) then
    raise exception 'platform access kind and proof are fixed' using errcode = '23514';
  end if;

  if new.account_user_id is not null
     and (tg_op = 'INSERT' or new.account_user_id is distinct from old.account_user_id) then
    perform pg_advisory_xact_lock(hashtext('platform_account:' || new.account_user_id::text));

    if exists (select 1 from public.user_profiles up where up.id = new.account_user_id) then
      raise exception 'practice account cannot hold platform access' using errcode = '23514';
    end if;

    select r.person_id into v_person
    from app.platform_relationship(new.relationship_kind, new.relationship_id) r;

    perform pg_advisory_xact_lock(hashtext('platform_person:' || v_person::text));

    if new.access_kind = 'self' then
      if exists (
        select 1 from public.user_profiles up
        join public.user_roles ur on ur.user_id = up.id
        where up.person_id = v_person
      ) then
        raise exception 'person has a practice account' using errcode = '23514';
      end if;

      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.id <> new.id
          and a.access_kind = 'self'
          and a.status <> 'revoked'
          and a.account_user_id is not null
          and a.account_user_id <> new.account_user_id
          and r.person_id = v_person
      ) then
        raise exception 'person already has another account' using errcode = '23514';
      end if;

      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.account_user_id = new.account_user_id
          and a.id <> new.id
          and a.access_kind = 'self'
          and a.status <> 'revoked'
          and r.person_id is distinct from v_person
      ) then
        raise exception 'account belongs to another person' using errcode = '23514';
      end if;

      -- POR-005: Wer diese Person vertritt, ist nicht diese Person.
      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.account_user_id = new.account_user_id
          and a.id <> new.id
          and a.access_kind <> 'self'
          and a.status <> 'revoked'
          and r.person_id = v_person
      ) then
        raise exception 'account represents this person' using errcode = '23514';
      end if;
    else
      -- POR-005: Eine Vertretung ist nie das Konto der vertretenen Person
      -- (Punkt 13: "Gehoert das Konto nicht zur Person des Verhaeltnisses").
      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.account_user_id = new.account_user_id
          and a.id <> new.id
          and a.access_kind = 'self'
          and a.status <> 'revoked'
          and r.person_id = v_person
      ) then
        raise exception 'account belongs to the represented person' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

-- Die einmalige Bestandsuebernahme schreibt am Nachweis vorbei, den der
-- Waechter sonst zu Recht festhaelt. Nur hier, in derselben Transaktion.
alter table public.platform_accesses disable trigger platform_accesses_guard;
-- Der Vermerk true steht nur, weil die Constraint ihn verlangt; der Zugang
-- ist zugleich entzogen und gibt nichts frei.
with entzogen as (
  update public.platform_accesses
     set health_scope = true,
         status = 'revoked',
         revoked_at = coalesce(revoked_at, now()),
         revoked_reason = coalesce(revoked_reason, 'scope_unproven'),
         locked_at = null,
         locked_by = null
   where access_kind = 'legal_representative' and legal_basis = 'power_of_attorney'
     and status <> 'revoked'
  returning id, organization_id
)
insert into public.audit_log (
  organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
)
select e.organization_id, null, 'system', 'platform_access.revoked', 'platform_access', e.id,
       'success', jsonb_build_object('surface', 'system', 'reason', 'scope_unproven')
from entzogen e;
-- Schon beendete Vollmachten bekommen den Vermerk nur der Constraint wegen.
update public.platform_accesses
   set health_scope = true
 where access_kind = 'legal_representative' and legal_basis = 'power_of_attorney'
   and health_scope is null;
update public.platform_accesses
   set finance_scope = false
 where access_kind = 'legal_representative';
update public.platform_accesses
   set finance_scope = true
 where access_kind = 'companion';
alter table public.platform_accesses enable trigger platform_accesses_guard;

alter table public.platform_accesses
  add constraint platform_accesses_kind_fields check (
    case access_kind
      when 'self' then
        legal_basis is null and representative_name is null and proof_documents is null
        and health_scope is null and finance_scope is null
        and proof_recorded_by is null and proof_recorded_at is null
        and consent_text_version is null and consent_recorded_by is null
        and consent_recorded_at is null and consent_earlier_messages is null
      when 'legal_representative' then
        legal_basis is not null and representative_name is not null
        and proof_recorded_by is not null and proof_recorded_at is not null
        and proof_documents @> array['identity_document']
        and proof_documents @> array[case legal_basis
                                       when 'custody' then 'custody_proof'
                                       when 'guardianship' then 'guardianship_certificate'
                                       else 'power_of_attorney' end]
        -- Gesundheitssorge: beim Sorgerecht ohne Vermerk, sonst vermerkt.
        and (legal_basis = 'custody') = (health_scope is null)
        and coalesce(health_scope, true)
        and finance_scope is not null
        and consent_text_version is null and consent_recorded_by is null
        and consent_recorded_at is null and consent_earlier_messages is null
      when 'companion' then
        legal_basis is null and health_scope is null and representative_name is not null
        and proof_recorded_by is not null and proof_recorded_at is not null
        and proof_documents = array['identity_document']
        and consent_text_version is not null and consent_recorded_by is not null
        and consent_recorded_at is not null and consent_earlier_messages is not null
        and finance_scope is not null
      else false
    end
  );

comment on column public.platform_accesses.health_scope is
  'Rechtliche Vertretung: Die Praxis hat gesehen, dass der Aufgabenkreis bzw. die Vollmacht die Gesundheitssorge umfasst (Betreuung, Vorsorgevollmacht; Pflicht). Beim Sorgerecht null - es umfasst sie. Bis ABN-010 guardianship_health_scope und nur fuer die Betreuung (ANN-205, BEF-119).';
comment on column public.platform_accesses.finance_scope is
  'Rechnungen und Zahlungen: rechtliche Vertretung nur mit nachgewiesener Vermoegenssorge, Begleitung nur mit Einwilligung in diesen Bereich. Fuer den eigenen Zugang null - er sieht alles Eigene (ABN-010, BEF-119, BEF-116, ANN-216).';

-- -----------------------------------------------------------------------------
-- Die geltende Fassung der Einwilligung zur Begleitung (Wortlaut in
-- src/lib/vertretung.ts, ein Test haelt beide gleich).
-- -----------------------------------------------------------------------------
create or replace function app.platform_companion_consent_version()
returns text
language sql
immutable
set search_path = ''
as $$ select 'begleitung-2026-10-02b' $$;

-- -----------------------------------------------------------------------------
-- Die Rechte an einer Stelle
-- -----------------------------------------------------------------------------
create or replace function app.platform_access_allows(p_access_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      -- Gesundheit: Lesen, Wuensche, Nachrichten. Jede Vertretung traegt
      -- diesen Bereich nachgewiesen (Constraint platform_accesses_kind_fields).
      when p_capability in ('read', 'request', 'message') then true
      -- Rechnungen und Zahlungen: der eigene Zugang, sonst nur mit
      -- nachgewiesener Vermoegenssorge bzw. Einwilligung (ABN-010).
      when p_capability = 'billing'
        then a.access_kind = 'self' or coalesce(a.finance_scope, false)
      when p_capability in ('consent', 'export', 'manage_companions')
        then a.access_kind in ('self', 'legal_representative')
      else false
    end
    from public.platform_accesses a
    where a.id = p_access_id
      and exists (select 1 from app.platform_readable_access(a.id))
  ), false)
$$;

comment on function app.platform_access_allows(uuid, text) is
  'Darf dieser lesbare Zugang das? read/request/message: jeder; billing: eigener Zugang oder finance_scope; consent/export/manage_companions: eigener Zugang und rechtliche Vertretung. Die eine Stelle der Rechte (ADR-023 Punkt 13, ABN-010).';

-- -----------------------------------------------------------------------------
-- Pruefung der Angaben: das austauschbare Nachweisverfahren (BEF-116)
-- -----------------------------------------------------------------------------
drop function app.assert_platform_representation(text, text, date, text, text, text[], boolean, text, boolean);

create function app.assert_platform_representation(
  p_access_kind     text,
  p_legal_basis     text,
  p_date_of_birth   date,
  p_time_zone       text,
  p_name            text,
  p_proof_documents text[],
  p_health_scope    boolean,
  p_consent_version text,
  p_earlier_messages boolean,
  p_finance_scope   boolean
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_minderjaehrig boolean;
begin
  if p_access_kind is null or p_access_kind not in ('legal_representative', 'companion') then
    raise exception 'unknown representation kind' using errcode = '22023';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 or char_length(btrim(p_name)) > 120 then
    raise exception 'representative name required' using errcode = '22023';
  end if;
  -- ANN-208: ohne Geburtsdatum keine Vertretung - die Altersgrenze ist sonst
  -- nicht pruefbar (wie ANN-190).
  if p_date_of_birth is null then
    raise exception 'date of birth required' using errcode = '22023';
  end if;
  v_minderjaehrig := app.platform_is_minor(p_date_of_birth, p_time_zone);

  if p_proof_documents is null or not (p_proof_documents @> array['identity_document']::text[]) then
    raise exception 'identity document must be seen' using errcode = '22023';
  end if;

  -- ABN-010: Der Bereich Rechnungen ist immer eine ausdrueckliche Angabe -
  -- nachgewiesen oder eingewilligt, ja oder nein. Ohne Angabe gibt es keine
  -- Vertretung, statt still "alles" oder "nichts" anzunehmen.
  if p_finance_scope is null then
    raise exception 'finance scope must be stated' using errcode = '22023';
  end if;

  if p_access_kind = 'legal_representative' then
    if p_legal_basis is null or p_legal_basis not in ('custody', 'guardianship', 'power_of_attorney') then
      raise exception 'legal basis required' using errcode = '22023';
    end if;
    -- Punkt 15: unter 18 nur Sorgeberechtigte, ab 18 kein Sorgerecht.
    if v_minderjaehrig and p_legal_basis <> 'custody' then
      raise exception 'minor needs custody' using errcode = '22023';
    end if;
    if not v_minderjaehrig and p_legal_basis = 'custody' then
      raise exception 'custody ends at majority' using errcode = '22023';
    end if;
    if not (p_proof_documents @> array[case p_legal_basis
                                         when 'custody' then 'custody_proof'
                                         when 'guardianship' then 'guardianship_certificate'
                                         else 'power_of_attorney' end]::text[]) then
      raise exception 'authority document must be seen' using errcode = '22023';
    end if;
    -- ABN-010 (BEF-119): Betreuung UND Vorsorgevollmacht nur mit
    -- nachgewiesener Gesundheitssorge - die Plattform zeigt Gesundheitsdaten.
    if p_legal_basis = 'guardianship' and not coalesce(p_health_scope, false) then
      raise exception 'guardianship must cover health care' using errcode = '22023';
    end if;
    if p_legal_basis = 'power_of_attorney' and not coalesce(p_health_scope, false) then
      raise exception 'power of attorney must cover health care' using errcode = '22023';
    end if;
  else
    -- Punkt 15: Eine Begleitung gibt es fuer Minderjaehrige nicht.
    if v_minderjaehrig then
      raise exception 'minor needs custody' using errcode = '22023';
    end if;
    if p_consent_version is distinct from app.platform_companion_consent_version() then
      raise exception 'consent of the person required' using errcode = '22023';
    end if;
    if p_earlier_messages is null then
      raise exception 'consent scope required' using errcode = '22023';
    end if;
  end if;
end;
$$;

comment on function app.assert_platform_representation(text, text, date, text, text, text[], boolean, text, boolean, boolean) is
  'Prueft die Angaben einer Vertretung: Art, Name, Alter, gesehene Dokumente, nachgewiesene bzw. eingewilligte Bereiche (Gesundheit, Rechnungen) und die Fassung der Einwilligung. Die eine Stelle des Nachweisverfahrens bis B2 (ADR-023 Punkt 13, ABN-010, BEF-116).';

revoke all on function app.assert_platform_representation(text, text, date, text, text, text[], boolean, text, boolean, boolean) from public, anon, authenticated;

drop function public.list_platform_representations(text, uuid);
drop function public.invite_platform_representation(text, uuid, text, text, text, text[], boolean, text, boolean);

-- ---- list_platform_representations
CREATE FUNCTION public.list_platform_representations(p_relationship_kind text, p_relationship_id uuid)
 RETURNS TABLE(id uuid, access_kind text, legal_basis text, representative_name text, status text, created_at timestamp with time zone, activated_at timestamp with time zone, locked_at timestamp with time zone, revoked_at timestamp with time zone, revoked_reason text, proof_documents text[], health_scope boolean, finance_scope boolean, proof_recorded_at timestamp with time zone, proof_recorded_by_name text, consent_recorded_at timestamp with time zone, consent_earlier_messages boolean, invitation_purpose text, invitation_expires_at timestamp with time zone, ended_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_platform_access(p_relationship_kind) then
    perform app.record_denied_read(v_actor, 'platform_accesses.read', 'not allowed to read platform access');
    return;
  end if;
  v_org := app.current_organization_id();

  return query
  select a.id, a.access_kind, a.legal_basis, a.representative_name, a.status,
         a.created_at, a.activated_at, a.locked_at, a.revoked_at, a.revoked_reason,
         a.proof_documents, a.health_scope, a.finance_scope, a.proof_recorded_at,
         up.display_name, a.consent_recorded_at, a.consent_earlier_messages,
         i.purpose, i.expires_at,
         app.platform_access_ended_at(a.id)
  from public.platform_accesses a
  left join public.user_profiles up
    on up.id = a.proof_recorded_by and up.organization_id = v_org
  left join public.platform_access_invitations i
    on i.platform_access_id = a.id and i.status = 'pending' and i.expires_at > now()
  where a.organization_id = v_org
    and a.relationship_kind = p_relationship_kind
    and a.relationship_id = p_relationship_id
    and a.access_kind <> 'self'
    -- Das Verhaeltnis muss leben; der Nachweis eines geloeschten bleibt
    -- unsichtbar (ADR-023 Punkt 5).
    and (a.patient_id is not null or a.training_relationship_id is not null)
  order by (a.status = 'revoked'), a.created_at desc;
end;
$function$;

-- ---- invite_platform_representation (neue Signatur)
CREATE FUNCTION public.invite_platform_representation(p_relationship_kind text, p_relationship_id uuid, p_access_kind text, p_legal_basis text, p_representative_name text, p_proof_documents text[], p_health_scope boolean, p_consent_version text, p_earlier_messages boolean, p_finance_scope boolean)
 RETURNS TABLE(access_id uuid, invitation_id uuid, purpose text, code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_rel    record;
  v_access uuid;
  v_inv    record;
  v_docs   text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_platform_access(p_relationship_kind) then
    perform app.record_denied_write(v_actor, 'platform_access.invited', 'not allowed to manage platform access');
    return;
  end if;
  v_org := app.current_organization_id();

  select * into v_rel
  from app.platform_relationship(p_relationship_kind, p_relationship_id) r
  where r.organization_id = v_org;
  if not found then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;

  perform app.assert_platform_representation(
    p_access_kind, p_legal_basis, v_rel.date_of_birth,
    (select o.time_zone from public.organizations o where o.id = v_org), p_representative_name,
    p_proof_documents, p_health_scope, p_consent_version, p_earlier_messages, p_finance_scope
  );

  -- Nur die Dokumente, die zur Art gehoeren; doppelte fallen weg.
  select array_agg(distinct d order by d) into v_docs
  from unnest(p_proof_documents) d
  where d = 'identity_document'
     or (p_access_kind = 'legal_representative' and d = case p_legal_basis
           when 'custody' then 'custody_proof'
           when 'guardianship' then 'guardianship_certificate'
           else 'power_of_attorney' end);

  insert into public.platform_accesses (
    organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
    access_kind, legal_basis, representative_name, proof_documents, health_scope, finance_scope,
    proof_recorded_by, proof_recorded_at,
    consent_text_version, consent_recorded_by, consent_recorded_at, consent_earlier_messages,
    created_by
  )
  values (
    v_org, p_relationship_kind, p_relationship_id,
    case when p_relationship_kind = 'treatment' then p_relationship_id end,
    case when p_relationship_kind = 'training' then p_relationship_id end,
    p_access_kind,
    case when p_access_kind = 'legal_representative' then p_legal_basis end,
    btrim(p_representative_name), v_docs,
    -- ABN-010: Gesundheitssorge vermerkt die Praxis bei Betreuung und
    -- Vorsorgevollmacht; das Sorgerecht umfasst sie.
    case when p_access_kind = 'legal_representative' and p_legal_basis <> 'custody' then true end,
    -- Rechnungen nur, wenn nachgewiesen bzw. eingewilligt (BEF-119, BEF-116).
    p_finance_scope,
    v_actor, now(),
    case when p_access_kind = 'companion' then p_consent_version end,
    case when p_access_kind = 'companion' then v_actor end,
    case when p_access_kind = 'companion' then now() end,
    case when p_access_kind = 'companion' then p_earlier_messages end,
    v_actor
  )
  returning id into v_access;

  select * into v_inv from app.issue_platform_invitation(v_org, v_access, 'activate', v_actor);

  perform app.log_platform_access_event(
    v_org, v_actor, 'user', 'platform_access.invited', v_access,
    jsonb_build_object('surface', 'web', 'channel', 'on_site', 'purpose', 'activate',
                       'relationship_kind', p_relationship_kind, 'access_kind', p_access_kind,
                       'legal_basis', p_legal_basis, 'finance_scope', p_finance_scope)
  );

  return query select v_access, v_inv.invitation_id, 'activate'::text, v_inv.code, v_inv.expires_at;
end;
$function$;

revoke all on function public.list_platform_representations(text, uuid) from public, anon;
grant execute on function public.list_platform_representations(text, uuid) to authenticated;
revoke all on function public.invite_platform_representation(text, uuid, text, text, text, text[], boolean, text, boolean, boolean) from public, anon;
grant execute on function public.invite_platform_representation(text, uuid, text, text, text, text[], boolean, text, boolean, boolean) to authenticated;

comment on function public.invite_platform_representation(text, uuid, text, text, text, text[], boolean, text, boolean, boolean) is
  'Richtet eine Vertretung ein (rechtliche Vertretung oder Begleitung) mit Nachweisvermerk, nachgewiesenen bzw. eingewilligten Bereichen und Code fuer die Uebergabe vor Ort (POR-005, ABN-010).';
