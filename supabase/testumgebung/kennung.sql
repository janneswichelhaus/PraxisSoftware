-- =============================================================================
-- Kennung der Test-Umgebung (OPS-002a, Zweitreview)
--
-- Der Seed loescht jede Tabelle in `public`. Ein Verbindungsstring, der aus
-- Versehen auf eine andere Datenbank zeigt, darf deshalb nie neu aufgesetzt
-- werden. Die Pruefung der Projekt-URL im Workflow bindet nur Datenbank und
-- Projekt aneinander; diese Kennung bindet die Datenbank an ihren Zweck.
--
-- Regel: Neu aufgesetzt wird nur eine LEERE Datenbank (keine Organisation) -
-- sie bekommt dabei die Kennung - oder eine, die die Kennung schon traegt.
-- Eine Datenbank mit Daten und ohne Kennung wird abgewiesen.
-- =============================================================================

do $$
begin
  if exists (select 1 from public.organizations)
     and to_regclass('testumgebung.kennung') is null then
    raise exception 'Diese Datenbank traegt keine Kennung der Test-Umgebung und enthaelt Daten - Neu aufsetzen abgewiesen.';
  end if;
end;
$$;

create schema if not exists testumgebung;
revoke all on schema testumgebung from public;

create table if not exists testumgebung.kennung (
  umgebung text primary key check (umgebung = 'test')
);
revoke all on testumgebung.kennung from public;

comment on table testumgebung.kennung is
  'Kennung der Test-Umgebung (OPS-002a). Nur synthetische Daten; der Seed darf hier laufen. Keine personenbezogenen Daten, keine Frist.';

insert into testumgebung.kennung (umgebung) values ('test') on conflict do nothing;
