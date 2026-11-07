import { useState } from "react";
import { Sidebar } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { ExpensesPage, PartiesPage, ProductsPage, PurchasesPage, SalesPage } from "./pages/Pages";
import { useDB } from "./store";
import type { DB, PageKey } from "./types";

export default function App() {
  const store = useDB();
  const [page, setPage] = useState<PageKey>("dash");

  const exportData = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(store.db)], { type: "application/json" }));
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importData = async (f: File) => store.replaceAll(JSON.parse(await f.text()) as DB);

  return (
    <div className="layout">
      <Sidebar page={page} onChange={setPage} onExport={exportData} onImport={importData} />
      <main className="content">
        {page === "dash" && <Dashboard db={store.db} />}
        {page === "sales" && <SalesPage store={store} />}
        {page === "purchases" && <PurchasesPage store={store} />}
        {page === "expenses" && <ExpensesPage store={store} />}
        {page === "traders" && <PartiesPage store={store} kind="traders" />}
        {page === "suppliers" && <PartiesPage store={store} kind="suppliers" />}
        {page === "products" && <ProductsPage store={store} />}
      </main>
    </div>
  );
}
