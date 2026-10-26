-- Die Teillöschung unter Belegfrist nimmt alles, was das Trainingsverhältnis ohne Beleg trägt:
-- Profil, Übernahmen, Einwilligungen, Assessments, Verlauf, Check-ins, Gewohnheiten und Übungspläne
-- (ADR-021 Punkt 4, ANN-183). Jede Zeile steht im Löschjournal und fällt nach einem Restore erneut.

create function app.retention_deletion_active()
returns boolean
language sql stable
set search_path to ''
as $$
  select coalesce(current_setting('app.retention_deletion', true), '') = 'on';
$$;

comment on function app.retention_deletion_active() is 'Laeuft gerade die Teilloeschung unter Belegfrist oder das Nachziehen der Uebungsplaene aus dem Loeschjournal? Nur dort gesetzt, transaktionslokal (ANN-183). Erlaubt das Loeschen zugewiesener und beendeter Trainingsplaene, deren Verhaeltnis stehen bleibt.';

create or replace function app.deletion_key_column(p_table text)
returns text
language sql immutable
set search_path to ''
as $$
  select case when p_table in ('training_contact_details', 'training_profiles')
              then 'training_relationship_id' else 'id' end
$$;

comment on function app.deletion_key_column(p_table text) is 'Die Schluesselspalte, unter der das Loeschjournal eine Zeile fuehrt: id, bei training_contact_details und training_profiles das Verhaeltnis (dort der Primaerschluessel).';

create or replace function public.exercise_plans_guard()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_neu jsonb;
  v_alt jsonb;
begin
  if tg_op = 'INSERT' then
    if new.service_area = 'therapy' and not exists (
      select 1 from public.patients p
      where p.id = new.patient_id and p.organization_id = new.organization_id
    ) then
      raise exception 'exercise plan requires a relationship of the same organization'
        using errcode = '23514';
    end if;
    if new.status <> 'draft' then
      raise exception 'exercise plan starts as a draft' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'draft' then
      return old;
    end if;
    -- Faellt das Verhaeltnis, faellt der Plan mit (on delete cascade): Dann
    -- ist der Elterndatensatz schon fort.
    if (old.patient_id is not null and not exists (
          select 1 from public.patients p where p.id = old.patient_id))
       or (old.training_relationship_id is not null and not exists (
          select 1 from public.training_relationships t where t.id = old.training_relationship_id))
       or (old.previous_plan_id is not null and not exists (
          select 1 from public.exercise_plans p where p.id = old.previous_plan_id)) then
      return old;
    end if;
    -- Die Teilloeschung unter Belegfrist und ihr Nachziehen nach einem Restore nehmen auch
    -- zugewiesene Trainingsplaene, waehrend das Verhaeltnis als Beleg stehen bleibt (ANN-183).
    if old.service_area = 'training' and app.retention_deletion_active() then
      return old;
    end if;
    raise exception 'only a draft exercise plan can be discarded' using errcode = '22023';
  end if;

  v_neu := to_jsonb(new);
  v_alt := to_jsonb(old);

  if app.patient_merge_active() and new.patient_id is distinct from old.patient_id then
    if not app.only_patient_id_changed(v_neu, v_alt) then
      raise exception 'exercise plan cannot be changed while merging' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.service_area is distinct from old.service_area
     or new.patient_id is distinct from old.patient_id
     or new.training_relationship_id is distinct from old.training_relationship_id
     or new.previous_plan_id is distinct from old.previous_plan_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'exercise plan cannot be moved' using errcode = '22023';
  end if;

  if old.status = 'draft' then
    if new.status not in ('draft', 'assigned') then
      raise exception 'a draft exercise plan is assigned or discarded' using errcode = '22023';
    end if;
    return new;
  end if;

  if old.status = 'assigned' then
    -- Erlaubt: Laufzeit verlaengern, beenden, abloesen. Der Inhalt bleibt.
    if (v_neu - array['runs_until', 'extended_at', 'extended_by', 'status', 'ended_at',
                      'ended_by', 'updated_at', 'updated_by'])
       is distinct from
       (v_alt - array['runs_until', 'extended_at', 'extended_by', 'status', 'ended_at',
                      'ended_by', 'updated_at', 'updated_by']) then
      raise exception 'assigned exercise plan cannot be changed' using errcode = '22023';
    end if;
    if new.status not in ('assigned', 'ended', 'superseded') then
      raise exception 'assigned exercise plan cannot be changed' using errcode = '22023';
    end if;
    if new.status <> 'assigned' and new.runs_until is distinct from old.runs_until then
      raise exception 'assigned exercise plan cannot be changed' using errcode = '22023';
    end if;
    return new;
  end if;

  raise exception 'ended exercise plan cannot be changed' using errcode = '22023';
end;
$$;

create or replace function app.reduce_training_relationship(
  p_relationship_id uuid, p_run_id uuid, p_due_at timestamp with time zone
)
returns integer
language plpgsql security definer
set search_path to ''
as $$
declare
  v_count   integer := 0;
  v_n       integer;
  v_tabelle text;
begin
  -- Die Protokolle zuerst - auch die am abgerechneten Termin. Der
  -- Termin bleibt `documented` als Tatsache stehen; was in der Einheit
  -- geschah, traegt die Belegfrist nicht (ANN-183).
  with geloescht as (
    delete from public.training_protocols p
     where p.training_relationship_id = p_relationship_id
    returning p.id, p.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_protocols', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Rueckfragen ueber die Plattform. Sie tragen keine Belegfrist
  -- und fallen nach den drei Jahren aus ADR-021 Punkt 4; die Eintraege mit
  -- ihnen (cascade).
  with geloescht as (
    delete from public.platform_messages m
     where m.training_relationship_id = p_relationship_id
    returning m.id, m.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'platform_messages', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

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

  -- Die Ernaehrungsberatung traegt keine Belegfrist; faellt das Verhaeltnis frueher als ihre
  -- eigene Frist, faellt sie mit ihm (ADR-027 Punkt 6), auch ein nie beendetes Profil.
  -- Einwilligung und Gewicht mit ihr (cascade).
  with geloescht as (
    delete from public.nutrition_profiles n
     where n.training_relationship_id = p_relationship_id
    returning n.id, n.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'nutrition_profiles', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Was das Verhaeltnis ohne Beleg traegt, faellt nach den drei Jahren; Werte, Ergebnisse,
  -- Positionen und Einheiten mit ihrer Zeile (cascade). Feste Liste, nie Benutzereingabe.
  perform pg_catalog.set_config('app.retention_deletion', 'on', true);
  foreach v_tabelle in array array[
    'training_profiles', 'training_takeovers', 'training_consent_records', 'training_assessments',
    'training_course_events', 'checkin_schedules', 'checkins', 'habits', 'exercise_plans'
  ]
  loop
    execute format(
      'with geloescht as (
         delete from public.%1$I t
          where t.training_relationship_id = $1
         returning t.%2$I as id, t.organization_id
       )
       insert into public.deletion_journal
         (organization_id, run_id, target_table, target_id, retention_class, due_at)
       select g.organization_id, $2, %1$L, g.id, %3$L, $3
       from geloescht g',
      v_tabelle, app.deletion_key_column(v_tabelle), 'trainingsverhaeltnis'
    )
    using p_relationship_id, p_run_id, p_due_at;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end loop;
  perform pg_catalog.set_config('app.retention_deletion', 'off', true);

  return v_count;
end;
$$;

create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql security definer
set search_path to ''
as $_$
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
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird.
    'waitlist_entries',
    -- Eine Aufgabe zeigt auf Person und Mitarbeitende (cascade
    -- beziehungsweise set null) - geloescht wird sie vorher.
    'tasks',
    -- Das Trainingsprotokoll haengt am Termin (restrict) und faellt
    -- vor ihm - dieselbe Reihenfolge wie im Lauf.
    'training_protocols',
    -- Der Anrufstand haengt am Termin und faellt vor ihm.
    'appointment_call_states',
    -- Ein Terminwunsch zeigt auf Termin (set null) und Verhaeltnis
    -- (cascade) - geloescht wird er vorher.
    'platform_appointment_requests',
    -- Ein Anhang haengt am Vorgang (cascade) und faellt vor ihm.
    'platform_message_attachments',
    -- Ein Vorgang zeigt auf Plan, Uebung (set null) und Akte
    -- (cascade); seine Eintraege fallen mit ihm.
    'platform_messages',
    -- Die Radflotte haengt an keiner Akte. Schluessel und Sperren vor den Pannen (eine Sperre
    -- zeigt auf ihre Panne, set null); einzeln geloeschte Fotos vor Check-Up und Panne, deren
    -- Stellen und uebrige Fotos mit ihnen fallen (cascade); das ausgemusterte Rad zuletzt.
    'fleet_key_handovers',
    'fleet_blocks',
    'fleet_photos',
    'fleet_checkups',
    'fleet_breakdowns',
    'fleet_bikes',
    -- Storno und Abwesenheiten in den Arbeitszeiten fallen mit ihrem
    -- Urlaub (cascade).
    'staff_leave_requests',
    'staff_leave_entitlements',
    -- Arbeitszeitaenderungen haengen an keiner anderen Zeile.
    'staff_working_time_requests',
    -- Ein Eintrag im Zeitkonto; seine Abweichung faellt mit ihm
    -- (cascade).
    'staff_time_account_entries',
    -- Einzeln verworfene Belege vor ihrem Antrag; eine Erstattung
    -- nimmt ihre übrigen Belege mit (cascade), deren Objekte über den
    -- Löschauftrag.
    'staff_reimbursement_receipts',
    'staff_reimbursements',
    -- Rückmeldungen von Beschäftigten hängen an keiner anderen Zeile.
    'staff_feedback',
    -- Ein Profilbild hängt an keiner anderen Zeile; entfernt,
    -- ersetzt oder mit dem Ausscheiden gefallen, bleibt es fort.
    'staff_profile_pictures',
    -- Einzeln verworfene, nie gesendete Anhänge (ANN-652) vor den
    -- Nachrichten; gesendete fallen mit ihrer Nachricht (cascade) oder ihrem
    -- Inhalt (Auslöser), ihre Objekte über den Löschauftrag.
    'team_message_attachments',
    -- Erst geleerte Inhalte (die Zeile bleibt als Anker), dann
    -- Nachrichten vor ihren Gesprächen; Antworten, Erwähnungen und Lesestand
    -- fallen mit (cascade).
    'team_message_contents',
    'team_messages',
    'team_channels',
    -- Das Ernährungsprofil vor seinem Verhältnis; Einwilligung und
    -- Gewicht fallen mit ihm (cascade).
    'nutrition_profiles',
    -- Aus der Teilloeschung unter Belegfrist: was das Trainingsverhaeltnis ohne Beleg traegt,
    -- vor ihm; Werte, Ergebnisse, Positionen und Einheiten fallen mit ihrer Zeile (cascade).
    'training_profiles',
    'training_takeovers',
    'training_consent_records',
    'training_assessments',
    'training_course_events',
    'checkin_schedules',
    'checkins',
    'habits',
    'exercise_plans',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- Kontaktdaten des Trainings aus der Teilloeschung. Ihr Schluessel
    -- ist das Verhaeltnis, nicht `id`.
    'training_contact_details',
    -- Die Vereinbarung nach ihren Terminen (on delete set null) und
    -- vor ihrem Verhaeltnis (restrict) - dieselbe Reihenfolge wie im Lauf
    -- (app.delete_training_relationship).
    'training_bases',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf.
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations',
    -- Der Zugang mit seinen Einladungen (on delete cascade) und das
    -- Konto beim Anmeldedienst. `auth_users` ist kein Tabellenname in
    -- public, sondern die eine Ausnahme unten.
    'platform_accesses',
    'auth_users'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
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

    -- Das Konto liegt beim Anmeldedienst (ADR-023 Punkt 5): Was der Restore zurueckbringt,
    -- verliert sofort jeden Zugang und bekommt einen Loeschauftrag; erneut angewandt gilt der
    -- Eintrag erst mit der Bestaetigung (confirm_platform_account_deletion).
    if v_tabelle = 'auth_users' then
      update public.platform_accesses a
         set status = 'revoked',
             revoked_at = coalesce(a.revoked_at, now()),
             revoked_by = null,
             revoked_reason = 'account_deleted',
             locked_at = null,
             locked_by = null
       where a.account_user_id = any (v_ids) and a.status <> 'revoked';

      perform app.order_platform_account_deletion(
        j.target_id, j.organization_id, null, j.due_at, 'reapply')
      from public.deletion_journal j
      join auth.users u on u.id = j.target_id
      where j.target_table = 'auth_users'
        and j.target_id = any (v_ids);
      v_geloescht := null;
    -- Nur der Inhalt fiel (Anker mit Antworten) - leeren, nicht
    -- löschen, sonst nähme cascade die Antworten mit. Wer entfernt hat, steht
    -- nach einem Restore nicht mehr fest; der Anker heißt dann „gelöscht“.
    elsif v_tabelle = 'team_message_contents' then
      delete from public.team_message_mentions where message_id = any (v_ids);
      with g as (
        update public.team_messages
           set body = null, edited_at = null, author_staff_member_id = null,
               removed_at = coalesce(removed_at, now()),
               removed_kind = coalesce(removed_kind, 'author')
         where id = any (v_ids) and body is not null
        returning id
      )
      select array_agg(id) into v_geloescht from g;
    elsif app.deletion_key_column(v_tabelle) <> 'id' then
    -- Der Schluessel ist das Verhaeltnis: Was nach der Loeschung neu angelegt wurde, etwa nach
    -- einem wieder geoeffneten Vertrag, traegt denselben Schluessel und bleibt.
    execute format(
      'with g as (delete from public.%1$I t using public.deletion_journal j
                   where j.target_table = %2$L and t.%3$I = j.target_id
                     and t.created_at <= j.deleted_at
                  returning t.%3$I as id)
       select array_agg(distinct id) from g',
      v_tabelle, v_tabelle, app.deletion_key_column(v_tabelle)
    )
    into v_geloescht;
    else
    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe; die Kennungen gehen als
    -- Parameter. Zugewiesene Trainingsplaene aus der Teilloeschung fallen auch, wenn ihr
    -- Verhaeltnis steht (ANN-183).
    if v_tabelle = 'exercise_plans' then
      perform pg_catalog.set_config('app.retention_deletion', 'on', true);
    end if;
    execute format(
      'with g as (delete from public.%I where %I = any($1) returning %I as id) select array_agg(id) from g',
      v_tabelle,
      app.deletion_key_column(v_tabelle),
      app.deletion_key_column(v_tabelle)
    )
    into v_geloescht
    using v_ids;
    perform pg_catalog.set_config('app.retention_deletion', 'off', true);
    end if;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  -- Anonyme Rückmeldungen schreibt der Lauf mit neuer Kennung neu; ein älteres Backup trägt
  -- andere Kennungen als das Journal. Was nach dem Restore über der Frist liegt, fällt hier
  -- nach der Regel selbst, nicht erst im nächsten Lauf.
  delete from public.staff_feedback f
  using public.organizations o
  where o.id = f.organization_id
    and app.retention_due_at(
          (f.month + interval '1 month' - interval '1 day')::date,
          app.retention_interval('rueckmeldung'),
          o.time_zone
        ) <= now();

  -- Fällige Ausgangsnachrichten mit laufenden Antworten verlieren
  -- ihren Inhalt nach der Regel, nicht über das Journal (ANN-610).
  perform app.strip_due_team_anchors(o.id, o.time_zone) from public.organizations o;

  -- Ein Bild, das ein Restore zurückbringt, obwohl die Person inzwischen ausgeschieden ist,
  -- fällt nach der Regel (ANN-667), mit Eintrag im Löschjournal wie jede Löschung eines Bildes.
  perform app.forget_profile_picture(p.organization_id, p.id)
  from public.staff_profile_pictures p
  join public.staff_members sm on sm.id = p.staff_member_id
  where sm.employment_status <> 'active';

  -- Die Wiederanwendung weist deletion_journal.reapplied_at nach.

  return v_gesamt;
end;
$_$;

comment on function public.exercise_plans_guard() is 'Bereich, Verhaeltnis und Herkunft eines Plans stehen fest; ein zugewiesener Plan aendert nur Laufzeit und Ende (ANN-300, ANN-302), ein beendeter nichts; beim Zusammenfuehren nur patient_id. Geloescht wird nur ein Entwurf - ausser mit dem Verhaeltnis und, fuer Trainingsplaene, in der Teilloeschung unter Belegfrist samt ihrem Nachziehen nach einem Restore (ANN-183).';

comment on function app.reduce_training_relationship(p_relationship_id uuid, p_run_id uuid, p_due_at timestamp with time zone) is 'Teilloeschung eines Trainingsverhaeltnisses nach drei Jahren, solange seine Belege noch in der steuerlichen Frist liegen (ANN-183, ADR-021 Punkt 4, ADR-008 Punkt 2): Protokolle, Rueckfragen, Kontakt, Termine ohne Leistung, unbenutzte Vereinbarungen, Ernaehrungsberatung, Profil, Uebernahmen, Einwilligungen, Assessments, Verlauf, Check-ins, Gewohnheiten und Uebungsplaene fallen, jeder Datensatz im Journal. Es bleiben die Belege und was sie tragen; der Rest faellt mit app.delete_training_relationship.';

comment on function public.reapply_deletion_journal() is 'Zieht nach einer Wiederherstellung die Loeschungen des Journals erneut nach (ADR-008 Punkt 8), in fester Reihenfolge ueber alle Tabellen, die das Journal fuehrt - Belege und Trainingsverhaeltnisse eingeschlossen, ebenso die Teilloeschung unter Belegfrist (ANN-183). Zeilen mit dem Verhaeltnis als Schluessel fallen nur, wenn sie vor der Loeschung entstanden sind. Nur fuer den Betrieb nach einem Restore, fuer keine API-Rolle.';

-- Das Nachziehen gehoert dem Betrieb nach einem Restore (ADR-012), nicht dem Dienstschluessel:
-- Er darf ins Journal schreiben und braeuchte sonst nur einen Eintrag fuer eine Loeschung.
revoke all on function public.reapply_deletion_journal() from service_role;

update public.retention_assignments
   set scope_note = scope_note || ' Auch in der Teilloeschung unter Belegfrist nach drei Jahren (ANN-183).'
 where class_key = 'trainingsverhaeltnis'
   and table_name in (
     'training_profiles', 'training_takeovers', 'training_consent_records', 'training_assessments',
     'training_course_events', 'checkin_schedules', 'checkins', 'habits', 'exercise_plans'
   );
