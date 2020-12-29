import React from "react";
import { Slide } from "react-slideshow-image";
import img1 from "../images/image_1.jpg";
import img2 from "../images/image_2.jpg";
import img3 from "../images/image_3.jpg";
import img4 from "../images/image_4.jpg";
import img5 from "../images/image_5.jpg";
import "./slideShow.scss";
import "react-slideshow-image/dist/styles.css";

// const slideImages = [
//   "images/image_1.jpg",
//   "images/image_2.jpg",
//   "images/image_3.jpg",
//   "images/image_4.jpg",
//   "images/image_5.jpg",
// ];

const Slideshow = () => {
  return (
    <div className="slide-container">
      <Slide>
        <div className="each-slide">
          <img src={img1} alt="img1" />
        </div>
        <div className="each-slide">
          <img src={img2} alt="img2" />
        </div>
        <div className="each-slide">
          <img src={img3} alt="img3" />
        </div>
        <div className="each-slide">
          <img src={img4} alt="img4" />
        </div>
        <div className="each-slide">
          <img src={img5} alt="img5" />
        </div>
      </Slide>
    </div>
  );
};

export default Slideshow;
