import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Patientensuche } from '@/features/patients/Patientensuche';
import { appointmentTypeLabels, leseTerminVorbelegung, schreibeTerminVorbelegung } from './api';

/**
 * Termin anlegen, wenn die Zeit schon feststeht und die Person noch nicht
 * (UX-005).
 *
 * Der Einstieg über die Akte kennt den Patienten und fragt nach der Zeit. Der
 * Tap auf eine freie Stelle im Kalender kennt die Zeit und fragt nach dem
 * Patienten - dieselbe Aufgabe von der anderen Seite. Deshalb eine eigene,
 * sehr kleine Seite und kein zweiter Modus im Terminformular: Was hier
 * passiert, ist eine einzige Auswahl.
 *
 * Danach geht es in dasselbe Formular wie sonst, mit derselben Vorbelegung in
 * der Adresszeile. Es gibt bewusst keinen zweiten Anlageweg - `create_appointment`
 * bleibt die eine Serverfunktion, und das Formular bleibt die eine Stelle, an
 * der Raster, Arbeitszeit und Ortslogik zusammenkommen.
 */
export function NewAppointmentStartPage() {
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const vorbelegung = leseTerminVorbelegung(suche);
  const anhang = schreibeTerminVorbelegung(vorbelegung);

  const zeit =
    vorbelegung.beginn && vorbelegung.ende
      ? `${vorbelegung.beginn}–${vorbelegung.ende} Uhr`
      : (vorbelegung.beginn ?? null);

  return (
    <>
      <PageHeader
        title="Termin anlegen"
        description="Zuerst die Patient:in wählen. Zeit und behandelnde Person sind schon vorbelegt."
      />

      <Section titel="Vorbelegung">
        <DetailList>
          <DetailRow label="Datum">{vorbelegung.datum ?? 'noch offen'}</DetailRow>
          <DetailRow label="Zeit">{zeit ?? 'noch offen'}</DetailRow>
          <DetailRow label="Terminart">
            {vorbelegung.art ? appointmentTypeLabels[vorbelegung.art] : 'noch offen'}
          </DetailRow>
        </DetailList>
        <p className="text-ink-subtle mt-3 max-w-prose text-xs leading-relaxed">
          Alles davon lässt sich im nächsten Schritt ändern. Verbindlich geprüft werden Raster,
          Arbeitszeit und Überschneidung erst beim Speichern.
        </p>
      </Section>

      <Section titel="Patient:in">
        <div className="max-w-md">
          <Patientensuche
            label="Patient:in suchen"
            labelSichtbar
            onAuswahl={(patientId) => void navigate(`/patienten/${patientId}/termine/neu${anhang}`)}
          />
        </div>
      </Section>
    </>
  );
}
