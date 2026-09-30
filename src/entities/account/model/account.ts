import { AppError } from '@/shared/lib/server';

import 'server-only';
import type { AccountType, SessionType } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const validName = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= 100 &&
  !/[\u0000-\u001f\u007f]/.test(value);
export const isAccount = (value: unknown): value is AccountType =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  /^[1-9]\d{0,18}$/.test(value.id) &&
  validName(value.name) &&
  (value.objectType === 'STUDENT' || value.objectType === 'TEACHER');
export const accountFromUserInfo = (data: unknown): AccountType => {
  const denied = () =>
    new AppError(403, 'ACCESS_DENIED', '재학생과 승인 완료 선생님만 이용할 수 있습니다.');
  if (
    !isRecord(data) ||
    data.status !== 'ACTIVE' ||
    typeof data.id !== 'number' ||
    !Number.isSafeInteger(data.id) ||
    data.id <= 0
  )
    throw denied();
  const objectType = data.objectType;
  if (objectType !== 'STUDENT' && objectType !== 'TEACHER') throw denied();
  const details = objectType === 'STUDENT' ? data.student : data.teacher;
  if (!isRecord(details) || !validName(details.name)) throw denied();
  if (
    objectType === 'STUDENT' &&
    (details.isLeaveSchool !== false ||
      !['GENERAL_STUDENT', 'STUDENT_COUNCIL', 'DORMITORY_MANAGER'].includes(String(details.role)))
  )
    throw denied();
  return { id: String(data.id), name: details.name.trim(), objectType };
};
export const parseSession = (data: unknown, now = Date.now()): SessionType | null => {
  if (
    !isRecord(data) ||
    !isAccount(data.user) ||
    typeof data.expiresAt !== 'number' ||
    !Number.isSafeInteger(data.expiresAt) ||
    data.expiresAt <= now ||
    data.expiresAt > now + 3600000
  )
    return null;
  return {
    user: { id: data.user.id, name: data.user.name, objectType: data.user.objectType },
    expiresAt: data.expiresAt,
  };
};
