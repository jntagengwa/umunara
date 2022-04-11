import React, { Component } from "react";
import SlideShow from "./slideShow";
import xmas from "../images/PHOTO.jpg";
import "./home.scss";

class Home extends Component {
  render() {
    return (
      <div className="home">
        <SlideShow />
        <div className="title">
          <h1 className="heading">Welcome To Umunara, Inc</h1>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div className="sub">
            <div className="text">
              <h3>
                We are glad you took some time out of your busy schedule to
                check on us.
              </h3>
              <p className="home-p">
                We are in the business of making disciples of Jesus Christ in
                all nations and to encourage them to obey His commandments. This
                is our Mission: to fulfill the Great Commission found in{" "}
                <strong>Matthew 28:16-30</strong>. We believe that the Bible, as
                it is inspired by God, is the only instrument that helps us to
                know the will of God and to know where to get our salvation: on
                the Cross Jesus Christ paid the price on our behalf, imparted on
                us His righteousness and our responsibility is to impart on him
                our sins and to receive Him as our personal Savior. Ku Munara
                duhura na Yesu: Abarushye n’abaremerewe bararuhuka, abarwayi
                barakira, Impumyi zirahumuka, ibipfamatwi birumva, ibimuga
                biragenda, kandi abakene baragezwaho ubutumwa bwiza (Yohana
                11:5). At Umunara, we welcome everybody regardless of their
                denomination; indeed whether you are a Christian or not please
                join us every Friday at 10:00 PM Eastern Time (USA & Canada)
                that is, 0300GMT at <strong>1-218-548-0820</strong>, Pass Code{" "}
                <strong>13579#</strong> so that we can be together at the watch
                and station ourselves on the ramparts (Habakkuk 2:1). This is
                not a toll free number! A calling card or a long distance plan
                required! For more scheduled events, please check on our
                calendar or just open this website and follow us on our{" "}
                <a
                  href="https://umunarainc.podbean.com/"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Podcast
                </a>
                .
              </p>
            </div>
            <div className="column">
              <h3>IGITARAMO CYA PASIKA</h3>
              <img className="xmass" src={xmas} alt="Christmas" />
            </div>
          </div>
        </div>
        <div className="frame">
          <iframe
            src="https://www.podbean.com/media/player/multi?playlist=http%3A%2F%2Fplaylist.podbean.com%2F10311907%2Fplaylist_multi.xml&amp;vjs=1&amp;size=550&amp;skin=12&amp;episode_list_bg=%23ffffff&amp;bg_left=%23FFFFFF&amp;bg_mid=%2324A7B2&amp;bg_right=%232a1844&amp;podcast_title_color=%23c4c4c4&amp;episode_title_color=%23ffffff&amp;auto=0&amp;share=1&amp;fonts=Verdana&amp;download=0&amp;rtl=0&amp;show_playlist_recent_number=10"
            title="Umunara Inc Podcast"
            width="700"
            height="550"
            scrolling="no"
            className="podcast"
          />
          <h3>
            Visit our{" "}
            <a
              href="https://umunarainc.podbean.com/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Podcast
            </a>{" "}
            for more of the Word!!!!!!
          </h3>
        </div>
      </div>
    );
  }
}

export default Home;
