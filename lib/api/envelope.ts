export const ERROR_CODES = {
  VALIDATION_FAILED: 40001,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  CONFLICT: 40900,
  INTERNAL: 50000,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
export type SuccessCode = 0;
export type ApiCode = SuccessCode | ErrorCode;

export interface ApiEnvelope<T> {
  code: ApiCode;
  message: string;
  data: T | null;
}

export function ok<T>(data: T, message = "ok"): ApiEnvelope<T> {
  return {
    code: 0,
    message,
    data,
  };
}

export function err(code: ErrorCode, message: string): ApiEnvelope<never> {
  return {
    code,
    message,
    data: null,
  };
}
