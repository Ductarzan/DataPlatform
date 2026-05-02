let dailyChart;
let weeklyChart;
let postgradDailyChart;
let mediaDailyChart;
let currentProgram = "undergrad";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderTable(containerId, rows, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const highlightNames = new Set((options.highlightNames || []).map((s) => s.toLowerCase()));
  const html = `
    <table>
      <thead><tr><th>Nhóm</th><th>Leads</th></tr></thead>
      <tbody>
        ${(rows || [])
          .map((r) => {
            const shouldHighlight = highlightNames.has((r.name || "").toLowerCase());
            const cls = shouldHighlight ? "class=\"row-highlight\"" : "";
            return `<tr ${cls}><td>${r.name}</td><td>${r.leads}</td></tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
  container.innerHTML = html;
}

function renderOwnerPerformance(containerId, rows) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const palette = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444"];
  const html = (rows || [])
    .map((r) => {
      const top = (r.byStatus || []).slice(0, 4);
      const bars = top
        .map((s, i) => {
          const pct = r.total > 0 ? (s.leads / r.total) * 100 : 0;
          return `<div class="perf-seg" style="width:${pct.toFixed(2)}%;background:${palette[i % palette.length]}" title="${s.status}: ${s.leads}"></div>`;
        })
        .join("");
      const legend = top
        .map((s, i) => `<span class="perf-legend-item"><i style="background:${palette[i % palette.length]}"></i>${s.status}: ${s.leads}</span>`)
        .join("");
      return `
        <div class="perf-row">
          <div class="perf-head"><strong>${r.owner}</strong><span>${r.total} leads</span></div>
          <div class="perf-bar">${bars}</div>
          <div class="perf-legend">${legend}</div>
        </div>
      `;
    })
    .join("");
  container.innerHTML = html;
}

function renderUndergradCharts(data) {
  const dailyCtx = document.getElementById("dailyChart").getContext("2d");
  const weeklyCtx = document.getElementById("weeklyChart").getContext("2d");
  if (dailyChart) dailyChart.destroy();
  if (weeklyChart) weeklyChart.destroy();

  dailyChart = new Chart(dailyCtx, {
    type: "line",
    data: {
      labels: (data.series?.daily || []).map((d) => d.date),
      datasets: [{ label: "Leads", data: (data.series?.daily || []).map((d) => d.leads), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.2)", fill: true, tension: 0.25 }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  weeklyChart = new Chart(weeklyCtx, {
    type: "bar",
    data: {
      labels: (data.series?.weekly || []).map((d) => d.week),
      datasets: [{ label: "Leads/Week", data: (data.series?.weekly || []).map((d) => d.leads), backgroundColor: "#16a34a" }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

function renderPostgradCharts(data) {
  const el = document.getElementById("postgradDailyChart");
  if (!el) return;
  const ctx = el.getContext("2d");
  if (postgradDailyChart) postgradDailyChart.destroy();

  postgradDailyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: (data.series?.daily || []).map((d) => d.date),
      datasets: [{ label: "Leads", data: (data.series?.daily || []).map((d) => d.leads), borderColor: "#0ea5e9", backgroundColor: "rgba(14,165,233,0.2)", fill: true, tension: 0.25 }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

function renderMediaCharts(data) {
  const el = document.getElementById("mediaDailyChart");
  if (!el) return;
  const ctx = el.getContext("2d");
  if (mediaDailyChart) mediaDailyChart.destroy();

  mediaDailyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: (data.series?.daily || []).map((d) => d.date),
      datasets: [
        { label: "Impressions", data: (data.series?.daily || []).map((d) => d.impressions), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.15)", fill: true, tension: 0.25 },
        { label: "Engaged Users", data: (data.series?.daily || []).map((d) => d.engagedUsers), borderColor: "#16a34a", backgroundColor: "rgba(22,163,74,0.12)", fill: true, tension: 0.25 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

function renderUndergrad(data) {
  setText("kpiTotal", data.summary.totalLeads);
  setText("kpiToday", data.summary.leadsToday);
  setText("kpiYesterday", data.summary.leadsYesterday);
  setText("kpiWeek", data.summary.leadsThisWeek);
  setText("kpiMonth", data.summary.leadsThisMonth);
  setText("kpiDelta", data.summary.deltaTodayVsYesterday);

  renderUndergradCharts(data);
  renderTable("todayOwnerTable", data.breakdown?.todayFocus?.byOwner || []);
  renderTable("todayMajorTable", data.breakdown?.todayFocus?.byMajor || []);
  renderTable("todayStatusTable", data.breakdown?.todayFocus?.byStatus || [], { highlightNames: ["Chưa liên hệ"] });
  renderTable("statusTable", data.breakdown?.byStatus || [], { highlightNames: ["Chưa liên hệ"] });
  renderTable("ownerTable", data.breakdown?.byOwner || []);
  renderOwnerPerformance("ownerPerfTable", data.breakdown?.ownerPerformance || []);
  renderTable("majorTable", data.breakdown?.byMajor || []);
  renderTable("methodTable", data.breakdown?.byAdmissionMethodExcludingLoan || []);
  renderTable("crmSourceTable", data.sources?.crmBySourceSheet || []);
  renderTable("loanIntlMajorTable", data.breakdown?.loanNguyenInternational?.byMajor || []);
  renderTable("loanIntlStatusTable", data.breakdown?.loanNguyenInternational?.byStatus || [], { highlightNames: ["Chưa liên hệ"] });
  setText("loanIntlSummary", `Tổng leads: ${data.breakdown?.loanNguyenInternational?.totalLeads || 0} | Tỷ trọng toàn bộ: ${data.breakdown?.loanNguyenInternational?.shareOfAllLeads || 0}%`);
}

function renderPostgrad(data) {
  setText("pgTotal", data.summary?.totalLeads || 0);
  setText("pgPhone", data.summary?.withPhone || 0);
  setText("pgEmail", data.summary?.withEmail || 0);
  setText("pgToday", data.summary?.todayLeads || 0);
  renderPostgradCharts(data);
  renderTable("pgMasterMajorTable", data.breakdown?.byMasterMajor || []);
  renderTable("pgBachelorMajorTable", data.breakdown?.byBachelorMajor || []);
  renderTable("pgCertificateTable", data.breakdown?.byCertificate || []);
  renderTable("pgTodayMajorTable", data.breakdown?.todayFocus?.byMasterMajor || []);
}

function renderTokenInfo(containerId, tokenInfo = {}) {
  const rows = [
    { name: "App", leads: `${tokenInfo.appName || "-"} (${tokenInfo.appId || "-"})` },
    { name: "Page ID", leads: tokenInfo.pageId || "-" },
    { name: "User", leads: `${tokenInfo.userName || "-"} (${tokenInfo.userId || "-"})` },
    { name: "Token hết hạn", leads: tokenInfo.tokenExpiresAt ? new Date(tokenInfo.tokenExpiresAt).toLocaleString("vi-VN") : "-" },
    { name: "Data access hết hạn", leads: tokenInfo.dataAccessExpiresAt ? new Date(tokenInfo.dataAccessExpiresAt).toLocaleString("vi-VN") : "-" },
    { name: "Phạm vi quyền", leads: (tokenInfo.scopes || []).join(", ") || "-" },
  ];
  renderTable(containerId, rows);
}

function renderMedia(data) {
  setText("mdPageName", data.summary?.pageName || "-");
  setText("mdFans", data.summary?.fanCount || 0);
  setText("mdFollowers", data.summary?.followersCount || 0);
  setText("mdAdAccounts", data.summary?.adAccountsCount || 0);
  setText("mdImpressions", data.summary?.totalImpressions || 0);
  setText("mdEngaged", data.summary?.totalEngaged || 0);
  setText("mdPostEngagement", data.summary?.totalPostEngagement || 0);
  setText("mdAvgEr", data.summary?.avgEngagementRate || 0);
  renderMediaCharts(data);
  renderTable("mdAdAccountTable", data.breakdown?.adAccounts || []);
  renderTokenInfo("mdTokenInfoTable", data.tokenInfo || {});
  renderTable("mdTopPostsTable", (data.breakdown?.topPosts || []).map((p) => ({ name: p.name, leads: p.leads })));

  const noticeRows = [];
  const expiresAt = data.tokenInfo?.tokenExpiresAt ? new Date(data.tokenInfo.tokenExpiresAt) : null;
  if (expiresAt) {
    const hoursLeft = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
    noticeRows.push({ name: "Token còn hạn", leads: `${hoursLeft} giờ` });
    if (hoursLeft <= 24) {
      noticeRows.push({ name: "Cảnh báo", leads: "Token sắp hết hạn, cần gia hạn để tránh mất dữ liệu." });
    }
  }
  if ((data.summary?.totalImpressions || 0) === 0) {
    noticeRows.push({ name: "Insights fanpage", leads: "Đang không trả dữ liệu impressions/engagement." });
  }
  if ((data.summary?.adAccountsCount || 0) === 0) {
    noticeRows.push({ name: "Ad Account", leads: "Token hiện tại không đọc được me/adaccounts (cần User/System token có ads_read)." });
  }
  if ((data.summary?.postsCount || 0) === 0) {
    noticeRows.push({ name: "Bài viết", leads: "Không lấy được bài viết trong khoảng 30 ngày." });
  } else if ((data.summary?.totalPostEngagement || 0) === 0) {
    noticeRows.push({ name: "Tương tác bài viết", leads: "Đọc được bài viết, nhưng chưa đọc được reactions/comments/shares. Cần Page token có pages_read_engagement theo granular page permission." });
  }
  if (noticeRows.length === 0) {
    noticeRows.push({ name: "Trạng thái", leads: "Dữ liệu Truyền thông đang hoạt động bình thường." });
  }
  renderTable("mdNoticeTable", noticeRows);
}

async function loadDashboard() {
  try {
    const res = await fetch(`/api/dashboard?days=30&program=${currentProgram}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || "Lỗi không xác định");

    const updated = new Date(data.generatedAt).toLocaleString("vi-VN");
    setText("updatedAt", `Cập nhật: ${updated} | Dòng dữ liệu: ${data.meta.rowCount || "-"}`);

    if (currentProgram === "postgrad") renderPostgrad(data);
    else if (currentProgram === "media") renderMedia(data);
    else renderUndergrad(data);
  } catch (err) {
    setText("updatedAt", `Lỗi tải dashboard: ${err.message}`);
    setText("loanIntlSummary", "Không tải được dữ liệu.");
  }
}

document.getElementById("refreshBtn").addEventListener("click", loadDashboard);

document.querySelectorAll(".program-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentProgram = btn.dataset.program;
    document.querySelectorAll(".program-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("undergradView").classList.toggle("hidden", currentProgram !== "undergrad");
    document.getElementById("postgradView").classList.toggle("hidden", currentProgram !== "postgrad");
    document.getElementById("mediaView").classList.toggle("hidden", currentProgram !== "media");
    loadDashboard();
  });
});

loadDashboard();
setInterval(loadDashboard, 60000);
