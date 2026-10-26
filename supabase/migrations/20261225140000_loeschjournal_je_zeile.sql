-- Jede gelöschte Zeile einer Tabelle mit eigenem Journal steht im Löschjournal, gleich auf welchem
-- Weg sie fiel (ADR-008 Punkt 8, ANN-752): ein Auslöser je Tabelle des Registers. Wer den Lauf kennt,
-- ergänzt mit seinem eigenen Eintrag Lauf, Klasse und Fälligkeit; je Zeile und Transaktion bleibt einer.

alter table public.deletion_journal
  add column transaction_id xid8 not null default pg_catalog.pg_current_xact_id();

-- Ersetzt den Index über Tabelle und Kennung: Der Auslöser sucht je Zeile und Transaktion.
drop index public.deletion_journal_target_idx;
create index deletion_journal_target_idx
  on public.deletion_journal (target_table, target_id, transaction_id);

comment on column public.deletion_journal.transaction_id is
  'Transaktion des Eintrags: je gelöschter Zeile und Transaktion steht genau einer (ANN-752).';

create function app.journal_deletion()
returns trigger
language plpgsql security definer
set search_path to ''
as $$
declare
  v_eintrag public.data_registry%rowtype;
  v_zeile   jsonb := to_jsonb(old);
  v_org     uuid := (to_jsonb(old) ->> 'organization_id')::uuid;
  v_id      uuid;
  v_lauf    uuid;
begin
  -- Abgeschaltet nur, wo die Löschung schon eingetragen ist oder keine ist (data-registry.test.ts).
  if coalesce(current_setting('app.journal_paused', true), '') = 'on' then
    return old;
  end if;
  -- Fällt die ganze Organisation, bleibt kein Journal, das auf sie zeigen könnte.
  if not exists (select 1 from public.organizations o where o.id = v_org) then
    return old;
  end if;

  select * into v_eintrag from public.data_registry r where r.table_name = tg_table_name;
  v_id := (v_zeile ->> v_eintrag.journal_key)::uuid;
  if exists (
    select 1 from public.deletion_journal j
     where j.target_table = tg_table_name and j.target_id = v_id
       and j.transaction_id = pg_catalog.pg_current_xact_id()
  ) then
    return old;
  end if;

  perform pg_catalog.set_config('app.journal_by_trigger', 'on', true);
  -- Tageweise gebündelt wie jedes Löschen im Teamchat, im Lauf des Tages: kein sekundengenauer
  -- Nachweis über Beschäftigte im Journal der Praxisleitung (§20).
  if v_eintrag.journal_daily then
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at, deleted_at)
    values (v_org,
            md5(case tg_table_name when 'staff_profile_pictures' then 'profile_picture:'
                                   else 'team_manual:' end
                || v_org::text || ':' || current_date::text)::uuid,
            tg_table_name, v_id, v_eintrag.journal_class,
            date_trunc('day', now()), date_trunc('day', now()));
  else
    -- Ein Lauf je Transaktion; bringt ein Lauf seine Kennung mit, übernimmt er diese Einträge.
    v_lauf := nullif(current_setting('app.deletion_run', true), '')::uuid;
    if v_lauf is null then
      v_lauf := extensions.gen_random_uuid();
      perform pg_catalog.set_config('app.deletion_run', v_lauf::text, true);
      perform pg_catalog.set_config('app.deletion_run_generated', 'on', true);
    end if;
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    values (v_org, v_lauf, tg_table_name, v_id,
            case when v_eintrag.journal_class_training is not null
                      and v_zeile ->> 'training_relationship_id' is not null
                 then v_eintrag.journal_class_training
                 else v_eintrag.journal_class end,
            now());
  end if;
  perform pg_catalog.set_config('app.journal_by_trigger', '', true);
  return old;
end;
$$;

comment on function app.journal_deletion() is
  'Auslöser an jeder Tabelle mit journal_mode row im Register: ein Eintrag je gelöschter Zeile und Transaktion (ADR-008 Punkt 8, ANN-752).';

create function app.deletion_journal_once()
returns trigger
language plpgsql security definer
set search_path to ''
as $$
declare
  v_lauf text := nullif(current_setting('app.deletion_run', true), '');
begin
  if coalesce(current_setting('app.journal_by_trigger', true), '') = 'on' then
    return new;
  end if;

  -- Ein Lauf mit eigener Kennung gibt sie den Einträgen des Auslösers derselben Transaktion: ein
  -- Lauf je Löschung (list_deletion_runs). Tageweise gebündelte Einträge sind kein Lauf.
  if new.target_table <> 'team_message_contents'
     and not exists (select 1 from public.data_registry r
                      where r.table_name = new.target_table and r.journal_daily) then
    if v_lauf is null then
      perform pg_catalog.set_config('app.deletion_run', new.run_id::text, true);
    elsif coalesce(current_setting('app.deletion_run_generated', true), '') = 'on' then
      update public.deletion_journal j
         set run_id = new.run_id
       where j.run_id = v_lauf::uuid and j.transaction_id = new.transaction_id;
      perform pg_catalog.set_config('app.deletion_run', new.run_id::text, true);
      perform pg_catalog.set_config('app.deletion_run_generated', '', true);
    end if;
  end if;

  -- Schrieb der Auslöser schon, ergänzt ein späterer Eintrag derselben Transaktion nur Lauf,
  -- Klasse und Zeitpunkte; so bleibt es bei einem Eintrag je Zeile.
  update public.deletion_journal j
     set run_id = new.run_id,
         retention_class = new.retention_class,
         due_at = new.due_at,
         deleted_at = new.deleted_at
   where j.target_table = new.target_table
     and j.target_id = new.target_id
     and j.transaction_id = new.transaction_id;
  if found then
    return null;
  end if;
  return new;
end;
$$;

comment on function app.deletion_journal_once() is
  'Vor jedem Eintrag ins Löschjournal: ergänzt den Eintrag des Auslösers derselben Zeile und Transaktion, statt einen zweiten zu schreiben, und vereint die Läufe einer Transaktion (ANN-752).';

create trigger deletion_journal_once
  before insert on public.deletion_journal
  for each row execute function app.deletion_journal_once();

revoke all on function app.journal_deletion() from public, anon, authenticated;
revoke all on function app.deletion_journal_once() from public, anon, authenticated;

do $$
declare
  v_tabelle text;
begin
  for v_tabelle in
    select r.table_name from public.data_registry r where r.journal_mode = 'row' order by 1
  loop
    execute format(
      'create trigger journal_deletion after delete on public.%I
         for each row execute function app.journal_deletion()',
      v_tabelle);
  end loop;
end;
$$;

create or replace function app.deletion_key_column(p_table text)
returns text
language sql stable
set search_path to ''
as $$
  select coalesce(
    (select r.journal_key from public.data_registry r where r.table_name = p_table), 'id')
$$;

create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql security definer
set search_path to ''
as $$
declare
  v_tabelle    text;
  v_schluessel text;
  v_ids        uuid[];
  v_geloescht  uuid[];
  v_unbekannt  text[];
  v_gesamt     integer := 0;
begin
  -- Was hier fällt, steht schon im Journal; der Auslöser schreibt nichts dazu.
  perform pg_catalog.set_config('app.journal_paused', 'on', true);

  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where j.target_table not in ('auth_users', 'team_message_contents')
    and not exists (
      select 1 from public.data_registry r
       where r.table_name = j.target_table and r.journal_mode = 'row');

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  -- Die Reihenfolge steht im Register: Kinder vor ihren Eltern (data-registry.test.ts).
  for v_tabelle, v_schluessel in
    select t.tabelle, t.schluessel
      from (
        select r.table_name as tabelle, r.journal_key as schluessel, r.journal_rank::integer as rang
          from public.data_registry r
         where r.journal_mode = 'row'
        union all
        -- Nur der Inhalt fiel, die Nachricht blieb als Anker: vor den Nachrichten selbst.
        select 'team_message_contents', 'id', r.journal_rank - 1
          from public.data_registry r
         where r.table_name = 'team_messages'
        union all
        select 'auth_users', 'id', 2147483647
      ) t
     order by t.rang, t.tabelle
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Das Konto liegt beim Anmeldedienst (ADR-023 Punkt 5): Was der Restore zurückbringt, verliert
    -- sofort jeden Zugang und bekommt einen Löschauftrag; erneut angewandt gilt der Eintrag erst
    -- mit der Bestätigung (confirm_platform_account_deletion).
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
    -- Nur der Inhalt fiel (Anker mit Antworten) - leeren, nicht löschen, sonst nähme cascade die
    -- Antworten mit. Wer entfernt hat, steht nach einem Restore nicht mehr fest.
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
    elsif v_schluessel <> 'id' then
      -- Der Schlüssel ist das Verhältnis: Was nach der Löschung neu angelegt wurde, etwa nach
      -- einem wieder geöffneten Vertrag, trägt denselben Schlüssel und bleibt.
      execute format(
        'with g as (delete from public.%1$I t using public.deletion_journal j
                     where j.target_table = %2$L and t.%3$I = j.target_id
                       and t.created_at <= j.deleted_at
                    returning t.%3$I as id)
         select array_agg(distinct id) from g',
        v_tabelle, v_tabelle, v_schluessel
      )
      into v_geloescht;
    else
      -- Zugewiesene Trainingspläne aus der Teillöschung fallen auch, wenn ihr Verhältnis steht
      -- (ANN-183).
      if v_tabelle = 'exercise_plans' then
        perform pg_catalog.set_config('app.retention_deletion', 'on', true);
      end if;
      -- Die zurückgebrachte Menge an der Grundlage fällt mit ihrer Leistung, wie beim Entfernen
      -- (delete_billable_services); sonst fehlte der Verordnung ein Termin.
      if v_tabelle = 'billable_services' then
        update public.treatment_base_items p
           set used_quantity = greatest(p.used_quantity - b.menge, 0)
          from (select s.treatment_base_item_id, sum(s.quantity)::smallint as menge
                  from public.billable_services s
                 where s.id = any (v_ids) and s.treatment_base_item_id is not null
                 group by s.treatment_base_item_id) b
         where p.id = b.treatment_base_item_id;
      end if;
      execute format(
        'with g as (delete from public.%I where id = any($1) returning id) select array_agg(id) from g',
        v_tabelle
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
  -- andere Kennungen als das Journal. Was nach dem Restore über der Frist liegt, fällt hier.
  delete from public.staff_feedback f
  using public.organizations o
  where o.id = f.organization_id
    and app.retention_due_at(
          (f.month + interval '1 month' - interval '1 day')::date,
          app.retention_interval('rueckmeldung'),
          o.time_zone
        ) <= now();

  -- Fällige Ausgangsnachrichten mit laufenden Antworten verlieren ihren Inhalt nach der Regel,
  -- nicht über das Journal (ANN-610).
  perform app.strip_due_team_anchors(o.id, o.time_zone) from public.organizations o;

  -- Ein Bild, das ein Restore zurückbringt, obwohl die Person inzwischen ausgeschieden ist, fällt
  -- nach der Regel (ANN-667), mit Eintrag im Löschjournal wie jede Löschung eines Bildes.
  perform pg_catalog.set_config('app.journal_paused', 'off', true);
  perform app.forget_profile_picture(p.organization_id, p.id)
  from public.staff_profile_pictures p
  join public.staff_members sm on sm.id = p.staff_member_id
  where sm.employment_status <> 'active';

  return v_gesamt;
end;
$$;

-- Das Neuschreiben anonymer Rückmeldungen ist keine Löschung (ANN-608): Im Journal nähme das
-- Nachziehen nach einem Restore die Rückmeldungen des Monats ganz, denn die neuen Kennungen
-- kennt keine ältere Sicherung.
create or replace function app.delete_due_staff_feedback(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql security definer
set search_path to ''
as $$
declare
  v_anzahl integer := 0;
  v_pause  text := coalesce(current_setting('app.journal_paused', true), '');
begin
  -- Rückmeldungen: zwölf Monate ab Ende des Monats der Abgabe, endgültig.
  with faellig as (
    select f.id, f.organization_id,
           app.retention_due_at(
             (f.month + interval '1 month' - interval '1 day')::date,
             app.retention_interval('rueckmeldung'),
             p_time_zone
           ) as due_at
    from public.staff_feedback f
    where f.organization_id = p_org
  ),
  geloescht as (
    delete from public.staff_feedback f
    using faellig x
    where f.id = x.id and x.due_at <= now()
    returning f.id, f.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_feedback', g.id, 'rueckmeldung', x.due_at
  from geloescht g join faellig x on x.id = g.id;
  get diagnostics v_anzahl = row_count;

  -- Anonyme Rückmeldungen abgeschlossener Monate neu schreiben: zufällige Reihenfolge, neue
  -- Kennung, eine Transaktion. Danach tragen `xmin` und `ctid` keine Spur ihres Zeitpunkts mehr,
  -- im laufenden Monat nur an den Rechten der Anwendung vorbei (ANN-608). Zählt nicht als Löschung.
  perform pg_catalog.set_config('app.journal_paused', 'on', true);
  with alt as (
    delete from public.staff_feedback f
    where f.organization_id = p_org and f.staff_member_id is null
      and f.month < app.staff_feedback_month(p_org)
    returning f.organization_id, f.kind, f.month, f.mood, f.tours, f.team,
              f.easier_text, f.more_text, f.message_text
  )
  insert into public.staff_feedback
    (organization_id, kind, month, mood, tours, team, easier_text, more_text, message_text)
  select a.organization_id, a.kind, a.month, a.mood, a.tours, a.team,
         a.easier_text, a.more_text, a.message_text
  from alt a
  order by random();
  perform pg_catalog.set_config('app.journal_paused', v_pause, true);

  -- Blöcke, die ganz vor der Frist liegen, fallen mit (kein Personenbezug).
  delete from public.staff_feedback_blocks b
  where b.organization_id = p_org
    and app.retention_due_at(
          (b.to_month + interval '1 month' - interval '1 day')::date,
          app.retention_interval('rueckmeldung'),
          p_time_zone
        ) <= now();

  return v_anzahl;
end;
$$;
