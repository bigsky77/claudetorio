import "next-auth";

declare module "next-auth" {
  interface Session {
    oauth_provider?: string;
    oauth_id?: string;
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    oauth_provider?: string;
    oauth_id?: string;
  }
}
