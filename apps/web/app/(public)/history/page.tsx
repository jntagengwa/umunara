import Image from 'next/image'

import logo from '../../../../../src/umunara_logo.png'
import styles from './history-page.module.css'

const milestones = [
  ['2007', 'Prayer meetings begin'],
  ['2007-09-23', 'Conference account established'],
  ['2008-10-02', 'Umunara incorporated'],
] as const

export default function HistoryPage() {
  return (
    <main id="main-content">
      <header className={styles.hero}>
        <div className="content-shell">
          <p className={styles.eyebrow}>Our story</p>
          <h1>History</h1>
        </div>
      </header>

      <div className={`content-shell ${styles.content}`}>
        <section className={styles.milestones} aria-labelledby="history-milestones-title">
          <h2 id="history-milestones-title">Founding milestones</h2>
          <ol>
            {milestones.map(([dateTime, label]) => (
              <li key={dateTime}>
                <time dateTime={dateTime}>{dateTime.slice(0, 4)}</time>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </section>

        <article className={styles.article} aria-label="The history of Umunara">
          <p>
            In early 2007 a few individuals started holding prayer meetings over the phone through
            three-way conference call. As the number of those who were interested in joining prayers
            coming from all continents grew, on September 23, 2007 God led the group to register and
            to set up an account with FreeConferencePro. At Umunara, we welcome everybody regardless
            of their denomination; indeed whether you are a Christian or not please join us every
            Friday at 10:00 PM Eastern Time (USA &amp; Canada) that is, 0300GMT at 218-548-0820 and the
            pass code is 13579#.
          </p>
          <p>
            As time went by, attendees to these conference services came to call this Ministry
            “UMUNARA” or literally “Watchtower,” a name that got incorporated with the State of
            Massachusetts on October 02, 2008. Hence, as Prophet Habakkuk asserted in his second
            chapter verse 1 saying, “I will stand at my watch and station myself on the ramparts; I
            will look to see what he will say to me and what answer I am to give to this complaint,”
            we have resolved to stand on our watch and to station ourselves on UMUNARA waiting to
            hear and to know the will of God. In other words, Umunara is a gathering of peoples from
            all nations who meet primarily on the phone conference call to wait for the Lord God. In
            the course of waiting, we worship, praise, and pray God and study the word of God.
          </p>
          <p>
            At Umunara, Inc we believe that the Bible, as it is inspired by God, is the only
            instrument that helps us to know the will of God and to know where to get our salvation:
            on the Cross Jesus Christ paid the price on our behalf, imparted on us His righteousness
            and our responsibility is to impart on him our sins and to receive Him as our personal
            Savior. Ku Munara duhura na Yesu: Abarushye n’abaremerewe bararuhuka, abarwayi barakira,
            Impumyi zirahumuka, ibipfamatwi birumva, ibimuga biragenda, kandi abakene baragezwaho
            ubutumwa bwiza (Yohana 11:5).
          </p>
          <p>
            A little over two years in existence, God, the Founder of Umunara, has enabled us to
            reach His people from all continents using His servants stationed in various parts of
            the world. In addition to conference calls held regularly, Umunara’s website enabled
            people who were unable to participate live to the conference to listen to the message
            preached every Friday. Furthermore, Umunara has been able to start a number of
            departments that help to answer some of the questions believers have. In the interest of
            strengthening families, youth, female and male departments were established. Once in a
            while, female and male departments meet together to offer valuable teachings needed for
            couples and couples to be.
          </p>
          <p>
            As prayer is the key to the success of Umunara, a Prayer department was established to
            coordinate the prayer chain 24/7 at Umunara; this helps us to have someone at the rampant
            all the time (ku izamu ry’Umunara). Mrs. Marie-Therese Gakumba and Ms. Aline Niyonsaba
            lead this department. Fasting prayers are being organized throughout the month and some
            over night prayers have been and continue to be held thanks to your commitment. If you
            want to get involved into this department please be in touch with its leaders mentioned
            above. As at Umunara we are committed to the thorough learning and/or teaching of the
            Word of God, various seminars and Bible studies have been organized over the conference
            calls and experts have given topical teachings. We thank all who have participated into
            these programs and more participation in the future is requested!
          </p>
          <p>
            At this particular juncture, it is safe to say that we are looking into the future with
            great hope and anticipation. In the past, Freeconferencepro has experienced a massive
            increase in usage of their conference systems that caused our experiencing connectivity
            problems during our services. Fortunately, they upgraded their systems and have allocated
            us a new conference access number which is <strong>218-548-0820</strong>; the pass cod
            remained the same. This upgrade corrected our capability issues, and enabled the
            possibility to connect into our services through one’s internet service.
            FreeConferencePro also created the video conferencing possibilities which we might start
            use in the future. God is good; we have decided to upgrade and give a new look to our
            website thanks the Mr. Jean-Fidele Ntagengwa. In the process Jean-Fidele helped to cut
            some of our costs by getting rid of the radio which had lots of limitations and started a
            new program: podcast. You can follow us live on Fridays and you listen to our past
            message of your choosing anytime you want. If and when the Holy Spirit moves you to
            support them please make your check or money order to Umunara, Inc and send it at P.O Box
            505194, Chelsea, MA 02150, USA and thank you.
          </p>
          <p>
            Looking at our purpose as stated above, and looking at our vision as stated further
            below, we have a long way to go to accomplish the task that God entrusted to us.
            Therefore, Umunara, Inc. is requesting those who want to partner with us as either Active
            Members or Honorary Members or as partners in fulfilling the Great Commission to fill out
            the form found on this website...
          </p>
          <p>
            Thank you so much for your support and may God Almighty bless you in a special way. If
            you want to contact either of the Committee members, please drop a line at
            postmaster@umunara.org or send us a written note at Umunara, Inc. P.O Box 505194,
            Chelsea, MA 02150.
          </p>
        </article>

        <section className={styles.supporting} aria-label="Join the Umunara prayer watch">
          <div className={styles.prayerWatch}>
            <p className={styles.eyebrow}>Join the watch</p>
            <h2>Friday prayer watch</h2>
            <dl>
              <div>
                <dt>Time</dt>
                <dd>10:00 PM Eastern Time (USA &amp; Canada) / 0300GMT</dd>
              </div>
              <div>
                <dt>Conference</dt>
                <dd>218-548-0820</dd>
              </div>
              <div>
                <dt>Pass code</dt>
                <dd>13579#</dd>
              </div>
            </dl>
          </div>
          <figure className={styles.mark}>
            <Image src={logo} alt="Umunara ministry mark" width={400} height={100} />
          </figure>
        </section>
      </div>
    </main>
  )
}
