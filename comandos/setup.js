const { SlashCommandBuilder, ChannelType, PermissionsBitField } = require("discord.js");
const { readGuildConfig, writeGuildConfig, ensureGuildConfig, hasConfigAccess } = require("../utils/guildConfig");
const { upsertFormPanel } = require("../utils/formPanel");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Configurar canales de solicitudes y moderacion")
        .setDMPermission(false)
        .addChannelOption(opt => opt
            .setName("solicitudes")
            .setDescription("Canal para abrir el formulario y recibir solicitudes")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addChannelOption(opt => opt
            .setName("moderacion")
            .setDescription("Canal donde el staff acepta/deniega solicitudes")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addChannelOption(opt => opt
            .setName("estado")
            .setDescription("Canal donde se publican estados de las solicitudes")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        ),

    async execute(interaction) {
        if (!hasConfigAccess(interaction, PermissionsBitField.Flags.ManageGuild)) {
            await interaction.reply({ content: "No tienes permisos para configurar.", ephemeral: true });
            return;
        }

        const requestChannel = interaction.options.getChannel("solicitudes");
        const modChannel = interaction.options.getChannel("moderacion");
        const statusChannel = interaction.options.getChannel("estado");

        const cfgAll = readGuildConfig();
        const guildCfg = ensureGuildConfig(cfgAll, interaction.guild.id);
        guildCfg.requestChannel = requestChannel.id;
        guildCfg.modChannel = modChannel.id;
        guildCfg.statusChannel = statusChannel.id;
        writeGuildConfig(cfgAll);

        await upsertFormPanel(requestChannel, interaction.client.user.id, guildCfg);

        await interaction.reply({
            content: `Canales configurados: solicitudes <#${requestChannel.id}>, moderacion <#${modChannel.id}>, estado <#${statusChannel.id}>.`,
            ephemeral: true
        });
    }
};
