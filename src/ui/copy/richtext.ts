/** The rich-text editor (ui/form/rich-text): help, toolbar, level announcements, the leave guard. */
export const richtext = {
  help: 'Tab odsadí, Shift+Tab vrátí. Klávesou Esc a\u00a0pak Tab editor opustíte.',
  /** Paragraph profile: no levels to explain. */
  helpPlain: 'Klávesou Tab editor opustíte.',
  placeholder: 'Začněte psát…',
  loadFailed: 'Editor se nepodařilo načíst. Načtěte stránku znovu.',
  toolbar: {
    label: 'Formát textu',
    bold: 'Tučně',
    italic: 'Kurzíva',
    indent: 'Odsadit',
    outdent: 'Vrátit odsazení',
  },
  /** Announced when the caret moves to a paragraph of another level. */
  level: (n: number) => `Úroveň ${n}`,
  paragraph: 'Odstavec',
  /** `percent` is 0 to 100 and more. */
  counter: (percent: number) => `Využito ${percent}\u00a0% místa pro text.`,
  counterNear: (percent: number) => `Pozor, využito ${percent}\u00a0% místa pro text.`,
  unsaved: 'Máte neuložené změny. Opravdu odejít?',
} as const;
