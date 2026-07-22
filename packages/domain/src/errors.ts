// Structured errors — the only error shape actions may surface. Never
// string throws. `recoverable` tells the offline queue whether retrying
// the same request can ever succeed.

export type ErrorCode =
  | 'invalid-payload'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'request-conflict'
  | 'internal';

export interface StructuredError {
  code: ErrorCode;
  message: string;
  field?: string;
  recoverable: boolean;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly field: string | undefined;
  readonly recoverable: boolean;

  constructor(code: ErrorCode, message: string, opts?: { field?: string; recoverable?: boolean }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.field = opts?.field;
    this.recoverable = opts?.recoverable ?? false;
  }

  toStructured(): StructuredError {
    return {
      code: this.code,
      message: this.message,
      ...(this.field !== undefined ? { field: this.field } : {}),
      recoverable: this.recoverable,
    };
  }
}
