import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { fetchCalendar, filterEventsByLocation } from '../../utils/calendarUtils.js';
import { generateCanvas } from '../../utils/canvasUtils.js';
import { syndicateToBluesky } from '../../utils/blueskyUtils.js';
import { updateChannelSchedule } from '../../utils/twitchUtils.js';
import config from '../../config.js';
const { flags } = config;

export const data = new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Posts weekly schedule.')
    .addStringOption(option =>
        option.setName('week')
            .setDescription('Which week to show the schedule for (this/next/YYYY-MM-DD)')
            .setRequired(false)
            .setAutocomplete(true)
    );

export async function execute(interaction) {
    const weekOption = interaction.options.getString('week') || 'this';

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

    const messageResponse = await interaction.editReply({
        content: replyText,
        files: [attachment]
    });

    const results = await Promise.allSettled([
        syndicateImageToBluesky(),
        updateTwitchSchedule(),
        messageResponse
    ]);
}