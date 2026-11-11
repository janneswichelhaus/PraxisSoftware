-- Einladung und Befundbogen der Plattform (ADR-023 Punkte 10 und 11): Ein neues Kennwort gibt es
-- nur vor Ort, eine Mail-Einladung gilt nur für die Adresse, an die sie ging, und ein Befundbogen
-- wird nicht zweimal abgeschlossen.

create or replace function public.invite_platform_access(p_relationship_kind text, p_relationship_id uuid, p_channel text, p_address_confirmed boolean DEFAULT false) RETURNS TABLE(access_id uuid, invitation_id uuid, purpose text, code text, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  -- Dieselbe Rechnung wie ueberall, in der Zeitzone der Praxis.
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
    -- Ein neues Kennwort öffnet das Konto: nur vor Ort, nie als Link per Mail (ADR-023 Punkt 10).
    if p_channel = 'email' then
      raise exception 'reset only on site' using errcode = '22023';
    end if;
    v_purpose := 'reset';
    -- Ein neues Kennwort gilt fuer jeden Zugang des Kontos: Ausstellen darf es nur, wer alle
    -- lebenden Zugaenge verwalten darf, sonst oeffnete das Training die Behandlung (§4.8).
    if exists (
      select 1 from public.platform_accesses b
      where b.account_user_id = v_access.account_user_id
        and b.status <> 'revoked'
        -- Auch ueber Organisationen hinweg: Die Rolle gilt nur in der eigenen Praxis.
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
$$;

create or replace function public.platform_invitation_lookup(p_code_hash text) RETURNS TABLE(purpose text, account_user_id uuid, organization_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select i.purpose, a.account_user_id, o.name
  from public.platform_access_invitations i
  join public.platform_accesses a on a.id = i.platform_access_id
  join public.organizations o on o.id = i.organization_id
  where i.code_hash = lower(p_code_hash)
    and i.status = 'pending'
    and i.expires_at > now()
    and (
      (i.purpose = 'activate' and a.status = 'invited')
      or (i.purpose = 'reset' and a.status = 'active')
    )
    -- Eine neue Adresse braucht eine neue Einladung (ADR-023 Punkt 11).
    and (i.channel <> 'email' or i.email is not distinct from (
      select r.email from app.platform_relationship(a.relationship_kind, a.relationship_id) r))
$$;

create or replace function public.redeem_platform_invitation(p_code_hash text, p_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_inv    record;
begin
  if p_user_id is null then
    raise exception 'invitation not valid' using errcode = '22023';
  end if;

  select i.id, i.purpose, i.organization_id, a.id as access_id, a.status as access_status,
         a.account_user_id
    into v_inv
  from public.platform_access_invitations i
  join public.platform_accesses a on a.id = i.platform_access_id
  where i.code_hash = lower(p_code_hash)
    and i.status = 'pending'
    and i.expires_at > now()
    and (i.channel <> 'email' or i.email is not distinct from (
      select r.email from app.platform_relationship(a.relationship_kind, a.relationship_id) r))
  for update of i, a;

  if v_inv.id is null
     or (v_inv.purpose = 'activate' and v_inv.access_status <> 'invited')
     or (v_inv.purpose = 'reset' and (v_inv.access_status <> 'active'
                                      or v_inv.account_user_id is distinct from p_user_id)) then
    raise exception 'invitation not valid' using errcode = '22023';
  end if;

  if v_inv.purpose = 'activate' then
    -- Der Riegel am Zugang prueft Praxiskonto und Person (Punkte 2 und 4).
    -- ANN-191: Das Konto hat der Zugangsdienst angelegt oder per Kennwort
    -- bestaetigt; seine Adresse darf von der im Verhaeltnis abweichen.
    update public.platform_accesses
       set status = 'active', account_user_id = p_user_id, activated_at = now()
     where id = v_inv.access_id;
  else
    -- Der Code ist verbraucht, bevor der Dienst anmeldet; laufende Sitzungen enden, wer das alte
    -- Kennwort kannte, bleibt nicht angemeldet (ADR-023 Punkt 18).
    if to_regclass('auth.sessions') is not null then
      execute 'delete from auth.sessions where user_id = $1' using p_user_id;
    end if;
  end if;

  update public.platform_access_invitations
     set status = 'redeemed', redeemed_at = now()
   where id = v_inv.id;

  -- Protokolliert wird die Aktivierung; ein neues Kennwort
  -- weist die Einladung selbst nach (created_by, redeemed_at).
  if v_inv.purpose = 'activate' then
    perform app.log_platform_access_event(
      v_inv.organization_id, p_user_id, 'platform', 'platform_access.activated',
      v_inv.access_id, jsonb_build_object('surface', 'platform')
    );
  end if;

  return v_inv.access_id;
end;
$_$;

create or replace function public.complete_platform_questionnaire_response(p_access_id uuid, p_response_id uuid)
returns boolean
language plpgsql security definer
set search_path to ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_alt    record;
begin
  if not app.platform_access_allows(p_access_id, 'questionnaire')
     or not app.platform_access_writable(p_access_id) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  select r.id, r.status, r.source, r.instrument_id, r.definition_version, r.answers into v_alt
  from public.patient_questionnaire_responses r
  where r.id = p_response_id
    and r.patient_id = v_zugang.relationship_id
    and r.organization_id = v_zugang.organization_id
    and v_zugang.relationship_kind = 'treatment'
  for update;
  if not found or v_alt.source <> 'platform' then
    raise exception 'questionnaire response not found' using errcode = 'P0002';
  end if;
  if v_alt.status <> 'entwurf' then
    raise exception 'questionnaire response is completed' using errcode = '23514';
  end if;
  -- Noch einmal gegen die Definition - der Entwurf koennte mit einer
  -- inzwischen abgeloesten Fassung begonnen worden sein.
  perform app.assert_questionnaire_answers(v_alt.instrument_id, v_alt.definition_version, v_alt.answers);
  -- Wie beim Speichern: Hat die Praxis denselben Bogen inzwischen abgeschlossen, gilt dieser.
  if exists (
    select 1 from public.patient_questionnaire_responses r
    where r.patient_id = v_zugang.relationship_id
      and r.organization_id = v_zugang.organization_id
      and r.instrument_id = v_alt.instrument_id
      and r.status = 'abgeschlossen'
      and not exists (
        select 1 from public.patient_questionnaire_responses n
        where n.supersedes_response_id = r.id and n.status = 'abgeschlossen'
      )
  ) then
    raise exception 'questionnaire already completed' using errcode = '23505';
  end if;

  update public.patient_questionnaire_responses
     set status = 'abgeschlossen', completed_at = now(), completed_by = auth.uid(),
         updated_at = now(), updated_by = auth.uid()
   where id = p_response_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'questionnaire_complete')
  );
  return true;
end;
$$;
