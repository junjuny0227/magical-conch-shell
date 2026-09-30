export interface AccountType {
  id: string;
  name: string;
  objectType: 'STUDENT' | 'TEACHER';
}
export interface SessionType {
  user: AccountType;
  expiresAt: number;
}
