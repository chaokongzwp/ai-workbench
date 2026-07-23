import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUp,
  CaretDown,
  Check,
  Copy,
  DownloadSimple,
  DotsThree,
  FileText,
  FolderOpen,
  Lightning,
  Microphone,
  Paperclip,
  Plus,
  Sparkle,
  SlidersHorizontal,
  X,
} from "@phosphor-icons/react";
import "./button-design-preview.css";

function ToolButton({ label, children, className = "", disabled = false, onClick }) {
  return (
    <button
      className={`tool-button ${className}`}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function App() {
  const [dark, setDark] = useState(true);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText("帮我检查一下支付流程的异常");
    } catch {
      // Clipboard may be unavailable when this draft is opened as a local file.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <main className={`design-preview ${dark ? "theme-dark" : "theme-light"}`}>
      <header className="preview-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <img src="/icons/workbench.png" alt="" />
          </div>
          <div>
            <strong>AI Workbench</strong>
            <span>控件试稿 · 轻量操作语言</span>
          </div>
        </div>
        <div className="preview-actions">
          <span className="draft-tag">按钮与输入栏</span>
          <button
            className="theme-switch"
            type="button"
            onClick={() => setDark((value) => !value)}
          >
            {dark ? "浅色" : "深色"}
          </button>
          <ToolButton label="更多设置" className="quiet-button">
            <DotsThree size={18} weight="bold" />
          </ToolButton>
        </div>
      </header>

      <section className="preview-intro">
        <div>
          <span className="kicker">推荐方向 / 01</span>
          <h1>让按钮退到恰好的位置</h1>
          <p>
            工具按钮负责提供能力，颜色只负责表达状态。默认轻、操作快、主次清楚。
          </p>
        </div>
        <div className="principle-list" aria-label="设计原则">
          <span><Check size={14} weight="bold" /> 32px 控件</span>
          <span><Check size={14} weight="bold" /> 默认无底色</span>
          <span><Check size={14} weight="bold" /> 单一主操作</span>
        </div>
      </section>

      <section className="workspace-stage" aria-label="聊天界面试稿">
        <div className="stage-toolbar">
          <div className="session-name">
            <span className="session-dot" />
            <div>
              <strong>支付流程</strong>
              <span>Codex · /opt/beex-ai-workspace</span>
            </div>
          </div>
          <div className="stage-toolbar-actions">
            <span className="connection-state"><Check size={13} weight="bold" /> 已连接</span>
            <ToolButton label="关闭窗口" className="quiet-button"><X size={17} /></ToolButton>
          </div>
        </div>

        <div className="conversation">
          <div className="message message-user">
            <p>帮我检查一下支付流程的异常</p>
          </div>
          <div className="message message-assistant">
            <div className="assistant-heading">
              <div className="assistant-avatar"><Sparkle size={15} weight="fill" /></div>
              <strong>Codex</strong>
              <span>刚刚</span>
              <ToolButton label="复制消息" className="message-copy" onClick={copyMessage}>
                {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
              </ToolButton>
            </div>
            <p>我会先检查订单创建、支付回调和状态同步这三个环节。</p>
            <div className="result-note">
              <FileText size={16} />
              <span>已找到 3 个相关文件</span>
              <button type="button" className="inline-action">查看</button>
            </div>
          </div>
        </div>

        <div className="composer">
          <div className="composer-topline">
            <span className="composer-label">输入任务</span>
            <span className="composer-hint">Enter 发送 · Shift + Enter 换行</span>
          </div>
          <div className="composer-editor">
            <textarea
              aria-label="任务输入"
              value="帮我检查一下支付流程的异常"
              readOnly
            />
          </div>
          <div className="composer-footer">
            <div className="composer-tools" aria-label="输入工具">
              <ToolButton label="添加工作目录" className="quiet-button"><FolderOpen size={17} /></ToolButton>
              <ToolButton label="添加附件" className="quiet-button"><Paperclip size={17} /></ToolButton>
              <ToolButton label="下载文件" className="quiet-button"><DownloadSimple size={17} /></ToolButton>
              <span className="tool-divider" />
              <ToolButton label="语音输入" className="quiet-button"><Microphone size={17} /></ToolButton>
              <ToolButton label="唤醒模式" className="quiet-button active-tool"><Lightning size={16} weight="fill" /></ToolButton>
            </div>
            <ToolButton
              label="发送任务"
              className="send-button"
              onClick={() => setSent(true)}
            >
              {sent ? <Check size={18} weight="bold" /> : <ArrowUp size={19} weight="bold" />}
            </ToolButton>
          </div>
        </div>
      </section>

      <section className="component-specimen" aria-label="按钮状态试稿">
        <div className="specimen-heading">
          <div>
            <span className="kicker">控件状态</span>
            <h2>同一尺寸，三种状态</h2>
          </div>
          <span className="specimen-caption">不再用大面积背景区分每个按钮</span>
        </div>
        <div className="specimen-row">
          <div className="specimen-item">
            <div className="state-demo"><ToolButton label="添加"><Plus size={17} /></ToolButton></div>
            <span>默认</span>
          </div>
          <div className="specimen-item">
            <div className="state-demo hover-demo"><ToolButton label="设置" className="quiet-button"><SlidersHorizontal size={17} /></ToolButton></div>
            <span>悬停 / 按下</span>
          </div>
          <div className="specimen-item">
            <div className="state-demo"><ToolButton label="不可用" className="quiet-button" disabled><ArrowUp size={17} /></ToolButton></div>
            <span>不可用</span>
          </div>
          <div className="specimen-item">
            <div className="state-demo"><ToolButton label="发送" className="send-button"><ArrowUp size={18} weight="bold" /></ToolButton></div>
            <span>主操作</span>
          </div>
        </div>
      </section>

      <footer className="preview-footer">
        <span>规则：图标按钮 32 × 32 · 控件间距 6 · 圆角 9 · 只保留一个蓝色主操作</span>
        <span className="footer-mark">AIWB / 2026</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
