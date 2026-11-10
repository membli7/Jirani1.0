import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "../../i18n.js";
import "../../write-requests.js";
import App from "./App.jsx";

const mountNode = document.getElementById("root");
if (!mountNode) throw new Error("The React frontend mount point is missing.");

const root = createRoot(mountNode);
flushSync(() => root.render(<App />));
