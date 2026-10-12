-- =============================================================================
-- KOM-012: Schalter "Anhaenge von aussen aus"
--
-- Jannes, 2026-10-12: vorerst keine Virenpruefung - ADR-026 ist
-- zurueckgestellt. ADR-017 Punkt 29 und 69 gelten unveraendert: Ohne
-- Pruefergebnis wird kein Anhang einer echten Person ready. Der Schalter der
-- Pruefung (app.message_attachment_scan_required) laesst Anhaenge aber nur als
-- "nicht geprueft" durch; abschalten konnte sie bisher nichts. Dieser
-- Schalter tut es, je Organisation (ANN-371):
--
--   public.organizations            + external_attachments_enabled, Standard aus
--   app.external_attachments_enabled  die eine Stelle, an der er gelesen wird
--   app.message_attachments_offered   + nur bei eingeschaltetem Schalter
--
-- STANDARD AUS. Eine neue Organisation - also auch die erste mit echten
-- Daten - bietet keine Fotos und Videos an Rueckfragen an, ohne dass jemand
-- daran denken muss. Nur der synthetische Seed (seed.sql) schaltet ihn fuer
-- die Testpraxis ein, damit Entwicklung, Tests und Test-Umgebung weiterlaufen
-- (Prinzipien §15.2). Es gibt keine Funktion und kein Tabellenrecht, ihn zu
-- aendern: Einschalten mit echten Daten ist ein bewusster Schritt von Jannes
-- im Go-live-Gate (ADR-007 Punkt 5), erst mit einem Pruefer nach ADR-026.
--
-- Aus ist aus fuer neue Anhaenge: Das Angebot verschwindet (can_attach false,
-- die Plattform zeigt dann weder Aufnahme noch Einwilligungsfrage), die
-- Vorbereitung weist ab
-- (42501 "attachments not offered"). Die Rueckfrage in Worten bleibt.
-- Vorhandene Anhaenge bleiben bis zu ihrer Frist sichtbar und loeschbar.
-- =============================================================================

alter table public.organizations
  add column external_attachments_enabled boolean not null default false;

comment on column public.organizations.external_attachments_enabled is
  'KOM-012 (ANN-371): ob Patient:innen und Kund:innen Fotos und Videos an Rueckfragen anhaengen koennen. Standard aus; nur der synthetische Seed schaltet ihn ein. Mit echten Daten erst nach einer Virenpruefung (ADR-017 Punkt 29, ADR-026) - Go-live-Gate. Keine Funktion aendert ihn.';

-- Die Test-Umgebung traegt nur synthetische Daten und ihre Kennung
-- (supabase/testumgebung/kennung.sql, ANN-100); sie wird bei dieser Migration
-- nicht neu aufgesetzt. Dort bleibt der Weg offen, wie der Seed ihn oeffnet -
-- sonst fielen die Schritte der Sichtung zu Foto und Video weg. Jede andere
-- Datenbank behaelt den Standard aus.
do $$
begin
  if to_regclass('testumgebung.kennung') is not null then
    update public.organizations set external_attachments_enabled = true;
  end if;
end;
$$;

-- ANN-371: die eine Stelle, an der der Schalter gelesen wird.
create function app.external_attachments_enabled(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select o.external_attachments_enabled from public.organizations o
    where o.id = p_organization_id
  ), false)
$$;

revoke all on function app.external_attachments_enabled(uuid) from public, anon, authenticated;

comment on function app.external_attachments_enabled(uuid) is
  'KOM-012 (ANN-371): ob die Organisation Anhaenge von aussen annimmt - ohne Organisation nein. Nur aus app.message_attachments_offered.';

-- Aus 20261026100000_kom_005_message_attachments.sql; neu ist nur der
-- Schalter. Er steht vor Stufe und Abo, damit er ueberall greift, wo das
-- Angebot gelesen wird (Projektion und Vorbereitung).
create or replace function app.message_attachments_offered(p_kind text, p_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'training' then exists (
      select 1 from public.training_relationships t
      where t.id = p_relationship_id
        and app.external_attachments_enabled(t.organization_id)
    )
    when 'treatment' then exists (
      select 1 from public.aftercare_subscriptions s
      where s.patient_id = p_relationship_id
        and app.external_attachments_enabled(s.organization_id)
        and s.starts_on <= app.training_today(s.organization_id)
        and (s.ends_on is null or s.ends_on >= app.training_today(s.organization_id))
    )
    else false
  end
$$;

comment on function app.message_attachments_offered(text, uuid) is
  'KOM-005, KOM-012 (ADR-017 Punkt 59, ANN-332, ANN-371): ob in diesem Verhaeltnis Fotos und Videos an Rueckfragen vorgesehen sind - nur bei eingeschaltetem Schalter der Organisation, dann im Training immer, in der Behandlung nur mit laufendem Nachsorge-Abo.';
