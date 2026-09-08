import Image from 'next/image'
import conference from '../../../../../src/about.jpeg'

export default function AboutPage() {
  return (
    <main className="page-content" id="main-content">
      <h1>About Us</h1>
      <div className="welcome-content">
        <div>
          <p>
            As Prophet Habakkuk asserted in his second chapter verse 1 saying, “I will stand at my
            watch and station myself on the ramparts; I will look to see what he will say to me and
            what answer I am to give to this complaint,” we have resolved to stand on our watch and
            to station ourselves on UMUNARA waiting to hear and to know the will of God. Hence,
            Umunara is a gathering of peoples from all nations who meet primarily on the phone
            conference call to wait for the Lord God. In the course of waiting, we worship, praise,
            and pray God and study the word of God.
          </p>
          <p>
            Umunara started early 2007 by few individuals who were holding prayer meetings over the
            phone through three-way conference call. These few individuals came to be known as
            founder-members of Umunara. As the number of those who were interested in joining
            prayers coming from all continents grew, on September 23, 2007 God led the group to
            register and to set up an account with FreeConferencePro. Access number of this account
            is <strong>1-218-548-0820</strong> and the pass code is <strong>13579#</strong>.
            Currently, Umunara is managed by a committee led by The Rev. Dr. Jean Baptiste
            Ntagengwa. If you want to contact them, please drop a line at{' '}
            <a href="mailto:postmaster@umunara.org">postmaster@umunara.org</a>. God’s blessings to
            you!
          </p>
        </div>
        <Image
          className="about-image"
          src={conference}
          alt="Umunara Conference"
          width={600}
          height={800}
        />
      </div>
    </main>
  )
}
