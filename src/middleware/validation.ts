import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { AppError } from './error.js';

/**
 * Validation middleware factory
 * Creates middleware that validates request body against a Zod schema
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessage = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        const validationError = new Error(`Validation error: ${errorMessage}`) as AppError;
        validationError.statusCode = 400;
        return next(validationError);
      }
      next(error);
    }
  };
}

/**
 * Validation middleware factory for request params
 * Creates middleware that validates request params against a Zod schema
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessage = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        const validationError = new Error(`Validation error: ${errorMessage}`) as AppError;
        validationError.statusCode = 400;
        return next(validationError);
      }
      next(error);
    }
  };
}

/**
 * Validation middleware factory for request query parameters
 * Creates middleware that validates request query against a Zod schema
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessage = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        const validationError = new Error(`Validation error: ${errorMessage}`) as AppError;
        validationError.statusCode = 400;
        return next(validationError);
      }
      next(error);
    }
  };
}

