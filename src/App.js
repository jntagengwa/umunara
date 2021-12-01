import React, { Component } from "react";
import { Redirect, Route, Switch } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import About from "./components/about";
import auth from "./services/authService";
import Backdrop from "./components/backdrop/backdrop";
import Blog from "./components/blog";
import Calendar from "./components/calender";
import Donate from "./components/donate";
import Footer from "./components/footer/footer";
import History from "./components/history";
import Home from "./components/home";
import Logout from "./components/common/logout";
import Launcher from "./components/launcher";
import MemberForm from "./components/memberForm";
import Members from "./components/members";
import NavBar from "./components/navbar/navbar";
import NotFound from "./components/common/notFound";
import PostForm from "./components/blogPost";
import ProtectedRoute from "./components/common/protectedRoute";
import SideDrawer from "./components/sideDrawer/sideDrawer";
import "react-toastify/dist/ReactToastify.css";
import "./scss/App.scss";
// import RegistrationForm from "./components/registrationForm";
import Registrations from "./components/registrations";

class App extends Component {
  state = {
    sideDrawerOpen: false,
  };

  componentDidMount() {
    const user = auth.getCurrentUser();
    this.setState({ user });
  }

  toggleClickHandler = () => {
    this.setState((prevState) => {
      return { sideDrawerOpen: !prevState.sideDrawerOpen };
    });
  };

  handleBackdropClick = () => {
    this.setState({ sideDrawerOpen: false });
  };

  render() {
    let backdrop;

    if (this.state.sideDrawerOpen) {
      backdrop = <Backdrop backdropHandler={this.handleBackdropClick} />;
    }
    return (
      <React.Fragment>
        <ToastContainer />
        <NavBar drawerClickHandler={this.toggleClickHandler} />
        <SideDrawer
          show={this.state.sideDrawerOpen}
          backdropHandler={this.handleBackdropClick}
        />
        {backdrop}
        <main>
          <Switch>
            <Route exact path="/" component={Home} />
            <Route path="/about-us" component={About} />
            <Route path="/calendar" component={Calendar} />
            <Route path="/donate" component={Donate} />
            <Route path="/history" component={History} />
            <ProtectedRoute path="/blog/:id" component={PostForm} />
            <Route path="/blog" component={Blog} />
            <Route path="/members/:id" component={MemberForm} />
            {/* <Route path="/registrations/:id" component={RegistrationForm} /> */}
            <ProtectedRoute path="/members" component={Members} />
            <ProtectedRoute path="/registrations" component={Registrations} />
            <Route path="/login" component={Launcher} />
            <Route path="/logout" component={Logout} />
            <Route path="/not-found" component={NotFound} />
            <Redirect to="/not-found" />
          </Switch>
        </main>
        <Footer />
      </React.Fragment>
    );
  }
}

export default App;
