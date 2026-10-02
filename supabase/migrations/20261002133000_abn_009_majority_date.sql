-- =============================================================================
-- ABN-009 (BEF-117): Eine Altersberechnung, auch am 29. Februar
--
-- Volljaehrig ist man um 0 Uhr am 18. Geburtstag; wer am 29. Februar geboren
-- ist, im Nichtschaltjahr am 1. Maerz (Par. 187 Abs. 2, Par. 188 Abs. 2 BGB),
-- gerechnet in der Zeitzone der Praxis. Bisher rechneten drei Stellen
-- verschieden: platform_is_minor zog 18 Jahre vom heutigen Tag ab (richtig),
-- das Ende des Sorgerechts rechnete Geburtstag plus 18 Jahre (am 29. Februar
-- einen Tag zu frueh) und die Einladung zum eigenen Zugang in UTC.
--
-- Jetzt liefert app.majority_date den Tag, und alle drei rufen sie auf.
-- Abnahme Jannes, 2026-10-02 (ANN-208).
-- =============================================================================

create function app.majority_date(p_date_of_birth date)
returns date
language sql
immutable
set search_path = ''
as $$
  -- Geburtstag minus ein Tag plus 18 Jahre plus ein Tag: Der Vortag des
  -- 29. Februar ist der 28., plus 18 Jahre bleibt der 28., plus ein Tag ist
  -- im Nichtschaltjahr der 1. Maerz und im Schaltjahr der 29. Februar.
  select ((p_date_of_birth - 1) + make_interval(years => app.platform_min_age_years()))::date + 1
$$;

comment on function app.majority_date(date) is
  'Der Tag, an dem eine Person volljaehrig wird (ab 0 Uhr in der Zeitzone der Praxis): Geburtstag minus ein Tag plus 18 Jahre plus ein Tag (Par. 187 Abs. 2, 188 Abs. 2 BGB). Die eine Altersrechnung der Plattform (ABN-009, BEF-117, ANN-208).';

revoke all on function app.majority_date(date) from public, anon, authenticated;

create or replace function app.platform_is_minor(p_date_of_birth date, p_time_zone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (now() at time zone p_time_zone)::date < app.majority_date(p_date_of_birth)
$$;

comment on function app.platform_is_minor(date, text) is
  'Minderjaehrig heute in der Zeitzone der Praxis? Vor app.majority_date (ABN-009). null ohne Geburtsdatum.';

-- Das Ende des Sorgerechts (Rumpf aus dem heutigen Stand, eine Stelle
-- geaendert) und die Einladung zum eigenen Zugang (ebenso).

CREATE OR REPLACE FUNCTION app.platform_access_ended_at(p_access_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when a.status = 'revoked' then a.revoked_at
    when a.status = 'invited' and not exists (
           select 1 from public.platform_access_invitations i
           where i.platform_access_id = a.id and i.status = 'pending' and i.expires_at > now()
         )
      then (select max(i.expires_at) from public.platform_access_invitations i
            where i.platform_access_id = a.id)
    else
      -- least() uebergeht null: ohne Ende des Verhaeltnisses zaehlt allein
      -- die Volljaehrigkeit, ohne Sorgerecht allein das Ende.
      least(
        case when r.ended_on is not null
          then app.retention_due_at(r.ended_on, app.platform_read_period(), o.time_zone)
        end,
        case when a.access_kind = 'legal_representative' and a.legal_basis = 'custody'
          then coalesce(
            (app.majority_date(r.date_of_birth)::timestamp at time zone o.time_zone),
            -- Ohne Geburtsdatum ist das Sorgerecht nicht pruefbar: beendet.
            a.created_at)
        end,
        case when a.access_kind <> 'self' and a.legal_basis is distinct from 'custody'
              and coalesce(app.platform_is_minor(r.date_of_birth, o.time_zone), true)
          then a.created_at
        end
      )
  end
  from public.platform_accesses a
  join public.organizations o on o.id = a.organization_id
  left join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r on true
  where a.id = p_access_id
$function$;

CREATE OR REPLACE FUNCTION public.invite_platform_access(p_relationship_kind text, p_relationship_id uuid, p_channel text, p_address_confirmed boolean DEFAULT false)
 RETURNS TABLE(access_id uuid, invitation_id uuid, purpose text, code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_rel     record;
  v_access  public.platform_accesses%rowtype;
  v_purpose text;
  v_code    text;
  v_inv     uuid;
  v_expires timestamptz;
  v_email   text;
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

  if p_channel is null or p_channel not in ('on_site', 'email') then
    raise exception 'unknown channel' using errcode = '22023';
  end if;

  select * into v_rel
  from app.platform_relationship(p_relationship_kind, p_relationship_id) r
  where r.organization_id = v_org;
  if not found then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;

  -- Punkt 15 (W4): Unter 18 gibt es keinen eigenen Zugang. Ohne Geburtsdatum
  -- laesst sich das nicht pruefen, und die restriktive Seite gilt (§16,
  -- ANN-190).
  if v_rel.date_of_birth is null then
    raise exception 'date of birth required' using errcode = '22023';
  end if;
  -- W1 (Punkt 2): eine Person mit Praxiskonto bekommt keinen Zugang.
  if exists (
    select 1 from public.user_profiles up
    join public.user_roles ur on ur.user_id = up.id
    where up.person_id = v_rel.person_id
  ) then
    raise exception 'person has a practice account' using errcode = '22023';
  end if;
  -- ABN-009 (BEF-117): dieselbe Rechnung wie ueberall, in der Zeitzone der
  -- Praxis - bisher stand hier UTC.
  if app.platform_is_minor(
       v_rel.date_of_birth,
       (select o.time_zone from public.organizations o where o.id = v_org)) then
    raise exception 'person is under age' using errcode = '22023';
  end if;

  -- Punkt 11 (Fassung 2, ANN-188): Mail nur an die Adresse im Verhaeltnis,
  -- und nur, wenn die einladende Person vermerkt, dass die Person sie selbst
  -- bestaetigt hat.
  if p_channel = 'email' then
    if v_rel.email is null then
      raise exception 'no email address on record' using errcode = '22023';
    end if;
    if not coalesce(p_address_confirmed, false) then
      raise exception 'address must be confirmed by the person' using errcode = '22023';
    end if;
    v_email := v_rel.email;
  end if;

  select * into v_access
  from public.platform_accesses a
  where a.relationship_id = p_relationship_id
    and a.relationship_kind = p_relationship_kind
    and a.access_kind = 'self'
    and a.status <> 'revoked'
  for update;

  if not found then
    insert into public.platform_accesses (
      organization_id, relationship_kind, relationship_id,
      patient_id, training_relationship_id, created_by
    )
    values (
      v_org, p_relationship_kind, p_relationship_id,
      case when p_relationship_kind = 'treatment' then p_relationship_id end,
      case when p_relationship_kind = 'training' then p_relationship_id end,
      v_actor
    )
    returning * into v_access;
    v_purpose := 'activate';
  elsif v_access.status = 'invited' then
    v_purpose := 'activate';
  elsif v_access.status = 'active' then
    v_purpose := 'reset';
    -- Zweitreview: Ein neues Kennwort gilt fuer das ganze Konto und damit
    -- fuer jeden seiner Zugaenge. Ausstellen darf es nur, wer alle lebenden
    -- Zugaenge des Kontos verwalten darf - sonst oeffnete die
    -- Trainingsbetreuung den Weg in die Behandlung und umgekehrt (§4.8).
    if exists (
      select 1 from public.platform_accesses b
      where b.account_user_id = v_access.account_user_id
        and b.status <> 'revoked'
        -- POR-005, Zweitreview: auch ueber Organisationen hinweg. Die Rolle
        -- gilt nur in der eigenen Praxis; ein Konto mit Zugang in einer
        -- zweiten Praxis bekommt hier kein neues Kennwort.
        and (b.organization_id <> v_org or not app.can_manage_platform_access(b.relationship_kind))
    ) then
      raise exception 'reset needs every area of this account' using errcode = '22023';
    end if;
  else
    raise exception 'platform access is locked' using errcode = '22023';
  end if;

  update public.platform_access_invitations i
     set status = 'revoked', revoked_at = now()
   where i.platform_access_id = v_access.id and i.status = 'pending';

  -- 24 Zufallsbytes, URL-tauglich kodiert: 32 Zeichen, nicht zu erraten.
  v_code := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  v_expires := now() + app.platform_invitation_validity();

  insert into public.platform_access_invitations (
    organization_id, platform_access_id, purpose, channel, code_hash, email,
    address_confirmed_by, address_confirmed_at, expires_at, created_by
  )
  values (
    v_org, v_access.id, v_purpose, p_channel, app.platform_code_hash(v_code), v_email,
    case when p_channel = 'email' then v_actor end,
    case when p_channel = 'email' then now() end,
    v_expires, v_actor
  )
  returning id into v_inv;

  perform app.log_platform_access_event(
    v_org, v_actor, 'user', 'platform_access.invited', v_access.id,
    jsonb_build_object('surface', 'web', 'channel', p_channel, 'purpose', v_purpose,
                       'relationship_kind', p_relationship_kind)
  );

  return query select v_access.id, v_inv, v_purpose, v_code, v_expires;
end;
$function$;
