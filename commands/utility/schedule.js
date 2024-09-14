import { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { fetchCalendar, filterEventsByLocation } from '../../utils/calendarUtils.js';
import { generateCanvas } from '../../utils/canvasUtils.js';
import { syndicateToBluesky } from '../../utils/blueskyUtils.js';
import { updateChannelSchedule } from '../../utils/twitchUtils.js';
import configManager from '../../config/configManager.js';

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
    await interaction.deferReply();
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
            if (configManager.get('addEventDescription') &&  event.description) {
                replyText += `\n\t${event.description}`;
            }
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

    // Send the initial reply with the schedule
    await interaction.editReply({
        content: replyText,
        files: [attachment]
    });

    // Create buttons for additional actions
    const blueskyButton = new ButtonBuilder()
        .setCustomId('syndicate_bluesky')
        .setLabel('Syndicate to Bluesky')
        .setStyle(ButtonStyle.Secondary);

    const twitchButton = new ButtonBuilder()
        .setCustomId('update_twitch')
        .setLabel('Update Twitch Schedule')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder()
        .addComponents(blueskyButton, twitchButton);

    // Send ephemeral follow-up with buttons
    const followUpMessage = await interaction.followUp({
        content: 'Additional actions available: (this message will time out in 10 minutes)',
        components: [row],
        ephemeral: true
    });

    // Create a collector for button interactions
    const collector = followUpMessage.createMessageComponentCollector({ time: 600000 }); // 10 minute timeout

    collector.on('collect', async i => {
        if (i.customId === 'syndicate_bluesky') {
            await i.deferUpdate();
            try {
                await syndicateToBluesky(blueskyAltText, bskyBuffer);
                await i.editReply({
                    content: 'Syndicated to Bluesky successfully!',
                    components: [new ActionRowBuilder().addComponents(
                        blueskyButton.setDisabled(true).setLabel('Syndicated to Bluesky'),
                        twitchButton
                    )]
                });
            } catch (error) {
                console.error('Error syndicating to Bluesky:', error);
                await i.editReply({
                    content: 'Failed to syndicate to Bluesky. Please try again later.',
                    components: [new ActionRowBuilder().addComponents(
                        blueskyButton,
                        twitchButton.setLabel('Syndicated to Bluesky (Failed)')
                    )]
                });
            }
        } else if (i.customId === 'update_twitch') {
            await i.deferUpdate();
            try {
                await updateChannelSchedule(events, weekRange);
                await i.editReply({
                    content: 'Twitch schedule updated successfully!',
                    components: [new ActionRowBuilder().addComponents(
                        blueskyButton,
                        twitchButton.setDisabled(true).setLabel('Twitch Schedule Updated')
                    )]
                });
            } catch (error) {
                console.error('Error updating Twitch schedule:', error);
                await i.editReply({
                    content: 'Failed to update Twitch schedule. Please try again later.',
                    components: [new ActionRowBuilder().addComponents(
                        blueskyButton,
                        twitchButton.setLabel('Update Twitch Schedule (Failed)')
                    )]
                });
            }
        }
    });
}