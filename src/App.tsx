import "./index.css";
import { useCallback, useEffect, useState } from "react";
import { useAgent } from "./hooks/useAgent";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { InputBar } from "./components/InputBar";
import { ProposalCards } from "./components/ProposalCards";
import { SettingsPanel } from "./components/SettingsPanel";
import { colors } from "./theme";

type SidebarTab = "sessions" | "memory" | "project";

// Reconnexion WS : useAgent retente toutes les 3 s. Tant que la relance auto du
// backend (LaunchAgent com.klody.api : ThrottleInterval 30 s + reload MLX) peut
// encore aboutir, on n'affiche qu'un bandeau sobre « Reconnexion… ». Au-delà de
// ce seuil (~30 s de coupure continue), la relance auto a vraisemblablement
// échoué → on escalade vers le bandeau rouge avec la commande kickstart manuelle.
const RECONNECT_ESCALATE_ATTEMPTS = 10;

export default function App() {
  const {
    messages,
    status,
    reconnectAttempts,
    sessions,
    availableModels,
    memories,
    projectInfo,
    sendMessage,
    uploadImage,
    changeModel,
    newSession,
    loadSession,
    deleteSession,
    renameSession,
    archiveSession,
    stopGeneration,
    respondApproval,
    forgetMemory,
    addMemory,
    fetchSkills,
    notify,
  } = useAgent();

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("sessions");
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        onOpenSettings={() => setSettingsOpen(true)}
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
          onDelete={deleteSession}
          onRename={renameSession}
          onArchive={archiveSession}
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
          {!status.connected &&
            (reconnectAttempts < RECONNECT_ESCALATE_ATTEMPTS ? (
              // Phase sobre : la relance auto du backend est encore en cours.
              <div
                role="status"
                style={{
                  background: colors.warningSoft,
                  borderBottom: `1px solid ${colors.warning}`,
                  padding: "10px 16px",
                  color: colors.warningText,
                  fontSize: "13px",
                  textAlign: "center",
                }}
              >
                <strong>Backend indisponible.</strong> Reconnexion automatique…
              </div>
            ) : (
              // Escalade : la relance auto n'a rien donné après ~30 s.
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
                <strong>Backend toujours déconnecté.</strong> La relance auto a
                échoué — relancer l'API&nbsp;:{" "}
                <code
                  style={{
                    background: colors.bg,
                    border: `1px solid ${colors.danger}`,
                    padding: "1px 6px",
                    borderRadius: "3px",
                    fontFamily: "inherit",
                  }}
                >
                  launchctl kickstart -k gui/$(id -u)/com.klody.api
                </code>
              </div>
            ))}

          {status.connected && <ProposalCards onAccept={sendMessage} />}

          <ChatPanel
            messages={messages}
            status={status}
            sessions={sessions}
            onSend={sendMessage}
            onLoad={loadSession}
            onApproval={respondApproval}
          />
          <InputBar
            disabled={!status.connected}
            thinking={status.thinking}
            onSend={sendMessage}
            onUploadImage={uploadImage}
            onStop={stopGeneration}
            onCommand={handleCommand}
          />
        </main>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
