import React from "react";
import { render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import Blog from "./blog";

jest.mock("axios");
jest.mock("../services/authService", () => ({
  getCurrentUser: () => null,
}));
jest.mock("antd", () => ({ Pagination: () => null }));

test("preserves description and text in the featured reflection and its card", async () => {
  axios.get.mockResolvedValueOnce({
    data: [{
      _id: "reflection-1",
      title: "A community reflection",
      description: "The original introduction.",
      text: "The complete original reflection body.",
      category: { name: "Prayer" },
      createdAt: 1,
    }],
  });

  const { findAllByRole } = render(
    <MemoryRouter><Blog /></MemoryRouter>
  );
  const articles = await findAllByRole("article");

  expect(articles).toHaveLength(2);
  articles.forEach((article) => {
    expect(within(article).getByText("The original introduction.")).toBeInTheDocument();
    expect(within(article).getByText("The complete original reflection body.")).toBeInTheDocument();
  });
});
