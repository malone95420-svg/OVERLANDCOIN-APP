import type { DefaultSession } from "next-auth";
import type { LoginMethod } from "@/lib/auth/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      accountKey: string;
      loginMethod: LoginMethod;
      address?: string;
    } & DefaultSession["user"];
  }

  interface User {
    accountKey: string;
    loginMethod: LoginMethod;
    address?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accountKey?: string;
    loginMethod?: LoginMethod;
    address?: string;
  }
}
