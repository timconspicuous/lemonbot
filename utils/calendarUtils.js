import ical from 'ical';
import dotenv from 'dotenv';
dotenv.config();
import configManager from '../config/configManager.js';
import process from 'node:process';

// Function to get the start and end of the week for a given date
function getWeekRange(date) {
    const currentDate = new Date(date);
    const dayOfWeek = currentDate.getDay();
    const diff = currentDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(currentDate.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 0, 0);
  
    return {
        start: monday,
        end: sunday
    };
}

// Function to fetch and parse iCalendar data from a URL
export async function fetchCalendar(date = new Date()) {
    const weekRange = getWeekRange(date);
    try {
        const response = await fetch(process.env.ICAL);
        if (!response.ok) {
            throw new Error(`Failed to fetch calendar data: ${response.statusText}`);
        }

        const icsData = await response.text();
        let events = ical.parseICS(icsData);

        let timezone;
        if (configManager.get('timezone')) {
            timezone = configManager.get('timezone');
        } else {
            const timezoneMatch = icsData.match(/X-WR-TIMEZONE:(.*)/);
            timezone = timezoneMatch[1];
            await configManager.updateConfig({ timezone: timezone });
        }

        // Filter and sort events
        const eventsArray = filterEventsByWeek(events, weekRange);
        eventsArray.sort(([, eventA], [, eventB]) => eventA.start.getTime() - eventB.start.getTime());

        events = Object.fromEntries(eventsArray);

        return {weekRange, events};
    } catch (error) {
        throw error;
    }
}

export function filterEventsByLocation(events, filterArr) {
    const filteredEvents = {};
    for (const key in events) {
        const event = events[key];
        if (filterArr && filterArr.includes(event.location)) {
            filteredEvents[key] = event;
        }
    }
    return filteredEvents;
}

export function filterEventsByWeek(events, weekRange, filterOutPastEvents = false) {
    // Attention: this can take in an object or an array, but will always return an array.
    // The ternary operator is for two types of input: iCalendar (object) and Twitch schedule (array).
    const eventsArray = (typeof events === 'object') ? Object.entries(events) : events;
    const filteredEventsArray = eventsArray.filter(([, event]) => {
        const eventStart = event.start || new Date(event.start_time);
        if (filterOutPastEvents) { // Twitch schedule returns an error if you try to delete past segments
            const now = new Date();
            const aWeekFromNow = new Date(now);
            aWeekFromNow.setDate(aWeekFromNow.getDate() + 7);    
            return eventStart >= now && eventStart <= aWeekFromNow; // so we take the next 7 days instead
        }
        return eventStart >= weekRange.start && eventStart <= weekRange.end;
    });
    return filteredEventsArray;
}