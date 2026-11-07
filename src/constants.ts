import type { PageKey } from "./types";

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
  { key: "expenses", label: "المصروفات", icon: "💸" },
  { key: "traders", label: "التجار", icon: "🏪" },
  { key: "suppliers", label: "الموردون", icon: "🚚" },
  { key: "products", label: "المخزون", icon: "📦" },
];
