const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { readGuildConfig, writeGuildConfig, ensureGuildConfig } = require("../utils/guildConfig");
const { upsertFormPanel } = require("../utils/formPanel");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("formconfig")
        .setDescription("Configurar contenido del formulario")
        .setDMPermission(false)
        .addStringOption(opt => opt.setName("titulo").setDescription("Titulo del panel").setMaxLength(256))
        .addStringOption(opt => opt.setName("descripcion").setDescription("Descripcion del panel").setMaxLength(2000))
        .addStringOption(opt => opt.setName("instrucciones").setDescription("Texto de instrucciones").setMaxLength(1024))
        .addStringOption(opt => opt.setName("notas").setDescription("Texto de notas").setMaxLength(1024))
        .addStringOption(opt => opt.setName("tiempo").setDescription("Tiempo de respuesta").setMaxLength(256))
        .addStringOption(opt => opt.setName("imagen_url").setDescription("URL de imagen del panel").setMaxLength(2048)),

    async execute(interaction) {
        const cfgAll = readGuildConfig();
        const guildCfg = ensureGuildConfig(cfgAll, interaction.guild.id);

        const title = interaction.options.getString("titulo");
        const description = interaction.options.getString("descripcion");
        const instructions = interaction.options.getString("instrucciones");
        const notes = interaction.options.getString("notas");
        const responseTime = interaction.options.getString("tiempo");
        const image = interaction.options.getString("imagen_url");

        if (title !== null) guildCfg.formTitle = title;
        if (description !== null) guildCfg.formDescription = description;
        if (instructions !== null) guildCfg.formInstructions = instructions;
        if (notes !== null) guildCfg.formNotes = notes;
        if (responseTime !== null) guildCfg.formResponseTime = responseTime;
        if (image !== null) guildCfg.formImageUrl = image;

        writeGuildConfig(cfgAll);

        const requestChannel = guildCfg.requestChannel
            ? interaction.guild.channels.cache.get(guildCfg.requestChannel)
            : null;
        if (requestChannel) {
            await upsertFormPanel(requestChannel, interaction.client.user.id, guildCfg);
        }

        await interaction.reply({ content: "Formulario actualizado.", ephemeral: true });
    }
};
