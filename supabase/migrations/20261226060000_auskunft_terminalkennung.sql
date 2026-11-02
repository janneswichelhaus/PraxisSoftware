-- Die Auskunft nach Art. 15 nennt an einer Zahlung auch die Kennung des Terminals (ANN-837). Ergänzt
-- wird nur dieser Schlüssel in der geltenden Fassung beider Kopien; fehlt die Stelle, bricht sie ab.
do $$
declare
  v_funktion regprocedure;
  v_alt      text;
  v_neu      text;
  v_stelle   constant text := '''method'', z.method,';
begin
  foreach v_funktion in array array[
    'public.export_patient_record(uuid)'::regprocedure,
    'public.export_training_record(uuid)'::regprocedure
  ]
  loop
    v_alt := pg_get_functiondef(v_funktion);
    if (length(v_alt) - length(replace(v_alt, v_stelle, ''))) / length(v_stelle) <> 1 then
      raise exception '%: Stelle für die Kennung des Terminals nicht eindeutig', v_funktion;
    end if;
    v_neu := replace(
      v_alt,
      v_stelle,
      v_stelle || chr(10) || '        ''terminal_transaction'', z.terminal_transaction,'
    );
    execute v_neu;
    execute format(
      'comment on function %s is %L',
      v_funktion,
      coalesce(obj_description(v_funktion, 'pg_proc'), '')
        || ' Die Zahlungen tragen die Kennung des Terminals terminal_transaction (ANN-837, ergaenzt in 20261226060000_auskunft_terminalkennung.sql).'
    );
  end loop;
end;
$$;
