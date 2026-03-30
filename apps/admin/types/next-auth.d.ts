import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id: string;
      role: "team" | "artist" | "customer";
      artistId?: string;
      artistKey?: string;
      onboardingComplete?: boolean;
      mustChangePassword?: boolean;
      pendingRegistrationId?: string;
      onboardingStatus?: string;
    };
  }

  interface User {
    id: string;
    role: "team" | "artist" | "customer";
    artistId?: string;
    artistKey?: string;
    onboardingComplete?: boolean;
    mustChangePassword?: boolean;
    pendingRegistrationId?: string;
    onboardingStatus?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: "team" | "artist" | "customer";
    artistId?: string;
    artistKey?: string;
    onboardingComplete?: boolean;
    mustChangePassword?: boolean;
    pendingRegistrationId?: string;
    onboardingStatus?: string;
  }
}

export {};
