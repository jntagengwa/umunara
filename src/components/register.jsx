import React from "react";
import Joi from "joi-browser";
import Form from "./common/form";
import { register } from "../services/userService";
import auth from "../services/authService";

export class Register extends Form {
  state = {
    data: { name: "", username: "", password: "" },
    errors: {},
  };

  schema = {
    name: Joi.string().required().label("Name"),
    username: Joi.string().required().email().label("Username"),
    password: Joi.string().required().min(5).label("Password"),
  };

  doSubmit = async () => {
    try {
      const response = await register(this.state.data);
      auth.loginWithJwt(response.headers["x-auth-token"]);
      window.location = "/";
    } catch (ex) {
      if (ex.response && ex.response.status === 400) {
        const errors = { ...this.state.errors };
        errors.username = ex.response.data;
        this.setState({ errors });
      }
    }
  };

  render() {
    return (
      <div className="inner-container">
        <div className="header">Sing Up</div>
        <div className="box">
          <div className="l-form">
            <div className="form-set">
              <form onSubmit={this.handleSubmit}>
                {this.renderInput("name", "Name")}
                {this.renderInput("username", "Username")}
                {this.renderInput("password", "Password", "password")}
                <div className="buttons">
                  <div className="l-con">{this.renderButton("Sign Up")}</div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
