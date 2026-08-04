import { defineSecret } from 'firebase-functions/params';

// SMTP auth — real secrets, backed by Secret Manager (see
// infrastructure/environments/production/smtp.tf). Bound onto the drain
// function's config (secrets: [...]) and read via .value() only from inside
// the handler, never at module load — see functions/src/drain.ts.
export const smtpUser = defineSecret('SMTP_USER');
export const smtpPassword = defineSecret('SMTP_PASSWORD');
