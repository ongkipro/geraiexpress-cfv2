import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { App } from "./app"
import { installIndonesianValidation } from "@shared/lib/form-validation-id"

// DEC-247: no English browser validation bubble can reach an operator.
installIndonesianValidation()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
