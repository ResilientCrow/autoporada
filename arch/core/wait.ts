import { countWord, type PluralForms } from '@/domain/cs';

/** After „za“: „za 1 minutu“, „za 3 minuty“, „za 25 minut“. */
const MINUTES: PluralForms = { one: 'minutu', few: 'minuty', many: 'minut' };
const HOURS: PluralForms = { one: 'hodinu', few: 'hodiny', many: 'hodin' };

/**
 * The banner when the server refuses a write as too frequent. It names the wait the server
 * gave (`retryAfterSeconds`), rounded up to whole minutes, or whole hours past the hour, so a
 * refusal that lasts half an hour does not read as „a moment“.
 */
export function rateLimitedText(retryAfterSeconds?: number): string {
  if (retryAfterSeconds === undefined || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0)
    return 'Moc rychle za sebou. Chvíli počkejte.';
  const minutes = Math.ceil(retryAfterSeconds / 60);
  const span = minutes <= 60 ? countWord(minutes, MINUTES) : countWord(Math.ceil(minutes / 60), HOURS);
  return `Moc rychle za sebou. Zkuste to znovu za ${span}.`;
}
