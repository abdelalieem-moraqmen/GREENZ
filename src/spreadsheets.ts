import type ExcelJS from "exceljs";
import { allocateFefo, avgCost, computeSummary, saleTotal, stockOf, supplierDebt, sum, traderDebt, uid } from "./calc";
import { TABLE_NAMES } from "./constants";
import type { Collection, DB, Purchase, Sale } from "./types";

export const COLLECTION_LABELS: Record<Collection, string> = {
  traders: "التجار",
  suppliers: "الموردون",
  products: "الأصناف",
  warehouses: "المخازن",
  sales: "المبيعات",
  purchases: "المشتريات",
  salesReturns: "مرتجعات المبيعات",
  purchaseReturns: "مرتجعات المشتريات",
  transfers: "التحويلات",
  expenses: "المصروفات",
  payments: "الدفعات",
};

const COLUMNS: Record<Collection, string[]> = {
  traders: ["id", "name", "phone", "gov", "openingBalance"],
  suppliers: ["id", "name", "phone", "gov", "openingBalance"],
  products: ["id", "name", "unit", "price", "min", "openingQty", "openingCost"],
  warehouses: ["id", "name", "gov"],
  sales: ["id", "date", "invoiceNumber", "traderId", "gov", "warehouseId", "items", "paid", "discount", "note"],
  purchases: ["id", "date", "invoiceNumber", "supplierId", "warehouseId", "items", "paid", "discount", "note"],
  salesReturns: ["id", "date", "invoiceNumber", "traderId", "warehouseId", "items", "note"],
  purchaseReturns: ["id", "date", "invoiceNumber", "supplierId", "warehouseId", "items", "note"],
  transfers: ["id", "date", "fromId", "toId", "items", "note"],
  expenses: ["id", "date", "category", "gov", "amount", "note"],
  payments: ["id", "date", "type", "partyId", "amount"],
};

const NUMERIC_FIELDS = new Set([
  "qty", "price", "cost", "paid", "amount", "min",
  "openingBalance", "openingQty", "openingCost", "discount",
]);

interface LegacyColumn {
  header: string;
  key: string;
}

interface LegacyLayout {
  sheetNames: string[];
  columns: LegacyColumn[];
}

const LEGACY_LAYOUTS: Partial<Record<Collection, LegacyLayout>> = {
  products: {
    sheetNames: ["المخزن"],
    columns: [
      { header: "كود الصنف", key: "id" },
      { header: "أسم الصنف", key: "name" },
      { header: "الرصيد الافتتاحي", key: "openingQty" },
      { header: "السعر الافتتاحي", key: "openingCost" },
      { header: "الاجمالي سعر الرصيد", key: "openingValue" },
      { header: "إجمالي الكمية المشتراة", key: "purchasedQty" },
      { header: "إجمالي الكمية المباعة", key: "soldQty" },
      { header: "الرصيد المتبقي", key: "remainingQty" },
      { header: "أخر سعر شراء", key: "lastPurchaseCost" },
      { header: "اجمالي قيمة الباقي بالخزن", key: "remainingValue" },
    ],
  },
  traders: {
    sheetNames: ["العملاء"],
    columns: [
      { header: "كود العميل", key: "id" },
      { header: "أسم العميل", key: "name" },
      { header: "الرصيد الافتتاحي ( دين سابق )", key: "openingBalance" },
      { header: "اجمالي الدين الحالي", key: "currentBalance" },
      { header: "رقم الهاتف", key: "phone" },
      { header: "العنوان", key: "gov" },
    ],
  },
  suppliers: {
    sheetNames: ["الموردين"],
    columns: [
      { header: "كود الشركه", key: "id" },
      { header: "أسم الشركه", key: "name" },
      { header: "رقم التليفون", key: "phone" },
      { header: "الرصيد الافتتاحي", key: "openingBalance" },
      { header: "الرصيد المتبقي للمورد", key: "currentBalance" },
    ],
  },
  sales: {
    sheetNames: ["المبيعات المجمعة", "المبيعات المجمعه"],
    columns: [
      { header: "التاريخ", key: "date" },
      { header: "رقم الفاتوره", key: "invoiceNumber" },
      { header: "اسم العميل", key: "partyName" },
      { header: "البيان", key: "productName" },
      { header: "عدد الوحدات المباعه", key: "qty" },
      { header: "مرتجع", key: "returnQty" },
      { header: "قيمة الوحده", key: "unitPrice" },
      { header: "قيمة الفاتوره", key: "lineTotal" },
      { header: "المبلغ المدفوع", key: "paid" },
      { header: "المتبقي للعميل / عليه", key: "due" },
      { header: "خصم", key: "discount" },
    ],
  },
  salesReturns: {
    sheetNames: ["المبيعات المجمعه", "المبيعات المجمعة"],
    columns: [
      { header: "التاريخ", key: "date" },
      { header: "رقم الفاتوره", key: "invoiceNumber" },
      { header: "اسم العميل", key: "partyName" },
      { header: "البيان", key: "productName" },
      { header: "عدد الوحدات المباعه", key: "qty" },
      { header: "مرتجع", key: "returnQty" },
      { header: "قيمة الوحده", key: "unitPrice" },
      { header: "قيمة الفاتوره", key: "lineTotal" },
      { header: "المبلغ المدفوع", key: "paid" },
      { header: "المتبقي للعميل / عليه", key: "due" },
      { header: "خصم", key: "discount" },
    ],
  },
  purchases: {
    sheetNames: ["المشتريات المجمعة", "المشتريات المجمعه"],
    columns: [
      { header: "التاريخ", key: "date" },
      { header: "رقم الفاتوره", key: "invoiceNumber" },
      { header: "أسم الشركه", key: "partyName" },
      { header: "البيان", key: "productName" },
      { header: "عدد الوحدات المشتراه", key: "qty" },
      { header: "مرتجع", key: "returnQty" },
      { header: "سعر الوحده", key: "unitPrice" },
      { header: "قيمة الفاتوره", key: "lineTotal" },
      { header: "المبلغ المدفوع", key: "paid" },
      { header: "المبلغ المتبقي", key: "due" },
      { header: "خصم", key: "discount" },
      { header: "رقم التشغيلة", key: "batchNumber" },
      { header: "تاريخ الصلاحية", key: "expiry" },
    ],
  },
  purchaseReturns: {
    sheetNames: ["المشتريات المجمعه", "المشتريات المجمعة"],
    columns: [
      { header: "التاريخ", key: "date" },
      { header: "رقم الفاتوره", key: "invoiceNumber" },
      { header: "أسم الشركه", key: "partyName" },
      { header: "البيان", key: "productName" },
      { header: "عدد الوحدات المشتراه", key: "qty" },
      { header: "مرتجع", key: "returnQty" },
      { header: "سعر الوحده", key: "unitPrice" },
      { header: "قيمة الفاتوره", key: "lineTotal" },
      { header: "المبلغ المدفوع", key: "paid" },
      { header: "المبلغ المتبقي", key: "due" },
      { header: "خصم", key: "discount" },
      { header: "رقم التشغيلة", key: "batchNumber" },
      { header: "تاريخ الصلاحية", key: "expiry" },
    ],
  },
  expenses: {
    sheetNames: ["المصروفات"],
    columns: [
      { header: "التاريخ", key: "date" },
      { header: "البيان", key: "category" },
      { header: "المبلغ المدفوع", key: "amount" },
    ],
  },
};

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) return value.result ?? "";
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value) return value.richText.map((item) => item.text).join("");
    if ("result" in value) return value.result ?? "";
    if ("hyperlink" in value) return value.text ?? value.hyperlink;
    return value;
  }
  return value;
}

function normalizeRow(collection: Collection, row: Record<string, unknown>, rowNumber: number) {
  const allowed = new Set(COLUMNS[collection]);
  const normalized: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(row)) {
    if (!allowed.has(key) || raw === null || raw === undefined || raw === "") continue;
    let value = raw;
    if (key === "items" && typeof value === "string") {
      try { value = JSON.parse(value); } catch { throw new Error(`عمود الأصناف يحتوي JSON غير صالح في الصف ${rowNumber}.`); }
    }
    if (key === "items" && !Array.isArray(value)) throw new Error(`عمود الأصناف يجب أن يحتوي قائمة JSON في الصف ${rowNumber}.`);
    if (NUMERIC_FIELDS.has(key)) {
      const number = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(number)) throw new Error(`القيمة في عمود ${key} غير رقمية في الصف ${rowNumber}.`);
      value = number;
    } else if (key === "id" || key.endsWith("Id") || key === "invoiceNumber" || key === "type" || key === "date") {
      value = String(value).trim();
    } else if (typeof value !== "string" && key !== "items") {
      value = String(value);
    }
    normalized[key] = value;
  }

  const requiredByCollection: Partial<Record<Collection, string[]>> = {
    traders: ["name"],
    suppliers: ["name"],
    products: ["name"],
    warehouses: ["name"],
    sales: ["date", "traderId", "items"],
    purchases: ["date", "supplierId", "items"],
    salesReturns: ["date", "traderId", "items"],
    purchaseReturns: ["date", "supplierId", "items"],
    transfers: ["date", "fromId", "toId", "items"],
    expenses: ["date", "category", "amount"],
    payments: ["date", "type", "partyId", "amount"],
  };
  const missing = (requiredByCollection[collection] ?? []).filter((key) => normalized[key] === undefined);
  if (missing.length) throw new Error(`الصف ${rowNumber} في ورقة ${COLLECTION_LABELS[collection]} ينقصه: ${missing.join("، ")}.`);
  for (const key of ["price", "min", "paid", "amount", "discount"]) {
    if (typeof normalized[key] === "number" && (normalized[key] as number) < 0)
      throw new Error(`القيمة في عمود ${key} لا يمكن أن تكون سالبة (الصف ${rowNumber}).`);
  }
  for (const key of ["openingQty", "openingCost"]) {
    if (typeof normalized[key] === "number" && (normalized[key] as number) < 0)
      throw new Error(`القيمة في عمود ${key} لا يمكن أن تكون سالبة (الصف ${rowNumber}).`);
  }
  if ("date" in normalized && !/^\d{4}-\d{2}-\d{2}$/.test(String(normalized.date)))
    throw new Error(`التاريخ في الصف ${rowNumber} يجب أن يكون بصيغة YYYY-MM-DD.`);
  if (Array.isArray(normalized.items)) {
    const linePriceField = collection === "sales" || collection === "salesReturns" ? "price"
      : collection === "purchases" || collection === "purchaseReturns" ? "cost" : undefined;
    const batchIds = new Set<string>();
    for (const [lineIndex, line] of normalized.items.entries()) {
      if (!line || typeof line !== "object" || Array.isArray(line))
        throw new Error(`بيانات الصنف رقم ${lineIndex + 1} غير صالحة في الصف ${rowNumber}.`);
      const item = line as Record<string, unknown>;
      const qty = Number(item.qty);
      if (typeof item.productId !== "string" || !item.productId || !Number.isFinite(qty) || qty <= 0)
        throw new Error(`معرّف الصنف والكمية الموجبة مطلوبان في الصف ${rowNumber}.`);
      item.qty = qty;
      if (linePriceField) {
        const price = Number(item[linePriceField]);
        if (!Number.isFinite(price) || price < 0)
          throw new Error(`السعر أو التكلفة غير صالحين في الصف ${rowNumber}.`);
        item[linePriceField] = price;
      }
      if (collection === "purchases") {
        if (typeof item.batchNumber !== "string" || !item.batchNumber.trim())
          throw new Error(`رقم التشغيلة مطلوب للصنف رقم ${lineIndex + 1} في الصف ${rowNumber}.`);
        if (typeof item.expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.expiry))
          throw new Error(`تاريخ الصلاحية مطلوب للصنف رقم ${lineIndex + 1} في الصف ${rowNumber}.`);
        item.batchNumber = item.batchNumber.trim();
        const expiry = parseLegacyDate(item.expiry, rowNumber);
        item.expiry = expiry;
        if (typeof normalized.date === "string" && expiry < normalized.date)
          throw new Error(`تاريخ صلاحية التشغيلة يسبق تاريخ الشراء في الصف ${rowNumber}.`);
        if (typeof item.batchId !== "string" || !item.batchId)
          item.batchId = `import:${String(normalized.id ?? rowNumber)}:${lineIndex}`;
        const batchId = String(item.batchId);
        if (batchIds.has(batchId))
          throw new Error(`معرّف التشغيلة مكرر في الصف ${rowNumber}.`);
        batchIds.add(batchId);
      }
    }
  }
  if ((collection === "sales" || collection === "purchases") && Array.isArray(normalized.items)) {
    const total = normalized.items.reduce((sum, item) => {
      const line = item as Record<string, unknown>;
      const price = Number(line[collection === "sales" ? "price" : "cost"]);
      return sum + Number(line.qty) * price;
    }, 0);
    if (typeof normalized.discount === "number" && normalized.discount > total)
      throw new Error(`الخصم أكبر من إجمالي الفاتورة في الصف ${rowNumber}.`);
    if (typeof normalized.paid === "number" && normalized.paid > total - Number(normalized.discount ?? 0))
      throw new Error(`المدفوع أكبر من إجمالي الفاتورة في الصف ${rowNumber}.`);
  }
  if (collection === "payments" && normalized.type !== "trader" && normalized.type !== "supplier")
    throw new Error(`نوع الدفعة غير صالح في الصف ${rowNumber}؛ استخدم trader أو supplier.`);
  if (collection === "transfers" && normalized.fromId === normalized.toId)
    throw new Error(`لا يمكن التحويل من المخزن إلى نفسه (الصف ${rowNumber}).`);
  if (collection === "sales" && !("gov" in normalized)) normalized.gov = "";
  if (collection === "expenses" && !("gov" in normalized)) normalized.gov = "";
  return normalized;
}

export async function exportWorkbook(
  collections: Collection[],
  db: DB,
  filename = "بيانات-المميز.xlsx",
  includeRows = true,
  fullWorkbook = false,
) {
  const { default: ExcelJSModule } = await import("exceljs");
  const workbook = new ExcelJSModule.Workbook();
  workbook.creator = "المميز للخدمات الزراعية";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const exportCollections = fullWorkbook
    ? collections.filter((collection) => !!LEGACY_LAYOUTS[collection])
    : collections;
  for (const collection of exportCollections) {
    const legacy = LEGACY_LAYOUTS[collection];
    if ((collection === "salesReturns" && collections.includes("sales")) ||
      (collection === "purchaseReturns" && collections.includes("purchases"))) continue;
    const sheet = workbook.addWorksheet(legacy?.sheetNames[0] ?? collection);
    const columns = COLUMNS[collection];
    const sheetColumns = legacy?.columns ?? columns.map((key) => ({ header: key, key }));
    sheet.columns = sheetColumns.map(({ header, key }) => ({
      header, key, width: Math.max(14, header.length + 3),
    }));
    if (includeRows) {
      if (legacy) {
        for (const row of legacyExportRows(collection, db)) sheet.addRow(row);
      } else {
        for (const row of db[collection] as unknown as Record<string, unknown>[]) {
          const values = Object.fromEntries(columns.map((key) => {
            const value = row[key];
            return [key, value !== null && typeof value === "object" ? JSON.stringify(value) : value ?? ""];
          }));
          sheet.addRow(values);
        }
      }
    }
    sheet.views = [{ state: "frozen", ySplit: 1, rightToLeft: true }];
    sheet.getRow(1).font = { bold: true, color: { argb: "FF14532D" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F6EC" } };
    sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(sheetColumns.length).letter}${Math.max(1, sheet.rowCount)}` };
  }
  if (fullWorkbook) {
    if (!includeRows) {
      for (const collection of ["products", "traders", "sales", "expenses", "suppliers", "purchases"] as Collection[]) {
        const layout = LEGACY_LAYOUTS[collection]!;
        if (!workbook.getWorksheet(layout.sheetNames[0])) {
          const sheet = workbook.addWorksheet(layout.sheetNames[0]);
          sheet.columns = layout.columns.map(({ header, key }) => ({ header, key, width: Math.max(14, header.length + 3) }));
          sheet.views = [{ state: "frozen", ySplit: 1, rightToLeft: true }];
          sheet.getRow(1).font = { bold: true, color: { argb: "FF14532D" } };
          sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F6EC" } };
        }
      }
    }
    const hasFullDataAccess = (Object.keys(COLUMNS) as Collection[])
      .every((collection) => collections.includes(collection));
    if (!includeRows || hasFullDataAccess) addClientReportSheets(workbook, db, includeRows);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function addClientReportSheets(workbook: ExcelJS.Workbook, db: DB, includeRows: boolean) {
  const statementHeaders = [
    "التاريخ", "رقم الفاتوره", "البيان", "عدد الوحدات المباعه", "مرتجع", "قيمة الوحده",
    "Sum of قيمة الفاتوره", "Sum of خصم", "Sum of المبلغ المدفوع", "Sum of المتبقي للعميل / عليه",
  ];
  const customerStatement = workbook.getWorksheet("كشف حساب العميل") ?? workbook.addWorksheet("كشف حساب العميل");
  customerStatement.mergeCells("C1:G1");
  customerStatement.getCell("C1").value = "المميز للخدمات الزراعية";
  customerStatement.mergeCells("C3:E3");
  customerStatement.getCell("C3").value = "كشف حساب عميل";
  customerStatement.getCell("A5").value = "اسم العميل";
  customerStatement.getCell("D5").value = "الرصيد السابق";
  customerStatement.getCell("G5").value = "إجمالي المطلوب النهائي";
  customerStatement.getRow(8).values = [undefined, ...statementHeaders];
  if (includeRows) customerStatement.getCell("A10").value = "افتح كشف حساب العميل من شاشة التجار لاختيار الحساب المطلوب.";
  customerStatement.views = [{ state: "frozen", ySplit: 8, rightToLeft: true }];

  const supplierStatement = workbook.getWorksheet("كشف حساب المورد") ?? workbook.addWorksheet("كشف حساب المورد");
  supplierStatement.getCell("A1").value = "أسم الشركه";
  supplierStatement.getCell("F3").value = "Values";
  supplierStatement.getRow(4).values = [undefined,
    "التاريخ", "رقم الفاتوره", "البيان", "مرتجع", "سعر الوحده", "Sum of قيمة الفاتوره",
    "Count of خصم", "Sum of المبلغ المدفوع", "Sum of المبلغ المتبقي",
  ];
  if (includeRows) supplierStatement.getCell("A6").value = "افتح كشف حساب المورد من شاشة الموردين لاختيار الحساب المطلوب.";
  supplierStatement.views = [{ state: "frozen", ySplit: 4, rightToLeft: true }];

  const summary = computeSummary(db, "all");
  const openingInventory = sum(db.products, (product) =>
    (product.openingQty ?? 0) * (product.openingCost ?? 0));
  const grossSales = sum(db.sales, (sale) =>
    sale.items.reduce((total, item) => total + item.qty * item.price, 0));
  const grossPurchases = sum(db.purchases, (purchase) =>
    purchase.items.reduce((total, item) => total + item.qty * item.cost, 0));
  const customerDiscounts = sum(db.sales, (sale) => sale.discount ?? 0);
  const supplierDiscounts = sum(db.purchases, (purchase) => purchase.discount ?? 0);
  const profitRows: [string, number][] = [
    ["إجمالي قيمة المبيعات", grossSales],
    ["بضاعة أول المده", openingInventory],
    ["إجمالي المشتريات", grossPurchases],
    ["بضاعة أخر المده", summary.stockValue],
    ["تكلفة البضاعه المباعه", summary.revenue - summary.gross],
    ["إجمالي الخصومات للعملاء", customerDiscounts],
    ["إجمالي الخصومات المكتسبه", supplierDiscounts],
    ["مجمل الارباح", summary.gross],
    ["إجمالي المصروفات", summary.expenses],
    ["صافي الارباح", summary.net],
  ];
  const profitLoss = workbook.getWorksheet("الأرباح والخسائر") ?? workbook.addWorksheet("الأرباح والخسائر");
  profitRows.forEach(([label, amount], index) => {
    profitLoss.getCell(index + 1, 1).value = label;
    if (includeRows) profitLoss.getCell(index + 1, 2).value = amount;
  });
  profitLoss.views = [{ rightToLeft: true }];

  const currentAssets = summary.cash + summary.stockValue + summary.owedByTraders;
  const balanceRows = [
    { row: 2, assets: "الاصول", liabilities: "الخصوم" },
    { row: 3, assets: "الاصول المتداوله", liabilities: "حقوق الملكيه" },
    { row: 4, assets: "نقديه", assetsValue: summary.cash, liabilities: "رأس المال" },
    { row: 5, assets: "بضاعة أخر المده", assetsValue: summary.stockValue, liabilities: "صافي الارباح", liabilitiesValue: summary.net },
    { row: 6, assets: "اجمالي ديون العملاء", assetsValue: summary.owedByTraders, liabilities: "إجمالي حقوق" },
    { row: 7, assets: "إجمالي الاصول المتداوله", assetsValue: currentAssets, liabilities: "الخصوم المتداوله" },
    { row: 8, assets: "الاصول الثابته", liabilities: "اجمالي ديون الموردين", liabilitiesValue: summary.owedToSuppliers },
    { row: 9, assets: "إجمالي الاصول الثابته", liabilities: "إجمالي الخصوم", liabilitiesValue: summary.owedToSuppliers },
    { row: 10, assets: "إجمالي الاصول", liabilities: "إجمالي الخصوم وحقوق الملكيه" },
  ];
  const balanceSheet = workbook.getWorksheet("المركز المالي") ?? workbook.addWorksheet("المركز المالي");
  balanceRows.forEach((entry) => {
    balanceSheet.getCell(entry.row, 1).value = entry.assets;
    balanceSheet.getCell(entry.row, 3).value = entry.liabilities;
    if (includeRows) {
      if ("assetsValue" in entry) balanceSheet.getCell(entry.row, 2).value = entry.assetsValue;
      if ("liabilitiesValue" in entry) balanceSheet.getCell(entry.row, 4).value = entry.liabilitiesValue;
    }
  });
  balanceSheet.views = [{ rightToLeft: true }];
}

function legacyExportRows(collection: Collection, db: DB): Record<string, unknown>[] {
  if (collection === "products") {
    return db.products.map((product) => {
      const purchases = db.purchases.flatMap((purchase) =>
        purchase.items.filter((item) => item.productId === product.id).map((item) => ({ purchase, item })));
      const lastPurchase = purchases.sort((a, b) => b.purchase.date.localeCompare(a.purchase.date))[0];
      const remaining = stockOf(db, product.id);
      return {
        id: product.id,
        name: product.name,
        openingQty: product.openingQty ?? 0,
        openingCost: product.openingCost ?? 0,
        openingValue: (product.openingQty ?? 0) * (product.openingCost ?? 0),
        purchasedQty: purchases.reduce((total, entry) => total + entry.item.qty, 0),
        soldQty: db.sales.reduce((total, sale) =>
          total + sale.items.reduce((quantity, item) => quantity + (item.productId === product.id ? item.qty : 0), 0), 0),
        remainingQty: remaining,
        lastPurchaseCost: lastPurchase?.item.cost ?? 0,
        remainingValue: Math.max(0, remaining) * avgCost(db, product.id),
      };
    });
  }
  if (collection === "traders") {
    return db.traders.map((trader) => ({
      id: trader.id,
      name: trader.name,
      openingBalance: trader.openingBalance ?? 0,
      currentBalance: traderDebt(db, trader.id),
      phone: trader.phone,
      gov: trader.gov,
    }));
  }
  if (collection === "suppliers") {
    return db.suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      openingBalance: supplier.openingBalance ?? 0,
      currentBalance: supplierDebt(db, supplier.id),
    }));
  }
  if (collection === "sales" || collection === "salesReturns") {
    const rows: Record<string, unknown>[] = [];
    if (collection === "sales") {
      const includedReturns = new Set<string>();
      for (const sale of db.sales) {
        const trader = db.traders.find((party) => party.id === sale.traderId);
        const gross = sale.items.reduce((total, item) => total + item.qty * item.price, 0);
        for (const [index, item] of sale.items.entries()) {
          const lineTotal = item.qty * item.price;
          const weight = gross ? lineTotal / gross : 0;
          const paid = index === sale.items.length - 1
            ? sale.paid - sale.items.slice(0, index).reduce((total, line) => total + (gross ? sale.paid * line.qty * line.price / gross : 0), 0)
            : sale.paid * weight;
          const discount = index === sale.items.length - 1
            ? (sale.discount ?? 0) - sale.items.slice(0, index).reduce((total, line) => total + (gross ? (sale.discount ?? 0) * line.qty * line.price / gross : 0), 0)
            : (sale.discount ?? 0) * weight;
          const returned = db.salesReturns
            .filter((entry) => !!sale.invoiceNumber && entry.invoiceNumber === sale.invoiceNumber && entry.traderId === sale.traderId)
            .flatMap((entry) => entry.items)
            .filter((line) => line.productId === item.productId)
            .reduce((total, line) => total + line.qty, 0);
          if (returned) includedReturns.add(`${sale.invoiceNumber}\u0000${sale.traderId}\u0000${item.productId}`);
          rows.push({
            date: sale.date,
            invoiceNumber: sale.invoiceNumber || sale.id,
            partyName: trader?.name ?? "",
            productName: db.products.find((product) => product.id === item.productId)?.name ?? "",
            qty: item.qty,
            returnQty: returned,
            unitPrice: item.price,
            lineTotal,
            paid,
            due: lineTotal - paid - discount,
            discount,
          });
        }
      }
      for (const entry of db.salesReturns) {
        const trader = db.traders.find((party) => party.id === entry.traderId);
        for (const item of entry.items) {
          if (includedReturns.has(`${entry.invoiceNumber}\u0000${entry.traderId}\u0000${item.productId}`)) continue;
          rows.push({
            date: entry.date,
            invoiceNumber: entry.invoiceNumber ?? "",
            partyName: trader?.name ?? "",
            productName: db.products.find((product) => product.id === item.productId)?.name ?? "",
            qty: 0,
            returnQty: item.qty,
            unitPrice: item.price,
            lineTotal: 0,
            paid: 0,
            due: 0,
            discount: 0,
          });
        }
      }
    } else {
      for (const entry of db.salesReturns) {
        const trader = db.traders.find((party) => party.id === entry.traderId);
        for (const item of entry.items) rows.push({
          date: entry.date,
          invoiceNumber: entry.invoiceNumber ?? "",
          partyName: trader?.name ?? "",
          productName: db.products.find((product) => product.id === item.productId)?.name ?? "",
          qty: 0,
          returnQty: item.qty,
          unitPrice: item.price,
          lineTotal: 0,
          paid: 0,
          due: 0,
          discount: 0,
        });
      }
    }
    return rows;
  }
  if (collection === "purchases" || collection === "purchaseReturns") {
    const rows: Record<string, unknown>[] = [];
    if (collection === "purchases") {
      const includedReturns = new Set<string>();
      for (const purchase of db.purchases) {
        const supplier = db.suppliers.find((party) => party.id === purchase.supplierId);
        const gross = purchase.items.reduce((total, item) => total + item.qty * item.cost, 0);
        purchase.items.forEach((item, index) => {
          const lineTotal = item.qty * item.cost;
          const weight = gross ? lineTotal / gross : 0;
          const paid = index === purchase.items.length - 1
            ? purchase.paid - purchase.items.slice(0, index).reduce((total, line) => total + (gross ? purchase.paid * line.qty * line.cost / gross : 0), 0)
            : purchase.paid * weight;
          const discount = index === purchase.items.length - 1
            ? (purchase.discount ?? 0) - purchase.items.slice(0, index).reduce((total, line) => total + (gross ? (purchase.discount ?? 0) * line.qty * line.cost / gross : 0), 0)
            : (purchase.discount ?? 0) * weight;
          const returned = db.purchaseReturns
            .filter((entry) => !!purchase.invoiceNumber && entry.invoiceNumber === purchase.invoiceNumber && entry.supplierId === purchase.supplierId)
            .flatMap((entry) => entry.items)
            .filter((line) => line.productId === item.productId)
            .reduce((total, line) => total + line.qty, 0);
          if (returned) includedReturns.add(`${purchase.invoiceNumber}\u0000${purchase.supplierId}\u0000${item.productId}`);
          rows.push({
            date: purchase.date,
            invoiceNumber: purchase.invoiceNumber || purchase.id,
            partyName: supplier?.name ?? "",
            productName: db.products.find((product) => product.id === item.productId)?.name ?? "",
            qty: item.qty,
            returnQty: returned,
            unitPrice: item.cost,
            lineTotal,
            paid,
            due: lineTotal - paid - discount,
            discount,
            batchNumber: item.batchNumber ?? "",
            expiry: item.expiry ?? "",
          });
        });
      }
      for (const entry of db.purchaseReturns) {
        const supplier = db.suppliers.find((party) => party.id === entry.supplierId);
        for (const item of entry.items) {
          if (includedReturns.has(`${entry.invoiceNumber}\u0000${entry.supplierId}\u0000${item.productId}`)) continue;
          rows.push({
            date: entry.date,
            invoiceNumber: entry.invoiceNumber ?? "",
            partyName: supplier?.name ?? "",
            productName: db.products.find((product) => product.id === item.productId)?.name ?? "",
            qty: 0,
            returnQty: item.qty,
            unitPrice: item.cost,
            lineTotal: 0,
            paid: 0,
            due: 0,
            discount: 0,
            batchNumber: item.batchNumber ?? "",
            expiry: item.expiry ?? "",
          });
        }
      }
    } else {
      for (const entry of db.purchaseReturns) {
        const supplier = db.suppliers.find((party) => party.id === entry.supplierId);
        for (const item of entry.items) rows.push({
          date: entry.date,
          invoiceNumber: entry.invoiceNumber ?? "",
          partyName: supplier?.name ?? "",
          productName: db.products.find((product) => product.id === item.productId)?.name ?? "",
          qty: 0,
          returnQty: item.qty,
          unitPrice: item.cost,
          lineTotal: 0,
          paid: 0,
          due: 0,
          discount: 0,
          batchNumber: item.batchNumber ?? "",
          expiry: item.expiry ?? "",
        });
      }
    }
    return rows;
  }
  if (collection === "expenses") {
    return db.expenses.map((expense) => ({
      date: expense.date, category: expense.category, amount: expense.amount,
    }));
  }
  return [];
}

export async function importWorkbook(file: File, allowedCollections: Collection[], db: DB) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("ارفع ملف Excel بصيغة .xlsx.");
  if (file.size > 20 * 1024 * 1024) throw new Error("حجم ملف Excel يجب ألا يتجاوز 20 ميجابايت.");
  const { default: ExcelJSModule } = await import("exceljs");
  const workbook = new ExcelJSModule.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("تعذر قراءة الملف. إذا كان محمياً بكلمة مرور أو بصيغة Excel قديمة، افتحه في Excel واحفظ نسخة .xlsx غير محمية ثم ارفعها.");
  }

  const imports: Partial<Record<Collection, Record<string, unknown>[]>> = {};
  const warnings: string[] = [];
  for (const collection of allowedCollections) {
    const sheet = workbook.getWorksheet(collection);
    if (sheet && sheet.rowCount >= 2) {
      const rows = importGenericSheet(sheet, collection);
      if (rows.length) {
        imports[collection] = rows;
        continue;
      }
    }

    const legacy = findLegacySheet(workbook, collection);
    if (!legacy) continue;
    let rows: Record<string, unknown>[] = [];
    if (collection === "products" || collection === "traders" || collection === "suppliers") {
      const parsed = importLegacyMasterSheet(legacy, collection);
      rows = parsed.rows;
      warnings.push(...parsed.warnings);
    } else if (collection === "sales" || collection === "salesReturns" ||
      collection === "purchases" || collection === "purchaseReturns") {
      rows = importLegacyInvoices(legacy, collection, db, warnings);
    } else if (collection === "expenses") {
      rows = importLegacyExpenses(legacy, warnings);
    }
    if (rows.length) imports[collection] = rows;
  }
  if (imports.sales?.length) {
    imports.sales = allocateImportedSales(imports.sales, imports.purchases ?? [], db);
  }
  return { rows: imports, warnings };
}

function allocateImportedSales(
  rows: Record<string, unknown>[],
  importedPurchases: Record<string, unknown>[],
  db: DB,
) {
  const purchases = new Map(db.purchases.map((purchase) => [purchase.id, purchase]));
  importedPurchases.forEach((row, index) => {
    const purchase = { ...row, id: String(row.id ?? `pending-purchase-${index}`) } as unknown as Purchase;
    purchases.set(purchase.id, purchase);
  });
  const projected: DB = { ...db, purchases: [...purchases.values()], sales: [...db.sales] };
  const result = new Array<Record<string, unknown>>(rows.length);
  const ordered = rows.map((row, index) => ({
    row: { ...row, id: String(row.id ?? uid()) } as unknown as Sale,
    index,
  })).sort((a, b) => a.row.date.localeCompare(b.row.date) || a.index - b.index);

  for (const { row, index } of ordered) {
    projected.sales = projected.sales.filter((sale) => sale.id !== row.id);
    const dateDb: DB = {
      ...projected,
      purchases: projected.purchases.filter((purchase) => purchase.date <= row.date),
      sales: projected.sales.filter((sale) => sale.date <= row.date),
      salesReturns: projected.salesReturns.filter((entry) => entry.date <= row.date),
      purchaseReturns: projected.purchaseReturns.filter((entry) => entry.date <= row.date),
      transfers: projected.transfers.filter((transfer) => transfer.date <= row.date),
    };
    const requestedByProduct = new Map<string, number>();
    row.items.forEach((item) => requestedByProduct.set(
      item.productId, (requestedByProduct.get(item.productId) ?? 0) + item.qty,
    ));
    const allocations = new Map<string, { batchId: string; qty: number }[]>();
    for (const [productId, qty] of requestedByProduct) {
      const allocation = allocateFefo(dateDb, productId, qty, row.warehouseId ?? "");
      if (allocation.missing > 0) {
        const label = row.invoiceNumber ? `الفاتورة ${row.invoiceNumber}` : `المؤرخة ${row.date}`;
        const productName = db.products.find((product) => product.id === productId)?.name ?? productId;
        throw new Error(
          `تعذر استيراد ${label}: المتاح غير المنتهي ${allocation.available} من ${qty} للصنف ${productName}.`,
        );
      }
      allocations.set(productId, allocation.allocations);
    }

    const items = row.items.map((item) => {
      const queue = allocations.get(item.productId) ?? [];
      let remaining = item.qty;
      const batchAllocations: { batchId: string; qty: number }[] = [];
      while (remaining > 0 && queue.length) {
        const first = queue[0];
        const qty = Math.min(remaining, first.qty);
        batchAllocations.push({ batchId: first.batchId, qty });
        first.qty -= qty;
        remaining -= qty;
        if (first.qty <= 0) queue.shift();
      }
      return { ...item, batchAllocations };
    });
    const sale = { ...row, items };
    projected.sales.push(sale);
    result[index] = sale;
  }
  return result;
}

function importGenericSheet(sheet: ExcelJS.Worksheet, collection: Collection) {
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, column) => { headers[column] = String(cellValue(cell.value) ?? "").trim(); });
  const allowed = new Set(COLUMNS[collection]);
  const unknownHeaders = headers.filter((header) => header && !allowed.has(header));
  if (unknownHeaders.length) throw new Error(`أعمدة غير معروفة في ورقة ${COLLECTION_LABELS[collection]}: ${unknownHeaders.join("، ")}.`);
  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, unknown> = {};
    headers.forEach((header, column) => {
      if (header) values[header] = cellValue(row.getCell(column).value);
    });
    if (Object.values(values).some((value) => value !== null && value !== undefined && value !== "")) {
      rows.push(normalizeRow(collection, values, rowNumber));
    }
  });
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (typeof row.id !== "string" || !row.id) continue;
    if (ids.has(row.id)) throw new Error(`المعرّف ${row.id} مكرر في ورقة ${COLLECTION_LABELS[collection]} (الصف ${index + 2}).`);
    ids.add(row.id);
  }
  return rows;
}

function normalizeArabic(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[()ـ_\-:：]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findLegacySheet(workbook: ExcelJS.Workbook, collection: Collection) {
  const layout = LEGACY_LAYOUTS[collection];
  if (!layout) return undefined;
  const acceptedNames = new Set(layout.sheetNames.map(normalizeArabic));
  return workbook.worksheets.find((sheet) => acceptedNames.has(normalizeArabic(sheet.name)));
}

const invoiceHeaders: Record<string, string[]> = {
  date: ["التاريخ"],
  invoiceNumber: ["رقم الفاتوره", "رقم الفاتورة"],
  partyName: ["اسم العميل", "اسم الشركه", "اسم الشركة"],
  productName: ["البيان", "اسم الصنف", "اسم المنتج"],
  qty: ["عدد الوحدات المباعه", "عدد الوحدات المباعة", "عدد الوحدات المشتراه", "عدد الوحدات المشتراة"],
  returnQty: ["مرتجع", "المرتجع"],
  unitPrice: ["قيمة الوحده", "قيمة الوحدة", "سعر الوحده", "سعر الوحدة"],
  lineTotal: ["قيمة الفاتوره", "قيمة الفاتورة"],
  paid: ["المبلغ المدفوع"],
  due: ["المتبقي للعميل عليه", "المتبقي للعميل", "المبلغ المتبقي"],
  discount: ["خصم", "الخصم"],
  batchNumber: ["رقم التشغيلة", "رقم التشغيلة/اللوط", "التشغيلة"],
  expiry: ["تاريخ الصلاحية", "الصلاحية"],
};

const LEGACY_HEADERS: Partial<Record<Collection, Record<string, string[]>>> = {
  products: {
    id: ["كود الصنف", "كود المنتج", "رقم الصنف", "الكود"],
    name: ["اسم الصنف", "أسم الصنف", "اسم المنتج"],
    unit: ["الوحدة", "وحدة الصنف"],
    price: ["سعر البيع", "سعر الصنف"],
    min: ["حد الطلب", "حد التنبيه", "الحد الادني", "حد أدنى"],
    openingQty: ["الرصيد الافتتاحي", "رصيد اول المده", "رصيد اول المدة"],
    openingCost: ["السعر الافتتاحي", "تكلفة الوحدة اول المده", "تكلفة رصيد اول المده"],
  },
  traders: {
    id: ["كود العميل", "كود التاجر", "رقم العميل", "الكود"],
    name: ["اسم العميل", "أسم العميل", "اسم التاجر"],
    phone: ["رقم الهاتف", "رقم التليفون", "الهاتف", "التليفون"],
    gov: ["العنوان", "المحافظة"],
    openingBalance: ["الرصيد الافتتاحي دين سابق", "الرصيد الافتتاحي", "رصيد افتتاحي"],
  },
  suppliers: {
    id: ["كود المورد", "كود الشركه", "كود الشركة", "رقم المورد", "الكود"],
    name: ["اسم المورد", "اسم الشركه", "أسم الشركه", "اسم الشركة"],
    phone: ["رقم الهاتف", "رقم التليفون", "الهاتف", "التليفون"],
    gov: ["العنوان", "المحافظة"],
    openingBalance: ["الرصيد الافتتاحي", "رصيد افتتاحي"],
  },
  sales: invoiceHeaders,
  salesReturns: invoiceHeaders,
  purchases: invoiceHeaders,
  purchaseReturns: invoiceHeaders,
  expenses: {
    date: ["التاريخ"],
    category: ["البيان"],
    amount: ["المبلغ المدفوع", "المبلغ"],
  },
};

function legacyField(collection: Collection, header: unknown) {
  const normalized = normalizeArabic(header);
  const aliases = LEGACY_HEADERS[collection] ?? {};
  for (const [field, values] of Object.entries(aliases)) {
    if (values.some((alias) => normalizeArabic(alias) === normalized)) return field;
  }
  return undefined;
}

function importLegacyMasterSheet(
  sheet: ExcelJS.Worksheet,
  collection: "traders" | "suppliers" | "products",
) {
  const found = findLegacyHeader(sheet, collection, ["name", "id"]);
  if (!found) return { rows: [], warnings: [`لم أتعرف على عناوين ورقة ${COLLECTION_LABELS[collection]}.`] };

  const rows: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  let skippedRows = 0;
  let missingOpeningCost = 0;
  let missingOpeningBalance = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= found.rowNumber) return;
    const legacyRow: Record<string, unknown> = {};
    for (const [column, field] of Object.entries(found.fieldsByColumn)) {
      const cell = row.getCell(Number(column));
      const value = field === "id" ? cell.text.trim() || cellValue(cell.value) : cellValue(cell.value);
      if (value !== null && value !== undefined && value !== "") legacyRow[field] = value;
    }
    if (!legacyRow.name || !legacyRow.id) {
      if (Object.keys(legacyRow).length) skippedRows++;
      return;
    }
    if (collection === "products" && legacyRow.openingCost === undefined) missingOpeningCost++;
    if ((collection === "traders" || collection === "suppliers") && legacyRow.openingBalance === undefined)
      missingOpeningBalance++;
    rows.push(normalizeRow(collection, legacyRow, rowNumber));
  });
  if (skippedRows)
    warnings.push(`ورقة ${COLLECTION_LABELS[collection]}: تم تخطي ${skippedRows} صفوف ينقصها الكود أو الاسم.`);
  if (collection === "products") {
    if (missingOpeningCost)
      warnings.push(`ورقة الأصناف: تكلفة/سعر أول المدة غير موجود في ${missingOpeningCost} سجلاً؛ سيبقى صفراً حتى إدخاله.`);
    if (!Object.values(found.fieldsByColumn).includes("price"))
      warnings.push("ورقة الأصناف لا تحتوي سعر البيع؛ سيبقى السعر الافتراضي صفراً ويحتاج إلى إدخال.");
  }
  if (missingOpeningBalance)
    warnings.push(`ورقة ${COLLECTION_LABELS[collection]}: الرصيد الافتتاحي غير موجود في ${missingOpeningBalance} سجلاً؛ سيبقى صفراً.`);
  return { rows, warnings };
}

function findLegacyHeader(
  sheet: ExcelJS.Worksheet,
  collection: Collection,
  requiredFields: string[],
): { rowNumber: number; fieldsByColumn: Record<number, string> } | undefined {
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 12); rowNumber++) {
    const fieldsByColumn: Record<number, string> = {};
    sheet.getRow(rowNumber).eachCell((cell, column) => {
      const field = legacyField(collection, cellValue(cell.value));
      if (field) fieldsByColumn[column] = field;
    });
    if (requiredFields.every((field) => Object.values(fieldsByColumn).includes(field)))
      return { rowNumber, fieldsByColumn };
  }
  return undefined;
}

function importLegacyInvoices(
  sheet: ExcelJS.Worksheet,
  collection: "sales" | "salesReturns" | "purchases" | "purchaseReturns",
  db: DB,
  warnings: string[],
) {
  const isSales = collection === "sales" || collection === "salesReturns";
  const isReturn = collection === "salesReturns" || collection === "purchaseReturns";
  const partyCollection = isSales ? "traders" : "suppliers";
  const required = ["date", "partyName", "productName", isReturn ? "returnQty" : "qty", "unitPrice"];
  const found = findLegacyHeader(sheet, collection, required);
  if (!found) return [];

  const parties = db[partyCollection];
  const partyByName = indexByName(parties, isSales ? "عميل" : "مورد");
  const productByName = indexByName(db.products, "صنف");
  const invoices = new Map<string, {
    id: string;
    date: string;
    invoiceNumber: string;
    partyId: string;
    gov: string;
    items: Record<string, unknown>[];
    paid: number[];
    discount: number[];
    firstRow: number;
  }>();
  let skippedRows = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= found.rowNumber) return;
    const values: Record<string, unknown> = {};
    for (const [column, field] of Object.entries(found.fieldsByColumn)) {
      const value = cellValue(row.getCell(Number(column)).value);
      if (value !== null && value !== undefined && value !== "") values[field] = value;
    }

    const qty = readLegacyNumber(values.qty, rowNumber, "الكمية") ?? 0;
    const returnQty = readLegacyNumber(values.returnQty, rowNumber, "المرتجع") ?? 0;
    const rowQty = isReturn ? returnQty : qty;
    if (qty < 0 || returnQty < 0) throw new Error(`الكمية أو المرتجع لا يمكن أن يكونا سالبين (الصف ${rowNumber}).`);
    if (rowQty === 0) {
      if (qty === 0 && returnQty === 0 &&
        (values.date || values.invoiceNumber || values.partyName || values.productName || values.unitPrice))
        skippedRows++;
      return;
    }

    const date = parseLegacyDate(values.date, rowNumber);
    const partyName = String(values.partyName ?? "").trim();
    const productName = String(values.productName ?? "").trim();
    if (!partyName || !productName)
      throw new Error(`اسم ${isSales ? "العميل" : "المورد"} والصنف مطلوبان في الصف ${rowNumber}.`);
    const party = findNamedRecord(partyByName, partyName, isSales ? "عميل" : "مورد", rowNumber);
    const product = findNamedRecord(productByName, productName, "صنف", rowNumber);
    const unitPrice = readLegacyNumber(values.unitPrice, rowNumber, "سعر الوحدة");
    if (unitPrice === undefined || unitPrice < 0)
      throw new Error(`سعر الوحدة مطلوب ويجب ألا يكون سالباً في الصف ${rowNumber}.`);
    const batchNumber = collection === "purchases" ? String(values.batchNumber ?? "").trim() : "";
    const expiry = collection === "purchases" && values.expiry
      ? parseLegacyDate(values.expiry, rowNumber)
      : undefined;
    if (collection === "purchases" && (!batchNumber || !expiry))
      throw new Error(`رقم التشغيلة وتاريخ الصلاحية مطلوبان في صف المشتريات ${rowNumber}.`);
    if (expiry && expiry < date)
      throw new Error(`تاريخ صلاحية التشغيلة يسبق تاريخ الشراء في الصف ${rowNumber}.`);
    const invoiceNumber = String(values.invoiceNumber ?? "").trim();
    const groupKey = invoiceNumber
      ? `${date}\u0000${invoiceNumber}\u0000${party.id}`
      : `${date}\u0000row-${rowNumber}\u0000${party.id}`;
    let invoice = invoices.get(groupKey);
    if (!invoice) {
      invoice = {
        id: stableImportId(isReturn ? (isSales ? "wb-sr" : "wb-pr") : (isSales ? "wb-s" : "wb-p"), groupKey),
        date,
        invoiceNumber,
        partyId: party.id,
        gov: isSales && "gov" in party ? party.gov : "",
        items: [],
        paid: [],
        discount: [],
        firstRow: rowNumber,
      };
      invoices.set(groupKey, invoice);
    }
    invoice.items.push(isSales
      ? { productId: product.id, qty: rowQty, price: unitPrice }
      : {
          productId: product.id, qty: rowQty, cost: unitPrice,
          ...(collection === "purchases" ? {
            batchId: stableImportId("wb-b", `${groupKey}\u0000${rowNumber}`),
            batchNumber,
            expiry,
          } : {}),
        });
    if (!isReturn) {
      const paid = readLegacyNumber(values.paid, rowNumber, "المدفوع");
      const discount = readLegacyNumber(values.discount, rowNumber, "الخصم");
      if (paid !== undefined) invoice.paid.push(paid);
      if (discount !== undefined) invoice.discount.push(discount);
    }
  });
  if (skippedRows)
    warnings.push(`ورقة ${COLLECTION_LABELS[collection]}: تم تخطي ${skippedRows} صفوف معاملات ناقصة الكمية.`);

  return Array.from(invoices.values()).map((invoice) => {
    const paid = aggregateRepeatedAmounts(invoice.paid);
    const discount = aggregateRepeatedAmounts(invoice.discount);
    const gross = invoice.items.reduce((total, item) =>
      total + Number(item.qty) * Number(isSales ? item.price : item.cost), 0);
    if (discount > gross)
      throw new Error(`الخصم أكبر من إجمالي الفاتورة في الصف ${invoice.firstRow}.`);
    if (paid > gross - discount)
      throw new Error(`المدفوع أكبر من صافي الفاتورة في الصف ${invoice.firstRow}.`);
    if (isReturn) {
      return {
        id: invoice.id,
        date: invoice.date,
        invoiceNumber: invoice.invoiceNumber,
        [isSales ? "traderId" : "supplierId"]: invoice.partyId,
        items: invoice.items,
      };
    }
    return {
      id: invoice.id,
      date: invoice.date,
      invoiceNumber: invoice.invoiceNumber,
      [isSales ? "traderId" : "supplierId"]: invoice.partyId,
      ...(isSales ? { gov: invoice.gov } : {}),
      items: invoice.items,
      paid,
      discount,
    };
  });
}

function importLegacyExpenses(sheet: ExcelJS.Worksheet, warnings: string[]) {
  const found = findLegacyHeader(sheet, "expenses", ["date", "category", "amount"]);
  if (!found) return [];
  const rows: Record<string, unknown>[] = [];
  let skippedRows = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= found.rowNumber) return;
    const values: Record<string, unknown> = {};
    for (const [column, field] of Object.entries(found.fieldsByColumn)) {
      const value = cellValue(row.getCell(Number(column)).value);
      if (value !== null && value !== undefined && value !== "") values[field] = value;
    }
    if (!values.date && !values.category && values.amount === undefined) return;
    if (values.amount === undefined) {
      skippedRows++;
      return;
    }
    const category = String(values.category ?? "").trim();
    const amount = readLegacyNumber(values.amount, rowNumber, "المبلغ");
    if (!category || amount === undefined || amount < 0)
      throw new Error(`التاريخ والبيان ومبلغ غير سالب مطلوبة في صف المصروفات ${rowNumber}.`);
    rows.push({
      id: stableImportId("wb-e", `${rowNumber}\u0000${String(values.date)}\u0000${category}`),
      date: parseLegacyDate(values.date, rowNumber),
      category,
      amount,
      gov: "",
      note: "",
    });
  });
  if (skippedRows) warnings.push(`ورقة المصروفات: تم تخطي ${skippedRows} صفوف ينقصها المبلغ.`);
  return rows;
}

function indexByName<T extends { id: string; name: string }>(records: T[], label: string) {
  const index = new Map<string, T[]>();
  for (const record of records) {
    const name = normalizeArabic(record.name);
    if (!name) continue;
    index.set(name, [...(index.get(name) ?? []), record]);
  }
  return { index, label };
}

function findNamedRecord<T extends { id: string; name: string }>(
  lookup: { index: Map<string, T[]>; label: string },
  name: string,
  label: string,
  rowNumber: number,
) {
  const matches = lookup.index.get(normalizeArabic(name)) ?? [];
  if (matches.length !== 1)
    throw new Error(matches.length
      ? `اسم ${label} "${name}" مكرر في النظام ولا يمكن تحديد السجل (الصف ${rowNumber}).`
      : `اسم ${label} "${name}" غير موجود في النظام. استورد الأصناف والعملاء والموردين أولاً (الصف ${rowNumber}).`);
  return matches[0];
}

function readLegacyNumber(value: unknown, rowNumber: number, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw new Error(`${label} غير صالح في الصف ${rowNumber}.`);
  }
  const text = String(value).trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u066c,]/g, "")
    .replace(/\u066b/g, ".")
    .replace(/\s/g, "");
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(`${label} غير رقمي في الصف ${rowNumber}.`);
  return number;
}

function parseLegacyDate(value: unknown, rowNumber: number): string {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const local = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/.exec(text);
  const parts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : local
      ? [Number(local[3].length === 2 ? `20${local[3]}` : local[3]), Number(local[2]), Number(local[1])]
      : [];
  if (parts.length === 3) {
    const [year, month, day] = parts;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day)
      return date.toISOString().slice(0, 10);
  }
  throw new Error(`التاريخ غير صالح في الصف ${rowNumber}.`);
}

function aggregateRepeatedAmounts(values: number[]) {
  if (!values.length) return 0;
  if (values.every((value) => value === values[0])) return values[0];
  return values.reduce((total, value) => total + value, 0);
}

function stableImportId(prefix: string, value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

export function getImportableCollections(permissions: string[], superAdmin: boolean) {
  return (Object.keys(COLLECTION_LABELS) as Collection[]).filter((collection) =>
    superAdmin || (
      permissions.includes(`${TABLE_NAMES[collection]}.read`) &&
      (permissions.includes(`${TABLE_NAMES[collection]}.create`) || permissions.includes(`${TABLE_NAMES[collection]}.update`))
    ),
  );
}
