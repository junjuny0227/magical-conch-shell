export class AppApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AppApiError';
  }
}

export const requestApp = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new AppApiError(0, 'NETWORK_ERROR', '연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AppApiError(
      response.status,
      'INVALID_RESPONSE',
      '응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
  }
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? body.error : null;
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof error.code === 'string' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      throw new AppApiError(
        response.status,
        error.code,
        error.message,
        'retryAfterSeconds' in error && typeof error.retryAfterSeconds === 'number'
          ? error.retryAfterSeconds
          : undefined,
      );
    }
    throw new AppApiError(
      response.status,
      'SERVICE_UNAVAILABLE',
      '잠시 사용할 수 없어요. 다시 시도해 주세요.',
    );
  }
  if (!body || typeof body !== 'object' || !('data' in body)) {
    throw new AppApiError(response.status, 'INVALID_RESPONSE', '응답을 확인하지 못했어요.');
  }
  return body.data as T;
};
