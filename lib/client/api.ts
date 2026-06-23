// 客户端 API 封装：统一信封 {code,message,data}。
// 鉴权走 httpOnly cookie（同源自动携带），无需手动加 header/token。

export const API_CODES = {
  OK: 0,
  VALIDATION_FAILED: 40001,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  CONFLICT: 40900,
  INTERNAL: 50000,
} as const;

export interface Envelope<T> {
  code: number;
  message: string;
  data: T | null;
}

export class ApiError extends Error {
  code: number;
  status: number;
  constructor(code: number, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

export async function apiFetch<T>(
  path: string,
  { method = "GET", body }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });

  let envelope: Envelope<T>;
  try {
    envelope = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(API_CODES.INTERNAL, "无法解析服务器响应", res.status);
  }

  if (envelope.code !== API_CODES.OK) {
    throw new ApiError(envelope.code, envelope.message || "请求失败", res.status);
  }
  return envelope.data as T;
}
