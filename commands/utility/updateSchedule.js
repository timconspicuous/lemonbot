import { ContextMenuCommandBuilder, ApplicationCommandType, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { fetchCalendar, filterEventsByLocation } from '../../utils/calendarUtils.js';
import { generateCanvas } from '../../utils/canvasUtils.js';
import { syndicateToBluesky } from '../../utils/blueskyUtils.js';
import { updateChannelSchedule } from '../../utils/twitchUtils.js';
import configManager from '../../config/configManager.js';

export const data = new ContextMenuCommandBuilder()
    .setName('Update Schedule')
    .setType(ApplicationCommandType.Message);

export async function execute(interaction) {
    const targetMessage = interaction.targetMessage;

    // Check if the message was sent by the bot
    if (targetMessage.author.id !== interaction.client.user.id) {
        return interaction.reply({ content: 'This command can only be used on schedule messages posted by the bot.', ephemeral: true });
    }

    // Extract the date from the existing message content
    const dateMatch = targetMessage.content.match(/<t:(\d+):/);
    if (!dateMatch) {
        return interaction.reply({ content: 'Unable to determine the date of the existing schedule.', ephemeral: true });
    }

    const targetDate = new Date(parseInt(dateMatch[1]) * 1000);

    // Generate updated reply
    let replyText = '';
    let blueskyAltText = '';
    const { weekRange, timezone, events } = await fetchCalendar(targetDate);
    for (const key in events) {
        const event = events[key];
        if (event.type === 'VEVENT') {
            const startDate = new Date(event.start)
            const unixTimestamp = Math.floor(startDate.getTime() / 1000);
            replyText += `\n➳ <t:${unixTimestamp}:F> ${event.summary}`;
            if (configManager.get('bluesky.locationFilter') && !configManager.get('bluesky.locationFilter').includes(event.location)) {
                continue;
            }
            blueskyAltText += `\n${startDate.toLocaleString()} ${event.summary}`;
        }
    }
    replyText = replyText.trimStart();

    // Generate image attachment
    const buffer = await generateCanvas(weekRange, events);
    let bskyBuffer = buffer;
    if (configManager.get('bluesky.locationFilter')) {
        const filteredEvents = filterEventsByLocation(events, configManager.get('bluesky.locationFilter'));
        bskyBuffer = await generateCanvas(weekRange, filteredEvents);
    }
    const attachment = new AttachmentBuilder(buffer, { name: 'schedule.png' });

    await interaction.deferReply({ ephemeral: true });

    // Update the target message
    await targetMessage.edit({
        content: replyText,
        files: [attachment]
    });

    // Create buttons for additional actions
    const blueskyButton = new ButtonBuilder()
        .setCustomId('syndicate_bluesky')
        .setLabel('Syndicate to Bluesky')
        .setStyle(ButtonStyle.Primary);

    const twitchButton = new ButtonBuilder()
        .setCustomId('update_twitch')
        .setLabel('Update Twitch Schedule')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder()
        .addComponents(blueskyButton, twitchButton);

    // Send ephemeral follow-up with buttons
    const followUpMessage = await interaction.editReply({
        content: 'Schedule updated. Additional actions available: (this message will time out in 10 minutes)',
        components: [row],
    });

    // Create a collector for button interactions
    const collector = followUpMessage.createMessageComponentCollector({ time: 600000 }); // 10 minute timeout

    collector.on('collect', async i => {
        if (i.customId === 'syndicate_bluesky') {
            await i.deferUpdate();
            await syndicateToBluesky(blueskyAltText, bskyBuffer);
            await i.editReply({
                content: 'Schedule updated and syndicated to Bluesky successfully!',
                components: [new ActionRowBuilder().addComponents(
                    blueskyButton.setDisabled(true).setLabel('Syndicated to Bluesky'),
                    twitchButton
                )]
            });
        } else if (i.customId === 'update_twitch') {
            await i.deferUpdate();
            await updateChannelSchedule(events, weekRange);
            await i.editReply({
                content: 'Schedule updated and Twitch schedule updated successfully!',
                components: [new ActionRowBuilder().addComponents(
                    blueskyButton,
                    twitchButton.setDisabled(true).setLabel('Twitch Schedule Updated')
                )]
            });
        }
    });
}