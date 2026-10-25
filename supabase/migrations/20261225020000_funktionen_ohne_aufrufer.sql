-- Neun Funktionen ohne Aufrufer außerhalb der Tests (Pfad A). Die Plattform erfasst Einheiten
-- nur über sync_platform_exercise_session; ohne cascade, damit nichts unbemerkt mitfällt.

drop function app.exercise_illustration_bases();
drop function app.platform_mailbox_confirmed(uuid);
drop function app.team_message_text(text);
drop function app.has_strong_authentication();
drop function public.delete_invoice_recipient(uuid);
drop function public.start_platform_exercise_session(uuid, uuid);
drop function public.mark_platform_exercise_set(uuid, uuid, uuid, integer, boolean);
drop function public.finish_platform_exercise_session(uuid, uuid, text, jsonb);
drop function public.update_service_catalog_version(uuid, text, date);

comment on table public.exercise_plan_session_values is 'TRK-001: Angaben der Person zu einer beendeten Einheit (Takt session, ANN-348) - Anstrengung und Schmerz, je 0 bis 10, freiwillig. Datenklasse wie die Einheit; faellt mit ihr. Geschrieben nur ueber sync_platform_exercise_session. Kein Tabellenrecht (ADR-004).';
