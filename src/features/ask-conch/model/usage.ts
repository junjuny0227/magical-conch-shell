export const CONCH_DAILY_LIMIT = 30;

export interface ConchUsageType {
  dailyLimit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAfterSeconds: number;
}
