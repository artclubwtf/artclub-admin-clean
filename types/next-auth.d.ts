import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id: string;
      role: "team" | "artist";
      artistId?: string;
      mustChangePassword?: boolean;
    };
  }

  interface User {
    id: string;
    role: "team" | "artist";
    artistId?: string;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: "team" | "artist";
    artistId?: string;
    mustChangePassword?: boolean;
  }
}

export {};
