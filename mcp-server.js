import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";

// --- Configuration ---
const PORT = 3000;
const AUTH_SERVER_URL = "https://noppadonpeak.github.io/mcp-auth-web";
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

// --- In-Memory State ---
let accessToken = null;

// --- Express Server for OAuth Callback ---
const app = express();

app.get("/callback", (req, res) => {
  const code = req.query.code;
  if (code) {
    accessToken = `mock-token-${code}`;
    res.send(`
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #10b981;">✅ ยืนยันตัวตนสำเร็จ!</h1>
        <p>คุณสามารถปิดหน้าต่างนี้ และกลับไปคุยกับ Claude ได้เลยครับ</p>
      </body>
    `);
  } else {
    res.status(400).send("Login Failed");
  }
});

app.listen(PORT, () => {
  console.error(`[MCP] Callback listener started on port ${PORT}`);
});

// --- MCP Server Logic ---
const server = new Server(
  { name: "oauth-learning-server", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "hello_world",
        description: "A tool that requires login to say hello",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "logout",
        description: "Clear your session",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === "logout") {
    accessToken = null;
    return { content: [{ type: "text", text: "Logged out successfully." }] };
  }

  if (name === "hello_world") {
    if (!accessToken) {
      const loginUrl = `${AUTH_SERVER_URL}?client_id=mcp_client&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`;

      // ส่งข้อความแบบ Error เพื่อให้ Claude รู้ว่าต้องจัดการอะไรบางอย่างก่อน
      return {
        content: [
          {
            type: "text",
            text: `🔑 คุณจำเป็นต้องเชื่อมต่อบัญชีของคุณก่อนเริ่มใช้งาน\n\nกรุณาคลิกลิงก์ด้านล่างเพื่อเข้าสู่ระบบ:\n${loginUrl}`,
          },
        ],
        isError: true, // การใส่ isError ช่วยให้ Claude สรุปคำแนะนำให้ผู้ใช้ชัดขึ้น
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `สวัสดีครับ! ระบบตรวจพบ Token ของคุณแล้ว: ${accessToken}`,
        },
      ],
    };
  }

  throw new Error("Tool not found");
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);
