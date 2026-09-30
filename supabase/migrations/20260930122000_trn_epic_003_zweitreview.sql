-- =============================================================================
-- TRN-EPIC-003, Zweitreview: Befunde aus dem Review in frischem Kontext
--
--   1. Nach drei Jahren faellt im Training alles, was die Belege nicht
--      brauchen (ADR-021 Punkt 4 vor ANN-183): Kontakt, Termine ohne Leistung,
--      unbenutzte Vereinbarungen. Nur die Belege und was sie tragen bleiben
--      bis zum Ende ihrer steuerlichen Frist.
--   2. Das Loeschjournal kennt die Kontaktdaten des Trainings
--      (reapply_deletion_journal).
--   3. Zeile und Rechnung am selben Verhaeltnis - auch beim Aendern.
--   4. Zusammengesetzte Fremdschluessel halten die Organisation des
--      Trainingsverhaeltnisses an Leistung und Rechnung.
--   5. Ausstellen, Storno und Erinnerung protokollieren das
--      Trainingsverhaeltnis (nur Kennungen, ADR-010 Punkt 3).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Teilloeschung nach drei Jahren (ANN-183, ADR-021 Punkt 4)
--
-- ADR-021 Punkt 4 ist verbindlich: drei Jahre ab Vertragsende. ADR-008
-- Punkt 2 rechtfertigt, die **Belege** laenger aufzubewahren - nicht Kontakt,
-- Geburtsdatum und Termine ohne Leistung. Der Rechnungssnapshot traegt Name
-- und Anschrift selbst (ADR-009 Punkt 10) und braucht den Kontakt nicht.
--
-- Stehen bleiben: die Verhaeltniszeile (Leistung und Rechnung zeigen mit
-- RESTRICT auf sie), die Person, die Termine mit Leistung (die Leistung
-- zeigt mit RESTRICT auf ihren Termin), die Vereinbarungen dieser Termine
-- und die Belege selbst. Alles faellt dann mit app.delete_training_relationship,
-- sobald die Belegfrist ablaeuft. Der Lauf ist wiederholbar: Beim naechsten
-- Mal gibt es nichts mehr zu nehmen.
-- -----------------------------------------------------------------------------
create function app.reduce_training_relationship(
  p_relationship_id uuid,
  p_run_id          uuid,
  p_due_at          timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_n     integer;
begin
  -- Kontakt, Anschrift, Geburtsdatum. Der Schluessel ist das Verhaeltnis;
  -- er steht als Kennung im Journal.
  with geloescht as (
    delete from public.training_contact_details c
     where c.training_relationship_id = p_relationship_id
    returning c.training_relationship_id as id, c.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_contact_details', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Termine ohne Leistung: kein Beleg, nichts, was die Frist traegt.
  with geloescht as (
    delete from public.appointments a
     where a.training_relationship_id = p_relationship_id
       and not exists (select 1 from public.billable_services b where b.appointment_id = a.id)
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'appointments', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Vereinbarungen, an denen kein verbliebener Termin mehr haengt.
  with geloescht as (
    delete from public.training_bases tb
     where tb.training_relationship_id = p_relationship_id
       and not exists (select 1 from public.appointments a where a.training_basis_id = tb.id)
    returning tb.id, tb.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_bases', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

comment on function app.reduce_training_relationship(uuid, uuid, timestamptz) is
  'Teilloeschung eines Trainingsverhaeltnisses nach drei Jahren, solange seine Belege noch in der steuerlichen Frist liegen (ANN-183, ADR-021 Punkt 4, ADR-008 Punkt 2): Kontakt, Termine ohne Leistung und unbenutzte Vereinbarungen fallen, jeder Datensatz im Journal. Der Rest faellt mit app.delete_training_relationship.';

revoke all on function app.reduce_training_relationship(uuid, uuid, timestamptz) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_retention()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_steuer    integer;
  v_verhaelt  record;
  v_training  integer;
  v_termine   integer;
  v_audit     integer;
  v_zugang    integer;
  v_fotos     integer;
  v_warte     integer;
  v_aufgaben  integer;
  v_anrufe    integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

    -- -------------------------------------------------------------------
    -- Patientenfotos: zwoelf Monate ab Aufnahme, spaetestens drei Monate
    -- nach dem festgehaltenen Abschluss, Widerruf (ADR-017 Punkt 38).
    -- Ein Legal Hold haelt an.
    -- -------------------------------------------------------------------
    v_fotos := app.delete_due_patient_photos(v_org.id, null, v_run, null, 'retention');

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Versorgung
    -- -------------------------------------------------------------------
    for v_akte in
      select p.id,
             app.retention_due_at(
               p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
             ) as due_at
      from public.patients p
      where p.organization_id = v_org.id
        and p.care_concluded_on is not null
        and app.retention_due_at(
              p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
            ) <= now()
      order by p.care_concluded_on
      for update of p skip locked
    loop
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      -- Neu mit ABR-003: Die steuerliche Frist einer ausgestellten Rechnung
      -- kann die zehn Jahre der Akte ueberdauern. Gesetzliche Aufbewahrung
      -- hat Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2).
      if app.billing_retention_due_at(v_akte.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Trainingsverhaeltnis: drei Jahre ab Vertragsende (ADR-021 Punkt 4)
    --
    -- Eigene Schleife und nicht ein Zweig der Akte: Die Frist ist kuerzer,
    -- der Anker ein anderer, und die Rechtsgrundlage traegt die
    -- Heilbehandlungs-Ausnahme nicht. Ohne Vertragsende laeuft keine Frist -
    -- ein laufendes Training wird nie geloescht.
    --
    -- KEIN LEGAL HOLD, UND ZWAR ABSICHTLICH: Loeschsperren stehen heute auf
    -- Patientenebene (ANN-033); ein Hold auf ein Trainingsverhaeltnis ist
    -- nicht darstellbar und waere hier eine Pruefung ohne Gegenstand. Wer
    -- eine Loeschung anhalten muss, raeumt bis dahin contract_ended_on - der
    -- Anker ist genau dafuer ruecknehmbar gebaut (LEI-001). Eine Sperre in
    -- der Behandlung wirkt nicht hierher: Der Hold haengt am Verhaeltnis
    -- (ADR-021), und die gemeinsame Person haelt sie ueber die Akte.
    --
    -- SKIP LOCKED wie bei der Akte: ein Verhaeltnis, an dem gerade jemand
    -- arbeitet, kommt im naechsten Lauf erneut dran.
    -- -------------------------------------------------------------------
    for v_verhaelt in
      select t.id,
             app.retention_due_at(
               t.contract_ended_on,
               app.retention_interval('trainingsverhaeltnis'),
               v_org.time_zone
             ) as due_at
      from public.training_relationships t
      where t.organization_id = v_org.id
        and t.contract_ended_on is not null
        and app.retention_due_at(
              t.contract_ended_on,
              app.retention_interval('trainingsverhaeltnis'),
              v_org.time_zone
            ) <= now()
      order by t.contract_ended_on
      for update of t skip locked
    loop
      -- TRN-008 (ANN-183): Die steuerliche Frist der Belege kann die drei
      -- Jahre des Verhaeltnisses ueberdauern. Gesetzliche Aufbewahrung hat
      -- Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2) - dieselbe
      -- Regel wie an der Akte.
      if app.training_billing_retention_due_at(v_verhaelt.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        -- Zweitreview: gehalten werden nur die Belege und was sie tragen;
        -- der Rest faellt nach den drei Jahren aus ADR-021 Punkt 4.
        v_training := v_training
          + app.reduce_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
        continue;
      end if;

      v_training := v_training
        + app.delete_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- Vorgang mit Gebuehrenanlass bleibt stehen: er ist die Grundlage
    -- einer Forderung (ANN-035, CAL-014b). Die mit der Abrechnung
    -- angekuendigte Bedingung "ohne Rechnung" ist damit erfuellt: Eine
    -- Rechnung kann nur an einem dokumentierten Termin oder an einem
    -- Gebuehrenanlass haengen, und beide nimmt die Abfrage bereits aus.
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc(
                  'year',
                  coalesce(a.cancelled_at, a.no_show_recorded_at) at time zone v_org.time_zone
                ) + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.fee_basis is null
        -- CAL-026: NUR Praxistermine. Ein Trainingstermin faellt mit seinem
        -- Verhaeltnis (oben) und nach dessen Frist - nicht hier. Zwei Gruende,
        -- und beide sind hart: Diese Frist rechnet ab Kalenderjahresende statt
        -- ab Vertragsende, und die Sperrpruefung darunter laeuft ueber
        -- a.patient_id, der am Trainingstermin leer ist - eine Sperre am
        -- Verhaeltnis haette die Zeile nicht gehalten (ADR-022, Konsequenzen).
        and a.kind <> 'training'
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show' and a.no_show_recorded_at is not null)
        )
        and not exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointments a
      using faellig f
      where a.id = f.id
        and f.due_at <= now()
      returning a.id, a.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointments', g.id, 'termin_ohne_nachweis', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_termine = row_count;

    -- -------------------------------------------------------------------
    -- Auditlog: drei Jahre ab dem Ereignis (ANN-029)
    -- -------------------------------------------------------------------
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval('auditlog')
        and not (
          a.subject_type = 'patient'
          and app.under_legal_hold(v_org.id, 'patient', a.subject_id)
        )
      returning a.id, a.organization_id, a.occurred_at
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, 'auditlog',
           g.occurred_at + app.retention_interval('auditlog')
    from geloescht g;
    get diagnostics v_audit = row_count;

    -- -------------------------------------------------------------------
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs (ANN-026)
    -- -------------------------------------------------------------------
    with faellig as (
      select i.id,
             i.organization_id,
             coalesce(
               i.accepted_at,
               i.revoked_at,
               case when i.status = 'pending' and i.expires_at <= now() then i.expires_at end
             ) + app.retention_interval('zugangseinladung') as due_at
      from public.staff_account_invitations i
      where i.organization_id = v_org.id
    ),
    geloescht as (
      delete from public.staff_account_invitations i
      using faellig f
      where i.id = f.id
        and f.due_at is not null
        and f.due_at <= now()
      returning i.id, i.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'staff_account_invitations', g.id, 'zugangseinladung', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_zugang = row_count;

    -- -------------------------------------------------------------------
    -- Warteliste: zwoelf Monate nach dem Schliessen (ANN-133). Offene
    -- Eintraege fallen nur mit der Akte. Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.closed_at + app.retention_interval('warteliste') as due_at
      from public.waitlist_entries w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.closed_at is not null
        and not app.under_legal_hold(v_org.id, 'patient', w.patient_id)
    ),
    geloescht as (
      delete from public.waitlist_entries w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'waitlist_entries', g.id, 'warteliste', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_warte = row_count;

    -- -------------------------------------------------------------------
    -- Aufgaben: zwoelf Monate nach dem Erledigen (ANN-142). Offene
    -- Aufgaben bleiben; mit Personenbezug fallen sie mit der Akte. Ein
    -- Legal Hold an der Akte haelt auch die erledigte Aufgabe.
    -- -------------------------------------------------------------------
    with faellig as (
      select k.id,
             k.organization_id,
             k.done_at + app.retention_interval('aufgabe') as due_at
      from public.tasks k
      where k.organization_id = v_org.id
        and k.status = 'done'
        and k.done_at is not null
        and (k.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', k.patient_id))
    ),
    geloescht as (
      delete from public.tasks k
      using faellig f
      where k.id = f.id
        and f.due_at <= now()
      returning k.id, k.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'tasks', g.id, 'aufgabe', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_aufgaben = row_count;

    -- -------------------------------------------------------------------
    -- Anrufstand: vierzehn Tage nach dem Termin (ANN-144). Ein "nicht
    -- erreicht" soll kein Merkmal der Person werden (§20, IDEA-PRX-041).
    -- -------------------------------------------------------------------
    with faellig as (
      select c.id,
             c.organization_id,
             a.starts_at + app.retention_interval('anrufstand') as due_at
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where c.organization_id = v_org.id
        -- Ein Legal Hold an der Akte haelt auch den Anrufstand (ADR-008
        -- Punkt 7, Zweitreview).
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointment_call_states c
      using faellig f
      where c.id = f.id
        and f.due_at <= now()
      returning c.id, c.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointment_call_states', g.id, 'anrufstand', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_anrufe = row_count;

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte
                + v_aufgaben + v_anrufe;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenfoto', v_fotos,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'zugangseinladung', v_zugang,
          'warteliste', v_warte,
          'aufgabe', v_aufgaben,
          'anrufstand', v_anrufe,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 2. Das Journal nach einem Restore kennt die Kontaktdaten des Trainings
-- -----------------------------------------------------------------------------
create function app.deletion_key_column(p_table text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_table when 'training_contact_details' then 'training_relationship_id' else 'id' end
$$;

comment on function app.deletion_key_column(text) is
  'Die Schluesselspalte, unter der das Loeschjournal eine Zeile fuehrt: id, bei training_contact_details das Verhaeltnis (dort der Primaerschluessel).';

revoke all on function app.deletion_key_column(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reapply_deletion_journal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reihenfolge text[] := array[
    'invoice_payment_reminders',
    'invoice_cancellations',
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'patient_files',
    -- Vor Grundlage und Termin: ein Eintrag zeigt auf beide (on delete set
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird
    -- (PRX-001, Zweitreview 5).
    'waitlist_entries',
    -- PRX-012: eine Aufgabe zeigt auf Person und Mitarbeitende (cascade
    -- beziehungsweise set null) - geloescht wird sie vorher.
    'tasks',
    -- PRX-014: der Anrufstand haengt am Termin und faellt vor ihm.
    'appointment_call_states',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- TRN-EPIC-003 (Zweitreview): Kontaktdaten des Trainings aus der
    -- Teilloeschung. Ihr Schluessel ist das Verhaeltnis, nicht `id`.
    'training_contact_details',
    -- TRN-005: die Vereinbarung nach ihren Terminen (on delete set null) und
    -- vor ihrem Verhaeltnis (restrict) - dieselbe Reihenfolge wie im Lauf
    -- (app.delete_training_relationship). Fehlte seit CAL-026.
    'training_bases',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
  v_org       record;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where %I = any($1) returning %I as id) select array_agg(id) from g',
      v_tabelle,
      app.deletion_key_column(v_tabelle),
      app.deletion_key_column(v_tabelle)
    )
    into v_geloescht
    using v_ids;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  if v_gesamt > 0 then
    for v_org in
      select j.organization_id as id, count(*) as anzahl
      from public.deletion_journal j
      where j.reapplied_at = now()
      group by j.organization_id
    loop
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.reapplied', 'organization', v_org.id, 'success',
        jsonb_build_object('surface', 'restore', 'records', v_org.anzahl)
      );
    end loop;
  end if;

  return v_gesamt;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 3. Zeile und Rechnung am selben Verhaeltnis - auch beim Aendern
--
-- Bisher prueften die Trigger nur das Einfuegen. Heute aendert kein Weg die
-- Verknuepfung einer Zeile oder das Verhaeltnis eines Entwurfs; die
-- Zusammenfuehrung zweier Akten (PRX-017) zieht Leistungen vor Rechnungen
-- um, beide Pruefungen sehen dann den neuen Stand. Die Zusage "jeder
-- Schreibweg" gilt damit auch fuer einen kuenftigen.
-- -----------------------------------------------------------------------------
drop trigger a_invoice_items_area_from_service on public.invoice_items;

create trigger a_invoice_items_area_from_service
  before insert or update of invoice_id, billable_service_id on public.invoice_items
  for each row execute function app.invoice_item_area_from_service();

create function app.invoice_party_matches_items()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.invoice_items it
    join public.billable_services b on b.id = it.billable_service_id
    where it.invoice_id = new.id
      and (b.patient_id is distinct from new.patient_id
           or b.training_relationship_id is distinct from new.training_relationship_id)
  ) then
    raise exception 'billable service does not belong to the relationship of its invoice'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function app.invoice_party_matches_items() is
  'Weist das Umhaengen einer Rechnung an ein anderes Verhaeltnis ab, solange ihre Zeilen an Leistungen des bisherigen haengen (TRN-008, Zweitreview).';

create trigger invoices_party_matches_items
  before update of patient_id, training_relationship_id on public.invoices
  for each row execute function app.invoice_party_matches_items();

-- -----------------------------------------------------------------------------
-- 4. Die Organisation des Trainingsverhaeltnisses an Leistung und Rechnung
--
-- Dieselbe Bauart wie am Termin (appointments_training_relationship_fkey):
-- Die Schreibwege pruefen die Organisation selbst; der Schluessel haelt sie
-- auch fuer einen kuenftigen Weg.
-- -----------------------------------------------------------------------------
alter table public.billable_services
  add constraint billable_services_training_relationship_org_fkey
    foreign key (training_relationship_id, organization_id)
    references public.training_relationships (id, organization_id)
    on delete restrict;

alter table public.invoices
  add constraint invoices_training_relationship_org_fkey
    foreign key (training_relationship_id, organization_id)
    references public.training_relationships (id, organization_id)
    on delete restrict;

-- -----------------------------------------------------------------------------
-- 5. Ausstellen, Storno und Erinnerung nennen das Trainingsverhaeltnis
--
-- Aus der jeweils letzten Fassung, geaendert nur am Auditkontext: Bisher
-- stand dort an einer Trainingsrechnung `patient_id: null` und kein
-- Verhaeltnis. Nur Kennungen, keine Namen (ADR-010 Punkt 3).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid)
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
  v_nummer   text;
  v_prefix   text;
  v_frist    smallint;
  v_dokument jsonb;
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

  if v_invoice.status <> 'draft' then
    raise exception 'invoice is already issued' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  select b.payment_term_days into v_frist
  from public.practice_billing_profiles b
  where b.organization_id = v_org;

  -- Ohne Absender keine Rechnung. Der Hinweis nennt die Luecke, damit die
  -- Oberflaeche nicht raten muss, was fehlt (ADR-009 Punkt 10).
  if not found then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  -- Das Kuerzel des Kreises, in den diese Rechnung gehoert (ABR-010).
  v_prefix := app.invoice_number_prefix(v_org, v_invoice.service_area);

  v_dokument := app.build_invoice_document(p_invoice_id);

  -- Der Par. 14c-Riegel (ABR-007, ADR-009 Punkt 18). Er steht hier und nicht
  -- in der Oberflaeche, weil die Steuerschuld mit dem **Ausweis** entsteht -
  -- nicht mit der Zahlung und nicht mit der Absicht. Was einmal falsch
  -- draufsteht, kostet ein Storno (Punkt 9).
  perform app.assert_invoice_tax_lawful(v_dokument);

  v_nummer := app.next_invoice_number(
    v_org, extract(year from v_heute)::smallint, v_invoice.service_area, v_prefix);

  -- Der Snapshot traegt Nummer und Daten mit: Er ist das Dokument, nicht ein
  -- Teil davon (ADR-009 Punkt 11).
  v_dokument := v_dokument || jsonb_build_object(
    'invoice_number', v_nummer,
    'issued_on', v_heute,
    'due_on', v_heute + v_frist::integer
  );

  update public.invoices
     set status          = 'issued',
         invoice_number  = v_nummer,
         issued_on       = v_heute,
         issued_at       = now(),
         issued_by       = v_actor,
         due_on          = v_heute + v_frist::integer,
         total_cents     = (v_dokument -> 'totals' ->> 'total_cents')::integer,
         tax_total_cents = (v_dokument -> 'totals' ->> 'tax_total_cents')::integer,
         currency        = v_dokument ->> 'currency',
         snapshot        = v_dokument
   where id = p_invoice_id;

  -- Die Leistung ist ab jetzt abgerechnet; ihr Entfernen laeuft nur noch ueber
  -- Storno (ADR-009 Punkt 9).
  update public.billable_services b
     set status = 'invoiced'
   where b.id in (select it.billable_service_id
                  from public.invoice_items it
                  where it.invoice_id = p_invoice_id);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.issued', 'invoice', p_invoice_id, 'success',
    jsonb_strip_nulls(jsonb_build_object('surface', 'web', 'patient_id', v_invoice.patient_id,
                       'training_relationship_id', v_invoice.training_relationship_id,
                       'invoice_number', v_nummer,
                       'service_area', v_invoice.service_area,
                       'total_cents', (v_dokument -> 'totals' ->> 'total_cents')::integer))
  );

  return v_nummer;
end;
$function$;

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

  -- Zuerst das Geld, dann das Dokument: Eine stehende Zahlung an einer
  -- stornierten Rechnung waere ein Eingang ohne Forderung. Die Zahlung laesst
  -- sich mit Grund stornieren (ABR-004), danach geht das hier.
  if exists (
    select 1 from public.payments p
    where p.invoice_id = p_invoice_id and p.voided_at is null
  ) then
    raise exception 'void the payments of this invoice first' using errcode = '23514';
  end if;

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
                       'total_cents', v_invoice.total_cents))
  );

  return v_nummer;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_payment_reminder(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- Die Frist der Erinnerung, an genau einer Stelle (**ANN-080**). Vierzehn
  -- Tage sind die Frist, die auf dem Blatt steht - keine Rechtsfolge und kein
  -- Verzugsbeginn. Wer sie aendert, aendert sie hier.
  c_frist_tage constant integer := 14;
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_offen    integer;
  v_id       uuid;
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

  -- An einem Entwurf gibt es nichts zu erinnern: Er traegt keine Nummer und
  -- keine Forderung (ANN-075).
  if v_invoice.status <> 'issued' then
    raise exception 'a payment reminder belongs to an issued invoice' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'a cancelled invoice is not reminded' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  -- Vor der Faelligkeit gibt es nichts zu erinnern.
  if v_invoice.due_on >= v_heute then
    raise exception 'this invoice is not overdue yet' using errcode = '23514';
  end if;

  -- Der offene Betrag kommt aus derselben Funktion wie jede andere Anzeige
  -- (ANN-078) - und wird hier festgeschrieben, weil er auf ein Blatt geht.
  v_offen := v_invoice.total_cents - app.invoice_paid_cents(p_invoice_id);

  if v_offen <= 0 then
    raise exception 'this invoice has nothing outstanding' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_payment_reminders r
    where r.invoice_id = p_invoice_id and r.reminder_on = v_heute
  ) then
    raise exception 'a payment reminder for this invoice was already written today'
      using errcode = '23505';
  end if;

  insert into public.invoice_payment_reminders (
    organization_id, invoice_id, reminder_on, due_on, outstanding_cents, currency, created_by
  )
  values (v_org, p_invoice_id, v_heute, v_heute + c_frist_tage, v_offen,
          v_invoice.currency, v_actor)
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.reminder_created', 'invoice', p_invoice_id, 'success',
    jsonb_strip_nulls(jsonb_build_object('surface', 'web', 'patient_id', v_invoice.patient_id,
                       'training_relationship_id', v_invoice.training_relationship_id,
                       'invoice_number', v_invoice.invoice_number,
                       'outstanding_cents', v_offen))
  );

  return v_id;
end;
$function$;

