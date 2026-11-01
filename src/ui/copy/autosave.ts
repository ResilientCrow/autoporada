import { errors, problemActions, rules } from './forms';

/**
 * Autosaving editors (ADR 0017): the status line, the five banners and what is said
 * when one appears. „Bod“ is the noun of every editor that uses it: a future point is a bod too.
 */
export const autosave = {
  saving: 'Ukládám…',
  saved: (time: string) => `Uloženo v\u00A0${time}`,
  unsaved: 'Neuložené změny',
  failed: {
    /** Followed by what broke (`failures`), the code's own text (`errors`), or `network`. */
    lead: 'Změny se nepodařilo uložit.',
    /** Only for a request that never got an answer. */
    network: 'Zkontrolujte připojení.',
    retry: 'Zkusit znovu',
  },
  conflict: {
    text: 'Bod se mezitím změnil v\u00A0jiném okně.',
    reload: problemActions.reload,
    keepMine: 'Ponechat moji verzi',
  },
  locked: {
    text: rules['point-not-editable'],
    reload: problemActions.reload,
  },
  gone: {
    text: errors['not-found'],
    reload: problemActions.reload,
  },
  signedOut: {
    text: 'Byli jste odhlášeni. Přihlaste se znovu v\u00A0novém okně a\u00A0pak klikněte na Uložit.',
    signIn: problemActions.signIn,
    save: 'Uložit',
  },
} as const;
