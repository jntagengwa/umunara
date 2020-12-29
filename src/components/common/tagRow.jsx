import React, { useState, useEffect } from "react";
import { apiUrl } from "../../config.json";
import axios from "axios";
import { categoryColors } from "./styles";

const apiEndpoint = apiUrl + "/posts";

export default function TagRow() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    axios
      .get(apiEndpoint)
      .then((res) => {
        console.log(res);
        setPosts(res.data);
      })
      .catch((err) => {
        console.log(err);
      });
  });
  return (
    <div className="tags-container">
      {posts.map((post, postId) => (
        <span
          key={postId}
          className="category"
          style={{ backgroundColor: categoryColors[post.category.name] }}
        >
          {post.category.name}
        </span>
      ))}
    </div>
  );
}
