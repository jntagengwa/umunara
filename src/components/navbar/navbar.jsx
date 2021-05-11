import React from "react";
import { Link } from "react-router-dom";
import DrawerToggle from "../sideDrawer/drawerToggle";
import img from "../../umunara_logo.png";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaypal } from "@fortawesome/free-brands-svg-icons";
import "./navbar.scss";

const NavBar = ({ drawerClickHandler }) => {
  return (
    <header className="navbar">
      <nav className="navbar__navigation">
        <div className="navbar__logo">
          <Link className="logo" to="/">
            <img src={img} alt="logo" />
          </Link>
        </div>

        <div className="navbar_navigation-items">
          <Link className="items" to="/">
            Home
          </Link>
          <Link className="items" to="/calendar">
            Calendar
          </Link>
          <Link className="items" to="/blog">
            Blog
          </Link>
          <Link className="items" to="/registrations/new">
            Registration
          </Link>
          <Link className="items" to="/donate">
            Donate
          </Link>
          <Link className="items" to="/about-us">
            About Us
          </Link>
        </div>
        <div className="rightt">
          <div className="donate-nav">
            <form
              action="https://www.paypal.com/donate"
              method="post"
              target="_blank"
            >
              <input
                type="hidden"
                name="hosted_button_id"
                value="KTYR3LCAUW7VL"
              />
              {/* <input
              type="image"
              src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif"
              border="0"
              name="submit"
              title="PayPal - The safer, easier way to pay online!"
              alt="Donate with PayPal button"
            /> */}
              <button type="submit" className="submit">
                Donate <FontAwesomeIcon icon={faPaypal} id="paypal" />
              </button>
            </form>
          </div>
          <div className="drawer-toggle">
            <DrawerToggle click={drawerClickHandler} />
          </div>
        </div>
      </nav>
    </header>
  );
};

export default NavBar;
