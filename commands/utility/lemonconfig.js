import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('lemonconfig')
    .setDescription('Configure lemonbot.');

export async function execute(interaction) {
    const { ngrokUrl } = await import('../../bot.js');
    const configButton = new ButtonBuilder()
        .setLabel('Edit configs')
        .setStyle(ButtonStyle.Link)
        .setURL(`${ngrokUrl}/configure.html`);

    const loginButton = new ButtonBuilder()
        .setLabel('Authenticate with Twitch')
        .setStyle(ButtonStyle.Link)
        .setURL(`${ngrokUrl}/login`);

    const row = new ActionRowBuilder()
        .addComponents(configButton, loginButton);

    await interaction.reply({
        content: 'Edit lemonbot\'s configs or authenticate with Twitch here. \nThe current callback URL is `' + ngrokUrl + '/callback`.',
        components: [row],
        ephemeral: true,
    });
};