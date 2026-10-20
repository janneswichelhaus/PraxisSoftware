import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { roleLabel } from '@/components/ui/roleLabels';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TEAMCHAT_KEY, fetchPersonenkarte, oeffneDirekt, personenkarteKey } from './api';
import { gespraechPfad } from './pfade';
import { Teambild } from './Teambild';

/**
 * Die Karte einer Person im Teamchat (TEAM-009, ANN-668), wie bei Slack ein
 * Tipp auf ihr Bild: groß das Bild, der Name, ihre Rollen in der Praxis und
 * „Direktnachricht“ - an der eigenen Karte der Weg zu Bild und Farbe.
 *
 * Bewusst nicht darauf (§20): Anwesenheit, „zuletzt aktiv“, Status,
 * Telefonnummer, Mail. Die Karte sagt, wer jemand in der Praxis ist, nicht
 * was sie tut.
 */
export function Personenkarte({
  staffMemberId,
  name,
  onSchliessen,
  onGeoeffnet,
}: {
  staffMemberId: string;
  /** Der Name, wie er an der Stelle stand - der Titel, bevor die Karte lädt. */
  name: string | null;
  onSchliessen: () => void;
  /** Nach „Direktnachricht“: schließt, was unter der Karte offen ist (Details). */
  onGeoeffnet?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const karte = useQuery({
    queryKey: personenkarteKey(staffMemberId),
    queryFn: () => fetchPersonenkarte(staffMemberId),
    staleTime: 300_000,
  });
  const schreiben = useMutation({
    mutationFn: () => oeffneDirekt(staffMemberId),
    onSuccess: async (kanalId) => {
      await queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
      onSchliessen();
      onGeoeffnet?.();
      void navigate(gespraechPfad({ id: kanalId, kind: 'direct' }));
    },
  });
  const titel = karte.data?.name ?? name ?? 'Ehemaliges Teammitglied';

  return (
    <Dialogfenster titel={titel} onSchliessen={onSchliessen}>
      <div className="flex flex-col items-start gap-4">
        <Teambild staffMemberId={staffMemberId} name={titel} groesse="gross" />
        <Abfragezustand
          abfrage={karte}
          laden="Die Karte wird geladen …"
          fehler="Die Personenkarte konnte nicht geladen werden."
        >
          {(daten) => (
            <p className="text-ink text-liste">
              {daten.active
                ? daten.roles.map(roleLabel).join(' · ') || 'Im Team'
                : 'Nimmt nicht am Teamchat teil.'}
            </p>
          )}
        </Abfragezustand>
      </div>
      {schreiben.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {schreiben.error.message}
        </Statusmeldung>
      ) : null}
      <Formularfuss>
        {karte.data?.own ? (
          // Die einzige Handlung der eigenen Karte ist ihr Hauptknopf (Design-Review).
          <ButtonLink to="/mein-konto">Bild und Farbe ändern</ButtonLink>
        ) : karte.data?.active ? (
          <Button disabled={schreiben.isPending} onClick={() => schreiben.mutate()}>
            Direktnachricht
          </Button>
        ) : null}
        <Button variant="quiet" onClick={onSchliessen}>
          Schließen
        </Button>
      </Formularfuss>
    </Dialogfenster>
  );
}
