import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_ADMIN_BODY_BYTES = 8192;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(error, status) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_ADMIN_BODY_BYTES) {
    return { error: jsonError("Requisicao muito grande.", 413) };
  }

  try {
    return { body: await request.json() };
  } catch {
    return { error: jsonError("JSON invalido.", 400) };
  }
}

function isUuid(value) {
  return UUID_RE.test(String(value || ""));
}
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

function createAdminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function getAdminContext(request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return { error: jsonError("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor.", 500) };
  }

  const admin = createAdminClient();
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: jsonError("Usuario nao autenticado.", 401) };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const { data: requesterData, error: requesterError } = await admin.auth.getUser(token);
  if (requesterError || !requesterData.user) {
    return { error: jsonError("Usuario nao autenticado.", 401) };
  }

  const { data: requesterProfile } = await admin
    .from("profiles")
    .select("id, role, active")
    .eq("id", requesterData.user.id)
    .single();

  if (!["owner", "manager"].includes(requesterProfile?.role) || requesterProfile?.active === false) {
    return { error: jsonError("Sem permissao para gerenciar usuarios.", 403) };
  }

  return { admin, requesterProfile };
}

function uniqueIds(ids) {
  return [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
}

function userPayloadFromBody(body) {
  const fullName = String(body.full_name || body.username || "").trim();
  const companyIds = uniqueIds(Array.isArray(body.company_ids) ? body.company_ids : [body.company_id]);

  return {
    id: body.id,
    username: fullName,
    full_name: fullName,
    password: body.password,
    role: body.role,
    company_id: companyIds[0] || "",
    company_ids: companyIds,
    active: body.active
  };
}

function validateUserPayload({ full_name, password, role, company_ids }, requirePassword) {
  if (!full_name || !role || !company_ids.length) return "Nome, permissao e empresa sao obrigatorios.";
  if (full_name.length > 100) return "Nome muito longo.";
  if (company_ids.some((companyId) => !isUuid(companyId))) return "Empresa invalida.";
  if (!["owner", "manager", "employee"].includes(role)) return "Permissao invalida.";
  if (requirePassword && !password) return "Informe a senha.";
  if (password !== undefined && password !== "" && String(password).length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (password !== undefined && String(password).length > 256) return "Senha muito longa.";
  return "";
}

async function ensureCompaniesAreUsable(admin, companyIds) {
  const { data: companies, error } = await admin
    .from("companies")
    .select("id, active")
    .in("id", companyIds);

  if (error || !companies || companies.length !== companyIds.length) return "Empresa incorreta ou usuario sem acesso a esta empresa";
  if (companies.some((company) => company.active === false)) return "Empresa inativa";
  return "";
}

async function findProfileByUsername(admin, username) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, username")
    .ilike("username", username)
    .limit(10);

  if (error) return { error };

  return {
    profile: (data || []).find((item) => normalizeName(item.username) === normalizeName(username))
  };
}

async function upsertCompanyLinks(admin, userId, companyIds, role) {
  await admin.from("user_companies").delete().eq("user_id", userId);
  return admin.from("user_companies").insert(companyIds.map((companyId) => ({
    user_id: userId,
    company_id: companyId,
    permission_role: role
  })));
}

async function getLinkedCompanyIds(admin, userId) {
  const [{ data: profile }, { data: links, error }] = await Promise.all([
    admin.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    admin.from("user_companies").select("company_id").eq("user_id", userId)
  ]);

  if (error) return { error };
  return {
    companyIds: [...new Set([profile?.company_id, ...(links || []).map((link) => link.company_id)].filter(Boolean))]
  };
}

async function userSharesManagedCompany(admin, requesterId, targetId) {
  const [requesterCompanies, targetCompanies] = await Promise.all([
    getLinkedCompanyIds(admin, requesterId),
    getLinkedCompanyIds(admin, targetId)
  ]);

  if (requesterCompanies.error || targetCompanies.error) {
    return { error: "Nao foi possivel carregar vinculos de empresa." };
  }

  const requesterCompanySet = new Set(requesterCompanies.companyIds);
  return {
    ok: targetCompanies.companyIds.some((companyId) => requesterCompanySet.has(companyId))
  };
}

export async function POST(request) {
  try {
    const context = await getAdminContext(request);
    if (context.error) return context.error;
    const { admin, requesterProfile } = context;
    if (requesterProfile.role !== "owner") {
      return NextResponse.json({ error: "Apenas Administrador do Sistema pode criar usuarios." }, { status: 403 });
    }
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const form = userPayloadFromBody(parsed.body);
    const validationError = validateUserPayload(form, true);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const companyError = await ensureCompaniesAreUsable(admin, form.company_ids);
    if (companyError) return NextResponse.json({ error: companyError }, { status: 400 });

    const existingProfile = await findProfileByUsername(admin, form.username);
    if (existingProfile.error) return NextResponse.json({ error: existingProfile.error.message }, { status: 400 });
    if (existingProfile.profile) return NextResponse.json({ error: "Ja existe um usuario com este nome." }, { status: 400 });

    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email: usernameToEmail(form.username),
      password: form.password,
      email_confirm: true,
      user_metadata: { full_name: form.full_name, role: form.role, username: form.username }
    });

    if (userError) return NextResponse.json({ error: userError.message }, { status: 400 });

    const userId = userData.user.id;
    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      username: form.username,
      full_name: form.full_name,
      role: form.role,
      company_id: form.company_id,
      active: form.active !== false
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    const { error: accessError } = await upsertCompanyLinks(admin, userId, form.company_ids, form.role);
    if (accessError) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: accessError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: userId });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const context = await getAdminContext(request);
    if (context.error) return context.error;
    const { admin, requesterProfile } = context;
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const form = userPayloadFromBody(parsed.body);
    if (!form.id) return jsonError("Usuario nao informado.", 400);
    if (!isUuid(form.id)) return jsonError("Usuario invalido.", 400);
    if (form.id === requesterProfile.id && form.active === false) {
      return NextResponse.json({ error: "Voce nao pode inativar seu proprio usuario." }, { status: 400 });
    }

    const validationError = validateUserPayload(form, false);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("id, username, full_name, role, company_id, active")
      .eq("id", form.id)
      .maybeSingle();

    if (targetError || !targetProfile) return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });

    if (requesterProfile.role === "manager") {
      if (targetProfile.role === "owner") {
        return NextResponse.json({ error: "Gestor nao pode alterar Administrador do Sistema." }, { status: 403 });
      }
      if (targetProfile.role !== "employee") {
        return NextResponse.json({ error: "Gestor so pode alterar funcionarios." }, { status: 403 });
      }

      const requesterCompanies = await getLinkedCompanyIds(admin, requesterProfile.id);
      const targetCompanies = await getLinkedCompanyIds(admin, form.id);
      if (requesterCompanies.error || targetCompanies.error) {
        return NextResponse.json({ error: "Nao foi possivel carregar vinculos de empresa." }, { status: 400 });
      }

      const requesterCompanySet = new Set(requesterCompanies.companyIds);
      const targetCompanySet = new Set(targetCompanies.companyIds);
      const requestedCompanySet = new Set(form.company_ids);
      const keepsOutsideScope = targetCompanies.companyIds
        .filter((companyId) => !requesterCompanySet.has(companyId))
        .every((companyId) => requestedCompanySet.has(companyId));
      const onlyAddsInsideScope = form.company_ids.every((companyId) => requesterCompanySet.has(companyId) || targetCompanySet.has(companyId));

      if (!keepsOutsideScope || !onlyAddsInsideScope) {
        return NextResponse.json({ error: "Gestor so pode alterar empresas dentro do proprio acesso." }, { status: 403 });
      }

      const scopedCompanyIds = form.company_ids.filter((companyId) => requesterCompanySet.has(companyId));
      const outsideCompanyIds = targetCompanies.companyIds.filter((companyId) => !requesterCompanySet.has(companyId));
      const nextCompanyIds = [...new Set([...outsideCompanyIds, ...scopedCompanyIds])];
      if (!nextCompanyIds.length) return NextResponse.json({ error: "Usuario precisa ficar vinculado a pelo menos uma empresa." }, { status: 400 });

      const companyError = await ensureCompaniesAreUsable(admin, nextCompanyIds);
      if (companyError) return NextResponse.json({ error: companyError }, { status: 400 });

      const { error: profileError } = await admin.from("profiles").update({
        company_id: nextCompanyIds[0]
      }).eq("id", form.id);
      if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });

      const { error: accessError } = await upsertCompanyLinks(admin, form.id, nextCompanyIds, targetProfile.role);
      if (accessError) return NextResponse.json({ error: accessError.message }, { status: 400 });

      return NextResponse.json({ ok: true });
    }

    const companyError = await ensureCompaniesAreUsable(admin, form.company_ids);
    if (companyError) return NextResponse.json({ error: companyError }, { status: 400 });

    const existingProfile = await findProfileByUsername(admin, form.username);
    if (existingProfile.error) return NextResponse.json({ error: existingProfile.error.message }, { status: 400 });
    if (existingProfile.profile && existingProfile.profile.id !== form.id) {
      return NextResponse.json({ error: "Ja existe um usuario com este nome." }, { status: 400 });
    }

    const authPayload = {
      email: usernameToEmail(form.username),
      user_metadata: { full_name: form.full_name, role: form.role, username: form.username }
    };
    if (form.password) authPayload.password = form.password;

    const { error: authError } = await admin.auth.admin.updateUserById(form.id, authPayload);
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });

    const { error: profileError } = await admin.from("profiles").update({
      username: form.username,
      full_name: form.full_name,
      role: form.role,
      company_id: form.company_id,
      active: form.active !== false
    }).eq("id", form.id);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });

    const { error: accessError } = await upsertCompanyLinks(admin, form.id, form.company_ids, form.role);
    if (accessError) return NextResponse.json({ error: accessError.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const context = await getAdminContext(request);
    if (context.error) return context.error;
    const { admin, requesterProfile } = context;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Usuario nao informado.", 400);
    if (!isUuid(id)) return jsonError("Usuario invalido.", 400);
    if (id === requesterProfile.id) return NextResponse.json({ error: "Voce nao pode excluir seu proprio usuario." }, { status: 400 });

    const { data: targetProfile, error: targetError } = await admin.from("profiles").select("id, role").eq("id", id).single();
    if (targetError || !targetProfile) return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    if (targetProfile?.role === "owner") {
      return NextResponse.json({ error: "Usuario Administrador do Sistema nao pode ser excluido." }, { status: 403 });
    }
    if (requesterProfile.role === "manager") {
      if (targetProfile.role !== "employee") {
        return NextResponse.json({ error: "Gestor so pode excluir funcionarios." }, { status: 403 });
      }
      const sharedCompany = await userSharesManagedCompany(admin, requesterProfile.id, targetProfile.id);
      if (sharedCompany.error) return NextResponse.json({ error: sharedCompany.error }, { status: 400 });
      if (!sharedCompany.ok) {
        return NextResponse.json({ error: "Gestor so pode excluir funcionarios vinculados as suas empresas." }, { status: 403 });
      }
    }

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
