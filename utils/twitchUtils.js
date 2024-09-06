import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const REDIRECT_URI = 'http://localhost:3000/callback';
if (!process.env.BROADCASTER_ID) {
    try {
        await getTwitchBroadcasterId();
    } catch (error) {
        console.error('Error establishing Broadcaster ID:', error);
        throw error;
    }
}

function updateEnv(updates) {
    const envPath = path.resolve(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');

    let updatedContent = envContent;

    // Loop through the updates object and replace/add each key-value pair
    for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');

        if (envContent.match(regex)) {
            // Replace existing key-value pair
            updatedContent = updatedContent.replace(regex, `${key}=${value}`);
        } else {
            // Add new key-value pair if it doesn't exist
            updatedContent += `\n${key}=${value}`;
        }

        // Update process.env with new values dynamically
        process.env[key] = value;
    }

    fs.writeFileSync(envPath, updatedContent);
}

export function setupTwitchAuth(app) {
    app.get('/login', (req, res) => {
        const authUrl = `${TWITCH_AUTH_URL}?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=channel:manage:schedule`;
        res.redirect(authUrl);
    });

    app.get('/callback', async (req, res) => {
        const { code } = req.query;

        try {
            const response = await axios.post(TWITCH_TOKEN_URL, null, {
                params: {
                    client_id: process.env.TWITCH_CLIENT_ID,
                    client_secret: process.env.TWITCH_CLIENT_SECRET,
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: REDIRECT_URI
                }
            });

            const { access_token, refresh_token } = response.data;
            updateEnv({
                TWITCH_ACCESS_TOKEN: access_token,
                TWITCH_REFRESH_TOKEN: refresh_token,
            });
            res.send('Authentication successful! You can close this window.');
        } catch (error) {
            console.error('Error exchanging code for token:', error);
            res.status(500).send('Authentication failed');
        }
    });
}

export async function refreshAccessToken() {
    try {
        const response = await axios.post(TWITCH_TOKEN_URL, null, {
            params: {
                client_id: process.env.TWITCH_CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET,
                refresh_token: process.env.TWITCH_REFRESH_TOKEN,
                grant_type: 'refresh_token'
            }
        });

        const { access_token, refresh_token } = response.data;
        updateEnv({
            TWITCH_ACCESS_TOKEN: access_token,
            TWITCH_REFRESH_TOKEN: refresh_token,
        });

        return access_token;
    } catch (error) {
        console.error('Error refreshing access token:', error.response ? error.response.data : error.message);
        throw new Error('Failed to refresh access token');
    }
}

export async function getTwitchOAuthToken() {
    try {
        const response = await axios.post(TWITCH_TOKEN_URL, null, {
            params: {
                client_id: process.env.TWITCH_CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials'
            }
        });

        return response.data.access_token;
    } catch (error) {
        console.error('Error getting Twitch OAuth token:', error);
        throw error;
    }
}

export async function getTwitchBroadcasterId() {
    try {
        const accessToken = await getTwitchOAuthToken();
        const response = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`
            },
            params: {
                login: process.env.LOGIN_NAME
            }
        });

        const broadcasterId = response.data.data[0].id;
        updateEnv({
            BROADCASTER_ID: broadcasterId,
        });
        return broadcasterId;
    } catch (error) {
        console.error('Error getting Twitch Broadcaster ID:', error);
        throw error;
    }
}

export async function searchTwitchCategories(name) {
    try {
        const accessToken = await getTwitchOAuthToken();
        const response = await axios.get('https://api.twitch.tv/helix/search/categories', {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`,
            },
            params: {
                query: name,
            }
        });
        if (response.data.data == []) {
            console.warn('Twitch category not found, verify input name.')
        }

        return response.data.data;
    } catch (error) {
        console.error('Error getting Twitch category:', error.response.data);
        throw error;
    }
}

export async function getChannelSchedule() {
    try {
        const accessToken = await getTwitchOAuthToken();
        const response = await axios.get('https://api.twitch.tv/helix/schedule', {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`,
            },
            params: {
                broadcaster_id: process.env.BROADCASTER_ID,
            }
        });

        return response.data.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.warn('No preexisting schedule:', error.response.data);
        } else {
            console.error('Error getting schedule:', error.response.data);
            throw error;
        }
    }
}

export async function createScheduleSegment(segmentData) {
    try {
        const response = await axios.post('https://api.twitch.tv/helix/schedule/segment', segmentData, {
            headers: {
                'Client-Id': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            params: {
                broadcaster_id: process.env.BROADCASTER_ID,
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error creating schedule segment:', error);
        throw error;
    }
}

export async function deleteScheduleSegment(streamId) {
    try {
        const response = await axios.delete('https://api.twitch.tv/helix/schedule/segment', {
            headers: {
                'Client-Id': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
            },
            params: {
                broadcaster_id: process.env.BROADCASTER_ID,
                id: streamId,
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error deleting schedule segment:', error);
        throw error;
    }
}