const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getGuildConfig } = require("../utils/guildConfig");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("status")
        .setDescription("Ver configuracion actual de solicitudes")
        .setDMPermission(false),

    async execute(interaction) {
        const cfg = getGuildConfig(interaction.guild.id);
        const requestChannel = cfg.requestChannel ? `<#${cfg.requestChannel}>` : "sin configurar";
        const modChannel = cfg.modChannel ? `<#${cfg.modChannel}>` : "sin configurar";
        const statusChannel = cfg.statusChannel ? `<#${cfg.statusChannel}>` : "sin configurar";
        const approvedRole = cfg.approvedRole ? `<@&${cfg.approvedRole}>` : "sin configurar";
        const configRoles = cfg.configRoles?.length
            ? cfg.configRoles.map(id => `<@&${id}>`).join(", ")
            : "sin roles";

        const embed = new EmbedBuilder()
            .setTitle("Configuracion de Solicitudes")
            .addFields(
                { name: "Solicitudes", value: requestChannel, inline: true },
                { name: "Moderacion", value: modChannel, inline: true },
                { name: "Estado", value: statusChannel, inline: true },
                { name: "Rol Aprobado", value: approvedRole, inline: true },
                { name: "Roles Config", value: configRoles, inline: false }
            );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
