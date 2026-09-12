import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faCalendarAlt,
  faHeadphones,
  faPhoneAlt,
} from "@fortawesome/free-solid-svg-icons";
import prayerGathering from "../images/image_2.jpg";
import conference from "../images/PHOTO.jpg";
import prayerLine from "../images/call.jpeg";
import aboutImage from "../about.jpeg";
import "./home.scss";

function Home() {
  return (
    <div className="ministry-home">
      <section className="ministry-hero ministry-shell">
        <div className="ministry-hero__copy">
          <p className="eyebrow">
            <span className="eyebrow__dot" /> Umunara Inc. · International prayer ministry
          </p>
          <h1>Welcome To Umunara, Inc</h1>
          <p className="ministry-hero__intro">
            We are glad you took some time out of your busy schedule to check on
            us.
          </p>
          <div className="ministry-actions">
            <a className="button button--primary" href="#prayer-watch">
              Join the prayer watch <FontAwesomeIcon icon={faArrowRight} />
            </a>
            <a className="button button--secondary" href="#about">
              Discover our story
            </a>
          </div>
        </div>
        <div className="ministry-hero__image">
          <img src={prayerGathering} alt="Members of the Umunara community praying together" />
          <span className="live-chip"><span /> Ku Munara duhura na Yesu</span>
        </div>
      </section>

      <section className="ministry-story ministry-shell">
        <div className="ministry-story__copy">
          <p className="eyebrow">Our welcome</p>
          <h2>Our Mission</h2>
          <p>
            We are in the business of making disciples of Jesus Christ in all
            nations and to encourage them to obey His commandments. This is our
            Mission: to fulfill the Great Commission found in{" "}
            <strong>Matthew 28:16-30</strong>. We believe that the Bible, as it
            is inspired by God, is the only instrument that helps us to know the
            will of God and to know where to get our salvation: on the Cross
            Jesus Christ paid the price on our behalf, imparted on us His
            righteousness and our responsibility is to impart on him our sins
            and to receive Him as our personal Savior. Ku Munara duhura na Yesu:
            Abarushye n’abaremerewe bararuhuka, abarwayi barakira, Impumyi
            zirahumuka, ibipfamatwi birumva, ibimuga biragenda, kandi abakene
            baragezwaho ubutumwa bwiza (Yohana 11:5). At Umunara, we welcome
            everybody regardless of their denomination; indeed whether you are
            a Christian or not please join us every Friday at 10:00 PM Eastern
            Time (USA &amp; Canada) that is, 0300GMT at{" "}
            <strong>1-218-548-0820</strong>, Pass Code{" "}
            <strong>13579#</strong> so that we can be together at the watch and
            station ourselves on the ramparts (Habakkuk 2:1). This is not a toll
            free number! A calling card or a long distance plan required! For
            more scheduled events, please check on our calendar or just open
            this website and follow us on our{" "}
            <a
              href="https://umunarainc.podbean.com/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Podcast
            </a>
            .
          </p>
          <a className="button button--dark" href="#about">Learn about Umunara <FontAwesomeIcon icon={faArrowRight} /></a>
        </div>
        <div className="ministry-story__details">
          <p className="eyebrow">Matthew 28:16-30</p>
          <p>
            This is our Mission: to fulfill the Great Commission found in
            Matthew 28:16-30.
          </p>
        </div>
      </section>

      <section className="about-section ministry-shell" id="about">
        <div className="about-section__image"><img src={aboutImage} alt="Umunara conference gathering" /></div>
        <div className="about-section__copy">
          <p className="eyebrow">About Umunara</p>
          <h2>About Us</h2>
          <p>
            As Prophet Habakkuk asserted in his second chapter verse 1 saying,
            “I will stand at my watch and station myself on the ramparts; I will
            look to see what he will say to me and what answer I am to give to
            this complaint,” we have resolved to stand on our watch and to
            station ourselves on UMUNARA waiting to hear and to know the will of
            God. Hence, Umunara is a gathering of peoples from all nations who
            meet primarily on the phone conference call to wait for the Lord
            God. In the course of waiting, we worship, praise, and pray God and
            study the word of God.
          </p>
          <p>
            Umunara started early 2007 by few individuals who were holding
            prayer meetings over the phone through three-way conference call.
            These few individuals came to be known as founder-members of
            Umunara. As the number of those who were interested in joining
            prayers coming from all continents grew, on September 23, 2007 God
            led the group to register and to set up an account with
            FreeConferencePro. Access number of this account is{" "}
            <strong>1-218-548-0820</strong> pand the pass code is{" "}
            <strong>13579#</strong>. Currently, Umunara is managed by a committee
            led by The Rev. Dr. Jean Baptiste Ntagengwa. If you want to contact
            them, please drop a line at postmaster@umunara.org. God’s blessings
            to you!
          </p>
          <div className="about-section__facts"><span>Founded in 2007</span><span>Prayer line: 1-218-548-0820</span><span>Pass code: 13579#</span></div>
        </div>
      </section>

      <section className="prayer-watch ministry-shell" id="prayer-watch">
        <div className="prayer-watch__content">
          <p className="eyebrow eyebrow--light"><span className="eyebrow__dot" /> Live prayer community</p>
          <h2>Meet us at the watch.</h2>
          <div className="prayer-watch__meta">
            <span><FontAwesomeIcon icon={faPhoneAlt} /> 1-218-548-0820</span>
            <span><FontAwesomeIcon icon={faCalendarAlt} /> Pass code 13579#</span>
          </div>
        </div>
        <img src={prayerLine} alt="Umunara Friday prayer meeting details" />
      </section>

      <section className="conference ministry-shell">
        <div className="conference__image"><img src={conference} alt="Umunara annual conference announcement" /></div>
        <div className="conference__copy">
          <p className="eyebrow">Gather with us</p>
          <h2>ANNUAL UMUNARA CONFERENCE</h2>
          <a className="text-link" href="#prayer-watch">Prayer meeting details <FontAwesomeIcon icon={faArrowRight} /></a>
        </div>
      </section>

      <section className="podcast-panel ministry-shell">
        <div>
          <p className="eyebrow">Listen anywhere</p>
          <h2>Visit our Podcast for more of the Word!!!!!!</h2>
          <a className="button button--primary" href="https://umunarainc.podbean.com/" rel="noopener noreferrer" target="_blank">
            <FontAwesomeIcon icon={faHeadphones} /> Visit the podcast
          </a>
        </div>
        <iframe
          className="podcast-embed"
          src="https://www.podbean.com/media/player/multi?playlist=http%3A%2F%2Fplaylist.podbean.com%2F10311907%2Fplaylist_multi.xml&amp;vjs=1&amp;size=550&amp;skin=12&amp;episode_list_bg=%23ffffff&amp;bg_left=%23FFFFFF&amp;bg_mid=%2324A7B2&amp;bg_right=%232a1844&amp;podcast_title_color=%23c4c4c4&amp;episode_title_color=%23ffffff&amp;auto=0&amp;share=1&amp;fonts=Verdana&amp;download=0&amp;rtl=0&amp;show_playlist_recent_number=10"
          title="Umunara Inc. Podcast"
        />
      </section>
    </div>
  );
}

export default Home;
