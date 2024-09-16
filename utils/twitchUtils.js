import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();
import configManager from '../config/configManager.js';
import { filterEventsByLocation, filterEventsByWeek } from './calendarUtils.js';
import crypto from 'crypto';

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

async function refreshAccessToken() {
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

async function twitchApiWrapper(apiCall) {
    try {
        return await apiCall();
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log('Access token expired. Refreshing...');
            await refreshAccessToken();
            return await apiCall();
        }
        throw error;
    }
}

async function getTwitchOAuthToken() {
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

async function getTwitchBroadcasterId() {
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

async function searchTwitchCategories(name) {
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

async function getChannelSchedule() {
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

async function createScheduleSegment(segmentData) {
    return twitchApiWrapper(async () => {
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
    });
}

async function deleteScheduleSegment(streamId) {
    return twitchApiWrapper(async () => {
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
    });
}


async function createSegmentRequestBody(event) {
    let duration = event.end.getTime() - event.start.getTime();
    duration = Math.floor(duration / 60000);
    duration = Math.max(30, Math.min(duration, 1380));
    let category;
    try {
        category = await searchTwitchCategories(event.summary);
    } catch (error) {
        throw error;
    }

    const body = {
        'start_time': event.start.toISOString(),
        'timezone': configManager.get('timezone'),
        'is_recurring': configManager.get('twitch.isRecurring'),
        'duration': duration.toString(),
        'category_id': (category[0] && category[0].id) ? category[0].id : null,
    }
    if (configManager.get('twitch.streamTitleFromEvent')) {
        body.title = event.description;
    }

    return body;
}

export async function updateChannelSchedule(events, weekRange) {
    const filteredEvents = filterEventsByLocation(events, ['Twitch']);
    try {
        const twitchSchedule = await getChannelSchedule();
        const twitchScheduleArr = (twitchSchedule && twitchSchedule.segments) ? filterEventsByWeek(twitchSchedule.segments, weekRange, true) : [];

        for (const [_, event] of twitchScheduleArr) {
            await deleteScheduleSegment(event.id);
        }

        const eventsArr = filterEventsByWeek(filteredEvents, weekRange, true);
        const futureEvents = Object.fromEntries(eventsArr);
        for (const key in futureEvents) {
            const event = futureEvents[key];
            const requestBody = await createSegmentRequestBody(event);
            await createScheduleSegment(requestBody);
        }
    } catch (error) {
        console.error('Error updating Twitch schedule:', error);
        throw error; // Rethrow the error to be caught by the caller
    }
}

// Webhook
const HMAC_PREFIX = 'sha256=';

export function verifyTwitchSignature(secret, message, twitchSignature) {
    const hmac = HMAC_PREFIX + getHmac(secret, message);
    console.log(twitchSignature);
    console.log(hmac);
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(twitchSignature));
}

function getHmac(secret, message) {
    return crypto.createHmac('sha256', secret)
        .update(message)
        .digest('hex');
}

export function handleTwitchEvent(event) {
    const eventType = event.subscription.type;
    const broadcasterId = event.event.broadcaster_user_id;

    if (eventType === 'stream.online') {
        console.log(`Channel ${broadcasterId} went online`);
        // Add your notification logic here
    } else if (eventType === 'stream.offline') {
        console.log(`Channel ${broadcasterId} went offline`);
        // Add your notification logic here
    }
}

export async function subscribeToTwitchEvents(broadcasterId, eventType) {
    const url = 'https://api.twitch.tv/helix/eventsub/subscriptions';
    const data = {
        type: eventType,
        version: '1',
        condition: { broadcaster_user_id: broadcasterId },
        transport: {
            method: 'webhook',
            callback: `${process.env.WEBHOOK_URL}/webhook`,
            secret: process.env.WEBHOOK_SECRET,
        }
    };

    try {
        const accessToken = await getTwitchOAuthToken();
        const response = await axios.post(url, data, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`Subscribed to ${eventType} for broadcaster ${broadcasterId}`);
        return response.data;
    } catch (error) {
        console.error('Error subscribing to Twitch event:', error);
        throw error;
    }
}