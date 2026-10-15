-- =============================================================================
-- B7 (BEF-157, Auftrag Jannes 14.10.2026; ADR-009 Fassung 6, ADR-016 Fassung 4,
-- ADR-018 Fassung 5, ADR-020 Fassung 2): „In die Abrechnung stellen“ und die
-- Sperre danach.
--
-- Jannes: „Ist eine Grundlage mit diesem Abhaken vollständig erbracht, schlägt
-- die App vor, sie in die Abrechnung zu stellen; die Therapeut:in bestätigt mit
-- einem Klick. Danach sind Doku, Zeitpunkt und Anzahl der Termine nicht mehr
-- änderbar.“ Das ersetzt ANN-140 („keine Freigabe nötig“).
--
--   1. Die Grundlage traegt die Freigabe zur Abrechnung als Zeitpunkt und
--      Person (das Datenmodell ist der Nachweis, ADR-010 Punkt 15).
--   2. app.treatment_basis_billing - die eine Stelle fuer erbracht, offen,
--      vollstaendig und bereit (ANN-514).
--   3. release_ / withdraw_treatment_basis_for_billing: freigeben mit einem
--      Tipp; zurueckholen, solange keine Rechnung zur Grundlage besteht.
--   4. Sperre (ANN-515) als Trigger an genau den Tabellen, die es betrifft:
--      Termine der Grundlage (Zeit, Zustand, Haken, Zuordnung, neue Termine)
--      und ihre Dokumentation (Inhalt, Zustand, Korrektur, Nachtrag). Loeschen
--      im Aufbewahrungslauf und Zusammenfuehren bleiben unberuehrt.
--   5. get_appointment_billing_context liefert den Stand fuer den Vorschlag.
-- =============================================================================

-- 1. Spalten ------------------------------------------------------------------

alter table public.treatment_bases
  add column billing_released_at  timestamptz,
  add column billing_released_by  uuid,
  add column billing_withdrawn_at timestamptz,
  add column billing_withdrawn_by uuid,
  add constraint treatment_bases_billing_release_complete check (
    (billing_released_at is null) = (billing_released_by is null)
  );

comment on column public.treatment_bases.billing_released_at is
  'B7 (BEF-157, ADR-020 Fassung 2): in die Abrechnung gestellt am. Gesetzt sperrt die Grundlage Doku, Zeitpunkt und Anzahl ihrer Termine (ANN-515). Organisatorisch, kein klinischer Inhalt; Datenklasse der Grundlage (klinische Patientenakte).';
comment on column public.treatment_bases.billing_released_by is
  'B7: auth.users.id der Person, die freigegeben hat. Ohne FK wie created_by, damit ein spaeter geloeschtes Konto den Nachweis nicht entfernt.';
comment on column public.treatment_bases.billing_withdrawn_at is
  'B7: zuletzt aus der Abrechnung zurueckgeholt am (leer, solange nie zurueckgeholt).';
comment on column public.treatment_bases.billing_withdrawn_by is
  'B7: auth.users.id der Person, die zuletzt zurueckgeholt hat.';

-- 2. Stand der Grundlage -------------------------------------------------------

-- ANN-514: erbracht = abgehakt; bereit = jeder Termin der Grundlage abgehakt und dokumentiert.
create function app.treatment_basis_billing(
  p_treatment_basis_id uuid,
  OUT appointment_count integer,
  OUT performed integer,
  OUT documented integer,
  OUT open_count integer,
  OUT past_open integer,
  OUT planned integer,
  OUT upcoming integer,
  OUT complete boolean,
  OUT ready boolean,
  OUT released_at timestamptz,
  OUT invoiced boolean,
  OUT state text
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entwurf      boolean;
  v_doku_entwurf boolean;
begin
  select b.appointment_count, b.billing_released_at
    into appointment_count, released_at
  from public.treatment_bases b
  where b.id = p_treatment_basis_id;

  if not found then
    return;
  end if;

  -- Erbracht: abgehakt (B4/B7). Dokumentiert und abgehakt: abrechenbar.
  select count(*) filter (where a.completed_at is not null or a.status = 'invoiced'),
         count(*) filter (where a.status in ('documented', 'invoiced')
                           and (a.completed_at is not null or a.status = 'invoiced')),
         -- Offen: jeder Termin, der weder abgehakt und dokumentiert noch
         -- abgesagt oder nicht angetroffen ist - auch ein kuenftiger.
         count(*) filter (where a.status not in ('cancelled', 'no_show', 'invoiced')
                           and not (a.status = 'documented' and a.completed_at is not null)),
         -- Nachzuholen: offen und schon vorbei (Haken oder Doku fehlt).
         count(*) filter (where a.status not in ('cancelled', 'no_show', 'invoiced')
                           and not (a.status = 'documented' and a.completed_at is not null)
                           and a.ends_at <= now()),
         count(*) filter (where a.status not in ('cancelled', 'no_show')),
         count(*) filter (where a.status = 'confirmed' and a.ends_at > now())
    into performed, documented, open_count, past_open, planned, upcoming
  from public.appointments a
  where a.treatment_basis_id = p_treatment_basis_id;

  invoiced := exists (
    select 1
    from public.invoices i
    where i.treatment_basis_id = p_treatment_basis_id
      and i.status = 'issued'
      and not exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id)
  );
  -- Ein Entwurf zur Grundlage: Das Buero rechnet sie gerade ab.
  v_entwurf := exists (
    select 1
    from public.invoices i
    where i.treatment_basis_id = p_treatment_basis_id
      and i.status = 'draft'
  );

  -- Ein Entwurf an einem Termin der Grundlage, auch ein Nachtrag: Die Doku ist
  -- nicht fertig, und unter der Sperre liesse er sich nicht mehr festschreiben.
  v_doku_entwurf := exists (
    select 1
    from public.treatment_notes t
    join public.appointments a on a.id = t.appointment_id
    where a.treatment_basis_id = p_treatment_basis_id
      and t.status = 'draft'
  );

  complete := appointment_count is not null and performed >= appointment_count;
  ready := released_at is null and not invoiced and not v_entwurf and not v_doku_entwurf
           and documented > 0 and open_count = 0;

  -- Ein Zustand je Grundlage fuer Akte, Liste und Vorschlag (B1, B7).
  state := case
    when invoiced then 'abgerechnet'
    when released_at is not null or v_entwurf then 'in_abrechnung'
    when past_open > 0 or v_doku_entwurf then 'nachholen'
    when ready and complete then 'abrechnen'
    when upcoming > 0 then 'laeuft'
    when coalesce(appointment_count, 0) > planned then 'termine_fehlen'
    when ready then 'abrechnen'
    else 'laeuft'
  end;
end;
$$;

revoke all on function app.treatment_basis_billing(uuid) from public, anon, authenticated;

comment on function app.treatment_basis_billing(uuid) is
  'B7 (ANN-514): Stand einer Grundlage fuer die Abrechnung - Terminzahl, erbracht (abgehakt), dokumentiert und abgehakt, offen (weder das noch abgesagt/nicht angetroffen), davon vorbei, verplant, bevorstehend, vollstaendig, bereit zur Freigabe, freigegeben, abgerechnet und ein Zustand (laeuft, termine_fehlen, nachholen, abrechnen, in_abrechnung, abgerechnet). Die eine Stelle; Freigabe, Vorschlag, Akte und Patientenliste fragen sie.';

create function app.can_release_treatment_basis()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- B7: wer abhakt (Behandelnde) und wer abrechnet (owner, office).
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

revoke all on function app.can_release_treatment_basis() from public, anon;
grant execute on function app.can_release_treatment_basis() to authenticated;

-- Zweitreview A (Endstand), Befund 1: Die Sperre haelt auch gegen
-- gleichzeitige Schreibvorgaenge. FOR KEY SHARE wartet auf eine laufende
-- Freigabe, ein Zurueckholen oder ein Loeschen (FOR UPDATE an derselben Zeile)
-- und liest danach deren Ergebnis; umgekehrt wartet eine Freigabe auf einen
-- Schreibvorgang, der hier schon gesperrt hat, und rechnet ihn mit. Mit
-- gewoehnlichen Aenderungen der Grundlage (FOR NO KEY UPDATE) kollidiert es
-- nicht. Gerufen nur aus den Sperr-Triggern unten, also nie in einer nur
-- lesenden Transaktion.
create function app.treatment_basis_locked(p_treatment_basis_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_freigegeben timestamptz;
begin
  select b.billing_released_at into v_freigegeben
  from public.treatment_bases b
  where b.id = p_treatment_basis_id
  for key share;
  return v_freigegeben is not null;
end;
$$;

revoke all on function app.treatment_basis_locked(uuid) from public, anon, authenticated;

comment on function app.treatment_basis_locked(uuid) is
  'B7 (ANN-515): Ist die Grundlage in die Abrechnung gestellt? Dann sind Doku, Zeitpunkt und Anzahl ihrer Termine gesperrt. Liest die Zeile FOR KEY SHARE, damit eine gleichzeitige Freigabe und ein Schreibvorgang nacheinander laufen (ADR-016 Punkt 11).';

-- 3. Freigeben und Zurueckholen -------------------------------------------------

create function public.release_treatment_basis_for_billing(p_treatment_basis_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_stand record;
  v_zeit  timestamptz := now();
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_release_treatment_basis() then
    raise exception 'not allowed to release treatment bases for billing' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to release treatment bases for billing' using errcode = '42501';
  end if;

  perform 1
  from public.treatment_bases b
  where b.id = p_treatment_basis_id
    and b.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  select * into v_stand from app.treatment_basis_billing(p_treatment_basis_id);

  if v_stand.released_at is not null then
    raise exception 'treatment basis is already in billing' using errcode = '22023';
  end if;

  if v_stand.open_count > 0 then
    raise exception 'treatment basis has open appointments' using errcode = '22023';
  end if;

  if v_stand.documented = 0 then
    raise exception 'treatment basis has no documented appointment' using errcode = '22023';
  end if;

  -- Ein Entwurf, auch ein Nachtrag: Unter der Sperre liesse er sich weder
  -- festschreiben noch automatisch finalisieren (ADR-016 Punkt 7).
  if exists (
    select 1
    from public.treatment_notes t
    join public.appointments a on a.id = t.appointment_id
    where a.treatment_basis_id = p_treatment_basis_id
      and t.status = 'draft'
  ) then
    raise exception 'treatment basis has draft documentation' using errcode = '22023';
  end if;

  update public.treatment_bases
     set billing_released_at = v_zeit,
         billing_released_by = v_actor
   where id = p_treatment_basis_id;

  return v_zeit;
end;
$$;

revoke all on function public.release_treatment_basis_for_billing(uuid) from public, anon;
grant execute on function public.release_treatment_basis_for_billing(uuid) to authenticated;

comment on function public.release_treatment_basis_for_billing(uuid) is
  'B7 (BEF-157): stellt eine Grundlage in die Abrechnung - nur wenn jeder ihrer Termine abgehakt und dokumentiert (oder abgesagt, nicht angetroffen) ist und kein Entwurf mehr an ihnen haengt. Danach sperrt sie Doku, Zeitpunkt und Anzahl ihrer Termine (ANN-515). Keine Auditaktion: Zeitpunkt und Person stehen an der Grundlage.';

create function public.withdraw_treatment_basis_from_billing(p_treatment_basis_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_frei  timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_release_treatment_basis() then
    raise exception 'not allowed to release treatment bases for billing' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to release treatment bases for billing' using errcode = '42501';
  end if;

  select b.billing_released_at into v_frei
  from public.treatment_bases b
  where b.id = p_treatment_basis_id
    and b.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  if v_frei is null then
    raise exception 'treatment basis is not in billing' using errcode = '22023';
  end if;

  -- Eine Rechnung (Entwurf oder ausgestellt, nicht storniert) haelt die
  -- Grundlage: Was abgerechnet wird, aendert sich nicht mehr (ADR-009 Punkt 9).
  if exists (
    select 1
    from public.invoices i
    where i.treatment_basis_id = p_treatment_basis_id
      and not exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id)
  ) then
    raise exception 'treatment basis has an invoice' using errcode = '23514';
  end if;

  update public.treatment_bases
     set billing_released_at  = null,
         billing_released_by  = null,
         billing_withdrawn_at = now(),
         billing_withdrawn_by = v_actor
   where id = p_treatment_basis_id;
end;
$$;

revoke all on function public.withdraw_treatment_basis_from_billing(uuid) from public, anon;
grant execute on function public.withdraw_treatment_basis_from_billing(uuid) to authenticated;

comment on function public.withdraw_treatment_basis_from_billing(uuid) is
  'B7 (BEF-157): holt eine Grundlage aus der Abrechnung zurueck, solange keine Rechnung (Entwurf oder ausgestellt, nicht storniert) sie fuehrt. Hebt die Sperre auf; Zeitpunkt und Person des Zurueckholens stehen an der Grundlage.';

-- 4. Sperre ------------------------------------------------------------------

-- ANN-515: die Sperre nach der Freigabe - eine Stelle je Tabelle, als Trigger.
create function app.appointments_basis_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.treatment_basis_id is not null and app.treatment_basis_locked(new.treatment_basis_id) then
      raise exception 'treatment basis is in billing' using errcode = '55000';
    end if;
    return new;
  end if;

  -- Erst die Spalten, dann die Sperre (Zweitreview A, Nachtrag): Eine
  -- Aenderung, die die Abrechnung nicht beruehrt - Zusammenfuehren, Titel -,
  -- sperrt die Grundlage nicht und wartet auf keine Freigabe.
  if new.starts_at          is not distinct from old.starts_at
     and new.ends_at            is not distinct from old.ends_at
     and new.status             is not distinct from old.status
     and new.completed_at       is not distinct from old.completed_at
     and new.treatment_basis_id is not distinct from old.treatment_basis_id
     and new.staff_member_id    is not distinct from old.staff_member_id then
    return new;
  end if;

  if (old.treatment_basis_id is not null and app.treatment_basis_locked(old.treatment_basis_id))
     or (new.treatment_basis_id is not null
         and new.treatment_basis_id is distinct from old.treatment_basis_id
         and app.treatment_basis_locked(new.treatment_basis_id)) then
    raise exception 'treatment basis is in billing' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app.appointments_basis_lock() from public, anon, authenticated;

create trigger appointments_basis_lock
  before insert or update on public.appointments
  for each row execute function app.appointments_basis_lock();

create function app.treatment_notes_basis_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_basis uuid;
begin
  if tg_table_name = 'treatment_note_versions' then
    select a.treatment_basis_id into v_basis
    from public.treatment_notes t
    join public.appointments a on a.id = t.appointment_id
    where t.id = new.note_id;
  else
    select a.treatment_basis_id into v_basis
    from public.appointments a
    where a.id = new.appointment_id;
  end if;

  if v_basis is not null and app.treatment_basis_locked(v_basis) then
    raise exception 'treatment basis is in billing' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app.treatment_notes_basis_lock() from public, anon, authenticated;

create trigger treatment_notes_basis_lock
  before insert or update of content, status, visit_without_treatment
  on public.treatment_notes
  for each row execute function app.treatment_notes_basis_lock();

create trigger treatment_note_versions_basis_lock
  before insert on public.treatment_note_versions
  for each row execute function app.treatment_notes_basis_lock();

-- Die Terminzahl und die verordneten Mengen der Grundlage selbst. Die genutzte
-- Menge bleibt frei: Sie folgt den Leistungen, nicht der Hand. Faellt die
-- Grundlage im Aufbewahrungslauf, ist sie beim Kaskadieren schon fort und
-- sperrt nichts mehr.
create function app.treatment_bases_basis_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'treatment_bases' then
    if old.billing_released_at is not null and new.billing_released_at is not null
       and (new.appointment_count is distinct from old.appointment_count
            or new.treatment_basis_kind is distinct from old.treatment_basis_kind) then
      raise exception 'treatment basis is in billing' using errcode = '55000';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if app.treatment_basis_locked(old.treatment_basis_id) then
      raise exception 'treatment basis is in billing' using errcode = '55000';
    end if;
    return old;
  end if;

  -- Erst die Spalten, dann die Sperre: Die genutzte Menge folgt den
  -- Leistungen und sperrt die Grundlage nicht (Zweitreview A, Nachtrag).
  if tg_op = 'UPDATE'
     and new.prescribed_quantity is not distinct from old.prescribed_quantity
     and new.remedy is not distinct from old.remedy then
    return new;
  end if;

  if app.treatment_basis_locked(new.treatment_basis_id) then
    raise exception 'treatment basis is in billing' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app.treatment_bases_basis_lock() from public, anon, authenticated;

create trigger treatment_bases_basis_lock
  before update on public.treatment_bases
  for each row execute function app.treatment_bases_basis_lock();

create trigger treatment_base_items_basis_lock
  before insert or update or delete on public.treatment_base_items
  for each row execute function app.treatment_bases_basis_lock();

-- 5. Abrechnungslage am Termin mit Freigabe -----------------------------------
--
-- Juengste Fassung aus 20261016110000_knd_001_closing_talk.sql, dazu der Haken
-- des Termins und der Stand seiner Grundlage (app.treatment_basis_billing).

drop function public.get_appointment_billing_context(uuid);

create function public.get_appointment_billing_context(p_appointment_id uuid)
returns table (
  appointment_id            uuid,
  treatment_basis_id        uuid,
  treatment_basis_kind      text,
  treatment_basis_issued_on date,
  basis_position            integer,
  basis_appointment_count   integer,
  billing_visible           boolean,
  recipient_kind            text,
  open_invoice_count        integer,
  open_outstanding_cents    integer,
  open_overdue              boolean,
  closing_talk_due          boolean,
  checked_at                timestamptz,
  basis_performed           integer,
  basis_open                integer,
  basis_complete            boolean,
  basis_ready               boolean,
  basis_released_at         timestamptz,
  basis_invoiced            boolean,
  basis_state               text,
  can_release               boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_patient uuid;
  v_kind    text;
  v_basis   uuid;
  v_haken   timestamptz;
  v_darf    boolean;
  v_heute   date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  select a.patient_id, a.kind, a.treatment_basis_id, a.completed_at
    into v_patient, v_kind, v_basis, v_haken
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- Zweitreview: ein nicht lesbarer Bereich wie ein unbekannter Termin.
    and app.may_read_appointment_context(a.kind);

  if not found then
    return;
  end if;

  -- Die Abrechnungslage gibt es am Behandlungstermin. Training rechnet ueber
  -- ein eigenes Verhaeltnis ab (ADR-021), eine Fehlzeit gar nicht.
  if v_kind <> 'therapy' or v_patient is null then
    raise exception 'a billing context exists only for treatment appointments'
      using errcode = '22023';
  end if;

  -- ANN-139: Zahlungsinformationen nur fuer die Rollen der Abrechnung.
  v_darf := app.can_read_invoicing();
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = v_org;

  return query
    select
      p_appointment_id,
      b.id,
      b.treatment_basis_kind,
      b.issued_on,
      app.appointment_basis_position(p_appointment_id),
      b.appointment_count,
      v_darf,
      case when v_darf then coalesce((
        select r.recipient_kind
        from public.invoice_recipients r
        where r.patient_id = v_patient
          and r.organization_id = v_org
          and r.is_default
      ), 'self') end,
      case when v_darf then offen.anzahl end,
      case when v_darf then offen.betrag end,
      case when v_darf then offen.ueberfaellig end,
      -- KND-001: Abschlussgespraech in den letzten Terminen (ANN-286).
      app.closing_talk_due(p_appointment_id),
      -- B4/B7: der Haken des Termins und der Stand seiner Grundlage.
      v_haken,
      stand.performed,
      stand.open_count,
      stand.complete,
      stand.ready,
      stand.released_at,
      stand.invoiced,
      stand.state,
      (b.id is not null and app.can_release_treatment_basis() and coalesce(stand.ready, false))
    from (select 1) eins
    left join public.treatment_bases b on b.id = v_basis and b.organization_id = v_org
    left join lateral app.treatment_basis_billing(b.id) stand on b.id is not null
    left join lateral (
      select count(*)::integer as anzahl,
             coalesce(sum(o.outstanding_cents), 0)::integer as betrag,
             coalesce(bool_or(o.due_on < v_heute), false) as ueberfaellig
      from app.open_invoices(v_org) o
      where o.patient_id = v_patient
    ) offen on v_darf;
end;
$$;

comment on function public.get_appointment_billing_context(uuid) is
  'PRX-008: Verordnungszaehler und Abrechnungslage am Termin. Position fuer alle Rollen der Terminverwaltung, Empfaenger und offene Rechnungen nur fuer owner und office (ANN-139). Seit KND-001 dazu closing_talk_due (ANN-286). Seit B4/B7 der Haken des Termins und der Stand der Grundlage fuer den Vorschlag „In die Abrechnung stellen“ (ANN-514).';

revoke all on function public.get_appointment_billing_context(uuid) from public, anon;
grant execute on function public.get_appointment_billing_context(uuid) to authenticated;
