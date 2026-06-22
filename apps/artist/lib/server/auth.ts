import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { authCredentialsSchema } from "@/lib/server/auth-schemas";
import { connectMongo } from "@/lib/server/mongodb";
import { normalizeShopDomain } from "@/lib/server/shop-domain";
import { UserModel } from "@/lib/server/models";

type UserRole = "team" | "artist" | "customer";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = authCredentialsSchema.safeParse(credentials ?? {});
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const password = parsed.data.password;
        const shopDomain = parsed.data.shopDomain ? normalizeShopDomain(parsed.data.shopDomain) : undefined;

        await connectMongo();
        const filter: Record<string, unknown> = { email, role: "artist" };
        if (shopDomain) filter.shopDomain = shopDomain;

        const user = await UserModel.findOne(filter).lean();
        if (!user || !user.isActive || user.role !== "artist") return null;

        const isValid = await compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          role: "artist",
          artistId: user.artistId?.toString(),
          artistKey: user.artistKey ?? undefined,
          onboardingComplete: user.onboardingComplete === true,
          mustChangePassword: user.mustChangePassword,
          pendingRegistrationId: user.pendingRegistrationId?.toString(),
          onboardingStatus: user.onboardingStatus ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as { id?: string }).id ?? token.sub;
        token.email = (user as { email?: string }).email ?? token.email;
        const role = (user as { role?: UserRole }).role;
        if (role) token.role = role;
        token.artistId = (user as { artistId?: string }).artistId;
        token.artistKey = (user as { artistKey?: string }).artistKey;
        token.onboardingComplete = (user as { onboardingComplete?: boolean }).onboardingComplete;
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword;
        token.pendingRegistrationId = (user as { pendingRegistrationId?: string }).pendingRegistrationId;
        token.onboardingStatus = (user as { onboardingStatus?: string }).onboardingStatus;
      }

      if (trigger === "update" && session) {
        if ("mustChangePassword" in session && session.mustChangePassword !== undefined) {
          token.mustChangePassword = session.mustChangePassword as boolean;
        }
        if ("artistId" in session && session.artistId) {
          token.artistId = session.artistId as string;
        }
        if ("artistKey" in session && session.artistKey) {
          token.artistKey = session.artistKey as string;
        }
        if ("onboardingComplete" in session && session.onboardingComplete !== undefined) {
          token.onboardingComplete = session.onboardingComplete as boolean;
        }
        if ("role" in session && session.role === "artist") {
          token.role = "artist";
        }
        if ("pendingRegistrationId" in session && session.pendingRegistrationId) {
          token.pendingRegistrationId = session.pendingRegistrationId as string;
        }
        if ("onboardingStatus" in session && session.onboardingStatus) {
          token.onboardingStatus = session.onboardingStatus as string;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? "";
        session.user.role = "artist";
        session.user.email = (token.email as string) ?? session.user.email;
        if (token.artistId) session.user.artistId = token.artistId as string;
        if (token.artistKey) (session.user as { artistKey?: string }).artistKey = token.artistKey as string;
        (session.user as { onboardingComplete?: boolean }).onboardingComplete = token.onboardingComplete === true;
        session.user.mustChangePassword = token.mustChangePassword as boolean | undefined;
        if (token.pendingRegistrationId) {
          (session.user as { pendingRegistrationId?: string }).pendingRegistrationId = token.pendingRegistrationId as string;
        }
        if (token.onboardingStatus) {
          (session.user as { onboardingStatus?: string }).onboardingStatus = token.onboardingStatus as string;
        }
      }
      return session;
    },
  },
};
