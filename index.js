const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    Collection,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require("discord.js");
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { readGuildConfig, getGuildConfig, hasConfigAccess } = require("./utils/guildConfig");
const { upsertFormPanel } = require("./utils/formPanel");
const { initDb } = require("./utils/db");
const { startWebServer } = require("./web/server");
const {
    buildTicketControls,
    buildTicketEmbed,
    claimTicket,
    closeModalCustomId,
    closeTicket,
    createTicket
} = require("./utils/ticketService");
const {
    handleTicketSetupButton,
    handleTicketSetupModal,
    handleTicketSetupSelect
} = require("./utils/ticketSetupUi");

function loadLocalConfig() {
    try {
        return require("./config.json");
    } catch (error) {
        if (error.code !== "MODULE_NOT_FOUND") {
            console.error("No se pudo leer config.json:", error);
        }
        return {};
    }
}

const config = loadLocalConfig();
const TOKEN = String(process.env.DISCORD_TOKEN || config.token || "").trim();
const CLIENT_ID = String(process.env.CLIENT_ID || config.clientId || "").trim();
const ENABLE_MESSAGE_CONTENT_INTENT = String(process.env.ENABLE_MESSAGE_CONTENT_INTENT || "false").toLowerCase() === "true";

if (!TOKEN || !CLIENT_ID) {
    console.error("Falta configurar DISCORD_TOKEN y CLIENT_ID en .env, o token/clientId en config.json.");
    process.exit(1);
}

const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
];

if (ENABLE_MESSAGE_CONTENT_INTENT) {
    intents.push(GatewayIntentBits.MessageContent);
}

const client = new Client({ intents });

client.commands = new Collection();
const processedMessages = new Set();
const pendingTicketCloses = new Map();
const EPHEMERAL = MessageFlags.Ephemeral;

const commands = [];
const commandPath = path.join(__dirname, "comandos");
const commandFiles = fs.readdirSync(commandPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
    const command = require(path.join(commandPath, file));
    if (!command.data?.name || typeof command.execute !== "function") {
        console.warn(`Comando ignorado por formato invalido: ${file}`);
        continue;
    }

    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    try {
        console.log("Actualizando comandos...");
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log("Comandos actualizados.");
    } catch (error) {
        console.error("No se pudieron actualizar los comandos:", error);
    }
})();

function normalizeReplyOptions(payload = {}) {
    const { ephemeral, ...normalized } = payload;
    if (ephemeral) normalized.flags = EPHEMERAL;
    return normalized;
}

function isUnknownInteraction(error) {
    return error?.code === 10062 || error?.rawError?.code === 10062;
}

async function safeReply(interaction, payload) {
    const normalized = normalizeReplyOptions(payload);

    if (interaction.deferred && !interaction.replied) {
        const { flags, ...editable } = normalized;
        return interaction.editReply(editable).catch(error => {
            if (!isUnknownInteraction(error)) console.error(error);
        });
    }

    if (interaction.replied) {
        return interaction.followUp(normalized).catch(error => {
            if (!isUnknownInteraction(error)) console.error(error);
        });
    }

    return interaction.reply(normalized).catch(error => {
        if (!isUnknownInteraction(error)) console.error(error);
    });
}

function buildProcessedRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`aceptar_${userId}`)
            .setLabel("Aceptar")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`denegar_${userId}`)
            .setLabel("Denegar")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
    );
}

async function sendStatusMessage(guild, userId, accepted) {
    const cfg = getGuildConfig(guild.id);
    const statusId = cfg.statusChannel || cfg.requestChannel;
    const channel = statusId ? guild.channels.cache.get(statusId) : null;
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle("Estado de Solicitud")
        .setDescription(`Usuario: <@${userId}>\nEstado: ${accepted ? "Aceptada" : "Denegada"}`)
        .setColor(accepted ? 0x3ba55d : 0xed4245);

    await channel.send({ embeds: [embed] }).catch(error => {
        console.error(`No se pudo enviar estado de solicitud a ${channel.id}:`, error);
    });
}

async function handleCommand(interaction) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    if (interaction.commandName === "solicitud" || command.skipGlobalPermission) {
        await command.execute(interaction);
        return;
    }

    const permission = interaction.commandName === "setrol"
        ? PermissionsBitField.Flags.ManageRoles
        : PermissionsBitField.Flags.ManageGuild;

    if (!hasConfigAccess(interaction, permission)) {
        await interaction.reply({ content: "No tienes permisos para usar comandos.", flags: EPHEMERAL });
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error ejecutando /${interaction.commandName}:`, error);
        await safeReply(interaction, {
            content: "Ocurrio un error al ejecutar el comando.",
            flags: EPHEMERAL
        });
    }
}

async function handleModal(interaction) {
    if (await handleTicketSetupModal(interaction)) return;

    if (interaction.customId.startsWith("ticket_open_modal_")) {
        await interaction.deferReply({ flags: EPHEMERAL });
        const buttonId = Number(interaction.customId.replace("ticket_open_modal_", ""));
        const reason = interaction.fields.getTextInputValue("ticket_reason");
        const result = await createTicket(interaction, buttonId, reason);
        if (result.duplicate) {
            await interaction.editReply({ content: `Ya tienes un ticket abierto de este tipo: <#${result.duplicate.channel_id}>` });
            return;
        }

        await interaction.editReply({ content: `Ticket creado: <#${result.channel.id}>` });
        return;
    }

    if (interaction.customId.startsWith("ticket_close_modal_")) {
        const ticketId = Number(interaction.customId.replace("ticket_close_modal_", ""));
        const closeReason = interaction.fields.getTextInputValue("close_reason");
        const key = `${ticketId}:${interaction.user.id}`;
        pendingTicketCloses.set(key, closeReason);
        setTimeout(() => pendingTicketCloses.delete(key), 5 * 60 * 1000);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket_close_confirm_${ticketId}`)
                .setLabel("Confirmar cierre")
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({
            content: "Confirma el cierre del ticket. Esta accion marcara el ticket como cerrado y eliminara el canal.",
            components: [row],
            flags: EPHEMERAL
        });
        return;
    }

    if (interaction.customId !== "form_solicitud") return;

    const answer = interaction.fields.getTextInputValue("respuesta1");
    const cfg = getGuildConfig(interaction.guild.id);
    const modId = cfg.modChannel;
    if (!modId) {
        await interaction.reply({ content: "No hay canal de moderacion configurado. Usa /setup.", flags: EPHEMERAL });
        return;
    }

    const channel = interaction.guild.channels.cache.get(modId);
    if (!channel) {
        await interaction.reply({ content: "El canal de moderacion configurado no existe.", flags: EPHEMERAL });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("Nueva Solicitud")
        .setDescription(`**Usuario:** <@${interaction.user.id}>\n\n**Respuesta:**\n${answer}`)
        .setColor(0x00a6ff);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aceptar_${interaction.user.id}`).setLabel("Aceptar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`denegar_${interaction.user.id}`).setLabel("Denegar").setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: "Formulario enviado al staff.", flags: EPHEMERAL });
}

async function handleAccept(interaction, userId) {
    if (!hasConfigAccess(interaction, PermissionsBitField.Flags.ManageRoles)) {
        await interaction.reply({ content: "No tienes permisos para moderar.", flags: EPHEMERAL });
        return;
    }

    const cfg = getGuildConfig(interaction.guild.id);
    const approvedId = cfg.approvedRole;
    if (!approvedId) {
        await interaction.reply({ content: "No hay rol aprobado configurado. Usa /setrol.", flags: EPHEMERAL });
        return;
    }

    const role = interaction.guild.roles.cache.get(approvedId);
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member || !role) {
        await interaction.reply({ content: "No se pudo agregar el rol configurado.", flags: EPHEMERAL });
        return;
    }

    const botMember = interaction.guild.members.me;
    if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        await interaction.reply({ content: "El bot no tiene permiso para gestionar roles.", flags: EPHEMERAL });
        return;
    }

    if (botMember.roles.highest.comparePositionTo(role) <= 0) {
        await interaction.reply({ content: "El rol aprobado esta por encima del rol del bot.", flags: EPHEMERAL });
        return;
    }

    if (botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
        await interaction.reply({ content: "No se puede modificar roles de este usuario por jerarquia.", flags: EPHEMERAL });
        return;
    }

    try {
        await member.roles.add(role);
    } catch (error) {
        console.error(`No se pudo agregar el rol ${role.id} a ${member.id}:`, error);
        await interaction.reply({ content: "No se pudo agregar el rol. Verifica permisos y jerarquia.", flags: EPHEMERAL });
        return;
    }

    processedMessages.add(interaction.message.id);
    await interaction.reply({ content: `Solicitud aceptada. Rol agregado a <@${userId}>.` });
    await interaction.message.edit({ components: [buildProcessedRow(userId)] }).catch(console.error);
    await sendStatusMessage(interaction.guild, userId, true);
}

async function handleDeny(interaction, userId) {
    if (!hasConfigAccess(interaction, PermissionsBitField.Flags.ManageRoles)) {
        await interaction.reply({ content: "No tienes permisos para moderar.", flags: EPHEMERAL });
        return;
    }

    processedMessages.add(interaction.message.id);
    await interaction.reply({ content: `Solicitud denegada para <@${userId}> por ${interaction.user.tag}.` });
    await interaction.message.edit({ components: [buildProcessedRow(userId)] }).catch(console.error);
    await sendStatusMessage(interaction.guild, userId, false);
}

async function handleButton(interaction) {
    if (await handleTicketSetupButton(interaction)) return;

    if (interaction.customId === "open_form") {
        const openForm = require("./comandos/solicitud.js");
        await openForm.execute(interaction);
        return;
    }

    if (interaction.customId.startsWith("ticket_open_")) {
        const buttonId = Number(interaction.customId.replace("ticket_open_", ""));
        const modal = new ModalBuilder()
            .setCustomId(`ticket_open_modal_${buttonId}`)
            .setTitle("Abrir Ticket");
        const reason = new TextInputBuilder()
            .setCustomId("ticket_reason")
            .setLabel("Motivo del ticket")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reason));
        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId.startsWith("ticket_claim_")) {
        const ticketId = Number(interaction.customId.replace("ticket_claim_", ""));
        const result = await claimTicket(interaction, ticketId);
        if (result.denied) {
            await interaction.reply({ content: "No tienes permisos para atender este ticket.", flags: EPHEMERAL });
            return;
        }
        if (result.alreadyClaimed) {
            await interaction.reply({ content: `Este ticket ya esta siendo atendido por <@${result.alreadyClaimed.claimed_by}>.`, flags: EPHEMERAL });
            return;
        }

        await interaction.reply({ content: `Ticket atendido por <@${interaction.user.id}>.` });
        await interaction.message.edit({
            embeds: [buildTicketEmbed(result.ticket)],
            components: [buildTicketControls(result.ticket)]
        }).catch(console.error);
        return;
    }

    if (interaction.customId.startsWith("ticket_close_confirm_")) {
        const ticketId = Number(interaction.customId.replace("ticket_close_confirm_", ""));
        const key = `${ticketId}:${interaction.user.id}`;
        const closeReason = pendingTicketCloses.get(key);
        if (!closeReason) {
            await interaction.reply({ content: "La confirmacion de cierre expiro. Usa /close o el boton Cerrar otra vez.", flags: EPHEMERAL });
            return;
        }

        const result = await closeTicket(interaction, ticketId, closeReason);
        if (result.denied) {
            await interaction.reply({ content: "No tienes permisos para cerrar este ticket.", flags: EPHEMERAL });
            return;
        }

        pendingTicketCloses.delete(key);
        await interaction.update({ content: "Ticket cerrado. Este canal sera eliminado.", components: [] });
        setTimeout(() => {
            interaction.channel?.delete(`Ticket cerrado por ${interaction.user.tag}: ${closeReason}`).catch(console.error);
        }, 3000);
        return;
    }

    if (interaction.customId.startsWith("ticket_close_")) {
        const ticketId = Number(interaction.customId.replace("ticket_close_", ""));
        const modal = new ModalBuilder()
            .setCustomId(closeModalCustomId(ticketId))
            .setTitle("Cerrar Ticket");
        const reason = new TextInputBuilder()
            .setCustomId("close_reason")
            .setLabel("Razon de cierre")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reason));
        await interaction.showModal(modal);
        return;
    }

    const match = /^(aceptar|denegar)_(\d+)$/.exec(interaction.customId);
    if (!match) return;

    if (processedMessages.has(interaction.message.id)) {
        await interaction.reply({ content: "Esta solicitud ya fue procesada.", flags: EPHEMERAL });
        return;
    }

    const [, action, userId] = match;
    if (action === "aceptar") {
        await handleAccept(interaction, userId);
        return;
    }

    await handleDeny(interaction, userId);
}

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            await handleCommand(interaction);
            return;
        }

        if (interaction.isModalSubmit()) {
            await handleModal(interaction);
            return;
        }

        if (interaction.isButton()) {
            await handleButton(interaction);
            return;
        }

        if (interaction.isAnySelectMenu()) {
            await handleTicketSetupSelect(interaction);
        }
    } catch (error) {
        console.error("Error manejando interaccion:", error);
        if (interaction.isRepliable()) {
            await safeReply(interaction, {
                content: "Ocurrio un error inesperado.",
                flags: EPHEMERAL
            });
        }
    }
});

client.once("clientReady", async () => {
    console.log(`Bot conectado como ${client.user.tag}`);
    await initDb().catch(error => {
        console.error("No se pudo inicializar MongoDB. Los tickets no funcionaran hasta configurar la base de datos:", error);
    });
    startWebServer(client);

    const guildConfig = readGuildConfig();
    for (const [guildId, cfg] of Object.entries(guildConfig)) {
        if (!cfg.requestChannel) continue;

        const channel = client.channels.cache.get(cfg.requestChannel);
        if (!channel) continue;

        await upsertFormPanel(channel, client.user.id, cfg).catch(error => {
            console.error(`No se pudo actualizar panel de formulario para ${guildId}:`, error);
        });
    }
});

client.login(TOKEN).catch(error => {
    if (error.code === "TokenInvalid") {
        console.error("Token invalido. Revisa DISCORD_TOKEN en .env o token en config.json.");
        return;
    }

    console.error("No se pudo iniciar sesion en Discord:", error);
});
