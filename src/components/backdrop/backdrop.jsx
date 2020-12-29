import React from "react";
import "./backdrop.scss";

const Backdrop = ({ backdropHandler }) => (
  <div className="backdrop" onClick={backdropHandler} />
);

export default Backdrop;
