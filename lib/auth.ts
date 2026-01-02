import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { authCredentialsSchema } from "@/lib/authSchemas";
import { connectMongo } from "@/lib/mongodb";
import { normalizeShopDomain } from "@/lib/shopDomain";
import { UserModel, type UserRole } from "@/models/User";

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
        const filter: Record<string, unknown> = { email, role: { $in: ["team", "artist"] } };
        if (shopDomain) filter.shopDomain = shopDomain;

        const user = await UserModel.findOne(filter).lean();
        if (!user || !user.isActive) return null;

        const isValid = await compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          artistId: user.artistId?.toString(),
          mustChangePassword: user.mustChangePassword,
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
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword;
      }

      if (trigger === "update" && session) {
        if ("mustChangePassword" in session && session.mustChangePassword !== undefined) {
          token.mustChangePassword = session.mustChangePassword as boolean;
        }
        if ("artistId" in session && session.artistId) {
          token.artistId = session.artistId as string;
        }
        if ("role" in session && session.role) {
          token.role = session.role as UserRole;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? "";
        session.user.role = (token.role as UserRole) ?? "artist";
        session.user.email = (token.email as string) ?? session.user.email;
        if (token.artistId) session.user.artistId = token.artistId as string;
        session.user.mustChangePassword = token.mustChangePassword as boolean | undefined;
      }
      return session;
    },
  },
};
