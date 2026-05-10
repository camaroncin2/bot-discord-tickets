const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { readGuildConfig, writeGuildConfig, hasConfigAccess } = require("../utils/guildConfig");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("resetconfig")
        .setDescription("Restablecer configuracion de este servidor")
        .setDMPermission(false),

    async execute(interaction) {
        if (!hasConfigAccess(interaction, PermissionsBitField.Flags.ManageGuild)) {
            await interaction.reply({ content: "No tienes permisos para restablecer configuracion.", ephemeral: true });
            return;
        }

        const cfgAll = readGuildConfig();
        delete cfgAll[interaction.guild.id];
        writeGuildConfig(cfgAll);

        await interaction.reply({ content: "Configuracion restablecida para este servidor.", ephemeral: true });
    }
};
