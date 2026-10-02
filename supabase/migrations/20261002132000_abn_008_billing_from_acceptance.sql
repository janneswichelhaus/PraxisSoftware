-- =============================================================================
-- ABN-008 (BEF-100): Abrechnung nach der Abnahme der Annahmen, Block 4
--
-- Drei Aenderungen, Jannes am 2026-10-02:
--
--   1. Steuernummer ODER USt-IdNr. (Par. 14 Abs. 4 Nr. 2 UStG). Bisher war
--      die Steuernummer Pflicht und die USt-IdNr. eine Zugabe (ANN-074).
--   2. Storno trotz Zahlung. Ein tatsaechlich eingegangener Betrag darf nicht
--      verschwinden. Die Rechnung wird storniert, der Betrag bleibt an ihr
--      stehen und geht entweder tatsaechlich zurueck (Rueckzahlung) oder wird
--      mit der Ersatzrechnung verrechnet (Verrechnung, zwei verbundene
--      Buchungen). Ein Zahlungsstorno korrigiert nur eine falsche Buchung
--      (ANN-079 Fassung 2).
--   3. Teilzahlungen kumulativ verteilen. Je Zahlung wird die Summe aller
--      Zahlungen bis einschliesslich dieser auf die Steuergruppen verteilt und
--      die Verteilung bis zur vorigen abgezogen. Mehrere krumme Teilzahlungen
--      ergeben bei voller Zahlung genau die Gruppen der Rechnung, und eine
--      Rueckzahlung nimmt ihre Verteilung centgenau zurueck (ANN-088
--      Fassung 2).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Steuernummer oder USt-IdNr.
-- -----------------------------------------------------------------------------
alter table public.practice_billing_profiles alter column tax_number drop not null;
alter table public.practice_billing_profiles drop constraint practice_billing_profiles_tax_number_check;
alter table public.practice_billing_profiles
  add constraint practice_billing_profiles_tax_number_check check (
    tax_number is null or length(btrim(tax_number)) between 3 and 40
  ),
  add constraint practice_billing_profiles_tax_id_present check (
    tax_number is not null or vat_id is not null
  );

comment on column public.practice_billing_profiles.tax_number is
  'Steuernummer der Praxis. Seit ABN-008 optional, wenn eine USt-IdNr. eingetragen ist - eine von beiden muss stehen (Par. 14 Abs. 4 Nr. 2 UStG, Constraint practice_billing_profiles_tax_id_present).';

-- -----------------------------------------------------------------------------
-- 2. Verrechnung als eigene Zahlungsart
--
-- Eine Verrechnung ist kein Geldfluss nach aussen, sondern eine Umbuchung:
-- an der stornierten Rechnung eine Buchung "refund", an der Ersatzrechnung
-- eine Buchung "incoming", beide mit method = 'offset' und derselben
-- offset_group. Getrennt storniert wird keine Haelfte (void_offset_payments).
-- -----------------------------------------------------------------------------
alter table public.payments drop constraint payments_method_check;
alter table public.payments
  add constraint payments_method_check check (method in ('bank_transfer', 'other', 'offset')),
  add column offset_group uuid;

alter table public.payments
  add constraint payments_offset_group_iff_offset check (
    (method = 'offset') = (offset_group is not null)
  );

comment on column public.payments.offset_group is
  'Verbindet die beiden Buchungen einer Verrechnung (ABN-008): refund an der stornierten Rechnung, incoming an der Ersatzrechnung. Genau dann gesetzt, wenn method = offset.';

create index payments_offset_group_idx on public.payments (offset_group) where offset_group is not null;

-- -----------------------------------------------------------------------------
-- 3. Die Verteilung auf Steuergruppen an einer Stelle
--
-- ANN-088: anteilig nach dem Bruttoanteil der Gruppe, in ganzen Cent, der
-- Rest an die groessten Bruchteile, bei Gleichstand in fester Reihenfolge. Ein
-- negativer Betrag wird wie sein Betrag verteilt und mit Vorzeichen
-- zurueckgegeben, damit die Differenz zweier kumulierter Staende stimmt. Eine
-- Rechnung ueber null Cent laesst sich nicht anteilig aufteilen: Dann geht der
-- Betrag an die erste Gruppe in fester Reihenfolge.
--
-- Die enthaltene Steuer wird mit derselben Formel gerechnet wie im Dokument
-- (app.build_invoice_document). Wo das Dokument keine ausweist, weist auch
-- die Verteilung keine aus (ADR-009 Punkt 18).
-- -----------------------------------------------------------------------------
create function app.distribute_to_tax_groups(p_tax_groups jsonb, p_amount bigint)
returns table (tax_treatment text, tax_rate_permille smallint, brutto bigint, steuer bigint)
language sql
immutable
set search_path = ''
as $$
  with gruppe as (
    select x ->> 'tax_treatment'                 as tt,
           (x ->> 'tax_rate_permille')::smallint as satz,
           (x ->> 'gross_cents')::bigint         as gruppe_brutto,
           (x ->> 'tax_cents')::bigint           as gruppe_steuer,
           sum((x ->> 'gross_cents')::bigint) over () as summe_brutto
    from jsonb_array_elements(coalesce(p_tax_groups, '[]'::jsonb)) as x
  ),
  abgerundet as (
    select g.*,
           case when g.summe_brutto > 0
                then (abs(p_amount) * g.gruppe_brutto) / g.summe_brutto else 0 end as anteil,
           case when g.summe_brutto > 0
                then (abs(p_amount) * g.gruppe_brutto) % g.summe_brutto else 0 end as rest
    from gruppe g
  ),
  verteilt as (
    select a.*,
           row_number() over (order by a.rest desc, a.tt, a.satz) as platz,
           abs(p_amount) - sum(a.anteil) over () as offene_cent
    from abgerundet a
  ),
  roh as (
    select v.tt, v.satz, v.gruppe_steuer,
           sign(p_amount) * case
             when v.summe_brutto > 0 then v.anteil + case when v.platz <= v.offene_cent then 1 else 0 end
             when v.platz = 1 then abs(p_amount)
             else 0
           end as brutto
    from verteilt v
  )
  select r.tt,
         r.satz,
         r.brutto::bigint,
         case when r.gruppe_steuer = 0 then 0::bigint
              else round(r.brutto::numeric * r.satz / (1000 + r.satz))::bigint
         end
  from roh r
$$;

comment on function app.distribute_to_tax_groups(jsonb, bigint) is
  'Verteilt einen Betrag in Cent anteilig auf die Steuergruppen eines Rechnungssnapshots (ANN-088), mit Vorzeichen. Grundlage der kumulativen Verteilung in list_revenue_by_service_area (ABN-008, BEF-100).';

revoke all on function app.distribute_to_tax_groups(jsonb, bigint) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Verrechnen mit der Ersatzrechnung
-- -----------------------------------------------------------------------------
create function public.offset_payment(
  p_cancelled_invoice_id   uuid,
  p_replacement_invoice_id uuid,
  p_amount_cents           integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_alt      record;
  v_neu      record;
  v_zeitzone text;
  v_heute    date;
  v_gruppe   uuid := extensions.gen_random_uuid();
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a payment needs a positive amount' using errcode = '22023';
  end if;

  -- Beide Rechnungen in fester Reihenfolge sperren (nach Kennung), damit zwei
  -- gleichzeitige Vorgaenge sich nicht kreuzweise blockieren.
  perform 1 from public.invoices i
   where i.id in (p_cancelled_invoice_id, p_replacement_invoice_id)
     and i.organization_id = v_org
   order by i.id
   for update;

  select i.* into v_alt
  from public.invoices i
  where i.id = p_cancelled_invoice_id and i.organization_id = v_org;
  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  select i.* into v_neu
  from public.invoices i
  where i.id = p_replacement_invoice_id and i.organization_id = v_org;
  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_cancelled_invoice_id
  ) then
    raise exception 'only a cancelled invoice can pass on its payments' using errcode = '23514';
  end if;

  -- Verrechnet wird mit der Rechnung, die diese ersetzt - nicht mit einer
  -- beliebigen offenen Rechnung derselben Person (ANN-215).
  if v_neu.replaces_invoice_id is distinct from p_cancelled_invoice_id
     or v_neu.status <> 'issued'
     or exists (
       select 1 from public.invoice_cancellations c where c.invoice_id = p_replacement_invoice_id
     ) then
    raise exception 'payments are offset only against the issued replacement invoice'
      using errcode = '23514';
  end if;

  if v_neu.currency <> v_alt.currency then
    raise exception 'currencies differ' using errcode = '23514';
  end if;

  if p_amount_cents > app.invoice_paid_cents(p_cancelled_invoice_id) then
    raise exception 'an offset cannot exceed the payments received' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  insert into public.payments (
    organization_id, invoice_id, direction, amount_cents, currency,
    paid_on, method, offset_group, created_by
  )
  values
    (v_org, p_cancelled_invoice_id,   'refund',   p_amount_cents, v_alt.currency,
     v_heute, 'offset', v_gruppe, v_actor),
    (v_org, p_replacement_invoice_id, 'incoming', p_amount_cents, v_neu.currency,
     v_heute, 'offset', v_gruppe, v_actor);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'payment.offset', 'invoice', p_replacement_invoice_id, 'success',
    jsonb_build_object('surface', 'web',
                       'from_invoice_id', p_cancelled_invoice_id,
                       'from_invoice_number', v_alt.invoice_number,
                       'invoice_number', v_neu.invoice_number,
                       'amount_cents', p_amount_cents,
                       'offset_group', v_gruppe)
  );

  return v_gruppe;
end;
$$;

comment on function public.offset_payment(uuid, uuid, integer) is
  'Verrechnet einen an einer stornierten Rechnung eingegangenen Betrag mit ihrer ausgestellten Ersatzrechnung: zwei verbundene Buchungen (refund und incoming, method offset). Hoechstens der eingegangene Betrag. Protokolliert payment.offset (ABN-008, BEF-100, ANN-215).';

revoke all on function public.offset_payment(uuid, uuid, integer) from public, anon;
grant execute on function public.offset_payment(uuid, uuid, integer) to authenticated;

-- Beide Haelften einer Verrechnung gemeinsam stornieren. Aufgerufen aus
-- void_payment; die Rechte prueft auch diese Funktion selbst.
create function public.void_offset_payments(p_offset_group uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_zeile   record;
  v_eingang integer;
  v_rueck   integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a void needs a reason' using errcode = '22023';
  end if;

  perform 1 from public.invoices i
   where i.id in (select p.invoice_id from public.payments p where p.offset_group = p_offset_group)
     and i.organization_id = v_org
   order by i.id
   for update;

  if not exists (
    select 1 from public.payments p
    where p.offset_group = p_offset_group and p.organization_id = v_org and p.voided_at is null
  ) then
    raise exception 'payment not found' using errcode = '42501';
  end if;

  -- An der Ersatzrechnung faellt ein Eingang weg. Stehen dort Rueckzahlungen,
  -- die ohne ihn ueber dem Eingang laegen, zuerst diese stornieren - dieselbe
  -- Regel wie bei einem einzelnen Eingang.
  for v_zeile in
    select p.invoice_id from public.payments p
    where p.offset_group = p_offset_group and p.direction = 'incoming'
  loop
    select coalesce(sum(case when p.direction = 'incoming' then p.amount_cents else 0 end), 0),
           coalesce(sum(case when p.direction = 'refund'   then p.amount_cents else 0 end), 0)
      into v_eingang, v_rueck
    from public.payments p
    where p.invoice_id = v_zeile.invoice_id
      and p.voided_at is null
      and p.offset_group is distinct from p_offset_group;

    if v_rueck > v_eingang then
      raise exception 'voiding this payment would leave refunds without payments received'
        using errcode = '23514';
    end if;
  end loop;

  update public.payments
     set voided_at   = now(),
         voided_by   = v_actor,
         void_reason = btrim(p_reason)
   where offset_group = p_offset_group
     and voided_at is null;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'payment.voided', 'payment', p.id, 'success',
         jsonb_build_object('surface', 'web', 'invoice_id', p.invoice_id,
                            'direction', p.direction, 'amount_cents', p.amount_cents,
                            'offset_group', p_offset_group)
  from public.payments p
  where p.offset_group = p_offset_group;
end;
$$;

comment on function public.void_offset_payments(uuid, text) is
  'Storniert beide Buchungen einer Verrechnung gemeinsam, mit Grund (ABN-008). Eine Haelfte allein liesse Geld an einer Rechnung auftauchen oder verschwinden.';

revoke all on function public.void_offset_payments(uuid, text) from public, anon;
grant execute on function public.void_offset_payments(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Auditkatalog
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text, 'statistics.staff_revenue_viewed'::text, 'training_relationship.created'::text, 'training_relationship.updated'::text, 'training_relationship.ended'::text, 'training_relationship.reopened'::text, 'training_relationship.viewed'::text, 'training_relationships.read'::text, 'training_basis.created'::text, 'training_basis.concluded'::text, 'training_basis.reopened'::text, 'training_protocol.created'::text, 'training_protocol.updated'::text, 'training_protocol.finalized'::text, 'training_protocol.viewed'::text, 'training_protocol.discarded'::text, 'platform_access.invited'::text, 'platform_access.invitation_sent'::text, 'platform_access.activated'::text, 'platform_access.password_reset'::text, 'platform_access.locked'::text, 'platform_access.unlocked'::text, 'platform_access.revoked'::text, 'platform_accesses.read'::text, 'platform_access.companion_declined'::text, 'platform_representation.read'::text, 'appointment.fee_waived'::text, 'payment.offset'::text])));

-- -----------------------------------------------------------------------------
-- 6. Schreib- und Lesepfade (Rumpf jeweils aus dem heutigen Stand, nur die
--    markierten Stellen geaendert):
--    save_practice_billing_profile - Steuernummer oder USt-IdNr.;
--    payments_need_issued_invoice  - an der stornierten Rechnung nur noch
--                                    Rueckzahlung und Verrechnung;
--    record_payment                - Rueckzahlung an der stornierten Rechnung;
--    cancel_invoice                - Storno trotz Zahlung;
--    void_payment                  - eine Verrechnung nur als Paar;
--    list_revenue_by_service_area  - kumulative Verteilung.
-- -----------------------------------------------------------------------------

-- ---- save_practice_billing_profile
CREATE OR REPLACE FUNCTION public.save_practice_billing_profile(p_legal_name text, p_street text, p_house_number text, p_postal_code text, p_city text, p_phone text, p_email text, p_tax_number text, p_vat_id text, p_small_business boolean, p_bank_name text, p_account_holder text, p_iban text, p_bic text, p_invoice_number_prefix text, p_payment_term_days smallint, p_training_invoice_number_prefix text DEFAULT 'TR'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_neu      boolean;
  v_prefix   text;
  v_training text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_billing_profile() then
    raise exception 'not allowed to manage the billing profile' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  -- ABN-008 (BEF-100): Steuernummer ODER USt-IdNr. (Par. 14 Abs. 4 Nr. 2
  -- UStG). Die Tabelle haelt dieselbe Zusage; hier steht sie mit einer
  -- Meldung, die sagt, was fehlt.
  if nullif(btrim(coalesce(p_tax_number, '')), '') is null
     and nullif(btrim(coalesce(p_vat_id, '')), '') is null then
    raise exception 'a tax number or a vat id is required' using errcode = '22023';
  end if;

  if p_small_business is null then
    raise exception 'the vat status must be stated explicitly' using errcode = '22023';
  end if;

  -- Die IBAN wird geprueft, bevor sie in den Snapshot jeder spaeteren
  -- Rechnung wandert (ADR-009 Punkt 10). Die Tabelle haelt dieselbe Zusage;
  -- hier steht sie, damit die Meldung sagt, was zu tun ist.
  if not app.iban_checksum_ok(p_iban) then
    raise exception 'the iban checksum does not match' using errcode = '22023';
  end if;

  v_prefix   := coalesce(upper(nullif(btrim(p_invoice_number_prefix), '')), 'RG');
  v_training := coalesce(upper(nullif(btrim(p_training_invoice_number_prefix), '')), 'TR');

  -- Dieselbe Zusage wie die Constraint, nur mit einer Meldung, die sagt, was
  -- zu tun ist (ADR-009 Punkt 17).
  if v_prefix = v_training then
    raise exception 'the two invoice number prefixes must differ' using errcode = '22023';
  end if;

  v_neu := not exists (
    select 1 from public.practice_billing_profiles where organization_id = v_org
  );

  insert into public.practice_billing_profiles as b (
    organization_id, legal_name, street, house_number, postal_code, city,
    phone, email, tax_number, vat_id, small_business,
    bank_name, account_holder, iban, bic,
    invoice_number_prefix, training_invoice_number_prefix, payment_term_days,
    created_by, updated_by
  )
  values (
    v_org,
    btrim(p_legal_name), btrim(p_street), nullif(btrim(p_house_number), ''),
    btrim(p_postal_code), btrim(p_city),
    nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''),
    nullif(btrim(p_tax_number), ''), nullif(btrim(p_vat_id), ''), p_small_business,
    nullif(btrim(p_bank_name), ''), nullif(btrim(p_account_holder), ''),
    -- Die IBAN steht auf dem Papier mit Leerzeichen und in der Datenbank ohne.
    upper(replace(btrim(p_iban), ' ', '')),
    upper(nullif(btrim(p_bic), '')),
    v_prefix, v_training,
    coalesce(p_payment_term_days, 14::smallint),
    v_actor, v_actor
  )
  on conflict (organization_id) do update set
    legal_name                    = excluded.legal_name,
    street                        = excluded.street,
    house_number                  = excluded.house_number,
    postal_code                   = excluded.postal_code,
    city                          = excluded.city,
    phone                         = excluded.phone,
    email                         = excluded.email,
    tax_number                    = excluded.tax_number,
    vat_id                        = excluded.vat_id,
    small_business                = excluded.small_business,
    bank_name                     = excluded.bank_name,
    account_holder                = excluded.account_holder,
    iban                          = excluded.iban,
    bic                           = excluded.bic,
    invoice_number_prefix         = excluded.invoice_number_prefix,
    training_invoice_number_prefix = excluded.training_invoice_number_prefix,
    payment_term_days             = excluded.payment_term_days,
    updated_at                    = now(),
    updated_by                    = v_actor
  where b.organization_id = v_org;

  -- Kein Inhalt im Kontext: Eine Steuernummer gehoert nicht ins Auditlog
  -- (ADR-011). Was sich geaendert hat, steht in der Zeile selbst.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'organization.billing_profile_changed', 'organization', v_org, 'success',
    jsonb_build_object('surface', 'web', 'created', v_neu)
  );
end;
$function$;

-- ---- Trigger
CREATE OR REPLACE FUNCTION app.payments_need_issued_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_status text;
begin
  select i.status into v_status
  from public.invoices i
  where i.id = new.invoice_id;

  if v_status is distinct from 'issued' then
    raise exception 'a payment belongs to an issued invoice' using errcode = '23514';
  end if;

  -- ABN-008 (BEF-100): Nach dem Storno bleibt der eingegangene Betrag stehen.
  -- Er geht als Rueckzahlung an die Zahlende zurueck oder wird mit der
  -- Ersatzrechnung verrechnet - beides ist eine Buchung in Richtung "refund".
  -- Ein neuer Eingang auf eine aufgehobene Forderung bleibt ausgeschlossen.
  if new.direction = 'incoming' and exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = new.invoice_id
  ) then
    raise exception 'a cancelled invoice takes no payment' using errcode = '23514';
  end if;

  return new;
end;
$function$;

-- ---- record_payment
CREATE OR REPLACE FUNCTION public.record_payment(p_invoice_id uuid, p_amount_cents integer, p_paid_on date, p_method text, p_direction text DEFAULT 'incoming'::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor     uuid;
  v_org       uuid;
  v_invoice   record;
  v_zeitzone  text;
  v_heute     date;
  v_eingang   integer;
  v_rueck     integer;
  v_id        uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if v_invoice.status <> 'issued' then
    raise exception 'a payment belongs to an issued invoice' using errcode = '23514';
  end if;

  -- Eine stornierte Rechnung ist keine Forderung mehr und nimmt keinen
  -- Eingang an. Seit ABN-008 (BEF-100) nimmt sie eine RUECKZAHLUNG an: Der
  -- vor dem Storno eingegangene Betrag geht tatsaechlich zurueck. Die
  -- Verrechnung mit der Ersatzrechnung laeuft ueber offset_payment.
  if coalesce(p_direction, 'incoming') = 'incoming' and exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'a cancelled invoice takes no payment' using errcode = '23514';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a payment needs a positive amount' using errcode = '22023';
  end if;

  if p_direction is null or p_direction not in ('incoming', 'refund') then
    raise exception 'unknown payment direction' using errcode = '22023';
  end if;

  if p_method is null or p_method not in ('bank_transfer', 'other') then
    raise exception 'unknown payment method' using errcode = '22023';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  -- Kein Datum in der Zukunft: Eine Zahlung wird erfasst, wenn sie da ist,
  -- nicht wenn sie erwartet wird. Ein erwarteter Eingang ist ein offener
  -- Posten, und den fuehrt die Rechnung selbst.
  if p_paid_on is null or p_paid_on > v_heute then
    raise exception 'a payment cannot be dated in the future' using errcode = '22023';
  end if;

  -- Rueckgezahlt werden kann hoechstens, was eingegangen ist. Ueberzahlung
  -- dagegen bleibt erlaubt: ADR-009 nennt sie ausdruecklich (Konsequenz zu
  -- Punkt 12), und eine Rechnung, die zu viel Geld bekommen hat, ist ein
  -- Sachverhalt und kein Eingabefehler.
  if p_direction = 'refund' then
    select coalesce(sum(case when p.direction = 'incoming' then p.amount_cents else 0 end), 0),
           coalesce(sum(case when p.direction = 'refund'   then p.amount_cents else 0 end), 0)
      into v_eingang, v_rueck
    from public.payments p
    where p.invoice_id = p_invoice_id and p.voided_at is null;

    if v_rueck + p_amount_cents > v_eingang then
      raise exception 'a refund cannot exceed the payments received'
        using errcode = '23514';
    end if;
  end if;

  insert into public.payments (
    organization_id, invoice_id, direction, amount_cents, currency,
    paid_on, method, note, created_by
  )
  values (
    v_org, p_invoice_id, p_direction, p_amount_cents, v_invoice.currency,
    p_paid_on, p_method, nullif(btrim(coalesce(p_note, '')), ''), v_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'payment.recorded', 'payment', v_id, 'success',
    jsonb_build_object('surface', 'web', 'invoice_id', p_invoice_id,
                       'invoice_number', v_invoice.invoice_number,
                       'direction', p_direction, 'amount_cents', p_amount_cents)
  );

  return v_id;
end;
$function$;

-- ---- cancel_invoice
CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_prefix   text;
  v_nummer   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  -- Ein Entwurf wird verworfen, nicht storniert: Er traegt keine Nummer und
  -- hinterlaesst keine Luecke (ADR-009, Konsequenz zu Punkt 8).
  if v_invoice.status <> 'issued' then
    raise exception 'only an issued invoice can be cancelled' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'invoice is already cancelled' using errcode = '23514';
  end if;

  -- Ein Storno ohne Grund waere ein Beleg ohne Aussage - dieselbe Zusage wie
  -- beim Zahlungsstorno (ABR-004).
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a cancellation needs a reason' using errcode = '22023';
  end if;

  -- ABN-008 (BEF-100): Eine stehende Zahlung sperrt das Storno nicht mehr.
  -- Ein tatsaechlich eingegangener Betrag darf nicht verschwinden; er bleibt
  -- an der stornierten Rechnung stehen, bis er zurueckgezahlt oder mit der
  -- Ersatzrechnung verrechnet ist. Ein Zahlungsstorno korrigiert nur eine
  -- falsche Buchung (ANN-079 Fassung 2).

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  v_prefix := app.invoice_number_prefix(v_org, v_invoice.service_area);

  if v_prefix is null then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  v_nummer := app.next_invoice_number(
    v_org, extract(year from v_heute)::smallint, v_invoice.service_area, v_prefix);

  insert into public.invoice_cancellations (
    organization_id, invoice_id, cancellation_number, reason, cancelled_on, created_by
  )
  values (v_org, p_invoice_id, v_nummer, btrim(p_reason), v_heute, v_actor);

  -- Die Leistungen sind wieder abrechenbar. Beides gehoert zusammen: die
  -- Freigabe der Zeile und der Zustand der Leistung; nur eines von beiden
  -- liesse die Leistung entweder unsichtbar oder doppelt abrechenbar.
  update public.invoice_items it
     set released_at = now()
   where it.invoice_id = p_invoice_id
     and it.released_at is null;

  update public.billable_services b
     set status = 'billable'
   where b.id in (
     select it.billable_service_id
     from public.invoice_items it
     where it.invoice_id = p_invoice_id
   );

  -- Der Grund steht in der Zeile, nicht hier: Ein freier Text kann
  -- Patientenbezug tragen (ADR-011, ADR-010 Punkt 3).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.cancelled', 'invoice', p_invoice_id, 'success',
    jsonb_strip_nulls(jsonb_build_object('surface', 'web', 'patient_id', v_invoice.patient_id,
                       'training_relationship_id', v_invoice.training_relationship_id,
                       'invoice_number', v_invoice.invoice_number,
                       'cancellation_number', v_nummer,
                       'service_area', v_invoice.service_area,
                       'total_cents', v_invoice.total_cents,
                       'paid_cents', app.invoice_paid_cents(p_invoice_id)))
  );

  return v_nummer;
end;
$function$;

-- ---- void_payment
CREATE OR REPLACE FUNCTION public.void_payment(p_payment_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_payment record;
  v_eingang integer;
  v_rueck   integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select p.* into v_payment
  from public.payments p
  where p.id = p_payment_id and p.organization_id = v_org
  for update;

  if not found then
    raise exception 'payment not found' using errcode = '42501';
  end if;

  if v_payment.voided_at is not null then
    raise exception 'payment is already voided' using errcode = '23514';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a void needs a reason' using errcode = '22023';
  end if;

  -- Dieselbe Sperre wie in record_payment: Beide Vorgaenge aendern die
  -- Zahlungssumme derselben Rechnung und muessen deshalb hintereinander
  -- laufen, nicht nebeneinander.
  perform 1 from public.invoices i where i.id = v_payment.invoice_id for update;

  -- ABN-008: Eine Verrechnung besteht aus zwei Buchungen, einer an jeder
  -- Rechnung. Sie werden nur gemeinsam storniert; eine Haelfte allein liesse
  -- Geld an einer Rechnung auftauchen oder verschwinden.
  if v_payment.offset_group is not null then
    perform public.void_offset_payments(v_payment.offset_group, p_reason);
    return;
  end if;

  -- Wird ein Eingang storniert, koennten bereits gebuchte Rueckzahlungen
  -- ueber der verbliebenen Summe liegen. Dann zuerst die Rueckzahlung
  -- stornieren - sonst stuende am Ende mehr ausgezahlt als eingegangen.
  if v_payment.direction = 'incoming' then
    select coalesce(sum(case when p.direction = 'incoming' then p.amount_cents else 0 end), 0),
           coalesce(sum(case when p.direction = 'refund'   then p.amount_cents else 0 end), 0)
      into v_eingang, v_rueck
    from public.payments p
    where p.invoice_id = v_payment.invoice_id
      and p.voided_at is null
      and p.id <> p_payment_id;

    if v_rueck > v_eingang then
      raise exception 'voiding this payment would leave refunds without payments received'
        using errcode = '23514';
    end if;
  end if;

  update public.payments
     set voided_at   = now(),
         voided_by   = v_actor,
         void_reason = btrim(p_reason)
   where id = p_payment_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'payment.voided', 'payment', p_payment_id, 'success',
    jsonb_build_object('surface', 'web', 'invoice_id', v_payment.invoice_id,
                       'direction', v_payment.direction,
                       'amount_cents', v_payment.amount_cents)
  );
end;
$function$;

-- ---- list_revenue_by_service_area
CREATE OR REPLACE FUNCTION public.list_revenue_by_service_area(p_basis text, p_year integer DEFAULT NULL::integer)
 RETURNS TABLE(basis text, year integer, service_area text, tax_treatment text, tax_rate_permille smallint, currency text, gross_cents bigint, tax_cents bigint, net_cents bigint, document_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org      uuid;
  v_zeitzone text;
  v_jahr     integer;
  v_von      date;
  v_bis      date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoicing figures');
    return;
  end if;

  -- Festlegung 1: ohne genannte Grundlage keine Zahl.
  if p_basis is null or p_basis not in ('accrual', 'cash') then
    raise exception 'unknown revenue basis' using errcode = '22023';
  end if;

  v_org := app.current_organization_id();

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_jahr := coalesce(p_year, extract(year from (now() at time zone v_zeitzone))::integer);

  if v_jahr < 2020 or v_jahr > 2200 then
    raise exception 'year out of range' using errcode = '22023';
  end if;

  v_von := make_date(v_jahr, 1, 1);
  v_bis := make_date(v_jahr + 1, 1, 1);

  return query
  with dokument as (
    -- Grundlage Rechnungsstellung, Teil 1: die ausgestellte Rechnung mit
    -- ihrem Ausstellungstag. Der Bereich steht seit ABR-010 im Snapshot; die
    -- Spalte bleibt als Rueckfallweg fuer aeltere Snapshots (schema_version 1
    -- und 2), die es ausserhalb von Entwicklungsdatenbanken nicht gibt.
    select i.id                                                      as document_id,
           coalesce(i.snapshot ->> 'service_area', i.service_area)   as service_area,
           i.currency                                                as currency,
           i.snapshot -> 'tax_groups'                                as tax_groups,
           1                                                         as vorzeichen
    from public.invoices i
    where p_basis = 'accrual'
      and i.organization_id = v_org
      and i.status = 'issued'
      and i.issued_on >= v_von and i.issued_on < v_bis
    union all
    -- Teil 2: das Stornodokument mit seinem eigenen Tag und umgekehrtem
    -- Vorzeichen (Festlegung 4). Es traegt keine eigenen Betraege - es nimmt
    -- die seiner Rechnung zurueck, und genau das steht darin.
    select c.id,
           coalesce(i.snapshot ->> 'service_area', i.service_area),
           i.currency,
           i.snapshot -> 'tax_groups',
           -1
    from public.invoice_cancellations c
    join public.invoices i on i.id = c.invoice_id
    where p_basis = 'accrual'
      and c.organization_id = v_org
      and c.cancelled_on >= v_von and c.cancelled_on < v_bis
  ),
  nach_rechnungsstellung as (
    select d.service_area,
           g ->> 'tax_treatment'                            as tax_treatment,
           (g ->> 'tax_rate_permille')::smallint            as tax_rate_permille,
           d.currency,
           d.document_id,
           d.vorzeichen * (g ->> 'gross_cents')::bigint     as brutto,
           d.vorzeichen * (g ->> 'tax_cents')::bigint       as steuer,
           d.vorzeichen * (g ->> 'net_cents')::bigint       as netto
    from dokument d
    cross join lateral jsonb_array_elements(d.tax_groups) as g
  ),
  zahlung as (
    -- Grundlage Zufluss: gebuchte Zahlungen. Eine stornierte Zahlung ist aus
    -- jeder Summe heraus (`voided_at`), eine Rueckzahlung kehrt das Vorzeichen
    -- um. Der Bereich und die Steuergruppen kommen aus der Rechnung, zu der
    -- die Zahlung gehoert - eine Zahlung kennt sie nicht selbst.
    --
    -- ABN-008 (BEF-100, ANN-088 Fassung 2): KUMULATIV. Verteilt wird die
    -- Summe aller Zahlungen der Rechnung bis einschliesslich dieser, davon
    -- abgezogen die Verteilung bis zur vorigen. Mehrere Teilzahlungen ergeben
    -- so bei voller Zahlung genau die Gruppen des Dokuments, und eine
    -- Rueckzahlung nimmt ihre Verteilung centgenau zurueck. Die Reihenfolge
    -- ist fest: Zahlungstag, Erfassung, Kennung. Gezaehlt werden auch
    -- Zahlungen frueherer Jahre - sie bestimmen, wo die Rechnung steht.
    select p.id                                                    as document_id,
           p.paid_on                                               as paid_on,
           i.currency                                              as currency,
           coalesce(i.snapshot ->> 'service_area', i.service_area) as service_area,
           i.snapshot -> 'tax_groups'                              as tax_groups,
           sum(case p.direction when 'incoming' then p.amount_cents else -p.amount_cents end)
             over (partition by p.invoice_id
                   order by p.paid_on, p.created_at, p.id)::bigint as nach,
           sum(case p.direction when 'incoming' then p.amount_cents else -p.amount_cents end)
             over (partition by p.invoice_id
                   order by p.paid_on, p.created_at, p.id)::bigint
             - case p.direction when 'incoming' then p.amount_cents else -p.amount_cents end
                                                                   as vor
    from public.payments p
    join public.invoices i on i.id = p.invoice_id
    where p_basis = 'cash'
      and p.organization_id = v_org
      and p.voided_at is null
      and p.paid_on < v_bis
  ),
  nach_zufluss as (
    select z.service_area,
           n.tax_treatment,
           n.tax_rate_permille,
           z.currency,
           z.document_id,
           n.brutto - v.brutto                            as brutto,
           n.steuer - v.steuer                            as steuer,
           (n.brutto - v.brutto) - (n.steuer - v.steuer)  as netto
    from zahlung z
    cross join lateral app.distribute_to_tax_groups(z.tax_groups, z.nach) n
    join lateral app.distribute_to_tax_groups(z.tax_groups, z.vor) v
      on v.tax_treatment = n.tax_treatment
     and v.tax_rate_permille = n.tax_rate_permille
    where z.paid_on >= v_von
  ),
  alles as (
    select * from nach_rechnungsstellung
    union all
    select * from nach_zufluss
  )
  select p_basis,
         v_jahr,
         a.service_area,
         a.tax_treatment,
         a.tax_rate_permille,
         a.currency,
         sum(a.brutto)::bigint,
         sum(a.steuer)::bigint,
         sum(a.netto)::bigint,
         count(distinct a.document_id)::integer
  from alles a
  group by a.service_area, a.tax_treatment, a.tax_rate_permille, a.currency
  order by a.service_area, a.tax_treatment, a.tax_rate_permille, a.currency;
end;
$function$;
