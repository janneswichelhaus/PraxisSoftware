-- Ladestrom wird wie ein Einkauf mit Beleg beantragt (Jannes, 2026-10-26, ANN-749): Die Rechnung
-- aus Stunden oder Touren, ihre Einstellungen und Vorschläge entfallen. Ältere Anträge behalten
-- ihren Rechenweg, denn ausgezahlte sind Belege (ANN-602).

drop function public.submit_electricity_reimbursement(date, boolean, text);
drop function public.preview_electricity_reimbursement(date);
drop function public.electricity_suggestions();
drop function public.set_electricity_settings(integer, integer, integer);
drop function public.electricity_tour_points(date);
drop function public.record_electricity_tour_distance(uuid, uuid, date, integer);
drop function app.electricity_tour_days(uuid, uuid, date);
drop function app.electricity_offer(uuid, uuid, date);
drop function app.electricity_amount_cents(integer, integer, integer, integer);
drop function app.assert_electricity_month(uuid, date);
drop function app.reimbursement_working_minutes(uuid, uuid, date);

alter table public.organizations
  drop column electricity_cents_per_kwh,
  drop column electricity_wh_per_km,
  drop column electricity_km_per_hour;

comment on table public.staff_reimbursements is 'ERS-001 (ANN-598, ANN-599): Erstattungsanträge - Einkauf mit Belegen; Ladestrom seit 2026-10-26 ebenso als Einkauf mit Beleg, ältere Ladestrom-Anträge je Monat mit ihrem Rechenweg (kind electricity). Beantragt von/am, entschieden von/am mit Grund, ausgezahlt von/am sind der Nachweis (ADR-010 Punkt 15). Datenklassen erstattung (ausgezahlt: acht Jahre ab Ende des Jahres der Auszahlung, Par. 147 AO) und erstattung_kurz (abgelehnt, zurückgezogen: ein Jahr), ANN-602; beantragte und genehmigte bleiben. Kein Tabellenrecht.';
