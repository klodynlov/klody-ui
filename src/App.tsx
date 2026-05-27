import "./index.css";
import { useEffect } from "react";
import { useAgent } from "./hooks/useAgent";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { InputBar } from "./components/InputBar";
import { colors } from "./theme";

export default function App() {
  const {
    messages,
    status,
    sessions,
    availableModels,
    memories,
    projectInfo,
    sendMessage,
    changeModel,
    newSession,
    loadSession,
    stopGeneration,
    forgetMemory,
  } = useAgent();

  // Cmd+K (Mac) / Ctrl+K → nouvelle session
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        newSession();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [newSession]);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: colors.bg,
        color: colors.text,
        overflow: "hidden",
      }}
    >
      <Header
        status={status}
        availableModels={availableModels}
        onModelChange={changeModel}
        onNewSession={newSession}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Sidebar
          sessions={sessions}
          currentSessionId={status.sessionId}
          memories={memories}
          projectInfo={{
            ...projectInfo,
            backend: status.backend,
            model: status.model,
            mcp_server_active: status.mcpServerActive,
          }}
          onLoad={loadSession}
          onForget={forgetMemory}
        />

        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: colors.bg,
          }}
        >
          {!status.connected && (
            <div
              role="alert"
              style={{
                background: colors.dangerSoft,
                borderBottom: `1px solid ${colors.danger}`,
                padding: "10px 16px",
                color: colors.dangerText,
                fontSize: "13px",
                textAlign: "center",
              }}
            >
              <strong>Backend déconnecté.</strong> Lancer{" "}
              <code
                style={{
                  background: colors.bg,
                  border: `1px solid ${colors.danger}`,
                  padding: "1px 6px",
                  borderRadius: "3px",
                  fontFamily: "inherit",
                }}
              >
                python api/server.py
              </code>{" "}
              dans <code>klody-code-ai</code>.
            </div>
          )}

          <ChatPanel messages={messages} status={status} />
          <InputBar
            disabled={!status.connected}
            thinking={status.thinking}
            onSend={sendMessage}
            onStop={stopGeneration}
          />
        </main>
      </div>
    </div>
  );
}
