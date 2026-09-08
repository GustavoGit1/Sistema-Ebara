import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VALID_ROLES = new Set(["owner", "manager", "employee"]);
const MAX_LOGIN_BODY_BYTES = 4096;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = globalThis.__estoqueLoginAttempts || new Map();
globalThis.__estoqueLoginAttempts = loginAttempts;

function normalizeName(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function usernameToEmail(username) {
  const normalized = normalizeName(username)
    .replace(/[^a-z0-9._-]/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");

  return `${normalized || "usuario"}@estoque.local`;
}

function matchesNormalized(value, expected) {
  return normalizeName(value) === normalizeName(expected);
}

function serverConfig() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function jsonError(error, status) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function authError() {
  return jsonError("Usuario ou senha incorretos", 401);
}

function clientIp(request) {
  return String(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 80);
}

function loginRateLimitKey(request, company, username) {
  return [clientIp(request), normalizeName(company).slice(0, 80), normalizeName(username).slice(0, 80)].join(":");
}

function isRateLimited(key) {
  const now = Date.now();
  for (const [attemptKey, attempt] of loginAttempts.entries()) {
    if (attempt.resetAt <= now) loginAttempts.delete(attemptKey);
  }

  const attempt = loginAttempts.get(key) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (attempt.resetAt <= now) {
    attempt.count = 0;
    attempt.resetAt = now + LOGIN_WINDOW_MS;
  }
  attempt.count += 1;
  loginAttempts.set(key, attempt);
  return attempt.count > LOGIN_MAX_ATTEMPTS;
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_LOGIN_BODY_BYTES) {
    return { error: jsonError("Requisicao muito grande.", 413) };
  }

  try {
    return { body: await request.json() };
  } catch {
    return { error: jsonError("JSON invalido.", 400) };
  }
}

export async function POST(request) {
  try {
    const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = serverConfig();
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      console.error("[login] Supabase server configuration is missing.");
      return authError();
    }

    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;

    const { company, username, password } = parsed.body || {};
    const companyName = String(company || "").trim();
    const usernameText = String(username || "").trim();
    const passwordText = String(password || "");

    if (!companyName || !usernameText || !passwordText) {
      return jsonError("Informe empresa, nome de usuario e senha.", 400);
    }
    if (companyName.length > 100 || usernameText.length > 100 || passwordText.length > 256) {
      return jsonError("Dados de login invalidos.", 400);
    }
    if (isRateLimited(loginRateLimitKey(request, companyName, usernameText))) {
      return jsonError("Muitas tentativas. Aguarde alguns minutos e tente novamente.", 429);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: companies, error: companyError } = await admin
      .from("companies")
      .select("id, name, active")
      .limit(1000);
    const companyData = (companies || []).find((item) => matchesNormalized(item.name, companyName));

    if (companyError || !companyData || companyData.active === false) {
      console.warn("[login] Invalid company or inactive company.");
      return authError();
    }

    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, username, full_name, role, company_id, active")
      .limit(1000);
    const profile = (profiles || []).find((item) => matchesNormalized(item.username, usernameText) || matchesNormalized(item.full_name, usernameText));

    if (profileError || !profile || !VALID_ROLES.has(profile.role) || profile.active === false) {
      console.warn("[login] Invalid profile, inactive profile, or invalid role.");
      return authError();
    }

    const { data: companyAccess, error: accessError } = await admin
      .from("user_companies")
      .select("permission_role")
      .eq("user_id", profile.id)
      .eq("company_id", companyData.id)
      .maybeSingle();
    const hasProfileCompanyAccess = profile.company_id === companyData.id;
    const hasLinkedCompanyAccess = Boolean(companyAccess);

    if (accessError || (!hasProfileCompanyAccess && !hasLinkedCompanyAccess)) {
      console.warn("[login] User has no access to requested company.");
      return authError();
    }

    const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
    const email = authUser?.user?.email || usernameToEmail(profile.username || profile.full_name || usernameText);
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: loginData, error: loginError } = await authClient.auth.signInWithPassword({ email, password: passwordText });

    if (loginError || !loginData.session) {
      console.warn("[login] Invalid password or missing Supabase Auth user.");
      return authError();
    }

    return NextResponse.json({
      session: loginData.session,
      company_id: companyData.id,
      role: profile.role
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[login] Unexpected error.", { message: error?.message || "Unknown error" });
    return jsonError("Nao foi possivel realizar o login agora.", 500);
  }
}