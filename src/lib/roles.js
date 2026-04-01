export function canManageInventory(role) {
  return role === "admin" || role === "super_admin";
}

export function canManageSales(role) {
  return role === "employee" || role === "admin" || role === "super_admin";
}

export function isSuperAdmin(role) {
  return role === "super_admin";
}
