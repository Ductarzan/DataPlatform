import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Bangkok";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DASHBOARD_CONFIGS = {
  undergrad: {
    sheetId: process.env.GOOGLE_SHEET_ID,
    sheetName: process.env.GOOGLE_SHEET_NAME || "CRM",
    sheetRange: process.env.GOOGLE_SHEET_RANGE || "A4:O",
  },
  postgrad: {
    sheetId: process.env.POSTGRAD_GOOGLE_SHEET_ID,
    sheetName: process.env.POSTGRAD_GOOGLE_SHEET_NAME || "CRM VN",
    sheetRange: process.env.POSTGRAD_GOOGLE_SHEET_RANGE || "A8:H",
  },
};

const FACEBOOK_CONFIG = {
  pageId: process.env.FB_PAGE_ID || "",
  appId: process.env.FB_APP_ID || "",
  appName: process.env.FB_APP_NAME || "",
  userId: process.env.FB_USER_ID || "",
  userName: process.env.FB_USER_NAME || "",
  tokenExpiresAt: Number(process.env.FB_TOKEN_EXPIRES_AT || 0),
  dataAccessExpiresAt: Number(process.env.FB_DATA_ACCESS_EXPIRES_AT || 0),
};

app.use(express.static(path.join(__dirname, "public")));

function normalizeHeader(value) {
  return (value || "")
    .toString()
    .replace(/[\u0111\u0110]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value).trim();

  const parsedNative = new Date(raw);
  if (!Number.isNaN(parsedNative.getTime())) return parsedNative;

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const p1 = Number(match[1]);
    const p2 = Number(match[2]);
    const year = Number(match[3]);
    const hh = Number(match[4] || 0);
    const mm = Number(match[5] || 0);
    const ss = Number(match[6] || 0);

    // Default heuristic for legacy UG data (mixed mm/dd and dd/mm).
    const day = p1 > 12 ? p1 : p2;
    const month = p1 > 12 ? p2 : p1;
    const d = new Date(year, month - 1, day, hh, mm, ss);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function parseDateDMY(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const hh = Number(match[4] || 0);
    const mm = Number(match[5] || 0);
    const ss = Number(match[6] || 0);
    const d = new Date(year, month - 1, day, hh, mm, ss);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const parsedNative = new Date(raw);
  if (!Number.isNaN(parsedNative.getTime())) return parsedNative;
  return null;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

const zonedDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getZonedDateKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  const parts = zonedDateFormatter.formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

function dateFromKeyUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDaysToKey(key, offsetDays) {
  const d = dateFromKeyUtc(key);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function getIsoWeekFromKey(key) {
  const d = dateFromKeyUtc(key);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getIsoWeekStartKey(key) {
  const d = dateFromKeyUtc(key);
  const dayOfWeek = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dayOfWeek + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function foldText(value) {
  return (value || "")
    .toString()
    .replace(/[\u0111\u0110]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeStatus(rawStatus) {
  const base = (rawStatus || "").trim();
  const key = foldText(base);
  if (!key) return "Chưa liên hệ";

  if (key === "lead trung" || key === "leads trung") return "Lead trùng";
  if (key === "khong nghe may" || key === "chua nghe may" || key === "chua nghe") return "Không nghe máy";
  if (key === "dang tham khao" || key === "dang tham khao, cham soc sau") return "Đang tham khảo";
  if (key === "chua phan loai" || key === "chua lien he") return "Chưa liên hệ";

  return base;
}

function normalizeMajor(rawMajor) {
  const base = (rawMajor || "").trim();
  const key = foldText(base);
  if (!key) return "Khac";

  const normalizedKey = key.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const internationalMajorKeys = new Set([
    "international business",
    "english language",
    "informatics and computer engineering",
    "management information system",
    "management",
    "accounting analyzing and auditing",
    "marketing dual degree",
    "business data analytics",
  ]);

  if (
    internationalMajorKeys.has(normalizedKey) ||
    normalizedKey.includes("international business") ||
    normalizedKey.includes("english language") ||
    normalizedKey.includes("informatics and computer engineering") ||
    normalizedKey.includes("management information system") ||
    normalizedKey.includes("accounting analyzing and auditing") ||
    normalizedKey.includes("marketing dual degree") ||
    normalizedKey.includes("business data analytics")
  ) {
    return "Tuyển sinh quốc tế";
  }
  return base;
}

function normalizeAdmissionMethod(rawMethod) {
  const base = (rawMethod || "").trim();
  const key = foldText(base).replace(/_/g, " ");
  if (!key) return "Chua phan loai";

  if (
    key.includes("chung chi tieng anh quoc te ket hop ket qua ky thi tot nghiep thpt") ||
    key === "xt cc ielts/toefl ket hop hoc ba/hsa/diem thi"
  ) {
    return "Xét tuyển chứng chỉ tiếng Anh quốc tế + IELTS/TOEFL kết hợp";
  }
  if (key === "xet tuyen diem thi hsa" || key.includes("danh gia nang luc hoc sinh thpt do dhqghn to chuc")) {
    return "Xét tuyển điểm thi HSA/ĐGNL ĐHQGHN";
  }
  if (key === "xt thang/ uu tien xt" || key.includes("xet tuyen thang theo dieu 8")) {
    return "Xét tuyển thẳng/Ưu tiên xét tuyển";
  }
  if (
    key === "xet tuyen diem thi tn thpt" ||
    key === "xet tuyen theo ket qua ky thi tot nghiep thpt nam 2026" ||
    key === "xet tuyen diem thi tot nghiep thpt"
  ) {
    return "Xét tuyển điểm thi TN THPT";
  }
  if (key === "xet tuyen hoc ba thpt") return "Xét tuyển học bạ THPT";
  if (key === "pt khac: a-level/thi sinh quoc te") return "PT Khác: A-Level/Thí sinh quốc tế";
  if (key === "chua phan loai") return "Chua phan loai";

  return base;
}

function normalizePostgradMajor(rawMajor) {
  const base = (rawMajor || "").trim();
  const key = foldText(base);
  if (!key || key === "khac") return "Khác";

  if (
    key.includes("kinh doanh quoc te") ||
    key === "mib"
  ) {
    return "Thạc sĩ Kinh doanh quốc tế (MIB)";
  }
  if (
    key.includes("nghien cuu va tac nghiep marketing") ||
    key === "meam"
  ) {
    return "Thạc sĩ Nghiên cứu và Tác nghiệp Marketing (MEAM)";
  }
  if (
    key.includes("tin hoc va ki thuat may tinh") ||
    key.includes("tin hoc va ky thuat may tinh") ||
    key === "mice"
  ) {
    return "Thạc sĩ Tin học và Kỹ thuật máy tính (MICE)";
  }
  if (
    key.includes("quan tri tai chinh") ||
    key === "mfm"
  ) {
    return "Thạc sĩ Quản trị Tài chính (MFM)";
  }
  if (
    key.includes("cong nghe ki thuat y sinh") ||
    key.includes("cong nghe ky thuat y sinh") ||
    key === "mbet"
  ) {
    return "Thạc sĩ Công nghệ kỹ thuật y sinh (MBET)";
  }
  if (
    key.includes("he thong thong minh") ||
    key.includes("da phuong tien") ||
    key.includes("(sim)") ||
    key === "sim" ||
    key === "dice"
  ) {
    return "Thạc sĩ CNTT - Hệ thống thông minh & Đa phương tiện (SIM)";
  }
  if (
    (key.includes("ngan hang") && key.includes("tai chinh")) ||
    key === "fintech"
  ) {
    return "Thạc sĩ Ngân hàng, Tài chính và Công nghệ tài chính (FINTECH)";
  }
  if (
    key.includes("tien si") && key.includes("kinh te") ||
    key === "dem"
  ) {
    return "Tiến sĩ Kinh tế và Quản lý (DEM)";
  }

  return base;
}

function normalizePostgradBachelorMajor(rawMajor) {
  const base = (rawMajor || "").trim();
  const key = foldText(base);
  if (!key || key === "khac") return "Khác";

  if (
    key.includes("quan tri kinh doanh quoc te") ||
    key.includes("kinh doanh quoc te") ||
    key.includes("international business")
  ) {
    return "Kinh doanh quốc tế";
  }

  if (
    key === "qtkd" ||
    key.includes("quan tri kinh doanh") ||
    key.includes("bachelor of business administration")
  ) {
    return "Quản trị kinh doanh";
  }

  if (key.includes("marketing")) return "Marketing";

  if (
    key.includes("tai chinh ngan hang") ||
    key === "tai chinh" ||
    key.includes("tai chinh")
  ) {
    return "Tài chính - Ngân hàng";
  }

  if (key.includes("ngon ngu anh")) return "Ngôn ngữ Anh";

  if (
    key === "cntt" ||
    key.includes("cong nghe thong tin") ||
    key.includes("ky thuat phan mem") ||
    key.includes("he thong thong tin quan ly")
  ) {
    return "Công nghệ thông tin";
  }

  if (key.includes("dien tu vien thong")) return "Điện tử viễn thông";
  if (key.includes("ke toan")) return "Kế toán";
  if (key.includes("kinh te quoc te")) return "Kinh tế quốc tế";
  if (key.includes("luat")) return "Luật";

  return "Khác";
}

function normalizePostgradCertificate(rawCert) {
  const base = (rawCert || "").trim();
  const key = foldText(base);
  if (!key) return "Khác";

  if (key.includes("ielts")) return "IELTS";
  if (key.includes("toeic")) return "TOEIC";
  if (/(^|\\s)b1(\\s|$)/.test(key)) return "B1";
  if (/(^|\\s)b2(\\s|$)/.test(key)) return "B2";
  if (/(^|\\s)c1(\\s|$)/.test(key)) return "C1";

  return "Khác";
}

async function getSheetsClient() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    return google.sheets({ version: "v4", auth });
  }

  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

function buildRows(values) {
  if (!values || values.length < 2) return [];

  const headers = values[0].map(normalizeHeader);
  const dataRows = values.slice(1);

  return dataRows
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx] || "";
      });
      return obj;
    });
}

async function getLeadSheetConfigs(sheetsClient, spreadsheetId) {
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(title))" });
  const sheetTitles = (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean);
  if (sheetTitles.length === 0) return [];

  const probeRanges = sheetTitles.map((title) => `${title}!A1:Z20`);
  const probeResp = await sheetsClient.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: probeRanges,
    majorDimension: "ROWS",
  });

  function colIndexToLetter(index) {
    let num = index + 1;
    let letters = "";
    while (num > 0) {
      const rem = (num - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      num = Math.floor((num - 1) / 26);
    }
    return letters;
  }

  const leadSheetConfigs = [];
  for (const item of probeResp.data.valueRanges || []) {
    const range = item.range || "";
    const title = range.split("!")[0].replace(/^'/, "").replace(/'$/, "");
    const rows = item.values || [];

    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c += 1) {
        const h = normalizeHeader(row[c]);
        if (h === "created_time" || h === "time") {
          const headerMap = {};
          row.forEach((cell, idx) => {
            headerMap[normalizeHeader(cell)] = idx;
          });
          leadSheetConfigs.push({
            title,
            colLetter: colIndexToLetter(c),
            startRow: r + 2,
            headerRow: r + 1,
            columns: {
              email: headerMap.email,
              phone: headerMap["so dien thoai"],
              name: headerMap["ten"],
            },
          });
          r = rows.length;
          break;
        }
      }
    }
  }
  return leadSheetConfigs;
}

async function buildLeadSourcesBySheet(sheetsClient, spreadsheetId) {
  const leadSheetConfigs = await getLeadSheetConfigs(sheetsClient, spreadsheetId);
  if (leadSheetConfigs.length === 0) return [];

  const dataRanges = leadSheetConfigs.map((cfg) => `${cfg.title}!${cfg.colLetter}${cfg.startRow}:${cfg.colLetter}`);
  const dataResp = await sheetsClient.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: dataRanges,
    majorDimension: "ROWS",
  });

  const result = [];
  for (const item of dataResp.data.valueRanges || []) {
    const range = item.range || "";
    const title = range.split("!")[0].replace(/^'/, "").replace(/'$/, "");
    const values = item.values || [];
    const leads = values.filter((r) => String((r && r[0]) || "").trim() !== "").length;
    result.push({ name: title, leads });
  }

  return result.sort((a, b) => b.leads - a.leads);
}

function normEmail(v) {
  return foldText(v).replace(/\s+/g, "");
}

function normPhone(v) {
  return String(v || "").replace(/\D/g, "");
}

function normName(v) {
  return foldText(v).replace(/\s+/g, " ").trim();
}

function unixToIso(unixTs) {
  if (!unixTs || Number.isNaN(unixTs)) return null;
  return new Date(unixTs * 1000).toISOString();
}

async function graphApi(path, token, params = {}) {
  const baseUrl = `https://graph.facebook.com/v20.0/${path}`;
  const qs = new URLSearchParams({ access_token: token, ...params });
  const res = await fetch(`${baseUrl}?${qs.toString()}`);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Graph API request failed: ${path}`);
  }
  return json;
}

async function fetchMediaDashboard(days = 30) {
  const token = process.env.FB_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Missing FB_ACCESS_TOKEN");
  }

  const page = await graphApi(FACEBOOK_CONFIG.pageId, token, {
    fields: "name,fan_count,followers_count,engagement",
  });

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceSec = Math.floor(startOfDay(since).getTime() / 1000);
  const untilSec = Math.floor(Date.now() / 1000);

  const impressions = await graphApi(`${FACEBOOK_CONFIG.pageId}/insights/page_impressions_unique`, token, {
    period: "day",
    since: String(sinceSec),
    until: String(untilSec),
  });

  let engagedUsers = { data: [{ values: [] }] };
  try {
    engagedUsers = await graphApi(`${FACEBOOK_CONFIG.pageId}/insights/page_engaged_users`, token, {
      period: "day",
      since: String(sinceSec),
      until: String(untilSec),
    });
  } catch (_e) {
    try {
      engagedUsers = await graphApi(`${FACEBOOK_CONFIG.pageId}/insights/page_post_engagements`, token, {
        period: "day",
        since: String(sinceSec),
        until: String(untilSec),
      });
    } catch (_e2) {
      engagedUsers = { data: [{ values: [] }] };
    }
  }

  let adAccounts = { data: [] };
  try {
    adAccounts = await graphApi("me/adaccounts", token, {
      fields: "id,name,account_status,currency,amount_spent,balance",
      limit: "25",
    });
  } catch (_e) {
    adAccounts = { data: [] };
  }

  let posts = { data: [] };
  try {
    posts = await graphApi(`${FACEBOOK_CONFIG.pageId}/posts`, token, {
      fields: "id,message,created_time,permalink_url",
      since: String(sinceSec),
      until: String(untilSec),
      limit: "50",
    });
  } catch (_e) {
    posts = { data: [] };
  }

  const impressionValues = impressions.data?.[0]?.values || [];
  const engagedValues = engagedUsers.data?.[0]?.values || [];
  const daily = impressionValues.map((x, idx) => ({
    date: String(x.end_time || "").slice(0, 10),
    impressions: Number(x.value || 0),
    engagedUsers: Number(engagedValues[idx]?.value || 0),
  }));

  const accountRows = (adAccounts.data || []).map((a) => ({
    name: a.name || a.id,
    leads: Number(a.amount_spent || 0), // reuse table renderer label
    raw: a,
  }));

  const totalSpent = accountRows.reduce((s, a) => s + a.leads, 0);
  const totalImpressions = daily.reduce((s, d) => s + d.impressions, 0);
  const totalEngaged = daily.reduce((s, d) => s + d.engagedUsers, 0);

  const postRows = [];
  for (const p of posts.data || []) {
    let detail = {};
    try {
      detail = await graphApi(p.id, token, {
        fields: "shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)",
      });
    } catch (_e) {
      detail = {};
    }

    const shares = Number(detail.shares?.count || 0);
    const comments = Number(detail.comments?.summary?.total_count || 0);
    const reactions = Number(detail.reactions?.summary?.total_count || 0);
    const engaged = shares + comments + reactions;

    postRows.push({
      id: p.id,
      createdTime: p.created_time,
      title: (p.message || "").split("\n")[0].slice(0, 90) || "(Không có nội dung)",
      permalink: p.permalink_url || "",
      engagedUsers: engaged,
      impressions: 0,
      engagementRate: 0,
      shares,
      comments,
      reactions,
    });
  }

  const topPosts = postRows
    .sort((a, b) => b.engagedUsers - a.engagedUsers)
    .slice(0, 10)
    .map((p) => ({
      name: `${p.title} (${new Date(p.createdTime).toLocaleDateString("vi-VN")})`,
      leads: p.engagedUsers,
      meta: p,
    }));

  const totalPostEngagement = postRows.reduce((s, p) => s + p.engagedUsers, 0);
  const avgEngagementRate = 0;

  return {
    summary: {
      pageName: page.name || "Fanpage",
      fanCount: Number(page.fan_count || 0),
      followersCount: Number(page.followers_count || 0),
      adAccountsCount: accountRows.length,
      totalSpent,
      totalImpressions,
      totalEngaged,
      totalPostEngagement,
      avgEngagementRate,
      postsCount: postRows.length,
    },
    series: { daily },
    breakdown: {
      adAccounts: (accountRows.length > 0 ? accountRows : [{ name: "Không truy cập được ad account bằng token hiện tại", leads: 0, raw: {} }])
        .sort((a, b) => b.leads - a.leads)
        .map((a) => ({ name: `${a.name} (${a.raw.currency || "N/A"})`, leads: a.leads })),
      topPosts,
    },
    tokenInfo: {
      appId: FACEBOOK_CONFIG.appId,
      appName: FACEBOOK_CONFIG.appName,
      pageId: FACEBOOK_CONFIG.pageId,
      userId: FACEBOOK_CONFIG.userId,
      userName: FACEBOOK_CONFIG.userName,
      tokenExpiresAt: unixToIso(FACEBOOK_CONFIG.tokenExpiresAt),
      dataAccessExpiresAt: unixToIso(FACEBOOK_CONFIG.dataAccessExpiresAt),
      isValid: true,
      scopes: [
        "catalog_management",
        "pages_show_list",
        "ads_management",
        "ads_read",
        "business_management",
        "pages_read_engagement",
        "public_profile",
      ],
    },
    generatedAt: new Date().toISOString(),
  };
}

async function buildCmrSourceAttribution(sheetsClient, spreadsheetId, crmRows, crmSheetName) {
  const configs = await getLeadSheetConfigs(sheetsClient, spreadsheetId);
  const sourceConfigs = configs.filter((c) => foldText(c.title) !== foldText(crmSheetName));
  if (sourceConfigs.length === 0) return [];

  const dataRanges = sourceConfigs.map((c) => `${c.title}!A${c.startRow}:Z`);
  const resp = await sheetsClient.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: dataRanges,
    majorDimension: "ROWS",
  });

  const phoneMap = new Map();
  const emailMap = new Map();
  const nameMap = new Map();

  function pushMap(mapObj, key, source) {
    if (!key) return;
    if (!mapObj.has(key)) mapObj.set(key, new Map());
    const bucket = mapObj.get(key);
    bucket.set(source, (bucket.get(source) || 0) + 1);
  }

  (resp.data.valueRanges || []).forEach((vr, i) => {
    const cfg = sourceConfigs[i];
    const source = cfg.title;
    const rows = vr.values || [];
    rows.forEach((r) => {
      const email = normEmail(r[cfg.columns.email]);
      const phone = normPhone(r[cfg.columns.phone]);
      const name = normName(r[cfg.columns.name]);
      pushMap(emailMap, email, source);
      pushMap(phoneMap, phone, source);
      pushMap(nameMap, name, source);
    });
  });

  const bySource = new Map();
  for (const row of crmRows) {
    const email = normEmail(row["email"]);
    const phone = normPhone(row["so dien thoai"]);
    const name = normName(row["ten"]);
    let winner = null;
    const pick = (m, k) => {
      if (!k || !m.has(k)) return null;
      const bucket = m.get(k);
      return Array.from(bucket.entries()).sort((a, b) => b[1] - a[1])[0][0];
    };
    winner = pick(phoneMap, phone) || pick(emailMap, email) || pick(nameMap, name) || "Chưa xác định";
    bySource.set(winner, (bySource.get(winner) || 0) + 1);
  }

  return Array.from(bySource.entries())
    .map(([name, leads]) => ({ name, leads }))
    .sort((a, b) => b.leads - a.leads);
}

function pickField(row, keys, fallback = "") {
  for (const key of keys) {
    if (row[key] !== undefined && String(row[key]).trim() !== "") return row[key];
  }
  return fallback;
}

function aggregatePostgrad(rows, sourceBreakdown, days = 30) {
  const now = new Date();
  const todayKey = getZonedDateKey(now);
  const byDate = new Map();
  const byMasterMajor = new Map();
  const byBachelorMajor = new Map();
  const byCertificate = new Map();
  const todayByMasterMajor = new Map();
  const firstSeenByMasterMajor = new Map();
  const recentLeads = [];

  let withPhone = 0;
  let withEmail = 0;
  let todayLeads = 0;
  let latestDate = null;

  for (const row of rows) {
    const createdRaw = pickField(row, ["time", "created_time"]);
    const created = parseDateDMY(createdRaw);
    const email = pickField(row, ["email"]);
    const phone = pickField(row, ["sdt", "so dien thoai"]);
    const bachelor = normalizePostgradBachelorMajor(pickField(row, ["nganh tot nghiep dh"], "Khac"));
    const cert = normalizePostgradCertificate(pickField(row, ["chung chi"], "Khac"));
    const master = normalizePostgradMajor(pickField(row, ["nganh hoc thac si quan tam"], "Khac"));

    if (String(email).trim() !== "") withEmail += 1;
    if (String(phone).replace(/\D/g, "") !== "") withPhone += 1;

    byMasterMajor.set(master, (byMasterMajor.get(master) || 0) + 1);
    byBachelorMajor.set(bachelor, (byBachelorMajor.get(bachelor) || 0) + 1);
    byCertificate.set(cert, (byCertificate.get(cert) || 0) + 1);

    if (created) {
      const key = getZonedDateKey(created);
      if (!key) continue;
      byDate.set(key, (byDate.get(key) || 0) + 1);
      if (key === todayKey) {
        todayLeads += 1;
        todayByMasterMajor.set(master, (todayByMasterMajor.get(master) || 0) + 1);
      }
      const firstSeen = firstSeenByMasterMajor.get(master);
      if (!firstSeen || key < firstSeen) firstSeenByMasterMajor.set(master, key);
      if (!latestDate || created > latestDate) latestDate = created;
    }

    recentLeads.push({
      time: createdRaw || "",
      hoVaTen: pickField(row, ["ho va ten", "ten"]),
      email: email || "",
      sdt: phone || "",
      nganhTotNghiepDh: bachelor || "",
      chungChi: cert || "",
      kinhNghiem: pickField(row, ["kinh nghiem"], ""),
      nganhQuanTam: master || "",
    });
  }

  const dailySeries = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = addDaysToKey(todayKey, -i);
    dailySeries.push({ date: key, leads: byDate.get(key) || 0 });
  }

  const sortTop = (m, limit = 20) =>
    Array.from(m.entries())
      .map(([name, leads]) => ({ name, leads }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, limit);

  const newMajorsToday = Array.from(todayByMasterMajor.entries())
    .filter(([major]) => {
      const firstSeen = firstSeenByMasterMajor.get(major);
      return firstSeen && firstSeen === todayKey;
    })
    .map(([name, leads]) => ({ name, leads }))
    .sort((a, b) => b.leads - a.leads);

  return {
    summary: {
      totalLeads: rows.length,
      withPhone,
      withEmail,
      todayLeads,
      latestUpdate: latestDate ? latestDate.toISOString() : null,
    },
    series: { daily: dailySeries },
    breakdown: {
      bySource: sourceBreakdown,
      byMasterMajor: sortTop(byMasterMajor, 15),
      byBachelorMajor: sortTop(byBachelorMajor, 12),
      byCertificate: sortTop(byCertificate, 12),
      todayFocus: {
        byMasterMajor: sortTop(todayByMasterMajor, 12),
        newMajorsToday,
      },
    },
    recentLeads: recentLeads.slice(0, 50),
    generatedAt: new Date().toISOString(),
  };
}

function aggregate(rows, days = 30) {
  const now = new Date();
  const todayKey = getZonedDateKey(now);
  const yesterdayKey = addDaysToKey(todayKey, -1);
  const weekStartKey = getIsoWeekStartKey(todayKey);
  const monthPrefix = todayKey.slice(0, 7);

  const byDate = new Map();
  const byWeek = new Map();
  const byStatus = new Map();
  const byOwner = new Map();
  const byMajor = new Map();
  const byAdmissionMethodExcludingLoan = new Map();
  const byStatusLoanIntl = new Map();
  const byLoanIntlMajor = new Map();
  const ownerStatusMap = new Map();
  const todayByOwner = new Map();
  const todayByMajor = new Map();
  const todayByStatus = new Map();

  let loanIntlTotal = 0;
  let totalWithValidDate = 0;
  let invalidCreatedTime = 0;
  let todayCount = 0;
  let yesterdayCount = 0;
  let weekCount = 0;
  let monthCount = 0;

  for (const row of rows) {
    const created = parseDate(row["created_time"]);
    if (!created) {
      invalidCreatedTime += 1;
      continue;
    }

    totalWithValidDate += 1;
    const dateKey = getZonedDateKey(created);
    if (!dateKey) continue;
    const weekKey = getIsoWeekFromKey(dateKey);

    byDate.set(dateKey, (byDate.get(dateKey) || 0) + 1);
    byWeek.set(weekKey, (byWeek.get(weekKey) || 0) + 1);

    const status = normalizeStatus(row["tinh trang lien he"]);
    byStatus.set(status, (byStatus.get(status) || 0) + 1);

    const owner = (row["cb cham soc"] || "Chua gan").trim();
    byOwner.set(owner, (byOwner.get(owner) || 0) + 1);
    if (!ownerStatusMap.has(owner)) ownerStatusMap.set(owner, new Map());
    const ownerStatuses = ownerStatusMap.get(owner);
    ownerStatuses.set(status, (ownerStatuses.get(status) || 0) + 1);

    const rawMajor = (row["nganh hoc quan tam"] || "Khac").trim();
    const major = normalizeMajor(rawMajor);
    byMajor.set(major, (byMajor.get(major) || 0) + 1);

    const method = normalizeAdmissionMethod(row["phuong thuc xet tuyen phu hop nhat"]);
    if (foldText(owner) !== "loan nguyen") {
      byAdmissionMethodExcludingLoan.set(method, (byAdmissionMethodExcludingLoan.get(method) || 0) + 1);
    }

    if (foldText(owner) === "loan nguyen" && foldText(major) === foldText("Tuyển sinh quốc tế")) {
      loanIntlTotal += 1;
      byStatusLoanIntl.set(status, (byStatusLoanIntl.get(status) || 0) + 1);
      const loanMajor = major;
      byLoanIntlMajor.set(loanMajor, (byLoanIntlMajor.get(loanMajor) || 0) + 1);
    }

    if (dateKey === todayKey) todayCount += 1;
    if (dateKey === todayKey) {
      todayByOwner.set(owner, (todayByOwner.get(owner) || 0) + 1);
      todayByMajor.set(major, (todayByMajor.get(major) || 0) + 1);
      todayByStatus.set(status, (todayByStatus.get(status) || 0) + 1);
    }
    if (dateKey === yesterdayKey) yesterdayCount += 1;
    if (dateKey >= weekStartKey) weekCount += 1;
    if (dateKey.startsWith(monthPrefix)) monthCount += 1;
  }

  const dailySeries = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = addDaysToKey(todayKey, -i);
    dailySeries.push({ date: key, leads: byDate.get(key) || 0 });
  }

  const weeklySeries = Array.from(byWeek.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([week, leads]) => ({ week, leads }));

  function topEntries(mapObj, limit = 20) {
    return Array.from(mapObj.entries())
      .map(([name, leads]) => ({ name, leads }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, limit);
  }

  return {
    summary: {
      totalLeads: rows.length,
      totalLeadsWithValidDate: totalWithValidDate,
      leadsToday: todayCount,
      leadsYesterday: yesterdayCount,
      leadsThisWeek: weekCount,
      leadsThisMonth: monthCount,
      deltaTodayVsYesterday: todayCount - yesterdayCount,
      invalidCreatedTime,
    },
    series: {
      daily: dailySeries,
      weekly: weeklySeries,
    },
    breakdown: {
      byStatus: topEntries(byStatus),
      byOwner: topEntries(byOwner),
      byMajor: topEntries(byMajor).filter((item) => foldText(item.name) !== foldText("Tuyển sinh quốc tế")),
      byAdmissionMethodExcludingLoan: topEntries(byAdmissionMethodExcludingLoan),
      loanNguyenInternational: {
        totalLeads: loanIntlTotal,
        shareOfAllLeads: rows.length === 0 ? 0 : Number(((loanIntlTotal / rows.length) * 100).toFixed(2)),
        byStatus: topEntries(byStatusLoanIntl),
        byMajor: topEntries(byLoanIntlMajor),
      },
      ownerPerformance: Array.from(ownerStatusMap.entries())
        .map(([owner, statusMap]) => {
          const total = Array.from(statusMap.values()).reduce((a, b) => a + b, 0);
          const statusRows = Array.from(statusMap.entries())
            .map(([status, leads]) => ({ status, leads }))
            .sort((a, b) => b.leads - a.leads);
          return { owner, total, byStatus: statusRows };
        })
        .sort((a, b) => b.total - a.total),
      todayFocus: {
        byOwner: topEntries(todayByOwner),
        byMajor: topEntries(todayByMajor),
        byStatus: topEntries(todayByStatus),
      },
    },
    generatedAt: new Date().toISOString(),
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const program = foldText(req.query.program || "undergrad");
    const selectedProgram = program === "postgrad" ? "postgrad" : program === "media" ? "media" : "undergrad";
    if (selectedProgram === "media") {
      const days = Math.max(7, Math.min(120, Number(req.query.days || 30)));
      const media = await fetchMediaDashboard(days);
      return res.json({
        meta: {
          program: selectedProgram,
          source: "facebook_graph_api",
        },
        ...media,
      });
    }

    const cfg = DASHBOARD_CONFIGS[selectedProgram];
    if (!cfg?.sheetId) {
      return res.status(400).json({ error: `Missing sheet config for program: ${selectedProgram}` });
    }
    const days = Math.max(7, Math.min(120, Number(req.query.days || 30)));
    const sheets = await getSheetsClient();

    const range = `${cfg.sheetName}!${cfg.sheetRange}`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: cfg.sheetId,
      range,
      majorDimension: "ROWS",
    });

    const rows = buildRows(response.data.values || []);
    if (selectedProgram === "postgrad") {
      const sourceBySheet = await buildLeadSourcesBySheet(sheets, cfg.sheetId);
      const sourceBreakdown = sourceBySheet
        .filter((x) => foldText(x.name) !== foldText(cfg.sheetName))
        .filter((x) => x.leads > 0);
      const data = aggregatePostgrad(rows, sourceBreakdown, days);
      return res.json({
        meta: {
          program: selectedProgram,
          sheetId: cfg.sheetId,
          sheetName: cfg.sheetName,
          range: cfg.sheetRange,
          rowCount: rows.length,
        },
        ...data,
      });
    }

    const data = aggregate(rows, days);
    const leadSourcesBySheet = await buildLeadSourcesBySheet(sheets, cfg.sheetId);
    const crmSourceAttribution = await buildCmrSourceAttribution(sheets, cfg.sheetId, rows, cfg.sheetName);

    res.json({
      meta: {
        program: selectedProgram,
        sheetId: cfg.sheetId,
        sheetName: cfg.sheetName,
        range: cfg.sheetRange,
        rowCount: rows.length,
      },
      sources: {
        bySheet: leadSourcesBySheet,
        crmBySourceSheet: crmSourceAttribution,
      },
      ...data,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load dashboard data",
      detail: error.message,
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`CRM Dashboard is running on http://localhost:${port}`);
});
