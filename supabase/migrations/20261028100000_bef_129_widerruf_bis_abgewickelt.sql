-- =============================================================================
-- BEF-129: Ein widerrufener Trainingsvertrag bleibt in Offene Punkte, bis sein
-- Paket entfernt ist (ANN-341; Zweitreview KND-EPIC-001, H5)
--
-- Bisher zeigte `list_platform_training_withdrawals` einen Widerruf 14 Tage
-- lang. Der Widerruf loescht und storniert nichts selbst (ANN-290); wurde er
-- in den 14 Tagen uebersehen, stand er nur noch am Trainingsverhaeltnis, und
-- das Paket konnte trotz Widerruf ueber den Monatsentwurf abgerechnet werden.
--
-- Jetzt gilt: Ein Widerruf steht in Offene Punkte, solange sein Paket noch
-- besteht (`training_package_id` ist gesetzt) und das Trainingsverhaeltnis
-- nicht beendet ist - und wie bisher mindestens 14 Tage. Das Vertragsende
-- laesst sich erst nach dem letzten Pakettag eintragen (ANN-277); es beendet
-- den Hinweis, wenn die Praxis ein Paket bewusst behaelt (Wertersatz, ein
-- Widerruf, den sie fuer verspaetet haelt). Ohne diese Grenze stuende er bis
-- zur Aufbewahrungsloeschung (Zweitreview BEF-129). Abgewickelt ist er, wenn die Praxis das Paket entfernt
-- (`delete_training_package`, vorher die Rechnung stornieren, wenn es auf
-- einer stand); der Fremdschluessel setzt die Kennung dann auf null. Eine
-- Stornierung allein wickelt nicht ab: Danach ist die Leistung wieder
-- abrechenbar.
--
-- Neu ist die Spalte `package_open`: Die Liste sagt, ob das Paket noch
-- besteht. Kein Zustand "gesehen" und keine neue Auditaktion (ADR-010): Der
-- Zustand ergibt sich aus dem Paket.
--
-- Die Rueckgabe aendert sich; deshalb drop und create, Rechte wie zuvor.
-- =============================================================================

drop function public.list_platform_training_withdrawals();

create function public.list_platform_training_withdrawals()
returns table (
  contract_id              uuid,
  training_relationship_id uuid,
  given_name               text,
  family_name              text,
  withdrawn_on             date,
  package_label            text,
  withdrawn_access_kind    text,
  withdrawn_representative_name text,
  package_open             boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null or not app.can_manage_training_packages() then
    return;
  end if;

  return query
  select k.id, k.training_relationship_id, pe.given_name, pe.family_name, k.withdrawn_on,
         k.package_label, k.withdrawn_access_kind, k.withdrawn_representative_name,
         k.training_package_id is not null
  from public.training_contracts k
  join public.training_relationships t on t.id = k.training_relationship_id
  join public.persons pe on pe.id = t.person_id
  where k.organization_id = v_org
    and k.withdrawn_at is not null
    -- ANN-341: bis das Paket entfernt oder das Verhaeltnis beendet ist,
    -- mindestens 14 Tage.
    and ((k.training_package_id is not null
          and (t.contract_ended_on is null
               or t.contract_ended_on >= app.training_today(v_org)))
         or k.withdrawn_at > now() - make_interval(days => app.platform_withdrawal_notice_days()))
  order by k.withdrawn_at desc, k.id;
end;
$$;

revoke all on function public.list_platform_training_withdrawals() from public, anon;
grant execute on function public.list_platform_training_withdrawals() to authenticated;

comment on function public.list_platform_training_withdrawals() is
  'KND-004, BEF-129 (ANN-341): Widerrufe von Trainingsvertraegen ueber die Plattform fuer Offene Punkte (owner, office) - solange das Paket besteht und das Verhaeltnis nicht beendet ist, mindestens 14 Tage; package_open sagt, ob es noch besteht. Ohne Recht keine Zeile.';
