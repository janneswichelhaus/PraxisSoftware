import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { useIstVerbunden } from '@/app/verbindung';
import {
  createTreatmentNoteAddendum,
  fetchTreatmentDocumentation,
} from '@/features/documentation/api';
import { textUebergeben } from '@/features/documentation/uebernahme';
import type { CurrentUser } from '@/features/session/types';
import { AufDemGeraet, type Serverwege } from './AufDemGeraet';

/**
 * „Auf dem Gerät" in der Anwendung (OFF-002): Tagesplan und Entwürfe des
 * Diensttelefons, mit den Wegen aus ANN-320 für einen Konflikt.
 */
export function AufDemGeraetPage({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const verbunden = useIstVerbunden();
  const serverwege = useMemo<Serverwege>(
    () => ({
      zurDokumentation: (terminId) => `/termine/${terminId}/dokumentation`,
      alsNachtrag: async (terminId, noteId, text) => {
        const neu = await createTreatmentNoteAddendum(noteId, text);
        await queryClient.invalidateQueries({ queryKey: ['treatment-note', terminId] });
        void navigate(`/termine/${terminId}/dokumentation/${neu}/bearbeiten`, {
          state: { meldung: 'Ihr Text ist als Nachtrag-Entwurf gesichert.' },
        });
      },
      fassungLesen: async (terminId) =>
        (await fetchTreatmentDocumentation(terminId)).primary?.content ?? null,
      inKorrektur: (terminId, noteId, text) => {
        textUebergeben(noteId, text);
        void navigate(`/termine/${terminId}/dokumentation/${noteId}/korrektur`);
      },
    }),
    [navigate, queryClient],
  );
  return (
    <>
      <PageHeader title="Auf dem Gerät" description="Tagesplan und Entwürfe auf diesem Telefon." />
      <div className="max-w-spalte">
        <AufDemGeraet
          besitzer={user.profile.id}
          serverwege={serverwege}
          ohneVerbindung={!verbunden}
        />
      </div>
    </>
  );
}
