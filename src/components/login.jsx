import React from "react";
import Joi from "joi-browser";
import Form from "./common/form";
import { Redirect } from "react-router-dom";
import auth from "../services/authService";

export class Login extends Form {
  state = {
    data: { username: "", password: "" },
    errors: {},
  };

  schema = {
    username: Joi.string().required().label("Username"),
    password: Joi.string().required().label("Password"),
  };

  doSubmit = async () => {
    try {
      const { data } = this.state;
      await auth.login(data.username, data.password);
      const user = auth.getCurrentUser();
      if (user && user.isAdmin) window.location = "/blog";
      else window.location = "/";
    } catch (ex) {
      if (ex.response && ex.response.status === 400) {
        const errors = { ...this.state.errors };
        errors.username = ex.response.data;
        this.setState({ errors });
      }
    }
  };
  render() {
    if (auth.getCurrentUser()) return <Redirect to="/" />;

    return (
      <div className="inner-container">
        <div className="header">Login</div>
        <div className="box">
          <div className="l-form">
            <div className="form-set">
              <form onSubmit={this.handleSubmit}>
                {this.renderInput("username", "Username")}
                {this.renderInput("password", "Password", "password")}
                <div className="buttons">
                  <div className="l-con">{this.renderButton("Login")}</div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
