import React from "react";
import { faPaypal } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import givingCommunity from "../images/giving-community.png";

const Donate = () => (
  <div className="giving-page">
    <section className="giving-hero giving-shell">
      <div>
        <p className="eyebrow"><span className="eyebrow__dot" /> Umunara, Inc.</p>
        <h1>Donate</h1>
      </div>
      <div className="giving-hero__verse">
        <img src={givingCommunity} alt="Umunara community gathering around Scripture in prayer" />
        <div><p>EVERY PENNY OF YOUR DONATION GOES TO THE WORK OF GOD</p></div>
      </div>
    </section>

    <section className="giving-shell giving-panel" id="give-now">
      <div className="giving-panel__intro">
        <p className="eyebrow">Support our work</p>
        <h2>Dear Friends in Christ</h2>
        <p>
          Dear Friends in Christ, looking at our purpose and vision, it is a
          no-brainer to realize that we have a long way to go to accomplish the
          task that God entrusted to us. As you might know, our Conference
          Bridge providers have recently upgraded their platform which
          automatically implies that the cost will be affected. Also, we just
          upgraded our website and in the process got rid of the radio which was
          costing us a lot. We replaced it with a podcast platform which will
          serve our audience better when we are not live. Listeners will choose
          which message to listen to unlike before. We have also answered God’s
          call to help orphans and widows. We plan to establish a scholarship
          fund to help students who are in dire need. At Umunara, Inc we do
          believe that education is very important and hope to do Whatever we
          can to support those, among us, who need support. Hence, Umunara, Inc.
          is requesting those who want to partner with us to fulfil the Great
          Commission to support us by:
        </p>
        <ul>
          <li>
            Sending a check or money order to Umunara, Inc P.O BOX 505194,
            CHELSEA, MA 02150, USA.
          </li>
          <li>Donating through PayPal.</li>
        </ul>
      </div>
      <form action="https://www.paypal.com/donate" method="post" target="_blank" className="giving-form">
        <input type="hidden" name="hosted_button_id" value="KTYR3LCAUW7VL" />
        <button type="submit" className="giving-submit">Give securely with PayPal <FontAwesomeIcon icon={faPaypal} /></button>
        <p className="giving-form__note"><strong>EVERY PENNY OF YOUR DONATION GOES TO THE WORK OF GOD</strong></p>
      </form>
    </section>
  </div>
);

export default Donate;
