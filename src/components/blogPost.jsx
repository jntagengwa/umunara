import React from "react";
import Joi from "joi-browser";
import Form from "./common/form";
import { getPost, savePost } from "../services/postService";
import { getCategories } from "../services/categoryService";
import auth from "../services/authService";

class PostForm extends Form {
  state = {
    data: {
      title: "",
      categoryId: "",
      text: "",
      author: "",
      description: "",
    },
    categories: [],
    errors: {},
  };

  schema = {
    _id: Joi.string(),
    title: Joi.string().min(5).max(50).required().label("Title"),
    categoryId: Joi.string().required().label("Category"),
    text: Joi.string().min(1).max(9999999).required().label("Text"),
    author: Joi.string().min(5).max(30).required().label("Author"),
    description: Joi.string()
      .min(1)
      .max(9999999)
      .required()
      .label("Description"),
  };

  async populateCategories() {
    const { data: categories } = await getCategories();
    this.setState({ categories });
  }

  async populatePost() {
    try {
      const postId = this.props.match.params.id;
      if (postId === "new") return;

      const { data: post } = await getPost(postId);
      this.setState({ data: this.mapToViewModel(post) });
    } catch (ex) {
      if (ex.response && ex.response.status === 404)
        this.props.history.replace("/not-found");
    }
  }

  async componentDidMount() {
    await this.populateCategories();
    await this.populatePost();
  }

  mapToViewModel(post) {
    return {
      _id: post._id,
      title: post.title,
      categoryId: post.category._id,
      text: post.text,
      author: post.author,
      description: post.description,
    };
  }

  doSubmit = async () => {
    await savePost(this.state.data);
    let user = auth.getCurrentUser();

    if (user && (user = user.isAdmin)) this.props.history.push("/blog");
    else this.props.history.replace("/");
  };

  render() {
    return (
      <div className="container">
        <div className="content">
          <h1>Blog Post</h1>
          <div className="form">
            <div className="form-group">
              <form onSubmit={this.handleSubmit}>
                {this.renderInput("title", "Title")}
                {this.renderSelect(
                  "categoryId",
                  "Category",
                  this.state.categories
                )}
                <div className="about">
                  {this.renderInput("author", "Author")}
                  {this.renderInput("description", "Description")}
                  <div className="text">
                    {this.renderInput("text", "Text", "text")}
                  </div>
                </div>
                <div className="buttons">
                  <div className="b-con">{this.renderButton("Save")}</div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default PostForm;
