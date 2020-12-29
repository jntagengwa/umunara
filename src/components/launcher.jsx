import React, { Component } from "react";
import { Register } from "./register";
import { Login } from "./login";

class Launcher extends Component {
  constructor(props) {
    super(props);
    this.state = { isSignInOpen: true, isCreateAccountOpen: false };
  }

  showSignInBox() {
    this.setState({ isSignInOpen: true, isCreateAccountOpen: false });
  }

  showCreateAccountBox() {
    this.setState({ isCreateAccountOpen: true, isSignInOpen: false });
  }

  render() {
    const { isSignInOpen, isCreateAccountOpen } = this.state;

    return (
      <div className="ui-container">
        <div className="box-container">
          {isSignInOpen && <Login />}
          {isCreateAccountOpen && <Register />}
        </div>
        <div className="box-controller">
          <div
            className={
              "controller " + (isSignInOpen ? "selected-controller" : "")
            }
            onClick={this.showSignInBox.bind(this)}
          >
            Login
          </div>
          <div
            className={
              "controller " + (isCreateAccountOpen ? "selected-controller" : "")
            }
            onClick={this.showCreateAccountBox.bind(this)}
          >
            Register
          </div>
        </div>
      </div>
    );
  }
}
export default Launcher;
