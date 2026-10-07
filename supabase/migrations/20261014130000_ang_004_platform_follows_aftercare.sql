-- =============================================================================
-- ANG-004 (ANG-EPIC-001): Der Zugang folgt dem Abo
--
-- PROJECT_PRINCIPLES.md 4.6: Nach dem Ende der Behandlung geht es mit dem
-- Nachsorge-Abo weiter; nach einer Kuendigung bleibt der Zugriff 30 Tage
-- lesend. DSN-001 4.3: Behandlung endet ohne Abo - 30 Tage lesend (D2); Abo
-- gekuendigt - ebenso, gerechnet vom Ende des Abos.
--
--   app.platform_read_from        ab welchem Tag die Lesefrist zaehlt (ANN-274)
--   app.platform_access_ended_at  rechnet damit statt mit dem Ende des
--                                 Verhaeltnisses allein
--
-- Die eine Stelle bleibt die eine Stelle: Alles, was nach dem Ende eines
-- Zugangs fragt - lesbare Projektionen, platform_context.read_until, die
-- Frist des Zugangs und die Loeschung des Kontos (ADR-023 Punkt 5) -, liest
-- app.platform_access_ended_at und folgt damit dem Abo, ohne eigene Aenderung.
--
-- Was ein Abo darueber hinaus freischaltet (Verlauf, Gewohnheiten,
-- Rueckfragen, Plan als PDF), gibt es noch nicht; es kommt mit UEB-, TRK-,
-- ALT- und KOM-EPIC und fragt dann den Stand des Abos (ADR-014: nichts auf
-- Vorrat).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ab wann die Lesefrist zaehlt (ANN-274)
--
-- Im Training das Vertragsende. In der Behandlung der Abschluss der
-- Versorgung oder das Ende des letzten Nachsorge-Abos, was spaeter liegt;
-- laeuft ein Abo, gibt es (noch) keinen Tag - der Zugang ist nicht zu Ende.
-- Ohne Ende des Verhaeltnisses null wie bisher: Laeuft die Behandlung, laeuft
-- der Zugang.
-- -----------------------------------------------------------------------------
create function app.platform_read_from(p_kind text, p_relationship_id uuid, p_ended_on date)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  -- ANN-274: Das Abo verlaengert die Lesezeit; 30 Tage ab seinem Ende.
  select case
    when p_ended_on is null then null
    when p_kind <> 'treatment' then p_ended_on
    -- Zweitreview: Ein Abo zaehlt erst ab seinem Beginn, und eines, das vor
    -- dem Beginn gekuendigt wurde, zaehlt nie.
    when exists (
      select 1 from public.aftercare_subscriptions s
      where s.patient_id = p_relationship_id and s.ends_on is null
        and s.starts_on <= app.training_today(s.organization_id)
    ) then null
    else greatest(
      p_ended_on,
      (select max(s.ends_on) from public.aftercare_subscriptions s
        where s.patient_id = p_relationship_id and s.ends_on >= s.starts_on
          and s.ends_on is not null)
    )
  end
$$;

revoke all on function app.platform_read_from(text, uuid, date) from public, anon, authenticated;

comment on function app.platform_read_from(text, uuid, date) is
  'ANG-004 (ANN-274): Tag, ab dem die Lesefrist eines Zugangs zaehlt - Ende des Verhaeltnisses, in der Behandlung spaetestens das Ende des Nachsorge-Abos; null, solange Verhaeltnis oder Abo laufen.';

-- -----------------------------------------------------------------------------
-- 2. Das Ende eines Zugangs
--
-- Aus 20261002133000_abn_009_majority_date.sql (juengste Fassung); nur der
-- erste Zweig zaehlt jetzt ab app.platform_read_from.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.platform_access_ended_at(p_access_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when a.status = 'revoked' then a.revoked_at
    when a.status = 'invited' and not exists (
           select 1 from public.platform_access_invitations i
           where i.platform_access_id = a.id and i.status = 'pending' and i.expires_at > now()
         )
      then (select max(i.expires_at) from public.platform_access_invitations i
            where i.platform_access_id = a.id)
    else
      -- least() uebergeht null: ohne Ende des Verhaeltnisses zaehlt allein
      -- die Volljaehrigkeit, ohne Sorgerecht allein das Ende.
      least(
        -- ANG-004 (ANN-274): Die Lesefrist zaehlt vom Ende des Verhaeltnisses,
        -- in der Behandlung vom Ende des Nachsorge-Abos, wenn es spaeter
        -- endet; solange ein Abo laeuft, gar nicht.
        case when l.lese_ab is not null
          then app.retention_due_at(l.lese_ab, app.platform_read_period(), o.time_zone)
        end,
        case when a.access_kind = 'legal_representative' and a.legal_basis = 'custody'
          then coalesce(
            (app.majority_date(r.date_of_birth)::timestamp at time zone o.time_zone),
            -- Ohne Geburtsdatum ist das Sorgerecht nicht pruefbar: beendet.
            a.created_at)
        end,
        case when a.access_kind <> 'self' and a.legal_basis is distinct from 'custody'
              and coalesce(app.platform_is_minor(r.date_of_birth, o.time_zone), true)
          then a.created_at
        end
      )
  end
  from public.platform_accesses a
  join public.organizations o on o.id = a.organization_id
  left join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r on true
  left join lateral (
    select app.platform_read_from(a.relationship_kind, a.relationship_id, r.ended_on) as lese_ab
  ) l on true
  where a.id = p_access_id
$function$;
