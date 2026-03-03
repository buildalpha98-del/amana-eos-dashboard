/**
 * Re-export page-access helpers from the canonical role-permissions module.
 *
 * All existing `import { canAccessPage } from "@/lib/permissions"` calls
 * continue to work without any changes.
 */
export {
  canAccessPage,
  getAccessiblePages,
  hasFeature,
  hasMinRole,
} from "./role-permissions";
