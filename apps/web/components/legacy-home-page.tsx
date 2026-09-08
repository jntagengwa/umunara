import Image, { type StaticImageData } from 'next/image'
import { defaultHomeHero, type HomeHero } from '@umunara/schemas'

import flyerImage from '../../../src/images/PHOTO.jpg'
import slideOne from '../../../src/images/image_1.jpg'
import slideTwo from '../../../src/images/image_2.jpg'
import slideThree from '../../../src/images/image_3.jpg'
import slideFour from '../../../src/images/image_4.jpg'
import slideFive from '../../../src/images/image_5.jpg'

const slides: Array<{ image: StaticImageData; alt: string }> = [
  { image: slideOne, alt: 'Umunara community gathering' },
  { image: slideTwo, alt: 'Umunara worship service' },
  { image: slideThree, alt: 'Umunara community members' },
  { image: slideFour, alt: 'Umunara ministry event' },
  { image: slideFive, alt: 'Umunara community celebration' },
]

export function LegacyHomePage({ hero = defaultHomeHero }: { hero?: HomeHero }) {
  return (
    <>
      <main id="main-content" aria-label="Umunara home">
        <section className="hero" aria-label="Umunara ministry highlights">
          <Image
            className="hero-image"
            src={slides[0].image}
            alt={slides[0].alt}
            width={1600}
            height={900}
            priority
          />
          <div className="hero-thumbnails" aria-label="More Umunara ministry highlights">
            {slides.slice(1).map((slide) => (
              <Image key={slide.alt} src={slide.image} alt={slide.alt} width={400} height={225} />
            ))}
          </div>
        </section>

        <section className="welcome" aria-labelledby="welcome-heading">
          <h1 id="welcome-heading">{hero.heading}</h1>
          <div className="welcome-content">
            <div>
              <h2>{hero.introduction}</h2>
              <p>
                We are in the business of making disciples of Jesus Christ in all nations and
                encouraging them to obey His commandments. Our mission is to fulfil the Great
                Commission found in <strong>Matthew 28:16-30</strong>.
              </p>
              <p>
                We believe that the Bible, inspired by God, helps us know the will of God and where
                to find salvation. On the Cross, Jesus Christ paid the price on our behalf and
                imparted His righteousness to us.
              </p>
              <p>
                Ku Munara duhura na Yesu: Abarushye n’abaremerewe bararuhuka, abarwayi barakira,
                impumyi zirahumuka, ibipfamatwi birumva, ibimuga biragenda, kandi abakene
                baragezwaho ubutumwa bwiza (Yohana 11:5).
              </p>
              <p>
                At Umunara, everybody is welcome regardless of denomination. Please join us every
                Friday at 10:00 PM Eastern Time (USA &amp; Canada), 0300 GMT, on{' '}
                <strong>1-218-548-0820</strong>, pass code <strong>13579#</strong>. For scheduled
                events, see our calendar or follow our{' '}
                <a href="https://umunarainc.podbean.com/" target="_blank" rel="noreferrer">
                  podcast
                </a>
                .
              </p>
            </div>
            <aside className="event-flyer" aria-labelledby="pasika-heading">
              <h2 id="pasika-heading">IGITARAMO CYA PASIKA</h2>
              <Image
                src={flyerImage}
                alt="Igitara mo cya Pasika event flyer"
                width={600}
                height={800}
              />
            </aside>
          </div>
        </section>

        <section className="podcast" aria-labelledby="podcast-heading">
          <h2 id="podcast-heading">Umunara Inc Podcast</h2>
          <iframe
            src="https://www.podbean.com/media/player/multi?playlist=http%3A%2F%2Fplaylist.podbean.com%2F10311907%2Fplaylist_multi.xml&amp;vjs=1&amp;size=550&amp;skin=12&amp;episode_list_bg=%23ffffff&amp;bg_left=%23FFFFFF&amp;bg_mid=%2324A7B2&amp;bg_right=%232a1844&amp;podcast_title_color=%23c4c4c4&amp;episode_title_color=%23ffffff&amp;auto=0&amp;share=1&amp;fonts=Verdana&amp;download=0&amp;rtl=0&amp;show_playlist_recent_number=10"
            title="Umunara Inc Podcast"
            loading="lazy"
          />
          <p>
            Visit our{' '}
            <a href="https://umunarainc.podbean.com/" target="_blank" rel="noreferrer">
              podcast
            </a>{' '}
            for more of the Word.
          </p>
        </section>
      </main>
    </>
  )
}
