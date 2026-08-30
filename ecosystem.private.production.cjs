// Immutable production launcher for the private Dexter OAuth MCP surface.
// The standard ecosystem.production.cjs export remains public-only.
const publicEcosystem = require("./ecosystem.production.cjs");
const buildService = publicEcosystem.__dexterBuildSealedService;

if (typeof buildService !== "function") {
  throw new Error("sealed Dexter MCP service factory is unavailable");
}

module.exports = {
  apps: [buildService("dexter-mcp")],
};
