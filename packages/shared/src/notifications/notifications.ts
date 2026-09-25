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
