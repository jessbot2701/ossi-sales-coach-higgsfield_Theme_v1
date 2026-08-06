export const RECOVERY_TOKEN_PATTERN = /^[a-f0-9]{40,128}$/;

export function isRecoveryToken(value: unknown): value is string {
  return typeof value === "string" && RECOVERY_TOKEN_PATTERN.test(value);
}
