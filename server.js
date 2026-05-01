const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const SESSION_COOKIE = "calculator_session";

const users = {
  Vasya: {
    password: "12345",
    role: "Администратор",
    allowedOperators: ["+", "-", "*", "/"],
  },
  Petya: {
    password: "12345",
    role: "Пользователь",
    allowedOperators: ["+", "-"],
  },
};

const sessions = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Role Calculator API",
    version: "1.0.0",
    description: "API for a calculator with cookie sessions and role-based access.",
  },
  servers: [
    {
      url: "/",
      description: "Current server",
    },
  ],
  tags: [
    {
      name: "Auth",
      description: "Login, logout, and current user session.",
    },
    {
      name: "Calculator",
      description: "Role-protected calculations.",
    },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: SESSION_COOKIE,
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          name: {
            type: "string",
            example: "Vasya",
          },
          role: {
            type: "string",
            enum: ["Администратор", "Пользователь"],
            example: "Администратор",
          },
          allowedOperators: {
            type: "array",
            items: {
              type: "string",
              enum: ["+", "-", "*", "/"],
            },
            example: ["+", "-", "*", "/"],
          },
        },
        required: ["name", "role", "allowedOperators"],
      },
      LoginRequest: {
        type: "object",
        properties: {
          username: {
            type: "string",
            example: "Vasya",
          },
          password: {
            type: "string",
            example: "12345",
          },
        },
        required: ["username", "password"],
      },
      UserResponse: {
        type: "object",
        properties: {
          user: {
            $ref: "#/components/schemas/User",
          },
        },
        required: ["user"],
      },
      CalculateRequest: {
        type: "object",
        properties: {
          first: {
            type: "number",
            example: 6,
          },
          second: {
            type: "number",
            example: 7,
          },
          operator: {
            type: "string",
            enum: ["+", "-", "*", "/"],
            example: "*",
          },
        },
        required: ["first", "second", "operator"],
      },
      CalculateResponse: {
        type: "object",
        properties: {
          result: {
            type: "string",
            example: "42",
          },
        },
        required: ["result"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "string",
            example: "Not authenticated",
          },
        },
        required: ["error"],
      },
    },
  },
  paths: {
    "/api/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        description: "Creates an HttpOnly cookie session for Vasya or Petya.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/LoginRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Authenticated successfully.",
            headers: {
              "Set-Cookie": {
                schema: {
                  type: "string",
                },
                description: "Session cookie.",
              },
            },
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UserResponse",
                },
              },
            },
          },
          401: {
            description: "Invalid credentials.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out",
        security: [{ cookieAuth: [] }],
        responses: {
          204: {
            description: "Session removed.",
          },
        },
      },
    },
    "/api/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user",
        security: [{ cookieAuth: [] }],
        responses: {
          200: {
            description: "Current authenticated user.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UserResponse",
                },
              },
            },
          },
          401: {
            description: "No active session.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/calculate": {
      post: {
        tags: ["Calculator"],
        summary: "Calculate expression",
        description: "Performs the operation only if it is allowed for the current user's role.",
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CalculateRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Calculation result.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CalculateResponse",
                },
              },
            },
          },
          400: {
            description: "Invalid input or division by zero.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          401: {
            description: "No active session.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          403: {
            description: "Operation is not allowed for the current role.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
  },
};

function swaggerHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Role Calculator API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.addEventListener("load", () => {
        SwaggerUIBundle({
          url: "/openapi.json",
          dom_id: "#swagger-ui",
          presets: [SwaggerUIBundle.presets.apis],
          layout: "BaseLayout",
          requestInterceptor: (request) => {
            request.credentials = "same-origin";
            return request;
          },
        });
      });
    </script>
  </body>
</html>`;
}

function publicUser(username) {
  const user = users[username];

  if (!user) {
    return null;
  }

  return {
    name: username,
    role: user.role,
    allowedOperators: user.allowedOperators,
  };
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function getCurrentUsername(request) {
  const cookies = parseCookies(request.headers.cookie);
  return sessions.get(cookies[SESSION_COOKIE]) || null;
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    ...extraHeaders,
  });
  response.end(html);
}

function sendEmpty(response, statusCode, extraHeaders = {}) {
  response.writeHead(statusCode, extraHeaders);
  response.end();
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 10_000) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function createSession(username) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  sessions.set(sessionId, username);
  return sessionId;
}

function sessionCookie(sessionId) {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/`;
}

function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function calculate(first, second, operator) {
  switch (operator) {
    case "+":
      return first + second;
    case "-":
      return first - second;
    case "*":
      return first * second;
    case "/":
      return second === 0 ? null : first / second;
    default:
      return undefined;
  }
}

function formatNumber(value) {
  return Number.parseFloat(value.toFixed(10)).toString();
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/me" && request.method === "GET") {
    const username = getCurrentUsername(request);

    if (!username) {
      sendJson(response, 401, { error: "Not authenticated" });
      return;
    }

    sendJson(response, 200, { user: publicUser(username) });
    return;
  }

  if (pathname === "/api/login" && request.method === "POST") {
    const { username, password } = await readJsonBody(request);
    const user = users[username];

    if (!user || user.password !== password) {
      sendJson(response, 401, { error: "Неверный логин или пароль" });
      return;
    }

    const sessionId = createSession(username);
    sendJson(response, 200, { user: publicUser(username) }, { "Set-Cookie": sessionCookie(sessionId) });
    return;
  }

  if (pathname === "/api/logout" && request.method === "POST") {
    const cookies = parseCookies(request.headers.cookie);
    sessions.delete(cookies[SESSION_COOKIE]);
    sendEmpty(response, 204, { "Set-Cookie": expiredSessionCookie() });
    return;
  }

  if (pathname === "/api/calculate" && request.method === "POST") {
    const username = getCurrentUsername(request);

    if (!username) {
      sendJson(response, 401, { error: "Not authenticated" });
      return;
    }

    const user = users[username];
    const { first, second, operator } = await readJsonBody(request);
    const firstNumber = Number(first);
    const secondNumber = Number(second);

    if (!Number.isFinite(firstNumber) || !Number.isFinite(secondNumber)) {
      sendJson(response, 400, { error: "Некорректные числа" });
      return;
    }

    if (!user.allowedOperators.includes(operator)) {
      sendJson(response, 403, { error: "Операция недоступна для вашей роли" });
      return;
    }

    const result = calculate(firstNumber, secondNumber, operator);

    if (result === undefined) {
      sendJson(response, 400, { error: "Неизвестная операция" });
      return;
    }

    if (result === null) {
      sendJson(response, 400, { error: "Деление на ноль запрещено" });
      return;
    }

    sendJson(response, 200, { result: formatNumber(result) });
    return;
  }

  sendJson(response, 404, { error: "API route not found" });
}

async function serveStatic(response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendEmpty(response, 403);
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);

    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
    });
    response.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendEmpty(response, 404);
      return;
    }

    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname === "/openapi.json" && ["GET", "HEAD"].includes(request.method)) {
      if (request.method === "HEAD") {
        sendEmpty(response, 200, { "Content-Type": "application/json; charset=utf-8" });
        return;
      }

      sendJson(response, 200, openApiSpec);
      return;
    }

    if (url.pathname === "/docs" && ["GET", "HEAD"].includes(request.method)) {
      if (request.method === "HEAD") {
        sendEmpty(response, 200, { "Content-Type": "text/html; charset=utf-8" });
        return;
      }

      sendHtml(response, 200, swaggerHtml());
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Calculator server is running at http://localhost:${PORT}`);
});
