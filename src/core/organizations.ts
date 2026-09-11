import { readActiveOrganization } from "./config.js";

/**
 * The roles an organization membership can carry.
 *
 * `owner` is Cefense's own, not one of Clerk's two. The authority is the
 * organization_members_role_check CHECK constraint in
 * packages/database/src/schema/control.ts, and tests/contract.test.ts fails
 * when this copy drifts from it.
 */
export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export interface Organization {
  id: string;
  slug: string;
  name: string;
  role: OrganizationRole;
}

export interface OrganizationsResponse {
  organizations: Organization[];
}

export type OrganizationSource = "flag" | "CEFENSE_ORG" | "stored";

export interface ActiveOrganization {
  slug: string;
  source: OrganizationSource;
}

let flagOrganization: string | null = null;

export function setOrganizationFlag(value: string | null | undefined): void {
  flagOrganization = value?.trim() || null;
}

/**
 * Which organization the next request is scoped to, and what decided it.
 *
 * --org wins, then CEFENSE_ORG, then the selection stored for this instance.
 * Nothing at all is a real fourth answer rather than a failure: the API picks
 * when the account belongs to exactly one organization, and answers
 * organization_required when it belongs to none or to several.
 */
export function resolveOrganization(apiUrl: string): ActiveOrganization | null {
  if (flagOrganization) return { slug: flagOrganization, source: "flag" };
  const fromEnvironment = process.env.CEFENSE_ORG?.trim();
  if (fromEnvironment) return { slug: fromEnvironment, source: "CEFENSE_ORG" };
  const stored = readActiveOrganization(apiUrl);
  return stored ? { slug: stored, source: "stored" } : null;
}

export function activeOrganization(apiUrl: string): string | null {
  return resolveOrganization(apiUrl)?.slug ?? null;
}
