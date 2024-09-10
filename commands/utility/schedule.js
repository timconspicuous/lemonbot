import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { fetchCalendar, filterEventsByLocation } from '../../utils/calendarUtils.js';
import { generateCanvas } from '../../utils/canvasUtils.js';
import { syndicateToBluesky } from '../../utils/blueskyUtils.js';
import { updateChannelSchedule } from '../../utils/twitchUtils.js';
import configManager from '../../utils/configManager.js';

export const data = new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Posts weekly schedule.')
    .addStringOption(option =>
        option.setName('week')
            .setDescription('Which week to show the schedule for (this/next/YYYY-MM-DD)')
            .setRequired(false)
            .setAutocomplete(true)
    )
    .addBooleanOption(option =>
        option.setName('syndicate_bluesky')
            .setDescription('Override config to syndicate to Bluesky')
            .setRequired(false)
    )
    .addBooleanOption(option =>
        option.setName('update_twitch')
            .setDescription('Override config to update Twitch schedule')
            .setRequired(false)
    );

export async function execute(interaction) {
    const weekOption = interaction.options.getString('week') || 'this';
    const syndicateBlueskyOverride = interaction.options.getBoolean('syndicate_bluesky');
    const updateTwitchOverride = interaction.options.getBoolean('update_twitch');

    let targetDate = new Date();

    if (weekOption === 'this') {
        // targetDate is already set to today
    } else if (weekOption === 'next') {
        targetDate.setDate(targetDate.getDate() + 7);
    } else {
        // Assume it's a date string
        const parsedDate = new Date(weekOption);
        if (isNaN(parsedDate.getTime())) {
            return interaction.editReply('Invalid date format. Please use YYYY-MM-DD or "this" or "next".');
        }
        targetDate = parsedDate;
    }

    // Generate reply
    let replyText = '';
    let blueskyAltText = '';
    const { weekRange, events } = await fetchCalendar(targetDate);
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
        if (syndicateBlueskyOverride !== null ? syndicateBlueskyOverride : configManager.get('syndicateImageToBluesky')) {
            if (configManager.get('bluesky.locationFilter')) {
                const filteredEvents = filterEventsByLocation(events, configManager.get('bluesky.locationFilter'));
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
        if (updateTwitchOverride !== null ? updateTwitchOverride : configManager.get('updateTwitchSchedule')) {
            await updateChannelSchedule(events, weekRange);
            return { action: 'Twitch', status: 'completed' };
        }
        return { action: 'Twitch', status: 'skipped' };
    }

    const results = await Promise.allSettled([
        syndicateImageToBluesky(),
        updateTwitchSchedule(),
        interaction.editReply({
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