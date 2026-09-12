import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { Pagination } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import auth from "../services/authService";
import { categoryColors } from "./common/styles";
import { apiUrl } from "../config.json";
import "antd/dist/antd.css";

const apiEndpoint = apiUrl + "/posts";

export default function Blog() {
  const [posts, setPosts] = useState([]);
  const [current, setCurrent] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(6);
  const [requestStatus, setRequestStatus] = useState("loading");
  const user = auth.getCurrentUser();

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const res = await axios.get(apiEndpoint);
        setPosts(res.data.sort((a, b) => b.createdAt - a.createdAt));
        setRequestStatus("complete");
      } catch {
        setRequestStatus("error");
      }
    };

    fetchPosts();
  }, []);

  const handleRemove = async (id) => {
    await axios.delete(apiEndpoint + `/${id}`);
    const res = await axios.get(apiEndpoint);
    setPosts(res.data.sort((a, b) => b.createdAt - a.createdAt));
  };

  const lastPost = current * postsPerPage;
  const firstPost = lastPost - postsPerPage;
  const publishedPosts = posts.slice(firstPost, lastPost);
  const featuredPost = posts[0];

  return (
    <div className="reflections-page">
      <section className="reflections-hero reflections-shell">
        <h1>Umunara Inc, Blog</h1>
      </section>

      {featuredPost && (
        <section className="reflections-shell reflections-featured">
          <article className="featured-reflection">
            <div className="featured-reflection__copy">
              <p className="eyebrow">Featured reflection</p>
              <h2>{featuredPost.title}</h2>
              {featuredPost.description && <p>{featuredPost.description}</p>}
              {featuredPost.text && <p>{featuredPost.text}</p>}
              <div className="featured-reflection__meta">
                <span>{featuredPost.author || "Umunara Inc."}</span>
              </div>
            </div>
          </article>
        </section>
      )}

      <section className="reflections-shell reflections-publications" id="recent-publications">
        <div className="reflections-publications__heading"><div><p className="eyebrow">Recent publications</p><h2>Posts</h2></div>{user && user.isAdmin && <Link to="/blog/new" className="new-reflection"><FontAwesomeIcon icon={faPlus} /> New reflection</Link>}</div>
        {requestStatus === "loading" && <p className="reflections-status" role="status">Loading reflections…</p>}
        {requestStatus === "error" && <p className="reflections-status" role="alert">We could not load reflections. Please try again later.</p>}
        {requestStatus === "complete" && posts.length === 0 && <p className="reflections-status" role="status">No reflections have been published yet.</p>}
        <div className="reflection-grid">
          {publishedPosts.map((post, index) => (
            <article className="reflection-card" key={post._id || post.title}>
              <span className="reflection-card__category" style={{ backgroundColor: categoryColors[post.category.name] || "#EBF3FA" }}>{post.category.name}</span>
              <h3>{post.title}</h3>
              {post.description && <p>{post.description}</p>}
              {post.text && <p>{post.text}</p>}
              <footer><span>{post.author || "Umunara Inc."}</span><span>·</span><span>Reflection {index + 1}</span></footer>
              {user && user.isAdmin && post._id && <div className="reflection-card__actions"><Link to={`/blog/${post._id}`}>Edit</Link><button type="button" onClick={() => handleRemove(post._id)}>Delete</button></div>}
            </article>
          ))}
        </div>
        {posts.length > 0 && <Pagination className="pag" size="small" showSizeChanger onShowSizeChange={(_, size) => setPostsPerPage(size)} pageSize={postsPerPage} total={posts.length} current={current} onChange={setCurrent} />}
      </section>
    </div>
  );
}
