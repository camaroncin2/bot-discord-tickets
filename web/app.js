const state = {
  guild: null,
  panels: [],
  activePanel: null,
  activeButtons: []
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
  $$(".view").forEach(item => item.classList.add("hidden"));
  $(`#${view}View`).classList.remove("hidden");
  $$(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  refreshIcons();
}

function optionList(items, selectedId = "") {
  return [
    `<option value="">Seleccionar</option>`,
    ...items.map(item => `<option value="${esc(item.id)}" ${item.id === selectedId ? "selected" : ""}>${esc(item.name)}</option>`)
  ].join("");
}

function multiOptions(items, selected = []) {
  return items.map(item => `<option value="${esc(item.id)}" ${selected.includes(item.id) ? "selected" : ""}>${esc(item.name)}</option>`).join("");
}

function selectedValues(select) {
  return [...select.selectedOptions].map(option => option.value).filter(Boolean);
}

function fillSelects() {
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
  const stats = await api("/api/stats");
  $("#openCount").textContent = stats.open_count || 0;
  $("#closedCount").textContent = stats.closed_count || 0;
  $("#totalCount").textContent = stats.total_count || 0;
}

async function loadTickets(params = new URLSearchParams()) {
  const rows = await api(`/api/tickets?${params.toString()}`);
  $("#ticketsTable").innerHTML = rows.length ? rows.map(ticket => `
    <tr data-ticket-id="${ticket.id}">
      <td>${esc(ticket.ticket_number)}</td>
      <td><span class="status-badge ${ticketStatusClass(ticket.status)}">${ticketStatusLabel(ticket.status)}</span></td>
      <td>${esc(ticket.type_label)}</td>
      <td>${esc(ticket.user_id)}</td>
      <td>${esc(ticket.claimed_by || "-")}</td>
      <td>${new Date(ticket.opened_at).toLocaleString()}</td>
    </tr>
  `).join("") : `<tr><td colspan="6" class="empty-row">No hay tickets registrados</td></tr>`;
  refreshIcons();
}

async function showTicketDetail(ticketId) {
  const data = await api(`/api/tickets/${ticketId}`);
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
    <p><strong>Usuario:</strong> ${esc(data.ticket.user_id || "-")}</p>
    <p><strong>Atiende:</strong> ${esc(data.ticket.claimed_by || "-")}</p>
    <p><strong>Motivo:</strong> ${esc(data.ticket.reason || "-")}</p>
    <p><strong>Cierre:</strong> ${esc(data.ticket.close_reason || "-")}</p>
    <p><strong>Eventos:</strong></p>
    <ul class="event-list">${data.events.length ? data.events.map(event => `<li>${esc(event.event_type)} por ${esc(event.actor_id || "-")}<br><small>${new Date(event.created_at).toLocaleString()}</small></li>`).join("") : "<li>Sin eventos registrados</li>"}</ul>
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

async function boot() {
  const me = await api("/api/me");
  $("#loginView").classList.toggle("hidden", me.authed);
  $("#appView").classList.toggle("hidden", !me.authed);
  if (!me.authed) return;

  await loadGuild();
  await Promise.all([loadStats(), loadTickets(), loadPanels()]);
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
$("#ticketsTable").addEventListener("click", event => {
  const row = event.target.closest("tr[data-ticket-id]");
  if (row) showTicketDetail(row.dataset.ticketId);
});
$("#newPanelBtn").addEventListener("click", newPanel);
$("#panelForm").addEventListener("input", updatePreview);
$("#panelForm").addEventListener("submit", savePanel);
$("#publishPanelBtn").addEventListener("click", publishActivePanel);
$("#addButtonBtn").addEventListener("click", () => editButton());
$("#buttonForm").addEventListener("submit", saveButton);
$("#cancelButtonEdit").addEventListener("click", () => $("#buttonForm").classList.add("hidden"));

document.body.addEventListener("click", async event => {
  const editPanel = event.target.dataset.editPanel;
  const publishPanel = event.target.dataset.publishPanel;
  const deletePanel = event.target.dataset.deletePanel;
  const editButtonId = event.target.dataset.editButton;
  const deleteButtonId = event.target.dataset.deleteButton;

  if (editPanel) selectPanel(editPanel);
  if (publishPanel) {
    await api(`/api/panels/${publishPanel}/publish`, { method: "POST", body: "{}" });
    await loadPanels();
  }
  if (deletePanel && confirm("Borrar este panel y su mensaje publicado?")) {
    await api(`/api/panels/${deletePanel}`, { method: "DELETE" });
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
