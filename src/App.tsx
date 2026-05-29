import "./index.css";
import { useCallback, useEffect, useState } from "react";
import { useAgent } from "./hooks/useAgent";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { InputBar } from "./components/InputBar";
import { colors } from "./theme";

type SidebarTab = "sessions" | "memory" | "project";

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
    addMemory,
    fetchSkills,
    notify,
  } = useAgent();

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("sessions");

  // Exécution des commandes "/" (famille Mémoire & projet) — actions
  // déterministes via REST/onglets, sans round-trip LLM.
  const handleCommand = useCallback(
    async (name: string, args: string) => {
      switch (name) {
        case "remember": {
          const t = args.trim();
          const sp = t.indexOf(" ");
          const content = sp >= 1 ? t.slice(sp + 1).trim() : "";
          if (sp < 1 || !content) {
            notify("⚠ Usage : /remember <clé> <fait…>");
            return;
          }
          const res = await addMemory(t.slice(0, sp), content);
          notify(res.ok ? `✓ ${res.message}` : `⚠ ${res.message}`);
          setSidebarTab("memory");
          break;
        }
        case "forget": {
          const key = args.trim();
          if (!key) {
            notify("⚠ Usage : /forget <clé>");
            return;
          }
          await forgetMemory(key);
          notify(`✓ Oublié : ${key}`);
          setSidebarTab("memory");
          break;
        }
        case "skills": {
          const list = await fetchSkills();
          if (list.length === 0) {
            notify("Aucune compétence enregistrée.");
            break;
          }
          const lines = list
            .map(s => `- **${s.name}** (\`${s.slug}\`) — ${s.description}`)
            .join("\n");
          notify(`**${list.length} compétence(s) :**\n${lines}`);
          break;
        }
        case "project":
          setSidebarTab("project");
          break;
      }
    },
    [addMemory, forgetMemory, fetchSkills, notify],
  );

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
          tab={sidebarTab}
          onTabChange={setSidebarTab}
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
            onCommand={handleCommand}
          />
        </main>
      </div>
    </div>
  );
}
