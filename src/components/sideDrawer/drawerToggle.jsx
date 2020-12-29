import React from "react";
import "./drawerToggle.scss";

const DrawerToggle = ({ click }) => (
  <button className="toggle" onClick={click}>
    <div className="toggle__line" />
    <div className="toggle__line" />
    <div className="toggle__line" />
  </button>
);

export default DrawerToggle;
