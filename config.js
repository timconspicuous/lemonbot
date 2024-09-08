// This file is intended for customization, NEVER use credentials here!

export default {
    // calendarUtils will check for a timezone, but you can also set
    // one manually if there are problems. Format is 'Europe/Brussels'
    timezone: 'Europe/Brussels',
    flags: {
        // Whether the schedule image is posted to Bluesky.
        // Credentials must be set in .env for this to work.
        syndicateImageToBluesky: false,
        // Whether the schedule is synched with Twitch schedule.
        // Credentials must be set in .env for this to work.
        updateTwitchSchedule: false,
    },
    canvas: {
        // If you want to register a font, place its .ttf file
        // in /assets/fonts/, the filename without extension
        // will be used as the font name.
        font: 'Lazydog',
        fontcolor: '#ffffff',

        // Feel free to change the assets to your liking by adding
        // files to /assets/ or overwriting existing ones, just
        // make sure the width and height stay the same.
        assets: {
            twitchicon: 'twitch_icon.png',
            discordicon: 'discord_icon.png',
            overlay: 'overlay.png',
        },

        // Text is center and middle aligned, so posX and posY
        // correspond to the center of the text.
        // If the element repeats, only the first instance is listed.
        title: {
            string: 'Stream Schedule',
            size: '60px',
            posX: 400,
            posY: 100,
        },
        weekrange: {
            size: '40px',
            posX: 400,
            posY: 165,
        },
        weekdays: {
            string: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
            size: '35px',
            posX: 175,
            posY: 275,
        },
        entries: {
            size: '35px',
            posX: 400,
            posY: 275,
        },
        time: {
            size: '25px',
            posX: 625,
            posY: 275,
        },
        entrycolors: {
            none: '#f1e1b2',
            twitch: '#eebd37',
            discord: '#f3af52',
        },

        // Canvas size, position and size of the first container
        // and the spacing between containers, these shouldn't be
        // changed unless you change the layout of the overlay.
        size: {
            width: 800,
            height: 800,
        },
        container: {
            posX: 126,
            posY: 224,
            width: 548,
            height: 102,
        },
        spacing: 112.5,
    },
    bluesky: {
        // Boilerplate text and alt-text to accompany the schedule,
        // you can use hashtags and links in text.
        text: '',
        alttext: 'Weekly schedule:',
        // Only include events that have events set to Twitch,
        // leave empty to include all.
        locationFilter: ["Twitch"],
    },
};