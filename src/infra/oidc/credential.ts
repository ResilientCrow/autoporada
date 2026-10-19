import { createHash, createPrivateKey, X509Certificate, type KeyObject } from 'node:crypto';

import { ConfigError, type OidcCredential } from '../config';

/** How the app proves itself to Entra: a certificate in production, a secret in development (ADR 0002). */
export type ClientCredential =
  | { readonly kind: 'secret'; readonly secret: string }
  | {
      readonly kind: 'certificate';
      /** RSA-PSS with SHA-256: the assertion is signed PS256, as Entra documents. */
      readonly key: CryptoKey;
      /** base64url SHA-256 of the certificate's DER: the `x5t#S256` header. */
      readonly x5tS256: string;
      /** Upper-case hex SHA-1: what the Entra portal shows as the thumbprint. */
      readonly sha1: string;
      readonly notAfter: Date;
      readonly subject: string;
    };

const MIN_RSA_BITS = 2048;

function parse<T>(read: () => T, problem: string): T {
  try {
    return read();
  } catch {
    throw new ConfigError([problem]);
  }
}

/**
 * Loads the credential once at boot. A key that does not belong to the
 * certificate, a weak key or a thumbprint that does not match stops the
 * server; problems name the setting, never its value. An expired
 * certificate still loads, so the boot log can say so.
 */
export function loadClientCredential(credential: OidcCredential): ClientCredential {
  if (credential.kind === 'secret') return credential;
  const certificate = parse(
    () => new X509Certificate(credential.certificatePem),
    'OIDC_CLIENT_CERT: is not a PEM certificate',
  );
  const privateKey: KeyObject = parse(
    () => createPrivateKey(credential.privateKeyPem),
    'OIDC_CLIENT_KEY: is not a PEM private key',
  );
  const problems: string[] = [];
  const bits = privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
  if (privateKey.asymmetricKeyType !== 'rsa' || bits < MIN_RSA_BITS) {
    problems.push(`OIDC_CLIENT_KEY: must be an RSA key of at least ${MIN_RSA_BITS} bits`);
  } else if (!certificate.checkPrivateKey(privateKey)) {
    problems.push('OIDC_CLIENT_CERT: does not belong to OIDC_CLIENT_KEY');
  }
  const sha1 = createHash('sha1').update(certificate.raw).digest('hex').toUpperCase();
  if (credential.thumbprint && credential.thumbprint !== sha1) {
    problems.push('OIDC_CLIENT_CERT_THUMBPRINT: does not match OIDC_CLIENT_CERT');
  }
  if (problems.length > 0) throw new ConfigError(problems);
  return {
    kind: 'certificate',
    // The same object WebCrypto makes; Node's types only add newer KeyUsage values.
    key: privateKey.toCryptoKey({ name: 'RSA-PSS', hash: 'SHA-256' }, false, [
      'sign',
    ]) as unknown as CryptoKey,
    x5tS256: createHash('sha256').update(certificate.raw).digest('base64url'),
    sha1,
    notAfter: new Date(certificate.validTo),
    subject: certificate.subject,
  };
}
