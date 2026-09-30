// Projects shown on the public site. ALL ARE FICTITIOUS: names, places, amounts and yields are
// illustrative examples, labelled as such on the page. To show real projects later, replace the
// entries below (the page reads nothing else), and have the texts reviewed before publishing.
import type { ProjectKind } from './project-illustration';

export type ProjectStatus = 'open' | 'upcoming' | 'closed';

export interface ProjectText {
  name: string;
  location: string;
  /** Two or three short lines: what the issuance finances. */
  description: string;
}

export interface ExampleProject {
  id: string;
  kind: ProjectKind;
  status: ProjectStatus;
  /** Nominal amount of the issuance, in euros, as an exact decimal. */
  amount: string;
  /** Illustrative target annual rate, as a fraction ("0.055" = 5.5 %). */
  targetRate: string;
  termMonths: number;
  /**
   * Optional photo stored in `public/` (WebP, about 800 × 400), shown instead of the drawing.
   * Only with a licence allowing this use.
   */
  image?: { src: string; alt: Record<'en-GB' | 'fr-FR', string> };
  text: Record<'en-GB' | 'fr-FR', ProjectText>;
}

export const EXAMPLE_PROJECTS: readonly ExampleProject[] = [
  {
    id: 'garonne-solar-roofs',
    kind: 'solar',
    status: 'open',
    amount: '6000000',
    targetRate: '0.055',
    termMonths: 60,
    text: {
      'en-GB': {
        name: 'Garonne Solar Roofs',
        location: 'Toulouse area, France',
        description:
          'Solar panels on the roofs of 14 logistics warehouses, 9.8 MWp in total. The electricity is sold under a long-term contract.',
      },
      'fr-FR': {
        name: 'Garonne Solar Roofs',
        location: 'Agglomération de Toulouse, France',
        description:
          'Panneaux solaires sur les toits de 14 entrepôts logistiques, 9,8 MWc au total. L’électricité est vendue sous contrat de long terme.',
      },
    },
  },
  {
    id: 'lys-logistics-park',
    kind: 'logistics',
    status: 'open',
    amount: '8500000',
    targetRate: '0.07',
    termMonths: 36,
    text: {
      'en-GB': {
        name: 'Lys Logistics Park',
        location: 'Lille area, France',
        description:
          'Construction of an 18,000 m² last-mile warehouse, pre-let to a regional carrier, with solar panels on the roof.',
      },
      'fr-FR': {
        name: 'Lys Logistics Park',
        location: 'Métropole lilloise, France',
        description:
          'Construction d’un entrepôt du dernier kilomètre de 18 000 m², pré-loué à un transporteur régional, toiture solaire.',
      },
    },
  },
  {
    id: 'alsace-retrofit',
    kind: 'renovation',
    status: 'open',
    amount: '3200000',
    targetRate: '0.0475',
    termMonths: 84,
    text: {
      'en-GB': {
        name: 'Alsace Retrofit Notes',
        location: 'Strasbourg, France',
        description:
          'Energy renovation of 220 homes: insulation, heat pumps and solar hot water, repaid from the energy savings.',
      },
      'fr-FR': {
        name: 'Alsace Retrofit Notes',
        location: 'Strasbourg, France',
        description:
          'Rénovation énergétique de 220 logements : isolation, pompes à chaleur et eau chaude solaire, remboursée par les économies d’énergie.',
      },
    },
  },
  {
    id: 'mistral-wind-repowering',
    kind: 'wind',
    status: 'upcoming',
    amount: '12000000',
    targetRate: '0.06',
    termMonths: 96,
    text: {
      'en-GB': {
        name: 'Mistral Wind Repowering',
        location: 'Aude, France',
        description:
          'Six older turbines of an existing wind farm replaced by four more powerful ones, on the same site.',
      },
      'fr-FR': {
        name: 'Mistral Wind Repowering',
        location: 'Aude, France',
        description:
          'Remplacement de six anciennes éoliennes d’un parc existant par quatre machines plus puissantes, sur le même site.',
      },
    },
  },
  {
    id: 'loire-riverside-homes',
    kind: 'residential',
    status: 'upcoming',
    amount: '5400000',
    targetRate: '0.08',
    termMonths: 30,
    text: {
      'en-GB': {
        name: 'Loire Riverside Homes',
        location: 'Nantes, France',
        description:
          'Construction of 64 apartments near the Loire. Works start once a pre-sale threshold is reached.',
      },
      'fr-FR': {
        name: 'Loire Riverside Homes',
        location: 'Nantes, France',
        description:
          'Construction de 64 logements près de la Loire. Les travaux démarrent une fois un seuil de précommercialisation atteint.',
      },
    },
  },
  {
    id: 'hanse-charge-network',
    kind: 'charging',
    status: 'upcoming',
    amount: '4000000',
    targetRate: '0.065',
    termMonths: 72,
    text: {
      'en-GB': {
        name: 'Hanse Charge Network',
        location: 'Hamburg area, Germany',
        description:
          '120 fast-charging points along regional roads and in retail car parks, paid per charge.',
      },
      'fr-FR': {
        name: 'Hanse Charge Network',
        location: 'Région de Hambourg, Allemagne',
        description:
          '120 points de recharge rapide le long de routes régionales et sur des parkings commerciaux, payés à la recharge.',
      },
    },
  },
  {
    id: 'rhone-storage-hub',
    kind: 'storage',
    status: 'closed',
    amount: '7500000',
    targetRate: '0.0625',
    termMonths: 60,
    text: {
      'en-GB': {
        name: 'Rhône Storage Hub',
        location: 'Lyon area, France',
        description:
          'A 20 MWh battery storage site that balances the local grid during consumption peaks.',
      },
      'fr-FR': {
        name: 'Rhône Storage Hub',
        location: 'Agglomération lyonnaise, France',
        description:
          'Un site de stockage par batteries de 20 MWh qui équilibre le réseau local pendant les pics de consommation.',
      },
    },
  },
  {
    id: 'alentejo-sun-farms',
    kind: 'solar',
    status: 'closed',
    amount: '9000000',
    targetRate: '0.0575',
    termMonths: 84,
    text: {
      'en-GB': {
        name: 'Alentejo Sun Farms',
        location: 'Alentejo, Portugal',
        description:
          'Two ground-mounted solar farms, 15 MWp in total, built on unused farmland with sheep grazing kept.',
      },
      'fr-FR': {
        name: 'Alentejo Sun Farms',
        location: 'Alentejo, Portugal',
        description:
          'Deux centrales solaires au sol, 15 MWc au total, sur des terres agricoles inutilisées où le pâturage est maintenu.',
      },
    },
  },
  {
    id: 'gironde-office-conversion',
    kind: 'renovation',
    status: 'closed',
    amount: '3800000',
    targetRate: '0.075',
    termMonths: 36,
    text: {
      'en-GB': {
        name: 'Gironde Office Conversion',
        location: 'Bordeaux, France',
        description:
          'An empty 1990s office building converted into 48 student flats, with its insulation and heating renewed.',
      },
      'fr-FR': {
        name: 'Gironde Office Conversion',
        location: 'Bordeaux, France',
        description:
          'Un immeuble de bureaux vide des années 1990 reconverti en 48 logements étudiants, isolation et chauffage refaits.',
      },
    },
  },
];
