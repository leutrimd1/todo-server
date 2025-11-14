import { createServer } from "http";
import { parse } from "url";
import { DatabaseSync } from "node:sqlite";
import path from "path";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sanitizeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

// Initialize SQLite database
const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "todos.db");
const db = new DatabaseSync(dbPath);

// Create todos table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Prepare statements for better performance
const getTodos = db.prepare("SELECT id, todo FROM todos ORDER BY id");
const insertTodo = db.prepare("INSERT INTO todos (todo) VALUES (?)");
const deleteTodo = db.prepare("DELETE FROM todos WHERE id = ?");

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    return res.end();
  }

  const url = parse(req.url, true);

  if (url.pathname === "/todos" && req.method === "GET") {
    try {
      const todos = getTodos.all();
      res.writeHead(200, headers);
      res.end(JSON.stringify(todos));
    } catch (error) {
      res.writeHead(500, headers);
      res.end(JSON.stringify({ error: "Database error" }));
    }
  } else if (url.pathname === "/todos" && req.method === "POST") {
    let body = "";
    let bodySize = 0;

    req.on("data", (chunk) => {
      bodySize += chunk.length;
      if (bodySize > 10000) {
        res.writeHead(413, headers);
        res.end(JSON.stringify({ error: "Payload too large" }));
        return;
      }
      body += chunk;
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (!data.todo || typeof data.todo !== "string" || data.todo.length > 1000) {
          throw new Error("Invalid todo");
        }

        const sanitizedTodo = sanitizeHtml(data.todo.trim());
        const result = insertTodo.run(sanitizedTodo);
        const todos = getTodos.all();

        res.writeHead(201, headers);
        res.end(JSON.stringify({ success: true, id: result.lastInsertRowid, todos }));
      } catch (error) {
        res.writeHead(400, headers);
        res.end(JSON.stringify({ error: "Invalid todo" }));
      }
    });
  } else if (url.pathname?.startsWith("/todos/") && req.method === "DELETE") {
    const id = parseInt(url.pathname.split("/")[2], 10);
    
    if (isNaN(id) || id < 1) {
      res.writeHead(400, headers);
      return res.end(JSON.stringify({ error: "Invalid ID" }));
    }

    try {
      const result = deleteTodo.run(id);
      
      if (result.changes === 0) {
        res.writeHead(404, headers);
        return res.end(JSON.stringify({ error: "Todo not found" }));
      }

      const todos = getTodos.all();
      res.writeHead(200, headers);
      res.end(JSON.stringify({ success: true, todos }));
    } catch (error) {
      res.writeHead(500, headers);
      res.end(JSON.stringify({ error: "Database error" }));
    }
  } else {
    res.writeHead(404, headers);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
  console.log(`Todo server running at http://localhost:${PORT}`);
  console.log(`Using database: ${dbPath}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing database...");
  db.close();
  process.exit(0);
});
