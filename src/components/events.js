import request from "superagent";

const CALENDAR_ID = "umunarainc@gmail.com";
const API_KEY = "AIzaSyCer8NeI76eHXGQ4NscSjcpNR3uHkKbmYQ";
let url = `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events?maxResults=500&orderBy=startTime&singleEvents=true&key=${API_KEY}`;

export function getEvents(callback, onError) {
  request.get(url).end((err, resp) => {
    if (err) {
      if (onError) onError(err);
      return;
    }
    const events = [];
    resp.body.items.forEach((event) => {
      if (event.start) {
        events.push({
          start: event.start.date || event.start.dateTime,
          end: event.start.date || event.start.dateTime,
          title: event.summary,
        });
      }
    });

    callback(events);
  });
}
