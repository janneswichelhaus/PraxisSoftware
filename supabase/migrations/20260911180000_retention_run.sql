-- =============================================================================
-- Loeschlauf und Loeschjournal (LOE-002a)
--
-- ADR-008 Punkt 3: Nach Ablauf des Zwecks und aller Aufbewahrungsgruende MUSS
-- eine echte Loeschung erfolgen. Punkt 10: Kein dauerhaftes Soft-Delete
-- ersetzt sie. Punkt 8: Nach einer Wiederherstellung MUESSEN seit
-- Backup-Erstellung wirksam gewordene Loeschungen erneut angewendet werden -
-- aus einer Liste, die den Restore ueberlebt.
--
-- Diese Migration liefert drei Dinge:
--
--   deletion_journal            der Nachweis. Je geloeschtem Datensatz eine
--                               Zeile mit Tabelle, Kennung, Datenklasse,
--                               Faelligkeit und Zeitpunkt - kein Name, kein
--                               Inhalt (ANN-031).
--   apply_retention()           der zeitgesteuerte Lauf. Liest die Fristen
--                               ausschliesslich aus dem Retention Schedule
--                               (LOE-001a), haelt sich an Legal Holds
--                               (LOE-001c) und protokolliert je Organisation
--                               ein Auditereignis mit Zahlen.
--   reapply_deletion_journal()  der zweite Schritt jeder Wiederherstellung.
--                               Idempotent: ein zweiter Lauf loescht nichts.
--
-- WIE DIE FRAGE "WIE WEIST MAN EINE LOESCHUNG NACH, WENN DER DATENSATZ WEG
-- IST?" BEANTWORTET WIRD (offene Folgefrage in ADR-008): durch das Journal.
-- Es haelt fest, DASS und WANN geloescht wurde, ohne selbst zum
-- Personendatenbestand zu werden - nach der Loeschung ist die Kennung ein
-- Schluessel ohne Schloss.
--
-- KASKADEN STEHEN NICHT IM JOURNAL. Wer ueber einen Fremdschluessel mit
-- 'on delete cascade' faellt - Versionen einer Dokumentation, Positionen einer
-- Verordnung, Kontakt- und Versorgungsangaben -, bekommt keine eigene Zeile.
-- Das ist Absicht und keine Luecke: Die Wiederanwendung loescht denselben
-- Elterndatensatz erneut, und die Kaskade folgt ihr wie beim ersten Mal.
--
-- WAS DIESER LAUF NICHT IST. Er ist keine Einzelloeschung auf Verlangen
-- (Art. 17 DSGVO) - das Verfahren fuer Betroffenenrechte ist ein eigener
-- Punkt (ADR-007, Roadmap G9), und ADR-008 haelt fest, dass ein
-- Loeschverlangen die Patientenakte in der Regel gar nicht erfasst.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- deletion_journal
--
-- run_id buendelt, was ein Lauf getan hat. reapplied_at haelt fest, dass eine
-- Zeile nach einem Restore ein zweites Mal wirksam werden musste - der
-- Nachweis fuer ADR-008 Punkt 8 und fuer den Restore-Test aus ADR-012.
-- -----------------------------------------------------------------------------
create table public.deletion_journal (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  run_id          uuid not null,
  target_table    text not null check (target_table ~ '^[a-z_]+$'),
  target_id       uuid not null,
  retention_class text not null references public.retention_classes (key) on delete restrict,
  due_at          timestamptz not null,
  deleted_at      timestamptz not null default now(),
  reapplied_at    timestamptz
);

comment on table public.deletion_journal is
  'Nachweis wirksam gewordener Loeschungen (ADR-008 Punkt 8, LOE-002a). Traegt Tabelle, Kennung, Datenklasse und Zeitpunkt - keinen Namen, keinen Inhalt. Datenklasse: Loeschjournal, ohne eigene Frist (ANN-031). Muss den Restore ueberleben: das Verfahren dazu steht in ANN-031 und gehoert zu OPS-003.';
comment on column public.deletion_journal.due_at is
  'Zeitpunkt, zu dem die Frist abgelaufen war. Macht nachpruefbar, dass nicht zu frueh geloescht wurde.';
comment on column public.deletion_journal.reapplied_at is
  'Wann diese Loeschung zuletzt nach einer Wiederherstellung erneut angewendet werden musste (ADR-008 Punkt 8). Leer bedeutet: bisher nicht noetig.';

create index deletion_journal_target_idx on public.deletion_journal (target_table, target_id);
create index deletion_journal_run_idx on public.deletion_journal (run_id);
create index deletion_journal_deleted_at_idx on public.deletion_journal (organization_id, deleted_at desc);

-- Deny-by-default und bewusst ohne Policy. Das Journal ist ein Nachweis, kein
-- Arbeitsvorrat; gelesen wird ueber list_deletion_runs, geschrieben
-- ausschliesslich vom Lauf.
alter table public.deletion_journal enable row level security;
revoke all on public.deletion_journal from anon, authenticated;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('deletion_journal', 'loeschjournal', 'keine',
   'Der Nachweis selbst. Ohne eigene Frist, solange der Backup-Lebenszyklus offen ist (ANN-031, ADR-012).', 260);

-- -----------------------------------------------------------------------------
-- Ereigniskatalog erweitern (ADR-010)
--
-- Zwei Ereignisse, beide mit Systemakteur und ohne Personenbezug: ein Lauf,
-- der geloescht hat, und eine Wiederanwendung nach einem Restore. Der
-- Kontext traegt Zahlen, keine Kennungen der geloeschten Datensaetze - die
-- stehen im Journal.
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; ein Datenbanktest prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'patient.care_concluded',
    'patient.care_reopened',
    'legal_hold.placed',
    'legal_hold.released',
    'retention.applied',
    'retention.reapplied',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.completed',
    'appointment.reopened',
    'organization.appointment_grid_changed',
    'organization.documentation_deadline_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'staff_member.created',
    'staff_member.updated',
    'staff_member.status_changed',
    'staff_account.invited',
    'staff_account.invitation_revoked',
    'staff_account.invitation_accepted',
    'staff_account.roles_changed',
    'staff_account.locked',
    'staff_account.unlocked',
    'staff_account.password_reset_requested',
    'account.password_changed',
    'account.sessions_ended',
    'account.mfa_enrolled',
    'account.mfa_removed',
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.auto_finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed',
    'prescription.viewed',
    'prescription.created',
    'prescription.updated',
    'prescription.deleted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted'
  ));

-- -----------------------------------------------------------------------------
-- app.retention_due_at
--
-- Ab wann darf geloescht werden? Mitternacht der Praxiszeitzone NACH dem Tag,
-- an dem die Frist endet. Der zusaetzliche Tag ist die vorsichtige Seite:
-- "zehn Jahre nach Abschluss" ist am Jahrestag selbst noch nicht vollstaendig
-- verstrichen, und im Zweifel wird aufbewahrt (ADR-008 Punkt 2).
--
-- stable und nicht immutable: die Zeitzonenrechnung haengt an den
-- Zeitzonendaten des Servers - dieselbe Ueberlegung wie bei
-- app.documentation_deadline (DOK-004).
-- -----------------------------------------------------------------------------
create function app.retention_due_at(
  p_from      date,
  p_interval  interval,
  p_time_zone text
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (((p_from + p_interval)::date + 1)::timestamp) at time zone p_time_zone
$$;

comment on function app.retention_due_at(date, interval, text) is
  'Faelligkeit einer Aufbewahrungsfrist: Mitternacht der Praxiszeitzone nach dem letzten Tag der Frist (ADR-008, LOE-002a).';

-- -----------------------------------------------------------------------------
-- app.delete_patient_record
--
-- Loescht eine Akte vollstaendig und in Fremdschluesselreihenfolge: erst die
-- Dokumentation, dann die Verordnungen, dann die Termine, dann die Akte
-- selbst - und zuletzt die Person, falls keine andere Rolle mehr auf sie
-- zeigt (ADR-008 Punkt 9: Account und Fachdatensatz sind getrennt; ein
-- Patientenkonto haelt die Person, nicht die Akte).
--
-- Kaskaden erledigen den Rest: Versionen, Verordnungspositionen sowie Kontakt-
-- und Versorgungsangaben haengen mit 'on delete cascade' an ihrem Elternteil.
-- Aufgehobene Loeschsperren haben keinen Fremdschluessel und werden deshalb
-- ausdruecklich mitgeloescht; eine laufende Sperre kommt hier nie an - der
-- Lauf prueft sie vorher.
--
-- Gibt die Zahl der eigenstaendig geloeschten Zeilen zurueck.
-- -----------------------------------------------------------------------------
create function app.delete_patient_record(
  p_patient_id uuid,
  p_run_id     uuid,
  p_due_at     timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_person uuid;
  v_count  integer := 0;
  v_n      integer;
begin
  select p.organization_id, p.person_id
    into v_org, v_person
  from public.patients p
  where p.id = p_patient_id;

  if not found then
    return 0;
  end if;

  with geloescht as (
    delete from public.treatment_notes t
     where t.appointment_id in (
       select a.id from public.appointments a where a.patient_id = p_patient_id
     )
    returning t.id, t.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'treatment_notes', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.prescriptions pr
     where pr.patient_id = p_patient_id
    returning pr.id, pr.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'prescriptions', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.appointments a
     where a.patient_id = p_patient_id
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'appointments', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.legal_holds h
     where h.subject_type = 'patient'
       and h.subject_id = p_patient_id
    returning h.id, h.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'legal_holds', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.patients p
     where p.id = p_patient_id
    returning p.id, p.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'patients', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.persons pe
     where pe.id = v_person
       and not exists (select 1 from public.patients x      where x.person_id = pe.id)
       and not exists (select 1 from public.staff_members x where x.person_id = pe.id)
       and not exists (select 1 from public.user_profiles x where x.person_id = pe.id)
    returning pe.id, pe.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'persons', g.id, 'personenstammdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

comment on function app.delete_patient_record(uuid, uuid, timestamptz) is
  'Loescht eine Patientenakte vollstaendig in Fremdschluesselreihenfolge und schreibt je eigenstaendig geloeschter Zeile eine Journalzeile (ADR-008, LOE-002a). Prueft KEINEN Legal Hold - das tut der Aufrufer.';

-- Ausdrueckliches Entziehen, und zwar wichtiger als es aussieht: PostgreSQL
-- gibt EXECUTE auf neue Funktionen an PUBLIC, und `authenticated` hat USAGE
-- auf dem Schema app. Ohne diese Zeile koennte jedes angemeldete Konto eine
-- beliebige Akte loeschen - die Funktion ist SECURITY DEFINER und prueft, ihrem
-- Zweck entsprechend, weder Rolle noch Legal Hold. Sie gehoert allein dem
-- Loeschlauf (ADR-004: die Datenbank ist die Grenze, nicht die Oberflaeche).
revoke all on function app.delete_patient_record(uuid, uuid, timestamptz)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- apply_retention
--
-- Der zeitgesteuerte Vorgang. Kein auth.uid(), keine Rollenpruefung: die
-- Funktion ist fuer keine Anwendungsrolle ausfuehrbar und wird ausschliesslich
-- vom Scheduler als Datenbankeigentuemer aufgerufen (ANN-007, wie DOK-004).
--
-- Vier Regeln, je eine Datenklasse mit deletion_mode = 'automatisch' im
-- Retention Schedule. Jede Frist kommt aus app.retention_interval(); keine
-- Zahl steht hier im Code (ANN-001).
--
-- Ein Lauf, der nichts getan hat, schreibt keinen Auditeintrag: ein taeglicher
-- Eintrag "null geloescht" waere Rauschen in einem Log, das Zugriffe auf
-- Patientenakten nachweisen soll (ADR-010).
-- -----------------------------------------------------------------------------
create function public.apply_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_termine   integer;
  v_audit     integer;
  v_zugang    integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Versorgung
    --
    -- Ohne Abschluss laeuft keine Frist - eine laufende Behandlung wird nie
    -- geloescht (LOE-001b). SKIP LOCKED: eine Akte, an der gerade jemand
    -- arbeitet, wird uebersprungen und beim naechsten Lauf erneut geprueft.
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
      -- Gesetzliche und rechtliche Aufbewahrungsgruende haben Vorrang vor der
      -- regulaeren Loeschung (ADR-008 Punkt 2 und 7).
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine ohne Behandlungsnachweis: drei Jahre ab Ende des
    -- Kalenderjahres der Absage.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Mit der
    -- Abrechnung kommt die zweite Bedingung "ohne Rechnung" dazu (ABR).
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc('year', a.cancelled_at at time zone v_org.time_zone)
                  + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.status = 'cancelled'
        and a.cancelled_at is not null
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
    -- Auditlog: drei Jahre ab dem Ereignis
    --
    -- Nach eigener Frist, nicht mit der Akte (ANN-029). Eintraege zu einer
    -- Akte unter Loeschsperre bleiben stehen: die Sperre gilt fuer den
    -- Vorgang, nicht nur fuer die Akte.
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
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs
    --
    -- Abgeschlossen heisst angenommen, zurueckgenommen oder abgelaufen
    -- (ANN-026). Eine offene, noch gueltige Einladung bleibt.
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

    v_gesamt := v_gesamt + v_akten + v_termine + v_audit + v_zugang;

    if v_akten + v_termine + v_audit + v_zugang > 0 or v_gehalten > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          -- Nur Zahlen. Welche Datensaetze es traf, steht im Journal
          -- (ADR-010 Punkt 3).
          'patientenakte', v_akten,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'zugangseinladung', v_zugang,
          'legal_hold_gehalten', v_gehalten
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$$;

comment on function public.apply_retention() is
  'Loescht alle faelligen Datensaetze nach dem Retention Schedule, schreibt je Datensatz eine Journalzeile und je Organisation ein Auditereignis retention.applied mit Systemakteur (ADR-008, LOE-002a, ANN-007). Nur fuer den Scheduler ausfuehrbar.';

revoke all on function public.apply_retention() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- reapply_deletion_journal
--
-- Der zweite Schritt jeder Wiederherstellung (ADR-008 Punkt 8, ADR-012).
-- Loescht erneut, was laut Journal bereits geloescht war und nach dem Restore
-- wieder da ist. Idempotent: ist nichts zurueckgekehrt, passiert nichts.
--
-- Die Reihenfolge ist fest und folgt den Fremdschluesseln - Kinder vor Eltern.
-- Eine Tabelle, die im Journal steht, aber nicht in dieser Liste, ist ein
-- Fehler und keine Zeile zum Ueberspringen: sonst bliebe nach einem Restore
-- still etwas zurueck. Ein Datenbanktest prueft die Liste gegen das, was der
-- Lauf ueberhaupt journalisieren kann.
--
-- WICHTIG, UND VON KEINER FUNKTION LOESBAR: Das Journal liegt in derselben
-- Datenbank. Ein Restore setzt es auf den Stand des Backups zurueck. Das
-- Restore-Verfahren MUSS es deshalb vorher sichern und danach einspielen,
-- bevor diese Funktion laeuft (ANN-031, OPS-003).
-- -----------------------------------------------------------------------------
create function public.reapply_deletion_journal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reihenfolge text[] := array[
    'treatment_note_versions',
    'treatment_notes',
    'prescription_items',
    'prescriptions',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
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
      'with g as (delete from public.%I where id = any($1) returning id) select array_agg(id) from g',
      v_tabelle
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
$$;

comment on function public.reapply_deletion_journal() is
  'Wendet alle Loeschungen des Journals erneut an - der zweite Schritt jeder Wiederherstellung (ADR-008 Punkt 8, ADR-012, LOE-002a). Idempotent. Nur fuer den Betrieb ausfuehrbar, nicht fuer Anwendungsrollen.';

revoke all on function public.reapply_deletion_journal() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- list_deletion_runs
--
-- Lesepfad fuer die Aufbewahrungsuebersicht (LOE-002b): was hat welcher Lauf
-- geloescht. Gruppiert - eine Zeile je Lauf, Datenklasse und Tabelle. Die
-- einzelnen Kennungen bleiben im Journal; sie sagen niemandem etwas, der die
-- geloeschten Daten nicht mehr hat.
--
-- Kein eigener Auditeintrag: hier stehen keine Personendaten, sondern Zahlen
-- ueber bereits geloeschte Datensaetze.
-- -----------------------------------------------------------------------------
create function public.list_deletion_runs(p_limit integer default 50)
returns table (
  run_id          uuid,
  deleted_at      timestamptz,
  retention_class text,
  target_table    text,
  record_count    bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_limit integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Derselbe Schnitt wie beim Auditlog: das Loeschjournal ist ein Nachweis der
  -- Praxisleitung (ADR-010, PROJECT_PRINCIPLES.md 4.1).
  if not app.has_any_role('owner') then
    raise exception 'deletion journal access denied' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'deletion journal access denied' using errcode = '42501';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 200);

  return query
    select j.run_id,
           max(j.deleted_at) as deleted_at,
           j.retention_class,
           j.target_table,
           count(*) as record_count
    from public.deletion_journal j
    where j.organization_id = v_org
    group by j.run_id, j.retention_class, j.target_table
    order by max(j.deleted_at) desc, j.retention_class, j.target_table
    limit v_limit;
end;
$$;

comment on function public.list_deletion_runs(integer) is
  'Zusammenfassung der Loeschlaeufe fuer die Aufbewahrungsuebersicht: je Lauf, Datenklasse und Tabelle eine Zahl (LOE-002a). Nur owner, nur eigene Organisation.';

revoke all on function public.list_deletion_runs(integer) from public, anon;
grant execute on function public.list_deletion_runs(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Scheduler (ANN-007)
--
-- Einmal taeglich um 03:10 UTC. Fristen enden um Mitternacht der
-- Praxiszeitzone; ein taeglicher Lauf in der Nacht ist fuer eine Frist von
-- Jahren genau genug und stoert den Betrieb nicht.
--
-- Die Registrierung ist bedingt wie bei DOK-004: die Wegwerf-Datenbank der
-- Tests hat kein pg_cron, dort wird die Funktion direkt aufgerufen. Fehlt die
-- Erweiterung, bleibt die Migration gueltig und meldet den fehlenden
-- Scheduler als Hinweis - geloescht wird dann nicht, und docs/DEVELOPMENT.md
-- fuehrt das als Blocker.
--
-- reapply_deletion_journal() bekommt bewusst KEINEN Zeitplan: sie gehoert in
-- das Restore-Verfahren und wird dort von Hand ausgeloest (ADR-012).
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute format(
      'select cron.schedule(%L, %L, %L)',
      'apply-retention',
      '10 3 * * *',
      'select public.apply_retention()'
    );
  else
    raise notice 'pg_cron ist nicht verfuegbar - der Loeschlauf (LOE-002a) ist nicht registriert.';
  end if;
end
$$;
