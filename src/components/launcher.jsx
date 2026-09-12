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
      <div className="member-access">
        <section className="member-access__panel" aria-label="Umunara welcome">
          <p className="eyebrow eyebrow--light"><span className="eyebrow__dot" /> Umunara community</p>
          <h1>Welcome To Umunara, Inc</h1>
          <blockquote>
            “I will stand at my watch and station myself on the ramparts; I will
            look to see what he will say to me and what answer I am to give to
            this complaint,”
          </blockquote>
          <p className="member-access__reference">Habakkuk 2:1</p>
        </section>
        <section className="member-access__form">
          <div className="box-container">
            {isSignInOpen && <Login />}
            {isCreateAccountOpen && <Register />}
          </div>
          <div className="box-controller">
            <button
              type="button"
              className={
                "controller " + (isSignInOpen ? "selected-controller" : "")
              }
              onClick={this.showSignInBox.bind(this)}
            >
              Sign in
            </button>
            <button
              type="button"
              className={
                "controller " + (isCreateAccountOpen ? "selected-controller" : "")
              }
              onClick={this.showCreateAccountBox.bind(this)}
            >
              Create an account
            </button>
          </div>
        </section>
      </div>
    );
  }
}
export default Launcher;
