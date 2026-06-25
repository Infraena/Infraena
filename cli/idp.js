#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.IDP_API_URL ?? "http://localhost:8080";

// Try to read JWT from file or env
let jwt = process.env.IDP_TOKEN ?? null;
const envPath = join(__dirname, "..", "apps", "api", ".env");
if (!jwt && existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  // Not a JWT, just env vars. Try reading a saved token file.
}
const tokenFile = join(__dirname, "..", ".idp-token");
if (!jwt && existsSync(tokenFile)) {
  jwt = readFileSync(tokenFile, "utf-8").trim();
}

function color(c, text) {
  const colors = { green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m" };
  return `${colors[c] ?? ""}${text}${colors.reset}`;
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function login() {
  // If no token, tell user to get one from the web UI
  console.log(color("yellow", "No authentication token found."));
  console.log("Login via the web UI and copy your JWT from the browser cookies (infraena_token).");
  console.log(`Then run: ${color("cyan", "idp login <token>")}`);
  console.log(`Or set:  ${color("cyan", "export IDP_TOKEN=<token>")}\n`);
}

async function cmdLogin(token) {
  jwt = token;
  const { writeFileSync } = await import("fs");
  writeFileSync(tokenFile, token, "utf-8");
  console.log(color("green", "Token saved. You are now authenticated."));
}

async function cmdTemplates() {
  const templates = await api("/api/services/templates");
  console.log(color("bold", "\nAvailable templates:\n"));
  for (const cat of ["frontend", "backend", "database", "infrastructure", "mobile", "other"]) {
    const group = templates.filter(t => t.category === cat);
    if (group.length === 0) continue;
    console.log(color("dim", `  ${cat.toUpperCase()}`));
    for (const t of group) {
      console.log(`    ${color("cyan", t.id.padEnd(16))} ${t.name.padEnd(14)} ${color("dim", t.description)}`);
    }
    console.log("");
  }
}

async function cmdList() {
  const { data, pagination, counters } = await api("/api/services");
  console.log(color("bold", `\nServices (${pagination.total})\n`));
  if (data.length === 0) {
    console.log(color("dim", "  No services yet. Create one: idp create\n"));
    return;
  }
  for (const s of data) {
    const statusColor = s.status === "ready" ? "green" : s.status === "failed" ? "red" : "yellow";
    console.log(`  ${color("cyan", s.name.padEnd(24))} ${color(statusColor, s.status.padEnd(14))} ${s.slug.padEnd(28)} ${color("dim", s.category)}`);
    if (s.languages.length > 0) console.log(color("dim", `    Languages: ${s.languages.join(", ")}`));
    if (s.githubRepoUrl) console.log(color("dim", `    Repo: ${s.githubRepoUrl}`));
  }
  if (counters) {
    console.log(color("dim", `\n  Ready: ${counters.ready ?? 0}  Provisioning: ${counters.provisioning ?? 0}  Failed: ${counters.failed ?? 0}`));
  }
  console.log("");
}

async function cmdCreate(name, template, options = {}) {
  if (!name) {
    console.log(color("red", "Usage: idp create <name> [--template <id>] [--team <id>] [--description <text>]"));
    return;
  }
  if (!template) {
    // Pick first popular template or read from templates list
    template = "nodejs";
  }

  // Get first team or use specified team
  let teamId = options.team;
  if (!teamId) {
    try {
      const teams = await api("/api/teams");
      if (teams.length > 0) teamId = teams[0].id;
    } catch (e) {
      // ignore
    }
  }
  if (!teamId) {
    console.log(color("red", "No team found. Create one via the web UI first."));
    return;
  }

  const templates = await api("/api/services/templates");
  const tpl = templates.find(t => t.id === template);
  if (!tpl) {
    console.log(color("red", `Template "${template}" not found. Run 'idp templates' to see available options.`));
    return;
  }

  console.log(color("dim", `Creating ${name} with template ${tpl.name}...`));
  const payload = {
    name,
    description: options.description ?? null,
    teamId,
    category: tpl.category,
    languages: [tpl.id],
    template: tpl.id,
  };

  try {
    const service = await api("/api/services", { method: "POST", body: JSON.stringify(payload) });
    console.log(color("green", `Service created: ${service.name} (${service.slug})`));
    console.log(color("dim", `  Status: ${service.status}`));
    console.log(color("dim", `  Category: ${service.category}`));
    console.log(color("dim", `  View in dashboard: ${API_URL.replace(":8080", ":3000")}/services/${service.slug}`));
  } catch (e) {
    console.log(color("red", `Failed: ${e.message}`));
  }
}

async function cmdDelete(slug) {
  if (!slug) {
    console.log(color("red", "Usage: idp delete <slug>"));
    return;
  }
  console.log(color("yellow", `Deleting ${slug}...`));
  try {
    await api(`/api/services/${slug}`, { method: "DELETE" });
    console.log(color("green", `Deleted ${slug}`));
  } catch (e) {
    console.log(color("red", `Failed: ${e.message}`));
  }
}

function help() {
  console.log(color("bold", "\nIDP Platform CLI\n"));
  console.log(`  ${color("cyan", "idp login <token>")}     Authenticate with a JWT token`);
  console.log(`  ${color("cyan", "idp templates")}          List available project templates`);
  console.log(`  ${color("cyan", "idp create <name>")}      Create a new service`);
  console.log(`       ${color("dim", "--template <id>")}      Pick a specific template`);
  console.log(`       ${color("dim", "--description <text>")}  Add a description`);
  console.log(`  ${color("cyan", "idp list")}               List all services`);
  console.log(`  ${color("cyan", "idp delete <slug>")}      Delete a service`);
  console.log(`\n  ${color("dim", `API: ${API_URL}`)}`);
  if (jwt) console.log(`  ${color("dim", "Authenticated")}`);
  console.log("");
}

// CLI router
const [,,cmd, ...args] = process.argv;
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--template" && args[i + 1]) options.template = args[++i];
  else if (args[i] === "--team" && args[i + 1]) options.team = args[++i];
  else if (args[i] === "--description" && args[i + 1]) options.description = args[++i];
}

(async () => {
  switch (cmd) {
    case "login": await cmdLogin(args[0]); break;
    case "templates": await cmdTemplates(); break;
    case "create": await cmdCreate(args[0], options.template, options); break;
    case "list": await cmdList(); break;
    case "delete": await cmdDelete(args[0]); break;
    case "help": case undefined: help(); break;
    default: console.log(color("red", `Unknown command: ${cmd}`)); help();
  }
})().catch(e => {
  if (e.message?.includes("401") || e.message?.startsWith("Not")) {
    login();
  } else {
    console.error(color("red", e.message));
  }
  process.exit(1);
});
