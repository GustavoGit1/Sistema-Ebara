"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Building2,
  Calculator,
  Download,
  Eye,
  FileText,
  LogOut,
  Package,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  Users,
  WalletCards
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  ROLE_OPTIONS,
  ROLES,
  canCreateProduct,
  canDeleteHistory,
  canDeleteProducts,
  canEditCompany,
  canEditProductCompany,
  canManageCompanies,
  canManageUsers,
  canSeeProfit,
  canSeePurchasePrice,
  canViewCompanies,
  canViewEmployees,
  roleLabel
} from "@/lib/permissions";

const emptyCompany = { name: "", address: "", phone: "", notes: "", user_ids: [] };
const emptyProduct = { name: "", sale_price: "", purchase_price: "", quantity: "", company_id: "", image_url: "", stock_position: "", active: true };
const PAYMENT_STATUS_OPTIONS = [
  { value: "paid", label: "Pago" },
  { value: "partial", label: "Pago parcialmente" },
  { value: "unpaid", label: "Não Pago" }
];
const PRODUCT_IMAGE_BUCKET = "product-images";
const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
const PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PRODUCT_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const emptySale = { product_id: "", company_id: "", quantity: "", sale_price: "", seller_id: "", buyer_name: "", payment_status: "" };
const emptyUndeliveredProduct = { product_name: "", company_id: "", location: "", seller_name: "", sale_price: "", payment_status: "unpaid" };
const emptyUser = { username: "", password: "", full_name: "", role: ROLES.EMPLOYEE, company_id: "", company_ids: [], active: true };
const DEMO_STORAGE_KEY = "estoque-demo-state";

const DEMO_USERS = [
  { username: "Master", password: "Mariah2102#", role: ROLES.OWNER, company: "empresa1", id: "demo-master", full_name: "Master", active: true },
  { username: "Chefe", password: "123456", role: ROLES.MANAGER, company: "empresa1", id: "demo-chefe", full_name: "Chefe", active: true },
  { username: "Funcionário", password: "123456", role: ROLES.EMPLOYEE, company: "empresa1", id: "demo-funcionario", full_name: "Funcionário", active: true }
];

function createInitialDemoState() {
  return {
    companies: [
      {
        id: "demo-empresa1",
        owner_id: "demo-master",
        name: "empresa1",
        address: "Loja demo",
        phone: "",
        notes: "",
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    users: DEMO_USERS.map((user) => ({ ...user, company_id: "demo-empresa1", username: user.username })),
    user_companies: DEMO_USERS.map((user) => ({
      id: `demo-link-${user.id}`,
      user_id: user.id,
      company_id: "demo-empresa1",
      permission_role: user.role,
      created_at: new Date().toISOString()
    })),
    products: [],
    sales: [],
    undelivered_products: []
  };
}

function readDemoState() {
  if (typeof window === "undefined") return createInitialDemoState();
  const initialState = createInitialDemoState();
  const saved = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (!saved) {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(initialState));
    return initialState;
  }
  let parsed;
  try {
    parsed = JSON.parse(saved);
  } catch {
    parsed = {};
  }

  const customUsers = (parsed.users || []).filter((user) => !DEMO_USERS.some((defaultUser) => defaultUser.id === user.id));
  const customCompanies = (parsed.companies || []).filter((company) => company.id !== "demo-empresa1");
  const customLinks = (parsed.user_companies || []).filter((link) => !DEMO_USERS.some((defaultUser) => defaultUser.id === link.user_id));
  const migratedState = {
    ...initialState,
    ...parsed,
    companies: [...initialState.companies, ...customCompanies],
    users: [...initialState.users, ...customUsers],
    user_companies: [...initialState.user_companies, ...customLinks],
    products: parsed.products || [],
    sales: parsed.sales || [],
    undelivered_products: parsed.undelivered_products || []
  };
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(migratedState));
  return migratedState;
}

function writeDemoState(nextState) {
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(nextState));
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function roundToTwo(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function money(value) {
  return roundToTwo(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(rows, fileName) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(csvCell).join(";"),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(";"))
  ].join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalize(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function companyName(companies, companyId) {
  return companies.find((company) => company.id === companyId)?.name || "-";
}

function paymentStatusLabel(status) {
  return PAYMENT_STATUS_OPTIONS.find((option) => option.value === status)?.label || "Não Pago";
}

function saleTotal(sale) {
  return Number(sale.sale_price || 0) * Number(sale.quantity || 0);
}

function hasOutstandingPayment(status) {
  return (status || "unpaid") !== "paid";
}

function unpaidSalesForBuyer(sales, buyerName) {
  const normalizedBuyerName = normalize(buyerName);
  if (!normalizedBuyerName) return [];
  return sales.filter((sale) => hasOutstandingPayment(sale.payment_status) && normalize(sale.buyer_name) === normalizedBuyerName);
}

function validateProductImage(file) {
  if (!file) return "";
  const extension = String(file.name || "").split(".").pop()?.toLowerCase();
  if (!PRODUCT_IMAGE_TYPES.has(file.type) || !PRODUCT_IMAGE_EXTENSIONS.has(extension)) {
    return "Selecione uma imagem válida em JPG, PNG ou WEBP com até 5 MB.";
  }
  if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
    return "Selecione uma imagem válida em JPG, PNG ou WEBP com até 5 MB.";
  }
  return "";
}

function productImageStoragePath(value) {
  const text = String(value || "");
  if (!text || text.startsWith("http://") || text.startsWith("https://") || text.startsWith("blob:") || text.startsWith("data:")) return "";
  return text;
}

function productImageExtension(file) {
  const extension = String(file.name || "").split(".").pop()?.toLowerCase();
  if (extension === "jpeg") return "jpg";
  return PRODUCT_IMAGE_EXTENSIONS.has(extension) ? extension : file.type.split("/").pop() || "jpg";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível preparar a imagem para o modo local."));
    reader.readAsDataURL(file);
  });
}

function receiptNumberFromSales(sales) {
  const maxNumber = (sales || []).reduce((max, sale) => {
    const match = String(sale.receipt_number || "").match(/^REC-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `REC-${String(maxNumber + 1).padStart(6, "0")}`;
}

function receiptFileName(sale) {
  return `recibo-${sale.receipt_number || sale.id || "venda"}.pdf`;
}

function pdfEscape(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildReceiptPdf(sale) {
  const total = Number(sale.sale_price || 0) * Number(sale.quantity || 0);
  const lines = [
    ["Recibo", sale.receipt_number || "-"],
    ["Empresa", sale.company_name || "-"],
    ["Endereco", sale.company_address || "-"],
    ["Data", sale.created_at ? new Date(sale.created_at).toLocaleString("pt-BR") : "-"],
    ["Comprador", sale.buyer_name || "-"],
    ["Pagamento", paymentStatusLabel(sale.payment_status)],
    ["Vendedor", sale.seller_name || "-"],
    ["Produto", sale.product_name || "-"],
    ["Quantidade", sale.quantity || "-"],
    ["Valor unitario", money(sale.sale_price || 0)],
    ["Valor total", money(total)],
    ["Registrado por", sale.receipt_created_by_name || sale.created_by_name || "-"]
  ];
  const content = [
    "BT",
    "/F1 20 Tf",
    "72 770 Td",
    "(Recibo de Venda) Tj",
    "/F1 11 Tf",
    "0 -32 Td",
    ...lines.flatMap(([label, value]) => [`(${pdfEscape(`${label}: ${value}`)}) Tj`, "0 -20 Td"]),
    "0 -16 Td",
    "(Obrigado pela preferencia!) Tj",
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array([...pdf].map((char) => char.charCodeAt(0) & 255));
}

function downloadReceiptPdf(sale) {
  const blob = new Blob([buildReceiptPdf(sale)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = receiptFileName(sale);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function requireOk(condition, message, setMessage) {
  if (condition) return true;
  setMessage(message);
  return false;
}

function linkedCompanyIdsFor(user, links) {
  return [...new Set([
    user?.company_id,
    ...(links || []).filter((link) => link.user_id === user?.id).map((link) => link.company_id)
  ].filter(Boolean))];
}

function saleProfit(sale) {
  const totalSale = saleTotal(sale);
  if (sale.stock_exceeded) return -totalSale;
  return (Number(sale.sale_price || 0) - Number(sale.purchase_price_snapshot || 0)) * Number(sale.quantity || 0);
}

function uniqueSuggestions(values) {
  const seen = new Set();
  return values.reduce((items, value) => {
    const label = String(value || "").trim();
    const key = normalize(label);
    if (!label || seen.has(key)) return items;
    seen.add(key);
    return [...items, label];
  }, []);
}

export default function StockApp() {
  const [screen, setScreen] = useState("home");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [userCompanies, setUserCompanies] = useState([]);
  const [activeCompanyId, setActiveCompanyId] = useState("");
  const [products, setProducts] = useState([]);
  const [productImageUrls, setProductImageUrls] = useState({});
  const [productImageErrors, setProductImageErrors] = useState({});
  const [sales, setSales] = useState([]);
  const [undeliveredProducts, setUndeliveredProducts] = useState([]);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    day: "",
    month: "",
    hour: "",
    year: String(new Date().getFullYear()),
    company_id: "",
    seller_name: "",
    buyer_name: "",
    product_name: "",
    payment_status: ""
  });

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#login") {
      setScreen("login");
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) boot(data.session);
    });
  }, []);

  function openLogin() {
    setMessage("");
    setScreen("login");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "#login");
    }
  }

  function openHome() {
    setMessage("");
    setScreen("home");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  useEffect(() => {
    if (demoMode) {
      setProductImageUrls({});
      setProductImageErrors({});
      return;
    }

    const paths = [...new Set(products.map((product) => productImageStoragePath(product.image_url)).filter(Boolean))];
    if (!paths.length) {
      setProductImageUrls({});
      setProductImageErrors({});
      return;
    }

    let cancelled = false;
    Promise.all(
      paths.map(async (path) => {
        const { data, error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).createSignedUrl(path, 60 * 60);
        return { path, url: error ? "" : data?.signedUrl || "", error: Boolean(error) };
      })
    ).then((entries) => {
      if (cancelled) return;
      setProductImageUrls(Object.fromEntries(entries.filter((entry) => entry.url).map((entry) => [entry.path, entry.url])));
      setProductImageErrors(Object.fromEntries(entries.filter((entry) => entry.error).map((entry) => [entry.path, true])));
    });

    return () => {
      cancelled = true;
    };
  }, [products, demoMode]);

  async function boot(currentSession, preferredCompanyId = "") {
    setLoading(true);
    setMessage("");
    setSession(currentSession);
    const userId = currentSession.user.id;
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profileData || profileData.active === false) {
      setMessage("Perfil não encontrado ou usuário inativo.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    setProfile(profileData);
    await loadData(profileData, preferredCompanyId || profileData.company_id || "");
    setScreen("dashboard");
    setLoading(false);
  }

  async function loadData(currentProfile = profile, preferredCompanyId = "") {
    if (demoMode || currentProfile?.id?.startsWith("demo-")) {
      loadDemoData(currentProfile, preferredCompanyId);
      return;
    }
    if (!currentProfile) return;

    const [companiesResult, productsResult, salesResult, usersResult, userCompaniesResult, undeliveredProductsResult] = await Promise.all([
      supabase.from("companies").select("*").order("name"),
      supabase.from("app_products").select("*").order("name"),
      supabase.from("app_sales").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, username, full_name, role, company_id, active, created_at").order("full_name"),
      supabase.from("user_companies").select("*"),
      supabase.from("app_undelivered_products").select("*").order("created_at", { ascending: false })
    ]);

    if (companiesResult.error || productsResult.error || salesResult.error) {
      console.error("Erro ao carregar dados:", {
        companies: companiesResult.error,
        products: productsResult.error,
        sales: salesResult.error
      });
      setMessage("Não foi possível carregar os dados. Verifique o schema e as políticas RLS.");
      return;
    }

    const loadedCompanies = companiesResult.data || [];
    const loadedLinks = userCompaniesResult.error ? [] : (userCompaniesResult.data || []);
    const accessibleCompanyIds = currentProfile.role === ROLES.OWNER
      ? loadedCompanies.map((company) => company.id)
      : linkedCompanyIdsFor(currentProfile, loadedLinks);
    const firstAccessibleCompanyId = loadedCompanies.find((company) => accessibleCompanyIds.includes(company.id) && company.active !== false)?.id || "";
    const nextCompanyId = currentProfile.role === ROLES.OWNER
      ? (preferredCompanyId || firstAccessibleCompanyId || loadedCompanies[0]?.id || "")
      : (accessibleCompanyIds.includes(preferredCompanyId) ? preferredCompanyId : firstAccessibleCompanyId);

    setCompanies(loadedCompanies);
    setProducts(productsResult.data || []);
    setSales(salesResult.data || []);
    setUndeliveredProducts(undeliveredProductsResult.error ? [] : (undeliveredProductsResult.data || []));
    setUserCompanies(loadedLinks);
    setUsers(usersResult.error ? [currentProfile] : (usersResult.data || []));
    setActiveCompanyId((current) => {
      if (nextCompanyId) return nextCompanyId;
      if (currentProfile.role === ROLES.OWNER) return current || loadedCompanies[0]?.id || "";
      return "";
    });
  }

  async function handleLogin(form) {
    setLoading(true);
    setMessage("");
    const state = readDemoState();
    const demoUser = state.users.find((user) => normalize(user.username) === normalize(form.username));
    if (demoUser) {
      const company = state.companies.find((item) => normalize(item.name) === normalize(form.company));
      const hasAccess = (state.user_companies || []).some((link) => link.user_id === demoUser.id && link.company_id === company?.id);
      if (!company || !hasAccess) {
        setMessage("Empresa incorreta ou usuário sem acesso a esta empresa");
        setLoading(false);
        return;
      }
      if (company.active === false) {
        setMessage("Empresa inativa");
        setLoading(false);
        return;
      }
      if (demoUser.active === false) {
        setMessage("Usuário inativo");
        setLoading(false);
        return;
      }
      if (demoUser.password !== form.password) {
        setMessage("Usuário ou senha incorretos");
        setLoading(false);
        return;
      }

      const demoProfile = { ...demoUser, company_id: company.id };
      setDemoMode(true);
      setSession({ user: { id: demoUser.id, email: demoUser.username }, access_token: "demo-local" });
      setProfile(demoProfile);
      loadDemoData(demoProfile, company.id);
      setScreen("dashboard");
      setLoading(false);
      return;
    }

    let response;
    let result;
    try {
      response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      result = await response.json();
    } catch (error) {
      console.error("Erro ao chamar API de login:", error);
      setMessage("Não foi possível realizar o login agora.");
      setLoading(false);
      return;
    }
    if (!response.ok) {
      setMessage(result.error || "Usuário ou senha incorretos");
      setLoading(false);
      return;
    }
    await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token
    });
    await boot(result.session, result.company_id);
  }

  async function logout() {
    if (!demoMode) await supabase.auth.signOut();
    setDemoMode(false);
    setSession(null);
    setProfile(null);
    setCompanies([]);
    setUsers([]);
    setUserCompanies([]);
    setProducts([]);
    setSales([]);
    setUndeliveredProducts([]);
    setActiveCompanyId("");
    setScreen("home");
  }

  function loadDemoData(currentProfile = profile, preferredCompanyId = "") {
    const state = readDemoState();
    const productsWithCompany = state.products.map((product) => ({
      ...product,
      company_name: state.companies.find((company) => company.id === product.company_id)?.name || "-"
    }));
    const salesWithNames = state.sales.map((sale) => ({
      ...sale,
      product_name: sale.product_name || state.products.find((product) => product.id === sale.product_id)?.name || "-",
      company_name: sale.company_name || state.companies.find((company) => company.id === sale.company_id)?.name || "-",
      company_address: sale.company_address || state.companies.find((company) => company.id === sale.company_id)?.address || "",
      seller_name: sale.seller_name || state.users.find((user) => user.id === sale.seller_id)?.full_name || "-",
      receipt_created_by_name: sale.receipt_created_by_name || state.users.find((user) => user.id === sale.receipt_created_by)?.full_name || state.users.find((user) => user.id === sale.sold_by)?.full_name || "-"
    }));

    const accessibleCompanyIds = currentProfile?.role === ROLES.OWNER
      ? state.companies.map((company) => company.id)
      : linkedCompanyIdsFor(currentProfile, state.user_companies || []);
    const firstAccessibleCompanyId = state.companies.find((company) => accessibleCompanyIds.includes(company.id) && company.active !== false)?.id || "";

    setCompanies(state.companies);
    setUsers(state.users);
    setUserCompanies(state.user_companies || []);
    setProducts(productsWithCompany);
    setSales(salesWithNames);
    setUndeliveredProducts((state.undelivered_products || []).map((item) => ({
      ...item,
      company_name: item.company_name || state.companies.find((company) => company.id === item.company_id)?.name || "-",
      created_by_name: item.created_by_name || state.users.find((user) => user.id === item.created_by)?.full_name || "-"
    })));
    setActiveCompanyId(
      accessibleCompanyIds.includes(preferredCompanyId)
        ? preferredCompanyId
        : firstAccessibleCompanyId
    );
  }

  async function saveCompany(form) {
    setMessage("");
    if (!canEditCompany(profile?.role)) return;
    if (!canManageCompanies(profile?.role) && !form.id) {
      setMessage("Gestor não pode criar nova empresa.");
      return;
    }
    if (!canManageCompanies(profile?.role) && !currentUserCompanyIds.includes(form.id)) {
      setMessage("Gestor só pode editar empresas vinculadas.");
      return;
    }
    if (!requireOk(form.name.trim(), "Informe o nome da empresa.", setMessage)) return;
    setSaving(true);
    try {
      if (demoMode) {
        const state = readDemoState();
        const now = new Date().toISOString();
        const { user_ids: selectedUserIds = [], ...companyForm } = form;
        const previousCompany = state.companies.find((item) => item.id === form.id);
        const company = canManageCompanies(profile?.role)
          ? { id: form.id || id("demo-company"), owner_id: profile.id, ...companyForm, name: form.name.trim(), active: form.active !== false, updated_at: now, created_at: form.created_at || now }
          : { ...previousCompany, name: form.name.trim(), address: form.address || "", phone: form.phone || "", notes: form.notes || "", updated_at: now };
        const companiesNext = form.id ? state.companies.map((item) => item.id === form.id ? company : item) : [...state.companies, company];
        if (!canManageCompanies(profile?.role)) {
          writeDemoState({ ...state, companies: companiesNext });
          loadDemoData(profile, company.id);
          setModal({ type: "companies" });
          setMessage("Empresa salva com sucesso.");
          return;
        }
        const keptLinks = (state.user_companies || []).filter((link) => link.company_id !== company.id);
        const nextLinks = selectedUserIds.map((userId) => {
          const user = state.users.find((item) => item.id === userId);
          return {
            id: id("demo-user-company"),
            user_id: userId,
            company_id: company.id,
            permission_role: user?.role || ROLES.EMPLOYEE,
            created_at: now
          };
        });
        writeDemoState({ ...state, companies: companiesNext, user_companies: [...keptLinks, ...nextLinks] });
        loadDemoData(profile, company.id);
        setModal({ type: "companies" });
        setMessage("Empresa salva com sucesso.");
        return;
      }
      const payload = {
        name: form.name.trim(),
        address: form.address || null,
        phone: form.phone || null,
        notes: form.notes || null
      };
      if (canManageCompanies(profile?.role)) {
        payload.active = form.active !== false;
        payload.owner_id = form.owner_id || profile.id;
      }
      const queryBuilder = form.id
        ? supabase.from("companies").update(payload).eq("id", form.id).select("id").single()
        : supabase.from("companies").insert(payload).select("id").single();
      const { data: savedCompany, error } = await queryBuilder;
      if (error) {
        console.error("Erro ao salvar empresa:", error);
        setMessage(error.message);
      } else {
        const companyId = savedCompany?.id || form.id;
        if (!canManageCompanies(profile?.role)) {
          await loadData(profile, companyId);
          setModal({ type: "companies" });
          setMessage("Empresa salva com sucesso.");
          return;
        }
        const selectedUserIds = Array.isArray(form.user_ids) ? form.user_ids : [];
        const { error: deleteLinksError } = await supabase.from("user_companies").delete().eq("company_id", companyId);
        if (deleteLinksError) {
          setMessage(deleteLinksError.message);
          return;
        }
        if (selectedUserIds.length) {
          const links = selectedUserIds.map((userId) => {
            const user = users.find((item) => item.id === userId);
            return {
              user_id: userId,
              company_id: companyId,
              permission_role: user?.role || ROLES.EMPLOYEE
            };
          });
          const { error: insertLinksError } = await supabase.from("user_companies").upsert(links, { onConflict: "user_id,company_id" });
          if (insertLinksError) {
            setMessage(insertLinksError.message);
            return;
          }
        }
        await loadData();
        setModal({ type: "companies" });
        setMessage("Empresa salva com sucesso.");
      }
    } catch (error) {
      setMessage(error.message || "Não foi possível salvar a empresa.");
    } finally {
      setSaving(false);
    }
  }
  async function deleteCompany(companyId) {
    if (!canManageCompanies(profile?.role)) return;
    setMessage("");
    if (demoMode) {
      const state = readDemoState();
      writeDemoState({ ...state, companies: state.companies.filter((item) => item.id !== companyId) });
      loadDemoData(profile);
      return;
    }
    const { error } = await supabase.from("companies").delete().eq("id", companyId);
    if (error) setMessage(error.message);
    else await loadData();
  }

  function productImageSrc(product) {
    if (!product?.image_url) return "";
    const path = productImageStoragePath(product.image_url);
    return path ? productImageUrls[path] || "" : product.image_url;
  }

  function productImageHasError(product) {
    const path = productImageStoragePath(product?.image_url);
    return Boolean(path && productImageErrors[path]);
  }

  async function uploadProductImage(file, companyId, productId) {
    const validationError = validateProductImage(file);
    if (validationError) throw new Error(validationError);

    const baseName = String(file.name || "imagem").replace(/\.[^.]+$/, "");
    const safeName = baseName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);
    const path = `${companyId}/${productId}/${Date.now()}-${safeName}.${productImageExtension(file)}`;
    const { error } = await supabase.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
      });

    if (error) throw new Error("Não foi possível enviar a imagem. Verifique o Storage, permissões e tente novamente.");
    return path;
  }

  async function removeProductImageByPath(value) {
    const path = productImageStoragePath(value);
    if (!path) return;
    await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
  }

  async function saveProduct(form) {
    setMessage("");
    const payload = {
      name: String(form.name || "").trim(),
      sale_price: Number(form.sale_price),
      quantity: Number(form.quantity),
      company_id: form.company_id || activeCompanyId,
      stock_position: String(form.stock_position || "").trim()
    };
    if (form.image_removed && !form.image_file) payload.image_url = null;
    if (canSeePurchasePrice(profile.role)) payload.purchase_price = form.purchase_price !== "" && form.purchase_price !== undefined ? Number(form.purchase_price) : null;
    if (canDeleteProducts(profile.role)) payload.active = form.active !== false;
    if (!requireOk(payload.name && payload.company_id && !Number.isNaN(payload.sale_price) && !Number.isNaN(payload.quantity), "Preencha nome, loja, preço de venda e quantidade.", setMessage)) return;
    if (payload.quantity < 0 || payload.sale_price < 0 || (payload.purchase_price !== undefined && payload.purchase_price !== null && payload.purchase_price < 0)) {
      setMessage("Quantidade e preços não podem ser negativos.");
      return;
    }
    if (payload.purchase_price !== undefined && payload.purchase_price !== null && Number.isNaN(payload.purchase_price)) {
      setMessage("Informe um preço de custo válido.");
      return;
    }
    const imageValidationError = validateProductImage(form.image_file);
    if (imageValidationError) {
      setMessage(imageValidationError);
      return;
    }
    if (!canEditProductCompany(profile.role) && form.id && products.find((item) => item.id === form.id)?.company_id !== payload.company_id) {
      setMessage("Você não tem permissão para alterar a empresa do produto.");
      return;
    }
    setSaving(true);
    try {
      if (demoMode) {
        const state = readDemoState();
        const company = state.companies.find((item) => item.id === payload.company_id);
        if (!company || company.active === false) {
          setMessage("Loja inválida ou inativa.");
          return;
        }
        const now = new Date().toISOString();
        if (form.image_file) payload.image_url = await fileToDataUrl(form.image_file);
        const { image_file, image_preview_url, image_removed, ...productForm } = form;
        const product = { ...productForm, id: form.id || id("demo-product"), ...payload, active: canDeleteProducts(profile.role) ? payload.active : form.active !== false, company_name: company.name, created_by: profile.id, created_at: form.created_at || now, updated_at: now };
        const productsNext = form.id ? state.products.map((item) => item.id === form.id ? product : item) : [...state.products, product];
        writeDemoState({ ...state, products: productsNext });
        loadDemoData(profile, payload.company_id);
        setModal({ type: "products" });
        setMessage("Produto salvo com sucesso.");
        return;
      }
      const previousImage = products.find((item) => item.id === form.id)?.image_url || form.image_url;
      const queryBuilder = form.id
        ? supabase.from("products").update(payload).eq("id", form.id).select("id, image_url").single()
        : supabase.from("products").insert(payload).select("id, image_url").single();
      const { data: savedProduct, error } = await queryBuilder;
      if (error) {
        console.error("Erro ao salvar produto:", error);
        setMessage(error.message);
      } else {
        if (form.image_file) {
          const imagePath = await uploadProductImage(form.image_file, payload.company_id, savedProduct.id);
          const { data: imageSavedProduct, error: imageUpdateError } = await supabase
            .from("products")
            .update({ image_url: imagePath })
            .eq("id", savedProduct.id)
            .select("id, image_url")
            .single();
          if (imageUpdateError || imageSavedProduct?.image_url !== imagePath) {
            await removeProductImageByPath(imagePath);
            throw new Error("A imagem foi enviada, mas não foi vinculada ao produto. Verifique as permissões da tabela products.");
          }
          await removeProductImageByPath(previousImage);
        } else if (form.image_removed) {
          await removeProductImageByPath(previousImage);
        }
        await loadData();
        setModal({ type: "products" });
        setMessage("Produto salvo com sucesso.");
      }
    } catch (error) {
      setMessage(error.message || "Não foi possível salvar a imagem do produto.");
    } finally {
      setSaving(false);
    }
  }
  async function deleteProduct(productId) {
    if (!canDeleteProducts(profile?.role)) return;
    setMessage("");
    if (!window.confirm("Tem certeza que deseja excluir este produto?")) return;
    if (demoMode) {
      const state = readDemoState();
      writeDemoState({ ...state, products: state.products.map((item) => item.id === productId ? { ...item, active: false } : item) });
      loadDemoData(profile);
      setMessage("Produto removido da listagem.");
      return;
    }
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) {
      const { error: inactiveError } = await supabase.from("products").update({ active: false }).eq("id", productId);
      if (inactiveError) {
        console.error("Erro ao excluir produto:", inactiveError);
        setMessage(inactiveError.message);
      } else {
        await loadData();
        setMessage("Produto inativado e removido da listagem.");
      }
    } else {
      await loadData();
      setMessage("Produto excluído com sucesso.");
    }
  }

  async function adjustProduct(product, kind, mode, rawValue) {
    const current = Number(product[kind] || 0);
    const value = mode === "increase" ? current + 1 : mode === "decrease" ? Math.max(0, current - 1) : Number(String(rawValue).replace(",", "."));
    if (Number.isNaN(value) || value < 0) {
      setMessage("Informe um valor válido.");
      return;
    }
    const nextProduct = { ...product };
    if (kind === "quantity") nextProduct.quantity = Math.floor(value);
    if (kind === "sale_price") nextProduct.sale_price = value;
    if (kind === "purchase_price") nextProduct.purchase_price = value;
    await saveProduct(nextProduct);
  }
  async function saveSale(form) {
    setMessage("");
    const product = products.find((item) => item.id === form.product_id);
    const seller = profile?.role === ROLES.EMPLOYEE
      ? profile
      : users.find((item) => item.id === form.seller_id);
    const quantity = Number(form.quantity);
    const buyerName = String(form.buyer_name || "").trim();
    const paymentStatus = PAYMENT_STATUS_OPTIONS.some((option) => option.value === form.payment_status) ? form.payment_status : "";
    if (!product || !form.company_id || !quantity || !form.sale_price || !seller) {
      setMessage("Preencha produto, loja, quantidade, preço real de venda e vendedor cadastrado.");
      return;
    }
    if (!buyerName) {
      setMessage("Informe o comprador da venda.");
      return;
    }
    if (!paymentStatus) {
      setMessage("Selecione o status de pagamento.");
      return;
    }
    if (product.active === false) {
      setMessage("Produto inativo não pode ser vendido.");
      return;
    }

    if (demoMode) {
      const state = readDemoState();
      const company = state.companies.find((item) => item.id === form.company_id);
      const now = new Date().toISOString();
      const exceedsStock = Boolean(form.stock_exceeded);
      const purchasePrice = exceedsStock ? Number(form.sale_price || 0) * 2 : Number(product.purchase_price || 0);
      const receiptNumber = receiptNumberFromSales(state.sales);
      const sale = {
        id: id("demo-sale"),
        product_id: product.id,
        product_name: product.name,
        company_id: form.company_id,
        company_name: company?.name || "",
        company_address: company?.address || "",
        quantity,
        sale_price: Number(form.sale_price),
        purchase_price_snapshot: purchasePrice,
        seller_id: seller.id,
        seller_name: seller.full_name || seller.username,
        buyer_name: buyerName,
        payment_status: paymentStatus,
        stock_exceeded: exceedsStock,
        sold_by: profile.id,
        receipt_id: id("demo-receipt"),
        receipt_number: receiptNumber,
        receipt_created_at: now,
        receipt_created_by: profile.id,
        receipt_created_by_name: profile.full_name || profile.username,
        created_at: now,
        sold_at: now
      };
      const nextProducts = state.products.map((item) => item.id === product.id ? { ...item, quantity: Number(item.quantity) - quantity } : item);
      writeDemoState({ ...state, products: nextProducts, sales: [sale, ...state.sales] });
      loadDemoData(profile, form.company_id);
      setModal({ type: "receiptPrompt", sale });
      return;
    }

    const { data: insertedSale, error: saleError } = await supabase.from("sales").insert({
      product_id: product.id,
      company_id: form.company_id,
      quantity,
      sale_price: Number(form.sale_price),
      seller_id: seller.id,
      seller_name: seller.full_name || seller.username,
      buyer_name: buyerName,
      payment_status: paymentStatus,
      stock_exceeded: Boolean(form.stock_exceeded)
    }).select("id").single();
    if (saleError) {
      setMessage(saleError.message);
      return;
    }
    await loadData();
    const { data: saleWithReceipt } = await supabase
      .from("app_sales")
      .select("*")
      .eq("id", insertedSale.id)
      .single();
    setModal({ type: "receiptPrompt", sale: saleWithReceipt || insertedSale });
  }

  async function updateSalePayment(sale, payment_status) {
    if (!PAYMENT_STATUS_OPTIONS.some((option) => option.value === payment_status)) {
      setMessage("Selecione um status de pagamento válido.");
      return;
    }
    setMessage("");
    if (demoMode) {
      const state = readDemoState();
      writeDemoState({
        ...state,
        sales: state.sales.map((item) => item.id === sale.id ? { ...item, payment_status } : item)
      });
      loadDemoData(profile, activeCompanyId);
      setMessage("Status de pagamento atualizado.");
      return;
    }
    const { error } = await supabase
      .from("sales")
      .update({ payment_status })
      .eq("id", sale.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadData();
    setMessage("Status de pagamento atualizado.");
  }


  async function deleteSale(sale, returnTo = modal?.type || "sales") {
    if (!canDeleteHistory(profile?.role)) return;
    setMessage("");
    if (!window.confirm("Tem certeza que deseja apagar esta venda do histórico? O estoque será ajustado de volta.")) return;

    if (demoMode) {
      const state = readDemoState();
      writeDemoState({
        ...state,
        products: state.products.map((product) => product.id === sale.product_id ? { ...product, quantity: Number(product.quantity || 0) + Number(sale.quantity || 0) } : product),
        sales: state.sales.filter((item) => item.id !== sale.id)
      });
      loadDemoData(profile, activeCompanyId);
      setModal(returnTo ? { type: returnTo } : null);
      setMessage("Venda apagada do histórico e estoque ajustado.");
      return;
    }

    const { error: deleteError } = await supabase.from("sales").delete().eq("id", sale.id);
    if (deleteError) {
      setMessage(deleteError.message);
      return;
    }

    const product = products.find((item) => item.id === sale.product_id);
    if (product) {
      const { error: stockError } = await supabase
        .from("products")
        .update({ quantity: Number(product.quantity || 0) + Number(sale.quantity || 0) })
        .eq("id", sale.product_id);
      if (stockError) setMessage(`Venda apagada, mas não foi possível ajustar o estoque: ${stockError.message}`);
      else setMessage("Venda apagada do histórico e estoque ajustado.");
    } else {
      setMessage("Venda apagada do histórico.");
    }

    await loadData();
    setModal(returnTo ? { type: returnTo } : null);
  }

  async function deleteUndeliveredProduct(item) {
    if (!canDeleteHistory(profile?.role)) return;
    setMessage("");
    if (!window.confirm("Tem certeza que deseja apagar este item de produtos não entregues?")) return;

    if (demoMode) {
      const state = readDemoState();
      writeDemoState({
        ...state,
        undelivered_products: (state.undelivered_products || []).filter((entry) => entry.id !== item.id)
      });
      loadDemoData(profile, activeCompanyId);
      setModal({ type: "undeliveredProducts" });
      setMessage("Item apagado de produtos não entregues.");
      return;
    }

    const { error } = await supabase.from("undelivered_products").delete().eq("id", item.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadData();
    setModal({ type: "undeliveredProducts" });
    setMessage("Item apagado de produtos não entregues.");
  }
  async function saveUndeliveredProduct(form) {

    const paymentStatus = PAYMENT_STATUS_OPTIONS.some((option) => option.value === form.payment_status) ? form.payment_status : "unpaid";
    const payload = {
      product_name: String(form.product_name || "").trim(),
      company_id: form.company_id || activeCompanyId || profile?.company_id || "",
      location: String(form.location || "").trim(),
      seller_name: String(form.seller_name || "").trim() || profile?.full_name || profile?.username || "",
      sale_price: Number(form.sale_price || 0),
      payment_status: paymentStatus,
      created_by: profile?.id
    };

    if (!payload.product_name || !payload.company_id || !payload.location || !payload.seller_name || Number.isNaN(payload.sale_price)) {
      setMessage("Preencha produto, localização, vendedor e valor da venda.");
      return;
    }
    if (payload.sale_price < 0) {
      setMessage("Valor da venda não pode ser negativo.");
      return;
    }

    setSaving(true);
    setMessage("");
    if (demoMode) {
      const state = readDemoState();
      const company = state.companies.find((item) => item.id === payload.company_id);
      const now = new Date().toISOString();
      const item = {
        ...payload,
        id: id("demo-undelivered"),
        company_name: company?.name || "",
        created_by_name: profile?.full_name || profile?.username || "",
        created_at: now
      };
      writeDemoState({ ...state, undelivered_products: [item, ...(state.undelivered_products || [])] });
      loadDemoData(profile, activeCompanyId);
      setSaving(false);
      setModal({ type: "undeliveredProducts" });
      setMessage("Produto não entregue cadastrado.");
      return;
    }

    const { error } = await supabase.from("undelivered_products").insert(payload);
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadData();
    setModal({ type: "undeliveredProducts" });
    setMessage("Produto não entregue cadastrado.");
  }

  async function ensureReceiptForSale(sale) {
    if (sale.receipt_number) return sale;
    if (demoMode) {
      const state = readDemoState();
      const now = new Date().toISOString();
      const receiptNumber = receiptNumberFromSales(state.sales);
      let nextSale = null;
      const nextSales = state.sales.map((item) => {
        if (item.id !== sale.id) return item;
        nextSale = {
          ...item,
          receipt_id: item.receipt_id || id("demo-receipt"),
          receipt_number: item.receipt_number || receiptNumber,
          receipt_created_at: item.receipt_created_at || now,
          receipt_created_by: item.receipt_created_by || profile.id,
          receipt_created_by_name: item.receipt_created_by_name || profile.full_name || profile.username
        };
        return nextSale;
      });
      if (!nextSale) return sale;
      writeDemoState({ ...state, sales: nextSales });
      loadDemoData(profile, activeCompanyId);
      return {
        ...sale,
        ...nextSale,
        company_address: sale.company_address || state.companies.find((company) => company.id === sale.company_id)?.address || ""
      };
    }

    const { error } = await supabase.rpc("ensure_sale_receipt", { target_sale_id: sale.id });
    if (error) {
      setMessage(error.message);
      return sale;
    }
    const { data, error: saleError } = await supabase
      .from("app_sales")
      .select("*")
      .eq("id", sale.id)
      .single();
    if (saleError) {
      setMessage(saleError.message);
      return sale;
    }
    await loadData();
    return data || sale;
  }

  async function openReceipt(sale, action = "view", returnTo = modal?.type || "sales") {
    setMessage("");
    const saleWithReceipt = await ensureReceiptForSale(sale);
    setModal({ type: "receipt", sale: saleWithReceipt, action, returnTo });
  }

  async function saveUser(form) {
    setMessage("");
    const normalizedForm = {
      ...form,
      full_name: String(form.full_name || "").trim(),
      username: String(form.full_name || "").trim(),
      company_ids: Array.isArray(form.company_ids) && form.company_ids.length ? form.company_ids : [form.company_id].filter(Boolean)
    };
    normalizedForm.company_id = normalizedForm.company_ids[0] || "";
    if (!requireOk(normalizedForm.full_name && normalizedForm.role && normalizedForm.company_id, "Informe nome, permissão e empresa.", setMessage)) return;
    if (!form.id && !requireOk(form.password, "Informe a senha.", setMessage)) return;
    setSaving(true);
    try {
      if (demoMode) {
        const state = readDemoState();
        const now = new Date().toISOString();
        const user = { id: form.id || id("demo-user"), ...normalizedForm, active: form.active !== false };
        const nextUsers = form.id ? state.users.map((item) => item.id === form.id ? user : item) : [...state.users, user];
        const keptLinks = (state.user_companies || []).filter((link) => link.user_id !== user.id);
        const userCompanyLinks = normalizedForm.company_ids.map((companyId) => ({
          id: id("demo-user-company"),
          user_id: user.id,
          company_id: companyId,
          permission_role: user.role,
          created_at: now
        }));
        writeDemoState({ ...state, users: nextUsers, user_companies: [...keptLinks, ...userCompanyLinks] });
        loadDemoData(profile);
        setModal({ type: "users" });
        setMessage("Usuário salvo com sucesso.");
        return;
      }
      const response = await fetch("/api/admin/create-user", {
        method: form.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(normalizedForm)
      });
      const result = await response.json();
      if (!response.ok) {
        console.error("Erro ao salvar usuário:", result);
        setMessage(result.error || "Não foi possível salvar usuário.");
        return;
      }
      await loadData();
      setModal({ type: "users" });
      setMessage("Usuário salvo com sucesso.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(user) {
    setMessage("");
    if (user.role === ROLES.OWNER) {
      setMessage("Usuário Administrador do Sistema não pode ser excluído.");
      return;
    }
    if (!window.confirm("Tem certeza que deseja excluir este usuário?")) return;
    if (demoMode) {
      const state = readDemoState();
      writeDemoState({
        ...state,
        users: state.users.filter((item) => item.id !== user.id),
        user_companies: (state.user_companies || []).filter((link) => link.user_id !== user.id)
      });
      loadDemoData(profile);
      return;
    }
    const response = await fetch(`/api/admin/create-user?id=${user.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.access_token}` }
    });
    const result = await response.json();
    if (!response.ok) setMessage(result.error || "Não foi possível excluir usuário.");
    else await loadData();
  }
  const activeCompany = companies.find((item) => item.id === activeCompanyId);
  const currentUserCompanyIds = useMemo(() => {
    if (profile?.role === ROLES.OWNER) return companies.map((company) => company.id);
    return linkedCompanyIdsFor(profile, userCompanies);
  }, [companies, profile, userCompanies]);
  const availableCompanies = useMemo(() => {
    if (profile?.role === ROLES.OWNER) return companies;
    return companies.filter((company) => currentUserCompanyIds.includes(company.id) && company.active !== false);
  }, [companies, profile?.role, currentUserCompanyIds]);
  const manageableProducts = useMemo(() => {
    if (profile?.role === ROLES.OWNER) return products;
    if (profile?.role === ROLES.MANAGER) return products.filter((product) => currentUserCompanyIds.includes(product.company_id));
    return [];
  }, [products, profile?.role, currentUserCompanyIds]);
  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      const matchName = normalize(product.name).includes(normalize(query));
      const matchCompany = activeCompanyId
        ? product.company_id === activeCompanyId
        : currentUserCompanyIds.includes(product.company_id);
      const matchActive = product.active !== false;
      return matchName && matchCompany && matchActive;
    });
  }, [products, query, activeCompanyId, currentUserCompanyIds]);
  const visibleSales = useMemo(() => {
    return sales.filter((sale) => {
      const matchCompany = activeCompanyId ? sale.company_id === activeCompanyId : currentUserCompanyIds.includes(sale.company_id);
      const matchEmployee = profile?.role !== ROLES.EMPLOYEE || sale.seller_id === profile?.id || sale.sold_by === profile?.id;
      return matchCompany && matchEmployee;
    });
  }, [sales, activeCompanyId, currentUserCompanyIds, profile?.id, profile?.role]);
  const visibleUndeliveredProducts = useMemo(() => {
    return undeliveredProducts.filter((item) => activeCompanyId ? item.company_id === activeCompanyId : currentUserCompanyIds.includes(item.company_id));
  }, [undeliveredProducts, activeCompanyId, currentUserCompanyIds]);
  const negativeStockProducts = useMemo(() => {
    return products.filter((item) => Number(item.quantity || 0) < 0 && (activeCompanyId ? item.company_id === activeCompanyId : currentUserCompanyIds.includes(item.company_id)));
  }, [products, activeCompanyId, currentUserCompanyIds]);
  const saleProducts = useMemo(() => {
    return products.filter((item) => item.active !== false && (activeCompanyId ? item.company_id === activeCompanyId : currentUserCompanyIds.includes(item.company_id)));
  }, [products, activeCompanyId, currentUserCompanyIds]);
  const historyProductOptions = useMemo(() => {
    return products.filter((item) => activeCompanyId ? item.company_id === activeCompanyId : currentUserCompanyIds.includes(item.company_id));
  }, [products, activeCompanyId, currentUserCompanyIds]);
  const usersWithSelectedCompanyAccess = useMemo(() => {
    return users.filter((user) => user.active !== false && (
      (!activeCompanyId && linkedCompanyIdsFor(user, userCompanies).some((companyId) => currentUserCompanyIds.includes(companyId)))
      || user.company_id === activeCompanyId
      || userCompanies.some((link) => link.user_id === user.id && link.company_id === activeCompanyId)
    ));
  }, [users, userCompanies, activeCompanyId, currentUserCompanyIds]);

  if (screen === "home") return <Landing onEnter={openLogin} />;
  if (screen === "login") return <Login onSubmit={handleLogin} loading={loading} message={message} onBack={openHome} />;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-neutral-400">Empresa atual</p>
            <h1 className="text-2xl font-semibold">{activeCompany?.name || "Total geral"}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-300">
              {profile?.role === ROLES.OWNER ? "Administrador do Sistema" : `${profile?.full_name || profile?.username || session?.user?.email} - ${roleLabel(profile?.role)}`}
            </span>
            <button onClick={logout} className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-black">
              <LogOut size={16} /> Sair
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-4 scrollbar-thin">
          {(profile?.role === ROLES.OWNER || profile?.role === ROLES.MANAGER) && (
            <button onClick={() => setActiveCompanyId("")} className={`rounded-md px-4 py-2 text-sm ${!activeCompanyId ? "bg-white text-black" : "bg-neutral-900 text-neutral-300"}`}>
              Todas as empresas
            </button>
          )}
          {availableCompanies.map((company) => (
            <button
              key={company.id}
              onClick={() => setActiveCompanyId(company.id)}
              className={`whitespace-nowrap rounded-md px-4 py-2 text-sm ${activeCompanyId === company.id ? "bg-white text-black" : "bg-neutral-900 text-neutral-300"}`}
            >
              {company.name}{company.active === false ? " (inativa)" : ""}
            </button>
          ))}
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6">
        {message && <div className="mb-4 rounded-md border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-200">{message}</div>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[ROLES.MANAGER, ROLES.EMPLOYEE].includes(profile?.role) && <ActionCard icon={Calculator} title="Calculadora" onClick={() => setModal({ type: "calculator" })} />}
          {canManageCompanies(profile?.role) && <ActionCard icon={Building2} title="Nova empresa" onClick={() => setModal({ type: "company" })} />}
          {canCreateProduct(profile?.role) && <ActionCard icon={Package} title="Novo produto" onClick={() => setModal({ type: "product" })} />}
          {canViewCompanies(profile?.role) && <ActionCard icon={Store} title="Empresas cadastradas" onClick={() => setModal({ type: "companies" })} />}
          <ActionCard icon={Eye} title="Produtos cadastrados" onClick={() => setModal({ type: "products" })} />
          <ActionCard icon={WalletCards} title="Compras pendentes" onClick={() => setModal({ type: "unpaidBalances" })} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-semibold">Produtos cadastrados</h2>
              <SearchBox value={query} onChange={setQuery} placeholder="Pesquisar produto" />
            </div>
            <ProductTable
              products={visibleProducts}
              role={profile?.role}
              companies={companies}
              imageSrc={productImageSrc}
              imageError={productImageHasError}
              onImageClick={(product, imageUrl) => setModal({ type: "image", product, imageUrl, returnTo: null })}
            />
          </section>

          <section className="grid gap-4">
            <button onClick={() => setModal({ type: "sale" })} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-white p-5 text-left text-black">
              <span>
                <span className="block text-lg font-semibold">Baixa/Venda de Produto</span>
                <span className="text-sm text-neutral-600">Registrar venda vinculada a vendedor</span>
              </span>
              <ShoppingCart />
            </button>
            <button onClick={() => setModal({ type: "sales" })} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-left">
              <span>
                <span className="block text-lg font-semibold">Produtos vendidos</span>
                <span className="text-sm text-neutral-400">Consultar histórico de vendas</span>
              </span>
              <ShoppingCart />
            </button>
            {canSeeProfit(profile?.role) && (
              <button onClick={() => setModal({ type: "profit" })} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-left">
                <span>
                  <span className="block text-lg font-semibold">Lucro</span>
                  <span className="text-sm text-neutral-400">Relatórios, filtros e exportação</span>
                </span>
                <WalletCards />
              </button>
            )}
            {canViewEmployees(profile?.role) && (
              <>
                {canManageUsers(profile?.role) && (
                  <button onClick={() => setModal({ type: "user" })} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-left">
                    <span>
                      <span className="block text-lg font-semibold">Cadastrar usuário</span>
                      <span className="text-sm text-neutral-400">Funcionário, Gestor ou Administrador</span>
                    </span>
                    <Users />
                  </button>
                )}
                <button onClick={() => setModal({ type: "users" })} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-left">
                  <span>
                    <span className="block text-lg font-semibold">{canManageUsers(profile?.role) ? "Usuários Cadastrados" : "Funcionários vinculados"}</span>
                    <span className="text-sm text-neutral-400">{canManageUsers(profile?.role) ? "Editar, inativar, reativar e excluir" : "Consultar e ajustar empresas vinculadas"}</span>
                  </span>
                  <Users />
                </button>
              </>
            )}
          </section>
        </div>
      </section>

      <FloatingCalculator hidden={["user", "users"].includes(modal?.type)} />

      {modal?.type === "company" && <CompanyModal initial={modal.item} users={users.filter((item) => item.active !== false)} userCompanies={userCompanies} canManage={canManageCompanies(profile?.role)} saving={saving} onClose={() => setModal(null)} onSave={saveCompany} />}
      {modal?.type === "calculator" && [ROLES.MANAGER, ROLES.EMPLOYEE].includes(profile?.role) && <SaleCalculatorModal onClose={() => setModal(null)} />}
      {modal?.type === "product" && <ProductModal initial={modal.item} initialImageSrc={productImageSrc(modal.item)} companies={availableCompanies} role={profile?.role} activeCompanyId={activeCompanyId || profile?.company_id} saving={saving} onClose={() => setModal(null)} onSave={saveProduct} />}
      {modal?.type === "companies" && <CompaniesModal companies={canManageCompanies(profile?.role) ? companies : availableCompanies} canEdit={canEditCompany(profile?.role)} canManage={canManageCompanies(profile?.role)} onEdit={(item) => setModal({ type: "company", item })} onDelete={deleteCompany} onSave={saveCompany} onClose={() => setModal(null)} />}
      {modal?.type === "products" && <ProductsModal products={visibleProducts} manageableProducts={manageableProducts} role={profile?.role} companies={companies} query={query} setQuery={setQuery} imageSrc={productImageSrc} imageError={productImageHasError} onEdit={(item) => setModal({ type: "product", item })} onDelete={deleteProduct} onAdjust={adjustProduct} onImageClick={(product, imageUrl) => setModal({ type: "image", product, imageUrl, returnTo: "products" })} onClose={() => setModal(null)} />}
      {modal?.type === "sale" && <SaleModal products={saleProducts} companies={availableCompanies} users={usersWithSelectedCompanyAccess} sales={visibleSales} currentUser={profile} onClose={() => setModal(null)} onSave={saveSale} />}
      {modal?.type === "receiptPrompt" && <ReceiptPromptModal sale={modal.sale} onPrint={() => openReceipt(modal.sale, "print", "sales")} onSkip={() => setModal(null)} />}
      {modal?.type === "receipt" && <ReceiptModal sale={modal.sale} action={modal.action} onClose={() => setModal(modal.returnTo === "profit" ? { type: "profit" } : modal.returnTo === "sales" ? { type: "sales" } : modal.returnTo === "unpaidBalances" ? { type: "unpaidBalances" } : null)} />}
      {modal?.type === "sales" && <SalesHistoryModal sales={visibleSales} products={historyProductOptions} role={profile?.role} onPaymentChange={updateSalePayment} onReceipt={openReceipt} onDelete={deleteSale} onClose={() => setModal(null)} />}
      {modal?.type === "unpaidBalances" && <UnpaidBalancesModal sales={visibleSales} role={profile?.role} onPaymentChange={updateSalePayment} onReceipt={openReceipt} onDelete={deleteSale} onClose={() => setModal(null)} />}
      {modal?.type === "profit" && <ProfitModal sales={visibleSales} companies={availableCompanies} role={profile?.role} filters={filters} setFilters={setFilters} onReceipt={(sale) => openReceipt(sale, "view", "profit")} onDelete={deleteSale} onClose={() => {
          setFilters({ day: "", month: "", hour: "", year: "", company_id: "", seller_name: "", buyer_name: "", product_name: "", payment_status: "" });
          setModal(null);
        }} />}
      {modal?.type === "user" && <UserModal initial={modal.item} companies={canManageUsers(profile?.role) ? companies.filter((item) => item.active !== false) : availableCompanies} userCompanies={userCompanies} managerMode={profile?.role === ROLES.MANAGER} saving={saving} onClose={() => setModal(null)} onSave={saveUser} />}
      {modal?.type === "users" && <UsersModal users={canManageUsers(profile?.role) ? users : usersWithSelectedCompanyAccess.filter((user) => user.id !== profile?.id && user.role === ROLES.EMPLOYEE)} companies={companies} userCompanies={userCompanies} managerMode={profile?.role === ROLES.MANAGER} onEdit={(item) => setModal({ type: "user", item })} onSave={saveUser} onDelete={deleteUser} onClose={() => setModal(null)} />}
      {modal?.type === "image" && <ProductImageLightbox product={modal.product} src={modal.imageUrl || productImageSrc(modal.product)} canManage={manageableProducts.some((item) => item.id === modal.product?.id)} onReplace={(file) => saveProduct({ ...modal.product, image_file: file })} onRemove={() => saveProduct({ ...modal.product, image_removed: true, image_url: null })} onClose={() => setModal(modal.returnTo === "products" ? { type: "products" } : null)} />}
    </main>
  );
}

function Landing({ onEnter }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <section className="max-w-3xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-neutral-800 px-4 py-2 text-sm text-neutral-300">
          <Store size={16} /> Controle online com Supabase
        </div>
        <h1 className="text-4xl font-bold md:text-6xl">Sistema de Estoque</h1>
        <p className="mx-auto mt-5 max-w-xl text-neutral-400">Gerencie empresas, usuários, produtos, vendas e relatórios em uma única tela.</p>
        <button type="button" onClick={onEnter} className="mt-8 rounded-md bg-white px-8 py-3 font-semibold text-black shadow-soft">Entrar no sistema</button>
      </section>
    </main>
  );
}

function Login({ onSubmit, loading, message, onBack }) {
  const [form, setForm] = useState({ company: "", username: "", password: "" });
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-white">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(form);
        }}
        className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-soft"
      >
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="mt-1 text-sm text-neutral-400">Entre com empresa, nome e senha.</p>
        <Field label="Empresa" value={form.company} onChange={(company) => setForm({ ...form, company })} required />
        <Field label="Nome" value={form.username} onChange={(username) => setForm({ ...form, username })} required />
        <Field label="Senha" value={form.password} onChange={(password) => setForm({ ...form, password })} type="password" required />
        {message && <p className="mt-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-100">{message}</p>}
        <div className="mt-6 flex gap-3">
          <button disabled={loading} className="flex-1 rounded-md bg-white px-4 py-3 font-semibold text-black disabled:opacity-60">
            {loading ? "Entrando..." : "Entrar"}
          </button>
          <button type="button" onClick={onBack} className="rounded-md border border-neutral-700 px-4 py-3 text-neutral-200">Voltar</button>
        </div>
      </form>
    </main>
  );
}

function ActionCard({ icon: Icon, title, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-left transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-45">
      <span className="flex items-center gap-3">
        <span className="rounded-md bg-neutral-800 p-2"><Icon size={20} /></span>
        <span className="font-semibold">{title}</span>
      </span>
      <Plus size={20} />
    </button>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
      <section className="my-8 w-full max-w-6xl rounded-lg border border-neutral-800 bg-neutral-950 p-5 shadow-soft">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md border border-neutral-700 px-3 py-2 text-sm">Fechar</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, disabled = false, children }) {
  return (
    <label className="mt-4 block">
      <span className="text-sm text-neutral-300">{label}</span>
      {children || (
        <input value={value} onChange={(event) => onChange(event.target.value)} type={type} required={required} disabled={disabled} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3 outline-none focus:border-white disabled:opacity-60" />
      )}
    </label>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="flex min-w-64 items-center gap-2 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2">
      <Search size={17} className="text-neutral-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm outline-none" />
    </label>
  );
}

function AutocompleteTextInput({ value, onChange, suggestions, placeholder, required = false, onSelect }) {
  const [focused, setFocused] = useState(false);
  const filteredSuggestions = suggestions
    .filter((suggestion) => !value || normalize(suggestion).includes(normalize(value)))
    .slice(0, 10);
  const showSuggestions = focused && filteredSuggestions.length > 0;

  return (
    <div className="relative mt-2 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 focus-within:border-white">
      <div className="flex items-center gap-2">
        <Search size={17} className="text-neutral-400" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          className="w-full bg-transparent py-1 outline-none"
          required={required}
        />
      </div>
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-950 shadow-soft">
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(suggestion);
                onSelect?.(suggestion);
                setFocused(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-neutral-100 hover:bg-black hover:text-white focus:bg-black focus:text-white"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanySelect({ companies, value, onChange, required = true, disabled = false }) {
  return (
    <>
      <input
        list="companies-list"
        value={companies.find((company) => company.id === value)?.name || value || ""}
        onChange={(event) => {
          const company = companies.find((item) => normalize(item.name) === normalize(event.target.value));
          onChange(company?.id || event.target.value);
        }}
        disabled={disabled}
        required={required}
        className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3 outline-none focus:border-white disabled:opacity-60"
      />
      <datalist id="companies-list">{companies.map((company) => <option key={company.id} value={company.name} />)}</datalist>
    </>
  );
}

function ProductTable({ products, role, companies, actions, onAdjust, onImageClick, imageSrc = () => "", imageError = () => false }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="text-left text-neutral-400">
          <tr className="border-b border-neutral-800">
            <th className="py-3">Produto</th>
            <th>Empresa/loja</th>
            <th>Posição no estoque</th>
            <th>Venda</th>
            {canSeePurchasePrice(role) && <th>Compra</th>}
            <th>Qtd.</th>
            <th>Foto</th>
            {actions && <th>Ações</th>}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-b border-neutral-900">
              <td className="py-3 font-medium">{product.name}</td>
              <td>{product.company_name || companyName(companies, product.company_id)}</td>
              <td>{product.stock_position || "-"}</td>
              <td>
                <InlineAdjust value={product.sale_price} type="money" onChange={onAdjust ? (mode, value) => onAdjust(product, "sale_price", mode, value) : null} />
              </td>
              {canSeePurchasePrice(role) && (
                <td>
                  <InlineAdjust value={product.purchase_price || 0} type="money" onChange={onAdjust ? (mode, value) => onAdjust(product, "purchase_price", mode, value) : null} />
                </td>
              )}
              <td>
                <InlineAdjust value={product.quantity} type="integer" onChange={onAdjust ? (mode, value) => onAdjust(product, "quantity", mode, value) : null} />
              </td>
              <td>
                {product.image_url ? (
                  <button
                    type="button"
                    onClick={() => onImageClick?.(product, imageSrc(product))}
                    disabled={!onImageClick}
                    className="h-12 w-12 overflow-hidden rounded-md border border-neutral-700 bg-neutral-950 disabled:cursor-default"
                    title={onImageClick ? "Ampliar imagem" : "Foto do produto"}
                  >
                    {imageError(product) ? (
                      <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-neutral-500">Sem imagem</span>
                    ) : imageSrc(product) ? (
                      <SafeProductImage src={imageSrc(product)} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-neutral-500">Carregando</span>
                    )}
                  </button>
                ) : <ImagePlaceholder />}
              </td>
              {actions && <td>{actions(product)}</td>}
            </tr>
          ))}
          {!products.length && <tr><td colSpan={actions ? 8 : 7} className="py-8 text-center text-neutral-500">Nenhum produto encontrado.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function InlineAdjust({ value, type = "number", onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? 0));
  const numericValue = Number(value || 0);
  const displayValue = type === "money" ? money(numericValue) : numericValue;

  useEffect(() => {
    setDraft(String(value ?? 0));
  }, [value]);

  function saveDraft() {
    const nextValue = type === "integer" ? Math.floor(Number(draft)) : Number(String(draft).replace(",", "."));
    if (Number.isNaN(nextValue) || nextValue < 0) {
      setDraft(String(value ?? 0));
      setEditing(false);
      return;
    }
    setEditing(false);
    onChange?.("set", nextValue);
  }

  if (!onChange) return <span>{displayValue}</span>;

  return (
    <span className="inline-flex min-w-[132px] items-center gap-1">
      <button onClick={() => onChange("decrease")} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-700 text-sm font-semibold hover:border-white" title="Diminuir">
        -
      </button>
      {editing ? (
        <input
          autoFocus
          type="number"
          min="0"
          step={type === "integer" ? "1" : "0.01"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={saveDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") saveDraft();
            if (event.key === "Escape") {
              setDraft(String(value ?? 0));
              setEditing(false);
            }
          }}
          className="h-7 w-20 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-center outline-none focus:border-white"
        />
      ) : (
        <button onClick={() => setEditing(true)} className="h-7 w-20 rounded-md border border-transparent px-2 text-center hover:border-neutral-700" title="Editar valor">
          {displayValue}
        </button>
      )}
      <button onClick={() => onChange("increase")} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-700 text-sm font-semibold hover:border-white" title="Aumentar">
        +
      </button>
    </span>
  );
}

function CompanyModal({ initial, users, userCompanies, canManage, saving, onClose, onSave }) {
  const linkedUserIds = initial?.id ? userCompanies.filter((link) => link.company_id === initial.id).map((link) => link.user_id) : [];
  const [form, setForm] = useState({ ...emptyCompany, active: true, ...initial, user_ids: initial?.user_ids || linkedUserIds });
  return (
    <Modal title={form.id ? "Editar empresa" : "Cadastro de empresa"} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome da empresa" value={form.name} onChange={(name) => setForm({ ...form, name })} required />
        <Field label="Telefone" value={form.phone || ""} onChange={(phone) => setForm({ ...form, phone })} />
        <Field label="Endereço" value={form.address || ""} onChange={(address) => setForm({ ...form, address })} />
      </div>
      {canManage && <UserMultiSelect users={users} selectedIds={form.user_ids || []} onChange={(user_ids) => setForm({ ...form, user_ids })} />}
      <Field label="Dados da empresa" value={form.notes || ""} onChange={(notes) => setForm({ ...form, notes })} />
      {canManage && (
        <label className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={form.active !== false} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          Empresa ativa
        </label>
      )}
      <button disabled={saving} onClick={() => onSave(form)} className="mt-5 rounded-md bg-white px-5 py-3 font-semibold text-black disabled:opacity-60">{saving ? "Salvando..." : "Salvar empresa"}</button>
    </Modal>
  );
}

function UserMultiSelect({ users, selectedIds, onChange }) {
  const [search, setSearch] = useState("");
  const selectedUsers = users.filter((user) => selectedIds.includes(user.id));
  const suggestions = users
    .filter((user) => !selectedIds.includes(user.id))
    .filter((user) => normalize(user.full_name || user.username).includes(normalize(search)))
    .slice(0, 6);

  function addUser(user) {
    onChange([...selectedIds, user.id]);
    setSearch("");
  }

  return (
    <div className="mt-4">
      <span className="text-sm text-neutral-300">Usuários com acesso padrão</span>
      <div className="mt-2 rounded-md border border-neutral-700 bg-neutral-950 p-2">
        <div className="flex flex-wrap gap-2">
          {selectedUsers.map((user) => (
            <span key={user.id} className="inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-sm text-black">
              {user.full_name || user.username}
              <button type="button" onClick={() => onChange(selectedIds.filter((idValue) => idValue !== user.id))} className="font-semibold" title="Remover usuário">x</button>
            </span>
          ))}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Digite o nome do usuário"
            className="min-w-64 flex-1 bg-transparent px-1 py-1 outline-none"
          />
        </div>
        {search && (
          <div className="mt-2 overflow-hidden rounded-md border border-neutral-800">
            {suggestions.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => addUser(user)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-black hover:text-white"
              >
                {user.full_name || user.username}
              </button>
            ))}
            {!suggestions.length && <p className="px-3 py-2 text-sm text-neutral-500">Nenhum usuário encontrado.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function ImagePlaceholder() {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-neutral-700 bg-neutral-950 text-xs text-neutral-500">
      Sem foto
    </span>
  );
}

function SafeProductImage({ src, alt, className, fallbackClassName, loading = "lazy" }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <span className={fallbackClassName || "flex h-full w-full items-center justify-center px-3 text-center text-xs text-neutral-500"}>
        Imagem indisponível
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function ProductImagePicker({ value, previewSrc, onChange }) {
  const [localPreview, setLocalPreview] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const visiblePreview = localPreview || (!value.image_removed ? previewSrc : "");

  useEffect(() => {
    return () => {
      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  function selectImage(file) {
    setError("");
    if (!file) return;
    const validationError = validateProductImage(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    const nextPreview = URL.createObjectURL(file);
    setLocalPreview(nextPreview);
    onChange({ image_file: file, image_preview_url: nextPreview, image_removed: false });
  }

  function removeImage() {
    if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    setLocalPreview("");
    setError("");
    onChange({ image_file: null, image_preview_url: "", image_removed: true, image_url: null });
  }

  return (
    <div className="mt-4 md:col-span-2">
      <span className="text-sm text-neutral-300">Foto do produto</span>
      <div className="mt-2 flex flex-col gap-4 rounded-md border border-neutral-800 bg-neutral-900 p-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => visiblePreview && setExpanded(true)}
          disabled={!visiblePreview}
          className="h-28 w-28 overflow-hidden rounded-md border border-neutral-700 bg-neutral-950 disabled:cursor-default"
          title={visiblePreview ? "Ampliar imagem" : "Sem imagem"}
        >
          {visiblePreview ? (
            <SafeProductImage src={visiblePreview} alt="Pré-visualização do produto" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-neutral-500">Sem imagem</span>
          )}
        </button>
        <div className="flex-1">
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-md bg-white px-4 py-2 text-sm font-semibold text-black">
              Selecionar Imagem
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={(event) => selectImage(event.target.files?.[0])}
                className="hidden"
              />
            </label>
            {visiblePreview && <button type="button" onClick={removeImage} className="rounded-md border border-red-900 px-4 py-2 text-sm text-red-200">Remover imagem</button>}
          </div>
          <p className="mt-2 text-xs text-neutral-500">Formatos permitidos: JPG, JPEG, PNG e WEBP. Tamanho máximo: 5 MB.</p>
          {error && <p className="mt-2 rounded-md bg-red-950 px-3 py-2 text-sm text-red-100">{error}</p>}
        </div>
      </div>
      {expanded && (
        <ProductImageLightbox
          product={value}
          src={visiblePreview}
          canManage={false}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

function ProductModal({ initial, initialImageSrc, companies, role, activeCompanyId, saving, onClose, onSave }) {
  const autoCompany = initial?.company_id || (companies.length === 1 ? companies[0].id : activeCompanyId);
  const [form, setForm] = useState({ ...emptyProduct, ...initial, company_id: autoCompany || "" });
  const companyLocked = Boolean(initial?.id && !canEditProductCompany(role));
  return (
    <Modal title={form.id ? "Editar produto" : "Cadastro de produto"} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <ProductImagePicker
          value={form}
          previewSrc={initialImageSrc}
          onChange={(imageState) => setForm({ ...form, ...imageState })}
        />
        <Field label="Nome do produto" value={form.name} onChange={(name) => setForm({ ...form, name })} required />
        <Field label="Preço de venda" type="number" value={form.sale_price} onChange={(sale_price) => setForm({ ...form, sale_price })} required />
        {canSeePurchasePrice(role) && <Field label="Valor real da compra" type="number" value={form.purchase_price || ""} onChange={(purchase_price) => setForm({ ...form, purchase_price })} />}
        <Field label="Quantidade" type="number" value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity })} required />
        <Field label="Posição no estoque" value={form.stock_position || ""} onChange={(stock_position) => setForm({ ...form, stock_position })} />
        <Field label="Empresa">
          <CompanySelect companies={companies} value={form.company_id} onChange={(company_id) => setForm({ ...form, company_id })} disabled={companyLocked} />
        </Field>
      </div>
      <button disabled={saving} onClick={() => onSave(form)} className="mt-5 rounded-md bg-white px-5 py-3 font-semibold text-black disabled:opacity-60">{saving ? "Salvando..." : "Salvar produto"}</button>
    </Modal>
  );
}

function CompaniesModal({ companies, canEdit, canManage, onEdit, onDelete, onSave, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = companies.filter((company) => normalize(company.name).includes(normalize(search)));
  return (
    <Modal title="Empresas cadastradas" onClose={onClose}>
      <div className="mb-4 max-w-md"><SearchBox value={search} onChange={setSearch} placeholder="Pesquisar empresa" /></div>
      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((company) => (
          <div key={company.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{company.name}</p>
                <p className="text-sm text-neutral-400">{company.address || "Sem endereço"}</p>
                <p className="text-sm text-neutral-500">{company.active === false ? "Inativa" : "Ativa"}</p>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button onClick={() => onEdit(company)} className="rounded-md border border-neutral-700 px-3 py-2 text-sm">Editar</button>
                  {canManage && <button onClick={() => onSave({ ...company, active: company.active === false })} className="rounded-md border border-neutral-700 px-3 py-2 text-sm">{company.active === false ? "Reativar" : "Inativar"}</button>}
                  {canManage && <button onClick={() => onDelete(company.id)} className="rounded-md border border-red-900 px-3 py-2 text-sm text-red-200"><Trash2 size={15} /></button>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ProductsModal({ products, manageableProducts, role, companies, query, setQuery, imageSrc, imageError, onEdit, onDelete, onAdjust, onImageClick, onClose }) {
  const manageableIds = new Set(manageableProducts.map((item) => item.id));
  return (
    <Modal title="Produtos cadastrados" onClose={onClose}>
      <div className="mb-4 max-w-md"><SearchBox value={query} onChange={setQuery} placeholder="Pesquisar Produto" /></div>
      <ProductTable
        products={products}
        role={role}
        companies={companies}
        onAdjust={onAdjust}
        onImageClick={onImageClick}
        imageSrc={imageSrc}
        imageError={imageError}
        actions={(product) => (
          <div className="flex gap-2">
            {manageableIds.has(product.id) && <button onClick={() => onEdit(product)} className="rounded-md border border-neutral-700 px-3 py-2 text-sm">Editar</button>}
            {canDeleteProducts(role) && <button onClick={() => onDelete(product.id)} className="rounded-md border border-red-900 px-3 py-2 text-sm text-red-200"><Trash2 size={15} /></button>}
          </div>
        )}
      />
    </Modal>
  );
}

function ProductImageLightbox({ product, src, canManage, onReplace, onRemove, onClose }) {
  const [error, setError] = useState("");
  const [resolvedSrc, setResolvedSrc] = useState(src || "");
  const [loadingImage, setLoadingImage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const path = productImageStoragePath(product?.image_url);
    const directSrc = src || (!path ? product?.image_url || "" : "");

    setError("");
    setResolvedSrc(directSrc);

    if (!path || directSrc) {
      setLoadingImage(false);
      return;
    }

    setLoadingImage(true);
    supabase.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error: signedUrlError }) => {
        if (cancelled) return;
        if (signedUrlError || !data?.signedUrl) {
          setError("Não foi possível carregar a imagem em tela cheia.");
          setResolvedSrc("");
          return;
        }
        setResolvedSrc(data.signedUrl);
      })
      .finally(() => {
        if (!cancelled) setLoadingImage(false);
      });

    return () => {
      cancelled = true;
    };
  }, [product?.image_url, src]);

  function handleReplace(file) {
    setError("");
    const validationError = validateProductImage(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    onReplace(file);
  }

  const companyLabel = product?.company_name || product?.company || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3" onMouseDown={onClose}>
      <section className="w-full max-w-5xl rounded-lg border border-neutral-800 bg-neutral-950 p-4 shadow-soft" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{product?.name || "Imagem do produto"}</h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-400">
              {product?.sale_price !== "" && product?.sale_price !== undefined && <span>{money(product.sale_price)}</span>}
              {companyLabel && <span>{companyLabel}</span>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md border border-neutral-700 px-3 py-2 text-sm">Fechar</button>
        </div>

        <div className="flex min-h-[65vh] items-center justify-center rounded-lg bg-black p-2">
          {loadingImage ? (
            <div className="flex h-64 w-full max-w-lg items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900 text-neutral-500">Carregando imagem...</div>
          ) : resolvedSrc ? (
            <SafeProductImage
              src={resolvedSrc}
              alt={product?.name || "Foto do produto"}
              loading="eager"
              className="max-h-[78vh] max-w-full rounded-md object-contain"
              fallbackClassName="flex h-64 w-full items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900 text-neutral-500"
            />
          ) : (
            <div className="flex h-64 w-full max-w-lg items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900 text-neutral-500">Imagem indisponível</div>
          )}
        </div>

        {canManage && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <label className="cursor-pointer rounded-md bg-white px-4 py-2 text-sm font-semibold text-black">
              Trocar Imagem
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={(event) => handleReplace(event.target.files?.[0])}
                className="hidden"
              />
            </label>
            {product?.image_url && <button onClick={onRemove} className="rounded-md border border-red-900 px-4 py-2 text-sm text-red-200">Remover Imagem</button>}
          </div>
        )}
        {error && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-100">{error}</p>}
      </section>
    </div>
  );
}

function FloatingCalculator({ hidden }) {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [storedValue, setStoredValue] = useState(null);
  const [operator, setOperator] = useState(null);
  const [waitingForValue, setWaitingForValue] = useState(false);
  const [position, setPosition] = useState(null);
  const dragRef = useRef(null);
  const suppressOpenRef = useRef(false);

  function clampPosition(x, y, width, height) {
    if (typeof window === "undefined") return { x, y };
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8))
    };
  }

  useEffect(() => {
    if (typeof window === "undefined" || position) return;
    setPosition(clampPosition(window.innerWidth - 64, window.innerHeight - 64, 48, 48));
  }, [position]);

  useEffect(() => {
    function move(event) {
      if (!dragRef.current) return;
      const nextX = event.clientX - dragRef.current.offsetX;
      const nextY = event.clientY - dragRef.current.offsetY;
      const movedX = Math.abs(event.clientX - dragRef.current.startX);
      const movedY = Math.abs(event.clientY - dragRef.current.startY);
      if (movedX > 3 || movedY > 3) dragRef.current.moved = true;
      setPosition(clampPosition(nextX, nextY, dragRef.current.width, dragRef.current.height));
    }

    function stop() {
      if (dragRef.current?.moved) suppressOpenRef.current = true;
      dragRef.current = null;
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, []);

  function startDrag(event, width, height, fallbackX, fallbackY) {
    const currentX = position?.x ?? fallbackX;
    const currentY = position?.y ?? fallbackY;
    dragRef.current = {
      offsetX: event.clientX - currentX,
      offsetY: event.clientY - currentY,
      startX: event.clientX,
      startY: event.clientY,
      width,
      height,
      moved: false
    };
  }

  function openCalculator() {
    if (suppressOpenRef.current) {
      suppressOpenRef.current = false;
      return;
    }
    setPosition((current) => clampPosition(current?.x ?? window.innerWidth - 260, current?.y ?? window.innerHeight - 380, 244, 340));
    setOpen(true);
  }

  function minimizeCalculator() {
    setPosition((current) => clampPosition(current?.x ?? window.innerWidth - 64, current?.y ?? window.innerHeight - 64, 48, 48));
    setOpen(false);
  }

  function formatDisplay(value) {
    if (!Number.isFinite(value)) return "Erro";
    return String(roundToTwo(value)).slice(0, 12);
  }

  function currentNumber() {
    return Number(String(display).replace(",", "."));
  }

  function calculate(first, second, nextOperator) {
    if (nextOperator === "+") return first + second;
    if (nextOperator === "-") return first - second;
    if (nextOperator === "x") return first * second;
    if (nextOperator === "/") return second === 0 ? Number.NaN : first / second;
    return second;
  }

  function inputDigit(digit) {
    if (display === "Erro") {
      setDisplay(digit);
      setWaitingForValue(false);
      return;
    }
    if (waitingForValue) {
      setDisplay(digit);
      setWaitingForValue(false);
      return;
    }
    setDisplay((current) => current === "0" ? digit : `${current}${digit}`.slice(0, 12));
  }

  function inputDecimal() {
    if (display === "Erro" || waitingForValue) {
      setDisplay("0.");
      setWaitingForValue(false);
      return;
    }
    if (!display.includes(".")) setDisplay((current) => `${current}.`);
  }

  function chooseOperator(nextOperator) {
    const value = currentNumber();
    if (!Number.isFinite(value)) return;
    if (operator && !waitingForValue && storedValue !== null) {
      const result = calculate(storedValue, value, operator);
      setStoredValue(result);
      setDisplay(formatDisplay(result));
    } else {
      setStoredValue(value);
    }
    setOperator(nextOperator);
    setWaitingForValue(true);
  }

  function equals() {
    if (!operator || storedValue === null) return;
    const result = calculate(storedValue, currentNumber(), operator);
    setDisplay(formatDisplay(result));
    setStoredValue(null);
    setOperator(null);
    setWaitingForValue(true);
  }

  function clear() {
    setDisplay("0");
    setStoredValue(null);
    setOperator(null);
    setWaitingForValue(false);
  }

  function backspace() {
    if (waitingForValue || display === "Erro") {
      setDisplay("0");
      setWaitingForValue(false);
      return;
    }
    setDisplay((current) => current.length > 1 ? current.slice(0, -1) : "0");
  }

  function percent() {
    const value = currentNumber();
    if (Number.isFinite(value)) setDisplay(formatDisplay(value / 100));
  }

  function toggleSign() {
    if (display === "0" || display === "Erro") return;
    setDisplay((current) => current.startsWith("-") ? current.slice(1) : `-${current}`.slice(0, 12));
  }

  const buttons = [
    { label: "C", action: clear, className: "bg-red-950 text-red-100 hover:bg-red-900" },
    { label: "+/-", action: toggleSign },
    { label: "%", action: percent },
    { label: "/", action: () => chooseOperator("/"), active: operator === "/" },
    { label: "7", action: () => inputDigit("7") },
    { label: "8", action: () => inputDigit("8") },
    { label: "9", action: () => inputDigit("9") },
    { label: "x", action: () => chooseOperator("x"), active: operator === "x" },
    { label: "4", action: () => inputDigit("4") },
    { label: "5", action: () => inputDigit("5") },
    { label: "6", action: () => inputDigit("6") },
    { label: "-", action: () => chooseOperator("-"), active: operator === "-" },
    { label: "1", action: () => inputDigit("1") },
    { label: "2", action: () => inputDigit("2") },
    { label: "3", action: () => inputDigit("3") },
    { label: "+", action: () => chooseOperator("+"), active: operator === "+" },
    { label: "0", action: () => inputDigit("0"), className: "col-span-2" },
    { label: ".", action: inputDecimal },
    { label: "=", action: equals }
  ];

  if (hidden) return null;

  if (!open) {
    return (
      <button
        type="button"
        onPointerDown={(event) => startDrag(event, 48, 48, window.innerWidth - 64, window.innerHeight - 64)}
        onClick={openCalculator}
        style={position ? { left: position.x, top: position.y } : undefined}
        className={`fixed z-30 flex h-12 w-12 cursor-move touch-none items-center justify-center rounded-full border border-neutral-700 bg-white text-black shadow-soft ${position ? "" : "bottom-4 right-4"}`}
        title="Abrir calculadora"
        aria-label="Abrir calculadora"
      >
        <Calculator size={21} />
      </button>
    );
  }

  return (
    <aside
      style={position ? { left: position.x, top: position.y } : undefined}
      className={`fixed z-50 w-[244px] rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-white shadow-soft ${position ? "" : "bottom-4 right-4"}`}
    >
      <div
        className="mb-3 flex cursor-move touch-none select-none items-center justify-between gap-2"
        onPointerDown={(event) => startDrag(event, 244, 340, window.innerWidth - 260, window.innerHeight - 380)}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
          <Calculator size={16} /> Calculadora
        </div>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={minimizeCalculator} className="h-7 w-7 rounded-md border border-neutral-700 text-sm text-neutral-300" aria-label="Recolher calculadora">-</button>
      </div>
      <div className="mb-3 rounded-md border border-neutral-800 bg-black px-3 py-3 text-right font-mono text-2xl leading-none text-emerald-200">
        {display.replace(".", ",")}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {buttons.map((button) => (
          <button
            key={button.label}
            type="button"
            onClick={button.action}
            className={`h-10 rounded-md border border-neutral-700 text-sm font-semibold transition hover:border-white ${button.active ? "bg-neutral-200 text-black" : "bg-neutral-900 text-neutral-100"} ${button.className || ""}`}
          >
            {button.label}
          </button>
        ))}
        <button type="button" onClick={backspace} className="col-span-4 h-9 rounded-md border border-neutral-700 bg-neutral-900 text-sm font-semibold text-neutral-100 hover:border-white">
          Apagar
        </button>
      </div>
    </aside>
  );
}

function SaleCalculatorModal({ onClose }) {
  const emptyCalculator = {
    baseValue: "",
    discountPercent: "",
    discountAmount: "",
    increasePercent: "",
    increaseAmount: "",
    installments: ""
  };
  const [form, setForm] = useState(emptyCalculator);
  const [copyMessage, setCopyMessage] = useState("");

  function numberValue(value) {
    const parsed = Number(String(value || "").replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function integerValue(value) {
    const parsed = Math.floor(Number(String(value || "").replace(",", ".")));
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 0;
  }

  const baseValue = numberValue(form.baseValue);
  const discountPercent = numberValue(form.discountPercent);
  const discountAmountInput = numberValue(form.discountAmount);
  const increasePercent = numberValue(form.increasePercent);
  const increaseAmountInput = numberValue(form.increaseAmount);
  const installments = integerValue(form.installments);
  const percentDiscountValue = baseValue * (discountPercent / 100);
  const afterPercentDiscount = Math.max(0, baseValue - percentDiscountValue);
  const discountAmountValue = Math.min(discountAmountInput, afterPercentDiscount);
  const afterDiscounts = Math.max(0, afterPercentDiscount - discountAmountValue);
  const percentIncreaseValue = afterDiscounts * (increasePercent / 100);
  const totalIncreases = percentIncreaseValue + increaseAmountInput;
  const finalValue = Math.max(0, afterDiscounts + totalIncreases);
  const totalDiscounts = baseValue - afterDiscounts;
  const installmentValue = installments ? finalValue / installments : 0;
  const hasNegativeInput = ["baseValue", "discountPercent", "discountAmount", "increasePercent", "increaseAmount", "installments"]
    .some((key) => Number(String(form[key] || "0").replace(",", ".")) < 0);
  const hasInvalidCount = (form.installments && installments < 1);

  function updateField(key, value) {
    setCopyMessage("");
    setForm((current) => ({ ...current, [key]: value }));
  }


  function clear() {
    setForm(emptyCalculator);
    setCopyMessage("");
  }

  async function copyResult() {
    const text = [
      `Valor Base: ${money(baseValue)}`,
      `Descontos: ${money(totalDiscounts)}`,
      `Acréscimos: ${money(totalIncreases)}`,
      `Valor Final: ${money(finalValue)}`,
      `Parcelas: ${installments ? `${installments}x de ${money(installmentValue)}` : "-"}`
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("Resultado copiado!");
    } catch {
      setCopyMessage("Não foi possível copiar automaticamente.");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/75 p-3 sm:p-4">
      <section className="my-3 w-full max-w-5xl rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-neutral-100 shadow-soft sm:my-8 sm:p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Calculadora de Venda</h2>
            <p className="mt-1 text-sm text-neutral-400">Ferramenta auxiliar, sem alterar venda, produto ou relatório.</p>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md border border-neutral-700 text-lg font-semibold" aria-label="Fechar">X</button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <CalculatorInput label="Valor Base" value={form.baseValue} onChange={(value) => updateField("baseValue", value)} required />
              <CalculatorInput label="Desconto em %" value={form.discountPercent} onChange={(value) => updateField("discountPercent", value)} />
              <CalculatorInput label="Desconto em R$" value={form.discountAmount} onChange={(value) => updateField("discountAmount", value)} />
              <CalculatorInput label="Acréscimo em %" value={form.increasePercent} onChange={(value) => updateField("increasePercent", value)} />
              <CalculatorInput label="Acréscimo em R$" value={form.increaseAmount} onChange={(value) => updateField("increaseAmount", value)} />
              <CalculatorInput label="Quantidade de parcelas" value={form.installments} onChange={(value) => updateField("installments", value)} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={clear} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200">Limpar</button>
            </div>

            {(hasNegativeInput || hasInvalidCount) && (
              <p className="mt-4 rounded-md border border-amber-900 bg-amber-950 px-3 py-2 text-sm text-amber-100">
                Use apenas valores positivos. Parcelas devem ser no mínimo 1.
              </p>
            )}
          </div>

          <aside className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="text-lg font-semibold">Resultado</h3>
            <div className="mt-4 grid gap-3">
              <CalculatorResult label="Valor Base" value={money(baseValue)} />
              <CalculatorResult label="Total de Descontos" value={money(totalDiscounts)} />
              <CalculatorResult label="Total de Acréscimos" value={money(totalIncreases)} />
              <CalculatorResult label="Valor Final" value={money(finalValue)} strong />
              <CalculatorResult label="Valor por Parcela" value={installments ? `${installments}x de ${money(installmentValue)}` : "-"} />
            </div>
            <button onClick={copyResult} className="mt-5 w-full rounded-md bg-white px-4 py-3 font-semibold text-black">Copiar Resultado</button>
            {copyMessage && <p className="mt-3 rounded-md bg-black px-3 py-2 text-sm text-neutral-200">{copyMessage}</p>}
          </aside>
        </div>
      </section>
    </div>
  );
}

function CalculatorInput({ label, value, onChange, required }) {
  return (
    <label className="block text-sm text-neutral-300">
      {label}
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3 text-white outline-none focus:border-white"
      />
    </label>
  );
}

function CalculatorResult({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-3">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className={strong ? "text-xl font-semibold text-white" : "font-medium text-neutral-100"}>{value}</span>
    </div>
  );
}

function SaleModal({ products, companies, users, sales, currentUser, onClose, onSave }) {
  const employeeMode = currentUser?.role === ROLES.EMPLOYEE;
  const [form, setForm] = useState({ ...emptySale, seller_id: employeeMode ? currentUser.id : "" });
  const [productSearch, setProductSearch] = useState("");
  const [productSearchFocused, setProductSearchFocused] = useState(false);
  const [negativeBalanceWarning, setNegativeBalanceWarning] = useState(null);
  const [stockWarning, setStockWarning] = useState(null);
  const selectedProduct = products.find((item) => item.id === form.product_id);
  const productSuggestions = products
    .filter((product) => !productSearch || normalize(product.name).includes(normalize(productSearch)))
    .slice(0, 12);
  const buyerSuggestions = uniqueSuggestions(sales.map((sale) => sale.buyer_name));
  useEffect(() => {
    if (selectedProduct) {
      setProductSearch(selectedProduct.name);
      setForm((current) => ({ ...current, company_id: selectedProduct.company_id, sale_price: selectedProduct.sale_price }));
    }
  }, [selectedProduct?.id]);
  const sellerOptions = users.filter((user) => user.role !== ROLES.OWNER || user.company_id === form.company_id);

  function submitSale(confirmedNegativeBalance = false, confirmedStockExceeded = false) {
    const quantity = Number(form.quantity || 0);
    const availableQuantity = Number(selectedProduct?.quantity || 0);
    const exceedsStock = selectedProduct && quantity > availableQuantity;
    const buyerName = String(form.buyer_name || "").trim();
    const buyerUnpaidSales = unpaidSalesForBuyer(sales, buyerName);

    if (!confirmedStockExceeded && exceedsStock) {
      setStockWarning({ productName: selectedProduct.name, quantity, availableQuantity });
      return;
    }
    if (!confirmedNegativeBalance && buyerUnpaidSales.length) {
      const total = buyerUnpaidSales.reduce((sum, sale) => sum + saleTotal(sale), 0);
      setNegativeBalanceWarning({ buyerName, total, count: buyerUnpaidSales.length, stockExceeded: exceedsStock });
      return;
    }
    setStockWarning(null);
    setNegativeBalanceWarning(null);
    onSave({ ...form, stock_exceeded: exceedsStock });
  }

  return (
    <Modal title="Produtos Vendidos" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Pesquisar Produto">
          <div className="relative mt-2 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2">
            <div className="flex items-center gap-2">
            <Search size={17} className="text-neutral-400" />
            <input
              value={productSearch}
              onChange={(event) => {
                setProductSearch(event.target.value);
                setStockWarning(null);
                setForm({ ...form, product_id: "", company_id: "", sale_price: "" });
              }}
              onFocus={() => setProductSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setProductSearchFocused(false), 120)}
              placeholder="Digite o nome do produto"
              className="w-full bg-transparent py-1 outline-none"
              required
            />
            </div>
            {selectedProduct && (
              <div className="mt-2 rounded-md bg-black px-3 py-2 text-sm text-white">
                {selectedProduct.name} - {selectedProduct.company_name || companyName(companies, selectedProduct.company_id)} - estoque {selectedProduct.quantity}
              </div>
            )}
            {productSearchFocused && (!selectedProduct || normalize(productSearch) !== normalize(selectedProduct.name)) && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-950 shadow-soft">
                {productSuggestions.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setProductSearch(product.name);
                      setProductSearchFocused(false);
                      setForm({ ...form, product_id: product.id, company_id: product.company_id, sale_price: product.sale_price });
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-neutral-100 hover:bg-black hover:text-white focus:bg-black focus:text-white"
                  >
                    {product.name} - {product.company_name || companyName(companies, product.company_id)} - estoque {product.quantity}
                  </button>
                ))}
                {!productSuggestions.length && (
                  <p className="px-3 py-2 text-sm text-neutral-500">Nenhum produto encontrado.</p>
                )}
              </div>
            )}
          </div>
        </Field>
        <Field label="Empresa da venda">
          <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3">
            <option value="">Selecione</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </Field>
        <Field label="Quantidade vendida" type="number" value={form.quantity} onChange={(quantity) => {
          setStockWarning(null);
          setForm({ ...form, quantity });
        }} required />
        <Field label="Preço real de venda" type="number" value={form.sale_price} onChange={(sale_price) => setForm({ ...form, sale_price })} required />
        <Field label="Comprador">
          <AutocompleteTextInput
            value={form.buyer_name}
            onChange={(buyer_name) => {
              setNegativeBalanceWarning(null);
              setForm({ ...form, buyer_name });
            }}
            suggestions={buyerSuggestions}
            placeholder="Digite o nome do comprador"
            required
          />
        </Field>
        <Field label="Pagamento">
          <select
            value={form.payment_status}
            onChange={(event) => setForm({ ...form, payment_status: event.target.value })}
            className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3"
            required
          >
            <option value="">Selecione</option>
            {PAYMENT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="Vendedor">
          <input
            list="seller-list"
            value={sellerOptions.find((user) => user.id === form.seller_id)?.full_name || sellerOptions.find((user) => user.id === form.seller_id)?.username || form.seller_id}
            onChange={(event) => {
              const seller = sellerOptions.find((item) => normalize(item.full_name) === normalize(event.target.value) || normalize(item.username) === normalize(event.target.value));
              setForm({ ...form, seller_id: seller?.id || event.target.value });
            }}
            disabled={employeeMode}
            className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3 outline-none focus:border-white"
            required
          />
          <datalist id="seller-list">{sellerOptions.map((user) => <option key={user.id} value={user.full_name || user.username} />)}</datalist>
        </Field>
      </div>
      {stockWarning && (
        <div className="mt-5 rounded-lg border border-red-800 bg-red-950 p-4 text-red-50">
          <p className="font-semibold">Quantidade maior que o estoque.</p>
          <p className="mt-1 text-sm">
            {stockWarning.productName} possui {stockWarning.availableQuantity} em estoque e a venda solicita {stockWarning.quantity}. Deseja fazer a venda mesmo assim?
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => submitSale(false, true)} className="rounded-md bg-white px-4 py-2 font-semibold text-black">Sim, fazer venda</button>
            <button type="button" onClick={() => setStockWarning(null)} className="rounded-md border border-red-700 px-4 py-2 text-red-50">Não fazer agora</button>
          </div>
        </div>
      )}
      {negativeBalanceWarning && (
        <div className="mt-5 rounded-lg border border-amber-800 bg-amber-950 p-4 text-amber-50">
          <p className="font-semibold">Este comprador já possui saldo negativo.</p>
          <p className="mt-1 text-sm">
            {negativeBalanceWarning.buyerName} tem {negativeBalanceWarning.count} compra(s) pendente(s), totalizando {money(negativeBalanceWarning.total)}. Deseja fazer a venda mesmo assim?
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => submitSale(true, negativeBalanceWarning.stockExceeded)} className="rounded-md bg-white px-4 py-2 font-semibold text-black">Sim, fazer venda</button>
            <button type="button" onClick={() => setNegativeBalanceWarning(null)} className="rounded-md border border-amber-700 px-4 py-2 text-amber-50">Não fazer agora</button>
          </div>
        </div>
      )}
      <button onClick={() => submitSale(false, false)} className="mt-5 rounded-md bg-white px-5 py-3 font-semibold text-black">Confirmar venda</button>
    </Modal>
  );
}

function ReceiptPromptModal({ sale, onPrint, onSkip }) {
  return (
    <Modal title="Venda registrada" onClose={onSkip}>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <p className="text-lg font-semibold">Venda registrada com sucesso.</p>
        <p className="mt-2 text-sm text-neutral-400">Deseja imprimir o recibo agora?</p>
        <div className="mt-4 rounded-md bg-black px-3 py-2 text-sm text-neutral-300">
          Recibo {sale?.receipt_number || "gerado"} - {sale?.product_name || "Produto vendido"}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={onPrint} className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 font-semibold text-black"><Printer size={18} /> Imprimir Recibo</button>
          <button onClick={onSkip} className="rounded-md border border-neutral-700 px-5 py-3 text-neutral-200">Não imprimir agora</button>
        </div>
      </div>
    </Modal>
  );
}

function ReceiptModal({ sale, action, onClose }) {
  useEffect(() => {
    if (action === "print") {
      const timer = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(timer);
    }
    if (action === "pdf") {
      const timer = window.setTimeout(() => downloadReceiptPdf(sale), 250);
      return () => window.clearTimeout(timer);
    }
  }, [action, sale]);

  const total = Number(sale.sale_price || 0) * Number(sale.quantity || 0);
  return (
    <Modal title="Recibo de Venda" onClose={onClose}>
      <div className="no-print mb-4 flex flex-wrap gap-3">
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-3 font-semibold text-black"><Printer size={18} /> Imprimir</button>
        <button onClick={() => downloadReceiptPdf(sale)} className="inline-flex items-center gap-2 rounded-md border border-neutral-700 px-4 py-3 text-neutral-100"><Download size={18} /> Baixar PDF</button>
        <button onClick={onClose} className="rounded-md border border-neutral-700 px-4 py-3 text-neutral-100">Voltar</button>
      </div>

      <section className="receipt-print-area mx-auto max-w-3xl rounded-lg border border-neutral-800 bg-white p-8 text-neutral-950 shadow-soft">
        <div className="flex flex-col gap-4 border-b border-neutral-300 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Recibo de Venda</h1>
            <p className="mt-1 text-sm text-neutral-600">Comprovante interno, sem valor de nota fiscal.</p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-sm text-neutral-600">Número</p>
            <p className="text-xl font-semibold">{sale.receipt_number || "-"}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ReceiptInfo label="Empresa" value={sale.company_name} />
          <ReceiptInfo label="Data da venda" value={sale.created_at ? new Date(sale.created_at).toLocaleString("pt-BR") : "-"} />
          {sale.company_address && <ReceiptInfo label="Endereço" value={sale.company_address} />}
          <ReceiptInfo label="Comprador" value={sale.buyer_name} />
          <ReceiptInfo label="Vendedor" value={sale.seller_name} />
          <ReceiptInfo label="Pagamento" value={paymentStatusLabel(sale.payment_status)} />
          <ReceiptInfo label="Registrado por" value={sale.receipt_created_by_name || sale.created_by_name || "-"} />
        </div>

        <div className="mt-8 overflow-hidden rounded-md border border-neutral-300">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-left">
              <tr>
                <th className="p-3">Produto</th>
                <th className="p-3">Qtd.</th>
                <th className="p-3">Valor unitário</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-neutral-300">
                <td className="p-3">{sale.product_name}</td>
                <td className="p-3">{sale.quantity}</td>
                <td className="p-3">{money(sale.sale_price)}</td>
                <td className="p-3 text-right font-semibold">{money(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-md bg-neutral-100 p-4 text-right">
          <p className="text-sm text-neutral-600">Valor total</p>
          <p className="text-2xl font-bold">{money(total)}</p>
        </div>

        <p className="mt-8 border-t border-neutral-300 pt-5 text-center text-sm text-neutral-600">Obrigado pela preferência!</p>
      </section>
    </Modal>
  );
}

function ReceiptInfo({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 font-medium">{value || "-"}</p>
    </div>
  );
}

function SalesHistoryModal({ sales, products, role, onPaymentChange, onReceipt, onDelete, onClose }) {
  const [filters, setFilters] = useState({
    product_name: "",
    company_name: "",
    seller_name: "",
    buyer_name: "",
    payment_status: ""
  });
  const productSuggestions = uniqueSuggestions([
    ...(products || []).map((product) => product.name),
    ...sales.map((sale) => sale.product_name)
  ]);
  const buyerSuggestions = uniqueSuggestions(sales.map((sale) => sale.buyer_name));
  const sellerSuggestions = uniqueSuggestions(sales.map((sale) => sale.seller_name));
  const filteredSales = sales.filter((sale) => {
    return (!filters.product_name || normalize(sale.product_name).includes(normalize(filters.product_name)))
      && (!filters.company_name || normalize(sale.company_name).includes(normalize(filters.company_name)))
      && (!filters.seller_name || normalize(sale.seller_name).includes(normalize(filters.seller_name)))
      && (!filters.buyer_name || normalize(sale.buyer_name).includes(normalize(filters.buyer_name)))
      && (!filters.payment_status || (sale.payment_status || "unpaid") === filters.payment_status);
  });
  return (
    <Modal title="Produtos vendidos" onClose={onClose}>
      <div className="mb-4 grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        <label className="text-sm text-neutral-300">Produto
          <AutocompleteTextInput value={filters.product_name} onChange={(product_name) => setFilters({ ...filters, product_name })} suggestions={productSuggestions} placeholder="Pesquisar produto" />
        </label>
        <Filter label="Empresa" value={filters.company_name} onChange={(company_name) => setFilters({ ...filters, company_name })} />
        <label className="text-sm text-neutral-300">Vendedor
          <AutocompleteTextInput value={filters.seller_name} onChange={(seller_name) => setFilters({ ...filters, seller_name })} suggestions={sellerSuggestions} placeholder="Todos os vendedores" />
          <button type="button" onClick={() => setFilters({ ...filters, seller_name: "" })} className="mt-2 rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-200">Todos os vendedores</button>
        </label>
        <label className="text-sm text-neutral-300">Comprador
          <AutocompleteTextInput value={filters.buyer_name} onChange={(buyer_name) => setFilters({ ...filters, buyer_name })} suggestions={buyerSuggestions} placeholder="Pesquisar comprador" />
        </label>
        <label className="text-sm text-neutral-300">Pagamento
          <select value={filters.payment_status} onChange={(event) => setFilters({ ...filters, payment_status: event.target.value })} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3">
            <option value="">Todos</option>
            {PAYMENT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="text-left text-neutral-400">
            <tr>
              <th>Produto</th>
              <th>Empresa</th>
              <th>Vendedor</th>
              <th>Comprador</th>
              <th>Pagamento</th>
              <th>Qtd.</th>
              <th>Valor da venda</th>
              {canSeeProfit(role) && <th>Lucro</th>}
              <th>Data</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.map((sale) => (
              <tr key={sale.id} className="border-t border-neutral-900">
                <td className="py-3">{sale.product_name}</td>
                <td>{sale.company_name}</td>
                <td>{sale.seller_name}</td>
                <td>{sale.buyer_name || "-"}</td>
                <td>
                  <select
                    value={sale.payment_status || "unpaid"}
                    onChange={(event) => onPaymentChange(sale, event.target.value)}
                    className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm"
                  >
                    {PAYMENT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </td>
                <td>{sale.quantity}</td>
                <td>{money(Number(sale.sale_price || 0) * Number(sale.quantity || 0))}</td>
                {canSeeProfit(role) && <td>{money(saleProfit(sale))}</td>}
                <td>{new Date(sale.created_at).toLocaleString("pt-BR")}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => onReceipt(sale, "view", "sales")} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-2 text-xs"><Eye size={14} /> Ver</button>
                    <button onClick={() => onReceipt(sale, "print", "sales")} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-2 text-xs"><Printer size={14} /> Imprimir</button>
                    <button onClick={() => onReceipt(sale, "pdf", "sales")} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-2 text-xs"><Download size={14} /> PDF</button>
                    {canDeleteHistory(role) && <button onClick={() => onDelete(sale, "sales")} className="inline-flex items-center gap-1 rounded-md border border-red-900 px-2 py-2 text-xs text-red-200"><Trash2 size={14} /> Apagar</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!filteredSales.length && <tr><td colSpan={canSeeProfit(role) ? 10 : 9} className="py-8 text-center text-neutral-500">Nenhuma venda encontrada.</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function UnpaidBalancesModal({ sales, role, onPaymentChange, onReceipt, onDelete, onClose }) {
  const [search, setSearch] = useState("");
  const [selectedBuyer, setSelectedBuyer] = useState("");
  const buyerSuggestions = uniqueSuggestions(sales
    .filter((sale) => hasOutstandingPayment(sale.payment_status))
    .map((sale) => sale.buyer_name));
  const unpaidSales = sales
    .filter((sale) => hasOutstandingPayment(sale.payment_status) && String(sale.buyer_name || "").trim())
    .filter((sale) => !search || normalize(sale.buyer_name).includes(normalize(search)));
  const grouped = unpaidSales.reduce((acc, sale) => {
    const buyerName = String(sale.buyer_name || "").trim();
    const key = normalize(buyerName);
    if (!acc[key]) acc[key] = { buyerName, total: 0, count: 0, sales: [] };
    acc[key].total += saleTotal(sale);
    acc[key].count += 1;
    acc[key].sales.push(sale);
    return acc;
  }, {});
  const buyers = Object.values(grouped).sort((a, b) => b.total - a.total);
  const selected = selectedBuyer
    ? grouped[selectedBuyer]
    : buyers[0];
  const selectedKey = selected ? normalize(selected.buyerName) : "";

  useEffect(() => {
    if (selectedBuyer && !grouped[selectedBuyer]) setSelectedBuyer("");
  }, [selectedBuyer, buyers.length]);

  return (
    <Modal title="Compras pendentes" onClose={onClose}>
      <div className="mb-4 max-w-md">
        <label className="text-sm text-neutral-300">Comprador
          <AutocompleteTextInput value={search} onChange={setSearch} suggestions={buyerSuggestions} placeholder="Pesquisar comprador" />
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-lg border border-neutral-800 bg-neutral-900">
          <div className="border-b border-neutral-800 p-4">
            <p className="text-sm text-neutral-400">Compradores com saldo negativo</p>
            <p className="mt-1 text-xl font-semibold">{buyers.length}</p>
          </div>
          <div className="max-h-[58vh] overflow-y-auto">
            {buyers.map((buyer) => {
              const key = normalize(buyer.buyerName);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedBuyer(key)}
                  className={`block w-full border-b border-neutral-800 px-4 py-3 text-left hover:bg-black ${selectedKey === key ? "bg-black" : ""}`}
                >
                  <span className="block font-semibold">{buyer.buyerName}</span>
                  <span className="mt-1 block text-sm text-neutral-400">{buyer.count} compra(s) - {money(buyer.total)}</span>
                </button>
              );
            })}
            {!buyers.length && <p className="px-4 py-8 text-center text-neutral-500">Nenhuma compra pendente encontrada.</p>}
          </div>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          {selected ? (
            <>
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{selected.buyerName}</h3>
                  <p className="text-sm text-neutral-400">{selected.count} compra(s) em aberto</p>
                </div>
                <div className="rounded-md bg-black px-3 py-2 text-right">
                  <p className="text-xs text-neutral-500">Total em aberto</p>
                  <p className="text-xl font-semibold">{money(selected.total)}</p>
                </div>
              </div>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-neutral-400">
                    <tr>
                      <th>Data</th>
                      <th>Produto</th>
                      <th>Empresa</th>
                      <th>Qtd.</th>
                      <th>Total</th>
                      <th>Pagamento</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.sales.map((sale) => (
                      <tr key={sale.id} className="border-t border-neutral-800">
                        <td className="py-3">{sale.created_at ? new Date(sale.created_at).toLocaleString("pt-BR") : "-"}</td>
                        <td>{sale.product_name}</td>
                        <td>{sale.company_name}</td>
                        <td>{sale.quantity}</td>
                        <td>{money(saleTotal(sale))}</td>
                        <td>{paymentStatusLabel(sale.payment_status)}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => onReceipt(sale, "view", "unpaidBalances")} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-2 text-xs"><Eye size={14} /> Ver</button>
                            {(sale.payment_status || "unpaid") !== "partial" && <button onClick={() => onPaymentChange(sale, "partial")} className="rounded-md border border-amber-700 px-2 py-2 text-xs text-amber-100">Marcar parcial</button>}
                            <button onClick={() => onPaymentChange(sale, "paid")} className="rounded-md border border-emerald-800 px-2 py-2 text-xs text-emerald-200">Marcar pago</button>
                            {canDeleteHistory(role) && <button onClick={() => onDelete(sale, "unpaidBalances")} className="inline-flex items-center gap-1 rounded-md border border-red-900 px-2 py-2 text-xs text-red-200"><Trash2 size={14} /> Apagar</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="py-12 text-center text-neutral-500">Selecione um comprador para ver a lista de compras.</p>
          )}
        </section>
      </div>
    </Modal>
  );
}

function UndeliveredProductsModal({ sales, products, items, companies, users, currentUser, saving, onSave, onDeleteSale, onDeleteItem, onClose }) {
  const sellerName = currentUser?.full_name || currentUser?.username || "";
  const [form, setForm] = useState({ ...emptyUndeliveredProduct, company_id: companies[0]?.id || "", seller_name: sellerName });
  const [search, setSearch] = useState("");
  const productSuggestions = uniqueSuggestions([
    ...products.map((product) => product.name),
    ...sales.filter((sale) => sale.stock_exceeded).map((sale) => sale.product_name),
    ...items.map((item) => item.product_name)
  ]);
  const sellerSuggestions = uniqueSuggestions([
    ...users.map((user) => user.full_name || user.username),
    ...sales.map((sale) => sale.seller_name),
    ...items.map((item) => item.seller_name)
  ]);
  const saleEntries = sales
    .filter((sale) => sale.stock_exceeded)
    .map((sale) => ({
      id: `sale-${sale.id}`,
      source: "Venda acima do estoque",
      product_name: sale.product_name,
      company_id: sale.company_id,
      company_name: sale.company_name,
      location: sale.company_name || "-",
      seller_name: sale.seller_name,
      sale_price: saleTotal(sale),
      payment_status: sale.payment_status,
      created_at: sale.created_at,
      source_type: "sale",
      sale
    }));
  const saleProductIds = new Set(sales.filter((sale) => sale.stock_exceeded).map((sale) => sale.product_id));
  const negativeStockEntries = products
    .filter((product) => !saleProductIds.has(product.id))
    .map((product) => ({
      id: `stock-${product.id}`,
      source: "Estoque negativo",
      product_name: product.name,
      company_id: product.company_id,
      company_name: product.company_name || companyName(companies, product.company_id),
      location: product.stock_position || product.company_name || companyName(companies, product.company_id),
      seller_name: "-",
      sale_price: 0,
      payment_status: "unpaid",
      created_at: product.updated_at || product.created_at,
      source_type: "stock"
    }));
  const manualEntries = items.map((item) => ({ ...item, source: "Cadastro manual", source_type: "manual" }));
  const rows = [...saleEntries, ...negativeStockEntries, ...manualEntries]
    .filter((item) => !search || normalize(item.product_name).includes(normalize(search)) || normalize(item.seller_name).includes(normalize(search)) || normalize(item.location).includes(normalize(search)))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    onSave(form);
    setForm({ ...emptyUndeliveredProduct, company_id: form.company_id, seller_name: sellerName });
  }

  return (
    <Modal title="Produtos não entregues" onClose={onClose}>
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="text-lg font-semibold">Cadastrar produto a entregar</h3>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-neutral-300">Produto
              <AutocompleteTextInput value={form.product_name} onChange={(product_name) => updateField("product_name", product_name)} suggestions={productSuggestions} placeholder="Nome do produto" required />
            </label>
            <Field label="Onde ele está" value={form.location} onChange={(location) => updateField("location", location)} required />
            <label className="text-sm text-neutral-300">Empresa
              <select value={form.company_id} onChange={(event) => updateField("company_id", event.target.value)} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3" required>
                <option value="">Selecione</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-neutral-300">Vendedor
              <AutocompleteTextInput value={form.seller_name} onChange={(seller_name) => updateField("seller_name", seller_name)} suggestions={sellerSuggestions} placeholder="Nome do vendedor" required />
            </label>
            <Field label="Valor da venda" type="number" value={form.sale_price} onChange={(sale_price) => updateField("sale_price", sale_price)} required />
            <label className="mt-4 text-sm text-neutral-300">Pagamento
              <select value={form.payment_status} onChange={(event) => updateField("payment_status", event.target.value)} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3" required>
                {PAYMENT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <button disabled={saving} onClick={submit} className="mt-5 rounded-md bg-white px-5 py-3 font-semibold text-black disabled:opacity-60">{saving ? "Salvando..." : "Cadastrar"}</button>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h3 className="text-lg font-semibold">Pendências</h3>
            <SearchBox value={search} onChange={setSearch} placeholder="Pesquisar" />
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-neutral-400">
                <tr>
                  <th>Produto</th>
                  <th>Onde está</th>
                  <th>Empresa</th>
                  <th>Vendedor</th>
                  <th>Pagamento</th>
                  <th>Valor da venda</th>
                  <th>Origem</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className="border-t border-neutral-800">
                    <td className="py-3">{item.product_name}</td>
                    <td>{item.location || "-"}</td>
                    <td>{item.company_name || companyName(companies, item.company_id)}</td>
                    <td>{item.seller_name || "-"}</td>
                    <td>{paymentStatusLabel(item.payment_status)}</td>
                    <td>{item.sale_price ? money(item.sale_price) : "-"}</td>
                    <td>{item.source}</td>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : "-"}</td>
                    <td>
                      {item.source_type === "sale" && <button onClick={() => onDeleteSale(item.sale, "undeliveredProducts")} className="inline-flex items-center gap-1 rounded-md border border-red-900 px-2 py-2 text-xs text-red-200"><Trash2 size={14} /> Apagar</button>}
                      {item.source_type === "manual" && <button onClick={() => onDeleteItem(item)} className="inline-flex items-center gap-1 rounded-md border border-red-900 px-2 py-2 text-xs text-red-200"><Trash2 size={14} /> Apagar</button>}
                      {item.source_type === "stock" && <span className="text-xs text-neutral-500">-</span>}
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={10} className="py-8 text-center text-neutral-500">Nenhum produto não entregue encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Modal>
  );
}
function ProfitModal({ sales, companies, role, filters, setFilters, onReceipt, onDelete, onClose }) {
  const [realProfitCommissionPercent, setRealProfitCommissionPercent] = useState("");
  const [totalProfitCommissionPercent, setTotalProfitCommissionPercent] = useState("");
  const sellerSuggestions = uniqueSuggestions(sales.map((sale) => sale.seller_name));
  const filteredSales = sales.filter((sale) => {
    const date = new Date(sale.created_at);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const year = String(date.getFullYear());
    return (!filters.day || filters.day === day)
      && (!filters.month || filters.month === month)
      && (!filters.hour || filters.hour === hour)
      && (!filters.year || filters.year === year)
      && (!filters.company_id || filters.company_id === sale.company_id)
      && (!filters.seller_name || normalize(sale.seller_name).includes(normalize(filters.seller_name)))
      && (!filters.buyer_name || normalize(sale.buyer_name).includes(normalize(filters.buyer_name)))
      && (!filters.product_name || normalize(sale.product_name).includes(normalize(filters.product_name)))
      && (!filters.payment_status || (sale.payment_status || "unpaid") === filters.payment_status);
  });
  const totals = filteredSales.reduce((acc, sale) => {
    acc.buy += Number(sale.purchase_price_snapshot || 0) * Number(sale.quantity || 0);
    acc.sell += Number(sale.sale_price || 0) * Number(sale.quantity || 0);
    acc.qty += Number(sale.quantity || 0);
    return acc;
  }, { buy: 0, sell: 0, qty: 0 });
  const profit = totals.sell - totals.buy;
  const realProfit = profit;
  const parsedRealProfitCommissionPercent = Number(String(realProfitCommissionPercent || "0").replace(",", "."));
  const realProfitCommissionPercentValue = Number.isFinite(parsedRealProfitCommissionPercent) && parsedRealProfitCommissionPercent > 0 ? parsedRealProfitCommissionPercent : 0;
  const parsedTotalProfitCommissionPercent = Number(String(totalProfitCommissionPercent || "0").replace(",", "."));
  const totalProfitCommissionPercentValue = Number.isFinite(parsedTotalProfitCommissionPercent) && parsedTotalProfitCommissionPercent > 0 ? parsedTotalProfitCommissionPercent : 0;
  const realProfitCommissionValue = realProfit * (realProfitCommissionPercentValue / 100);
  const totalProfitCommissionValue = totals.sell * (totalProfitCommissionPercentValue / 100);
  const profitAfterRealCommission = realProfit - realProfitCommissionValue;
  const profitAfterTotalCommission = realProfit - totalProfitCommissionValue;
  const chartData = [{ name: "Relatório", compra: totals.buy, lucro: profit, lucroReal: realProfit }];

  function exportExcel() {
    const rows = filteredSales.map((sale) => ({
      Produto: sale.product_name,
      Loja: sale.company_name,
      Vendedor: sale.seller_name,
      Comprador: sale.buyer_name || "",
      Pagamento: paymentStatusLabel(sale.payment_status),
      Quantidade: roundToTwo(sale.quantity),
      "Compra do Estoque": roundToTwo(Number(sale.purchase_price_snapshot || 0) * Number(sale.quantity || 0)),
      "Valor da Venda": roundToTwo(Number(sale.sale_price || 0) * Number(sale.quantity || 0)),
      Lucro: roundToTwo(saleProfit(sale)),
      "Comissão lucro real (%)": roundToTwo(realProfitCommissionPercentValue),
      "Comissão sobre lucro real": roundToTwo(saleProfit(sale) * (realProfitCommissionPercentValue / 100)),
      "Comissão lucro total (%)": roundToTwo(totalProfitCommissionPercentValue),
      "Comissão sobre lucro total": roundToTwo((Number(sale.sale_price || 0) * Number(sale.quantity || 0)) * (totalProfitCommissionPercentValue / 100)),
      "Lucro Real": roundToTwo(saleProfit(sale)),
      Data: new Date(sale.created_at).toLocaleString("pt-BR")
    }));
    downloadCsv(rows, `relatorio-estoque-${filters.year || "todos"}.csv`);
  }

  return (
    <Modal title="Lucro" onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Filter label="Dia" value={filters.day} onChange={(day) => setFilters({ ...filters, day })} placeholder="01" />
        <Filter label="Mês" value={filters.month} onChange={(month) => setFilters({ ...filters, month })} placeholder="05" />
        <Filter label="Hora" value={filters.hour} onChange={(hour) => setFilters({ ...filters, hour })} placeholder="14" />
        <Filter label="Ano" value={filters.year} onChange={(year) => setFilters({ ...filters, year })} placeholder="2026" />
        <label className="text-sm text-neutral-300">Loja
          <select value={filters.company_id} onChange={(e) => setFilters({ ...filters, company_id: e.target.value })} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3">
            <option value="">Todas</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-neutral-300">Vendedor
          <AutocompleteTextInput value={filters.seller_name} onChange={(seller_name) => setFilters({ ...filters, seller_name })} suggestions={sellerSuggestions} placeholder="Todos os vendedores" />
          <button type="button" onClick={() => setFilters({ ...filters, seller_name: "" })} className="mt-2 rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-200">Todos os vendedores</button>
        </label>
        <Filter label="Produto" value={filters.product_name} onChange={(product_name) => setFilters({ ...filters, product_name })} />
        <Filter label="Comprador" value={filters.buyer_name} onChange={(buyer_name) => setFilters({ ...filters, buyer_name })} />
        <label className="text-sm text-neutral-300">Pagamento
          <select value={filters.payment_status} onChange={(event) => setFilters({ ...filters, payment_status: event.target.value })} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3">
            <option value="">Todos</option>
            {PAYMENT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <Filter label="Comissão do funcionário (%) (lucro real)" value={realProfitCommissionPercent} onChange={setRealProfitCommissionPercent} placeholder="10" />
        <Filter label="Comissão do funcionário (%) (lucro total)" value={totalProfitCommissionPercent} onChange={setTotalProfitCommissionPercent} placeholder="10" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3 lg:grid-cols-7">
        <Metric label="Compra do Estoque" value={money(totals.buy)} />
        <Metric label="Valor da Venda" value={money(totals.sell)} />
        <Metric label="Lucro" value={money(profit)} />
        <Metric label="Comissão lucro real" value={money(realProfitCommissionValue)} />
        <Metric label="Comissão lucro total" value={money(totalProfitCommissionValue)} />
        <Metric label="Lucro após comissão real" value={money(profitAfterRealCommission)} />
        <Metric label="Lucro após comissão total" value={money(profitAfterTotalCommission)} />
        <Metric label="Lucro Real" value={money(realProfit)} />
        <Metric label="Quantidade vendida" value={totals.qty} />
      </div>
      <div className="mt-5 h-72 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid stroke="#262626" />
            <XAxis dataKey="name" stroke="#a3a3a3" />
            <YAxis stroke="#a3a3a3" />
            <Tooltip formatter={(value) => money(value)} />
            <Legend />
            <Bar dataKey="lucro" name="Lucro" fill="#22c55e" />
            <Bar dataKey="compra" name="Compra do Estoque" fill="#ffffff" />
            <Bar dataKey="lucroReal" name="Lucro Real" fill="#737373" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <button onClick={exportExcel} className="mt-5 inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 font-semibold text-black">
        <Download size={18} /> Exportar CSV
      </button>
      <div className="mt-5 overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="text-left text-neutral-400"><tr><th>Produto</th><th>Loja</th><th>Vendedor</th><th>Comprador</th><th>Pagamento</th><th>Qtd.</th><th>Compra do Estoque</th><th>Valor da Venda</th><th>Lucro Real</th><th>Data</th><th>Ações</th></tr></thead>
          <tbody>{filteredSales.map((sale) => {
            const buy = Number(sale.purchase_price_snapshot || 0) * Number(sale.quantity || 0);
            const sell = Number(sale.sale_price || 0) * Number(sale.quantity || 0);
            return <tr key={sale.id} className="border-t border-neutral-900"><td className="py-3">{sale.product_name}</td><td>{sale.company_name}</td><td>{sale.seller_name}</td><td>{sale.buyer_name || "-"}</td><td>{paymentStatusLabel(sale.payment_status)}</td><td>{sale.quantity}</td><td>{money(buy)}</td><td>{money(sell)}</td><td>{money(sell - buy)}</td><td>{new Date(sale.created_at).toLocaleString("pt-BR")}</td><td><div className="flex flex-wrap gap-2"><button onClick={() => onReceipt(sale)} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-2 text-xs"><FileText size={14} /> Ver Recibo</button>{canDeleteHistory(role) && <button onClick={() => onDelete(sale, "profit")} className="inline-flex items-center gap-1 rounded-md border border-red-900 px-2 py-2 text-xs text-red-200"><Trash2 size={14} /> Apagar</button>}</div></td></tr>;
          })}</tbody>
        </table>
      </div>
    </Modal>
  );
}

function Filter({ label, value, onChange, placeholder }) {
  return (
    <label className="text-sm text-neutral-300">{label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3" />
    </label>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"><p className="text-sm text-neutral-400">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>;
}

function UserModal({ initial, companies, userCompanies, managerMode, saving, onClose, onSave }) {
  const linkedCompanyIds = initial?.id ? linkedCompanyIdsFor(initial, userCompanies) : [];
  const initialCompanyIds = initial?.company_ids || linkedCompanyIds;
  const [form, setForm] = useState({
    ...emptyUser,
    ...initial,
    password: "",
    company_ids: initialCompanyIds,
    company_id: initialCompanyIds[0] || initial?.company_id || ""
  });

  function setCompanyIds(companyIds) {
    setForm({ ...form, company_ids: companyIds, company_id: companyIds[0] || "" });
  }

  return (
    <Modal title={form.id ? "Editar usuário" : "Cadastrar usuário"} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome" value={form.full_name || ""} onChange={(full_name) => setForm({ ...form, full_name })} required disabled={managerMode} />
        {!managerMode && <Field label={form.id ? "Nova senha" : "Senha"} type="password" value={form.password || ""} onChange={(password) => setForm({ ...form, password })} required={!form.id} />}
        <Field label="Permissão">
          <select disabled={managerMode} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3 disabled:opacity-60">
            {ROLE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
      </div>
      <CompanyMultiSelect companies={companies} selectedIds={form.company_ids || []} onChange={setCompanyIds} />
      {!managerMode && (
        <label className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={form.active !== false} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          Usuário ativo
        </label>
      )}
      <button disabled={saving} onClick={() => onSave(form)} className="mt-5 rounded-md bg-white px-5 py-3 font-semibold text-black disabled:opacity-60">{saving ? "Salvando..." : "Salvar usuário"}</button>
    </Modal>
  );
}

function CompanyMultiSelect({ companies, selectedIds, onChange }) {
  const [search, setSearch] = useState("");
  const selectedCompanies = companies.filter((company) => selectedIds.includes(company.id));
  const suggestions = companies
    .filter((company) => !selectedIds.includes(company.id))
    .filter((company) => normalize(company.name).includes(normalize(search)))
    .slice(0, 8);

  function addCompany(company) {
    onChange([...selectedIds, company.id]);
    setSearch("");
  }

  return (
    <div className="mt-4">
      <span className="text-sm text-neutral-300">Empresas vinculadas</span>
      <div className="mt-2 rounded-md border border-neutral-700 bg-neutral-950 p-2">
        <div className="flex flex-wrap gap-2">
          {selectedCompanies.map((company) => (
            <span key={company.id} className="inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-sm text-black">
              {company.name}
              <button type="button" onClick={() => onChange(selectedIds.filter((idValue) => idValue !== company.id))} className="font-semibold" title="Remover empresa">x</button>
            </span>
          ))}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar empresa pelo nome"
            className="min-w-64 flex-1 bg-transparent px-1 py-1 outline-none"
          />
        </div>
        {search && (
          <div className="mt-2 overflow-hidden rounded-md border border-neutral-800">
            {suggestions.map((company) => (
              <button
                key={company.id}
                type="button"
                onClick={() => addCompany(company)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-black hover:text-white"
              >
                {company.name}
              </button>
            ))}
            {!suggestions.length && <p className="px-3 py-2 text-sm text-neutral-500">Nenhuma empresa encontrada.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function UsersModal({ users, companies, userCompanies, managerMode, onEdit, onSave, onDelete, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = users.filter((user) => normalize(user.full_name || user.username).includes(normalize(search)));
  return (
    <Modal title={managerMode ? "Funcionários vinculados" : "Usuários Cadastrados"} onClose={onClose}>
      <div className="mb-4 max-w-md"><SearchBox value={search} onChange={setSearch} placeholder="Pesquisar usuário" /></div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-neutral-400"><tr><th>Nome</th><th>Usuário</th><th>Permissão</th><th>Empresa</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.id} className="border-t border-neutral-900">
                <td className="py-3">{user.full_name || "-"}</td>
                <td>{user.username || "-"}</td>
                <td>{roleLabel(user.role)}</td>
                <td>{linkedCompanyIdsFor(user, userCompanies).map((companyId) => companyName(companies, companyId)).join(", ") || "-"}</td>
                <td>{user.active === false ? "Inativo" : "Ativo"}</td>
                <td>
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(user)} className="rounded-md border border-neutral-700 px-3 py-2 text-sm">Editar</button>
                    {!managerMode && <button onClick={() => onSave({ ...user, active: user.active === false, password: undefined })} className="rounded-md border border-neutral-700 px-3 py-2 text-sm">{user.active === false ? "Reativar" : "Inativar"}</button>}
                    {!managerMode && user.role !== ROLES.OWNER && <button onClick={() => onDelete(user)} className="rounded-md border border-red-900 px-3 py-2 text-sm text-red-200"><Trash2 size={15} /></button>}
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={6} className="py-8 text-center text-neutral-500">Nenhum usuário encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}




















