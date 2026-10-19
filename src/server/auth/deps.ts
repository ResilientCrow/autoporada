import type { Clock, IdentityProvider } from '@/application/ports';

import type { Log } from '../log';

/** What the sign-in routes need beyond the pipeline; the container builds it. */
export interface AuthDeps {
  readonly idp: IdentityProvider;
  readonly clock: Clock;
  readonly appOrigin: string;
  readonly log: Log;
  /** What checkEntraClaims expects of every ID token. */
  readonly expect: {
    readonly issuer: string;
    readonly clientId: string;
    readonly tenantId: string;
  };
  readonly bootstrapHeadmasterOid: string | null;
}
