-- =============================================================================
-- Abgleich statt Vertrauen (DAT-003, ADR-017 Punkt 27)
--
-- Seit DAT-001 gibt es zwei Speicher, die auseinanderlaufen koennen - das ist
-- laut ADR-017 "der eigentliche Preis dafuer, ueberhaupt Dateien zu fuehren".
-- Punkt 27 verlangt deshalb einen wiederkehrenden Abgleich mit zwei Befunden:
--
--   FEHLENDE OBJEKTE   Ein Datensatz ohne Objekt. Das ist ein sichtbarer
--                      Fehler an der Datei - keine leere Flaeche, kein
--                      stiller Ausgleich (PROJECT_PRINCIPLES.md 13). An der
--                      einzelnen Datei zeigt das seit DAT-001
--                      list_patient_files ueber object_missing; hier kommt
--                      die Uebersicht dazu, die sagt, WELCHE Akten betroffen
--                      sind.
--
--   VERWAISTE OBJEKTE  Ein Objekt ohne Datensatz. Es ist Abfall (Punkt 6) und
--                      wird geloescht.
--
-- WIE VERWAISTE OBJEKTE VERSCHWINDEN. Nicht ueber einen zweiten Loeschweg,
-- sondern ueber denselben: order_orphaned_object_deletion schreibt fuer jedes
-- einen Loeschauftrag, und der wird ausgefuehrt und quittiert wie jeder
-- andere (DAT-002). Ein eigener Pfad "loesch das mal eben" waere die eine
-- Stelle, an der ein Objekt ohne Nachweis verschwindet.
--
-- WAS DER ABGLEICH NICHT IST. Er laeuft nicht von allein und meldet sich
-- nicht. Er wird gerechnet, wenn jemand "Aufbewahrung und Loeschung" oeffnet.
-- Einen Benachrichtigungsweg gibt es in dieser Anwendung nicht - sie
-- verschickt nichts (CAL-013), und einen dafuer zu bauen waere ein eigener
-- Auftrag mit eigener Providerfrage. Der Abgleich gehoert deshalb in den
-- monatlichen Bericht aus ADR-010 Punkt 6; dort ist er ein Tagesordnungspunkt
-- und keine stille Warteschlange.
--
-- WARUM DAS NUR owner SIEHT. Die Uebersicht nennt Akten quer durch die Praxis
-- und beantwortet eine betriebliche Frage, keine Behandlungsfrage - dieselbe
-- Ueberlegung wie beim Loeschjournal und beim Legal Hold (LOE-002b).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fehlende Objekte
--
-- Ein 'ready'-Datensatz, dessen Objekt nicht (mehr) da ist. Ursachen, die
-- ADR-017 nennt: eine unvollstaendige Wiederherstellung (Punkt 26), ein
-- stiller Verlust beim Anbieter, oder ein Loeschauftrag, der ein Objekt
-- erwischt hat, dessen Zeile noch stand - Letzteres kann seit DAT-002 nicht
-- mehr passieren, aber Bestandsdaten wissen davon nichts.
--
-- Die Uebersicht nennt Patientenname und Dateinamen, weil sie sonst
-- unbrauchbar waere: Eine Liste aus Kennungen sagt niemandem, wo nachzusehen
-- ist. Sie steht nur owner offen, und der sieht ohnehin jede Akte.
-- -----------------------------------------------------------------------------
create function public.list_missing_patient_file_objects()
returns table (
  file_id       uuid,
  patient_id    uuid,
  patient_name  text,
  document_type text,
  display_name  text,
  uploaded_at   timestamptz
)
language plpgsql
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
  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to read the storage reconciliation' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.patient_id,
           btrim(coalesce(pe.given_name, '') || ' ' || coalesce(pe.family_name, '')),
           f.document_type,
           f.display_name,
           f.confirmed_at
    from public.patient_files f
    join public.patients p on p.id = f.patient_id
    join public.persons pe on pe.id = p.person_id
    where f.organization_id = v_org
      and f.status = 'ready'
      and not exists (
        select 1
        from storage.objects o
        where o.bucket_id = app.patient_file_bucket()
          and o.name = f.object_key
      )
    order by f.confirmed_at;
end;
$$;

comment on function public.list_missing_patient_file_objects() is
  'Datensaetze ohne Objekt (ADR-017 Punkt 27). Ein sichtbarer Fehler, kein stiller Ausgleich.';

-- -----------------------------------------------------------------------------
-- Verwaiste Objekte
--
-- Ein Objekt im Bucket, zu dem es keinen Datensatz gibt - weder 'ready' noch
-- 'pending'. Gezaehlt statt aufgelistet: Der Objektschluessel gehoert nicht in
-- eine Liste (dieselbe Ueberlegung wie bei den Loeschauftraegen), und ein
-- verwaistes Objekt traegt ohnehin keine Angabe, mit der sich etwas anfangen
-- liesse. Was zaehlt, ist die Zahl und dass sie auf null gebracht wird.
--
-- Die Abgrenzung auf die eigene Organisation laeuft ueber die erste Ebene des
-- Schluessels (Punkt 5) - genau dafuer steht sie dort.
--
-- Ein Objekt, fuer das schon ein offener Auftrag vorliegt, ist nicht verwaist,
-- sondern in Arbeit; sonst stuende dieselbe Datei in zwei Listen.
-- -----------------------------------------------------------------------------
create function public.count_orphaned_patient_file_objects()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to read the storage reconciliation' using errcode = '42501';
  end if;

  select count(*)
    into v_anzahl
  from storage.objects o
  where o.bucket_id = app.patient_file_bucket()
    and o.name like v_org::text || '/%'
    and not exists (
      select 1 from public.patient_files f where f.object_key = o.name
    )
    and not exists (
      select 1
      from public.storage_deletion_orders d
      where d.bucket_id = o.bucket_id
        and d.object_key = o.name
        and d.receipted_at is null
    );

  return v_anzahl;
end;
$$;

comment on function public.count_orphaned_patient_file_objects() is
  'Anzahl der Objekte ohne Datensatz in der eigenen Organisation (ADR-017 Punkt 27).';

-- -----------------------------------------------------------------------------
-- Verwaiste Objekte zur Loeschung vormerken
--
-- Punkt 27: "Verwaiste werden geloescht." Der Weg dorthin ist derselbe wie bei
-- jeder anderen Loeschung - ein Auftrag, ausgefuehrt und quittiert (Punkt 25).
-- Diese Funktion legt nur die Auftraege an; geloescht wird danach in
-- "Aufbewahrung und Loeschung" wie bei allem anderen.
--
-- Warum nicht sofort loeschen: Eine Datenbankfunktion kann kein Objekt
-- entfernen. Und selbst wenn sie es koennte - der Nachweis haengt an der
-- Quittung, und die entsteht nur auf dem einen Weg.
-- -----------------------------------------------------------------------------
create function public.order_orphaned_object_deletion()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to order deletions' using errcode = '42501';
  end if;

  insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
  select v_org, o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id = app.patient_file_bucket()
    and o.name like v_org::text || '/%'
    and not exists (
      select 1 from public.patient_files f where f.object_key = o.name
    )
  on conflict do nothing;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

comment on function public.order_orphaned_object_deletion() is
  'Schreibt fuer jedes verwaiste Objekt einen Loeschauftrag (ADR-017 Punkt 27). Geloescht wird danach ueber den gewoehnlichen Weg mit Quittung.';

-- -----------------------------------------------------------------------------
-- Rechte
-- -----------------------------------------------------------------------------
revoke all on function public.list_missing_patient_file_objects() from public, anon;
revoke all on function public.count_orphaned_patient_file_objects() from public, anon;
revoke all on function public.order_orphaned_object_deletion() from public, anon;

grant execute on function public.list_missing_patient_file_objects() to authenticated;
grant execute on function public.count_orphaned_patient_file_objects() to authenticated;
grant execute on function public.order_orphaned_object_deletion() to authenticated;
