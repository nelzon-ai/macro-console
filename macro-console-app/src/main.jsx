import React from "react";
import { createRoot } from "react-dom/client";
import { installStorage } from "./storage.js";
import { registerSW } from "virtual:pwa-register";
import "./index.css";

installStorage();
registerSW({ immediate: true });

import("./App.jsx").then(({ default: App }) => {
  createRoot(document.getElementById("root")).render(<App />);
});
