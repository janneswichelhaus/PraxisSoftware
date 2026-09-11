-- =============================================================================
-- Textbausteine fuer die Behandlungsdokumentation (UX-008, IDEA-PRX-011)
--
-- Am Telefon getippte Freitexte sind der groesste Zeitfresser der
-- Dokumentation. Bausteine sind die deterministische Antwort darauf: ein
-- vorbereiteter Satz, der per Tap in den Freitext wandert. Kein Sprachmodell,
-- keine Vorlage mit Platzhaltern, keine Uebernahme von Werten aus der Akte
-- (E-9 vom 2026-09-06; ADR-005 und ADR-006 bleiben unberuehrt, weil hier
-- nichts erzeugt und nichts bewertet wird).
--
-- Zwei Sichtbarkeiten in einer Tabelle:
--
--   staff_member_id gesetzt  persoenlicher Baustein. Nur diese Person sieht
--                            und aendert ihn.
--   staff_member_id null     Baustein der Praxis. Alle dokumentierenden
--                            Rollen sehen ihn; anlegen und aendern darf ihn
--                            nur owner.
--
-- **Kein Patientenbezug.** Die Tabelle hat bewusst keine patient_id und keine
-- appointment_id: ein Baustein ist eine Formulierung, kein Befund. Was jemand
-- hineinschreibt, ist trotzdem Freitext einer therapeutischen Person und darf
-- niemals in Logs erscheinen (ADR-011).
--
-- ANN-020 (docs/decisions/ASSUMPTIONS.md): Datenklasse und Frist der
-- Textbausteine. Diese Tabelle ist die eine Stelle, an der die Annahme greift.
-- =============================================================================

create table public.treatment_text_snippets (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,

  -- Persoenlich, wenn gesetzt; praxisweit, wenn null. cascade: Wer die Praxis
  -- verlaesst, nimmt seine persoenlichen Formulierungen mit - sie sind an ihn
  -- gebunden und fuer niemanden sonst sichtbar gewesen.
  staff_member_id uuid references public.staff_members (id) on delete cascade,

  title           text not null
                    check (length(btrim(title)) between 1 and 80),
  -- Wie bei der Dokumentation mit ausdruecklicher Zeichenmenge: ein Baustein
  -- aus lauter Zeilenumbruechen waere sonst "nicht leer".
  body            text not null
                    check (length(btrim(body, E' \t\r\n')) between 1 and 2000),

  created_at      timestamptz not null default now(),
  created_by      uuid not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null
);

comment on table public.treatment_text_snippets is
  'Textbausteine fuer die Behandlungsdokumentation (UX-008). Persoenlich (staff_member_id gesetzt) oder praxisweit (null). Datenklasse: Betriebsdaten der Praxis OHNE Patientenbezug - keine Gesundheitsdaten (ANN-020). Frist: bis zur Loeschung durch die Praxis; persoenliche Bausteine enden mit dem Mitarbeiterdatensatz. Freitext, der nie in Logs erscheinen darf (ADR-011).';
comment on column public.treatment_text_snippets.staff_member_id is
  'Persoenlicher Baustein dieser Person; null bedeutet praxisweit. KEINE Zugriffsbeschraenkung auf Akten - nur die Sichtbarkeit des Bausteins.';
comment on column public.treatment_text_snippets.body is
  'Der einzufuegende Text. Enthaelt bewusst keine Platzhalter und keine Werte aus der Akte (E-9, erste Stufe).';

create index treatment_text_snippets_organization_idx
  on public.treatment_text_snippets (organization_id);
create index treatment_text_snippets_staff_idx
  on public.treatment_text_snippets (staff_member_id);

-- Ein Titel je Geltungsbereich. Zwei Bausteine "Erstbefund" in derselben
-- Liste waeren beim Einfuegen nicht auseinanderzuhalten.
create unique index treatment_text_snippets_titel_persoenlich
  on public.treatment_text_snippets (organization_id, staff_member_id, lower(title))
  where staff_member_id is not null;
create unique index treatment_text_snippets_titel_praxis
  on public.treatment_text_snippets (organization_id, lower(title))
  where staff_member_id is null;

revoke all on public.treatment_text_snippets from anon, authenticated;
grant select on public.treatment_text_snippets to authenticated;

alter table public.treatment_text_snippets enable row level security;

-- -----------------------------------------------------------------------------
-- Wer Bausteine sehen und pflegen darf
-- -----------------------------------------------------------------------------

/**
 * Bausteine sind ein Schreibwerkzeug. Wer nicht dokumentiert, braucht sie
 * nicht - deshalb derselbe Schnitt wie app.can_write_treatment_note()
 * (therapist, team_lead) und ausdruecklich nicht die weitere Lesemenge.
 */
create or replace function app.can_use_text_snippets()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_write_treatment_note()
$$;

grant execute on function app.can_use_text_snippets() to authenticated;

/**
 * Praxisweite Bausteine anlegen und aendern: nur owner.
 *
 * Sie erscheinen bei allen dokumentierenden Personen; wer sie aendert, aendert
 * die Formulierungen der ganzen Praxis. Dieselbe Ueberlegung wie bei
 * app.can_manage_staff(): 4.5 nennt fuer die Teamleitung nur MOEGLICHE
 * Zusatzrechte, und solange dazu nichts entschieden ist, gilt 13.
 */
create or replace function app.can_manage_shared_text_snippets()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

grant execute on function app.can_manage_shared_text_snippets() to authenticated;

-- RLS als zweite Verteidigungslinie (ADR-004 Punkt 5). Geschrieben wird
-- ausschliesslich ueber die Funktionen unten; authenticated hat nur SELECT.
create policy treatment_text_snippets_select_scoped
  on public.treatment_text_snippets for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_use_text_snippets()
    and (
      staff_member_id is null
      or staff_member_id in (
        select sm.id from public.staff_members sm
        where sm.person_id = app.current_person_id()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Auditkatalog
--
-- Bausteine sind Betriebsdaten, kein Patientendatum - aber sie steuern, was in
-- einer Akte landet. Wer die Formulierungen der Praxis aendert, soll das
-- nachvollziehbar tun (ADR-010). Der Auditeintrag traegt Titel und
-- Geltungsbereich, nie den Text selbst (ADR-011).
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
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

alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member',
    'treatment_note',
    'prescription',
    'text_snippet'
  ));

-- -----------------------------------------------------------------------------
-- Gemeinsame Pruefung beider Schreibpfade
-- -----------------------------------------------------------------------------
create or replace function app.assert_text_snippet_input(
  p_title           text,
  p_body            text,
  p_staff_member_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'title must not be empty' using errcode = '22023';
  end if;
  if length(btrim(p_title)) > 80 then
    raise exception 'title is too long' using errcode = '22023';
  end if;
  if p_body is null or btrim(p_body, E' \t\r\n') = '' then
    raise exception 'snippet must not be empty' using errcode = '22023';
  end if;
  if length(btrim(p_body, E' \t\r\n')) > 2000 then
    raise exception 'snippet is too long' using errcode = '22023';
  end if;

  -- Praxisweit heisst: fuer alle sichtbar. Das darf nur owner.
  if p_staff_member_id is null and not app.can_manage_shared_text_snippets() then
    raise exception 'not allowed to manage shared text snippets' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Lesen
--
-- Eigene und praxisweite Bausteine in einer Liste, praxisweite zuerst: Sie
-- sind die abgestimmten Formulierungen, die persoenlichen die Ergaenzung.
-- Kein Auditeintrag - gelesen wird eine Vorlage, kein Patientendatum.
-- -----------------------------------------------------------------------------
create or replace function public.list_text_snippets()
returns table (
  id          uuid,
  title       text,
  body        text,
  /** true, wenn der Baustein der ganzen Praxis gehoert. */
  shared      boolean,
  /** true, wenn die anfragende Person ihn aendern darf. */
  editable    boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_person uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_use_text_snippets() then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  v_person := app.current_person_id();

  return query
    select
      s.id,
      s.title,
      s.body,
      s.staff_member_id is null,
      case
        when s.staff_member_id is null then app.can_manage_shared_text_snippets()
        else true
      end
    from public.treatment_text_snippets s
    where s.organization_id = v_org
      and (
        s.staff_member_id is null
        or s.staff_member_id in (
          select sm.id from public.staff_members sm where sm.person_id = v_person
        )
      )
    order by (s.staff_member_id is null) desc, lower(s.title), s.id;
end;
$$;

comment on function public.list_text_snippets() is
  'Textbausteine der anfragenden Person: praxisweite zuerst, dann die eigenen (UX-008). Fremde persoenliche Bausteine sind nicht enthalten.';

revoke all on function public.list_text_snippets() from public, anon;
grant execute on function public.list_text_snippets() to authenticated;

-- -----------------------------------------------------------------------------
-- Anlegen
-- -----------------------------------------------------------------------------
create or replace function public.create_text_snippet(
  p_title  text,
  p_body   text,
  /** true legt einen praxisweiten Baustein an; sonst einen persoenlichen. */
  p_shared boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_staff uuid;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_use_text_snippets() then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  if coalesce(p_shared, false) then
    v_staff := null;
  else
    select sm.id into v_staff
    from public.staff_members sm
    where sm.person_id = app.current_person_id()
      and sm.organization_id = v_org;

    if v_staff is null then
      raise exception 'no staff member for this account' using errcode = '22023';
    end if;
  end if;

  perform app.assert_text_snippet_input(p_title, p_body, v_staff);

  insert into public.treatment_text_snippets (
    organization_id, staff_member_id, title, body, created_by, updated_by
  )
  values (v_org, v_staff, btrim(p_title), btrim(p_body, E' \t\r\n'), v_actor, v_actor)
  returning id into v_id;

  -- Titel und Geltungsbereich, nie der Text (ADR-011).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'text_snippet.created', 'text_snippet', v_id, 'success',
    jsonb_build_object('surface', 'web', 'shared', v_staff is null, 'title', btrim(p_title))
  );

  return v_id;
exception
  when unique_violation then
    raise exception 'a snippet with this title already exists' using errcode = '23505';
end;
$$;

comment on function public.create_text_snippet(text, text, boolean) is
  'Legt einen Textbaustein an (UX-008). Praxisweit nur fuer owner; sonst persoenlich fuer die anfragende Person.';

revoke all on function public.create_text_snippet(text, text, boolean) from public, anon;
grant execute on function public.create_text_snippet(text, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Aendern
--
-- Der Geltungsbereich ist nicht aenderbar: Ein persoenlicher Baustein wird
-- nicht durch eine Aenderung zum Baustein der Praxis. Wer das will, legt einen
-- neuen an - und trifft dabei bewusst eine Entscheidung.
-- -----------------------------------------------------------------------------
create or replace function public.update_text_snippet(
  p_snippet_id uuid,
  p_title      text,
  p_body       text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_use_text_snippets() then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  select s.id, s.staff_member_id
    into v_alt
  from public.treatment_text_snippets s
  where s.id = p_snippet_id
    and s.organization_id = v_org
    and (
      s.staff_member_id is null
      or s.staff_member_id in (
        select sm.id from public.staff_members sm where sm.person_id = app.current_person_id()
      )
    )
  for update;

  -- Ein fremder persoenlicher Baustein und ein nicht existierender sehen
  -- gleich aus: die Meldung taugt nicht als Existenz-Orakel.
  if not found then
    raise exception 'text snippet not found' using errcode = 'P0002';
  end if;

  perform app.assert_text_snippet_input(p_title, p_body, v_alt.staff_member_id);

  update public.treatment_text_snippets
     set title      = btrim(p_title),
         body       = btrim(p_body, E' \t\r\n'),
         updated_at = now(),
         updated_by = v_actor
   where id = p_snippet_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'text_snippet.updated', 'text_snippet', p_snippet_id, 'success',
    jsonb_build_object(
      'surface', 'web', 'shared', v_alt.staff_member_id is null, 'title', btrim(p_title)
    )
  );
exception
  when unique_violation then
    raise exception 'a snippet with this title already exists' using errcode = '23505';
end;
$$;

comment on function public.update_text_snippet(uuid, text, text) is
  'Aendert Titel und Text eines Bausteins (UX-008). Der Geltungsbereich bleibt unveraendert.';

revoke all on function public.update_text_snippet(uuid, text, text) from public, anon;
grant execute on function public.update_text_snippet(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Loeschen
--
-- Ein Baustein ist eine Vorlage: Loeschen betrifft nichts, was schon in einer
-- Akte steht. Deshalb ist es hier - anders als bei einem Termin - ein echtes
-- Loeschen und kein Statuswechsel.
-- -----------------------------------------------------------------------------
create or replace function public.delete_text_snippet(p_snippet_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_use_text_snippets() then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  select s.id, s.staff_member_id, s.title
    into v_alt
  from public.treatment_text_snippets s
  where s.id = p_snippet_id
    and s.organization_id = v_org
    and (
      s.staff_member_id is null
      or s.staff_member_id in (
        select sm.id from public.staff_members sm where sm.person_id = app.current_person_id()
      )
    );

  if not found then
    raise exception 'text snippet not found' using errcode = 'P0002';
  end if;

  if v_alt.staff_member_id is null and not app.can_manage_shared_text_snippets() then
    raise exception 'not allowed to manage shared text snippets' using errcode = '42501';
  end if;

  delete from public.treatment_text_snippets where id = p_snippet_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'text_snippet.deleted', 'text_snippet', p_snippet_id, 'success',
    jsonb_build_object(
      'surface', 'web', 'shared', v_alt.staff_member_id is null, 'title', v_alt.title
    )
  );
end;
$$;

comment on function public.delete_text_snippet(uuid) is
  'Loescht einen Textbaustein (UX-008). Praxisweite Bausteine nur fuer owner.';

revoke all on function public.delete_text_snippet(uuid) from public, anon;
grant execute on function public.delete_text_snippet(uuid) to authenticated;
