let defaultConfig = {};
let currentConfig = {};

document.addEventListener('DOMContentLoaded', () => {
    loadConfig();

    document.getElementById('saveConfig').addEventListener('click', saveConfig);
    document.getElementById('resetConfig').addEventListener('click', resetAllConfig);

    // Add event listeners for individual field reset buttons
    document.querySelectorAll('.reset-field').forEach(button => {
        button.addEventListener('click', (event) => resetField(event.target.dataset.field));
    });

    const timeZones = moment.tz.names();
    const select = document.getElementById('timezone');

    timeZones.forEach(timeZone => {
        const option = document.createElement('option');
        option.value = timeZone;
        option.text = timeZone;
        select.add(option);
    });
});

function loadConfig() {
    Promise.all([
        fetch('/api/config/default').then(response => response.json()),
        fetch('/api/config').then(response => response.json())
    ]).then(([defaultData, currentData]) => {
        defaultConfig = defaultData;
        currentConfig = currentData;
        populateForm(currentConfig);
    }).catch(error => {
        console.error('Error:', error);
        alert('Failed to load configuration. Please try again.');
    });
}

function populateForm(config) {
    document.getElementById('timezone').value = config.timezone;
    document.getElementById('syndicateImageToBluesky').checked = config.flags.syndicateImageToBluesky;
    document.getElementById('updateTwitchSchedule').checked = config.flags.updateTwitchSchedule;
    document.getElementById('font').value = config.canvas.font;
    document.getElementById('fontColor').value = config.canvas.fontcolor;
    document.getElementById('twitchIcon').value = config.canvas.assets.twitchicon;
    document.getElementById('discordIcon').value = config.canvas.assets.discordicon;
    document.getElementById('overlay').value = config.canvas.assets.overlay;
    document.getElementById('titleString').value = config.canvas.title.string;
    document.getElementById('titleSize').value = config.canvas.title.size;
    document.getElementById('titlePosX').value = config.canvas.title.posX;
    document.getElementById('titlePosY').value = config.canvas.title.posY;
    document.getElementById('weekrangeSize').value = config.canvas.weekrange.size;
    document.getElementById('weekrangePosX').value = config.canvas.weekrange.posX;
    document.getElementById('weekrangePosY').value = config.canvas.weekrange.posY;
    document.getElementById('weekdaysSize').value = config.canvas.weekdays.size;
    document.getElementById('weekdaysPosX').value = config.canvas.weekdays.posX;
    document.getElementById('weekdaysPosY').value = config.canvas.weekdays.posY;
    document.getElementById('entriesSize').value = config.canvas.entries.size;
    document.getElementById('entriesPosX').value = config.canvas.entries.posX;
    document.getElementById('entriesPosY').value = config.canvas.entries.posY;
    document.getElementById('timeSize').value = config.canvas.time.size;
    document.getElementById('timePosX').value = config.canvas.time.posX;
    document.getElementById('timePosY').value = config.canvas.time.posY;
    document.getElementById('noneColor').value = config.canvas.entrycolors.none;
    document.getElementById('twitchColor').value = config.canvas.entrycolors.twitch;
    document.getElementById('discordColor').value = config.canvas.entrycolors.discord;
}

function saveConfig() {
    const config = {
        timezone: document.getElementById('timezone').value,
        flags: {
            syndicateImageToBluesky: document.getElementById('syndicateImageToBluesky').checked,
            updateTwitchSchedule: document.getElementById('updateTwitchSchedule').checked
        },
        canvas: {
            font: document.getElementById('font').value,
            fontcolor: document.getElementById('fontColor').value,
            assets: {
                twitchicon: document.getElementById('twitchIcon').value,
                discordicon: document.getElementById('discordIcon').value,
                overlay: document.getElementById('overlay').value
            },
            title: {
                string: document.getElementById('titleString').value,
                size: document.getElementById('titleSize').value,
                posX: parseInt(document.getElementById('titlePosX').value),
                posY: parseInt(document.getElementById('titlePosY').value)
            }
        }
    };

    fetch('/api/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to save config');
            }
            return response.json();
        })
        .then(data => {
            alert('Configuration saved successfully!');
        })
        .catch((error) => {
            console.error('Error:', error);
            alert('Failed to save configuration. Please try again.');
        });
}

function resetAllConfig() {
    if (confirm('Are you sure you want to reset all configuration to default?')) {
        fetch('/api/config/reset', {
            method: 'POST',
        })
            .then(response => response.json())
            .then(data => {
                alert('Configuration reset to default successfully!');
                currentConfig = data.config;
                populateForm(currentConfig);
            })
            .catch((error) => {
                console.error('Error:', error);
                alert('Failed to reset configuration. Please try again.');
            });
    }
}

function resetField(fieldName) {
    const fieldParts = fieldName.split('.');
    let defaultValue = defaultConfig;
    let currentValue = currentConfig;

    for (const part of fieldParts) {
        defaultValue = defaultValue[part];
        currentValue = currentValue[part];
    }

    if (defaultValue !== undefined) {
        // Update the current config
        let target = currentConfig;
        for (let i = 0; i < fieldParts.length - 1; i++) {
            target = target[fieldParts[i]];
        }
        target[fieldParts[fieldParts.length - 1]] = defaultValue;

        // Update the form
        const element = document.getElementById(fieldName);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = defaultValue;
            } else {
                element.value = defaultValue;
            }
        }

        // Save the updated config
        saveConfig();
    }
}

function changeNumberInput(inputId, change) {
    const input = document.getElementById(inputId);
    input.value = parseInt(input.value) + change;
}