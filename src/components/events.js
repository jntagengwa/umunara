import request from "superagent";

const CALENDAR_ID = "umunarainc@gmail.com";
const API_KEY = "AIzaSyCer8NeI76eHXGQ4NscSjcpNR3uHkKbmYQ";
let url = `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events?key=${API_KEY}`;

export function getEvents(callback) {
  request.get(url).end((err, resp) => {
    if (!err) {
      const events = [];
      resp.body.items.map((event) => {
        if (event.start) {
          return events.push({
            start: event.start.date || event.start.dateTime,
            end: event.start.date || event.start.dateTime,
            title: event.summary,
          });
        } else {
          return events.push({
            start: event.originalStartTime.dateTime,
            title: event.summery,
          });
        }
      });

      callback(events);
    }
  });
}
// event.originalStartTime.dateTime ||
