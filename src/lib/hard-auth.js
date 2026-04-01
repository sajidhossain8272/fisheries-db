import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "fisher_session";
const SESSION_MAX_AGE = 60 * 60 * 12;

function getSecret() {
  return process.env.AUTH_SECRET || "replace-with-strong-secret";
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function parseBase64Url(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function getConfiguredUsers() {
  return [
    {
      role: "super_admin",
      username: (process.env.SUPER_ADMIN_USER || "superadmin").trim(),
      password: process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin@123",
      name: "Super Admin"
    },
    {
      role: "admin",
      username: (process.env.ADMIN_USER || "admin").trim(),
      password: process.env.ADMIN_PASSWORD || "Admin@123",
      name: "Product Admin"
    },
    {
      role: "employee",
      username: (process.env.EMPLOYEE_USER || "employee").trim(),
      password: process.env.EMPLOYEE_PASSWORD || "Employee@123",
      name: "Sales Employee"
    }
  ];
}

function createToken(session) {
  const payload = base64Url(JSON.stringify(session));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function decodeToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);
  if (signature.length !== expected.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const data = JSON.parse(parseBase64Url(payload));
    if (!data?.username || !data?.role || !data?.exp) {
      return null;
    }
    if (Date.now() > data.exp) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function validateCredentials(username, password) {
  const normalized = String(username || "").trim().toLowerCase();
  return (
    getConfiguredUsers().find(
      (user) => user.username.toLowerCase() === normalized && user.password === String(password || "")
    ) || null
  );
}

export async function createSession(user) {
  const session = {
    username: user.username,
    role: user.role,
    name: user.name,
    exp: Date.now() + SESSION_MAX_AGE * 1000
  };
  const token = createToken(session);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return decodeToken(token);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export function getCredentialHints() {
  return getConfiguredUsers().map((user) => ({
    role: user.role,
    username: user.username,
    password: user.password
  }));
}
