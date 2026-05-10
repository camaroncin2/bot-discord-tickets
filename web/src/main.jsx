import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Bell,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Download,
  FolderCheck,
  FolderOpen,
  Layers,
  LogIn,
  LogOut,
  MessageSquarePlus,
  Moon,
  PenTool,
  Plus,
  Save,
  Search,
  Send,
  Server,
  Sun,
  Tag,
  Ticket,
  Trash2,
  TrendingUp,
  User,
  UserSearch,
  X
} from "lucide-react";
import "./styles.css";

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

const navItems = [
  { id: "dashboard", label: "Registros", icon: Activity },
  { id: "editor", label: "Editor visual", icon: PenTool },
  { id: "panels", label: "Paneles", icon: Layers },
  { id: "profile", label: "Perfiles", icon: User }
];

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Error de API");
  return data;
}

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
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

function normalizePriority(value) {
  return ["low", "medium", "high", "urgent"].includes(value) ? value : "medium";
}

function priorityLabel(value) {
  return { low: "Baja", medium: "Media", high: "Alta", urgent: "Urgente" }[normalizePriority(value)];
}

function ticketTags(ticket) {
  if (Array.isArray(ticket.tags) && ticket.tags.length) return ticket.tags;
  if (ticket.department) return [ticket.department];
  if (ticket.type_label) return [ticket.type_label];
  return ["ticket"];
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function Empty({ children }) {
  return <div className="empty-state">{children}</div>;
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Login({ onAuthed }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ password }) });
      onAuthed();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-line">
          <span className="brand-icon indigo"><Ticket size={19} /></span>
          <span>Ticket Ops</span>
        </div>
        <div>
          <span className="eyebrow">Panel local</span>
          <h1>Centro de control</h1>
          <p>Accede al dashboard para revisar registros y configurar paneles de tickets.</p>
        </div>
        <label>
          Clave de acceso
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="Ingresa la clave local"
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" className="primary-action"><LogIn size={16} /> Entrar al dashboard</button>
        {error ? <span className="error">{error}</span> : null}
      </form>
    </main>
  );
}

function Layout({ guild, view, setView, theme, setTheme, tickets, onLogout, children }) {
  const [responsesOpen, setResponsesOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifications = useMemo(() => buildNotifications(tickets), [tickets]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <section className="brand-block">
            <span className="brand-icon indigo"><Ticket size={19} /></span>
            <div>
              <span className="eyebrow">Command Center</span>
              <h1>Tickets</h1>
            </div>
          </section>

          <nav className="nav-tabs" aria-label="Navegacion principal">
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={cx("nav-btn", view === item.id && "active")} onClick={() => setView(item.id)}>
                  <Icon size={16} /> {item.label}
                </button>
              );
            })}
          </nav>

          <section className="account-block">
            <button className="secondary compact-action" onClick={() => setResponsesOpen(true)}>
              <MessageSquarePlus size={16} /> <span>Respuestas</span>
            </button>
            <div className="popover-anchor">
              <button className="ghost square-action" onClick={() => setNotificationsOpen(value => !value)} aria-label="Notificaciones">
                <Bell size={16} />
                {notifications.length ? <span className="notification-badge">{notifications.length}</span> : null}
              </button>
              {notificationsOpen ? <Notifications items={notifications} onClose={() => setNotificationsOpen(false)} /> : null}
            </div>
            <button className="ghost square-action" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Cambiar tema">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="server-pill">
              <Server size={16} />
              <div>
                <span>Servidor</span>
                <strong>{guild?.name || "Cargando"}</strong>
              </div>
            </div>
            <button className="ghost icon-text" onClick={onLogout}><LogOut size={16} /> <span>Salir</span></button>
          </section>
        </div>
      </header>

      <section className="content">{children}</section>
      {responsesOpen ? <ResponsesDialog onClose={() => setResponsesOpen(false)} /> : null}
    </main>
  );
}

function buildNotifications(tickets) {
  const recent = [...tickets]
    .sort((a, b) => (toDate(b.opened_at)?.getTime() || 0) - (toDate(a.opened_at)?.getTime() || 0))
    .slice(0, 4)
    .map(ticket => ({
      id: ticket.id,
      icon: ticket.status === "closed" ? CheckCircle2 : Ticket,
      title: `Ticket #${ticket.ticket_number}`,
      message: `${ticket.status === "closed" ? "Cerrado" : "Abierto"} - ${ticket.type_label || "sin tipo"}`,
      timestamp: ticket.status === "closed" ? ticket.closed_at || ticket.opened_at : ticket.opened_at
    }));
  const unclaimed = tickets.filter(ticket => ticket.status === "open" && !ticket.claimed_by).length;
  if (unclaimed) {
    recent.unshift({
      id: "unclaimed",
      icon: User,
      title: `${unclaimed} ticket${unclaimed === 1 ? "" : "s"} sin atender`,
      message: "Pendientes de reclamo por staff autorizado.",
      timestamp: new Date().toISOString()
    });
  }
  return recent.slice(0, 5);
}

function Notifications({ items, onClose }) {
  return (
    <section className="notifications-popover">
      <header>
        <h3>Notificaciones</h3>
        <button className="ghost" onClick={onClose}>Marcar leido</button>
      </header>
      <div className="notification-list">
        {items.length ? items.map(item => {
          const Icon = item.icon;
          return (
            <article className="notification-item" key={item.id}>
              <Icon size={17} />
              <div>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
              </div>
              <small>{timeAgo(item.timestamp)}</small>
            </article>
          );
        }) : <Empty>Sin notificaciones recientes</Empty>}
      </div>
    </section>
  );
}

function ResponsesDialog({ onClose }) {
  const [responses, setResponses] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("ticket_responses")) || defaultResponses;
    } catch {
      return defaultResponses;
    }
  });
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ title: "", content: "", category: "general" });

  useEffect(() => {
    localStorage.setItem("ticket_responses", JSON.stringify(responses));
  }, [responses]);

  const filtered = responses.filter(item =>
    item.title.toLowerCase().includes(search.toLowerCase())
    || item.content.toLowerCase().includes(search.toLowerCase())
    || item.category.toLowerCase().includes(search.toLowerCase())
  );

  function save() {
    if (!draft.title.trim() || !draft.content.trim()) return;
    setResponses(items => [...items, { ...draft, id: String(Date.now()) }]);
    setDraft({ title: "", content: "", category: "general" });
    setShowNew(false);
  }

  return (
    <div className="modal-backdrop">
      <section className="dialog-card">
        <header>
          <div>
            <span className="eyebrow">Atencion</span>
            <h3>Respuestas rapidas</h3>
          </div>
          <button className="ghost icon-only" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </header>
        <div className="quick-tools">
          <input placeholder="Buscar respuesta" value={search} onChange={event => setSearch(event.target.value)} />
          <button className="secondary" onClick={() => setShowNew(value => !value)}><Plus size={16} /> Nueva</button>
        </div>
        {showNew ? (
          <section className="quick-form">
            <input placeholder="Titulo" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} />
            <select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>
              <option value="general">General</option>
              <option value="soporte">Soporte</option>
              <option value="cierre">Cierre</option>
            </select>
            <textarea placeholder="Contenido de la respuesta" value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} />
            <button onClick={save}><Save size={16} /> Guardar</button>
          </section>
        ) : null}
        <section className="quick-list">
          {filtered.length ? filtered.map(item => (
            <article className="quick-card" key={item.id}>
              <div>
                <h4>{item.title} <Badge>{item.category}</Badge></h4>
                <p>{item.content}</p>
              </div>
              <div className="actions">
                <button className="ghost icon-only" onClick={() => navigator.clipboard?.writeText(item.content)} aria-label="Copiar"><Copy size={15} /></button>
                <button className="ghost icon-only" onClick={() => setResponses(rows => rows.filter(row => row.id !== item.id))} aria-label="Borrar"><Trash2 size={15} /></button>
              </div>
            </article>
          )) : <Empty>No hay respuestas con esa busqueda</Empty>}
        </section>
      </section>
    </div>
  );
}

function Dashboard({ stats, tickets, onTickets, onSelectTicket, selectedTicket, setSelectedTicket }) {
  const [filters, setFilters] = useState({});
  const weeklyData = useMemo(() => getWeeklyData(tickets), [tickets]);
  const avgTime = useMemo(() => {
    const durations = tickets
      .filter(ticket => ticket.status === "closed")
      .map(ticket => {
        const opened = toDate(ticket.opened_at);
        const closed = toDate(ticket.closed_at);
        return opened && closed ? closed.getTime() - opened.getTime() : 0;
      })
      .filter(Boolean);
    return durations.length ? formatDuration(durations.reduce((sum, value) => sum + value, 0) / durations.length) : "0m";
  }, [tickets]);

  async function submit(event) {
    event.preventDefault();
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    onTickets(await api(`/api/tickets?${params.toString()}`));
  }

  async function resetFilters() {
    setFilters({});
    onTickets(await api("/api/tickets"));
  }

  function exportCsv() {
    if (!tickets.length) return alert("No hay tickets para exportar con los filtros actuales.");
    const headers = ["Numero", "Estado", "Tipo", "Prioridad", "Tags", "Usuario", "Atiende", "Abierto", "Cerrado"];
    const rows = tickets.map(ticket => [
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
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `tickets_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="view-stack">
      <PageHero eyebrow="Operaciones" title="Registros de tickets" copy="Monitorea actividad, filtra historial y abre detalles operativos sin salir del dashboard.">
        <button className="secondary" onClick={exportCsv}><Download size={16} /> Exportar CSV</button>
        <div className="status-strip"><span className="status-dot" /> Bot y MongoDB activos</div>
      </PageHero>

      <section className="stats-grid">
        <StatCard label="Tickets abiertos" value={stats.open_count || 0} sub="requieren seguimiento" icon={FolderOpen} tone="amber" />
        <StatCard label="Tickets cerrados" value={stats.closed_count || 0} sub="historial disponible" icon={FolderCheck} tone="green" />
        <StatCard label="Total registrado" value={stats.total_count || 0} sub="desde MongoDB Atlas" icon={Database} tone="neutral" />
        <StatCard label="Tiempo promedio" value={avgTime} sub="duracion al cerrar" icon={Clock} tone="blue" />
      </section>

      <section className="analytics-grid">
        <article className="card">
          <CardTitle icon={TrendingUp} title="Actividad semanal" sub="Tickets abiertos y cerrados por dia" />
          <div className="bar-chart">
            {weeklyData.map(day => (
              <div className="bar-cluster" key={day.key} title={`${day.label}: ${day.open} abiertos, ${day.closed} cerrados`}>
                <span className="bar-total">{day.open + day.closed}</span>
                <div className="bar-pair">
                  <span className="bar open" style={{ height: `${Math.max(5, day.open / weeklyData.max * 150)}px` }} />
                  <span className="bar closed" style={{ height: `${Math.max(5, day.closed / weeklyData.max * 150)}px` }} />
                </div>
                <span className="bar-label">{day.label}</span>
              </div>
            ))}
          </div>
        </article>
        <DonutCard open={stats.open_count || 0} closed={stats.closed_count || 0} total={stats.total_count || 0} />
      </section>

      <section className="card">
        <CardTitle icon={Search} title="Busqueda avanzada" sub="Combina filtros para ubicar tickets especificos.">
          <button className="ghost icon-only" onClick={resetFilters} aria-label="Limpiar filtros"><X size={16} /></button>
        </CardTitle>
        <form className="filters" onSubmit={submit}>
          <Field label="Estado"><select value={filters.status || ""} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option><option value="open">Abiertos</option><option value="closed">Cerrados</option></select></Field>
          <Field label="Prioridad"><select value={filters.priority || ""} onChange={event => setFilters({ ...filters, priority: event.target.value })}><option value="">Todas</option><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></Field>
          <Field label="Departamento"><input value={filters.department || ""} onChange={event => setFilters({ ...filters, department: event.target.value })} placeholder="soporte" /></Field>
          <Field label="Tipo"><input value={filters.type || ""} onChange={event => setFilters({ ...filters, type: event.target.value })} placeholder="Soporte" /></Field>
          <Field label="Usuario"><input value={filters.userId || ""} onChange={event => setFilters({ ...filters, userId: event.target.value })} placeholder="ID de usuario" /></Field>
          <Field label="Numero"><input value={filters.number || ""} onChange={event => setFilters({ ...filters, number: event.target.value })} placeholder="153" /></Field>
          <Field label="Desde"><input type="date" value={filters.from || ""} onChange={event => setFilters({ ...filters, from: event.target.value })} /></Field>
          <Field label="Hasta"><input type="date" value={filters.to || ""} onChange={event => setFilters({ ...filters, to: event.target.value })} /></Field>
          <Field label="Etiqueta"><input value={filters.tag || ""} onChange={event => setFilters({ ...filters, tag: event.target.value })} placeholder="bug, pago" /></Field>
          <button type="submit" className="primary-action"><Search size={16} /> Filtrar</button>
        </form>
      </section>

      <section className={cx("records-grid", selectedTicket && "with-detail")}>
        <TicketsTable tickets={tickets} onSelect={onSelectTicket} />
        {selectedTicket ? <TicketDetail detail={selectedTicket} onClose={() => setSelectedTicket(null)} /> : null}
      </section>
    </section>
  );
}

function getWeeklyData(tickets) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return { key: date.toISOString().slice(0, 10), label: date.toLocaleDateString("es", { weekday: "short" }).replace(".", ""), open: 0, closed: 0 };
  });
  const byKey = new Map(days.map(day => [day.key, day]));
  tickets.forEach(ticket => {
    const opened = toDate(ticket.opened_at);
    const closed = toDate(ticket.closed_at);
    if (opened && byKey.has(opened.toISOString().slice(0, 10))) byKey.get(opened.toISOString().slice(0, 10)).open += 1;
    if (closed && byKey.has(closed.toISOString().slice(0, 10))) byKey.get(closed.toISOString().slice(0, 10)).closed += 1;
  });
  days.max = Math.max(1, ...days.flatMap(day => [day.open, day.closed]));
  return days;
}

function PageHero({ eyebrow, title, copy, children }) {
  return (
    <header className="page-hero">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      {children ? <div className="hero-actions">{children}</div> : null}
    </header>
  );
}

function StatCard({ label, value, sub, icon: Icon, tone }) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <Icon className={`stat-icon ${tone}`} size={32} />
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}

function CardTitle({ icon: Icon, title, sub, children }) {
  return (
    <div className="card-heading">
      <div>
        <h3><Icon size={16} /> {title}</h3>
        {sub ? <span>{sub}</span> : null}
      </div>
      {children}
    </div>
  );
}

function DonutCard({ open, closed, total }) {
  const safeTotal = Math.max(total || open + closed, 0);
  const degrees = safeTotal ? Math.round(open / safeTotal * 360) : 0;
  return (
    <article className="card">
      <CardTitle icon={Activity} title="Distribucion" sub="Estado actual de tickets" />
      <div className="donut-wrap">
        <div className="donut" style={{ background: safeTotal ? `conic-gradient(var(--warn) 0deg ${degrees}deg, var(--ok) ${degrees}deg 360deg)` : "conic-gradient(var(--bg-soft) 0deg 360deg)" }}>
          <span>{safeTotal}</span>
        </div>
        <div className="donut-legend">
          <div className="legend-item"><span><i className="legend-dot open" />Abiertos</span><strong>{open}</strong></div>
          <div className="legend-item"><span><i className="legend-dot closed" />Cerrados</span><strong>{closed}</strong></div>
        </div>
      </div>
    </article>
  );
}

function Field({ label, children }) {
  return <label>{label}{children}</label>;
}

function TicketsTable({ tickets, onSelect }) {
  return (
    <article className="card table-card">
      <CardTitle icon={Activity} title="Actividad reciente" sub="Click en una fila para ver detalle" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Estado</th><th>Tipo</th><th>Prioridad</th><th>Tags</th><th>Usuario</th><th>Atiende</th><th>Abierto</th></tr></thead>
          <tbody>
            {tickets.length ? tickets.map(ticket => {
              const priority = normalizePriority(ticket.priority);
              return (
                <tr key={ticket.id} onClick={() => onSelect(ticket.id)}>
                  <td>{ticket.ticket_number}</td>
                  <td><Badge tone={ticket.status === "closed" ? "green" : "amber"}>{ticket.status === "closed" ? "Cerrado" : "Abierto"}</Badge></td>
                  <td>{ticket.type_label}</td>
                  <td><span className={`priority-badge priority-${priority}`}>{priorityLabel(priority)}</span></td>
                  <td><div className="tag-stack">{ticketTags(ticket).slice(0, 3).map(tag => <span className="tag-badge" key={tag}><Tag size={12} /> {tag}</span>)}</div></td>
                  <td>{ticket.user_id}</td>
                  <td>{ticket.claimed_by || "-"}</td>
                  <td>{formatDate(ticket.opened_at)}</td>
                </tr>
              );
            }) : <tr><td colSpan="8"><Empty>No hay tickets registrados</Empty></td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function TicketDetail({ detail, onClose }) {
  const { ticket, events } = detail;
  const priority = normalizePriority(ticket.priority);
  return (
    <aside className="detail-panel">
      <header>
        <div>
          <span className="eyebrow">Detalle</span>
          <h3>Ticket #{ticket.ticket_number}</h3>
        </div>
        <button className="ghost icon-only" onClick={onClose}><X size={16} /></button>
      </header>
      <p><strong>Tipo:</strong> {ticket.type_label || "-"}</p>
      <p><strong>Prioridad:</strong> <span className={`priority-badge priority-${priority}`}>{priorityLabel(priority)}</span></p>
      <p><strong>Usuario:</strong> {ticket.user_id || "-"}</p>
      <p><strong>Atiende:</strong> {ticket.claimed_by || "-"}</p>
      <p><strong>Motivo:</strong> {ticket.reason || "-"}</p>
      <p><strong>Cierre:</strong> {ticket.close_reason || "-"}</p>
      <p><strong>Eventos:</strong></p>
      <ul className="event-list">
        {events.length ? events.map(event => <li key={`${event.event_type}-${event.created_at}`}>{event.event_type} por {event.actor_id || "-"}<br /><small>{formatDate(event.created_at)}</small></li>) : <li>Sin eventos registrados</li>}
      </ul>
    </aside>
  );
}

function Editor({ guild, panels, activePanel, setActivePanel, activeButtons, setActiveButtons, reloadGuild, reloadPanels }) {
  const [buttonOpen, setButtonOpen] = useState(false);
  const [buttonDraft, setButtonDraft] = useState(emptyButton());
  const [panelDraft, setPanelDraft] = useState(emptyPanel());

  useEffect(() => {
    if (activePanel) {
      setPanelDraft({
        panelId: activePanel.id,
        title: activePanel.title || "",
        description: activePanel.description || "",
        channelId: activePanel.channel_id || "",
        channelName: "",
        defaultCategoryId: activePanel.default_category_id || "",
        defaultCategoryName: ""
      });
      setActiveButtons(activePanel.buttons || []);
    }
  }, [activePanel, setActiveButtons]);

  async function savePanel(event) {
    event.preventDefault();
    const body = {
      title: panelDraft.title,
      description: panelDraft.description,
      channelId: panelDraft.channelId,
      channelName: panelDraft.channelName,
      defaultCategoryId: panelDraft.defaultCategoryId,
      defaultCategoryName: panelDraft.defaultCategoryName
    };
    let panelId = panelDraft.panelId;
    if (panelId) {
      await api(`/api/panels/${panelId}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      const created = await api("/api/panels", { method: "POST", body: JSON.stringify(body) });
      panelId = created.id;
    }
    await reloadGuild();
    const nextPanels = await reloadPanels();
    setActivePanel(nextPanels.find(panel => String(panel.id) === String(panelId)) || null);
  }

  async function saveButton(event) {
    event.preventDefault();
    if (!panelDraft.panelId) return alert("Guarda un panel antes de agregar botones.");
    const body = {
      label: buttonDraft.label,
      style: buttonDraft.style,
      categoryId: buttonDraft.categoryId,
      categoryName: buttonDraft.categoryName,
      staffRoleIds: buttonDraft.staffRoleIds,
      closeRoleIds: buttonDraft.closeRoleIds
    };
    if (buttonDraft.buttonId) {
      await api(`/api/buttons/${buttonDraft.buttonId}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await api(`/api/panels/${panelDraft.panelId}/buttons`, { method: "POST", body: JSON.stringify(body) });
    }
    setButtonOpen(false);
    setButtonDraft(emptyButton());
    await reloadGuild();
    const nextPanels = await reloadPanels();
    const current = nextPanels.find(panel => String(panel.id) === String(panelDraft.panelId));
    setActivePanel(current || null);
    setActiveButtons(current?.buttons || []);
  }

  async function publish() {
    if (!panelDraft.panelId) return alert("Guarda el panel antes de publicarlo.");
    await api(`/api/panels/${panelDraft.panelId}/publish`, { method: "POST", body: "{}" });
    const nextPanels = await reloadPanels();
    setActivePanel(nextPanels.find(panel => String(panel.id) === String(panelDraft.panelId)) || null);
    alert("Panel publicado o actualizado.");
  }

  function newPanel() {
    setActivePanel(null);
    setActiveButtons([]);
    setPanelDraft(emptyPanel());
    setButtonOpen(false);
  }

  return (
    <section className="view-stack">
      <PageHero eyebrow="Constructor" title="Editor visual de paneles" copy="Disena el mensaje, configura botones y publica el panel directamente en Discord.">
        <button className="primary-action" onClick={newPanel}><Plus size={16} /> Nuevo panel</button>
      </PageHero>
      <section className="editor-grid">
        <form className="card panel-form" onSubmit={savePanel}>
          <FormHeader step="01" title="Contenido del panel" copy="Define el mensaje que veran los usuarios antes de abrir un ticket." />
          <Field label="Titulo del panel"><input required maxLength="256" value={panelDraft.title} onChange={event => setPanelDraft({ ...panelDraft, title: event.target.value })} /></Field>
          <Field label="Descripcion"><textarea required maxLength="2000" value={panelDraft.description} onChange={event => setPanelDraft({ ...panelDraft, description: event.target.value })} /></Field>
          <div className="form-split">
            <Field label="Canal del panel"><Select value={panelDraft.channelId} onChange={value => setPanelDraft({ ...panelDraft, channelId: value })} items={guild.channels} /></Field>
            <Field label="Crear canal si no existe"><input placeholder="abrir-ticket" value={panelDraft.channelName} onChange={event => setPanelDraft({ ...panelDraft, channelName: event.target.value })} /></Field>
          </div>
          <div className="form-split">
            <Field label="Categoria por defecto"><Select value={panelDraft.defaultCategoryId} onChange={value => setPanelDraft({ ...panelDraft, defaultCategoryId: value })} items={guild.categories} /></Field>
            <Field label="Crear categoria si no existe"><input placeholder="tickets" value={panelDraft.defaultCategoryName} onChange={event => setPanelDraft({ ...panelDraft, defaultCategoryName: event.target.value })} /></Field>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-action"><Save size={16} /> Guardar panel</button>
            <button type="button" className="secondary publish-action" onClick={publish}><Send size={16} /> Publicar en Discord</button>
          </div>
        </form>
        <Preview guild={guild} panel={panelDraft} buttons={activeButtons} />
      </section>
      <section className="card buttons-editor">
        <div className="section-title">
          <FormHeader step="02" title="Botones del panel" copy="Configura el flujo, color y permisos de cada tipo de ticket." />
          <button className="primary-action" onClick={() => { setButtonDraft(emptyButton()); setButtonOpen(true); }}><Plus size={16} /> Agregar boton</button>
        </div>
        <div className="button-list">
          {activeButtons.length ? activeButtons.map(button => (
            <article className="list-card" key={button.id}>
              <div>
                <h3>{button.label}</h3>
                <div className="list-card-meta"><span className={`fake-btn ${button.style}`}>{button.style}</span><span>{button.categoryName || button.category_id || "sin categoria"}</span></div>
              </div>
              <div className="actions">
                <button className="secondary" onClick={() => { setButtonDraft(fromButton(button)); setButtonOpen(true); }}><PenTool size={15} /> Editar</button>
                <button className="danger" onClick={async () => { if (confirm("Borrar este boton?")) { await api(`/api/buttons/${button.id}`, { method: "DELETE" }); const next = await reloadPanels(); setActivePanel(next.find(panel => String(panel.id) === String(panelDraft.panelId)) || null); } }}><Trash2 size={15} /> Borrar</button>
              </div>
            </article>
          )) : <Empty>Guarda un panel y agrega el primer boton.</Empty>}
        </div>
        {buttonOpen ? <ButtonForm guild={guild} draft={buttonDraft} setDraft={setButtonDraft} onSubmit={saveButton} onCancel={() => setButtonOpen(false)} /> : null}
      </section>
    </section>
  );
}

function emptyPanel() {
  return { panelId: "", title: "", description: "", channelId: "", channelName: "", defaultCategoryId: "", defaultCategoryName: "" };
}

function emptyButton() {
  return { buttonId: "", label: "", style: "azul", categoryId: "", categoryName: "", staffRoleIds: [], closeRoleIds: [] };
}

function fromButton(button) {
  return {
    buttonId: button.id,
    label: button.label || "",
    style: button.style || "azul",
    categoryId: button.category_id || "",
    categoryName: "",
    staffRoleIds: button.staff_role_ids || [],
    closeRoleIds: button.close_role_ids || []
  };
}

function FormHeader({ step, title, copy }) {
  return <div className="form-header"><span className="step-number">{step}</span><div><h3>{title}</h3><p>{copy}</p></div></div>;
}

function Select({ items = [], value, onChange }) {
  return (
    <select value={value || ""} onChange={event => onChange(event.target.value)}>
      <option value="">Seleccionar</option>
      {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
  );
}

function MultiSelect({ items = [], value = [], onChange }) {
  return (
    <select multiple value={value} onChange={event => onChange([...event.target.selectedOptions].map(option => option.value))}>
      {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
  );
}

function Preview({ guild, panel, buttons }) {
  const channelName = panel.channelId
    ? guild.channels.find(channel => channel.id === panel.channelId)?.name || "canal-de-tickets"
    : panel.channelName || "canal-de-tickets";
  const accentStyle = {
    azul: "#5865f2",
    gris: "#99aab5",
    verde: "#57f287",
    rojo: "#ed4245"
  }[buttons[0]?.style] || "#5865f2";

  return (
    <section className="card preview">
      <FormHeader step="Vista" title="Previsualizacion Discord" copy="Asi se vera el mensaje en tu servidor." />
      <div className="discord-frame">
        <div className="discord-channel">
          <span>#</span>
          <strong>{channelName}</strong>
        </div>
        <div className="discord-message-area">
          <div className="discord-message">
            <div className="bot-avatar">
              <CheckCircle2 size={22} />
            </div>
            <div className="message-body">
              <div className="message-meta">
                <strong>Ticket Bot</strong>
                <span>APP</span>
                <small>Hoy a las {new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</small>
              </div>
              <div className="discord-embed">
                <div className="embed-accent" style={{ backgroundColor: accentStyle }} />
                <div className="embed-content">
                  <div className="embed-author">
                    <span className="mini-avatar"><CheckCircle2 size={12} /></span>
                    <strong>Ticket Bot</strong>
                  </div>
                  <h4>{panel.title || "Titulo del panel"}</h4>
                  <p>{panel.description || "Descripcion del panel - escribe algo para ver la previsualizacion en tiempo real."}</p>
                  <footer>Sistema de tickets - Hoy a las {new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</footer>
                </div>
              </div>
              <div className="button-preview">
                {(buttons.length ? buttons : [{ id: "demo", label: "Crear ticket", style: "azul" }]).map(button => (
                  <button type="button" className={`discord-button ${button.style}`} key={button.id}>{button.label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="discord-input">
          <Plus size={18} />
          <span>Mensaje #{channelName}</span>
          <span>...</span>
        </div>
      </div>
    </section>
  );
}

function ButtonForm({ guild, draft, setDraft, onSubmit, onCancel }) {
  return (
    <form className="button-form" onSubmit={onSubmit}>
      <Field label="Texto"><input required maxLength="80" value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} /></Field>
      <Field label="Color"><select value={draft.style} onChange={event => setDraft({ ...draft, style: event.target.value })}><option value="azul">Azul</option><option value="gris">Gris</option><option value="verde">Verde</option><option value="rojo">Rojo</option></select></Field>
      <Field label="Categoria"><Select value={draft.categoryId} onChange={value => setDraft({ ...draft, categoryId: value })} items={guild.categories} /></Field>
      <Field label="Crear categoria si no existe"><input value={draft.categoryName} onChange={event => setDraft({ ...draft, categoryName: event.target.value })} placeholder="tickets" /></Field>
      <Field label="Roles staff"><MultiSelect items={guild.roles} value={draft.staffRoleIds} onChange={value => setDraft({ ...draft, staffRoleIds: value })} /></Field>
      <Field label="Roles cierre"><MultiSelect items={guild.roles} value={draft.closeRoleIds} onChange={value => setDraft({ ...draft, closeRoleIds: value })} /></Field>
      <div className="form-actions"><button type="submit" className="primary-action"><Save size={16} /> Guardar boton</button><button type="button" className="secondary" onClick={onCancel}><X size={16} /> Cancelar</button></div>
    </form>
  );
}

function Panels({ panels, onEdit, reloadPanels, setActivePanel }) {
  async function publish(panelId) {
    await api(`/api/panels/${panelId}/publish`, { method: "POST", body: "{}" });
    await reloadPanels();
  }

  async function remove(panelId) {
    if (!confirm("Borrar este panel y su mensaje publicado?")) return;
    await api(`/api/panels/${panelId}`, { method: "DELETE" });
    setActivePanel(null);
    await reloadPanels();
  }

  return (
    <section className="view-stack">
      <PageHero eyebrow="Inventario" title="Paneles configurados" copy="Revisa estado de publicacion, edita paneles existentes o elimina configuraciones obsoletas." />
      <div className="panel-list">
        {panels.length ? panels.map(panel => (
          <article className="list-card" key={panel.id}>
            <div className="list-card-header">
              <div>
                <h3>{panel.title}</h3>
                <div className="list-card-meta">
                  <Badge tone={panel.status === "publicado" ? "green" : panel.status?.includes("no encontrado") ? "red" : "neutral"}>{panel.status || "sin publicar"}</Badge>
                  <span>ID {panel.id}</span>
                  <span>#{panel.channelName || panel.channel_id || "-"}</span>
                </div>
              </div>
              <span className="button-chip">{panel.buttons.length} botones</span>
            </div>
            <p>{panel.description}</p>
            <div className="actions">
              <button className="secondary" onClick={() => onEdit(panel)}><PenTool size={15} /> Editar</button>
              <button className="secondary publish-action" onClick={() => publish(panel.id)}><Send size={15} /> Publicar</button>
              <button className="danger" onClick={() => remove(panel.id)}><Trash2 size={15} /></button>
            </div>
          </article>
        )) : <Empty>No hay paneles configurados</Empty>}
      </div>
    </section>
  );
}

function Profile() {
  const [userId, setUserId] = useState("");
  const [tickets, setTickets] = useState(null);

  async function search(event) {
    event.preventDefault();
    if (!userId.trim()) return;
    setTickets(await api(`/api/tickets?${new URLSearchParams({ userId: userId.trim() }).toString()}`));
  }

  return (
    <section className="view-stack">
      <PageHero eyebrow="Perfiles" title="Perfil de usuario" copy="Busca un ID de Discord para revisar actividad, tickets abiertos y historial cerrado." />
      <section className="card profile-search">
        <CardTitle icon={UserSearch} title="Buscar usuario" sub="Usa el ID de Discord registrado en los tickets." />
        <form className="profile-form" onSubmit={search}>
          <input value={userId} onChange={event => setUserId(event.target.value)} placeholder="ID de usuario de Discord" />
          <button type="submit"><Search size={16} /> Buscar</button>
        </form>
      </section>
      {tickets ? <ProfileResult userId={userId} tickets={tickets} /> : null}
    </section>
  );
}

function ProfileResult({ userId, tickets }) {
  const open = tickets.filter(ticket => ticket.status === "open").length;
  const closed = tickets.filter(ticket => ticket.status === "closed").length;
  const latest = [...tickets].sort((a, b) => (toDate(b.opened_at)?.getTime() || 0) - (toDate(a.opened_at)?.getTime() || 0))[0];
  return (
    <section className="profile-result">
      <div className="profile-grid">
        <article className="profile-card"><div className="profile-avatar"><User size={26} /></div><h3>{userId}</h3><p>{latest ? `Ultima actividad ${timeAgo(latest.opened_at)}` : "Sin tickets registrados"}</p></article>
        <article className="profile-card"><span className="eyebrow">Total</span><strong>{tickets.length}</strong><p>tickets registrados</p></article>
        <article className="profile-card"><span className="eyebrow">Abiertos</span><strong>{open}</strong><p>requieren seguimiento</p></article>
        <article className="profile-card"><span className="eyebrow">Cerrados</span><strong>{closed}</strong><p>historial disponible</p></article>
      </div>
      <TicketsTable tickets={tickets} onSelect={() => {}} />
    </section>
  );
}

function App() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guild, setGuild] = useState({ channels: [], categories: [], roles: [] });
  const [stats, setStats] = useState({ open_count: 0, closed_count: 0, total_count: 0 });
  const [tickets, setTickets] = useState([]);
  const [panels, setPanels] = useState([]);
  const [view, setView] = useState("dashboard");
  const [activePanel, setActivePanel] = useState(null);
  const [activeButtons, setActiveButtons] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("ticket_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("ticket_theme", theme);
  }, [theme]);

  useEffect(() => {
    boot();
  }, []);

  async function boot() {
    try {
      const me = await api("/api/me");
      setAuthed(me.authed);
      setLoading(false);
      if (me.authed) await loadAll();
    } catch (error) {
      console.error(error);
      setAuthed(false);
      setLoading(false);
    }
  }

  async function loadGuild() {
    const next = await api("/api/guild");
    setGuild(next);
    return next;
  }

  async function loadPanels() {
    const next = await api("/api/panels");
    setPanels(next);
    return next;
  }

  async function loadAll() {
    const [nextGuild, nextStats, nextTickets, nextPanels] = await Promise.all([
      api("/api/guild"),
      api("/api/stats"),
      api("/api/tickets"),
      api("/api/panels")
    ]);
    setGuild(nextGuild);
    setStats(nextStats);
    setTickets(nextTickets);
    setPanels(nextPanels);
  }

  async function logout() {
    await api("/api/logout", { method: "POST", body: "{}" });
    location.reload();
  }

  async function selectTicket(ticketId) {
    setSelectedTicket(await api(`/api/tickets/${ticketId}`));
  }

  if (loading) return <main className="login-shell"><div className="login-card">Cargando...</div></main>;
  if (!authed) return <Login onAuthed={async () => { setAuthed(true); await loadAll().catch(console.error); }} />;

  return (
    <Layout guild={guild} view={view} setView={setView} theme={theme} setTheme={setTheme} tickets={tickets} onLogout={logout}>
      {view === "dashboard" ? <Dashboard stats={stats} tickets={tickets} onTickets={setTickets} onSelectTicket={selectTicket} selectedTicket={selectedTicket} setSelectedTicket={setSelectedTicket} /> : null}
      {view === "editor" ? <Editor guild={guild} panels={panels} activePanel={activePanel} setActivePanel={setActivePanel} activeButtons={activeButtons} setActiveButtons={setActiveButtons} reloadGuild={loadGuild} reloadPanels={loadPanels} /> : null}
      {view === "panels" ? <Panels panels={panels} reloadPanels={loadPanels} setActivePanel={setActivePanel} onEdit={panel => { setActivePanel(panel); setActiveButtons(panel.buttons || []); setView("editor"); }} /> : null}
      {view === "profile" ? <Profile /> : null}
    </Layout>
  );
}

createRoot(document.getElementById("root")).render(<App />);
