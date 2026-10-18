// Tavoryn Terminal — Netlify Serverless API Function
// Zero-dependency streaming adapter bridging Netlify Functions (v1 & v2) to server.js

import { Readable } from "node:stream";
import { handle } from "../../server.js";

class ServerlessResponse {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.headersSent = false;
    this._onEnd = null;
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        this.headers[k.toLowerCase()] = v;
      }
    }
    this.headersSent = true;
    return this;
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  getHeader(name) {
    return this.headers[name.toLowerCase()];
  }

  write(chunk) {
    if (chunk) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return true;
  }

  end(chunk) {
    if (chunk) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    this.headersSent = true;
    if (this._onEnd) this._onEnd();
    return this;
  }
}

export async function handler(event, context) {
  // Support Netlify Functions v2 Web Request if called directly with Request
  if (
    typeof Request !== "undefined" &&
    (event instanceof Request || (event && typeof event.text === "function" && event.url))
  ) {
    const webReq = event;
    const urlObj = new URL(webReq.url);
    const text = await webReq.text();
    const headersObj = {};
    for (const [k, v] of webReq.headers.entries()) {
      headersObj[k] = v;
    }
    const adaptedEvent = {
      path: urlObj.pathname,
      rawQuery: urlObj.search.replace(/^\?/, ""),
      httpMethod: webReq.method,
      headers: headersObj,
      body: text,
      isBase64Encoded: false,
    };
    const resObj = await handler(adaptedEvent, context);
    return new Response(
      resObj.isBase64Encoded ? Buffer.from(resObj.body, "base64") : resObj.body,
      {
        status: resObj.statusCode,
        headers: resObj.headers,
      },
    );
  }

  // 1. Resolve normalized request path and query string
  let reqPath = event.path || "/api";
  if (reqPath.startsWith("/.netlify/functions/api")) {
    reqPath = "/api" + reqPath.slice("/.netlify/functions/api".length);
  }
  if (!reqPath.startsWith("/api")) {
    reqPath = "/api" + (reqPath.startsWith("/") ? reqPath : "/" + reqPath);
  }

  let queryString = "";
  if (event.rawQuery) {
    queryString = "?" + event.rawQuery;
  } else if (event.queryStringParameters) {
    const qs = new URLSearchParams(event.queryStringParameters).toString();
    if (qs) queryString = "?" + qs;
  }
  const fullUrl = reqPath + queryString;

  // 2. Prepare headers with Netlify function authorization mark
  const headers = Object.assign({}, event.headers || {});
  headers["x-netlify-function"] = "1";
  if (!headers.host) {
    headers.host = "localhost";
  }

  // 3. Prepare payload buffer
  let bodyBuffer = Buffer.alloc(0);
  if (event.body) {
    bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body, "utf8");
  }

  // 4. Create Node.js IncomingMessage-compatible stream
  const req = new Readable({
    read() {
      this.push(bodyBuffer.length ? bodyBuffer : null);
      if (bodyBuffer.length) this.push(null);
    },
  });
  req.url = fullUrl;
  req.method = event.httpMethod || "GET";
  req.headers = headers;

  // 5. Create ServerlessResponse and dispatch to server routing engine
  const res = new ServerlessResponse();
  await new Promise((resolve) => {
    res._onEnd = resolve;
    handle(req, res).catch((err) => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.write(JSON.stringify({ error: err.message || "Internal Server Error" }));
      }
      resolve();
    });
  });

  const responseBuffer = Buffer.concat(res.chunks);
  const contentType = res.headers["content-type"] || "";
  const isBinary =
    Boolean(contentType) &&
    !contentType.startsWith("text/") &&
    !contentType.includes("json") &&
    !contentType.includes("javascript") &&
    !contentType.includes("xml");

  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: isBinary
      ? responseBuffer.toString("base64")
      : responseBuffer.toString("utf8"),
    isBase64Encoded: isBinary,
  };
}

export default async function (request, context) {
  return handler(request, context);
}
