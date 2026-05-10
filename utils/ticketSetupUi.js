const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");
const { hasConfigAccess } = require("./guildConfig");
const {
    addButton,
    createPanel,
    deletePanel,
    getLatestPanel,
    getPanelButtons,
    getPanels,
    publishPanel
} = require("./ticketService");

const sessions = new Map();

function sessionKey(interaction) {
    return `${interaction.guild.id}:${interaction.user.id}`;
}

function getSession(interaction) {
    const key = sessionKey(interaction);
    const session = sessions.get(key) || {};
    sessions.set(key, session);
    return session;
}

function clearSession(interaction) {
    sessions.delete(sessionKey(interaction));
}

function normalizeChannelName(name) {
    return name
        .trim()
        .toLowerCase()
        .replace(/^#/, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/g, "")
        .slice(0, 90);
}

function parseRoleIds(input) {
    return [...new Set((input.match(/\d{17,20}/g) || []))];
}

function inputValue(value, maxLength) {
    return String(value || "").slice(0, maxLength);
}

function withSuggestedValue(input, value, maxLength) {
    const suggested = inputValue(value, maxLength);
    return suggested ? input.setValue(suggested) : input;
}

function findSuggestedTextChannel(interaction) {
    if (interaction.channel?.type === ChannelType.GuildText) return interaction.channel;

    const keywords = ["ticket", "soporte", "support", "formulario", "ayuda", "abrir"];
    return interaction.guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildText
        && keywords.some(keyword => channel.name.toLowerCase().includes(keyword))
    ) || interaction.guild.channels.cache.find(channel => channel.type === ChannelType.GuildText);
}

function findSuggestedCategory(interaction) {
    const keywords = ["ticket", "soporte", "support", "ayuda"];
    return interaction.guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildCategory
        && keywords.some(keyword => channel.name.toLowerCase().includes(keyword))
    ) || interaction.channel?.parent || interaction.guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory);
}

function findSuggestedRoles(interaction, keywords, limit = 3) {
    return interaction.guild.roles.cache
        .filter(role =>
            role.id !== interaction.guild.id
            && keywords.some(keyword => role.name.toLowerCase().includes(keyword))
        )
        .sort((a, b) => b.position - a.position)
        .first(limit)
        .map(role => `<@&${role.id}>`)
        .join(" ");
}

function panelSuggestions(interaction) {
    const channel = findSuggestedTextChannel(interaction);
    const category = findSuggestedCategory(interaction);

    return {
        title: "Soporte",
        description: "Selecciona una opcion para abrir un ticket y el staff te atendera lo antes posible.",
        channelName: channel?.name || "abrir-ticket",
        categoryName: category?.name || "tickets"
    };
}

function buttonSuggestions(interaction) {
    const category = findSuggestedCategory(interaction);
    const staffRoles = findSuggestedRoles(interaction, ["staff", "mod", "moderador", "soporte", "support", "helper"]);
    const closeRoles = findSuggestedRoles(interaction, ["admin", "staff", "mod", "moderador", "soporte", "owner"]);

    return {
        label: "Soporte",
        color: "azul",
        categoryName: category?.name || "tickets",
        staffRoles,
        closeRoles: closeRoles || staffRoles
    };
}

function parseStyle(input) {
    const value = input.trim().toLowerCase();
    if (["azul", "gris", "verde", "rojo"].includes(value)) return value;
    if (["blue", "primary"].includes(value)) return "azul";
    if (["gray", "grey", "secondary"].includes(value)) return "gris";
    if (["green", "success"].includes(value)) return "verde";
    if (["red", "danger"].includes(value)) return "rojo";
    return null;
}

async function findOrCreateTextChannel(guild, name) {
    const normalized = normalizeChannelName(name);
    let channel = guild.channels.cache.find(item =>
        item.type === ChannelType.GuildText && item.name === normalized
    );

    if (!channel) {
        channel = await guild.channels.create({
            name: normalized,
            type: ChannelType.GuildText,
            reason: "Canal de panel de tickets creado desde asistente"
        });
    }

    return channel;
}

async function findOrCreateCategory(guild, name) {
    const normalized = normalizeChannelName(name);
    let category = guild.channels.cache.find(item =>
        item.type === ChannelType.GuildCategory && item.name.toLowerCase() === normalized
    );

    if (!category) {
        category = await guild.channels.create({
            name: normalized,
            type: ChannelType.GuildCategory,
            reason: "Categoria de tickets creada desde asistente"
        });
    }

    return category;
}

async function requireSetupAccess(interaction) {
    if (hasConfigAccess(interaction, PermissionFlagsBits.ManageGuild)) return true;

    const payload = { content: "No tienes permisos para configurar tickets.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(console.error);
    } else {
        await interaction.reply(payload).catch(console.error);
    }
    return false;
}

function homePayload(ephemeral = false) {
    const embed = new EmbedBuilder()
        .setTitle("Asistente de Tickets")
        .setDescription("Configura el sistema de tickets desde este panel. Primero crea un panel, despues agrega botones y al final publicalo.")
        .addFields(
            { name: "Crear panel", value: "Abre una ventana para titulo, descripcion, canal del panel y categoria de tickets.", inline: false },
            { name: "Agregar boton", value: "Abre una ventana para texto, color, categoria y roles.", inline: false },
            { name: "Publicar", value: "Publica o actualiza el mensaje final con los botones configurados.", inline: false }
        )
        .setColor(0x00a6ff);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_setup_panel_start")
            .setLabel("Crear panel")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("ticket_setup_button_start")
            .setLabel("Agregar boton")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("ticket_setup_publish_start")
            .setLabel("Publicar panel")
            .setStyle(ButtonStyle.Secondary)
    );

    const payload = { embeds: [embed], components: [row] };
    if (ephemeral) payload.ephemeral = true;
    return payload;
}

function showFullPanelModal(interaction) {
    const suggestions = panelSuggestions(interaction);
    const modal = new ModalBuilder()
        .setCustomId("ticket_setup_full_panel_modal")
        .setTitle("Crear panel de tickets");

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId("panel_title")
                .setLabel("Titulo del panel")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(256)
                .setValue(inputValue(suggestions.title, 256))
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId("panel_description")
                .setLabel("Descripcion del panel")
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(2000)
                .setValue(inputValue(suggestions.description, 2000))
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId("panel_channel")
                .setLabel("Canal donde aparecera el panel")
                .setPlaceholder(`Sugerido: ${suggestions.channelName}`)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(90)
                .setValue(inputValue(suggestions.channelName, 90))
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId("ticket_category")
                .setLabel("Categoria donde se abriran tickets")
                .setPlaceholder(`Sugerido: ${suggestions.categoryName}`)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(90)
                .setValue(inputValue(suggestions.categoryName, 90))
                .setRequired(true)
        )
    );

    return interaction.showModal(modal);
}

function showFullButtonModal(interaction) {
    const suggestions = buttonSuggestions(interaction);
    const modal = new ModalBuilder()
        .setCustomId("ticket_setup_full_button_modal")
        .setTitle("Crear boton de ticket");

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId("button_label")
                .setLabel("Texto del boton")
                .setPlaceholder(`Sugerido: ${suggestions.label}`)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(80)
                .setValue(inputValue(suggestions.label, 80))
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId("button_color")
                .setLabel("Color: azul, gris, verde o rojo")
                .setPlaceholder(`Sugerido: ${suggestions.color}`)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(20)
                .setValue(inputValue(suggestions.color, 20))
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId("ticket_category")
                .setLabel("Categoria donde se abriran tickets")
                .setPlaceholder(`Sugerido: ${suggestions.categoryName}`)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(90)
                .setValue(inputValue(suggestions.categoryName, 90))
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            withSuggestedValue(new TextInputBuilder()
                .setCustomId("staff_roles")
                .setLabel("Roles staff (menciona o pega IDs)")
                .setPlaceholder("Sugerido: roles con staff, mod o soporte")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(500)
                .setRequired(true), suggestions.staffRoles, 500)
        ),
        new ActionRowBuilder().addComponents(
            withSuggestedValue(new TextInputBuilder()
                .setCustomId("close_roles")
                .setLabel("Roles que pueden cerrar")
                .setPlaceholder("Sugerido: roles con admin, staff o soporte")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(500)
                .setRequired(true), suggestions.closeRoles, 500)
        )
    );

    return interaction.showModal(modal);
}

async function sendTicketSetupHome(interaction) {
    if (!(await requireSetupAccess(interaction))) return;
    await interaction.reply(homePayload(true));
}

async function showDeletePanelSelect(interaction) {
    if (!(await requireSetupAccess(interaction))) return;

    const panels = await getPanels(interaction.guild.id);
    if (panels.length === 0) {
        await interaction.reply({ content: "No hay paneles de tickets para borrar.", ephemeral: true });
        return;
    }

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("ticket_setup_delete_panel")
            .setPlaceholder("Selecciona el panel que quieres borrar")
            .addOptions(panels.map(panel => ({
                label: `Panel ${panel.id}`,
                description: `${panel.title} | #${interaction.guild.channels.cache.get(panel.channel_id)?.name || "canal"}`.slice(0, 100),
                value: String(panel.id)
            })))
    );

    await interaction.reply({
        content: "Selecciona el panel que quieres borrar. Si estaba publicado, tambien se eliminara el mensaje del panel.",
        components: [row],
        ephemeral: true
    });
}

async function updateTicketSetupHome(interaction) {
    await interaction.update(homePayload());
}

async function showPanelChannelSelect(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId("ticket_setup_panel_channel")
            .setPlaceholder("Elige el canal donde se publicara el panel")
            .setChannelTypes(ChannelType.GuildText)
            .setMinValues(1)
            .setMaxValues(1)
    );

    await interaction.update({
        content: "Selecciona el canal de texto donde quieres que aparezca el panel de tickets.",
        embeds: [],
        components: [row]
    });
}

async function showPanelCategorySelect(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId("ticket_setup_panel_category")
            .setPlaceholder("Elige la categoria donde se abriran los tickets")
            .setChannelTypes(ChannelType.GuildCategory)
            .setMinValues(1)
            .setMaxValues(1)
    );

    await interaction.update({
        content: "Selecciona la categoria donde se crearan los canales de tickets.",
        embeds: [],
        components: [row]
    });
}

async function showPanelSelect(interaction, customId, placeholder) {
    const panels = await getPanels(interaction.guild.id);
    if (panels.length === 0) {
        await interaction.update({
            content: "Todavia no hay paneles. Usa primero `Crear panel`.",
            embeds: [],
            components: [homePayload().components[0]]
        });
        return;
    }

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder(placeholder)
            .addOptions(panels.map(panel => ({
                label: `Panel ${panel.id}`,
                description: `${panel.title} | #${interaction.guild.channels.cache.get(panel.channel_id)?.name || "canal"}`.slice(0, 100),
                value: String(panel.id)
            })))
    );

    await interaction.update({
        content: placeholder,
        embeds: [],
        components: [row]
    });
}

async function showCategorySelect(interaction) {
    const session = getSession(interaction);
    const panelCategoryId = session.panelDefaultCategoryId;
    const panelCategory = panelCategoryId ? interaction.guild.channels.cache.get(panelCategoryId) : null;
    const content = panelCategory
        ? `Selecciona la categoria donde se crearan los tickets. Categoria del panel: ${panelCategory.name}.`
        : "Selecciona la categoria donde se crearan los tickets.";
    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId("ticket_setup_button_category")
            .setPlaceholder(panelCategory ? `Sugerido: ${panelCategory.name}` : "Elige la categoria donde se crearan los tickets")
            .setChannelTypes(ChannelType.GuildCategory)
            .setMinValues(1)
            .setMaxValues(1)
    );

    await interaction.update({
        content,
        embeds: [],
        components: [row]
    });
}

async function showStaffRoleSelect(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId("ticket_setup_button_staff_roles")
            .setPlaceholder("Elige roles que pueden atender/reclamar")
            .setMinValues(1)
            .setMaxValues(10)
    );

    await interaction.update({
        content: "Selecciona los roles de staff que podran ver y atender este tipo de ticket.",
        embeds: [],
        components: [row]
    });
}

async function showCloseRoleSelect(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId("ticket_setup_button_close_roles")
            .setPlaceholder("Elige roles que pueden cerrar")
            .setMinValues(1)
            .setMaxValues(10)
    );

    await interaction.update({
        content: "Selecciona los roles que podran cerrar este tipo de ticket.",
        embeds: [],
        components: [row]
    });
}

async function showColorSelect(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("ticket_setup_button_color")
            .setPlaceholder("Elige color del boton")
            .addOptions(
                { label: "Azul", value: "azul" },
                { label: "Gris", value: "gris" },
                { label: "Verde", value: "verde" },
                { label: "Rojo", value: "rojo" }
            )
    );

    await interaction.update({
        content: "Selecciona el color del boton que abrira este tipo de ticket.",
        embeds: [],
        components: [row]
    });
}

function showPanelModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("ticket_setup_panel_modal")
        .setTitle("Crear panel de tickets");

    const title = new TextInputBuilder()
        .setCustomId("panel_title")
        .setLabel("Titulo del panel")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(256)
        .setRequired(true);
    const description = new TextInputBuilder()
        .setCustomId("panel_description")
        .setLabel("Descripcion del panel")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(2000)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(description)
    );

    return interaction.showModal(modal);
}

function showButtonLabelModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("ticket_setup_button_label_modal")
        .setTitle("Crear boton de ticket");

    const label = new TextInputBuilder()
        .setCustomId("button_label")
        .setLabel("Texto del boton")
        .setPlaceholder("Ejemplo: Soporte, Compras, Reportes")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(80)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(label));
    return interaction.showModal(modal);
}

async function handleTicketSetupButton(interaction) {
    if (!interaction.customId.startsWith("ticket_setup_")) return false;
    if (!(await requireSetupAccess(interaction))) return true;

    if (interaction.customId === "ticket_setup_panel_start") {
        clearSession(interaction);
        await showPanelChannelSelect(interaction);
        return true;
    }

    if (interaction.customId === "ticket_setup_button_start") {
        clearSession(interaction);
        await showPanelSelect(interaction, "ticket_setup_button_panel", "Selecciona el panel donde se agregara el boton.");
        return true;
    }

    if (interaction.customId === "ticket_setup_publish_start") {
        clearSession(interaction);
        const panel = await getLatestPanel(interaction.guild.id);
        if (!panel) {
            await interaction.update({
                content: "Todavia no hay paneles. Crea un panel primero.",
                embeds: [],
                components: [homePayload().components[0]]
            });
            return true;
        }

        await publishPanel(interaction, panel.id);
        await interaction.update({
            content: `Panel ${panel.id} publicado o actualizado correctamente en <#${panel.channel_id}>.`,
            embeds: [],
            components: [homePayload().components[0]]
        });
        return true;
    }

    return false;
}

async function handleTicketSetupSelect(interaction) {
    if (!interaction.customId.startsWith("ticket_setup_")) return false;
    if (!(await requireSetupAccess(interaction))) return true;

    const session = getSession(interaction);

    if (interaction.customId === "ticket_setup_panel_channel") {
        session.panelChannelId = interaction.values[0];
        await showPanelCategorySelect(interaction);
        return true;
    }

    if (interaction.customId === "ticket_setup_panel_category") {
        session.panelCategoryId = interaction.values[0];
        await showPanelModal(interaction);
        return true;
    }

    if (interaction.customId === "ticket_setup_button_panel") {
        session.panelId = Number(interaction.values[0]);
        const panels = await getPanels(interaction.guild.id);
        const panel = panels.find(item => Number(item.id) === session.panelId);
        session.panelDefaultCategoryId = panel?.default_category_id || null;
        await showCategorySelect(interaction);
        return true;
    }

    if (interaction.customId === "ticket_setup_button_category") {
        session.categoryId = interaction.values[0];
        await showStaffRoleSelect(interaction);
        return true;
    }

    if (interaction.customId === "ticket_setup_button_staff_roles") {
        session.staffRoleIds = interaction.values;
        await showCloseRoleSelect(interaction);
        return true;
    }

    if (interaction.customId === "ticket_setup_button_close_roles") {
        session.closeRoleIds = interaction.values;
        await showColorSelect(interaction);
        return true;
    }

    if (interaction.customId === "ticket_setup_button_color") {
        session.style = interaction.values[0];
        await showButtonLabelModal(interaction);
        return true;
    }

    if (interaction.customId === "ticket_setup_publish_panel") {
        const panelId = Number(interaction.values[0]);
        await publishPanel(interaction, panelId);
        clearSession(interaction);
        await interaction.update({
            content: `Panel ${panelId} publicado o actualizado correctamente.`,
            embeds: [],
            components: [homePayload().components[0]]
        });
        return true;
    }

    if (interaction.customId === "ticket_setup_delete_panel") {
        const panelId = Number(interaction.values[0]);
        const panel = await deletePanel(interaction.guild, panelId);
        await interaction.update({
            content: panel
                ? `Panel ${panelId} borrado correctamente.`
                : "No encontre ese panel o ya fue borrado.",
            embeds: [],
            components: []
        });
        return true;
    }

    return false;
}

async function handleTicketSetupModal(interaction) {
    if (!interaction.customId.startsWith("ticket_setup_")) return false;
    if (!(await requireSetupAccess(interaction))) return true;

    const session = getSession(interaction);

    if (interaction.customId === "ticket_setup_panel_modal") {
        if (!session.panelChannelId) {
            await interaction.reply({ content: "La sesion expiro. Abre de nuevo `/ticket asistente`.", ephemeral: true });
            return true;
        }

        const title = interaction.fields.getTextInputValue("panel_title");
        const description = interaction.fields.getTextInputValue("panel_description");
        const panelId = await createPanel(interaction.guild.id, session.panelChannelId, title, description, session.panelCategoryId);
        clearSession(interaction);
        await interaction.reply({
            content: `Panel creado con ID ${panelId}. Ahora usa "Agregar boton" para configurar los botones del panel.`,
            components: [homePayload().components[0]],
            ephemeral: true
        });
        return true;
    }

    if (interaction.customId === "ticket_setup_full_panel_modal") {
        const title = interaction.fields.getTextInputValue("panel_title");
        const description = interaction.fields.getTextInputValue("panel_description");
        const channelName = interaction.fields.getTextInputValue("panel_channel");
        const categoryName = interaction.fields.getTextInputValue("ticket_category");

        const channel = await findOrCreateTextChannel(interaction.guild, channelName);
        const category = await findOrCreateCategory(interaction.guild, categoryName);
        const panelId = await createPanel(interaction.guild.id, channel.id, title, description);

        const session = getSession(interaction);
        session.lastPanelId = panelId;
        session.lastCategoryId = category.id;

        await interaction.reply({
            content: `Panel creado con ID ${panelId} en <#${channel.id}>. Categoria de tickets: ${category.name}. Ahora agrega un boton.`,
            components: [homePayload().components[0]],
            ephemeral: true
        });
        return true;
    }

    if (interaction.customId === "ticket_setup_full_button_modal") {
        const session = getSession(interaction);
        const panels = await getPanels(interaction.guild.id, 1);
        const panel = panels[0];
        if (!panel) {
            await interaction.reply({ content: "Primero crea un panel de tickets.", ephemeral: true });
            return true;
        }

        const label = interaction.fields.getTextInputValue("button_label");
        const style = parseStyle(interaction.fields.getTextInputValue("button_color"));
        const categoryName = interaction.fields.getTextInputValue("ticket_category");
        const staffRoleIds = parseRoleIds(interaction.fields.getTextInputValue("staff_roles"));
        const closeRoleIds = parseRoleIds(interaction.fields.getTextInputValue("close_roles"));

        if (!style) {
            await interaction.reply({ content: "Color invalido. Usa: azul, gris, verde o rojo.", ephemeral: true });
            return true;
        }
        if (staffRoleIds.length === 0 || closeRoleIds.length === 0) {
            await interaction.reply({ content: "Debes mencionar o pegar el ID de al menos un rol staff y un rol de cierre.", ephemeral: true });
            return true;
        }

        const existingButtons = await getPanelButtons(panel.id, interaction.guild.id);
        if (existingButtons.length >= 25) {
            await interaction.reply({ content: "Este panel ya tiene el maximo de 25 botones permitido por Discord.", ephemeral: true });
            return true;
        }

        const category = await findOrCreateCategory(interaction.guild, categoryName);
        const buttonId = await addButton(
            interaction.guild.id,
            panel.id,
            label,
            style,
            category.id,
            staffRoleIds,
            closeRoleIds
        );

        session.lastPanelId = panel.id;
        session.lastCategoryId = category.id;

        await interaction.reply({
            content: `Boton creado con ID ${buttonId} en el panel ${panel.id}. Puedes publicar el panel cuando termines.`,
            components: [homePayload().components[0]],
            ephemeral: true
        });
        return true;
    }

    if (interaction.customId === "ticket_setup_button_label_modal") {
        if (!session.panelId || !session.categoryId || !session.staffRoleIds?.length || !session.closeRoleIds?.length || !session.style) {
            await interaction.reply({ content: "La sesion expiro. Abre de nuevo `/ticket asistente`.", ephemeral: true });
            return true;
        }

        const existingButtons = await getPanelButtons(session.panelId, interaction.guild.id);
        if (existingButtons.length >= 25) {
            clearSession(interaction);
            await interaction.reply({ content: "Este panel ya tiene el maximo de 25 botones permitido por Discord.", ephemeral: true });
            return true;
        }

        const label = interaction.fields.getTextInputValue("button_label");
        const buttonId = await addButton(
            interaction.guild.id,
            session.panelId,
            label,
            session.style,
            session.categoryId,
            session.staffRoleIds,
            session.closeRoleIds
        );
        clearSession(interaction);
        await interaction.reply({
            content: `Boton creado con ID ${buttonId}. Puedes agregar otro boton o publicar el panel.`,
            components: [homePayload().components[0]],
            ephemeral: true
        });
        return true;
    }

    return false;
}

module.exports = {
    handleTicketSetupButton,
    handleTicketSetupModal,
    handleTicketSetupSelect,
    sendTicketSetupHome,
    showDeletePanelSelect
};
