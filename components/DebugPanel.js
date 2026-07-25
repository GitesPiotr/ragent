"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppState } from "@/lib/state/StateContext";
import { useSettings } from "@/lib/settings/SettingsContext";

function DebugPanelInner() {
  const { state } = useAppState();
  const { settings } = useSettings();
  const searchParams = useSearchParams();
  const debugFromUrl = searchParams.get("debug") === "1";
  const [visible, setVisible] = useState(debugFromUrl);

  // Panel diagnostyczny widoczny, gdy WŁĄCZONY w Ustawieniach albo wymuszony ?debug=1.
  if (!settings.showDebugPanel && !debugFromUrl) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        style={{
          padding: "4px 8px",
          borderRadius: 4,
          border: "1px solid #444",
          background: "#111",
          color: "#0f0",
          cursor: "pointer",
        }}
      >
        {visible ? "Ukryj debug" : "Debug"}
      </button>

      {visible && (
        <pre
          style={{
            margin: 0,
            padding: 10,
            minWidth: 220,
            maxWidth: 320,
            maxHeight: "60vh",
            overflow: "auto",
            borderRadius: 4,
            border: "1px solid #444",
            background: "#111",
            color: "#0f0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
{`activity: ${state.activity}
lastEvent: ${JSON.stringify(state.lastEvent, null, 2)}
agent: ${JSON.stringify(state.agent, null, 2)}`}
        </pre>
      )}
    </div>
  );
}

export function DebugPanel() {
  return (
    <Suspense fallback={null}>
      <DebugPanelInner />
    </Suspense>
  );
}
