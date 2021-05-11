import React, { Component } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFacebook,
  faYoutube,
  faPaypal,
} from "@fortawesome/free-brands-svg-icons";
import {
  faAt,
  faMobileAlt,
  faMicrophoneAlt,
} from "@fortawesome/free-solid-svg-icons";
import { faEnvelopeOpen } from "@fortawesome/free-regular-svg-icons";
import "./footer.scss";

class Footer extends Component {
  render() {
    return (
      <footer className="footer-container">
        <div className="container footer-extended">
          <div className="mission">
            <h3>Our Vision</h3>
            <p>
              We hope to build a Strong and God-fearing Community that will be
              the beacon of ever lasting peace and unity in our region, rooted
              in Jesus and held together by Faith and the Holy Spirit.
            </p>
            <p>
              We hope to spread the good news of our Lord’s resurrection and
              prepare all nations for his return.
            </p>
          </div>
          <div className="donate">
            <form
              action="https://www.paypal.com/donate"
              method="post"
              target="_blank"
              className="f-form"
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
            <div>
              <a
                href="https://umunarainc.podbean.com/"
                rel="noopener noreferrer"
                target="_blank"
              >
                <button className="submit">
                  Podcast{" "}
                  <FontAwesomeIcon icon={faMicrophoneAlt} id="podcast" />
                </button>
              </a>
            </div>
          </div>
          <div className="contact">
            <h3>Contact Us</h3>
            <p>
              <FontAwesomeIcon icon={faAt} id="email" />
              postmaster@umunara.org
            </p>
            <p>
              <FontAwesomeIcon icon={faMobileAlt} id="phone" />
              +1 (617) 416-8715
            </p>
            <p>
              <FontAwesomeIcon icon={faEnvelopeOpen} id="post" />
              P.O. Box 505194 <br></br>
              Chelsea, MA 02150, USA
            </p>
          </div>
        </div>
        <div className="footer-content">
          <p className="footer-p">
            {new Date().getFullYear()} © Umunara Inc. All Rights Reserved
          </p>
          <div className="socials">
            <a
              href="https://www.facebook.com/umunara.prayer"
              rel="noopener noreferrer"
              target="_blank"
            >
              <FontAwesomeIcon icon={faFacebook} id="facebook" />
            </a>
            <a
              href="https://www.youtube.com/UMUNARAINC"
              rel="noopener noreferrer"
              target="_blank"
            >
              <FontAwesomeIcon icon={faYoutube} id="youtube" />
            </a>
          </div>
        </div>
      </footer>
    );
  }
}

export default Footer;

// <a
//   href="https://www.instagram.com/fountainchurchkent/?hl=en"
//   rel="noopener noreferrer"
//   target="_blank"
// >
//   <i className="fa fa-instagram" aria-hidden="true" />
// </a>
