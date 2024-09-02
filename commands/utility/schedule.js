import { SlashCommandBuilder, CommandInteraction, AttachmentBuilder } from 'discord.js';
import { fetchCalendar } from '../../utils/calendarUtils.js';
import { generateCanvas } from '../../utils/canvasUtils.js';
import { syndicateToBluesky } from '../../utils/blueskyUtils.js';
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
    const {weekRange, events} = await fetchCalendar(targetDate);
    for (const key in events) {
        const event = events[key];
        if (event.type === 'VEVENT') {
            const startDate = new Date(event.start)
            const unixTimestamp = Math.floor(startDate.getTime() / 1000);
            replyText += `\n➳ <t:${unixTimestamp}:F> ${event.summary}`;
            blueskyAltText += `\n➳ ${startDate.toLocaleString()} ${event.summary}`;
        }
    }
    replyText = replyText.trimStart();

    // Generate image attachment
    const buffer = await generateCanvas(weekRange, events);
    const attachment = new AttachmentBuilder(buffer, { name: 'schedule.png' });

    const syndicateImageToBluesky = async () => {
        if (flags.syndicateImageToBluesky) {
            await syndicateToBluesky(blueskyAltText, buffer);
            return 'Syndication completed';
        }
        return 'Condition not met, syndication skipped';
    }
    const results = await Promise.allSettled([
        syndicateImageToBluesky(),
        interaction.editReply({
            content: replyText,
            files: [attachment]
        })
    ]);
}