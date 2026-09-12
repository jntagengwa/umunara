import React from "react";
import "./drawerToggle.scss";

const DrawerToggle = ({ click, isOpen, toggleRef }) => (
  <button
    aria-controls="mobile-navigation"
    aria-expanded={isOpen}
    aria-label="Open navigation menu"
    className="toggle"
    onClick={click}
    ref={toggleRef}
    type="button"
  >
    <span aria-hidden="true" className="toggle__icon">
      <span className="toggle__line" />
      <span className="toggle__line" />
      <span className="toggle__line" />
    </span>
  </button>
);

export default DrawerToggle;
