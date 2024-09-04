import { SlashCommandBuilder, CommandInteraction, AttachmentBuilder } from 'discord.js';
import { fetchCalendar, filterEvents } from '../../utils/calendarUtils.js';
import { generateCanvas } from '../../utils/canvasUtils.js';
import { syndicateToBluesky } from '../../utils/blueskyUtils.js';
import storage from 'node-persist';
import config from '../../config.js';
const { flags } = config;
await storage.init();

export const data = new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Posts or updates weekly schedule.')
    .addStringOption(option =>
        option.setName('week')
            .setDescription('Which week to show the schedule for (this/next/YYYY-MM-DD)')
            .setRequired(false)
            .setAutocomplete(true)
    )
    .addBooleanOption(option =>
        option.setName('update')
            .setDescription('Whether to update the existing schedule message')
            .setRequired(false)
    );

export async function execute(interaction) {
    const weekOption = interaction.options.getString('week') || 'this';
    const updateOption = interaction.options.getBoolean('update') || false;
    
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
            if (config.bluesky.locationFilter && !config.bluesky.locationFilter.includes(event.location)) {
                continue;
            }
            blueskyAltText += `\n➳ ${startDate.toLocaleString()} ${event.summary}`;
        }
    }
    replyText = replyText.trimStart();

    // Generate image attachment(s)
    const buffer = await generateCanvas(weekRange, events);
    const attachment = new AttachmentBuilder(buffer, { name: 'schedule.png' });

    const syndicateImageToBluesky = async () => {
        if (flags.syndicateImageToBluesky) {
            if (config.bluesky.locationFilter) {
                const filteredEvents = filterEvents(events, config.bluesky.locationFilter);
                const bskyBuffer = await generateCanvas(weekRange, filteredEvents);
                await syndicateToBluesky(blueskyAltText, bskyBuffer);
            } else {
                await syndicateToBluesky(blueskyAltText, buffer);
            }
            return 'Syndication completed';
        }
        return 'Condition not met, syndication skipped';
    }

    let messageResponse;
    if (updateOption) {
        const channelId = await storage.getItem('channelId');
        const messageId = await storage.getItem('messageId');
        
        if (!channelId || !messageId) {
            return interaction.editReply('No stored message found to update. Please use the command without the update option first.');
        }

        try {
            const channel = await interaction.client.channels.fetch(channelId);
            const messageToUpdate = await channel.messages.fetch(messageId);
            messageResponse = await messageToUpdate.edit({
                content: replyText,
                files: [attachment]
            });
        } catch (error) {
            console.error('Error updating message:', error);
            return interaction.editReply('Failed to update the stored message. It may have been deleted or inaccessible.');
        }
    } else {
        messageResponse = await interaction.editReply({
            content: replyText,
            files: [attachment]
        });
    }

    const results = await Promise.allSettled([
        syndicateImageToBluesky(),
        messageResponse
    ]);

    // Storing message ID so it can be edited later
    if (!updateOption) {
        const {channelId, id: messageId} = messageResponse;
        await storage.setItem('channelId', channelId);
        await storage.setItem('messageId', messageId);
    }

    if (updateOption) {
        await interaction.followUp({
            content: 'Schedule updated successfully.',
            ephemeral: true
        });
    }
}