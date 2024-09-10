import { ContextMenuCommandBuilder, ApplicationCommandType, AttachmentBuilder } from 'discord.js';
import { fetchCalendar, filterEventsByLocation } from '../../utils/calendarUtils.js';
import { generateCanvas } from '../../utils/canvasUtils.js';
import { syndicateToBluesky } from '../../utils/blueskyUtils.js';
import { updateChannelSchedule } from '../../utils/twitchUtils.js';
import configManager from '../../utils/configManager.js';

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
    const attachment = new AttachmentBuilder(buffer, { name: 'schedule.png' });

    const syndicateImageToBluesky = async () => {
        if (configManager.get('syndicateImageToBlueskyOnUpdate')) {
            if (configManager.get('bluesky.locationFilter')) {
                const filteredEvents = filterEventsByLocation(events, config.bluesky.locationFilter);
                const bskyBuffer = await generateCanvas(weekRange, filteredEvents);
                await syndicateToBluesky(blueskyAltText, bskyBuffer);
            } else {
                await syndicateToBluesky(blueskyAltText, buffer);
            }
            return { action: 'Bluesky', status: 'completed' };
        }
        return { action: 'Bluesky', status: 'skipped' };
    }

    const updateTwitchSchedule = async () => {
        if (configManager.get('updateTwitchScheduleOnUpdate')) {
            await updateChannelSchedule(events, weekRange);
            return { action: 'Twitch', status: 'completed' };
        }
        return { action: 'Twitch', status: 'skipped' };
    }

    await interaction.deferReply({ ephemeral: true });

    const results = await Promise.allSettled([
        syndicateImageToBluesky(),
        updateTwitchSchedule(),
        targetMessage.edit({
            content: replyText,
            files: [attachment]
        })
    ]);

    const actionResults = results.slice(0, 2).map(result => result.value);
    const actionsPerformed = actionResults.filter(result => result.status === 'completed');

    if (actionsPerformed.length > 0) {
        const summaryText = actionResults
            .map(result => `${result.action} syndication ${result.status}.`)
            .join('\n');
        await interaction.followUp({ content: summaryText, ephemeral: true });
    }
}