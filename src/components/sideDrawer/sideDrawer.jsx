import React from "react";
import { NavLink } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { faPaypal } from "@fortawesome/free-brands-svg-icons";
import auth from "../../services/authService";
import "./sideDrawer.scss";

const SideDrawer = ({ user, show, backdropHandler }) => {
  let drawerClasses = "side-drawer";
  if (show) {
    drawerClasses = "side-drawer open";
  }

  user = auth.getCurrentUser();

  return (
    <nav className={drawerClasses}>
      <FontAwesomeIcon icon={faTimes} id="close" onClick={backdropHandler} />
      <div className="navbar-nav">
        <NavLink className="nav-item" to="/" onClick={backdropHandler}>
          Home
        </NavLink>
        <NavLink className="nav-item" to="/about-us" onClick={backdropHandler}>
          About Us
        </NavLink>
        <NavLink className="nav-item" to="/calendar" onClick={backdropHandler}>
          Calender
        </NavLink>
        <NavLink className="nav-item" to="/blog" onClick={backdropHandler}>
          Blog
        </NavLink>
        <NavLink
          className="nav-item"
          to="/members/new"
          onClick={backdropHandler}
        >
          Membership
        </NavLink>
        {user && user.isAdmin && (
          <NavLink className="nav-item" to="/members" onClick={backdropHandler}>
            Members
          </NavLink>
        )}
        <NavLink className="nav-item" to="/history" onClick={backdropHandler}>
          History
        </NavLink>
        <NavLink className="nav-item" to="/donate" onClick={backdropHandler}>
          Donate
        </NavLink>{" "}
        {!user && (
          <NavLink className="nav-item" to="/login" onClick={backdropHandler}>
            Login/Register
          </NavLink>
        )}
        {user && (
          <NavLink className="nav-item" to="/logout" onClick={backdropHandler}>
            Logout
          </NavLink>
        )}
        <div className="donate-side">
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
      </div>
    </nav>
  );
};

export default SideDrawer;
