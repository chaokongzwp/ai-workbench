import { useRef } from "react";
import { ArrowUpDown } from "lucide-react";

const sortOptions = [
  ["recent", "最近活动"],
  ["created", "最早创建"],
  ["name", "名称排序"],
  ["status", "运行中优先"],
];

export function SessionSortMenu({ onSort, className = "" }) {
  const detailsRef = useRef(null);
  if (!onSort) return null;

  function chooseSort(mode) {
    onSort(mode);
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <details ref={detailsRef} className={`session-sort-menu ${className}`.trim()}>
      <summary aria-label="会话排序" title="会话排序">
        <ArrowUpDown size={16} strokeWidth={1.9} aria-hidden="true" />
      </summary>
      <div className="session-sort-popover" role="menu" aria-label="会话排序方式">
        {sortOptions.map(([value, label]) => (
          <button key={value} type="button" role="menuitem" onClick={() => chooseSort(value)}>
            {label}
          </button>
        ))}
      </div>
    </details>
  );
}
