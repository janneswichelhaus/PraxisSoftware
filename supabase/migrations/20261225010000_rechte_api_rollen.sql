-- Rechte der API-Rollen (Pfad A, ADR-004): Was Supabase in public von selbst vergibt, war an
-- sechs Funktionen, drei Tabellen und einer Sequenz nie entzogen. Die Funktionen weisen ohne
-- Anmeldung ab, die Tabellen schützt RLS - TRUNCATE aber nicht.

revoke all on function public.check_travel_buffers(jsonb) from anon;
revoke all on function public.list_day_route(date, uuid) from anon;
revoke all on function public.set_location_tour_start(
  uuid, text, text, text, text, double precision, double precision, text, boolean
) from anon;
revoke all on function public.set_patient_address_coordinate(
  uuid, text, text, text, text, double precision, double precision, text, boolean
) from anon;

revoke all on table public.patient_file_document_types, public.retention_assignments,
  public.retention_classes from anon, authenticated;
grant select on table public.patient_file_document_types, public.retention_assignments,
  public.retention_classes to authenticated;

-- Die Nummern vergibt nur der Eigentümer: fleet_spots ist für beide Rollen gesperrt.
revoke all on sequence public.fleet_spots_seq_seq from anon, authenticated;

-- Der Dienst sollte beide nie rufen: Wegpunkte holt die Edge Function mit dem Token der
-- Person, das Aufräumen läuft über pg_cron.
revoke all on function public.electricity_tour_points(date) from service_role;
revoke all on function public.discard_stale_reimbursement_receipts() from service_role;

-- Künftige Funktionen der migrierenden Rolle führt nur aus, wem eine Migration es gibt.
-- PUBLIC erhält EXECUTE global; ein Entzug nur "in schema public" wirkte darauf nicht.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges revoke execute on functions from public;
