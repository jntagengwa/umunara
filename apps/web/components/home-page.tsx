import Image from 'next/image'
import Link from 'next/link'
import { defaultHomeHero, type HomeHero } from '@umunara/schemas'

import conference from '../../../src/about.jpeg'
import prayerGathering from '../../../src/images/image_2.jpg'
import flyerImage from '../../../src/images/PHOTO.jpg'

const prayerLine = '1-218-548-0820'
const passCode = '13579#'

export function PublicHomePage({ hero = defaultHomeHero }: { hero?: HomeHero }) {
  return (
    <main id="main-content">
      <section className="home-hero content-shell" aria-labelledby="home-heading">
        <div className="home-hero-copy">
          <p className="section-label">Umunara Inc. · International prayer ministry</p>
          <h1 id="home-heading">{hero.heading}</h1>
          <p className="hero-introduction">{hero.introduction}</p>
          <div className="action-row">
            <a className="button button-primary" href="#prayer-watch">
              Join the prayer watch
            </a>
            <Link className="button button-secondary" href="/about-us">
              Discover our story
            </Link>
          </div>
        </div>
        <div className="home-hero-image">
          <Image
            src={prayerGathering}
            alt="Members of the Umunara community praying together"
            priority
            sizes="(max-width: 800px) 100vw, 45vw"
            width={1600}
            height={1064}
          />
          <p className="image-caption">Ku Munara duhura na Yesu</p>
        </div>
      </section>

      <section className="mission-section content-shell" aria-labelledby="mission-heading">
        <div>
          <p className="section-label">Our welcome</p>
          <h2 id="mission-heading">Our Mission</h2>
          <div className="reading-copy">
            <p>
              We are in the business of making disciples of Jesus Christ in all nations and to
              encourage them to obey His commandments. This is our Mission: to fulfill the Great
              Commission found in <strong>Matthew 28:16-30</strong>. We believe that the Bible, as
              it is inspired by God, is the only instrument that helps us to know the will of God
              and to know where to get our salvation: on the Cross Jesus Christ paid the price on
              our behalf, imparted on us His righteousness and our responsibility is to impart on
              him our sins and to receive Him as our personal Savior.
            </p>
            <p>
              Ku Munara duhura na Yesu: Abarushye n’abaremerewe bararuhuka, abarwayi barakira,
              Impumyi zirahumuka, ibipfamatwi birumva, ibimuga biragenda, kandi abakene
              baragezwaho ubutumwa bwiza (Yohana 11:5).
            </p>
            <p>
              At Umunara, we welcome everybody regardless of their denomination; indeed whether
              you are a Christian or not please join us every Friday at 10:00 PM Eastern Time (USA
              &amp; Canada) that is, 0300GMT at <strong>{prayerLine}</strong>, Pass Code{' '}
              <strong>{passCode}</strong> so that we can be together at the watch and station
              ourselves on the ramparts (Habakkuk 2:1). This is not a toll free number! A calling
              card or a long distance plan required! For more scheduled events, please check on
              our <Link href="/events">calendar</Link> or just open this website and follow us on
              our{' '}
              <a href="https://umunarainc.podbean.com/" target="_blank" rel="noreferrer">
                Podcast
              </a>
              .
            </p>
          </div>
          <Link className="text-link" href="/about-us">
            Learn about Umunara <span aria-hidden="true">→</span>
          </Link>
        </div>
        <aside className="mission-note" aria-label="Umunara mission reference">
          <p className="section-label">Matthew 28:16-30</p>
          <p>This is our Mission: to fulfill the Great Commission found in Matthew 28:16-30.</p>
        </aside>
      </section>

      <section className="home-about content-shell" aria-labelledby="home-about-heading">
        <Image
          src={conference}
          alt="Umunara conference gathering"
          sizes="(max-width: 800px) 100vw, 40vw"
          width={1024}
          height={768}
        />
        <div>
          <p className="section-label">About Umunara</p>
          <h2 id="home-about-heading">About Us</h2>
          <div className="reading-copy">
            <p>
              As Prophet Habakkuk asserted in his second chapter verse 1 saying, “I will stand at
              my watch and station myself on the ramparts; I will look to see what he will say to
              me and what answer I am to give to this complaint,” we have resolved to stand on our
              watch and to station ourselves on UMUNARA waiting to hear and to know the will of
              God. Hence, Umunara is a gathering of peoples from all nations who meet primarily on
              the phone conference call to wait for the Lord God. In the course of waiting, we
              worship, praise, and pray God and study the word of God.
            </p>
          </div>
          <Link className="text-link" href="/about-us">
            Read our history <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section
        className="prayer-watch content-shell"
        id="prayer-watch"
        aria-labelledby="watch-heading"
      >
        <div>
          <p className="section-label">Live prayer community</p>
          <h2 id="watch-heading">Meet us at the watch.</h2>
          <p>Friday at 10:00 PM Eastern Time (USA &amp; Canada), 0300GMT.</p>
          <dl className="prayer-details">
            <div>
              <dt>Dial-in number</dt>
              <dd>
                <a href="tel:+12185480820">{prayerLine}</a>
              </dd>
            </div>
            <div>
              <dt>Pass code</dt>
              <dd>{passCode}</dd>
            </div>
          </dl>
        </div>
        <div className="prayer-watch-image" aria-hidden="true" />
      </section>

      <section className="conference-section content-shell" aria-labelledby="conference-heading">
        <Image
          src={flyerImage}
          alt="Umunara annual conference announcement"
          sizes="(max-width: 800px) 100vw, 36vw"
          width={839}
          height={1080}
        />
        <div>
          <p className="section-label">Gather with us</p>
          <h2 id="conference-heading">ANNUAL UMUNARA CONFERENCE</h2>
          <Link className="text-link" href="/events">
            Prayer meeting details <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="podcast-section content-shell" aria-labelledby="podcast-heading">
        <div>
          <p className="section-label">Listen anywhere</p>
          <h2 id="podcast-heading">Visit our Podcast for more of the Word!!!!!!</h2>
          <a
            className="button button-primary"
            href="https://umunarainc.podbean.com/"
            target="_blank"
            rel="noreferrer"
          >
            Visit the podcast
          </a>
        </div>
        <iframe
          className="podcast-embed"
          src="https://www.podbean.com/media/player/multi?playlist=http%3A%2F%2Fplaylist.podbean.com%2F10311907%2Fplaylist_multi.xml&amp;vjs=1&amp;size=550&amp;skin=12&amp;episode_list_bg=%23ffffff&amp;bg_left=%23FFFFFF&amp;bg_mid=%2324A7B2&amp;bg_right=%232a1844&amp;podcast_title_color=%23c4c4c4&amp;episode_title_color=%23ffffff&amp;auto=0&amp;share=1&amp;fonts=Verdana&amp;download=0&amp;rtl=0&amp;show_playlist_recent_number=10"
          title="Umunara Inc. Podcast"
          loading="lazy"
        />
      </section>
    </main>
  )
}
