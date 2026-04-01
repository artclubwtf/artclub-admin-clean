import { z } from "zod";

export const authCredentialsSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  shopDomain: z.string().trim().min(1, "Shop domain is required").optional(),
});
