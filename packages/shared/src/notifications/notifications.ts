/**
 * Notification catalogue (SPEC §15): categories, mandatory ones, and the text of each notification
 * in both languages. Single source for the in-app notifications (web) and their emails (API).
 */
export const NOTIFICATION_CATEGORIES = [
  'SECURITY',
  'WORKFLOW',
  'ORGANISATION',
  'ISSUANCE',
  'INVESTMENT',
  'DISTRIBUTION',
  'DOCUMENT',
  'COMPLIANCE',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Security and workflow notifications cannot be switched off (SPEC §15, "Préférences"). */
export const MANDATORY_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'SECURITY',
  'WORKFLOW',
];

export const NOTIFICATION_LOCALES = ['en-GB', 'fr-FR'] as const;
export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number];

interface NotificationText {
  title: string;
  body: string;
}

interface NotificationDefinition {
  category: NotificationCategory;
  texts: Record<NotificationLocale, NotificationText>;
}

/**
 * One entry per notification type. Texts may use `{param}` placeholders filled from the
 * notification's parameters; parameters never hold personal data (identifiers and codes only).
 */
export const NOTIFICATION_TYPES = {
  ROLES_CHANGED: {
    category: 'SECURITY',
    texts: {
      'en-GB': {
        title: 'Your roles have changed',
        body: 'An administrator changed your roles. Sign in again to use your new access rights. If you did not expect this change, contact your administrator.',
      },
      'fr-FR': {
        title: 'Vos rôles ont changé',
        body: 'Un administrateur a modifié vos rôles. Reconnectez-vous pour utiliser vos nouveaux droits. Si vous ne vous attendiez pas à ce changement, contactez votre administrateur.',
      },
    },
  },
  INVITATION_ACCEPTED: {
    category: 'ORGANISATION',
    texts: {
      'en-GB': {
        title: 'Invitation accepted',
        body: 'A person you invited has joined the organisation.',
      },
      'fr-FR': {
        title: 'Invitation acceptée',
        body: 'Une personne que vous avez invitée a rejoint l’organisation.',
      },
    },
  },
  KYC_REVIEW_REQUESTED: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'KYC/KYB case to review',
        body: 'A KYC/KYB case was submitted and is waiting for a Compliance Officer’s decision.',
      },
      'fr-FR': {
        title: 'Dossier KYC/KYB à examiner',
        body: 'Un dossier KYC/KYB a été soumis et attend la décision d’un responsable conformité.',
      },
    },
  },
  KYC_RETURNED: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'KYC/KYB case sent back',
        body: 'The Compliance Officer sent a KYC/KYB case back to you for completion. See the comment on the case.',
      },
      'fr-FR': {
        title: 'Dossier KYC/KYB renvoyé',
        body: 'Le responsable conformité vous a renvoyé un dossier KYC/KYB à compléter. Voir le commentaire du dossier.',
      },
    },
  },
  KYC_APPROVED: {
    category: 'COMPLIANCE',
    texts: {
      'en-GB': {
        title: 'KYC/KYB approved',
        body: 'The KYC/KYB case was approved. It is valid until {validUntil}.',
      },
      'fr-FR': {
        title: 'KYC/KYB approuvé',
        body: 'Le dossier KYC/KYB a été approuvé. Il est valable jusqu’au {validUntil}.',
      },
    },
  },
  KYC_REJECTED: {
    category: 'COMPLIANCE',
    texts: {
      'en-GB': {
        title: 'KYC/KYB rejected',
        body: 'The KYC/KYB case was rejected. See the comment of the Compliance Officer.',
      },
      'fr-FR': {
        title: 'KYC/KYB refusé',
        body: 'Le dossier KYC/KYB a été refusé. Voir le commentaire du responsable conformité.',
      },
    },
  },
  KYC_EXPIRING_SOON: {
    category: 'COMPLIANCE',
    texts: {
      'en-GB': {
        title: 'KYC/KYB expires soon',
        body: 'A KYC/KYB approval expires on {validUntil}. A new case must be approved before then to keep subscribing.',
      },
      'fr-FR': {
        title: 'KYC/KYB bientôt expiré',
        body: 'Une validation KYC/KYB expire le {validUntil}. Un nouveau dossier doit être approuvé avant cette date pour continuer à souscrire.',
      },
    },
  },
  KYC_EXPIRED: {
    category: 'COMPLIANCE',
    texts: {
      'en-GB': {
        title: 'KYC/KYB expired',
        body: 'A KYC/KYB approval has expired: no new subscription or incoming transfer is possible until a new case is approved. Existing positions are unchanged.',
      },
      'fr-FR': {
        title: 'KYC/KYB expiré',
        body: 'Une validation KYC/KYB a expiré : aucune nouvelle souscription ni aucun transfert entrant n’est possible avant l’approbation d’un nouveau dossier. Les positions existantes sont inchangées.',
      },
    },
  },
  DOCUMENT_ADDED: {
    category: 'DOCUMENT',
    texts: {
      'en-GB': {
        title: 'New document',
        body: 'A new document is available in your documents.',
      },
      'fr-FR': {
        title: 'Nouveau document',
        body: 'Un nouveau document est disponible dans vos documents.',
      },
    },
  },
  ISSUANCE_REVIEW_REQUESTED: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Issuance to approve',
        body: 'The issuance {code} was submitted and waits for the approval of another administrator.',
      },
      'fr-FR': {
        title: 'Émission à approuver',
        body: 'L’émission {code} a été soumise et attend l’approbation d’un autre administrateur.',
      },
    },
  },
  ISSUANCE_APPROVED: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Issuance approved',
        body: 'The issuance {code} you submitted was approved.',
      },
      'fr-FR': {
        title: 'Émission approuvée',
        body: 'L’émission {code} que vous avez soumise a été approuvée.',
      },
    },
  },
  ISSUANCE_RETURNED: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Issuance sent back to draft',
        body: 'The issuance {code} was sent back to draft. See the comment of the administrator.',
      },
      'fr-FR': {
        title: 'Émission renvoyée en brouillon',
        body: 'L’émission {code} a été renvoyée en brouillon. Voir le commentaire de l’administrateur.',
      },
    },
  },
  INVESTOR_INVITED: {
    category: 'ISSUANCE',
    texts: {
      'en-GB': {
        title: 'New investment opportunity',
        body: 'You are invited to the issuance {code}. See its terms and documents in your opportunities.',
      },
      'fr-FR': {
        title: 'Nouvelle opportunité',
        body: 'Vous êtes invité à l’émission {code}. Consultez ses conditions et ses documents dans vos opportunités.',
      },
    },
  },
  ISSUANCE_OPENED: {
    category: 'ISSUANCE',
    texts: {
      'en-GB': {
        title: 'Subscriptions are open',
        body: 'Subscriptions to the issuance {code} are now open.',
      },
      'fr-FR': {
        title: 'Souscriptions ouvertes',
        body: 'Les souscriptions à l’émission {code} sont maintenant ouvertes.',
      },
    },
  },
  ISSUANCE_CANCELLED: {
    category: 'ISSUANCE',
    texts: {
      'en-GB': {
        title: 'Issuance cancelled',
        body: 'The issuance {code} was cancelled. Subscriptions in progress are cancelled with it.',
      },
      'fr-FR': {
        title: 'Émission annulée',
        body: 'L’émission {code} a été annulée. Les souscriptions en cours sont annulées avec elle.',
      },
    },
  },
} as const satisfies Record<string, NotificationDefinition>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export const NOTIFICATION_TYPE_CODES = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

export function isMandatoryCategory(category: NotificationCategory): boolean {
  return MANDATORY_NOTIFICATION_CATEGORIES.includes(category);
}

/** Title and body of a notification in one language, placeholders filled. */
export function notificationText(
  type: NotificationType,
  locale: NotificationLocale,
  params: Readonly<Record<string, string>> = {},
): NotificationText {
  const text: NotificationText = NOTIFICATION_TYPES[type].texts[locale];
  const fill = (template: string) =>
    template.replace(/\{(\w+)\}/g, (placeholder, name: string) => params[name] ?? placeholder);
  return { title: fill(text.title), body: fill(text.body) };
}
