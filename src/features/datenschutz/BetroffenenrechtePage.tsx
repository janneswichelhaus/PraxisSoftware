import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, DataList, DataRow } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { TextArea } from '@/components/ui/TextArea';
import { formatDate } from '@/lib/datum';
import { fetchPatient, fullName, type Patient } from '@/features/patients/api';
import { FotoHerausgabe } from '@/features/files/FotoHerausgabe';
import { fetchAufbewahrungsstand, fetchAuskunft, type Auskunft } from './api';
import { dateiname, sichereAlsDatei } from './datei';
import { AUSKUNFT_KATEGORIEN, kategorieLabel } from './kategorien';
import { paragraf } from '@/lib/begriffe';
import { ablehnungstext } from './vorlage';

/**
 * Betroffenenrechte zu einer Akte (OPS-006 minimal).
 *
 * Zwei Vorgänge, die im Alltag zusammen auftreten: Jemand verlangt Auskunft,
 * und jemand verlangt Löschung. Die Seite bedient beide — die eine mit einer
 * Kopie, die andere mit einem begründeten Entwurf. Das Verfahren drumherum,
 * einschließlich Fristen und Identitätsprüfung, steht in
 * `docs/datenschutz/betroffenenrechte.md`; diese Seite ersetzt es nicht.
 *
 * **Die Auskunft entsteht auf Knopfdruck und nicht beim Öffnen der Seite.**
 * Jede erstellte Kopie ist ein auditpflichtiger Export klinischer Daten
 * (ADR-010 Punkt 2); eine Seite, die beim Blättern exportiert, macht das
 * Protokoll wertlos. Der Aufbewahrungsstand darunter gibt keine Inhalte heraus
 * und lädt deshalb sofort.
 *
 * Sichtbar nur für `owner`. Die Rollenprüfung hier steuert die Darstellung;
 * verbindlich prüfen die beiden Serverfunktionen (ADR-004).
 */

function AuskunftErgebnis({ auskunft }: { auskunft: Auskunft }) {
  const abschnitte = Object.keys(AUSKUNFT_KATEGORIEN).filter(
    (key) => (auskunft.tabellen[key]?.length ?? 0) > 0,
  );
  const leer = Object.keys(AUSKUNFT_KATEGORIEN).length - abschnitte.length;

  return (
    <div className="mt-6">
      <Card>
        <DataList>
          {abschnitte.map((key) => (
            <DataRow key={key} label={kategorieLabel(key)}>
              {auskunft.tabellen[key]!.length} Einträge
            </DataRow>
          ))}
        </DataList>
        {leer > 0 ? (
          <p className="text-ink-subtle mt-4 text-sm">
            {leer} weitere Abschnitte sind in der Datei enthalten und leer.
          </p>
        ) : null}
      </Card>

      <div className="mt-4">
        <Button
          type="button"
          onClick={() =>
            sichereAlsDatei(
              dateiname(auskunft.patient_id, auskunft.erstellt_am),
              JSON.stringify(auskunft, null, 2),
            )
          }
        >
          Kopie als Datei sichern
        </Button>
      </div>

      <div className="mt-6">
        <h3 className="text-ink text-sm font-semibold">Nicht enthalten</h3>
        <ul className="text-ink-subtle mt-2 space-y-2 text-sm leading-relaxed">
          {auskunft.nicht_enthalten.map((hinweis) => (
            <li key={hinweis.was}>
              <span className="text-ink font-medium">{hinweis.was}:</span> {hinweis.grund}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AuskunftAbschnitt({ patient }: { patient: Patient }) {
  const mutation = useMutation({
    mutationFn: () => fetchAuskunft(patient.id),
  });

  return (
    <Section
      titel="Auskunft nach Art. 15 DSGVO"
      hinweis="Erstellt eine Kopie aller Daten dieser Akte. Jede Auskunft wird protokolliert."
    >
      <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Wird erstellt …' : 'Auskunft erstellen'}
      </Button>

      {mutation.isError ? (
        <div className="mt-4">
          <ErrorState
            title="Die Auskunft konnte nicht erstellt werden."
            description="Bitte erneut versuchen. Sind Sie noch angemeldet und berechtigt?"
          />
        </div>
      ) : null}

      {mutation.data ? <AuskunftErgebnis auskunft={mutation.data} /> : null}
    </Section>
  );
}

function LoeschverlangenAbschnitt({ patient }: { patient: Patient }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['datenschutz', 'aufbewahrung', patient.id],
    queryFn: () => fetchAufbewahrungsstand(patient.id),
  });

  return (
    <Section
      titel="Löschverlangen nach Art. 17 DSGVO"
      hinweis="Welche Fristen der Löschung entgegenstehen — und ein Entwurf der Antwort."
    >
      {isPending ? <LoadingState label="Aufbewahrungsstand wird geladen …" /> : null}
      {isError ? <ErrorState title="Der Aufbewahrungsstand konnte nicht geladen werden." /> : null}

      {data ? (
        <>
          <Card>
            <DataList>
              {data.klassen.map((klasse) => (
                <DataRow key={klasse.key} label={paragraf(klasse.legal_reference) || klasse.key}>
                  {klasse.frist_ende
                    ? `aufzubewahren bis ${formatDate(klasse.frist_ende)}`
                    : 'Frist läuft noch nicht'}
                </DataRow>
              ))}
              {data.loeschsperre ? (
                <DataRow label="Löschsperre">{data.loeschsperre.grund}</DataRow>
              ) : null}
            </DataList>
          </Card>

          <div className="mt-6">
            <TextArea
              label="Entwurf der Antwort"
              hint="Zum Kopieren. Briefkopf, Datum und Unterschrift kommen aus der Praxis — die Anwendung verschickt nichts."
              rows={18}
              readOnly
              value={ablehnungstext(fullName(patient), data)}
            />
          </div>
        </>
      ) : null}
    </Section>
  );
}

export function BetroffenenrechtePage() {
  const { patientId } = useParams();
  const { data, isPending, isError } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
  });

  if (isPending) return <LoadingState label="Akte wird geladen …" />;
  if (isError || !data) return <ErrorState title="Diese Akte konnte nicht geladen werden." />;

  return (
    <>
      <Rueckweg
        standard={`/patienten/${data.id}/stammdaten`}
        beschriftung="Zurück zu den Stammdaten"
      />

      <PageHeader
        title="Auskunft und Löschverlangen"
        description={`${fullName(data)} · Vorgänge der Praxisleitung nach dem Verfahren für Betroffenenrechte.`}
      />

      <AuskunftAbschnitt patient={data} />
      {/* DOK-006d: Der Inhalt der Fotos kommt nicht mit der Auskunft, sondern
          je Foto getrennt (ADR-017 Punkt 40). */}
      <FotoHerausgabe patientId={data.id} />
      <LoeschverlangenAbschnitt patient={data} />
    </>
  );
}
