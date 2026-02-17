import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";

// Only enable GitHub OAuth when credentials are configured
const providers: Provider[] = [];
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  callbacks: {
    async jwt({ token, account, profile }) {
      // On initial sign-in, save provider identity into the JWT
      if (account && profile) {
        token.oauth_provider = account.provider;
        token.oauth_id = account.providerAccountId;
        token.picture =
          (profile as Record<string, unknown>).avatar_url as string ||
          token.picture;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose provider identity on the client-side session
      const s = session as unknown as Record<string, unknown>;
      s.oauth_provider = token.oauth_provider;
      s.oauth_id = token.oauth_id;
      if (token.picture) {
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});
