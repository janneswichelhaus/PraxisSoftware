import { Button } from '@/components/ui/Button';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { AUSZUG_NACHBILDUNG, AUSZUG_RECHTSSATZ, type Auszuege } from './auszuege';

/** Je Eintrag seine ausgewählten Sätze im Wortlaut; die Zeile führt zum Eintrag selbst. */
export function Auszugsliste({ auszuege }: { auszuege: Auszuege }) {
  return (
    <Section titel="Verlauf in Auszügen">
      <div className="flex flex-col gap-3">
        {auszuege.meldung ? (
          <Statusmeldung ton={auszuege.meldung.ton}>{auszuege.meldung.text}</Statusmeldung>
        ) : null}
        {auszuege.zeilen ? (
          <>
            {auszuege.nachbildung ? (
              <Statusmeldung ton="warnung">{AUSZUG_NACHBILDUNG}</Statusmeldung>
            ) : null}
            <ListRows beschriftung="Auszüge je Eintrag">
              {auszuege.zeilen.map((zeile) => (
                <ListRow
                  key={zeile.quelle.id}
                  zeit={zeile.quelle.tag}
                  titel={zeile.saetze.map((satz, nummer) => (
                    // Jeder Satz für sich: Sie stehen im Eintrag meist nicht nebeneinander.
                    <span
                      key={`${String(nummer)}-${satz}`}
                      className="block wrap-anywhere not-first:mt-1.5"
                    >
                      {satz}
                    </span>
                  ))}
                  meta={zeile.quelle.meta}
                  to={zeile.quelle.ziel}
                  pfeil
                />
              ))}
            </ListRows>
            <Kleingedrucktes>{AUSZUG_RECHTSSATZ}</Kleingedrucktes>
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            groesse="normal"
            className="self-start"
            disabled={auszuege.laeuft}
            onClick={() => void auszuege.zeigen()}
          >
            {auszuege.laeuft ? 'Auszüge werden gewählt …' : 'Auszüge zeigen'}
          </Button>
        )}
      </div>
    </Section>
  );
}
