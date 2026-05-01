import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_production';

export function adminAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Nicht autorisiert', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    throw new AppError('Token ungültig oder abgelaufen', 401);
  }
}
