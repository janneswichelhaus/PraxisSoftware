import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';

/**
 * Was ein abgewiesenes Einladen bedeutet, in Sätzen der Praxis - am Zugang
 * (`StaffAccountSection`) und beim Einrichten (`NewStaffMemberPage`,
 * Überholung 6). Schlüssel sind die Probleme aus `EinladungsError`.
 */
export const problemTexte: Record<string, string> = {
  account_already_exists: 'Für diese Person besteht bereits ein Zugang.',
  email_already_in_use: 'Diese E-Mail-Adresse gehört bereits zu einem Zugang dieser Praxis.',
  bereits_eingeladen: 'Für diese Person steht bereits eine Einladung offen.',
  unbekannt: `Die Einladung konnte nicht angelegt werden. ${VERBINDUNG_PRUEFEN}`,
};
