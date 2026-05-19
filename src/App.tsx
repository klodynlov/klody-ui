import "./index.css";
import { useAgent } from "./hooks/useAgent";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { InputBar } from "./components/InputBar";

export default function App() {
  const {
    messages,
    status,
    sessions,
    availableModels,
    sendMessage,
    changeModel,
    newSession,
    loadSession,
  } = useAgent();

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#07080d",
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
          onLoad={loadSession}
        />

        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "#07080d",
          }}
        >
          {!status.connected && (
            <div
              style={{
                background: "#1a0f0f",
                borderBottom: "1px solid #7f1d1d",
                padding: "8px 16px",
                color: "#f87171",
                fontSize: "12px",
                textAlign: "center",
              }}
            >
              Backend déconnecté — lancer{" "}
              <code style={{ background: "#2d1515", padding: "1px 6px", borderRadius: "3px" }}>
                python api/server.py
              </code>{" "}
              dans klody-code-ai
            </div>
          )}

          <ChatPanel messages={messages} status={status} />
          <InputBar disabled={status.thinking || !status.connected} onSend={sendMessage} />
        </main>
      </div>
    </div>
  );
}
