import React, { useState, useEffect } from "react";
import axios from "axios";
import auth from "../services/authService";
import { Link } from "react-router-dom";
import { categoryColors } from "./common/styles";
import { apiUrl } from "../config.json";
import { Pagination } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import "antd/dist/antd.css";

const apiEndpoint = apiUrl + "/posts";

export default function Blog() {
  const [posts, setPosts] = useState([]);
  const [current, setCurrent] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(6);

  useEffect(() => {
    const fetchPosts = async () => {
      const res = await axios.get(apiEndpoint);
      let sorted = res.data.sort(function (a, p) {
        return p.createdAt - a.createdAt;
      });

      setPosts(sorted);
    };

    fetchPosts();
  }, []);

  async function handleRemove(id) {
    await axios.delete(apiEndpoint + `/${id}`);
    const fetchPosts = async () => {
      const res = await axios.get(apiEndpoint);
      let sorted = res.data.sort(function (a, p) {
        return p.createdAt - a.createdAt;
      });

      setPosts(sorted);
    };

    fetchPosts();
  }

  const lastPost = current * postsPerPage;
  const firstPost = lastPost - postsPerPage;
  const currentPosts = posts.slice(firstPost, lastPost);

  const user = auth.getCurrentUser();

  return (
    <section className="blog container">
      <div className="top">
        <h1>Umunara Inc, Blog</h1>
        <div className="button">
          {user && user.isAdmin && (
            <Link to="/blog/new">
              <FontAwesomeIcon icon={faPlus} id="plus" />
            </Link>
          )}
        </div>
      </div>
      <section className="post-grid container">
        {currentPosts.map((post, index) => (
          <div className="post-container" key={post._id}>
            <figure className="field overlay">
              <p>{post.text}</p>
            </figure>
            <div className="tags-container">
              <span
                style={{
                  backgroundColor: categoryColors[post.category.name],
                }}
              >
                {post.category.name}
              </span>
            </div>
            <h2>{post.title}</h2>
            <div className="author-text">
              <span>
                by:
                <p>{post.author}</p>
              </span>
            </div>
            <p className="description-text">{post.description}</p>
            {user && user.isAdmin && (
              <Link to={`/blog/${post._id}`}>Edit...</Link>
            )}
            {user && user.isAdmin && (
              <button className="btn" onClick={() => handleRemove(post._id)}>
                Delete
              </button>
            )}
          </div>
        ))}
      </section>
      <Pagination
        className="pag"
        size="small"
        showSizeChanger
        onShowSizeChange={setPostsPerPage}
        pageSize={postsPerPage}
        total={posts.length}
        defaultCurrent={current}
        onChange={setCurrent}
      />
    </section>
  );
}
