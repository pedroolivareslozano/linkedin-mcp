import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { LinkedInClient } from "./linkedin.js";

// ── Configuración ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const ORG_ID = process.env.LINKEDIN_ORGANIZATION_ID || null; // opcional: ID de página de empresa

if (!ACCESS_TOKEN) {
  console.error("❌ Falta LINKEDIN_ACCESS_TOKEN en las variables de entorno.");
  process.exit(1);
}

// ── Cliente LinkedIn ──────────────────────────────────────────────────────────
const li = new LinkedInClient(ACCESS_TOKEN, ORG_ID);

// ── Servidor MCP ──────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "linkedin-mcp",
  version: "1.0.0",
  description: "Servidor MCP para publicar contenido en LinkedIn desde Claude",
});

// Herramienta: obtener perfil
server.tool("get_profile", "Obtiene el perfil del autor autenticado (persona u organización)", {}, async () => {
  try {
    const profile = await li.getProfile();
    const text = ORG_ID
      ? `Publicando como organización: ID ${ORG_ID}`
      : `Publicando como: ${profile.name || profile.sub} (${profile.email || "sin email"})`;
    return { content: [{ type: "text", text }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

// Herramienta: publicar post de texto
server.tool(
  "publish_text_post",
  "Publica un post de solo texto en LinkedIn",
  {
    text: z.string().min(1).max(3000).describe("Texto completo del post, incluyendo hashtags"),
    visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC").describe("Visibilidad del post"),
  },
  async ({ text, visibility }) => {
    try {
      const result = await li.createTextPost(text, visibility);
      return {
        content: [
          {
            type: "text",
            text: `✅ Post publicado correctamente.\nID: ${result.postId}\nURL: ${result.url}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `❌ Error: ${err.message}` }], isError: true };
    }
  }
);

// Herramienta: publicar post con imagen
server.tool(
  "publish_image_post",
  "Publica un post con imagen en LinkedIn. La imagen se descarga desde una URL pública.",
  {
    text: z.string().min(1).max(3000).describe("Texto del post, incluyendo hashtags"),
    image_url: z.string().url().describe("URL pública de la imagen (JPEG, PNG o GIF)"),
    image_title: z.string().max(200).optional().describe("Título descriptivo de la imagen"),
    visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC").describe("Visibilidad del post"),
  },
  async ({ text, image_url, image_title, visibility }) => {
    try {
      const result = await li.createImagePost(text, image_url, image_title, visibility);
      return {
        content: [
          {
            type: "text",
            text: `✅ Post con imagen publicado correctamente.\nID: ${result.postId}\nURL: ${result.url}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `❌ Error: ${err.message}` }], isError: true };
    }
  }
);

// Herramienta: obtener estadísticas de un post
server.tool(
  "get_post_stats",
  "Obtiene las estadísticas (likes, comentarios) de un post publicado",
  {
    post_urn: z.string().describe("URN del post. Ejemplo: urn:li:ugcPost:1234567890"),
  },
  async ({ post_urn }) => {
    try {
      const stats = await li.getPostStats(post_urn);
      const likes = stats.likesSummary?.totalLikes ?? 0;
      const comments = stats.commentsSummary?.totalFirstLevelComments ?? 0;
      return {
        content: [
          {
            type: "text",
            text: `📊 Estadísticas del post:\n- Me gusta: ${likes}\n- Comentarios: ${comments}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `❌ Error: ${err.message}` }], isError: true };
    }
  }
);

// ── Express + SSE ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

const transports = new Map();

app.get("/health", (_req, res) => res.json({ status: "ok", server: "linkedin-mcp" }));

app.get("/sse", async (req, res) => {
  console.log("Nueva conexión SSE");
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);
  res.on("close", () => {
    console.log(`Sesión cerrada: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Sesión no encontrada" });
    return;
  }
  await transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║      LinkedIn MCP Server arrancado       ║
╠══════════════════════════════════════════╣
║  Puerto : ${PORT.toString().padEnd(31)}║
║  SSE    : http://localhost:${PORT}/sse         ║
║  Health : http://localhost:${PORT}/health      ║
╚══════════════════════════════════════════╝
  `);
});
