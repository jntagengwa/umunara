import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Pagination } from "antd";
import TagRow from "./tagRow";
import "antd/dist/antd.css";

const PostGrid = ({ posts }) => {
  const [pageSize, setPageSize] = useState(9);
  const [current, setCurrent] = useState(1);

  const paginatedPosts = useMemo(
    (posts) => {
      const lastIndex = current * pageSize;
      const firstIndex = lastIndex - pageSize;

      return posts.slice(firstIndex, lastIndex);
    },
    [current, pageSize]
  );

  useEffect(() => {
    window.scroll({
      top: 500,
      left: 0,
      behavior: "smooth",
    });
  }, [current, pageSize]);

  return (
    <section className="grid-pagination container">
      <section className="post-grid container">
        {paginatedPosts.map((post, index) => (
          <div className="post-container">
            <figure className="field">
              <h1 className="text">{post.text}</h1>
            </figure>
            <TagRow tags={post.category} />
            <h2>{post.title}</h2>
            <p className="author-text">
              <span>
                by:
                <Link to={`/authors/${post.author}`}>{post.author}</Link>
              </span>
            </p>
            <p className="description-text">{post.description}</p>
            <Link to={post.link}>Read more...</Link>
          </div>
        ))}
      </section>
      <Pagination
        size="small"
        showSizeChanger
        onShowSizeChange={setPageSize}
        pageSize={pageSize}
        total={posts.length}
        defaultCurrent={current}
        onChange={setCurrent}
      />
    </section>
  );
};

export default PostGrid;

// <Link to={post.link}>
//   <img
//     src={require(`../../assets/images/${post.image}`)}
//     alt={post.image}
//   />
// </Link>
