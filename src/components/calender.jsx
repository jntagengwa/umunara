import React, { Component } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import { getEvents } from "./events";

const localizer = momentLocalizer(moment);

export default class MyCalendar extends Component {
  constructor(props) {
    super(props);
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
