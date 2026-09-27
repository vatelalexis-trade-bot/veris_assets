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
  NEW_SIGN_IN_ADDRESS: {
    category: 'SECURITY',
    texts: {
      'en-GB': {
        title: 'Sign-in from a new address',
        body: 'Your account was just used to sign in from an address not seen before. If it was not you, change your password and tell your administrator.',
      },
      'fr-FR': {
        title: 'Connexion depuis une nouvelle adresse',
        body: 'Votre compte vient d’être utilisé pour se connecter depuis une adresse inconnue. Si ce n’était pas vous, changez votre mot de passe et prévenez votre administrateur.',
      },
    },
  },
  BREAK_GLASS_STARTED: {
    category: 'SECURITY',
    texts: {
      'en-GB': {
        title: 'Emergency access to your organisation',
        body: 'A Platform Administrator opened a read-only emergency access to your organisation, for one hour at most. Its reason and every page viewed are in the audit log.',
      },
      'fr-FR': {
        title: 'Accès d’urgence à votre organisation',
        body: 'Un administrateur de la plateforme a ouvert un accès d’urgence en lecture seule à votre organisation, pour une heure au plus. Son motif et chaque page consultée figurent dans le journal d’audit.',
      },
    },
  },
  SUSPICIOUS_ACTIVITY: {
    category: 'SECURITY',
    texts: {
      'en-GB': {
        title: 'Unusual activity on an account',
        body: 'An account of your organisation had many requests refused in a short time. Check the audit log and the account’s roles.',
      },
      'fr-FR': {
        title: 'Activité inhabituelle sur un compte',
        body: 'Un compte de votre organisation a eu de nombreuses demandes refusées en peu de temps. Vérifiez le journal d’audit et les rôles du compte.',
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
  EXPORT_READY: {
    category: 'DOCUMENT',
    texts: {
      'en-GB': {
        title: 'Export ready',
        body: 'The CSV export you asked for is ready. Download it from the Reports page.',
      },
      'fr-FR': {
        title: 'Export prêt',
        body: 'L’export CSV que vous avez demandé est prêt. Téléchargez-le depuis la page Rapports.',
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
  ALLOCATION_TO_VALIDATE: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Allocation to validate',
        body: 'An allocation of the issuance {code} was proposed and waits for the validation of another administrator.',
      },
      'fr-FR': {
        title: 'Allocation à valider',
        body: 'Une allocation de l’émission {code} a été proposée et attend la validation d’un autre administrateur.',
      },
    },
  },
  ALLOCATION_REJECTED: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Allocation rejected',
        body: 'The allocation of the issuance {code} you proposed was rejected. See the comment and prepare a new one.',
      },
      'fr-FR': {
        title: 'Allocation rejetée',
        body: 'L’allocation de l’émission {code} que vous avez proposée a été rejetée. Voir le commentaire et en préparer une nouvelle.',
      },
    },
  },
  SUBSCRIPTION_ALLOCATED: {
    category: 'INVESTMENT',
    texts: {
      'en-GB': {
        title: 'Units allocated',
        body: '{units} units of the issuance {code} are allocated to you. They stay blocked until your payment is confirmed.',
      },
      'fr-FR': {
        title: 'Unités allouées',
        body: '{units} unités de l’émission {code} vous sont allouées. Elles restent bloquées jusqu’à la confirmation de votre paiement.',
      },
    },
  },
  SUBSCRIPTION_NOT_ALLOCATED: {
    category: 'INVESTMENT',
    texts: {
      'en-GB': {
        title: 'No units allocated',
        body: 'No unit of the issuance {code} could be allocated to your subscription, which is cancelled.',
      },
      'fr-FR': {
        title: 'Aucune unité allouée',
        body: 'Aucune unité de l’émission {code} n’a pu être allouée à votre souscription, qui est annulée.',
      },
    },
  },
  PAYMENT_TO_CONFIRM: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Payment to confirm',
        body: 'The payment of a subscription to the issuance {code} is prepared and waits for the confirmation of another administrator.',
      },
      'fr-FR': {
        title: 'Paiement à confirmer',
        body: 'Le paiement d’une souscription à l’émission {code} est préparé et attend la confirmation d’un autre administrateur.',
      },
    },
  },
  SUBSCRIPTION_PAYMENT_CONFIRMED: {
    category: 'INVESTMENT',
    texts: {
      'en-GB': {
        title: 'Payment confirmed',
        body: 'Your payment for the issuance {code} is confirmed: your {units} units are now available.',
      },
      'fr-FR': {
        title: 'Paiement confirmé',
        body: 'Votre paiement pour l’émission {code} est confirmé : vos {units} unités sont maintenant disponibles.',
      },
    },
  },
  CORRECTION_TO_APPROVE: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Registry correction to approve',
        body: 'A correction of the registry of the issuance {code} was proposed and waits for approval.',
      },
      'fr-FR': {
        title: 'Correction du registre à approuver',
        body: 'Une correction du registre de l’émission {code} a été proposée et attend une approbation.',
      },
    },
  },
  CORRECTION_APPROVED: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Registry correction approved',
        body: 'Your correction of the registry of the issuance {code} was approved and written.',
      },
      'fr-FR': {
        title: 'Correction du registre approuvée',
        body: 'Votre correction du registre de l’émission {code} a été approuvée et enregistrée.',
      },
    },
  },
  CORRECTION_REJECTED: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Registry correction rejected',
        body: 'Your correction of the registry of the issuance {code} was rejected. See the comment.',
      },
      'fr-FR': {
        title: 'Correction du registre rejetée',
        body: 'Votre correction du registre de l’émission {code} a été rejetée. Voir le commentaire.',
      },
    },
  },
  REGISTRY_ANOMALY: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Registry anomaly',
        body: 'The daily check found an inconsistency in the registry of the issuance {code}. Look at it without delay.',
      },
      'fr-FR': {
        title: 'Anomalie du registre',
        body: 'Le contrôle quotidien a trouvé une incohérence dans le registre de l’émission {code}. À examiner sans attendre.',
      },
    },
  },
  TRANSFER_TO_REVIEW: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Transfer to review',
        body: 'A transfer of {units} units of the issuance {code} waits for a compliance review.',
      },
      'fr-FR': {
        title: 'Transfert à examiner',
        body: 'Un transfert de {units} unités de l’émission {code} attend un examen de conformité.',
      },
    },
  },
  TRANSFER_EXECUTED: {
    category: 'INVESTMENT',
    texts: {
      'en-GB': {
        title: 'Transfer executed',
        body: 'Your transfer of {units} units of the issuance {code} was approved and executed.',
      },
      'fr-FR': {
        title: 'Transfert exécuté',
        body: 'Votre transfert de {units} unités de l’émission {code} a été approuvé et exécuté.',
      },
    },
  },
  TRANSFER_RECEIVED: {
    category: 'INVESTMENT',
    texts: {
      'en-GB': {
        title: 'Units received',
        body: '{units} units of the issuance {code} were transferred to you.',
      },
      'fr-FR': {
        title: 'Unités reçues',
        body: '{units} unités de l’émission {code} vous ont été transférées.',
      },
    },
  },
  TRANSFER_REJECTED: {
    category: 'INVESTMENT',
    texts: {
      'en-GB': {
        title: 'Transfer rejected',
        body: 'Your transfer of {units} units of the issuance {code} was rejected. Your units are available again.',
      },
      'fr-FR': {
        title: 'Transfert rejeté',
        body: 'Votre transfert de {units} unités de l’émission {code} a été rejeté. Vos unités sont de nouveau disponibles.',
      },
    },
  },
  TRANSFER_CANCELLED: {
    category: 'INVESTMENT',
    texts: {
      'en-GB': {
        title: 'Transfer cancelled',
        body: 'Your transfer of {units} units of the issuance {code} was cancelled by the issuer. Your units are available again.',
      },
      'fr-FR': {
        title: 'Transfert annulé',
        body: 'Votre transfert de {units} unités de l’émission {code} a été annulé par l’émetteur. Vos unités sont de nouveau disponibles.',
      },
    },
  },
  DISTRIBUTION_TO_APPROVE: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Distribution to approve',
        body: 'A distribution of the issuance {code} was calculated and waits for the approval of another administrator.',
      },
      'fr-FR': {
        title: 'Distribution à approuver',
        body: 'Une distribution de l’émission {code} a été calculée et attend l’approbation d’un autre administrateur.',
      },
    },
  },
  DISTRIBUTION_PAYMENT_TO_CONFIRM: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Distribution payment to confirm',
        body: 'The payment of a distribution of the issuance {code} is prepared and waits for the confirmation of another administrator.',
      },
      'fr-FR': {
        title: 'Paiement de distribution à confirmer',
        body: 'Le paiement d’une distribution de l’émission {code} est préparé et attend la confirmation d’un autre administrateur.',
      },
    },
  },
  DISTRIBUTION_PAID: {
    category: 'DISTRIBUTION',
    texts: {
      'en-GB': {
        title: 'Distribution paid',
        body: 'A distribution of the issuance {code} was paid to you. See the detail in your distributions.',
      },
      'fr-FR': {
        title: 'Distribution versée',
        body: 'Une distribution de l’émission {code} vous a été versée. Voir le détail dans vos distributions.',
      },
    },
  },
  SUBSCRIPTION_SUBMITTED: {
    category: 'WORKFLOW',
    texts: {
      'en-GB': {
        title: 'Subscription to review',
        body: 'A new subscription to the issuance {code} waits for review.',
      },
      'fr-FR': {
        title: 'Souscription à traiter',
        body: 'Une nouvelle souscription à l’émission {code} attend d’être traitée.',
      },
    },
  },
  SUBSCRIPTION_APPROVED: {
    category: 'INVESTMENT',
    texts: {
      'en-GB': {
        title: 'Subscription approved',
        body: 'Your subscription to the issuance {code} was approved. The units are allocated when subscriptions close.',
      },
      'fr-FR': {
        title: 'Souscription approuvée',
        body: 'Votre souscription à l’émission {code} a été approuvée. Les unités sont allouées à la clôture des souscriptions.',
      },
    },
  },
  SUBSCRIPTION_REJECTED: {
    category: 'INVESTMENT',
    texts: {
      'en-GB': {
        title: 'Subscription rejected',
        body: 'Your subscription to the issuance {code} was rejected. See the reason in your subscriptions.',
      },
      'fr-FR': {
        title: 'Souscription refusée',
        body: 'Votre souscription à l’émission {code} a été refusée. Voir le motif dans vos souscriptions.',
      },
    },
  },
  SUBSCRIPTION_CANCELLED: {
    category: 'INVESTMENT',
    texts: {
      'en-GB': {
        title: 'Subscription cancelled',
        body: 'Your subscription to the issuance {code} was cancelled by the issuer. See the reason in your subscriptions.',
      },
      'fr-FR': {
        title: 'Souscription annulée',
        body: 'Votre souscription à l’émission {code} a été annulée par l’émetteur. Voir le motif dans vos souscriptions.',
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
