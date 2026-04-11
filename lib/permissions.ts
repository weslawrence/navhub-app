/**
 * Permission helpers — server-side only.
 * Reads user_permissions table and returns a PermissionMatrix.
 */

import { createAdminClient } from './supabase/admin'
import type { AppRole, FeatureKey, AccessLevel, PermissionMatrix } from './types'
import { FEATURE_KEYS } from './types'

export const ADMIN_ROLES: AppRole[] = ['super_admin', 'group_admin']

/** Build empty matrix with 'none' defaults */
function emptyMatrix(): PermissionMatrix {
  const m = {} as PermissionMatrix
  FEATURE_KEYS.forEach(f => { m[f] = { default: 'none' } })
  return m
}

/** Build full-edit matrix for admins */
function fullEditMatrix(): PermissionMatrix {
  const m = {} as PermissionMatrix
  FEATURE_KEYS.forEach(f => { m[f] = { default: 'edit' } })
  return m
}

/** Get full permission matrix for a user in a group */
export async function getUserPermissions(
  userId: string,
  groupId: string,
  userRole: AppRole,
): Promise<PermissionMatrix> {
  if (ADMIN_ROLES.includes(userRole)) {
    return fullEditMatrix()
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('user_permissions')
    .select('feature, company_id, access')
    .eq('user_id', userId)
    .eq('group_id', groupId)

  const matrix = emptyMatrix()

  for (const row of data ?? []) {
    const feature = row.feature as FeatureKey
    const key = row.company_id ?? 'default'
    if (!matrix[feature]) matrix[feature] = {}
    matrix[feature][key] = row.access as AccessLevel
  }

  return matrix
}

/** Get access level for a specific feature + optional company */
export function getAccess(
  matrix: PermissionMatrix,
  feature: FeatureKey,
  companyId?: string,
): AccessLevel {
  const featurePerms = matrix[feature] ?? {}
  if (companyId && featurePerms[companyId] !== undefined) {
    return featurePerms[companyId]
  }
  return featurePerms['default'] ?? 'none'
}

export function canView(matrix: PermissionMatrix, feature: FeatureKey, companyId?: string): boolean {
  const a = getAccess(matrix, feature, companyId)
  return a === 'view' || a === 'edit'
}

export function canEdit(matrix: PermissionMatrix, feature: FeatureKey, companyId?: string): boolean {
  return getAccess(matrix, feature, companyId) === 'edit'
}

export function canAccessSettings(role: AppRole): boolean {
  return role === 'super_admin' || role === 'group_admin'
}

/** Which features can the user see at all (has view or edit on at least one company or default) */
export function getVisibleFeatures(matrix: PermissionMatrix): FeatureKey[] {
  return (Object.keys(matrix) as FeatureKey[]).filter(f =>
    Object.values(matrix[f]).some(a => a === 'view' || a === 'edit'),
  )
}
