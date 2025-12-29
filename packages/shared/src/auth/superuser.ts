/**
 * Superuser Utilities
 *
 * Utilities for checking and managing superuser access.
 */

/**
 * List of superuser emails with unlimited access
 * These users bypass all rate limits, billing checks, and restrictions
 */
const SUPERUSER_EMAILS = [
  "git@davidddundas.com",
];

/**
 * User roles in the system
 */
export type UserRole = "user" | "superuser";

/**
 * Check if an email belongs to a superuser
 * @param email - User email to check
 * @returns true if the email is a superuser
 */
export function isSuperuserEmail(email: string): boolean {
  return SUPERUSER_EMAILS.includes(email.toLowerCase());
}

/**
 * Check if a user role is superuser
 * @param role - User role to check
 * @returns true if the role is superuser
 */
export function isSuperuserRole(role?: string | null): boolean {
  return role === "superuser";
}

/**
 * Check if a user has superuser access
 * This checks both the role field AND the hardcoded email list
 * @param email - User email
 * @param role - User role from database (optional)
 * @returns true if the user is a superuser
 */
export function isSuperuser(email: string, role?: string | null): boolean {
  return isSuperuserRole(role) || isSuperuserEmail(email);
}

/**
 * Get the appropriate role for a user based on their email
 * Use this during user creation/signup to set the correct role
 * @param email - User email
 * @returns 'superuser' if email is in superuser list, otherwise 'user'
 */
export function getRoleForEmail(email: string): UserRole {
  return isSuperuserEmail(email) ? "superuser" : "user";
}

/**
 * Superuser metadata for display purposes
 */
export const SUPERUSER_INFO = {
  badge: "Superuser",
  description: "Unlimited access to all features",
  benefits: [
    "Unlimited tunnel hours",
    "Unlimited bandwidth",
    "No rate limits",
    "Priority support",
    "Access to admin features",
  ],
} as const;
