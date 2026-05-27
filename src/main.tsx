import ReactDOM from "react-dom/client";
import App from "./App";

// StrictMode désactivé : en React 19 dev, il double-monte les useEffect →
// 2 WebSockets sont ouvertes au démarrage, ce qui crée des messages
// orphelins quand l'orchestrator pousse des events. Réactiver en prod.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
