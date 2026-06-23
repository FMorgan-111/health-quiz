import { prisma } from "../db";
import type { SubscriptionTier } from "./tokens";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  subscriptionTier: SubscriptionTier;
}

export interface PublicUser {
  id: string;
  email: string;
  subscriptionTier: SubscriptionTier;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    subscriptionTier: user.subscriptionTier,
  };
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email },
  }) as Promise<UserRecord | null>;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { id },
  }) as Promise<UserRecord | null>;
}

export async function createUser(
  email: string,
  passwordHash: string,
): Promise<UserRecord> {
  return prisma.user.create({
    data: {
      email,
      passwordHash,
    },
  }) as Promise<UserRecord>;
}
