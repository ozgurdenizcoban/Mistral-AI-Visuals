import { AppProvider } from "@/contexts/AppContext";
import { Toaster } from "sonner";
import Layout from "@/components/Layout";

export default function App() {
  return (
    <AppProvider>
      <Layout />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--ink2)",
            border: "1px solid var(--line)",
            color: "var(--text)",
            fontFamily: "Syne, sans-serif",
          },
        }}
      />
    </AppProvider>
  );
}
