-- =============================================================================
-- BEF-139: Das Buero antwortet im Training auch auf "Sonstiges"
--
-- Entscheidung des Projektinhabers vom 2026-10-10 zu ANN-311 Fassung 2: eine
-- Regel fuer beide Bereiche. Das Buero antwortet und erledigt im Training wie
-- in der Behandlung bei "Termin oder Rechnung" und "Sonstiges", nicht bei
-- "Uebung" und "Beschwerden" (ANN-311 Fassung 3). Eine Antwort auf eine
-- Rueckfrage ist kein Trainingsinhalt im Sinne von ADR-021 Punkt 10; Protokoll,
-- Profil und Plaene schreibt das Buero weiter nicht. Lesen bleibt bei
-- app.can_read_training_content() (ANN-315). Sonst unveraendert gegenueber
-- 20261020110000_kom_002_practice_messages.sql.
-- =============================================================================

create or replace function app.can_answer_platform_message(p_kind text, p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'treatment' then app.has_any_role('owner', 'therapist', 'team_lead')
                          or (p_topic in ('organisational', 'other') and app.has_any_role('office'))
    when 'training' then app.has_any_role('owner', 'trainer')
                         or (p_topic in ('organisational', 'other') and app.has_any_role('office'))
    else false
  end
$$;
revoke all on function app.can_answer_platform_message(text, text) from public, anon, authenticated;

comment on function app.can_answer_platform_message(text, text) is
  'KOM-002 (ANN-310, ANN-311), BEF-139: wer auf einen Vorgang antwortet und ihn erledigt. Behandlung: owner, Therapeut:innen, Teamleitung; Training: owner, Trainingsbetreuung; in beiden das Buero bei Termin, Rechnung und Sonstiges.';
