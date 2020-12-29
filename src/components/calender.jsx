import React, { Component } from "react";
import moment from "moment";
import { getEvents } from "./events";
import { Calendar, momentLocalizer } from "react-big-calendar";

const localizer = momentLocalizer(moment);

class MyCalendar extends Component {
  constructor() {
    super();
    this.state = {
      events: [],
    };
  }
  componentDidMount() {
    getEvents((events) => {
      this.setState({ events });
    });
  }
  render() {
    return (
      <div className="cal container">
        <div className="head">
          <h1>Upcoming Events</h1>
        </div>
        {/* <iframe
          src="https://calendar.google.com/calendar/embed?src=umunarainc%40gmail.com&ctz=America%2FNew_York"
          style={{ border: 0 }}
          frameBorder="0"
          scrolling="no"
          className="calendar"
        ></iframe> */}
        <p className="hide">
          <strong>HOLD IN LANDSCAPE MODE</strong>
        </p>
        <Calendar
          className="calendar"
          style={{ height: "600px" }}
          localizer={localizer}
          events={this.state.events}
          views={["month", "agenda"]}
          defaultView="agenda"
          showMultiDayTimes
        />
      </div>
    );
  }
}

export default MyCalendar;
