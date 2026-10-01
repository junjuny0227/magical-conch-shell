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
  const denied = (reason: string) => {
    const error = new AppError(
      403,
      'ACCESS_DENIED',
      '재학생과 승인 완료 선생님만 이용할 수 있습니다.',
    );
    error.cause = reason;
    return error;
  };
  if (!isRecord(data)) throw denied('ACCOUNT_FORMAT_INVALID');
  if (data.status !== 'ACTIVE') throw denied('ACCOUNT_STATUS_INVALID');
  if (typeof data.id !== 'number' || !Number.isSafeInteger(data.id) || data.id <= 0)
    throw denied('ACCOUNT_ID_INVALID');
  const objectType = data.objectType;
  if (objectType !== 'STUDENT' && objectType !== 'TEACHER') throw denied('ACCOUNT_TYPE_INVALID');
  const details = objectType === 'STUDENT' ? data.student : data.teacher;
  if (!isRecord(details)) throw denied('ACCOUNT_DETAILS_MISSING');
  if (!validName(details.name)) throw denied('ACCOUNT_NAME_INVALID');
  if (objectType === 'STUDENT') {
    // 현재 userinfo DTO는 role로 재학 상태를 제공하며 isLeaveSchool은 생략한다.
    // 이전 계약의 필드가 제공되는 경우에만 엄격한 boolean 검증을 유지한다.
    if (Object.hasOwn(details, 'isLeaveSchool') && details.isLeaveSchool !== false)
      throw denied('STUDENT_ENROLLMENT_INVALID');
    if (!['GENERAL_STUDENT', 'STUDENT_COUNCIL', 'DORMITORY_MANAGER'].includes(String(details.role)))
      throw denied('STUDENT_ROLE_INVALID');
  }
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
