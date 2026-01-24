import { z } from 'zod';

export const updateUserSchema = z.object({
  name: z
    .string()
    .min(1, 'Name must be at least 1 character')
    .max(100, 'Name must be 100 characters or less')
    .trim()
    .optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must be 128 characters or less'),
});

