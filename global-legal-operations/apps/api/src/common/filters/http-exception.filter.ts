import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiResponse } from '@glo/shared';
import { ERROR_CODES } from '@glo/shared';

/**
 * Global exception filter that normalises every error into the
 * `ApiResponse<T>` envelope from @glo/shared.
 *
 * In production mode internal error details are never exposed.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === 'production';

    let status: number;
    let code: string;
    let message: string;
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exRes = exception.getResponse();

      if (typeof exRes === 'string') {
        code = this.mapHttpStatusToCode(status);
        message = exRes;
      } else if (typeof exRes === 'object' && exRes !== null) {
        const obj = exRes as Record<string, unknown>;
        // class-validator validation errors come as { message, statusCode, error }
        if (Array.isArray(obj.message)) {
          code = ERROR_CODES.VALIDATION_ERROR;
          message = 'Validation failed';
          details = isProduction ? undefined : obj.message;
        } else {
          code = this.mapHttpStatusToCode(status);
          message = (obj.message as string) || exception.message;
        }
      } else {
        code = this.mapHttpStatusToCode(status);
        message = exception.message;
      }
    } else {
      // Non-HTTP exception → internal server error
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = ERROR_CODES.INTERNAL_ERROR;
      message = isProduction
        ? 'An unexpected error occurred'
        : exception instanceof Error
          ? exception.message
          : 'Unknown error';
      details = isProduction ? undefined : exception;

      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : exception,
      );
    }

    const body: ApiResponse<never> = {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined && { details }),
      },
      meta: {
        requestId: (request.headers['x-request-id'] as string) || 'N/A',
        timestamp: new Date().toISOString(),
      },
    };

    response.status(status).json(body);
  }

  private mapHttpStatusToCode(status: number): string {
    const map: Record<number, string> = {
      [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
      [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
    };
    return map[status] || ERROR_CODES.INTERNAL_ERROR;
  }
}
