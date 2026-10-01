import { describe, expect, it } from 'vitest';

import { accountFromUserInfo, isAccount, parseSession } from './account';

const student = {
  id: 1,
  status: 'ACTIVE',
  objectType: 'STUDENT',
  student: { name: '홍길동', role: 'GENERAL_STUDENT', isLeaveSchool: false },
};
describe('서버 계정 자격과 세션 검증', () => {
  it.each(['GENERAL_STUDENT', 'STUDENT_COUNCIL', 'DORMITORY_MANAGER'])(
    '현재 userinfo DTO처럼 isLeaveSchool이 없어도 재학생 역할 %s는 허용한다',
    (role) => {
      expect(
        accountFromUserInfo({
          ...student,
          student: { name: student.student.name, role },
        }),
      ).toEqual({ id: '1', name: student.student.name, objectType: 'STUDENT' });
    },
  );
  it.each(['GRADUATE', 'WITHDRAWN', 'ADMIN', '', undefined])(
    'isLeaveSchool이 없어도 재학생이 아닌 역할 %s는 거부한다',
    (role) => {
      expect(() =>
        accountFromUserInfo({
          ...student,
          student: { name: student.student.name, role },
        }),
      ).toThrow(expect.objectContaining({ code: 'ACCESS_DENIED' }));
    },
  );
  it.each([true, null, undefined, 'false', 0])(
    'isLeaveSchool이 제공되면 boolean false 이외의 값 %s는 거부한다',
    (isLeaveSchool) => {
      expect(() =>
        accountFromUserInfo({
          ...student,
          student: { ...student.student, isLeaveSchool },
        }),
      ).toThrow(expect.objectContaining({ cause: 'STUDENT_ENROLLMENT_INVALID' }));
    },
  );
  it.each([
    [null, 'ACCOUNT_FORMAT_INVALID'],
    [{ ...student, status: 'PENDING' }, 'ACCOUNT_STATUS_INVALID'],
    [{ ...student, id: '1' }, 'ACCOUNT_ID_INVALID'],
    [{ ...student, objectType: 'OTHER' }, 'ACCOUNT_TYPE_INVALID'],
    [{ ...student, student: null }, 'ACCOUNT_DETAILS_MISSING'],
    [{ ...student, student: { ...student.student, name: '' } }, 'ACCOUNT_NAME_INVALID'],
    [
      { ...student, student: { ...student.student, isLeaveSchool: true } },
      'STUDENT_ENROLLMENT_INVALID',
    ],
    [{ ...student, student: { ...student.student, role: 'GRADUATE' } }, 'STUDENT_ROLE_INVALID'],
  ])('거절 원문 대신 고정된 진단 사유만 제공한다', (data, reason) => {
    expect(() => accountFromUserInfo(data)).toThrow(
      expect.objectContaining({
        status: 403,
        code: 'ACCESS_DENIED',
        cause: reason,
      }),
    );
  });
  it.each(['GENERAL_STUDENT', 'STUDENT_COUNCIL', 'DORMITORY_MANAGER'])(
    '현재 학생 %s 허용',
    (role) => {
      expect(accountFromUserInfo({ ...student, student: { ...student.student, role } })).toEqual({
        id: '1',
        name: '홍길동',
        objectType: 'STUDENT',
      });
    },
  );
  it.each(['GRADUATE', 'WITHDRAWN', 'ADMIN', '', undefined])('학생 역할 %s 기본 거부', (role) => {
    expect(() =>
      accountFromUserInfo({ ...student, student: { ...student.student, role } }),
    ).toThrow();
  });
  it.each([
    null,
    {},
    { ...student, status: 'PENDING' },
    { ...student, student: null },
    { ...student, student: { ...student.student, isLeaveSchool: true } },
    { ...student, id: '1' },
    { ...student, id: 0 },
  ])('불완전한 응답 거부', (data) => {
    expect(() => accountFromUserInfo(data)).toThrow();
  });
  it('승인 완료 선생님만 허용한다', () => {
    expect(
      accountFromUserInfo({
        id: 2,
        status: 'ACTIVE',
        objectType: 'TEACHER',
        teacher: { name: '김선생' },
      }),
    ).toEqual({ id: '2', name: '김선생', objectType: 'TEACHER' });
    expect(() =>
      accountFromUserInfo({
        id: 2,
        status: 'PENDING',
        objectType: 'TEACHER',
        teacher: { name: '김선생' },
      }),
    ).toThrow();
    expect(() =>
      accountFromUserInfo({ id: 2, status: 'ACTIVE', objectType: 'TEACHER', teacher: null }),
    ).toThrow();
  });
  it('최소 계정 형태와 세션의 고정 만료를 검사한다', () => {
    const user = { id: '1', name: '홍길동', objectType: 'STUDENT' };
    expect(isAccount(user)).toBe(true);
    expect(isAccount({ ...user, objectType: 'ADMIN' })).toBe(false);
    expect(parseSession({ user, expiresAt: 2000 }, 1000)).toEqual({ user, expiresAt: 2000 });
    expect(parseSession({ user, expiresAt: 1000 }, 1000)).toBeNull();
    expect(parseSession({ user, expiresAt: 3601001 }, 1000)).toBeNull();
    expect(parseSession({ user, expiresAt: Infinity }, 1000)).toBeNull();
    expect(parseSession({ user, expiresAt: '2000' }, 1000)).toBeNull();
  });
});
