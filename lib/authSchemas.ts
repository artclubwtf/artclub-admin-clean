import { z } from "zod";

export const authCredentialsSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  shopDomain: z.string().trim().min(1, "Shop domain is required").optional(),
});

export const createCustomerUserSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(1).optional(),
  shopDomain: z.string().trim().min(1, "Shop domain is required"),
  shopifyCustomerGid: z.string().trim().min(1).optional(),
});

export const changePasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AuthCredentialsInput = z.infer<typeof authCredentialsSchema>;
export type CreateCustomerUserInput = z.infer<typeof createCustomerUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
