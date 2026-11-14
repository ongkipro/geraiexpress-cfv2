import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"

// Light theme only for v2 launch (design/brief.md non-goal: no dark mode). The shadcn template's
// ThemeProvider followed the device's dark mode and applied the untouched default dark palette.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
