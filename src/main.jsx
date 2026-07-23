import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./settings-redesign.css";
import "./platforms/ipad/ipad.css";
import "./utility-controls.css";
import "./platforms/iphone/iphone.css";
import "./platforms/mac/mac.css";

function renderFatalError(error) {
  const root = document.getElementById("root");
  if (!root) return;
  const message = error?.message || String(error || "Unknown error");
  root.innerHTML = `
    <div class="app-fatal-error">
      <div class="app-fatal-error-card">
        <strong>应用启动失败</strong>
        <span>前端界面加载时遇到错误，请导出诊断日志或把下面的信息发给开发者。</span>
        <code>${message.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char])}</code>
      </div>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  console.error("[aiwb:window-error]", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[aiwb:unhandled-rejection]", event.reason);
});

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[aiwb:render-error]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-fatal-error">
          <div className="app-fatal-error-card">
            <strong>应用启动失败</strong>
            <span>界面渲染时遇到错误，请导出诊断日志或把下面的信息发给开发者。</span>
            <code>{this.state.error?.message || String(this.state.error)}</code>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>,
  );
} catch (error) {
  console.error("[aiwb:bootstrap-error]", error);
  renderFatalError(error);
}
