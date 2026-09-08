export const ROLES = {
  OWNER: "owner",
  MANAGER: "manager",
  EMPLOYEE: "employee"
};

export const ROLE_LABELS = {
  [ROLES.EMPLOYEE]: "Funcionário",
  [ROLES.MANAGER]: "Gestor",
  [ROLES.OWNER]: "Administrador do Sistema"
};

export const ROLE_OPTIONS = [
  { value: ROLES.EMPLOYEE, label: ROLE_LABELS[ROLES.EMPLOYEE] },
  { value: ROLES.MANAGER, label: ROLE_LABELS[ROLES.MANAGER] },
  { value: ROLES.OWNER, label: ROLE_LABELS[ROLES.OWNER] }
];

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || "-";
}

export function canSeePurchasePrice(role) {
  return role === ROLES.OWNER || role === ROLES.MANAGER;
}

export function canManageCompanies(role) {
  return role === ROLES.OWNER;
}

export function canViewCompanies(role) {
  return role === ROLES.OWNER || role === ROLES.MANAGER;
}

export function canManageUsers(role) {
  return role === ROLES.OWNER;
}

export function canViewEmployees(role) {
  return role === ROLES.OWNER || role === ROLES.MANAGER;
}

export function canEditCompany(role) {
  return role === ROLES.OWNER || role === ROLES.MANAGER;
}

export function canCreateProduct(role) {
  return role === ROLES.OWNER || role === ROLES.MANAGER;
}

export function canSeeProfit(role) {
  return role === ROLES.OWNER || role === ROLES.MANAGER;
}

export function canDeleteProducts(role) {
  return role === ROLES.OWNER;
}

export function canDeleteHistory(role) {
  return role === ROLES.OWNER;
}

export function canEditProductCompany(role) {
  return role === ROLES.OWNER;
}
