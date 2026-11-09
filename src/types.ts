export interface Party {
  id: string;
  name: string;
  phone: string;
  gov: string;
  openingBalance: number;
}
export type Trader = Party;
export type Supplier = Party;

export interface Product {
  id: string;
  name: string;
  unit: string;
  price: number; // default sale price
  min: number; // low stock threshold
  openingQty: number;
  openingCost: number;
}

export interface Warehouse {
  id: string;
  name: string;
  gov: string;
}

export interface SaleLine {
  productId: string;
  qty: number;
  price: number;
}

export interface PurchaseLine {
  productId: string;
  qty: number;
  cost: number;
  expiry?: string; // تاريخ الصلاحية (اختياري)
}

export interface Sale {
  id: string;
  date: string;
  traderId: string;
  gov: string;
  warehouseId?: string;
  items: SaleLine[];
  paid: number;
  note?: string;
}

export interface Purchase {
  id: string;
  date: string;
  supplierId: string;
  warehouseId?: string;
  items: PurchaseLine[];
  paid: number;
  note?: string;
}

/** مرتجع مبيعات: تاجر رجّع بضاعة (يرجع للمخزن ويقلل مديونيته). */
export interface SalesReturn {
  id: string;
  date: string;
  traderId: string;
  warehouseId?: string;
  items: SaleLine[];
  note?: string;
}

/** مرتجع مشتريات: رجّعنا بضاعة للمورد (تخرج من المخزن وتقلل مستحقاته). */
export interface PurchaseReturn {
  id: string;
  date: string;
  supplierId: string;
  warehouseId?: string;
  items: PurchaseLine[];
  note?: string;
}

export interface TransferLine {
  productId: string;
  qty: number;
}

export interface Transfer {
  id: string;
  date: string;
  fromId: string; // "" = المخزن الرئيسي
  toId: string;
  items: TransferLine[];
  note?: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  gov: string;
  amount: number;
  note: string;
}

export interface Payment {
  id: string;
  date: string;
  type: "trader" | "supplier";
  partyId: string;
  amount: number;
}

export interface DB {
  traders: Trader[];
  suppliers: Supplier[];
  products: Product[];
  warehouses: Warehouse[];
  sales: Sale[];
  purchases: Purchase[];
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
  transfers: Transfer[];
  expenses: Expense[];
  payments: Payment[];
}

export type Collection = keyof DB;
export type Period = "all" | "month" | "year";

export type Role = string;
export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface CompanyService {
  icon: string;
  title: string;
  description: string;
}

export interface LandingSections {
  servicesTitle: string;
  servicesIntro: string;
  aboutTitle: string;
  contactTitle: string;
  contactIntro: string;
}

export interface CompanySettings {
  brandName: string;
  tagline: string;
  intro: string;
  whatsapp: string;
  logoUrl: string;
  bannerUrl: string;
  primaryColor: string;
  services: CompanyService[];
  landingSections: LandingSections;
}

export interface ContentPage {
  id: string;
  title: string;
  body: string;
  published: boolean;
}

export type PageKey =
  | "dash"
  | "sales"
  | "purchases"
  | "returns"
  | "expenses"
  | "traders"
  | "suppliers"
  | "products"
  | "warehouses"
  | "reports"
  | "users"
  | "permissions"
  | "content"
  | `content:${string}`;
