import type { Collection, PageKey, Role } from "./types";

export const GOVS = [
  "القاهرة", "الجيزة", "الإسكندرية", "القليوبية", "الشرقية", "الدقهلية", "البحيرة",
  "المنوفية", "الغربية", "كفر الشيخ", "دمياط", "بورسعيد", "الإسماعيلية", "السويس",
  "شمال سيناء", "جنوب سيناء", "الفيوم", "بني سويف", "المنيا", "أسيوط", "سوهاج",
  "قنا", "الأقصر", "أسوان", "البحر الأحمر", "الوادي الجديد", "مطروح", "أخرى",
];

export const EXPENSE_CATEGORIES = [
  "بنزين / سولار", "أجرة سائق", "صيانة العربية", "إيجار المحل", "كهرباء ومياه",
  "رواتب عمال", "شحن وتحميل", "ضرائب ورسوم", "أخرى",
];

export const UNITS = ["لتر", "كيلو", "عبوة", "كرتونة", "جركن"];

export const NAV_ITEMS: { key: PageKey; label: string; icon: string }[] = [
  { key: "dash", label: "لوحة التحكم", icon: "📊" },
  { key: "sales", label: "المبيعات", icon: "💰" },
  { key: "purchases", label: "المشتريات", icon: "🛒" },
  { key: "returns", label: "المرتجعات", icon: "↩️" },
  { key: "expenses", label: "المصروفات", icon: "💸" },
  { key: "traders", label: "التجار", icon: "🏪" },
  { key: "suppliers", label: "الموردون", icon: "🚚" },
  { key: "products", label: "الأصناف والمخزون", icon: "📦" },
  { key: "warehouses", label: "المخازن والتحويلات", icon: "🏭" },
  { key: "reports", label: "التقارير", icon: "📑" },
  { key: "permissions", label: "الأدوار والصلاحيات", icon: "🔐" },
  { key: "content", label: "إدارة المحتوى", icon: "📝" },
];

export const ROLE_LABELS: Record<string, string> = {
  superadmin: "سوبر أدمن",
  admin: "مدير",
  accountant: "محاسب",
  sales: "مندوب مبيعات",
  driver: "سائق / توزيع",
  pending: "بانتظار الموافقة",
};

const PAGE_PERMISSIONS: Partial<Record<PageKey, string>> = {
  dash: "dashboard.read",
  sales: "sales.read",
  purchases: "purchases.read",
  returns: "sales_returns.read",
  expenses: "expenses.read",
  traders: "traders.read",
  suppliers: "suppliers.read",
  products: "products.read",
  warehouses: "warehouses.read",
  reports: "reports.read",
  permissions: "roles.manage",
  content: "content.manage",
};

export function pagesForRole(role: Role, permissions: string[]): PageKey[] {
  if (role === "superadmin") return NAV_ITEMS.map((item) => item.key);
  return NAV_ITEMS.filter((item) =>
    item.key !== "users" && item.key !== "permissions" &&
    (item.key === "returns"
      ? permissions.includes("sales_returns.read") || permissions.includes("purchase_returns.read")
      : permissions.includes(PAGE_PERMISSIONS[item.key] ?? ""))
  ).map((item) => item.key);
}

/** اسم الجدول في قاعدة البيانات لكل مجموعة بيانات. */
export const TABLE_NAMES: Record<Collection, string> = {
  traders: "traders",
  suppliers: "suppliers",
  products: "products",
  warehouses: "warehouses",
  sales: "sales",
  purchases: "purchases",
  salesReturns: "sales_returns",
  purchaseReturns: "purchase_returns",
  transfers: "transfers",
  expenses: "expenses",
  payments: "payments",
};

export const MAIN_WAREHOUSE = { id: "", name: "المخزن الرئيسي", gov: "" };
