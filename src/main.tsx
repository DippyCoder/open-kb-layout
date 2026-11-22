import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AppProvider } from "./components/ui";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <AppProvider>
        <App />
      </AppProvider>
    ),
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
