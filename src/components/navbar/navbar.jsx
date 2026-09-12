import React from "react";
import { Link } from "react-router-dom";
import DrawerToggle from "../sideDrawer/drawerToggle";
import img from "../../umunara_logo.png";
import "./navbar.scss";

const NavBar = ({ drawerClickHandler, drawerIsOpen, drawerToggleRef }) => {
  return (
    <header className="navbar">
      <nav className="navbar__navigation">
        <div className="navbar__logo">
          <Link className="logo" to="/" title="Umunara means Watchtower">
            <img src={img} alt="Umunara Inc." />
          </Link>
        </div>

        <div className="navbar_navigation-items">
          <Link className="items" to="/">
            Home
          </Link>
          <Link className="items" to="/about-us">
            About Us
          </Link>
          <Link className="items" to="/blog">
            Blog
          </Link>
          {/* <Link className="items" to="/registrations/new">
            Registration
          </Link> */}
          <Link className="items" to="/calendar">
            Events
          </Link>
        </div>
        <div className="rightt">
          <Link className="navbar__signin" to="/login">Member Sign In</Link>
          <Link className="navbar__give" to="/donate">Give</Link>
          <div className="drawer-toggle">
            <DrawerToggle
              click={drawerClickHandler}
              isOpen={drawerIsOpen}
              toggleRef={drawerToggleRef}
            />
          </div>
        </div>
      </nav>
    </header>
  );
};

export default NavBar;
