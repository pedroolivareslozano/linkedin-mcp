import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { LinkedInClient } from "./linkedin.js";

const PORT = process.env.PORT || 3000;
const ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const ORG_ID = process.env.LINKEDIN_ORGANIZATION_ID || null;

if (!ACCESS_TOKEN) {
  console.error("Falta LINKEDIN_ACCESS_TOKEN");
  process.exit(1);
}

const li = new LinkedInClient(ACCESS_TOKEN, ORG_ID);

function createMcpServer() {
  const server = new McpServer({ name: "linkedin-mcp", version: "1.0.0" });

  server.tool("get_profile", "Obtiene el perfil del autor autenticado", {}, async () => {
    try {
      const profile = await li.getProfile();
      const text = ORG_ID
        ? `Publicando como organización: ID ${ORG_ID}`
        : `Publicando como: ${profile.name || profile.sub}`;
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });

  server.tool(
    "publish_text_post",
    "Publica un post de texto en LinkedIn",
    {
      text: z.string().min(1).max(3000).describe("Texto completo del post con hashtags"),
      visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
    },
    async ({ text, visibility }) => {
      try {
        const result = await li.createTextPost(text, visibility);
        return { content: [{ type: "text", text: `Post publicado. URL: ${result.url}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "publish_image_post",
    "Publica un post con imagen en LinkedIn desde una URL pública",
    {
      text: z.string().min(1).max(3000).describe("Texto del post con hashtags"),
      image_url: z.string().url().describe("URL pública de la imagen"),
      image_title: z.string().max(200).optional(),
      visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
    },
    async ({ text, image_url, image_title, visibility }) => {
      try {
        const result = await li.createImagePost(text, image_url, image_title, visibility);
        return { content: [{ type: "text", text: `Post con imagen publicado. URL: ${result.url}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", server: "linkedin-mcp" }));

// Streamable HTTP — Claude.ai conector personalizado
app.all("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const srv = createMcpServer();
    res.on("close", () => srv.close().catch(() => {}));
    await srv.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// SSE legacy — Claude Code CLI
const sseTransports = new Map();

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  sseTransports.set(transport.sessionId, transport);
  res.on("close", () => sseTransports.delete(transport.sessionId));
  await createMcpServer().connect(transport);
});

app.post("/messages", async (req, res) => {
  const transport = sseTransports.get(req.query.sessionId);
  if (!transport) return res.status(404).json({ error: "Sesión no encontrada" });
  await transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`LinkedIn MCP Server en puerto ${PORT}`);
  console.log(`  /health → estado`);
  console.log(`  /mcp    → Streamable HTTP (Claude.ai)`);
  console.log(`  /sse    → SSE (Claude Code)`);
});
