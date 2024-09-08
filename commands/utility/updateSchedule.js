import { ContextMenuCommandBuilder, ApplicationCommandType, AttachmentBuilder } from 'discord.js';
import { fetchCalendar, filterEventsByLocation } from '../../utils/calendarUtils.js';
import { generateCanvas } from '../../utils/canvasUtils.js';
import { syndicateToBluesky } from '../../utils/blueskyUtils.js';
import { updateChannelSchedule } from '../../utils/twitchUtils.js';
import config from '../../config.js';
const { flags } = config;

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
            if (config.bluesky.locationFilter && !config.bluesky.locationFilter.includes(event.location)) {
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
        if (flags.syndicateImageToBluesky) {
            if (config.bluesky.locationFilter) {
                const filteredEvents = filterEventsByLocation(events, config.bluesky.locationFilter);
                const bskyBuffer = await generateCanvas(weekRange, filteredEvents);
                await syndicateToBluesky(blueskyAltText, bskyBuffer);
            } else {
                await syndicateToBluesky(blueskyAltText, buffer);
            }
            return 'Bluesky syndication completed.';
        }
        return 'Condition not met, syndication skipped.';
    }

    const updateTwitchSchedule = async () => {
        if (flags.updateTwitchSchedule) {
            await updateChannelSchedule(events, weekRange);
            return 'Twitch channel schedule updated.'
        } else {
            return 'Condition not met, channel schedule update skipped.'
        }
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        await targetMessage.edit({
            content: replyText,
            files: [attachment]
        });

        const results = await Promise.allSettled([
            syndicateImageToBluesky(),
            updateTwitchSchedule()
        ]);

        await interaction.editReply('Schedule updated successfully.');
    } catch (error) {
        console.error('Error updating message:', error);
        await interaction.editReply('Failed to update the schedule message. It may have been deleted or inaccessible.');
    }
}