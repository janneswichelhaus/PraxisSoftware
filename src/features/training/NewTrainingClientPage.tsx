import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import { alsFormularfehler } from '@/lib/formularfehler';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import {
  TRAINING_BESCHRIFTUNG,
  TRAINING_FELDER,
  createTrainingClient,
  findPossibleTrainingDuplicates,
  leereTrainingWerte,
  startTrainingForPerson,
  trainingFeldId,
  trainingWerteSchema,
  type TrainingDuplicate,
  type TrainingFeld,
  type TrainingWerte,
} from './api';
import { TrainingClientFields } from './TrainingClientFields';
import { TRAINING_ANLEGEN } from './TrainingClientsPage';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

function geboren(treffer: TrainingDuplicate): string {
  return treffer.date_of_birth ? `, geb. ${formatDate(treffer.date_of_birth)}` : '';
}

/**
 * Eine Trainingskund:in entsteht - ohne Akte (TRN-002, ADR-021 Punkt 2).
 *
 * Vor dem ersten Anlegen fragt die Seite nach möglichen Dubletten (Regel wie
 * in der Kartei, ANN-145). Was zurückkommt, bestimmt der Server nach Rolle
 * (ANN-173):
 *
 *   * Eine Trainingskund:in gleichen Namens sieht jede Rolle des Bereichs -
 *     der Weg führt zu ihr, statt eine zweite anzulegen.
 *   * Eine Patient:in sehen nur owner und Büro, die beide Bereiche kennen.
 *     „Training für diese Person beginnen" hängt das Verhältnis an die
 *     vorhandene Person - ohne zweite Personenzeile, ohne Daten aus der Akte.
 *
 * Die Trainingsbetreuung bekommt nie einen Treffer aus der Akte; die Seite
 * kann ihn deshalb auch nicht zeigen.
 */
export function NewTrainingClientPage() {
  const [werte, setWerte] = useState<TrainingWerte>(leereTrainingWerte);
  const [fehler, setFehler] = useState<Partial<Record<TrainingFeld, string>>>({});
  const [dubletten, setDubletten] = useState<TrainingDuplicate[] | null>(null);
  const [geprueftFuer, setGeprueftFuer] = useState<string | null>(null);
  const [pruefung, setPruefung] = useState<'bereit' | 'laeuft'>('bereit');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const ungespeichert = TRAINING_FELDER.some((feld) => werte[feld] !== leereTrainingWerte[feld]);
  const { freigeben, schutz } = useTextverlustschutz({ ungespeichert, texte: EINGABETEXTE });

  async function fertig(id: string) {
    await queryClient.invalidateQueries({ queryKey: ['training-clients'] });
    freigeben();
    void navigate(`/training/${id}`, { replace: true });
  }

  const anlegen = useMutation({ mutationFn: createTrainingClient, onSuccess: fertig });
  const anbinden = useMutation({
    mutationFn: (personId: string) => startTrainingForPerson(personId, werte),
    onSuccess: fertig,
  });
  const beschaeftigt = anlegen.isPending || anbinden.isPending || pruefung === 'laeuft';

  function setzen(feld: TrainingFeld, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    if (feld === 'given_name' || feld === 'family_name' || feld === 'date_of_birth') {
      setDubletten(null);
    }
  }

  async function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (beschaeftigt) return;

    const ergebnis = trainingWerteSchema.safeParse(werte);
    if (!ergebnis.success) {
      const gefunden: Partial<Record<TrainingFeld, string>> = {};
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as TrainingFeld | undefined;
        if (feld && !gefunden[feld]) gefunden[feld] = problem.message;
      }
      setFehler(gefunden);
      return;
    }
    setFehler({});

    // Ein Hinweis, kein Tor: Scheitert die Prüfung, wird angelegt. Wer den
    // Hinweis gesehen hat, wird mit denselben Angaben nicht erneut gefragt.
    const schluessel = `${werte.given_name}|${werte.family_name}|${werte.date_of_birth}`;
    if (geprueftFuer !== schluessel) {
      setPruefung('laeuft');
      try {
        const treffer = await findPossibleTrainingDuplicates(
          werte.given_name,
          werte.family_name,
          werte.date_of_birth || null,
        );
        setGeprueftFuer(schluessel);
        if (treffer.length > 0) {
          setDubletten(treffer);
          return;
        }
      } catch {
        // Ohne Prüfung weiter.
      } finally {
        setPruefung('bereit');
      }
    }
    anlegen.mutate(werte);
  }

  const trainingTreffer = (dubletten ?? []).filter((treffer) => treffer.kind === 'training');
  const aktenTreffer = (dubletten ?? []).filter((treffer) => treffer.kind === 'patient');

  return (
    <>
      <Rueckweg standard="/training" />

      {/* Der Satz zu den Sternchen erklärte das Formular (UX-005g); „ohne
          Patientenakte" bleibt - er sagt, was hier nicht entsteht (ADR-021
          Punkt 2). */}
      <PageHeader
        title={`${BEGRIFFE.trainingskundIn} anlegen`}
        description="Für das Personal Training – ohne Patientenakte."
      />

      <form onSubmit={(event) => void absenden(event)} noValidate className="max-w-formular">
        <Fehlerzusammenfassung
          fehler={alsFormularfehler(TRAINING_FELDER, TRAINING_BESCHRIFTUNG, fehler, trainingFeldId)}
        />

        <TrainingClientFields werte={werte} fehler={fehler} onChange={setzen} />

        {schutz}

        {dubletten && dubletten.length > 0 ? (
          // Ein Abschnitt wie die übrigen; die Warnung trägt die Linie links
          // in der Farbe der Warnung (Leitfaden L2: Meldung als Zeile).
          <div role="alert" className="mt-8">
            <Section titel="Vielleicht schon bekannt">
              <div className="border-warnung bg-warnung-soft border-l-4 px-4 py-3">
                <p className="text-ink text-sm">
                  Gleicher Nachname und gleiches Geburtsdatum oder gleicher Vorname.
                </p>
                {aktenTreffer.length > 0 ? (
                  <p className="text-ink mt-2 text-sm">
                    In der Behandlung bekannt. Ist es dieselbe Person, bekommt sie ihr Training ohne
                    zweiten Eintrag – mit Kontakt und Vertragsbeginn aus diesem Formular; aus der
                    Akte wird nichts übernommen.
                  </p>
                ) : null}
              </div>

              {trainingTreffer.length > 0 || aktenTreffer.length > 0 ? (
                <ListRows className="mt-3">
                  {trainingTreffer.map((treffer) => (
                    <ListRow
                      key={treffer.person_id}
                      to={`/training/${treffer.training_relationship_id ?? ''}`}
                      titel={`${treffer.given_name} ${treffer.family_name}${geboren(treffer)} – schon im Training`}
                    />
                  ))}
                  {/* Eine eigene Zeile statt des `aktion`-Platzes der
                      ListRow: Der lange Knopf rückt am Telefon unter den
                      Namen, statt ihn auf wenige Zeichen zu drücken. */}
                  {aktenTreffer.map((treffer) => (
                    <li
                      key={treffer.person_id}
                      className="border-line flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t py-2 first:border-t-0"
                    >
                      <span className="text-ink text-base font-semibold">
                        {treffer.given_name} {treffer.family_name}
                        {geboren(treffer)}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        groesse="kompakt"
                        disabled={beschaeftigt}
                        onClick={() => anbinden.mutate(treffer.person_id)}
                      >
                        Training für diese Person beginnen
                      </Button>
                    </li>
                  ))}
                </ListRows>
              ) : null}

              <p className="text-ink mt-3 text-sm">
                Eine andere Person mit ähnlichen Angaben? Dann „{TRAINING_ANLEGEN}“ noch einmal
                tippen.
              </p>
            </Section>
          </div>
        ) : null}

        <Formularfuss>
          <Button type="submit" disabled={beschaeftigt}>
            {anlegen.isPending
              ? 'Wird angelegt …'
              : pruefung === 'laeuft'
                ? 'Wird geprüft …'
                : TRAINING_ANLEGEN}
          </Button>
          <ButtonLink to="/training" variant="quiet">
            Abbrechen
          </ButtonLink>
        </Formularfuss>
      </form>

      {anlegen.isError || anbinden.isError ? (
        <Hinweisfenster
          titel={
            anbinden.isError
              ? 'Das Training konnte nicht begonnen werden.'
              : `Die ${BEGRIFFE.trainingskundIn} konnte nicht angelegt werden.`
          }
          onSchliessen={() => {
            anlegen.reset();
            anbinden.reset();
          }}
        >
          Die Eingaben stehen noch im Formular. Bitte die Verbindung prüfen und erneut versuchen.
        </Hinweisfenster>
      ) : null}

      <Kleingedrucktes className="mt-8">
        Erfasst werden Name, Kontakt und Vertrag. Angaben zur Gesundheit gehören nicht hierher – sie
        brauchen eine eigene Einwilligung und kommen später.
      </Kleingedrucktes>
    </>
  );
}
