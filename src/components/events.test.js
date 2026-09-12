import request from "superagent";
import { getEvents } from "./events";

jest.mock("superagent", () => ({ get: jest.fn() }));

test("reports request errors without supplying an empty successful calendar", () => {
  const error = new Error("Calendar unavailable");
  request.get.mockReturnValueOnce({ end: (complete) => complete(error) });
  const onEvents = jest.fn();
  const onError = jest.fn();

  getEvents(onEvents, onError);

  expect(onError).toHaveBeenCalledWith(error);
  expect(onEvents).not.toHaveBeenCalled();
});

test("preserves the source and successful callback event mapping", () => {
  request.get.mockReturnValueOnce({
    end: (complete) => complete(null, {
      body: { items: [{ start: { date: "2026-09-12" }, summary: "Prayer watch" }] },
    }),
  });
  const onEvents = jest.fn();

  getEvents(onEvents);

  expect(request.get).toHaveBeenLastCalledWith(
    expect.stringContaining("https://www.googleapis.com/calendar/v3/calendars/umunarainc@gmail.com/events?")
  );
  expect(onEvents).toHaveBeenCalledWith([
    { start: "2026-09-12", end: "2026-09-12", title: "Prayer watch" },
  ]);
});
