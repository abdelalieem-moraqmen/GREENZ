import type ExcelJS from "exceljs";
import { TABLE_NAMES } from "./constants";
import type { Collection, DB } from "./types";

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
  traders: ["id", "name", "phone", "gov"],
  suppliers: ["id", "name", "phone", "gov"],
  products: ["id", "name", "unit", "price", "min"],
  warehouses: ["id", "name", "gov"],
  sales: ["id", "date", "traderId", "gov", "warehouseId", "items", "paid", "note"],
  purchases: ["id", "date", "supplierId", "warehouseId", "items", "paid", "note"],
  salesReturns: ["id", "date", "traderId", "warehouseId", "items", "note"],
  purchaseReturns: ["id", "date", "supplierId", "warehouseId", "items", "note"],
  transfers: ["id", "date", "fromId", "toId", "items", "note"],
  expenses: ["id", "date", "category", "gov", "amount", "note"],
  payments: ["id", "date", "type", "partyId", "amount"],
};

const NUMERIC_FIELDS = new Set(["qty", "price", "cost", "paid", "amount", "min"]);

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object") {
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
    } else if (key === "id" || key.endsWith("Id") || key === "type" || key === "date") {
      value = String(value).trim();
    } else if (typeof value !== "string" && key !== "items") {
      value = String(value);
    }
    normalized[key] = value;
  }

  const requiredByCollection: Partial<Record<Collection, string[]>> = {
    traders: ["name"],
    suppliers: ["name"],
    products: ["name", "unit"],
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
  for (const key of ["price", "min", "paid", "amount"]) {
    if (typeof normalized[key] === "number" && (normalized[key] as number) < 0)
      throw new Error(`القيمة في عمود ${key} لا يمكن أن تكون سالبة (الصف ${rowNumber}).`);
  }
  if ("date" in normalized && !/^\d{4}-\d{2}-\d{2}$/.test(String(normalized.date)))
    throw new Error(`التاريخ في الصف ${rowNumber} يجب أن يكون بصيغة YYYY-MM-DD.`);
  if (Array.isArray(normalized.items)) {
    const linePriceField = collection === "sales" || collection === "salesReturns" ? "price"
      : collection === "purchases" || collection === "purchaseReturns" ? "cost" : undefined;
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
    }
  }
  if ((collection === "sales" || collection === "purchases") && Array.isArray(normalized.items)) {
    const total = normalized.items.reduce((sum, item) => {
      const line = item as Record<string, unknown>;
      const price = Number(line[collection === "sales" ? "price" : "cost"]);
      return sum + Number(line.qty) * price;
    }, 0);
    if (typeof normalized.paid === "number" && normalized.paid > total)
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
) {
  const { default: ExcelJSModule } = await import("exceljs");
  const workbook = new ExcelJSModule.Workbook();
  workbook.creator = "المميز للخدمات الزراعية";
  workbook.created = new Date();
  for (const collection of collections) {
    const sheet = workbook.addWorksheet(collection);
    const columns = COLUMNS[collection];
    sheet.columns = columns.map((key) => ({ header: key, key, width: Math.max(14, key.length + 3) }));
    if (includeRows) {
      for (const row of db[collection] as unknown as Record<string, unknown>[]) {
        const values = Object.fromEntries(columns.map((key) => {
          const value = row[key];
          return [key, value !== null && typeof value === "object" ? JSON.stringify(value) : value ?? ""];
        }));
        sheet.addRow(values);
      }
    }
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(columns.length).letter}1` };
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importWorkbook(file: File, allowedCollections: Collection[]) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("ارفع ملف Excel بصيغة .xlsx.");
  if (file.size > 20 * 1024 * 1024) throw new Error("حجم ملف Excel يجب ألا يتجاوز 20 ميجابايت.");
  const { default: ExcelJSModule } = await import("exceljs");
  const workbook = new ExcelJSModule.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const imports: Partial<Record<Collection, Record<string, unknown>[]>> = {};
  for (const collection of allowedCollections) {
    const sheet = workbook.getWorksheet(collection);
    if (!sheet || sheet.rowCount < 2) continue;
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
    if (rows.length) imports[collection] = rows;
  }
  if (!Object.keys(imports).length) throw new Error("لم أجد أوراق بيانات مع صفوف داخل الملف. استخدم أسماء أوراق الأقسام الظاهرة في قالب التصدير.");
  return imports;
}

export function getImportableCollections(permissions: string[], superAdmin: boolean) {
  return (Object.keys(COLLECTION_LABELS) as Collection[]).filter((collection) =>
    superAdmin || (
      permissions.includes(`${TABLE_NAMES[collection]}.read`) &&
      (permissions.includes(`${TABLE_NAMES[collection]}.create`) || permissions.includes(`${TABLE_NAMES[collection]}.update`))
    ),
  );
}
