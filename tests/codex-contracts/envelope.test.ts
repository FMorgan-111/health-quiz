import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  err,
  ok,
  type ApiEnvelope,
  type ErrorCode,
} from "../../lib/api/envelope";

describe("API response envelope contract", () => {
  it("wraps success data with code 0 and ok message", () => {
    const response = ok({ id: "assessment-1" });

    expect(response).toEqual({
      code: 0,
      message: "ok",
      data: { id: "assessment-1" },
    } satisfies ApiEnvelope<{ id: string }>);
  });

  it("wraps errors with a stable code and null data", () => {
    const response = err(ERROR_CODES.UNAUTHORIZED, "missing bearer token");

    expect(response).toEqual({
      code: 40100,
      message: "missing bearer token",
      data: null,
    });
  });

  it("exposes the TASK handoff error-code map", () => {
    const expected: Record<string, ErrorCode> = {
      VALIDATION_FAILED: 40001,
      UNAUTHORIZED: 40100,
      FORBIDDEN: 40300,
      NOT_FOUND: 40400,
      CONFLICT: 40900,
      INTERNAL: 50000,
    };

    expect(ERROR_CODES).toEqual(expected);
  });
});
