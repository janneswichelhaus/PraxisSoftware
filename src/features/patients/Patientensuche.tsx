import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { SearchCombobox, type Suchtreffer } from '@/components/ui/SearchCombobox';
import { SUCHE_MINDESTLAENGE, formatDate, searchPatients, type PatientSearchHit } from './api';

/**
 * Patientensuche von jeder Seite (UX-004, IDEA-PRX-020).
 *
 * Vom Kalender und von der Übersicht führte bisher kein Weg zu einer Akte, ohne
 * über die Kartei zu gehen. Das Feld steht deshalb in der Kopfleiste - dort,
 * wo es unabhängig von der Seite ist.
 *
 * Gesucht wird serverseitig (`search_patients`): erst ab drei Zeichen, mit
 * harter Obergrenze, und geliefert werden nur Name, Geburtsdatum und
 * Versorgungsstatus. Ein Suchfeld, das den gesamten Bestand in den Browser
 * lädt und dort filtert, wäre bequemer zu bauen und das Gegenteil von
 * Datenminimierung (ADR-004).
 */

/** Wartezeit, bis eine Eingabe zu einer Anfrage wird. */
const TIPPPAUSE_MS = 250;

function alsTreffer(patient: PatientSearchHit): Suchtreffer {
  return {
    id: patient.id,
    bezeichnung: `${patient.given_name} ${patient.family_name}`,
    // Das Geburtsdatum ist das Merkmal, an dem sich zwei Namensgleiche
    // unterscheiden lassen - dafür steht es hier und für nichts sonst.
    zusatz: patient.date_of_birth ? `geboren ${formatDate(patient.date_of_birth)}` : undefined,
    abzeichen:
      patient.status === 'inactive' ? <Badge ton="neutral">Nicht in Versorgung</Badge> : undefined,
  };
}

export function Patientensuche({
  label = 'Patient:in suchen',
  labelSichtbar = false,
  onAuswahl,
}: {
  label?: string;
  labelSichtbar?: boolean;
  /**
   * Was mit dem Treffer geschieht. Ohne Angabe öffnet sich die Akte - das ist
   * der Zweck des Feldes in der Kopfleiste. Beim Anlegen eines Termins wählt
   * dasselbe Feld dagegen die Person für das Formular aus (UX-005).
   */
  onAuswahl?: (patientId: string) => void;
} = {}) {
  const navigate = useNavigate();
  const [eingabe, setEingabe] = useState('');
  const [begriff, setBegriff] = useState('');

  // Eine Anfrage je Tipppause statt je Tastendruck. Bei einem Suchfeld in der
  // Kopfleiste ist das der Unterschied zwischen einer und zwanzig Anfragen.
  useEffect(() => {
    const zeit = setTimeout(() => setBegriff(eingabe.trim()), TIPPPAUSE_MS);
    return () => clearTimeout(zeit);
  }, [eingabe]);

  const langGenug = begriff.length >= SUCHE_MINDESTLAENGE;

  const { data, isFetching, isError } = useQuery({
    queryKey: ['patient-search', begriff],
    queryFn: () => searchPatients(begriff),
    enabled: langGenug,
    retry: false,
    // Ein Suchergebnis ist eine Momentaufnahme; es soll nicht im Hintergrund
    // nachgeladen werden, während jemand weitertippt.
    staleTime: 30_000,
  });

  const treffer = langGenug ? (data ?? []).map(alsTreffer) : [];

  function zustand(): string | undefined {
    if (eingabe.trim().length === 0) return undefined;
    if (!langGenug) return `Mindestens ${SUCHE_MINDESTLAENGE} Zeichen.`;
    if (isFetching && !data) return 'Wird gesucht …';
    // Ein Fehlschlag ist kein leeres Ergebnis (UX-012). Vorher stand in beiden
    // Fällen „Kein Treffer." - wer die Verbindung verloren hatte, legte die
    // Akte deshalb ein zweites Mal an. Die Unterscheidung ist ein Satz und
    // verhindert genau das.
    if (isError) {
      return 'Die Suche ist fehlgeschlagen. Das heißt nicht, dass es keinen Treffer gibt – bitte erneut versuchen.';
    }
    if (treffer.length === 0) return 'Kein Treffer.';
    return undefined;
  }

  return (
    <SearchCombobox
      label={label}
      labelSichtbar={labelSichtbar}
      placeholder="Name suchen …"
      wert={eingabe}
      onChange={setEingabe}
      treffer={treffer}
      zustand={zustand()}
      onAuswahl={(gewaehlt) => {
        setEingabe('');
        setBegriff('');
        if (onAuswahl) {
          onAuswahl(gewaehlt.id);
          return;
        }
        void navigate(`/patienten/${gewaehlt.id}`);
      }}
    />
  );
}
