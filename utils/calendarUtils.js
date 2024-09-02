import fetch from 'node-fetch';
import ical from 'ical';
import dotenv from 'dotenv';
dotenv.config();
import config from '../config.js';

// Function to get the start and end of the week for a given date
function getWeekRange(date) {
    const currentDate = new Date(date);
    const dayOfWeek = currentDate.getDay();
    const diff = currentDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is Sunday
  
    const monday = new Date(currentDate.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    friday.setHours(23, 59, 0, 0);
  
    return {
        start: monday,
        end: friday
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
        const events = ical.parseICS(icsData);

        const timezoneMatch = icsData.match(/X-WR-TIMEZONE:(.*)/);
        const timezone = config.timezone || timezoneMatch[1];
        const eventsArray = Object.entries(events);

        // Filter events within the week range
        const filteredEventsArray = eventsArray.filter(([, event]) => {
            const eventStart = event.start;
            return eventStart >= weekRange.start && eventStart <= weekRange.end;
        });
        
        // Sort the filtered events
        filteredEventsArray.sort(([, eventA], [, eventB]) => eventA.start.getTime() - eventB.start.getTime());

        const sortedEvents = Object.fromEntries(filteredEventsArray);

        return {weekRange, events: sortedEvents};
    } catch (error) {
        throw error; // Re-throw the error to be handled by the caller
    }
}