-- Von der Ernährungsberatung sieht eine Begleitung nichts (ADR-027 Punkt 3): keinen Termin, keinen
-- Wunsch dazu, keine Erinnerung und keine Rechnung mit einer Position der Beratung, auch nicht mit
-- Rechnungsbereich. Maßgeblich ist das Recht nutrition aus app.platform_access_allows.

create or replace function public.platform_appointments(p_access_id uuid) RETURNS TABLE(id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, status text, staff_name text, location_name text, visit_street text, visit_house_number text, visit_postal_code text, visit_city text, late_notice boolean, open_request_kind text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_ernaehrung boolean;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_ernaehrung := app.platform_access_allows(p_access_id, 'nutrition');

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'appointments')
  );

  return query
  select a.id,
         a.starts_at,
         a.ends_at,
         a.appointment_type,
         case a.status
           when 'documented' then 'completed'
           when 'invoiced' then
             case a.fee_basis
               when 'no_show' then 'no_show'
               when 'late_cancellation' then 'cancelled'
               else 'completed'
             end
           else a.status
         end,
         nullif(concat_ws(' ', pe.given_name, pe.family_name), ''),
         l.name,
         a.visit_street,
         a.visit_house_number,
         a.visit_postal_code,
         a.visit_city,
         case when a.status = 'confirmed' and a.starts_at > now()
           then a.starts_at - now() < app.cancellation_notice_period()
         end,
         (select w.kind from public.platform_appointment_requests w
           where w.appointment_id = a.id and w.status = 'open' limit 1)
  from public.appointments a
  left join public.staff_members s on s.id = a.staff_member_id
  left join public.persons pe on pe.id = s.person_id
  left join public.locations l on l.id = a.location_id
  where a.organization_id = v_zugang.organization_id
    and (
      (v_zugang.relationship_kind = 'treatment'
         and a.kind = 'therapy'
         and a.patient_id = v_zugang.relationship_id)
      or
      (v_zugang.relationship_kind = 'training'
         and a.kind = 'training'
         and a.training_relationship_id = v_zugang.relationship_id)
    )
    and a.starts_at >= now() - app.platform_appointment_history()
    and (v_ernaehrung or a.occasion <> 'nutrition_counselling')
  order by a.starts_at, a.id;
end;
$$;

create or replace function public.platform_invoices(p_access_id uuid) RETURNS TABLE(id uuid, invoice_number text, issued_on date, due_on date, total_cents integer, currency text, paid_cents integer, outstanding_cents integer, payment_state text, overdue boolean, cancelled boolean, cancelled_on date, recipient_kind text, recipient_name text, service_from date, service_to date)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_zone   text;
  v_heute  date;
  v_ernaehrung boolean;
begin
  if not app.platform_access_allows(p_access_id, 'billing') then
    return;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_ernaehrung := app.platform_access_allows(p_access_id, 'nutrition');
  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;
  v_heute := (now() at time zone v_zone)::date;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'invoices')
  );

  return query
  select i.id,
         i.invoice_number,
         i.issued_on,
         i.due_on,
         i.total_cents,
         i.currency,
         bezahlt.cents,
         i.total_cents - bezahlt.cents,
         app.invoice_payment_state(i.total_cents, bezahlt.cents),
         (i.due_on < v_heute and bezahlt.cents < i.total_cents and c.id is null),
         c.id is not null,
         c.cancelled_on,
         i.snapshot -> 'recipient' ->> 'kind',
         i.snapshot -> 'recipient' ->> 'name',
         (i.snapshot -> 'service_period' ->> 'from')::date,
         (i.snapshot -> 'service_period' ->> 'to')::date
  from public.invoices i
  left join public.invoice_cancellations c on c.invoice_id = i.id
  cross join lateral (select app.invoice_paid_cents(i.id) as cents) bezahlt
  where i.organization_id = v_zugang.organization_id
    and i.status = 'issued'
    and (
      (v_zugang.relationship_kind = 'treatment' and i.patient_id = v_zugang.relationship_id)
      or
      (v_zugang.relationship_kind = 'training'
         and i.training_relationship_id = v_zugang.relationship_id)
    )
    and (v_ernaehrung or not exists (
      select 1 from jsonb_array_elements(coalesce(i.snapshot -> 'items', '[]'::jsonb)) z
      where z ->> 'item_kind' = 'nutrition_counselling'))
  order by i.issued_on desc, i.invoice_number desc;
end;
$$;

create or replace function public.platform_invoice(p_access_id uuid, p_invoice_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_invoice record;
  v_storno  record;
  v_ersetzt text;
  v_korrektur text;
  v_bezahlt integer;
  v_ernaehrung boolean;
begin
  if not app.platform_access_allows(p_access_id, 'billing') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_ernaehrung := app.platform_access_allows(p_access_id, 'nutrition');

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
    and i.organization_id = v_zugang.organization_id
    and i.status = 'issued'
    and (
      (v_zugang.relationship_kind = 'treatment' and i.patient_id = v_zugang.relationship_id)
      or
      (v_zugang.relationship_kind = 'training'
         and i.training_relationship_id = v_zugang.relationship_id)
    )
    and (v_ernaehrung or not exists (
      select 1 from jsonb_array_elements(coalesce(i.snapshot -> 'items', '[]'::jsonb)) z
      where z ->> 'item_kind' = 'nutrition_counselling'));
  if not found then
    return null;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read',
    jsonb_build_object('view', 'invoice', 'invoice_id', p_invoice_id)
  );

  v_bezahlt := app.invoice_paid_cents(p_invoice_id);
  select c.cancellation_number, c.reason, c.cancelled_on into v_storno
  from public.invoice_cancellations c where c.invoice_id = p_invoice_id;
  select i.invoice_number into v_ersetzt
  from public.invoices i where i.id = v_invoice.replaces_invoice_id
    and (v_ernaehrung or not exists (
      select 1 from jsonb_array_elements(coalesce(i.snapshot -> 'items', '[]'::jsonb)) z
      where z ->> 'item_kind' = 'nutrition_counselling'));
  select i.invoice_number into v_korrektur
  from public.invoices i
  where i.replaces_invoice_id = p_invoice_id and i.status = 'issued'
    and (v_ernaehrung or not exists (
      select 1 from jsonb_array_elements(coalesce(i.snapshot -> 'items', '[]'::jsonb)) z
      where z ->> 'item_kind' = 'nutrition_counselling'))
  order by i.created_at limit 1;

  -- Der Snapshot, wie die Praxis ihn druckt (ADR-009 Punkt 10) - die Person
  -- bekommt dasselbe Blatt. Steuernummer und Bankverbindung der Praxis
  -- gehoeren auf eine Rechnung und stehen deshalb mit drin.
  return jsonb_build_object(
    'id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'issued_on', v_invoice.issued_on,
    'due_on', v_invoice.due_on,
    'paid_cents', v_bezahlt,
    'outstanding_cents', v_invoice.total_cents - v_bezahlt,
    'payment_state', app.invoice_payment_state(v_invoice.total_cents, v_bezahlt),
    'cancellation', case when v_storno is null then null else
      jsonb_build_object('cancellation_number', v_storno.cancellation_number,
                         'cancelled_on', v_storno.cancelled_on)
    end,
    'replaces_invoice_number', v_ersetzt,
    'correction_invoice_number', v_korrektur,
    'document', v_invoice.snapshot
  );
end;
$$;

create or replace function public.platform_appointment_requests(p_access_id uuid) RETURNS TABLE(id uuid, kind text, appointment_id uuid, preferred_days date[], preferred_times text[], note text, status text, created_at timestamp with time zone, resolved_at timestamp with time zone, answer text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_ernaehrung boolean;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_ernaehrung := app.platform_access_allows(p_access_id, 'nutrition');

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'requests')
  );

  return query
  select w.id, w.kind, w.appointment_id, w.preferred_days, w.preferred_times, w.note,
         w.status, w.created_at, w.resolved_at, w.answer
  from public.platform_appointment_requests w
  where w.organization_id = v_zugang.organization_id
    and w.relationship_kind = v_zugang.relationship_kind
    and w.relationship_id = v_zugang.relationship_id
    and (v_ernaehrung or w.appointment_id is null or not exists (
      select 1 from public.appointments t
      where t.id = w.appointment_id and t.occasion = 'nutrition_counselling'))
  order by (w.status <> 'open'), w.created_at desc, w.id;
end;
$$;

create or replace function public.request_platform_appointment_change(p_access_id uuid, p_appointment_id uuid, p_kind text, p_days date[], p_times text[], p_note text)
returns uuid
language plpgsql security definer
set search_path to ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_termin record;
  v_zone   text;
  v_heute  date;
  v_tage   date[];
  v_id     uuid;
begin
  if not app.platform_access_allows(p_access_id, 'request')
     or not app.platform_access_writable(p_access_id) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  if p_kind is null or p_kind not in ('change', 'cancel') then
    raise exception 'unknown request kind' using errcode = '22023';
  end if;

  -- Nur der eigene, bestaetigte, kuenftige Termin. Ein fremder und ein nicht
  -- vorhandener sehen gleich aus.
  select a.id, a.status, a.starts_at into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_zugang.organization_id
    and (
      (v_zugang.relationship_kind = 'treatment' and a.kind = 'therapy'
         and a.patient_id = v_zugang.relationship_id)
      or
      (v_zugang.relationship_kind = 'training' and a.kind = 'training'
         and a.training_relationship_id = v_zugang.relationship_id)
    )
    and (a.occasion <> 'nutrition_counselling'
         or app.platform_access_allows(p_access_id, 'nutrition'));
  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;
  if v_termin.status <> 'confirmed' then
    raise exception 'appointment is not confirmed' using errcode = '22023';
  end if;
  if v_termin.starts_at <= now() then
    raise exception 'appointment has started' using errcode = '22023';
  end if;

  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;
  v_heute := (now() at time zone v_zone)::date;

  -- Wunschtage nur bei einer Aenderung; dieselben Grenzen wie beim neuen Wunsch.
  if p_kind = 'change' then
    select coalesce(array_agg(distinct t order by t), '{}'::date[]) into v_tage
    from unnest(coalesce(p_days, '{}'::date[])) t;
    if cardinality(v_tage) > 14 then
      raise exception 'too many days' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(v_tage) t where t < v_heute or t > v_heute + 365) then
      raise exception 'day out of range' using errcode = '22023';
    end if;
    if not (coalesce(p_times, '{}'::text[]) <@ array['morning', 'midday', 'afternoon']::text[]) then
      raise exception 'unknown time of day' using errcode = '22023';
    end if;
  else
    v_tage := '{}'::date[];
  end if;
  if p_note is not null and length(btrim(p_note)) > 500 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  begin
    insert into public.platform_appointment_requests (
      organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
      appointment_id, kind, preferred_days, preferred_times, note, created_by_access_id, created_by
    )
    values (
      v_zugang.organization_id, v_zugang.relationship_kind, v_zugang.relationship_id,
      v_zugang.patient_id, v_zugang.training_relationship_id,
      p_appointment_id, p_kind, v_tage,
      case when p_kind = 'change'
        then (select coalesce(array_agg(distinct t), '{}'::text[])
              from unnest(coalesce(p_times, '{}'::text[])) t)
        else '{}'::text[] end,
      nullif(btrim(p_note), ''), v_zugang.id, auth.uid()
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'request already open' using errcode = '23505';
  end;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read',
    jsonb_build_object('view', 'request_' || p_kind)
  );
  return v_id;
end;
$$;

create or replace function app.enqueue_notification(p_org uuid, p_rel_kind text, p_rel_id uuid, p_kind text, p_subject_id uuid, p_subject_at timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_tz     text;
  v_anzahl integer;
begin
  if p_rel_id is null or not (p_kind = any (app.notification_kinds())) then
    return 0;
  end if;
  if exists (
    select 1 from public.notification_kind_switches k
    where k.organization_id = p_org and k.kind = p_kind
  ) then
    return 0;
  end if;
  select o.time_zone into v_tz from public.organizations o where o.id = p_org;

  insert into public.notification_deliveries
    (organization_id, access_id, kind, channel, subject_id, subject_at, due_at)
  select p_org, a.id, p_kind, w.channel, p_subject_id, p_subject_at, z.due_at
  from public.platform_accesses a
  join public.platform_notification_settings s on s.access_id = a.id
  cross join (values ('email'), ('push')) w(channel)
  cross join lateral (
    select app.notification_due_at(
      now(), v_tz,
      coalesce(s.quiet_from, app.notification_rule('quiet_from')::smallint),
      coalesce(s.quiet_until, app.notification_rule('quiet_until')::smallint)
    ) as due_at
  ) z
  where a.organization_id = p_org
    and a.relationship_kind = p_rel_kind
    and a.relationship_id = p_rel_id
    and app.notification_access_live(a.id)
    -- Wie das Recht nutrition in app.platform_access_allows (ADR-027 Punkt 3), hier über die
    -- Art des Zugangs: Der Zeitplan hat keine Sitzung.
    and (
      a.access_kind in ('self', 'legal_representative')
      or not exists (
        select 1 from public.appointments t
        where t.occasion = 'nutrition_counselling'
          and t.id = case
            when p_kind in ('appointment_reminder', 'appointment_changed', 'appointment_cancelled')
              then p_subject_id
            when p_kind = 'request_answered'
              then (select r.appointment_id from public.platform_appointment_requests r
                     where r.id = p_subject_id)
          end
      )
    )
    and (
      (w.channel = 'email' and p_kind = any (s.email_kinds))
      or (w.channel = 'push' and p_kind = any (s.push_kinds)
          and exists (select 1 from public.platform_push_subscriptions p where p.access_id = a.id))
    )
    and not (
      p_kind in ('appointment_reminder', 'appointment_changed')
      and p_subject_at is not null and p_subject_at <= z.due_at
    )
  on conflict (access_id, kind, channel, subject_id, subject_at)
    where kind = 'appointment_reminder' do nothing;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;
