import type { Katalogeintrag } from '../typen';

/**
 * Gruppe BW: Brustwirbelsäule und Haltung.
 *
 * Inhalt KI-erstellt und bis zur Durchsicht durch die Praxis ungeprüft
 * (ANN-386). Keine Diagnose als Auswahlkriterium (ADR-006 Punkt 10) - eine
 * Vorsicht steht als Satz unter `hinweise_praxis`.
 *
 * Nur die Ausgangsstellung (ANN-480), weil die Figur die Bewegung nicht
 * richtig zeigen kann (lieber die Stellung als ein falsches Bewegungsbild):
 * BW-02 (Schulterblätter hat die Figur nicht), BW-04 (Drehung des Rumpfs),
 * BW-09 (Arme quer vor dem Körper).
 *
 * Ohne Bild (lieber kein Bild als ein falsches): BW-06. Die Frontansicht
 * verkürzt die rechtwinklig gebeugten Hüften und Knie zu gestreckt wirkenden
 * Beinen; die aufeinanderliegenden Knie, die das Becken halten, wären nicht
 * zu erkennen.
 */
export const EINTRAEGE: readonly Katalogeintrag[] = [
  {
    schluessel: 'BW-01',
    version: '1.0.0',
    name: 'Aufrichtung im Sitz',
    alltagsname: 'Sich groß machen',
    region: 'bws',
    ziel: 'mobilitaet',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl'],
    niveau: 1,
    dosierung: { wiederholungen: 10, halten_s: 5, taeglich: 3 },
    anleitung: [
      'Setzen Sie sich auf einen Stuhl, ohne sich anzulehnen, die Füße stehen flach auf dem Boden.',
      'Lassen Sie den Rücken zuerst locker rund werden.',
      'Richten Sie sich dann langsam auf, als zöge ein Faden am Scheitel Sie nach oben.',
      'Halten Sie die aufrechte Haltung, atmen Sie ruhig weiter und lassen Sie wieder locker.',
    ],
    fehler: [
      'Das Kinn wird nach vorn oben geschoben, statt den Hinterkopf lang zu machen.',
      'Es entsteht ein starkes Hohlkreuz.',
      'Die Schultern ziehen zu den Ohren.',
    ],
    hinweise_praxis:
      'Gedacht als kurze Haltungspause mehrmals am Tag; 3-mal täglich ist nur der Startwert.',
    bild: {
      v: 1,
      basis: 'sitz',
      start: { rumpf: 6, huefte: [96, 96], wirbelsaeule: 34, kopf: -6 },
      ende: { rumpf: 0, huefte: [90, 90], wirbelsaeule: -4 },
      bewegung: ['kopf'],
    },
  },
  {
    schluessel: 'BW-02',
    version: '1.0.0',
    name: 'Skapula-Retraktion im Sitz',
    alltagsname: 'Schulterblätter nach hinten-unten ziehen',
    region: 'bws',
    ziel: 'kraft',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl'],
    niveau: 1,
    dosierung: { saetze: 2, wiederholungen: 10, halten_s: 3, taeglich: 1 },
    anleitung: [
      'Setzen Sie sich aufrecht auf einen Stuhl, die Hände liegen locker auf den Oberschenkeln.',
      'Ziehen Sie beide Schulterblätter sanft nach hinten und unten, als wollten Sie sie in die hinteren Hosentaschen stecken.',
      'Halten Sie die Spannung und atmen Sie dabei ruhig weiter.',
      'Lassen Sie die Schultern langsam wieder locker.',
    ],
    fehler: [
      'Die Schultern werden zu den Ohren hochgezogen.',
      'Der Rücken geht ins Hohlkreuz, statt nur die Schulterblätter zu bewegen.',
      'Das Kinn schiebt sich nach vorn.',
    ],
    bild: {
      v: 1,
      basis: 'sitz',
      start: { rumpf: 0 },
      ende: { rumpf: 0 },
    },
  },
  {
    schluessel: 'BW-03',
    version: '1.0.0',
    name: 'BWS-Extension über die Stuhllehne',
    alltagsname: 'Über die Lehne nach hinten strecken',
    region: 'bws',
    ziel: 'mobilitaet',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl'],
    niveau: 2,
    dosierung: { wiederholungen: 10, taeglich: 1 },
    anleitung: [
      'Setzen Sie sich auf einen Stuhl mit fester Lehne, der Rücken lehnt an.',
      'Verschränken Sie die Hände hinter dem Kopf, die Ellbogen zeigen nach vorn.',
      'Lehnen Sie den oberen Rücken langsam über die Oberkante der Lehne nach hinten und schauen Sie dabei leicht nach oben.',
      'Kommen Sie ruhig zurück in den aufrechten Sitz.',
    ],
    fehler: [
      'Die Bewegung kommt aus dem unteren Rücken, das Gesäß rutscht nach vorn.',
      'Der Kopf wird mit den Händen in den Nacken gezogen.',
      'Es wird mit Schwung nach hinten gelehnt.',
    ],
    hinweise_praxis:
      'Nur mit standfestem Stuhl, der nicht nach hinten kippen kann; die Lehne sollte etwa bis zur Mitte des Rückens reichen.',
    bild: {
      v: 1,
      basis: 'sitz',
      start: { rumpf: -6, huefte: [84, 84], haende: ['nacken', 'nacken'] },
      ende: {
        rumpf: -18,
        huefte: [72, 72],
        wirbelsaeule: -16,
        kopf: -8,
        haende: ['nacken', 'nacken'],
      },
      bewegung: ['kopf'],
    },
  },
  {
    schluessel: 'BW-04',
    version: '1.0.0',
    name: 'BWS-Rotation im Sitz',
    alltagsname: 'Oberkörper drehen',
    region: 'bws',
    ziel: 'mobilitaet',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl'],
    niveau: 1,
    dosierung: { wiederholungen: 10, je_seite: true, taeglich: 1 },
    anleitung: [
      'Setzen Sie sich aufrecht auf einen Stuhl, die Füße stehen fest auf dem Boden.',
      'Kreuzen Sie die Arme vor der Brust, die Hände liegen auf den Schultern.',
      'Drehen Sie den Oberkörper langsam zu einer Seite, so weit es angenehm geht; die Knie zeigen weiter nach vorn.',
      'Drehen Sie ruhig zurück zur Mitte und wechseln Sie die Seite.',
    ],
    fehler: [
      'Das Becken und die Knie drehen mit.',
      'Der Oberkörper neigt sich beim Drehen zur Seite.',
      'Die Drehung wird mit Schwung ans Ende geführt.',
    ],
    bild: {
      v: 1,
      basis: 'sitz_front',
      // Die Unterarme steigen zur Brustmitte; ganz gekreuzt bis zur
      // Gegenschulter lässt die Frontansicht nicht zu.
      start: { arm: [15, 15], ellbogen: [-144, -144] },
      ende: { arm: [15, 15], ellbogen: [-144, -144] },
    },
  },
  {
    schluessel: 'BW-05',
    version: '1.0.0',
    name: 'Rumpfseitneige im Sitz',
    alltagsname: 'Zur Seite neigen',
    region: 'bws',
    ziel: 'mobilitaet',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl'],
    niveau: 1,
    dosierung: { wiederholungen: 10, je_seite: true, taeglich: 1 },
    anleitung: [
      'Setzen Sie sich aufrecht auf einen Stuhl, die Füße stehen hüftbreit auf dem Boden.',
      'Stützen Sie eine Hand in die Hüfte und lassen Sie den anderen Arm locker hängen.',
      'Neigen Sie den Oberkörper langsam zur Seite des hängenden Arms, die Hand sinkt Richtung Boden.',
      'Richten Sie sich ruhig wieder auf; beide Gesäßhälften bleiben dabei auf dem Stuhl.',
      'Wechseln Sie nach allen Wiederholungen die Seite.',
    ],
    fehler: [
      'Eine Gesäßhälfte hebt vom Stuhl ab.',
      'Der Oberkörper kippt nach vorn, statt sich zur Seite zu neigen.',
    ],
    hinweise_praxis:
      'Bei Unsicherheit im Sitz einen Stuhl mit Armlehnen wählen oder seitlich sichern.',
    bild: {
      v: 1,
      basis: 'sitz_front',
      start: { haende: ['huefte', null] },
      ende: {
        rumpf: 15,
        bein: [-9, 21],
        knie: [90, 63.5],
        arm: [10, 20],
        haende: ['huefte', null],
      },
      bewegung: ['ellbogen_fern'],
    },
  },
  {
    schluessel: 'BW-06',
    version: '1.0.0',
    name: 'Offenes Buch (Rotation in Seitlage)',
    alltagsname: 'Arm in Seitlage aufklappen',
    region: 'bws',
    ziel: 'mobilitaet',
    ausgangsstellung: 'seitlage',
    hilfsmittel: ['kissen'],
    niveau: 2,
    dosierung: { wiederholungen: 10, je_seite: true, taeglich: 1 },
    anleitung: [
      'Legen Sie sich auf die Seite, der Kopf liegt auf einem Kissen, Hüften und Knie sind etwa rechtwinklig gebeugt.',
      'Strecken Sie beide Arme auf Schulterhöhe nach vorn, die Handflächen liegen aufeinander.',
      'Öffnen Sie den oberen Arm langsam in einem Bogen nach hinten und schauen Sie der Hand nach, die Knie bleiben aufeinander.',
      'Führen Sie den Arm ruhig wieder zurück und wechseln Sie nach allen Wiederholungen die Seite.',
    ],
    fehler: [
      'Das obere Knie rutscht vom unteren weg, das Becken dreht mit.',
      'Der Arm wird mit Schwung nach hinten geworfen.',
      'Der Kopf bleibt stehen, statt der Hand zu folgen.',
    ],
    hinweise_praxis:
      'Den Arm nur so weit öffnen, wie es ohne Schmerz in der Schulter geht; er muss den Boden nicht erreichen.',
  },
  {
    schluessel: 'BW-07',
    version: '1.0.0',
    name: 'Katzenbuckel und Pferderücken',
    alltagsname: 'Rücken rund und hohl machen',
    region: 'bws',
    ziel: 'mobilitaet',
    ausgangsstellung: 'vierfuessler',
    hilfsmittel: ['matte'],
    niveau: 2,
    dosierung: { wiederholungen: 10, taeglich: 1 },
    anleitung: [
      'Gehen Sie auf einer Matte in den Vierfüßlerstand: Hände unter den Schultern, Knie unter den Hüften.',
      'Machen Sie den Rücken langsam rund wie eine Katze und lassen Sie dabei den Kopf sinken.',
      'Lassen Sie den Rücken danach langsam etwas durchhängen und heben Sie den Blick leicht an.',
      'Wechseln Sie ruhig und fließend zwischen beiden Stellungen und atmen Sie dabei weiter.',
    ],
    fehler: [
      'Der Kopf wird im Hohlkreuz weit in den Nacken gelegt.',
      'Die Bewegung kommt nur aus dem unteren Rücken.',
      'Die Arme beugen sich, statt gestreckt zu bleiben.',
    ],
    hinweise_praxis:
      'Der Vierfüßlerstand ist für viele Ältere wegen Knien oder Handgelenken nicht möglich; dann eine Übung im Sitz aus derselben Gruppe wählen.',
    bild: {
      v: 1,
      basis: 'vierfuessler',
      unterlage: 'matte',
      start: { wirbelsaeule: 34, kopf: 30, huefte: [72.5, 72.5], schulter: [72.5, 72.5] },
      ende: { wirbelsaeule: -22, kopf: -8, huefte: [72.5, 72.5], schulter: [72.5, 72.5] },
      bewegung: ['kopf'],
    },
  },
  {
    schluessel: 'BW-08',
    version: '1.0.0',
    name: 'Rudern mit Theraband',
    alltagsname: 'Band zum Körper ziehen',
    region: 'bws',
    ziel: 'kraft',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['theraband', 'stuhl', 'tuerrahmen'],
    niveau: 2,
    dosierung: { saetze: 3, wiederholungen: 12 },
    anleitung: [
      'Befestigen Sie das Band in Brusthöhe an einem festen Halt vor Ihnen, etwa an einer Türklinke.',
      'Setzen Sie sich aufrecht auf einen Stuhl und fassen Sie die Enden mit gestreckten Armen.',
      'Ziehen Sie die Ellbogen dicht am Körper nach hinten und die Schulterblätter zueinander.',
      'Lassen Sie die Arme langsam und kontrolliert wieder nach vorn.',
    ],
    fehler: [
      'Der Oberkörper lehnt sich nach hinten, statt nur die Arme zu bewegen.',
      'Die Schultern ziehen zu den Ohren.',
      'Das Band schnellt zurück, statt langsam nachgelassen zu werden.',
    ],
    hinweise_praxis: 'Die Bandstärke steht in der Dosierung als Last, etwa „Theraband gelb“.',
    bild: {
      v: 1,
      basis: 'sitz',
      start: { rumpf: 0, schulter: [72, 68], ellbogen: [6, 6] },
      ende: { rumpf: 0, schulter: [-24, -28], ellbogen: [100, 100] },
      hilfsmittel: [
        { art: 'tuerrahmen', x: 92 },
        { art: 'band', von: 'tuerrahmen', nach: 'hand_nah' },
      ],
      bewegung: ['hand_nah'],
    },
  },
  {
    schluessel: 'BW-09',
    version: '1.0.0',
    name: 'Band auseinanderziehen (Pull-Apart)',
    alltagsname: 'Band vor der Brust auseinanderziehen',
    region: 'bws',
    ziel: 'kraft',
    ausgangsstellung: 'stand',
    hilfsmittel: ['theraband'],
    niveau: 2,
    dosierung: { saetze: 3, wiederholungen: 12 },
    anleitung: [
      'Stellen Sie sich aufrecht hin und fassen Sie das Band schulterbreit mit beiden Händen.',
      'Heben Sie die gestreckten Arme vor dem Körper auf Brusthöhe.',
      'Ziehen Sie das Band langsam auseinander, bis die Arme zur Seite zeigen, und führen Sie die Schulterblätter dabei zueinander.',
      'Lassen Sie die Arme langsam wieder zusammenkommen.',
    ],
    fehler: [
      'Die Schultern ziehen zu den Ohren.',
      'Der Rücken geht ins Hohlkreuz.',
      'Die Ellbogen beugen sich stark.',
    ],
    hinweise_praxis: 'Die Bandstärke steht in der Dosierung als Last, etwa „Theraband gelb“.',
    bild: {
      v: 1,
      basis: 'stand',
      // Das Band läge in der Seitenansicht als Punkt an der Hand; es steht unter
      // den Hilfsmitteln.
      start: { schulter: [90, 90], ellbogen: [0, 0] },
      ende: { schulter: [90, 90], ellbogen: [0, 0] },
    },
  },
  {
    schluessel: 'BW-10',
    version: '1.0.0',
    name: 'Wandengel (Arme an der Wand gleiten)',
    alltagsname: 'Arme an der Wand hochschieben',
    region: 'bws',
    ziel: 'mobilitaet',
    ausgangsstellung: 'stand',
    hilfsmittel: ['wand'],
    niveau: 2,
    dosierung: { saetze: 2, wiederholungen: 10, taeglich: 1 },
    anleitung: [
      'Stellen Sie sich mit dem Rücken an eine Wand, die Füße stehen eine Fußlänge davor.',
      'Legen Sie Hinterkopf, Rücken und Gesäß an die Wand und heben Sie die Arme seitlich, die Ellbogen sind rechtwinklig gebeugt.',
      'Schieben Sie die Arme langsam an der Wand nach oben, so weit es geht, ohne dass der Rücken sich löst.',
      'Gleiten Sie ruhig zurück in die Ausgangsstellung.',
    ],
    fehler: [
      'Der untere Rücken löst sich von der Wand, ein Hohlkreuz entsteht.',
      'Die Schultern ziehen zu den Ohren.',
      'Die Arme verlieren den Kontakt zur Wand.',
    ],
    hinweise_praxis:
      'Erreichen die Unterarme die Wand nicht, nur so weit bewegen, wie Rücken und Kopf an der Wand bleiben.',
    bild: {
      v: 1,
      basis: 'stand_front',
      start: { arm: [88, 88], ellbogen: [88, 88] },
      ende: { arm: [150, 150], ellbogen: [24, 24] },
      bewegung: ['hand_nah', 'hand_fern'],
    },
  },
  {
    schluessel: 'BW-11',
    version: '1.0.0',
    name: 'Brustmuskeldehnung im Türrahmen',
    alltagsname: 'Brust im Türrahmen dehnen',
    region: 'bws',
    ziel: 'dehnung',
    ausgangsstellung: 'stand',
    hilfsmittel: ['tuerrahmen'],
    niveau: 2,
    dosierung: { saetze: 3, dauer_s: 30, taeglich: 1 },
    anleitung: [
      'Stellen Sie sich in eine offene Tür.',
      'Legen Sie beide Unterarme an den Türrahmen, die Ellbogen sind etwa auf Schulterhöhe.',
      'Machen Sie einen kleinen Schritt nach vorn, bis Sie vorn an der Brust eine Dehnung spüren.',
      'Halten Sie die Dehnung ruhig, atmen Sie weiter und treten Sie dann wieder zurück.',
    ],
    fehler: [
      'Der Rücken geht ins Hohlkreuz, statt den Oberkörper aufrecht zu halten.',
      'Die Schultern ziehen nach oben.',
      'Der Schritt ist so groß, dass es in der Schulter zieht oder kribbelt.',
    ],
    hinweise_praxis:
      'Kribbeln oder Taubheit im Arm sind kein Dehngefühl: dann die Ellbogen tiefer legen oder den Schritt verkleinern.',
    bild: {
      v: 1,
      basis: 'stand_front',
      start: { arm: [88, 88], ellbogen: [90, 90] },
      ende: { arm: [88, 88], ellbogen: [90, 90] },
      hilfsmittel: [
        { art: 'tuerrahmen', x: -47 },
        { art: 'tuerrahmen', x: 47 },
      ],
    },
  },
  {
    schluessel: 'BW-12',
    version: '1.0.0',
    name: 'Armheben in Bauchlage (Y und T)',
    alltagsname: 'In Bauchlage Arme anheben',
    region: 'bws',
    ziel: 'kraft',
    ausgangsstellung: 'bauchlage',
    hilfsmittel: ['kissen', 'matte'],
    niveau: 3,
    dosierung: { saetze: 2, wiederholungen: [8, 10] },
    anleitung: [
      'Legen Sie sich auf den Bauch, ein flaches Kissen liegt unter dem Bauch, die Stirn ruht auf der Unterlage.',
      'Strecken Sie die Arme schräg nach vorn aus wie ein Y, die Daumen zeigen nach oben.',
      'Heben Sie beide Arme ein kleines Stück von der Unterlage ab, halten Sie kurz und legen Sie sie langsam ab.',
      'Üben Sie danach genauso mit seitlich ausgestreckten Armen wie ein T.',
    ],
    fehler: [
      'Der Kopf wird angehoben und in den Nacken gelegt.',
      'Die Schultern ziehen zu den Ohren.',
      'Der untere Rücken geht ins Hohlkreuz.',
    ],
    hinweise_praxis:
      'Bauchlage ist für viele Hochbetagte nicht möglich (Atmung, Herz, Endoprothese); dann im Sitz üben, etwa „Rudern mit Theraband“.',
    bild: {
      v: 1,
      basis: 'bauchlage',
      unterlage: 'matte',
      start: { schulter: [176, 176] },
      ende: { schulter: [192, 192] },
      hilfsmittel: [{ art: 'kissen', an: 'becken' }],
      bewegung: ['ellbogen_nah'],
    },
  },
];
