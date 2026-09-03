import { j as jsxRuntimeExports, r as reactExports } from "./adapter-CnqTmm6v.js";
/* empty css                    */
import { c as clientExports } from "./client-CHHxyzum.js";
import { u as useOpenAIGlobal } from "./use-openai-global-Do_3DceD.js";
import { u as useCallTool } from "./use-call-tool-DG-5gStR.js";
import { u as useTheme } from "./use-theme-DfcxBXrk.js";
import { u as useOpenExternal } from "./use-open-external-DnwL94bP.js";
const TYPE_COLORS = {
  normal: "#A8A878",
  fire: "#F08030",
  water: "#6890F0",
  electric: "#F8D030",
  grass: "#78C850",
  ice: "#98D8D8",
  fighting: "#C03028",
  poison: "#A040A0",
  ground: "#E0C068",
  flying: "#A890F0",
  psychic: "#F85888",
  bug: "#A8B820",
  rock: "#B8A038",
  ghost: "#705898",
  dragon: "#7038F8",
  dark: "#705848",
  steel: "#B8B8D0",
  fairy: "#EE99AC",
  "???": "#68A090"
};
const STATUS_ICONS = {
  brn: "🔥",
  psn: "☠️",
  tox: "☠️",
  par: "⚡",
  slp: "💤",
  frz: "❄️",
  confusion: "💫"
};
function abbreviate(value, len = 8) {
  if (!value) return "—";
  if (value.length <= len * 2 + 3) return value;
  return `${value.slice(0, len)}...${value.slice(-4)}`;
}
function toShowdownId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^nidoran.*/, (n) => n.includes("f") ? "nidoranf" : "nidoranm");
}
function getSpriteUrl(pokemon, back = false) {
  const id = toShowdownId(pokemon);
  const dir = back ? "ani-back" : "ani";
  return `https://play.pokemonshowdown.com/sprites/${dir}/${id}.gif`;
}
function getTypeColor(type) {
  if (!type) return TYPE_COLORS["???"];
  return TYPE_COLORS[type.toLowerCase()] || TYPE_COLORS["???"];
}
function getEffectivenessLabel(eff) {
  if (eff === void 0 || eff === 1) return null;
  if (eff === 0) return { label: "IMMUNE", color: "#525252" };
  if (eff === 0.25) return { label: "¼×", color: "#ef4444" };
  if (eff === 0.5) return { label: "½×", color: "#f97316" };
  if (eff === 2) return { label: "2×", color: "#22c55e" };
  if (eff === 4) return { label: "4×", color: "#10b981" };
  return null;
}
function getHpColor(percent) {
  if (percent > 50) return "#22c55e";
  if (percent > 25) return "#eab308";
  return "#ef4444";
}
function detectViewType(payload) {
  if (payload.yourTeam || payload.yourMoves || payload.availableActions || payload.yourActive) return "battlefield";
  if (payload.waiting && payload.battleId) return "battlefield";
  if (payload.challenges || payload.data) return "challenges";
  if (payload.submitted !== void 0) return "move";
  if (payload.matched !== void 0 || payload.position !== void 0) return "queue";
  if (payload.deposits) return "deposits";
  if (payload.winner || payload.player1 || payload.player2) return "wager_status";
  if (payload.challengeId || payload.wagerId || payload.battleRoomId || payload.roomId) return "success";
  return "unknown";
}
function PokeballIcon({ size = 20 }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: size, height: size, viewBox: "0 0 32 32", fill: "none", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "16", cy: "16", r: "15", fill: "#fff", stroke: "#333", strokeWidth: "2" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M1 16h30", stroke: "#333", strokeWidth: "2" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M1 16a15 15 0 0 1 30 0", fill: "#ef4444" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "16", cy: "16", r: "5", fill: "#fff", stroke: "#333", strokeWidth: "2" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "16", cy: "16", r: "2.5", fill: "#333" })
  ] });
}
function PokeBadge({ status }) {
  const configs = {
    pending: { label: "Pending", className: "poke-badge--warning" },
    active: { label: "Active", className: "poke-badge--success" },
    matched: { label: "Matched!", className: "poke-badge--info" },
    completed: { label: "Completed", className: "poke-badge--primary" },
    cancelled: { label: "Cancelled", className: "poke-badge--neutral" },
    waiting: { label: "In Queue", className: "poke-badge--cyan" },
    confirmed: { label: "Confirmed", className: "poke-badge--success" },
    yourturn: { label: "Your Turn!", className: "poke-badge--success" }
  };
  const config = configs[status.toLowerCase()] || configs.pending;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `poke-badge ${config.className}`, children: config.label });
}
function WagerAmount({ amount, size = "md" }) {
  const sizeClass = { sm: "poke-wager--sm", md: "poke-wager--md", lg: "poke-wager--lg" }[size];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `poke-wager ${sizeClass}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "poke-wager__value", children: [
      "$",
      amount
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-wager__unit", children: "USDC" })
  ] });
}
function TypeBadge({ type }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-type-badge", style: { backgroundColor: getTypeColor(type) }, children: type.toUpperCase() });
}
function HpBar({ percent, size = "md" }) {
  const color = getHpColor(percent);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `poke-hp-bar poke-hp-bar--${size}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-hp-bar__fill", style: { width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color } }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "poke-hp-bar__text", children: [
      Math.round(percent),
      "%"
    ] })
  ] });
}
function PokemonSprite({ name, back = false, size = 96, fainted = false }) {
  const [error, setError] = reactExports.useState(false);
  const url = getSpriteUrl(name, back);
  if (error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-sprite-fallback", style: { width: size, height: size }, children: "?" });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: url,
      alt: name,
      className: `poke-sprite ${fainted ? "poke-sprite--fainted" : ""}`,
      style: { width: size, height: size },
      onError: () => setError(true)
    }
  );
}
function TeamIndicator({ team }) {
  const slots = [0, 1, 2, 3, 4, 5];
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-team-indicator", children: slots.map((i) => {
    const mon = team[i];
    const alive = mon && !mon.fainted;
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `poke-team-slot ${alive ? "poke-team-slot--alive" : "poke-team-slot--fainted"}`, title: mon?.name, children: /* @__PURE__ */ jsxRuntimeExports.jsx(PokeballIcon, { size: 12 }) }, i);
  }) });
}
function MoveButton({ move, battleId, onResult }) {
  const { call, loading } = useCallTool();
  const eff = getEffectivenessLabel(move.effectiveness);
  const typeColor = getTypeColor(move.type);
  const handleClick = async () => {
    if (!move.canUse || loading) return;
    const result = await call("pokedexter_make_move", { battleId, action: `move ${move.slot}` });
    onResult?.(result);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      className: `poke-move-btn ${!move.canUse ? "poke-move-btn--disabled" : ""}`,
      style: { "--type-color": typeColor },
      onClick: handleClick,
      disabled: !move.canUse || loading,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-move-btn__header", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-move-btn__name", children: move.name }),
          eff && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-move-btn__eff", style: { color: eff.color }, children: eff.label })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-move-btn__footer", children: [
          move.type && /* @__PURE__ */ jsxRuntimeExports.jsx(TypeBadge, { type: move.type }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "poke-move-btn__pp", children: [
            "PP ",
            move.pp,
            "/",
            move.maxpp
          ] }),
          move.basePower > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "poke-move-btn__bp", children: [
            move.basePower,
            " BP"
          ] })
        ] }),
        loading && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-move-btn__loading" })
      ]
    }
  );
}
function SwitchButton({ pokemon, battleId, onResult }) {
  const { call, loading } = useCallTool();
  const handleClick = async () => {
    if (loading) return;
    const result = await call("pokedexter_make_move", { battleId, action: `switch ${pokemon.slot}` });
    onResult?.(result);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "poke-switch-btn", onClick: handleClick, disabled: loading, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PokemonSprite, { name: pokemon.name, size: 40 }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-switch-btn__info", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-switch-btn__name", children: pokemon.name }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(HpBar, { percent: pokemon.hpPercent, size: "sm" })
    ] }),
    pokemon.status && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-switch-btn__status", children: STATUS_ICONS[pokemon.status] || pokemon.status }),
    loading && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-switch-btn__loading" })
  ] });
}
function BattlefieldView({ payload }) {
  const { openExternal } = useOpenExternal();
  const [actionResult, setActionResult] = reactExports.useState(null);
  const [showSwitches, setShowSwitches] = reactExports.useState(false);
  const battleId = payload.battleId || payload.actualRoomId || "";
  const yourActive = payload.yourActive;
  const opponent = payload.opponent;
  const moves = payload.availableActions?.moves || payload.yourMoves || [];
  const switches = payload.availableActions?.switches || payload.yourSwitches || [];
  const canMove = payload.availableActions?.canMove ?? moves.some((m) => m.canUse);
  const canSwitch = payload.availableActions?.canSwitch ?? switches.length > 0;
  const forceSwitch = payload.availableActions?.forceSwitch || false;
  !payload.waiting && (canMove || canSwitch);
  const handleOpenBattle = () => {
    openExternal(`https://poke.dexter.cash/battle/${battleId}`);
  };
  if (payload.waiting) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-view", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-battlefield-waiting", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(PokeballIcon, { size: 32 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: payload.message || "Waiting for your turn..." })
      ] }),
      battleId && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "poke-watch-btn", onClick: handleOpenBattle, children: "Watch Battle ↗" })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-view poke-battlefield", children: [
    opponent && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-battlefield__opponent", children: [
      opponent.activePokemon && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-pokemon-display poke-pokemon-display--opponent", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(PokemonSprite, { name: opponent.activePokemon, size: 96 }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-pokemon-info", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-pokemon-name", children: opponent.activePokemon }),
          opponent.activeTypes && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-pokemon-types", children: opponent.activeTypes.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(TypeBadge, { type: t }, t)) }),
          opponent.team?.find((p) => p.active) && /* @__PURE__ */ jsxRuntimeExports.jsx(HpBar, { percent: opponent.team.find((p) => p.active).hp })
        ] })
      ] }),
      opponent.team && opponent.team.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-opponent-team", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "poke-opponent-team__label", children: [
        opponent.remainingCount,
        "/",
        opponent.revealedCount,
        " alive",
        6 - (opponent.revealedCount || 0) > 0 && ` • ${6 - (opponent.revealedCount || 0)} unrevealed`
      ] }) })
    ] }),
    yourActive && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-battlefield__you", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-pokemon-display poke-pokemon-display--you", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(PokemonSprite, { name: yourActive.name, back: true, size: 96 }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-pokemon-info", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-pokemon-name", children: [
            yourActive.name,
            yourActive.status && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-status-icon", children: STATUS_ICONS[yourActive.status] || `[${yourActive.status}]` })
          ] }),
          yourActive.types && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-pokemon-types", children: yourActive.types.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(TypeBadge, { type: t }, t)) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(HpBar, { percent: yourActive.hpPercent }),
          yourActive.ability && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-pokemon-ability", children: [
            "Ability: ",
            yourActive.ability
          ] })
        ] })
      ] }),
      payload.yourTeam && /* @__PURE__ */ jsxRuntimeExports.jsx(TeamIndicator, { team: payload.yourTeam })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-battlefield__actions", children: [
      forceSwitch && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-force-switch-banner", children: "⚠️ Must switch Pokemon!" }),
      actionResult && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-action-result", children: actionResult }),
      !forceSwitch && canMove && !showSwitches && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-moves-grid", children: moves.map((move) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        MoveButton,
        {
          move,
          battleId,
          onResult: (r) => setActionResult(r?.submitted || "Move sent!")
        },
        move.slot
      )) }),
      (forceSwitch || showSwitches) && canSwitch && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-switches-list", children: switches.map((pokemon) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        SwitchButton,
        {
          pokemon,
          battleId,
          onResult: (r) => setActionResult(r?.submitted || "Switch sent!")
        },
        pokemon.slot
      )) }),
      !forceSwitch && canSwitch && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "poke-toggle-switches",
          onClick: () => setShowSwitches(!showSwitches),
          children: showSwitches ? "← Back to Moves" : "Switch Pokemon →"
        }
      )
    ] }),
    battleId && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "poke-watch-btn", onClick: handleOpenBattle, children: "Watch on poke.dexter.cash ↗" })
  ] });
}
function ChallengeCard({ challenge }) {
  const { call, loading, result } = useCallTool();
  const handleAccept = async () => {
    await call("pokedexter_accept_challenge", { challengeId: challenge.id });
  };
  if (result) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-challenge-card poke-challenge-card--accepted", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-challenge-accepted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-challenge-accepted__icon", children: "✓" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Challenge Accepted!" })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-challenge-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-challenge-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-challenge-info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-challenge-user", children: challenge.challengerId || abbreviate(challenge.challengerWallet) || "Anonymous" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-challenge-format", children: challenge.format || "gen9randombattle" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(WagerAmount, { amount: challenge.amount })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-challenge-footer", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "poke-challenge-id", children: [
        "ID: ",
        challenge.id
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "poke-accept-btn",
          onClick: handleAccept,
          disabled: loading,
          children: loading ? "Accepting..." : "⚔️ Accept"
        }
      )
    ] })
  ] });
}
function ChallengesView({ challenges }) {
  const [showAll, setShowAll] = reactExports.useState(false);
  const visible = showAll ? challenges : challenges.slice(0, 4);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-view", children: challenges.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-empty", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PokeballIcon, { size: 48 }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "No open challenges right now" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Create one to start battling!" })
  ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-challenges-list", children: visible.map((challenge) => /* @__PURE__ */ jsxRuntimeExports.jsx(ChallengeCard, { challenge }, challenge.id)) }),
    challenges.length > 4 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "poke-show-more", onClick: () => setShowAll(!showAll), children: showAll ? "Show Less" : `Show ${challenges.length - 4} more` })
  ] }) });
}
function WagerStatusView({ payload }) {
  const { openExternal } = useOpenExternal();
  const wagerId = payload.wagerId || payload.id;
  const roomId = payload.battleRoomId || payload.roomId;
  const status = payload.winner ? "completed" : payload.status === "active" ? "active" : "pending";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-wager-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-wager-icon", children: "⚔️" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-wager-info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-wager-title", children: "Wager Match" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "poke-wager-id", children: [
          "#",
          wagerId
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-wager-meta", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(WagerAmount, { amount: payload.amount || 0 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(PokeBadge, { status })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-players", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `poke-player ${payload.player1?.deposited ? "poke-player--ready" : ""}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-player-label", children: "Player 1" }),
        payload.player1?.deposited && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-player-check", children: "✓" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-player-wallet", children: abbreviate(payload.player1?.wallet || payload.player1?.userId) || "—" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `poke-player ${payload.player2?.deposited ? "poke-player--ready" : ""}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-player-label", children: "Player 2" }),
        payload.player2?.deposited && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-player-check", children: "✓" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-player-wallet", children: abbreviate(payload.player2?.wallet || payload.player2?.userId) || "Waiting..." })
      ] })
    ] }),
    payload.winner && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-winner", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-winner-icon", children: "🏆" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-winner-info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-winner-label", children: "Winner" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-winner-name", children: payload.winner })
      ] })
    ] }),
    roomId && /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "poke-battle-link", onClick: () => openExternal(`https://poke.dexter.cash/battle/${roomId}`), children: [
      "Watch Battle: ",
      roomId,
      " ↗"
    ] })
  ] });
}
function QueueStatusView({ payload }) {
  const { openExternal } = useOpenExternal();
  const roomId = payload.battleRoomId || payload.roomId;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-view", children: payload.matched ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-matched", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-matched-icon", children: "⚔️" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-matched-info", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-matched-title", children: "Match Found!" }),
      roomId && /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "poke-matched-link", onClick: () => openExternal(`https://poke.dexter.cash/battle/${roomId}`), children: [
        "Join Battle: ",
        roomId,
        " ↗"
      ] })
    ] })
  ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-queue-metrics", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-queue-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-queue-metric__label", children: "POSITION" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "poke-queue-metric__value", children: [
          "#",
          payload.position || 1
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-queue-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-queue-metric__label", children: "IN QUEUE" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-queue-metric__value", children: payload.queueSize || 1 })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-queue-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-queue-metric__label", children: "WAGER" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "poke-queue-metric__value", children: [
          "$",
          payload.amount || "—"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-searching", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-searching-icon", children: /* @__PURE__ */ jsxRuntimeExports.jsx(PokeballIcon, { size: 24 }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-searching-info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-searching-text", children: "Searching for opponent..." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-searching-format", children: payload.format || "gen9randombattle" })
      ] })
    ] })
  ] }) });
}
function DepositsView({ payload }) {
  const p1Deposited = payload.deposits?.player1?.deposited;
  const p2Deposited = payload.deposits?.player2?.deposited;
  const bothReady = p1Deposited && p2Deposited;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-deposit-status", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `poke-deposit-player ${p1Deposited ? "poke-deposit-player--ready" : ""}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-deposit-label", children: "Player 1" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-deposit-icon", children: p1Deposited ? "✓" : "◷" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-deposit-state", children: p1Deposited ? "Deposited" : "Pending" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `poke-deposit-player ${p2Deposited ? "poke-deposit-player--ready" : ""}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-deposit-label", children: "Player 2" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-deposit-icon", children: p2Deposited ? "✓" : "◷" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-deposit-state", children: p2Deposited ? "Deposited" : "Pending" })
      ] })
    ] }),
    payload.totalPot && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-pot", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-pot-label", children: "Total Pot" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(WagerAmount, { amount: payload.totalPot, size: "lg" })
    ] }),
    bothReady && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-ready", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-ready-icon", children: "⚡" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-ready-text", children: "Battle Ready!" })
    ] })
  ] });
}
function MoveResultView({ payload }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-move-display", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-move-submitted", children: payload.submitted }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-move-metrics", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-move-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-move-metric__label", children: "BATTLE ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-move-metric__value", children: payload.battleId || "—" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-move-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-move-metric__label", children: "STATUS" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-move-metric__value", children: "Recorded" })
      ] })
    ] }),
    payload.note && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "poke-move-note", children: payload.note })
  ] });
}
function SuccessView({ payload }) {
  const { openExternal } = useOpenExternal();
  const roomId = payload.battleRoomId || payload.roomId;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-success-banner", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-success-icon", children: "✓" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-success-text", children: "Success!" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-success-details", children: [
      payload.amount && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-success-detail", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-success-detail__label", children: "WAGER" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "poke-success-detail__value", children: [
          "$",
          payload.amount
        ] })
      ] }),
      payload.format && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-success-detail", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-success-detail__label", children: "FORMAT" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-success-detail__value", children: payload.format })
      ] }),
      payload.challengeId && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-success-detail", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-success-detail__label", children: "CHALLENGE" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-success-detail__value", children: payload.challengeId })
      ] }),
      payload.wagerId && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-success-detail", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-success-detail__label", children: "WAGER" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-success-detail__value", children: payload.wagerId })
      ] })
    ] }),
    roomId && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "poke-enter-battle", onClick: () => openExternal(`https://poke.dexter.cash/battle/${roomId}`), children: "⚡ Enter Battle Room ↗" }),
    payload.escrowAddress && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-escrow", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-escrow-label", children: "Deposit To" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "poke-escrow-address", children: abbreviate(payload.escrowAddress, 16) })
    ] })
  ] });
}
function Pokedexter() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  const theme = useTheme();
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-container", "data-theme": theme, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PokeballIcon, { size: 24 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading..." })
    ] }) });
  }
  if (toolOutput.error || toolOutput.ok === false) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-container", "data-theme": theme, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-error", children: toolOutput.error || "Operation failed" }) });
  }
  const viewType = detectViewType(toolOutput);
  const challenges = toolOutput.challenges || toolOutput.data || [];
  const isYourTurn = viewType === "battlefield" && !toolOutput.waiting && (toolOutput.availableActions?.canMove || toolOutput.availableActions?.canSwitch);
  const titles = {
    challenges: "Open Challenges",
    wager_status: "Wager Status",
    queue: "Queue Status",
    deposits: "Deposit Status",
    battlefield: "Battle",
    move: "Move Submitted",
    success: "Success",
    unknown: "Pokedexter"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "poke-container", "data-theme": theme, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "poke-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(PokeballIcon, { size: 18 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "poke-title", children: titles[viewType] })
      ] }),
      viewType === "challenges" && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "poke-challenges-count", children: [
        challenges.length,
        " available"
      ] }),
      viewType === "queue" && /* @__PURE__ */ jsxRuntimeExports.jsx(PokeBadge, { status: toolOutput.matched ? "matched" : "waiting" }),
      viewType === "move" && /* @__PURE__ */ jsxRuntimeExports.jsx(PokeBadge, { status: "confirmed" }),
      viewType === "battlefield" && /* @__PURE__ */ jsxRuntimeExports.jsx(PokeBadge, { status: isYourTurn ? "yourturn" : "waiting" })
    ] }),
    viewType === "challenges" && /* @__PURE__ */ jsxRuntimeExports.jsx(ChallengesView, { challenges }),
    viewType === "wager_status" && /* @__PURE__ */ jsxRuntimeExports.jsx(WagerStatusView, { payload: toolOutput }),
    viewType === "queue" && /* @__PURE__ */ jsxRuntimeExports.jsx(QueueStatusView, { payload: toolOutput }),
    viewType === "deposits" && /* @__PURE__ */ jsxRuntimeExports.jsx(DepositsView, { payload: toolOutput }),
    viewType === "battlefield" && /* @__PURE__ */ jsxRuntimeExports.jsx(BattlefieldView, { payload: toolOutput }),
    viewType === "move" && /* @__PURE__ */ jsxRuntimeExports.jsx(MoveResultView, { payload: toolOutput }),
    viewType === "success" && /* @__PURE__ */ jsxRuntimeExports.jsx(SuccessView, { payload: toolOutput })
  ] }) });
}
const root = document.getElementById("pokedexter-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(Pokedexter, {}));
}
