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
});

let flattenedDefaultConfig;

function loadConfig() {
    Promise.all([
        fetch('/api/config/default').then(response => response.json()),
        fetch('/api/config').then(response => response.json())
    ]).then(([defaultData, currentData]) => {
        defaultConfig = defaultData;
        flattenedDefaultConfig = flattenObject(defaultData);
        currentConfig = currentData;
        populateForm(currentConfig);
    }).catch(error => {
        console.error('Error:', error);
        alert('Failed to load configuration. Please try again.');
    });
}

function populateForm(config) {
    flattenObject(config).forEach((value, key) => {
        const inputElement = document.getElementById(key);
        if (inputElement) {
            inputElement.value = value;
        }
    });
}

function flattenObject(obj, prefix = '') {
    const flattened = new Map();

    for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            const subMap = flattenObject(obj[key], `${prefix}${key}.`);
            for (const [subKey, value] of subMap) {
                flattened.set(subKey, value);
            }
        } else {
            flattened.set(`${prefix}${key}`, obj[key]);
        }
    }

    return flattened;
}

function saveConfig() {
    const updatedConfig = {};

    document.querySelectorAll('input, select').forEach(input => {
        if (input.id) {
            if (input.type === "number") {
                setNestedValue(updatedConfig, input.id, Number(input.value));
            } else {
                setNestedValue(updatedConfig, input.id, input.value);
            }
        }
    });

    fetch('/api/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedConfig),
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to save config');
            }
            return response.json();
        })
        .then(data => {
            alert('Configuration updated successfully!');
            currentConfig = data.config;
            populateForm(currentConfig);
        })
        .catch((error) => {
            console.error('Error:', error);
            alert('Failed to update configuration. Please try again.');
        });
}

function resetField(fieldName) {
    const inputElement = document.getElementById(fieldName);
    if (!inputElement) {
        console.error(`Input element with id "${fieldName}" not found`);
        return;
    }

    const defaultValue = getNestedValue(defaultConfig, fieldName);
    if (defaultValue === undefined) {
        console.error(`Default value for "${fieldName}" not found in defaultConfig`);
        return;
    }

    inputElement.value = defaultValue;
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

function setNestedValue(obj, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    const parent = parts.reduce((acc, part) => {
        if (!acc[part]) acc[part] = {};
        return acc[part];
    }, obj);
    parent[last] = value;
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