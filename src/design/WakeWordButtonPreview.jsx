import { useState } from "react";
import { ArrowDownToLine, Circle, Ear, Folder, Mic, Paperclip, Square } from "lucide-react";
import { createRoot } from "react-dom/client";
import "./wake-word-button-preview.css";

function WakeWordButton({ active, onClick }) {
  return (
    <button
      type="button"
      className={`wake-preview-button ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <Ear size={17} strokeWidth={1.9} aria-hidden="true" />
      {active ? <Circle className="wake-preview-dot" fill="currentColor" aria-hidden="true" /> : null}
      <span>{active ? "监听中" : "唤醒"}</span>
    </button>
  );
}

function ToolButton({ label, children }) {
  return (
    <button type="button" className="wake-preview-tool" aria-label={label} title={label}>
      {children}
    </button>
  );
}

function ComposerExample({ active, onToggle }) {
  return (
    <section className="wake-preview-composer">
      <p>告诉 Claude 你想做什么</p>
      <div className="wake-preview-toolbar">
        <div className="wake-preview-tools">
          <WakeWordButton active={active} onClick={onToggle} />
          <ToolButton label="下载远程文件">
            <ArrowDownToLine />
          </ToolButton>
          <ToolButton label="查看远程文件夹">
            <Folder />
          </ToolButton>
          <ToolButton label="添加文件">
            <Paperclip />
          </ToolButton>
          <ToolButton label="语音输入">
            <Mic />
          </ToolButton>
        </div>
        <button type="button" className="wake-preview-stop" aria-label="停止当前任务">
          <Square size={14} strokeWidth={2.2} />
        </button>
      </div>
    </section>
  );
}

function Preview() {
  const [offStateActive, setOffStateActive] = useState(false);
  const [onStateActive, setOnStateActive] = useState(true);

  return (
    <main className="wake-preview-page">
      <div className="wake-preview-state">
        <span>关闭状态</span>
        <ComposerExample
          active={offStateActive}
          onToggle={() => setOffStateActive((current) => !current)}
        />
      </div>
      <div className="wake-preview-state">
        <span>监听中状态</span>
        <ComposerExample
          active={onStateActive}
          onToggle={() => setOnStateActive((current) => !current)}
        />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Preview />);
