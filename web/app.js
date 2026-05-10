const defaultResponses = [
  {
    id: "1",
    title: "Saludo inicial",
    content: "Hola, gracias por contactarnos. Un miembro del equipo revisara tu solicitud en breve. Describe tu problema con el mayor detalle posible.",
    category: "general"
  },
  {
    id: "2",
    title: "Solicitar mas informacion",
    content: "Para ayudarte mejor, comparte mas detalles del problema. Incluye capturas, usuario afectado y los pasos que seguiste.",
    category: "soporte"
  },
  {
    id: "3",
    title: "Ticket resuelto",
    content: "Tu problema quedo resuelto. Si necesitas ayuda adicional, puedes abrir un nuevo ticket.",
    category: "cierre"
  }
];

const state = {
  guild: null,
  panels: [],
  activePanel: null,
  activeButtons: [],
  stats: { open_count: 0, closed_count: 0, total_count: 0 },
  tickets: [],
  responses: loadStoredResponses(),
  theme: localStorage.getItem("ticket_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const icon = name => `<i data-lucide="${name}"></i>`;

function refreshIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

function ticketStatusLabel(status) {
  return status === "closed" ? "Cerrado" : "Abierto";
}

function ticketStatusClass(status) {
  return status === "closed" ? "status-closed" : "status-open";
}

function panelStatusClass(status = "") {
  const normalized = String(status).toLowerCase();
  if (normalized.includes("publicado")) return "status-published";
  if (normalized.includes("no encontrado")) return "status-error";
  return "status-draft";
}

function normalizePriority(value) {
  return ["low", "medium", "high", "urgent"].includes(value) ? value : "medium";
}

function priorityLabel(value) {
  return {
    low: "Baja",
    medium: "Media",
    high: "Alta",
    urgent: "Urgente"
  }[normalizePriority(value)];
}

function ticketTags(ticket) {
  if (Array.isArray(ticket.tags) && ticket.tags.length) return ticket.tags;
  if (ticket.department) return [ticket.department];
  if (ticket.type_label) return [ticket.type_label];
  return ["ticket"];
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = toDate(value);
  return date ? date.toLocaleString() : "-";
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function timeAgo(value) {
  const date = toDate(value);
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${Math.floor(hours / 24)}d`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Error de API");
  return data;
}

function show(view) {
  const target = $(`#${view}View`);
  if (!target) return;
  $$(".view").forEach(item => item.classList.add("hidden"));
  target.classList.remove("hidden");
  $$(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  refreshIcons();
}

function optionList(items = [], selectedId = "") {
  return [
    `<option value="">Seleccionar</option>`,
    ...items.map(item => `<option value="${esc(item.id)}" ${item.id === selectedId ? "selected" : ""}>${esc(item.name)}</option>`)
  ].join("");
}

function multiOptions(items = [], selected = []) {
  return items.map(item => `<option value="${esc(item.id)}" ${selected.includes(item.id) ? "selected" : ""}>${esc(item.name)}</option>`).join("");
}

function selectedValues(select) {
  return [...select.selectedOptions].map(option => option.value).filter(Boolean);
}

function fillSelects() {
  if (!state.guild) return;
  const channels = optionList(state.guild.channels);
  const categories = optionList(state.guild.categories);
  document.querySelectorAll("select[name='channelId']").forEach(select => select.innerHTML = channels);
  document.querySelectorAll("select[name='defaultCategoryId'], select[name='categoryId']").forEach(select => select.innerHTML = categories);
  document.querySelectorAll("select[name='staffRoleIds'], select[name='closeRoleIds']").forEach(select => {
    select.innerHTML = multiOptions(state.guild.roles);
  });
}

async function loadGuild() {
  state.guild = await api("/api/guild");
  $("#guildName").textContent = state.guild.name;
  fillSelects();
}

async function loadStats() {
  state.stats = await api("/api/stats");
  $("#openCount").textContent = state.stats.open_count || 0;
  $("#closedCount").textContent = state.stats.closed_count || 0;
  $("#totalCount").textContent = state.stats.total_count || 0;
  renderAnalytics();
  renderNotifications();
}

async function loadTickets(params = new URLSearchParams()) {
  const rows = await api(`/api/tickets?${params.toString()}`);
  state.tickets = rows;
  $("#ticketsTable").innerHTML = rows.length ? rows.map(ticket => {
    const priority = normalizePriority(ticket.priority);
    return `
      <tr data-ticket-id="${esc(ticket.id)}">
        <td>${esc(ticket.ticket_number)}</td>
        <td><span class="status-badge ${ticketStatusClass(ticket.status)}">${ticketStatusLabel(ticket.status)}</span></td>
        <td>${esc(ticket.type_label)}</td>
        <td><span class="priority-badge priority-${priority}">${priorityLabel(priority)}</span></td>
        <td><div class="tag-stack">${ticketTags(ticket).slice(0, 3).map(tag => `<span class="tag-badge">${icon("tag")} ${esc(tag)}</span>`).join("")}</div></td>
        <td>${esc(ticket.user_id)}</td>
        <td>${esc(ticket.claimed_by || "-")}</td>
        <td>${formatDate(ticket.opened_at)}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="8" class="empty-row">No hay tickets registrados</td></tr>`;
  renderAnalytics();
  renderNotifications();
  refreshIcons();
}

async function showTicketDetail(ticketId) {
  const data = await api(`/api/tickets/${ticketId}`);
  const priority = normalizePriority(data.ticket.priority);
  $("#ticketDetail").classList.remove("hidden");
  $("#ticketDetail").innerHTML = `
    <header>
      <div>
        <span class="eyebrow">Detalle</span>
        <h3>Ticket #${esc(data.ticket.ticket_number)}</h3>
      </div>
      <span class="status-badge ${ticketStatusClass(data.ticket.status)}">${ticketStatusLabel(data.ticket.status)}</span>
    </header>
    <p><strong>Tipo:</strong> ${esc(data.ticket.type_label || "-")}</p>
    <p><strong>Prioridad:</strong> <span class="priority-badge priority-${priority}">${priorityLabel(priority)}</span></p>
    <p><strong>Usuario:</strong> ${esc(data.ticket.user_id || "-")}</p>
    <p><strong>Atiende:</strong> ${esc(data.ticket.claimed_by || "-")}</p>
    <p><strong>Motivo:</strong> ${esc(data.ticket.reason || "-")}</p>
    <p><strong>Cierre:</strong> ${esc(data.ticket.close_reason || "-")}</p>
    <p><strong>Eventos:</strong></p>
    <ul class="event-list">${data.events.length ? data.events.map(event => `<li>${esc(event.event_type)} por ${esc(event.actor_id || "-")}<br><small>${formatDate(event.created_at)}</small></li>`).join("") : "<li>Sin eventos registrados</li>"}</ul>
  `;
  refreshIcons();
}

function renderAnalytics() {
  const open = Number(state.stats.open_count || 0);
  const closed = Number(state.stats.closed_count || 0);
  const total = Number(state.stats.total_count || 0);

  const closedDurations = state.tickets
    .filter(ticket => ticket.status === "closed")
    .map(ticket => {
      const opened = toDate(ticket.opened_at);
      const closedAt = toDate(ticket.closed_at);
      return opened && closedAt ? closedAt.getTime() - opened.getTime() : null;
    })
    .filter(value => Number.isFinite(value) && value > 0);
  const avg = closedDurations.length
    ? closedDurations.reduce((sum, value) => sum + value, 0) / closedDurations.length
    : 0;
  $("#avgTime").textContent = formatDuration(avg);

  renderWeeklyChart();
  renderDonut(open, closed, total);
}

function renderWeeklyChart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("es", { weekday: "short" }).replace(".", ""),
      open: 0,
      closed: 0
    };
  });
  const byKey = new Map(days.map(day => [day.key, day]));

  state.tickets.forEach(ticket => {
    const opened = toDate(ticket.opened_at);
    if (opened) {
      const key = opened.toISOString().slice(0, 10);
      if (byKey.has(key)) byKey.get(key).open += 1;
    }
    const closed = toDate(ticket.closed_at);
    if (closed) {
      const key = closed.toISOString().slice(0, 10);
      if (byKey.has(key)) byKey.get(key).closed += 1;
    }
  });

  const max = Math.max(1, ...days.flatMap(day => [day.open, day.closed]));
  $("#weeklyChart").innerHTML = days.map(day => `
    <div class="bar-cluster" title="${esc(day.label)}: ${day.open} abiertos, ${day.closed} cerrados">
      <span class="bar-total">${day.open + day.closed}</span>
      <div class="bar-pair">
        <span class="bar open" style="height:${Math.max(5, day.open / max * 150)}px"></span>
        <span class="bar closed" style="height:${Math.max(5, day.closed / max * 150)}px"></span>
      </div>
      <span class="bar-label">${esc(day.label)}</span>
    </div>
  `).join("");
}

function renderDonut(open, closed, total) {
  const safeTotal = Math.max(total || open + closed, 0);
  const openDegrees = safeTotal ? Math.round(open / safeTotal * 360) : 0;
  $("#donutTotal").textContent = safeTotal;
  $("#ticketDonut").style.background = safeTotal
    ? `conic-gradient(var(--warn) 0deg ${openDegrees}deg, var(--ok) ${openDegrees}deg 360deg)`
    : "conic-gradient(var(--bg-soft) 0deg 360deg)";
  $("#donutLegend").innerHTML = `
    <div class="legend-item"><span class="legend-label"><span class="legend-dot open"></span>Abiertos</span><strong>${open}</strong></div>
    <div class="legend-item"><span class="legend-label"><span class="legend-dot closed"></span>Cerrados</span><strong>${closed}</strong></div>
  `;
}

function exportTicketsCsv() {
  if (!state.tickets.length) {
    alert("No hay tickets para exportar con los filtros actuales.");
    return;
  }
  const headers = ["Numero", "Estado", "Tipo", "Prioridad", "Tags", "Usuario", "Atiende", "Abierto", "Cerrado"];
  const rows = state.tickets.map(ticket => [
    ticket.ticket_number,
    ticket.status,
    ticket.type_label,
    priorityLabel(ticket.priority),
    ticketTags(ticket).join(" | "),
    ticket.user_id,
    ticket.claimed_by || "",
    formatDate(ticket.opened_at),
    formatDate(ticket.closed_at)
  ]);
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tickets_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function buildNotifications() {
  const recent = [...state.tickets]
    .sort((a, b) => (toDate(b.opened_at)?.getTime() || 0) - (toDate(a.opened_at)?.getTime() || 0))
    .slice(0, 4)
    .map(ticket => ({
      icon: ticket.status === "closed" ? "check-circle" : "ticket",
      title: `Ticket #${ticket.ticket_number}`,
      message: `${ticketStatusLabel(ticket.status)} - ${ticket.type_label || "sin tipo"}`,
      timestamp: ticket.status === "closed" ? ticket.closed_at || ticket.opened_at : ticket.opened_at
    }));

  const unclaimed = state.tickets.filter(ticket => ticket.status === "open" && !ticket.claimed_by).length;
  if (unclaimed) {
    recent.unshift({
      icon: "user-check",
      title: `${unclaimed} ticket${unclaimed === 1 ? "" : "s"} sin atender`,
      message: "Pendientes de reclamo por staff autorizado.",
      timestamp: new Date().toISOString()
    });
  }
  return recent.slice(0, 5);
}

function renderNotifications() {
  const panel = $("#notificationsPanel");
  if (!panel) return;
  const items = buildNotifications();
  $("#notificationBadge").classList.toggle("hidden", items.length === 0);
  $("#notificationBadge").textContent = items.length;
  panel.innerHTML = `
    <header>
      <h3>Notificaciones</h3>
      <button id="clearNotificationsBtn" class="ghost">Marcar leido</button>
    </header>
    <div class="notification-list">
      ${items.length ? items.map(item => `
        <article class="notification-item">
          ${icon(item.icon)}
          <div>
            <strong>${esc(item.title)}</strong>
            <p>${esc(item.message)}</p>
          </div>
          <small>${timeAgo(item.timestamp)}</small>
        </article>
      `).join("") : `<div class="notification-empty">Sin notificaciones recientes</div>`}
    </div>
  `;
  refreshIcons();
}

async function loadPanels() {
  state.panels = await api("/api/panels");
  renderPanelsList();
  renderPanelCards();
}

function renderPanelsList() {
  $("#panelsList").innerHTML = state.panels.length ? state.panels.map(panel => `
    <article class="list-card">
      <div class="list-card-header">
        <div>
          <h3>${esc(panel.title)}</h3>
          <div class="list-card-meta">
            <span class="status-badge ${panelStatusClass(panel.status)}">${esc(panel.status || "sin publicar")}</span>
            <span class="muted">ID ${esc(panel.id)}</span>
            <span class="muted">#${esc(panel.channelName || panel.channel_id || "-")}</span>
          </div>
        </div>
        <span class="button-chip">${esc(panel.buttons.length)} botones</span>
      </div>
      <p>${esc(panel.description)}</p>
      <div class="actions">
        <button data-edit-panel="${esc(panel.id)}" class="secondary">${icon("pencil")} Editar</button>
        <button data-publish-panel="${esc(panel.id)}">${icon("send")} Publicar</button>
        <button data-delete-panel="${esc(panel.id)}" class="danger">${icon("trash-2")}</button>
      </div>
    </article>
  `).join("") : `<article class="list-card empty-row">No hay paneles configurados</article>`;
  refreshIcons();
}

function renderPanelCards() {
  if (state.activePanel) {
    const refreshed = state.panels.find(item => String(item.id) === String(state.activePanel.id));
    if (refreshed) {
      state.activePanel = refreshed;
      state.activeButtons = refreshed.buttons || [];
      renderButtons();
      updatePreview();
    }
  }
}

function selectPanel(panelId) {
  const panel = state.panels.find(item => String(item.id) === String(panelId));
  if (!panel) return;
  state.activePanel = panel;
  state.activeButtons = panel.buttons || [];

  const form = $("#panelForm");
  form.panelId.value = panel.id;
  form.title.value = panel.title;
  form.description.value = panel.description;
  form.channelId.value = panel.channel_id;
  form.channelName.value = "";
  form.defaultCategoryId.value = panel.default_category_id || "";
  form.defaultCategoryName.value = "";
  renderButtons();
  updatePreview();
  show("editor");
}

function newPanel() {
  state.activePanel = null;
  state.activeButtons = [];
  $("#panelForm").reset();
  $("#panelForm").panelId.value = "";
  $("#buttonForm").classList.add("hidden");
  renderButtons();
  updatePreview();
}

function renderButtons() {
  $("#buttonsList").innerHTML = state.activeButtons.length ? state.activeButtons.map(button => `
    <article class="list-card">
      <div class="list-card-header">
        <div>
          <h3>${esc(button.label)}</h3>
          <div class="list-card-meta">
            <span class="fake-btn ${esc(button.style)}">${esc(button.style)}</span>
            <span class="muted">${esc(button.categoryName || button.category_id || "sin categoria")}</span>
          </div>
        </div>
      </div>
      <div class="actions">
        <button data-edit-button="${esc(button.id)}" class="secondary">${icon("pencil")} Editar</button>
        <button data-delete-button="${esc(button.id)}" class="danger">${icon("trash-2")} Borrar</button>
      </div>
    </article>
  `).join("") : `<article class="list-card empty-row">Guarda un panel y agrega el primer boton.</article>`;
  refreshIcons();
}

function updatePreview() {
  const form = $("#panelForm");
  $("#previewTitle").textContent = form.title.value || "Titulo del panel";
  $("#previewDescription").textContent = form.description.value || "Descripcion del panel";
  $("#previewButtons").innerHTML = state.activeButtons.map(button =>
    `<span class="fake-btn ${esc(button.style)}">${esc(button.label)}</span>`
  ).join("");
  refreshIcons();
}

function editButton(buttonId = null) {
  const form = $("#buttonForm");
  form.classList.remove("hidden");
  form.reset();
  form.buttonId.value = "";
  form.staffRoleIds.innerHTML = multiOptions(state.guild.roles);
  form.closeRoleIds.innerHTML = multiOptions(state.guild.roles);
  form.categoryId.innerHTML = optionList(state.guild.categories);

  if (!buttonId) return;
  const button = state.activeButtons.find(item => String(item.id) === String(buttonId));
  if (!button) return;
  form.buttonId.value = button.id;
  form.label.value = button.label;
  form.style.value = button.style;
  form.categoryId.value = button.category_id;
  form.staffRoleIds.innerHTML = multiOptions(state.guild.roles, button.staff_role_ids || []);
  form.closeRoleIds.innerHTML = multiOptions(state.guild.roles, button.close_role_ids || []);
}

async function savePanel(event) {
  event.preventDefault();
  const form = event.target;
  let targetPanelId = form.panelId.value;
  const body = {
    title: form.title.value,
    description: form.description.value,
    channelId: form.channelId.value,
    channelName: form.channelName.value,
    defaultCategoryId: form.defaultCategoryId.value,
    defaultCategoryName: form.defaultCategoryName.value
  };

  if (form.panelId.value) {
    await api(`/api/panels/${form.panelId.value}`, { method: "PUT", body: JSON.stringify(body) });
  } else {
    const created = await api("/api/panels", { method: "POST", body: JSON.stringify(body) });
    form.panelId.value = created.id;
    targetPanelId = created.id;
  }
  await loadGuild();
  await loadPanels();
  if (targetPanelId) selectPanel(targetPanelId);
}

async function saveButton(event) {
  event.preventDefault();
  if (!$("#panelForm").panelId.value) {
    alert("Guarda un panel antes de agregar botones.");
    return;
  }

  const form = event.target;
  const body = {
    label: form.label.value,
    style: form.style.value,
    categoryId: form.categoryId.value,
    categoryName: form.categoryName.value,
    staffRoleIds: selectedValues(form.staffRoleIds),
    closeRoleIds: selectedValues(form.closeRoleIds)
  };
  if (form.buttonId.value) {
    await api(`/api/buttons/${form.buttonId.value}`, { method: "PUT", body: JSON.stringify(body) });
  } else {
    await api(`/api/panels/${$("#panelForm").panelId.value}/buttons`, { method: "POST", body: JSON.stringify(body) });
  }
  form.classList.add("hidden");
  await loadGuild();
  await loadPanels();
  selectPanel($("#panelForm").panelId.value);
}

async function publishActivePanel() {
  const panelId = $("#panelForm").panelId.value;
  if (!panelId) {
    alert("Guarda el panel antes de publicarlo.");
    return;
  }
  await api(`/api/panels/${panelId}/publish`, { method: "POST", body: "{}" });
  await loadPanels();
  selectPanel(panelId);
  alert("Panel publicado o actualizado.");
}

function loadStoredResponses() {
  try {
    const stored = JSON.parse(localStorage.getItem("ticket_responses") || "null");
    return Array.isArray(stored) ? stored : defaultResponses;
  } catch {
    return defaultResponses;
  }
}

function saveStoredResponses() {
  localStorage.setItem("ticket_responses", JSON.stringify(state.responses));
}

function renderResponses() {
  const search = ($("#responseSearch")?.value || "").toLowerCase();
  const rows = state.responses.filter(response =>
    response.title.toLowerCase().includes(search)
    || response.content.toLowerCase().includes(search)
    || response.category.toLowerCase().includes(search)
  );
  $("#responsesList").innerHTML = rows.length ? rows.map(response => `
    <article class="quick-card">
      <div>
        <h4>${esc(response.title)} <span class="tag-badge">${esc(response.category)}</span></h4>
        <p>${esc(response.content)}</p>
      </div>
      <div class="actions">
        <button type="button" class="ghost icon-only" data-copy-response="${esc(response.id)}" title="Copiar">${icon("copy")}</button>
        <button type="button" class="ghost icon-only" data-delete-response="${esc(response.id)}" title="Borrar">${icon("trash-2")}</button>
      </div>
    </article>
  `).join("") : `<div class="notification-empty">No hay respuestas con esa busqueda</div>`;
  refreshIcons();
}

function addResponse() {
  const title = $("#responseTitle").value.trim();
  const content = $("#responseContent").value.trim();
  const category = $("#responseCategory").value;
  if (!title || !content) return;
  state.responses.push({ id: String(Date.now()), title, content, category });
  saveStoredResponses();
  $("#responseTitle").value = "";
  $("#responseContent").value = "";
  $("#newResponseForm").classList.add("hidden");
  renderResponses();
}

async function copyResponse(responseId) {
  const response = state.responses.find(item => String(item.id) === String(responseId));
  if (!response) return;
  await navigator.clipboard.writeText(response.content).catch(() => {});
}

function deleteResponse(responseId) {
  state.responses = state.responses.filter(item => String(item.id) !== String(responseId));
  saveStoredResponses();
  renderResponses();
}

async function searchUserProfile(userId) {
  const cleanId = String(userId || "").trim();
  if (!cleanId) return;
  const tickets = await api(`/api/tickets?${new URLSearchParams({ userId: cleanId }).toString()}`);
  renderProfile(cleanId, tickets);
  refreshIcons();
}

function renderProfile(userId, tickets) {
  const open = tickets.filter(ticket => ticket.status === "open").length;
  const closed = tickets.filter(ticket => ticket.status === "closed").length;
  const latest = [...tickets].sort((a, b) => (toDate(b.opened_at)?.getTime() || 0) - (toDate(a.opened_at)?.getTime() || 0))[0];
  const avg = tickets
    .filter(ticket => ticket.closed_at && ticket.opened_at)
    .map(ticket => {
      const opened = toDate(ticket.opened_at);
      const closedAt = toDate(ticket.closed_at);
      return opened && closedAt ? closedAt.getTime() - opened.getTime() : 0;
    })
    .filter(value => value > 0);
  const avgTime = avg.length ? formatDuration(avg.reduce((sum, value) => sum + value, 0) / avg.length) : "0m";

  $("#profileResult").innerHTML = `
    <section class="profile-grid">
      <article class="profile-card">
        <div class="profile-avatar">${icon("user")}</div>
        <h3>${esc(userId)}</h3>
        <p>${latest ? `Ultima actividad ${timeAgo(latest.opened_at)}` : "Sin tickets registrados"}</p>
      </article>
      <article class="profile-card"><span class="eyebrow">Total</span><strong>${tickets.length}</strong><p>tickets registrados</p></article>
      <article class="profile-card"><span class="eyebrow">Abiertos</span><strong>${open}</strong><p>requieren seguimiento</p></article>
      <article class="profile-card"><span class="eyebrow">Promedio</span><strong>${avgTime}</strong><p>duracion de cierre</p></article>
    </section>
    <div class="table-card">
      <div class="card-heading">
        <div>
          <h3>${icon("ticket")} Historial de tickets</h3>
          <span>${closed} cerrados y ${open} abiertos para este usuario.</span>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Estado</th><th>Tipo</th><th>Prioridad</th><th>Abierto</th></tr></thead>
          <tbody>${tickets.length ? tickets.map(ticket => {
            const priority = normalizePriority(ticket.priority);
            return `
              <tr data-ticket-id="${esc(ticket.id)}">
                <td>${esc(ticket.ticket_number)}</td>
                <td><span class="status-badge ${ticketStatusClass(ticket.status)}">${ticketStatusLabel(ticket.status)}</span></td>
                <td>${esc(ticket.type_label || "-")}</td>
                <td><span class="priority-badge priority-${priority}">${priorityLabel(priority)}</span></td>
                <td>${formatDate(ticket.opened_at)}</td>
              </tr>
            `;
          }).join("") : `<tr><td colspan="5" class="empty-row">Este usuario no tiene tickets registrados</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function applyTheme() {
  document.documentElement.classList.toggle("dark", state.theme === "dark");
  localStorage.setItem("ticket_theme", state.theme);
  const button = $("#themeToggleBtn");
  if (button) {
    button.innerHTML = state.theme === "dark" ? icon("sun") : icon("moon");
    refreshIcons();
  }
}

async function boot() {
  applyTheme();
  const me = await api("/api/me");
  $("#loginView").classList.toggle("hidden", me.authed);
  $("#appView").classList.toggle("hidden", !me.authed);
  if (!me.authed) return;

  await loadGuild();
  await Promise.all([loadStats(), loadTickets(), loadPanels()]);
  renderResponses();
  refreshIcons();
}

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  $("#loginError").textContent = "";
  try {
    await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#passwordInput").value }) });
    await boot();
  } catch (error) {
    $("#loginError").textContent = error.message;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  location.reload();
});

$$(".nav-btn").forEach(btn => btn.addEventListener("click", () => show(btn.dataset.view)));
$("#ticketFilters").addEventListener("submit", event => {
  event.preventDefault();
  loadTickets(new URLSearchParams(new FormData(event.target)));
});
$("#resetFiltersBtn").addEventListener("click", () => {
  $("#ticketFilters").reset();
  loadTickets();
});
$("#exportCsvBtn").addEventListener("click", exportTicketsCsv);
$("#ticketsTable").addEventListener("click", event => {
  const row = event.target.closest("tr[data-ticket-id]");
  if (row) showTicketDetail(row.dataset.ticketId);
});
$("#profileSearchForm").addEventListener("submit", event => {
  event.preventDefault();
  searchUserProfile($("#profileUserInput").value);
});
$("#profileResult").addEventListener("click", event => {
  const row = event.target.closest("tr[data-ticket-id]");
  if (row) {
    show("dashboard");
    showTicketDetail(row.dataset.ticketId);
  }
});
$("#newPanelBtn").addEventListener("click", newPanel);
$("#panelForm").addEventListener("input", updatePreview);
$("#panelForm").addEventListener("submit", savePanel);
$("#publishPanelBtn").addEventListener("click", publishActivePanel);
$("#addButtonBtn").addEventListener("click", () => editButton());
$("#buttonForm").addEventListener("submit", saveButton);
$("#cancelButtonEdit").addEventListener("click", () => $("#buttonForm").classList.add("hidden"));
$("#themeToggleBtn").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
});
$("#responsesBtn").addEventListener("click", () => {
  $("#responsesDialog").showModal();
  renderResponses();
});
$("#responseSearch").addEventListener("input", renderResponses);
$("#newResponseBtn").addEventListener("click", () => $("#newResponseForm").classList.toggle("hidden"));
$("#saveResponseBtn").addEventListener("click", addResponse);
$("#notificationsBtn").addEventListener("click", event => {
  event.stopPropagation();
  $("#notificationsPanel").classList.toggle("hidden");
});

document.addEventListener("click", event => {
  if (!event.target.closest(".popover-anchor")) {
    $("#notificationsPanel")?.classList.add("hidden");
  }
});

document.body.addEventListener("click", async event => {
  const action = event.target.closest("[data-edit-panel], [data-publish-panel], [data-delete-panel], [data-edit-button], [data-delete-button], [data-copy-response], [data-delete-response], #clearNotificationsBtn");
  if (!action) return;

  const editPanel = action.dataset.editPanel;
  const publishPanel = action.dataset.publishPanel;
  const deletePanelId = action.dataset.deletePanel;
  const editButtonId = action.dataset.editButton;
  const deleteButtonId = action.dataset.deleteButton;
  const copyResponseId = action.dataset.copyResponse;
  const deleteResponseId = action.dataset.deleteResponse;

  if (action.id === "clearNotificationsBtn") {
    $("#notificationsPanel").classList.add("hidden");
    $("#notificationBadge").classList.add("hidden");
  }
  if (copyResponseId) await copyResponse(copyResponseId);
  if (deleteResponseId) deleteResponse(deleteResponseId);
  if (editPanel) selectPanel(editPanel);
  if (publishPanel) {
    await api(`/api/panels/${publishPanel}/publish`, { method: "POST", body: "{}" });
    await loadPanels();
  }
  if (deletePanelId && confirm("Borrar este panel y su mensaje publicado?")) {
    await api(`/api/panels/${deletePanelId}`, { method: "DELETE" });
    state.activePanel = null;
    await loadPanels();
  }
  if (editButtonId) editButton(editButtonId);
  if (deleteButtonId && confirm("Borrar este boton?")) {
    await api(`/api/buttons/${deleteButtonId}`, { method: "DELETE" });
    await loadPanels();
    selectPanel($("#panelForm").panelId.value);
  }
});

boot().catch(error => {
  console.error(error);
  $("#loginView").classList.remove("hidden");
  refreshIcons();
});

window.addEventListener("load", refreshIcons);
