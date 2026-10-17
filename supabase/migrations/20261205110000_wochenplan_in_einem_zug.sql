-- =============================================================================
-- Wochenplan in einem Zug (Praxis-Review der Überholung Organisation, PR #267)
--
-- Bis hier speicherte der Wochenplan jeden Wochentag für sich
-- (public.set_staff_working_hours). Wer drei Tage änderte, speicherte
-- dreimal, und scheiterte der dritte, standen die ersten beiden schon.
--
-- public.set_staff_working_week nimmt die geänderten Tage zusammen und
-- speichert sie in einer Transaktion: alle oder keiner. Jeder Tag läuft durch
-- dieselbe Prüfung wie bisher (Rolle, Person, Fassung von heute, Urlaub,
-- Freizeitausgleich, Überschneidung) - die Funktion ruft die bestehende je
-- Tag auf und fügt keine eigene Regel hinzu. Scheitert ein Tag, nennt der
-- Fehler ihn im Hinweis (`weekday N`), damit die Oberfläche sagen kann, wo.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): wie der einzelne Tag.
-- =============================================================================

create function public.set_staff_working_week(p_staff_member_id uuid, p_days jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag    jsonb;
  v_nr     smallint;
  v_schon  smallint[] := '{}';
  v_anzahl integer := 0;
  v_state  text;
  v_text   text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array'
     or jsonb_array_length(p_days) not between 1 and 7 then
    raise exception 'days must be an array of one to seven weekdays' using errcode = '22023';
  end if;

  for v_tag in select d from jsonb_array_elements(p_days) as d loop
    begin
      v_nr := (v_tag ->> 'weekday')::smallint;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'weekday must be between 1 and 7' using errcode = '22023';
    end;
    -- Jeder Wochentag höchstens einmal, verglichen nach dem Umwandeln ("01"
    -- ist 1; Zweitreview): Sonst entschiede die Reihenfolge.
    if v_nr = any (v_schon) then
      raise exception 'weekday given twice' using errcode = '22023';
    end if;
    v_schon := v_schon || v_nr;
    begin
      perform public.set_staff_working_hours(p_staff_member_id, v_nr, v_tag -> 'blocks');
    exception
      when others then
        -- Derselbe Fehler, dazu der Tag; die Transaktion fällt ganz zurück.
        get stacked diagnostics v_state = returned_sqlstate, v_text = message_text;
        raise exception using errcode = v_state, message = v_text, hint = 'weekday ' || v_nr;
    end;
    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$$;

revoke all on function public.set_staff_working_week(uuid, jsonb) from public, anon;
grant execute on function public.set_staff_working_week(uuid, jsonb) to authenticated;

comment on function public.set_staff_working_week(uuid, jsonb) is
  'Wochenplan in einem Zug: ersetzt mehrere Wochentage der heute gueltigen Fassung in einer Transaktion ([{weekday, blocks}], ein bis sieben, je Tag einmal). Jeder Tag laeuft durch public.set_staff_working_hours; scheitert einer, faellt alles zurueck und der Hinweis nennt den Tag. Ohne Auditeintrag.';
