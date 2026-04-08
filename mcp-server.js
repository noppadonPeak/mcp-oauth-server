import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";

const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN || "http://localhost:3000"; // URL ของ Server ที่ได้จาก Render
const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || "http://localhost:5500/"; // URL จาก GitHub Pages
const REDIRECT_URI = `${DOMAIN}/callback`;

const app = express();
// ลบ express.json() ออกเพื่อให้ MCP SDK จัดการ Stream เองได้

// เก็บข้อมูลแต่ละ Session: { transport, server, accessToken }
const sessions = new Map();

app.get("/", (req, res) => {
  res.send("MCP Server is running! Use /sse for MCP connection.");
});

app.get("/sse", async (req, res) => {
  console.log("New SSE connection attempt");
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;

  // สร้าง Server สำหรับแต่ละ Session เพื่อเลี่ยง Error "Already connected"
  const server = new Server(
    { name: "hosted-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // ตั้งค่า Handlers สำหรับ Server นี้
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
      const session = sessions.get(sessionId);
      if (!session || !session.accessToken) {
        // ส่ง sessionId ไปใน state เพื่อให้รู้ว่าใครกำลังล็อกอิน
        const loginUrl = `${AUTH_SERVER_URL}?client_id=mcp&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&session_id=${sessionId}`;
        return {
          content: [{ type: "text", text: `🔑 กรุณาล็อกอินก่อน: ${loginUrl}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: "สวัสดี! นี่คือข้อความจาก MCP Server บน Cloud",
          },
        ],
      };
    }
  });

  await server.connect(transport);

  sessions.set(sessionId, { transport, server, accessToken: null });
  console.log(`Connected session: ${sessionId}`);

  res.on("close", () => {
    sessions.delete(sessionId);
    console.log(`Disconnected session: ${sessionId}`);
  });
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = sessions.get(sessionId);

  if (session && session.transport) {
    await session.transport.handlePostMessage(req, res);
  } else {
    console.error(`Received message for unknown session: ${sessionId}`);
    res.status(400).send("No active transport");
  }
});

app.get("/callback", (req, res) => {
  const code = req.query.code;
  const sessionId = req.query.session_id; // รับ sessionId คืนมาจาก state

  if (code && sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    session.accessToken = `mock-token-${code}`;

    res.send(`
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #10b981;">✅ สำเร็จ!</h1>
        <p>เชื่อมต่อเรียบร้อย กลับไปคุยกับ Claude ได้เลย</p>
      </body>
    `);
  } else {
    res.status(400).send("Invalid callback or session expired.");
  }
});

app.listen(PORT, () => console.error(`Server running on port ${PORT}`));
