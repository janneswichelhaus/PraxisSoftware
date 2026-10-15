import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Feldgruppe } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import { FLOTTE_SCHLUESSEL, fetchFleet, flotteSchluessel, takeKey, type Fleet } from './api';
import { montagDerWoche } from './format';
import { radMitStandort } from './rad';

const ZUR_FLOTTE = '/betrieb/flotte';

/**
 * Einen Schlüssel eintragen - für sich oder für eine andere Person
 * (FLT-EPIC-001). Den eigenen nimmt man meist mit einem Tipp an der Zeile der
 * Radflotte; diese Seite ist für alles andere: jemand nimmt den Schlüssel für
 * eine Kollegin mit, oder das eigene Konto hat keinen Mitarbeiterdatensatz.
 *
 * Die Person kommt aus dem Mitarbeiterstamm, nicht als Freitext - der
 * Schlüsselstand hinge sonst an einer richtigen Selbstauskunft. Angeboten
 * werden nur Räder, deren Schlüssel im Tresor liegt und die nicht gesperrt
 * sind; der Server prüft es ebenso. Kein Rad ist vorgewählt (VOR-18), außer
 * es kommt aus der Adresszeile (`?rad=`).
 */
export function KeyPage({ user }: { user: CurrentUser }) {
  const montag = montagDerWoche(todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin'));
  const abfrage = useQuery({
    queryKey: flotteSchluessel(montag),
    queryFn: () => fetchFleet(montag),
    retry: false,
  });

  return (
    <>
      <Rueckweg standard={ZUR_FLOTTE} beschriftung="Zurück zur Radflotte" />
      <PageHeader title="Schlüssel eintragen" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Radflotte wird geladen …"
        fehler="Die Radflotte konnte nicht geladen werden."
        inKarte
      >
        {(flotte) => <Eintragung flotte={flotte} />}
      </Abfragezustand>
    </>
  );
}

function Eintragung({ flotte }: { flotte: Fleet }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [parameter] = useSearchParams();
  const frei = flotte.bikes.filter((rad) => !rad.key && !rad.block);
  const vorgabe = parameter.get('rad');
  const [radId, setRadId] = useState(() =>
    vorgabe && frei.some((rad) => rad.id === vorgabe) ? vorgabe : '',
  );
  const [personId, setPersonId] = useState(flotte.my_staff_member_id ?? '');

  const eintragen = useMutation({
    mutationFn: () => takeKey(radId, personId === flotte.my_staff_member_id ? null : personId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      const rad = flotte.bikes.find((eintrag) => eintrag.id === radId);
      const person =
        personId === flotte.my_staff_member_id
          ? 'Ihnen'
          : (flotte.staff.find((eintrag) => eintrag.id === personId)?.name ?? 'der Person');
      void navigate(ZUR_FLOTTE, {
        state: { meldung: `Schlüssel von ${rad?.name ?? 'dem Rad'} bei ${person} eingetragen.` },
      });
    },
  });

  if (frei.length === 0) {
    return (
      <EmptyState
        inKarte
        title="Kein Schlüssel liegt im Tresor."
        description="Alle Räder sind unterwegs oder in Reparatur."
        aktion={
          <ButtonLink to={ZUR_FLOTTE} variant="secondary">
            Zur Radflotte
          </ButtonLink>
        }
      />
    );
  }

  const fehlt = !radId ? 'Erst ein Rad wählen.' : !personId ? 'Erst eine Person wählen.' : null;

  return (
    <div className="max-w-formular">
      <Feldgruppe>
        <Select label="Rad" value={radId} onChange={(event) => setRadId(event.target.value)}>
          <option value="">Bitte wählen …</option>
          {frei.map((rad) => (
            <option key={rad.id} value={rad.id}>
              {radMitStandort(rad, flotte)}
            </option>
          ))}
        </Select>
        <Select
          label="Schlüssel bei"
          value={personId}
          onChange={(event) => setPersonId(event.target.value)}
        >
          <option value="">Bitte wählen …</option>
          {flotte.staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.id === flotte.my_staff_member_id ? `${person.name} (Sie)` : person.name}
            </option>
          ))}
        </Select>
      </Feldgruppe>
      {eintragen.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {eintragen.error.message}
        </Statusmeldung>
      ) : null}
      <Formularfuss zusatz={fehlt ? <span id="schluessel-fehlt">{fehlt}</span> : undefined}>
        <Button
          onClick={() => eintragen.mutate()}
          disabled={Boolean(fehlt) || eintragen.isPending}
          aria-describedby={fehlt ? 'schluessel-fehlt' : undefined}
        >
          {eintragen.isPending ? 'Wird eingetragen …' : 'Schlüssel eintragen'}
        </Button>
        <ButtonLink to={ZUR_FLOTTE} variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>
    </div>
  );
}
