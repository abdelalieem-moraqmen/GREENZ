export interface Party {
  id: string;
  name: string;
  phone: string;
  gov: string;
}
export type Trader = Party;
export type Supplier = Party;

export interface Product {
  id: string;
  name: string;
  unit: string;
  price: number; // default sale price
  min: number; // low stock threshold
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
  items: SaleLine[];
  paid: number;
  note?: string;
}

export interface Purchase {
  id: string;
  date: string;
  supplierId: string;
  items: PurchaseLine[];
  paid: number;
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
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  payments: Payment[];
}

export type Collection = keyof DB;
export type Period = "all" | "month" | "year";
export type PageKey =
  | "dash"
  | "sales"
  | "purchases"
  | "expenses"
  | "traders"
  | "suppliers"
  | "products";
