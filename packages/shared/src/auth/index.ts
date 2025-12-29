/**
 * Auth Module
 *
 * Exports Better Auth adapter and utilities.
 */

export { mechStorageAdapter } from "./mech-storage-adapter.js";
export type { MechStorageAdapterConfig } from "./mech-storage-adapter.js";

export {
  isSuperuserEmail,
  isSuperuserRole,
  isSuperuser,
  getRoleForEmail,
  SUPERUSER_INFO,
} from "./superuser.js";
export type { UserRole } from "./superuser.js";
