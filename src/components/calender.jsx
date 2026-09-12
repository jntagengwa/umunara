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
      unavailable: false,
    };
  }

  componentDidMount() {
    getEvents(
      (events) => this.setState({ events, unavailable: false }),
      () => this.setState({ unavailable: true })
    );
  }

  render() {
    return (
      <div className="calendar-page">
        <header className="calendar-page__header">
          <p className="calendar-page__eyebrow">Gather with us</p>
          <h1>Upcoming Events</h1>
          <p>
            Explore upcoming gatherings, prayer watches, and community events.
          </p>
          <p className="calendar-page__orientation-note">
            HOLD IN LANDSCAPE MODE
          </p>
        </header>

        <div className="calendar-page__content">
          <section
            className="calendar-page__panel"
            aria-label="Events calendar"
          >
            {this.state.unavailable ? (
              <p role="alert">
                The events calendar is currently unavailable. Please try again later.
              </p>
            ) : (
              <Calendar
                className="calendar"
                localizer={localizer}
                events={this.state.events}
                views={["month", "agenda"]}
                defaultView="agenda"
                showMultiDayTimes
              />
            )}
          </section>

          <aside className="calendar-page__details">
            <p className="calendar-page__details-label">Weekly prayer watch</p>
            <h2>Join the live prayer line</h2>
            <p>Friday at 10:00 PM Eastern Time</p>
            <dl>
              <div>
                <dt>Dial-in number</dt>
                <dd>
                  <a href="tel:+12185480820">1-218-548-0820</a>
                </dd>
              </div>
              <div>
                <dt>Pass code</dt>
                <dd>13579#</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    );
  }
}
