import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";

const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN; // URL ของ Server ที่ได้จาก Render
const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL; // URL จาก GitHub Pages
const REDIRECT_URI = `${DOMAIN}/callback`;

let accessToken = null;

const app = express();
app.use(express.json());

const transports = new Map();

app.get("/", (req, res) => {
  res.send("MCP Server is running! Use /sse for MCP connection.");
});

app.get("/sse", async (req, res) => {
  console.log("New SSE connection attempt");
  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);

  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);
  console.log(`Connected session: ${sessionId}`);

  res.on("close", () => {
    transports.delete(sessionId);
    server.closeTransport(transport);
    console.log(`Disconnected session: ${sessionId}`);
  });
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);

  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    console.error(`Received message for unknown session: ${sessionId}`);
    res.status(400).send("No active transport");
  }
});

app.get("/callback", (req, res) => {
  const code = req.query.code;
  if (code) {
    accessToken = `mock-token-${code}`;
    res.send(`
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #10b981;">✅ สำเร็จ!</h1>
        <p>เชื่อมต่อเรียบร้อย กลับไปคุยกับ Claude ได้เลย</p>
      </body>
    `);
  }
});

const server = new Server(
  { name: "hosted-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "hello_cloud",
      description: "Say hello from a hosted server",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "hello_cloud") {
    if (!accessToken) {
      const loginUrl = `${AUTH_SERVER_URL}?client_id=mcp&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`;
      return {
        content: [{ type: "text", text: `🔑 กรุณาล็อกอินก่อน: ${loginUrl}` }],
        isError: true,
      };
    }
    return {
      content: [
        { type: "text", text: "สวัสดี! นี่คือข้อความจาก MCP Server บน Cloud" },
      ],
    };
  }
});

app.listen(PORT, () => console.error(`Server running on port ${PORT}`));
