import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const SECRET_KEY = "your-very-secure-secret";
const LOGIN_PAGE_URL = "https://noppadonpeak.github.io/mcp-auth-web";
const MCP_SERVER_URL = "https://mcp-oauth-server-bxh3.onrender.com";

const app = express();
app.use(express.json());

// --- [SETTING] CORS ---
// อนุญาตให้ Web Login เข้าถึง API ได้ (ปรับเปลี่ยน URL ตามจริง)
app.use(
  cors({
    origin: [LOGIN_PAGE_URL, `[${LOGIN_PAGE_URL}](${LOGIN_PAGE_URL})`],
    credentials: true,
  }),
);

// --- [DB] PERSISTENCE (In-Memory) ---
const authSessions = new Map(); // เก็บ { state: { codeChallenge, clientId, redirectUri } }
const validTokens = new Map(); // เก็บ { accessToken: { user, expiresAt } }

// ฟังก์ชันช่วยตรวจสอบ PKCE S256
function verifyPKCE(verifier, challenge) {
  console.log("verifyPKCE");
  const hash = crypto.createHash("sha256").update(verifier).digest("base64url");
  console.log(verifier, challenge, hash);
  return hash === challenge;
}

// --- [PART 1] DISCOVERY ---
app.get("/.well-known/oauth-protected-resource", (req, res) => {
  res.json({
    resource: MCP_SERVER_URL,
    authorization_servers: [MCP_SERVER_URL],
    scopes_supported: ["mcp:tools"],
  });
});

// --- [PART 2] OAUTH ENDPOINTS ---
app.get("/oauth/authorize", (req, res) => {
  const {
    client_id,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
  } = req.query;

  // เก็บข้อมูลลง Session DB ชั่วคราว
  authSessions.set(state, {
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    method: code_challenge_method || "S256",
  });

  // ส่งไปหน้า Login พร้อมส่ง state ไปด้วย
  res.redirect(
    `${LOGIN_PAGE_URL}?state=${state}&client_id=${client_id}&redirect=${encodeURIComponent(redirect_uri)}`,
  );
});

app.get("/callback", (req, res) => {
  const { code, state, code_verifier, client_id } = req.query;
  const session = authSessions.get(state);

  console.log("callback");
  console.log("authSessions list", Array.from(authSessions.keys()));
  console.log("session", session);
  console.log("code_verifier", code_verifier);

  if (!session) {
    return res.status(400).send(`
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #ef4444;">❌ ไม่สำเร็จ</h1>
        <p>Invalid state: เซสชันหมดอายุหรือข้อมูลไม่ถูกต้อง</p>
      </body>
    `);
  }

  // ตรวจสอบ PKCE
  //if (!verifyPKCE(code_verifier, session.codeChallenge)) {
  if (code_verifier !== session.codeChallenge) {
    return res.status(400).send(`
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #ef4444;">❌ ไม่สำเร็จ</h1>
        <p>PKCE verification failed: ข้อมูลการยืนยันไม่ถูกต้อง</p>
      </body>
    `);
  }

  // สร้าง Access Token
  const accessToken = jwt.sign({ user: "demo-user" }, SECRET_KEY);

  // บันทึกลง Persistence DB
  validTokens.set(accessToken, {
    user: "demo-user",
    clientId: client_id,
  });

  // ลบ session ที่ใช้แล้ว
  authSessions.delete(state);

  // res.json({
  //   access_token: accessToken,
  //   token_type: "Bearer",
  //   expires_in: 3600,
  // });

  console.log("Done ✅");
  console.log("authSessions", authSessions);
  console.log("validTokens", validTokens);
  res.send(`
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #10b981;">✅ สำเร็จ!</h1>
        <p>เชื่อมต่อเรียบร้อย กลับไปคุยกับ Claude ได้เลย</p>
      </body>
    `);
});

// --- [PART 3] MCP SERVER LOGIC ---
const mcp = new McpServer({ name: "Secure Remote Server", version: "1.0.0" });

mcp.tool("check_auth", {}, async () => ({
  content: [{ type: "text", text: "คุณผ่านการตรวจสอบ PKCE และ Token สำเร็จ!" }],
}));

let transport;
app.get("/mcp/sse", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  // ตรวจสอบ Token จาก Persistence DB
  if (!token || !validTokens.has(token)) {
    return res.status(401).send("Unauthorized: Invalid or expired token");
  }

  transport = new SSEServerTransport("/mcp/messages", res);
  await mcp.connect(transport);
});

app.post("/mcp/messages", async (req, res) => {
  if (transport) await transport.handlePostMessage(req, res);
});

app.listen(3000, () =>
  console.log("MCP Server running on http://localhost:3000"),
);
