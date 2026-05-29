// Registre des commandes "/" de Klody (famille Mémoire & projet).
// Le menu filtrable de InputBar s'appuie dessus ; l'exécution est faite
// par App.handleCommand (actions déterministes via REST/onglets, sans LLM).

export interface SlashCommand {
  /** Nom canonique sans le slash (ex: "remember"). */
  name: string;
  /** Syntaxe affichée dans le menu. */
  usage: string;
  /** Description courte affichée dans le menu. */
  description: string;
  /** True si la commande attend des arguments avant d'être exécutée. */
  takesArgs: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "remember",
    usage: "/remember <clé> <fait…>",
    description: "Mémoriser un fait entre les sessions",
    takesArgs: true,
  },
  {
    name: "forget",
    usage: "/forget <clé>",
    description: "Oublier un fait mémorisé",
    takesArgs: true,
  },
  {
    name: "skills",
    usage: "/skills",
    description: "Lister les compétences enregistrées",
    takesArgs: false,
  },
  {
    name: "project",
    usage: "/project",
    description: "Ouvrir l'onglet projet",
    takesArgs: false,
  },
];

/** Vrai si le texte est en train de saisir une commande (slash + token sans espace). */
export function slashQuery(text: string): string | null {
  const m = text.match(/^\/(\S*)$/);
  return m ? m[1].toLowerCase() : null;
}

/** Commandes dont le nom commence par le préfixe tapé. */
export function filterCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter(c => c.name.startsWith(q));
}

/** Parse "/cmd args…" en {name, args}. Retourne null si pas une commande connue. */
export function parseCommand(text: string): { name: string; args: string } | null {
  const m = text.match(/^\/(\w+)\s*([\s\S]*)$/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (!SLASH_COMMANDS.some(c => c.name === name)) return null;
  return { name, args: m[2] };
}
