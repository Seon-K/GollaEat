import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "@/components/AppProviders";
import { PhoneFrame } from "@/components/PhoneFrame";
import { AppRouter } from "@/AppRouter";
import "@/styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <PhoneFrame>
        <AppRouter />
      </PhoneFrame>
    </AppProviders>
  </StrictMode>,
);
