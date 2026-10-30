-- Die Lesefrist sagt der Server für jeden Zugang (ADR-023 Punkt 5, ANN-809): `writable` im Gerüst
-- aus derselben Prüfung wie jeder Schreibweg. Bisher erkannte die Oberfläche sie nur am eigenen
-- Zugang und bot einer Vertretung Wünsche an, die der Server seit ANN-807 abweist.

drop function public.platform_context();

create function public.platform_context()
returns table(access_id uuid, organization_name text, relationship_kind text, status text, readable boolean, writable boolean, read_until timestamp with time zone, access_kind text, represented_name text, own_name text, practice_phone text)
language plpgsql security definer
set search_path to ''
as $$
declare
  v_zeile record;
begin
  if auth.uid() is null
     or exists (select 1 from public.user_profiles up where up.id = auth.uid()) then
    return;
  end if;

  for v_zeile in
    select a.id, o.name, a.organization_id, a.relationship_kind, a.status, a.access_kind,
           exists (select 1 from app.platform_readable_access(a.id)) as lesbar,
           app.platform_access_writable(a.id) as schreibbar,
           app.platform_access_ended_at(a.id) as bis,
           a.relationship_id, a.created_at
    from public.platform_accesses a
    join public.organizations o on o.id = a.organization_id
    where a.account_user_id = auth.uid()
      and a.status in ('active', 'locked')
    -- Die eigenen Bereiche zuerst, dann die Vertretungen.
    order by (a.access_kind <> 'self'), a.relationship_kind desc, a.created_at
  loop
    access_id := v_zeile.id;
    organization_name := v_zeile.name;
    relationship_kind := v_zeile.relationship_kind;
    status := v_zeile.status;
    readable := v_zeile.lesbar;
    writable := v_zeile.schreibbar;
    read_until := v_zeile.bis;
    access_kind := v_zeile.access_kind;
    represented_name := null;
    own_name := app.platform_own_name(v_zeile.id);
    practice_phone := app.platform_practice_phone(v_zeile.organization_id);

    if v_zeile.access_kind <> 'self' and v_zeile.lesbar then
      select concat_ws(' ', p.given_name, p.family_name) into represented_name
      from app.platform_relationship(v_zeile.relationship_kind, v_zeile.relationship_id) r
      join public.persons p on p.id = r.person_id;

      perform app.log_platform_representation(
        v_zeile.id, 'platform_representation.read', jsonb_build_object('view', 'context')
      );
    end if;

    return next;
  end loop;
end;
$$;

comment on function public.platform_context() is
  'POR-004/POR-006/DRP-N1/DRP-N2: Plattformprojektion fuer das Geruest (DSN-001 Abschnitt 3, D6): Praxisname und Rufnummer der Praxis (ANN-691), eigene Zugaenge und Vertretungen mit Art, ob der Zugang noch schreiben darf (nicht in der Lesefrist, fuer jede Art des Zugangs, ANN-809), an einem lesbaren Zugang der eigene Name (ANN-690). Bei einer lesbaren Vertretung der Name der vertretenen Person ("Sie handeln fuer ...", ADR-023 Punkt 14) und ein Auditeintrag (Punkt 24, ANN-209). Eigenes Lesen wird nicht protokolliert.';

revoke all on function public.platform_context() from public, anon;
grant execute on function public.platform_context() to authenticated;
