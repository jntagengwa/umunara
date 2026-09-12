import React from "react";
import { act, render } from "@testing-library/react";
import MyCalendar from "./calender";
import { getEvents } from "./events";

jest.mock("./events", () => ({ getEvents: jest.fn() }));

beforeEach(() => getEvents.mockReset());

test("shows an unavailable message when the calendar request fails", () => {
  const { getByRole, getByText, queryByText } = render(<MyCalendar />);

  act(() => getEvents.mock.calls[0][1](new Error("Calendar unavailable")));

  expect(getByRole("alert")).toHaveTextContent(
    "The events calendar is currently unavailable. Please try again later."
  );
  expect(queryByText("There are no events in this range.")).not.toBeInTheDocument();
  expect(getByText("Friday at 10:00 PM Eastern Time")).toBeInTheDocument();
});

test("keeps the agenda and month views available after events load", () => {
  const { getByRole, queryByRole } = render(<MyCalendar />);

  act(() => getEvents.mock.calls[0][0]([]));

  expect(queryByRole("alert")).not.toBeInTheDocument();
  expect(getByRole("button", { name: "Month" })).toBeInTheDocument();
  expect(getByRole("button", { name: "Agenda" })).toHaveClass("rbc-active");
});
