import React, { Component } from "react";
import img from "../about.jpeg";

class About extends Component {
  render() {
    return (
      <div className="about-main container">
        <div className="header">
          <h1>About Us</h1>
        </div>
        <div className="content">
          <div className="about-word">
            <p>
              As Prophet Habakkuk asserted in his second chapter verse 1 saying,
              “I will stand at my watch and station myself on the ramparts; I
              will look to see what he will say to me and what answer I am to
              give to this complaint,” we have resolved to stand on our watch
              and to station ourselves on UMUNARA waiting to hear and to know
              the will of God. Hence, Umunara is a gathering of peoples from all
              nations who meet primarily on the phone conference call to wait
              for the Lord God. In the course of waiting, we worship, praise,
              and pray God and study the word of God.
              <br></br>
              Umunara started early 2007 by few individuals who were holding
              prayer meetings over the phone through three-way conference call.
              These few individuals came to be known as founder-members of
              Umunara. As the number of those who were interested in joining
              prayers coming from all continents grew, on September 23, 2007 God
              led the group to register and to set up an account with
              FreeConferencePro. Access number of this account is 1-218-548-0820
              and the pass code is 13579#. Currently, Umunara is managed by a
              committee led by The Rev. Dr. Jean Baptiste Ntagengwa. If you want
              to contact them, please drop a line at postmaster@umunara.org or
              go to contact us. God’s blessings to you!
            </p>
          </div>
          <div className="img">
            <img src={img} alt="Umunara Conference" />
          </div>
        </div>
      </div>
    );
  }
}

export default About;
